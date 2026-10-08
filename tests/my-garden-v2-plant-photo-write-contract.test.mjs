import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareSetPlantCoverIntent,
  prepareRestoreSystemPhotoIntent,
  assertPhotoIntentPreservesHistory,
} from '../modules/my-garden-v2/plant-photo-write-contract.js';

const media = {
  id: 'm1',
  garden_profile_id: 'g1',
  garden_plant_id: 'p1',
  purpose: 'plant_profile',
  validation_state: 'validated',
};

test('personal cover is scoped to exact plant instance', () => {
  const intent = prepareSetPlantCoverIntent({
    gardenProfileId: 'g1',
    plantId: 'p1',
    media,
  });
  assert.equal(intent.coverMediaId, 'm1');
  assert.equal(intent.plantId, 'p1');
  assert.equal(assertPhotoIntentPreservesHistory(intent), true);
});

test('cross-plant cover is rejected', () => {
  assert.throws(
    () => prepareSetPlantCoverIntent({
      gardenProfileId: 'g1',
      plantId: 'p2',
      media,
    }),
    /cover_media_plant_mismatch/
  );
});

test('unvalidated photo cannot silently become cover', () => {
  assert.throws(
    () => prepareSetPlantCoverIntent({
      gardenProfileId: 'g1',
      plantId: 'p1',
      media: { ...media, validation_state: 'pending' },
    }),
    /cover_media_must_be_validated/
  );
});

test('Restore CRUVIT photo clears pointer but does not delete user media', () => {
  const intent = prepareRestoreSystemPhotoIntent({
    gardenProfileId: 'g1',
    plantId: 'p1',
  });
  assert.equal(intent.coverMediaId, null);
  assert.equal(intent.deleteMedia, false);
  assert.equal(assertPhotoIntentPreservesHistory(intent), true);
});
