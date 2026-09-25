import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('netlify/functions/plant-visual-natural-blend-job.mjs','utf8');

test('Natural Blend supports exact direct candidate evidence for generic E2E repairs',()=>{
  assert.match(source,/plan\.sourceCandidate\?\.objectKey/);
  assert.match(source,/plan\.sourceCandidate\?\.sha256/);
  assert.match(source,/SOURCE_CANDIDATE_EVIDENCE_MISSING/);
  assert.match(source,/SOURCE_CANDIDATE_INTEGRITY_MISMATCH/);
});

test('Natural Blend prompt is generic and preserves canonical identity',()=>{
  assert.match(source,/const commonName=String\(plan\.canonicalSlug/);
  assert.match(source,/const scientific=String\(plan\.scientific/);
  assert.match(source,/Keep the plant recognizable as the same/);
  assert.doesNotMatch(source,/existing lavender plant look naturally integrated/);
});

test('generic Natural Blend remains scene-specific and non-production',()=>{
  assert.match(source,/productionWrites:0/);
  assert.match(source,/registryWrites:0/);
  assert.doesNotMatch(source,/PLANT_VISUAL_R2_PRODUCTION_BUCKET/);
});
