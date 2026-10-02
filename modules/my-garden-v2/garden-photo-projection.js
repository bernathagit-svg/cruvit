function eligibleGardenOverview(media, gardenProfileId) {
  return (
    media?.garden_profile_id === gardenProfileId &&
    media?.garden_plant_id == null &&
    media?.purpose === 'garden_overview' &&
    media?.validation_state === 'validated'
  );
}

export function resolveGardenPhoto({
  gardenProfile,
  media = [],
} = {}) {
  if (!gardenProfile?.id) throw new Error('garden_profile_required');
  const gardenId = gardenProfile.id;

  const explicitId =
    gardenProfile.cover_media_id ??
    gardenProfile.garden_photo_media_id ??
    gardenProfile.overview_media_id ??
    null;

  const candidates = media.filter((row) => eligibleGardenOverview(row, gardenId));

  if (explicitId) {
    const selected = candidates.find((row) => row.id === explicitId);
    if (!selected) {
      return Object.freeze({
        kind: 'system',
        mediaId: null,
        reason: 'explicit_garden_photo_unavailable',
        candidateCount: candidates.length,
      });
    }

    return Object.freeze({
      kind: 'personal',
      mediaId: selected.id,
      storageBucket: selected.storage_bucket ?? null,
      storagePath: selected.storage_path ?? null,
      reason: null,
      candidateCount: candidates.length,
    });
  }

  if (candidates.length === 1) {
    // Safe transitional behavior: one and only one valid garden overview exists.
    const selected = candidates[0];
    return Object.freeze({
      kind: 'personal',
      mediaId: selected.id,
      storageBucket: selected.storage_bucket ?? null,
      storagePath: selected.storage_path ?? null,
      reason: 'single_unambiguous_candidate',
      candidateCount: 1,
    });
  }

  if (candidates.length > 1) {
    return Object.freeze({
      kind: 'system',
      mediaId: null,
      reason: 'multiple_garden_photos_no_current_pointer',
      candidateCount: candidates.length,
    });
  }

  return Object.freeze({
    kind: 'system',
    mediaId: null,
    reason: 'no_personal_garden_photo',
    candidateCount: 0,
  });
}

export function gardenPhotoWriteGate(gardenProfile) {
  const hasFirstClassPointer =
    Object.prototype.hasOwnProperty.call(gardenProfile || {}, 'cover_media_id') ||
    Object.prototype.hasOwnProperty.call(gardenProfile || {}, 'garden_photo_media_id') ||
    Object.prototype.hasOwnProperty.call(gardenProfile || {}, 'overview_media_id');

  return Object.freeze({
    blocked: !hasFirstClassPointer,
    code: hasFirstClassPointer ? null : 'GARDEN_CURRENT_PHOTO_POINTER_MISSING',
  });
}
