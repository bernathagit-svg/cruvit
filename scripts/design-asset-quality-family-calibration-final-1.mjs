#!/usr/bin/env node
/**
 * Quality-family final calibration prep overlay. Zero spend. Do not execute.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeQualityFamilyCalibrationFinal,
  writeQualityFamilyCalibrationFinalReports
} from '../modules/garden-design/asset-factory-v1/quality-family-calibration-final-prep-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writeQualityFamilyCalibrationFinalReports(root);
const spend = executeQualityFamilyCalibrationFinal();
process.stdout.write(
  `${JSON.stringify(
    {
      verdict: written.verdict,
      jobsPrepared: 7,
      openaiCalls: spend.openaiCalls,
      imageGeneration: spend.imageGeneration,
      additionalSpendUsd: spend.additionalSpendUsd,
      spendGate: spend.spendGate,
      highJobs: spend.highJobs,
      massGenerationStarted: spend.massGenerationStarted
    },
    null,
    2
  )}\n`
);
