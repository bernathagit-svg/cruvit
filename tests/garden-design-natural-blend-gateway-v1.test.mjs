import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const gateway=fs.readFileSync(
  path.join(ROOT,'netlify/functions/garden-design-natural-blend.mjs'),
  'utf8'
);

test('Natural Blend production gateway requires user bearer auth and never trusts client user id',()=>{
  assert.match(gateway,/const token=bearer\(req\)/);
  assert.match(gateway,/AUTH_REQUIRED/);
  assert.match(gateway,/authenticatedUser\(token\)/);
  assert.match(gateway,/\/auth\/v1\/user/);
  assert.doesNotMatch(gateway,/body\.userId|body\.user_id/);
  assert.doesNotMatch(gateway,/SERVICE_ROLE|service_role/i);
});

test('gateway binds request to owned saved design and exact placement state',()=>{
  assert.match(gateway,/garden_design_placements/);
  assert.match(gateway,/garden_designs/);
  assert.match(gateway,/SAVED_GARDEN_SOURCE_REQUIRED/);
  assert.match(gateway,/fingerprintMatches\(body\.placementFingerprint,placement\)/);
  assert.match(gateway,/PLACEMENT_CHANGED_REBUILD_BLEND/);
  assert.match(gateway,/autoBlendV3/);
  assert.match(gateway,/AUTO_BLEND_V3_REQUIRED/);
});

test('gateway requires CRUVIT production asset reference and never accepts client plant reference bytes',()=>{
  assert.match(gateway,/design_asset_id/);
  assert.match(gateway,/DESIGN_ASSET_REGISTRY_UNAVAILABLE/);
  assert.match(gateway,/productionApproved!==true/);
  assert.match(gateway,/PRODUCTION_ASSET_REQUIRED/);
  assert.match(gateway,/fetchReferenceBytes/);
  assert.doesNotMatch(gateway,/body\.plantReference|body\.referenceBase64/);
});

test('gateway consumes one server entitlement before provider and duplicate consume cannot call provider twice',()=>{
  const consumeIdx=gateway.indexOf('consumed=await consume(token,idempotencyKey)');
  const providerIdx=gateway.indexOf('const response=await fetch(OPENAI_EDIT_URL');
  assert.ok(consumeIdx>=0);
  assert.ok(providerIdx>consumeIdx);
  assert.match(gateway,/ALREADY_CONSUMED/);
  assert.match(gateway,/NATURAL_BLEND_IN_PROGRESS/);
  assert.match(gateway,/providerCalls:0/);
  assert.match(gateway,/existingOutput/);
  assert.match(gateway,/QUOTA_EXHAUSTED/);
});

test('gateway refunds atomically on provider or persistence failure',()=>{
  assert.match(gateway,/refund\(token,idempotencyKey,refundKey\)/);
  assert.match(gateway,/NATURAL_BLEND_PROVIDER_FAILURE/);
  assert.match(gateway,/NATURAL_BLEND_OUTPUT_MISSING/);
  assert.match(gateway,/NATURAL_BLEND_OUTPUT_PERSIST_FAILED/);
  assert.match(gateway,/refunded:refunded\?\.ok===true/);
});

test('gateway persists successful output as private Garden Media design_output before returning completion',()=>{
  const insertIdx=gateway.indexOf('await insertMediaPending');
  const uploadIdx=gateway.indexOf('await uploadMedia');
  const validateIdx=gateway.indexOf('await validateMediaRow');
  const completedIdx=gateway.indexOf("code:'NATURAL_BLEND_COMPLETED'");
  assert.ok(insertIdx>=0);
  assert.ok(uploadIdx>insertIdx);
  assert.ok(validateIdx>uploadIdx);
  assert.ok(completedIdx>validateIdx);
  assert.match(gateway,/user-garden-media/);
  assert.match(gateway,/purpose:'design_output'/);
  assert.match(gateway,/validation_state:'pending'/);
  assert.match(gateway,/content_sha256:outputSha/);
  assert.match(gateway,/invalidatedByMoveOrResize:true/);
  assert.match(gateway,/globalPlantAssetMutation:false/);
  assert.doesNotMatch(gateway,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
  assert.doesNotMatch(gateway,/design-asset-registry-v1\.json.*write/i);
});

test('gateway records measured cost into existing runtime cost ledger',()=>{
  assert.match(gateway,/runtime_cost_events/);
  assert.match(gateway,/garden_design_natural_blend/);
  assert.match(gateway,/actual_cost_usd:actualCost/);
  assert.match(gateway,/inputTokens/);
  assert.match(gateway,/outputTokens/);
});

test('gateway only accepts bounded 1024 PNG crop and mask and fixed server prompt',()=>{
  assert.match(gateway,/label\+'_MUST_BE_1024'/);
  assert.match(gateway,/pngSize\(cropBytes,'CROP'\)/);
  assert.match(gateway,/pngSize\(maskBytes,'MASK'\)/);
  assert.match(gateway,/fixedPrompt\(placement\)/);
  assert.doesNotMatch(gateway,/body\.prompt/);
  assert.match(gateway,/Pixels outside the mask are context only/);
});

test('Netlify route is explicit and not a generic image editor endpoint',()=>{
  assert.match(gateway,/path:'\/api\/garden-design\/natural-blend'/);
  assert.match(gateway,/const FEATURE='natural_blend'/);
});
