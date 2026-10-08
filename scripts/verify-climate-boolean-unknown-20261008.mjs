#!/usr/bin/env node
/**
 * Before/after UNKNOWN boolean preservation: six plants x seven location fixtures.
 *
 * Runs the reviewed candidate app.html scorer, outcome derivation, and
 * final alignment in a capability-limited VM. No HTML boot, network, database,
 * process spawning, paid AI, image generation, deployment, or registry write.
 *
 * Run from the pinned repository:
 *   node --experimental-vm-modules scripts/verify-climate-boolean-unknown-20261008.mjs
 *
 * Reads only the pinned inputs below. Creates one NEW JSON report and refuses
 * to overwrite it. This is a product-policy regression observation, not an
 * agronomic ground-truth or live-weather accuracy certification.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_COMMIT = '0ca252313fbed6593fce0a754a804e0d352f6aca';
const BASELINE_SOURCE_COMMIT = 'eee0ab34c909ca0323fef32e8f65ddd2dc9eae95';
const BASELINE_REPORT = 'tests/_six-plant-location-regression-20261008-report.json';
const BASELINE_APP_BLOB = 'dcc93a929c9dfce6e4466cd89d3e56d6288b4db2';
const BASELINE_SCORER_SHA256 = '6a034c7c1ecdb4754ffbe7e2360cff4136c0efc63ba298d4ffa911eacc5a8183';
const APP_GIT_BLOB = '7a05f8e0b2f6fc7edf59b651a0abd9b8521f2eb4';
const SCORER_SHA256 = 'a7ba35330805b3c1d2e2b98c5f05ae39f7e0170dc38e59f8faa825f3b7b5952f';
const SNAPSHOT = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/catalog-after.json';
const REPORT_REL = 'data/personal-domain/climate-boolean-unknown-2026-10-08-v1/location-comparison.json';
const REPORT_PATH = path.join(ROOT, REPORT_REL);
const LOCATION_IDS = ['yehiam', 'helsinki', 'singapore', 'kochi', 'cairo', 'tokyo', 'quito'];
const EXPECTED_TARGETS = ['date-palm', 'mango', 'monstera'];
const EXPECTED_CONTROLS = ['bigleaf-hydrangea', 'fig', 'lettuce'];

// Exact reviewed candidate source identities plus unchanged baseline inputs.
// CRLF checkout conversion is accepted only
// when normalization reproduces the exact committed UTF-8 blob.
const PINNED_INPUTS = {
  "app.html": "7a05f8e0b2f6fc7edf59b651a0abd9b8521f2eb4",
  "data/coordinate-climate/v2/pilot/cairo.json": "d02cde1733486581da5951c293b3703e189d8275",
  "data/coordinate-climate/v2/pilot/helsinki.json": "97380068e1eab60bd99ee186135328a3c502217a",
  "data/coordinate-climate/v2/pilot/kochi.json": "7f2d1363319c9c8c65d7da0dda7525c7ff5e8e6e",
  "data/coordinate-climate/v2/pilot/quito.json": "0f762e83e4aba3f79764e69d62950f86806d07f0",
  "data/coordinate-climate/v2/pilot/singapore.json": "8aecbcd21487cb119ff604c61383d70c395237e0",
  "data/coordinate-climate/v2/pilot/tokyo.json": "b50a949265c95488e0006db0b6a19130a9a6fd11",
  "data/coordinate-climate/v2/pilot/yehiam.json": "14b14961ee1684c6f1c27ea6f33384e31b6af859",
  "data/coordinate-climate/v2/qa/cairo.json": "74b3621d8f9716c6533c74b68cb5803627966f89",
  "data/coordinate-climate/v2/qa/helsinki.json": "60e483173394ec12ad06e11e97ba4842c0a83d17",
  "data/coordinate-climate/v2/qa/kochi.json": "0f729710d1a09931cdb4f12e248c861aad0b4da2",
  "data/coordinate-climate/v2/qa/quito.json": "3e4a9f47c227fa02f8faa7737d0112336d1f6606",
  "data/coordinate-climate/v2/qa/singapore.json": "97ad146db6d19dddd02b1b203510d6b57524cf32",
  "data/coordinate-climate/v2/qa/tokyo.json": "ca1993b994a07f1c5b79c822230a676bfd4c4179",
  "data/coordinate-climate/v2/qa/yehiam.json": "26edd9d2028a7aa9879d1514d3b7b7a6f39a7ecb",
  "data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/catalog-after.json": "5075f8e71cb97529cc64beded36b6f94b1a3d134",
  "modules/catalog-expansion/field-provenance-honesty-v1-contract.js": "6bd5ca0772bdf6f6ea72c59218ad5b254d2ebd9f",
  "modules/catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js": "11a66ccff901989a1f9f677f91590d8ecbb8aec3",
  "modules/catalog-expansion/reproductive-biology-v1-contract.js": "7519de78a3366d4a7f00f40f285a16edcd15b3de",
  "modules/catalog-media/licensed-catalog-media-runtime-v1.js": "a0e03b3d425213b298f47374d786e839373c060d",
  "modules/catalog-media/licensed-image-pipeline-v1-contract.js": "089ca29383063d29607ccd9a4c2120ff3d3b1c23",
  "modules/catalog/canonical-catalog-persistence-contract-v1.js": "0103b48a9a9f8433c55d05ee6d4d39cb563fa2de",
  "modules/personal-domain/coordinate-climate-authority-v2-contract.js": "2cc0aba1e7499682f43476ef436a4bb19d59ac57",
  "modules/personal-domain/coordinate-climate-confidence-v2-contract.js": "36e7640a0651ef72792dc7b0eea8ffbb6ec59386",
  "modules/personal-domain/evidence-strength-propagation-v1-contract.js": "ab16975c05050889bbd098a14c2c4906da8b92f1",
  "modules/personal-domain/plant-climate-suitability-baseline-v1.js": "8124777a5b1c3aa5b5f31aab0954381771948d1a",
  "modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js": "04561ccde03b9a73b1f08f49008b1992506a4682",
  "modules/personal-domain/specific-plant-suitability-contract.js": "41b741f66b9bd241bbd4cbf2a635016b8fd71689",
  "modules/personal-domain/structural-climate-authority-v1.js": "a82547129d047a43ca423b753109a13802200e39",
  "modules/smart-recommendations/smart-rec-garden-intelligence-v1.js": "9fbc5afa31c6d21aa44b23354392578feb4afc51",
  "modules/smart-recommendations/smart-rec-purpose-policy-v1.js": "740bfd08e9d28d5cd6ca94001d3cfde219438567",
  "modules/suitability/hard-climate-survival-gate-v1.js": "9788eb10440f6e24186f2c506710a0685f7fa621",
  "modules/suitability/reproductive-climate-gate-v1.js": "bd67342b49475a1d5d7ba143a8087d0f432d665e",
  "modules/personal-domain/smart-rec-climate-meta-authority-v1.js": "4963027a2f11c953fb54bbec409447bea6eca50d",
  "scripts/verify-six-plant-location-regression-20261008.mjs": "65d247a902e21a9a90dd78903d0a839b2e4d2c55",
  "tests/_six-plant-location-regression-20261008-report.json": "e48e0b46930e05da78ddc3c2b39fce419497a468"
};

const APP_RANGES = [
  [
    1231,
    1842,
    "601fb87f6e50fd7ff0c93986dd2a55e139370a077639f65fe9e860a2ddb54ee0"
  ],
  [
    2114,
    2167,
    "2a2a34c06bda93f0e0e05d05c36b07c536a03ee8247ebe8dbab08c06822f56a6"
  ],
  [
    2229,
    2275,
    "a45c574040bd8bfe12c5927d4d9295b1131a546492213db4f3fdb88e3ff4b787"
  ],
  [
    3795,
    3795,
    "bce799d289c8319506cc24d40fa308fe55fd2a6a96648a3f457d4bc23a33b894"
  ],
  [
    3801,
    3824,
    "9c4814bb69c84e01ad88978a2fd7dee6d0fc940e90ba2d4f08964444aef0554a"
  ],
  [
    3875,
    3878,
    "68a3ea67a767a320025505dff646d5966a15c32d8a73d618abc55fcbdd3be978"
  ],
  [
    4168,
    4175,
    "ef4d05349cc45cae82e009d33fee231b95ce0aad445d3a1bd684312ec56c82ef"
  ],
  [
    4276,
    4283,
    "baf99c5e752bedd764437016829ac7f9269f05e3247ab4b96d64e6ebbfa0bcd5"
  ],
  [
    4301,
    4351,
    "3d09b846e03fda4f50a76c8a351bed6dbab02163633fd12a101b2c9a9e202622"
  ],
  [
    6183,
    6264,
    "73c6456b75d9a84d2fe0c2a2b13279bda53430e52dea4b345d7ad26e24c09b83"
  ],
  [
    6278,
    6975,
    "8fdb4959999c55e53c1846dae5646ac4f81d51a11b5ad959f581851bc5aad5ea"
  ],
  [
    6993,
    7041,
    "f1e7fa77652713943f0f5bcfa2577e77fe18bcbb5b60548e1c8ba2503c7221e0"
  ],
  [
    7055,
    7072,
    "c2e69fda7ca758041e2c707164aa535cdfbb36083bf7e64474d007a650d2715e"
  ],
  [
    7170,
    7170,
    "3e1bfd57ec42d8366f426f5ca22be425e365749e99ad082e00b056ea0bfeb649"
  ]
];

const hash = (value, algorithm = 'sha256') =>
  crypto.createHash(algorithm).update(value).digest('hex');
const gitBlob = (text) => {
  const bytes = Buffer.from(text, 'utf8');
  return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
};

function initializeSandbox() {
  globalThis.window = globalThis;
  globalThis.data = {};
  globalThis.smartRecSession = { answers: {}, selectedAreaId: null };
  globalThis.__blockedNetworkCalls = [];
  for (const name of ['fetch','XMLHttpRequest','WebSocket','EventSource']) {
    globalThis[name] = function forbiddenNetwork() {
      globalThis.__blockedNetworkCalls.push(name);
      throw new Error('Offline harness forbids ' + name);
    };
  }
  // Deliberately no document, process, require, filesystem, storage, provider
  // SDK, timer, app lifecycle, personal-domain client, or live area API.
}

function runMatrixInSandbox() {
  const input = JSON.parse(globalThis.__inputJson);
  delete globalThis.__inputJson;
  const inputBefore = JSON.stringify(input);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const entries = [
    ...input.catalog.target_rows.map((entry) => ({ ...entry, cohort: 'target' })),
    ...input.catalog.control_rows.map((entry) => ({ ...entry, cohort: 'control' }))
  ];
  const plants = entries.map((entry) => ({
    entry,
    plant: __modules.catalogRowToRuntimePlant(clone(entry.row))
  }));
  const valueRecord = (record, key) => ({
    present: Object.prototype.hasOwnProperty.call(record || {}, key),
    value: Object.prototype.hasOwnProperty.call(record || {}, key) ? record[key] : null
  });
  const observedKeys = [
    'heatTolerance','coldTolerance','frostSensitivity','humidityTolerance',
    'needsWinterChill','needsDrySeason','floweringRequirements','fruitingRequirements'
  ];
  const plantEvidence = plants.map(({ entry, plant }) => {
    const canonical = entry.row.climate_traits || {};
    const effective = smartRecClimateMetaForPlant(plant);
    return {
      slug: entry.slug,
      cohort: entry.cohort,
      scientific: plant.scientific,
      catalogRowMd5: entry.row_md5,
      canonicalVerificationState: entry.row.verification_state,
      metaAuthority: effective?._metaAuthority || null,
      canonicalFields: Object.fromEntries(observedKeys.map((key) => [key, valueRecord(canonical, key)])),
      effectiveMetaFields: Object.fromEntries(observedKeys.map((key) => [key, valueRecord(effective, key)])),
      canonicalTraitEvidenceClasses: clone(canonical.traitEvidenceClasses || {}),
      canonicalTraitProvenance: clone(canonical.traitProvenance || {}),
      canonicalQuantitativeEvidence: clone(canonical.quantitativeEvidence || {}),
      canonicalQuantitativeProvenance: clone(canonical.quantitativeProvenance || {}),
      canonicalReproductiveClimate: clone(canonical.reproductiveClimate || null),
      canonicalReproductiveBiology: clone(canonical.reproductiveBiology || null),
      unknownBoundaryNote:
        'Canonical null/missing/UNKNOWN projects to effective null; known true/false remain explicit. No group or legacy fallback establishes a missing canonical boolean.'
    };
  });
  const locations = [];
  const pairs = [];
  for (const fixture of input.fixtures) {
    const profile = clone(fixture.profile);
    const coordinate = profile.coordinate;
    const structural = __modules.coordinateClimateProfileToStructuralPersistence(profile);
    if (structural?.status !== 'known') throw new Error('Fixture structural climate unavailable: ' + fixture.id);
    const climate = inferClientClimate(coordinate.lat, coordinate.lon);
    // Confirmed coordinates are test state. No person or actual owned Garden is
    // created or modified. No country, microclimate, shelter, or irrigation is invented.
    globalThis.data = {
      gardenLocation: {
        label: coordinate.label,
        lat: coordinate.lat,
        lon: coordinate.lon,
        climate,
        source: 'manual',
        structuralClimate: structural
      },
      location: coordinate.label,
      climate,
      weather: {}
    };
    globalThis.smartRecSession = { answers: {}, selectedAreaId: null };
    if (!hasTrustedAppLocation()) throw new Error('Fixture location was not accepted: ' + fixture.id);
    const appProfile = getAppClimateProfile();
    const locationAfterGetter = ensureGardenLocation();
    if (locationAfterGetter.lat !== coordinate.lat || locationAfterGetter.lon !== coordinate.lon) {
      throw new Error('App changed fixture coordinates: ' + fixture.id);
    }
    const protection = smartRecProtectionContext();
    if (__modules.hardGate.isExplicitFrostFreeProtectedContext(protection)) {
      throw new Error('Fixture acquired an unsupported protected-growing context: ' + fixture.id);
    }
    locations.push({
      id: fixture.id,
      coordinate: clone(coordinate),
      profilePath: fixture.profilePath,
      qaPath: fixture.qaPath,
      profileAuthorityVersion: profile.authorityVersion,
      profileConfidence: profile.confidence ?? null,
      profileConfidenceDimensions: profile.confidenceDimensions ?? null,
      profileLocalRepresentativeness: profile.localRepresentativeness ?? null,
      appClimateProfile: clone(appProfile),
      appProtectionContext: clone(protection),
      qaDiagnosticOnly: {
        appliedToScorer: false,
        qaVersion: fixture.qa.qaVersion ?? null,
        qaDate: fixture.qa.qaDate ?? null,
        confidence: fixture.qa.confidence ?? null,
        representativeness: fixture.qa.representativeness ?? null,
        divergenceSummary: fixture.qa.divergenceSummary ?? null,
        note: 'QA sidecar is reported separately; this runtime hydration path does not merge it into the pilot profile.'
      }
    });

    for (const { entry, plant } of plants) {
      const before = JSON.stringify(plant);
      const violations = [];
      let result = null;
      let error = null;
      let hardFrostInvariant = null;
      try {
        const meta = smartRecClimateMetaForPlant(plant);
        if (meta?._metaAuthority !== 'canonical-climateTraits') {
          violations.push('canonical-climate-traits-not-used');
        }
        // The actual app adapter invokes the actual scorer exactly once, then
        // actual outcome derivation and actual alignment/purpose policy.
        result = evaluateSpecificPlantSuitability(plant);
        if (!result || !result.derivedOutcomes) violations.push('missing-aligned-derived-outcomes');
        for (const key of ['suitabilityScore','survivalFit','thriveFit','floweringFit','fruitingFit']) {
          if (!Number.isFinite(result?.[key]) || result[key] < 0 || result[key] > 100) {
            violations.push('invalid-score-domain:' + key);
          }
        }
        if (!['excellent','good','borderline','blocked'].includes(result?.recommendationLevel)) {
          violations.push('unknown-recommendation-level');
        }
        if (result?.hardSurvivalBlocked === true &&
            (result.recommendationLevel !== 'blocked' ||
             result.suitabilityScore !== 0 ||
             result.positiveRecommendationEligible !== false)) {
          violations.push('hard-survival-block-not-reflected-in-final-result');
        }
        const derived = result?.derivedOutcomes || {};
        hardFrostInvariant = __modules.hardGate.hardFrostOutcomeInvariant({
          limiter: (derived.limitingFactors || []).join(' | '),
          outcomes: derived,
          survivalFit: result?.survivalFit,
          hardSurvivalBlocked: result?.hardSurvivalBlocked,
          recommendationLevel: result?.recommendationLevel
        });
        violations.push(...(hardFrostInvariant.violations || []));
        if (JSON.stringify(smartRecSession.answers) !== '{}') {
          violations.push('specific-plant-adapter-did-not-restore-empty-answers');
        }
      } catch (err) {
        error = { name: err?.name || 'Error', message: String(err?.message || err) };
        violations.push('evaluation-error');
      }
      const unchanged = JSON.stringify(plant) === before;
      if (!unchanged) violations.push('runtime-plant-input-mutated');
      pairs.push({
        locationId: fixture.id,
        plantSlug: entry.slug,
        cohort: entry.cohort,
        scientific: plant.scientific,
        result: result ? clone(result) : null,
        error,
        runtimePlantInputUnchanged: unchanged,
        hardFrostInvariant,
        contractViolations: [...new Set(violations)]
      });
    }
  }
  const inputUnchanged = JSON.stringify(input) === inputBefore;
  return {
    plantEvidence,
    locations,
    pairs,
    inputUnchanged,
    blockedNetworkAttempts: [...globalThis.__blockedNetworkCalls],
    vmCapabilities: {
      processAvailable: typeof process !== 'undefined',
      requireAvailable: typeof require !== 'undefined',
      documentAvailable: typeof document !== 'undefined',
      storageAvailable: typeof localStorage !== 'undefined' || typeof sessionStorage !== 'undefined'
    }
  };
}

/** Complete JSON-leaf comparison; missing and explicit null remain distinct. */
function jsonDiff(before, after, pointer = '') {
  const same = Object.is(before, after);
  if (same) return [];
  const bothObjects = before !== null && after !== null &&
    typeof before === 'object' && typeof after === 'object' &&
    Array.isArray(before) === Array.isArray(after);
  if (bothObjects) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((key) => {
      const token = key.replace(/~/g, '~0').replace(/\//g, '~1');
      return jsonDiff(before[key], after[key], pointer + '/' + token);
    });
  }
  return [{
    path: pointer || '/',
    before: { present: before !== undefined, value: before === undefined ? null : before },
    after: { present: after !== undefined, value: after === undefined ? null : after }
  }];
}

const DECISION_PREFIXES = [
  ...['suitabilityScore','recommendationLevel','recommendationLabel','survivalFit','thriveFit',
    'floweringFit','fruitingFit','positiveRecommendationEligible','hardSurvivalBlocked',
    'purpose','purposeFit'].map((key) => '/result/' + key),
  ...['overall','survival','growth','flowering','fruiting','overallLabel','survivalLabel',
    'growthLabel','floweringLabel','fruitingLabel','suitabilityDimensions',
    'recommendationEligibility','needsReview','protectedGrowing'].map((key) => '/result/derivedOutcomes/' + key),
  '/result/derivedOutcomes/systemicHardening/overall',
  '/result/derivedOutcomes/systemicHardening/dimensions',
  '/result/derivedOutcomes/systemicHardening/recommendationEligibility',
  ...['flowering','fruiting'].flatMap((phase) => [
    '/result/reproductiveClimateGate/' + phase + '/status',
    '/result/derivedOutcomes/reproductiveEvidence/structuredClimateGate/' + phase + '/status'
  ]),
  ...['survival','growth','flowering','fruiting'].map((key) => '/result/derivedOutcomes/evidenceStrength/' + key)
];
const isDecisionPath = (pointer) =>
  DECISION_PREFIXES.some((prefix) => pointer === prefix || pointer.startsWith(prefix + '/'));

function compareMatrix(baseline, candidate) {
  const pairKey = (pair) => pair.locationId + '/' + pair.plantSlug;
  const oldPairs = new Map(baseline.pairs.map((pair) => [pairKey(pair), pair]));
  const newPairs = new Map(candidate.pairs.map((pair) => [pairKey(pair), pair]));
  assert.equal(oldPairs.size, 42);
  assert.deepEqual([...newPairs.keys()].sort(), [...oldPairs.keys()].sort(), 'Comparison pair identities differ.');
  const pairComparisons = [];
  const decisionDiffs = [];
  const diagnosticDiffs = [];
  for (const [key, after] of newPairs) {
    const before = oldPairs.get(key);
    const changes = jsonDiff(before, after);
    const decisions = changes.filter((change) => isDecisionPath(change.path));
    const diagnostics = changes.filter((change) => !isDecisionPath(change.path));
    decisionDiffs.push(...decisions.map((change) => ({ pair: key, ...change })));
    diagnosticDiffs.push(...diagnostics.map((change) => ({ pair: key, ...change })));
    pairComparisons.push({ pair: key, decisionUnchanged: decisions.length === 0,
      decisionDiffCount: decisions.length, diagnosticDiffCount: diagnostics.length });
  }

  const oldPlants = new Map(baseline.plantEvidence.map((plant) => [plant.slug, plant]));
  assert.deepEqual([...oldPlants.keys()].sort(), candidate.plantEvidence.map((plant) => plant.slug).sort());
  const metadataDiffs = [];
  const expectedUnknownProjections = [];
  const canonicalInputDiffs = [];
  for (const after of candidate.plantEvidence) {
    const before = oldPlants.get(after.slug);
    metadataDiffs.push(...jsonDiff(before.effectiveMetaFields, after.effectiveMetaFields)
      .map((change) => ({ plantSlug: after.slug, ...change })));
    const canonicalKeys = Object.keys(before).filter((key) => key !== 'effectiveMetaFields' && key !== 'unknownBoundaryNote');
    for (const key of canonicalKeys) {
      canonicalInputDiffs.push(...jsonDiff(before[key], after[key], '/' + key)
        .map((change) => ({ plantSlug: after.slug, ...change })));
    }
    for (const field of ['needsWinterChill','needsDrySeason']) {
      if (field === 'needsDrySeason' || EXPECTED_TARGETS.includes(after.slug)) {
        expectedUnknownProjections.push({ plantSlug: after.slug, field,
          before: before.effectiveMetaFields[field], after: after.effectiveMetaFields[field],
          correct: before.effectiveMetaFields[field]?.present === true &&
            before.effectiveMetaFields[field]?.value === false &&
            after.effectiveMetaFields[field]?.present === true &&
            after.effectiveMetaFields[field]?.value === null });
      }
    }
  }
  const expectedMetadataKeys = new Set(expectedUnknownProjections.map((item) =>
    item.plantSlug + '/' + item.field + '/value'));
  const unexpectedMetadataDiffs = metadataDiffs.filter((change) =>
    !expectedMetadataKeys.has(change.plantSlug + change.path) ||
    change.before.present !== true || change.before.value !== false ||
    change.after.present !== true || change.after.value !== null);
  const locationDiffs = jsonDiff(baseline.locations, candidate.locations);

  const versionPaths = new Set([
    '/result/derivedOutcomes/systemicHardening/evaluatorVersion',
    '/result/derivedOutcomes/systemicHardening/hardeningVersion'
  ]);
  const expectedVersionValues = {
    '/result/derivedOutcomes/systemicHardening/evaluatorVersion': ['1.1.0-pre-scale-hardening','1.1.1-boolean-unknown'],
    '/result/derivedOutcomes/systemicHardening/hardeningVersion': ['1.0.0','1.0.1-boolean-unknown']
  };
  const chillPrefix = '/result/derivedOutcomes/systemicHardening/chill/';
  const expectedDiagnostic = (change) => {
    if (versionPaths.has(change.path)) {
      const [before, after] = expectedVersionValues[change.path];
      return change.before.present && change.after.present &&
        change.before.value === before && change.after.value === after;
    }
    if (!EXPECTED_TARGETS.includes(change.pair.split('/')[1])) return false;
    if (change.path === chillPrefix + 'required') {
      return change.before.present && change.before.value === false &&
        change.after.present && change.after.value === null;
    }
    if (change.path === chillPrefix + 'confidence') {
      return change.before.present && change.before.value === 'n/a' &&
        change.after.present && change.after.value === 'unknown';
    }
    if (change.path === chillPrefix + 'enoughForReliableFruit') {
      return !change.before.present && change.after.present && change.after.value === null;
    }
    return false;
  };
  const unexpectedDiagnosticDiffs = diagnosticDiffs.filter((change) => !expectedDiagnostic(change));
  const diagnosticDiffCountsByPath = {};
  for (const change of diagnosticDiffs) {
    diagnosticDiffCountsByPath[change.path] = (diagnosticDiffCountsByPath[change.path] || 0) + 1;
  }
  const failures = [];
  if (decisionDiffs.length) failures.push('unexpected-location-decision-change');
  if (locationDiffs.length) failures.push('climate-profile-or-location-input-changed');
  if (canonicalInputDiffs.length) failures.push('canonical-plant-input-changed');
  if (metadataDiffs.length !== 9 || unexpectedMetadataDiffs.length ||
      !expectedUnknownProjections.every((item) => item.correct)) {
    failures.push('effective-metadata-not-exactly-nine-approved-unknown-projections');
  }
  if (unexpectedDiagnosticDiffs.length) failures.push('unreviewed-diagnostic-delta');
  return {
    baseline: { report: BASELINE_REPORT, gitBlob: PINNED_INPUTS[BASELINE_REPORT],
      includedInBaseCommit: BASE_COMMIT, originalSourceCommit: BASELINE_SOURCE_COMMIT,
      appGitBlob: BASELINE_APP_BLOB, scorerSha256: BASELINE_SCORER_SHA256 },
    candidate: { baseCommit: BASE_COMMIT, runtime: 'Reviewed local working-tree changes; fingerprints in sourceAuthority.' },
    pairCount: newPairs.size,
    unchangedDecisionPairs: pairComparisons.filter((pair) => pair.decisionUnchanged).length,
    changedDecisionPairs: pairComparisons.filter((pair) => !pair.decisionUnchanged).length,
    decisionPaths: DECISION_PREFIXES,
    pairComparisons,
    decisionDiffs,
    diagnosticDiffs,
    diagnosticDiffCountsByPath,
    unexpectedDiagnosticDiffs,
    metadataDiffs,
    expectedUnknownProjections,
    unexpectedMetadataDiffs,
    canonicalInputDiffs,
    locationDiffs,
    climateProfilesUnchanged: locationDiffs.length === 0,
    canonicalInputsUnchanged: canonicalInputDiffs.length === 0,
    missingVersusNullPreservedInDiffs: true,
    failures
  };
}

async function main() {
  assert.equal(process.argv.length, 2, 'This bounded harness accepts no CLI options.');
  assert.equal(typeof vm.SourceTextModule, 'function',
    'Run with node --experimental-vm-modules; no packages need installation.');
  assert.equal(fs.existsSync(REPORT_PATH), false, 'Refusing to overwrite an existing report: ' + REPORT_REL);
  assert.ok(fs.statSync(path.dirname(REPORT_PATH)).isDirectory(), 'Existing report directory required.');

  const inputs = new Map();
  const inputManifest = [];
  for (const [relative, expectedBlob] of Object.entries(PINNED_INPUTS)) {
    const absolute = path.join(ROOT, relative);
    const bytes = fs.readFileSync(absolute);
    const text = bytes.toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(gitBlob(text), expectedBlob, 'Input differs from reviewed source/input identity: ' + relative);
    inputs.set(relative, { text, rawSha256: hash(bytes) });
    inputManifest.push({ path: relative, gitBlob: expectedBlob, rawSha256: hash(bytes) });
  }
  assert.equal(PINNED_INPUTS['app.html'], APP_GIT_BLOB);
  const appLines = inputs.get('app.html').text.split('\n');
  const scorerSource = appLines.slice(6609, 6975).join('\n');
  assert.equal(hash(scorerSource), SCORER_SHA256, 'Actual scorer fingerprint mismatch.');
  const allowedNewCondition = "if(smartRecMetaHasGroup(meta,'temperate-chill-fruit-tree')&&meta.needsWinterChill===true&&climateProfile.alwaysHot&&!climateProfile.coolSeasonSignal){";
  const baselineCondition = allowedNewCondition.replace('&&meta.needsWinterChill===true', '');
  assert.equal(scorerSource.split(allowedNewCondition).length - 1, 1,
    'Expected exactly one approved scorer condition delta.');
  const verificationOnlyRestoredSource = scorerSource.replace(allowedNewCondition, baselineCondition);
  assert.equal(hash(verificationOnlyRestoredSource), BASELINE_SCORER_SHA256,
    'Scorer has changes outside the single approved known-true condition.');
  // The restored copy above is used only for hashing. Only candidate source runs.
  const declarationSource = APP_RANGES.map(([first, last, expected]) => {
    const source = appLines.slice(first - 1, last).join('\n');
    assert.equal(hash(source), expected, 'App extraction range mismatch: ' + first + '-' + last);
    return '// Reviewed candidate app.html lines ' + first + '-' + last + '\n' + source;
  }).join('\n\n');

  const baseline = JSON.parse(inputs.get(BASELINE_REPORT).text);
  assert.equal(baseline.status, 'PASS', 'Baseline execution was not successful.');
  assert.equal(baseline.sourceCommit, BASELINE_SOURCE_COMMIT);
  assert.equal(baseline.sourceAuthority.appGitBlob, BASELINE_APP_BLOB);
  assert.equal(baseline.sourceAuthority.scorerSha256, BASELINE_SCORER_SHA256);
  assert.equal(baseline.pairs.length, 42);
  const catalog = JSON.parse(inputs.get(SNAPSHOT).text);
  assert.deepEqual(catalog.target_rows.map((row) => row.slug).sort(), EXPECTED_TARGETS);
  assert.deepEqual(catalog.control_rows.map((row) => row.slug).sort(), EXPECTED_CONTROLS);
  for (const entry of [...catalog.target_rows, ...catalog.control_rows]) {
    assert.equal(entry.row?.slug, entry.slug, 'Snapshot wrapper/row identity mismatch.');
    assert.ok(entry.row.climate_traits && typeof entry.row.climate_traits === 'object');
  }
  const fixtures = LOCATION_IDS.map((id) => {
    const profilePath = 'data/coordinate-climate/v2/pilot/' + id + '.json';
    const qaPath = 'data/coordinate-climate/v2/qa/' + id + '.json';
    const profile = JSON.parse(inputs.get(profilePath).text);
    const qa = JSON.parse(inputs.get(qaPath).text);
    assert.equal(profile.status, 'known', 'Unavailable profile: ' + id);
    assert.ok(String(profile.coordinate?.label || '').trim(), 'Missing fixture label: ' + id);
    assert.ok(Number.isFinite(profile.coordinate?.lat) && Math.abs(profile.coordinate.lat) <= 90);
    assert.ok(Number.isFinite(profile.coordinate?.lon) && Math.abs(profile.coordinate.lon) <= 180);
    assert.equal(qa.id, id, 'Mismatched QA identity.');
    assert.equal(qa.lat, profile.coordinate.lat, 'Mismatched QA latitude.');
    assert.equal(qa.lon, profile.coordinate.lon, 'Mismatched QA longitude.');
    for (const field of ['monthlyTminC','monthlyTmeanC','monthlyTmaxC','monthlyPrecipMm','monthlyPetMm']) {
      assert.equal(profile[field]?.length, 12, 'Incomplete climate series: ' + id + '/' + field);
      assert.ok(profile[field].every(Number.isFinite), 'Non-numeric climate series: ' + id + '/' + field);
    }
    assert.ok(Number.isFinite(profile.coldestMonthMeanMinC));
    assert.ok(Number.isFinite(profile.warmestMonthMeanMaxC));
    assert.equal(typeof profile.alwaysHot, 'boolean');
    assert.equal(typeof profile.coolSeasonSignal, 'boolean');
    return { id, profilePath, qaPath, profile, qa };
  });

  const context = vm.createContext({}, {
    name: 'cruvit-offline-climate-boolean-unknown-comparison',
    codeGeneration: { strings: false, wasm: false }
  });
  new vm.Script('(' + initializeSandbox.toString() + ')()', { filename: 'harness-sandbox-setup' })
    .runInContext(context, { timeout: 1000 });
  const moduleCache = new Map();
  const moduleDependencyGraph = {};
  const rejectDynamicImport = () => { throw new Error('Dynamic imports are forbidden in this offline harness.'); };
  const getModule = (relative) => {
    assert.ok(relative.startsWith('modules/') && relative.endsWith('.js') && inputs.has(relative),
      'Module outside pinned source allowlist: ' + relative);
    if (moduleCache.has(relative)) return moduleCache.get(relative);
    const module = new vm.SourceTextModule(inputs.get(relative).text, {
      context,
      identifier: relative,
      importModuleDynamically: rejectDynamicImport
    });
    moduleCache.set(relative, module);
    moduleDependencyGraph[relative] = [...module.dependencySpecifiers];
    return module;
  };
  const entrySource = [
    "import hardGate from './modules/suitability/hard-climate-survival-gate-v1.js';",
    "import reproductiveGate from './modules/suitability/reproductive-climate-gate-v1.js';",
    "import gardenIntelligence from './modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';",
    "import { deriveSpecificPlantOutcomes } from './modules/personal-domain/specific-plant-suitability-contract.js';",
    "import { catalogRowToRuntimePlant } from './modules/catalog/canonical-catalog-persistence-contract-v1.js';",
    "import { coordinateClimateProfileToStructuralPersistence } from './modules/personal-domain/coordinate-climate-authority-v2-contract.js';",
    'window.CruvitHardClimateSurvivalGate = hardGate;',
    'window.CruvitReproductiveClimateGate = reproductiveGate;',
    'window.CruvitSmartRecGardenIntelligence = gardenIntelligence;',
    'window.cruvitDeriveSpecificPlantOutcomes = deriveSpecificPlantOutcomes;',
    'globalThis.__modules = Object.freeze({ hardGate, catalogRowToRuntimePlant, coordinateClimateProfileToStructuralPersistence });'
  ].join('\n');
  const entryModule = new vm.SourceTextModule(entrySource, {
    context,
    identifier: '__offline_harness_entry__.mjs',
    importModuleDynamically: rejectDynamicImport
  });
  await entryModule.link((specifier, referencing) => {
    assert.ok(specifier.startsWith('./') || specifier.startsWith('../'),
      'External/builtin module import forbidden: ' + specifier);
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(referencing.identifier), specifier));
    return getModule(relative);
  });
  await entryModule.evaluate({ timeout: 10000 });
  new vm.Script(declarationSource, { filename: 'app.html-pinned-suitability-declarations' })
    .runInContext(context, { timeout: 5000 });
  context.__inputJson = JSON.stringify({ catalog, fixtures });
  const matrixJson = new vm.Script('JSON.stringify((' + runMatrixInSandbox.toString() + ')())', {
    filename: 'six-plant-location-matrix'
  }).runInContext(context, { timeout: 15000 });
  const matrix = JSON.parse(matrixJson);

  const changedInputs = inputManifest.filter((item) =>
    hash(fs.readFileSync(path.join(ROOT, item.path))) !== item.rawSha256).map((item) => item.path);
  const failures = [];
  if (matrix.pairs.length !== 42) failures.push('expected-42-pairs');
  if (new Set(matrix.pairs.map((p) => p.locationId + '/' + p.plantSlug)).size !== 42) {
    failures.push('duplicate-or-missing-pair');
  }
  if (!matrix.inputUnchanged) failures.push('in-memory-input-mutated');
  if (changedInputs.length) failures.push('source-input-file-changed');
  if (matrix.blockedNetworkAttempts.length) failures.push('network-attempted-and-blocked');
  if (Object.values(matrix.vmCapabilities).some(Boolean)) failures.push('unexpected-vm-capability');
  for (const pair of matrix.pairs) {
    for (const violation of pair.contractViolations) {
      failures.push(pair.locationId + '/' + pair.plantSlug + ':' + violation);
    }
  }
  const comparison = compareMatrix(baseline, matrix);
  failures.push(...comparison.failures);
  const summaryByPlant = Object.fromEntries([...EXPECTED_TARGETS, ...EXPECTED_CONTROLS].map((slug) => {
    const rows = matrix.pairs.filter((pair) => pair.plantSlug === slug);
    const counts = {};
    for (const row of rows) {
      const level = row.result?.recommendationLevel || 'ERROR';
      counts[level] = (counts[level] || 0) + 1;
    }
    return [slug, { pairs: rows.length, recommendationLevels: counts,
      positiveEligible: rows.filter((row) => row.result?.positiveRecommendationEligible === true).length }];
  }));

  const report = {
    kind: 'climate-boolean-unknown-comparison-20261008',
    generatedAt: new Date().toISOString(),
    baseCommit: BASE_COMMIT,
    sourceState: 'Reviewed candidate working tree; exact source identities recorded below.',
    status: failures.length ? 'FAIL' : 'PASS',
    statusMeaning: 'Execution, source fidelity, preservation, and generic product invariants only; not independent agronomic accuracy.',
    sourceAuthority: {
      appGitBlob: APP_GIT_BLOB,
      scorerSha256: SCORER_SHA256,
      entryPoint: 'app.html evaluateSpecificPlantSuitability',
      callPath: ['smartRecEvaluateSuitability','smartRecDeriveValidatedOutcomes/deriveSpecificPlantOutcomes',
        'alignSmartRecSuitabilityWithValidatedOutcomes/applyPurposePolicyToSuitability'],
      appRanges: APP_RANGES.map(([first,last,sha256]) => ({ first,last,sha256 })),
      reviewedModulesLoaded: [...moduleCache.keys()].sort(),
      approvedScorerDelta: {
        description: 'Temperate chill group penalty requires an explicitly true needsWinterChill.',
        occurrenceCount: 1,
        candidateCondition: allowedNewCondition,
        baselineCondition,
        verificationOnlyRestoredSha256: hash(verificationOnlyRestoredSource),
        matchesBaselineScorerOutsideCondition: true
      },
      moduleDependencyGraph
    },
    scope: {
      plants: 6,
      locations: 7,
      expectedPairs: 42,
      observedPairs: matrix.pairs.length,
      preferenceAnswers: {},
      gardenAreaContext: 'Unspecified; ambient outdoor exposure with no explicit frost-free protection.',
      trustedLocation: 'Test-only confirmed fixture coordinates; no real Garden or person is represented.',
      weatherInput: {},
      profileTreatment: 'Original pilot JSON -> current existing structural converter -> original app climate getters.',
      qaSidecars: 'Read-only diagnostics; not merged into scorer inputs.',
      comparisonBaseline: BASELINE_REPORT,
      coverage: '42 real scorer cases plus complete baseline result diffs; separate synthetic tri-state tests cover missing and contradictory groups.'
    },
    limits: [
      'Scores are product-policy outputs, not calibrated survival probabilities or independent horticultural ground truth.',
      'No live forecast is supplied. The original app marks weather missing and defaults forecast-derived extremeHeatRisk to low.',
      'Sun, soil, irrigation, support, cultivar, maturity, and protected-growing conditions are not established by these fixtures.',
      'Specific-plant evaluation clears browse preferences; this is not an edible-first or flowering-first recommendation scenario.',
      'UNKNOWN remains null in effective metadata; that honesty change does not supply new botanical evidence or calibrate the scores.',
      'QA confidence may differ from the pilot profile; the current hydration path does not automatically apply the QA sidecar.',
      'Catalog full-approval/readiness has no location input and is not proof of suitability at every location.',
      'This harness does not verify browser boot, live catalog acquisition, image rendering, production deployment, or live weather transport.'
    ],
    isolation: {
      executionSurface: 'Node VM with only pinned relative ECMAScript modules and selected reviewed candidate app declarations.',
      externalAndBuiltinModuleImportsDenied: true,
      dynamicImportsDenied: true,
      providerSdkAvailable: false,
      databaseClientAvailable: false,
      vmCapabilities: matrix.vmCapabilities,
      blockedNetworkAttempts: matrix.blockedNetworkAttempts,
      externalNetworkCalls: 0,
      paidAiCalls: 0,
      imageGenerationCalls: 0,
      databaseWrites: 0,
      registryWrites: 0,
      deployments: 0,
      hostWritePolicy: 'One new report file using exclusive creation; no other writes.',
      historicalArtifactsOverwritten: false
    },
    preservation: { inputFiles: inputManifest, changedInputs, inMemoryInputUnchanged: matrix.inputUnchanged },
    summaryByPlant,
    comparison,
    failures,
    plantEvidence: matrix.plantEvidence,
    locations: matrix.locations,
    pairs: matrix.pairs
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({
    status: report.status,
    statusMeaning: report.statusMeaning,
    report: REPORT_REL,
    observedPairs: matrix.pairs.length,
    unchangedDecisionPairs: comparison.unchangedDecisionPairs,
    changedDecisionPairs: comparison.changedDecisionPairs,
    metadataDiffCount: comparison.metadataDiffs.length,
    diagnosticDiffCount: comparison.diagnosticDiffs.length,
    diagnosticDiffCountsByPath: comparison.diagnosticDiffCountsByPath,
    unexpectedDiagnosticDiffCount: comparison.unexpectedDiagnosticDiffs.length,
    failures,
    summaryByPlant
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
