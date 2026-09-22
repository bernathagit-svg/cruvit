/**
 * CRUVIT Garden Design Auto Blend V1
 *
 * Production runtime visual integration for transparent plant cutouts.
 * Non-destructive: never mutates the garden photo or plant asset bytes.
 * Generic/data-driven: no species-specific branches.
 *
 * V1 addresses local tone/sharpness/contact integration only.
 * It does NOT repair botanical identity, silhouette, inherent perspective,
 * crop, or physical-size authority.
 */
import {
  LOCAL_SCENE_MATCH_BOUNDS,
  RUNTIME_BLEND_V2,
  adaptFromLocalScene,
  blendV2FilterCss,
  contactShadowForScale,
  sampleLocalSceneFromRgba
} from './asset-factory-v1/composition-calibration-v2.js';

export const GARDEN_DESIGN_AUTO_BLEND_V1_VERSION = 'garden-design-auto-blend-v1';

export const AUTO_BLEND_V1_POLICY = Object.freeze({
  nonDestructive: true,
  altersGardenPhoto: false,
  altersPlantAssetBytes: false,
  usesAi: false,
  paidCalls: 0,
  speciesSpecificRules: false,
  hueRotationAllowed: false,
  canAddress: Object.freeze([
    'STICKER_LOOK',
    'SHARPNESS_MATCH',
    'COLOR_TONAL_MATCH',
    'GROUND_CONTACT',
    'HALO'
  ]),
  cannotAddress: Object.freeze([
    'BOTANICAL_IDENTITY',
    'SILHOUETTE',
    'PERSPECTIVE_INHERENT_IN_ASSET',
    'PHYSICAL_SIZE_AUTHORITY',
    'CROP_VISIBLE_IN_CONTEXT'
  ])
});

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function autoBlendMetadata(layer = {}) {
  const metadata = safeObject(layer.metadata);
  const blend = safeObject(metadata.autoBlendV1);
  return {
    enabled: blend.enabled === true,
    version: blend.version || GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,
    source: blend.source || null,
    adaptation: safeObject(blend.adaptation),
    shadow: safeObject(blend.shadow),
    sample: safeObject(blend.sample)
  };
}

export function writeAutoBlendMetadata(layer = {}, result = {}) {
  const metadata = safeObject(layer.metadata);
  const next = {
    ...metadata,
    autoBlendV1: {
      enabled: result.enabled === true,
      version: GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,
      source: result.source || null,
      adaptation: safeObject(result.adaptation),
      shadow: safeObject(result.shadow),
      sample: safeObject(result.sample),
      sampledAtPlacement: result.sampledAtPlacement || null,
      recalculatesAfterMove: true,
      paidCalls: 0,
      nonDestructive: true
    }
  };
  layer.metadata = next;
  return layer;
}

export function disableAutoBlend(layer = {}) {
  const current = autoBlendMetadata(layer);
  writeAutoBlendMetadata(layer, {
    enabled: false,
    source: current.source,
    adaptation: current.adaptation,
    shadow: current.shadow,
    sample: current.sample,
    sampledAtPlacement: null
  });
  return layer;
}

function displayedImageMapping(imageEl) {
  const rect = imageEl && imageEl.getBoundingClientRect ? imageEl.getBoundingClientRect() : null;
  const naturalWidth = Number(imageEl && imageEl.naturalWidth);
  const naturalHeight = Number(imageEl && imageEl.naturalHeight);
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !(naturalWidth > 0) || !(naturalHeight > 0)) {
    return null;
  }

  // #imgAfter uses object-fit: cover. Map displayed pixels back to source pixels.
  const scale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  const cropX = Math.max(0, (renderedWidth - rect.width) / 2);
  const cropY = Math.max(0, (renderedHeight - rect.height) / 2);

  return {
    rect,
    naturalWidth,
    naturalHeight,
    scale,
    cropX,
    cropY
  };
}

function displayPointToSource(mapping, displayX, displayY) {
  return {
    x: clamp((displayX + mapping.cropX) / mapping.scale, 0, mapping.naturalWidth - 1),
    y: clamp((displayY + mapping.cropY) / mapping.scale, 0, mapping.naturalHeight - 1)
  };
}

function regionAround(mapping, point, displayWidth, displayHeight) {
  const sourceW = Math.max(8, Math.round(displayWidth / mapping.scale));
  const sourceH = Math.max(8, Math.round(displayHeight / mapping.scale));
  return {
    x: clamp(Math.round(point.x - sourceW / 2), 0, Math.max(0, mapping.naturalWidth - sourceW)),
    y: clamp(Math.round(point.y - sourceH / 2), 0, Math.max(0, mapping.naturalHeight - sourceH)),
    width: Math.min(sourceW, mapping.naturalWidth),
    height: Math.min(sourceH, mapping.naturalHeight)
  };
}

async function imagePixels(imageEl) {
  const mapping = displayedImageMapping(imageEl);
  if (!mapping) return { ok: false, reason: 'BASE_IMAGE_NOT_READY' };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = mapping.naturalWidth;
    canvas.height = mapping.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: 'CANVAS_CONTEXT_UNAVAILABLE' };

    // The saved Garden photo is normally a temporary cross-origin signed URL.
    // Fetch bytes with CORS and draw an ImageBitmap so the sampling canvas stays readable.
    const src = String(imageEl.currentSrc || imageEl.src || '');
    if (src && typeof fetch === 'function' && typeof createImageBitmap === 'function') {
      const res = await fetch(src, { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error('garden-photo-fetch-' + res.status);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(bitmap, 0, 0, mapping.naturalWidth, mapping.naturalHeight);
      if (typeof bitmap.close === 'function') bitmap.close();
    } else {
      ctx.drawImage(imageEl, 0, 0, mapping.naturalWidth, mapping.naturalHeight);
    }
    return { ok: true, ctx, mapping };
  } catch (err) {
    return {
      ok: false,
      reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE',
      detail: String(err && err.message || err)
    };
  }
}

function sampleRegion(ctx, mapping, region) {
  try {
    const x = Math.max(0, Math.min(mapping.naturalWidth - 1, Math.floor(region.x)));
    const y = Math.max(0, Math.min(mapping.naturalHeight - 1, Math.floor(region.y)));
    const width = Math.max(1, Math.min(mapping.naturalWidth - x, Math.floor(region.width)));
    const height = Math.max(1, Math.min(mapping.naturalHeight - y, Math.floor(region.height)));
    const data = ctx.getImageData(x, y, width, height);
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

export async function sampleLocalGardenForLayer(options = {}) {
  const imageEl = options.imageEl || null;
  const sceneEl = options.sceneEl || null;
  const layerEl = options.layerEl || null;
  if (!imageEl || !sceneEl || !layerEl) {
    return { available: false, reason: 'LAYER_OR_GARDEN_IMAGE_UNAVAILABLE' };
  }

  const pixels = await imagePixels(imageEl);
  if (!pixels.ok) {
    return { available: false, reason: pixels.reason || 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }

  const sceneRect = sceneEl.getBoundingClientRect();
  const layerRect = layerEl.getBoundingClientRect();
  const imageRect = pixels.mapping.rect;

  const groundXDisplay = layerRect.left + layerRect.width / 2 - imageRect.left;
  const groundYDisplay = layerRect.bottom - imageRect.top;
  const bodyXDisplay = layerRect.left + layerRect.width / 2 - imageRect.left;
  const bodyYDisplay = layerRect.top + layerRect.height * 0.55 - imageRect.top;

  const groundPoint = displayPointToSource(pixels.mapping, groundXDisplay, groundYDisplay);
  const bodyPoint = displayPointToSource(pixels.mapping, bodyXDisplay, bodyYDisplay);

  const ambientRegion = regionAround(
    pixels.mapping,
    bodyPoint,
    clamp(layerRect.width * 0.65, 48, 180),
    clamp(layerRect.height * 0.28, 36, 120)
  );
  const groundRegion = regionAround(
    pixels.mapping,
    groundPoint,
    clamp(layerRect.width * 0.75, 56, 200),
    34
  );

  const ambient = sampleRegion(pixels.ctx, pixels.mapping, ambientRegion);
  const ground = sampleRegion(pixels.ctx, pixels.mapping, groundRegion);

  if (!ambient.available && !ground.available) {
    return { available: false, reason: 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }

  const primary = ambient.available ? ambient : ground;
  return {
    available: true,
    luminance: primary.luminance,
    contrast: primary.contrast,
    saturation: primary.saturation,
    ambient,
    ground,
    placement: {
      x: finite(options.layer?.x, null),
      y: finite(options.layer?.y, null)
    },
    sampleRegions: { ambient: ambientRegion, ground: groundRegion },
    sceneWidthPx: sceneRect.width,
    sceneHeightPx: sceneRect.height
  };
}

export function computeAutoBlendFromSample(sample = {}, options = {}) {
  const adaptation = adaptFromLocalScene(sample);
  const sceneHeightPx = Math.max(1, finite(options.sceneHeightPx, 700));
  const layerHeightPx = Math.max(1, finite(options.layerHeightPx, sceneHeightPx * 0.3));
  const heightPct = clamp((layerHeightPx / sceneHeightPx) * 100, 18, 92);
  const y = clamp(finite(options.placementY, 0.8), 0.04, 0.96);
  const depthId = y >= 0.82 ? 'near' : (y <= 0.62 ? 'far' : 'middle');
  const baseShadow = contactShadowForScale({ heightPct, depthId });

  const groundLuma = sample?.ground?.available ? sample.ground.luminance : sample.luminance;
  const groundContrast = sample?.ground?.available ? sample.ground.contrast : sample.contrast;
  const shadowOpacityFactor = clamp(1.18 - finite(groundLuma, 0.48) * 0.42, 0.82, 1.15);
  const shadowSoftnessFactor = clamp(1.08 - finite(groundContrast, 0.18) * 0.45, 0.85, 1.12);

  const shadow = {
    ...baseShadow,
    opacity: clamp(baseShadow.opacity * shadowOpacityFactor, 0.10, 0.34),
    blurPx: clamp(baseShadow.blurPx * shadowSoftnessFactor, 5, 18),
    widthPct: clamp(baseShadow.widthPct, 42, 68),
    heightPx: clamp(baseShadow.heightPx, 4, 12),
    source: sample?.available ? 'local-ground-sample' : 'conservative-default'
  };

  return {
    enabled: true,
    version: GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,
    source: sample?.available ? 'local-scene-sample' : (sample?.reason || 'conservative-default'),
    adaptation: {
      brightness: adaptation.brightness,
      contrast: adaptation.contrast,
      saturate: adaptation.saturate,
      blurPx: adaptation.blurPx,
      opacity: adaptation.opacity,
      hueRotateDeg: 0
    },
    shadow,
    sample: sample?.available
      ? {
          available: true,
          luminance: sample.luminance,
          contrast: sample.contrast,
          saturation: sample.saturation,
          ambient: sample.ambient?.available ? {
            luminance: sample.ambient.luminance,
            contrast: sample.ambient.contrast,
            saturation: sample.ambient.saturation
          } : null,
          ground: sample.ground?.available ? {
            luminance: sample.ground.luminance,
            contrast: sample.ground.contrast,
            saturation: sample.ground.saturation
          } : null
        }
      : { available: false, reason: sample?.reason || 'LOCAL_SCENE_SAMPLE_UNAVAILABLE' },
    sampledAtPlacement: {
      x: finite(options.placementX, null),
      y: finite(options.placementY, null)
    },
    bounds: LOCAL_SCENE_MATCH_BOUNDS,
    paidCalls: 0,
    nonDestructive: true
  };
}

export async function calculateAutoBlendForLayer(options = {}) {
  const sample = await sampleLocalGardenForLayer(options);
  const layerEl = options.layerEl || null;
  const sceneEl = options.sceneEl || null;
  const result = computeAutoBlendFromSample(sample, {
    sceneHeightPx: sceneEl?.getBoundingClientRect?.().height,
    layerHeightPx: layerEl?.getBoundingClientRect?.().height,
    placementX: options.layer?.x,
    placementY: options.layer?.y
  });
  if (options.layer) writeAutoBlendMetadata(options.layer, result);
  return result;
}

export function blendFilterCss(blend = {}) {
  const adaptation = safeObject(blend.adaptation);
  return blendV2FilterCss({
    ...RUNTIME_BLEND_V2.defaults,
    ...adaptation,
    hueRotateDeg: 0
  });
}

export function applyAutoBlendToLayerElement(layer = {}, layerEl = null) {
  if (!layerEl) return { applied: false, reason: 'LAYER_ELEMENT_REQUIRED' };
  const blend = autoBlendMetadata(layer);
  const img = layerEl.querySelector('img.gd-plant-cutout');
  const shadow = layerEl.querySelector('.gd-plant-shadow');

  layerEl.classList.toggle('gd-auto-blended', blend.enabled === true);

  if (!blend.enabled) {
    if (img) {
      img.style.removeProperty('filter');
      img.style.removeProperty('opacity');
    }
    if (shadow) {
      shadow.style.removeProperty('width');
      shadow.style.removeProperty('height');
      shadow.style.removeProperty('opacity');
      shadow.style.removeProperty('filter');
      shadow.style.removeProperty('transform');
    }
    return { applied: false, reason: 'DISABLED' };
  }

  if (img) {
    img.style.filter = blendFilterCss(blend);
    img.style.opacity = String(clamp(
      finite(blend.adaptation.opacity, RUNTIME_BLEND_V2.defaults.opacity),
      LOCAL_SCENE_MATCH_BOUNDS.opacity.min,
      LOCAL_SCENE_MATCH_BOUNDS.opacity.max
    ));
  }

  if (shadow) {
    const spec = safeObject(blend.shadow);
    shadow.style.width = clamp(finite(spec.widthPct, 55), 35, 72) + '%';
    shadow.style.height = clamp(finite(spec.heightPx, 7), 3, 14) + 'px';
    shadow.style.opacity = String(clamp(finite(spec.opacity, 0.2), 0.08, 0.36));
    shadow.style.filter = 'blur(' + clamp(finite(spec.blurPx, 10), 4, 20) + 'px)';
    shadow.style.transform = 'translateY(-2px)';
  }

  return {
    applied: true,
    version: GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,
    source: blend.source || null
  };
}
