/**
 * Derive structural climateTraits migration for the 6 newly-unlocked species.
 * Same honesty rules as SAFE bootstrap migration — no invented facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERGE_CORE_DEFAULT_VALUES } from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

export const UNLOCKED_SIX_SLUGS = Object.freeze([
  'apple',
  'pear',
  'peach',
  'fig',
  'grapevine',
  'passionfruit'
]);

const EXPECTED_SCI = Object.freeze({
  apple: /Malus domestica/i,
  pear: /Pyrus communis/i,
  peach: /Prunus persica/i,
  fig: /Ficus carica/i,
  grapevine: /Vitis vinifera/i,
  passionfruit: /Passiflora edulis/i
});

const ALIAS_REMAPS = Object.freeze({
  apple: 'apple-tree',
  pear: 'pear-tree',
  peach: 'peach-tree',
  fig: 'fig-tree',
  grapevine: 'grape-vine',
  passionfruit: 'passion-fruit'
});

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
  return Function(`'use strict'; return (${slice.slice(braceStart, end + 1)});`)();
}

const GROUPS = extractObjectLiteral('const SMART_REC_CLIMATE_GROUPS=');
const ASSIGNMENTS = extractObjectLiteral('const SMART_REC_PLANT_GROUP_ASSIGNMENTS=');
const SPECIFIC = extractObjectLiteral('const SMART_REC_SPECIFIC_CLIMATE_METADATA=');

const libStart = app.indexOf('const PLANT_LIBRARY=[');
const libEnd = app.indexOf('\n];', libStart);
const libBlock = app.slice(libStart, libEnd);

function parseEntry(slug) {
  const parts = libBlock.split(/\{slug:'/);
  for (let i = 1; i < parts.length; i++) {
    const chunk = "{slug:'" + parts[i];
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const s = (one.match(/slug:'([^']+)'/) || [])[1];
    if (s !== slug) continue;
    const name = (one.match(/name:'((?:\\'|[^'])*)'/) || [])[1];
    const scientific = (one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1];
    const aliasesM = one.match(/aliases:(\[[^\]]*\])/);
    let aliases = [];
    if (aliasesM) {
      try {
        aliases = Function(`return (${aliasesM[1]})`)();
      } catch {
        aliases = [];
      }
    }
    return {
      slug,
      name: String(name || '').replace(/\\'/g, "'"),
      scientific: String(scientific || '').replace(/\\'/g, "'"),
      aliases: (aliases || []).map(String),
      hasClimateTraitsInline: one.includes('climateTraits')
    };
  }
  return null;
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
const TEXT = ['floweringRequirements', 'fruitingRequirements', 'survivalVsThriveNotes'];
const FLAGS = ['needsWinterChill', 'needsDrySeason', 'needsReview'];

function isExplicitScalar(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function collectExplicitFromSources(groupIds, specific) {
  const climateTraits = {};
  const fieldOrigins = {};
  const sources = [];
  const sourceAudit = { groupExplicit: {}, specificExplicit: {}, syntheticDefaultsNotCopied: [] };

  for (const gid of groupIds || []) {
    const g = GROUPS[gid];
    if (!g) continue;
    sources.push({ type: 'group', id: gid });
    for (const k of [...CORE, ...TEXT, ...FLAGS]) {
      if (Object.prototype.hasOwnProperty.call(g, k) && isExplicitScalar(g[k])) {
        climateTraits[k] = g[k];
        fieldOrigins[k] = 'LEGACY_ASSERTED_METADATA';
        sourceAudit.groupExplicit[k] = { groupId: gid, value: g[k] };
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
        sourceAudit.specificExplicit[k] = specific[k];
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

  // Track merge defaults that were NOT copied (honesty)
  for (const [k, def] of Object.entries(MERGE_CORE_DEFAULT_VALUES)) {
    if (climateTraits[k] == null) sourceAudit.syntheticDefaultsNotCopied.push(k);
    else if (
      String(climateTraits[k]) === String(def) &&
      fieldOrigins[k] !== 'LEGACY_ASSERTED_METADATA'
    ) {
      throw new Error(`synthetic default leaked for ${k}`);
    }
  }

  return { climateTraits, fieldOrigins, sources, sourceAudit };
}

const failures = [];
const plants = {};
const sourceTruth = {};

for (const slug of UNLOCKED_SIX_SLUGS) {
  const entry = parseEntry(slug);
  if (!entry) {
    failures.push({ slug, reason: 'missing-canonical-row' });
    continue;
  }
  if (!EXPECTED_SCI[slug].test(entry.scientific)) {
    failures.push({
      slug,
      reason: 'scientific-mismatch',
      scientific: entry.scientific
    });
    continue;
  }
  if (/\bspp\.?\b/i.test(entry.scientific) || /^various/i.test(entry.scientific)) {
    failures.push({ slug, reason: 'scientific-ambiguous', scientific: entry.scientific });
    continue;
  }
  // Alias row must not remain as library identity
  const alias = ALIAS_REMAPS[slug];
  if (libBlock.includes(`slug:'${alias}'`)) {
    failures.push({ slug, reason: 'alias-row-still-in-library', alias });
    continue;
  }
  if (!app.includes(`'${alias}':'${slug}'`)) {
    failures.push({ slug, reason: 'alias-remap-missing', alias });
    continue;
  }
  if (entry.hasClimateTraitsInline) {
    failures.push({ slug, reason: 'already-has-inline-climateTraits' });
    continue;
  }

  const hasAssign = Array.isArray(ASSIGNMENTS[slug]);
  const hasSpecific = SPECIFIC[slug] != null;
  if (!hasAssign && !hasSpecific) {
    failures.push({ slug, reason: 'no-explicit-legacy-climate-metadata' });
    continue;
  }

  const groupIds = hasAssign ? ASSIGNMENTS[slug].slice() : [];
  const { climateTraits, fieldOrigins, sources, sourceAudit } = collectExplicitFromSources(
    groupIds,
    SPECIFIC[slug] || null
  );
  if (groupIds.length) climateTraits.groupIds = groupIds.slice();

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
    kind: 'bootstrap-unlocked-species-structural-v1',
    provenance: 'LEGACY_ASSERTED_METADATA',
    sources
  };

  // Guard: no merge-default medium without LEGACY origin
  for (const k of Object.keys(MERGE_CORE_DEFAULT_VALUES)) {
    if (
      climateTraits[k] != null &&
      String(climateTraits[k]) === String(MERGE_CORE_DEFAULT_VALUES[k]) &&
      fieldOrigins[k] !== 'LEGACY_ASSERTED_METADATA'
    ) {
      failures.push({ slug, reason: `synthetic-default-promoted:${k}` });
    }
  }

  if (climateTraits.reproductiveBiology || climateTraits.quantitative) {
    failures.push({ slug, reason: 'invented-structured-biology' });
    continue;
  }

  plants[slug] = {
    slug,
    name: entry.name,
    scientific: entry.scientific,
    aliases: entry.aliases,
    climateTraits
  };
  sourceTruth[slug] = {
    groupIds,
    hasSpecific,
    migratedFields: Object.keys(fieldOrigins).sort(),
    absentCore: CORE.filter((k) => climateTraits[k] == null),
    floweringPresent: !!climateTraits.floweringRequirements,
    fruitingPresent: !!climateTraits.fruitingRequirements,
    sourceAudit
  };
}

if (failures.length || Object.keys(plants).length !== 6) {
  console.error(JSON.stringify({ ok: false, failures, plantCount: Object.keys(plants).length }, null, 2));
  process.exit(1);
}

const out = {
  migrationId: 'bootstrap-unlocked-six-climate-traits-v1',
  version: '1.0.0',
  kind: 'bootstrap-unlocked-species-structural-v1',
  generatedFrom: 'app.html SMART_REC groups/assignments/specific for unlocked six',
  note: 'Structural migration only for apple/pear/peach/fig/grapevine/passionfruit. LEGACY_ASSERTED_METADATA / HEURISTIC_ASSERTION. No SOURCE_SUPPORTED invented. Plum excluded.',
  unlockedCount: 6,
  unlockedSlugs: UNLOCKED_SIX_SLUGS.slice(),
  excluded: ['plum'],
  sourceTruth,
  plants
};

const outPath = path.join(
  root,
  'data',
  'catalog',
  'bootstrap-unlocked-six-climate-traits-migration-v1.json'
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

const dataModulePath = path.join(
  root,
  'modules',
  'personal-domain',
  'bootstrap-unlocked-six-climate-traits-migration-data-v1.js'
);
fs.writeFileSync(
  dataModulePath,
  `/** Auto-generated unlocked-six structural migration. Re-run scripts/_derive-unlocked-six-climate-migration.mjs */\n` +
    `export const BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(out, null, 2)};\n` +
    `export default BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1;\n`
);

const browserDataPath = path.join(
  root,
  'modules',
  'personal-domain',
  'bootstrap-unlocked-six-climate-traits-migration-data-v1.browser.js'
);
fs.writeFileSync(
  browserDataPath,
  `/** Auto-generated classic-script payload. Re-run scripts/_derive-unlocked-six-climate-migration.mjs */\n` +
    `(function(global){\n` +
    `  'use strict';\n` +
    `  global.__CRUVIT_BOOTSTRAP_UNLOCKED_SIX_CLIMATE_TRAITS_MIGRATION_V1 = ${JSON.stringify(out)};\n` +
    `})(typeof window !== 'undefined' ? window : globalThis);\n`
);

console.log(
  JSON.stringify(
    {
      ok: true,
      unlockedCount: 6,
      unlockedSlugs: UNLOCKED_SIX_SLUGS,
      sourceTruth: Object.fromEntries(
        Object.entries(sourceTruth).map(([k, v]) => [
          k,
          {
            migratedFields: v.migratedFields,
            floweringPresent: v.floweringPresent,
            fruitingPresent: v.fruitingPresent,
            absentCore: v.absentCore
          }
        ])
      ),
      outPath,
      dataModulePath,
      browserDataPath
    },
    null,
    2
  )
);
