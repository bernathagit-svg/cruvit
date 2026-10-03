import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCanonicalCatalog} from '../modules/garden-design/asset-factory-v1/catalog-source-v1.js';
import {classifyDesignVisualForm} from '../modules/garden-design/garden-design-variant-policy-v1.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'data','garden-design','plant-morphology-authority-v1.json'),'utf8'));

test('morphology authority is source-supported for the three previously blocked plants',()=>{
  for(const slug of ['basil','cyclamen','strelitzia']){
    const row=manifest.plants[slug];
    assert.ok(row,slug);
    assert.equal(row.evidenceClass,'SOURCE_SUPPORTED',slug);
    assert.ok(row.sourceUrl,slug);
    assert.ok(row.growthHabit,slug);
  }
});

test('canonical catalog loader resolves visual morphology without plant-name hardcodes',()=>{
  const catalog=loadCanonicalCatalog(ROOT);
  const expected={
    basil:'herbaceous-upright',
    cyclamen:'herbaceous-clump',
    strelitzia:'herbaceous-clump'
  };
  for(const [slug,form] of Object.entries(expected)){
    const plant=catalog.plants.find(p=>p.slug===slug);
    assert.ok(plant,slug);
    assert.equal(plant.climateTraits?.traitEvidenceClasses?.growthHabit,'SOURCE_SUPPORTED',slug);
    const classified=classifyDesignVisualForm(plant);
    assert.equal(classified.visualForm,form,slug);
    assert.equal(classified.authority,'source_supported_habit',slug);
    assert.equal(classified.confidence,'high',slug);
  }
});
