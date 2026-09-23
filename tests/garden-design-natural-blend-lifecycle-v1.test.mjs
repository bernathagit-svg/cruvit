import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const indexPath=path.join(ROOT,'modules/garden-design/index.html');
const appPath=path.join(ROOT,'app.html');
const bridgePath=path.join(ROOT,'modules/garden-design/garden-design-owned-garden-v1.js');

function read(p){ return fs.readFileSync(p,'utf8'); }

test('Natural Blend production runtime uses plant-alpha hard mask, not a square patch',()=>{
  const html=read(indexPath);
  assert.match(html,/plant-alpha-local-mask-v1/);
  assert.match(html,/gdBuildNaturalBlendAllowedMaskCanvas/);
  assert.match(html,/gdBuildHardMaskedNaturalBlendPatchUrl/);
  assert.match(html,/globalCompositeOperation = 'destination-in'/);
  assert.match(html,/editMaskGeometry:input\.editMaskGeometry/);
  assert.match(html,/gdApplyNaturalBlendPatch\(layer,result\.signedUrl,input\.cropRect,input\.editMaskGeometry/);
});

test('Natural Blend scene patch is invalidated on geometry change and Raw',()=>{
  const html=read(indexPath);
  assert.match(html,/gdInvalidateNaturalBlendLayer\(layer,'move'\)/);
  const resizeMatches=[...html.matchAll(/gdInvalidateNaturalBlendLayer\(layer,'resize'\)/g)];
  assert.ok(resizeMatches.length>=3);
  assert.match(html,/gdInvalidateNaturalBlendLayer\(layer,'auto_blend_disabled'\)/);
  assert.match(html,/staleReason/);
  assert.match(html,/Natural Blend\+ needs rerun/);
});

test('Natural Blend restore is host-authoritative and zero-provider-call',()=>{
  const bridge=read(bridgePath);
  assert.match(bridge,/NATURAL_BLEND_MEDIA_REQUEST/);
  assert.match(bridge,/NATURAL_BLEND_MEDIA_RESULT/);

  const app=read(appPath);
  const start=app.indexOf('async function gardenDesignResolveNaturalBlendMedia');
  const end=app.indexOf('function handleGardenDesignPremiumActionRequest',start);
  assert.ok(start>=0&&end>start);
  const resolver=app.slice(start,end);
  assert.match(resolver,/garden_media/);
  assert.match(resolver,/garden_design_placements/);
  assert.match(resolver,/design_output/);
  assert.match(resolver,/natural_blend/);
  assert.match(resolver,/NATURAL_BLEND_STALE_PLACEMENT/);
  assert.match(resolver,/createSignedUrl/);
  assert.match(resolver,/providerCalls:0/);
  assert.match(resolver,/quotaConsumed:0/);
  assert.doesNotMatch(resolver,/consume_premium_action/);
  assert.doesNotMatch(resolver,/\/api\/garden-design\/natural-blend/);
});

test('signed URL is ephemeral and is never persisted in placement Natural Blend metadata',()=>{
  const html=read(indexPath);
  const start=html.indexOf('metadata.naturalBlendV1 = {');
  const end=html.indexOf('};',start);
  assert.ok(start>=0&&end>start);
  const block=html.slice(start,end);
  assert.match(block,/mediaId:/);
  assert.match(block,/storagePath:/);
  assert.match(block,/contentSha256:/);
  assert.match(block,/editMaskGeometry:/);
  assert.match(block,/placementFingerprint:/);
  assert.doesNotMatch(block,/signedUrl/);
});

test('render reload restores only enabled fingerprint-matching Natural Blend metadata',()=>{
  const html=read(indexPath);
  assert.match(html,/gdRestoreNaturalBlendPatches/);
  assert.match(html,/gdRestoreNaturalBlendForLayer/);
  assert.match(html,/gdNaturalBlendFingerprintMatches/);
  assert.match(html,/cruvit:garden-design-natural-blend-media-request/);
  assert.match(html,/cruvit:garden-design-natural-blend-media-result/);
  assert.match(html,/if\(nb&&nb\.enabled===true\) gdRestoreNaturalBlendForLayer\(layer\)/);
});
