/**
 * Plant Identifier location context closure.
 * Zero paid AI. Fixtures only. Does not call Anthropic / plant-identify.
 *
 * Run: node --test tests/plant-identifier-location-context-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDENTIFIER_SUITABILITY_ENGINE,
  LOCATION_MISSING,
  TRUSTED_CONFIRMED,
  UNTRUSTED_NEEDS_CONFIRMATION,
  applyIdentifierGardenSuitability,
  classifyIdentifierGardenLocationContext,
  identifierClimateUiMode,
  identifierShouldShowAddLocationCopy,
  identifierShouldShowLocationEntry,
  identifierSuitabilityViewModel
} from '../modules/plant-identifier/plant-identifier-location-context-v1.js';
import { smartRecDimensionDisplay } from '../modules/smart-recommendations/smart-rec-garden-intelligence-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { isPaidPlantIdentifierAllowed } from '../modules/runtime-guards/paid-plant-identifier-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const PI = path.join(ROOT, 'modules', 'plant-identifier', 'plant-identifier.js');
const LOC = path.join(ROOT, 'modules', 'plant-identifier', 'plant-identifier-location-context-v1.js');

let paidNetwork = 0;
const origFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const u = String(url || '');
  if (/anthropic|api\.openai|plant-identify|claude/i.test(u)) paidNetwork += 1;
  throw new Error('network forbidden in plant-identifier-location-context-v1 tests: ' + u);
};

const ADD_LOCATION = 'Add your location to check climate compatibility.';

function trustedGardenFixture(overrides = {}) {
  return Object.assign(
    {
      trusted: true,
      label: 'Mojstrana, Slovenia',
      lat: 46.5036,
      lon: 13.8675,
      source: 'manual',
      confirmationStatus: 'confirmed',
      gardenProfileId: 'garden-profile-fixture-1',
      climateAuthority: 'coordinate-climate-v2',
      locationConfidence: 'high'
    },
    overrides
  );
}

test('A. trusted active Garden location automatically reaches Identifier', () => {
  const classified = classifyIdentifierGardenLocationContext(trustedGardenFixture());
  assert.equal(classified.status, TRUSTED_CONFIRMED);
  assert.equal(classified.useForSuitability, true);
  assert.equal(classified.askForLocation, false);
  assert.equal(classified.lat, 46.5036);
  assert.equal(classified.lon, 13.8675);
  assert.equal(classified.gardenProfileId, 'garden-profile-fixture-1');
  assert.equal(classified.climateAuthority, 'coordinate-climate-v2');
  assert.equal(classified.locationConfidence, 'high');
  assert.equal(classified.confirmationStatus, 'confirmed');

  const result = { common_name: 'Lemon Tree', scientific_name: 'Citrus × limon' };
  const evaluation = {
    ok: true,
    engine: IDENTIFIER_SUITABILITY_ENGINE,
    paidAiCalls: 0,
    locationLabel: classified.label,
    gardenProfileId: classified.gardenProfileId,
    outcomes: smartRecDimensionDisplay(
      { survivalFit: 40, thriveFit: 35, floweringFit: 30, fruitingFit: 20 },
      {
        floweringRequirements: 'Warm summers.',
        fruitingRequirements: 'Heat and low frost.'
      },
      {}
    ),
    primaryLimiter: 'Frost risk is too high for this plant.',
    survivalFit: 40,
    thriveFit: 35,
    floweringFit: 30,
    fruitingFit: 20,
    recommendationLevel: 'blocked'
  };
  applyIdentifierGardenSuitability(result, classified, evaluation);
  assert.equal(result._gardenLocationContext.status, TRUSTED_CONFIRMED);
  assert.equal(result._gardenSuitability.ok, true);
  assert.equal(result._gardenSuitability.engine, IDENTIFIER_SUITABILITY_ENGINE);
  assert.equal(result._gardenSuitability.locationLabel, 'Mojstrana, Slovenia');
  assert.equal(identifierClimateUiMode(classified, result._gardenSuitability), 'garden-suitability');
});

test('B. Identifier does not ask again for location when trusted', () => {
  const classified = classifyIdentifierGardenLocationContext(trustedGardenFixture());
  assert.equal(identifierShouldShowAddLocationCopy(classified), false);
  assert.equal(identifierShouldShowLocationEntry(classified), false);
  assert.notEqual(identifierShouldShowAddLocationCopy(classified) ? ADD_LOCATION : '', ADD_LOCATION);

  const pi = fs.readFileSync(PI, 'utf8');
  assert.match(pi, /getGardenLocationContext/);
  assert.match(pi, /evaluateIdentifierGardenSuitability/);
  assert.match(pi, /identifierShouldShowAddLocationCopy/);
  assert.match(pi, /evaluatingGarden/);
  assert.match(pi, /function climateLocationPromptHtml/);
  assert.match(pi, /showAdd \? '<p class="pi-muted">' \+ esc\(t\('climateUnknown'\)\) \+ '<\/p>' : ''/);
  const app = fs.readFileSync(APP, 'utf8');
  assert.match(app, /getGardenLocationContext:getIdentifierGardenLocationContext/);
  assert.match(app, /evaluateIdentifierGardenSuitability/);
  assert.match(app, /plant-identifier-location-context-v1\.js/);
});

test('C. untrusted location still requires confirmation', () => {
  const presentUntrusted = classifyIdentifierGardenLocationContext({
    trusted: false,
    label: 'Mojstrana, Municipality of Kranjska Gora, Slovenia',
    lat: 46.5036,
    lon: 13.8675,
    source: 'manual',
    confirmationStatus: 'pending',
    gardenProfileId: 'garden-profile-fixture-1',
    locationConfidence: 'medium'
  });
  assert.equal(presentUntrusted.status, UNTRUSTED_NEEDS_CONFIRMATION);
  assert.equal(presentUntrusted.useForSuitability, false);
  assert.equal(presentUntrusted.askForLocation, true);
  assert.equal(presentUntrusted.lat, null);
  assert.equal(presentUntrusted.lon, null);
  assert.equal(identifierShouldShowAddLocationCopy(presentUntrusted), true);
  assert.equal(identifierShouldShowLocationEntry(presentUntrusted), true);
  assert.equal(identifierClimateUiMode(presentUntrusted, null), 'ask-location');

  const result = {};
  applyIdentifierGardenSuitability(result, presentUntrusted, {
    ok: true,
    engine: IDENTIFIER_SUITABILITY_ENGINE,
    outcomes: { survival: 'strong', growth: 'strong', flowering: 'strong', fruiting: 'strong' }
  });
  assert.equal(result._gardenSuitability, null);
});

test('D. no fallback location is fabricated', () => {
  const defaultLoc = classifyIdentifierGardenLocationContext({
    trusted: false,
    label: 'Western Galilee, Israel',
    lat: 33.0089,
    lon: 35.0941,
    source: 'default',
    confirmationStatus: 'default',
    locationConfidence: 'default'
  });
  assert.equal(defaultLoc.status, UNTRUSTED_NEEDS_CONFIRMATION);
  assert.equal(defaultLoc.useForSuitability, false);
  assert.equal(defaultLoc.lat, null);
  assert.equal(defaultLoc.lon, null);
  assert.equal(defaultLoc.reason, 'default-untrusted');

  const confirmedNoCoords = classifyIdentifierGardenLocationContext({
    trusted: true,
    label: 'Mojstrana, Slovenia',
    confirmationStatus: 'confirmed',
    source: 'manual',
    locationConfidence: 'high'
  });
  assert.equal(confirmedNoCoords.status, LOCATION_MISSING);
  assert.equal(confirmedNoCoords.useForSuitability, false);
  assert.equal(confirmedNoCoords.lat, null);
  assert.equal(confirmedNoCoords.lon, null);

  const missing = classifyIdentifierGardenLocationContext({});
  assert.equal(missing.status, LOCATION_MISSING);
  assert.equal(missing.lat, null);
  assert.equal(missing.lon, null);

  const locSrc = fs.readFileSync(LOC, 'utf8');
  const pi = fs.readFileSync(PI, 'utf8');
  assert.doesNotMatch(locSrc, /33\.0089/);
  assert.doesNotMatch(locSrc, /Western Galilee/);
  assert.doesNotMatch(locSrc, /Mojstrana/);
  assert.doesNotMatch(pi, /Mojstrana/);
});

test('E. suitability uses existing engine', () => {
  const app = fs.readFileSync(APP, 'utf8');
  const fn = app.match(
    /function evaluateIdentifierGardenSuitability\(canonicalSlug\)\{[\s\S]*?\nasync function commitIdentifiedPlantFromModule/
  );
  assert.ok(fn, 'evaluateIdentifierGardenSuitability missing');
  assert.match(fn[0], /evaluateSpecificPlantSuitability/);
  assert.match(fn[0], /smartRecEvaluateSuitability/);
  assert.match(fn[0], /smartRecDimensionDisplay/);
  assert.match(fn[0], /engine:'smartRecEvaluateSuitability'/);
  assert.doesNotMatch(fn[0], /fetchLocalizedCare/);
  assert.doesNotMatch(fn[0], /plant-identify/);
  assert.doesNotMatch(fn[0], /lemon/);
  assert.doesNotMatch(fn[0], /Mojstrana/);

  const classified = classifyIdentifierGardenLocationContext(trustedGardenFixture());
  const evaluation = {
    ok: true,
    engine: IDENTIFIER_SUITABILITY_ENGINE,
    paidAiCalls: 0,
    outcomes: smartRecDimensionDisplay(
      { survivalFit: 80, thriveFit: 50, floweringFit: 20, fruitingFit: 10 },
      { floweringRequirements: 'sun', fruitingRequirements: 'heat' },
      {}
    )
  };
  assert.equal(evaluation.engine, 'smartRecEvaluateSuitability');
  const vm = identifierSuitabilityViewModel(evaluation);
  assert.equal(vm.engine, 'smartRecEvaluateSuitability');
  assert.equal(classified.engine, 'smartRecEvaluateSuitability');
});

test('F. Survival / Growth / Flowering / Fruiting semantics preserved', () => {
  const dims = smartRecDimensionDisplay(
    { survivalFit: 85, thriveFit: 40, floweringFit: 70, fruitingFit: 10 },
    { floweringRequirements: '', fruitingRequirements: 'needs winter chill' },
    {}
  );
  assert.equal(dims.survival, 'strong');
  assert.equal(dims.growth, 'limited');
  assert.equal(dims.flowering, 'UNKNOWN');
  assert.equal(dims.fruiting, 'weak');

  const vm = identifierSuitabilityViewModel({
    ok: true,
    engine: IDENTIFIER_SUITABILITY_ENGINE,
    locationLabel: 'Fixture Garden',
    outcomes: dims,
    primaryLimiter: 'Reliable fruiting is unlikely without winter chill or a clear cool season.',
    survivalFit: 85,
    thriveFit: 40,
    floweringFit: 70,
    fruitingFit: 10
  });
  assert.equal(vm.showCollapsedScore, false);
  assert.equal(vm.outcomes.survival, 'strong');
  assert.equal(vm.outcomes.growth, 'limited');
  assert.equal(vm.outcomes.flowering, 'UNKNOWN');
  assert.equal(vm.outcomes.fruiting, 'weak');
  assert.match(vm.primaryLimiter, /winter chill/);

  const pi = fs.readFileSync(PI, 'utf8');
  assert.match(pi, /survivalDim/);
  assert.match(pi, /growthDim/);
  assert.match(pi, /floweringDim/);
  assert.match(pi, /fruitingDim/);
  assert.match(pi, /pi-outcomes/);
});

test('G. observation photo remains separate from catalog image', () => {
  const pi = fs.readFileSync(PI, 'utf8');
  assert.match(pi, /observationPhoto/);
  assert.match(pi, /pi-plant-photo/);
  assert.match(pi, /pi-catalog-photo/);
  assert.match(pi, /catalogIdentity/);
  assert.doesNotMatch(pi, /scanPhotoUrl.*=.*catalog/);
});

test('H. no paid AI automated calls', () => {
  assert.equal(isPaidAiAutomatedTestAllowed(), false);
  assert.equal(isPaidPlantIdentifierAllowed(), false);
  const pi = fs.readFileSync(PI, 'utf8');
  assert.doesNotMatch(pi, /applyGardenLocationContext[\s\S]{0,400}plant-identify/);
  assert.doesNotMatch(pi, /evaluateIdentifierGardenSuitability[\s\S]{0,200}fetchLocalizedCare/);
  assert.equal(paidNetwork, 0);
  globalThis.fetch = origFetch;
});
