import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  isTooBroadForGardenClimate,
  mayAcceptResolvedLocationForGardenClimate
} from '../modules/personal-domain/location-granularity-contract.js';

test('rejects country / state / continent feature codes', () => {
  assert.equal(isTooBroadForGardenClimate({ feature_code: 'PCLI', name: 'Brazil', country: 'Brazil' }), true);
  assert.equal(isTooBroadForGardenClimate({ feature_code: 'ADM1', name: 'California', country: 'USA' }), true);
  assert.equal(isTooBroadForGardenClimate({ feature_code: 'CONT', name: 'Asia' }), true);
  assert.equal(
    mayAcceptResolvedLocationForGardenClimate({
      feature_code: 'PCLI',
      name: 'Brazil',
      label: 'Brazil, Brazil',
      lat: -10,
      lon: -55,
      country: 'Brazil'
    }).code,
    NEEDS_MORE_SPECIFIC_LOCATION
  );
});

test('accepts populated-place city hits', () => {
  assert.equal(
    isTooBroadForGardenClimate({
      feature_code: 'PPLA',
      name: 'Kochi',
      label: 'Kochi, Kerala, India',
      country: 'India',
      lat: 9.94,
      lon: 76.26
    }),
    false
  );
  assert.equal(
    mayAcceptResolvedLocationForGardenClimate({
      feature_code: 'PPLA',
      name: 'Cairo',
      label: 'Cairo, Egypt',
      country: 'Egypt',
      lat: 30.06,
      lon: 31.25
    }).ok,
    true
  );
});
