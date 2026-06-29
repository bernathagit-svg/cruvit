import { clamp, stringArray, text } from './utils.mjs';
import { cleanProfileArrays } from './providers/openai.mjs';

export function buildBaseProfile({ rawQuery, taxon, summary, imageUrl, confidence }) {
  const scientificName = text(taxon.scientificName || taxon.canonicalName || taxon.name);
  const canonicalName = text(taxon.canonicalName || scientificName);
  const commonName = text(taxon.vernacularName || canonicalName || rawQuery);
  const rank = String(taxon.rank || '').toUpperCase();
  const broadMatch = ['GENUS', 'FAMILY'].includes(rank);

  return {
    isPlant: true,
    commonName,
    hebrewName: /[\u0590-\u05FF]/.test(rawQuery) ? rawQuery : '',
    scientificName,
    confidence: clamp(confidence || 0.84, 0.55, 0.99),
    taxonRank: text(taxon.rank),
    taxonKey: taxon.usageKey || taxon.key || '',
    family: text(taxon.family),
    genus: text(taxon.genus),
    source: 'Cruvit Botanical Engine v2 — GBIF verified taxonomy',
    imageUrl: imageUrl || '',
    imageSearchQuery: text(scientificName || commonName)
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .split(/\s+/)
      .slice(0, 2)
      .join(' '),
    icon: '🌿',
    sun: broadMatch
      ? 'Light needs vary by species; confirm the exact species or cultivar.'
      : 'Match light exposure to the confirmed species and local climate.',
    water: broadMatch
      ? 'Watering varies by species; confirm the exact plant and check soil moisture before watering.'
      : 'Water according to season, soil drainage, plant age and local weather.',
    soil: 'Use soil appropriate to the confirmed species; good drainage is essential for many garden plants.',
    growth: broadMatch ? 'Growth habit varies across this taxonomic group.' : 'Growth depends on climate, light, soil and cultivar.',
    size: broadMatch ? 'Mature size can vary widely; identify the exact species before planting.' : 'Check mature height, width and root spread before planting.',
    climateFit: 'Location-specific suitability requires the user location and the exact species or cultivar.',
    seasonCare: 'Cruvit should generate seasonal care only when it is relevant to this plant and local conditions.',
    warnings: [
      broadMatch ? 'This is a broad taxonomic match; confirm the exact species or cultivar.' : 'Confirm the exact cultivar before purchase or treatment.',
      'Check toxicity to children and pets for the exact species.',
      'Check mature root spread before planting near structures or pipes.'
    ],
    tasks: [
      'Confirm exact species or cultivar',
      'Check light, drainage and planting space',
      'Inspect the plant weekly during establishment'
    ],
    guide: text(summary?.extract) || `${commonName} was verified as a botanical plant taxon (${scientificName}). Confirm the exact species or cultivar before applying detailed care, treatment or purchasing decisions.`,
    shoppingProducts: ['Compost or soil amendment', 'Mulch', 'Balanced fertilizer']
  };
}

export function mergeCareProfile(base, aiProfile) {
  if (!aiProfile || aiProfile.isPlant === false) return base;
  const arrays = cleanProfileArrays(aiProfile);

  return {
    ...base,
    commonName: text(aiProfile.commonName || aiProfile.common_name, base.commonName),
    hebrewName: text(aiProfile.hebrewName || aiProfile.hebrew_name, base.hebrewName),
    scientificName: base.scientificName,
    confidence: clamp(aiProfile.confidence || base.confidence, 0.55, 0.99),
    icon: text(aiProfile.icon, base.icon),
    sun: text(aiProfile.sun || aiProfile.light, base.sun),
    water: text(aiProfile.water || aiProfile.watering, base.water),
    soil: text(aiProfile.soil, base.soil),
    growth: text(aiProfile.growth, base.growth),
    size: text(aiProfile.size, base.size),
    climateFit: text(aiProfile.climateFit || aiProfile.climate_fit || aiProfile.climate, base.climateFit),
    seasonCare: text(aiProfile.seasonCare || aiProfile.season, base.seasonCare),
    pruning: text(aiProfile.pruning, base.pruning || ''),
    fertilizer: text(aiProfile.fertilizer, base.fertilizer || ''),
    warnings: arrays.warnings.length ? arrays.warnings : base.warnings,
    tasks: arrays.tasks.length ? arrays.tasks : base.tasks,
    guide: text(aiProfile.guide || aiProfile.careGuide || aiProfile.description, base.guide),
    shoppingProducts: arrays.shoppingProducts.length ? arrays.shoppingProducts : base.shoppingProducts,
    source: 'Cruvit Botanical Engine v2 — GBIF identity + AI care profile'
  };
}
