import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = String(process.env.SUPABASE_URL || '').trim();
const ANON = String(process.env.SUPABASE_ANON_KEY || '').trim();
const SERVICE = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const hasEnv = !!(URL && ANON && SERVICE);

const password = 'Cruvit-Atomic-E2E-2026!';

function anonClient() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpcAdd(client, {
  gardenId,
  clientId,
  slug = 'monstera-deliciosa',
  name = 'Monstera',
  scientific = 'Monstera deliciosa',
} = {}) {
  return client.rpc('add_garden_plant_once_v1', {
    p_garden_profile_id: gardenId,
    p_client_instance_id: clientId,
    p_display_name: name,
    p_mode: 'scan',
    p_profile_slug: slug,
    p_scientific: scientific,
    p_garden_area_id: null,
  });
}

test(
  'Atomic Add Plant RPC: create once, retry safely, concurrency, rollback, RLS, reload',
  {
    skip: hasEnv ? false : 'Local Supabase env required.',
    timeout: 60_000,
  },
  async () => {
    const admin = createClient(URL, SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nonce = Date.now();
    const emailA = `atomic-a-${nonce}@cruvit.local`;
    const emailB = `atomic-b-${nonce}@cruvit.local`;

    let userAId = null;
    let userBId = null;
    let gardenA = null;
    let gardenB = null;

    const clientA = anonClient();
    const clientB = anonClient();

    try {
      const ua = await admin.auth.admin.createUser({
        email: emailA,
        password,
        email_confirm: true,
      });
      assert.equal(ua.error, null, ua.error?.message);
      userAId = ua.data.user.id;

      const ub = await admin.auth.admin.createUser({
        email: emailB,
        password,
        email_confirm: true,
      });
      assert.equal(ub.error, null, ub.error?.message);
      userBId = ub.data.user.id;

      const signA = await clientA.auth.signInWithPassword({ email: emailA, password });
      assert.equal(signA.error, null, signA.error?.message);
      const signB = await clientB.auth.signInWithPassword({ email: emailB, password });
      assert.equal(signB.error, null, signB.error?.message);

      const ga = await clientA
        .from('garden_profiles')
        .insert({ user_id: userAId, name: 'Atomic Garden A' })
        .select('id,user_id')
        .single();
      assert.equal(ga.error, null, ga.error?.message);
      gardenA = ga.data.id;

      const gb = await clientB
        .from('garden_profiles')
        .insert({ user_id: userBId, name: 'Atomic Garden B' })
        .select('id,user_id')
        .single();
      assert.equal(gb.error, null, gb.error?.message);
      gardenB = gb.data.id;

      // 1) First atomic Add creates Plant + History.
      const firstClientId = 'identifier:first-atomic';
      const first = await rpcAdd(clientA, {
        gardenId: gardenA,
        clientId: firstClientId,
      });
      assert.equal(first.error, null, first.error?.message);
      assert.equal(first.data.ok, true);
      assert.equal(first.data.created, true);
      assert.equal(first.data.historyCreated, true);
      const firstPlantId = first.data.plant.id;
      assert.ok(firstPlantId);

      const firstPlants = await clientA
        .from('garden_plants')
        .select('id,status,mark,profile_slug,client_instance_id')
        .eq('garden_profile_id', gardenA)
        .eq('client_instance_id', firstClientId);
      assert.equal(firstPlants.error, null);
      assert.equal(firstPlants.data.length, 1);
      assert.equal(firstPlants.data[0].status, 'unassessed');
      assert.equal(firstPlants.data[0].mark, 'unknown');

      const firstHistory = await clientA
        .from('garden_events')
        .select('id,garden_plant_id,event_type,source_module,client_event_id,payload')
        .eq('garden_profile_id', gardenA)
        .eq('garden_plant_id', firstPlantId)
        .eq('event_type', 'plant_added');
      assert.equal(firstHistory.error, null);
      assert.equal(firstHistory.data.length, 1);
      assert.equal(firstHistory.data[0].source_module, 'plant_identifier');
      assert.equal(firstHistory.data[0].payload.client_instance_id, firstClientId);
      assert.match(firstHistory.data[0].client_event_id, /^gev_plant_identifier_plant_added_plant_/);

      // 2) Sequential retry returns same Plant and creates no duplicate History.
      const retry = await rpcAdd(clientA, {
        gardenId: gardenA,
        clientId: firstClientId,
        name: 'Retry name must not mutate',
      });
      assert.equal(retry.error, null, retry.error?.message);
      assert.equal(retry.data.plant.id, firstPlantId);
      assert.equal(retry.data.created, false);
      assert.equal(retry.data.historyCreated, false);

      const afterRetry = await clientA
        .from('garden_plants')
        .select('id,name,status,mark,profile_slug')
        .eq('id', firstPlantId)
        .single();
      assert.equal(afterRetry.error, null);
      assert.equal(afterRetry.data.name, 'Monstera');

      const historyAfterRetry = await clientA
        .from('garden_events')
        .select('id')
        .eq('garden_profile_id', gardenA)
        .eq('garden_plant_id', firstPlantId)
        .eq('event_type', 'plant_added');
      assert.equal(historyAfterRetry.data.length, 1);

      // 3) Later health change must never be reset by an old Add retry.
      const health = await clientA
        .from('garden_plants')
        .update({ status: 'Needs attention', mark: '!' })
        .eq('id', firstPlantId)
        .select('id,status,mark')
        .single();
      assert.equal(health.error, null, health.error?.message);
      assert.equal(health.data.status, 'Needs attention');

      const oldRetry = await rpcAdd(clientA, {
        gardenId: gardenA,
        clientId: firstClientId,
      });
      assert.equal(oldRetry.error, null, oldRetry.error?.message);
      assert.equal(oldRetry.data.plant.id, firstPlantId);
      assert.equal(oldRetry.data.plant.status, 'Needs attention');
      assert.equal(oldRetry.data.plant.mark, '!');

      const persistedHealth = await clientA
        .from('garden_plants')
        .select('status,mark')
        .eq('id', firstPlantId)
        .single();
      assert.deepEqual(persistedHealth.data, {
        status: 'Needs attention',
        mark: '!',
      });

      // 4) Canonical mismatch on same idempotency key is rejected explicitly.
      const mismatch = await rpcAdd(clientA, {
        gardenId: gardenA,
        clientId: firstClientId,
        slug: 'lemon',
        name: 'Lemon',
        scientific: 'Citrus × limon',
      });
      assert.ok(mismatch.error);
      assert.match(mismatch.error.message, /idempotency_payload_mismatch/);

      // 5) Simultaneous duplicate requests return one Plant ID and one History.
      const concurrentClientId = 'identifier:concurrent-atomic';
      const [c1, c2] = await Promise.all([
        rpcAdd(clientA, {
          gardenId: gardenA,
          clientId: concurrentClientId,
        }),
        rpcAdd(clientA, {
          gardenId: gardenA,
          clientId: concurrentClientId,
        }),
      ]);
      assert.equal(c1.error, null, c1.error?.message);
      assert.equal(c2.error, null, c2.error?.message);
      assert.equal(c1.data.plant.id, c2.data.plant.id);

      const concurrentPlants = await clientA
        .from('garden_plants')
        .select('id')
        .eq('garden_profile_id', gardenA)
        .eq('client_instance_id', concurrentClientId);
      assert.equal(concurrentPlants.data.length, 1);

      const concurrentHistory = await clientA
        .from('garden_events')
        .select('id,garden_plant_id')
        .eq('garden_profile_id', gardenA)
        .eq('garden_plant_id', c1.data.plant.id)
        .eq('event_type', 'plant_added');
      assert.equal(concurrentHistory.data.length, 1);

      // 6) Forced History failure rolls back Plant creation atomically.
      const failClientId = 'identifier:force-history-failure-1';
      const failed = await rpcAdd(clientA, {
        gardenId: gardenA,
        clientId: failClientId,
      });
      assert.ok(failed.error);
      assert.match(failed.error.message, /forced_history_failure/);

      const failedPlant = await clientA
        .from('garden_plants')
        .select('id')
        .eq('garden_profile_id', gardenA)
        .eq('client_instance_id', failClientId);
      assert.equal(failedPlant.error, null);
      assert.equal(failedPlant.data.length, 0);

      // 7) Cross-user/RLS: user B cannot Add into user A's garden.
      const cross = await rpcAdd(clientB, {
        gardenId: gardenA,
        clientId: 'identifier:cross-user',
      });
      assert.ok(cross.error);
      assert.match(cross.error.message, /garden_not_owned|row-level security/i);

      const bCannotSeeA = await clientB
        .from('garden_plants')
        .select('id')
        .eq('garden_profile_id', gardenA);
      assert.equal(bCannotSeeA.error, null);
      assert.equal(bCannotSeeA.data.length, 0);

      // 8) Reload/new client sees the same authoritative Plant + History.
      await clientA.auth.signOut();
      const reloadedA = anonClient();
      const signReload = await reloadedA.auth.signInWithPassword({
        email: emailA,
        password,
      });
      assert.equal(signReload.error, null, signReload.error?.message);

      const reloadPlant = await reloadedA
        .from('garden_plants')
        .select('id,status,mark,profile_slug')
        .eq('garden_profile_id', gardenA)
        .eq('client_instance_id', firstClientId)
        .single();
      assert.equal(reloadPlant.error, null, reloadPlant.error?.message);
      assert.equal(reloadPlant.data.id, firstPlantId);
      assert.equal(reloadPlant.data.status, 'Needs attention');
      assert.equal(reloadPlant.data.mark, '!');

      const reloadHistory = await reloadedA
        .from('garden_events')
        .select('id,garden_plant_id,event_type')
        .eq('garden_profile_id', gardenA)
        .eq('garden_plant_id', firstPlantId)
        .eq('event_type', 'plant_added');
      assert.equal(reloadHistory.error, null);
      assert.equal(reloadHistory.data.length, 1);

      await reloadedA.auth.signOut();
    } finally {
      if (gardenA) {
        await clientA.from('garden_profiles').delete().eq('id', gardenA);
      }
      if (gardenB) {
        await clientB.from('garden_profiles').delete().eq('id', gardenB);
      }
      if (userAId) await admin.auth.admin.deleteUser(userAId);
      if (userBId) await admin.auth.admin.deleteUser(userBId);
      await clientA.auth.signOut();
      await clientB.auth.signOut();
    }
  }
);
