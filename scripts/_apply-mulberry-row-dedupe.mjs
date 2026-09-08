/**
 * Apply mulberry duplicate-row dedupe (canonical-wins) to app.html + registry.
 * Requires audit; does NOT migrate climateTraits; does NOT select Morus species.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMulberryRowDedupeAudit,
  parseMulberryRows
} from './_generate-mulberry-row-dedupe-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'app.html');
const registryPath = path.join(root, 'data', 'plant-identity.registry.json');
const auditPath = path.join(root, 'data', 'catalog', 'mulberry-row-dedupe-audit-v1.json');

let app = fs.readFileSync(appPath, 'utf8');
const audit = buildMulberryRowDedupeAudit(app);
fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));

const beforeRows = parseMulberryRows(app);
if (beforeRows.length !== 2) throw new Error('STOP: not exactly 2 mulberry rows');

const libStart = app.indexOf('const PLANT_LIBRARY=[');
const libEnd = app.indexOf('\n];', libStart);
if (libStart < 0 || libEnd < 0) throw new Error('PLANT_LIBRARY not found');

const head = app.slice(0, libStart);
const libBlock = app.slice(libStart, libEnd);
const tail = app.slice(libEnd);
const lines = libBlock.split('\n');

let mulberrySeen = 0;
const kept = [];
let removedLine = null;
let retainedLine = null;

for (const line of lines) {
  const m = line.match(/\{slug:'([^']+)'/);
  if (m && m[1] === 'mulberry') {
    mulberrySeen += 1;
    if (mulberrySeen === 1) {
      removedLine = line;
      continue; // remove first occurrence
    }
    // Second occurrence: union search aliases, keep care/product prose as-is
    let next = line;
    const extras = audit.aliasHandling.unionSearchAliasesIntoCanonical || [];
    if (extras.length) {
      const am = next.match(/aliases:(\[[^\]]*\])/);
      if (am) {
        let aliases;
        try {
          aliases = Function('return (' + am[1] + ')')();
        } catch {
          aliases = [];
        }
        const set = new Set(aliases.map(String));
        for (const a of extras) set.add(String(a));
        const nextLiteral =
          '[' + [...set].map((s) => `'${String(s).replace(/'/g, "\\'")}'`).join(',') + ']';
        next = next.replace(am[0], `aliases:${nextLiteral}`);
      }
    }
    // Ensure scientific remains Morus spp.
    if (!/scientific:'Morus spp\.'/.test(next)) {
      throw new Error('STOP: retained row scientific is not Morus spp.');
    }
    if (/climateTraits/.test(next)) {
      throw new Error('STOP: must not introduce climateTraits');
    }
    retainedLine = next;
    kept.push(next);
    continue;
  }
  kept.push(line);
}

if (mulberrySeen !== 2) throw new Error(`STOP: expected 2 mulberry encounters, got ${mulberrySeen}`);
if (!removedLine || !retainedLine) throw new Error('STOP: remove/retain lines missing');

while (kept.length > 1 && kept[kept.length - 1].trim() === '') kept.pop();

app = head + kept.join('\n') + tail;

const afterRows = parseMulberryRows(app);
if (afterRows.length !== 1) {
  throw new Error(`STOP: after apply expected 1 mulberry row, got ${afterRows.length}`);
}
if (!/Morus spp\.?/i.test(afterRows[0].fields.scientific)) {
  throw new Error('STOP: scientific regress');
}

fs.writeFileSync(appPath, app);

// Registry: surgical update of mulberry duplicateConflicts only (preserve file formatting)
const registryRaw = fs.readFileSync(registryPath, 'utf8');
if (!/"slug": "mulberry"/.test(registryRaw) || !/"resolutionStatus": "pending"/.test(registryRaw)) {
  // Allow re-apply if already resolved
  if (!/"resolutionStatus": "resolved-row-dedupe-v1"/.test(registryRaw)) {
    throw new Error('STOP: unexpected registry mulberry conflict state');
  }
} else {
  const nextRegistry = registryRaw.replace(
    /("slug": "mulberry",[\s\S]*?"resolutionStatus": )"pending",\n(\s*)"notes": "[^"]*"/,
    `$1"resolved-row-dedupe-v1",
$2"resolvedBy": "mulberry-row-dedupe-v1",
$2"retainedPolicy": "CANONICAL_WINS last-key-wins PLANT_LIBRARY row",
$2"scientificAfter": "Morus spp.",
$2"speciesNotSelected": true,
$2"climateTraitsMigrated": false,
$2"auditPath": "data/catalog/mulberry-row-dedupe-audit-v1.json",
$2"notes": "Two distinct records shared slug 'mulberry'. Collapsed to one PLANT_LIBRARY row via canonical-wins + lossless audit. Scientific remains Morus spp. (species not selected). Divergent care/product copy preserved in audit only."`
  );
  if (nextRegistry === registryRaw) throw new Error('STOP: registry surgical replace failed');
  fs.writeFileSync(registryPath, nextRegistry);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      removedOrdinal: 1,
      retainedOrdinal: 2,
      afterRowCount: afterRows.length,
      scientific: afterRows[0].fields.scientific,
      aliases: afterRows[0].fields.aliases,
      auditPath,
      registryUpdated: true
    },
    null,
    2
  )
);
