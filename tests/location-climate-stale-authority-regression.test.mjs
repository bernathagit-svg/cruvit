import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');

test('location change clears stale climate authority and weather state',()=>{
  const saveStart=app.indexOf('async function saveGardenLocation(loc,options)');
  const saveEnd=app.indexOf('/* ── Global App Settings',saveStart);
  const src=app.slice(saveStart,saveEnd);
  assert.match(src,/const locationChanged=/);
  assert.match(src,/climate:''/);
  assert.match(src,/structuralClimate:null/);
  assert.match(src,/climateAuthorityCode:null/);
  assert.match(src,/data\.weather=null/);
  assert.match(src,/data\.climate=next\.climate\|\|''/);
  assert.doesNotMatch(src,/data\.climate=next\.climate\|\|current\.climate\|\|'Mediterranean'/);
});

test('setAppLocation does not inherit prior location climate metadata after coordinate change',()=>{
  const start=app.indexOf('async function setAppLocation(partial,options)');
  const end=app.indexOf('async function clearAppLocation()',start);
  const src=app.slice(start,end);
  assert.match(src,/locationChanged\?'':current\.climate/);
  assert.match(src,/locationChanged\?'':current\.country/);
  assert.match(src,/locationChanged\?'':current\.timezone/);
  assert.match(src,/payload\.structuralClimate=null/);
});

test('confirmed location with missing climate must not fall back to Western Galilee Mediterranean',()=>{
  const start=app.indexOf('function ensureGardenLocation()');
  const end=app.indexOf('function gardenLocationLabel()',start);
  const src=app.slice(start,end);
  assert.match(src,/mayUseLegacyDefaultClimate/);
  assert.match(src,/locationSource==='default'/);
  assert.doesNotMatch(src,/if\(!data\.gardenLocation\.climate\) data\.gardenLocation\.climate=legacyClimate\|\|DEFAULT_GARDEN_LOCATION\.climate/);
});

test('missing structural climate authority cannot yield a positive location recommendation',()=>{
  const start=app.indexOf('function smartRecEvaluateSuitability(p)');
  const end=app.indexOf('/**\n * Specific Plant Suitability Check V1',start);
  const src=app.slice(start,end);
  assert.match(src,/structuralClimateKnown/);
  assert.match(src,/structuralClimateStatus==='known'/);
  assert.match(src,/positiveRecommendationEligible:false/);
  assert.match(src,/climateAuthorityUnavailable:true/);
  assert.match(src,/Long-term climate authority is unavailable/);
});
