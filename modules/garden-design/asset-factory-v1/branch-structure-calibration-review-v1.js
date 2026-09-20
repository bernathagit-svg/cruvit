/**
 * BRANCH_STRUCTURE calibration review harness. CONTROL vs ungenerated NEW.
 * Does not generate. Does not spend. Does not modify the historical control PNG.
 */
import fs from 'node:fs';
import path from 'node:path';

export const BRANCH_STRUCTURE_CALIBRATION_REVIEW_LIVE_REL =
  'modules/garden-design/branch-structure-calibration-1.html';

const RUN_ID = 'design-asset-branch-structure-calibration-1';
const OWNER_MARKS = [
  'DETAIL_OK',
  'BRANCH_STRUCTURE_OK',
  'BROWN_HAZE',
  'GHOST_BRANCHES',
  'ALPHA_FAILURE',
  'TOO_DENSE',
  'TOO_SPARSE',
  'DEAD_APPEARANCE',
  'OTHER'
];
const OWNER_QUESTIONS = [
  'Does this look like a clean dormant apple tree?',
  'Are main and secondary branches clearly readable?',
  'Is negative space truly transparent?',
  'Is the brown haze gone?',
  'Are there ghost branches?',
  'Does the tree look dormant rather than dead?',
  'Is medium quality sufficient for BRANCH_STRUCTURE?'
];

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function liveCutoutSrc(relFile) {
  const value = String(relFile || '').replace(/\\/g, '/');
  if (!value) return '';
  if (value.startsWith('modules/garden-design/')) return value.slice('modules/garden-design/'.length);
  return value;
}

function markButtons(arm) {
  return `<div class="marks" data-mark-group="detail" data-arm="${esc(arm)}">
    ${OWNER_MARKS.map((mark) => `<button type="button" data-mark="${esc(mark)}">${esc(mark)}</button>`).join('')}
  </div>`;
}

function inspectSlot(arm, label, src, note, historical) {
  const inner = src
    ? `<div class="inspect-frame">
        <img class="inspect-cutout" alt="${esc(label)}" src="${esc(src)}" draggable="false"/>
      </div>
      <p class="inspect-tools">
        <button type="button" data-inspect-zoom="fit">Fit</button>
        <button type="button" data-inspect-zoom="100">100%</button>
        <button type="button" data-inspect-zoom="150">150%</button>
        <button type="button" data-inspect-zoom="200">200%</button>
        filter:none. No blend.
      </p>
      ${markButtons(arm)}`
    : `<div class="ghost blocked">ASSET NOT GENERATED — ${esc(arm)} prepared only</div>
      ${markButtons(arm)}`;
  return `<div class="slot inspect-slot" data-arm="${esc(arm)}" data-review-mode="NATIVE_DETAIL">
    <p class="cap">${esc(label)}</p>
    <p class="note">${esc(note)}</p>
    <div class="inspect-scene inspect-100 checkerboard">${inner}</div>
    ${historical ? '<p class="warn-mini">HISTORICAL CONTROL — NOT APPROVED. Do not modify, re-encode, or overwrite. Brown ghosting failure.</p>' : ''}
  </div>`;
}

function controlMetrics(diag) {
  if (!diag || diag.generated === false) return '';
  return `<ul class="metrics">
    <li>fully opaque pixel %: ${esc(diag.fullyOpaquePixelPercent)}</li>
    <li>alpha 1–64 ghost: ${esc(diag.ghostAlpha1to64)}</li>
    <li>alpha 65–191 partial: ${esc(diag.partialAlpha65to191)}</li>
    <li>alpha 192–254 edge: ${esc(diag.edgeAlpha192to254)}</li>
    <li>alpha 255 opaque: ${esc(diag.opaqueAlpha255)}</li>
    <li>brown semi-transparent ratio of visible: ${esc(diag.brownSemiTransparentRatioOfVisible)}</li>
    <li>connected opaque wood: ${esc(diag.connectedBranchStructureVisibility && diag.connectedBranchStructureVisibility.label)}</li>
  </ul>`;
}

export function buildBranchStructureCalibrationReviewHtml(job, controlDiag) {
  const controlSrc = liveCutoutSrc(job.historicalControl.file);
  const candidateRel = job.candidateFile;
  const candidateExists = false;
  const questions = OWNER_QUESTIONS.map((q, i) => `<li>${i + 1}. ${esc(q)}</li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>BRANCH_STRUCTURE calibration — Apple dormant CONTROL vs NEW</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note, .inspect-tools, .metrics { font-size: 13px; color: #444; }
    .slots { display: flex; gap: 12px; flex-wrap: wrap; }
    h3 { margin: 18px 0 8px; font-size: 16px; }
    .checkerboard { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .inspect-scene { width: min(1024px, 100%); height: 720px; border: 1px solid #ccc; overflow: auto; }
    .inspect-scene.inspect-fit { width: 340px; height: 480px; }
    .inspect-cutout { width: 1024px; height: auto; filter: none !important; }
    .inspect-fit .inspect-cutout { max-width: 100%; max-height: 100%; width: auto; }
    .inspect-150 .inspect-cutout { width: 1536px; }
    .inspect-200 .inspect-cutout { width: 2048px; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .ghost { padding: 24px; background: rgba(255,255,255,.7); }
    .cap { font-size: 14px; font-weight: 600; }
    .marks { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .marks button[aria-pressed="true"] { background: #a33; color: #fff; }
    .warn-mini { background: #fde8e8; border: 1px solid #c44; padding: 6px 8px; font-size: 12px; }
    .questions { font-size: 14px; }
    button { padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body data-run-id="${esc(RUN_ID)}" data-owner-qa-storage="cruvit:branch-structure-calibration-1">
  <h1>BRANCH_STRUCTURE calibration V1 — Apple TREE MATURE DORMANT</h1>
  <p class="warn" id="prepBanner">PREP ONLY. NEW candidate is not generated. Spend gate DENIED. HIGH jobs = 0. Do not execute without explicit owner approval of this exact runId.</p>
  <p class="note">runId ${esc(RUN_ID)}. Prompt design-cutout-branch-structure-v2-experiment. Quality medium only. This is not a sharpness A/B. Native 100/150/200, filter:none, checkerboard.</p>
  <h3>NATIVE ASSET INSPECTION (primary)</h3>
  <div class="slots inspect-row">
    ${inspectSlot(
      'CONTROL',
      'CONTROL — old Detail V2 + medium',
      controlSrc,
      'design-cutout-visual-state-detail-v2 · quality=medium · brown ghosting failure · HISTORICAL CONTROL — NOT APPROVED',
      true
    )}
    ${inspectSlot(
      'NEW',
      'NEW — Branch Structure V2 + medium',
      candidateExists ? liveCutoutSrc(candidateRel) : '',
      'design-cutout-branch-structure-v2-experiment · quality=medium · not generated yet',
      false
    )}
  </div>
  <h3>CONTROL technical diagnostics</h3>
  ${controlMetrics(controlDiag)}
  <p class="note">No universal magic threshold. Owner visual review remains authoritative. Compare a future candidate against this failed control.</p>
  <h3>Owner questions</h3>
  <ol class="questions">${questions}</ol>
  <p class="note">If NEW medium is clean, readable, and alpha-ghosting is materially fixed: BRANCH_STRUCTURE → MEDIUM_POLICY_VALIDATED. Do not require HIGH. If haze/alpha failure persists: STOP, BRANCH_ALPHA_PROBLEM_PERSISTS, do not auto-run HIGH.</p>
  <script type="module" src="./asset-factory-v1/branch-structure-calibration-review-runtime.js"></script>
</body>
</html>
`;
}

export function writeBranchStructureCalibrationReview(root, job, controlDiag) {
  const html = buildBranchStructureCalibrationReviewHtml(job, controlDiag);
  const out = path.join(root, BRANCH_STRUCTURE_CALIBRATION_REVIEW_LIVE_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { reviewPath: out };
}
