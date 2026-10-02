import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registry=JSON.parse(
  fs.readFileSync(
    new URL('../modules/my-garden-v2/owner-visual-approval-registry.json', import.meta.url),
    'utf8'
  )
);

const locked=[
  'add-plant',
  'my-plants',
  'plant-care',
  'plant-history',
  'plant-overview',
  'plant-schedule',
];

test('owner approved integrated preview fingerprint is locked',()=>{
  assert.equal(registry.approvedPreview.ownerPass,true);
  assert.equal(
    registry.approvedPreview.sha256,
    'd618bdbaa8b01dd39673c9480fe2e67328d7005e9410e7ba7f736eb46f1fc17d'
  );
});

test('all explicitly owner-approved visual screens are LOCKED_IMPLEMENTED',()=>{
  assert.deepEqual(registry.screens.map((x)=>x.id),locked);
  for(const screen of registry.screens){
    assert.equal(screen.state,'LOCKED_IMPLEMENTED');
    assert.equal(screen.ownerApproved,true);
    assert.match(screen.referenceSha256,/^[a-f0-9]{64}$/);
  }
});

test('visual approval does not authorize bottom-nav or production writes',()=>{
  assert.equal(
    registry.frozenRules.includes('Bottom navigation and center plus remain deferred.'),
    true
  );
  assert.equal(
    registry.frozenRules.includes('No production write activation is implied by visual approval.'),
    true
  );
});
