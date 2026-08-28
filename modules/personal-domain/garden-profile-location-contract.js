/**
 * Garden Profile Location V1 — pure contract helpers (no DOM / network).
 * Authoritative server location belongs to garden_profiles rows only.
 */

export const LOCATION_COORD_DECIMALS = 4;
export const LOCATION_SOURCES = Object.freeze(['manual', 'geolocation']);

export function roundLocationCoord(value, decimals = LOCATION_COORD_DECIMALS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function isValidLatitude(lat) {
  const n = Number(lat);
  return Number.isFinite(n) && n >= -90 && n <= 90;
}

export function isValidLongitude(lon) {
  const n = Number(lon);
  return Number.isFinite(n) && n >= -180 && n <= 180;
}

export function nullServerLocationPayload() {
  return {
    location_label: null,
    location_lat: null,
    location_lon: null,
    location_climate: null,
    location_country: null,
    location_region: null,
    location_timezone: null,
    location_source: null,
    location_confirmed_at: null,
    location_updated_at: null
  };
}

/**
 * Build a complete trusted server location write payload, or throw.
 * Never accepts location_source='default'.
 */
export function buildServerLocationPayload(input) {
  const src = String(input?.source || input?.location_source || '').trim();
  if (!LOCATION_SOURCES.includes(src)) {
    throw new Error(
      src === 'default'
        ? 'location_source default is not valid server-owned Garden location'
        : 'location_source must be manual or geolocation'
    );
  }

  const label = String(input?.label || input?.location_label || '').trim();
  const climate = String(input?.climate || input?.location_climate || '').trim();
  const lat = roundLocationCoord(input?.lat ?? input?.location_lat);
  const lon = roundLocationCoord(input?.lon ?? input?.location_lon);

  if (!label) throw new Error('location_label is required');
  if (!climate) throw new Error('location_climate is required');
  if (!isValidLatitude(lat)) throw new Error('location_lat out of range');
  if (!isValidLongitude(lon)) throw new Error('location_lon out of range');

  const now = input?.confirmedAt || input?.location_confirmed_at || new Date().toISOString();
  const updated = input?.updatedAt || input?.location_updated_at || now;

  const country = String(input?.country || input?.location_country || '').trim() || null;
  const region = String(input?.region || input?.location_region || '').trim() || null;
  const timezone = String(input?.timezone || input?.location_timezone || '').trim() || null;

  return {
    location_label: label,
    location_lat: lat,
    location_lon: lon,
    location_climate: climate,
    location_country: country,
    location_region: region,
    location_timezone: timezone,
    location_source: src,
    location_confirmed_at: now,
    location_updated_at: updated
  };
}

export function isCompleteServerLocation(row) {
  if (!row || typeof row !== 'object') return false;
  const label = String(row.location_label || '').trim();
  const climate = String(row.location_climate || '').trim();
  const src = String(row.location_source || '').trim();
  return !!(
    label &&
    climate &&
    LOCATION_SOURCES.includes(src) &&
    isValidLatitude(row.location_lat) &&
    isValidLongitude(row.location_lon) &&
    row.location_confirmed_at
  );
}

/** Map a complete server row into setAppLocation partial (existing app contract). */
export function serverLocationToAppPartial(row) {
  if (!isCompleteServerLocation(row)) return null;
  return {
    label: String(row.location_label).trim(),
    climate: String(row.location_climate).trim(),
    lat: Number(row.location_lat),
    lon: Number(row.location_lon),
    country: String(row.location_country || '').trim(),
    region: String(row.location_region || '').trim(),
    timezone: String(row.location_timezone || '').trim(),
    source: String(row.location_source).trim()
  };
}

/**
 * Active Garden selection:
 * - 0 gardens → null
 * - 1 garden → that garden id (auto)
 * - many → only explicit stored id if it still belongs to the user
 */
export function resolveActiveGardenId(ownedRows, storedActiveId) {
  const rows = Array.isArray(ownedRows) ? ownedRows.filter((r) => r?.id) : [];
  if (!rows.length) return null;
  if (rows.length === 1) return String(rows[0].id);
  const wanted = String(storedActiveId || '').trim();
  if (!wanted) return null;
  return rows.some((r) => String(r.id) === wanted) ? wanted : null;
}

/**
 * Stale-response guard for async location hydration.
 * Drop hydrate if user signed out, switched, or active garden changed.
 */
export function shouldAcceptLocationHydration(
  requestUserId,
  requestGardenId,
  session,
  activeGardenId
) {
  const activeUser = session?.user?.id;
  if (!requestUserId || !activeUser) return false;
  if (String(activeUser) !== String(requestUserId)) return false;
  if (!requestGardenId || !activeGardenId) return false;
  return String(requestGardenId) === String(activeGardenId);
}

/**
 * Pure decision helper for auth-boundary release of hydrated location.
 * Never invents Western Galilee/default as something to persist over legacy local data.
 *
 * @returns {'restore-snapshot' | 'noop-preserve-local'}
 */
export function decideAuthBoundaryLocationRelease(hasLocalSnapshot) {
  return hasLocalSnapshot ? 'restore-snapshot' : 'noop-preserve-local';
}

/** Legacy import must never be silent — caller must pass explicitConfirm=true. */
export function mayWriteLegacyLocalLocationToServer(explicitConfirm) {
  return explicitConfirm === true;
}
