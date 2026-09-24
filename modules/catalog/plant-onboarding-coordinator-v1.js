import { catalogRowToRuntimePlant } from './canonical-catalog-persistence-contract-v1.js';
import { classifyPlantDataReadiness } from '../personal-domain/plant-data-contract-v1.js';
import {
  mapReadinessToEnrichmentGaps,
  assignPriorityAndAction,
  ENRICHMENT_EXECUTION,
  ENRICHMENT_GAP_CODE
} from '../personal-domain/enrichment-gap-scanner-v1.js';

export const PLANT_ONBOARDING_COORDINATOR_VERSION = 'plant-onboarding-coordinator-v1';

export const PLANT_ONBOARDING_ROUTE = Object.freeze({
  READY_FOR_VISUAL_FACTORY: 'READY_FOR_VISUAL_FACTORY',
  AUTO_ENRICHMENT_APPLY_READY: 'AUTO_ENRICHMENT_APPLY_READY',
  AUTO_RESEARCH_REQUIRED: 'AUTO_RESEARCH_REQUIRED',
  CATALOG_EXPANSION_REQUIRED: 'CATALOG_EXPANSION_REQUIRED',
  OWNER_REVIEW_REQUIRED: 'OWNER_REVIEW_REQUIRED',
  BLOCKED_UNKNOWN: 'BLOCKED_UNKNOWN'
});

const CURRENT_AUTO_APPLY_GAPS = new Set([
  ENRICHMENT_GAP_CODE.MISSING_FROST_EVIDENCE,
  ENRICHMENT_GAP_CODE.MISSING_COLD_EVIDENCE,
  ENRICHMENT_GAP_CODE.EVIDENCE_NOT_SOURCE_SUPPORTED
]);

function autoApplySupportedForGaps(gaps = []) {
  const material = gaps.filter((g) => g !== ENRICHMENT_GAP_CODE.NEEDS_REVIEW);
  return material.length > 0
    && !gaps.includes(ENRICHMENT_GAP_CODE.NEEDS_REVIEW)
    && material.every((g) => CURRENT_AUTO_APPLY_GAPS.has(g));
}

export function coordinatePlantOnboarding({
  catalogRow = null,
  fullOnboarding = null
} = {}) {
  const canonicalSlug =
    String(fullOnboarding?.canonicalSlug || catalogRow?.slug || '').trim().toLowerCase() || null;

  if (!catalogRow) {
    return Object.freeze({
      version: PLANT_ONBOARDING_COORDINATOR_VERSION,
      canonicalSlug,
      route: PLANT_ONBOARDING_ROUTE.CATALOG_EXPANSION_REQUIRED,
      visualFactoryAllowed: false,
      paidVisualGenerationAllowed: false,
      reasonCodes: ['CANONICAL_CATALOG_RECORD_MISSING'],
      fullOnboarding,
      enrichment: null
    });
  }

  const runtimePlant = catalogRowToRuntimePlant(catalogRow);
  const readiness = runtimePlant ? classifyPlantDataReadiness(runtimePlant) : null;
  const gaps = runtimePlant && readiness
    ? mapReadinessToEnrichmentGaps(runtimePlant, readiness)
    : [];
  const action = runtimePlant && readiness
    ? assignPriorityAndAction(runtimePlant, readiness, gaps)
    : null;

  const backgroundEnrichmentDebt = {
    readinessClass: readiness?.readinessShort || null,
    productGate: readiness?.gate || null,
    gapCodes: gaps,
    suggestedStage: action?.suggestedStage || null,
    enrichmentExecution: action?.enrichmentExecution || null,
    sourceRetrievalRequired: action?.sourceRetrievalRequired === true,
    currentAutoApplySupported: autoApplySupportedForGaps(gaps)
  };

  if (fullOnboarding?.ready === true) {
    return Object.freeze({
      version: PLANT_ONBOARDING_COORDINATOR_VERSION,
      canonicalSlug,
      route: PLANT_ONBOARDING_ROUTE.READY_FOR_VISUAL_FACTORY,
      visualFactoryAllowed: true,
      paidVisualGenerationAllowed: true,
      reasonCodes: [],
      fullOnboarding,
      enrichment: backgroundEnrichmentDebt
    });
  }

  if (action?.enrichmentExecution === ENRICHMENT_EXECUTION.HOLD_FOR_REVIEW) {
    return Object.freeze({
      version: PLANT_ONBOARDING_COORDINATOR_VERSION,
      canonicalSlug,
      route: PLANT_ONBOARDING_ROUTE.OWNER_REVIEW_REQUIRED,
      visualFactoryAllowed: false,
      paidVisualGenerationAllowed: false,
      reasonCodes: [
        ...(fullOnboarding?.reasons || []),
        ...(gaps || [])
      ],
      fullOnboarding,
      enrichment: backgroundEnrichmentDebt
    });
  }

  if (
    action?.enrichmentExecution === ENRICHMENT_EXECUTION.AUTO
    && autoApplySupportedForGaps(gaps)
  ) {
    return Object.freeze({
      version: PLANT_ONBOARDING_COORDINATOR_VERSION,
      canonicalSlug,
      route: PLANT_ONBOARDING_ROUTE.AUTO_ENRICHMENT_APPLY_READY,
      visualFactoryAllowed: false,
      paidVisualGenerationAllowed: false,
      reasonCodes: [
        ...(fullOnboarding?.reasons || []),
        ...(gaps || [])
      ],
      fullOnboarding,
      enrichment: backgroundEnrichmentDebt
    });
  }

  if (action?.enrichmentExecution === ENRICHMENT_EXECUTION.AUTO) {
    return Object.freeze({
      version: PLANT_ONBOARDING_COORDINATOR_VERSION,
      canonicalSlug,
      route: PLANT_ONBOARDING_ROUTE.AUTO_RESEARCH_REQUIRED,
      visualFactoryAllowed: false,
      paidVisualGenerationAllowed: false,
      reasonCodes: [
        ...(fullOnboarding?.reasons || []),
        ...(gaps || [])
      ],
      fullOnboarding,
      enrichment: backgroundEnrichmentDebt
    });
  }

  return Object.freeze({
    version: PLANT_ONBOARDING_COORDINATOR_VERSION,
    canonicalSlug,
    route: PLANT_ONBOARDING_ROUTE.BLOCKED_UNKNOWN,
    visualFactoryAllowed: false,
    paidVisualGenerationAllowed: false,
    reasonCodes: fullOnboarding?.reasons || ['UNRESOLVED_ONBOARDING_BLOCK'],
    fullOnboarding,
    enrichment: backgroundEnrichmentDebt
  });
}

export const PLANT_ONBOARDING_COORDINATOR_GOVERNANCE = Object.freeze({
  canonicalCatalogAuthority: 'public.catalog_plants',
  fullOnboardingAuthority: 'full-plant-onboarding-gate-v1',
  enrichmentScannerAuthority: 'enrichment-gap-scanner-v1',
  currentAutoApplyFields: ['frostSensitivity','coldTolerance'],
  staleQueueNeverAuthority: true,
  visualSpendBlockedUntilFullOnboardingReady: true,
  noSilentGuessing: true
});
