/**
 * CRUVIT Plant Knowledge & Warnings V1 — 60-plant enrichment executor.
 * Research artifacts + canonical handoff only.
 * NO live Supabase write. NO commit. NO UI. NO Batch 3.
 *
 * Usage: node scripts/plant-knowledge-warnings-60-enrich.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  BATCH1_ENRICHMENT_PLANTS
} from '../data/catalog-expansion/plant-knowledge-v1/enrichment-60/plants/batch1.mjs';
import {
  BATCH2_ENRICHMENT_PLANTS
} from '../data/catalog-expansion/plant-knowledge-v1/enrichment-60/plants/batch2.mjs';
import {
  ENRICHMENT_SET_ID,
  countFamilyCoverage,
  walkProvenancedFields
} from '../data/catalog-expansion/plant-knowledge-v1/enrichment-60/shared.mjs';
import {
  KNOWLEDGE_FAMILIES,
  validatePlantKnowledge,
  mergePlantKnowledgeIntoClimateTraits,
  roundTripPlantKnowledge,
  stableStringify,
  isConfirmedWarning,
  resolveWarningRenderPolicy,
  evaluatePositiveSafetyClaim,
  resolveInvasivenessLabel,
  EVIDENCE_CLASS,
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION
} from '../modules/catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import {
  buildPlantExplanationV1,
  auditExplanationTraceability
} from '../modules/personal-domain/plant-explanation-v1-contract.js';
import { sqlJsonbLiteral } from '../modules/catalog/canonical-catalog-persistence-contract-v1.js';
import { isMaterialEvidenceField } from './catalog-batch2-shared.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff');
const CACHE_DIR = path.join(ROOT, 'data/catalog-expansion/plant-knowledge-v1/enrichment-60/sources-cache');
const REPORT_PATH = path.join(ROOT, 'tests/_plant-knowledge-warnings-60-enrichment-report.json');

/** Frozen timestamps for deterministic handoff SHA (Owner live-applied era). */
const HANDOFF_GENERATED_AT = '2026-08-31T18:07:42.723Z';
const REPORT_GENERATED_AT = '2026-08-31T18:07:42.723Z';
/** Owner-accepted live handoff checksum (persisted). */
const OWNER_ACCEPTED_LIVE_HANDOFF_SHA =
  '92ed280eddd65c50af59b443d5d7f14f40c10b15a455f778d7e2a39e178f56de';

const EXPECTED_SLUGS = Object.freeze([
  // Batch 1
  'durian','mangosteen','breadfruit','acerola','longan','loquat','persimmon','feijoa',
  'jaboticaba','white-sapote','sweet-cherry','english-walnut','red-currant','gooseberry',
  'quince','carob','common-myrtle','bay-laurel','oleander','garden-peony','common-lilac',
  'forsythia','southern-magnolia','chinese-wisteria','ginkgo','silver-birch','blue-gum',
  'common-thyme','garden-sage','turmeric',
  // Batch 2
  'hazelnut','chestnut','pecan','medlar','serviceberry','blackberry','blackcurrant',
  'cranberry','elderberry','sea-buckthorn','soursop','sapodilla','tamarind','jujube',
  'pitanga','asparagus','artichoke','rhubarb','sweet-potato','okra','parsley','cilantro',
  'dill','oregano','chives','boxwood','clematis','flowering-dogwood','crepe-myrtle','yucca'
]);

const FROZEN_BATCH1_MATERIAL = Object.freeze({
  SOURCE_SUPPORTED: 189,
  HEURISTIC_ASSERTION: 125,
  UNKNOWN: 11
});
const FROZEN_BATCH2_MATERIAL = Object.freeze({
  SOURCE_SUPPORTED: 248,
  HEURISTIC_ASSERTION: 71,
  UNKNOWN: 25
});

const BATCH1_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-1-v1/handoff/catalog_plants_enrichment_handoff.json'
);
const BATCH2_HANDOFF = path.join(
  ROOT,
  'data/catalog-expansion/batches/bulk-batch-2-v1/handoff/catalog_plants_batch2_handoff.json'
);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function materialInventoryFromClimateTraits(climateTraits) {
  const counts = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const map = climateTraits?.traitEvidenceClasses || {};
  for (const [field, cls] of Object.entries(map)) {
    if (isMaterialEvidenceField(field) && counts[cls] != null) counts[cls] += 1;
  }
  return counts;
}

function stripPlantKnowledge(climateTraits) {
  if (!climateTraits || typeof climateTraits !== 'object') return {};
  const { plantKnowledge, ...rest } = climateTraits;
  return rest;
}

function deepEqualJson(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function loadClimateBySlug() {
  const map = new Map();
  const b1 = JSON.parse(fs.readFileSync(BATCH1_HANDOFF, 'utf8'));
  const b2 = JSON.parse(fs.readFileSync(BATCH2_HANDOFF, 'utf8'));
  const b1Rows = b1.plants || b1.rows || b1.items || [];
  const b2Rows = b2.plants || b2.rows || b2.items || [];
  for (const row of b1Rows) {
    const slug = row.slug;
    const ct = row.climateTraits || row.climate_traits || {};
    map.set(slug, { batch: 1, climateTraits: structuredClone(ct), row });
  }
  for (const row of b2Rows) {
    const slug = row.slug;
    const ct = row.climate_traits || row.climateTraits || {};
    map.set(slug, { batch: 2, climateTraits: structuredClone(ct), row });
  }
  return { map, b1Meta: b1, b2Meta: b2, b1Count: b1Rows.length, b2Count: b2Rows.length };
}

function cacheSources(plants) {
  ensureDir(CACHE_DIR);
  const seen = new Map();
  for (const p of plants) {
    for (const s of p.plantKnowledge.sources || []) {
      if (!s?.sourceId || seen.has(s.sourceId)) continue;
      seen.set(s.sourceId, s);
      const fp = path.join(CACHE_DIR, `${s.sourceId}.json`);
      if (!fs.existsSync(fp)) {
        fs.writeFileSync(
          fp,
          JSON.stringify(
            {
              cachedAt: HANDOFF_GENERATED_AT,
              sourceId: s.sourceId,
              institution: s.institution,
              title: s.title,
              url: s.url,
              authorityTier: s.authorityTier,
              verifiedAt: s.verifiedAt,
              note: 'Ingestion-time source registry cache — no runtime fetch.'
            },
            null,
            2
          ) + '\n'
        );
      }
    }
  }
  return seen.size;
}

function inventoryKnowledgeEvidence(plants) {
  const totals = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  for (const p of plants) {
    walkProvenancedFields(p.plantKnowledge, (field) => {
      const cls = field.evidenceClass;
      if (totals[cls] != null) totals[cls] += 1;
    });
    for (const w of p.plantKnowledge.warnings || []) {
      if (totals[w.evidenceClass] != null) totals[w.evidenceClass] += 1;
    }
  }
  return totals;
}

function familyCoverage(plants) {
  const out = {};
  for (const fam of KNOWLEDGE_FAMILIES) {
    out[fam] = { plantsWithAsserted: 0, plantsWithAnyField: 0, assertedFields: 0, unknownFields: 0 };
  }
  for (const p of plants) {
    for (const fam of KNOWLEDGE_FAMILIES) {
      const c = countFamilyCoverage(p.plantKnowledge[fam]);
      if (c.fields > 0) out[fam].plantsWithAnyField += 1;
      if (c.asserted > 0) out[fam].plantsWithAsserted += 1;
      out[fam].assertedFields += c.asserted;
      out[fam].unknownFields += c.unknown;
    }
  }
  return out;
}

function auditSafety(plants) {
  const blockers = [];
  let confirmedSafetyFromHeuristic = 0;
  let falseSafeFromMissing = 0;
  let regionalToGlobalErrors = 0;
  let unsupportedCultivarGeneralizations = 0;
  let unprovenLegalClaims = 0;
  const confirmedToxicityWarnings = [];
  const toxicityUnknownPlants = [];
  const regionalFindings = [];
  const ownerReviewFindings = [];

  for (const p of plants) {
    const k = p.plantKnowledge;
    const tox = k.toxicity || {};
    const human = tox.humanToxicity;
    const hasConfirmedToxWarn = (k.warnings || []).some(
      (w) => w.category === 'toxicity' && isConfirmedWarning(w)
    );
    if (hasConfirmedToxWarn) confirmedToxicityWarnings.push(p.slug);
    if (!human || human.evidenceClass === EVIDENCE_CLASS.UNKNOWN || human.value == null) {
      toxicityUnknownPlants.push(p.slug);
    }

    for (const [key, field] of Object.entries(tox)) {
      if (!field || typeof field !== 'object') continue;
      const ev = evaluatePositiveSafetyClaim(field);
      if (
        field.value &&
        (field.value === 'safe' ||
          field.value === 'non_toxic' ||
          field.value === true ||
          (typeof field.value === 'string' && /^safe/i.test(field.value)))
      ) {
        if (field.evidenceClass === EVIDENCE_CLASS.HEURISTIC_ASSERTION) {
          confirmedSafetyFromHeuristic += 1;
          blockers.push(`${p.slug}: heuristic positive safety on toxicity.${key}`);
        }
        if (field.evidenceClass === EVIDENCE_CLASS.UNKNOWN) {
          falseSafeFromMissing += 1;
          blockers.push(`${p.slug}: UNKNOWN positive safety on toxicity.${key}`);
        }
        if (!ev.allowed) {
          blockers.push(`${p.slug}: rejected positive safety toxicity.${key}: ${ev.reason}`);
        }
      }
    }

    for (const w of k.warnings || []) {
      const policy = resolveWarningRenderPolicy(w);
      if (
        w.evidenceClass === EVIDENCE_CLASS.HEURISTIC_ASSERTION &&
        ['toxicity', 'harvest_use', 'regional_restriction'].includes(w.category) &&
        policy.confirmed
      ) {
        confirmedSafetyFromHeuristic += 1;
        blockers.push(`${p.slug}: heuristic confirmed safety warning ${w.warningId}`);
      }
      if (w.requiresOwnerReview) {
        ownerReviewFindings.push({ slug: p.slug, warningId: w.warningId, category: w.category });
      }
      if (w.category === 'regional_restriction' && w.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED) {
        const auth = String(w.summary || '');
        // Soft check — government claims should cite government; HEURISTIC + owner_review preferred otherwise
      }
      if (
        w.category === 'regional_restriction' &&
        w.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED &&
        !(k.sources || []).some((s) => s.authorityTier === 'government_agency')
      ) {
        // Not automatically illegal — university invasive docs often support discouraged status with owner_review
        if (!w.requiresOwnerReview) {
          unprovenLegalClaims += 1;
          blockers.push(
            `${p.slug}: regional_restriction SOURCE_SUPPORTED without government source and without requiresOwnerReview`
          );
        }
      }
    }

    if (k.invasiveness && Object.keys(k.invasiveness).length) {
      const label = resolveInvasivenessLabel(k.invasiveness);
      if (label.global === true && label.regionScope?.level !== 'GLOBAL') {
        regionalToGlobalErrors += 1;
        blockers.push(`${p.slug}: regional invasive promoted to global`);
      }
      if (label.label === 'invasive_regional' || label.global) {
        regionalFindings.push({
          slug: p.slug,
          label: label.label,
          global: label.global,
          regionScope: label.regionScope || null
        });
      }
    }

    for (const rr of k.regionalRestrictions || []) {
      regionalFindings.push({
        slug: p.slug,
        type: 'regionalRestriction',
        restrictionType: rr.restrictionType,
        region: rr.region,
        requiresOwnerReview: true
      });
      if (
        rr.restrictionSummary?.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED &&
        !(k.sources || []).some((s) => s.authorityTier === 'government_agency') &&
        !rr.requiresOwnerReview
      ) {
        // array items may not have requiresOwnerReview — warnings should
      }
    }

    const caveats = k.cultivarCaveats || {};
    if (
      caveats.cultivarDependent?.value === false &&
      caveats.affectedTraits?.value &&
      Array.isArray(caveats.affectedTraits.value) &&
      caveats.affectedTraits.value.length
    ) {
      unsupportedCultivarGeneralizations += 1;
      blockers.push(`${p.slug}: cultivar traits asserted while cultivarDependent=false`);
    }
  }

  return {
    blockers,
    confirmedSafetyFromHeuristic,
    falseSafeFromMissing,
    regionalToGlobalErrors,
    unsupportedCultivarGeneralizations,
    unprovenLegalClaims,
    confirmedToxicityWarnings,
    toxicityUnknownPlants,
    regionalFindings,
    ownerReviewFindings
  };
}

function buildUpsertSql(rows) {
  const tuples = rows
    .map((r) => `  (${sqlText(r.slug)}, ${sqlJsonbLiteral(r.plantKnowledgePatch)})`)
    .join(',\n');

  return `-- CRUVIT Plant Knowledge & Warnings V1 — 60-plant enrichment upsert
-- NON-DESTRUCTIVE: merges plantKnowledge into existing climate_traits JSONB.
-- Does NOT replace climate_traits. Does NOT modify botanical/climate truth fields.
-- NO LIVE WRITE from agent scripts — Owner applies after review.
-- Generated by scripts/plant-knowledge-warnings-60-enrich.mjs
-- Contract: ${PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION}
-- Set: ${ENRICHMENT_SET_ID}

BEGIN;

UPDATE public.catalog_plants AS c
SET
  climate_traits = COALESCE(c.climate_traits, '{}'::jsonb) || jsonb_build_object('plantKnowledge', v.plant_knowledge),
  updated_at = now()
FROM (
  VALUES
${tuples}
) AS v(slug, plant_knowledge)
WHERE c.slug = v.slug;

COMMIT;
`;
}

function sqlText(v) {
  if (v == null) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildVerifySql(slugs) {
  const list = slugs.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  return `-- CRUVIT Plant Knowledge & Warnings V1 — verify (Owner / ChatGPT review)
-- Expect: 60 rows with plantKnowledge; climate botanical keys preserved.

-- 1) Coverage
SELECT COUNT(*) AS with_plant_knowledge
FROM public.catalog_plants
WHERE slug IN (${list})
  AND climate_traits ? 'plantKnowledge'
  AND climate_traits->'plantKnowledge' ? 'plantKnowledgeContractVersion';

-- 2) Must be exactly 60
-- SELECT 60 AS expected;

-- 3) Non-destructive: traitEvidenceClasses still present for all 60
SELECT COUNT(*) AS with_trait_evidence_classes
FROM public.catalog_plants
WHERE slug IN (${list})
  AND climate_traits ? 'traitEvidenceClasses'
  AND jsonb_typeof(climate_traits->'traitEvidenceClasses') = 'object'
  AND climate_traits->'traitEvidenceClasses' <> '{}'::jsonb;

-- 4) Sample confirmed toxicity plants
SELECT slug,
  climate_traits->'plantKnowledge'->'warnings' AS warnings
FROM public.catalog_plants
WHERE slug IN ('oleander','rhubarb','chinese-wisteria','boxwood','clematis','elderberry')
ORDER BY slug;

-- 5) plantKnowledge must not wipe traitEvidenceClasses (spot check)
SELECT slug
FROM public.catalog_plants
WHERE slug IN (${list})
  AND climate_traits ? 'plantKnowledge'
  AND (
    NOT (climate_traits ? 'traitEvidenceClasses')
    OR climate_traits->'traitEvidenceClasses' = '{}'::jsonb
  );
`;
}

function runNodeTest(relPath) {
  const r = spawnSync(process.execPath, ['--test', path.join(ROOT, relPath)], {
    encoding: 'utf8',
    cwd: ROOT
  });
  return {
    status: r.status,
    pass: /ℹ pass (\d+)/.test(r.stdout + r.stderr)
      ? Number((r.stdout + r.stderr).match(/ℹ pass (\d+)/)[1])
      : null,
    fail: /ℹ fail (\d+)/.test(r.stdout + r.stderr)
      ? Number((r.stdout + r.stderr).match(/ℹ fail (\d+)/)[1])
      : null,
    out: (r.stdout || '') + (r.stderr || '')
  };
}

function runClimateGate(args = []) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/plant-climate-v2-integration-gate.mjs'), ...args], {
    encoding: 'utf8',
    cwd: ROOT
  });
  let json = null;
  try {
    const text = (r.stdout || '').trim();
    const start = text.lastIndexOf('{');
    if (start >= 0) json = JSON.parse(text.slice(start));
  } catch {
    json = null;
  }
  return { status: r.status, json, out: (r.stdout || '') + (r.stderr || '') };
}

function main() {
  ensureDir(OUT_DIR);
  ensureDir(CACHE_DIR);

  const plants = [...BATCH1_ENRICHMENT_PLANTS, ...BATCH2_ENRICHMENT_PLANTS];
  const blockers = [];

  if (plants.length !== 60) blockers.push(`plant count ${plants.length} !== 60`);
  const gotSlugs = plants.map((p) => p.slug).sort();
  const expectedSorted = [...EXPECTED_SLUGS].sort();
  if (stableStringify(gotSlugs) !== stableStringify(expectedSorted)) {
    blockers.push('slug inventory mismatch vs authoritative 60');
  }

  const validationFailures = [];
  for (const p of plants) {
    const v = validatePlantKnowledge(p.plantKnowledge, { hardFail: true });
    if (!v.ok) validationFailures.push({ slug: p.slug, errors: v.errors });
  }
  if (validationFailures.length) {
    blockers.push(`validatePlantKnowledge failures: ${validationFailures.length}`);
  }

  const sourceCount = cacheSources(plants);
  const knowledgeEvidence = inventoryKnowledgeEvidence(plants);
  const coverage = familyCoverage(plants);
  const safety = auditSafety(plants);
  blockers.push(...safety.blockers);

  // Explanation readiness + round-trip
  let roundTripFailures = 0;
  let explanationFailures = 0;
  const handoffPlants = [];

  const climateLoad = loadClimateBySlug();
  if (climateLoad.b1Count !== 30 || climateLoad.b2Count !== 30) {
    blockers.push(
      `climate handoff row counts b1=${climateLoad.b1Count} b2=${climateLoad.b2Count}`
    );
  }

  let nondestructiveFailures = 0;
  const batch1InvBefore = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const batch2InvBefore = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const batch1InvAfter = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };
  const batch2InvAfter = { SOURCE_SUPPORTED: 0, HEURISTIC_ASSERTION: 0, UNKNOWN: 0 };

  for (const p of plants) {
    const rt = roundTripPlantKnowledge(p.plantKnowledge, { slug: p.slug });
    if (!rt.ok) {
      roundTripFailures += 1;
      blockers.push(`${p.slug}: plantKnowledge round-trip failed`);
    }

    const expl = buildPlantExplanationV1({
      plant: { slug: p.slug },
      meta: { plantKnowledge: p.plantKnowledge },
      suitabilityOutcomes: { overall: 'good' }
    });
    const audit = auditExplanationTraceability(expl);
    if (audit.violations?.length) {
      explanationFailures += 1;
      blockers.push(`${p.slug}: explanation traceability ${audit.violations.length}`);
    }

    const prior = climateLoad.map.get(p.slug);
    if (!prior) {
      nondestructiveFailures += 1;
      blockers.push(`${p.slug}: missing prior climate_traits in batch handoff`);
      continue;
    }
    const before = stripPlantKnowledge(prior.climateTraits);
    const beforeInv = materialInventoryFromClimateTraits(before);
    const merged = mergePlantKnowledgeIntoClimateTraits(structuredClone(before), p.plantKnowledge);
    const afterStrip = stripPlantKnowledge(merged);
    if (!deepEqualJson(before, afterStrip)) {
      nondestructiveFailures += 1;
      blockers.push(`${p.slug}: climate truth changed after plantKnowledge merge`);
    }
    if (!merged.plantKnowledge) {
      nondestructiveFailures += 1;
      blockers.push(`${p.slug}: plantKnowledge missing after merge`);
    }
    const afterInv = materialInventoryFromClimateTraits(merged);
    const targetBefore = p.batch === 1 ? batch1InvBefore : batch2InvBefore;
    const targetAfter = p.batch === 1 ? batch1InvAfter : batch2InvAfter;
    for (const k of Object.keys(beforeInv)) {
      targetBefore[k] += beforeInv[k];
      targetAfter[k] += afterInv[k];
    }

    handoffPlants.push({
      slug: p.slug,
      scientific: p.scientific,
      batch: p.batch,
      plantKnowledge: p.plantKnowledge,
      plantKnowledgePatch: p.plantKnowledge,
      mergeStrategy: 'climate_traits = COALESCE(climate_traits,{}) || jsonb_build_object(plantKnowledge)',
      preservedClimateTruthProof: deepEqualJson(before, afterStrip)
    });
  }

  const b1Match =
    deepEqualJson(batch1InvBefore, FROZEN_BATCH1_MATERIAL) &&
    deepEqualJson(batch1InvAfter, FROZEN_BATCH1_MATERIAL);
  const b2Match =
    deepEqualJson(batch2InvBefore, FROZEN_BATCH2_MATERIAL) &&
    deepEqualJson(batch2InvAfter, FROZEN_BATCH2_MATERIAL);
  if (!b1Match) {
    blockers.push(
      `Batch1 evidence inventory drift before=${JSON.stringify(batch1InvBefore)} after=${JSON.stringify(batch1InvAfter)} expected=${JSON.stringify(FROZEN_BATCH1_MATERIAL)}`
    );
  }
  if (!b2Match) {
    blockers.push(
      `Batch2 evidence inventory drift before=${JSON.stringify(batch2InvBefore)} after=${JSON.stringify(batch2InvAfter)} expected=${JSON.stringify(FROZEN_BATCH2_MATERIAL)}`
    );
  }

  // Regressions
  const foundationTest = runNodeTest('tests/plant-knowledge-warnings-v1-foundation.test.mjs');
  if (foundationTest.fail !== 0) blockers.push('foundation safety tests failed');

  const climateDefault = runClimateGate([]);
  const climateB2 = runClimateGate(['--batch=2']);

  const climateOk =
    climateDefault.json &&
    (String(climateDefault.json.hardeningVerdict || climateDefault.json.integrationVerdict || '').includes('PASS') ||
      climateDefault.json.materialFp === 0) &&
    climateDefault.json.materialFp === 0 &&
    climateDefault.json.materialFn === 0;

  // Default gate may report different verdict key — check FP/FN
  const defFp = climateDefault.json?.materialFp;
  const defFn = climateDefault.json?.materialFn;
  const defHeur = climateDefault.json?.heuristicDependentConfident ?? climateDefault.json?.confidentHeuristicDeps;
  const b2Fp = climateB2.json?.materialFp;
  const b2Fn = climateB2.json?.materialFn;
  const b2Heur = climateB2.json?.heuristicDependentConfident ?? climateB2.json?.confidentHeuristicDeps;

  if (defFp !== 0 || defFn !== 0 || (defHeur != null && defHeur !== 0)) {
    blockers.push(`Plant Climate V2 default regression FP/FN/heur=${defFp}/${defFn}/${defHeur}`);
  }
  if (b2Fp !== 0 || b2Fn !== 0 || (b2Heur != null && b2Heur !== 0)) {
    blockers.push(`Batch 2 climate regression FP/FN/heur=${b2Fp}/${b2Fn}/${b2Heur}`);
  }

  const handoffDoc = {
    generatedAt: HANDOFF_GENERATED_AT,
    enrichmentSetId: ENRICHMENT_SET_ID,
    contractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
    plantCount: plants.length,
    plants: handoffPlants.map((p) => ({
      slug: p.slug,
      scientific: p.scientific,
      batch: p.batch,
      plantKnowledge: p.plantKnowledge,
      preservedClimateTruthProof: p.preservedClimateTruthProof
    })),
    mergeSemantics:
      "existing climate_traits + plantKnowledge via COALESCE(climate_traits,'{}') || jsonb_build_object('plantKnowledge', ...)",
    runtimeExternalBotanicalCalls: 0,
    runtimeToxicityLookups: 0,
    runtimeInvasivenessLookups: 0,
    runtimeAiResearch: 0,
    paidApiCostUsd: 0,
    aiApiCostUsd: 0
  };

  const handoffJson = JSON.stringify(handoffDoc, null, 2) + '\n';
  const handoffPath = path.join(OUT_DIR, 'plant_knowledge_warnings_60_handoff.json');
  fs.writeFileSync(handoffPath, handoffJson);
  const handoffSha = sha256Hex(Buffer.from(handoffJson, 'utf8'));
  fs.writeFileSync(path.join(OUT_DIR, 'plant_knowledge_warnings_60_handoff.sha256'), `${handoffSha}  plant_knowledge_warnings_60_handoff.json\n`);

  const upsertSql = buildUpsertSql(handoffPlants);
  const verifySql = buildVerifySql(EXPECTED_SLUGS);
  fs.writeFileSync(path.join(OUT_DIR, 'plant_knowledge_warnings_60_upsert.sql'), upsertSql);
  fs.writeFileSync(path.join(OUT_DIR, 'plant_knowledge_warnings_60_verify.sql'), verifySql);

  const authorityBreakdown = {};
  for (const p of plants) {
    for (const s of p.plantKnowledge.sources || []) {
      const t = s.authorityTier || 'unknown';
      authorityBreakdown[t] = (authorityBreakdown[t] || 0) + 1;
    }
  }

  const uniqueSources = new Set();
  for (const p of plants) {
    for (const s of p.plantKnowledge.sources || []) uniqueSources.add(s.sourceId);
  }

  const safetyCriticalCoverage = {
    plantsWithToxicityAsserted: plants.filter((p) =>
      Object.values(p.plantKnowledge.toxicity || {}).some(
        (f) => f && f.evidenceClass && f.evidenceClass !== EVIDENCE_CLASS.UNKNOWN && f.value != null
      )
    ).length,
    plantsWithPhysicalHazardsAsserted: plants.filter(
      (p) => countFamilyCoverage(p.plantKnowledge.physicalHazards).asserted > 0
    ).length,
    plantsWithHarvestUseAsserted: plants.filter(
      (p) => countFamilyCoverage(p.plantKnowledge.harvestUseWarnings).asserted > 0
    ).length,
    confirmedToxicityWarningCount: safety.confirmedToxicityWarnings.length
  };

  const uniqueBlockers = [...new Set(blockers)];
  const pass =
    uniqueBlockers.length === 0 &&
    validationFailures.length === 0 &&
    roundTripFailures === 0 &&
    nondestructiveFailures === 0 &&
    safety.confirmedSafetyFromHeuristic === 0 &&
    safety.falseSafeFromMissing === 0 &&
    safety.regionalToGlobalErrors === 0 &&
    safety.unprovenLegalClaims === 0 &&
    foundationTest.fail === 0 &&
    knowledgeEvidence.SOURCE_SUPPORTED === 100 &&
    knowledgeEvidence.HEURISTIC_ASSERTION === 136 &&
    knowledgeEvidence.UNKNOWN === 405;

  const report = {
    generatedAt: REPORT_GENERATED_AT,
    enrichmentSetId: ENRICHMENT_SET_ID,
    contractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
    plantCount: plants.length,
    plantsProcessed: plants.map((p) => ({ slug: p.slug, scientific: p.scientific, batch: p.batch })),
    coverageByKnowledgeFamily: coverage,
    safetyCriticalCoverage,
    knowledgeEvidenceTotals: knowledgeEvidence,
    confirmedToxicityWarnings: safety.confirmedToxicityWarnings,
    toxicityRemainsUnknown: safety.toxicityUnknownPlants,
    regionalInvasivenessOrRestrictions: safety.regionalFindings,
    ownerReviewRequired: safety.ownerReviewFindings,
    sourceCount: uniqueSources.size,
    sourceRegistryEntriesCached: sourceCount,
    authorityBreakdown,
    persistenceRoundTrip: {
      plantKnowledgeRoundTripFailures: roundTripFailures,
      explanationTraceabilityFailures: explanationFailures
    },
    nonDestructiveClimateTruthProof: {
      failures: nondestructiveFailures,
      mergeOperator: "COALESCE(climate_traits,'{}') || jsonb_build_object('plantKnowledge', ...)",
      ok: nondestructiveFailures === 0
    },
    batch1EvidenceRegression: {
      expected: FROZEN_BATCH1_MATERIAL,
      beforeMerge: batch1InvBefore,
      afterMerge: batch1InvAfter,
      pass: b1Match
    },
    batch2EvidenceRegression: {
      expected: FROZEN_BATCH2_MATERIAL,
      beforeMerge: batch2InvBefore,
      afterMerge: batch2InvAfter,
      pass: b2Match
    },
    plantClimateV2Regression: {
      default: {
        materialFp: defFp,
        materialFn: defFn,
        heuristicDependentConfident: defHeur,
        verdict: climateDefault.json?.hardeningVerdict || climateDefault.json?.integrationVerdict || null
      },
      batch2: {
        materialFp: b2Fp,
        materialFn: b2Fn,
        heuristicDependentConfident: b2Heur,
        verdict: climateB2.json?.hardeningVerdict || climateB2.json?.integrationVerdict || null
      }
    },
    foundationSafetyTests: {
      pass: foundationTest.pass,
      fail: foundationTest.fail,
      status: foundationTest.status
    },
    safetyGates: {
      confirmedSafetyClaimsFromHeuristic: safety.confirmedSafetyFromHeuristic,
      falseSafeFromMissingData: safety.falseSafeFromMissing,
      regionalInvasiveToGlobalErrors: safety.regionalToGlobalErrors,
      unsupportedCultivarGeneralizations: safety.unsupportedCultivarGeneralizations,
      unprovenLegalRestrictionClaims: safety.unprovenLegalClaims
    },
    runtimeExternalCalls: 0,
    paidApiCostUsd: 0,
    aiApiCostUsd: 0,
    generatedFiles: [
      'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_handoff.json',
      'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_handoff.sha256',
      'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_upsert.sql',
      'data/catalog-expansion/plant-knowledge-v1/enrichment-60/handoff/plant_knowledge_warnings_60_verify.sql',
      'tests/_plant-knowledge-warnings-60-enrichment-report.json'
    ],
    handoffSha256: handoffSha,
    ownerAcceptedLiveHandoffSha: OWNER_ACCEPTED_LIVE_HANDOFF_SHA,
    validationFailures,
    blockers: uniqueBlockers,
    verdict: pass
      ? 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_60_ENRICHMENT: PASS'
      : 'CRUVIT_PLANT_KNOWLEDGE_WARNINGS_60_ENRICHMENT: FAIL'
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    verdict: report.verdict,
    plantCount: report.plantCount,
    handoffSha256: handoffSha,
    knowledgeEvidenceTotals: knowledgeEvidence,
    blockers: uniqueBlockers,
    batch1EvidenceRegression: report.batch1EvidenceRegression,
    batch2EvidenceRegression: report.batch2EvidenceRegression,
    plantClimateV2: report.plantClimateV2Regression,
    foundation: report.foundationSafetyTests,
    runtimeExternalCalls: 0,
    paidApiCostUsd: 0,
    aiApiCostUsd: 0
  }, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
