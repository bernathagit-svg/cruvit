/**
 * SAFE bootstrap climateTraits structural migration proofs.
 * No enrichment / Batch 3 / identity-conflict resolution.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  META_AUTHORITY,
  plantHasCanonicalClimateTraits,
  resolveSmartRecClimateMetaForPlant
} from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';
import {
  applyBootstrapSafeClimateTraitsMigration,
  getBootstrapSafeClimateTraitsMigrationPayload
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import {
  classifyPlantDataReadiness,
  PLANT_DATA_READINESS,
  VALUE_ORIGIN
} from '../modules/personal-domain/plant-data-contract-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const EXPECTED_SAFE = [
  'aloe-vera',
  'apricot',
  'avocado',
  'basil',
  'black-eyed-susan-vine',
  'cycas',
  'cyclamen',
  'date-palm',
  'ficus-benjamina',
  'guava',
  'hibiscus',
  'hydrangea',
  'lavender',
  'lemon',
  'lychee',
  'mandarin',
  'mango',
  'monstera',
  'olive',
  'orange',
  'pomegranate',
  'queen-palm',
  'raspberry',
  'rosemary',
  'strawberry-guava',
  'strelitzia'
];

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return Array.isArray(raw) ? raw : raw.plants || [];
}

function bootstrapEntriesFromApp() {
  const app = fs.readFileSync(APP, 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('];', libStart);
  const libBlock = app.slice(libStart, libEnd);
  const entries = [];
  const parts = libBlock.split(/\{slug:'/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const slug = (chunk.match(/slug:'([^']+)'/) || [])[1];
    const name = (chunk.match(/name:'((?:\\'|[^'])*)'/) || [])[1];
    const scientific = (chunk.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1];
    if (slug) {
      entries.push({
        slug: slug.toLowerCase(),
        name: String(name || slug).replace(/\\'/g, "'"),
        scientific: String(scientific || '').replace(/\\'/g, "'"),
        climateTraits: undefined
      });
    }
  }
  return entries;
}

function shortClass(r) {
  if (r.readinessShort) return r.readinessShort;
  const map = {
    [PLANT_DATA_READINESS.A_REAL_SUITABILITY_READY]: 'A',
    [PLANT_DATA_READINESS.B_PARTIAL_OUTCOME_READY]: 'B',
    [PLANT_DATA_READINESS.C_BASIC_CLIMATE_ONLY]: 'C',
    [PLANT_DATA_READINESS.D_NOT_PRODUCT_READY]: 'D'
  };
  return map[r.readiness] || '?';
}

test('PHASE1: SAFE set re-derives to exactly 26 expected slugs', () => {
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  assert.equal(payload.safeCount, 26);
  assert.deepEqual(payload.safeSlugs, EXPECTED_SAFE);
  assert.equal(payload.conflictCount, 26);
  assert.ok(!payload.safeSlugs.includes('pineapple'));
  assert.ok(!payload.safeSlugs.includes('fig'));
  assert.ok(!payload.safeSlugs.includes('apple-tree'));
});

test('app.html wires sync migration before climate meta use', () => {
  const html = fs.readFileSync(APP, 'utf8');
  assert.match(html, /bootstrap-safe-climate-traits-migration-data-v1\.browser\.js/);
  assert.match(html, /bootstrap-unlocked-six-climate-traits-migration-data-v1\.browser\.js/);
  assert.match(html, /applyBootstrapStructuralClimateTraitsMigrationsInline/);
  assert.match(html, /__CRUVIT_BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1/);
  assert.match(html, /__CRUVIT_BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1/);
  const idxLib = html.indexOf('const PLANT_INDEX=');
  const idxApply = html.indexOf('applyBootstrapStructuralClimateTraitsMigrationsInline');
  const idxMeta = html.indexOf('function smartRecClimateMetaForPlant');
  assert.ok(idxLib >= 0 && idxApply > idxLib && idxMeta > idxApply);
});

test('A. lavender: canonical authority + explicit legacy values + no synthetic promotion', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, p]));
  const beforeMeta = resolveSmartRecClimateMetaForPlant(index.lavender, {
    legacyInlineTable: {
      lavender: {
        frostSensitivity: 'low',
        coldTolerance: 'medium',
        heatTolerance: 'medium',
        humidityTolerance: 'low',
        drainageNeeds: 'high',
        sunNeeds: 'full_sun',
        waterNeeds: 'low',
        floweringRequirements: 'Needs strong sun, lean drainage, and low humidity for best flowering.',
        groupIds: ['humid-sensitive-mediterranean']
      }
    }
  });
  assert.equal(beforeMeta?._metaAuthority, META_AUTHORITY.LEGACY_INLINE_SMART_REC);

  const result = applyBootstrapSafeClimateTraitsMigration(library, index);
  assert.equal(result.appliedCount, 26);
  assert.ok(result.appliedSlugs.includes('lavender'));

  const lav = index.lavender;
  assert.equal(plantHasCanonicalClimateTraits(lav), true);
  const after = resolveSmartRecClimateMetaForPlant(lav, {
    legacyInlineTable: {
      lavender: { frostSensitivity: 'high', humidityTolerance: 'high' } // poisoned legacy must not win
    }
  });
  assert.equal(after._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(after.frostSensitivity, 'low');
  assert.equal(after.humidityTolerance, 'low');
  assert.equal(after.drainageNeeds, 'high');
  assert.equal(lav.climateTraits.fieldOrigins.frostSensitivity, VALUE_ORIGIN.LEGACY_ASSERTED_METADATA);
  assert.equal(lav.climateTraits.traitEvidenceClasses.frostSensitivity, 'HEURISTIC_ASSERTION');
  assert.notEqual(lav.climateTraits.traitEvidenceClasses.frostSensitivity, 'SOURCE_SUPPORTED');
  // Explicit group mediums preserved as LEGACY_ASSERTED, not merge-default orphan
  assert.equal(lav.climateTraits.coldTolerance, 'medium');
  assert.equal(lav.climateTraits.fieldOrigins.coldTolerance, VALUE_ORIGIN.LEGACY_ASSERTED_METADATA);
});

test('B. lemon: no invented reproductive biology; flowering/fruiting only if legacy explicit', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, p]));
  applyBootstrapSafeClimateTraitsMigration(library, index);
  const lemon = index.lemon;
  assert.ok(lemon.climateTraits.floweringRequirements);
  assert.ok(lemon.climateTraits.fruitingRequirements);
  assert.equal(lemon.climateTraits.reproductiveBiology, undefined);
  assert.equal(lemon.climateTraits.quantitative, undefined);
  const meta = resolveSmartRecClimateMetaForPlant(lemon, { legacyInlineTable: {} });
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.frostSensitivity, 'high');
});

test('C. SAFE payload alone leaves fig on legacy fallback (unlocked-six migrates separately)', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, p]));
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  assert.equal(payload.plants.fig, undefined);
  applyBootstrapSafeClimateTraitsMigration(library, index);
  assert.equal(index.fig.climateTraits, undefined);
  const legacy = {
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    drainageNeeds: 'high',
    sunNeeds: 'full_sun',
    waterNeeds: 'medium'
  };
  const meta = resolveSmartRecClimateMetaForPlant(index.fig, {
    legacyInlineTable: { fig: legacy }
  });
  assert.equal(meta._metaAuthority, META_AUTHORITY.LEGACY_INLINE_SMART_REC);
  assert.equal(meta.heatTolerance, 'high');
});

test('D/E. explicit medium preserved; absent fields stay absent', () => {
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  const lav = payload.plants.lavender.climateTraits;
  assert.equal(lav.coldTolerance, 'medium');
  assert.equal(lav.fieldOrigins.coldTolerance, VALUE_ORIGIN.LEGACY_ASSERTED_METADATA);
  // Enrichment overlay (pomegranate frost/cold only) may use ASSERTED_SOURCE; all other SAFE
  // structural fields remain LEGACY_ASSERTED_METADATA.
  const enrichmentOverlayFields = new Set([
    'pomegranate.frostSensitivity',
    'pomegranate.coldTolerance'
  ]);
  for (const slug of payload.safeSlugs) {
    const ct = payload.plants[slug].climateTraits;
    for (const k of [
      'frostSensitivity',
      'coldTolerance',
      'heatTolerance',
      'humidityTolerance',
      'drainageNeeds',
      'sunNeeds',
      'waterNeeds'
    ]) {
      if (ct[k] != null) {
        const key = `${slug}.${k}`;
        if (enrichmentOverlayFields.has(key)) {
          assert.equal(ct.fieldOrigins[k], VALUE_ORIGIN.ASSERTED_SOURCE, key);
        } else {
          assert.equal(ct.fieldOrigins[k], VALUE_ORIGIN.LEGACY_ASSERTED_METADATA, key);
        }
      }
    }
  }
  // basil: check a field that may be absent on some plants stays absent when not in origin map
  const monstera = payload.plants.monstera.climateTraits;
  if (monstera.fruitingRequirements == null) {
    assert.equal(monstera.fieldOrigins.fruitingRequirements, undefined);
  }
});

test('F. Specific Plant outcomes: migrated lavender evaluates without authority disagreement', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, p]));
  applyBootstrapSafeClimateTraitsMigration(library, index);
  const meta = resolveSmartRecClimateMetaForPlant(index.lavender, { legacyInlineTable: {} });
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  const outcomes = deriveSpecificPlantOutcomes({
    plant: index.lavender,
    meta,
    climateProfile: {
      freezingRisk: 'low',
      isFrostFreeGrowingClimate: true,
      humiditySignal: 'low',
      thermalRegime: 'mediterranean-warm',
      moistureRegime: 'seasonal-dry',
      broadClimate: 'mediterranean'
    },
    suitability: {
      recommendationLevel: 'good',
      survivalFit: 85,
      thriveFit: 80,
      floweringFit: 75,
      fruitingFit: 40,
      warnings: [],
      explanationText: ''
    }
  });
  assert.ok(outcomes);
  assert.ok(outcomes.survival);
  assert.notEqual(outcomes.survival, undefined);
});

test('G. pineapple unchanged (not in SAFE set); remains B/UNKNOWN reproductive stance', () => {
  const seed = loadSeed();
  const pineapple = seed.find((p) => p.slug === 'pineapple');
  assert.ok(pineapple);
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  assert.equal(payload.plants.pineapple, undefined);
  const before = classifyPlantDataReadiness(pineapple);
  applyBootstrapSafeClimateTraitsMigration([pineapple], { pineapple });
  assert.deepEqual(pineapple.climateTraits, seed.find((p) => p.slug === 'pineapple').climateTraits);
  const after = classifyPlantDataReadiness(pineapple);
  assert.equal(before.readinessShort, 'B');
  assert.equal(after.readinessShort, 'B');
  assert.equal(after.floweringStanceReady, false);
  assert.equal(after.fruitingStanceReady, false);
});

test('PHASE5: readiness before/after for SAFE plants — Class A only via enrichment overlay', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  const beforeRows = [];
  const afterRows = [];
  for (const slug of payload.safeSlugs) {
    const plant = index[slug];
    beforeRows.push({ slug, class: shortClass(classifyPlantDataReadiness(plant)) });
  }
  applyBootstrapSafeClimateTraitsMigration(library.map((p) => index[p.slug]), index);
  for (const slug of payload.safeSlugs) {
    const r = classifyPlantDataReadiness(index[slug]);
    afterRows.push({
      slug,
      class: shortClass(r),
      blockers: r.reasons || []
    });
    if (slug === 'pomegranate') {
      assert.equal(shortClass(r), 'A', 'pomegranate real enrichment apply → Class A');
    } else {
      assert.notEqual(shortClass(r), 'A', `no Class A inflation for ${slug}`);
    }
  }
  const beforeCounts = { A: 0, B: 0, C: 0, D: 0 };
  const afterCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const row of beforeRows) beforeCounts[row.class] = (beforeCounts[row.class] || 0) + 1;
  for (const row of afterRows) afterCounts[row.class] = (afterCounts[row.class] || 0) + 1;
  assert.equal(beforeCounts.D, 26);
  assert.equal(afterCounts.A, 1);
  assert.ok(afterCounts.D < 26 || afterCounts.B + afterCounts.C > 0);

  const seed = loadSeed();
  const bySlug = new Map();
  for (const p of library) bySlug.set(p.slug, { ...p });
  applyBootstrapSafeClimateTraitsMigration([...bySlug.values()], Object.fromEntries(bySlug));
  for (const p of seed) {
    const slug = String(p.slug || '').toLowerCase();
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, p);
  }
  const catalog = [...bySlug.values()];
  const catalogCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const p of catalog) {
    const c = shortClass(classifyPlantDataReadiness(p));
    catalogCounts[c] = (catalogCounts[c] || 0) + 1;
  }
  assert.equal(catalogCounts.A, 1);

  const report = {
    generatedAt: new Date().toISOString(),
    safeCount: 26,
    safeBefore: beforeCounts,
    safeAfter: afterCounts,
    catalogTotal: catalog.length,
    catalogAfter: catalogCounts,
    perPlant: afterRows.map((row, i) => ({
      slug: row.slug,
      before: beforeRows[i].class,
      after: row.class,
      blockers: row.blockers
    }))
  };
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_bootstrap-safe-climate-migration-readiness-report.json'),
    JSON.stringify(report, null, 2)
  );
});

test('PHASE7: identity safety — no new duplicates; remaining conflict plants unmodified', () => {
  const library = bootstrapEntriesFromApp();
  const uniqueLibrary = [];
  const seen = new Set();
  for (const p of library) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    uniqueLibrary.push({ ...p });
  }
  const index = Object.fromEntries(uniqueLibrary.map((p) => [p.slug, p]));
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  // Alias rows may already be collapsed out of PLANT_LIBRARY; only assert remaining conflicts.
  const conflict = payload.conflictSlugs.filter((s) => index[s]);
  const beforeConflict = Object.fromEntries(
    conflict.map((s) => [s, JSON.stringify(index[s])])
  );
  applyBootstrapSafeClimateTraitsMigration(uniqueLibrary, index);
  for (const s of conflict) {
    assert.equal(JSON.stringify(index[s]), beforeConflict[s], `conflict plant mutated: ${s}`);
    assert.equal(index[s].climateTraits, undefined);
  }
  const slugs = uniqueLibrary.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(slugs.length, 45);
  const sciMap = new Map();
  for (const p of uniqueLibrary) {
    const sci = String(p.scientific || '')
      .toLowerCase()
      .trim();
    if (!sci || /\bspp\.?\b/.test(sci) || sci.startsWith('various')) continue;
    if (!sciMap.has(sci)) sciMap.set(sci, []);
    sciMap.get(sci).push(p.slug);
  }
  for (const slug of payload.safeSlugs) {
    const sci = String(index[slug].scientific || '')
      .toLowerCase()
      .trim();
    const peers = (sciMap.get(sci) || []).filter((s) => s !== slug);
    const peerSafe = peers.filter((s) => payload.safeSlugs.includes(s));
    assert.equal(peerSafe.length, 0, `SAFE scientific duplicate involving ${slug}`);
  }
});

test('provenance: SOURCE_SUPPORTED only via enrichment overlay (pomegranate frost/cold)', () => {
  const payload = getBootstrapSafeClimateTraitsMigrationPayload();
  const allowedSs = new Set([
    'pomegranate.frostSensitivity',
    'pomegranate.coldTolerance'
  ]);
  for (const slug of payload.safeSlugs) {
    const classes = payload.plants[slug].climateTraits.traitEvidenceClasses || {};
    for (const [field, v] of Object.entries(classes)) {
      const key = `${slug}.${field}`;
      if (allowedSs.has(key)) {
        assert.equal(v, 'SOURCE_SUPPORTED', key);
      } else {
        assert.notEqual(v, 'SOURCE_SUPPORTED', key);
        assert.equal(v, 'HEURISTIC_ASSERTION');
      }
    }
    assert.equal(payload.plants[slug].climateTraits.migration.provenance, 'LEGACY_ASSERTED_METADATA');
  }
  const pom = payload.plants.pomegranate.climateTraits;
  assert.ok(pom.enrichmentProvenance?.frostSensitivity?.transformRef);
  assert.ok(pom.enrichmentProvenance?.coldTolerance?.transformRef);
});
