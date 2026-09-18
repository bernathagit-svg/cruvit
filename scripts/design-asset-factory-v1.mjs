/**
 * Design Asset Factory V1 CLI.
 *
 *   node scripts/design-asset-factory-v1.mjs --dry-run
 *
 * Default: DENY. Prints spend preflight and local required-gap counts.
 * Does not generate images. Does not call paid APIs. Does not write the live registry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFactory } from '../modules/garden-design/asset-factory-v1/runner-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function loadJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function readKeyRaw() {
  return String(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || '').trim();
}

export function main(argv = process.argv.slice(2)) {
  const seed = loadJson(path.join('data', 'plants.seed.json'));
  const registry = loadJson(
    path.join('modules', 'garden-design', 'assets', 'plants', 'design-asset-registry-v1.json')
  ) || { sets: [] };
  const result = runFactory(argv, {
    plants: seed?.plants || [],
    registry,
    apiKeyRaw: readKeyRaw()
  });
  console.log(result.preflightText);
  console.log(
    JSON.stringify(
      {
        blocked: result.blocked,
        reason: result.reason,
        networkRequests: result.networkRequests,
        requiredGapCount: result.requiredGapCount,
        blockedMorphologyCount: result.blockedMorphologyCount,
        jobsQueued: result.jobsQueued,
        liveRegistryWritten: result.liveRegistryWritten,
        imagesGenerated: result.imagesGenerated
      },
      null,
      2
    )
  );
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = main();
}
