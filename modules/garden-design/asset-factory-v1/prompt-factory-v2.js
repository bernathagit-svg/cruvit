/**
 * Prompt Factory V2 — calibration Round 1 learning.
 * Structured job metadata only. Does not hard-code species copy.
 * Does not call providers. Does not spend.
 */
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';

export const PROMPT_TEMPLATE_VERSION_V2 = 'design-cutout-v2';

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

export function buildPromptRecordV2(job = {}, options = {}) {
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
    'Camera: planted-bed eye level, ground-level three-quarter view, as if standing in the garden looking at a real planted specimen.',
    'Explicitly forbid catalog elevation, herbarium sheet, top-down plan, isometric product render, and flattened nursery-tag presentation.',
    'Silhouette: natural horticultural architecture with irregular organic branching or leaf arrangement. Avoid perfect stock-photo symmetry and lollipop-tree shapes.',
    'Scale and framing: realistic specimen proportions for overlay in a real garden photo. Preserve the full plant. Leave enough transparent margin that nothing is cropped. Do not miniaturize the plant inside a large empty canvas.',
    'Sharpness: natural photographic outdoor detail. Avoid hyper-detailed studio-render microtexture, plastic smoothness, and oversharpened CGI look.',
    'Isolated whole plant, true transparent background, no backdrop.',
    'Natural proportions, clean ground-contact at the base, generous empty transparent margin so nothing is cropped.',
    'No pot, no planter, no scenery, no grass patch, no soil rectangle, no fake ground plane, no studio sweep, no checkerboard, no text, no watermark, no labels.',
    'Natural daylight, not dramatic studio lighting.',
    'Do not try to solve sticker-look, halo, or garden-photo color match in this generation. Those are runtime integration responsibilities.'
  ]
    .filter(Boolean)
    .join(' ');

  return {
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_V2,
    provider,
    model,
    settings,
    prompt,
    identityPrecision: job.identityPrecision || null,
    identityScope: job.identityScope || null,
    jobId: job.jobId || null,
    canonicalSlug: job.canonicalSlug || null,
    variantKey: job.variantKey || null,
    regenerate: false
  };
}
