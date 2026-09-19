/**
 * Calibration-only physical-scale harness.
 * Two-point known dimension + optional near/far perspective + suggested size.
 * No OpenAI. No generation. No spend. No mango hard-coding.
 */
import { contactShadowForScale } from './composition-calibration-v2.js';
import {
  PHOTO_SCALE_STORAGE_KEY,
  PHOTO_SCALE_CHOICE_STORAGE_KEY,
  PHOTO_SCALE_MODE,
  PHOTO_SCALE_STATE,
  PHYSICAL_PLACEMENT,
  REFERENCE_KINDS,
  USER_CONFIRMED_SIZE_STORAGE_KEY,
  USER_SCALE_OVERRIDE_STORAGE_KEY,
  addKnownReference,
  classifyUserConfirmedDimension,
  computePhysicalSceneScale,
  emptyPhotoScaleCalibration,
  emptyPhotoScaleChoice,
  removeKnownReference,
  resolvePhotoScaleChoice
} from './physical-scale-foundation-v1.js';
import {
  RANGE_BANDS,
  RANGE_BAND_STORAGE_KEY,
  SIZE_SCENARIOS,
  SIZE_SCENARIO_STORAGE_KEY,
  resolvePhysicalScaleEvidence
} from './physical-scale-evidence-v1.js';
import {
  computeTreePhysicalScale,
  OWNER_SIZE_PREFERENCE_STORAGE_KEY,
  MANGO_GARDEN_DESIGN_PREFERENCE
} from './generic-tree-physical-scale-v1.js';

function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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

function readJson(key, fallback) {
  try {
    const raw = window.sessionStorage && window.sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

function currentPhotoKey(doc) {
  const root = doc.documentElement;
  return (
    (root && root.getAttribute('data-garden-source-media-id')) ||
    (doc.body && doc.body.getAttribute('data-garden-source-media-id')) ||
    'review-session-photo'
  );
}

function loadChoiceStore() {
  return readJson(PHOTO_SCALE_CHOICE_STORAGE_KEY, {});
}

function saveChoice(photoKey, patch) {
  const store = loadChoiceStore();
  const current = store[photoKey] || emptyPhotoScaleChoice(photoKey);
  store[photoKey] = { ...current, ...patch, photoKey, gardenDesignBlocked: false };
  writeJson(PHOTO_SCALE_CHOICE_STORAGE_KEY, store);
  return store[photoKey];
}

function loadCalibration() {
  const stored = readJson(PHOTO_SCALE_STORAGE_KEY, null);
  if (stored && stored.contract === 'garden-photo-scale-calibration-v1') return stored;
  return emptyPhotoScaleCalibration();
}

function loadUserConfirmed(slug, growthStage) {
  const store = readJson(USER_CONFIRMED_SIZE_STORAGE_KEY, {});
  return store[slug] && store[slug][growthStage] ? store[slug][growthStage] : null;
}

function saveUserConfirmed(slug, growthStage, payload) {
  const store = readJson(USER_CONFIRMED_SIZE_STORAGE_KEY, {});
  store[slug] = store[slug] || {};
  if (!payload) delete store[slug][growthStage];
  else store[slug][growthStage] = payload;
  writeJson(USER_CONFIRMED_SIZE_STORAGE_KEY, store);
}

function ownerPreferenceKey(photoKey, slug) {
  return `${photoKey || 'review-session-photo'}::${slug || ''}`;
}

function seedMangoGardenDesignPreference(photoKey) {
  const store = readJson(OWNER_SIZE_PREFERENCE_STORAGE_KEY, {});
  const key = ownerPreferenceKey(photoKey, MANGO_GARDEN_DESIGN_PREFERENCE.canonicalSlug);
  if (store[key]) return store[key];
  store[key] = {
    ...MANGO_GARDEN_DESIGN_PREFERENCE,
    photoKey,
    botanicalTruthModified: false
  };
  writeJson(OWNER_SIZE_PREFERENCE_STORAGE_KEY, store);
  return store[key];
}

function loadOwnerPreferredRange(photoKey, slug) {
  const store = readJson(OWNER_SIZE_PREFERENCE_STORAGE_KEY, {});
  const row = store[ownerPreferenceKey(photoKey, slug)];
  return row && row.ownerPreferredRangePosition ? row.ownerPreferredRangePosition : null;
}

function loadRangeBand() {
  const stored = readJson(RANGE_BAND_STORAGE_KEY, { band: RANGE_BANDS.MID });
  const band = String(stored && stored.band ? stored.band : RANGE_BANDS.MID).toUpperCase();
  return RANGE_BANDS[band] || RANGE_BANDS.MID;
}

function saveRangeBand(band) {
  writeJson(RANGE_BAND_STORAGE_KEY, { band });
}

function loadSizeScenario() {
  const stored = readJson(SIZE_SCENARIO_STORAGE_KEY, { scenario: SIZE_SCENARIOS.NATURAL_MATURE });
  const scenario = stored && stored.scenario;
  return SIZE_SCENARIOS[scenario] || SIZE_SCENARIOS.NATURAL_MATURE;
}

function saveSizeScenario(scenario) {
  writeJson(SIZE_SCENARIO_STORAGE_KEY, { scenario });
}

function loadOverride(slug) {
  const store = readJson(USER_SCALE_OVERRIDE_STORAGE_KEY, {});
  return store[slug] || { kind: 'none' };
}

function saveOverride(slug, payload) {
  const store = readJson(USER_SCALE_OVERRIDE_STORAGE_KEY, {});
  store[slug] = payload;
  writeJson(USER_SCALE_OVERRIDE_STORAGE_KEY, store);
}

function scenePointFromEvent(scene, event) {
  const box = scene.getBoundingClientRect();
  const nx = (event.clientX - box.left) / Math.max(box.width, 1);
  const ny = (event.clientY - box.top) / Math.max(box.height, 1);
  return {
    nx: Math.min(1, Math.max(0, nx)),
    ny: Math.min(1, Math.max(0, ny))
  };
}

function markerEl(point, label) {
  const el = document.createElement('span');
  el.className = 'cal-marker';
  el.setAttribute('data-cal-marker', label);
  el.style.left = `${point.nx * 100}%`;
  el.style.top = `${point.ny * 100}%`;
  el.textContent = label;
  return el;
}

function lineEl(a, b, scene) {
  const el = document.createElement('span');
  el.className = 'cal-line';
  const w = scene.clientWidth || 1;
  const h = scene.clientHeight || 1;
  const x1 = a.nx * w;
  const y1 = a.ny * h;
  const x2 = b.nx * w;
  const y2 = b.ny * h;
  el.style.left = `${x1}px`;
  el.style.top = `${y1}px`;
  el.style.width = `${Math.hypot(x2 - x1, y2 - y1)}px`;
  el.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI)}deg)`;
  return el;
}

function paintCalibrationScene(scene, calibration, pending) {
  scene.querySelectorAll('[data-cal-marker], .cal-line').forEach((el) => el.remove());
  (calibration.references || []).forEach((ref, index) => {
    scene.appendChild(markerEl(ref.pointA, String(index + 1)));
    scene.appendChild(markerEl(ref.pointB, String(index + 1)));
    scene.appendChild(lineEl(ref.pointA, ref.pointB, scene));
  });
  if (pending.a) scene.appendChild(markerEl(pending.a, 'A'));
  if (pending.b) {
    scene.appendChild(markerEl(pending.b, 'B'));
    scene.appendChild(lineEl(pending.a, pending.b, scene));
  }
}

function listReferences(doc, calibration) {
  const list = doc.getElementById('photo-scale-ref-list');
  if (!list) return;
  if (!calibration.references.length) {
    list.textContent = 'No known reference yet. Mark two points, enter meters, then add.';
    return;
  }
  list.innerHTML = calibration.references
    .map(
      (ref) =>
        `<li data-ref-id="${ref.id}">${ref.kind} · ${ref.knownMeters} m · ${ref.depthBand} · ${
          Number.isFinite(ref.pixelsPerMeter) ? `${ref.pixelsPerMeter.toFixed(1)} px/m` : 'unscaled'
        } <button type="button" data-remove-ref="${ref.id}">remove</button></li>`
    )
    .join('');
}

function applyPhysicalScene(scene, options) {
  const placement = scene.querySelector('[data-role="placement"]');
  const img = scene.querySelector('img.cutout');
  const overlay = scene.querySelector('[data-physical-blocked]');
  const shadow = scene.querySelector('.ground-shadow');
  if (!placement || !img) return null;
  const canvas = parseCanvas(scene);
  const bbox = parseBbox(scene);
  const depthId = scene.getAttribute('data-lock-depth') || options.depthId || 'middle';
  const growthStage = scene.getAttribute('data-growth-stage') || options.growthStage || 'mature';
  const visualForm = scene.getAttribute('data-visual-form') || options.visualForm || 'unknown';
  const slug =
    scene.getAttribute('data-canonical-slug') ||
    (scene.closest('article.job') && scene.closest('article.job').id.replace(/^job-/, '')) ||
    options.canonicalSlug ||
    'mango';
  const rangeBand = scene.getAttribute('data-lock-range-band') || options.rangeBand || RANGE_BANDS.MID;
  const sizeScenario = scene.getAttribute('data-size-scenario') || options.sizeScenario || SIZE_SCENARIOS.NATURAL_MATURE;
  const scaleInput = {
    canonicalSlug: slug,
    growthStage,
    visualForm,
    sizeScenario,
    rangeBand,
    userConfirmed: options.userConfirmed,
    photoCalibration: options.calibration,
    lockScaleMode: scene.getAttribute('data-lock-scale-mode') || options.lockScaleMode || null,
    userOverride: options.userOverride,
    bbox,
    canvasHeight: canvas.height,
    canvasWidth: canvas.width,
    sceneWidthPx: scene.clientWidth || 480,
    sceneHeightPx: scene.clientHeight || 360,
    depthId
  };
  let result;
  if (visualForm === 'tree') {
    const tree = computeTreePhysicalScale({
      ...scaleInput,
      architectureMode: scene.getAttribute('data-architecture-mode') || options.architectureMode || null,
      ownerPreferredRangePosition: scene.getAttribute('data-lock-range-band')
        ? null
        : loadOwnerPreferredRange(currentPhotoKey(scene.ownerDocument || document), slug)
    });
    if (tree.ok) {
      result = tree.scale;
    } else {
      const resolved = resolvePhysicalScaleEvidence({
        canonicalSlug: slug,
        visualForm: tree.visualForm || visualForm,
        growthStage,
        sizeScenario,
        userConfirmed: options.userConfirmed
      });
      result = computePhysicalSceneScale({
        ...scaleInput,
        visualForm: tree.visualForm || visualForm,
        resolvedEvidence: resolved
      });
    }
  } else {
    const resolved = resolvePhysicalScaleEvidence({
      canonicalSlug: slug,
      visualForm,
      growthStage,
      sizeScenario,
      userConfirmed: options.userConfirmed
    });
    result = computePhysicalSceneScale({
      ...scaleInput,
      resolvedEvidence: resolved
    });
  }
  const depth = PHYSICAL_PLACEMENT[depthId] || PHYSICAL_PLACEMENT.middle;
  placement.style.left = '50%';
  placement.style.bottom = `${result.yBottomPct != null ? result.yBottomPct : depth.yBottomPct}%`;
  placement.style.transform = 'translateX(-50%)';
  placement.style.width = 'auto';
  placement.style.maxWidth = 'none';
  placement.style.overflow = 'visible';
  const ready = result.status === 'PHYSICAL_SCALE_READY' || result.status === 'PHYSICAL_SCALE_ESTIMATED';
  if (ready) {
    const imgPx = result.imgHeightPx != null ? result.imgHeightPx : ((result.imgHeightPct || result.visibleHeightPct) / 100) * (scene.clientHeight || 360);
    img.style.maxHeight = 'none';
    img.style.maxWidth = 'none';
    img.style.height = `${imgPx}px`;
    img.style.width = 'auto';
    img.style.transform = 'none';
    img.style.opacity = '';
    const pad = Number(result.transparentBottomPadRatio);
    img.style.marginBottom = Number.isFinite(pad) && pad > 0 ? `${-(pad * imgPx)}px` : '0px';
    if (overlay) overlay.hidden = true;
    const shadowSpec = contactShadowForScale({
      heightPct: Math.min(result.visibleHeightPct || 54, 90),
      depthId
    });
    if (shadow) {
      shadow.style.width = `${shadowSpec.widthPct}%`;
      shadow.style.height = `${shadowSpec.heightPx}px`;
      shadow.style.opacity = String(shadowSpec.opacity);
      shadow.style.filter = `blur(${shadowSpec.blurPx}px)`;
    }
  } else {
    img.style.maxHeight = '54%';
    img.style.height = '';
    img.style.width = '';
    img.style.opacity = '';
    if (overlay) overlay.hidden = true;
  }
  return result;
}

function currentSlug(doc) {
  const article = doc.querySelector('#job-mango') || doc.querySelector('article.job[data-visual-form="tree"]');
  return article ? article.id.replace(/^job-/, '') : 'mango';
}

function currentStage(doc) {
  const scene = doc.querySelector('.physical-v1-scene');
  return (scene && scene.getAttribute('data-growth-stage')) || 'mature';
}

function syncPhotoScaleChoiceUi(doc, choice, calibration) {
  const prompt = doc.getElementById('photo-scale-choice');
  const harness = doc.getElementById('photo-scale-harness');
  const later = doc.getElementById('photo-scale-calibrate-later');
  const status = doc.getElementById('photo-scale-status');
  const calibrated = choice.photoScaleState === PHOTO_SCALE_STATE.CALIBRATED;
  const showHarness = calibrated || (choice.intent === 'calibrate' && !choice.calibrationDismissedForNow);
  if (prompt) prompt.hidden = calibrated || choice.calibrationDismissedForNow || choice.intent === 'calibrate';
  if (harness) harness.hidden = !showHarness;
  if (later) later.hidden = !(choice.calibrationDismissedForNow && !calibrated);
  if (status) {
    if (calibrated) {
      const n = (calibration.references || []).length;
      status.textContent = `PHOTO_SCALE_STATE = CALIBRATED · reused for all placements on this photo · ${n} reference(s) · Calibrated suggested size · not a survey`;
    } else {
      status.textContent =
        'PHOTO_SCALE_STATE = NOT_CALIBRATED · Estimated scale · Garden Design is fully usable · calibration optional · not meter accuracy';
    }
  }
}

function refreshPhysical(doc) {
  const calibration = loadCalibration();
  const photoKey = currentPhotoKey(doc);
  const choice = resolvePhotoScaleChoice(loadChoiceStore(), photoKey, calibration);
  const slug = currentSlug(doc);
  const stage = currentStage(doc);
  const storedConfirmed = loadUserConfirmed(slug, stage);
  const userConfirmed = storedConfirmed
    ? classifyUserConfirmedDimension({ ...storedConfirmed, growthStage: stage })
    : { growthStage: stage };
  const override = loadOverride(slug);
  const rangeBand = loadRangeBand();
  const sizeScenario = loadSizeScenario();
  const calScene = doc.querySelector('.photo-cal-scene');
  if (calScene) paintCalibrationScene(calScene, calibration, doc.__cruvitPendingCal || {});
  listReferences(doc, calibration);
  syncPhotoScaleChoiceUi(doc, choice, calibration);
  let last = null;
  doc.querySelectorAll('.physical-v1-scene').forEach((scene) => {
    last = applyPhysicalScene(scene, {
      calibration,
      userConfirmed,
      userOverride: override,
      rangeBand,
      sizeScenario,
      canonicalSlug: slug,
      growthStage: scene.getAttribute('data-growth-stage') || stage,
      visualForm: scene.getAttribute('data-visual-form')
    });
  });
  const readout = doc.querySelector('[data-physical-scale-readout]');
  if (readout && last) {
    if (last.scaleMode === PHOTO_SCALE_MODE.CALIBRATED && last.status === 'PHYSICAL_SCALE_READY') {
      const spread =
        last.impliedSpreadM != null ? `implied spread ${last.impliedSpreadM.toFixed(1)} m` : 'spread n/a';
      readout.textContent = `${last.label}: height ${last.displayHeightM.toFixed(1)} m · ${spread} · reused for every placement on this photo · not a survey`;
    } else {
      const botanical =
        last.botanicalHeightM != null
          ? `botanical range known (${last.botanicalEvidenceClass}) but not applied as meters`
          : `botanical meters ${last.botanicalEvidenceClass || 'UNKNOWN'}`;
      readout.textContent = `${last.label}. ${botanical}. Garden Design is not blocked. Manual resize always available.`;
    }
  }
  const arch = doc.querySelector('[data-architecture-class]');
  if (arch && last) arch.textContent = last.architectureClass || 'UNKNOWN';
  const evidenceStatus = doc.querySelector('[data-source-evidence-status]');
  if (evidenceStatus) {
    const resolved = resolvePhysicalScaleEvidence({
      canonicalSlug: slug,
      growthStage: stage,
      visualForm: 'tree',
      sizeScenario,
      userConfirmed
    });
    evidenceStatus.textContent = `${resolved.evidenceClass} · ${resolved.evidenceScope || 'SCOPE_UNSET'} · ${
      resolved.sizeScenario || sizeScenario
    } · ${resolved.source ? `${resolved.source.provider} ${resolved.source.publication || resolved.source.sourceId}` : 'no source'}`;
  }
  const suggested = doc.querySelector('[data-suggested-size-label]');
  if (suggested && last) suggested.textContent = last.label;
  doc.querySelectorAll('[data-range-band]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-range-band') === rangeBand ? 'true' : 'false');
  });
  doc.querySelectorAll('[data-size-scenario]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-size-scenario') === sizeScenario ? 'true' : 'false');
  });
  return last;
}

function wirePhotoCalibration(doc) {
  const scene = doc.querySelector('.photo-cal-scene');
  if (!scene || scene.dataset.physicalWired) return;
  scene.dataset.physicalWired = '1';
  doc.__cruvitPendingCal = {};
  scene.addEventListener('click', (event) => {
    const point = scenePointFromEvent(scene, event);
    const pending = doc.__cruvitPendingCal || {};
    if (!pending.a || pending.b) doc.__cruvitPendingCal = { a: point };
    else doc.__cruvitPendingCal = { a: pending.a, b: point };
    refreshPhysical(doc);
  });
  const add = doc.getElementById('photo-scale-add');
  if (add) {
    add.addEventListener('click', () => {
      const pending = doc.__cruvitPendingCal || {};
      const meters = finitePositive(doc.getElementById('photo-scale-meters') && doc.getElementById('photo-scale-meters').value);
      const kind = (doc.getElementById('photo-scale-kind') && doc.getElementById('photo-scale-kind').value) || 'custom';
      const depthBand = (doc.getElementById('photo-scale-depth') && doc.getElementById('photo-scale-depth').value) || 'near';
      const box = scene.getBoundingClientRect();
      const added = addKnownReference(loadCalibration(), {
        pointA: pending.a,
        pointB: pending.b,
        knownMeters: meters,
        kind: REFERENCE_KINDS.includes(kind) ? kind : 'custom',
        depthBand,
        sceneWidthPx: box.width,
        sceneHeightPx: box.height
      });
      if (!added.ok) {
        const err = doc.getElementById('photo-scale-error');
        if (err) err.textContent = added.code;
        return;
      }
      writeJson(PHOTO_SCALE_STORAGE_KEY, added.calibration);
      doc.__cruvitPendingCal = {};
      const err = doc.getElementById('photo-scale-error');
      if (err) err.textContent = '';
      refreshPhysical(doc);
    });
  }
  const list = doc.getElementById('photo-scale-ref-list');
  if (list) {
    list.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-ref]');
      if (!btn) return;
      const next = removeKnownReference(loadCalibration(), btn.getAttribute('data-remove-ref'));
      writeJson(PHOTO_SCALE_STORAGE_KEY, next);
      refreshPhysical(doc);
    });
  }
}

function wireConfirmedAndOverride(doc) {
  const confirm = doc.getElementById('physical-user-confirm');
  if (confirm && !confirm.dataset.physicalWired) {
    confirm.dataset.physicalWired = '1';
    confirm.addEventListener('click', () => {
      const slug = currentSlug(doc);
      const stage = currentStage(doc);
      const visualForm =
        (doc.querySelector('.physical-v1-scene') &&
          doc.querySelector('.physical-v1-scene').getAttribute('data-visual-form')) ||
        'tree';
      const classified = classifyUserConfirmedDimension({
        heightMMin: doc.getElementById('physical-height-min') && doc.getElementById('physical-height-min').value,
        heightMMax: doc.getElementById('physical-height-max') && doc.getElementById('physical-height-max').value,
        growthStage: stage,
        visualForm
      });
      const err = doc.getElementById('physical-confirm-error');
      if (!classified.mayDrivePhysicalMeterPreview) {
        if (err) err.textContent = classified.note;
        return;
      }
      saveUserConfirmed(slug, stage, {
        heightMMin: classified.heightM.min,
        heightMMax: classified.heightM.max,
        visualForm,
        evidenceClass: classified.evidenceClass
      });
      if (err) err.textContent = '';
      refreshPhysical(doc);
    });
  }
  const clear = doc.getElementById('physical-user-clear');
  if (clear && !clear.dataset.physicalWired) {
    clear.dataset.physicalWired = '1';
    clear.addEventListener('click', () => {
      saveUserConfirmed(currentSlug(doc), currentStage(doc), null);
      refreshPhysical(doc);
    });
  }
  const override = doc.getElementById('physical-override-multiplier');
  if (override && !override.dataset.physicalWired) {
    override.dataset.physicalWired = '1';
    const persist = () => {
      const value = finitePositive(override.value) || 1;
      const label = doc.querySelector('[data-physical-override-value]');
      if (label) label.textContent = value.toFixed(2);
      saveOverride(currentSlug(doc), { kind: 'multiplier', value });
      refreshPhysical(doc);
    };
    override.addEventListener('input', persist);
    override.addEventListener('change', persist);
    const stored = loadOverride(currentSlug(doc));
    if (stored && stored.kind === 'multiplier' && finitePositive(stored.value)) {
      override.value = String(stored.value);
    }
  }
  const slug = currentSlug(doc);
  const stage = currentStage(doc);
  const stored = loadUserConfirmed(slug, stage);
  if (stored) {
    const min = doc.getElementById('physical-height-min');
    const max = doc.getElementById('physical-height-max');
    if (min && stored.heightMMin) min.value = String(stored.heightMMin);
    if (max && stored.heightMMax) max.value = String(stored.heightMMax);
  }
  doc.querySelectorAll('[data-range-band]').forEach((btn) => {
    if (btn.dataset.physicalWired) return;
    btn.dataset.physicalWired = '1';
    btn.addEventListener('click', () => {
      saveRangeBand(btn.getAttribute('data-range-band'));
      refreshPhysical(doc);
    });
  });
  doc.querySelectorAll('[data-size-scenario]').forEach((btn) => {
    if (btn.dataset.physicalWired) return;
    btn.dataset.physicalWired = '1';
    btn.addEventListener('click', () => {
      saveSizeScenario(btn.getAttribute('data-size-scenario'));
      refreshPhysical(doc);
    });
  });
  const band = loadRangeBand();
  const scenario = loadSizeScenario();
  doc.querySelectorAll('[data-range-band]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-range-band') === band ? 'true' : 'false');
  });
  doc.querySelectorAll('[data-size-scenario]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.getAttribute('data-size-scenario') === scenario ? 'true' : 'false');
  });
}

function wirePhotoScaleChoice(doc) {
  const calibrate = doc.getElementById('photo-scale-calibrate');
  const cont = doc.getElementById('photo-scale-continue');
  const later = doc.getElementById('photo-scale-calibrate-later');
  if (calibrate && !calibrate.dataset.physicalWired) {
    calibrate.dataset.physicalWired = '1';
    calibrate.addEventListener('click', () => {
      saveChoice(currentPhotoKey(doc), {
        intent: 'calibrate',
        calibrationDismissedForNow: false,
        showCalibratePrompt: false,
        photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED
      });
      refreshPhysical(doc);
    });
  }
  if (cont && !cont.dataset.physicalWired) {
    cont.dataset.physicalWired = '1';
    cont.addEventListener('click', () => {
      saveChoice(currentPhotoKey(doc), {
        intent: null,
        calibrationDismissedForNow: true,
        showCalibratePrompt: false,
        photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED
      });
      refreshPhysical(doc);
    });
  }
  if (later && !later.dataset.physicalWired) {
    later.dataset.physicalWired = '1';
    later.addEventListener('click', () => {
      saveChoice(currentPhotoKey(doc), {
        intent: 'calibrate',
        calibrationDismissedForNow: false,
        showCalibratePrompt: false
      });
      refreshPhysical(doc);
    });
  }
}

export function initPhysicalScaleFoundationV1(doc) {
  const documentRef = doc || (typeof document !== 'undefined' ? document : null);
  if (!documentRef) return { wired: false };
  seedMangoGardenDesignPreference(currentPhotoKey(documentRef));
  wirePhotoCalibration(documentRef);
  wirePhotoScaleChoice(documentRef);
  wireConfirmedAndOverride(documentRef);
  refreshPhysical(documentRef);
  documentRef.addEventListener('calibration-ui-status', () => refreshPhysical(documentRef));
  return { wired: true, mangoHardCoded: false, gardenDesignBlocked: false };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initPhysicalScaleFoundationV1(document));
  } else {
    initPhysicalScaleFoundationV1(document);
  }
}
