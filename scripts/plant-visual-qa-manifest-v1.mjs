/**
 * Plant Visual QA Manifest CLI V1.
 *
 * Usage:
 *   node scripts/plant-visual-qa-manifest-v1.mjs \
 *     --manifest-id=wave-001 \
 *     --candidates=data/.../candidates.json \
 *     --qa=data/.../qa.json
 *
 * No network. No generation. No production writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlantVisualQaManifest } from '../modules/garden-design/asset-factory-v1/plant-visual-qa-manifest-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'data', 'garden-design', 'plant-visual-qa-manifests');

function argValue(argv, name) {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => String(arg).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : '';
}

function loadJson(rel) {
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) {
    const err = new Error('QA_MANIFEST_INPUT_OUTSIDE_REPO');
    err.code = 'QA_MANIFEST_INPUT_OUTSIDE_REPO';
    throw err;
  }
  return JSON.parse(fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, ''));
}

function candidateRows(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.candidates)) return doc.candidates;
  if (Array.isArray(doc?.rows)) return doc.rows;
  return [];
}

function qaRows(doc) {
  if (Array.isArray(doc)) return doc;
  if (Array.isArray(doc?.rows)) return doc.rows;
  if (Array.isArray(doc?.candidates)) return doc.candidates;
  return [];
}

export function buildQaManifestFromFiles(argv = process.argv.slice(2)) {
  const manifestId = argValue(argv, 'manifest-id');
  const candidatesRel = argValue(argv, 'candidates');
  const qaRel = argValue(argv, 'qa');

  if (!manifestId || !candidatesRel || !qaRel) {
    const err = new Error('QA_MANIFEST_ARGS_REQUIRED');
    err.code = 'QA_MANIFEST_ARGS_REQUIRED';
    throw err;
  }

  const candidatesDoc = loadJson(candidatesRel);
  const qaDoc = loadJson(qaRel);
  return buildPlantVisualQaManifest({
    manifestId,
    batchId: argValue(argv, 'batch-id') || manifestId,
    generatedAt: new Date().toISOString(),
    bucket: candidatesDoc.bucket || 'cruvit-plant-visual-candidates',
    candidates: candidateRows(candidatesDoc),
    qaRows: qaRows(qaDoc),
    paidAiCalls: Number(qaDoc.paidAiCalls || qaDoc.imageGenerationCalls || 0)
  });
}

export function main(argv = process.argv.slice(2)) {
  const manifest = buildQaManifestFromFiles(argv);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, manifest.manifestId + '.json');
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({
    manifestId: manifest.manifestId,
    totalJobs: manifest.totalJobs,
    ownerReviewJobs: manifest.ownerReviewJobs,
    automaticPassJobs: manifest.automaticPassJobs,
    productionWrites: 0,
    registryWrites: 0,
    output: path.relative(ROOT, out).replace(/\\/g, '/')
  }, null, 2));
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err?.stack || String(err));
    process.exitCode = 1;
  }
}
