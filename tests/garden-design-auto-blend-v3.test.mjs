import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTO_BLEND_V3_POLICY,
  GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,
  computeDirectionalLightingV3,
  computeGroundSpillV3,
  computeAutoBlendV3,
  autoBlendMetadata,
  writeAutoBlendMetadata,
  disableAutoBlend
} from '../modules/garden-design/garden-design-auto-blend-v3.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Auto Blend V3 is non-destructive, reversible and zero-spend',()=>{
  assert.equal(GARDEN_DESIGN_AUTO_BLEND_V3_VERSION,'garden-design-auto-blend-v3');
  assert.equal(AUTO_BLEND_V3_POLICY.nonDestructive,true);
  assert.equal(AUTO_BLEND_V3_POLICY.reversible,true);
  assert.equal(AUTO_BLEND_V3_POLICY.usesAi,false);
  assert.equal(AUTO_BLEND_V3_POLICY.paidCalls,0);
  assert.equal(AUTO_BLEND_V3_POLICY.directionalLighting,true);
  assert.equal(AUTO_BLEND_V3_POLICY.groundColorSpill,true);
});

test('directional lighting follows local scene luminance gradient',()=>{
  const dl=computeDirectionalLightingV3({
    luminance:0.5,
    directional:{
      left:{available:true,luminance:0.35},
      right:{available:true,luminance:0.62},
      top:{available:true,luminance:0.55},
      bottom:{available:true,luminance:0.43}
    }
  });
  assert.ok(dl.magnitude>0);
  assert.ok(Number.isFinite(dl.angleDeg));
  assert.ok(dl.highlightOpacity>=0.04&&dl.highlightOpacity<=0.13);
  assert.ok(dl.shadeOpacity>=0.05&&dl.shadeOpacity<=0.16);
});

test('ground spill uses local ground color and stays bounded',()=>{
  const gs=computeGroundSpillV3({
    ground:{
      available:true,
      luminance:0.38,
      saturation:0.42,
      contrast:0.15,
      meanRgb:{r:0.58,g:0.42,b:0.25}
    }
  });
  assert.ok(gs.color.r>gs.color.b);
  assert.ok(gs.colorAlpha>=0.08&&gs.colorAlpha<=0.18);
  assert.ok(gs.coveragePct>=16&&gs.coveragePct<=24);
  assert.ok(gs.occlusionOpacity>=0.14&&gs.occlusionOpacity<=0.24);
});

test('V3 carries V2 tone matching but adds direction and ground integration',()=>{
  const scene={
    available:true,
    luminance:0.5,contrast:0.14,saturation:0.22,sharpness:0.05,warmth:0.04,
    meanRgb:{r:0.52,g:0.48,b:0.42},
    ground:{available:true,luminance:0.4,saturation:0.35,contrast:0.12,meanRgb:{r:0.56,g:0.43,b:0.28}},
    directional:{
      left:{available:true,luminance:0.38},
      right:{available:true,luminance:0.58},
      top:{available:true,luminance:0.54},
      bottom:{available:true,luminance:0.42}
    }
  };
  const plant={
    available:true,
    luminance:0.62,contrast:0.22,saturation:0.44,sharpness:0.12,warmth:-0.01,
    meanRgb:{r:0.46,g:0.55,b:0.50}
  };
  const v3=computeAutoBlendV3(scene,plant,{sceneHeightPx:700,layerHeightPx:280,placementY:0.85});
  assert.equal(v3.version,'garden-design-auto-blend-v3');
  assert.ok(v3.adaptation.saturate<=0.96);
  assert.ok(v3.directionalLighting);
  assert.ok(v3.groundSpill);
  assert.ok(v3.shadow.ambientOcclusionOpacity>=0.14);
  assert.equal(v3.paidCalls,0);
});

test('V3 metadata persists and Raw is reversible',()=>{
  const layer={metadata:{keep:'yes'}};
  const v3=computeAutoBlendV3({available:false},{available:false},{sceneHeightPx:700,layerHeightPx:240,placementY:0.82});
  writeAutoBlendMetadata(layer,v3);
  assert.equal(autoBlendMetadata(layer).enabled,true);
  assert.equal(layer.metadata.keep,'yes');
  disableAutoBlend(layer);
  assert.equal(autoBlendMetadata(layer).enabled,false);
  assert.equal(layer.metadata.keep,'yes');
});

test('production renderer imports V3 and QA capture handles V3',()=>{
  const html=fs.readFileSync(path.join(ROOT,'modules/garden-design/index.html'),'utf8');
  assert.match(html,/garden-design-auto-blend-v3\.js/);
  assert.match(html,/GARDEN_DESIGN_AUTO_BLEND_V3_VERSION/);
  assert.match(html,/AUTO_BLEND_V3_POLICY/);
  assert.match(html,/blend\.version === 'garden-design-auto-blend-v3'/);
  assert.match(html,/groundSpill/);
  assert.match(html,/directionalLighting/);
});
