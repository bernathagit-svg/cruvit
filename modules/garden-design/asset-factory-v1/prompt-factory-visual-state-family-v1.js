/**
 * Visual-state family prompts. Shared identity lock + state-specific delta.
 * Does not call providers. Does not spend. Does not encode physical meters.
 */
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';
import { treePromptV2Lines } from './composition-calibration-v2.js';

export const PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY = 'design-cutout-visual-state-family-v1';

export const FAMILY_LOCK_FIELDS = Object.freeze([
  'canonicalSlug',
  'scientific',
  'visualForm',
  'cameraTreatment',
  'gardenGrownNaturalArchitecture',
  'naturalPhotographicDetail',
  'transparentCutout'
]);

export const STATE_DELTA_FIELDS = Object.freeze([
  'growthStage',
  'phenologyState',
  'architectureMode'
]);

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

export function familyLockLines(job = {}) {
  const form = asText(job.visualForm) || 'unknown visual form';
  const identityNote =
    job.identityPrecision === 'GENUS_VISUALLY_REPRESENTABLE' || job.identityScope === 'genus'
      ? 'Remain at genus-level identity. Do not invent a species or cultivar.'
      : 'Keep this exact canonical botanical identity. Do not drift into a different species, cultivar, or specimen style.';
  return [
    `FAMILY LOCK for ${scientificIdentity(job)}.`,
    identityNote,
    `Visual form class: ${form}.`,
    'Camera: planted-bed eye level, ground-level three-quarter garden view of a real planted specimen. Forbid catalog elevation, herbarium sheet, top-down plan, isometric product render, and flattened nursery-tag presentation.',
    'Garden-grown natural architecture with irregular organic branching or leaf arrangement. Avoid perfect stock-photo symmetry and lollipop shapes.',
    form === 'tree' ? treePromptV2Lines().join(' ') : '',
    'Natural photographic outdoor detail. Avoid hyper-detailed studio-render microtexture, plastic smoothness, and oversharpened CGI look.',
    'Isolated whole plant, true transparent background, no backdrop.',
    'Clean ground-contact at the base, generous empty transparent margin so nothing is cropped.',
    'No pot, no planter, no scenery, no grass patch, no soil rectangle, no fake ground plane, no studio sweep, no checkerboard, no text, no watermark, no labels.',
    'Natural daylight, not dramatic studio lighting.',
    'Do not encode physical meters, height labels, or mature size ranges into the image. Architecture and state only. Runtime owns physical scale.',
    'Do not try to solve sticker-look, halo, or garden-photo color match in this generation. Those are runtime integration responsibilities.'
  ].filter(Boolean);
}

export function stateDeltaLines(job = {}) {
  const stage = asText(job.growthStage) || 'mature';
  const phenology = asText(job.phenologyState || job.phenology) || 'vegetative';
  const architecture = asText(job.architectureMode) || 'default';
  const lines = [
    `STATE DELTA only: growthStage=${stage}, architectureMode=${architecture}, phenologyState=${phenology}.`,
    'This variant must look like the same plant identity as other family members. Change only the requested state. Do not invent a different specimen, lighting style, or camera.'
  ];
  if (stage === 'young') {
    lines.push(
      'YOUNG: represent a genuinely younger architectural stage — smaller trunk/stem caliper, simpler branching or fewer leaves/pups as botanically appropriate. Not the mature asset scaled smaller. Do not use mature canopy architecture.'
    );
  }
  if (stage === 'mature') {
    lines.push('MATURE: fully developed architecture for this identity and architectureMode.');
  }
  if (phenology === 'vegetative') {
    lines.push('VEGETATIVE: foliage/architecture only. No conspicuous flowers. No conspicuous fruit.');
  }
  if (phenology === 'flowering') {
    lines.push(
      'FLOWERING: keep the same underlying plant architecture. Flowers must be materially visible. No impossible flower density. No replacing the plant with a bouquet.'
    );
  }
  if (phenology === 'fruiting') {
    lines.push(
      'FRUITING: keep the same underlying architecture. Fruit must be materially visible with plausible distribution/load. No decorative overloading. No fruit hovering in empty space.'
    );
  }
  if (phenology === 'dormant') {
    lines.push(
      'DORMANT: preserve branch/trunk identity and architecture. Remove foliage only where biologically appropriate for deciduous leaf-off. Do not create a dead, snapped, diseased, or damaged plant.'
    );
  }
  if (architecture === 'tree') {
    lines.push(
      'TREE architectureMode: single dominant woody trunk and canopy tree structure, not a multi-stem shrub scaled up.'
    );
  }
  if (architecture === 'shrub') {
    lines.push(
      'SHRUB architectureMode: multi-stem shrub structure from the base. Structural change, not merely resizing a tree cutout.'
    );
  }
  return lines;
}

export function buildVisualStateFamilyPromptRecord(job = {}, options = {}) {
  const settings = { ...DEFAULT_GENERATION_SETTINGS, ...(options.settings || {}) };
  const prompt = [...familyLockLines(job), ...stateDeltaLines(job)].join(' ');
  return {
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_FAMILY,
    provider: asText(options.provider || 'unspecified'),
    model: asText(options.model || 'unspecified'),
    settings,
    prompt,
    familyLockFields: FAMILY_LOCK_FIELDS,
    stateDeltaFields: STATE_DELTA_FIELDS,
    canonicalSlug: job.canonicalSlug || null,
    variantKey: job.variantKey || null,
    jobId: job.jobId || null,
    growthStage: job.growthStage || null,
    architectureMode: job.architectureMode || null,
    phenologyState: job.phenologyState || job.phenology || null,
    visualForm: job.visualForm || null,
    identityPrecision: job.identityPrecision || null,
    identityScope: job.identityScope || null,
    encodesPhysicalMeters: false,
    generateNow: false
  };
}
