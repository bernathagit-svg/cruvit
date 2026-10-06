import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const bridge = fs.readFileSync(
  new URL(
    '../modules/plant-identifier/plant-identifier-mygarden-write-bridge-v1.js',
    import.meta.url
  ),
  'utf8'
);
const command = fs.readFileSync(
  new URL('../modules/my-garden-v2/add-plant-write-repository.js', import.meta.url),
  'utf8'
);

test('Plant Identification save loads only the atomic My Garden bridge', () => {
  assert.match(
    app,
    /plant-identifier-mygarden-write-bridge-v1\.js\?v=20261005a/
  );
  assert.doesNotMatch(app, /plant-identifier-history-lifecycle-v1\.js/);
  assert.doesNotMatch(app, /garden-plants-schema-readiness/);
});

test('Plant Identification commit uses authoritative atomic bridge only', () => {
  const start = app.indexOf('async function commitIdentifiedPlantFromModule');
  const end = app.indexOf('function plantIdentifierDeps', start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start, end);

  assert.match(body, /CruvitPlantIdentifierMyGardenWriteBridge/);
  assert.match(body, /persistConfirmedIdentifierPlant/);
  assert.doesNotMatch(body, /savePlantFromLibrary\(/);
  assert.doesNotMatch(body, /historyPending/);
  assert.doesNotMatch(body, /schema/i);
});

test('bridge contains no runtime schema attestation or history reconciliation', () => {
  assert.match(bridge, /createAtomicAddPlantCommand/);
  assert.doesNotMatch(bridge, /schemaVerifier|verifyUnassessedHealthSchema|Management API/i);
  assert.doesNotMatch(bridge, /historyPending|reconcil/i);
});

test('Add Plant command is RPC-only and has no direct table upsert', () => {
  assert.match(command, /supabase\.rpc\('add_garden_plant_once_v1'/);
  assert.doesNotMatch(command, /\.from\(['"]garden_plants['"]\)/);
  assert.doesNotMatch(command, /\.upsert\(/);
});

test('Plant Identification runtime view model remains loaded and bound to results', () => {
  assert.match(
    app,
    /plant-identification-runtime-view-model-v1\.js\?v=20261005a/
  );
  const moduleSource = fs.readFileSync(
    new URL(
      '../modules/plant-identifier/plant-identifier.js',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(moduleSource, /CruvitPlantIdentificationRuntimeViewModel/);
  assert.match(moduleSource, /result\._runtimeViewModel\s*=\s*buildRuntimeViewModel/);
  assert.match(moduleSource, /state\.lastResult\._savedPlant\s*=\s*out\.plant/);
});
