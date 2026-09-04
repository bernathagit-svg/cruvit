/**
 * CHELSA source resolver — explicit REMOTE_COG vs LOCAL_MIRROR (no silent fallback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chelsaUrl } from './coordinate-climate-v2-bake-shared.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_MIRROR_ROOT = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/files');
const DEFAULT_MANIFEST = path.join(ROOT, 'data/coordinate-climate/v2/source-mirror/mirror-manifest.json');

export const SOURCE_MODE = Object.freeze({
  REMOTE_COG: 'REMOTE_COG',
  LOCAL_MIRROR: 'LOCAL_MIRROR'
});

let _sourceMode = SOURCE_MODE.REMOTE_COG;
let _mirrorRoot = DEFAULT_MIRROR_ROOT;
let _networkChelsaCalls = 0;

export function getNetworkChelsaCalls() {
  return _networkChelsaCalls;
}

export function resetNetworkChelsaCalls() {
  _networkChelsaCalls = 0;
}

export function setSourceMode(mode, options = {}) {
  if (mode !== SOURCE_MODE.REMOTE_COG && mode !== SOURCE_MODE.LOCAL_MIRROR) {
    throw new Error(`invalid-source-mode:${mode}`);
  }
  _sourceMode = mode;
  if (options.mirrorRoot) _mirrorRoot = path.resolve(options.mirrorRoot);
}

export function getSourceMode() {
  return _sourceMode;
}

export function localMirrorPathForLayer(v, month, mirrorRoot = _mirrorRoot) {
  const url = chelsaUrl(v, month);
  const fileName = url.split('/').pop();
  const folder = v.folder || v.key;
  return path.join(mirrorRoot, folder, fileName);
}

export function resolveSourceForLayer(v, month) {
  const url = chelsaUrl(v, month);
  if (_sourceMode === SOURCE_MODE.REMOTE_COG) {
    _networkChelsaCalls += 1;
    return { kind: 'remote', url, cacheKey: url };
  }
  const localPath = localMirrorPathForLayer(v, month);
  if (!fs.existsSync(localPath)) {
    throw new Error(`LOCAL_MIRROR_MISSING:${localPath}`);
  }
  const stat = fs.statSync(localPath);
  if (stat.size < 1024) {
    throw new Error(`LOCAL_MIRROR_TRUNCATED:${localPath}`);
  }
  return { kind: 'local', localPath, cacheKey: localPath, size: stat.size };
}

export function loadMirrorManifest(manifestPath = DEFAULT_MANIFEST) {
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export function assertLocalMirrorReady(manifestPath = DEFAULT_MANIFEST) {
  const m = loadMirrorManifest(manifestPath);
  if (!m) throw new Error('mirror-manifest-missing');
  const validated = (m.entries || []).filter((e) => e.status === 'validated').length;
  if (validated < 84) throw new Error(`mirror-incomplete:${validated}/84`);
  return m;
}
