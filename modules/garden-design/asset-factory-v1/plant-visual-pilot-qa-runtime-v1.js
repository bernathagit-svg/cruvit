import { CALIBRATION_SOURCE_MESSAGE_TYPE } from './calibration-garden-source-host-v1.js';
import {
  applyProductionPhysicalScenes,
  seedMangoGardenDesignPreference
} from './physical-scale-foundation-v1-runtime.js';
import { PHOTO_SCALE_STATE } from './physical-scale-foundation-v1.js';

const SUMMARY_URL = '../../data/garden-design/plant-visual-pilot-r2-qa-v1.json?v=20260921a';
const IMAGE_URL = (jobId) =>
  '/.netlify/functions/plant-visual-pilot-qa?job=' + encodeURIComponent(jobId);
const STORAGE_KEY = 'cruvit:plant-visual-pilot-qa-v1';
const OWNER_CHOICES = Object.freeze([
  'PASS_OWNER_VISUAL_GATES',
  'NEEDS_REGENERATION',
  'REJECT_IDENTITY_OR_STATE'
]);

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadState() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    parsed.choices = parsed.choices && typeof parsed.choices === 'object' ? parsed.choices : {};
    return parsed;
  } catch {
    return { choices: {} };
  }
}

function saveState(state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function choiceLabel(choice) {
  if (choice === 'PASS_OWNER_VISUAL_GATES') return 'PASS — identity/state/in-garden look correct';
  if (choice === 'NEEDS_REGENERATION') return 'Needs regeneration';
  if (choice === 'REJECT_IDENTITY_OR_STATE') return 'Reject identity/state';
  return 'No owner decision';
}

function renderChoiceState() {
  const state = loadState();
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    const jobId = btn.getAttribute('data-job-id');
    const choice = btn.getAttribute('data-owner-choice');
    btn.setAttribute('aria-pressed', state.choices[jobId] === choice ? 'true' : 'false');
  });
  document.querySelectorAll('[data-choice-status]').forEach((el) => {
    const jobId = el.getAttribute('data-choice-status');
    el.textContent = choiceLabel(state.choices[jobId]);
  });
  const decisions = Object.values(state.choices).filter(Boolean).length;
  const summary = document.getElementById('ownerDecisionSummary');
  if (summary) summary.textContent = decisions + ' / 4 owner decisions recorded in this browser session.';
}

function wireChoices() {
  document.querySelectorAll('[data-owner-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-job-id');
      const choice = btn.getAttribute('data-owner-choice');
      if (!jobId || !OWNER_CHOICES.includes(choice)) return;
      const state = loadState();
      state.choices[jobId] = state.choices[jobId] === choice ? null : choice;
      saveState(state);
      renderChoiceState();
    });
  });
  renderChoiceState();
}

function rowTitle(row) {
  if (row.canonicalSlug === 'banana') return 'Banana — young vegetative';
  if (row.canonicalSlug === 'pineapple') return 'Pineapple — mature fruiting';
  if (row.canonicalSlug === 'mango' && row.growthStage === 'young') return 'Mango — young vegetative';
  if (row.canonicalSlug === 'mango' && row.phenology === 'fruiting') return 'Mango — mature fruiting';
  return row.jobId;
}

function reviewFields(row) {
  return [
    ['TECHNICAL_QA', row.technicalQA],
    ['FRAMING_QA', row.framingQA],
    ['BOTANICAL_IDENTITY_QA', row.botanicalIdentityQA],
    ['ARCHITECTURE_QA', row.architectureQA],
    ['GROWTH_STAGE_QA', row.growthStageQA],
    ['PHENOLOGY_STATE_QA', row.phenologyStateQA],
    ['IN_GARDEN_QA', row.inGardenQA],
    ['SOURCE_STATUS', row.sourceStatus]
  ];
}

function bboxAttr(row) {
  const m = row.technicalMetrics || {};
  const b = m.bbox || {};
  const width = Number(m.width) || 1024;
  const height = Number(m.height) || 1536;
  if (!b.exists) return '';
  return [
    'data-canvas="' + width + ',' + height + '"',
    'data-bbox="' + [b.minX,b.minY,b.maxX,b.maxY].join(',') + '"'
  ].join(' ');
}

function sectionHtml(row, index) {
  const recovered = row.sourceStatus === 'RECOVERED_EVIDENCE_MISMATCH';
  const sourceNote = recovered
    ? '<p class="warn-mini">Recovered candidate: current R2 bytes differ from the earlier evidence record. Treat this as a fresh owner visual review. It is NOT production-approved.</p>'
    : '<p class="ok-mini">Candidate bytes match the migration evidence and SHA record.</p>';
  return `<section class="plant" data-job-id="${esc(row.jobId)}">
    <h2>${index + 1}. ${esc(rowTitle(row))}</h2>
    <p class="meta">${esc(row.scientific)} · ${esc(row.architectureMode)} · ${esc(row.growthStage)} · ${esc(row.phenology)}</p>
    ${sourceNote}
    <div class="grid">
      <div class="card">
        <h3>Native candidate</h3>
        <div class="native checkerboard"><img src="${esc(IMAGE_URL(row.jobId))}" alt="${esc(rowTitle(row))} candidate"></div>
      </div>
      <div class="card">
        <h3>Real Garden preview</h3>
        <div class="scene real physical-v1-scene" data-role="garden-scene"
          data-canonical-slug="${esc(row.canonicalSlug)}"
          data-visual-form="${esc(row.canonicalSlug === 'pineapple' ? 'rosette' : row.canonicalSlug === 'banana' ? 'herbaceous-clump' : 'tree')}"
          data-architecture-mode="${esc(row.architectureMode)}"
          data-growth-stage="${esc(row.growthStage)}"
          data-phenology="${esc(row.phenology)}"
          data-size-scenario="NATURAL_MATURE"
          data-lock-scale-mode="ESTIMATED"
          data-lock-depth="middle"
          ${bboxAttr(row)}>
          <div class="placement" data-role="placement">
            <img class="cutout" src="${esc(IMAGE_URL(row.jobId))}" alt="${esc(rowTitle(row))} in garden">
            <span class="ground-shadow" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </div>
    <div class="qa">
      <h3>QA</h3>
      <ul>${reviewFields(row).map(([k,v]) => '<li><strong>'+esc(k)+'</strong>: '+esc(v)+'</li>').join('')}</ul>
      <p class="small">PASS here means you visually confirm the generated plant matches the intended botanical identity, architecture, growth stage and phenology, and looks natural in the real saved Garden photo. It does not write production.</p>
    </div>
    <div class="choices">
      <button data-owner-choice="PASS_OWNER_VISUAL_GATES" data-job-id="${esc(row.jobId)}">PASS visual gates</button>
      <button data-owner-choice="NEEDS_REGENERATION" data-job-id="${esc(row.jobId)}">Needs regeneration</button>
      <button data-owner-choice="REJECT_IDENTITY_OR_STATE" data-job-id="${esc(row.jobId)}">Wrong identity/state</button>
      <span class="choice-status" data-choice-status="${esc(row.jobId)}">No owner decision</span>
    </div>
  </section>`;
}

async function applyProductionScale() {
  seedMangoGardenDesignPreference('pilot-qa-real-garden');
  let registry = null;
  try {
    const res = await fetch('../../data/catalog/botanical-size-authority-v1.json', { cache: 'no-store' });
    if (res.ok) registry = await res.json();
  } catch {
    registry = null;
  }
  applyProductionPhysicalScenes(document, {
    authorityRegistry: registry,
    photoScaleState: PHOTO_SCALE_STATE.NOT_CALIBRATED
  });
}

function applySignedGardenUrl(url) {
  if (!url) return false;
  document.querySelectorAll('[data-role="garden-scene"]').forEach((el) => {
    el.style.backgroundImage = "url('" + String(url).replace(/'/g, "\\'") + "')";
  });
  const banner = document.getElementById('gardenBanner');
  if (banner) {
    banner.className = 'ok';
    banner.textContent = 'Real saved Garden Design source photo loaded via temporary signed URL. The photo is not copied into the repo or R2.';
  }
  applyProductionScale();
  return true;
}

window.addEventListener('message', (ev) => {
  const d = ev && ev.data;
  if (!d || d.type !== CALIBRATION_SOURCE_MESSAGE_TYPE) return;
  if (d.sourceMediaUrl) applySignedGardenUrl(d.sourceMediaUrl);
});

async function boot() {
  const status = document.getElementById('qaLoadStatus');
  try {
    const res = await fetch(SUMMARY_URL, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data || !Array.isArray(data.rows)) throw new Error(data?.verdict || data?.code || 'QA_SUMMARY_LOAD_FAILED');
    const root = document.getElementById('qaRows');
    root.innerHTML = data.rows.map(sectionHtml).join('');
    status.textContent = 'R2 candidates loaded. Automated Technical/Framing QA completed with zero paid AI calls.';
    status.className = data.rows.every((r) => r.technicalQA === 'PASS' && r.framingQA === 'PASS') ? 'ok' : 'warn';
    wireChoices();
    await applyProductionScale();
  } catch (err) {
    status.textContent = 'QA load failed: ' + String(err?.message || err);
    status.className = 'warn';
  }
}

boot();
