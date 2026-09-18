/**
 * Factory runner. Default deny. Dry-run may detect gaps locally.
 * Never enables provider network from this module.
 */
import { DESIGN_ASSET_FACTORY, FACTORY_PIPELINE_STEPS } from './design-asset-factory-v1.js';
import { detectDesignAssetGaps } from './gap-detector-v1.js';
import { createJobStore, upsertNeededJob } from './job-model-v1.js';
import { buildPromptRecord } from './prompt-factory-v1.js';
import {
  parseSpendEnvelope,
  classifyProviderKey,
  buildEnvelopePreflight,
  formatEnvelopePreflight
} from './spend-envelope-v1.js';
import { estimateScale, ownerWorkloadModel } from './cost-model-v1.js';

export function normalizeFactoryPlant(raw) {
  if (!raw) return null;
  return {
    slug: raw.slug,
    canonicalSlug: raw.canonicalSlug || raw.slug,
    scientific: raw.scientific || raw.scientificName || null,
    tags: raw.tags || [],
    growth: raw.growth || raw.care?.growth,
    care: raw.care,
    climateTraits: raw.climateTraits,
    identityScope: raw.identityScope
  };
}

export function runFactory(argv = [], options = {}) {
  const envelope = parseSpendEnvelope(argv);
  const keyStatus = classifyProviderKey(envelope, options.apiKeyRaw || '');
  const plants = (options.plants || []).map(normalizeFactoryPlant).filter(Boolean);
  const registry = options.registry || { sets: [] };
  const signals = options.signals || {};
  const gaps = detectDesignAssetGaps(plants, registry, signals);
  const store = createJobStore();
  for (const gapJob of gaps.jobs) {
    upsertNeededJob(store, gapJob);
  }
  const plannedJobs = envelope.defaultDeny || envelope.dryRun ? 0 : Math.min(gaps.jobs.length, envelope.maxJobs);
  const preflight = buildEnvelopePreflight(envelope, keyStatus, plannedJobs);
  const samplePrompts = gaps.jobs.slice(0, 3).map((job) =>
    buildPromptRecord(job, { provider: envelope.provider, model: envelope.model })
  );

  const result = {
    factory: DESIGN_ASSET_FACTORY,
    pipeline: FACTORY_PIPELINE_STEPS,
    blocked: envelope.defaultDeny || envelope.dryRun,
    reason: envelope.dryRun ? 'dry-run' : envelope.defaultDeny ? 'default-deny' : 'envelope-present',
    networkRequests: 0,
    allowNetwork: false,
    attemptedCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    maxApprovedCalls: preflight.maximumApprovedCalls,
    requiredGapCount: gaps.requiredGapCount,
    blockedMorphologyCount: gaps.blocked.length,
    jobsQueued: store.byId.size,
    preflight,
    preflightText: formatEnvelopePreflight(preflight),
    samplePrompts,
    costModel: {
      plants100: estimateScale(100),
      plants500: estimateScale(500),
      plants1000: estimateScale(1000)
    },
    ownerWorkload: ownerWorkloadModel(),
    liveRegistryWritten: false,
    imagesGenerated: false
  };
  return result;
}
