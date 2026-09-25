import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProductionFramingQa } from '../modules/garden-design/asset-factory-v1/production-framing-qa-v1.js';

function qa({width=1024,height=1536,minX=20,minY=50,maxX=1000,maxY=1500}={}){
  return {result:'PASS',metrics:{width,height,bbox:{exists:true,minX,minY,maxX,maxY}}};
}

test('sub-3px threshold noise is tolerated without treating a good cutout as cropped',()=>{
  const rightNear=assessProductionFramingQa(qa({minX:23,minY:163,maxX:1012,maxY:1397}));
  assert.equal(rightNear.result,'PASS');

  const leftNear=assessProductionFramingQa(qa({minX:11,minY:67,maxX:1008,maxY:1480}));
  assert.equal(leftNear.result,'PASS');

  const topNear=assessProductionFramingQa(qa({minX:41,minY:36,maxX:981,maxY:1497}));
  assert.equal(topNear.result,'PASS');
});

test('materially insufficient framing still fails',()=>{
  const r=assessProductionFramingQa(qa({minX:4,minY:10,maxX:1019,maxY:1530}));
  assert.equal(r.result,'FAIL');
  assert.ok(r.reasons.length>0);
});

test('touching canvas edge remains a framing failure',()=>{
  const r=assessProductionFramingQa(qa({minX:0,minY:0,maxX:1023,maxY:1535}));
  assert.equal(r.result,'FAIL');
  assert.ok(r.reasons.includes('left-padding-too-small'));
  assert.ok(r.reasons.includes('top-padding-too-small'));
});
