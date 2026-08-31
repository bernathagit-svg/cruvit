#!/usr/bin/env node
/**
 * Batch 2 persistence handoff — generates upsert + verify SQL (NO live write).
 * Fixes:
 *  - flowering_requirements / fruiting_requirements top-level JSONB mirrors
 *  - MATERIAL vs FULL evidence inventory verify
 *  - taxon provenance honesty gate
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BATCH2_PLANTS, BATCH_ID } from '../data/catalog-expansion/batches/bulk-batch-2-v1/definitions.mjs';
import {
  buildEvidenceFirstPacket,
  climateTraitsFromDefAndPacket,
  inventoryFromPackets,
  auditBatch2TaxonProvenance,
  isMaterialEvidenceField,
  annotatePacketFieldProvenance
} from './catalog-batch2-shared.mjs';
import {
  seedPlantToCatalogRow,
  catalogRowToRuntimePlant,
  sqlJsonbLiteral,
  normalizeCatalogRequirementJsonbValue
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { buildBotanicalProvenanceFromPacket } from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';
import { resolveLicensedImageForPlant } from '../modules/catalog-media/wikimedia-commons-source-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFF_DIR = path.join(ROOT, 'data/catalog-expansion/batches/bulk-batch-2-v1/handoff');
const PACKET_DIR = path.join(ROOT, 'data/catalog-expansion/batches/bulk-batch-2-v1/packets');
const CACHE_DIR = path.join(ROOT, 'data/catalog-media/cache');
const OUT_REPORT = path.join(ROOT, 'tests/_batch2-persistence-handoff-report.json');

/** Frozen timestamp for Batch 2 closure artifact stability (Owner live-applied era). */
const BATCH2_HANDOFF_GENERATED_AT = '2026-08-31T10:16:33.796Z';

/** Owner-frozen Batch 2 material suitability inventory (closure gate). */
const FROZEN_MATERIAL = Object.freeze({
  SOURCE_SUPPORTED: 248,
  HEURISTIC_ASSERTION: 71,
  UNKNOWN: 25
});

function sqlText(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function fileCacheStore() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return {
    get(key) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      if (!fs.existsSync(fp)) return null;
      try {
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
      } catch {
        return null;
      }
    },
    set(key, value) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      fs.writeFileSync(fp, JSON.stringify(value, null, 2) + '\n');
    }
  };
}

function materialInventoryFromRows(rows) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const full = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const row of rows) {
    const map = row.climate_traits?.traitEvidenceClasses || {};
    for (const [field, cls] of Object.entries(map)) {
      full[cls] = (full[cls] || 0) + 1;
      if (isMaterialEvidenceField(field)) {
        counts[cls] = (counts[cls] || 0) + 1;
      }
    }
  }
  return { material: counts, full };
}

function roundTripFloweringFruiting(rows) {
  const failures = [];
  for (const row of rows) {
    // Simulate SQL → DB row → runtime
    const floweringSql = sqlJsonbLiteral(row.flowering_requirements);
    const fruitingSql = sqlJsonbLiteral(row.fruiting_requirements);
    // Decode what SQL would store: string → JSONB scalar; null → NULL
    const dbFlowering =
      row.flowering_requirements === null || row.flowering_requirements === undefined
        ? null
        : typeof row.flowering_requirements === 'string'
          ? row.flowering_requirements
          : row.flowering_requirements;
    const dbFruiting =
      row.fruiting_requirements === null || row.fruiting_requirements === undefined
        ? null
        : typeof row.fruiting_requirements === 'string'
          ? row.fruiting_requirements
          : row.fruiting_requirements;

    const simulatedDb = {
      ...row,
      flowering_requirements: dbFlowering,
      fruiting_requirements: dbFruiting
    };
    const runtime = catalogRowToRuntimePlant(simulatedDb);
    const handoffFlower = normalizeCatalogRequirementJsonbValue(
      row.climate_traits?.floweringRequirements ?? null
    );
    const handoffFruit = normalizeCatalogRequirementJsonbValue(
      row.climate_traits?.fruitingRequirements ?? null
    );

    if (row.flowering_requirements !== handoffFlower) {
      failures.push({
        slug: row.slug,
        field: 'flowering_requirements',
        handoffClimate: handoffFlower,
        rowTopLevel: row.flowering_requirements
      });
    }
    if (row.fruiting_requirements !== handoffFruit) {
      failures.push({
        slug: row.slug,
        field: 'fruiting_requirements',
        handoffClimate: handoffFruit,
        rowTopLevel: row.fruiting_requirements
      });
    }
    if ((runtime?.climateTraits?.floweringRequirements ?? runtime?.floweringRequirements) !== handoffFlower &&
        String(runtime?.climateTraits?.floweringRequirements ?? runtime?.floweringRequirements ?? '') !==
          String(handoffFlower ?? '')) {
      // catalogRowToRuntimePlant prefers top-level then climateTraits
      const rtF =
        runtime?.floweringRequirements ??
        runtime?.climateTraits?.floweringRequirements ??
        null;
      if (rtF !== handoffFlower) {
        failures.push({
          slug: row.slug,
          field: 'flowering-runtime',
          expected: handoffFlower,
          got: rtF
        });
      }
    }
    const rtFruit =
      runtime?.fruitingRequirements ?? runtime?.climateTraits?.fruitingRequirements ?? null;
    if (rtFruit !== handoffFruit) {
      failures.push({
        slug: row.slug,
        field: 'fruiting-runtime',
        expected: handoffFruit,
        got: rtFruit
      });
    }

    // SQL must use to_jsonb for strings / NULL for null
    if (handoffFlower !== null && !floweringSql.startsWith('to_jsonb(')) {
      failures.push({ slug: row.slug, field: 'flowering-sql-form', sql: floweringSql });
    }
    if (handoffFlower === null && floweringSql !== 'NULL') {
      failures.push({ slug: row.slug, field: 'flowering-sql-null', sql: floweringSql });
    }
    if (handoffFruit !== null && !fruitingSql.startsWith('to_jsonb(')) {
      failures.push({ slug: row.slug, field: 'fruiting-sql-form', sql: fruitingSql });
    }
    if (handoffFruit === null && fruitingSql !== 'NULL') {
      failures.push({ slug: row.slug, field: 'fruiting-sql-null', sql: fruitingSql });
    }
  }
  return { pass: failures.length === 0, failures };
}

async function main() {
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });

  const taxonMismatches = auditBatch2TaxonProvenance(BATCH2_PLANTS);
  if (taxonMismatches.length) {
    console.error(JSON.stringify({ TAXON_PROVENANCE_MISMATCHES: taxonMismatches }, null, 2));
    process.exit(2);
  }

  const rows = [];
  const slugs = [];

  for (const def of BATCH2_PLANTS) {
    const packetPath = path.join(PACKET_DIR, `${def.slug}.packet.json`);
    if (!fs.existsSync(packetPath)) {
      // Rebuild packet if missing
      const packet = buildEvidenceFirstPacket(def);
      fs.writeFileSync(packetPath, JSON.stringify(packet, null, 2) + '\n');
    }
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    const botanical = buildBotanicalProvenanceFromPacket(packet);
    const resolution = await resolveLicensedImageForPlant(
      { slug: def.slug, scientific: def.scientific, name: def.common, names: { en: def.common } },
      { cacheStore: fileCacheStore(), bypassCache: false }
    );
    const climateTraits = climateTraitsFromDefAndPacket(def, packet);
    const plant = {
      slug: def.slug,
      scientific: def.scientific,
      names: { en: def.common },
      aliases: def.aliases,
      climateTraits,
      media: resolution.media || { imageStatus: 'IMAGE_PENDING' },
      needsReview: !!def.needsReview,
      verificationState: def.needsReview ? 'needsReview' : 'verified',
      provenance: botanical,
      source: { recordId: packet.packetId, provenance: botanical }
    };
    const row = seedPlantToCatalogRow(plant, {
      catalogVersion: '1.0.0',
      sourcePacket: packet.packetId
    });
    if (!row.climate_traits?.traitEvidenceClasses) {
      throw new Error(`${def.slug}: missing traitEvidenceClasses in handoff row`);
    }
    if (!('flowering_requirements' in row) || !('fruiting_requirements' in row)) {
      throw new Error(`${def.slug}: missing flowering/fruiting top-level mirrors`);
    }
    rows.push(row);
    slugs.push(def.slug);
  }

  const inv = materialInventoryFromRows(rows);
  const packetInv = inventoryFromPackets(PACKET_DIR, BATCH2_PLANTS);
  // Prefer packet material inventory as authoritative (matches gate reports)
  const materialExpected = packetInv.materialInventory;
  const fullExpected = packetInv.fullEvidenceMetadataInventory;

  /** Owner-frozen Batch 2 material suitability inventory (closure gate). */
  const materialInventoryMatch =
    materialExpected.SOURCE_SUPPORTED === FROZEN_MATERIAL.SOURCE_SUPPORTED &&
    materialExpected.HEURISTIC_ASSERTION === FROZEN_MATERIAL.HEURISTIC_ASSERTION &&
    materialExpected.UNKNOWN === FROZEN_MATERIAL.UNKNOWN;
  if (!materialInventoryMatch) {
    console.error(
      JSON.stringify(
        {
          MATERIAL_EVIDENCE_INVENTORY_MISMATCH: true,
          expected: FROZEN_MATERIAL,
          actual: materialExpected
        },
        null,
        2
      )
    );
  }

  const roundTrip = roundTripFloweringFruiting(rows);

  const handoff = {
    handoffId: 'bulk-batch-2-v1-persistence-handoff',
    batchId: BATCH_ID,
    generatedAt: BATCH2_HANDOFF_GENERATED_AT,
    plantCount: rows.length,
    rows,
    materialSuitabilityEvidenceInventory: materialExpected,
    fullEvidenceMetadataInventory: fullExpected,
    taxonProvenanceMismatches: taxonMismatches,
    floweringFruitingRoundTrip: roundTrip.pass ? 'PASS' : 'FAIL',
    rule: 'EVERY canonical plant persists evidence metadata + flowering/fruiting mirrors from evidence-first ingest'
  };
  const handoffPath = path.join(HANDOFF_DIR, 'catalog_plants_batch2_handoff.json');
  fs.writeFileSync(handoffPath, JSON.stringify(handoff, null, 2) + '\n');
  const handoffSha = crypto.createHash('sha256').update(fs.readFileSync(handoffPath)).digest('hex');
  fs.writeFileSync(
    path.join(HANDOFF_DIR, 'catalog_plants_batch2_handoff.sha256'),
    `${handoffSha}  catalog_plants_batch2_handoff.json\n`
  );

  const slugList = slugs.map((s) => `'${s}'`).join(', ');
  const ss = FROZEN_MATERIAL.SOURCE_SUPPORTED;
  const h = FROZEN_MATERIAL.HEURISTIC_ASSERTION;
  const u = FROZEN_MATERIAL.UNKNOWN;

  const upsertBlocks = rows.map((row) => {
    const ct = sqlJsonbLiteral(row.climate_traits);
    const cn = sqlJsonbLiteral(row.common_names);
    const al = sqlJsonbLiteral(row.aliases);
    const pr = sqlJsonbLiteral(row.provenance);
    const md = sqlJsonbLiteral(row.media);
    const fl = sqlJsonbLiteral(row.flowering_requirements);
    const fr = sqlJsonbLiteral(row.fruiting_requirements);
    return `-- ${row.slug}
INSERT INTO public.catalog_plants (
  slug, scientific_name, common_names, aliases, climate_traits,
  flowering_requirements, fruiting_requirements,
  media, media_status,
  needs_review, verification_state, provenance, source_packet, catalog_version
) VALUES (
  ${sqlText(row.slug)},
  ${sqlText(row.scientific_name)},
  ${cn},
  ${al},
  ${ct},
  ${fl},
  ${fr},
  ${md},
  ${sqlText(row.media_status)},
  ${row.needs_review ? 'true' : 'false'},
  ${sqlText(row.verification_state)},
  ${pr},
  ${sqlText(row.source_packet)},
  ${sqlText(row.catalog_version)}
)
ON CONFLICT (slug) DO UPDATE SET
  scientific_name = EXCLUDED.scientific_name,
  common_names = EXCLUDED.common_names,
  aliases = EXCLUDED.aliases,
  climate_traits = EXCLUDED.climate_traits,
  flowering_requirements = EXCLUDED.flowering_requirements,
  fruiting_requirements = EXCLUDED.fruiting_requirements,
  media = EXCLUDED.media,
  media_status = EXCLUDED.media_status,
  needs_review = EXCLUDED.needs_review,
  verification_state = EXCLUDED.verification_state,
  provenance = EXCLUDED.provenance,
  source_packet = EXCLUDED.source_packet,
  catalog_version = EXCLUDED.catalog_version;`;
  });

  const upsertSql = `-- CRUVIT Batch 2 catalog_plants upsert (evidence-first ingest)
-- Generated: ${BATCH2_HANDOFF_GENERATED_AT}
-- Batch: ${BATCH_ID}
-- Plants: ${rows.length}
-- Handoff SHA256: ${handoffSha}
-- Includes flowering_requirements + fruiting_requirements JSONB mirrors
-- NO LIVE WRITE in generator — Owner applies manually.

BEGIN;

${upsertBlocks.join('\n\n')}

COMMIT;
`;
  const upsertPath = path.join(HANDOFF_DIR, 'catalog_plants_batch2_upsert.sql');
  fs.writeFileSync(upsertPath, upsertSql);

  const verifySql = `-- CRUVIT Batch 2 persistence verify
-- Metric A: FULL_EVIDENCE_METADATA_COUNT = all traitEvidenceClasses keys
-- Metric B: MATERIAL_SUITABILITY_EVIDENCE_COUNT = core traits + quantitative.* + reproductive.*
-- Material inventory frozen: SOURCE_SUPPORTED=${ss}, HEURISTIC_ASSERTION=${h}, UNKNOWN=${u}

WITH batch2 AS (
  SELECT
    slug,
    scientific_name,
    climate_traits,
    flowering_requirements,
    fruiting_requirements,
    media_status,
    media,
    source_packet
  FROM public.catalog_plants
  WHERE slug IN (${slugList})
),
counts AS (
  SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (
      WHERE climate_traits->'traitEvidenceClasses' IS NOT NULL
        AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
        AND climate_traits->'traitEvidenceClasses' != '{}'::jsonb
    ) AS rows_with_trait_evidence_classes,
    COUNT(*) FILTER (WHERE media_status = 'IMAGE_READY') AS image_ready,
    COUNT(*) FILTER (WHERE source_packet IS NULL OR btrim(source_packet) = '') AS missing_source_packet,
    COUNT(*) FILTER (WHERE media IS NULL OR media = '{}'::jsonb) AS missing_media,
    COUNT(*) FILTER (
      WHERE flowering_requirements IS NULL
        AND (climate_traits->>'floweringRequirements') IS NOT NULL
        AND btrim(climate_traits->>'floweringRequirements') <> ''
    ) AS flowering_mirror_missing,
    COUNT(*) FILTER (
      WHERE fruiting_requirements IS NULL
        AND (climate_traits->>'fruitingRequirements') IS NOT NULL
        AND btrim(climate_traits->>'fruitingRequirements') <> ''
    ) AS fruiting_mirror_missing
  FROM batch2
),
dup_slug AS (
  SELECT COUNT(*) AS duplicate_slugs
  FROM (
    SELECT slug FROM batch2 GROUP BY slug HAVING COUNT(*) > 1
  ) d
),
dup_sci AS (
  SELECT COUNT(*) AS duplicate_scientific_identities
  FROM (
    SELECT lower(scientific_name) AS sci
    FROM batch2
    WHERE scientific_name IS NOT NULL
    GROUP BY lower(scientific_name)
    HAVING COUNT(*) > 1
  ) d
),
kv AS (
  SELECT b.slug, e.key AS field, e.value AS evidence_class
  FROM batch2 b
  CROSS JOIN LATERAL jsonb_each_text(b.climate_traits->'traitEvidenceClasses') e
),
full_inventory AS (
  SELECT
    COUNT(*) FILTER (WHERE evidence_class = 'SOURCE_SUPPORTED') AS source_supported,
    COUNT(*) FILTER (WHERE evidence_class = 'HEURISTIC_ASSERTION') AS heuristic_assertion,
    COUNT(*) FILTER (WHERE evidence_class = 'UNKNOWN') AS unknown_count
  FROM kv
),
material_inventory AS (
  SELECT
    COUNT(*) FILTER (WHERE evidence_class = 'SOURCE_SUPPORTED') AS source_supported,
    COUNT(*) FILTER (WHERE evidence_class = 'HEURISTIC_ASSERTION') AS heuristic_assertion,
    COUNT(*) FILTER (WHERE evidence_class = 'UNKNOWN') AS unknown_count
  FROM kv
  WHERE field IN (
      'frostSensitivity','coldTolerance','heatTolerance','humidityTolerance',
      'waterNeeds','sunNeeds','drainageNeeds','needsWinterChill',
      'floweringRequirements','fruitingRequirements'
    )
    OR field LIKE 'quantitative.%'
    OR field LIKE 'reproductive.%'
)
SELECT
  c.total_rows,
  c.rows_with_trait_evidence_classes,
  c.image_ready,
  c.missing_source_packet,
  c.missing_media,
  c.flowering_mirror_missing,
  c.fruiting_mirror_missing,
  d.duplicate_slugs,
  s.duplicate_scientific_identities,
  f.source_supported AS full_source_supported,
  f.heuristic_assertion AS full_heuristic_assertion,
  f.unknown_count AS full_unknown,
  m.source_supported AS material_source_supported,
  m.heuristic_assertion AS material_heuristic_assertion,
  m.unknown_count AS material_unknown,
  CASE
    WHEN c.total_rows = ${rows.length}
      AND c.rows_with_trait_evidence_classes = ${rows.length}
      AND c.image_ready = ${rows.length}
      AND c.missing_source_packet = 0
      AND c.missing_media = 0
      AND c.flowering_mirror_missing = 0
      AND c.fruiting_mirror_missing = 0
      AND d.duplicate_slugs = 0
      AND s.duplicate_scientific_identities = 0
      AND m.source_supported = ${ss}
      AND m.heuristic_assertion = ${h}
      AND m.unknown_count = ${u}
    THEN 'PASS'
    ELSE 'FAIL'
  END AS batch2_persistence_verify_gate
FROM counts c, dup_slug d, dup_sci s, full_inventory f, material_inventory m;
`;
  const verifyPath = path.join(HANDOFF_DIR, 'catalog_plants_batch2_verify.sql');
  fs.writeFileSync(verifyPath, verifySql);

  const upsertIncludesMirrors =
    upsertSql.includes('flowering_requirements') &&
    upsertSql.includes('fruiting_requirements') &&
    !/INSERT INTO public\.catalog_plants \(\s*slug, scientific_name, common_names, aliases, climate_traits, media/.test(
      upsertSql
    );

  const pass =
    rows.length === 30 &&
    taxonMismatches.length === 0 &&
    roundTrip.pass &&
    upsertIncludesMirrors &&
    materialInventoryMatch &&
    rows.every((r) => r.climate_traits?.traitEvidenceClasses) &&
    rows.every((r) => r.media_status === 'IMAGE_READY');

  const report = {
    generatedAt: BATCH2_HANDOFF_GENERATED_AT,
    batchId: BATCH_ID,
    handoffPath,
    handoffSha256: handoffSha,
    upsertPath,
    verifyPath,
    plantCount: rows.length,
    allHaveTraitEvidenceClasses: rows.every((r) => r.climate_traits?.traitEvidenceClasses),
    floweringFruitingRoundTrip: roundTrip.pass ? 'PASS' : 'FAIL',
    floweringFruitingFailures: roundTrip.failures,
    upsertIncludesFloweringFruitingMirrors: upsertIncludesMirrors,
    materialSuitabilityEvidenceInventory: materialExpected,
    frozenMaterialInventoryRequired: FROZEN_MATERIAL,
    materialInventoryMatch,
    fullEvidenceMetadataInventory: fullExpected,
    rowMaterialInventory: inv.material,
    taxonProvenanceMismatches: taxonMismatches,
    TAXON_PROVENANCE_MISMATCHES: taxonMismatches.length,
    IMAGE_READY: rows.filter((r) => r.media_status === 'IMAGE_READY').length,
    ownerAcceptedLiveHandoffSha:
      '87b2a7e10a2a972612592e14c2135d04df502aaab33e61fc35968c975970fd3a',
    readyForLivePersistenceReview: pass,
    verdict: pass
      ? 'CRUVIT_BATCH_2_FINAL_PERSISTENCE_REVIEW: PASS'
      : 'CRUVIT_BATCH_2_FINAL_PERSISTENCE_REVIEW: FAIL'
  };
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
