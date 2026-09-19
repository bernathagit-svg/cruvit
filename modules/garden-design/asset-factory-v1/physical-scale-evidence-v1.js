/**
 * Calibration botanical size evidence V1.1.
 * Generic lookup. Mango UF/IFAS ST404 is the first SOURCE_SUPPORTED_RANGE record.
 * Not production catalog. Not a cultivar guarantee. No spend. No generation.
 */

import {
  DIMENSION_EVIDENCE,
  classifyCatalogDimensionEvidence,
  classifyUserConfirmedDimension,
  mayDrivePhysicalMeterPreview
} from './physical-scale-foundation-v1.js';

export const PHYSICAL_SCALE_EVIDENCE_VERSION = 'physical-scale-evidence-v1.1';
export const MANGO_SOURCE_SIZE_CALIBRATION_VERSION = 'mango-source-size-calibration-v1';
export const FT_TO_M = 0.3048;

export const EVIDENCE_SCOPE = Object.freeze({
  SPECIES_GENERAL: 'SPECIES_GENERAL',
  CULTIVAR_SPECIFIC: 'CULTIVAR_SPECIFIC'
});

export const SIZE_SCENARIOS = Object.freeze({
  NATURAL_MATURE: 'NATURAL_MATURE',
  MAINTAINED_GARDEN: 'MAINTAINED_GARDEN',
  USER_OVERRIDE: 'USER_OVERRIDE'
});

export const RANGE_BANDS = Object.freeze({
  LOW: 'LOW',
  MID: 'MID',
  HIGH: 'HIGH'
});

export const ARCHITECTURE_CLASSES = Object.freeze({
  ARCHITECTURE_COMPATIBLE: 'ARCHITECTURE_COMPATIBLE',
  REGEN_REQUIRED_ARCHITECTURE: 'REGEN_REQUIRED_ARCHITECTURE',
  UNKNOWN: 'UNKNOWN'
});

export const RANGE_BAND_STORAGE_KEY = 'cruvit:physical-scale-range-band-v1';
export const SIZE_SCENARIO_STORAGE_KEY = 'cruvit:physical-scale-size-scenario-v1';

/** Calibration-only. Not written to plants.seed / production catalog. */
export const CALIBRATION_BOTANICAL_SIZE_EVIDENCE = Object.freeze({
  mango: Object.freeze({
    canonicalSlug: 'mango',
    scientific: 'Mangifera indica',
    scientificName: 'Mangifera indica',
    visualForm: 'tree',
    growthStage: 'mature',
    sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    evidenceScope: EVIDENCE_SCOPE.SPECIES_GENERAL,
    cultivarSpecific: false,
    cultivarMayOverrideLater: true,
    cultivarEnrichmentImplemented: false,
    calibrationOnly: true,
    productionCatalogWritten: false,
    massCatalogEnrichment: false,
    universalCultivarGuarantee: false,
    mayDrivePhysicalMeterPreview: true,
    ownerEntersMatureHeight: false,
    source: Object.freeze({
      provider: 'UF/IFAS Extension',
      title: 'Mangifera indica: Mango',
      publication: 'ENH563',
      sourceId: 'UF_IFAS_ENH563_ST404',
      identifiers: Object.freeze(['ENH563', 'ST404']),
      originalUnit: 'ft'
    }),
    original: Object.freeze({
      unit: 'ft',
      heightFt: Object.freeze({ min: 30, max: 60 }),
      spreadFt: Object.freeze({ min: 30, max: 50 })
    }),
    heightM: Object.freeze({ min: 30 * FT_TO_M, max: 60 * FT_TO_M }),
    spreadM: Object.freeze({ min: 30 * FT_TO_M, max: 50 * FT_TO_M }),
    reportedRoundedM: Object.freeze({
      heightM: Object.freeze({ min: 9.1, max: 18.3 }),
      spreadM: Object.freeze({ min: 9.1, max: 15.2 })
    }),
    note: 'General species / landscape guidance from UF/IFAS ENH563 / ST404. Not a cultivar guarantee. Future cultivar evidence may override this range. Do not substitute maintained-garden height.'
  })
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

export function pickRangeValue(range, band) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const id = RANGE_BANDS[band] || RANGE_BANDS.MID;
  if (id === RANGE_BANDS.LOW) return range.min;
  if (id === RANGE_BANDS.HIGH) return range.max;
  return (range.min + range.max) / 2;
}

export function lookupCalibrationSizeEvidence(canonicalSlug, options = {}) {
  const slug = asText(canonicalSlug).toLowerCase();
  const row = CALIBRATION_BOTANICAL_SIZE_EVIDENCE[slug];
  const stage = asText(options.growthStage) === 'young' ? 'young' : 'mature';
  const scenario = SIZE_SCENARIOS[options.sizeScenario] || SIZE_SCENARIOS.NATURAL_MATURE;
  if (!row) return null;
  if (row.growthStage !== stage) return null;
  if (row.sizeScenario !== scenario) return null;
  return { ...row, resolvedFrom: 'CALIBRATION_SOURCE_SUPPORTED_RANGE' };
}

export function resolvePhysicalScaleEvidence(input = {}) {
  const slug = asText(input.canonicalSlug).toLowerCase();
  const stage = asText(input.growthStage) === 'young' ? 'young' : 'mature';
  const scenario = SIZE_SCENARIOS[input.sizeScenario] || SIZE_SCENARIOS.NATURAL_MATURE;
  const visualForm = asText(input.visualForm) || null;
  const userConfirmed = classifyUserConfirmedDimension({
    ...(input.userConfirmed || {}),
    growthStage: stage,
    visualForm
  });
  const catalog = classifyCatalogDimensionEvidence(input.plant || {}, {
    visualForm,
    growthStage: stage,
    librarySizeCopy: input.librarySizeCopy
  });

  if (scenario === SIZE_SCENARIOS.USER_OVERRIDE) {
    if (userConfirmed.mayDrivePhysicalMeterPreview) {
      return {
        ...userConfirmed,
        sizeScenario: scenario,
        resolvedFrom: 'USER_CONFIRMED',
        botanicalTruthImmutable: true,
        note: 'USER_OVERRIDE / USER_CONFIRMED fallback. Not botanical catalog truth. Not the default workflow.'
      };
    }
    return {
      evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
      growthStage: stage,
      visualForm,
      sizeScenario: scenario,
      mayDrivePhysicalMeterPreview: false,
      note: 'USER_OVERRIDE selected but no USER_CONFIRMED range was entered.'
    };
  }

  if (scenario === SIZE_SCENARIOS.MAINTAINED_GARDEN) {
    const maintained = lookupCalibrationSizeEvidence(slug, { growthStage: stage, sizeScenario: scenario });
    if (maintained && maintained.mayDrivePhysicalMeterPreview) return { ...maintained, botanicalTruthImmutable: true };
    return {
      evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
      growthStage: stage,
      visualForm,
      sizeScenario: scenario,
      mayDrivePhysicalMeterPreview: false,
      substitutedNaturalMature: false,
      note: 'No source-supported MAINTAINED_GARDEN range. Do not silently substitute NATURAL_MATURE.'
    };
  }

  const pack = lookupCalibrationSizeEvidence(slug, { growthStage: stage, sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE });
  if (pack && pack.mayDrivePhysicalMeterPreview) {
    return { ...pack, sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE, botanicalTruthImmutable: true };
  }
  if (catalog.mayDrivePhysicalMeterPreview) {
    return {
      ...catalog,
      sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE,
      resolvedFrom: catalog.evidenceClass,
      botanicalTruthImmutable: true
    };
  }
  if (userConfirmed.mayDrivePhysicalMeterPreview) {
    return {
      ...userConfirmed,
      sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE,
      resolvedFrom: 'USER_CONFIRMED',
      botanicalTruthImmutable: true,
      note: 'USER_CONFIRMED fallback. Source-supported evidence was unavailable. Not the default workflow.'
    };
  }
  return {
    evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
    growthStage: stage,
    visualForm,
    sizeScenario: scenario,
    mayDrivePhysicalMeterPreview: false,
    note: 'UNKNOWN must not pretend to know meters.'
  };
}

export function factoryMayUsePhysicalScalePreview(evidenceClass) {
  return mayDrivePhysicalMeterPreview(evidenceClass);
}

export function visiblePlantAspect(bbox = {}, canvas = {}) {
  const minX = Number(bbox.minX);
  const maxX = Number(bbox.maxX);
  const minY = Number(bbox.minY);
  const maxY = Number(bbox.maxY);
  const width = Number(canvas.width) || 1024;
  const height = Number(canvas.height) || 1536;
  if (![minX, maxX, minY, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    return { widthPx: null, heightPx: null, widthOverHeight: null, fillWidth: 1, fillHeight: 1 };
  }
  const widthPx = maxX - minX;
  const heightPx = maxY - minY;
  return {
    widthPx,
    heightPx,
    widthOverHeight: widthPx / heightPx,
    fillWidth: widthPx / width,
    fillHeight: heightPx / height
  };
}

export function classifyArchitectureVsSpread(input = {}) {
  const aspect = visiblePlantAspect(input.bbox, {
    width: input.canvasWidth,
    height: input.canvasHeight
  });
  const heightM = Number(input.heightM);
  const spread = input.spreadM;
  if (!aspect.widthOverHeight || !Number.isFinite(heightM) || !spread) {
    return {
      class: ARCHITECTURE_CLASSES.UNKNOWN,
      impliedSpreadM: null,
      stretchedPng: false
    };
  }
  const impliedSpreadM = heightM * aspect.widthOverHeight;
  const lo = Number(spread.min);
  const hi = Number(spread.max);
  const inside = Number.isFinite(lo) && Number.isFinite(hi) && impliedSpreadM >= lo * 0.92 && impliedSpreadM <= hi * 1.08;
  return {
    class: inside ? ARCHITECTURE_CLASSES.ARCHITECTURE_COMPATIBLE : ARCHITECTURE_CLASSES.REGEN_REQUIRED_ARCHITECTURE,
    impliedSpreadM,
    supportedSpreadM: spread,
    assetWidthOverHeight: aspect.widthOverHeight,
    stretchedPng: false,
    note: inside
      ? 'Uniform scale from height. Implied canopy from the PNG aspect sits inside the supported spread range.'
      : 'Do not stretch the PNG on X/Y to fake botanical spread. Asset architecture cannot represent this height-to-spread pair. REGEN_REQUIRED_ARCHITECTURE.'
  };
}

const MANGO_CALIBRATION_BBOX = Object.freeze({
  exists: true,
  minX: 33,
  minY: 148,
  maxX: 1008,
  maxY: 1422
});

export function evaluateMangoSourceSizeCalibration(input = {}) {
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  const candidate = input.bbox || {};
  const bbox = Number.isFinite(Number(candidate.minX)) && Number.isFinite(Number(candidate.maxY))
    ? candidate
    : MANGO_CALIBRATION_BBOX;
  const canvasWidth = Number(input.canvasWidth) || 1024;
  const canvasHeight = Number(input.canvasHeight) || 1536;
  const bands = [RANGE_BANDS.LOW, RANGE_BANDS.MID, RANGE_BANDS.HIGH].map((band) => {
    const heightM = pickRangeValue(mango.heightM, band);
    const architecture = classifyArchitectureVsSpread({
      bbox,
      canvasWidth,
      canvasHeight,
      heightM,
      spreadM: mango.spreadM
    });
    return {
      rangeBand: band,
      previewRole:
        band === RANGE_BANDS.LOW
          ? 'lower supported range'
          : band === RANGE_BANDS.HIGH
            ? 'upper supported range'
            : 'representative preview inside range, not botanical truth',
      heightM,
      heightMRounded:
        band === RANGE_BANDS.LOW ? mango.reportedRoundedM.heightM.min : band === RANGE_BANDS.HIGH ? mango.reportedRoundedM.heightM.max : 13.7,
      architectureClass: architecture.class,
      impliedSpreadM: architecture.impliedSpreadM,
      stretchedPng: false
    };
  });
  return {
    contract: MANGO_SOURCE_SIZE_CALIBRATION_VERSION,
    canonicalSlug: 'mango',
    scientificName: mango.scientificName,
    asset: 'mango-mature-vegetative-v1',
    growthStage: 'mature',
    sizeScenario: SIZE_SCENARIOS.NATURAL_MATURE,
    evidenceClass: mango.evidenceClass,
    evidenceScope: mango.evidenceScope,
    cultivarSpecific: false,
    ownerEntersMatureHeight: false,
    photoCalibrationOptional: true,
    massCatalogEnrichment: false,
    source: mango.source,
    originalImperial: mango.original,
    normalizedSi: mango.heightM && {
      heightM: mango.heightM,
      spreadM: mango.spreadM
    },
    reportedRoundedM: mango.reportedRoundedM,
    rangeBands: bands,
    architectureGate: {
      stretchedPng: false,
      independentXyStretchForbidden: true,
      representativeMidClass: bands.find((row) => row.rangeBand === RANGE_BANDS.MID)?.architectureClass || ARCHITECTURE_CLASSES.UNKNOWN,
      anyRegenRequired: bands.some((row) => row.architectureClass === ARCHITECTURE_CLASSES.REGEN_REQUIRED_ARCHITECTURE)
    },
    spend: { openaiCalls: 0, imageGeneration: 0, additionalSpendUsd: 0 }
  };
}
