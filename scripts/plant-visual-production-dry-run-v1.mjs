#!/usr/bin/env node
/**
 * Zero-spend Plant Visual Production Pipeline dry-run.
 * Produces the catalog-scale missing-asset queue. Never calls providers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCanonicalCatalog, loadOwnedGardenSignals } from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import { buildPlantVisualProductionPlan } from '../modules/garden-design/asset-factory-v1/plant-visual-production-pipeline-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
const OWNED = path.join(ROOT, 'data/garden-os/mojstrana-owned-plants-v1.json');
const OUT = path.join(ROOT, 'data/garden-design/plant-visual-production-pipeline-v1');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const catalog = loadCanonicalCatalog(ROOT);
const registry = readJson(REGISTRY);
let owned = { ownedCanonicalSlugs: [], ownedPlants: [] };
if (fs.existsSync(OWNED)) owned = loadOwnedGardenSignals(readJson(OWNED));

const plan = buildPlantVisualProductionPlan(
  catalog.plants,
  registry,
  {
    ownedCanonicalSlugs: owned.ownedCanonicalSlugs,
    gardenDesignSurfacedSlugs: (registry.sets || []).map((s) => s.canonicalSlug)
  },
  { autoApprovalEnabled: false }
);

const summary = {
  contract: 'plant-visual-production-pipeline-v1',
  mode: 'DRY_RUN_ZERO_SPEND',
  generatedAt: new Date().toISOString(),
  catalogPlants: catalog.plants.length,
  requiredGapCount: plan.requiredGapCount,
  blockedCount: plan.blockedCount,
  queuedJobs: plan.jobs.length,
  paidCalls: 0,
  generationStarted: false,
  productionRegistryWritten: false,
  topPriorityJobs: plan.jobs.slice(0, 100).map((job) => ({
    jobId: job.jobId,
    canonicalSlug: job.canonicalSlug,
    priority: job.priority,
    priorityBand: job.priorityBand,
    visualForm: job.visualForm,
    growthStage: job.growthStage,
    phenology: job.phenology,
    architectureMode: job.architectureMode || null,
    quality: job.qualityPlan?.quality || null,
    detailClass: job.qualityPlan?.detailClass || null
  })),
  blocked: plan.blocked
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'dry-run-summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'dry-run-jobs.json'), JSON.stringify(plan.jobs, null, 2) + '\n');

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
