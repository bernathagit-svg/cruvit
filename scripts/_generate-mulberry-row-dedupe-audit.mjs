/**
 * Generate lossless audit for mulberry duplicate-row dedupe (canonical-wins).
 * Historical evidence only — not runtime suitability authority.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseMulberryRows(app) {
  const start = app.indexOf('const PLANT_LIBRARY=[');
  const end = app.indexOf('\n];', start);
  const block = app.slice(start, end);
  const parts = block.split(/\{slug:'/);
  const rows = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const slug = (one.match(/slug:'([^']+)'/) || [])[1];
    if (slug !== 'mulberry') continue;
    const get = (re) => ((one.match(re) || [])[1] || '').replace(/\\'/g, "'");
    const parseArr = (key) => {
      const m = one.match(new RegExp(key + ':(\\[[^\\]]*\\])'));
      if (!m) return [];
      try {
        return Function('return (' + m[1] + ')')();
      } catch {
        return [];
      }
    };
    rows.push({
      ordinal: rows.length + 1,
      libraryPartIndex: i,
      rawLine: one,
      fields: {
        slug,
        name: get(/name:'((?:\\'|[^'])*)'/),
        he: get(/he:'((?:\\'|[^'])*)'/),
        scientific: get(/scientific:'((?:\\'|[^'])*)'/),
        icon: get(/icon:'((?:\\'|[^'])*)'/),
        status: get(/status:'((?:\\'|[^'])*)'/),
        mark: get(/mark:'((?:\\'|[^'])*)'/),
        sun: get(/sun:'((?:\\'|[^'])*)'/),
        water: get(/water:'((?:\\'|[^'])*)'/),
        growth: get(/growth:'((?:\\'|[^'])*)'/),
        size: get(/size:'((?:\\'|[^'])*)'/),
        climate: get(/climate:'((?:\\'|[^'])*)'/),
        season: get(/season:'((?:\\'|[^'])*)'/),
        guide: get(/guide:'((?:\\'|[^'])*)'/),
        aliases: parseArr('aliases'),
        tags: parseArr('tags'),
        warnings: parseArr('warnings'),
        products: parseArr('products')
      },
      hasClimateTraits: one.includes('climateTraits')
    });
  }
  return rows;
}

export function buildMulberryRowDedupeAudit(appText = null) {
  const app = appText || fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const rows = parseMulberryRows(app);
  if (rows.length !== 2) {
    throw new Error(`STOP: expected exactly 2 mulberry rows, found ${rows.length}`);
  }
  if (!rows.every((r) => /Morus spp\.?/i.test(r.fields.scientific))) {
    throw new Error('STOP: scientific mismatch');
  }
  if (rows.some((r) => r.hasClimateTraits)) {
    throw new Error('STOP: climateTraits present — out of scope');
  }

  // Deterministic canonical = last-key-wins (current PLANT_INDEX runtime authority)
  const removed = rows[0];
  const retained = rows[1];

  const compareKeys = [
    'name',
    'he',
    'scientific',
    'icon',
    'status',
    'mark',
    'sun',
    'water',
    'growth',
    'size',
    'climate',
    'season',
    'guide',
    'aliases',
    'tags',
    'warnings',
    'products'
  ];
  const identical = [];
  const divergent = {};
  for (const k of compareKeys) {
    const a = JSON.stringify(removed.fields[k]);
    const b = JSON.stringify(retained.fields[k]);
    if (a === b) identical.push(k);
    else {
      divergent[k] = { removedRow: removed.fields[k], retainedCanonical: retained.fields[k] };
    }
  }

  const removedAliases = new Set((removed.fields.aliases || []).map(String));
  const retainedAliases = new Set((retained.fields.aliases || []).map(String));
  const searchOnlyUnion = [...removedAliases].filter((a) => !retainedAliases.has(a));
  // Species-looking strings stay search-only; never acceptedScientificName
  const speciesLookingSearchAliases = searchOnlyUnion.filter((a) =>
    /^(morus\s+(alba|nigra))$/i.test(a)
  );

  const registry = JSON.parse(
    fs.readFileSync(path.join(root, 'data', 'plant-identity.registry.json'), 'utf8')
  );
  const registryDup = (registry.duplicateConflicts || []).find((d) => d.slug === 'mulberry');

  return {
    auditId: 'mulberry-row-dedupe-v1',
    version: '1.0.0',
    policy: 'CANONICAL_WINS',
    note: 'Historical evidence only. Must not become runtime suitability authority. No climateTraits migration. No species selection.',
    parentCommit: '60c1000ee00f5298ef53d723254ff3444bdf2164',
    generatedAt: new Date().toISOString(),
    duplicateSlug: 'mulberry',
    scientificTruth: 'Morus spp.',
    selectionRule:
      'Retain last PLANT_LIBRARY mulberry row (Object.fromEntries last-key-wins = current PLANT_INDEX authority). Remove first row. Do not pick by botanical quality.',
    retainedOrdinal: retained.ordinal,
    removedOrdinal: removed.ordinal,
    fieldsIdentical: identical,
    divergentFields: divergent,
    careProductCopyNotPromoted: Object.fromEntries(
      Object.entries(divergent).filter(([k]) =>
        ['status', 'water', 'climate', 'season', 'guide', 'warnings', 'products', 'he', 'growth', 'size'].includes(
          k
        )
      )
    ),
    aliasHandling: {
      unionSearchAliasesIntoCanonical: searchOnlyUnion,
      speciesLookingAliasesSearchOnly: speciesLookingSearchAliases,
      speciesLookingPromotedToScientificTruth: false,
      note: 'morus alba / morus nigra may remain search aliases only; scientific stays Morus spp.'
    },
    retainedSnapshot: retained.fields,
    removedSnapshot: removed.fields,
    registryDuplicateEvidence: registryDup || null,
    runtimeBefore: {
      plantIndexBehavior: 'last-key-wins',
      activeAuthorityRowOrdinal: 2
    }
  };
}

const audit = buildMulberryRowDedupeAudit();
const outPath = path.join(root, 'data', 'catalog', 'mulberry-row-dedupe-audit-v1.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(audit, null, 2));
console.log(
  JSON.stringify(
    {
      ok: true,
      outPath,
      retainedOrdinal: audit.retainedOrdinal,
      removedOrdinal: audit.removedOrdinal,
      divergentKeys: Object.keys(audit.divergentFields),
      searchOnlyUnion: audit.aliasHandling.unionSearchAliasesIntoCanonical
    },
    null,
    2
  )
);

export { parseMulberryRows };
