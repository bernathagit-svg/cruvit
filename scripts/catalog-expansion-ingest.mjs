#!/usr/bin/env node
/**
 * Catalog Expansion V1 ingest CLI (background / one-time).
 *
 * Usage:
 *   node scripts/catalog-expansion-ingest.mjs --packet <path-to-packet.json> [--apply] [--plant-id plt_...]
 *
 * Default is dry-run (validate + materialize + print). --apply writes seed + identity registry.
 * Plant-agnostic: works for any approved expansion packet.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_PENDING,
  materializePlantCatalogItemFromPacket,
  mergeIdentityRegistryEntry,
  mergePlantIntoSeedDocument,
  validateCatalogExpansionPacket
} from '../modules/catalog-expansion/catalog-expansion-v1-contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED_PATH = path.join(ROOT, 'data', 'plants.seed.json');
const REGISTRY_PATH = path.join(ROOT, 'data', 'plant-identity.registry.json');

function parseArgs(argv) {
  const out = { apply: false, packet: null, plantId: null, replace: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--replace') out.replace = true;
    else if (a === '--packet') out.packet = argv[++i];
    else if (a === '--plant-id') out.plantId = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

/** Insert one plant at head of plants[] without reformatting the rest of the seed file. */
function surgicalInsertPlantIntoSeedFile(seedPath, item) {
  let text = fs.readFileSync(seedPath, 'utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  if (text.includes(`"slug": "${item.slug}"`)) {
    return { ok: false, error: `slug already present: ${item.slug}` };
  }
  const itemJson = JSON.stringify(item, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : '    ' + l))
    .join('\n');
  const marker = '"plants": [';
  const idx = text.indexOf(marker);
  if (idx < 0) return { ok: false, error: 'plants array marker missing' };
  const insertAt = idx + marker.length;
  const out =
    (bom ? '\uFEFF' : '') + text.slice(0, insertAt) + '\n    ' + itemJson + ',' + text.slice(insertAt);
  fs.writeFileSync(seedPath, out, 'utf8');
  return { ok: true, action: 'inserted' };
}

/** Insert identity entry before the next alphabetical neighbor without full reformat. */
function surgicalInsertIdentityEntry(registryPath, entry) {
  let text = fs.readFileSync(registryPath, 'utf8');
  const bom = text.charCodeAt(0) === 0xfeff;
  if (bom) text = text.slice(1);
  if (text.includes(`"canonicalSlug": "${entry.canonicalSlug}"`)) {
    return { ok: false, error: `canonicalSlug already present: ${entry.canonicalSlug}` };
  }
  const entryJson =
    '    ' +
    JSON.stringify(entry, null, 2)
      .split('\n')
      .map((l, i) => (i === 0 ? l : '    ' + l))
      .join('\n') +
    ',\n';

  const slugRe = /"canonicalSlug":\s*"([^"]+)"/g;
  let match;
  let insertBeforeIdx = -1;
  while ((match = slugRe.exec(text)) !== null) {
    if (match[1] > entry.canonicalSlug) {
      // Walk back to start of this identity object.
      const objStart = text.lastIndexOf('{', match.index);
      // Prefer line start of the object block (4-space indent).
      const lineStart = text.lastIndexOf('\n', objStart) + 1;
      insertBeforeIdx = lineStart;
      break;
    }
  }
  if (insertBeforeIdx < 0) {
    // Append before closing of canonicalIdentities array.
    const closeIdx = text.lastIndexOf(']');
    if (closeIdx < 0) return { ok: false, error: 'canonicalIdentities close missing' };
    insertBeforeIdx = closeIdx;
  }
  const out = (bom ? '\uFEFF' : '') + text.slice(0, insertBeforeIdx) + entryJson + text.slice(insertBeforeIdx);
  fs.writeFileSync(registryPath, out, 'utf8');
  return { ok: true, action: 'inserted' };
}

function main() {
  const t0 = performance.now();
  const args = parseArgs(process.argv);
  if (args.help || !args.packet) {
    console.log(`Usage: node scripts/catalog-expansion-ingest.mjs --packet <file> [--apply] [--replace] [--plant-id plt_...]`);
    process.exit(args.help ? 0 : 2);
  }

  const packetPath = path.isAbsolute(args.packet)
    ? args.packet
    : path.resolve(process.cwd(), args.packet);
  if (!fs.existsSync(packetPath)) {
    console.error(`Packet not found: ${packetPath}`);
    process.exit(2);
  }

  const packet = readJson(packetPath);
  const validation = validateCatalogExpansionPacket(packet);
  if (!validation.ok) {
    console.error('VALIDATION FAILED');
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(3);
  }

  const material = materializePlantCatalogItemFromPacket(packet, {
    plantId: args.plantId || undefined,
    updatedAt: new Date().toISOString()
  });
  if (!material.ok) {
    console.error('MATERIALIZE FAILED');
    for (const e of material.errors) console.error(`  - ${e}`);
    process.exit(4);
  }

  const seedDoc = readJson(SEED_PATH);
  const alreadyInSeed = (seedDoc.plants || []).some((p) => p.slug === material.item.slug);
  if (alreadyInSeed && !args.replace) {
    console.error(`SEED MERGE FAILED: slug already present: ${material.item.slug}`);
    process.exit(5);
  }

  const registry = readJson(REGISTRY_PATH);
  const alreadyInReg = (registry.canonicalIdentities || []).some(
    (e) => e.canonicalSlug === material.identityRegistryEntry.canonicalSlug
  );

  // Dry-run still validates full merge path in memory.
  const mergeSeed = mergePlantIntoSeedDocument(seedDoc, material.item, {
    replaceExisting: args.replace
  });
  if (!mergeSeed.ok) {
    console.error(`SEED MERGE FAILED: ${mergeSeed.error}`);
    process.exit(5);
  }
  const mergeReg = mergeIdentityRegistryEntry(registry, material.identityRegistryEntry);
  if (!mergeReg.ok) {
    console.error(`REGISTRY MERGE FAILED: ${mergeReg.error}`);
    process.exit(6);
  }

  const ingestMs = performance.now() - t0;
  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    packetId: packet.packetId,
    slug: material.item.slug,
    scientific: material.item.scientific,
    imageStatus: material.imageStatus || IMAGE_PENDING,
    unknownFields: material.unknownFields,
    needsReviewFields: material.needsReviewFields,
    seedAction: mergeSeed.action,
    ingestMs: Number(ingestMs.toFixed(2)),
    warnings: material.warnings
  };
  console.log(JSON.stringify(report, null, 2));
  console.log('\n--- materialized climateTraits ---');
  console.log(JSON.stringify(material.item.climateTraits, null, 2));

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to write seed + identity registry.');
    process.exit(0);
  }

  if (args.replace || alreadyInSeed) {
    // Replace path requires full rewrite (rare for expansion acceptance).
    writeJson(SEED_PATH, mergeSeed.seed);
  } else {
    const s = surgicalInsertPlantIntoSeedFile(SEED_PATH, material.item);
    if (!s.ok) {
      console.error(`SEED WRITE FAILED: ${s.error}`);
      process.exit(5);
    }
  }

  if (alreadyInReg) {
    writeJson(REGISTRY_PATH, mergeReg.registry);
  } else {
    const r = surgicalInsertIdentityEntry(REGISTRY_PATH, material.identityRegistryEntry);
    if (!r.ok) {
      console.error(`REGISTRY WRITE FAILED: ${r.error}`);
      process.exit(6);
    }
  }
  console.log(`\nWrote ${SEED_PATH}`);
  console.log(`Wrote ${REGISTRY_PATH}`);
}

main();
