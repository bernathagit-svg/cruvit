import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPlantIdentityResolver } from '../modules/identity/plant-identity-resolver.js';
import {
  AUTHORITATIVE_SIGNAL_NAMESPACES,
  RESOLUTION_STATUSES,
  createCanonicalIdentificationResolutionAdapter
} from '../modules/plant-identifier/canonical-identification-resolution-adapter-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function registryFixture() {
  return {
    schemaVersion: 1,
    registryVersion: 'pi-prov-2-test-v1',
    canonicalIdentities: [
      {
        canonicalSlug: 'monstera',
        acceptedScientificName: 'Monstera deliciosa',
        aliasSlugs: ['swiss-cheese-plant'],
        needsReview: false,
        scientificSynonyms: [
          {
            name: 'Monstera pertusa',
            relationship: 'synonym',
            confidence: 'high',
            needsReview: false,
            sources: [
              {
                authority: 'gbif',
                verifiedAt: '2026-10-09',
                recordId: 'monstera-pertusa-test'
              }
            ]
          }
        ]
      },
      {
        canonicalSlug: 'apple',
        acceptedScientificName: 'Malus domestica',
        aliasSlugs: ['apple-tree'],
        needsReview: false
      },
      {
        canonicalSlug: 'needs-review-plant',
        acceptedScientificName: 'Reviewus pendingii',
        needsReview: true
      },
      {
        canonicalSlug: 'collision-a',
        acceptedScientificName: 'Ambigua plantus',
        needsReview: false
      },
      {
        canonicalSlug: 'collision-b',
        acceptedScientificName: 'Ambigua plantus',
        needsReview: false
      },
      {
        canonicalSlug: 'module-key-only',
        acceptedScientificName: 'Modulea keyensis',
        moduleKeys: {
          legacy: ['legacy-module-key']
        },
        needsReview: false
      }
    ],
    duplicateConflicts: [
      {
        slug: 'conflicted-plant',
        needsReview: true,
        conflictType: 'same_slug_multiple_scientific',
        resolutionStatus: 'pending',
        observedRecords: [
          { scientificName: 'Conflicta plantus' },
          { scientificName: 'Conflicta altera' }
        ]
      }
    ]
  };
}

function makeAdapter(registry = registryFixture()) {
  const resolver = createPlantIdentityResolver(registry);
  assert.equal(resolver.valid, true);
  return {
    resolver,
    adapter: createCanonicalIdentificationResolutionAdapter({ resolver })
  };
}

function taxonomy(value) {
  return { source: 'taxonomy_verified', kind: 'scientific_name', value };
}

function cruvitSlug(value) {
  return { source: 'cruvit_internal', kind: 'cruvit_slug', value };
}

function assertNonPositive(out, status) {
  if (status) assert.equal(out.status, status);
  assert.equal(['resolved_id', 'resolved_canonical'].includes(out.status), false);
  assert.equal(out.canonicalSlug, null);
  assert.equal(out.plantId, null);
}

test('public namespaces and status enum are exact', () => {
  assert.deepEqual([...AUTHORITATIVE_SIGNAL_NAMESPACES], [
    'taxonomy_verified:scientific_name',
    'cruvit_internal:cruvit_slug'
  ]);
  assert.deepEqual([...RESOLUTION_STATUSES], [
    'resolved_id',
    'resolved_canonical',
    'pending_conflict',
    'ambiguous',
    'provisional',
    'unresolved'
  ]);
});

test('1 exact accepted scientific name resolves through existing resolver', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Monstera deliciosa')] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.matchedBy, 'scientificName');
  assert.equal(out.needsReview, false);
  assert.equal(out.accounting.resolverCalls, 1);
});

test('2 accepted high-confidence scientific synonym resolves same canonical identity', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Monstera pertusa')] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.matchedBy, 'scientificSynonym');
});

test('3 CRUVIT internal alias slug resolves through exact alias path', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [cruvitSlug('swiss-cheese-plant')] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.matchedBy, 'aliasSlug');
});

test('CRUVIT internal canonical slug resolves through exact canonical path', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [cruvitSlug('monstera')] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.matchedBy, 'canonicalSlug');
});

test('namespace safety rejects resolver module-key match from cruvit_slug signal', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [cruvitSlug('legacy-module-key')] });
  assertNonPositive(out, 'unresolved');
  assert.equal(out.evidence[0].matchedBy, 'moduleKey');
  assert.equal(out.evidence[0].status, 'unresolved');
});

test('4 unverified provider scientific name is rejected before resolver authority', () => {
  let calls = 0;
  const resolver = {
    resolve() { calls += 1; return { status: 'resolved_canonical', canonicalSlug: 'monstera', matchedBy: 'scientificName' }; },
    getRegistryVersion() { return 'stub'; }
  };
  const adapter = createCanonicalIdentificationResolutionAdapter({ resolver });
  const out = adapter.resolve({
    signals: [{ source: 'provider', kind: 'scientific_name', value: 'Monstera deliciosa' }]
  });
  assertNonPositive(out, 'unresolved');
  assert.equal(calls, 0);
  assert.equal(out.accounting.rejectedSignals, 1);
});

test('5 provider common name only cannot produce canonical positive resolution', () => {
  let calls = 0;
  const resolver = {
    resolve() { calls += 1; throw new Error('must not be called'); },
    getRegistryVersion() { return 'stub'; }
  };
  const adapter = createCanonicalIdentificationResolutionAdapter({ resolver });
  const out = adapter.resolve({
    signals: [{ source: 'provider', kind: 'common_name', value: 'Swiss Cheese Plant' }]
  });
  assertNonPositive(out, 'unresolved');
  assert.equal(calls, 0);
});

test('6 unknown taxonomy-validated scientific species becomes unresolved', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Unknownia absentia')] });
  assertNonPositive(out, 'unresolved');
  assert.equal(out.evidence[0].status, 'unresolved');
});

test('7 pending duplicate conflict has priority and stays pending_conflict', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Conflicta plantus')] });
  assertNonPositive(out, 'pending_conflict');
  assert.equal(out.conflictActive, true);
});

test('8 ambiguous scientific collision stays ambiguous', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Ambigua plantus')] });
  assertNonPositive(out, 'ambiguous');
});

test('9 provisional resolver identity stays provisional and non-positive', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [cruvitSlug('not-in-registry-slug')] });
  assertNonPositive(out, 'provisional');
  assert.equal(out.needsReview, true);
});

test('10 needsReview canonical identity is preserved and not clean-positive', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Reviewus pendingii')] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'needs-review-plant');
  assert.equal(out.needsReview, true);
  assert.ok(out.reasonCodes.includes('same_identity_resolved_needs_review'));
});

test('11 two validated candidates resolving to different canonical slugs -> ambiguous', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa'), taxonomy('Malus domestica')]
  });
  assertNonPositive(out, 'ambiguous');
  assert.ok(out.reasonCodes.includes('multiple_canonical_identities'));
  assert.equal(out.accounting.resolverCalls, 2);
});

test('12 one positive + one unresolved competing validated candidate fails closed', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa'), taxonomy('Unknownia absentia')]
  });
  assertNonPositive(out, 'ambiguous');
  assert.ok(out.reasonCodes.includes('resolved_and_unresolved_competing_candidates'));
});

test('positive + provisional competing candidate fails closed as provisional', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa'), cruvitSlug('missing-cruvit-slug')]
  });
  assertNonPositive(out, 'provisional');
});

test('conflict priority overrides another positive candidate', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa'), taxonomy('Conflicta plantus')]
  });
  assertNonPositive(out, 'pending_conflict');
  assert.equal(out.conflictActive, true);
  assert.ok(out.reasonCodes.includes('pending_conflict_priority'));
});

test('13 two validated signals resolving to same canonical identity may resolve positively', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa'), taxonomy('Monstera pertusa')]
  });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.needsReview, false);
  assert.ok(out.reasonCodes.includes('same_identity_multiple_validated_signals'));
  assert.equal(out.accounting.resolvedSignals, 2);
});

test('14 duplicate candidate evidence is deduplicated and does not create false multiplicity', () => {
  const { adapter } = makeAdapter();
  const signal = taxonomy('Monstera deliciosa');
  const out = adapter.resolve({ signals: [signal, { ...signal }] });
  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.accounting.receivedSignals, 2);
  assert.equal(out.accounting.authoritativeSignals, 1);
  assert.equal(out.accounting.duplicateSignals, 1);
  assert.equal(out.accounting.resolverCalls, 1);
});

test('15 malformed/null/empty candidate set returns safe unresolved without escaping throw', () => {
  const { adapter } = makeAdapter();
  for (const input of [null, undefined, '', 0, [], {}, { signals: null }, { signals: [] }, { signals: [null] }]) {
    let out;
    assert.doesNotThrow(() => { out = adapter.resolve(input); });
    assertNonPositive(out, 'unresolved');
  }
});

test('16 result and nested evidence/diagnostics are deeply frozen', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({
    signals: [taxonomy('Monstera deliciosa')],
    diagnostics: { provider: { confidence: 0.97, rawName: 'Provider Monstera' } }
  });

  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.accounting), true);
  assert.equal(Object.isFrozen(out.evidence), true);
  assert.equal(Object.isFrozen(out.evidence[0]), true);
  assert.equal(Object.isFrozen(out.diagnostics), true);
  assert.equal(Object.isFrozen(out.diagnostics.data), true);
  assert.equal(Object.isFrozen(out.diagnostics.data.provider), true);

  assert.throws(() => { out.status = 'unresolved'; }, TypeError);
  assert.throws(() => { out.evidence[0].canonicalSlug = 'apple'; }, TypeError);
  assert.throws(() => { out.diagnostics.data.provider.confidence = 0; }, TypeError);

  assert.equal(out.status, 'resolved_canonical');
  assert.equal(out.canonicalSlug, 'monstera');
  assert.equal(out.diagnostics.data.provider.confidence, 0.97);
});

test('adapter output contains no canonical display names or save flags', () => {
  const { adapter } = makeAdapter();
  const out = adapter.resolve({ signals: [taxonomy('Monstera deliciosa')] });
  assert.equal(Object.hasOwn(out, 'commonName'), false);
  assert.equal(Object.hasOwn(out, 'scientificName'), false);
  assert.equal(Object.hasOwn(out, 'identityConfirmed'), false);
  assert.equal(Object.hasOwn(out, 'saveEligible'), false);
  assert.equal(Object.hasOwn(out, 'confidence'), false);
});

test('adapter uses explicitly injected resolver and has no resolver/registry loader import', () => {
  const file = path.join(ROOT, 'modules', 'plant-identifier', 'canonical-identification-resolution-adapter-v1.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /createPlantIdentityResolver|loadIdentityRegistry|resolvePlantIdentity/);
  assert.match(src, /resolver\.resolve\(signal\.resolverInput\)/);
});

test('adapter purity: no network DOM storage database provider catalog or telemetry activity', () => {
  const file = path.join(ROOT, 'modules', 'plant-identifier', 'canonical-identification-resolution-adapter-v1.js');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  assert.doesNotMatch(src, /\bwindow\b|\bdocument\b|localStorage|sessionStorage/);
  assert.doesNotMatch(src, /\bsupabase\b|(?:client|supabase)\.from\s*\(|\.rpc\s*\(|catalog_plants|api\.anthropic\.com|\bgbif\b/i);
  assert.doesNotMatch(src, /console\.|telemetry|analytics/i);
});
