import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  APPROVED_PACKET_RUNTIME_OVERLAY_VERSION,
  applyApprovedPacketRuntimeClimateOverlay
} from '../modules/catalog-expansion/approved-packet-runtime-overlay-v1.js';
import { deriveSpecificPlantOutcomes } from '../modules/personal-domain/specific-plant-suitability-contract.js';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const payload=JSON.parse(fs.readFileSync(
  path.join(ROOT,'data','catalog-expansion','approved-runtime-climate-overlay-v1.json'),'utf8'
));

test('generated approved packet overlay contains verified source-backed Papaya authority',()=>{
  assert.equal(payload.schemaVersion,1);
  assert.equal(payload.overlayVersion,APPROVED_PACKET_RUNTIME_OVERLAY_VERSION);
  assert.ok(payload.plantCount>=100);
  const p=payload.plants.papaya;
  assert.equal(p.packetVerificationState,'verified');
  assert.equal(p.verificationScope,'packet-acceptance-only');
  assert.equal(p.coverageState,'complete');
  assert.equal(p.needsReview,false);
  assert.equal(p.climateTraits.needsReview,false);
  assert.equal(p.climateTraits.coldTolerance,'very_low');
  assert.equal(p.climateTraits.traitEvidenceClasses.floweringRequirements,'SOURCE_SUPPORTED');
  assert.ok(String(p.climateTraits.floweringRequirements).length>10);
});
test('fallback overlays approved climate evidence while preserving legacy group ids',()=>{
  const plants=[{slug:'papaya',scientific:'Carica papaya',climateTraits:{
    groupIds:['tropical-frost-sensitive-fruit'],needsReview:true,coldTolerance:'low'
  }}];
  const out=applyApprovedPacketRuntimeClimateOverlay(plants,payload);
  assert.deepEqual(out.applied,['papaya']);
  assert.equal(plants[0].climateTraits.needsReview,false);
  assert.equal(plants[0].climateTraits.coldTolerance,'very_low');
  assert.ok(plants[0].climateTraits.groupIds.includes('tropical-frost-sensitive-fruit'));
  assert.equal(plants[0].approvedPacketClimateAuthority.verificationState,'verified_packet');
  assert.equal(plants[0].approvedPacketClimateAuthority.verificationScope,'packet-acceptance-only');
  assert.equal(plants[0].approvedPacketClimateAuthority.coverageState,'complete');
});
test('verified canonical DB authority outranks static approved packet fallback',()=>{
  const plants=[{slug:'papaya',scientific:'Carica papaya',canonicalClimateAuthority:{
    verificationState:'verified',needsReview:false
  },climateTraits:{coldTolerance:'custom-db-authority'}}];
  const out=applyApprovedPacketRuntimeClimateOverlay(plants,payload,{preserveVerifiedCanonical:true});
  assert.equal(out.applied.length,0);
  assert.equal(plants[0].climateTraits.coldTolerance,'custom-db-authority');
});


test('runtime overlay turns approved Pineapple reproductive facts into evidence-backed cold-climate negatives',()=>{
  const seed=JSON.parse(fs.readFileSync(path.join(ROOT,'data','plants.seed.json'),'utf8').replace(/^\uFEFF/,''));
  const plant=structuredClone(seed.plants.find((p)=>p.slug==='pineapple'));
  assert.ok(plant);
  applyApprovedPacketRuntimeClimateOverlay([plant],payload);
  assert.equal(plant.climateTraits.traitEvidenceClasses.floweringRequirements,'SOURCE_SUPPORTED');
  assert.equal(plant.climateTraits.traitEvidenceClasses.fruitingRequirements,'SOURCE_SUPPORTED');
  const outcomes=deriveSpecificPlantOutcomes({
    plant,
    meta:plant.climateTraits,
    climateProfile:{
      locationLabel:'Ljubljana, Slovenia', broadClimate:'temperate', freezingRisk:'high',
      isFrostFreeGrowingClimate:false, thermalRegime:'frost-prone', moistureRegime:'humid',
      humiditySignal:'medium', coldestMonthMeanMinC:-3.55, structuralClimateStatus:'known'
    },
    suitability:{
      recommendationLevel:'blocked', suitabilityScore:0, survivalFit:0, thriveFit:15,
      floweringFit:40, fruitingFit:20, warnings:['Frost risk is too high for this plant.'],
      explanationText:'Frost risk is too high for this plant.'
    },
    protectedGrowing:false
  });
  assert.equal(outcomes.flowering,'unlikely');
  assert.equal(outcomes.fruiting,'unreliable');
  assert.equal(outcomes.overall,'blocked');
});

test('generated overlay is complete for every currently approved packet',()=>{
  const files=[];
  const walk=(dir)=>{
    if(!fs.existsSync(dir)) return;
    for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
      const p=path.join(dir,ent.name);
      if(ent.isDirectory()) walk(p);
      else if(ent.isFile()&&(ent.name.endsWith('.packet.json')||ent.name==='packet.json')) files.push(p);
    }
  };
  walk(path.join(ROOT,'data','catalog-expansion','batches'));
  walk(path.join(ROOT,'data','catalog-expansion','packets'));
  const approved=new Map();
  for(const file of files){
    const packet=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    if(packet.humanApproval?.approvedForIngest!==true) continue;
    const slug=String(packet.identity?.canonicalSlug||'').trim().toLowerCase();
    assert.ok(slug,'approved packet must have canonical slug');
    assert.equal(approved.has(slug),false,'duplicate approved packet slug: '+slug);
    const validation=validateCatalogExpansionPacket(packet);
    assert.equal(validation.ok,true,'invalid approved packet: '+slug);
    const material=materializePlantCatalogItemFromPacket(packet,{updatedAt:'1970-01-01T00:00:00.000Z'});
    assert.equal(material.ok,true,'materialize failed: '+slug);
    const expectedTraits={...(material.item.climateTraits||{})};
    delete expectedTraits.plantKnowledge;
    delete expectedTraits.designMetadata;
    approved.set(slug,{packetId:packet.packetId,scientific:material.item.scientific||null,climateTraits:expectedTraits});
  }
  assert.equal(payload.plantCount,approved.size);
  for(const [slug,expected] of approved){
    const row=payload.plants?.[slug];
    assert.equal(row?.packetId,expected.packetId,'stale/missing overlay row: '+slug);
    assert.equal(row?.scientific,expected.scientific,'stale scientific overlay: '+slug);
    assert.deepEqual(row?.climateTraits,expected.climateTraits,'stale climate overlay: '+slug);
  }
});

test('app applies verified canonical authority before approved-packet fallback',()=>{
  const app=fs.readFileSync(path.join(ROOT,'app.html'),'utf8');
  const canonical=app.indexOf('applyCanonicalRuntimeClimateOverlay();');
  const fallback=app.indexOf('await applyApprovedPacketRuntimeClimateFallback();');
  assert.ok(canonical>=0&&fallback>canonical);
  assert.match(app,/preserveVerifiedCanonical:true/);
});

test('approved packet authority exposes partial field coverage instead of implying all climate fields are verified',()=>{
  const sparse=payload.plants.artichoke;
  assert.equal(sparse.packetVerificationState,'verified');
  assert.equal(sparse.verificationScope,'packet-acceptance-only');
  assert.equal(sparse.coverageState,'partial');
  assert.ok(sparse.missingFields.includes('humidityTolerance'));
  assert.equal(sparse.fieldCoverage.humidityTolerance.present,false);
  assert.equal(sparse.fieldCoverage.humidityTolerance.evidenceClass,'UNKNOWN');
  const plants=[{slug:'artichoke',climateTraits:{humidityTolerance:'legacy-medium'}}];
  const out=applyApprovedPacketRuntimeClimateOverlay(plants,payload);
  assert.deepEqual(out.applied,['artichoke']);
  assert.equal(plants[0].climateTraits.humidityTolerance,'legacy-medium');
  assert.equal(plants[0].approvedPacketClimateAuthority.coverageState,'partial');
  assert.ok(plants[0].approvedPacketClimateAuthority.missingFields.includes('humidityTolerance'));
});