/**
 * Zero-spend Apple dormant native PNG audit.
 * Does not regenerate, call OpenAI, resize, or modify the candidate.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodePngRgba, inspectTechnicalQa } from './technical-qa-v1.js';
import { PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2 } from './prompt-factory-visual-state-detail-v2.js';
import { QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE } from './quality-family-calibration-final-prep-v1.js';

export const APPLE_DORMANT_ROOT_CAUSE_VERSION = 'apple-dormant-root-cause-v1';

export const APPLE_DORMANT_CANDIDATE = Object.freeze({
  jobId: 'apple__mature__tree__dormant__detail-v2__medium',
  file: 'modules/garden-design/assets/plants/quality-family-calibration-final-1/apple__mature__tree__dormant__detail-v2__medium.png',
  bytes: 2194091,
  sha256: 'b36346dd502ff13826e32dba640a34a59ebef8913f3ade974bfb283db5a429e5',
  pixelDimensions: '1024x1536',
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  quality: 'medium'
});

export const APPLE_DORMANT_OWNER_RESULT = Object.freeze({
  DETAIL_QA: 'NOT_ACCEPTABLE',
  issues: Object.freeze(['HALO', 'DETAIL_SOFT', 'OTHER']),
  other: 'semi-transparent branch ghosting / brown haze',
  familyResult: 'QUALITY_POLICY_NOT_VALIDATED',
  automaticHighEscalation: false,
  ASSET_PRODUCTION_APPROVAL: 'NO'
});

function brownPartialPixel(r, g, b, a) {
  return a > 0 && a < 255 && r >= g && g >= b - 8 && r >= 40 && r - b >= 15 && g < 170;
}

export function inspectAppleDormantPixels(rgba, width, height) {
  const total = width * height;
  let fullyTransparent = 0;
  let ghost = 0;
  let haze = 0;
  let softEdge = 0;
  let fullyOpaque = 0;
  let brownPartial = 0;
  let brownHaze = 0;
  let greenPartial = 0;
  let whitePartial = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a === 0) {
      fullyTransparent += 1;
      continue;
    }
    if (a === 255) {
      fullyOpaque += 1;
      continue;
    }
    if (a <= 64) ghost += 1;
    else if (a <= 192) haze += 1;
    else softEdge += 1;
    if (brownPartialPixel(r, g, b, a)) {
      brownPartial += 1;
      if (a > 24 && a <= 192) brownHaze += 1;
    }
    if (g > r + 8 && g > b) greenPartial += 1;
    if ((r + g + b) / 3 > 230) whitePartial += 1;
  }
  const partial = total - fullyTransparent - fullyOpaque;
  return {
    width,
    height,
    totalPixels: total,
    fullyTransparent,
    ghostAlpha1to64: ghost,
    hazeAlpha65to192: haze,
    softEdgeAlpha193to254: softEdge,
    fullyOpaque,
    partial,
    brownPartial,
    brownHaze,
    greenPartial,
    whitePartial,
    brownShareOfPartial: partial ? +(brownPartial / partial).toFixed(6) : 0,
    fullyOpaqueCount: fullyOpaque,
    specimenHasNoFullyOpaqueWood: fullyOpaque === 0
  };
}

export function classifyAppleDormantRootCause(pixelStats, promptAudit) {
  const providerGhosting = pixelStats.brownShareOfPartial >= 0.5 || pixelStats.specimenHasNoFullyOpaqueWood;
  const alphaFailure = pixelStats.specimenHasNoFullyOpaqueWood || pixelStats.ghostAlpha1to64 > pixelStats.fullyOpaque;
  const promptOvercomplex = promptAudit.foliageDetailRequirementsAppliedToDormant === true;
  const reviewRender = false;
  let rootCause = 'ROOT_CAUSE_UNRESOLVED';
  if (providerGhosting && promptOvercomplex) rootCause = 'MIXED';
  else if (providerGhosting && alphaFailure) rootCause = 'MIXED';
  else if (providerGhosting) rootCause = 'PROVIDER_BRANCH_GHOSTING';
  else if (promptOvercomplex) rootCause = 'PROMPT_OVERCOMPLEX_BRANCH_STRUCTURE';
  else if (alphaFailure) rootCause = 'ALPHA_FINE_STRUCTURE_FAILURE';
  else if (reviewRender) rootCause = 'REVIEW_RENDER_ARTIFACT';
  return {
    rootCause,
    REVIEW_RENDER_ARTIFACT: false,
    PROVIDER_BRANCH_GHOSTING: providerGhosting,
    ALPHA_FINE_STRUCTURE_FAILURE: alphaFailure,
    PROMPT_OVERCOMPLEX_BRANCH_STRUCTURE: promptOvercomplex,
    HIGH_WOULD_NOT_AUTOMATICALLY_SOLVE: true,
    note: 'Brown canopy fill and zero fully-opaque wood exist in the provider PNG. Technical QA halo metric only counts near-white partials, so it can PASS while brown ghosting remains. Inspection uses filter:none; this is not a review-CSS artifact.'
  };
}

export const APPLE_DORMANT_PROMPT_AUDIT = Object.freeze({
  promptTemplateVersion: PROMPT_TEMPLATE_VERSION_VISUAL_STATE_DETAIL_V2,
  dormantDeltaPresent: true,
  dormantDeltaText:
    'DORMANT: preserve branch/trunk identity and architecture. Remove foliage only where biologically appropriate for deciduous leaf-off. Do not create a dead, snapped, diseased, or damaged plant.',
  foliageDetailRequirementsAppliedToDormant: true,
  foliageDetailStillRequests:
    'individually legible natural foliage; clear leaf and leaflet boundaries; overlapping leaf clusters',
  missingNegativeSpaceRule: true,
  missingOpaqueWoodRule: true,
  missingRestrainedTwigDensityRule: true,
  tooManyFineInteriorTwigsLikely: true
});

export function assertAppleDormantUnmodified(root) {
  const abs = path.join(root, APPLE_DORMANT_CANDIDATE.file);
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== APPLE_DORMANT_CANDIDATE.bytes || sha !== APPLE_DORMANT_CANDIDATE.sha256) {
    const err = new Error('APPLE_DORMANT_CANDIDATE_BINARY_CHANGED');
    err.code = 'APPLE_DORMANT_CANDIDATE_BINARY_CHANGED';
    throw err;
  }
  return { candidateBinariesModified: false, sha256: sha, bytes: buf.length };
}

export function auditAppleDormantRootCause(root) {
  const unmodified = assertAppleDormantUnmodified(root);
  const abs = path.join(root, APPLE_DORMANT_CANDIDATE.file);
  const buf = fs.readFileSync(abs);
  const decoded = decodePngRgba(buf);
  const technical = inspectTechnicalQa(buf);
  const pixels = inspectAppleDormantPixels(decoded.rgba, decoded.width, decoded.height);
  const classified = classifyAppleDormantRootCause(pixels, APPLE_DORMANT_PROMPT_AUDIT);
  return {
    contract: APPLE_DORMANT_ROOT_CAUSE_VERSION,
    candidate: APPLE_DORMANT_CANDIDATE,
    owner: APPLE_DORMANT_OWNER_RESULT,
    unmodified,
    providerFingerprintChunkRetained: buf.includes(Buffer.from('caBX')),
    technicalQa: {
      result: technical.result,
      haloPartialPixels: technical.metrics?.haloPartialPixels || 0,
      note: 'PASS is not a brown-ghosting pass. Halo counter is near-white only.'
    },
    pixels,
    promptAudit: APPLE_DORMANT_PROMPT_AUDIT,
    classification: classified,
    rootCause: classified.rootCause,
    regenerateNow: false,
    escalateToHighNow: false,
    openaiCalls: 0,
    imageGeneration: 0,
    additionalSpendUsd: 0,
    spendGate: QUALITY_FAMILY_CALIBRATION_FINAL_SPEND_GATE.state
  };
}
