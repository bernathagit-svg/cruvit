/**
 * BRANCH_STRUCTURE alpha diagnostics. Compare future candidate against failed control.
 * No generation. No spend. No universal pass threshold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePngRgba } from './technical-qa-v1.js';
import { APPLE_DORMANT_CANDIDATE, assertAppleDormantUnmodified } from './apple-dormant-root-cause-v1.js';

function brownPartialPixel(r, g, b, a) {
  return a > 0 && a < 255 && r >= g && g >= b - 8 && r >= 40 && r - b >= 15 && g < 170;
}

function countOpaqueComponents(rgba, width, height) {
  const seen = new Uint8Array(width * height);
  let components = 0;
  let largest = 0;
  const stack = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (seen[idx] || rgba[idx * 4 + 3] !== 255) continue;
      components += 1;
      let size = 0;
      stack.push(idx);
      seen[idx] = 1;
      while (stack.length) {
        const cur = stack.pop();
        size += 1;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (const n of neighbors) {
          if (n < 0 || n >= width * height || seen[n]) continue;
          const nx = n % width;
          const ny = (n - nx) / width;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          if (rgba[n * 4 + 3] !== 255) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (size > largest) largest = size;
    }
  }
  return { connectedOpaqueComponents: components, largestOpaqueComponentPx: largest };
}

export function inspectBranchStructureAlpha(rgba, width, height) {
  const total = width * height;
  let transparent0 = 0;
  let ghost1to64 = 0;
  let partial65to191 = 0;
  let edge192to254 = 0;
  let opaque255 = 0;
  let brownPartial = 0;
  let visible = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 0) {
      transparent0 += 1;
      continue;
    }
    visible += 1;
    if (a === 255) opaque255 += 1;
    else if (a <= 64) ghost1to64 += 1;
    else if (a <= 191) partial65to191 += 1;
    else edge192to254 += 1;
    if (brownPartialPixel(rgba[i], rgba[i + 1], rgba[i + 2], a)) brownPartial += 1;
  }
  const connected = countOpaqueComponents(rgba, width, height);
  return {
    width,
    height,
    totalPixels: total,
    fullyTransparent: transparent0,
    ghostAlpha1to64: ghost1to64,
    partialAlpha65to191: partial65to191,
    edgeAlpha192to254: edge192to254,
    opaqueAlpha255: opaque255,
    fullyOpaquePixelPercent: total ? +(100 * opaque255 / total).toFixed(6) : 0,
    brownSemiTransparent: brownPartial,
    brownSemiTransparentRatioOfVisible: visible ? +(brownPartial / visible).toFixed(6) : 0,
    connectedBranchStructureVisibility: {
      connectedOpaqueComponents: connected.connectedOpaqueComponents,
      largestOpaqueComponentPx: connected.largestOpaqueComponentPx,
      label: opaque255 === 0 ? 'NO_OPAQUE_WOOD' : 'OPAQUE_WOOD_PRESENT',
      universalThresholdDefined: false
    },
    universalMagicThreshold: null,
    ownerVisualReviewAuthoritative: true
  };
}

export function diagnoseBranchStructurePng(absPath) {
  const buf = fs.readFileSync(absPath);
  const decoded = decodePngRgba(buf);
  return inspectBranchStructureAlpha(decoded.rgba, decoded.width, decoded.height);
}

export function controlBranchStructureDiagnostics(root) {
  assertAppleDormantUnmodified(root);
  const abs = path.join(root, APPLE_DORMANT_CANDIDATE.file);
  return {
    arm: 'CONTROL',
    file: APPLE_DORMANT_CANDIDATE.file,
    generated: true,
    historicalControlNotApproved: true,
    ...diagnoseBranchStructurePng(abs)
  };
}

export function candidateBranchStructureDiagnostics(root, relFile) {
  const abs = path.join(root, relFile);
  if (!fs.existsSync(abs)) {
    return {
      arm: 'NEW',
      file: relFile,
      generated: false,
      note: 'Candidate not generated. Diagnostics will be computed after a future owner-approved run.'
    };
  }
  return {
    arm: 'NEW',
    file: relFile,
    generated: true,
    ...diagnoseBranchStructurePng(abs)
  };
}
