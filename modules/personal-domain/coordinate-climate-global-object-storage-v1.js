/**
 * CRUVIT Global Climate — R2 / S3-compatible object transport (Product Proof canary).
 *
 * Transport only. Does not change coordinate→tile identity or climate semantics.
 * Contract: data/coordinate-climate/v2/coverage/object-storage-contract.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { GLOBAL_BAKE_ID_DEFAULT, GLOBAL_PACK_ID } from './coordinate-climate-global-lookup-v2.js';
import { tileFileNameFromKey } from './coordinate-climate-coverage-tiles-v2.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const CONTRACT_PATH = path.resolve(
  HERE,
  '../../data/coordinate-climate/v2/coverage/object-storage-contract.json'
);
const R2_LOCAL_ENV_FILE = path.join(REPO_ROOT, '.env.r2.local');

export const R2_REQUIRED_ENV = Object.freeze([
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET'
]);

export const R2_OPTIONAL_ENV = Object.freeze(['R2_ENDPOINT', 'R2_PREFIX']);

/** Local object-mirror root for remote-path canary tests (same key layout as R2). */
export const OBJECT_MIRROR_ENV = 'CRUVIT_CLIMATE_OBJECT_MIRROR_ROOT';

const DEFAULT_TIMEOUT_MS = 12000;

let _contractCache = null;
let _s3ClientPromise = null;
let _r2LocalEnvApplied = false;

/**
 * Load `.env.r2.local` into process.env when keys are unset.
 * Never logs values. Safe for Product Proof canary scripts.
 */
export function applyR2LocalEnvFromFile(env = process.env, options = {}) {
  if (_r2LocalEnvApplied && options.force !== true) {
    return { applied: false, loaded: false, path: R2_LOCAL_ENV_FILE };
  }
  const filePath = options.filePath ? path.resolve(options.filePath) : R2_LOCAL_ENV_FILE;
  if (!fs.existsSync(filePath)) {
    _r2LocalEnvApplied = true;
    return { applied: false, loaded: false, path: filePath };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  let applied = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (!String(env[key] || '').trim()) {
      env[key] = value;
      applied += 1;
    }
  }
  _r2LocalEnvApplied = true;
  return { applied: applied > 0, loaded: true, path: filePath, keysAppliedCount: applied };
}

export function loadClimateObjectStorageContract() {
  if (_contractCache) return _contractCache;
  const raw = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  _contractCache = raw;
  return raw;
}

export function getR2ConnectionStatus(env = process.env) {
  applyR2LocalEnvFromFile(env);
  const missing = R2_REQUIRED_ENV.filter((k) => !String(env[k] || '').trim());
  const bucket = String(env.R2_BUCKET || '').trim();
  return {
    ready: missing.length === 0,
    missing,
    required: [...R2_REQUIRED_ENV],
    optional: [...R2_OPTIONAL_ENV],
    bucketName: bucket || null,
    bucketIsCruvitGlobalClimate: bucket === 'cruvit-global-climate',
    presence: {
      R2_ACCOUNT_ID: !!String(env.R2_ACCOUNT_ID || '').trim(),
      R2_ACCESS_KEY_ID: !!String(env.R2_ACCESS_KEY_ID || '').trim(),
      R2_SECRET_ACCESS_KEY: !!String(env.R2_SECRET_ACCESS_KEY || '').trim(),
      R2_BUCKET: !!bucket
    },
    blocker: missing.length ? 'GLOBAL_STORAGE_CONNECTION_REQUIRED' : null,
    uploadStatus: loadClimateObjectStorageContract().uploadStatus || 'NOT_CONNECTED',
    /** NOT_CONNECTED = credentials / bucket not wired for this runtime; SDK may still be implemented. */
    meaningOfNotConnected:
      'Contract uploadStatus NOT_CONNECTED: no owner-configured R2 credentials/bucket for live climate tile hosting yet.'
  };
}

export function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function getObjectMirrorRoot(env = process.env) {
  const root = String(env[OBJECT_MIRROR_ENV] || '').trim();
  return root ? path.resolve(root) : null;
}

export function isClimateRemoteTransportAvailable(env = process.env) {
  return getR2ConnectionStatus(env).ready || !!getObjectMirrorRoot(env);
}

export function resolveGlobalBakeId(explicit) {
  return String(explicit || GLOBAL_BAKE_ID_DEFAULT).trim() || GLOBAL_BAKE_ID_DEFAULT;
}

/**
 * Build object key from contract immutablePathPattern (tiles) or sibling keys for manifest/index.
 */
export function buildClimateObjectKey({
  kind = 'tile',
  tileKey = null,
  fileName = null,
  globalBakeId = null,
  env = process.env
} = {}) {
  const bake = resolveGlobalBakeId(globalBakeId);
  const prefix = String(env.R2_PREFIX || '').replace(/^\/+|\/+$/g, '');
  let relative;
  if (kind === 'tile') {
    const fn = fileName || (tileKey ? tileFileNameFromKey(tileKey) : null);
    if (!fn) throw new Error('tile_file_required');
    relative = `climate/${GLOBAL_PACK_ID}/${bake}/tiles/${fn}`;
  } else if (kind === 'manifest') {
    relative = `climate/${GLOBAL_PACK_ID}/${bake}/manifest.json`;
  } else if (kind === 'global-index') {
    relative = `climate/${GLOBAL_PACK_ID}/${bake}/global-index.json`;
  } else {
    throw new Error(`unknown_object_kind:${kind}`);
  }
  return prefix ? `${prefix}/${relative}` : relative;
}

function r2Endpoint(env = process.env) {
  const explicit = String(env.R2_ENDPOINT || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const account = String(env.R2_ACCOUNT_ID || '').trim();
  return `https://${account}.r2.cloudflarestorage.com`;
}

async function getS3Client(env = process.env) {
  if (_s3ClientPromise) return _s3ClientPromise;
  _s3ClientPromise = (async () => {
    applyR2LocalEnvFromFile(env);
    const status = getR2ConnectionStatus(env);
    if (!status.ready) {
      const err = new Error(status.blocker);
      err.code = status.blocker;
      err.missing = status.missing;
      throw err;
    }
    const { S3Client } = await import('@aws-sdk/client-s3');
    return new S3Client({
      region: 'auto',
      endpoint: r2Endpoint(env),
      credentials: {
        accessKeyId: String(env.R2_ACCESS_KEY_ID),
        secretAccessKey: String(env.R2_SECRET_ACCESS_KEY)
      },
      forcePathStyle: false
    });
  })();
  return _s3ClientPromise;
}

export function clearClimateObjectStorageCaches() {
  _s3ClientPromise = null;
  _contractCache = null;
  _r2LocalEnvApplied = false;
}

export async function headClimateObject(objectKey, options = {}) {
  const env = options.env || process.env;
  applyR2LocalEnvFromFile(env);
  const status = getR2ConnectionStatus(env);
  if (!status.ready) {
    return { ok: false, code: status.blocker, missing: status.missing };
  }
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client(env);
    const out = await client.send(
      new HeadObjectCommand({
        Bucket: String(env.R2_BUCKET),
        Key: String(objectKey).replace(/^\/+/, '')
      })
    );
    return {
      ok: true,
      code: 'OK',
      objectKey,
      contentLength: Number(out.ContentLength) || 0,
      etag: out.ETag || null,
      transport: 'r2'
    };
  } catch (err) {
    const http = err?.$metadata?.httpStatusCode;
    if (http === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchKey') {
      return { ok: false, code: 'REMOTE_TILE_NOT_FOUND', objectKey };
    }
    return {
      ok: false,
      code: 'REMOTE_HEAD_FAILED',
      objectKey,
      error: String(err?.message || err)
    };
  }
}

/**
 * Fetch one climate object by key. Transport only — returns bytes.
 * Prefers R2 when configured; otherwise object-mirror filesystem (canary/tests).
 */
export async function fetchClimateObjectBytes(objectKey, options = {}) {
  const env = options.env || process.env;
  applyR2LocalEnvFromFile(env);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const key = String(objectKey || '').replace(/^\/+/, '');
  if (!key) {
    return { ok: false, code: 'INVALID_OBJECT_KEY', bytes: null, transport: null };
  }

  const forceR2 = options.forceR2 === true || String(env.CRUVIT_CLIMATE_FORCE_R2 || '') === '1';
  const mirror = forceR2 ? null : getObjectMirrorRoot(env);
  if (mirror) {
    const abs = path.join(mirror, ...key.split('/'));
    if (!fs.existsSync(abs)) {
      return {
        ok: false,
        code: 'OBJECT_MIRROR_MISS',
        bytes: null,
        transport: 'object-mirror',
        objectKey: key,
        path: abs
      };
    }
    return {
      ok: true,
      code: 'OK',
      bytes: fs.readFileSync(abs),
      transport: 'object-mirror',
      objectKey: key
    };
  }

  const status = getR2ConnectionStatus(env);
  if (!status.ready) {
    return {
      ok: false,
      code: status.blocker,
      bytes: null,
      transport: null,
      missing: status.missing,
      objectKey: key
    };
  }

  try {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client(env);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: String(env.R2_BUCKET),
          Key: key
        }),
        { abortSignal: ctrl.signal }
      );
      const bytes = Buffer.from(await out.Body.transformToByteArray());
      return {
        ok: true,
        code: 'OK',
        bytes,
        transport: 'r2',
        objectKey: key,
        contentType: out.ContentType || null,
        cacheControl: out.CacheControl || null
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const name = String(err?.name || '');
    const code =
      name === 'AbortError' || err?.code === 'ABORT_ERR'
        ? 'REMOTE_TILE_TIMEOUT'
        : name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404
          ? 'REMOTE_TILE_NOT_FOUND'
          : 'REMOTE_TILE_FETCH_FAILED';
    return {
      ok: false,
      code,
      bytes: null,
      transport: 'r2',
      objectKey: key,
      error: String(err?.message || err)
    };
  }
}

export async function putClimateObjectBytes(objectKey, bytes, options = {}) {
  const env = options.env || process.env;
  applyR2LocalEnvFromFile(env);
  const status = getR2ConnectionStatus(env);
  if (!status.ready) {
    return { ok: false, code: status.blocker, missing: status.missing };
  }
  const contract = loadClimateObjectStorageContract();
  const key = String(objectKey).replace(/^\/+/, '');
  const localSha = sha256Hex(bytes);

  if (options.skipIdentical !== false) {
    const head = await headClimateObject(key, { env });
    if (head.ok && head.contentLength === bytes.length) {
      const remote = await fetchClimateObjectBytes(key, { env, forceR2: true });
      if (remote.ok && sha256Hex(remote.bytes) === localSha) {
        return {
          ok: true,
          code: 'SKIPPED_IDENTICAL',
          skipped: true,
          objectKey: key,
          transport: 'r2',
          bytes: bytes.length,
          sha256: localSha
        };
      }
    }
  }

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client(env);
  await client.send(
    new PutObjectCommand({
      Bucket: String(env.R2_BUCKET),
      Key: key,
      Body: bytes,
      ContentType: options.contentType || 'application/octet-stream',
      CacheControl: options.cacheControl || contract.cacheControl
    })
  );
  return {
    ok: true,
    code: 'OK',
    skipped: false,
    objectKey: key,
    transport: 'r2',
    bytes: bytes.length,
    sha256: localSha
  };
}
