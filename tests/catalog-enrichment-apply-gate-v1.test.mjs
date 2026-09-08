/**
 * Catalog Enrichment Apply Gate v1 — dry-run / safety proofs.
 * No catalog mutation, no fetch, no Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_ENRICHMENT_APPLY_GATE_REF,
  APPLY_DECISION,
  evaluateCandidateForApply,
  evaluateCandidateSetForPlant,
  buildDryRunMutationPlan,
  plantContentHash,
  FUTURE_ATOMIC_WRITE_SPEC,
  APPROVED_TRANSFORMS
} from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import { EVIDENCE_CLASS, VALUE_ORIGIN } from '../modules/personal-domain/plant-data-contract-v1.js';
import { candidatePacketFingerprint } from '../modules/personal-domain/source-retriever-pilot-v1.js';
import { applyAllBootstrapStructuralClimateTraitsMigrations } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACKETS = path.join(ROOT, 'data', 'catalog', 'enrichment-retrieval', 'candidate-packets');

function loadPacket(slug) {
  return JSON.parse(fs.readFileSync(path.join(PACKETS, `${slug}.candidate-packet-v1.json`), 'utf8'));
}

function loadPlant(slug) {
  const app = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const s = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || s).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug: s, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  const seedRaw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'plants.seed.json'), 'utf8').replace(/^\uFEFF/, '')
  );
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !index[s]) index[s] = structuredClone(p);
  }
  return index[slug];
}

const pomPacket = loadPacket('pomegranate');
const pomPlant = loadPlant('pomegranate');
const applePacket = loadPacket('apple');
const applePlant = loadPlant('apple');
const figPacket = loadPacket('fig');
const figPlant = loadPlant('fig');

test('gate ref frozen + transforms registered', () => {
  assert.equal(CATALOG_ENRICHMENT_APPLY_GATE_REF, 'catalog-enrichment-apply-gate-v1@1.0.0');
  assert.ok(APPROVED_TRANSFORMS['hardiness-zone-to-cold-traits-v1@1.0.0']);
  assert.ok(APPROVED_TRANSFORMS['frost-injury-to-frost-sensitivity-v1@1.0.0']);
  assert.equal(FUTURE_ATOMIC_WRITE_SPEC.executed, false);
});

test('1. valid pomegranate candidate set → APPLY_ALLOWED', () => {
  const r = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  assert.equal(r.setDecision, APPLY_DECISION.APPLY_ALLOWED);
  assert.equal(r.selectedForPilotWrite, true);
  assert.ok(r.mutationPlan?.ok);
  assert.equal(r.mutationPlan.writesCatalog, false);
  assert.equal(r.readinessSimulation.current.readinessShort, 'B');
  assert.equal(r.readinessSimulation.simulated.readinessShort, 'A');
  assert.equal(r.externalRequests, 0);
  assert.equal(r.catalogMutated, false);
});

test('2. wrong species → blocked', () => {
  const fp = pomPacket.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  const r = evaluateCandidateForApply(fp, {
    plant: applePlant,
    packet: pomPacket,
    expectedSlug: 'apple',
    verifyFingerprint: false
  });
  assert.equal(r.decision, APPLY_DECISION.APPLY_BLOCKED);
  assert.ok(r.reasons.includes('identity_mismatch'));
});

test('3. NEEDS_MORE packet → blocked / NEEDS_MORE', () => {
  const frost = applePacket.fieldPackets.find((f) => f.targetField === 'frostSensitivity');
  const r = evaluateCandidateForApply(frost, {
    plant: applePlant,
    packet: applePacket
  });
  assert.equal(r.decision, APPLY_DECISION.NEEDS_MORE_EVIDENCE);
});

test('4. missing transform → blocked', () => {
  const fp = structuredClone(
    pomPacket.fieldPackets.find((f) => f.targetField === 'coldTolerance')
  );
  fp.transformId = null;
  fp.transformVersion = null;
  const r = evaluateCandidateForApply(fp, {
    plant: pomPlant,
    packet: pomPacket,
    verifyFingerprint: false
  });
  assert.equal(r.decision, APPLY_DECISION.APPLY_BLOCKED);
  assert.ok(r.reasons.includes('transform_id_or_version_missing'));
});

test('5. invalid evidence lineage → blocked', () => {
  const fp = structuredClone(
    pomPacket.fieldPackets.find((f) => f.targetField === 'frostSensitivity')
  );
  fp.evidenceLineage = 'MADE_UP';
  const r = evaluateCandidateForApply(fp, {
    plant: pomPlant,
    packet: pomPacket,
    verifyFingerprint: false
  });
  assert.equal(r.decision, APPLY_DECISION.APPLY_BLOCKED);
  assert.ok(r.reasons.includes('evidence_lineage_invalid'));
});

test('6. conflicting SS current value → HOLD', () => {
  const plant = structuredClone(pomPlant);
  plant.climateTraits.frostSensitivity = 'very_low';
  plant.climateTraits.traitEvidenceClasses.frostSensitivity = EVIDENCE_CLASS.SOURCE_SUPPORTED;
  plant.climateTraits.fieldOrigins.frostSensitivity = VALUE_ORIGIN.ASSERTED_SOURCE;
  const fp = pomPacket.fieldPackets.find((f) => f.targetField === 'frostSensitivity');
  const r = evaluateCandidateForApply(fp, {
    plant,
    packet: pomPacket,
    verifyFingerprint: false
  });
  assert.equal(r.decision, APPLY_DECISION.HOLD_CONFLICT);
});

test('7. heuristic current + compatible SS → allowed', () => {
  assert.equal(pomPlant.climateTraits.traitEvidenceClasses.coldTolerance, 'HEURISTIC_ASSERTION');
  assert.equal(pomPlant.climateTraits.coldTolerance, 'medium');
  const fp = pomPacket.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  assert.equal(fp.proposedValue, 'low');
  const r = evaluateCandidateForApply(fp, { plant: pomPlant, packet: pomPacket });
  assert.equal(r.decision, APPLY_DECISION.APPLY_ALLOWED);
  assert.ok(r.reasons.includes('heuristic_current_compatible_ss_upgrade'));
});

test('8. tampered packet fingerprint → blocked', () => {
  const tampered = structuredClone(pomPacket);
  tampered.fingerprint = 'deadbeef';
  const fp = tampered.fieldPackets[0];
  const r = evaluateCandidateForApply(fp, { plant: pomPlant, packet: tampered });
  assert.equal(r.decision, APPLY_DECISION.APPLY_BLOCKED);
  assert.ok(r.reasons.includes('packet_fingerprint_mismatch'));
});

test('9. repeat evaluation idempotent', () => {
  const a = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  const b = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  assert.equal(a.setFingerprint, b.setFingerprint);
  assert.equal(a.mutationPlan.planFingerprint, b.mutationPlan.planFingerprint);
  // provenance map keys unique (no duplicate on rebuild)
  assert.equal(
    Object.keys(a.mutationPlan.after.climateTraits.enrichmentProvenance).sort().join(','),
    'coldTolerance,frostSensitivity'
  );
});

test('10. dry-run mutation changes only authorized fields', () => {
  const r = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  const beforeHash = plantContentHash(pomPlant);
  const { before, after, guards } = r.mutationPlan;
  assert.equal(guards.floweringRequirementsUnchanged, true);
  assert.equal(guards.fruitingRequirementsUnchanged, true);
  assert.equal(guards.needsReviewUnchanged, true);
  assert.equal(before.climateTraits.floweringRequirements, after.climateTraits.floweringRequirements);
  assert.equal(before.climateTraits.fruitingRequirements, after.climateTraits.fruitingRequirements);
  assert.notEqual(before.climateTraits.frostSensitivity, after.climateTraits.frostSensitivity);
  assert.notEqual(before.climateTraits.coldTolerance, after.climateTraits.coldTolerance);
  // original plant unchanged
  assert.equal(plantContentHash(pomPlant), beforeHash);
  assert.equal(pomPlant.climateTraits.frostSensitivity, 'medium');
});

test('11. pomegranate simulated readiness correct', () => {
  const r = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  assert.equal(r.readinessSimulation.current.readinessShort, 'B');
  assert.equal(r.readinessSimulation.simulated.readinessShort, 'A');
  assert.ok(r.readinessSimulation.blockersCleared.length >= 0);
});

test('12. apple/fig not selected for apply write plan', () => {
  const a = evaluateCandidateSetForPlant({ packet: applePacket, plant: applePlant });
  const f = evaluateCandidateSetForPlant({ packet: figPacket, plant: figPlant });
  assert.equal(a.selectedForPilotWrite, false);
  assert.equal(f.selectedForPilotWrite, false);
  assert.equal(a.writePlanGenerated, false);
  assert.equal(f.writePlanGenerated, false);
  assert.equal(a.mutationPlan, null);
  assert.equal(f.mutationPlan, null);
  assert.ok(a.setReasons.includes('plant_not_selected_for_pilot_write'));
  // frost still NEEDS_MORE
  assert.ok(
    a.fieldResults.some(
      (x) => x.field === 'frostSensitivity' && x.decision === APPLY_DECISION.NEEDS_MORE_EVIDENCE
    )
  );
  assert.ok(
    f.fieldResults.some(
      (x) => x.field === 'frostSensitivity' && x.decision === APPLY_DECISION.NEEDS_MORE_EVIDENCE
    )
  );
});

test('13. no external requests', () => {
  const r = evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  assert.equal(r.externalRequests, 0);
});

test('14. no catalog mutation', () => {
  const appBefore = fs.readFileSync(path.join(ROOT, 'app.html'));
  const seedBefore = fs.readFileSync(path.join(ROOT, 'data', 'plants.seed.json'));
  const packetBefore = fs.readFileSync(path.join(PACKETS, 'pomegranate.candidate-packet-v1.json'));
  const hashBefore = plantContentHash(pomPlant);
  evaluateCandidateSetForPlant({ packet: pomPacket, plant: pomPlant });
  assert.ok(appBefore.equals(fs.readFileSync(path.join(ROOT, 'app.html'))));
  assert.ok(seedBefore.equals(fs.readFileSync(path.join(ROOT, 'data', 'plants.seed.json'))));
  assert.ok(packetBefore.equals(fs.readFileSync(path.join(PACKETS, 'pomegranate.candidate-packet-v1.json'))));
  assert.equal(plantContentHash(pomPlant), hashBefore);
});

test('fingerprint helper still matches committed packets', () => {
  assert.equal(candidatePacketFingerprint(pomPacket), pomPacket.fingerprint);
});

test('unauthorized transform cannot apply', () => {
  const fp = structuredClone(
    pomPacket.fieldPackets.find((f) => f.targetField === 'coldTolerance')
  );
  fp.transformId = 'made-up-transform';
  fp.transformVersion = '9.9.9';
  const r = evaluateCandidateForApply(fp, {
    plant: pomPlant,
    packet: pomPacket,
    verifyFingerprint: false
  });
  assert.equal(r.decision, APPLY_DECISION.APPLY_BLOCKED);
  assert.ok(r.reasons.includes('transform_not_registered_or_field_mismatch'));
});
