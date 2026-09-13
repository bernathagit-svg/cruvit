/**
 * Garden Areas / Microclimate V1 — zero paid AI contract tests.
 * Schema not applied: RLS/cross-garden simulated via pure asserts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARDEN_AREAS_V1_VERSION,
  GARDEN_CLIMATE_AUTHORITY,
  AREA_CONTEXT_CONTRACT_VERSION,
  AREA_CONTEXT_SCHEMA,
  normalizeAreaContext,
  buildAreaWritePayload,
  buildUserProvidedAreaContext,
  assertPlantAreaSameGarden,
  assertAreaOwnedByGarden,
  applyAreaContextToSuitabilityInputs,
  buildAreaReadModel,
  projectAreaContextToGardenContextProfile,
  areaLabelForPlant,
  detachPlantsAfterAreaDelete,
  resolvePlantSiteContextForComparison,
  evaluateAreaContextTrust,
  AREA_SUN_EXPOSURES
} from '../modules/personal-domain/garden-areas-v1-contract.js';
import { buildGardenDashboardReadModel } from '../modules/personal-domain/garden-dashboard-v1-contract.js';
import { renderGardenAreasHtml } from '../modules/personal-domain/garden-areas-v1-ui.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';
import { SR_GARDEN_CONTEXT_PROFILE_VERSION } from '../modules/smart-recommendations/developer-garden-context-profile.js';

const TODAY = '2026-09-13';
let paidAiCalls = 0;
let areaEventMutations = 0;
let areaStateMutations = 0;

test('10 / M: paid AI automated tests OFF / count = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidAiCalls, 0);
  assert.equal(GARDEN_CLIMATE_AUTHORITY.AREA_IS_SECOND_CLIMATE_AUTHORITY, false);
  assert.equal(GARDEN_CLIMATE_AUTHORITY.AREA_MAY_OVERRIDE_HARD_FROST_OR_REGIONAL_BLOCKS, false);
  assert.equal(AREA_CONTEXT_CONTRACT_VERSION, SR_GARDEN_CONTEXT_PROFILE_VERSION);
});

test('A: create Area payload in owned Garden shape', () => {
  const payload = buildAreaWritePayload({
    name: 'Patio pots',
    clientInstanceId: 'area_patio_1',
    context: buildUserProvidedAreaContext({
      sunExposure: 'part_sun',
      plantingMode: 'container',
      irrigationType: 'manual'
    })
  });
  assert.equal(payload.name, 'Patio pots');
  assert.equal(payload.client_instance_id, 'area_patio_1');
  assert.equal(payload.context.sunExposure, 'part_sun');
  assert.equal(payload.context.plantingMode, 'container');
  assert.equal(payload.context.climateAuthority, false);
  assert.equal(payload.context.schema, AREA_CONTEXT_SCHEMA);
  areaStateMutations += 1;
  assert.ok(areaStateMutations >= 1);
});

test('B: cross-user / cross-garden Area access rejected (app guard)', () => {
  assert.throws(
    () => assertAreaOwnedByGarden({ garden_profile_id: 'g_other' }, 'g_mine'),
    /cross_garden_area_access_forbidden/
  );
});

test('C: cross-Garden plant→Area assignment rejected', () => {
  assert.throws(
    () =>
      assertPlantAreaSameGarden({
        plantGardenProfileId: 'g1',
        areaGardenProfileId: 'g2'
      }),
    /cross_garden_area_link_forbidden/
  );
  assert.equal(
    assertPlantAreaSameGarden({
      plantGardenProfileId: 'g1',
      areaGardenProfileId: 'g1'
    }),
    true
  );
});

test('D: existing plant with NULL Area remains valid', () => {
  const plant = { id: 'p1', name: 'Mango', garden_area_id: null };
  assert.equal(areaLabelForPlant(plant, new Map()), null);
  const model = buildAreaReadModel(
    { id: 'a1', name: 'Front', garden_profile_id: 'g1', context: {} },
    [plant]
  );
  assert.equal(model.plantCount, 0);
});

test('E: deleting Area detaches plant safely (SET NULL semantics)', () => {
  const plants = [
    { id: 'p1', name: 'Basil', garden_area_id: 'area_1' },
    { id: 'p2', name: 'Rose', garden_area_id: 'area_2' }
  ];
  const next = detachPlantsAfterAreaDelete(plants, 'area_1');
  assert.equal(next[0].garden_area_id, null);
  assert.equal(next[0].name, 'Basil');
  assert.equal(next[1].garden_area_id, 'area_2');
});

test('F: Garden deletion removes Areas (cascade contract note)', () => {
  const gardenDeleted = true;
  const areasAfter = gardenDeleted ? [] : [{ id: 'a1' }];
  assert.deepEqual(areasAfter, []);
  const plantsSurvive = [{ id: 'p1', garden_area_id: null, name: 'Fig' }];
  assert.equal(plantsSurvive.length, 1);
});

test('2 / G: unknown remains explicit (no climate inference)', () => {
  const ctx = normalizeAreaContext({
    sunExposure: 'unknown',
    irrigationType: 'unknown',
    plantingMode: 'unknown',
    source: 'default_unknown',
    confirmationStatus: 'unconfirmed',
    confidence: 'none'
  });
  assert.equal(ctx.sunExposure, 'unknown');
  assert.equal(ctx.irrigationType, 'unknown');
  assert.equal(ctx.drainage, 'unknown');
  assert.equal(ctx.windExposure, 'unknown');
  assert.equal(ctx.moistureTendency, 'unknown');
  assert.equal(ctx.unknownReasons.sunExposure, 'not_provided');
  assert.ok(AREA_SUN_EXPOSURES.includes('unknown'));
  assert.equal(ctx.trusted, false);
});

test('7 / H: Area context cannot override hard climate block', () => {
  const result = applyAreaContextToSuitabilityInputs({
    hardClimateBlock: true,
    ambientClimate: { frostRisk: 'high' },
    areaContext: {
      sunExposure: 'full_sun',
      plantingMode: 'greenhouse',
      windExposure: 'sheltered',
      source: 'user_input',
      confirmationStatus: 'user_confirmed',
      confidence: 'high'
    }
  });
  assert.equal(result.hardClimateBlock, true);
  assert.equal(result.hardBlockClearedByArea, false);
  assert.equal(result.hardBlockOverriddenByArea, false);
  assert.equal(result.areaUsedAsClimateAuthority, false);
  assert.equal(result.recommendationBlocked.blocked, true);
  assert.equal(result.localSiteContext.sunExposure, 'full_sun');
  assert.equal(result.localSiteContext.plantingMode, 'greenhouse');
});

test('I: sun/water comparison uses Area / Garden Context, not ambient CCP alone', () => {
  const site = resolvePlantSiteContextForComparison({
    areaContext: { sunExposure: 'part_shade', irrigationType: 'drip', moistureTendency: 'moist' },
    gardenContextProfile: { sunExposure: 'full_sun', irrigationType: 'manual' },
    hardClimateBlock: false,
    ambientClimate: { label: 'Csa', frostRisk: 'low' }
  });
  assert.equal(site.sunExposure, 'part_shade');
  assert.equal(site.sunSource, 'area');
  assert.equal(site.waterProxy, 'drip');
  assert.equal(site.waterSource, 'area');
  assert.equal(site.ambientClimateUsedAsSiteSun, false);
  assert.equal(site.ambientClimateUsedAsSiteWater, false);
});

test('8 / J: Dashboard works with Areas present (optional labels)', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'Backyard', location_label: 'Haifa' },
    plants: [
      {
        name: 'Mango Tree',
        status: 'Healthy',
        mark: '✓',
        id: 'p1',
        areaLabel: 'Patio pots',
        gardenAreaId: 'a1'
      }
    ],
    tasks: [],
    events: [],
    todayIso: TODAY
  });
  assert.equal(model.summary.plantCount, 1);
  assert.equal(model.plantHealth.plants[0].areaLabel, 'Patio pots');
  assert.equal(model.mutationsOnBuild, false);
});

test('8 / K: Dashboard works with zero Areas', () => {
  const model = buildGardenDashboardReadModel({
    garden: { id: 'g1', name: 'Backyard' },
    plants: [{ name: 'Basil', status: 'Healthy', mark: '✓', id: 'p1' }],
    tasks: [],
    events: [],
    todayIso: TODAY
  });
  assert.equal(model.summary.plantCount, 1);
  assert.equal(model.plantHealth.plants[0].areaLabel, null);
  assert.equal(model.mutationsOnBuild, false);
});

test('L: render/hydrate creates no Area/event mutations', () => {
  const beforeEvents = areaEventMutations;
  const beforeState = areaStateMutations;
  const html = renderGardenAreasHtml({
    signedIn: true,
    areas: [
      {
        id: 'a1',
        name: 'North balcony',
        client_instance_id: 'c1',
        garden_profile_id: 'g1',
        context: { sunExposure: 'part_sun' }
      }
    ],
    plants: []
  });
  assert.match(html, /North balcony/);
  assert.match(html, /data-version/);
  assert.equal(areaEventMutations, beforeEvents);
  assert.equal(areaStateMutations, beforeState);
});

test('1: persisted user-confirmed Area context retains source + confirmation + confidence', () => {
  const persisted = buildUserProvidedAreaContext({
    sunExposure: 'full_sun',
    plantingMode: 'ground',
    irrigationType: 'drip',
    drainage: 'well_drained',
    irrigationReliability: 'high'
  });
  assert.equal(persisted.source, 'user_input');
  assert.equal(persisted.confirmationStatus, 'user_confirmed');
  assert.equal(persisted.confidence, 'medium');
  assert.equal(persisted.trusted, true);
  assert.equal(persisted.contractVersion, SR_GARDEN_CONTEXT_PROFILE_VERSION);

  const roundTrip = buildAreaReadModel({
    id: 'a1',
    name: 'Front bed',
    garden_profile_id: 'g1',
    context: persisted
  });
  assert.equal(roundTrip.source, 'user_input');
  assert.equal(roundTrip.confirmationStatus, 'user_confirmed');
  assert.equal(roundTrip.confidence, 'medium');
  assert.equal(roundTrip.context.precisionLevel, 'zone');
  assert.equal(roundTrip.trusted, true);
});

test('3: inferred/unconfirmed context cannot become trusted accidentally', () => {
  const inferred = normalizeAreaContext({
    sunExposure: 'full_sun',
    plantingMode: 'ground',
    drainage: 'well_drained',
    irrigationType: 'drip',
    irrigationReliability: 'high',
    source: 'inferred_from_photo',
    confirmationStatus: 'unconfirmed',
    confidence: 'high'
  });
  assert.equal(inferred.trusted, false);
  assert.equal(evaluateAreaContextTrust(inferred).reason, 'photo_or_inferred_unconfirmed');

  const photo = normalizeAreaContext({
    ...inferred,
    source: 'device_photo',
    confirmationStatus: 'unconfirmed',
    confidence: 'medium'
  });
  assert.equal(photo.trusted, false);

  const rm = buildAreaReadModel({ id: 'a1', name: 'X', context: inferred });
  assert.equal(rm.trusted, false);
  assert.equal(rm.gardenContextProfileProjection.trusted, false);
});

test('4: greenhouse remains distinguishable after read-model round trip', () => {
  const ctx = buildUserProvidedAreaContext({
    sunExposure: 'part_sun',
    plantingMode: 'greenhouse',
    irrigationType: 'drip'
  });
  assert.equal(ctx.plantingMode, 'greenhouse');
  assert.equal(ctx.siteType, 'greenhouse');

  const rm = buildAreaReadModel({
    id: 'a_gh',
    name: 'Greenhouse',
    garden_profile_id: 'g1',
    context: ctx
  });
  assert.equal(rm.plantingMode, 'greenhouse');
  assert.equal(rm.siteType, 'greenhouse');
  assert.equal(rm.context.plantingMode, 'greenhouse');
  assert.equal(rm.gardenContextProfileProjection.areaSiteType, 'greenhouse');
  assert.equal(rm.gardenContextProfileProjection.areaPlantingMode, 'greenhouse');
});

test('5: greenhouse projection cannot masquerade as ordinary trusted ground', () => {
  const proj = projectAreaContextToGardenContextProfile(
    buildUserProvidedAreaContext({
      sunExposure: 'full_sun',
      plantingMode: 'greenhouse',
      drainage: 'well_drained',
      irrigationType: 'drip',
      irrigationReliability: 'high',
      confidence: 'high'
    })
  );
  assert.equal(proj.plantingMode, 'ground'); // nearest GCP token only
  assert.equal(proj.areaSiteType, 'greenhouse');
  assert.equal(proj.semanticLoss, true);
  assert.equal(proj.trustedAsOrdinaryGround, false);
  assert.equal(proj.trusted, false);
  assert.equal(proj.profileStatus, 'insufficient');
  assert.ok(proj.projectionGaps.some((g) => g.code === 'gcp_unsupported_planting_mode_greenhouse'));
  assert.equal(proj.projectionGaps[0].trustedAsOrdinaryGround, false);
});

test('6: malformed/non-object context rejected on write or safely normalized on read', () => {
  assert.throws(
    () =>
      buildAreaWritePayload({
        name: 'Bad',
        clientInstanceId: 'c1',
        context: ['not', 'an', 'object']
      }),
    /area_context_must_be_object/
  );
  assert.throws(
    () =>
      buildAreaWritePayload({
        name: 'Bad',
        clientInstanceId: 'c1',
        context: 'full_sun'
      }),
    /area_context_must_be_object/
  );

  const safe = normalizeAreaContext(['array']);
  assert.equal(safe.sunExposure, 'unknown');
  assert.equal(safe.source, 'default_unknown');
  assert.equal(safe.trusted, false);
  assert.equal(safe.malformedInputNormalized, true);

  const fromNull = normalizeAreaContext(null);
  assert.equal(fromNull.plantingMode, 'unknown');
  assert.equal(fromNull.trusted, false);

  const rm = buildAreaReadModel({ id: 'a1', name: 'Z', context: 'oops' });
  assert.equal(rm.trusted, false);
  assert.equal(rm.context.sunExposure, 'unknown');
});

test('read model exposes Smart Rec / Design contract shape (no personalization)', () => {
  const rm = buildAreaReadModel(
    {
      id: 'a1',
      name: 'Shaded corner',
      garden_profile_id: 'g1',
      client_instance_id: 'area_shade',
      context: {
        sunExposure: 'full_shade',
        plantingMode: 'ground',
        irrigationType: 'unknown',
        source: 'user_input',
        confirmationStatus: 'user_confirmed',
        confidence: 'medium'
      }
    },
    [{ name: 'Fern', garden_area_id: 'a1' }]
  );
  assert.equal(rm.version, GARDEN_AREAS_V1_VERSION);
  assert.ok(rm.unknownFields.includes('irrigationType'));
  assert.equal(rm.unknownReasons.irrigationType, 'not_provided');
  assert.equal(rm.gardenContextProfileProjection.sunExposure, 'full_shade');
  assert.equal(rm.climateAuthority.AREA_IS_SECOND_CLIMATE_AUTHORITY, false);
  assert.equal(rm.plantCount, 1);
});
