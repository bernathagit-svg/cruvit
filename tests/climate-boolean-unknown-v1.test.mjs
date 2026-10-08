/**
 * Independent tri-state climate boolean contracts against the real app declarations
 * and the exported authority/consumer modules. Reads local committed fixtures only.
 * Run: node --test tests/climate-boolean-unknown-v1.test.mjs
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as authority from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';
import { plantNeedsWinterChill, deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { chillConfidenceFromEvidence } from '../modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js';
import hardGate from '../modules/suitability/hard-climate-survival-gate-v1.js';
import reproductiveGate from '../modules/suitability/reproductive-climate-gate-v1.js';
import gardenIntelligence from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import { catalogRowToRuntimePlant } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = ['needsWinterChill', 'needsDrySeason'];
const SNAPSHOT = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/catalog-after.json';
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const plain = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const blob = (text) => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
const historical = {
  'scripts/verify-six-plant-location-regression-20261008.mjs': '65d247a902e21a9a90dd78903d0a839b2e4d2c55',
  'tests/_six-plant-location-regression-20261008-report.json': 'e48e0b46930e05da78ddc3c2b39fce419497a468'
};
const immutable = [SNAPSHOT, ...Object.keys(historical),
  ...['yehiam','helsinki','singapore','kochi','cairo','tokyo','quito'].flatMap((id) =>
    ['pilot','qa'].map((kind) => 'data/coordinate-climate/v2/' + kind + '/' + id + '.json'))];
const beforeHashes = Object.fromEntries(immutable.map((p) => [p, hash(fs.readFileSync(path.join(ROOT, p)))]));
const calls = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { calls.push('host.fetch'); throw new Error('Offline test forbids network'); };
after(() => {
  globalThis.fetch = originalFetch;
  assert.deepEqual(calls, [], 'No network call may be attempted.');
  for (const [p, expected] of Object.entries(beforeHashes)) {
    assert.equal(hash(fs.readFileSync(path.join(ROOT, p))), expected, 'Input changed: ' + p);
  }
});

const appText = read('app.html');
const lines = appText.split('\n');
// Declaration-only ranges for the reviewed candidate. No app startup or HTML is evaluated.
const ranges = [[1231,1842],[2114,2167],[2229,2275],[3795,3795],[3801,3824],
  [3875,3878],[4168,4175],[4276,4283],[4301,4351],[6183,6264],
  [6278,6975],[6993,7041],[7055,7072],[7170,7170]];
const context = vm.createContext({
  window: {
    CruvitHardClimateSurvivalGate: hardGate,
    CruvitReproductiveClimateGate: reproductiveGate,
    CruvitSmartRecGardenIntelligence: gardenIntelligence,
    cruvitDeriveSpecificPlantOutcomes: deriveSpecificPlantOutcomes
  },
  data: {},
  smartRecSession: { answers: {}, selectedAreaId: null },
  fetch: () => { calls.push('app.fetch'); throw new Error('Offline app test forbids network'); }
}, { codeGeneration: { strings: false, wasm: false } });
new vm.Script(ranges.map(([a,b]) => lines.slice(a - 1,b).join('\n')).join('\n\n'), {
  filename: 'actual-app-declarations-for-boolean-contract'
}).runInContext(context, { timeout: 5000 });
const app = vm.runInContext('({ read:smartRecReadClimateBooleanTrait, merge:smartRecMergeClimateMeta, ' +
  'catalog:climateMetaFromCatalogTraits, resolve:smartRecClimateMetaForPlant, ' +
  'has:smartRecPlantHasCanonicalClimateTraits, key:smartRecMetaKeyForPlant, ' +
  'groups:SMART_REC_CLIMATE_GROUPS, legacy:SMART_REC_CLIMATE_METADATA, ' +
  'score:smartRecEvaluateSuitability, infer:inferClientClimate, climate:getAppClimateProfile })', context);
const implementations = [
  { name: 'app', ...app },
  { name: 'module', read: authority.readClimateBooleanTrait,
    merge: authority.mergeSmartRecClimateMeta,
    has: authority.plantHasCanonicalClimateTraits,
    catalog: (traits, scientific) => authority.climateMetaFromCatalogTraits(traits, scientific, app.groups),
    resolve: (plant) => authority.resolveSmartRecClimateMetaForPlant(plant, {
      climateGroups: app.groups, legacyInlineTable: app.legacy, metaKeyForPlant: app.key
    })
  }
];

test('readers preserve strict true/false/null and do not coerce malformed values', () => {
  for (const impl of implementations) for (const field of FIELDS) {
    assert.deepEqual(plain(impl.read({}, field)), { declared: false, value: null });
    for (const value of [true,false,null,undefined,'UNKNOWN','false','true',0,1,'',{},[]]) {
      assert.deepEqual(plain(impl.read({ [field]: value }, field)),
        { declared: true, value: typeof value === 'boolean' ? value : null }, impl.name + '/' + field);
    }
    assert.deepEqual(plain(impl.read({ frostSensitivity: true }, 'frostSensitivity')),
      { declared: false, value: null });
  }
});

test('UNKNOWN in either class map or either provenance marker defeats a raw boolean', () => {
  const unknowns = (field) => [
    { traitEvidenceClasses: { [field]: 'UNKNOWN' } },
    { fieldEvidenceClasses: { [field]: ' unknown ' } },
    { traitProvenance: { [field]: { evidenceClass: 'UNKNOWN' } } },
    { traitProvenance: { [field]: { status: 'unknown' } } }
  ];
  for (const impl of implementations) for (const field of FIELDS) {
    for (const evidence of unknowns(field)) for (const value of [true,false]) {
      assert.deepEqual(plain(impl.read({ [field]: value, ...evidence }, field)),
        { declared: true, value: null });
      assert.equal(impl.merge({ [field]: !value }, { [field]: value, ...evidence })[field], null);
    }
  }
});

test('own evidence never authorizes an inherited raw boolean', () => {
  for (const impl of implementations) for (const field of FIELDS) {
    const inherited = Object.assign(Object.create({ [field]: true }), {
      traitEvidenceClasses: { [field]: 'SOURCE_SUPPORTED' }
    });
    assert.deepEqual(plain(impl.read(inherited, field)), { declared: true, value: null });
    inherited[field] = false;
    assert.deepEqual(plain(impl.read(inherited, field)), { declared: true, value: false });
  }
});

test('empty merges expose synthetic nulls while keeping ordinal default behavior', () => {
  for (const impl of implementations) {
    const meta = impl.merge({});
    assert.equal(meta.heatTolerance, 'medium');
    assert.equal(meta.frostSensitivity, 'medium');
    for (const field of FIELDS) {
      assert.equal(meta[field], null);
      assert.ok(meta.syntheticDefaultFields.includes(field));
      assert.deepEqual(plain(impl.read(meta, field)), { declared: false, value: null });
    }
  }
});

test('later unrelated raw metadata does not erase a known boolean', () => {
  for (const impl of implementations) for (const field of FIELDS) for (const value of [true,false]) {
    const meta = impl.merge({ [field]: value }, { needsReview: true, warningFlags: ['fixture'] });
    assert.equal(meta[field], value);
    assert.ok(!meta.syntheticDefaultFields.includes(field));
  }
});

test('unrelated already-merged groups do not turn synthetic null into a veto', () => {
  for (const impl of implementations) for (const field of FIELDS) for (const value of [true,false]) {
    const knownGroup = impl.merge({ [field]: value, groupIds: ['known-fixture'] });
    const unrelatedGroup = impl.merge({ groupIds: ['unrelated-fixture'], waterNeeds: 'medium' });
    const merged = impl.merge(knownGroup, unrelatedGroup);
    assert.equal(merged[field], value);
    assert.ok(!merged.syntheticDefaultFields.includes(field));
    assert.equal(impl.merge(unrelatedGroup, knownGroup)[field], value);
  }
});

test('explicit null and evidence-only UNKNOWN override a prior known decision', () => {
  for (const impl of implementations) for (const field of FIELDS) for (const value of [true,false]) {
    assert.equal(impl.merge({ [field]: value }, { [field]: null })[field], null);
    const meta = impl.merge({ [field]: value }, { traitEvidenceClasses: { [field]: 'UNKNOWN' } });
    assert.equal(meta[field], null);
    assert.ok(!meta.syntheticDefaultFields.includes(field));
  }
});

test('later known decisions replace values without inheriting stale per-field proof', () => {
  for (const impl of implementations) for (const field of FIELDS) for (const value of [true,false]) {
    const old = { [field]: !value,
      traitEvidenceClasses: { [field]: 'SOURCE_SUPPORTED', heatTolerance: 'HEURISTIC_ASSERTION' },
      fieldEvidenceClasses: { [field]: 'SOURCE_SUPPORTED' },
      traitProvenance: { [field]: { evidenceClass: 'SOURCE_SUPPORTED', sourceIds: ['old-fixture-proof'] } } };
    const before = JSON.stringify(old);
    const meta = impl.merge(old, { [field]: value });
    assert.equal(meta[field], value);
    for (const map of ['traitEvidenceClasses','fieldEvidenceClasses','traitProvenance']) {
      assert.equal(Object.hasOwn(meta[map] || {}, field), false, impl.name + '/' + map);
    }
    assert.equal(meta.traitEvidenceClasses.heatTolerance, 'HEURISTIC_ASSERTION');
    assert.equal(JSON.stringify(old), before);
  }
});

test('HEURISTIC labels survive for explicitly known booleans', () => {
  for (const impl of implementations) for (const field of FIELDS) for (const value of [true,false]) {
    const meta = impl.merge({ [field]: value,
      traitEvidenceClasses: { [field]: 'HEURISTIC_ASSERTION' },
      traitProvenance: { [field]: { evidenceClass: 'HEURISTIC_ASSERTION', status: 'asserted' } } });
    assert.equal(meta[field], value);
    assert.equal(meta.traitEvidenceClasses[field], 'HEURISTIC_ASSERTION');
    assert.equal(meta.traitProvenance[field].evidenceClass, 'HEURISTIC_ASSERTION');
  }
});

test('canonical absence/null/UNKNOWN cannot borrow true from group templates', () => {
  for (const impl of implementations) for (const field of FIELDS) {
    const group = field === 'needsWinterChill' ? 'temperate-chill-fruit-tree' : 'warm-dry-mediterranean-fruit';
    for (const canonical of [{}, { [field]: null }, { [field]: 'UNKNOWN' },
      { traitEvidenceClasses: { [field]: 'UNKNOWN' } }]) {
      const traits = { groupIds: [group], ...canonical };
      const before = JSON.stringify(traits);
      const meta = impl.catalog(traits, 'Synthetic fixture');
      assert.equal(meta[field], null);
      for (const key of FIELDS) assert.ok(!meta.syntheticDefaultFields.includes(key));
      assert.equal(JSON.stringify(traits), before);
    }
    const meta = impl.catalog({ groupIds: [group], [field]: false }, 'Synthetic fixture');
    assert.equal(meta[field], false, 'Known canonical false outranks group true.');
  }
});

test('own boolean-only and evidence/provenance-only traits select canonical authority', () => {
  for (const impl of implementations) for (const field of FIELDS) {
    const shapes = [true,false,null].map((value) => ({ [field]: value }));
    shapes.push({ fieldEvidenceClasses: { [field]: 'UNKNOWN' } },
      { traitProvenance: { [field]: { status: 'unknown' } } });
    for (const climateTraits of shapes) {
      const plant = { slug: 'apple-tree', scientific: 'Malus domestica', climateTraits };
      assert.equal(impl.has(plant), true);
      assert.equal(impl.resolve(plant)._metaAuthority, 'canonical-climateTraits');
      assert.equal(impl.resolve(plant)[field], impl.read(climateTraits, field).value);
    }
  }
});

test('canonical aliases and scientific aliases do not revive legacy chill truth', () => {
  for (const impl of implementations) {
    for (const slug of ['apple','apple-tree','unlisted-fixture']) {
      const meta = impl.resolve({ slug, scientific: 'Malus domestica',
        climateTraits: { needsWinterChill: null } });
      assert.equal(meta._metaAuthority, 'canonical-climateTraits');
      assert.equal(meta.needsWinterChill, null);
    }
    const legacy = impl.resolve({ slug: 'apple-tree', scientific: 'Malus domestica' });
    assert.equal(legacy._metaAuthority, 'legacy-inline-smart-rec');
    assert.equal(legacy.needsWinterChill, true, 'A declared legacy group requirement remains true.');
  }
});

test('review and broad-species remerges preserve declared tri-state values', () => {
  for (const impl of implementations) for (const value of [true,false,null]) {
    const meta = impl.resolve({ slug: 'apple-tree', scientific: 'Various spp.',
      climateTraits: { needsWinterChill: value, needsDrySeason: value, needsReview: true } });
    assert.equal(meta.needsReview, true);
    assert.equal(meta.needsWinterChill, value);
    assert.equal(meta.needsDrySeason, value);
    for (const key of FIELDS) assert.ok(!meta.syntheticDefaultFields.includes(key));
  }
});

test('six actual rows preserve canonical evidence, known controls, and reproductive fields', () => {
  const catalog = JSON.parse(read(SNAPSHOT));
  const expected = { mango: null, 'date-palm': null, monstera: null,
    'bigleaf-hydrangea': false, fig: true, lettuce: false };
  for (const entry of [...catalog.target_rows,...catalog.control_rows]) {
    const plant = catalogRowToRuntimePlant(entry.row);
    const results = implementations.map((impl) => impl.resolve(plant));
    for (const meta of results) {
      assert.equal(meta.needsWinterChill, expected[entry.slug], entry.slug);
      assert.equal(meta.needsDrySeason, null, entry.slug);
      assert.equal(meta._metaAuthority, 'canonical-climateTraits');
      assert.deepEqual(plain(meta.traitEvidenceClasses), entry.row.climate_traits.traitEvidenceClasses);
    }
    assert.deepEqual(plain(results[0].reproductiveClimate || null), entry.row.climate_traits.reproductiveClimate || null);
    if (entry.slug === 'date-palm') assert.equal(results[0].reproductiveClimate.fruiting.requiresDrySeason, true);
    if (entry.slug === 'mango') assert.equal(results[0].humidityTolerance, undefined);
  }
});

test('both chill consumers preserve null/false despite a contradictory temperate group', () => {
  const env = { alwaysHot: true, coolSeasonSignal: false };
  for (const meta of [{}, { needsWinterChill: null }, { needsWinterChill: 'UNKNOWN' },
    { needsWinterChill: true, traitEvidenceClasses: { needsWinterChill: 'UNKNOWN' } }]) {
    const withGroup = { ...meta, groupIds: ['temperate-chill-fruit-tree'] };
    assert.equal(plantNeedsWinterChill(withGroup), null);
    assert.deepEqual(chillConfidenceFromEvidence(withGroup, env),
      { required: null, confidence: 'unknown', enoughForReliableFruit: null });
  }
  const explicitNo = { needsWinterChill: false, groupIds: ['temperate-chill-fruit-tree'] };
  assert.equal(plantNeedsWinterChill(explicitNo), false);
  assert.deepEqual(chillConfidenceFromEvidence(explicitNo, env), { required: false, confidence: 'n/a' });
});

test('known true keeps the existing deficit and qualitative cool-season consumer results', () => {
  const meta = { needsWinterChill: true, traitEvidenceClasses: { needsWinterChill: 'HEURISTIC_ASSERTION' } };
  assert.equal(plantNeedsWinterChill(meta), true);
  assert.deepEqual(chillConfidenceFromEvidence(meta, { alwaysHot: true, coolSeasonSignal: false }),
    { required: true, confidence: 'negative-deficit', enoughForReliableFruit: false });
  const cool = chillConfidenceFromEvidence(meta, { alwaysHot: false, coolSeasonSignal: true });
  assert.equal(cool.required, true);
  assert.equal(cool.confidence, 'qualitative-cool-season-only');
  assert.equal(cool.enoughForReliableFruit, false);
});

test('actual scorer applies the temperate-group chill penalty only to explicit known true', () => {
  const profile = JSON.parse(read('data/coordinate-climate/v2/pilot/singapore.json'));
  context.data = { gardenLocation: {
    ...profile.coordinate, source: 'manual',
    climate: app.infer(profile.coordinate.lat, profile.coordinate.lon),
    structuralClimate: coordinateClimateProfileToStructuralPersistence(profile)
  }, weather: {} };
  context.smartRecSession = { answers: {}, selectedAreaId: null };
  const climateBefore = JSON.stringify(app.climate());
  const fixture = (value, evidence) => ({ slug: 'synthetic-boolean-fixture', name: 'Synthetic fixture',
    scientific: 'Synthetic fixture', tags: [], climateTraits: {
      groupIds: ['temperate-chill-fruit-tree'], needsWinterChill: value,
      ...(evidence ? { traitEvidenceClasses: { needsWinterChill: evidence } } : {})
    } });
  const known = app.score(fixture(true, 'HEURISTIC_ASSERTION'));
  assert.ok(known.warnings.some((w) => /winter chill|clear cool season/i.test(w)));
  assert.equal(known.thriveFit, 30);
  assert.equal(known.fruitingFit, 10);
  for (const [value,evidence] of [[false,'SOURCE_SUPPORTED'],[null,'UNKNOWN'],[true,'UNKNOWN'],['UNKNOWN',undefined]]) {
    const result = app.score(fixture(value,evidence));
    assert.equal(result.warnings.some((w) => /winter chill|clear cool season/i.test(w)), false);
    assert.ok(result.thriveFit > known.thriveFit);
    assert.ok(result.fruitingFit > known.fruitingFit);
  }
  assert.equal(JSON.stringify(app.climate()), climateBefore, 'No forecast or climate cast may be introduced.');
});

test('historical harness/report remain exact and product VM has no ambient I/O globals', () => {
  for (const [file, expected] of Object.entries(historical)) assert.equal(blob(read(file)), expected);
  assert.deepEqual(plain(vm.runInContext('({process:typeof process,require:typeof require,document:typeof document})', context)),
    { process: 'undefined', require: 'undefined', document: 'undefined' });
  assert.deepEqual(calls, []);
});
