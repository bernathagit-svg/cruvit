import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {catalogRowToRuntimePlant} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import {classifyPlantDataReadiness} from '../modules/personal-domain/plant-data-contract-v1.js';
import {applyHardinessZoneToColdTraits} from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import {evaluateFullPlantOnboarding} from '../modules/catalog/full-plant-onboarding-gate-v1.js';
import {evaluateFullCruvitPlantApproval} from '../modules/catalog/full-cruvit-plant-approval-v1.js';
import {resolvePlantSizeAuthorityReadiness} from '../modules/garden-design/asset-factory-v1/plant-size-authority-readiness-v1.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const base=read('data/garden-design/plant-intake-e2e-stress-tests/six-plant-data-repair-2026-10-07-v1/mango-catalog-row.json');
const proposal=read('data/garden-design/plant-intake-e2e-stress-tests/six-plant-evidence-followup-2026-10-07-v1/proposal.json');
const spec=proposal.catalogPatches.find(p=>p.slug==='mango');
const size=read('data/catalog/botanical-size-authority-v1.json');
const clone=x=>JSON.parse(JSON.stringify(x));
function candidate(){
 const row=clone(base),ct=row.climate_traits;
 const cold=applyHardinessZoneToColdTraits(spec.coldTolerance.sourceClaim);
 assert.equal(cold.ok,true);
 ct.coldTolerance=cold.outputs[0].value;ct.heatTolerance=spec.heatTolerance.value;
 ct.traitEvidenceClasses.coldTolerance=cold.outputs[0].evidenceClass;
 ct.traitEvidenceClasses.heatTolerance=spec.heatTolerance.evidenceClass;
 ct.traitProvenance.coldTolerance={...ct.traitProvenance.coldTolerance,status:'asserted',evidenceClass:cold.outputs[0].evidenceClass,sourceIds:[spec.coldTolerance.sourceId],sourceClaim:spec.coldTolerance.sourceClaim,transformRef:cold.transformRef,evidenceLineage:cold.outputs[0].evidenceLineage};
 ct.traitProvenance.heatTolerance={status:'asserted',evidenceClass:spec.heatTolerance.evidenceClass,sourceIds:[spec.heatTolerance.sourceId],sourceHeatDamageC:spec.heatTolerance.sourceHeatDamageC,interpretation:spec.heatTolerance.interpretation};
 ct.reproductiveBiology={flowerSexExpression:spec.reproductiveBiology.flowerSexExpression,pollinationAgents:spec.reproductiveBiology.pollinationAgents};
 for(const field of ['flowerSexExpression','pollinationAgents']){ct.traitEvidenceClasses['reproductive.'+field]='SOURCE_SUPPORTED';ct.traitProvenance['reproductive.'+field]={status:'asserted',evidenceClass:'SOURCE_SUPPORTED',sourceIds:[spec.reproductiveBiology.sourceId]};}
 const source=proposal.sourceReview[spec.heatTolerance.sourceId];
 row.provenance.push({sourceId:spec.heatTolerance.sourceId,...source,institution:'University of Florida IFAS Extension',authorityTier:'university_extension',supportsFields:['heatTolerance']});
 return row;
}
const classify=row=>classifyPlantDataReadiness(catalogRowToRuntimePlant(row),{requireReproductiveBiologyForFruiting:true});

test('reproduces Mango current Class C from its exact persisted recovery artifact',()=>{assert.equal(classify(base).readinessShort,'C');assert.equal(classify(base).corePresence.heatTolerance,false);});
test('existing approved zone transform produces cold evidence without manufacturing frost evidence',()=>{const t=applyHardinessZoneToColdTraits(spec.coldTolerance.sourceClaim);assert.equal(t.ok,true);assert.equal(t.outputs.length,1);assert.equal(t.outputs[0].targetField,'coldTolerance');assert.equal(t.outputs[0].value,base.climate_traits.coldTolerance);assert.equal(t.transformRef,spec.coldTolerance.transformRef);assert.equal(t.frostSensitivity.authorized,false);});
test('heat damage and optimum temperature are kept distinct; ordinal remains explicitly heuristic',()=>{assert.equal((104-32)*5/9,40);assert.equal(spec.heatTolerance.sourceHeatDamageC.operator,'>');assert.equal(spec.heatTolerance.evidenceClass,'HEURISTIC_ASSERTION');assert.equal(spec.heatTolerance.approvalRequired,true);});
test('cold evidence alone does not conceal missing heat evidence',()=>{const row=clone(base);row.climate_traits.traitEvidenceClasses.coldTolerance='SOURCE_SUPPORTED';assert.equal(classify(row).readinessShort,'C');});
test('reviewed data draft moves Mango to Class A without changing readiness rules',()=>{const r=classify(candidate());assert.equal(r.readinessShort,'A');assert.equal(r.gate,'PASS');assert.ok(!r.reasons.includes('REPRODUCTIVE_CONTEXT_MISSING'));});
test('humidity and chill remain explicit unknown, not invented numeric or boolean defaults',()=>{const r=candidate();for(const key of ['humidityTolerance','needsWinterChill']){assert.equal(r.climate_traits[key],undefined);assert.equal(r.climate_traits.traitEvidenceClasses[key],'UNKNOWN');}assert.ok(classify(r).reasons.includes('HUMIDITY_UNKNOWN'));});
test('flowering weather preference never becomes a mandatory dry season in the draft',()=>{assert.notEqual(candidate().climate_traits.reproductiveClimate.fruiting.requiresDrySeason,true);assert.equal(candidate().climate_traits.reproductiveBiology.self_fertile,undefined);});
test('UNKNOWN records satisfy the existing intake contract while staying unknown: contract fixture, not a live write',()=>{for(const slug of ['date-palm','monstera']){const p=proposal.catalogPatches.find(x=>x.slug===slug);const row=candidate();row.slug=slug;delete row.climate_traits.traitEvidenceClasses.needsWinterChill;delete row.climate_traits.traitProvenance.needsWinterChill;assert.ok(evaluateFullPlantOnboarding(row).climate.missingCoreTraits.includes('needsWinterChill'));row.climate_traits.traitEvidenceClasses.needsWinterChill=p.evidenceClass;row.climate_traits.traitProvenance.needsWinterChill={status:p.status,sourceIds:p.sourceIds};const after=evaluateFullPlantOnboarding(row);assert.equal(after.ready,true);assert.ok(after.climate.explicitUnknownCoreTraits.includes('needsWinterChill'));assert.equal(row.climate_traits.needsWinterChill,undefined);}});
test('both approved size records resolve offline but retain placement hold and no personal-meter claim',()=>{for(const slug of ['date-palm','monstera']){const r=resolvePlantSizeAuthorityReadiness(size,{canonicalSlug:slug,growthStage:'mature'});assert.equal(r.state,'SIZE_AUTHORITY_CONTEXT_REQUIRED');assert.equal(r.placementScaleHold,true);assert.equal(r.meterAccuracyClaimAllowed,false);}});
test('minimum coverage with unresolved flowering no longer grants full approval',()=>{const media=read('data/catalog-media/active-canonical-image-coverage-v1.json');const r=evaluateFullCruvitPlantApproval({catalogRow:candidate(),identityRegistry:read('data/plant-identity.registry.json'),designAssetRegistry:read('modules/garden-design/assets/plants/design-asset-registry-v1.json'),sizeAuthorityRegistry:size,catalogMediaCoverageRecord:media.records.find(x=>x.slug==='mango')});assert.equal(r.modules.gardenDesign.missingRequiredCount,0);assert.ok(r.modules.gardenDesign.unknownStates.includes('flowering'));assert.equal(r.approved,false);assert.equal(r.status,'ENRICHMENT_REQUIRED');assert.ok(r.blockingReasons.includes('VISUAL_STATE_APPLICABILITY_UNRESOLVED'));assert.equal(r.modules.gardenDesign.minimumVisualCoverageReady,true);assert.equal(r.modules.gardenDesign.allRequiredVisualStatesComplete,false);const allStatesComplete=r.approved&&r.modules.gardenDesign.unknownStates.length===0;assert.equal(allStatesComplete,false);});
test('draft cannot authorize data writes, paid calls, image changes or deployment',()=>{for(const k of ['executionAuthorized','catalogWritesAllowed','productionDeployAllowed','productionR2WritesAllowed','visualRegistryWritesAllowed','paidAiAllowed'])assert.equal(proposal[k],false);});
test('simulation does not mutate the base row or its approved sources',()=>{const before=JSON.stringify(base);candidate();candidate();assert.equal(JSON.stringify(base),before);});
