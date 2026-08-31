-- CRUVIT Plant Knowledge & Warnings V1 — verify (Owner / ChatGPT review)
-- Expect: 60 rows with plantKnowledge; climate botanical keys preserved.

-- 1) Coverage
SELECT COUNT(*) AS with_plant_knowledge
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric', 'hazelnut', 'chestnut', 'pecan', 'medlar', 'serviceberry', 'blackberry', 'blackcurrant', 'cranberry', 'elderberry', 'sea-buckthorn', 'soursop', 'sapodilla', 'tamarind', 'jujube', 'pitanga', 'asparagus', 'artichoke', 'rhubarb', 'sweet-potato', 'okra', 'parsley', 'cilantro', 'dill', 'oregano', 'chives', 'boxwood', 'clematis', 'flowering-dogwood', 'crepe-myrtle', 'yucca')
  AND climate_traits ? 'plantKnowledge'
  AND climate_traits->'plantKnowledge' ? 'plantKnowledgeContractVersion';

-- 2) Must be exactly 60
-- SELECT 60 AS expected;

-- 3) Non-destructive: traitEvidenceClasses still present for all 60
SELECT COUNT(*) AS with_trait_evidence_classes
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric', 'hazelnut', 'chestnut', 'pecan', 'medlar', 'serviceberry', 'blackberry', 'blackcurrant', 'cranberry', 'elderberry', 'sea-buckthorn', 'soursop', 'sapodilla', 'tamarind', 'jujube', 'pitanga', 'asparagus', 'artichoke', 'rhubarb', 'sweet-potato', 'okra', 'parsley', 'cilantro', 'dill', 'oregano', 'chives', 'boxwood', 'clematis', 'flowering-dogwood', 'crepe-myrtle', 'yucca')
  AND climate_traits ? 'traitEvidenceClasses'
  AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
  AND climate_traits->'traitEvidenceClasses' <> '{}'::jsonb;

-- 4) Sample confirmed toxicity plants
SELECT slug,
  climate_traits->'plantKnowledge'->'warnings' AS warnings
FROM public.catalog_plants
WHERE slug IN ('oleander','rhubarb','chinese-wisteria','boxwood','clematis','elderberry')
ORDER BY slug;

-- 5) plantKnowledge must not wipe traitEvidenceClasses (spot check)
SELECT slug
FROM public.catalog_plants
WHERE slug IN ('durian', 'mangosteen', 'breadfruit', 'acerola', 'longan', 'loquat', 'persimmon', 'feijoa', 'jaboticaba', 'white-sapote', 'sweet-cherry', 'english-walnut', 'red-currant', 'gooseberry', 'quince', 'carob', 'common-myrtle', 'bay-laurel', 'oleander', 'garden-peony', 'common-lilac', 'forsythia', 'southern-magnolia', 'chinese-wisteria', 'ginkgo', 'silver-birch', 'blue-gum', 'common-thyme', 'garden-sage', 'turmeric', 'hazelnut', 'chestnut', 'pecan', 'medlar', 'serviceberry', 'blackberry', 'blackcurrant', 'cranberry', 'elderberry', 'sea-buckthorn', 'soursop', 'sapodilla', 'tamarind', 'jujube', 'pitanga', 'asparagus', 'artichoke', 'rhubarb', 'sweet-potato', 'okra', 'parsley', 'cilantro', 'dill', 'oregano', 'chives', 'boxwood', 'clematis', 'flowering-dogwood', 'crepe-myrtle', 'yucca')
  AND climate_traits ? 'plantKnowledge'
  AND (
    NOT (climate_traits ? 'traitEvidenceClasses')
    OR climate_traits->'traitEvidenceClasses' = '{}'::jsonb
  );
