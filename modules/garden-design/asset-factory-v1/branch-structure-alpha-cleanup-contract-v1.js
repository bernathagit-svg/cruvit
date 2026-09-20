/**
 * BRANCH_STRUCTURE alpha cleanup contract V1.
 * Owner-selected Cleanup C (edge-preserving). Deterministic. No AI.
 * Never overwrite provider originals. Do not apply to arbitrary plant assets.
 */
import { inspectBranchStructureAlpha } from './branch-structure-alpha-diagnostics-v1.js';

export const BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1 = 'BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1';
export const SELECTED_CLEANUP = 'EDGE_PRESERVING_C';

export const BRANCH_STRUCTURE_ALPHA_CLEANUP_RULES = Object.freeze([
  'provider original remains immutable',
  'cleanup produces a DERIVED asset',
  'no AI',
  'no sharpening',
  'no background fill',
  'no invented pixels from alpha=0',
  'preserve connected branch structure',
  'preserve thin twigs where supported',
  'strengthen real wood opacity',
  'suppress unconnected brown haze',
  'preserve anti-aliased branch edges',
  'dilation <= 1px',
  'no visible halo',
  'no major branch-width distortion'
]);

export const BRANCH_STRUCTURE_ALPHA_CLEANUP_SCOPE = Object.freeze({
  requiredVariantDetailDemand: 'BRANCH_STRUCTURE',
  requiredPhenologyState: 'dormant',
  requiredVisualForm: 'tree',
  requireKnownAlphaFailurePattern: true,
  forbiddenUnlessSeparatelyValidated: Object.freeze([
    'leafy trees',
    'flowering assets',
    'fruiting assets',
    'shrubs',
    'rosettes',
    'succulents',
    'large-leaf herbaceous plants'
  ])
});

export const BRANCH_STRUCTURE_ALPHA_CLEANUP_PARAMETERS = Object.freeze({
  mode: 'C',
  dilationPasses: 1,
  dilationNeighborAlphaMin: 96,
  woodSeedHighGradAlphaMin: 12,
  woodSeedHighAlphaMin: 192,
  remap: Object.freeze({
    woodAndAlphaAtLeast128: 255,
    highGradAndAlphaAtLeast80: 255,
    highGradAndAlphaAtLeast24KeepOriginal: true,
    woodAndAlphaAtLeast40KeepOriginal: true,
    otherwise: 0
  }),
  neverInventFromFullyTransparent: true,
  sharpening: false,
  backgroundFill: false,
  ai: false
});

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isBrown(r, g, b) {
  return r >= g && g >= b - 8 && r >= 40 && r - b >= 15 && g < 170;
}

export function cleanupEligibleForVariant(input = {}) {
  const demand = input.variantDetailDemand;
  const phenology = String(input.phenologyState || '').toLowerCase();
  const form = String(input.visualForm || '').toLowerCase();
  const architecture = String(input.architectureMode || '').toLowerCase();
  if (demand !== 'BRANCH_STRUCTURE') return false;
  if (phenology !== 'dormant') return false;
  if (form !== 'tree') return false;
  if (architecture === 'shrub') return false;
  return true;
}

export function detectBranchAlphaFailurePattern(diag = {}) {
  if (!diag || diag.generated === false) {
    return { present: false, reason: 'no_diagnostics' };
  }
  const opaque = Number(diag.opaqueAlpha255 || 0);
  const brown = Number(diag.brownSemiTransparentRatioOfVisible || 0);
  const ghost = Number(diag.ghostAlpha1to64 || 0);
  const connected = diag.connectedBranchStructureVisibility?.label;
  const present =
    opaque === 0 && brown >= 0.5 && ghost >= 10000 && connected === 'NO_OPAQUE_WOOD';
  return {
    present,
    opaqueAlpha255: opaque,
    brownSemiTransparentRatioOfVisible: brown,
    ghostAlpha1to64: ghost,
    connectedLabel: connected || null,
    reason: present ? 'known_semi_transparent_branch_haze_pattern' : 'pattern_not_present'
  };
}

function buildStructure(rgba, width, height) {
  let maxG = 0;
  const grad = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const ix1 = (y * width + x + 1) * 4;
      const ix0 = (y * width + x - 1) * 4;
      const iy1 = ((y + 1) * width + x) * 4;
      const iy0 = ((y - 1) * width + x) * 4;
      const gx = luma(rgba[ix1], rgba[ix1 + 1], rgba[ix1 + 2]) - luma(rgba[ix0], rgba[ix0 + 1], rgba[ix0 + 2]);
      const gy = luma(rgba[iy1], rgba[iy1 + 1], rgba[iy1 + 2]) - luma(rgba[iy0], rgba[iy0 + 1], rgba[iy0 + 2]);
      const g = Math.hypot(gx, gy);
      grad[y * width + x] = g;
      if (g > maxG) maxG = g;
    }
  }
  const gThr = Math.max(18, maxG * 0.12);
  const highGrad = new Uint8Array(width * height);
  const wood = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3];
      if (a === 0) continue;
      const idx = y * width + x;
      const g = grad[idx];
      if (g >= gThr && a >= 12) highGrad[idx] = 1;
      if ((g >= gThr && a >= 12) || a >= 192) wood[idx] = 1;
    }
  }
  const next = new Uint8Array(wood);
  for (let pass = 0; pass < 1; pass++) {
    next.fill(0);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (wood[idx]) {
          next[idx] = 1;
          continue;
        }
        const a = rgba[idx * 4 + 3];
        if (a < 96) continue;
        const n4 = [idx - 1, idx + 1, idx - width, idx + width];
        let near = false;
        for (const n of n4) if (wood[n]) near = true;
        if (!near) continue;
        next[idx] = 1;
      }
    }
    wood.set(next);
  }
  return { highGrad, wood, gThr };
}

export function applyBranchStructureAlphaCleanupC(rgba, width, height) {
  const structure = buildStructure(rgba, width, height);
  const out = Buffer.from(rgba);
  const { highGrad, wood } = structure;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const i = idx * 4;
      const a = rgba[i + 3];
      if (a === 0) {
        out[i + 3] = 0;
        continue;
      }
      const hg = highGrad[idx] === 1;
      const wd = wood[idx] === 1;
      let na = a;
      if (wd && a >= 128) na = 255;
      else if (hg && a >= 24) na = a >= 80 ? 255 : a;
      else if (wd && a >= 40) na = a;
      else na = 0;
      out[i + 3] = na;
    }
  }
  return { rgba: out, structure, contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1 };
}

export function evaluateCleanupCSafety(original, cleaned, width, height, structure) {
  const before = inspectBranchStructureAlpha(original, width, height);
  const after = inspectBranchStructureAlpha(cleaned, width, height);
  let origTwig = 0;
  let keptTwig = 0;
  let inventedFromZero = 0;
  const { highGrad } = structure;
  for (let i = 0, p = 0; i < original.length; i += 4, p += 1) {
    const oa = original[i + 3];
    const na = cleaned[i + 3];
    if (highGrad[p] && oa >= 16 && oa <= 160) {
      origTwig += 1;
      if (na >= 16) keptTwig += 1;
    }
    if (oa === 0 && na > 0) inventedFromZero += 1;
  }
  const twigRetention = origTwig ? keptTwig / origTwig : 0;
  const failed =
    after.opaqueAlpha255 === 0 ||
    inventedFromZero > 0 ||
    twigRetention < 0.4 ||
    after.connectedBranchStructureVisibility.label === 'NO_OPAQUE_WOOD';
  return {
    before,
    after,
    thinTwigRetentionEstimate: +twigRetention.toFixed(4),
    inventedFromTransparent: inventedFromZero,
    edgeHaloIntroduced: inventedFromZero > 0 ? 'YES' : 'NO',
    status: failed ? 'BRANCH_ALPHA_CLEANUP_FAILED' : 'BRANCH_ALPHA_CLEANUP_OK',
    acceptProviderOriginal: false
  };
}

export function runBranchStructureAlphaCleanupC(input = {}) {
  if (!cleanupEligibleForVariant(input)) {
    return { status: 'BRANCH_ALPHA_CLEANUP_NOT_IN_SCOPE', derived: false };
  }
  const pattern = detectBranchAlphaFailurePattern(input.diagnostics);
  if (!pattern.present) {
    return { status: 'BRANCH_ALPHA_FAILURE_PATTERN_ABSENT', derived: false, pattern };
  }
  const applied = applyBranchStructureAlphaCleanupC(input.rgba, input.width, input.height);
  const safety = evaluateCleanupCSafety(
    input.rgba,
    applied.rgba,
    input.width,
    input.height,
    applied.structure
  );
  if (safety.status === 'BRANCH_ALPHA_CLEANUP_FAILED') {
    return {
      status: 'BRANCH_ALPHA_CLEANUP_FAILED',
      derived: false,
      pattern,
      safety,
      acceptProviderOriginal: false
    };
  }
  return {
    status: 'BRANCH_ALPHA_CLEANUP_OK',
    derived: true,
    contract: BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1,
    selectedCleanup: SELECTED_CLEANUP,
    pattern,
    safety,
    rgba: applied.rgba,
    aiTransformation: false
  };
}
