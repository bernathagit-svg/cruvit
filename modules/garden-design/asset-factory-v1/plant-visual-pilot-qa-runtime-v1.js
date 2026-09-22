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
  const jobs = Array.isArray(capturePlan.jobs) ? capturePlan.jobs : [];
  let stored = 0;
  let failed = 0;
  setCaptureStatus('In-Garden capture starting · 0 / ' + jobs.length, false);

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
      'In-Garden capture · ' + (i + 1) + ' / ' + jobs.length + ' · ' + rowTitle(rowsById.get(job.jobId)),
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
    'In-Garden capture complete · ' + stored + ' stored · ' + failed + ' failed · zero paid AI calls.',
    failed === 0
  );
}

function maybeStartInGardenCapture() {
  if (!IN_GARDEN_CAPTURE_RUN || !capturePlan || !sourceMediaUrl || !rendererReady) return;
  setTimeout(() => { runInGardenCaptureBatch(); }, 100);
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
  return true;
}

function selectPreview(jobId) {
  if (!rowsById.has(jobId)) return;
  selectedJobId = jobId;
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
