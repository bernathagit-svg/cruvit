// Real PI slice 1: memory-only acquisition -> one request -> Registry -> exact row.
// Rendering PI-04 and all persistence remain outside this controller.
import {loadIdentityRegistry, resolvePlantIdentity} from '../identity/plant-identity-resolver.js';
import {resolveCanonicalReadSlug} from '../identity/canonical-alias-authority-v1.js';
import {createPreviewClient, PREVIEW_URL} from '../../core-v1/my-garden/shared/preview-session.mjs';
import {catalogRowToRuntimePlant} from '../catalog/canonical-catalog-persistence-contract-v1.js';
import {resolvePlantDisplayMedia, formatCatalogAttributionLabel} from '../catalog-media/licensed-catalog-media-runtime-v1.js';
import {readPlantKnowledge} from '../catalog-expansion/plant-knowledge-warnings-v1-contract.js';
import {readOptionalNumericThreshold} from '../catalog-expansion/plant-climate-quantitative-evidence-v1-contract.js';

export const IDENTIFY_ENDPOINT = '/.netlify/functions/plant-identify';
export const MAX_IMAGE_BYTES = 4_800_000;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const CATALOG_SELECT = 'slug,scientific_name,verification_state,needs_review,common_names,media_status,media,climate_traits';
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
      const display = {};
      // Extend the same exact row read, never use provider/observation display fields.
      for (const key of ['common_names', 'media_status', 'media', 'climate_traits']) {
        if (Object.hasOwn(row, key)) display[key] = structuredClone(row[key]);
      }
      return frozen({slug: row.slug, scientific_name: row.scientific_name,
        verification_state: row.verification_state, needs_review: row.needs_review, ...display});
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

// PI-04 is a view of the existing canonical row, not a new plant/media authority.
export function canonicalPiResult(state) {
  const unavailable = reason => Object.freeze({available: false, reason, name: '', scientific: '', confidence: '', media: null});
  if (state?.status !== 'CANONICAL_READY' || state.readyForResult !== true) return unavailable('RESULT_NOT_READY');
  const row = state.catalogRow, slug = state.identity?.canonicalSlug;
  if (!slug || row?.slug !== slug || row.verification_state !== 'verified' || row.needs_review !== false
      || resolveCanonicalReadSlug({slug, scientific: row.scientific_name}) !== slug) return unavailable('CATALOG_IDENTITY_UNAVAILABLE');
  const plant = catalogRowToRuntimePlant(row);
  const name = text(plant?.names?.en), scientific = text(plant?.scientific);
  const accepted = state.evidence?.candidates?.find(candidate => candidate.gbifVerified === true);
  const confidence = accepted?.confidence === 'high' ? 'High confidence' : '';
  // The row adapter has no observation photo or personal-cover fields. Use the
  // same catalog-media resolver as the other catalog consumers, catalog kind only.
  const resolved = resolvePlantDisplayMedia(plant);
  const media = row.media_status === 'IMAGE_READY' && resolved.kind === 'catalog'
    && resolved.authority === 'catalog_plants.media' && /^https:\/\//i.test(resolved.url)
    && row.media?.sourceAssetId && row.media?.kind !== 'design_cutout'
    && row.media?.sourceProvider !== 'garden-design' ? resolved : null;
  const reason = !name || !scientific ? 'CATALOG_NAME_UNAVAILABLE'
    : !confidence ? 'CONFIDENCE_UNAVAILABLE' : !media ? 'CATALOG_IMAGE_UNAVAILABLE' : null;
  return frozen({available: !reason, reason, canonicalSlug: slug, name, scientific, confidence, media});
}

// Coordinates are content slots in the unchanged 940 × 1672 approved PI-04.
// Everything outside these slots is still the exact approved raster.
export const PI_RESULT_SLOTS = Object.freeze({
  photo: [0, 174, 526, 622], photoTail: [0, 796, 40, 204],
  name: [535, 301, 375, 125], scientific: [535, 432, 375, 51],
  confidence: [574, 505, 336, 35], evidence: [534, 547, 372, 34],
  type: [497, 708, 133, 61], light: [642, 708, 133, 61], water: [787, 708, 135, 61],
  description: [190, 826, 475, 140],
  careLight: [47, 1192, 190, 67], careWater: [265, 1192, 192, 67],
  careSoil: [487, 1192, 194, 67], careTemperature: [706, 1192, 194, 67],
  similar1: [39, 1349, 270, 125], similar2: [336, 1349, 267, 125], similar3: [633, 1349, 270, 125]
});

export function createPiResultView({document, stage, onReady = () => {}}) {
  let root = null, renderedState = null, readyState = null;
  function update(state, visible) {
    if (!visible) { root?.remove(); root = null; renderedState = null; readyState = null; return; }
    if (root && renderedState === state) return;
    root?.remove(); renderedState = state; readyState = null;
    const model = canonicalPiResult(state);
    root = document.createElement('section');
    root.className = 'pi-result'; root.setAttribute('aria-label', 'Identification result');
    root.setAttribute('data-pi-result', model.available ? 'IMAGE_LOADING' : 'RESULT_UNAVAILABLE');
    root.setAttribute('data-canonical-slug', model.canonicalSlug || '');
    const slots = {};
    for (const [key, [x, y, width, height]] of Object.entries(PI_RESULT_SLOTS)) {
      const slot = document.createElement('div'); slot.className = 'pi-result-slot pi-result-' + key;
      slot.setAttribute('data-pi-slot', key);
      Object.assign(slot.style, {left: x / 940 * 100 + '%', top: y / 1672 * 100 + '%',
        width: width / 940 * 100 + '%', height: height / 1672 * 100 + '%'});
      root.appendChild(slot); slots[key] = slot;
    }
    slots.name.textContent = model.name || 'Plant details unavailable';
    if ((model.name || '').length > 10) slots.name.style.fontSize = '4.8cqw';
    slots.scientific.textContent = model.scientific || 'Scientific name unavailable';
    slots.confidence.textContent = model.confidence || 'Confidence unavailable';
    slots.evidence.textContent = model.confidence ? 'Species verified' : 'Evidence unavailable';
    slots.description.textContent = 'Further plant details are not available yet.';
    for (const key of ['type', 'light', 'water', 'careLight', 'careWater', 'careSoil', 'careTemperature', 'similar1', 'similar2', 'similar3']) slots[key].textContent = 'Not available';
    const message = document.createElement('span'); message.className = 'pi-result-image-message';
    message.textContent = model.available ? 'Loading catalog image…' : 'Catalog result unavailable';
    message.setAttribute('role', 'status'); slots.photo.appendChild(message);
    if (model.available) {
      const photo = document.createElement('img'), currentRoot = root;
      photo.alt = model.name + ' — canonical catalog image'; photo.referrerPolicy = 'no-referrer';
      photo.setAttribute('data-pi-catalog-image', model.canonicalSlug);
      photo.onload = () => {
        if (root !== currentRoot) return;
        message.hidden = true; currentRoot.setAttribute('data-pi-result', 'RESULT_READY');
        readyState = state; onReady();
      };
      photo.onerror = () => {
        if (root !== currentRoot) return;
        photo.hidden = true; message.hidden = false; message.textContent = 'Catalog image unavailable';
        currentRoot.setAttribute('data-pi-result', 'RESULT_UNAVAILABLE');
        readyState = null; onReady();
      };
      slots.photo.appendChild(photo); photo.src = model.media.url;
      const credit = document.createElement('div'); credit.className = 'pi-result-credit';
      credit.textContent = formatCatalogAttributionLabel(model.media);
      // Preserve required attribution and source/license access.
      for (const [label, url] of [['Source', model.media.sourcePageUrl], ['License', model.media.licenseUrl]]) {
        if (!/^https:\/\//i.test(url || '')) continue;
        const link = document.createElement('a'); link.textContent = label; link.href = url;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; credit.appendChild(link);
      }
      slots.photo.appendChild(credit);
    }
    stage.appendChild(root);
  }
  return Object.freeze({update, isReady: state => !!root && renderedState === state && readyState === state});
}

// PI-05 projects the very same canonical row used by PI-04. No profile lookup,
// provider prose, observation image, or per-plant fallback is consulted.
export function canonicalPiProfile(state) {
  const result = canonicalPiResult(state);
  if (!result.available) return result;
  const plant = catalogRowToRuntimePlant(state.catalogRow), facts = [];
  if (!plant.needsReview) {
    if (plant.growthHabit) facts.push('Growth habit: ' + plant.growthHabit + '.');
    const leaf = plant.seasonalityEvidence;
    const labels = {EVERGREEN: 'evergreen', DECIDUOUS: 'deciduous', CONTEXT_DEPENDENT: 'context dependent'};
    if (leaf?.evidenceClass === 'SOURCE_SUPPORTED' && labels[leaf.state]
        && (!leaf.canonicalSlug || leaf.canonicalSlug === result.canonicalSlug)) {
      facts.push('Foliage: ' + labels[leaf.state] + '.');
    }
  }
  return frozen({...result, description: facts.join(' ') || 'Plant profile details are not available.'});
}

// Plant-specific regions of the unchanged 940 × 1674 approved PI-05.
// The photo mask retains the approved panel, navigation and button chrome.
export const PI_PROFILE_SLOTS = Object.freeze({
  photo: [0, 0, 940, 1460], name: [76, 567, 790, 68],
  scientific: [76, 637, 790, 59], description: [72, 829, 796, 106],
  credit: [76, 1390, 790, 58]
});
const PROFILE_PHOTO_MASK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 1460"><path fill="white" fill-rule="evenodd" d="M0 0H940V1460H0Z M72 792H868Q916 792 916 840V1334Q916 1382 868 1382H72Q24 1382 24 1334V840Q24 792 72 792Z M163 140A52 52 0 1 0 59 140A52 52 0 1 0 163 140Z M885 140A52 52 0 1 0 781 140A52 52 0 1 0 885 140Z M106 707H356A30 30 0 0 1 356 767H106A30 30 0 0 1 106 707Z M548 1532A80 80 0 1 0 388 1532A80 80 0 1 0 548 1532Z"/></svg>');

export function createPiProfileView({document, stage, onReady = () => {}}) {
  let root = null, renderedState = null, readyState = null;
  function update(state, visible) {
    const model = visible ? canonicalPiProfile(state) : null;
    if (!model?.available) { root?.remove(); root = null; renderedState = null; readyState = null; return; }
    if (root && renderedState === state) return;
    root?.remove(); renderedState = state; readyState = null;
    root = document.createElement('section'); root.className = 'pi-profile';
    root.setAttribute('aria-label', 'Canonical plant profile');
    root.setAttribute('data-pi-profile', 'IMAGE_LOADING');
    root.setAttribute('data-canonical-slug', model.canonicalSlug);
    root.setAttribute('data-identify-action', state.actionId);
    const slots = {};
    for (const [key, [x, y, width, height]] of Object.entries(PI_PROFILE_SLOTS)) {
      const slot = document.createElement('div'); slot.className = 'pi-profile-slot pi-profile-' + key;
      slot.setAttribute('data-pi-profile-slot', key);
      Object.assign(slot.style, {left: x / 940 * 100 + '%', top: y / 1674 * 100 + '%',
        width: width / 940 * 100 + '%', height: height / 1674 * 100 + '%'});
      root.appendChild(slot); slots[key] = slot;
    }
    slots.name.textContent = model.name; slots.scientific.textContent = model.scientific;
    slots.description.textContent = model.description;
    // The preserved badge says High confidence, exactly the accepted evidence.
    slots.name.setAttribute('aria-description', model.confidence);
    slots.photo.style.maskImage = 'url("' + PROFILE_PHOTO_MASK + '")';
    const photo = document.createElement('img'), currentRoot = root;
    photo.alt = model.name + ' — canonical catalog image'; photo.referrerPolicy = 'no-referrer';
    photo.setAttribute('data-pi-profile-image', model.canonicalSlug);
    const message = document.createElement('span'); message.className = 'pi-profile-image-message';
    message.setAttribute('role', 'status'); message.textContent = 'Loading catalog image…';
    photo.onload = () => {
      if (root !== currentRoot) return;
      message.hidden = true; currentRoot.setAttribute('data-pi-profile', 'PROFILE_READY');
      readyState = state; onReady();
    };
    photo.onerror = () => {
      if (root !== currentRoot) return;
      photo.hidden = true; message.hidden = false; message.textContent = 'Catalog image unavailable';
      currentRoot.setAttribute('data-pi-profile', 'PROFILE_UNAVAILABLE');
      readyState = null; onReady();
    };
    slots.photo.appendChild(photo); slots.photo.appendChild(message); photo.src = model.media.url;
    slots.credit.textContent = formatCatalogAttributionLabel(model.media);
    for (const [label, url] of [['Source', model.media.sourcePageUrl], ['License', model.media.licenseUrl]]) {
      if (!/^https:\/\//i.test(url || '')) continue;
      const link = document.createElement('a'); link.textContent = label; link.href = url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; slots.credit.appendChild(link);
    }
    stage.appendChild(root);
  }
  return Object.freeze({update, isReady: state => !!root && renderedState === state && readyState === state});
}

// PI-06 is another projection of the same exact canonical row. Enum labels are
// presentation only; no care values, schedules, or records are created here.
const CARE_UNAVAILABLE = 'Not available';
const careUnknown = () => ({value: CARE_UNAVAILABLE, note: 'Not available yet.', source: null, supported: false});
const hasSources = provenance => Array.isArray(provenance?.sourceIds)
  && provenance.sourceIds.length > 0 && provenance.sourceIds.every(id => !!text(id))
  && !!text(provenance.shortExcerpt);

export function canonicalPiCare(state) {
  const profile = canonicalPiProfile(state);
  if (!profile.available) return profile;
  const plant = catalogRowToRuntimePlant(state.catalogRow), ct = plant.climateTraits;
  const usable = !plant.needsReview && (!ct.canonicalSlug || ct.canonicalSlug === profile.canonicalSlug);
  const card = (key, labels, note) => {
    const evidence = ct.traitProvenance?.[key], value = ct[key];
    if (!usable || ct.traitEvidenceClasses?.[key] !== 'SOURCE_SUPPORTED'
        || evidence?.evidenceClass !== 'SOURCE_SUPPORTED' || evidence.status !== 'asserted'
        || !hasSources(evidence) || !Object.hasOwn(labels, value)) return careUnknown();
    return {value: labels[value], note, source: 'catalog_plants.climate_traits.' + key, supported: true};
  };
  const cards = {
    light: card('sunNeeds', {full_sun: 'Full sun', partial_shade: 'Partial shade',
      full_shade: 'Full shade', sun_to_partial_shade: 'Sun to partial shade'}, 'Canonical light requirement.'),
    temperature: careUnknown(),
    humidity: card('humidityTolerance', {low: 'Low tolerance', medium: 'Medium tolerance', high: 'High tolerance'},
      'Tolerance of humid conditions; target humidity unavailable.'),
    soil: card('drainageNeeds', {low: 'Low drainage need', medium: 'Medium drainage need', high: 'High drainage need'},
      'Canonical drainage requirement. Soil mix unavailable.'),
    watering: card('waterNeeds', {low: 'Low water needs', medium: 'Medium water needs', high: 'High water needs'},
      'Watering schedule not available.'),
    // Systemic backlog: CANONICAL CARE — FERTILIZING AUTHORITY GAP.
    // Shared Catalog/Data Enrichment owns this gap. Neither care.guide nor an
    // arbitrary maintenance/provider field is a canonical fertilizing contract.
    fertilizing: careUnknown()
  };
  const temperature = ['preferred_minimum_temperature_c', 'preferred_maximum_temperature_c'];
  const values = temperature.map(key => readOptionalNumericThreshold(plant, key));
  if (usable && values.every((value, i) => value !== null
      && typeof ct.quantitativeEvidence?.[temperature[i]] === 'number'
      && hasSources(ct.quantitativeProvenance?.[temperature[i]])
      && (!ct.quantitativeProvenance[temperature[i]].evidenceClass
        || ct.quantitativeProvenance[temperature[i]].evidenceClass === 'SOURCE_SUPPORTED')
      && (!ct.quantitativeProvenance[temperature[i]].status
        || ct.quantitativeProvenance[temperature[i]].status === 'asserted')) && values[0] <= values[1]) {
    cards.temperature = {value: values[0] + '–' + values[1] + '°C', note: 'Canonical preferred temperature range.',
      source: 'catalog_plants.climate_traits.quantitativeEvidence', supported: true};
  }
  const knowledge = readPlantKnowledge(plant), acidic = knowledge?.soilRequirements?.acidicSoil;
  if (usable && (!knowledge?.canonicalSlug || knowledge.canonicalSlug === profile.canonicalSlug)
      && acidic?.value === true && acidic.status === 'asserted' && acidic.evidenceClass === 'SOURCE_SUPPORTED'
      && hasSources(acidic) && acidic.sourceIds.every(id => knowledge.sources?.some(s => s.sourceId === id))) {
    cards.soil = {...cards.soil, value: cards.soil.supported ? cards.soil.value : 'Acidic soil',
      note: 'Acidic soil required. Soil mix unavailable.', supported: true,
      source: [cards.soil.source, 'catalog_plants.climate_traits.plantKnowledge.soilRequirements.acidicSoil'].filter(Boolean).join('; ')};
  }
  const leaf = plant.seasonalityEvidence;
  const leafLabels = {EVERGREEN: 'Evergreen', DECIDUOUS: 'Deciduous', CONTEXT_DEPENDENT: 'Context dependent'};
  const foliage = usable && leaf?.evidenceClass === 'SOURCE_SUPPORTED'
    && (!leaf.canonicalSlug || leaf.canonicalSlug === profile.canonicalSlug) && leafLabels[leaf.state];
  return frozen({...profile, cards, growth: usable && plant.growthHabit || CARE_UNAVAILABLE,
    foliage: foliage || CARE_UNAVAILABLE});
}

// Only plant-specific regions of the unchanged 941 × 1672 approved PI-06.
// Neutral bars remove the mockup's unsupported quantitative care ratings.
export const PI_CARE_SLOTS = Object.freeze({
  photo: [86, 92, 356, 392], name: [472, 157, 404, 43], scientific: [473, 205, 403, 32],
  confidence: [693, 98, 121, 41], growth: [473, 249, 114, 49], environment: [597, 249, 108, 49],
  foliage: [717, 249, 138, 49], air: [473, 306, 152, 45], ease: [637, 306, 128, 45],
  description: [473, 369, 402, 111],
  lightValue: [178, 764, 257, 26], lightNote: [98, 821, 320, 66], lightBar: [99, 797, 337, 20],
  temperatureValue: [597, 764, 246, 26], temperatureNote: [510, 820, 321, 68], temperatureBar: [510, 797, 334, 20],
  humidityValue: [178, 949, 257, 28], humidityNote: [98, 1005, 320, 66], humidityBar: [99, 982, 337, 20],
  soilValue: [597, 949, 246, 28], soilNote: [510, 1005, 321, 67], soilBar: [510, 982, 334, 20],
  wateringValue: [178, 1137, 257, 27], wateringNote: [98, 1194, 320, 51], wateringBar: [99, 1170, 337, 20],
  fertilizingValue: [597, 1137, 246, 27], fertilizingNote: [510, 1194, 321, 51], fertilizingBar: [510, 1170, 334, 20]
});

export function createPiCareView({document, stage}) {
  let root = null, renderedState = null;
  function update(state, visible) {
    const model = visible ? canonicalPiCare(state) : null;
    if (!model?.available) { root?.remove(); root = null; renderedState = null; return; }
    if (root && renderedState === state) return;
    root?.remove(); renderedState = state;
    root = document.createElement('section'); root.className = 'pi-care';
    root.setAttribute('aria-label', 'Canonical plant care'); root.setAttribute('data-pi-care', 'IMAGE_LOADING');
    root.setAttribute('data-canonical-slug', model.canonicalSlug); root.setAttribute('data-identify-action', state.actionId);
    const slots = {};
    for (const [key, [x, y, width, height]] of Object.entries(PI_CARE_SLOTS)) {
      const slot = document.createElement('div'); slot.className = 'pi-care-slot pi-care-' + key;
      slot.setAttribute('data-pi-care-slot', key);
      Object.assign(slot.style, {left: x / 941 * 100 + '%', top: y / 1672 * 100 + '%',
        width: width / 941 * 100 + '%', height: height / 1672 * 100 + '%'});
      root.appendChild(slot); slots[key] = slot;
    }
    for (const key of ['name', 'scientific', 'confidence', 'growth', 'foliage', 'description']) slots[key].textContent = model[key];
    for (const key of ['environment', 'air', 'ease']) slots[key].textContent = CARE_UNAVAILABLE;
    for (const [key, card] of Object.entries(model.cards)) {
      slots[key + 'Value'].textContent = card.value; slots[key + 'Note'].textContent = card.note;
      slots[key + 'Value'].setAttribute('data-care-supported', String(card.supported));
      slots[key + 'Value'].setAttribute('data-care-source', card.source || '');
      slots[key + 'Bar'].setAttribute('aria-hidden', 'true');
    }
    const photo = document.createElement('img'), currentRoot = root;
    photo.alt = model.name + ' — canonical catalog image'; photo.referrerPolicy = 'no-referrer';
    photo.setAttribute('data-pi-care-image', model.canonicalSlug);
    const message = document.createElement('span'); message.className = 'pi-care-image-message';
    message.setAttribute('role', 'status'); message.textContent = 'Loading catalog image…';
    photo.onload = () => {
      if (root !== currentRoot) return;
      message.hidden = true; currentRoot.setAttribute('data-pi-care', 'CARE_READY');
    };
    photo.onerror = () => {
      if (root !== currentRoot) return;
      photo.hidden = true; message.hidden = false; message.textContent = 'Catalog image unavailable';
      currentRoot.setAttribute('data-pi-care', 'CARE_IMAGE_UNAVAILABLE');
    };
    slots.photo.appendChild(photo); slots.photo.appendChild(message); photo.src = model.media.url;
    const credit = document.createElement('div'); credit.className = 'pi-care-credit';
    credit.textContent = formatCatalogAttributionLabel(model.media);
    for (const [label, url] of [['Source', model.media.sourcePageUrl], ['License', model.media.licenseUrl]]) {
      if (!/^https:\/\//i.test(url || '')) continue;
      const link = document.createElement('a'); link.textContent = label; link.href = url;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; credit.appendChild(link);
    }
    slots.photo.appendChild(credit); stage.appendChild(root);
  }
  return Object.freeze({update});
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
