#!/usr/bin/env node
/**
 * Catalog Images V1 — cover every active canonical Add Plant identity.
 *
 * Usage:
 *   node scripts/catalog-images-v1-execute.mjs --dry-run
 *   node scripts/catalog-images-v1-execute.mjs --apply
 *
 * Uses the existing Wikimedia licensed-image pipeline only. paid AI = 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_READY,
  IMAGE_BLOCKED,
  reuseCachedResolution,
  mediaCacheKey
} from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';
import { resolveLicensedImageForPlant } from '../modules/catalog-media/wikimedia-commons-source-v1.js';
import { isApprovedCatalogMediaRecord } from '../modules/catalog-media/licensed-catalog-media-runtime-v1.js';
import {
  buildActiveCanonicalImageCoverage,
  parsePlantLibraryIdentities,
  SPECIES_ALIAS_ONTO_CANONICAL
} from '../modules/catalog-media/active-canonical-image-coverage-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const APP = path.join(ROOT, 'app.html');
const CACHE_DIR = path.join(ROOT, 'data', 'catalog-media', 'cache');
const MANIFEST = path.join(ROOT, 'data', 'catalog-media', 'active-canonical-image-manifest-v1.json');
const REPORT = path.join(ROOT, 'tests', '_catalog-images-v1-report.json');

function parseArgs(argv) {
  const out = { apply: false, dryRun: true };
  for (const a of argv) {
    if (a === '--apply') {
      out.apply = true;
      out.dryRun = false;
    }
    if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function findReadyCacheByScientific(scientific) {
  const sciKey = String(scientific || '')
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!sciKey) return null;
  if (!fs.existsSync(CACHE_DIR)) return null;
  const needle = sciKey.replace(/[^a-z0-9._-]+/gi, '_');
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (!name.endsWith('.json')) continue;
    if (!name.includes(needle) && !name.includes(`__${sciKey}__`)) continue;
    try {
      const cached = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8'));
      if (cached?.status === IMAGE_READY && cached?.media?.imageStatus === IMAGE_READY) {
        const cachedSci = String(cached.scientific || '').toLowerCase().replace(/\s+/g, '_');
        if (cachedSci === sciKey || cachedSci.replace(/[^a-z0-9._-]+/gi, '_') === needle) {
          return cached;
        }
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

function findReadyCacheFileBySlug(slug) {
  if (!fs.existsSync(CACHE_DIR)) return null;
  const prefix = `${String(slug).toLowerCase()}__`;
  for (const name of fs.readdirSync(CACHE_DIR)) {
    if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
    try {
      const cached = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, name), 'utf8'));
      if (cached?.status === IMAGE_READY && cached?.media?.imageStatus === IMAGE_READY) return cached;
    } catch {
      /* skip */
    }
  }
  return null;
}

function reuseExistingCatalogImage(input) {
  const cached = findReadyCacheByScientific(input.scientific);
  const direct = reuseCachedResolution(input, cached);
  if (direct) return { ...direct, reused: 'cache-scientific' };

  const aliasSlug = Object.entries(SPECIES_ALIAS_ONTO_CANONICAL).find(([, canon]) => canon === input.slug)?.[0];
  if (aliasSlug) {
    const aliasCache = findReadyCacheFileBySlug(aliasSlug);
    if (aliasCache?.media && aliasCache.media.cultivarSpecific !== true) {
      const media = {
        ...aliasCache.media,
        identityScope: input.identityScope === 'broad' ? 'broad' : aliasCache.media.identityScope || 'species',
        cultivarSpecific: false,
        canonicalPlantIdentity: input.slug,
        identityMatchMethod:
          input.identityScope === 'broad'
            ? 'genus-scope-reuse-of-licensed-alias-cache'
            : aliasCache.media.identityMatchMethod || 'binomial-in-metadata',
        fromCache: true
      };
      return { status: IMAGE_READY, media, fromCache: true, reused: 'cache-alias-canonical' };
    }
  }
  return null;
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

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

function pipelineInput(record, seedBySlug, libraryBySlug) {
  const seed = seedBySlug.get(record.slug);
  const lib = libraryBySlug.get(record.slug);
  return {
    slug: record.slug,
    scientific: seed?.scientific || lib?.scientific || record.scientific,
    commonName: seed?.names?.en || seed?.name || lib?.name || record.name,
    names: seed?.names || { en: record.name },
    identityScope: record.identityScope
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const before = buildActiveCanonicalImageCoverage(ROOT);
  const seedDoc = loadSeed();
  const seedBySlug = new Map((seedDoc.plants || []).map((p) => [p.slug, p]));
  const library = parsePlantLibraryIdentities(fs.readFileSync(APP, 'utf8'));
  const libraryBySlug = new Map(library.map((p) => [p.slug, p]));
  const cacheStore = fileCacheStore();

  const results = [];
  let newImagesAdded = 0;
  let existingReused = 0;
  const catalogMediaByCanonicalSlug = {
    ...(seedDoc.catalogMediaByCanonicalSlug && typeof seedDoc.catalogMediaByCanonicalSlug === 'object'
      ? seedDoc.catalogMediaByCanonicalSlug
      : {})
  };

  for (const record of before.records) {
    const seedPlant = seedBySlug.get(record.slug) || null;
    const input = pipelineInput(record, seedBySlug, libraryBySlug);
    if (!String(input.scientific || '').trim()) input.scientific = record.scientific;

    let resolution = null;
    let action = 'reused';

    if (seedPlant?.media && isApprovedCatalogMediaRecord(seedPlant.media, seedPlant).ok) {
      resolution = { status: IMAGE_READY, media: seedPlant.media, reused: 'seed', fromCache: true };
      existingReused += 1;
    } else {
      const cached = cacheStore.get(mediaCacheKey(input));
      const reused = reuseCachedResolution(input, cached);
      if (reused) {
        resolution = { ...reused, reused: 'cache' };
        existingReused += 1;
      } else {
        const sciReused = reuseExistingCatalogImage(input);
        if (sciReused) {
          resolution = sciReused;
          existingReused += 1;
        }
      }
    }

    if (!resolution) {
      await new Promise((r) => setTimeout(r, 400));
      resolution = await resolveLicensedImageForPlant(input, {
        cacheStore,
        bypassCache: true,
        limit: 12,
        retryDelayMs: 400
      });
      action = resolution.status === IMAGE_READY ? 'sourced' : 'blocked';
      if (resolution.status === IMAGE_READY) newImagesAdded += 1;
    }

    const media = resolution.media;
    if (media && (resolution.status === IMAGE_READY || resolution.status === IMAGE_BLOCKED)) {
      catalogMediaByCanonicalSlug[record.slug] = media;
      if (seedPlant && args.apply && !args.dryRun) {
        const prev = seedPlant.media && typeof seedPlant.media === 'object' ? { ...seedPlant.media } : {};
        seedPlant.media = { ...prev, ...media };
        if (prev.searchQuery && !seedPlant.media.searchQuery) {
          seedPlant.media.searchQuery = prev.searchQuery;
        }
      }
    }

    results.push({
      slug: record.slug,
      scientific: record.scientific,
      identityScope: record.identityScope,
      status: resolution.status,
      action,
      fromCache: !!resolution.fromCache,
      reused: resolution.reused || null,
      license: media?.license || null,
      sourcePageUrl: media?.sourcePageUrl || null,
      commercialUseAllowed: media?.commercialUseAllowed ?? null,
      blockedReason: media?.blockedReason || media?.pendingReason || null,
      primaryUrl: media?.primaryUrl || null,
      identityMatchMethod: media?.identityMatchMethod || null
    });
  }

  if (args.apply && !args.dryRun) {
    seedDoc.plants = seedDoc.plants.map((p) => seedBySlug.get(p.slug) || p);
    seedDoc.catalogMediaByCanonicalSlug = catalogMediaByCanonicalSlug;
    fs.writeFileSync(SEED, JSON.stringify(seedDoc, null, 2) + '\n');
  }

  const afterPreview = {
    imageReady: results.filter((r) => r.status === IMAGE_READY).length,
    imageBlocked: results.filter((r) => r.status === IMAGE_BLOCKED).length
  };

  const manifest = {
    version: '1.0.0',
    checkpoint: 'CATALOG_IMAGES_V1',
    generatedAt: new Date().toISOString(),
    applied: !!(args.apply && !args.dryRun),
    paidAiCalls: 0,
    activeCanonicalCount: before.activeCanonicalCount,
    imageReadyBefore: before.imageReadyCount,
    imageReadyAfter: afterPreview.imageReady,
    imageBlocked: afterPreview.imageBlocked,
    newImagesAdded,
    existingImagesReused: existingReused,
    aliasHandling: {
      speciesAliasOntoCanonical: SPECIES_ALIAS_ONTO_CANONICAL,
      aliasesObserved: before.aliasesObserved,
      note: 'Aliases and redirects do not receive separate image authority.'
    },
    identities: results,
    blocked: results.filter((r) => r.status === IMAGE_BLOCKED)
  };

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(REPORT, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        applied: manifest.applied,
        activeCanonicalCount: manifest.activeCanonicalCount,
        imageReadyBefore: manifest.imageReadyBefore,
        imageReadyAfter: manifest.imageReadyAfter,
        imageBlocked: manifest.imageBlocked,
        newImagesAdded,
        existingImagesReused: existingReused,
        blocked: manifest.blocked.map((b) => ({ slug: b.slug, reason: b.blockedReason }))
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
