import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantIdentificationRuntimeViewModel,
  assertRuntimeViewModelHasNoFabricatedTruth,
} from '../modules/plant-identifier/plant-identification-runtime-view-model-v1.js';

test('missing runtime data stays unknown instead of becoming demo Monstera data', () => {
  const vm = buildPlantIdentificationRuntimeViewModel();
  assert.equal(vm.identity.commonName, null);
  assert.equal(vm.identity.scientificName, null);
  assert.equal(vm.identity.confidence, null);
  assert.equal(vm.identity.canonicalSlug, null);
  assert.equal(vm.identity.canSaveCanonical, false);
  assert.equal(vm.suitability.available, false);
  assert.equal(vm.suitability.score, null);
  assert.equal(vm.location.trusted, false);
  assert.equal(vm.save.saved, false);
  assert.equal(assertRuntimeViewModelHasNoFabricatedTruth(vm), true);
});

test('identity uses live identification plus canonical catalog display', () => {
  const vm = buildPlantIdentificationRuntimeViewModel({
    identification: {
      common_name: 'AI name',
      scientific_name: 'AI scientific',
      confidence: 0.94,
    },
    catalogMatch: {
      status: 'MATCHED_CANONICAL',
      canonicalSlug: 'monstera-deliciosa',
    },
    catalogDisplay: {
      slug: 'monstera-deliciosa',
      name: 'Monstera deliciosa',
      scientific: 'Monstera deliciosa',
      imageUrl: 'https://example.test/monstera.jpg',
    },
  });

  assert.equal(vm.identity.commonName, 'Monstera deliciosa');
  assert.equal(vm.identity.scientificName, 'Monstera deliciosa');
  assert.equal(vm.identity.confidence, 94);
  assert.equal(vm.identity.canonicalSlug, 'monstera-deliciosa');
  assert.equal(vm.identity.canSaveCanonical, true);
});

test('suitability is unavailable unless location is trusted and engine succeeds', () => {
  const untrusted = buildPlantIdentificationRuntimeViewModel({
    gardenLocationContext: {
      status: 'LOCATION_MISSING',
      useForSuitability: false,
    },
    gardenSuitability: {
      ok: true,
      survivalFit: 95,
      suitabilityScore: 90,
      recommendationLevel: 'great',
    },
  });
  assert.equal(untrusted.suitability.available, false);
  assert.equal(untrusted.suitability.survival, null);
  assert.equal(untrusted.suitability.score, null);

  const trusted = buildPlantIdentificationRuntimeViewModel({
    gardenLocationContext: {
      status: 'TRUSTED_CONFIRMED',
      useForSuitability: true,
      label: 'My Garden',
      lat: 32.9,
      lon: 35.2,
    },
    gardenSuitability: {
      ok: true,
      survivalFit: 0.95,
      thriveFit: 0.84,
      suitabilityScore: 88,
      recommendationLevel: 'good',
    },
  });
  assert.equal(trusted.suitability.available, true);
  assert.equal(trusted.suitability.survival, 95);
  assert.equal(trusted.suitability.thrive, 84);
  assert.equal(trusted.suitability.score, 88);
});

test('care fields come only from provided care data', () => {
  const vm = buildPlantIdentificationRuntimeViewModel({
    identification: {
      care: {
        light: 'Bright indirect light',
        water: 'When top soil is dry',
      },
    },
  });
  assert.equal(vm.care.light, 'Bright indirect light');
  assert.equal(vm.care.water, 'When top soil is dry');
  assert.equal(vm.care.humidity, null);
  assert.equal(vm.care.temperature, null);
});

test('saved plant state is taken from server row without health inference', () => {
  const vm = buildPlantIdentificationRuntimeViewModel({
    savedPlant: {
      id: 'p1',
      garden_profile_id: 'g1',
      status: 'unassessed',
      mark: 'unknown',
      profile_slug: 'monstera-deliciosa',
    },
  });
  assert.equal(vm.save.saved, true);
  assert.equal(vm.save.plantId, 'p1');
  assert.equal(vm.save.healthStatus, 'unassessed');
  assert.equal(vm.save.healthMark, 'unknown');
  assert.equal(vm.save.canonicalSlug, 'monstera-deliciosa');
});
