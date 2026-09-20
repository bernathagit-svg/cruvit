/**
 * Batch-2 review harness: native asset inspection + production in-garden scale.
 * Does not regenerate assets. Does not spend. Does not write the production registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import { RUNTIME_BLEND_V2 } from './in-garden-qa-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';
import { groundAnchorFromBbox } from './composition-calibration-v2.js';

export const BATCH_2_REVIEW_LIVE_REL = 'modules/garden-design/visual-state-calibration-batch-2.html';
export const BATCH_2_REVIEW_QUESTIONS = Object.freeze([
  '1. Do these look like the same plant identity?',
  '2. Is Young genuinely younger architecture? (where present)',
  '3. Is the intended state visibly plausible (fruiting / dormant / flowering / architectureMode)?',
  '4. Is native asset detail acceptable? (ASSET INSPECTION only)',
  '5. Does each integrate naturally in the Garden? (IN-GARDEN only)',
  '6. Does mature size follow production Garden Design scale rather than a miniature thumbnail?'
]);

const RESULTS_REL = path.join('data', 'garden-design', 'visual-state-calibration-batch-2', 'results.json');

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

function loadGeneratedJobs(root, options = {}) {
  if (Array.isArray(options.generatedJobs) && options.generatedJobs.length) return options.generatedJobs;
  const resultsPath = path.join(root, RESULTS_REL);
  if (!fs.existsSync(resultsPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    return Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {
    return [];
  }
}

function reviewForm(job) {
  if (job.architectureMode === 'shrub' || job.visualForm === 'shrub') return 'shrub';
  if (job.visualForm === 'herbaceous-clump') return 'herbaceous-clump';
  return job.visualForm || 'tree';
}

function sceneAttrs(job) {
  const metrics = job.technicalQa && job.technicalQa.metrics ? job.technicalQa.metrics : {};
  const bbox = metrics.bbox && metrics.bbox.exists !== false
    ? { exists: true, minX: metrics.bbox.minX, minY: metrics.bbox.minY, maxX: metrics.bbox.maxX, maxY: metrics.bbox.maxY }
    : { exists: false };
  const width = Number(metrics.width) || 1024;
  const height = Number(metrics.height) || 1536;
  const form = reviewForm(job);
  const matureMango = job.canonicalSlug === 'mango' && job.growthStage === 'mature';
  const young = job.growthStage === 'young';
  const anchor = groundAnchorFromBbox(bbox, { width, height });
  const parts = [
    `data-visual-form="${esc(form)}"`,
    `data-architecture-mode="${esc(job.architectureMode || 'default')}"`,
    `data-growth-stage="${esc(job.growthStage || 'mature')}"`,
    `data-canonical-slug="${esc(job.canonicalSlug)}"`,
    `data-phenology="${esc(job.phenologyState || job.phenology || '')}"`,
    'data-lock-depth="middle"',
    'data-scale-model="physical-v1"',
    `data-canvas="${width},${height}"`,
    bbox.exists
      ? `data-bbox="${Number(bbox.minX)},${Number(bbox.minY)},${Number(bbox.maxX)},${Number(bbox.maxY)}"`
      : '',
    anchor && Number.isFinite(anchor.nx) ? `data-ground-anchor="${anchor.nx},${anchor.ny}"` : '',
    'data-size-scenario="NATURAL_MATURE"',
    matureMango ? 'data-lock-range-band="LOW"' : '',
    young ? 'data-stage-authority="STAGE_AUTHORITY_UNKNOWN"' : '',
    'data-lock-scale-mode="ESTIMATED"'
  ];
  return parts.filter(Boolean).join(' ');
}

function inspectSlot(job, src) {
  const inner = src
    ? `<div class="inspect-frame" data-inspect-frame>
        <img class="inspect-cutout" alt="${esc(job.label)}" src="${esc(src)}" draggable="false"/>
      </div>
      <p class="inspect-tools"><button type="button" data-inspect-zoom>View 100%</button> Native PNG. No Garden blend. No physical-scale shrink.</p>`
    : `<div class="ghost blocked">${esc(job.empty || 'ASSET NOT GENERATED')}</div>`;
  return `<div class="slot inspect-slot" data-job-id="${esc(job.jobId)}" data-review-mode="ASSET_INSPECTION">
    <p class="cap">${esc(job.label)}</p>
    <div class="inspect-scene checkerboard">${inner}</div>
  </div>`;
}

function gardenSlot(job, src) {
  const inner = src
    ? `<div class="placement" data-role="placement">
        <img class="cutout blend-v2" alt="${esc(job.label)}" src="${esc(src)}" data-approval-status="candidate"/>
        <span class="ground-shadow" aria-hidden="true"></span>
      </div>`
    : `<div class="ghost blocked">${esc(job.empty || 'ASSET NOT GENERATED')}</div>`;
  const scaleNote =
    job.canonicalSlug === 'mango' && job.growthStage === 'mature'
      ? 'Production Tree Physical Scale V1 · ownerPreferredRangePosition = LOW'
      : job.growthStage === 'young'
        ? 'STAGE_AUTHORITY_UNKNOWN · Estimated young scale · not a % of mature meters'
        : job.reviewForm === 'shrub'
          ? 'Shrub form-relative runtime · not tree physical scale'
          : job.reviewForm === 'herbaceous-clump'
            ? 'Large-herbaceous runtime · not tree rules'
            : 'Tree physical-scale / estimated authority for this identity';
  return `<div class="slot garden-slot" data-job-id="${esc(job.jobId)}" data-review-mode="IN_GARDEN">
    <p class="cap">${esc(job.label)}</p>
    <div class="scene real blend-v2-scene physical-v1-scene" data-role="garden-scene" ${sceneAttrs(job)}>
      ${inner}
    </div>
    <p class="scale-note" data-scale-readout>${esc(scaleNote)}</p>
  </div>`;
}

function familySection(id, title, jobs, note) {
  const inspect = jobs.map((job) => inspectSlot(job, job.src)).join('');
  const garden = jobs.map((job) => gardenSlot(job, job.src)).join('');
  return `<section class="family" data-family="${esc(id)}">
    <h2>Family ${esc(id)} — ${esc(title)}</h2>
    <p class="note">${esc(note)}</p>
    <h3>A. ASSET INSPECTION</h3>
    <p class="note">Judge candidate quality itself. Native aspect. Checkerboard. No blend, blur, opacity, or scene tonal adaptation.</p>
    <div class="slots inspect-row">${inspect}</div>
    <h3>B. IN-GARDEN REVIEW</h3>
    <p class="note">Judge Garden integration using production scale authority. No fit-to-frame. Clipping is valid. Physical size is runtime authority.</p>
    <div class="slots garden-row">${garden}</div>
    <ol class="questions">
      ${BATCH_2_REVIEW_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join('')}
    </ol>
  </section>`;
}

function hydrateJob(slot, generated) {
  const found = generated.get(slot.jobId);
  const src = found && found.file ? liveCutoutSrc(found.file) : '';
  return {
    ...slot,
    src,
    empty: src ? '' : 'ASSET NOT GENERATED',
    technicalQa: found && found.technicalQa,
    generated: Boolean(found && found.generated),
    reviewForm: reviewForm(slot)
  };
}

export function buildVisualStateCalibrationBatch2ReviewHtml(options = {}) {
  const generated = new Map();
  for (const job of options.generatedJobs || []) {
    if (job && job.jobId) generated.set(job.jobId, job);
  }
  const generatedCount = [...generated.values()].filter((job) => job.generated && job.file).length;
  const slot = (spec) => hydrateJob(spec, generated);
  const v2 = RUNTIME_BLEND_V2.defaults || RUNTIME_BLEND_V2.aids || {};
  const blendFilter = `brightness(${v2.brightness || 0.94}) contrast(${v2.contrast || 0.92}) saturate(${v2.saturate || 0.9}) blur(${v2.blurPx || 0.4}px)`;
  const title = generatedCount
    ? `Visual State Calibration Batch 2 — ${generatedCount}/11 candidates, production-scale review`
    : 'Visual State Calibration Batch 2 — 11 jobs, five pair-complete families, 0 generated';
  const banner = generatedCount
    ? 'Candidates only. Not approved. ASSET INSPECTION is native/unfiltered. IN-GARDEN uses production Tree Physical Scale V1 (Mango LOW) and form-appropriate runtime scale. Blend V2 is garden-only.'
    : 'No assets yet. Signed Garden photo is injected by the host when available.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note, .scale-note, .inspect-tools { font-size: 13px; color: #444; }
    .family { background: #fff; border: 1px solid #ddd; margin: 24px 0; padding: 16px; }
    .slots { display: flex; gap: 12px; flex-wrap: wrap; }
    h3 { margin: 18px 0 8px; font-size: 16px; }
    .checkerboard { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .inspect-scene { width: 340px; height: 480px; border: 1px solid #ccc; position: relative; overflow: auto; }
    .inspect-scene.inspect-100 { width: min(1024px, 100%); height: 720px; }
    .inspect-frame { min-height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .inspect-cutout { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; object-position: bottom center; image-rendering: auto; filter: none !important; opacity: 1 !important; }
    .inspect-100 .inspect-cutout { max-width: none; max-height: none; width: 1024px; height: auto; }
    .scene { width: 280px; height: 200px; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; background-color: #2a2a2a; overflow: hidden; }
    .scene.real, .scene.physical-v1-scene { width: 720px; height: 540px; overflow: hidden; }
    .ghost { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); background: rgba(255,255,255,.55); padding: 6px 8px; font-size: 11px; width: 80%; text-align: center; }
    .scene .placement { position: absolute; left: 50%; bottom: 20%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; width: auto; max-width: none; pointer-events: none; overflow: visible; }
    .scene.physical-v1-scene .placement img.cutout { max-width: none !important; max-height: none !important; width: auto; height: auto; object-fit: contain; object-position: bottom center; }
    .scene.blend-v2-scene img.cutout { filter: ${blendFilter}; }
    .inspect-cutout, [data-review-mode="ASSET_INSPECTION"] img { filter: none !important; }
    .ground-shadow { width: 55%; height: 8px; margin-top: -4px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(0,0,0,.32) 0%, rgba(0,0,0,0) 72%); }
    .cap { font-size: 13px; color: #444; }
    .questions { font-size: 14px; }
    button { padding: 6px 10px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p id="realGardenBanner" class="${generatedCount ? 'ok' : 'warn'}">${esc(banner)}</p>
  <p class="note">Spend gate DENIED. Production registry unchanged. Candidate PNGs are not modified. Mango mature IN-GARDEN uses botanical-size-authority-v1 + Tree Physical Scale V1 + ownerPreferredRangePosition=${esc(MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition)}. Young never uses mature meter authority. Photo calibration remains optional.</p>
${familySection('A', 'Mango — 3-way', [
    slot({ jobId: 'mango__mature__tree__vegetative__v1', label: '1. TREE MATURE VEGETATIVE', canonicalSlug: 'mango', visualForm: 'tree', architectureMode: 'tree', growthStage: 'mature', phenologyState: 'vegetative' }),
    slot({ jobId: 'mango__young__tree__vegetative__v1', label: '2. TREE YOUNG VEGETATIVE', canonicalSlug: 'mango', visualForm: 'tree', architectureMode: 'tree', growthStage: 'young', phenologyState: 'vegetative' }),
    slot({ jobId: 'mango__mature__tree__fruiting__v1', label: '3. TREE MATURE FRUITING', canonicalSlug: 'mango', visualForm: 'tree', architectureMode: 'tree', growthStage: 'mature', phenologyState: 'fruiting' })
  ], 'ASSET INSPECTION vs IN-GARDEN are separate questions. Mature vegetative and fruiting share Mango LOW production scale. Young is Estimated young scale.')}
${familySection('B', 'Banana — 2-way', [
    slot({ jobId: 'banana__mature__default__vegetative__v1', label: '4. herbaceous-clump MATURE VEGETATIVE', canonicalSlug: 'banana', visualForm: 'herbaceous-clump', architectureMode: 'default', growthStage: 'mature', phenologyState: 'vegetative' }),
    slot({ jobId: 'banana__young__default__vegetative__v1', label: '5. herbaceous-clump YOUNG VEGETATIVE', canonicalSlug: 'banana', visualForm: 'herbaceous-clump', architectureMode: 'default', growthStage: 'young', phenologyState: 'vegetative' })
  ], 'Large-herbaceous runtime. Not tree physical-scale rules.')}
${familySection('C', 'Apple — 2-way', [
    slot({ jobId: 'apple__mature__tree__vegetative__v1', label: '6. TREE MATURE VEGETATIVE', canonicalSlug: 'apple', visualForm: 'tree', architectureMode: 'tree', growthStage: 'mature', phenologyState: 'vegetative' }),
    slot({ jobId: 'apple__mature__tree__dormant__v1', label: '7. TREE MATURE DORMANT', canonicalSlug: 'apple', visualForm: 'tree', architectureMode: 'tree', growthStage: 'mature', phenologyState: 'dormant' })
  ], 'Apple tree authority/fallback. Same mature physical-scale context for vegetative and dormant. Not Mango LOW.')}
${familySection('D', 'Pomegranate — 2-way', [
    slot({ jobId: 'pomegranate__mature__tree__vegetative__v1', label: '8. TREE MATURE VEGETATIVE', canonicalSlug: 'pomegranate', visualForm: 'tree', architectureMode: 'tree', growthStage: 'mature', phenologyState: 'vegetative' }),
    slot({ jobId: 'pomegranate__mature__shrub__vegetative__v1', label: '9. SHRUB MATURE VEGETATIVE', canonicalSlug: 'pomegranate', visualForm: 'shrub', architectureMode: 'shrub', growthStage: 'mature', phenologyState: 'vegetative' })
  ], 'TREE vs SHRUB architectureMode. Shrub does not use tree physical-scale rules.')}
${familySection('E', 'Lavender — 2-way', [
    slot({ jobId: 'lavender__mature__shrub__vegetative__v1', label: '10. SHRUB MATURE VEGETATIVE', canonicalSlug: 'lavender', visualForm: 'shrub', architectureMode: 'shrub', growthStage: 'mature', phenologyState: 'vegetative' }),
    slot({ jobId: 'lavender__mature__shrub__flowering__v1', label: '11. SHRUB MATURE FLOWERING', canonicalSlug: 'lavender', visualForm: 'shrub', architectureMode: 'shrub', growthStage: 'mature', phenologyState: 'flowering' })
  ], 'Shrub scale. Flowering must keep vegetative habit; compare native flowers in ASSET INSPECTION.')}
  <p class="note">Eggplant visual-state calibration = DEFERRED_BASELINE_REQUIRED. Not generated in this batch.</p>
  <script type="module" src="./asset-factory-v1/visual-state-calibration-batch-2-review-runtime.js"></script>
</body>
</html>
`;
}

export function writeVisualStateCalibrationBatch2Review(root, options = {}) {
  const generatedJobs = loadGeneratedJobs(root, options);
  const htmlPath = path.join(root, BATCH_2_REVIEW_LIVE_REL);
  fs.writeFileSync(htmlPath, `${buildVisualStateCalibrationBatch2ReviewHtml({ ...options, generatedJobs })}`);
  const generatedCount = generatedJobs.filter((job) => job && job.generated && job.file).length;
  return {
    htmlPath,
    liveRel: BATCH_2_REVIEW_LIVE_REL,
    questions: BATCH_2_REVIEW_QUESTIONS,
    assetsEmbedded: generatedCount > 0,
    generateOnRender: false,
    usesProductionPhysicalScale: true,
    mangoOwnerPreferredRangePosition: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition
  };
}
