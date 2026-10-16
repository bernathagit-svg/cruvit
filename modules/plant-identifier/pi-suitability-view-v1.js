// PI-07 presentation only. The accepted 6A handoff owns host validation and the
// existing Identifier path owns every suitability decision. No scoring or I/O.
import {canonicalPiCare} from './real-pi-runtime-v1.js';
import {formatCatalogAttributionLabel} from '../catalog-media/licensed-catalog-media-runtime-v1.js';
import {SPECIFIC_PLANT_SUITABILITY_LEVELS, formatSpecificPlantLevelLabel} from '../personal-domain/specific-plant-suitability-contract.js';

const unavailable = reason => ({ok: false, reason, context: null, evaluation: null});
// Compare the authority's selection, not elapsed weatherAgeMs. This is the same
// selection projection used by 6A; no trust/location classification occurs here.
const selection = context => JSON.stringify({readiness: context?.readiness,
  location: context?.location, trusted: context?.trusted, siteContext: context?.siteContext});
const usable = context => context?.readiness?.status === 'READY'
  && context.readiness.authenticated === true && !!context.readiness.gardenProfileId
  && context.trusted === true && context.location?.useForSuitability === true
  && context.location.gardenProfileId === context.readiness.gardenProfileId;

export async function readPiSuitability({state, client, isCurrent}) {
  const plant = canonicalPiCare(state);
  if (!plant.available || !isCurrent()) return unavailable('PI_RESULT_NOT_READY');
  if (!client?.readContext || !client?.evaluateCurrent) return unavailable('HOST_UNAVAILABLE');
  try {
    const before = await client.readContext();
    if (!isCurrent()) return unavailable('PI_RESULT_CHANGED');
    if (!before.ok) return before;
    if (!usable(before.context)) return {...unavailable('HOST_CONTEXT_NOT_READY'), context: before.context};
    const result = await client.evaluateCurrent();
    if (!isCurrent()) return unavailable('PI_RESULT_CHANGED');
    if (!result.ok) return result;
    if (result.identity?.canonicalSlug !== plant.canonicalSlug || result.identity.scientific !== plant.scientific
        || result.identity.actionId !== state.actionId) return unavailable('HOST_CANONICAL_IDENTITY_UNAVAILABLE');
    if (!usable(result.context) || selection(before.context) !== selection(result.context)) return unavailable('HOST_CONTEXT_CHANGED');
    if (result.evaluation?.ok !== true || result.evaluation.engine !== 'smartRecEvaluateSuitability'
        || result.evaluation.paidAiCalls !== 0
        || result.evaluation.gardenProfileId !== result.context.readiness.gardenProfileId
        || !SPECIFIC_PLANT_SUITABILITY_LEVELS.includes(result.evaluation.recommendationLevel)) return unavailable('HOST_EVALUATOR_UNAVAILABLE');
    // A final fresh read closes the asynchronous context/evaluation reply gap.
    const after = await client.readContext();
    if (!isCurrent()) return unavailable('PI_RESULT_CHANGED');
    if (!after.ok || !usable(after.context) || selection(after.context) !== selection(result.context)) return unavailable('HOST_CONTEXT_CHANGED');
    return result;
  } catch { return unavailable('HOST_AUTHORITY_UNAVAILABLE'); }
}

// Plant/location/evidence slots in the unchanged 941 × 1672 Owner PI-07 raster.
export const PI_SUITABILITY_SLOTS = Object.freeze({
  photo: [89, 96, 218, 165], name: [334, 107, 540, 41], scientific: [334, 156, 540, 30],
  growth: [334, 204, 112, 53], environment: [460, 204, 103, 53],
  foliage: [577, 204, 139, 53], ease: [730, 204, 124, 53],
  description: [171, 465, 650, 31],
  lightValue: [187, 561, 249, 27], lightNote: [104, 631, 312, 71], lightBar: [104, 602, 327, 20],
  temperatureValue: [595, 561, 248, 27], temperatureNote: [512, 631, 314, 75], temperatureBar: [512, 602, 328, 20],
  humidityValue: [187, 785, 249, 27], humidityNote: [104, 855, 312, 71], humidityBar: [104, 825, 327, 20],
  soilValue: [595, 785, 248, 27], soilNote: [512, 855, 314, 75], soilBar: [512, 825, 328, 20],
  wateringValue: [187, 1010, 249, 27], wateringNote: [104, 1084, 312, 51], wateringBar: [104, 1052, 327, 20],
  fertilizingValue: [595, 1010, 248, 27], fertilizingNote: [512, 1084, 314, 51], fertilizingBar: [512, 1052, 328, 20],
  location: [157, 1208, 694, 36], verdict: [157, 1254, 450, 50], score: [157, 1310, 694, 26],
  evidence: [157, 1365, 694, 65]
});

function unavailableMessage(result) {
  const c = result.context;
  if (result.reason === 'HOST_CONTEXT_CHANGED') return 'Garden context changed. Return to Care and check again.';
  if (result.reason === 'HOST_UNAVAILABLE') return 'Open Plant Identification from your active garden to check suitability.';
  if (c?.readiness?.authenticated === false) return 'Sign in to check suitability for your garden.';
  if (c?.readiness?.status === 'RESTORING') return 'Your garden is still loading. Return to Care and try again when ready.';
  if (!c?.readiness?.gardenProfileId && c) return 'Select an active garden before checking suitability.';
  if (c && (!c.trusted || c.location?.useForSuitability !== true)) return 'Confirm your garden location before checking suitability.';
  return 'Suitability is unavailable. Return to Care and try again when your garden is ready.';
}

export function createPiSuitabilityView({document, stage, window, readState, getClient}) {
  let root = null, current = null, run = null, slots = null;
  let accepted = null, acceptedState = null;
  const reviewListeners = new Set();
  const notifyReview = () => { for (const listener of reviewListeners) { try { listener(); } catch {} } };
  const revokeReview = () => { if (accepted) { accepted = null; acceptedState = null; notifyReview(); } };
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
  function clear() { if (acceptedState && readState() !== acceptedState) revokeReview(); run = null; current = null; root?.remove(); root = null; slots = null; }
  function show(result) {
    if (!root) return;
    root.setAttribute('data-pi-suitability', result.ok ? 'SUITABILITY_READY' : 'SUITABILITY_UNAVAILABLE');
    root.setAttribute('data-reason', result.reason || '');
    root.setAttribute('data-garden-id', result.ok ? result.context.readiness.gardenProfileId : '');
    if (!result.ok) {
      slots.location.textContent = unavailableMessage(result); slots.verdict.textContent = 'Not assessed';
      slots.score.textContent = 'No garden suitability score is available.';
      slots.evidence.textContent = 'No suitability conclusion. Missing context is not a positive recommendation.';
      return;
    }
    const evidence = result.evaluation;
    slots.location.textContent = evidence.locationLabel || 'Location label unavailable';
    slots.verdict.textContent = formatSpecificPlantLevelLabel(evidence.recommendationLevel);
    slots.score.textContent = typeof evidence.suitabilityScore === 'number' && Number.isFinite(evidence.suitabilityScore)
      ? 'Suitability score: ' + evidence.suitabilityScore + ' / 100' : 'Suitability score unavailable';
    const outcomes = ['survival', 'growth', 'flowering', 'fruiting'].map(key =>
      key[0].toUpperCase() + key.slice(1) + ': ' + (evidence.outcomes?.[key] || 'Unknown'));
    const factors = [evidence.primaryLimiter, ...(evidence.warnings || [])].filter(value => typeof value === 'string' && value.trim());
    slots.evidence.textContent = outcomes.join(' · ') + (factors.length ? '\n' + [...new Set(factors)].join('\n') : '');
  }
  function invalidate() {
    revokeReview();
    if (!current) return;
    run = null; show(unavailable('HOST_CONTEXT_CHANGED'));
  }
  // Existing host lifecycle signals only invalidate. Their event payloads never
  // supply location/trust/evidence; the next explicit visit must use 6A again.
  let host = null;
  try { if (window?.parent !== window && window.parent.location.origin === window.location.origin) host = window.parent; } catch {}
  const events = ['cruvit:garden-context-ready', 'cruvit:auth-session-changed'];
  for (const name of events) host?.addEventListener(name, invalidate);
  const closed = event => { if (host && event.source === host && event.origin === window.location.origin
    && event.data?.type === 'cruvit:core-pi-suitability-closed') invalidate(); };
  window?.addEventListener?.('message', closed);
  const hidden = () => { if (document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', hidden);
  function dispose() {
    revokeReview(); reviewListeners.clear(); clear(); for (const name of events) host?.removeEventListener(name, invalidate);
    window?.removeEventListener?.('message', closed); window?.removeEventListener?.('pagehide', dispose);
    document.removeEventListener?.('visibilitychange', hidden);
  }
  window?.addEventListener?.('pagehide', dispose);
  return Object.freeze({
    start(state) {
      if (readState() !== state || !canonicalPiCare(state).available) return false;
      revokeReview(); clear(); current = state; const task = {}; run = task;
      void readPiSuitability({state, client: getClient(), isCurrent: () => run === task && readState() === state})
        .then(result => { if (run === task && readState() === state) {
          show(result);
          // Publish only after the existing complete acceptance path and render.
          if (result.ok === true) {
            acceptedState = state; accepted = freeze(structuredClone(result)); notifyReview();
          }
        } });
      return true;
    },
    update(state, visible) {
      if (!visible || current !== state) { clear(); return; }
      if (root) return;
      const model = canonicalPiCare(state);
      if (!model.available) { clear(); return; }
      root = document.createElement('section'); root.className = 'pi-suitability';
      root.setAttribute('aria-label', 'Canonical plant growing conditions and garden suitability');
      root.setAttribute('data-pi-suitability', 'CHECKING'); root.setAttribute('data-canonical-slug', model.canonicalSlug);
      root.setAttribute('data-identify-action', state.actionId); slots = {};
      for (const [key, [x, y, width, height]] of Object.entries(PI_SUITABILITY_SLOTS)) {
        const slot = document.createElement('div'); slot.className = 'pi-suitability-slot pi-suitability-' + key;
        slot.setAttribute('data-pi-suitability-slot', key);
        Object.assign(slot.style, {left: x / 941 * 100 + '%', top: y / 1672 * 100 + '%', width: width / 941 * 100 + '%', height: height / 1672 * 100 + '%'});
        root.appendChild(slot); slots[key] = slot;
      }
      for (const key of ['name', 'scientific', 'growth', 'foliage']) slots[key].textContent = model[key];
      for (const key of ['environment', 'ease']) slots[key].textContent = 'Not available';
      slots.description.textContent = 'Growing conditions for ' + model.name + '.';
      for (const [key, card] of Object.entries(model.cards)) {
        slots[key + 'Value'].textContent = card.value; slots[key + 'Note'].textContent = card.note;
        slots[key + 'Value'].setAttribute('data-care-source', card.source || '');
        slots[key + 'Bar'].setAttribute('aria-hidden', 'true');
      }
      slots.location.textContent = 'Checking your current garden…'; slots.verdict.textContent = 'Not assessed';
      slots.score.textContent = 'No garden suitability score is available.';
      slots.evidence.textContent = 'Waiting for current garden evidence.'; slots.evidence.tabIndex = 0;
      slots.evidence.setAttribute('aria-label', 'Suitability outcomes and evidence');
      slots.evidence.setAttribute('role', 'region'); slots.verdict.setAttribute('role', 'status');
      const photo = document.createElement('img'), currentRoot = root;
      photo.alt = model.name + ' — canonical catalog image'; photo.referrerPolicy = 'no-referrer';
      photo.setAttribute('data-pi-suitability-image', model.canonicalSlug);
      const message = document.createElement('span'); message.className = 'pi-suitability-image-message';
      message.textContent = 'Loading catalog image…';
      photo.onload = () => { if (root === currentRoot) message.hidden = true; };
      photo.onerror = () => { if (root === currentRoot) { photo.hidden = true; message.hidden = false; message.textContent = 'Catalog image unavailable'; } };
      slots.photo.appendChild(photo); slots.photo.appendChild(message); photo.src = model.media.url;
      const credit = document.createElement('div'); credit.className = 'pi-suitability-credit';
      credit.textContent = formatCatalogAttributionLabel(model.media);
      for (const [label, url] of [['Source', model.media.sourcePageUrl], ['License', model.media.licenseUrl]]) {
        if (!/^https:\/\//i.test(url || '')) continue;
        const link = document.createElement('a'); link.textContent = label; link.href = url;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; credit.appendChild(link);
      }
      slots.photo.appendChild(credit); stage.appendChild(root);
    },
    readAcceptedReview() { return acceptedState && readState() === acceptedState ? accepted : null; },
    observeAcceptedReview(listener) {
      if (typeof listener !== 'function') throw Error('Read-only observer required');
      reviewListeners.add(listener); return () => reviewListeners.delete(listener);
    },
    isCurrent: state => current === state && readState() === state,
    dispose
  });
}
