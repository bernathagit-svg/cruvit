import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMyPlantsViewModel,
  filterMyPlantsCards,
  assertMyPlantsIdentity,
} from '../modules/my-garden-v2/my-plants-view-model.js';

const plants = [
  {
    id: 'p1',
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
    name: 'Rose',
    scientific: 'Rosa',
    status: 'Needs a check',
    archived: false,
    garden_area_id: 'a2',
    cover_media_id: null,
    profile_slug: 'rosa',
  },
  { id: 'p3', name: 'Archived olive', archived: true },
];

const areas = [
  { id: 'a1', name: 'Backyard' },
  { id: 'a2', name: 'Front garden' },
];

const media = [
  {
    id: 'm1',
    garden_plant_id: 'p1',
    purpose: 'plant_profile',
    validation_state: 'validated',
    storage_bucket: 'user-garden-media',
    storage_path: 'u/g/m1/lemon.jpg',
    mime_type: 'image/jpeg',
  },
];

test('My Plants exposes one card per active Plant Instance', () => {
  const vm = buildMyPlantsViewModel({ plants, areas, media });
  assert.equal(vm.activeCount, 2);
  assert.equal(vm.archivedCount, 1);
  assert.deepEqual(vm.cards.map((x) => x.id), ['p1', 'p2']);
  assert.equal(assertMyPlantsIdentity(vm), true);
});

test('camera action is always scoped to the exact plant instance', () => {
  const vm = buildMyPlantsViewModel({ plants, areas, media });
  for (const card of vm.cards) {
    assert.deepEqual(card.cameraAction, {
      action: 'replace_plant_photo',
      plantId: card.id,
    });
  }
});

test('validated plant-scoped cover resolves to personal photo', () => {
  const vm = buildMyPlantsViewModel({ plants, areas, media });
  const lemon = vm.cards.find((x) => x.id === 'p1');
  assert.equal(lemon.cover.kind, 'personal');
  assert.equal(lemon.cover.personalMediaId, 'm1');
  assert.equal(lemon.area.areaName, 'Backyard');
  assert.equal(lemon.positionLabel, null);
});

test('missing personal cover falls back to CRUVIT system image without substitution', () => {
  const vm = buildMyPlantsViewModel({ plants, areas, media });
  const rose = vm.cards.find((x) => x.id === 'p2');
  assert.equal(rose.cover.kind, 'system');
  assert.equal(rose.cover.systemImageKey, 'rosa');
});

test('unvalidated or unscoped media never silently becomes a plant cover', () => {
  const pending = [{ ...media[0], validation_state: 'pending' }];
  const vm1 = buildMyPlantsViewModel({ plants, areas, media: pending });
  assert.equal(vm1.cards[0].cover.kind, 'system');
  assert.equal(vm1.cards[0].cover.unavailableReason, 'cover_media_not_validated');

  const unscoped = [{ ...media[0], garden_plant_id: null }];
  const vm2 = buildMyPlantsViewModel({ plants, areas, media: unscoped });
  assert.equal(vm2.cards[0].cover.kind, 'system');
  assert.equal(vm2.cards[0].cover.unavailableReason, 'cover_media_not_plant_scoped');
});

test('cross-plant cover mismatch fails loudly', () => {
  assert.throws(
    () => buildMyPlantsViewModel({
      plants,
      areas,
      media: [{ ...media[0], garden_plant_id: 'p2' }],
    }),
    /cover_media_plant_mismatch/
  );
});

test('search filters cards without creating a second plant record set', () => {
  const vm = buildMyPlantsViewModel({ plants, areas, media });
  assert.deepEqual(filterMyPlantsCards(vm.cards, 'Citrus').map((x) => x.id), ['p1']);
  assert.deepEqual(filterMyPlantsCards(vm.cards, 'Front').map((x) => x.id), ['p2']);
});
