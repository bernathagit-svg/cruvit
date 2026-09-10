/**
 * Production Artifact Retention V1 — what belongs in Git vs operational history.
 *
 * Git is for durable product/code truth and minimal decision-relevant proofs.
 * It is NOT an operational log warehouse for every retrieval packet/cache dump.
 *
 * Long-term run history should eventually live outside normal Git history
 * (external/local operational store). Not implemented here.
 */
export const PRODUCTION_ARTIFACT_RETENTION_ID = 'production-artifact-retention-v1';
export const PRODUCTION_ARTIFACT_RETENTION_VERSION = '1.0.0';
export const PRODUCTION_ARTIFACT_RETENTION_REF = `${PRODUCTION_ARTIFACT_RETENTION_ID}@${PRODUCTION_ARTIFACT_RETENTION_VERSION}`;

/** A — always commit when changed */
export const RETENTION_CLASS_A_CODE_POLICY = Object.freeze({
  code: 'A',
  name: 'COMMIT_CODE_POLICY',
  commit: true,
  examples: Object.freeze([
    'production implementation',
    'worker / controller / scanner implementation',
    'tests',
    'migration / schema changes',
    'this retention policy module'
  ])
});

/** B — minimal run proof for a meaningful validation checkpoint */
export const RETENTION_CLASS_B_MINIMAL_RUN_PROOF = Object.freeze({
  code: 'B',
  name: 'COMMIT_MINIMAL_RUN_PROOF',
  commit: true,
  examples: Object.freeze([
    'run config',
    'final run summary',
    'selected / locked batch summary (if not embedded)',
    'stop reason / controller decision',
    'compact evidence/provenance summary when required',
    'explicit proof artifact for the bug/fix under validation'
  ])
});

/** C — duplicate operational artifacts (normally exclude from Git) */
export const RETENTION_CLASS_C_DUPLICATE_OPERATIONAL = Object.freeze({
  code: 'C',
  name: 'DO_NOT_COMMIT_DUPLICATE_OPERATIONAL',
  commit: false,
  examples: Object.freeze([
    'repeated dry candidate packets when final summary holds the decision truth',
    'repeated real candidate packets',
    'repeated idempotence candidate packets',
    'duplicate evidence records across dry/real/idempotence',
    'duplicate retrieval summaries across phases',
    'console dumps',
    'regression text dumps',
    'local retrieval cache',
    'raw HTML',
    'intermediate / stale checkpoint inventories'
  ])
});

/** D — architectural direction only (not built in this checkpoint) */
export const RETENTION_CLASS_D_EXTERNAL_OPERATIONAL_HISTORY = Object.freeze({
  code: 'D',
  name: 'EXTERNAL_OR_LOCAL_OPERATIONAL_HISTORY',
  commit: false,
  implemented: false,
  description:
    'Long-term operational run history should live outside normal Git history. ' +
    'Do not accumulate unbounded per-plant packet trees in the product repository.'
});

export const PRODUCTION_ARTIFACT_RETENTION_CLASSES = Object.freeze({
  A: RETENTION_CLASS_A_CODE_POLICY,
  B: RETENTION_CLASS_B_MINIMAL_RUN_PROOF,
  C: RETENTION_CLASS_C_DUPLICATE_OPERATIONAL,
  D: RETENTION_CLASS_D_EXTERNAL_OPERATIONAL_HISTORY
});

/**
 * Idempotence is proven by summary fields + tests, not a second full retrieval tree.
 */
export const FULL_IDEMPOTENCE_ARTIFACT_DUPLICATION_REQUIRED = 'NO';

export const IDEMPOTENCE_RETENTION_POLICY = Object.freeze({
  FULL_IDEMPOTENCE_ARTIFACT_DUPLICATION_REQUIRED,
  prefer: Object.freeze([
    'final summary idempotence object',
    'unit/integration tests',
    'compact SECOND_WORKER_RUN_WOULD_MUTATE result'
  ]),
  avoid: Object.freeze([
    'full dry+real+idempotence copies of candidate packets',
    'full duplicate evidence records',
    'full duplicate retrieval summaries'
  ])
});

/**
 * Classify a relative path under enrichment-worker (or known code paths).
 * Heuristic for hygiene gates — not a filesystem walker.
 */
export function classifyProductionArtifactPath(relPath) {
  const p = String(relPath || '').replace(/\\/g, '/');
  if (!p) return { class: 'C', commit: false, reason: 'empty_path' };

  if (
    p.startsWith('modules/') ||
    p.startsWith('tests/') ||
    (p.startsWith('scripts/') && p.includes('bounded'))
  ) {
    if (p.includes('production-artifact-retention')) {
      return { class: 'A', commit: true, reason: 'retention_policy' };
    }
    return { class: 'A', commit: true, reason: 'code_or_test' };
  }

  if (p.includes('/cache/') || p.endsWith('.html') || /\/cache\//.test(p)) {
    return { class: 'C', commit: false, reason: 'raw_cache_or_html' };
  }
  if (/console-output\.txt$/i.test(p) || /regression-output\.txt$/i.test(p)) {
    return { class: 'C', commit: false, reason: 'console_or_regression_dump' };
  }
  if (
    /candidate-packet/i.test(p) ||
    /evidence-records/i.test(p) ||
    /source-retriever-pilot-v1-summary-/i.test(p)
  ) {
    return { class: 'C', commit: false, reason: 'duplicate_operational_retrieval_tree' };
  }
  if (/checkpoint-file-list\.json$/i.test(p) && !/compact-commit-file-list/i.test(p)) {
    return { class: 'C', commit: false, reason: 'stale_or_intermediate_inventory' };
  }

  if (
    /controller-run-config\.json$/i.test(p) ||
    /real-v1-final\.json$/i.test(p) ||
    /run-summary\.json$/i.test(p) ||
    /semantic-noop-hardening-proof\.json$/i.test(p) ||
    /first-real-run-compact-proof\.json$/i.test(p) ||
    /compact-commit-file-list\.json$/i.test(p) ||
    /production-artifact-retention/i.test(p) ||
    /production-retry-fairness/i.test(p) ||
    /enrichment-control\/production-retry-fairness-state-v1\.json$/i.test(p)
  ) {
    return { class: 'B', commit: true, reason: 'minimal_run_proof' };
  }

  // Per-job / per-phase worker audits under batch-N/{dry,real,idempotence}/
  if (/\/batch-\d+\/(dry|real|idempotence)\//i.test(p)) {
    return { class: 'C', commit: false, reason: 'phase_audit_duplication' };
  }

  return { class: 'C', commit: false, reason: 'default_exclude_unless_proven_unique' };
}
