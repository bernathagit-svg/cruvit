/**
 * Mulberry duplicate-row dedupe (canonical-wins) proofs.
 * No climateTraits migration / no species selection / no enrichment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyAllBootstrapStructuralClimateTraitsMigrations
} from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';
import {
  classifyCatalogReadOnly,
  classifyPlantDataReadiness
} from '../modules/personal-domain/plant-data-contract-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'app.html');
const AUDIT = path.join(ROOT, 'data', 'catalog', 'mulberry-row-dedupe-audit-v1.json');
const REGISTRY = path.join(ROOT, 'data', 'plant-identity.registry.json');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

const OTHER_D = [
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
  'plum',
  'succulent'
];

function loadApp() {
  return fs.readFileSync(APP, 'utf8');
}

function mulberryLines(html) {
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('\n];', start);
  const block = html.slice(start, end);
  return [...block.matchAll(/\{slug:'mulberry'[^]*?(?=\n|$)/g)].map((m) => m[0]);
}

function plantLine(html, slug) {
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('\n];', start);
  const block = html.slice(start, end);
  const parts = block.split(/\{slug:'/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const s = (one.match(/slug:'([^']+)'/) || [])[1];
    if (s === slug) return one;
  }
  return '';
}

function librarySlugs(html) {
  const start = html.indexOf('const PLANT_LIBRARY=[');
  const end = html.indexOf('\n];', start);
  const block = html.slice(start, end);
  return [...block.matchAll(/slug:'([^']+)'/g)].map((m) => m[1]);
}

test('PHASE1/4: exactly one mulberry row; Morus spp.; no climateTraits', () => {
  const html = loadApp();
  const lines = mulberryLines(html);
  assert.equal(lines.length, 1);
  const line = plantLine(html, 'mulberry');
  assert.match(line, /scientific:'Morus spp\.'/);
  assert.equal(line.includes('climateTraits'), false);
  assert.match(line, /water:'Medium when young; drought tolerant once established'/);
});

test('audit artifact is lossless historical evidence only', () => {
  const audit = JSON.parse(fs.readFileSync(AUDIT, 'utf8'));
  assert.equal(audit.auditId, 'mulberry-row-dedupe-v1');
  assert.equal(audit.policy, 'CANONICAL_WINS');
  assert.equal(audit.scientificTruth, 'Morus spp.');
  assert.equal(audit.retainedOrdinal, 2);
  assert.equal(audit.removedOrdinal, 1);
  assert.equal(audit.aliasHandling.speciesLookingPromotedToScientificTruth, false);
  assert.ok(audit.careProductCopyNotPromoted.water);
  assert.ok(audit.careProductCopyNotPromoted.guide);
  assert.ok(audit.careProductCopyNotPromoted.products);
  assert.match(audit.note, /Must not become runtime suitability authority/);
});

test('alias handling: morus alba/nigra search-only; not scientific truth', () => {
  const html = loadApp();
  const line = plantLine(html, 'mulberry');
  assert.match(line, /scientific:'Morus spp\.'/);
  assert.ok(line.includes("'morus alba'"));
  assert.ok(line.includes("'morus nigra'"));
  assert.equal(line.includes("scientific:'Morus alba'"), false);
  assert.equal(line.includes("scientific:'Morus nigra'"), false);
});

test('registry duplicate conflict marked resolved; still Morus spp.', () => {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const dup = (registry.duplicateConflicts || []).find((d) => d.slug === 'mulberry');
  assert.ok(dup);
  assert.equal(dup.resolutionStatus, 'resolved-row-dedupe-v1');
  assert.equal(dup.scientificAfter, 'Morus spp.');
  assert.equal(dup.speciesNotSelected, true);
  assert.equal(dup.climateTraitsMigrated, false);
});

test('other remaining-D identities untouched', () => {
  const html = loadApp();
  for (const slug of OTHER_D) {
    const line = plantLine(html, slug);
    assert.ok(line, slug);
    assert.equal(line.includes('climateTraits'), false, slug);
  }
  assert.match(plantLine(html, 'plum'), /scientific:'Prunus spp\.'/);
  assert.match(plantLine(html, 'succulent'), /scientific:'Various succulent species'/);
});

test('readiness: no Class A; mulberry remains D; catalog identities drop by 0 unique / 1 row', () => {
  const html = loadApp();
  const bootstrap = [...new Set(librarySlugs(html))];
  assert.equal(bootstrap.length, 45);
  assert.equal(librarySlugs(html).filter((s) => s === 'mulberry').length, 1);

  const index = Object.fromEntries(
    bootstrap.map((slug) => {
      const line = plantLine(html, slug);
      const sci = ((line.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(/\\'/g, "'");
      const name = ((line.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || slug).replace(/\\'/g, "'");
      return [slug, { slug, name, scientific: sci }];
    })
  );
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);

  const seedRaw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const bySlug = new Map(Object.values(index).map((p) => [p.slug, p]));
  for (const p of seed) {
    const s = String(p.slug || '').toLowerCase();
    if (s && !bySlug.has(s)) bySlug.set(s, p);
  }
  const report = classifyCatalogReadOnly([...bySlug.values()]);
  assert.equal(report.total, 108);
  assert.equal(report.counts.A, 0);
  assert.equal(report.counts.B, 95);
  assert.equal(report.counts.C, 0);
  assert.equal(report.counts.D, 13);
  const mulberry = classifyPlantDataReadiness(bySlug.get('mulberry'));
  assert.equal(mulberry.readinessShort, 'D');
  assert.match(String(bySlug.get('mulberry').scientific), /Morus spp/i);
  assert.equal(bySlug.get('mulberry').climateTraits, undefined);

  fs.writeFileSync(
    path.join(ROOT, 'tests', '_mulberry-row-dedupe-readiness-report.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        bootstrapUnique: bootstrap.length,
        mulberryRowCount: 1,
        catalogTotal: report.total,
        counts: report.counts,
        mulberryClass: mulberry.readinessShort,
        scientific: bySlug.get('mulberry').scientific,
        climateTraitsMigrated: false
      },
      null,
      2
    )
  );
});

test('pineapple / scoring / CHELSA guards', () => {
  const seedRaw = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const seed = Array.isArray(seedRaw) ? seedRaw : seedRaw.plants || [];
  const pineapple = seed.find((p) => p.slug === 'pineapple');
  assert.ok(pineapple);
  assert.equal(classifyPlantDataReadiness(pineapple).readinessShort, 'B');
  const html = loadApp();
  assert.equal(plantLine(html, 'mulberry').includes('climateTraits'), false);
});
