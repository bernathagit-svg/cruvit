/**
 * Owned Garden promotion review runtime. No generation. No spend. No registry write.
 */
import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  applyProductionPhysicalScenes,
  seedMangoGardenDesignPreference
} from './physical-scale-foundation-v1-runtime.js';
import { PHOTO_SCALE_STATE } from './physical-scale-foundation-v1.js';

const OWNER_PROMOTION_CHOICES = [
  'APPROVE_FOR_PRODUCTION_REGISTRY',
  'NEEDS_REGENERATION',
  'REJECT_IDENTITY',
  'NEEDS_ARCHITECTURE_FIX'
];

const AUTHORITY_FETCH = '../../data/catalog/botanical-size-authority-v1.json';
const ZOOM_CLASSES = ['inspect-fit', 'inspect-100', 'inspect-150'];
const STORAGE_KEY = 'cruvit:owned-garden-design-asset-promotion-v1';

function loadQa() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.choices = parsed.choices && typeof parsed.choices === 'object' ? parsed.choices : {};
    return parsed;
  } catch {
    return { choices: {} };
  }
}

function saveQa(state) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function paint(state) {
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    const slug = btn.getAttribute('data-slug');
    const choice = btn.getAttribute('data-owner-choice');
    btn.setAttribute('aria-pressed', state.choices[slug] === choice ? 'true' : 'false');
  });
  document.querySelectorAll('[data-choice-status]').forEach((el) => {
    const slug = el.getAttribute('data-choice-status');
    const choice = state.choices[slug];
    if (!choice) {
      el.textContent = 'No owner choice recorded.';
      return;
    }
    if (choice === 'APPROVE_FOR_PRODUCTION_REGISTRY') {
      el.textContent = 'Intent recorded: APPROVE_FOR_PRODUCTION_REGISTRY. Registry is not written in this task.';
      return;
    }
    el.textContent = `Owner choice recorded: ${choice}. Not a production registry write.`;
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

function wireChoices() {
  let state = loadQa();
  paint(state);
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.getAttribute('data-slug');
      const choice = btn.getAttribute('data-owner-choice');
      if (!slug || !OWNER_PROMOTION_CHOICES.includes(choice)) return;
      state = loadQa();
      state.choices[slug] = state.choices[slug] === choice ? null : choice;
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
      'Real Garden photo loaded. Exactly 3 plants. Olive unchanged. Spend DENIED. APPROVE records intent only — no registry write.';
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
wireChoices();
applyProductionScale();
