/**
 * CRUVIT Reproductive Climate Transform V1
 *
 * General evidence transforms only. Never plant- or place-specific.
 * Converts source-backed categorical production-season evidence into the
 * structured Reproductive Climate contract at HEURISTIC_ASSERTION strength.
 */

export const REPRODUCTIVE_CLIMATE_TRANSFORM_VERSION='reproductive-climate-transform-v1';

function norm(v){return String(v??'').trim().toLowerCase().replace(/-/g,' ');}

export function warmSeasonFruitingTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  if(!/\bwarm[ -]?season\b/.test(text)) return {eligible:false,reason:'WARM_SEASON_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.summerHeatBand',
    value:'warm',
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'warm-season-fruiting-crop-to-summer-heat-band-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

const api={
  REPRODUCTIVE_CLIMATE_TRANSFORM_VERSION,
  warmSeasonFruitingTransform
};
export default api;
if(typeof globalThis!=='undefined') globalThis.CruvitReproductiveClimateTransform=api;
