/**
 * Garden Plants Persistence V1 — live RLS / ownership harness.
 * Skips without SUPABASE_URL + SUPABASE_ANON_KEY (+ optional test users).
 * Does not apply migrations. Owner verifies live after SQL review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildServerPlantPayload } from '../modules/personal-domain/garden-profile-plants-contract.js';

const URL = String(process.env.SUPABASE_URL || '').trim();
const ANON = String(process.env.SUPABASE_ANON_KEY || '').trim();
const USER_A_EMAIL = String(process.env.CRUVIT_TEST_USER_A_EMAIL || '').trim();
const USER_A_PASSWORD = String(process.env.CRUVIT_TEST_USER_A_PASSWORD || '').trim();
const USER_B_EMAIL = String(process.env.CRUVIT_TEST_USER_B_EMAIL || '').trim();
const USER_B_PASSWORD = String(process.env.CRUVIT_TEST_USER_B_PASSWORD || '').trim();

const hasEnv = !!(URL && ANON && USER_A_EMAIL && USER_A_PASSWORD && USER_B_EMAIL && USER_B_PASSWORD);

const PLANT_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,name,status,mark,source,profile_slug,scientific,archived,prefs,added_at';

test(
  'Garden Plants V1 live save / RLS / multi-garden',
  { skip: hasEnv ? false : 'SUPABASE_URL/ANON + CRUVIT_TEST_USER_A/B_* required for live garden plants tests.' },
  async () => {
    const clientA = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const clientB = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const signIn = async (client, email, password) => {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    };

    await signIn(clientA, USER_A_EMAIL, USER_A_PASSWORD);
    await signIn(clientB, USER_B_EMAIL, USER_B_PASSWORD);

    const userA = (await clientA.auth.getUser()).data.user;
    const userB = (await clientB.auth.getUser()).data.user;
    assert.ok(userA?.id);
    assert.ok(userB?.id);

    const created = [];
    const createdPlants = [];
    try {
      const gA = await clientA
        .from('garden_profiles')
        .insert({ user_id: userA.id, name: `Plants V1 A ${Date.now()}` })
        .select('id,user_id')
        .single();
      assert.equal(gA.error, null, gA.error?.message);
      created.push(gA.data.id);

      const gA2 = await clientA
        .from('garden_profiles')
        .insert({ user_id: userA.id, name: `Plants V1 A2 ${Date.now()}` })
        .select('id,user_id')
        .single();
      assert.equal(gA2.error, null, gA2.error?.message);
      created.push(gA2.data.id);

      const payload = buildServerPlantPayload({
        id: `plant_a_${Date.now()}`,
        name: 'Lavender',
        status: 'Healthy',
        mark: '✓',
        source: 'My Garden',
        profileSlug: 'lavender',
        archived: false
      });

      const ins = await clientA
        .from('garden_plants')
        .insert({ ...payload, garden_profile_id: gA.data.id, user_id: userA.id })
        .select(PLANT_SELECT)
        .single();
      assert.equal(ins.error, null, ins.error?.message);
      createdPlants.push(ins.data.id);
      assert.equal(ins.data.name, 'Lavender');
      assert.equal(ins.data.garden_profile_id, gA.data.id);

      const upd = await clientA
        .from('garden_plants')
        .update({ status: 'Needs water', mark: '!' })
        .eq('id', ins.data.id)
        .select(PLANT_SELECT)
        .single();
      assert.equal(upd.error, null, upd.error?.message);
      assert.equal(upd.data.status, 'Needs water');

      const payload2 = buildServerPlantPayload({
        id: `plant_a2_${Date.now()}`,
        name: 'Rosemary',
        status: 'Healthy',
        mark: '✓',
        source: 'My Garden',
        profileSlug: 'rosemary'
      });
      const ins2 = await clientA
        .from('garden_plants')
        .insert({ ...payload2, garden_profile_id: gA2.data.id, user_id: userA.id })
        .select(PLANT_SELECT)
        .single();
      assert.equal(ins2.error, null, ins2.error?.message);
      createdPlants.push(ins2.data.id);

      const listA = await clientA
        .from('garden_plants')
        .select(PLANT_SELECT)
        .eq('garden_profile_id', gA.data.id);
      assert.equal(listA.error, null);
      assert.equal(listA.data.length, 1);
      assert.equal(listA.data[0].name, 'Lavender');

      const listA2 = await clientA
        .from('garden_plants')
        .select(PLANT_SELECT)
        .eq('garden_profile_id', gA2.data.id);
      assert.equal(listA2.error, null);
      assert.equal(listA2.data.length, 1);
      assert.equal(listA2.data[0].name, 'Rosemary');

      // B cannot see / mutate A's plant
      const bSelect = await clientB.from('garden_plants').select(PLANT_SELECT).eq('id', ins.data.id);
      assert.equal(bSelect.error, null);
      assert.equal((bSelect.data || []).length, 0);

      const bUpdate = await clientB
        .from('garden_plants')
        .update({ name: 'Hacked' })
        .eq('id', ins.data.id)
        .select(PLANT_SELECT);
      assert.equal((bUpdate.data || []).length, 0);

      const bDelete = await clientB.from('garden_plants').delete().eq('id', ins.data.id).select('id');
      assert.equal((bDelete.data || []).length, 0);

      const bInsertIntoA = await clientB.from('garden_plants').insert({
        ...buildServerPlantPayload({
          id: `plant_b_into_a_${Date.now()}`,
          name: 'Intruder',
          mark: '✓'
        }),
        garden_profile_id: gA.data.id,
        user_id: userB.id
      });
      assert.ok(bInsertIntoA.error, 'B must not insert into A garden');

      // B cannot move own plant into A's garden
      const gB = await clientB
        .from('garden_profiles')
        .insert({ user_id: userB.id, name: `Plants V1 B ${Date.now()}` })
        .select('id')
        .single();
      assert.equal(gB.error, null, gB.error?.message);
      created.push(gB.data.id);
      const bPlant = await clientB
        .from('garden_plants')
        .insert({
          ...buildServerPlantPayload({
            id: `plant_b_${Date.now()}`,
            name: 'Mint',
            mark: '✓',
            profileSlug: 'mint'
          }),
          garden_profile_id: gB.data.id,
          user_id: userB.id
        })
        .select(PLANT_SELECT)
        .single();
      assert.equal(bPlant.error, null, bPlant.error?.message);
      createdPlants.push(bPlant.data.id);

      const move = await clientB
        .from('garden_plants')
        .update({ garden_profile_id: gA.data.id })
        .eq('id', bPlant.data.id)
        .select(PLANT_SELECT);
      assert.equal((move.data || []).length, 0);

      // Delete plant A
      const del = await clientA.from('garden_plants').delete().eq('id', ins.data.id).select('id');
      assert.equal(del.error, null);
      assert.equal((del.data || []).length, 1);
    } finally {
      for (const id of createdPlants) {
        await clientA.from('garden_plants').delete().eq('id', id);
        await clientB.from('garden_plants').delete().eq('id', id);
      }
      for (const id of created) {
        await clientA.from('garden_profiles').delete().eq('id', id);
        await clientB.from('garden_profiles').delete().eq('id', id);
      }
      await clientA.auth.signOut();
      await clientB.auth.signOut();
    }
  }
);
