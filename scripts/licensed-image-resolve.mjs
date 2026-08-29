#!/usr/bin/env node
/**
 * Licensed Image Pipeline V1 — resolve catalog plant images (non-runtime).
 *
 * Usage:
 *   node scripts/licensed-image-resolve.mjs --dry-run
 *   node scripts/licensed-image-resolve.mjs --apply --slugs=cacao,coconut,cypress,kiwi,plumeria
 *
 * Writes cache under data/catalog-media/cache/.
 * --apply merges IMAGE_READY / IMAGE_PENDING into plants.seed.json media (bounded).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_READY,
  IMAGE_PENDING,
  IMAGE_OWNER_REVIEW,
  LICENSED_IMAGE_PIPELINE_VERSION
} from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';
import { resolveLicensedImageForPlant } from '../modules/catalog-media/wikimedia-commons-source-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog-media', 'cache');

const DEFAULT_SLUGS = ['cacao', 'coconut', 'cypress', 'kiwi', 'plumeria'];

function parseArgs(argv) {
  const out = { apply: false, dryRun: true, slugs: DEFAULT_SLUGS, bypassCache: false };
  for (const a of argv) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    }
    if (a === '--dry-run') out.dryRun = true;
    if (a === '--bypass-cache') out.bypassCache = true;
    if (a.startsWith('--slugs=')) {
      out.slugs = a
        .slice('--slugs='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out;
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function fileCacheStore() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return {
    get(key) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      if (!fs.existsSync(fp)) return null;
      try {
        return JSON.parse(fs.readFileSync(fp, 'utf8'));
      } catch {
        return null;
      }
    },
    set(key, value) {
      const fp = path.join(CACHE_DIR, `${key.replace(/[^a-z0-9._-]+/gi, '_')}.json`);
      fs.writeFileSync(fp, JSON.stringify(value, null, 2) + '\n');
    }
  };
}

function mergeMediaIntoPlant(plant, resolution) {
  const prev = plant.media && typeof plant.media === 'object' ? { ...plant.media } : {};
  const next = { ...resolution.media };
  // Preserve non-image catalog hints
  if (prev.searchQuery && !next.searchQuery) next.searchQuery = prev.searchQuery;
  plant.media = next;
  if (resolution.status === IMAGE_READY) {
    plant.media.imageStatus = IMAGE_READY;
  } else if (resolution.status === IMAGE_OWNER_REVIEW) {
    plant.media.imageStatus = IMAGE_OWNER_REVIEW;
  } else {
    plant.media.imageStatus = IMAGE_PENDING;
  }
  return plant;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const doc = loadSeed();
  const bySlug = Object.fromEntries((doc.plants || []).map((p) => [p.slug, p]));
  const cacheStore = fileCacheStore();
  const results = [];

  for (const slug of args.slugs) {
    const plant = bySlug[slug];
    if (!plant) {
      results.push({ slug, error: 'not-in-seed' });
      continue;
    }
    const input = {
      slug: plant.slug,
      scientific: plant.scientific,
      commonName: plant.names?.en,
      names: plant.names
    };
    // polite pacing
    await new Promise((r) => setTimeout(r, 400));
    const resolution = await resolveLicensedImageForPlant(input, {
      cacheStore,
      bypassCache: args.bypassCache,
      limit: 12
    });
    results.push({
      slug,
      scientific: plant.scientific,
      status: resolution.status,
      fromCache: !!resolution.fromCache,
      searchMs: resolution.searchMs,
      licenseValidationMs: resolution.licenseValidationMs,
      candidateCount: resolution.candidateCount,
      passedCount: resolution.passedCount,
      license: resolution.media?.license || null,
      attributionRequired: resolution.media?.attributionRequired ?? null,
      pendingReason: resolution.media?.pendingReason || null,
      primaryUrl: resolution.media?.primaryUrl || null,
      rejectedSample: (resolution.rejected || []).slice(0, 5)
    });

    if (args.apply && !args.dryRun) {
      mergeMediaIntoPlant(plant, resolution);
    }
  }

  if (args.apply && !args.dryRun) {
    doc.plants = doc.plants.map((p) => bySlug[p.slug] || p);
    fs.writeFileSync(SEED, JSON.stringify(doc, null, 2) + '\n');
  }

  const reportPath = path.join(ROOT, 'tests', '_licensed-image-pipeline-v1-report.json');
  const report = {
    pipelineVersion: LICENSED_IMAGE_PIPELINE_VERSION,
    applied: !!(args.apply && !args.dryRun),
    results,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
