// Run locally: node --experimental-vm-modules --test tests/wtp-premium-v1-*.test.mjs
// The real @netlify/blobs package is NEVER loaded; imports are allowlisted below.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../netlify/functions/wtp-premium-v1.mjs", import.meta.url), "utf8");
const PROD_ID = "66d2b5a1-eee3-47c7-b201-4ccbed5410e3";
const PREPROD_ID = "3dfb9a4c-e6b3-4cf0-b3d4-590b81ff7839";
const production = { SITE_ID: PROD_ID, WTP_PERSISTENCE_ENABLED: "true" };
const zero = { connectLambda: 0, getStore: 0, get: 0, set: 0 };
const eventBody = {
  action: "event", eventType: "offerPageView", sessionId: "wtp-local-mock-session",
  source: "newsletter", medium: "email", campaign: "premium", priceShownUsd: 0,
};
const earlyBody = {
  ...eventBody, action: "early-access", email: "  Person@Example.invalid  ", consentAccepted: true,
};

async function fixture(env = {}, seed = {}) {
  const counters = { ...zero };
  const values = new Map(Object.entries(seed));
  const keysRead = [];
  const context = vm.createContext({ process: { env: Object.freeze({ ...env }) } });
  const blobs = new vm.SyntheticModule(["connectLambda", "getStore"], function () {
    this.setExport("connectLambda", () => { counters.connectLambda++; });
    this.setExport("getStore", (name) => {
      counters.getStore++;
      assert.equal(name, "wtp-premium-v1");
      return {
        async get(key) { counters.get++; keysRead.push(key); return values.get(key) ?? null; },
        async set(key, value) { counters.set++; values.set(key, value); },
      };
    });
  }, { context });
  const crypto = new vm.SyntheticModule(["createHash", "randomUUID"], function () {
    this.setExport("createHash", createHash);
    this.setExport("randomUUID", randomUUID);
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "@netlify/blobs") return blobs;
    if (specifier === "node:crypto") return crypto;
    throw new Error(`Unmocked import prohibited: ${specifier}`);
  });
  await module.evaluate();
  assert.deepEqual(counters, zero, "module initialization must not acquire a store");
  return { handler: module.namespace.handler, authority: module.namespace.persistenceAuthority, counters, values, keysRead };
}

function request(body = eventBody, query = {}, headers = {}) {
  return { httpMethod: "POST", body: JSON.stringify(body), queryStringParameters: query, headers };
}

function proof(t, fixture, expected) {
  assert.deepEqual(fixture.counters, expected);
  t.diagnostic(`MOCK_BLOB_COUNTS ${JSON.stringify(fixture.counters)}`);
}

test("01 pure authority: only exact production environment plus real traffic permits persistence", async (t) => {
  const f = await fixture();
  assert.equal(f.authority(production), true);
  for (const env of [undefined, null, {}, { SITE_ID: PROD_ID }, { WTP_PERSISTENCE_ENABLED: "true" }]) {
    assert.equal(f.authority(env), false);
  }
  for (const flag of [true, false, 1, null, "TRUE", "True", "1", " true", "true ", "", "false"]) {
    assert.equal(f.authority({ ...production, WTP_PERSISTENCE_ENABLED: flag }), false);
  }
  assert.equal(f.authority(production, { internalTraffic: true }), false);
  assert.equal(f.authority(production, { syntheticTestOnly: true }), false);
  proof(t, f, zero);
});

// Each class exercises BOTH POST actions and BOTH summary GET representations.
const deniedClasses = [
  { name: "02 production flag missing", env: { SITE_ID: PROD_ID } },
  { name: "03 production flag false", env: { ...production, WTP_PERSISTENCE_ENABLED: "false" } },
  { name: "04 wrong site flag true", env: { ...production, SITE_ID: "wrong-site" } },
  { name: "05 preprod accidentally enabled", env: { ...production, SITE_ID: PREPROD_ID } },
  { name: "missing site", env: { WTP_PERSISTENCE_ENABLED: "true" } },
  { name: "all authority missing", env: {} },
  { name: "unexpected flag uppercase", env: { ...production, WTP_PERSISTENCE_ENABLED: "TRUE" } },
  { name: "unexpected flag whitespace", env: { ...production, WTP_PERSISTENCE_ENABLED: "true " } },
  { name: "unexpected site whitespace", env: { ...production, SITE_ID: `${PROD_ID} ` } },
  ...["deploy-preview", "branch-deploy", "preview-server", "dev"].map((context) => ({
    name: `${context} production site flag false`,
    env: { ...production, WTP_PERSISTENCE_ENABLED: "false", CONTEXT: context },
  })),
  { name: "06 internal query 1", env: production, query: { internal: "1" } },
  { name: "06 internal query true", env: production, query: { internal: "true" } },
  { name: "06 internal header 1", env: production, headers: { "x-wtp-internal": "1" } },
  { name: "06 internal mixed-case header true", env: production, headers: { "X-WTP-Internal": "true" } },
  { name: "06 internal user-agent", env: production, headers: { "User-Agent": "Browser WTP-INTERNAL-TEST" } },
  ...["internal_test", "dev", "localhost_dev"].map((value) => ({
    name: `06 internal source ${value}`, env: production, body: { source: value }, query: { source: value },
  })),
  { name: "06 internal UTM query cannot be hidden by a real body source", env: production, query: { utm_source: "INTERNAL_TEST" } },
  { name: "07 synthetic query true", env: production, query: { syntheticTestOnly: "true" } },
  { name: "07 synthetic query 1", env: production, query: { syntheticTestOnly: "1" } },
  {
    name: "backend/host/origin/body cannot grant missing server authority", env: {},
    query: { backend: "netlify", SITE_ID: PROD_ID, WTP_PERSISTENCE_ENABLED: "true" },
    headers: { host: "friendly-taiyaki-64aacb.netlify.app", origin: "https://friendly-taiyaki-64aacb.netlify.app" },
    body: { ...production, internalTraffic: false, syntheticTestOnly: false },
  },
];

for (const scenario of deniedClasses) {
  test(scenario.name, async (t) => {
    for (const route of ["event", "early-access", "summary", "summary.json"]) {
      await t.test(route, async (t) => {
        const f = await fixture(scenario.env, { "events.jsonl": "PRIVATE_EVIDENCE_MUST_NOT_BE_READ" });
        const req = route.startsWith("summary")
          ? { httpMethod: "GET", queryStringParameters: { ...scenario.query, view: route }, headers: scenario.headers }
          : request({ ...(route === "event" ? eventBody : earlyBody), ...scenario.body }, scenario.query, scenario.headers);
        const response = await f.handler(req);
        assert.equal(response.statusCode, route === "event" ? 200 : 403);
        assert.deepEqual(JSON.parse(response.body), {
          ok: route === "event", persisted: false, code: "WTP_PERSISTENCE_DISABLED",
        });
        assert.equal(response.headers["Cache-Control"], "no-store");
        assert.equal(f.values.get("events.jsonl"), "PRIVATE_EVIDENCE_MUST_NOT_BE_READ");
        proof(t, f, zero);
      });
    }
  });
}

for (const [label, marker] of [
  ["06 internal body", { internalTraffic: true }],
  ["07 synthetic body", { syntheticTestOnly: true }],
  ...["internal_test", "DEV", "localhost_dev"].map((source) => [`06 body-only source ${source}`, { source }]),
]) {
  for (const action of ["event", "early-access"]) {
    test(`${label}: ${action} denied with valid production environment`, async (t) => {
      const f = await fixture(production);
      const response = await f.handler(request({ ...(action === "event" ? eventBody : earlyBody), ...marker }));
      assert.equal(response.statusCode, action === "event" ? 200 : 403);
      assert.deepEqual(JSON.parse(response.body), {
        ok: action === "event", persisted: false, code: "WTP_PERSISTENCE_DISABLED",
      });
      proof(t, f, zero);
    });
  }
}

test("10 nonproduction signup is explicitly disabled even before email validation", async (t) => {
  const f = await fixture({ SITE_ID: PREPROD_ID });
  const response = await f.handler(request({ action: "early-access" }));
  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), { ok: false, persisted: false, code: "WTP_PERSISTENCE_DISABLED" });
  proof(t, f, zero);
});

test("11 nonproduction summary exposes no production evidence in either representation", async (t) => {
  const f = await fixture({ SITE_ID: PREPROD_ID }, { "events.jsonl": "PRIVATE", "early-access.jsonl": "EMAILS" });
  for (const view of ["summary", "summary.json"]) {
    const response = await f.handler({ httpMethod: "GET", queryStringParameters: { view } });
    assert.equal(response.statusCode, 403);
    assert.equal(JSON.parse(response.body).code, "WTP_PERSISTENCE_DISABLED");
    assert.doesNotMatch(response.body, /PRIVATE|EMAILS|aggregate/);
  }
  proof(t, f, zero);
});

for (const eventType of ["offerPageView", "premiumCtaClick", "earlyAccessCompletion"]) {
  test(`12 authorized production ${eventType} preserves analytics row and append behavior`, async (t) => {
    const previous = JSON.stringify({ eventType: "offerPageView", sessionId: "previous", priceShownUsd: 7.99 }) + "\n";
    const f = await fixture(production, { "events.jsonl": previous });
    const response = await f.handler(request({ ...eventBody, eventType }));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      ok: true, sessionId: eventBody.sessionId, internalTraffic: false, durableBackend: "NETLIFY_BLOBS_PRODUCTION",
    });
    const stored = f.values.get("events.jsonl");
    assert.ok(stored.startsWith(previous));
    const row = JSON.parse(stored.slice(previous.length));
    assert.deepEqual(row, {
      eventType, timestamp: row.timestamp, sessionId: eventBody.sessionId, source: "newsletter",
      medium: "email", campaign: "premium", priceShownUsd: 7.99, internalTraffic: false,
    });
    assert.ok(Number.isFinite(Date.parse(row.timestamp)));
    assert.equal(f.values.has("early-access.jsonl"), false);
    proof(t, f, { connectLambda: 1, getStore: 1, get: 1, set: 1 });
  });
}

test("13 authorized production early-access preserves normalization, hash, consent and two appends", async (t) => {
  const f = await fixture(production, { "events.jsonl": "{\"previous\":true}\n", "early-access.jsonl": "{\"previous\":true}\n" });
  const response = await f.handler(request(earlyBody));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true, sessionId: eventBody.sessionId, durableBackend: "NETLIFY_BLOBS_PRODUCTION",
  });
  const rows = (key) => f.values.get(key).trim().split("\n").map(JSON.parse);
  const [oldEvent, event] = rows("events.jsonl");
  const [oldEmail, email] = rows("early-access.jsonl");
  assert.deepEqual(oldEvent, { previous: true });
  assert.deepEqual(oldEmail, { previous: true });
  assert.deepEqual(event, {
    eventType: "earlyAccessCompletion", timestamp: event.timestamp, sessionId: eventBody.sessionId,
    source: "newsletter", medium: "email", campaign: "premium", priceShownUsd: 7.99,
    internalTraffic: false, emailHash: createHash("sha256").update("person@example.invalid").digest("hex"),
  });
  assert.ok(Number.isFinite(Date.parse(event.timestamp)));
  assert.deepEqual(email, {
    timestamp: event.timestamp, sessionId: eventBody.sessionId, source: "newsletter", medium: "email",
    campaign: "premium", emailNormalized: "person@example.invalid", consentAccepted: true,
  });
  assert.doesNotMatch(f.values.get("events.jsonl"), /person@example\.invalid/i);
  proof(t, f, { connectLambda: 1, getStore: 1, get: 2, set: 2 });
});

const analytics = [
  { eventType: "offerPageView", sessionId: "a", source: "newsletter", priceShownUsd: 7.99 },
  { eventType: "offerPageView", sessionId: "a", source: "duplicate", priceShownUsd: 7.99 },
  { eventType: "offerPageView", sessionId: "b", source: "direct", priceShownUsd: 7.99 },
  { eventType: "premiumCtaClick", sessionId: "a", priceShownUsd: 7.99 },
  { eventType: "premiumCtaClick", sessionId: "a", priceShownUsd: 7.99 },
  { eventType: "earlyAccessCompletion", sessionId: "a", priceShownUsd: 7.99 },
  { eventType: "offerPageView", sessionId: "internal", internalTraffic: true, priceShownUsd: 7.99 },
  { eventType: "offerPageView", sessionId: "synthetic", syntheticTestOnly: true, priceShownUsd: 7.99 },
  { eventType: "offerPageView", sessionId: "wrong-price", priceShownUsd: 0 },
];
for (const view of ["summary", "summary.json"]) {
  test(`authorized production ${view}: dedupe, exclusions, rates and email privacy preserved`, async (t) => {
    const f = await fixture(production, {
      "events.jsonl": analytics.map((row) => JSON.stringify(row)).join("\n") + "\ninvalid json\n",
      "early-access.jsonl": "person@example.invalid",
    });
    const response = await f.handler({ httpMethod: "GET", queryStringParameters: { view } });
    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(response.body, /person@example\.invalid/);
    assert.deepEqual(f.keysRead, ["events.jsonl"]);
    if (view === "summary.json") {
      assert.deepEqual(JSON.parse(response.body), {
        aggregate: {
          qualifiedImpressions: 2, ctaClicks: 1, earlyAccessCompletions: 1, ctaRate: 0.5,
          earlyAccessRateOnImpressions: 0.5, earlyAccessRateOnCta: 1, priceShownUsd: 7.99,
          trafficSourceCounts: { newsletter: 1, direct: 1 },
        },
        signal: "INSUFFICIENT_SAMPLE", nextDecision: "CONTINUE_UNTIL_SAMPLE",
      });
    } else {
      assert.match(response.body, /Qualified impressions: 2/);
      assert.match(response.body, /Premium CTA clicks: 1/);
      assert.match(response.body, /CTA rate: 50.0%/);
      assert.match(response.body, /Early-access completions: 1/);
      assert.match(response.body, /INSUFFICIENT_SAMPLE/);
    }
    proof(t, f, { connectLambda: 1, getStore: 1, get: 1, set: 0 });
  });
}

test("invalid requests and OPTIONS never acquire a store, even in authorized production", async (t) => {
  for (const [req, status, reason] of [
    [{ httpMethod: "OPTIONS" }, 204],
    [{ httpMethod: "GET" }, 404, "not_found"],
    [{ httpMethod: "DELETE" }, 404, "not_found"],
    [{ httpMethod: "POST", body: "{" }, 400, "invalid_json"],
    [request(null), 400, "invalid_json"],
    [request([]), 400, "invalid_json"],
    [request({ action: "unknown" }), 400, "invalid_action"],
    [request({ ...eventBody, eventType: "unknown" }), 400, "invalid_event_type"],
    [request({ ...earlyBody, consentAccepted: false }), 400, "consent_required"],
    [request({ ...earlyBody, email: "invalid" }), 400, "invalid_email"],
  ]) {
    const f = await fixture(production);
    const response = await f.handler(req);
    assert.equal(response.statusCode, status);
    assert.equal(JSON.parse(response.body).reason, reason);
    proof(t, f, zero);
  }
});
