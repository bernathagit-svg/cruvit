#!/usr/bin/env node
/**
 * Owner quality review consolidation overlay. Zero spend. No generation.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeOwnerQualityReviewConsolidation,
  writeOwnerQualityReviewConsolidationReports
} from '../modules/garden-design/asset-factory-v1/owner-quality-review-consolidation-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writeOwnerQualityReviewConsolidationReports(root);
const spend = executeOwnerQualityReviewConsolidation();
process.stdout.write(
  `${JSON.stringify(
    {
      verdict: written.verdict,
      massReady: written.massReady,
      appleRootCause: written.appleRootCause,
      openaiCalls: spend.openaiCalls,
      imageGeneration: spend.imageGeneration,
      additionalSpendUsd: spend.additionalSpendUsd,
      spendGate: spend.spendGate,
      assetsAutoApproved: spend.assetsAutoApproved
    },
    null,
    2
  )}\n`
);
