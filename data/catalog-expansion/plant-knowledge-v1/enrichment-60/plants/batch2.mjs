/**
 * Plant Knowledge & Warnings — Batch 2 enrichment (30 plants).
 * Free/open authoritative sources only. Not imported by product runtime UI.
 */

import {
  provenancedField,
  EVIDENCE_CLASS,
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
  src,
  warning,
  baseKnowledge
} from '../shared.mjs';

/** Explicit UNKNOWN pet toxicity — never invent from related taxa. */
function unknownPetToxicity(reason) {
  return {
    dogToxicity: provenancedField(null, 'UNKNOWN', [], reason),
    catToxicity: provenancedField(null, 'UNKNOWN', [], reason),
    livestockToxicity: provenancedField(null, 'UNKNOWN', [], reason)
  };
}

/** Culinary herb skeleton: edible HEURISTIC; pet toxicity UNKNOWN. */
function culinaryHerbKnowledge(sources, edibleParts, leafExcerpt) {
  const k = baseKnowledge(sources);
  Object.assign(k.toxicity, unknownPetToxicity('Culinary herb — pet toxicity not asserted without taxon-specific veterinary toxicology.'));
  k.toxicity.humanToxicity = provenancedField(
    null,
    'UNKNOWN',
    [],
    'Common culinary use is not a clinical non-toxicity certification.'
  );
  k.harvestUseWarnings = {
    edibleParts: provenancedField(edibleParts, 'HEURISTIC_ASSERTION', sources.map((s) => s.sourceId), leafExcerpt),
    inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Inedible-part list not asserted beyond culinary leaf/seed use.')
  };
  return k;
}

export const BATCH2_ENRICHMENT_PLANTS = [
  {
    slug: 'hazelnut',
    scientific: 'Corylus avellana',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-corylus-avellana',
          'North Carolina State University Extension Gardener',
          'Corylus avellana (European Hazel)',
          'https://plants.ces.ncsu.edu/plants/corylus-avellana/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Corylus avellana in this packet.'),
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Nut crop — no positive safety certification beyond food-crop use of kernels.'
        )
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['ncsu-corylus-avellana'],
          'Compatible pollinizer cultivars improve nut set for many hazelnut plantings.'
        ),
        affectedTraits: provenancedField(
          ['pollinator_requirement', 'self_fertility'],
          'HEURISTIC_ASSERTION',
          ['ncsu-corylus-avellana'],
          'Wind-pollinated; compatible cultivars recommended for crop.'
        ),
        explanation: provenancedField(
          'Monoecious but often not reliably self-fruitful for commercial nut set without compatible pollen.',
          'HEURISTIC_ASSERTION',
          ['ncsu-corylus-avellana'],
          'Provisional pollination caveat pending cultivar-specific charts.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['nuts_kernels'],
          'HEURISTIC_ASSERTION',
          ['ncsu-corylus-avellana'],
          'Grown as a nut crop; kernels are the harvested food portion.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Shell/husk edibility not asserted.')
      },
      warnings: [
        warning({
          warningId: 'hazelnut-pollinizer',
          category: 'pollination',
          canonicalTitle: 'Hazelnut — pollinizer often required',
          summary:
            'Hazelnut flowers are monoecious; reliable nut crops often need compatible pollinizer cultivars.',
          severity: 'INFO',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['ncsu-corylus-avellana']
        })
      ]
    }
  },

  {
    slug: 'chestnut',
    scientific: 'Castanea sativa',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-castanea-sativa',
          'Royal Horticultural Society',
          'Castanea sativa (sweet chestnut)',
          'https://www.rhs.org.uk/plants/3143/castanea-sativa/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Castanea sativa in this packet.'),
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Edible Castanea nuts when correctly identified — not a clinical non-toxicity proof for all plant parts.'
        )
      },
      physicalHazards: {
        spines: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['rhs-castanea-sativa'],
          'RHS: Spiny husks enclosing edible nuts ripen in autumn.'
        ),
        handlingPrecautions: provenancedField(
          'Handle spiny involucres (burs) with gloves when harvesting nuts.',
          'HEURISTIC_ASSERTION',
          ['rhs-castanea-sativa'],
          'Derived from spiny-husk morphology.'
        )
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-castanea-sativa'],
          'Wind-pollinated catkins; nut set often improved with compatible pollen sources.'
        ),
        affectedTraits: provenancedField(
          ['pollinator_requirement'],
          'HEURISTIC_ASSERTION',
          ['rhs-castanea-sativa'],
          'RHS describes wind-pollinated flowers; pairing for crop is cultivar/site dependent.'
        ),
        explanation: provenancedField(
          'Species-level monoecy does not guarantee reliable single-tree nut crops.',
          'HEURISTIC_ASSERTION',
          ['rhs-castanea-sativa'],
          'Provisional pollination caveat.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['nuts_kernels'],
          'SOURCE_SUPPORTED',
          ['rhs-castanea-sativa'],
          'RHS: Spiny husks enclosing edible nuts ripen in autumn.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Burs/leaves not asserted as food.')
      },
      importantNotes: [
        {
          noteId: 'chestnut-not-horse-chestnut',
          value:
            'Do not confuse edible Castanea (true chestnut) with Aesculus (horse chestnut / buckeye), which is a different genus and is not a Castanea food crop.',
          evidenceClass: 'HEURISTIC_ASSERTION',
          sourceIds: ['rhs-castanea-sativa'],
          shortExcerpt:
            'Identity caveat: Castanea sativa is sweet chestnut; Aesculus lookalikes are outside this taxon.',
          status: 'asserted'
        }
      ],
      warnings: [
        warning({
          warningId: 'chestnut-pollination-cultivar',
          category: 'pollination',
          canonicalTitle: 'Chestnut — pollination / pairing caveat',
          summary:
            'Sweet chestnut is wind-pollinated; reliable nut crops often benefit from compatible pollen sources rather than assuming one tree is enough.',
          severity: 'INFO',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-castanea-sativa']
        }),
        warning({
          warningId: 'chestnut-lookalike-identity',
          category: 'important_note',
          canonicalTitle: 'Chestnut — not horse chestnut (Aesculus)',
          summary:
            'Confirm Castanea identity before eating nuts. Horse chestnut (Aesculus) is a different genus and must not be treated as sweet chestnut.',
          severity: 'CAUTION',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-castanea-sativa']
        })
      ]
    }
  },

  {
    slug: 'pecan',
    scientific: 'Carya illinoinensis',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-carya-illinoinensis',
          'North Carolina State University Extension Gardener',
          'Carya illinoinensis (Hardy Pecan)',
          'https://plants.ces.ncsu.edu/plants/carya-illinoinensis/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Carya illinoinensis in this packet.'),
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Nut crop — no positive safety certification beyond food-crop use of kernels.'
        )
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['ncsu-carya-illinoinensis'],
          'Pecan cultivars differ in dichogamy type (protandrous/protogynous); compatible pairs improve nut set.'
        ),
        affectedTraits: provenancedField(
          ['pollinator_requirement', 'self_fertility', 'chill_requirement'],
          'HEURISTIC_ASSERTION',
          ['ncsu-carya-illinoinensis'],
          'Cultivar charts govern pollen shed / receptivity timing.'
        ),
        explanation: provenancedField(
          'Species-level monoecy does not imply a single tree is sufficient for reliable crops.',
          'HEURISTIC_ASSERTION',
          ['ncsu-carya-illinoinensis'],
          'Cultivar-dependent pollination caveat.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['nuts_kernels'],
          'SOURCE_SUPPORTED',
          ['ncsu-carya-illinoinensis'],
          'NCSU: Sweet edible nuts with a husk that splits into four sections when they ripen in the fall.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Husk/shell edibility not asserted.')
      },
      warnings: [
        warning({
          warningId: 'pecan-cultivar-pollination',
          category: 'cultivar_caveat',
          canonicalTitle: 'Pecan — cultivar pollination pairing',
          summary:
            'Pecan nut set is commonly cultivar-dependent (dichogamy). Pair compatible cultivars rather than assuming one tree is enough.',
          severity: 'INFO',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['ncsu-carya-illinoinensis']
        })
      ]
    }
  },

  {
    slug: 'medlar',
    scientific: 'Mespilus germanica',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-mespilus-germanica',
          'Royal Horticultural Society',
          'Mespilus germanica (medlar)',
          'https://www.rhs.org.uk/plants/10442/mespilus-germanica/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Mespilus germanica in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Fruit crop — not a clinical non-toxicity proof.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['fruit_after_bletting'],
          'SOURCE_SUPPORTED',
          ['rhs-mespilus-germanica'],
          'RHS: Brown fruit edible after bletting in late autumn.'
        ),
        harvestCautions: provenancedField(
          'Fruit is typically eaten after bletting (softening), not as hard unripe fruit.',
          'SOURCE_SUPPORTED',
          ['rhs-mespilus-germanica'],
          'Edible after bletting in late autumn.'
        )
      },
      warnings: []
    }
  },

  {
    slug: 'serviceberry',
    scientific: 'Amelanchier canadensis',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-amelanchier-canadensis',
          'North Carolina State University Extension Gardener',
          'Amelanchier canadensis (Canadian Serviceberry)',
          'https://plants.ces.ncsu.edu/plants/amelanchier-canadensis/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Amelanchier canadensis in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Berry crop — not a clinical non-toxicity proof for all parts.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_berries'],
          'SOURCE_SUPPORTED',
          ['ncsu-amelanchier-canadensis'],
          'NCSU: Edible red to purple berries in early summer; sweet flavor when fully ripe.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Non-fruit parts not certified edible here.')
      },
      warnings: []
    }
  },

  {
    slug: 'blackberry',
    scientific: 'Rubus fruticosus',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-rubus-fruticosus',
          'Royal Horticultural Society',
          'Rubus fruticosus (blackberry)',
          'https://www.rhs.org.uk/plants/16283/rubus-fruticosus/details',
          'horticultural_society'
        ),
        src(
          'cabi-rubus-fruticosus',
          'CABI Invasive Species Compendium',
          'Rubus fruticosus (blackberry)',
          'https://www.cabidigitallibrary.org/doi/10.1079/cabicompendium.48006',
          'invasive_species_authority'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Rubus fruticosus in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Berry crop — not a clinical non-toxicity proof for all parts.')
      },
      physicalHazards: {
        thorns: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-rubus-fruticosus'],
          'Bramble / blackberry canes typically bear prickles; handling hazard for gardeners.'
        ),
        handlingPrecautions: provenancedField(
          'Wear gloves and long sleeves when pruning or harvesting thorny cultivars.',
          'HEURISTIC_ASSERTION',
          ['rhs-rubus-fruticosus'],
          'Derived from typical Rubus cane morphology.'
        )
      },
      invasiveness: {
        invasiveStatus: provenancedField(
          'invasive_in_regions',
          'SOURCE_SUPPORTED',
          ['cabi-rubus-fruticosus'],
          'CABI ISC documents Rubus fruticosus aggregate as invasive / weed risk outside parts of its native range.',
          {
            regionScope: {
              level: 'REGION',
              codes: ['AU', 'NZ', 'US-West'],
              label: 'Selected documented invasive/weed-risk jurisdictions (illustrative)',
              note: 'Not a global invasive label — region-scoped only. Verify local regulation.'
            }
          }
        ),
        invasiveRegions: provenancedField(
          ['Australia', 'New Zealand', 'parts of western North America'],
          'HEURISTIC_ASSERTION',
          ['cabi-rubus-fruticosus'],
          'Illustrative regional labels from ISC-style documentation — not exhaustive.'
        )
      },
      regionalRestrictions: [],
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_aggregate_fruit'],
          'SOURCE_SUPPORTED',
          ['rhs-rubus-fruticosus'],
          'RHS: Black aggregate fruit follows flowers on second-year canes.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Leaves/canes not asserted as food.')
      },
      warnings: [
        warning({
          warningId: 'blackberry-thorns',
          category: 'physical_hazard',
          canonicalTitle: 'Blackberry — thorny canes',
          summary: 'Blackberry / bramble canes commonly bear prickles that can scratch skin during pruning and harvest.',
          severity: 'CAUTION',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-rubus-fruticosus']
        }),
        warning({
          warningId: 'blackberry-regional-invasive',
          category: 'invasiveness',
          canonicalTitle: 'Blackberry — regionally invasive aggregate',
          summary:
            'Rubus fruticosus aggregate is documented as invasive/weed risk in some jurisdictions. Check local guidance before planting; not a global invasive label.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: {
            level: 'REGION',
            codes: ['AU', 'NZ', 'US-West'],
            label: 'Selected documented jurisdictions',
            note: 'Region-scoped only.'
          },
          sourceIds: ['cabi-rubus-fruticosus'],
          requiresOwnerReview: true,
          status: 'owner_review'
        })
      ]
    }
  },

  {
    slug: 'blackcurrant',
    scientific: 'Ribes nigrum',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-ribes-nigrum',
          'Royal Horticultural Society',
          'Ribes nigrum (blackcurrant)',
          'https://www.rhs.org.uk/plants/14128/ribes-nigrum/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Ribes nigrum in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Berry crop — not a clinical non-toxicity proof.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_berries'],
          'SOURCE_SUPPORTED',
          ['rhs-ribes-nigrum'],
          'RHS: Black berries in mid-summer.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Non-fruit parts not certified edible here.')
      },
      warnings: []
    }
  },

  {
    slug: 'cranberry',
    scientific: 'Vaccinium macrocarpon',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-vaccinium-macrocarpon',
          'North Carolina State University Extension Gardener',
          'Vaccinium macrocarpon (American Cranberry)',
          'https://plants.ces.ncsu.edu/plants/vaccinium-macrocarpon/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Vaccinium macrocarpon in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Berry crop — not a clinical non-toxicity proof.')
      },
      soilRequirements: {
        acidicSoil: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-vaccinium-macrocarpon'],
          'NCSU: Grows in acidic bog soils that stay moist.'
        )
      },
      plantingRequirements: {
        moisture: provenancedField(
          'high_bog_or_irrigated',
          'SOURCE_SUPPORTED',
          ['ncsu-vaccinium-macrocarpon'],
          'Native to bogs; requires consistently moist / acidic conditions.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_berries'],
          'SOURCE_SUPPORTED',
          ['ncsu-vaccinium-macrocarpon'],
          'NCSU: Red berries ripen in autumn.'
        ),
        requiresCooking: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['ncsu-vaccinium-macrocarpon'],
          'Cranberries are commonly cooked or sweetened; raw culinary preference varies.'
        )
      },
      warnings: []
    }
  },

  {
    slug: 'elderberry',
    scientific: 'Sambucus canadensis',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-sambucus-canadensis',
          'North Carolina State University Extension Gardener',
          'Sambucus canadensis (American Elder)',
          'https://plants.ces.ncsu.edu/plants/sambucus-canadensis/',
          'university_extension'
        ),
        src(
          'uf-ifas-elderberry',
          'University of Florida IFAS Extension',
          'Elderberry',
          'https://gardeningsolutions.ifas.ufl.edu/plants/edibles/fruits/elderberry/',
          'university_extension'
        )
      ]),
      toxicity: {
        humanToxicity: provenancedField(
          'mixed_edible_toxic_parts',
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'NCSU: Unripe fruit, leaves, and stems poisonous (cyanogenic glycoside). Ripe cooked berries used as food. UF/IFAS: avoid green berries; cook ripe fruit.'
        ),
        childRisk: provenancedField(
          'elevated_if_unripe_or_vegetative_parts_ingested',
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis'],
          'Unripe fruit, leaves, and stems poisonous — elevated risk if children access those parts.'
        ),
        ...unknownPetToxicity('Pet toxicity for Sambucus canadensis not asserted without ASPCA/veterinary SOURCE_SUPPORTED for this taxon.'),
        toxicParts: provenancedField(
          ['unripe_fruit', 'leaves', 'stems'],
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Unripe/green berries, leaves, and stems — poisonous / avoid; cyanogenic glycoside noted by NCSU.'
        ),
        exposureRoutes: provenancedField(
          ['ingestion'],
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis'],
          'Poisonous if ingested (unripe fruit, leaves, stems).'
        ),
        severity: provenancedField(
          'WARNING',
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Mixed edible/toxic parts: cook ripe berries; do not eat unripe fruit or vegetative parts.'
        ),
        symptomsSummary: provenancedField(null, 'UNKNOWN', [], 'Clinical symptom list not asserted in this packet.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_cooked_berries', 'flowers_in_some_culinary_uses'],
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Cooked ripe berries are the supported food use; UF/IFAS advises cooking ripe fruit.'
        ),
        inedibleParts: provenancedField(
          ['unripe_fruit', 'leaves', 'stems'],
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Unripe/green berries, leaves, and stems poisonous / avoid.'
        ),
        requiresCooking: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Cook ripe fruit before eating; do not rely on raw unripe/green berries.'
        ),
        harvestCautions: provenancedField(
          'Harvest only fully ripe berries; cook before eating. Do not ingest leaves, stems, or green/unripe fruit.',
          'SOURCE_SUPPORTED',
          ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry'],
          'Mixed edible/toxic parts guidance from NCSU and UF/IFAS.'
        )
      },
      warnings: [
        warning({
          warningId: 'elderberry-mixed-edible-toxic',
          category: 'toxicity',
          canonicalTitle: 'Elderberry — mixed edible / toxic parts',
          summary:
            'Ripe elderberries are used as food when cooked. Unripe/green berries, leaves, and stems are poisonous (cyanogenic glycoside). Avoid green berries; cook ripe fruit.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: 'Species-level harvest/toxicity guidance' },
          sourceIds: ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry']
        }),
        warning({
          warningId: 'elderberry-cook-ripe-fruit',
          category: 'harvest_use',
          canonicalTitle: 'Elderberry — cook ripe fruit',
          summary: 'UF/IFAS and NCSU support cooking ripe elderberries; do not eat green/unripe fruit or vegetative parts.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['ncsu-sambucus-canadensis', 'uf-ifas-elderberry']
        })
      ]
    }
  },

  {
    slug: 'sea-buckthorn',
    scientific: 'Hippophae rhamnoides',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-hippophae-rhamnoides',
          'Royal Horticultural Society',
          'Hippophae rhamnoides (sea buckthorn)',
          'https://www.rhs.org.uk/plants/8264/hippophae-rhamnoides/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Hippophae rhamnoides in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Berry crop — not a clinical non-toxicity proof.')
      },
      physicalHazards: {
        thorns: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-hippophae-rhamnoides'],
          'Sea buckthorn is a strongly spiny shrub; thorns/spines are a handling hazard at harvest.'
        ),
        spines: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-hippophae-rhamnoides'],
          'Spiny branchlets typical of Hippophae rhamnoides morphology.'
        ),
        handlingPrecautions: provenancedField(
          'Wear heavy gloves when pruning or harvesting; spines can puncture skin.',
          'HEURISTIC_ASSERTION',
          ['rhs-hippophae-rhamnoides'],
          'Derived from spiny shrub morphology.'
        )
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['rhs-hippophae-rhamnoides'],
          'RHS: Orange berries on female plants in autumn — male and female plants required.'
        ),
        affectedTraits: provenancedField(
          ['pollinator_requirement', 'sex_expression'],
          'SOURCE_SUPPORTED',
          ['rhs-hippophae-rhamnoides'],
          'Dioecious: fruit only on females with a male pollinizer nearby.'
        ),
        explanation: provenancedField(
          'Dioecious species — a single female without a male will not set fruit.',
          'SOURCE_SUPPORTED',
          ['rhs-hippophae-rhamnoides'],
          'Female-only fruit implies need for male pollen source.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_berries'],
          'SOURCE_SUPPORTED',
          ['rhs-hippophae-rhamnoides'],
          'RHS: Orange berries on female plants in autumn.'
        ),
        handlingCautions: provenancedField(
          'Spiny branches make harvest difficult; protect hands and eyes.',
          'HEURISTIC_ASSERTION',
          ['rhs-hippophae-rhamnoides'],
          'Physical hazard during berry harvest.'
        )
      },
      warnings: [
        warning({
          warningId: 'sea-buckthorn-spines',
          category: 'physical_hazard',
          canonicalTitle: 'Sea buckthorn — spines / thorns',
          summary: 'Sea buckthorn bears sharp spines on branches that can injure skin during pruning and harvest.',
          severity: 'CAUTION',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-hippophae-rhamnoides']
        }),
        warning({
          warningId: 'sea-buckthorn-dioecious',
          category: 'pollination',
          canonicalTitle: 'Sea buckthorn — male and female plants',
          summary: 'Dioecious: orange berries form on female plants only when a male pollinizer is present.',
          severity: 'INFO',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-hippophae-rhamnoides']
        })
      ]
    }
  },

  {
    slug: 'soursop',
    scientific: 'Annona muricata',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'uf-ifas-soursop',
          'University of Florida IFAS Extension',
          'Soursop Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG343',
          'university_extension'
        )
      ]),
      toxicity: {
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Seed/leaf toxicity claims are not asserted without dedicated toxicology sources in this packet.'
        ),
        ...unknownPetToxicity('Pet toxicity not asserted for Annona muricata in this packet.')
      },
      plantingRequirements: {
        windProtection: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['uf-ifas-soursop'],
          'Tropical small tree; shelter from cold wind often advised in marginal subtropical sites.'
        ),
        frostSensitivity: provenancedField(
          'high',
          'SOURCE_SUPPORTED',
          ['uf-ifas-soursop'],
          'UF/IFAS: Soursop trees are extremely frost sensitive.'
        ),
        containerSuitability: provenancedField(null, 'UNKNOWN', [], 'Not assessed.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['fruit_pulp'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-soursop'],
          'UF/IFAS home-landscape guide treats soursop as a fruit crop (pulp).'
        ),
        inedibleParts: provenancedField(
          ['seeds'],
          'HEURISTIC_ASSERTION',
          ['uf-ifas-soursop'],
          'Seeds are not eaten with pulp; toxicology not SOURCE_SUPPORTED in this packet.'
        )
      },
      importantNotes: [
        {
          noteId: 'soursop-frost',
          value: 'Frost-sensitive tropical fruit — climate suitability remains governed by botanical climate traits.',
          evidenceClass: 'SOURCE_SUPPORTED',
          sourceIds: ['uf-ifas-soursop'],
          shortExcerpt: 'UF/IFAS soursop home landscape guidance for frost-free climates.',
          status: 'asserted'
        }
      ],
      warnings: [
        warning({
          warningId: 'soursop-seed-caution-unconfirmed',
          category: 'harvest_use',
          canonicalTitle: 'Soursop — seed caution unresolved',
          summary:
            'Seeds are not consumed with fruit pulp. Formal seed toxicity class remains UNKNOWN in this foundation packet — not a confirmed severe warning.',
          severity: 'SEVERE',
          evidenceClass: 'UNKNOWN',
          regionScope: { level: 'UNKNOWN', codes: [], label: null },
          sourceIds: [],
          status: 'unknown'
        })
      ]
    }
  },

  {
    slug: 'sapodilla',
    scientific: 'Manilkara zapota',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'uf-ifas-sapodilla',
          'University of Florida IFAS Extension',
          'Sapodilla Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG051',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Manilkara zapota in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Fruit crop — not a clinical non-toxicity proof.')
      },
      plantingRequirements: {
        frostSensitivity: provenancedField(
          'high',
          'SOURCE_SUPPORTED',
          ['uf-ifas-sapodilla'],
          'UF/IFAS: Sapodilla trees are injured by frost and freeze.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_fruit'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-sapodilla'],
          'UF/IFAS: Fruit is brown, sweet, and sandy-textured when ripe.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Seeds/latex toxicity not asserted here.')
      },
      importantNotes: [
        {
          noteId: 'sapodilla-frost',
          value: 'Frost-sensitive tropical/subtropical fruit tree — protect from freeze, especially when young.',
          evidenceClass: 'SOURCE_SUPPORTED',
          sourceIds: ['uf-ifas-sapodilla'],
          shortExcerpt: 'Injured by frost and freeze; young trees killed in mid-20s°F.',
          status: 'asserted'
        }
      ],
      warnings: []
    }
  },

  {
    slug: 'tamarind',
    scientific: 'Tamarindus indica',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'uf-ifas-tamarind',
          'University of Florida IFAS Extension',
          'Tamarind Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG056',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Tamarindus indica in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Pod pulp crop — not a clinical non-toxicity proof.')
      },
      plantingRequirements: {
        frostSensitivity: provenancedField(
          'high',
          'SOURCE_SUPPORTED',
          ['uf-ifas-tamarind'],
          'UF/IFAS: Tamarind trees are damaged by frost and freezes.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['pod_pulp'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-tamarind'],
          'UF/IFAS: Brown indehiscent pods contain sweet-tart pulp.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Seeds/other parts not certified edible here.')
      },
      importantNotes: [
        {
          noteId: 'tamarind-frost',
          value: 'Frost-sensitive tropical tree; young trees need freeze protection.',
          evidenceClass: 'SOURCE_SUPPORTED',
          sourceIds: ['uf-ifas-tamarind'],
          shortExcerpt: 'Damaged by frost; young trees killed below about 28°F.',
          status: 'asserted'
        }
      ],
      warnings: []
    }
  },

  {
    slug: 'jujube',
    scientific: 'Ziziphus jujuba',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'uf-ifas-jujube',
          'University of Florida IFAS Extension',
          'Jujube Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG048',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Ziziphus jujuba in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Fruit crop — not a clinical non-toxicity proof.')
      },
      physicalHazards: {
        thorns: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Spine presence varies by cultivar; not asserted as universal for Z. jujuba here.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_fruit'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-jujube'],
          'UF/IFAS: Fruit ripens in late summer to fall.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Non-fruit parts not certified edible here.')
      },
      warnings: []
    }
  },

  {
    slug: 'pitanga',
    scientific: 'Eugenia uniflora',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'uf-ifas-surinam-cherry',
          'University of Florida IFAS Extension',
          'Surinam Cherry Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG055',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Eugenia uniflora in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Fruit crop — not a clinical non-toxicity proof.')
      },
      plantingRequirements: {
        frostSensitivity: provenancedField(
          'high',
          'SOURCE_SUPPORTED',
          ['uf-ifas-surinam-cherry'],
          'UF/IFAS: Surinam cherry is damaged by frost and freezes.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['ripe_fruit'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-surinam-cherry'],
          'UF/IFAS: Fragrant white flowers are followed by ribbed red fruit.'
        ),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Seeds/other parts not certified edible here.')
      },
      importantNotes: [
        {
          noteId: 'pitanga-frost',
          value: 'Frost-sensitive subtropical/tropical shrub — protect from freeze.',
          evidenceClass: 'SOURCE_SUPPORTED',
          sourceIds: ['uf-ifas-surinam-cherry'],
          shortExcerpt: 'Injured by temperatures below 28°F (−2°C).',
          status: 'asserted'
        }
      ],
      warnings: []
    }
  },

  {
    slug: 'asparagus',
    scientific: 'Asparagus officinalis',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-asparagus-officinalis',
          'Royal Horticultural Society',
          'Asparagus officinalis (asparagus)',
          'https://www.rhs.org.uk/plants/1673/asparagus-officinalis/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        // Do NOT use Asparagus densiflorus (asparagus fern) ASPCA page for this taxon.
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Spears are a food crop; whole-plant toxicology not asserted beyond harvest guidance.'
        ),
        ...unknownPetToxicity(
          'Pet toxicity UNKNOWN for Asparagus officinalis — do not transfer Asparagus densiflorus (asparagus fern) ASPCA listings to culinary asparagus.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['young_spears'],
          'HEURISTIC_ASSERTION',
          ['rhs-asparagus-officinalis'],
          'Garden asparagus is grown for edible spring spears; RHS documents the cultivated vegetable use context.'
        ),
        inedibleParts: provenancedField(
          ['berries'],
          'HEURISTIC_ASSERTION',
          ['rhs-asparagus-officinalis'],
          'RHS notes red berries on female plants; berries are generally not eaten as food.'
        ),
        harvestCautions: provenancedField(
          'Harvest young spears; do not eat the red berries that form on female plants.',
          'HEURISTIC_ASSERTION',
          ['rhs-asparagus-officinalis'],
          'Spears edible; berries not a food use.'
        )
      },
      warnings: [
        warning({
          warningId: 'asparagus-berries-not-food',
          category: 'harvest_use',
          canonicalTitle: 'Asparagus — berries generally not eaten',
          summary:
            'Culinary asparagus is harvested as young spears. Red berries on female plants are generally not eaten; pet toxicity remains UNKNOWN (do not use asparagus-fern ASPCA data).',
          severity: 'CAUTION',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-asparagus-officinalis']
        })
      ]
    }
  },

  {
    slug: 'artichoke',
    scientific: 'Cynara cardunculus var. scolymus',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-cynara-cardunculus-scolymus-group',
          'Royal Horticultural Society',
          'Cynara cardunculus Scolymus Group (globe artichoke)',
          'https://www.rhs.org.uk/plants/56390/cynara-cardunculus-scolymus-group/details',
          'horticultural_society'
        ),
        src(
          'ncsu-cynara-cardunculus-scolymus-group',
          'North Carolina State University Extension Gardener',
          'Cynara cardunculus Scolymus Group (Globe Artichoke)',
          'https://plants.ces.ncsu.edu/plants/cynara-cardunculus-scolymus-group/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for globe artichoke in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Vegetable crop — not a clinical non-toxicity proof for all parts.')
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-cynara-cardunculus-scolymus-group'],
          'RHS: Many varieties of globe artichokes are available, varying in plant and bud size and bud colour.'
        ),
        affectedTraits: provenancedField(
          ['fruit_quality', 'mature_size'],
          'HEURISTIC_ASSERTION',
          ['rhs-cynara-cardunculus-scolymus-group'],
          'Cultivar choice affects bud size/colour and plant size.'
        ),
        explanation: provenancedField(
          'Canonical identity is Cynara cardunculus var. scolymus / Scolymus Group — not wild cardoon without Scolymus Group.',
          'HEURISTIC_ASSERTION',
          ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
          'Cultivar-group / infraspecific identity note.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['immature_flower_buds'],
          'SOURCE_SUPPORTED',
          ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
          'RHS: Grown for edible flower buds. NCSU: Unopened buds can be eaten—fleshy phyllaries and heart are edible.'
        ),
        inedibleParts: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Inedible portions of mature thistle heads not fully enumerated here.'
        ),
        harvestCautions: provenancedField(
          'Harvest tight immature flower buds before they open into thistle-like flowers.',
          'SOURCE_SUPPORTED',
          ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
          'Edible use is the unopened bud.'
        )
      },
      warnings: []
    }
  },

  {
    slug: 'rhubarb',
    scientific: 'Rheum rhabarbarum',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'rhs-rheum-rhabarbarum',
          'Royal Horticultural Society',
          'Rheum × hybridum (rhubarb) / Rheum rhabarbarum guidance',
          'https://www.rhs.org.uk/vegetables/rhubarb/grow-your-own',
          'horticultural_society'
        )
      ]),
      toxicity: {
        humanToxicity: provenancedField(
          'leaves_toxic',
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'RHS: Only the leaf stalks (petioles) are eaten; the leaves are poisonous.'
        ),
        toxicParts: provenancedField(
          ['leaves'],
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'Leaves are poisonous; stalks are the edible portion.'
        ),
        dogToxicity: provenancedField(null, 'UNKNOWN', [], 'Pet toxicity not asserted in this packet.'),
        catToxicity: provenancedField(null, 'UNKNOWN', [], 'Pet toxicity not asserted in this packet.'),
        livestockToxicity: provenancedField(null, 'UNKNOWN', [], 'Livestock toxicity not asserted in this packet.'),
        exposureRoutes: provenancedField(
          ['ingestion'],
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'Leaves poisonous if eaten.'
        ),
        severity: provenancedField(
          'WARNING',
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'Leaves poisonous; only leaf stalks are eaten.'
        ),
        symptomsSummary: provenancedField(null, 'UNKNOWN', [], 'Clinical symptom list not asserted in this packet.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['leaf_stalks_petioles'],
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'Only the leaf stalks (petioles) are eaten.'
        ),
        inedibleParts: provenancedField(
          ['leaves'],
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'The leaves are poisonous.'
        ),
        requiresCooking: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['rhs-rheum-rhabarbarum'],
          'Stalks are typically cooked; raw culinary preference varies.'
        ),
        harvestCautions: provenancedField(
          'Do not eat leaves. Harvest stalks only.',
          'SOURCE_SUPPORTED',
          ['rhs-rheum-rhabarbarum'],
          'Leaves poisonous; stalks edible.'
        )
      },
      warnings: [
        warning({
          warningId: 'rhubarb-leaves-toxic',
          category: 'harvest_use',
          canonicalTitle: 'Rhubarb — leaves poisonous',
          summary: 'Rhubarb leaves are poisonous. Only leaf stalks (petioles) are eaten.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['rhs-rheum-rhabarbarum']
        })
      ]
    }
  },

  {
    slug: 'sweet-potato',
    scientific: 'Ipomoea batatas',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-ipomoea-batatas',
          'North Carolina State University Extension Gardener',
          'Ipomoea batatas (Sweet Potato)',
          'https://plants.ces.ncsu.edu/plants/ipomoea-batatas/',
          'university_extension'
        )
      ]),
      toxicity: {
        // Do NOT claim "safe" from missing data
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'No positive safety certification in this packet; cultivated storage roots are a food crop — not a clinical non-toxicity proof.'
        ),
        ...unknownPetToxicity('Pet toxicity not asserted for Ipomoea batatas in this packet — absence of data is not safety.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['storage_roots', 'young_leaves_in_some_cuisines'],
          'HEURISTIC_ASSERTION',
          ['ncsu-ipomoea-batatas'],
          'Grown as a food crop for tuberous roots; leaf edibility varies by cuisine and is not certified here.'
        ),
        inedibleParts: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Inedible-part list not asserted beyond general crop guidance.'
        ),
        harvestCautions: provenancedField(
          'Cure and store roots properly after harvest; avoid damage.',
          'HEURISTIC_ASSERTION',
          ['ncsu-ipomoea-batatas'],
          'Provisional harvest handling note.'
        )
      },
      warnings: []
    }
  },

  {
    slug: 'okra',
    scientific: 'Abelmoschus esculentus',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-abelmoschus-esculentus',
          'North Carolina State University Extension Gardener',
          'Abelmoschus esculentus (Okra)',
          'https://plants.ces.ncsu.edu/plants/abelmoschus-esculentus/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Abelmoschus esculentus in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Vegetable crop — not a clinical non-toxicity proof.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['immature_pods'],
          'SOURCE_SUPPORTED',
          ['ncsu-abelmoschus-esculentus'],
          'NCSU: Edible immature pods harvested throughout summer.'
        ),
        harvestCautions: provenancedField(
          'Harvest immature pods frequently for tenderness; some cultivars have irritating hairs on pods.',
          'HEURISTIC_ASSERTION',
          ['ncsu-abelmoschus-esculentus'],
          'Immature pods are the food use; handling irritation not SOURCE_SUPPORTED here.'
        )
      },
      warnings: []
    }
  },

  {
    slug: 'parsley',
    scientific: 'Petroselinum crispum',
    batch: 2,
    plantKnowledge: {
      ...culinaryHerbKnowledge(
        [
          src(
            'rhs-petroselinum-crispum',
            'Royal Horticultural Society',
            'Petroselinum crispum (parsley)',
            'https://www.rhs.org.uk/plants/14207/petroselinum-crispum/details',
            'horticultural_society'
          )
        ],
        ['leaves'],
        'Culinary biennial herb harvested for foliage (RHS plant profile).'
      ),
      warnings: []
    }
  },

  {
    slug: 'cilantro',
    scientific: 'Coriandrum sativum',
    batch: 2,
    plantKnowledge: {
      ...culinaryHerbKnowledge(
        [
          src(
            'rhs-coriandrum-sativum',
            'Royal Horticultural Society',
            'Coriandrum sativum (coriander)',
            'https://www.rhs.org.uk/plants/1824/coriandrum-sativum/details',
            'horticultural_society'
          )
        ],
        ['leaves', 'seeds'],
        'Culinary annual: leaves (cilantro) and seeds (coriander spice) per RHS profile.'
      ),
      warnings: []
    }
  },

  {
    slug: 'dill',
    scientific: 'Anethum graveolens',
    batch: 2,
    plantKnowledge: {
      ...culinaryHerbKnowledge(
        [
          src(
            'rhs-anethum-graveolens',
            'Royal Horticultural Society',
            'Anethum graveolens (dill)',
            'https://www.rhs.org.uk/plants/703/anethum-graveolens/details',
            'horticultural_society'
          )
        ],
        ['leaves', 'seeds'],
        'Culinary annual: feathery leaves and seeds used as dill spice (RHS).'
      ),
      warnings: []
    }
  },

  {
    slug: 'oregano',
    scientific: 'Origanum vulgare',
    batch: 2,
    plantKnowledge: {
      ...culinaryHerbKnowledge(
        [
          src(
            'rhs-origanum-vulgare',
            'Royal Horticultural Society',
            'Origanum vulgare (oregano)',
            'https://www.rhs.org.uk/plants/11017/origanum-vulgare/details',
            'horticultural_society'
          )
        ],
        ['leaves'],
        'Culinary perennial herb harvested for aromatic leaves (RHS).'
      ),
      warnings: []
    }
  },

  {
    slug: 'chives',
    scientific: 'Allium schoenoprasum',
    batch: 2,
    plantKnowledge: {
      ...culinaryHerbKnowledge(
        [
          src(
            'rhs-allium-schoenoprasum',
            'Royal Horticultural Society',
            'Allium schoenoprasum (chives)',
            'https://www.rhs.org.uk/plants/702/allium-schoenoprasum/details',
            'horticultural_society'
          )
        ],
        ['leaves', 'flowers_in_some_culinary_uses'],
        'Culinary perennial Allium harvested for hollow leaves (RHS).'
      ),
      warnings: []
    }
  },

  {
    slug: 'boxwood',
    scientific: 'Buxus sempervirens',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'aspca-boxwood',
          'ASPCA Animal Poison Control',
          'Boxwood',
          'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/boxwood',
          'veterinary_toxicology'
        ),
        src(
          'ncsu-buxus-sempervirens',
          'North Carolina State University Extension Gardener',
          'Buxus sempervirens (Common Boxwood)',
          'https://plants.ces.ncsu.edu/plants/buxus-sempervirens/',
          'university_extension'
        ),
        src(
          'rhs-buxus-sempervirens',
          'Royal Horticultural Society',
          'Buxus sempervirens (common box)',
          'https://www.rhs.org.uk/plants/2922/buxus-sempervirens/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        dogToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-boxwood'],
          'ASPCA lists Boxwood (Buxus spp.) as toxic to dogs, cats, and horses.'
        ),
        catToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-boxwood'],
          'ASPCA lists Boxwood (Buxus spp.) as toxic to dogs, cats, and horses.'
        ),
        livestockToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-boxwood'],
          'ASPCA lists Boxwood as toxic to horses (and dogs/cats).'
        ),
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Human toxicology class not asserted from ASPCA pet listing alone.'
        ),
        toxicParts: provenancedField(null, 'UNKNOWN', [], 'Toxic-part enumeration not asserted beyond ASPCA species listing.'),
        exposureRoutes: provenancedField(
          ['ingestion'],
          'HEURISTIC_ASSERTION',
          ['aspca-boxwood'],
          'ASPCA toxic-plant listing implies ingestion concern for pets; route details not fully excerpted here.'
        ),
        severity: provenancedField(
          'WARNING',
          'SOURCE_SUPPORTED',
          ['aspca-boxwood'],
          'Toxic to dogs, cats, and horses (ASPCA Buxus spp.).'
        ),
        symptomsSummary: provenancedField(null, 'UNKNOWN', [], 'Clinical symptom list not asserted in this packet.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not an edible crop.'),
        inedibleParts: provenancedField(
          ['all_parts_for_pets'],
          'HEURISTIC_ASSERTION',
          ['aspca-boxwood'],
          'Ornamental shrub; ASPCA toxic listing for pets — not a food plant.'
        )
      },
      pestsAndDiseases: [
        {
          name: 'boxwood blight / box tree moth (regional)',
          evidenceClass: 'HEURISTIC_ASSERTION',
          sourceIds: ['rhs-buxus-sempervirens', 'ncsu-buxus-sempervirens'],
          shortExcerpt: 'Boxwood is widely noted for serious pest/disease pressure in some regions; not an exhaustive pathology list.'
        }
      ],
      warnings: [
        warning({
          warningId: 'boxwood-pet-toxicity',
          category: 'toxicity',
          canonicalTitle: 'Boxwood — toxic to dogs, cats, horses',
          summary: 'ASPCA lists Boxwood (Buxus spp.) as toxic to dogs, cats, and horses. Keep pets from browsing foliage.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: 'Species-level veterinary toxicology (Buxus spp.)' },
          sourceIds: ['aspca-boxwood']
        })
      ]
    }
  },

  {
    slug: 'clematis',
    scientific: 'Clematis viticella',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'aspca-clematis',
          'ASPCA Animal Poison Control',
          'Clematis',
          'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/clematis',
          'veterinary_toxicology'
        ),
        src(
          'rhs-clematis-viticella',
          'Royal Horticultural Society',
          'Clematis viticella (Italian clematis)',
          'https://www.rhs.org.uk/plants/914/clematis-viticella/details',
          'horticultural_society'
        )
      ]),
      toxicity: {
        dogToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-clematis'],
          'ASPCA lists Clematis (Clematis spp.) as toxic to dogs, cats, and horses.'
        ),
        catToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-clematis'],
          'ASPCA lists Clematis (Clematis spp.) as toxic to dogs, cats, and horses.'
        ),
        livestockToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-clematis'],
          'ASPCA lists Clematis as toxic to horses (and dogs/cats).'
        ),
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Human toxicology class not asserted from ASPCA pet listing alone.'
        ),
        toxicParts: provenancedField(null, 'UNKNOWN', [], 'Toxic-part enumeration not asserted beyond ASPCA Clematis spp. listing.'),
        exposureRoutes: provenancedField(
          ['ingestion'],
          'HEURISTIC_ASSERTION',
          ['aspca-clematis'],
          'ASPCA toxic-plant listing implies ingestion concern for pets.'
        ),
        severity: provenancedField(
          'WARNING',
          'SOURCE_SUPPORTED',
          ['aspca-clematis'],
          'Toxic to dogs, cats, and horses (ASPCA Clematis spp.; covers C. viticella as spp.).'
        ),
        symptomsSummary: provenancedField(null, 'UNKNOWN', [], 'Clinical symptom list not asserted in this packet.')
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not an edible crop.'),
        inedibleParts: provenancedField(
          ['ornamental_not_food'],
          'HEURISTIC_ASSERTION',
          ['aspca-clematis'],
          'Ornamental vine; ASPCA toxic listing for pets.'
        )
      },
      warnings: [
        warning({
          warningId: 'clematis-pet-toxicity',
          category: 'toxicity',
          canonicalTitle: 'Clematis — toxic to dogs, cats, horses',
          summary:
            'ASPCA lists Clematis (Clematis spp.) as toxic to dogs, cats, and horses. This genus-level listing covers Clematis viticella.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: 'Genus-level veterinary toxicology (Clematis spp.)' },
          sourceIds: ['aspca-clematis']
        })
      ]
    }
  },

  {
    slug: 'flowering-dogwood',
    scientific: 'Cornus florida',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-cornus-florida',
          'North Carolina State University Extension Gardener',
          'Cornus florida (Flowering Dogwood)',
          'https://plants.ces.ncsu.edu/plants/cornus-florida/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Cornus florida in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Ornamental tree — human toxicity not asserted.')
      },
      pestsAndDiseases: [
        {
          name: 'dogwood anthracnose / borers (common risks)',
          evidenceClass: 'HEURISTIC_ASSERTION',
          sourceIds: ['ncsu-cornus-florida'],
          shortExcerpt: 'Flowering dogwood is widely noted for disease/borer pressure in landscape use; not an exhaustive list.'
        }
      ],
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not treated as a food crop in this packet.'),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Fruit may be wildlife food; human food use not certified here.')
      },
      warnings: []
    }
  },

  {
    slug: 'crepe-myrtle',
    scientific: 'Lagerstroemia indica',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-lagerstroemia-indica',
          'North Carolina State University Extension Gardener',
          'Lagerstroemia indica (Crapemyrtle)',
          'https://plants.ces.ncsu.edu/plants/lagerstroemia-indica/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Lagerstroemia indica in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Ornamental shrub — human toxicity not asserted.')
      },
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['ncsu-lagerstroemia-indica'],
          'Powdery mildew resistance, mature size, and flower color vary strongly by cultivar.'
        ),
        affectedTraits: provenancedField(
          ['disease_resistance', 'mature_size', 'flower_color'],
          'HEURISTIC_ASSERTION',
          ['ncsu-lagerstroemia-indica'],
          'Cultivar charts govern landscape performance.'
        ),
        explanation: provenancedField(
          'Do not generalize mildew susceptibility or size from species alone.',
          'HEURISTIC_ASSERTION',
          ['ncsu-lagerstroemia-indica'],
          'Cultivar-dependent ornamental traits.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not an edible crop.'),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Ornamental only in this packet.')
      },
      warnings: [
        warning({
          warningId: 'crepe-myrtle-cultivar-traits',
          category: 'cultivar_caveat',
          canonicalTitle: 'Crape myrtle — cultivar-dependent traits',
          summary:
            'Mature size, flower color, and powdery mildew resistance vary by cultivar; do not treat species-level notes as universal.',
          severity: 'INFO',
          evidenceClass: 'HEURISTIC_ASSERTION',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['ncsu-lagerstroemia-indica']
        })
      ]
    }
  },

  {
    slug: 'yucca',
    scientific: 'Yucca filamentosa',
    batch: 2,
    plantKnowledge: {
      ...baseKnowledge([
        src(
          'ncsu-yucca-filamentosa',
          'North Carolina State University Extension Gardener',
          "Yucca filamentosa (Adam's Needle)",
          'https://plants.ces.ncsu.edu/plants/yucca-filamentosa/',
          'university_extension'
        )
      ]),
      toxicity: {
        ...unknownPetToxicity('Pet toxicity not asserted for Yucca filamentosa in this packet.'),
        humanToxicity: provenancedField(null, 'UNKNOWN', [], 'Physical hazard emphasized; toxicology class not asserted.')
      },
      physicalHazards: {
        sharpLeaves: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-yucca-filamentosa'],
          'NCSU: Leaves are stiff with sharp tips; filaments along margins.'
        ),
        spines: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-yucca-filamentosa'],
          'Sharp-tipped leaves — handling hazard.'
        ),
        thorns: provenancedField(
          false,
          'HEURISTIC_ASSERTION',
          ['ncsu-yucca-filamentosa'],
          'Spine-tipped leaves rather than true thorns.'
        ),
        handlingPrecautions: provenancedField(
          'Wear gloves; site away from high-traffic paths where tips may injure.',
          'HEURISTIC_ASSERTION',
          ['ncsu-yucca-filamentosa'],
          'Handling guidance derived from sharp-leaf morphology.'
        )
      },
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not treated as a food crop in this packet.'),
        inedibleParts: provenancedField(null, 'UNKNOWN', [], 'Ornamental landscape plant in this packet.')
      },
      warnings: [
        warning({
          warningId: 'yucca-sharp-leaves',
          category: 'physical_hazard',
          canonicalTitle: "Yucca — sharp leaf tips",
          summary: "Adam's needle has stiff leaves with sharp tips that can injure skin/eyes on contact.",
          severity: 'CAUTION',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: null },
          sourceIds: ['ncsu-yucca-filamentosa']
        })
      ]
    }
  }
];

if (BATCH2_ENRICHMENT_PLANTS.length !== 30) {
  throw new Error(`BATCH2_ENRICHMENT_PLANTS expected 30, got ${BATCH2_ENRICHMENT_PLANTS.length}`);
}

for (const plant of BATCH2_ENRICHMENT_PLANTS) {
  if (plant.plantKnowledge?.plantKnowledgeContractVersion !== PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION) {
    throw new Error(`${plant.slug}: plantKnowledgeContractVersion mismatch`);
  }
  if (plant.batch !== 2) {
    throw new Error(`${plant.slug}: expected batch 2`);
  }
  // Keep EVIDENCE_CLASS referenced for importers/linters — UNKNOWN is the default honesty posture.
  if (!EVIDENCE_CLASS.UNKNOWN || !EVIDENCE_CLASS.SOURCE_SUPPORTED || !EVIDENCE_CLASS.HEURISTIC_ASSERTION) {
    throw new Error('EVIDENCE_CLASS contract incomplete');
  }
}
