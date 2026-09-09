/**
 * Catalog Retrieval Coverage v2 — dry evidence acquisition only.
 *
 * Extends source targeting + extraction inputs. Does NOT weaken source policy,
 * transforms, contradiction gate, Apply Gate, or worker hard stops.
 *
 * Ref: catalog-retrieval-coverage-v2@1.0.0
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  WORKER_SCALE_DRY_PLANT_SPECS
} from './auto-enrichment-worker-v1.js';
import {
  runSourceRetrieverPilot,
  createUrlCache,
  fetchHtmlCached,
  SOURCE_RETRIEVER_PILOT_REF
} from './source-retriever-pilot-v1.js';
import {
  HARDINESS_EVIDENCE_CLAIMS_REF,
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim
} from './hardiness-evidence-claims-v1.js';
import {
  applyHardinessZoneToColdTraits,
  HARDINESS_ZONE_TO_COLD_TRAITS_REF
} from './hardiness-zone-to-cold-traits-v1.js';
import {
  applyFrostInjuryToFrostSensitivity,
  FROST_INJURY_TO_FROST_SENSITIVITY_REF
} from './frost-injury-to-frost-sensitivity-v1.js';
import { CATALOG_SOURCE_POLICY_REF } from './catalog-source-policy-v1.js';

export const CATALOG_RETRIEVAL_COVERAGE_V2_ID = 'catalog-retrieval-coverage-v2';
export const CATALOG_RETRIEVAL_COVERAGE_V2_VERSION = '1.0.0';
export const CATALOG_RETRIEVAL_COVERAGE_V2_REF = `${CATALOG_RETRIEVAL_COVERAGE_V2_ID}@${CATALOG_RETRIEVAL_COVERAGE_V2_VERSION}`;

export const COVERAGE_V2_BASELINE_COMMIT = 'e6137a9d71a3447d87ddf96c3eb9c8a8d02389c1';

export const COVERAGE_V2_LOCKED_SLUGS = Object.freeze([
  'guava',
  'lychee',
  'mandarin',
  'mango',
  'orange',
  'raspberry',
  'apple',
  'fig',
  'peach',
  'pear'
]);

/** Frost evidence taxonomy — what may support frostSensitivity (not zones). */
export const FROST_EVIDENCE_TAXONOMY_V2 = Object.freeze({
  transformRef: FROST_INJURY_TO_FROST_SENSITIVITY_REF,
  allowedClaimExamples: Object.freeze([
    'frost injury',
    'frost damage',
    'frost tender / frost sensitive',
    'killed by frost',
    'damaged below a stated frost/freezing temperature',
    'flower/fruit/young-growth frost injury',
    'freeze injury directly described',
    'institutional wording about sensitivity/intolerance to freezing/frost'
  ]),
  notSufficientAlone: Object.freeze([
    'USDA hardiness zone',
    'minimum winter temperature alone',
    'hardy to zone X',
    'general cold tolerance',
    'climate zone range'
  ]),
  zoneToFrostMisuseForbidden: true
});

export const COVERAGE_V2_REQUEST_CAPS = Object.freeze({
  baselineEquivalentPerPlant: 2,
  additionalFrostOrFallbackPerPlant: 2,
  maxPerPlant: 4,
  maxTotal: 40,
  cacheFirst: true,
  dedupeUrls: true,
  noUnlimitedFallbackLoops: true
});

/**
 * v1 cold-failure diagnosis for the four tropical failures (from committed scale-dry artifacts).
 */
export const V1_COLD_FAILURE_DIAGNOSIS = Object.freeze({
  guava: {
    class: 'source_page_unavailable_or_wrong_url',
    detail: 'NCSU 404; USDA SPA shell without Hardiness Zone / binomial text'
  },
  lychee: {
    class: 'source_page_unavailable_or_wrong_url',
    detail: 'NCSU 404; USDA SPA shell without Hardiness Zone / binomial text'
  },
  mandarin: {
    class: 'source_page_unavailable_or_identity_mismatch',
    detail: 'NCSU 404 / genus-only citrus page; USDA SPA shell'
  },
  mango: {
    class: 'source_page_unavailable_or_wrong_url',
    detail: 'NCSU 404; USDA SPA shell without Hardiness Zone / binomial text'
  }
});

function freezeSource(s) {
  return Object.freeze({ ...s });
}

/**
 * Tier A frost / cold-fallback overlays for the locked 10-plant sample.
 * Baseline NCSU/USDA retained; fallbacks added after (deduped by URL).
 */
export const COVERAGE_V2_SOURCE_OVERLAYS = Object.freeze({
  guava: Object.freeze({
    coldFallback: Object.freeze([
      freezeSource({
        sourceId: 'uf-ifas-gs-guava',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS Gardening Solutions',
        url: 'https://gardeningsolutions.ifas.ufl.edu/plants/trees-and-shrubs/trees/guava.html',
        title: 'Guava — UF/IFAS Gardening Solutions',
        role: 'cold_fallback_and_frost'
      })
    ]),
    frostSources: Object.freeze([
      freezeSource({
        sourceId: 'uf-edis-mg045-guava',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS EDIS',
        url: 'https://edis.ifas.ufl.edu/publication/MG045',
        title: 'Guava Growing in the Florida Home Landscape (EDIS MG045)',
        role: 'frost'
      })
    ])
  }),
  lychee: Object.freeze({
    coldFallback: Object.freeze([
      freezeSource({
        sourceId: 'uf-ifas-gs-lychee',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS Gardening Solutions',
        url: 'https://gardeningsolutions.ifas.ufl.edu/plants/trees-and-shrubs/tropical/lychee.html',
        title: 'Lychee — UF/IFAS Gardening Solutions',
        role: 'cold_fallback'
      })
    ]),
    frostSources: Object.freeze([
      freezeSource({
        sourceId: 'uf-edis-mg051-lychee',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS EDIS',
        url: 'https://edis.ifas.ufl.edu/publication/MG051',
        title: 'Lychee Growing in the Florida Home Landscape (EDIS MG051)',
        role: 'frost'
      })
    ])
  }),
  mandarin: Object.freeze({
    coldFallback: Object.freeze([]),
    frostSources: Object.freeze([
      freezeSource({
        sourceId: 'uf-ifas-gs-citrus',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS Gardening Solutions',
        url: 'https://gardeningsolutions.ifas.ufl.edu/plants/edibles/fruits/citrus.html',
        title: 'Citrus — UF/IFAS Gardening Solutions',
        role: 'frost',
        note: 'May fail identity if page lacks Citrus reticulata binomial'
      })
    ])
  }),
  mango: Object.freeze({
    coldFallback: Object.freeze([
      freezeSource({
        sourceId: 'uf-ifas-gs-mango',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS Gardening Solutions',
        url: 'https://gardeningsolutions.ifas.ufl.edu/plants/trees-and-shrubs/trees/mango.html',
        title: 'Mango — UF/IFAS Gardening Solutions',
        role: 'cold_fallback_and_frost'
      })
    ]),
    frostSources: Object.freeze([
      freezeSource({
        sourceId: 'uf-edis-mg216-mango',
        sourceType: 'university_extension',
        institution: 'University of Florida IFAS EDIS',
        url: 'https://edis.ifas.ufl.edu/publication/MG216',
        title: 'Mango Growing in the Florida Home Landscape (EDIS MG216)',
        role: 'frost'
      })
    ])
  }),
  orange: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) }),
  raspberry: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) }),
  apple: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) }),
  fig: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) }),
  peach: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) }),
  pear: Object.freeze({ coldFallback: Object.freeze([]), frostSources: Object.freeze([]) })
});

export function computeCoverageV2ExperimentFingerprint({
  slugs = COVERAGE_V2_LOCKED_SLUGS,
  baselineCommit = COVERAGE_V2_BASELINE_COMMIT,
  coverageRef = CATALOG_RETRIEVAL_COVERAGE_V2_REF
} = {}) {
  const canonical = [
    coverageRef,
    baselineCommit,
    [...slugs].join(',')
  ].join('|');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function dedupeSources(sources) {
  const seen = new Set();
  const out = [];
  for (const s of sources) {
    const key = String(s.url || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Build plantSpecs for the locked 10: baseline approvedSources + frost + cold fallback.
 * USDA SPA shells are deprioritized (kept last) for the four cold failures.
 */
export function buildCoverageV2PlantSpecs(baseSpecs = WORKER_SCALE_DRY_PLANT_SPECS) {
  const bySlug = Object.fromEntries(baseSpecs.map((s) => [s.slug, s]));
  return COVERAGE_V2_LOCKED_SLUGS.map((slug) => {
    const base = bySlug[slug];
    if (!base) throw new Error(`missing_base_spec:${slug}`);
    const overlay = COVERAGE_V2_SOURCE_OVERLAYS[slug] || { coldFallback: [], frostSources: [] };
    const baseline = [...(base.approvedSources || [])];
    const isColdFailure = Object.prototype.hasOwnProperty.call(V1_COLD_FAILURE_DIAGNOSIS, slug);
    let ordered = baseline;
    if (isColdFailure) {
      // Prefer university_extension fallbacks before known-dead NCSU / SPA USDA.
      ordered = [
        ...(overlay.coldFallback || []),
        ...(overlay.frostSources || []),
        ...baseline.filter((s) => s.sourceType === 'university_extension'),
        ...baseline.filter((s) => s.sourceType !== 'university_extension')
      ];
    } else {
      ordered = [...baseline, ...(overlay.frostSources || []), ...(overlay.coldFallback || [])];
    }
    const approvedSources = dedupeSources(ordered).slice(0, COVERAGE_V2_REQUEST_CAPS.maxPerPlant);
    return Object.freeze({
      slug: base.slug,
      scientificName: base.scientificName,
      safeWritable: base.safeWritable,
      whySafe: `coverage-v2 overlay on ${base.whySafe || base.slug}`,
      approvedSources: Object.freeze(approvedSources.map(freezeSource)),
      coverageRoles: Object.freeze({
        coldFallbackCount: (overlay.coldFallback || []).length,
        frostSourceCount: (overlay.frostSources || []).length
      })
    });
  });
}

/**
 * Assert zone claim alone cannot authorize frost transform (zone→frost misuse guard).
 */
export function assertZoneCannotCreateFrost(sourceClaim) {
  const xf = applyFrostInjuryToFrostSensitivity(sourceClaim);
  return {
    ok: xf.ok === false,
    ZONE_TO_FROST_MISUSE: xf.ok === true,
    reasons: xf.reasons || []
  };
}

/**
 * Run dry retrieval coverage v2 for the locked 10-plant sample.
 */
export async function runRetrievalCoverageV2Dry({
  repoRoot,
  queueDoc,
  plantsBySlug,
  fetchImpl = globalThis.fetch,
  cacheDir = null,
  artifactRoot,
  maxTotal = COVERAGE_V2_REQUEST_CAPS.maxTotal,
  maxPerPlant = COVERAGE_V2_REQUEST_CAPS.maxPerPlant,
  plantSpecs = null
} = {}) {
  if (!artifactRoot) {
    throw new Error('coverage_v2_requires_isolated_artifactRoot');
  }
  const specs = plantSpecs || buildCoverageV2PlantSpecs();
  const experimentFingerprint = computeCoverageV2ExperimentFingerprint();
  const urlSeen = new Set();
  let externalRequests = 0;
  let cacheHits = 0;
  const budget = { used: 0, maxTotal, maxPerPlant, stopped: null };

  const cache = createUrlCache(
    cacheDir || path.join(repoRoot, 'data', 'catalog', 'enrichment-retrieval', 'cache')
  );

  // Prefetch with dedupe + budget, then hand bodies to existing pilot builder via custom fetch
  // that serves only from an in-memory map (no extra network in pilot).
  const bodyByUrl = new Map();

  async function prefetchSpec(spec) {
    let plantExt = 0;
    for (const src of spec.approvedSources || []) {
      if (budget.stopped) break;
      const url = src.url;
      if (urlSeen.has(url)) {
        // Dedupe: reuse prior body if present; no new request.
        continue;
      }
      urlSeen.add(url);
      if (plantExt >= maxPerPlant || budget.used >= maxTotal) {
        budget.stopped = 'REQUEST_CAP_EXCEEDED';
        break;
      }
      const fetched = await fetchHtmlCached(url, cache, fetchImpl);
      bodyByUrl.set(url, fetched);
      if (fetched.fromCache) cacheHits += 1;
      else {
        externalRequests += 1;
        budget.used += 1;
        plantExt += 1;
      }
    }
    return plantExt;
  }

  const perPlantPrefetch = {};
  for (const spec of specs) {
    perPlantPrefetch[spec.slug] = await prefetchSpec(spec);
  }

  const fetchFromMap = async (url) => {
    const hit = bodyByUrl.get(String(url));
    if (!hit) {
      // Should not network during pilot apply phase — return empty 404-like
      return {
        ok: false,
        status: 599,
        headers: { get: () => 'text/plain' },
        text: async () => '',
        arrayBuffer: async () => Buffer.alloc(0)
      };
    }
    const html = hit.body || '';
    const buf = Buffer.from(html, 'utf8');
    return {
      ok: hit.status >= 200 && hit.status < 400,
      status: hit.status,
      headers: { get: () => 'text/html' },
      text: async () => html,
      arrayBuffer: async () => buf
    };
  };

  // Clear artifactRoot packets for this run
  fs.mkdirSync(artifactRoot, { recursive: true });

  const pilot = await runSourceRetrieverPilot({
    repoRoot,
    queueDoc,
    plantsBySlug,
    fetchImpl: fetchFromMap,
    plantSpecs: specs,
    cacheDir: path.join(artifactRoot, '_pilot-local-cache-unused'),
    artifactRoot,
    writeSharedSummary: false
  });

  // Recount: pilot's fetchFromMap never increments external; use our prefetch counters.
  const summary = {
    coverageRef: CATALOG_RETRIEVAL_COVERAGE_V2_REF,
    retrieverRef: SOURCE_RETRIEVER_PILOT_REF,
    hardinessClaimsRef: HARDINESS_EVIDENCE_CLAIMS_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    coldTransformRef: HARDINESS_ZONE_TO_COLD_TRAITS_REF,
    frostTransformRef: FROST_EVIDENCE_TAXONOMY_V2.transformRef,
    experimentFingerprint,
    baselineCommit: COVERAGE_V2_BASELINE_COMMIT,
    lockedSlugs: [...COVERAGE_V2_LOCKED_SLUGS],
    requestCaps: { ...COVERAGE_V2_REQUEST_CAPS, maxTotal, maxPerPlant },
    BASELINE_EQUIVALENT_REQUESTS: Math.min(20, externalRequests),
    ADDITIONAL_V2_REQUESTS: Math.max(0, externalRequests - 20),
    TOTAL_REQUESTS: externalRequests,
    cacheHits,
    uniqueUrls: urlSeen.size,
    budget,
    perPlantPrefetch,
    pilotResults: pilot.results || [],
    ZONE_TO_FROST_MISUSE_COUNT: 0
  };

  // Evidence quality: scan packets for zone→frost misuse
  let zoneToFrost = 0;
  for (const slug of COVERAGE_V2_LOCKED_SLUGS) {
    const packetPath = path.join(artifactRoot, 'candidate-packets', `${slug}.candidate-packet-v1.json`);
    if (!fs.existsSync(packetPath)) continue;
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    for (const fp of packet.fieldPackets || []) {
      if (fp.targetField !== 'frostSensitivity') continue;
      if (fp.applyStatus === 'READY_TO_APPLY' && fp.transformRef === HARDINESS_ZONE_TO_COLD_TRAITS_REF) {
        zoneToFrost += 1;
      }
      if (
        fp.applyStatus === 'READY_TO_APPLY' &&
        fp.sourceClaim?.claimType === 'usda_hardiness_zone_band'
      ) {
        zoneToFrost += 1;
      }
    }
    // Also prove zone claim cannot pass frost transform
    for (const er of packet.evidenceRecords || []) {
      if (er.sourceClaim?.claimType === 'usda_hardiness_zone_band') {
        const guard = assertZoneCannotCreateFrost(er.sourceClaim);
        if (guard.ZONE_TO_FROST_MISUSE) zoneToFrost += 1;
      }
    }
  }
  summary.ZONE_TO_FROST_MISUSE_COUNT = zoneToFrost;

  return { summary, pilot, plantSpecs: specs, artifactRoot };
}

export {
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim,
  applyHardinessZoneToColdTraits,
  applyFrostInjuryToFrostSensitivity
};
