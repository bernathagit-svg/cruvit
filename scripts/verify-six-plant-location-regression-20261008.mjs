#!/usr/bin/env node
/**
 * Six corrected catalog plants x seven committed location fixtures.
 *
 * Runs the unchanged app.html specific-plant scorer, outcome derivation, and
 * final alignment in a capability-limited VM. No HTML boot, network, database,
 * process spawning, paid AI, image generation, deployment, or registry write.
 *
 * Run from the pinned repository:
 *   node --experimental-vm-modules scripts/verify-six-plant-location-regression-20261008.mjs
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
const COMMIT = 'eee0ab34c909ca0323fef32e8f65ddd2dc9eae95';
const APP_GIT_BLOB = 'dcc93a929c9dfce6e4466cd89d3e56d6288b4db2';
const SCORER_SHA256 = '6a034c7c1ecdb4754ffbe7e2360cff4136c0efc63ba298d4ffa911eacc5a8183';
const SNAPSHOT = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-climate-supplement-2026-10-07-v1/catalog-after.json';
const REPORT_REL = 'tests/_six-plant-location-regression-20261008-report.json';
const REPORT_PATH = path.join(ROOT, REPORT_REL);
const LOCATION_IDS = ['yehiam', 'helsinki', 'singapore', 'kochi', 'cairo', 'tokyo', 'quito'];
const EXPECTED_TARGETS = ['date-palm', 'mango', 'monstera'];
const EXPECTED_CONTROLS = ['bigleaf-hydrangea', 'fig', 'lettuce'];

// Git tree identities from COMMIT. CRLF checkout conversion is accepted only
// when normalization reproduces the exact committed UTF-8 blob.
const PINNED_INPUTS = {
  "app.html": "dcc93a929c9dfce6e4466cd89d3e56d6288b4db2",
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
  "modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js": "f8314393304304fcf9e1dff76a7b3f34149418d0",
  "modules/personal-domain/specific-plant-suitability-contract.js": "654f76e8eb55315a1e43e669d91007aeee2a3fcc",
  "modules/personal-domain/structural-climate-authority-v1.js": "a82547129d047a43ca423b753109a13802200e39",
  "modules/smart-recommendations/smart-rec-garden-intelligence-v1.js": "9fbc5afa31c6d21aa44b23354392578feb4afc51",
  "modules/smart-recommendations/smart-rec-purpose-policy-v1.js": "740bfd08e9d28d5cd6ca94001d3cfde219438567",
  "modules/suitability/hard-climate-survival-gate-v1.js": "9788eb10440f6e24186f2c506710a0685f7fa621",
  "modules/suitability/reproductive-climate-gate-v1.js": "bd67342b49475a1d5d7ba143a8087d0f432d665e"
};

const APP_RANGES = [
  [1231,1796,'1e73239cd969f66f168bbb5b1b1fa86181887be7efc0493298e1b01c5c671cc9'],
  [2068,2114,'b00bdc0e582cdffff9921077a48bbc4877fca5d8d0f5c7c911fa2fb393103664'],
  [2176,2222,'a45c574040bd8bfe12c5927d4d9295b1131a546492213db4f3fdb88e3ff4b787'],
  [3742,3742,'bce799d289c8319506cc24d40fa308fe55fd2a6a96648a3f457d4bc23a33b894'],
  [3748,3771,'9c4814bb69c84e01ad88978a2fd7dee6d0fc940e90ba2d4f08964444aef0554a'],
  [3822,3825,'68a3ea67a767a320025505dff646d5966a15c32d8a73d618abc55fcbdd3be978'],
  [4115,4122,'ef4d05349cc45cae82e009d33fee231b95ce0aad445d3a1bd684312ec56c82ef'],
  [4223,4230,'baf99c5e752bedd764437016829ac7f9269f05e3247ab4b96d64e6ebbfa0bcd5'],
  [4248,4298,'3d09b846e03fda4f50a76c8a351bed6dbab02163633fd12a101b2c9a9e202622'],
  [6130,6211,'73c6456b75d9a84d2fe0c2a2b13279bda53430e52dea4b345d7ad26e24c09b83'],
  [6225,6922,'b9f57c66df6a8d3e3941cc388231fdb7c6b5e19196cf0b9af7677b91313bbcbf'],
  [6940,6988,'f1e7fa77652713943f0f5bcfa2577e77fe18bcbb5b60548e1c8ba2503c7221e0'],
  [7002,7019,'c2e69fda7ca758041e2c707164aa535cdfbb36083bf7e64474d007a650d2715e'],
  [7117,7117,'3e1bfd57ec42d8366f426f5ca22be425e365749e99ad082e00b056ea0bfeb649']
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
        'Canonical null/missing/UNKNOWN remains unchanged. An effective app boolean false may be a merge default and is not a botanical assertion.'
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
    assert.equal(gitBlob(text), expectedBlob, 'Input differs from pinned commit: ' + relative);
    inputs.set(relative, { text, rawSha256: hash(bytes) });
    inputManifest.push({ path: relative, gitBlob: expectedBlob, rawSha256: hash(bytes) });
  }
  assert.equal(PINNED_INPUTS['app.html'], APP_GIT_BLOB);
  const appLines = inputs.get('app.html').text.split('\n');
  const scorerSource = appLines.slice(6556, 6922).join('\n');
  assert.equal(hash(scorerSource), SCORER_SHA256, 'Actual scorer fingerprint mismatch.');
  const declarationSource = APP_RANGES.map(([first, last, expected]) => {
    const source = appLines.slice(first - 1, last).join('\n');
    assert.equal(hash(source), expected, 'App extraction range mismatch: ' + first + '-' + last);
    return '// Unchanged app.html lines ' + first + '-' + last + '\n' + source;
  }).join('\n\n');

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
    name: 'cruvit-offline-six-plant-location-regression',
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
    kind: 'six-plant-location-regression-20261008',
    generatedAt: new Date().toISOString(),
    sourceCommit: COMMIT,
    status: failures.length ? 'FAIL' : 'PASS',
    statusMeaning: 'Execution, source fidelity, preservation, and generic product invariants only; not independent agronomic accuracy.',
    sourceAuthority: {
      appGitBlob: APP_GIT_BLOB,
      scorerSha256: SCORER_SHA256,
      entryPoint: 'app.html evaluateSpecificPlantSuitability',
      callPath: ['smartRecEvaluateSuitability','smartRecDeriveValidatedOutcomes/deriveSpecificPlantOutcomes',
        'alignSmartRecSuitabilityWithValidatedOutcomes/applyPurposePolicyToSuitability'],
      appRanges: APP_RANGES.map(([first,last,sha256]) => ({ first,last,sha256 })),
      unchangedModulesLoaded: [...moduleCache.keys()].sort(),
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
      comparisonBaseline: 'No prior score matrix is asserted; this observes the corrected catalog snapshot.',
      prior87Tests: 'Separate data/provenance/readiness suite; this adds actual scorer x location coverage.'
    },
    limits: [
      'Scores are product-policy outputs, not calibrated survival probabilities or independent horticultural ground truth.',
      'No live forecast is supplied. The original app marks weather missing and defaults forecast-derived extremeHeatRisk to low.',
      'Sun, soil, irrigation, support, cultivar, maturity, and protected-growing conditions are not established by these fixtures.',
      'Specific-plant evaluation clears browse preferences; this is not an edible-first or flowering-first recommendation scenario.',
      'Canonical UNKNOWN remains explicit even where the existing metadata merge yields an internal false/default value.',
      'QA confidence may differ from the pilot profile; the current hydration path does not automatically apply the QA sidecar.',
      'Catalog full-approval/readiness has no location input and is not proof of suitability at every location.',
      'This harness does not verify browser boot, live catalog acquisition, image rendering, production deployment, or live weather transport.'
    ],
    isolation: {
      executionSurface: 'Node VM with only pinned relative ECMAScript modules and selected unchanged app declarations.',
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
    failures,
    summaryByPlant
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
