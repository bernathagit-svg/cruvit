import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGardenPhoto,
  gardenPhotoWriteGate,
} from '../modules/my-garden-v2/garden-photo-projection.js';

const garden = { id: 'g1' };

const photo = (id) => ({
  id,
  garden_profile_id: 'g1',
  garden_plant_id: null,
  purpose: 'garden_overview',
  validation_state: 'validated',
  storage_bucket: 'user-garden-media',
  storage_path: 'u/g/' + id + '/garden.jpg',
});

test('one unambiguous validated garden overview may be displayed transitionally', () => {
  const result = resolveGardenPhoto({
    gardenProfile: garden,
    media: [photo('m1')],
  });
  assert.equal(result.kind, 'personal');
  assert.equal(result.mediaId, 'm1');
  assert.equal(result.reason, 'single_unambiguous_candidate');
});

test('multiple garden overview photos are not silently resolved by latest date', () => {
  const result = resolveGardenPhoto({
    gardenProfile: garden,
    media: [
      { ...photo('m1'), created_at: '2026-10-01T10:00:00Z' },
      { ...photo('m2'), created_at: '2026-10-02T10:00:00Z' },
    ],
  });
  assert.equal(result.kind, 'system');
  assert.equal(result.mediaId, null);
  assert.equal(result.reason, 'multiple_garden_photos_no_current_pointer');
});

test('explicit pointer wins only if it references eligible garden media', () => {
  const result = resolveGardenPhoto({
    gardenProfile: { id: 'g1', garden_photo_media_id: 'm2' },
    media: [photo('m1'), photo('m2')],
  });
  assert.equal(result.kind, 'personal');
  assert.equal(result.mediaId, 'm2');
});

test('plant photo can never become garden background', () => {
  const result = resolveGardenPhoto({
    gardenProfile: garden,
    media: [{
      ...photo('m1'),
      garden_plant_id: 'p1',
    }],
  });
  assert.equal(result.kind, 'system');
  assert.equal(result.candidateCount, 0);
});

test('current schema is write-blocked until Garden Profile owns current-photo pointer', () => {
  const gate = gardenPhotoWriteGate(garden);
  assert.equal(gate.blocked, true);
  assert.equal(gate.code, 'GARDEN_CURRENT_PHOTO_POINTER_MISSING');
});
