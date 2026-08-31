/**
 * Bounded ingestion modes for Scalable Catalog Ingestion V1.
 * Unknown mode = FAIL.
 */

export const MODE_DEFINITIONS = Object.freeze({
  NEW_PLANT_BATCH: Object.freeze({
    mode: 'NEW_PLANT_BATCH',
    description: 'Insert new canonical plants only. Existing slug/scientific collision = FAIL.',
    collisionBehavior: 'BLOCK_IF_EXISTS',
    requiresUpdateAuthorization: false,
    allowedColumns: Object.freeze([
      'slug',
      'scientific_name',
      'common_names',
      'aliases',
      'climate_traits',
      'flowering_requirements',
      'fruiting_requirements',
      'media',
      'media_status',
      'provenance',
      'needs_review',
      'verification_state',
      'catalog_version',
      'source_packet',
      'updated_at'
    ]),
    allowedJsonPaths: Object.freeze(['climate_traits.*']),
    requiredGates: Object.freeze([
      'identity',
      'evidence_metadata',
      'provenance',
      'media',
      'plantKnowledge_if_present',
      'warning_safety',
      'flowering_fruiting_mirrors',
      'collision_new_only',
      'sql_scope'
    ]),
    rollbackBehavior: 'FULL_TRANSACTION_ROLLBACK',
    writeStrategy: 'INSERT_ON_CONFLICT_DO_NOTHING_OR_FAIL'
  }),

  KNOWLEDGE_ENRICHMENT: Object.freeze({
    mode: 'KNOWLEDGE_ENRICHMENT',
    description:
      'Non-destructive merge of climate_traits.plantKnowledge only. All other climate_traits keys preserved.',
    collisionBehavior: 'REQUIRE_EXISTING',
    requiresUpdateAuthorization: false,
    allowedColumns: Object.freeze(['climate_traits', 'updated_at']),
    allowedJsonPaths: Object.freeze(['climate_traits.plantKnowledge']),
    requiredGates: Object.freeze([
      'identity_exists',
      'plantKnowledge',
      'warning_safety',
      'non_destructive_climate_proof',
      'sql_scope'
    ]),
    rollbackBehavior: 'FULL_TRANSACTION_ROLLBACK',
    writeStrategy: 'COALESCE_JSONB_MERGE_PLANT_KNOWLEDGE'
  }),

  BOTANICAL_EVIDENCE_ENRICHMENT: Object.freeze({
    mode: 'BOTANICAL_EVIDENCE_ENRICHMENT',
    description:
      'Merge declared botanical/evidence JSON paths into climate_traits (+ optional flowering/fruiting mirrors).',
    collisionBehavior: 'REQUIRE_EXISTING',
    requiresUpdateAuthorization: false,
    allowedColumns: Object.freeze([
      'climate_traits',
      'flowering_requirements',
      'fruiting_requirements',
      'updated_at'
    ]),
    allowedJsonPaths: Object.freeze([
      'climate_traits.frostSensitivity',
      'climate_traits.coldTolerance',
      'climate_traits.heatTolerance',
      'climate_traits.humidityTolerance',
      'climate_traits.waterNeeds',
      'climate_traits.sunNeeds',
      'climate_traits.drainageNeeds',
      'climate_traits.needsWinterChill',
      'climate_traits.floweringRequirements',
      'climate_traits.fruitingRequirements',
      'climate_traits.traitEvidenceClasses',
      'climate_traits.traitProvenance',
      'climate_traits.quantitativeEvidence',
      'climate_traits.quantitativeProvenance',
      'climate_traits.reproductiveBiology',
      'climate_traits.needsReview'
    ]),
    requiredGates: Object.freeze([
      'identity_exists',
      'evidence_metadata',
      'provenance',
      'flowering_fruiting_mirrors',
      'sql_scope'
    ]),
    rollbackBehavior: 'FULL_TRANSACTION_ROLLBACK',
    writeStrategy: 'COALESCE_JSONB_MERGE_DECLARED_PATHS'
  }),

  MEDIA_ENRICHMENT: Object.freeze({
    mode: 'MEDIA_ENRICHMENT',
    description: 'Update media + media_status only.',
    collisionBehavior: 'REQUIRE_EXISTING',
    requiresUpdateAuthorization: false,
    allowedColumns: Object.freeze(['media', 'media_status', 'updated_at']),
    allowedJsonPaths: Object.freeze(['media.*']),
    requiredGates: Object.freeze(['identity_exists', 'media', 'sql_scope']),
    rollbackBehavior: 'FULL_TRANSACTION_ROLLBACK',
    writeStrategy: 'COLUMN_REPLACE_MEDIA_ONLY'
  }),

  OWNER_APPROVED_CANONICAL_CORRECTION: Object.freeze({
    mode: 'OWNER_APPROVED_CANONICAL_CORRECTION',
    description:
      'Owner-authorized correction of existing canonical rows. Requires updateAuthorized=true and declared paths.',
    collisionBehavior: 'REQUIRE_EXISTING_AND_UPDATE_AUTHORIZED',
    requiresUpdateAuthorization: true,
    allowedColumns: Object.freeze([
      'scientific_name',
      'common_names',
      'aliases',
      'climate_traits',
      'flowering_requirements',
      'fruiting_requirements',
      'media',
      'media_status',
      'provenance',
      'needs_review',
      'verification_state',
      'catalog_version',
      'source_packet',
      'updated_at'
    ]),
    allowedJsonPaths: Object.freeze(['*']),
    requiredGates: Object.freeze([
      'identity_exists',
      'update_authorized',
      'evidence_metadata',
      'sql_scope',
      'owner_correction_declared_paths'
    ]),
    rollbackBehavior: 'FULL_TRANSACTION_ROLLBACK',
    writeStrategy: 'OWNER_DECLARED_UPSERT'
  })
});

export function resolveIngestionMode(mode) {
  if (!MODE_DEFINITIONS[mode]) {
    return { ok: false, error: `Unknown ingestion mode: ${mode}`, mode: null };
  }
  return { ok: true, mode: MODE_DEFINITIONS[mode], error: null };
}
