/**
 * Owned Garden production-asset review harness.
 * Exactly Mango, Banana, Pineapple. No generation. No registry write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RUNTIME_BLEND_V2 } from './in-garden-qa-v1.js';
import { groundAnchorFromBbox } from './composition-calibration-v2.js';

export const OWNED_GARDEN_PROMOTION_REVIEW_CACHE_BUST = '20260920h';
const RUN_ID = 'owned-garden-design-asset-promotion-v1';
const OWNER_PROMOTION_CHOICES = [
  'APPROVE_FOR_PRODUCTION_REGISTRY',
  'NEEDS_REGENERATION',
  'REJECT_IDENTITY',
  'NEEDS_ARCHITECTURE_FIX'
];
const FALLBACK = {
  mango: {
    canonicalSlug: 'mango',
    visualForm: 'tree',
    architectureMode: 'tree',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    runId: 'design-asset-woody-foliage-detail-ab-1',
    prompt: 'Detail V2',
    quality: 'high',
    jobId: 'mango__mature__tree__vegetative__detail-v2__high',
    file: 'modules/garden-design/assets/plants/woody-foliage-detail-ab-1/mango__mature__tree__vegetative__detail-v2__high.png',
    scaleNote: 'Production Tree Physical Scale V1 · Mango authority · this Garden LOW preference. No fit-to-frame.',
    lockRangeBand: 'LOW',
    selectionReason: 'Owner reviewed A medium = acceptable, B high = preferred. Dense woody foliage is the validated selective-HIGH case.'
  },
  banana: {
    canonicalSlug: 'banana',
    visualForm: 'herbaceous-clump',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    runId: 'design-asset-visual-state-calibration-batch-2',
    prompt: 'Visual State Family V1',
    quality: 'medium',
    jobId: 'banana__mature__default__vegetative__v1',
    file: 'modules/garden-design/assets/plants/batch-2-candidates/visual-state-calibration-batch-2/banana__mature__default__vegetative__v1.png',
    scaleNote: 'Herbaceous-clump runtime scale. Not tree physical-scale rules. No fit-to-frame.',
    lockRangeBand: null,
    selectionReason: 'Best already-paid mature-vegetative Banana. Do not use the later FRUITING V2 candidate as the production baseline.'
  },
  pineapple: {
    canonicalSlug: 'pineapple',
    visualForm: 'rosette',
    architectureMode: 'default',
    growthStage: 'mature',
    phenologyState: 'vegetative',
    runId: 'design-asset-quality-family-calibration-final-1',
    prompt: 'Detail V2',
    quality: 'medium',
    jobId: 'pineapple__mature__default__vegetative__detail-v2__medium',
    file: 'modules/garden-design/assets/plants/quality-family-calibration-final-1/pineapple__mature__default__vegetative__detail-v2__medium.png',
    scaleNote: 'Rosette runtime scale. Not tree physical-scale rules. No fit-to-frame.',
    lockRangeBand: null,
    selectionReason: 'Quality Family Final Calibration Prompt V2 + MEDIUM. Owner judged native detail DETAIL_OK. Do not use historical fruiting/control as the mature-vegetative baseline.'
  }
};

export const OWNED_GARDEN_PROMOTION_REVIEW_LIVE_REL =
  'modules/garden-design/owned-garden-design-asset-promotion-v1.html';

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
  const src = value.startsWith('modules/garden-design/')
    ? value.slice('modules/garden-design/'.length)
    : value;
  return `${src}?v=${OWNED_GARDEN_PROMOTION_REVIEW_CACHE_BUST}`;
}

function sceneAttrs(row) {
  const metrics = row.metrics || {};
  const bbox = metrics.bbox && metrics.bbox.exists !== false
    ? metrics.bbox
    : { exists: true, minX: 7, minY: 92, maxX: 1016, maxY: 1459 };
  const width = Number(metrics.width) || 1024;
  const height = Number(metrics.height) || 1536;
  const anchor = groundAnchorFromBbox(
    { exists: true, minX: bbox.minX, minY: bbox.minY, maxX: bbox.maxX, maxY: bbox.maxY },
    { width, height }
  );
  const parts = [
    `data-visual-form="${esc(row.visualForm)}"`,
    `data-architecture-mode="${esc(row.architectureMode)}"`,
    `data-growth-stage="${esc(row.growthStage)}"`,
    `data-canonical-slug="${esc(row.canonicalSlug)}"`,
    `data-phenology="${esc(row.phenologyState)}"`,
    'data-lock-depth="middle"',
    'data-scale-model="physical-v1"',
    `data-canvas="${width},${height}"`,
    `data-bbox="${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}"`,
    `data-ground-anchor="${anchor.nx},${anchor.ny}"`,
    'data-size-scenario="NATURAL_MATURE"',
    'data-lock-scale-mode="ESTIMATED"'
  ];
  if (row.lockRangeBand) parts.push(`data-lock-range-band="${esc(row.lockRangeBand)}"`);
  return parts.join(' ');
}

function inspectBlock(row) {
  const src = liveCutoutSrc(row.file);
  return `<div class="slot inspect-slot" data-slug="${esc(row.canonicalSlug)}" data-review-mode="NATIVE_DETAIL">
    <p class="cap">A. NATIVE ASSET</p>
    <p class="note">${esc(row.prompt)} · quality=${esc(row.quality)} · ${esc(row.jobId)} · CALIBRATION_CANDIDATE · not production-approved</p>
    <div class="inspect-scene inspect-100 checkerboard">
      <div class="inspect-frame">
        <img class="inspect-cutout" alt="${esc(row.canonicalSlug)} native asset" src="${esc(src)}" draggable="false"/>
      </div>
      <p class="inspect-tools">
        <button type="button" data-inspect-zoom="fit">Fit</button>
        <button type="button" data-inspect-zoom="100">100%</button>
        <button type="button" data-inspect-zoom="150">150%</button>
        filter:none. No blend. Candidate binary unmodified.
      </p>
    </div>
  </div>`;
}

function gardenBlock(row) {
  const src = liveCutoutSrc(row.file);
  return `<div class="slot garden-slot" data-slug="${esc(row.canonicalSlug)}" data-review-mode="IN_GARDEN">
    <p class="cap">B. REAL GARDEN PREVIEW</p>
    <p class="q">Would this asset look natural when the user actually places this plant in Garden Design?</p>
    <div class="scene real blend-v2-scene physical-v1-scene" data-role="garden-scene" ${sceneAttrs(row)}>
      <div class="placement" data-role="placement">
        <img class="cutout blend-v2" alt="${esc(row.canonicalSlug)} garden preview" src="${esc(src)}" data-approval-status="candidate"/>
        <span class="ground-shadow" aria-hidden="true"></span>
      </div>
    </div>
    <p class="scale-note">${esc(row.scaleNote)}</p>
  </div>`;
}

function qaBlock(row, qa) {
  const axes = [
    ['TECHNICAL_QA', qa.TECHNICAL_QA],
    ['BOTANICAL_IDENTITY_QA', qa.BOTANICAL_IDENTITY_QA],
    ['ARCHITECTURE_QA', qa.ARCHITECTURE_QA],
    ['GROWTH_STAGE_QA', qa.GROWTH_STAGE_QA],
    ['PHENOLOGY_STATE_QA', qa.PHENOLOGY_STATE_QA],
    ['IN_GARDEN_QA', qa.IN_GARDEN_QA],
    ['OWNER_VISUAL_QA', qa.OWNER_VISUAL_QA]
  ];
  const notes = (qa.notes || []).map((note) => `<li>${esc(note)}</li>`).join('');
  return `<div class="qa" data-slug="${esc(row.canonicalSlug)}">
    <p class="cap">C. QA SUMMARY</p>
    <p class="note">Quality-family DETAIL_OK is not asset approval. PROMOTION_READY requires every axis plus explicit owner approval.</p>
    <ul class="qa-list">
      ${axes.map(([key, value]) => `<li><strong>${esc(key)}</strong>: ${esc(value)}</li>`).join('')}
      <li><strong>DETAIL_HISTORY</strong>: ${esc(qa.DETAIL_HISTORY)}</li>
      <li><strong>PROMOTION_READY</strong>: NO</li>
      <li><strong>ASSET_PRODUCTION_APPROVAL</strong>: NO</li>
    </ul>
    <ul class="note">${notes}</ul>
  </div>`;
}

function choiceBlock(slug) {
  return `<div class="choices" data-slug="${esc(slug)}" data-owner-choice-group="${esc(slug)}">
    <p class="cap">D. OWNER CHOICE</p>
    <p class="warn-mini">APPROVE_FOR_PRODUCTION_REGISTRY records intent only. It does not write the catalog registry, Supabase, R2, or production catalog in this task.</p>
    <div class="choice-row">
      ${OWNER_PROMOTION_CHOICES.map(
        (choice) => `<button type="button" data-owner-choice="${esc(choice)}" data-slug="${esc(slug)}">${esc(choice)}</button>`
      ).join('')}
    </div>
    <p class="choice-status" data-choice-status="${esc(slug)}">No owner choice recorded.</p>
  </div>`;
}

function plantSection(title, row, qa) {
  return `<section class="plant" data-canonical-slug="${esc(row.canonicalSlug)}" data-job-id="${esc(row.jobId)}">
    <h2>${esc(title)}</h2>
    <p class="note">${esc(row.canonicalSlug)} · ${esc(row.visualForm)} · ${esc(row.architectureMode)} · ${esc(row.growthStage)} · ${esc(row.phenologyState)} · run ${esc(row.runId)}</p>
    <p class="note">${esc(row.selectionReason)}</p>
    <div class="slots">${inspectBlock(row)}${gardenBlock(row)}</div>
    ${qaBlock(row, qa)}
    ${choiceBlock(row.canonicalSlug)}
  </section>`;
}

function findRow(candidates, slug, fallback) {
  return (candidates || []).find((row) => row.canonicalSlug === slug) || fallback;
}

export function buildOwnedGardenPromotionReviewHtml(options = {}) {
  const candidates = options.candidates || [];
  const qa = options.qa || {
    mango: { TECHNICAL_QA: 'PASS', BOTANICAL_IDENTITY_QA: 'OWNER_REVIEW_REQUIRED', ARCHITECTURE_QA: 'OWNER_REVIEW_REQUIRED', GROWTH_STAGE_QA: 'OWNER_REVIEW_REQUIRED', PHENOLOGY_STATE_QA: 'OWNER_REVIEW_REQUIRED', IN_GARDEN_QA: 'OWNER_REVIEW_REQUIRED', OWNER_VISUAL_QA: 'PENDING', DETAIL_HISTORY: 'B high preferred. Not asset approval.', notes: [] },
    banana: { TECHNICAL_QA: 'PASS', BOTANICAL_IDENTITY_QA: 'OWNER_REVIEW_REQUIRED', ARCHITECTURE_QA: 'OWNER_REVIEW_REQUIRED', GROWTH_STAGE_QA: 'OWNER_REVIEW_REQUIRED', PHENOLOGY_STATE_QA: 'OWNER_REVIEW_REQUIRED', IN_GARDEN_QA: 'OWNER_REVIEW_REQUIRED', OWNER_VISUAL_QA: 'PENDING', DETAIL_HISTORY: 'Batch-2 vegetative CRISP_ENOUGH. Not fruiting.', notes: [] },
    pineapple: { TECHNICAL_QA: 'PASS', BOTANICAL_IDENTITY_QA: 'OWNER_REVIEW_REQUIRED', ARCHITECTURE_QA: 'OWNER_REVIEW_REQUIRED', GROWTH_STAGE_QA: 'OWNER_REVIEW_REQUIRED', PHENOLOGY_STATE_QA: 'OWNER_REVIEW_REQUIRED', IN_GARDEN_QA: 'OWNER_REVIEW_REQUIRED', OWNER_VISUAL_QA: 'PENDING', DETAIL_HISTORY: 'V2+medium DETAIL_OK. Not historical control.', notes: [] }
  };
  const mango = findRow(candidates, 'mango', FALLBACK.mango);
  const banana = findRow(candidates, 'banana', FALLBACK.banana);
  const pineapple = findRow(candidates, 'pineapple', FALLBACK.pineapple);
  const v2 = RUNTIME_BLEND_V2.defaults || {};
  const blendFilter = `brightness(${v2.brightness || 0.94}) contrast(${v2.contrast || 0.92}) saturate(${v2.saturate || 0.9}) blur(${v2.blurPx || 0.4}px)`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>OWNED GARDEN — PRODUCTION ASSET REVIEW</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note, .scale-note, .inspect-tools, .q { font-size: 13px; color: #444; }
    .slots { display: flex; gap: 12px; flex-wrap: wrap; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 8px; font-size: 20px; border-top: 1px solid #ccc; padding-top: 16px; }
    .checkerboard { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .inspect-scene { width: min(1024px, 100%); height: 720px; border: 1px solid #ccc; overflow: auto; }
    .inspect-scene.inspect-fit { width: 340px; height: 480px; }
    .inspect-cutout { width: 1024px; height: auto; filter: none !important; }
    .inspect-fit .inspect-cutout { max-width: 100%; max-height: 100%; width: auto; }
    .inspect-150 .inspect-cutout { width: 1536px; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .scene.physical-v1-scene { width: 720px; height: 540px; overflow: hidden; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; }
    .scene .placement { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
    .scene.physical-v1-scene .placement img.cutout { max-width: none !important; max-height: none !important; width: auto; height: auto; }
    .scene.blend-v2-scene img.cutout { filter: ${blendFilter}; }
    .inspect-cutout, [data-review-mode="NATIVE_DETAIL"] img { filter: none !important; }
    .ground-shadow { width: 55%; height: 8px; margin-top: -4px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.32) 0%, rgba(0,0,0,0) 72%); }
    .cap { font-size: 14px; font-weight: 600; }
    .warn-mini { background: #fde8e8; border: 1px solid #c44; padding: 6px 8px; font-size: 12px; }
    .qa-list { font-size: 14px; }
    .choice-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .choice-row button { padding: 8px 12px; cursor: pointer; }
    .choice-row button[aria-pressed="true"] { background: #0f3d2e; color: #fff; }
    .plant { max-width: 1600px; }
    button { padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body data-run-id="${esc(RUN_ID)}" data-owner-qa-storage="cruvit:owned-garden-design-asset-promotion-v1">
  <h1>OWNED GARDEN — PRODUCTION ASSET REVIEW</h1>
  <p id="realGardenBanner" class="warn">Exactly 3 plants: Mango, Banana, Pineapple. Olive unchanged. Spend DENIED. No generation. APPROVE does not write the production registry.</p>
  <p class="note">Reuse already-paid candidates. Native 100/150 is unblended. Garden preview uses the real persisted Garden photo, ground anchor, Blend V2, and production runtime scale. Candidate binaries are not modified.</p>
  ${plantSection('1. MANGO', mango, qa.mango)}
  ${plantSection('2. BANANA', banana, qa.banana)}
  ${plantSection('3. PINEAPPLE', pineapple, qa.pineapple)}
  <script type="module" src="./asset-factory-v1/owned-garden-design-asset-promotion-review-runtime.js?v=${OWNED_GARDEN_PROMOTION_REVIEW_CACHE_BUST}"></script>
</body>
</html>
`;
}

export function writeOwnedGardenPromotionReview(root, options = {}) {
  const htmlPath = path.join(root, OWNED_GARDEN_PROMOTION_REVIEW_LIVE_REL);
  fs.writeFileSync(htmlPath, `${buildOwnedGardenPromotionReviewHtml(options)}`);
  return { htmlPath, liveRel: OWNED_GARDEN_PROMOTION_REVIEW_LIVE_REL, generateOnRender: false };
}
