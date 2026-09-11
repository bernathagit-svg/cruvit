/**
 * Plant Doctor recorded fixtures — ZERO paid AI calls.
 * Diagnostic Safety V1 shapes for MATCH HIGH/MEDIUM/LOW, MISMATCH, UNCERTAIN.
 */

export const FIXTURE_MATCH_HIGH = Object.freeze({
  plant_name: 'Mango',
  problem_name: 'Sooty mold',
  likely_diagnosis: 'Sooty mold',
  severity: 'medium',
  diagnostic_confidence: 'high',
  diagnosis:
    'Observed: dark coating on leaf surfaces. Inferred: sooty mold associated with honeydew; differentials considered but sooty mold best fits the visible coating.',
  observed_symptoms: ['dark coating on leaf surface', 'coating wipes partially'],
  differential_diagnoses: [
    'surface contamination / dust',
    'fungal leaf disease',
    'pest-associated honeydew leading to sooty mold'
  ],
  recommended_next_action: 'Gently wipe a leaf and inspect the underside for pests',
  needs_more_evidence: false,
  requested_evidence: [],
  safe_immediate_actions: [
    'Inspect leaf undersides for aphids/scale',
    'Gently clean coated leaves with water',
    'Monitor for 3–5 days'
  ],
  products: [{ emoji: '🧴', name: 'Copper fungicide', desc: 'Should be gated' }],
  biological: [],
  home_remedy: ['Inspect leaf undersides for aphids/scale'],
  identity_assessment: 'match',
  identity_reason: 'Leaf shape and growth habit consistent with Mangifera indica (Mango).'
});

/** Alias used by older tests — MATCH + HIGH. */
export const FIXTURE_MATCH_DIAGNOSIS = FIXTURE_MATCH_HIGH;

export const FIXTURE_MATCH_MEDIUM = Object.freeze({
  plant_name: 'Mango',
  problem_name: 'Likely sooty mold',
  likely_diagnosis: 'Likely sooty mold',
  severity: 'medium',
  diagnostic_confidence: 'medium',
  diagnosis:
    'Observed: black leaf coating. Inferred: sooty mold is plausible, but surface contamination or fungal disease could look similar.',
  observed_symptoms: ['black coating on leaves'],
  differential_diagnoses: [
    'sooty mold',
    'surface contamination',
    'fungal leaf disease',
    'pest-associated honeydew'
  ],
  recommended_next_action: 'Photograph the underside of an affected leaf',
  needs_more_evidence: true,
  requested_evidence: ['underside of leaf', 'full plant photo'],
  safe_immediate_actions: ['Isolate from adjacent plants', 'Inspect for pests', 'Do not apply chemicals yet'],
  products: [],
  biological: [],
  home_remedy: ['Inspect for pests'],
  identity_assessment: 'match',
  identity_reason: 'Consistent with mango foliage.'
});

export const FIXTURE_MATCH_LOW = Object.freeze({
  plant_name: 'Mango',
  problem_name: 'Unclear leaf discoloration',
  likely_diagnosis: 'Unclear leaf discoloration',
  severity: 'unknown',
  diagnostic_confidence: 'low',
  diagnosis:
    'Observed: unclear discoloration. Image quality is insufficient for a definitive diagnosis.',
  observed_symptoms: ['unclear discoloration'],
  differential_diagnoses: ['nutrient issue', 'fungal disease', 'environmental stress'],
  recommended_next_action: 'Retake a clear close-up of the affected leaf',
  needs_more_evidence: true,
  requested_evidence: ['clearer leaf close-up', 'answer about watering'],
  safe_immediate_actions: ['Monitor only', 'Avoid chemical treatments until clearer evidence'],
  products: [],
  biological: [],
  home_remedy: ['Monitor only'],
  identity_assessment: 'match',
  identity_reason: 'Plant identity appears consistent, but diagnosis confidence is low.'
});

export const FIXTURE_MISMATCH = Object.freeze({
  plant_name: 'Basil',
  problem_name: 'Possible nutrient deficiency',
  likely_diagnosis: 'Possible nutrient deficiency',
  severity: 'low',
  diagnostic_confidence: 'medium',
  diagnosis: 'Herb foliage with mild yellowing; does not match the expected mango tree.',
  observed_symptoms: ['herbaceous leaves', 'mild yellowing'],
  differential_diagnoses: ['nutrient deficiency', 'overwatering'],
  recommended_next_action: 'Upload a photo of the selected mango plant',
  needs_more_evidence: true,
  requested_evidence: ['photo of the selected plant'],
  safe_immediate_actions: ['Confirm the correct plant photo'],
  products: [],
  biological: [],
  home_remedy: ['Confirm the correct plant photo'],
  identity_assessment: 'mismatch',
  identity_reason: 'Photo shows a small herbaceous plant, not a mango tree.'
});

export const FIXTURE_UNCERTAIN = Object.freeze({
  plant_name: 'Unknown plant',
  problem_name: 'Possible leaf discoloration',
  likely_diagnosis: 'Possible leaf discoloration',
  severity: 'unknown',
  diagnostic_confidence: 'low',
  diagnosis: 'Image is blurry; cannot confirm species identity with confidence.',
  observed_symptoms: ['blurry foliage'],
  differential_diagnoses: [],
  recommended_next_action: 'Retake a clearer photo of the selected plant',
  needs_more_evidence: true,
  requested_evidence: ['clearer full-plant photo'],
  safe_immediate_actions: ['Retake a clearer photo of the selected plant'],
  products: [],
  biological: [],
  home_remedy: ['Retake a clearer photo of the selected plant'],
  identity_assessment: 'uncertain',
  identity_reason: 'Photo quality and framing are insufficient to confirm Mango.'
});

export const FIXTURE_PROVIDER_FAILURE = Object.freeze({
  error: true,
  status: 500,
  message: 'AI diagnosis error (500)'
});

export const FIXTURE_MALFORMED_RESPONSE = Object.freeze({
  rawText: 'Sure! Here is what I think about your plant without JSON…'
});

/** Count of provider HTTP calls represented by these fixtures (always zero in tests). */
export const FIXTURE_PROVIDER_CALLS = 0;
