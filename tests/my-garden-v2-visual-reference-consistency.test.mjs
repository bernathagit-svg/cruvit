import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APPROVED_VISUAL_SHA } from '../modules/my-garden-v2/visual-acceptance-gate.js';
import { UPCOMING_APPROVED_VISUAL } from '../modules/my-garden-v2/approved-upcoming-renderer.js';
import { GARDEN_JOURNAL_APPROVED_VISUAL } from '../modules/my-garden-v2/approved-garden-journal-renderer.js';
import { NOTIFICATIONS_APPROVED_VISUAL } from '../modules/my-garden-v2/approved-notifications-renderer.js';

const manifest=JSON.parse(fs.readFileSync(
  new URL('../modules/my-garden-v2/approved-reference-manifest.json',import.meta.url),
  'utf8'
));
const registry=JSON.parse(fs.readFileSync(
  new URL('../modules/my-garden-v2/owner-visual-approval-registry.json',import.meta.url),
  'utf8'
));

function manifestSha(id){
  return manifest.screens.find((x)=>x.id===id)?.sha256 ?? null;
}
function registrySha(id){
  return registry.screens.find((x)=>x.id===id)?.referenceSha256 ?? null;
}

const expected={
  'upcoming-list':UPCOMING_APPROVED_VISUAL.list.sha256,
  'upcoming-calendar':UPCOMING_APPROVED_VISUAL.calendar.sha256,
  'garden-journal':GARDEN_JOURNAL_APPROVED_VISUAL.sha256,
  'notifications':NOTIFICATIONS_APPROVED_VISUAL.sha256,
};

for(const [id,sha] of Object.entries(expected)){
  test('visual source of truth agrees for '+id,()=>{
    assert.equal(manifestSha(id),sha);
    assert.equal(registrySha(id),sha);
    assert.equal(APPROVED_VISUAL_SHA[id],sha);
  });
}
