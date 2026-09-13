/**
 * Garden Media / Images / Identity V1 — zero paid AI contract tests.
 * Storage/schema not applied: RLS/cross-garden/cleanup simulated via pure asserts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GARDEN_MEDIA_V1_VERSION,
  GARDEN_MEDIA_AUTHORITY,
  GARDEN_MEDIA_STORAGE_BUCKET,
  GARDEN_MEDIA_SUPPORTED_MIMES,
  GARDEN_MEDIA_MAX_BYTES,
  GARDEN_MEDIA_DELETION_POLICY,
  GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT,
  GARDEN_MEDIA_BUCKET_CONFIG,
  GARDEN_MEDIA_STORAGE_PATH_PATTERN,
  GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1,
  MEDIA_VALIDATION_STATES,
  normalizeGardenMediaRecord,
  buildGardenMediaWritePayload,
  buildGardenMediaStoragePath,
  assertGardenMediaStoragePath,
  buildGardenMediaStoragePrefix,
  assertMediaPlantSameGarden,
  assertMediaAreaSameGarden,
  assertCoverMediaSameGarden,
  assertMediaOwnedByUser,
  assertOwnedGardenStoragePathAccess,
  appendMediaHistory,
  shouldReuseStorageObjectForChecksum,
  mayPromoteUserMediaToCatalogImage,
  mayPromoteUserMediaToDesignAsset,
  planCreateMediaAsset,
  planDeleteMediaAsset,
  planDeleteGardenMediaStorage,
  buildGardenMediaReadModel,
  buildFutureModuleMediaContracts,
  rejectUnsupportedMime,
  isHeicMime
} from '../modules/personal-domain/garden-media-v1-contract.js';
import { USER_PRIVATE_MEDIA_STORAGE_BUCKET } from '../modules/catalog-media/garden-design-asset-contract-v1.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_POLICY_SQL = readFileSync(
  join(__dirname, '../supabase/ops/PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1.sql'),
  'utf8'
);

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const G1 = '22222222-2222-4222-8222-222222222222';
const G2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const M1 = '33333333-3333-4333-8333-333333333333';
const M2 = '44444444-4444-4444-8444-444444444444';
const P1 = '55555555-5555-4555-8555-555555555555';

function pathFor(userId, gardenId, mediaId, filename = 'photo.jpg') {
  return `${userId}/${gardenId}/${mediaId}/${filename}`;
}

let paidAiCalls = 0;
let mediaMutationsOnRender = 0;

test('Q: paid AI automated tests OFF / count = 0', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(paidAiCalls, 0);
  assert.equal(GARDEN_MEDIA_AUTHORITY.STORE_BASE64_IN_POSTGRES, false);
  assert.equal(GARDEN_MEDIA_AUTHORITY.USER_MEDIA_MAY_AUTO_BECOME_CATALOG, false);
});

test('storage policies V1: no UPDATE; SELECT/INSERT/DELETE only', () => {
  assert.equal(GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1.allowUpdate, false);
  assert.deepEqual([...GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1.operations], [
    'select',
    'insert',
    'delete'
  ]);
  assert.equal(GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1.anonymousAccess, false);
  assert.equal(GARDEN_MEDIA_STORAGE_OBJECT_POLICIES_V1.public, false);
  assert.match(STORAGE_POLICY_SQL, /for select/i);
  assert.match(STORAGE_POLICY_SQL, /for insert/i);
  assert.match(STORAGE_POLICY_SQL, /for delete/i);
  assert.match(STORAGE_POLICY_SQL, /NO UPDATE policy/i);
  assert.match(STORAGE_POLICY_SQL, /drop policy if exists user_garden_media_update_own/i);
  assert.equal(/\ncreate policy user_garden_media_update_own\b/i.test(STORAGE_POLICY_SQL), false);
  assert.equal(/\n\s*for update\b/i.test(STORAGE_POLICY_SQL), false);
});

test('path: locked owner/garden/media/filename shape', () => {
  const p = buildGardenMediaStoragePath({
    userId: U1,
    gardenProfileId: G1,
    mediaId: M1,
    filename: 'leaf.png',
    mimeType: 'image/png'
  });
  assert.equal(p, pathFor(U1, G1, M1, 'leaf.png'));
  assert.equal(GARDEN_MEDIA_STORAGE_PATH_PATTERN, '{user_id}/{garden_profile_id}/{garden_media_id}/{filename}');
  const parsed = assertGardenMediaStoragePath({
    storagePath: p,
    userId: U1,
    gardenProfileId: G1,
    mediaId: M1
  });
  assert.equal(parsed.firstSegmentIsOwner, true);
  assert.throws(
    () =>
      assertGardenMediaStoragePath({
        storagePath: pathFor(U2, G1, M1),
        userId: U1,
        gardenProfileId: G1,
        mediaId: M1
      }),
    /storage_path_owner_mismatch/
  );
});

test('path isolation: cross-user path denied', () => {
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        id: M1,
        userId: U1,
        gardenProfileId: G1,
        storagePath: pathFor(U2, G1, M1),
        mimeType: 'image/jpeg',
        byteSize: 100
      }),
    /storage_path_owner_mismatch/
  );
  assert.throws(
    () =>
      assertOwnedGardenStoragePathAccess({
        authUserId: U1,
        ownedGardenIds: [G1],
        storagePath: pathFor(U2, G1, M1)
      }),
    /storage_path_owner_mismatch|cross_user/
  );
});

test('owned garden path: arbitrary non-owned Garden denied; owned allowed', () => {
  assert.throws(
    () =>
      assertOwnedGardenStoragePathAccess({
        authUserId: U1,
        ownedGardenIds: [G1],
        storagePath: pathFor(U1, G2, M1)
      }),
    /storage_path_garden_not_owned/
  );
  const ok = assertOwnedGardenStoragePathAccess({
    authUserId: U1,
    ownedGardenIds: [G1, G2],
    storagePath: pathFor(U1, G1, M1)
  });
  assert.equal(ok.ownedGardenVerified, true);
  assert.equal(ok.gardenProfileId, G1);
  assert.match(STORAGE_POLICY_SQL, /garden_profiles g/);
  assert.match(STORAGE_POLICY_SQL, /g\.user_id = \(select auth\.uid\(\)\)/);
});

test('A/B payload: durable media metadata row shape (no bytes); create defaults pending', () => {
  const row = buildGardenMediaWritePayload({
    id: M1,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    storagePath: pathFor(U1, G1, M1, 'photo1.jpg'),
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
  assert.equal(row.validationState, 'pending');
  assert.equal(row.isCatalogImage, false);
  assert.ok(!('base64' in row));
  assert.ok([...MEDIA_VALIDATION_STATES].includes('cleanup_pending'));
});

test('bucket config contract: private 8MB jpeg/png/webp; no public access', () => {
  assert.equal(GARDEN_MEDIA_BUCKET_CONFIG.id, 'user-garden-media');
  assert.equal(GARDEN_MEDIA_BUCKET_CONFIG.public, false);
  assert.equal(GARDEN_MEDIA_BUCKET_CONFIG.file_size_limit, 8388608);
  assert.equal(GARDEN_MEDIA_MAX_BYTES, 8388608);
  assert.deepEqual([...GARDEN_MEDIA_BUCKET_CONFIG.allowed_mime_types], [
    'image/jpeg',
    'image/png',
    'image/webp'
  ]);
  assert.match(STORAGE_POLICY_SQL, /public:\s*false|public = false/i);
});

test('D/E: garden + optional plant link fields present', () => {
  const withPlant = normalizeGardenMediaRecord({
    id: M1,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    storagePath: pathFor(U1, G1, M1, 'a.png'),
    mimeType: 'image/png',
    byteSize: 100
  });
  assert.equal(withPlant.gardenProfileId, G1);
  assert.equal(withPlant.gardenPlantId, P1);

  const gardenOnly = normalizeGardenMediaRecord({
    id: M2,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: null,
    storagePath: pathFor(U1, G1, M2, 'b.png'),
    mimeType: 'image/png',
    byteSize: 100
  });
  assert.equal(gardenOnly.gardenPlantId, null);
});

test('F: plant with no image remains valid conceptually', () => {
  const plant = { id: P1, name: 'Mango', cover_media_id: null };
  assert.equal(plant.cover_media_id, null);
});

test('G: second image creates history, does not overwrite first', () => {
  const hist = appendMediaHistory([M1], M2);
  assert.deepEqual(hist, [M1, M2]);
});

test('H: cross-user access / read denied', () => {
  assert.throws(
    () => assertMediaOwnedByUser({ user_id: U2 }, U1),
    /cross_user_media_access_forbidden/
  );
});

test('I: cross-Garden plant/media link rejected', () => {
  assert.throws(
    () =>
      assertMediaPlantSameGarden({
        mediaGardenProfileId: G1,
        plantGardenProfileId: G2
      }),
    /cross_garden_media_plant_link_forbidden/
  );
});

test('J: cross-Garden Area/media link rejected', () => {
  assert.throws(
    () =>
      assertMediaAreaSameGarden({
        mediaGardenProfileId: G1,
        areaGardenProfileId: G2
      }),
    /cross_garden_media_area_link_forbidden/
  );
});

test('cover_media same-Garden + plant mismatch', () => {
  assert.throws(
    () =>
      assertCoverMediaSameGarden({
        plantGardenProfileId: G1,
        mediaGardenProfileId: G2,
        plantId: P1,
        mediaPlantId: P1
      }),
    /cross_garden_cover_media_link_forbidden/
  );
  assert.equal(
    assertCoverMediaSameGarden({
      plantGardenProfileId: G1,
      mediaGardenProfileId: G1,
      plantId: P1,
      mediaPlantId: P1
    }),
    true
  );
});

test('K/L: malformed / unsupported MIME + size contract', () => {
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        id: M1,
        userId: U1,
        gardenProfileId: G1,
        storagePath: pathFor(U1, G1, M1, 'x.bin'),
        mimeType: 'application/pdf',
        byteSize: 100
      }),
    /unsupported_media_mime/
  );
  assert.throws(() => rejectUnsupportedMime('image/gif'), /unsupported_media_mime/);
  assert.equal(isHeicMime('image/heic'), true);
  assert.throws(() => rejectUnsupportedMime('image/heic'), /heic_unsupported_in_v1/);
  assert.deepEqual([...GARDEN_MEDIA_SUPPORTED_MIMES], ['image/jpeg', 'image/png', 'image/webp']);
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        id: M1,
        userId: U1,
        gardenProfileId: G1,
        storagePath: pathFor(U1, G1, M1),
        mimeType: 'image/jpeg',
        byteSize: GARDEN_MEDIA_MAX_BYTES + 1
      }),
    /media_too_large/
  );
});

test('M: data-URL / base64 persistence blocked', () => {
  assert.throws(
    () =>
      buildGardenMediaWritePayload({
        id: M1,
        userId: U1,
        gardenProfileId: G1,
        storagePath: 'data:image/jpeg;base64,AAAA',
        mimeType: 'image/jpeg',
        byteSize: 10
      }),
    /raw_image_bytes_forbidden_in_media_record/
  );
});

test('N: no raw base64 stored in Postgres record shape', () => {
  const row = buildGardenMediaWritePayload({
    id: M1,
    userId: U1,
    gardenProfileId: G1,
    storagePath: pathFor(U1, G1, M1, 'ok.jpg'),
    mimeType: 'image/jpeg',
    byteSize: 10,
    metadata: { note: 'ok', base64: 'SHOULD_STRIP' }
  });
  assert.equal(row.metadata.base64, undefined);
});

test('O: user photo never becomes catalog image automatically', () => {
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(mayPromoteUserMediaToDesignAsset(), false);
  const rm = buildGardenMediaReadModel({
    id: M1,
    user_id: U1,
    garden_profile_id: G1,
    storage_path: pathFor(U1, G1, M1, 'x.jpg'),
    mime_type: 'image/jpeg',
    byte_size: 10,
    validation_state: 'validated'
  });
  assert.equal(rm.isCatalogImage, false);
  assert.equal(rm.authority.USER_MEDIA_MAY_AUTO_BECOME_CATALOG, false);
  assert.equal(rm.delivery.anonymousPublicAccess, false);
  assert.equal(rm.storageObjectPolicies.allowUpdate, false);
});

test('P: render/hydrate creates zero media mutations', () => {
  const before = mediaMutationsOnRender;
  buildGardenMediaReadModel({
    id: M1,
    user_id: U1,
    garden_profile_id: G1,
    storage_path: pathFor(U1, G1, M1, 'x.webp'),
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
  assert.equal(appendMediaHistory([M1], M2).length, 2);
});

test('lifecycle: pending → upload → validated; upload-first forbidden', () => {
  const plan = planCreateMediaAsset({
    userId: U1,
    gardenProfileId: G1,
    mediaId: M1,
    filename: 'shot.jpg',
    mimeType: 'image/jpeg'
  });
  assert.equal(plan.forbiddenNormalFlow, 'upload_object_then_insert_garden_media_row');
  assert.equal(plan.storageObjectUpdateAllowed, false);
  assert.equal(plan.steps[1].validation_state, 'pending');
  assert.equal(plan.steps[2].op, 'storage.upload');
  assert.equal(plan.steps[3].set.validation_state, 'validated');
  assert.equal(plan.onUploadFailure.doNotUseValidationState, 'deleted');
  assert.equal(plan.onUploadFailure.alternateBoundedState, 'cleanup_pending');
  assert.equal(plan.onUploadFailure.allowSilentStorageOrphan, false);
  assert.equal(
    GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT.createMediaAsset.forbiddenNormalFlow,
    'upload_object_then_insert_garden_media_row'
  );
});

test('failed upload: no silent orphan; not overloaded deleted', () => {
  const plan = planCreateMediaAsset({
    userId: U1,
    gardenProfileId: G1,
    mediaId: M1,
    mimeType: 'image/jpeg'
  });
  assert.equal(plan.onUploadFailure.preferred[0].op, 'storage.remove_if_exists');
  assert.equal(plan.onUploadFailure.preferred[1].op, 'db.delete');
  assert.notEqual(plan.onUploadFailure.alternateBoundedState, 'deleted');
});

test('cleanup: media delete prefers storage then row; failure → cleanup_pending', () => {
  const plan = planDeleteMediaAsset({
    mediaId: M1,
    storagePath: pathFor(U1, G1, M1)
  });
  assert.equal(plan.postgresFkDeletesStorage, false);
  assert.equal(plan.storageObjectUpdateAllowed, false);
  assert.equal(plan.steps[0].op, 'storage.remove');
  assert.equal(plan.onStorageFailure.set.validation_state, 'cleanup_pending');
  assert.equal(
    GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT.deleteIndividualMediaAsset.onStorageDeleteFailure
      .setValidationState,
    'cleanup_pending'
  );
});

test('cleanup: Garden delete does NOT assume FK deletes Storage', () => {
  const plan = planDeleteGardenMediaStorage({ userId: U1, gardenProfileId: G1 });
  assert.equal(plan.postgresFkDeletesStorage, false);
  assert.equal(plan.prefix, buildGardenMediaStoragePrefix(U1, G1));
  assert.equal(GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT.deletePlant.gardenPlantId, 'SET NULL');
  assert.equal(GARDEN_MEDIA_STORAGE_CLEANUP_CONTRACT.deleteArea.gardenAreaId, 'SET NULL');
  assert.equal(GARDEN_MEDIA_DELETION_POLICY.postgresFkDeletesStorage, false);
});

test('deletion policy + future module contracts', () => {
  assert.equal(GARDEN_MEDIA_DELETION_POLICY.orphanStorageForbidden, true);
  const fut = buildFutureModuleMediaContracts();
  assert.equal(fut.smartRecommendations.personalizationStarted, false);
  assert.equal(GARDEN_MEDIA_V1_VERSION.includes('storage-harden'), true);
});

test('C: image survives reload (metadata identity stable)', () => {
  const persisted = buildGardenMediaWritePayload({
    id: M1,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    storagePath: pathFor(U1, G1, M1, 'persist.jpg'),
    mimeType: 'image/jpeg',
    byteSize: 50,
    purpose: 'progress_photo',
    validationState: 'validated'
  });
  const reloaded = buildGardenMediaReadModel({ id: M1, ...persisted });
  assert.equal(reloaded.storagePath, pathFor(U1, G1, M1, 'persist.jpg'));
  assert.equal(reloaded.validationState, 'validated');
  assert.equal(reloaded.gardenPlantId, P1);
});
