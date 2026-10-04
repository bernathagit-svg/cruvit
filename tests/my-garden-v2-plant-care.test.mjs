import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlantCareViewModel,
  assertCareScheduleBoundary,
} from '../modules/my-garden-v2/plant-care-view-model.js';

const plants = [{
  id: 'p1',
  name: 'Lemon tree',
  archived: false,
}];

const tasks = [{
  id: 't1',
  garden_plant_id: 'p1',
  title: 'Review citrus feed',
  due_on: '2026-11-06',
  done: false,
}];

test('Care may reference a Schedule task but cannot copy its date', () => {
  const vm = buildPlantCareViewModel({
    plantId: 'p1',
    plants,
    tasks,
    careGuidance: {
      sections: {
        fertilizing: {
          summary: 'Citrus feed',
          source: 'catalog-care-v1',
          linkedTaskId: 't1',
        },
      },
    },
  });

  const fertilizing = vm.sections.find((x) => x.id === 'fertilizing');
  assert.equal(fertilizing.linkedTaskId, 't1');
  assert.equal(fertilizing.linkedTask.dueOn, '2026-11-06');
  assert.equal(assertCareScheduleBoundary(vm), true);
});

test('Care guidance cannot own a duplicate task date', () => {
  assert.throws(
    () => buildPlantCareViewModel({
      plantId: 'p1',
      plants,
      tasks,
      careGuidance: {
        sections: {
          fertilizing: {
            summary: 'Citrus feed',
            source: 'catalog-care-v1',
            linkedTaskId: 't1',
            nextReviewDate: '2026-11-06',
          },
        },
      },
    }),
    /care_section_must_not_own_task_date/
  );
});

test('garden-adapted climate guidance requires confirmed location reliability', () => {
  assert.throws(
    () => buildPlantCareViewModel({
      plantId: 'p1',
      plants,
      tasks,
      locationReliability: 'unknown',
      careGuidance: {
        sections: {
          temperature_climate: {
            summary: 'Protect from frost',
            source: 'climate-care-v1',
            adaptedToGarden: true,
          },
        },
      },
    }),
    /care_climate_adaptation_requires_confirmed_location/
  );

  const vm = buildPlantCareViewModel({
    plantId: 'p1',
    plants,
    tasks,
    locationReliability: 'confirmed',
    careGuidance: {
      sections: {
        temperature_climate: {
          summary: 'Protect from frost',
          source: 'climate-care-v1',
          adaptedToGarden: true,
        },
      },
    },
  });
  assert.equal(vm.locationReliability, 'confirmed');
});

test('missing warning data remains unknown rather than implying safety', () => {
  const vm = buildPlantCareViewModel({
    plantId: 'p1',
    plants,
    tasks,
    careGuidance: { sections: {} },
  });
  const warnings = vm.sections.find((x) => x.id === 'warnings_safety');
  assert.equal(warnings.summary, null);
  assert.equal(warnings.unknown, true);
  assert.equal(vm.warningsKnown, false);
});

test('non-empty care guidance requires provenance', () => {
  assert.throws(
    () => buildPlantCareViewModel({
      plantId: 'p1',
      plants,
      tasks,
      careGuidance: {
        sections: {
          watering: { summary: 'Keep soil evenly moist' },
        },
      },
    }),
    /care_guidance_source_required/
  );
});
