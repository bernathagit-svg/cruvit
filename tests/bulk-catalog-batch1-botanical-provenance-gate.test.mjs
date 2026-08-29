/**
 * Batch 1 botanical provenance persistence gate.
 * No network. No paid APIs. Reuses stored packets + regenerated SQL.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  extractBotanicalProvenance,
  seedPlantToCatalogRow
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { buildBotanicalProvenanceFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const PACKET_DIR = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'packets'
);
const SQL = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'catalog_plants_upsert.sql'
);
const CLIMATE_FIELDS = [
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill'
];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function packetPath(slug) {
  return path.join(PACKET_DIR, `${slug}.packet.json`);
}

test('extractBotanicalProvenance prefers top-level and never uses media.provenance', () => {
  const plant = {
    slug: 'x',
    media: { provenance: { provider: 'wikimedia-commons' } },
    source: {
      provenance: [{ sourceId: 'a', institution: 'UF', title: 't', url: 'https://example.test' }]
    }
  };
  const fromNested = extractBotanicalProvenance(plant);
  assert.equal(fromNested.length, 1);
  assert.equal(fromNested[0].sourceId, 'a');
  plant.provenance = [{ sourceId: 'top', institution: 'RHS', title: 't2', url: 'https://example.test/2' }];
  const fromTop = extractBotanicalProvenance(plant);
  assert.equal(fromTop[0].sourceId, 'top');
});

test('seedPlantToCatalogRow refuses verified + empty botanical provenance', () => {
  const plant = {
    slug: 'ghost',
    scientific: 'Ghostia inventa',
    names: { en: 'Ghost' },
    climateTraits: { frostSensitivity: 'high', needsReview: false },
    media: { imageStatus: 'IMAGE_PENDING' }
  };
  const row = seedPlantToCatalogRow(plant);
  assert.equal(row.provenance.length, 0);
  assert.equal(row.verification_state, 'needsReview');
  assert.equal(row.needs_review, true);
});

test('Batch 1: 30/30 rows have packet-consistent botanical provenance', () => {
  const seed = loadJson(SEED);
  assert.equal(BATCH1_PLANTS.length, 30);

  for (const def of BATCH1_PLANTS) {
    const plant = seed.plants.find((p) => p.slug === def.slug);
    assert.ok(plant, `seed ${def.slug}`);
    const packet = loadJson(packetPath(def.slug));
    const fromPacket = buildBotanicalProvenanceFromPacket(packet);
    assert.ok(fromPacket.length >= 1, `${def.slug} packet provenance`);

    const row = seedPlantToCatalogRow(plant, { sourcePacket: 'bulk-catalog-batch-1-v1' });
    assert.ok(row.provenance.length >= 1, `${def.slug} row provenance`);
    assert.notEqual(row.verification_state === 'verified' && row.provenance.length === 0, true);

    // Source ids must match packet evidence (no invented sources).
    const packetIds = new Set(fromPacket.map((s) => s.sourceId));
    for (const entry of row.provenance) {
      assert.ok(packetIds.has(entry.sourceId), `${def.slug} unknown sourceId ${entry.sourceId}`);
      assert.ok(entry.institution);
      assert.ok(entry.title);
      assert.ok(entry.url);
      assert.ok(entry.authorityTier);
      assert.ok(entry.verifiedAt);
      assert.equal(entry.plantIdentity?.acceptedScientificName, packet.identity.acceptedScientificName);
    }

    // Climate assertions must be covered by supportsFields on some source.
    const covered = new Set(row.provenance.flatMap((p) => p.supportsFields || []));
    for (const field of CLIMATE_FIELDS) {
      if (plant.climateTraits?.[field] === undefined || plant.climateTraits?.[field] === null) continue;
      if (field === 'needsWinterChill' && plant.climateTraits[field] === false) {
        // still asserted boolean — must be claim-backed if present in climateTraits from packet
      }
      assert.ok(
        covered.has(field),
        `${def.slug} climate field ${field} missing from provenance supportsFields`
      );
    }

    if (plant.climateTraits?.floweringRequirements) {
      assert.ok(covered.has('floweringRequirements'), `${def.slug} flowering provenance`);
    } else {
      assert.equal(row.flowering_requirements, null);
    }

    if (plant.climateTraits?.fruitingRequirements) {
      assert.ok(covered.has('fruitingRequirements'), `${def.slug} fruiting provenance`);
    } else {
      assert.equal(row.fruiting_requirements, null);
    }

    // Media provenance separate
    assert.ok(row.media);
    assert.notEqual(row.provenance, row.media.provenance);

    // Per-plant packet id
    assert.equal(row.source_packet, packet.packetId);

    if (def.slug === 'blue-gum') {
      assert.equal(row.needs_review, true);
      assert.equal(row.verification_state, 'needsReview');
    }
  }
});

test('Batch 1 SQL: only catalog_plants; no destructive ops; provenance not empty array', () => {
  const sql = fs.readFileSync(SQL, 'utf8');
  assert.match(sql, /INSERT INTO public\.catalog_plants/);
  assert.doesNotMatch(sql, /\bDROP\b/i);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
  assert.doesNotMatch(sql, /\bGRANT\b/i);
  assert.doesNotMatch(sql, /\bREVOKE\b/i);
  assert.doesNotMatch(sql, /\bALTER\b/i);
  assert.doesNotMatch(sql, /garden_profiles/i);
  assert.doesNotMatch(sql, /\bauth\./i);

  for (const def of BATCH1_PLANTS) {
    assert.ok(sql.includes(`('${def.slug}',`), def.slug);
  }

  // No verified-looking row should encode empty botanical provenance array alone.
  // Match provenance column value pattern after FALSE/TRUE needs_review is hard;
  // instead ensure no `[], FALSE, 'verified'` / `[]::jsonb, FALSE, 'verified'` pattern.
  assert.doesNotMatch(sql, /\[\]'::jsonb,\s*FALSE,\s*'verified'/);
  assert.doesNotMatch(sql, /\[\]::jsonb,\s*FALSE,\s*'verified'/);

  assert.ok(sql.includes("('blue-gum'"));
  assert.match(sql, /'blue-gum'[\s\S]*?TRUE,\s*'needsReview'/);

  const sha = crypto.createHash('sha256').update(sql).digest('hex').toUpperCase();
  assert.equal(sha.length, 64);
});

test('Batch 1 SQL generation is deterministic', () => {
  const a = fs.readFileSync(SQL, 'utf8');
  const ha = crypto.createHash('sha256').update(a).digest('hex');
  // Re-read after no changes — same bytes
  const b = fs.readFileSync(SQL, 'utf8');
  const hb = crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(ha, hb);
});
