import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IDENTIFICATION_RESULT_STATUSES,
  IDENTITY_RESOLUTION_STATUSES,
  createCanonicalIdentificationResult
} from '../modules/plant-identifier/canonical-identification-result-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function validInput(overrides = {}) {
  return {
    status: 'identified',
    resolution: {
      status: 'resolved_canonical',
      canonicalSlug: 'monstera',
      matchedBy: 'scientificName',
      needsReview: false,
      conflictActive: false
    },
    catalog: {
      authority: 'catalog_plants',
      validation: 'passed',
      canonicalSlug: 'monstera',
      scientificName: 'Monstera deliciosa',
      commonName: 'Monstera',
      needsReview: false,
      conflictActive: false
    },
    providerEvidence: {
      provider: 'synthetic',
      commonName: 'Swiss Cheese Plant',
      scientificName: 'Monstera deliciosa',
      confidence: 0.97
    },
    ...overrides
  };
}

function assertNonIdentified(result, expectedStatus) {
  if (expectedStatus) assert.equal(result.status, expectedStatus);
  assert.notEqual(result.status, 'identified');
  assert.equal(result.canonicalSlug, null);
  assert.equal(result.plantId, null);
  assert.equal(result.scientificName, null);
  assert.equal(result.commonName, null);
  assert.equal(result.identityConfirmed, false);
  assert.equal(result.saveEligible, false);
}

test('public status enum is exact and closed', () => {
  assert.deepEqual([...IDENTIFICATION_RESULT_STATUSES], [
    'identified',
    'ambiguous',
    'unknown',
    'needs_confirmation',
    'blocked'
  ]);
  assert.deepEqual([...IDENTITY_RESOLUTION_STATUSES], [
    'resolved_id',
    'resolved_canonical',
    'pending_conflict',
    'ambiguous',
    'provisional',
    'unresolved'
  ]);
});

test('1 valid canonical resolved identity -> identified and save eligible', () => {
  const out = createCanonicalIdentificationResult(validInput());
  assert.equal(out.status, 'identified');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.plantId, null);
  assert.equal(out.scientificName, 'Monstera deliciosa');
  assert.equal(out.commonName, 'Monstera');
  assert.equal(out.identityConfirmed, true);
  assert.equal(out.saveEligible, true);
  assert.equal(out.resolution.status, 'resolved_canonical');
  assert.equal(out.catalogAuthority.validation, 'passed');
});

test('resolved_id requires and preserves authoritative plantId', () => {
  const input = validInput({
    resolution: {
      status: 'resolved_id',
      canonicalSlug: 'apple',
      plantId: 'plt_1234567890abcdef',
      matchedBy: 'plantId',
      needsReview: false,
      conflictActive: false
    },
    catalog: {
      authority: 'catalog_plants',
      validation: 'passed',
      canonicalSlug: 'apple',
      scientificName: 'Malus domestica',
      commonName: 'Apple',
      needsReview: false,
      conflictActive: false
    }
  });
  const out = createCanonicalIdentificationResult(input);
  assert.equal(out.status, 'identified');
  assert.equal(out.plantId, 'plt_1234567890abcdef');
  assert.equal(out.canonicalSlug, 'apple');
});

test('2 raw provider scientific name only cannot become identified', () => {
  const out = createCanonicalIdentificationResult({
    status: 'identified',
    providerEvidence: {
      commonName: 'Monstera',
      scientificName: 'Monstera deliciosa',
      confidence: 'high'
    }
  });
  assertNonIdentified(out, 'unknown');
});

test('3 GBIF verified name without CRUVIT canonical resolution cannot become identified', () => {
  const out = createCanonicalIdentificationResult({
    status: 'identified',
    providerEvidence: {
      scientificName: 'Monstera deliciosa',
      gbifVerified: true,
      gbifKey: 2877598
    },
    catalog: {
      authority: 'catalog_plants',
      validation: 'passed',
      canonicalSlug: 'monstera',
      scientificName: 'Monstera deliciosa',
      commonName: 'Monstera',
      needsReview: false,
      conflictActive: false
    }
  });
  assertNonIdentified(out, 'unknown');
});

test('4 unresolved canonical identity -> unknown fail closed', () => {
  const out = createCanonicalIdentificationResult(validInput({
    resolution: { status: 'unresolved', canonicalSlug: 'monstera' }
  }));
  assertNonIdentified(out, 'unknown');
});

test('5 ambiguous resolver result -> ambiguous and no identity fields', () => {
  const out = createCanonicalIdentificationResult(validInput({
    resolution: { status: 'ambiguous', canonicalSlug: 'monstera', plantId: 'plt_1234567890abcdef' }
  }));
  assertNonIdentified(out, 'ambiguous');
});

test('6 pending conflict -> blocked and not saveable', () => {
  const out = createCanonicalIdentificationResult(validInput({
    resolution: {
      status: 'pending_conflict',
      canonicalSlug: 'monstera',
      conflict: { slug: 'monstera' }
    }
  }));
  assertNonIdentified(out, 'blocked');
});

test('7 provisional identity -> needs_confirmation and not saveable', () => {
  const out = createCanonicalIdentificationResult(validInput({
    resolution: { status: 'provisional', canonicalSlug: 'monstera' }
  }));
  assertNonIdentified(out, 'needs_confirmation');
});

test('8 needsReview=true -> needs_confirmation, never identified', () => {
  const input = validInput();
  input.catalog.needsReview = true;
  const out = createCanonicalIdentificationResult(input);
  assertNonIdentified(out, 'needs_confirmation');
});

test('9 catalog authority missing -> not identified', () => {
  const input = validInput();
  delete input.catalog;
  const out = createCanonicalIdentificationResult(input);
  assertNonIdentified(out, 'unknown');
});

test('10 catalog validation failed -> blocked', () => {
  const input = validInput();
  input.catalog.validation = 'failed';
  const out = createCanonicalIdentificationResult(input);
  assertNonIdentified(out, 'blocked');
});

test('catalog slug mismatch fails closed', () => {
  const input = validInput();
  input.catalog.canonicalSlug = 'philodendron';
  const out = createCanonicalIdentificationResult(input);
  assertNonIdentified(out, 'unknown');
  assert.ok(out.reasons.includes('canonical_slug_mismatch'));
});

test('catalog names are the only canonical display identity source', () => {
  const input = validInput();
  input.providerEvidence.commonName = 'Provider Common';
  input.providerEvidence.scientificName = 'Provider scientificum';
  input.commonName = 'Caller Common';
  input.scientificName = 'Caller scientificum';
  const out = createCanonicalIdentificationResult(input);
  assert.equal(out.status, 'identified');
  assert.equal(out.commonName, 'Monstera');
  assert.equal(out.scientificName, 'Monstera deliciosa');
  assert.notEqual(out.commonName, input.providerEvidence.commonName);
  assert.notEqual(out.scientificName, input.providerEvidence.scientificName);
});

test('11 caller cannot force identityConfirmed/saveEligible for unknown or ambiguous', () => {
  for (const status of ['unknown', 'ambiguous']) {
    const out = createCanonicalIdentificationResult({
      status,
      identityConfirmed: true,
      saveEligible: true,
      canonicalSlug: 'monstera',
      scientificName: 'Monstera deliciosa',
      commonName: 'Monstera',
      resolution: { status }
    });
    assertNonIdentified(out, status);
  }
});

test('12 raw provider names never appear in canonical display fields of non-identified result', () => {
  const out = createCanonicalIdentificationResult({
    status: 'ambiguous',
    resolution: { status: 'ambiguous' },
    providerEvidence: {
      commonName: 'Raw Provider Plant',
      scientificName: 'Raw providerensis',
      confidence: 0.999
    }
  });
  assertNonIdentified(out, 'ambiguous');
  assert.equal(out.providerEvidence.scope, 'provider_evidence_only');
  assert.equal(out.providerEvidence.uiCertified, false);
  assert.equal(out.providerEvidence.canonicalAuthority, false);
  assert.equal(out.providerEvidence.data.commonName, 'Raw Provider Plant');
  assert.equal(out.providerEvidence.data.confidence, 0.999);
  assert.equal(Object.hasOwn(out, 'confidence'), false);
});

test('13 malformed/null/empty input returns safe unknown and does not throw', () => {
  for (const input of [null, undefined, '', 0, [], {}, { status: 'identified' }]) {
    let out;
    assert.doesNotThrow(() => { out = createCanonicalIdentificationResult(input); });
    assertNonIdentified(out, 'unknown');
  }

  const cyclic = { status: 'unknown', providerEvidence: {} };
  cyclic.providerEvidence.self = cyclic.providerEvidence;
  let cyclicOut;
  assert.doesNotThrow(() => { cyclicOut = createCanonicalIdentificationResult(cyclic); });
  assertNonIdentified(cyclicOut, 'unknown');
});

test('14 output and nested diagnostic evidence are immutable', () => {
  const out = createCanonicalIdentificationResult(validInput());
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.resolution), true);
  assert.equal(Object.isFrozen(out.catalogAuthority), true);
  assert.equal(Object.isFrozen(out.providerEvidence), true);
  assert.equal(Object.isFrozen(out.providerEvidence.data), true);

  assert.throws(() => {
    out.status = 'unknown';
  }, TypeError);
  assert.throws(() => {
    out.providerEvidence.data.provider = 'mutated';
  }, TypeError);

  assert.equal(out.status, 'identified');
  assert.equal(out.providerEvidence.data.provider, 'synthetic');
});

test('provider evidence confidence is diagnostic only and never creates identified state', () => {
  const out = createCanonicalIdentificationResult({
    status: 'identified',
    providerEvidence: { confidence: 1, commonName: 'Monstera', scientificName: 'Monstera deliciosa' }
  });
  assertNonIdentified(out, 'unknown');
  assert.equal(out.providerEvidence.scope, 'provider_evidence_only');
  assert.equal(Object.hasOwn(out, 'confidence'), false);
});

test('source is pure and contains no network/storage/DOM/provider/catalog reads', () => {
  const file = path.join(ROOT, 'modules', 'plant-identifier', 'canonical-identification-result-v1.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(/);
  assert.doesNotMatch(src, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(src, /\bwindow\b|\bdocument\b|localStorage|sessionStorage/);
  assert.doesNotMatch(src, /\bsupabase\b|plant-identify\.mjs|api\.anthropic\.com|\bgbif\b|\.from\s*\(|\.rpc\s*\(/i);
  assert.doesNotMatch(src, /^\s*import\s/m);
});
