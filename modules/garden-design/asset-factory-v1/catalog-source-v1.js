/**
 * Local canonical catalog loader for Design Asset Factory dry-run.
 * Identity registry is the canonical set. Seed + PLANT_LIBRARY attach descriptive traits.
 * No network. Not a handwritten plant-name production list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from './variant-demand-v1.js';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function unescapeJsString(s) {
  return String(s == null ? '' : s).replace(/\\'/g, "'").replace(/\\n/g, '\n');
}

export function parsePlantLibraryRows(appHtml) {
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
    const tagsRaw = (one.match(/tags:\[([^\]]*)\]/) || [])[1] || '';
    const tags = tagsRaw
      .split(',')
      .map((t) => unescapeJsString(t.replace(/'/g, '').trim()))
      .filter(Boolean);
    unique.push({
      slug,
      canonicalSlug: slug,
      name: unescapeJsString((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug),
      scientific: unescapeJsString((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || ''),
      tags,
      growth: unescapeJsString((one.match(/growth:'((?:\\'|[^'])*)'/) || [])[1] || ''),
      source: 'plant-library'
    });
  }
  return unique;
}

function normalizeSeedPlant(raw) {
  if (!raw) return null;
  return {
    slug: raw.slug,
    canonicalSlug: raw.canonicalSlug || raw.slug,
    name: raw.name || raw.names?.en || raw.slug,
    scientific: raw.scientific || raw.scientificName || null,
    tags: raw.tags || [],
    growth: raw.growth || raw.care?.growth,
    care: raw.care,
    climateTraits: raw.climateTraits,
    identityScope: raw.identityScope || raw.media?.identityScope || null,
    aliases: raw.aliases || [],
    source: 'plants.seed.json'
  };
}

export function loadOwnedGardenSignals(ownedDoc) {
  const rows = Array.isArray(ownedDoc?.garden_plants)
    ? ownedDoc.garden_plants
    : Array.isArray(ownedDoc?.plants)
      ? ownedDoc.plants
      : [];
  const slugs = [];
  const plants = [];
  for (const row of rows) {
    const slug = slugify(row.canonicalSlug || row.profile_slug || row.slug);
    if (!slug) continue;
    slugs.push(slug);
    plants.push({
      gardenPlantId: row.id || row.garden_plant_id || null,
      canonicalSlug: slug,
      name: row.name || slug
    });
  }
  return {
    gardenLabel: ownedDoc?.garden?.label || ownedDoc?.label || null,
    ownedCanonicalSlugs: slugs,
    ownedPlants: plants,
    source: ownedDoc?.source || 'garden-os-snapshot'
  };
}

export function loadCanonicalCatalog(root) {
  const identity = readJson(path.join(root, 'data', 'plant-identity.registry.json'));
  const seedRaw = readJson(path.join(root, 'data', 'plants.seed.json'));
  const seedList = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const seedBySlug = new Map();
  for (const row of seedList) {
    const n = normalizeSeedPlant(row);
    if (n?.slug) seedBySlug.set(slugify(n.slug), n);
  }
  const appHtml = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const libraryBySlug = new Map();
  for (const row of parsePlantLibraryRows(appHtml)) {
    libraryBySlug.set(slugify(row.slug), row);
  }
  const duplicateSlugs = new Set(
    (identity.duplicateConflicts || []).map((c) => slugify(c.slug)).filter(Boolean)
  );
  const plants = [];
  for (const entry of identity.canonicalIdentities || []) {
    const slug = slugify(entry.canonicalSlug);
    if (!slug) continue;
    const seed = seedBySlug.get(slug);
    const lib = libraryBySlug.get(slug);
    const scientific =
      entry.acceptedScientificName || seed?.scientific || lib?.scientific || null;
    const genusOnly =
      entry.needsReview === true && !entry.acceptedScientificName
        ? true
        : /\bspp\.?\b/i.test(String(scientific || '')) || /^various\b/i.test(String(scientific || ''));
    plants.push({
      slug,
      canonicalSlug: slug,
      name: seed?.name || lib?.name || slug,
      scientific,
      acceptedScientificName: entry.acceptedScientificName || null,
      tags: seed?.tags?.length ? seed.tags : lib?.tags || [],
      growth: seed?.growth || lib?.growth || '',
      care: seed?.care,
      climateTraits: seed?.climateTraits,
      identityScope: genusOnly ? 'genus' : seed?.identityScope || 'species',
      identityNeedsReview: entry.needsReview === true,
      duplicateConflict: duplicateSlugs.has(slug),
      aliases: seed?.aliases || entry.aliasSlugs || [],
      descriptiveSource: seed ? seed.source : lib ? lib.source : 'identity-registry-only'
    });
  }
  return {
    identityRegistryVersion: identity.registryVersion || null,
    plants,
    duplicateConflictSlugs: [...duplicateSlugs]
  };
}

export function designSurfacedSlugs(registry = {}) {
  return (registry.sets || [])
    .map((s) => slugify(s.canonicalSlug))
    .filter(Boolean);
}
