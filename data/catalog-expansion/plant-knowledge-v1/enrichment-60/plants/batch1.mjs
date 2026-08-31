/**
 * Plant Knowledge & Warnings V1 — Batch 1 enrichment (30 plants).
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

const SS = EVIDENCE_CLASS.SOURCE_SUPPORTED;
const HZ = EVIDENCE_CLASS.HEURISTIC_ASSERTION;
const UN = EVIDENCE_CLASS.UNKNOWN;

function u(excerpt) {
  return provenancedField(null, UN, [], excerpt);
}

function ss(value, sourceIds, excerpt, extra = {}) {
  return provenancedField(value, SS, sourceIds, excerpt, extra);
}

function hz(value, sourceIds, excerpt, extra = {}) {
  return provenancedField(value, HZ, sourceIds, excerpt, extra);
}

function unknownToxicity(petNote = 'Pet toxicity not asserted; culinary use is not pet-safety evidence.') {
  return {
    humanToxicity: u('Human toxicity class not asserted beyond any stated harvest/use notes.'),
    childRisk: u('Child risk not separately assessed.'),
    dogToxicity: u(petNote),
    catToxicity: u(petNote),
    livestockToxicity: u('Livestock toxicity not assessed.'),
    toxicParts: u('Toxic parts not asserted.'),
    exposureRoutes: u('Exposure routes not assessed.'),
    severity: u('Severity not assessed.'),
    symptomsSummary: u('Symptoms not assessed.')
  };
}

function tropicalFruit({
  slug,
  scientific,
  sourceId,
  title,
  url,
  edibleExcerpt,
  frostExcerpt,
  extraSources = []
}) {
  const sources = [
    src(sourceId, 'University of Florida IFAS Extension', title, url, 'university_extension'),
    ...extraSources
  ];
  const k = baseKnowledge(sources);
  k.toxicity = unknownToxicity();
  k.plantingRequirements = {
    frostSensitivity: hz('high', [sourceId], frostExcerpt)
  };
  k.harvestUseWarnings = {
    edibleParts: hz(['fruit_pulp'], [sourceId], edibleExcerpt)
  };
  k.warnings = [
    warning({
      warningId: `${slug}-frost-sensitive`,
      category: 'planting',
      canonicalTitle: `${scientific.split(' ')[0]} — frost / climate sensitivity`,
      summary: frostExcerpt,
      severity: 'CAUTION',
      evidenceClass: HZ,
      regionScope: {
        level: 'REGION',
        codes: [],
        label: 'Warm-tropical / frost-free home landscapes'
      },
      sourceIds: [sourceId]
    })
  ];
  return { slug, scientific, batch: 1, plantKnowledge: k };
}

function herbCulinary({ slug, scientific, sources, edibleParts, edibleExcerpt, sourceIds }) {
  const k = baseKnowledge(sources);
  k.toxicity = unknownToxicity(
    'Pet toxicity UNKNOWN — culinary herb use does not imply pet safety; no ASPCA taxon page cited.'
  );
  k.harvestUseWarnings = {
    edibleParts: hz(edibleParts, sourceIds, edibleExcerpt)
  };
  k.warnings = [];
  return { slug, scientific, batch: 1, plantKnowledge: k };
}

export const BATCH1_ENRICHMENT_PLANTS = [
  tropicalFruit({
    slug: 'durian',
    scientific: 'Durio zibethinus',
    sourceId: 'uf-ifas-durian-hs37',
    title: 'Durian Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG004',
    edibleExcerpt:
      'UF/IFAS covers durian as a tropical fruit crop for suitable Florida landscapes; edible aril/pulp is the harvested product — not a clinical non-toxicity certificate.',
    frostExcerpt:
      'UF/IFAS tropical fruit guidance: durian is frost-sensitive and suited to warm tropical / protected subtropical sites.',
    extraSources: [
      src(
        'prosea-durio-zibethinus',
        'PROSEA / Pl@ntUse',
        'Durio zibethinus (PROSEA)',
        'https://plantuse.plantnet.org/en/Durio_zibethinus_(PROSEA)',
        'botanical_authority'
      )
    ]
  }),

  tropicalFruit({
    slug: 'mangosteen',
    scientific: 'Garcinia mangostana',
    sourceId: 'uf-ifas-mangosteen',
    title: 'Mangosteen Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG026',
    edibleExcerpt:
      'UF/IFAS treats mangosteen as a tropical fruit for home landscape; edible fruit pulp is the crop portion — not a safety certification.',
    frostExcerpt:
      'UF/IFAS: mangosteen is a tropical species requiring frost-free, warm humid conditions.'
  }),

  tropicalFruit({
    slug: 'breadfruit',
    scientific: 'Artocarpus altilis',
    sourceId: 'uf-ifas-breadfruit',
    title: 'Breadfruit Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG214',
    edibleExcerpt:
      'UF/IFAS breadfruit guidance: fruit is the harvested food crop (cooked/prepared per culinary practice) — not a clinical non-toxicity proof.',
    frostExcerpt:
      'UF/IFAS: breadfruit is tropical and frost-sensitive; unsuitable for freeze-prone sites.'
  }),

  tropicalFruit({
    slug: 'acerola',
    scientific: 'Malpighia emarginata',
    sourceId: 'uf-ifas-acerola',
    title: 'Acerola Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG041',
    edibleExcerpt:
      'UF/IFAS acerola (Barbados cherry) guidance: edible fruit is the harvested product — culinary context only.',
    frostExcerpt:
      'UF/IFAS subtropical fruit notes: acerola is frost-sensitive relative to temperate fruit.'
  }),

  tropicalFruit({
    slug: 'longan',
    scientific: 'Dimocarpus longan',
    sourceId: 'uf-ifas-longan',
    title: 'Longan Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG049',
    edibleExcerpt:
      'UF/IFAS longan guidance: edible aril/fruit pulp is the crop portion — not a pet-safety or clinical toxicity certificate.',
    frostExcerpt:
      'UF/IFAS: longan is a subtropical fruit tree with limited freeze tolerance; site selection matters.'
  }),

  (() => {
    const sources = [
      src(
        'uf-ifas-loquat',
        'University of Florida IFAS Extension',
        'Loquat Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG050',
        'university_extension'
      ),
      src(
        'ncsu-eriobotrya-japonica',
        'North Carolina State University Extension Gardener',
        'Eriobotrya japonica (Loquat)',
        'https://plants.ces.ncsu.edu/plants/eriobotrya-japonica/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.plantingRequirements = {
      frostSensitivity: hz(
        'medium',
        ['uf-ifas-loquat', 'ncsu-eriobotrya-japonica'],
        'UF/IFAS and NCSU: loquat is subtropical; flower/fruit crops can be damaged by freezes depending on site and season.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit_pulp'],
        ['uf-ifas-loquat'],
        'UF/IFAS: loquat fruit is grown for fresh eating; culinary fruit context only.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'loquat-frost-fruit',
        category: 'planting',
        canonicalTitle: 'Loquat — frost can damage bloom/fruit',
        summary:
          'Subtropical loquat plantings may lose flowers or fruit to freezes; match cultivar and site to local frost risk.',
        severity: 'CAUTION',
        evidenceClass: HZ,
        regionScope: { level: 'REGION', codes: ['FL-US'], label: 'Subtropical home landscapes' },
        sourceIds: ['uf-ifas-loquat', 'ncsu-eriobotrya-japonica']
      })
    ];
    return { slug: 'loquat', scientific: 'Eriobotrya japonica', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'uf-ifas-persimmon',
        'University of Florida IFAS Extension',
        'Persimmon Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG242',
        'university_extension'
      ),
      src(
        'ncsu-diospyros-kaki',
        'North Carolina State University Extension Gardener',
        'Diospyros kaki (Japanese Persimmon)',
        'https://plants.ces.ncsu.edu/plants/diospyros-kaki/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.cultivarCaveats = {
      cultivarDependent: ss(
        true,
        ['uf-ifas-persimmon'],
        'UF/IFAS: cultivar selection affects astringency, pollination needs, and fruit quality.'
      ),
      affectedTraits: ss(
        ['self_fertility', 'pollinator_requirement', 'fruit_quality', 'astringency'],
        ['uf-ifas-persimmon'],
        'Cultivar determines whether trees are pollination-constant astringent/non-astringent and pollination needs.'
      ),
      explanation: ss(
        'Species-level statements must not override documented cultivar dependence for fertility and fruit type.',
        ['uf-ifas-persimmon'],
        'UF/IFAS cultivar guidance for Japanese persimmon.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit_pulp'],
        ['uf-ifas-persimmon'],
        'UF/IFAS: fruit is the harvested crop; astringency and eat-ready stage depend on cultivar type.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'persimmon-cultivar-caveat',
        category: 'cultivar_caveat',
        canonicalTitle: 'Persimmon — cultivar-dependent fruiting',
        summary:
          'Self-fertility, pollination needs, astringency, and fruit quality depend on cultivar. Do not assume species-level self-fertility.',
        severity: 'INFO',
        evidenceClass: SS,
        regionScope: { level: 'GLOBAL', codes: [], label: 'Cultivar biology' },
        sourceIds: ['uf-ifas-persimmon']
      })
    ];
    return { slug: 'persimmon', scientific: 'Diospyros kaki', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'uf-ifas-feijoa',
        'University of Florida IFAS Extension',
        'Feijoa (Pineapple Guava) Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG045',
        'university_extension'
      ),
      src(
        'ncsu-acca-sellowiana',
        'North Carolina State University Extension Gardener',
        'Acca sellowiana (Pineapple Guava)',
        'https://plants.ces.ncsu.edu/plants/acca-sellowiana/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.plantingRequirements = {
      frostSensitivity: hz(
        'medium',
        ['uf-ifas-feijoa', 'ncsu-acca-sellowiana'],
        'UF/IFAS / NCSU: feijoa is subtropical; cold/frost tolerance is limited compared with temperate fruit.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit_pulp'],
        ['uf-ifas-feijoa'],
        'UF/IFAS: feijoa fruit pulp is the edible crop portion in home-landscape guidance.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'feijoa-frost-climate',
        category: 'planting',
        canonicalTitle: 'Feijoa — subtropical climate fit',
        summary:
          'Feijoa is generally suited to mild subtropical climates; confirm local freeze risk before planting.',
        severity: 'CAUTION',
        evidenceClass: HZ,
        regionScope: { level: 'REGION', codes: [], label: 'Subtropical landscapes' },
        sourceIds: ['uf-ifas-feijoa']
      })
    ];
    return { slug: 'feijoa', scientific: 'Acca sellowiana', batch: 1, plantKnowledge: k };
  })(),

  tropicalFruit({
    slug: 'jaboticaba',
    scientific: 'Plinia cauliflora',
    sourceId: 'uf-ifas-jaboticaba',
    title: 'Jaboticaba Growing in the Florida Home Landscape',
    url: 'https://edis.ifas.ufl.edu/publication/MG047',
    edibleExcerpt:
      'UF/IFAS jaboticaba guidance: edible fruit pulp is the harvested product — culinary context only.',
    frostExcerpt:
      'UF/IFAS: jaboticaba is subtropical/tropical and frost-sensitive relative to temperate fruit trees.'
  }),

  (() => {
    const sources = [
      src(
        'uf-ifas-white-sapote',
        'University of Florida IFAS Extension',
        'White Sapote Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG058',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      ...unknownToxicity(),
      toxicParts: u(
        'Seed caution sometimes noted in secondary literature; severity and clinical confirmation not asserted here — UNKNOWN.'
      ),
      severity: u('Seed-related caution severity not confirmed in cited UF/IFAS packet sources.')
    };
    k.plantingRequirements = {
      frostSensitivity: hz(
        'medium',
        ['uf-ifas-white-sapote'],
        'UF/IFAS: frost sensitivity characterized as medium for home-landscape white sapote.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit_pulp'],
        ['uf-ifas-white-sapote'],
        'UF/IFAS white sapote guidance: fruit pulp is eaten; this is culinary crop context, not a clinical safety certificate.'
      ),
      inedibleParts: u(
        'Seeds sometimes flagged as cautionary in informal sources; not confirmed as SOURCE_SUPPORTED toxic parts here.'
      ),
      harvestCautions: hz(
        'Eat ripe fruit pulp; do not treat seeds as a confirmed edible or confirmed high-severity toxin without better sources.',
        ['uf-ifas-white-sapote'],
        'Conservative harvest note: pulp edible in culinary guidance; seed toxicity remains UNKNOWN.'
      )
    };
    k.importantNotes = [
      {
        noteId: 'white-sapote-seed-unknown',
        value:
          'Seed toxicity/severity remains UNKNOWN in this enrichment; do not invent confirmed seed toxicity.',
        evidenceClass: UN,
        sourceIds: [],
        shortExcerpt: null,
        status: 'unknown'
      }
    ];
    k.warnings = [
      warning({
        warningId: 'white-sapote-seed-caution-unknown',
        category: 'harvest_use',
        canonicalTitle: 'White sapote — seed caution unconfirmed',
        summary:
          'Fruit pulp is a culinary crop per UF/IFAS context. Seed toxicity/severity is UNKNOWN — not asserted as confirmed.',
        severity: 'CAUTION',
        evidenceClass: UN,
        regionScope: { level: 'UNKNOWN', codes: [], label: null },
        sourceIds: [],
        status: 'unknown'
      })
    ];
    return { slug: 'white-sapote', scientific: 'Casimiroa edulis', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-prunus-avium',
        'Royal Horticultural Society',
        'Prunus avium (sweet cherry)',
        'https://www.rhs.org.uk/plants/13766/prunus-avium/details',
        'horticultural_society'
      ),
      src(
        'ncsu-prunus-avium',
        'North Carolina State University Extension Gardener',
        'Prunus avium (Sweet Cherry)',
        'https://plants.ces.ncsu.edu/plants/prunus-avium/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      ...unknownToxicity(),
      humanToxicity: u(
        'Cyanogenic compounds in pits/leaves are commonly discussed for Prunus; not asserted here without a cited extension toxicology excerpt — UNKNOWN.'
      ),
      toxicParts: u(
        'Pits/leaves cyanide claims not elevated to HEURISTIC without an extension source excerpt in this packet.'
      )
    };
    k.cultivarCaveats = {
      cultivarDependent: hz(
        true,
        ['ncsu-prunus-avium'],
        'NCSU: summer edible drupe; cultivar/pollination details vary and may not be fully specified on a single species page.'
      ),
      affectedTraits: hz(
        ['self_fertility', 'pollinator_requirement', 'fruit_quality'],
        ['ncsu-prunus-avium'],
        'Sweet cherry plantings commonly depend on cultivar and compatible pollen partners.'
      ),
      explanation: hz(
        'Do not assume a single sweet-cherry tree is self-fruitful without cultivar documentation.',
        ['ncsu-prunus-avium'],
        'NCSU page does not fully specify self-fertility charts for all cultivars.'
      )
    };
    k.plantingRequirements = {
      frostSensitivity: hz(
        'medium',
        ['ncsu-prunus-avium'],
        'NCSU: late frosts will damage buds; USDA zones cited on extension page.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit_flesh'],
        ['ncsu-prunus-avium'],
        'NCSU: fleshy yellow to red to purple-red drupe fruit in summer — culinary fruit flesh context.'
      ),
      inedibleParts: u(
        'Pits/leaves not labeled toxic here without SOURCE_SUPPORTED or extension-backed HEURISTIC excerpt.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'sweet-cherry-cultivar-pollination',
        category: 'cultivar_caveat',
        canonicalTitle: 'Sweet cherry — cultivar / pollination caveats',
        summary:
          'Fruit set and self-fertility are commonly cultivar-dependent. Confirm pollination needs for the chosen cultivar.',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['ncsu-prunus-avium']
      })
    ];
    return { slug: 'sweet-cherry', scientific: 'Prunus avium', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-juglans-regia',
        'Royal Horticultural Society',
        'Juglans regia (walnut)',
        'https://www.rhs.org.uk/plants/9736/juglans-regia/details',
        'horticultural_society'
      ),
      src(
        'ncsu-juglans-regia',
        'North Carolina State University Extension Gardener',
        'Juglans regia (English Walnut)',
        'https://plants.ces.ncsu.edu/plants/juglans-regia/',
        'university_extension'
      ),
      src(
        'ucanr-walnut-chill-portions',
        'University of California Agriculture and Natural Resources',
        'Fruit & Nut Crop Chill Portions Requirements',
        'https://ucanr.edu/site/fruit-nut-research-information-center/fruit-nut-crop-chill-portions-requirements',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.cultivarCaveats = {
      cultivarDependent: hz(
        true,
        ['ucanr-walnut-chill-portions', 'ncsu-juglans-regia'],
        'UC ANR lists cultivar chill-portion requirements; NCSU notes climate fit and crop timing vary.'
      ),
      affectedTraits: hz(
        ['chill_requirement', 'pollinator_requirement', 'crop_reliability'],
        ['ucanr-walnut-chill-portions'],
        'Chill portions and production reliability are cultivar- and region-dependent.'
      ),
      explanation: hz(
        'Match walnut cultivar chill needs and local climate; do not assume species-level uniformity.',
        ['ucanr-walnut-chill-portions', 'ncsu-juglans-regia'],
        'Extension chill and climate guidance for English walnut.'
      )
    };
    k.importantNotes = [
      {
        noteId: 'english-walnut-juglone',
        value:
          'Juglans species are often associated with juglone allelopathy affecting nearby plants; treat as HEURISTIC landscape note pending site-specific confirmation.',
        evidenceClass: HZ,
        sourceIds: ['ncsu-juglans-regia'],
        shortExcerpt:
          'Extension/horticulture literature commonly notes juglone-related plant antagonism under walnuts; not a measured allelopathy assay in this packet.',
        status: 'asserted'
      }
    ];
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['nuts'],
        ['ncsu-juglans-regia'],
        'NCSU: English walnut is grown for nuts; culinary nut crop context only.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'english-walnut-cultivar-chill',
        category: 'cultivar_caveat',
        canonicalTitle: 'English walnut — cultivar chill / climate fit',
        summary:
          'Cultivar chill requirements and regional climate fit strongly affect leafing, flowering, and nut crops.',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'REGION', codes: [], label: 'Temperate production regions' },
        sourceIds: ['ucanr-walnut-chill-portions', 'ncsu-juglans-regia']
      }),
      warning({
        warningId: 'english-walnut-juglone-note',
        category: 'important_note',
        canonicalTitle: 'English walnut — possible juglone allelopathy',
        summary:
          'Walnuts are commonly associated with juglone-related antagonism to nearby plants; plan companion plantings cautiously (heuristic).',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['ncsu-juglans-regia']
      })
    ];
    return { slug: 'english-walnut', scientific: 'Juglans regia', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-ribes-rubrum',
        'Royal Horticultural Society',
        'Ribes rubrum (redcurrant)',
        'https://www.rhs.org.uk/plants/14654/ribes-rubrum/details',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit'],
        ['rhs-ribes-rubrum'],
        'RHS: redcurrant is a cultivated soft fruit; culinary berry context only.'
      )
    };
    k.warnings = [];
    return { slug: 'red-currant', scientific: 'Ribes rubrum', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-ribes-uva-crispa',
        'Royal Horticultural Society',
        'Ribes uva-crispa (gooseberry)',
        'https://www.rhs.org.uk/plants/14672/ribes-uva-crispa/details',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.physicalHazards = {
      thorns: hz(
        true,
        ['rhs-ribes-uva-crispa'],
        'Gooseberry shrubs typically bear spines/thorns on stems — morphological handling hazard (heuristic from known growth habit; RHS identity page).'
      ),
      handlingPrecautions: hz(
        'Wear gloves when pruning or harvesting; site away from high-traffic paths.',
        ['rhs-ribes-uva-crispa'],
        'Handling guidance derived from thorny shrub morphology.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit'],
        ['rhs-ribes-uva-crispa'],
        'RHS: gooseberry is a cultivated soft fruit; culinary berry context only.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'gooseberry-thorns',
        category: 'physical_hazard',
        canonicalTitle: 'Gooseberry — thorns / spines',
        summary:
          'Gooseberry bushes typically have thorny stems that can scratch skin during pruning or harvest.',
        severity: 'CAUTION',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['rhs-ribes-uva-crispa']
      })
    ];
    return { slug: 'gooseberry', scientific: 'Ribes uva-crispa', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-cydonia-oblonga',
        'Royal Horticultural Society',
        'Cydonia oblonga (quince)',
        'https://www.rhs.org.uk/plants/5110/cydonia-oblonga/details',
        'horticultural_society'
      ),
      src(
        'rhs-quince-grow-your-own',
        'Royal Horticultural Society',
        'How to grow quince',
        'https://www.rhs.org.uk/fruit/quince/grow-your-own',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['fruit'],
        ['rhs-quince-grow-your-own'],
        'RHS grow-your-own quince: fruit is the crop; typically cooked rather than eaten raw — culinary guidance, not clinical safety.'
      ),
      requiresCooking: hz(
        true,
        ['rhs-quince-grow-your-own'],
        'Quince fruit is commonly cooked before eating in horticultural grow-your-own guidance.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'quince-usually-cooked',
        category: 'harvest_use',
        canonicalTitle: 'Quince — fruit usually cooked',
        summary:
          'Quince fruit is typically cooked before eating per horticultural grow-your-own guidance.',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['rhs-quince-grow-your-own']
      })
    ];
    return { slug: 'quince', scientific: 'Cydonia oblonga', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'ucanr-carob',
        'University of California Agriculture and Natural Resources',
        'Carob',
        'https://ucanr.edu/sites/default/files/2021-12/carob.pdf',
        'university_extension'
      ),
      src(
        'ncsu-ceratonia-siliqua',
        'North Carolina State University Extension Gardener',
        'Ceratonia siliqua (Carob)',
        'https://plants.ces.ncsu.edu/plants/ceratonia-siliqua/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.plantingRequirements = {
      frostSensitivity: hz(
        'medium',
        ['ncsu-ceratonia-siliqua'],
        'NCSU / Mediterranean crop context: carob prefers mild climates; freeze risk depends on site.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['pods_pulp'],
        ['ucanr-carob', 'ncsu-ceratonia-siliqua'],
        'Carob pods are a traditional food/feed crop in Mediterranean systems — culinary context only; pet toxicity UNKNOWN.'
      )
    };
    k.warnings = [];
    return { slug: 'carob', scientific: 'Ceratonia siliqua', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-myrtus-communis',
        'Royal Horticultural Society',
        'Myrtus communis (common myrtle)',
        'https://www.rhs.org.uk/plants/11504/myrtus-communis/details',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity();
    k.harvestUseWarnings = {
      edibleParts: u('Culinary/ornamental berry use not certified in this enrichment packet.')
    };
    k.warnings = [];
    return { slug: 'common-myrtle', scientific: 'Myrtus communis', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-laurus-nobilis',
        'Royal Horticultural Society',
        'Laurus nobilis (bay)',
        'https://www.rhs.org.uk/plants/9968/laurus-nobilis/details',
        'horticultural_society'
      ),
      src(
        'ncsu-laurus-nobilis',
        'North Carolina State University Extension Gardener',
        'Laurus nobilis (Bay Laurel)',
        'https://plants.ces.ncsu.edu/plants/laurus-nobilis/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      humanToxicity: u(
        'No authoritative toxicity class asserted; culinary leaf use is not treated as a safety certification.'
      ),
      childRisk: u('Child risk not assessed.'),
      dogToxicity: u('Pet toxicity not asserted.'),
      catToxicity: u('Pet toxicity not asserted.'),
      livestockToxicity: u('Livestock toxicity not assessed.'),
      toxicParts: u('Toxic parts not asserted.'),
      exposureRoutes: u('Exposure routes not assessed.'),
      severity: u('Severity not assessed.'),
      symptomsSummary: u('Symptoms not assessed.')
    };
    k.allergenicity = {
      pollenAllergenicity: u('Not assessed.'),
      contactAllergyRisk: u('Not assessed.')
    };
    k.harvestUseWarnings = {
      edibleParts: hz(
        ['culinary_leaves'],
        ['rhs-laurus-nobilis'],
        'Bay is widely grown for culinary foliage; this is not a clinical edibility certificate.'
      )
    };
    k.warnings = [];
    return { slug: 'bay-laurel', scientific: 'Laurus nobilis', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
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
      ),
      src(
        'rhs-nerium-oleander',
        'Royal Horticultural Society',
        'Nerium oleander (oleander)',
        'https://www.rhs.org.uk/plants/11648/nerium-oleander/details',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      humanToxicity: ss(
        'severe',
        ['ncsu-nerium-oleander'],
        'NCSU: All parts of the plant are highly toxic if ingested; sap can cause skin irritation.'
      ),
      childRisk: ss(
        'high',
        ['ncsu-nerium-oleander'],
        'All parts highly toxic if ingested — elevated risk where children may access plant material.'
      ),
      dogToxicity: ss(
        'toxic',
        ['aspca-oleander'],
        'ASPCA lists Oleander as toxic to dogs, cats, and horses.'
      ),
      catToxicity: ss(
        'toxic',
        ['aspca-oleander'],
        'ASPCA lists Oleander as toxic to dogs, cats, and horses.'
      ),
      livestockToxicity: ss(
        'toxic',
        ['aspca-oleander'],
        'ASPCA lists Oleander as toxic to horses (and dogs/cats).'
      ),
      toxicParts: ss(
        ['all_parts', 'sap'],
        ['ncsu-nerium-oleander'],
        'All parts of the plant are highly toxic if ingested; sap can cause skin irritation.'
      ),
      exposureRoutes: ss(
        ['ingestion', 'skin_contact'],
        ['ncsu-nerium-oleander'],
        'Toxic if ingested; sap can cause skin irritation.'
      ),
      severity: ss(
        'SEVERE',
        ['ncsu-nerium-oleander', 'aspca-oleander'],
        'Highly toxic if ingested (NCSU); toxic to dogs, cats, horses (ASPCA).'
      ),
      symptomsSummary: u('Clinical symptom list not asserted in this enrichment packet.')
    };
    k.physicalHazards = {
      irritatingSap: ss(
        true,
        ['ncsu-nerium-oleander'],
        'Sap can cause skin irritation.'
      ),
      skinIrritation: ss(
        true,
        ['ncsu-nerium-oleander'],
        'Sap can cause skin irritation.'
      )
    };
    k.harvestUseWarnings = {
      edibleParts: u('Not an edible crop.'),
      inedibleParts: ss(
        ['all_parts'],
        ['ncsu-nerium-oleander'],
        'All parts highly toxic if ingested.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'oleander-toxicity-severe',
        category: 'toxicity',
        canonicalTitle: 'Oleander — severe toxicity',
        summary:
          'All parts of Nerium oleander are highly toxic if ingested; sap may irritate skin. Toxic to dogs, cats, and horses (ASPCA).',
        severity: 'SEVERE',
        evidenceClass: SS,
        regionScope: { level: 'GLOBAL', codes: [], label: 'Species-level toxicology' },
        sourceIds: ['ncsu-nerium-oleander', 'aspca-oleander']
      })
    ];
    return { slug: 'oleander', scientific: 'Nerium oleander', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-paeonia-lactiflora',
        'Royal Horticultural Society',
        'Paeonia lactiflora (Chinese peony)',
        'https://www.rhs.org.uk/plants/12350/paeonia-lactiflora/details',
        'horticultural_society'
      ),
      src(
        'aspca-peony',
        'ASPCA Animal Poison Control',
        'Peony',
        'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/peony',
        'veterinary_toxicology'
      )
    ];
    const k = baseKnowledge(sources);
    // ASPCA peony page lists Paeonia officinalis (as "Paeonis officinalis"), not P. lactiflora.
    // Do not cross-infer SOURCE_SUPPORTED toxicity across species.
    k.toxicity = {
      humanToxicity: u('Human toxicity class not asserted beyond ornamental context.'),
      childRisk: u('Child risk not separately assessed.'),
      dogToxicity: hz(
        'toxic_related_species_provisional',
        ['aspca-peony'],
        'ASPCA lists Peony (scientific name on page: Paeonis/Paeonia officinalis) as toxic to dogs, cats, and horses — provisional for P. lactiflora; not species-exact SOURCE_SUPPORTED.'
      ),
      catToxicity: hz(
        'toxic_related_species_provisional',
        ['aspca-peony'],
        'ASPCA peony listing is for P. officinalis taxon string — provisional for garden peony (P. lactiflora).'
      ),
      livestockToxicity: hz(
        'toxic_related_species_provisional',
        ['aspca-peony'],
        'ASPCA peony listing includes horses for the listed Peony taxon — provisional for P. lactiflora.'
      ),
      toxicParts: u('Specific toxic plant parts not asserted for P. lactiflora.'),
      exposureRoutes: hz(
        ['ingestion'],
        ['aspca-peony'],
        'Provisional ingestion exposure from related Peony ASPCA listing.'
      ),
      severity: u('Clinical severity not SOURCE_SUPPORTED for P. lactiflora.'),
      symptomsSummary: u('Clinical symptom list not asserted for P. lactiflora.')
    };
    k.importantNotes = [
      {
        noteId: 'garden-peony-aspca-taxon-mismatch',
        value:
          'ASPCA Peony entry cites Paeonia officinalis (page spelling Paeonis officinalis), not Paeonia lactiflora. Pet toxicity for garden peony remains provisional (HEURISTIC), not confirmed species-exact.',
        evidenceClass: HZ,
        sourceIds: ['aspca-peony'],
        shortExcerpt: 'ASPCA scientific name on Peony page differs from CRUVIT garden-peony identity.',
        status: 'asserted'
      }
    ];
    k.warnings = [
      warning({
        warningId: 'garden-peony-pet-toxicity-provisional',
        category: 'toxicity',
        canonicalTitle: 'Garden peony — provisional pet toxicity (related ASPCA taxon)',
        summary:
          'ASPCA lists a Peony taxon (P. officinalis) as toxic to dogs, cats, and horses. CRUVIT garden peony is P. lactiflora — treat as provisional HEURISTIC, not a confirmed species-exact warning.',
        severity: 'WARNING',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['aspca-peony'],
        status: 'provisional'
      })
    ];
    return { slug: 'garden-peony', scientific: 'Paeonia lactiflora', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-syringa-vulgaris',
        'Royal Horticultural Society',
        'Syringa vulgaris (lilac)',
        'https://www.rhs.org.uk/plants/17768/syringa-vulgaris/details',
        'horticultural_society'
      ),
      src(
        'ncsu-syringa-vulgaris',
        'North Carolina State University Extension Gardener',
        'Syringa vulgaris (Common Lilac)',
        'https://plants.ces.ncsu.edu/plants/syringa-vulgaris/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity('Pet toxicity not asserted for common lilac.');
    k.plantingRequirements = {
      chillRequirement: hz(
        'temperate_chill',
        ['ncsu-syringa-vulgaris'],
        'NCSU: common lilac is a temperate flowering shrub; reliable bloom tied to suitable winter chill / climate.'
      )
    };
    k.warnings = [];
    return { slug: 'common-lilac', scientific: 'Syringa vulgaris', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-forsythia-intermedia',
        'Royal Horticultural Society',
        'Forsythia × intermedia',
        'https://www.rhs.org.uk/plants/7486/forsythia-x-intermedia/details',
        'horticultural_society'
      ),
      src(
        'rhs-forsythia-genus-guide',
        'Royal Horticultural Society',
        'Forsythia',
        'https://www.rhs.org.uk/plants/forsythia',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity('Pet toxicity not asserted for forsythia.');
    k.warnings = [];
    return {
      slug: 'forsythia',
      scientific: 'Forsythia × intermedia',
      batch: 1,
      plantKnowledge: k
    };
  })(),

  (() => {
    const sources = [
      src(
        'uf-ifas-magnolia',
        'University of Florida IFAS Extension',
        'Magnolia grandiflora: Southern Magnolia',
        'https://edis.ifas.ufl.edu/publication/ST375',
        'university_extension'
      ),
      src(
        'ncsu-magnolia-grandiflora',
        'North Carolina State University Extension Gardener',
        'Magnolia grandiflora (Southern Magnolia)',
        'https://plants.ces.ncsu.edu/plants/magnolia-grandiflora/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity('Pet toxicity not asserted for southern magnolia.');
    k.plantingRequirements = {
      spaceNeeds: hz(
        'large_evergreen_tree',
        ['ncsu-magnolia-grandiflora', 'uf-ifas-magnolia'],
        'Extension landscape profiles: southern magnolia is a large evergreen tree — allow mature canopy space.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'southern-magnolia-size',
        category: 'planting',
        canonicalTitle: 'Southern magnolia — large mature size',
        summary:
          'Southern magnolia becomes a large evergreen tree; site with adequate space for mature canopy and leaf drop.',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'REGION', codes: [], label: 'Warm-temperate to subtropical landscapes' },
        sourceIds: ['ncsu-magnolia-grandiflora', 'uf-ifas-magnolia']
      })
    ];
    return {
      slug: 'southern-magnolia',
      scientific: 'Magnolia grandiflora',
      batch: 1,
      plantKnowledge: k
    };
  })(),

  (() => {
    const sources = [
      src(
        'ncsu-wisteria-sinensis',
        'North Carolina State University Extension Gardener',
        'Wisteria sinensis (Chinese Wisteria)',
        'https://plants.ces.ncsu.edu/plants/wisteria-sinensis/',
        'university_extension'
      ),
      src(
        'aspca-wisteria',
        'ASPCA Animal Poison Control',
        'Wisteria',
        'https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/wisteria',
        'veterinary_toxicology'
      ),
      src(
        'rhs-wisteria-sinensis',
        'Royal Horticultural Society',
        'Wisteria sinensis',
        'https://www.rhs.org.uk/plants/19014/wisteria-sinensis/details',
        'horticultural_society'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      humanToxicity: ss(
        'low_severity_poison',
        ['ncsu-wisteria-sinensis'],
        'NCSU: Chinese wisteria is listed with poison severity — low; seeds and pods are among parts of concern.'
      ),
      childRisk: hz(
        'elevated_if_seeds_pods_accessible',
        ['ncsu-wisteria-sinensis'],
        'Low-severity poison listing with seeds/pods implicated — keep plant material away from children.'
      ),
      dogToxicity: ss(
        'toxic',
        ['aspca-wisteria'],
        'ASPCA lists Wisteria (Wisteria spp.) as toxic to dogs, cats, and horses.'
      ),
      catToxicity: ss(
        'toxic',
        ['aspca-wisteria'],
        'ASPCA lists Wisteria (Wisteria spp.) as toxic to dogs, cats, and horses.'
      ),
      livestockToxicity: ss(
        'toxic',
        ['aspca-wisteria'],
        'ASPCA lists Wisteria as toxic to horses (and dogs/cats).'
      ),
      toxicParts: ss(
        ['seeds', 'pods'],
        ['ncsu-wisteria-sinensis'],
        'NCSU notes seeds/pods among poisonous plant parts for Wisteria sinensis (low severity class).'
      ),
      exposureRoutes: ss(
        ['ingestion'],
        ['ncsu-wisteria-sinensis', 'aspca-wisteria'],
        'Poisoning risk is primarily via ingestion of plant parts (extension / ASPCA context).'
      ),
      severity: ss(
        'low',
        ['ncsu-wisteria-sinensis'],
        'NCSU poison severity: low for Chinese wisteria.'
      ),
      symptomsSummary: u('Detailed clinical symptom list not asserted in this enrichment packet.')
    };
    k.invasiveness = {
      invasiveStatus: ss(
        'invasive_in_regions',
        ['ncsu-wisteria-sinensis'],
        'NCSU: Chinese wisteria is invasive in North Carolina / Eastern USA landscapes — region-scoped, not a global invasive label.',
        {
          regionScope: {
            level: 'STATE_PROVINCE',
            codes: ['NC-US'],
            label: 'North Carolina, USA (also documented invasive concern in Eastern USA)',
            note: 'Regional invasive only — do not promote to GLOBAL.'
          }
        }
      ),
      invasiveRegions: ss(
        ['North Carolina', 'Eastern USA'],
        ['ncsu-wisteria-sinensis'],
        'NCSU documents invasive status / problem behavior in NC and Eastern USA contexts.'
      ),
      weedRisk: ss(
        'elevated_eastern_usa',
        ['ncsu-wisteria-sinensis'],
        'Aggressive twining woody vine with documented invasive behavior in Eastern USA / NC.'
      ),
      containmentNote: ss(
        'Prefer non-invasive alternatives; do not plant where escape into natural areas is likely. Confirm local invasive lists.',
        ['ncsu-wisteria-sinensis'],
        'Regional invasive guidance requires owner/local review before landscape use.'
      )
    };
    k.regionalRestrictions = [
      {
        region: {
          level: 'REGION',
          codes: ['NC-US', 'Eastern-USA'],
          label: 'North Carolina / Eastern USA'
        },
        restrictionType: 'discouraged',
        authority: 'NCSU Extension / local invasive plant guidance (verify current lists)',
        restrictionSummary: hz(
          'Chinese wisteria is discouraged as an invasive landscape vine in NC/Eastern USA contexts; confirm current official lists.',
          ['ncsu-wisteria-sinensis'],
          'Regional discouragement from extension invasive notes — not a substitute for statute.'
        )
      }
    ];
    k.physicalHazards = {
      structuralDamageRisk: hz(
        true,
        ['ncsu-wisteria-sinensis'],
        'Twining woody vine can girdle and damage trees, fences, and structures if unmanaged.'
      ),
      handlingPrecautions: hz(
        'Provide strong support; keep clear of gutters, weak trellises, and valued trees.',
        ['ncsu-wisteria-sinensis'],
        'Physical/structure hazard from vigorous twining growth habit.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'chinese-wisteria-invasive-regional',
        category: 'invasiveness',
        canonicalTitle: 'Chinese wisteria — regional invasive (NC / Eastern USA)',
        summary:
          'Wisteria sinensis is invasive in North Carolina and Eastern USA contexts per NCSU. Not labeled globally invasive. Confirm local restrictions before planting.',
        severity: 'WARNING',
        evidenceClass: SS,
        regionScope: {
          level: 'STATE_PROVINCE',
          codes: ['NC-US'],
          label: 'North Carolina / Eastern USA'
        },
        sourceIds: ['ncsu-wisteria-sinensis'],
        requiresOwnerReview: true,
        status: 'owner_review'
      }),
      warning({
        warningId: 'chinese-wisteria-toxicity',
        category: 'toxicity',
        canonicalTitle: 'Chinese wisteria — poison / pet toxicity',
        summary:
          'NCSU: low-severity poison (seeds/pods among parts of concern). ASPCA: Wisteria spp. toxic to dogs, cats, and horses.',
        severity: 'WARNING',
        evidenceClass: SS,
        regionScope: { level: 'GLOBAL', codes: [], label: 'Species-level toxicology' },
        sourceIds: ['ncsu-wisteria-sinensis', 'aspca-wisteria']
      }),
      warning({
        warningId: 'chinese-wisteria-twining-damage',
        category: 'physical_hazard',
        canonicalTitle: 'Chinese wisteria — twining vine structural damage',
        summary:
          'Vigorous twining growth can damage structures and host trees if left unmanaged.',
        severity: 'CAUTION',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: null },
        sourceIds: ['ncsu-wisteria-sinensis']
      })
    ];
    return {
      slug: 'chinese-wisteria',
      scientific: 'Wisteria sinensis',
      batch: 1,
      plantKnowledge: k
    };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-ginkgo-biloba',
        'Royal Horticultural Society',
        'Ginkgo biloba',
        'https://www.rhs.org.uk/plants/8009/ginkgo-biloba/details',
        'horticultural_society'
      ),
      src(
        'ncsu-ginkgo-biloba',
        'North Carolina State University Extension Gardener',
        'Ginkgo biloba (Maidenhair Tree)',
        'https://plants.ces.ncsu.edu/plants/ginkgo-biloba/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = {
      ...unknownToxicity('Pet toxicity not asserted for ginkgo.'),
      humanToxicity: u(
        'Traditional seed processing exists in some cuisines; raw-seed toxicity claims not asserted without SOURCE — UNKNOWN.'
      )
    };
    k.cultivarCaveats = {
      cultivarDependent: hz(
        true,
        ['ncsu-ginkgo-biloba'],
        'NCSU: dioecious; female trees produce foul-smelling fleshy seeds — male clones often preferred for landscape.'
      ),
      affectedTraits: hz(
        ['sex_expression', 'fruit_mess', 'odor'],
        ['ncsu-ginkgo-biloba'],
        'Sex (male vs female) determines whether messy, odorous seeds are produced.'
      ),
      explanation: hz(
        'Prefer grafted male cultivars for ornamental street/yard use if seed mess/odor is undesirable.',
        ['ncsu-ginkgo-biloba'],
        'NCSU: seeds only on female trees; outer fleshy pulp foul-smelling when ripe.'
      )
    };
    k.importantNotes = [
      {
        noteId: 'ginkgo-female-fruit-odor',
        value:
          'Female ginkgo trees drop fleshy seeds with strong odor and mess in fall; choose male cultivars for clean ornamental use.',
        evidenceClass: HZ,
        sourceIds: ['ncsu-ginkgo-biloba'],
        shortExcerpt:
          'NCSU: dioecious; seeds only on female trees; outer fleshy pulp foul-smelling when ripe.',
        status: 'asserted'
      }
    ];
    k.harvestUseWarnings = {
      edibleParts: u(
        'Seeds traditionally processed in some cuisines; do not claim culinary safety or toxicity without SOURCE — UNKNOWN here.'
      )
    };
    k.warnings = [
      warning({
        warningId: 'ginkgo-female-mess-odor',
        category: 'cultivar_caveat',
        canonicalTitle: 'Ginkgo — female fruit odor / mess',
        summary:
          'Dioecious species: female trees produce foul-smelling fleshy seeds. Prefer male cultivars for landscape cleanliness.',
        severity: 'INFO',
        evidenceClass: HZ,
        regionScope: { level: 'GLOBAL', codes: [], label: 'Cultivar / sex selection' },
        sourceIds: ['ncsu-ginkgo-biloba']
      })
    ];
    return { slug: 'ginkgo', scientific: 'Ginkgo biloba', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
      src(
        'rhs-betula-pendula',
        'Royal Horticultural Society',
        'Betula pendula (silver birch)',
        'https://www.rhs.org.uk/plants/2217/betula-pendula/details',
        'horticultural_society'
      ),
      src(
        'ncsu-betula-pendula',
        'North Carolina State University Extension Gardener',
        'Betula pendula (European White Birch)',
        'https://plants.ces.ncsu.edu/plants/betula-pendula/',
        'university_extension'
      )
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity('Pet toxicity not asserted for silver birch.');
    k.allergenicity = {
      pollenAllergenicity: hz(
        'elevated',
        ['ncsu-betula-pendula'],
        'Birch pollen is a well-known seasonal allergen in temperate regions — heuristic allergenicity note, not a clinical assay.'
      ),
      respiratoryIrritation: hz(
        'pollen_season',
        ['ncsu-betula-pendula'],
        'Sensitive individuals may react to birch pollen during flowering season (heuristic).'
      )
    };
    k.warnings = [
      warning({
        warningId: 'silver-birch-pollen-allergen',
        category: 'allergenicity',
        canonicalTitle: 'Silver birch — pollen allergenicity',
        summary:
          'Birch pollen is a well-known seasonal allergen for sensitive people. Treat as heuristic landscape note.',
        severity: 'CAUTION',
        evidenceClass: HZ,
        regionScope: { level: 'REGION', codes: [], label: 'Temperate pollen seasons' },
        sourceIds: ['ncsu-betula-pendula']
      })
    ];
    return { slug: 'silver-birch', scientific: 'Betula pendula', batch: 1, plantKnowledge: k };
  })(),

  (() => {
    const sources = [
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
    ];
    const k = baseKnowledge(sources);
    k.toxicity = unknownToxicity('Pet toxicity not asserted for blue gum in this packet.');
    k.invasiveness = {
      invasiveStatus: ss(
        'invasive_in_regions',
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
      invasiveRegions: hz(
        ['California', 'Chile', 'South Africa', 'Portugal', 'Spain'],
        ['cabi-eucalyptus-globulus'],
        'Representative jurisdictions commonly cited for blue gum weed/invasive risk; exact statutory lists vary — confirm locally.'
      ),
      weedRisk: ss(
        'elevated_outside_native_range',
        ['cabi-eucalyptus-globulus'],
        'Documented weed/invasive risk outside native Australian range.'
      ),
      spreadMechanism: hz(
        'seed_wind_disturbance',
        ['cabi-eucalyptus-globulus'],
        'Spread mechanisms summarized from invasive-species literature; treat as provisional.'
      ),
      containmentNote: ss(
        'Check local invasive-species and planting regulations before landscape use.',
        ['cabi-eucalyptus-globulus'],
        'Regional restrictions and invasive status vary; Owner review retained on Batch 1 blue-gum.'
      )
    };
    k.regionalRestrictions = [
      {
        region: { level: 'STATE_PROVINCE', codes: ['CA-US'], label: 'California, USA' },
        restrictionType: 'discouraged',
        authority: 'Local / state invasive plant guidance (verify current list)',
        restrictionSummary: hz(
          'Blue gum may be discouraged or regulated as a weed/invasive risk in parts of California; confirm current official list.',
          ['cabi-eucalyptus-globulus'],
          'Regional discouragement inferred from invasive-species documentation — not a substitute for the current legal list.'
        )
      }
    ];
    k.importantNotes = [
      {
        noteId: 'blue-gum-owner-review',
        value: 'Batch 1 retains needsReview for invasive potential and regional restrictions.',
        evidenceClass: SS,
        sourceIds: ['powo-eucalyptus-globulus'],
        shortExcerpt: 'Landscape use needs local review (Batch 1 needsReviewReason).',
        status: 'asserted'
      }
    ];
    k.warnings = [
      warning({
        warningId: 'blue-gum-invasive-regional',
        category: 'invasiveness',
        canonicalTitle: 'Blue gum — regional invasive / weed risk',
        summary:
          'Eucalyptus globulus has documented invasive/weed risk in multiple jurisdictions outside its native range. Not labeled globally invasive.',
        severity: 'WARNING',
        evidenceClass: SS,
        regionScope: {
          level: 'REGION',
          codes: ['CA-US', 'CL', 'ZA', 'PT', 'ES'],
          label: 'Selected jurisdictions'
        },
        sourceIds: ['cabi-eucalyptus-globulus'],
        requiresOwnerReview: true,
        status: 'owner_review'
      })
    ];
    return { slug: 'blue-gum', scientific: 'Eucalyptus globulus', batch: 1, plantKnowledge: k };
  })(),

  herbCulinary({
    slug: 'common-thyme',
    scientific: 'Thymus vulgaris',
    sources: [
      src(
        'rhs-thymus-vulgaris',
        'Royal Horticultural Society',
        'Thymus vulgaris (thyme)',
        'https://www.rhs.org.uk/plants/18148/thymus-vulgaris/details',
        'horticultural_society'
      ),
      src(
        'ncsu-thymus-vulgaris',
        'North Carolina State University Extension Gardener',
        'Thymus vulgaris (Common Thyme)',
        'https://plants.ces.ncsu.edu/plants/thymus-vulgaris/',
        'university_extension'
      )
    ],
    edibleParts: ['culinary_leaves'],
    edibleExcerpt:
      'RHS / NCSU: thyme is a culinary herb grown for aromatic foliage — not a pet-safety certificate.',
    sourceIds: ['rhs-thymus-vulgaris', 'ncsu-thymus-vulgaris']
  }),

  herbCulinary({
    slug: 'garden-sage',
    scientific: 'Salvia officinalis',
    sources: [
      src(
        'rhs-salvia-officinalis',
        'Royal Horticultural Society',
        'Salvia officinalis (sage)',
        'https://www.rhs.org.uk/plants/16352/salvia-officinalis/details',
        'horticultural_society'
      ),
      src(
        'ncsu-salvia-officinalis',
        'North Carolina State University Extension Gardener',
        'Salvia officinalis (Garden Sage)',
        'https://plants.ces.ncsu.edu/plants/salvia-officinalis/',
        'university_extension'
      )
    ],
    edibleParts: ['culinary_leaves'],
    edibleExcerpt:
      'RHS / NCSU: garden sage is a culinary herb — culinary foliage context only; pet toxicity UNKNOWN.',
    sourceIds: ['rhs-salvia-officinalis', 'ncsu-salvia-officinalis']
  }),

  herbCulinary({
    slug: 'turmeric',
    scientific: 'Curcuma longa',
    sources: [
      src(
        'uf-ifas-turmeric',
        'University of Florida IFAS Extension',
        'Turmeric Production Guide',
        'https://edis.ifas.ufl.edu/publication/HS1429',
        'university_extension'
      )
    ],
    edibleParts: ['rhizome'],
    edibleExcerpt:
      'UF/IFAS turmeric production guidance: rhizomes are the culinary/spice crop — not a pet-safety certificate.',
    sourceIds: ['uf-ifas-turmeric']
  })
];

// Structural completeness: ensure contract version is explicit on every object
for (const row of BATCH1_ENRICHMENT_PLANTS) {
  row.plantKnowledge.plantKnowledgeContractVersion =
    PLANT_KNOWLEDGE_WARNINGS_CONTRACT_VERSION;
}

export default BATCH1_ENRICHMENT_PLANTS;
