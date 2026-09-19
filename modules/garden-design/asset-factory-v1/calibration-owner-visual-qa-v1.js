/**
 * Session-only owner visual QA controls for calibration review.
 * Reads existing sessionStorage; does not clear or overwrite on load.
 * Does not write the production registry. Does not generate images.
 */
import {
  OWNER_VISUAL_QA_STORAGE_KEY,
  applyOwnerVisualField,
  applyOwnerVisualVerdict,
  buildOwnerFeedbackSummary,
  loadOwnerVisualQa,
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

function paint(root, record) {
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
      '. BOTANICAL_IDENTITY_QA = UNKNOWN. ASSET_QA = UNKNOWN. IN_GARDEN_QA = INVALID_FOR_THIS_SESSION until a signed Garden photo loads. approvalStatus = candidate. Session-only.';
  }
}

function renderSummary(doc, state) {
  const summary = buildOwnerFeedbackSummary(state, {
    uiStatus: currentUiStatus(doc) || 'NO_ACTIVE_GARDEN',
    capturedAt: null
  });
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
  const jsonEl = doc.getElementById('owner-feedback-json');
  if (jsonEl) jsonEl.textContent = JSON.stringify(summary, null, 2);
  const mapEl = doc.getElementById('owner-feedback-prompt-map');
  if (mapEl) {
    const entries = Object.values(summary.promptCorrectionMap.byField || {});
    mapEl.textContent = entries.length
      ? entries
          .map((row) => row.field + ' (' + row.slugs.join(', ') + '): ' + row.guidance)
          .join('\n')
      : 'No checked issue fields yet. Prompt corrections are derived only from actual owner checks.';
  }
  return summary;
}

async function copySummary(summary) {
  const text = JSON.stringify(summary, null, 2);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export function initOwnerVisualQa(doc) {
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef) return { storageKey: OWNER_VISUAL_QA_STORAGE_KEY, wired: 0 };
  const store = storage();
  let state = loadOwnerVisualQa(store);
  const panels = documentRef.querySelectorAll('.owner-visual-qa[data-slug]');
  panels.forEach((root) => {
    const slug = root.getAttribute('data-slug');
    paint(root, state[slug]);
    root.querySelectorAll('[data-verdict]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state = applyOwnerVisualVerdict(state, slug, btn.getAttribute('data-verdict'));
        saveOwnerVisualQa(store, state);
        paint(root, state[slug]);
        renderSummary(documentRef, state);
      });
    });
    root.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        state = applyOwnerVisualField(state, slug, input.getAttribute('data-field'), input.checked);
        saveOwnerVisualQa(store, state);
        paint(root, state[slug]);
        renderSummary(documentRef, state);
      });
    });
  });
  renderSummary(documentRef, state);
  const copyBtn = documentRef.getElementById('copy-owner-feedback-summary');
  if (copyBtn && !copyBtn.dataset.wired) {
    copyBtn.dataset.wired = '1';
    copyBtn.addEventListener('click', async () => {
      const current = loadOwnerVisualQa(store);
      const summary = buildOwnerFeedbackSummary(current, {
        uiStatus: currentUiStatus(documentRef) || 'NO_ACTIVE_GARDEN',
        capturedAt: new Date().toISOString()
      });
      renderSummary(documentRef, current);
      const jsonEl = documentRef.getElementById('owner-feedback-json');
      if (jsonEl) jsonEl.textContent = JSON.stringify(summary, null, 2);
      const note = documentRef.getElementById('owner-feedback-copy-status');
      try {
        const ok = await copySummary(summary);
        if (note) note.textContent = ok ? 'Copied current sessionStorage summary.' : 'Copy failed. Select the JSON below.';
      } catch {
        if (note) note.textContent = 'Copy failed. Select the JSON below.';
      }
    });
  }
  return { storageKey: OWNER_VISUAL_QA_STORAGE_KEY, wired: panels.length, preserved: true };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOwnerVisualQa(document));
  } else {
    initOwnerVisualQa(document);
  }
}
