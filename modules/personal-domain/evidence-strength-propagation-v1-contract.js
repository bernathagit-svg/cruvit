/**
 * Evidence-strength propagation — plant trait provenance constrains suitability confidence.
 *
 * SOURCE_SUPPORTED may authorize confident plant-specific outcomes (with climate support).
 * HEURISTIC_ASSERTION may only bound to Borderline / Conditional / Constrained.
 * UNKNOWN cannot authorize positive or negative botanical truth.
 *
 * Does not discard heuristic values — preserves them as provisional for enrichment.
 * Does not invent botanical facts. Does not auto-convert heuristic → confident negative.
 */

import { FIELD_PROVENANCE_EVIDENCE_CLASSES } from '../catalog-expansion/field-provenance-honesty-v1-contract.js';

export const EVIDENCE_STRENGTH_PROPAGATION_VERSION = '1.0.0';

export const EVIDENCE_CLASS = FIELD_PROVENANCE_EVIDENCE_CLASSES;

/** Outcomes that claim confident botanical truth (positive or negative). */
export const CONFIDENT_OUTCOME_STATUSES = Object.freeze([
  'reliable',
  'supported',
  'unreliable',
  'unlikely',
  'poor'
]);

/** Overall levels that claim confident botanical recommendation truth. */
export const CONFIDENT_OVERALL_LEVELS = Object.freeze(['good', 'excellent', 'blocked']);

/** Batch 2 ingestion rule (frozen). */
export const BATCH_2_EVIDENCE_INGESTION_RULE = Object.freeze({
  version: '1.0.0',
  requirePerTrait: ['value', 'evidenceClass', 'field-level provenance (sourceIds + supporting excerpt)'],
  sourceSupportedOnlyWhen: 'actual source content supports the mapped claim',
  heuristicMustRemain: 'explicitly provisional (HEURISTIC_ASSERTION)',
  unknownAcceptable: true,
  preferFewerSourceSupportedOverManyHeuristic: true,
  templateExcerptIsNotSourceQuote: true,
  note: 'Batch 2 must prefer fewer SOURCE_SUPPORTED traits over many fabricated/heuristic complete traits.'
});

/**
 * Resolve evidence class for a trait field on plant meta.
 * Missing class + present value → HEURISTIC_ASSERTION (Batch 1 honesty default).
 * Missing value → UNKNOWN.
 */
export function resolveTraitEvidenceClass(meta, field) {
  if (!field) return EVIDENCE_CLASS.UNKNOWN;
  const map =
    meta?.traitEvidenceClasses ||
    meta?.fieldEvidenceClasses ||
    meta?.climateTraits?.traitEvidenceClasses ||
    {};
  if (map[field] && EVIDENCE_CLASS[map[field]]) return map[field];

  // Quantitative provenance map (optional)
  const qKey = String(field).replace(/^quantitative\./, '');
  const qp = meta?.quantitativeProvenance || meta?.climateTraits?.quantitativeProvenance;
  if (qp && typeof qp === 'object') {
    const entry = qp[field] || qp[qKey] || qp[`quantitative.${qKey}`];
    if (entry?.evidenceClass && EVIDENCE_CLASS[entry.evidenceClass]) {
      return entry.evidenceClass;
    }
  }

  const root = meta?.climateTraits && field in (meta.climateTraits || {}) ? meta.climateTraits : meta;
  let val = root?.[field];
  if (val === undefined && meta?.climateTraits) val = meta.climateTraits[field];
  if (field.startsWith('reproductive.')) {
    const key = field.slice('reproductive.'.length);
    const block = meta?.reproductiveBiology || meta?.climateTraits?.reproductiveBiology || {};
    val = block[key];
  }
  if (val == null || val === '' || (Array.isArray(val) && val.length === 0)) {
    return EVIDENCE_CLASS.UNKNOWN;
  }
  // Explicit opt-in only for SOURCE_SUPPORTED — never invent it.
  return EVIDENCE_CLASS.HEURISTIC_ASSERTION;
}

export function isSourceSupported(meta, field) {
  return resolveTraitEvidenceClass(meta, field) === EVIDENCE_CLASS.SOURCE_SUPPORTED;
}

export function isConfidentOutcomeStatus(status) {
  return CONFIDENT_OUTCOME_STATUSES.includes(String(status || '').toLowerCase());
}

export function isConfidentOverall(overall) {
  return CONFIDENT_OVERALL_LEVELS.includes(String(overall || '').toLowerCase());
}

/**
 * True when every material field is SOURCE_SUPPORTED (at least one field required).
 */
export function materialFieldsAuthorizeConfidence(meta, fields = []) {
  const list = (fields || []).filter(Boolean);
  if (!list.length) return false;
  return list.every((f) => isSourceSupported(meta, f));
}

/**
 * Summarize strength across material fields.
 */
export function summarizeMaterialEvidence(meta, fields = []) {
  const list = (fields || []).filter(Boolean);
  const classes = list.map((f) => ({
    field: f,
    evidenceClass: resolveTraitEvidenceClass(meta, f),
    value: (() => {
      const root = meta?.climateTraits || meta;
      if (f.startsWith('reproductive.')) {
        return (meta?.reproductiveBiology || root?.reproductiveBiology || {})[
          f.slice('reproductive.'.length)
        ];
      }
      return root?.[f];
    })()
  }));
  const hasSource = classes.some((c) => c.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED);
  const hasHeuristic = classes.some((c) => c.evidenceClass === EVIDENCE_CLASS.HEURISTIC_ASSERTION);
  const hasUnknown = classes.some((c) => c.evidenceClass === EVIDENCE_CLASS.UNKNOWN);
  const allSource =
    classes.length > 0 &&
    classes.every((c) => c.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED);
  return { fields: classes, hasSource, hasHeuristic, hasUnknown, allSource };
}

/**
 * Demote a confident dimension status when material authorizing traits lack SOURCE_SUPPORTED.
 * Heuristic → Constrained (provisional). Unknown-only → UNKNOWN.
 * Already-bounded statuses (constrained/unknown) pass through.
 */
export function boundOutcomeByEvidenceStrength(status, meta, materialFields, { dimension } = {}) {
  const s = String(status || '').toLowerCase();
  if (!isConfidentOutcomeStatus(s)) {
    return {
      status: s,
      demoted: false,
      reason: null,
      materialEvidence: summarizeMaterialEvidence(meta, materialFields)
    };
  }
  const summary = summarizeMaterialEvidence(meta, materialFields);
  if (summary.allSource) {
    return {
      status: s,
      demoted: false,
      reason: null,
      materialEvidence: summary,
      dimension
    };
  }
  // Prefer UNKNOWN when authorizing traits are missing/unknown and none are source-supported.
  const next =
    !summary.hasSource && !summary.hasHeuristic && summary.hasUnknown
      ? 'unknown'
      : 'constrained';
  return {
    status: next,
    demoted: true,
    previousStatus: s,
    reason: `evidence-strength:${dimension || 'dimension'}:confident-${s}-requires-SOURCE_SUPPORTED-on-material-traits`,
    materialEvidence: summary,
    dimension
  };
}

/**
 * Infer material plant fields that authorized a survival outcome (post-hoc, dimension-specific).
 */
export function inferSurvivalMaterialFields({
  meta,
  survival,
  env = {},
  evidenceHints = {}
} = {}) {
  if (evidenceHints.survivalFields?.length) return evidenceHints.survivalFields;
  const frost = String(meta?.frostSensitivity || '').toLowerCase();
  const fields = [];
  if (frost) fields.push('frostSensitivity');
  if (meta?.coldTolerance != null && meta?.coldTolerance !== '') fields.push('coldTolerance');
  if (evidenceHints.usedQuantitativeCold) {
    fields.push('quantitative.minimum_survival_temperature_c');
  }
  if (evidenceHints.usedHumiditySurvival) fields.push('humidityTolerance');
  if (evidenceHints.usedMoistureSurvival) {
    fields.push('humidityTolerance');
    if (meta?.waterNeeds) fields.push('waterNeeds');
  }
  if (evidenceHints.usedTropicalGroup) fields.push('groupIds');
  // Climate risk material → cold traits required for confident survival either way
  const freezing = String(env?.freezingRisk || '').toLowerCase();
  if (freezing === 'high' || freezing === 'medium' || env?.isFrostFreeGrowingClimate === false) {
    if (!fields.includes('frostSensitivity') && frost) fields.push('frostSensitivity');
  }
  return [...new Set(fields)];
}

export function inferGrowthMaterialFields({ meta, growth, evidenceHints = {} } = {}) {
  if (evidenceHints.growthFields?.length) return evidenceHints.growthFields;
  const fields = [];
  if (evidenceHints.usedHumidityGrowth || String(meta?.humidityTolerance || '').toLowerCase() === 'low') {
    if (meta?.humidityTolerance != null) fields.push('humidityTolerance');
  }
  if (evidenceHints.usedMoistureGrowth) fields.push('humidityTolerance');
  if (evidenceHints.usedWarmNeed) {
    fields.push('frostSensitivity');
    if (meta?.groupIds) fields.push('groupIds');
  }
  if (evidenceHints.usedHeat || evidenceHints.usedVpd) {
    if (meta?.heatTolerance) fields.push('heatTolerance');
  }
  // Default Supported/Poor still plant-specific — bound by core climate traits present
  if (!fields.length) {
    if (meta?.frostSensitivity) fields.push('frostSensitivity');
    if (meta?.humidityTolerance) fields.push('humidityTolerance');
    if (meta?.heatTolerance) fields.push('heatTolerance');
  }
  void growth;
  return [...new Set(fields)];
}

export function inferFloweringMaterialFields(meta) {
  const fields = [];
  if (meta?.floweringRequirements) fields.push('floweringRequirements');
  else fields.push('floweringRequirements'); // UNKNOWN authorizing field
  return fields;
}

export function inferFruitingMaterialFields(meta) {
  const fields = ['fruitingRequirements'];
  const bio = meta?.reproductiveBiology || {};
  for (const k of Object.keys(bio)) {
    fields.push(`reproductive.${k}`);
  }
  return fields;
}

/**
 * Apply dimension-specific evidence-strength bounding to computed outcomes.
 */
export function applyEvidenceStrengthPropagation({
  meta,
  env = {},
  survival,
  growth,
  flowering,
  fruiting,
  evidenceHints = {}
} = {}) {
  const warnings = [];
  const demotions = [];

  const survFields = inferSurvivalMaterialFields({
    meta,
    survival,
    env,
    evidenceHints
  });
  const survBound = boundOutcomeByEvidenceStrength(survival, meta, survFields, {
    dimension: 'Survival'
  });
  if (survBound.demoted) {
    demotions.push(survBound);
    warnings.push(
      'Survival confidence bounded: material cold/survival traits are not SOURCE_SUPPORTED — provisional only.'
    );
  }

  const growFields = inferGrowthMaterialFields({ meta, growth, evidenceHints });
  const growBound = boundOutcomeByEvidenceStrength(growth, meta, growFields, {
    dimension: 'Growth'
  });
  if (growBound.demoted) {
    demotions.push(growBound);
    warnings.push(
      'Growth confidence bounded: material growth/tolerance traits are not SOURCE_SUPPORTED — provisional only.'
    );
  }

  const flowerFields = inferFloweringMaterialFields(meta);
  const flowerBound = boundOutcomeByEvidenceStrength(flowering, meta, flowerFields, {
    dimension: 'Flowering'
  });
  if (flowerBound.demoted) {
    demotions.push(flowerBound);
    warnings.push(
      'Flowering confidence bounded: floweringRequirements not SOURCE_SUPPORTED.'
    );
  }

  const fruitFields = inferFruitingMaterialFields(meta);
  const fruitBound = boundOutcomeByEvidenceStrength(fruiting, meta, fruitFields, {
    dimension: 'Fruiting'
  });
  if (fruitBound.demoted) {
    demotions.push(fruitBound);
    warnings.push(
      'Fruiting confidence bounded: fruiting/reproductive traits not SOURCE_SUPPORTED.'
    );
  }

  return {
    version: EVIDENCE_STRENGTH_PROPAGATION_VERSION,
    survival: survBound.status,
    growth: growBound.status,
    flowering: flowerBound.status,
    fruiting: fruitBound.status,
    demotions,
    warnings,
    traces: {
      Survival: survBound,
      Growth: growBound,
      Flowering: flowerBound,
      Fruiting: fruitBound
    }
  };
}

/**
 * Trace plant-side facts for a dimension (audit helper).
 */
export function tracePlantEvidenceForDimension(meta, fields, sourcesByField = {}) {
  return (fields || []).map((field) => {
    const evidenceClass = resolveTraitEvidenceClass(meta, field);
    const root = meta?.climateTraits || meta;
    let value = root?.[field];
    if (field.startsWith('reproductive.')) {
      value = (meta?.reproductiveBiology || root?.reproductiveBiology || {})[
        field.slice('reproductive.'.length)
      ];
    }
    return {
      field,
      value: value ?? null,
      evidenceClass,
      source: sourcesByField[field] || meta?.traitProvenance?.[field] || null
    };
  });
}

/**
 * Audit whether a row's confident statuses depend on heuristic/unknown evidence.
 * Prefer evaluator evidenceStrength traces (actual material fields) when present.
 */
export function auditConfidentDependsOnWeakEvidence(row, meta) {
  const hits = [];
  const fieldsFromTrace = (dimension) => {
    const tr = row?.evidenceStrength?.traces?.[dimension];
    const list = tr?.materialEvidence?.fields;
    if (Array.isArray(list) && list.length) return list.map((f) => f.field);
    return null;
  };
  const check = (dimension, status, fields) => {
    if (!isConfidentOutcomeStatus(status)) return;
    const summary = summarizeMaterialEvidence(meta, fields);
    if (!summary.allSource) {
      hits.push({
        dimension,
        status,
        dependsOnHeuristic: summary.hasHeuristic,
        dependsOnUnknown: summary.hasUnknown && !summary.hasSource,
        fields: summary.fields
      });
    }
  };
  check(
    'Survival',
    row.survival,
    fieldsFromTrace('Survival') ||
      inferSurvivalMaterialFields({ meta, survival: row.survival, env: row.env || {} })
  );
  check(
    'Growth',
    row.growth,
    fieldsFromTrace('Growth') || inferGrowthMaterialFields({ meta, growth: row.growth })
  );
  check(
    'Flowering',
    row.flowering,
    fieldsFromTrace('Flowering') || inferFloweringMaterialFields(meta)
  );
  check(
    'Fruiting',
    row.fruiting,
    fieldsFromTrace('Fruiting') || inferFruitingMaterialFields(meta)
  );
  if (isConfidentOverall(row.overall)) {
    const survFields =
      fieldsFromTrace('Survival') ||
      inferSurvivalMaterialFields({ meta, survival: row.survival, env: row.env || {} });
    const growFields =
      fieldsFromTrace('Growth') || inferGrowthMaterialFields({ meta, growth: row.growth });
    const survWeak = !materialFieldsAuthorizeConfidence(meta, survFields);
    const growWeak = !materialFieldsAuthorizeConfidence(meta, growFields);
    if (row.overall === 'blocked' && survWeak) {
      hits.push({
        dimension: 'Overall',
        status: row.overall,
        dependsOnHeuristic: true,
        fields: survFields.map((f) => ({
          field: f,
          evidenceClass: resolveTraitEvidenceClass(meta, f)
        }))
      });
    } else if (
      (row.overall === 'good' || row.overall === 'excellent') &&
      (survWeak || growWeak)
    ) {
      hits.push({
        dimension: 'Overall',
        status: row.overall,
        dependsOnHeuristic: survWeak || growWeak,
        fields: []
      });
    }
  }
  return hits;
}
