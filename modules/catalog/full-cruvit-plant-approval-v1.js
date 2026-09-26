/**
 * CRUVIT Full End-to-End Plant Approval Gate V1
 *
 * A plant is not "approved" merely because it is ready for Garden Design.
 * FULL_CRUVIT_APPROVED means the same canonical plant record is ready to
 * safely support CRUVIT's plant-facing modules without silent guessing.
 *
 * Pure/local. No network, no paid calls, no writes.
 */
import { evaluateFullPlantOnboarding } from './full-plant-onboarding-gate-v1.js';
import { catalogRowToRuntimePlant } from './canonical-catalog-persistence-contract-v1.js';
import { classifyPlantDataReadiness } from '../personal-domain/plant-data-contract-v1.js';
import { buildPlantVisualVariantPlan } from '../garden-design/asset-factory-v1/plant-visual-variant-plan-v1.js';
import { buildPlantVisualVariantGapPlan } from '../garden-design/asset-factory-v1/plant-visual-variant-gap-plan-v1.js';
import {
  resolvePlantSizeAuthorityReadiness,
  SIZE_AUTHORITY_STATE
} from '../garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';

export const FULL_CRUVIT_PLANT_APPROVAL_VERSION = 'full-cruvit-plant-approval-v1';

export const FULL_CRUVIT_PLANT_STATUS = Object.freeze({
  APPROVED:'FULL_CRUVIT_APPROVED',
  ENRICHMENT_REQUIRED:'ENRICHMENT_REQUIRED',
  VISUAL_COMPLETION_REQUIRED:'VISUAL_COMPLETION_REQUIRED',
  OWNER_REVIEW_REQUIRED:'OWNER_REVIEW_REQUIRED',
  BLOCKED:'BLOCKED'
});

function text(v){ return String(v == null ? '' : v).trim(); }
function norm(v){ return text(v).toLowerCase().replace(/\s+/g,' '); }

function identityRecord(registry, slug){
  const key=norm(slug);
  return (registry?.canonicalIdentities||[]).find(row=>
    norm(row?.canonicalSlug)===key
    || (row?.aliasSlugs||[]).some(a=>norm(a)===key)
  )||null;
}

function catalogMediaReady(row={}, coverageRecord=null){
  const coverageStatus=text(coverageRecord?.imageStatus).toUpperCase();
  if(coverageStatus==='IMAGE_READY' && coverageRecord?.approved===true){
    return {
      ready:true,
      status:'IMAGE_READY',
      authority:'active-canonical-image-coverage-v1',
      canonicalSlug:coverageRecord.slug||null
    };
  }
  const status=text(row.media_status || row.mediaStatus || row.media?.imageStatus).toUpperCase();
  return {
    ready: status === 'IMAGE_READY',
    status: status || coverageStatus || 'IMAGE_UNKNOWN',
    authority:'catalog_plants.media'
  };
}

function knowledgeState(runtimePlant){
  const k=runtimePlant?.climateTraits?.plantKnowledge;
  const ready=Boolean(
    k && typeof k==='object'
    && text(k.plantKnowledgeContractVersion)
    && Array.isArray(k.sources)
    && k.sources.length>0
  );
  return {
    ready,
    sourceCount: Array.isArray(k?.sources) ? k.sources.length : 0,
    warningsAvailable: Array.isArray(k?.warnings),
    toxicityState: k?.toxicity ? 'AVAILABLE' : 'UNKNOWN_OR_NOT_RECORDED',
    invasivenessState: k?.invasiveness ? 'AVAILABLE' : 'UNKNOWN_OR_NOT_RECORDED'
  };
}

export function classifyFruitProductionIntent(runtimePlant){
  const traits=runtimePlant?.climateTraits||{};
  const groups=Array.isArray(traits.groupIds)?traits.groupIds.map(x=>norm(x)):[];
  const tags=Array.isArray(runtimePlant?.tags)?runtimePlant.tags.map(x=>norm(x)):[];
  const prov=traits?.traitProvenance?.fruitingRequirements||{};
  const tagProv=traits?.traitProvenance?.tags||{};
  const fruitingText=norm(traits.fruitingRequirements);
  const provenanceAsserted=String(prov?.status||'').toLowerCase()==='asserted';
  const provenanceKnown=provenanceAsserted && Array.isArray(prov?.sourceIds) && prov.sourceIds.length>0;
  const tagProvenanceKnown=
    String(tagProv?.status||'').toLowerCase()==='asserted'
    && Array.isArray(tagProv?.sourceIds)
    && tagProv.sourceIds.length>0;
  const tagEvidenceText=norm(tagProv?.shortExcerpt);

  // Primary harvest-purpose evidence outranks legacy group templates.
  // Leaf/root/flower-bud crops must not become fruit-yield crops just because an old
  // group template contains "fruit".
  const explicitVegetativeHarvest =
    tags.some(t=>['leafy','root','edible-flower','cut-flower'].includes(t))
    || /grown for (?:edible )?(?:leaves|leaf|foliage|taproots?|roots?|flower buds?|flowers?)|harvest immature flower heads?|flower buds? harvested|edible (?:leaf stalks?|tuberous roots?|immature flower buds?)/.test(fruitingText);
  if(explicitVegetativeHarvest){
    return {applicable:false,authority:'EXPLICIT_NON_REPRODUCTIVE_HARVEST_PURPOSE',reason:'PRIMARY_YIELD_IS_NOT_FRUIT_OR_SEED_SET'};
  }

  const explicitNonFruitPurpose =
    /not grown for (?:edible )?fruit|not (?:a|an) .*fruit crop|not a food crop|not a conventional culinary fruit crop|grown for (?:foliage|flowers|leaves)|secondary to flowering|if allowed to fruit|ornamental(?:\b|;)|seed heads?|capsules?/.test(fruitingText);
  if(explicitNonFruitPurpose){
    return {applicable:false,authority:'EXPLICIT_NON_FRUIT_PURPOSE',reason:'FRUITING_TEXT_DESCRIBES_NON_CROP_REPRODUCTION'};
  }

  // Explicit crop tags describe a harvest that depends on flowering / set.
  const structuredPositive=
    tags.some(t=>['fruit','citrus','berry','fruit-tree','orchard','melon','cucurbit','legume'].includes(t))
    || groups.some(g=>/fruit|citrus|berry/.test(g));
  if(structuredPositive){
    return {applicable:true,authority:'STRUCTURED_REPRODUCTIVE_YIELD_PURPOSE',reason:null};
  }

  if(tagProvenanceKnown && /catalog tags:.*\b(fruit|berry|citrus|melon|cucurbit|legume)\b/.test(tagEvidenceText)){
    return {applicable:true,authority:'SOURCE_BACKED_CATALOG_TAG_PURPOSE',reason:null};
  }

  // Legacy catalog rows may lack structural tags. Only source-backed wording that clearly
  // describes harvested / edible / ripening reproductive yield is accepted.
  const sourceBackedCropText = provenanceKnown && (
    /edible .*(fruit|berry|berries|pome|drupe|pod|pods)/.test(fruitingText)
    || /(fruit|berry|berries|pome|drupe|pod|pods).*(edible|sweet|pulp|harvest|ripen|ripe|crop)/.test(fruitingText)
    || /harvest .*(fruit|berry|berries|pod|pods|peas|beans|squash)/.test(fruitingText)
    || /(fruit|berry|berries|pod|pods).*ripen/.test(fruitingText)
    || /fruit set/.test(fruitingText)
  );
  if(sourceBackedCropText){
    return {applicable:true,authority:'SOURCE_BACKED_REPRODUCTIVE_YIELD_TEXT',reason:null};
  }

  return {applicable:false,authority:'NO_REPRODUCTIVE_YIELD_PURPOSE_EVIDENCE',reason:null};
}

function reproductiveClimateState(runtimePlant){
  const traits=runtimePlant?.climateTraits||{};
  const fruitIntent=classifyFruitProductionIntent(runtimePlant);
  const fruitOriented=fruitIntent.applicable===true;
  const rc=traits.reproductiveClimate;
  const fruiting=rc&&typeof rc==='object'&&rc.fruiting&&typeof rc.fruiting==='object'
    ?rc.fruiting:null;
  const evidenceClass=text(fruiting?.evidenceClass).toUpperCase();
  const evidenceState=text(fruiting?.evidenceState).toUpperCase();
  const sourceIds=Array.isArray(fruiting?.sourceIds)
    ? fruiting.sourceIds.map(x=>text(x)).filter(Boolean)
    : [];
  const researchedState=[
    'CONTEXT_DEPENDENT',
    'RESEARCHED_UNQUANTIFIED'
  ].includes(evidenceState);
  const structured=Boolean(
    fruiting
    && (
      fruiting.summerHeatBand
      || fruiting.minWarmestMonthMeanMaxC!=null
      || fruiting.minReproductiveEventC!=null
      || fruiting.requiresFrostFree===true
      || fruiting.requiresCoolSeason===true
      || text(fruiting.seasonalInductionCue).toLowerCase()==='cool_or_dry'
      || researchedState
    )
    && ['SOURCE_SUPPORTED','HEURISTIC_ASSERTION'].includes(evidenceClass)
    && sourceIds.length>0
  );
  return {
    applicable:fruitOriented,
    purposeAuthority:fruitIntent.authority,
    ready:!fruitOriented||structured,
    contractVersion:rc?.contractVersion||null,
    fruitingStructured:structured,
    evidenceClass:evidenceClass||null,
    evidenceState:evidenceState||null,
    sourceCount:sourceIds.length,
    reason:fruitOriented&&!structured?'FRUITING_REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED':null
  };
}

function doctorState({identityReady,knowledgeReady}){
  // Plant Doctor is a runtime diagnostic engine. Per-plant disease encyclopedias
  // are not required by its current contract; canonical identity + knowledge are.
  return {
    ready: identityReady && knowledgeReady,
    diagnosticMode:'RUNTIME_SINGLE_CALL',
    staticDiseaseCorpusRequired:false,
    safeWritebackContract:'plant-doctor-care-loop-v1'
  };
}

function sizeState(registry, variantPlan){
  const roles=Array.isArray(variantPlan?.requiredVariants) ? variantPlan.requiredVariants : [];
  if(!roles.length){
    return { ready:false, states:[], reasonCodes:['NO_REQUIRED_VISUAL_ROLES'] };
  }
  const evaluations=roles.map(role=>resolvePlantSizeAuthorityReadiness(registry,{
    canonicalSlug:variantPlan.canonicalSlug,
    growthStage:role.growthStage,
    visualForm:role.visualForm || variantPlan.visualForm
  }));
  const allowed=new Set([
    SIZE_AUTHORITY_STATE.READY,
    SIZE_AUTHORITY_STATE.PARTIAL,
    SIZE_AUTHORITY_STATE.CONTEXT_REQUIRED
  ]);
  return {
    ready:evaluations.every(x=>allowed.has(x.state)),
    states:[...new Set(evaluations.map(x=>x.state))],
    contextRequired:evaluations.some(x=>x.state===SIZE_AUTHORITY_STATE.CONTEXT_REQUIRED),
    reasonCodes:[...new Set(evaluations.flatMap(x=>x.reasonCodes||[]))],
    evaluations
  };
}

export function evaluateFullCruvitPlantApproval({
  catalogRow=null,
  identityRegistry=null,
  designAssetRegistry=null,
  sizeAuthorityRegistry=null,
  catalogMediaCoverageRecord=null
}={}) {
  const runtimePlant=catalogRowToRuntimePlant(catalogRow);
  const slug=runtimePlant?.canonicalSlug || text(catalogRow?.slug).toLowerCase() || null;
  const scientific=runtimePlant?.scientific || catalogRow?.scientific_name || null;

  const onboarding=evaluateFullPlantOnboarding(catalogRow,{
    canonicalSlug:slug,
    scientific,
    phenology:'vegetative'
  });

  if(!runtimePlant || !slug){
    return Object.freeze({
      version:FULL_CRUVIT_PLANT_APPROVAL_VERSION,
      canonicalSlug:slug,
      status:FULL_CRUVIT_PLANT_STATUS.BLOCKED,
      approved:false,
      blockingReasons:['CANONICAL_CATALOG_RECORD_MISSING'],
      modules:{}
    });
  }

  const identity=identityRecord(identityRegistry,slug);
  const identityReady=Boolean(
    identity
    && identity.needsReview !== true
    && text(identity.acceptedScientificName)
    && norm(identity.acceptedScientificName)===norm(scientific)
  );

  const data=classifyPlantDataReadiness(runtimePlant,{
    requireReproductiveBiologyForFruiting:true
  });
  const suitabilityReady=data.readinessShort==='A' && data.gate==='PASS';

  const reproductiveClimate=reproductiveClimateState(runtimePlant);
  const knowledge=knowledgeState(runtimePlant);
  const media=catalogMediaReady(catalogRow,catalogMediaCoverageRecord);

  const variantPlan=buildPlantVisualVariantPlan({
    catalogRow,
    fullOnboarding:onboarding
  });
  const visualGaps=buildPlantVisualVariantGapPlan({
    variantPlan,
    registry:designAssetRegistry||{}
  });
  const visualsReady=
    variantPlan.generationAllowed===true
    && visualGaps.requiredVariantCount>0
    && visualGaps.missingRequiredCount===0;

  const size=sizeState(sizeAuthorityRegistry,variantPlan);
  const identificationReady=identityReady && media.ready;
  const myGardenReady=onboarding.ready===true && knowledge.ready===true && media.ready===true;
  const doctor=doctorState({identityReady,knowledgeReady:knowledge.ready});
  const smartRecommendationsReady=suitabilityReady && reproductiveClimate.ready;
  const gardenDesignReady=onboarding.ready===true && visualsReady && size.ready;

  const modules={
    canonicalIdentity:{
      ready:identityReady,
      needsReview:identity?.needsReview===true,
      canonicalSlug:identity?.canonicalSlug||null,
      acceptedScientificName:identity?.acceptedScientificName||null
    },
    climateAndSuitability:{
      ready:suitabilityReady && reproductiveClimate.ready,
      reproductiveClimate,
      readinessClass:data.readinessShort,
      gate:data.gate,
      allowedClaims:data.allowedClaims,
      unknownOutcomes:data.unknownOutcomes,
      reasons:data.reasons,
      fieldOrigins:data.fieldOrigins
    },
    myGarden:{
      ready:myGardenReady,
      plantKnowledge:knowledge,
      catalogMedia:media
    },
    smartRecommendations:{
      ready:smartRecommendationsReady,
      authority:'plant-data-contract-v1+reproductive-climate-gate-v1',
      requiresClassA:true,
      reproductiveClimate
    },
    plantIdentification:{
      ready:identificationReady,
      canonicalIdentityReady:identityReady,
      catalogDisplayMediaReady:media.ready
    },
    plantDoctor:doctor,
    gardenDesign:{
      ready:gardenDesignReady,
      fullOnboardingReady:onboarding.ready===true,
      variantPlanReady:variantPlan.ready===true,
      requiredVariantCount:visualGaps.requiredVariantCount,
      coveredRequiredCount:visualGaps.coveredRequiredCount,
      missingRequiredCount:visualGaps.missingRequiredCount,
      seasonalityResearchRequired:visualGaps.seasonalityResearchRequired,
      unknownStates:visualGaps.unknownStates,
      sizeAuthority:size
    },
    shop:{
      ready:null,
      applicable:false,
      reason:'COMMERCE_PRODUCT_SUPPLIER_SKU_DATA_IS_SEPARATE_FROM_BOTANICAL_PLANT_APPROVAL'
    }
  };

  const blockers=[];
  if(!onboarding.ready) blockers.push('FULL_PLANT_ONBOARDING_BLOCKED');
  if(!identityReady) blockers.push('CANONICAL_IDENTITY_NOT_READY');
  if(!suitabilityReady) blockers.push('REAL_SUITABILITY_ENRICHMENT_REQUIRED');
  if(!reproductiveClimate.ready) blockers.push('REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED');
  if(!knowledge.ready) blockers.push('PLANT_KNOWLEDGE_NOT_READY');
  if(!media.ready) blockers.push('CATALOG_DISPLAY_MEDIA_NOT_READY');
  if(variantPlan.seasonalityResearchRequired) blockers.push('SEASONALITY_RESEARCH_REQUIRED');
  if(!size.ready) blockers.push('SIZE_AUTHORITY_ENRICHMENT_REQUIRED');
  if(visualGaps.missingRequiredCount>0) blockers.push('REQUIRED_VISUAL_VARIANTS_MISSING');
  if(!doctor.ready) blockers.push('PLANT_DOCTOR_CONTEXT_NOT_READY');

  const ownerReview =
    identity?.needsReview===true
    || runtimePlant.needsReview===true
    || data.gate==='HOLD'
    || size.states.includes(SIZE_AUTHORITY_STATE.CONFLICT_HOLD);

  let status=FULL_CRUVIT_PLANT_STATUS.APPROVED;
  if(blockers.length){
    if(ownerReview) status=FULL_CRUVIT_PLANT_STATUS.OWNER_REVIEW_REQUIRED;
    else if(
      blockers.some(x=>[
        'REAL_SUITABILITY_ENRICHMENT_REQUIRED',
        'REPRODUCTIVE_CLIMATE_EVIDENCE_REQUIRED',
        'PLANT_KNOWLEDGE_NOT_READY',
        'SEASONALITY_RESEARCH_REQUIRED',
        'SIZE_AUTHORITY_ENRICHMENT_REQUIRED',
        'CANONICAL_IDENTITY_NOT_READY'
      ].includes(x))
    ) status=FULL_CRUVIT_PLANT_STATUS.ENRICHMENT_REQUIRED;
    else if(blockers.includes('REQUIRED_VISUAL_VARIANTS_MISSING') || blockers.includes('CATALOG_DISPLAY_MEDIA_NOT_READY'))
      status=FULL_CRUVIT_PLANT_STATUS.VISUAL_COMPLETION_REQUIRED;
    else status=FULL_CRUVIT_PLANT_STATUS.BLOCKED;
  }

  const approved=status===FULL_CRUVIT_PLANT_STATUS.APPROVED;

  return Object.freeze({
    version:FULL_CRUVIT_PLANT_APPROVAL_VERSION,
    canonicalSlug:slug,
    scientific,
    status,
    approved,
    blockingReasons:[...new Set(blockers)],
    modules,
    onboarding,
    dataReadiness:data,
    nextAction:approved
      ? 'NONE_FULL_CRUVIT_APPROVED'
      : status===FULL_CRUVIT_PLANT_STATUS.ENRICHMENT_REQUIRED
        ? 'COMPLETE_EVIDENCE_AND_MODULE_DATA'
        : status===FULL_CRUVIT_PLANT_STATUS.VISUAL_COMPLETION_REQUIRED
          ? 'COMPLETE_VISUAL_FACTORY_AND_MEDIA'
          : status===FULL_CRUVIT_PLANT_STATUS.OWNER_REVIEW_REQUIRED
            ? 'OWNER_REVIEW_REQUIRED'
            : 'RESOLVE_BLOCKERS',
    governance:{
      oneCanonicalPlantRecord:true,
      endToEndRequired:true,
      visualFactoryAloneNeverApproves:true,
      unknownNeverSilentlyGuessed:true,
      smartRecommendationsRequiresClassA:true,
      fruitRecommendationsRequireStructuredReproductiveClimate:true,
      plantDoctorUsesRuntimeDiagnosis:true,
      shopSeparatedFromBotanicalApproval:true
    }
  });
}

export function summarizeFullCruvitPlantApproval(evaluations=[]){
  const rows=Array.isArray(evaluations)?evaluations:[];
  const byStatus={};
  for(const row of rows) byStatus[row.status]=(byStatus[row.status]||0)+1;
  return Object.freeze({
    version:FULL_CRUVIT_PLANT_APPROVAL_VERSION,
    total:rows.length,
    approved:rows.filter(x=>x.approved).length,
    blocked:rows.filter(x=>!x.approved).length,
    byStatus,
    evaluations:rows,
    paidCalls:0,
    writes:0
  });
}
