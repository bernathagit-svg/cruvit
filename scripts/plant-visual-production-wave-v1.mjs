/**
 * Plant Visual Production Wave V1 CLI.
 *
 * Planning only. No provider calls. No image generation. No live registry writes.
 *
 *   node scripts/plant-visual-production-wave-v1.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCanonicalCatalog,
  loadOwnedGardenSignals,
  designSurfacedSlugs
} from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import {
  buildPlantVisualProductionWavePlan
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-wave-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_REL = 'data/garden-design/plant-visual-production-wave-v1.json';

function loadJson(rel, fallback = null) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function intFlag(argv, name, fallback) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => String(arg).startsWith(prefix));
  const n = found ? Number(String(found).slice(prefix.length)) : Number(fallback);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function runPlantVisualWaveDryRun(argv = process.argv.slice(2), options = {}) {
  const catalog = loadCanonicalCatalog(options.root || ROOT);
  const registry = loadJson(
    'modules/garden-design/assets/plants/design-asset-registry-v1.json',
    { sets: [] }
  );
  const sizeAuthorityRegistry = loadJson('data/catalog/botanical-size-authority-v1.json', null);
  const ownedDoc = loadJson('data/garden-os/mojstrana-owned-plants-v1.json', { garden_plants: [] });
  const owned = loadOwnedGardenSignals(ownedDoc);
  const signals = {
    ownedCanonicalSlugs: owned.ownedCanonicalSlugs || [],
    gardenDesignSurfacedSlugs: designSurfacedSlugs(registry),
    highFrequencyRecommendedSlugs: [],
    portfolioLaunchSlugs: []
  };
  const plan = buildPlantVisualProductionWavePlan(
    catalog.plants || [],
    registry,
    signals,
    {
      generatedAt: new Date().toISOString(),
      botanicalSizeAuthorityRegistry: sizeAuthorityRegistry,
      policy: {
        maxJobsPerWave: intFlag(argv, 'max-jobs-per-wave', 24),
        maxPlantsPerWave: intFlag(argv, 'max-plants-per-wave', 12),
        ownerReviewCapacityPerWave: intFlag(argv, 'owner-review-capacity', 8)
      }
    }
  );
  return plan;
}

export function main(argv = process.argv.slice(2)) {
  const plan = runPlantVisualWaveDryRun(argv);
  const out = path.join(ROOT, OUT_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify({
    version: plan.version,
    planningOnly: true,
    networkCalls: 0,
    paidCalls: 0,
    registryWrites: 0,
    totalPlants: plan.totalPlants,
    totalJobs: plan.totalJobs,
    waveCount: plan.waveCount,
    blockedCount: plan.blockedCount,
    output: OUT_REL
  }, null, 2));
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main();
