import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function read(rel){
  return fs.readFileSync(path.join(ROOT,rel),'utf8');
}

test('in-garden capture requires Auto Blend V3 before any capture can be stored',()=>{
  const host=read('modules/garden-design/plant-visual-in-garden-capture-host-v1.html');
  const blendIndex=host.indexOf("type:'cruvit:garden-design-qa-auto-blend-set'");
  const requiredCodeIndex=host.indexOf("blendResult?.code==='QA_AUTO_BLEND_APPLIED'");
  const captureIndex=host.indexOf("type:'cruvit:garden-design-qa-capture-request'");
  const storeIndex=host.indexOf('storeCapture(job.jobId,captured,blendResult)');
  assert.ok(blendIndex>=0,'Auto Blend request missing');
  assert.ok(requiredCodeIndex>blendIndex,'QA_AUTO_BLEND_APPLIED gate missing');
  assert.ok(captureIndex>requiredCodeIndex,'capture must occur after Auto Blend gate');
  assert.ok(storeIndex>captureIndex,'store must occur after capture');
});

test('capture evidence and status fail closed unless Auto Blend was actually applied',()=>{
  const store=read('netlify/functions/plant-visual-in-garden-capture-store.mjs');
  const status=read('netlify/functions/plant-visual-in-garden-capture-status.mjs');
  assert.match(store,/autoBlend:\s*\{/);
  assert.match(store,/applied:body\.autoBlend\?\.applied===true/);
  assert.match(status,/autoBlendApplied:evidence\.autoBlend\?\.applied===true/);
  assert.match(status,/allAutoBlendApplied/);
  assert.match(status,/r\.autoBlendApplied===true\s*&&\s*r\.autoBlendCode==='QA_AUTO_BLEND_APPLIED'/);
});

test('Tree Scale V3 sizes visible alpha content instead of treating the full PNG canvas as botanical height',()=>{
  const renderer=read('modules/garden-design/index.html');
  assert.match(renderer,/qaTreeScaleV3/);
  assert.match(renderer,/requestedImgHeightPct/);
  assert.match(renderer,/requestedVisibleHeightPct/);
  assert.match(renderer,/qaSceneH \* \(requestedImgHeightPct \/ 100\)/);
  assert.match(renderer,/Tree Scale V3 sizes the visible alpha specimen/);
});

test('Production R2 prefers dedicated credentials while candidate reads stay on candidate credentials',()=>{
  const promote=read('netlify/functions/plant-visual-promote-manifest.mjs');
  assert.match(promote,/function candidateS3Client\(\)/);
  assert.match(promote,/function productionS3Client\(\)/);
  assert.match(promote,/PLANT_VISUAL_R2_PRODUCTION_ACCESS_KEY_ID/);
  assert.match(promote,/PLANT_VISUAL_R2_PRODUCTION_SECRET_ACCESS_KEY/);
  assert.match(promote,/\|\| env\('PLANT_VISUAL_R2_ACCESS_KEY_ID'\)/);
  assert.match(promote,/readBytes\(candidateClient, candidateBucket, row\.objectKey\)/);
  assert.match(promote,/readBytes\(productionClient, productionBucket, key\)/);
  assert.match(promote,/productionClient\.send\(new PutObjectCommand/);
});

test('Production read and status surfaces use the same dedicated Production credential preference',()=>{
  for(const rel of [
    'netlify/functions/plant-visual-production-asset.mjs',
    'netlify/functions/plant-visual-production-promotion-status.mjs'
  ]){
    const src=read(rel);
    assert.match(src,/PLANT_VISUAL_R2_PRODUCTION_ACCESS_KEY_ID/);
    assert.match(src,/PLANT_VISUAL_R2_PRODUCTION_SECRET_ACCESS_KEY/);
    assert.match(src,/PLANT_VISUAL_R2_ACCESS_KEY_ID/);
    assert.match(src,/PLANT_VISUAL_R2_SECRET_ACCESS_KEY/);
  }
});

test('Production access diagnostic checks dedicated credentials separately and never attempts a write',()=>{
  const diag=read('netlify/functions/plant-visual-r2-production-access-diagnostic.mjs');
  assert.match(diag,/productionAccessKeyId/);
  assert.match(diag,/productionSecretAccessKey/);
  assert.match(diag,/production,plantVisual,generic/);
  assert.match(diag,/writeAttempted:false/);
});
