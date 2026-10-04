import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMyPlantsViewModel } from '../modules/my-garden-v2/my-plants-view-model.js';
import {
  buildPlantDetailBaseViewModel,
  assertPlantDetailIdentity,
} from '../modules/my-garden-v2/plant-detail-base-view-model.js';

const plants = [
  {
    id: 'p1',
    garden_profile_id: 'g1',
    client_instance_id: 'client-lemon-1',
    name: 'Lemon tree',
    scientific: 'Citrus limon',
    status: 'Growing well',
    archived: false,
    garden_area_id: 'a1',
    cover_media_id: 'm1',
    profile_slug: 'citrus-limon',
  },
  {
    id: 'p2',
    garden_profile_id: 'g1',
    name: 'Archived rose',
    archived: true,
  },
];

const areas = [
  { id: 'a1', garden_profile_id: 'g1', name: 'Backyard' },
];

const media = [
  {
    id: 'm1',
    garden_profile_id: 'g1',
    garden_plant_id: 'p1',
    purpose: 'plant_profile',
    validation_state: 'validated',
    storage_bucket: 'user-garden-media',
    storage_path: 'u/g/m1/lemon.jpg',
    mime_type: 'image/jpeg',
  },
];

test('My Plants and Plant Detail share exact Plant Instance projection', () => {
  const myPlants = buildMyPlantsViewModel({ plants, areas, media });
  const listCard = myPlants.cards.find((x) => x.id === 'p1');

  const detail = buildPlantDetailBaseViewModel({
    plantId: 'p1',
    plants,
    areas,
    media,
    activeTab: 'overview',
  });

  assert.equal(detail.plant.id, listCard.id);
  assert.equal(detail.plant.clientInstanceId, listCard.clientInstanceId);
  assert.deepEqual(detail.plant.area, listCard.area);
  assert.deepEqual(detail.plant.cover, listCard.cover);
  assert.equal(detail.plant.status, listCard.status);
  assert.equal(assertPlantDetailIdentity(detail), true);
});

test('all four approved tabs keep the same plant identity', () => {
  for (const activeTab of ['overview', 'care', 'schedule', 'history']) {
    const detail = buildPlantDetailBaseViewModel({
      plantId: 'p1',
      plants,
      areas,
      media,
      activeTab,
    });
    assert.equal(detail.plant.id, 'p1');
    assert.equal(detail.activeTab, activeTab);
  }
});

test('unknown plant ID fails instead of substituting another plant', () => {
  assert.throws(
    () => buildPlantDetailBaseViewModel({
      plantId: 'missing',
      plants,
      areas,
      media,
    }),
    /plant_not_found:missing/
  );
});

test('archived plant is read-only but preserves exact identity', () => {
  const detail = buildPlantDetailBaseViewModel({
    plantId: 'p2',
    plants,
    areas,
    media,
    activeTab: 'history',
  });
  assert.equal(detail.plant.id, 'p2');
  assert.equal(detail.readOnly, true);
  assert.equal(detail.photoAction, null);
  assert.equal(detail.restoreSystemPhotoAction, null);
});

test('invalid tab fails loudly', () => {
  assert.throws(
    () => buildPlantDetailBaseViewModel({
      plantId: 'p1',
      plants,
      areas,
      media,
      activeTab: 'doctor',
    }),
    /invalid_plant_detail_tab/
  );
});
