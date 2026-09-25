import { approvedCovers } from './gap-detector-v1.js';

export const PLANT_VISUAL_VARIANT_GAP_PLAN_VERSION = 'plant-visual-variant-gap-plan-v1';

function slugify(value){
  return String(value==null?'':value)
    .trim().toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}

function findSet(registry, slug){
  const target=slugify(slug);
  return (registry?.sets||[]).find(
    set=>slugify(set?.canonicalSlug)===target
  )||null;
}

export function buildPlantVisualVariantGapPlan({
  variantPlan=null,
  registry={}
}={}) {
  const canonicalSlug=variantPlan?.canonicalSlug||null;
  const set=findSet(registry,canonicalSlug);
  const required=Array.isArray(variantPlan?.requiredVariants)
    ? variantPlan.requiredVariants
    : [];
  const optional=Array.isArray(variantPlan?.optionalVariants)
    ? variantPlan.optionalVariants
    : [];

  const requiredRows=required.map(role=>({
    ...role,
    covered:approvedCovers(set,role)
  }));
  const optionalRows=optional.map(role=>({
    ...role,
    covered:approvedCovers(set,role)
  }));

  const missingRequired=requiredRows.filter(row=>!row.covered);
  const coveredRequired=requiredRows.filter(row=>row.covered);
  const missingOptional=optionalRows.filter(row=>!row.covered);

  const generationAllowed=
    variantPlan?.generationAllowed===true
    && missingRequired.length>0;

  return Object.freeze({
    version:PLANT_VISUAL_VARIANT_GAP_PLAN_VERSION,
    canonicalSlug,
    scientific:variantPlan?.scientific||null,
    variantPlanCode:variantPlan?.code||null,
    visualForm:variantPlan?.visualForm||null,
    generationAllowed,
    registrySetExists:Boolean(set),
    requiredVariantCount:requiredRows.length,
    coveredRequiredCount:coveredRequired.length,
    missingRequiredCount:missingRequired.length,
    optionalVariantCount:optionalRows.length,
    missingOptionalCount:missingOptional.length,
    missingRequired,
    coveredRequired,
    missingOptional,
    seasonalityResearchRequired:variantPlan?.seasonalityResearchRequired===true,
    unknownStates:variantPlan?.unknownStates||[],
    status:
      variantPlan?.generationAllowed!==true
        ? 'ONBOARDING_OR_VARIANT_PLAN_BLOCKED'
        : missingRequired.length
          ? 'MISSING_REQUIRED_VARIANTS'
          : 'REQUIRED_VARIANTS_COVERED'
  });
}
