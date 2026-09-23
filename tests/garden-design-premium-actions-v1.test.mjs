import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GD_HOST_TO_DESIGN,
  GD_DESIGN_TO_HOST,
  acceptGardenDesignMessage
} from '../modules/garden-design/garden-design-owned-garden-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const APP=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
const GD=fs.readFileSync(path.join(ROOT,'modules/garden-design/index.html'),'utf8');
const ENTITLEMENT_MIGRATION=fs.readFileSync(
  path.join(ROOT,'supabase/migrations/20260923175148_premium_action_entitlements_v1.sql'),
  'utf8'
);
const REFUND_MIGRATION=fs.readFileSync(
  path.join(ROOT,'supabase/migrations/20260923175631_premium_action_refund_v1.sql'),
  'utf8'
);

test('premium action bridge is typed in both directions',()=>{
  assert.equal(GD_DESIGN_TO_HOST.PREMIUM_ACTION_STATUS_REQUEST,'cruvit:garden-design-premium-action-status-request');
  assert.equal(GD_DESIGN_TO_HOST.PREMIUM_ACTION_CONSUME_REQUEST,'cruvit:garden-design-premium-action-consume-request');
  assert.equal(GD_DESIGN_TO_HOST.PREMIUM_ACTION_REFUND_REQUEST,'cruvit:garden-design-premium-action-refund-request');
  assert.equal(GD_HOST_TO_DESIGN.PREMIUM_ACTION_STATUS_RESULT,'cruvit:garden-design-premium-action-status-result');
  assert.equal(GD_HOST_TO_DESIGN.PREMIUM_ACTION_CONSUME_RESULT,'cruvit:garden-design-premium-action-consume-result');
  assert.equal(GD_HOST_TO_DESIGN.PREMIUM_ACTION_REFUND_RESULT,'cruvit:garden-design-premium-action-refund-result');

  const accepted=acceptGardenDesignMessage({
    data:{type:GD_DESIGN_TO_HOST.PREMIUM_ACTION_STATUS_REQUEST},
    origin:'https://example.test'
  },{
    expectedOrigin:'https://example.test',
    allowedTypes:Object.values(GD_DESIGN_TO_HOST)
  });
  assert.equal(accepted.ok,true);
});

test('host derives premium authority from authenticated session, not iframe user id',()=>{
  const start=APP.indexOf('function gardenDesignPremiumActionAuth()');
  const end=APP.indexOf('function handleGardenDesignPersistenceRequest',start);
  assert.ok(start>=0&&end>start);
  const src=APP.slice(start,end);
  assert.match(src,/pd\.getSession/);
  assert.match(src,/session&&session\.user&&session\.user\.id/);
  assert.match(src,/premium_action_entitlements/);
  assert.match(src,/\.rpc\('consume_premium_action'/);
  assert.match(src,/\.rpc\('refund_premium_action'/);
  assert.doesNotMatch(src,/data\.rewards\.credits/);
  assert.doesNotMatch(src,/localStorage/);
  assert.doesNotMatch(src,/d\.userId|d\.user_id/);
  assert.match(src,/localRewardsCreditsUsed:false/);
  assert.match(src,/serverAuthoritative:true/);
});

test('iframe has no Supabase client or direct premium ledger writes',()=>{
  assert.doesNotMatch(GD,/createClient\s*\(/);
  assert.doesNotMatch(GD,/premium_action_entitlements/);
  assert.doesNotMatch(GD,/premium_action_events/);
  assert.doesNotMatch(GD,/consume_premium_action/);
  assert.doesNotMatch(GD,/refund_premium_action/);
});

test('server entitlement is default deny and browser roles cannot write balances',()=>{
  assert.match(ENTITLEMENT_MIGRATION,/natural_blend_enabled boolean not null default false/);
  assert.match(ENTITLEMENT_MIGRATION,/natural_blend_remaining integer not null default 0/);
  assert.match(ENTITLEMENT_MIGRATION,/force row level security/i);
  assert.match(ENTITLEMENT_MIGRATION,/revoke all on table public\.premium_action_entitlements from anon, authenticated/i);
  assert.match(ENTITLEMENT_MIGRATION,/grant select on table public\.premium_action_entitlements to authenticated/i);
  assert.match(ENTITLEMENT_MIGRATION,/for update/);
  assert.match(ENTITLEMENT_MIGRATION,/ALREADY_CONSUMED/);
  assert.match(ENTITLEMENT_MIGRATION,/QUOTA_EXHAUSTED/);
  assert.match(ENTITLEMENT_MIGRATION,/DAILY_LIMIT_REACHED/);
});

test('refund is one-per-consume and authenticated-only',()=>{
  assert.match(REFUND_MIGRATION,/premium_action_events_refund_once_uidx/);
  assert.match(REFUND_MIGRATION,/related_idempotency_key/);
  assert.match(REFUND_MIGRATION,/ALREADY_REFUNDED/);
  assert.match(REFUND_MIGRATION,/CONSUME_NOT_FOUND/);
  assert.match(REFUND_MIGRATION,/revoke all on function public\.refund_premium_action\(text, text, text\) from public, anon/i);
  assert.match(REFUND_MIGRATION,/grant execute on function public\.refund_premium_action\(text, text, text\) to authenticated/i);
});
