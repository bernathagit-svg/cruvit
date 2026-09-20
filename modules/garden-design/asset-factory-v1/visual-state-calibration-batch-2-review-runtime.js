/**
 * Batch-2 review runtime. Production physical-scale path. No generation. No spend.
 */
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  applyProductionPhysicalScenes,
  seedMangoGardenDesignPreference
} from './physical-scale-foundation-v1-runtime.js';
import { PHOTO_SCALE_STATE } from './physical-scale-foundation-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';

const AUTHORITY_FETCH = '../../data/catalog/botanical-size-authority-v1.json';

function applySignedUrl(url) {
  if (!url) return false;
  document.querySelectorAll('[data-role="garden-scene"]').forEach((el) => {
    el.style.backgroundImage = "url('" + String(url).replace(/'/g, "\\'") + "')";
  });
  const banner = document.getElementById('realGardenBanner');
  if (banner) {
    banner.className = 'ok';
    banner.textContent =
      'Real Garden photo loaded. ASSET INSPECTION is unfiltered. IN-GARDEN uses production physical scale. Mango mature = LOW. Candidates only.';
  }
  return true;
}

function wireZoom() {
  document.querySelectorAll('[data-inspect-zoom]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scene = btn.closest('.inspect-slot') && btn.closest('.inspect-slot').querySelector('.inspect-scene');
      if (!scene) return;
      const on = scene.classList.toggle('inspect-100');
      btn.textContent = on ? 'Fit to panel' : 'View 100%';
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
applyProductionScale();
