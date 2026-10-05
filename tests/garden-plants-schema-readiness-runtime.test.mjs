import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/garden-plants-schema-readiness.mjs';

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
    });
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

test('schema readiness returns environment attestation from read-only query', async () => {
  const prevFetch = globalThis.fetch;
  const calls = [];

  await withEnv({
    SUPABASE_ACCESS_TOKEN: 'management-read-token',
    SUPABASE_PROJECT_REF: 'project-test-ref',
    SUPABASE_URL: 'https://project-test-ref.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
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
        return {
          ok: true,
          status: 201,
          json: async () => [{
            status_default: "'unassessed'::text",
            mark_default: "'unknown'::text",
            mark_constraint:
              "CHECK ((mark = ANY (ARRAY['unknown'::text, '✓'::text, '!'::text])))",
          }],
        };
      }
      throw new Error('unexpected url: ' + url);
    };

    const out = await handler({
      headers: { authorization: 'Bearer user-session-token' },
    });
    const body = JSON.parse(out.body);

    assert.equal(out.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.projectRef, 'project-test-ref');
    assert.equal(body.statusDefault, 'unassessed');
    assert.equal(body.markDefault, 'unknown');
    assert.deepEqual(body.allowedMarks.sort(), ['!', 'unknown', '✓'].sort());
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /database\/query\/read-only/);
  });

  globalThis.fetch = prevFetch;
});
