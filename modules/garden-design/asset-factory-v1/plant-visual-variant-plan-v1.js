import { catalogRowToRuntimePlant } from '../../catalog/canonical-catalog-persistence-contract-v1.js';
import {
  deriveVisualStateRequirements,
  REQUIREMENT,
  PHENOLOGY_STATE
} from './design-asset-visual-states-v1.js';

export const PLANT_VISUAL_VARIANT_PLAN_VERSION = 'plant-visual-variant-plan-v1';

const WOODY_VISUAL_FORMS = new Set(['tree','shrub','subshrub','climber']);

export function buildPlantVisualVariantPlan({
  catalogRow = null,
  fullOnboarding = null
} = {}) {
  const plant = catalogRowToRuntimePlant(catalogRow);
  if (!plant) {
    return Object.freeze({
      version: PLANT_VISUAL_VARIANT_PLAN_VERSION,
      canonicalSlug: fullOnboarding?.canonicalSlug || null,
      ready: false,
      code: 'CANONICAL_PLANT_REQUIRED',
      generationAllowed: false,
      requiredVariants: [],
      optionalVariants: [],
      unknownStates: [],
      seasonalityResearchRequired: false
    });
  }

  const state = deriveVisualStateRequirements(plant);
  const dormantUnknown = state.dormantRequired === REQUIREMENT.UNKNOWN;
  const seasonalityResearchRequired =
    dormantUnknown
    && (
      WOODY_VISUAL_FORMS.has(state.visualForm)
      || plant.seasonalityResearchRequired === true
    );

  const winterRepresentation =
    state.dormantRequired === REQUIREMENT.REQUIRED
      ? {
          mode:'DISTINCT_DORMANT_ASSET',
          phenologyState:PHENOLOGY_STATE.DORMANT,
          reason:state.dormantDecision?.reasonCode || null
        }
      : state.dormantRequired === REQUIREMENT.NOT_REQUIRED
        ? {
            mode:'NO_DISTINCT_WINTER_ASSET',
            phenologyState:PHENOLOGY_STATE.VEGETATIVE,
            reason:state.dormantDecision?.reasonCode || null
          }
        : {
            mode:'SEASONAL_RESEARCH_REQUIRED',
            phenologyState:null,
            reason:state.dormantDecision?.reasonCode || null
          };

  const summerRepresentation = {
    mode:'MATURE_VEGETATIVE_CONTEXT',
    phenologyState:PHENOLOGY_STATE.VEGETATIVE,
    note:'Calendar summer is context, not a separate asset identity unless a biological state such as fruiting is selected.'
  };

  const generationAllowed =
    fullOnboarding?.ready === true
    && state.generationBlocked !== true
    && state.requiredVariants.length > 0;

  return Object.freeze({
    version: PLANT_VISUAL_VARIANT_PLAN_VERSION,
    canonicalSlug: state.canonicalSlug,
    scientific: plant.scientific || null,
    ready: generationAllowed,
    code: generationAllowed
      ? 'VARIANT_PLAN_READY'
      : fullOnboarding?.ready !== true
        ? 'FULL_PLANT_ONBOARDING_REQUIRED'
        : state.generationBlocked
          ? 'VARIANT_PLAN_IDENTITY_BLOCKED'
          : 'VARIANT_PLAN_INCOMPLETE',
    generationAllowed,
    visualForm: state.visualForm,
    architectureModeSupport: state.architectureModeSupport,
    lifecycle: plant.designMetadata?.lifecycle || null,
    youngRequired: state.youngRequired,
    floweringRequired: state.floweringRequired,
    fruitingRequired: state.fruitingRequired,
    dormantRequired: state.dormantRequired,
    requiredVariants: state.requiredVariants,
    optionalVariants: state.optionalVariants,
    unknownStates: state.unknownStates,
    seasonalityResearchRequired,
    seasonalityEvidence: plant.seasonalityEvidence || null,
    calendarContextPolicy: {
      seasonIsAssetIdentity:false,
      summer:summerRepresentation,
      winter:winterRepresentation
    },
    ownerWorkloadPolicy:'owner review only for unresolved/exception states'
  });
}
