import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.html','utf8');

test('weather refresh preserves existing structural climate when forecast omits it',()=>{
  const start=app.indexOf('async function refreshGardenWeather()');
  assert.ok(start>=0,'refreshGardenWeather missing');
  const end=app.indexOf('async function refreshGardenSession()',start);
  assert.ok(end>start,'refreshGardenWeather end missing');
  const body=app.slice(start,end);
  assert.match(body,/existingStructural:loc\.structuralClimate\|\|null/);
  assert.match(body,/structuralClimate:structuralClimate\|\|loc\.structuralClimate\|\|null/);
  assert.doesNotMatch(body,/structuralClimate:structuralClimate\|\|null,/);
  assert.doesNotMatch(body,/const structuralClimate=result\.structuralClimate\|\|rl\.structuralClimate\|\|null/);
});


test('known structural climate outranks unknown forecast structural payload',()=>{
  const start=app.indexOf('async function refreshGardenWeather()');
  const end=app.indexOf('async function refreshGardenSession()',start);
  const body=app.slice(start,end);
  const knownBranch=body.indexOf("returnedStructural?.status==='known'");
  const preserveBranch=body.indexOf("existingStructural?.status==='known'");
  assert.ok(knownBranch>=0);
  assert.ok(preserveBranch>knownBranch);
  assert.match(body,/returnedStructural\|\|existingStructural\|\|null/);
});
