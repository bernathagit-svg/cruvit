/** Paid Identifier containment: every provider/research transport is an offline fixture. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPaidPlantIdentifierAllowed,
  paidPlantIdentifierDisabledResponse,
  clientCannotOverridePaidPlantIdentifierGate,
  PAID_PLANT_IDENTIFIER_ENV_FLAG
} from '../modules/runtime-guards/paid-plant-identifier-gate-v1.js';
import handler from '../netlify/functions/plant-identify.mjs';

const FIXTURE_KEY = 'fixture-only-never-a-real-credential';
const enabled = { [PAID_PLANT_IDENTIFIER_ENV_FLAG]: 'true', ANTHROPIC_API_KEY: FIXTURE_KEY };
const validBody = { mode: 'identify', imageBase64: 'AAAAAAAAAAAAAAAA', mediaType: 'image/png' };
const validPlant = { scientific_name: 'Rosa canina', common_name: 'Dog rose', confidence: 'high' };
const providerResult = result => new Response(JSON.stringify({
  content: [{ type: 'text', text: JSON.stringify(result) }]
}));

async function invokeHandler({ env = {}, body = validBody, rawBody, headers = {}, provider, research } = {}) {
  const previousEnv = process.env;
  const previousFetch = globalThis.fetch;
  const paid = [];
  const free = [];
  const unexpected = [];
  try {
    // Replace, rather than inherit, the test environment: real credentials never enter fixtures.
    process.env = { ...env };
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target === 'https://api.anthropic.com/v1/messages' || target === 'https://gateway.fixture.invalid/v1/messages') {
        paid.push({ url: target, ...init, body: JSON.parse(init.body) });
        if (!provider) throw new Error('Unexpected paid dispatch');
        return provider(paid.length, init);
      }
      if (target.startsWith('https://api.gbif.org/v1/species/')) {
        free.push(target);
        return research ? research(target) : new Response('{}');
      }
      unexpected.push(target);
      throw new Error('Network transport has no fixture');
    };
    const request = new Request('https://fixture.invalid/.netlify/functions/plant-identify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: rawBody ?? JSON.stringify(body)
    });
    const response = await handler(request);
    const payload = await response.json();
    assert.deepEqual(unexpected, [], 'all outbound URLs must have an offline fixture');
    return { status: response.status, payload, paid, free };
  } finally {
    globalThis.fetch = previousFetch;
    process.env = previousEnv;
  }
}

test('absent/false/invalid server values default deny despite credentials and client overrides', async () => {
  for (const flag of [undefined, '', 'false', 'FALSE', '0', '1', 'yes']) {
    const env = { ANTHROPIC_KEY: FIXTURE_KEY };
    if (flag !== undefined) env[PAID_PLANT_IDENTIFIER_ENV_FLAG] = flag;
    assert.equal(isPaidPlantIdentifierAllowed(env), false);
    const out = await invokeHandler({ env, body: {
      ...validBody, allowPaid: true, CRUVIT_ALLOW_PAID_PLANT_IDENTIFIER: true,
      cruvitAllowPaidPlantIdentifier: true, enableAnthropic: true
    }, headers: { 'x-cruvit-allow-paid-plant-identifier': 'true', 'x-allow-paid-ai': 'true' } });
    assert.equal(out.status, 403);
    assert.equal(out.payload.code, 'PAID_PLANT_IDENTIFIER_DISABLED');
    assert.equal(out.paid.length, 0);
    assert.equal(out.free.length, 0);
  }
});

test('client override detector never grants authority', () => {
  assert.deepEqual(clientCannotOverridePaidPlantIdentifierGate(
    { allowPaid: true, enableAnthropic: true }, { 'x-allow-paid-ai': 'true' }
  ), { attemptedOverride: true, overrideHonored: false });
});

test('only explicit server true opens the gate; absent key aliases cost zero', async () => {
  for (const flag of ['true', ' TRUE ']) {
    assert.equal(isPaidPlantIdentifierAllowed({ [PAID_PLANT_IDENTIFIER_ENV_FLAG]: flag }), true);
    const out = await invokeHandler({ env: { [PAID_PLANT_IDENTIFIER_ENV_FLAG]: flag } });
    assert.equal(out.status, 503);
    assert.equal(out.paid.length, 0);
    assert.deepEqual(out.payload, { error: 'Plant Identifier is not configured.' });
  }
});

test('disabled response exposes neither secrets nor an override', () => {
  const response = paidPlantIdentifierDisabledResponse();
  assert.equal(response.status, 403);
  assert.equal(response.body.enabled, false);
  assert.equal(response.body.code, 'PAID_PLANT_IDENTIFIER_DISABLED');
  assert.doesNotMatch(JSON.stringify(response.body), /sk-ant|api[_-]?key|secret/i);
});

test('care, absent, alias, unknown and non-string modes are denied before dispatch', async () => {
  for (const mode of [undefined, null, '', 'localCare', 'local-care', 'speciesCare', 'species-care',
    'localcare', 'speciescare', 'Identify', 'IDENTIFY', ' identify ', 'unknown', true, { toString: null }]) {
    const out = await invokeHandler({ env: enabled, body: { ...validBody, mode } });
    assert.equal(out.status, 403);
    assert.equal(out.payload.code, 'PAID_PLANT_IDENTIFIER_MODE_DISABLED');
    assert.equal(out.paid.length, 0);
    assert.equal(out.free.length, 0);
  }
});

test('malformed JSON, bad image and malformed request fields cost zero', async () => {
  for (const options of [
    { rawBody: '{' }, { body: { mode: 'identify' } },
    { body: { ...validBody, imageBase64: 'not-an-image' } },
    { body: { ...validBody, location: { toString: null } } }
  ]) {
    const out = await invokeHandler({ env: enabled, ...options });
    assert.equal(out.status, 400);
    assert.equal(out.paid.length, 0);
  }
});

test('Netlify AI Gateway takes authority over stale direct ANTHROPIC_KEY without adding a dispatch', async () => {
  const gatewayEnv = {
    ...enabled,
    ANTHROPIC_KEY: 'stale-direct-key-must-not-win',
    ANTHROPIC_API_KEY: 'gateway-fixture-key',
    ANTHROPIC_BASE_URL: 'https://gateway.fixture.invalid/'
  };
  const out = await invokeHandler({
    env: gatewayEnv,
    provider: () => new Response(JSON.stringify({ error: { message: 'fixture gateway rejection' } }), { status: 429 })
  });
  assert.equal(out.status, 502);
  assert.equal(out.paid.length, 1);
  assert.equal(out.paid[0].url, 'https://gateway.fixture.invalid/v1/messages');
  assert.equal(out.paid[0].headers['x-api-key'], 'gateway-fixture-key');
  assert.notEqual(out.paid[0].headers['x-api-key'], gatewayEnv.ANTHROPIC_KEY);
});
test('one identify uses one server-selected Vision dispatch and preserves free GBIF verification', async () => {
  const out = await invokeHandler({ env: enabled, body: {
    ...validBody, model: 'client-cannot-select-this', max_tokens: 999999, maxCalls: 50
  }, provider: () => providerResult(validPlant), research: url => new Response(JSON.stringify(
    url.includes('/match?') ? {
      kingdom: 'Plantae', kingdomKey: 6, usageKey: 42, rank: 'SPECIES', status: 'ACCEPTED',
      matchType: 'EXACT', scientificName: 'Rosa canina', canonicalName: 'Rosa canina'
    } : url.includes('/suggest?') ? [] : { results: [] }
  )) });
  assert.equal(out.status, 200);
  assert.equal(out.paid.length, 1);
  assert.equal(out.paid[0].body.model, 'claude-sonnet-4-6');
  assert.equal(out.paid[0].body.max_tokens, 1500);
  assert.equal(out.paid[0].body.messages[0].content[0].type, 'image');
  assert.equal(out.paid[0].redirect, 'error');
  assert.equal(out.payload.gbifVerified, true);
  assert.ok(out.free.length > 0);
});

const secretMarker = 'fixture-sensitive-provider-diagnostic';
const failures = [
  ['invalid model 400', () => new Response(JSON.stringify({ error: { message: 'invalid model ' + secretMarker } }), { status: 400 })],
  ['not found 404', () => new Response(JSON.stringify({ error: { message: 'model not found ' + secretMarker } }), { status: 404 })],
  ['provider 429', () => new Response(JSON.stringify({ error: { message: secretMarker } }), { status: 429 })],
  ['provider 500', () => new Response(JSON.stringify({ error: { message: secretMarker } }), { status: 500 })],
  ['provider error inside 200', () => new Response(JSON.stringify({ error: { message: secretMarker } }))],
  ['rejected request', () => { throw new Error(secretMarker); }],
  ['abort', () => { throw Object.assign(new Error(secretMarker), { name: 'AbortError' }); }],
  ['malformed HTTP JSON', () => new Response('{')],
  ['malformed model JSON', () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'not JSON' }] }))],
  ['invalid content shape', () => new Response(JSON.stringify({ content: {} }))],
  ['downstream type error', () => providerResult({ ...validPlant, common_name: { toString: null } })]
];
for (const [name, provider] of failures) {
  test(name + ': one call and no fallback/recovery/retry or diagnostic leak', async () => {
    const out = await invokeHandler({ env: { ...enabled, ANTHROPIC_MODEL: 'fixture-distinct-preferred-model' }, provider });
    assert.equal(out.status, 502);
    assert.equal(out.paid.length, 1);
    assert.equal(out.paid[0].body.model, 'fixture-distinct-preferred-model');
    assert.deepEqual(out.payload, { error: 'The plant could not be identified.', code: 'PAID_PLANT_IDENTIFIER_FAILED' });
    assert.doesNotMatch(JSON.stringify(out.payload), new RegExp(secretMarker + '|' + FIXTURE_KEY + '|stack|TypeError'));
  });
}

for (const [name, result] of [
  ['blocked Dodonaea', { scientific_name: 'Dodonaea viscosa', confidence: 'high' }],
  ['weak aroid', { scientific_name: 'Alocasia macrorrhizos', confidence: 'high', visual_analysis: { prominent_structure: 'mixed', notes: 'potted houseplant' } }],
  ['ambiguous brush flower', { scientific_name: 'Callistemon citrinus', confidence: 'medium', visual_analysis: { prominent_structure: 'flowers' }, alternatives: [{ scientific_name: 'Metrosideros excelsa' }] }]
]) {
  test(name + ': recovery never dispatches another Vision call', async () => {
    const out = await invokeHandler({ env: enabled, provider: () => providerResult(result) });
    assert.equal(out.paid.length, 1);
    assert.equal(out.status, name === 'blocked Dodonaea' ? 502 : 200);
  });
}

function historicalMultiplicationFixtures(preferred) {
  const sonnet = 'claude-sonnet-4-6';
  const haiku = 'claude-haiku-4-5-20251001';
  const models = [...new Set([preferred, sonnet, 'claude-sonnet-4-5-20250929', haiku])];
  return models.flatMap(model => {
    const recoveryCalls = new Set([model, sonnet, haiku]).size;
    return [
      { scientific_name: 'Dodonaea viscosa' },
      ...Array.from({ length: recoveryCalls - 1 }, () => ({ scientific_name: 'Dodonaea viscosa' })),
      { scientific_name: 'Alocasia macrorrhizos', confidence: 'high', visual_analysis: { prominent_structure: 'mixed', notes: 'potted houseplant' } },
      { scientific_name: 'Ficus elastica', common_name: { toString: null }, confidence: 'high' }
    ];
  });
}
for (const [preferred, historicalCount] of [['claude-sonnet-4-6', 13], ['fixture-distinct-preferred-model', 18]]) {
  test('historical ' + historicalCount + '-call explosion is contained to one dispatch', async () => {
    const fixtures = historicalMultiplicationFixtures(preferred);
    assert.equal(fixtures.length, historicalCount);
    const out = await invokeHandler({ env: { ...enabled, ANTHROPIC_MODEL: preferred },
      provider: index => providerResult(fixtures[index - 1]) });
    assert.equal(out.status, 502);
    assert.equal(out.paid.length, 1);
  });
}
