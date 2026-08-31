-- CRUVIT Batch 2 persistence verify
-- Metric A: FULL_EVIDENCE_METADATA_COUNT = all traitEvidenceClasses keys
-- Metric B: MATERIAL_SUITABILITY_EVIDENCE_COUNT = core traits + quantitative.* + reproductive.*
-- Material inventory frozen: SOURCE_SUPPORTED=248, HEURISTIC_ASSERTION=71, UNKNOWN=25

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
  WHERE slug IN ('hazelnut', 'chestnut', 'pecan', 'medlar', 'serviceberry', 'blackberry', 'blackcurrant', 'cranberry', 'elderberry', 'sea-buckthorn', 'soursop', 'sapodilla', 'tamarind', 'jujube', 'pitanga', 'asparagus', 'artichoke', 'rhubarb', 'sweet-potato', 'okra', 'parsley', 'cilantro', 'dill', 'oregano', 'chives', 'boxwood', 'clematis', 'flowering-dogwood', 'crepe-myrtle', 'yucca')
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
    WHEN c.total_rows = 30
      AND c.rows_with_trait_evidence_classes = 30
      AND c.image_ready = 30
      AND c.missing_source_packet = 0
      AND c.missing_media = 0
      AND c.flowering_mirror_missing = 0
      AND c.fruiting_mirror_missing = 0
      AND d.duplicate_slugs = 0
      AND s.duplicate_scientific_identities = 0
      AND m.source_supported = 248
      AND m.heuristic_assertion = 71
      AND m.unknown_count = 25
    THEN 'PASS'
    ELSE 'FAIL'
  END AS batch2_persistence_verify_gate
FROM counts c, dup_slug d, dup_sci s, full_inventory f, material_inventory m;
