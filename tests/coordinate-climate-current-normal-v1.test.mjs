import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_NORMAL_THERMAL_DELTA_VERSION,
  CURRENT_NORMAL_THERMAL_POLICY,
  applyThermalCurrentNormalDeltaToCell,
  buildCurrentNormalVariablePeriods,
  currentNormalRuntimeCostPolicy,
  validateThermalCurrentNormalDelta
} from '../modules/personal-domain/coordinate-climate-current-normal-v1-contract.js';
import {
  buildCoverageManifest,
  cellToMinimalProfile,
  decodeBinaryCoverageTile,
  encodeBinaryCoverageTile
} from '../modules/personal-domain/coordinate-climate-coverage-tiles-v2.js';
import { resolveClimatePeriodClaim } from '../modules/personal-domain/pre-scale-suitability-systemic-hardening-v1-contract.js';

const delta = {
  schemaVersion: CURRENT_NORMAL_THERMAL_DELTA_VERSION,
  sourceBaselinePeriod: '1981-2010',
  targetNormalPeriod: '1991-2020',
  monthlyTminDeltaC: Array(12).fill(2),
  monthlyTmeanDeltaC: Array(12).fill(1.5),
  monthlyTmaxDeltaC: Array(12).fill(1),
  deltaCell: 'era5land-0.1:probe'
};
test('Current Normal Thermal V1 policy is central-bake-only and preserves climate resolution claims', () => {
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.targetNormalPeriod, '1991-2020');
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.sourceBaselinePeriod, '1981-2010');
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.deltaSourceDoi, '10.24381/cds.e2161bac');
  assert.match(CURRENT_NORMAL_THERMAL_POLICY.standardNormalAuthority, /WMO 1991-2020/i);
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.centralBakeOnly, true);
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.userRuntimeExternalCalls, 0);
  assert.equal(CURRENT_NORMAL_THERMAL_POLICY.doesNotUpgradeClimateNativeResolution, true);
  assert.deepEqual(validateThermalCurrentNormalDelta(delta), { ok: true, errors: [] });
  assert.equal(currentNormalRuntimeCostPolicy().externalProviderCallsPerUser, 0);
});

test('thermal delta updates Tmin/Tmean/Tmax and re-derives cold/warm/thermal without touching hydrology', () => {
  const cell = {
    x: 1, y: 2, lat: 32.5, lon: 35, elev: 100,
    tmin: [9,10,11,12,13,14,15,16,15,13,11,10],
    tmean: [15,16,17,18,20,22,24,25,24,21,18,16],
    tmax: [21,22,23,24,27,29,31,32,31,28,24,22],
    pr: Array(12).fill(40), pet: Array(12).fill(80), hurs: Array(12).fill(55),
    vpd: Array(12).fill(900), P: 480, PET: 960, AI: 0.5, moisture: 'dry-subhumid',
    cold: 9, warm: 32, thermal: 'cool-seasonal'
  };
  const out = applyThermalCurrentNormalDeltaToCell(cell, delta);
  assert.equal(out.ok, true);
  assert.equal(out.cell.cold, 11);
  assert.equal(out.cell.warm, 33);
  assert.equal(out.cell.thermal, 'mild-seasonal');
  assert.deepEqual(out.cell.pr, cell.pr);
  assert.deepEqual(out.cell.pet, cell.pet);
  assert.deepEqual(out.cell.hurs, cell.hurs);
  assert.equal(out.cell.P, cell.P);
  assert.equal(out.cell.PET, cell.PET);
});
test('adjusted cell still reports CHELSA native spatial resolution while exposing updated thermal period', () => {
  const cell = {
    x: 1, y: 2, lat: 32.5, lon: 35, elev: 100,
    tmin: Array(12).fill(10), tmean: Array(12).fill(18), tmax: Array(12).fill(28),
    pr: Array(12).fill(40), pet: Array(12).fill(80), hurs: Array(12).fill(55),
    vpd: Array(12).fill(900), P: 480, PET: 960, AI: 0.5, moisture: 'dry-subhumid'
  };
  const out = applyThermalCurrentNormalDeltaToCell(cell, delta);
  const profile = cellToMinimalProfile(out.cell);
  assert.equal(profile.climateGrid.nativeResolutionLabel, '~1 km (30 arc-seconds)');
  assert.equal(profile.coldestMonthMeanMinC, 12);
  assert.equal(profile.warmestMonthMeanMaxC, 29);
});

test('malformed or incomplete delta fails closed and does not mutate the base cell', () => {
  const cell = { tmin: Array(12).fill(1), tmean: Array(12).fill(2), tmax: Array(12).fill(3) };
  const bad = { ...delta, monthlyTminDeltaC: [1,2] };
  const out = applyThermalCurrentNormalDeltaToCell(cell, bad);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'CURRENT_NORMAL_DELTA_INVALID');
  assert.equal(out.cell, cell);
});
test('tile header and coverage manifest retain mixed-period provenance', () => {
  const periods = buildCurrentNormalVariablePeriods();
  const encoded = encodeBinaryCoverageTile({
    tileKey: 'probe', tx: 0, ty: 0, cells: [], bakeVersion: 'probe-current-normal',
    regionId: 'probe', variablePeriods: periods
  });
  const decoded = decodeBinaryCoverageTile(encoded.buffer);
  assert.deepEqual(decoded.header.variablePeriods, periods);
  const manifest = buildCoverageManifest({
    regionId: 'probe', bakeVersion: 'probe-current-normal', bounds: {},
    tiles: [], variablePeriods: periods
  });
  assert.deepEqual(manifest.variablePeriods, periods);
  assert.equal(manifest.runtimeExternalAcquisitionForbidden, true);
});

test('product climate-period claim becomes mixed-period, never live/current-measured', () => {
  const periods = buildCurrentNormalVariablePeriods();
  const claim = resolveClimatePeriodClaim({ variablePeriods: periods });
  assert.equal(claim.thermalPeriod, '1991-2020');
  assert.equal(claim.hydrologyPeriod, '1981-2010');
  assert.equal(claim.isCurrentMeasuredClimate, false);
  assert.match(claim.productClaimForbidden, /live weather|current measured climate/i);
  assert.match(claim.productClaimForbidden, /uniform 1991/i);
});

test('legacy profile without variable-period provenance keeps historical CHELSA claim', () => {
  const claim = resolveClimatePeriodClaim({});
  assert.equal(claim.period, '1981-2010');
  assert.equal(claim.isCurrentMeasuredClimate, false);
});
