#!/usr/bin/env node
/**
 * Real R2 remote-only canary verify + Mojstrana Pineapple product-proof path.
 * Loads `.env.r2.local` safely. Forces R2 (no object-mirror). Disables local tiles.
 * Never prints secret values.
 *
 * Usage: node scripts/coordinate-climate-v2-verify-r2-canary.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyR2LocalEnvFromFile,
  getR2ConnectionStatus,
  buildClimateObjectKey,
  clearClimateObjectStorageCaches,
  OBJECT_MIRROR_ENV
} from '../modules/personal-domain/coordinate-climate-global-object-storage-v1.js';
import {
  clearGlobalRuntimeCaches,
  GLOBAL_BAKE_ID_DEFAULT
} from '../modules/personal-domain/coordinate-climate-global-lookup-v2.js';
import {
  resolveGardenStructuralClimateFromCoordinateV2Async,
  resetCoordinateClimateRuntimeCounters,
  getCoordinateClimateRuntimeCounters
} from '../modules/personal-domain/coordinate-climate-garden-hydrate-v2.js';
import { coordinateClimateProfileToStructuralPersistence } from '../modules/personal-domain/coordinate-climate-authority-v2-contract.js';
import {
  deriveSpecificPlantOutcomes,
  findCatalogPlantBySlugOrName
} from '../modules/personal-domain/specific-plant-suitability-contract.js';
import { buildSrHeroAnswerViewModel } from '../modules/personal-domain/smart-rec-hero-answer-view-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'coordinate-climate', 'v2');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');
const OUT = path.join(ROOT, 'data', 'catalog', 'product-proof-v1', 'REAL_R2_CANARY_VERIFY.json');

const POINTS = [
  { name: 'Mojstrana', lat: 46.42383, lon: 13.8752, tileKey: 'chelsa30s-t64:363:70' },
  { name: 'Ljubljana', lat: 46.0569, lon: 14.5058, tileKey: 'chelsa30s-t64:364:71' },
  { name: 'NYC', lat: 40.7128, lon: -74.006, tileKey: 'chelsa30s-t64:198:81' }
];

async function main() {
  clearClimateObjectStorageCaches();
  clearGlobalRuntimeCaches();
  resetCoordinateClimateRuntimeCounters();
  delete process.env[OBJECT_MIRROR_ENV];
  process.env.CRUVIT_CLIMATE_FORCE_R2 = '1';
  applyR2LocalEnvFromFile(process.env);

  const status = getR2ConnectionStatus();
  if (!status.ready || !status.bucketIsCruvitGlobalClimate) {
    console.log(
      JSON.stringify({
        verdict: 'R2_CANARY_BLOCKED',
        ready: status.ready,
        missing: status.missing,
        bucketName: status.bucketName
      })
    );
    process.exit(3);
  }

  const results = [];
  for (const p of POINTS) {
    const resolved = await resolveGardenStructuralClimateFromCoordinateV2Async(p.lat, p.lon, {
      dataRoot: DATA,
      enqueuePrep: false,
      disableLocalTiles: true,
      allowRemote: true,
      label: p.name,
      env: process.env
    });
    const objectKey = buildClimateObjectKey({
      kind: 'tile',
      tileKey: p.tileKey,
      globalBakeId: GLOBAL_BAKE_ID_DEFAULT
    });
    results.push({
      name: p.name,
      coordinates: { lat: p.lat, lon: p.lon },
      tileIdentity: resolved.tileKey || null,
      expectedTileIdentity: p.tileKey,
      r2ObjectKey: resolved.objectKey || objectKey,
      lookupSource: resolved.lookupSource || null,
      climateStatus: resolved.structuralClimate?.status || null,
      freezingRisk: resolved.structuralClimate?.freezingRisk || null,
      ok: resolved.ok === true && resolved.lookupSource === 'global-tile-o1-remote',
      error: resolved.ok ? null : resolved.code || null,
      CHELSA: getCoordinateClimateRuntimeCounters().chelsaExternalCalls
    });
  }

  const passCount = results.filter((r) => r.ok).length;
  const moj = results.find((r) => r.name === 'Mojstrana');
  let pineapple = null;
  if (moj?.ok) {
    const resolved = await resolveGardenStructuralClimateFromCoordinateV2Async(46.42383, 13.8752, {
      dataRoot: DATA,
      enqueuePrep: false,
      disableLocalTiles: true,
      allowRemote: true,
      label: 'Mojstrana',
      env: process.env
    });
    const structural =
      resolved.structuralClimate ||
      coordinateClimateProfileToStructuralPersistence(resolved.profile);
    const climateProfile = {
      locationLabel: 'mojstrana',
      broadClimate: structural.broadClimateOverride || null,
      freezingRisk: structural.freezingRisk,
      moistureRegime: structural.moistureRegime,
      humidityRegime: structural.humidityRegime,
      thermalRegime: structural.thermalRegime,
      structuralClimateStatus: structural.status,
      structuralClimate: structural
    };
    const plants = (
      JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, '')).plants || []
    ).map((p) => ({
      slug: p.slug,
      name: p.names?.en || p.name || p.slug,
      scientific: p.scientific,
      aliases: p.aliases || [],
      climateTraits: p.climateTraits || null,
      tags: p.tags || []
    }));
    const plant = findCatalogPlantBySlugOrName(plants, 'pineapple');
    const blocked =
      plant?.climateTraits?.frostSensitivity === 'high' && climateProfile.freezingRisk !== 'low';
    const suitability = blocked
      ? {
          recommendationLevel: 'blocked',
          suitabilityScore: 0,
          survivalFit: 0,
          thriveFit: 0,
          floweringFit: 0,
          fruitingFit: 0,
          warnings: ['Frost risk is too high for this plant.'],
          explanationText: 'Frost risk is too high for this plant.'
        }
      : {
          recommendationLevel: 'borderline',
          suitabilityScore: 50,
          survivalFit: 50,
          thriveFit: 50,
          floweringFit: 50,
          fruitingFit: 50,
          warnings: ['Review outdoor frost exposure.'],
          explanationText: 'Review outdoor frost exposure.'
        };
    const outcomes = deriveSpecificPlantOutcomes({
      meta: {
        frostSensitivity: plant.climateTraits.frostSensitivity,
        heatTolerance: plant.climateTraits.heatTolerance,
        coldTolerance: plant.climateTraits.coldTolerance,
        groupIds: plant.climateTraits.groupIds || [],
        needsReview: plant.climateTraits.needsReview === true,
        floweringRequirements: plant.climateTraits.floweringRequirements || '',
        fruitingRequirements: plant.climateTraits.fruitingRequirements || ''
      },
      climateProfile,
      suitability,
      plant
    });
    const hero = buildSrHeroAnswerViewModel({
      trusted: true,
      climateKnown: true,
      plant,
      suitability: Object.assign({}, suitability, { specificPlantOutcomes: outcomes }),
      climateProfile,
      locationLabel: 'Mojstrana, Slovenia',
      outcomes
    });
    pineapple = {
      plant: { slug: plant.slug, scientific: plant.scientific },
      SURVIVAL: outcomes.survival,
      GROWTH: outcomes.growth,
      FLOWERING: outcomes.flowering,
      FRUITING: outcomes.fruiting,
      OVERALL: outcomes.overall,
      MAIN_LIMITER: outcomes.mainLimiter || outcomes.limitingFactors?.[0] || null,
      heroTruthState: hero.truthState,
      REAL_R2_TO_PINEAPPLE_HERO_PATH_PROVEN:
        outcomes.overall === 'blocked' &&
        outcomes.survival === 'unreliable' &&
        outcomes.growth === 'poor' &&
        outcomes.flowering === 'unknown' &&
        outcomes.fruiting === 'unknown' &&
        hero.truthState === 'E_BLOCKED'
          ? 'YES'
          : 'NO'
    };
  }

  const report = {
    bucketName: status.bucketName,
    REAL_R2_REMOTE_LOOKUP: `${passCount} / 3`,
    CHELSA_TOTAL: getCoordinateClimateRuntimeCounters().chelsaExternalCalls,
    results,
    pineapple
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (passCount !== 3 || pineapple?.REAL_R2_TO_PINEAPPLE_HERO_PATH_PROVEN !== 'YES') {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
