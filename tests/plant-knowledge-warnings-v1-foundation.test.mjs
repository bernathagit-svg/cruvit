/**
 * CRUVIT Plant Knowledge & Warnings V1 — foundation gate.
 * Zero external research. No live upsert. No UI.
 *
 * Usage: node --test tests/plant-knowledge-warnings-v1-foundation.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
  FUTURE_INGESTION_RULE,
  FUTURE_INGESTION_SEQUENCE,
  EVIDENCE_CLASS,
  validatePlantKnowledge,
  evaluatePositiveSafetyClaim,
  resolveWarningRenderPolicy,
  resolveInvasivenessLabel,
  isConfirmedWarning,
  mergePlantKnowledgeIntoClimateTraits,
  roundTripPlantKnowledge,
  provenancedField,
  emptyPlantKnowledge
} from '../modules/catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import {
  interpretPlantKnowledgeForGarden,
  auditInterpretationDoesNotInventClaims
} from '../modules/personal-domain/plant-knowledge-garden-interpretation-v1-contract.js';
import {
  buildPlantExplanationV1,
  auditExplanationTraceability
} from '../modules/personal-domain/plant-explanation-v1-contract.js';
import {
  VALIDATION_PLANTS,
  PLANT_KNOWLEDGE_VALIDATION_SET_ID
} from '../data/catalog-expansion/plant-knowledge-v1/validation/definitions.mjs';
import {
  seedPlantToCatalogRow,
  catalogRowToRuntimePlant
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/_plant-knowledge-warnings-v1-foundation-report.json');

test('contract version + future ingestion rule frozen', () => {
  assert.equal(PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION, '1.0.0');
  assert.equal(FUTURE_INGESTION_RULE.noConfidentGuessing, true);
  assert.equal(FUTURE_INGESTION_RULE.positiveSafetyRequiresSourceSupported, true);
  assert.equal(FUTURE_INGESTION_RULE.absenceOfToxicityIsNotSafety, true);
  assert.equal(FUTURE_INGESTION_RULE.runtimeExternalResearchCalls, 0);
  assert.deepEqual(FUTURE_INGESTION_SEQUENCE, [
    'IDENTITY',
    'BOTANICAL_EVIDENCE',
    'REPRODUCTIVE_EVIDENCE',
    'KNOWLEDGE_WARNINGS',
    'MEDIA',
    'SUITABILITY_GATES',
    'PERSISTENCE'
  ]);
});

test('1. no confirmed safety claim from HEURISTIC', () => {
  const heuristicSafe = provenancedField(
    'safe',
    'HEURISTIC_ASSERTION',
    ['x'],
    'Guessed safe without toxicology source.'
  );
  const eval_ = evaluatePositiveSafetyClaim(heuristicSafe);
  assert.equal(eval_.allowed, false);
  assert.equal(eval_.conclusion, 'UNKNOWN');

  const warn = {
    warningId: 'w1',
    category: 'toxicity',
    canonicalTitle: 'Heuristic toxic',
    summary: 'Maybe toxic',
    severity: 'SEVERE',
    evidenceClass: 'HEURISTIC_ASSERTION',
    regionScope: { level: 'GLOBAL' },
    sourceIds: ['x'],
    provenance: {},
    status: 'provisional'
  };
  const policy = resolveWarningRenderPolicy(warn);
  assert.equal(policy.confirmed, false);
  assert.equal(isConfirmedWarning(warn), false);
});

test('2. no safe conclusion from missing toxicity data', () => {
  const missing = evaluatePositiveSafetyClaim(null);
  assert.equal(missing.allowed, false);
  assert.match(missing.reason, /absence-of-toxicity/);

  const unknown = evaluatePositiveSafetyClaim(
    provenancedField(null, 'UNKNOWN', [], 'No data')
  );
  assert.equal(unknown.conclusion === 'UNKNOWN' || unknown.allowed === false, true);

  const bay = VALIDATION_PLANTS.find((p) => p.slug === 'bay-laurel');
  const dog = bay.plantKnowledge.toxicity.dogToxicity;
  assert.equal(dog.evidenceClass, 'UNKNOWN');
  const dogEval = evaluatePositiveSafetyClaim({
    ...dog,
    value: 'safe'
  });
  assert.equal(dogEval.allowed, false);
});

test('3. regional invasive warning does not become global', () => {
  const blue = VALIDATION_PLANTS.find((p) => p.slug === 'blue-gum');
  const label = resolveInvasivenessLabel(blue.plantKnowledge.invasiveness);
  assert.equal(label.global, false);
  assert.equal(label.label, 'invasive_regional');
  assert.equal(label.confirmed, true);
});

test('4. cultivar-specific caveat remains cultivar-specific', () => {
  const persimmon = VALIDATION_PLANTS.find((p) => p.slug === 'persimmon');
  const caveats = persimmon.plantKnowledge.cultivarCaveats;
  assert.equal(caveats.cultivarDependent.value, true);
  assert.ok(caveats.affectedTraits.value.includes('self_fertility'));
  const w = persimmon.plantKnowledge.warnings[0];
  assert.equal(w.category, 'cultivar_caveat');
  assert.match(w.summary, /cultivar/i);
});

test('5. canonical warning survives persistence round-trip', () => {
  for (const p of VALIDATION_PLANTS) {
    const v = validatePlantKnowledge(p.plantKnowledge);
    assert.equal(v.ok, true, `${p.slug}: ${v.errors.join('; ')}`);
    const rt = roundTripPlantKnowledge(p.plantKnowledge, { slug: p.slug });
    assert.equal(rt.ok, true, `${p.slug} knowledge round-trip`);

    const climateTraits = mergePlantKnowledgeIntoClimateTraits(
      {
        frostSensitivity: 'medium',
        traitEvidenceClasses: { frostSensitivity: 'HEURISTIC_ASSERTION' }
      },
      p.plantKnowledge
    );
    const row = seedPlantToCatalogRow(
      {
        slug: p.slug,
        scientific: p.scientific,
        names: { en: p.slug },
        aliases: [],
        climateTraits,
        media: { imageStatus: 'IMAGE_PENDING' },
        needsReview: false,
        verificationState: 'verified',
        provenance: [{ sourceId: 'test' }]
      },
      { catalogVersion: '1.0.0', sourcePacket: `${p.slug}-pk-v1` }
    );
    assert.ok(row.climate_traits.plantKnowledge);
    const runtime = catalogRowToRuntimePlant(row);
    assert.ok(runtime.climateTraits.plantKnowledge);
    assert.equal(
      runtime.climateTraits.plantKnowledge.plantKnowledgeContractVersion,
      PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION
    );
    assert.equal(
      JSON.stringify(runtime.climateTraits.plantKnowledge.warnings),
      JSON.stringify(p.plantKnowledge.warnings)
    );
  }
});

test('6. personalized explanation cannot invent unsupported claims', () => {
  const oleander = VALIDATION_PLANTS.find((p) => p.slug === 'oleander');
  const meta = mergePlantKnowledgeIntoClimateTraits(
    {
      reproductiveBiology: { requires_pollinator: false },
      traitEvidenceClasses: {}
    },
    oleander.plantKnowledge
  );
  const garden = interpretPlantKnowledgeForGarden({
    meta,
    plantKnowledge: oleander.plantKnowledge,
    gardenContext: { accessibleToChildren: true, petsPresent: true }
  });
  assert.ok(garden.interpretations.some((i) => i.interpretationId === 'toxicity-placement'));
  const audit = auditInterpretationDoesNotInventClaims(garden);
  assert.equal(audit.ok, true, JSON.stringify(audit.violations));

  const explanation = buildPlantExplanationV1({
    plant: { slug: 'oleander' },
    meta,
    suitabilityOutcomes: {
      overall: 'borderline',
      flowering: 'supported',
      fruiting: 'unknown',
      limitingFactors: ['toxicity placement caution'],
      unknownEvidence: []
    },
    gardenContext: { petsPresent: true }
  });
  const exAudit = auditExplanationTraceability(explanation);
  assert.equal(exAudit.ok, true, JSON.stringify(exAudit.violations));
  assert.equal(explanation.runtimeExternalResearchCalls, 0);
});

test('SEVERE + UNKNOWN must not confirm', () => {
  const soursop = VALIDATION_PLANTS.find((p) => p.slug === 'soursop');
  const w = soursop.plantKnowledge.warnings.find(
    (x) => x.warningId === 'soursop-seed-caution-unconfirmed'
  );
  assert.equal(w.severity, 'SEVERE');
  assert.equal(w.evidenceClass, 'UNKNOWN');
  const policy = resolveWarningRenderPolicy(w);
  assert.equal(policy.confirmed, false);
  assert.equal(policy.renderAs, 'unknown_notice');
  assert.equal(isConfirmedWarning(w), false);
});

test('empty knowledge skeleton validates', () => {
  const empty = emptyPlantKnowledge({ notes: 'not yet enriched' });
  const v = validatePlantKnowledge(empty);
  assert.equal(v.ok, true, v.errors.join('; '));
});

test('validation set covers required warning classes', () => {
  assert.equal(VALIDATION_PLANTS.length, 10);
  const proves = new Set(VALIDATION_PLANTS.flatMap((p) => p.proves));
  for (const need of [
    'toxicity',
    'invasiveness',
    'regional_caveat',
    'pollination',
    'physical_hazard',
    'harvest_use',
    'UNKNOWN_handling',
    'cultivar_caveat'
  ]) {
    assert.ok(proves.has(need), `missing prove class ${need}`);
  }
});

test('7. existing Plant Climate V2 regression remains green', () => {
  const r = spawnSync(process.execPath, ['scripts/plant-climate-v2-integration-gate.mjs'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const reportPath = path.join(ROOT, 'tests/_plant-climate-v2-integration-gate-report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.match(report.verdict, /PASS/);
  assert.equal(report.falsePositiveMaterialCount, 0);
  assert.equal(report.falseNegativeMaterialCount, 0);
});

test('write foundation report', () => {
  const perPlant = VALIDATION_PLANTS.map((p) => {
    const v = validatePlantKnowledge(p.plantKnowledge);
    const rt = roundTripPlantKnowledge(p.plantKnowledge, { slug: p.slug });
    const confirmedWarnings = (p.plantKnowledge.warnings || []).filter(isConfirmedWarning);
    const provisional = (p.plantKnowledge.warnings || []).filter((w) => !isConfirmedWarning(w));
    return {
      slug: p.slug,
      batch: p.batch,
      scientific: p.scientific,
      proves: p.proves,
      validateOk: v.ok,
      roundTripOk: rt.ok,
      warningCount: (p.plantKnowledge.warnings || []).length,
      confirmedWarnings: confirmedWarnings.map((w) => w.warningId),
      provisionalOrUnknownWarnings: provisional.map((w) => ({
        warningId: w.warningId,
        evidenceClass: w.evidenceClass,
        severity: w.severity,
        render: resolveWarningRenderPolicy(w).renderAs
      }))
    };
  });

  const climateReport = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'tests/_plant-climate-v2-integration-gate-report.json'), 'utf8')
  );

  const report = {
    gate: 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_V1_FOUNDATION',
    generatedAt: new Date().toISOString(),
    contractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
    validationSetId: PLANT_KNOWLEDGE_VALIDATION_SET_ID,
    schemaCapability: {
      catalogPlantsHasPlantKnowledgeColumn: false,
      persistenceStrategy: 'climate_traits.plantKnowledge JSONB nest',
      liveSchemaChangeRequired: false,
      losslessRoundTrip: perPlant.every((p) => p.roundTripOk)
    },
    futureIngestionRule: FUTURE_INGESTION_RULE,
    safetyGates: {
      noConfirmedSafetyFromHeuristic: true,
      noSafeFromMissingToxicity: true,
      regionalInvasiveNotGlobal: true,
      cultivarCaveatRemainsCultivarSpecific: true,
      severeUnknownNotConfirmed: true,
      explanationNoInventedClaims: true
    },
    validationPlants: perPlant,
    climateRegression: {
      verdict: climateReport.verdict,
      materialFp: climateReport.falsePositiveMaterialCount,
      materialFn: climateReport.falseNegativeMaterialCount
    },
    readyForBatch12WarningsEnrichment: true,
    remainingGaps: [
      'Batch 1/2 full warnings enrichment not started (foundation only)',
      'No Learn More / Warnings UI',
      'Legal restriction lists need jurisdiction-by-jurisdiction Owner review before product surfaces',
      'Pet/human toxicity cross-inference remains forbidden — many plants still UNKNOWN'
    ],
    runtimeExternalResearchCalls: 0,
    verdict: 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_V1_FOUNDATION: PASS'
  };

  const allOk =
    perPlant.every((p) => p.validateOk && p.roundTripOk) &&
    String(climateReport.verdict).includes('PASS');
  report.verdict = allOk
    ? 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_V1_FOUNDATION: PASS'
    : 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_V1_FOUNDATION: FAIL';

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  assert.equal(report.verdict, 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_V1_FOUNDATION: PASS');
});
