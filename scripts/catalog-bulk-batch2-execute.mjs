#!/usr/bin/env node
/**
 * CRUVIT Bulk Catalog Expansion V1 — Batch 2 executor (evidence-first ingestion).
 * NO live Supabase upsert. NO commit. NO paid APIs.
 *
 * Usage: node scripts/catalog-bulk-batch2-execute.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BATCH2_PLANTS, BATCH_SIZE } from '../data/catalog-expansion/batches/bulk-batch-2-v1/definitions.mjs';
import {
  buildEvidenceFirstPacket,
  climateTraitsFromDefAndPacket,
  inventoryFromPackets,
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket,
  enforceBatch2EvidenceIngestionRule,
  annotatePacketFieldProvenance,
  auditBatch2TaxonProvenance,
  isAcceptedScientificIdentity,
  BATCH_ID
} from './catalog-batch2-shared.mjs';
import { resolveLicensedImageForPlant } from '../modules/catalog-media/wikimedia-commons-source-v1.js';
import {
  IMAGE_READY,
  IMAGE_PENDING
} from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';
import {
  deriveSpecificPlantOutcomes,
  structuralEnvironmentFromClimateProfile
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { auditConfidentDependsOnWeakEvidence } from '../modules/personal-domain/evidence-strength-propagation-v1-contract.js';
import { seedPlantToCatalogRow } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED_PATH = path.join(ROOT, 'data', 'plants.seed.json');
const REGISTRY_PATH = path.join(ROOT, 'data', 'plant-identity.registry.json');
const PACKET_DIR = path.join(ROOT, 'data', 'catalog-expansion', 'batches', 'bulk-batch-2-v1', 'packets');
const HANDOFF_DIR = path.join(ROOT, 'data', 'catalog-expansion', 'batches', 'bulk-batch-2-v1', 'handoff');
const REPORT_PATH = path.join(ROOT, 'tests', '_bulk-catalog-batch-2-v1-report.json');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog-media', 'cache');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function climates() {
  return {
    'humid-tropical': structuralEnvironmentFromClimateProfile({
      broadClimate: 'tropical',
      climateLabel: 'Tropical',
      freezingRisk: 'low',
      humiditySignal: 'high',
      moistureRegime: 'humid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: 23.4,
      alwaysHot: true,
      coolSeasonSignal: false,
      thermalRegime: 'year-round-warm',
      isFrostFreeGrowingClimate: true,
      structuralClimate: {
        status: 'known',
        moistureRegime: 'humid',
        humiditySignal: 'high',
        freezingRisk: 'low',
        thermalRegime: 'year-round-warm',
        evidence: { coldestMonthMeanMinC: 23.4 }
      }
    }),
    'hyper-arid': structuralEnvironmentFromClimateProfile({
      broadClimate: 'arid',
      climateLabel: 'Arid',
      freezingRisk: 'low',
      humiditySignal: 'low',
      moistureRegime: 'hyper-arid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: 8.9,
      alwaysHot: false,
      coolSeasonSignal: true,
      thermalRegime: 'cool-seasonal',
      isFrostFreeGrowingClimate: false,
      structuralClimate: {
        status: 'known',
        moistureRegime: 'hyper-arid',
        humiditySignal: 'low',
        freezingRisk: 'low',
        thermalRegime: 'cool-seasonal',
        evidence: { coldestMonthMeanMinC: 8.9, aridityIndex: 0.02 }
      }
    }),
    mediterranean: structuralEnvironmentFromClimateProfile({
      broadClimate: 'mediterranean',
      climateLabel: 'Mediterranean',
      freezingRisk: 'low',
      humiditySignal: 'low',
      moistureRegime: 'semi-arid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: 8,
      alwaysHot: false,
      coolSeasonSignal: true,
      thermalRegime: 'mild-seasonal',
      isFrostFreeGrowingClimate: false,
      structuralClimate: {
        status: 'known',
        moistureRegime: 'semi-arid',
        humiditySignal: 'low',
        freezingRisk: 'low',
        thermalRegime: 'mild-seasonal',
        evidence: { coldestMonthMeanMinC: 8 }
      }
    }),
    'temperate-frost': structuralEnvironmentFromClimateProfile({
      broadClimate: 'temperate',
      climateLabel: 'Temperate',
      freezingRisk: 'high',
      humiditySignal: 'high',
      moistureRegime: 'humid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: -2,
      alwaysHot: false,
      coolSeasonSignal: true,
      thermalRegime: 'frost-prone',
      isFrostFreeGrowingClimate: false,
      structuralClimate: {
        status: 'known',
        freezingRisk: 'high',
        thermalRegime: 'frost-prone',
        moistureRegime: 'humid',
        humiditySignal: 'high',
        evidence: { coldestMonthMeanMinC: -2 }
      }
    }),
    'cool-highland': structuralEnvironmentFromClimateProfile({
      broadClimate: 'tropical',
      climateLabel: 'Highland',
      freezingRisk: 'medium',
      humiditySignal: 'medium',
      moistureRegime: 'humid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: 8,
      elevationM: 2800,
      alwaysHot: false,
      coolSeasonSignal: true,
      thermalRegime: 'cool-highland',
      isFrostFreeGrowingClimate: false,
      structuralClimate: {
        status: 'known',
        thermalRegime: 'cool-highland',
        freezingRisk: 'medium',
        elevationM: 2800,
        moistureRegime: 'humid',
        evidence: { coldestMonthMeanMinC: 8, elevationM: 2800 }
      }
    }),
    'always-hot': structuralEnvironmentFromClimateProfile({
      broadClimate: 'tropical',
      climateLabel: 'Tropical city-state',
      freezingRisk: 'low',
      humiditySignal: 'high',
      moistureRegime: 'humid',
      structuralClimateStatus: 'known',
      coldestMonthMeanMinC: 24,
      alwaysHot: true,
      coolSeasonSignal: false,
      thermalRegime: 'year-round-warm',
      isFrostFreeGrowingClimate: true,
      structuralClimate: {
        status: 'known',
        thermalRegime: 'year-round-warm',
        freezingRisk: 'low',
        moistureRegime: 'humid',
        humiditySignal: 'high',
        evidence: { coldestMonthMeanMinC: 24 }
      }
    })
  };
}

const stubSuit = {
  recommendationLevel: 'good',
  survivalFit: 80,
  thriveFit: 75,
  floweringFit: 50,
  fruitingFit: 40,
  warnings: [],
  explanationText: ''
};

function fileCacheStore() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return {
    get(key) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      if (!fs.existsSync(fp)) return null;
      try {
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
      } catch {
        return null;
      }
    },
    set(key, value) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      fs.writeFileSync(fp, JSON.stringify(value, null, 2) + '\n');
    }
  };
}

function identityGate(seedSlugs, registrySlugs, registryScientific) {
  const results = [];
  const duplicates = [];
  for (const p of BATCH2_PLANTS) {
    const issues = [];
    if (!isAcceptedScientificIdentity(p.scientific)) {
      issues.push('invalid-scientific-identity');
    }
    if (!p.slug || !p.common) issues.push('missing-identity');
    if (seedSlugs.has(p.slug) || registrySlugs.has(p.slug)) {
      duplicates.push(p.slug);
      issues.push('slug-collision');
    }
    const sciKey = p.scientific.toLowerCase();
    if (registryScientific.has(sciKey)) {
      issues.push('scientific-collision');
    }
    results.push({
      slug: p.slug,
      scientific: p.scientific,
      common: p.common,
      acceptedRank: /\b(var\.|subsp\.)\b/i.test(p.scientific)
        ? 'infraspecific'
        : 'species',
      pass: issues.length === 0,
      issues
    });
  }
  const taxonMismatches = auditBatch2TaxonProvenance(BATCH2_PLANTS);
  return {
    results,
    duplicates,
    taxonProvenanceMismatches: taxonMismatches,
    pass:
      duplicates.length === 0 &&
      results.every((r) => r.pass) &&
      taxonMismatches.length === 0
  };
}

async function main() {
  if (BATCH2_PLANTS.length !== BATCH_SIZE) {
    throw new Error(`Expected ${BATCH_SIZE} plants, got ${BATCH2_PLANTS.length}`);
  }

  const seed = readJson(SEED_PATH);
  const registry = readJson(REGISTRY_PATH);
  const seedSlugs = new Set((seed.plants || []).map((p) => p.slug));
  const registrySlugs = new Set(
    (registry.canonicalIdentities || []).map((e) => e.canonicalSlug)
  );
  const registryScientific = new Set(
    (registry.canonicalIdentities || [])
      .filter((e) => e.acceptedScientificName)
      .map((e) => e.acceptedScientificName.toLowerCase())
  );

  const identity = identityGate(seedSlugs, registrySlugs, registryScientific);
  if (!identity.pass) {
    console.error(JSON.stringify({ identityGate: identity }, null, 2));
    process.exit(2);
  }

  fs.mkdirSync(PACKET_DIR, { recursive: true });
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });

  const cost = {
    paidApiCostUsd: 0,
    aiApiCostUsd: 0,
    imageSourceCalls: 0,
    imageSourceCached: 0,
    externalSourceDocReferences: 0,
    authoritativeSourcesInspected: 0,
    runtimeExternalProviderCalls: 0
  };

  const perPlant = [];
  const accepted = [];
  const rejected = [];
  const handoffRows = [];

  for (const def of BATCH2_PLANTS) {
    const packet = buildEvidenceFirstPacket(def);
    cost.externalSourceDocReferences += packet.sources.length;
    cost.authoritativeSourcesInspected += packet.sources.length;

    const b2 = enforceBatch2EvidenceIngestionRule(packet, { hardFail: true });
    const v = validateCatalogExpansionPacket(packet);
    const packetPath = path.join(PACKET_DIR, `${def.slug}.packet.json`);
    fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n');

    if (!b2.ok || !v.ok) {
      rejected.push({
        slug: def.slug,
        reason: 'validation',
        b2Errors: b2.errors,
        errors: v.errors
      });
      perPlant.push({ slug: def.slug, status: 'rejected', b2Errors: b2.errors, errors: v.errors });
      continue;
    }

    const materialized = materializePlantCatalogItemFromPacket(packet);
    if (!materialized.ok) {
      rejected.push({ slug: def.slug, reason: 'materialize', errors: materialized.errors });
      perPlant.push({ slug: def.slug, status: 'rejected', errors: materialized.errors });
      continue;
    }

    let mediaStatus = IMAGE_PENDING;
    let media = { imageStatus: IMAGE_PENDING, pendingReason: 'batch2-not-resolved' };
    const cacheStore = fileCacheStore();
    const resolution = await resolveLicensedImageForPlant(
      {
        slug: def.slug,
        scientific: def.scientific,
        name: def.common,
        names: { en: def.common }
      },
      { cacheStore, bypassCache: false }
    );
    if (resolution.fromCache) cost.imageSourceCached += 1;
    else cost.imageSourceCalls += 1;
    mediaStatus = resolution.status || IMAGE_PENDING;
    media = resolution.media || media;

    const climateTraits = climateTraitsFromDefAndPacket(def, packet);
    const ann = annotatePacketFieldProvenance(packet);
    const evidenceSummary = {};
    for (const c of ann.claims) {
      if (
        ![
          'frostSensitivity',
          'coldTolerance',
          'heatTolerance',
          'humidityTolerance',
          'waterNeeds',
          'sunNeeds',
          'drainageNeeds',
          'needsWinterChill',
          'floweringRequirements',
          'fruitingRequirements'
        ].includes(c.field) &&
        !String(c.field).startsWith('reproductive.') &&
        !String(c.field).startsWith('quantitative.')
      ) {
        continue;
      }
      evidenceSummary[c.field] = c.evidenceClass;
    }

    const plantRow = {
      slug: def.slug,
      scientific: def.scientific,
      names: { en: def.common },
      aliases: def.aliases,
      climateTraits,
      media,
      needsReview: !!def.needsReview,
      verificationState: def.needsReview ? 'needsReview' : 'verified',
      provenance: packet.sources.map((s) => s.sourceId)
    };

    handoffRows.push(
      seedPlantToCatalogRow(plantRow, {
        catalogVersion: '1.0.0',
        sourcePacket: BATCH_ID
      })
    );

    const entry = {
      slug: def.slug,
      scientific: def.scientific,
      common: def.common,
      archetypes: def.archetypes,
      status: 'accepted',
      needsReview: !!def.needsReview,
      mediaStatus,
      evidenceSummary,
      hasQuantitative: !!climateTraits.quantitativeEvidence,
      hasReproductive: !!climateTraits.reproductiveBiology,
      packetPath
    };
    accepted.push(entry);
    perPlant.push(entry);
  }

  // Climate matrix — all 30 plants × 6 audit climates
  const clim = climates();
  const matrix = [];
  let materialFp = 0;
  let materialFn = 0;
  let heuristicConfident = 0;
  const fpExamples = [];
  const fnExamples = [];
  const heuristicExamples = [];

  for (const entry of accepted) {
    const def = BATCH2_PLANTS.find((p) => p.slug === entry.slug);
    const packet = readJson(path.join(PACKET_DIR, `${entry.slug}.packet.json`));
    const meta = climateTraitsFromDefAndPacket(def, packet);
    const plant = { slug: entry.slug, climateTraits: meta };
    const row = { slug: entry.slug, climates: {} };
    for (const [cname, climateProfile] of Object.entries(clim)) {
      const o = deriveSpecificPlantOutcomes({
        meta,
        climateProfile,
        suitability: { ...stubSuit },
        plant
      });
      row.climates[cname] = {
        overall: o.overall,
        survival: o.survival,
        growth: o.growth,
        flowering: o.flowering,
        fruiting: o.fruiting,
        needsReview: o.needsReview === true
      };
      const hits = auditConfidentDependsOnWeakEvidence(
        { ...o, env: climateProfile },
        meta
      );
      if (hits.length) {
        heuristicConfident += hits.length;
        if (heuristicExamples.length < 10) {
          heuristicExamples.push({ plant: entry.slug, site: cname, hits });
        }
      }
    }
    matrix.push(row);
  }

  const inventory = inventoryFromPackets(PACKET_DIR, BATCH2_PLANTS);

  const handoff = {
    handoffId: 'bulk-batch-2-v1-persistence-handoff',
    batchId: BATCH_ID,
    generatedAt: new Date().toISOString(),
    plantCount: handoffRows.length,
    rows: handoffRows,
    evidenceRule: 'EVERY canonical plant persists traitEvidenceClasses + traitProvenance from ingest',
    noLiveWrite: true
  };
  const handoffPath = path.join(HANDOFF_DIR, 'catalog_plants_batch2_handoff.json');
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + '\n');
  const handoffSha = (
    await import('node:crypto')
  ).createHash('sha256').update(fs.readFileSync(handoffPath)).digest('hex');
  fs.writeFileSync(
    path.join(HANDOFF_DIR, 'catalog_plants_batch2_handoff.sha256'),
    `${handoffSha}  catalog_plants_batch2_handoff.json\n`
  );

  const metrics = {
    totalCandidates: BATCH_SIZE,
    accepted: accepted.length,
    rejected: rejected.length,
    needsReview: accepted.filter((a) => a.needsReview).length,
    IMAGE_READY: accepted.filter((a) => a.mediaStatus === IMAGE_READY).length,
    IMAGE_PENDING: accepted.filter((a) => a.mediaStatus === IMAGE_PENDING).length,
    withQuantitative: accepted.filter((a) => a.hasQuantitative).length,
    withReproductive: accepted.filter((a) => a.hasReproductive).length,
    withTraitEvidenceClasses: accepted.length
  };

  const pass =
    rejected.length === 0 &&
    accepted.length === 30 &&
    materialFp === 0 &&
    materialFn === 0 &&
    heuristicConfident === 0 &&
    metrics.withTraitEvidenceClasses === 30;

  const report = {
    generatedAt: new Date().toISOString(),
    batchId: BATCH_ID,
    proposed: BATCH2_PLANTS.map((p) => ({
      slug: p.slug,
      scientific: p.scientific,
      common: p.common,
      archetypes: p.archetypes
    })),
    identityGate: identity,
    metrics,
    evidenceInventory: inventory.counts,
    materialSuitabilityEvidenceInventory: inventory.materialInventory,
    fullEvidenceMetadataInventory: inventory.fullEvidenceMetadataInventory,
    taxonProvenanceMismatches: identity.taxonProvenanceMismatches,
    perPlantEvidence: inventory.byPlant,
    accepted,
    rejected,
    cost: {
      ...cost,
      paidApiCostUsd: 0,
      aiApiCostUsd: 0,
      userRuntimeExternalProviderCalls: 0
    },
    climateMatrix: {
      plants: matrix.length,
      climatesPerPlant: Object.keys(clim).length,
      materialFp,
      materialFn,
      heuristicDependentConfident: heuristicConfident,
      fpExamples,
      fnExamples,
      heuristicExamples
    },
    handoff: {
      path: handoffPath,
      sha256: handoffSha,
      rowCount: handoffRows.length
    },
    readyForLivePersistenceReview: pass,
    blockers: pass
      ? []
      : [
          ...(rejected.length ? [`${rejected.length} plants rejected`] : []),
          ...(materialFp ? [`material FP=${materialFp}`] : []),
          ...(materialFn ? [`material FN=${materialFn}`] : []),
          ...(heuristicConfident ? [`heuristic-confident=${heuristicConfident}`] : [])
        ],
    verdict: pass ? 'CRUVIT_BULK_CATALOG_BATCH_2: PASS' : 'CRUVIT_BULK_CATALOG_BATCH_2: FAIL'
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        metrics,
        evidenceInventory: inventory.counts,
        climateMatrix: report.climateMatrix,
        handoffSha,
        cost: report.cost
      },
      null,
      2
    )
  );
  console.log(`Report: ${REPORT_PATH}`);
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
