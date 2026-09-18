/**
 * Local technical QA for Design Asset binaries. No network. No paid AI.
 */
import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_WEBP = Buffer.from('WEBP');
const JPEG_SIG = Buffer.from([0xff, 0xd8]);

const MIN_EDGE = 256;
const MAX_EDGE = 4096;
const MIN_BYTES = 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_ALPHA_COVERAGE = 0.04;
const MAX_ALPHA_COVERAGE = 0.85;
const CORNER_ALPHA_MAX = 16;
const EDGE_OPAQUE_FAIL = 0.92;

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
    const err = new Error('not-png');
    err.code = 'not-png';
    throw err;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idats = [];
  while (offset + 12 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    const err = new Error(`unsupported-png colorType=${colorType}`);
    err.code = 'unsupported-png';
    err.colorType = colorType;
    throw err;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    inflated.copy(cur, 0, src, src + stride);
    src += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let val = cur[i];
      if (filter === 1) val = (val + left) & 255;
      else if (filter === 2) val = (val + up) & 255;
      else if (filter === 3) val = (val + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) val = (val + paeth(left, up, upLeft)) & 255;
      cur[i] = val;
    }
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const si = x * bpp;
      rgba[di] = cur[si];
      rgba[di + 1] = cur[si + 1];
      rgba[di + 2] = cur[si + 2];
      rgba[di + 3] = bpp === 4 ? cur[si + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, colorType, rgba, hasAlphaChannel: colorType === 6 };
}

function isWebp(buf) {
  return (
    buf.length >= 12 &&
    buf.subarray(0, 4).equals(WEBP_RIFF) &&
    buf.subarray(8, 12).equals(WEBP_WEBP)
  );
}

function bboxFromAlpha(width, height, rgba, threshold = 8) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a <= threshold) continue;
      opaque += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { exists: false, opaque: 0 };
  return { exists: true, minX, minY, maxX, maxY, opaque };
}

export function inspectTechnicalQa(bytes, options = {}) {
  const reasons = [];
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buf.length) {
    return { result: 'FAIL', reasons: ['empty-file'], metrics: {} };
  }
  if (buf.length < (options.minBytes || MIN_BYTES)) reasons.push('file-too-small');
  if (buf.length > (options.maxBytes || MAX_BYTES)) reasons.push('file-too-large');

  const jpeg = buf.length >= 2 && buf[0] === JPEG_SIG[0] && buf[1] === JPEG_SIG[1];
  if (jpeg) {
    return { result: 'FAIL', reasons: [...reasons, 'expected-png-or-webp', 'jpeg-not-allowed'], metrics: { format: 'jpeg' } };
  }
  if (isWebp(buf)) {
    return {
      result: 'FAIL',
      reasons: [...reasons, 'webp-decode-not-implemented-local'],
      metrics: { format: 'webp', decodes: false }
    };
  }

  let decoded;
  try {
    decoded = decodePngRgba(buf);
  } catch (err) {
    return {
      result: 'FAIL',
      reasons: [...reasons, 'file-does-not-decode', err.code || 'decode-error'],
      metrics: { format: 'unknown' }
    };
  }

  const { width, height, colorType, rgba, hasAlphaChannel } = decoded;
  const metrics = {
    format: 'png',
    decodes: true,
    width,
    height,
    colorType,
    hasAlphaChannel,
    bytes: buf.length
  };
  if (!hasAlphaChannel) reasons.push('alpha-channel-missing');
  if (width < MIN_EDGE || height < MIN_EDGE) reasons.push('dimensions-too-small');
  if (width > MAX_EDGE || height > MAX_EDGE) reasons.push('dimensions-too-large');

  const corners = [
    rgba[3],
    rgba[(width - 1) * 4 + 3],
    rgba[((height - 1) * width) * 4 + 3],
    rgba[((height - 1) * width + (width - 1)) * 4 + 3]
  ];
  metrics.cornerAlpha = corners;
  if (corners.some((a) => a > CORNER_ALPHA_MAX)) reasons.push('corners-not-transparent');

  let edgeOpaque = 0;
  let edgeCount = 0;
  const sampleEdge = (x, y) => {
    edgeCount += 1;
    if (rgba[(y * width + x) * 4 + 3] > 200) edgeOpaque += 1;
  };
  for (let x = 0; x < width; x++) {
    sampleEdge(x, 0);
    sampleEdge(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    sampleEdge(0, y);
    sampleEdge(width - 1, y);
  }
  metrics.edgeOpaqueRatio = edgeCount ? edgeOpaque / edgeCount : 1;
  if (metrics.edgeOpaqueRatio >= EDGE_OPAQUE_FAIL) reasons.push('opaque-rectangular-background');

  const box = bboxFromAlpha(width, height, rgba);
  metrics.bbox = box;
  if (!box.exists) reasons.push('plant-bounding-box-missing');
  else {
    const touches =
      box.minX <= 0 || box.minY <= 0 || box.maxX >= width - 1 || box.maxY >= height - 1;
    if (touches) reasons.push('crop');
    if (box.minX <= 0 || box.maxX >= width - 1 || box.minY <= 0 || box.maxY >= height - 1) {
      reasons.push('edge-contact');
    }
    metrics.alphaCoverage = box.opaque / (width * height);
    if (metrics.alphaCoverage < MIN_ALPHA_COVERAGE || metrics.alphaCoverage > MAX_ALPHA_COVERAGE) {
      reasons.push('alpha-coverage');
    }
  }

  let halo = 0;
  let nearWhitePartial = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a === 0 || a === 255) continue;
    const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
    if (lum > 230 && a > 40) {
      halo += 1;
      nearWhitePartial += 1;
    }
  }
  metrics.haloPartialPixels = halo;
  if (halo > width * height * 0.02) reasons.push('halo');
  if (nearWhitePartial > width * height * 0.03) reasons.push('background-artifact');

  const unique = [...new Set(reasons)];
  return {
    result: unique.length ? 'FAIL' : 'PASS',
    reasons: unique,
    metrics
  };
}
