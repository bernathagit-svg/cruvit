/**
 * Next production Design Asset prompt: visual-state family + Detail V2 principles.
 * Planning contract only. Does not generate. Does not spend.
 * Historical Batch-2 used design-cutout-visual-state-family-v1.
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
import { PRODUCTION_SHARPNESS_LINE } from './prompt-factory-woody-foliage-detail-v2-experiment-v1.js';

export const PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2 = 'design-cutout-visual-state-detail-v2';

export const DETAIL_V2_PRODUCTION_REQUIRE = Object.freeze([
  'individually legible natural foliage',
  'clear leaf/leaflet boundaries',
  'realistic fine botanical texture',
  'natural branch/leaf separation',
  'photographic foliage at 100% pixel inspection'
]);

export const DETAIL_V2_PRODUCTION_FORBID_SOFT = Object.freeze([
  'painterly foliage masses',
  'green glow',
  'specimen-wide soft focus',
  'artificial depth-of-field blur',
  'fused leafy blobs'
]);

export const DETAIL_V2_PRODUCTION_STILL_FORBID = Object.freeze([
  'crunchy HDR sharpening',
  'CGI microtexture',
  'synthetic leaf patterns',
  'oversharpened edges',
  'studio-isolate aesthetic',
  'baked scene shadow',
  'baked runtime blend'
]);

export function visualStateDetailV2Lines() {
  return [
    'DETAIL REQUIREMENTS: individually legible natural foliage; clear leaf and leaflet boundaries; realistic fine botanical texture; natural branch and leaf separation; visible separation between overlapping leaf clusters; foliage must remain photographic at 100% pixel inspection. Do not request fake hyper-detail.',
    'DETAIL FORBIDDEN: painterly foliage masses; watercolor or smeared leaf clusters; green glow around foliage; specimen-wide soft focus; artificial depth-of-field blur; fused leafy blobs.',
    'STILL FORBIDDEN: HDR or crunchy sharpening; artificial edge halos; synthetic CGI microtexture; synthetic leaf patterns; oversharpened cutout edges; studio-isolate aesthetic; baked scene shadow; baked runtime blend.'
  ];
}

export function familyLockLinesVisualStateDetailV2(job = {}) {
  return familyLockLines(job).map((line) =>
    line === PRODUCTION_SHARPNESS_LINE ? visualStateDetailV2Lines().join(' ') : line
  );
}

export function buildVisualStateDetailV2PromptRecord(job = {}, options = {}) {
  const settings = {
    ...DEFAULT_GENERATION_SETTINGS,
    quality: 'medium',
    ...(options.settings || {})
  };
  const prompt = [...familyLockLinesVisualStateDetailV2(job), ...stateDeltaLines(job)].join(' ');
  return {
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
    nextProductionPrompt: true,
    appliedToPaidExecute: false,
    generateNow: false,
    round1LearningInherited: ROUND_1_LEARNING_INHERITED,
    runtimeNotInPng: RUNTIME_NOT_IN_PNG,
    require: DETAIL_V2_PRODUCTION_REQUIRE,
    forbidSoft: DETAIL_V2_PRODUCTION_FORBID_SOFT,
    stillForbid: DETAIL_V2_PRODUCTION_STILL_FORBID,
    provider: options.provider || 'openai-images-api',
    model: options.model || 'unspecified',
    settings,
    prompt,
    familyLockFields: FAMILY_LOCK_FIELDS,
    stateDeltaFields: STATE_DELTA_FIELDS,
    canonicalSlug: job.canonicalSlug || null,
    jobId: job.jobId || null,
    growthStage: job.growthStage || null,
    architectureMode: job.architectureMode || null,
    phenologyState: job.phenologyState || job.phenology || null,
    visualForm: job.visualForm || null,
    encodesPhysicalMeters: false
  };
}
