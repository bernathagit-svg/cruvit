function requireText(value, code) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(code);
  return s;
}

export function preparePlantLifecycleIntent({
  gardenProfileId,
  plant,
  action,
} = {}) {
  const gardenId = requireText(gardenProfileId, 'garden_profile_id_required');
  if (!plant || typeof plant !== 'object') throw new Error('plant_required');
  const plantId = requireText(plant.id, 'plant_id_required');

  if (plant.garden_profile_id && plant.garden_profile_id !== gardenId) {
    throw new Error('plant_garden_mismatch');
  }

  if (action !== 'archive' && action !== 'restore') {
    throw new Error('unsupported_plant_lifecycle_action');
  }

  const currentlyArchived = plant.archived === true;
  if (action === 'archive' && currentlyArchived) {
    return Object.freeze({
      action,
      gardenProfileId: gardenId,
      plantId,
      fromArchived: true,
      toArchived: true,
      unchanged: true,
      eventType: 'plant_archived',
      clonePlant: false,
      deletePlant: false,
    });
  }

  if (action === 'restore' && !currentlyArchived) {
    return Object.freeze({
      action,
      gardenProfileId: gardenId,
      plantId,
      fromArchived: false,
      toArchived: false,
      unchanged: true,
      eventType: 'plant_restored',
      clonePlant: false,
      deletePlant: false,
    });
  }

  return Object.freeze({
    action,
    gardenProfileId: gardenId,
    plantId,
    fromArchived: currentlyArchived,
    toArchived: action === 'archive',
    unchanged: false,
    eventType: action === 'archive' ? 'plant_archived' : 'plant_restored',
    clonePlant: false,
    deletePlant: false,
  });
}

export function plantLifecycleWriteGate(intent) {
  if (!intent?.plantId) throw new Error('plant_lifecycle_intent_required');

  // Current Garden OS Spine V1 knows plant_archived but does not yet define
  // plant_restored. Because the approved UX promises reversible archive with
  // auditable history in both directions, keep the live pair blocked until
  // the event contract supports both transitions.
  return Object.freeze({
    blocked: true,
    code: 'PLANT_RESTORE_EVENT_TYPE_NOT_IN_SPINE_V1',
    missingEventType: 'plant_restored',
    samePlantIdRequired: true,
  });
}

export function assertLifecyclePreservesIdentity(intent) {
  if (!intent?.plantId) throw new Error('plant_lifecycle_intent_required');
  if (intent.clonePlant !== false) throw new Error('archive_must_not_clone_plant');
  if (intent.deletePlant !== false) throw new Error('archive_must_not_delete_plant');
  return true;
}
