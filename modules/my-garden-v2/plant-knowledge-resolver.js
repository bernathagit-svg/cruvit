export function resolvePlantKnowledge(plantInstance, catalogRow) {
  if (!plantInstance?.id) throw new Error('plant_instance_required');

  const slug = plantInstance.profileSlug ?? plantInstance.profile_slug ?? null;

  if (!slug) {
    return Object.freeze({
      available: false,
      reason: 'plant_instance_has_no_canonical_slug',
      slug: null,
      knowledge: null,
    });
  }

  if (!catalogRow) {
    return Object.freeze({
      available: false,
      reason: 'catalog_slug_not_found',
      slug,
      knowledge: null,
    });
  }

  if (catalogRow.slug !== slug) {
    throw new Error(
      'catalog_slug_mismatch:' + slug + ':' + String(catalogRow.slug ?? '')
    );
  }

  return Object.freeze({
    available: true,
    reason: null,
    slug,
    knowledge: Object.freeze({
      id: catalogRow.id ?? null,
      slug: catalogRow.slug,
      scientificName: catalogRow.scientific_name ?? null,
      commonNames: catalogRow.common_names ?? {},
      aliases: catalogRow.aliases ?? [],
      climateTraits: catalogRow.climate_traits ?? {},
      floweringRequirements: catalogRow.flowering_requirements ?? null,
      fruitingRequirements: catalogRow.fruiting_requirements ?? null,
      verificationState: catalogRow.verification_state ?? null,
      needsReview: catalogRow.needs_review === true,
      media: catalogRow.media ?? {},
      mediaStatus: catalogRow.media_status ?? null,
      catalogVersion: catalogRow.catalog_version ?? null,
      sourcePacket: catalogRow.source_packet ?? null,
    }),
  });
}

export function knowledgeCanDriveVerifiedUI(resolution) {
  if (!resolution?.available || !resolution.knowledge) return false;
  return (
    resolution.knowledge.verificationState === 'verified' &&
    resolution.knowledge.needsReview !== true
  );
}
