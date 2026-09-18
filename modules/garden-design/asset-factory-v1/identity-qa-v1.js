/**
 * Identity / variant QA. Local heuristics are free. Model-based QA is paid
 * and must use the same spend envelope. Low confidence never auto-approves.
 */
import { classifyDesignVisualForm } from '../garden-design-variant-policy-v1.js';
import { slugify } from './variant-demand-v1.js';

export const IDENTITY_QA_VERSION = '1.0.0';

export function assessIdentityQa(job = {}, plant = {}, options = {}) {
  const reasons = [];
  const slug = slugify(job.canonicalSlug || plant.canonicalSlug || plant.slug);
  const plantSlug = slugify(plant.canonicalSlug || plant.slug);
  if (!slug) {
    return {
      result: 'FAIL',
      confidence: 'none',
      reasons: ['unresolved-genus-species'],
      autoApproveEligible: false,
      paidAssessment: false
    };
  }
  if (plantSlug && slug !== plantSlug) {
    return {
      result: 'FAIL',
      confidence: 'high',
      reasons: ['wrong-canonical-identity-ambiguous-metadata'],
      autoApproveEligible: false,
      paidAssessment: false
    };
  }

  const architecture = classifyDesignVisualForm(plant);
  if (architecture.visualForm === 'unknown' || architecture.authority === 'unknown') {
    reasons.push('missing-morphology-authority');
  }
  if (job.visualForm && architecture.visualForm !== 'unknown' && job.visualForm !== architecture.visualForm) {
    reasons.push('visual-morphology-mismatch');
  }
  if (!job.growthStage || job.growthStage === 'unspecified') {
    reasons.push('variant-ambiguity');
  }

  const paidRequested = options.paidModelQa === true;
  if (paidRequested) {
    return {
      result: 'UNKNOWN',
      confidence: 'unknown',
      reasons: [...reasons, 'paid-identity-qa-not-run-without-envelope'],
      autoApproveEligible: false,
      paidAssessment: false,
      note: 'Model-based identity QA incurs cost and must share the owner spend envelope. It is not executed here.'
    };
  }

  if (reasons.includes('missing-morphology-authority')) {
    return {
      result: 'UNKNOWN',
      confidence: 'low',
      reasons,
      autoApproveEligible: false,
      paidAssessment: false
    };
  }

  if (reasons.length) {
    return {
      result: 'UNKNOWN',
      confidence: 'low',
      reasons,
      autoApproveEligible: false,
      paidAssessment: false
    };
  }

  return {
    result: 'UNKNOWN',
    confidence: 'heuristic-only',
    reasons: ['botanical-identity-not-visually-confirmed'],
    autoApproveEligible: false,
    paidAssessment: false,
    note: 'Local checks can reject mismatches. They cannot prove species identity. UNKNOWN is allowed. No auto-approval.'
  };
}
