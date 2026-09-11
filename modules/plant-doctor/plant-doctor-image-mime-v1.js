/**
 * Plant Doctor image MIME helpers V1 — pure, no DOM.
 * Ensures declared media_type matches actual encoded image bytes.
 */

export const PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const SUPPORTED = new Set(PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES);

export const PLANT_DOCTOR_IMAGE_USER_ERROR =
  'We couldn’t read this image. Please try another photo.';

export function mimeFromDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;,]+)/i);
  return m ? String(m[1]).trim().toLowerCase() : '';
}

/**
 * Sniff image MIME from base64 payload magic bytes.
 * Returns null when unknown / undecodable.
 */
export function sniffImageMimeFromBase64(b64) {
  const raw = String(b64 || '').replace(/\s+/g, '');
  if (!raw) return null;
  let bytes;
  try {
    const slice = raw.slice(0, 64);
    if (typeof atob === 'function') {
      const bin = atob(slice);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else if (typeof Buffer !== 'undefined') {
      bytes = new Uint8Array(Buffer.from(slice, 'base64'));
    } else {
      return null;
    }
  } catch {
    return null;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Resolve media_type that matches actual bytes.
 * Prefers sniffed magic bytes over data-URL label when they disagree.
 * Throws Error with code UNSUPPORTED_IMAGE | INVALID_IMAGE.
 */
export function resolvePlantDoctorImagePayload({ dataUrl, base64 } = {}) {
  const data = String(base64 || '').replace(/\s+/g, '');
  if (!data) {
    const err = new Error('INVALID_IMAGE');
    err.code = 'INVALID_IMAGE';
    throw err;
  }
  const declared = mimeFromDataUrl(dataUrl);
  const sniffed = sniffImageMimeFromBase64(data);
  const mediaType = sniffed || declared;

  if (!SUPPORTED.has(mediaType)) {
    const err = new Error('UNSUPPORTED_IMAGE');
    err.code = 'UNSUPPORTED_IMAGE';
    err.declared = declared || null;
    err.sniffed = sniffed;
    throw err;
  }

  // Declared label disagrees with bytes → trust bytes (do not send wrong label).
  if (declared && sniffed && declared !== sniffed) {
    return {
      mediaType: sniffed,
      data,
      correctedFrom: declared,
      consistent: false
    };
  }

  return {
    mediaType,
    data,
    correctedFrom: null,
    consistent: !declared || declared === mediaType
  };
}

export function isProviderImageMediaTypeError(message) {
  const s = String(message || '');
  return /media[_ ]type|image\/jpeg|image\/png|image\/webp|messages\.\d+\.content/i.test(s);
}

export function toPlantDoctorImageUserError(err) {
  if (!err) return PLANT_DOCTOR_IMAGE_USER_ERROR;
  const code = err.code || '';
  if (
    code === 'UNSUPPORTED_IMAGE' ||
    code === 'INVALID_IMAGE' ||
    isProviderImageMediaTypeError(err.message || err)
  ) {
    return PLANT_DOCTOR_IMAGE_USER_ERROR;
  }
  // Preserve non-image errors (e.g. AI missing) for existing UX.
  return String(err.message || err).trim() || PLANT_DOCTOR_IMAGE_USER_ERROR;
}

if (typeof window !== 'undefined') {
  window.cruvitPlantDoctorImageMime = {
    PLANT_DOCTOR_SUPPORTED_IMAGE_MIMES,
    PLANT_DOCTOR_IMAGE_USER_ERROR,
    mimeFromDataUrl,
    sniffImageMimeFromBase64,
    resolvePlantDoctorImagePayload,
    isProviderImageMediaTypeError,
    toPlantDoctorImageUserError
  };
}
