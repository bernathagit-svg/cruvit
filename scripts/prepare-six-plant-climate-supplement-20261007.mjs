import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {applyHardinessZoneToColdTraits} from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import {catalogRowToRuntimePlant} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import {classifyPlantDataReadiness} from '../modules/personal-domain/plant-data-contract-v1.js';
import {evaluateFullPlantOnboarding} from '../modules/catalog/full-plant-onboarding-gate-v1.js';
import {evaluateFullCruvitPlantApproval} from '../modules/catalog/full-cruvit-plant-approval-v1.js';

export const REPAIR_ID = 'six-plant-climate-supplement-2026-10-07-v1';
export const PROPOSAL_PATH = 'data/garden-design/plant-intake-e2e-stress-tests/six-plant-evidence-followup-2026-10-07-v1/proposal.json';
export const OUTPUT_PATH = 'data/garden-design/plant-intake-e2e-stress-tests/' + REPAIR_ID;
const ORIGINAL_COMMIT = '278ab87150fe60377c3a3e56f82dfdf0182c6f67';
const clone = x => JSON.parse(JSON.stringify(x));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const fieldClaimId = (slug, field) => REPAIR_ID + ':' + slug + ':' + field;
const sourceIdentity = row => ({canonicalSlug:row.slug, acceptedScientificName:row.scientific_name, commonNameEn:row.common_names.en});

function sourceRecord(proposal, id) {
  const s = proposal.sourceReview[id];
  assert(s, 'Source is not in approved proposal: ' + id);
  const institution = id.startsWith('ncsu-') ? 'North Carolina State University Extension Gardener' : 'University of Florida IFAS Extension';
  return {sourceId:id, url:s.url, title:s.title, institution, publisher:institution, authorityTier:'university_extension', verifiedAt:s.verifiedAt};
}

function attachClaim(row, proposal, field, sourceId, evidenceClass, status = 'asserted') {
  let source = row.provenance.find(p => p.sourceId === sourceId);
  if (!source) {
    source = {...sourceRecord(proposal, sourceId), plantIdentity:sourceIdentity(row), unknownClaims:[], assertedClaims:[], supportsFields:[]};
    row.provenance.push(source);
  }
  const key = status === 'unknown' ? 'unknownClaims' : 'assertedClaims';
  source[key] = (source[key] || []).filter(c => c.field !== field);
  source[key].push({field, status, claimId:fieldClaimId(row.slug,field), evidenceClass, reviewId:REPAIR_ID, reviewedAt:'2026-10-07'});
  if (status === 'asserted') {
    source.supportsFields = [...new Set([...(source.supportsFields || []), field])];
  }
}

export function buildCandidate(row, spec, proposal) {
  assert.equal(row.slug, spec.slug);
  const result = clone(row), ct = result.climate_traits;
  assert(ct && ct.traitEvidenceClasses && ct.traitProvenance);
  if (row.slug === 'mango') {
    assert.equal(row.scientific_name, 'Mangifera indica');
    const cold = applyHardinessZoneToColdTraits(spec.coldTolerance.sourceClaim);
    assert.equal(cold.ok, true);
    assert.equal(cold.outputs.length, 1);
    assert.equal(cold.outputs[0].targetField, 'coldTolerance');
    assert.equal(cold.outputs[0].value, spec.coldTolerance.value);
    assert.equal(cold.outputs[0].value, ct.coldTolerance);
    assert.equal(cold.transformRef, spec.coldTolerance.transformRef);
    assert.equal(cold.frostSensitivity.authorized, false);
    ct.traitEvidenceClasses.coldTolerance = cold.outputs[0].evidenceClass;
    ct.traitProvenance.coldTolerance = {
      claimId:fieldClaimId(row.slug,'coldTolerance'), status:'asserted', evidenceClass:cold.outputs[0].evidenceClass,
      sourceIds:[spec.coldTolerance.sourceId], sourceUrl:proposal.sourceReview[spec.coldTolerance.sourceId].url,
      shortExcerpt:'UF/IFAS lists the USDA hardiness band as 10B through 11.', excerptType:'PARAPHRASE',
      sourceClaim:clone(spec.coldTolerance.sourceClaim), transformRef:cold.transformRef,
      transformId:cold.transformId, transformVersion:cold.transformVersion, evidenceLineage:cold.outputs[0].evidenceLineage,
      interpretation:spec.coldTolerance.note, reviewId:REPAIR_ID, verifiedAt:'2026-10-07'
    };
    ct.heatTolerance = spec.heatTolerance.value;
    ct.traitEvidenceClasses.heatTolerance = spec.heatTolerance.evidenceClass;
    ct.traitProvenance.heatTolerance = {
      claimId:fieldClaimId(row.slug,'heatTolerance'), status:'asserted', evidenceClass:spec.heatTolerance.evidenceClass,
      sourceIds:[spec.heatTolerance.sourceId], sourceUrl:proposal.sourceReview[spec.heatTolerance.sourceId].url,
      shortExcerpt:'Table 10 reports mango heat damage above 104 degrees Fahrenheit and an optimum growing range of 75 to 86 degrees Fahrenheit.',
      excerptType:'PARAPHRASE', sourceLocator:'Table 10, Mango', sourceHeatDamageC:clone(spec.heatTolerance.sourceHeatDamageC),
      rawHeatDamageF:proposal.sourceReview[spec.heatTolerance.sourceId].rawHeatDamageF,
      rawOptimumF:proposal.sourceReview[spec.heatTolerance.sourceId].rawOptimumF,
      interpretation:spec.heatTolerance.interpretation, isEstimate:true, ownerApprovalRef:REPAIR_ID,
      reviewId:REPAIR_ID, verifiedAt:'2026-10-07'
    };
    assert(!ct.reproductiveBiology, 'Unexpected reproductive biology added after proposal');
    ct.reproductiveBiology = {
      flowerSexExpression:spec.reproductiveBiology.flowerSexExpression,
      pollinationAgents:clone(spec.reproductiveBiology.pollinationAgents)
    };
    for (const [field, excerpt] of [
      ['flowerSexExpression','Mango inflorescences contain male and bisexual flowers.'],
      ['pollinationAgents','Several kinds of insects pollinate mango flowers.']
    ]) {
      const key = 'reproductive.' + field;
      ct.traitEvidenceClasses[key] = spec.reproductiveBiology.evidenceClass;
      ct.traitProvenance[key] = {
        claimId:fieldClaimId(row.slug,key), status:'asserted', evidenceClass:spec.reproductiveBiology.evidenceClass,
        sourceIds:[spec.reproductiveBiology.sourceId], sourceUrl:proposal.sourceReview[spec.reproductiveBiology.sourceId].url,
        shortExcerpt:excerpt, excerptType:'PARAPHRASE', selfFertilityNotInferred:true, reviewId:REPAIR_ID, verifiedAt:'2026-10-07'
      };
    }
    // The historical packet remains immutable. Reconcile only current claims superseded by this repair.
    for (const source of result.provenance) {
      source.unknownClaims = (source.unknownClaims || []).filter(c => c.field !== 'heatTolerance');
      source.assertedClaims = (source.assertedClaims || []).filter(c => c.field !== 'coldTolerance');
      source.supportsFields = (source.supportsFields || []).filter(f => f !== 'coldTolerance');
    }
    attachClaim(result,proposal,'coldTolerance',spec.coldTolerance.sourceId,cold.outputs[0].evidenceClass);
    attachClaim(result,proposal,'heatTolerance',spec.heatTolerance.sourceId,spec.heatTolerance.evidenceClass);
    for (const field of ['flowerSexExpression','pollinationAgents']) {
      attachClaim(result,proposal,'reproductive.'+field,spec.reproductiveBiology.sourceId,spec.reproductiveBiology.evidenceClass);
    }
    assert(Array.isArray(ct.plantKnowledge.sources));
    if (!ct.plantKnowledge.sources.some(s => s.sourceId === spec.heatTolerance.sourceId)) {
      ct.plantKnowledge.sources.push(sourceRecord(proposal,spec.heatTolerance.sourceId));
    }
  } else {
    const names = {'date-palm':'Phoenix dactylifera', monstera:'Monstera deliciosa'};
    assert.equal(row.scientific_name, names[row.slug]);
    assert.equal(spec.field, 'needsWinterChill');
    assert.equal(spec.value, null);
    assert.equal(spec.evidenceClass, 'UNKNOWN');
    assert(!Object.hasOwn(ct,'needsWinterChill'));
    ct.needsWinterChill = null;
    ct.traitEvidenceClasses.needsWinterChill = spec.evidenceClass;
    ct.traitProvenance.needsWinterChill = {
      claimId:fieldClaimId(row.slug,'needsWinterChill'), value:null, status:spec.status, evidenceClass:spec.evidenceClass,
      reviewState:spec.reviewState, sourceIds:clone(spec.sourceIds), booleanNotInferred:spec.booleanNotInferred,
      sourceReviews:spec.sourceIds.map(sourceId => ({sourceId, url:proposal.sourceReview[sourceId].url,
        note:proposal.sourceReview[sourceId].winterChillReview, verifiedAt:'2026-10-07'})),
      interpretation:'The reviewed sources did not establish a universal winter-chill boolean. UNKNOWN is retained; absence of a statement is not evidence of false.',
      reviewId:REPAIR_ID, verifiedAt:'2026-10-07'
    };
    for (const sourceId of spec.sourceIds) attachClaim(result,proposal,'needsWinterChill',sourceId,'UNKNOWN','unknown');
  }
  return result;
}

export function changedPaths(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return [prefix];
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(k => changedPaths(before[k],after[k],prefix ? prefix+'.'+k : k));
}

export function evaluateRow(row, root) {
  const json = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
  const data = classifyPlantDataReadiness(catalogRowToRuntimePlant(row), {requireReproductiveBiologyForFruiting:true});
  const onboarding = evaluateFullPlantOnboarding(row, {canonicalSlug:row.slug, scientific:row.scientific_name});
  const coverage = json('data/catalog-media/active-canonical-image-coverage-v1.json');
  const approval = evaluateFullCruvitPlantApproval({catalogRow:row,
    identityRegistry:json('data/plant-identity.registry.json'),
    designAssetRegistry:json('modules/garden-design/assets/plants/design-asset-registry-v1.json'),
    sizeAuthorityRegistry:json('data/catalog/botanical-size-authority-v1.json'),
    catalogMediaCoverageRecord:coverage.records.find(r => r.slug===row.slug)});
  const design = approval.modules.gardenDesign;
  return {slug:row.slug,scientificName:row.scientific_name,readinessClass:data.readinessShort,dataGate:data.gate,
    readinessReasons:data.reasons,onboardingReady:onboarding.ready,onboarding,
    fullApprovalFlag:approval.approved,fullApprovalBlockers:approval.blockers,
    unknownVisualStates:design.unknownStates,missingRequiredCount:design.missingRequiredCount,
    allStatesComplete:approval.approved && Array.isArray(design.unknownStates) && design.unknownStates.length===0,
    evidenceScope:'Actual catalog row, current checked-out pure contracts; not a location suitability assessment or deployed size metadata.'};
}

export function buildSql(snapshot, patches) {
  const payload = JSON.stringify(patches.map(p => ({slug:p.slug,expectedRowMd5:p.expectedRowMd5,after:p.after})));
  assert(!payload.includes('$cruvit_payload$'));
  assert.equal(patches.length,3);
  assert.deepEqual([...patches.map(p=>p.slug)].sort(),['date-palm','mango','monstera']);
  const md5 = snapshot.other_rows_md5;
  assert(/^[a-f0-9]{32}$/.test(md5));
  return `-- Authorized exact three-row climate correction; no DDL, visual writes, generation or deployment.
-- Original reviewed proposal: ${ORIGINAL_COMMIT}/${PROPOSAL_PATH}
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $cruvit_repair$
DECLARE
  patches jsonb := $cruvit_payload$${payload}$cruvit_payload$::jsonb;
  p jsonb;
  actual jsonb;
  actual_md5 text;
  other_md5 text;
  other_count bigint;
  affected integer;
BEGIN
  PERFORM 1 FROM public.catalog_plants c WHERE c.slug IN ('mango','date-palm','monstera') ORDER BY c.slug FOR UPDATE;
  SELECT count(*),md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.slug)) INTO other_count,other_md5
    FROM public.catalog_plants c WHERE c.slug NOT IN ('mango','date-palm','monstera');
  IF other_count <> ${snapshot.other_rows_count} OR other_md5 IS DISTINCT FROM '${md5}' THEN
    RAISE EXCEPTION 'Unrelated catalog snapshot changed; no writes allowed';
  END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(patches) LOOP
    SELECT to_jsonb(c),md5(to_jsonb(c)::text) INTO actual,actual_md5 FROM public.catalog_plants c WHERE c.slug=p->>'slug';
    IF NOT FOUND OR actual_md5 IS DISTINCT FROM p->>'expectedRowMd5' THEN
      RAISE EXCEPTION 'Approved row precondition failed for %; no partial writes',p->>'slug';
    END IF;
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(patches) LOOP
    UPDATE public.catalog_plants c SET climate_traits=p#>'{after,climate_traits}',provenance=p#>'{after,provenance}',updated_at=statement_timestamp()
      WHERE c.slug=p->>'slug' AND md5(to_jsonb(c)::text)=p->>'expectedRowMd5';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Unexpected affected row count for %',p->>'slug'; END IF;
    SELECT to_jsonb(c) INTO actual FROM public.catalog_plants c WHERE c.slug=p->>'slug';
    IF (actual-'updated_at') IS DISTINCT FROM ((p->'after')-'updated_at') THEN
      RAISE EXCEPTION 'Exact readback or unrelated-field preservation failed for %',p->>'slug';
    END IF;
  END LOOP;
  SELECT count(*),md5(string_agg(to_jsonb(c)::text,'' ORDER BY c.slug)) INTO other_count,other_md5
    FROM public.catalog_plants c WHERE c.slug NOT IN ('mango','date-palm','monstera');
  IF other_count <> ${snapshot.other_rows_count} OR other_md5 IS DISTINCT FROM '${md5}' THEN
    RAISE EXCEPTION 'Unrelated catalog preservation failed; rolling back all three changes';
  END IF;
END
$cruvit_repair$;
COMMIT;
SELECT slug,scientific_name,md5(to_jsonb(c)::text) AS row_md5,updated_at FROM public.catalog_plants c WHERE slug IN ('mango','date-palm','monstera') ORDER BY slug;
`;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const snapshotPath = process.argv[2];
  assert(snapshotPath, 'Supply the freshly captured read-only catalog snapshot');
  const original = fs.readFileSync(path.join(root,PROPOSAL_PATH),'utf8');
  const proposal = JSON.parse(original);
  assert.equal(proposal.id,'six-plant-evidence-followup-2026-10-07-v1');
  assert.equal(proposal.status,'DRAFT_NOT_APPLIED');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath,'utf8'));
  const output = path.join(root,OUTPUT_PATH);
  fs.mkdirSync(output,{recursive:true});
  const save = (name,value) => fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
  const approval = {id:REPAIR_ID,approvedAt:'2026-10-07T19:34:24Z',
    approvalText:'מאשרת את תיקון נתוני האקלים המשלים ל־Mango, Date Palm ו־Monstera לפי הטיוטה, תוך שמירת UNKNOWN והערכות מסומנות במפורש, ללא paid AI, ללא יצירת תמונות, ללא פריסת Production וללא שינוי Registry ויזואלי.',
    proposalCommit:ORIGINAL_COMMIT,proposalPath:PROPOSAL_PATH,proposalSha256:sha(original),proposalGitBlob:'11c4ebd5a62004fa6f2311205fd08cd3ff0903de',
    executionAuthorized:true,catalogWritesAllowed:true,catalogAllowedSlugs:['mango','date-palm','monstera'],
    paidAiAllowed:false,imageGenerationAllowed:false,productionDeployAllowed:false,productionR2WritesAllowed:false,visualRegistryWritesAllowed:false,
    scope:'Exact catalog patches and directly necessary source-provenance consistency. No runtime code, media, size or visual Registry change.'};
  const patches = proposal.catalogPatches.map(spec => {
    const before = snapshot.target_rows.find(r=>r.slug===spec.slug);
    assert(before,'Missing target row');
    assert.equal(before.row_md5,spec.expectedRowMd5,'Fresh row does not match approved proposal');
    const after = buildCandidate(before.row,spec,proposal);
    return {slug:spec.slug,expectedRowMd5:spec.expectedRowMd5,after,changedPaths:changedPaths(before.row,after)};
  });
  const protectedPaths=['data/plant-identity.registry.json','data/plants.seed.json','data/catalog/botanical-size-authority-v1.json','modules/garden-design/assets/plants/design-asset-registry-v1.json'];
  const protectedHashes=Object.fromEntries(protectedPaths.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]));
  const beforeResults=[...snapshot.target_rows,...snapshot.control_rows].map(r=>evaluateRow(r.row,root));
  const afterResults=[...patches.map(p=>p.after),...snapshot.control_rows.map(p=>p.row)].map(row=>evaluateRow(row,root));
  save('approval-and-scope.json',approval);
  save('catalog-before.json',snapshot);
  save('catalog-patches.json',patches);
  save('preflight.json',{id:REPAIR_ID,mode:'OFFLINE_PREPARATION_ONLY',catalogWritesExecuted:0,before:beforeResults,after:afterResults,
    protectedHashes,otherRowsCount:snapshot.other_rows_count,otherRowsMd5:snapshot.other_rows_md5,
    provenanceCorrections:['Cold excerpt now matches ST404 rather than retaining MG216 text.','Superseded active heat UNKNOWN removed only from Mango source claims; original packet stays immutable.','HS1499 added to both provenance and plantKnowledge.sources.','New biological and chill evidence has source-linked claim coverage.'],
    limits:['Readiness Class A is not successful climate suitability at a location.','Unresolved flowering stays UNKNOWN; minimum visual coverage is not all-states completion.']});
  fs.writeFileSync(path.join(output,'apply-approved-patches.sql'),buildSql(snapshot,patches));
  console.log(JSON.stringify({id:REPAIR_ID,patches:patches.map(p=>({slug:p.slug,changedPaths:p.changedPaths})),before:beforeResults.map(r=>({slug:r.slug,class:r.readinessClass,onboarding:r.onboardingReady})),after:afterResults.map(r=>({slug:r.slug,class:r.readinessClass,onboarding:r.onboardingReady,unknownVisualStates:r.unknownVisualStates,allStatesComplete:r.allStatesComplete})),otherRows:snapshot.other_rows_count,sqlPrepared:true,catalogWritesExecuted:0},null,2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
