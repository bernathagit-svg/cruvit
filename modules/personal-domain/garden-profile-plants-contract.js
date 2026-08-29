/**
 * Garden Plants Persistence V1 — pure contract helpers (no DOM / network).
 * Authoritative plant rows belong to garden_profiles via garden_plants.
 */

export const GARDEN_PLANT_MARKS = Object.freeze(['✓', '!']);

export const DEFAULT_PLANT_PREFS = Object.freeze({
  autoTasks: true,
  reminders: true,
  alerts: true
});

export function normalizePlantPrefs(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    autoTasks: src.autoTasks !== false,
    reminders: src.reminders !== false,
    alerts: src.alerts !== false
  };
}

export function isValidPlantMark(mark) {
  return GARDEN_PLANT_MARKS.includes(String(mark || '').trim());
}

/**
 * Build a server write payload from a My Garden plant object, or throw.
 * Does not persist meta/catalog blobs, images, tasks, or identity plantId/canonicalSlug.
 */
export function buildServerPlantPayload(plant) {
  const p = plant && typeof plant === 'object' ? plant : {};
  const clientInstanceId = String(p.id || p.client_instance_id || '').trim();
  const name = String(p.name || '').trim();
  const status = String(p.status || 'Healthy').trim() || 'Healthy';
  const mark = String(p.mark || '✓').trim() || '✓';
  const source = String(p.source || 'My Garden').trim() || 'My Garden';
  const profileSlug = String(p.profileSlug || p.profile_slug || '').trim() || null;
  const scientific =
    String(p.scientific || p.meta?.scientific || '').trim() || null;
  const archived = p.archived === true;
  const prefs = normalizePlantPrefs(p.prefs);
  const addedAt = p.addedAt || p.added_at || new Date().toISOString();

  if (!clientInstanceId) throw new Error('client_instance_id is required');
  if (!name) throw new Error('plant name is required');
  if (!isValidPlantMark(mark)) throw new Error('plant mark must be ✓ or !');

  return {
    client_instance_id: clientInstanceId,
    name,
    status,
    mark,
    source,
    profile_slug: profileSlug,
    scientific,
    archived,
    prefs,
    added_at: addedAt
  };
}

export function serverPlantToAppPlant(row) {
  if (!row || typeof row !== 'object') return null;
  const clientId = String(row.client_instance_id || '').trim();
  if (!clientId) return null;
  return {
    id: clientId,
    serverId: row.id || null,
    name: String(row.name || 'Plant'),
    status: String(row.status || 'Healthy'),
    mark: isValidPlantMark(row.mark) ? String(row.mark) : '✓',
    source: String(row.source || 'My Garden'),
    profileSlug: row.profile_slug ? String(row.profile_slug) : undefined,
    scientific: row.scientific ? String(row.scientific) : undefined,
    archived: row.archived === true,
    prefs: normalizePlantPrefs(row.prefs),
    addedAt: row.added_at || undefined,
    updatedAt: row.updated_at || undefined
  };
}

export function mayWriteLegacyLocalPlantsToServer(explicitUserConfirm) {
  return explicitUserConfirm === true;
}

export function decideAuthBoundaryPlantsRelease(hasLocalSnapshot) {
  return hasLocalSnapshot ? 'restore-snapshot' : 'noop-preserve-local';
}

/**
 * Stale hydration guard: reject plant list apply when session/user/active garden drifted.
 */
export function shouldAcceptPlantHydration(
  requestUserId,
  requestGardenId,
  currentSession,
  activeGardenId
) {
  const sessionUserId = currentSession?.user?.id;
  if (!requestUserId || !sessionUserId) return false;
  if (String(requestUserId) !== String(sessionUserId)) return false;
  if (!requestGardenId || !activeGardenId) return false;
  if (String(requestGardenId) !== String(activeGardenId)) return false;
  return true;
}
