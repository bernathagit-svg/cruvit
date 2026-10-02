import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVisualAcceptanceRecord,
  canMarkScreenImplemented,
} from '../modules/my-garden-v2/visual-acceptance-gate.js';

const pass={
  layout:'pass',
  typography:'pass',
  color:'pass',
  imagery:'pass',
  spacing:'pass',
  navigation:'pass',
};

test('automated visual pass is still not owner approval',()=>{
  const record=createVisualAcceptanceRecord({
    screenId:'my-plants',
    referenceSha256:'64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5',
    implementationCommit:'abc123',
    viewport:{width:941,height:1672},
    screenshotSha256:'a'.repeat(64),
    comparison:pass,
    ownerApproved:false,
  });
  assert.equal(record.state,'AWAITING_OWNER_APPROVAL');
  assert.equal(canMarkScreenImplemented(record),false);
});

test('screen locks only after visual pass and explicit owner approval',()=>{
  const record=createVisualAcceptanceRecord({
    screenId:'my-plants',
    referenceSha256:'64ddc9c59a62482c4050159a8a9109d19a71d1a777ebafc888d6d598d8b531d5',
    implementationCommit:'abc123',
    viewport:{width:941,height:1672},
    screenshotSha256:'b'.repeat(64),
    comparison:pass,
    ownerApproved:true,
  });
  assert.equal(record.state,'LOCKED_IMPLEMENTED');
  assert.equal(canMarkScreenImplemented(record),true);
});

test('one visual regression blocks implementation lock',()=>{
  const record=createVisualAcceptanceRecord({
    screenId:'plant-overview',
    referenceSha256:'eab2a113e2a14d11eef09e8e4bbca31bb373c4034a0ab77b9bd651237def7b5a',
    implementationCommit:'abc123',
    viewport:{width:941,height:1672},
    screenshotSha256:'c'.repeat(64),
    comparison:{...pass,spacing:'fail'},
    ownerApproved:true,
  });
  assert.equal(record.state,'VISUAL_FIX_REQUIRED');
  assert.equal(canMarkScreenImplemented(record),false);
});

test('wrong approved reference fingerprint is rejected',()=>{
  assert.throws(
    ()=>createVisualAcceptanceRecord({
      screenId:'my-plants',
      referenceSha256:'0'.repeat(64),
      implementationCommit:'abc123',
      viewport:{width:941,height:1672},
      screenshotSha256:'d'.repeat(64),
      comparison:pass,
    }),
    /approved_reference_mismatch/
  );
});
