/**
 * Structural climate persistence / acquire-once contract (pure helpers).
 * Garden confirmed location → acquire when needed → store → reuse for evaluations.
 * Plant evaluations must never call climate providers.
 */

export const STRUCTURAL_CLIMATE_PERSISTENCE_VERSION = '1.0.0';

/** Do not re-hit archive after a failed acquire within this window (ms). */
export const STRUCTURAL_ACQUIRE_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Whether a new EXTERNAL structural climate acquire is allowed for this Garden location.
 *
 * Production V2: external acquire is NEVER allowed on user runtime.
 * Authority is CRUVIT local Coordinate Climate V2 lookup / reuse only.
 * Kept for compatibility with older callers — always returns acquire:false for external paths.
 */
export function shouldAcquireStructuralClimate(
  existingStructural,
  lat,
  lon,
  { nowMs = Date.now(), cooldownMs = STRUCTURAL_ACQUIRE_FAILURE_COOLDOWN_MS } = {}
) {
  void nowMs;
  void cooldownMs;
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { acquire: false, reason: 'invalid-coordinates' };
  }

  const sc =
    existingStructural && typeof existingStructural === 'object' ? existingStructural : null;
  if (
    sc &&
    String(sc.status || '').toLowerCase() === 'known' &&
    String(sc.provenance?.provider || '').includes('coordinate-climate-authority-v2')
  ) {
    const pLat = Number(sc.provenance?.lat);
    const pLon = Number(sc.provenance?.lon);
    const coordsMatch =
      Number.isFinite(pLat) &&
      Number.isFinite(pLon) &&
      Math.abs(pLat - latitude) < 0.00015 &&
      Math.abs(pLon - longitude) < 0.00015;
    if (coordsMatch) return { acquire: false, reason: 'reuse-known-v2' };
  }

  // Never allow Open-Meteo / CHELSA / terrain external acquire on user runtime.
  return { acquire: false, reason: 'v2-local-lookup-only-no-external-acquire' };
}

/** Server write fields for garden_profiles structural climate columns. */
export function buildStructuralClimateServerFields(structuralClimate) {
  const sc =
    structuralClimate && typeof structuralClimate === 'object' ? structuralClimate : null;
  if (!sc) {
    return {
      location_structural_climate: null,
      location_structural_climate_version: null,
      location_structural_climate_fetched_at: null,
      location_structural_climate_source: null,
      location_structural_climate_status: null
    };
  }
  const status = String(sc.status || 'unknown').toLowerCase();
  const fetchedAt =
    sc.provenance?.fetchedAt ||
    sc.fetchedAt ||
    sc.lastAcquireErrorAt ||
    null;
  const source =
    sc.provenance?.provider ||
    sc.source?.provider ||
    sc.source ||
    null;
  return {
    location_structural_climate: sc,
    location_structural_climate_version: String(
      sc.authorityVersion || sc.version || STRUCTURAL_CLIMATE_PERSISTENCE_VERSION
    ),
    location_structural_climate_fetched_at: fetchedAt ? String(fetchedAt) : null,
    location_structural_climate_source: source ? String(source) : null,
    location_structural_climate_status:
      status === 'known' || status === 'failed' || status === 'unknown' ? status : 'unknown'
  };
}

export function parseStructuralClimateFromServerRow(row) {
  if (!row || typeof row !== 'object') return null;
  const blob = row.location_structural_climate;
  if (blob && typeof blob === 'object') return blob;
  return null;
}

/**
 * Mark a failed acquire so reopen loops do not storm the provider.
 * Preserves any prior known structural when provided.
 */
export function markStructuralAcquireFailure(priorStructural, errorCode, { nowIso } = {}) {
  const prior =
    priorStructural && typeof priorStructural === 'object' ? { ...priorStructural } : {};
  if (prior.status === 'known') {
    return {
      ...prior,
      lastAcquireError: String(errorCode || 'acquire-failed'),
      lastAcquireErrorAt: nowIso || new Date().toISOString()
    };
  }
  return {
    status: 'failed',
    lastAcquireError: String(errorCode || 'acquire-failed'),
    lastAcquireErrorAt: nowIso || new Date().toISOString(),
    provenance: prior.provenance || null
  };
}
