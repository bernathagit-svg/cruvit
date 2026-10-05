import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handler,
  __resetSchemaReadinessLeaseForTests,
  __setSchemaReadinessLeaseForTests,
} from '../netlify/functions/garden-plants-schema-readiness.mjs';

function withEnv(values, fn) {
  const before = {};
  for (const [k, v] of Object.entries(values)) {
    before[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(before)) {
        if (v == null) delete process.env[k];
        else process.env[k] = v;
      }
      __resetSchemaReadinessLeaseForTests();
    });
}

const baseEnv = {
  SUPABASE_PROJECT_REF: 'saiuscqbszafszpdmzfl',
  SUPABASE_URL: 'https://saiuscqbszafszpdmzfl.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test',
};

function validSchemaResponse() {
  return [{
    status_default: "'unassessed'::text",
    mark_default: "'unknown'::text",
    mark_constraint:
      "CHECK ((mark = ANY (ARRAY['unknown'::text, '✓'::text, '!'::text])))",
  }];
}

test('schema readiness rejects unauthenticated callers before Management API access', async () => {
  let fetchCalls = 0;
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch should not be called');
  };

  try {
    const out = await handler({ headers: {} });
    assert.equal(out.statusCode, 401);
    assert.equal(JSON.parse(out.body).reason, 'authentication_required');
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('classic/legacy PAT is rejected; scoped PAT is required', async () => {
  const prevFetch = globalThis.fetch;
  await withEnv({
    ...baseEnv,
    SUPABASE_ACCESS_TOKEN: 'sbp_legacy_classic_token',
  }, async () => {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1' }) };
      }
      throw new Error('Management API must not be called with legacy token');
    };

    const out = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    const body = JSON.parse(out.body);
    assert.equal(out.statusCode, 503);
    assert.equal(body.reason, 'scoped_database_read_pat_required');
  });
  globalThis.fetch = prevFetch;
});

test('schema readiness creates a bounded lease and reuses it without another Management query', async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];

  await withEnv({
    ...baseEnv,
    SUPABASE_ACCESS_TOKEN: 'sbp_fcScopedReadOnlyToken',
    SCHEMA_ATTESTATION_LEASE_MS: '300000',
  }, async () => {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1' }) };
      }
      if (String(url).includes('/database/query/read-only')) {
        const body = JSON.parse(options.body);
        assert.match(body.query, /information_schema\.columns/);
        assert.doesNotMatch(body.query, /\b(insert|update|delete|alter|drop|create)\b/i);
        return { ok: true, status: 201, json: async () => validSchemaResponse() };
      }
      throw new Error('unexpected url: ' + url);
    };

    const first = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    const firstBody = JSON.parse(first.body);
    assert.equal(first.statusCode, 200);
    assert.equal(firstBody.cached, false);

    const second = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    const secondBody = JSON.parse(second.body);
    assert.equal(second.statusCode, 200);
    assert.equal(secondBody.cached, true);

    const managementCalls = calls.filter((c) =>
      c.url.includes('/database/query/read-only')
    );
    assert.equal(managementCalls.length, 1);
    const authCalls = calls.filter((c) => c.url.endsWith('/auth/v1/user'));
    assert.equal(authCalls.length, 2);
  });

  globalThis.fetch = prevFetch;
});

test('expired lease is never used when refresh fails', async () => {
  const prevFetch = globalThis.fetch;

  await withEnv({
    ...baseEnv,
    SUPABASE_ACCESS_TOKEN: 'sbp_fcScopedReadOnlyToken',
  }, async () => {
    __setSchemaReadinessLeaseForTests({
      projectRef: 'saiuscqbszafszpdmzfl',
      ready: true,
      statusDefault: 'unassessed',
      markDefault: 'unknown',
      allowedMarks: ['unknown', '✓', '!'],
      expiresAt: Date.now() - 1,
    });

    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1' }) };
      }
      if (String(url).includes('/database/query/read-only')) {
        throw new Error('simulated management api outage');
      }
      throw new Error('unexpected url');
    };

    const out = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    const body = JSON.parse(out.body);
    assert.equal(out.statusCode, 503);
    assert.equal(body.ready, false);
    assert.equal(body.reason, 'schema_attestation_request_failed');
  });

  globalThis.fetch = prevFetch;
});

test('schema readiness is bound to CRUVIT production project ref', async () => {
  const prevFetch = globalThis.fetch;

  await withEnv({
    SUPABASE_PROJECT_REF: 'wrong-project',
    SUPABASE_URL: 'https://wrong-project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_ACCESS_TOKEN: 'sbp_fcScopedReadOnlyToken',
  }, async () => {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: 'u1' }) };
      }
      throw new Error('Management API must not run for wrong project');
    };
    const out = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    assert.equal(out.statusCode, 503);
    assert.equal(JSON.parse(out.body).reason, 'schema_attestation_wrong_project');
  });

  globalThis.fetch = prevFetch;
});
