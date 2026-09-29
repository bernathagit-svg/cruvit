import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');

test('final Smart Rec frost cap is scoped to warm frost-sensitive groups',()=>{
  const start=app.indexOf("let recommendationLevel=blocked?'blocked'");
  const end=app.indexOf("const explanationText=",start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/climateSuitabilityV1HighFrostNeedsConservativeClimate/);
  assert.match(body,/climateSuitabilityV1IsWarmTropicalFrostSensitiveGroup\(metaHasGroup\)/);
  assert.doesNotMatch(body,/const frostCap=metaHasGroup\('tropical-frost-sensitive-fruit'\)\?'borderline':'borderline'/);
});
