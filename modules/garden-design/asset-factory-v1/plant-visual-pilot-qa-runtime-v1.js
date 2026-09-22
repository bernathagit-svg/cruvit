import { buildProductionRendererQaPreview, resolveCompatibleSavedPlacementAnchor } from './production-renderer-qa-preview-v1.js';

const CALIBRATION_SOURCE_MESSAGE_TYPE = 'cruvit:calibration-garden-source';

const DEFAULT_MANIFEST_ID = 'pilot-2026-09-21-v1';
const DEFAULT_ANCHOR_REGISTRY_URL = '../../data/garden-design/garden-design-qa-saved-placement-anchor-registry-v1.json?v=20260921a';

function safeManifestId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id) ? id : DEFAULT_MANIFEST_ID;
}

const PARAMS = new URLSearchParams(window.location.search);
const MANIFEST_ID = safeManifestId(PARAMS.get('manifest'));
const IN_GARDEN_CAPTURE_RUN = String(PARAMS.get('inGardenCaptureRun') || '').trim();
const AUTO_BLEND_REVIEW = PARAMS.get('autoBlendReview') === '1';
const SUMMARY_URL = '../../data/garden-design/plant-visual-qa-manifests/' + MANIFEST_ID + '.json?v=20260921a';
const ANCHOR_REGISTRY_URL = DEFAULT_ANCHOR_REGISTRY_URL;
const IMAGE_URL = (jobId) =>
  '/.netlify/functions/plant-visual-qa-candidate?manifest='
  + encodeURIComponent(MANIFEST_ID)
  + '&job='
  + encodeURIComponent(jobId);
const STORAGE_KEY = 'cruvit:plant-visual-qa-review-v1:' + MANIFEST_ID;
const CAPTURE_PLAN_URL = IN_GARDEN_CAPTURE_RUN
  ? '../../data/garden-design/plant-visual-in-garden-model-qa-plans/' + encodeURIComponent(IN_GARDEN_CAPTURE_RUN) + '.json?v=20260922a'
  : null;
const CAPTURE_STORE_URL = '/.netlify/functions/plant-visual-in-garden-capture-store';
const CAPTURE_STATUS_URL = '/.netlify/functions/plant-visual-in-garden-capture-status';
const OWNER_CHOICES = Object.freeze([
  'PASS_OWNER_VISUAL_GATES',
  'NEEDS_REGENERATION',
  'REJECT_IDENTITY_OR_STATE'
]);

let qaRows = [];
let reviewRows = [];
let rowsById = new Map();
const SHOW_ALL = new URLSearchParams(window.location.search).get('showAll') === '1';
let sourceMediaUrl = '';
let selectedJobId = '';
let rendererReady = false;
let anchorRegistry = { records: [] };
let capturePlan = null;
let captureStarted = false;
let captureFinished = false;
const captureWaiters = new Map();
let qaAutoBlendEnabled = false;
let qaAutoBlendLastResult = null;
const qaBlendWaiters = new Map();
let qaBlendCompareRunning = false;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.choices = parsed.choices && typeof parsed.choices === 'object' ? parsed.choices : {};
    return parsed;
  } catch {
    return { choices: {} };
  }
}

function saveState(state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function choiceLabel(choice) {
  if (choice === 'PASS_OWNER_VISUAL_GATES') return 'PASS — identity/state/in-garden look correct';
  if (choice === 'NEEDS_REGENERATION') return 'Needs regeneration';
  if (choice === 'REJECT_IDENTITY_OR_STATE') return 'Wrong identity/state';
  return 'No owner decision';
}

function titleCaseSlug(value) {
  return String(value || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function rowTitle(row) {
  const name = row.displayName || row.commonName || titleCaseSlug(row.canonicalSlug) || row.jobId || 'Plant';
  const stage = row.growthStage && row.growthStage !== 'unspecified' ? row.growthStage : '';
  const phenology = row.phenology || row.phenologyState || '';
  const suffix = [stage, phenology].filter(Boolean).join(' ');
  return suffix ? name + ' — ' + suffix : name;
}

function reviewFields(row) {
  return [
    ['TECHNICAL_QA', row.technicalQA],
    ['FRAMING_QA', row.framingQA],
    ['BOTANICAL_IDENTITY_QA', row.botanicalIdentityQA],
    ['ARCHITECTURE_QA', row.architectureQA],
    ['GROWTH_STAGE_QA', row.growthStageQA],
    ['PHENOLOGY_STATE_QA', row.phenologyStateQA],
    ['IN_GARDEN_QA', row.inGardenQA],
    ['SOURCE_STATUS', row.sourceStatus]
  ];
}

function sectionHtml(row, index) {
  const recovered = row.sourceStatus === 'RECOVERED_EVIDENCE_MISMATCH';
  const sourceNote = recovered
    ? '<p class="warn-mini">Recovered candidate: current R2 bytes differ from the earlier evidence record. Treat this as a fresh owner visual review. It is NOT production-approved.</p>'
    : '<p class="ok-mini">Candidate bytes match the migration evidence and SHA record.</p>';
  return `<section class="plant" data-job-id="${esc(row.jobId)}">
    <h2>${index + 1}. ${esc(rowTitle(row))}</h2>
    <p class="meta">${esc(row.scientific)} · ${esc(row.architectureMode)} · ${esc(row.growthStage)} · ${esc(row.phenology)}</p>
    ${sourceNote}
    <div class="candidate-grid">
      <div class="card">
        <h3>Native candidate</h3>
        <div class="native checkerboard"><img src="${esc(IMAGE_URL(row.jobId))}" alt="${esc(rowTitle(row))} candidate"></div>
      </div>
      <div class="card qa-card">
        <h3>QA evidence</h3>
        <ul>${reviewFields(row).map(([k,v]) => '<li><strong>'+esc(k)+'</strong>: '+esc(v)+'</li>').join('')}</ul>
        <button type="button" class="preview-btn" data-preview-job="${esc(row.jobId)}">Preview in production Garden Design renderer</button>
        <p class="small">The in-garden preview above is rendered by the real Garden Design renderer. This section does not maintain its own scale system.</p>
      </div>
    </div>
    <div class="choices">
      <button data-owner-choice="PASS_OWNER_VISUAL_GATES" data-job-id="${esc(row.jobId)}">PASS visual gates</button>
      <button data-owner-choice="NEEDS_REGENERATION" data-job-id="${esc(row.jobId)}">Needs regeneration</button>
      <button data-owner-choice="REJECT_IDENTITY_OR_STATE" data-job-id="${esc(row.jobId)}">Wrong identity/state</button>
      <span class="choice-status" data-choice-status="${esc(row.jobId)}">No owner decision</span>
    </div>
  </section>`;
}

function renderChoiceState() {
  const state = loadState();
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    const jobId = btn.getAttribute('data-job-id');
    const choice = btn.getAttribute('data-owner-choice');
    btn.setAttribute('aria-pressed', state.choices[jobId] === choice ? 'true' : 'false');
  });
  document.querySelectorAll('[data-choice-status]').forEach((el) => {
    const jobId = el.getAttribute('data-choice-status');
    el.textContent = choiceLabel(state.choices[jobId]);
  });
  const decisions = Object.values(state.choices).filter(Boolean).length;
  const summary = document.getElementById('ownerDecisionSummary');
  if (summary) summary.textContent =
    decisions + ' / ' + reviewRows.length
    + ' owner decisions recorded · '
    + qaRows.length + ' total jobs in manifest'
    + (SHOW_ALL ? ' · audit view' : ' · exception-only view');
}

function wireChoices() {
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id');
      const choice = btn.getAttribute('data-owner-choice');
      if (!jobId || !OWNER_CHOICES.includes(choice)) return;
      const state = loadState();
      state.choices[jobId] = state.choices[jobId] === choice ? null : choice;
      saveState(state);
      renderChoiceState();
    });
  });
  renderChoiceState();
}

function rendererFrame() {
  return document.getElementById('productionRendererFrame');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureAutoBlendReviewShortcut() {
  if (MANIFEST_ID === 'wave1-owner-review-2026-09-22-v1') return null;
  let wrap = document.getElementById('autoBlendReviewShortcut');
  if (wrap) return wrap;
  wrap = document.createElement('div');
  wrap.id = 'autoBlendReviewShortcut';
  wrap.className = 'ok';
  wrap.style.display = 'none';
  wrap.style.margin = '10px 0';
  wrap.innerHTML = '<strong>In-Garden capture is complete.</strong> '
    + '<button type="button" id="openAutoBlendReviewShortcut" '
    + 'style="margin-left:8px;font-weight:700">Open Auto Blend Review (7)</button>';
  const panel = document.getElementById('rendererPanel');
  if (panel) panel.insertBefore(wrap, panel.firstChild);
  const btn = wrap.querySelector('#openAutoBlendReviewShortcut');
  if (btn) {
    btn.addEventListener('click', () => {
      const url = new URL(window.top.location.href);
      url.searchParams.set('plantVisualQaManifest', 'wave1-owner-review-2026-09-22-v1');
      url.searchParams.set('plantVisualQaAutoBlend', '1');
      url.searchParams.delete('inGardenCaptureRun');
      url.hash = '#plant-visual-pilot-qa-v1';
      window.top.location.href = url.toString();
    });
  }
  return wrap;
}

function showAutoBlendReviewShortcut() {
  const wrap = ensureAutoBlendReviewShortcut();
  if (wrap) wrap.style.display = '';
}

function captureStatusEl() {
  let el = document.getElementById('inGardenCaptureStatus');
  if (el) return el;
  el = document.createElement('p');
  el.id = 'inGardenCaptureStatus';
  el.className = 'warn';
  const panel = document.getElementById('rendererPanel');
  if (panel) panel.insertBefore(el, panel.firstChild);
  return el;
}

function setCaptureStatus(text, ok) {
  const el = captureStatusEl();
  if (!el) return;
  el.textContent = text;
  el.className = ok ? 'ok' : 'warn';
}

function requestRendererCapture(jobId) {
  return new Promise((resolve, reject) => {
    const frame = rendererFrame();
    if (!frame?.contentWindow) return reject(new Error('RENDERER_NOT_READY'));
    const requestId = 'igcap_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      captureWaiters.delete(requestId);
      reject(new Error('QA_CAPTURE_TIMEOUT'));
    }, 20000);
    captureWaiters.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); }
    });
    frame.contentWindow.postMessage({
      type: 'cruvit:garden-design-qa-capture-request',
      requestId,
      jobId
    }, window.location.origin);
  });
}

async function storeRendererCapture(jobId, result) {
  const res = await fetch(CAPTURE_STORE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      runId: IN_GARDEN_CAPTURE_RUN,
      jobId,
      imageBase64: result.imageBase64,
      mimeType: result.mimeType || 'image/jpeg',
      geometry: result.geometry || null,
      realSavedGardenPhotoUsed: Boolean(sourceMediaUrl)
    })
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!res.ok || !data?.ok) {
    const err = new Error(data?.code || ('CAPTURE_STORE_' + res.status));
    err.payload = data;
    throw err;
  }
  return data;
}

async function runInGardenCaptureBatch() {
  if (captureStarted || captureFinished || !IN_GARDEN_CAPTURE_RUN || !capturePlan) return;
  if (!sourceMediaUrl || !rendererReady) return;
  captureStarted = true;
  const allJobs = Array.isArray(capturePlan.jobs) ? capturePlan.jobs : [];
  let capturedJobIds = new Set();
  try {
    const statusRes = await fetch(CAPTURE_STATUS_URL + '?runId=' + encodeURIComponent(IN_GARDEN_CAPTURE_RUN), { cache: 'no-store' });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      capturedJobIds = new Set(
        Array.isArray(statusData?.rows)
          ? statusData.rows.filter((row) => row?.status === 'CAPTURED').map((row) => row.jobId)
          : []
      );
    }
  } catch (err) {
    console.warn('[in-garden-capture-status]', err?.message || err);
  }
  const jobs = allJobs.filter((job) => !capturedJobIds.has(job.jobId));
  const alreadyCaptured = allJobs.length - jobs.length;
  let stored = 0;
  let failed = 0;
  if (!jobs.length) {
    captureFinished = true;
    captureStarted = false;
    setCaptureStatus('In-Garden capture already complete · ' + alreadyCaptured + ' / ' + allJobs.length + ' stored · zero paid AI calls.', true);
    showAutoBlendReviewShortcut();
    return;
  }
  setCaptureStatus('In-Garden capture resume · ' + alreadyCaptured + ' already stored · ' + jobs.length + ' remaining.', false);

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    if (!rowsById.has(job.jobId)) {
      failed += 1;
      continue;
    }
    selectedJobId = job.jobId;
    updateSelectedUi();
    sendRendererPreview();
    setCaptureStatus(
      'In-Garden capture · ' + (alreadyCaptured + i + 1) + ' / ' + allJobs.length + ' · ' + rowTitle(rowsById.get(job.jobId)),
      false
    );
    await sleep(900);
    try {
      const capture = await requestRendererCapture(job.jobId);
      if (!capture?.ok || !capture.imageBase64) throw new Error(capture?.code || 'QA_CAPTURE_FAILED');
      await storeRendererCapture(job.jobId, capture);
      stored += 1;
    } catch (err) {
      failed += 1;
      console.warn('[in-garden-capture]', job.jobId, err?.message || err);
    }
    await sleep(300);
  }

  captureFinished = true;
  captureStarted = false;
  setCaptureStatus(
    'In-Garden capture complete · ' + (alreadyCaptured + stored) + ' / ' + allJobs.length + ' stored · ' + failed + ' failed · zero paid AI calls.',
    failed === 0 && (alreadyCaptured + stored) === allJobs.length
  );
  if (failed === 0 && (alreadyCaptured + stored) === allJobs.length) showAutoBlendReviewShortcut();
}

function maybeStartInGardenCapture() {
  if (!IN_GARDEN_CAPTURE_RUN || !capturePlan || !sourceMediaUrl || !rendererReady) return;
  setTimeout(() => { runInGardenCaptureBatch(); }, 100);
}


function blendControls() {
  return {
    root: document.getElementById('blendReviewControls'),
    raw: document.getElementById('blendRawBtn'),
    auto: document.getElementById('blendAutoBtn'),
    readout: document.getElementById('blendReviewReadout'),
    compare: document.getElementById('blendCompareBtn'),
    comparePanel: document.getElementById('blendCompare'),
    compareRawImg: document.getElementById('blendCompareRawImg'),
    compareAutoImg: document.getElementById('blendCompareAutoImg')
  };
}

function formatBlendReadout(blend) {
  const a = blend?.adaptation || {};
  const sh = blend?.shadow || {};
  const fmt = (v, d = 2) => Number.isFinite(Number(v)) ? Number(v).toFixed(d) : '—';
  if (!blend || blend.enabled !== true) return 'RAW candidate · no runtime matching applied.';
  const dl = blend.directionalLighting || {};
  const gs = blend.groundSpill || {};
  return (blend.version === 'garden-design-auto-blend-v3'
      ? 'V3 directional plant↔scene matched'
      : (blend.version === 'garden-design-auto-blend-v2'
          ? 'V2 plant↔scene matched'
          : (blend.source === 'local-scene-sample' ? 'Scene matched' : 'Blend active')))
    + ' · brightness ' + fmt(a.brightness)
    + ' · contrast ' + fmt(a.contrast)
    + ' · saturation ' + fmt(a.saturate)
    + ' · blur ' + fmt(a.blurPx) + 'px'
    + ' · temp ' + fmt(a.hueRotateDeg, 1) + '°'
    + ' · edge ' + fmt(a.edgeTintAlpha)
    + ' · light ' + fmt(dl.angleDeg, 0) + '°'
    + ' · ground ' + fmt(gs.colorAlpha)
    + ' · shadow ' + fmt(sh.opacity);
}

function updateBlendControls() {
  const ui = blendControls();
  if (!ui.root) return;
  ui.root.classList.toggle('is-visible', AUTO_BLEND_REVIEW);
  if (!AUTO_BLEND_REVIEW) return;
  ui.raw?.classList.toggle('is-active', !qaAutoBlendEnabled);
  ui.auto?.classList.toggle('is-active', qaAutoBlendEnabled);
  if (ui.readout) ui.readout.textContent = qaAutoBlendEnabled
    ? formatBlendReadout(qaAutoBlendLastResult?.blend)
    : 'RAW candidate · no runtime matching applied.';
}

function requestQaAutoBlend(enabled) {
  return new Promise((resolve, reject) => {
    if (!AUTO_BLEND_REVIEW || !rendererReady) return reject(new Error('QA_BLEND_REVIEW_NOT_READY'));
    const frame = rendererFrame();
    if (!frame?.contentWindow) return reject(new Error('RENDERER_NOT_READY'));
    const requestId = 'qab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      qaBlendWaiters.delete(requestId);
      reject(new Error('QA_AUTO_BLEND_TIMEOUT'));
    }, 15000);
    qaBlendWaiters.set(requestId, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (err) => { clearTimeout(timer); reject(err); }
    });
    frame.contentWindow.postMessage({
      type:'cruvit:garden-design-qa-auto-blend-set',
      requestId,
      enabled:enabled === true
    }, window.location.origin);
  });
}

function sendQaAutoBlendState() {
  if (!AUTO_BLEND_REVIEW || !rendererReady) return false;
  const ui = blendControls();
  if (ui.readout) ui.readout.textContent = qaAutoBlendEnabled ? 'Matching local scene…' : 'Returning to RAW…';
  requestQaAutoBlend(qaAutoBlendEnabled)
    .catch((err) => {
      if (ui.readout) ui.readout.textContent = 'Auto Blend unavailable · ' + String(err?.message || err);
    });
  return true;
}

function setQaAutoBlend(enabled) {
  if (!AUTO_BLEND_REVIEW) return;
  qaAutoBlendEnabled = enabled === true;
  qaAutoBlendLastResult = null;
  updateBlendControls();
  sendQaAutoBlendState();
}

async function compareRawVsAutoBlend() {
  if (!AUTO_BLEND_REVIEW || qaBlendCompareRunning || !selectedJobId) return;
  const ui = blendControls();
  qaBlendCompareRunning = true;
  if (ui.compare) {
    ui.compare.disabled = true;
    ui.compare.textContent = 'Building comparison…';
  }
  if (ui.readout) ui.readout.textContent = 'Capturing RAW and AUTO BLEND from the same production renderer…';
  try {
    qaAutoBlendEnabled = false;
    updateBlendControls();
    await requestQaAutoBlend(false);
    await sleep(220);
    const raw = await requestRendererCapture(selectedJobId);
    if (!raw?.ok || !raw.imageBase64) throw new Error(raw?.code || 'RAW_CAPTURE_FAILED');

    qaAutoBlendEnabled = true;
    updateBlendControls();
    const blendResult = await requestQaAutoBlend(true);
    qaAutoBlendLastResult = blendResult;
    await sleep(260);
    const blended = await requestRendererCapture(selectedJobId);
    if (!blended?.ok || !blended.imageBase64) throw new Error(blended?.code || 'BLEND_CAPTURE_FAILED');

    if (ui.compareRawImg) ui.compareRawImg.src = 'data:image/jpeg;base64,' + raw.imageBase64;
    if (ui.compareAutoImg) ui.compareAutoImg.src = 'data:image/jpeg;base64,' + blended.imageBase64;
    ui.comparePanel?.classList.add('is-visible');
    if (ui.readout) ui.readout.textContent = formatBlendReadout(blendResult?.blend);
    updateBlendControls();
  } catch (err) {
    if (ui.readout) ui.readout.textContent = 'Comparison failed · ' + String(err?.message || err);
  } finally {
    qaBlendCompareRunning = false;
    if (ui.compare) {
      ui.compare.disabled = false;
      ui.compare.textContent = 'Compare RAW vs AUTO BLEND';
    }
  }
}

function wireBlendReviewControls() {
  const ui = blendControls();
  if (!ui.root) return;
  ui.root.classList.toggle('is-visible', AUTO_BLEND_REVIEW);
  if (!AUTO_BLEND_REVIEW) return;
  ui.raw?.addEventListener('click', () => setQaAutoBlend(false));
  ui.auto?.addEventListener('click', () => setQaAutoBlend(true));
  ui.compare?.addEventListener('click', compareRawVsAutoBlend);
  updateBlendControls();
}

function markRendererReady(source) {
  rendererReady = true;
  const status = document.getElementById('rendererStatus');
  if (status) {
    status.className = 'ok';
    status.textContent = 'Production Garden Design renderer ready (read-only QA mode) · ' + source;
  }
  sendRendererPreview();
  maybeStartInGardenCapture();
}

function installRendererHandshake() {
  const frame = rendererFrame();
  if (!frame) return;

  frame.addEventListener('load', () => {
    // A full iframe load means the production document and its scripts are
    // available. Do not depend solely on an early postMessage READY event.
    setTimeout(() => markRendererReady('iframe-load'), 0);
  });

  try {
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') {
      setTimeout(() => markRendererReady('already-loaded'), 0);
    }
  } catch (_) {}

  // Bounded retries cover browser/cache timing without any persistence/write.
  [250, 750, 1500, 3000].forEach((delay) => {
    setTimeout(() => {
      if (!rendererReady) return;
      sendRendererPreview();
    }, delay);
  });
}

function updateSelectedUi() {
  document.querySelectorAll('[data-preview-job]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-preview-job') === selectedJobId ? 'true' : 'false');
  });
  const label = document.getElementById('rendererSelection');
  const row = rowsById.get(selectedJobId);
  if (label) {
    label.textContent = row ? 'Previewing: ' + rowTitle(row) : 'Choose a candidate below.';
  }
}

function sendRendererPreview() {
  if (!rendererReady || !sourceMediaUrl || !selectedJobId) return false;
  const row = rowsById.get(selectedJobId);
  const frame = rendererFrame();
  if (!row || !frame?.contentWindow) return false;

  const compatibleAnchor = resolveCompatibleSavedPlacementAnchor(row, anchorRegistry);
  const preview = buildProductionRendererQaPreview(row, {
    savedPlacementAnchor: compatibleAnchor
  });
  if (!preview.ok) {
    const status = document.getElementById('rendererStatus');
    if (status) {
      status.className = 'warn';
      status.textContent = 'Production renderer preview blocked: ' + preview.code;
    }
    return false;
  }

  const imageUrl = new URL(IMAGE_URL(selectedJobId), window.location.origin).href;
  frame.contentWindow.postMessage({
    type: 'cruvit:garden-design-qa-preview',
    sourceMediaUrl,
    imageUrl,
    jobId: row.jobId,
    label: rowTitle(row),
    canonicalSlug: preview.canonicalSlug,
    scientific: preview.scientific,
    visualForm: preview.visualForm,
    architectureMode: preview.architectureMode,
    growthStage: preview.growthStage,
    targetGrowthStage: preview.growthStage,
    phenology: preview.phenology,
    width: preview.width,
    height: preview.height,
    baseWidthPx: preview.baseWidthPx,
    scale: preview.scale,
    x: preview.x,
    y: preview.y,
    rotation: preview.rotation,
    authorityUserResized: preview.authorityUserResized
  }, window.location.origin);

  const status = document.getElementById('rendererStatus');
  if (status) {
    status.className = 'ok';
    status.textContent =
      'Production Garden Design renderer ready · input source: '
      + preview.source
      + ' · baseWidthPx '
      + preview.baseWidthPx
      + ' · scale '
      + preview.scale;
  }
  if (AUTO_BLEND_REVIEW) {
    setTimeout(() => sendQaAutoBlendState(), 350);
  }
  return true;
}

function selectPreview(jobId) {
  if (!rowsById.has(jobId)) return;
  selectedJobId = jobId;
  const ui = blendControls();
  ui.comparePanel?.classList.remove('is-visible');
  updateSelectedUi();
  sendRendererPreview();
  const panel = document.getElementById('rendererPanel');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wirePreviewButtons() {
  document.querySelectorAll('[data-preview-job]').forEach((btn) => {
    btn.addEventListener('click', () => selectPreview(btn.getAttribute('data-preview-job')));
  });
  updateSelectedUi();
}

function applySignedGardenUrl(url) {
  if (!url) return false;
  sourceMediaUrl = String(url);
  const banner = document.getElementById('gardenBanner');
  if (banner) {
    banner.className = 'ok';
    banner.textContent = 'Real saved Garden Design source photo loaded via temporary signed URL. Production renderer QA is ready.';
  }
  sendRendererPreview();
  maybeStartInGardenCapture();
  return true;
}

window.addEventListener('message', (ev) => {
  const d = ev && ev.data;
  const frame = rendererFrame();

  if (frame && ev.source === frame.contentWindow && d?.type === 'cruvit:garden-design-ready') {
    markRendererReady('ready-message');
    return;
  }

  if (frame && ev.source === frame.contentWindow && d?.type === 'cruvit:garden-design-qa-capture-result') {
    const waiter = captureWaiters.get(d.requestId);
    if (waiter) {
      captureWaiters.delete(d.requestId);
      if (d.ok) waiter.resolve(d);
      else waiter.reject(new Error(d.code || 'QA_CAPTURE_FAILED'));
    }
    return;
  }

  if (frame && ev.source === frame.contentWindow && d?.type === 'cruvit:garden-design-qa-auto-blend-result') {
    const waiter = qaBlendWaiters.get(d.requestId);
    if (waiter) {
      qaBlendWaiters.delete(d.requestId);
      if (d.ok) waiter.resolve(d);
      else waiter.reject(new Error(d.code || 'QA_AUTO_BLEND_FAILED'));
    }
    qaAutoBlendLastResult = d;
    if (d.ok) qaAutoBlendEnabled = d.enabled === true;
    const ui = blendControls();
    if (ui.readout) {
      ui.readout.textContent = d.ok
        ? formatBlendReadout(d.blend)
        : ('Auto Blend unavailable · ' + (d.code || 'unknown'));
    }
    updateBlendControls();
    return;
  }

  if (!d || d.type !== CALIBRATION_SOURCE_MESSAGE_TYPE) return;
  if (d.sourceMediaUrl) applySignedGardenUrl(d.sourceMediaUrl);
});

async function boot() {
  const status = document.getElementById('qaLoadStatus');
  try {
    const [summaryRes, anchorRes, capturePlanRes] = await Promise.all([
      fetch(SUMMARY_URL, { cache: 'no-store' }),
      fetch(ANCHOR_REGISTRY_URL, { cache: 'no-store' }),
      CAPTURE_PLAN_URL ? fetch(CAPTURE_PLAN_URL, { cache: 'no-store' }) : Promise.resolve(null)
    ]);
    const data = await summaryRes.json();
    if (!summaryRes.ok || !data || !Array.isArray(data.rows)) {
      throw new Error(data?.verdict || data?.code || 'QA_SUMMARY_LOAD_FAILED');
    }
    try {
      if (anchorRes.ok) {
        const parsedAnchors = await anchorRes.json();
        if (parsedAnchors && Array.isArray(parsedAnchors.records)) anchorRegistry = parsedAnchors;
      }
    } catch {
      anchorRegistry = { records: [] };
    }
    if (capturePlanRes && capturePlanRes.ok) {
      try {
        const parsedCapturePlan = await capturePlanRes.json();
        if (parsedCapturePlan && Array.isArray(parsedCapturePlan.jobs)) capturePlan = parsedCapturePlan;
      } catch (_) {
        capturePlan = null;
      }
    }
    qaRows = data.rows;
    reviewRows = SHOW_ALL
      ? qaRows
      : qaRows.filter((row) => row.ownerReviewRequired !== false);
    rowsById = new Map(qaRows.map((row) => [row.jobId, row]));
    selectedJobId = reviewRows[0]?.jobId || '';
    const root = document.getElementById('qaRows');
    root.innerHTML = reviewRows.length
      ? reviewRows.map(sectionHtml).join('')
      : '<section class="plant"><h2>No owner-review exceptions</h2><p class="small">All jobs in this manifest cleared the automated gates configured for this batch.</p></section>';
    status.textContent = 'R2 candidates loaded. Automated Technical/Framing QA completed with zero paid AI calls.';
    status.className = qaRows.every((r) => r.technicalQA === 'PASS' && r.framingQA === 'PASS') ? 'ok' : 'warn';
    wireChoices();
    wirePreviewButtons();
    wireBlendReviewControls();
    installRendererHandshake();
    if (IN_GARDEN_CAPTURE_RUN) {
      setCaptureStatus('Waiting for authenticated saved Garden photo and production renderer…', false);
      maybeStartInGardenCapture();
    }
  } catch (err) {
    status.textContent = 'QA load failed: ' + String(err?.message || err);
    status.className = 'warn';
  }
}

boot();
