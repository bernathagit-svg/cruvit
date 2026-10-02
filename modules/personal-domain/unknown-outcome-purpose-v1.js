/**
 * Purpose-aware UNKNOWN outcome policy.
 * UNKNOWN is acceptable only when the missing reproductive outcome is not part
 * of the plant's currently modeled recommendation purpose.
 */
export const UNKNOWN_OUTCOME_PURPOSE_POLICY_VERSION='unknown-outcome-purpose-v1';

const norm=v=>String(v??'').trim().toLowerCase();

export function auditUnknownOutcomePurpose({tags=[],groupIds=[],unknownOutcomes=[]}={}){
  const tokens=[...(Array.isArray(tags)?tags:[]),...(Array.isArray(groupIds)?groupIds:[])].map(norm).filter(Boolean);
  const unknown=new Set((Array.isArray(unknownOutcomes)?unknownOutcomes:[]).map(norm));
  const fruitPurpose=tokens.some(x=>/(^|[-_\s])(fruit|citrus|berry|nut|orchard)([-_\s]|$)/.test(x));
  const floweringPurpose=tokens.some(x=>/(flower|bloom|ornamental-flowering)/.test(x));
  const blockers=[];
  if(unknown.has('fruiting')&&fruitPurpose) blockers.push('FRUITING_UNKNOWN_CONFLICTS_WITH_FRUIT_PURPOSE');
  if(unknown.has('flowering')&&floweringPurpose) blockers.push('FLOWERING_UNKNOWN_CONFLICTS_WITH_FLOWERING_PURPOSE');
  return {
    policyVersion:UNKNOWN_OUTCOME_PURPOSE_POLICY_VERSION,
    fruitPurpose,
    floweringPurpose,
    blockers,
    appropriate:blockers.length===0,
    tags:Array.isArray(tags)?[...tags]:[],
    groupIds:Array.isArray(groupIds)?[...groupIds]:[]
  };
}

export default {UNKNOWN_OUTCOME_PURPOSE_POLICY_VERSION,auditUnknownOutcomePurpose};
