/**
 * BRANCH alpha salvage review runtime. Native inspection only. No spend.
 */
const ZOOM_CLASSES = ['inspect-100', 'inspect-150', 'inspect-200'];
const STORAGE_KEY = 'cruvit:branch-alpha-salvage-1';

function loadQa() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.arms = parsed.arms && typeof parsed.arms === 'object' ? parsed.arms : {};
    parsed.preferredVersion = parsed.preferredVersion || null;
    parsed.productionApproved = false;
    return parsed;
  } catch {
    return { arms: {}, preferredVersion: null, productionApproved: false };
  }
}

function saveQa(state) {
  state.productionApproved = false;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function paintChoice(state) {
  document.querySelectorAll('[data-owner-choice] [data-choice]').forEach((btn) => {
    const choice = btn.getAttribute('data-choice');
    btn.setAttribute('aria-pressed', state.preferredVersion === choice ? 'true' : 'false');
  });
}

function paintZoom(zoom) {
  document.querySelectorAll('[data-compare-zoom] [data-inspect-zoom]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-inspect-zoom') === zoom ? 'true' : 'false');
  });
}

function applyZoom(zoom) {
  document.querySelectorAll('#alphaCleanupComparison .inspect-scene').forEach((scene) => {
    ZOOM_CLASSES.forEach((cls) => scene.classList.remove(cls));
    scene.classList.add('inspect-' + zoom);
  });
  paintZoom(zoom);
}

function wireZoom() {
  applyZoom('100');
  document.querySelectorAll('[data-compare-zoom] [data-inspect-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyZoom(btn.getAttribute('data-inspect-zoom') || '100');
    });
  });
}

function wireChoice() {
  let state = loadQa();
  paintChoice(state);
  document.querySelectorAll('[data-owner-choice] [data-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.getAttribute('data-choice');
      state = loadQa();
      state.preferredVersion = choice;
      state.productionApproved = false;
      saveQa(state);
      paintChoice(state);
    });
  });
}

wireZoom();
wireChoice();
