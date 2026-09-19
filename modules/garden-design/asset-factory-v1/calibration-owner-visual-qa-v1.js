/**
 * Session-only owner visual QA controls for calibration review.
 * Reads existing sessionStorage; does not clear or overwrite on load.
 * Does not write the production registry. Does not generate images.
 */
import {
  OWNER_VISUAL_QA_STORAGE_KEY,
  LEARNING_CLASS_STORAGE_KEY,
  applyOwnerVisualField,
  applyOwnerVisualVerdict,
  applyRound1Class,
  applyCompositionV2Class,
  buildOwnerFeedbackSummary,
  buildRound1FinalSnapshot,
  derivePromptFactoryV2Learning,
  loadOwnerVisualQa,
  reconcileOwnerFeedbackIntegrity,
  saveOwnerVisualQa
} from './calibration-review-candidates-v1.js';

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function currentUiStatus(doc) {
  const root = doc && doc.documentElement;
  return (root && root.getAttribute('data-calibration-ui-status')) || '';
}

function gardenPhotoLoaded(doc) {
  return currentUiStatus(doc) === 'REAL_GARDEN_SOURCE_LOADED';
}

function syncClassificationGate(doc) {
  const ready = gardenPhotoLoaded(doc);
  doc.querySelectorAll('[data-learning-class], [data-composition-v2-class]').forEach((btn) => {
    btn.disabled = !ready;
    btn.title = ready
      ? 'Classification only. Not production approval.'
      : 'Wait for REAL_GARDEN_SOURCE_LOADED. Do not classify on black B/C/D panels.';
  });
}

function paint(root, record, doc) {
  if (!root) return;
  const verdict = record && record.OWNER_VISUAL_QA;
  root.querySelectorAll('[data-verdict]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-verdict') === verdict ? 'true' : 'false');
  });
  const fields = (record && record.fields) || {};
  root.querySelectorAll('[data-field]').forEach((input) => {
    input.checked = fields[input.getAttribute('data-field')] === true;
  });
  const status = root.querySelector('[data-owner-visual-status]');
  if (status) {
    status.textContent =
      'OWNER_VISUAL_QA = ' +
      (verdict || 'UNREVIEWED') +
      '. ROUND_1_CLASS = ' +
      ((record && record.ROUND_1_CLASS) || 'UNCLASSIFIED') +
      '. BOTANICAL_IDENTITY_QA = UNKNOWN. ASSET_QA = UNKNOWN. IN_GARDEN_QA = INVALID_FOR_THIS_SESSION until a signed Garden photo loads. approvalStatus = candidate. Session-only.';
  }
  const klass = (record && record.ROUND_1_CLASS) || '';
  root.querySelectorAll('[data-learning-class]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-learning-class') === klass ? 'true' : 'false');
  });
  const v2Class = (record && record.COMPOSITION_V2_CLASS) || '';
  root.querySelectorAll('[data-composition-v2-class]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-composition-v2-class') === v2Class ? 'true' : 'false');
  });
  syncClassificationGate(doc || root.ownerDocument);
}

function renderSummary(doc, state) {
  const uiStatus = currentUiStatus(doc);
  const summary = buildOwnerFeedbackSummary(state, { uiStatus });
  const integrity = reconcileOwnerFeedbackIntegrity(state);
  const table = doc.getElementById('owner-feedback-table-body');
  if (table) {
    table.innerHTML = summary.jobs
      .map((job) => {
        const fields = job.checkedFields.length ? job.checkedFields.join(', ') : '—';
        return (
          '<tr>' +
          '<td>' +
          job.canonicalSlug +
          '</td>' +
          '<td>' +
          job.OWNER_VISUAL_QA +
          '</td>' +
          '<td>' +
          fields +
          '</td>' +
          '<td>' +
          (job.ROUND_1_CLASS || 'UNCLASSIFIED') +
          '</td>' +
          '<td>UNKNOWN</td>' +
          '<td>UNKNOWN</td>' +
          '<td>' +
          job.IN_GARDEN_QA +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }
  const integrityEl = doc.getElementById('owner-feedback-integrity');
  if (integrityEl) {
    integrityEl.textContent =
      integrity.code +
      '. Frequencies from sessionStorage only: ' +
      Object.entries(integrity.frequencies)
        .map(([field, value]) => field + ' ' + value)
        .join('; ') +
      (integrity.missing.length ? '. Missing: ' + integrity.missing.join(', ') : '');
    integrityEl.className = integrity.ok ? 'ok' : 'warn';
  }
  const freqEl = doc.getElementById('owner-feedback-frequencies');
  if (freqEl) {
    freqEl.textContent = JSON.stringify(integrity.frequencies, null, 2);
  }
  const jsonEl = doc.getElementById('owner-feedback-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(state || {}, null, 2);
  const mapEl = doc.getElementById('owner-feedback-prompt-map');
  if (mapEl) {
    const learning = derivePromptFactoryV2Learning(state);
    mapEl.textContent = learning.finalized
      ? JSON.stringify(learning, null, 2)
      : learning.code +
        '. Prompt Factory V2 learning is not finalized. Generation corrections wait for REGEN_REQUIRED classes after integrity OK.';
  }
  syncClassificationGate(doc);
  return { summary, integrity };
}

async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

function downloadSnapshot(snapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'owner-feedback-round-1-final.json';
  a.click();
  URL.revokeObjectURL(url);
}

function wireScaleToggles(doc) {
  doc.querySelectorAll('[data-blend-scale]').forEach((btn) => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      const article = btn.closest('article.job');
      if (!article) return;
      const scale = btn.getAttribute('data-blend-scale');
      article.querySelectorAll('[data-blend-scale]').forEach((other) => {
        other.setAttribute('aria-pressed', other === btn ? 'true' : 'false');
      });
      article.querySelectorAll('.raw-blend-pair img.cutout').forEach((img) => {
        img.classList.remove('small', 'medium', 'large');
        img.classList.add(scale);
      });
    });
  });
}

export function initOwnerVisualQa(doc) {
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef) return { storageKey: OWNER_VISUAL_QA_STORAGE_KEY, wired: 0 };
  const store = storage();
  let state = loadOwnerVisualQa(store);
  let legacyClass = {};
  try {
    const raw = store && store.getItem(LEARNING_CLASS_STORAGE_KEY);
    legacyClass = raw ? JSON.parse(raw) : {};
  } catch {
    legacyClass = {};
  }
  const panels = documentRef.querySelectorAll('.owner-visual-qa[data-slug]');
  panels.forEach((root) => {
    const slug = root.getAttribute('data-slug');
    if ((!state[slug] || !state[slug].ROUND_1_CLASS) && legacyClass[slug]) {
      const row = { ...(state[slug] || {}) };
      row.ROUND_1_CLASS = legacyClass[slug];
      state = { ...state, [slug]: row };
    }
    paint(root, state[slug], documentRef);
    root.querySelectorAll('[data-verdict]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state = applyOwnerVisualVerdict(state, slug, btn.getAttribute('data-verdict'));
        saveOwnerVisualQa(store, state);
        paint(root, state[slug], documentRef);
        renderSummary(documentRef, state);
      });
    });
    root.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        state = applyOwnerVisualField(state, slug, input.getAttribute('data-field'), input.checked);
        saveOwnerVisualQa(store, state);
        paint(root, state[slug], documentRef);
        renderSummary(documentRef, state);
      });
    });
    root.querySelectorAll('[data-learning-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!gardenPhotoLoaded(documentRef)) return;
        state = applyRound1Class(state, slug, btn.getAttribute('data-learning-class'));
        saveOwnerVisualQa(store, state);
        paint(root, state[slug], documentRef);
        renderSummary(documentRef, state);
      });
    });
    root.querySelectorAll('[data-composition-v2-class]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!gardenPhotoLoaded(documentRef)) return;
        state = applyCompositionV2Class(state, slug, btn.getAttribute('data-composition-v2-class'));
        saveOwnerVisualQa(store, state);
        paint(root, state[slug], documentRef);
        renderSummary(documentRef, state);
      });
    });
  });
  renderSummary(documentRef, state);
  wireScaleToggles(documentRef);
  const copyBtn = documentRef.getElementById('copy-owner-feedback-summary');
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = '1';
    copyBtn.addEventListener('click', async () => {
      const current = loadOwnerVisualQa(store);
      const snapshot = buildRound1FinalSnapshot(current, {
        uiStatus: currentUiStatus(documentRef) || 'NO_ACTIVE_GARDEN',
        capturedAt: new Date().toISOString()
      });
      renderSummary(documentRef, current);
      const jsonEl = documentRef.getElementById('owner-feedback-json');
      if (jsonEl) jsonEl.textContent = JSON.stringify(current || {}, null, 2);
      const note = documentRef.getElementById('owner-feedback-copy-status');
      try {
        const ok = await copyText(JSON.stringify(snapshot, null, 2));
        if (note) note.textContent = ok ? 'Copied exact session snapshot.' : 'Copy failed. Select the JSON below.';
      } catch {
        if (note) note.textContent = 'Copy failed. Select the JSON below.';
      }
    });
  }
  const downloadBtn = documentRef.getElementById('download-round-1-final');
  if (downloadBtn && !downloadBtn.dataset.wired) {
    downloadBtn.dataset.wired = '1';
    downloadBtn.addEventListener('click', () => {
      const current = loadOwnerVisualQa(store);
      const snapshot = buildRound1FinalSnapshot(current, {
        uiStatus: currentUiStatus(documentRef) || 'NO_ACTIVE_GARDEN',
        capturedAt: new Date().toISOString()
      });
      const note = documentRef.getElementById('owner-feedback-copy-status');
      if (!snapshot.integrityOk) {
        if (note) note.textContent = 'OWNER_FEEDBACK_INTEGRITY_FAILED. Snapshot not written.';
        return;
      }
      downloadSnapshot(snapshot);
      if (note) note.textContent = 'Downloaded owner-feedback-round-1-final.json from sessionStorage.';
    });
  }
  documentRef.addEventListener('calibration-ui-status', () => {
    renderSummary(documentRef, loadOwnerVisualQa(store));
  });
  return { storageKey: OWNER_VISUAL_QA_STORAGE_KEY, wired: panels.length, preserved: true, wroteOnLoad: false };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOwnerVisualQa(document));
  } else {
    initOwnerVisualQa(document);
  }
}
