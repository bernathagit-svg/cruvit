/**
 * Owned Garden Design Asset Promotion Gate V1.
 * Reuse already-paid Mango / Banana / Pineapple candidates.
 * Zero spend. No generation. No production registry write.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  writeOwnedGardenPromotionReview
} from './owned-garden-design-asset-promotion-review-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..', '..', '..');

export const OWNED_GARDEN_PROMOTION_RUN_ID = 'owned-garden-design-asset-promotion-v1';
export const OWNED_GARDEN_PROMOTION_CONTRACT = 'OWNED_GARDEN_DESIGN_ASSET_PROMOTION_GATE_V1';
export const OWNED_GARDEN_PROMOTION_REVIEW_HASH = '#owned-garden-design-asset-promotion-v1';
export const OWNED_GARDEN_PROMOTION_CACHE_BUST = '20260920h';

export const OWNED_GARDEN_PROMOTION_SPEND_GATE = Object.freeze({
  state: 'DENIED',
  execute: false,
  generateNow: false,
  openaiCalls: 0,
  imageGeneration: 0,
  paidSourcing: 0,
  additionalSpendUsd: 0,
  productionRegistryWrite: false,
  autoApprove: false,
  massGeneration: false,
  note: 'Reuse already-paid candidates. No new OpenAI calls. APPROVE records owner intent only.'
});

export const OWNER_PROMOTION_CHOICES = Object.freeze([
  'APPROVE_FOR_PRODUCTION_REGISTRY',
  'NEEDS_REGENERATION',
  'REJECT_IDENTITY',
  'NEEDS_ARCHITECTURE_FIX'
]);

export const PROMOTION_QA_AXES = Object.freeze([
  'TECHNICAL_QA',
  'BOTANICAL_IDENTITY_QA',
  'ARCHITECTURE_QA',
  'GROWTH_STAGE_QA',
  'PHENOLOGY_STATE_QA',
  'IN_GARDEN_QA',
  'OWNER_VISUAL_QA'
]);

export const EXCLUDED_FROM_THIS_GATE = Object.freeze([
  'apple',
  'lavender',
  'avocado',
  'aloe-vera',
  'pomegranate'
]);

const REGISTRY_REL = 'modules/garden-design/assets/plants/design-asset-registry-v1.json';
const OVERLAY_REL = path.join('data', 'garden-design', 'owned-garden-design-asset-promotion-v1');

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function loadJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function jobFromResults(root, rel, matcher) {
  const parsed = loadJson(path.join(root, rel));
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  const found = jobs.find(matcher);
  if (!found) throw new Error(`owned-garden-promotion: missing job in ${rel}`);
  return found;
}

export const MANGO_PROMOTION_CANDIDATE = Object.freeze({
  canonicalSlug: 'mango',
  scientific: 'Mangifera indica',
  architectureMode: 'tree',
  visualForm: 'tree',
  growthStage: 'mature',
  phenologyState: 'vegetative',
  variantKey: 'mature__tree__vegetative',
  runId: 'design-asset-woody-foliage-detail-ab-1',
  arm: 'B',
  candidateLabel: 'B',
  promptTemplateVersion: 'design-cutout-woody-foliage-detail-v2-experiment',
  prompt: 'Detail V2',
  quality: 'high',
  jobId: 'mango__mature__tree__vegetative__detail-v2__high',
  file: 'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__high.png',
  scaleNote: 'Production Tree Physical Scale V1 · Mango authority · this Garden LOW preference. No fit-to-frame.',
  lockRangeBand: 'LOW',
  selectionReason: 'Owner reviewed A medium = acceptable, B high = preferred. Dense woody foliage is the validated selective-HIGH case.',
  excludedAlternates: [
    'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__medium.png',
    'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__vegetative__v1.png'
  ]
});

export const BANANA_PROMOTION_CANDIDATE = Object.freeze({
  canonicalSlug: 'banana',
  scientific: 'Musa spp.',
  architectureMode: 'default',
  visualForm: 'herbaceous-clump',
  growthStage: 'mature',
  phenologyState: 'vegetative',
  variantKey: 'mature__default__vegetative',
  runId: 'design-asset-visual-state-calibration-batch-2',
  arm: null,
  candidateLabel: 'BATCH_2_MATURE_VEGETATIVE',
  promptTemplateVersion: 'design-cutout-visual-state-family-v1',
  prompt: 'Visual State Family V1',
  quality: 'medium',
  jobId: 'banana__mature__default__vegetative__v1',
  file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/banana__mature__default__vegetative__v1.png',
  scaleNote: 'Herbaceous-clump runtime scale. Not tree physical-scale rules. No fit-to-frame.',
  lockRangeBand: null,
  selectionReason: 'Best already-paid mature-vegetative Banana. Do not use the later FRUITING V2 candidate as the production baseline.',
  excludedAlternates: [
    'modules/garden-design/assets/plants/quality-family-calibration-final-1/banana__mature__default__fruiting__detail-v2__medium.png',
    'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/banana__young__default__vegetative__v1.png',
    'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1/banana-mature-vegetative-v1.png'
  ]
});

export const PINEAPPLE_PROMOTION_CANDIDATE = Object.freeze({
  canonicalSlug: 'pineapple',
  scientific: 'Ananas comosus',
  architectureMode: 'default',
  visualForm: 'rosette',
  growthStage: 'mature',
  phenologyState: 'vegetative',
  variantKey: 'mature__default__vegetative',
  runId: 'design-asset-quality-family-calibration-final-1',
  arm: null,
  candidateLabel: 'QUALITY_FAMILY_V2_MEDIUM',
  promptTemplateVersion: 'design-cutout-visual-state-detail-v2',
  prompt: 'Detail V2',
  quality: 'medium',
  jobId: 'pineapple__mature__default__vegetative__detail-v2__medium',
  file: 'modules/garden-design/assets/plants/quality-family-calibration-final-1/pineapple__mature__default__vegetative__detail-v2__medium.png',
  scaleNote: 'Rosette runtime scale. Not tree physical-scale rules. No fit-to-frame.',
  lockRangeBand: null,
  selectionReason: 'Quality Family Final Calibration Prompt V2 + MEDIUM. Owner judged native detail DETAIL_OK. Do not use historical fruiting/control as the mature-vegetative baseline.',
  excludedAlternates: [
    'modules/garden-design/assets/plants/batch-1-candidates/pineapple-mature-rosette-vegetative-v1.png',
    'modules/garden-design/assets/plants/batch-1-candidates/calibration-batch-1/pineapple-mature-vegetative-v1.png'
  ]
});

export const PROMOTION_CANDIDATES = Object.freeze([
  MANGO_PROMOTION_CANDIDATE,
  BANANA_PROMOTION_CANDIDATE,
  PINEAPPLE_PROMOTION_CANDIDATE
]);

export const NEXT_PRIORITY_WAVE_CONCEPT = Object.freeze({
  execute: false,
  generateNow: false,
  spendAuthorized: false,
  arbitraryBatchCount: false,
  broad240Plan: false,
  afterOwnedHarvest: true,
  tiers: Object.freeze([
    {
      rank: 1,
      name: 'owned-plants',
      note: 'Remaining required variants of currently owned plants after this mature-vegetative harvest. Reuse already-paid candidates first.'
    },
    {
      rank: 2,
      name: 'frequently-recommended',
      note: 'High-frequency recommended plants still missing a production Design Asset.'
    },
    {
      rank: 3,
      name: 'garden-design-surfaced',
      note: 'Plants the Garden Design surface already presents without an approved asset.'
    },
    {
      rank: 4,
      name: 'launch-critical',
      note: 'Launch-critical morphology/state gaps not already covered by owned plants.'
    },
    {
      rank: 5,
      name: 'remainder',
      note: 'Catalog remainder only after owned, recommended, surfaced, and launch-critical coverage.'
    }
  ]),
  ownedRemainingIfBaselinesPass: Object.freeze([
    { canonicalSlug: 'mango', variant: 'young__tree__vegetative', reuseFirst: 'batch-2 mango young; currently QUALITY_CALIBRATION_REQUIRED' },
    { canonicalSlug: 'mango', variant: 'mature__tree__fruiting', reuseFirst: 'batch-2 mango fruiting candidate' },
    { canonicalSlug: 'banana', variant: 'young__default__vegetative', reuseFirst: 'batch-2 banana young candidate' },
    { canonicalSlug: 'banana', variant: 'mature__default__fruiting', reuseFirst: 'quality-family banana fruiting V2+medium; not this baseline' },
    { canonicalSlug: 'pineapple', variant: 'mature__default__fruiting', reuseFirst: 'no V2 fruiting candidate selected in this gate' }
  ])
});

function ownerReviewRequiredQa(extra = {}) {
  return {
    TECHNICAL_QA: extra.TECHNICAL_QA || 'PASS',
    BOTANICAL_IDENTITY_QA: extra.BOTANICAL_IDENTITY_QA || 'OWNER_REVIEW_REQUIRED',
    ARCHITECTURE_QA: 'OWNER_REVIEW_REQUIRED',
    GROWTH_STAGE_QA: 'OWNER_REVIEW_REQUIRED',
    PHENOLOGY_STATE_QA: 'OWNER_REVIEW_REQUIRED',
    IN_GARDEN_QA: 'OWNER_REVIEW_REQUIRED',
    OWNER_VISUAL_QA: 'PENDING',
    DETAIL_HISTORY: extra.DETAIL_HISTORY || null,
    PROMOTION_READY: false,
    ASSET_PRODUCTION_APPROVAL: 'NO',
    notes: extra.notes || []
  };
}

export function selectOwnedGardenPromotionCandidates(root = DEFAULT_ROOT) {
  const mangoJob = jobFromResults(
    root,
    path.join('data', 'garden-design', 'woody-foliage-detail-ab-1', 'results.json'),
    (job) => job && job.arm === 'B' && job.jobId === MANGO_PROMOTION_CANDIDATE.jobId
  );
  const bananaJob = jobFromResults(
    root,
    path.join('data', 'garden-design', 'visual-state-calibration-batch-2', 'results.json'),
    (job) => job && job.jobId === BANANA_PROMOTION_CANDIDATE.jobId && job.phenologyState === 'vegetative'
  );
  const pineappleJob = jobFromResults(
    root,
    path.join('data', 'garden-design', 'quality-family-calibration-final-1', 'results.json'),
    (job) => job && job.jobId === PINEAPPLE_PROMOTION_CANDIDATE.jobId && job.phenologyState === 'vegetative'
  );
  if (bananaJob.phenologyState === 'fruiting') {
    throw new Error('owned-garden-promotion: refused banana fruiting candidate as baseline');
  }
  const rows = [
    { spec: MANGO_PROMOTION_CANDIDATE, job: mangoJob },
    { spec: BANANA_PROMOTION_CANDIDATE, job: bananaJob },
    { spec: PINEAPPLE_PROMOTION_CANDIDATE, job: pineappleJob }
  ].map(({ spec, job }) => {
    const abs = path.join(root, spec.file);
    if (!fs.existsSync(abs)) throw new Error(`owned-garden-promotion: missing candidate PNG ${spec.file}`);
    return {
      ...spec,
      bytes: fs.statSync(abs).size,
      sha256: sha256File(abs),
      technicalQa: job.technicalQa || null,
      TECHNICAL_QA: job.TECHNICAL_QA || (job.technicalQa && job.technicalQa.result) || 'UNKNOWN',
      identityPrecision: job.identityPrecision || null,
      metrics: job.technicalQa && job.technicalQa.metrics ? job.technicalQa.metrics : null,
      outputStatus: 'CALIBRATION_CANDIDATE',
      approvalStatus: 'candidate',
      autoApproved: false,
      approvalEligible: false
    };
  });
  return rows;
}

export function evaluateOwnedGardenPromotionQa(candidates) {
  const bySlug = Object.fromEntries((candidates || []).map((row) => [row.canonicalSlug, row]));
  return {
    mango: ownerReviewRequiredQa({
      TECHNICAL_QA: bySlug.mango && bySlug.mango.TECHNICAL_QA,
      DETAIL_HISTORY: 'Owner A/B: A medium ACCEPTABLE, B high PREFERRED. DETAIL family only. Not asset approval.',
      notes: [
        'Do not infer APPROVE_FOR_PRODUCTION_REGISTRY from earlier detail-quality reviews.',
        'Selective HIGH is already validated for this morphology. Do not regenerate Mango in this gate.'
      ]
    }),
    banana: ownerReviewRequiredQa({
      TECHNICAL_QA: bySlug.banana && bySlug.banana.TECHNICAL_QA,
      BOTANICAL_IDENTITY_QA: 'OWNER_REVIEW_REQUIRED',
      DETAIL_HISTORY: 'Batch-2 vegetative CRISP_ENOUGH at family-v1 medium. Not Detail V2. Not the later fruiting candidate.',
      notes: [
        'identityPrecision=GENUS_BLOCKED. Catalog identity blockers: GENUS_OR_BROAD_IDENTITY, IDENTITY_NEEDS_REVIEW.',
        'Fruiting V2+medium exists but is the wrong phenology for this production baseline.',
        'DETAIL_OK / CRISP_ENOUGH is not botanical identity or architecture approval.'
      ]
    }),
    pineapple: ownerReviewRequiredQa({
      TECHNICAL_QA: bySlug.pineapple && bySlug.pineapple.TECHNICAL_QA,
      DETAIL_HISTORY: 'Quality-family final owner judged native DETAIL_OK for ROSETTE V2+medium. Not asset approval.',
      notes: [
        'Do not use historical pineapple fruiting/control as the mature-vegetative baseline.',
        'BOTANICAL_IDENTITY_QA and IN_GARDEN_QA remain owner gates.'
      ]
    })
  };
}

export function ownedGardenCoverageIfAllLaterPass() {
  return {
    current: {
      olive: 'approved baseline already exists',
      mango: 'candidate selected — not production-approved',
      banana: 'candidate selected — not production-approved',
      pineapple: 'candidate selected — not production-approved',
      productionApprovedOwnedBaselines: 1
    },
    ifAllThreeLaterPass: {
      olive: 'approved baseline unchanged',
      mango: 'mature TREE VEGETATIVE would become a production Design Asset',
      banana: 'mature herbaceous-clump VEGETATIVE would become a production Design Asset',
      pineapple: 'mature ROSETTE VEGETATIVE would become a production Design Asset',
      productionApprovedOwnedBaselines: 4,
      note: 'Coverage count is a later-pass proposal only. This task does not write the registry.'
    }
  };
}

export function executeOwnedGardenDesignAssetPromotionV1() {
  return {
    openaiCalls: 0,
    imageGeneration: 0,
    paidSourcing: 0,
    additionalSpendUsd: 0,
    spendGate: OWNED_GARDEN_PROMOTION_SPEND_GATE.state,
    productionRegistryChanged: false,
    assetsAutoApproved: 0,
    massGenerationStarted: false,
    plantsInGate: PROMOTION_CANDIDATES.map((row) => row.canonicalSlug)
  };
}

export function writeOwnedGardenPromotionReports(root = DEFAULT_ROOT) {
  const overlayDir = path.join(root, OVERLAY_REL);
  fs.mkdirSync(overlayDir, { recursive: true });
  const registryAbs = path.join(root, REGISTRY_REL);
  const registryShaBefore = sha256File(registryAbs);
  const candidates = selectOwnedGardenPromotionCandidates(root);
  const qa = evaluateOwnedGardenPromotionQa(candidates);
  const spend = executeOwnedGardenDesignAssetPromotionV1();
  const coverage = ownedGardenCoverageIfAllLaterPass();
  const review = writeOwnedGardenPromotionReview(root, { candidates, qa });
  const stamp = new Date().toISOString();
  const ownerDecision = {
    contract: OWNED_GARDEN_PROMOTION_CONTRACT,
    runId: OWNED_GARDEN_PROMOTION_RUN_ID,
    pending: true,
    mango: null,
    banana: null,
    pineapple: null,
    note: 'APPROVE_FOR_PRODUCTION_REGISTRY records owner intent only. Registry write is a separate owner-controlled gate.'
  };
  const summary = {
    contract: OWNED_GARDEN_PROMOTION_CONTRACT,
    verdict: 'OWNED_GARDEN_DESIGN_ASSET_PROMOTION_V1_READY',
    runId: OWNED_GARDEN_PROMOTION_RUN_ID,
    generatedAt: stamp,
    plantsInGate: candidates.map((row) => row.canonicalSlug),
    excludedFromThisGate: EXCLUDED_FROM_THIS_GATE,
    oliveUnchanged: true,
    candidates,
    qa,
    ownerDecision,
    coverage,
    nextPriorityWaveConcept: NEXT_PRIORITY_WAVE_CONCEPT,
    spend,
    productionRegistryChanged: false,
    productionRegistrySha256: registryShaBefore,
    liveReviewHash: OWNED_GARDEN_PROMOTION_REVIEW_HASH,
    reviewHtml: review.liveRel,
    promotionWriteStatus: 'NO_REGISTRY_WRITE'
  };
  const files = {
    summary: path.join(overlayDir, 'summary.json'),
    selectedCandidates: path.join(overlayDir, 'selected-candidates.json'),
    qaStatus: path.join(overlayDir, 'qa-status.json'),
    ownerDecision: path.join(overlayDir, 'owner-decision.json'),
    spendGate: path.join(overlayDir, 'spend-gate.json'),
    coverage: path.join(overlayDir, 'coverage.json'),
    nextPriorityWave: path.join(overlayDir, 'next-priority-wave-concept.json'),
    promotionProposal: path.join(overlayDir, 'promotion-proposal.json')
  };
  fs.writeFileSync(files.summary, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(files.selectedCandidates, `${JSON.stringify({ candidates }, null, 2)}\n`);
  fs.writeFileSync(files.qaStatus, `${JSON.stringify(qa, null, 2)}\n`);
  fs.writeFileSync(files.ownerDecision, `${JSON.stringify(ownerDecision, null, 2)}\n`);
  fs.writeFileSync(files.spendGate, `${JSON.stringify(OWNED_GARDEN_PROMOTION_SPEND_GATE, null, 2)}\n`);
  fs.writeFileSync(files.coverage, `${JSON.stringify(coverage, null, 2)}\n`);
  fs.writeFileSync(files.nextPriorityWave, `${JSON.stringify(NEXT_PRIORITY_WAVE_CONCEPT, null, 2)}\n`);
  fs.writeFileSync(
    files.promotionProposal,
    `${JSON.stringify(
      {
        contract: OWNED_GARDEN_PROMOTION_CONTRACT,
        writeRegistry: false,
        writeSupabase: false,
        writeR2: false,
        writeProductionCatalog: false,
        autoApproved: 0,
        candidates: candidates.map((row) => ({
          canonicalSlug: row.canonicalSlug,
          jobId: row.jobId,
          file: row.file,
          sha256: row.sha256,
          PROMOTION_READY: false,
          ownerIntent: null
        }))
      },
      null,
      2
    )}\n`
  );
  const registryShaAfter = sha256File(registryAbs);
  if (registryShaAfter !== registryShaBefore) {
    throw new Error('owned-garden-promotion: production registry mutated');
  }
  return {
    overlayDir,
    reviewHtml: review.htmlPath,
    liveRel: review.liveRel,
    liveReviewHash: OWNED_GARDEN_PROMOTION_REVIEW_HASH,
    registrySha256: registryShaAfter,
    plants: candidates.map((row) => row.canonicalSlug),
    openaiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0
  };
}
