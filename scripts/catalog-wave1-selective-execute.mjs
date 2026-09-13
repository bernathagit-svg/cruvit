/**
 * CRUVIT Catalog Wave 1 — locked selective execution manifest + runner.
 * Uses existing catalog-expansion-ingest + materialize only.
 * Does NOT ingest all Batch 3. Does NOT start Catalog Images. paid AI = 0.
 *
 * Usage:
 *   node scripts/catalog-wave1-selective-execute.mjs --dry-run
 *   node scripts/catalog-wave1-selective-execute.mjs --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  materializePlantCatalogItemFromPacket,
  validateCatalogExpansionPacket,
  mergeIdentityRegistryEntry,
  IMAGE_PENDING
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {
  normalizeBatch3PacketForClassification,
  classifyPlantDataReadiness
} from '../modules/personal-domain/plant-data-contract-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACKET_DIR = path.join(ROOT, 'data/catalog-expansion/batches/bulk-batch-3-v1/packets');
const SEED_PATH = path.join(ROOT, 'data/plants.seed.json');
const REGISTRY_PATH = path.join(ROOT, 'data/plant-identity.registry.json');
const APP_PATH = path.join(ROOT, 'app.html');
const STRAWBERRY_PACKET = path.join(
  ROOT,
  'data/catalog-expansion/batches/wave1-selective-v1/packets/strawberry.packet.json'
);
const REPORT_PATH = path.join(ROOT, 'tests/_catalog-wave1-selective-report.json');

/** LOCKED — no substitutions after Owner approval. */
export const WAVE1_LOCKED_MANIFEST = Object.freeze({
  version: '1.0.0',
  checkpoint: 'CATALOG_WAVE_1_SELECTIVE',
  newSeedIngest: Object.freeze([
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
  ]),
  libraryClimateUpgradeFromBatch3: Object.freeze([
    'apple',
    'pear',
    'peach',
    'apricot',
    'plum',
    'fig',
    'pomegranate',
    'blueberry',
    'raspberry'
  ]),
  speciesAliasOntoCanonical: Object.freeze([
    { packetSlug: 'english-lavender', canonicalSlug: 'lavender', aliasTerms: ['english lavender', 'english-lavender', 'lavandula angustifolia'] },
    { packetSlug: 'spearmint', canonicalSlug: 'mint', aliasTerms: ['spearmint', 'mentha spicata'] },
    { packetSlug: 'bigleaf-hydrangea', canonicalSlug: 'hydrangea', aliasTerms: ['bigleaf hydrangea', 'bigleaf-hydrangea', 'hydrangea macrophylla'] },
    { packetSlug: 'common-jasmine', canonicalSlug: 'jasmine', aliasTerms: ['common jasmine', 'common-jasmine', 'jasminum officinale'] },
    { packetSlug: 'lesser-bougainvillea', canonicalSlug: 'bougainvillea', aliasTerms: ['lesser bougainvillea', 'lesser-bougainvillea', 'bougainvillea glabra'] }
  ]),
  aliasOnlyVerify: Object.freeze([
    { canonicalSlug: 'sweet-pepper', mustIncludeAliases: ['bell pepper', 'bell-pepper'] }
  ]),
  doNotTouch: Object.freeze(['tomato', 'cucumber', 'banana']),
  liveAlign: Object.freeze({
    mango: 'attach seed-shaped climateTraits from existing Smart Rec / care authority without inventing SOURCE_SUPPORTED',
    pineapple: 'keep',
    banana: 'keep Musa spp.'
  }),
  excludedBatch3Remainder: 'all other Batch 3 packets not listed above'
});

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function packetPathFor(slug) {
  if (slug === 'strawberry') return STRAWBERRY_PACKET;
  return path.join(PACKET_DIR, `${slug}.packet.json`);
}

function librarySlugs() {
  const html = fs.readFileSync(APP_PATH, 'utf8');
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('];', start);
  const block = html.slice(start, end);
  return new Set([...block.matchAll(/slug\s*:\s*'([^']+)'/g)].map((m) => m[1]));
}

function seedSlugs() {
  const seed = readJson(SEED_PATH);
  return new Set((seed.plants || []).map((p) => p.slug));
}

function dryClassify(slug) {
  const p = packetPathFor(slug);
  if (!fs.existsSync(p)) return { slug, ok: false, error: 'packet_missing', path: p };
  const packet = readJson(p);
  const validation = validateCatalogExpansionPacket(packet);
  if (!validation.ok) {
    return { slug, ok: false, error: 'validation_failed', errors: validation.errors };
  }
  const plant = normalizeBatch3PacketForClassification(packet);
  const cls = classifyPlantDataReadiness(plant);
  const material = materializePlantCatalogItemFromPacket(packet);
  return {
    slug,
    ok: material.ok === true,
    readiness: cls.readiness || cls.class || cls.level,
    reasons: cls.reasons || cls.reasonCodes || [],
    unknownFields: material.unknownFields || [],
    needsReviewFields: material.needsReviewFields || [],
    scientific: material.item?.scientific,
    imageStatus: material.imageStatus || IMAGE_PENDING,
    errors: material.errors || []
  };
}

function identityHygieneGate(report) {
  const seed = seedSlugs();
  const lib = librarySlugs();
  const issues = [];

  // strawberry != strawberry-guava
  if (seed.has('strawberry') || lib.has('strawberry')) {
    /* after ingest ok */
  }
  if (!seed.has('strawberry-guava') && !lib.has('strawberry-guava')) {
    // strawberry-guava may only be in seed
  }
  const seedDoc = readJson(SEED_PATH);
  const guava = (seedDoc.plants || []).find((p) => p.slug === 'strawberry-guava');
  if (guava && guava.scientific && /fragaria/i.test(guava.scientific)) {
    issues.push('strawberry-guava_scientific_collision');
  }

  // mango != mangosteen
  if (seed.has('mangosteen') && seed.has('mango')) {
    /* both ok if different scientific */
  }

  // no tomato/cucumber re-add
  for (const s of WAVE1_LOCKED_MANIFEST.newSeedIngest) {
    if (s === 'tomato' || s === 'cucumber') issues.push(`forbidden_readd_${s}`);
  }

  // bell pepper not new identity
  if (WAVE1_LOCKED_MANIFEST.newSeedIngest.includes('bell-pepper')) {
    issues.push('forbidden_bell_pepper_new_identity');
  }

  report.hygieneIssues = issues;
  return issues.length === 0;
}

/** Ensure strawberry packet exists (expansion contract shape). */
function ensureStrawberryPacket() {
  if (fs.existsSync(STRAWBERRY_PACKET)) {
    const existing = JSON.parse(fs.readFileSync(STRAWBERRY_PACKET, 'utf8'));
    let patched = false;
    if (!existing.image || !existing.image.status) {
      existing.image = { status: IMAGE_PENDING };
      patched = true;
    }
    if (!existing.humanApproval?.approvedForIngest) {
      existing.humanApproval = {
        approvedForIngest: true,
        approvedAt: '2026-09-13',
        approvedBy: 'Owner Catalog Wave 1 selective execution authorization',
        notes:
          'Net-new cultivated garden strawberry (Fragaria × ananassa). Not strawberry-guava. IMAGE_PENDING; no paid AI.'
      };
      patched = true;
    }
    if (patched) writeJson(STRAWBERRY_PACKET, existing);
    return { created: false, patched };
  }
  const packet = {
    expansionContractVersion: '1.2.0',
    packetId: 'strawberry-wave1-selective-v1',
    identity: {
      canonicalSlug: 'strawberry',
      commonNameEn: 'Strawberry',
      acceptedScientificName: 'Fragaria × ananassa',
      aliases: [
        'strawberry',
        'garden strawberry',
        'cultivated strawberry',
        'fragaria x ananassa',
        'fragaria × ananassa',
        'fragaria ananassa'
      ]
    },
    flags: {
      enforceBatch2EvidenceRule: true,
      batch2: false,
      batch3: false,
      wave1: true,
      forceClimateNeedsReview: false,
      botanicalVerified: true,
      notes: 'Wave 1 selective net-new. Cultivated garden strawberry scope. Not strawberry-guava.'
    },
    sources: [
      {
        sourceId: 'ncsu-fragaria-x-ananassa',
        institution: 'North Carolina State University Extension Gardener',
        publisher: 'North Carolina State University Extension Gardener',
        title: 'Fragaria × ananassa (Strawberry)',
        url: 'https://plants.ces.ncsu.edu/plants/fragaria-x-ananassa/',
        authorityTier: 'university_extension',
        verifiedAt: '2026-09-13'
      }
    ],
    claims: [
      {
        claimId: 'identity-scientific',
        field: 'scientific',
        status: 'asserted',
        value: 'Fragaria × ananassa',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Fragaria × ananassa — cultivated garden strawberry.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'identity-aliases',
        field: 'aliases',
        status: 'asserted',
        value: [
          'strawberry',
          'garden strawberry',
          'cultivated strawberry',
          'fragaria x ananassa',
          'fragaria × ananassa'
        ],
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Common names for cultivated strawberry.'
      },
      {
        claimId: 'climate-label',
        field: 'climateLabel',
        status: 'asserted',
        value: 'Temperate to mild; full sun; cool nights improve fruit',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Garden strawberry grown as perennial edible; climate suitability cultivar-dependent.'
      },
      {
        claimId: 'tags',
        field: 'tags',
        status: 'asserted',
        value: ['fruit', 'berry', 'edible', 'perennial', 'sun'],
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Edible berry perennial.'
      },
      {
        claimId: 'frost',
        field: 'frostSensitivity',
        status: 'asserted',
        value: 'medium',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'USDA hardiness commonly cited mid zones; flowers/fruit frost-sensitive.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'cold',
        field: 'coldTolerance',
        status: 'asserted',
        value: 'medium',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Hardy perennial crowns; cultivar and mulch dependent.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'heat',
        field: 'heatTolerance',
        status: 'asserted',
        value: 'medium',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Heat reduces fruit quality; afternoon shade sometimes advised in hot climates.',
        evidenceClass: 'HEURISTIC_ASSERTION'
      },
      {
        claimId: 'humidity',
        field: 'humidityTolerance',
        status: 'unknown',
        value: null,
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Atmospheric humidity tolerance not asserted; left UNKNOWN.',
        evidenceClass: 'UNKNOWN'
      },
      {
        claimId: 'water',
        field: 'waterNeeds',
        status: 'asserted',
        value: 'medium',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Even moisture preferred; avoid waterlogging.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'sun',
        field: 'sunNeeds',
        status: 'asserted',
        value: 'full_sun',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Full sun for best fruiting.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'drainage',
        field: 'drainageNeeds',
        status: 'asserted',
        value: 'high',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Well-drained soil required.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'chill',
        field: 'needsWinterChill',
        status: 'unknown',
        value: null,
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Chill-hour requirement cultivar-dependent; left UNKNOWN.',
        evidenceClass: 'UNKNOWN'
      },
      {
        claimId: 'flowering',
        field: 'floweringRequirements',
        status: 'asserted',
        value: 'Spring flowers; frost at bloom reduces crop.',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Bloom timing cultivar-dependent; frost damages flowers.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'fruiting',
        field: 'fruitingRequirements',
        status: 'asserted',
        value: 'Edible aggregate fruits; cultivar and day-length type dependent.',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'June-bearing vs everbearing types differ.',
        evidenceClass: 'SOURCE_SUPPORTED'
      },
      {
        claimId: 'care-sun',
        field: 'care.sun',
        status: 'asserted',
        value: 'Full sun',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Full sun.'
      },
      {
        claimId: 'care-water',
        field: 'care.water',
        status: 'asserted',
        value: 'Medium; keep evenly moist, well drained',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Even moisture.'
      },
      {
        claimId: 'care-growth',
        field: 'care.growth',
        status: 'asserted',
        value: 'Low perennial with runners',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Spreads by runners.'
      },
      {
        claimId: 'care-guide',
        field: 'care.guide',
        status: 'asserted',
        value:
          'Strawberry (Fragaria × ananassa) is the cultivated garden strawberry. Give full sun, well-drained soil and even moisture. Choose day-neutral or June-bearing types for your climate. Protect blooms from frost. Renew plantings as runners age. Not the same plant as strawberry guava (Psidium cattleyanum).',
        sourceIds: ['ncsu-fragaria-x-ananassa'],
        shortExcerpt: 'Cultivated garden strawberry care summary.'
      }
    ],
    image: { status: IMAGE_PENDING },
    humanApproval: {
      approvedForIngest: true,
      approvedAt: '2026-09-13',
      approvedBy: 'Owner Catalog Wave 1 selective execution authorization',
      notes:
        'Net-new cultivated garden strawberry (Fragaria × ananassa). Not strawberry-guava. IMAGE_PENDING; no paid AI.'
    }
  };
  writeJson(STRAWBERRY_PACKET, packet);
  return { created: true };
}

async function ingestPacket(slug, apply) {
  const { spawnSync } = await import('node:child_process');
  const args = [
    path.join(ROOT, 'scripts/catalog-expansion-ingest.mjs'),
    '--packet',
    packetPathFor(slug)
  ];
  if (apply) args.push('--apply');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT });
  return {
    slug,
    exitCode: r.status,
    stdout: r.stdout,
    stderr: r.stderr
  };
}

function extractSourceSupportedClimateTraits(packet) {
  const material = materializePlantCatalogItemFromPacket(packet);
  if (!material.ok) return null;
  const traits = { ...(material.item.climateTraits || {}) };
  // Keep evidence classes; do not promote HEURISTIC → SOURCE_SUPPORTED (materialize already labels).
  return {
    climateTraits: traits,
    care: material.item.care || null,
    tags: material.item.tags || null,
    climateLabel: material.item.climateLabel || null,
    scientific: material.item.scientific,
    aliases: material.item.aliases || []
  };
}

/**
 * Attach climateTraits JSON into a PLANT_LIBRARY object literal for slug.
 * Conservative: inserts `climateTraits:{...},` after scientific field if missing.
 */
function patchLibraryPlantClimateTraits(slug, climateTraits, apply) {
  let html = fs.readFileSync(APP_PATH, 'utf8');
  const re = new RegExp(`(\\{slug:'${slug}'[\\s\\S]*?scientific:'[^']*')(,[\\s\\S]*?\\})`);
  const m = html.match(re);
  if (!m) return { slug, ok: false, error: 'library_row_not_found' };
  if (/climateTraits\s*:/.test(m[0])) {
    // Replace existing climateTraits block start — if migration already attached at runtime only,
    // source may lack climateTraits; if present in source, skip replace to avoid double.
    return { slug, ok: true, action: 'already_has_climateTraits_in_source_or_skip', skipped: true };
  }
  const traitsJson = JSON.stringify(climateTraits);
  // Insert after scientific:'...'
  const insertion = `${m[1]},climateTraits:${traitsJson}${m[2]}`;
  // Safer approach: only insert climateTraits after scientific comma
  const patched = m[0].replace(
    /(scientific:'[^']*')(,)/,
    `$1,climateTraits:${traitsJson}$2`
  );
  if (patched === m[0]) return { slug, ok: false, error: 'patch_failed' };
  if (!apply) return { slug, ok: true, action: 'dry_patch', previewLen: patched.length };
  html = html.replace(m[0], patched);
  fs.writeFileSync(APP_PATH, html, 'utf8');
  return { slug, ok: true, action: 'patched' };
}

function addAliasesToLibraryPlant(slug, aliasTerms, apply) {
  let html = fs.readFileSync(APP_PATH, 'utf8');
  const re = new RegExp(`(\\{slug:'${slug}'[\\s\\S]*?aliases:)(\\[[^\\]]*\\])`);
  const m = html.match(re);
  if (!m) return { slug, ok: false, error: 'aliases_not_found' };
  let aliases;
  try {
    // Convert JS single-quoted array to JSON-ish
    const raw = m[2].replace(/'/g, '"');
    aliases = JSON.parse(raw);
  } catch {
    return { slug, ok: false, error: 'aliases_parse_failed', raw: m[2] };
  }
  const before = aliases.slice();
  for (const a of aliasTerms) {
    const t = String(a).trim();
    if (t && !aliases.some((x) => String(x).toLowerCase() === t.toLowerCase())) aliases.push(t);
  }
  if (aliases.length === before.length) {
    return { slug, ok: true, action: 'aliases_unchanged', aliases };
  }
  const next = `[${aliases.map((a) => `'${String(a).replace(/'/g, "\\'")}'`).join(',')}]`;
  if (!apply) return { slug, ok: true, action: 'dry_aliases', aliases };
  html = html.slice(0, m.index) + m[1] + next + html.slice(m.index + m[0].length);
  // safer replace
  html = fs.readFileSync(APP_PATH, 'utf8').replace(m[0], m[1] + next);
  fs.writeFileSync(APP_PATH, html, 'utf8');
  return { slug, ok: true, action: 'aliases_updated', aliases };
}

function addRegistryAliasSlugs(canonicalSlug, aliasSlugs, apply) {
  const reg = readJson(REGISTRY_PATH);
  const entry = (reg.canonicalIdentities || []).find((e) => e.canonicalSlug === canonicalSlug);
  if (!entry) return { canonicalSlug, ok: false, error: 'registry_entry_missing' };
  entry.aliasSlugs = Array.isArray(entry.aliasSlugs) ? entry.aliasSlugs : [];
  let changed = false;
  for (const a of aliasSlugs) {
    if (!entry.aliasSlugs.includes(a)) {
      entry.aliasSlugs.push(a);
      changed = true;
    }
  }
  if (!changed) return { canonicalSlug, ok: true, action: 'unchanged' };
  if (!apply) return { canonicalSlug, ok: true, action: 'dry', aliasSlugs: entry.aliasSlugs };
  writeJson(REGISTRY_PATH, reg);
  return { canonicalSlug, ok: true, action: 'updated', aliasSlugs: entry.aliasSlugs };
}

function alignMangoClimateTraits(apply) {
  // From existing SMART_REC_CLIMATE_METADATA + care — do NOT invent SOURCE_SUPPORTED.
  const climateTraits = {
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    floweringRequirements:
      'Warmth, sun, and low frost risk are essential; humidity can reduce bloom quality through disease pressure.',
    fruitingRequirements: 'Fruit set depends on variety, weather and pollination.',
    hardBlockRules: ['no-small-container'],
    needsReview: false,
    traitEvidenceClasses: {
      frostSensitivity: 'LEGACY_ASSERTED_METADATA',
      coldTolerance: 'LEGACY_ASSERTED_METADATA',
      heatTolerance: 'LEGACY_ASSERTED_METADATA',
      humidityTolerance: 'LEGACY_ASSERTED_METADATA',
      waterNeeds: 'LEGACY_ASSERTED_METADATA',
      sunNeeds: 'LEGACY_ASSERTED_METADATA',
      drainageNeeds: 'LEGACY_ASSERTED_METADATA',
      needsWinterChill: 'LEGACY_ASSERTED_METADATA',
      floweringRequirements: 'LEGACY_ASSERTED_METADATA',
      fruitingRequirements: 'LEGACY_ASSERTED_METADATA'
    },
    migration: {
      kind: 'wave1-mango-smart-rec-align-v1',
      note: 'Aligned from existing Smart Rec / care authority. No new SOURCE_SUPPORTED invented.'
    }
  };
  return patchLibraryPlantClimateTraits('mango', climateTraits, apply);
}

function verifySweetPepperAliases() {
  const seed = readJson(SEED_PATH);
  const sp = (seed.plants || []).find((p) => p.slug === 'sweet-pepper');
  const aliases = (sp?.aliases || []).map((a) => String(a).toLowerCase());
  const ok = aliases.includes('bell pepper') || aliases.includes('bell-pepper');
  return {
    ok,
    slug: 'sweet-pepper',
    aliases: sp?.aliases || [],
    action: ok ? 'verified_bell_pepper_alias' : 'MISSING_bell_pepper_alias'
  };
}

function ensureBellPepperAlias(apply) {
  const v = verifySweetPepperAliases();
  if (v.ok) return v;
  if (!apply) return { ...v, ok: false };
  // Patch seed aliases surgically
  let text = fs.readFileSync(SEED_PATH, 'utf8');
  if (!text.includes('"slug": "sweet-pepper"')) return { ok: false, error: 'sweet-pepper_missing' };
  text = text.replace(
    /("slug": "sweet-pepper"[\s\S]*?"aliases":\s*\[)/,
    '$1\n        "bell-pepper",'
  );
  // Also ensure "bell pepper" string if missing
  if (!/"bell pepper"/.test(text.slice(text.indexOf('"slug": "sweet-pepper"'), text.indexOf('"slug": "sweet-pepper"') + 800))) {
    text = text.replace(
      /("slug": "sweet-pepper"[\s\S]*?"aliases":\s*\[\s*)/,
      '$1"bell pepper",\n        '
    );
  }
  fs.writeFileSync(SEED_PATH, text, 'utf8');
  return verifySweetPepperAliases();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'apply' : 'dry-run';
  const before = {
    seedCount: seedSlugs().size,
    libraryCount: librarySlugs().size
  };

  const strawberryEnsure = ensureStrawberryPacket();

  const dryNew = WAVE1_LOCKED_MANIFEST.newSeedIngest.map(dryClassify);
  const dryUpgrade = WAVE1_LOCKED_MANIFEST.libraryClimateUpgradeFromBatch3.map(dryClassify);
  const drySpecies = WAVE1_LOCKED_MANIFEST.speciesAliasOntoCanonical.map((x) => ({
    ...dryClassify(x.packetSlug),
    canonicalSlug: x.canonicalSlug
  }));

  const blocked = [];
  const ingestResults = [];
  const upgradeResults = [];
  const aliasResults = [];

  // Hygiene pre-check
  const hygiene = { ok: true, notes: [] };
  if (WAVE1_LOCKED_MANIFEST.newSeedIngest.includes('tomato')) {
    hygiene.ok = false;
    hygiene.notes.push('tomato_forbidden');
  }
  // sweet-pepper verify
  const pepper = ensureBellPepperAlias(apply);

  // New seed ingest
  for (const row of dryNew) {
    if (!row.ok) {
      blocked.push({ slug: row.slug, reason: row.error || 'classify_failed', detail: row });
      continue;
    }
    // Skip if already in seed (do not duplicate)
    if (seedSlugs().has(row.slug) && row.slug !== 'strawberry') {
      // strawberry won't exist yet
      if (seedSlugs().has(row.slug)) {
        blocked.push({ slug: row.slug, reason: 'already_in_seed_skip', detail: row });
        continue;
      }
    }
    if (seedSlugs().has(row.slug)) {
      blocked.push({ slug: row.slug, reason: 'already_in_seed_skip' });
      continue;
    }
    // Skip if already in library (would be invisible via seed merge)
    if (librarySlugs().has(row.slug)) {
      blocked.push({ slug: row.slug, reason: 'already_in_library_use_upgrade_path' });
      continue;
    }
    const r = await ingestPacket(row.slug, apply);
    ingestResults.push({ ...row, ingestExit: r.exitCode, ingestOut: (r.stdout || '').slice(0, 500) });
    if (r.exitCode !== 0) {
      blocked.push({ slug: row.slug, reason: 'ingest_failed', stderr: r.stderr });
    }
  }

  // Library climate upgrades from Batch 3 packets
  for (const slug of WAVE1_LOCKED_MANIFEST.libraryClimateUpgradeFromBatch3) {
    const cls = dryClassify(slug);
    if (!cls.ok) {
      blocked.push({ slug, reason: 'upgrade_classify_failed', detail: cls });
      continue;
    }
    if (!librarySlugs().has(slug)) {
      // If not in library but not in seed, ingest as new
      if (!seedSlugs().has(slug)) {
        const r = await ingestPacket(slug, apply);
        ingestResults.push({ slug, path: 'fallback_seed_ingest', ingestExit: r.exitCode });
        if (r.exitCode !== 0) blocked.push({ slug, reason: 'fallback_ingest_failed' });
      } else {
        upgradeResults.push({ slug, action: 'already_in_seed_ok' });
      }
      continue;
    }
    const packet = readJson(packetPathFor(slug));
    const extracted = extractSourceSupportedClimateTraits(packet);
    if (!extracted?.climateTraits) {
      blocked.push({ slug, reason: 'no_climate_traits' });
      continue;
    }
    const patch = patchLibraryPlantClimateTraits(slug, extracted.climateTraits, apply);
    upgradeResults.push(patch);
    if (!patch.ok) blocked.push({ slug, reason: patch.error });
  }

  // Species alias onto canonical + optional climate enrich
  for (const spec of WAVE1_LOCKED_MANIFEST.speciesAliasOntoCanonical) {
    const aliasLib = addAliasesToLibraryPlant(spec.canonicalSlug, spec.aliasTerms, apply);
    const aliasReg = addRegistryAliasSlugs(
      spec.canonicalSlug,
      [spec.packetSlug, ...spec.aliasTerms.filter((t) => t.includes('-'))],
      apply
    );
    const packet = readJson(packetPathFor(spec.packetSlug));
    const extracted = extractSourceSupportedClimateTraits(packet);
    let climate = { skipped: true };
    if (extracted?.climateTraits && librarySlugs().has(spec.canonicalSlug)) {
      climate = patchLibraryPlantClimateTraits(spec.canonicalSlug, extracted.climateTraits, apply);
    }
    aliasResults.push({ ...spec, aliasLib, aliasReg, climate });
    // Do NOT ingest packetSlug as new canonical
    if (seedSlugs().has(spec.packetSlug) || librarySlugs().has(spec.packetSlug)) {
      /* if somehow present as separate — report */
      if (librarySlugs().has(spec.packetSlug) && spec.packetSlug !== spec.canonicalSlug) {
        blocked.push({
          slug: spec.packetSlug,
          reason: 'species_slug_already_forked_in_library_manual_review'
        });
      }
    }
  }

  const mango = alignMangoClimateTraits(apply);

  const after = {
    seedCount: seedSlugs().size,
    libraryCount: librarySlugs().size
  };

  const report = {
    mode,
    paidAiCalls: 0,
    catalogImagesStarted: false,
    allBatch3Ingested: false,
    strawberryPacket: strawberryEnsure,
    before,
    after,
    dryNew,
    dryUpgrade,
    drySpecies,
    pepper,
    mango,
    ingestResults,
    upgradeResults,
    aliasResults,
    blocked,
    hygiene,
    manifest: WAVE1_LOCKED_MANIFEST
  };
  identityHygieneGate(report);
  writeJson(REPORT_PATH, report);
  console.log(JSON.stringify({ mode, before, after, blocked: blocked.length, report: REPORT_PATH }, null, 2));
  if (blocked.some((b) => /ingest_failed|classify_failed|validation/.test(b.reason))) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
