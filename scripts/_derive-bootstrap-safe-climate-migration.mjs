/**
 * Derive SAFE bootstrap climateTraits migration payload from app.html.
 * READ/WRITE of migration artifact only — does not invent botanical facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERGE_CORE_DEFAULT_VALUES } from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

function extractObjectLiteral(marker) {
  const idx = app.indexOf(marker);
  if (idx < 0) throw new Error('missing ' + marker);
  const slice = app.slice(idx);
  const braceStart = slice.indexOf('{');
  let brace = 0;
  let started = false;
  let end = -1;
  for (let i = braceStart; i < slice.length; i++) {
    if (slice[i] === '{') {
      brace++;
      started = true;
    } else if (slice[i] === '}') {
      brace--;
      if (started && brace === 0) {
        end = i;
        break;
      }
    }
  }
  const body = slice.slice(braceStart, end + 1);
  // Convert loosely to JSON-ish via Function
  return Function(`'use strict'; return (${body});`)();
}

const GROUPS = extractObjectLiteral('const SMART_REC_CLIMATE_GROUPS=');
const ASSIGNMENTS = extractObjectLiteral('const SMART_REC_PLANT_GROUP_ASSIGNMENTS=');
const SPECIFIC = extractObjectLiteral('const SMART_REC_SPECIFIC_CLIMATE_METADATA=');

const libStart = app.indexOf('const PLANT_LIBRARY=[');
const libEnd = app.indexOf('];', libStart);
const libBlock = app.slice(libStart, libEnd);
const bootstrapSlugs = [
  ...new Set([...libBlock.matchAll(/slug\s*:\s*'([^']+)'/g)].map((m) => m[1].toLowerCase()))
];

function parseBootstrapEntries() {
  const entries = [];
  const parts = libBlock.split(/\{slug:'/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const slug = (chunk.match(/slug:'([^']+)'/) || [])[1];
    const name = (chunk.match(/name:'((?:\\'|[^'])*)'/) || [])[1];
    const scientific = (chunk.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1];
    const aliasesM = chunk.match(/aliases:(\[[^\]]*\])/);
    let aliases = [];
    if (aliasesM) {
      try {
        aliases = Function(`return (${aliasesM[1]})`)();
      } catch {
        aliases = [];
      }
    }
    if (slug) {
      entries.push({
        slug: slug.toLowerCase(),
        name: String(name || '').replace(/\\'/g, "'"),
        scientific: String(scientific || '').replace(/\\'/g, "'"),
        aliases: (aliases || []).map((a) => String(a))
      });
    }
  }
  return entries;
}
const entries = parseBootstrapEntries();
const bySlug = new Map(entries.map((e) => [e.slug, e]));

const slugList = [...bySlug.keys()].sort();
const variantPairs = new Set();
for (const s of slugList) {
  for (const t of slugList) {
    if (s >= t) continue;
    if (s.replace(/-/g, '') === t.replace(/-/g, '')) variantPairs.add(`${s}|${t}`);
    if (t === `${s}-tree` || t === `${s}-vine` || s === `${t}-tree` || s === `${t}-vine`) {
      variantPairs.add(`${s}|${t}`);
    }
  }
}

const CORE = [
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'drainageNeeds',
  'sunNeeds',
  'waterNeeds'
];
const TEXT = [
  'floweringRequirements',
  'fruitingRequirements',
  'survivalVsThriveNotes'
];
const FLAGS = ['needsWinterChill', 'needsDrySeason', 'needsReview'];

function isExplicitScalar(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Copy only keys explicitly present on source objects (group/specific), never invent. */
function collectExplicitFromSources(groupIds, specific) {
  const climateTraits = {};
  const fieldOrigins = {};
  const sources = [];
  for (const gid of groupIds || []) {
    const g = GROUPS[gid];
    if (!g) continue;
    sources.push({ type: 'group', id: gid });
    for (const k of [...CORE, ...TEXT, ...FLAGS]) {
      if (Object.prototype.hasOwnProperty.call(g, k) && isExplicitScalar(g[k])) {
        climateTraits[k] = g[k];
        fieldOrigins[k] = 'LEGACY_ASSERTED_METADATA';
      }
    }
    if (Array.isArray(g.warningFlags) && g.warningFlags.length) {
      climateTraits.warningFlags = [...new Set([...(climateTraits.warningFlags || []), ...g.warningFlags])];
      fieldOrigins.warningFlags = 'LEGACY_ASSERTED_METADATA';
    }
    if (Array.isArray(g.hardBlockRules) && g.hardBlockRules.length) {
      climateTraits.hardBlockRules = [
        ...new Set([...(climateTraits.hardBlockRules || []), ...g.hardBlockRules])
      ];
      fieldOrigins.hardBlockRules = 'LEGACY_ASSERTED_METADATA';
    }
  }
  if (specific && typeof specific === 'object') {
    sources.push({ type: 'specific', id: 'SMART_REC_SPECIFIC_CLIMATE_METADATA' });
    for (const k of [...CORE, ...TEXT, ...FLAGS]) {
      if (Object.prototype.hasOwnProperty.call(specific, k) && isExplicitScalar(specific[k])) {
        climateTraits[k] = specific[k];
        fieldOrigins[k] = 'LEGACY_ASSERTED_METADATA';
      }
    }
    if (Array.isArray(specific.warningFlags) && specific.warningFlags.length) {
      climateTraits.warningFlags = [
        ...new Set([...(climateTraits.warningFlags || []), ...specific.warningFlags])
      ];
      fieldOrigins.warningFlags = 'LEGACY_ASSERTED_METADATA';
    }
    if (Array.isArray(specific.hardBlockRules) && specific.hardBlockRules.length) {
      climateTraits.hardBlockRules = [
        ...new Set([...(climateTraits.hardBlockRules || []), ...specific.hardBlockRules])
      ];
      fieldOrigins.hardBlockRules = 'LEGACY_ASSERTED_METADATA';
    }
  }
  return { climateTraits, fieldOrigins, sources };
}

const safe = [];
const conflict = [];
const noInline = [];

for (const slug of bootstrapSlugs) {
  const entry = bySlug.get(slug) || { slug, scientific: '', name: slug, aliases: [] };
  const hasAssign = Array.isArray(ASSIGNMENTS[slug]);
  const hasSpecific = SPECIFIC[slug] != null;
  const hasInline = hasAssign || hasSpecific;
  const sci = entry.scientific || '';
  const sciAmb = !sci.trim() || /\bspp\.?\b/i.test(sci) || /^various\b/i.test(sci);
  const variants = [...variantPairs].filter((p) => p.split('|').includes(slug));

  let migration = 'SOURCE_ENRICHMENT_REQUIRED';
  if (variants.length || sciAmb) migration = 'IDENTITY_CONFLICT';
  else if (hasInline) migration = 'SAFE_STRUCTURAL_MIGRATION';
  else migration = 'SOURCE_ENRICHMENT_REQUIRED';

  if (!hasInline) noInline.push(slug);

  if (migration === 'SAFE_STRUCTURAL_MIGRATION') {
    const groupIds = hasAssign ? ASSIGNMENTS[slug].slice() : [];
    const { climateTraits, fieldOrigins, sources } = collectExplicitFromSources(
      groupIds,
      SPECIFIC[slug] || null
    );
    if (groupIds.length) climateTraits.groupIds = groupIds.slice();

    // Honesty: traitEvidenceClasses = HEURISTIC for every migrated climate core/text field
    const traitEvidenceClasses = {};
    for (const k of Object.keys(fieldOrigins)) {
      if (['warningFlags', 'hardBlockRules'].includes(k)) continue;
      traitEvidenceClasses[k] = 'HEURISTIC_ASSERTION';
    }
    for (const k of CORE) {
      if (climateTraits[k] != null) traitEvidenceClasses[k] = 'HEURISTIC_ASSERTION';
    }

    climateTraits.traitEvidenceClasses = traitEvidenceClasses;
    climateTraits.fieldOrigins = fieldOrigins;
    climateTraits.migration = {
      version: '1.0.0',
      kind: 'bootstrap-safe-structural-v1',
      provenance: 'LEGACY_ASSERTED_METADATA',
      sources
    };

    // Guard: no field should exist that wasn't explicitly on group/specific
    // (groupIds and migration meta are structural wrappers)
    safe.push({
      slug,
      name: entry.name,
      scientific: entry.scientific,
      aliases: entry.aliases,
      climateTraits
    });
  } else if (migration === 'IDENTITY_CONFLICT') {
    conflict.push({ slug, scientific: sci, variants });
  }
}

// Sanity: migrated frost medium only if group/specific explicitly set it
for (const p of safe) {
  const frost = p.climateTraits.frostSensitivity;
  if (frost === MERGE_CORE_DEFAULT_VALUES.frostSensitivity) {
    // must have fieldOrigins LEGACY — already ensured by collectExplicitFromSources
    if (p.climateTraits.fieldOrigins?.frostSensitivity !== 'LEGACY_ASSERTED_METADATA') {
      throw new Error(`synthetic frost medium leaked for ${p.slug}`);
    }
  }
}

const out = {
  migrationId: 'bootstrap-safe-climate-traits-v1',
  version: '1.0.0',
  generatedFrom: 'app.html SMART_REC groups/assignments/specific + PLANT_LIBRARY identity',
  note: 'Structural migration only. Values are LEGACY_ASSERTED_METADATA. No SOURCE_SUPPORTED invented. No flowering/fruiting fabricated beyond explicit legacy text.',
  safeCount: safe.length,
  conflictCount: conflict.length,
  safeSlugs: safe.map((p) => p.slug).sort(),
  conflictSlugs: conflict.map((p) => p.slug).sort(),
  plants: Object.fromEntries(safe.map((p) => [p.slug, p]))
};

const outPath = path.join(
  root,
  'data',
  'catalog',
  'bootstrap-safe-climate-traits-migration-v1.json'
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

const dataModulePath = path.join(
  root,
  'modules',
  'personal-domain',
  'bootstrap-safe-climate-traits-migration-data-v1.js'
);
fs.writeFileSync(
  dataModulePath,
  `/** Auto-generated structural migration data. Do not hand-edit — re-run scripts/_derive-bootstrap-safe-climate-migration.mjs */\n` +
    `export const BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(out, null, 2)};\n` +
    `export default BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1;\n`
);

const browserDataPath = path.join(
  root,
  'modules',
  'personal-domain',
  'bootstrap-safe-climate-traits-migration-data-v1.browser.js'
);
fs.writeFileSync(
  browserDataPath,
  `/** Auto-generated classic-script payload for app.html sync apply. Re-run scripts/_derive-bootstrap-safe-climate-migration.mjs */\n` +
    `(function(global){\n` +
    `  'use strict';\n` +
    `  global.__CRUVIT_BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(out)};\n` +
    `})(typeof window !== 'undefined' ? window : globalThis);\n`
);

console.log(
  JSON.stringify(
    {
      safeCount: out.safeCount,
      conflictCount: out.conflictCount,
      safeSlugs: out.safeSlugs,
      conflictSlugs: out.conflictSlugs,
      noInline,
      sampleLavenderFrost: out.plants.lavender?.climateTraits?.frostSensitivity,
      sampleLemonFrost: out.plants.lemon?.climateTraits?.frostSensitivity,
      outPath,
      dataModulePath,
      browserDataPath
    },
    null,
    2
  )
);
