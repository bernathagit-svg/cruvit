import { prepareAddPlantIntent } from '../my-garden-v2/add-plant-contract.js';
import { createAddPlantWriteRepository } from '../my-garden-v2/add-plant-write-repository.js';
import { reconcileIdentifierPlantAddedHistory } from './plant-identifier-history-reconciliation-v1.js';

function asText(value) {
  return String(value ?? '').trim();
}

function getPersonalDomain() {
  return globalThis.cruvitPersonalDomainV0 || null;
}

export async function verifyUnassessedHealthSchema(schemaVerifier, personalDomain = null) {
  const verifier =
    typeof schemaVerifier === 'function'
      ? schemaVerifier
      : typeof personalDomain?.verifyGardenPlantsUnassessedHealthV2 === 'function'
        ? personalDomain.verifyGardenPlantsUnassessedHealthV2
        : null;

  if (!verifier) {
    return Object.freeze({
      ready: false,
      reason: 'schema-verifier-unavailable',
    });
  }

  let report;
  try {
    report = await verifier();
  } catch (error) {
    return Object.freeze({
      ready: false,
      reason: 'schema-verifier-failed',
      message: error?.message || 'Schema verifier failed.',
    });
  }

  const allowed = Array.isArray(report?.allowedMarks)
    ? report.allowedMarks.map((v) => String(v))
    : [];

  const ready =
    report?.ok === true &&
    String(report?.statusDefault || '') === 'unassessed' &&
    String(report?.markDefault || '') === 'unknown' &&
    allowed.includes('unknown') &&
    allowed.includes('✓') &&
    allowed.includes('!');

  return Object.freeze({
    ready,
    reason: ready ? null : 'schema-attestation-mismatch',
    report: report && typeof report === 'object' ? Object.freeze({ ...report }) : null,
  });
}

export function buildIdentifierAddIntent({
  result,
  canonicalSlug,
  gardenProfileId,
  commitToken,
  gardenAreaId = null,
} = {}) {
  const commonName = asText(result?.common_name || result?.commonName || result?.name);
  const scientificName = asText(
    result?.scientific_name || result?.scientificName || result?.scientific
  );
  const slug = asText(canonicalSlug);
  const gardenId = asText(gardenProfileId);
  const token = asText(commitToken);

  if (!slug) throw new Error('identifier_canonical_slug_required');
  if (!scientificName) throw new Error('identifier_scientific_name_required');
  if (!commonName) throw new Error('identifier_display_name_required');
  if (!gardenId) throw new Error('garden_profile_id_required');
  if (!token) throw new Error('identifier_commit_token_required');

  return prepareAddPlantIntent({
    mode: 'scan',
    gardenProfileId: gardenId,
    clientInstanceId: 'identifier:' + token,
    displayName: commonName,
    identityConfirmed: true,
    canonicalSlug: slug,
    scientificName,
    gardenAreaId,
  });
}

export async function persistConfirmedIdentifierPlant({
  result,
  canonicalSlug,
  commitToken,
  gardenAreaId = null,
  schemaVerifier = null,
  personalDomain = getPersonalDomain(),
} = {}) {
  if (!personalDomain) {
    return { ok: false, reason: 'personal-domain-unavailable' };
  }

  const session =
    typeof personalDomain.getSession === 'function'
      ? personalDomain.getSession()
      : null;
  const userId = asText(session?.user?.id);
  if (!userId) {
    return { ok: false, reason: 'auth-required' };
  }

  const gardenProfileId =
    typeof personalDomain.getActiveGardenId === 'function'
      ? asText(personalDomain.getActiveGardenId())
      : '';
  if (!gardenProfileId) {
    return { ok: false, reason: 'active-garden-required' };
  }

  const supabase =
    typeof personalDomain.getSupabaseClient === 'function'
      ? personalDomain.getSupabaseClient()
      : null;
  if (!supabase) {
    return { ok: false, reason: 'supabase-unavailable' };
  }

  let intent;
  try {
    intent = buildIdentifierAddIntent({
      result,
      canonicalSlug,
      gardenProfileId,
      commitToken,
      gardenAreaId,
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'unsafe-add-intent',
      message: error?.message || 'Could not prepare plant save.',
    };
  }

  const schema = await verifyUnassessedHealthSchema(schemaVerifier, personalDomain);
  if (!schema.ready) {
    return {
      ok: false,
      reason: 'schema-capability-required',
      message: schema.reason || 'Schema readiness could not be verified.',
      schema,
    };
  }

  try {
    const repo = createAddPlantWriteRepository(supabase, {
      supportsUnassessedHealth: true,
    });
    const plant = await repo.insert(intent);

    let historyPending = false;
    let historyError = null;
    if (typeof personalDomain.emitPlantAddedMemory === 'function') {
      try {
        await personalDomain.emitPlantAddedMemory(plant, {
          sourceModule: 'plant_identifier',
          clientEventId: 'plant-added:' + intent.clientInstanceId,
        });
      } catch (error) {
        historyPending = true;
        historyError = error?.message || 'plant_added_history_write_failed';
      }
    } else {
      historyPending = true;
      historyError = 'plant_added_history_writer_unavailable';
    }

    if (historyPending) {
      try {
        const reconciliation = await reconcileIdentifierPlantAddedHistory({
          supabase,
          gardenProfileId,
        });
        if (reconciliation.ok && reconciliation.pending === 0) {
          historyPending = false;
          historyError = null;
        } else {
          historyError =
            reconciliation.failures?.[0]?.error ||
            historyError ||
            'plant_added_history_reconciliation_pending';
        }
      } catch (error) {
        historyError =
          error?.message ||
          historyError ||
          'plant_added_history_reconciliation_failed';
      }
    }

    if (typeof personalDomain.hydrateActiveGardenPlants === 'function') {
      await personalDomain.hydrateActiveGardenPlants();
    }

    return {
      ok: true,
      duplicate: false,
      gardenProfileId,
      canonicalSlug: intent.identity.profileSlug,
      plant,
      historyPending,
      historyError,
    };
  } catch (error) {
    const message = error?.message || 'Could not save plant.';
    return {
      ok: false,
      reason: message.includes('GARDEN_PLANT_HEALTH_UNKNOWN_NOT_REPRESENTABLE')
        ? 'schema-capability-required'
        : 'persist-failed',
      message,
    };
  }
}

export async function reconcilePendingIdentifierHistory(
  personalDomain = getPersonalDomain()
) {
  if (!personalDomain) {
    return { ok: false, reason: 'personal-domain-unavailable' };
  }

  const session =
    typeof personalDomain.getSession === 'function'
      ? personalDomain.getSession()
      : null;
  if (!asText(session?.user?.id)) {
    return { ok: false, reason: 'auth-required' };
  }

  const gardenProfileId =
    typeof personalDomain.getActiveGardenId === 'function'
      ? asText(personalDomain.getActiveGardenId())
      : '';
  if (!gardenProfileId) {
    return { ok: false, reason: 'active-garden-required' };
  }

  const supabase =
    typeof personalDomain.getSupabaseClient === 'function'
      ? personalDomain.getSupabaseClient()
      : null;
  if (!supabase) {
    return { ok: false, reason: 'supabase-unavailable' };
  }

  try {
    return await reconcileIdentifierPlantAddedHistory({
      supabase,
      gardenProfileId,
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'history-reconciliation-failed',
      message: error?.message || 'History reconciliation failed.',
    };
  }
}

const api = Object.freeze({
  verifyUnassessedHealthSchema,
  buildIdentifierAddIntent,
  persistConfirmedIdentifierPlant,
  reconcilePendingIdentifierHistory,
});

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentifierMyGardenWriteBridge = api;
}

export default api;
