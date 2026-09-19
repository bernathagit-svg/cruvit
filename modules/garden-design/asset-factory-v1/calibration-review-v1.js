/**
 * Calibration review sheet. Signed Garden photo is injected at runtime by the
 * authenticated host. This file never embeds the private URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { IN_GARDEN_SCALES, RUNTIME_BLEND_EXPERIMENT, IN_GARDEN_REVIEW_FIELDS } from './in-garden-qa-v1.js';
import {
  classifyCalibrationReviewReadiness,
  LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  SAVED_GARDEN_PHOTO_AUTHORITY
} from './garden-photo-review-path-v1.js';
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';

export const CALIBRATION_REVIEW_BACKGROUNDS = Object.freeze({
  savedGardenDesignSourcePhoto: SAVED_GARDEN_PHOTO_AUTHORITY,
  representativeLocal: LOCAL_SUPPLEMENTARY_BACKGROUNDS,
  methodHarnessOlive: 'modules/garden-design/assets/plants/olive-tree/variants/summer-mature.png'
});

export const CALIBRATION_REVIEW_LIVE_REL = 'modules/garden-design/calibration-review.html';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sceneBlock(letter, label, className, scale, slug, backgroundUrl, blocked) {
  const bg = backgroundUrl
    ? ` style="background-image:url('${esc(backgroundUrl)}')"`
    : '';
  const ghost = blocked
    ? `<div class="ghost blocked">${esc(slug)} · waiting for host signed URL</div>`
    : `<div class="ghost ${esc(scale || '')}">${esc(slug)}</div>`;
  return `<div class="scene-col" data-panel="${esc(letter)}">
      <p class="cap"><strong>${esc(letter)}.</strong> ${esc(label)}</p>
      <div class="scene ${className}${blocked ? ' is-blocked' : ''}"${bg}>${ghost}</div>
    </div>`;
}

export function buildCalibrationReviewHtml(batch = [], options = {}) {
  const readiness = classifyCalibrationReviewReadiness(options.savedGardenPhoto || {});
  const rel = (p) => (options.assetPrefix ? `${options.assetPrefix}${p}` : `../../${p}`);
  const gardenE = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[0].file);
  const gardenF = rel(LOCAL_SUPPLEMENTARY_BACKGROUNDS[1].file);
  const olive = rel(CALIBRATION_REVIEW_BACKGROUNDS.methodHarnessOlive);
  const blend = RUNTIME_BLEND_EXPERIMENT.aids;
  const shadow = blend.contactShadow;
  const blendFilter = `brightness(${blend.brightness}) contrast(${blend.contrast}) saturate(${blend.saturation}) blur(${blend.edgeSofteningPx}px) drop-shadow(0 ${shadow.offsetYPx}px ${shadow.blurPx}px rgba(0,0,0,${shadow.opacity}))`;

  const cards = batch
    .map((job) => {
      const title = `${job.rank}. ${esc(job.canonicalSlug)} · ${esc(job.visualForm)} · ${esc(job.growthStage)}`;
      return `<article class="job" id="job-${esc(job.canonicalSlug)}">
  <header>
    <h2>${title}</h2>
    <p class="meta">${esc(job.scientific || '')} · ${esc(job.identityPrecision)} · ${esc(job.variantKey)} · ${esc(job.priorityReason)}</p>
    <p class="why">${esc(job.whyUsefulForCalibration)}</p>
    <p class="empty" data-in-garden-status="BLOCKED">Candidate binary: NOT GENERATED. ASSET_QA = UNKNOWN. IN_GARDEN_QA = BLOCKED until the real Garden photo loads.</p>
    <p class="meta">Review fields: ${esc(IN_GARDEN_REVIEW_FIELDS.join(', '))}. Approval: ASSET_QA = PASS AND IN_GARDEN_QA = PASS. IN_GARDEN_QA may be PASS only when the real persisted Garden photo was used.</p>
  </header>
  <div class="previews">
    ${sceneBlock('A', 'transparent / checkerboard', 'checkerboard-scene', '', job.canonicalSlug, '', false)}
  </div>
  <h3>Real Garden photo (host signed URL)</h3>
  <div class="scenes">
    ${sceneBlock('B', 'REAL Garden photo — small', 'real', 'small', job.canonicalSlug, '', true)}
    ${sceneBlock('C', 'REAL Garden photo — medium', 'real', 'medium', job.canonicalSlug, '', true)}
    ${sceneBlock('D', 'REAL Garden photo — large plausible', 'real', 'large', job.canonicalSlug, '', true)}
  </div>
  <h3>Supplementary local scenes (not sufficient alone)</h3>
  <div class="scenes">
    ${sceneBlock('E', 'supplementary local scene 1', 'supp', 'medium', job.canonicalSlug, gardenE, false)}
    ${sceneBlock('F', 'supplementary local scene 2', 'supp', 'medium', job.canonicalSlug, gardenF, false)}
  </div>
  <h3>Raw vs runtime blend (experiment only, not permanent)</h3>
  <div class="raw-blend">
    <figure><figcaption>RAW</figcaption><div class="slot checkerboard"><span>empty</span></div></figure>
    <figure><figcaption>RUNTIME BLEND</figcaption><div class="slot checkerboard"><span>CSS only · not baked · does not alter source photo</span></div></figure>
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
    .checkerboard, .checkerboard-scene { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .checkerboard-scene { width: 240px; height: 160px; border: 1px solid #ccc; position: relative; }
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
  <p id="realGardenBanner" class="warn">Loading Garden context… Path: garden_designs.source_media_id → garden_media → private ${esc(
    SAVED_GARDEN_PHOTO_AUTHORITY.storageBucket
  )}. Local stand-ins are supplementary only. Do not copy the private photo into the repo. No Storage credentials in this page.</p>
  <p>Owner question: does this actually look like the plant is in my garden? Fields: ${esc(
    IN_GARDEN_REVIEW_FIELDS.join(', ')
  )}.</p>
  ${cards}
  <section class="job">
    <h2>Method harness (not a calibration candidate)</h2>
    <p class="meta">Approved olive cutout on supplementary local backgrounds only. Proves layout + CSS blend toggle. Not a substitute for the real saved garden photo.</p>
    <label><input type="checkbox" id="blendToggle"/> Show runtime-blend experiment (CSS only, not permanent, does not alter the garden photo)</label>
    <div class="scenes">
      <div class="scene harness raw" style="background-image:url('${gardenE}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness raw" style="background-image:url('${gardenF}')"><img class="cutout" src="${olive}" alt="olive raw"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenE}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
      <div class="scene harness blend" style="background-image:url('${gardenF}')"><img class="cutout" src="${olive}" alt="olive blend"/></div>
    </div>
  </section>
  <p>Scales: ${IN_GARDEN_SCALES.join(', ')}. Runtime blend permanently implemented: false. Alter garden photo: false. AI/inpainting: false. Readiness before host inject: ${esc(
    readiness.status
  )}.</p>
  <script>
    (function () {
      var MESSAGE_TYPE = ${JSON.stringify(CALIBRATION_SOURCE_MESSAGE_TYPE)};
      function applySignedUrl(url) {
        if (!url || !/^https:\\/\\//i.test(url)) return false;
        document.querySelectorAll('.scene.real').forEach(function (el) {
          el.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
          el.classList.remove('is-blocked');
          var ghost = el.querySelector('.ghost');
          if (ghost) ghost.classList.remove('blocked');
        });
        var banner = document.getElementById('realGardenBanner');
        if (banner) {
          banner.className = 'ok';
          banner.textContent = 'Real saved Garden Design source photo loaded via temporary signed URL. Bytes were not copied into the repo.';
        }
        document.querySelectorAll('[data-in-garden-status]').forEach(function (el) {
          el.setAttribute('data-in-garden-status', 'UNKNOWN');
          el.textContent = String(el.textContent || '').replace(/IN_GARDEN_QA = BLOCKED until the real Garden photo loads\\./, 'IN_GARDEN_QA = UNKNOWN. Real Garden photo is loaded.');
        });
        return true;
      }
      function applyUiStatus(d) {
        if (d && d.sourceMediaUrl && applySignedUrl(d.sourceMediaUrl)) return;
        var banner = document.getElementById('realGardenBanner');
        if (!banner) return;
        var status = (d && (d.uiStatus || d.code)) || '';
        var labels = {
          LOADING_GARDEN_CONTEXT: 'Loading Garden context…',
          LOADING_GARDEN_PHOTO: 'Loading Garden photo…',
          REAL_GARDEN_SOURCE_LOADED: 'Real Garden photo loaded.',
          AUTH_REQUIRED: 'AUTH_REQUIRED — sign in to load the saved Garden photo.',
          NO_ACTIVE_GARDEN: 'NO_ACTIVE_GARDEN — select an active garden.',
          DESIGN_SELECTION_REQUIRED: 'DESIGN_SELECTION_REQUIRED — select the active Garden Design. Latest is not chosen automatically.',
          SOURCE_PHOTO_UNAVAILABLE: 'SOURCE_PHOTO_UNAVAILABLE — saved Garden Design source photo was not found.',
          SIGNED_URL_FAILED: 'SIGNED_URL_FAILED — could not create a temporary signed URL.'
        };
        if (!status || !labels[status]) return;
        banner.className = status === 'REAL_GARDEN_SOURCE_LOADED' ? 'ok' : 'warn';
        banner.textContent = labels[status];
      }
      window.addEventListener('message', function (ev) {
        if (ev.origin && ev.origin !== 'null' && ev.origin !== window.location.origin) return;
        var d = ev.data;
        if (!d || d.type !== MESSAGE_TYPE) return;
        applyUiStatus(d);
      });
      if (window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__) applySignedUrl(window.__CRUVIT_GARDEN_SOURCE_SIGNED_URL__);
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
  const html = buildCalibrationReviewHtml(batch, options);
  const dir = path.join(root, 'data', 'garden-design', 'calibration-batch-1');
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, 'owner-review.html');
  fs.writeFileSync(htmlPath, html);
  const livePath = path.join(root, ...CALIBRATION_REVIEW_LIVE_REL.split('/'));
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  fs.writeFileSync(livePath, html);
  return {
    htmlPath,
    livePath,
    readiness: classifyCalibrationReviewReadiness(options.savedGardenPhoto || {})
  };
}
