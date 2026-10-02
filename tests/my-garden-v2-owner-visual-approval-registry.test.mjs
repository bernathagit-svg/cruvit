import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const registry=JSON.parse(
  fs.readFileSync(
    new URL('../modules/my-garden-v2/owner-visual-approval-registry.json', import.meta.url),
    'utf8'
  )
);

const lockedImplemented=[
  'add-plant',
  'my-plants',
  'plant-care',
  'plant-history',
  'plant-overview',
  'plant-schedule',
];

const approvedVisualOnly=[
  'upcoming-list',
  'upcoming-calendar',
];

test('owner approved integrated preview fingerprint is locked',()=>{
  assert.equal(registry.approvedPreview.ownerPass,true);
  assert.equal(
    registry.approvedPreview.sha256,
    'd618bdbaa8b01dd39673c9480fe2e67328d7005e9410e7ba7f736eb46f1fc17d'
  );
});

test('implemented owner-approved screens remain LOCKED_IMPLEMENTED',()=>{
  const rows=registry.screens.filter((x)=>lockedImplemented.includes(x.id));
  assert.deepEqual(rows.map((x)=>x.id),lockedImplemented);
  for(const screen of rows){
    assert.equal(screen.state,'LOCKED_IMPLEMENTED');
    assert.equal(screen.ownerApproved,true);
    assert.match(screen.referenceSha256,/^[a-f0-9]{64}$/);
  }
});

test('visual-only Owner PASS does not falsely claim implementation completion',()=>{
  const rows=registry.screens.filter((x)=>approvedVisualOnly.includes(x.id));
  assert.deepEqual(rows.map((x)=>x.id),approvedVisualOnly);
  for(const screen of rows){
    assert.equal(screen.state,'APPROVED_VISUAL');
    assert.equal(screen.ownerApproved,true);
    assert.match(screen.referenceSha256,/^[a-f0-9]{64}$/);
  }
});

test('registry contains no unclassified owner-approved screen',()=>{
  const allowed=new Set([...lockedImplemented,...approvedVisualOnly]);
  assert.equal(registry.screens.every((screen)=>allowed.has(screen.id)),true);
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
