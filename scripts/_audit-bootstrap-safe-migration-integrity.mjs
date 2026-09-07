/**
 * Pre-commit migration data integrity audit (read-only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERGE_CORE_DEFAULT_VALUES } from '../modules/personal-domain/smart-rec-climate-meta-authority-v1.js';
import { getBootstrapSafeClimateTraitsMigrationPayload } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

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
  return Function(`'use strict'; return (${slice.slice(braceStart, end + 1)});`)();
}

const GROUPS = extractObjectLiteral('const SMART_REC_CLIMATE_GROUPS=');
const ASSIGNMENTS = extractObjectLiteral('const SMART_REC_PLANT_GROUP_ASSIGNMENTS=');
const SPECIFIC = extractObjectLiteral('const SMART_REC_SPECIFIC_CLIMATE_METADATA=');
const payload = getBootstrapSafeClimateTraitsMigrationPayload();

const CORE = [
  'frostSensitivity',
  'coldTolerance',
  'heatTolerance',
  'humidityTolerance',
  'drainageNeeds',
  'sunNeeds',
  'waterNeeds',
  'floweringRequirements',
  'fruitingRequirements',
  'survivalVsThriveNotes',
  'needsWinterChill',
  'needsDrySeason',
  'needsReview'
];

const discrepancies = [];
const mergeDefaults = MERGE_CORE_DEFAULT_VALUES;

for (const slug of payload.safeSlugs) {
  const plant = payload.plants[slug];
  const ct = plant.climateTraits;
  const groupIds = ASSIGNMENTS[slug] || [];
  const specific = SPECIFIC[slug] || null;
  const sources = [];
  for (const gid of groupIds) {
    if (GROUPS[gid]) sources.push(GROUPS[gid]);
  }
  if (specific) sources.push(specific);

  for (const k of CORE) {
    if (ct[k] == null || ct[k] === '') continue;
    const explicit = sources.some((s) => Object.prototype.hasOwnProperty.call(s, k));
    if (!explicit) {
      discrepancies.push(`${slug}: field ${k}=${JSON.stringify(ct[k])} not explicit on group/specific`);
    }
    if (ct.fieldOrigins?.[k] !== 'LEGACY_ASSERTED_METADATA') {
      discrepancies.push(`${slug}: fieldOrigins.${k}=${ct.fieldOrigins?.[k]}`);
    }
    if (
      ct.traitEvidenceClasses?.[k] &&
      ct.traitEvidenceClasses[k] !== 'HEURISTIC_ASSERTION'
    ) {
      discrepancies.push(`${slug}: traitEvidenceClasses.${k}=${ct.traitEvidenceClasses[k]}`);
    }
    // merge-default-only medium: value equals merge default AND no source had the key
    if (
      mergeDefaults[k] != null &&
      String(ct[k]) === String(mergeDefaults[k]) &&
      !sources.some((s) => Object.prototype.hasOwnProperty.call(s, k))
    ) {
      discrepancies.push(`${slug}: merge-default-only ${k}=${ct[k]}`);
    }
  }

  for (const arrKey of ['warningFlags', 'hardBlockRules']) {
    if (!Array.isArray(ct[arrKey]) || !ct[arrKey].length) continue;
    const explicit = sources.some(
      (s) => Array.isArray(s[arrKey]) && s[arrKey].length
    );
    if (!explicit) discrepancies.push(`${slug}: ${arrKey} not explicit`);
    if (ct.fieldOrigins?.[arrKey] !== 'LEGACY_ASSERTED_METADATA') {
      discrepancies.push(`${slug}: fieldOrigins.${arrKey}`);
    }
  }

  if (ct.reproductiveBiology) discrepancies.push(`${slug}: invented reproductiveBiology`);
  if (ct.quantitative || ct.quantitativeEvidence) {
    discrepancies.push(`${slug}: invented quantitative`);
  }
  const blob = JSON.stringify(ct.traitEvidenceClasses || {});
  if (blob.includes('SOURCE_SUPPORTED')) {
    discrepancies.push(`${slug}: SOURCE_SUPPORTED in traitEvidenceClasses`);
  }
  // needsReview: migration must not clear an explicit true from sources
  const sourceNeedsReview = sources.some((s) => s.needsReview === true);
  if (sourceNeedsReview && ct.needsReview !== true) {
    discrepancies.push(`${slug}: needsReview cleared`);
  }
}

console.log(
  JSON.stringify(
    {
      safeCount: payload.safeCount,
      discrepancyCount: discrepancies.length,
      discrepancies,
      ok: discrepancies.length === 0
    },
    null,
    2
  )
);
process.exit(discrepancies.length ? 1 : 0);
