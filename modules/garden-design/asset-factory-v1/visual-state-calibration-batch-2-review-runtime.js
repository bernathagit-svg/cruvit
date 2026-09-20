/**
 * Batch-2 review runtime. Production physical-scale path. No generation. No spend.
 * Preserves locked Mango DETAIL_SOFT owner finding.
 */
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  applyProductionPhysicalScenes,
  seedMangoGardenDesignPreference
} from './physical-scale-foundation-v1-runtime.js';
import { PHOTO_SCALE_STATE } from './physical-scale-foundation-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';
import {
  BATCH_2_OWNER_DETAIL_STATE_STORAGE_KEY,
  LOCKED_MANGO_JOB_IDS
} from './batch-2-review-marks-v1.js';

const AUTHORITY_FETCH = '../../data/catalog/botanical-size-authority-v1.json';
const ZOOM_CLASSES = ['inspect-fit', 'inspect-100', 'inspect-150', 'inspect-200'];
const DETAIL_EXCLUSIVE = ['DETAIL_OK', 'DETAIL_SOFT'];
const STATE_EXCLUSIVE = ['STATE_GOOD', 'STATE_TOO_WEAK', 'STATE_OVERSTATED'];

function storageKey() {
  return document.body.getAttribute('data-owner-qa-storage') || BATCH_2_OWNER_DETAIL_STATE_STORAGE_KEY;
}

function emptyState() {
  return { version: 1, jobs: {}, families: {} };
}

function loadQa() {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(storageKey());
    const parsed = raw ? JSON.parse(raw) : emptyState();
    if (!parsed || typeof parsed !== 'object') return emptyState();
    parsed.jobs = parsed.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {};
    parsed.families = parsed.families && typeof parsed.families === 'object' ? parsed.families : {};
    return parsed;
  } catch {
    return emptyState();
  }
}

function seedLockedMango(state) {
  for (const jobId of LOCKED_MANGO_JOB_IDS) {
    const row = { ...(state.jobs[jobId] || {}) };
    row.DETAIL_SOFT = true;
    row.DETAIL_OK = false;
    row.locked = true;
    row.source = 'accepted-mango-audit-0b92c48';
    state.jobs[jobId] = row;
  }
  return state;
}

function saveQa(state) {
  const next = seedLockedMango(state);
  window.sessionStorage.setItem(storageKey(), JSON.stringify(next));
  return next;
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
      'Real Garden photo loaded. A = native inspection. B = state/family. C = in-garden production scale. Mango DETAIL_SOFT locked. Candidates only.';
  }
  return true;
}

function wireZoom() {
  document.querySelectorAll('[data-inspect-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scene = btn.closest('.inspect-slot') && btn.closest('.inspect-slot').querySelector('.inspect-scene');
      if (!scene) return;
      const level = btn.getAttribute('data-inspect-zoom') || '100';
      ZOOM_CLASSES.forEach((cls) => scene.classList.remove(cls));
      scene.classList.add('inspect-' + level);
    });
  });
}

function paintMarks(state) {
  document.querySelectorAll('.inspect-slot [data-mark-group="detail"]').forEach((group) => {
    const jobId = group.getAttribute('data-job-id');
    const row = (state.jobs && state.jobs[jobId]) || {};
    group.querySelectorAll('[data-mark]').forEach((btn) => {
      const mark = btn.getAttribute('data-mark');
      const on = row[mark] === true;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
  document.querySelectorAll('.family').forEach((section) => {
    const family = section.getAttribute('data-family');
    const row = (state.families && state.families[family]) || {};
    section.querySelectorAll('[data-mark-group="state"] [data-mark]').forEach((btn) => {
      const mark = btn.getAttribute('data-mark');
      btn.setAttribute('aria-pressed', row[mark] === true ? 'true' : 'false');
    });
  });
}

function toggleExclusive(row, mark, exclusive) {
  const next = !row[mark];
  if (exclusive.includes(mark)) {
    exclusive.forEach((key) => {
      row[key] = false;
    });
  }
  row[mark] = next;
  return row;
}

function wireMarks() {
  let state = seedLockedMango(loadQa());
  saveQa(state);
  paintMarks(state);
  document.querySelectorAll('.inspect-slot [data-mark-group="detail"] [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-mark-group="detail"]');
      const jobId = group && group.getAttribute('data-job-id');
      const mark = btn.getAttribute('data-mark');
      if (!jobId || !mark) return;
      const locked = LOCKED_MANGO_JOB_IDS.includes(jobId);
      if (locked && (mark === 'DETAIL_OK' || mark === 'DETAIL_SOFT')) return;
      state = seedLockedMango(loadQa());
      state.jobs[jobId] = toggleExclusive({ ...(state.jobs[jobId] || {}) }, mark, DETAIL_EXCLUSIVE);
      if (locked) {
        state.jobs[jobId].DETAIL_SOFT = true;
        state.jobs[jobId].DETAIL_OK = false;
        state.jobs[jobId].locked = true;
      }
      saveQa(state);
      paintMarks(state);
    });
  });
  document.querySelectorAll('[data-mark-group="state"] [data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const family = btn.closest('.family') && btn.closest('.family').getAttribute('data-family');
      const mark = btn.getAttribute('data-mark');
      if (!family || !mark) return;
      state = seedLockedMango(loadQa());
      state.families[family] = toggleExclusive({ ...(state.families[family] || {}) }, mark, STATE_EXCLUSIVE);
      saveQa(state);
      paintMarks(state);
    });
  });
}

function annotateScale() {
  document.querySelectorAll('.garden-slot').forEach((slot) => {
    const scene = slot.querySelector('.physical-v1-scene');
    const img = slot.querySelector('img.cutout');
    const readout = slot.querySelector('[data-scale-readout]');
    if (!scene || !img || !readout) return;
    const slug = scene.getAttribute('data-canonical-slug');
    const stage = scene.getAttribute('data-growth-stage');
    const form = scene.getAttribute('data-visual-form');
    const band = scene.getAttribute('data-lock-range-band');
    const height = img.style.height || 'runtime';
    const parts = [
      slug,
      form,
      stage,
      band ? `range ${band}` : stage === 'young' ? 'STAGE_AUTHORITY_UNKNOWN' : 'identity authority',
      `render height ${height}`
    ];
    readout.textContent = parts.join(' · ');
  });
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
  annotateScale();
  return {
    mangoLow: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition,
    registryLoaded: Boolean(registry && registry.records)
  };
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
