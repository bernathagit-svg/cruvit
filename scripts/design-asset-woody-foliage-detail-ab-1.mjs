#!/usr/bin/env node
/**
 * Woody foliage detail A/B. Default DENY. Owner-approved flags required.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeWoodyFoliageDetailAb } from '../modules/garden-design/asset-factory-v1/woody-foliage-detail-ab-prep-v1.js';
import {
  executeWoodyFoliageDetailAbPaid,
  parseOwnerApprovedWoodyFoliageDetailAb
} from '../modules/garden-design/asset-factory-v1/woody-foliage-detail-ab-execute-v1.js';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseOwnerApprovedWoodyFoliageDetailAb(argv);
  if (parsed.ownerApprovedThisRunOnly !== true) {
    const result = executeWoodyFoliageDetailAb();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.executed ? 1 : 0;
  }
  const result = await executeWoodyFoliageDetailAbPaid(argv);
  const report = {
    blocked: result.blocked,
    executed: result.executed,
    reason: result.reason,
    runId: result.runId,
    model: result.model,
    attemptedCalls: result.attemptedCalls,
    successfulCalls: result.successfulCalls,
    retries: result.retries,
    actualSpendUsd: result.actualSpendUsd,
    imagesGenerated: result.imagesGenerated,
    autoApprovedAssets: result.autoApprovedAssets,
    productionRegistryChanged: result.productionRegistryChanged,
    productionFactoryPromptChanged: result.productionFactoryPromptChanged,
    productionFactoryQualityChanged: result.productionFactoryQualityChanged,
    spendGateFinal: result.spendGateFinal,
    failFast: result.failFast || null
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (result.blocked) return 2;
  return 0;
}

if (isMain) {
  main().then((code) => process.exit(code));
}
