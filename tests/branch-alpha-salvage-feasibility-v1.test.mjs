/**
 * BRANCH alpha salvage feasibility. Zero spend. Originals must stay unmodified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  BRANCH_ALPHA_SALVAGE_RUN_ID,
  NEW_APPLE_DORMANT_CANDIDATE,
  RGB_STRUCTURE_RESULTS,
  SALVAGE_VERDICTS,
  executeBranchAlphaSalvageFeasibility,
  writeBranchAlphaSalvageReports
} from '../modules/garden-design/asset-factory-v1/branch-alpha-salvage-feasibility-v1.js';
import { APPLE_DORMANT_CANDIDATE } from '../modules/garden-design/asset-factory-v1/apple-dormant-root-cause-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('branch alpha salvage is a zero-spend feasibility audit and does not touch originals', () => {
  const controlPath = path.join(ROOT, APPLE_DORMANT_CANDIDATE.file);
  const newPath = path.join(ROOT, NEW_APPLE_DORMANT_CANDIDATE.file);
  const registryPath = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
  const controlBefore = crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex');
  const newBefore = crypto.createHash('sha256').update(fs.readFileSync(newPath)).digest('hex');
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex');

  const spend = executeBranchAlphaSalvageFeasibility();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.highExecuted, false);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.spendGate, 'DENIED');

  const written = writeBranchAlphaSalvageReports(ROOT);
  assert.equal(written.verdict, 'BRANCH_ALPHA_SALVAGE_FEASIBILITY_V1_READY');
  assert.equal(written.reviewHash, '#design-asset-branch-alpha-salvage-1');
  assert.equal(BRANCH_ALPHA_SALVAGE_RUN_ID, 'design-asset-branch-alpha-salvage-1');
  assert.ok(RGB_STRUCTURE_RESULTS.includes(written.rgbStructureResult));
  assert.ok(SALVAGE_VERDICTS.includes(written.salvageVerdict));

  const summary = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/garden-design/branch-alpha-salvage-feasibility-v1/summary.json'), 'utf8')
  );
  assert.equal(summary.spendGate.openaiCalls, 0);
  assert.equal(summary.productionImpact.originalPngsModified, false);
  assert.equal(summary.productionImpact.productionRegistryChanged, false);
  assert.ok(fs.existsSync(path.join(ROOT, 'modules/garden-design/branch-alpha-salvage-feasibility-1.html')));
  assert.ok(summary.solidBackgroundDiagnostics.new.overWhite);
  if (summary.cleanupJustified) {
    assert.ok(summary.experiments.length >= 2);
  }

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex'), controlBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(newPath)).digest('hex'), newBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex'), registryBefore);
  assert.equal(newBefore, NEW_APPLE_DORMANT_CANDIDATE.sha256);
});
