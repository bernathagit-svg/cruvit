/**
 * Garden Design server persistence V1 — host-authoritative.
 *
 * Iframe must not import this module. Host validates session + garden,
 * writes garden_designs / garden_design_placements / garden_media, and
 * returns signed media URLs. Never trusts iframe user_id.
 *
 * Does not apply migrations. Does not generate assets. Paid AI = 0.
 */

import {
  createGardenMediaForPlant,
  getGardenMediaSignedUrl
} from '../personal-domain/garden-media-v1-runtime.js';
import {
  DESIGN_PLANT_KIND,
  EMPTY_SERVER_DESIGN,
  IDENTITY_INCONSISTENT,
  LOCAL_DESIGN_RESTORE_AVAILABLE,
  MULTIPLE_DESIGNS_REQUIRE_SELECTION,
  classifyLegacyLocalSnapshotImport,
  createDesignClientInstanceId,
  designPaidAiForAction,
  mapServerPlacementToLayer
} from './garden-design-owned-garden-v1.js';

export const GARDEN_DESIGN_SERVER_PERSISTENCE_VERSION = '1.0.0';
export {
  EMPTY_SERVER_DESIGN,
  MULTIPLE_DESIGNS_REQUIRE_SELECTION,
  LOCAL_DESIGN_RESTORE_AVAILABLE,
  IDENTITY_INCONSISTENT
};

const DESIGN_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,garden_area_id,status,title,revision,source_media_id,derived_base_media_id,created_at,updated_at';
const PLACEMENT_SELECT =
  'id,garden_design_id,user_id,client_instance_id,kind,garden_plant_id,canonical_slug,garden_area_id,design_asset_id,growth_stage,target_growth_stage,season,phenology,x,y,scale,rotation,z_order,label,scientific,created_at,updated_at';
const MEDIA_SELECT = 'id,garden_profile_id,storage_path,storage_bucket,purpose,source_module,mime_type,validation_state,metadata';
const DEFAULT_DESIGN_TITLE = 'Garden Design';

/** V3.1 authenticated UPDATE columns on garden_designs. Not revision/user_id/garden_profile_id/client_instance_id. */
const DESIGN_UPDATE_COLUMNS = Object.freeze([
  'garden_area_id',
  'title',
  'status',
  'source_media_id',
  'derived_base_media_id',
  'viewport',
  'metadata',
  'updated_at'
]);
const DESIGN_PROTECTED_UPDATE_COLUMNS = Object.freeze([
  'revision',
  'client_instance_id',
  'user_id',
  'garden_profile_id'
]);
/** Placement identity stays INSERT-only. Mutable geometry/content may UPDATE. */
const PLACEMENT_PROTECTED_UPDATE_COLUMNS = Object.freeze([
  'user_id',
  'garden_design_id',
  'client_instance_id',
  'id',
  'created_at'
]);
export const GRANT_MODEL_V31 = 'v3.1';
export { DESIGN_PROTECTED_UPDATE_COLUMNS, DESIGN_UPDATE_COLUMNS };

function asText(v) {
  return v == null ? '' : String(v).trim();
}

function asNull(v) {
  const t = asText(v);
  return t ? t : null;
}

function clamp01(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(0.96, Math.max(0.04, x));
}

function clampScale(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(8, x);
}

function newRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

function contextKey(gardenProfileId, gardenAreaId) {
  return asText(gardenProfileId) + '|' + (asNull(gardenAreaId) || 'garden');
}

function looksLikeDataUrl(value) {
  const t = asText(value);
  return t.startsWith('data:') || t.length > 4000;
}

function cloneRow(row) {
  return row && typeof row === 'object' ? Object.assign({}, row) : row;
}

function matchFilters(row, filters) {
  return filters.every((f) => {
    const val = row[f.col];
    if (f.type === 'eq') {
      if (val == null && (f.val == null || f.val === '')) return true;
      return String(val) === String(f.val);
    }
    if (f.type === 'is') {
      if (f.val === null) return val == null;
      return val === f.val;
    }
    if (f.type === 'in') return (f.vals || []).some((v) => String(v) === String(val));
    return true;
  });
}

function conflictCols(onConflict) {
  return String(onConflict || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUniqueViolation(error) {
  const code = asText(error && error.code);
  const msg = asText(error && error.message).toLowerCase();
  return code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

function sanitizePersistMessage(error) {
  const raw = asText(error && error.message) || asText(error);
  return raw
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 240);
}

function persistFailFields(error, stage, operation, extra = {}) {
  const supabaseCode = asText(error && error.code) || null;
  const message = sanitizePersistMessage(error) || 'write_failed';
  return Object.assign({
    ok: false,
    keepLocalCanvas: true,
    paidAiCalls: 0,
    stage,
    operation,
    supabaseCode,
    error: message
  }, extra);
}

function logPersistConsole(info) {
  try {
    console.warn('[garden-design-persist]', {
      stage: info && info.stage,
      operation: info && info.operation,
      code: info && info.code,
      supabaseCode: info && info.supabaseCode,
      message: sanitizePersistMessage(info && (info.error || info.message))
    });
  } catch (_) {}
}

function canUpdateColumnV31(table, col) {
  if (table === 'garden_designs') return DESIGN_UPDATE_COLUMNS.includes(col);
  if (table === 'garden_design_placements') return !PLACEMENT_PROTECTED_UPDATE_COLUMNS.includes(col);
  return true;
}

function privilegeDeniedForColumns(table, cols) {
  const denied = (cols || []).filter((c) => !canUpdateColumnV31(table, c));
  if (!denied.length) return null;
  return {
    code: '42501',
    message: 'permission denied for column ' + denied[0]
  };
}

function placementMutablePatch(row) {
  return {
    kind: row.kind,
    garden_plant_id: row.garden_plant_id,
    canonical_slug: row.canonical_slug,
    garden_area_id: row.garden_area_id,
    design_asset_id: row.design_asset_id,
    growth_stage: row.growth_stage,
    target_growth_stage: row.target_growth_stage,
    season: row.season,
    phenology: row.phenology,
    x: row.x,
    y: row.y,
    scale: row.scale,
    rotation: row.rotation,
    z_order: row.z_order,
    label: row.label,
    scientific: row.scientific
  };
}

/**
 * In-memory Supabase stand-in for tests. Not used by the iframe.
 */
export function createGardenDesignMemorySupabase(seed = {}) {
  const db = {
    garden_designs: Array.isArray(seed.garden_designs) ? seed.garden_designs.map(cloneRow) : [],
    garden_design_placements: Array.isArray(seed.garden_design_placements)
      ? seed.garden_design_placements.map(cloneRow)
      : [],
    garden_plants: Array.isArray(seed.garden_plants) ? seed.garden_plants.map(cloneRow) : [],
    garden_media: Array.isArray(seed.garden_media) ? seed.garden_media.map(cloneRow) : [],
    storageObjects: Array.isArray(seed.storageObjects) ? seed.storageObjects.slice() : []
  };
  const writes = [];
  const fail = seed.fail || {};
  const grantModel = seed.grantModel || GRANT_MODEL_V31;

  function bumpRevision(designId) {
    const design = db.garden_designs.find((r) => r.id === designId);
    if (!design) return null;
    design.revision = (Number(design.revision) || 1) + 1;
    design.updated_at = new Date().toISOString();
    return design.revision;
  }

  function applyOwnedPlacementTruth(row) {
    if (asText(row.kind) !== DESIGN_PLANT_KIND.OWNED) return { ok: true, row };
    const plant = db.garden_plants.find((p) => p.id === row.garden_plant_id);
    if (!plant) {
      return { ok: false, error: { message: 'owned_plant_missing', code: IDENTITY_INCONSISTENT } };
    }
    if (plant.garden_profile_id && row.garden_profile_id && plant.garden_profile_id !== row.garden_profile_id) {
      return { ok: false, error: { message: 'owned_plant_garden_mismatch', code: IDENTITY_INCONSISTENT } };
    }
    row.canonical_slug = plant.profile_slug || plant.canonical_slug || row.canonical_slug;
    row.garden_area_id = plant.garden_area_id == null ? null : plant.garden_area_id;
    return { ok: true, row };
  }

  function from(table) {
    let op = 'select';
    let payload = null;
    let filters = [];
    let onConflict = null;
    let wantSingle = false;

    const consumeFail = (tableName, opName) => {
      const token = `${tableName}.${opName}`;
      if (fail[tableName] === opName) return true;
      if (fail.next === token) {
        delete fail.next;
        return true;
      }
      if (fail.once === token) {
        delete fail.once;
        return true;
      }
      return false;
    };

    const execute = async () => {
      if (consumeFail(table, op)) {
        writes.push({ table, op, error: true, failed: true });
        return { data: null, error: { message: 'network_failure', code: 'NETWORK' } };
      }
      const rows = db[table] || [];
      if (op === 'select') {
        const found = rows.filter((r) => matchFilters(r, filters)).map(cloneRow);
        writes.push({ table, op: 'select', count: found.length });
        if (wantSingle) {
          return { data: found[0] || null, error: found.length ? null : (wantSingle === 'one' ? { message: 'not_found' } : null) };
        }
        return { data: found, error: null };
      }
      if (op === 'insert') {
        const incoming = Array.isArray(payload) ? payload : [payload];
        const inserted = [];
        for (const raw of incoming) {
          const row = Object.assign({ id: raw.id || newRowId() }, raw);
          if (table === 'garden_designs') {
            const dup = rows.find(
              (r) => r.garden_profile_id === row.garden_profile_id && r.client_instance_id === row.client_instance_id
            );
            if (dup) return { data: null, error: { message: 'duplicate_design', code: '23505' } };
            row.revision = Number(row.revision) || 1;
            row.status = row.status || 'active';
          }
          if (table === 'garden_design_placements') {
            const truth = applyOwnedPlacementTruth(row);
            if (!truth.ok) return { data: null, error: truth.error };
            const dup = rows.find(
              (r) => r.garden_design_id === row.garden_design_id && r.client_instance_id === row.client_instance_id
            );
            if (dup) return { data: null, error: { message: 'duplicate_placement', code: '23505' } };
          }
          if (table === 'garden_media' && looksLikeDataUrl(row.metadata && row.metadata.dataUrl)) {
            return { data: null, error: { message: 'data_url_forbidden_in_postgres' } };
          }
          rows.push(row);
          inserted.push(cloneRow(row));
        }
        writes.push({ table, op: 'insert', count: inserted.length, row: inserted[0] });
        if (table === 'garden_design_placements' && inserted[0]) bumpRevision(inserted[0].garden_design_id);
        if (wantSingle) return { data: inserted[0] || null, error: null };
        return { data: inserted, error: null };
      }
      if (op === 'update') {
        const matched = rows.filter((r) => matchFilters(r, filters));
        const patch = Object.assign({}, payload);
        if (grantModel === GRANT_MODEL_V31) {
          const denied = privilegeDeniedForColumns(table, Object.keys(patch));
          if (denied) {
            writes.push({ table, op: 'update', error: true, code: denied.code });
            return { data: null, error: denied };
          }
        } else {
          delete patch.revision;
          delete patch.user_id;
          delete patch.garden_profile_id;
          delete patch.client_instance_id;
        }
        if (table === 'garden_designs' && patch.source_media_id != null) {
          for (const row of matched) {
            if (row.source_media_id && row.source_media_id !== patch.source_media_id) {
              return { data: null, error: { message: 'garden_design_source_media_immutable' } };
            }
          }
        }
        matched.forEach((row) => Object.assign(row, patch, { updated_at: new Date().toISOString() }));
        writes.push({ table, op: 'update', count: matched.length, patch });
        if (table === 'garden_design_placements') {
          matched.forEach((row) => bumpRevision(row.garden_design_id));
        }
        const out = matched.map(cloneRow);
        if (wantSingle) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (op === 'upsert') {
        const incoming = Array.isArray(payload) ? payload : [payload];
        const cols = conflictCols(onConflict);
        const out = [];
        for (const raw of incoming) {
          let row = Object.assign({}, raw);
          if (grantModel === GRANT_MODEL_V31) {
            const denied = privilegeDeniedForColumns(table, Object.keys(row));
            if (denied) {
              writes.push({ table, op: 'upsert', error: true, code: denied.code, privilege: 'on-conflict-do-update' });
              return { data: null, error: denied };
            }
          }
          if (table === 'garden_design_placements') {
            const truth = applyOwnedPlacementTruth(row);
            if (!truth.ok) return { data: null, error: truth.error };
            row = truth.row;
          }
          const existing = rows.find((r) => cols.every((c) => String(r[c]) === String(row[c])));
          if (existing) {
            const patch = Object.assign({}, row);
            delete patch.id;
            delete patch.client_instance_id;
            delete patch.garden_design_id;
            delete patch.user_id;
            delete patch.revision;
            Object.assign(existing, patch, { updated_at: new Date().toISOString() });
            out.push(cloneRow(existing));
            writes.push({ table, op: 'upsert-update', id: existing.id });
            if (table === 'garden_design_placements') bumpRevision(existing.garden_design_id);
          } else {
            if (!row.id) row.id = newRowId();
            if (table === 'garden_designs') {
              row.revision = Number(row.revision) || 1;
              row.status = row.status || 'active';
            }
            rows.push(row);
            out.push(cloneRow(row));
            writes.push({ table, op: 'upsert-insert', id: row.id });
            if (table === 'garden_design_placements') bumpRevision(row.garden_design_id);
          }
        }
        if (wantSingle) return { data: out[0] || null, error: null };
        return { data: out, error: null };
      }
      if (op === 'delete') {
        const keep = [];
        const removed = [];
        for (const row of rows) {
          if (matchFilters(row, filters)) removed.push(cloneRow(row));
          else keep.push(row);
        }
        db[table] = keep;
        writes.push({ table, op: 'delete', count: removed.length, removed: removed[0] || null });
        if (table === 'garden_design_placements' && removed[0]) bumpRevision(removed[0].garden_design_id);
        return { data: removed, error: null };
      }
      return { data: null, error: { message: 'unknown_op' } };
    };

    const thenable = {
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
      maybeSingle() {
        wantSingle = 'maybe';
        return thenable;
      },
      single() {
        wantSingle = 'one';
        return thenable;
      },
      select() {
        return thenable;
      }
    };

    const chain = {
      select() {
        if (op === 'insert' || op === 'update' || op === 'upsert' || op === 'delete') return thenable;
        op = 'select';
        return chain;
      },
      insert(row) {
        op = 'insert';
        payload = row;
        return chain;
      },
      update(row) {
        op = 'update';
        payload = row;
        return chain;
      },
      upsert(row, opts) {
        op = 'upsert';
        payload = row;
        onConflict = opts && opts.onConflict;
        return chain;
      },
      delete() {
        op = 'delete';
        return chain;
      },
      eq(col, val) {
        filters.push({ type: 'eq', col, val });
        return chain;
      },
      is(col, val) {
        filters.push({ type: 'is', col, val });
        return chain;
      },
      in(col, vals) {
        filters.push({ type: 'in', col, vals });
        return chain;
      },
      maybeSingle() {
        wantSingle = 'maybe';
        return thenable;
      },
      single() {
        wantSingle = 'one';
        return thenable;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      }
    };
    return chain;
  }

  return {
    db,
    writes,
    fail,
    grantModel,
    from,
    storage: {
      from(bucket) {
        return {
          async upload(path, file, opts) {
            writes.push({
              table: 'storage',
              op: 'upload',
              bucket,
              path,
              contentType: opts && opts.contentType,
              isDataUrl: typeof file === 'string' && String(file).startsWith('data:')
            });
            if (fail.storage === 'upload') {
              return { data: null, error: { message: 'storage_upload_failed' } };
            }
            if (typeof file === 'string' && String(file).startsWith('data:')) {
              return { data: null, error: { message: 'data_url_forbidden_in_storage_row' } };
            }
            db.storageObjects.push({ bucket, path });
            return { data: { path }, error: null };
          },
          async createSignedUrl(path) {
            writes.push({ table: 'storage', op: 'createSignedUrl', path });
            return { data: { signedUrl: 'https://signed.example/user-garden-media/' + path }, error: null };
          }
        };
      }
    }
  };
}

function mapPlacementRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    serverId: row.id,
    clientInstanceId: row.client_instance_id,
    kind: row.kind,
    gardenPlantId: row.garden_plant_id || null,
    canonicalSlug: row.canonical_slug || null,
    gardenAreaId: row.garden_area_id || null,
    designAssetId: row.design_asset_id || null,
    growthStage: row.growth_stage || null,
    targetGrowthStage: row.target_growth_stage || null,
    season: row.season || null,
    phenology: row.phenology || null,
    x: Number(row.x),
    y: Number(row.y),
    scale: Number(row.scale),
    rotation: Number(row.rotation) || 0,
    zOrder: Number(row.z_order) || 0,
    label: row.label || null,
    scientific: row.scientific || null
  };
}

function mapOwnedPlant(row) {
  if (!row) return null;
  return {
    gardenPlantId: asText(row.id || row.gardenPlantId),
    canonicalSlug: asText(row.profile_slug || row.canonicalSlug || row.profileSlug),
    gardenAreaId: asNull(row.garden_area_id || row.areaId || row.gardenAreaId),
    gardenProfileId: asText(row.garden_profile_id || row.gardenProfileId),
    name: asText(row.name),
    scientific: asText(row.scientific)
  };
}

export function iframeMustNotCreateSupabaseClient(source) {
  const src = String(source || '');
  return !/createClient\s*\(/.test(src) && !/supabase\.from\s*\(/.test(src);
}

export function createGardenDesignHostPersistence(deps = {}) {
  const cache = new Map();
  const getSupabase = typeof deps.getSupabase === 'function' ? deps.getSupabase : () => deps.supabase || null;
  const getSessionUserId = typeof deps.getSessionUserId === 'function'
    ? deps.getSessionUserId
    : () => asText(deps.sessionUserId) || null;
  const getActiveGardenId = typeof deps.getActiveGardenId === 'function'
    ? deps.getActiveGardenId
    : () => asText(deps.activeGardenId) || null;
  const getOwnedPlants = typeof deps.getOwnedPlants === 'function'
    ? deps.getOwnedPlants
    : () => deps.ownedPlants || [];
  const listOwnedPlantRows = typeof deps.listOwnedPlantRows === 'function' ? deps.listOwnedPlantRows : null;
  const createMedia = deps.createSourceMedia || createGardenMediaForPlant;
  const signedUrlFn = deps.getSignedUrl || getGardenMediaSignedUrl;
  const nowIso = () => (typeof deps.now === 'function' ? deps.now() : new Date().toISOString());

  function authContext() {
    const sessionUserId = asText(getSessionUserId());
    const gardenProfileId = asText(getActiveGardenId());
    const supabase = getSupabase();
    return {
      sessionUserId,
      gardenProfileId,
      supabase,
      ok: !!(sessionUserId && gardenProfileId && supabase)
    };
  }

  function remember(gardenProfileId, gardenAreaId, design) {
    if (!design) return;
    cache.set(contextKey(gardenProfileId, gardenAreaId), {
      designId: design.id,
      clientInstanceId: design.client_instance_id || design.clientInstanceId,
      revision: design.revision,
      gardenAreaId: asNull(design.garden_area_id || gardenAreaId)
    });
  }

  function remembered(gardenProfileId, gardenAreaId) {
    return cache.get(contextKey(gardenProfileId, gardenAreaId)) || null;
  }

  function forget(gardenProfileId, gardenAreaId, designId) {
    const key = contextKey(gardenProfileId, gardenAreaId);
    const rec = cache.get(key);
    if (!rec) return;
    if (designId && rec.designId !== designId) return;
    cache.delete(key);
  }

  function designHasMeaningfulPayload(design) {
    if (!design) return false;
    if (asNull(design.source_media_id) || asNull(design.derived_base_media_id)) return true;
    const title = asText(design.title);
    if (title && title !== DEFAULT_DESIGN_TITLE) return true;
    if (design.viewport || design.viewport_json || design.metadata) return true;
    return false;
  }

  async function loadOwnedIndex(gardenProfileId) {
    let rows = getOwnedPlants() || [];
    if (listOwnedPlantRows) {
      try {
        const fetched = await listOwnedPlantRows();
        if (Array.isArray(fetched)) rows = fetched;
      } catch (_) {}
    }
    const mapped = rows.map(mapOwnedPlant).filter((p) => p && p.gardenPlantId);
    return mapped.filter((p) => !p.gardenProfileId || p.gardenProfileId === gardenProfileId);
  }

  async function signedMediaUrl(supabase, mediaId) {
    if (!mediaId) return { mediaId: null, signedUrl: null, storagePath: null };
    const { data, error } = await supabase
      .from('garden_media')
      .select(MEDIA_SELECT)
      .eq('id', mediaId)
      .maybeSingle();
    if (error || !data || !data.storage_path) return { mediaId, signedUrl: null, storagePath: null };
    try {
      const signed = await signedUrlFn({ supabase, storagePath: data.storage_path, mediaId: data.id });
      return {
        mediaId: data.id,
        signedUrl: signed && signed.signedUrl ? signed.signedUrl : null,
        storagePath: data.storage_path,
        purpose: data.purpose || null
      };
    } catch (_) {
      return { mediaId: data.id, signedUrl: null, storagePath: data.storage_path, purpose: data.purpose || null };
    }
  }

  async function listActiveDesigns(supabase, gardenProfileId, gardenAreaId) {
    let q = supabase
      .from('garden_designs')
      .select(DESIGN_SELECT)
      .eq('garden_profile_id', gardenProfileId)
      .eq('status', 'active');
    if (asNull(gardenAreaId)) q = q.eq('garden_area_id', gardenAreaId);
    else q = q.is('garden_area_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadPlacements(supabase, designId) {
    const { data, error } = await supabase
      .from('garden_design_placements')
      .select(PLACEMENT_SELECT)
      .eq('garden_design_id', designId);
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapPlacementRow);
  }

  async function buildLoadResult(supabase, design, ownedPlants, extra = {}) {
    const placements = await loadPlacements(supabase, design.id);
    const source = await signedMediaUrl(supabase, design.source_media_id);
    const derived = await signedMediaUrl(supabase, design.derived_base_media_id);
    const editorBase = derived.signedUrl ? derived : source;
    remember(design.garden_profile_id, design.garden_area_id, design);
    const identityErrors = [];
    placements.forEach((p) => {
      const mapped = mapServerPlacementToLayer(p, ownedPlants);
      if (!mapped.ok) identityErrors.push(mapped);
    });
    if (identityErrors.length) {
      return {
        ok: false,
        code: IDENTITY_INCONSISTENT,
        durableDatabase: true,
        paidAiCalls: 0,
        identityErrors,
        designId: design.id
      };
    }
    return Object.assign({
      ok: true,
      code: 'LOADED',
      durableDatabase: true,
      paidAiCalls: 0,
      designId: design.id,
      designClientInstanceId: design.client_instance_id,
      gardenProfileId: design.garden_profile_id,
      gardenAreaId: design.garden_area_id || null,
      revision: design.revision,
      title: design.title || null,
      sourceMediaId: design.source_media_id || null,
      derivedBaseMediaId: design.derived_base_media_id || null,
      sourceMediaUrl: source.signedUrl,
      derivedBaseMediaUrl: derived.signedUrl,
      editorBaseMediaUrl: editorBase.signedUrl,
      editorBaseMediaId: editorBase.mediaId,
      placements
    }, extra);
  }

  async function loadDesign(payload = {}) {
    designPaidAiForAction('load-design');
    const auth = authContext();
    if (!auth.ok) {
      return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED', durableDatabase: false, paidAiCalls: 0 };
    }
    const gardenAreaId = asNull(payload.gardenAreaId);
    const explicitDesignId = asNull(payload.explicitDesignId || payload.designId);
    const ownedPlants = await loadOwnedIndex(auth.gardenProfileId);
    const localSnapshot = payload.localSnapshot || null;
    const localClass = classifyLegacyLocalSnapshotImport(localSnapshot, {
      userId: auth.sessionUserId,
      gardenProfileId: auth.gardenProfileId,
      areaId: gardenAreaId
    });

    if (explicitDesignId) {
      const { data, error } = await auth.supabase
        .from('garden_designs')
        .select(DESIGN_SELECT)
        .eq('id', explicitDesignId)
        .eq('garden_profile_id', auth.gardenProfileId)
        .maybeSingle();
      if (error) return { ok: false, code: 'LOAD_FAILED', error: error.message, paidAiCalls: 0 };
      if (!data) return { ok: false, code: 'DESIGN_NOT_IN_ACTIVE_GARDEN', paidAiCalls: 0 };
      return buildLoadResult(auth.supabase, data, ownedPlants);
    }

    const cached = remembered(auth.gardenProfileId, gardenAreaId);
    const cachedId = asNull(payload.cachedDesignId) || (cached && cached.designId);
    if (cachedId && !payload.ignoreCache) {
      const { data } = await auth.supabase
        .from('garden_designs')
        .select(DESIGN_SELECT)
        .eq('id', cachedId)
        .eq('garden_profile_id', auth.gardenProfileId)
        .maybeSingle();
      if (data) return buildLoadResult(auth.supabase, data, ownedPlants);
    }

    let rows;
    try {
      rows = await listActiveDesigns(auth.supabase, auth.gardenProfileId, gardenAreaId);
    } catch (err) {
      return { ok: false, code: 'LOAD_FAILED', error: err && err.message, paidAiCalls: 0, keepLocalCanvas: true };
    }

    if (rows.length === 0) {
      return {
        ok: true,
        code: EMPTY_SERVER_DESIGN,
        durableDatabase: true,
        created: false,
        paidAiCalls: 0,
        gardenProfileId: auth.gardenProfileId,
        gardenAreaId,
        placements: [],
        localRestore: localClass.code === LOCAL_DESIGN_RESTORE_AVAILABLE ? localClass : { import: false, autoImport: false, code: localClass.code }
      };
    }
    if (rows.length > 1) {
      return {
        ok: false,
        code: MULTIPLE_DESIGNS_REQUIRE_SELECTION,
        durableDatabase: true,
        paidAiCalls: 0,
        gardenProfileId: auth.gardenProfileId,
        gardenAreaId,
        designIds: rows.map((r) => r.id),
        silentLatestForbidden: true
      };
    }
    return buildLoadResult(auth.supabase, rows[0], ownedPlants, {
      localRestore: { import: false, autoImport: false }
    });
  }

  async function findExistingDesign(payload = {}) {
    const auth = authContext();
    if (!auth.ok) return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED' };
    const gardenAreaId = asNull(payload.gardenAreaId);
    let clientInstanceId = asNull(payload.designClientInstanceId);
    const cached = remembered(auth.gardenProfileId, gardenAreaId);
    if (cached && cached.designId) {
      const { data } = await auth.supabase
        .from('garden_designs')
        .select(DESIGN_SELECT)
        .eq('id', cached.designId)
        .maybeSingle();
      if (data) return { ok: true, design: data, created: false };
    }
    if (!clientInstanceId && cached) clientInstanceId = cached.clientInstanceId;
    if (clientInstanceId) {
      const { data: existing } = await auth.supabase
        .from('garden_designs')
        .select(DESIGN_SELECT)
        .eq('garden_profile_id', auth.gardenProfileId)
        .eq('client_instance_id', clientInstanceId)
        .maybeSingle();
      if (existing) {
        remember(auth.gardenProfileId, existing.garden_area_id, existing);
        return { ok: true, design: existing, created: false };
      }
    }
    return { ok: true, design: null, created: false, clientInstanceId };
  }

  async function ensureDesign(payload = {}) {
    const auth = authContext();
    if (!auth.ok) return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED' };
    const gardenAreaId = asNull(payload.gardenAreaId);
    const found = await findExistingDesign(payload);
    if (!found.ok) return found;
    if (found.design) return found;
    const clientInstanceId = asNull(found.clientInstanceId) || asNull(payload.designClientInstanceId) || createDesignClientInstanceId();

    const insertRow = {
      garden_profile_id: auth.gardenProfileId,
      user_id: auth.sessionUserId,
      client_instance_id: clientInstanceId,
      garden_area_id: gardenAreaId,
      status: 'active',
      title: asText(payload.title) || DEFAULT_DESIGN_TITLE
    };
    const { data, error } = await auth.supabase
      .from('garden_designs')
      .insert(insertRow)
      .select(DESIGN_SELECT)
      .single();
    if (!error && data) return { ok: true, design: data, created: true };
    if (isUniqueViolation(error)) {
      const { data: existing, error: lookupError } = await auth.supabase
        .from('garden_designs')
        .select(DESIGN_SELECT)
        .eq('garden_profile_id', auth.gardenProfileId)
        .eq('client_instance_id', clientInstanceId)
        .maybeSingle();
      if (existing) {
        remember(auth.gardenProfileId, existing.garden_area_id, existing);
        return { ok: true, design: existing, created: false };
      }
      const fail = persistFailFields(lookupError || error, 'ensureDesign', 'insert-duplicate-resolve', {
        code: 'DESIGN_WRITE_FAILED'
      });
      logPersistConsole(fail);
      return fail;
    }
    const fail = persistFailFields(error, 'ensureDesign', 'insert', { code: 'DESIGN_WRITE_FAILED' });
    logPersistConsole(fail);
    return fail;
  }

  async function compensateNewlyCreatedEmptyDesign(auth, design, createdByThisAttempt) {
    if (!createdByThisAttempt || !auth || !auth.ok || !design || !design.id) {
      return { compensated: false, reason: 'not-created-by-this-attempt' };
    }
    const { data: current } = await auth.supabase
      .from('garden_designs')
      .select(DESIGN_SELECT)
      .eq('id', design.id)
      .eq('garden_profile_id', auth.gardenProfileId)
      .maybeSingle();
    if (!current) return { compensated: false, reason: 'design-already-absent' };
    if (designHasMeaningfulPayload(current)) {
      return { compensated: false, reason: 'design-has-meaningful-payload' };
    }
    const { data: placements } = await auth.supabase
      .from('garden_design_placements')
      .select('id')
      .eq('garden_design_id', current.id);
    if (Array.isArray(placements) && placements.length > 0) {
      return { compensated: false, reason: 'design-has-placements' };
    }
    const { error } = await auth.supabase
      .from('garden_designs')
      .delete()
      .eq('id', current.id)
      .eq('client_instance_id', current.client_instance_id);
    if (error) {
      return { compensated: false, compensateFailed: true, reason: 'delete-failed', error: error.message };
    }
    forget(auth.gardenProfileId, current.garden_area_id, current.id);
    return { compensated: true, deletedDesignId: current.id };
  }

  function validateOwnedPlacement(placement, ownedPlants, gardenProfileId) {
    const gardenPlantId = asNull(placement.gardenPlantId);
    if (!gardenPlantId) {
      return { ok: false, code: IDENTITY_INCONSISTENT, detail: 'owned-requires-garden-plant-id' };
    }
    const plant = ownedPlants.find((p) => p.gardenPlantId === gardenPlantId);
    if (!plant) {
      return { ok: false, code: IDENTITY_INCONSISTENT, detail: 'garden-plant-not-in-active-garden' };
    }
    if (plant.gardenProfileId && plant.gardenProfileId !== gardenProfileId) {
      return { ok: false, code: IDENTITY_INCONSISTENT, detail: 'garden-plant-wrong-garden' };
    }
    return {
      ok: true,
      gardenPlantId,
      canonicalSlug: plant.canonicalSlug,
      gardenAreaId: plant.gardenAreaId,
      createsGardenPlant: false
    };
  }

  async function savePlacement(payload = {}, mode = 'create') {
    designPaidAiForAction(mode === 'update' ? 'update-placement' : 'save-placement');
    const auth = authContext();
    if (!auth.ok) {
      const fail = persistFailFields({ message: 'auth_or_garden_required' }, 'savePlacement', 'auth', {
        code: 'AUTH_OR_GARDEN_REQUIRED'
      });
      logPersistConsole(fail);
      return fail;
    }
    const placement = payload.placement || payload;
    const clientInstanceId = asNull(placement.clientInstanceId || payload.clientInstanceId);
    if (!clientInstanceId) {
      return { ok: false, code: 'CLIENT_INSTANCE_ID_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
    }
    const kind = asText(placement.kind) === DESIGN_PLANT_KIND.OWNED || placement.gardenPlantId
      ? DESIGN_PLANT_KIND.OWNED
      : DESIGN_PLANT_KIND.PROPOSED;
    const ownedPlants = await loadOwnedIndex(auth.gardenProfileId);
    let gardenPlantId = null;
    let canonicalSlug = asNull(placement.canonicalSlug);
    let gardenAreaId = asNull(placement.gardenAreaId);
    if (kind === DESIGN_PLANT_KIND.OWNED) {
      const owned = validateOwnedPlacement(placement, ownedPlants, auth.gardenProfileId);
      if (!owned.ok) return Object.assign({ keepLocalCanvas: true, paidAiCalls: 0, createsGardenPlant: false }, owned);
      gardenPlantId = owned.gardenPlantId;
      canonicalSlug = owned.canonicalSlug;
      gardenAreaId = owned.gardenAreaId;
    } else {
      if (!canonicalSlug) {
        return { ok: false, code: 'PROPOSED_CANONICAL_SLUG_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
      }
      gardenPlantId = null;
    }

    const ensured = await ensureDesign(payload);
    if (!ensured.ok) return Object.assign({ keepLocalCanvas: true, paidAiCalls: 0 }, ensured);
    const design = ensured.design;
    if (kind !== DESIGN_PLANT_KIND.OWNED && design.garden_area_id) {
      gardenAreaId = design.garden_area_id;
    }
    if (design.garden_area_id && gardenAreaId && design.garden_area_id !== gardenAreaId && kind !== DESIGN_PLANT_KIND.OWNED) {
      gardenAreaId = design.garden_area_id;
    }

    const row = {
      garden_design_id: design.id,
      user_id: auth.sessionUserId,
      client_instance_id: clientInstanceId,
      kind,
      garden_plant_id: gardenPlantId,
      canonical_slug: canonicalSlug,
      garden_area_id: gardenAreaId,
      design_asset_id: asNull(placement.designAssetId),
      growth_stage: asNull(placement.growthStage),
      target_growth_stage: asNull(placement.targetGrowthStage),
      season: asNull(placement.season),
      phenology: asNull(placement.phenology),
      x: clamp01(placement.x, 0.5),
      y: clamp01(placement.y, 0.78),
      scale: clampScale(placement.scale),
      rotation: Number(placement.rotation) || 0,
      z_order: Number(placement.zOrder != null ? placement.zOrder : 0) || 0,
      label: asNull(placement.label),
      scientific: asNull(placement.scientific)
    };

    const patch = placementMutablePatch(row);
    let written = null;
    let writeError = null;
    let placementOperation = 'insert';
    if (mode === 'update') {
      const { data: existingPlacement } = await auth.supabase
        .from('garden_design_placements')
        .select(PLACEMENT_SELECT)
        .eq('garden_design_id', design.id)
        .eq('client_instance_id', clientInstanceId)
        .maybeSingle();
      if (existingPlacement) {
        placementOperation = 'update';
        const updated = await auth.supabase
          .from('garden_design_placements')
          .update(patch)
          .eq('id', existingPlacement.id)
          .select(PLACEMENT_SELECT)
          .single();
        written = updated.data;
        writeError = updated.error;
      }
    }
    if (!written && !writeError) {
      const inserted = await auth.supabase
        .from('garden_design_placements')
        .insert(row)
        .select(PLACEMENT_SELECT)
        .single();
      written = inserted.data;
      writeError = inserted.error;
      placementOperation = 'insert';
      if (writeError && isUniqueViolation(writeError)) {
        placementOperation = 'update';
        const updated = await auth.supabase
          .from('garden_design_placements')
          .update(patch)
          .eq('garden_design_id', design.id)
          .eq('client_instance_id', clientInstanceId)
          .select(PLACEMENT_SELECT)
          .single();
        written = updated.data;
        writeError = updated.error;
      }
    }
    if (writeError) {
      const compensated = await compensateNewlyCreatedEmptyDesign(auth, design, !!ensured.created);
      const fail = persistFailFields(writeError, 'savePlacement', placementOperation, {
        code: 'PLACEMENT_WRITE_FAILED',
        createdDesign: !!ensured.created,
        compensatedEmptyDesign: !!compensated.compensated,
        leftoverEmptyDesign: !!(ensured.created && !compensated.compensated),
        designClientInstanceId: design.client_instance_id
      });
      logPersistConsole(fail);
      return fail;
    }

    const { data: fresh } = await auth.supabase
      .from('garden_designs')
      .select(DESIGN_SELECT)
      .eq('id', design.id)
      .maybeSingle();
    if (fresh) remember(auth.gardenProfileId, fresh.garden_area_id, fresh);

    return {
      ok: true,
      durableDatabase: true,
      paidAiCalls: 0,
      createdDesign: !!ensured.created,
      createsGardenPlant: false,
      designId: design.id,
      designClientInstanceId: design.client_instance_id,
      revision: fresh ? fresh.revision : design.revision,
      placement: mapPlacementRow(written),
      gardenPlantId,
      gardenAreaId,
      canonicalSlug
    };
  }

  async function deletePlacement(payload = {}) {
    designPaidAiForAction('delete-placement');
    const auth = authContext();
    if (!auth.ok) return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
    const clientInstanceId = asNull(payload.clientInstanceId);
    if (!clientInstanceId) return { ok: false, code: 'CLIENT_INSTANCE_ID_REQUIRED', paidAiCalls: 0 };
    const found = await findExistingDesign(payload);
    if (!found.ok) return Object.assign({ keepLocalCanvas: true, paidAiCalls: 0 }, found);
    if (!found.design) {
      return { ok: true, deleted: false, code: EMPTY_SERVER_DESIGN, paidAiCalls: 0, deletedGardenPlant: false };
    }
    const plantCountBefore = (await loadOwnedIndex(auth.gardenProfileId)).length;
    const { data, error } = await auth.supabase
      .from('garden_design_placements')
      .delete()
      .eq('garden_design_id', found.design.id)
      .eq('client_instance_id', clientInstanceId)
      .select(PLACEMENT_SELECT);
    if (error) return { ok: false, code: 'PLACEMENT_DELETE_FAILED', error: error.message, keepLocalCanvas: true, paidAiCalls: 0 };
    const { data: fresh } = await auth.supabase
      .from('garden_designs')
      .select(DESIGN_SELECT)
      .eq('id', found.design.id)
      .maybeSingle();
    if (fresh) remember(auth.gardenProfileId, fresh.garden_area_id, fresh);
    return {
      ok: true,
      durableDatabase: true,
      paidAiCalls: 0,
      deleted: Array.isArray(data) ? data.length > 0 : !!data,
      deletedGardenPlant: false,
      gardenPlantCountUnchanged: true,
      gardenPlantCount: plantCountBefore,
      revision: fresh ? fresh.revision : found.design.revision,
      designId: found.design.id
    };
  }

  async function saveDesign(payload = {}) {
    designPaidAiForAction('save-design');
    const auth = authContext();
    if (!auth.ok) return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
    const patch = {};
    if (payload.title != null) patch.title = asText(payload.title) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'gardenAreaId') && payload.attachArea === true) {
      patch.garden_area_id = asNull(payload.gardenAreaId);
    }
    if (payload.sourceMediaId) patch.source_media_id = payload.sourceMediaId;
    if (Object.prototype.hasOwnProperty.call(payload, 'derivedBaseMediaId')) {
      patch.derived_base_media_id = asNull(payload.derivedBaseMediaId);
    }
    delete patch.revision;
    if (!Object.keys(patch).length) {
      const cached = remembered(auth.gardenProfileId, payload.gardenAreaId);
      return { ok: true, noop: true, revision: cached && cached.revision, paidAiCalls: 0 };
    }
    const ensured = await ensureDesign(payload);
    if (!ensured.ok) return Object.assign({ keepLocalCanvas: true, paidAiCalls: 0 }, ensured);
    const { data, error } = await auth.supabase
      .from('garden_designs')
      .update(patch)
      .eq('id', ensured.design.id)
      .select(DESIGN_SELECT)
      .single();
    if (error) {
      const compensated = await compensateNewlyCreatedEmptyDesign(auth, ensured.design, !!ensured.created);
      const fail = persistFailFields(error, 'saveDesign', 'update', {
        code: 'DESIGN_WRITE_FAILED',
        createdDesign: !!ensured.created,
        compensatedEmptyDesign: !!compensated.compensated,
        leftoverEmptyDesign: !!(ensured.created && !compensated.compensated),
        designClientInstanceId: ensured.design.client_instance_id
      });
      logPersistConsole(fail);
      return fail;
    }
    remember(auth.gardenProfileId, data.garden_area_id, data);
    return {
      ok: true,
      durableDatabase: true,
      paidAiCalls: 0,
      designId: data.id,
      designClientInstanceId: data.client_instance_id,
      revision: data.revision,
      sourceMediaId: data.source_media_id,
      derivedBaseMediaId: data.derived_base_media_id
    };
  }

  async function saveSourceMedia(payload = {}) {
    designPaidAiForAction('save-source-media');
    const auth = authContext();
    if (!auth.ok) return { ok: false, code: 'AUTH_OR_GARDEN_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
    const file = payload.file || payload.blob;
    if (!file) return { ok: false, code: 'FILE_REQUIRED', keepLocalCanvas: true, paidAiCalls: 0 };
    if (typeof file === 'string' && file.startsWith('data:')) {
      return { ok: false, code: 'DATA_URL_FORBIDDEN', keepLocalCanvas: true, paidAiCalls: 0 };
    }
    let media;
    try {
      media = await createMedia({
        supabase: auth.supabase,
        userId: auth.sessionUserId,
        gardenProfileId: auth.gardenProfileId,
        gardenPlantId: null,
        gardenAreaId: asNull(payload.gardenAreaId),
        file,
        setAsCover: false,
        sourceModule: 'garden_design',
        purpose: 'design_source'
      });
    } catch (err) {
      return {
        ok: false,
        code: 'MEDIA_UPLOAD_FAILED',
        error: err && (err.message || err.code),
        keepLocalCanvas: true,
        paidAiCalls: 0
      };
    }
    const mediaRow = media && (media.row || media);
    const mediaId = mediaRow && mediaRow.id;
    if (!mediaId) return { ok: false, code: 'MEDIA_UPLOAD_FAILED', keepLocalCanvas: true, paidAiCalls: 0 };
    if (looksLikeDataUrl(JSON.stringify(mediaRow.metadata || {}))) {
      return { ok: false, code: 'DATA_URL_FORBIDDEN', paidAiCalls: 0 };
    }
    const attached = await saveDesign({
      designClientInstanceId: payload.designClientInstanceId,
      gardenAreaId: payload.gardenAreaId,
      sourceMediaId: mediaId
    });
    const signed = await signedMediaUrl(auth.supabase, mediaId);
    if (!attached.ok) {
      return {
        ok: false,
        code: attached.code || 'DESIGN_ATTACH_FAILED',
        error: attached.error,
        sourceMediaId: mediaId,
        storagePath: signed.storagePath || (mediaRow && mediaRow.storage_path) || null,
        purpose: 'design_source',
        sourceModule: 'garden_design',
        mediaKept: true,
        mediaDeleted: false,
        mediaValidationState: (mediaRow && mediaRow.validation_state) || 'validated',
        designAuthority: false,
        compensatedEmptyDesign: !!attached.compensatedEmptyDesign,
        leftoverEmptyDesign: !!attached.leftoverEmptyDesign,
        keepLocalCanvas: true,
        storedAsDataUrl: false,
        paidAiCalls: 0
      };
    }
    return Object.assign({}, attached, {
      ok: attached.ok,
      sourceMediaId: mediaId,
      sourceMediaUrl: signed.signedUrl,
      storagePath: signed.storagePath,
      purpose: 'design_source',
      sourceModule: 'garden_design',
      storedAsDataUrl: false,
      mediaKept: true,
      mediaDeleted: false,
      designAuthority: true,
      paidAiCalls: 0
    });
  }

  async function handle(type, payload) {
    const t = asText(type);
    let result;
    if (t === 'cruvit:garden-design-load-design') result = await loadDesign(payload);
    else if (t === 'cruvit:garden-design-save-placement') result = await savePlacement(payload, 'create');
    else if (t === 'cruvit:garden-design-update-placement') result = await savePlacement(payload, 'update');
    else if (t === 'cruvit:garden-design-delete-placement') result = await deletePlacement(payload);
    else if (t === 'cruvit:garden-design-save-design') result = await saveDesign(payload);
    else if (t === 'cruvit:garden-design-save-source-media') result = await saveSourceMedia(payload);
    else result = { ok: false, code: 'UNKNOWN_TYPE' };
    if (result && result.ok === false) {
      logPersistConsole({
        stage: result.stage || 'handle',
        operation: result.operation || t,
        code: result.code,
        supabaseCode: result.supabaseCode,
        error: result.error || result.code
      });
    }
    return result;
  }

  return {
    loadDesign,
    savePlacement,
    deletePlacement,
    saveDesign,
    saveSourceMedia,
    ensureDesign,
    handle,
    remembered,
    iframeUserIdIgnored: true,
    paidAiCalls: 0
  };
}

const api = {
  GARDEN_DESIGN_SERVER_PERSISTENCE_VERSION,
  EMPTY_SERVER_DESIGN,
  MULTIPLE_DESIGNS_REQUIRE_SELECTION,
  LOCAL_DESIGN_RESTORE_AVAILABLE,
  IDENTITY_INCONSISTENT,
  GRANT_MODEL_V31,
  DESIGN_PROTECTED_UPDATE_COLUMNS,
  iframeMustNotCreateSupabaseClient,
  createGardenDesignMemorySupabase,
  createGardenDesignHostPersistence
};

export default api;

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitGardenDesignServerPersistence = api;
}
