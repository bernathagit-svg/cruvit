/**
 * Apply bounded identity alias collapse (canonical-wins) to app.html.
 * Requires audit artifact already generated. Does NOT migrate climateTraits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOUNDED_IDENTITY_ALIAS_TO_CANONICAL,
  buildBoundedIdentityAliasAudit
} from './_generate-bounded-identity-alias-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'app.html');
let app = fs.readFileSync(appPath, 'utf8');

const audit = buildBoundedIdentityAliasAudit(app);
if (!audit.runtimeRemapsMatch || !audit.registryRemapsMatch || audit.mappingCount !== 7) {
  throw new Error('STOP: mapping mismatch before apply');
}

const aliasSlugs = new Set(Object.keys(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL));
const searchUnion = Object.fromEntries(
  audit.pairs.map((p) => [p.canonicalSlug, p.aliasOnlySearchAliases])
);

const libStart = app.indexOf('const PLANT_LIBRARY=[');
const libEnd = app.indexOf('\n];', libStart);
if (libStart < 0 || libEnd < 0) throw new Error('PLANT_LIBRARY block not found');

const head = app.slice(0, libStart);
const libBlock = app.slice(libStart, libEnd);
const tail = app.slice(libEnd);

// Split into object lines (each plant is one line starting with {slug: or space{slug:)
const lines = libBlock.split('\n');
const kept = [];
const removed = [];
for (const line of lines) {
  const m = line.match(/\{slug:'([^']+)'/);
  if (m && aliasSlugs.has(m[1])) {
    removed.push(m[1]);
    continue;
  }
  kept.push(line);
}
if (removed.length !== 7) {
  throw new Error(`expected remove 7 rows, removed ${removed.length}: ${removed.join(',')}`);
}

// Union search aliases into canonical rows
const SEARCH_SAFE = new Set(
  Object.values(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL)
    .flatMap((c) => searchUnion[c] || [])
    .concat(Object.keys(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL))
);

function unionAliasesInLine(line, slug) {
  const extras = searchUnion[slug];
  if (!extras || !extras.length) return line;
  const m = line.match(/aliases:(\[[^\]]*\])/);
  if (!m) return line;
  let aliases;
  try {
    aliases = Function(`return (${m[1]})`)();
  } catch {
    return line;
  }
  const set = new Set(aliases.map(String));
  for (const a of extras) set.add(String(a));
  const next = JSON.stringify([...set]);
  // Convert JSON double-quotes to single-quotes style used in app.html
  const nextLiteral = '[' + [...set].map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(',') + ']';
  return line.replace(m[0], `aliases:${nextLiteral}`);
}

for (let i = 0; i < kept.length; i++) {
  const m = kept[i].match(/\{slug:'([^']+)'/);
  if (m && searchUnion[m[1]]) {
    kept[i] = unionAliasesInLine(kept[i], m[1]);
  }
}

// Fix trailing commas: last plant object before ]; must not leave dangling empty lines oddly
// Remove trailing blank lines in kept after first line
while (kept.length > 1 && kept[kept.length - 1].trim() === '') kept.pop();
// Ensure last plant line ends without requiring comma before ];
const lastIdx = kept.length - 1;
if (lastIdx > 0) {
  // Find last object line
  for (let i = kept.length - 1; i >= 0; i--) {
    if (/\{slug:'/.test(kept[i])) {
      kept[i] = kept[i].replace(/\},?\s*$/, '}');
      break;
    }
  }
}

const newLib = kept.join('\n');
let next = head + newLib + tail;

// Insert identity remap wiring after PLANT_INDEX=
const marker = 'const PLANT_INDEX=Object.fromEntries(PLANT_LIBRARY.map(p=>[p.slug,p]));';
if (!next.includes(marker)) throw new Error('PLANT_INDEX marker missing');
if (!next.includes('applyBoundedIdentityAliasRemapsInline')) {
  const remapBlock = `
/* ── Bounded identity alias remaps (canonical-wins; resolve-on-read) ── */
const BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL={
  'apple-tree':'apple',
  'pear-tree':'pear',
  'peach-tree':'peach',
  'plum-tree':'plum',
  'fig-tree':'fig',
  'grape-vine':'grapevine',
  'passion-fruit':'passionfruit'
};
(function applyBoundedIdentityAliasRemapsInline(){
  Object.keys(BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL).forEach(alias=>{
    const canon=BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL[alias];
    const plant=PLANT_INDEX[canon];
    if(!plant) return;
    PLANT_INDEX[alias]=plant;
  });
  if(typeof window!=='undefined'){
    window.__cruvitBoundedIdentityAliasRemaps={
      version:'1.0.0',
      mappings:Object.assign({},BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL),
      aliasCount:Object.keys(BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL).length
    };
  }
})();
function resolveBootstrapPlantSlug(slug){
  const key=String(slug||'').trim().toLowerCase();
  if(!key) return key;
  return BOOTSTRAP_IDENTITY_ALIAS_TO_CANONICAL[key]||key;
}
`;
  next = next.replace(marker, marker + remapBlock);
}

// Ensure resolvePlantProfileRawLegacy and savePlantFromLibrary remap slugs
// Patch resolvePlantProfileRawLegacy to normalize slug keys
const legacyFn = `function resolvePlantProfileRawLegacy(slugOrPlant){`;
if (next.includes(legacyFn) && !next.includes('resolveBootstrapPlantSlug(key)')) {
  // Find the function body start and inject remap after key extraction
  next = next.replace(
    /function resolvePlantProfileRawLegacy\(slugOrPlant\)\{\s*if\(slugOrPlant&&typeof slugOrPlant==='object'\)[^\n]*\n\s*const key=/,
    (match) => match
  );
}

// Safer: patch known patterns for PLANT_INDEX lookup with remap helper
function patchLookup(src) {
  // savePlantFromLibrary
  src = src.replace(
    /function savePlantFromLibrary\(slug,source='My Garden',options=\{autoTasks:true,reminders:true\}\)\{\s*let ref=PLANT_INDEX\[slug\]/,
    `function savePlantFromLibrary(slug,source='My Garden',options={autoTasks:true,reminders:true}){
  slug=typeof resolveBootstrapPlantSlug==='function'?resolveBootstrapPlantSlug(slug):slug;
  let ref=PLANT_INDEX[slug]`
  );
  return src;
}
next = patchLookup(next);

// Patch resolvePlantProfileRawLegacy key path
next = next.replace(
  /function resolvePlantProfileRawLegacy\(slugOrPlant\)\{([\s\S]*?)const key=String\(([^;]+)\);/,
  (full, body, expr) => {
    if (full.includes('resolveBootstrapPlantSlug')) return full;
    return `function resolvePlantProfileRawLegacy(slugOrPlant){${body}const key=typeof resolveBootstrapPlantSlug==='function'?resolveBootstrapPlantSlug(String(${expr})) : String(${expr});`;
  }
);

fs.writeFileSync(appPath, next);

// Re-verify
const after = fs.readFileSync(appPath, 'utf8');
const afterLibStart = after.indexOf('const PLANT_LIBRARY=[');
const afterLibEnd = after.indexOf('\n];', afterLibStart);
const afterBlock = after.slice(afterLibStart, afterLibEnd);
for (const a of aliasSlugs) {
  if (afterBlock.includes(`slug:'${a}'`)) throw new Error(`alias row still in library: ${a}`);
}
for (const c of Object.values(BOUNDED_IDENTITY_ALIAS_TO_CANONICAL)) {
  if (!afterBlock.includes(`slug:'${c}'`)) throw new Error(`canonical missing: ${c}`);
}
if (!after.includes('applyBoundedIdentityAliasRemapsInline')) {
  throw new Error('remap wiring missing');
}

const unique = [...afterBlock.matchAll(/slug:'([^']+)'/g)].map((m) => m[1]);
console.log(
  JSON.stringify(
    {
      ok: true,
      removed,
      uniqueCount: new Set(unique).size,
      rowCount: unique.length,
      searchUnion
    },
    null,
    2
  )
);
