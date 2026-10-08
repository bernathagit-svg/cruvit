import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAddPlantDiscoveryViewModel,
  prepareDiscoverySelection,
} from '../modules/my-garden-v2/add-plant-discovery-view-model.js';

const lemon = {
  id: 'catalog-lemon',
  slug: 'lemon',
  scientificName: 'Citrus × limon',
  commonName: 'Lemon',
};

test('search, suggestions and popular all use canonical identity without creating Plant Instance', () => {
  const vm = buildAddPlantDiscoveryViewModel({
    searchResults: [lemon],
    recommendations: [lemon],
    popularForArea: [lemon],
    locationReliability: 'confirmed',
  });

  for (const group of [vm.search, vm.suggestions, vm.popularForArea]) {
    assert.equal(group[0].slug, 'lemon');
    assert.equal(group[0].gardenPlantId, null);
  }
});

test('Popular for your area is withheld when location is not reliable', () => {
  const vm = buildAddPlantDiscoveryViewModel({
    popularForArea: [lemon],
    locationReliability: 'unknown',
  });

  assert.equal(vm.popularForAreaAvailable, false);
  assert.deepEqual(vm.popularForArea, []);
});

test('selecting a discovery result still requires explicit Add confirmation', () => {
  const vm = buildAddPlantDiscoveryViewModel({
    searchResults: [lemon],
  });

  const intent = prepareDiscoverySelection(vm.search[0]);
  assert.equal(intent.gardenPlantId, null);
  assert.equal(intent.requiresExplicitAddConfirmation, true);
});

test('catalog candidate without canonical identity fails loudly', () => {
  assert.throws(
    () => buildAddPlantDiscoveryViewModel({
      searchResults: [{ name: 'Mystery plant' }],
    }),
    /canonical_candidate_identity_required/
  );
});
