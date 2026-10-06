import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareAddPlantIntent,
  assertAddPlantIntentSafe,
} from '../modules/my-garden-v2/add-plant-contract.js';

const base = {
  gardenProfileId: 'g1',
  clientInstanceId: 'client-1',
  displayName: 'My plant',
};

test('manual add keeps botanical identity unknown', () => {
  const intent = prepareAddPlantIntent({
    ...base,
    mode: 'manual',
  });

  assert.equal(intent.identity.profileSlug, null);
  assert.equal(intent.identity.scientific, null);
  assert.equal(intent.initialHealth.status, 'unassessed');
  assert.equal(intent.initialHealth.mark, 'unknown');
  assert.equal(assertAddPlantIntentSafe(intent), true);
});

test('manual add rejects silent canonical identity assignment', () => {
  assert.throws(
    () => prepareAddPlantIntent({
      ...base,
      mode: 'manual',
      canonicalSlug: 'lemon',
      scientificName: 'Citrus × limon',
    }),
    /manual_add_must_not_silently_assign_canonical_identity/
  );
});

test('unconfirmed scan cannot assign species identity', () => {
  assert.throws(
    () => prepareAddPlantIntent({
      ...base,
      mode: 'scan',
      identityConfirmed: false,
      canonicalSlug: 'lemon',
      scientificName: 'Citrus × limon',
    }),
    /unconfirmed_scan_must_not_assign_canonical_identity/
  );
});

test('confirmed scan may carry canonical identity', () => {
  const intent = prepareAddPlantIntent({
    ...base,
    mode: 'scan',
    identityConfirmed: true,
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
  });

  assert.equal(intent.identity.profileSlug, 'lemon');
  assert.equal(intent.identity.scientific, 'Citrus × limon');
  assert.equal(intent.identity.identitySource, 'identifier_confirmed');
  assert.equal(assertAddPlantIntentSafe(intent), true);
});

test('catalog and recommendation paths preserve shared future Add Plant contract', () => {
  for (const mode of ['search', 'suggestions', 'popular']) {
    assert.throws(
      () => prepareAddPlantIntent({ ...base, mode }),
      /canonical_slug_required/
    );

    const intent = prepareAddPlantIntent({
      ...base,
      mode,
      canonicalSlug: 'lemon',
      scientificName: 'Citrus × limon',
    });

    assert.equal(intent.identity.profileSlug, 'lemon');
    assert.equal(intent.initialHealth.status, 'unassessed');
    assert.equal(intent.initialHealth.mark, 'unknown');
  }
});
