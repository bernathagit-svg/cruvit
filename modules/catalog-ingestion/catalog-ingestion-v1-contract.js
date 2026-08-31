/**
 * CRUVIT Scalable Catalog Ingestion V1 — core contract.
 *
 * Pipeline / safety / scalability foundation only.
 * NO live Supabase write. NO Batch 3. NO UI.
 *
 * Permanent sequence (extended for persistence ops):
 * IDENTITY → BOTANICAL EVIDENCE → REPRODUCTIVE EVIDENCE →
 * PLANT KNOWLEDGE / WARNINGS → MEDIA → SUITABILITY GATES →
 * PERSISTENCE HANDOFF → BULK PREFLIGHT → ATOMIC BULK UPSERT →
 * POST-WRITE VERIFY
 */

import crypto from 'node:crypto';
import { FUTURE_INGESTION_SEQUENCE } from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';

export const CATALOG_INGESTION_CONTRACT_VERSION = '1.0.0';

/** Full operational sequence — no silent skips. */
export const SCALABLE_INGESTION_SEQUENCE = Object.freeze([
  ...FUTURE_INGESTION_SEQUENCE.slice(0, -1), // through SUITABILITY_GATES
  'PERSISTENCE_HANDOFF',
  'BULK_PREFLIGHT',
  'ATOMIC_BULK_UPSERT',
  'POST_WRITE_VERIFY'
]);

export const INGESTION_MODES = Object.freeze([
  'NEW_PLANT_BATCH',
  'KNOWLEDGE_ENRICHMENT',
  'BOTANICAL_EVIDENCE_ENRICHMENT',
  'MEDIA_ENRICHMENT',
  'OWNER_APPROVED_CANONICAL_CORRECTION'
]);

/** Allowed target table — any other table in SQL = FAIL. */
export const ALLOWED_TARGET_TABLE = 'public.catalog_plants';

/** Default chunk size for large VALUES clauses (still one transaction). */
export const DEFAULT_CHUNK_SIZE = 75;

/**
 * V1 chunking strategy (documented):
 * Strategy A — all chunks run as sequential statements inside ONE
 * BEGIN … COMMIT transaction. Atomicity is transactional, not
 * application-level multi-chunk compensation.
 *
 * DB execution calls ≈ 1 BEGIN + ceil(N/chunkSize) DML + 1 verify DO + 1 COMMIT
 * = O(chunks), NOT O(plants).
 */
export const CHUNKING_STRATEGY_V1 = Object.freeze({
  id: 'SINGLE_TRANSACTION_MULTI_CHUNK',
  description:
    'Deterministic VALUES chunks inside one PostgreSQL transaction. Partial chunk success cannot commit.',
  defaultChunkSize: DEFAULT_CHUNK_SIZE,
  partialCompletionAllowed: false
});

export const RUNTIME_COST_RULES = Object.freeze({
  externalBotanicalApis: 0,
  webResearch: 0,
  aiResearch: 0,
  imageSearch: 0,
  toxicityLookup: 0,
  invasiveLookup: 0
});

export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function stableStringify(value) {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]));
    }
    return v;
  });
}

/**
 * Build batch manifest (header only — plants attached separately).
 */
export function buildBatchManifest({
  batchId,
  batchVersion = '1.0.0',
  generatedAt,
  mode,
  plantCount,
  expectedSlugs,
  handoffSha256 = null,
  contractVersions = {},
  expectedEvidenceInventory = null,
  expectedKnowledgeInventory = null,
  chunkSize = DEFAULT_CHUNK_SIZE,
  updateAuthorized = false,
  notes = null
} = {}) {
  if (!batchId) throw new Error('batchId required');
  if (!INGESTION_MODES.includes(mode)) throw new Error(`unknown mode: ${mode}`);
  const slugs = Array.isArray(expectedSlugs) ? expectedSlugs.map(String) : [];
  return {
    batchId: String(batchId),
    batchVersion: String(batchVersion),
    generatedAt: generatedAt || new Date().toISOString(),
    mode,
    plantCount: Number(plantCount ?? slugs.length),
    expectedSlugs: slugs,
    handoffSha256,
    contractVersions: {
      catalogIngestion: CATALOG_INGESTION_CONTRACT_VERSION,
      ...contractVersions
    },
    expectedEvidenceInventory,
    expectedKnowledgeInventory,
    chunkSize: Number(chunkSize) || DEFAULT_CHUNK_SIZE,
    updateAuthorized: Boolean(updateAuthorized),
    chunkingStrategy: CHUNKING_STRATEGY_V1.id,
    sequence: SCALABLE_INGESTION_SEQUENCE,
    runtimeCostRules: RUNTIME_COST_RULES,
    notes
  };
}

/**
 * Validate manifest structure (not plant payloads).
 */
export function validateBatchManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest missing'] };
  }
  if (!manifest.batchId) errors.push('batchId required');
  if (!INGESTION_MODES.includes(manifest.mode)) errors.push(`unknown mode: ${manifest.mode}`);
  if (!Array.isArray(manifest.expectedSlugs)) errors.push('expectedSlugs must be array');
  if (Number(manifest.plantCount) !== (manifest.expectedSlugs?.length || -1)) {
    errors.push(
      `plantCount ${manifest.plantCount} !== expectedSlugs.length ${manifest.expectedSlugs?.length}`
    );
  }
  const dup = findDuplicates(manifest.expectedSlugs || []);
  if (dup.length) errors.push(`duplicate expectedSlugs: ${dup.join(',')}`);
  return { ok: errors.length === 0, errors };
}

export function findDuplicates(list) {
  const seen = new Set();
  const dups = new Set();
  for (const x of list || []) {
    const k = String(x);
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}

/**
 * Canonical handoff document: manifest + plants.
 * SHA is over raw JSON bytes of this document (deterministic stringify).
 */
export function buildHandoffDocument(manifest, plants) {
  const doc = {
    manifest: {
      ...manifest,
      handoffSha256: null // filled after hash — excluded from first hash pass
    },
    plants,
    allowedTargetTable: ALLOWED_TARGET_TABLE,
    liveWrite: false
  };
  // Hash without circular sha field: use plants + manifest fields except handoffSha256
  const forHash = {
    manifest: { ...manifest, handoffSha256: null },
    plants,
    allowedTargetTable: ALLOWED_TARGET_TABLE,
    liveWrite: false
  };
  const raw = `${JSON.stringify(forHash, null, 2)}\n`;
  const handoffSha256 = sha256Hex(Buffer.from(raw, 'utf8'));
  doc.manifest.handoffSha256 = handoffSha256;
  const finalRaw = `${JSON.stringify(doc, null, 2)}\n`;
  // Final SHA includes embedded handoffSha256 (self-describing). Recompute on final bytes.
  const finalSha = sha256Hex(Buffer.from(finalRaw, 'utf8'));
  doc.manifest.handoffSha256 = finalSha;
  const sealed = `${JSON.stringify(doc, null, 2)}\n`;
  const sealedSha = sha256Hex(Buffer.from(sealed, 'utf8'));
  // Seal once more so embedded SHA matches file bytes (Batch pattern: sha of final file).
  doc.manifest.handoffSha256 = sealedSha;
  const sealed2 = `${JSON.stringify(doc, null, 2)}\n`;
  // If embedding changes SHA, use two-file pattern: content without sha + sidecar.
  // V1 chooses sidecar-compatible: handoff JSON with sha matching content-excluding-sha,
  // plus .sha256 file of the written bytes. See sealHandoffBytes().
  return sealHandoffBytes(manifest, plants);
}

/**
 * Seal handoff: JSON includes expectedSha field that matches SHA of a
 * canonical payload excluding the sha field itself, then the written file
 * SHA is recorded in .sha256 sidecar (Owner verifies both).
 */
export function sealHandoffBytes(manifest, plants) {
  const payload = {
    manifest: { ...manifest, handoffSha256: null },
    plants,
    allowedTargetTable: ALLOWED_TARGET_TABLE,
    liveWrite: false
  };
  const contentRaw = `${JSON.stringify(payload, null, 2)}\n`;
  const contentSha = sha256Hex(Buffer.from(contentRaw, 'utf8'));
  const sealed = {
    manifest: { ...manifest, handoffSha256: contentSha },
    plants,
    allowedTargetTable: ALLOWED_TARGET_TABLE,
    liveWrite: false,
    contentSha256: contentSha
  };
  const fileRaw = `${JSON.stringify(sealed, null, 2)}\n`;
  const fileSha = sha256Hex(Buffer.from(fileRaw, 'utf8'));
  return {
    document: sealed,
    fileRaw,
    fileSha256: fileSha,
    contentSha256: contentSha
  };
}

export function assertHandoffShaFresh(document, expectedContentSha) {
  const errors = [];
  if (!document?.contentSha256) errors.push('missing contentSha256');
  if (expectedContentSha && document.contentSha256 !== expectedContentSha) {
    errors.push('stale or mismatched contentSha256');
  }
  if (document?.manifest?.handoffSha256 !== document?.contentSha256) {
    errors.push('manifest.handoffSha256 must equal contentSha256');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Chunk an array into fixed-size slices (last may be smaller).
 */
export function chunkArray(items, chunkSize = DEFAULT_CHUNK_SIZE) {
  const size = Math.max(1, Number(chunkSize) || DEFAULT_CHUNK_SIZE);
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Estimate DB execution calls for a batch under Strategy A.
 */
export function estimateDbExecutionCalls(plantCount, chunkSize = DEFAULT_CHUNK_SIZE) {
  const chunks = Math.max(1, Math.ceil(Number(plantCount) / Math.max(1, chunkSize)));
  return {
    begin: 1,
    dmlChunks: chunks,
    verifyDoBlock: 1,
    commit: 1,
    totalStatements: 1 + chunks + 1 + 1,
    note: 'O(chunks) statements inside one transaction; not O(plants)'
  };
}
