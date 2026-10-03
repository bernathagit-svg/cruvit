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
  const helperStart=app.indexOf('function climateSuitabilityV1IsWarmTropicalFrostSensitiveGroup');
  const helperEnd=app.indexOf('function climateSuitabilityV1FromSnapshot',helperStart);
  const helper=app.slice(helperStart,helperEnd);
  assert.match(helper,/tropical-frost-sensitive-fruit/);
  assert.match(helper,/warm-climate-palm/);
  assert.doesNotMatch(helper,/hot-dry-palm/);
  assert.doesNotMatch(body,/const frostCap=metaHasGroup\('tropical-frost-sensitive-fruit'\)\?'borderline':'borderline'/);
});
