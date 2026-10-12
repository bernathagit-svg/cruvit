/**
 * Shared, synchronous slug authority for Smart Rec and Catalog Images.
 * Identity Registry is the only editorial source. The imported projection is
 * generated and byte-checked against that registry; it is not a second registry.
 * No fetch, Node built-ins, writes, scientific guessing, or approval decisions.
 */
import { CANONICAL_ALIAS_DATA } from './canonical-alias-authority-data-v1.js';
import { resolvePlantIdentity } from './plant-identity-resolver.js';

export const CANONICAL_ALIAS_AUTHORITY_VERSION = '1.0.0';
const owns = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
export const normalizeCanonicalSlug = (value) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** Pure deterministic projection. Invalid/colliding aliases fail instead of guessing. */
export function deriveCanonicalAliasAuthority(registry, registrySha256 = null) {
  if (!registry || registry.schemaVersion !== 1 || !registry.registryVersion
      || !Array.isArray(registry.canonicalIdentities)) {
    throw new Error('CANONICAL_ALIAS_INVALID_REGISTRY');
  }
  const canonical = new Set();
  for (const entry of registry.canonicalIdentities) {
    const slug = normalizeCanonicalSlug(entry?.canonicalSlug);
    if (!validSlug(slug) || canonical.has(slug)) throw new Error('CANONICAL_ALIAS_INVALID_OR_DUPLICATE_SLUG:' + slug);
    canonical.add(slug);
  }
  const aliases = {};
  for (const entry of registry.canonicalIdentities) {
    const target = normalizeCanonicalSlug(entry.canonicalSlug);
    if (entry.aliasSlugs != null && !Array.isArray(entry.aliasSlugs)) {
      throw new Error('CANONICAL_ALIAS_INVALID_ALIAS_LIST:' + target);
    }
    for (const raw of entry.aliasSlugs || []) {
      const alias = normalizeCanonicalSlug(raw);
      if (!validSlug(alias) || canonical.has(alias)) {
        throw new Error('CANONICAL_ALIAS_CANONICAL_COLLISION:' + alias);
      }
      if (owns(aliases, alias)) throw new Error('CANONICAL_ALIAS_DUPLICATE_CLAIM:' + alias);
      aliases[alias] = target;
    }
  }
  return Object.freeze({
    policyVersion: CANONICAL_ALIAS_AUTHORITY_VERSION,
    sourcePath: 'data/plant-identity.registry.json',
    registryVersion: String(registry.registryVersion),
    registrySha256,
    canonicalSlugs: Object.freeze([...canonical].sort()),
    aliases: Object.freeze(Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))
  });
}

export const CANONICAL_ALIAS_AUTHORITY = CANONICAL_ALIAS_DATA;
export const REGISTRY_ALIAS_TO_CANONICAL = CANONICAL_ALIAS_DATA.aliases;

/**
 * Legacy export views, not separate alias definitions. This key list preserves
 * the old bootstrap/species API split; every target comes only from Registry.
 */
const BOOTSTRAP_KEYS = new Set(['apple-tree', 'pear-tree', 'peach-tree', 'plum-tree',
  'fig-tree', 'grape-vine', 'passion-fruit']);
export const BOOTSTRAP_ALIAS_TO_CANONICAL = Object.freeze(Object.fromEntries(
  Object.entries(REGISTRY_ALIAS_TO_CANONICAL).filter(([key]) => BOOTSTRAP_KEYS.has(key))
));
export const SPECIES_ALIAS_TO_CANONICAL = Object.freeze(Object.fromEntries(
  Object.entries(REGISTRY_ALIAS_TO_CANONICAL).filter(([key]) => !BOOTSTRAP_KEYS.has(key))
));

/** Unknown keys remain unchanged, not approved. Caller maps cannot override Registry. */
export function resolveCanonicalAliasSlug(rawSlug, authority = CANONICAL_ALIAS_AUTHORITY) {
  const key = normalizeCanonicalSlug(rawSlug);
  if (!key) return '';
  if (authority.canonicalSlugs.includes(key)) return key;
  return owns(authority.aliases, key) ? authority.aliases[key] : key;
}

/**
 * Strict runtime read boundary. Unlike the compatibility alias API above,
 * unknown inputs never become catalog keys. Resolve each identity hint alone:
 * the foundation resolver's precedence must not hide conflicting stored keys.
 * Names/care descriptions cannot override an explicit registered identity.
 * Before the full Registry loads, only its checked-in slug projection is usable.
 */
export function resolveCanonicalReadSlug(input, options = {}) {
  const present = value => value != null && value !== '';
  const resolveOne = value => {
    if (typeof value !== 'string' || !value.trim()) return '';
    const key = value.trim();
    const result = resolvePlantIdentity(key, options);
    if (result.status === 'resolved_id' || result.status === 'resolved_canonical') {
      return CANONICAL_ALIAS_AUTHORITY.canonicalSlugs.includes(result.canonicalSlug)
        ? result.canonicalSlug : '';
    }
    if (result.status === 'ambiguous' || result.status === 'pending_conflict') return '';
    const slug = resolveCanonicalAliasSlug(key);
    return CANONICAL_ALIAS_AUTHORITY.canonicalSlugs.includes(slug) ? slug : '';
  };
  if (typeof input === 'string') return resolveOne(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const keys = [input.plantId, input.canonicalSlug, input.profileSlug,
    input.profile_slug, input.slug, input.meta?.slug].filter(present);
  const scientific = [input.scientific, input.scientificName, input.scientific_name,
    input.latin, input.species].filter(present);
  const hints = keys.length ? keys : scientific.length ? scientific
    : [input.localizedName, input.name].filter(present);
  if (!hints.length) return '';
  const slugs = hints.map(resolveOne);
  if (slugs.some(slug => !slug || slug !== slugs[0])) return '';
  // A recognized contradictory botanical hint is a conflict. Unregistered care
  // prose is descriptive only (e.g. "Rubus idaeus / Rubus spp.").
  if (keys.length) for (const value of scientific) {
    const result = resolvePlantIdentity({ scientific: value }, options);
    if (result.status === 'ambiguous' || result.status === 'pending_conflict'
        || (result.canonicalSlug && result.canonicalSlug !== slugs[0])) return '';
  }
  return slugs[0];
}
