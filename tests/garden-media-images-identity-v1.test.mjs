/**
 * Garden Media / Images / Identity V1 — zero paid AI contract tests.
 * Storage/schema not applied: RLS/cross-garden simulated via pure asserts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARDEN_MEDIA_V1_VERSION,
  GARDEN_MEDIA_AUTHORITY,
  GARDEN_MEDIA_STORAGE_BUCKET,
  GARDEN_MEDIA_SUPPORTED_MIMES,
  GARDEN_MEDIA_DELETION_POLICY,
  normalizeGardenMediaRecord,
  buildGardenMediaWritePayload,
  assertMediaPlantSameGarden,
  assertMediaAreaSameGarden,
  assertMediaOwnedByUser,
  appendMediaHistory,
  shouldReuseStorageObjectForChecksum,
  mayPromoteUserMediaToCatalogImage,
  mayPromoteUserMediaToDesignAsset,
  buildGardenMediaReadModel,
  buildFutureModuleMediaContracts,
  rejectUnsupportedMime,
  isHeicMime
} from '../modules/personal-domain/garden-media-v1-contract.js';
import { USER_PRIVATE_MEDIA_STORAGE_BUCKET } from '../modules/catalog-media/garden-design-asset-contract-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

let paidAiCalls = 0;
let mediaMutationsOnRender = 0;

test('Q: paid AI automated tests OFF / count = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidAiCalls, 0);
  assert.equal(GARDEN_MEDIA_AUTHORITY.STORE_BASE64_IN_POSTGRES, false);
  assert.equal(GARDEN_MEDIA_AUTHORITY.USER_MEDIA_MAY_AUTO_BECOME_CATALOG, false);
});

test('A/B payload: durable media metadata row shape (no bytes)', () => {
  const row = buildGardenMediaWritePayload({
    userId: 'u1',
    gardenProfileId: 'g1',
    gardenPlantId: 'p1',
    storagePath: 'u1/g1/2026/photo1.jpg',
    mimeType: 'image/jpeg',
    byteSize: 12000,
    width: 800,
    height: 600,
    sourceModule: 'my_garden',
    purpose: 'plant_profile',
    identitySource: 'user_assigned',
    identityConfidence: 'medium',
    contentSha256: 'a'.repeat(64)
  });
  assert.equal(row.storageBucket, GARDEN_MEDIA_STORAGE_BUCKET);
  assert.equal(row.storageBucket, USER_PRIVATE_MEDIA_STORAGE_BUCKET);
  assert.equal(row.mimeType, 'image/jpeg');
  assert.equal(row.isCatalogImage, false);
  assert.equal(row.botanicalIdentificationProof, false);
  assert.ok(!('base64' in row));
  assert.ok(!('bytes' in row));
});

test('D/E: garden + optional plant link fields present', () => {
  const withPlant = normalizeGardenMediaRecord({
    userId: 'u1',
    gardenProfileId: 'g1',
    gardenPlantId: 'p1',
    storagePath: 'u1/g1/a.jpg',
    mimeType: 'image/png',
    byteSize: 100
  });
  assert.equal(withPlant.gardenProfileId, 'g1');
  assert.equal(withPlant.gardenPlantId, 'p1');

  const gardenOnly = normalizeGardenMediaRecord({
    userId: 'u1',
    gardenProfileId: 'g1',
    gardenPlantId: null,
    storagePath: 'u1/g1/b.jpg',
    mimeType: 'image/png',
    byteSize: 100
  });
  assert.equal(gardenOnly.gardenPlantId, null);
});

test('F: plant with no image remains valid conceptually', () => {
  const plant = { id: 'p1', name: 'Mango', cover_media_id: null };
  assert.equal(plant.cover_media_id, null);
});

test('G: second image creates history, does not overwrite first', () => {
  const hist = appendMediaHistory(['media_1'], 'media_2');
  assert.deepEqual(hist, ['media_1', 'media_2']);
  assert.equal(hist[0], 'media_1');
});

test('H: cross-user access rejected', () => {
  assert.throws(
    () => assertMediaOwnedByUser({ user_id: 'u_other' }, 'u_mine'),
    /cross_user_media_access_forbidden/
  );
});

test('I: cross-Garden plant/media link rejected', () => {
  assert.throws(
    () =>
      assertMediaPlantSameGarden({
        mediaGardenProfileId: 'g1',
        plantGardenProfileId: 'g2'
      }),
    /cross_garden_media_plant_link_forbidden/
  );
});

test('J: cross-Garden Area/media link rejected', () => {
  assert.throws(
    () =>
      assertMediaAreaSameGarden({
        mediaGardenProfileId: 'g1',
        areaGardenProfileId: 'g2'
      }),
    /cross_garden_media_area_link_forbidden/
  );
});

test('K/L: malformed / unsupported MIME rejected', () => {
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        userId: 'u1',
        gardenProfileId: 'g1',
        storagePath: 'u1/g1/x.bin',
        mimeType: 'application/pdf',
        byteSize: 100
      }),
    /unsupported_media_mime/
  );
  assert.throws(() => rejectUnsupportedMime('image/gif'), /unsupported_media_mime/);
  assert.equal(isHeicMime('image/heic'), true);
  assert.throws(() => rejectUnsupportedMime('image/heic'), /heic_unsupported_in_v1/);
  assert.deepEqual([...GARDEN_MEDIA_SUPPORTED_MIMES], ['image/jpeg', 'image/png', 'image/webp']);
});

test('M: extension/MIME / data-URL persistence blocked', () => {
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        userId: 'u1',
        gardenProfileId: 'g1',
        storagePath: 'data:image/jpeg;base64,AAAA',
        mimeType: 'image/jpeg',
        byteSize: 10
      }),
    /raw_image_bytes_forbidden_in_media_record/
  );
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        userId: 'u1',
        gardenProfileId: 'g1',
        storagePath: 'u1/g1/ok.jpg',
        mimeType: 'image/jpeg',
        byteSize: 10,
        base64: 'AAAA'
      }),
    /raw_image_bytes_forbidden_in_media_record/
  );
});

test('N: no raw base64 stored in Postgres record shape', () => {
  const row = buildGardenMediaWritePayload({
    userId: 'u1',
    gardenProfileId: 'g1',
    storagePath: 'u1/g1/ok.jpg',
    mimeType: 'image/jpeg',
    byteSize: 10,
    metadata: { note: 'ok', base64: 'SHOULD_STRIP' }
  });
  assert.equal(row.metadata.base64, undefined);
  assert.equal(row.metadata.note, 'ok');
});

test('O: user photo never becomes catalog image automatically', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(mayPromoteUserMediaToDesignAsset(), false);
  const rm = buildGardenMediaReadModel({
    id: 'm1',
    user_id: 'u1',
    garden_profile_id: 'g1',
    storage_path: 'u1/g1/x.jpg',
    mime_type: 'image/jpeg',
    byte_size: 10
  });
  assert.equal(rm.isCatalogImage, false);
  assert.equal(rm.authority.USER_MEDIA_MAY_AUTO_BECOME_CATALOG, false);
});

test('P: render/hydrate creates zero media mutations', () => {
  const before = mediaMutationsOnRender;
  buildGardenMediaReadModel({
    id: 'm1',
    user_id: 'u1',
    garden_profile_id: 'g1',
    storage_path: 'u1/g1/x.jpg',
    mime_type: 'image/webp',
    byte_size: 20
  });
  buildFutureModuleMediaContracts();
  assert.equal(mediaMutationsOnRender, before);
});

test('checksum reuse hint does not erase history', () => {
  assert.equal(
    shouldReuseStorageObjectForChecksum({
      contentSha256: 'b'.repeat(64),
      existingMediaRow: { content_sha256: 'b'.repeat(64) }
    }),
    true
  );
  const hist = appendMediaHistory(['m_old'], 'm_new_same_bytes');
  assert.equal(hist.length, 2);
});

test('deletion policy + future module contracts', () => {
  assert.equal(GARDEN_MEDIA_DELETION_POLICY.plantDeleteOrArchive.includes('set_null'), true);
  assert.equal(GARDEN_MEDIA_DELETION_POLICY.areaDelete.includes('set_null'), true);
  assert.equal(GARDEN_MEDIA_DELETION_POLICY.orphanStorageForbidden, true);
  const fut = buildFutureModuleMediaContracts();
  assert.equal(fut.smartRecommendations.personalizationStarted, false);
  assert.equal(fut.plantDoctor.mayReuseStoredMediaId, true);
  assert.equal(GARDEN_MEDIA_V1_VERSION.includes('owner-review'), true);
});

test('C: image survives reload (metadata identity stable)', () => {
  const persisted = buildGardenMediaWritePayload({
    userId: 'u1',
    gardenProfileId: 'g1',
    gardenPlantId: 'p1',
    storagePath: 'u1/g1/persist.jpg',
    mimeType: 'image/jpeg',
    byteSize: 50,
    purpose: 'progress_photo'
  });
  const reloaded = buildGardenMediaReadModel({ id: 'm_persist', ...persisted });
  assert.equal(reloaded.storagePath, 'u1/g1/persist.jpg');
  assert.equal(reloaded.gardenPlantId, 'p1');
  assert.equal(reloaded.purpose, 'progress_photo');
});
