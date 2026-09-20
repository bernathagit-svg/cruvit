/**
 * Batch-2 full native-detail + state QA audit. Zero spend. No regeneration.
 * Auditor classifications are not owner visual QA except accepted Mango DETAIL_SOFT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BATCH_2_SPEND_GATE } from './visual-state-calibration-batch-2-prep-v1.js';
import { writeVisualStateCalibrationBatch2Review } from './visual-state-calibration-batch-2-review-v1.js';
import { MANGO_OWNER_DETAIL_VERDICT } from './mango-asset-detail-root-cause-v1.js';
import {
  BATCH_2_OWNER_DETAIL_STATE_STORAGE_KEY,
  NATIVE_DETAIL_MARKS,
  STATE_FAMILY_MARKS
} from './batch-2-review-marks-v1.js';

export const BATCH_2_FULL_NATIVE_DETAIL_STATE_AUDIT_VERSION = 'batch-2-full-native-detail-state-audit-v1';
export { BATCH_2_OWNER_DETAIL_STATE_STORAGE_KEY, NATIVE_DETAIL_MARKS, STATE_FAMILY_MARKS };
export const ASSET_DETAIL_CLASSES = Object.freeze(['CRISP_ENOUGH', 'BORDERLINE', 'SOFT', 'UNREVIEWED_OWNER']);

export const BATCH_DETAIL_CLASSIFICATION = 'WOODY_FOLIAGE_SOFTNESS';

export const LOCKED_MANGO_OWNER_DETAIL = Object.freeze({
  OWNER_VISUAL_QA: MANGO_OWNER_DETAIL_VERDICT.OWNER_VISUAL_QA,
  issue: MANGO_OWNER_DETAIL_VERDICT.issue,
  ASSET_DETAIL_SOFT: true,
  marks: Object.freeze(['DETAIL_SOFT']),
  overwriteForbidden: true,
  sourceCommit: '0b92c48'
});

export const AUDITOR_JOB_DETAIL = Object.freeze([
  {
    rank: 1,
    jobId: 'mango__mature__tree__vegetative__v1',
    family: 'mango',
    ASSET_DETAIL: 'SOFT',
    ownerVisualQa: 'NEEDS_IMPROVEMENT',
    ownerMarkLocked: 'DETAIL_SOFT',
    leafFoliageSeparation: 'fused painterly leaflet masses; individual mango leaflets not crisp',
    branchStemDefinition: 'trunk and primary limbs readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: true,
    haloFringe: 'green canopy silhouette glow',
    specimenWideSoftFocus: true
  },
  {
    rank: 2,
    jobId: 'mango__young__tree__vegetative__v1',
    family: 'mango',
    ASSET_DETAIL: 'SOFT',
    ownerVisualQa: 'NEEDS_IMPROVEMENT',
    ownerMarkLocked: 'DETAIL_SOFT',
    leafFoliageSeparation: 'soft leaflet clusters with glow; weaker than mature',
    branchStemDefinition: 'younger caliper and simpler branching readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: true,
    haloFringe: 'green glow around canopy',
    specimenWideSoftFocus: true
  },
  {
    rank: 3,
    jobId: 'mango__mature__tree__fruiting__v1',
    family: 'mango',
    ASSET_DETAIL: 'SOFT',
    ownerVisualQa: 'NEEDS_IMPROVEMENT',
    ownerMarkLocked: 'DETAIL_SOFT',
    leafFoliageSeparation: 'same fused canopy as mature vegetative',
    branchStemDefinition: 'trunk/limbs readable',
    flowerFruitDetail: 'mango fruits visible on peduncles; more defined than foliage',
    painterlyClumping: true,
    haloFringe: 'green canopy silhouette glow',
    specimenWideSoftFocus: true
  },
  {
    rank: 4,
    jobId: 'banana__mature__default__vegetative__v1',
    family: 'banana',
    ASSET_DETAIL: 'CRISP_ENOUGH',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'large blades separated; midribs and lateral veins readable',
    branchStemDefinition: 'pseudostems and basal sheaths readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: false,
    haloFringe: 'mild green edge glow',
    specimenWideSoftFocus: false
  },
  {
    rank: 5,
    jobId: 'banana__young__default__vegetative__v1',
    family: 'banana',
    ASSET_DETAIL: 'CRISP_ENOUGH',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'few large blades; venation crisp at native pixels',
    branchStemDefinition: 'single young pseudostem readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: false,
    haloFringe: 'slight edge glow',
    specimenWideSoftFocus: false
  },
  {
    rank: 6,
    jobId: 'apple__mature__tree__vegetative__v1',
    family: 'apple',
    ASSET_DETAIL: 'SOFT',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'small-leaf canopy fused like mango; not individually crisp',
    branchStemDefinition: 'trunk and primary scaffold readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: true,
    haloFringe: 'green canopy silhouette glow',
    specimenWideSoftFocus: true
  },
  {
    rank: 7,
    jobId: 'apple__mature__tree__dormant__v1',
    family: 'apple',
    ASSET_DETAIL: 'BORDERLINE',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'no foliage (dormant)',
    branchStemDefinition: 'twig architecture visible inside a brown filled silhouette',
    flowerFruitDetail: 'none (dormant)',
    painterlyClumping: 'brown silhouette mass rather than open leafless twigs',
    haloFringe: 'severe brown fringe/fill around entire crown',
    specimenWideSoftFocus: 'brown veil over branching'
  },
  {
    rank: 8,
    jobId: 'pomegranate__mature__tree__vegetative__v1',
    family: 'pomegranate',
    ASSET_DETAIL: 'BORDERLINE',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'perimeter lanceolate leaves more resolved than mango; interior still clumped',
    branchStemDefinition: 'single trunk and limbs readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: 'interior canopy',
    haloFringe: 'green canopy silhouette glow',
    specimenWideSoftFocus: 'partial; interior softer than edge leaves'
  },
  {
    rank: 9,
    jobId: 'pomegranate__mature__shrub__vegetative__v1',
    family: 'pomegranate',
    ASSET_DETAIL: 'BORDERLINE',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'small leaves readable at edges; interior clumped',
    branchStemDefinition: 'multi-stem from base readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: 'interior canopy',
    haloFringe: 'green silhouette glow',
    specimenWideSoftFocus: 'partial'
  },
  {
    rank: 10,
    jobId: 'lavender__mature__shrub__vegetative__v1',
    family: 'lavender',
    ASSET_DETAIL: 'BORDERLINE',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'needle/spike structure readable; not mango-level fusion',
    branchStemDefinition: 'woody basal stems readable',
    flowerFruitDetail: 'none (vegetative)',
    painterlyClumping: 'fine foliage slightly massed',
    haloFringe: 'grey-green silhouette glow',
    specimenWideSoftFocus: false
  },
  {
    rank: 11,
    jobId: 'lavender__mature__shrub__flowering__v1',
    family: 'lavender',
    ASSET_DETAIL: 'BORDERLINE',
    ownerVisualQa: 'UNREVIEWED',
    ownerMarkLocked: null,
    leafFoliageSeparation: 'foliage similar to vegetative; spikes readable',
    branchStemDefinition: 'basal stems readable',
    flowerFruitDetail: 'purple flower spikes visible; individual florets not crisp',
    painterlyClumping: 'flower mass slightly soft',
    haloFringe: 'purple/green silhouette glow',
    specimenWideSoftFocus: false
  }
]);

export const STATE_DISTINCTION_RESULTS = Object.freeze({
  mango: {
    youngVsMature: 'DISTINCTION_CLEAR',
    vegetativeVsFruiting: 'DISTINCTION_CLEAR',
    note: 'Young is simpler/open architecture. Fruiting shows hanging fruit on related mature canopy. Softness does not erase the deltas.'
  },
  banana: {
    youngVsMature: 'DISTINCTION_CLEAR',
    note: 'Young is a single-stem few-leaf plant. Mature is a multi-pseudostem clump.'
  },
  apple: {
    vegetativeVsDormant: 'DISTINCTION_CLEAR',
    note: 'Leaf-off vs leafy is obvious. Dormant brown fill is a detail/halo issue, not a missing state.'
  },
  pomegranate: {
    treeVsShrub: 'DISTINCTION_CLEAR',
    note: 'Single trunk vs multi-stem from the base. Same foliage identity.'
  },
  lavender: {
    vegetativeVsFlowering: 'DISTINCTION_CLEAR',
    note: 'Flowering adds visible purple spikes. Vegetative has no conspicuous flowers. Habit is slightly rounder when flowering.'
  }
});

export const FAMILY_CONTINUITY_RESULTS = Object.freeze({
  mango: {
    result: 'FAMILY_CONTINUITY_STRONG',
    sameBotanicalIdentity: true,
    relatedArchitecture: true,
    consistentCamera: true,
    consistentPhotographicTreatment: true,
    stateDeltaPrimary: true,
    note: 'Shared green-halo softness is not scored as identity drift.'
  },
  banana: {
    result: 'FAMILY_CONTINUITY_STRONG',
    sameBotanicalIdentity: true,
    relatedArchitecture: true,
    consistentCamera: true,
    consistentPhotographicTreatment: true,
    stateDeltaPrimary: true,
    note: 'Young/mature architecture is the primary difference.'
  },
  apple: {
    result: 'FAMILY_CONTINUITY_ACCEPTABLE',
    sameBotanicalIdentity: true,
    relatedArchitecture: true,
    consistentCamera: true,
    consistentPhotographicTreatment: false,
    stateDeltaPrimary: true,
    note: 'Identity holds. Dormant brown silhouette fill is a different photographic treatment than the leafy green halo.'
  },
  pomegranate: {
    result: 'FAMILY_CONTINUITY_STRONG',
    sameBotanicalIdentity: true,
    relatedArchitecture: true,
    consistentCamera: true,
    consistentPhotographicTreatment: true,
    stateDeltaPrimary: true,
    note: 'Tree vs shrub architecture is the intended delta.'
  },
  lavender: {
    result: 'FAMILY_CONTINUITY_ACCEPTABLE',
    sameBotanicalIdentity: true,
    relatedArchitecture: true,
    consistentCamera: true,
    consistentPhotographicTreatment: true,
    stateDeltaPrimary: true,
    note: 'Same lavender identity. Flowering habit is rounder than the upright vegetative fan; still the same plant.'
  }
});

export const PROMPT_V2_DETAIL_PROPOSAL = Object.freeze({
  applied: false,
  promptTemplateVersionProposed: 'design-cutout-visual-state-family-v2-detail',
  require: [
    'individually legible natural foliage at normal viewing scale',
    'clear leaflet/leaf boundaries',
    'realistic botanical microstructure (veins, bark, stem texture) without synthetic pores',
    'crisp photographic leaf/branch separation',
    'natural fine texture',
    'no painterly foliage masses',
    'no specimen-wide soft focus',
    'no artificial depth-of-field blur across the specimen'
  ],
  stillForbid: [
    'HDR / crunchy sharpening',
    'synthetic microtexture',
    'CGI foliage',
    'studio-isolate aesthetic',
    'baked scene shadow',
    'scene-specific lighting',
    'oversharpened cutout edges'
  ],
  replaceCurrentSharpnessLine:
    'Natural photographic outdoor sharpness and detail. Avoid hyper-detailed studio-render microtexture, plastic smoothness, and oversharpened CGI look.',
  proposedSharpnessLines: [
    'Foliage must be individually legible with clear leaflet or leaf boundaries and natural branch/leaf separation.',
    'Use realistic botanical microstructure and natural fine texture. No painterly foliage masses.',
    'No specimen-wide soft focus and no artificial depth-of-field blur across the plant.',
    'Still forbid HDR crunchy sharpening, synthetic CGI microtexture, oversharpened cutout edges, and studio-isolate appearance.'
  ]
});

export const MANGO_DETAIL_AB_EXPERIMENT = Object.freeze({
  prepared: true,
  execute: false,
  authorizedNow: false,
  spendGate: 'DENIED',
  previousApprovalCarryForward: false,
  reason: 'WOODY_FOLIAGE_SOFTNESS observed on mango/apple/pomegranate canopies; banana large-leaf herbaceous is the counterexample.',
  job: 'mango__mature__tree__vegetative__v1',
  familyPrompt: 'PROMPT_V2_DETAIL proposed, not applied',
  arms: [
    { id: 'A', quality: 'medium', prompt: 'detail-corrected prompt V2', size: '1024x1536' },
    { id: 'B', quality: 'high', prompt: 'same detail-corrected prompt V2', size: '1024x1536' }
  ],
  estimatedCalls: 2,
  estimatedRetries: 0,
  purpose: 'separate PROMPT effect from QUALITY effect',
  doNotAssignSpendApproval: true
});

const OVERLAY_REL = path.join(
  'data',
  'garden-design',
  'visual-state-calibration-batch-2',
  'batch-2-full-native-detail-state-audit-v1.json'
);

export function buildBatch2FullNativeDetailStateAudit() {
  const byFamily = {
    mango: AUDITOR_JOB_DETAIL.filter((j) => j.family === 'mango').map((j) => j.ASSET_DETAIL),
    banana: AUDITOR_JOB_DETAIL.filter((j) => j.family === 'banana').map((j) => j.ASSET_DETAIL),
    apple: AUDITOR_JOB_DETAIL.filter((j) => j.family === 'apple').map((j) => j.ASSET_DETAIL),
    pomegranate: AUDITOR_JOB_DETAIL.filter((j) => j.family === 'pomegranate').map((j) => j.ASSET_DETAIL),
    lavender: AUDITOR_JOB_DETAIL.filter((j) => j.family === 'lavender').map((j) => j.ASSET_DETAIL)
  };
  return {
    contract: BATCH_2_FULL_NATIVE_DETAIL_STATE_AUDIT_VERSION,
    verdict: 'BATCH_2_FULL_NATIVE_DETAIL_STATE_AUDIT_READY',
    ownerReviewStorageKey: BATCH_2_OWNER_DETAIL_STATE_STORAGE_KEY,
    mangoOwnerFindingPreserved: LOCKED_MANGO_OWNER_DETAIL,
    auditorOnlyNotOwnerQa: true,
    jobs: AUDITOR_JOB_DETAIL,
    familyDetail: {
      mango: { n: '3/3', classes: byFamily.mango },
      banana: { n: '2/2', classes: byFamily.banana },
      apple: { n: '2/2', classes: byFamily.apple },
      pomegranate: { n: '2/2', classes: byFamily.pomegranate },
      lavender: { n: '2/2', classes: byFamily.lavender }
    },
    batchDetailClassification: BATCH_DETAIL_CLASSIFICATION,
    batchDetailClassificationCode: 'B',
    notSystemicBecause: 'Banana large-blade herbaceous is CRISP_ENOUGH at native pixels.',
    notMangoOnlyBecause: 'Apple vegetative shows the same woody small-leaf + green-halo pattern.',
    stateDistinction: STATE_DISTINCTION_RESULTS,
    familyContinuity: FAMILY_CONTINUITY_RESULTS,
    botanicalIdentityQa: 'UNKNOWN',
    stateQa: 'UNKNOWN',
    familyConsistencyQa: 'UNKNOWN',
    productionApproved: false,
    promptV2DetailProposal: PROMPT_V2_DETAIL_PROPOSAL,
    futureAb: MANGO_DETAIL_AB_EXPERIMENT,
    generationSettingsUnchanged: {
      model: 'gpt-image-2.5-flare-2026-09-08',
      size: '1024x1536',
      quality: 'medium',
      background: 'transparent'
    },
    spendGate: BATCH_2_SPEND_GATE.state,
    openaiCalls: 0,
    imageGeneration: 0,
    retries: 0,
    additionalSpendUsd: 0,
    candidateBinariesModified: false,
    productionRegistryChanged: false
  };
}

export function writeBatch2FullNativeDetailStateAudit(root) {
  const report = buildBatch2FullNativeDetailStateAudit();
  const overlayPath = path.join(root, OVERLAY_REL);
  fs.mkdirSync(path.dirname(overlayPath), { recursive: true });
  fs.writeFileSync(overlayPath, `${JSON.stringify(report, null, 2)}\n`);
  const review = writeVisualStateCalibrationBatch2Review(root);
  return {
    overlayPath,
    htmlPath: review.htmlPath,
    batchDetailClassification: BATCH_DETAIL_CLASSIFICATION,
    mangoOwnerFindingPreserved: true,
    openaiCalls: 0,
    additionalSpendUsd: 0,
    candidateBinariesModified: false
  };
}
