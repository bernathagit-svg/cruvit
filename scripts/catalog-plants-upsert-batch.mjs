#!/usr/bin/env node
/**
 * Upsert accepted seed plants into public.catalog_plants (service role only).
 *
 * Usage:
 *   node scripts/catalog-plants-upsert-batch.mjs --slugs=a,b,c
 *   node scripts/catalog-plants-upsert-batch.mjs --batch=bulk-batch-1-v1
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (never commit).
 * Idempotent on slug (onConflict).
 *
 * Row shape from seedPlantToCatalogRow:
 * - flowering_requirements / fruiting_requirements are JS string|null
 *   (jsonb string scalars after Supabase JSON encoding — parity with SQL to_jsonb(text))
 * - provenance is botanical array (not media.provenance)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { seedPlantToCatalogRow } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { BATCH1_PLANTS, BATCH_ID } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED_PATH = path.join(ROOT, 'data', 'plants.seed.json');

function loadEnvFile(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile('.env');
loadEnvFile('.env.local');

function parseArgs(argv) {
  const out = { slugs: null, batch: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    if (a.startsWith('--slugs=')) {
      out.slugs = a
        .slice('--slugs='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (a.startsWith('--batch=')) out.batch = a.slice('--batch='.length);
  }
  return out;
}

function main() {
  return (async () => {
    const args = parseArgs(process.argv);
    let slugs = args.slugs;
    if (!slugs && (args.batch === 'bulk-batch-1-v1' || args.batch === BATCH_ID)) {
      slugs = BATCH1_PLANTS.map((p) => p.slug);
    }
    if (!slugs || !slugs.length) {
      console.error('Provide --slugs=a,b or --batch=bulk-batch-1-v1');
      process.exit(2);
    }

    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8').replace(/^\uFEFF/, ''));
    const plants = slugs.map((slug) => {
      const p = (seed.plants || []).find((x) => x.slug === slug);
      if (!p) throw new Error(`seed missing slug: ${slug}`);
      return p;
    });
    const rows = plants.map((p) =>
      seedPlantToCatalogRow(p, {
        catalogVersion: '1.0.0',
        // Fallback only; mapper prefers plant.source.recordId (per-plant packetId).
        sourcePacket: BATCH_ID
      })
    );
    for (const row of rows) {
      if (row.verification_state === 'verified' && (!row.provenance || row.provenance.length < 1)) {
        throw new Error(`refusing upsert: verified with empty botanical provenance: ${row.slug}`);
      }
    }

    if (args.dryRun) {
      console.log(JSON.stringify({ dryRun: true, count: rows.length, slugs: rows.map((r) => r.slug) }, null, 2));
      return;
    }

    const url = String(process.env.SUPABASE_URL || '').trim();
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) {
      console.error(
        JSON.stringify({
          ok: false,
          error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for catalog_plants upsert'
        })
      );
      process.exit(3);
    }

    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client
      .from('catalog_plants')
      .upsert(rows, { onConflict: 'slug' })
      .select('slug,media_status,needs_review,verification_state,updated_at');

    if (error) {
      console.error(JSON.stringify({ ok: false, error: error.message, code: error.code }, null, 2));
      process.exit(1);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          upserted: (data || []).length,
          rows: data
        },
        null,
        2
      )
    );
  })();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
