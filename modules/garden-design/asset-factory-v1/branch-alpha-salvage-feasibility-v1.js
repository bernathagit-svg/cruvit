/**
 * Zero-spend BRANCH_STRUCTURE alpha salvage feasibility. Does not regenerate.
 * Does not overwrite original Apple dormant PNGs. Does not write production registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodePngRgba } from './technical-qa-v1.js';
import { encodePngRgba } from './png-rgba-encode-v1.js';
import { inspectBranchStructureAlpha } from './branch-structure-alpha-diagnostics-v1.js';
import { APPLE_DORMANT_CANDIDATE, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';
import { BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE } from './branch-structure-calibration-prep-v1.js';
import { writeBranchAlphaSalvageReview } from './branch-alpha-salvage-review-v1.js';

export const BRANCH_ALPHA_SALVAGE_VERSION = 'branch-alpha-salvage-feasibility-v1';
export const BRANCH_ALPHA_SALVAGE_RUN_ID = 'design-asset-branch-alpha-salvage-1';

export const NEW_APPLE_DORMANT_CANDIDATE = Object.freeze({
  jobId: 'apple__mature__tree__dormant__branch-structure-v2__medium',
  file: 'modules/garden-design/assets/plants/branch-structure-calibration-1/apple__mature__tree__dormant__branch-structure-v2__medium.png',
  bytes: 2094269,
  sha256: '24f4d0ccc56675d3ec009cfc85173217d51c508507af2a25e81241516c21c53d',
  pixelDimensions: '1024x1536'
});

const CONTROL_REL = APPLE_DORMANT_CANDIDATE.file;
const NEW_REL = NEW_APPLE_DORMANT_CANDIDATE.file;
const DIAG_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'branch-alpha-salvage-feasibility-1'
);
const OVERLAY_REL = path.join('data', 'garden-design', 'branch-alpha-salvage-feasibility-v1');
const REGISTRY_REL = path.join(
  'modules',
  'garden-design',
  'assets',
  'plants',
  'design-asset-registry-v1.json'
);

export const RGB_STRUCTURE_RESULTS = Object.freeze([
  'RGB_STRUCTURE_CLEAN_ALPHA_BAD',
  'RGB_STRUCTURE_AND_ALPHA_BAD',
  'RGB_STRUCTURE_PARTIAL',
  'ROOT_CAUSE_UNRESOLVED'
]);

export const SALVAGE_VERDICTS = Object.freeze([
  'ALPHA_SALVAGE_PROMISING',
  'ALPHA_SALVAGE_NOT_SAFE',
  'RGB_TOO_BAD_FOR_ALPHA_SALVAGE'
]);

function sha256File(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isBrown(r, g, b) {
  return r >= g && g >= b - 8 && r >= 40 && r - b >= 15 && g < 170;
}

export function assertSalvageOriginalsUnmodified(root) {
  assertAppleDormantUnmodified(root);
  const abs = path.join(root, NEW_REL);
  const buf = fs.readFileSync(abs);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== NEW_APPLE_DORMANT_CANDIDATE.bytes || sha !== NEW_APPLE_DORMANT_CANDIDATE.sha256) {
    const err = new Error('NEW Apple dormant candidate was modified');
    err.code = 'NEW_CANDIDATE_MODIFIED';
    throw err;
  }
}

export function auditRgbIndependentOfAlpha(rgba, width, height) {
  const bins = {
    alpha0: 0,
    alpha1to24: 0,
    alpha25to64: 0,
    alpha65to127: 0,
    alpha128to191: 0,
    alpha192to254: 0,
    alpha255: 0
  };
  const acc = {
    a0: { n: 0, r: 0, g: 0, b: 0, l: 0 },
    vis: { n: 0, r: 0, g: 0, b: 0, l: 0 },
    highA: { n: 0, r: 0, g: 0, b: 0, l: 0 },
    lowA: { n: 0, r: 0, g: 0, b: 0, l: 0 },
    highGrad: { n: 0, r: 0, g: 0, b: 0, l: 0 },
    lowGradVis: { n: 0, r: 0, g: 0, b: 0, l: 0 }
  };
  const add = (k, r, g, b, L) => {
    k.n += 1;
    k.r += r;
    k.g += g;
    k.b += b;
    k.l += L;
  };
  const mean = (k) =>
    k.n
      ? {
          n: k.n,
          r: +(k.r / k.n).toFixed(1),
          g: +(k.g / k.n).toFixed(1),
          b: +(k.b / k.n).toFixed(1),
          luma: +(k.l / k.n).toFixed(1)
        }
      : { n: 0, r: 0, g: 0, b: 0, luma: 0 };

  const grad = new Float32Array(width * height);
  let maxG = 0;
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
  let brownVis = 0;
  let brownLowGrad = 0;
  let darkHighGrad = 0;
  let interiorHighA = 0;
  let twigCandidate = 0;
  let hazeCandidate = 0;
  let bgResidue = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      const L = luma(r, g, b);
      const gv = grad[y * width + x];
      if (a === 0) {
        bins.alpha0 += 1;
        add(acc.a0, r, g, b, L);
        if (L > 40) bgResidue += 1;
        continue;
      }
      if (a <= 24) bins.alpha1to24 += 1;
      else if (a <= 64) bins.alpha25to64 += 1;
      else if (a <= 127) bins.alpha65to127 += 1;
      else if (a <= 191) bins.alpha128to191 += 1;
      else if (a <= 254) bins.alpha192to254 += 1;
      else bins.alpha255 += 1;
      add(acc.vis, r, g, b, L);
      if (isBrown(r, g, b)) brownVis += 1;
      if (a <= 64) add(acc.lowA, r, g, b, L);
      if (a >= 192) {
        add(acc.highA, r, g, b, L);
        if (gv < gThr) interiorHighA += 1;
      }
      if (gv >= gThr) {
        add(acc.highGrad, r, g, b, L);
        if (L < 90) darkHighGrad += 1;
        if (a >= 16 && a <= 160) twigCandidate += 1;
      } else {
        add(acc.lowGradVis, r, g, b, L);
        if (isBrown(r, g, b)) brownLowGrad += 1;
        if (a >= 1 && a <= 160 && isBrown(r, g, b)) hazeCandidate += 1;
      }
    }
  }
  const vis = acc.vis.n || 1;
  return {
    width,
    height,
    alphaHistogram: bins,
    rgbMeansIgnoringAlphaWeight: {
      transparentPixels: mean(acc.a0),
      visiblePixels: mean(acc.vis),
      highAlpha192to255: mean(acc.highA),
      ghostAlpha1to64: mean(acc.lowA),
      highRgbGradient: mean(acc.highGrad),
      lowRgbGradientVisible: mean(acc.lowGradVis)
    },
    maxRgbGradient: +maxG.toFixed(2),
    rgbGradientThreshold: +gThr.toFixed(2),
    brownVisibleRatio: +(brownVis / vis).toFixed(6),
    brownLowGradientShareOfVisible: +(brownLowGrad / vis).toFixed(6),
    highGradientShareOfVisible: +(acc.highGrad.n / vis).toFixed(6),
    darkHighGradientPx: darkHighGrad,
    interiorHighAlphaPx: interiorHighA,
    twigCandidatePx: twigCandidate,
    hazeCandidatePx: hazeCandidate,
    backgroundResidueNonDarkTransparentPx: bgResidue,
    colorSeparationHighGradVsHaze: +(
      Math.hypot(
        (acc.highGrad.n ? acc.highGrad.r / acc.highGrad.n : 0) -
          (acc.lowGradVis.n ? acc.lowGradVis.r / acc.lowGradVis.n : 0),
        (acc.highGrad.n ? acc.highGrad.g / acc.highGrad.n : 0) -
          (acc.lowGradVis.n ? acc.lowGradVis.g / acc.lowGradVis.n : 0),
        (acc.highGrad.n ? acc.highGrad.b / acc.highGrad.n : 0) -
          (acc.lowGradVis.n ? acc.lowGradVis.b / acc.lowGradVis.n : 0)
      )
    ).toFixed(2)
  };
}

export function classifyRgbStructure(audit) {
  const structurePresent = audit.highGradientShareOfVisible >= 0.1 && audit.twigCandidatePx >= 8000;
  const hazeInRgb = audit.brownLowGradientShareOfVisible >= 0.5;
  const weakColorSep = audit.colorSeparationHighGradVsHaze < 28;
  if (structurePresent && hazeInRgb) return 'RGB_STRUCTURE_PARTIAL';
  if (structurePresent && !hazeInRgb) return 'RGB_STRUCTURE_CLEAN_ALPHA_BAD';
  if (!structurePresent && (hazeInRgb || weakColorSep)) return 'RGB_STRUCTURE_AND_ALPHA_BAD';
  return 'ROOT_CAUSE_UNRESOLVED';
}

export function compositeOverBackground(rgba, width, height, sampleBg) {
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      const bg = sampleBg(x, y);
      out[i] = Math.round(rgba[i] * a + bg[0] * (1 - a));
      out[i + 1] = Math.round(rgba[i + 1] * a + bg[1] * (1 - a));
      out[i + 2] = Math.round(rgba[i + 2] * a + bg[2] * (1 - a));
      out[i + 3] = 255;
    }
  }
  return out;
}

export function rgbWithoutAlpha(rgba) {
  const out = Buffer.from(rgba);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return out;
}

function checkerBg(x, y) {
  const on = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
  return on ? [232, 232, 232] : [176, 176, 176];
}

function buildStructure(rgba, width, height, audit) {
  const gThr = audit.rgbGradientThreshold;
  const highGrad = new Uint8Array(width * height);
  const wood = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3];
      if (a === 0) continue;
      const ix1 = (y * width + x + 1) * 4;
      const ix0 = (y * width + x - 1) * 4;
      const iy1 = ((y + 1) * width + x) * 4;
      const iy0 = ((y - 1) * width + x) * 4;
      const gx = luma(rgba[ix1], rgba[ix1 + 1], rgba[ix1 + 2]) - luma(rgba[ix0], rgba[ix0 + 1], rgba[ix0 + 2]);
      const gy = luma(rgba[iy1], rgba[iy1 + 1], rgba[iy1 + 2]) - luma(rgba[iy0], rgba[iy0 + 1], rgba[iy0 + 2]);
      const g = Math.hypot(gx, gy);
      const idx = y * width + x;
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
        const i = idx * 4;
        const a = rgba[i + 3];
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

function remapAlpha(rgba, width, height, structure, mode) {
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
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const brown = isBrown(r, g, b);
      let na = a;
      if (mode === 'A') {
        if (hg) na = a >= 64 ? 255 : a;
        else if (a >= 192) na = 255;
        else if (!wd && a <= 64 && brown) na = 0;
        else if (!wd && a <= 96 && brown) na = 0;
      } else if (mode === 'B') {
        if (hg && a >= 16) na = a >= 48 ? 255 : a;
        else if (a >= 200) na = 255;
        else na = 0;
      } else if (mode === 'C') {
        if (wd && a >= 128) na = 255;
        else if (hg && a >= 24) na = a >= 80 ? 255 : a;
        else if (wd && a >= 40) na = a;
        else na = 0;
      }
      out[i + 3] = na;
    }
  }
  return out;
}

function countMask(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n += 1;
  return n;
}

export function evaluateCleanup(original, cleaned, width, height, structure) {
  const orig = inspectBranchStructureAlpha(original, width, height);
  const next = inspectBranchStructureAlpha(cleaned, width, height);
  let origTwig = 0;
  let keptTwig = 0;
  let origHaze = 0;
  let keptHaze = 0;
  let origWood = 0;
  let newWood = 0;
  let inventedWood = 0;
  let lostWood = 0;
  let inventedFromZero = 0;
  const { highGrad } = structure;
  for (let i = 0, p = 0; i < original.length; i += 4, p += 1) {
    const oa = original[i + 3];
    const na = cleaned[i + 3];
    const brown = isBrown(original[i], original[i + 1], original[i + 2]);
    if (highGrad[p] && oa >= 16 && oa <= 160) {
      origTwig += 1;
      if (na >= 16) keptTwig += 1;
    }
    if (!highGrad[p] && oa >= 1 && oa <= 160 && brown) {
      origHaze += 1;
      if (na >= 16) keptHaze += 1;
    }
    if (oa >= 192) origWood += 1;
    if (na >= 192) {
      newWood += 1;
      if (oa < 96) inventedWood += 1;
    }
    if (oa >= 192 && na < 96) lostWood += 1;
    if (oa === 0 && na > 0) inventedFromZero += 1;
  }
  const twigRetention = origTwig ? +(keptTwig / origTwig).toFixed(4) : 0;
  const hazeReduction = origHaze ? +(1 - keptHaze / origHaze).toFixed(4) : 0;
  const thickenRatio = origWood ? +(inventedWood / origWood).toFixed(4) : 0;
  const keepWoodRatio = origWood ? +(newWood / origWood).toFixed(4) : 0;
  let widthLabel = 'STABLE';
  if (thickenRatio > 0.15) widthLabel = 'THICKENED';
  else if (keepWoodRatio < 0.7) widthLabel = 'THINNED';
  return {
    before: orig,
    after: next,
    opaquePixelPercent: next.fullyOpaquePixelPercent,
    ghostAlpha1to64: next.ghostAlpha1to64,
    partialAlpha65to191: next.partialAlpha65to191,
    edgeAlpha192to254: next.edgeAlpha192to254,
    opaqueAlpha255: next.opaqueAlpha255,
    connectedBranchComponentRetention: next.connectedBranchStructureVisibility,
    thinTwigRetentionEstimate: twigRetention,
    hazeReduction,
    branchWidthDistortion: widthLabel,
    thickenRatio,
    keepWoodRatio,
    lostWoodPx: lostWood,
    inventedFromTransparent: inventedFromZero,
    edgeHaloIntroduced: inventedFromZero > 0 ? 'YES' : 'NO'
  };
}

function decideVerdict(rgbResult, experiments) {
  if (rgbResult === 'RGB_STRUCTURE_AND_ALPHA_BAD' || rgbResult === 'ROOT_CAUSE_UNRESOLVED') {
    return 'RGB_TOO_BAD_FOR_ALPHA_SALVAGE';
  }
  const promising = experiments.some((exp) => {
    const connected = exp.metrics.connectedBranchComponentRetention.label === 'OPAQUE_WOOD_PRESENT';
    return (
      exp.metrics.opaqueAlpha255 >= 20000 &&
      connected &&
      exp.metrics.hazeReduction >= 0.75 &&
      exp.metrics.thinTwigRetentionEstimate >= 0.55 &&
      exp.metrics.branchWidthDistortion !== 'THICKENED' &&
      exp.metrics.edgeHaloIntroduced === 'NO' &&
      exp.metrics.after.brownSemiTransparentRatioOfVisible <= 0.45
    );
  });
  if (promising) return 'ALPHA_SALVAGE_PROMISING';
  return 'ALPHA_SALVAGE_NOT_SAFE';
}

function writePng(abs, rgba, width, height) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, encodePngRgba(rgba, width, height));
}

function relPosix(...parts) {
  return path.join(...parts).replace(/\\/g, '/');
}

export function executeBranchAlphaSalvageFeasibility() {
  return {
    executed: false,
    openaiCalls: 0,
    imageGeneration: 0,
    highExecuted: false,
    additionalSpendUsd: 0,
    spendGate: 'DENIED',
    productionRegistryChanged: false,
    originalsModified: false,
    reason: 'FEASIBILITY_AUDIT_ONLY_ZERO_SPEND'
  };
}

export function writeBranchAlphaSalvageReports(root) {
  assertSalvageOriginalsUnmodified(root);
  const registryBefore = sha256File(path.join(root, REGISTRY_REL));
  const controlBefore = sha256File(path.join(root, CONTROL_REL));
  const newBefore = sha256File(path.join(root, NEW_REL));

  const controlBuf = fs.readFileSync(path.join(root, CONTROL_REL));
  const newBuf = fs.readFileSync(path.join(root, NEW_REL));
  const controlDec = decodePngRgba(controlBuf);
  const newDec = decodePngRgba(newBuf);

  const controlAudit = auditRgbIndependentOfAlpha(controlDec.rgba, controlDec.width, controlDec.height);
  const newAudit = auditRgbIndependentOfAlpha(newDec.rgba, newDec.width, newDec.height);
  const rgbResult = classifyRgbStructure(newAudit);
  const controlRgbResult = classifyRgbStructure(controlAudit);
  const controlAlpha = inspectBranchStructureAlpha(controlDec.rgba, controlDec.width, controlDec.height);
  const newAlpha = inspectBranchStructureAlpha(newDec.rgba, newDec.width, newDec.height);

  const diagnostics = {};
  const arms = [
    ['control', controlDec],
    ['new', newDec]
  ];
  for (const [name, dec] of arms) {
    const rgb = rgbWithoutAlpha(dec.rgba);
    const white = compositeOverBackground(dec.rgba, dec.width, dec.height, () => [255, 255, 255]);
    const black = compositeOverBackground(dec.rgba, dec.width, dec.height, () => [0, 0, 0]);
    const gray = compositeOverBackground(dec.rgba, dec.width, dec.height, () => [128, 128, 128]);
    const checker = compositeOverBackground(dec.rgba, dec.width, dec.height, checkerBg);
    const files = {
      rgbNoAlpha: relPosix(DIAG_REL, `${name}__rgb-no-alpha.png`),
      overWhite: relPosix(DIAG_REL, `${name}__over-white.png`),
      overBlack: relPosix(DIAG_REL, `${name}__over-black.png`),
      overGray: relPosix(DIAG_REL, `${name}__over-gray.png`),
      overChecker: relPosix(DIAG_REL, `${name}__over-checker.png`)
    };
    writePng(path.join(root, files.rgbNoAlpha), rgb, dec.width, dec.height);
    writePng(path.join(root, files.overWhite), white, dec.width, dec.height);
    writePng(path.join(root, files.overBlack), black, dec.width, dec.height);
    writePng(path.join(root, files.overGray), gray, dec.width, dec.height);
    writePng(path.join(root, files.overChecker), checker, dec.width, dec.height);
    diagnostics[name] = files;
  }

  const experiments = [];
  let cleanupJustified = rgbResult === 'RGB_STRUCTURE_CLEAN_ALPHA_BAD' || rgbResult === 'RGB_STRUCTURE_PARTIAL';
  if (cleanupJustified) {
    const structure = buildStructure(newDec.rgba, newDec.width, newDec.height, newAudit);
    for (const mode of ['A', 'B', 'C']) {
      const cleaned = remapAlpha(newDec.rgba, newDec.width, newDec.height, structure, mode);
      const file = relPosix(DIAG_REL, `new-cleanup-${mode.toLowerCase()}.png`);
      writePng(path.join(root, file), cleaned, newDec.width, newDec.height);
      const metrics = evaluateCleanup(newDec.rgba, cleaned, newDec.width, newDec.height, structure);
      experiments.push({
        id: mode,
        label:
          mode === 'A'
            ? 'conservative alpha remap'
            : mode === 'B'
              ? 'stronger alpha remap'
              : 'haze suppression + edge-preserving alpha remap',
        file,
        metrics
      });
    }
  }

  const salvageVerdict = decideVerdict(rgbResult, experiments);
  const proposedContract =
    salvageVerdict === 'ALPHA_SALVAGE_PROMISING'
      ? {
          productionizeNow: false,
          name: 'BRANCH_STRUCTURE_ALPHA_CLEANUP_CONTRACT_V1',
          rules: [
            'Never overwrite the provider original PNG.',
            'Operate only on a derived calibration/preview variant.',
            'Do not use a global alpha < X delete.',
            'Keep RGB-gradient branch edges and already-high-alpha interiors.',
            'Do not invent pixels from fully transparent samples.',
            'Do not dilate structure more than 1px.',
            'No sharpening, no background fill, no AI matting.',
            'Owner visual review required before any production use.'
          ]
        }
      : {
          productionizeNow: false,
          name: null,
          rules: [],
          note: 'No generic cleanup contract is productionized. Stop for architecture/generation-strategy review. Do not auto-run HIGH.'
        };

  const spend = executeBranchAlphaSalvageFeasibility();
  const summary = {
    contract: BRANCH_ALPHA_SALVAGE_VERSION,
    runId: BRANCH_ALPHA_SALVAGE_RUN_ID,
    rgbStructureResult: rgbResult,
    controlRgbStructureResult: controlRgbResult,
    salvageVerdict,
    ownerVisualReviewAuthoritative: true,
    originals: {
      CONTROL: { file: CONTROL_REL, sha256: controlBefore, unmodified: true },
      NEW: { file: NEW_REL, sha256: newBefore, unmodified: true }
    },
    alphaFailureAnalysis: {
      CONTROL: controlAlpha,
      NEW: newAlpha,
      note: 'Provider output itself contains the failure. Fully opaque wood is absent in both originals.'
    },
    rgbAudits: { CONTROL: controlAudit, NEW: newAudit },
    solidBackgroundDiagnostics: diagnostics,
    cleanupJustified,
    experiments,
    proposedCleanupContract: proposedContract,
    productionImpact: {
      originalPngsModified: false,
      productionRegistryChanged: false,
      promptV2PolicyChanged: false,
      qualityPolicyChanged: false,
      massGenerationPlanChanged: false
    },
    spendGate: {
      state: 'DENIED',
      branchStructureGateUnchanged: BRANCH_STRUCTURE_CALIBRATION_SPEND_GATE.state === 'DENIED',
      openaiCalls: 0,
      imageGeneration: 0,
      highExecuted: false,
      additionalSpendUsd: 0
    },
    execute: spend
  };

  const overlayDir = path.join(root, OVERLAY_REL);
  fs.mkdirSync(overlayDir, { recursive: true });
  fs.writeFileSync(path.join(overlayDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(
    path.join(overlayDir, 'spend-gate.json'),
    `${JSON.stringify({ contract: BRANCH_ALPHA_SALVAGE_VERSION, gate: summary.spendGate, execute: spend }, null, 2)}\n`
  );
  writeBranchAlphaSalvageReview(root, summary);

  assertSalvageOriginalsUnmodified(root);
  const registryAfter = sha256File(path.join(root, REGISTRY_REL));
  if (registryAfter !== registryBefore) {
    const err = new Error('production registry changed during salvage audit');
    err.code = 'REGISTRY_CHANGED';
    throw err;
  }
  if (sha256File(path.join(root, CONTROL_REL)) !== controlBefore || sha256File(path.join(root, NEW_REL)) !== newBefore) {
    const err = new Error('original PNG modified during salvage audit');
    err.code = 'ORIGINAL_PNG_MODIFIED';
    throw err;
  }

  return {
    verdict: 'BRANCH_ALPHA_SALVAGE_FEASIBILITY_V1_READY',
    rgbStructureResult: rgbResult,
    salvageVerdict,
    overlayDir: OVERLAY_REL.replace(/\\/g, '/'),
    reviewHash: '#design-asset-branch-alpha-salvage-1'
  };
}
