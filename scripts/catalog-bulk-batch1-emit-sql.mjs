#!/usr/bin/env node
/**
 * Emit Owner-applied SQL upsert for Batch 1 → public.catalog_plants.
 * Reuses stored expansion packets for botanical provenance (no web research).
 * Does NOT live-upsert. No paid APIs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { seedPlantToCatalogRow, sqlJsonbLiteral } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { buildBotanicalProvenanceFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { BATCH1_PLANTS, BATCH_ID } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';

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
const OUT = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'catalog_plants_upsert.sql'
);

function sqlJson(v) {
  return sqlJsonbLiteral(v);
}

function sqlText(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function loadPacket(slug) {
  const fp = path.join(PACKET_DIR, `${slug}.packet.json`);
  if (!fs.existsSync(fp)) throw new Error(`missing packet: ${fp}`);
  return JSON.parse(fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, ''));
}

function syncSeedProvenanceFromPackets(seed) {
  let updated = 0;
  for (const def of BATCH1_PLANTS) {
    const plant = (seed.plants || []).find((p) => p.slug === def.slug);
    if (!plant) throw new Error(`seed missing ${def.slug}`);
    const packet = loadPacket(def.slug);
    const botanical = buildBotanicalProvenanceFromPacket(packet);
    if (!botanical.length) {
      throw new Error(`packet ${def.slug} has empty botanical provenance`);
    }
    plant.provenance = botanical;
    if (!plant.source || typeof plant.source !== 'object') plant.source = {};
    plant.source.recordId = packet.packetId;
    plant.source.provenance = botanical;
    // Keep blue-gum review flags; do not promote.
    if (def.slug === 'blue-gum' || def.needsReview) {
      plant.climateTraits = { ...(plant.climateTraits || {}), needsReview: true };
      plant.qualityTier = 'needs_review';
      if (plant.verification && typeof plant.verification === 'object') {
        plant.verification.needsReview = true;
      }
    }
    updated += 1;
  }
  return updated;
}

function assertRowProvenanceGate(row, plant) {
  if (!Array.isArray(row.provenance) || row.provenance.length < 1) {
    throw new Error(`${row.slug}: empty botanical provenance`);
  }
  if (row.verification_state === 'verified' && row.provenance.length < 1) {
    throw new Error(`${row.slug}: verified with empty provenance`);
  }
  // Media provenance must remain separate
  if (row.media?.provenance && row.provenance === row.media.provenance) {
    throw new Error(`${row.slug}: botanical provenance aliased to media provenance`);
  }
  const packetId = plant.source?.recordId;
  if (!packetId || row.source_packet !== packetId) {
    throw new Error(
      `${row.slug}: source_packet must be per-plant packetId (${packetId}), got ${row.source_packet}`
    );
  }
  if (row.slug === 'blue-gum') {
    if (row.needs_review !== true || row.verification_state !== 'needsReview') {
      throw new Error('blue-gum must remain needsReview');
    }
  }
}

const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
const synced = syncSeedProvenanceFromPackets(seed);
fs.writeFileSync(SEED, `${JSON.stringify(seed, null, 2)}\n`);

const rows = BATCH1_PLANTS.map((d) => {
  const p = seed.plants.find((x) => x.slug === d.slug);
  if (!p) throw new Error(`missing ${d.slug}`);
  const row = seedPlantToCatalogRow(p, {
    catalogVersion: '1.0.0',
    // Pass batch label only as fallback; mapper prefers plant.source.recordId.
    sourcePacket: BATCH_ID
  });
  assertRowProvenanceGate(row, p);
  return row;
});

const verifiedEmpty = rows.filter(
  (r) => r.verification_state === 'verified' && (!r.provenance || r.provenance.length === 0)
);
if (verifiedEmpty.length) {
  throw new Error(`verified+empty provenance: ${verifiedEmpty.map((r) => r.slug).join(',')}`);
}

const values = rows
  .map((r) => {
    return `(${[
      sqlText(r.slug),
      sqlText(r.scientific_name),
      sqlJson(r.common_names),
      sqlJson(r.aliases),
      sqlJson(r.climate_traits),
      // Live schema: flowering_requirements / fruiting_requirements are jsonb.
      sqlJsonbLiteral(r.flowering_requirements),
      sqlJsonbLiteral(r.fruiting_requirements),
      sqlJson(r.provenance),
      r.needs_review ? 'TRUE' : 'FALSE',
      sqlText(r.verification_state),
      sqlJson(r.media),
      sqlText(r.media_status),
      sqlText(r.catalog_version),
      sqlText(r.source_packet)
    ].join(', ')})`;
  })
  .join(',\n');

const sql = `-- CRUVIT Bulk Catalog Batch 1 — catalog_plants upsert
-- Idempotent on slug. Botanical provenance from expansion packets (not media).
-- flowering_requirements / fruiting_requirements are jsonb → prose via to_jsonb(text).
-- Apply via Supabase SQL Editor (service role) OR:
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/catalog-plants-upsert-batch.mjs --batch=bulk-batch-1-v1
-- DO NOT live-upsert until Owner JSONB serialization + provenance gates PASS.
INSERT INTO public.catalog_plants (
  slug, scientific_name, common_names, aliases, climate_traits,
  flowering_requirements, fruiting_requirements, provenance,
  needs_review, verification_state, media, media_status,
  catalog_version, source_packet
) VALUES
${values}
ON CONFLICT (slug) DO UPDATE SET
  scientific_name = EXCLUDED.scientific_name,
  common_names = EXCLUDED.common_names,
  aliases = EXCLUDED.aliases,
  climate_traits = EXCLUDED.climate_traits,
  flowering_requirements = EXCLUDED.flowering_requirements,
  fruiting_requirements = EXCLUDED.fruiting_requirements,
  provenance = EXCLUDED.provenance,
  needs_review = EXCLUDED.needs_review,
  verification_state = EXCLUDED.verification_state,
  media = EXCLUDED.media,
  media_status = EXCLUDED.media_status,
  catalog_version = EXCLUDED.catalog_version,
  source_packet = EXCLUDED.source_packet,
  updated_at = now();
`;

fs.writeFileSync(OUT, sql);
const sha256 = crypto.createHash('sha256').update(sql).digest('hex').toUpperCase();

console.log(
  JSON.stringify(
    {
      out: OUT,
      syncedSeedPlants: synced,
      rows: rows.length,
      bytes: Buffer.byteLength(sql),
      sha256,
      IMAGE_READY: rows.filter((r) => r.media_status === 'IMAGE_READY').length,
      needs_review: rows.filter((r) => r.needs_review).map((r) => r.slug),
      verified: rows.filter((r) => r.verification_state === 'verified').length,
      emptyProvenance: rows.filter((r) => !r.provenance?.length).length,
      sampleProvenance: rows[0]?.provenance?.[0]
        ? {
            slug: rows[0].slug,
            sourceId: rows[0].provenance[0].sourceId,
            supportsFields: rows[0].provenance[0].supportsFields,
            source_packet: rows[0].source_packet
          }
        : null
    },
    null,
    2
  )
);
