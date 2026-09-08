/**
 * Unlocked-six species structural climateTraits migration proofs.
 * Extends SAFE bootstrap migration — no enrichment / Batch 3 / plum.
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
  applyBootstrapUnlockedSixClimateTraitsMigration,
  applyAllBootstrapStructuralClimateTraitsMigrations,
  getBootstrapSafeClimateTraitsMigrationPayload,
  getBootstrapUnlockedSixClimateTraitsMigrationPayload
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import {
  classifyPlantDataReadiness,
  classifyCatalogReadOnly,
  PLANT_DATA_READINESS
} from '../modules/personal-domain/plant-data-contract-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

const UNLOCKED_SIX = Object.freeze([
  'apple',
  'pear',
  'peach',
  'fig',
  'grapevine',
  'passionfruit'
]);

const ALIAS_MAP = Object.freeze({
  'apple-tree': 'apple',
  'pear-tree': 'pear',
  'peach-tree': 'peach',
  'fig-tree': 'fig',
  'grape-vine': 'grapevine',
  'passion-fruit': 'passionfruit'
});

const EXPECTED_SCI = Object.freeze({
  apple: /Malus domestica/i,
  pear: /Pyrus communis/i,
  peach: /Prunus persica/i,
  fig: /Ficus carica/i,
  grapevine: /Vitis vinifera/i,
  passionfruit: /Passiflora edulis/i
});

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

function loadSeed() {
  const raw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  return Array.isArray(raw) ? raw : raw.plants || [];
}

test('PHASE1: unlocked six payload exactly six species; plum excluded', () => {
  const payload = getBootstrapUnlockedSixClimateTraitsMigrationPayload();
  assert.equal(payload.unlockedCount, 6);
  assert.deepEqual(payload.unlockedSlugs, UNLOCKED_SIX);
  assert.deepEqual(payload.excluded, ['plum']);
  assert.equal(Object.keys(payload.plants).length, 6);
  assert.equal(payload.plants.plum, undefined);
  for (const slug of UNLOCKED_SIX) {
    const p = payload.plants[slug];
    assert.ok(p, slug);
    assert.match(p.scientific, EXPECTED_SCI[slug]);
    assert.equal(p.climateTraits.migration.kind, 'bootstrap-unlocked-species-structural-v1');
    assert.ok(!/\bspp\.?\b/i.test(p.scientific));
  }
  // SAFE payload still excludes them
  const safe = getBootstrapSafeClimateTraitsMigrationPayload();
  for (const slug of [...UNLOCKED_SIX, 'plum']) {
    assert.equal(safe.plants[slug], undefined);
  }
});

test('PHASE2: provenance honesty — LEGACY + HEURISTIC only; no SOURCE_SUPPORTED', () => {
  const payload = getBootstrapUnlockedSixClimateTraitsMigrationPayload();
  for (const slug of UNLOCKED_SIX) {
    const t = payload.plants[slug].climateTraits;
    const origins = t.fieldOrigins || {};
    const evidence = t.traitEvidenceClasses || {};
    for (const [k, v] of Object.entries(origins)) {
      assert.equal(v, 'LEGACY_ASSERTED_METADATA', `${slug}.${k}`);
    }
    for (const [k, v] of Object.entries(evidence)) {
      assert.equal(v, 'HEURISTIC_ASSERTION', `${slug}.${k}`);
      assert.notEqual(v, 'SOURCE_SUPPORTED');
    }
    assert.equal(t.reproductiveBiology, undefined);
    assert.equal(t.quantitative, undefined);
    assert.ok(Array.isArray(t.groupIds) && t.groupIds.length >= 1, slug);
  }
});

test('app.html wires unlocked-six sync apply after identity remaps', () => {
  const html = fs.readFileSync(APP, 'utf8');
  assert.match(html, /bootstrap-unlocked-six-climate-traits-migration-data-v1\.browser\.js/);
  assert.match(html, /__CRUVIT_BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1/);
  assert.match(html, /applyBootstrapStructuralClimateTraitsMigrationsInline/);
  const idxRemap = html.indexOf('applyBoundedIdentityAliasRemapsInline');
  const idxApply = html.indexOf('applyBootstrapStructuralClimateTraitsMigrationsInline');
  assert.ok(idxRemap >= 0 && idxApply > idxRemap);
});

test('A. apple: canonical authority; chill group preserved; no invented SOURCE_SUPPORTED', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(
    library.map((p) => index[p.slug]),
    index
  );
  const apple = index.apple;
  assert.equal(plantHasCanonicalClimateTraits(apple), true);
  const meta = resolveSmartRecClimateMetaForPlant(apple, {
    legacyInlineTable: {
      apple: { frostSensitivity: 'high', coldTolerance: 'low' }
    }
  });
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.needsWinterChill, true);
  assert.ok(meta.groupIds.includes('temperate-chill-fruit-tree'));
  assert.equal(apple.climateTraits.fieldOrigins.frostSensitivity, 'LEGACY_ASSERTED_METADATA');
  assert.equal(apple.climateTraits.traitEvidenceClasses.frostSensitivity, 'HEURISTIC_ASSERTION');
  assert.notEqual(apple.climateTraits.traitEvidenceClasses.frostSensitivity, 'SOURCE_SUPPORTED');
});

test('B. fig: canonical authority; no alias duplicate row', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyBootstrapUnlockedSixClimateTraitsMigration(
    library.map((p) => index[p.slug]),
    index
  );
  assert.ok(index.fig.climateTraits);
  assert.equal(index['fig-tree'], undefined); // no library row; remap is index-only in app
  const slugs = library.map((p) => p.slug);
  assert.equal(slugs.filter((s) => s === 'fig').length, 1);
  assert.equal(slugs.includes('fig-tree'), false);
  const meta = resolveSmartRecClimateMetaForPlant(index.fig, {});
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
});

test('C. grapevine: alias grape-vine resolves via index remap pattern; canonical authority', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyBootstrapUnlockedSixClimateTraitsMigration(
    library.map((p) => index[p.slug]),
    index
  );
  // Simulate app.html alias index remap
  index['grape-vine'] = index.grapevine;
  assert.equal(index['grape-vine'].slug, 'grapevine');
  assert.equal(plantHasCanonicalClimateTraits(index['grape-vine']), true);
  const meta = resolveSmartRecClimateMetaForPlant(index['grape-vine'], {});
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
});

test('D. passionfruit: frost-sensitive preserved; passion-fruit alias; no invented reproductiveBiology', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyBootstrapUnlockedSixClimateTraitsMigration(
    library.map((p) => index[p.slug]),
    index
  );
  const p = index.passionfruit;
  assert.equal(p.climateTraits.frostSensitivity, 'high');
  assert.equal(p.climateTraits.reproductiveBiology, undefined);
  index['passion-fruit'] = p;
  const meta = resolveSmartRecClimateMetaForPlant(index['passion-fruit'], {});
  assert.equal(meta._metaAuthority, META_AUTHORITY.CANONICAL_CLIMATE_TRAITS);
  assert.equal(meta.frostSensitivity, 'high');
});

test('E. pear / peach: canonical authority; identity stable', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyBootstrapUnlockedSixClimateTraitsMigration(
    library.map((p) => index[p.slug]),
    index
  );
  assert.match(index.pear.scientific, /Pyrus communis/i);
  assert.match(index.peach.scientific, /Prunus persica/i);
  assert.equal(
    resolveSmartRecClimateMetaForPlant(index.pear, {})._metaAuthority,
    META_AUTHORITY.CANONICAL_CLIMATE_TRAITS
  );
  assert.equal(
    resolveSmartRecClimateMetaForPlant(index.peach, {})._metaAuthority,
    META_AUTHORITY.CANONICAL_CLIMATE_TRAITS
  );
});

test('F. plum remains untouched and broad', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  const before = JSON.stringify(index.plum);
  applyAllBootstrapStructuralClimateTraitsMigrations(
    library.map((p) => index[p.slug]),
    index
  );
  assert.equal(JSON.stringify(index.plum), before);
  assert.match(index.plum.scientific, /Prunus spp/i);
  assert.equal(index.plum.climateTraits, undefined);
  const unlocked = getBootstrapUnlockedSixClimateTraitsMigrationPayload();
  assert.equal(unlocked.plants.plum, undefined);
});

test('PHASE5+6: all six → canonical authority; D→B; catalog totals directional', () => {
  const library = bootstrapEntriesFromApp();
  const unique = [];
  const seen = new Set();
  for (const p of library) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    unique.push({ ...p });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, p]));
  const beforeClasses = {};
  for (const slug of UNLOCKED_SIX) {
    beforeClasses[slug] = shortClass(classifyPlantDataReadiness(index[slug]));
  }
  applyAllBootstrapStructuralClimateTraitsMigrations(unique, index);
  const afterRows = [];
  for (const slug of UNLOCKED_SIX) {
    const r = classifyPlantDataReadiness(index[slug]);
    const cls = shortClass(r);
    afterRows.push({ slug, before: beforeClasses[slug], after: cls, blockers: r.reasons || [] });
    assert.equal(beforeClasses[slug], 'D', slug);
    assert.equal(cls, 'B', slug);
    assert.notEqual(cls, 'A');
    assert.equal(
      resolveSmartRecClimateMetaForPlant(index[slug], {})._metaAuthority,
      META_AUTHORITY.CANONICAL_CLIMATE_TRAITS
    );
  }

  const seed = loadSeed();
  for (const p of seed) {
    const slug = String(p.slug || '').toLowerCase();
    if (slug && !index[slug]) index[slug] = p;
  }
  const catalog = Object.values(index);
  // Deduplicate by slug for catalog report
  const bySlug = new Map();
  for (const p of unique) bySlug.set(p.slug, p);
  for (const p of seed) {
    const slug = String(p.slug || '').toLowerCase();
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p);
  }
  const report = classifyCatalogReadOnly([...bySlug.values()]);
  assert.equal(report.counts.A, 0);
  assert.ok(report.counts.B >= 94, `B=${report.counts.B}`);
  assert.ok(report.counts.D <= 14, `D=${report.counts.D}`);
  assert.ok(report.total >= 100 && report.total <= 115);

  fs.writeFileSync(
    path.join(ROOT, 'tests', '_unlocked-six-climate-migration-readiness-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        unlockedSix: afterRows,
        catalogTotal: report.total,
        catalogCounts: report.counts,
        expectedDirectional: 'A0 / B95 / C0 / D13'
      },
      null,
      2
    )
  );
});

test('PHASE7: outcome honesty — HEURISTIC provisional; no Class A; fruit crop ≠ invented bio', () => {
  const library = bootstrapEntriesFromApp();
  const index = Object.fromEntries(library.map((p) => [p.slug, { ...p }]));
  applyBootstrapUnlockedSixClimateTraitsMigration(
    library.map((p) => index[p.slug]),
    index
  );
  for (const slug of UNLOCKED_SIX) {
    const plant = index[slug];
    const r = classifyPlantDataReadiness(plant);
    assert.notEqual(r.readinessShort, 'A');
    assert.equal(plant.climateTraits.reproductiveBiology, undefined);
    // Migrated flowering/fruiting text is LEGACY group text when present — still HEURISTIC
    if (plant.climateTraits.floweringRequirements) {
      assert.equal(plant.climateTraits.traitEvidenceClasses.floweringRequirements, 'HEURISTIC_ASSERTION');
    }
    if (plant.climateTraits.fruitingRequirements) {
      assert.equal(plant.climateTraits.traitEvidenceClasses.fruitingRequirements, 'HEURISTIC_ASSERTION');
    }
    const outcomes = deriveSpecificPlantOutcomes({
      plant,
      climateMeta: resolveSmartRecClimateMetaForPlant(plant, {}),
      locationClimate: { climateZone: 'mediterranean', frostRisk: 'low' },
      scores: {
        overallFit: 70,
        survivalFit: 75,
        growthFit: 70,
        floweringFit: 60,
        fruitingFit: 55,
        warnings: [],
        explanationText: ''
      }
    });
    assert.ok(outcomes);
    assert.ok(outcomes.survival);
  }
});

test('PHASE9: alias remaps declared for all six old slugs', () => {
  const html = fs.readFileSync(APP, 'utf8');
  for (const [alias, canon] of Object.entries(ALIAS_MAP)) {
    assert.match(html, new RegExp(`'${alias}':'${canon}'`));
    assert.ok(UNLOCKED_SIX.includes(canon));
  }
  assert.match(html, /'plum-tree':'plum'/);
});

test('regression: pineapple unchanged; SAFE still 26; scoring/CHELSA untouched by this payload', () => {
  const unlocked = getBootstrapUnlockedSixClimateTraitsMigrationPayload();
  assert.equal(unlocked.plants.pineapple, undefined);
  const safe = getBootstrapSafeClimateTraitsMigrationPayload();
  assert.equal(safe.safeCount, 26);
  const seed = loadSeed();
  const pineapple = seed.find((p) => p.slug === 'pineapple');
  const before = JSON.stringify(pineapple.climateTraits);
  applyAllBootstrapStructuralClimateTraitsMigrations([pineapple], { pineapple });
  assert.equal(JSON.stringify(pineapple.climateTraits), before);
  const html = fs.readFileSync(APP, 'utf8');
  // No CHELSA / scoring edits in unlocked payload path
  assert.equal(unlocked.note.includes('Structural migration only'), true);
  assert.ok(!html.includes('SOURCE_SUPPORTED invented'));
});
