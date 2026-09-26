import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deriveRelativePreviewScale,
  resolveEffectivePreviewForm
} from '../modules/garden-design/asset-factory-v1/relative-preview-scale-v1.js';
import {
  derivePresentationSizing,
  resolvePresentationForm
} from '../modules/garden-design/asset-factory-v1/presentation-sizing-v1.js';
import {
  resolveInGardenScaleForm
} from '../modules/garden-design/asset-factory-v1/in-garden-qa-scale-policy-v1.js';

const registry=JSON.parse(fs.readFileSync('data/catalog/botanical-size-authority-v1.json','utf8'));

test('architecture shrub overrides tree visual form for preview sizing',()=>{
  assert.equal(resolvePresentationForm({visualForm:'tree',architectureMode:'shrub'}),'shrub');
  assert.equal(resolveInGardenScaleForm({visualForm:'tree',architectureMode:'shrub'}),'shrub');
  assert.equal(resolveEffectivePreviewForm({visualForm:'tree',architectureMode:'shrub'}),'shrub');
});

test('Hydrangea gets a modest evidence-based reduction',()=>{
  const r=deriveRelativePreviewScale(registry,{
    canonicalSlug:'bigleaf-hydrangea',
    visualForm:'shrub',
    architectureMode:'shrub',
    growthStage:'mature'
  });
  assert.equal(r.ready,true);
  assert.ok(r.scaleFactor<1);
  assert.ok(r.scaleFactor>0.85);
});

test('Zinnia gets a materially smaller evidence-based preview scale',()=>{
  const r=deriveRelativePreviewScale(registry,{
    canonicalSlug:'zinnia',
    visualForm:'herbaceous-upright',
    architectureMode:'default',
    growthStage:'mature'
  });
  assert.equal(r.ready,true);
  assert.ok(r.scaleFactor<0.75);
});

test('compact rosette with source-supported spread responds more strongly than default damping',()=>{
  const r=deriveRelativePreviewScale(registry,{
    canonicalSlug:'lettuce',
    visualForm:'rosette',
    architectureMode:'default',
    growthStage:'mature'
  });
  assert.equal(r.ready,true);
  assert.equal(r.responseProfile,'COMPACT_LOW_FORM');
  assert.equal(r.responseExponent,0.70);
  assert.ok(r.scaleFactor>=0.55);
  assert.ok(r.scaleFactor<=0.60);
});

test('rosette without size authority stays on neutral factor instead of inheriting Lettuce calibration',()=>{
  const r=deriveRelativePreviewScale(registry,{
    canonicalSlug:'pineapple',
    visualForm:'rosette',
    architectureMode:'default',
    growthStage:'mature'
  });
  assert.equal(r.ready,false);
  assert.equal(r.scaleFactor,1);
});

test('Pomegranate shrub uses shrub presentation rather than tree presentation',()=>{
  const shrub=derivePresentationSizing({
    visualForm:'tree',
    architectureMode:'shrub',
    width:1024,
    height:1536,
    alphaBBox:{exists:true,minX:40,minY:50,maxX:980,maxY:1450}
  },{relativeScaleFactor:1});
  const tree=derivePresentationSizing({
    visualForm:'tree',
    architectureMode:'tree',
    width:1024,
    height:1536,
    alphaBBox:{exists:true,minX:40,minY:50,maxX:980,maxY:1450}
  },{relativeScaleFactor:1});
  assert.equal(shrub.visualForm,'shrub');
  assert.ok(shrub.baseWidthPx<tree.baseWidthPx);
});

test('tree-only presentation is unchanged by non-tree relative scaler',()=>{
  const r=deriveRelativePreviewScale(registry,{
    canonicalSlug:'fig',
    visualForm:'tree',
    architectureMode:'tree',
    growthStage:'mature'
  });
  assert.equal(r.ready,false);
  assert.equal(r.scaleFactor,1);
});
