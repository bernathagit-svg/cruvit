/**
 * Experimental BRANCH_STRUCTURE prompt. Prep only.
 * Does not replace production Detail V2. Does not generate. Does not spend.
 * HIGH is not assumed to solve alpha/ghosting.
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

export const PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT =
  'design-cutout-branch-structure-v2-experiment';

export const BRANCH_STRUCTURE_V2_REQUIRE = Object.freeze([
  'clean deciduous branch hierarchy',
  'clearly separated primary and secondary branches',
  'restrained twig density',
  'true transparent negative space between branches',
  'solid opaque bark on real wood',
  'no residual leaf masses',
  'no translucent brown clouds',
  'no duplicated or faded ghost branches',
  'living dormant architecture, not dead or damaged'
]);

export const BRANCH_STRUCTURE_V2_FORBID = Object.freeze([
  'semi-transparent brown canopy fill',
  'ghost branches',
  'dirty matte haze in negative space',
  'residual leafy masses on a leafless dormant tree',
  'specimen-wide translucent wood',
  'dead, snapped, diseased, or damaged appearance',
  'crunchy HDR sharpening',
  'CGI microtexture'
]);

export function branchStructureV2Lines() {
  return [
    'BRANCH STRUCTURE REQUIREMENTS: leafless deciduous tree. Clean primary scaffold with clearly separated secondary branches. Restrained twig density — do not fill the crown with a cloud of interior twigs. True empty transparent negative space between branches. Real wood is solid and opaque. Photographic branch bark at 100% pixel inspection.',
    'BRANCH STRUCTURE FORBIDDEN: residual leaf masses; translucent brown clouds or dirty matte fill in the crown; duplicated or faded ghost branches; semi-transparent specimen-wide wood; painterly branch haze; dead, snapped, diseased, or damaged trees.',
    'STILL FORBIDDEN: HDR or crunchy sharpening; artificial edge halos; synthetic CGI microtexture; oversharpened cutout edges; studio-isolate aesthetic; baked scene shadow; baked runtime blend.',
    'Do not apply leafy foliage-detail requirements to this leafless dormant variant.'
  ];
}

export function familyLockLinesBranchStructureV2(job = {}) {
  return familyLockLines(job).map((line) =>
    line === PRODUCTION_SHARPNESS_LINE ? branchStructureV2Lines().join(' ') : line
  );
}

export function branchStructureStateDeltaLines(job = {}) {
  return stateDeltaLines(job).map((line) => {
    if (!String(line).startsWith('DORMANT:')) return line;
    return 'DORMANT: leafless deciduous architecture only. Preserve trunk identity. Clean primary / secondary hierarchy. Restrained twig density. True transparent negative space between branches. No residual foliage. No translucent brown clouds. No duplicated or faded ghost branches. Not dead or damaged.';
  });
}

export function buildBranchStructureV2ExperimentPromptRecord(job = {}, options = {}) {
  const settings = {
    ...DEFAULT_GENERATION_SETTINGS,
    ...(options.settings || {}),
    quality: 'medium'
  };
  const prompt = [...familyLockLinesBranchStructureV2(job), ...branchStructureStateDeltaLines(job)].join(' ');
  return {
    promptTemplateVersion: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
    experimental: true,
    replacesProductionDetailV2: false,
    generateNow: false,
    appliedToPaidExecute: false,
    qualityAssumedToSolveGhosting: false,
    highQualityNotSelected: true,
    round1LearningInherited: ROUND_1_LEARNING_INHERITED,
    runtimeNotInPng: RUNTIME_NOT_IN_PNG,
    require: BRANCH_STRUCTURE_V2_REQUIRE,
    forbid: BRANCH_STRUCTURE_V2_FORBID,
    provider: options.provider || 'openai-images-api',
    model: options.model || 'unspecified',
    settings,
    prompt,
    familyLockFields: FAMILY_LOCK_FIELDS,
    stateDeltaFields: STATE_DELTA_FIELDS,
    canonicalSlug: job.canonicalSlug || 'apple',
    jobId: job.jobId || null,
    growthStage: job.growthStage || 'mature',
    architectureMode: job.architectureMode || 'tree',
    phenologyState: job.phenologyState || 'dormant',
    visualForm: job.visualForm || 'tree',
    encodesPhysicalMeters: false
  };
}

export const APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT = Object.freeze({
  execute: false,
  generateNow: false,
  spendGate: 'DENIED',
  purpose: 'Correct BRANCH_STRUCTURE prompt after MIXED provider-ghosting + overcomplex foliage-on-dormant prompt. Do not assume HIGH.',
  jobs: Object.freeze([
    {
      rank: 1,
      family: 'BRANCH_STRUCTURE',
      canonicalSlug: 'apple',
      scientific: 'Malus domestica',
      architectureMode: 'tree',
      growthStage: 'mature',
      phenologyState: 'dormant',
      prompt: PROMPT_TEMPLATE_VERSION_BRANCH_STRUCTURE_V2_EXPERIMENT,
      quality: 'medium',
      highQuality: false,
      control: 'apple__mature__tree__dormant__detail-v2__medium.png',
      generateNow: false,
      separateHighAbRequiresOwnerApproval: true
    }
  ])
});
