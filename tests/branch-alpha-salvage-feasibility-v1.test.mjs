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
  executeBranchAlphaSalvageFeasibility
} from '../modules/garden-design/asset-factory-v1/branch-alpha-salvage-feasibility-v1.js';
import { writeBranchAlphaSalvageReview } from '../modules/garden-design/asset-factory-v1/branch-alpha-salvage-review-v1.js';
import { APPLE_DORMANT_CANDIDATE } from '../modules/garden-design/asset-factory-v1/apple-dormant-root-cause-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('branch alpha salvage is a zero-spend feasibility audit and does not touch originals', () => {
  const controlPath = path.join(ROOT, APPLE_DORMANT_CANDIDATE.file);
  const newPath = path.join(ROOT, NEW_APPLE_DORMANT_CANDIDATE.file);
  const registryPath = path.join(ROOT, 'modules/garden-design/assets/plants/design-asset-registry-v1.json');
  const controlBefore = crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex');
  const newBefore = crypto.createHash('sha256').update(fs.readFileSync(newPath)).digest('hex');
  const registryBefore = crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex');

  assert.equal(BRANCH_ALPHA_SALVAGE_RUN_ID, 'design-asset-branch-alpha-salvage-1');
  const spend = executeBranchAlphaSalvageFeasibility();
  assert.equal(spend.openaiCalls, 0);
  assert.equal(spend.imageGeneration, 0);
  assert.equal(spend.highExecuted, false);
  assert.equal(spend.additionalSpendUsd, 0);
  assert.equal(spend.spendGate, 'DENIED');

  const summary = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data/garden-design/branch-alpha-salvage-feasibility-v1/summary.json'), 'utf8')
  );
  writeBranchAlphaSalvageReview(ROOT, summary);
  const html = fs.readFileSync(path.join(ROOT, 'modules/garden-design/branch-alpha-salvage-feasibility-1.html'), 'utf8');
  const compare = html.slice(0, html.indexOf('<details>'));
  assert.match(compare, /APPLE DORMANT — ALPHA CLEANUP COMPARISON/);
  assert.match(compare, /ORIGINAL — FAILED PROVIDER PNG/);
  assert.match(compare, /CLEANUP A — CONSERVATIVE/);
  assert.match(compare, /CLEANUP B — STRONGER CLEANUP/);
  assert.match(compare, /CLEANUP C — EDGE-PRESERVING CLEANUP/);
  assert.match(compare, /CALIBRATION ONLY — NOT APPROVED/);
  assert.match(compare, /id="alphaCleanupComparison"/);
  assert.match(compare, /data-choice="ORIGINAL"/);
  assert.match(compare, /data-choice="A"/);
  assert.match(compare, /data-choice="B"/);
  assert.match(compare, /data-choice="C"/);
  assert.match(compare, /data-choice="NONE"/);
  assert.match(compare, /new-cleanup-a\.png/);
  assert.match(compare, /new-cleanup-b\.png/);
  assert.match(compare, /new-cleanup-c\.png/);
  assert.doesNotMatch(compare, /HISTORICAL CONTROL — NOT THIS COMPARISON/);
  assert.match(html, /<details>/);
  assert.match(html, /HISTORICAL CONTROL — NOT THIS COMPARISON/);

  assert.equal(summary.spendGate.openaiCalls, 0);
  assert.equal(summary.productionImpact.originalPngsModified, false);
  assert.equal(summary.productionImpact.productionRegistryChanged, false);
  assert.ok(fs.existsSync(path.join(ROOT, 'modules/garden-design/assets/plants/branch-alpha-salvage-feasibility-1/new-cleanup-a.png')));
  assert.ok(fs.existsSync(path.join(ROOT, 'modules/garden-design/assets/plants/branch-alpha-salvage-feasibility-1/new-cleanup-b.png')));
  assert.ok(fs.existsSync(path.join(ROOT, 'modules/garden-design/assets/plants/branch-alpha-salvage-feasibility-1/new-cleanup-c.png')));

  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(controlPath)).digest('hex'), controlBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(newPath)).digest('hex'), newBefore);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(registryPath)).digest('hex'), registryBefore);
  assert.equal(newBefore, NEW_APPLE_DORMANT_CANDIDATE.sha256);
});
