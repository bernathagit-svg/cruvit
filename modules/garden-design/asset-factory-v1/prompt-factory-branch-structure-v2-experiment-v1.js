/**
 * Experimental BRANCH_STRUCTURE prompt. Prep only.
 * Does not replace production Detail V2. Does not generate. Does not spend.
 * Must not inherit leafy foliage instructions that contradict a leafless dormant asset.
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

export const BRANCH_STRUCTURE_ALPHA_CONTRACT = Object.freeze({
  emptySpaceIsTransparent: true,
  woodIsSubstantiallyOpaque: true,
  antiAliasedEdgesAllowed: true,
  doNotRepresentBranchesAsTranslucentBrownMist: true,
  doNotFillCrownWithSemiTransparentTexture: true
});

export const BRANCH_STRUCTURE_V2_REQUIRE = Object.freeze([
  'mature dormant apple tree',
  'completely leafless',
  'clearly readable primary branch hierarchy',
  'clearly readable secondary branches',
  'restrained natural fine twigs',
  'realistic dormant apple branching',
  'opaque realistic wood where branches exist',
  'clean transparent negative space between branches',
  'crisp separation between branch edges and transparency',
  'natural bark texture',
  'natural branch taper',
  'realistic branch junctions',
  'coherent single tree architecture',
  'healthy dormant tree, not dead or damaged',
  'full specimen',
  'transparent background',
  'natural three-quarter garden perspective'
]);

export const BRANCH_STRUCTURE_V2_FORBID = Object.freeze([
  'translucent brown clouds',
  'semi-transparent branch masses',
  'ghost branches',
  'duplicated faded twigs',
  'residual foliage silhouettes',
  'brown haze',
  'fuzzy alpha around branch clusters',
  'painterly branch masses',
  'specimen-wide soft focus',
  'excessive twig density',
  'branch-like atmospheric texture',
  'fake shadow or background residue',
  'dead-tree appearance',
  'leaves',
  'green foliage',
  'buds/leaves used as filler'
]);

export const BRANCH_STRUCTURE_FOLIAGE_INHERITANCE_FORBIDDEN = Object.freeze([
  'individually legible natural foliage',
  'clear leaf and leaflet boundaries',
  'overlapping leaf clusters',
  'painterly foliage masses'
]);

export function branchStructureV2Lines() {
  return [
    'BRANCH STRUCTURE REQUIREMENTS: mature dormant apple tree; completely leafless; clearly readable primary branch hierarchy; clearly readable secondary branches; restrained natural fine twigs; realistic dormant apple branching; opaque realistic wood where branches exist; clean transparent negative space between branches; crisp separation between branch edges and transparency; natural bark texture; natural branch taper; realistic branch junctions; coherent single-tree architecture; healthy dormant tree not dead or damaged; full specimen; true transparent background; natural three-quarter garden perspective. Prefer a clean botanically plausible hierarchy over filling every crown area with tiny twigs. The tree must read clearly at native 100%.',
    'ALPHA / TRANSPARENCY CONTRACT: transparency is empty space. Where no branch exists, alpha must be fully transparent. Where wood exists, branch pixels must be substantially opaque, except normal anti-aliased edge pixels. Do not intentionally represent branches through translucent brown mist. Do not solve thin twigs by filling the crown with semi-transparent texture.',
    'COMPLEXITY CONTROL: prefer clean primary and secondary architecture over excessive internal twig density. Do not request a cloud of interior twigs.',
    'BRANCH STRUCTURE FORBIDDEN: translucent brown clouds; semi-transparent branch masses; ghost branches; duplicated faded twigs; residual foliage silhouettes; brown haze; fuzzy alpha around branch clusters; painterly branch masses; specimen-wide soft focus; excessive twig density; branch-like atmospheric texture; fake shadow or background residue; dead-tree appearance; leaves; green foliage; buds or leaves used as filler unless botanically necessary and visually minimal.',
    'STILL FORBIDDEN: HDR or crunchy sharpening; artificial edge halos; synthetic CGI microtexture; oversharpened cutout edges; studio-isolate aesthetic; baked scene shadow; baked runtime blend.',
    'Do not apply leafy foliage-detail requirements to this leafless dormant variant.'
  ];
}

function foliageContradicting(line) {
  const text = String(line || '');
  return BRANCH_STRUCTURE_FOLIAGE_INHERITANCE_FORBIDDEN.some((needle) => text.includes(needle));
}

export function familyLockLinesBranchStructureV2(job = {}) {
  return familyLockLines(job)
    .filter((line) => !foliageContradicting(line))
    .map((line) => (line === PRODUCTION_SHARPNESS_LINE ? branchStructureV2Lines().join(' ') : line));
}

export function branchStructureStateDeltaLines(job = {}) {
  return stateDeltaLines({ ...job, phenologyState: 'dormant' })
    .filter((line) => !foliageContradicting(line))
    .map((line) => {
      if (!String(line).startsWith('DORMANT:')) return line;
      return 'DORMANT: completely leafless mature apple tree. Preserve trunk identity. Clean primary / secondary hierarchy. Restrained natural fine twigs. Opaque wood where branches exist. True transparent negative space between branches. No residual foliage silhouettes, no leaves, no green filler, no brown haze, no ghost branches. Living dormant tree, not dead or damaged.';
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
    inheritFoliageDetailV2: false,
    generateNow: false,
    appliedToPaidExecute: false,
    qualityAssumedToSolveGhosting: false,
    highQualityNotSelected: true,
    alphaContract: BRANCH_STRUCTURE_ALPHA_CONTRACT,
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
    phenologyState: 'dormant',
    visualForm: job.visualForm || 'tree',
    encodesPhysicalMeters: false
  };
}

export const APPLE_BRANCH_STRUCTURE_NEXT_EXPERIMENT = Object.freeze({
  execute: false,
  generateNow: false,
  spendGate: 'DENIED',
  promotedTo: 'design-asset-branch-structure-calibration-1',
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
