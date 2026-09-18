/**
 * Versioned prompt factory. Builds prompts from structured job metadata.
 * Does not hard-code plant species. Does not call providers.
 */
export const PROMPT_TEMPLATE_VERSION = 'design-cutout-v1';

export const DEFAULT_GENERATION_SETTINGS = Object.freeze({
  size: '1024x1536',
  quality: 'medium',
  background: 'transparent',
  outputFormat: 'png',
  n: 1
});

function asText(value) {
  return String(value == null ? '' : value).trim();
}

function scientificIdentity(job = {}) {
  const scientific = asText(job.scientific || job.scientificName);
  const slug = asText(job.canonicalSlug);
  if (scientific && slug) return `${scientific} (canonical identity ${slug})`;
  if (scientific) return scientific;
  if (slug) return `canonical identity ${slug}`;
  return 'unresolved canonical identity';
}

export function buildPromptRecord(job = {}, options = {}) {
  const templateVersion = options.promptTemplateVersion || PROMPT_TEMPLATE_VERSION;
  const settings = { ...DEFAULT_GENERATION_SETTINGS, ...(options.settings || {}) };
  const provider = asText(options.provider || 'unspecified');
  const model = asText(options.model || 'unspecified');
  const stage = asText(job.growthStage) || 'unspecified';
  const form = asText(job.visualForm) || 'unknown visual form';
  const habit = (job.habitModifiers || []).join(', ') || 'habit unspecified';
  const phenology = asText(job.phenology) || 'vegetative';
  const season = asText(job.season) || 'season-neutral';
  const formView = asText(job.formView);
  const identityNote =
    job.identityPrecision === 'GENUS_VISUALLY_REPRESENTABLE' || job.identityScope === 'genus'
      ? 'Remain at genus-level identity. Do not invent a species or cultivar. Neutral vegetative morphology only; no fruit, flowers, or cultivar traits.'
      : '';
  const prompt = [
    `Photorealistic horticultural specimen of a ${stage} ${form}, ${scientificIdentity(job)}.`,
    identityNote,
    `Habit modifiers: ${habit}.`,
    `Phenology must be ${phenology} only.`,
    `Season context: ${season}.`,
    formView ? `Form view: ${formView}.` : '',
    'Isolated whole plant, true transparent background, no backdrop.',
    'Ground-level three-quarter garden viewing angle suitable for overlay on a real garden photo.',
    'Natural proportions, clean ground-contact at the base, generous empty transparent margin so nothing is cropped.',
    'No pot, no planter, no scenery, no grass patch, no soil rectangle, no fake ground plane, no studio sweep, no checkerboard, no text, no watermark, no labels.',
    'Natural daylight, not dramatic studio lighting.'
  ]
    .filter(Boolean)
    .join(' ');

  return {
    promptTemplateVersion: templateVersion,
    provider,
    model,
    settings,
    prompt,
    identityPrecision: job.identityPrecision || null,
    identityScope: job.identityScope || null,
    jobId: job.jobId || null,
    canonicalSlug: job.canonicalSlug || null,
    variantKey: job.variantKey || null
  };
}
