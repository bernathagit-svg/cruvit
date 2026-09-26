#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const QUEUE=path.join(ROOT,'data/catalog/revalidation/reproductive-climate-revalidation-queue-2026-09-26-v1.json');
const OUT=process.argv[2]||path.join(ROOT,'artifacts/reproductive-climate-proposals-v1.json');

function norm(v){return String(v??'').trim();}
function lower(v){return norm(v).toLowerCase();}
function usableClaim(c){
  const cls=String(c?.evidenceClass||'').toUpperCase();
  return c?.status==='asserted'
    && Array.isArray(c?.sourceIds) && c.sourceIds.length>0
    && ['SOURCE_SUPPORTED','HEURISTIC_ASSERTION'].includes(cls);
}
function firstClaim(packet,field){
  return (packet?.claims||[]).find(c=>String(c?.field||'')===field)||null;
}
function derivedClaim({field,value,sourceClaim,transformRef}){
  return {
    field,
    value,
    status:'asserted',
    evidenceClass:'HEURISTIC_ASSERTION',
    sourceIds:[...(sourceClaim?.sourceIds||[])],
    shortExcerpt:sourceClaim?.shortExcerpt||null,
    transformRef,
    evidenceLineage:'DERIVED_FROM_SOURCE_EVIDENCE_VIA_EXPLICIT_HEURISTIC_TRANSFORM'
  };
}
function summerBandFromText(text){
  const t=lower(text);
  if(/very[ -]hot|extreme heat/.test(t)) return 'very_hot';
  if(/hot summers?|hot[, ]+(?:dry|humid)|best (?:fruit|quality).*(?:hot|heat)|(?:hot|heat).*(?:fruit|quality)/.test(t)) return 'hot';
  if(/long warm season|warm summers?|warm climates?|tropical warmth|warm humid|strictly tropical|humid tropical|frost-free .*tropic/.test(t)) return 'warm';
  return null;
}
function exactFrostFreeFruitRequirement(text){
  const t=lower(text);
  return /frost[- ]free/.test(t);
}
function propose(packet,row){
  const chill=firstClaim(packet,'needsWinterChill');
  const fruit=firstClaim(packet,'fruitingRequirements');
  const flower=firstClaim(packet,'floweringRequirements');
  const claims=[];
  const reasons=[];

  if(usableClaim(chill) && chill.value===true){
    claims.push(derivedClaim({
      field:'reproductiveClimate.flowering.requiresCoolSeason',
      value:true,
      sourceClaim:chill,
      transformRef:'winter-chill-to-cool-season-v1@1.0.0'
    }));
    claims.push(derivedClaim({
      field:'reproductiveClimate.fruiting.requiresCoolSeason',
      value:true,
      sourceClaim:chill,
      transformRef:'winter-chill-to-cool-season-v1@1.0.0'
    }));
    reasons.push('WINTER_CHILL_DIRECT_TRANSFORM');
  }

  if(usableClaim(fruit)){
    const ftext=fruit.shortExcerpt||fruit.value||'';
    if(exactFrostFreeFruitRequirement(ftext)){
      claims.push(derivedClaim({
        field:'reproductiveClimate.fruiting.requiresFrostFree',
        value:true,
        sourceClaim:fruit,
        transformRef:'explicit-frost-free-fruiting-requirement-v1@1.0.0'
      }));
      reasons.push('EXPLICIT_FROST_FREE_FRUITING');
    }
    const band=summerBandFromText(ftext);
    if(band){
      claims.push(derivedClaim({
        field:'reproductiveClimate.fruiting.summerHeatBand',
        value:band,
        sourceClaim:fruit,
        transformRef:'qualitative-summer-heat-band-v1@1.0.0'
      }));
      reasons.push('QUALITATIVE_SUMMER_HEAT_TRANSFORM');
    }
  }

  if(usableClaim(flower)){
    const text=flower.shortExcerpt||flower.value||'';
    const band=summerBandFromText(text);
    if(band){
      claims.push(derivedClaim({
        field:'reproductiveClimate.flowering.summerHeatBand',
        value:band,
        sourceClaim:flower,
        transformRef:'qualitative-summer-heat-band-v1@1.0.0'
      }));
      reasons.push('QUALITATIVE_FLOWERING_HEAT_TRANSFORM');
    }
  }

  const dedup=new Map();
  for(const c of claims) if(!dedup.has(c.field)) dedup.set(c.field,c);
  const proposedClaims=[...dedup.values()];
  return {
    canonicalSlug:row.canonicalSlug,
    packetPath:row.packetPath,
    route:proposedClaims.some(c=>c.field.startsWith('reproductiveClimate.fruiting.'))
      ?'AUTO_TRANSFORM_PROPOSAL'
      :'RESEARCH_REQUIRED',
    proposedClaims,
    reasons:[...new Set(reasons)],
    researchReason:proposedClaims.some(c=>c.field.startsWith('reproductiveClimate.fruiting.'))
      ?null
      :'NO_UNAMBIGUOUS_SOURCE_BACKED_FRUITING_CLIMATE_TRANSFORM'
  };
}

const queue=JSON.parse(fs.readFileSync(QUEUE,'utf8'));
const rows=[];
for(const row of queue.rows||[]){
  const abs=path.join(ROOT,row.packetPath||'');
  if(!row.packetPath||!fs.existsSync(abs)){
    rows.push({...row,route:'RESEARCH_REQUIRED',proposedClaims:[],researchReason:'SOURCE_PACKET_MISSING'});
    continue;
  }
  const packet=JSON.parse(fs.readFileSync(abs,'utf8'));
  rows.push(propose(packet,row));
}
const out={
  contract:'cruvit-reproductive-climate-transform-proposals-v1',
  runId:'cruvit-reproductive-climate-proposals-2026-09-26-v1',
  createdAt:'2026-09-26',
  policy:{
    writesExecuted:0,
    paidCallsExecuted:0,
    evidenceInflationForbidden:true,
    derivedEvidenceClass:'HEURISTIC_ASSERTION',
    sourceIdsRequired:true,
    proposalFirst:true
  },
  total:rows.length,
  autoTransformProposalCount:rows.filter(r=>r.route==='AUTO_TRANSFORM_PROPOSAL').length,
  researchRequiredCount:rows.filter(r=>r.route==='RESEARCH_REQUIRED').length,
  proposedClaimCount:rows.reduce((s,r)=>s+r.proposedClaims.length,0),
  rows
};
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({
  total:out.total,
  autoTransformProposalCount:out.autoTransformProposalCount,
  researchRequiredCount:out.researchRequiredCount,
  proposedClaimCount:out.proposedClaimCount,
  researchRequired:rows.filter(r=>r.route==='RESEARCH_REQUIRED').map(r=>r.canonicalSlug)
},null,2));
