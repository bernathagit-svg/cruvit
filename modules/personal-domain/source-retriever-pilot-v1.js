/**
 * Source Retriever Pilot v1 — bounded LIVE enrichment retrieval (2–3 P1 plants).
 *
 * Pipeline: queue job → approved discovery → fetch(+cache) → extract → source-policy
 * → contradiction gate → enrichment candidate packet → STOP.
 *
 * Does NOT write climateTraits / traitEvidenceClasses / needsReview / catalog.
 * Does NOT ingest Batch 3. Does NOT deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CATALOG_SOURCE_POLICY_REF,
  evaluateSourceSupportedEligibility,
  authorityTierForSourceType
} from './catalog-source-policy-v1.js';
import {
  CATALOG_CONTRADICTION_GATE_REF,
  evaluateClaimSet,
  CONTRADICTION_CLASS
} from './catalog-contradiction-gate-v1.js';
import { classifyPlantDataReadiness, EVIDENCE_CLASS } from './plant-data-contract-v1.js';
import {
  HARDINESS_EVIDENCE_CLAIMS_REF,
  HARDINESS_CLAIM_TYPE,
  extractExplicitHardinessZones,
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim,
  extractHardinessZoneExcerpt,
  extractFrostInjuryExcerpt
} from './hardiness-evidence-claims-v1.js';
import {
  HARDINESS_ZONE_TO_COLD_TRAITS_REF,
  applyHardinessZoneToColdTraits
} from './hardiness-zone-to-cold-traits-v1.js';
import {
  FROST_INJURY_TO_FROST_SENSITIVITY_REF,
  applyFrostInjuryToFrostSensitivity
} from './frost-injury-to-frost-sensitivity-v1.js';

export const SOURCE_RETRIEVER_PILOT_ID = 'source-retriever-pilot-v1';
export const SOURCE_RETRIEVER_PILOT_VERSION = '1.1.0';
export const SOURCE_RETRIEVER_PILOT_REF = `${SOURCE_RETRIEVER_PILOT_ID}@${SOURCE_RETRIEVER_PILOT_VERSION}`;

export {
  extractExplicitHardinessZones,
  extractHardinessZoneExcerpt,
  extractFrostInjuryExcerpt,
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim
};

/**
 * Safe P1 AUTO pilots: stable species identity, frost/cold evidence-only gaps,
 * no productRole / identity hold / needsReview. Well-documented Tier A pages.
 */
export const PILOT_PLANT_SPECS = Object.freeze([
  {
    slug: 'apple',
    scientificName: 'Malus domestica',
    whySafe:
      'P1 AUTO PARTIAL; species-level Malus domestica; gaps limited to frost/cold SS evidence; unlocked-six structural traits already present with flowering/fruiting stance.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-malus-domestica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/malus-domestica/',
        title: 'Malus domestica (Apple)'
      },
      {
        sourceId: 'usda-plants-malus-domestica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=MADO4',
        title: 'Malus domestica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'fig',
    scientificName: 'Ficus carica',
    whySafe:
      'P1 AUTO PARTIAL; species-level Ficus carica; frost/cold evidence-only; unlocked-six structural traits with flowering/fruiting stance; no identity conflict.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-ficus-carica',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/ficus-carica/',
        title: 'Ficus carica (Edible Fig)'
      },
      {
        sourceId: 'usda-plants-ficus-carica',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=FICA',
        title: 'Ficus carica - USDA PLANTS'
      }
    ])
  },
  {
    slug: 'pomegranate',
    scientificName: 'Punica granatum',
    whySafe:
      'P1 AUTO PARTIAL; species-level Punica granatum; frost/cold evidence-only from SAFE migration; no productRole; clear canonical species.',
    approvedSources: Object.freeze([
      {
        sourceId: 'ncsu-punica-granatum',
        sourceType: 'university_extension',
        institution: 'North Carolina State University Extension Gardener',
        url: 'https://plants.ces.ncsu.edu/plants/punica-granatum/',
        title: 'Punica granatum (Pomegranate)'
      },
      {
        sourceId: 'usda-plants-punica-granatum',
        sourceType: 'government',
        institution: 'USDA PLANTS Database',
        url: 'https://plants.usda.gov/home/plantProfile?symbol=PUGR2',
        title: 'Punica granatum - USDA PLANTS'
      }
    ])
  }
]);

const USER_AGENT =
  'CruvitSourceRetrieverPilot/1.0 (+https://github.com/bernathagit-svg/cruvit; enrichment-pilot; contact=local-dev)';

export function defaultRetrievalRoot(repoRoot) {
  return path.join(repoRoot, 'data', 'catalog', 'enrichment-retrieval');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Legacy helper retained for tests: bounded hardiness + frost-injury excerpts only.
 * Does NOT map zones to frost/cold ordinals.
 */
export function extractFrostColdExcerpts(text) {
  const out = [];
  const z = extractHardinessZoneExcerpt(text);
  const f = extractFrostInjuryExcerpt(text);
  if (z) out.push(z);
  if (f) out.push(f);
  return out;
}

/** @deprecated Unauthorized zone→frost+cold ordinal map removed. Use transform contracts. */
export function mapHardinessZonesToTraits() {
  throw new Error(
    'mapHardinessZonesToTraits removed: use hardiness-zone-to-cold-traits-v1 + frost-injury-to-frost-sensitivity-v1'
  );
}

export function identityMatchText(text, scientificName, slug) {
  const hay = String(text || '')
    .toLowerCase()
    .replace(/×/g, 'x');
  const sci = String(scientificName || '')
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = sci.split(/\s+/).filter((p) => p && p !== 'x');
  if (parts.length >= 2) {
    const binomial = parts[0] + ' ' + parts[1];
    const hybridBinomial = parts[0] + ' x ' + parts[1];
    if (hay.includes(binomial) || hay.includes(hybridBinomial)) {
      return { ok: true, reason: 'binomial_in_page' };
    }
    if (hay.includes(parts[0]) && !hay.includes(binomial) && !hay.includes(hybridBinomial)) {
      return { ok: false, reason: 'genus_only_or_species_absent', code: 'IDENTITY_MISMATCH' };
    }
  }
  if (slug && hay.includes(String(slug).replace(/-/g, ' '))) {
    return { ok: true, reason: 'slug_token_in_page' };
  }
  return { ok: false, reason: 'identity_not_found', code: 'INSUFFICIENT_EVIDENCE' };
}

/**
 * File-backed URL cache. Same URL never re-fetched if cache hit.
 */
export function createUrlCache(cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const stats = { hits: 0, misses: 0, writes: 0, urls: [] };

  function cachePath(url) {
    return path.join(cacheDir, `${sha256(url)}.json`);
  }

  function get(url) {
    const p = cachePath(url);
    if (!fs.existsSync(p)) return null;
    stats.hits += 1;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  function set(url, record) {
    const p = cachePath(url);
    fs.writeFileSync(p, JSON.stringify(record, null, 2));
    stats.writes += 1;
    if (!stats.urls.includes(url)) stats.urls.push(url);
  }

  return {
    get,
    set,
    stats: () => ({ ...stats, uniqueUrls: [...stats.urls] }),
    cachePath
  };
}

/**
 * Live fetch HTML (or return cache). Counts external requests.
 */
export async function fetchHtmlCached(url, cache, fetchImpl = globalThis.fetch) {
  const hit = cache.get(url);
  if (hit) {
    return { ...hit, fromCache: true, externalRequest: false };
  }
  const res = await fetchImpl(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });
  const status = res.status;
  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());
  // Bound storage
  const max = 1_500_000;
  const body = buf.slice(0, max).toString('utf8');
  const record = {
    url,
    status,
    contentType,
    retrievedAt: new Date().toISOString(),
    sha256: sha256(body),
    byteLength: buf.length,
    truncated: buf.length > max,
    body
  };
  if (status >= 200 && status < 400 && /html|text|xml/i.test(contentType || 'text/html')) {
    cache.set(url, record);
  }
  cache.stats().urls; // ensure url tracked on miss path via set
  return { ...record, fromCache: false, externalRequest: true };
}

export function loadQueueJob(queueDoc, slug) {
  const jobs = queueDoc?.jobs || [];
  return jobs.find((j) => j.canonicalSlug === slug) || null;
}

/**
 * Build evidence records + candidates for one pilot plant (pure after fetch results).
 * Honesty model: raw sourceClaim vs transform-derived normalizedTraitCandidate.
 */
export function buildPilotCandidatesFromFetched({ plantSpec, queueJob, currentPlant, fetchedSources }) {
  const expectedIdentity = {
    acceptedScientificName: plantSpec.scientificName,
    scientific: plantSpec.scientificName,
    canonicalSlug: plantSpec.slug,
    slug: plantSpec.slug
  };
  const evidenceRecords = [];
  const derivedCandidates = [];

  for (const fs of fetchedSources) {
    const text = stripHtml(fs.body || '');
    const contentHash = fs.sha256 || sha256(fs.body || '');
    const id = identityMatchText(text, plantSpec.scientificName, plantSpec.slug);
    const tier = authorityTierForSourceType(fs.sourceType);
    const baseMeta = {
      sourceId: fs.sourceId,
      sourceType: fs.sourceType,
      authorityTier: tier,
      institution: fs.institution,
      sourceUrl: fs.url,
      title: fs.title,
      retrievedAt: fs.retrievedAt,
      fromCache: !!fs.fromCache,
      httpStatus: fs.status,
      contentHash,
      canonicalPlantIdentity: {
        slug: plantSpec.slug,
        scientificName: plantSpec.scientificName
      },
      identityMatch: id,
      sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
      hardinessClaimsRef: HARDINESS_EVIDENCE_CLAIMS_REF
    };

    if (!id.ok) {
      evidenceRecords.push({
        ...baseMeta,
        sourceClaim: null,
        normalizedTraitCandidate: null,
        targetField: null,
        shortSupportingExcerpt: null,
        sourcePolicyEligibility: {
          mayBeSourceSupported: false,
          evidenceClass: EVIDENCE_CLASS.UNKNOWN,
          reasons: [id.code || id.reason]
        }
      });
      continue;
    }

    const zoneClaim = extractUsdaHardinessZoneBandClaim(text);
    const frostClaim = extractFrostInjuryClaim(text);

    if (zoneClaim) {
      const eligibility = evaluateSourceSupportedEligibility({
        field: 'hardinessZoneBand',
        value: zoneClaim.rawValue,
        sourceId: fs.sourceId,
        sourceType: fs.sourceType,
        excerpt: zoneClaim.supportingExcerpt,
        url: fs.url,
        sourceTitle: fs.title,
        sourceInstitution: fs.institution,
        declaredScientificName: plantSpec.scientificName,
        expectedIdentity,
        provenanceRetained: true
      });

      evidenceRecords.push({
        ...baseMeta,
        sourceClaim: zoneClaim,
        targetField: null,
        shortSupportingExcerpt: zoneClaim.supportingExcerpt,
        normalizedTraitCandidate: null,
        sourcePolicyEligibility: {
          mayBeSourceSupported: eligibility.mayBeSourceSupported,
          evidenceClass: eligibility.evidenceClass,
          reasons: eligibility.reasons,
          hold: eligibility.hold
        }
      });

      if (eligibility.mayBeSourceSupported) {
        const xf = applyHardinessZoneToColdTraits(zoneClaim);
        for (const out of xf.outputs || []) {
          derivedCandidates.push({
            targetField: out.targetField,
            value: out.value,
            sourceId: fs.sourceId,
            sourceType: fs.sourceType,
            excerpt: zoneClaim.supportingExcerpt,
            url: fs.url,
            sourceTitle: fs.title,
            sourceInstitution: fs.institution,
            declaredScientificName: plantSpec.scientificName,
            sourceClaim: zoneClaim,
            transformId: xf.transformId,
            transformVersion: xf.transformVersion,
            transformRef: xf.transformRef,
            transformReason: out.transformReason,
            evidenceLineage: out.evidenceLineage,
            evidenceClass: out.evidenceClass,
            contentHash,
            eligibility
          });
        }
      }
    }

    if (frostClaim) {
      const eligibility = evaluateSourceSupportedEligibility({
        field: 'frostInjuryStatement',
        value: frostClaim.displayValue || frostClaim.rawValue,
        sourceId: fs.sourceId,
        sourceType: fs.sourceType,
        excerpt: frostClaim.supportingExcerpt,
        url: fs.url,
        sourceTitle: fs.title,
        sourceInstitution: fs.institution,
        declaredScientificName: plantSpec.scientificName,
        expectedIdentity,
        provenanceRetained: true
      });

      evidenceRecords.push({
        ...baseMeta,
        sourceClaim: frostClaim,
        targetField: null,
        shortSupportingExcerpt: frostClaim.supportingExcerpt,
        normalizedTraitCandidate: null,
        sourcePolicyEligibility: {
          mayBeSourceSupported: eligibility.mayBeSourceSupported,
          evidenceClass: eligibility.evidenceClass,
          reasons: eligibility.reasons,
          hold: eligibility.hold
        }
      });

      if (eligibility.mayBeSourceSupported) {
        const xf = applyFrostInjuryToFrostSensitivity(frostClaim);
        if (xf.ok) {
          for (const out of xf.outputs || []) {
            derivedCandidates.push({
              targetField: out.targetField,
              value: out.value,
              sourceId: fs.sourceId,
              sourceType: fs.sourceType,
              excerpt: frostClaim.supportingExcerpt,
              url: fs.url,
              sourceTitle: fs.title,
              sourceInstitution: fs.institution,
              declaredScientificName: plantSpec.scientificName,
              sourceClaim: frostClaim,
              transformId: xf.transformId,
              transformVersion: xf.transformVersion,
              transformRef: xf.transformRef,
              transformReason: out.transformReason,
              evidenceLineage: out.evidenceLineage,
              evidenceClass: out.evidenceClass,
              contentHash,
              eligibility
            });
          }
        } else {
          evidenceRecords.push({
            ...baseMeta,
            sourceClaim: frostClaim,
            targetField: 'frostSensitivity',
            shortSupportingExcerpt: frostClaim.supportingExcerpt,
            normalizedTraitCandidate: null,
            transformRef: xf.transformRef,
            transformReasons: xf.reasons,
            sourcePolicyEligibility: {
              mayBeSourceSupported: false,
              evidenceClass: EVIDENCE_CLASS.UNKNOWN,
              reasons: xf.reasons
            }
          });
        }
      }
    }

    if (!zoneClaim && !frostClaim) {
      evidenceRecords.push({
        ...baseMeta,
        sourceClaim: null,
        targetField: null,
        shortSupportingExcerpt: null,
        normalizedTraitCandidate: null,
        sourcePolicyEligibility: {
          mayBeSourceSupported: false,
          evidenceClass: EVIDENCE_CLASS.UNKNOWN,
          reasons: ['INSUFFICIENT_EVIDENCE', 'no_hardiness_or_frost_injury_claim']
        }
      });
    }
  }

  const byField = { frostSensitivity: [], coldTolerance: [] };
  for (const c of derivedCandidates) {
    if (!byField[c.targetField]) byField[c.targetField] = [];
    byField[c.targetField].push({
      field: c.targetField,
      value: c.value,
      sourceId: c.sourceId,
      sourceType: c.sourceType,
      excerpt: c.excerpt,
      url: c.url,
      sourceTitle: c.sourceTitle,
      sourceInstitution: c.sourceInstitution,
      declaredScientificName: c.declaredScientificName,
      provenanceRetained: true,
      _meta: c
    });
  }

  // Ensure both fields always appear in packets (even if empty → NEEDS_MORE_EVIDENCE)
  const contradictionByField = {};
  const fieldPackets = [];
  for (const field of ['frostSensitivity', 'coldTolerance']) {
    const set = byField[field] || [];
    const contradiction = evaluateClaimSet({
      field,
      identity: expectedIdentity,
      claims: set.map(({ _meta, ...rest }) => rest)
    });
    contradictionByField[field] = {
      contradictionClass: contradiction.contradictionClass,
      queueAction: contradiction.queueAction,
      hold: contradiction.hold,
      normalizedResult: contradiction.normalizedResult,
      reasons: contradiction.reasons,
      auditFingerprint: contradiction.auditFingerprint
    };

    const currentValue = currentPlant?.climateTraits?.[field] ?? null;
    const meta0 = set[0]?._meta || null;
    const proposed =
      contradiction.normalizedResult?.value ?? (set[0] && set[0].value) ?? null;

    let applyStatus = 'NEEDS_MORE_EVIDENCE';
    let evidenceClass = EVIDENCE_CLASS.UNKNOWN;
    let transformId = meta0?.transformId || null;
    let transformVersion = meta0?.transformVersion || null;
    let transformRef = meta0?.transformRef || null;
    let transformReason = meta0?.transformReason || null;
    let evidenceLineage = meta0?.evidenceLineage || null;
    let sourceClaim = meta0?.sourceClaim || null;

    if (contradiction.hold) {
      applyStatus = 'HOLD_CONFLICT';
    } else if (
      set.length &&
      transformId &&
      transformVersion &&
      proposed != null &&
      (contradiction.contradictionClass === CONTRADICTION_CLASS.CONSISTENT ||
        contradiction.contradictionClass === CONTRADICTION_CLASS.COMPATIBLE_RANGE)
    ) {
      applyStatus = 'READY_TO_APPLY';
      evidenceClass = meta0?.evidenceClass || EVIDENCE_CLASS.SOURCE_SUPPORTED;
    } else if (set.length && !transformId) {
      applyStatus = 'NEEDS_MORE_EVIDENCE';
      evidenceClass = EVIDENCE_CLASS.UNKNOWN;
    }

    fieldPackets.push({
      canonicalSlug: plantSpec.slug,
      scientificName: plantSpec.scientificName,
      targetField: field,
      targetGapCode:
        field === 'frostSensitivity' ? 'MISSING_FROST_EVIDENCE' : 'MISSING_COLD_EVIDENCE',
      currentPlantValue: currentValue,
      sourceClaim: sourceClaim
        ? {
            claimType: sourceClaim.claimType,
            rawValue: sourceClaim.rawValue ?? sourceClaim.displayValue,
            displayValue: sourceClaim.displayValue,
            hardinessZoneMin: sourceClaim.hardinessZoneMin ?? null,
            hardinessZoneMax: sourceClaim.hardinessZoneMax ?? null,
            hardinessZoneSystem: sourceClaim.hardinessZoneSystem ?? null,
            damageMode: sourceClaim.damageMode ?? null,
            minimumWinterTemperatureF: sourceClaim.minimumWinterTemperatureF ?? null,
            units: sourceClaim.units || sourceClaim.temperatureUnit || null,
            claimFingerprint: sourceClaim.claimFingerprint
          }
        : null,
      normalizedTraitCandidate:
        proposed != null
          ? {
              field,
              value: proposed
            }
          : null,
      proposedValue: proposed,
      proposedNormalizedValue: proposed,
      sourceIds: contradiction.normalizedResult?.retainedSourceIds || set.map((c) => c.sourceId),
      sourceUrl: meta0?.url || null,
      sourceType: meta0?.sourceType || null,
      authorityTier: meta0 ? authorityTierForSourceType(meta0.sourceType) : null,
      supportingExcerpt: meta0?.excerpt || null,
      excerpts: set.map((c) => ({ sourceId: c.sourceId, excerpt: c.excerpt })),
      sourcePolicyResult: meta0?.eligibility
        ? {
            mayBeSourceSupported: meta0.eligibility.mayBeSourceSupported,
            evidenceClass: meta0.eligibility.evidenceClass,
            reasons: meta0.eligibility.reasons
          }
        : null,
      transformId,
      transformVersion,
      transformRef,
      transformReason,
      evidenceLineage,
      evidenceClass,
      contradictionResult: contradictionByField[field],
      contentHash: meta0?.contentHash || null,
      confidence:
        applyStatus === 'READY_TO_APPLY' ? 'medium' : applyStatus === 'HOLD_CONFLICT' ? 'high' : 'low',
      expectedReadinessImpact:
        field === 'coldTolerance'
          ? 'Authorized coldTolerance alone cannot reach Class A without SOURCE_SUPPORTED frostSensitivity.'
          : 'Frost requires direct injury evidence + approved frost-injury transform; zone alone is insufficient.',
      applyStatus,
      runtimeAuthority: false,
      writesProductFact: false
    });
  }

  return {
    pilotRef: SOURCE_RETRIEVER_PILOT_REF,
    sourcePolicyRef: CATALOG_SOURCE_POLICY_REF,
    contradictionGateRef: CATALOG_CONTRADICTION_GATE_REF,
    hardinessClaimsRef: HARDINESS_EVIDENCE_CLAIMS_REF,
    transforms: {
      cold: HARDINESS_ZONE_TO_COLD_TRAITS_REF,
      frost: FROST_INJURY_TO_FROST_SENSITIVITY_REF
    },
    queueJob: queueJob
      ? {
          jobId: queueJob.jobId,
          canonicalSlug: queueJob.canonicalSlug,
          scientificName: queueJob.scientificName,
          currentReadinessClass: queueJob.currentReadinessClass,
          productGate: queueJob.productGate,
          enrichmentExecution: queueJob.enrichmentExecution,
          priority: queueJob.priority,
          gapCodes: queueJob.gapCodes,
          futureClaimTypes: queueJob.futureClaimTypes
        }
      : null,
    plant: {
      slug: plantSpec.slug,
      scientificName: plantSpec.scientificName,
      whySafe: plantSpec.whySafe
    },
    evidenceRecords,
    fieldPackets,
    contradictionByField,
    mutatedCatalog: false
  };
}

/**
 * Simulate readiness if candidate SOURCE_SUPPORTED frost/cold were applied (in-memory copy only).
 */
export function simulateReadinessWithCandidates(currentPlant, fieldPackets) {
  const clone = structuredClone(currentPlant);
  if (!clone.climateTraits) clone.climateTraits = {};
  if (!clone.climateTraits.traitEvidenceClasses) clone.climateTraits.traitEvidenceClasses = {};
  const before = classifyPlantDataReadiness(currentPlant);
  let applied = 0;
  for (const fp of fieldPackets) {
    if (fp.applyStatus !== 'READY_TO_APPLY') continue;
    if (fp.proposedValue == null) continue;
    // Derived traits require transform id/version; no unauthorized ordinal apply
    if (!fp.transformId || !fp.transformVersion) continue;
    clone.climateTraits[fp.targetField || fp.proposedField] = fp.proposedValue;
    clone.climateTraits.traitEvidenceClasses[fp.targetField || fp.proposedField] =
      fp.evidenceClass || EVIDENCE_CLASS.SOURCE_SUPPORTED;
    applied += 1;
  }
  const after = classifyPlantDataReadiness(clone);
  const stillBefore = classifyPlantDataReadiness(currentPlant);
  return {
    current: {
      readinessShort: before.readinessShort,
      gate: before.gate,
      reasons: before.reasons
    },
    simulated: {
      readinessShort: after.readinessShort,
      gate: after.gate,
      reasons: after.reasons
    },
    fieldsAppliedInSimulation: applied,
    originalUnchanged:
      stillBefore.readinessShort === before.readinessShort &&
      JSON.stringify(currentPlant.climateTraits) === JSON.stringify(currentPlant.climateTraits),
    note: 'Simulation only — authorized transform fields only; no catalog write.'
  };
}

/**
 * Deterministic fingerprint of candidate packet (excluding retrievedAt volatility optional).
 */
export function candidatePacketFingerprint(packet) {
  const stable = {
    slug: packet.plant?.slug,
    transforms: packet.transforms,
    fields: (packet.fieldPackets || []).map((f) => ({
      field: f.targetField || f.proposedField,
      value: f.proposedValue,
      applyStatus: f.applyStatus,
      evidenceClass: f.evidenceClass,
      transformId: f.transformId,
      transformVersion: f.transformVersion,
      sourceClaimType: f.sourceClaim?.claimType || null,
      sourceClaimRaw: f.sourceClaim?.rawValue || null,
      contradiction: f.contradictionResult?.contradictionClass,
      sourceIds: f.sourceIds
    })),
    evidence: (packet.evidenceRecords || []).map((e) => ({
      sourceId: e.sourceId,
      claimType: e.sourceClaim?.claimType || null,
      claimFp: e.sourceClaim?.claimFingerprint || null,
      eligible: e.sourcePolicyEligibility?.mayBeSourceSupported,
      identity: e.identityMatch?.ok,
      contentHash: e.contentHash || null
    }))
  };
  return sha256(JSON.stringify(stable));
}

export async function runSourceRetrieverPilot({
  repoRoot,
  queueDoc,
  plantsBySlug,
  fetchImpl = globalThis.fetch,
  plantSpecs = PILOT_PLANT_SPECS,
  cacheDir = null,
  /**
   * When set, candidate packets / evidence / summaries write under this root
   * instead of durable data/catalog/enrichment-retrieval. Tests MUST pass a
   * temp directory so they never overwrite clean-replay artifacts.
   */
  artifactRoot = null,
  /** When false, skip writing shared multi-plant summary.json (per-slug still written). */
  writeSharedSummary = true
}) {
  const root = artifactRoot || defaultRetrievalRoot(repoRoot);
  const resolvedCacheDir = cacheDir || path.join(defaultRetrievalRoot(repoRoot), 'cache');
  const packetsDir = path.join(root, 'candidate-packets');
  const evidenceDir = path.join(root, 'evidence-records');
  fs.mkdirSync(packetsDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  const cache = createUrlCache(resolvedCacheDir);

  let externalRequests = 0;
  const results = [];

  for (const spec of plantSpecs) {
    const queueJob = loadQueueJob(queueDoc, spec.slug);
    const currentPlant = plantsBySlug[spec.slug];
    if (!currentPlant) {
      results.push({ slug: spec.slug, error: 'plant_not_in_catalog_snapshot' });
      continue;
    }
    const fetchedSources = [];
    for (const src of spec.approvedSources) {
      const fetched = await fetchHtmlCached(src.url, cache, fetchImpl);
      if (fetched.externalRequest) externalRequests += 1;
      fetchedSources.push({
        ...src,
        body: fetched.body,
        status: fetched.status,
        retrievedAt: fetched.retrievedAt,
        fromCache: fetched.fromCache,
        contentType: fetched.contentType,
        sha256: fetched.sha256
      });
    }

    const built = buildPilotCandidatesFromFetched({
      plantSpec: spec,
      queueJob,
      currentPlant,
      fetchedSources
    });
    const simulation = simulateReadinessWithCandidates(currentPlant, built.fieldPackets);
    const packet = {
      ...built,
      generatedAt: new Date().toISOString(),
      parentCommit: '5ecd6101b4d3fcaf47708550aca67b65535b3ec4',
      simulation,
      fingerprint: null
    };
    packet.fingerprint = candidatePacketFingerprint(packet);

    const packetPath = path.join(packetsDir, `${spec.slug}.candidate-packet-v1.json`);
    const evidencePath = path.join(evidenceDir, `${spec.slug}.evidence-records-v1.json`);
    fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2));
    fs.writeFileSync(
      evidencePath,
      JSON.stringify(
        {
          slug: spec.slug,
          generatedAt: packet.generatedAt,
          records: built.evidenceRecords
        },
        null,
        2
      )
    );

    results.push({
      slug: spec.slug,
      packetPath,
      evidencePath,
      queueJob: built.queueJob,
      fieldPackets: built.fieldPackets,
      simulation,
      fingerprint: packet.fingerprint,
      sourcesFetched: fetchedSources.map((s) => ({
        sourceId: s.sourceId,
        url: s.url,
        status: s.status,
        fromCache: s.fromCache
      }))
    });
  }

  const summary = {
    pilotRef: SOURCE_RETRIEVER_PILOT_REF,
    generatedAt: new Date().toISOString(),
    parentCommit: '5ecd6101b4d3fcaf47708550aca67b65535b3ec4',
    plantCount: plantSpecs.length,
    externalRequestCount: externalRequests,
    cache: cache.stats(),
    catalogMutated: false,
    queueMutated: false,
    appliedEnrichment: false,
    results: results.map((r) => ({
      slug: r.slug,
      applyStatuses: (r.fieldPackets || []).map((f) => ({
        field: f.targetField || f.proposedField,
        applyStatus: f.applyStatus,
        evidenceClass: f.evidenceClass,
        transformId: f.transformId,
        transformVersion: f.transformVersion,
        sourceClaimType: f.sourceClaim?.claimType || null,
        contradiction: f.contradictionResult?.contradictionClass,
        proposedValue: f.proposedValue
      })),
      simulation: r.simulation,
      sourcesFetched: r.sourcesFetched,
      packetPath: r.packetPath,
      fingerprint: r.fingerprint
    })),
    note: 'Pilot retrieval only. Candidate packets are not runtime authority. No catalog writes.'
  };
  const summaryName =
    plantSpecs.length === 1
      ? `source-retriever-pilot-v1-summary-${plantSpecs[0].slug}.json`
      : 'source-retriever-pilot-v1-summary.json';
  const summaryPath = path.join(root, summaryName);
  const shouldWriteSummary = plantSpecs.length === 1 || writeSharedSummary !== false;
  if (shouldWriteSummary) {
    try {
      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    } catch (err) {
      // Non-fatal: Windows file locks / AV can block overwrite of shared summary path.
      summary.writeError = String(err?.message || err);
    }
  } else {
    summary.skippedSharedSummaryWrite = true;
  }
  return { summary, summaryPath, results, cacheStats: cache.stats(), externalRequests };
}
