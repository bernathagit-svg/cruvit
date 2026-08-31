-- CRUVIT Scalable Catalog Ingestion V1 — POST-WRITE VERIFY
-- batchId=synthetic-benchmark-30-v1
-- contentSha256=a32219f4f062fc768613760a64efaa2781e7eb2a35cfbe2f5a0d8162ce42115b
-- plantCount=30

SELECT COUNT(*) AS target_rows
FROM public.catalog_plants
WHERE slug IN ('synthetic-bench30-0001', 'synthetic-bench30-0002', 'synthetic-bench30-0003', 'synthetic-bench30-0004', 'synthetic-bench30-0005', 'synthetic-bench30-0006', 'synthetic-bench30-0007', 'synthetic-bench30-0008', 'synthetic-bench30-0009', 'synthetic-bench30-0010', 'synthetic-bench30-0011', 'synthetic-bench30-0012', 'synthetic-bench30-0013', 'synthetic-bench30-0014', 'synthetic-bench30-0015', 'synthetic-bench30-0016', 'synthetic-bench30-0017', 'synthetic-bench30-0018', 'synthetic-bench30-0019', 'synthetic-bench30-0020', 'synthetic-bench30-0021', 'synthetic-bench30-0022', 'synthetic-bench30-0023', 'synthetic-bench30-0024', 'synthetic-bench30-0025', 'synthetic-bench30-0026', 'synthetic-bench30-0027', 'synthetic-bench30-0028', 'synthetic-bench30-0029', 'synthetic-bench30-0030');

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
WHERE slug IN ('synthetic-bench30-0001', 'synthetic-bench30-0002', 'synthetic-bench30-0003', 'synthetic-bench30-0004', 'synthetic-bench30-0005', 'synthetic-bench30-0006', 'synthetic-bench30-0007', 'synthetic-bench30-0008', 'synthetic-bench30-0009', 'synthetic-bench30-0010', 'synthetic-bench30-0011', 'synthetic-bench30-0012', 'synthetic-bench30-0013', 'synthetic-bench30-0014', 'synthetic-bench30-0015', 'synthetic-bench30-0016', 'synthetic-bench30-0017', 'synthetic-bench30-0018', 'synthetic-bench30-0019', 'synthetic-bench30-0020', 'synthetic-bench30-0021', 'synthetic-bench30-0022', 'synthetic-bench30-0023', 'synthetic-bench30-0024', 'synthetic-bench30-0025', 'synthetic-bench30-0026', 'synthetic-bench30-0027', 'synthetic-bench30-0028', 'synthetic-bench30-0029', 'synthetic-bench30-0030');
