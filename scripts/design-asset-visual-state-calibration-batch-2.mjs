#!/usr/bin/env node
/**
 * Visual State Calibration Batch 2.
 * PREPARATION / DENY only. Does not generate. Does not call OpenAI.
 *
 *   node scripts/design-asset-visual-state-calibration-batch-2.mjs
 */
import { executeVisualStateCalibrationBatch2 } from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';

const result = executeVisualStateCalibrationBatch2();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.executed ? 1 : 0);
