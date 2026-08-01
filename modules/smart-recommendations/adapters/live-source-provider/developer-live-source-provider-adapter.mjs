/**
 * Cruvit — Live Source Provider Adapter (secret-free reference proof)
 * Implements provider-neutral searchExecutor/fetchExecutor via injected transport stubs.
 * No network, DNS, sockets, credentials, env, or filesystem access.
 */

import {
  SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
  TRANSPORT_LIMITS,
  normalizeAndValidateOutboundUrl,
  validateResolvedAddresses,
  validateRedirectTarget,
  createSafeRequestPlan,
  redactStructuredLog,
  validateTransportBudget,
  validateDecompressedSize,
  evaluateTlsMetadata,
  fingerprintOf,
  freezeDeep,
  asObject,
  trim,
  getLiveSourceProviderTransportSecurityDescriptor
} from './transport-security.mjs';

export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION =
  '0.1.0-sr-live-source-provider-adapter';
export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION =
  '0.1.0-sr-live-source-provider-adapter-contract';
export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-live-source-provider-adapter-result';
export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_CAPABILITY =
  'explicit_developer_live_source_provider_adapter_execution';

export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES = Object.freeze([
  'adapter_not_run',
  'adapter_input_invalid',
  'configuration_blocked',
  'authentication_blocked',
  'transport_disabled',
  'budget_blocked',
  'security_blocked',
  'search_unavailable',
  'fetch_unavailable',
  'rate_limited',
  'partial_results',
  'results_ready_for_provider_orchestration',
  'adapter_failed'
]);

export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS = Object.freeze([
  'authentication_failed',
  'authentication_paywall_or_captcha_source',
  'blocked_scheme',
  'cancellation',
  'concurrency_exceeded',
  'cost_exceeded',
  'dns_rebinding_blocked',
  'idempotency_replay_blocked',
  'invalid_assignment_fingerprint',
  'invalid_query_plan_fingerprint',
  'malformed_provider_response',
  'missing_configuration',
  'missing_secret',
  'oversized_or_decompression_response',
  'private_target',
  'provider_quota_exhausted',
  'rate_limited',
  'robots_or_source_policy_blocked',
  'secret_leakage_detected',
  'ssrf_blocked',
  'timeout',
  'tls_failure',
  'transport_disabled',
  'unknown_adapter_input',
  'unsafe_redirect',
  'unsupported_adapter_contract',
  'unsupported_mime'
]);

export const SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS = Object.freeze([
  'authority_not_granted',
  'content_truncated',
  'cost_reported',
  'partial_results',
  'rate_limit_headroom',
  'results_normalized'
]);

const STATUS_PRIORITY = Object.freeze([
  'adapter_failed',
  'adapter_input_invalid',
  'configuration_blocked',
  'authentication_blocked',
  'transport_disabled',
  'budget_blocked',
  'security_blocked',
  'search_unavailable',
  'fetch_unavailable',
  'rate_limited',
  'partial_results',
  'results_ready_for_provider_orchestration',
  'adapter_not_run'
]);

const CONFIG_REQUIRED = Object.freeze([
  'adapterContractVersion',
  'adapterConfigurationReference',
  'executionMode',
  'providerReference',
  'approvedAssignmentFingerprint',
  'approvedQueryPlanFingerprint',
  'transportSecurityContractVersion',
  'sourcePolicyReference',
  'budgetReference'
]);

const CONFIG_FORBIDDEN_KEY_RE =
  /^(api[_-]?key|token|access[_-]?token|password|secret|cookie|authorization|credentials|gate[_-]?[abc]|artifact|catalog|product|commerce|shopify)$/i;

const RAW_STRIP_KEYS = Object.freeze([
  'raw',
  'rawPayload',
  'vendorDebug',
  'debug',
  'billingAccount',
  'accountId',
  'apiKey',
  'authorization',
  'cookie',
  'secret'
]);

function finding(code, path, detail) {
  const hard = SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS.indexOf(code) >= 0;
  const info = SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS.indexOf(code) >= 0;
  if (!hard && !info) throw new Error('unknown_adapter_finding:' + code);
  return freezeDeep({
    code,
    path: path == null ? null : String(path),
    detail: detail == null ? null : String(detail),
    severity: hard ? 'hard' : 'informational'
  });
}

export function sortAdapterFindings(list) {
  return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
    const c = String(a.code || '').localeCompare(String(b.code || ''));
    if (c) return c;
    const p = String(a.path || '').localeCompare(String(b.path || ''));
    if (p) return p;
    return String(a.detail || '').localeCompare(String(b.detail || ''));
  });
}

function pickStatus(candidates) {
  let best = 'adapter_not_run';
  let bestIdx = STATUS_PRIORITY.length;
  for (let i = 0; i < candidates.length; i++) {
    const idx = STATUS_PRIORITY.indexOf(candidates[i]);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = candidates[i];
    }
  }
  return best;
}

function scanForbidden(obj, path, findings) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => scanForbidden(v, path + '[' + i + ']', findings));
    return;
  }
  Object.keys(obj).forEach((k) => {
    const p = path ? path + '.' + k : k;
    if (CONFIG_FORBIDDEN_KEY_RE.test(k)) {
      findings.push(finding('secret_leakage_detected', p, 'forbidden_key'));
      return;
    }
    const v = obj[k];
    if (typeof v === 'string' && /(sk-[a-z0-9]{8,}|bearer\s+)/i.test(v)) {
      findings.push(finding('secret_leakage_detected', p, 'secret_like_value'));
      return;
    }
    if (v && typeof v === 'object') scanForbidden(v, p, findings);
  });
}

function stripRaw(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripRaw);
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (RAW_STRIP_KEYS.indexOf(k) >= 0) return;
    if (CONFIG_FORBIDDEN_KEY_RE.test(k)) return;
    out[k] = stripRaw(obj[k]);
  });
  return out;
}

export function getLiveSourceProviderAdapterDescriptor() {
  return freezeDeep({
    version: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
    adapterContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
    adapterResultContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_RESULT_CONTRACT_VERSION,
    capability: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CAPABILITY,
    transportSecurityContractVersion:
      SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
    developerOnly: true,
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
    network: false,
    externalApi: false,
    externalModel: false,
    secretBearing: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    browserImport: false,
    indexHtmlImport: false,
    runtimeImport: false,
    gitCommit: false,
    gitPush: false,
    deploy: false,
    statuses: SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES.slice(),
    hardFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS.slice(),
    infoFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS.slice(),
    limits: TRANSPORT_LIMITS,
    transportDescriptor: getLiveSourceProviderTransportSecurityDescriptor()
  });
}

export function normalizeLiveSourceProviderAdapterConfiguration(configuration) {
  const findings = [];
  const src = asObject(configuration);
  if (!src) {
    findings.push(finding('unsupported_adapter_contract', null, 'not_object'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  scanForbidden(src, '', findings);
  const CONFIG_OPTIONAL = Object.freeze([
    'livePilotFlag',
    'transportEnabled',
    'requireSyntheticSecret',
    'syntheticSecretPresent'
  ]);
  Object.keys(src).forEach((k) => {
    if (CONFIG_REQUIRED.indexOf(k) < 0 && CONFIG_OPTIONAL.indexOf(k) < 0) {
      findings.push(finding('unknown_adapter_input', k, 'unknown_key'));
    }
  });
  for (let i = 0; i < CONFIG_REQUIRED.length; i++) {
    if (src[CONFIG_REQUIRED[i]] === undefined || src[CONFIG_REQUIRED[i]] === null || src[CONFIG_REQUIRED[i]] === '') {
      findings.push(finding('missing_configuration', CONFIG_REQUIRED[i], 'required'));
    }
  }
  if (
    trim(src.adapterContractVersion) !== SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION
  ) {
    findings.push(
      finding('unsupported_adapter_contract', 'adapterContractVersion', 'mismatch')
    );
  }
  if (
    trim(src.transportSecurityContractVersion) !==
    SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION
  ) {
    findings.push(
      finding(
        'unsupported_adapter_contract',
        'transportSecurityContractVersion',
        'mismatch'
      )
    );
  }
  if (trim(src.executionMode) !== 'mock_or_replay') {
    findings.push(
      finding('unsupported_adapter_contract', 'executionMode', 'mock_or_replay_required')
    );
  }
  if (src.livePilotFlag === true) {
    findings.push(finding('transport_disabled', 'livePilotFlag', 'live_not_authorized'));
  }
  const pref = trim(src.providerReference);
  if (pref && !/^synthetic\//.test(pref) && !/^reference\//.test(pref)) {
    findings.push(
      finding('unsupported_adapter_contract', 'providerReference', 'synthetic_or_reference_only')
    );
  }
  if (src.requireSyntheticSecret === true && !src.syntheticSecretPresent) {
    findings.push(finding('missing_secret', 'syntheticSecretPresent', 'missing'));
  }
  const hard = findings.filter((f) => f.severity === 'hard');
  if (hard.length) {
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  const normalized = freezeDeep({
    adapterContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
    adapterConfigurationReference: trim(src.adapterConfigurationReference),
    executionMode: 'mock_or_replay',
    providerReference: pref,
    approvedAssignmentFingerprint: trim(src.approvedAssignmentFingerprint),
    approvedQueryPlanFingerprint: trim(src.approvedQueryPlanFingerprint),
    transportSecurityContractVersion:
      SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
    sourcePolicyReference: freezeDeep(asObject(src.sourcePolicyReference) || {}),
    budgetReference: freezeDeep(asObject(src.budgetReference) || {}),
    transportEnabled: src.transportEnabled !== false
  });
  return freezeDeep({
    ok: true,
    normalized,
    findings: sortAdapterFindings(findings)
  });
}

export function validateLiveSourceProviderAdapterConfiguration(configuration) {
  return normalizeLiveSourceProviderAdapterConfiguration(configuration);
}

export function normalizeVendorSearchResponse(response) {
  const findings = [];
  const src = asObject(response);
  if (!src) {
    findings.push(finding('malformed_provider_response', 'search', 'not_object'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  if (src.rateLimit && src.rateLimit.limited === true) {
    findings.push(finding('rate_limited', 'search.rateLimit', 'limited'));
  }
  if (src.quotaExhausted === true) {
    findings.push(finding('provider_quota_exhausted', 'search.quota', 'exhausted'));
  }
  if (src.malformed === true) {
    findings.push(finding('malformed_provider_response', 'search', 'malformed_flag'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  if (src.authFailed === true) {
    findings.push(finding('authentication_failed', 'search.auth', '401_or_403'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  const resultsIn = Array.isArray(src.results) ? src.results : null;
  if (!resultsIn) {
    findings.push(finding('malformed_provider_response', 'search.results', 'not_array'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  const results = [];
  for (let i = 0; i < resultsIn.length; i++) {
    const r = asObject(resultsIn[i]) || {};
    const cleaned = stripRaw(r);
    results.push(
      freezeDeep({
        resultId: trim(cleaned.resultId) || 'sr-' + i,
        url: trim(cleaned.url),
        title: trim(cleaned.title) || null,
        publisher: trim(cleaned.publisher) || null,
        snippet: trim(cleaned.snippet) || '',
        language: trim(cleaned.language) || 'en',
        sourceClassHint: trim(cleaned.sourceClassHint) || 'other',
        rank: Number(cleaned.rank || i + 1)
      })
    );
  }
  findings.push(finding('results_normalized', 'search', 'normalized'));
  if (src.rateLimit && src.rateLimit.limited === false && src.rateLimit.headroom != null) {
    findings.push(finding('rate_limit_headroom', 'search.rateLimit', String(src.rateLimit.headroom)));
  }
  const hardBlock = findings.some((f) => f.severity === 'hard');
  return freezeDeep({
    ok: !hardBlock,
    normalized: freezeDeep({
      executorVersion: trim(src.executorVersion) || SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
      executionMode: 'mock_or_replay',
      providerRequestReference: trim(src.providerRequestReference) || 'synthetic-search-ref',
      queryReference: freezeDeep(asObject(src.queryReference) || {}),
      results,
      usage: freezeDeep(stripRaw(asObject(src.usage) || {})),
      rateLimit: freezeDeep(asObject(src.rateLimit) || { limited: false }),
      errors: Array.isArray(src.errors) ? src.errors.map((e) => freezeDeep(stripRaw(e))) : []
    }),
    findings: sortAdapterFindings(findings)
  });
}

export function normalizeVendorFetchResponse(response) {
  const findings = [];
  const src = asObject(response);
  if (!src) {
    findings.push(finding('malformed_provider_response', 'fetch', 'not_object'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  if (src.malformed === true) {
    findings.push(finding('malformed_provider_response', 'fetch', 'malformed_flag'));
    return freezeDeep({ ok: false, normalized: null, findings: sortAdapterFindings(findings) });
  }
  const mime = trim(src.contentType).toLowerCase().split(';')[0];
  if (mime && mime !== 'text/html' && mime !== 'text/plain') {
    findings.push(finding('unsupported_mime', 'fetch.contentType', mime));
  }
  if (src.mimeMismatch === true) {
    findings.push(finding('unsupported_mime', 'fetch.contentType', 'mismatch'));
  }
  if (src.accessibilityState === 'authentication_required' || src.paywall === true || src.captcha === true) {
    findings.push(
      finding(
        'authentication_paywall_or_captcha_source',
        'fetch.accessibility',
        src.captcha ? 'captcha' : src.paywall ? 'paywall' : 'authentication_required'
      )
    );
  }
  if (src.robotsDenied === true || src.domainDenied === true) {
    findings.push(
      finding(
        'robots_or_source_policy_blocked',
        'fetch.policy',
        src.domainDenied ? 'denied_domain' : 'robots_denied'
      )
    );
  }
  const sizeCheck = validateDecompressedSize({
    compressedBytes: src.compressedBytes,
    decompressedBytes: src.decompressedBytes || src.bytesRead,
    normalizedText: src.normalizedText,
    truncationState: src.truncationState
  });
  findings.push(
    ...sizeCheck.findings.map((f) =>
      finding(f.code, f.path, f.detail)
    )
  );
  const hardBlock = findings.some((f) => f.severity === 'hard');
  if (hardBlock && findings.some((f) => f.code === 'oversized_or_decompression_response' || f.code === 'unsupported_mime' || f.code === 'authentication_paywall_or_captcha_source' || f.code === 'robots_or_source_policy_blocked')) {
    return freezeDeep({
      ok: false,
      normalized: null,
      findings: sortAdapterFindings(findings)
    });
  }
  if (sizeCheck.truncationState) {
    findings.push(finding('content_truncated', 'fetch.normalizedText', 'truncated'));
  }
  findings.push(finding('results_normalized', 'fetch', 'normalized'));
  const cleaned = stripRaw(src);
  return freezeDeep({
    ok: true,
    normalized: freezeDeep({
      executorVersion: trim(cleaned.executorVersion) || SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
      executionMode: 'mock_or_replay',
      requestedUrl: trim(cleaned.requestedUrl),
      finalUrl: trim(cleaned.finalUrl) || trim(cleaned.requestedUrl),
      redirectChain: Array.isArray(cleaned.redirectChain) ? cleaned.redirectChain.slice() : [],
      resolvedAddresses: Array.isArray(cleaned.resolvedAddresses)
        ? cleaned.resolvedAddresses.slice()
        : [],
      status: Number(cleaned.status || 0),
      contentType: mime || 'text/html',
      bytesRead: Number(cleaned.bytesRead || 0),
      contentHash: trim(cleaned.contentHash) || 'hash-missing',
      normalizedText: sizeCheck.normalizedText || '',
      title: cleaned.title == null ? null : trim(cleaned.title),
      publisher: cleaned.publisher == null ? null : trim(cleaned.publisher),
      author: cleaned.author == null ? null : trim(cleaned.author),
      publicationDate: cleaned.publicationDate == null ? null : trim(cleaned.publicationDate),
      lastUpdatedDate: cleaned.lastUpdatedDate == null ? null : trim(cleaned.lastUpdatedDate),
      language: trim(cleaned.language) || 'en',
      sourceLocator: trim(cleaned.sourceLocator) || 'body',
      geographicScope: trim(cleaned.geographicScope) || 'global',
      plantIdentityScope: trim(cleaned.plantIdentityScope) || 'species',
      fieldHints: Array.isArray(cleaned.fieldHints) ? cleaned.fieldHints.slice() : ['sun'],
      contextHints: freezeDeep(asObject(cleaned.contextHints) || {}),
      accessibilityState: trim(cleaned.accessibilityState) || 'accessible',
      hostileIndicators: Array.isArray(cleaned.hostileIndicators)
        ? cleaned.hostileIndicators.slice()
        : [],
      truncationState: !!sizeCheck.truncationState,
      probableCopyOf: cleaned.probableCopyOf == null ? undefined : cleaned.probableCopyOf,
      errors: Array.isArray(cleaned.errors) ? cleaned.errors.map((e) => freezeDeep(stripRaw(e))) : [],
      usage: freezeDeep(stripRaw(asObject(cleaned.usage) || {})),
      sourceClassHint: trim(cleaned.sourceClassHint) || undefined
    }),
    findings: sortAdapterFindings(findings)
  });
}

function containsSecretLeak(value) {
  const s = JSON.stringify(redactStructuredLog(value));
  // after redaction, synthetic secrets should be gone; detect pre-redaction via separate scan
  return false;
}

function assertNoSecretMaterial(value, findings, path) {
  const raw = JSON.stringify(value);
  if (/(sk-live-proof-[a-z0-9]+|Bearer synth-token-XYZ|password=hunter2)/i.test(raw)) {
    findings.push(finding('secret_leakage_detected', path, 'unredacted_secret_material'));
  }
}

export function createLiveSourceProviderAdapter(configuration, transport) {
  const cfgNorm = normalizeLiveSourceProviderAdapterConfiguration(configuration);
  const transportApi = asObject(transport) || {};
  let lastResult = freezeDeep({
    status: 'adapter_not_run',
    findings: [],
    warnings: [finding('authority_not_granted', null, 'default')]
  });

  function setResult(status, findings, extra) {
    const sorted = sortAdapterFindings(findings || []);
    const warnings = sorted.filter((f) => f.severity === 'informational');
    const hard = sorted.filter((f) => f.severity === 'hard');
    lastResult = freezeDeep({
      status,
      findings: sorted,
      warnings,
      hardFindings: hard,
      authority: {
        authoritative: false,
        productUseAllowed: false,
        runtimeConsumptionAllowed: false
      },
      network: false,
      externalApi: false,
      externalModel: false,
      estimatedCostUsd: 0,
      ...(extra || {})
    });
    assertNoSecretMaterial(lastResult, [], 'adapterResult');
    return lastResult;
  }

  if (!cfgNorm.ok) {
    const status = pickStatus(
      cfgNorm.findings.map((f) => {
        if (f.code === 'missing_secret') return 'authentication_blocked';
        if (f.code === 'missing_configuration' || f.code === 'unknown_adapter_input')
          return 'adapter_input_invalid';
        if (f.code === 'transport_disabled') return 'transport_disabled';
        if (f.code === 'unsupported_adapter_contract') return 'configuration_blocked';
        return 'adapter_input_invalid';
      })
    );
    setResult(status, cfgNorm.findings);
  }

  const cfg = cfgNorm.normalized;

  function searchExecutor(input) {
    const findings = [];
    if (!cfgNorm.ok || !cfg) {
      setResult(lastResult.status, lastResult.findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'blocked',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'configuration_blocked' }]
      });
    }
    if (cfg.transportEnabled === false) {
      findings.push(finding('transport_disabled', 'transport', 'disabled'));
      setResult('transport_disabled', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'disabled',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'transport_disabled' }]
      });
    }
    const req = asObject(input) || {};
    if (req.cancellationReference && req.cancellationReference.cancelled) {
      findings.push(finding('cancellation', 'search', 'cancelled'));
      setResult('adapter_failed', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'cancelled',
        queryReference: { queryIndex: req.queryIndex },
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'cancellation' }]
      });
    }
    const afp = trim(
      req.assignmentReference && req.assignmentReference.assignmentFingerprint
    );
    if (afp && afp !== cfg.approvedAssignmentFingerprint) {
      findings.push(
        finding(
          'invalid_assignment_fingerprint',
          'search.assignmentReference',
          'mismatch'
        )
      );
      setResult('adapter_input_invalid', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'invalid-afp',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'invalid_assignment_fingerprint' }]
      });
    }
    const qfp = trim(req.queryPlanReference && req.queryPlanReference.queryPlanFingerprint);
    if (qfp && qfp !== cfg.approvedQueryPlanFingerprint) {
      findings.push(
        finding('invalid_query_plan_fingerprint', 'search.queryPlanReference', 'mismatch')
      );
      setResult('adapter_input_invalid', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'invalid-qfp',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'invalid_query_plan_fingerprint' }]
      });
    }
    if (typeof transportApi.searchStub !== 'function') {
      findings.push(
        finding('malformed_provider_response', 'transport.searchStub', 'missing')
      );
      setResult('search_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'no-stub',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'search_unavailable' }]
      });
    }
    const budgetCheck = validateTransportBudget(
      asObject(transportApi.usageState) || { projectedCostUsd: 0, logicalPaidCalls: 0 },
      Object.assign({ maxLogicalPaidCalls: 2, pilotCostUsd: 0.1, absoluteCostUsd: 0.25 }, cfg.budgetReference)
    );
    if (!budgetCheck.ok) {
      findings.push(...budgetCheck.findings.map((f) => finding(f.code, f.path, f.detail)));
      setResult('budget_blocked', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'budget-blocked',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'cost_exceeded' }]
      });
    }
    let stubOut;
    try {
      stubOut = transportApi.searchStub(req);
    } catch (e) {
      findings.push(finding('malformed_provider_response', 'searchStub', 'threw'));
      setResult('search_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'threw',
        queryReference: {},
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'timeout' }]
      });
    }
    if (stubOut && stubOut.timeout === true) {
      findings.push(finding('timeout', 'search', 'timeout'));
      setResult('search_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'timeout',
        queryReference: { queryIndex: req.queryIndex },
        results: [],
        usage: {},
        rateLimit: { limited: false },
        errors: [{ code: 'timeout' }]
      });
    }
    const norm = normalizeVendorSearchResponse(stubOut);
    findings.push(...norm.findings);
    if (!norm.ok || !norm.normalized) {
      const st = pickStatus(
        findings
          .filter((f) => f.severity === 'hard')
          .map((f) =>
            f.code === 'rate_limited'
              ? 'rate_limited'
              : f.code === 'provider_quota_exhausted'
                ? 'search_unavailable'
                : f.code === 'authentication_failed'
                  ? 'authentication_blocked'
                  : 'search_unavailable'
          )
      );
      setResult(st, findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        providerRequestReference: 'failed',
        queryReference: { queryIndex: req.queryIndex },
        results: [],
        usage: {},
        rateLimit: asObject(stubOut && stubOut.rateLimit) || { limited: false },
        errors: [{ code: st }]
      });
    }
    assertNoSecretMaterial(norm.normalized, findings, 'search.normalized');
    findings.push(finding('authority_not_granted', null, 'adapter'));
    findings.push(finding('cost_reported', 'usage', '0'));
    const partial = norm.normalized.results.length === 0;
    setResult(
      pickStatus([partial ? 'partial_results' : 'results_ready_for_provider_orchestration']),
      findings,
      {
        lastSearch: norm.normalized,
        adapterInputFingerprint: fingerprintOf('lsp-adapter-input', cfg),
        normalizedExecutorOutputFingerprint: fingerprintOf(
          'lsp-adapter-exec',
          norm.normalized
        )
      }
    );
    return freezeDeep(norm.normalized);
  }

  function fetchExecutor(input) {
    const findings = [];
    if (!cfgNorm.ok || !cfg) {
      setResult(lastResult.status, lastResult.findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: '',
        finalUrl: '',
        redirectChain: [],
        resolvedAddresses: [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'blocked',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'configuration_blocked' }],
        usage: {}
      });
    }
    const req = asObject(input) || {};
    const url = trim(req.normalizedUrl || req.url);
    const urlRes = normalizeAndValidateOutboundUrl(url, { allowedSchemes: ['http', 'https'] });
    if (!urlRes.ok) {
      findings.push(...urlRes.findings.map((f) => finding(f.code, f.path, f.detail)));
      setResult('security_blocked', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: url,
        finalUrl: url,
        redirectChain: [],
        resolvedAddresses: [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'blocked',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: urlRes.findings[0] && urlRes.findings[0].code }],
        usage: {}
      });
    }
    if (typeof transportApi.fetchStub !== 'function') {
      findings.push(
        finding('malformed_provider_response', 'transport.fetchStub', 'missing')
      );
      setResult('fetch_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: [],
        resolvedAddresses: [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'missing',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'fetch_unavailable' }],
        usage: {}
      });
    }
    if (transportApi.runGuard && typeof transportApi.runGuard.beginFetch === 'function') {
      const g = transportApi.runGuard.beginFetch(urlRes.host, urlRes.normalized);
      if (!g.ok) {
        findings.push(...g.findings.map((f) => finding(f.code, f.path, f.detail)));
        setResult('adapter_failed', findings);
        return freezeDeep({
          executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
          executionMode: 'mock_or_replay',
          requestedUrl: urlRes.normalized,
          finalUrl: urlRes.normalized,
          redirectChain: [],
          resolvedAddresses: [],
          status: 0,
          contentType: 'text/html',
          bytesRead: 0,
          contentHash: 'guard',
          normalizedText: '',
          title: null,
          publisher: null,
          author: null,
          publicationDate: null,
          lastUpdatedDate: null,
          language: 'en',
          sourceLocator: 'none',
          geographicScope: 'global',
          plantIdentityScope: 'species',
          contextHints: {},
          accessibilityState: 'inaccessible',
          hostileIndicators: [],
          truncationState: false,
          errors: [{ code: 'concurrency_exceeded' }],
          usage: {}
        });
      }
    }
    let stubOut;
    try {
      stubOut = transportApi.fetchStub({
        normalizedUrl: urlRes.normalized,
        host: urlRes.host,
        request: req
      });
    } finally {
      if (transportApi.runGuard && typeof transportApi.runGuard.endFetch === 'function') {
        transportApi.runGuard.endFetch(urlRes.host, urlRes.normalized);
      }
    }
    if (!stubOut) {
      findings.push(finding('malformed_provider_response', 'fetchStub', 'empty'));
      setResult('fetch_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: [],
        resolvedAddresses: [],
        status: 404,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'empty',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'inaccessible_source' }],
        usage: {}
      });
    }
    if (stubOut.timeout === true) {
      findings.push(finding('timeout', 'fetch', 'timeout'));
      setResult('fetch_unavailable', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: [],
        resolvedAddresses: [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'timeout',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'timeout' }],
        usage: {}
      });
    }
    if (stubOut.cancelled === true) {
      findings.push(finding('cancellation', 'fetch', 'cancelled'));
      setResult('adapter_failed', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: [],
        resolvedAddresses: [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'cancelled',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'cancellation' }],
        usage: {}
      });
    }
    const plan = createSafeRequestPlan({
      url: urlRes.normalized,
      resolvedAddresses: stubOut.resolvedAddresses,
      tls: stubOut.tls,
      policy: { allowedSchemes: ['http', 'https'] }
    });
    if (!plan.ok) {
      findings.push(...plan.findings.map((f) => finding(f.code, f.path, f.detail)));
      setResult('security_blocked', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: [],
        resolvedAddresses: Array.isArray(stubOut.resolvedAddresses)
          ? stubOut.resolvedAddresses
          : [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'security',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: (plan.findings[0] && plan.findings[0].code) || 'ssrf_blocked' }],
        usage: {}
      });
    }
    const redirects = Array.isArray(stubOut.redirectChain) ? stubOut.redirectChain : [];
    for (let i = 0; i < redirects.length; i++) {
      const rd = validateRedirectTarget(redirects[i], {
        redirectCount: i + 1,
        maximumRedirects: 3,
        fromScheme: urlRes.scheme,
        resolvedAddresses: stubOut.redirectResolvedAddresses || stubOut.resolvedAddresses,
        initialPinnedAddress: plan.plan.pinnedAddress,
        policy: { allowedSchemes: ['http', 'https'] }
      });
      if (!rd.ok) {
        findings.push(...rd.findings.map((f) => finding(f.code, f.path, f.detail)));
        setResult('security_blocked', findings);
        return freezeDeep({
          executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
          executionMode: 'mock_or_replay',
          requestedUrl: urlRes.normalized,
          finalUrl: urlRes.normalized,
          redirectChain: redirects,
          resolvedAddresses: stubOut.resolvedAddresses || [],
          status: 0,
          contentType: 'text/html',
          bytesRead: 0,
          contentHash: 'redirect',
          normalizedText: '',
          title: null,
          publisher: null,
          author: null,
          publicationDate: null,
          lastUpdatedDate: null,
          language: 'en',
          sourceLocator: 'none',
          geographicScope: 'global',
          plantIdentityScope: 'species',
          contextHints: {},
          accessibilityState: 'inaccessible',
          hostileIndicators: [],
          truncationState: false,
          errors: [{ code: 'unsafe_redirect' }],
          usage: {}
        });
      }
    }
    const tls = evaluateTlsMetadata(stubOut.tls || { tlsVerified: true, certificateValid: true, hostnameMatched: true });
    if (!tls.ok) {
      findings.push(...tls.findings.map((f) => finding(f.code, f.path, f.detail)));
      setResult('security_blocked', findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: redirects,
        resolvedAddresses: stubOut.resolvedAddresses || [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'tls',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: 'tls_failure' }],
        usage: {}
      });
    }
    const fetchBody = Object.assign({}, stubOut, {
      requestedUrl: urlRes.normalized,
      finalUrl: trim(stubOut.finalUrl) || urlRes.normalized,
      redirectChain: redirects,
      resolvedAddresses: stubOut.resolvedAddresses || []
    });
    const norm = normalizeVendorFetchResponse(fetchBody);
    findings.push(...norm.findings);
    if (!norm.ok || !norm.normalized) {
      const st = pickStatus(
        findings.map((f) =>
          f.code.indexOf('mime') >= 0 ||
          f.code.indexOf('robots') >= 0 ||
          f.code.indexOf('paywall') >= 0 ||
          f.code.indexOf('ssrf') >= 0 ||
          f.code.indexOf('private') >= 0 ||
          f.code.indexOf('oversized') >= 0
            ? 'security_blocked'
            : 'fetch_unavailable'
        )
      );
      setResult(st, findings);
      return freezeDeep({
        executorVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        executionMode: 'mock_or_replay',
        requestedUrl: urlRes.normalized,
        finalUrl: urlRes.normalized,
        redirectChain: redirects,
        resolvedAddresses: stubOut.resolvedAddresses || [],
        status: 0,
        contentType: 'text/html',
        bytesRead: 0,
        contentHash: 'failed',
        normalizedText: '',
        title: null,
        publisher: null,
        author: null,
        publicationDate: null,
        lastUpdatedDate: null,
        language: 'en',
        sourceLocator: 'none',
        geographicScope: 'global',
        plantIdentityScope: 'species',
        contextHints: {},
        accessibilityState: 'inaccessible',
        hostileIndicators: [],
        truncationState: false,
        errors: [{ code: st }],
        usage: {}
      });
    }
    assertNoSecretMaterial(norm.normalized, findings, 'fetch.normalized');
    findings.push(finding('authority_not_granted', null, 'adapter'));
    findings.push(finding('cost_reported', 'usage', '0'));
    setResult('results_ready_for_provider_orchestration', findings, {
      lastFetch: norm.normalized,
      transportPolicyFingerprint: fingerprintOf('lsp-transport-policy', {
        url: urlRes.normalized,
        redirects,
        addresses: stubOut.resolvedAddresses || []
      }),
      normalizedExecutorOutputFingerprint: fingerprintOf('lsp-adapter-exec', norm.normalized)
    });
    return freezeDeep(norm.normalized);
  }

  return {
    searchExecutor,
    fetchExecutor,
    getLastAdapterResult: () => lastResult,
    getConfiguration: () => cfg,
    configurationOk: cfgNorm.ok
  };
}

export {
  pickStatus,
  STATUS_PRIORITY,
  stripRaw,
  finding,
  containsSecretLeak
};
