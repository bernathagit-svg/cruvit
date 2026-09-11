/**
 * Plant Doctor recorded fixtures — ZERO paid AI calls.
 * Used by unit/integration tests instead of resending images to the provider.
 */

export const FIXTURE_MATCH_DIAGNOSIS = Object.freeze({
  plant_name: 'Mango',
  problem_name: 'Possible fungal leaf spot',
  severity: 'medium',
  diagnosis:
    'Leaf spotting consistent with fungal leaf spot on mango foliage. Certainty is limited from one photo.',
  products: [{ emoji: '🧴', name: 'Copper fungicide', desc: 'Labeled use' }],
  biological: [],
  home_remedy: ['Inspect affected leaves', 'Improve airflow'],
  identity_assessment: 'match',
  identity_reason: 'Leaf shape and growth habit are consistent with Mangifera indica (Mango).'
});

export const FIXTURE_MISMATCH = Object.freeze({
  plant_name: 'Basil',
  problem_name: 'Possible nutrient deficiency',
  severity: 'low',
  diagnosis: 'Herb foliage with mild yellowing; does not match the expected mango tree.',
  products: [],
  biological: [],
  home_remedy: ['Confirm the correct plant photo'],
  identity_assessment: 'mismatch',
  identity_reason: 'Photo shows a small herbaceous plant, not a mango tree.'
});

export const FIXTURE_UNCERTAIN = Object.freeze({
  plant_name: 'Unknown plant',
  problem_name: 'Possible leaf discoloration',
  severity: 'low',
  diagnosis: 'Image is blurry; cannot confirm species identity with confidence.',
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
