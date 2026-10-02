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
  'garden-journal',
  'notifications',
  'upcoming-calendar',
  'upcoming-list',
];

function sortedIds(rows){
  return rows.map((x)=>x.id).sort();
}

test('owner approved integrated preview fingerprint is locked',()=>{
  assert.equal(registry.approvedPreview.ownerPass,true);
  assert.equal(
    registry.approvedPreview.sha256,
    'd618bdbaa8b01dd39673c9480fe2e67328d7005e9410e7ba7f736eb46f1fc17d'
  );
});

test('implemented owner-approved screens remain LOCKED_IMPLEMENTED',()=>{
  const rows=registry.screens.filter((x)=>x.state==='LOCKED_IMPLEMENTED');
  assert.deepEqual(sortedIds(rows),[...lockedImplemented].sort());
  for(const screen of rows){
    assert.equal(screen.ownerApproved,true);
    assert.match(screen.referenceSha256,/^[a-f0-9]{64}$/);
  }
});

test('visual-only Owner PASS stays APPROVED_VISUAL until implementation comparison',()=>{
  const rows=registry.screens.filter((x)=>x.state==='APPROVED_VISUAL');
  assert.deepEqual(sortedIds(rows),[...approvedVisualOnly].sort());
  for(const screen of rows){
    assert.equal(screen.ownerApproved,true);
    assert.match(screen.referenceSha256,/^[a-f0-9]{64}$/);
  }
});

test('registry contains only recognized approval states',()=>{
  const allowedStates=new Set(['LOCKED_IMPLEMENTED','APPROVED_VISUAL']);
  assert.equal(registry.screens.every((screen)=>allowedStates.has(screen.state)),true);
});

test('every registered screen is classified exactly once',()=>{
  const expected=new Set([...lockedImplemented,...approvedVisualOnly]);
  assert.equal(registry.screens.length,expected.size);
  assert.equal(registry.screens.every((screen)=>expected.has(screen.id)),true);
  assert.equal(new Set(registry.screens.map((screen)=>screen.id)).size,expected.size);
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
