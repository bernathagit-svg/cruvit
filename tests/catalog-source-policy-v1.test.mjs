/**
 * Catalog Source Policy Registry v1 — bounded proofs.
 * No fetch, no catalog mutation, no Batch 3 ingest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_SOURCE_POLICY_ID,
  CATALOG_SOURCE_POLICY_VERSION,
  CATALOG_SOURCE_POLICY_REF,
  CATALOG_SOURCE_TYPES,
  SOURCE_TYPE_PROHIBITED_AS_AUTHORITY,
  EVIDENCE_CLASS,
  CONTRADICTION_CLASS,
  evaluateSourceSupportedEligibility,
  assertHeuristicCannotSelfPromote,
  classifyValueContradiction,
  evaluatePacketAgainstSourcePolicy,
  evaluateBatch3PacketsSourcePolicyDry,
  normalizeCatalogSourceType,
  authorityTierForSourceType
} from '../modules/personal-domain/catalog-source-policy-v1.js';
import {
  buildEnrichmentJob,
  buildCurrentCatalogEnrichmentQueue,
  stableEnrichmentJobId,
  CATALOG_SOURCE_POLICY_REF as QUEUE_POLICY_REF
} from '../modules/personal-domain/enrichment-gap-scanner-v1.js';
import { SR_EVIDENCE_SOURCE_TYPES } from '../modules/smart-recommendations/developer-evidence-packet-registry.js';

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

const tomatoIdentity = {
  acceptedScientificName: 'Solanum lycopersicum',
  canonicalSlug: 'tomato'
};

function uniExtCandidate(overrides = {}) {
  return {
    field: 'frostSensitivity',
    value: 'high',
    sourceId: 'ncsu-demo',
    sourceType: 'university_extension',
    excerpt: 'Tomato is frost intolerant; frostSensitivity high in exposed sites.',
    url: 'https://example.edu/tomato',
    sourceTitle: 'Solanum lycopersicum (Tomato)',
    sourceInstitution: 'NC State Extension',
    expectedIdentity: tomatoIdentity,
    provenanceRetained: true,
    ...overrides
  };
}

test('policy reuses SR source types (no parallel enum)', () => {
  assert.equal(CATALOG_SOURCE_POLICY_ID, 'catalog-source-policy-v1');
  assert.equal(CATALOG_SOURCE_POLICY_VERSION, '1.0.0');
  assert.equal(CATALOG_SOURCE_POLICY_REF, 'catalog-source-policy-v1@1.0.0');
  assert.deepEqual([...CATALOG_SOURCE_TYPES], [...SR_EVIDENCE_SOURCE_TYPES]);
  assert.ok(SOURCE_TYPE_PROHIBITED_AS_AUTHORITY.includes('ai_generated_summary'));
  assert.equal(normalizeCatalogSourceType('horticultural_society'), 'professional_horticultural_society');
  assert.equal(authorityTierForSourceType('university_extension'), 'A');
  assert.equal(authorityTierForSourceType('commercial_page'), 'C');
});

test('1. university extension + exact supporting claim → SOURCE_SUPPORTED allowed', () => {
  const r = evaluateSourceSupportedEligibility(uniExtCandidate());
  assert.equal(r.mayBeSourceSupported, true);
  assert.equal(r.evidenceClass, EVIDENCE_CLASS.SOURCE_SUPPORTED);
  assert.equal(r.authorityTier, 'A');
  assert.equal(r.hold, false);
});

test('2. botanical institution valid claim → allowed', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({
      sourceType: 'botanical_institution',
      sourceId: 'kew-demo',
      excerpt: 'Frost sensitivity high for Solanum lycopersicum outdoors.'
    })
  );
  assert.equal(r.mayBeSourceSupported, true);
  assert.equal(r.evidenceClass, EVIDENCE_CLASS.SOURCE_SUPPORTED);
});

test('3. AI-generated summary only → SOURCE_SUPPORTED denied', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({ sourceType: 'ai_generated_summary', sourceId: 'ai-1' })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.ok(r.reasons.some((x) => /ai_generated/.test(x)));
});

test('4. blog only → SOURCE_SUPPORTED denied', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({ sourceType: 'blog_or_unsourced_database', sourceId: 'blog-1' })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.ok(r.reasons.some((x) => /prohibited_source/.test(x)));
});

test('5. source exists but excerpt does not support field → denied', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({
      excerpt: 'General garden tips for containers and potting mix.'
    })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.ok(r.reasons.includes('excerpt_does_not_support_field_value'));
});

test('6. valid source but wrong species identity → denied / identity HOLD', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({
      declaredScientificName: 'Solanum tuberosum',
      sourceTitle: 'Solanum tuberosum (Potato)',
      excerpt: 'Frost sensitivity high for Solanum tuberosum.'
    })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.IDENTITY_CONFLICT);
  assert.equal(r.hold, true);
});

test('7. two compatible institutional values → compatible', () => {
  assert.equal(
    classifyValueContradiction('medium', 'high', 'heatTolerance'),
    CONTRADICTION_CLASS.COMPATIBLE_RANGE
  );
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({
      value: 'high',
      priorValue: 'medium',
      excerpt: 'Heat tolerance high for tomato in warm summers.'
    })
  );
  assert.equal(r.mayBeSourceSupported, true);
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.COMPATIBLE_RANGE);
  assert.equal(r.hold, false);
});

test('8. materially conflicting authoritative values → HOLD', () => {
  assert.equal(
    classifyValueContradiction('very_low', 'very_high', 'frostSensitivity'),
    CONTRADICTION_CLASS.MATERIAL_CONFLICT
  );
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({
      value: 'very_high',
      priorValue: 'very_low',
      excerpt: 'Frost sensitivity very_high.'
    })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.equal(r.hold, true);
  assert.equal(r.contradictionClass, CONTRADICTION_CLASS.MATERIAL_CONFLICT);
});

test('9. HEURISTIC cannot self-promote', () => {
  const blocked = assertHeuristicCannotSelfPromote(EVIDENCE_CLASS.HEURISTIC_ASSERTION, {
    field: 'frostSensitivity',
    value: 'high',
    sourceType: 'ai_generated_summary',
    sourceId: 'x',
    excerpt: 'frost high'
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.evidenceClass, EVIDENCE_CLASS.HEURISTIC_ASSERTION);

  const ok = assertHeuristicCannotSelfPromote(
    EVIDENCE_CLASS.HEURISTIC_ASSERTION,
    uniExtCandidate()
  );
  assert.equal(ok.blocked, false);
  assert.equal(ok.result.mayBeSourceSupported, true);
});

test('10. queue job references policy v1 without job-id drift', () => {
  const plant = {
    slug: 'demo-policy-queue',
    name: 'Demo',
    scientific: 'Demo policyus',
    climateTraits: {
      frostSensitivity: 'medium',
      coldTolerance: 'medium',
      heatTolerance: 'medium',
      sunNeeds: 'full_sun',
      waterNeeds: 'medium',
      humidityTolerance: 'medium',
      drainageNeeds: 'high',
      floweringRequirements: 'Needs sun.',
      fruitingRequirements: 'Needs warmth.',
      needsReview: false,
      traitEvidenceClasses: {
        frostSensitivity: 'HEURISTIC_ASSERTION',
        coldTolerance: 'HEURISTIC_ASSERTION',
        heatTolerance: 'HEURISTIC_ASSERTION',
        humidityTolerance: 'HEURISTIC_ASSERTION',
        sunNeeds: 'HEURISTIC_ASSERTION',
        waterNeeds: 'HEURISTIC_ASSERTION',
        drainageNeeds: 'HEURISTIC_ASSERTION',
        floweringRequirements: 'HEURISTIC_ASSERTION',
        fruitingRequirements: 'HEURISTIC_ASSERTION'
      }
    }
  };
  const job = buildEnrichmentJob(plant);
  assert.ok(job);
  assert.equal(job.jobId, stableEnrichmentJobId('demo-policy-queue'));
  assert.equal(job.sourcePolicyVersion, CATALOG_SOURCE_POLICY_REF);
  assert.equal(QUEUE_POLICY_REF, CATALOG_SOURCE_POLICY_REF);
  assert.notEqual(job.sourcePolicyVersion, 'catalog-source-policy-pending-v0');
});

test('11. Batch 3 dry evaluation makes no catalog changes', () => {
  const appPath = path.join(ROOT, 'app.html');
  const seedPath = path.join(ROOT, 'data', 'plants.seed.json');
  const appBefore = fs.readFileSync(appPath);
  const seedBefore = fs.readFileSync(seedPath);
  const files = fs.readdirSync(PACKET_DIR).filter((f) => f.endsWith('.packet.json')).sort();
  assert.ok(files.length >= 1);
  const packets = files.map((f) => JSON.parse(fs.readFileSync(path.join(PACKET_DIR, f), 'utf8')));
  const packetBefore = JSON.stringify(packets[0]);
  const dry = evaluateBatch3PacketsSourcePolicyDry(packets);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.ingested, false);
  assert.equal(dry.totals.packets, packets.length);
  assert.ok(dry.totals.claims > 0);
  assert.equal(JSON.stringify(packets[0]), packetBefore);
  assert.ok(appBefore.equals(fs.readFileSync(appPath)));
  assert.ok(seedBefore.equals(fs.readFileSync(seedPath)));

  const one = evaluatePacketAgainstSourcePolicy(packets[0]);
  assert.equal(one.mutated, false);
  assert.equal(one.ingested, false);
});

test('url alone is never enough', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({ sourceId: '', excerpt: '', url: 'https://plants.ces.ncsu.edu/plants/solanum-lycopersicum/' })
  );
  assert.equal(r.mayBeSourceSupported, false);
  assert.ok(r.reasons.some((x) => /url_alone_not_enough|exact_sourceId|supporting_excerpt/.test(x)));
});

test('commercial_page alone cannot authorize SOURCE_SUPPORTED', () => {
  const r = evaluateSourceSupportedEligibility(
    uniExtCandidate({ sourceType: 'commercial_page', sourceId: 'shop-1' })
  );
  assert.equal(r.mayBeSourceSupported, false);
});
