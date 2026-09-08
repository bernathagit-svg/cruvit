/**
 * Generate lossless audit for 7 bounded identity alias merges (canonical-wins).
 * Also used to extract search-only aliases safe to union.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

export const BOUNDED_IDENTITY_ALIAS_TO_CANONICAL = Object.freeze({
  'apple-tree': 'apple',
  'pear-tree': 'pear',
  'peach-tree': 'peach',
  'plum-tree': 'plum',
  'fig-tree': 'fig',
  'grape-vine': 'grapevine',
  'passion-fruit': 'passionfruit'
});

const PRODUCT_KEYS = [
  'name',
  'he',
  'scientific',
  'status',
  'mark',
  'icon',
  'sun',
  'water',
  'growth',
  'size',
  'climate',
  'season',
  'guide',
  'tags',
  'warnings',
  'products'
];

function parseEntries(libBlock) {
  const entries = [];
  const parts = libBlock.split(/\{slug:'/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const get = (re) => {
      const m = one.match(re);
      return m ? String(m[1]).replace(/\\'/g, "'") : '';
    };
    const parseArr = (re) => {
      const m = one.match(re);
      if (!m) return [];
      try {
        return Function(`return (${m[1]})`)();
      } catch {
        return [];
      }
    };
    entries.push({
      slug: get(/slug:'([^']+)'/),
      name: get(/name:'((?:\\'|[^'])*)'/),
      he: get(/he:'((?:\\'|[^'])*)'/),
      scientific: get(/scientific:'((?:\\'|[^'])*)'/),
      status: get(/status:'((?:\\'|[^'])*)'/),
      mark: get(/mark:'((?:\\'|[^'])*)'/),
      icon: get(/icon:'((?:\\'|[^'])*)'/),
      sun: get(/sun:'((?:\\'|[^'])*)'/),
      water: get(/water:'((?:\\'|[^'])*)'/),
      growth: get(/growth:'((?:\\'|[^'])*)'/),
      size: get(/size:'((?:\\'|[^'])*)'/),
      climate: get(/climate:'((?:\\'|[^'])*)'/),
      season: get(/season:'((?:\\'|[^'])*)'/),
      guide: get(/guide:'((?:\\'|[^'])*)'/),
      aliases: parseArr(/aliases:(\[[^\]]*\])/),
      tags: parseArr(/tags:(\[[^\]]*\])/),
      warnings: parseArr(/warnings:(\[[^\]]*\])/),
      products: parseArr(/products:(\[[^\]]*\])/)
    });
  }
  return entries;
}

function norm(v) {
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return String(v ?? '');
}

export function buildBoundedIdentityAliasAudit(appHtml = app) {
  const libStart = appHtml.indexOf('const PLANT_LIBRARY=[');
  const libEnd = appHtml.indexOf('\n];', libStart);
  const block = appHtml.slice(libStart, libEnd);
  const entries = parseEntries(block);
  const bySlug = Object.fromEntries(entries.map((e) => [e.slug, e]));

  const runtime = {};
  const remapMatch = appHtml.match(/SMART_REC_CANONICAL_PLANT_KEYS_BY_SLUG=\{([^}]+)\}/);
  if (remapMatch) {
    for (const m of remapMatch[1].matchAll(/'([^']+)':'([^']+)'/g)) runtime[m[1]] = m[2];
  }

  const reg = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'plant-identity.registry.json'), 'utf8')
  );
  const regMap = {};
  for (const e of reg.canonicalIdentities || []) {
    for (const a of e.aliasSlugs || []) regMap[a] = e.canonicalSlug;
  }

  const pairs = [];
  for (const [alias, canon] of Object.entries(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL)) {
    const a = bySlug[alias];
    const c = bySlug[canon];
    if (!a || !c) throw new Error(`missing row ${alias} or ${canon}`);
    const identical = [];
    const divergent = {};
    for (const k of PRODUCT_KEYS) {
      if (norm(a[k]) === norm(c[k])) identical.push(k);
      else divergent[k] = { alias: a[k], canonical: c[k] };
    }
    const searchAliasesToPreserve = [];
    for (const term of a.aliases || []) {
      const t = String(term);
      if (!(c.aliases || []).map(String).includes(t)) searchAliasesToPreserve.push(t);
    }
    // Always preserve the alias slug and common hyphen/space forms as search terms
    for (const term of [alias, alias.replace(/-/g, ' ')]) {
      if (!(c.aliases || []).map(String).includes(term) && !searchAliasesToPreserve.includes(term)) {
        searchAliasesToPreserve.push(term);
      }
    }

    pairs.push({
      aliasSlug: alias,
      canonicalSlug: canon,
      scientific: a.scientific,
      scientificMatch: a.scientific === c.scientific,
      fieldsIdentical: identical,
      divergentFields: divergent,
      aliasOnlySearchAliases: searchAliasesToPreserve,
      careProductCopyNotPromoted: {
        status: divergent.status || null,
        water: divergent.water || null,
        climate: divergent.climate || null,
        season: divergent.season || null,
        guide: divergent.guide || null,
        warnings: divergent.warnings || null,
        products: divergent.products || null,
        sun: divergent.sun || null,
        growth: divergent.growth || null,
        size: divergent.size || null,
        name: divergent.name || null,
        he: divergent.he || null,
        mark: divergent.mark || null
      },
      remapEvidence: {
        smartRecCanonicalKey: runtime[alias] || null,
        registryAlias: regMap[alias] || null
      },
      note: 'Canonical-wins. Divergent care/product/warning/guide copy is audit-only and must not become runtime plant authority.'
    });
  }

  return {
    auditId: 'bounded-identity-alias-collapse-v1',
    version: '1.0.0',
    policy: 'CANONICAL_WINS',
    generatedAt: new Date().toISOString(),
    parentCommit: '5c9e1905e4dbcc35a0d677cdbd270a401d4b1bfe',
    mappingCount: pairs.length,
    mappings: { ...BOUNDED_IDENTITY_ALIAS_TO_CANONICAL },
    pairs,
    runtimeRemapsMatch: Object.entries(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL).every(
      ([a, c]) => runtime[a] === c
    ),
    registryRemapsMatch: Object.entries(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL).every(
      ([a, c]) => regMap[a] === c
    )
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const audit = buildBoundedIdentityAliasAudit();
  if (!audit.runtimeRemapsMatch || !audit.registryRemapsMatch || audit.mappingCount !== 7) {
    console.error('STOP: mapping mismatch', {
      runtimeRemapsMatch: audit.runtimeRemapsMatch,
      registryRemapsMatch: audit.registryRemapsMatch,
      mappingCount: audit.mappingCount
    });
    process.exit(1);
  }
  const outPath = path.join(
    root,
    'data',
    'catalog',
    'bounded-identity-alias-collapse-audit-v1.json'
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ ok: true, outPath, mappingCount: audit.mappingCount }, null, 2));
}
