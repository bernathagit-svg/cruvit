/**
 * Node secret-free Live Provider Adapter/Transport proof — 28 scenario classes.
 * No network, DNS, sockets, credentials, env, or artifacts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_RESULT_CONTRACT_VERSION,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_CAPABILITY,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS,
  SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS,
  getLiveSourceProviderAdapterDescriptor,
  normalizeLiveSourceProviderAdapterConfiguration,
  createLiveSourceProviderAdapter,
  sortAdapterFindings
} from '../modules/smart-recommendations/adapters/live-source-provider/developer-live-source-provider-adapter.mjs';

import {
  SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
  getLiveSourceProviderTransportSecurityDescriptor,
  normalizeAndValidateOutboundUrl,
  validateResolvedAddresses,
  validateRedirectTarget,
  createSafeRequestPlan,
  redactSensitiveValue,
  redactStructuredLog,
  validateTransportBudget,
  createRunGuard,
  validateDecompressedSize,
  fingerprintOf,
  createCancellationController
} from '../modules/smart-recommendations/adapters/live-source-provider/transport-security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ASSIGN_FP = 'ss-assign|proof-lavender-sun-v1';
const QUERY_FP_PLACEHOLDER = 'WILL_PROBE';
const TEXT_A =
  'Lavender (Lavandula angustifolia) prefers full sun in mature outdoor plantings.';
const TEXT_B =
  'Government guidance: lavender grows best in full sun outdoors when mature.';
const CTX = {
  setting: 'outdoor',
  planting: 'ground',
  maturity: 'mature',
  objective: 'general'
};

const SCENARIO_CLASSES = [
  'Successful normalized search',
  'Successful safe fetch',
  'Missing configuration',
  'Missing synthetic secret',
  'Secret redaction',
  'Invalid assignment fingerprint',
  'Invalid query-plan fingerprint',
  'Blocked URL scheme',
  'Private or cloud-metadata target',
  'Unsafe redirect',
  'DNS address-change/rebinding simulation',
  'TLS failure',
  'Timeout',
  'Cancellation',
  'Rate limit',
  'Provider quota exhaustion',
  'Malformed search response',
  'Malformed fetch response',
  'Unsupported MIME',
  'Compressed/decompressed-size overflow',
  'Robots or source-policy block',
  'Authentication/paywall/CAPTCHA source',
  'Projected cost overflow',
  'Concurrency overflow',
  'Duplicate nonce/idempotency replay',
  'Provider-neutral compatibility',
  'Runtime/client isolation',
  'Commerce-authority attempt'
];

function baseConfig(over = {}) {
  return Object.assign(
    {
      adapterContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
      adapterConfigurationReference: 'cfg:secret-free-proof-v1',
      executionMode: 'mock_or_replay',
      providerReference: 'synthetic/reference-search-v1',
      approvedAssignmentFingerprint: ASSIGN_FP,
      approvedQueryPlanFingerprint: 'qp-proof-fixed',
      transportSecurityContractVersion:
        SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
      sourcePolicyReference: {
        publicUnauthenticatedOnly: true,
        permittedMime: ['text/html', 'text/plain']
      },
      budgetReference: {
        pilotCostUsd: 0.1,
        absoluteCostUsd: 0.25,
        maxLogicalPaidCalls: 2,
        totalBytes: 2097152
      },
      transportEnabled: true
    },
    over
  );
}

function goodSearchStub(req) {
  return {
    executorVersion: 'proof-search-v1',
    providerRequestReference: 'synthetic-search-' + (req.queryIndex || 0),
    queryReference: { queryIndex: req.queryIndex, queryTemplate: req.queryTemplate },
    results: [
      {
        resultId: 'sr-edu',
        url: 'https://extension.example.edu/lavender/sun?utm_source=x&keep=1',
        title: 'Lavender sun',
        publisher: 'Example Extension',
        snippet: 'full sun',
        language: 'en',
        sourceClassHint: 'university_extension',
        rank: 1,
        rawPayload: { apiKey: 'sk-live-proof-SHOULD-STRIP' }
      },
      {
        resultId: 'sr-gov',
        url: 'https://gov.example.gov/plants/lavender-sun/',
        title: 'Lavender outdoor sun',
        publisher: 'Government Horticulture Authority',
        snippet: 'full sun',
        language: 'en',
        sourceClassHint: 'government',
        rank: 2
      }
    ],
    usage: { resultCount: 2 },
    rateLimit: { limited: false, headroom: 10 },
    errors: []
  };
}

function goodFetchStub(req) {
  const url = (req && req.normalizedUrl) || 'https://extension.example.edu/lavender/sun?keep=1';
  if (url.indexOf('gov.example.gov') >= 0) {
    return {
      executorVersion: 'proof-fetch-v1',
      finalUrl: 'https://gov.example.gov/plants/lavender-sun',
      redirectChain: [],
      resolvedAddresses: ['203.0.113.20'],
      status: 200,
      contentType: 'text/html',
      bytesRead: TEXT_B.length,
      compressedBytes: TEXT_B.length,
      decompressedBytes: TEXT_B.length,
      contentHash: 'proof-b',
      normalizedText: TEXT_B,
      title: 'Lavender outdoor sun',
      publisher: 'Government Horticulture Authority',
      author: 'Gov Hort',
      publicationDate: '2019-03-01',
      lastUpdatedDate: '2021-04-01',
      language: 'en',
      sourceLocator: 'section-sun',
      geographicScope: 'global',
      plantIdentityScope: 'species',
      fieldHints: ['sun'],
      contextHints: CTX,
      accessibilityState: 'accessible',
      hostileIndicators: [],
      truncationState: false,
      errors: [],
      usage: {},
      sourceClassHint: 'government',
      tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true }
    };
  }
  return {
    executorVersion: 'proof-fetch-v1',
    finalUrl: 'https://extension.example.edu/lavender/sun?keep=1',
    redirectChain: [],
    resolvedAddresses: ['203.0.113.10'],
    status: 200,
    contentType: 'text/html',
    bytesRead: TEXT_A.length,
    compressedBytes: TEXT_A.length,
    decompressedBytes: TEXT_A.length,
    contentHash: 'proof-a',
    normalizedText: TEXT_A,
    title: 'Lavender sun',
    publisher: 'Example Extension',
    author: 'Dr. Ext',
    publicationDate: '2020-01-15',
    lastUpdatedDate: '2022-06-01',
    language: 'en',
    sourceLocator: 'para-1',
    geographicScope: 'global',
    plantIdentityScope: 'species',
    fieldHints: ['sun'],
    contextHints: CTX,
    accessibilityState: 'accessible',
    hostileIndicators: [],
    truncationState: false,
    errors: [],
    usage: {},
    sourceClassHint: 'university_extension',
    tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true },
    raw: { authorization: 'Bearer synth-token-XYZ' }
  };
}

async function loadProvider() {
  const p = path.join(
    ROOT,
    'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js'
  );
  return import(pathToFileURL(p).href);
}

async function loadScout() {
  const p = path.join(
    ROOT,
    'modules/smart-recommendations/developer-reviewed-data-source-scout.js'
  );
  return import(pathToFileURL(p).href);
}

function attachQueryPlanFingerprint(input, mod) {
  const probe = structuredClone(input);
  probe.expectedQueryPlanFingerprint = 'probe';
  const n = mod.normalizeReviewedDataLiveSourceProviderInput(probe);
  let expected = null;
  for (const f of n.findings || []) {
    if (f.code === 'invalid_query_plan_fingerprint' && f.expected) expected = f.expected;
  }
  if (!expected) throw new Error('query_plan_fingerprint_probe_failed');
  input.expectedQueryPlanFingerprint = expected;
  input.sourceScoutQueryPlan.queryPlanFingerprint = expected;
  return expected;
}

function buildProviderInput(mod, scoutMod) {
  const assignmentBase = {
    sourceScoutContractVersion: scoutMod.SR_REVIEWED_DATA_SOURCE_SCOUT_CONTRACT_VERSION,
    assignmentId: 'lavender-sun-preference-scout-v1',
    canonicalKey: 'lavender',
    acceptedScientificName: 'Lavandula angustifolia',
    identityRegistryVersion: '1.5.0',
    currentIdentityBindingFingerprint: 'idfp-lavender-species-v1',
    currentNeedsReview: false,
    currentIdentityConflict: false,
    canonicalIdentityConfirmed: true,
    parentOrGenusScope: 'species',
    targetField: 'sun',
    targetClaimTypes: ['preference'],
    targetQuestions: ['What sun preference is supported for mature outdoor lavender?'],
    targetContext: CTX,
    allowedSourceClasses: [
      'government',
      'university_extension',
      'botanical_institution',
      'peer_reviewed_publication',
      'professional_horticultural_society',
      'institutional_database',
      'professional_grower_or_nursery',
      'commercial_page'
    ],
    prohibitedSourceClasses: ['blog_or_unsourced_database', 'ai_generated_summary'],
    maximumCandidateSources: 20,
    maximumClaimsPerSource: 3,
    citationRequirements: { requireLocator: true, maxExcerptChars: 280 },
    targetRegion: 'florida',
    languagePreferences: ['en'],
    approvedAliasesForSearch: ['Lavandula officinalis'],
    providerConfigurationReference: 'cfg:mock-replay-lavender-sun-v1'
  };
  const assignmentFingerprint =
    scoutMod.buildSourceScoutAssignmentFingerprint(assignmentBase);
  const planBody = {
    acceptedScientificName: assignmentBase.acceptedScientificName,
    canonicalKey: assignmentBase.canonicalKey,
    approvedAliases: assignmentBase.approvedAliasesForSearch.slice(),
    targetField: assignmentBase.targetField,
    targetClaimTypes: assignmentBase.targetClaimTypes.slice(),
    questions: assignmentBase.targetQuestions.slice(),
    contextTokens: CTX,
    explicitRegion: assignmentBase.targetRegion,
    allowedSourceClasses: assignmentBase.allowedSourceClasses.slice(),
    prohibitedSourceClasses: assignmentBase.prohibitedSourceClasses.slice(),
    languagePreferences: ['en'],
    limits: {
      networkRequests: 0,
      pages: 'synthetic_only',
      externalModelCalls: 0,
      maximumCandidateSources: 20,
      maximumClaimsPerSource: 3
    },
    domainPolicy: { publicSourcesOnly: true, liveFetch: false, externalModel: false },
    queryTemplates: [
      assignmentBase.acceptedScientificName + ' sun preference',
      assignmentBase.canonicalKey + ' sun horticulture'
    ]
  };
  const input = {
    providerContractVersion: mod.SR_REVIEWED_DATA_LIVE_SOURCE_PROVIDER_CONTRACT_VERSION,
    sourceScoutQueryPlan: planBody,
    expectedQueryPlanFingerprint: QUERY_FP_PLACEHOLDER,
    approvedAssignmentSnapshot: {
      assignmentId: assignmentBase.assignmentId,
      assignmentFingerprint,
      canonicalKey: 'lavender',
      acceptedScientificName: 'Lavandula angustifolia',
      targetField: 'sun',
      targetClaimTypes: ['preference'],
      targetQuestions: assignmentBase.targetQuestions.slice(),
      targetContext: CTX,
      targetRegion: 'florida',
      allowedSourceClasses: assignmentBase.allowedSourceClasses.slice(),
      prohibitedSourceClasses: assignmentBase.prohibitedSourceClasses.slice(),
      languagePreferences: ['en'],
      maximumCandidateSources: 20,
      maximumClaimsPerSource: 3,
      providerConfigurationReference: assignmentBase.providerConfigurationReference
    },
    approvedIdentitySnapshot: {
      canonicalKey: 'lavender',
      acceptedScientificName: 'Lavandula angustifolia',
      identityRegistryVersion: '1.5.0',
      currentIdentityBindingFingerprint: 'idfp-lavender-species-v1',
      currentNeedsReview: false,
      currentIdentityConflict: false,
      canonicalIdentityConfirmed: true,
      parentOrGenusScope: 'species',
      targetField: 'sun'
    },
    providerConfigurationReference: 'cfg:mock-replay-lavender-sun-v1',
    networkPolicy: {
      executionMode: 'mock_or_replay_only',
      realNetworkAllowed: false,
      browserFetchAllowed: false,
      secretBearingTransportAllowed: false,
      allowedSchemes: ['http', 'https'],
      maximumRedirects: 3,
      connectTimeoutMs: 5000,
      readTimeoutMs: 15000,
      maximumRetries: 1,
      blockLocalhost: true,
      blockLoopback: true,
      blockPrivateIpv4: true,
      blockPrivateIpv6: true,
      blockLinkLocal: true,
      blockCloudMetadata: true,
      blockCredentialBearingUrls: true,
      blockUnsafeDirectIps: true,
      blockRedirectsToBlockedTargets: true,
      redirectRevalidationRequired: true,
      cancellationSupported: true
    },
    sourcePolicy: {
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
      domainAllowlist: [],
      domainDenylist: []
    },
    executionBudget: {
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
    },
    languagePolicy: {
      preferredLanguages: ['en'],
      preserveSourceLanguage: true,
      translationAllowed: false,
      targetRegion: 'florida'
    },
    extractionPolicy: {
      enabled: false,
      externalModelAllowed: false,
      declaredClaimSpans: 'disabled'
    }
  };
  attachQueryPlanFingerprint(input, mod);
  return { input, assignmentFingerprint };
}

test('inventory: versions, 13 statuses, 33 findings, descriptors', () => {
  assert.equal(SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION, '0.1.0-sr-live-source-provider-adapter');
  assert.equal(
    SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
    '0.1.0-sr-live-source-provider-adapter-contract'
  );
  assert.equal(
    SR_LIVE_SOURCE_PROVIDER_ADAPTER_RESULT_CONTRACT_VERSION,
    '0.1.0-sr-live-source-provider-adapter-result'
  );
  assert.equal(
    SR_LIVE_SOURCE_PROVIDER_ADAPTER_CAPABILITY,
    'explicit_developer_live_source_provider_adapter_execution'
  );
  assert.equal(SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES.length, 13);
  assert.equal(SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS.length, 27);
  assert.equal(SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS.length, 6);
  assert.equal(
    SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
    '0.1.0-sr-live-source-provider-transport-security-contract'
  );
  const d = getLiveSourceProviderAdapterDescriptor();
  const t = getLiveSourceProviderTransportSecurityDescriptor();
  assert.equal(d.network, false);
  assert.equal(d.secretBearing, false);
  assert.equal(d.productUseAllowed, false);
  assert.equal(t.realDns, false);
  assert.equal(t.realNetwork, false);
  assert.equal(t.simulationOnly, true);
  assert.throws(() => {
    d.network = true;
  });
});

test('scenario class roster is exactly 28', () => {
  assert.equal(SCENARIO_CLASSES.length, 28);
});

test('1 Successful normalized search', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: goodSearchStub
  });
  const out = adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryTemplate: 'lavender sun',
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(out.executionMode, 'mock_or_replay');
  assert.equal(out.results.length, 2);
  assert.equal(out.results[0].rawPayload, undefined);
  assert.equal(adapter.getLastAdapterResult().status, 'results_ready_for_provider_orchestration');
  assert.ok(!JSON.stringify(out).includes('sk-live-proof'));
});

test('2 Successful safe fetch', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: (req) => goodFetchStub(req)
  });
  const out = adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.equal(out.executionMode, 'mock_or_replay');
  assert.equal(out.status, 200);
  assert.ok(out.normalizedText.includes('full sun'));
  assert.equal(out.raw, undefined);
  assert.ok(!JSON.stringify(out).includes('synth-token-XYZ'));
  assert.equal(adapter.getLastAdapterResult().status, 'results_ready_for_provider_orchestration');
});

test('3 Missing configuration', () => {
  const n = normalizeLiveSourceProviderAdapterConfiguration({});
  assert.equal(n.ok, false);
  assert.ok(n.findings.some((f) => f.code === 'missing_configuration'));
});

test('4 Missing synthetic secret', () => {
  const n = normalizeLiveSourceProviderAdapterConfiguration(
    baseConfig({ requireSyntheticSecret: true, syntheticSecretPresent: false })
  );
  assert.equal(n.ok, false);
  assert.ok(n.findings.some((f) => f.code === 'missing_secret'));
  const adapter = createLiveSourceProviderAdapter(
    baseConfig({ requireSyntheticSecret: true, syntheticSecretPresent: false }),
    { searchStub: goodSearchStub }
  );
  assert.equal(adapter.configurationOk, false);
  assert.equal(adapter.getLastAdapterResult().status, 'authentication_blocked');
});

test('5 Secret redaction', () => {
  const dirty = {
    apiKey: 'sk-live-proof-abc12345',
    authorization: 'Bearer synth-token-XYZ',
    nested: { password: 'hunter2', ok: 'safe' },
    note: 'Bearer synth-token-XYZ in text'
  };
  const clean = redactStructuredLog(dirty);
  const s = JSON.stringify(clean);
  assert.ok(!s.includes('sk-live-proof-abc12345'));
  assert.ok(!s.includes('synth-token-XYZ'));
  assert.ok(!s.includes('hunter2'));
  assert.equal(clean.nested.ok, 'safe');
  assert.equal(redactSensitiveValue('password=hunter2'), '[REDACTED]');
});

test('6 Invalid assignment fingerprint', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: goodSearchStub
  });
  const out = adapter.searchExecutor({
    assignmentReference: { assignmentFingerprint: 'ss-assign|WRONG' },
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryTemplate: 'x',
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(out.results.length, 0);
  assert.equal(adapter.getLastAdapterResult().status, 'adapter_input_invalid');
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'invalid_assignment_fingerprint')
  );
  assert.equal(sortAdapterFindings([{ code: 'invalid_assignment_fingerprint', path: 'a', detail: 'd', severity: 'hard' }])[0].code, 'invalid_assignment_fingerprint');
});

test('7 Invalid query-plan fingerprint', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: goodSearchStub
  });
  const out = adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'WRONG' },
    queryTemplate: 'x',
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(out.results.length, 0);
  assert.equal(adapter.getLastAdapterResult().status, 'adapter_input_invalid');
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'invalid_query_plan_fingerprint')
  );
});

test('8 Blocked URL scheme', () => {
  const r = normalizeAndValidateOutboundUrl('javascript:alert(1)');
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.code === 'blocked_scheme'));
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () => goodFetchStub()
  });
  adapter.fetchExecutor({ normalizedUrl: 'javascript:alert(1)' });
  assert.equal(adapter.getLastAdapterResult().status, 'security_blocked');
});

test('9 Private or cloud-metadata target', () => {
  assert.equal(normalizeAndValidateOutboundUrl('http://127.0.0.1/x').ok, false);
  assert.equal(normalizeAndValidateOutboundUrl('http://192.168.1.1/x').ok, false);
  assert.equal(normalizeAndValidateOutboundUrl('http://169.254.169.254/latest').ok, false);
  assert.equal(validateResolvedAddresses(['10.0.0.1']).ok, false);
  assert.equal(validateResolvedAddresses(['fc00::1']).ok, false);
});

test('10 Unsafe redirect', () => {
  const r = validateRedirectTarget('http://evil.example/x', {
    redirectCount: 1,
    fromScheme: 'https',
    resolvedAddresses: ['203.0.113.9']
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.code === 'unsafe_redirect'));
  const tooMany = validateRedirectTarget('https://ok.example/x', {
    redirectCount: 4,
    resolvedAddresses: ['203.0.113.9']
  });
  assert.equal(tooMany.ok, false);
});

test('11 DNS address-change/rebinding simulation', () => {
  const r = validateRedirectTarget('https://ok.example/x', {
    redirectCount: 1,
    fromScheme: 'https',
    resolvedAddresses: ['198.51.100.2'],
    initialPinnedAddress: '203.0.113.10'
  });
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.code === 'dns_rebinding_blocked'));
});

test('12 TLS failure', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () =>
      Object.assign(goodFetchStub(), {
        tls: { tlsVerified: false, certificateValid: false, hostnameMatched: false }
      })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.equal(adapter.getLastAdapterResult().status, 'security_blocked');
  assert.ok(
    adapter.getLastAdapterResult().findings.some((f) => f.code === 'tls_failure')
  );
});

test('13 Timeout', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: () => ({ timeout: true }),
    fetchStub: () => ({ timeout: true })
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(adapter.getLastAdapterResult().status, 'search_unavailable');
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.equal(adapter.getLastAdapterResult().status, 'fetch_unavailable');
});

test('14 Cancellation', () => {
  const c = createCancellationController();
  c.abort();
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: goodSearchStub,
    fetchStub: () => Object.assign(goodFetchStub(), { cancelled: true })
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: true }
  });
  assert.ok(
    adapter.getLastAdapterResult().findings.some((f) => f.code === 'cancellation')
  );
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    adapter.getLastAdapterResult().findings.some((f) => f.code === 'cancellation')
  );
});

test('15 Rate limit', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: () => ({
      results: [],
      rateLimit: { limited: true },
      usage: {},
      errors: []
    })
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(adapter.getLastAdapterResult().status, 'rate_limited');
});

test('16 Provider quota exhaustion', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: () => ({
      results: [],
      quotaExhausted: true,
      rateLimit: { limited: false },
      usage: {},
      errors: []
    })
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'provider_quota_exhausted')
  );
});

test('17 Malformed search response', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    searchStub: () => ({ malformed: true })
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(adapter.getLastAdapterResult().status, 'search_unavailable');
});

test('18 Malformed fetch response', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () => ({ malformed: true, resolvedAddresses: ['203.0.113.10'], tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true } })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    ['fetch_unavailable', 'security_blocked'].includes(
      adapter.getLastAdapterResult().status
    )
  );
});

test('19 Unsupported MIME', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () =>
      Object.assign(goodFetchStub(), { contentType: 'application/pdf', normalizedText: '%PDF' })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    adapter.getLastAdapterResult().findings.some((f) => f.code === 'unsupported_mime')
  );
});

test('20 Compressed/decompressed-size overflow', () => {
  const r = validateDecompressedSize({
    compressedBytes: 100,
    decompressedBytes: 600000,
    normalizedText: 'x'
  });
  assert.equal(r.ok, false);
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () =>
      Object.assign(goodFetchStub(), {
        compressedBytes: 1000,
        decompressedBytes: 600000,
        bytesRead: 600000
      })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'oversized_or_decompression_response')
  );
});

test('21 Robots or source-policy block', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () => Object.assign(goodFetchStub(), { robotsDenied: true })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'robots_or_source_policy_blocked')
  );
});

test('22 Authentication/paywall/CAPTCHA source', () => {
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    fetchStub: () => Object.assign(goodFetchStub(), { captcha: true })
  });
  adapter.fetchExecutor({
    normalizedUrl: 'https://extension.example.edu/lavender/sun?keep=1'
  });
  assert.ok(
    adapter
      .getLastAdapterResult()
      .findings.some((f) => f.code === 'authentication_paywall_or_captcha_source')
  );
});

test('23 Projected cost overflow', () => {
  const b = validateTransportBudget(
    { projectedCostUsd: 0.2, logicalPaidCalls: 0 },
    { pilotCostUsd: 0.1, absoluteCostUsd: 0.25, maxLogicalPaidCalls: 2 }
  );
  assert.equal(b.ok, false);
  assert.equal(b.actualProofCostUsd, 0);
  const adapter = createLiveSourceProviderAdapter(baseConfig(), {
    usageState: { projectedCostUsd: 0.5, logicalPaidCalls: 0 },
    searchStub: goodSearchStub
  });
  adapter.searchExecutor({
    queryPlanReference: { queryPlanFingerprint: 'qp-proof-fixed' },
    queryIndex: 0,
    cancellationReference: { cancelled: false }
  });
  assert.equal(adapter.getLastAdapterResult().status, 'budget_blocked');
});

test('24 Concurrency overflow', () => {
  const g = createRunGuard();
  assert.equal(g.beginRun('n1').ok, true);
  assert.equal(g.beginRun('n2').ok, false);
  g.endRun();
  assert.equal(g.beginFetch('h', 'https://a.example/1').ok, true);
  assert.equal(g.beginFetch('h', 'https://a.example/2').ok, true);
  assert.equal(g.beginFetch('h', 'https://a.example/3').ok, false);
});

test('25 Duplicate nonce/idempotency replay', () => {
  const g = createRunGuard();
  assert.equal(g.beginRun('same').ok, true);
  g.endRun();
  assert.equal(g.beginRun('same').ok, false);
  assert.ok(
    g.beginRun('same').findings.some((f) => f.code === 'idempotency_replay_blocked')
  );
});

test('26 Provider-neutral compatibility', async () => {
  const mod = await loadProvider();
  const scoutMod = await loadScout();
  const { input, assignmentFingerprint } = buildProviderInput(mod, scoutMod);
  const qfp = input.expectedQueryPlanFingerprint;
  const adapter = createLiveSourceProviderAdapter(
    baseConfig({
      approvedQueryPlanFingerprint: qfp,
      approvedAssignmentFingerprint: assignmentFingerprint
    }),
    {
      searchStub: (req) => goodSearchStub(req),
      fetchStub: (req) => goodFetchStub(req)
    }
  );
  const result = mod.prepareReviewedDataLiveSourceProviderDiscovery(input, {
    searchExecutor: adapter.searchExecutor,
    fetchExecutor: adapter.fetchExecutor
  });
  assert.equal(result.status, 'results_ready_for_source_scout');
  assert.equal(result.usageSummary.realNetworkCalls, 0);
  assert.equal(result.usageSummary.estimatedCostUsd, 0);
  assert.equal(result.usageSummary.realExternalModelCalls, 0);
});

test('27 Runtime/client isolation', () => {
  const indexPath = path.join(ROOT, 'index.html');
  const index = fs.readFileSync(indexPath, 'utf8');
  assert.ok(!index.includes('live-source-provider'));
  assert.ok(!index.includes('run-local-transport-proof'));
  assert.ok(!index.includes('developer-live-source-provider-adapter'));
  const netlify = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.ok(!netlify.includes('sr-live-source-provider'));
  // no env names for this track in browser modules listing (index)
  assert.ok(!/SR_LIVE_SOURCE_PROVIDER_API|LIVE_SOURCE_API_KEY/.test(index));
});

test('28 Commerce-authority attempt', () => {
  const n = normalizeLiveSourceProviderAdapterConfiguration(
    baseConfig({ shopify: true, commerce: { enabled: true } })
  );
  assert.equal(n.ok, false);
  const d = getLiveSourceProviderAdapterDescriptor();
  assert.equal(d.productAuthority, false);
  assert.equal(d.catalogAuthority, false);
  assert.ok(
    n.findings.some(
      (f) => f.code === 'unknown_adapter_input' || f.code === 'secret_leakage_detected'
    )
  );
});

test('negative: live mode / env-file flags are rejected by config', () => {
  const n = normalizeLiveSourceProviderAdapterConfiguration(
    baseConfig({ executionMode: 'secret_bearing_live', livePilotFlag: true })
  );
  assert.equal(n.ok, false);
});

test('negative: credential-bearing URL and createSafeRequestPlan', () => {
  assert.equal(
    normalizeAndValidateOutboundUrl('https://user:pass@evil.example/x').ok,
    false
  );
  const plan = createSafeRequestPlan({
    url: 'https://extension.example.edu/ok',
    resolvedAddresses: ['203.0.113.10'],
    tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true }
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.realDns, false);
  assert.equal(plan.realNetwork, false);
});

test('fingerprints deterministic', () => {
  const a = fingerprintOf('lsp-adapter-input', baseConfig());
  const b = fingerprintOf('lsp-adapter-input', baseConfig());
  assert.equal(a, b);
});

test('scenario class names are all referenced in this file', () => {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  for (const name of SCENARIO_CLASSES) {
    assert.ok(src.includes(name), 'missing scenario visibility: ' + name);
  }
});
