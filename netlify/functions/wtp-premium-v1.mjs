/**
 * Netlify Function — Premium WTP V1 durable event + early-access store.
 * Uses Netlify Blobs (hosting-native). Emails never returned by summary.
 *
 * Endpoints (same function):
 *   GET  /.netlify/functions/wtp-premium-v1?view=summary
 *   GET  /.netlify/functions/wtp-premium-v1?view=summary.json
 *   POST /.netlify/functions/wtp-premium-v1  body.action = event | early-access
 *
 * Deploy package for CRUVIT Netlify (friendly-taiyaki-64aacb.netlify.app).
 */

import { connectLambda, getStore } from "@netlify/blobs";
import { createHash, randomUUID } from "node:crypto";

const PRICE = 7.99;
const STORE_NAME = "wtp-premium-v1";
const EVENTS_KEY = "events.jsonl";
const EARLY_KEY = "early-access.jsonl";

const MIN_IMPRESSIONS = 100;
const CTA_STRONG = 0.1;
const JOIN_STRONG = 0.05;
const JOIN_WEAK = 0.02;

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-WTP-Internal",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function text(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body,
  };
}

function hashEmail(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function normalizeEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function isInternal(event, headers, query) {
  const sources = [event.source, query.source, query.utm_source];
  if (sources.some((source) =>
    ["internal_test", "dev", "localhost_dev"].includes(String(source || "").toLowerCase())
  )) return true;
  if (query.internal === "1" || query.internal === "true") return true;
  if (headers["x-wtp-internal"] === "1" || headers["x-wtp-internal"] === "true")
    return true;
  const ua = String(headers["user-agent"] || "").toLowerCase();
  if (ua.includes("wtp-internal-test")) return true;
  if (event.internalTraffic === true) return true;
  return false;
}

// Only server environment values grant authority. Request markers can only deny it.
export function persistenceAuthority(env, body = {}, headers = {}, query = {}) {
  return env?.WTP_PERSISTENCE_ENABLED === "true"
    && env?.SITE_ID === "66d2b5a1-eee3-47c7-b201-4ccbed5410e3"
    && !isInternal(body, headers, query)
    && body.syntheticTestOnly !== true
    && query.syntheticTestOnly !== "true"
    && query.syntheticTestOnly !== "1";
}

function persistenceDisabled(ok, status = 200) {
  return json(status, { ok, persisted: false, code: "WTP_PERSISTENCE_DISABLED" });
}

async function readLines(store, key) {
  const raw = await store.get(key);
  if (!raw) return [];
  return String(raw)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function appendLine(store, key, obj) {
  const prev = (await store.get(key)) || "";
  await store.set(key, `${prev}${JSON.stringify(obj)}\n`);
}

function aggregate(events) {
  const impressions = new Set();
  const ctas = new Set();
  const joins = new Set();
  const impressionSourceBySession = new Map();
  for (const e of events) {
    if (e.syntheticTestOnly === true) continue;
    if (e.internalTraffic === true) continue;
    if (e.priceShownUsd !== PRICE) continue;
    if (e.eventType === "offerPageView") {
      impressions.add(e.sessionId);
      if (!impressionSourceBySession.has(e.sessionId)) {
        impressionSourceBySession.set(
          e.sessionId,
          String(e.source || "unknown").toLowerCase(),
        );
      }
    }
    if (e.eventType === "premiumCtaClick") ctas.add(e.sessionId);
    if (e.eventType === "earlyAccessCompletion") joins.add(e.sessionId);
  }
  const qualifiedImpressions = impressions.size;
  const ctaClicks = ctas.size;
  const earlyAccessCompletions = joins.size;
  const ctaRate = qualifiedImpressions ? ctaClicks / qualifiedImpressions : null;
  const earlyAccessRateOnImpressions = qualifiedImpressions
    ? earlyAccessCompletions / qualifiedImpressions
    : null;
  const trafficSourceCounts = {};
  for (const src of impressionSourceBySession.values()) {
    const key = src || "unknown";
    trafficSourceCounts[key] = (trafficSourceCounts[key] || 0) + 1;
  }
  return {
    qualifiedImpressions,
    ctaClicks,
    earlyAccessCompletions,
    ctaRate,
    earlyAccessRateOnImpressions,
    earlyAccessRateOnCta: ctaClicks ? earlyAccessCompletions / ctaClicks : null,
    priceShownUsd: PRICE,
    trafficSourceCounts,
  };
}

function classify(agg) {
  const impressions = agg.qualifiedImpressions;
  const joinRate = agg.earlyAccessRateOnImpressions;
  const ctaRate = agg.ctaRate;
  if (impressions < MIN_IMPRESSIONS) {
    return {
      signal: "INSUFFICIENT_SAMPLE",
      nextDecision: "CONTINUE_UNTIL_SAMPLE",
    };
  }
  if (
    ctaRate !== null &&
    joinRate !== null &&
    ctaRate >= CTA_STRONG &&
    joinRate >= JOIN_STRONG
  ) {
    return {
      signal: "STRONG",
      nextDecision: "PREMIUM_PAID_VALIDATION",
    };
  }
  if (joinRate !== null && joinRate < JOIN_WEAK) {
    return {
      signal: "WEAK",
      nextDecision: "DO_NOT_ASSUME_SUBSCRIPTION_IS_PRIMARY",
    };
  }
  return {
    signal: "AMBIGUOUS",
    nextDecision: "OFFER_OR_VALUE_PROPOSITION_ITERATION",
  };
}

function formatTrafficSources(counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return ["(none yet)"];
  return entries.map(([src, n]) => `${src}: ${n}`);
}

function formatSummary(result) {
  const a = result.aggregate;
  const pct = (r) => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
  return [
    "CRUVIT Premium WTP Test",
    "",
    `Qualified impressions: ${a.qualifiedImpressions}`,
    "",
    `Premium CTA clicks: ${a.ctaClicks}`,
    `CTA rate: ${pct(a.ctaRate)}`,
    "",
    `Early-access completions: ${a.earlyAccessCompletions}`,
    `Completion rate: ${pct(a.earlyAccessRateOnImpressions)}`,
    "",
    "Traffic source:",
    ...formatTrafficSources(a.trafficSourceCounts),
    "",
    "Price shown:",
    "$7.99/month",
    "",
    "Current signal:",
    result.signal,
    "",
    "Next decision:",
    result.nextDecision,
  ].join("\n");
}

function emailLeak(s) {
  return /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(s);
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const query = event.queryStringParameters || {};

  if (event.httpMethod === "GET" && ["summary", "summary.json"].includes(query.view)) {
    if (!persistenceAuthority(process.env, {}, headers, query)) {
      return persistenceDisabled(false, 403);
    }
    // Guard all summary reads before connecting to or acquiring a Blob store.
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const events = await readLines(store, EVENTS_KEY);
    const agg = aggregate(events);
    const classified = classify(agg);
    const result = { aggregate: agg, ...classified };
    if (query.view === "summary") {
      const body = formatSummary(result);
      if (emailLeak(body)) return text(500, "WTP_SUMMARY_MUST_NOT_CONTAIN_EMAIL");
      return text(200, body);
    }
    const raw = JSON.stringify(result);
    if (emailLeak(raw)) return json(500, { ok: false, reason: "email_leak_blocked" });
    return json(200, result);
  }

  if (event.httpMethod !== "POST") {
    return json(404, { ok: false, reason: "not_found" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(400, { ok: false, reason: "invalid_json" });
  }

  const action = String(body.action || "");
  if (!["event", "early-access"].includes(action)) {
    return json(400, { ok: false, reason: "invalid_action" });
  }
  if (!persistenceAuthority(process.env, body, headers, query)) {
    return persistenceDisabled(action === "event", action === "event" ? 200 : 403);
  }

  if (action === "event") {
    const eventType = body.eventType;
    if (
      !["offerPageView", "premiumCtaClick", "earlyAccessCompletion"].includes(
        eventType,
      )
    ) {
      return json(400, { ok: false, reason: "invalid_event_type" });
    }
    const sessionId = String(body.sessionId || randomUUID());
    const source = String(body.source || "unknown");
    const medium = body.medium ? String(body.medium) : null;
    const campaign = body.campaign ? String(body.campaign) : null;
    const row = {
      eventType,
      timestamp: new Date().toISOString(),
      sessionId,
      source,
      medium,
      campaign,
      priceShownUsd: PRICE,
      internalTraffic: isInternal(body, headers, query),
    };
    // Functions v1 (Lambda compatibility): connect only after authority/validation.
    connectLambda(event);
    const store = getStore(STORE_NAME);
    await appendLine(store, EVENTS_KEY, row);
    return json(200, {
      ok: true,
      sessionId,
      internalTraffic: row.internalTraffic,
      durableBackend: "NETLIFY_BLOBS_PRODUCTION",
    });
  }

  if (action === "early-access") {
    if (body.consentAccepted !== true) {
      return json(400, { ok: false, reason: "consent_required" });
    }
    const email = normalizeEmail(body.email);
    if (!email) return json(400, { ok: false, reason: "invalid_email" });
    const sessionId = String(body.sessionId || randomUUID());
    const source = String(body.source || "unknown");
    const medium = body.medium ? String(body.medium) : null;
    const campaign = body.campaign ? String(body.campaign) : null;
    const internal = isInternal(body, headers, query);
    const ts = new Date().toISOString();
    connectLambda(event);
    const store = getStore(STORE_NAME);
    await appendLine(store, EVENTS_KEY, {
      eventType: "earlyAccessCompletion",
      timestamp: ts,
      sessionId,
      source,
      medium,
      campaign,
      priceShownUsd: PRICE,
      internalTraffic: internal,
      emailHash: hashEmail(email),
    });
    if (!internal) {
      await appendLine(store, EARLY_KEY, {
        timestamp: ts,
        sessionId,
        source,
        medium,
        campaign,
        emailNormalized: email,
        consentAccepted: true,
      });
    }
    return json(200, {
      ok: true,
      sessionId,
      durableBackend: "NETLIFY_BLOBS_PRODUCTION",
    });
  }

  return json(400, { ok: false, reason: "invalid_action" });
}
