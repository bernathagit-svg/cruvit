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
import {
  CALIBRATION_BATCH_1_CACHE_BUST,
  CALIBRATION_BATCH_1_CANDIDATES,
  CALIBRATION_BATCH_1_LIVE_BASE,
  calibrationCandidateRepoPath
} from './calibration-review-candidates-v1.js';

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

function sceneBlock(letter, label, className, scale, slug, backgroundUrl, blocked, cutoutSrc, cutoutScale) {
  const bg = backgroundUrl
    ? ` style="background-image:url('${esc(backgroundUrl)}')"`
    : '';
  const cutout = cutoutSrc
    ? candidateImg(cutoutSrc, slug, cutoutScale || '')
    : '';
  const ghost = cutout
    ? ''
    : blocked
      ? `<div class="ghost blocked">${esc(slug)} · waiting for host signed URL</div>`
      : `<div class="ghost ${esc(scale || '')}">${esc(slug)}</div>`;
  return `<div class="scene-col" data-panel="${esc(letter)}">
      <p class="cap"><strong>${esc(letter)}.</strong> ${esc(label)}</p>
      <div class="scene ${className}${blocked ? ' is-blocked' : ''}"${bg}>${ghost}${cutout}</div>
    </div>`;
}

function candidateImg(src, slug, extraClass) {
  if (!src) return '';
  return `<img class="cutout ${esc(extraClass || '')}" src="${esc(src)}" alt="${esc(slug)} candidate" data-review-role="calibration-candidate" data-approval-status="candidate"/>`;
}

function candidateSrc(job, options, rel) {
  if (!job || !job.candidateRelPath) return '';
  const posix = String(job.candidateRelPath).replace(/\\/g, '/');
  const file = posix.split('/').pop();
  const bust = options.cacheBust ? `?v=${esc(options.cacheBust)}` : '';
  if (options.candidateBase) return `${options.candidateBase}${file}${bust}`;
  return `${rel(posix)}${bust}`;
}

function ownerVisualQaPanel(job) {
  const slug = esc(job.canonicalSlug);
  const fields = IN_GARDEN_REVIEW_FIELDS.map(
    (field) =>
      `<label class="field"><input type="checkbox" data-field="${esc(field)}"/> ${esc(field.toLowerCase().replace(/_/g, ' '))}</label>`
  ).join('');
  return `<aside class="owner-visual-qa" data-slug="${slug}" data-botanical-identity-qa="UNKNOWN" data-asset-qa="UNKNOWN">
  <p class="qa-split"><strong>OWNER_VISUAL_QA</strong> session-only · <strong>BOTANICAL_IDENTITY_QA</strong> UNKNOWN · <strong>ASSET_QA</strong> UNKNOWN</p>
  <p class="note">Visual verdict is not botanical identity and does not write the production registry. approvalStatus stays candidate.</p>
  <p class="note" data-owner-visual-status>OWNER_VISUAL_QA = UNREVIEWED. BOTANICAL_IDENTITY_QA = UNKNOWN. ASSET_QA = UNKNOWN. approvalStatus = candidate. Session-only.</p>
  <div class="verdicts" role="group" aria-label="Visual verdict">
    <button type="button" data-verdict="GOOD">GOOD</button>
    <button type="button" data-verdict="NEEDS_BLEND">NEEDS BLEND</button>
    <button type="button" data-verdict="REJECT">REJECT</button>
  </div>
  <div class="fields">${fields}</div>
</aside>`;
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
  const generatedCount = batch.filter((j) => j.candidateRelPath).length;
  const heading = generatedCount
    ? `Calibration review — ${batch.length} jobs, ${generatedCount} candidates for owner visual review`
    : 'Calibration review — 8 jobs, no generation';

  const cards = batch
    .map((job) => {
      const title = `${job.rank}. ${esc(job.canonicalSlug)} · ${esc(job.visualForm)} · ${esc(job.growthStage)}`;
      const cutout = candidateSrc(job, options, rel);
      const generated = Boolean(cutout);
      const status = generated
        ? 'Candidate binary: CANDIDATE ONLY. ASSET_QA = UNKNOWN. BOTANICAL_IDENTITY_QA = UNKNOWN. IN_GARDEN_QA = UNKNOWN. Owner visual review required. Do not auto-approve.'
        : 'Candidate binary: NOT GENERATED. ASSET_QA = UNKNOWN. IN_GARDEN_QA = BLOCKED until the real Garden photo loads.';
      return `<article class="job" id="job-${esc(job.canonicalSlug)}">
  <header>
    <h2>${title}</h2>
    <p class="meta">${esc(job.scientific || '')} · ${esc(job.identityPrecision)} · ${esc(job.variantKey)} · ${esc(job.priorityReason)}</p>
    <p class="why">${esc(job.whyUsefulForCalibration)}</p>
    <p class="empty" data-in-garden-status="${generated ? 'UNKNOWN' : 'BLOCKED'}" data-generated="${generated ? 'true' : 'false'}">${status}</p>
    ${generated ? ownerVisualQaPanel(job) : ''}
    <p class="meta">Review fields: ${esc(IN_GARDEN_REVIEW_FIELDS.join(', '))}. Approval: ASSET_QA = PASS AND IN_GARDEN_QA = PASS. IN_GARDEN_QA may be PASS only when the real persisted Garden photo was used. Owner visual acceptance is not botanical identity PASS.</p>
  </header>
  <div class="previews">
    ${sceneBlock('A', 'transparent / checkerboard', 'checkerboard-scene', '', job.canonicalSlug, '', false, cutout, '')}
  </div>
  <h3>Real Garden photo (host signed URL)</h3>
  <div class="scenes">
    ${sceneBlock('B', 'REAL Garden photo — small', 'real', 'small', job.canonicalSlug, '', true, cutout, 'small')}
    ${sceneBlock('C', 'REAL Garden photo — medium', 'real', 'medium', job.canonicalSlug, '', true, cutout, 'medium')}
    ${sceneBlock('D', 'REAL Garden photo — large plausible', 'real', 'large', job.canonicalSlug, '', true, cutout, 'large')}
  </div>
  <h3>Supplementary local scenes (not sufficient alone)</h3>
  <div class="scenes">
    ${sceneBlock('E', 'supplementary local scene 1', 'supp', 'medium', job.canonicalSlug, gardenE, false, cutout, 'medium')}
    ${sceneBlock('F', 'supplementary local scene 2', 'supp', 'medium', job.canonicalSlug, gardenF, false, cutout, 'medium')}
  </div>
  <h3>Raw vs runtime blend (experiment only, not permanent)</h3>
  <div class="raw-blend">
    <figure><figcaption>RAW</figcaption><div class="slot checkerboard">${cutout ? candidateImg(cutout, job.canonicalSlug, '') : '<span>empty</span>'}</div></figure>
    <figure><figcaption>RUNTIME BLEND</figcaption><div class="slot checkerboard ${cutout ? 'blend-slot' : ''}">${cutout ? candidateImg(cutout, job.canonicalSlug, 'blend') : '<span>CSS only · not baked · does not alter source photo</span>'}</div></figure>
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
    body { margin: 24px; background: #f4f1ea; padding-top: 56px; }
    .scene { width: 280px; height: 200px; background-size: cover; background-position: center; position: relative; border: 1px solid #ccc; background-color: #2a2a2a; overflow: hidden; }
    .scene.real { width: 420px; height: 300px; }
    .checkerboard-scene { width: 280px; height: 360px; }
    .scene img.cutout, .checkerboard-scene img.cutout { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%); max-height: 88%; max-width: 78%; object-fit: contain; object-position: bottom center; }
    .scene img.cutout.small { max-height: 34%; }
    .scene img.cutout.medium { max-height: 54%; }
    .scene img.cutout.large { max-height: 78%; }
    .owner-visual-qa { margin: 12px 0; padding: 12px; border: 1px solid #cbb; background: #fbf8f2; }
    .owner-visual-qa .verdicts { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .owner-visual-qa button { padding: 8px 12px; border: 1px solid #888; background: #fff; cursor: pointer; }
    .owner-visual-qa button[aria-pressed="true"] { background: #0f3d2e; color: #fff; border-color: #0f3d2e; }
    .owner-visual-qa .fields { display: flex; flex-wrap: wrap; gap: 8px 14px; }
    .owner-visual-qa .note, .qa-split { font-size: 13px; color: #444; }
    h1 { font-size: 22px; }
    .warn { background: #fde8e8; border: 1px solid #c44; padding: 12px 14px; }
    .ok { background: #e7f6e8; border: 1px solid #3a7; padding: 12px 14px; }
    .job { background: #fff; border: 1px solid #ddd; margin: 24px 0; padding: 16px; }
    .meta, .why, .empty, .cap { font-size: 13px; color: #444; }
    .empty { color: #8a2b2b; }
    .previews, .scenes, .raw-blend { display: flex; gap: 12px; flex-wrap: wrap; }
    .slot { width: 200px; height: 280px; display: flex; align-items: center; justify-content: center; color: #888; font-size: 12px; position: relative; overflow: hidden; }
    .checkerboard, .checkerboard-scene { background: repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 16px 16px; }
    .checkerboard-scene { border: 1px solid #ccc; position: relative; }
    .scene.is-blocked { outline: 2px solid #c44; }
    .ghost { position: absolute; left: 50%; bottom: 12%; transform: translateX(-50%); background: rgba(255,255,255,.55); padding: 4px 6px; font-size: 10px; }
    .ghost.small { width: 18%; height: 28%; }
    .ghost.medium { width: 28%; height: 44%; }
    .ghost.large { width: 40%; height: 62%; }
    .ghost.blocked { width: 80%; text-align: center; }
    .harness img.cutout { height: 55%; position: absolute; left: 52%; bottom: 10%; transform: translateX(-50%); }
    .slot img.cutout { position: absolute; left: 50%; bottom: 6%; transform: translateX(-50%); max-height: 88%; max-width: 80%; object-fit: contain; object-position: bottom center; }
    .slot.blend-slot img.cutout, .slot img.cutout.blend { filter: ${blendFilter}; }
    .harness.blend img.cutout { filter: ${blendFilter}; }
    .scene.harness { width: 280px; height: 180px; }
    code { font-size: 12px; }
    .owner-feedback { overflow: auto; }
    .owner-feedback table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .owner-feedback th, .owner-feedback td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
    .owner-feedback pre { white-space: pre-wrap; background: #111; color: #f4f1ea; padding: 12px; font-size: 12px; }
    #copy-owner-feedback-summary { margin: 8px 8px 8px 0; padding: 8px 12px; }
  </style>
</head>
<body>
  <h1>${esc(heading)}</h1>
  <p id="realGardenBanner" class="warn">Loading Garden context… Path: garden_designs.source_media_id → garden_media → private ${esc(
    SAVED_GARDEN_PHOTO_AUTHORITY.storageBucket
  )}. Local stand-ins are supplementary only. Do not copy the private photo into the repo. No Storage credentials in this page.</p>
  <p>Owner question: does this actually look like the plant is in my garden? Fields: ${esc(
    IN_GARDEN_REVIEW_FIELDS.join(', ')
  )}.</p>
  <section class="job owner-feedback" id="owner-feedback-summary">
    <h2>Owner review summary</h2>
    <p class="note">Reads the current <code>cruvit:calibration-batch-1-owner-visual-qa</code> sessionStorage record. Does not clear it. Does not write the production registry. OWNER_VISUAL_QA from this session is valid. IN_GARDEN_QA is INVALID_FOR_THIS_SESSION unless a signed Garden photo loaded.</p>
    <p>
      <button type="button" id="copy-owner-feedback-summary">Copy review summary</button>
      <span id="owner-feedback-copy-status"></span>
    </p>
    <table>
      <thead>
        <tr>
          <th>canonicalSlug</th>
          <th>OWNER_VISUAL_QA</th>
          <th>checked fields</th>
          <th>BOTANICAL_IDENTITY_QA</th>
          <th>ASSET_QA</th>
          <th>IN_GARDEN_QA</th>
        </tr>
      </thead>
      <tbody id="owner-feedback-table-body"></tbody>
    </table>
    <h3>Proposed prompt correction map</h3>
    <p id="owner-feedback-prompt-map" class="note">Derived only from actual checked fields. Do not regenerate yet.</p>
    <h3>Machine-readable summary</h3>
    <pre id="owner-feedback-json">{}</pre>
  </section>
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
        document.documentElement.setAttribute('data-calibration-ui-status', 'REAL_GARDEN_SOURCE_LOADED');
        document.querySelectorAll('.scene.real').forEach(function (el) {
          el.style.backgroundImage = 'url(' + JSON.stringify(url) + ')';
          el.classList.remove('is-blocked');
          var ghost = el.querySelector('.ghost');
          if (ghost && !el.querySelector('img.cutout')) {
            ghost.classList.remove('blocked');
            ghost.textContent = 'Candidate not generated yet';
          }
        });
        var banner = document.getElementById('realGardenBanner');
        if (banner) {
          banner.className = 'ok';
          banner.textContent = 'Real saved Garden Design source photo loaded via temporary signed URL. Bytes were not copied into the repo.';
        }
        document.querySelectorAll('[data-in-garden-status]').forEach(function (el) {
          el.setAttribute('data-in-garden-status', 'UNKNOWN');
          if (el.getAttribute('data-generated') === 'true') return;
          el.textContent = 'Candidate not generated yet. ASSET_QA = UNKNOWN. IN_GARDEN_QA = UNKNOWN.';
        });
        return true;
      }
      function applyUiStatus(d) {
        var status = (d && (d.uiStatus || d.code)) || '';
        if (status) document.documentElement.setAttribute('data-calibration-ui-status', status);
        if (d && d.sourceMediaUrl && applySignedUrl(d.sourceMediaUrl)) return;
        var banner = document.getElementById('realGardenBanner');
        if (!banner) return;
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
        if (status !== 'REAL_GARDEN_SOURCE_LOADED') {
          document.querySelectorAll('[data-in-garden-status]').forEach(function (el) {
            el.setAttribute('data-in-garden-status', 'INVALID_FOR_THIS_SESSION');
            if (el.getAttribute('data-generated') === 'true') {
              el.textContent = 'Candidate binary: CANDIDATE ONLY. ASSET_QA = UNKNOWN. BOTANICAL_IDENTITY_QA = UNKNOWN. IN_GARDEN_QA = INVALID_FOR_THIS_SESSION. OWNER_VISUAL_QA remains valid. Do not score IN_GARDEN_QA from black B/C/D panels.';
            }
          });
        }
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
  <script type="module" src="asset-factory-v1/calibration-owner-visual-qa-v1.js?v=${CALIBRATION_BATCH_1_CACHE_BUST}"></script>
</body>
</html>`;
}

export function attachExistingCalibrationCandidates(batch = [], root = process.cwd()) {
  return (Array.isArray(batch) ? batch : []).map((job) => {
    const row = CALIBRATION_BATCH_1_CANDIDATES.find((c) => c.canonicalSlug === job.canonicalSlug);
    if (!row) return job;
    const relPath = calibrationCandidateRepoPath(row.file);
    const abs = path.join(root, ...relPath.split('/'));
    if (!fs.existsSync(abs)) return job;
    return {
      ...job,
      candidateRelPath: relPath,
      generated: true,
      assetQa: job.assetQa || 'UNKNOWN',
      inGardenQa: job.inGardenQa || 'UNKNOWN'
    };
  });
}

export function writeCalibrationReviewSheet(root, batch, options = {}) {
  const withCandidates = attachExistingCalibrationCandidates(batch, root);
  const liveHtml = buildCalibrationReviewHtml(withCandidates, {
    ...options,
    assetPrefix: '../../',
    candidateBase: CALIBRATION_BATCH_1_LIVE_BASE,
    cacheBust: CALIBRATION_BATCH_1_CACHE_BUST
  });
  const dataHtml = buildCalibrationReviewHtml(withCandidates, {
    ...options,
    assetPrefix: '../../../',
    candidateBase: `../../../${CALIBRATION_BATCH_1_LIVE_BASE.replace(/^assets/, 'modules/garden-design/assets')}`,
    cacheBust: CALIBRATION_BATCH_1_CACHE_BUST
  });
  const dir = path.join(root, 'data', 'garden-design', 'calibration-batch-1');
  fs.mkdirSync(dir, { recursive: true });
  const htmlPath = path.join(dir, 'owner-review.html');
  fs.writeFileSync(htmlPath, dataHtml);
  const livePath = path.join(root, ...CALIBRATION_REVIEW_LIVE_REL.split('/'));
  fs.mkdirSync(path.dirname(livePath), { recursive: true });
  fs.writeFileSync(livePath, liveHtml);
  return {
    htmlPath,
    livePath,
    readiness: classifyCalibrationReviewReadiness(options.savedGardenPhoto || {})
  };
}
