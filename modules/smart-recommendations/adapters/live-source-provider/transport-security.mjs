/**
 * Cruvit — Live Source Provider Transport/Security (secret-free simulation)
 * Deterministic policy helpers over injected DNS/HTTP/TLS metadata only.
 * No sockets, DNS lookups, fetch, TLS handshakes, credentials, or filesystem.
 */

export const SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION =
  '0.1.0-sr-live-source-provider-transport-security-contract';

export const TRANSPORT_LIMITS = Object.freeze({
  bytesPerResponse: 524288,
  totalBytes: 2097152,
  normalizedSourceTextChars: 8000,
  redirects: 3,
  retries: 1,
  concurrentRuns: 1,
  concurrentFetches: 2,
  requestsPerHost: 2,
  pilotCostUsd: 0.1,
  absoluteCostUsd: 0.25,
  maxCompressionRatio: 40
});

const SECRET_KEY_RE =
  /^(api[_-]?key|token|access[_-]?token|password|secret|cookie|cookies|session|authorization|credentials|bearer)$/i;
const SECRET_VALUE_RE =
  /(sk-[a-z0-9]{8,}|bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S+)/i;

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) freezeDeep(value[i]);
    return Object.freeze(value);
  }
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) freezeDeep(value[keys[i]]);
  return Object.freeze(value);
}

function trim(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

export function stableSerialize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableSerialize(value[k])).join(',') + '}';
}

export function fingerprintOf(prefix, value) {
  const s = stableSerialize(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return prefix + '|' + (h >>> 0).toString(16) + '|' + s.length;
}

export function getLiveSourceProviderTransportSecurityDescriptor() {
  return freezeDeep({
    transportSecurityContractVersion:
      SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
    developerOnly: true,
    simulationOnly: true,
    realDns: false,
    realNetwork: false,
    realTls: false,
    externalApi: false,
    credentials: false,
    filesystemWrite: false,
    automaticExecution: false,
    authoritative: false,
    approvalAuthority: false,
    identityAuthority: false,
    evidencePacketAuthority: false,
    fieldReviewAuthority: false,
    structuredProfileAuthority: false,
    batchAuthority: false,
    batchFinalizationAllowed: false,
    artifactWriteAllowed: false,
    catalogAuthority: false,
    productAuthority: false,
    eligibilityAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    productUseAllowed: false,
    runtimeConsumptionAllowed: false,
    limits: TRANSPORT_LIMITS,
    disclaimer:
      'Policy simulation only: no live DNS lookup, socket binding, real TLS handshake, or live DNS-rebinding protection occurred.'
  });
}

function isLoopbackIpv4(parts) {
  return parts[0] === 127;
}

function isPrivateIpv4(parts) {
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isLinkLocalIpv4(parts) {
  return parts[0] === 169 && parts[1] === 254;
}

function isCloudMetadataIpv4(parts) {
  return parts[0] === 169 && parts[1] === 254 && parts[2] === 169 && parts[3] === 254;
}

function isMulticastIpv4(parts) {
  return parts[0] >= 224 && parts[0] <= 239;
}

function parseIpv4(addr) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(trim(addr));
  if (!m) return null;
  const parts = [0, 1, 2, 3].map((i) => Number(m[i + 1]));
  if (parts.some((n) => n > 255)) return null;
  return parts;
}

function classifyIpv4(addr) {
  const parts = parseIpv4(addr);
  if (!parts) return { ok: false, reason: 'invalid_ipv4' };
  if (isCloudMetadataIpv4(parts)) return { ok: false, reason: 'cloud_metadata' };
  if (isLoopbackIpv4(parts)) return { ok: false, reason: 'loopback' };
  if (isLinkLocalIpv4(parts)) return { ok: false, reason: 'link_local' };
  if (isPrivateIpv4(parts)) return { ok: false, reason: 'private_ipv4' };
  if (isMulticastIpv4(parts)) return { ok: false, reason: 'multicast' };
  if (parts[0] === 0) return { ok: false, reason: 'reserved' };
  return { ok: true, family: 'ipv4', parts };
}

function classifyIpv6(addr) {
  const a = trim(addr).toLowerCase();
  if (!a.includes(':')) return { ok: false, reason: 'invalid_ipv6' };
  if (a === '::1' || a.startsWith('::1/')) return { ok: false, reason: 'loopback' };
  if (a.startsWith('fe80:')) return { ok: false, reason: 'link_local' };
  if (
    a.startsWith('fc') ||
    a.startsWith('fd') ||
    a.startsWith('fc00:') ||
    a.startsWith('fd00:')
  ) {
    return { ok: false, reason: 'private_ipv6' };
  }
  if (a.startsWith('ff')) return { ok: false, reason: 'multicast' };
  if (a === '::' || a.startsWith('::/')) return { ok: false, reason: 'reserved' };
  return { ok: true, family: 'ipv6' };
}

export function classifyAddress(addr) {
  const s = trim(addr);
  if (!s) return freezeDeep({ ok: false, reason: 'empty_address' });
  if (s.includes(':') && !/^\d+\.\d+\.\d+\.\d+$/.test(s)) return freezeDeep(classifyIpv6(s));
  return freezeDeep(classifyIpv4(s));
}

export function normalizeAndValidateOutboundUrl(value, policy = {}) {
  const findings = [];
  const raw = trim(value);
  if (!raw) {
    findings.push({ code: 'ssrf_blocked', path: 'url', detail: 'empty' });
    return freezeDeep({ ok: false, normalized: null, host: null, findings, simulationOnly: true });
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    findings.push({ code: 'ssrf_blocked', path: 'url', detail: 'parse_failed' });
    return freezeDeep({ ok: false, normalized: null, host: null, findings, simulationOnly: true });
  }
  const scheme = u.protocol.replace(':', '').toLowerCase();
  const allowed = Array.isArray(policy.allowedSchemes)
    ? policy.allowedSchemes.map((s) => String(s).toLowerCase())
    : ['http', 'https'];
  if (!allowed.includes(scheme)) {
    findings.push({ code: 'blocked_scheme', path: 'url.protocol', detail: scheme || 'none' });
    return freezeDeep({ ok: false, normalized: null, host: null, findings, simulationOnly: true });
  }
  if (u.username || u.password) {
    findings.push({
      code: 'ssrf_blocked',
      path: 'url.credentials',
      detail: 'credential_bearing_url'
    });
    return freezeDeep({ ok: false, normalized: null, host: null, findings, simulationOnly: true });
  }
  const host = (u.hostname || '').toLowerCase();
  if (!host) {
    findings.push({ code: 'ssrf_blocked', path: 'url.host', detail: 'missing_host' });
    return freezeDeep({ ok: false, normalized: null, host: null, findings, simulationOnly: true });
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    findings.push({ code: 'private_target', path: 'url.host', detail: 'localhost' });
    return freezeDeep({ ok: false, normalized: null, host, findings, simulationOnly: true });
  }
  if (host === 'metadata.google.internal' || host === 'metadata') {
    findings.push({ code: 'private_target', path: 'url.host', detail: 'cloud_metadata_host' });
    return freezeDeep({ ok: false, normalized: null, host, findings, simulationOnly: true });
  }
  const asIp = classifyAddress(host);
  if (asIp.ok === false && (parseIpv4(host) || host.includes(':'))) {
    findings.push({
      code: asIp.reason === 'cloud_metadata' ? 'private_target' : 'private_target',
      path: 'url.host',
      detail: asIp.reason
    });
    return freezeDeep({ ok: false, normalized: null, host, findings, simulationOnly: true });
  }
  u.hash = '';
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
    (k) => u.searchParams.delete(k)
  );
  const normalized = u.toString().replace(/\/$/, '') === u.origin ? u.origin + '/' : u.toString().replace(/\/$/, '');
  const out = normalized.endsWith('/') && u.pathname === '/' ? normalized : u.toString().replace(/\/$/, '');
  return freezeDeep({
    ok: true,
    normalized: out || u.toString(),
    host,
    scheme,
    findings,
    simulationOnly: true
  });
}

export function validateResolvedAddresses(addresses, policy = {}) {
  const findings = [];
  const list = Array.isArray(addresses) ? addresses : [];
  if (!list.length) {
    findings.push({ code: 'ssrf_blocked', path: 'resolvedAddresses', detail: 'empty' });
    return freezeDeep({ ok: false, findings, simulationOnly: true });
  }
  for (let i = 0; i < list.length; i++) {
    const c = classifyAddress(list[i]);
    if (!c.ok) {
      findings.push({
        code: 'private_target',
        path: 'resolvedAddresses[' + i + ']',
        detail: c.reason
      });
      return freezeDeep({ ok: false, findings, simulationOnly: true });
    }
  }
  if (policy.pinAddress && list.indexOf(policy.pinAddress) < 0) {
    findings.push({
      code: 'dns_rebinding_blocked',
      path: 'resolvedAddresses',
      detail: 'pin_mismatch'
    });
    return freezeDeep({ ok: false, findings, simulationOnly: true });
  }
  return freezeDeep({ ok: true, findings, simulationOnly: true });
}

export function validateRedirectTarget(target, context = {}) {
  const findings = [];
  const max = Number(context.maximumRedirects || TRANSPORT_LIMITS.redirects);
  const count = Number(context.redirectCount || 0);
  if (count > max) {
    findings.push({ code: 'unsafe_redirect', path: 'redirectCount', detail: 'max_' + max });
    return freezeDeep({ ok: false, findings, strippedHeaders: [], simulationOnly: true });
  }
  const urlRes = normalizeAndValidateOutboundUrl(target, context.policy || {});
  if (!urlRes.ok) {
    findings.push(...urlRes.findings);
    findings.push({ code: 'unsafe_redirect', path: 'redirect.target', detail: 'target_blocked' });
    return freezeDeep({ ok: false, findings, strippedHeaders: [], simulationOnly: true });
  }
  const addrs = Array.isArray(context.resolvedAddresses) ? context.resolvedAddresses : [];
  if (addrs.length) {
    const a = validateResolvedAddresses(addrs, {
      pinAddress: context.initialPinnedAddress || null
    });
    if (!a.ok) {
      findings.push(...a.findings);
      if (context.initialPinnedAddress && addrs.indexOf(context.initialPinnedAddress) < 0) {
        findings.push({
          code: 'dns_rebinding_blocked',
          path: 'redirect.resolvedAddresses',
          detail: 'address_changed'
        });
      }
      return freezeDeep({ ok: false, findings, strippedHeaders: [], simulationOnly: true });
    }
  }
  const fromHttps = String(context.fromScheme || '').toLowerCase() === 'https';
  if (fromHttps && urlRes.scheme === 'http' && context.allowHttpsDowngrade !== true) {
    findings.push({
      code: 'unsafe_redirect',
      path: 'redirect.scheme',
      detail: 'https_to_http_downgrade'
    });
    return freezeDeep({ ok: false, findings, strippedHeaders: [], simulationOnly: true });
  }
  const strippedHeaders = ['authorization', 'cookie', 'cookie2', 'proxy-authorization'];
  return freezeDeep({
    ok: true,
    findings,
    strippedHeaders,
    normalizedUrl: urlRes.normalized,
    simulationOnly: true
  });
}

export function createSafeRequestPlan(input) {
  const o = asObject(input) || {};
  const urlRes = normalizeAndValidateOutboundUrl(o.url, o.policy || {});
  if (!urlRes.ok) {
    return freezeDeep({
      ok: false,
      findings: urlRes.findings,
      plan: null,
      simulationOnly: true,
      realDns: false,
      realNetwork: false,
      realTls: false
    });
  }
  const addrs = Array.isArray(o.resolvedAddresses) ? o.resolvedAddresses.slice() : [];
  const addrRes = addrs.length
    ? validateResolvedAddresses(addrs)
    : { ok: true, findings: [], simulationOnly: true };
  if (!addrRes.ok) {
    return freezeDeep({
      ok: false,
      findings: addrRes.findings,
      plan: null,
      simulationOnly: true,
      realDns: false,
      realNetwork: false,
      realTls: false
    });
  }
  if (o.tls && o.tls.tlsVerified === false) {
    return freezeDeep({
      ok: false,
      findings: [{ code: 'tls_failure', path: 'tls.tlsVerified', detail: 'not_verified' }],
      plan: null,
      simulationOnly: true,
      realDns: false,
      realNetwork: false,
      realTls: false
    });
  }
  if (o.tls && (o.tls.certificateValid === false || o.tls.hostnameMatched === false)) {
    return freezeDeep({
      ok: false,
      findings: [{ code: 'tls_failure', path: 'tls', detail: 'certificate_or_hostname' }],
      plan: null,
      simulationOnly: true,
      realDns: false,
      realNetwork: false,
      realTls: false
    });
  }
  return freezeDeep({
    ok: true,
    findings: [],
    plan: {
      url: urlRes.normalized,
      host: urlRes.host,
      scheme: urlRes.scheme,
      resolvedAddresses: addrs,
      pinnedAddress: addrs[0] || null,
      method: 'GET',
      headers: { 'user-agent': 'CRUVIT-ResearchProof/0.1 (secret-free; no-credentials)' },
      timeoutMs: Number(o.timeoutMs || 15000)
    },
    simulationOnly: true,
    realDns: false,
    realNetwork: false,
    realTls: false,
    disclaimer:
      'No live DNS lookup, socket binding, or real DNS-rebinding protection was executed.'
  });
}

export function redactSensitiveValue(value) {
  if (typeof value === 'string') {
    if (SECRET_VALUE_RE.test(value)) return '[REDACTED]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (!asObject(value)) return value;
  const out = {};
  Object.keys(value).forEach((k) => {
    if (SECRET_KEY_RE.test(k)) out[k] = '[REDACTED]';
    else out[k] = redactSensitiveValue(value[k]);
  });
  return out;
}

export function redactStructuredLog(value) {
  return freezeDeep(redactSensitiveValue(value));
}

export function validateTransportBudget(usage, budget) {
  const u = asObject(usage) || {};
  const b = asObject(budget) || {};
  const findings = [];
  const bytes = Number(u.bytesRetrieved || 0);
  const maxBytes = Number(b.totalBytes || TRANSPORT_LIMITS.totalBytes);
  if (bytes > maxBytes) {
    findings.push({ code: 'cost_exceeded', path: 'usage.bytesRetrieved', detail: 'total_bytes' });
  }
  const projected = Number(u.projectedCostUsd || 0);
  const pilot = Number(b.pilotCostUsd || TRANSPORT_LIMITS.pilotCostUsd);
  const absolute = Number(b.absoluteCostUsd || TRANSPORT_LIMITS.absoluteCostUsd);
  if (projected > pilot || projected > absolute) {
    findings.push({
      code: 'cost_exceeded',
      path: 'usage.projectedCostUsd',
      detail: 'projected_before_call'
    });
  }
  if (u.usageMissing === true || u.usageInconsistent === true) {
    findings.push({
      code: 'cost_exceeded',
      path: 'usage',
      detail: u.usageMissing ? 'missing_usage' : 'inconsistent_usage'
    });
  }
  if (Number(u.retries || 0) > TRANSPORT_LIMITS.retries) {
    findings.push({ code: 'cost_exceeded', path: 'usage.retries', detail: 'retry_cap' });
  }
  const paid = Number(u.logicalPaidCalls || 0);
  const maxPaid = Number(b.maxLogicalPaidCalls || 0);
  if (maxPaid >= 0 && paid > maxPaid) {
    findings.push({
      code: 'cost_exceeded',
      path: 'usage.logicalPaidCalls',
      detail: 'paid_call_cap'
    });
  }
  return freezeDeep({
    ok: findings.length === 0,
    findings,
    actualProofCostUsd: 0
  });
}

export function createCancellationController() {
  const ac = new AbortController();
  // Do not deep-freeze AbortSignal — Node freezes kAborted and abort() must mutate it.
  return Object.freeze({
    abort: () => ac.abort(),
    get cancelled() {
      return ac.signal.aborted;
    },
    get aborted() {
      return ac.signal.aborted;
    },
    get signal() {
      return ac.signal;
    }
  });
}

export function createRunGuard(options = {}) {
  const opts = asObject(options) || {};
  const state = {
    activeRuns: 0,
    activeFetches: 0,
    hostCounts: Object.create(null),
    inFlightUrls: Object.create(null),
    usedNonces: Object.create(null),
    lastRunAt: 0,
    dailyCost: 0,
    monthlyCost: 0
  };
  const cooldownMs = Number(opts.cooldownMs || 0);
  const dailyCap = Number(opts.dailyCostUsd || TRANSPORT_LIMITS.pilotCostUsd);
  const monthlyCap = Number(opts.monthlyCostUsd || TRANSPORT_LIMITS.absoluteCostUsd);

  function beginRun(nonce) {
    const n = trim(nonce);
    if (!n) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'idempotency_replay_blocked', path: 'nonce', detail: 'missing' }]
      });
    }
    if (state.usedNonces[n]) {
      return freezeDeep({
        ok: false,
        findings: [
          { code: 'idempotency_replay_blocked', path: 'nonce', detail: 'duplicate_nonce' }
        ]
      });
    }
    if (state.activeRuns >= TRANSPORT_LIMITS.concurrentRuns) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'concurrency_exceeded', path: 'runs', detail: 'max_1' }]
      });
    }
    if (cooldownMs > 0 && state.lastRunAt && Date.now() - state.lastRunAt < cooldownMs) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'concurrency_exceeded', path: 'cooldown', detail: 'active' }]
      });
    }
    state.usedNonces[n] = true;
    state.activeRuns += 1;
    return freezeDeep({ ok: true, findings: [], nonce: n });
  }

  function endRun() {
    state.activeRuns = Math.max(0, state.activeRuns - 1);
    state.lastRunAt = Date.now();
  }

  function beginFetch(host, url) {
    const h = trim(host) || 'unknown';
    const u = trim(url);
    if (state.activeFetches >= TRANSPORT_LIMITS.concurrentFetches) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'concurrency_exceeded', path: 'fetches', detail: 'max_2' }]
      });
    }
    if ((state.hostCounts[h] || 0) >= TRANSPORT_LIMITS.requestsPerHost) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'concurrency_exceeded', path: 'host', detail: h }]
      });
    }
    if (u && state.inFlightUrls[u]) {
      return freezeDeep({
        ok: false,
        findings: [
          { code: 'concurrency_exceeded', path: 'url', detail: 'duplicate_in_flight' }
        ]
      });
    }
    state.activeFetches += 1;
    state.hostCounts[h] = (state.hostCounts[h] || 0) + 1;
    if (u) state.inFlightUrls[u] = true;
    return freezeDeep({ ok: true, findings: [] });
  }

  function endFetch(host, url) {
    const h = trim(host) || 'unknown';
    state.activeFetches = Math.max(0, state.activeFetches - 1);
    state.hostCounts[h] = Math.max(0, (state.hostCounts[h] || 0) - 1);
    if (url) delete state.inFlightUrls[trim(url)];
  }

  function simulateCost(amount) {
    const a = Number(amount || 0);
    if (state.dailyCost + a > dailyCap || state.monthlyCost + a > monthlyCap) {
      return freezeDeep({
        ok: false,
        findings: [{ code: 'cost_exceeded', path: 'costGuard', detail: 'daily_or_monthly' }]
      });
    }
    state.dailyCost += a;
    state.monthlyCost += a;
    return freezeDeep({ ok: true, findings: [], actualProofCostUsd: 0 });
  }

  return {
    beginRun,
    endRun,
    beginFetch,
    endFetch,
    simulateCost,
    snapshot() {
      return freezeDeep({
        activeRuns: state.activeRuns,
        activeFetches: state.activeFetches,
        hostCounts: { ...state.hostCounts },
        inFlightUrlCount: Object.keys(state.inFlightUrls).length,
        usedNonceCount: Object.keys(state.usedNonces).length,
        dailyCost: state.dailyCost,
        monthlyCost: state.monthlyCost
      });
    }
  };
}

export function validateDecompressedSize(input) {
  const o = asObject(input) || {};
  const findings = [];
  const compressed = Number(o.compressedBytes || 0);
  const decompressed = Number(o.decompressedBytes || 0);
  if (compressed > TRANSPORT_LIMITS.bytesPerResponse) {
    findings.push({
      code: 'oversized_or_decompression_response',
      path: 'compressedBytes',
      detail: 'max_' + TRANSPORT_LIMITS.bytesPerResponse
    });
  }
  if (decompressed > TRANSPORT_LIMITS.bytesPerResponse) {
    findings.push({
      code: 'oversized_or_decompression_response',
      path: 'decompressedBytes',
      detail: 'max_' + TRANSPORT_LIMITS.bytesPerResponse
    });
  }
  if (
    compressed > 0 &&
    decompressed / compressed > TRANSPORT_LIMITS.maxCompressionRatio
  ) {
    findings.push({
      code: 'oversized_or_decompression_response',
      path: 'compressionRatio',
      detail: 'excessive'
    });
  }
  let text = typeof o.normalizedText === 'string' ? o.normalizedText : '';
  let truncated = !!o.truncationState;
  if (text.length > TRANSPORT_LIMITS.normalizedSourceTextChars) {
    text = text.slice(0, TRANSPORT_LIMITS.normalizedSourceTextChars);
    truncated = true;
    findings.push({
      code: 'content_truncated',
      path: 'normalizedText',
      detail: 'max_' + TRANSPORT_LIMITS.normalizedSourceTextChars,
      severity: 'informational'
    });
  }
  return freezeDeep({
    ok: !findings.some((f) => f.code === 'oversized_or_decompression_response'),
    findings,
    normalizedText: text,
    truncationState: truncated
  });
}

export function normalizeTransportError(error) {
  const o = asObject(error) || { code: 'adapter_failed', message: String(error || 'unknown') };
  return freezeDeep(
    redactStructuredLog({
      code: trim(o.code) || 'adapter_failed',
      path: trim(o.path) || null,
      detail: trim(o.detail) || trim(o.message) || 'error',
      simulationOnly: true
    })
  );
}

export function evaluateTlsMetadata(tls) {
  const t = asObject(tls) || {};
  if (t.tlsVerified === false || t.certificateValid === false || t.hostnameMatched === false) {
    return freezeDeep({
      ok: false,
      findings: [{ code: 'tls_failure', path: 'tls', detail: 'simulated_tls_failure' }],
      simulationOnly: true
    });
  }
  return freezeDeep({ ok: true, findings: [], simulationOnly: true });
}

export { freezeDeep, asObject, trim };
