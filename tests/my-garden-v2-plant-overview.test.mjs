import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantOverviewViewModel,
  assertOverviewNoSilentInference,
} from '../modules/my-garden-v2/plant-overview-view-model.js';

const plants = [{
  id: 'p1',
  garden_profile_id: 'g1',
  name: 'Lemon tree',
  scientific: 'Citrus × limon',
  status: 'Growing well',
  profile_slug: 'lemon',
  archived: false,
  added_at: '2026-09-01T10:00:00Z',
}];

test('Overview does not relabel added_at as planting date', () => {
  const vm = buildPlantOverviewViewModel({ plantId: 'p1', plants });
  assert.equal(vm.addedToCruvitAt, '2026-09-01T10:00:00Z');
  assert.equal(vm.plantedOn, null);
});

test('botanical size authority does not become personal tree measurement', () => {
  const vm = buildPlantOverviewViewModel({
    plantId: 'p1',
    plants,
    plantKnowledge: {
      slug: 'lemon',
      scientificName: 'Citrus × limon',
      tags: ['Fruit tree', 'Evergreen'],
      sizeAuthority: {
        runtimeAuthority: 'RUNTIME_AUTHORITY_USER_CONTEXT_REQUIRED',
        normalizedRange: null,
      },
    },
  });

  assert.equal(vm.measurements.heightM, null);
  assert.equal(vm.measurements.canopyM, null);
  assert.deepEqual(vm.tags, ['Fruit tree', 'Evergreen']);
});

test('explicit plant observation may populate personal height and canopy', () => {
  const vm = buildPlantOverviewViewModel({
    plantId: 'p1',
    plants,
    plantObservation: {
      heightM: 2.5,
      canopyM: 2,
      source: 'user_measurement',
    },
  });

  assert.equal(vm.measurements.heightM, 2.5);
  assert.equal(vm.measurements.canopyM, 2);
  assert.equal(assertOverviewNoSilentInference(vm), true);
});

test('current bloom/fruit state requires explicit phenology projection source', () => {
  const vm = buildPlantOverviewViewModel({
    plantId: 'p1',
    plants,
    phenologyProjection: {
      blooming: true,
      fruiting: 'in_progress',
      currentPhase: 'fruiting',
      source: 'climate-aware-phenology-v1',
      phases: [
        { id: 'growth', label: 'Growth', startMonth: 3, endMonth: 5, active: false },
        { id: 'fruiting', label: 'Fruiting', startMonth: 7, endMonth: 10, active: true },
      ],
    },
  });

  assert.equal(vm.phenology.blooming, true);
  assert.equal(vm.phenology.fruiting, 'in_progress');
  assert.equal(assertOverviewNoSilentInference(vm), true);
});

test('phenology without provenance fails validation', () => {
  const vm = buildPlantOverviewViewModel({
    plantId: 'p1',
    plants,
    phenologyProjection: { blooming: true },
  });

  assert.throws(() => assertOverviewNoSilentInference(vm), /phenology_source_required/);
});

test('knowledge for another canonical plant cannot be attached silently', () => {
  assert.throws(
    () => buildPlantOverviewViewModel({
      plantId: 'p1',
      plants,
      plantKnowledge: {
        slug: 'orange',
        scientificName: 'Citrus sinensis',
      },
    }),
    /plant_knowledge_slug_mismatch/
  );
});
