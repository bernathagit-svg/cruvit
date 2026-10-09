// Runs the actual inline client script in a local DOM harness. fetch is always mocked.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../wtp-premium-v1/index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
assert.equal(scripts.length, 1, "exercise the complete WTP inline script");
const primary = "friendly-taiyaki-64aacb.netlify.app";
const previewMessage = "Early access signup is unavailable in this preview.";
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function page({ hostname = primary, search = "", userAgent = "Local mocked browser", result, failTelemetry = false, storage = new Map() } = {}) {
  const requests = [];
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => {
    const id = match[1];
    const classes = new Set();
    const listeners = new Map();
    return [id, {
      hidden: ["formError", "confirmMsg"].includes(id), disabled: false,
      textContent: "", value: "person@example.invalid", checked: true,
      classList: { contains: (value) => classes.has(value), add: (value) => classes.add(value) },
      scrollIntoView() {},
      addEventListener(name, handler) { listeners.set(name, handler); },
      async trigger(name) {
        assert.ok(listeners.has(name), `${id} must have a ${name} listener`);
        await listeners.get(name)({ preventDefault() {} });
        await tick();
      },
    }];
  }));
  const location = { hostname, search };
  const context = vm.createContext({
    URLSearchParams, location, window: { location }, navigator: { userAgent },
    crypto: { randomUUID: () => "wtp-local-client-session" },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById(id) { assert.ok(elements.has(id), `unknown DOM id ${id}`); return elements.get(id); } },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (failTelemetry && body.action === "event") throw new Error("mock telemetry unavailable");
      return { json: async () => result ?? { ok: true, durableBackend: "NETLIFY_BLOBS_PRODUCTION" } };
    },
  });
  vm.runInContext(scripts[0], context, { filename: "wtp-premium-v1/index.html", timeout: 1000 });
  await tick();
  return { requests, elements, storage };
}

const suppressed = [
  { name: "08 deploy-preview host", hostname: `deploy-preview-42--${primary}` },
  { name: "08 branch-deploy host", hostname: `work-wtp-r1--${primary}` },
  { name: "08 immutable deploy host", hostname: `6ac92432b87964f08f0fd60e--${primary}` },
  { name: "isolated climate preprod", hostname: "cruvit-climate-preprod-20261009.netlify.app" },
  { name: "isolated climate branch deploy", hostname: "work-test--cruvit-climate-preprod-20261009.netlify.app" },
  { name: "host normalization", hostname: "DEPLOY-PREVIEW-42--FRIENDLY-TAIYAKI-64AACB.NETLIFY.APP." },
  ...["localhost", "app.localhost", "127.0.0.1", "127.1.2.3", "[::1]", "::1", "0.0.0.0"].map((hostname) => ({ name: `09 loopback ${hostname}`, hostname })),
  ...["1", "true"].map((value) => ({ name: `internal=${value}`, search: `?internal=${value}` })),
  ...["internal_test", "dev", "localhost_dev", "INTERNAL_TEST"].map((value) => ({ name: `internal source ${value}`, search: `?source=${value}` })),
  { name: "internal UTM source", search: "?utm_source=internal_test" },
  { name: "real UTM cannot override internal legacy source", search: "?utm_source=newsletter&source=dev" },
  { name: "internal user agent", userAgent: "Browser WTP-INTERNAL-TEST" },
  { name: "synthetic mode true", search: "?syntheticTestOnly=true" },
  { name: "synthetic mode 1", search: "?syntheticTestOnly=1" },
  { name: "backend override cannot bypass localhost", hostname: "localhost", search: "?backend=netlify" },
  { name: "backend override cannot bypass preview", hostname: `deploy-preview-42--${primary}`, search: "?backend=netlify" },
  { name: "backend override cannot bypass internal", search: "?backend=netlify&internal=1" },
];

for (const scenario of suppressed) {
  test(`${scenario.name}: page load/CTAs/signup make zero requests and UI remains usable`, async (t) => {
    const p = await page(scenario);
    assert.equal(p.requests.length, 0, "automatic offerPageView suppressed");
    assert.equal(p.storage.has("wtp_premium_v1_viewed"), false, "suppression must not mark a real impression as sent");
    for (const cta of ["premiumCta", "premiumCtaSecondary"]) {
      // Use a fresh panel state to verify each CTA independently takes the open path.
      const fresh = await page(scenario);
      await fresh.elements.get(cta).trigger("click");
      assert.equal(fresh.elements.get("earlyAccessPanel").classList.contains("visible"), true);
      assert.equal(fresh.elements.get(cta).disabled, false);
      assert.equal(fresh.elements.get("earlyAccessCopy").textContent, previewMessage);
      await fresh.elements.get("earlyAccessForm").trigger("submit");
      assert.equal(fresh.elements.get("formError").hidden, false);
      assert.equal(fresh.elements.get("formError").textContent, previewMessage);
      assert.equal(fresh.elements.get("confirmMsg").hidden, true);
      assert.equal(fresh.elements.get("earlyAccessForm").hidden, false);
      assert.equal(fresh.requests.length, 0, "CTA and signup also suppressed");
    }
    t.diagnostic("MOCK_CLIENT_REQUESTS 0; real requests 0");
  });
}

test("10 server-disabled signup on an unrecognized host shows preview copy, never success", async () => {
  for (const result of [
    { ok: false, persisted: false, code: "WTP_PERSISTENCE_DISABLED" },
    { ok: true, persisted: false },
  ]) {
    const p = await page({ hostname: "custom-preview.example.invalid", search: "?backend=netlify", result });
    await p.elements.get("premiumCta").trigger("click");
    await p.elements.get("earlyAccessForm").trigger("submit");
    assert.equal(p.elements.get("formError").textContent, previewMessage);
    assert.equal(p.elements.get("formError").hidden, false);
    assert.equal(p.elements.get("confirmMsg").hidden, true);
    assert.equal(p.elements.get("earlyAccessForm").hidden, false);
    assert.equal(p.requests.at(-1).body.action, "early-access");
  }
});

test("12/13 production client preserves one view per session, CTA metadata and successful signup", async () => {
  const options = { search: "?utm_source=newsletter&utm_medium=email&utm_campaign=premium", storage: new Map() };
  const p = await page(options);
  assert.equal(p.requests.length, 1);
  assert.deepEqual(p.requests[0].body, {
    action: "event", eventType: "offerPageView", sessionId: "wtp-local-client-session",
    source: "newsletter", medium: "email", campaign: "premium", priceShownUsd: 7.99, internalTraffic: false,
  });
  assert.equal(p.requests[0].url, "/.netlify/functions/wtp-premium-v1");
  assert.equal(p.requests[0].options.method, "POST");
  await p.elements.get("premiumCta").trigger("click");
  assert.equal(p.requests[1].body.eventType, "premiumCtaClick");
  assert.equal(p.elements.get("earlyAccessPanel").classList.contains("visible"), true);
  await p.elements.get("premiumCtaSecondary").trigger("click");
  assert.equal(p.requests.length, 2, "already-open panel does not produce duplicate CTA");
  await p.elements.get("earlyAccessForm").trigger("submit");
  assert.deepEqual(p.requests[2].body, {
    action: "early-access", email: "person@example.invalid", consentAccepted: true,
    sessionId: "wtp-local-client-session", source: "newsletter", medium: "email", campaign: "premium", internalTraffic: false,
  });
  assert.equal(p.elements.get("earlyAccessForm").hidden, true);
  assert.equal(p.elements.get("confirmMsg").hidden, false);
  const reload = await page(options);
  assert.equal(reload.requests.length, 0);
});

test("production custom domain can select Netlify transport without granting persistence", async () => {
  const p = await page({ hostname: "cruvit.example.invalid", search: "?backend=netlify" });
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].url, "/.netlify/functions/wtp-premium-v1");
});

test("telemetry transport failure does not break either CTA", async () => {
  for (const cta of ["premiumCta", "premiumCtaSecondary"]) {
    const p = await page({ failTelemetry: true });
    await p.elements.get(cta).trigger("click");
    assert.equal(p.elements.get("earlyAccessPanel").classList.contains("visible"), true);
    assert.equal(p.elements.get(cta).disabled, false);
  }
});

test("production consent and generic server errors retain existing validation without fake success", async () => {
  const p = await page({ result: { ok: false, reason: "invalid_email" } });
  p.elements.get("consent").checked = false;
  await p.elements.get("earlyAccessForm").trigger("submit");
  assert.equal(p.elements.get("formError").textContent, "Consent is required to join early access.");
  assert.equal(p.requests.length, 1);
  p.elements.get("consent").checked = true;
  await p.elements.get("earlyAccessForm").trigger("submit");
  assert.equal(p.elements.get("formError").textContent, "Could not join the list. Please check your email and try again.");
  assert.equal(p.elements.get("confirmMsg").hidden, true);
  assert.equal(p.elements.get("earlyAccessForm").hidden, false);
});
