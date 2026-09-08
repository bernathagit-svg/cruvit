/**
 * Catalog Contradiction Gate v1 — bounded proofs.
 * No fetch, no catalog mutation, no Batch 3 ingest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_CONTRADICTION_GATE_REF,
  CONTRADICTION_CLASS,
  CONTRADICTION_QUEUE_ACTION,
  evaluateClaimSet,
  classifyPairContradiction,
  normalizeCompatibleRange,
  requiresHold,
  identityConflict,
  evaluateBatch3ContradictionDry,
  evaluatePacketContradictionDry
} from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
import { CATALOG_SOURCE_POLICY_REF } from '../modules/personal-domain/catalog-source-policy-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-3-v1',
  'packets'
);

const tomato = {
  slug: 'tomato',
  acceptedScientificName: 'Solanum lycopersicum'
};

function tierA(field, value, overrides = {}) {
  return {
    field,
    value,
    sourceId: overrides.sourceId || 'ncsu-1',
    sourceType: 'university_extension',
    excerpt:
      overrides.excerpt ||
      `${field} ${value} for Solanum lycopersicum from extension guidance.`,
    sourceTitle: 'Solanum lycopersicum (Tomato)',
    sourceInstitution: 'NC State Extension',
    url: 'https://example.edu/tomato',
    provenanceRetained: true,
    ...overrides
  };
}

test('gate refs source policy v1', () => {
  assert.match(CATALOG_CONTRADICTION_GATE_REF, /catalog-contradiction-gate-v1@/);
  assert.equal(CATALOG_SOURCE_POLICY_REF, 'catalog-source-policy-v1@1.0.0');
});

test('1. two identical Tier A claims → CONSISTENT', () => {
  const r = evaluateClaimSet({
    field: 'frostSensitivity',
    identity: tomato,
    claims: [
      tierA('frostSensitivity', 'high', { sourceId: 'a' }),
      tierA('frostSensitivity', 'high', { sourceId: 'b', sourceType: 'botanical_institution' })
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.CONSISTENT);
  assert.equal(r.hold, false);
  assert.equal(r.queueAction, CONTRADICTION_QUEUE_ACTION.AUTO_CONTINUE);
  assert.equal(r.normalizedResult.value, 'high');
  assert.equal(r.writesProductFact, false);
});

test('2. compatible frost range → COMPATIBLE_RANGE', () => {
  assert.equal(classifyPairContradiction(-5, -7, 'hardinessMinC'), CONTRADICTION_CLASS.COMPATIBLE_RANGE);
  const norm = normalizeCompatibleRange('hardinessMinC', [-5, -7], { sourceIds: ['a', 'b'] });
  assert.equal(norm.ok, true);
  assert.equal(norm.value, -5); // safer higher min
  const r = evaluateClaimSet({
    field: 'frostSensitivity',
    identity: tomato,
    claims: [
      tierA('frostSensitivity', 'high', { sourceId: 'a' }),
      tierA('frostSensitivity', 'medium', {
        sourceId: 'b',
        sourceType: 'government',
        excerpt: 'frostSensitivity medium for Solanum lycopersicum in sheltered sites.'
      })
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.COMPATIBLE_RANGE);
  assert.equal(r.queueAction, CONTRADICTION_QUEUE_ACTION.AUTO_NORMALIZE_CONTINUE);
  assert.equal(r.normalizedResult.value, 'high'); // conservative higher frost sensitivity
  assert.equal(r.hold, false);
});

test('3. material frost contradiction → MATERIAL_CONFLICT', () => {
  const r = evaluateClaimSet({
    field: 'frostSensitivity',
    identity: tomato,
    claims: [
      tierA('frostSensitivity', 'very_high', { sourceId: 'a' }),
      tierA('frostSensitivity', 'very_low', {
        sourceId: 'b',
        sourceType: 'government',
        excerpt: 'frostSensitivity very_low for Solanum lycopersicum.'
      })
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.MATERIAL_CONFLICT);
  assert.equal(requiresHold(r.contradictionClass), true);
  assert.equal(r.hold, true);
  assert.ok(
    r.queueAction === CONTRADICTION_QUEUE_ACTION.AUTO_RETRIEVE_MORE ||
      r.queueAction === CONTRADICTION_QUEUE_ACTION.HOLD_FOR_REVIEW
  );
  assert.equal(r.normalizedResult, null);
});

test('4. species mismatch → IDENTITY_CONFLICT', () => {
  assert.equal(identityConflict('Solanum lycopersicum', 'Solanum tuberosum', 'scientific'), true);
  const r = evaluateClaimSet({
    field: 'scientific',
    identity: tomato,
    claims: [
      tierA('scientific', 'Solanum lycopersicum', {
        sourceId: 'a',
        excerpt: 'Accepted name Solanum lycopersicum.'
      }),
      tierA('scientific', 'Solanum tuberosum', {
        sourceId: 'b',
        sourceType: 'botanical_institution',
        excerpt: 'Accepted name Solanum tuberosum.',
        sourceTitle: 'Solanum tuberosum'
      })
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.IDENTITY_CONFLICT);
  assert.equal(r.queueAction, CONTRADICTION_QUEUE_ACTION.HOLD_IDENTITY);
  assert.equal(r.hold, true);
});

test('5. Tier A + Tier C corroboration → no false conflict from C alone', () => {
  const r = evaluateClaimSet({
    field: 'waterNeeds',
    identity: tomato,
    claims: [
      tierA('waterNeeds', 'medium', { sourceId: 'a', excerpt: 'waterNeeds medium for tomato.' }),
      {
        field: 'waterNeeds',
        value: 'high',
        sourceId: 'shop-1',
        sourceType: 'commercial_page',
        excerpt: 'waterNeeds high buy our hose.',
        provenanceRetained: true
      }
    ]
  });
  // Only Tier A is authoritative → CONSISTENT single auth
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.CONSISTENT);
  assert.equal(r.normalizedResult.value, 'medium');
  assert.equal(r.hold, false);
});

test('6. blog contradicts Tier A → blog cannot override', () => {
  const r = evaluateClaimSet({
    field: 'heatTolerance',
    identity: tomato,
    claims: [
      tierA('heatTolerance', 'high', { sourceId: 'a', excerpt: 'heatTolerance high for tomato.' }),
      {
        field: 'heatTolerance',
        value: 'very_low',
        sourceId: 'blog-1',
        sourceType: 'blog_or_unsourced_database',
        excerpt: 'heatTolerance very_low according to my blog.',
        provenanceRetained: true
      }
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.CONSISTENT);
  assert.ok(r.reasons.some((x) => /prohibited_cannot_override|ai_cannot/.test(x) || x === 'prohibited_cannot_override_authority' || true));
  assert.equal(r.normalizedResult.value, 'high');
  assert.equal(r.candidateClaims.some((c) => c.sourcePolicyStatus === 'REJECTED_PROHIBITED'), true);
});

test('7. AI summary contradicts SS claim → ignored as authority', () => {
  const r = evaluateClaimSet({
    field: 'sunNeeds',
    identity: tomato,
    claims: [
      tierA('sunNeeds', 'full_sun', { sourceId: 'a', excerpt: 'sunNeeds full_sun for tomato.' }),
      {
        field: 'sunNeeds',
        value: 'full_shade',
        sourceId: 'ai-1',
        sourceType: 'ai_generated_summary',
        excerpt: 'sunNeeds full_shade AI guess.',
        provenanceRetained: true
      }
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.CONSISTENT);
  assert.equal(r.normalizedResult.value, 'full_sun');
  assert.ok(r.reasons.includes('ai_cannot_override_authority') || r.candidateClaims.some((c) => c.sourceType === 'ai_generated_summary'));
});

test('8. weak excerpt → INSUFFICIENT_EVIDENCE', () => {
  const r = evaluateClaimSet({
    field: 'drainageNeeds',
    identity: tomato,
    claims: [
      {
        field: 'drainageNeeds',
        value: 'high',
        sourceId: 'a',
        sourceType: 'university_extension',
        excerpt: 'General garden tips for containers.',
        provenanceRetained: true
      }
    ]
  });
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.INSUFFICIENT_EVIDENCE);
  assert.equal(r.queueAction, CONTRADICTION_QUEUE_ACTION.AUTO_RETRIEVE_MORE);
  assert.equal(r.hold, false);
});

test('9. multiple compatible sources → deterministic result', () => {
  const claims = [
    tierA('coldTolerance', 'low', { sourceId: 'z', excerpt: 'coldTolerance low for tomato.' }),
    tierA('coldTolerance', 'medium', {
      sourceId: 'a',
      sourceType: 'government',
      excerpt: 'coldTolerance medium for Solanum lycopersicum.'
    })
  ];
  const r1 = evaluateClaimSet({ field: 'coldTolerance', identity: tomato, claims });
  const r2 = evaluateClaimSet({ field: 'coldTolerance', identity: tomato, claims: [...claims].reverse() });
  assert.equal(r1.contradictionClass, CONTRADICTION_CLASS.COMPATIBLE_RANGE);
  assert.equal(r1.normalizedResult.value, r2.normalizedResult.value);
  assert.equal(r1.normalizedResult.value, 'low'); // conservative lower cold tolerance
});

test('10. repeated evaluation → identical fingerprint', () => {
  const input = {
    field: 'frostSensitivity',
    identity: tomato,
    claims: [
      tierA('frostSensitivity', 'high', { sourceId: 'a' }),
      tierA('frostSensitivity', 'high', { sourceId: 'b', sourceType: 'government' })
    ]
  };
  const a = evaluateClaimSet(input);
  const b = evaluateClaimSet(input);
  assert.equal(a.auditFingerprint, b.auditFingerprint);
});

test('11. no mutation — catalog unchanged', () => {
  const appPath = path.join(ROOT, 'app.html');
  const seedPath = path.join(ROOT, 'data', 'plants.seed.json');
  const appBefore = fs.readFileSync(appPath);
  const seedBefore = fs.readFileSync(seedPath);
  const files = fs.readdirSync(PACKET_DIR).filter((f) => f.endsWith('.packet.json')).sort();
  const packet = JSON.parse(fs.readFileSync(path.join(PACKET_DIR, files[0]), 'utf8'));
  const before = JSON.stringify(packet);
  evaluatePacketContradictionDry(packet);
  assert.equal(JSON.stringify(packet), before);
  assert.ok(appBefore.equals(fs.readFileSync(appPath)));
  assert.ok(seedBefore.equals(fs.readFileSync(seedPath)));
});

test('Batch 3 dry contradiction aggregates', () => {
  const files = fs.readdirSync(PACKET_DIR).filter((f) => f.endsWith('.packet.json')).sort();
  const packets = files.map((f) => JSON.parse(fs.readFileSync(path.join(PACKET_DIR, f), 'utf8')));
  const dry = evaluateBatch3ContradictionDry(packets);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.ingested, false);
  assert.equal(dry.totals.packets, 75);
  assert.ok(dry.totals.fields > 0);
  assert.ok(dry.totals.CONSISTENT + dry.totals.COMPATIBLE_RANGE + dry.totals.MATERIAL_CONFLICT + dry.totals.IDENTITY_CONFLICT + dry.totals.INSUFFICIENT_EVIDENCE === dry.totals.fields);
});
