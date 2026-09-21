const CALIBRATION_SOURCE_MESSAGE_TYPE = 'cruvit:calibration-garden-source';

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

const OWNER_SCALE_PREF = Object.freeze({
  'banana__young__default__vegetative__v1': 'large',
  'mango__young__tree__vegetative__v1': 'large',
  'pineapple__mature__default__fruiting__v1': 'medium'
});

function reviewScene(row, scale) {
  const preferred = OWNER_SCALE_PREF[row.jobId] === scale;
  return `<div class="review-scale${preferred ? ' owner-preferred' : ''}">
    <h4>${esc(scale[0].toUpperCase() + scale.slice(1))}${preferred ? ' · Owner preferred' : ''}</h4>
    <div class="scene real review-${esc(scale)}" data-role="garden-scene" data-review-scale="${esc(scale)}">
      <div class="review-plant-box ${esc(scale)}">
        <img class="cutout review-cutout"
          src="${esc(IMAGE_URL(row.jobId))}"
          alt="${esc(rowTitle(row))} — ${esc(scale)} review scale">
      </div>
      <span class="ground-shadow" aria-hidden="true"></span>
    </div>
  </div>`;
}


const MATURE_MANGO_PRODUCTION_ANCHOR = Object.freeze({
  baseWidthPx: 480,
  savedPlacementScale: 1.15,
  productionEquivalentBaseWidthPx: 552,
  x: 0.226636859348842,
  y: 0.948567183907055,
  referenceSceneWidthPx: 1280,
  sceneAspectRatio: 4 / 3
});

function matureMangoFullAspectReview(row) {
  return `<div class="card full-aspect-card">
    <h3>Real Garden — saved production scale anchor</h3>
    <p class="small">This preview reuses the approved mature Mango placement geometry: same mature stage, same tree form, same placement multiplier. Phenology alone does not change scale.</p>
    <div class="anchor-readout">Saved placement scale <strong>1.15</strong> · base width <strong>480 px</strong> · production-equivalent width <strong>552 px</strong></div>
    <div class="scene real full-aspect-scene" data-role="garden-scene" data-production-anchor-job="${esc(row.jobId)}">
      <div class="production-anchor-box">
        <img class="cutout review-cutout"
          src="${esc(IMAGE_URL(row.jobId))}"
          alt="${esc(rowTitle(row))} — saved production scale anchor">
      </div>
      <span class="ground-shadow" aria-hidden="true"></span>
    </div>
  </div>`;
}

function applyProductionAnchorGeometry() {
  document.querySelectorAll('[data-production-anchor-job]').forEach((scene) => {
    const box = scene.querySelector('.production-anchor-box');
    if (!box) return;
    const sceneWidth = scene.clientWidth || MATURE_MANGO_PRODUCTION_ANCHOR.referenceSceneWidthPx;
    const sceneHeight = Math.round(sceneWidth / MATURE_MANGO_PRODUCTION_ANCHOR.sceneAspectRatio);
    scene.style.height = sceneHeight + 'px';
    const responsiveScale = Math.min(1, sceneWidth / MATURE_MANGO_PRODUCTION_ANCHOR.referenceSceneWidthPx);
    const widthPx = MATURE_MANGO_PRODUCTION_ANCHOR.productionEquivalentBaseWidthPx * responsiveScale;
    box.style.width = widthPx + 'px';
    box.style.height = Math.round(widthPx * 1.5) + 'px';
    box.style.aspectRatio = 'auto';
    box.style.left = (MATURE_MANGO_PRODUCTION_ANCHOR.x * 100) + '%';
    box.style.bottom = ((1 - MATURE_MANGO_PRODUCTION_ANCHOR.y) * 100) + '%';
  });
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
    <div class="grid native-grid">
      <div class="card">
        <h3>Native candidate</h3>
        <div class="native checkerboard"><img src="${esc(IMAGE_URL(row.jobId))}" alt="${esc(rowTitle(row))} candidate"></div>
      </div>
      ${row.jobId === 'mango__mature__tree__fruiting__v1'
        ? matureMangoFullAspectReview(row)
        : `<div class="card">
            <h3>Real Garden — bounded visual QA scales</h3>
            <p class="small">Small / Medium / Large are review scales only. They are not meter-accurate botanical sizes and never permit clipping.</p>
            <div class="review-scales">
              ${reviewScene(row, 'small')}
              ${reviewScene(row, 'medium')}
              ${reviewScene(row, 'large')}
            </div>
          </div>`}
    </div>
    <div class="qa">
      <h3>QA</h3>
      <ul>${reviewFields(row).map(([k,v]) => '<li><strong>'+esc(k)+'</strong>: '+esc(v)+'</li>').join('')}</ul>
      <p class="small">Review all three garden scales for perspective, ground contact, sticker look, halo, sharpness match, color/tonal match and silhouette. PASS does not assert meter-accurate size and does not write production.</p>
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
  return false;
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
  applyProductionAnchorGeometry();
  return true;
}

window.addEventListener('resize', () => {
  applyProductionAnchorGeometry();
});

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
    applyProductionAnchorGeometry();
  } catch (err) {
    status.textContent = 'QA load failed: ' + String(err?.message || err);
    status.className = 'warn';
  }
}

boot();
