/**
 * Garden Media V1 runtime lifecycle tests — zero paid AI.
 * Mocks Supabase; no network; no production photo upload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateGardenMediaFile,
  createGardenMediaForPlant,
  deleteGardenMediaAsset,
  getGardenMediaSignedUrl,
  clearGardenMediaSignedUrlCache,
  gardenMediaUserErrorMessage
} from '../modules/personal-domain/garden-media-v1-runtime.js';
import {
  mayPromoteUserMediaToCatalogImage,
  GARDEN_MEDIA_MAX_BYTES,
  GARDEN_MEDIA_BUCKET_CONFIG,
  planCreateMediaAsset
} from '../modules/personal-domain/garden-media-v1-contract.js';
import { isPaidAiAutomatedTestAllowed } from '../modules/runtime-guards/paid-ai-tests-gate-v1.js';
import { FIXTURE_PROVIDER_CALLS } from './fixtures/plant-doctor/doctor-response-fixtures-v1.mjs';

const U1 = '11111111-1111-4111-8111-111111111111';
const G1 = '22222222-2222-4222-8222-222222222222';
const M1 = '33333333-3333-4333-8333-333333333333';
const P1 = '55555555-5555-4555-8555-555555555555';

function jpegFile(name = 'leaf.jpg', size = 1200) {
  const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const body = new Uint8Array(Math.max(0, size - header.length));
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, header.length);
  return new File([bytes], name, { type: 'image/jpeg' });
}

function pngFile(name = 'leaf.png', size = 1200) {
  const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const body = new Uint8Array(Math.max(0, size - header.length));
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, header.length);
  return new File([bytes], name, { type: 'image/png' });
}

function webpFile(name = 'leaf.webp', size = 1200) {
  const header = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
  ]);
  const body = new Uint8Array(Math.max(0, size - header.length));
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, header.length);
  return new File([bytes], name, { type: 'image/webp' });
}

function pdfMasquerade() {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
  return new File([bytes], 'fake.jpg', { type: 'application/pdf' });
}

function makeMockSupabase(opts = {}) {
  const state = {
    mediaRows: new Map(),
    storageObjects: new Set(),
    plantCover: null,
    uploadFail: opts.uploadFail === true,
    storageDeleteFail: opts.storageDeleteFail === true,
    insertOrder: []
  };

  const from = (table) => {
    if (table === 'garden_media') {
      return {
        insert(row) {
          state.insertOrder.push('db.insert');
          const r = { ...row };
          state.mediaRows.set(r.id, r);
          return {
            select() {
              return {
                async single() {
                  return { data: r, error: null };
                }
              };
            }
          };
        },
        update(patch) {
          return {
            eq(col, val) {
              const run = async () => {
                const row = state.mediaRows.get(val);
                if (!row) return { data: null, error: { message: 'not_found' } };
                Object.assign(row, patch);
                return { data: row, error: null };
              };
              return {
                select() {
                  return {
                    async single() {
                      return run();
                    }
                  };
                },
                then(resolve, reject) {
                  return run().then(resolve, reject);
                }
              };
            }
          };
        },
        delete() {
          return {
            async eq(_col, id) {
              state.mediaRows.delete(id);
              return { error: null };
            }
          };
        },
        select() {
          return {
            eq() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return this;
            },
            async maybeSingle() {
              return { data: null, error: null };
            },
            then(resolve) {
              resolve({ data: [...state.mediaRows.values()], error: null });
            }
          };
        }
      };
    }
    if (table === 'garden_plants') {
      return {
        update(patch) {
          return {
            eq() {
              return {
                eq() {
                  state.plantCover = patch.cover_media_id;
                  return {
                    eq() {
                      return Promise.resolve({ error: null });
                    },
                    then(resolve) {
                      resolve({ error: null });
                    }
                  };
                },
                then(resolve) {
                  state.plantCover = patch.cover_media_id;
                  resolve({ error: null });
                }
              };
            }
          };
        }
      };
    }
    throw new Error('unexpected_table_' + table);
  };

  const storage = {
    from(bucket) {
      assert.equal(bucket, 'user-garden-media');
      return {
        async upload(path, _file, _opts) {
          state.insertOrder.push('storage.upload');
          if (state.uploadFail) return { error: { message: 'upload_boom' } };
          state.storageObjects.add(path);
          return { data: { path }, error: null };
        },
        async remove(paths) {
          if (state.storageDeleteFail) return { error: { message: 'remove_boom' } };
          for (const p of paths) state.storageObjects.delete(p);
          return { data: paths, error: null };
        },
        async createSignedUrl(path, ttl) {
          assert.ok(ttl > 0);
          return {
            data: { signedUrl: `https://signed.example/${encodeURIComponent(path)}?t=1` },
            error: null
          };
        }
      };
    }
  };

  return { supabase: { from, storage }, state };
}

test('paid AI = 0 for media runtime suite', () => {
  assert.equal(isPaidAiAutomatedTestAllowed({}), false);
  assert.equal(FIXTURE_PROVIDER_CALLS, 0);
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  assert.equal(GARDEN_MEDIA_BUCKET_CONFIG.public, false);
});

test('valid JPEG / PNG / WebP sniff + validate', async () => {
  const j = await validateGardenMediaFile(jpegFile());
  assert.equal(j.mimeType, 'image/jpeg');
  const p = await validateGardenMediaFile(pngFile());
  assert.equal(p.mimeType, 'image/png');
  const w = await validateGardenMediaFile(webpFile());
  assert.equal(w.mimeType, 'image/webp');
});

test('MIME mismatch / non-image rejected; >8MB rejected; HEIC rejected', async () => {
  await assert.rejects(() => validateGardenMediaFile(pdfMasquerade()), /unsupported|mime_mismatch/i);
  const big = jpegFile('big.jpg', GARDEN_MEDIA_MAX_BYTES + 10);
  Object.defineProperty(big, 'size', { value: GARDEN_MEDIA_MAX_BYTES + 10 });
  await assert.rejects(() => validateGardenMediaFile(big), /media_too_large/);
  const heic = new File([new Uint8Array([0, 0, 0, 0])], 'x.heic', { type: 'image/heic' });
  await assert.rejects(() => validateGardenMediaFile(heic), /heic/i);
});

test('create lifecycle: pending insert before upload → validated; cover set', async () => {
  const { supabase, state } = makeMockSupabase();
  const result = await createGardenMediaForPlant({
    supabase,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    mediaId: M1,
    file: jpegFile(),
    setAsCover: true
  });
  assert.equal(result.media.validation_state, 'validated');
  assert.equal(state.insertOrder[0], 'db.insert');
  assert.equal(state.insertOrder[1], 'storage.upload');
  assert.equal(state.plantCover, M1);
  assert.equal(state.storageObjects.size, 1);
  assert.equal(mayPromoteUserMediaToCatalogImage(), false);
  // no base64 in stored row
  assert.equal(state.mediaRows.get(M1).metadata?.base64, undefined);
  assert.ok(!('base64' in (state.mediaRows.get(M1) || {})));
});

test('failed upload: no silent orphan (row removed)', async () => {
  const { supabase, state } = makeMockSupabase({ uploadFail: true });
  await assert.rejects(
    () =>
      createGardenMediaForPlant({
        supabase,
        userId: U1,
        gardenProfileId: G1,
        gardenPlantId: P1,
        mediaId: M1,
        file: jpegFile()
      }),
    /upload_boom|upload_failed/
  );
  assert.equal(state.mediaRows.has(M1), false);
  assert.equal(state.storageObjects.size, 0);
});

test('signed URL private delivery; path is authority (not persisted as signed)', async () => {
  clearGardenMediaSignedUrlCache();
  const { supabase } = makeMockSupabase();
  const path = `${U1}/${G1}/${M1}/leaf.jpg`;
  const a = await getGardenMediaSignedUrl({ supabase, storagePath: path, mediaId: M1 });
  assert.match(a.signedUrl, /^https:\/\/signed\.example\//);
  const b = await getGardenMediaSignedUrl({ supabase, storagePath: path, mediaId: M1 });
  assert.equal(b.fromCache, true);
});

test('second photo plan preserves history (new id); cover pointer separate', () => {
  const p1 = planCreateMediaAsset({
    userId: U1,
    gardenProfileId: G1,
    mediaId: M1,
    mimeType: 'image/jpeg'
  });
  const p2 = planCreateMediaAsset({
    userId: U1,
    gardenProfileId: G1,
    mediaId: '44444444-4444-4444-8444-444444444444',
    mimeType: 'image/jpeg'
  });
  assert.notEqual(p1.steps[0].id, p2.steps[0].id);
  assert.equal(p1.forbiddenNormalFlow, 'upload_object_then_insert_garden_media_row');
});

test('delete: storage then row; storage fail → cleanup_pending', async () => {
  const { supabase, state } = makeMockSupabase();
  await createGardenMediaForPlant({
    supabase,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    mediaId: M1,
    file: jpegFile()
  });
  const row = state.mediaRows.get(M1);
  await deleteGardenMediaAsset({ supabase, mediaRow: row, gardenProfileId: G1 });
  assert.equal(state.mediaRows.has(M1), false);
  assert.equal(state.storageObjects.size, 0);

  const { supabase: sb2, state: st2 } = makeMockSupabase({ storageDeleteFail: true });
  await createGardenMediaForPlant({
    supabase: sb2,
    userId: U1,
    gardenProfileId: G1,
    gardenPlantId: P1,
    mediaId: M1,
    file: jpegFile()
  });
  await assert.rejects(
    () =>
      deleteGardenMediaAsset({
        supabase: sb2,
        mediaRow: st2.mediaRows.get(M1),
        gardenProfileId: G1
      }),
    /cleanup_pending/i
  );
  assert.equal(st2.mediaRows.get(M1).validation_state, 'cleanup_pending');
});

test('HEIC user message is clear', () => {
  assert.match(
    gardenMediaUserErrorMessage({ code: 'HEIC_UNSUPPORTED', message: 'heic_unsupported_in_v1' }),
    /HEIC/i
  );
});

test('ops SQL still declares private bucket / no UPDATE', () => {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../supabase/ops/PRIVATE_BUCKET_AND_STORAGE_POLICIES_V1.sql'),
    'utf8'
  );
  assert.match(sql, /public:\s*false|public = false/);
  assert.equal(/\ncreate policy user_garden_media_update_own\b/i.test(sql), false);
});
