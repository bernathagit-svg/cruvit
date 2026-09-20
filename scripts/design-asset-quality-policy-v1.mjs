#!/usr/bin/env node
/**
 * Design Asset Quality Policy V1. Overlay only. Zero spend.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeDesignAssetQualityPolicyV1,
  writeDesignAssetQualityPolicyReports
} from '../modules/garden-design/asset-factory-v1/design-asset-quality-policy-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const written = writeDesignAssetQualityPolicyReports(root);
const execute = executeDesignAssetQualityPolicyV1();
process.stdout.write(
  `${JSON.stringify(
    {
      verdict: written.verdict,
      openaiCalls: execute.openaiCalls,
      imageGeneration: execute.imageGeneration,
      additionalSpendUsd: execute.additionalSpendUsd,
      spendGate: execute.spendGate,
      productionRegistryChanged: execute.productionRegistryChanged
    },
    null,
    2
  )}\n`
);
