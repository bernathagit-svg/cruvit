import test from 'node:test';
import assert from 'node:assert/strict';

const DATABASE_URL = String(process.env.ATOMIC_DB_URL || '').trim();
if (!DATABASE_URL) throw new Error('ATOMIC_DB_URL is required');

const { Client } = await import('pg');

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const GARDEN_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GARDEN_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function adminQuery(sql, params = []) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function asUser(userId, fn) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function asAnon(fn) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    await client.query('set local role anon');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

async function rpc(client, {
  gardenId = GARDEN_A,
  clientId,
  slug = 'monstera-deliciosa',
  name = 'Monstera',
  scientific = 'Monstera deliciosa',
} = {}) {
  const { rows } = await client.query(
    `select public.add_garden_plant_once_v1(
      $1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::uuid
    ) as envelope`,
    [gardenId, clientId, name, 'scan', slug, scientific, null]
  );
  return rows[0].envelope;
}

async function countRows(table, whereSql = 'true', params = []) {
  const { rows } = await adminQuery(
    `select count(*)::int as n from public.${table} where ${whereSql}`,
    params
  );
  return rows[0].n;
}

test.before(async () => {
  await adminQuery(
    'insert into auth.users(id) values ($1),($2) on conflict do nothing',
    [USER_A, USER_B]
  );
  await adminQuery(
    `insert into public.garden_profiles(id,user_id,name)
     values ($1,$2,'Garden A'),($3,$4,'Garden B')
     on conflict (id) do nothing`,
    [GARDEN_A, USER_A, GARDEN_B, USER_B]
  );
});

test.beforeEach(async () => {
  await adminQuery('delete from public.garden_events');
  await adminQuery('delete from public.garden_plants');
});

test('first atomic Add creates one Plant and one History event', async () => {
  const out = await asUser(USER_A, (client) =>
    rpc(client, { clientId: 'identifier:first-1' })
  );

  assert.equal(out.ok, true);
  assert.equal(out.created, true);
  assert.equal(out.historyCreated, true);
  assert.equal(out.plant.garden_profile_id, GARDEN_A);
  assert.equal(out.plant.status, 'unassessed');
  assert.equal(out.plant.mark, 'unknown');
  assert.equal(out.history.garden_plant_id, out.plant.id);

  assert.equal(
    await countRows('garden_plants', 'garden_profile_id=$1 and client_instance_id=$2', [
      GARDEN_A,
      'identifier:first-1',
    ]),
    1
  );
  assert.equal(
    await countRows(
      'garden_events',
      "garden_profile_id=$1 and garden_plant_id=$2 and event_type='plant_added'",
      [GARDEN_A, out.plant.id]
    ),
    1
  );
});

test('sequential retry returns same Plant without mutation or duplicate History', async () => {
  const first = await asUser(USER_A, (client) =>
    rpc(client, { clientId: 'identifier:retry-1' })
  );

  await asUser(USER_A, async (client) => {
    await client.query(
      `update public.garden_plants
       set name='User renamed', status='Needs attention', mark='!'
       where id=$1`,
      [first.plant.id]
    );
  });

  const retry = await asUser(USER_A, (client) =>
    rpc(client, {
      clientId: 'identifier:retry-1',
      name: 'Old retry name',
      slug: 'monstera-deliciosa',
    })
  );

  assert.equal(retry.plant.id, first.plant.id);
  assert.equal(retry.created, false);
  assert.equal(retry.plant.name, 'User renamed');
  assert.equal(retry.plant.status, 'Needs attention');
  assert.equal(retry.plant.mark, '!');
  assert.equal(
    await countRows(
      'garden_events',
      "garden_plant_id=$1 and event_type='plant_added'",
      [first.plant.id]
    ),
    1
  );
});

test('canonical mismatch is rejected without mutating existing Plant', async () => {
  const first = await asUser(USER_A, (client) =>
    rpc(client, { clientId: 'identifier:mismatch-1' })
  );

  await assert.rejects(
    () =>
      asUser(USER_A, (client) =>
        rpc(client, {
          clientId: 'identifier:mismatch-1',
          slug: 'lemon',
          name: 'Lemon',
          scientific: 'Citrus x limon',
        })
      ),
    /idempotency_payload_mismatch/
  );

  const { rows } = await adminQuery(
    'select profile_slug,status,mark from public.garden_plants where id=$1',
    [first.plant.id]
  );
  assert.equal(rows[0].profile_slug, 'monstera-deliciosa');
  assert.equal(rows[0].status, 'unassessed');
  assert.equal(rows[0].mark, 'unknown');
});

test('simultaneous duplicate requests return same Plant and one History event', async () => {
  const call = () =>
    asUser(USER_A, (client) =>
      rpc(client, { clientId: 'identifier:concurrent-1' })
    );

  const [a, b] = await Promise.all([call(), call()]);
  assert.equal(a.plant.id, b.plant.id);

  assert.equal(
    await countRows('garden_plants', 'garden_profile_id=$1 and client_instance_id=$2', [
      GARDEN_A,
      'identifier:concurrent-1',
    ]),
    1
  );
  assert.equal(
    await countRows(
      'garden_events',
      "garden_plant_id=$1 and event_type='plant_added'",
      [a.plant.id]
    ),
    1
  );
});

test('missing History on existing Plant is filled from authoritative Plant row', async () => {
  const first = await asUser(USER_A, (client) =>
    rpc(client, { clientId: 'identifier:repair-1' })
  );

  await adminQuery('delete from public.garden_events where garden_plant_id=$1', [
    first.plant.id,
  ]);
  await asUser(USER_A, async (client) => {
    await client.query(
      `update public.garden_plants
       set name='Authoritative Name', status='Healthy later', mark='✓'
       where id=$1`,
      [first.plant.id]
    );
  });

  const retry = await asUser(USER_A, (client) =>
    rpc(client, {
      clientId: 'identifier:repair-1',
      name: 'Untrusted retry name',
    })
  );
  assert.equal(retry.plant.name, 'Authoritative Name');

  const { rows } = await adminQuery(
    `select payload
     from public.garden_events
     where garden_plant_id=$1 and event_type='plant_added'`,
    [first.plant.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].payload.name, 'Authoritative Name');
  assert.equal(rows[0].payload.client_instance_id, 'identifier:repair-1');
});

test('forced History failure rolls back new Plant atomically', async () => {
  await adminQuery(`
    create or replace function public.test_fail_plant_added()
    returns trigger language plpgsql set search_path = pg_catalog as $$
    begin
      if new.event_type='plant_added' then
        raise exception 'forced_history_failure';
      end if;
      return new;
    end $$;

    drop trigger if exists test_fail_plant_added on public.garden_events;
    create trigger test_fail_plant_added
      before insert on public.garden_events
      for each row execute function public.test_fail_plant_added();
  `);

  try {
    await assert.rejects(
      () =>
        asUser(USER_A, (client) =>
          rpc(client, { clientId: 'identifier:rollback-1' })
        ),
      /forced_history_failure/
    );
  } finally {
    await adminQuery(
      'drop trigger if exists test_fail_plant_added on public.garden_events'
    );
    await adminQuery('drop function if exists public.test_fail_plant_added()');
  }

  assert.equal(
    await countRows('garden_plants', 'garden_profile_id=$1 and client_instance_id=$2', [
      GARDEN_A,
      'identifier:rollback-1',
    ]),
    0
  );
  assert.equal(await countRows('garden_events'), 0);
});

test('cross-user/RLS blocks Add Plant command', async () => {
  await assert.rejects(
    () =>
      asUser(USER_B, (client) =>
        rpc(client, {
          gardenId: GARDEN_A,
          clientId: 'identifier:cross-user-1',
        })
      ),
    /garden_not_owned|permission denied|row-level security/i
  );

  assert.equal(
    await countRows('garden_plants', 'client_instance_id=$1', [
      'identifier:cross-user-1',
    ]),
    0
  );
});

test('reload reads authoritative Plant and History remains singular', async () => {
  const first = await asUser(USER_A, (client) =>
    rpc(client, { clientId: 'identifier:reload-1' })
  );

  const reloaded = await asUser(USER_A, async (client) => {
    const plant = await client.query(
      `select *
       from public.garden_plants
       where garden_profile_id=$1 and client_instance_id=$2`,
      [GARDEN_A, 'identifier:reload-1']
    );
    const history = await client.query(
      `select *
       from public.garden_events
       where garden_profile_id=$1 and garden_plant_id=$2 and event_type='plant_added'`,
      [GARDEN_A, first.plant.id]
    );
    return { plant: plant.rows[0], history: history.rows };
  });

  assert.equal(reloaded.plant.id, first.plant.id);
  assert.equal(reloaded.plant.profile_slug, 'monstera-deliciosa');
  assert.equal(reloaded.history.length, 1);
});

test('RPC execute is denied to anon role', async () => {
  await assert.rejects(
    () =>
      asAnon((client) =>
        rpc(client, {
          gardenId: GARDEN_A,
          clientId: 'identifier:anon-denied-1',
        })
      ),
    /permission denied for function add_garden_plant_once_v1/i
  );

  assert.equal(
    await countRows('garden_plants', 'client_instance_id=$1', [
      'identifier:anon-denied-1',
    ]),
    0
  );
});
