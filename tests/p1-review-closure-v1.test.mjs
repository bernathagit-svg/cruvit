import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateCatalogExpansionPacket,
  materializePlantCatalogItemFromPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import {
  normalizeBatch3PacketForClassification,
  classifyPlantDataReadiness
} from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const DIRS=[
  'data/catalog-expansion/batches/p1-review-closure-wave-a-v1/packets',
  'data/catalog-expansion/batches/p1-review-closure-wave-b-v1/packets'
];

test('P1 review closure has exactly 22 validated Class A packets with no contradiction holds',()=>{
  const files=DIRS.flatMap(rel=>{
    const dir=path.join(ROOT,rel);
    return fs.readdirSync(dir).filter(f=>f.endsWith('.packet.json')).sort().map(f=>path.join(dir,f));
  });
  assert.equal(files.length,22);
  const slugs=new Set();
  for(const file of files){
    const packet=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    const validation=validateCatalogExpansionPacket(packet);
    assert.equal(validation.ok,true,`${packet.packetId}: ${validation.errors.join('; ')}`);
    assert.equal(packet.flags?.forceClimateNeedsReview,false);
    assert.equal(packet.humanApproval?.approvedForIngest,true);
    const materialized=materializePlantCatalogItemFromPacket(packet);
    assert.equal(materialized.ok,true,packet.packetId);
    const plant=normalizeBatch3PacketForClassification(packet);
    const ready=classifyPlantDataReadiness(plant);
    assert.equal(ready.readinessShort,'A',`${plant.slug}: ${ready.reasons.join(', ')}`);
    const contradiction=evaluatePacketContradictionDry(packet);
    assert.equal(contradiction.needsHold,false,`${plant.slug}: ${(contradiction.holdFields||[]).join(',')}`);
    assert.equal((contradiction.counts?.MATERIAL_CONFLICT||0),0,plant.slug);
    assert.equal((contradiction.counts?.IDENTITY_CONFLICT||0),0,plant.slug);
    slugs.add(plant.slug);
  }
  assert.equal(slugs.size,22);
});

test('P1 taxonomy corrections are retained in canonical packets',()=>{
  const dragon=JSON.parse(fs.readFileSync(path.join(ROOT,DIRS[1],'dragon-fruit.packet.json'),'utf8'));
  const areca=JSON.parse(fs.readFileSync(path.join(ROOT,DIRS[0],'areca-palm.packet.json'),'utf8'));
  assert.equal(dragon.identity.acceptedScientificName,'Selenicereus undatus');
  assert.ok(dragon.identity.aliases.includes('Hylocereus undatus'));
  assert.equal(areca.identity.acceptedScientificName,'Chrysalidocarpus lutescens');
  assert.ok(areca.identity.aliases.includes('Dypsis lutescens'));
});
