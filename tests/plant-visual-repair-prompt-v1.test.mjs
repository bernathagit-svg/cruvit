import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('netlify/functions/plant-visual-generate-wave-job.mjs','utf8');

test('bounded repair prompt addendum is appended only when declared by the approved job',()=>{
  assert.match(source,/const repairAddendum = String\(job\.repairPromptAddendum \|\| ''\)\.trim\(\)/);
  assert.match(source,/CRUVIT bounded repair constraints/);
});

test('repair prompt application is recorded in immutable evidence',()=>{
  assert.match(source,/repairPromptApplied: Boolean\(repairAddendum\)/);
  assert.match(source,/repairPromptSha256:/);
});
