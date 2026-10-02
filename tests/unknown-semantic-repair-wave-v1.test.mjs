import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIR=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1');
function load(slug){return JSON.parse(fs.readFileSync(path.join(DIR,slug+'.proposal.json'),'utf8'))}
for(const slug of ['monstera','cycas']) test(slug+' semantic repair proposal is Class A and owner-unapproved',()=>{
 const p=load(slug);assert.equal(p.humanApproval.approvedForIngest,false);
 const sim={...p,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA only'}};
 const v=validateCatalogExpansionPacket(sim);assert.equal(v.ok,true,v.errors.join('; '));
 const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p));
 assert.equal(ready.readinessShort,'A');assert.equal(ready.gate,'PASS');
 assert.equal(evaluatePacketContradictionDry(p).needsHold,false);
 assert.equal(materializePlantCatalogItemFromPacket(sim).ok,true);
});
test('Monstera repair models ripe-only edible fruit and biological fruiting evidence',()=>{
 const p=load('monstera');const sim={...p,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA only'}};
 const m=materializePlantCatalogItemFromPacket(sim).item;
 assert.ok(m.tags.includes('fruit'));assert.ok(m.tags.includes('edible'));
 assert.equal(m.climateTraits.reproductiveBiology.self_fertile,true);
 assert.equal(m.climateTraits.reproductiveClimate.fruiting.summerHeatBand,'warm');
 assert.ok(m.climateTraits.warningFlags.includes('ripe_fruit_only'));
 assert.ok(m.climateTraits.hardBlockRules.includes('needs-support'));
});
test('Cycas repair models non-flowering gymnosperm reproduction without edible positioning',()=>{
 const p=load('cycas');const sim={...p,humanApproval:{approvedForIngest:true,approvedAt:'SIMULATION_ONLY',note:'QA only'}};
 const m=materializePlantCatalogItemFromPacket(sim).item;
 assert.equal(m.tags.includes('fruit'),false);assert.equal(m.tags.includes('edible'),false);
 assert.match(m.climateTraits.floweringRequirements,/Not applicable.*gymnosperm/i);
 assert.match(m.climateTraits.fruitingRequirements,/Not applicable.*botanical fruit/i);
 assert.equal(m.climateTraits.reproductiveBiology.dioecious,true);
 assert.equal(m.climateTraits.reproductiveBiology.requires_pollinator,true);
});
test('semantic audit accounts for the reviewed exact-species records',()=>{
 const audit=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalog/revalidation/unknown-valid-semantic-audit-2026-10-02-v1.json'),'utf8'));
 assert.equal(audit.reviewed,10);
 assert.equal(audit.materialFindings,2);
 assert.equal(audit.purposeAppropriateUnknown,8);
 assert.deepEqual(audit.openFindings.map(x=>x.slug).sort(),['cycas','monstera']);
 assert.equal(audit.acceptedUnknowns.length,8);
});
