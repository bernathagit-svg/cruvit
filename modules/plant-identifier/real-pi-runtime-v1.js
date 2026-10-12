// Real PI slice 1: memory-only acquisition -> one request -> Registry -> exact row.
// Rendering PI-04 and all persistence remain outside this controller.
import {loadIdentityRegistry, resolvePlantIdentity} from '../identity/plant-identity-resolver.js';
import {resolveCanonicalReadSlug} from '../identity/canonical-alias-authority-v1.js';
import {createPreviewClient, PREVIEW_URL} from '../../core-v1/my-garden/shared/preview-session.mjs';

export const IDENTIFY_ENDPOINT = '/.netlify/functions/plant-identify';
export const MAX_IMAGE_BYTES = 4_800_000;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const CATALOG_SELECT = 'slug,scientific_name,verification_state,needs_review';
const MEDIA = new Set(IMAGE_ACCEPT.split(','));
const SUCCESS = new Set(['resolved_id', 'resolved_canonical']);
const FAILURES = new Set(['IMAGE_INVALID', 'IDENTIFY_FAILED', 'TAXONOMY_UNVERIFIED',
  'IDENTITY_UNRESOLVED', 'CATALOG_NOT_FOUND', 'CATALOG_CONFLICT', 'CATALOG_READ_FAILED']);
const text = value => typeof value === 'string' ? value.trim() : '';
function frozen(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
const failure = (status, code) => Object.assign(new Error(code), {status, code});
const safeIdentity = value => value && SUCCESS.has(value.status)
  && value.needsReview === false && !value.conflict && !!text(value.canonicalSlug);

function sniff(bytes) {
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return 'image/png';
  const ascii = (a,b) => String.fromCharCode(...bytes.slice(a,b));
  if (bytes.length >= 12 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  return '';
}

// Decode for validity only. Never resize, re-encode, strip metadata or replace pixels.
export async function decodeBrowserImage(file, dataUrl) {
  if (typeof globalThis.createImageBitmap === 'function') {
    const bitmap = await globalThis.createImageBitmap(file);
    try { if (!bitmap.width || !bitmap.height) throw Error('IMAGE_DECODE_FAILED'); }
    finally { bitmap.close(); }
    return;
  }
  await new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve() : reject(Error('IMAGE_DECODE_FAILED'));
    image.onerror = () => reject(Error('IMAGE_DECODE_FAILED'));
    image.src = dataUrl;
  });
}

export async function loadPIIdentityAuthority() {
  const status = await loadIdentityRegistry();
  if (status.status !== 'ready') throw failure('IDENTITY_UNRESOLVED', 'REGISTRY_UNAVAILABLE');
  return {resolve: resolvePlantIdentity, readSlug: resolveCanonicalReadSlug};
}

function evidenceOnly(response) {
  const candidate = value => ({
    commonName: text(value?.commonName || value?.name),
    scientificName: text(value?.scientificName),
    confidence: text(value?.confidence).toLowerCase(),
    gbifVerified: value?.gbifVerified === true,
    gbifRank: text(value?.gbifRank).toUpperCase(),
    gbifScore: Number.isFinite(value?.gbifScore) ? value.gbifScore : null,
    gbifKey: typeof value?.gbifKey === 'number' && value.gbifKey > 0 ? String(value.gbifKey) : text(value?.gbifKey)
  });
  // Explicit projection: provider care/profile/slug fields cannot enter product state.
  return frozen({
    candidates: Array.isArray(response?.candidates) ? response.candidates.map(candidate) : [],
    scientificName: text(response?.scientificName || response?.scientific_name),
    providerScientificName: text(response?.identification?.scientificName || response?.identification?.scientific_name),
    commonName: text(response?.commonName || response?.common_name),
    confidence: text(response?.confidence).toLowerCase(),
    gbifVerified: response?.gbifVerified === true,
    hasAlternatives: Array.isArray(response?.identification?.alternatives) && response.identification.alternatives.length > 0
  });
}

export function createRealPiController({
  fetchImpl = (...args) => globalThis.fetch(...args),
  decodeImage = decodeBrowserImage,
  loadAuthority = loadPIIdentityAuthority,
  getCatalogClient,
  requestTimeoutMs = 55_000
} = {}) {
  let previewRuntime;
  const clientForRead = getCatalogClient || (() => {
    previewRuntime ||= createPreviewClient({atomicSave: false});
    return previewRuntime.client;
  });
  let image = null, imageVersion = 0, actionNumber = 0, inFlight = null;
  const listeners = new Set();
  let state = frozen({status: 'NO_IMAGE', readyForResult: false, image: null,
    actionId: null, evidence: null, identity: null, catalogRow: null, error: null, httpRequests: 0});
  function publish(patch) {
    state = frozen({...state, ...patch});
    for (const listener of listeners) {
      // A view failure must never become a transport retry or strand the lock.
      try { listener(state); } catch { /* state remains readable through getState */ }
    }
    return state;
  }
  const cleared = () => ({readyForResult: false, actionId: null, evidence: null,
    identity: null, catalogRow: null, error: null});

  async function selectImage(file, source = 'gallery') {
    if (inFlight) return false;
    const version = ++imageVersion;
    image = null;
    publish({...cleared(), status: 'IMAGE_LOADING', image: null});
    try {
      const mime = text(file?.type).toLowerCase().replace(/^image\/(?:jpg|pjpeg)$/, 'image/jpeg');
      if (!MEDIA.has(mime) || !Number.isInteger(file?.size) || file.size <= 0
          || file.size > MAX_IMAGE_BYTES || typeof file.arrayBuffer !== 'function') throw Error('IMAGE_TYPE_OR_SIZE');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length !== file.size || sniff(bytes) !== mime) throw Error('IMAGE_BYTES_INVALID');
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      const base64 = globalThis.btoa(binary);
      if (base64.length > 6_800_000) throw Error('IMAGE_TOO_LARGE');
      const dataUrl = 'data:' + mime + ';base64,' + base64;
      await decodeImage(file, dataUrl);
      if (version !== imageVersion) return false;
      image = {dataUrl, version};
      publish({status: 'IMAGE_READY', image: {mediaType: mime, byteLength: bytes.length,
        source: source === 'camera' ? 'camera' : 'gallery', version}});
      return true;
    } catch {
      if (version === imageVersion) publish({...cleared(), status: 'IMAGE_INVALID', image: null,
        error: 'SELECT_A_VALID_JPEG_PNG_WEBP_OR_GIF_WITHIN_SIZE_LIMIT'});
      return false;
    }
  }

  async function exactCatalogRead(slug, authority) {
    try {
      const client = clientForRead();
      if (client?.supabaseUrl?.replace(/\/$/, '') !== PREVIEW_URL) throw Error('PREVIEW_CLIENT_REQUIRED');
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data?.user?.id || auth.data.user.role !== 'authenticated') throw Error('AUTH_REQUIRED');
      const response = await client.from('catalog_plants').select(CATALOG_SELECT, {count: 'exact'})
        .eq('slug', slug).limit(2);
      if (response?.error || response?.status !== 200 || !Array.isArray(response.data)
          || !Number.isInteger(response.count) || response.count !== response.data.length) {
        throw failure('CATALOG_READ_FAILED', 'EXACT_CATALOG_READ_FAILED');
      }
      if (!response.data.length) throw failure('CATALOG_NOT_FOUND', 'EXACT_CANONICAL_ROW_MISSING');
      if (response.data.length !== 1) throw failure('CATALOG_CONFLICT', 'MULTIPLE_CANONICAL_ROWS');
      const row = response.data[0];
      const identity = authority.resolve({scientificName: row.scientific_name});
      if (row.slug !== slug || row.verification_state !== 'verified' || row.needs_review !== false
          || !safeIdentity(identity) || identity.canonicalSlug !== slug
          || authority.readSlug({slug: row.slug, scientificName: row.scientific_name}) !== slug) {
        throw failure('CATALOG_CONFLICT', 'CATALOG_IDENTITY_OR_VERIFICATION_CONFLICT');
      }
      return frozen({slug: row.slug, scientific_name: row.scientific_name,
        verification_state: row.verification_state, needs_review: row.needs_review});
    } catch (error) {
      if (FAILURES.has(error?.status)) throw error;
      throw failure('CATALOG_READ_FAILED', 'AUTHENTICATED_CATALOG_READ_UNAVAILABLE');
    }
  }

  async function execute(captured, actionId) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), requestTimeoutMs);
    let phase = 'IDENTIFY_FAILED';
    try {
      publish({httpRequests: state.httpRequests + 1});
      const response = await fetchImpl(IDENTIFY_ENDPOINT, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', redirect: 'error',
        body: JSON.stringify({mode: 'identify', imageDataUrl: captured.dataUrl, scanId: actionId}), signal: abort.signal
      });
      if (!response?.ok) throw failure('IDENTIFY_FAILED', 'IDENTIFY_REQUEST_FAILED');
      const evidence = evidenceOnly(await response.json());
      publish({evidence});
      const verified = evidence.candidates.filter(candidate => candidate.gbifVerified);
      const top = verified[0];
      if (!top || top.gbifRank !== 'SPECIES' || !/^[1-9]\d*$/.test(top.gbifKey) || !(top.gbifScore >= 20)
          || top.confidence !== 'high' || !top.scientificName || evidence.hasAlternatives) {
        throw failure('TAXONOMY_UNVERIFIED', 'SUFFICIENT_VERIFIED_SPECIES_EVIDENCE_REQUIRED');
      }
      phase = 'IDENTITY_UNRESOLVED';
      const authority = await loadAuthority();
      const identity = authority.resolve({scientificName: top.scientificName});
      if (!safeIdentity(identity) || authority.readSlug({scientificName: top.scientificName}) !== identity.canonicalSlug) {
        throw failure('IDENTITY_UNRESOLVED', 'NO_SAFE_REGISTRY_IDENTITY');
      }
      // Resolve each scientific hint independently; precedence cannot hide conflicts.
      const hints = [...verified.map(candidate => candidate.scientificName),
        evidence.scientificName, evidence.providerScientificName].filter(Boolean);
      for (const scientificName of hints) {
        const other = authority.resolve({scientificName});
        if (!safeIdentity(other) || other.canonicalSlug !== identity.canonicalSlug) {
          throw failure('IDENTITY_UNRESOLVED', 'SCIENTIFIC_EVIDENCE_CONFLICT');
        }
      }
      phase = 'CATALOG_READ_FAILED';
      const catalogRow = await exactCatalogRead(identity.canonicalSlug, authority);
      if (captured.version !== imageVersion) throw failure('IDENTIFY_FAILED', 'STALE_IMAGE_RESULT');
      return publish({status: 'CANONICAL_READY', readyForResult: true, error: null, catalogRow,
        identity: {status: identity.status, plantId: identity.plantId,
          canonicalSlug: identity.canonicalSlug, registryVersion: identity.registryVersion}});
    } catch (error) {
      return publish({status: FAILURES.has(error?.status) ? error.status : phase,
        readyForResult: false, identity: null, catalogRow: null,
        error: FAILURES.has(error?.status) ? error.code : 'REQUEST_OR_READ_FAILED'});
    } finally { clearTimeout(timer); }
  }

  // Only a new explicit action may enter here. The lock precedes every await/notification.
  function identify({explicitUserAction = false} = {}) {
    if (explicitUserAction !== true) return Promise.resolve(state);
    if (inFlight) return inFlight;
    if (!image || state.status === 'IMAGE_LOADING') return Promise.resolve(state);
    let finish;
    const promise = new Promise(resolve => { finish = resolve; });
    inFlight = promise;
    const captured = image;
    const actionId = 'pi-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)) + '-' + (++actionNumber);
    publish({...cleared(), status: 'IDENTIFYING', actionId});
    execute(captured, actionId).then(result => {
      inFlight = null;
      finish(result);
    });
    return promise;
  }

  return Object.freeze({selectImage, identify, getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }});
}

// Bind native pickers once. The unchanged raster is never used as image evidence.
export function wireRealPiInputs({document, stage, showScreen, render, controller = createRealPiController()} = {}) {
  const inputs = {};
  let armed = null;
  for (const source of ['camera', 'gallery']) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = IMAGE_ACCEPT; input.hidden = true;
    input.setAttribute('data-pi-input', source);
    if (source === 'camera') input.setAttribute('capture', 'environment');
    stage.appendChild(input); inputs[source] = input;
    input.addEventListener('cancel', () => { if (armed === source) armed = null; });
    input.addEventListener('change', async () => {
      if (armed !== source) return;
      armed = null;
      const file = input.files?.[0]; input.value = '';
      if (!file) return;
      showScreen(1);
      if (await controller.selectImage(file, source)) await controller.identify({explicitUserAction: true});
    });
  }
  controller.subscribe(state => {
    stage.setAttribute('data-pi-state', state.status);
    stage.setAttribute('aria-busy', String(['IDENTIFYING', 'IMAGE_LOADING'].includes(state.status)));
    if (state.status === 'IDENTIFYING') showScreen(2);
    else if (FAILURES.has(state.status)) showScreen(1);
    render();
  });
  stage.setAttribute('data-pi-state', controller.getState().status);
  return Object.freeze({getState: controller.getState,
    activate(action) {
      if (action === 'back') { showScreen(0); return; }
      if (['IDENTIFYING','IMAGE_LOADING'].includes(controller.getState().status) || armed) return;
      if (action === 'camera') { showScreen(1); return; }
      const source = action === 'capture' ? 'camera' : action === 'gallery' ? 'gallery' : null;
      if (!source) return;
      armed = source; inputs[source].value = ''; inputs[source].click();
    }
  });
}
