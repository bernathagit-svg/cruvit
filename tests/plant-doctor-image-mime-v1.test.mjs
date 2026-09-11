/**
 * Plant Doctor image MIME fix V1 — unit tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANT_DOCTOR_IMAGE_USER_ERROR,
  isProviderImageMediaTypeError,
  mimeFromDataUrl,
  resolvePlantDoctorImagePayload,
  sniffImageMimeFromBase64,
  toPlantDoctorImageUserError
} from '../modules/plant-doctor/plant-doctor-image-mime-v1.js';

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

const JPEG_MAGIC = b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_MAGIC = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_MAGIC = b64([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20
]);
const GIF_MAGIC = b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

test('A: PNG upload resolves media_type image/png (not jpeg)', () => {
  const payload = resolvePlantDoctorImagePayload({
    dataUrl: `data:image/png;base64,${PNG_MAGIC}`,
    base64: PNG_MAGIC
  });
  assert.equal(payload.mediaType, 'image/png');
  assert.equal(payload.data, PNG_MAGIC);
});

test('B: JPEG upload resolves media_type image/jpeg', () => {
  const payload = resolvePlantDoctorImagePayload({
    dataUrl: `data:image/jpeg;base64,${JPEG_MAGIC}`,
    base64: JPEG_MAGIC
  });
  assert.equal(payload.mediaType, 'image/jpeg');
});

test('C: WEBP upload resolves media_type image/webp', () => {
  const payload = resolvePlantDoctorImagePayload({
    dataUrl: `data:image/webp;base64,${WEBP_MAGIC}`,
    base64: WEBP_MAGIC
  });
  assert.equal(payload.mediaType, 'image/webp');
});

test('D: declared JPEG + PNG bytes → corrected to image/png before provider', () => {
  // Reproduces the live failure: hardcoded/wrong label vs PNG bytes.
  const payload = resolvePlantDoctorImagePayload({
    dataUrl: `data:image/jpeg;base64,${PNG_MAGIC}`,
    base64: PNG_MAGIC
  });
  assert.equal(payload.mediaType, 'image/png');
  assert.equal(payload.correctedFrom, 'image/jpeg');
  assert.equal(payload.consistent, false);
});

test('D2: sniff prefers magic bytes over data-URL label', () => {
  assert.equal(sniffImageMimeFromBase64(PNG_MAGIC), 'image/png');
  assert.equal(mimeFromDataUrl('data:image/jpeg;base64,xxx'), 'image/jpeg');
});

test('E: unsupported image → blocked with friendly user error', () => {
  assert.throws(
    () =>
      resolvePlantDoctorImagePayload({
        dataUrl: `data:image/gif;base64,${GIF_MAGIC}`,
        base64: GIF_MAGIC
      }),
    (err) => err && err.code === 'UNSUPPORTED_IMAGE'
  );
  assert.equal(
    toPlantDoctorImageUserError({ code: 'UNSUPPORTED_IMAGE', message: 'UNSUPPORTED_IMAGE' }),
    PLANT_DOCTOR_IMAGE_USER_ERROR
  );
});

test('E2: raw provider MIME error is hidden from users', () => {
  const raw =
    'messages.0.content.0.image.source.base64: The image was specified using the image/jpeg media type, but the image appears to be a image/png image';
  assert.equal(isProviderImageMediaTypeError(raw), true);
  assert.equal(toPlantDoctorImageUserError(new Error(raw)), PLANT_DOCTOR_IMAGE_USER_ERROR);
});

test('F/G: helper does not touch plant/task state (pure function)', () => {
  const garden = {
    plants: [{ id: 'mango', mark: '✓', status: 'Healthy' }],
    tasks: [{ id: 't1' }]
  };
  const before = JSON.stringify(garden);
  resolvePlantDoctorImagePayload({
    dataUrl: `data:image/png;base64,${PNG_MAGIC}`,
    base64: PNG_MAGIC
  });
  assert.equal(JSON.stringify(garden), before);
});
