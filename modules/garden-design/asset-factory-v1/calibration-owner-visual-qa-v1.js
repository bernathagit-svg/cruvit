/**
 * Session-only owner visual QA controls for calibration review.
 * Does not write the production registry. Does not generate images.
 */
import {
  OWNER_VISUAL_QA_STORAGE_KEY,
  applyOwnerVisualField,
  applyOwnerVisualVerdict,
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
      '. BOTANICAL_IDENTITY_QA = UNKNOWN. ASSET_QA = UNKNOWN. approvalStatus = candidate. Session-only.';
  }
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
      });
    });
    root.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('change', () => {
        state = applyOwnerVisualField(state, slug, input.getAttribute('data-field'), input.checked);
        saveOwnerVisualQa(store, state);
        paint(root, state[slug]);
      });
    });
  });
  return { storageKey: OWNER_VISUAL_QA_STORAGE_KEY, wired: panels.length };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOwnerVisualQa(document));
  } else {
    initOwnerVisualQa(document);
  }
}
