/**
 * Evidence-informed relative preview scaling V1.
 *
 * Purpose: improve visual proportions in QA / preview rendering using already
 * approved botanical spread evidence. This is NOT a meter-to-pixel mapping and
 * never mutates canonical size authority.
 *
 * The influence is deliberately damped (sqrt ratio) and bounded so botanical
 * evidence can correct morphology fallbacks without pretending the garden photo
 * has full metric calibration.
 */
export const RELATIVE_PREVIEW_SCALE_VERSION='relative-preview-scale-v1';

export const PREVIEW_REFERENCE_SPREAD_M=Object.freeze({
  shrub:1.5,
  subshrub:0.8,
  'herbaceous-upright':0.6,
  'herbaceous-clump':1.2,
  rosette:0.5,
  flower:0.5,
  herb:0.5,
  groundcover:0.8,
  'succulent-form':0.5
});

function text(v){return String(v==null?'':v).trim().toLowerCase();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function resolveEffectivePreviewForm(input={}){
  const architecture=text(input.architectureMode);
  if(architecture && architecture!=='default' && PREVIEW_REFERENCE_SPREAD_M[architecture]){
    return architecture;
  }
  const visual=text(input.visualForm);
  if(PREVIEW_REFERENCE_SPREAD_M[visual]) return visual;
  if(visual==='succulent-form') return 'succulent-form';
  return visual || 'unknown';
}

export function deriveRelativePreviewScale(sizeRegistry={},input={}){
  const slug=text(input.canonicalSlug);
  const stage=text(input.growthStage||'mature')||'mature';
  const form=resolveEffectivePreviewForm(input);
  const referenceSpreadM=finite(PREVIEW_REFERENCE_SPREAD_M[form]);

  if(!slug||!referenceSpreadM){
    return Object.freeze({
      version:RELATIVE_PREVIEW_SCALE_VERSION,
      ready:false,
      scaleFactor:1,
      effectiveForm:form,
      reasonCodes:['NON_TREE_REFERENCE_NOT_APPLICABLE']
    });
  }

  const taxonId=sizeRegistry?.slugToBotanicalTaxonId?.[slug]||null;
  if(!taxonId){
    return Object.freeze({
      version:RELATIVE_PREVIEW_SCALE_VERSION,
      ready:false,
      scaleFactor:1,
      effectiveForm:form,
      reasonCodes:['SIZE_AUTHORITY_TAXON_NOT_FOUND']
    });
  }

  const records=(sizeRegistry?.records||[]).filter(r=>
    r?.botanicalTaxonId===taxonId
    && text(r?.growthStage)===stage
  );

  const architecture=text(input.architectureMode);
  const record=
    records.find(r=>text(r?.architectureMode)===architecture)
    || records.find(r=>text(r?.architectureMode)==='default')
    || records[0]
    || null;

  if(!record){
    return Object.freeze({
      version:RELATIVE_PREVIEW_SCALE_VERSION,
      ready:false,
      scaleFactor:1,
      effectiveForm:form,
      taxonId,
      reasonCodes:['EXACT_GROWTH_STAGE_SIZE_EVIDENCE_NOT_FOUND']
    });
  }

  if(record.runtimeAuthority!=='RUNTIME_AUTHORITY_READY' || record.spreadSourceSupported!==true){
    return Object.freeze({
      version:RELATIVE_PREVIEW_SCALE_VERSION,
      ready:false,
      scaleFactor:1,
      effectiveForm:form,
      taxonId,
      runtimeAuthority:record.runtimeAuthority||null,
      reasonCodes:['SOURCE_SUPPORTED_SPREAD_NOT_READY']
    });
  }

  const min=finite(record?.normalizedRange?.spreadM?.min);
  const max=finite(record?.normalizedRange?.spreadM?.max);
  if(!(min>0)||!(max>0)||max<min){
    return Object.freeze({
      version:RELATIVE_PREVIEW_SCALE_VERSION,
      ready:false,
      scaleFactor:1,
      effectiveForm:form,
      taxonId,
      reasonCodes:['SPREAD_RANGE_INVALID']
    });
  }

  const midpointSpreadM=(min+max)/2;
  const rawRatio=midpointSpreadM/referenceSpreadM;
  const damped=Math.sqrt(rawRatio);
  const scaleFactor=clamp(damped,0.6,1.35);

  return Object.freeze({
    version:RELATIVE_PREVIEW_SCALE_VERSION,
    ready:true,
    scaleFactor,
    effectiveForm:form,
    canonicalSlug:slug,
    taxonId,
    growthStage:stage,
    midpointSpreadM,
    referenceSpreadM,
    rawRatio,
    dampedRatio:damped,
    clampRange:[0.6,1.35],
    meterAccuracyClaimed:false,
    source:'BOTANICAL_SPREAD_EVIDENCE_DAMPED_FOR_PREVIEW',
    evidenceRef:record.selectedSpreadEvidenceRef||record.selectedSource||null,
    reasonCodes:['SOURCE_SUPPORTED_SPREAD_RELATIVE_PREVIEW_ADJUSTMENT']
  });
}

export const RELATIVE_PREVIEW_SCALE_GOVERNANCE=Object.freeze({
  canonicalSizeAuthorityImmutable:true,
  meterAccuracyClaimed:false,
  exactGrowthStageRequired:true,
  sourceSupportedSpreadRequired:true,
  treeScalingUnchangedByThisVersion:true,
  perSpeciesHardcodingForbidden:true,
  dampedInfluence:true,
  boundedScaleFactor:true,
  note:'This adapter corrects preview proportions only. Scene geometry and trusted placement calibration remain separate authorities.'
});
