-- CRUVIT Batch 1 enrichment — post-write verification (DO NOT mix with upsert)
-- Run AFTER Owner applies catalog_plants_enrichment_upsert.sql
-- Handoff SHA-256: 5764e44a418d6daa4aa4e38cb0499e21b401e695e84374fac9e957178c35aca3
-- Expected packet inventory (authoritative): SS=189 H=125 U=11
-- Handoff climate_traits inventory (material fields mirrored into traitEvidenceClasses): SS=189 H=125 U=11

-- 1) Batch 1 count = 30
SELECT count(*) AS batch1_count
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric');
-- EXPECT: 30

-- 2) No duplicate slugs / scientific names within Batch 1
SELECT slug, count(*) FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric')
GROUP BY slug HAVING count(*) > 1;
-- EXPECT: 0 rows

SELECT scientific_name, count(*) FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric') AND scientific_name IS NOT NULL
GROUP BY scientific_name HAVING count(*) > 1;
-- EXPECT: 0 rows

-- 3) IMAGE_READY unchanged (=30 for Batch 1)
SELECT count(*) AS image_ready_count
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric') AND media_status = 'IMAGE_READY';
-- EXPECT: 30

-- 4) Blue Gum still needs_review
SELECT slug, needs_review, verification_state, climate_traits->>'needsReview' AS ct_needs_review
FROM public.catalog_plants WHERE slug = 'blue-gum';
-- EXPECT: needs_review = true

-- 5) source_packet + media preserved (non-null media object for Batch 1)
SELECT count(*) AS missing_source_packet
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric') AND (source_packet IS NULL OR btrim(source_packet) = '');
-- EXPECT: 0

SELECT count(*) AS missing_media
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric') AND (media IS NULL OR media = '{}'::jsonb);
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
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric')
  AND climate_traits ? 'traitEvidenceClasses'
  AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
  AND climate_traits->'traitEvidenceClasses' <> '{}'::jsonb;
-- EXPECT: 30

SELECT slug
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric')
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
  WHERE c.slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric')
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
    WHERE c.slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric')
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
WHERE slug IN ('mangosteen', 'breadfruit', 'acerola', 'longan', 'jaboticaba', 'white-sapote', 'red-currant', 'gooseberry', 'common-myrtle', 'garden-peony', 'blue-gum', 'turmeric')
  AND climate_traits->'traitEvidenceClasses'->>'frostSensitivity' IS NOT NULL;
-- EXPECT: 12
