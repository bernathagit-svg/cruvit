/**
 * CRUVIT Plant Visual Production Wave Planner V1.
 * Pure planning only: no network, no image generation, no registry writes.
 */
import { buildPlantVisualProductionPlan } from './plant-visual-production-pipeline-v1.js';

export const PLANT_VISUAL_PRODUCTION_WAVE_VERSION = 'plant-visual-production-wave-v1';

export const DEFAULT_WAVE_POLICY = Object.freeze({
  maxJobsPerWave: 24,
  maxPlantsPerWave: 12,
  ownerReviewCapacityPerWave: 8,
  preferOwnedPlants: true,
  preferGardenDesignSurfaced: true
});

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function priorityScore(job = {}, signals = {}) {
  const slug = String(job.canonicalSlug || '').toLowerCase();
  let score = 0;
  if ((signals.ownedCanonicalSlugs || []).includes(slug)) score += 1000;
  if ((signals.gardenDesignSurfacedSlugs || []).includes(slug)) score += 500;
  if ((signals.highFrequencyRecommendedSlugs || []).includes(slug)) score += 250;
  if ((signals.portfolioLaunchSlugs || []).includes(slug)) score += 150;
  if (job.required === true) score += 100;
  if (job.priority === 'P0') score += 80;
  if (job.priority === 'P1') score += 60;
  if (job.priority === 'P2') score += 40;
  return score;
}

export function rankPlantVisualJobs(jobs = [], signals = {}) {
  return [...jobs]
    .map((job, index) => ({
      ...job,
      productionPriorityScore: priorityScore(job, signals),
      originalOrder: index
    }))
    .sort((a, b) =>
      b.productionPriorityScore - a.productionPriorityScore ||
      String(a.canonicalSlug || '').localeCompare(String(b.canonicalSlug || '')) ||
      String(a.jobId || '').localeCompare(String(b.jobId || '')) ||
      a.originalOrder - b.originalOrder
    );
}

export function partitionPlantVisualWaves(jobs = [], options = {}) {
  const policy = { ...DEFAULT_WAVE_POLICY, ...(options.policy || {}) };
  const maxJobs = Math.max(1, Number(policy.maxJobsPerWave) || DEFAULT_WAVE_POLICY.maxJobsPerWave);
  const maxPlants = Math.max(1, Number(policy.maxPlantsPerWave) || DEFAULT_WAVE_POLICY.maxPlantsPerWave);
  const ranked = rankPlantVisualJobs(jobs, options.signals || {});
  const waves = [];
  let current = [];
  let slugs = new Set();

  function flush() {
    if (!current.length) return;
    waves.push({
      waveId: `visual-wave-${String(waves.length + 1).padStart(3, '0')}`,
      jobs: current,
      jobCount: current.length,
      plantCount: slugs.size,
      canonicalSlugs: unique(current.map((job) => job.canonicalSlug)),
      ownerReviewCapacity: Number(policy.ownerReviewCapacityPerWave || 0),
      paidExecutionApproved: false,
      productionRegistryWritten: false
    });
    current = [];
    slugs = new Set();
  }

  for (const job of ranked) {
    const slug = String(job.canonicalSlug || '');
    const addingNewPlant = slug && !slugs.has(slug);
    if (current.length >= maxJobs || (addingNewPlant && slugs.size >= maxPlants)) flush();
    current.push(job);
    if (slug) slugs.add(slug);
  }
  flush();
  return waves;
}

export function buildPlantVisualProductionWavePlan(plants = [], registry = {}, signals = {}, options = {}) {
  const productionPlan = buildPlantVisualProductionPlan(plants, registry, signals, {
    autoApprovalEnabled: false
  });
  const waves = partitionPlantVisualWaves(productionPlan.jobs, {
    signals,
    policy: options.policy
  });
  return {
    version: PLANT_VISUAL_PRODUCTION_WAVE_VERSION,
    generatedAt: options.generatedAt || null,
    policy: { ...DEFAULT_WAVE_POLICY, ...(options.policy || {}) },
    planningOnly: true,
    networkCalls: 0,
    paidCalls: 0,
    registryWrites: 0,
    requiredGapCount: productionPlan.requiredGapCount,
    blockedCount: productionPlan.blockedCount,
    totalJobs: productionPlan.jobs.length,
    totalPlants: unique(productionPlan.jobs.map((job) => job.canonicalSlug)).length,
    waveCount: waves.length,
    waves,
    blocked: productionPlan.blocked
  };
}
