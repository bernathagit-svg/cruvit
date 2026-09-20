/**
 * Woody foliage A/B review runtime. No generation. No spend.
 * CONTROL DETAIL_SOFT is locked.
 */
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  applyProductionPhysicalScenes,
  seedMangoGardenDesignPreference
} from './physical-scale-foundation-v1-runtime.js';
import { PHOTO_SCALE_STATE } from './physical-scale-foundation-v1.js';

const AUTHORITY_FETCH = '../../data/catalog/botanical-size-authority-v1.json';
const ZOOM_CLASSES = ['inspect-fit', 'inspect-100', 'inspect-150', 'inspect-200'];
const STORAGE_KEY = 'cruvit:woody-foliage-detail-ab-1';
const DETAIL_EXCLUSIVE = ['DETAIL_OK', 'DETAIL_SOFT'];

function loadQa() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.arms = parsed.arms && typeof parsed.arms === 'object' ? parsed.arms : {};
    return parsed;
  } catch {
    return { arms: {} };
  }
}

function seedControl(state) {
  const row = { ...(state.arms.CONTROL || {}) };
  row.DETAIL_SOFT = true;
  row.DETAIL_OK = false;
  row.locked = true;
  state.arms.CONTROL = row;
  return state;
}

function saveQa(state) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seedControl(state)));
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
  let state = seedControl(loadQa());
  saveQa(state);
  paint(state);
  document.querySelectorAll('[data-mark-group="detail"] [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-mark-group="detail"]');
      const arm = group && group.getAttribute('data-arm');
      const mark = btn.getAttribute('data-mark');
      if (!arm || !mark) return;
      if (arm === 'CONTROL' && (mark === 'DETAIL_OK' || mark === 'DETAIL_SOFT')) return;
      state = seedControl(loadQa());
      const row = { ...(state.arms[arm] || {}) };
      if (DETAIL_EXCLUSIVE.includes(mark)) {
        DETAIL_EXCLUSIVE.forEach((key) => {
          row[key] = false;
        });
      }
      row[mark] = !row[mark];
      state.arms[arm] = row;
      saveQa(state);
      paint(state);
    });
  });
}

function applySignedUrl(url) {
  if (!url) return false;
  document.querySelectorAll('[data-role="garden-scene"]').forEach((el) => {
    el.style.backgroundImage = "url('" + String(url).replace(/'/g, "\\'") + "')";
  });
  const banner = document.getElementById('realGardenBanner');
  if (banner) {
    banner.className = 'ok';
    banner.textContent =
      'Real Garden photo loaded. Native detail is primary. CONTROL DETAIL_SOFT locked. A/B not generated. Spend DENIED.';
  }
  return true;
}

async function applyProductionScale() {
  seedMangoGardenDesignPreference('review-session-photo');
  let registry = null;
  try {
    const res = await fetch(AUTHORITY_FETCH);
    if (res.ok) registry = await res.json();
  } catch {
    registry = null;
  }
  applyProductionPhysicalScenes(document, {
    authorityRegistry: registry,
    photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED
  });
}

window.addEventListener('message', (ev) => {
  const d = ev && ev.data;
  if (!d || d.type !== CALIBRATION_SOURCE_MESSAGE_TYPE) return;
  if (d.sourceMediaUrl) {
    applySignedUrl(d.sourceMediaUrl);
    applyProductionScale();
  }
});

wireZoom();
wireMarks();
applyProductionScale();
