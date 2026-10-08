/** Generate/check the browser-safe projection. Default --check never writes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { deriveCanonicalAliasAuthority } from '../modules/identity/canonical-alias-authority-v1.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = 'data/plant-identity.registry.json';
const target = 'modules/identity/canonical-alias-authority-data-v1.js';
const bytes = fs.readFileSync(path.join(ROOT, source));
const registry = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
const projection = deriveCanonicalAliasAuthority(registry, digest);
const output = '/** GENERATED from ' + source + '. Do not edit; run generator --check/--write. */\n'
  + 'const data = ' + JSON.stringify(projection, null, 2) + ';\n'
  + 'Object.freeze(data.canonicalSlugs);\nObject.freeze(data.aliases);\n'
  + 'export const CANONICAL_ALIAS_DATA = Object.freeze(data);\n';
const mode = process.argv[2] || '--check';
if (!['--check', '--write'].includes(mode)) throw new Error('USAGE: --check|--write');
if (mode === '--write') fs.writeFileSync(path.join(ROOT, target), output);
else if (fs.readFileSync(path.join(ROOT, target), 'utf8') !== output) {
  throw new Error('CANONICAL_ALIAS_PROJECTION_DRIFT: regenerate from reviewed Identity Registry');
}
console.log(JSON.stringify({ status: 'PASS', mode, source, target,
  registryVersion: projection.registryVersion, registrySha256: digest,
  canonicalCount: projection.canonicalSlugs.length, aliasCount: Object.keys(projection.aliases).length }));
