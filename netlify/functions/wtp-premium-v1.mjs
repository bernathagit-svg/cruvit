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
  const source = String(event.source || "").toLowerCase();
  if (["internal_test", "dev", "localhost_dev"].includes(source)) return true;
  if (query.internal === "1" || query.internal === "true") return true;
  if (headers["x-wtp-internal"] === "1" || headers["x-wtp-internal"] === "true")
    return true;
  const ua = String(headers["user-agent"] || "").toLowerCase();
  if (ua.includes("wtp-internal-test")) return true;
  if (event.internalTraffic === true) return true;
  return false;
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
  for (const e of events) {
    if (e.syntheticTestOnly === true) continue;
    if (e.internalTraffic === true) continue;
    if (e.priceShownUsd !== PRICE) continue;
    if (e.eventType === "offerPageView") impressions.add(e.sessionId);
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
  return {
    qualifiedImpressions,
    ctaClicks,
    earlyAccessCompletions,
    ctaRate,
    earlyAccessRateOnImpressions,
    earlyAccessRateOnCta: ctaClicks ? earlyAccessCompletions / ctaClicks : null,
    priceShownUsd: PRICE,
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

function formatSummary(result) {
  const a = result.aggregate;
  const pct = (r) => (r === null ? "n/a" : `${(r * 100).toFixed(1)}%`);
  return [
    "Premium WTP Test",
    "",
    `Qualified impressions: ${a.qualifiedImpressions}`,
    "",
    `CTA clicks: ${a.ctaClicks}`,
    `CTA rate: ${pct(a.ctaRate)}`,
    "",
    `Early-access joins: ${a.earlyAccessCompletions}`,
    `Join rate: ${pct(a.earlyAccessRateOnImpressions)}`,
    "",
    "Price tested:",
    "$7.99 / month",
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
  // Functions v1 (Lambda compatibility): required for Netlify Blobs context.
  connectLambda(event);

  if (event.httpMethod === "OPTIONS") {
    return json(204, {});
  }

  const store = getStore(STORE_NAME);
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};

  if (event.httpMethod === "GET" && query.view === "summary") {
    const events = await readLines(store, EVENTS_KEY);
    const agg = aggregate(events);
    const classified = classify(agg);
    const result = { aggregate: agg, ...classified };
    const body = formatSummary(result);
    if (emailLeak(body)) return text(500, "WTP_SUMMARY_MUST_NOT_CONTAIN_EMAIL");
    return text(200, body);
  }

  if (event.httpMethod === "GET" && query.view === "summary.json") {
    const events = await readLines(store, EVENTS_KEY);
    const agg = aggregate(events);
    const classified = classify(agg);
    const result = { aggregate: agg, ...classified };
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

  if (body.syntheticTestOnly === true) {
    return json(400, {
      ok: false,
      reason: "synthetic_events_must_not_persist_as_real_user_evidence",
    });
  }

  const action = String(body.action || "");

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
    const campaign = body.campaign ? String(body.campaign) : null;
    const row = {
      eventType,
      timestamp: new Date().toISOString(),
      sessionId,
      source,
      campaign,
      priceShownUsd: PRICE,
      internalTraffic: isInternal(body, headers, query),
    };
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
    const campaign = body.campaign ? String(body.campaign) : null;
    const internal = isInternal(body, headers, query);
    const ts = new Date().toISOString();
    await appendLine(store, EVENTS_KEY, {
      eventType: "earlyAccessCompletion",
      timestamp: ts,
      sessionId,
      source,
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
