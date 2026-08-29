/**
 * Paid Plant Identifier server gate — regression tests.
 * Run: node --test tests/paid-plant-identifier-gate-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPaidPlantIdentifierAllowed,
  paidPlantIdentifierDisabledResponse,
  clientCannotOverridePaidPlantIdentifierGate,
  PAID_PLANT_IDENTIFIER_ENV_FLAG
} from '../modules/runtime-guards/paid-plant-identifier-gate-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FN = path.join(ROOT, 'netlify', 'functions', 'plant-identify.mjs');

async function invokeHandler(env, body = {}, headers = {}) {
  const prev = process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG];
  const had = Object.prototype.hasOwnProperty.call(process.env, PAID_PLANT_IDENTIFIER_ENV_FLAG);
  try {
    if (env === undefined) {
      delete process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG];
    } else if (env === null) {
      delete process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG];
    } else {
      process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG] = env;
    }

    // Fresh import each time so handler sees current env (handler reads process.env at call time).
    const mod = await import(`${pathToFileUrl(FN)}?t=${Date.now()}-${Math.random()}`);
    const handler = mod.default;

    let anthropicHits = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const u = String(url || '');
      if (u.includes('api.anthropic.com')) {
        anthropicHits += 1;
        throw new Error('anthropic-must-not-be-called');
      }
      return originalFetch(url, init);
    };

    try {
      const req = new Request('https://example.test/.netlify/functions/plant-identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
      });
      const res = await handler(req);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json, anthropicHits };
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    if (had) process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG] = prev;
    else delete process.env[PAID_PLANT_IDENTIFIER_ENV_FLAG];
  }
}

function pathToFileUrl(p) {
  const resolved = path.resolve(p);
  let pathname = resolved.replace(/\\/g, '/');
  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  return `file://${pathname}`;
}

test('absent flag → paid Identifier blocked (zero Anthropic)', async () => {
  assert.equal(isPaidPlantIdentifierAllowed({}), false);
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: '' }), false);
  const out = await invokeHandler(undefined, { mode: 'identify', imageBase64: 'aaaa' });
  assert.equal(out.status, 403);
  assert.equal(out.json.code, 'PAID_PLANT_IDENTIFIER_DISABLED');
  assert.equal(out.anthropicHits, 0);
});

test('false flag → paid Identifier blocked (zero Anthropic)', async () => {
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: 'false' }), false);
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: '0' }), false);
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: 'FALSE' }), false);
  const out = await invokeHandler('false', {
    mode: 'identify',
    allowPaid: true,
    CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER: true
  });
  assert.equal(out.status, 403);
  assert.equal(out.anthropicHits, 0);
});

test('client request cannot override server gate', async () => {
  const override = clientCannotOverridePaidPlantIdentifierGate(
    { allowPaid: true, CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER: true, enableAnthropic: true },
    { 'x-cruvit-allow-paid-plant-identifier': 'true' }
  );
  assert.equal(override.attemptedOverride, true);
  assert.equal(override.overrideHonored, false);

  const out = await invokeHandler('false', {
    allowPaid: true,
    CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER: true,
    enableAnthropic: true,
    mode: 'localCare'
  }, { 'x-cruvit-allow-paid-plant-identifier': 'true', 'x-allow-paid-ai': 'true' });
  assert.equal(out.status, 403);
  assert.equal(out.anthropicHits, 0);
});

test('only explicit server true may permit paid path (gate open; still no Anthropic without key)', async () => {
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: 'true' }), true);
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: ' TRUE ' }), true);
  // "yes" / "1" must NOT count — only exact true
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: 'yes' }), false);
  assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: '1' }), false);

  const prevKey = process.env.ANTHROPIC_API_KEY;
  const hadKey = Object.prototype.hasOwnProperty.call(process.env, 'ANTHROPIC_API_KEY');
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_KEY;
  delete process.env.CLAUDE_API_KEY;
  try {
    const out = await invokeHandler('true', { mode: 'identify' });
    // Gate open → may proceed to key check; must not call Anthropic without key.
    assert.equal(out.status, 503);
    assert.equal(out.anthropicHits, 0);
    assert.match(String(out.json.error || ''), /Anthropic API key/i);
  } finally {
    if (hadKey) process.env.ANTHROPIC_API_KEY = prevKey;
  }
});

test('disabled response is controlled and safe', () => {
  const r = paidPlantIdentifierDisabledResponse();
  assert.equal(r.status, 403);
  assert.equal(r.body.enabled, false);
  assert.equal(r.body.code, 'PAID_PLANT_IDENTIFIER_DISABLED');
  assert.doesNotMatch(JSON.stringify(r.body), /sk-ant|api[_-]?key|secret/i);
});

test('plant-identify.mjs wires server gate before Anthropic', () => {
  const src = fs.readFileSync(FN, 'utf8');
  assert.match(src, /isPaidPlantIdentifierAllowed/);
  assert.match(src, /PAID_PLANT_IDENTIFIER_DISABLED|paidPlantIdentifierDisabledResponse/);
  const gateIdx = src.indexOf('isPaidPlantIdentifierAllowed');
  const anthropicIdx = src.indexOf('api.anthropic.com');
  assert.ok(gateIdx > 0 && anthropicIdx > gateIdx);
});
