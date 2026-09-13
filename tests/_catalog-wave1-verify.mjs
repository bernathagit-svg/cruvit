/**
 * Catalog Wave 1 post-apply verification (local, no paid AI).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plants.seed.json'), 'utf8'));
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/plant-identity.registry.json'), 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const report = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests/_catalog-wave1-selective-report.json'), 'utf8')
);

const plants = seed.plants || [];
const seedBySlug = new Map(plants.map((p) => [p.slug, p]));
const seedSlugs = plants.map((p) => p.slug);
const dupSeed = seedSlugs.filter((s, i) => seedSlugs.indexOf(s) !== i);

const libStart = html.indexOf('const PLANT_LIBRARY=[');
const libEnd = html.indexOf('];', libStart);
const libBlock = html.slice(libStart, libEnd);
const libSlugs = [...libBlock.matchAll(/slug\s*:\s*'([^']+)'/g)].map((m) => m[1]);
const dupLib = libSlugs.filter((s, i) => libSlugs.indexOf(s) !== i);

function findLibRow(slug) {
  const i = libBlock.indexOf(`slug:'${slug}'`);
  if (i < 0) return null;
  // rough slice to next slug or end
  const next = libBlock.indexOf(`slug:'`, i + 6);
  return libBlock.slice(i, next < 0 ? undefined : next);
}

function searchResolves(term) {
  const t = String(term).toLowerCase();
  // seed
  for (const p of plants) {
    const hay = [p.slug, p.name, p.scientific, ...(p.aliases || [])]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    if (hay.includes(t) || p.slug === t) return { layer: 'seed', slug: p.slug, scientific: p.scientific };
  }
  // library
  for (const slug of libSlugs) {
    const row = findLibRow(slug) || '';
    if (row.toLowerCase().includes(t) || slug === t) {
      const sci = (row.match(/scientific:'([^']*)'/) || [])[1];
      return { layer: 'library', slug, scientific: sci };
    }
  }
  // registry aliasSlugs
  for (const e of reg.canonicalIdentities || []) {
    const aliases = [...(e.aliasSlugs || []), ...(e.aliases || [])].map(String);
    if (e.canonicalSlug === t || aliases.some((a) => a.toLowerCase() === t || a.toLowerCase().includes(t))) {
      return { layer: 'registry', slug: e.canonicalSlug };
    }
  }
  return null;
}

const expectedNew = [
  'strawberry',
  'lettuce',
  'spinach',
  'carrot',
  'broccoli',
  'zucchini',
  'green-bean',
  'garden-pea',
  'watermelon',
  'nasturtium',
  'borage',
  'french-marigold',
  'zinnia',
  'sweet-orange',
  'grapefruit'
];

const tests = [];
function check(name, ok, detail) {
  tests.push({ name, ok: !!ok, detail });
}

check('no_duplicate_seed_slugs', dupSeed.length === 0, dupSeed);
check('no_duplicate_library_slugs', dupLib.length === 0, dupLib);
check('no_seed_library_slug_overlap_new', expectedNew.every((s) => !libSlugs.includes(s)), {
  overlaps: expectedNew.filter((s) => libSlugs.includes(s))
});

const straw = searchResolves('strawberry');
check(
  'strawberry_search_resolves_fragaria',
  straw && straw.slug === 'strawberry' && /fragaria/i.test(straw.scientific || ''),
  straw
);

const guavaLib = findLibRow('strawberry-guava') || '';
const guavaSci = (guavaLib.match(/scientific:'([^']*)'/) || [])[1] || '';
check(
  'strawberry_guava_separate',
  libSlugs.includes('strawberry-guava') &&
    /Psidium/i.test(guavaSci) &&
    !/fragaria/i.test(guavaSci) &&
    seedBySlug.get('strawberry')?.slug === 'strawberry',
  { slug: 'strawberry-guava', scientific: guavaSci, strawberrySeed: seedBySlug.get('strawberry')?.scientific }
);

// Exact "strawberry" must not prefer guava slug as canonical
const strawHits = [];
for (const p of plants) {
  const hay = [p.slug, ...(p.aliases || [])].map((x) => String(x || '').toLowerCase());
  if (hay.includes('strawberry')) strawHits.push({ layer: 'seed', slug: p.slug });
}
for (const slug of libSlugs) {
  const row = findLibRow(slug) || '';
  const aliasesMatch = row.match(/aliases:(\[[^\]]*\])/);
  let aliases = [];
  try {
    aliases = aliasesMatch ? JSON.parse(aliasesMatch[1].replace(/'/g, '"')) : [];
  } catch {
    aliases = [];
  }
  if (slug === 'strawberry' || aliases.map(String).map((a) => a.toLowerCase()).includes('strawberry')) {
    strawHits.push({ layer: 'library', slug });
  }
}
check(
  'strawberry_exact_alias_not_guava',
  strawHits.length === 1 && strawHits[0].slug === 'strawberry',
  strawHits
);

const bell = searchResolves('bell pepper');
check('bell_pepper_to_sweet_pepper', bell && bell.slug === 'sweet-pepper', bell);
check('no_bell_pepper_canonical', !seedBySlug.has('bell-pepper') && !libSlugs.includes('bell-pepper'));

check('tomato_single', seedSlugs.filter((s) => s === 'tomato').length === 1 && !libSlugs.includes('tomato'));
check(
  'cucumber_single',
  seedSlugs.filter((s) => s === 'cucumber').length === 1 && !libSlugs.includes('cucumber')
);

const mangoRow = findLibRow('mango') || '';
check('mango_canonical', /scientific:'Mangifera indica'/.test(mangoRow));
check('mango_has_climateTraits', /climateTraits:/.test(mangoRow));
check('mango_legacy_not_source_supported_invented', /LEGACY_ASSERTED_METADATA/.test(mangoRow));
check('mango_not_mangosteen', !/mangosteen/i.test(mangoRow));

const bananaRow = findLibRow('banana') || '';
check('banana_musa_spp', /scientific:'Musa spp\.'/.test(bananaRow));
check('banana_not_cavendish_forced', !/cavendish/i.test(bananaRow));

check('pineapple_still_seed', seedBySlug.has('pineapple'));

for (const s of expectedNew) {
  check(`add_plant_seed_${s}`, seedBySlug.has(s), { scientific: seedBySlug.get(s)?.scientific });
}

for (const s of [
  'apple',
  'pear',
  'peach',
  'apricot',
  'plum',
  'fig',
  'pomegranate',
  'blueberry',
  'raspberry'
]) {
  const row = findLibRow(s) || '';
  check(`upgrade_climate_${s}`, /climateTraits:/.test(row));
}

for (const [canon, term] of [
  ['lavender', 'english-lavender'],
  ['mint', 'spearmint'],
  ['hydrangea', 'bigleaf-hydrangea'],
  ['jasmine', 'common-jasmine'],
  ['bougainvillea', 'lesser-bougainvillea']
]) {
  const row = findLibRow(canon) || '';
  check(`alias_${term}_on_${canon}`, row.toLowerCase().includes(term.toLowerCase()));
  check(`no_fork_${term}`, !libSlugs.includes(term) && !seedBySlug.has(term));
}

check('report_blocked_empty', (report.blocked || []).length === 0, report.blocked);
check('paid_ai_zero', report.paidAiCalls === 0);
check('catalog_images_not_started', report.catalogImagesStarted === false);
check('all_batch3_not_ingested', report.allBatch3Ingested === false);
check('seed_count_78', seedSlugs.length === 78, seedSlugs.length);
check('library_count_45', libSlugs.length === 45, libSlugs.length);

// strawberry heat HEURISTIC not promoted in seed
const strawPlant = seedBySlug.get('strawberry');
const heatClass = strawPlant?.climateTraits?.traitEvidenceClasses?.heatTolerance;
check(
  'strawberry_heat_not_promoted_to_source_supported',
  heatClass !== 'SOURCE_SUPPORTED',
  heatClass
);

const failed = tests.filter((t) => !t.ok);
const out = {
  ok: failed.length === 0,
  passed: tests.filter((t) => t.ok).length,
  failed: failed.length,
  failures: failed,
  counts: { seed: seedSlugs.length, library: libSlugs.length, unionApprox: seedSlugs.length + libSlugs.length }
};
fs.writeFileSync(
  path.join(ROOT, 'tests/_catalog-wave1-verify.json'),
  JSON.stringify(out, null, 2) + '\n'
);
console.log(JSON.stringify(out, null, 2));
process.exit(failed.length ? 1 : 0);
