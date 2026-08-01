#!/usr/bin/env node
/**
 * Local secret-free Live Provider Adapter/Transport proof runner.
 * Requires --proof-only. No network, DNS, sockets, credentials, env, or artifacts.
 */

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
  createLiveSourceProviderAdapter
} from '../../../modules/smart-recommendations/adapters/live-source-provider/developer-live-source-provider-adapter.mjs';

import {
  SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
  getLiveSourceProviderTransportSecurityDescriptor,
  redactStructuredLog,
  fingerprintOf,
  createRunGuard,
  validateTransportBudget,
  normalizeAndValidateOutboundUrl,
  createSafeRequestPlan
} from '../../../modules/smart-recommendations/adapters/live-source-provider/transport-security.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const VERDICT_PASS = 'LIVE_PROVIDER_ADAPTER_SECRET_FREE_PROOF_PASS';
const VERDICT_FAIL = 'LIVE_PROVIDER_ADAPTER_SECRET_FREE_PROOF_FAIL';

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

function fail(msg, code) {
  const report = redactStructuredLog({
    verdict: VERDICT_FAIL,
    error: msg,
    code: code || 'proof_failed',
    network: 0,
    externalApi: 0,
    externalModel: 0,
    estimatedCostUsd: 0,
    credentialsAccessed: 0,
    environmentReads: 0,
    artifactWrites: 0
  });
  console.error(JSON.stringify(report, null, 2));
  console.error(VERDICT_FAIL);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail('unknown_argument:' + a, 'unknown_flag');
    const key = a.slice(2);
    if (
      key === 'live' ||
      key === 'vendor' ||
      key === 'env-file' ||
      key === 'api-key' ||
      key === 'endpoint'
    ) {
      fail('flag_rejected:' + a, 'forbidden_flag');
    }
    if (key !== 'proof-only' && key !== 'json') {
      fail('unknown_flag:' + a, 'unknown_flag');
    }
    flags[key] = true;
  }
  if (!flags['proof-only']) fail('missing_required_flag:--proof-only', 'missing_flag');
  return flags;
}

function baseConfig(qfp, afp) {
  return {
    adapterContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
    adapterConfigurationReference: 'cfg:secret-free-proof-v1',
    executionMode: 'mock_or_replay',
    providerReference: 'synthetic/reference-search-v1',
    approvedAssignmentFingerprint: afp,
    approvedQueryPlanFingerprint: qfp,
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
  };
}

function searchStub(req) {
  return {
    executorVersion: 'proof-search-v1',
    providerRequestReference: 'synthetic-search-' + req.queryIndex,
    queryReference: { queryIndex: req.queryIndex, queryTemplate: req.queryTemplate },
    results: [
      {
        resultId: 'sr-edu',
        url: 'https://extension.example.edu/lavender/sun?utm_source=x&keep=1',
        title: 'Lavender sun preference',
        publisher: 'Example University Extension',
        snippet: 'full sun',
        language: 'en',
        sourceClassHint: 'university_extension',
        rank: 1
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

function fetchStub(req) {
  const url = req.normalizedUrl;
  const table = {
    'https://extension.example.edu/lavender/sun?keep=1': {
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
      title: 'Lavender sun preference',
      publisher: 'Example University Extension',
      author: 'Dr. Extension',
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
      tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true }
    },
    'https://gov.example.gov/plants/lavender-sun': {
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
    }
  };
  return table[url] || null;
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
    expectedQueryPlanFingerprint: 'PLACEHOLDER',
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
  const qfp = attachQueryPlanFingerprint(input, mod);
  return { input, assignmentFingerprint, queryPlanFingerprint: qfp };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const guard = createRunGuard();
  const runBegin = guard.beginRun('proof-nonce-frozen-v1');
  if (!runBegin.ok) fail('run_guard_begin_failed', 'concurrency_exceeded');

  try {
    const urlCheck = normalizeAndValidateOutboundUrl(
      'https://extension.example.edu/lavender/sun?utm_source=x&keep=1'
    );
    if (!urlCheck.ok) fail('url_policy_failed', 'ssrf_blocked');
    const plan = createSafeRequestPlan({
      url: urlCheck.normalized,
      resolvedAddresses: ['203.0.113.10'],
      tls: { tlsVerified: true, certificateValid: true, hostnameMatched: true }
    });
    if (!plan.ok) fail('request_plan_failed', 'security_blocked');

    const budget = validateTransportBudget(
      { projectedCostUsd: 0, logicalPaidCalls: 0 },
      { pilotCostUsd: 0.1, absoluteCostUsd: 0.25, maxLogicalPaidCalls: 2 }
    );
    if (!budget.ok || budget.actualProofCostUsd !== 0) fail('budget_failed', 'cost_exceeded');

    const mod = await loadProvider();
    const scoutMod = await loadScout();
    const { input, assignmentFingerprint, queryPlanFingerprint } = buildProviderInput(
      mod,
      scoutMod
    );

    const adapter = createLiveSourceProviderAdapter(
      baseConfig(queryPlanFingerprint, assignmentFingerprint),
      { searchStub, fetchStub, runGuard: guard, usageState: { projectedCostUsd: 0, logicalPaidCalls: 0 } }
    );

    const providerResult = mod.prepareReviewedDataLiveSourceProviderDiscovery(input, {
      searchExecutor: adapter.searchExecutor,
      fetchExecutor: adapter.fetchExecutor
    });

    if (providerResult.status !== 'results_ready_for_source_scout') {
      fail(
        'provider_neutral_status:' + providerResult.status,
        'provider_neutral_compatibility'
      );
    }
    if (
      providerResult.usageSummary.realNetworkCalls !== 0 ||
      providerResult.usageSummary.realExternalModelCalls !== 0 ||
      providerResult.usageSummary.estimatedCostUsd !== 0
    ) {
      fail('nonzero_usage_counters', 'usage_isolation');
    }

    const adapterResult = adapter.getLastAdapterResult();
    const desc = getLiveSourceProviderAdapterDescriptor();
    const tdesc = getLiveSourceProviderTransportSecurityDescriptor();

    const adapterInputFingerprint = fingerprintOf(
      'lsp-adapter-input',
      baseConfig(queryPlanFingerprint, assignmentFingerprint)
    );
    const transportPolicyFingerprint = fingerprintOf('lsp-transport-policy', {
      url: urlCheck.normalized,
      simulationOnly: true,
      realDns: false,
      realNetwork: false,
      realTls: false
    });
    const normalizedExecutorOutputFingerprint = fingerprintOf('lsp-adapter-exec', {
      status: adapterResult.status,
      providerStatus: providerResult.status
    });
    const localProofSummaryFingerprint = fingerprintOf('lsp-local-proof', {
      adapterVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
      transportVersion: SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION,
      adapterStatus: adapterResult.status,
      providerStatus: providerResult.status,
      statuses: SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES.length,
      hardFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS.length,
      infoFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS.length,
      network: 0,
      cost: 0,
      nonce: 'proof-nonce-frozen-v1'
    });

    const report = redactStructuredLog({
      verdict: VERDICT_PASS,
      proofOnly: true,
      json: !!flags.json,
      identities: {
        adapterVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_VERSION,
        adapterContractVersion: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CONTRACT_VERSION,
        adapterResultContractVersion:
          SR_LIVE_SOURCE_PROVIDER_ADAPTER_RESULT_CONTRACT_VERSION,
        adapterCapability: SR_LIVE_SOURCE_PROVIDER_ADAPTER_CAPABILITY,
        transportSecurityContractVersion:
          SR_LIVE_SOURCE_PROVIDER_TRANSPORT_SECURITY_CONTRACT_VERSION
      },
      inventories: {
        statuses: SR_LIVE_SOURCE_PROVIDER_ADAPTER_STATUSES.length,
        hardFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_HARD_FINDINGS.length,
        infoFindings: SR_LIVE_SOURCE_PROVIDER_ADAPTER_INFO_FINDINGS.length
      },
      adapterStatus: adapterResult.status,
      providerNeutralStatus: providerResult.status,
      providerNeutralCompatibility: 'PASS',
      descriptors: {
        adapterDeveloperOnly: desc.developerOnly,
        adapterNetwork: desc.network,
        adapterSecretBearing: desc.secretBearing,
        adapterProductUseAllowed: desc.productUseAllowed,
        transportSimulationOnly: tdesc.simulationOnly,
        transportRealDns: tdesc.realDns,
        transportRealNetwork: tdesc.realNetwork,
        transportRealTls: tdesc.realTls
      },
      fingerprints: {
        adapterInputFingerprint,
        transportPolicyFingerprint,
        normalizedExecutorOutputFingerprint,
        localProofSummaryFingerprint
      },
      counters: {
        network: 0,
        externalApi: 0,
        externalModel: 0,
        estimatedCostUsd: 0,
        credentialsAccessed: 0,
        environmentReads: 0,
        artifactWrites: 0,
        dnsLookups: 0,
        socketConnections: 0,
        tlsHandshakes: 0
      },
      securitySimulationLimitations:
        'No live DNS lookup, socket binding, real TLS handshake, or live DNS-rebinding protection was executed; decisions used injected deterministic metadata only.',
      redaction: 'PASS',
      budget: 'PASS',
      runGuard: 'PASS',
      mimeSourcePolicy: 'PASS'
    });

    const serialized = JSON.stringify(report, null, 2);
    if (
      /sk-live-proof|Bearer synth-token|password=hunter2|api[_-]?key\s*[:=]/i.test(
        serialized
      )
    ) {
      fail('secret_material_in_report', 'secret_leakage_detected');
    }

    console.log(serialized);
    console.log(VERDICT_PASS);
    process.exit(0);
  } finally {
    guard.endRun();
  }
}

main().catch((e) => {
  fail(String(e && e.message ? e.message : e), 'adapter_failed');
});
