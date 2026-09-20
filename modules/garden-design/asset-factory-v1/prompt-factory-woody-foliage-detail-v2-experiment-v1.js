/**
 * Experimental woody-foliage detail prompt V2.
 * Not the production factory prompt. Do not import from paid execute yet.
 */
import {
  FAMILY_LOCK_FIELDS,
  ROUND_1_LEARNING_INHERITED,
  RUNTIME_NOT_IN_PNG,
  STATE_DELTA_FIELDS,
  familyLockLines,
  stateDeltaLines
} from './prompt-factory-visual-state-family-v1.js';
import { DEFAULT_GENERATION_SETTINGS } from './prompt-factory-v1.js';

export const PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2 =
  'design-cutout-woody-foliage-detail-v2-experiment';

export const WOODY_FOLIAGE_DETAIL_V2_REQUIRE = Object.freeze([
  'individually legible natural mango leaves',
  'clear leaflet/leaf boundaries throughout the canopy',
  'realistic fine botanical foliage texture',
  'visible separation between overlapping leaf clusters',
  'crisp photographic leaf and branch definition',
  'natural variation between foreground and interior foliage',
  'foliage must remain photographic at 100% pixel inspection'
]);

export const WOODY_FOLIAGE_DETAIL_V2_FORBID_SOFT = Object.freeze([
  'painterly foliage masses',
  'watercolor / smeared leaf clusters',
  'green glow around foliage',
  'specimen-wide soft focus',
  'artificial depth-of-field blur',
  'fused leafy blobs'
]);

export const WOODY_FOLIAGE_DETAIL_V2_STILL_FORBID = Object.freeze([
  'HDR / crunchy sharpening',
  'artificial edge halos',
  'synthetic CGI microtexture',
  'oversharpened cutout edges'
]);

export const PRODUCTION_SHARPNESS_LINE =
  'Natural photographic outdoor sharpness and detail. Avoid hyper-detailed studio-render microtexture, plastic smoothness, and oversharpened CGI look.';

export function woodyFoliageDetailV2Lines() {
  return [
    'DETAIL REQUIREMENTS: individually legible natural mango leaves; clear leaflet and leaf boundaries throughout the canopy; realistic fine botanical foliage texture; visible separation between overlapping leaf clusters; crisp photographic leaf and branch definition; natural variation between foreground and interior foliage; foliage must remain photographic at 100% pixel inspection. Do not request fake hyper-detail.',
    'DETAIL FORBIDDEN: painterly foliage masses; watercolor or smeared leaf clusters; green glow around foliage; specimen-wide soft focus; artificial depth-of-field blur; fused leafy blobs.',
    'STILL FORBIDDEN: HDR or crunchy sharpening; artificial edge halos; synthetic CGI microtexture; oversharpened cutout edges.'
  ];
}

export function familyLockLinesWoodyFoliageDetailV2(job = {}) {
  return familyLockLines(job).map((line) =>
    line === PRODUCTION_SHARPNESS_LINE ? woodyFoliageDetailV2Lines().join(' ') : line
  );
}

export function buildWoodyFoliageDetailV2PromptRecord(job = {}, options = {}) {
  const settings = {
    ...DEFAULT_GENERATION_SETTINGS,
    ...(options.settings || {})
  };
  const prompt = [...familyLockLinesWoodyFoliageDetailV2(job), ...stateDeltaLines(job)].join(' ');
  return {
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_WOODY_FOLIAGE_DETAIL_V2,
    appliedToProductionFactory: false,
    round1LearningInherited: ROUND_1_LEARNING_INHERITED,
    runtimeNotInPng: RUNTIME_NOT_IN_PNG,
    require: WOODY_FOLIAGE_DETAIL_V2_REQUIRE,
    forbidSoft: WOODY_FOLIAGE_DETAIL_V2_FORBID_SOFT,
    stillForbid: WOODY_FOLIAGE_DETAIL_V2_STILL_FORBID,
    provider: options.provider || 'openai-images-api',
    model: options.model || 'unspecified',
    settings,
    prompt,
    familyLockFields: FAMILY_LOCK_FIELDS,
    stateDeltaFields: STATE_DELTA_FIELDS,
    canonicalSlug: job.canonicalSlug || 'mango',
    jobId: job.jobId || null,
    growthStage: job.growthStage || 'mature',
    architectureMode: job.architectureMode || 'tree',
    phenologyState: job.phenologyState || 'vegetative',
    visualForm: job.visualForm || 'tree',
    encodesPhysicalMeters: false,
    generateNow: false
  };
}
