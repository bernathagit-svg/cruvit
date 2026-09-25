import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('netlify/functions/plant-visual-in-garden-vision-qa-job.mjs','utf8');

test('in-garden vision QA calibration permits PASS for visibly acceptable integration',()=>{
  assert.match(source,/PASS = the check is visibly acceptable in this image and there is no visible defect that would justify HOLD/);
  assert.match(source,/PASS does not require proof of perfection/);
});

test('in-garden vision QA reserves UNCERTAIN for concrete observability limits',()=>{
  assert.match(source,/UNCERTAIN = the image itself does not contain enough visible information to judge the check/);
  assert.match(source,/Do NOT use UNCERTAIN merely because a visual judgment is probabilistic/);
});

test('in-garden vision QA keeps fail-closed structured output',()=>{
  assert.match(source,/strict:true/);
  assert.match(source,/enum:\['PASS','FAIL','UNCERTAIN'\]/);
  assert.match(source,/allPass\?\'PASS\':\'UNCERTAIN\'/);
});
