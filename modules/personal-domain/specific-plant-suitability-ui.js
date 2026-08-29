/**
 * Specific Plant Suitability Check V1 — Personal Domain UI wiring.
 * Scoring authority remains app.html smartRecEvaluateSuitability (via window API).
 * Overall verdict uses deriveSpecificPlantOutcomes quality gate (four outcomes).
 */
import {
  buildSpecificPlantSuitabilityViewModel,
  deriveSpecificPlantOutcomes,
  mayRunSpecificPlantSuitabilityCheck,
  searchCatalogPlantsForSpecificCheck
} from './specific-plant-suitability-contract.js';

/** @type {object | null} */
let selectedPlant = null;

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function api() {
  return window.cruvitSpecificPlantSuitability || null;
}

function pd() {
  return window.cruvitPersonalDomainV0 || null;
}

function gateState() {
  const gardens = pd()?.getOwnedGardensCache?.() || [];
  const activeGardenId = String(pd()?.getActiveGardenId?.() || '').trim();
  const hasTrustedLocation = api()?.hasTrustedAppLocation?.() === true;
  return {
    gardenCount: gardens.length,
    activeGardenId,
    hasTrustedLocation,
    gardens
  };
}

function setSelectedPlant(plant) {
  selectedPlant = plant && typeof plant === 'object' ? plant : null;
  const label = document.getElementById('pdV0PlantSelected');
  const btn = document.getElementById('pdV0CheckSuitabilityBtn');
  if (label) {
    if (selectedPlant) {
      const sci = selectedPlant.scientific ? ` (${selectedPlant.scientific})` : '';
      label.hidden = false;
      label.textContent = `Selected: ${selectedPlant.name || selectedPlant.slug}${sci}`;
    } else {
      label.hidden = true;
      label.textContent = '';
    }
  }
  if (btn) btn.disabled = !selectedPlant;
}

function renderHits(plants) {
  const list = document.getElementById('pdV0PlantHits');
  if (!list) return;
  const rows = Array.isArray(plants) ? plants.slice(0, 12) : [];
  if (!rows.length) {
    list.hidden = true;
    list.innerHTML = '';
    return;
  }
  list.hidden = false;
  list.innerHTML = rows
    .map((p) => {
      const sci = p.scientific ? ` · ${escapeHtml(p.scientific)}` : '';
      return `<li><button type="button" data-slug="${escapeHtml(p.slug || '')}">${escapeHtml(p.name || p.slug)}${sci}</button></li>`;
    })
    .join('');
}

function clearResult() {
  const el = document.getElementById('pdV0SuitResult');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

function renderResult(vm, gateMessage) {
  const el = document.getElementById('pdV0SuitResult');
  if (!el) return;
  if (gateMessage) {
    el.hidden = false;
    el.innerHTML = `<p>${escapeHtml(gateMessage)}</p>`;
    return;
  }
  if (!vm) {
    clearResult();
    return;
  }
  const factors = (vm.limitingFactors || vm.warnings || [])
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join('');
  const sci = vm.scientific
    ? `<div><span class="pd-v0-chip">Scientific</span> ${escapeHtml(vm.scientific)}</div>`
    : '';
  const review = vm.needsReview
    ? `<p class="pd-v0-hint">Catalog marks this plant as needing review — result stays conservative.</p>`
    : '';
  el.hidden = false;
  el.innerHTML = `
    <p class="pd-v0-suit-overall">Overall: ${escapeHtml(vm.levelLabel)}</p>
    <div><strong>${escapeHtml(vm.plantName)}</strong></div>
    ${sci}
    <div><span class="pd-v0-chip">Garden</span> ${escapeHtml(vm.gardenName || 'Active Garden')}</div>
    <div><span class="pd-v0-chip">Location</span> ${escapeHtml(vm.locationLabel || '—')}</div>
    <div><span class="pd-v0-chip">Climate</span> ${escapeHtml(vm.climateLabel || '—')}</div>
    <dl class="pd-v0-suit-outcomes">
      <div><dt>Survival</dt><dd>${escapeHtml(vm.survivalLabel || 'UNKNOWN')}</dd></div>
      <div><dt>Growth</dt><dd>${escapeHtml(vm.growthLabel || 'UNKNOWN')}</dd></div>
      <div><dt>Flowering</dt><dd>${escapeHtml(vm.floweringLabel || 'UNKNOWN')}</dd></div>
      <div><dt>Fruiting</dt><dd>${escapeHtml(vm.fruitingLabel || 'UNKNOWN')}</dd></div>
    </dl>
    ${review}
    ${factors ? `<p class="pd-v0-hint">Main limiting factors</p><ul>${factors}</ul>` : ''}
    ${
      (vm.outcomes?.unknownEvidence || []).length
        ? `<p class="pd-v0-hint">UNKNOWN evidence: ${escapeHtml((vm.outcomes.unknownEvidence || []).join(', '))}</p>`
        : ''
    }
  `;
}

function runSearch() {
  const q = String(document.getElementById('pdV0PlantSearch')?.value || '');
  const lib = api()?.getPlantLibrary?.() || [];
  const hits = searchCatalogPlantsForSpecificCheck(lib, q);
  renderHits(hits);
}

function runCheck() {
  const gate = mayRunSpecificPlantSuitabilityCheck(gateState());
  if (!gate.ok) {
    renderResult(null, gate.message);
    return;
  }
  if (!selectedPlant) {
    renderResult(null, 'Select a catalog plant first.');
    return;
  }
  const evaluate = api()?.evaluate;
  if (typeof evaluate !== 'function') {
    renderResult(null, 'Suitability engine is not available yet.');
    return;
  }
  const suitability = evaluate(selectedPlant);
  const climateProfile =
    typeof api()?.getAppClimateProfile === 'function' ? api().getAppClimateProfile() : {};
  const meta =
    typeof api()?.getClimateMetaForPlant === 'function'
      ? api().getClimateMetaForPlant(selectedPlant)
      : selectedPlant.climateTraits || null;
  const outcomes = deriveSpecificPlantOutcomes({
    meta,
    climateProfile,
    suitability,
    plant: selectedPlant,
    protectedGrowing: false
  });
  const loc = api()?.getAppLocation?.() || {};
  const gardens = gateState().gardens;
  const activeId = gateState().activeGardenId;
  const garden = gardens.find((g) => String(g.id) === String(activeId)) || gardens[0];
  const vm = buildSpecificPlantSuitabilityViewModel({
    plant: selectedPlant,
    gardenName: garden?.name,
    locationLabel: loc.label || garden?.location_label,
    climateLabel: loc.climate || garden?.location_climate,
    suitability,
    outcomes
  });
  renderResult(vm);
}

export function onActiveGardenChanged() {
  clearResult();
  if (selectedPlant) {
    /* Recompute all four outcomes from the newly hydrated Garden location. */
    runCheck();
  }
}

export function wireSpecificPlantSuitabilityUi() {
  const search = document.getElementById('pdV0PlantSearch');
  const hits = document.getElementById('pdV0PlantHits');
  const btn = document.getElementById('pdV0CheckSuitabilityBtn');
  search?.addEventListener('input', () => {
    runSearch();
  });
  hits?.addEventListener('click', (event) => {
    const btnEl = event.target?.closest?.('button[data-slug]');
    if (!btnEl) return;
    const slug = String(btnEl.getAttribute('data-slug') || '');
    const lib = api()?.getPlantLibrary?.() || [];
    const plant = lib.find((p) => String(p.slug) === slug) || null;
    setSelectedPlant(plant);
    clearResult();
  });
  btn?.addEventListener('click', () => runCheck());
}

window.cruvitSpecificPlantSuitabilityUi = {
  wire: wireSpecificPlantSuitabilityUi,
  onActiveGardenChanged,
  runCheck,
  getSelectedPlant: () => selectedPlant
};
