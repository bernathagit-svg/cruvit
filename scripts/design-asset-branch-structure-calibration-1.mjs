#!/usr/bin/env node
/**
 * BRANCH_STRUCTURE calibration overlay. Zero spend. Do not execute.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeBranchStructureCalibration,
  writeBranchStructureCalibrationReports
} from '../modules/garden-design/asset-factory-v1/branch-structure-calibration-prep-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writeBranchStructureCalibrationReports(root);
const spend = executeBranchStructureCalibration();
process.stdout.write(
  `${JSON.stringify(
    {
      verdict: written.verdict,
      jobsPrepared: spend.jobsPrepared,
      highJobs: spend.highJobs,
      openaiCalls: spend.openaiCalls,
      imageGeneration: spend.imageGeneration,
      additionalSpendUsd: spend.additionalSpendUsd,
      spendGate: spend.spendGate
    },
    null,
    2
  )}\n`
);
