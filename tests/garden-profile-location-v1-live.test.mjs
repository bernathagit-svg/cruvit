/**
 * Garden Profile Location V1 — live RLS / persistence checks.
 *
 * Requires:
 *   - V0 + Location V1 migrations applied
 *   - SUPABASE_URL / SUPABASE_ANON_KEY
 *
 * Skips cleanly when credentials or migration are unavailable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  buildServerLocationPayload,
  nullServerLocationPayload,
  roundLocationCoord
} from '../modules/personal-domain/garden-profile-location-contract.js';

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

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function signInOrSignUp(client, email, password) {
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error && signIn.data.session) return signIn.data.session;
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error) throw new Error(`auth failed for ${email}: ${signUp.error.message}`);
  if (!signUp.data.session) {
    throw new Error(`auth session missing for ${email}`);
  }
  return signUp.data.session;
}

const SELECT =
  'id,name,user_id,location_label,location_lat,location_lon,location_climate,location_source,location_confirmed_at,location_country,location_region,location_timezone,location_updated_at';

test('Garden Profile Location V1 live save / RLS / multi-garden', async (t) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    t.skip('SUPABASE_URL and SUPABASE_ANON_KEY required for live location persistence tests.');
    return;
  }

  const password = `CruvitLocV1!${randomUUID().slice(0, 8)}`;
  const emailA =
    String(process.env.CRUVIT_TEST_USER_A_EMAIL || '').trim() ||
    `cruvit-loc-a-${randomUUID()}@example.com`;
  const emailB =
    String(process.env.CRUVIT_TEST_USER_B_EMAIL || '').trim() ||
    `cruvit-loc-b-${randomUUID()}@example.com`;
  const passwordA = process.env.CRUVIT_TEST_USER_A_PASSWORD || password;
  const passwordB = process.env.CRUVIT_TEST_USER_B_PASSWORD || password;

  const clientA = makeClient();
  const clientB = makeClient();
  const sessionA = await signInOrSignUp(clientA, emailA, passwordA);
  const sessionB = await signInOrSignUp(clientB, emailB, passwordB);

  let gardenA1 = null;
  let gardenA2 = null;
  let gardenB = null;

  try {
    const createA1 = await clientA
      .from('garden_profiles')
      .insert({ user_id: sessionA.user.id, name: `LocA1 ${randomUUID().slice(0, 6)}` })
      .select(SELECT)
      .single();
    if (createA1.error?.message?.includes('location_label') || createA1.error?.code === 'PGRST204') {
      t.skip(
        'Location V1 migration not applied on live project yet (Owner applies after review).'
      );
      return;
    }
    if (createA1.error) throw createA1.error;
    gardenA1 = createA1.data;
    assert.equal(gardenA1.location_label, null);

    const telAviv = buildServerLocationPayload({
      label: 'Tel Aviv, Israel',
      climate: 'Mediterranean',
      lat: 32.08531234,
      lon: 34.78181234,
      country: 'Israel',
      source: 'manual'
    });
    const saveA = await clientA
      .from('garden_profiles')
      .update(telAviv)
      .eq('id', gardenA1.id)
      .select(SELECT)
      .single();
    assert.ifError(saveA.error);
    assert.equal(saveA.data.location_label, 'Tel Aviv, Israel');
    assert.equal(Number(saveA.data.location_lat), roundLocationCoord(32.08531234));
    assert.equal(saveA.data.location_source, 'manual');

    const badLat = await clientA
      .from('garden_profiles')
      .update({
        location_label: 'Bad',
        location_lat: 91,
        location_lon: 34,
        location_climate: 'Mediterranean',
        location_source: 'manual',
        location_confirmed_at: new Date().toISOString(),
        location_updated_at: new Date().toISOString()
      })
      .eq('id', gardenA1.id)
      .select(SELECT)
      .single();
    assert.ok(badLat.error, 'invalid latitude must fail');

    const badLon = await clientA
      .from('garden_profiles')
      .update({
        location_label: 'Bad',
        location_lat: 32,
        location_lon: 181,
        location_climate: 'Mediterranean',
        location_source: 'manual',
        location_confirmed_at: new Date().toISOString(),
        location_updated_at: new Date().toISOString()
      })
      .eq('id', gardenA1.id)
      .select(SELECT)
      .single();
    assert.ok(badLon.error, 'invalid longitude must fail');

    const badDefault = await clientA
      .from('garden_profiles')
      .update({
        location_label: 'Western Galilee, Israel',
        location_lat: 33.0089,
        location_lon: 35.0941,
        location_climate: 'Mediterranean',
        location_source: 'default',
        location_confirmed_at: new Date().toISOString(),
        location_updated_at: new Date().toISOString()
      })
      .eq('id', gardenA1.id)
      .select(SELECT)
      .single();
    assert.ok(badDefault.error, 'default source must fail');

    const partial = await clientA
      .from('garden_profiles')
      .update({
        location_label: 'Only label',
        location_lat: null,
        location_lon: null,
        location_climate: null,
        location_source: null,
        location_confirmed_at: null,
        location_updated_at: null,
        location_country: 'Israel'
      })
      .eq('id', gardenA1.id)
      .select(SELECT)
      .single();
    assert.ok(partial.error, 'partial/orphan metadata must fail');

    const createA2 = await clientA
      .from('garden_profiles')
      .insert({ user_id: sessionA.user.id, name: `LocA2 ${randomUUID().slice(0, 6)}` })
      .select(SELECT)
      .single();
    assert.ifError(createA2.error);
    gardenA2 = createA2.data;

    const london = buildServerLocationPayload({
      label: 'London, United Kingdom',
      climate: 'Cool temperate',
      lat: 51.5074,
      lon: -0.1278,
      source: 'geolocation'
    });
    const saveA2 = await clientA
      .from('garden_profiles')
      .update(london)
      .eq('id', gardenA2.id)
      .select(SELECT)
      .single();
    assert.ifError(saveA2.error);
    assert.notEqual(saveA2.data.location_climate, saveA.data.location_climate);

    const createB = await clientB
      .from('garden_profiles')
      .insert({ user_id: sessionB.user.id, name: `LocB ${randomUUID().slice(0, 6)}` })
      .select(SELECT)
      .single();
    assert.ifError(createB.error);
    gardenB = createB.data;

    const leak = await clientB.from('garden_profiles').select(SELECT).eq('id', gardenA1.id);
    assert.ifError(leak.error);
    assert.equal((leak.data || []).length, 0, 'B must not SELECT A location row');

    const steal = await clientB
      .from('garden_profiles')
      .update(london)
      .eq('id', gardenA1.id)
      .select(SELECT);
    assert.equal((steal.data || []).length, 0, 'B must not UPDATE A location');

    const clearSteal = await clientB
      .from('garden_profiles')
      .update(nullServerLocationPayload())
      .eq('id', gardenA1.id)
      .select(SELECT);
    assert.equal((clearSteal.data || []).length, 0, 'B must not clear A location');

    const reload = await clientA.from('garden_profiles').select(SELECT).eq('id', gardenA1.id).single();
    assert.ifError(reload.error);
    assert.equal(reload.data.location_label, 'Tel Aviv, Israel');
  } finally {
    if (gardenA1?.id) await clientA.from('garden_profiles').delete().eq('id', gardenA1.id);
    if (gardenA2?.id) await clientA.from('garden_profiles').delete().eq('id', gardenA2.id);
    if (gardenB?.id) await clientB.from('garden_profiles').delete().eq('id', gardenB.id);
  }
});
