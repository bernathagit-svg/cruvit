-- CRUVIT Scalable Catalog Ingestion V1 — POST-WRITE VERIFY
-- batchId=synthetic-knowledge-enrich-30
-- contentSha256=01fb7dcbedc807e74250b42c5e9909cdb28ab01f294dc9f391476d9b2aad8629
-- plantCount=30

SELECT COUNT(*) AS target_rows
FROM public.catalog_plants
WHERE slug IN ('synthetic-know-base-0001', 'synthetic-know-base-0002', 'synthetic-know-base-0003', 'synthetic-know-base-0004', 'synthetic-know-base-0005', 'synthetic-know-base-0006', 'synthetic-know-base-0007', 'synthetic-know-base-0008', 'synthetic-know-base-0009', 'synthetic-know-base-0010', 'synthetic-know-base-0011', 'synthetic-know-base-0012', 'synthetic-know-base-0013', 'synthetic-know-base-0014', 'synthetic-know-base-0015', 'synthetic-know-base-0016', 'synthetic-know-base-0017', 'synthetic-know-base-0018', 'synthetic-know-base-0019', 'synthetic-know-base-0020', 'synthetic-know-base-0021', 'synthetic-know-base-0022', 'synthetic-know-base-0023', 'synthetic-know-base-0024', 'synthetic-know-base-0025', 'synthetic-know-base-0026', 'synthetic-know-base-0027', 'synthetic-know-base-0028', 'synthetic-know-base-0029', 'synthetic-know-base-0030');

SELECT slug, COUNT(*) AS c
FROM public.catalog_plants
GROUP BY slug
HAVING COUNT(*) > 1;

SELECT lower(scientific_name) AS sci, COUNT(*) AS c
FROM public.catalog_plants
GROUP BY lower(scientific_name)
HAVING COUNT(*) > 1;

SELECT
  COUNT(*) FILTER (WHERE needs_review) AS needs_review_count,
  COUNT(*) FILTER (WHERE media_status = 'IMAGE_READY') AS image_ready,
  COUNT(*) FILTER (WHERE climate_traits ? 'traitEvidenceClasses') AS with_evidence,
  COUNT(*) FILTER (WHERE climate_traits ? 'plantKnowledge') AS with_knowledge
FROM public.catalog_plants
WHERE slug IN ('synthetic-know-base-0001', 'synthetic-know-base-0002', 'synthetic-know-base-0003', 'synthetic-know-base-0004', 'synthetic-know-base-0005', 'synthetic-know-base-0006', 'synthetic-know-base-0007', 'synthetic-know-base-0008', 'synthetic-know-base-0009', 'synthetic-know-base-0010', 'synthetic-know-base-0011', 'synthetic-know-base-0012', 'synthetic-know-base-0013', 'synthetic-know-base-0014', 'synthetic-know-base-0015', 'synthetic-know-base-0016', 'synthetic-know-base-0017', 'synthetic-know-base-0018', 'synthetic-know-base-0019', 'synthetic-know-base-0020', 'synthetic-know-base-0021', 'synthetic-know-base-0022', 'synthetic-know-base-0023', 'synthetic-know-base-0024', 'synthetic-know-base-0025', 'synthetic-know-base-0026', 'synthetic-know-base-0027', 'synthetic-know-base-0028', 'synthetic-know-base-0029', 'synthetic-know-base-0030');
