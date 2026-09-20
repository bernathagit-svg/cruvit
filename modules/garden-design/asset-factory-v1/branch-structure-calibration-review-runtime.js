/**
 * BRANCH_STRUCTURE calibration review runtime. Native inspection only. No spend.
 */
const ZOOM_CLASSES = ['inspect-fit', 'inspect-100', 'inspect-150', 'inspect-200'];
const STORAGE_KEY = 'cruvit:branch-structure-calibration-1';

function loadQa() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.arms = parsed.arms && typeof parsed.arms === 'object' ? parsed.arms : {};
    return parsed;
  } catch {
    return { arms: {} };
  }
}

function saveQa(state) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function paint(state) {
  document.querySelectorAll('[data-mark-group="detail"]').forEach((group) => {
    const arm = group.getAttribute('data-arm');
    const row = (state.arms && state.arms[arm]) || {};
    group.querySelectorAll('[data-mark]').forEach((btn) => {
      const mark = btn.getAttribute('data-mark');
      btn.setAttribute('aria-pressed', row[mark] === true ? 'true' : 'false');
    });
  });
}

function wireZoom() {
  document.querySelectorAll('[data-inspect-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scene = btn.closest('.inspect-slot') && btn.closest('.inspect-slot').querySelector('.inspect-scene');
      if (!scene) return;
      ZOOM_CLASSES.forEach((cls) => scene.classList.remove(cls));
      scene.classList.add('inspect-' + (btn.getAttribute('data-inspect-zoom') || '100'));
    });
  });
}

function wireMarks() {
  let state = loadQa();
  paint(state);
  document.querySelectorAll('[data-mark-group="detail"] [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-mark-group="detail"]');
      const arm = group && group.getAttribute('data-arm');
      const mark = btn.getAttribute('data-mark');
      if (!arm || !mark) return;
      state = loadQa();
      const row = { ...(state.arms[arm] || {}) };
      row[mark] = !row[mark];
      state.arms[arm] = row;
      saveQa(state);
      paint(state);
    });
  });
}

wireZoom();
wireMarks();
