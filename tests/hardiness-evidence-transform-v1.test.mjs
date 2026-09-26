/**
 * hardiness-zone-to-cold-traits-v1 + frost-injury-to-frost-sensitivity-v1 unit proofs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HARDINESS_ZONE_TO_COLD_TRAITS_REF,
  applyHardinessZoneToColdTraits,
  mapUsdaMinZoneToColdTolerance,
  mapRhsHardinessRatingToColdTolerance
} from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import {
  applyFrostInjuryToFrostSensitivity
} from '../modules/personal-domain/frost-injury-to-frost-sensitivity-v1.js';
import {
  HARDINESS_CLAIM_TYPE,
  HARDINESS_ZONE_SYSTEM,
  extractRhsHardinessRatingClaim
} from '../modules/personal-domain/hardiness-evidence-claims-v1.js';

test('zone transform ref frozen', () => {
  assert.equal(HARDINESS_ZONE_TO_COLD_TRAITS_REF, 'hardiness-zone-to-cold-traits-v1@1.1.0');
});

test('deterministic cold map', () => {
  assert.equal(mapUsdaMinZoneToColdTolerance(4), 'high');
  assert.equal(mapUsdaMinZoneToColdTolerance(7), 'low');
  assert.equal(mapUsdaMinZoneToColdTolerance(9), 'very_low');
});

test('zone claim → cold only', () => {
  const out = applyHardinessZoneToColdTraits({
    claimType: HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND,
    hardinessZoneMin: 7,
    hardinessZoneMax: 10,
    hardinessZoneSystem: HARDINESS_ZONE_SYSTEM.USDA,
    claimFingerprint: 'x'
  });
  assert.equal(out.ok, true);
  assert.deepEqual(
    out.outputs.map((o) => o.targetField),
    ['coldTolerance']
  );
  assert.equal(out.outputs[0].value, 'low');
  assert.equal(out.frostSensitivity.authorized, false);
});


test('RHS H-rating parses and maps without authorizing frost sensitivity', () => {
  const raw = extractRhsHardinessRatingClaim('Hardiness rating: H4. Minimum temperature range -10 to -5C.');
  assert.equal(raw.claimType, HARDINESS_CLAIM_TYPE.RHS_HARDINESS_RATING);
  assert.equal(raw.rhsHardinessRating, 'H4');
  assert.equal(mapRhsHardinessRatingToColdTolerance('H4'), 'low');
  assert.equal(mapRhsHardinessRatingToColdTolerance('H6'), 'medium');
  assert.equal(mapRhsHardinessRatingToColdTolerance('H7'), 'high');
  const out = applyHardinessZoneToColdTraits(raw);
  assert.equal(out.ok, true);
  assert.equal(out.outputs[0].targetField, 'coldTolerance');
  assert.equal(out.outputs[0].value, 'low');
  assert.equal(out.outputs[0].evidenceClass, 'SOURCE_SUPPORTED');
  assert.equal(out.frostSensitivity.authorized, false);
});

test('zone claim rejected by frost-injury transform', () => {
  const out = applyFrostInjuryToFrostSensitivity({
    claimType: HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND,
    hardinessZoneMin: 4,
    hardinessZoneMax: 9
  });
  assert.equal(out.ok, false);
});
