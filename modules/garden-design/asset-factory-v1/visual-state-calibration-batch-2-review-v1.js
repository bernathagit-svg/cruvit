/**
 * Batch-2 review harness. No assets. No generation. Signed Garden photo injected by host.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import { RUNTIME_BLEND_V1 } from './in-garden-qa-v1.js';

export const BATCH_2_REVIEW_LIVE_REL = 'modules/garden-design/visual-state-calibration-batch-2.html';
export const BATCH_2_REVIEW_QUESTIONS = Object.freeze([
  'A. Do these clearly look like the same plant identity?',
  'B. Is the intended state visibly distinct?',
  'C. Is the distinction botanically believable?',
  'D. Would the state add meaningful Garden Design value?',
  'E. Does the asset still integrate naturally in the Garden scene?'
]);

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function familySection(id, title, slots, note) {
  const slotHtml = slots
    .map(
      (slot) => `<div class="slot" data-job-id="${esc(slot.jobId)}">
        <p class="cap">${esc(slot.label)}</p>
        <div class="scene real blend-v1-scene" data-role="garden-scene">
          <div class="ghost blocked">${esc(slot.empty)}</div>
        </div>
      </div>`
    )
    .join('');
  return `<section class="family" data-family="${esc(id)}">
    <h2>Family ${esc(id)} — ${esc(title)}</h2>
    <p class="note">${esc(note)}</p>
    <div class="slots">${slotHtml}</div>
    <ol class="questions">
      ${BATCH_2_REVIEW_QUESTIONS.map((q) => `<li>${esc(q)}</li>`).join('')}
    </ol>
  </section>`;
}

export function buildVisualStateCalibrationBatch2ReviewHtml() {
  const v1 = RUNTIME_BLEND_V1.aids;
  const shadow = v1.contactShadow;
  const blendV1Filter = `brightness(${v1.brightness}) contrast(${v1.contrast}) saturate(${v1.saturation}) blur(${v1.edgeSofteningPx}px) drop-shadow(0 ${shadow.offsetYPx}px ${shadow.blurPx}px rgba(0,0,0,${shadow.opacity}))`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Visual State Calibration Batch 2 — review harness (no assets)</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .note { font-size: 13px; color: #444; }
    .family { background: #fff; border: 1px solid #ddd; margin: 24px 0; padding: 16px; }
    .slots { display: flex; gap: 12px; flex-wrap: wrap; }
    .scene { width: 280px; height: 200px; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; background-color: #2a2a2a; overflow: hidden; }
    .scene.real { width: 420px; height: 300px; }
    .ghost { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); background: rgba(255,255,255,.55); padding: 6px 8px; font-size: 11px; width: 80%; text-align: center; }
    .scene.blend-v1-scene img.cutout { filter: ${blendV1Filter}; }
    .cap { font-size: 13px; color: #444; }
    .questions { font-size: 14px; }
  </style>
</head>
<body>
  <h1>Visual State Calibration Batch 2 — 11 jobs, five pair-complete families, 0 generated</h1>
  <p id="realGardenBanner" class="warn">No assets yet. Signed Garden photo is injected by the host when available. Do not bake scene integration into PNGs. Blend/ground-contact is runtime CSS only. Physical size remains runtime authority; families are not forced to one scale.</p>
  <p class="note">Spend gate DENIED. Production registry unchanged. Family review is side-by-side on the same Garden source. QA later: TECHNICAL_QA, BOTANICAL_IDENTITY_QA, STATE_QA, FAMILY_CONSISTENCY_QA, IN_GARDEN_QA, OWNER_VISUAL_QA.</p>
${familySection('A', 'Mango — 3-way', [
    { jobId: 'mango__mature__tree__vegetative__v1', label: '1. TREE MATURE VEGETATIVE (new family anchor)', empty: 'ASSET NOT GENERATED' },
    { jobId: 'mango__young__tree__vegetative__v1', label: '2. TREE YOUNG VEGETATIVE', empty: 'ASSET NOT GENERATED' },
    { jobId: 'mango__mature__tree__fruiting__v1', label: '3. TREE MATURE FRUITING', empty: 'ASSET NOT GENERATED' }
  ], 'Proves YOUNG vs MATURE and VEGETATIVE vs FRUITING. Batch-1 mango is not the family anchor. Physical size is runtime authority.')}
${familySection('B', 'Banana — 2-way', [
    { jobId: 'banana__mature__default__vegetative__v1', label: '4. herbaceous-clump MATURE VEGETATIVE (new family anchor)', empty: 'ASSET NOT GENERATED' },
    { jobId: 'banana__young__default__vegetative__v1', label: '5. herbaceous-clump YOUNG VEGETATIVE', empty: 'ASSET NOT GENERATED' }
  ], 'Proves YOUNG vs MATURE in large-herbaceous architecture. Batch-1 banana is not the family anchor.')}
${familySection('C', 'Apple — 2-way', [
    { jobId: 'apple__mature__tree__vegetative__v1', label: '6. TREE MATURE VEGETATIVE', empty: 'ASSET NOT GENERATED' },
    { jobId: 'apple__mature__tree__dormant__v1', label: '7. TREE MATURE DORMANT', empty: 'ASSET NOT GENERATED' }
  ], 'Proves VEGETATIVE vs DORMANT. Young Apple is not in this batch.')}
${familySection('D', 'Pomegranate — 2-way', [
    { jobId: 'pomegranate__mature__tree__vegetative__v1', label: '8. TREE MATURE VEGETATIVE', empty: 'ASSET NOT GENERATED' },
    { jobId: 'pomegranate__mature__shrub__vegetative__v1', label: '9. SHRUB MATURE VEGETATIVE', empty: 'ASSET NOT GENERATED' }
  ], 'Proves TREE vs SHRUB architectureMode. One canonical identity.')}
${familySection('E', 'Lavender — 2-way', [
    { jobId: 'lavender__mature__shrub__vegetative__v1', label: '10. SHRUB MATURE VEGETATIVE (new family anchor)', empty: 'ASSET NOT GENERATED' },
    { jobId: 'lavender__mature__shrub__flowering__v1', label: '11. SHRUB MATURE FLOWERING', empty: 'ASSET NOT GENERATED' }
  ], 'Proves VEGETATIVE vs FLOWERING. Batch-1 lavender may remain historical evidence only and is not the family anchor.')}
  <p class="note">Eggplant visual-state calibration = DEFERRED_BASELINE_REQUIRED. Not generated in this batch. Fruiting-state behavior is represented by Mango.</p>
  <script>
    const TYPE = ${JSON.stringify(CALIBRATION_SOURCE_MESSAGE_TYPE)};
    function applySignedUrl(url) {
      if (!url) return false;
      document.querySelectorAll('[data-role="garden-scene"]').forEach((el) => {
        el.style.backgroundImage = "url('" + String(url).replace(/'/g, "\\\\'") + "')";
      });
      const banner = document.getElementById('realGardenBanner');
      if (banner) {
        banner.className = 'ok';
        banner.textContent = 'Real Garden photo loaded. Assets are not generated. Blend V1 CSS will apply when cutouts exist. No bake-in.';
      }
      return true;
    }
    window.addEventListener('message', (ev) => {
      const d = ev && ev.data;
      if (!d || d.type !== TYPE) return;
      if (d.sourceMediaUrl) applySignedUrl(d.sourceMediaUrl);
    });
  </script>
</body>
</html>
`;
}

export function writeVisualStateCalibrationBatch2Review(root) {
  const htmlPath = path.join(root, BATCH_2_REVIEW_LIVE_REL);
  fs.writeFileSync(htmlPath, `${buildVisualStateCalibrationBatch2ReviewHtml()}`);
  return {
    htmlPath,
    liveRel: BATCH_2_REVIEW_LIVE_REL,
    questions: BATCH_2_REVIEW_QUESTIONS,
    assetsEmbedded: false,
    generateOnRender: false
  };
}
