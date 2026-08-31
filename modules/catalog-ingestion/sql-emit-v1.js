/**
 * Deterministic SQL emission for Scalable Catalog Ingestion V1.
 * Owner-applied handoff only — scripts do not live-write.
 */

import { sqlJsonbLiteral } from '../catalog/canonical-catalog-persistence-contract-v1.js';
import {
  ALLOWED_TARGET_TABLE,
  chunkArray,
  estimateDbExecutionCalls,
  DEFAULT_CHUNK_SIZE
} from './catalog-ingestion-v1-contract.js';
import { resolveIngestionMode } from './ingestion-modes-v1.js';

function sqlText(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlBool(v) {
  return v ? 'true' : 'false';
}

/**
 * Emit atomic bulk SQL for a sealed handoff.
 */
export function emitAtomicBulkSql({
  manifest,
  plants,
  contentSha256,
  chunkSize = DEFAULT_CHUNK_SIZE
} = {}) {
  const modeRes = resolveIngestionMode(manifest.mode);
  if (!modeRes.ok) throw new Error(modeRes.error);
  const mode = modeRes.mode;
  const size = Number(manifest.chunkSize) || chunkSize || DEFAULT_CHUNK_SIZE;
  const chunks = chunkArray(plants, size);
  const dbCalls = estimateDbExecutionCalls(plants.length, size);

  let body;
  if (mode.writeStrategy === 'COALESCE_JSONB_MERGE_PLANT_KNOWLEDGE') {
    body = emitKnowledgeEnrichmentSql(chunks, manifest, contentSha256);
  } else if (mode.writeStrategy === 'COLUMN_REPLACE_MEDIA_ONLY') {
    body = emitMediaEnrichmentSql(chunks, manifest, contentSha256);
  } else if (
    mode.writeStrategy === 'INSERT_ON_CONFLICT_DO_NOTHING_OR_FAIL' ||
    mode.writeStrategy === 'OWNER_DECLARED_UPSERT'
  ) {
    body = emitNewPlantBatchSql(chunks, manifest, contentSha256, mode);
  } else if (mode.writeStrategy === 'COALESCE_JSONB_MERGE_DECLARED_PATHS') {
    body = emitBotanicalEnrichmentSql(chunks, manifest, contentSha256);
  } else {
    throw new Error(`unsupported writeStrategy: ${mode.writeStrategy}`);
  }

  const sql = `-- CRUVIT Scalable Catalog Ingestion V1
-- mode=${manifest.mode}
-- batchId=${manifest.batchId}
-- plantCount=${manifest.plantCount}
-- contentSha256=${contentSha256}
-- chunking=${chunks.length} x ~${size} inside ONE transaction
-- liveWrite=false (Owner applies after review)
-- target=${ALLOWED_TARGET_TABLE}

BEGIN;

-- Preconditions
DO $$
BEGIN
  IF '${contentSha256}' IS NULL OR length('${contentSha256}') <> 64 THEN
    RAISE EXCEPTION 'CRUVIT ingest aborted: invalid handoff SHA';
  END IF;
END
$$;

${body}

-- Post-write invariant: affected target count
DO $$
DECLARE
  n int;
BEGIN
  SELECT COUNT(*) INTO n
  FROM ${ALLOWED_TARGET_TABLE}
  WHERE slug IN (${plants.map((p) => sqlText(p.slug)).join(', ')});
  IF n <> ${plants.length} THEN
    RAISE EXCEPTION 'CRUVIT ingest aborted: target row count % <> expected %', n, ${plants.length};
  END IF;
END
$$;

COMMIT;
`;

  const verifySql = emitVerifySql(manifest, plants, contentSha256);

  return {
    upsertSql: sql,
    verifySql,
    chunkCount: chunks.length,
    dbExecutionCalls: dbCalls,
    payloadBytes: Buffer.byteLength(sql, 'utf8')
  };
}

function emitNewPlantBatchSql(chunks, manifest, contentSha256, mode) {
  const parts = [];
  parts.push(`-- NEW plant batch (collision must be preflight-cleared; no silent overwrite)`);
  chunks.forEach((chunk, idx) => {
    const values = chunk
      .map((p) => {
        const ct = p.climate_traits || p.climateTraits || {};
        return `(${[
          sqlText(p.slug),
          sqlText(p.scientific_name || p.scientific),
          sqlJsonbLiteral(p.common_names || p.commonNames || {}),
          sqlJsonbLiteral(p.aliases || []),
          sqlJsonbLiteral(ct),
          sqlJsonbLiteral(p.flowering_requirements ?? ct.floweringRequirements ?? null),
          sqlJsonbLiteral(p.fruiting_requirements ?? ct.fruitingRequirements ?? null),
          sqlJsonbLiteral(p.media || {}),
          sqlText(p.media_status || p.mediaStatus || 'IMAGE_PENDING'),
          sqlJsonbLiteral(p.provenance || []),
          sqlBool(Boolean(p.needs_review || p.needsReview)),
          sqlText(p.verification_state || p.verificationState || 'verified'),
          sqlText(p.catalog_version || p.catalogVersion || '1.0.0'),
          sqlText(p.source_packet || p.sourcePacket || null)
        ].join(', ')})`;
      })
      .join(',\n');

    // INSERT only — ON CONFLICT DO NOTHING then verify count; if conflict slipped preflight, verify fails → ROLLBACK
    parts.push(`-- chunk ${idx + 1}/${chunks.length}
INSERT INTO ${ALLOWED_TARGET_TABLE} (
  slug, scientific_name, common_names, aliases, climate_traits,
  flowering_requirements, fruiting_requirements, media, media_status,
  provenance, needs_review, verification_state, catalog_version, source_packet
) VALUES
${values}
ON CONFLICT (slug) DO NOTHING;`);
  });

  // For NEW_PLANT_BATCH, refuse if any slug already existed (insert count check via exception)
  if (mode.mode === 'NEW_PLANT_BATCH') {
    parts.push(`DO $$
DECLARE
  missing int;
BEGIN
  SELECT COUNT(*) INTO missing
  FROM (VALUES ${manifest.expectedSlugs.map((s) => `(${sqlText(s)})`).join(', ')}) AS v(slug)
  WHERE NOT EXISTS (SELECT 1 FROM ${ALLOWED_TARGET_TABLE} c WHERE c.slug = v.slug);
  IF missing > 0 THEN
    RAISE EXCEPTION 'CRUVIT ingest aborted: % target slugs missing after INSERT (possible conflict/silent skip)', missing;
  END IF;
END
$$;`);
  }

  parts.push(`-- batch metadata echo (comment): batchId=${manifest.batchId} sha=${contentSha256}`);
  return parts.join('\n\n');
}

function emitKnowledgeEnrichmentSql(chunks, manifest, contentSha256) {
  const parts = [`-- KNOWLEDGE_ENRICHMENT non-destructive plantKnowledge merge`];
  chunks.forEach((chunk, idx) => {
    const values = chunk
      .map((p) => {
        const pk =
          p.plantKnowledge ||
          (p.climate_traits || p.climateTraits || {}).plantKnowledge;
        return `(${sqlText(p.slug)}, ${sqlJsonbLiteral(pk)})`;
      })
      .join(',\n');
    parts.push(`-- chunk ${idx + 1}/${chunks.length}
UPDATE ${ALLOWED_TARGET_TABLE} AS c
SET
  climate_traits = COALESCE(c.climate_traits, '{}'::jsonb) || jsonb_build_object('plantKnowledge', v.plant_knowledge),
  updated_at = now()
FROM (VALUES
${values}
) AS v(slug, plant_knowledge)
WHERE c.slug = v.slug;`);
  });
  parts.push(`-- batchId=${manifest.batchId} sha=${contentSha256}`);
  return parts.join('\n\n');
}

function emitMediaEnrichmentSql(chunks, manifest, contentSha256) {
  const parts = [`-- MEDIA_ENRICHMENT`];
  chunks.forEach((chunk, idx) => {
    const values = chunk
      .map(
        (p) =>
          `(${sqlText(p.slug)}, ${sqlJsonbLiteral(p.media || {})}, ${sqlText(
            p.media_status || p.mediaStatus || 'IMAGE_PENDING'
          )})`
      )
      .join(',\n');
    parts.push(`-- chunk ${idx + 1}/${chunks.length}
UPDATE ${ALLOWED_TARGET_TABLE} AS c
SET
  media = v.media,
  media_status = v.media_status,
  updated_at = now()
FROM (VALUES
${values}
) AS v(slug, media, media_status)
WHERE c.slug = v.slug;`);
  });
  parts.push(`-- batchId=${manifest.batchId} sha=${contentSha256}`);
  return parts.join('\n\n');
}

function emitBotanicalEnrichmentSql(chunks, manifest, contentSha256) {
  const parts = [`-- BOTANICAL_EVIDENCE_ENRICHMENT COALESCE merge of climate_traits patch`];
  chunks.forEach((chunk, idx) => {
    const values = chunk
      .map((p) => {
        const ct = p.climate_traits || p.climateTraits || {};
        // Patch object only — caller must supply declared paths only
        const patch = p.climateTraitsPatch || ct;
        return `(${sqlText(p.slug)}, ${sqlJsonbLiteral(patch)}, ${sqlJsonbLiteral(
          p.flowering_requirements ?? null
        )}, ${sqlJsonbLiteral(p.fruiting_requirements ?? null)})`;
      })
      .join(',\n');
    parts.push(`-- chunk ${idx + 1}/${chunks.length}
UPDATE ${ALLOWED_TARGET_TABLE} AS c
SET
  climate_traits = COALESCE(c.climate_traits, '{}'::jsonb) || v.patch,
  flowering_requirements = COALESCE(v.flowering_requirements, c.flowering_requirements),
  fruiting_requirements = COALESCE(v.fruiting_requirements, c.fruiting_requirements),
  updated_at = now()
FROM (VALUES
${values}
) AS v(slug, patch, flowering_requirements, fruiting_requirements)
WHERE c.slug = v.slug;`);
  });
  parts.push(`-- batchId=${manifest.batchId} sha=${contentSha256}`);
  return parts.join('\n\n');
}

function emitVerifySql(manifest, plants, contentSha256) {
  const list = plants.map((p) => sqlText(p.slug)).join(', ');
  return `-- CRUVIT Scalable Catalog Ingestion V1 — POST-WRITE VERIFY
-- batchId=${manifest.batchId}
-- contentSha256=${contentSha256}
-- plantCount=${plants.length}

SELECT COUNT(*) AS target_rows
FROM ${ALLOWED_TARGET_TABLE}
WHERE slug IN (${list});

SELECT slug, COUNT(*) AS c
FROM ${ALLOWED_TARGET_TABLE}
GROUP BY slug
HAVING COUNT(*) > 1;

SELECT lower(scientific_name) AS sci, COUNT(*) AS c
FROM ${ALLOWED_TARGET_TABLE}
GROUP BY lower(scientific_name)
HAVING COUNT(*) > 1;

SELECT
  COUNT(*) FILTER (WHERE needs_review) AS needs_review_count,
  COUNT(*) FILTER (WHERE media_status = 'IMAGE_READY') AS image_ready,
  COUNT(*) FILTER (WHERE climate_traits ? 'traitEvidenceClasses') AS with_evidence,
  COUNT(*) FILTER (WHERE climate_traits ? 'plantKnowledge') AS with_knowledge
FROM ${ALLOWED_TARGET_TABLE}
WHERE slug IN (${list});
`;
}
