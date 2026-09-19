/**
 * Calibration review auth/garden readiness race. Zero paid AI. Zero polling.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import {
  GARDEN_CONTEXT_READY_EVENT,
  buildGardenContextReadyDetail,
  classifyPersonalDomainGardenReadiness
} from '../modules/personal-domain/garden-context-ready-v1.js';
import {
  CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED,
  applyCalibrationSourceToReviewDocument,
  buildCalibrationSourceInjectMessage,
  CANDIDATE_NOT_GENERATED_YET,
  IN_GARDEN_QA_UNKNOWN_COPY
} from '../modules/garden-design/asset-factory-v1/calibration-garden-source-host-v1.js';
import {
  CALIBRATION_REVIEW_UI_STATUS,
  createCalibrationReviewHostController,
  mapCalibrationReviewUiStatus,
  resolveCalibrationHostGarden
} from '../modules/garden-design/asset-factory-v1/calibration-review-host-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function makeController(overrides = {}) {
  const loads = [];
  const statuses = [];
  const injected = [];
  let generateCalls = 0;
  const ctrl = createCalibrationReviewHostController({
    getReadiness: () => ({ status: 'RESTORING', authenticated: false, gardenProfileId: null, gardenCount: 0, profilesHydrated: false }),
    loadSource: async () => {
      generateCalls += 0;
      loads.push(1);
      return {
        ok: true,
        code: 'READY',
        sourceMediaUrl: 'https://signed.example/user-garden-media/token',
        sourceMediaId: 'media-1',
        designId: 'design-1',
        paidAiCalls: 0,
        imageGenerationCalls: 0
      };
    },
    setStatus: (code) => statuses.push(code),
    injectResolved: (resolved, uiStatus) => injected.push({ resolved, uiStatus }),
    ...overrides
  });
  return { ctrl, loads, statuses, injected, generateCalls };
}

test('garden-context-ready contract has no private media URL', () => {
  const detail = buildGardenContextReadyDetail({
    authenticated: true,
    gardenProfileId: 'garden-1',
    gardenCount: 1,
    sourceMediaUrl: 'https://secret.example/private.jpg'
  });
  assert.equal(GARDEN_CONTEXT_READY_EVENT, 'cruvit:garden-context-ready');
  assert.equal(detail.authenticated, true);
  assert.equal(detail.gardenProfileId, 'garden-1');
  assert.equal(detail.gardenCount, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(detail, 'sourceMediaUrl'), false);
  assert.equal(JSON.stringify(detail).includes('secret.example'), false);
  assert.equal(classifyPersonalDomainGardenReadiness({ profilesHydrated: false, authenticated: true }).status, 'RESTORING');
  assert.equal(classifyPersonalDomainGardenReadiness({ profilesHydrated: true, authenticated: false }).status, 'SIGNED_OUT');
  assert.equal(
    classifyPersonalDomainGardenReadiness({ profilesHydrated: true, authenticated: true, gardenCount: 2 }).status,
    'NO_ACTIVE_GARDEN'
  );
  assert.equal(
    classifyPersonalDomainGardenReadiness({
      profilesHydrated: true,
      authenticated: true,
      gardenProfileId: 'g1',
      gardenCount: 1
    }).status,
    'READY'
  );
});

test('Personal Domain emits garden-context-ready after profiles hydrate, not at auth chip', () => {
  const profile = read('modules/personal-domain/garden-profile-v0.js');
  const authIdx = profile.indexOf('function emitAuthSessionChanged');
  const readyIdx = profile.indexOf('function emitGardenContextReady');
  const refreshIdx = profile.indexOf('async function refreshOwnedGardenProfiles');
  const emitInRefresh = profile.indexOf('emitGardenContextReady();', refreshIdx);
  const returnRefresh = profile.indexOf('return rows;', emitInRefresh);
  assert.ok(authIdx > 0);
  assert.ok(readyIdx > authIdx);
  assert.ok(emitInRefresh > refreshIdx);
  assert.ok(returnRefresh > emitInRefresh);
  assert.match(profile, /gardenProfilesHydrated = false/);
  assert.match(profile, /getGardenContextReadiness/);
  assert.match(profile, /GARDEN_CONTEXT_READY_EVENT/);
  assert.match(read('modules/personal-domain/garden-context-ready-v1.js'), /cruvit:garden-context-ready/);
  assert.doesNotMatch(profile, /sourceMediaUrl/);
});

test('A–I: window-load race waits for garden-context-ready then injects once', async () => {
  let readiness = {
    status: 'RESTORING',
    authenticated: false,
    gardenProfileId: null,
    gardenCount: 0,
    profilesHydrated: false
  };
  const { ctrl, loads, statuses, injected } = makeController({
    getReadiness: () => readiness
  });

  ctrl.open();
  assert.equal(loads.length, 0);
  assert.equal(statuses.includes(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_CONTEXT), true);
  assert.equal(statuses.includes(CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED), false);

  ctrl.onAuthSessionChanged({ authenticated: true, userId: 'user-1' });
  assert.equal(loads.length, 0);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_CONTEXT);
  assert.equal(statuses.includes(CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED), false);

  readiness = {
    status: 'READY',
    authenticated: true,
    gardenProfileId: 'garden-mojstrana',
    gardenCount: 1,
    profilesHydrated: true
  };
  await ctrl.onGardenContextReady({
    authenticated: true,
    gardenProfileId: 'garden-mojstrana',
    gardenCount: 1
  });
  assert.equal(loads.length, 1);
  assert.equal(statuses.includes(CALIBRATION_REVIEW_UI_STATUS.LOADING_GARDEN_PHOTO), true);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED);
  assert.equal(injected.some((row) => row.resolved && row.resolved.sourceMediaUrl === 'https://signed.example/user-garden-media/token'), true);
  assert.equal(ctrl.getState().imageGenerationCalls, 0);
  assert.equal(ctrl.getState().paidAiCalls, 0);

  const doc = {
    querySelectorAll(sel) {
      if (sel === '.scene.real') {
        return [
          { style: {}, classList: { remove() {} }, querySelector: () => ({ classList: { remove() {} } }) },
          { style: {}, classList: { remove() {} }, querySelector: () => ({ classList: { remove() {} } }) },
          { style: {}, classList: { remove() {} }, querySelector: () => ({ classList: { remove() {} } }) }
        ];
      }
      return [];
    },
    getElementById() {
      return { className: '', textContent: '' };
    }
  };
  const applied = applyCalibrationSourceToReviewDocument(
    doc,
    injected.find((row) => row.resolved && row.resolved.sourceMediaUrl).resolved.sourceMediaUrl
  );
  assert.equal(applied.applied, true);
  assert.equal(applied.sceneCount, 3);

  await ctrl.onGardenContextReady({
    authenticated: true,
    gardenProfileId: 'garden-mojstrana',
    gardenCount: 1
  });
  assert.equal(loads.length, 1);
  assert.equal(ctrl.getState().loadCount, 1);
});

test('J: already authenticated + active Garden loads immediately', async () => {
  const { ctrl, loads, statuses } = makeController({
    getReadiness: () => ({
      status: 'READY',
      authenticated: true,
      gardenProfileId: 'garden-1',
      gardenCount: 1,
      profilesHydrated: true
    })
  });
  await ctrl.open();
  assert.equal(loads.length, 1);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED);
});

test('K: genuine signed-out is AUTH_REQUIRED', () => {
  const { ctrl, loads, statuses } = makeController({
    getReadiness: () => ({
      status: 'SIGNED_OUT',
      authenticated: false,
      gardenProfileId: null,
      gardenCount: 0,
      profilesHydrated: true
    })
  });
  ctrl.open();
  assert.equal(loads.length, 0);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.AUTH_REQUIRED);
});

test('L: multiple Designs map to DESIGN_SELECTION_REQUIRED', async () => {
  const { ctrl, statuses } = makeController({
    getReadiness: () => ({
      status: 'READY',
      authenticated: true,
      gardenProfileId: 'garden-1',
      gardenCount: 1,
      profilesHydrated: true
    }),
    loadSource: async () => ({
      ok: false,
      code: CALIBRATION_GARDEN_DESIGN_SELECTION_REQUIRED,
      paidAiCalls: 0,
      imageGenerationCalls: 0
    })
  });
  await ctrl.open();
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.DESIGN_SELECTION_REQUIRED);
});

test('M: missing source media is SOURCE_PHOTO_UNAVAILABLE', async () => {
  const { ctrl, statuses } = makeController({
    getReadiness: () => ({
      status: 'READY',
      authenticated: true,
      gardenProfileId: 'garden-1',
      gardenCount: 1,
      profilesHydrated: true
    }),
    loadSource: async () => ({
      ok: false,
      code: 'source_media_id_missing',
      paidAiCalls: 0,
      imageGenerationCalls: 0
    })
  });
  await ctrl.open();
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.SOURCE_PHOTO_UNAVAILABLE);
  assert.equal(mapCalibrationReviewUiStatus({ code: 'signed_url_missing' }), CALIBRATION_REVIEW_UI_STATUS.SIGNED_URL_FAILED);
});

test('N/O: zero generation, no polling, iframe cache injects once-ready result', async () => {
  const hostSrc = read('modules/garden-design/asset-factory-v1/calibration-review-host-v1.js');
  const app = read('app.html');
  const review = read('modules/garden-design/calibration-review.html');
  assert.doesNotMatch(hostSrc, /setInterval/);
  assert.doesNotMatch(hostSrc, /setTimeout/);
  assert.doesNotMatch(hostSrc, /generateAsset/);
  assert.doesNotMatch(app, /Waiting for authenticated host/);
  assert.match(app, /Loading Garden context/);
  assert.match(app, /cruvit:auth-session-changed/);
  assert.match(app, /cruvit:garden-context-ready/);
  assert.match(app, /getOwnedGardens/);
  assert.match(app, /DOMContentLoaded/);
  assert.match(review, /applyUiStatus/);
  assert.match(review, /LOADING_GARDEN_CONTEXT/);
  assert.doesNotMatch(review, /Waiting for authenticated host to inject/);

  const injected = [];
  let frameLoaded = false;
  const { ctrl, loads } = makeController({
    getReadiness: () => ({
      status: 'READY',
      authenticated: true,
      gardenProfileId: 'garden-1',
      gardenCount: 1,
      profilesHydrated: true
    }),
    injectResolved: (resolved, uiStatus) => {
      if (!frameLoaded) return;
      injected.push({ resolved, uiStatus });
    }
  });
  const pending = ctrl.open();
  assert.equal(injected.length, 0);
  frameLoaded = true;
  ctrl.noteFrameLoaded();
  await pending;
  assert.equal(loads.length, 1);
  assert.equal(injected.filter((row) => row.uiStatus === CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED).length >= 1, true);
  const msg = buildCalibrationSourceInjectMessage(injected.at(-1).resolved, injected.at(-1).uiStatus);
  assert.equal(msg.imageGenerationCalls, 0);
  assert.equal(msg.paidAiCalls, 0);
  assert.equal(msg.sourceMediaUrl.startsWith('https://'), true);
});

test('REAL_GARDEN_SOURCE_LOADED removes stale waiting-for-host copy', () => {
  const ghosts = ['mango', 'lavender', 'pineapple'].map((slug) => ({
    classList: { remove() {}, add() {} },
    textContent: slug + ' · waiting for host signed URL'
  }));
  const empty = {
    setAttribute() {},
    textContent:
      'Candidate binary: NOT GENERATED. ASSET_QA = UNKNOWN. IN_GARDEN_QA = BLOCKED until the real Garden photo loads.'
  };
  const scenes = ghosts.map((ghost) => ({
    style: {},
    classList: { remove() {} },
    querySelector: () => ghost
  }));
  const applied = applyCalibrationSourceToReviewDocument(
    {
      querySelectorAll(sel) {
        if (sel === '.scene.real') return scenes;
        if (sel === '[data-in-garden-status]') return [empty];
        return [];
      },
      getElementById() {
        return { className: '', textContent: '' };
      }
    },
    'https://signed.example/user-garden-media/token'
  );
  assert.equal(applied.applied, true);
  assert.equal(applied.sceneCount, 3);
  for (const ghost of ghosts) {
    assert.equal(ghost.textContent, CANDIDATE_NOT_GENERATED_YET);
    assert.equal(String(ghost.textContent).includes('waiting for host signed URL'), false);
  }
  assert.equal(empty.textContent, IN_GARDEN_QA_UNKNOWN_COPY);
  assert.match(empty.textContent, /IN_GARDEN_QA = UNKNOWN/);
  assert.doesNotMatch(empty.textContent, /IN_GARDEN_QA = PASS/);
  assert.doesNotMatch(empty.textContent, /waiting for host signed URL/);

  const review = read('modules/garden-design/calibration-review.html');
  assert.match(review, /ghost\.textContent = 'Candidate not generated yet'/);
  assert.match(
    review,
    /el\.textContent = 'Candidate not generated yet\. ASSET_QA = UNKNOWN\. IN_GARDEN_QA = UNKNOWN\.'/
  );
  const applyFn = review.slice(review.indexOf('function applySignedUrl'), review.indexOf('function applyUiStatus'));
  assert.match(applyFn, /IN_GARDEN_QA = UNKNOWN/);
  assert.doesNotMatch(applyFn, /IN_GARDEN_QA = PASS/);
  assert.doesNotMatch(applyFn, /waiting for host signed URL/);
  const generator = read('modules/garden-design/asset-factory-v1/calibration-review-v1.js');
  assert.match(generator, /waiting for host signed URL/);
});

test('P: garden-context-ready without gardenProfileId uses live active garden', async () => {
  let readiness = {
    status: 'RESTORING',
    authenticated: true,
    gardenProfileId: null,
    gardenCount: 0,
    profilesHydrated: false
  };
  const { ctrl, loads, statuses } = makeController({
    getReadiness: () => readiness,
    getOwnedGardens: () => [{ id: 'garden-mojstrana', name: 'Mojstrana' }]
  });
  ctrl.open();
  readiness = {
    status: 'READY',
    authenticated: true,
    gardenProfileId: 'garden-mojstrana',
    gardenCount: 1,
    profilesHydrated: true
  };
  await ctrl.onGardenContextReady({ authenticated: true, gardenCount: 1 });
  assert.equal(loads.length, 1);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED);
});

test('Q: a single owned garden recovers NO_ACTIVE_GARDEN without guessing among many', async () => {
  const { ctrl, loads, statuses } = makeController({
    getReadiness: () => ({
      status: 'NO_ACTIVE_GARDEN',
      authenticated: true,
      gardenProfileId: null,
      gardenCount: 1,
      profilesHydrated: true
    }),
    getOwnedGardens: () => [{ id: 'garden-mojstrana', name: 'Mojstrana' }]
  });
  await ctrl.open();
  assert.equal(loads.length, 1);
  assert.equal(statuses.at(-1), CALIBRATION_REVIEW_UI_STATUS.REAL_GARDEN_SOURCE_LOADED);
  assert.equal(
    resolveCalibrationHostGarden(
      { authenticated: true, gardenProfileId: null, gardenCount: 2, profilesHydrated: true, status: 'NO_ACTIVE_GARDEN' },
      { authenticated: true },
      [{ id: 'g1' }, { id: 'g2' }]
    ).status,
    'NO_ACTIVE_GARDEN'
  );
});
