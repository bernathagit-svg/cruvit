/**
 * Garden Areas V1 — minimal functional UI (create / edit context / assign plants).
 * No map, no Design integration. Server table required; soft-disabled until migration applied.
 */
import {
  GARDEN_AREAS_V1_VERSION,
  normalizeAreaContext,
  buildAreaWritePayload,
  buildUserProvidedAreaContext,
  buildAreaReadModel,
  AREA_SUN_EXPOSURES,
  AREA_PLANTING_MODES,
  AREA_IRRIGATION_TYPES
} from './garden-areas-v1-contract.js';

const HOST_ID = 'gardenAreasV1Host';
let cachedGardenAreas = [];

export function getCachedGardenAreas() {
  return cachedGardenAreas.slice();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function optionList(values, selected) {
  return values
    .map(
      (v) =>
        `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(
          v.replace(/_/g, ' ')
        )}</option>`
    )
    .join('');
}

export function renderGardenAreasHtml(state = {}) {
  if (state.pendingMigration) {
    return `<div class="gareas-panel" id="gardenAreasV1Panel">
      <div class="gareas-head">
        <h3>Garden areas</h3>
        <p class="gareas-lede">Tell CRUVIT about this part of your garden</p>
      </div>
      <p class="gareas-note">Garden areas are temporarily unavailable.</p>
    </div>`;
  }
  if (state.error) {
    return `<div class="gareas-panel"><div class="gareas-head"><h3>Garden areas</h3></div><p class="gareas-note">Areas temporarily unavailable.</p></div>`;
  }
  if (!state.signedIn) {
    return '';
  }

  const areas = state.areas || [];
  const plants = state.plants || [];
  const list = areas.length
    ? `<ul class="gareas-list">${areas
        .map((a) => {
          const rm = buildAreaReadModel(a, plants);
          return `<li>
            <b>${escapeHtml(a.name)}</b>
            <small>${escapeHtml(rm.context.sunExposure.replace(/_/g, ' '))} · ${escapeHtml(
            rm.context.plantingMode.replace(/_/g, ' ')
          )} · ${rm.plantCount} plant${rm.plantCount === 1 ? '' : 's'}</small>
            <div class="gareas-actions">
              <button type="button" data-area-edit="${escapeHtml(a.id)}">Edit sun</button>
              <button type="button" data-area-assign="${escapeHtml(a.id)}">Assign plant</button>
              <button type="button" data-area-delete="${escapeHtml(a.id)}">Delete</button>
            </div>
          </li>`;
        })
        .join('')}</ul>`
    : `<div class="gareas-empty">
        <strong>No garden areas yet</strong>
        <p>Add an area to capture sun, irrigation and planting conditions.</p>
      </div>`;

  return `<div class="gareas-panel" id="gardenAreasV1Panel" data-version="${escapeHtml(
    GARDEN_AREAS_V1_VERSION
  )}">
    <div class="gareas-head">
      <h3>Garden areas</h3>
      <p class="gareas-lede">Tell CRUVIT about this part of your garden</p>
    </div>
    ${list}
    <form id="gardenAreaCreateForm" class="gareas-form">
      <p class="gareas-form-title">${areas.length ? 'Add another area' : 'Create an area'}</p>
      <label>Area name <input name="name" required maxlength="80" placeholder="Patio pots" /></label>
      <label>Sun
        <select name="sunExposure">${optionList(AREA_SUN_EXPOSURES, 'unknown')}</select>
      </label>
      <label>Planting
        <select name="plantingMode">${optionList(AREA_PLANTING_MODES, 'unknown')}</select>
      </label>
      <label>Irrigation
        <select name="irrigationType">${optionList(AREA_IRRIGATION_TYPES, 'unknown')}</select>
      </label>
      <button type="submit" class="btn light">Create area</button>
    </form>
  </div>`;
}

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

async function areasTableAvailable(pd) {
  const sb = pd?.getSupabaseClient?.();
  if (!sb) return false;
  try {
    const gardenId = pd.getActiveGardenId?.();
    if (!gardenId) return false;
    const { error } = await sb.from('garden_areas').select('id').eq('garden_profile_id', gardenId).limit(1);
    if (error) {
      const msg = String(error.message || error.code || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42P01') {
        return false;
      }
      // Other errors: table may exist
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

export async function refreshGardenAreasV1() {
  const host = document.getElementById(HOST_ID);
  if (!host) return null;
  const pd = window.cruvitPersonalDomainV0;
  if (!pd?.getSession?.()?.user) {
    host.innerHTML = '';
    host.hidden = true;
    return null;
  }
  host.hidden = false;
  const slot = document.getElementById('gardenAreasSlot');
  if (slot && host.parentElement !== slot) {
    slot.appendChild(host);
  }
  const shell = document.getElementById('gardenOsFunctionalShell');
  if (shell) shell.hidden = false;
  const available = await areasTableAvailable(pd);
  if (!available) {
    host.innerHTML = renderGardenAreasHtml({ signedIn: true, pendingMigration: true });
    return { pendingMigration: true };
  }

  let areas = [];
  let plants = [];
  try {
    areas =
      typeof pd.listAreasForActiveGarden === 'function' ? await pd.listAreasForActiveGarden() : [];
  } catch (e) {
    console.warn('[GardenAreas] list failed', e?.message || e);
    host.innerHTML = renderGardenAreasHtml({ signedIn: true, error: true });
    return null;
  }
  try {
    const rows =
      typeof pd.listPlantsForActiveGarden === 'function' ? await pd.listPlantsForActiveGarden() : [];
    plants = (rows || []).map((r) => ({
      id: r.id,
      name: r.name,
      garden_area_id: r.garden_area_id || null,
      gardenAreaId: r.garden_area_id || null
    }));
  } catch (_) {}

  cachedGardenAreas = Array.isArray(areas) ? areas.slice() : [];
  host.innerHTML = renderGardenAreasHtml({ signedIn: true, areas, plants });
  wireAreaForm(host, pd);
  return { areas, plants };
}

function wireAreaForm(host, pd) {
  const form = host.querySelector('#gardenAreaCreateForm');
  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    try {
      const payload = buildAreaWritePayload({
        name: fd.get('name'),
        clientInstanceId: `area_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        context: buildUserProvidedAreaContext({
          sunExposure: fd.get('sunExposure'),
          plantingMode: fd.get('plantingMode'),
          irrigationType: fd.get('irrigationType')
        })
      });
      if (typeof pd.upsertAreaOnActiveGarden === 'function') {
        await pd.upsertAreaOnActiveGarden(payload);
      }
      await refreshGardenAreasV1();
    } catch (e) {
      alert(e?.message || 'Could not create area.');
    }
  });

  host.querySelectorAll('[data-area-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-area-delete');
      if (!id || !confirm('Delete this area? Plants stay in the garden (unassigned).')) return;
      try {
        await pd.deleteAreaOnActiveGarden?.(id);
        await refreshGardenAreasV1();
      } catch (e) {
        alert(e?.message || 'Could not delete area.');
      }
    });
  });

  host.querySelectorAll('[data-area-assign]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.getAttribute('data-area-assign');
      const name = prompt('Assign which plant? Enter exact plant name:');
      if (!name || !areaId) return;
      try {
        await pd.assignPlantToAreaOnActiveGarden?.({ plantName: name.trim(), areaId });
        await refreshGardenAreasV1();
      } catch (e) {
        alert(e?.message || 'Could not assign plant.');
      }
    });
  });

  host.querySelectorAll('[data-area-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const areaId = btn.getAttribute('data-area-edit');
      const sun = prompt(
        'Sun for this area (full sun, part sun, part shade, full shade, or unknown):',
        'unknown'
      );
      if (sun == null) return;
      try {
        await pd.updateAreaContextOnActiveGarden?.(areaId, buildUserProvidedAreaContext({ sunExposure: sun }));
        await refreshGardenAreasV1();
      } catch (e) {
        alert(e?.message || 'Could not update area.');
      }
    });
  });
}

if (isBrowser) {
  window.cruvitGardenAreasV1 = Object.freeze({
    version: GARDEN_AREAS_V1_VERSION,
    refresh: refreshGardenAreasV1,
    renderHtml: renderGardenAreasHtml,
    normalizeAreaContext,
    buildAreaReadModel,
    getCachedAreas: getCachedGardenAreas
  });

  function boot() {
    if (!document.getElementById(HOST_ID)) return;
    setTimeout(() => {
      refreshGardenAreasV1().catch(() => {});
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
