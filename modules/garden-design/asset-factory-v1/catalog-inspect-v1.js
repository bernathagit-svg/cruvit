/**
 * Real-catalog dry-run inspection. Never calls a provider adapter.
 */
import { deriveVariantDemand, variantKeyFromRole } from './variant-demand-v1.js';
import { approvedCovers, priorityForPlant } from './gap-detector-v1.js';
import { classifySpendBlock } from './spend-block-v1.js';
import { isUsableDesignVariant } from '../garden-design-asset-registry-v1.js';
import { GENERATION_USD_PER_IMAGE_OUTPUT } from './cost-model-v1.js';
import { FACTORY_PRIORITY_BANDS } from './design-asset-factory-v1.js';

function coverageForPlant(plant, set) {
  const demand = deriveVariantDemand(plant);
  const required = demand.requiredVariants.map((role) => {
    const covered = approvedCovers(set, role);
    return {
      variantKey: role.variantKey || variantKeyFromRole(role),
      growthStage: role.growthStage,
      phenology: role.phenology,
      season: role.season,
      formView: role.formView || null,
      required: true,
      reason: role.reason,
      approved: covered
    };
  });
  const optional = demand.optionalVariants.map((role) => ({
    variantKey: role.variantKey || variantKeyFromRole(role),
    phenology: role.phenology,
    required: false,
    approved: approvedCovers(set, role)
  }));
  const approvedRequired = required.filter((r) => r.approved).length;
  const missingRequired = required.filter((r) => !r.approved);
  const usable = (set?.variants || []).filter((v) => isUsableDesignVariant(v));
  return {
    demand,
    required,
    optional,
    approvedRequired,
    missingRequired,
    usableApprovedCount: usable.length,
    designReady: missingRequired.length === 0 && required.length > 0
  };
}

function registryBySlug(registry) {
  const map = new Map();
  for (const set of registry.sets || []) {
    if (set.canonicalSlug) map.set(String(set.canonicalSlug).toLowerCase(), set);
  }
  return map;
}

export function inspectCanonicalCatalog(plants, registry, signals = {}) {
  const sets = registryBySlug(registry);
  const plantRows = [];
  const eligibleJobs = [];
  const blockedJobs = [];
  let morphologyResolved = 0;
  let morphologyUnknown = 0;
  let designReady = 0;
  let partial = 0;
  let none = 0;
  let requiredTotal = 0;
  let approvedRequiredTotal = 0;
  let cartesianSafe = true;

  for (const plant of plants) {
    const set = sets.get(String(plant.canonicalSlug || plant.slug).toLowerCase()) || null;
    const cov = coverageForPlant(plant, set);
    const demand = cov.demand;
    const rank = priorityForPlant(demand.canonicalSlug, signals);
    if (demand.morphologyUnknown) morphologyUnknown += 1;
    else morphologyResolved += 1;
    requiredTotal += cov.required.length;
    approvedRequiredTotal += cov.approvedRequired;
    if (cov.required.length >= 12) cartesianSafe = false;
    const eligibleMissing = [];
    const blockedMissing = [];
    for (const miss of cov.required) {
      const spendBlock = classifySpendBlock(plant, demand, miss);
      if (miss.approved) continue;
      if (spendBlock.blocked) {
        blockedMissing.push({ miss, spendBlock });
      } else {
        eligibleMissing.push({ miss, spendBlock });
      }
    }
    const plantBlocked = eligibleMissing.length === 0 && (blockedMissing.length > 0 || demand.morphologyUnknown);
    const identityPrecision =
      eligibleMissing[0]?.spendBlock.identityPrecision ||
      blockedMissing[0]?.spendBlock.identityPrecision ||
      classifySpendBlock(plant, demand).identityPrecision;
    if (cov.designReady && !plantBlocked) designReady += 1;
    else if (cov.approvedRequired > 0) partial += 1;
    else none += 1;

    plantRows.push({
      canonicalSlug: demand.canonicalSlug,
      scientific: demand.scientific,
      visualForm: demand.visualForm,
      habitModifiers: demand.habitModifiers,
      lifecycle: demand.lifecycle,
      purposeCapabilities: demand.purposeCapabilities,
      morphologyAuthority: demand.morphologyAuthority,
      morphologyUnknown: demand.morphologyUnknown,
      identityPrecision,
      requiredVariantCount: cov.required.length,
      optionalVariantCount: cov.optional.length,
      approvedRequiredCount: cov.approvedRequired,
      missingRequiredCount: cov.missingRequired.length,
      designReady: cov.designReady && !plantBlocked,
      spendBlocked: plantBlocked,
      blockReasons: [...new Set(blockedMissing.flatMap((b) => b.spendBlock.reasons || []))],
      priority: rank.priority,
      priorityBand: rank.band
    });

    for (const { miss, spendBlock } of blockedMissing) {
      blockedJobs.push({
        canonicalSlug: demand.canonicalSlug,
        variantKey: miss.variantKey,
        visualForm: demand.visualForm,
        required: true,
        state: 'BLOCKED',
        reasons: spendBlock.reasons,
        metadataFix: spendBlock.metadataFix,
        identityPrecision: spendBlock.identityPrecision,
        morphologyAuthority: demand.morphologyAuthority,
        habitModifiers: demand.habitModifiers,
        scientific: demand.scientific,
        priority: rank.priority,
        priorityBand: rank.band
      });
    }
    if (!cov.required.length) {
      const spendBlock = classifySpendBlock(plant, demand);
      if (spendBlock.blocked) {
        blockedJobs.push({
          canonicalSlug: demand.canonicalSlug,
          variantKey: null,
          visualForm: demand.visualForm,
          required: true,
          state: 'BLOCKED',
          reasons: spendBlock.reasons,
          metadataFix: spendBlock.metadataFix,
          identityPrecision: spendBlock.identityPrecision,
          morphologyAuthority: demand.morphologyAuthority,
          scientific: demand.scientific,
          priority: rank.priority,
          priorityBand: rank.band
        });
      }
    }

    for (const { miss, spendBlock } of eligibleMissing) {
      eligibleJobs.push({
        canonicalSlug: demand.canonicalSlug,
        variantKey: miss.variantKey,
        visualForm: demand.visualForm,
        growthStage: miss.growthStage,
        phenology: miss.phenology,
        season: miss.season,
        formView: miss.formView,
        required: true,
        optional: false,
        priority: rank.priority,
        priorityReason: rank.band,
        morphologyAuthority: demand.morphologyAuthority,
        habitModifiers: demand.habitModifiers,
        identityPrecision: spendBlock.identityPrecision,
        identityScope:
          spendBlock.identityPrecision === 'GENUS_VISUALLY_REPRESENTABLE' ? 'genus' : plant.identityScope || 'species',
        existingAssetCoverage: cov.approvedRequired > 0 ? 'partial' : 'none',
        estimatedGenerationCalls: 1,
        retryAllowance: 0,
        scientific: demand.scientific
      });
    }
  }

  eligibleJobs.sort((a, b) => b.priority - a.priority || a.canonicalSlug.localeCompare(b.canonicalSlug) || a.variantKey.localeCompare(b.variantKey));
  blockedJobs.sort((a, b) => b.priority - a.priority || a.canonicalSlug.localeCompare(b.canonicalSlug));

  return {
    plants: plantRows,
    eligibleJobs,
    blockedJobs,
    totals: {
      canonicalPlantsInspected: plants.length,
      plantsWithFullyResolvedMorphology: morphologyResolved,
      plantsWithUnknownMorphology: morphologyUnknown,
      plantsAlreadyDesignReady: designReady,
      plantsPartiallyCovered: partial,
      plantsWithNoDesignAssets: none,
      requiredVariantsTotal: requiredTotal,
      approvedRequiredVariants: approvedRequiredTotal,
      missingRequiredVariants: requiredTotal - approvedRequiredTotal,
      blockedJobs: blockedJobs.length,
      generationEligibleJobs: eligibleJobs.length,
      optionalExcludedFromDefaultProduction: true,
      cartesianExplosionAvoided: cartesianSafe
    }
  };
}

export function simulateDesignReady(inspect) {
  const blockedSlugs = new Set(inspect.blockedJobs.map((j) => j.canonicalSlug));
  const eligibleSlugs = new Set(inspect.eligibleJobs.map((j) => j.canonicalSlug));
  const current = inspect.totals.plantsAlreadyDesignReady;
  const potentialFromEligible = inspect.plants.filter(
    (p) => !p.spendBlocked && (p.designReady || eligibleSlugs.has(p.canonicalSlug))
  ).length;
  const remainingBlocked = inspect.plants.filter((p) => blockedSlugs.has(p.canonicalSlug)).length;
  return {
    currentDesignReadyCount: current,
    potentialDesignReadyCountAfterEligibleQueue: potentialFromEligible,
    remainingBlockedCount: remainingBlocked,
    assetsDoNotExist: true
  };
}

export function proposeBatches(inspect) {
  const byForm = new Map();
  for (const job of inspect.eligibleJobs) {
    if (!byForm.has(job.visualForm)) byForm.set(job.visualForm, job);
  }
  const calibration = [...byForm.values()].map((job, i) => ({
    rank: i + 1,
    canonicalSlug: job.canonicalSlug,
    variantKey: job.variantKey,
    visualForm: job.visualForm,
    priorityReason: job.priorityReason
  }));
  const launch = inspect.eligibleJobs.filter(
    (j) =>
      j.priorityReason === 'owned-plants' ||
      j.priorityReason === 'high-frequency-recommended' ||
      j.priorityReason === 'garden-design-surfaced' ||
      j.priorityReason === 'portfolio-launch-gaps'
  );
  const scale = inspect.eligibleJobs.filter((j) => j.priorityReason === 'remaining-catalog');
  return {
    calibrationBatch: {
      purpose: 'smallest batch covering major morphology classes present in the eligible queue',
      jobCount: calibration.length,
      jobs: calibration
    },
    launchCoverageBatch: {
      purpose: 'owned + recommended + Garden Design surfaced missing required variants',
      jobCount: launch.length,
      canonicalSlugs: [...new Set(launch.map((j) => j.canonicalSlug))]
    },
    scaleBatch: {
      purpose: 'remaining catalog only after measured paid success exists',
      jobCount: scale.length,
      deferredUntilMeasuredSuccess: true
    }
  };
}

export function realQueueCostScenarios(eligibleCount, usdPerCall = GENERATION_USD_PER_IMAGE_OUTPUT) {
  const firstPassCalls = eligibleCount;
  const scenarios = [
    { retryRate: 0, extraCalls: 0 },
    { retryRate: 0.2, extraCalls: Math.round(eligibleCount * 0.2) },
    { retryRate: 0.4, extraCalls: Math.round(eligibleCount * 0.4) }
  ].map((s) => ({
    retryRate: s.retryRate,
    generationCalls: firstPassCalls + s.extraCalls,
    generationCostUsd: +((firstPassCalls + s.extraCalls) * usdPerCall).toFixed(2)
  }));
  return {
    label: 'ASSUMPTION_ONLY',
    measuredFirstPassSuccess: 'UNKNOWN',
    usdPerImageOutput: usdPerCall,
    firstPassCalls,
    firstPassCostUsd: +(firstPassCalls * usdPerCall).toFixed(2),
    qaCostUsd: 0,
    retryScenarios: scenarios,
    note: 'Do not treat any first-pass percent as measured. Paid native-alpha pilot produced 0 images.'
  };
}

export function storageImpact(fileCount) {
  const sizes = [
    { averageBytes: 500 * 1024, label: '500 KB' },
    { averageBytes: 1024 * 1024, label: '1 MB' },
    { averageBytes: 2 * 1024 * 1024, label: '2 MB' }
  ];
  return {
    fileCount,
    estimates: sizes.map((s) => ({
      average: s.label,
      totalBytes: fileCount * s.averageBytes,
      totalMiB: +((fileCount * s.averageBytes) / (1024 * 1024)).toFixed(2)
    })),
    comparison: {
      repoNetlifyBundle: 'Not viable at catalog scale; binaries would bloat frontend deploys.',
      objectStorageCdn: 'Recommended. catalog-design-assets bucket; URLs are not identity.',
      migrationNow: false
    }
  };
}

export function ownedPlantPriorityReport(inspect, ownedSignals) {
  return (ownedSignals.ownedPlants || []).map((row) => {
    const plant = inspect.plants.find((p) => p.canonicalSlug === row.canonicalSlug);
    const missing = inspect.eligibleJobs.filter((j) => j.canonicalSlug === row.canonicalSlug);
    const blocked = inspect.blockedJobs.filter((j) => j.canonicalSlug === row.canonicalSlug);
    return {
      canonicalSlug: row.canonicalSlug,
      gardenPlantId: row.gardenPlantId,
      name: row.name,
      priorityScore: plant?.priority ?? FACTORY_PRIORITY_BANDS.REMAINING_CATALOG,
      priorityBand: plant?.priorityBand || null,
      priorityComponents: {
        ownedGardenPlant: true,
        hardCodedNameBoost: false
      },
      requiredMissingEligible: missing.map((j) => j.variantKey),
      blocked: blocked.length > 0,
      blockedReasons: [...new Set(blocked.flatMap((b) => b.reasons || []))],
      metadataFix: blocked[0]?.metadataFix || []
    };
  });
}

export function genusEligibilityDelta(inspect) {
  const newlyEligible = [];
  const stillBlocked = [];
  for (const plant of inspect.plants || []) {
    const genusLike =
      plant.identityPrecision === 'GENUS_VISUALLY_REPRESENTABLE' ||
      plant.identityPrecision === 'GENUS_BLOCKED' ||
      /\bspp\.?\b/i.test(String(plant.scientific || ''));
    if (!genusLike) continue;
    const eligible = (inspect.eligibleJobs || []).filter((j) => j.canonicalSlug === plant.canonicalSlug);
    const blocked = (inspect.blockedJobs || []).filter((j) => j.canonicalSlug === plant.canonicalSlug);
    const row = {
      canonicalSlug: plant.canonicalSlug,
      scientific: plant.scientific,
      visualForm: plant.visualForm,
      identityPrecision: plant.identityPrecision,
      previousPolicy: 'genus-only always BLOCKED',
      eligibleJobs: eligible.map((j) => j.variantKey),
      blockedReasons: plant.blockReasons || blocked[0]?.reasons || []
    };
    if (eligible.length) newlyEligible.push(row);
    else stillBlocked.push(row);
  }
  return {
    previousPolicy: 'genus-only canonical identity always BLOCKED',
    newlyEligibleGenusNeutralPlants: newlyEligible,
    stillBlockedGenusLevelPlants: stillBlocked,
    genusPlantCount: newlyEligible.length + stillBlocked.length,
    previouslyBlockedGenusLevelCount: newlyEligible.length + stillBlocked.length
  };
}

export function zeroNetworkProof() {
  return {
    attemptedNetworkCalls: 0,
    attemptedPaidCalls: 0,
    approvedSpendUsd: 0,
    actualSpendUsd: 0,
    maxSpendUsd: 0,
    stoppedBeforeProviderAdapter: true,
    generateAssetInvoked: false
  };
}

