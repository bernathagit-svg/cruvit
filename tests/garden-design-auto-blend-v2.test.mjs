import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTO_BLEND_V2_POLICY,
  AUTO_BLEND_V2_BOUNDS,
  GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,
  computeAutoBlendV2,
  autoBlendMetadata,
  writeAutoBlendMetadata,
  disableAutoBlend,
  blendFilterCss
} from '../modules/garden-design/garden-design-auto-blend-v2.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Auto Blend V2 is non-destructive, zero-spend and generic',()=>{
  assert.equal(GARDEN_DESIGN_AUTO_BLEND_V2_VERSION,'garden-design-auto-blend-v2');
  assert.equal(AUTO_BLEND_V2_POLICY.nonDestructive,true);
  assert.equal(AUTO_BLEND_V2_POLICY.reversible,true);
  assert.equal(AUTO_BLEND_V2_POLICY.altersGardenPhoto,false);
  assert.equal(AUTO_BLEND_V2_POLICY.altersPlantAssetBytes,false);
  assert.equal(AUTO_BLEND_V2_POLICY.usesAi,false);
  assert.equal(AUTO_BLEND_V2_POLICY.paidCalls,0);
  assert.equal(AUTO_BLEND_V2_POLICY.speciesSpecificRules,false);
  assert.equal(AUTO_BLEND_V2_POLICY.comparesPlantToLocalScene,true);
});

test('V2 reduces an over-bright over-saturated sharp plant toward a softer local scene',()=>{
  const scene={
    available:true,
    luminance:0.52,
    contrast:0.14,
    saturation:0.24,
    sharpness:0.055,
    warmth:0.04,
    meanRgb:{r:0.50,g:0.48,b:0.46},
    ground:{available:true,luminance:0.43,contrast:0.13,saturation:0.30}
  };
  const plant={
    available:true,
    luminance:0.66,
    contrast:0.24,
    saturation:0.44,
    sharpness:0.12,
    warmth:-0.01,
    meanRgb:{r:0.47,g:0.54,b:0.48}
  };
  const result=computeAutoBlendV2(scene,plant,{sceneHeightPx:700,layerHeightPx:280,placementY:0.85});
  assert.equal(result.enabled,true);
  assert.ok(result.adaptation.brightness<1);
  assert.ok(result.adaptation.contrast<1);
  assert.ok(result.adaptation.saturate<1);
  assert.ok(result.adaptation.blurPx>0.18);
  assert.ok(result.adaptation.edgeTintAlpha>=AUTO_BLEND_V2_BOUNDS.edgeTintAlpha.min);
  assert.ok(result.shadow.ambientOcclusionOpacity>0);
  assert.equal(result.paidCalls,0);
});

test('V2 remains inside bounded visual adjustments',()=>{
  const result=computeAutoBlendV2({
    available:true,luminance:0.9,contrast:0.7,saturation:0.9,sharpness:0.01,warmth:0.5,
    meanRgb:{r:0.9,g:0.7,b:0.2},ground:{available:true,luminance:0.8,contrast:0.4}
  },{
    available:true,luminance:0.2,contrast:0.02,saturation:0.05,sharpness:0.3,warmth:-0.5,
    meanRgb:{r:0.2,g:0.4,b:0.9}
  },{sceneHeightPx:700,layerHeightPx:250,placementY:0.8});
  const a=result.adaptation;
  assert.ok(a.brightness>=AUTO_BLEND_V2_BOUNDS.brightness.min&&a.brightness<=AUTO_BLEND_V2_BOUNDS.brightness.max);
  assert.ok(a.contrast>=AUTO_BLEND_V2_BOUNDS.contrast.min&&a.contrast<=AUTO_BLEND_V2_BOUNDS.contrast.max);
  assert.ok(a.saturate>=AUTO_BLEND_V2_BOUNDS.saturate.min&&a.saturate<=AUTO_BLEND_V2_BOUNDS.saturate.max);
  assert.ok(a.blurPx>=AUTO_BLEND_V2_BOUNDS.blurPx.min&&a.blurPx<=AUTO_BLEND_V2_BOUNDS.blurPx.max);
  assert.ok(a.opacity>=AUTO_BLEND_V2_BOUNDS.opacity.min&&a.opacity<=AUTO_BLEND_V2_BOUNDS.opacity.max);
  assert.ok(a.sepia>=AUTO_BLEND_V2_BOUNDS.sepia.min&&a.sepia<=AUTO_BLEND_V2_BOUNDS.sepia.max);
  assert.ok(a.hueRotateDeg>=AUTO_BLEND_V2_BOUNDS.hueRotateDeg.min&&a.hueRotateDeg<=AUTO_BLEND_V2_BOUNDS.hueRotateDeg.max);
});

test('V2 state persists in metadata and Raw remains reversible',()=>{
  const layer={metadata:{existingFlag:'keep'}};
  const result=computeAutoBlendV2({available:false},{available:false},{sceneHeightPx:700,layerHeightPx:220,placementY:0.8});
  writeAutoBlendMetadata(layer,result);
  assert.equal(autoBlendMetadata(layer).enabled,true);
  assert.equal(layer.metadata.existingFlag,'keep');
  disableAutoBlend(layer);
  assert.equal(autoBlendMetadata(layer).enabled,false);
  assert.equal(layer.metadata.existingFlag,'keep');
});

test('V2 filter includes bounded tone, temperature and edge integration',()=>{
  const result=computeAutoBlendV2({
    available:true,luminance:0.5,contrast:0.15,saturation:0.2,sharpness:0.05,warmth:0.05,
    meanRgb:{r:0.5,g:0.48,b:0.45}
  },{
    available:true,luminance:0.6,contrast:0.2,saturation:0.4,sharpness:0.12,warmth:0,
    meanRgb:{r:0.45,g:0.55,b:0.50}
  },{sceneHeightPx:700,layerHeightPx:260,placementY:0.85});
  const css=blendFilterCss(result);
  assert.match(css,/brightness\(/);
  assert.match(css,/contrast\(/);
  assert.match(css,/saturate\(/);
  assert.match(css,/sepia\(/);
  assert.match(css,/hue-rotate\(/);
  assert.match(css,/blur\(/);
  assert.match(css,/drop-shadow\(/);
});

test('production renderer imports V2',()=>{
  const html=fs.readFileSync(path.join(ROOT,'modules/garden-design/index.html'),'utf8');
  assert.match(html,/garden-design-auto-blend-v2\.js/);
  assert.match(html,/GARDEN_DESIGN_AUTO_BLEND_V2_VERSION/);
  assert.match(html,/AUTO_BLEND_V2_POLICY/);
});
