/**
 * Botanical size evidence pilot V1. Zero spend. Overlay only. No catalog write.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROLE_BASED_PILOT_SET, SIZE_EVIDENCE_SCENARIOS } from '../modules/garden-design/asset-factory-v1/botanical-size-evidence-contract-v2.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE, FT_TO_M } from '../modules/garden-design/asset-factory-v1/physical-scale-evidence-v1.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from '../modules/garden-design/asset-factory-v1/generic-tree-physical-scale-v1.js';
import {
  PILOT_CONFLICTS,
  PILOT_EVIDENCE_RECORDS,
  RUNTIME_MAPPING_PROPOSAL,
  buildPilotSummary,
  writeBotanicalSizeEvidencePilotReports
} from '../modules/garden-design/asset-factory-v1/botanical-size-evidence-pilot-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('pilot overlay writes seven roles without catalog mutation or invented meters', () => {
  const written = writeBotanicalSizeEvidencePilotReports(ROOT);
  const summary = JSON.parse(fs.readFileSync(written.summaryPath, 'utf8'));
  const evidence = JSON.parse(fs.readFileSync(written.evidencePath, 'utf8'));
  assert.equal(written.verdict, 'PILOT_CONTRACT_PASS');
  assert.equal(summary.massEnrichmentStarted, false);
  assert.equal(summary.productionCatalogWritten, false);
  assert.equal(summary.inventedBotanicalValues, false);
  assert.equal(summary.spend.openaiCalls, 0);
  assert.equal(summary.spend.imageGeneration, 0);
  assert.equal(summary.spend.paidBotanicalAcquisitionUsd, 0);
  assert.equal(evidence.productionCatalogWritten, false);
  const slugs = [...new Set(PILOT_EVIDENCE_RECORDS.map((row) => row.canonicalSlug))];
  assert.deepEqual(slugs, ROLE_BASED_PILOT_SET.map((row) => row.canonicalSlug));
  assert.equal(fs.existsSync(path.join(ROOT, 'data', 'plants.seed.json')), true);
});

test('blue-gum keeps large natural stature and unknown spread', () => {
  const feis = PILOT_EVIDENCE_RECORDS.find((row) => row.recordId === 'blue-gum__usda-feis__natural-mature-height');
  const landscape = PILOT_EVIDENCE_RECORDS.find((row) => row.recordId === 'blue-gum__calpoly-selectree__landscape-maxima');
  assert.equal(feis.sizeScenario, SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE);
  assert.equal(feis.heightMinM, 30);
  assert.equal(feis.heightMaxM, 55);
  assert.equal(feis.spreadMinM, null);
  assert.equal(feis.spreadMaxM, null);
  assert.equal(landscape.heightMaxM, 80 * FT_TO_M);
  assert.notEqual(feis.heightMaxM, landscape.heightMaxM);
});

test('cypress keeps independent height and narrow spread', () => {
  const uf = PILOT_EVIDENCE_RECORDS.find((row) => row.canonicalSlug === 'cypress' && row.sourceIdentifier === 'UF_IFAS_ENH384_ST225');
  assert.equal(uf.heightMinM, 40 * FT_TO_M);
  assert.equal(uf.spreadMaxM, 6 * FT_TO_M);
  assert.ok(uf.spreadMaxM < uf.heightMinM);
  assert.match(uf.originalSourceWording, /columnar/i);
});

test('olive does not invent maintained meters', () => {
  const maintained = PILOT_EVIDENCE_RECORDS.find((row) => row.canonicalSlug === 'olive' && row.sizeScenario === SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN);
  assert.equal(maintained.evidenceClass, 'UNKNOWN');
  assert.equal(maintained.heightMinM, null);
  assert.equal(maintained.heightMaxM, null);
  assert.equal(maintained.mayDrivePhysicalMeterPreview, false);
});

test('apple rootstock classes stay separate and lemon is not final garden size', () => {
  const apple = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === 'apple');
  const lemon = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === 'lemon');
  assert.ok(apple.some((row) => row.recordId.includes('dwarf-class')));
  assert.ok(apple.some((row) => row.recordId.includes('semi-dwarf')));
  assert.ok(apple.some((row) => row.recordId.includes('standard-unpruned')));
  assert.ok(apple.every((row) => row.flags.includes('CULTIVAR_OR_ROOTSTOCK_SENSITIVE')));
  assert.ok(lemon.every((row) => row.notFinalPersonalGardenSize));
  assert.ok(lemon.some((row) => row.sizeScenario === SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN));
});

test('japanese maple species range is cultivar-variable and mango mapping preserves LOW', () => {
  const maple = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === 'japanese-maple');
  const mango = PILOT_EVIDENCE_RECORDS.find((row) => row.canonicalSlug === 'mango');
  assert.ok(maple.every((row) => row.flags.includes('CULTIVAR_VARIABLE')));
  assert.equal(mango.heightMinM, CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.min);
  assert.equal(mango.heightMaxM, CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.max);
  assert.equal(mango.spreadMinM, CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.spreadM.min);
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition, 'LOW');
  assert.equal(MANGO_GARDEN_DESIGN_PREFERENCE.modifiesSourceMatureHeightRange, false);
  assert.equal(RUNTIME_MAPPING_PROPOSAL.find((row) => row.canonicalSlug === 'mango').applyRuntimeDefaultNow, false);
  assert.ok(PILOT_CONFLICTS.every((row) => row.code === 'SOURCE_CONFLICT_REVIEW_REQUIRED'));
  assert.equal(buildPilotSummary().verdict, 'PILOT_CONTRACT_PASS');
});
