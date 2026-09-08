/**
 * Catalog Enrichment Apply Writer v1 — atomic file write for approved enrichment.
 *
 * Writes ONLY through validated Apply Gate mutation plans into the SAFE bootstrap
 * climateTraits migration triad (.js / .json / .browser.js).
 *
 * Does NOT fetch, ingest Batch 3, clear needsReview, or apply non-selected plants.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CATALOG_ENRICHMENT_APPLY_GATE_REF,
  APPLY_DECISION,
  APPLY_ALLOWED_FIELDS,
  evaluateCandidateSetForPlant,
  buildDryRunMutationPlan,
  simulateReadinessFromMutationPlan,
  plantContentHash
} from './catalog-enrichment-apply-gate-v1.js';
import { EVIDENCE_CLASS, VALUE_ORIGIN, classifyPlantDataReadiness } from './plant-data-contract-v1.js';
import { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 } from './bootstrap-safe-climate-traits-migration-data-v1.js';

export const CATALOG_ENRICHMENT_APPLY_WRITER_ID = 'catalog-enrichment-apply-writer-v1';
export const CATALOG_ENRICHMENT_APPLY_WRITER_VERSION = '1.0.0';
export const CATALOG_ENRICHMENT_APPLY_WRITER_REF = `${CATALOG_ENRICHMENT_APPLY_WRITER_ID}@${CATALOG_ENRICHMENT_APPLY_WRITER_VERSION}`;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function bootstrapSafeMigrationPaths(repoRoot) {
  return {
    json: path.join(repoRoot, 'data', 'catalog', 'bootstrap-safe-climate-traits-migration-v1.json'),
    js: path.join(
      repoRoot,
      'modules',
      'personal-domain',
      'bootstrap-safe-climate-traits-migration-data-v1.js'
    ),
    browser: path.join(
      repoRoot,
      'modules',
      'personal-domain',
      'bootstrap-safe-climate-traits-migration-data-v1.browser.js'
    )
  };
}

export function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function loadBootstrapSafeMigrationPayload(repoRoot) {
  const paths = bootstrapSafeMigrationPaths(repoRoot);
  const json = JSON.parse(fs.readFileSync(paths.json, 'utf8'));
  return { payload: json, paths, fileHashes: {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser)
  } };
}

/**
 * True if applying the mutation plan would change botanical values or evidence classes.
 */
export function mutationWouldChangePlant(plant, mutationPlan) {
  if (!mutationPlan?.ok || !mutationPlan.mutations?.length) return false;
  const t = plant?.climateTraits || {};
  const ev = t.traitEvidenceClasses || {};
  for (const m of mutationPlan.mutations) {
    if (String(t[m.field] ?? '') !== String(m.after.value ?? '')) return true;
    if (String(ev[m.field] ?? '') !== String(m.after.evidenceClass ?? '')) return true;
    if (String((t.fieldOrigins || {})[m.field] ?? '') !== String(m.after.fieldOrigin ?? '')) {
      return true;
    }
  }
  return false;
}

function atomicWriteFile(filePath, contents) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

function serializeTriad(payload) {
  const jsonBody = `${JSON.stringify(payload, null, 2)}\n`;
  const jsBody =
    `/** Auto-generated structural migration data. Enrichment overlays may update plant climateTraits via catalog-enrichment-apply-writer-v1. Re-run derive only if intentional (will wipe enrichment). */\n` +
    `export const BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(payload, null, 2)};\n` +
    `export default BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1;\n`;
  const browserBody =
    `/** Auto-generated classic-script payload for app.html sync apply. Enrichment overlays may update plant climateTraits via catalog-enrichment-apply-writer-v1. */\n` +
    `(function(global){\n` +
    `  'use strict';\n` +
    `  global.__CRUVIT_BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(payload)};\n` +
    `})(typeof window !== 'undefined' ? window : globalThis);\n`;
  return { jsonBody, jsBody, browserBody };
}

/**
 * Apply mutation plan into a deep-cloned migration payload (pomegranate plant entry).
 */
export function applyMutationToMigrationPayload(payload, slug, mutationPlan, meta = {}) {
  const next = structuredClone(payload);
  const plant = next.plants?.[slug];
  if (!plant?.climateTraits) {
    throw new Error(`migration_payload_missing_plant:${slug}`);
  }
  const ct = plant.climateTraits;
  if (!ct.traitEvidenceClasses) ct.traitEvidenceClasses = {};
  if (!ct.fieldOrigins) ct.fieldOrigins = {};
  if (!ct.enrichmentProvenance) ct.enrichmentProvenance = {};

  for (const m of mutationPlan.mutations) {
    if (!APPLY_ALLOWED_FIELDS.includes(m.field)) {
      throw new Error(`forbidden_field:${m.field}`);
    }
    ct[m.field] = m.after.value;
    ct.traitEvidenceClasses[m.field] = m.after.evidenceClass;
    ct.fieldOrigins[m.field] = m.after.fieldOrigin;
    const after = m.after || {};
    ct.enrichmentProvenance[m.field] = {
      sourceIds: after.sourceIds || [],
      sourceUrl: after.sourceUrl || null,
      sourceType: after.sourceType || null,
      supportingExcerpt: after.supportingExcerpt || null,
      sourceClaim: after.sourceClaim || null,
      sourcePolicyResult: after.sourcePolicyResult || null,
      contradictionClass: after.contradictionClass || null,
      contradictionResult: after.contradictionResult || null,
      transformId: after.transformId || null,
      transformVersion: after.transformVersion || null,
      transformRef: after.transformRef || null,
      evidenceLineage: after.evidenceLineage || null,
      contentHash: after.contentHash || null,
      appliedAt: meta.appliedAt || new Date().toISOString(),
      applyWriterRef: CATALOG_ENRICHMENT_APPLY_WRITER_REF,
      applyGateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF
    };
  }

  // Preserve structural migration kind so applier still recognizes the plant,
  // but stamp enrichment overlay on migration metadata.
  if (!ct.migration) ct.migration = {};
  ct.migration.enrichmentApply = {
    writerRef: CATALOG_ENRICHMENT_APPLY_WRITER_REF,
    gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
    appliedAt: meta.appliedAt || new Date().toISOString(),
    fields: mutationPlan.mutations.map((m) => m.field),
    parentCommit: meta.parentCommit || null
  };

  return next;
}

/**
 * Full atomic apply for one slug (pomegranate only for this checkpoint).
 */
export function applyEnrichmentAtomic({
  repoRoot,
  slug,
  plant,
  packet,
  expectedFileHashes = null,
  allowSlugs = ['pomegranate']
}) {
  if (!allowSlugs.includes(slug)) {
    return {
      ok: false,
      reason: 'slug_not_allowed_for_writer',
      catalogMutated: false
    };
  }

  const loaded = loadBootstrapSafeMigrationPayload(repoRoot);
  if (expectedFileHashes) {
    for (const k of ['json', 'js', 'browser']) {
      if (expectedFileHashes[k] && expectedFileHashes[k] !== loaded.fileHashes[k]) {
        return {
          ok: false,
          reason: 'prewrite_hash_mismatch',
          expected: expectedFileHashes,
          actual: loaded.fileHashes,
          catalogMutated: false
        };
      }
    }
  }

  // Payload plant must match in-memory plant baseline for frost/cold
  const payloadPlant = loaded.payload.plants[slug];
  if (!payloadPlant) {
    return { ok: false, reason: 'plant_missing_in_migration', catalogMutated: false };
  }

  const gate = evaluateCandidateSetForPlant({ packet, plant, writePlanRequested: true });
  if (gate.setDecision !== APPLY_DECISION.APPLY_ALLOWED || !gate.mutationPlan?.ok) {
    return {
      ok: false,
      reason: 'apply_gate_not_allowed',
      gate,
      catalogMutated: false
    };
  }

  if (!mutationWouldChangePlant(plant, gate.mutationPlan)) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_equivalent_no_mutation',
      SECOND_APPLY_WOULD_MUTATE: false,
      gate,
      catalogMutated: false,
      fileHashes: loaded.fileHashes
    };
  }

  // Pre-write contract + readiness on in-memory proposed plant
  const readiness = simulateReadinessFromMutationPlan(gate.mutationPlan);
  const proposedClassification = classifyPlantDataReadiness(gate.mutationPlan.after);
  if (!gate.mutationPlan.guards.floweringRequirementsUnchanged ||
      !gate.mutationPlan.guards.fruitingRequirementsUnchanged ||
      !gate.mutationPlan.guards.needsReviewUnchanged) {
    return { ok: false, reason: 'guard_failed', gate, catalogMutated: false };
  }

  const appliedAt = new Date().toISOString();
  const nextPayload = applyMutationToMigrationPayload(
    loaded.payload,
    slug,
    gate.mutationPlan,
    { appliedAt, parentCommit: packet?.parentCommit || null }
  );

  // Verify only allowed fields differ in payload plant climateTraits
  const beforeCt = loaded.payload.plants[slug].climateTraits;
  const afterCt = nextPayload.plants[slug].climateTraits;
  for (const key of Object.keys(afterCt)) {
    if (APPLY_ALLOWED_FIELDS.includes(key)) continue;
    if (['traitEvidenceClasses', 'fieldOrigins', 'enrichmentProvenance', 'migration'].includes(key)) {
      continue;
    }
    if (JSON.stringify(beforeCt[key]) !== JSON.stringify(afterCt[key])) {
      return { ok: false, reason: `unexpected_field_delta:${key}`, catalogMutated: false };
    }
  }
  for (const field of Object.keys(afterCt.traitEvidenceClasses || {})) {
    if (APPLY_ALLOWED_FIELDS.includes(field)) continue;
    if (
      JSON.stringify(beforeCt.traitEvidenceClasses?.[field]) !==
      JSON.stringify(afterCt.traitEvidenceClasses?.[field])
    ) {
      return { ok: false, reason: `unexpected_evidence_delta:${field}`, catalogMutated: false };
    }
  }

  const bodies = serializeTriad(nextPayload);
  // Re-check hashes immediately before write
  const rehash = {
    json: hashFile(loaded.paths.json),
    js: hashFile(loaded.paths.js),
    browser: hashFile(loaded.paths.browser)
  };
  for (const k of ['json', 'js', 'browser']) {
    if (rehash[k] !== loaded.fileHashes[k]) {
      return { ok: false, reason: 'hash_changed_before_write', catalogMutated: false };
    }
  }

  atomicWriteFile(loaded.paths.json, bodies.jsonBody);
  atomicWriteFile(loaded.paths.js, bodies.jsBody);
  atomicWriteFile(loaded.paths.browser, bodies.browserBody);

  const afterHashes = {
    json: hashFile(loaded.paths.json),
    js: hashFile(loaded.paths.js),
    browser: hashFile(loaded.paths.browser)
  };

  return {
    ok: true,
    skipped: false,
    catalogMutated: true,
    slug,
    writerRef: CATALOG_ENRICHMENT_APPLY_WRITER_REF,
    gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
    appliedAt,
    mutationPlan: {
      jsonDiff: gate.mutationPlan.jsonDiff,
      planFingerprint: gate.mutationPlan.planFingerprint,
      guards: gate.mutationPlan.guards
    },
    readinessBeforeWriteSimulation: readiness,
    proposedClassification: {
      readinessShort: proposedClassification.readinessShort,
      gate: proposedClassification.gate,
      reasons: proposedClassification.reasons
    },
    fileHashesBefore: loaded.fileHashes,
    fileHashesAfter: afterHashes,
    externalRequests: 0,
    appleFigUntouched: true
  };
}

export { BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 };
