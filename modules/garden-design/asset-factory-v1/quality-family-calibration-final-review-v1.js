/**
 * Quality-family final calibration review harness. Prep only. No generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_BLEND_V2 } from './in-garden-qa-v1.js';
import { groundAnchorFromBbox } from './composition-calibration-v2.js';

export const QUALITY_FAMILY_CALIBRATION_FINAL_REVIEW_LIVE_REL =
  'modules/garden-design/quality-family-calibration-final-1.html';

const MARKS = [
  'DETAIL_OK',
  'DETAIL_SOFT',
  'PAINTERLY',
  'HALO',
  'OVER_SHARP',
  'CGI_TEXTURE',
  'STATE_DETAIL_WEAK',
  'OTHER'
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
    ${MARKS.map((mark) => `<button type="button" data-mark="${esc(mark)}">${esc(mark)}</button>`).join('')}
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
    ${historical ? '<p class="warn-mini">Historical control only. Not production-approved. Do not regenerate or overwrite.</p>' : ''}
  </div>`;
}

function gardenSlot(arm, label, src, job) {
  const inner = src
    ? `<div class="placement" data-role="placement">
        <img class="cutout blend-v2" alt="${esc(label)}" src="${esc(src)}" data-approval-status="candidate"/>
        <span class="ground-shadow" aria-hidden="true"></span>
      </div>`
    : `<div class="ghost blocked">ASSET NOT GENERATED — ${esc(arm)}</div>`;
  const bbox = { exists: true, minX: 7, minY: 92, maxX: 1016, maxY: 1459 };
  const anchor = groundAnchorFromBbox(bbox, { width: 1024, height: 1536 });
  const form = job.visualForm || 'unknown';
  const arch = job.architectureMode || 'default';
  const attrs = [
    `data-visual-form="${esc(form)}"`,
    `data-architecture-mode="${esc(arch)}"`,
    `data-growth-stage="${esc(job.growthStage || 'mature')}"`,
    `data-canonical-slug="${esc(job.canonicalSlug || '')}"`,
    `data-phenology="${esc(job.phenologyState || 'vegetative')}"`,
    'data-lock-depth="middle"',
    'data-scale-model="physical-v1"',
    'data-canvas="1024,1536"',
    `data-bbox="${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}"`,
    `data-ground-anchor="${anchor.nx},${anchor.ny}"`
  ].join(' ');
  return `<div class="slot garden-slot" data-arm="${esc(arm)}" data-review-mode="IN_GARDEN">
    <p class="cap">${esc(label)}</p>
    <div class="scene real blend-v2-scene physical-v1-scene" data-role="garden-scene" ${attrs}>
      ${inner}
    </div>
    <p class="scale-note">Optional in-Garden. Native detail is the primary quality gate. Runtime owns physical scale.</p>
  </div>`;
}

function jobBlock(job) {
  const families = (job.qualityFamilies || []).join(' + ');
  const controlSrc = liveCutoutSrc(job.historicalControl && job.historicalControl.file);
  const candidateArm = job.jobId;
  const controlArm = `${job.jobId}__control`;
  const controlNote = job.historicalControl
    ? `${job.historicalControl.source} historical control. ${job.historicalControl.note || ''}`.trim()
    : 'No historical control.';
  return `<section class="job" data-job-id="${esc(job.jobId)}">
    <h2>${esc(job.rank)}. ${esc(job.canonicalSlug)} · ${esc(families)}</h2>
    <p class="note">${esc(job.purpose)}</p>
    <p class="q">Primary question: Is medium quality with Prompt V2 sufficient for production-level native asset detail for this detail family?</p>
    <h3>A–C. NATIVE ASSET INSPECTION (primary)</h3>
    <div class="slots inspect-row">
      ${
        controlSrc
          ? inspectSlot(controlArm, `HISTORICAL CONTROL — ${job.canonicalSlug}`, controlSrc, controlNote, true)
          : `<div class="slot inspect-slot"><p class="cap">No historical control</p><p class="note">Avocado is a new open/large-leaf woody sample. It does not inherit Mango HIGH.</p></div>`
      }
      ${inspectSlot(candidateArm, `V2 + MEDIUM candidate`, '', 'design-cutout-visual-state-detail-v2 · quality=medium · not generated', false)}
    </div>
    <h3>D. IN-GARDEN (optional / secondary)</h3>
    <div class="slots garden-row">
      ${controlSrc ? gardenSlot(controlArm, 'Historical control', controlSrc, job) : ''}
      ${gardenSlot(candidateArm, 'V2 + MEDIUM candidate', '', job)}
    </div>
  </section>`;
}

export function buildQualityFamilyCalibrationFinalReviewHtml(options = {}) {
  const jobs = Array.isArray(options.jobs) ? options.jobs : [];
  const v2 = RUNTIME_BLEND_V2.defaults || {};
  const blendFilter = `brightness(${v2.brightness || 0.94}) contrast(${v2.contrast || 0.92}) saturate(${v2.saturate || 0.9}) blur(${v2.blurPx || 0.4}px)`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Quality-family final calibration — 7 jobs prepared</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note, .scale-note, .inspect-tools, .q { font-size: 13px; color: #444; }
    .slots { display: flex; gap: 12px; flex-wrap: wrap; }
    h2 { margin: 28px 0 8px; font-size: 18px; }
    h3 { margin: 14px 0 8px; font-size: 14px; }
    .checkerboard { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .inspect-scene { width: min(1024px, 100%); height: 720px; border: 1px solid #ccc; overflow: auto; }
    .inspect-scene.inspect-fit { width: 340px; height: 480px; }
    .inspect-cutout { width: 1024px; height: auto; filter: none !important; }
    .inspect-fit .inspect-cutout { max-width: 100%; max-height: 100%; width: auto; }
    .inspect-150 .inspect-cutout { width: 1536px; }
    .inspect-200 .inspect-cutout { width: 2048px; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .scene.physical-v1-scene { width: 720px; height: 540px; overflow: hidden; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; }
    .scene .placement { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
    .scene.physical-v1-scene .placement img.cutout { max-width: none !important; max-height: none !important; width: auto; height: auto; }
    .scene.blend-v2-scene img.cutout { filter: ${blendFilter}; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .ground-shadow { width: 55%; height: 8px; margin-top: -4px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.32) 0%, rgba(0,0,0,0) 72%); }
    .ghost { padding: 24px; background: rgba(255,255,255,.7); }
    .cap { font-size: 14px; font-weight: 600; }
    .marks { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .marks button[aria-pressed="true"] { background: #a33; color: #fff; }
    .warn-mini { background: #fde8e8; border: 1px solid #c44; padding: 6px 8px; font-size: 12px; }
    button { padding: 6px 10px; cursor: pointer; }
    .job { border-top: 1px solid #ccc; padding-top: 8px; }
  </style>
</head>
<body data-run-id="design-asset-quality-family-calibration-final-1" data-owner-qa-storage="cruvit:quality-family-calibration-final-1">
  <h1>Quality-family final calibration — 7 jobs prepared</h1>
  <p id="realGardenBanner" class="warn">Spend gate DENIED. Preparation only. 0 of 7 generated. Native 100/150/200 is the primary gate. Previous 6-job set is superseded because it omitted WOODY_OPEN_OR_LARGE_LEAF.</p>
  <p class="note">runId design-asset-quality-family-calibration-final-1. Prompt V2 + medium only. HIGH jobs = 0. Avocado does not inherit Mango HIGH. UNKNOWN_BLOCKED 26 and the 82 calibration-required variants are not generated here.</p>
  <p class="note">After future owner review: MEDIUM_POLICY_VALIDATED / QUALITY_ESCALATION_REVIEW_REQUIRED / PROMPT_FAILURE. Do not auto-escalate to HIGH.</p>
  ${jobs.map(jobBlock).join('\n')}
  <script type="module" src="./asset-factory-v1/quality-family-calibration-final-review-runtime.js"></script>
</body>
</html>
`;
}

export function writeQualityFamilyCalibrationFinalReview(root, options = {}) {
  const htmlPath = path.join(root, QUALITY_FAMILY_CALIBRATION_FINAL_REVIEW_LIVE_REL);
  fs.writeFileSync(htmlPath, `${buildQualityFamilyCalibrationFinalReviewHtml(options)}`);
  return { htmlPath, liveRel: QUALITY_FAMILY_CALIBRATION_FINAL_REVIEW_LIVE_REL, generateOnRender: false };
}
