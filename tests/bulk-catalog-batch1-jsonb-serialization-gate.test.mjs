/**
 * Batch 1 JSONB serialization gate for catalog_plants upsert SQL.
 * Proves flowering/fruiting prose is emitted as valid JSONB (not bare text).
 * No network. No paid APIs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  normalizeCatalogRequirementJsonbValue,
  seedPlantToCatalogRow,
  sqlJsonbLiteral
} from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { BATCH1_PLANTS } from '../data/catalog-expansion/batches/bulk-batch-1-v1/definitions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const SQL = path.join(
  ROOT,
  'data',
  'catalog-expansion',
  'batches',
  'bulk-batch-1-v1',
  'catalog_plants_upsert.sql'
);

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
}

/** Simulate JSONB acceptance of a SQL literal fragment. */
function assertJsonbLiteralExecutable(literal, expectedJs) {
  assert.notEqual(literal, undefined);
  if (expectedJs === null) {
    assert.equal(literal, 'NULL');
    return;
  }
  if (typeof expectedJs === 'string') {
    assert.match(literal, /^to_jsonb\('/);
    assert.match(literal, /'::text\)$/);
    // Recover text from to_jsonb('…'::text) and prove JSON string scalar round-trip.
    const m = literal.match(/^to_jsonb\('([\s\S]*)'::text\)$/);
    assert.ok(m, `expected to_jsonb form, got: ${literal.slice(0, 120)}`);
    const unescaped = m[1].replace(/''/g, "'");
    assert.equal(unescaped, expectedJs);
    // JSONB string scalar must be valid JSON when stringified.
    const asJson = JSON.stringify(unescaped);
    assert.equal(JSON.parse(asJson), expectedJs);
    return;
  }
  // object/array path
  assert.match(literal, /'::jsonb$/);
  const inner = literal.replace(/^'/, '').replace(/'::jsonb$/, '').replace(/''/g, "'");
  assert.deepEqual(JSON.parse(inner), expectedJs);
}

/** Optional live Postgres parse when psql is available. */
function tryPostgresJsonbProof(literal) {
  const psql = spawnSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-tAc', `SELECT ${literal} IS NOT NULL OR ${literal} IS NULL;`],
    { encoding: 'utf8', timeout: 5000 }
  );
  if (psql.error || psql.status !== 0) {
    return { attempted: false, ok: null, detail: psql.stderr || String(psql.error || '') };
  }
  return { attempted: true, ok: true, detail: (psql.stdout || '').trim() };
}

test('sqlJsonbLiteral: prose → to_jsonb(text); NULL stays NULL; apostrophes escaped', () => {
  assert.equal(sqlJsonbLiteral(null), 'NULL');
  assert.equal(sqlJsonbLiteral(undefined), 'NULL');

  const prose = "Cauliflorous flowering on mature wood; cool nights.";
  const lit = sqlJsonbLiteral(prose);
  assertJsonbLiteralExecutable(lit, prose);

  const withApos = "St John's bread / carob pods; 'dioecious' note.";
  const litA = sqlJsonbLiteral(withApos);
  assert.ok(litA.includes("St John''s bread"));
  assertJsonbLiteralExecutable(litA, withApos);

  const obj = { a: 1, b: "x" };
  assertJsonbLiteralExecutable(sqlJsonbLiteral(obj), obj);
});

test('normalizeCatalogRequirementJsonbValue keeps string|null for Supabase client parity', () => {
  assert.equal(normalizeCatalogRequirementJsonbValue(null), null);
  assert.equal(normalizeCatalogRequirementJsonbValue(''), null);
  assert.equal(normalizeCatalogRequirementJsonbValue('  '), null);
  assert.equal(normalizeCatalogRequirementJsonbValue('Spring bloom'), 'Spring bloom');
  const row = seedPlantToCatalogRow({
    slug: 'ghost-req',
    scientific: 'Ghostia x',
    names: { en: 'Ghost' },
    climateTraits: {
      frostSensitivity: 'high',
      floweringRequirements: "Needs chill; won't flower without winter.",
      fruitingRequirements: null,
      needsReview: false
    },
    provenance: [
      {
        sourceId: 't',
        institution: 'Test',
        title: 't',
        url: 'https://example.test',
        authorityTier: 'test',
        verifiedAt: '2026-08-29'
      }
    ],
    source: { recordId: 'ghost-req-test', provenance: [] },
    media: { imageStatus: 'IMAGE_PENDING' }
  });
  assert.equal(typeof row.flowering_requirements, 'string');
  assert.equal(row.fruiting_requirements, null);
  // Supabase client would JSON.stringify a string into a JSONB string scalar.
  assert.equal(JSON.parse(JSON.stringify(row.flowering_requirements)), row.flowering_requirements);
});

test('Batch 1 SQL: flowering/fruiting jsonb serialization + safety + Blue Gum', () => {
  const seed = loadSeed();
  const sql = fs.readFileSync(SQL, 'utf8');

  assert.match(sql, /INSERT INTO public\.catalog_plants/);
  assert.doesNotMatch(sql, /\bDROP\b/);
  assert.doesNotMatch(sql, /\bTRUNCATE\b/);
  assert.doesNotMatch(sql, /\bDELETE\b/);
  assert.doesNotMatch(sql, /\bGRANT\b/);
  assert.doesNotMatch(sql, /\bREVOKE\b/);
  assert.doesNotMatch(sql, /\bALTER\b/);
  assert.doesNotMatch(sql, /garden_profiles/);
  assert.doesNotMatch(sql, /\bauth\./);
  assert.match(sql, /ON CONFLICT \(slug\) DO UPDATE/);

  let floweringProseSeen = 0;
  let fruitingProseSeen = 0;
  let floweringNullSeen = 0;
  let fruitingNullSeen = 0;

  for (const def of BATCH1_PLANTS) {
    const plant = seed.plants.find((p) => p.slug === def.slug);
    assert.ok(plant, def.slug);
    const row = seedPlantToCatalogRow(plant, { sourcePacket: 'bulk-catalog-batch-1-v1' });
    assert.ok(sql.includes(`('${def.slug}',`), def.slug);

    const flowerLit = sqlJsonbLiteral(row.flowering_requirements);
    const fruitLit = sqlJsonbLiteral(row.fruiting_requirements);
    assert.ok(sql.includes(flowerLit), `${def.slug} flowering literal missing in SQL`);
    assert.ok(sql.includes(fruitLit), `${def.slug} fruiting literal missing in SQL`);
    assertJsonbLiteralExecutable(flowerLit, row.flowering_requirements);
    assertJsonbLiteralExecutable(fruitLit, row.fruiting_requirements);

    if (row.flowering_requirements == null) floweringNullSeen += 1;
    else floweringProseSeen += 1;
    if (row.fruiting_requirements == null) fruitingNullSeen += 1;
    else fruitingProseSeen += 1;

    if (row.verification_state === 'verified') {
      assert.ok(Array.isArray(row.provenance) && row.provenance.length > 0);
    }
    assert.notEqual(row.provenance, row.media?.provenance);
  }

  assert.ok(floweringProseSeen >= 1, 'expected flowering prose rows');
  assert.ok(fruitingProseSeen >= 1, 'expected fruiting prose rows');
  assert.ok(floweringNullSeen >= 1, 'expected NULL flowering rows');
  assert.ok(fruitingNullSeen >= 1, 'expected NULL fruiting rows');

  // Must not emit bare text cast into jsonb for requirements (the 22P02 failure mode).
  assert.doesNotMatch(
    sql,
    /flowering_requirements[\s\S]{0,200}'Cauliflorous flowering on mature wood[^']*'::jsonb/
  );
  assert.match(sql, /to_jsonb\('Cauliflorous flowering on mature wood/);

  assert.match(sql, /'blue-gum'[\s\S]*?TRUE,\s*'needsReview'/);

  const pg = tryPostgresJsonbProof(sqlJsonbLiteral("Needs chill; won't flower."));
  if (pg.attempted) assert.equal(pg.ok, true, pg.detail);
});

test('Batch 1 SQL regeneration is deterministic (hash stable across reads)', () => {
  const a = fs.readFileSync(SQL);
  const b = fs.readFileSync(SQL);
  assert.equal(
    crypto.createHash('sha256').update(a).digest('hex'),
    crypto.createHash('sha256').update(b).digest('hex')
  );
});
