import {
  buildPlantDetailBaseViewModel,
  assertPlantDetailIdentity,
} from './plant-detail-base-view-model.js';

function optionalFiniteNumber(value, label) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid_' + label);
  return n;
}

function requireMatchingKnowledge(plant, knowledge) {
  if (!knowledge) return null;

  const knowledgeSlug = knowledge.slug ?? knowledge.canonicalSlug ?? null;
  if (knowledgeSlug && plant.profileSlug && knowledgeSlug !== plant.profileSlug) {
    throw new Error('plant_knowledge_slug_mismatch:' + plant.id);
  }

  const scientific = knowledge.scientificName ?? knowledge.scientific_name ?? null;
  if (scientific && plant.scientificName && scientific !== plant.scientificName) {
    if (!knowledgeSlug || !plant.profileSlug) {
      throw new Error('plant_knowledge_identity_unverified:' + plant.id);
    }
  }

  return knowledge;
}

function projectPersonalMeasurements(observation) {
  if (!observation) {
    return Object.freeze({
      heightM: null,
      canopyM: null,
      source: null,
    });
  }

  return Object.freeze({
    heightM: optionalFiniteNumber(observation.heightM ?? observation.height_m, 'height_m'),
    canopyM: optionalFiniteNumber(observation.canopyM ?? observation.canopy_m, 'canopy_m'),
    source: observation.source ?? 'plant_observation',
  });
}

function projectPhenology(phenologyProjection) {
  if (!phenologyProjection) {
    return Object.freeze({
      blooming: null,
      fruiting: null,
      currentPhase: null,
      phases: Object.freeze([]),
      source: null,
    });
  }

  const phases = Array.isArray(phenologyProjection.phases)
    ? phenologyProjection.phases.map((phase) => Object.freeze({
        id: phase.id ?? null,
        label: phase.label ?? null,
        startMonth: phase.startMonth ?? phase.start_month ?? null,
        endMonth: phase.endMonth ?? phase.end_month ?? null,
        active: phase.active === true,
      }))
    : [];

  return Object.freeze({
    blooming: phenologyProjection.blooming ?? null,
    fruiting: phenologyProjection.fruiting ?? null,
    currentPhase: phenologyProjection.currentPhase ?? phenologyProjection.current_phase ?? null,
    phases: Object.freeze(phases),
    source: phenologyProjection.source ?? null,
  });
}

function projectTags(knowledge) {
  if (!knowledge) return Object.freeze([]);

  const raw = knowledge.tags ?? knowledge.displayTags ?? knowledge.display_tags ?? [];
  if (!Array.isArray(raw)) throw new Error('invalid_plant_knowledge_tags');

  const tags = [];
  const seen = new Set();
  for (const item of raw) {
    const value = String(item ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    tags.push(value);
  }

  return Object.freeze(tags);
}

export function buildPlantOverviewViewModel({
  plantId,
  plants = [],
  areas = [],
  media = [],
  plantKnowledge = null,
  plantObservation = null,
  phenologyProjection = null,
  plantedOn = null,
  latestNote = null,
} = {}) {
  const base = buildPlantDetailBaseViewModel({
    plantId,
    plants,
    areas,
    media,
    activeTab: 'overview',
  });
  assertPlantDetailIdentity(base);

  const knowledge = requireMatchingKnowledge(base.plant, plantKnowledge);
  const measurements = projectPersonalMeasurements(plantObservation);
  const phenology = projectPhenology(phenologyProjection);

  const explicitPlantedOn = plantedOn == null ? null : String(plantedOn);

  return Object.freeze({
    ...base,
    tags: projectTags(knowledge),
    plantedOn: explicitPlantedOn,
    addedToCruvitAt: base.plant.addedAt,
    latestNote: latestNote == null ? null : String(latestNote),
    measurements,
    phenology,
    knowledge: knowledge
      ? Object.freeze({
          slug: knowledge.slug ?? knowledge.canonicalSlug ?? null,
          scientificName: knowledge.scientificName ?? knowledge.scientific_name ?? null,
          source: knowledge.source ?? knowledge.authorityRef ?? null,
        })
      : null,
  });
}

export function assertOverviewNoSilentInference(viewModel) {
  if (!viewModel?.plant?.id) throw new Error('plant_overview_identity_required');

  if (viewModel.measurements.heightM != null && !viewModel.measurements.source) {
    throw new Error('height_source_required');
  }

  if (viewModel.measurements.canopyM != null && !viewModel.measurements.source) {
    throw new Error('canopy_source_required');
  }

  if (
    (viewModel.phenology.blooming != null ||
      viewModel.phenology.fruiting != null ||
      viewModel.phenology.currentPhase != null) &&
    !viewModel.phenology.source
  ) {
    throw new Error('phenology_source_required');
  }

  return true;
}
