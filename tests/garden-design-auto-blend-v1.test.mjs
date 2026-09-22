import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTO_BLEND_V1_POLICY,
  GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,
  autoBlendMetadata,
  computeAutoBlendFromSample,
  disableAutoBlend,
  writeAutoBlendMetadata
} from '../modules/garden-design/garden-design-auto-blend-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Auto Blend V1 is non-destructive, zero-spend and generic',()=>{
  assert.equal(GARDEN_DESIGN_AUTO_BLEND_V1_VERSION,'garden-design-auto-blend-v1');
  assert.equal(AUTO_BLEND_V1_POLICY.nonDestructive,true);
  assert.equal(AUTO_BLEND_V1_POLICY.altersGardenPhoto,false);
  assert.equal(AUTO_BLEND_V1_POLICY.altersPlantAssetBytes,false);
  assert.equal(AUTO_BLEND_V1_POLICY.usesAi,false);
  assert.equal(AUTO_BLEND_V1_POLICY.paidCalls,0);
  assert.equal(AUTO_BLEND_V1_POLICY.speciesSpecificRules,false);
  assert.equal(AUTO_BLEND_V1_POLICY.hueRotationAllowed,false);
});

test('scene adaptation stays within conservative production bounds',()=>{
  const result=computeAutoBlendFromSample({
    available:true,
    luminance:0.92,
    contrast:0.65,
    saturation:0.8,
    ground:{available:true,luminance:0.82,contrast:0.4,saturation:0.35}
  },{
    sceneHeightPx:700,
    layerHeightPx:260,
    placementX:0.58,
    placementY:0.85
  });
  assert.equal(result.enabled,true);
  assert.ok(result.adaptation.brightness>=0.88&&result.adaptation.brightness<=1.08);
  assert.ok(result.adaptation.contrast>=0.88&&result.adaptation.contrast<=1.06);
  assert.ok(result.adaptation.saturate>=0.82&&result.adaptation.saturate<=1.05);
  assert.ok(result.adaptation.blurPx>=0.2&&result.adaptation.blurPx<=0.7);
  assert.ok(result.adaptation.opacity>=0.94&&result.adaptation.opacity<=1);
  assert.equal(result.adaptation.hueRotateDeg,0);
  assert.ok(result.shadow.opacity>=0.10&&result.shadow.opacity<=0.34);
  assert.equal(result.paidCalls,0);
  assert.equal(result.nonDestructive,true);
});

test('blend state persists in placement metadata and Raw toggle is reversible',()=>{
  const layer={metadata:{existingFlag:'keep-me'}};
  const result=computeAutoBlendFromSample({
    available:false,
    reason:'LOCAL_SCENE_SAMPLE_UNAVAILABLE'
  },{
    sceneHeightPx:700,
    layerHeightPx:220,
    placementX:0.5,
    placementY:0.8
  });
  writeAutoBlendMetadata(layer,result);
  let state=autoBlendMetadata(layer);
  assert.equal(state.enabled,true);
  assert.equal(layer.metadata.existingFlag,'keep-me');
  assert.equal(layer.metadata.autoBlendV1.nonDestructive,true);
  disableAutoBlend(layer);
  state=autoBlendMetadata(layer);
  assert.equal(state.enabled,false);
  assert.ok(state.adaptation);
  assert.equal(layer.metadata.existingFlag,'keep-me');
});

test('Garden Design production UI exposes Auto Blend and persists through placement metadata',()=>{
  const html=fs.readFileSync(path.join(ROOT,'modules/garden-design/index.html'),'utf8');
  const owned=fs.readFileSync(path.join(ROOT,'modules/garden-design/garden-design-owned-garden-v1.js'),'utf8');
  assert.match(html,/id="gdAutoBlendBtn"/);
  assert.match(html,/gdToggleAutoBlendSelected/);
  assert.match(html,/calculateAutoBlendForLayer/);
  assert.match(html,/applyAutoBlendToLayerElement/);
  assert.match(html,/gdRefreshEnabledAutoBlend/);
  assert.match(owned,/metadata:/);
  assert.match(owned,/layer\.metadata/);
});
