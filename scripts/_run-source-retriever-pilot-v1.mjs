/**
 * Run Source Retriever Pilot v1 — live fetch for 3 P1 plants; no catalog writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAllBootstrapStructuralClimateTraitsMigrations
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import {
  runSourceRetrieverPilot,
  PILOT_PLANT_SPECS
} from '../modules/personal-domain/source-retriever-pilot-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadCatalogPlants() {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const slug = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  const seedRaw = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'plants.seed.json'), 'utf8').replace(/^\uFEFF/, '')
  );
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const bySlug = new Map(Object.values(index).map((p) => [p.slug, p]));
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !bySlug.has(s)) bySlug.set(s, structuredClone(p));
  }
  return Object.fromEntries(bySlug);
}

const queueDoc = JSON.parse(
  fs.readFileSync(
    path.join(root, 'data', 'catalog', 'enrichment-queue', 'current-catalog-enrichment-queue-v1.json'),
    'utf8'
  )
);

console.log('PILOT PLANTS:');
for (const p of PILOT_PLANT_SPECS) {
  const job = queueDoc.jobs.find((j) => j.canonicalSlug === p.slug);
  console.log(
    JSON.stringify({
      slug: p.slug,
      scientificName: p.scientificName,
      whySafe: p.whySafe,
      jobId: job?.jobId,
      readiness: job?.currentReadinessClass,
      productGate: job?.productGate,
      enrichmentExecution: job?.enrichmentExecution,
      priority: job?.priority,
      gapCodes: job?.gapCodes,
      futureClaimTypes: job?.futureClaimTypes
    })
  );
}

const plantsBySlug = loadCatalogPlants();
const out = await runSourceRetrieverPilot({
  repoRoot: root,
  queueDoc,
  plantsBySlug
});

console.log(
  JSON.stringify(
    {
      ok: true,
      summaryPath: out.summaryPath,
      externalRequestCount: out.summary.externalRequestCount,
      cache: out.cacheStats,
      results: out.summary.results
    },
    null,
    2
  )
);
