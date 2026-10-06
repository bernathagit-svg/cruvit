import { prepareAddPlantIntent } from '../my-garden-v2/add-plant-contract.js';
import { createAtomicAddPlantCommand } from '../my-garden-v2/add-plant-write-repository.js';

function asText(value) {
  return String(value ?? '').trim();
}

function getPersonalDomain() {
  return globalThis.cruvitPersonalDomainV0 || null;
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
  personalDomain = getPersonalDomain(),
} = {}) {
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

  try {
    const command = createAtomicAddPlantCommand(supabase);
    const out = await command.execute(intent);

    if (typeof personalDomain.hydrateActiveGardenPlants === 'function') {
      await personalDomain.hydrateActiveGardenPlants();
    }

    return {
      ok: true,
      duplicate: out.created !== true,
      created: out.created,
      historyCreated: out.historyCreated,
      gardenProfileId,
      canonicalSlug: intent.identity.profileSlug,
      plant: out.plant,
      history: out.history,
    };
  } catch (error) {
    const message = error?.message || 'Could not save plant.';
    return {
      ok: false,
      reason: message.includes('idempotency_payload_mismatch')
        ? 'idempotency_payload_mismatch'
        : 'persist-failed',
      message,
    };
  }
}

const api = Object.freeze({
  buildIdentifierAddIntent,
  persistConfirmedIdentifierPlant,
});

if (typeof globalThis !== 'undefined') {
  globalThis.CruvitPlantIdentifierMyGardenWriteBridge = api;
}

export default api;
