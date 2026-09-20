/**
 * Woody foliage detail A/B review harness. Control is existing Batch-2 PNG.
 * Does not generate. Does not spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_BLEND_V2 } from './in-garden-qa-v1.js';
import { groundAnchorFromBbox } from './composition-calibration-v2.js';

export const WOODY_FOLIAGE_DETAIL_AB_REVIEW_LIVE_REL =
  'modules/garden-design/woody-foliage-detail-ab-1.html';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const CONTROL_FILE =
  'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/mango__mature__tree__vegetative__v1.png';
const OWNER_DETAIL_MARKS = [
  'DETAIL_OK',
  'DETAIL_SOFT',
  'PAINTERLY',
  'HALO',
  'OVER_SHARP',
  'CGI_TEXTURE',
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

function markButtons(arm, lockedSoft) {
  return `<div class="marks" data-mark-group="detail" data-arm="${esc(arm)}">
    ${OWNER_DETAIL_MARKS.map((mark) => {
      const lock = lockedSoft && mark === 'DETAIL_SOFT';
      const blockOk = lockedSoft && mark === 'DETAIL_OK';
      return `<button type="button" data-mark="${esc(mark)}"${lock ? ' data-locked="true" aria-pressed="true"' : ''}${blockOk ? ' data-blocked="true"' : ''}>${esc(mark)}</button>`;
    }).join('')}
  </div>`;
}

function inspectSlot(arm, label, src, note, lockedSoft) {
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
      ${markButtons(arm, lockedSoft)}`
    : `<div class="ghost blocked">ASSET NOT GENERATED — ${esc(arm)} prepared only</div>
      ${markButtons(arm, false)}`;
  return `<div class="slot inspect-slot" data-arm="${esc(arm)}" data-review-mode="NATIVE_DETAIL">
    <p class="cap">${esc(label)}</p>
    <p class="note">${esc(note)}</p>
    <div class="inspect-scene inspect-100 checkerboard">${inner}</div>
    ${lockedSoft ? '<p class="warn-mini">CONTROL locked: DETAIL_SOFT / ASSET_DETAIL_SOFT. Do not regenerate.</p>' : ''}
  </div>`;
}

function gardenSlot(arm, label, src, metrics) {
  const inner = src
    ? `<div class="placement" data-role="placement">
        <img class="cutout blend-v2" alt="${esc(label)}" src="${esc(src)}" data-approval-status="candidate"/>
        <span class="ground-shadow" aria-hidden="true"></span>
      </div>`
    : `<div class="ghost blocked">ASSET NOT GENERATED — ${esc(arm)}</div>`;
  const bbox = metrics && metrics.bbox && metrics.bbox.exists !== false
    ? metrics.bbox
    : { exists: true, minX: 7, minY: 92, maxX: 1016, maxY: 1459 };
  const width = Number(metrics && metrics.width) || 1024;
  const height = Number(metrics && metrics.height) || 1536;
  const anchor = groundAnchorFromBbox(
    { exists: true, minX: bbox.minX, minY: bbox.minY, maxX: bbox.maxX, maxY: bbox.maxY },
    { width, height }
  );
  const attrs = [
    'data-visual-form="tree"',
    'data-architecture-mode="tree"',
    'data-growth-stage="mature"',
    'data-canonical-slug="mango"',
    'data-phenology="vegetative"',
    'data-lock-depth="middle"',
    'data-scale-model="physical-v1"',
    `data-canvas="${width},${height}"`,
    `data-bbox="${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}"`,
    `data-ground-anchor="${anchor.nx},${anchor.ny}"`,
    'data-size-scenario="NATURAL_MATURE"',
    'data-lock-range-band="LOW"',
    'data-lock-scale-mode="ESTIMATED"'
  ].join(' ');
  return `<div class="slot garden-slot" data-arm="${esc(arm)}" data-review-mode="IN_GARDEN">
    <p class="cap">${esc(label)}</p>
    <div class="scene real blend-v2-scene physical-v1-scene" data-role="garden-scene" ${attrs}>
      ${inner}
    </div>
    <p class="scale-note">Production Tree Physical Scale V1 · Mango LOW · secondary to native detail</p>
  </div>`;
}

const GENERATED_A_FILE =
  'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__medium.png';
const GENERATED_B_FILE =
  'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__high.png';
const RESULTS_REL = path.join('data', 'garden-design', 'woody-foliage-detail-ab-1', 'results.json');

function existingRel(root, rel) {
  if (!rel) return '';
  const abs = path.join(root, rel);
  return fs.existsSync(abs) ? String(rel).replace(/\\/g, '/') : '';
}

function metricsFromResults(root, arm) {
  const resultsPath = path.join(root, RESULTS_REL);
  if (!fs.existsSync(resultsPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    const row = Array.isArray(parsed.jobs) ? parsed.jobs.find((j) => j && j.arm === arm) : null;
    return row && row.technicalQa && row.technicalQa.metrics ? row.technicalQa.metrics : null;
  } catch {
    return null;
  }
}

export function buildWoodyFoliageDetailAbReviewHtml(options = {}) {
  const root = options.root || path.resolve(HERE, '..', '..', '..');
  const aFile = options.aFile || existingRel(root, GENERATED_A_FILE);
  const bFile = options.bFile || existingRel(root, GENERATED_B_FILE);
  const controlSrc = liveCutoutSrc(CONTROL_FILE);
  const aSrc = liveCutoutSrc(aFile);
  const bSrc = liveCutoutSrc(bFile);
  const aMetrics = options.aMetrics || metricsFromResults(root, 'A');
  const bMetrics = options.bMetrics || metricsFromResults(root, 'B');
  const generatedCount = [aSrc, bSrc].filter(Boolean).length;
  const v2 = RUNTIME_BLEND_V2.defaults || {};
  const blendFilter = `brightness(${v2.brightness || 0.94}) contrast(${v2.contrast || 0.92}) saturate(${v2.saturate || 0.9}) blur(${v2.blurPx || 0.4}px)`;
  const banner = generatedCount
    ? `Candidates only. CONTROL unchanged. ${generatedCount}/2 A/B generated. Native detail is the primary gate. Spend gate DENIED after this run.`
    : 'Spend gate DENIED. CONTROL is the existing Batch-2 PNG. A and B are prepared, not generated. Native detail is the primary gate. In-Garden is secondary.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Woody foliage detail A/B — CONTROL / A / B</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note, .scale-note, .inspect-tools { font-size: 13px; color: #444; }
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
    .scene.physical-v1-scene { width: 720px; height: 540px; overflow: hidden; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; }
    .scene .placement { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
    .scene.physical-v1-scene .placement img.cutout { max-width: none !important; max-height: none !important; width: auto; height: auto; }
    .scene.blend-v2-scene img.cutout { filter: ${blendFilter}; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .ground-shadow { width: 55%; height: 8px; margin-top: -4px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.32) 0%, rgba(0,0,0,0) 72%); }
    .ghost { padding: 24px; background: rgba(255,255,255,.7); }
    .cap { font-size: 14px; font-weight: 600; }
    .marks { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .marks button[aria-pressed="true"], .marks button[data-locked="true"] { background: #a33; color: #fff; }
    .marks button[data-blocked="true"] { opacity: .45; }
    .warn-mini { background: #fde8e8; border: 1px solid #c44; padding: 6px 8px; font-size: 12px; }
    .questions { font-size: 14px; }
    button { padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body data-run-id="design-asset-woody-foliage-detail-ab-1" data-owner-qa-storage="cruvit:woody-foliage-detail-ab-1">
  <h1>Woody foliage detail A/B — mango TREE MATURE VEGETATIVE</h1>
  <p id="realGardenBanner" class="${generatedCount ? 'ok' : 'warn'}">${esc(banner)}</p>
  <p class="note">runId design-asset-woody-foliage-detail-ab-1. Production factory prompt unchanged. Quality globally remains medium. No Batch-2 approval carry-forward.</p>
  <h3>A. NATIVE ASSET INSPECTION (primary)</h3>
  <div class="slots inspect-row">
    ${inspectSlot('CONTROL', 'CONTROL — old prompt / medium', controlSrc, 'design-cutout-visual-state-family-v1 · quality=medium · ASSET_DETAIL_SOFT', true)}
    ${inspectSlot('A', 'A — detail prompt V2 / medium', aSrc, aSrc ? 'experimental V2 · quality=medium · CALIBRATION_CANDIDATE' : 'experimental V2 · quality=medium · not generated', false)}
    ${inspectSlot('B', 'B — detail prompt V2 / high', bSrc, bSrc ? 'same V2 prompt as A · quality=high · CALIBRATION_CANDIDATE' : 'same V2 prompt as A · quality=high · not generated', false)}
  </div>
  <h3>B. IN-GARDEN COMPARISON (secondary)</h3>
  <p class="note">Production Tree Physical Scale V1 · Mango LOW. Blend V2 garden-only. Do not judge native leaf detail here.</p>
  <div class="slots garden-row">
    ${gardenSlot('CONTROL', 'CONTROL', controlSrc)}
    ${gardenSlot('A', 'A', aSrc, aMetrics)}
    ${gardenSlot('B', 'B', bSrc, bMetrics)}
  </div>
  <ol class="questions">
    <li>Q1. Does A materially improve detail over CONTROL? If YES, prompt correction has value.</li>
    <li>Q2. Does B materially improve detail over A? If YES, HIGH quality adds meaningful value.</li>
  </ol>
  <script type="module" src="./asset-factory-v1/woody-foliage-detail-ab-review-runtime.js"></script>
</body>
</html>
`;
}

export function writeWoodyFoliageDetailAbReview(root, options = {}) {
  const htmlPath = path.join(root, WOODY_FOLIAGE_DETAIL_AB_REVIEW_LIVE_REL);
  fs.writeFileSync(htmlPath, `${buildWoodyFoliageDetailAbReviewHtml({ ...options, root })}`);
  return { htmlPath, liveRel: WOODY_FOLIAGE_DETAIL_AB_REVIEW_LIVE_REL, generateOnRender: false };
}

