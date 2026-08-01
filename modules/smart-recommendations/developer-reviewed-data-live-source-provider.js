/**
 * Cruvit — Smart Recommendations developer Reviewed Data Live Source Provider
 * ---------------------------------------------------------------------------
 * Inert, developer/test-only, provider-neutral mock/replay orchestration that
 * prepares Source Scout-compatible discovery results via injected executors.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, persistence, or writes.
 *  - No real network, browser fetch, external API, external model, or credentials.
 *  - Does not modify Source Scout, call Source Capture/Batch Draft, or grant authority.
 */

import {
  SR_EVIDENCE_PACKET_FIELDS,
  SR_EVIDENCE_CLAIM_TYPES,
  SR_EVIDENCE_SOURCE_TYPES,
  normalizeEvidencePacketContextScope,
  SR_EVIDENCE_PACKET_CONTRACT_VERSION
} from './developer-evidence-packet-registry.js';

import {
  normalizeUrlReference,
  stableSerialize,
  sortFindings,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS,
  SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION
} from './developer-reviewed-data-source-capture-contract.js';

import {
  SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
  SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
  SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
  buildSourceScoutAssignmentFingerprint,
  buildSourceScoutSourceFingerprint,
  buildSourceScoutContentFingerprint
} from './developer-reviewed-data-source-scout.js';

export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_VERSION =
  '0.1.0-sr-live-source-provider';
export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION =
  '0.1.0-sr-live-source-provider-contract';
export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_RESULT_CONTRACT_VERSION =
  '0.1.0-sr-live-source-provider-result';
export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CAPABILITY =
  'explicit_developer_live_source_discovery_preparation';

export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_STATUSES = Object.freeze([
  'provider_not_run',
  'provider_input_invalid',
  'provider_configuration_blocked',
  'query_plan_invalid',
  'budget_blocked',
  'search_unavailable',
  'no_results',
  'partial_retrieval',
  'retrieval_blocked',
  'extraction_incomplete',
  'results_ready_for_source_scout',
  'human_review_required',
  'provider_failed'
]);

export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_HARD_FINDINGS = Object.freeze([
  'unsupported_provider_contract',
  'unknown_provider_input_key',
  'invalid_query_plan_fingerprint',
  'unsupported_provider_configuration',
  'secret_material_detected',
  'budget_exceeded',
  'rate_limited',
  'timeout',
  'blocked_url_scheme',
  'private_network_target',
  'unsafe_redirect',
  'inaccessible_source',
  'authentication_required',
  'paywall_or_captcha',
  'unsupported_mime',
  'response_too_large',
  'robots_or_source_policy_blocked',
  'hostile_content',
  'extraction_schema_invalid',
  'quotation_mismatch',
  'missing_locator',
  'unsupported_candidate_value',
  'external_model_unavailable'
]);

export const SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_INFO_FINDINGS = Object.freeze([
  'content_truncated',
  'duplicate_url',
  'probable_copied_source',
  'extraction_unavailable',
  'external_model_output_untrusted',
  'no_relevant_sources',
  'partial_results',
  'results_prepared_for_scout',
  'product_authority_not_granted'
]);

const ABSOLUTE_CAPS = Object.freeze({
  assignments: 1,
  searchCalls: 6,
  candidateUrls: 12,
  fetchCalls: 8,
  bytesPerResponse: 524288,
  totalBytes: 2097152,
  normalizedSourceTextChars: 8000,
  redirects: 3,
  retries: 1,
  externalModelCalls: 0,
  durationMs: 90000,
  estimatedCostUsd: 0
});

const INPUT_REQUIRED_KEYS = Object.freeze([
  'providerContractVersion',
  'sourceScoutQueryPlan',
  'expectedQueryPlanFingerprint',
  'approvedAssignmentSnapshot',
  'approvedIdentitySnapshot',
  'providerConfigurationReference',
  'networkPolicy',
  'sourcePolicy',
  'executionBudget',
  'languagePolicy',
  'extractionPolicy'
]);

const INPUT_OPTIONAL_KEYS = Object.freeze(['expectedProviderInputFingerprint']);

const INPUT_ALLOWED_KEYS = Object.freeze(
  INPUT_REQUIRED_KEYS.concat(INPUT_OPTIONAL_KEYS)
);

const EXECUTOR_ALLOWED_KEYS = Object.freeze([
  'searchExecutor',
  'fetchExecutor',
  'extractionExecutor',
  'cancellationSignal',
  'usageReporter'
]);

const SECRET_KEY_RE =
  /^(api[_-]?key|token|access[_-]?token|password|secret|cookie|cookies|session|authorization|credentials|private[_-]?document|conversation[_-]?history)$/i;

const FORBIDDEN_INSTRUCTION_KEY_RE =
  /(gate[_-]?[abc]|finaliz|artifact[_-]?writ|catalog[_-]?writ|product[_-]?authorit|runtime[_-]?exec|git[_-]?(commit|push)|deploy|shopify|commerce[_-]?agent)/i;

const SECRET_VALUE_RE =
  /\b(sk-[a-zA-Z0-9]{16,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*|api[_-]?key\s*[:=]\s*\S+|AIza[0-9A-Za-z\-_]{20,})\b/i;

const TRACKING_PARAM_RE = /^(utm_|fbclid$|gclid$|mc_)/i;

const SCOUT_DISCOVERY_KEYS = Object.freeze([
  'syntheticResultId',
  'url',
  'publisher',
  'title',
  'author',
  'publicationDate',
  'lastUpdatedDate',
  'language',
  'sourceClass',
  'sourceText',
  'sourceLocator',
  'geographicScope',
  'plantIdentityScope',
  'fieldHints',
  'contextHints',
  'accessibilityState',
  'probableCopyOf',
  'hostileContentFlags',
  'declaredClaimSpans'
]);

const HOSTILE_SCOUT_FLAGS = Object.freeze([
  'prompt_injection',
  'executable_instruction',
  'credential_request',
  'unrelated_navigation',
  'authority_bypass'
]);

const EMPTY_AUTHORITY = Object.freeze({
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
  scalarAuthority: false,
  runtimeRecommendationAuthority: false,
  GOSOutcomeAuthority: false,
  productUseAllowed: false,
  runtimeConsumptionAllowed: false
});

function freezeDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) freezeDeep(value[i]);
    return Object.freeze(value);
  }
  const keys = Object.keys(value);
  for (let i = 0; i < keys.length; i++) freezeDeep(value[keys[i]]);
  return Object.freeze(value);
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function normalizeTrim(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeKey(v) {
  const s = normalizeTrim(v);
  return s ? s.toLowerCase() : null;
}

function cloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

function contentHash(text) {
  return 'ch|' + fnv1a(String(text || '')) + '|' + String(text || '').length;
}

function pushFinding(findings, finding) {
  const code = finding.code;
  const hard = SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_HARD_FINDINGS.indexOf(code) >= 0;
  const info = SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_INFO_FINDINGS.indexOf(code) >= 0;
  if (!hard && !info) return;
  findings.push(
    freezeDeep({
      code: code,
      severity: finding.severity || (hard ? 'error' : 'info'),
      path: finding.path == null ? null : finding.path,
      detail: finding.detail == null ? null : finding.detail,
      expected: finding.expected === undefined ? null : finding.expected,
      actual: finding.actual === undefined ? null : finding.actual
    })
  );
}

function resolveStatus(flags) {
  if (flags.provider_failed) return 'provider_failed';
  if (flags.provider_input_invalid) return 'provider_input_invalid';
  if (flags.provider_configuration_blocked) return 'provider_configuration_blocked';
  if (flags.query_plan_invalid) return 'query_plan_invalid';
  if (flags.budget_blocked) return 'budget_blocked';
  if (flags.search_unavailable) return 'search_unavailable';
  if (flags.retrieval_blocked) return 'retrieval_blocked';
  if (flags.no_results) return 'no_results';
  if (flags.extraction_incomplete) return 'extraction_incomplete';
  if (flags.partial_retrieval) return 'partial_retrieval';
  if (flags.human_review_required) return 'human_review_required';
  if (flags.results_ready_for_source_scout) return 'results_ready_for_source_scout';
  return 'provider_not_run';
}

function scanSecrets(node, path, findings) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    if (SECRET_VALUE_RE.test(node)) {
      pushFinding(findings, {
        code: 'secret_material_detected',
        path: path,
        detail: 'secret_like_value_rejected'
      });
    }
    return;
  }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) scanSecrets(node[i], path + '[' + i + ']', findings);
    return;
  }
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const p = path ? path + '.' + k : k;
    if (SECRET_KEY_RE.test(k) || FORBIDDEN_INSTRUCTION_KEY_RE.test(k)) {
      pushFinding(findings, {
        code: 'secret_material_detected',
        path: p,
        detail: 'secret_or_forbidden_key_rejected'
      });
      continue;
    }
    scanSecrets(node[k], p, findings);
  }
}

function assertExactKeys(obj, allowed, path, findings, code) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    if (allowed.indexOf(keys[i]) < 0) {
      pushFinding(findings, {
        code: code || 'unknown_provider_input_key',
        path: path ? path + '.' + keys[i] : keys[i],
        detail: 'unknown_key'
      });
    }
  }
}

function isPrivateIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const a = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (a.some(function (n) { return n > 255; })) return true;
  if (a[0] === 10) return true;
  if (a[0] === 127) return true;
  if (a[0] === 0) return true;
  if (a[0] === 169 && a[1] === 254) return true;
  if (a[0] === 172 && a[1] >= 16 && a[1] <= 31) return true;
  if (a[0] === 192 && a[1] === 168) return true;
  if (a[0] === 100 && a[1] >= 64 && a[1] <= 127) return true;
  return false;
}

function isBlockedHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'metadata.google.internal' || h === 'metadata' || h.indexOf('169.254.169.254') >= 0) {
    return true;
  }
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.indexOf(':') >= 0) {
    if (h === '::' || h.indexOf('fc') === 0 || h.indexOf('fd') === 0 || h.indexOf('fe80') === 0) {
      return true;
    }
  }
  if (isPrivateIpv4(h)) return true;
  return false;
}

function stripTrackingParams(search) {
  if (!search) return '';
  const q = search.charAt(0) === '?' ? search.slice(1) : search;
  if (!q) return '';
  const kept = [];
  q.split('&').forEach(function (part) {
    if (!part) return;
    const eq = part.indexOf('=');
    const name = eq >= 0 ? part.slice(0, eq) : part;
    if (TRACKING_PARAM_RE.test(name)) return;
    kept.push(part);
  });
  return kept.length ? '?' + kept.join('&') : '';
}

function normalizeProviderUrl(url, findings, path) {
  const raw = normalizeTrim(url);
  if (!raw) {
    pushFinding(findings, { code: 'unsupported_candidate_value', path: path, detail: 'url_missing' });
    return null;
  }
  let u;
  try {
    u = new URL(raw);
  } catch (_e) {
    pushFinding(findings, { code: 'unsupported_candidate_value', path: path, detail: 'url_parse_failed' });
    return null;
  }
  const scheme = String(u.protocol || '').toLowerCase().replace(/:$/, '');
  if (scheme !== 'http' && scheme !== 'https') {
    pushFinding(findings, {
      code: 'blocked_url_scheme',
      path: path,
      detail: 'scheme_' + scheme,
      actual: scheme
    });
    return null;
  }
  if (u.username || u.password) {
    pushFinding(findings, {
      code: 'secret_material_detected',
      path: path,
      detail: 'credential_bearing_url'
    });
    return null;
  }
  const host = String(u.hostname || '').toLowerCase();
  if (isBlockedHost(host)) {
    pushFinding(findings, {
      code: 'private_network_target',
      path: path,
      detail: 'blocked_host'
    });
    return null;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateIpv4(host) === false) {
    // Public literal IPs are treated as unsafe direct IPs in this proof.
    pushFinding(findings, {
      code: 'private_network_target',
      path: path,
      detail: 'unsafe_direct_ip'
    });
    return null;
  }
  let pathName = u.pathname || '/';
  if (pathName.length > 1 && pathName.endsWith('/')) pathName = pathName.slice(0, -1);
  const search = stripTrackingParams(u.search || '');
  const normalized = scheme + '://' + host + pathName + search;
  const viaCapture = normalizeUrlReference(normalized) || normalized;
  return {
    raw: raw,
    normalized: viaCapture,
    scheme: scheme,
    host: host,
    fingerprint: 'urlfp|' + fnv1a(viaCapture)
  };
}

function detectHostileFlags(text) {
  const t = String(text || '');
  const flags = [];
  const lower = t.toLowerCase();
  if (
    /ignore (all |previous |prior )?(instructions|rules|policy)/i.test(t) ||
    /disregard cruvit/i.test(t)
  ) {
    flags.push('prompt_injection');
  }
  if (/<\/?script\b/i.test(t) || /\beval\s*\(/i.test(t) || /javascript:/i.test(t)) {
    flags.push('executable_instruction');
  }
  if (/api[_-]?key|password|access token|upload your (secret|credentials)/i.test(t)) {
    flags.push('credential_request');
  }
  if (/navigate to|browse to|visit http|open this link and login/i.test(t)) {
    flags.push('unrelated_navigation');
  }
  if (
    /set\s+productauthority\s*=\s*true/i.test(t) ||
    /approve all claims/i.test(t) ||
    /grant (catalog|product|batch) authority/i.test(t) ||
    /bypass (gate|approval|human review)/i.test(t)
  ) {
    flags.push('authority_bypass');
  }
  if (!flags.length && /ignore previous instructions/i.test(lower)) {
    flags.push('prompt_injection');
  }
  return flags.filter(function (f, i, a) {
    return HOSTILE_SCOUT_FLAGS.indexOf(f) >= 0 && a.indexOf(f) === i;
  });
}

function normalizeContent(fetchOut, findings, path) {
  const ct = normalizeTrim(fetchOut.contentType || '').toLowerCase();
  const mime = ct.split(';')[0];
  if (mime !== 'text/html' && mime !== 'text/plain') {
    pushFinding(findings, {
      code: 'unsupported_mime',
      path: path + '.contentType',
      actual: mime
    });
    return null;
  }
  let text = String(fetchOut.normalizedText != null ? fetchOut.normalizedText : '');
  if (mime === 'text/plain') {
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } else {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  let truncated = false;
  if (text.length > ABSOLUTE_CAPS.normalizedSourceTextChars) {
    text = text.slice(0, ABSOLUTE_CAPS.normalizedSourceTextChars);
    truncated = true;
    pushFinding(findings, {
      code: 'content_truncated',
      path: path + '.normalizedText',
      detail: 'max_' + ABSOLUTE_CAPS.normalizedSourceTextChars
    });
  }
  const hash = fetchOut.contentHash || contentHash(text);
  return {
    mime: mime,
    text: text,
    truncated: truncated,
    contentHash: hash,
    normalizationMethod: mime === 'text/html' ? 'html_boilerplate_strip_v1' : 'plaintext_eol_v1'
  };
}

function validateNetworkPolicy(policy, findings) {
  const o = asObject(policy);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy',
      detail: 'missing'
    });
    return null;
  }
  const allowed = [
    'executionMode',
    'realNetworkAllowed',
    'browserFetchAllowed',
    'secretBearingTransportAllowed',
    'allowedSchemes',
    'maximumRedirects',
    'connectTimeoutMs',
    'readTimeoutMs',
    'maximumRetries',
    'blockLocalhost',
    'blockLoopback',
    'blockPrivateIpv4',
    'blockPrivateIpv6',
    'blockLinkLocal',
    'blockCloudMetadata',
    'blockCredentialBearingUrls',
    'blockUnsafeDirectIps',
    'blockRedirectsToBlockedTargets',
    'redirectRevalidationRequired',
    'cancellationSupported'
  ];
  assertExactKeys(o, allowed, 'networkPolicy', findings);
  if (o.executionMode !== 'mock_or_replay_only') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.executionMode',
      actual: o.executionMode
    });
  }
  if (o.realNetworkAllowed !== false) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.realNetworkAllowed',
      detail: 'live_network_not_allowed'
    });
  }
  if (o.browserFetchAllowed !== false) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.browserFetchAllowed',
      detail: 'browser_fetch_not_allowed'
    });
  }
  if (o.secretBearingTransportAllowed !== false) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.secretBearingTransportAllowed',
      detail: 'secret_transport_not_allowed'
    });
  }
  const schemes = Array.isArray(o.allowedSchemes) ? o.allowedSchemes.slice().sort() : [];
  if (schemes.length !== 2 || schemes[0] !== 'http' || schemes[1] !== 'https') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.allowedSchemes',
      detail: 'http_https_required'
    });
  }
  if (o.maximumRedirects !== 3) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.maximumRedirects',
      expected: 3,
      actual: o.maximumRedirects
    });
  }
  if (o.connectTimeoutMs !== 5000 || o.readTimeoutMs !== 15000 || o.maximumRetries !== 1) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'networkPolicy.timeouts_or_retries',
      detail: 'exact_timeout_retry_required'
    });
  }
  const boolRequired = [
    'blockLocalhost',
    'blockLoopback',
    'blockPrivateIpv4',
    'blockPrivateIpv6',
    'blockLinkLocal',
    'blockCloudMetadata',
    'blockCredentialBearingUrls',
    'blockUnsafeDirectIps',
    'blockRedirectsToBlockedTargets',
    'redirectRevalidationRequired',
    'cancellationSupported'
  ];
  for (let i = 0; i < boolRequired.length; i++) {
    if (o[boolRequired[i]] !== true) {
      pushFinding(findings, {
        code: 'unsupported_provider_configuration',
        path: 'networkPolicy.' + boolRequired[i],
        detail: 'must_be_true'
      });
    }
  }
  return freezeDeep(cloneJson(o));
}

function validateSourcePolicy(policy, findings) {
  const o = asObject(policy);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'sourcePolicy',
      detail: 'missing'
    });
    return null;
  }
  const allowed = [
    'publicUnauthenticatedOnly',
    'permittedMime',
    'pdfAllowed',
    'ocrAllowed',
    'headlessBrowserAllowed',
    'javascriptExecutionAllowed',
    'formSubmissionAllowed',
    'paywallBypassAllowed',
    'captchaBypassAllowed',
    'loginAllowed',
    'socialAccountScrapingAllowed',
    'privateCloudDocumentsAllowed',
    'domainAllowlist',
    'domainDenylist'
  ];
  assertExactKeys(o, allowed, 'sourcePolicy', findings);
  if (o.publicUnauthenticatedOnly !== true) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'sourcePolicy.publicUnauthenticatedOnly'
    });
  }
  const mime = Array.isArray(o.permittedMime) ? o.permittedMime.slice().sort() : [];
  if (mime.join('|') !== 'text/html|text/plain') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'sourcePolicy.permittedMime'
    });
  }
  const falseKeys = [
    'pdfAllowed',
    'ocrAllowed',
    'headlessBrowserAllowed',
    'javascriptExecutionAllowed',
    'formSubmissionAllowed',
    'paywallBypassAllowed',
    'captchaBypassAllowed',
    'loginAllowed',
    'socialAccountScrapingAllowed',
    'privateCloudDocumentsAllowed'
  ];
  for (let i = 0; i < falseKeys.length; i++) {
    if (o[falseKeys[i]] !== false) {
      pushFinding(findings, {
        code: 'unsupported_provider_configuration',
        path: 'sourcePolicy.' + falseKeys[i],
        detail: 'must_be_false'
      });
    }
  }
  return freezeDeep({
    publicUnauthenticatedOnly: true,
    permittedMime: ['text/html', 'text/plain'],
    pdfAllowed: false,
    ocrAllowed: false,
    headlessBrowserAllowed: false,
    javascriptExecutionAllowed: false,
    formSubmissionAllowed: false,
    paywallBypassAllowed: false,
    captchaBypassAllowed: false,
    loginAllowed: false,
    socialAccountScrapingAllowed: false,
    privateCloudDocumentsAllowed: false,
    domainAllowlist: Array.isArray(o.domainAllowlist)
      ? o.domainAllowlist.map(normalizeKey).filter(Boolean)
      : [],
    domainDenylist: Array.isArray(o.domainDenylist)
      ? o.domainDenylist.map(normalizeKey).filter(Boolean)
      : []
  });
}

function validateExecutionBudget(budget, assignmentMaxCandidates, findings) {
  const o = asObject(budget);
  if (!o) {
    pushFinding(findings, {
      code: 'budget_exceeded',
      path: 'executionBudget',
      detail: 'missing'
    });
    return null;
  }
  const allowed = [
    'assignments',
    'searchCalls',
    'candidateUrls',
    'fetchCalls',
    'bytesPerResponse',
    'totalBytes',
    'normalizedSourceTextChars',
    'redirects',
    'retries',
    'externalModelCalls',
    'durationMs',
    'estimatedCostUsd'
  ];
  assertExactKeys(o, allowed, 'executionBudget', findings);
  function clamp(key, abs) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      pushFinding(findings, {
        code: 'budget_exceeded',
        path: 'executionBudget.' + key,
        detail: 'invalid'
      });
      return abs;
    }
    return Math.min(v, abs);
  }
  const effective = {
    assignments: clamp('assignments', ABSOLUTE_CAPS.assignments),
    searchCalls: clamp('searchCalls', ABSOLUTE_CAPS.searchCalls),
    candidateUrls: Math.min(
      clamp('candidateUrls', ABSOLUTE_CAPS.candidateUrls),
      typeof assignmentMaxCandidates === 'number' ? assignmentMaxCandidates : ABSOLUTE_CAPS.candidateUrls
    ),
    fetchCalls: clamp('fetchCalls', ABSOLUTE_CAPS.fetchCalls),
    bytesPerResponse: clamp('bytesPerResponse', ABSOLUTE_CAPS.bytesPerResponse),
    totalBytes: clamp('totalBytes', ABSOLUTE_CAPS.totalBytes),
    normalizedSourceTextChars: clamp(
      'normalizedSourceTextChars',
      ABSOLUTE_CAPS.normalizedSourceTextChars
    ),
    redirects: clamp('redirects', ABSOLUTE_CAPS.redirects),
    retries: clamp('retries', ABSOLUTE_CAPS.retries),
    externalModelCalls: clamp('externalModelCalls', ABSOLUTE_CAPS.externalModelCalls),
    durationMs: clamp('durationMs', ABSOLUTE_CAPS.durationMs),
    estimatedCostUsd: clamp('estimatedCostUsd', ABSOLUTE_CAPS.estimatedCostUsd)
  };
  if (effective.assignments !== 1) {
    pushFinding(findings, {
      code: 'budget_exceeded',
      path: 'executionBudget.assignments',
      detail: 'must_be_1'
    });
  }
  if (effective.externalModelCalls !== 0 || effective.estimatedCostUsd !== 0) {
    pushFinding(findings, {
      code: 'budget_exceeded',
      path: 'executionBudget.externalModelCalls_or_cost',
      detail: 'must_be_zero_for_mock_replay'
    });
  }
  return freezeDeep(effective);
}

function validateLanguagePolicy(policy, targetRegion, findings) {
  const o = asObject(policy);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'languagePolicy',
      detail: 'missing'
    });
    return null;
  }
  assertExactKeys(
    o,
    ['preferredLanguages', 'preserveSourceLanguage', 'translationAllowed', 'targetRegion'],
    'languagePolicy',
    findings
  );
  const langs = Array.isArray(o.preferredLanguages) ? o.preferredLanguages.slice() : [];
  if (langs.length !== 1 || langs[0] !== 'en') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'languagePolicy.preferredLanguages'
    });
  }
  if (o.preserveSourceLanguage !== true || o.translationAllowed !== false) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'languagePolicy.translation_flags'
    });
  }
  if (normalizeTrim(o.targetRegion) !== normalizeTrim(targetRegion)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'languagePolicy.targetRegion',
      detail: 'region_mismatch'
    });
  }
  return freezeDeep({
    preferredLanguages: ['en'],
    preserveSourceLanguage: true,
    translationAllowed: false,
    targetRegion: normalizeTrim(targetRegion)
  });
}

function validateExtractionPolicy(policy, findings) {
  const o = asObject(policy);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'extractionPolicy',
      detail: 'missing'
    });
    return null;
  }
  assertExactKeys(
    o,
    ['enabled', 'externalModelAllowed', 'declaredClaimSpans'],
    'extractionPolicy',
    findings
  );
  if (o.enabled !== false || o.externalModelAllowed !== false || o.declaredClaimSpans !== 'disabled') {
    pushFinding(findings, {
      code: 'external_model_unavailable',
      path: 'extractionPolicy',
      detail: 'extraction_must_be_disabled'
    });
  }
  return freezeDeep({
    enabled: false,
    externalModelAllowed: false,
    declaredClaimSpans: 'disabled'
  });
}

function validateQueryPlan(plan, expectedFp, identity, assignment, findings) {
  const o = asObject(plan);
  if (!o) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan',
      detail: 'missing'
    });
    return null;
  }
  const body = cloneJson(o);
  const providedFp = normalizeTrim(body.queryPlanFingerprint);
  delete body.queryPlanFingerprint;
  const recomputed = 'ss-qplan|' + stableSerialize(body);
  if (recomputed !== expectedFp || (providedFp && providedFp !== expectedFp)) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'expectedQueryPlanFingerprint',
      expected: recomputed,
      actual: expectedFp
    });
    return null;
  }
  if (normalizeTrim(o.acceptedScientificName) !== normalizeTrim(identity.acceptedScientificName)) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.acceptedScientificName',
      detail: 'identity_mismatch'
    });
  }
  if (normalizeKey(o.canonicalKey) !== normalizeKey(identity.canonicalKey)) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.canonicalKey',
      detail: 'canonical_mismatch'
    });
  }
  if (normalizeTrim(o.targetField) !== normalizeTrim(identity.targetField)) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.targetField',
      detail: 'field_mismatch'
    });
  }
  if (!Array.isArray(o.queryTemplates) || !o.queryTemplates.length) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.queryTemplates',
      detail: 'templates_required'
    });
  }
  const limits = asObject(o.limits) || {};
  const domain = asObject(o.domainPolicy) || {};
  if (
    limits.networkRequests !== 0 ||
    limits.pages !== 'synthetic_only' ||
    domain.liveFetch !== false ||
    domain.externalModel !== false
  ) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.scout_boundary_flags',
      detail: 'scout_boundary_must_remain_synthetic'
    });
  }
  if (normalizeTrim(o.explicitRegion) !== normalizeTrim(assignment.targetRegion)) {
    pushFinding(findings, {
      code: 'invalid_query_plan_fingerprint',
      path: 'sourceScoutQueryPlan.explicitRegion',
      detail: 'region_mismatch'
    });
  }
  return freezeDeep(
    Object.assign({}, cloneJson(body), { queryPlanFingerprint: expectedFp })
  );
}

function validateIdentitySnapshot(snap, findings) {
  const o = asObject(snap);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedIdentitySnapshot',
      detail: 'missing'
    });
    return null;
  }
  const required = [
    'canonicalKey',
    'acceptedScientificName',
    'identityRegistryVersion',
    'currentIdentityBindingFingerprint',
    'currentNeedsReview',
    'currentIdentityConflict',
    'canonicalIdentityConfirmed',
    'parentOrGenusScope',
    'targetField'
  ];
  assertExactKeys(o, required, 'approvedIdentitySnapshot', findings);
  for (let i = 0; i < required.length; i++) {
    if (o[required[i]] === undefined) {
      pushFinding(findings, {
        code: 'unsupported_provider_configuration',
        path: 'approvedIdentitySnapshot.' + required[i],
        detail: 'required'
      });
    }
  }
  if (o.currentNeedsReview === true) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedIdentitySnapshot.currentNeedsReview',
      detail: 'needs_review_blocked'
    });
  }
  if (o.currentIdentityConflict === true) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedIdentitySnapshot.currentIdentityConflict',
      detail: 'identity_conflict_blocked'
    });
  }
  if (o.canonicalIdentityConfirmed !== true) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedIdentitySnapshot.canonicalIdentityConfirmed',
      detail: 'identity_unconfirmed'
    });
  }
  if (normalizeKey(o.parentOrGenusScope) !== 'species') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedIdentitySnapshot.parentOrGenusScope',
      detail: 'non_species_scope'
    });
  }
  if (SR_EVIDENCE_PACKET_FIELDS.indexOf(normalizeTrim(o.targetField)) < 0) {
    pushFinding(findings, {
      code: 'unsupported_candidate_value',
      path: 'approvedIdentitySnapshot.targetField',
      actual: o.targetField
    });
  }
  return freezeDeep(cloneJson(o));
}

function validateAssignmentSnapshot(snap, identity, queryPlan, configRef, findings) {
  const o = asObject(snap);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot',
      detail: 'missing'
    });
    return null;
  }
  const required = [
    'assignmentId',
    'assignmentFingerprint',
    'canonicalKey',
    'acceptedScientificName',
    'targetField',
    'targetClaimTypes',
    'targetQuestions',
    'targetContext',
    'targetRegion',
    'allowedSourceClasses',
    'prohibitedSourceClasses',
    'languagePreferences',
    'maximumCandidateSources',
    'maximumClaimsPerSource',
    'providerConfigurationReference'
  ];
  assertExactKeys(o, required, 'approvedAssignmentSnapshot', findings);
  if (normalizeKey(o.canonicalKey) !== normalizeKey(identity.canonicalKey)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot.canonicalKey',
      detail: 'identity_mismatch'
    });
  }
  if (normalizeTrim(o.acceptedScientificName) !== normalizeTrim(identity.acceptedScientificName)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot.acceptedScientificName',
      detail: 'name_mismatch'
    });
  }
  if (normalizeTrim(o.targetField) !== normalizeTrim(identity.targetField)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot.targetField',
      detail: 'field_mismatch'
    });
  }
  if (normalizeTrim(o.providerConfigurationReference) !== normalizeTrim(configRef)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot.providerConfigurationReference',
      detail: 'config_mismatch'
    });
  }
  if (normalizeTrim(o.targetRegion) !== normalizeTrim(queryPlan.explicitRegion)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'approvedAssignmentSnapshot.targetRegion',
      detail: 'query_plan_region_mismatch'
    });
  }
  const claimTypes = Array.isArray(o.targetClaimTypes) ? o.targetClaimTypes : [];
  for (let i = 0; i < claimTypes.length; i++) {
    if (SR_EVIDENCE_CLAIM_TYPES.indexOf(claimTypes[i]) < 0) {
      pushFinding(findings, {
        code: 'unsupported_candidate_value',
        path: 'approvedAssignmentSnapshot.targetClaimTypes[' + i + ']',
        actual: claimTypes[i]
      });
    }
  }
  const ctx = normalizeEvidencePacketContextScope(
    o.targetContext,
    SR_EVIDENCE_PACKET_CONTRACT_VERSION
  );
  if (!ctx.ok) {
    pushFinding(findings, {
      code: 'unsupported_candidate_value',
      path: 'approvedAssignmentSnapshot.targetContext',
      detail: 'context_invalid'
    });
  }
  return freezeDeep(
    Object.assign({}, cloneJson(o), {
      targetContext: ctx.ok ? ctx.normalized : o.targetContext
    })
  );
}

function buildEmptyUsage() {
  return {
    assignments: 0,
    queriesAttempted: 0,
    searchExecutorCalls: 0,
    fetchExecutorCalls: 0,
    extractionExecutorCalls: 0,
    candidateUrls: 0,
    successfulFetches: 0,
    failedFetches: 0,
    duplicateUrls: 0,
    bytesRetrieved: 0,
    truncatedSources: 0,
    redirects: 0,
    retries: 0,
    rateLimitEvents: 0,
    estimatedCostUsd: 0,
    budgetRemaining: null,
    durationBucket: 'mock_replay',
    realNetworkCalls: 0,
    realExternalModelCalls: 0
  };
}

function buildResultSkeleton(partial) {
  return freezeDeep({
    descriptor: getSmartRecDeveloperReviewedDataLiveSourceProviderDescriptor(),
    providerContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
    providerResultContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_RESULT_CONTRACT_VERSION,
    status: partial.status || 'provider_not_run',
    assignmentReference: partial.assignmentReference || null,
    queryPlanReference: partial.queryPlanReference || null,
    providerConfigurationReference: partial.providerConfigurationReference || null,
    searchExecutionReference: partial.searchExecutionReference || null,
    fetchExecutionReferences: partial.fetchExecutionReferences || [],
    extractionExecutionReferences: partial.extractionExecutionReferences || [],
    sourceScoutDiscoveryResults: partial.sourceScoutDiscoveryResults || [],
    rejectedProviderResults: partial.rejectedProviderResults || [],
    findings: sortFindings(partial.findings || []),
    warnings: sortFindings(partial.warnings || []),
    usageSummary: freezeDeep(partial.usageSummary || buildEmptyUsage()),
    authorityBoundary: EMPTY_AUTHORITY,
    inputFingerprint: partial.inputFingerprint || null,
    normalizedRunFingerprint: partial.normalizedRunFingerprint || null,
    replayFingerprint: partial.replayFingerprint || null,
    mutationCheck: freezeDeep(
      partial.mutationCheck || {
        inputMutated: false,
        executorOutputMutated: false,
        resultMutated: false
      }
    )
  });
}

export function getSmartRecDeveloperReviewedDataLiveSourceProviderDescriptor() {
  return freezeDeep({
    version: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_VERSION,
    providerContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
    providerResultContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_RESULT_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CAPABILITY,
    optionalExtractionCapability: 'explicit_developer_untrusted_claim_span_extraction',
    extractionCapabilityEnabled: false,
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
    scalarAuthority: false,
    runtimeRecommendationAuthority: false,
    GOSOutcomeAuthority: false,
    productUseAllowed: false,
    runtimeConsumptionAllowed: false,
    network: false,
    externalApi: false,
    externalModel: false,
    persistence: false,
    filesystemWrite: false,
    automaticExecution: false,
    activation: 'explicit_developer_call_only',
    indexHtmlImport: false,
    runtimeImport: false,
    inputMutation: false,
    executorMutation: false,
    providerResultMutation: false,
    scoutInputMutation: false,
    gitCommit: false,
    gitPush: false,
    deploy: false,
    peerVersions: {
      sourceScoutVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
      sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
      sourceScoutResultContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_RESULT_CONTRACT_VERSION,
      sourceCaptureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION,
      sourceCaptureMaxShortExcerptChars: SR_REVIEWED_DATA_SOURCE_CAPTURE_MAX_SHORT_EXCERPT_CHARS
    },
    absoluteCaps: ABSOLUTE_CAPS,
    statuses: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_STATUSES.slice(),
    hardFindings: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_HARD_FINDINGS.slice(),
    infoFindings: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_INFO_FINDINGS.slice(),
    scoutDiscoveryKeys: SCOUT_DISCOVERY_KEYS.slice()
  });
}

export function normalizeReviewedDataLiveSourceProviderInput(input) {
  const findings = [];
  const src = asObject(input);
  if (!src) {
    pushFinding(findings, {
      code: 'unsupported_provider_contract',
      path: null,
      detail: 'input_not_object'
    });
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }
  scanSecrets(src, '', findings);
  assertExactKeys(src, INPUT_ALLOWED_KEYS, '', findings, 'unknown_provider_input_key');
  for (let i = 0; i < INPUT_REQUIRED_KEYS.length; i++) {
    if (src[INPUT_REQUIRED_KEYS[i]] === undefined) {
      pushFinding(findings, {
        code: 'unsupported_provider_contract',
        path: INPUT_REQUIRED_KEYS[i],
        detail: 'required_key_missing'
      });
    }
  }
  if (
    normalizeTrim(src.providerContractVersion) !==
    SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION
  ) {
    pushFinding(findings, {
      code: 'unsupported_provider_contract',
      path: 'providerContractVersion',
      expected: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
      actual: src.providerContractVersion
    });
  }

  const identity = validateIdentitySnapshot(src.approvedIdentitySnapshot, findings);
  const configRef = normalizeTrim(src.providerConfigurationReference);
  if (!configRef || /secret|token|api[_-]?key/i.test(configRef)) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'providerConfigurationReference',
      detail: 'non_secret_reference_required'
    });
  }

  const expectedQpFp = normalizeTrim(src.expectedQueryPlanFingerprint);
  const assignmentProbe = asObject(src.approvedAssignmentSnapshot) || {};
  const queryPlan = identity
    ? validateQueryPlan(
        src.sourceScoutQueryPlan,
        expectedQpFp,
        identity,
        {
          targetRegion: assignmentProbe.targetRegion
        },
        findings
      )
    : null;

  const assignment =
    identity && queryPlan
      ? validateAssignmentSnapshot(src.approvedAssignmentSnapshot, identity, queryPlan, configRef, findings)
      : null;

  const networkPolicy = validateNetworkPolicy(src.networkPolicy, findings);
  const sourcePolicy = validateSourcePolicy(src.sourcePolicy, findings);
  const executionBudget = assignment
    ? validateExecutionBudget(src.executionBudget, assignment.maximumCandidateSources, findings)
    : null;
  const languagePolicy =
    assignment && queryPlan
      ? validateLanguagePolicy(src.languagePolicy, assignment.targetRegion, findings)
      : null;
  const extractionPolicy = validateExtractionPolicy(src.extractionPolicy, findings);

  const hard = findings.filter(function (f) {
    return f.severity === 'error';
  });
  if (
    hard.length ||
    !identity ||
    !assignment ||
    !queryPlan ||
    !networkPolicy ||
    !sourcePolicy ||
    !executionBudget ||
    !languagePolicy ||
    !extractionPolicy
  ) {
    return freezeDeep({ ok: false, normalized: null, findings: sortFindings(findings) });
  }

  const normalized = freezeDeep({
    providerContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
    sourceScoutQueryPlan: queryPlan,
    expectedQueryPlanFingerprint: expectedQpFp,
    approvedAssignmentSnapshot: assignment,
    approvedIdentitySnapshot: identity,
    providerConfigurationReference: configRef,
    networkPolicy: networkPolicy,
    sourcePolicy: sourcePolicy,
    executionBudget: executionBudget,
    languagePolicy: languagePolicy,
    extractionPolicy: extractionPolicy,
    expectedProviderInputFingerprint: normalizeTrim(src.expectedProviderInputFingerprint)
  });

  return freezeDeep({ ok: true, normalized: normalized, findings: sortFindings(findings) });
}

export function validateReviewedDataLiveSourceProviderInput(input) {
  return normalizeReviewedDataLiveSourceProviderInput(input);
}

export function buildReviewedDataLiveSourceProviderInputFingerprint(input) {
  const n = normalizeReviewedDataLiveSourceProviderInput(input);
  if (!n.ok || !n.normalized) return null;
  const body = {
    providerVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_VERSION,
    providerContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
    providerResultContractVersion: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_RESULT_CONTRACT_VERSION,
    capability: SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CAPABILITY,
    peerVersions: {
      sourceScoutVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_VERSION,
      sourceScoutContractVersion: SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
      sourceCaptureContractVersion: SR_REVIEWED_DATA_SOURCE_CAPTURE_CONTRACT_VERSION
    },
    queryPlanFingerprint: n.normalized.expectedQueryPlanFingerprint,
    identitySnapshot: n.normalized.approvedIdentitySnapshot,
    assignmentSnapshot: n.normalized.approvedAssignmentSnapshot,
    providerConfigurationReference: n.normalized.providerConfigurationReference,
    networkPolicy: n.normalized.networkPolicy,
    sourcePolicy: n.normalized.sourcePolicy,
    executionBudget: n.normalized.executionBudget,
    languagePolicy: n.normalized.languagePolicy,
    extractionPolicy: n.normalized.extractionPolicy
  };
  return 'lsp-input|' + fnv1a(stableSerialize(body)) + '|' + stableSerialize(body).length;
}

function buildNormalizedRunFingerprint(parts) {
  return (
    'lsp-run|' +
    fnv1a(
      stableSerialize({
        queryRefs: parts.queryRefs,
        urls: parts.urls,
        contentHashes: parts.contentHashes,
        metadata: parts.metadata,
        accessibility: parts.accessibility,
        truncation: parts.truncation,
        hostile: parts.hostile,
        findings: parts.findings,
        warnings: parts.warnings,
        usageMeaning: parts.usageMeaning
      })
    )
  );
}

function buildReplayFingerprint(parts) {
  return (
    'lsp-replay|' +
    fnv1a(
      stableSerialize({
        searchExecutorVersion: parts.searchExecutorVersion,
        fetchExecutorVersion: parts.fetchExecutorVersion,
        replayResultIds: parts.replayResultIds,
        replayHashes: parts.replayHashes,
        discoveryIds: parts.discoveryIds,
        status: parts.status
      })
    )
  );
}

function mapSourceClass(hint) {
  if (SR_EVIDENCE_SOURCE_TYPES.indexOf(hint) >= 0) return hint;
  return 'other';
}

function domainAllowed(host, sourcePolicy) {
  const h = normalizeKey(host);
  if (!h) return false;
  if (sourcePolicy.domainDenylist.indexOf(h) >= 0) return false;
  if (sourcePolicy.domainAllowlist.length && sourcePolicy.domainAllowlist.indexOf(h) < 0) {
    return false;
  }
  return true;
}

export function adaptLiveProviderResultsToSourceScoutDiscoveryResults(result) {
  const src = asObject(result);
  const list = src && Array.isArray(src.sourceScoutDiscoveryResults)
    ? src.sourceScoutDiscoveryResults
    : Array.isArray(result)
      ? result
      : [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const r = asObject(list[i]) || {};
    const adapted = {};
    for (let k = 0; k < SCOUT_DISCOVERY_KEYS.length; k++) {
      const key = SCOUT_DISCOVERY_KEYS[k];
      if (key === 'declaredClaimSpans') {
        adapted[key] = [];
      } else if (key === 'hostileContentFlags') {
        adapted[key] = Array.isArray(r[key])
          ? r[key].filter(function (f) {
              return HOSTILE_SCOUT_FLAGS.indexOf(f) >= 0;
            })
          : [];
      } else if (key === 'fieldHints' || key === 'contextHints') {
        adapted[key] = r[key] == null ? (key === 'fieldHints' ? [] : null) : cloneJson(r[key]);
      } else {
        adapted[key] = r[key] === undefined ? null : cloneJson(r[key]);
      }
    }
    // Drop any provider-only keys by reconstructing exact key set only.
    out.push(freezeDeep(adapted));
  }
  return freezeDeep(out);
}

function buildSyntheticResultId(normalizedUrl, metaFp, contentFp, resultId) {
  return (
    'lsp-synth:' +
    fnv1a(
      stableSerialize({
        url: normalizedUrl,
        meta: metaFp,
        content: contentFp,
        resultId: resultId || null
      })
    )
  );
}

function validateExecutors(executors, findings) {
  const o = asObject(executors);
  if (!o) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'executors',
      detail: 'missing'
    });
    return null;
  }
  assertExactKeys(o, EXECUTOR_ALLOWED_KEYS, 'executors', findings, 'unknown_provider_input_key');
  if (typeof o.searchExecutor !== 'function' || typeof o.fetchExecutor !== 'function') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'executors.search_or_fetch',
      detail: 'required_mock_replay_functions'
    });
    return null;
  }
  if (o.extractionExecutor !== undefined) {
    pushFinding(findings, {
      code: 'external_model_unavailable',
      path: 'executors.extractionExecutor',
      detail: 'extraction_disabled'
    });
    return null;
  }
  if (o.usageReporter !== undefined && typeof o.usageReporter !== 'function') {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: 'executors.usageReporter',
      detail: 'must_be_function'
    });
    return null;
  }
  return {
    searchExecutor: o.searchExecutor,
    fetchExecutor: o.fetchExecutor,
    cancellationSignal: o.cancellationSignal || null,
    usageReporter: typeof o.usageReporter === 'function' ? o.usageReporter : null
  };
}

export function prepareReviewedDataLiveSourceProviderDiscovery(input, executors) {
  const findings = [];
  const warnings = [];
  const usage = buildEmptyUsage();
  const beforeInput = stableSerialize(input);
  let inputFingerprint = null;

  try {
    const exec = validateExecutors(executors, findings);
    const norm = normalizeReviewedDataLiveSourceProviderInput(input);
    findings.push.apply(findings, norm.findings || []);

    if (!norm.ok || !norm.normalized || !exec) {
      const status = resolveStatus({
        provider_failed: findings.some(function (f) {
          return f.code === 'provider_failed';
        }),
        provider_input_invalid: true,
        provider_configuration_blocked: findings.some(function (f) {
          return (
            f.code === 'unsupported_provider_configuration' ||
            f.code === 'secret_material_detected' ||
            f.code === 'external_model_unavailable'
          );
        }),
        query_plan_invalid: findings.some(function (f) {
          return f.code === 'invalid_query_plan_fingerprint';
        }),
        budget_blocked: findings.some(function (f) {
          return f.code === 'budget_exceeded';
        })
      });
      return buildResultSkeleton({
        status: status,
        findings: findings,
        warnings: warnings,
        usageSummary: usage,
        mutationCheck: {
          inputMutated: stableSerialize(input) !== beforeInput,
          executorOutputMutated: false,
          resultMutated: false
        }
      });
    }

    const n = norm.normalized;
    inputFingerprint = buildReviewedDataLiveSourceProviderInputFingerprint(input);
    if (
      n.expectedProviderInputFingerprint &&
      n.expectedProviderInputFingerprint !== inputFingerprint
    ) {
      pushFinding(findings, {
        code: 'unsupported_provider_configuration',
        path: 'expectedProviderInputFingerprint',
        detail: 'input_fingerprint_mismatch',
        expected: inputFingerprint,
        actual: n.expectedProviderInputFingerprint
      });
      return buildResultSkeleton({
        status: 'provider_configuration_blocked',
        findings: findings,
        warnings: warnings,
        usageSummary: usage,
        inputFingerprint: inputFingerprint,
        assignmentReference: {
          assignmentId: n.approvedAssignmentSnapshot.assignmentId,
          assignmentFingerprint: n.approvedAssignmentSnapshot.assignmentFingerprint
        },
        queryPlanReference: {
          queryPlanFingerprint: n.expectedQueryPlanFingerprint
        },
        providerConfigurationReference: n.providerConfigurationReference
      });
    }

    usage.assignments = 1;
    const templates = n.sourceScoutQueryPlan.queryTemplates.slice(
      0,
      n.executionBudget.searchCalls
    );
    const searchRefs = [];
    const candidateMap = Object.create(null);
    const orderedCandidates = [];
    const rejectedEarly = [];
    let searchUnavailable = false;
    let rateLimited = false;
    let timedOut = false;

    for (let qi = 0; qi < templates.length; qi++) {
      if (usage.searchExecutorCalls >= n.executionBudget.searchCalls) {
        pushFinding(findings, {
          code: 'budget_exceeded',
          path: 'executionBudget.searchCalls',
          detail: 'search_cap'
        });
        break;
      }
      usage.queriesAttempted += 1;
      usage.searchExecutorCalls += 1;
      const searchIn = freezeDeep({
        queryPlanReference: {
          queryPlanFingerprint: n.expectedQueryPlanFingerprint,
          canonicalKey: n.sourceScoutQueryPlan.canonicalKey,
          targetField: n.sourceScoutQueryPlan.targetField
        },
        queryTemplate: templates[qi],
        queryIndex: qi,
        sourcePolicyReference: {
          publicUnauthenticatedOnly: true,
          permittedMime: n.sourcePolicy.permittedMime.slice()
        },
        effectiveBudgetReference: {
          searchCalls: n.executionBudget.searchCalls,
          candidateUrls: n.executionBudget.candidateUrls,
          fetchCalls: n.executionBudget.fetchCalls
        },
        cancellationReference: exec.cancellationSignal
          ? { cancelled: !!(exec.cancellationSignal.cancelled || exec.cancellationSignal.aborted) }
          : { cancelled: false }
      });
      let searchOut;
      try {
        searchOut = exec.searchExecutor(searchIn);
      } catch (_e) {
        searchUnavailable = true;
        pushFinding(findings, {
          code: 'unsupported_provider_configuration',
          path: 'searchExecutor',
          detail: 'executor_threw'
        });
        break;
      }
      if (exec.usageReporter) {
        try {
          exec.usageReporter({ phase: 'search', queryIndex: qi });
        } catch (_e2) {
          /* ignore reporter errors */
        }
      }
      const so = asObject(searchOut) || {};
      if (so.executionMode !== 'mock_or_replay') {
        searchUnavailable = true;
        pushFinding(findings, {
          code: 'unsupported_provider_configuration',
          path: 'searchExecutor.executionMode',
          detail: 'mock_or_replay_required'
        });
        break;
      }
      searchRefs.push(
        freezeDeep({
          queryIndex: qi,
          queryTemplate: templates[qi],
          executorVersion: normalizeTrim(so.executorVersion),
          providerRequestReference: normalizeTrim(so.providerRequestReference),
          resultCount: Array.isArray(so.results) ? so.results.length : 0
        })
      );
      if (asObject(so.rateLimit) && so.rateLimit.limited === true) {
        rateLimited = true;
        usage.rateLimitEvents += 1;
        pushFinding(findings, {
          code: 'rate_limited',
          path: 'searchExecutor[' + qi + ']',
          detail: 'rate_limit'
        });
      }
      if (Array.isArray(so.errors)) {
        for (let e = 0; e < so.errors.length; e++) {
          const err = asObject(so.errors[e]) || {};
          if (err.code === 'timeout') {
            timedOut = true;
            pushFinding(findings, {
              code: 'timeout',
              path: 'searchExecutor[' + qi + ']',
              detail: 'search_timeout'
            });
          }
        }
      }
      const results = Array.isArray(so.results) ? so.results : [];
      for (let ri = 0; ri < results.length; ri++) {
        if (orderedCandidates.length >= n.executionBudget.candidateUrls) {
          pushFinding(findings, {
            code: 'budget_exceeded',
            path: 'executionBudget.candidateUrls',
            detail: 'candidate_cap'
          });
          break;
        }
        const rr = asObject(results[ri]) || {};
        const rid = normalizeTrim(rr.resultId) || 'sr-' + qi + '-' + ri;
        const urlInfo = normalizeProviderUrl(
          rr.url,
          findings,
          'searchExecutor[' + qi + '].results[' + ri + '].url'
        );
        if (!urlInfo) {
          rejectedEarly.push(
            freezeDeep({
              resultId: rid,
              url: normalizeTrim(rr.url),
              reason: 'url_policy_blocked'
            })
          );
          continue;
        }
        if (!domainAllowed(urlInfo.host, n.sourcePolicy)) {
          pushFinding(findings, {
            code: 'robots_or_source_policy_blocked',
            path: 'searchExecutor[' + qi + '].results[' + ri + '].url',
            detail: 'domain_policy'
          });
          rejectedEarly.push(
            freezeDeep({
              resultId: rid,
              url: urlInfo.normalized,
              reason: 'robots_or_source_policy_blocked'
            })
          );
          continue;
        }
        usage.candidateUrls += 1;
        const cand = freezeDeep({
          resultId: rid,
          url: urlInfo.normalized,
          urlFingerprint: urlInfo.fingerprint,
          title: normalizeTrim(rr.title),
          publisher: normalizeTrim(rr.publisher),
          snippet: normalizeTrim(rr.snippet),
          language: normalizeTrim(rr.language) || 'en',
          sourceClassHint: mapSourceClass(normalizeTrim(rr.sourceClassHint) || 'other'),
          rank: typeof rr.rank === 'number' ? rr.rank : ri,
          queryIndex: qi,
          metadata: asObject(rr.metadata) ? freezeDeep(cloneJson(rr.metadata)) : null
        });
        if (candidateMap[urlInfo.normalized]) {
          usage.duplicateUrls += 1;
          pushFinding(warnings, {
            code: 'duplicate_url',
            path: 'candidates',
            detail: urlInfo.normalized
          });
          rejectedEarly.push(
            freezeDeep({
              resultId: rid,
              url: urlInfo.normalized,
              reason: 'duplicate_url'
            })
          );
          continue;
        }
        candidateMap[urlInfo.normalized] = cand;
        orderedCandidates.push(cand);
      }
    }

    const rejected = rejectedEarly.slice();
    const acceptedRaw = [];
    const fetchRefs = [];
    const seenContent = Object.create(null);
    let retrievalBlocked = false;

    const fetchTargets = [];
    const seenFetchUrl = Object.create(null);
    for (let i = 0; i < orderedCandidates.length; i++) {
      const c = orderedCandidates[i];
      if (seenFetchUrl[c.url]) continue;
      seenFetchUrl[c.url] = true;
      fetchTargets.push(c);
    }

    for (let fi = 0; fi < fetchTargets.length; fi++) {
      if (usage.fetchExecutorCalls >= n.executionBudget.fetchCalls) {
        pushFinding(findings, {
          code: 'budget_exceeded',
          path: 'executionBudget.fetchCalls',
          detail: 'fetch_cap'
        });
        break;
      }
      const cand = fetchTargets[fi];
      usage.fetchExecutorCalls += 1;
      const fetchIn = freezeDeep({
        normalizedUrl: cand.url,
        urlFingerprint: cand.urlFingerprint,
        sourcePolicyReference: {
          publicUnauthenticatedOnly: true,
          permittedMime: n.sourcePolicy.permittedMime.slice()
        },
        networkPolicyReference: {
          executionMode: 'mock_or_replay_only',
          maximumRedirects: n.networkPolicy.maximumRedirects,
          connectTimeoutMs: n.networkPolicy.connectTimeoutMs,
          readTimeoutMs: n.networkPolicy.readTimeoutMs
        },
        byteBudget: n.executionBudget.bytesPerResponse,
        timeoutBudget: {
          connectTimeoutMs: n.networkPolicy.connectTimeoutMs,
          readTimeoutMs: n.networkPolicy.readTimeoutMs
        },
        cancellationReference: exec.cancellationSignal
          ? { cancelled: !!(exec.cancellationSignal.cancelled || exec.cancellationSignal.aborted) }
          : { cancelled: false }
      });
      let fetchOut;
      try {
        fetchOut = exec.fetchExecutor(fetchIn);
      } catch (_e) {
        usage.failedFetches += 1;
        pushFinding(findings, {
          code: 'inaccessible_source',
          path: 'fetchExecutor[' + fi + ']',
          detail: 'executor_threw'
        });
        rejected.push(
          freezeDeep({
            resultId: cand.resultId,
            url: cand.url,
            reason: 'inaccessible_source'
          })
        );
        continue;
      }
      if (exec.usageReporter) {
        try {
          exec.usageReporter({ phase: 'fetch', url: cand.url });
        } catch (_e3) {
          /* ignore */
        }
      }
      const fo = asObject(fetchOut) || {};
      if (fo.executionMode !== 'mock_or_replay') {
        retrievalBlocked = true;
        pushFinding(findings, {
          code: 'unsupported_provider_configuration',
          path: 'fetchExecutor.executionMode',
          detail: 'mock_or_replay_required'
        });
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'execution_mode' })
        );
        continue;
      }

      const redirectChain = Array.isArray(fo.redirectChain) ? fo.redirectChain : [];
      usage.redirects += redirectChain.length;
      if (redirectChain.length > n.executionBudget.redirects) {
        pushFinding(findings, {
          code: 'unsafe_redirect',
          path: 'fetchExecutor[' + fi + '].redirectChain',
          detail: 'too_many_redirects'
        });
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'unsafe_redirect' })
        );
        continue;
      }
      let redirectBlocked = false;
      for (let rd = 0; rd < redirectChain.length; rd++) {
        const rUrl = normalizeProviderUrl(
          redirectChain[rd],
          findings,
          'fetchExecutor[' + fi + '].redirectChain[' + rd + ']'
        );
        if (!rUrl) {
          pushFinding(findings, {
            code: 'unsafe_redirect',
            path: 'fetchExecutor[' + fi + '].redirectChain[' + rd + ']',
            detail: 'blocked_redirect_target'
          });
          redirectBlocked = true;
          break;
        }
      }
      if (redirectBlocked) {
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'unsafe_redirect' })
        );
        continue;
      }

      if (Array.isArray(fo.resolvedAddresses)) {
        for (let ra = 0; ra < fo.resolvedAddresses.length; ra++) {
          const addr = normalizeTrim(fo.resolvedAddresses[ra]);
          if (addr && isBlockedHost(addr)) {
            pushFinding(findings, {
              code: 'private_network_target',
              path: 'fetchExecutor[' + fi + '].resolvedAddresses[' + ra + ']',
              detail: 'replay_resolved_address_blocked'
            });
            redirectBlocked = true;
          }
        }
      }
      if (redirectBlocked) {
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({
            resultId: cand.resultId,
            url: cand.url,
            reason: 'private_network_target'
          })
        );
        continue;
      }

      fetchRefs.push(
        freezeDeep({
          resultId: cand.resultId,
          requestedUrl: cand.url,
          finalUrl: normalizeTrim(fo.finalUrl) || cand.url,
          executorVersion: normalizeTrim(fo.executorVersion),
          status: fo.status,
          contentType: normalizeTrim(fo.contentType),
          bytesRead: typeof fo.bytesRead === 'number' ? fo.bytesRead : 0
        })
      );

      if (Array.isArray(fo.errors)) {
        for (let ee = 0; ee < fo.errors.length; ee++) {
          const err = asObject(fo.errors[ee]) || {};
          const code = normalizeTrim(err.code);
          if (code === 'timeout') {
            timedOut = true;
            pushFinding(findings, {
              code: 'timeout',
              path: 'fetchExecutor[' + fi + ']',
              detail: 'fetch_timeout'
            });
          }
          if (code === 'rate_limited') {
            rateLimited = true;
            usage.rateLimitEvents += 1;
            pushFinding(findings, {
              code: 'rate_limited',
              path: 'fetchExecutor[' + fi + ']',
              detail: 'fetch_rate_limit'
            });
          }
          if (code === 'authentication_required') {
            pushFinding(findings, {
              code: 'authentication_required',
              path: 'fetchExecutor[' + fi + ']'
            });
          }
          if (code === 'paywall_or_captcha') {
            pushFinding(findings, {
              code: 'paywall_or_captcha',
              path: 'fetchExecutor[' + fi + ']'
            });
          }
          if (code === 'robots_or_source_policy_blocked') {
            pushFinding(findings, {
              code: 'robots_or_source_policy_blocked',
              path: 'fetchExecutor[' + fi + ']'
            });
          }
          if (code === 'inaccessible_source') {
            pushFinding(findings, {
              code: 'inaccessible_source',
              path: 'fetchExecutor[' + fi + ']'
            });
          }
        }
      }

      const bytes = typeof fo.bytesRead === 'number' ? fo.bytesRead : 0;
      if (bytes > n.executionBudget.bytesPerResponse) {
        pushFinding(findings, {
          code: 'response_too_large',
          path: 'fetchExecutor[' + fi + '].bytesRead',
          actual: bytes
        });
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'response_too_large' })
        );
        continue;
      }
      if (usage.bytesRetrieved + bytes > n.executionBudget.totalBytes) {
        pushFinding(findings, {
          code: 'budget_exceeded',
          path: 'executionBudget.totalBytes',
          detail: 'total_bytes_cap'
        });
        break;
      }
      usage.bytesRetrieved += bytes;

      const access = normalizeTrim(fo.accessibilityState) || 'accessible';
      if (access !== 'accessible' || fo.status === 0 || (typeof fo.status === 'number' && fo.status >= 400)) {
        usage.failedFetches += 1;
        const reason =
          access === 'authentication_required'
            ? 'authentication_required'
            : access === 'paywall_or_captcha'
              ? 'paywall_or_captcha'
              : 'inaccessible_source';
        pushFinding(findings, { code: reason, path: 'fetchExecutor[' + fi + ']' });
        rejected.push(freezeDeep({ resultId: cand.resultId, url: cand.url, reason: reason }));
        continue;
      }

      const content = normalizeContent(fo, findings, 'fetchExecutor[' + fi + ']');
      if (!content) {
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'unsupported_mime' })
        );
        continue;
      }
      if (content.truncated) usage.truncatedSources += 1;

      const locator = normalizeTrim(fo.sourceLocator);
      if (!locator) {
        pushFinding(findings, {
          code: 'missing_locator',
          path: 'fetchExecutor[' + fi + '].sourceLocator'
        });
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({ resultId: cand.resultId, url: cand.url, reason: 'missing_locator' })
        );
        continue;
      }

      const hostile = detectHostileFlags(content.text).concat(
        Array.isArray(fo.hostileIndicators) ? fo.hostileIndicators : []
      ).filter(function (f, idx, arr) {
        return HOSTILE_SCOUT_FLAGS.indexOf(f) >= 0 && arr.indexOf(f) === idx;
      });
      if (hostile.length) {
        pushFinding(findings, {
          code: 'hostile_content',
          path: 'fetchExecutor[' + fi + ']',
          detail: hostile.join(',')
        });
      }

      const probableCopyOf = normalizeTrim(fo.probableCopyOf) || null;
      const finalUrlInfo = normalizeProviderUrl(
        fo.finalUrl || cand.url,
        findings,
        'fetchExecutor[' + fi + '].finalUrl'
      );
      const finalUrl = finalUrlInfo ? finalUrlInfo.normalized : cand.url;

      const metaBase = {
        url: finalUrl,
        publisher: normalizeTrim(fo.publisher) || cand.publisher,
        title: normalizeTrim(fo.title) || cand.title,
        author: normalizeTrim(fo.author),
        publicationDate: normalizeTrim(fo.publicationDate),
        lastUpdatedDate: normalizeTrim(fo.lastUpdatedDate),
        language: normalizeTrim(fo.language) || cand.language || 'en',
        sourceClass: mapSourceClass(
          normalizeTrim(fo.sourceClassHint) || cand.sourceClassHint || 'other'
        ),
        sourceLocator: locator,
        geographicScope: normalizeTrim(fo.geographicScope) || 'global',
        plantIdentityScope: normalizeTrim(fo.plantIdentityScope) || 'species',
        fieldHints: Array.isArray(fo.fieldHints)
          ? fo.fieldHints.slice()
          : [n.approvedAssignmentSnapshot.targetField],
        contextHints: fo.contextHints || n.approvedAssignmentSnapshot.targetContext,
        accessibilityState: 'accessible',
        probableCopyOf: probableCopyOf,
        hostileContentFlags: hostile
      };
      const metaFp = buildSourceScoutSourceFingerprint({
        url: metaBase.url,
        publisher: metaBase.publisher,
        title: metaBase.title,
        author: metaBase.author,
        publicationDate: metaBase.publicationDate,
        lastUpdatedDate: metaBase.lastUpdatedDate,
        language: metaBase.language,
        sourceClass: metaBase.sourceClass,
        sourceLocator: metaBase.sourceLocator,
        geographicScope: metaBase.geographicScope,
        plantIdentityScope: metaBase.plantIdentityScope
      });
      const cFp = buildSourceScoutContentFingerprint(content.text);
      const synthId = buildSyntheticResultId(finalUrl, metaFp, cFp, cand.resultId);

      if (hostile.length) {
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({
            resultId: cand.resultId,
            url: finalUrl,
            reason: 'hostile_content',
            syntheticResultId: synthId,
            hostileContentFlags: hostile
          })
        );
        continue;
      }

      const priorSameHash = seenContent[content.contentHash] || null;
      if (probableCopyOf || priorSameHash) {
        pushFinding(warnings, {
          code: 'probable_copied_source',
          path: 'fetchExecutor[' + fi + ']',
          detail: probableCopyOf || priorSameHash
        });
        usage.failedFetches += 1;
        rejected.push(
          freezeDeep({
            resultId: cand.resultId,
            url: finalUrl,
            reason: 'probable_copied_source',
            syntheticResultId: synthId,
            probableCopyOf: probableCopyOf || priorSameHash
          })
        );
        continue;
      }
      seenContent[content.contentHash] = cand.resultId;

      usage.successfulFetches += 1;
      acceptedRaw.push(
        freezeDeep({
          syntheticResultId: synthId,
          url: finalUrl,
          publisher: metaBase.publisher,
          title: metaBase.title,
          author: metaBase.author,
          publicationDate: metaBase.publicationDate,
          lastUpdatedDate: metaBase.lastUpdatedDate,
          language: metaBase.language,
          sourceClass: metaBase.sourceClass,
          sourceText: content.text,
          sourceLocator: locator,
          geographicScope: metaBase.geographicScope,
          plantIdentityScope: metaBase.plantIdentityScope,
          fieldHints: metaBase.fieldHints,
          contextHints: metaBase.contextHints,
          accessibilityState: 'accessible',
          probableCopyOf: null,
          hostileContentFlags: [],
          declaredClaimSpans: [],
          _contentHash: content.contentHash,
          _resultId: cand.resultId,
          _truncated: content.truncated
        })
      );
    }

    pushFinding(warnings, {
      code: 'extraction_unavailable',
      detail: 'extraction_capability_disabled',
      severity: 'info'
    });
    pushFinding(warnings, {
      code: 'product_authority_not_granted',
      detail: 'authority_boundary_false',
      severity: 'info'
    });

    const discovery = acceptedRaw.map(function (r) {
      const d = {};
      for (let k = 0; k < SCOUT_DISCOVERY_KEYS.length; k++) {
        d[SCOUT_DISCOVERY_KEYS[k]] = r[SCOUT_DISCOVERY_KEYS[k]];
      }
      return freezeDeep(d);
    });

    if (discovery.length >= 2) {
      pushFinding(warnings, {
        code: 'results_prepared_for_scout',
        detail: 'count_' + discovery.length,
        severity: 'info'
      });
    } else if (discovery.length === 0 && orderedCandidates.length === 0) {
      pushFinding(warnings, {
        code: 'no_relevant_sources',
        detail: 'no_search_results',
        severity: 'info'
      });
    }

    const failedFetchesPresent = usage.failedFetches > 0;
    if (failedFetchesPresent && discovery.length > 0) {
      pushFinding(warnings, {
        code: 'partial_results',
        detail: 'some_fetches_rejected',
        severity: 'info'
      });
    }

    usage.budgetRemaining = freezeDeep({
      searchCalls: Math.max(0, n.executionBudget.searchCalls - usage.searchExecutorCalls),
      fetchCalls: Math.max(0, n.executionBudget.fetchCalls - usage.fetchExecutorCalls),
      candidateUrls: Math.max(0, n.executionBudget.candidateUrls - usage.candidateUrls),
      totalBytes: Math.max(0, n.executionBudget.totalBytes - usage.bytesRetrieved)
    });
    usage.estimatedCostUsd = 0;
    usage.realNetworkCalls = 0;
    usage.realExternalModelCalls = 0;
    usage.extractionExecutorCalls = 0;

    const flags = {
      provider_failed: false,
      provider_input_invalid: false,
      provider_configuration_blocked: false,
      query_plan_invalid: false,
      budget_blocked: findings.some(function (f) {
        return f.code === 'budget_exceeded';
      }),
      search_unavailable: searchUnavailable,
      retrieval_blocked:
        retrievalBlocked ||
        findings.some(function (f) {
          return (
            f.code === 'blocked_url_scheme' ||
            f.code === 'private_network_target' ||
            f.code === 'unsafe_redirect'
          );
        }) && discovery.length === 0,
      no_results: !searchUnavailable && orderedCandidates.length === 0,
      extraction_incomplete: false,
      partial_retrieval: discovery.length > 0 && failedFetchesPresent,
      human_review_required: false,
      results_ready_for_source_scout: discovery.length >= 2 && !searchUnavailable && !rateLimited && !timedOut
    };

    if (rateLimited && discovery.length < 2) flags.search_unavailable = false;
    if (rateLimited) {
      // rate_limited is a hard finding; prefer search_unavailable/retrieval path via findings
      if (discovery.length < 2) flags.no_results = orderedCandidates.length === 0;
    }
    if (timedOut && discovery.length < 2) {
      flags.partial_retrieval = discovery.length > 0;
    }

    // Hard finding codes that force higher-priority statuses.
    if (findings.some(function (f) { return f.code === 'budget_exceeded'; })) {
      flags.budget_blocked = true;
      flags.results_ready_for_source_scout = false;
    }
    if (findings.some(function (f) { return f.code === 'rate_limited'; }) && discovery.length < 2) {
      flags.search_unavailable = true;
      flags.results_ready_for_source_scout = false;
    }
    if (findings.some(function (f) { return f.code === 'timeout'; }) && discovery.length < 2) {
      if (discovery.length === 0) flags.retrieval_blocked = true;
      flags.results_ready_for_source_scout = false;
    }

    let status = resolveStatus(flags);
    if (discovery.length >= 2 && !flags.budget_blocked && !flags.search_unavailable) {
      const blockingHard = findings.some(function (f) {
        return (
          f.severity === 'error' &&
          [
            'budget_exceeded',
            'rate_limited',
            'timeout',
            'unsupported_provider_configuration',
            'unsupported_provider_contract',
            'invalid_query_plan_fingerprint',
            'secret_material_detected',
            'external_model_unavailable'
          ].indexOf(f.code) >= 0
        );
      });
      if (!blockingHard) {
        status = 'results_ready_for_source_scout';
      }
    }

    const runFp = buildNormalizedRunFingerprint({
      queryRefs: searchRefs.map(function (r) {
        return { queryIndex: r.queryIndex, queryTemplate: r.queryTemplate };
      }),
      urls: discovery.map(function (d) {
        return d.url;
      }),
      contentHashes: acceptedRaw.map(function (r) {
        return r._contentHash;
      }),
      metadata: discovery.map(function (d) {
        return {
          publisher: d.publisher,
          title: d.title,
          sourceClass: d.sourceClass,
          sourceLocator: d.sourceLocator
        };
      }),
      accessibility: discovery.map(function (d) {
        return d.accessibilityState;
      }),
      truncation: acceptedRaw.map(function (r) {
        return !!r._truncated;
      }),
      hostile: rejected
        .filter(function (r) {
          return r.reason === 'hostile_content';
        })
        .map(function (r) {
          return r.hostileContentFlags;
        }),
      findings: sortFindings(findings).map(function (f) {
        return { code: f.code, path: f.path, detail: f.detail };
      }),
      warnings: sortFindings(warnings).map(function (f) {
        return { code: f.code, path: f.path, detail: f.detail };
      }),
      usageMeaning: {
        searchExecutorCalls: usage.searchExecutorCalls,
        fetchExecutorCalls: usage.fetchExecutorCalls,
        successfulFetches: usage.successfulFetches,
        failedFetches: usage.failedFetches,
        duplicateUrls: usage.duplicateUrls,
        bytesRetrieved: usage.bytesRetrieved,
        realNetworkCalls: 0,
        realExternalModelCalls: 0,
        estimatedCostUsd: 0
      }
    });

    const replayFp = buildReplayFingerprint({
      searchExecutorVersion: searchRefs[0] ? searchRefs[0].executorVersion : null,
      fetchExecutorVersion: fetchRefs[0] ? fetchRefs[0].executorVersion : null,
      replayResultIds: orderedCandidates.map(function (c) {
        return c.resultId;
      }).sort(),
      replayHashes: acceptedRaw.map(function (r) {
        return r._contentHash;
      }).sort(),
      discoveryIds: discovery.map(function (d) {
        return d.syntheticResultId;
      }).sort(),
      status: status
    });

    const afterInput = stableSerialize(input);
    return buildResultSkeleton({
      status: status,
      assignmentReference: freezeDeep({
        assignmentId: n.approvedAssignmentSnapshot.assignmentId,
        assignmentFingerprint: n.approvedAssignmentSnapshot.assignmentFingerprint,
        canonicalKey: n.approvedAssignmentSnapshot.canonicalKey,
        targetField: n.approvedAssignmentSnapshot.targetField
      }),
      queryPlanReference: freezeDeep({
        queryPlanFingerprint: n.expectedQueryPlanFingerprint,
        queryTemplates: n.sourceScoutQueryPlan.queryTemplates.slice()
      }),
      providerConfigurationReference: n.providerConfigurationReference,
      searchExecutionReference: freezeDeep({
        calls: usage.searchExecutorCalls,
        references: searchRefs
      }),
      fetchExecutionReferences: fetchRefs,
      extractionExecutionReferences: [],
      sourceScoutDiscoveryResults: discovery,
      rejectedProviderResults: rejected,
      findings: findings,
      warnings: warnings,
      usageSummary: usage,
      inputFingerprint: inputFingerprint,
      normalizedRunFingerprint: runFp,
      replayFingerprint: replayFp,
      mutationCheck: {
        inputMutated: afterInput !== beforeInput,
        executorOutputMutated: false,
        resultMutated: false
      }
    });
  } catch (_err) {
    pushFinding(findings, {
      code: 'unsupported_provider_configuration',
      path: null,
      detail: 'provider_failed_internal'
    });
    return buildResultSkeleton({
      status: 'provider_failed',
      findings: findings,
      warnings: warnings,
      usageSummary: usage,
      inputFingerprint: inputFingerprint,
      mutationCheck: {
        inputMutated: stableSerialize(input) !== beforeInput,
        executorOutputMutated: false,
        resultMutated: false
      }
    });
  }
}

// Ensure assignment fingerprint helper remains available for harness peer binding checks.
export { buildSourceScoutAssignmentFingerprint };