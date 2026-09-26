import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const uploader=fs.readFileSync('scripts/coordinate-climate-v2-upload-r2.mjs','utf8');
const storage=fs.readFileSync('modules/personal-domain/coordinate-climate-global-object-storage-v1.js','utf8');
const readiness=fs.readFileSync('modules/personal-domain/coordinate-climate-global-deployment-readiness-v1.js','utf8');
const contract=JSON.parse(fs.readFileSync('data/coordinate-climate/v2/coverage/object-storage-contract.json','utf8'));

test('full R2 uploader is executable rather than checkpoint stub',()=>{
  assert.match(uploader,/async function writeDeploymentManifest/);
  assert.match(uploader,/verifyRemoteKeySet/);
  assert.match(uploader,/verdict:'GLOBAL_READY'/);
  assert.doesNotMatch(uploader,/FULL_UPLOAD_NOT_EXECUTED_IN_THIS_CHECKPOINT/);
});

test('GLOBAL_READY requires verified deployment manifest',()=>{
  assert.match(readiness,/deployment-manifest/);
  assert.match(readiness,/verifiedRemoteTileCount/);
  assert.match(readiness,/FULL_REMOTE_KEY_SET_MATCH/);
  assert.match(readiness,/PARTIAL_COVERAGE/);
  assert.equal(contract.uploadStatus,'PARTIAL_CANARY_DEPLOYED');
  assert.match(contract.globalReadyRule,/verifiedRemoteTileCount===expectedLandTileCount/);
});

test('object storage supports checksum metadata, full listing, and deployment manifest key',()=>{
  assert.match(storage,/kind === 'deployment-manifest'/);
  assert.match(storage,/Metadata:/);
  assert.match(storage,/sha256: localSha/);
  assert.match(storage,/ListObjectsV2Command/);
  assert.match(storage,/listClimateObjectsByPrefix/);
});
