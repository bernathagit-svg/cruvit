import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateCatalogExpansionPacket, materializePlantCatalogItemFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proposalPath=path.join(ROOT,'data/catalog/revalidation/semantic-audit-proposals-v1/date-palm.proposal.json');
const findingPath=path.join(ROOT,'data/catalog/revalidation/semantic-audit-open-findings-v1.json');
test('date-palm approved repair packet is Class A and source-backed',()=>{
 const approvedPath=path.join(ROOT,'data/catalog-expansion/batches/semantic-audit-owner-approved-v1/packets/date-palm.packet.json');
 const p=JSON.parse(fs.readFileSync(approvedPath,'utf8'));
 assert.equal(p.humanApproval.approvedForIngest,true);
 const v=validateCatalogExpansionPacket(p);assert.equal(v.ok,true,v.errors.join('; '));
 const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p));
 assert.equal(ready.readinessShort,'A');assert.equal(ready.gate,'PASS');
 const conflict=evaluatePacketContradictionDry(p);assert.equal(conflict.needsHold,false);
 const m=materializePlantCatalogItemFromPacket(p);assert.equal(m.ok,true);
 assert.ok(m.item.tags.includes('fruit'));assert.ok(m.item.tags.includes('edible'));
 assert.equal(m.item.climateTraits.reproductiveBiology.dioecious,true);
 assert.equal(m.item.climateTraits.reproductiveBiology.requires_pollinator,true);
 assert.equal(m.item.climateTraits.reproductiveClimate.fruiting.summerHeatBand,'hot');
 assert.equal(m.item.climateTraits.reproductiveClimate.fruiting.requiresDrySeason,true);
 assert.equal(m.item.climateTraits.reproductiveClimate.fruiting.humidClimateLimitsFruiting,true);
 assert.ok(m.item.climateTraits.reproductiveClimate.fruiting.transformRefs.includes('explicit-dry-season-fruiting-requirement-v1@1.0.0'));
 assert.ok(m.item.climateTraits.reproductiveClimate.fruiting.transformRefs.includes('explicit-humid-fruiting-constraint-v1@1.0.0'));
});

test('pistachio approved packet preserves cool-season + warm dry ripening requirements',()=>{
 const approvedPath=path.join(ROOT,'data/catalog-expansion/batches/p2-owner-approved-v1/packets/pistachio.packet.json');
 const p=JSON.parse(fs.readFileSync(approvedPath,'utf8'));
 const v=validateCatalogExpansionPacket(p);assert.equal(v.ok,true,v.errors.join('; '));
 const m=materializePlantCatalogItemFromPacket(p);assert.equal(m.ok,true);
 const fruit=m.item.climateTraits.reproductiveClimate.fruiting;
 assert.equal(fruit.requiresCoolSeason,true);
 assert.equal(fruit.summerHeatBand,'warm');
 assert.equal(fruit.requiresDrySeason,true);
 assert.ok(Array.isArray(fruit.sourceExcerpts));
 assert.ok(fruit.sourceExcerpts.some(x=>/warm dry summer ripening/i.test(x)));
});

test('all resolved semantic findings stay closed and research queue is empty',()=>{
 const findings=JSON.parse(fs.readFileSync(findingPath,'utf8'));
 for(const slug of ['date-palm','monstera','cycas']){
  assert.equal(findings.rows.find(r=>r.slug===slug)?.status,'RESOLVED',slug);
 }
 const open=findings.rows.filter(r=>r.status==='OPEN').map(r=>r.slug).sort();
 assert.deepEqual(open,[]);
 const run=spawnSync(process.execPath,['scripts/full-catalog-revalidation-v1.mjs'],{cwd:ROOT,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||run.stdout);
 const q=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalog/revalidation/full-catalog-revalidation-queue-2026-10-01-v1.json'),'utf8'));
 assert.equal(q.total,0);
 assert.deepEqual(q.rows,[]);
 const report=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/_full-catalog-revalidation-v1-report.json'),'utf8'));
 assert.equal(report.unified.statusCounts.RESEARCH_REQUIRED,0);
 assert.equal(report.unified.statusCounts.UNKNOWN_VALID,8);
 assert.equal(report.unified.statusCounts.PASS_FULL,132);
 assert.equal(report.unified.statusCounts.CONTRADICTION,0);
});
