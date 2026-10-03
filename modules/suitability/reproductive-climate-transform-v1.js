/**
 * CRUVIT Reproductive Climate Transform V1
 *
 * General evidence transforms only. Never plant- or place-specific.
 * Converts source-backed categorical production-season evidence into the
 * structured Reproductive Climate contract at HEURISTIC_ASSERTION strength.
 */

export const REPRODUCTIVE_CLIMATE_TRANSFORM_VERSION='reproductive-climate-transform-v1';

function norm(v){return String(v??'').trim().toLowerCase().replace(/-/g,' ');}

export function explicitCoolSeasonFruitingTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  const explicitCoolSeason=/\bcool[ -]?season\b/.test(text);
  const negatedChill=(
    /\b(?:no|not|without)\b.{0,50}\b(?:winter[ -]?)?chill(?:ing)?\b/.test(text)
    || /\b(?:does not|doesn't|do not|don't) require\b.{0,30}\bchill(?:ing)?\b/.test(text)
  );
  const explicit=(
    explicitCoolSeason
    || (!negatedChill && /\b(?:fall|winter)\b/.test(text) && /\blow non[ -]?freezing temperatures?\b/.test(text))
    || (!negatedChill && /\bwinter\b/.test(text) && /\bchill(?:ing)?\b/.test(text))
  );
  if(!explicit) return {eligible:false,reason:'COOL_SEASON_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.requiresCoolSeason',
    value:true,
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'explicit-cool-season-production-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

export function explicitFrostFreeFruitingTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  if(!/\bfrost[ -]?free\b/.test(text)) return {eligible:false,reason:'FROST_FREE_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.requiresFrostFree',
    value:true,
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'explicit-frost-free-fruiting-requirement-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

export function qualitativeSummerHeatFruitingTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  let band=null;
  if(
    /\b(?:high summer temperatures?|hot summers?|hot[, ]+(?:dry|humid))\b/.test(text)
    || /\b(?:best|better|improved)\b.*\b(?:fruit|fruiting|quality|ripen|ripening|sweetness)\b.*\b(?:heat|hot)\b/.test(text)
    || /\b(?:heat|hot)\b.*\b(?:best|better|improved)\b.*\b(?:fruit|fruiting|quality|ripen|ripening|sweetness)\b/.test(text)
  ) band='hot';
  else if(
    /\b(?:long warm season|warm(?:[, ]+dry)? summers?|warm season)\b/.test(text)
    || /\bwarm conditions?\b.*\b(?:fruit|ripen|ripening)\b/.test(text)
    || /\b(?:fruit|ripen|ripening)\b.*\bwarm conditions?\b/.test(text)
    || /\b(?:fruit|fruits|fruiting|berries|production|produced|flushes)\b.*\bwarm climates?\b/.test(text)
    || /\bwarm climates?\b.*\b(?:fruit|fruits|fruiting|berries|production|produced|flushes)\b/.test(text)
    || /\bstrictly tropical(?: climates?)?\b/.test(text)
  ) band='warm';
  if(!band) return {eligible:false,reason:'SUMMER_HEAT_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.summerHeatBand',
    value:band,
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'qualitative-summer-heat-band-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

export function explicitDrySeasonFruitingTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  const explicit=(
    /\bhot[ ,/-]+dry\b/.test(text)
    || /\bdry[ ,/-]+(?:summer|weather|season|ripen(?:ing)?|conditions?)\b/.test(text)
    || /\b(?:summer|weather|season|ripen(?:ing)?|conditions?)\b.{0,24}\bdry\b/.test(text)
    || /\barid weather\b/.test(text)
  );
  if(!explicit) return {eligible:false,reason:'DRY_SEASON_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.requiresDrySeason',
    value:true,
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'explicit-dry-season-fruiting-requirement-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

export function explicitHumidClimateFruitingConstraintTransform({
  sourceText='',
  fruitProductionRelevant=false,
  sourceIds=[]
}={}){
  const text=norm(sourceText);
  const ids=Array.isArray(sourceIds)?sourceIds.map(x=>String(x||'').trim()).filter(Boolean):[];
  if(!fruitProductionRelevant || !ids.length) return {eligible:false,reason:'PRECONDITION_NOT_MET'};
  const explicit=(
    /\bhumid climates?\b.{0,48}\b(?:limit|reduce|restrict|poor|problem|disease)\b/.test(text)
    || /\b(?:limit|reduce|restrict)\b.{0,48}\b(?:fruit|fruiting|production|cultivars?)\b.{0,48}\bhumid\b/.test(text)
    || /\bhumid\b.{0,48}\b(?:fruit|fruiting|production|cultivars?)\b.{0,48}\b(?:limit|reduce|restrict)\b/.test(text)
  );
  if(!explicit) return {eligible:false,reason:'HUMID_FRUITING_CONSTRAINT_NOT_EXPLICIT'};
  return {
    eligible:true,
    field:'reproductiveClimate.fruiting.humidClimateLimitsFruiting',
    value:true,
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:ids,
    transformRef:'explicit-humid-fruiting-constraint-v1@1.0.0',
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}

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
  explicitCoolSeasonFruitingTransform,
  explicitFrostFreeFruitingTransform,
  explicitDrySeasonFruitingTransform,
  explicitHumidClimateFruitingConstraintTransform,
  qualitativeSummerHeatFruitingTransform,
  warmSeasonFruitingTransform
};
export default api;
if(typeof globalThis!=='undefined') globalThis.CruvitReproductiveClimateTransform=api;
