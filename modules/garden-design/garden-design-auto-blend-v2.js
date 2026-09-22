/**
 * CRUVIT Garden Design Auto Blend V2
 *
 * Production runtime scene integration for transparent plant cutouts.
 * Non-destructive, reversible, zero-paid-AI, generic across species.
 *
 * V2 compares the cutout's own pixel statistics with the local Garden scene
 * instead of adapting from scene statistics alone.
 */
import {
  contactShadowForScale
} from './asset-factory-v1/composition-calibration-v2.js';

export const GARDEN_DESIGN_AUTO_BLEND_V2_VERSION = 'garden-design-auto-blend-v2';

export const AUTO_BLEND_V2_POLICY = Object.freeze({
  nonDestructive: true,
  reversible: true,
  altersGardenPhoto: false,
  altersPlantAssetBytes: false,
  usesAi: false,
  paidCalls: 0,
  speciesSpecificRules: false,
  comparesPlantToLocalScene: true,
  canAddress: Object.freeze([
    'STICKER_LOOK',
    'SHARPNESS_MATCH',
    'COLOR_TONAL_MATCH',
    'LOCAL_EXPOSURE_MATCH',
    'LOCAL_WHITE_BALANCE_PROXY',
    'GROUND_CONTACT',
    'HALO',
    'EDGE_COLOR_BLEED'
  ]),
  cannotAddress: Object.freeze([
    'BOTANICAL_IDENTITY',
    'SILHOUETTE',
    'PERSPECTIVE_INHERENT_IN_ASSET',
    'PHYSICAL_SIZE_AUTHORITY',
    'CROP_VISIBLE_IN_CONTEXT',
    'TRUE_3D_RELIGHTING'
  ])
});

export const AUTO_BLEND_V2_BOUNDS = Object.freeze({
  brightness: Object.freeze({ min: 0.84, max: 1.08 }),
  contrast: Object.freeze({ min: 0.84, max: 1.05 }),
  saturate: Object.freeze({ min: 0.72, max: 1.00 }),
  blurPx: Object.freeze({ min: 0.12, max: 1.10 }),
  opacity: Object.freeze({ min: 0.95, max: 0.995 }),
  sepia: Object.freeze({ min: 0, max: 0.08 }),
  hueRotateDeg: Object.freeze({ min: -3, max: 3 }),
  edgeTintAlpha: Object.freeze({ min: 0.08, max: 0.22 }),
  edgeTintBlurPx: Object.freeze({ min: 0.35, max: 0.9 })
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

function rgbToSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 0 ? (max - min) / max : 0;
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function detailedStatsFromImageData(imageData, options = {}) {
  if (!imageData || !imageData.data || !imageData.width || !imageData.height) {
    return { available:false, reason:'PIXEL_DATA_UNAVAILABLE' };
  }
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const alphaAware = options.alphaAware === true;
  let weightSum = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumSat = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sharpSum = 0;
  let sharpWeight = 0;

  const lumaAt = (x, y) => {
    const i = (y * width + x) * 4;
    const a = data[i + 3] / 255;
    if (alphaAware && a < 0.08) return null;
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    return { l:luminance(r,g,b), a:alphaAware ? a : 1 };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      if (alphaAware && a < 0.08) continue;
      const w = alphaAware ? a : 1;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const l = luminance(r,g,b);
      weightSum += w;
      sumL += l * w;
      sumL2 += l * l * w;
      sumSat += rgbToSaturation(r,g,b) * w;
      sumR += r * w;
      sumG += g * w;
      sumB += b * w;

      if (x + 1 < width && y + 1 < height) {
        const right = lumaAt(x + 1, y);
        const down = lumaAt(x, y + 1);
        if (right && down) {
          const sw = Math.min(w, right.a, down.a);
          sharpSum += (Math.abs(l - right.l) + Math.abs(l - down.l)) * 0.5 * sw;
          sharpWeight += sw;
        }
      }
    }
  }

  if (weightSum <= 0) return { available:false, reason:'NO_VISIBLE_PIXELS' };
  const meanL = sumL / weightSum;
  const variance = Math.max(0, sumL2 / weightSum - meanL * meanL);
  const meanR = sumR / weightSum;
  const meanG = sumG / weightSum;
  const meanB = sumB / weightSum;

  return {
    available:true,
    luminance:meanL,
    contrast:Math.sqrt(variance),
    saturation:sumSat / weightSum,
    sharpness:sharpWeight > 0 ? sharpSum / sharpWeight : 0,
    meanRgb:{ r:meanR, g:meanG, b:meanB },
    warmth:meanR - meanB,
    tint:meanG - (meanR + meanB) * 0.5,
    sampleWidth:width,
    sampleHeight:height
  };
}

async function bitmapFromUrl(url) {
  const res = await fetch(String(url), { cache:'no-store', credentials:'omit' });
  if (!res.ok) throw new Error('image-fetch-' + res.status);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

async function imageDataFromUrl(url, maxDimension, alphaAware) {
  const bitmap = await bitmapFromUrl(url);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    if (!ctx) throw new Error('canvas-context-unavailable');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return {
      imageData:ctx.getImageData(0, 0, width, height),
      width,
      height,
      alphaAware
    };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

function displayedImageMapping(imageEl) {
  const rect = imageEl?.getBoundingClientRect?.();
  const naturalWidth = Number(imageEl?.naturalWidth);
  const naturalHeight = Number(imageEl?.naturalHeight);
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !(naturalWidth > 0) || !(naturalHeight > 0)) return null;
  const scale = Math.max(rect.width / naturalWidth, rect.height / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  return {
    rect,
    naturalWidth,
    naturalHeight,
    scale,
    cropX:Math.max(0, (renderedWidth - rect.width) / 2),
    cropY:Math.max(0, (renderedHeight - rect.height) / 2)
  };
}

function displayPointToSource(mapping, displayX, displayY) {
  return {
    x:clamp((displayX + mapping.cropX) / mapping.scale, 0, mapping.naturalWidth - 1),
    y:clamp((displayY + mapping.cropY) / mapping.scale, 0, mapping.naturalHeight - 1)
  };
}

function regionAround(mapping, point, displayWidth, displayHeight) {
  const sourceW = Math.max(8, Math.round(displayWidth / mapping.scale));
  const sourceH = Math.max(8, Math.round(displayHeight / mapping.scale));
  return {
    x:clamp(Math.round(point.x - sourceW / 2), 0, Math.max(0, mapping.naturalWidth - sourceW)),
    y:clamp(Math.round(point.y - sourceH / 2), 0, Math.max(0, mapping.naturalHeight - sourceH)),
    width:Math.min(sourceW, mapping.naturalWidth),
    height:Math.min(sourceH, mapping.naturalHeight)
  };
}

async function baseImageCanvas(imageEl) {
  const mapping = displayedImageMapping(imageEl);
  if (!mapping) return { ok:false, reason:'BASE_IMAGE_NOT_READY' };
  try {
    const bitmap = await bitmapFromUrl(imageEl.currentSrc || imageEl.src);
    const canvas = document.createElement('canvas');
    canvas.width = mapping.naturalWidth;
    canvas.height = mapping.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    if (!ctx) return { ok:false, reason:'CANVAS_CONTEXT_UNAVAILABLE' };
    ctx.drawImage(bitmap, 0, 0, mapping.naturalWidth, mapping.naturalHeight);
    if (typeof bitmap.close === 'function') bitmap.close();
    return { ok:true, ctx, mapping };
  } catch (err) {
    return { ok:false, reason:'LOCAL_SCENE_SAMPLE_UNAVAILABLE', detail:String(err?.message || err) };
  }
}

function statsFromRegion(ctx, mapping, region) {
  try {
    const x = Math.max(0, Math.min(mapping.naturalWidth - 1, Math.floor(region.x)));
    const y = Math.max(0, Math.min(mapping.naturalHeight - 1, Math.floor(region.y)));
    const width = Math.max(1, Math.min(mapping.naturalWidth - x, Math.floor(region.width)));
    const height = Math.max(1, Math.min(mapping.naturalHeight - y, Math.floor(region.height)));
    return detailedStatsFromImageData(ctx.getImageData(x, y, width, height), { alphaAware:false });
  } catch {
    return { available:false, reason:'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };
  }
}

export async function sampleLocalGardenV2(options = {}) {
  const imageEl = options.imageEl;
  const sceneEl = options.sceneEl;
  const layerEl = options.layerEl;
  if (!imageEl || !sceneEl || !layerEl) return { available:false, reason:'LAYER_OR_GARDEN_IMAGE_UNAVAILABLE' };

  const base = await baseImageCanvas(imageEl);
  if (!base.ok) return { available:false, reason:base.reason };

  const imageRect = base.mapping.rect;
  const layerRect = layerEl.getBoundingClientRect();
  const groundPoint = displayPointToSource(
    base.mapping,
    layerRect.left + layerRect.width / 2 - imageRect.left,
    layerRect.bottom - imageRect.top
  );
  const bodyPoint = displayPointToSource(
    base.mapping,
    layerRect.left + layerRect.width / 2 - imageRect.left,
    layerRect.top + layerRect.height * 0.50 - imageRect.top
  );

  const ambientRegion = regionAround(
    base.mapping,
    bodyPoint,
    clamp(layerRect.width * 0.95, 72, 250),
    clamp(layerRect.height * 0.42, 54, 180)
  );
  const groundRegion = regionAround(
    base.mapping,
    groundPoint,
    clamp(layerRect.width * 0.90, 72, 240),
    44
  );
  const ambient = statsFromRegion(base.ctx, base.mapping, ambientRegion);
  const ground = statsFromRegion(base.ctx, base.mapping, groundRegion);
  const primary = ambient.available ? ambient : ground;
  if (!primary.available) return { available:false, reason:'LOCAL_SCENE_SAMPLE_UNAVAILABLE' };

  return {
    available:true,
    ...primary,
    ambient,
    ground,
    sampleRegions:{ ambient:ambientRegion, ground:groundRegion }
  };
}

export async function samplePlantCutoutV2(options = {}) {
  const img = options.cutoutEl || options.layerEl?.querySelector?.('img.gd-plant-cutout');
  const url = img?.currentSrc || img?.src || '';
  if (!url) return { available:false, reason:'PLANT_CUTOUT_UNAVAILABLE' };
  try {
    const decoded = await imageDataFromUrl(url, 420, true);
    return detailedStatsFromImageData(decoded.imageData, { alphaAware:true });
  } catch (err) {
    return { available:false, reason:'PLANT_CUTOUT_SAMPLE_UNAVAILABLE', detail:String(err?.message || err) };
  }
}

function compressedRatio(target, source, strength, min, max, fallback) {
  const t = finite(target, null);
  const s = finite(source, null);
  if (!(t >= 0) || !(s > 0.0001)) return fallback;
  const ratio = t / s;
  return clamp(1 + (ratio - 1) * strength, min, max);
}

function rgb255(stats) {
  const rgb = stats?.meanRgb || {};
  return {
    r:Math.round(clamp(finite(rgb.r, 0.5), 0, 1) * 255),
    g:Math.round(clamp(finite(rgb.g, 0.5), 0, 1) * 255),
    b:Math.round(clamp(finite(rgb.b, 0.5), 0, 1) * 255)
  };
}

export function computeAutoBlendV2(scene = {}, plant = {}, options = {}) {
  const sceneReady = scene?.available === true;
  const plantReady = plant?.available === true;

  const brightness = plantReady && sceneReady
    ? compressedRatio(scene.luminance, plant.luminance, 0.48, AUTO_BLEND_V2_BOUNDS.brightness.min, AUTO_BLEND_V2_BOUNDS.brightness.max, 0.96)
    : 0.96;

  const contrast = plantReady && sceneReady
    ? compressedRatio(scene.contrast, plant.contrast, 0.30, AUTO_BLEND_V2_BOUNDS.contrast.min, AUTO_BLEND_V2_BOUNDS.contrast.max, 0.93)
    : 0.93;

  const saturate = plantReady && sceneReady
    ? compressedRatio(scene.saturation, plant.saturation, 0.48, AUTO_BLEND_V2_BOUNDS.saturate.min, AUTO_BLEND_V2_BOUNDS.saturate.max, 0.88)
    : 0.88;

  const sharpnessDelta = plantReady && sceneReady
    ? Math.max(0, finite(plant.sharpness, 0) - finite(scene.sharpness, 0))
    : 0.08;
  const blurPx = clamp(
    0.18 + sharpnessDelta * 5.5,
    AUTO_BLEND_V2_BOUNDS.blurPx.min,
    AUTO_BLEND_V2_BOUNDS.blurPx.max
  );

  const opacity = clamp(
    0.992 - Math.min(0.03, sharpnessDelta * 0.12),
    AUTO_BLEND_V2_BOUNDS.opacity.min,
    AUTO_BLEND_V2_BOUNDS.opacity.max
  );

  const warmthDelta = sceneReady && plantReady
    ? finite(scene.warmth, 0) - finite(plant.warmth, 0)
    : 0;
  const sepia = clamp(
    Math.max(0, warmthDelta) * 0.20,
    AUTO_BLEND_V2_BOUNDS.sepia.min,
    AUTO_BLEND_V2_BOUNDS.sepia.max
  );
  const hueRotateDeg = clamp(
    warmthDelta * -8,
    AUTO_BLEND_V2_BOUNDS.hueRotateDeg.min,
    AUTO_BLEND_V2_BOUNDS.hueRotateDeg.max
  );

  const edgeColor = rgb255(sceneReady ? scene : { meanRgb:{r:0.5,g:0.5,b:0.5} });
  const edgeTintAlpha = clamp(
    0.12 + Math.min(0.10, Math.abs(warmthDelta) * 0.20 + sharpnessDelta * 0.08),
    AUTO_BLEND_V2_BOUNDS.edgeTintAlpha.min,
    AUTO_BLEND_V2_BOUNDS.edgeTintAlpha.max
  );
  const edgeTintBlurPx = clamp(
    0.45 + sharpnessDelta * 2.5,
    AUTO_BLEND_V2_BOUNDS.edgeTintBlurPx.min,
    AUTO_BLEND_V2_BOUNDS.edgeTintBlurPx.max
  );

  const sceneHeightPx = Math.max(1, finite(options.sceneHeightPx, 700));
  const layerHeightPx = Math.max(1, finite(options.layerHeightPx, sceneHeightPx * 0.3));
  const heightPct = clamp((layerHeightPx / sceneHeightPx) * 100, 18, 92);
  const y = clamp(finite(options.placementY, 0.8), 0.04, 0.96);
  const depthId = y >= 0.82 ? 'near' : (y <= 0.62 ? 'far' : 'middle');
  const baseShadow = contactShadowForScale({ heightPct, depthId });

  const ground = scene?.ground?.available ? scene.ground : scene;
  const groundLuma = finite(ground?.luminance, 0.45);
  const groundContrast = finite(ground?.contrast, 0.18);
  const shadow = {
    ...baseShadow,
    opacity:clamp(baseShadow.opacity * (1.24 - groundLuma * 0.36), 0.16, 0.36),
    blurPx:clamp(baseShadow.blurPx * (1.12 - groundContrast * 0.35), 5, 16),
    widthPct:clamp(baseShadow.widthPct + 4, 48, 70),
    heightPx:clamp(baseShadow.heightPx, 4, 12),
    ambientOcclusionOpacity:clamp(0.12 + (1 - groundLuma) * 0.08, 0.11, 0.20),
    ambientOcclusionBlurPx:clamp(4 + (1 - groundContrast) * 3, 4, 8),
    source:sceneReady ? 'local-ground-sample-v2' : 'conservative-default-v2'
  };

  return {
    enabled:true,
    version:GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
    source:sceneReady && plantReady ? 'plant-to-local-scene-match' : 'conservative-default-v2',
    adaptation:{
      brightness,
      contrast,
      saturate,
      blurPx,
      opacity,
      sepia,
      hueRotateDeg,
      edgeTintColor:edgeColor,
      edgeTintAlpha,
      edgeTintBlurPx
    },
    shadow,
    scene:sceneReady ? {
      luminance:scene.luminance,
      contrast:scene.contrast,
      saturation:scene.saturation,
      sharpness:scene.sharpness,
      warmth:scene.warmth,
      meanRgb:scene.meanRgb
    } : { available:false, reason:scene?.reason || 'SCENE_SAMPLE_UNAVAILABLE' },
    plant:plantReady ? {
      luminance:plant.luminance,
      contrast:plant.contrast,
      saturation:plant.saturation,
      sharpness:plant.sharpness,
      warmth:plant.warmth,
      meanRgb:plant.meanRgb
    } : { available:false, reason:plant?.reason || 'PLANT_SAMPLE_UNAVAILABLE' },
    sampledAtPlacement:{
      x:finite(options.placementX, null),
      y:finite(options.placementY, null)
    },
    paidCalls:0,
    nonDestructive:true
  };
}

export function autoBlendMetadata(layer = {}) {
  const metadata = safeObject(layer.metadata);
  const v2 = safeObject(metadata.autoBlendV2);
  if (Object.keys(v2).length) {
    return {
      enabled:v2.enabled === true,
      version:v2.version || GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
      source:v2.source || null,
      adaptation:safeObject(v2.adaptation),
      shadow:safeObject(v2.shadow),
      scene:safeObject(v2.scene),
      plant:safeObject(v2.plant)
    };
  }
  const legacy = safeObject(metadata.autoBlendV1);
  return {
    enabled:legacy.enabled === true,
    version:legacy.version || 'garden-design-auto-blend-v1',
    source:legacy.source || null,
    adaptation:safeObject(legacy.adaptation),
    shadow:safeObject(legacy.shadow),
    scene:safeObject(legacy.sample),
    plant:{}
  };
}

export function writeAutoBlendMetadata(layer = {}, result = {}) {
  const metadata = safeObject(layer.metadata);
  layer.metadata = {
    ...metadata,
    autoBlendV2:{
      enabled:result.enabled === true,
      version:GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
      source:result.source || null,
      adaptation:safeObject(result.adaptation),
      shadow:safeObject(result.shadow),
      scene:safeObject(result.scene),
      plant:safeObject(result.plant),
      sampledAtPlacement:result.sampledAtPlacement || null,
      recalculatesAfterMove:true,
      paidCalls:0,
      nonDestructive:true
    }
  };
  return layer;
}

export function disableAutoBlend(layer = {}) {
  const current = autoBlendMetadata(layer);
  writeAutoBlendMetadata(layer, {
    enabled:false,
    source:current.source,
    adaptation:current.adaptation,
    shadow:current.shadow,
    scene:current.scene,
    plant:current.plant
  });
  return layer;
}

export async function calculateAutoBlendForLayer(options = {}) {
  const [scene, plant] = await Promise.all([
    sampleLocalGardenV2(options),
    samplePlantCutoutV2(options)
  ]);
  const layerEl = options.layerEl;
  const sceneEl = options.sceneEl;
  const result = computeAutoBlendV2(scene, plant, {
    sceneHeightPx:sceneEl?.getBoundingClientRect?.().height,
    layerHeightPx:layerEl?.getBoundingClientRect?.().height,
    placementX:options.layer?.x,
    placementY:options.layer?.y
  });
  if (options.layer) writeAutoBlendMetadata(options.layer, result);
  return result;
}

export function blendFilterCss(blend = {}) {
  const a = safeObject(blend.adaptation);
  const edge = safeObject(a.edgeTintColor);
  const r = Math.round(clamp(finite(edge.r, 128), 0, 255));
  const g = Math.round(clamp(finite(edge.g, 128), 0, 255));
  const b = Math.round(clamp(finite(edge.b, 128), 0, 255));
  return [
    'brightness(' + clamp(finite(a.brightness, 0.96), AUTO_BLEND_V2_BOUNDS.brightness.min, AUTO_BLEND_V2_BOUNDS.brightness.max) + ')',
    'contrast(' + clamp(finite(a.contrast, 0.93), AUTO_BLEND_V2_BOUNDS.contrast.min, AUTO_BLEND_V2_BOUNDS.contrast.max) + ')',
    'saturate(' + clamp(finite(a.saturate, 0.88), AUTO_BLEND_V2_BOUNDS.saturate.min, AUTO_BLEND_V2_BOUNDS.saturate.max) + ')',
    'sepia(' + clamp(finite(a.sepia, 0), AUTO_BLEND_V2_BOUNDS.sepia.min, AUTO_BLEND_V2_BOUNDS.sepia.max) + ')',
    'hue-rotate(' + clamp(finite(a.hueRotateDeg, 0), AUTO_BLEND_V2_BOUNDS.hueRotateDeg.min, AUTO_BLEND_V2_BOUNDS.hueRotateDeg.max) + 'deg)',
    'blur(' + clamp(finite(a.blurPx, 0.3), AUTO_BLEND_V2_BOUNDS.blurPx.min, AUTO_BLEND_V2_BOUNDS.blurPx.max) + 'px)',
    'drop-shadow(0 0 ' + clamp(finite(a.edgeTintBlurPx, 0.5), AUTO_BLEND_V2_BOUNDS.edgeTintBlurPx.min, AUTO_BLEND_V2_BOUNDS.edgeTintBlurPx.max)
      + 'px rgba(' + r + ',' + g + ',' + b + ',' + clamp(finite(a.edgeTintAlpha, 0.14), AUTO_BLEND_V2_BOUNDS.edgeTintAlpha.min, AUTO_BLEND_V2_BOUNDS.edgeTintAlpha.max) + '))'
  ].join(' ');
}

export function applyAutoBlendToLayerElement(layer = {}, layerEl = null) {
  if (!layerEl) return { applied:false, reason:'LAYER_ELEMENT_REQUIRED' };
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
      shadow.style.removeProperty('background');
      shadow.style.removeProperty('box-shadow');
    }
    return { applied:false, reason:'DISABLED' };
  }

  if (img) {
    img.style.filter = blendFilterCss(blend);
    img.style.opacity = String(clamp(
      finite(blend.adaptation?.opacity, 0.985),
      AUTO_BLEND_V2_BOUNDS.opacity.min,
      AUTO_BLEND_V2_BOUNDS.opacity.max
    ));
  }

  if (shadow) {
    const spec = safeObject(blend.shadow);
    const opacity = clamp(finite(spec.opacity, 0.24), 0.12, 0.38);
    const aoOpacity = clamp(finite(spec.ambientOcclusionOpacity, 0.14), 0.08, 0.22);
    const aoBlur = clamp(finite(spec.ambientOcclusionBlurPx, 5), 3, 9);
    shadow.style.width = clamp(finite(spec.widthPct, 58), 38, 74) + '%';
    shadow.style.height = clamp(finite(spec.heightPx, 7), 3, 14) + 'px';
    shadow.style.opacity = '1';
    shadow.style.filter = 'blur(' + clamp(finite(spec.blurPx, 10), 4, 18) + 'px)';
    shadow.style.transform = 'translateY(-2px)';
    shadow.style.background = 'radial-gradient(ellipse, rgba(0,0,0,' + opacity + ') 0%, rgba(0,0,0,' + (opacity * 0.45) + ') 48%, transparent 76%)';
    shadow.style.boxShadow = '0 1px ' + aoBlur + 'px rgba(0,0,0,' + aoOpacity + ')';
  }

  return {
    applied:true,
    version:GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
    source:blend.source || null
  };
}
