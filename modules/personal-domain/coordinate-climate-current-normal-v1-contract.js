/**
 * CRUVIT Current Normal Thermal Delta V1 — central-bake contract.
 *
 * Keeps CHELSA V2.1 fine spatial pattern (~1 km / 30") and applies only
 * precomputed ERA5-Land thermal anomalies. Never fetches data at user runtime.
 */
import {
  freezingRiskFromCold,
  structuralColdRiskFromColdestMonthMeanMinC,
  thermalRegimeFromCoordinateEvidence
} from './coordinate-climate-authority-v2-contract.js';

export const CURRENT_NORMAL_THERMAL_DELTA_VERSION = '1.0.0';

export const CURRENT_NORMAL_THERMAL_POLICY = Object.freeze({
  targetNormalPeriod: '1991-2020',
  sourceBaselinePeriod: '1981-2010',
  highResolutionBase: 'CHELSA V2.1 climatologies 1981-2010',
  deltaSource: 'Copernicus C3S ERA5-Land',
  deltaSourceDoi: '10.24381/cds.e2161bac',
  standardNormalAuthority: 'WMO 1991-2020 climatological standard normal',
  deltaSourceDistributedGrid: '0.1 degree regular lat-lon',
  deltaSourceNativeResolution: '~9 km',
  method: 'monthly thermal anomaly delta downscaling',
  scope: 'thermal-only-v1',
  centralBakeOnly: true,
  userRuntimeExternalCalls: 0,
  doesNotUpgradeClimateNativeResolution: true
});
function finite12(values) {
  return Array.isArray(values) && values.length === 12 && values.every((v) => Number.isFinite(Number(v)));
}

function addMonthly(base, delta) {
  return base.map((v, i) => Number((Number(v) + Number(delta[i])).toFixed(3)));
}

export function validateThermalCurrentNormalDelta(delta = {}) {
  const errors = [];
  if (delta.schemaVersion !== CURRENT_NORMAL_THERMAL_DELTA_VERSION) errors.push('schemaVersion');
  if (delta.sourceBaselinePeriod !== CURRENT_NORMAL_THERMAL_POLICY.sourceBaselinePeriod) errors.push('sourceBaselinePeriod');
  if (delta.targetNormalPeriod !== CURRENT_NORMAL_THERMAL_POLICY.targetNormalPeriod) errors.push('targetNormalPeriod');
  for (const field of ['monthlyTminDeltaC', 'monthlyTmeanDeltaC', 'monthlyTmaxDeltaC']) {
    if (!finite12(delta[field])) errors.push(field);
  }
  return { ok: errors.length === 0, errors };
}

export function buildCurrentNormalVariablePeriods() {
  return {
    thermal: {
      period: CURRENT_NORMAL_THERMAL_POLICY.targetNormalPeriod,
      status: 'era5-land-delta-adjusted',
      base: CURRENT_NORMAL_THERMAL_POLICY.highResolutionBase,
      deltaSource: CURRENT_NORMAL_THERMAL_POLICY.deltaSource,
      method: CURRENT_NORMAL_THERMAL_POLICY.method
    },
    hydrology: {
      period: CURRENT_NORMAL_THERMAL_POLICY.sourceBaselinePeriod,
      status: 'historical-chelsa-baseline',
      note: 'Precipitation/PET/humidity are not current-normal adjusted in Thermal Delta V1.'
    }
  };
}
export function applyThermalCurrentNormalDeltaToCell(cell, delta) {
  const validation = validateThermalCurrentNormalDelta(delta);
  if (!validation.ok) {
    return { ok: false, code: 'CURRENT_NORMAL_DELTA_INVALID', errors: validation.errors, cell };
  }
  if (!finite12(cell?.tmin) || !finite12(cell?.tmean) || !finite12(cell?.tmax)) {
    return { ok: false, code: 'BASE_THERMAL_SERIES_INVALID', errors: ['cell-thermal-series'], cell };
  }

  const tmin = addMonthly(cell.tmin, delta.monthlyTminDeltaC);
  const tmean = addMonthly(cell.tmean, delta.monthlyTmeanDeltaC);
  const tmax = addMonthly(cell.tmax, delta.monthlyTmaxDeltaC);
  const cold = Math.min(...tmin);
  const warm = Math.max(...tmax);
  const structuralColdRisk = structuralColdRiskFromColdestMonthMeanMinC(cold);
  const freezingRisk = freezingRiskFromCold(cold, structuralColdRisk);
  const thermal = thermalRegimeFromCoordinateEvidence({
    coldestMonthMeanMinC: cold,
    elevationM: cell.elev,
    structuralColdRisk,
    freezingRisk
  });

  return {
    ok: true,
    code: 'CURRENT_NORMAL_THERMAL_APPLIED',
    cell: { ...cell, tmin, tmean, tmax, cold, warm, thermal },
    variablePeriods: buildCurrentNormalVariablePeriods(),
    provenance: {
      contractVersion: CURRENT_NORMAL_THERMAL_DELTA_VERSION,
      targetNormalPeriod: CURRENT_NORMAL_THERMAL_POLICY.targetNormalPeriod,
      sourceBaselinePeriod: CURRENT_NORMAL_THERMAL_POLICY.sourceBaselinePeriod,
      deltaCell: delta.deltaCell || null,
      generatedAt: delta.generatedAt || null
    }
  };
}

export function currentNormalRuntimeCostPolicy() {
  return {
    externalProviderCallsPerUser: 0,
    acquisitionMode: 'central-bake-only',
    runtimeReads: 'CRUVIT-controlled prepared tiles only'
  };
}
