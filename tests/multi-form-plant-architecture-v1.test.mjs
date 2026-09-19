/**
 * Multi-form plant architecture V1. Zero spend. No catalog mutation. No enrichment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESIGN_VISUAL_FORMS } from '../modules/garden-design/garden-design-variant-policy-v1.js';
import {
  ARCHITECTURE_CLASSES,
  IDENTITY_GAPS_CLOSED,
  MULTI_FORM_ARCHITECTURE_CONTRACTS,
  PAPAYA_FORM_DECISION,
  PROPOSED_VISUAL_FORMS,
  TREE_SIZE_EVIDENCE_ELIGIBLE,
  candidateArchitectureVariantRequirements,
  formAwareSizeEvidenceTemplate,
  mayUseTreePhysicalScale,
  resolveArchitectureMode,
  writeMultiFormPlantArchitectureReports
} from '../modules/garden-design/asset-factory-v1/multi-form-plant-architecture-v1.js';
import { computeTreePhysicalScale } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE } from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';
import { TREE_FORM_ACTIONS, TREE_VISUALFORM_INTEGRITY_TABLE } from '../modules/garden-design/asset-factory-v1/tree-visualform-integrity-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('papaya is a true different form and is kept out of the tree engine', () => {
  assert.equal(PAPAYA_FORM_DECISION.class, ARCHITECTURE_CLASSES.TRUE_DIFFERENT_PHYSICAL_FORM);
  assert.equal(PAPAYA_FORM_DECISION.mustNotUseTreeRenderer, true);
  assert.equal(PAPAYA_FORM_DECISION.productionEnumAdded, false);
  assert.equal(PAPAYA_FORM_DECISION.proposedVisualForm, PROPOSED_VISUAL_FORMS.HERBACEOUS_TREE_LIKE);
  assert.equal(Object.values(DESIGN_VISUAL_FORMS).includes(PROPOSED_VISUAL_FORMS.HERBACEOUS_TREE_LIKE), false);
  const tree = computeTreePhysicalScale({
    canonicalSlug: 'papaya',
    visualForm: 'tree',
    growthStage: 'mature'
  });
  assert.equal(tree.ok, false);
  assert.equal(tree.code, 'NOT_TREE_FORM');
  assert.equal(tree.gardenDesignBlocked, false);
});

test('tree-or-shrub plants stay multi-form and are not forced into one architecture', () => {
  const slugs = Object.keys(MULTI_FORM_ARCHITECTURE_CONTRACTS).sort();
  assert.deepEqual(slugs, ['fig', 'plumeria', 'pomegranate', 'quince', 'strawberry-guava']);
  for (const slug of slugs) {
    const row = MULTI_FORM_ARCHITECTURE_CONTRACTS[slug];
    assert.equal(row.class, ARCHITECTURE_CLASSES.MULTI_FORM_TRAINING_DEPENDENT);
    assert.deepEqual(row.supportedVisualForms, ['tree', 'shrub']);
    assert.equal(row.defaultArchitectureMode, null);
    assert.equal(row.botanicalDefaultExists, false);
    assert.equal(row.mustNotShareOneSizeRange, true);
    const shrub = resolveArchitectureMode({ canonicalSlug: slug, architectureMode: 'shrub' });
    assert.equal(shrub.architectureMode, 'shrub');
    assert.equal(shrub.usedRuntimeFallback, false);
    const unset = resolveArchitectureMode({ canonicalSlug: slug });
    assert.equal(unset.architectureMode, 'tree');
    assert.equal(unset.usedRuntimeFallback, true);
    assert.equal(unset.runtimeFallbackIsBotanicalTruth, false);
    const treeOff = mayUseTreePhysicalScale({ canonicalSlug: slug, visualForm: 'tree', architectureMode: 'shrub' });
    assert.equal(treeOff.ok, false);
    const treeOn = mayUseTreePhysicalScale({ canonicalSlug: slug, visualForm: 'tree', architectureMode: 'tree' });
    assert.equal(treeOn.ok, true);
    const size = formAwareSizeEvidenceTemplate(slug);
    assert.equal(size.sharedRangeForbidden, true);
    assert.equal(size.scenarios.tree.matureHeight, 'UNKNOWN');
    assert.equal(size.scenarios.shrub.matureHeight, 'UNKNOWN');
  }
});

test('candidate variants are proposed only and do not generate', () => {
  const pomegranate = candidateArchitectureVariantRequirements('pomegranate');
  assert.equal(pomegranate.generateNow, false);
  assert.equal(pomegranate.secondCatalogIdentity, false);
  assert.ok(pomegranate.required.some((row) => row.assetName === 'pomegranate-tree-mature-vegetative-v1'));
  assert.ok(pomegranate.required.some((row) => row.assetName === 'pomegranate-shrub-mature-vegetative-v1'));
  const papaya = candidateArchitectureVariantRequirements('papaya');
  assert.equal(papaya.generateNow, false);
  assert.ok(papaya.required.some((row) => row.assetName === 'papaya-mature-vegetative-v1'));
});

test('eligibility lists keep 42 trees, 5 multi-form, papaya non-tree, genus closed', () => {
  const written = writeMultiFormPlantArchitectureReports(ROOT);
  const report = JSON.parse(fs.readFileSync(written.reportPath, 'utf8'));
  const keepTree = Object.values(TREE_VISUALFORM_INTEGRITY_TABLE)
    .filter((row) => row.action === TREE_FORM_ACTIONS.KEEP_TREE)
    .map((row) => row.canonicalSlug)
    .sort();
  assert.deepEqual(report.treeSizeEvidenceEligible, keepTree);
  assert.equal(report.treeSizeEvidenceEligible.length, 42);
  assert.deepEqual(TREE_SIZE_EVIDENCE_ELIGIBLE, keepTree);
  assert.deepEqual(report.multiFormSizeEvidenceRequired, ['fig', 'plumeria', 'pomegranate', 'quince', 'strawberry-guava']);
  assert.deepEqual(report.nonTreeFormSizeEvidenceRequired, ['papaya']);
  assert.deepEqual(report.identityGaps, IDENTITY_GAPS_CLOSED);
  assert.equal(report.productionCatalogMutated, false);
  assert.equal(report.sizeEnrichmentExecuted, false);
  assert.equal(report.mangoState.ownerPreferredRangePosition, 'LOW');
  assert.equal(CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.min, 9.144);
  assert.equal(written.spend.additionalSpendUsd, 0);
});
