/**
 * Bounded Plant Knowledge V1 validation set (10 plants).
 * Proves warning classes without enriching all Batch 1/2 plants.
 * Free/open authoritative sources only. Not imported by product runtime UI.
 */

import {
  provenancedField,
  EVIDENCE_CLASS,
  PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION
} from '../../../../modules/catalog-expansion/plant-knowledge-warnings-v1-contract.js';

const V = '2026-08-31';

function src(sourceId, institution, title, url, authorityTier) {
  return { sourceId, institution, publisher: institution, title, url, authorityTier, verifiedAt: V };
}

function warning(partial) {
  return {
    titleKey: null,
    appliesTo: ['landscape', 'home_garden'],
    requiresOwnerReview: false,
    provenance: { shortExcerpt: partial.summary, transformation: null },
    status: partial.evidenceClass === EVIDENCE_CLASS.SOURCE_SUPPORTED ? 'active' : 'provisional',
    ...partial
  };
}

export const PLANT_KNOWLEDGE_VALIDATION_SET_ID = 'plant-knowledge-warnings-v1-validation-set';

export const VALIDATION_PLANTS = Object.freeze([
  {
    slug: 'oleander',
    batch: 1,
    scientific: 'Nerium oleander',
    proves: ['toxicity'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'ncsu-nerium-oleander',
          'North Carolina State University Extension Gardener',
          'Nerium oleander',
          'https://plants.ces.ncsu.edu/plants/nerium-oleander/',
          'university_extension'
        ),
        src(
          'aspca-oleander',
          'ASPCA Animal Poison Control',
          'Oleander',
          'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/oleander',
          'veterinary_toxicology'
        )
      ],
      toxicity: {
        humanToxicity: provenancedField(
          'severe',
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'NCSU: All parts of the plant are highly toxic if ingested; sap can cause skin irritation.'
        ),
        childRisk: provenancedField(
          'high',
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'All parts highly toxic if ingested — elevated risk where children may access plant material.'
        ),
        dogToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-oleander'],
          'ASPCA lists Oleander as toxic to dogs, cats, and horses.'
        ),
        catToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-oleander'],
          'ASPCA lists Oleander as toxic to dogs, cats, and horses.'
        ),
        livestockToxicity: provenancedField(
          'toxic',
          'SOURCE_SUPPORTED',
          ['aspca-oleander'],
          'ASPCA lists Oleander as toxic to horses (and dogs/cats).'
        ),
        toxicParts: provenancedField(
          ['all_parts', 'sap'],
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'All parts of the plant are highly toxic if ingested; sap can cause skin irritation.'
        ),
        exposureRoutes: provenancedField(
          ['ingestion', 'skin_contact'],
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'Toxic if ingested; sap can cause skin irritation.'
        ),
        severity: provenancedField(
          'SEVERE',
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander', 'aspca-oleander'],
          'Highly toxic if ingested (NCSU); toxic to dogs, cats, horses (ASPCA).'
        ),
        symptomsSummary: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Clinical symptom list not asserted in this foundation packet.'
        )
      },
      physicalHazards: {
        irritatingSap: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'Sap can cause skin irritation.'
        ),
        skinIrritation: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'Sap can cause skin irritation.'
        )
      },
      invasiveness: {},
      regionalRestrictions: [],
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {
        edibleParts: provenancedField(null, 'UNKNOWN', [], 'Not an edible crop.'),
        inedibleParts: provenancedField(
          ['all_parts'],
          'SOURCE_SUPPORTED',
          ['ncsu-nerium-oleander'],
          'All parts highly toxic if ingested.'
        )
      },
      importantNotes: [],
      warnings: [
        warning({
          warningId: 'oleander-toxicity-severe',
          category: 'toxicity',
          canonicalTitle: 'Oleander — severe toxicity',
          summary:
            'All parts of Nerium oleander are highly toxic if ingested; sap may irritate skin. Toxic to dogs, cats, and horses (ASPCA).',
          severity: 'SEVERE',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: 'Species-level toxicology' },
          sourceIds: ['ncsu-nerium-oleander', 'aspca-oleander']
        })
      ]
    }
  },
  {
    slug: 'blue-gum',
    batch: 1,
    scientific: 'Eucalyptus globulus',
    proves: ['invasiveness', 'regional_caveat'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'cabi-eucalyptus-globulus',
          'CABI Invasive Species Compendium',
          'Eucalyptus globulus (Tasmanian blue gum)',
          'https://www.cabidigitallibrary.org/doi/10.1079/cabicompendium.22472',
          'invasive_species_authority'
        ),
        src(
          'powo-eucalyptus-globulus',
          'Royal Botanic Gardens, Kew',
          'Eucalyptus globulus (POWO)',
          'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:592855-1',
          'botanical_authority'
        )
      ],
      toxicity: {},
      invasiveness: {
        invasiveStatus: provenancedField(
          'invasive_in_regions',
          'SOURCE_SUPPORTED',
          ['cabi-eucalyptus-globulus'],
          'CABI ISC documents Eucalyptus globulus as invasive / weed risk in multiple jurisdictions outside its native range.',
          {
            regionScope: {
              level: 'REGION',
              codes: ['CA-US', 'CL', 'ZA', 'PT', 'ES'],
              label: 'Selected documented invasive/weed-risk jurisdictions (illustrative codes)',
              note: 'Not a global invasive label — region-scoped only.'
            }
          }
        ),
        invasiveRegions: provenancedField(
          ['California', 'Chile', 'South Africa', 'Portugal', 'Spain'],
          'HEURISTIC_ASSERTION',
          ['cabi-eucalyptus-globulus'],
          'Representative jurisdictions commonly cited for blue gum weed/invasive risk; exact statutory lists vary — confirm locally.'
        ),
        weedRisk: provenancedField(
          'elevated_outside_native_range',
          'SOURCE_SUPPORTED',
          ['cabi-eucalyptus-globulus'],
          'Documented weed/invasive risk outside native Australian range.'
        ),
        spreadMechanism: provenancedField(
          'seed_wind_disturbance',
          'HEURISTIC_ASSERTION',
          ['cabi-eucalyptus-globulus'],
          'Spread mechanisms summarized from invasive-species literature; treat as provisional.'
        ),
        containmentNote: provenancedField(
          'Check local invasive-species and planting regulations before landscape use.',
          'SOURCE_SUPPORTED',
          ['cabi-eucalyptus-globulus'],
          'Regional restrictions and invasive status vary; Owner review retained on Batch 1 blue-gum.'
        )
      },
      regionalRestrictions: [
        {
          region: { level: 'STATE_PROVINCE', codes: ['CA-US'], label: 'California, USA' },
          restrictionType: 'discouraged',
          authority: 'Local / state invasive plant guidance (verify current list)',
          restrictionSummary: provenancedField(
            'Blue gum may be discouraged or regulated as a weed/invasive risk in parts of California; confirm current official list.',
            'HEURISTIC_ASSERTION',
            ['cabi-eucalyptus-globulus'],
            'Regional discouragement inferred from invasive-species documentation — not a substitute for the current legal list.'
          )
        }
      ],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {},
      importantNotes: [
        {
          noteId: 'blue-gum-owner-review',
          value: 'Batch 1 retains needsReview for invasive potential and regional restrictions.',
          evidenceClass: 'SOURCE_SUPPORTED',
          sourceIds: ['powo-eucalyptus-globulus'],
          shortExcerpt: 'Landscape use needs local review (Batch 1 needsReviewReason).',
          status: 'asserted'
        }
      ],
      warnings: [
        warning({
          warningId: 'blue-gum-invasive-regional',
          category: 'invasiveness',
          canonicalTitle: 'Blue gum — regional invasive / weed risk',
          summary:
            'Eucalyptus globulus has documented invasive/weed risk in multiple jurisdictions outside its native range. Not labeled globally invasive.',
          severity: 'WARNING',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: {
            level: 'REGION',
            codes: ['CA-US', 'CL', 'ZA', 'PT', 'ES'],
            label: 'Selected jurisdictions'
          },
          sourceIds: ['cabi-eucalyptus-globulus'],
          requiresOwnerReview: true,
          status: 'owner_review'
        })
      ]
    }
  },
  {
    slug: 'bay-laurel',
    batch: 1,
    scientific: 'Laurus nobilis',
    proves: ['UNKNOWN_handling'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'rhs-laurus-nobilis',
          'Royal Horticultural Society',
          'Laurus nobilis (bay)',
          'https://www.rhs.org.uk/plants/9968/laurus-nobilis/details',
          'horticultural_society'
        )
      ],
      toxicity: {
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'No authoritative toxicity class asserted in this foundation packet; culinary leaf use is not treated as a safety certification.'
        ),
        dogToxicity: provenancedField(null, 'UNKNOWN', [], 'Pet toxicity not asserted.'),
        catToxicity: provenancedField(null, 'UNKNOWN', [], 'Pet toxicity not asserted.')
      },
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {
        pollenAllergenicity: provenancedField(null, 'UNKNOWN', [], 'Not assessed.'),
        contactAllergyRisk: provenancedField(null, 'UNKNOWN', [], 'Not assessed.')
      },
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {
        edibleParts: provenancedField(
          ['culinary_leaves'],
          'HEURISTIC_ASSERTION',
          ['rhs-laurus-nobilis'],
          'Bay is widely grown for culinary foliage; this is not a clinical edibility certificate.'
        )
      },
      importantNotes: [],
      warnings: []
    }
  },
  {
    slug: 'persimmon',
    batch: 1,
    scientific: 'Diospyros kaki',
    proves: ['cultivar_caveat', 'pollination'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'uf-ifas-persimmon',
          'University of Florida IFAS Extension',
          'Persimmon Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG242',
          'university_extension'
        )
      ],
      toxicity: {},
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {
        cultivarDependent: provenancedField(
          true,
          'SOURCE_SUPPORTED',
          ['uf-ifas-persimmon'],
          'UF/IFAS: cultivar selection affects astringency, pollination needs, and fruit quality.'
        ),
        affectedTraits: provenancedField(
          ['self_fertility', 'pollinator_requirement', 'fruit_quality', 'astringency'],
          'SOURCE_SUPPORTED',
          ['uf-ifas-persimmon'],
          'Cultivar determines whether trees are pollination-constant astringent/non-astringent and pollination needs.'
        ),
        explanation: provenancedField(
          'Species-level statements must not override documented cultivar dependence for fertility and fruit type.',
          'SOURCE_SUPPORTED',
          ['uf-ifas-persimmon'],
          'UF/IFAS cultivar guidance for Japanese persimmon.'
        )
      },
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {},
      importantNotes: [],
      warnings: [
        warning({
          warningId: 'persimmon-cultivar-caveat',
          category: 'cultivar_caveat',
          canonicalTitle: 'Persimmon — cultivar-dependent fruiting',
          summary:
            'Self-fertility, pollination needs, astringency, and fruit quality depend on cultivar. Do not assume species-level self-fertility.',
          severity: 'INFO',
          evidenceClass: 'SOURCE_SUPPORTED',
          regionScope: { level: 'GLOBAL', codes: [], label: 'Cultivar biology' },
          sourceIds: ['uf-ifas-persimmon']
        })
      ]
    }
  },
  {
    slug: 'hazelnut',
    batch: 2,
    scientific: 'Corylus avellana',
    proves: ['pollination'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'ncsu-corylus-avellana',
          'North Carolina State University Extension Gardener',
          'Corylus avellana (European Hazel)',
          'https://plants.ces.ncsu.edu/plants/corylus-avellana/',
          'university_extension'
        )
      ],
      toxicity: {},
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
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
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {},
      importantNotes: [],
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
    slug: 'pecan',
    batch: 2,
    scientific: 'Carya illinoinensis',
    proves: ['pollination', 'cultivar_caveat'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'ncsu-carya-illinoinensis',
          'North Carolina State University Extension Gardener',
          'Carya illinoinensis (Hardy Pecan)',
          'https://plants.ces.ncsu.edu/plants/carya-illinoinensis/',
          'university_extension'
        )
      ],
      toxicity: {},
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
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
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {},
      importantNotes: [],
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
    slug: 'yucca',
    batch: 2,
    scientific: 'Yucca filamentosa',
    proves: ['physical_hazard'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'ncsu-yucca-filamentosa',
          'North Carolina State University Extension Gardener',
          "Yucca filamentosa (Adam's Needle)",
          'https://plants.ces.ncsu.edu/plants/yucca-filamentosa/',
          'university_extension'
        )
      ],
      toxicity: {},
      invasiveness: {},
      regionalRestrictions: [],
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
        thorns: provenancedField(false, 'HEURISTIC_ASSERTION', ['ncsu-yucca-filamentosa'], 'Spine-tipped leaves rather than true thorns.'),
        handlingPrecautions: provenancedField(
          'Wear gloves; site away from high-traffic paths where tips may injure.',
          'HEURISTIC_ASSERTION',
          ['ncsu-yucca-filamentosa'],
          'Handling guidance derived from sharp-leaf morphology.'
        )
      },
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
      harvestUseWarnings: {},
      importantNotes: [],
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
  },
  {
    slug: 'rhubarb',
    batch: 2,
    scientific: 'Rheum rhabarbarum',
    proves: ['harvest_use', 'toxicity'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'rhs-rheum-rhabarbarum',
          'Royal Horticultural Society',
          'Rheum × hybridum (rhubarb) / Rheum rhabarbarum guidance',
          'https://www.rhs.org.uk/vegetables/rhubarb/grow-your-own',
          'horticultural_society'
        )
      ],
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
        catToxicity: provenancedField(null, 'UNKNOWN', [], 'Pet toxicity not asserted in this packet.')
      },
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
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
      importantNotes: [],
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
    batch: 2,
    scientific: 'Ipomoea batatas',
    proves: ['harvest_use'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'ncsu-ipomoea-batatas',
          'North Carolina State University Extension Gardener',
          'Ipomoea batatas (Sweet Potato)',
          'https://plants.ces.ncsu.edu/plants/ipomoea-batatas/',
          'university_extension'
        )
      ],
      toxicity: {
        // Do NOT claim "safe" from missing data
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'No positive safety certification in this packet; cultivated storage roots are a food crop — not a clinical non-toxicity proof.'
        )
      },
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {},
      soilRequirements: {},
      maintenance: {},
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
      importantNotes: [],
      warnings: []
    }
  },
  {
    slug: 'soursop',
    batch: 2,
    scientific: 'Annona muricata',
    proves: ['regional_caveat', 'UNKNOWN_handling'],
    plantKnowledge: {
      plantKnowledgeContractVersion: PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION,
      sources: [
        src(
          'uf-ifas-soursop',
          'University of Florida IFAS Extension',
          'Soursop Growing in the Florida Home Landscape',
          'https://edis.ifas.ufl.edu/publication/MG332',
          'university_extension'
        )
      ],
      toxicity: {
        humanToxicity: provenancedField(
          null,
          'UNKNOWN',
          [],
          'Seed/leaf toxicity claims are not asserted without dedicated toxicology sources in this foundation packet.'
        )
      },
      invasiveness: {},
      regionalRestrictions: [],
      physicalHazards: {},
      allergenicity: {},
      pestsAndDiseases: [],
      cultivarCaveats: {},
      plantingRequirements: {
        windProtection: provenancedField(
          true,
          'HEURISTIC_ASSERTION',
          ['uf-ifas-soursop'],
          'Tropical small tree; shelter from cold wind often advised in marginal subtropical sites.'
        ),
        containerSuitability: provenancedField(null, 'UNKNOWN', [], 'Not assessed.')
      },
      soilRequirements: {},
      maintenance: {},
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
  }
]);
