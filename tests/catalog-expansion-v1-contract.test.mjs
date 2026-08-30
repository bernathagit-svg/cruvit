/**
 * Catalog Expansion V1 contract tests — plant-agnostic validation + materialize.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_EXPANSION_CONTRACT_VERSION,
  IMAGE_PENDING,
  materializePlantCatalogItemFromPacket,
  mergePlantIntoSeedDocument,
  validateCatalogExpansionPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CACAO_PACKET = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'packets',
  'cacao-theobroma-cacao-v1',
  'packet.json'
);

function loadPacket() {
  return JSON.parse(fs.readFileSync(CACAO_PACKET, 'utf8').replace(/^\uFEFF/, ''));
}

test('expansion contract version accepts 1.0.0, 1.1.0, and 1.2.0', () => {
  assert.equal(CATALOG_EXPANSION_CONTRACT_VERSION, '1.2.0');
  const packet = loadPacket();
  assert.equal(packet.expansionContractVersion, '1.0.0');
  const v = validateCatalogExpansionPacket(packet);
  assert.equal(v.ok, true, v.errors.join('; '));
});

test('optional quantitative claim requires provenance; inventing numbers is rejected', () => {
  const packet = loadPacket();
  packet.expansionContractVersion = '1.1.0';
  packet.claims = [
    ...packet.claims,
    {
      claimId: 'q-min-temp-no-source',
      field: 'quantitative.minimum_survival_temperature_c',
      status: 'asserted',
      value: -5,
      sourceIds: [],
      shortExcerpt: ''
    }
  ];
  const bad = validateCatalogExpansionPacket(packet);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /quantitative|sourceIds|shortExcerpt|finite/i.test(e)));

  const packet2 = loadPacket();
  packet2.expansionContractVersion = '1.1.0';
  const sid = packet2.sources[0].sourceId;
  packet2.claims = [
    ...packet2.claims,
    {
      claimId: 'q-min-temp-ok',
      field: 'quantitative.minimum_survival_temperature_c',
      status: 'asserted',
      value: 10,
      sourceIds: [sid],
      shortExcerpt: 'Source states survival above 10°C mean monthly minimum.'
    }
  ];
  const ok = validateCatalogExpansionPacket(packet2);
  assert.equal(ok.ok, true, ok.errors.join('; '));
  const m = materializePlantCatalogItemFromPacket(packet2);
  assert.equal(m.ok, true);
  assert.equal(m.item.climateTraits.quantitativeEvidence.minimum_survival_temperature_c, 10);
  assert.ok(m.item.climateTraits.quantitativeProvenance.minimum_survival_temperature_c.sourceIds.includes(sid));
});

test('cacao packet validates and materializes without inventing rainfall mm', () => {
  const packet = loadPacket();
  const v = validateCatalogExpansionPacket(packet);
  assert.equal(v.ok, true, v.errors.join('; '));

  const m = materializePlantCatalogItemFromPacket(packet, {
    plantId: 'plt_k67l32lc8alu82dh',
    updatedAt: '2026-08-29T12:00:00.000Z'
  });
  assert.equal(m.ok, true);
  assert.equal(m.item.slug, 'cacao');
  assert.equal(m.item.scientific, 'Theobroma cacao');
  assert.equal(m.imageStatus, IMAGE_PENDING);
  assert.equal(m.item.media.imageStatus, IMAGE_PENDING);
  assert.ok(!m.item.media.primaryUrl);
  assert.equal(m.item.climateTraits.frostSensitivity, 'high');
  assert.equal(m.item.climateTraits.humidityTolerance, 'high');
  assert.ok(String(m.item.climateTraits.floweringRequirements || '').length > 10);
  assert.ok(String(m.item.climateTraits.fruitingRequirements || '').length > 10);
  assert.equal(m.item.climateTraits.needsReview, true);
  assert.ok(m.unknownFields.includes('rainfallMmAnnual'));
  assert.ok(m.item.source.provider === 'catalog-expansion-v1');
  assert.ok(Array.isArray(m.item.source.provenance));
  assert.ok(m.item.source.provenance.length >= 2);
});

test('pipeline refuses unapproved packet (Owner Review gate)', () => {
  const packet = loadPacket();
  packet.humanApproval = { approvedForIngest: false };
  const v = validateCatalogExpansionPacket(packet);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /approvedForIngest/i.test(e)));
});

test('same pipeline accepts a different plant identifier packet shape', () => {
  const base = loadPacket();
  const other = {
    ...base,
    packetId: 'demo-plant-x-v1',
    identity: {
      canonicalSlug: 'demo-plant-x',
      commonNameEn: 'Demo Plant X',
      acceptedScientificName: 'Demo plantus',
      aliases: ['demo plant x', 'demo plantus']
    },
    humanApproval: { approvedForIngest: true, note: 'shape-only reuse proof' }
  };
  // Keep cacao climate claims (shape reuse) — not a real second ingest.
  const v = validateCatalogExpansionPacket(other);
  assert.equal(v.ok, true, v.errors.join('; '));
  const m = materializePlantCatalogItemFromPacket(other);
  assert.equal(m.ok, true);
  assert.equal(m.item.slug, 'demo-plant-x');
  assert.notEqual(m.item.slug, 'cacao');
});

test('merge refuses duplicate slug unless replaceExisting', () => {
  const packet = loadPacket();
  const m = materializePlantCatalogItemFromPacket(packet);
  const seed = { schemaVersion: 1, plants: [m.item] };
  const dup = mergePlantIntoSeedDocument(seed, m.item, { replaceExisting: false });
  assert.equal(dup.ok, false);
  const ok = mergePlantIntoSeedDocument(seed, m.item, { replaceExisting: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.action, 'replaced');
});
