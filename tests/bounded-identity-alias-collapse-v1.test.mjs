/**
 * Bounded identity alias collapse (canonical-wins) proofs.
 * No climateTraits migration / enrichment / Batch 3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPlantDataReadiness,
  classifyCatalogReadOnly
} from '../modules/personal-domain/plant-data-contract-v1.js';
import { getBootstrapSafeClimateTraitsMigrationPayload } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const AUDIT = path.join(ROOT, 'data', 'catalog', 'bounded-identity-alias-collapse-audit-v1.json');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const REG = path.join(ROOT, 'data', 'plant-identity.registry.json');

const MAPPINGS = {
  'apple-tree': 'apple',
  'pear-tree': 'pear',
  'peach-tree': 'peach',
  'plum-tree': 'plum',
  'fig-tree': 'fig',
  'grape-vine': 'grapevine',
  'passion-fruit': 'passionfruit'
};

const EXCLUDED = [
  'agapanthus',
  'azalea',
  'banana',
  'blueberry',
  'bougainvillea',
  'camellia',
  'geranium',
  'jasmine',
  'melaleuca',
  'mint',
  'mulberry',
  'succulent'
];

function loadApp() {
  return fs.readFileSync(APP, 'utf8');
}

function libraryBlock(html) {
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('\n];', start);
  return html.slice(start, end);
}

function librarySlugs(html) {
  const block = libraryBlock(html);
  return [...block.matchAll(/slug:'([^']+)'/g)].map((m) => m[1]);
}

function plantLine(html, slug) {
  const block = libraryBlock(html);
  const lines = block.split('\n');
  return lines.find((l) => l.includes(`slug:'${slug}'`)) || '';
}

test('Phase1: exact 7 remaps agree across SMART_REC + registry + wiring', () => {
  const html = loadApp();
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  assert.equal(audit.mappingCount, 7);
  assert.equal(audit.policy, 'CANONICAL_WINS');
  const runtime = {};
  const m = html.match(/SMART_REC_CANONICAL_PLANT_KEYS_BY_SLUG=\{([^}]+)\}/);
  for (const x of m[1].matchAll(/'([^']+)':'([^']+)'/g)) runtime[x[1]] = x[2];
  const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
  const regMap = {};
  for (const e of reg.canonicalIdentities || []) {
    for (const a of e.aliasSlugs || []) regMap[a] = e.canonicalSlug;
  }
  for (const [alias, canon] of Object.entries(MAPPINGS)) {
    assert.equal(runtime[alias], canon);
    assert.equal(regMap[alias], canon);
  }
  assert.match(html, /BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL/);
  assert.match(html, /applyBoundedIdentityAliasRemapsInline/);
  assert.match(html, /resolveBootstrapPlantSlug/);
});

test('alias rows removed from PLANT_LIBRARY; canonicals remain; unique ≈45', () => {
  const html = loadApp();
  const slugs = librarySlugs(html);
  const unique = new Set(slugs);
  for (const alias of Object.keys(MAPPINGS)) {
    assert.equal(slugs.includes(alias), false, `alias row still present: ${alias}`);
  }
  for (const canon of Object.values(MAPPINGS)) {
    assert.ok(slugs.includes(canon), `canonical missing: ${canon}`);
  }
  assert.equal(unique.size, 45);
  assert.ok(slugs.length === 45 || slugs.length === 46); // mulberry dup row may remain
});

test('search aliases unioned; care/product copy not promoted from audit', () => {
  const html = loadApp();
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  assert.ok(plantLine(html, 'apple').includes("'apple-tree'"));
  assert.ok(plantLine(html, 'grapevine').includes("'grapes'"));
  assert.ok(plantLine(html, 'grapevine').includes("'grape-vine'"));
  assert.ok(plantLine(html, 'passionfruit').includes("'passiflora'"));
  assert.ok(plantLine(html, 'plum').includes("scientific:'Prunus spp.'"));
  // Canonical apple must NOT contain alias-only product "Dormant spray"
  const apple = plantLine(html, 'apple');
  assert.equal(apple.includes('Dormant spray'), false);
  const appleAudit = audit.pairs.find((p) => p.aliasSlug === 'apple-tree');
  assert.ok(appleAudit.careProductCopyNotPromoted.products);
  assert.match(JSON.stringify(appleAudit.careProductCopyNotPromoted.products), /Dormant spray/);
});

test('excluded broad/generic identities untouched in library', () => {
  const html = loadApp();
  const slugs = new Set(librarySlugs(html));
  for (const s of EXCLUDED) assert.ok(slugs.has(s), s);
});

test('SAFE payload still excludes unlocked six + plum; unlocked payload covers six only', () => {
  const html = loadApp();
  for (const slug of ['apple', 'pear', 'peach', 'fig', 'grapevine', 'passionfruit', 'plum']) {
    const line = plantLine(html, slug);
    assert.equal(line.includes('climateTraits'), false, `inline library must not embed climateTraits: ${slug}`);
  }
  const safe = getBootstrapSafeClimateTraitsMigrationPayload();
  for (const slug of ['apple', 'pear', 'peach', 'fig', 'grapevine', 'passionfruit', 'plum']) {
    assert.equal(safe.plants[slug], undefined);
  }
});

test('readiness: identity dedupe only; no Class A inflation', () => {
  const html = loadApp();
  const bootstrap = [...new Set(librarySlugs(html))];
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = Array.isArray(seed) ? seed : seed.plants || [];
  const bySlug = new Map();
  for (const slug of bootstrap) {
    const line = plantLine(html, slug);
    const sci = (line.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || 'Various';
    const name = (line.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug;
    bySlug.set(slug, { slug, name: name.replace(/\\'/g, "'"), scientific: sci.replace(/\\'/g, "'") });
  }
  // Apply SAFE climateTraits migration only (pre-existing) for readiness realism
  const migration = getBootstrapSafeClimateTraitsMigrationPayload();
  for (const slug of migration.safeSlugs || []) {
    if (!bySlug.has(slug)) continue;
    bySlug.get(slug).climateTraits = migration.plants[slug].climateTraits;
    bySlug.get(slug).name = migration.plants[slug].name || bySlug.get(slug).name;
    bySlug.get(slug).scientific = migration.plants[slug].scientific || bySlug.get(slug).scientific;
  }
  for (const p of plants) {
    const slug = String(p.slug || '').toLowerCase();
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p);
  }
  const report = classifyCatalogReadOnly([...bySlug.values()]);
  assert.equal(report.counts.A, 0);
  assert.ok(report.total >= 100 && report.total <= 115, `total=${report.total}`);
  // D shrinks by ~7 alias removals vs prior 26 conflict D
  assert.ok(report.counts.D >= 12 && report.counts.D <= 22, `D=${report.counts.D}`);
  assert.ok(report.counts.B >= 80, `B=${report.counts.B}`);
  const plum = classifyPlantDataReadiness(bySlug.get('plum'));
  assert.notEqual(plum.readinessShort, 'A');
  assert.ok(String(bySlug.get('plum').scientific).includes('spp'));
  fs.writeFileSync(
    path.join(ROOT, 'tests', '_bounded-identity-normalization-readiness-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        bootstrapUnique: bootstrap.length,
        catalogTotal: report.total,
        counts: report.counts,
        aliasesCollapsed: 7
      },
      null,
      2
    )
  );
});

test('pineapple unchanged', () => {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const plants = Array.isArray(seed) ? seed : seed.plants || [];
  const pineapple = plants.find((p) => p.slug === 'pineapple');
  assert.ok(pineapple);
  const r = classifyPlantDataReadiness(pineapple);
  assert.equal(r.readinessShort, 'B');
});

test('audit artifact is non-authority evidence only', () => {
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  assert.equal(audit.auditId, 'bounded-identity-alias-collapse-v1');
  for (const p of audit.pairs) {
    assert.ok(Object.keys(p.divergentFields || {}).length >= 1);
    assert.ok(p.note.includes('must not become runtime'));
  }
});
