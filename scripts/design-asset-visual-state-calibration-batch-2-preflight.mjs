/**
 * Presence-only preflight. Does not print secrets. Does not call OpenAI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { inspectOpenAiKeyPresenceOnly } from '../modules/garden-design/asset-factory-v1/calibration-paid-preflight-v1.js';
import {
  BATCH_2_JOBS,
  BATCH_2_SPEND_GATE,
  VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-prep-v1.js';
import { PAID_IMAGE_MODEL } from '../modules/runtime-guards/paid-image-spend-gate-v1.js';
import {
  lockedBatch2IdentityKeys,
  manifestMatchesApproved,
  OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2
} from '../modules/garden-design/asset-factory-v1/visual-state-calibration-batch-2-execute-v1.js';

function readKeyRaw(root) {
  const fromEnv = String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name === 'OPENAI_API_KEY' || name === 'OPENAI_KEY') return value;
  }
  return '';
}

const root = process.cwd();
const key = inspectOpenAiKeyPresenceOnly(readKeyRaw(root));
const report = {
  openaiApiKey: key.openaiApiKey,
  charactersPrinted: key.charactersPrinted,
  validityTested: false,
  model: PAID_IMAGE_MODEL,
  modelLocked: PAID_IMAGE_MODEL === 'gpt-image-2.5-flare-2026-09-08',
  runId: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID,
  runIdMatch: VISUAL_STATE_CALIBRATION_BATCH_2_RUN_ID === 'design-asset-visual-state-calibration-batch-2',
  jobs: BATCH_2_JOBS.length,
  manifestMatch: manifestMatchesApproved(BATCH_2_JOBS),
  identity: lockedBatch2IdentityKeys(),
  maxJobs: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.maxJobs,
  maxCalls: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.maxCalls,
  maxRetries: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.maxRetries,
  maxSpendUsd: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.maxSpendUsd,
  spendGateDefault: BATCH_2_SPEND_GATE.state,
  previousApprovalReuse: OWNER_APPROVED_VISUAL_STATE_CALIBRATION_BATCH_2.previousApprovalReuse,
  generateOnRender: false,
  productionRegistryWrite: false,
  autoApproval: false
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exit(key.openaiApiKey === 'PRESENT' && report.manifestMatch ? 0 : 2);
