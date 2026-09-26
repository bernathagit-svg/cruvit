/**
 * Catalog Images V1 — active canonical Add Plant identity coverage.
 *
 * Merges PLANT_LIBRARY bootstrap + plants.seed.json + identity registry redirects
 * into a deduplicated canonical image-authority set. Alias-only identities do not
 * receive separate images.
 *
 * Not imported by Suitability / Smart Rec / Garden Design runtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IMAGE_READY as RUNTIME_IMAGE_READY, isApprovedCatalogMediaRecord } from './licensed-catalog-media-runtime-v1.js';

export const CATALOG_IMAGES_COVERAGE_VERSION = '1.0.0';
export const IMAGE_BLOCKED = 'IMAGE_BLOCKED';

/** Wave 1 species packets collapsed onto existing canonicals — never separate image authority. */
export const SPECIES_ALIAS_ONTO_CANONICAL = Object.freeze({
  'english-lavender': 'lavender',
  'bigleaf-hydrangea': 'hydrangea',
  'bell-pepper': 'sweet-pepper'
});

export const WAVE1_NEW_SEED_SLUGS = Object.freeze([
  'strawberry',
  'lettuce',
  'spinach',
  'carrot',
  'broccoli',
  'zucchini',
  'green-bean',
  'garden-pea',
  'watermelon',
  'nasturtium',
  'borage',
  'french-marigold',
  'zinnia',
  'sweet-orange',
  'grapefruit'
]);

export const HIGH_VISIBILITY_GAPS = Object.freeze([
  'mango',
  'pineapple',
  'banana',
  'tomato',
  'cucumber',
  'rose',
  'strawberry',
  'lettuce',
  'spinach',
  'carrot',
  'broccoli',
  'zucchini',
  'green-bean',
  'garden-pea',
  'watermelon',
  'nasturtium',
  'borage',
  'french-marigold',
  'zinnia',
  'sweet-orange',
  'grapefruit'
]);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function unescapeJsString(s) {
  return String(s || '').replace(/\\'/g, "'").replace(/\\n/g, '\n');
}

/**
 * Parse unique PLANT_LIBRARY rows from app.html (slug/name/scientific).
 */
export function parsePlantLibraryIdentities(appHtml) {
  const start = appHtml.indexOf('const PLANT_LIBRARY=[');
  if (start < 0) throw new Error('PLANT_LIBRARY not found');
  let end = appHtml.indexOf('\n];', start);
  if (end < 0) end = appHtml.indexOf('];', start);
  const block = appHtml.slice(start, end);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const slug = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    unique.push({
      slug,
      name: unescapeJsString((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug),
      scientific: unescapeJsString((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || ''),
      source: 'plant-library'
    });
  }
  return unique;
}

export function parseBootstrapAliasRemaps(appHtml) {
  const start = appHtml.indexOf('const BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL={');
  const out = {};
  if (start < 0) return out;
  const end = appHtml.indexOf('};', start);
  const block = appHtml.slice(start, end);
  for (const m of block.matchAll(/'([^']+)':\s*'([^']+)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function registryAliasMap(registry) {
  const aliasToCanonical = {};
  const canonicalSet = new Set();
  for (const entry of registry.canonicalIdentities || []) {
    const canon = String(entry.canonicalSlug || '').trim();
    if (!canon) continue;
    canonicalSet.add(canon);
    for (const a of entry.aliasSlugs || []) {
      const alias = String(a || '').trim();
      if (alias && alias !== canon) aliasToCanonical[alias] = canon;
    }
  }
  return { aliasToCanonical, canonicalSet };
}

/**
 * Resolve a raw Add Plant slug to canonical image-authority slug.
 */
export function resolveCanonicalImageSlug(rawSlug, maps) {
  const key = String(rawSlug || '').trim().toLowerCase();
  if (!key) return key;
  if (SPECIES_ALIAS_ONTO_CANONICAL[key]) return SPECIES_ALIAS_ONTO_CANONICAL[key];
  if (maps.bootstrapAliases[key]) return maps.bootstrapAliases[key];
  if (maps.registryAliases[key]) return maps.registryAliases[key];
  return key;
}

function exactLicensedCacheMedia(root, { slug, scientific } = {}) {
  slug = String(slug || '').trim().toLowerCase();
  scientific = String(scientific || '').trim();
  if (!slug || !scientific) return null;
  if (/\bspp\.?\b/i.test(scientific) || /^various\b/i.test(scientific)) return null;
  const cacheDir = path.join(root, 'data', 'catalog-media', 'cache');
  if (!fs.existsSync(cacheDir)) return null;
  const prefix = slug + '__';
  const files = fs.readdirSync(cacheDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('__v1.0.0.json'))
    .sort();
  for (const name of files) {
    const doc = readJson(path.join(cacheDir, name));
    if (String(doc?.scientific || '').trim().toLowerCase() !== scientific.toLowerCase()) continue;
    const plant = { slug, scientific, identityScope: 'species' };
    const approved = isApprovedCatalogMediaRecord(doc?.media, plant);
    if (String(doc?.status || '') === RUNTIME_IMAGE_READY && approved.ok) {
      return doc.media;
    }
  }
  return null;
}

function approvedPacketIdentities(root) {
  const base = path.join(root, 'data');
  const out = new Map();
  const conflicts = new Set();

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.packet.json')) continue;
      let packet;
      try { packet = readJson(full); } catch { continue; }
      if (packet?.humanApproval?.approvedForIngest !== true) continue;
      const slug = String(packet?.identity?.canonicalSlug || '').trim().toLowerCase();
      const scientific = String(packet?.identity?.acceptedScientificName || '').trim();
      const name = String(packet?.identity?.commonNameEn || slug).trim();
      if (!slug || !scientific) continue;
      if (/\bspp\.?\b/i.test(scientific) || /^various\b/i.test(scientific)) continue;

      const existing = out.get(slug);
      if (existing && existing.scientific.toLowerCase() !== scientific.toLowerCase()) {
        conflicts.add(slug);
        continue;
      }
      out.set(slug, {
        slug,
        scientific,
        name,
        packetId: packet.packetId || null,
        packetPath: path.relative(root, full).replace(/\\/g,'/')
      });
    }
  }

  walk(base);
  for (const slug of conflicts) out.delete(slug);
  return [...out.values()];
}

function mediaStatusForPlant(plant) {
  if (!plant) return { imageStatus: null, approved: false, reason: 'missing-plant' };
  const media = plant.media || plant.catalogMedia || null;
  const approved = isApprovedCatalogMediaRecord(media, plant);
  const status = String(media?.imageStatus || '').trim() || null;
  if (approved.ok) {
    return { imageStatus: RUNTIME_IMAGE_READY, approved: true, reason: null, media };
  }
  if (status === IMAGE_BLOCKED) {
    return {
      imageStatus: IMAGE_BLOCKED,
      approved: false,
      reason: media?.blockedReason || media?.pendingReason || 'image-blocked',
      media
    };
  }
  return {
    imageStatus: status || 'UNRESOLVED',
    approved: false,
    reason: media?.pendingReason || approved.reason || 'no-approved-catalog-media',
    media
  };
}

/**
 * Build the active canonical Add Plant image-coverage set.
 */
export function buildActiveCanonicalImageCoverage(repoRoot = DEFAULT_ROOT) {
  const root = repoRoot;
  const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const seedDoc = readJson(path.join(root, 'data', 'plants.seed.json'));
  const registry = readJson(path.join(root, 'data', 'plant-identity.registry.json'));
  const library = parsePlantLibraryIdentities(appHtml);
  const bootstrapAliases = parseBootstrapAliasRemaps(appHtml);
  const { aliasToCanonical: registryAliases } = registryAliasMap(registry);
  const maps = { bootstrapAliases, registryAliases };

  const seedPlants = Array.isArray(seedDoc.plants) ? seedDoc.plants : [];
  const seedBySlug = new Map(seedPlants.map((p) => [p.slug, p]));
  const indexMedia = seedDoc.catalogMediaByCanonicalSlug && typeof seedDoc.catalogMediaByCanonicalSlug === 'object'
    ? seedDoc.catalogMediaByCanonicalSlug
    : {};

  const identities = new Map();
  const aliasesObserved = [];

  function addExposed(raw, layer, extras = {}) {
    const canonicalSlug = resolveCanonicalImageSlug(raw.slug, maps);
    if (canonicalSlug !== raw.slug) {
      aliasesObserved.push({
        aliasSlug: raw.slug,
        canonicalSlug,
        layer
      });
      return;
    }
    if (!identities.has(canonicalSlug)) {
      identities.set(canonicalSlug, {
        slug: canonicalSlug,
        name: extras.name || raw.name || raw.names?.en || canonicalSlug,
        scientific: extras.scientific || raw.scientific || '',
        layers: new Set([layer]),
        seedPlant: seedBySlug.get(canonicalSlug) || null,
        libraryPlant: layer === 'plant-library' ? raw : null
      });
    } else {
      const cur = identities.get(canonicalSlug);
      cur.layers.add(layer);
      if (layer === 'plant-library') cur.libraryPlant = raw;
      if (!cur.scientific && (extras.scientific || raw.scientific)) {
        cur.scientific = extras.scientific || raw.scientific;
      }
      if (cur.name === canonicalSlug && (extras.name || raw.name || raw.names?.en)) {
        cur.name = extras.name || raw.name || raw.names?.en;
      }
    }
  }

  for (const row of library) {
    addExposed(row, 'plant-library', { name: row.name, scientific: row.scientific });
  }
  for (const p of seedPlants) {
    addExposed(
      { slug: p.slug, name: p.names?.en || p.name, scientific: p.scientific, names: p.names },
      'seed',
      { name: p.names?.en || p.name, scientific: p.scientific }
    );
  }

  // A species may become a canonical identity after being split from a legacy
  // generic alias even when the static PLANT_LIBRARY / seed surface has not yet
  // gained a separate row. Such identities are allowed into active media coverage
  // only when the identity registry is resolved AND an exact-scientific licensed
  // cache record already passes the runtime media contract. No web search, no
  // license inference, and no generic-image inheritance is permitted here.
  for (const entry of registry.canonicalIdentities || []) {
    const slug = String(entry?.canonicalSlug || '').trim().toLowerCase();
    const scientific = String(entry?.acceptedScientificName || '').trim();
    if (!slug || identities.has(slug) || entry?.needsReview === true || !scientific) continue;
    const registryMedia = exactLicensedCacheMedia(root, { slug, scientific });
    if (!registryMedia) continue;
    identities.set(slug, {
      slug,
      name: entry?.localizedNames?.en?.primary?.[0] || slug,
      scientific,
      layers: new Set(['identity-registry-cache']),
      seedPlant: null,
      libraryPlant: null,
      registryMedia
    });
  }

  // Approved catalog-expansion packets are a durable canonical identity authority
  // for plants that may not yet have a PLANT_LIBRARY/seed/identity-registry row.
  // A packet identity is admitted to media coverage only when it is explicitly
  // approvedForIngest, species-level, non-conflicting across packets, and has an
  // exact-scientific licensed cache record that passes the runtime media contract.
  for (const packetIdentity of approvedPacketIdentities(root)) {
    const slug = resolveCanonicalImageSlug(packetIdentity.slug, maps);
    if (!slug || slug !== packetIdentity.slug || identities.has(slug)) continue;
    const packetMedia = exactLicensedCacheMedia(root, {
      slug,
      scientific: packetIdentity.scientific
    });
    if (!packetMedia) continue;
    identities.set(slug, {
      slug,
      name: packetIdentity.name || slug,
      scientific: packetIdentity.scientific,
      layers: new Set(['approved-packet-cache']),
      seedPlant: null,
      libraryPlant: null,
      packetMedia,
      packetId: packetIdentity.packetId,
      packetPath: packetIdentity.packetPath
    });
  }

  const records = [...identities.values()]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((id) => {
      const seedPlant = seedBySlug.get(id.slug) || null;
      const indexRecord = id.registryMedia || id.packetMedia || indexMedia[id.slug] || null;
      const plantForMedia = seedPlant
        ? seedPlant
        : {
            slug: id.slug,
            scientific: id.scientific,
            name: id.name,
            media: indexRecord,
            catalogMedia: indexRecord
          };
      if (!seedPlant && indexRecord) {
        plantForMedia.media = indexRecord;
        plantForMedia.catalogMedia = indexRecord;
      }
      const coverage = mediaStatusForPlant(
        seedPlant
          ? {
              ...seedPlant,
              media: seedPlant.media?.imageStatus === RUNTIME_IMAGE_READY
                ? seedPlant.media
                : indexRecord || seedPlant.media,
              catalogMedia: seedPlant.media?.imageStatus === RUNTIME_IMAGE_READY
                ? seedPlant.media
                : indexRecord || seedPlant.media
            }
          : plantForMedia
      );
      return {
        slug: id.slug,
        name: id.name,
        scientific: id.scientific,
        layers: [...id.layers].sort(),
        inLibrary: !!id.libraryPlant,
        inSeed: !!seedPlant,
        inRegistryCache: !!id.registryMedia,
        inApprovedPacketCache: !!id.packetMedia,
        packetId: id.packetId || null,
        packetPath: id.packetPath || null,
        imageStatus: coverage.imageStatus,
        approved: coverage.approved,
        reason: coverage.reason || null,
        identityScope: /\bspp\.?\b/i.test(id.scientific) || /^various\b/i.test(id.scientific)
          ? 'broad'
          : 'species'
      };
    });

  const ready = records.filter((r) => r.imageStatus === RUNTIME_IMAGE_READY && r.approved);
  const blocked = records.filter((r) => r.imageStatus === IMAGE_BLOCKED);
  const unresolved = records.filter(
    (r) => r.imageStatus !== RUNTIME_IMAGE_READY && r.imageStatus !== IMAGE_BLOCKED
  );

  return {
    version: CATALOG_IMAGES_COVERAGE_VERSION,
    activeCanonicalCount: records.length,
    imageReadyCount: ready.length,
    imageBlockedCount: blocked.length,
    unresolvedCount: unresolved.length,
    records,
    aliasesObserved,
    highVisibility: HIGH_VISIBILITY_GAPS.map((slug) => records.find((r) => r.slug === slug) || {
      slug,
      missingFromActiveSurface: true
    }),
    wave1: WAVE1_NEW_SEED_SLUGS.map((slug) => records.find((r) => r.slug === slug) || {
      slug,
      missingFromActiveSurface: true
    })
  };
}

export function pipelineInputFromCoverageRecord(record, seedBySlug, libraryBySlug) {
  const seed = seedBySlug?.get?.(record.slug);
  const lib = libraryBySlug?.get?.(record.slug);
  return {
    slug: record.slug,
    scientific: seed?.scientific || lib?.scientific || record.scientific,
    commonName: seed?.names?.en || seed?.name || lib?.name || record.name,
    names: seed?.names || { en: record.name },
    identityScope: record.identityScope
  };
}
