#!/usr/bin/env node
/**
 * Quality planning integrity overlay. Zero spend.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeQualityPlanningIntegrity,
  writeQualityPlanningIntegrityReports
} from '../modules/garden-design/asset-factory-v1/design-asset-quality-planning-integrity-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writeQualityPlanningIntegrityReports(root);
const spend = executeQualityPlanningIntegrity();
process.stdout.write(
  `${JSON.stringify(
    {
      verdict: written.verdict,
      massReady: written.massReady,
      openaiCalls: spend.openaiCalls,
      imageGeneration: spend.imageGeneration,
      additionalSpendUsd: spend.additionalSpendUsd,
      spendGate: spend.spendGate
    },
    null,
    2
  )}\n`
);
