/**
 * Production artifact retention v1 — classification hygiene only.
 * Non-mutating.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_ARTIFACT_RETENTION_REF,
  FULL_IDEMPOTENCE_ARTIFACT_DUPLICATION_REQUIRED,
  IDEMPOTENCE_RETENTION_POLICY,
  PRODUCTION_ARTIFACT_RETENTION_CLASSES,
  classifyProductionArtifactPath
} from '../modules/personal-domain/production-artifact-retention-v1.js';

test('retention ref + class A–D frozen', () => {
  assert.match(PRODUCTION_ARTIFACT_RETENTION_REF, /^production-artifact-retention-v1@/);
  assert.equal(PRODUCTION_ARTIFACT_RETENTION_CLASSES.A.commit, true);
  assert.equal(PRODUCTION_ARTIFACT_RETENTION_CLASSES.B.commit, true);
  assert.equal(PRODUCTION_ARTIFACT_RETENTION_CLASSES.C.commit, false);
  assert.equal(PRODUCTION_ARTIFACT_RETENTION_CLASSES.D.implemented, false);
});

test('idempotence full tree duplication not required', () => {
  assert.equal(FULL_IDEMPOTENCE_ARTIFACT_DUPLICATION_REQUIRED, 'NO');
  assert.equal(IDEMPOTENCE_RETENTION_POLICY.FULL_IDEMPOTENCE_ARTIFACT_DUPLICATION_REQUIRED, 'NO');
});

test('classify: code/tests commit; cache/packets/console excluded', () => {
  assert.equal(
    classifyProductionArtifactPath('modules/personal-domain/bounded-production-controller-v1.js')
      .commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/bounded-production-controller-real-v1/cache/abc.json'
    ).commit,
    false
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/x/artifacts/batch-1/dry/candidate-packets/apricot.candidate-packet-v1.json'
    ).commit,
    false
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/x/console-output.txt'
    ).commit,
    false
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-worker/bounded-production-controller-real-v1/semantic-noop-hardening/semantic-noop-hardening-proof.json'
    ).commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'data/catalog/enrichment-control/production-retry-fairness-state-v1.json'
    ).commit,
    true
  );
  assert.equal(
    classifyProductionArtifactPath(
      'modules/personal-domain/production-retry-fairness-policy-v1.js'
    ).commit,
    true
  );
});
