/**
 * CRUVIT Plant Visual Production Pipeline V1 CLI.
 *
 * Default behavior is planning-only and zero network.
 * Paid generation requires a matching owner run approval:
 *   --run-id=<id>
 *   --approve-envelope=<id>
 *   --owner-approve-run=<id>
 *   --execute-production-run=<id>
 * plus explicit max-jobs/max-calls/max-spend/allow-paid-calls.
 *
 * This CLI never writes the live production registry.
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
  buildPlantVisualProductionPlan
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-pipeline-v1.js';
import {
  executePlantVisualProductionRun,
  parsePlantVisualProductionApproval
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-execute-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'data', 'garden-design', 'plant-visual-production-pipeline-v1');

function readJson(rel, fallback) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function readKeyRaw() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

function buildInputs() {
  const catalog = loadCanonicalCatalog(ROOT);
  const registry = readJson(
    path.join('modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json'),
    { sets: [] }
  );
  const ownedDoc = readJson(path.join('data', 'garden-os', 'mojstrana-owned-plants-v1.json'), {
    garden_plants: []
  });
  const owned = loadOwnedGardenSignals(ownedDoc);
  const signals = {
    ownedCanonicalSlugs: owned.ownedCanonicalSlugs,
    highFrequencyRecommendedSlugs: [],
    gardenDesignSurfacedSlugs: designSurfacedSlugs(registry),
    portfolioLaunchSlugs: []
  };
  return { catalog, registry, owned, signals };
}

export async function runPlantVisualPipeline(argv = process.argv.slice(2), options = {}) {
  const { catalog, registry, owned, signals } = buildInputs();
  const plan = buildPlantVisualProductionPlan(catalog.plants, registry, signals);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, 'latest-plan.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      catalogCount: catalog.plants.length,
      ownedGarden: owned.gardenLabel,
      ...plan
    }, null, 2)}\n`
  );

  const approval = parsePlantVisualProductionApproval(argv);
  if (!approval.ownerApprovedThisRunOnly) {
    return {
      mode: 'PLAN_ONLY',
      networkRequests: 0,
      imagesGenerated: 0,
      productionRegistryWritten: false,
      planPath: 'data/garden-design/plant-visual-production-pipeline-v1/latest-plan.json',
      plan
    };
  }

  const result = await executePlantVisualProductionRun(argv, {
    root: options.root || ROOT,
    plants: catalog.plants,
    registry,
    signals,
    apiKeyRaw: options.apiKeyRaw ?? readKeyRaw(),
    writeFiles: options.writeFiles !== false,
    realSavedGardenPhotoReady: options.realSavedGardenPhotoReady === true,
    inGardenQaByJobId: options.inGardenQaByJobId || {}
  });
  fs.writeFileSync(
    path.join(OUT_DIR, 'latest-run.json'),
    `${JSON.stringify(result, null, 2)}\n`
  );
  return {
    mode: 'OWNER_APPROVED_GENERATION_RUN',
    planPath: 'data/garden-design/plant-visual-production-pipeline-v1/latest-plan.json',
    runPath: 'data/garden-design/plant-visual-production-pipeline-v1/latest-run.json',
    ...result
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runPlantVisualPipeline()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(err && err.stack ? err.stack : String(err));
      process.exitCode = 1;
    });
}
