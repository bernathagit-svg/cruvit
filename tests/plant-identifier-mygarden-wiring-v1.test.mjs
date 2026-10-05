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
const lifecycle = fs.readFileSync(
  new URL(
    '../modules/plant-identifier/plant-identifier-history-lifecycle-v1.js',
    import.meta.url
  ),
  'utf8'
);

test('Plant Identification save loads the My Garden write bridge', () => {
  assert.match(
    app,
    /plant-identifier-mygarden-write-bridge-v1\.js\?v=20261005a/
  );
});

test('Plant Identification commit uses authoritative write bridge only', () => {
  const start = app.indexOf('async function commitIdentifiedPlantFromModule');
  const end = app.indexOf('function plantIdentifierDeps', start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start, end);

  assert.match(body, /CruvitPlantIdentifierMyGardenWriteBridge/);
  assert.match(body, /persistConfirmedIdentifierPlant/);
  assert.doesNotMatch(body, /savePlantFromLibrary\(/);
  assert.doesNotMatch(body, /CruvitSchemaCapabilities/);
  assert.doesNotMatch(body, /gardenPlantsUnassessedHealthV2/);
});

test('schema readiness cannot be enabled by a hard-coded browser capability', () => {
  assert.doesNotMatch(app, /schema-capabilities-v1\.js/);
  assert.doesNotMatch(app, /CruvitSchemaCapabilities/);
  assert.match(bridge, /verifyUnassessedHealthSchema/);
  assert.match(bridge, /schema-verifier-unavailable/);
  assert.match(bridge, /schema-attestation-mismatch/);
});

test('Plant Added reconciliation is bound to Garden Context Ready, not window load', () => {
  assert.match(
    app,
    /plant-identifier-history-lifecycle-v1\.js\?v=20261005a/
  );
  const bridgePos = app.indexOf('plant-identifier-mygarden-write-bridge-v1.js');
  const lifecyclePos = app.indexOf('plant-identifier-history-lifecycle-v1.js');
  const personalDomainPos = app.indexOf('modules/personal-domain/garden-profile-v0.js');
  assert.ok(bridgePos >= 0 && lifecyclePos > bridgePos);
  assert.ok(personalDomainPos > lifecyclePos);

  assert.match(lifecycle, /cruvit:garden-context-ready/);
  assert.match(lifecycle, /reconcilePendingIdentifierHistory/);
  assert.doesNotMatch(lifecycle, /addEventListener\(['"]load/);
});

test('Plant Identification runtime view model is loaded and bound to results', () => {
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
