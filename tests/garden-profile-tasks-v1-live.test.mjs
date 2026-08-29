/**
 * Garden Tasks Persistence V1 — live RLS / ownership harness.
 * Skips without SUPABASE_URL + SUPABASE_ANON_KEY (+ optional test users).
 * Does not apply migrations. Owner verifies live after SQL review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildServerTaskPayload } from '../modules/personal-domain/garden-profile-tasks-contract.js';
import { buildServerPlantPayload } from '../modules/personal-domain/garden-profile-plants-contract.js';

const URL = String(process.env.SUPABASE_URL || '').trim();
const ANON = String(process.env.SUPABASE_ANON_KEY || '').trim();
const USER_A_EMAIL = String(process.env.CRUVIT_TEST_USER_A_EMAIL || '').trim();
const USER_A_PASSWORD = String(process.env.CRUVIT_TEST_USER_A_PASSWORD || '').trim();
const USER_B_EMAIL = String(process.env.CRUVIT_TEST_USER_B_EMAIL || '').trim();
const USER_B_PASSWORD = String(process.env.CRUVIT_TEST_USER_B_PASSWORD || '').trim();

const hasEnv = !!(URL && ANON && USER_A_EMAIL && USER_A_PASSWORD && USER_B_EMAIL && USER_B_PASSWORD);

const TASK_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,garden_plant_id,icon,title,when_label,priority,due_on,auto_generated,plant_name,done';
const PLANT_SELECT = 'id,garden_profile_id,user_id,client_instance_id,name';

test(
  'Garden Tasks V1 live save / RLS / plant FK / multi-garden',
  {
    skip: hasEnv
      ? false
      : 'SUPABASE_URL/ANON + CRUVIT_TEST_USER_A/B_* required for live garden tasks tests.'
  },
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

    const createdGardens = [];
    const createdPlants = [];
    const createdTasks = [];
    try {
      const gA = await clientA
        .from('garden_profiles')
        .insert({ user_id: userA.id, name: `Tasks V1 A ${Date.now()}` })
        .select('id,user_id')
        .single();
      assert.equal(gA.error, null, gA.error?.message);
      createdGardens.push(gA.data.id);

      const gA2 = await clientA
        .from('garden_profiles')
        .insert({ user_id: userA.id, name: `Tasks V1 A2 ${Date.now()}` })
        .select('id,user_id')
        .single();
      assert.equal(gA2.error, null, gA2.error?.message);
      createdGardens.push(gA2.data.id);

      const plantPayload = buildServerPlantPayload({
        id: `plant_a_${Date.now()}`,
        name: 'Lavender',
        status: 'Healthy',
        mark: '✓',
        source: 'My Garden'
      });
      const plantIns = await clientA
        .from('garden_plants')
        .insert({ ...plantPayload, garden_profile_id: gA.data.id, user_id: userA.id })
        .select(PLANT_SELECT)
        .single();
      assert.equal(plantIns.error, null, plantIns.error?.message);
      createdPlants.push(plantIns.data.id);

      const payload = buildServerTaskPayload(
        {
          id: `task_a_${Date.now()}`,
          icon: '💧',
          title: 'Water Lavender',
          when: 'Today · 5 minutes',
          priority: 'High',
          iso: '2026-08-29',
          auto: true,
          plantName: 'Lavender',
          done: false
        },
        { gardenPlantId: plantIns.data.id }
      );

      const ins = await clientA
        .from('garden_tasks')
        .insert({ ...payload, garden_profile_id: gA.data.id, user_id: userA.id })
        .select(TASK_SELECT)
        .single();
      assert.equal(ins.error, null, ins.error?.message);
      createdTasks.push(ins.data.id);
      assert.equal(ins.data.title, 'Water Lavender');
      assert.equal(ins.data.garden_profile_id, gA.data.id);
      assert.equal(ins.data.garden_plant_id, plantIns.data.id);

      const upd = await clientA
        .from('garden_tasks')
        .update({ done: true, when_label: 'Today · completed' })
        .eq('id', ins.data.id)
        .select(TASK_SELECT)
        .single();
      assert.equal(upd.error, null, upd.error?.message);
      assert.equal(upd.data.done, true);

      const payload2 = buildServerTaskPayload({
        id: `task_a2_${Date.now()}`,
        title: 'Water Rosemary A2',
        priority: 'Medium',
        plantName: 'Rosemary',
        done: false
      });
      const ins2 = await clientA
        .from('garden_tasks')
        .insert({ ...payload2, garden_profile_id: gA2.data.id, user_id: userA.id })
        .select(TASK_SELECT)
        .single();
      assert.equal(ins2.error, null, ins2.error?.message);
      createdTasks.push(ins2.data.id);

      const listA = await clientA
        .from('garden_tasks')
        .select(TASK_SELECT)
        .eq('garden_profile_id', gA.data.id);
      assert.equal(listA.error, null);
      assert.equal(listA.data.length, 1);

      const listA2 = await clientA
        .from('garden_tasks')
        .select(TASK_SELECT)
        .eq('garden_profile_id', gA2.data.id);
      assert.equal(listA2.error, null);
      assert.equal(listA2.data.length, 1);

      const upsertSame = await clientA
        .from('garden_tasks')
        .upsert(
          {
            ...payload,
            garden_profile_id: gA.data.id,
            user_id: userA.id,
            title: 'Water Lavender again'
          },
          { onConflict: 'garden_profile_id,client_instance_id' }
        )
        .select(TASK_SELECT)
        .single();
      assert.equal(upsertSame.error, null, upsertSame.error?.message);
      assert.equal(upsertSame.data.id, ins.data.id);

      const selB = await clientB.from('garden_tasks').select(TASK_SELECT).eq('id', ins.data.id);
      assert.equal(selB.error, null);
      assert.equal((selB.data || []).length, 0);

      const updB = await clientB
        .from('garden_tasks')
        .update({ done: false })
        .eq('id', ins.data.id)
        .select(TASK_SELECT);
      assert.equal((updB.data || []).length, 0);

      const delB = await clientB.from('garden_tasks').delete().eq('id', ins.data.id).select(TASK_SELECT);
      assert.equal((delB.data || []).length, 0);

      const insB = await clientB
        .from('garden_tasks')
        .insert({
          ...buildServerTaskPayload({ id: `task_b_steal_${Date.now()}`, title: 'Steal' }),
          garden_profile_id: gA.data.id,
          user_id: userB.id
        })
        .select(TASK_SELECT)
        .single();
      assert.ok(insB.error, 'B must not insert into A garden');

      const moveB = await clientB
        .from('garden_tasks')
        .update({ garden_profile_id: gA.data.id })
        .eq('id', ins2.data.id)
        .select(TASK_SELECT);
      assert.equal((moveB.data || []).length, 0);

      // Cross-garden plant attach must fail (plant in A, task targeting A2).
      const crossPlant = await clientA
        .from('garden_tasks')
        .insert({
          ...buildServerTaskPayload({
            id: `task_cross_${Date.now()}`,
            title: 'Bad plant link'
          }),
          garden_profile_id: gA2.data.id,
          user_id: userA.id,
          garden_plant_id: plantIns.data.id
        })
        .select(TASK_SELECT)
        .single();
      assert.ok(crossPlant.error, 'task must not reference plant from another garden');

      const del = await clientA.from('garden_tasks').delete().eq('id', ins.data.id).select(TASK_SELECT);
      assert.equal(del.error, null);
      assert.equal((del.data || []).length, 1);
    } finally {
      for (const id of createdTasks) {
        await clientA.from('garden_tasks').delete().eq('id', id);
      }
      for (const id of createdPlants) {
        await clientA.from('garden_plants').delete().eq('id', id);
      }
      for (const id of createdGardens) {
        await clientA.from('garden_profiles').delete().eq('id', id);
      }
      await clientA.auth.signOut();
      await clientB.auth.signOut();
    }
  }
);
