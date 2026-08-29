/**
 * Location granularity — city-state, country reject, ambiguity confirmation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEEDS_MORE_SPECIFIC_LOCATION,
  LOCATION_NEEDS_CONFIRMATION,
  isTooBroadForGardenClimate,
  mayAcceptResolvedLocationForGardenClimate,
  resolveGardenLocationFromCandidates,
  isCityStateOrCapitalLocality
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

test('Brazil country-only remains rejected even when namesake cities exist', () => {
  const candidates = [
    { name: 'Brazil', country: 'Brazil', feature_code: 'PCLI', lat: -10, lon: -55, label: 'Brazil' },
    {
      name: 'Brazil',
      country: 'United States',
      admin1: 'Indiana',
      feature_code: 'PPLA2',
      lat: 39.52,
      lon: -87.12,
      label: 'Brazil, Indiana, United States'
    }
  ];
  const resolved = resolveGardenLocationFromCandidates(candidates, 'Brazil');
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, NEEDS_MORE_SPECIFIC_LOCATION);
});

test('California multi-hit does not silently bind to California, Missouri', () => {
  const candidates = [
    {
      name: 'California',
      admin1: 'Missouri',
      country: 'United States',
      feature_code: 'PPLA2',
      lat: 38.62,
      lon: -92.56,
      label: 'California, Missouri, United States'
    },
    {
      name: 'California',
      admin1: 'Maryland',
      country: 'United States',
      feature_code: 'PPL',
      lat: 38.3,
      lon: -76.5,
      label: 'California, Maryland, United States'
    },
    {
      name: 'California',
      admin1: 'Santander Department',
      country: 'Colombia',
      feature_code: 'PPLA2',
      lat: 5.68,
      lon: -73.87,
      label: 'California, Santander, Colombia'
    }
  ];
  const resolved = resolveGardenLocationFromCandidates(candidates, 'California');
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, LOCATION_NEEDS_CONFIRMATION);
  assert.ok(!(resolved.location && /Missouri/i.test(resolved.location.label || '')));
});

test('Singapore city-state PPLC is accepted when name equals country', () => {
  const singapore = {
    name: 'Singapore',
    country: 'Singapore',
    feature_code: 'PPLC',
    lat: 1.29,
    lon: 103.85,
    label: 'Singapore, Singapore'
  };
  assert.equal(isCityStateOrCapitalLocality(singapore), true);
  assert.equal(isTooBroadForGardenClimate(singapore), false);
  assert.equal(mayAcceptResolvedLocationForGardenClimate(singapore).ok, true);

  const candidates = [
    singapore,
    {
      name: 'Singapore',
      country: 'Singapore',
      feature_code: 'PCLI',
      lat: 1.35,
      lon: 103.8,
      label: 'Singapore'
    },
    {
      name: 'Singapore',
      admin1: 'Limpopo',
      country: 'South Africa',
      feature_code: 'PPL',
      lat: -22.56,
      lon: 30.12,
      label: 'Singapore, Limpopo, South Africa'
    }
  ];
  const resolved = resolveGardenLocationFromCandidates(candidates, 'Singapore');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.location.feature_code, 'PPLC');
  assert.equal(resolved.location.country, 'Singapore');
});

test('ambiguous duplicate-name query requires confirmation', () => {
  const candidates = [
    {
      name: 'Springfield',
      admin1: 'Illinois',
      country: 'United States',
      feature_code: 'PPLA',
      lat: 39.78,
      lon: -89.65,
      label: 'Springfield, Illinois, United States'
    },
    {
      name: 'Springfield',
      admin1: 'Missouri',
      country: 'United States',
      feature_code: 'PPLA2',
      lat: 37.21,
      lon: -93.29,
      label: 'Springfield, Missouri, United States'
    }
  ];
  const resolved = resolveGardenLocationFromCandidates(candidates, 'Springfield');
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, LOCATION_NEEDS_CONFIRMATION);
});

test('qualified city query Kochi, Kerala resolves uniquely', () => {
  const candidates = [
    {
      name: 'Kochi',
      admin1: 'Kerala',
      country: 'India',
      feature_code: 'PPL',
      lat: 9.94,
      lon: 76.26,
      label: 'Kochi, Kerala, India'
    },
    {
      name: 'Kochi',
      admin1: 'Maharashtra',
      country: 'India',
      feature_code: 'PPL',
      lat: 20.18,
      lon: 78.45,
      label: 'Kochi, Maharashtra, India'
    }
  ];
  const ambiguous = resolveGardenLocationFromCandidates(candidates, 'Kochi');
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.code, LOCATION_NEEDS_CONFIRMATION);
  const qualified = resolveGardenLocationFromCandidates(candidates, 'Kochi, Kerala');
  assert.equal(qualified.ok, true);
  assert.equal(qualified.location.admin1, 'Kerala');
});
