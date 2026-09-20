#!/usr/bin/env node
/**
 * Visual State Calibration Batch 2.
 * Default: DENY. Owner-approved flags required for this-run-only paid execution.
 *
 *   node scripts/design-asset-visual-state-calibration-batch-2.mjs
 *   node scripts/design-asset-visual-state-calibration-batch-2.mjs --run-id=... --owner-approve-run=...
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeVisualStateCalibrationBatch2 } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';
import {
  executeVisualStateCalibrationBatch2Paid,
  parseOwnerApprovedVisualStateCalibrationBatch2
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-execute-v1.js';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseOwnerApprovedVisualStateCalibrationBatch2(argv);
  if (parsed.ownerApprovedThisRunOnly !== true) {
    const result = executeVisualStateCalibrationBatch2();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.executed ? 1 : 0;
  }
  const result = await executeVisualStateCalibrationBatch2Paid(argv);
  const report = {
    blocked: result.blocked,
    executed: result.executed,
    reason: result.reason,
    runId: result.runId,
    model: result.model,
    approvalState: result.approvalState,
    attemptedCalls: result.attemptedCalls,
    successfulCalls: result.successfulCalls,
    failedCalls: result.failedCalls,
    retries: result.retries,
    actualSpendUsd: result.actualSpendUsd,
    imagesGenerated: result.imagesGenerated,
    extraJobs: result.extraJobs,
    autoApprovedAssets: result.autoApprovedAssets,
    productionRegistryChanged: result.productionRegistryChanged,
    spendGateFinal: result.spendGateFinal,
    ownerReviewPage: result.ownerReviewPage || null,
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
