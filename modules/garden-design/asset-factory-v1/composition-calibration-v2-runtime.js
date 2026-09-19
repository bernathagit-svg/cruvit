/**
 * Calibration-only Blend V2 + perspective scale runtime.
 * Samples the signed Garden photo locally when CORS allows.
 * Does not alter the photo, bake PNGs, call OpenAI, or spend.
 */
import {
  RUNTIME_BLEND_V2,
  SCENE_DEPTHS,
  adaptFromLocalScene,
  blendV2FilterCss,
  computeSceneVisualScale,
  contactShadowForScale,
  sampleLocalSceneFromRgba
} from './composition-calibration-v2.js';
import {
  TREE_SCALE_MULTIPLIER_RANGE,
  TREE_SCALE_MULTIPLIER_STORAGE_KEY,
  computeTreeSceneScaleV3,
  parseTreeScaleMultiplier
} from './composition-calibration-v3.js';

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sceneUrlFrom(el) {
  const bg = el && el.style && el.style.backgroundImage ? el.style.backgroundImage : '';
  const match = bg.match(/url\((['"]?)(https:[^)'"]+)\1\)/i);
  return match ? match[2] : '';
}

async function sampleAroundPlacement(url, scene, placement) {
  if (!url || !scene || !placement) {
    return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise((resolve, reject) => {
      img.onload = () => resolve(true);
      img.onerror = () => reject(new Error('image-load-failed'));
      img.src = url;
    });
    if (!loaded) return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const sceneBox = scene.getBoundingClientRect();
    const placeBox = placement.getBoundingClientRect();
    const nx = (placeBox.left + placeBox.width / 2 - sceneBox.left) / Math.max(sceneBox.width, 1);
    const ny = (placeBox.bottom - sceneBox.top) / Math.max(sceneBox.height, 1);
    const px = clamp(Math.floor(nx * canvas.width - 24), 0, canvas.width - 1);
    const py = clamp(Math.floor(ny * canvas.height - 20), 0, canvas.height - 1);
    const data = ctx.getImageData(px, py, Math.min(48, canvas.width - px), Math.min(28, canvas.height - py));
    return sampleLocalSceneFromRgba(data.data, data.width, data.height, {
      x: 0,
      y: 0,
      width: data.width,
      height: data.height
    });
  } catch {
    return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }
}

function parseBbox(scene) {
  const raw = scene.getAttribute('data-bbox') || '';
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { exists: true, minX: parts[0], minY: parts[1], maxX: parts[2], maxY: parts[3] };
}

function parseCanvas(scene) {
  const raw = scene.getAttribute('data-canvas') || '1024,1536';
  const parts = raw.split(',').map(Number);
  return {
    width: Number.isFinite(parts[0]) ? parts[0] : 1024,
    height: Number.isFinite(parts[1]) ? parts[1] : 1536
  };
}

function currentTreeMultiplier(doc, article) {
  const input = (article && article.querySelector('[data-tree-scale-multiplier]')) || doc.querySelector('[data-tree-scale-multiplier]');
  if (input && input.value) return parseTreeScaleMultiplier(input.value);
  try {
    const stored = window.sessionStorage && window.sessionStorage.getItem(TREE_SCALE_MULTIPLIER_STORAGE_KEY);
    if (stored) return parseTreeScaleMultiplier(JSON.parse(stored).mango);
  } catch {
    /* ignore */
  }
  return TREE_SCALE_MULTIPLIER_RANGE.proposedDefault;
}

function applyPlacement(scene, options = {}) {
  const placement = scene.querySelector('[data-role="placement"]');
  const img = scene.querySelector('img.cutout');
  const shadow = scene.querySelector('.ground-shadow');
  if (!placement || !img) return null;
  const visualForm = scene.getAttribute('data-visual-form') || options.visualForm || 'unknown';
  const depthId = options.depthId || scene.getAttribute('data-depth-id') || 'middle';
  const ownerScale = options.ownerScale != null
    ? options.ownerScale
    : Number(scene.getAttribute('data-owner-scale') || 1);
  const model = scene.getAttribute('data-scale-model') || options.scaleModel || 'v2';
  const canvas = parseCanvas(scene);
  const bbox = parseBbox(scene);
  let scale;
  if (model === 'v3' && visualForm === 'tree') {
    scale = computeTreeSceneScaleV3({
      visualForm,
      growthStage: scene.getAttribute('data-growth-stage') || 'mature',
      depthId,
      ownerScale,
      treeScaleMultiplier: options.treeScaleMultiplier,
      bbox,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      sizeEvidence: { status: scene.getAttribute('data-size-evidence') || 'SIZE_EVIDENCE_UNKNOWN' }
    });
  } else {
    scale = computeSceneVisualScale({
      visualForm,
      depthId,
      ownerScale,
      sizeEvidence: { status: scene.getAttribute('data-size-evidence') || 'SIZE_EVIDENCE_UNKNOWN' }
    });
  }
  scene.setAttribute('data-depth-id', scale.depthId);
  scene.setAttribute('data-owner-scale', String(scale.ownerScale));
  placement.style.left = '50%';
  placement.style.bottom = `${scale.yBottomPct}%`;
  placement.style.transform = 'translateX(-50%)';
  const sceneH = scene.clientHeight || 300;
  const imgPct = scale.imgHeightPct != null ? scale.imgHeightPct : scale.heightPct;
  const imgPx = (imgPct / 100) * sceneH;
  img.style.maxHeight = `${imgPx}px`;
  img.style.maxWidth = '100%';
  const anchorNy = scale.groundAnchor && Number(scale.groundAnchor.ny);
  if (model === 'v3' && Number.isFinite(anchorNy) && anchorNy < 0.995) {
    img.style.marginBottom = `${-((1 - anchorNy) * imgPx)}px`;
  } else {
    img.style.marginBottom = '0';
  }
  const shadowSpec = contactShadowForScale({ heightPct: scale.heightPct || scale.visibleHeightPct, depthId: scale.depthId });
  if (shadow) {
    shadow.style.width = `${shadowSpec.widthPct}%`;
    shadow.style.height = `${shadowSpec.heightPx}px`;
    shadow.style.opacity = String(shadowSpec.opacity);
    shadow.style.filter = `blur(${shadowSpec.blurPx}px)`;
  }
  return { placement, img, shadow, scale, shadowSpec };
}

function applyBlendFilter(img, adaptation) {
  if (!img) return;
  img.style.filter = blendV2FilterCss(adaptation);
  img.style.opacity = String(adaptation.opacity || RUNTIME_BLEND_V2.defaults.opacity);
}

async function refreshV2Scenes(doc) {
  const scenes = [
    ...doc.querySelectorAll(
      '.scene.blend-v2-scene, .scene.perspective-scene, .scene.fixed-scale-v2-scene, .scene.tree-v3-scene, .scene.form-compare-scene'
    )
  ].filter((el) => !el.classList.contains('physical-v1-scene') && !el.classList.contains('photo-cal-scene'));
  const firstReal = scenes.find((el) => el.classList.contains('real') || el.classList.contains('blend-v2-scene'));
  const url = sceneUrlFrom(firstReal);
  let sample = { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  if (url) {
    const applied = applyPlacement(firstReal || scenes[0], {});
    sample = await sampleAroundPlacement(url, firstReal || scenes[0], applied && applied.placement);
  }
  const adaptation = adaptFromLocalScene(sample);
  const status = doc.getElementById('composition-v2-sample-status');
  if (status) {
    status.textContent = sample.available
      ? `LOCAL SCENE MATCHING: sampled luminance ${sample.luminance.toFixed(3)}, contrast ${sample.contrast.toFixed(3)}, saturation ${sample.saturation.toFixed(3)}. Bounds brightness ${RUNTIME_BLEND_V2.bounds.brightness.min}–${RUNTIME_BLEND_V2.bounds.brightness.max}, contrast ${RUNTIME_BLEND_V2.bounds.contrast.min}–${RUNTIME_BLEND_V2.bounds.contrast.max}, saturate ${RUNTIME_BLEND_V2.bounds.saturate.min}–${RUNTIME_BLEND_V2.bounds.saturate.max}, blur ${RUNTIME_BLEND_V2.bounds.blurPx.min}–${RUNTIME_BLEND_V2.bounds.blurPx.max}px, opacity ${RUNTIME_BLEND_V2.bounds.opacity.min}–${RUNTIME_BLEND_V2.bounds.opacity.max}, hue-rotate 0.`
      : `LOCAL SCENE MATCHING: ${sample.reason || 'LOCAL_SCENE_SAMPLE_UNAVAILABLE'}. Conservative Blend V2 defaults applied. Bounds brightness 0.88–1.08, contrast 0.88–1.06, saturate 0.82–1.05, blur 0.2–0.7px, opacity 0.94–1.00, hue-rotate 0. Garden photo is not modified.`;
  }
  scenes.forEach((scene) => {
    const article = scene.closest('article.job');
    const depthSelect = article && article.querySelector('[data-v2-depth]');
    const scaleInput = article && article.querySelector('[data-v2-owner-scale]');
    if (scene.classList.contains('fixed-scale-v2-scene')) {
      applyBlendFilter(scene.querySelector('img.cutout'), adaptation);
      return;
    }
    const applied = applyPlacement(scene, {
      depthId: scene.getAttribute('data-lock-depth') || (depthSelect && depthSelect.value) || 'middle',
      ownerScale: scaleInput ? Number(scaleInput.value) : 1,
      treeScaleMultiplier: currentTreeMultiplier(doc, article),
      scaleModel: scene.getAttribute('data-scale-model') || 'v2'
    });
    if (applied) applyBlendFilter(applied.img, adaptation);
    const readout = article && article.querySelector('[data-v2-scale-readout]');
    if (readout && applied && !scene.getAttribute('data-lock-depth') && scene.getAttribute('data-scale-model') !== 'v3') {
      readout.textContent = `visual height ${applied.scale.heightPct.toFixed(1)}% · depth ${applied.scale.depthId} · owner scale ${applied.scale.ownerScale.toFixed(2)} · visual aid only, not cm`;
    }
    const v3Readout = article && article.querySelector('[data-v3-scale-readout]');
    if (v3Readout && applied && scene.getAttribute('data-scale-model') === 'v3' && scene.getAttribute('data-lock-depth') === 'middle') {
      const visible = applied.scale.visibleHeightPct || applied.scale.heightPct;
      v3Readout.textContent = `V3 visible height ${visible.toFixed(1)}% · img ${applied.scale.imgHeightPct.toFixed(1)}% of scene · multiplier ${applied.scale.treeScaleMultiplier.toFixed(2)} · visual aid only, not cm`;
    }
  });
  return { sample, adaptation, version: RUNTIME_BLEND_V2.version };
}

function persistTreeMultiplier(doc) {
  const input = doc.querySelector('[data-tree-scale-multiplier]');
  if (!input) return;
  const value = parseTreeScaleMultiplier(input.value);
  const label = doc.querySelector('[data-tree-scale-multiplier-value]');
  if (label) label.textContent = value.toFixed(2);
  try {
    window.sessionStorage.setItem(
      TREE_SCALE_MULTIPLIER_STORAGE_KEY,
      JSON.stringify({ mango: value, calibrationOnly: true, lockedUniversal: false })
    );
  } catch {
    /* ignore */
  }
}

function wireControls(doc) {
  doc.querySelectorAll('[data-v2-depth], [data-v2-owner-scale], [data-tree-scale-multiplier]').forEach((el) => {
    if (el.dataset.v2Wired) return;
    el.dataset.v2Wired = '1';
    el.addEventListener('input', () => {
      persistTreeMultiplier(doc);
      refreshV2Scenes(doc);
    });
    el.addEventListener('change', () => {
      persistTreeMultiplier(doc);
      refreshV2Scenes(doc);
    });
  });
  try {
    const stored = window.sessionStorage && window.sessionStorage.getItem(TREE_SCALE_MULTIPLIER_STORAGE_KEY);
    const input = doc.querySelector('[data-tree-scale-multiplier]');
    if (stored && input) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.mango != null) {
        input.value = String(parseTreeScaleMultiplier(parsed.mango));
        persistTreeMultiplier(doc);
      }
    }
  } catch {
    /* ignore */
  }
}

export function initCompositionCalibrationV2(doc) {
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef) return { wired: false };
  wireControls(documentRef);
  refreshV2Scenes(documentRef);
  documentRef.addEventListener('calibration-ui-status', () => {
    refreshV2Scenes(documentRef);
  });
  return { wired: true, blendVersion: RUNTIME_BLEND_V2.version, depths: Object.keys(SCENE_DEPTHS) };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initCompositionCalibrationV2(document));
  } else {
    initCompositionCalibrationV2(document);
  }
}
