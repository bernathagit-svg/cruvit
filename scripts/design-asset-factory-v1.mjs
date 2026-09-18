/**
 * Design Asset Factory V1 CLI.
 *
 *   node scripts/design-asset-factory-v1.mjs --dry-run
 *
 * Default: DENY. Real-catalog dry-run writes planning JSON.
 * Does not generate images. Does not call paid APIs. Does not write the live registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpendEnvelope, classifyProviderKey, buildEnvelopePreflight, formatEnvelopePreflight, KEY_BILLING_OWNER_ACTIONS } from '../modules/garden-design/asset-factory-v1/spend-envelope-v1.js';
import {
  loadCanonicalCatalog,
  loadOwnedGardenSignals,
  designSurfacedSlugs
} from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import {
  inspectCanonicalCatalog,
  simulateDesignReady,
  proposeBatches,
  realQueueCostScenarios,
  storageImpact,
  ownedPlantPriorityReport,
  genusEligibilityDelta,
  zeroNetworkProof
} from '../modules/garden-design/asset-factory-v1/catalog-inspect-v1.js';
import { selectCalibrationBatch, LOCKED_CALIBRATION_SLUGS } from '../modules/garden-design/asset-factory-v1/calibration-batch-v1.js';
import { writeCalibrationReviewSheet } from '../modules/garden-design/asset-factory-v1/calibration-review-v1.js';
import { assessInGardenQa, composeApprovalVerdict } from '../modules/garden-design/asset-factory-v1/in-garden-qa-v1.js';
import { STORAGE_PUBLISH_CONTRACT } from '../modules/garden-design/asset-factory-v1/storage-publish-contract-v1.js';
import {
  classifyCalibrationReviewReadiness
} from '../modules/garden-design/asset-factory-v1/garden-photo-review-path-v1.js';
import { proposeSafeCalibrationEnvelope } from '../modules/garden-design/asset-factory-v1/total-api-cost-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPORT_REL = path.join('data', 'garden-design', 'design-asset-factory-dry-run-v1.json');

function loadJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function readKeyRaw() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

export function runRealCatalogDryRun(argv = [], options = {}) {
  const root = options.root || ROOT;
  const envelope = parseSpendEnvelope(argv.length ? argv : ['--dry-run']);
  const keyStatus = classifyProviderKey(envelope, options.apiKeyRaw || readKeyRaw());
  const preflight = buildEnvelopePreflight(envelope, keyStatus, 0);
  const catalog = loadCanonicalCatalog(root);
  const registry = loadJson(path.join('modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json')) || {
    sets: []
  };
  const ownedDoc = loadJson(path.join('data', 'garden-os', 'mojstrana-owned-plants-v1.json')) || {
    garden_plants: []
  };
  const ownedSignals = loadOwnedGardenSignals(ownedDoc);
  const signals = {
    ownedCanonicalSlugs: ownedSignals.ownedCanonicalSlugs,
    highFrequencyRecommendedSlugs: [],
    gardenDesignSurfacedSlugs: designSurfacedSlugs(registry),
    portfolioLaunchSlugs: []
  };
  const inspect = inspectCanonicalCatalog(catalog.plants, registry, signals);
  const proof = zeroNetworkProof();
  const calibrationJobs = selectCalibrationBatch(inspect.eligibleJobs, 8);
  const genusDelta = genusEligibilityDelta(inspect);
  const gardenPhotoReadiness = classifyCalibrationReviewReadiness({
    sourceMediaId: options.sourceMediaId || '',
    sourceMediaUrl: options.sourceMediaUrl || '',
    copyToRepo: false
  });
  const proposed = proposeSafeCalibrationEnvelope();
  const inGardenSample = assessInGardenQa({
    generated: false,
    realSavedGardenPhotoReady: gardenPhotoReadiness.status === 'READY'
  });
  const calibrationPack = {
    generatedAt: new Date().toISOString(),
    imagesGenerated: false,
    jobs: calibrationJobs,
    lockedSlugs: LOCKED_CALIBRATION_SLUGS,
    morphologyCoverage: [...new Set(calibrationJobs.map((j) => j.visualForm))],
    genusDelta,
    gardenPhotoReviewPath: gardenPhotoReadiness,
    inGardenQa: {
      savedGardenDesignSourcePhotoRequired: true,
      savedGardenDesignSourcePhotoStatus: gardenPhotoReadiness.status,
      silentLocalFallback: false,
      supplementaryBackgrounds: gardenPhotoReadiness.supplementaryBackgrounds.map((b) => b.file),
      scales: ['small', 'medium', 'large'],
      checks: inGardenSample.checks,
      approvalRule: 'ASSET_QA=PASS AND IN_GARDEN_QA=PASS',
      sampleVerdict: composeApprovalVerdict('UNKNOWN', inGardenSample.result),
      runtimeBlendPermanent: false
    },
    storagePublishContract: STORAGE_PUBLISH_CONTRACT,
    spendPreflight: proposed.spend,
    proposedOwnerEnvelope: {
      runId: proposed.runId,
      provider: proposed.provider,
      model: proposed.model,
      maxJobs: proposed.maxJobs,
      maxCalls: proposed.maxCalls,
      maxRetries: proposed.maxRetries,
      maxSpendUsd: proposed.maxSpendUsd,
      usdPerCallTotal: proposed.usdPerCallTotal,
      defaultDeny: true,
      carryForward: false,
      authorized: false,
      approved: false
    },
    keyBillingReadiness: {
      billingKeyReadiness: preflight.billingKeyReadiness,
      openaiApiKey: preflight.openaiApiKey,
      ownerOnlyActions: KEY_BILLING_OWNER_ACTIONS
    },
    zeroNetworkProof: proof
  };
  const report = {
    generatedAt: new Date().toISOString(),
    planningDataOnly: true,
    imagesGenerated: false,
    liveRegistryWritten: false,
    catalogSummary: {
      identityRegistryVersion: catalog.identityRegistryVersion,
      canonicalPlantsInspected: inspect.totals.canonicalPlantsInspected,
      ownedGarden: ownedSignals.gardenLabel,
      ownedCanonicalSlugs: ownedSignals.ownedCanonicalSlugs,
      ownedSource: ownedSignals.source,
      recommendedSlugsComputed: false,
      designSurfacedSlugs: signals.gardenDesignSurfacedSlugs
    },
    gapSummary: inspect.totals,
    ownedPlantPriority: ownedPlantPriorityReport(inspect, ownedSignals),
    eligibleJobs: inspect.eligibleJobs,
    blockedJobs: inspect.blockedJobs,
    priorityQueue: inspect.eligibleJobs.slice(0, 30).map((job, i) => ({ rank: i + 1, ...job })),
    designReadySimulation: simulateDesignReady(inspect),
    batches: proposeBatches(inspect),
    costScenarios: realQueueCostScenarios(inspect.eligibleJobs.length),
    storageScale: {
      ifAllRequiredVariantsExisted: storageImpact(inspect.totals.requiredVariantsTotal),
      ifEligibleQueueSucceededPlusCurrentApproved: storageImpact(
        inspect.totals.approvedRequiredVariants + inspect.totals.generationEligibleJobs
      )
    },
    zeroNetworkProof: proof,
    spendPreflight: preflight,
    validation: {
      oliveMatureApproved: inspect.plants.some(
        (p) => p.canonicalSlug === 'olive' && p.approvedRequiredCount >= 1 && p.missingRequiredCount >= 1
      ),
      candidatesDoNotCountAsApproved: !(registry.sets || []).some((s) =>
        (s.variants || []).some((v) => String(v.file || '').includes('batch-1-candidates'))
      ),
      catalogCardImagesNotUsed: true,
      optionalNotPromoted: inspect.eligibleJobs.every((j) => j.required === true),
      cartesianExplosionAvoided: inspect.totals.cartesianExplosionAvoided === true
    }
  };
  return {
    report,
    calibrationPack,
    preflightText: formatEnvelopePreflight(preflight),
    proof
  };
}

export function main(argv = process.argv.slice(2)) {
  const args = argv.includes('--dry-run') ? argv : ['--dry-run', ...argv];
  const { report, calibrationPack, preflightText, proof } = runRealCatalogDryRun(args, {
    apiKeyRaw: readKeyRaw()
  });
  const outPath = path.join(ROOT, REPORT_REL);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  const calPath = path.join(ROOT, 'data', 'garden-design', 'design-asset-factory-calibration-batch-v1.json');
  fs.writeFileSync(calPath, JSON.stringify(calibrationPack, null, 2));
  const review = writeCalibrationReviewSheet(ROOT, calibrationPack.jobs, {
    savedGardenPhoto: {
      sourceMediaId: '',
      sourceMediaUrl: '',
      copyToRepo: false
    }
  });
  console.log(preflightText);
  console.log(
    JSON.stringify(
      {
        blocked: true,
        reason: 'dry-run',
        gardenPhotoReviewStatus: review.readiness.status,
        reportPath: REPORT_REL.replace(/\\/g, '/'),
        calibrationPath: 'data/garden-design/design-asset-factory-calibration-batch-v1.json',
        reviewPath: path.relative(ROOT, review.htmlPath).replace(/\\/g, '/'),
        liveReviewPath: path.relative(ROOT, review.livePath).replace(/\\/g, '/'),
        ...proof,
        networkRequests: proof.attemptedNetworkCalls,
        canonicalPlantsInspected: report.gapSummary.canonicalPlantsInspected,
        generationEligibleJobs: report.gapSummary.generationEligibleJobs,
        blockedJobs: report.gapSummary.blockedJobs,
        calibrationJobs: calibrationPack.jobs.length,
        liveRegistryWritten: false,
        imagesGenerated: false
      },
      null,
      2
    )
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = main();
}
