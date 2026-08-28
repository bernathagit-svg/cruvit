/**
 * Garden Profile V0 — cross-user RLS isolation verification.
 *
 * Requires a Supabase project with migration applied:
 *   supabase/migrations/20250828120000_garden_profiles_v0.sql
 *
 * Environment (never commit secrets):
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * Optional pre-provisioned users (recommended if email confirmation is enabled):
 *   CRUVIT_TEST_USER_A_EMAIL / CRUVIT_TEST_USER_A_PASSWORD
 *   CRUVIT_TEST_USER_B_EMAIL / CRUVIT_TEST_USER_B_PASSWORD
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

function loadEnvFile(relPath) {
  const filePath = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = String(process.env.SUPABASE_ANON_KEY || '').trim();

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY are required for RLS isolation verification.'
    );
  }
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function signInOrSignUp(client, email, password) {
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.session) return signIn.data.session;
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error) {
    throw new Error(`auth failed for ${email}: ${signUp.error.message}`);
  }
  if (!signUp.data.session) {
    throw new Error(
      `auth session missing for ${email}. Disable email confirmation or provide CRUVIT_TEST_USER_* credentials.`
    );
  }
  return signUp.data.session;
}

test('Garden Profile V0 RLS cross-user isolation', async (t) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    t.skip(
      'SUPABASE_URL and SUPABASE_ANON_KEY required for live RLS isolation (Owner-verified on production; skip without credentials).'
    );
    return;
  }
  requireEnv();

  const password = `CruvitV0!${randomUUID().slice(0, 8)}`;
  const emailA =
    String(process.env.CRUVIT_TEST_USER_A_EMAIL || '').trim() ||
    `cruvit-v0-a-${randomUUID()}@example.com`;
  const emailB =
    String(process.env.CRUVIT_TEST_USER_B_EMAIL || '').trim() ||
    `cruvit-v0-b-${randomUUID()}@example.com`;
  const passwordA = process.env.CRUVIT_TEST_USER_A_PASSWORD || password;
  const passwordB = process.env.CRUVIT_TEST_USER_B_PASSWORD || password;

  const clientA = makeClient();
  const clientB = makeClient();

  const sessionA = await signInOrSignUp(clientA, emailA, passwordA);
  const sessionB = await signInOrSignUp(clientB, emailB, passwordB);
  assert.ok(sessionA.user?.id, 'USER A session required');
  assert.ok(sessionB.user?.id, 'USER B session required');
  assert.notEqual(sessionA.user.id, sessionB.user.id, 'USER A and USER B must differ');

  let gardenAId = null;
  let gardenBId = null;

  t.after(async () => {
    if (gardenAId) {
      await clientA.from('garden_profiles').delete().eq('id', gardenAId);
    }
    if (gardenBId) {
      await clientB.from('garden_profiles').delete().eq('id', gardenBId);
    }
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  });

  // USER A — create Garden A
  const createA = await clientA
    .from('garden_profiles')
    .insert({ user_id: sessionA.user.id, name: 'Garden A isolation test' })
    .select('id,user_id,name')
    .single();
  assert.equal(createA.error, null, `USER A create: ${createA.error?.message || 'ok'}`);
  gardenAId = createA.data.id;
  assert.equal(createA.data.user_id, sessionA.user.id);

  // USER A — positive SELECT/UPDATE
  const selectA = await clientA
    .from('garden_profiles')
    .select('id,name,user_id')
    .eq('id', gardenAId)
    .single();
  assert.equal(selectA.error, null, 'USER A must SELECT own garden');
  assert.equal(selectA.data.id, gardenAId);

  const updateA = await clientA
    .from('garden_profiles')
    .update({ name: 'Garden A updated' })
    .eq('id', gardenAId)
    .select('id,name')
    .single();
  assert.equal(updateA.error, null, 'USER A must UPDATE own garden');
  assert.equal(updateA.data.name, 'Garden A updated');

  // USER B — negative SELECT by id
  const selectBById = await clientB
    .from('garden_profiles')
    .select('id')
    .eq('id', gardenAId)
    .maybeSingle();
  assert.equal(selectBById.error, null, 'USER B select-by-id should not error at API layer');
  assert.equal(selectBById.data, null, 'USER B must not read Garden A by id');

  // USER B — negative UPDATE Garden A
  const updateBOnA = await clientB
    .from('garden_profiles')
    .update({ name: 'B hijack attempt' })
    .eq('id', gardenAId)
    .select('id');
  assert.equal(updateBOnA.error, null, 'RLS blocks update via empty result, not always an error object');
  assert.equal(updateBOnA.data?.length || 0, 0, 'USER B must not UPDATE Garden A');

  // USER B — negative DELETE Garden A
  const deleteBOnA = await clientB
    .from('garden_profiles')
    .delete()
    .eq('id', gardenAId)
    .select('id');
  assert.equal(deleteBOnA.data?.length || 0, 0, 'USER B must not DELETE Garden A');

  // USER A — ownership reassignment attempt
  const reassignA = await clientA
    .from('garden_profiles')
    .update({ user_id: sessionB.user.id, name: 'stolen' })
    .eq('id', gardenAId)
    .select('id,user_id');
  assert.notEqual(reassignA.error, null, 'USER A must not reassign garden to USER B');

  // Verify owner unchanged after reassignment attempt
  const verifyOwner = await clientA
    .from('garden_profiles')
    .select('user_id')
    .eq('id', gardenAId)
    .single();
  assert.equal(verifyOwner.data.user_id, sessionA.user.id);

  // USER B — create own garden; USER A cannot read it
  const createB = await clientB
    .from('garden_profiles')
    .insert({ user_id: sessionB.user.id, name: 'Garden B isolation test' })
    .select('id,user_id')
    .single();
  assert.equal(createB.error, null);
  gardenBId = createB.data.id;

  const selectAOnB = await clientA
    .from('garden_profiles')
    .select('id')
    .eq('id', gardenBId)
    .maybeSingle();
  assert.equal(selectAOnB.data, null, 'USER A must not read Garden B');

  // USER A — DELETE own disposable garden (optional proof)
  const deleteA = await clientA
    .from('garden_profiles')
    .delete()
    .eq('id', gardenAId)
    .select('id');
  assert.equal(deleteA.data?.length, 1, 'USER A must DELETE own garden');
  gardenAId = null;
});
