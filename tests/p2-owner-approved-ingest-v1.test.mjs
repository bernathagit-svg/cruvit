import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateCatalogExpansionPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { normalizeBatch3PacketForClassification, classifyPlantDataReadiness } from '../modules/personal-domain/plant-data-contract-v1.js';
import { evaluatePacketContradictionDry } from '../modules/personal-domain/catalog-contradiction-gate-v1.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PROPOSAL_DIRS=[
  path.join(ROOT,'data/catalog/revalidation/p2-wave-1-proposals-2026-10-01-v1'),
  path.join(ROOT,'data/catalog/revalidation/p2-wave-2-proposals-2026-10-01-v1')
];
const APPROVED=path.join(ROOT,'data/catalog-expansion/batches/p2-owner-approved-v1/packets');
function proposalMap(){
  const m=new Map();
  for(const dir of PROPOSAL_DIRS) for(const n of fs.readdirSync(dir).filter(x=>x.endsWith('.proposal.json'))){
    const p=JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
    m.set(p.identity.canonicalSlug,p);
  }
  return m;
}test('P2 approved batch contains exactly the 13 owner-approved proposals',()=>{
  const proposals=proposalMap();
  const files=fs.readdirSync(APPROVED).filter(n=>n.endsWith('.packet.json')).sort();
  assert.equal(proposals.size,13);
  assert.equal(files.length,13);
  for(const name of files){
    const p=JSON.parse(fs.readFileSync(path.join(APPROVED,name),'utf8'));
    const original=proposals.get(p.identity.canonicalSlug);
    assert.ok(original,p.identity.canonicalSlug);
    assert.equal(original.humanApproval?.approvedForIngest,false);
    assert.equal(p.humanApproval?.approvedForIngest,true);
    assert.equal(p.humanApproval?.approvedBy,'CRUVIT Owner');
    const a=structuredClone(p), b=structuredClone(original);
    delete a.humanApproval; delete b.humanApproval;
    assert.deepEqual(a,b,`${p.identity.canonicalSlug}: approved packet changed claims beyond approval metadata`);
    const v=validateCatalogExpansionPacket(p);
    assert.equal(v.ok,true,`${p.packetId}: ${v.errors.join('; ')}`);
    const ready=classifyPlantDataReadiness(normalizeBatch3PacketForClassification(p));
    assert.equal(ready.readinessShort,'A',p.identity.canonicalSlug);
    assert.equal(ready.gate,'PASS',p.identity.canonicalSlug);
    const conflict=evaluatePacketContradictionDry(p);
    assert.equal(conflict.needsHold,false,p.identity.canonicalSlug);
  }
});

test('P2 owner-approved batch remains closed even when later semantic audits open new findings',()=>{
  const run=spawnSync(process.execPath,['scripts/full-catalog-revalidation-v1.mjs'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const queue=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalog/revalidation/full-catalog-revalidation-queue-2026-10-01-v1.json'),'utf8'));
  const report=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/_full-catalog-revalidation-v1-report.json'),'utf8'));
  const p2Slugs=new Set([...proposalMap().keys()]);
  assert.equal(queue.rows.filter(r=>p2Slugs.has(r.slug)).length,0);
  assert.equal(report.unified.statusCounts.CONTRADICTION,0);
  assert.equal(report.packets.counts.A,report.packets.unique);
});
