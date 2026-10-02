import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { auditUnknownOutcomePurpose } from '../modules/personal-domain/unknown-outcome-purpose-v1.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('fruit-purpose plants cannot hide fruiting as UNKNOWN_VALID',()=>{
  const r=auditUnknownOutcomePurpose({tags:['tree','fruit'],unknownOutcomes:['fruiting']});
  assert.equal(r.appropriate,false);
  assert.ok(r.blockers.includes('FRUITING_UNKNOWN_CONFLICTS_WITH_FRUIT_PURPOSE'));
});
test('flowering-purpose plants cannot hide flowering as UNKNOWN_VALID',()=>{
  const r=auditUnknownOutcomePurpose({groupIds:['ornamental-flowering'],unknownOutcomes:['flowering']});
  assert.equal(r.appropriate,false);
  assert.ok(r.blockers.includes('FLOWERING_UNKNOWN_CONFLICTS_WITH_FLOWERING_PURPOSE'));
});
test('leaf herbs may keep fruiting unknown when fruit is not the modeled purpose',()=>{
  const r=auditUnknownOutcomePurpose({tags:['herb','sun'],unknownOutcomes:['fruiting']});
  assert.equal(r.appropriate,true);
});
test('foliage houseplants may keep reproductive outcomes unknown',()=>{
  const r=auditUnknownOutcomePurpose({tags:['tree','houseplant','shade'],unknownOutcomes:['flowering','fruiting']});
  assert.equal(r.appropriate,true);
});
test('all current UNKNOWN_VALID records pass purpose-aware audit and queue remains empty',()=>{
  const run=spawnSync(process.execPath,['scripts/full-catalog-revalidation-v1.mjs'],{cwd:ROOT,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const rep=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/_full-catalog-revalidation-v1-report.json'),'utf8'));
  const rows=rep.rows.filter(r=>r.status==='UNKNOWN_VALID');
  assert.equal(rows.length,8);
  assert.ok(rows.every(r=>r.purposeAudit?.appropriate===true));
  assert.ok(rows.every(r=>(r.purposeAudit?.blockers||[]).length===0));
  const q=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalog/revalidation/full-catalog-revalidation-queue-2026-10-01-v1.json'),'utf8'));
  assert.equal(q.total,0);
});
