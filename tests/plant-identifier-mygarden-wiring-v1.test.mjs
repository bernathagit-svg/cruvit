import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');

test('Plant Identification save loads the My Garden write bridge', () => {
  assert.match(
    app,
    /plant-identifier-mygarden-write-bridge-v1\.js\?v=20261005a/
  );
});

test('Plant Identification commit uses the authoritative write bridge', () => {
  const start = app.indexOf('async function commitIdentifiedPlantFromModule');
  const end = app.indexOf('function plantIdentifierDeps', start);
  assert.ok(start >= 0 && end > start);
  const body = app.slice(start, end);

  assert.match(body, /CruvitPlantIdentifierMyGardenWriteBridge/);
  assert.match(body, /persistConfirmedIdentifierPlant/);
  assert.match(body, /gardenPlantsUnassessedHealthV2/);
  assert.doesNotMatch(body, /savePlantFromLibrary\(/);
});

test('Plant Identification save remains fail-closed until schema capability is enabled', () => {
  assert.match(
    app,
    /CruvitSchemaCapabilities\?\.gardenPlantsUnassessedHealthV2===true/
  );
});
