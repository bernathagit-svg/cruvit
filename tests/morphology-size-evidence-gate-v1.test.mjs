import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStructuredMorphologyAndSize } from '../modules/catalog/morphology-size-evidence-gate-v1.js';

test('parses shrub and dimensions',()=>{
  const r=extractStructuredMorphologyAndSize(
    'Height: 3 ft. 0 in. - 6 ft. 0 in. Width: 3 ft. 0 in. - 6 ft. 0 in. Whole Plant Traits: Plant Type: Perennial Shrub Woody Plant Leaf Characteristics: Deciduous Habit/Form: Erect Multi-stemmed Rounded Growth Rate: Rapid'
  );
  assert.equal(r.visualForm,'shrub');
  assert.equal(r.morphologyEvidenceClass,'SOURCE_SUPPORTED');
  assert.equal(r.matureSize.ready,true);
  assert.equal(r.matureSize.heightM.min,0.9144);
  assert.equal(r.matureSize.heightM.max,1.8288);
});

test('tree plus shrub stays multi-form',()=>{
  const r=extractStructuredMorphologyAndSize(
    'Height: 10 ft. 0 in. - 30 ft. 0 in. Width: 10 ft. 0 in. - 30 ft. 0 in. Whole Plant Traits: Plant Type: Edible Perennial Shrub Tree Woody Plant Leaf Characteristics: Deciduous Habit/Form: Erect Multi-stemmed Rounded Spreading Growth Rate: Rapid'
  );
  assert.equal(r.visualForm,'shrub');
  assert.deepEqual(r.architectureModes,['tree','shrub']);
  assert.equal(r.morphologyCode,'EXPLICIT_TREE_SHRUB_MULTI_FORM');
});

test('annual vegetable does not silently become herbaceous form',()=>{
  const r=extractStructuredMorphologyAndSize(
    'Height: 0 ft. 6 in. - 1 ft. 0 in. Width: 0 ft. 6 in. - 1 ft. 0 in. Whole Plant Traits: Plant Type: Annual Cool Season Vegetable Edible Vegetable Woody Plant Leaf Characteristics: Deciduous Habit/Form: Erect Growth Rate: Rapid'
  );
  assert.equal(r.visualForm,'unknown');
  assert.equal(r.morphologyReady,false);
  assert.equal(r.matureSize.ready,true);
});


test('strips HTML wrappers before structured morphology parsing',()=>{
  const r=extractStructuredMorphologyAndSize(
    '<dt>Plant Type:</dt><dd><span>Perennial</span></dd><dd><span>Shrub</span></dd><dt>Leaf Characteristics:</dt><dd>Deciduous</dd><dt>Habit/Form:</dt><dd><span>Erect</span></dd><dd><span>Multi-stemmed</span></dd><dt>Growth Rate:</dt><dd>Rapid</dd> Height: 6 ft. 0 in. - 12 ft. 0 in. Width: 6 ft. 0 in. - 10 ft. 0 in.'
  );
  assert.equal(r.plantType,'Perennial Shrub');
  assert.equal(r.habitForm,'Erect Multi-stemmed');
  assert.equal(r.visualForm,'shrub');
  assert.equal(r.morphologyReady,true);
});

test('maps explicit ground cover morphology to groundcover visual form',()=>{
  const r=extractStructuredMorphologyAndSize(
    '<dt>Plant Type:</dt><dd>Edible</dd><dd>Ground Cover</dd><dt>Leaf Characteristics:</dt><dd>Deciduous</dd><dt>Habit/Form:</dt><dd>Clumping</dd><dt>Growth Rate:</dt><dd>Rapid</dd> Height: 0 ft. 6 in. - 1 ft. 0 in. Width: 1 ft. 0 in. - 2 ft. 0 in.'
  );
  assert.equal(r.visualForm,'groundcover');
  assert.equal(r.morphologyCode,'EXPLICIT_GROUNDCOVER');
  assert.equal(r.morphologyEvidenceClass,'SOURCE_SUPPORTED');
  assert.equal(r.matureSize.ready,true);
});
