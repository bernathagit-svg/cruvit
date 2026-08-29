/**
 * Garden location granularity — general precision gate for climate authority.
 * Country / continent / state-province centroids are not Garden climate truth.
 */

/** Open-Meteo / GeoNames-style codes too coarse for one Garden climate. */
export const TOO_BROAD_FEATURE_CODES = Object.freeze([
  'CONT', // continent
  'PCLI', // independent political entity (country)
  'PCLD', // dependent political entity
  'PCLF', // freely associated state
  'PCLS', // semi-independent political entity
  'PCLIX',
  'PCL',
  'ADM1', // first-order admin (state / province / region)
  'RGN', // region
  'AREA'
]);

export const NEEDS_MORE_SPECIFIC_LOCATION = 'NEEDS MORE SPECIFIC LOCATION';
export const NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE =
  'That location is too broad for a reliable Garden climate. Enter a city, town, or locality.';

/**
 * True when resolver metadata indicates country / continent / state-province (or equivalent).
 * Uses feature codes, Nominatim class/type/addresstype, and coarse label heuristics.
 * Not Israel-specific.
 */
export function isTooBroadForGardenClimate(loc) {
  if (!loc || typeof loc !== 'object') return true;

  const featureCode = String(
    loc.feature_code || loc.featureCode || loc.featureCodeName || ''
  )
    .trim()
    .toUpperCase();
  if (featureCode && TOO_BROAD_FEATURE_CODES.includes(featureCode)) return true;
  if (featureCode.startsWith('PCL') && featureCode !== 'PCLK') return true;
  if (featureCode === 'ADM1') return true;

  const addresstype = String(loc.addresstype || loc.addressType || '')
    .trim()
    .toLowerCase();
  if (
    ['country', 'continent', 'state', 'province', 'region', 'state_district'].includes(
      addresstype
    )
  ) {
    return true;
  }

  const osmClass = String(loc.class || loc.osm_key || '')
    .trim()
    .toLowerCase();
  const osmType = String(loc.type || loc.osm_value || loc.resultType || '')
    .trim()
    .toLowerCase();
  if (osmClass === 'boundary' && ['administrative', 'country', 'region'].includes(osmType)) {
    // Country / high-level admin boundaries — reject unless clearly a populated place name diverge.
    const name = String(loc.name || '')
      .trim()
      .toLowerCase();
    const country = String(loc.country || '')
      .trim()
      .toLowerCase();
    if (!name || name === country || osmType === 'country') return true;
    // Nominatim often returns type=administrative for states
    if (addresstype === 'state' || addresstype === 'province') return true;
  }
  if (osmType === 'country' || osmType === 'continent') return true;

  const name = String(loc.name || '')
    .trim()
    .toLowerCase();
  const label = String(loc.label || '')
    .trim()
    .toLowerCase();
  const country = String(loc.country || '')
    .trim()
    .toLowerCase();

  // "Brazil, Brazil" / name equals country with no finer place token
  if (country && name && name === country) return true;
  if (label && country && (label === country || label === `${country}, ${country}`)) return true;

  const parts = label
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 2 && parts[0] === parts[1]) return true;

  return false;
}

/**
 * Gate for accepting a resolved location as Garden climate authority.
 * @returns {{ ok: true } | { ok: false, reason: string, message: string }}
 */
export function mayAcceptResolvedLocationForGardenClimate(loc) {
  if (!loc || typeof loc !== 'object') {
    return {
      ok: false,
      reason: 'unresolved',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE
    };
  }
  const lat = Number(loc.lat ?? loc.latitude);
  const lon = Number(loc.lon ?? loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      ok: false,
      reason: 'missing-coordinates',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE
    };
  }
  if (isTooBroadForGardenClimate(loc)) {
    return {
      ok: false,
      reason: 'too-broad',
      message: NEEDS_MORE_SPECIFIC_LOCATION_MESSAGE,
      code: NEEDS_MORE_SPECIFIC_LOCATION
    };
  }
  return { ok: true };
}
