/**
 * In-memory catalog simulation for atomic bulk ingest proofs.
 * Proves ALL-OR-NOTHING without live Supabase.
 */

import { chunkArray, DEFAULT_CHUNK_SIZE, stableStringify, sha256Hex } from './catalog-ingestion-v1-contract.js';
import { resolveIngestionMode } from './ingestion-modes-v1.js';
import { runPostWriteVerify } from './preflight-v1.js';

/**
 * Create a mutable in-memory catalog from baseline rows.
 */
export function createSimulatedCatalog(baselineRows = []) {
  const rows = new Map();
  for (const r of baselineRows) {
    rows.set(r.slug, structuredClone(r));
  }
  return {
    rows,
    snapshot() {
      return new Map([...rows.entries()].map(([k, v]) => [k, structuredClone(v)]));
    },
    restore(snap) {
      rows.clear();
      for (const [k, v] of snap.entries()) rows.set(k, structuredClone(v));
    },
    checksumExcludingPlantKnowledge() {
      const payload = [...rows.values()]
        .map((r) => {
          const ct = { ...(r.climate_traits || {}) };
          delete ct.plantKnowledge;
          return {
            slug: r.slug,
            scientific_name: r.scientific_name,
            climate_traits: ct,
            media: r.media,
            media_status: r.media_status,
            verification_state: r.verification_state,
            needs_review: r.needs_review,
            source_packet: r.source_packet
          };
        })
        .sort((a, b) => a.slug.localeCompare(b.slug));
      return sha256Hex(Buffer.from(stableStringify(payload), 'utf8'));
    }
  };
}

/**
 * Simulate atomic bulk apply. On any failure, restore snapshot (ROLLBACK).
 */
export function simulateAtomicBulkApply({
  catalog,
  manifest,
  plants,
  preflightOk,
  injectFailure = null,
  chunkSize = DEFAULT_CHUNK_SIZE
} = {}) {
  if (!preflightOk) {
    return {
      ok: false,
      rolledBack: true,
      reason: 'preflight blocked persistence',
      dbExecutionCalls: 0,
      changed: false
    };
  }

  const modeRes = resolveIngestionMode(manifest.mode);
  if (!modeRes.ok) {
    return { ok: false, rolledBack: true, reason: modeRes.error, dbExecutionCalls: 0, changed: false };
  }
  const mode = modeRes.mode;
  const size = Number(manifest.chunkSize) || chunkSize;
  const chunks = chunkArray(plants, size);
  const before = catalog.snapshot();
  const preChecksum = catalog.checksumExcludingPlantKnowledge();

  let statements = 1; // BEGIN
  try {
    for (let i = 0; i < chunks.length; i++) {
      statements += 1; // DML chunk
      if (injectFailure === `chunk:${i}`) {
        throw new Error(`injected failure at chunk ${i}`);
      }
      applyChunk(catalog, chunks[i], mode, injectFailure);
    }

    statements += 1; // verify
    const verify = runPostWriteVerify({
      expectedSlugs: manifest.expectedSlugs,
      catalogRows: [...catalog.rows.values()],
      preChecksum,
      postChecksumExcludingKnowledge: catalog.checksumExcludingPlantKnowledge(),
      mode: mode.mode
    });
    if (!verify.ok) throw new Error(`post-write verify failed: ${verify.errors.join('; ')}`);

    if (injectFailure === 'before-commit') {
      throw new Error('injected failure before commit');
    }

    statements += 1; // COMMIT
    return {
      ok: true,
      rolledBack: false,
      reason: null,
      dbExecutionCalls: statements,
      chunkCount: chunks.length,
      changed: true,
      verify,
      postChecksumExcludingKnowledge: catalog.checksumExcludingPlantKnowledge(),
      preChecksum
    };
  } catch (err) {
    catalog.restore(before);
    statements += 1; // ROLLBACK
    return {
      ok: false,
      rolledBack: true,
      reason: String(err.message || err),
      dbExecutionCalls: statements,
      chunkCount: chunks.length,
      changed: false,
      catalogUnchanged: catalog.checksumExcludingPlantKnowledge() === preChecksum
    };
  }
}

function applyChunk(catalog, chunk, mode, injectFailure) {
  for (const p of chunk) {
    if (injectFailure === `plant:${p.slug}`) {
      throw new Error(`injected failure at plant ${p.slug}`);
    }
    if (mode.mode === 'NEW_PLANT_BATCH') {
      if (catalog.rows.has(p.slug)) {
        throw new Error(`conflict on existing slug ${p.slug}`);
      }
      catalog.rows.set(p.slug, normalizeRow(p));
    } else if (mode.mode === 'KNOWLEDGE_ENRICHMENT') {
      const existing = catalog.rows.get(p.slug);
      if (!existing) throw new Error(`missing existing slug ${p.slug}`);
      const ct = { ...(existing.climate_traits || {}) };
      const pk =
        p.plantKnowledge ||
        (p.climate_traits || p.climateTraits || {}).plantKnowledge;
      ct.plantKnowledge = structuredClone(pk);
      existing.climate_traits = ct;
      existing.updated_at = 'simulated';
    } else if (mode.mode === 'MEDIA_ENRICHMENT') {
      const existing = catalog.rows.get(p.slug);
      if (!existing) throw new Error(`missing existing slug ${p.slug}`);
      existing.media = structuredClone(p.media || {});
      existing.media_status = p.media_status || p.mediaStatus || existing.media_status;
      existing.updated_at = 'simulated';
    } else if (mode.mode === 'BOTANICAL_EVIDENCE_ENRICHMENT') {
      const existing = catalog.rows.get(p.slug);
      if (!existing) throw new Error(`missing existing slug ${p.slug}`);
      const patch = p.climateTraitsPatch || p.climate_traits || p.climateTraits || {};
      existing.climate_traits = { ...(existing.climate_traits || {}), ...structuredClone(patch) };
      if (p.flowering_requirements != null) existing.flowering_requirements = p.flowering_requirements;
      if (p.fruiting_requirements != null) existing.fruiting_requirements = p.fruiting_requirements;
      existing.updated_at = 'simulated';
    } else if (mode.mode === 'OWNER_APPROVED_CANONICAL_CORRECTION') {
      const existing = catalog.rows.get(p.slug);
      if (!existing) throw new Error(`missing existing slug ${p.slug}`);
      Object.assign(existing, normalizeRow({ ...existing, ...p }));
    } else {
      throw new Error(`unsupported mode ${mode.mode}`);
    }
  }
}

function normalizeRow(p) {
  const ct = structuredClone(p.climate_traits || p.climateTraits || {});
  return {
    slug: p.slug,
    scientific_name: p.scientific_name || p.scientific,
    common_names: p.common_names || p.commonNames || {},
    aliases: p.aliases || [],
    climate_traits: ct,
    flowering_requirements: p.flowering_requirements ?? ct.floweringRequirements ?? null,
    fruiting_requirements: p.fruiting_requirements ?? ct.fruitingRequirements ?? null,
    media: p.media || {},
    media_status: p.media_status || p.mediaStatus || 'IMAGE_PENDING',
    provenance: p.provenance || [],
    needs_review: Boolean(p.needs_review || p.needsReview),
    verification_state: p.verification_state || p.verificationState || 'verified',
    catalog_version: p.catalog_version || p.catalogVersion || '1.0.0',
    source_packet: p.source_packet || p.sourcePacket || `synthetic://${p.slug}`,
    updated_at: p.updated_at || null
  };
}
