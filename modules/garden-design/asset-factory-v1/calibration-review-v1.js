/**
 * Calibration review sheet. Requires the real saved Garden Design source photo
 * via a temporary signed URL. Local backgrounds are supplementary only.
 * Does not copy private media into the repo. Does not generate images.
 */
import fs from 'node:fs';
import path from 'node:path';
import { IN_GARDEN_SCALES, RUNTIME_BLEND_EXPERIMENT, IN_GARDEN_REVIEW_CHECKS } from './in-garden-qa-v1.js';
import {
  classifyCalibrationReviewReadiness,
  LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  SAVED_GARDEN_PHOTO_AUTHORITY
} from './garden-photo-review-path-v1.js';

export const CALIBRATION_REVIEW_BACKGROUNDS = Object.freeze({
  savedGardenDesignSourcePhoto: SAVED_GARDEN_PHOTO_AUTHORITY,
  representativeLocal: LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  methodHarnessOlive: 'modules/garden-design/assets/plants/olive-tree/variants/summer-mature.png'
});

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sceneBlock(label, className, scale, slug, backgroundUrl, blocked) {
  const bg = backgroundUrl
    ? ` style="background-image:url('${esc(backgroundUrl)}')"`
    : '';
  const ghost = blocked
    ? `<div class="ghost blocked">${esc(slug)} · BLOCKED</div>`
    : `<div class="ghost ${esc(scale)}">${esc(slug)}</div>`;
  return `<div class="scene ${className}${blocked ? ' is-blocked' : ''}"${bg}>${ghost}</div>
      <p class="cap">${esc(label)}</p>`;
}

export function buildCalibrationReviewHtml(batch = [], options = {}) {
  const readiness = classifyCalibrationReviewReadiness(options.savedGardenPhoto || {});
  const realReady = readiness.status === 'READY';
  const signedUrl = realReady ? readiness.realSavedGardenPhoto.signedUrl : '';
  const rel = (p) => (options.assetPrefix ? `${options.assetPrefix}${p}` : `../../${p}`);
  const gardenB = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[0].file);
  const gardenC = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[1].file);
  const olive = rel(CALIBRATION_REVIEW_BACKGROUNDS.methodHarnessOlive);
  const blend = RUNTIME_BLEND_EXPERIMENT.aids;
  const shadow = blend.contactShadow;
  const blendFilter = `brightness(${blend.brightness}) contrast(${blend.contrast}) saturate(${blend.saturation}) blur(${blend.edgeSofteningPx}px) drop-shadow(0 ${shadow.offsetYPx}px ${shadow.blurPx}px rgba(0,0,0,${shadow.opacity}))`;
  const banner = realReady
    ? `<p class="ok">Real saved Garden Design source photo loaded via temporary signed URL. Bytes were not copied into the repo.</p>`
    : `<p class="warn"><strong>REAL SAVED GARDEN PHOTO: BLOCKED</strong> (${esc(
        readiness.realSavedGardenPhoto.reason || 'unavailable'
      )}). Path: garden_designs.source_media_id → garden_media → private ${esc(
        SAVED_GARDEN_PHOTO_AUTHORITY.storageBucket
      )} signed URL. Local stand-ins are supplementary and <em>not</em> sufficient for IN_GARDEN_QA = PASS. Host may inject <code>window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__</code> at review time. Do not copy the private photo into the repo.</p>`;

  const cards = batch
    .map((job) => {
      const title = `${job.rank}. ${esc(job.canonicalSlug)} · ${esc(job.visualForm)} · ${esc(job.growthStage)}`;
      const realScenes = IN_GARDEN_SCALES.map(
        (scale) => `<div class="scene-col">
      ${sceneBlock(
        `${scale} · REAL garden photo (required)`,
        'real',
        scale,
        job.canonicalSlug,
        signedUrl,
        !realReady
      )}
      <div class="raw-blend">
        <figure><figcaption>RAW CUTOUT</figcaption><div class="slot checkerboard"><span>empty</span></div></figure>
        <figure><figcaption>RUNTIME BLEND EXPERIMENT</figcaption><div class="slot checkerboard"><span>CSS only · not baked</span></div></figure>
      </div>
    </div>`
      ).join('');
      return `<article class="job" id="job-${esc(job.canonicalSlug)}">
  <header>
    <h2>${title}</h2>
    <p class="meta">${esc(job.scientific || '')} · ${esc(job.identityPrecision)} · ${esc(job.variantKey)} · ${esc(job.priorityReason)}</p>
    <p class="why">${esc(job.whyUsefulForCalibration)}</p>
    <p class="empty">Candidate binary: NOT GENERATED. ASSET_QA = UNKNOWN. IN_GARDEN_QA = ${realReady ? 'UNKNOWN' : 'BLOCKED'}.</p>
    <p class="meta">Approval rule: ASSET_QA = PASS AND IN_GARDEN_QA = PASS. Blend verdict after generation: RAW_PASS / RUNTIME_BLEND_REQUIRED / FAIL. Permanent blending is not implemented.</p>
  </header>
  <div class="previews">
    <figure class="checker"><figcaption>Checkerboard / transparent</figcaption><div class="slot checkerboard"><span>empty</span></div></figure>
    <figure class="white"><figcaption>White</figcaption><div class="slot white"><span>empty</span></div></figure>
    <figure class="dark"><figcaption>Dark</figcaption><div class="slot dark"><span>empty</span></div></figure>
  </div>
  <h3>In-garden composition (real photo required)</h3>
  <div class="scenes">${realScenes}</div>
  <h3>Supplementary local backgrounds (not sufficient alone)</h3>
  <div class="scenes">
    <div class="scene-col">${sceneBlock('medium · supplementary B', 'supp', 'medium', job.canonicalSlug, gardenB, false)}</div>
    <div class="scene-col">${sceneBlock('medium · supplementary C', 'supp', 'medium', job.canonicalSlug, gardenC, false)}</div>
  </div>
</article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Design Asset Factory — Calibration review (8 jobs)</title>
  <style>
    :root { font-family: "DM Sans", sans-serif; color: #122; }
    body { margin: 24px; background: #f4f1ea; }
    h1 { font-size: 22px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .job { background: #fff; border: 1px solid #ddd; margin: 24px 0; padding: 16px; }
    .meta, .why, .empty, .cap { font-size: 13px; color: #444; }
    .empty { color: #8a2b2b; }
    .previews, .scenes, .raw-blend { display: flex; gap: 12px; flex-wrap: wrap; }
    .slot { width: 160px; height: 220px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 12px; }
    .checkerboard { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .white { background: #fff; border: 1px solid #eee; }
    .dark { background: #1a1a1a; color: #aaa; }
    .scene { width: 240px; height: 160px; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; background-color: #2a2a2a; }
    .scene.is-blocked { outline: 2px solid #c44; }
    .ghost { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); background: rgba(255,255,255,.55); padding: 4px 6px; font-size: 10px; }
    .ghost.small { width: 18%; height: 28%; }
    .ghost.medium { width: 28%; height: 44%; }
    .ghost.large { width: 40%; height: 62%; }
    .ghost.blocked { width: 80%; text-align: center; }
    .harness img.cutout { height: 55%; position: absolute; left: 52%; bottom: 10%; transform: translateX(-50%); }
    .harness.blend img.cutout { filter: ${blendFilter}; }
    .scene.harness { width: 280px; height: 180px; }
    code { font-size: 12px; }
  </style>
</head>
<body>
  <h1>Calibration review — 8 jobs, no generation</h1>
  ${banner}
  <p>Owner question: does this actually look like the plant is in my garden? Checks: ${esc(
    IN_GARDEN_REVIEW_CHECKS.join('; ')
  )}.</p>
  ${cards}
  <section class="job">
    <h2>Method harness (not a calibration candidate)</h2>
    <p class="meta">Approved olive cutout on supplementary local backgrounds only. Proves layout + CSS blend toggle. Not a substitute for the real saved garden photo.</p>
    <label><input type="checkbox" id="blendToggle"/> Show runtime-blend experiment (CSS only, not permanent, does not alter the garden photo)</label>
    <div class="scenes">
      <div class="scene harness raw" style="background-image:url('${gardenB}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness raw" style="background-image:url('${gardenC}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenB}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenC}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
    </div>
  </section>
  <p>Scales: ${IN_GARDEN_SCALES.join(', ')}. Runtime blend permanently implemented: false. Alter garden photo: false. AI/inpainting: false.</p>
  <script>
    (function () {
      var injected = window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__;
      if (injected && /^https:\\/\\//i.test(injected)) {
        document.querySelectorAll('.scene.real').forEach(function (el) {
          el.style.backgroundImage = 'url(' + JSON.stringify(injected) + ')';
          el.classList.remove('is-blocked');
        });
      }
      var toggle = document.getElementById('blendToggle');
      if (toggle) {
        toggle.addEventListener('change', function () {
          document.querySelectorAll('.harness.blend').forEach(function (el) {
            el.style.display = toggle.checked ? 'block' : 'none';
          });
        });
      }
      document.querySelectorAll('.harness.blend').forEach(function (el) { el.style.display = 'none'; });
    })();
  </script>
</body>
</html>`;
}

export function writeCalibrationReviewSheet(root, batch, options = {}) {
  const dir = path.join(root, 'data', 'garden-design', 'calibration-batch-1');
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, 'owner-review.html');
  fs.writeFileSync(htmlPath, buildCalibrationReviewHtml(batch, options));
  return { htmlPath, readiness: classifyCalibrationReviewReadiness(options.savedGardenPhoto || {}) };
}
