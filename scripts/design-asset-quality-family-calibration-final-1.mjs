#!/usr/bin/env node
/**
 * Quality-family final calibration. Default DENY. Owner-approved flags required.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeQualityFamilyCalibrationFinal } from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-prep-v1.js';
import {
  executeQualityFamilyCalibrationFinalPaid,
  parseOwnerApprovedQualityFamilyFinal
} from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-execute-v1.js';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseOwnerApprovedQualityFamilyFinal(argv);
  if (parsed.ownerApprovedThisRunOnly !== true) {
    const result = executeQualityFamilyCalibrationFinal();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.executed ? 1 : 0;
  }
  const result = await executeQualityFamilyCalibrationFinalPaid(argv);
  const report = {
    blocked: result.blocked,
    executed: result.executed,
    reason: result.reason,
    runId: result.runId,
    model: result.model,
    attemptedCalls: result.attemptedCalls,
    successfulCalls: result.successfulCalls,
    failedCalls: result.failedCalls,
    retries: result.retries,
    actualSpendUsd: result.actualSpendUsd,
    imagesGenerated: result.imagesGenerated,
    extraJobs: result.extraJobs,
    autoApprovedAssets: result.autoApprovedAssets,
    highCalls: result.highCalls,
    productionRegistryChanged: result.productionRegistryChanged,
    massGenerationStarted: result.massGenerationStarted,
    spendGateFinal: result.spendGateFinal,
    liveReviewHash: result.liveReviewHash || null,
    failFast: result.failFast || null
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (result.blocked) return 2;
  return 0;
}

if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err && err.code ? err.code : 'fatal');
      process.exit(1);
    });
}
