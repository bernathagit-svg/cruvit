/**
 * Reconcile recovered Plant Visual candidate provenance for a QA manifest.
 *
 * Usage:
 *   node scripts/plant-visual-provenance-reconcile-v1.mjs --manifest-id=<id>
 *
 * Pure/local. No network, no R2 writes, no registry writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRecoveredProvenanceReconciliation,
  applyProvenanceReconciliationToManifest
} from '../modules/garden-design/asset-factory-v1/plant-visual-provenance-reconciliation-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST_DIR = path.join(ROOT, 'data', 'garden-design', 'plant-visual-qa-manifests');
const OUT_DIR = path.join(ROOT, 'data', 'garden-design', 'plant-visual-provenance-reconciliation');

function argValue(argv, name) {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => String(arg).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : '';
}

function safeManifestId(value) {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(id) ? id : '';
}

function loadJson(abs) {
  return JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
}

export function reconcileManifest(argv = process.argv.slice(2), options = {}) {
  const manifestId = safeManifestId(argValue(argv, 'manifest-id'));
  if (!manifestId) {
    const err = new Error('MANIFEST_ID_REQUIRED');
    err.code = 'MANIFEST_ID_REQUIRED';
    throw err;
  }

  const manifestPath = path.join(MANIFEST_DIR, manifestId + '.json');
  if (!fs.existsSync(manifestPath)) {
    const err = new Error('QA_MANIFEST_NOT_FOUND');
    err.code = 'QA_MANIFEST_NOT_FOUND';
    throw err;
  }

  const manifest = loadJson(manifestPath);
  const reconciledAt = options.reconciledAt || new Date().toISOString();
  const reconciliation = buildRecoveredProvenanceReconciliation(manifest, {
    reconciledAt,
    reviewer: 'owner-visual-review'
  });
  const updatedManifest = applyProvenanceReconciliationToManifest(manifest, reconciliation);

  return { manifest, reconciliation, updatedManifest, manifestPath };
}

export function main(argv = process.argv.slice(2)) {
  const result = reconcileManifest(argv);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const evidencePath = path.join(OUT_DIR, result.reconciliation.manifestId + '.json');
  fs.writeFileSync(evidencePath, JSON.stringify(result.reconciliation, null, 2) + '\n');
  fs.writeFileSync(result.manifestPath, JSON.stringify(result.updatedManifest, null, 2) + '\n');

  console.log(JSON.stringify({
    manifestId: result.reconciliation.manifestId,
    reconciled: result.reconciliation.recordCount,
    blocked: result.reconciliation.blockedCount,
    paidAiCalls: 0,
    productionWrites: 0,
    registryWrites: 0,
    evidence: path.relative(ROOT, evidencePath).replace(/\\/g, '/'),
    manifest: path.relative(ROOT, result.manifestPath).replace(/\\/g, '/')
  }, null, 2));
  return result.reconciliation.blockedCount ? 1 : 0;
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
