/**
 * Tree visualForm integrity gate. Zero spend. No catalog mutation. No size enrichment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUDITED_PHYSICAL_FORMS,
  TREE_FORM_ACTIONS,
  TREE_VISUALFORM_INTEGRITY_TABLE,
  auditTreeVisualFormIntegrity,
  writeTreeVisualFormIntegrityReports
} from '../modules/garden-design/asset-factory-v1/tree-visualform-integrity-v1.js';
import { computeTreePhysicalScale } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE } from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('form integrity audits every current tree without mutating catalog', () => {
  const written = writeTreeVisualFormIntegrityReports(ROOT);
  const audit = JSON.parse(fs.readFileSync(written.auditPath, 'utf8'));
  assert.equal(audit.treeCount, 52);
  assert.equal(Object.keys(TREE_VISUALFORM_INTEGRITY_TABLE).length, 52);
  assert.equal(audit.catalogMutated, false);
  assert.equal(audit.sizeEnrichmentExecuted, false);
  assert.equal(audit.records.length, 52);
  assert.ok(audit.records.every((row) => row.currentVisualForm === 'tree'));
  assert.ok(audit.records.every((row) => row.catalogMutated === false));
});

test('papaya and shrub-continuum species require form review, genus records require identity review', () => {
  const audit = auditTreeVisualFormIntegrity(ROOT);
  const papaya = audit.records.find((row) => row.canonicalSlug === 'papaya');
  assert.equal(papaya.action, TREE_FORM_ACTIONS.FORM_REVIEW_REQUIRED);
  assert.equal(papaya.auditedPhysicalForm, AUDITED_PHYSICAL_FORMS.OTHER_SUPPORTED_FORM);
  assert.equal(papaya.sizeEvidenceEligible, false);
  assert.deepEqual(audit.formReviewRequired.sort(), [
    'fig',
    'papaya',
    'plumeria',
    'pomegranate',
    'quince',
    'strawberry-guava'
  ]);
  assert.deepEqual(audit.identityReviewRequired.sort(), ['melaleuca', 'oak-tree', 'pine-tree', 'plum']);
  assert.ok(audit.identityReviewRequired.every((slug) => audit.treeSizeEvidenceEligible.includes(slug) === false));
});

test('KEEP_TREE species are the only size-evidence-eligible set', () => {
  const audit = auditTreeVisualFormIntegrity(ROOT);
  assert.equal(audit.keepTree.length, 42);
  assert.equal(audit.treeSizeEvidenceEligible.length, 42);
  assert.deepEqual(audit.treeSizeEvidenceEligible, audit.keepTree);
  assert.ok(audit.treeSizeEvidenceEligible.includes('mango'));
  assert.ok(!audit.treeSizeEvidenceEligible.includes('papaya'));
  assert.ok(!audit.treeSizeEvidenceEligible.includes('plum'));
});

test('mango calibration state and unknown fallback are unchanged', () => {
  const audit = auditTreeVisualFormIntegrity(ROOT);
  const mango = CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango;
  assert.equal(audit.mangoState.scale, 'PHYSICAL_SCALE_DIRECTION_VALIDATED');
  assert.equal(audit.mangoState.architecture, 'ARCHITECTURE_REGEN_CANDIDATE');
  assert.equal(audit.mangoState.ownerPreferredRangePosition, 'LOW');
  assert.equal(mango.heightM.min, 9.144);
  assert.equal(mango.heightM.max, 18.288);
  const unknown = computeTreePhysicalScale({
    canonicalSlug: 'olive',
    visualForm: 'tree',
    plant: {},
    bbox: { exists: true, minX: 33, minY: 148, maxX: 1008, maxY: 1422 },
    canvasWidth: 1024,
    canvasHeight: 1536,
    sceneHeightPx: 360,
    depthId: 'middle',
    lockScaleMode: 'ESTIMATED'
  });
  assert.equal(unknown.ok, true);
  assert.equal(unknown.gardenDesignBlocked, false);
  assert.equal(unknown.displayHeightM, null);
  assert.equal(unknown.usedInventedMeters, false);
  assert.equal(audit.genericTreeScaleContract.universalTreeSize, false);
  assert.equal(audit.spend.additionalSpendUsd, 0);
});
