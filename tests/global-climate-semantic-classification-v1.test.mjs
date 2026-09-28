import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  deriveBroadClimateOverrideFromCoordinateProfile,
  deriveCoordinateDrySeasonStructure,
  deriveMediterraneanDrySummerSignal,
  coordinateClimateProfileToStructuralPersistence
} from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';

const pet=Array(12).fill(100);

function profile({lat,thermal,moisture='humid',cold=8,pr,alwaysHot=false,elevationM=null}){
  return {
    status:'known',
    coordinate:{lat,lon:0},
    thermalRegime:thermal,
    aridityMoistureRegime:moisture,
    coldestMonthMeanMinC:cold,
    warmestMonthMeanMaxC:25,
    monthlyPrecipMm:pr,
    monthlyPetMm:pet,
    alwaysHot,
    coolSeasonSignal:thermal!=='year-round-warm',
    elevationM,
    humidityRegime:'medium',
    humiditySignal:'medium',
    structuralColdRisk:'low',
    freezingRisk:'low'
  };
}

test('cool-seasonal alone never implies Mediterranean',()=>{
  const london=profile({
    lat:51.5,thermal:'cool-seasonal',cold:1.8,
    pr:[60,43,46,47,53,48,46,54,57,72,67,62]
  });
  assert.equal(deriveMediterraneanDrySummerSignal(london).drySummer,false);
  assert.equal(deriveBroadClimateOverrideFromCoordinateProfile(london),'temperate');
});

test('Mediterranean requires dry-summer precipitation structure',()=>{
  const telAviv=profile({
    lat:32.1,thermal:'mild-seasonal',moisture:'semi-arid',cold:11.1,
    pr:[172,116,57,16,4,1,1,1,2,30,96,143]
  });
  const capeTown=profile({
    lat:-33.9,thermal:'mild-seasonal',cold:11,
    pr:[15,18,20,41,68,93,82,77,42,30,17,14]
  });
  assert.equal(deriveMediterraneanDrySummerSignal(telAviv).drySummer,true);
  assert.equal(deriveBroadClimateOverrideFromCoordinateProfile(telAviv),'mediterranean');
  assert.equal(deriveMediterraneanDrySummerSignal(capeTown).drySummer,true);
  assert.equal(deriveBroadClimateOverrideFromCoordinateProfile(capeTown),'mediterranean');
});

test('tropical latitude plus cool structural thermal pattern is highland-tropical without fabricating elevation',()=>{
  const quito=profile({
    lat:-0.18,thermal:'cool-seasonal',cold:8.65,
    pr:[137,165,220,229,159,76,33,38,113,158,160,155],
    elevationM:null
  });
  const nairobi=profile({
    lat:-1.29,thermal:'mild-seasonal',moisture:'dry-subhumid',cold:12.05,
    pr:[53,41,83,189,128,25,20,18,24,60,117,84],
    elevationM:null
  });
  assert.equal(deriveBroadClimateOverrideFromCoordinateProfile(quito),'highland-tropical');
  assert.equal(deriveBroadClimateOverrideFromCoordinateProfile(nairobi),'highland-tropical');
  const persisted=coordinateClimateProfileToStructuralPersistence(quito);
  assert.equal(persisted.elevationM,null);
  assert.equal(persisted.terrainAuthorityStatus,'unavailable-in-global-bake');
});

test('drySeasonSignal uses monthly P/PET rather than annual dry-subhumid label alone',()=>{
  const evenlyMoist=profile({
    lat:35,thermal:'mild-seasonal',moisture:'dry-subhumid',cold:10,
    pr:Array(12).fill(80)
  });
  assert.equal(deriveCoordinateDrySeasonStructure(evenlyMoist).drySeasonSignal,false);
  assert.equal(coordinateClimateProfileToStructuralPersistence(evenlyMoist).drySeasonSignal,false);
});

test('structural alwaysHot is authoritative in app runtime when structural climate is known',()=>{
  const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');
  assert.match(app,/structuralAlwaysHot/);
  assert.match(app,/structuralAlwaysHot!=null/);
  assert.match(app,/structuralCoolSeason/);
  assert.match(app,/structuralClimate\?\.drySeasonSignal===true/);
});
