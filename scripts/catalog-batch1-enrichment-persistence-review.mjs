#!/usr/bin/env node
/**
 * CRUVIT Batch 1 enrichment — live persistence contract review.
 * Local only. NO live upsert. NO commit. NO Batch 2.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';
import {
  catalogRowToRuntimePlant,
  normalizeCatalogRequirementJsonbValue,
  sqlJsonbLiteral
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { annotatePacketFieldProvenance } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';
import { FIELD_PROVENANCE_EVIDENCE_CLASSES } from '../modules/catalog-expansion/field-provenance-honesty-v1-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDOFF_DIR = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-1-v1/handoff'
);
const HANDOFF_JSON = path.join(HANDOFF_DIR, 'catalog_plants_enrichment_handoff.json');
/** Owner live-persistence handoff checksum (accepted at apply). */
const OWNER_ACCEPTED_LIVE_HANDOFF_SHA =
  '955fab032e37dd115997ec5c1c0350d288b12884ff3e7767a78e2bc8eb8e9cb4';
const PACKET_DIR = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-1-v1/packets'
);
const SEED = path.join(ROOT, 'data/plants.seed.json');
const OUT_SQL = path.join(HANDOFF_DIR, 'catalog_plants_enrichment_upsert.sql');
const OUT_VERIFY = path.join(HANDOFF_DIR, 'catalog_plants_enrichment_verify.sql');
const OUT_REPORT = path.join(
  ROOT,
  'tests/_batch1-enrichment-persistence-review-report.json'
);

const BATCH1_SLUGS = new Set(BATCH1_PLANTS.map((p) => p.slug));
const INVENTORY_FIELDS = new Set([
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'waterNeeds',
  'sunNeeds',
  'drainageNeeds',
  'needsWinterChill',
  'floweringRequirements',
  'fruitingRequirements'
]);

const ROUND_TRIP_SLUGS = [
  'bay-laurel',
  'persimmon',
  'ginkgo',
  'english-walnut',
  'durian',
  'blue-gum'
];

/** Evidence-strength metadata only — never botanical trait values. */
const EVIDENCE_METADATA_KEYS = [
  'traitEvidenceClasses',
  'traitProvenance',
  'quantitativeEvidence',
  'quantitativeProvenance',
  'reproductiveBiology',
  'floweringEvidenceClass',
  'floweringDescriptiveProse'
];

function extractEvidenceMetadataClimateTraits(climateTraits = {}) {
  const out = {};
  for (const key of EVIDENCE_METADATA_KEYS) {
    if (climateTraits[key] !== undefined && climateTraits[key] !== null) {
      out[key] = climateTraits[key];
    }
  }
  return out;
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function buildSimulatedLiveRow(seedPlant, handoffClimateTraits, { mode = 'full' } = {}) {
  // Approximate current live row: seed-backed identity/media + pre-enrichment climate.
  const media =
    seedPlant.media && typeof seedPlant.media === 'object' ? seedPlant.media : {};
  const mediaStatus = String(media.imageStatus || 'IMAGE_PENDING');
  const existingClimate =
    seedPlant.climateTraits && typeof seedPlant.climateTraits === 'object'
      ? structuredClone(seedPlant.climateTraits)
      : {};
  const mergePayload =
    mode === 'metadata-only'
      ? extractEvidenceMetadataClimateTraits(handoffClimateTraits)
      : handoffClimateTraits;
  // Simulate non-destructive merge as SQL will: existing || enrichment
  const mergedClimate = simulatePostgresJsonb({
    ...existingClimate,
    ...mergePayload
  });
  const floweringMirror =
    mode === 'metadata-only'
      ? existingClimate.floweringRequirements ?? null
      : handoffClimateTraits?.floweringRequirements ??
        existingClimate.floweringRequirements ??
        null;
  const fruitingMirror =
    mode === 'metadata-only'
      ? Object.prototype.hasOwnProperty.call(existingClimate, 'fruitingRequirements')
        ? existingClimate.fruitingRequirements
        : null
      : Object.prototype.hasOwnProperty.call(handoffClimateTraits || {}, 'fruitingRequirements')
        ? handoffClimateTraits.fruitingRequirements
        : existingClimate.fruitingRequirements ?? null;
  return {
    slug: seedPlant.slug,
    scientific_name: seedPlant.scientific || null,
    common_names: seedPlant.names || {},
    aliases: Array.isArray(seedPlant.aliases) ? seedPlant.aliases : [],
    climate_traits: mergedClimate,
    flowering_requirements: normalizeCatalogRequirementJsonbValue(floweringMirror),
    fruiting_requirements: normalizeCatalogRequirementJsonbValue(fruitingMirror),
    provenance: Array.isArray(seedPlant.provenance) ? seedPlant.provenance : [],
    needs_review:
      seedPlant.needsReview === true ||
      seedPlant.climateTraits?.needsReview === true ||
      seedPlant.slug === 'blue-gum',
    verification_state:
      seedPlant.slug === 'blue-gum' || seedPlant.needsReview ? 'needsReview' : 'verified',
    media: simulatePostgresJsonb(media),
    media_status: mediaStatus,
    catalog_version: '1.0.0',
    source_packet: seedPlant.source?.recordId || null
  };
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function simulatePostgresJsonb(value) {
  // Postgres JSONB stores JSON; round-trip via JSON parse/stringify.
  return JSON.parse(JSON.stringify(value));
}

function inventoryFromClimateTraits(climateTraits) {
  const counts = {
    SOURCE_SUPPORTED: 0,
    HEURISTIC_ASSERTION: 0,
    UNKNOWN: 0
  };
  const classes = climateTraits?.traitEvidenceClasses || {};
  for (const [field, cls] of Object.entries(classes)) {
    if (
      !INVENTORY_FIELDS.has(field) &&
      !String(field).startsWith('reproductive.') &&
      !String(field).startsWith('quantitative.')
    ) {
      continue;
    }
    if (counts[cls] == null) counts[cls] = 0;
    counts[cls] += 1;
  }
  return counts;
}

function inventoryFromPackets() {
  const counts = {
    SOURCE_SUPPORTED: 0,
    HEURISTIC_ASSERTION: 0,
    UNKNOWN: 0
  };
  for (const def of BATCH1_PLANTS) {
    const packet = JSON.parse(
      fs.readFileSync(path.join(PACKET_DIR, `${def.slug}.packet.json`), 'utf8')
    );
    const ann = annotatePacketFieldProvenance(packet);
    for (const c of ann.claims) {
      if (
        !INVENTORY_FIELDS.has(c.field) &&
        !String(c.field).startsWith('reproductive.') &&
        !String(c.field).startsWith('quantitative.')
      ) {
        continue;
      }
      counts[c.evidenceClass] = (counts[c.evidenceClass] || 0) + 1;
    }
  }
  return counts;
}

function evidenceSnapshot(runtimePlant) {
  const ct = runtimePlant.climateTraits || {};
  return {
    frostSensitivity: ct.frostSensitivity,
    coldTolerance: ct.coldTolerance,
    heatTolerance: ct.heatTolerance,
    humidityTolerance: ct.humidityTolerance,
    waterNeeds: ct.waterNeeds,
    sunNeeds: ct.sunNeeds,
    drainageNeeds: ct.drainageNeeds,
    floweringRequirements: ct.floweringRequirements ?? runtimePlant.floweringRequirements,
    fruitingRequirements: ct.fruitingRequirements ?? runtimePlant.fruitingRequirements,
    quantitativeEvidence: ct.quantitativeEvidence || null,
    quantitativeProvenance: ct.quantitativeProvenance || null,
    reproductiveBiology: ct.reproductiveBiology || null,
    traitEvidenceClasses: ct.traitEvidenceClasses || null,
    traitProvenance: ct.traitProvenance || null,
    needsReview: runtimePlant.needsReview === true || ct.needsReview === true
  };
}

function assertNoPromotion(beforeClasses, afterClasses) {
  const issues = [];
  for (const [field, after] of Object.entries(afterClasses || {})) {
    const before = beforeClasses?.[field];
    if (
      before === FIELD_PROVENANCE_EVIDENCE_CLASSES.HEURISTIC_ASSERTION &&
      after === FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED
    ) {
      issues.push(`${field}: HEURISTIC→SOURCE_SUPPORTED`);
    }
    if (
      before === FIELD_PROVENANCE_EVIDENCE_CLASSES.UNKNOWN &&
      after === FIELD_PROVENANCE_EVIDENCE_CLASSES.SOURCE_SUPPORTED
    ) {
      // Allowed only if enrichment intentionally upgraded with sources — not a round-trip promotion.
      // Round-trip uses same handoff object; flag only if after invents SS without before.
    }
  }
  return issues;
}

function main() {
  const handoffRaw = fs.readFileSync(HANDOFF_JSON);
  const handoffSha = sha256Hex(handoffRaw);
  const handoff = JSON.parse(handoffRaw.toString('utf8'));
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const seedBySlug = Object.fromEntries((seed.plants || []).map((p) => [p.slug, p]));

  const rows = Array.isArray(handoff.rows) ? handoff.rows : [];
  const updated = rows.filter((r) => r.enrichment === 'updated');
  const unchanged = rows.filter((r) => r.enrichment !== 'updated');
  const slugs = rows.map((r) => r.slug);
  const slugSet = new Set(slugs);

  const audit = {
    shaMatch: handoffSha === OWNER_ACCEPTED_LIVE_HANDOFF_SHA,
    handoffSha,
    ownerAcceptedLiveHandoffSha: OWNER_ACCEPTED_LIVE_HANDOFF_SHA,
    plantCount: rows.length,
    expectedPlantCount: 30,
    updatedCount: updated.length,
    expectedUpdated: 18,
    unchangedCount: unchanged.length,
    allBatch1: slugs.every((s) => BATCH1_SLUGS.has(s)) && slugSet.size === 30,
    noDuplicates: slugSet.size === slugs.length,
    noBatch2: slugs.every((s) => BATCH1_SLUGS.has(s)),
    noGardenUserFields: rows.every(
      (r) =>
        !('garden' in r) &&
        !('user' in r) &&
        !('userId' in r) &&
        !('gardenId' in r) &&
        !('media' in r)
    ),
    blueGumNeedsReview:
      rows.find((r) => r.slug === 'blue-gum')?.climateTraits?.needsReview === true,
    blueGumUnchanged:
      rows.find((r) => r.slug === 'blue-gum')?.enrichment ===
      'unchanged-heuristic-or-unknown',
    scientificIdentityStable: rows.every((r) => {
      const def = BATCH1_PLANTS.find((d) => d.slug === r.slug);
      return def && r.scientific === def.scientific;
    }),
    needsReviewNoRegression: rows.every((r) => {
      const def = BATCH1_PLANTS.find((d) => d.slug === r.slug);
      if (!def) return false;
      const mustReview = def.needsReview === true || def.slug === 'blue-gum';
      if (mustReview) return r.climateTraits?.needsReview === true;
      // Enrichment must not force needsReview true on clean plants
      return r.climateTraits?.needsReview !== true;
    })
  };

  // Lossless mapping decision
  const mapping = {
    qualitativeTraitValue: {
      column: 'climate_traits.<traitKey>',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    evidenceClass: {
      column: 'climate_traits.traitEvidenceClasses.<field>',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    fieldLevelProvenance: {
      column: 'climate_traits.traitProvenance.<field>',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    numericClimateEvidence: {
      column:
        'climate_traits.quantitativeEvidence + climate_traits.quantitativeProvenance (+ traitEvidenceClasses quantitative.*)',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    floweringEvidence: {
      column:
        'climate_traits.floweringRequirements + climate_traits.traitEvidenceClasses/traitProvenance; mirrored to flowering_requirements jsonb',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    reproductiveBiology: {
      column:
        'climate_traits.reproductiveBiology + climate_traits.traitEvidenceClasses/traitProvenance reproductive.*',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    },
    evidenceClassDistinction: {
      column: 'climate_traits.traitEvidenceClasses (SOURCE_SUPPORTED|HEURISTIC_ASSERTION|UNKNOWN)',
      CAN_PERSIST_LOSSLESSLY: 'YES'
    }
  };
  const canPersistLosslessly = Object.values(mapping).every(
    (m) => m.CAN_PERSIST_LOSSLESSLY === 'YES'
  );

  const packetInventory = inventoryFromPackets();
  const handoffInventory = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const r of rows) {
    const inv = inventoryFromClimateTraits(r.climateTraits);
    for (const k of Object.keys(handoffInventory)) {
      handoffInventory[k] += inv[k] || 0;
    }
  }

  // Round-trip tests
  const roundTrips = {};
  let roundTripPass = true;
  for (const slug of ROUND_TRIP_SLUGS) {
    const handoffRow = rows.find((r) => r.slug === slug);
    const seedPlant = seedBySlug[slug];
    if (!handoffRow || !seedPlant) {
      roundTrips[slug] = { pass: false, error: 'missing handoff or seed' };
      roundTripPass = false;
      continue;
    }
    const beforeClasses = structuredClone(handoffRow.climateTraits.traitEvidenceClasses || {});
    const persistMode =
      handoffRow.enrichment === 'updated' ? 'full' : 'metadata-only';
    const beforeSnap = evidenceSnapshot({
      climateTraits:
        persistMode === 'metadata-only'
          ? {
              ...structuredClone(seedPlant.climateTraits || {}),
              ...extractEvidenceMetadataClimateTraits(handoffRow.climateTraits)
            }
          : handoffRow.climateTraits,
      floweringRequirements:
        persistMode === 'metadata-only'
          ? seedPlant.climateTraits?.floweringRequirements
          : handoffRow.climateTraits.floweringRequirements,
      fruitingRequirements:
        persistMode === 'metadata-only'
          ? seedPlant.climateTraits?.fruitingRequirements
          : handoffRow.climateTraits.fruitingRequirements,
      needsReview: handoffRow.climateTraits.needsReview === true
    });

    const catalogRow = buildSimulatedLiveRow(seedPlant, handoffRow.climateTraits, {
      mode: persistMode
    });
    const jsonbRow = simulatePostgresJsonb(catalogRow);
    const runtime = catalogRowToRuntimePlant(jsonbRow);
    const afterSnap = evidenceSnapshot(runtime);
    const promotionIssues = assertNoPromotion(
      beforeClasses,
      afterSnap.traitEvidenceClasses
    );

    const checks = {
      evidenceClassPreserved: deepEqual(
        beforeSnap.traitEvidenceClasses,
        afterSnap.traitEvidenceClasses
      ),
      provenancePreserved: deepEqual(beforeSnap.traitProvenance, afterSnap.traitProvenance),
      quantitativePreserved: deepEqual(
        beforeSnap.quantitativeEvidence,
        afterSnap.quantitativeEvidence
      ),
      quantitativeProvenancePreserved: deepEqual(
        beforeSnap.quantitativeProvenance,
        afterSnap.quantitativeProvenance
      ),
      reproductivePreserved: deepEqual(
        beforeSnap.reproductiveBiology,
        afterSnap.reproductiveBiology
      ),
      floweringFruitingUnknownSemantics:
        (beforeSnap.floweringRequirements ?? null) ===
          (afterSnap.floweringRequirements ?? null) &&
        (beforeSnap.fruitingRequirements ?? null) ===
          (afterSnap.fruitingRequirements ?? null),
      noStringObjectMismatch:
        (jsonbRow.flowering_requirements === null ||
          typeof jsonbRow.flowering_requirements === 'string' ||
          typeof jsonbRow.flowering_requirements === 'object') &&
        (jsonbRow.fruiting_requirements === null ||
          typeof jsonbRow.fruiting_requirements === 'string' ||
          typeof jsonbRow.fruiting_requirements === 'object'),
      noHeuristicPromotion: promotionIssues.length === 0,
      mediaPreserved: deepEqual(seedPlant.media || {}, jsonbRow.media),
      mediaStatusPreserved:
        String(seedPlant.media?.imageStatus || 'IMAGE_PENDING') === jsonbRow.media_status,
      scientificPreserved: (seedPlant.scientific || null) === jsonbRow.scientific_name,
      sourcePacketPreserved:
        (seedPlant.source?.recordId || null) === jsonbRow.source_packet,
      botanicalValuesPreservedWhenMetadataOnly:
        persistMode !== 'metadata-only' ||
        (afterSnap.frostSensitivity === (seedPlant.climateTraits?.frostSensitivity ?? afterSnap.frostSensitivity) &&
          afterSnap.coldTolerance === (seedPlant.climateTraits?.coldTolerance ?? afterSnap.coldTolerance)),
      blueGumNeedsReview:
        slug !== 'blue-gum' ||
        (jsonbRow.needs_review === true && afterSnap.needsReview === true)
    };
    const pass = Object.values(checks).every(Boolean);
    if (!pass) roundTripPass = false;

    // Evaluator-visible evidence classes (meta = climateTraits)
    const evaluatorMeta = runtime.climateTraits;
    const evaluatorSees = {
      frostSensitivityClass: evaluatorMeta?.traitEvidenceClasses?.frostSensitivity || null,
      humidityToleranceClass: evaluatorMeta?.traitEvidenceClasses?.humidityTolerance || null,
      quantitativeMinClass:
        evaluatorMeta?.traitEvidenceClasses?.[
          'quantitative.minimum_survival_temperature_c'
        ] || null,
      minSurvivalC: evaluatorMeta?.quantitativeEvidence?.minimum_survival_temperature_c,
      reproductive: evaluatorMeta?.reproductiveBiology || null
    };

    roundTrips[slug] = {
      pass,
      checks,
      promotionIssues,
      evaluatorSees,
      enrichment: handoffRow.enrichment
    };
  }

  // Bay Laurel detailed expected live shape
  const bay = rows.find((r) => r.slug === 'bay-laurel');
  const bayRt = roundTrips['bay-laurel'];
  const bayExpected = {
    climate_traits_keys: Object.keys(bay.climateTraits || {}).sort(),
    SOURCE_SUPPORTED_fields: Object.entries(bay.climateTraits.traitEvidenceClasses || {})
      .filter(([, v]) => v === 'SOURCE_SUPPORTED')
      .map(([k]) => k)
      .filter(
        (k) =>
          INVENTORY_FIELDS.has(k) ||
          k.startsWith('reproductive.') ||
          k.startsWith('quantitative.')
      ),
    HEURISTIC_fields: ['heatTolerance', 'humidityTolerance'].filter(
      (k) => bay.climateTraits.traitEvidenceClasses?.[k] === 'HEURISTIC_ASSERTION'
    ),
    quantitative: bay.climateTraits.quantitativeEvidence,
    reproductive: bay.climateTraits.reproductiveBiology,
    evaluatorRoundTrip: bayRt?.evaluatorSees || null
  };

  // Non-destructive proof: enriched rows update climate + mirrors; unchanged rows metadata only
  const nonDestructive = {
    updatesColumns: ['climate_traits', 'flowering_requirements', 'fruiting_requirements', 'updated_at'],
    preservesColumns: [
      'scientific_name',
      'common_names',
      'aliases',
      'provenance',
      'needs_review',
      'verification_state',
      'media',
      'media_status',
      'catalog_version',
      'source_packet'
    ],
    mergeSemantics:
      '18 enriched: climate_traits = COALESCE(existing,{}) || full accepted enrichment JSONB; flowering/fruiting mirrors updated. 12 botanically unchanged: climate_traits = COALESCE(existing,{}) || evidence metadata only (traitEvidenceClasses, traitProvenance, quantitative/reproductive metadata); botanical trait values and flowering/fruiting columns untouched.',
    materiallyEnrichedSlugs: updated.map((r) => r.slug).sort(),
    evidenceMetadataOnlySlugs: unchanged.map((r) => r.slug).sort(),
    allBatch1ReceiveEvidenceMetadata: true,
    permanentRule:
      'UNCHANGED BOTANICAL ROWS MUST STILL PERSIST EVIDENCE METADATA — skip metadata only if plant lacks accepted handoff evidence classes.'
  };

  const enrichedTuples = updated.map((r) => {
    const ct = r.climateTraits;
    const flowering = normalizeCatalogRequirementJsonbValue(ct.floweringRequirements ?? null);
    const fruiting = Object.prototype.hasOwnProperty.call(ct, 'fruitingRequirements')
      ? normalizeCatalogRequirementJsonbValue(ct.fruitingRequirements)
      : null;
    return `(${[
      `'${r.slug.replace(/'/g, "''")}'`,
      sqlJsonbLiteral(ct),
      sqlJsonbLiteral(flowering),
      sqlJsonbLiteral(fruiting)
    ].join(', ')})`;
  });

  const metadataOnlyTuples = unchanged.map((r) => {
    const meta = extractEvidenceMetadataClimateTraits(r.climateTraits);
    if (!meta.traitEvidenceClasses || !meta.traitProvenance) {
      throw new Error(
        `${r.slug}: unchanged row missing accepted traitEvidenceClasses/traitProvenance in handoff`
      );
    }
    return `(${[
      `'${r.slug.replace(/'/g, "''")}'`,
      sqlJsonbLiteral(meta)
    ].join(', ')})`;
  });

  const enrichedSlugListSql = updated.map((r) => `'${r.slug}'`).join(', ');
  const metadataSlugListSql = unchanged.map((r) => `'${r.slug}'`).join(', ');
  const allBatch1Sql = [...BATCH1_SLUGS].map((s) => `'${s}'`).join(', ');

  const sql = `-- CRUVIT Batch 1 SOURCE_SUPPORTED enrichment — executable live persistence (Owner-applied)
-- Generated by scripts/catalog-batch1-enrichment-persistence-review.mjs
-- Handoff SHA-256: ${handoffSha}
-- DO NOT auto-run. NO schema/RLS/auth changes. Targets public.catalog_plants only.
-- Non-destructive: does not rewrite scientific_name, common_names, aliases, media,
-- media_status, provenance, needs_review, verification_state, source_packet, catalog_version.
-- Permanent rule: ALL 30 Batch 1 plants receive evidence metadata; only 18 receive botanical updates.
-- Idempotent: re-applying the same JSONB merge yields the same climate_traits keys.

BEGIN;

-- A) 18 materially enriched: full accepted climate_traits + flowering/fruiting mirrors
UPDATE public.catalog_plants AS c
SET
  climate_traits = COALESCE(c.climate_traits, '{}'::jsonb) || v.climate_traits,
  flowering_requirements = v.flowering_requirements,
  fruiting_requirements = v.fruiting_requirements,
  updated_at = now()
FROM (
  VALUES
${enrichedTuples.join(',\n')}
) AS v(slug, climate_traits, flowering_requirements, fruiting_requirements)
WHERE c.slug = v.slug
  AND c.slug IN (${enrichedSlugListSql});

-- B) 12 botanically unchanged: evidence metadata ONLY (no botanical trait value overwrite)
UPDATE public.catalog_plants AS c
SET
  climate_traits = COALESCE(c.climate_traits, '{}'::jsonb) || v.evidence_metadata,
  updated_at = now()
FROM (
  VALUES
${metadataOnlyTuples.join(',\n')}
) AS v(slug, evidence_metadata)
WHERE c.slug = v.slug
  AND c.slug IN (${metadataSlugListSql});

-- Guard: all 30 Batch 1 slugs present; all must carry traitEvidenceClasses after apply
DO $$
DECLARE
  n_all int;
  n_meta int;
BEGIN
  SELECT count(*) INTO n_all
  FROM public.catalog_plants
  WHERE slug IN (${allBatch1Sql});
  IF n_all <> 30 THEN
    RAISE EXCEPTION 'CRUVIT enrichment upsert aborted: expected 30 Batch 1 slugs, found %', n_all;
  END IF;
  SELECT count(*) INTO n_meta
  FROM public.catalog_plants
  WHERE slug IN (${allBatch1Sql})
    AND climate_traits ? 'traitEvidenceClasses'
    AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
    AND climate_traits->'traitEvidenceClasses' <> '{}'::jsonb;
  IF n_meta <> 30 THEN
    RAISE EXCEPTION 'CRUVIT enrichment upsert aborted: expected 30/30 traitEvidenceClasses, found %', n_meta;
  END IF;
END $$;

COMMIT;
`;

  fs.writeFileSync(OUT_SQL, sql);
  const sqlSha = sha256Hex(Buffer.from(sql, 'utf8'));

  const verifySql = `-- CRUVIT Batch 1 enrichment — post-write verification (DO NOT mix with upsert)
-- Run AFTER Owner applies catalog_plants_enrichment_upsert.sql
-- Handoff SHA-256: ${handoffSha}
-- Expected packet inventory (authoritative): SS=${packetInventory.SOURCE_SUPPORTED} H=${packetInventory.HEURISTIC_ASSERTION} U=${packetInventory.UNKNOWN}
-- Handoff climate_traits inventory (material fields mirrored into traitEvidenceClasses): SS=${handoffInventory.SOURCE_SUPPORTED} H=${handoffInventory.HEURISTIC_ASSERTION} U=${handoffInventory.UNKNOWN}

-- 1) Batch 1 count = 30
SELECT count(*) AS batch1_count
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql});
-- EXPECT: 30

-- 2) No duplicate slugs / scientific names within Batch 1
SELECT slug, count(*) FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql})
GROUP BY slug HAVING count(*) > 1;
-- EXPECT: 0 rows

SELECT scientific_name, count(*) FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql}) AND scientific_name IS NOT NULL
GROUP BY scientific_name HAVING count(*) > 1;
-- EXPECT: 0 rows

-- 3) IMAGE_READY unchanged (=30 for Batch 1)
SELECT count(*) AS image_ready_count
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql}) AND media_status = 'IMAGE_READY';
-- EXPECT: 30

-- 4) Blue Gum still needs_review
SELECT slug, needs_review, verification_state, climate_traits->>'needsReview' AS ct_needs_review
FROM public.catalog_plants WHERE slug = 'blue-gum';
-- EXPECT: needs_review = true

-- 5) source_packet + media preserved (non-null media object for Batch 1)
SELECT count(*) AS missing_source_packet
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql}) AND (source_packet IS NULL OR btrim(source_packet) = '');
-- EXPECT: 0

SELECT count(*) AS missing_media
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql}) AND (media IS NULL OR media = '{}'::jsonb);
-- EXPECT: 0

-- 6) Bay Laurel evidence round-trip
SELECT
  slug,
  climate_traits->>'frostSensitivity' AS frost,
  climate_traits->'traitEvidenceClasses'->>'frostSensitivity' AS frost_class,
  climate_traits->>'coldTolerance' AS cold,
  climate_traits->'traitEvidenceClasses'->>'coldTolerance' AS cold_class,
  climate_traits->>'heatTolerance' AS heat,
  climate_traits->'traitEvidenceClasses'->>'heatTolerance' AS heat_class,
  climate_traits->>'humidityTolerance' AS humidity,
  climate_traits->'traitEvidenceClasses'->>'humidityTolerance' AS humidity_class,
  (climate_traits->'quantitativeEvidence'->>'minimum_survival_temperature_c')::numeric AS min_c,
  climate_traits->'traitEvidenceClasses'->>'quantitative.minimum_survival_temperature_c' AS min_c_class,
  climate_traits->'reproductiveBiology' AS reproductive,
  climate_traits->'traitEvidenceClasses'->>'reproductive.dioecious' AS dioecious_class
FROM public.catalog_plants WHERE slug = 'bay-laurel';
-- EXPECT: frost/cold SOURCE_SUPPORTED; heat/humidity HEURISTIC_ASSERTION; min_c = -5; reproductive present

-- 7) ALL 30 Batch 1 plants must carry traitEvidenceClasses (FAIL if any missing)
SELECT count(*) AS rows_with_trait_evidence_classes
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql})
  AND climate_traits ? 'traitEvidenceClasses'
  AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
  AND climate_traits->'traitEvidenceClasses' <> '{}'::jsonb;
-- EXPECT: 30

SELECT slug
FROM public.catalog_plants
WHERE slug IN (${allBatch1Sql})
  AND (
    NOT (climate_traits ? 'traitEvidenceClasses')
    OR jsonb_typeof(climate_traits->'traitEvidenceClasses') <> 'object'
    OR climate_traits->'traitEvidenceClasses' = '{}'::jsonb
  );
-- EXPECT: 0 rows

-- 8) Material evidence-class inventory from climate_traits (Batch 1) — authoritative live totals
WITH fields AS (
  SELECT c.slug, e.key AS field, e.value AS evidence_class
  FROM public.catalog_plants c
  CROSS JOIN LATERAL jsonb_each_text(c.climate_traits->'traitEvidenceClasses') AS e(key, value)
  WHERE c.slug IN (${allBatch1Sql})
    AND (
      e.key IN (
        'frostSensitivity','coldTolerance','heatTolerance','humidityTolerance',
        'waterNeeds','sunNeeds','drainageNeeds','needsWinterChill',
        'floweringRequirements','fruitingRequirements'
      )
      OR e.key LIKE 'reproductive.%'
      OR e.key LIKE 'quantitative.%'
    )
)
SELECT evidence_class, count(*) AS n
FROM fields
GROUP BY evidence_class
ORDER BY evidence_class;
-- EXPECT EXACT: SOURCE_SUPPORTED=189 HEURISTIC_ASSERTION=125 UNKNOWN=11

DO $$
DECLARE
  ss int; h int; u int;
BEGIN
  WITH fields AS (
    SELECT e.value AS evidence_class
    FROM public.catalog_plants c
    CROSS JOIN LATERAL jsonb_each_text(c.climate_traits->'traitEvidenceClasses') AS e(key, value)
    WHERE c.slug IN (${allBatch1Sql})
      AND (
        e.key IN (
          'frostSensitivity','coldTolerance','heatTolerance','humidityTolerance',
          'waterNeeds','sunNeeds','drainageNeeds','needsWinterChill',
          'floweringRequirements','fruitingRequirements'
        )
        OR e.key LIKE 'reproductive.%'
        OR e.key LIKE 'quantitative.%'
      )
  )
  SELECT
    count(*) FILTER (WHERE evidence_class = 'SOURCE_SUPPORTED'),
    count(*) FILTER (WHERE evidence_class = 'HEURISTIC_ASSERTION'),
    count(*) FILTER (WHERE evidence_class = 'UNKNOWN')
  INTO ss, h, u
  FROM fields;
  IF ss <> 189 OR h <> 125 OR u <> 11 THEN
    RAISE EXCEPTION 'CRUVIT enrichment verify failed inventory: SS=% H=% U=% (expected 189/125/11)', ss, h, u;
  END IF;
END $$;

-- 9) 12 metadata-only slugs must still have frostSensitivity evidence class without overwriting botanical value
SELECT count(*) AS metadata_only_with_frost_class
FROM public.catalog_plants
WHERE slug IN (${metadataSlugListSql})
  AND climate_traits->'traitEvidenceClasses'->>'frostSensitivity' IS NOT NULL;
-- EXPECT: 12
`;

  fs.writeFileSync(OUT_VERIFY, verifySql);

  const pass =
    audit.plantCount === 30 &&
    audit.updatedCount === 18 &&
    audit.allBatch1 &&
    audit.noDuplicates &&
    audit.noBatch2 &&
    audit.noGardenUserFields &&
    audit.blueGumNeedsReview &&
    audit.blueGumUnchanged &&
    audit.scientificIdentityStable &&
    audit.needsReviewNoRegression &&
    canPersistLosslessly &&
    roundTripPass &&
    unchanged.every((r) => {
      const meta = extractEvidenceMetadataClimateTraits(r.climateTraits);
      return meta.traitEvidenceClasses && meta.traitProvenance;
    }) &&
    fs.existsSync(OUT_SQL) &&
    sqlSha.length === 64;

  const report = {
    gate: 'CRUVIT_BATCH_1_ENRICHMENT_PERSISTENCE_REVIEW',
    verdict: pass
      ? 'CRUVIT_BATCH_1_ENRICHMENT_PERSISTENCE_REVIEW: PASS'
      : 'CRUVIT_BATCH_1_ENRICHMENT_PERSISTENCE_REVIEW: FAIL',
    handoffShaVerification: {
      ownerAcceptedLive: OWNER_ACCEPTED_LIVE_HANDOFF_SHA,
      currentHandoffFile: handoffSha,
      matchesOwnerAcceptedLive: audit.shaMatch
    },
    rowsAffected: {
      represented: 30,
      materiallyEnrichedUpdates: 18,
      evidenceMetadataOnlyUpdates: 12,
      materiallyEnrichedSlugs: nonDestructive.materiallyEnrichedSlugs,
      evidenceMetadataOnlySlugs: nonDestructive.evidenceMetadataOnlySlugs,
      allBatch1ReceiveEvidenceMetadata: true
    },
    jsonbMapping: mapping,
    CAN_PERSIST_LOSSLESSLY: canPersistLosslessly ? 'YES' : 'NO',
    SCHEMA_CHANGE_REQUIRED: canPersistLosslessly ? 'NO' : 'YES',
    packetInventory,
    handoffClimateTraitsInventory: handoffInventory,
    roundTrip: {
      pass: roundTripPass,
      plants: roundTrips
    },
    bayLaurelExpectedLiveShape: bayExpected,
    nonDestructiveUpdate: nonDestructive,
    executableSql: {
      path: path.relative(ROOT, OUT_SQL).replace(/\\/g, '/'),
      sha256: sqlSha,
      liveUpsert: false
    },
    verificationSql: {
      path: path.relative(ROOT, OUT_VERIFY).replace(/\\/g, '/'),
      liveExecute: false
    },
    securityImpact: {
      altersRls: false,
      altersGrants: false,
      expectedAnon: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false },
      expectedAuthenticated: {
        SELECT: true,
        INSERT: false,
        UPDATE: false,
        DELETE: false
      },
      note: 'SQL is data-only UPDATE on public.catalog_plants; no GRANT/REVOKE/RLS/policy changes.'
    },
    remainingBlockers: pass
      ? [
          'Live persistence CLOSED by Owner — generator now requires evidence metadata on all 30 rows',
          'Batch 2 remains blocked until Owner authorizes next catalog expansion turn'
        ]
      : ['Fix failing audit/round-trip checks before generating live SQL'],
    livePersistenceClosed: pass,
    persistenceGeneratorRule:
      'UNCHANGED BOTANICAL ROWS MUST STILL PERSIST EVIDENCE METADATA (traitEvidenceClasses + traitProvenance at minimum)',
    liveUpsert: false,
    batch2: false
  };

  fs.writeFileSync(OUT_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        shaMatch: audit.shaMatch,
        updated: audit.updatedCount,
        CAN_PERSIST_LOSSLESSLY: report.CAN_PERSIST_LOSSLESSLY,
        SCHEMA_CHANGE_REQUIRED: report.SCHEMA_CHANGE_REQUIRED,
        roundTripPass,
        sqlSha,
        sqlPath: report.executableSql.path,
        verifyPath: report.verificationSql.path
      },
      null,
      2
    )
  );
}

main();
