const ELIGIBLE_COVER_PURPOSES = new Set(['plant_profile', 'progress_photo']);

function requireText(value, code) {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(code);
  return s;
}

export function prepareSetPlantCoverIntent({
  gardenProfileId,
  plantId,
  media,
} = {}) {
  const gardenId = requireText(gardenProfileId, 'garden_profile_id_required');
  const exactPlantId = requireText(plantId, 'plant_id_required');

  if (!media || typeof media !== 'object') throw new Error('media_required');
  if (media.garden_profile_id !== gardenId) {
    throw new Error('cover_media_garden_mismatch');
  }
  if (media.garden_plant_id !== exactPlantId) {
    throw new Error('cover_media_plant_mismatch');
  }
  if (media.validation_state !== 'validated') {
    throw new Error('cover_media_must_be_validated');
  }
  if (!ELIGIBLE_COVER_PURPOSES.has(media.purpose)) {
    throw new Error('cover_media_purpose_not_allowed');
  }

  return Object.freeze({
    action: 'set_personal_cover',
    gardenProfileId: gardenId,
    plantId: exactPlantId,
    coverMediaId: requireText(media.id, 'media_id_required'),
    deleteMedia: false,
  });
}

export function prepareRestoreSystemPhotoIntent({
  gardenProfileId,
  plantId,
} = {}) {
  return Object.freeze({
    action: 'restore_system_photo',
    gardenProfileId: requireText(gardenProfileId, 'garden_profile_id_required'),
    plantId: requireText(plantId, 'plant_id_required'),
    coverMediaId: null,
    deleteMedia: false,
  });
}

export function assertPhotoIntentPreservesHistory(intent) {
  if (!intent?.plantId) throw new Error('photo_intent_plant_required');
  if (intent.deleteMedia !== false) throw new Error('cover_change_must_not_delete_history_media');
  return true;
}
