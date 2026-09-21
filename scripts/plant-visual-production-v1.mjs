/**
 * Plant Visual Production Pipeline V1 CLI.
 *
 * Default:
 *   node scripts/plant-visual-production-v1.mjs --dry-run
 *
 * Paid candidate generation requires all of:
 *   --run-id=<id>
 *   --approve-envelope=<same id>
 *   --owner-approve-run=<same id>
 *   --execute-production-run=<same id>
 *   --max-jobs=N --max-calls=N --max-spend-usd=X --allow-paid-calls=N
 *
 * This script never writes the live production registry.
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
  buildPlantVisualProductionPlan,
  summarizePlantVisualPipeline
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-pipeline-v1.js';
import {
  executePlantVisualProductionRun,
  parsePlantVisualProductionApproval
} from '../modules/garden-design/asset-factory-v1/plant-visual-production-execute-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPORT_DIR = path.join(ROOT, 'data', 'garden-design', 'plant-visual-production-v1');

function loadJson(rel, fallback = null) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function readKeyRaw() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

function writeJson(name, value) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const abs = path.join(REPORT_DIR, name);
  fs.writeFileSync(abs, JSON.stringify(value, null, 2) + '\n');
  return path.relative(ROOT, abs).replace(/\\/g, '/');
}

export function buildCurrentPlantVisualPlan() {
  const catalog = loadCanonicalCatalog(ROOT);
  const registry =
    loadJson('modules/garden-design/assets/plants/design-asset-registry-v1.json', { sets: [] }) ||
    { sets: [] };
  const owned =
    loadJson('data/garden-os/mojstrana-owned-plants-v1.json', { garden_plants: [] }) ||
    { garden_plants: [] };
  const ownedSignals = loadOwnedGardenSignals(owned);
  const signals = {
    ownedCanonicalSlugs: ownedSignals.ownedCanonicalSlugs,
    highFrequencyRecommendedSlugs: [],
    gardenDesignSurfacedSlugs: designSurfacedSlugs(registry),
    portfolioLaunchSlugs: []
  };
  const plan = buildPlantVisualProductionPlan(catalog.plants, registry, signals, {
    autoApprovalEnabled: false
  });
  return {
    catalog,
    registry,
    signals,
    plan,
    ownerWorkloadTarget: 'exceptions-only',
    generationOnLookup: false,
    generationOnRender: false
  };
}

export async function main(argv = process.argv.slice(2)) {
  const current = buildCurrentPlantVisualPlan();
  const approval = parsePlantVisualProductionApproval(argv);

  if (!approval.ownerApprovedThisRunOnly) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'DRY_RUN_DEFAULT_DENY',
      plan: current.plan,
      summary: summarizePlantVisualPipeline(current.plan, []),
      signals: current.signals,
      imagesGenerated: 0,
      attemptedCalls: 0,
      actualSpendUsd: 0,
      productionRegistryChanged: false,
      note:
        'Planning only. To generate candidates, supply a fresh exact owner-approved spend envelope for this run.'
    };
    const reportPath = writeJson('latest-plan.json', report);
    console.log(JSON.stringify({
      blocked: true,
      reason: 'PAID_SPEND_DENIED',
      reportPath,
      requiredGapCount: current.plan.requiredGapCount,
      blockedBeforeSpend: current.plan.blockedCount,
      imagesGenerated: 0,
      productionRegistryChanged: false
    }, null, 2));
    return 0;
  }

  const result = await executePlantVisualProductionRun(argv, {
    root: ROOT,
    plants: current.catalog.plants,
    registry: current.registry,
    signals: current.signals,
    apiKeyRaw: readKeyRaw(),
    realSavedGardenPhotoReady: false,
    writeFiles: true
  });
  const reportPath = writeJson('latest-execution.json', {
    generatedAt: new Date().toISOString(),
    ...result
  });
  console.log(JSON.stringify({
    blocked: result.blocked,
    reason: result.reason,
    reportPath,
    attemptedCalls: result.attemptedCalls,
    imagesGenerated: result.imagesGenerated,
    actualSpendUsd: result.actualSpendUsd,
    productionRegistryChanged: result.productionRegistryChanged
  }, null, 2));
  return result.blocked ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  });
}
