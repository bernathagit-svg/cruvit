/**
 * CRUVIT Bulk Catalog Expansion V1 — Batch 2 definitions (30 plants).
 * Evidence-first trait structure (Batch 2 rule). Free/open sources only.
 * Not imported by product runtime.
 */

export const BATCH_ID = 'bulk-catalog-batch-2-v1';
export const BATCH_SIZE = 30;

const VERIFIED = '2026-08-31';

/** @param {string} value @param {'SOURCE_SUPPORTED'|'HEURISTIC_ASSERTION'|'UNKNOWN'} evidenceClass */
function trait(value, evidenceClass, sourceIds, shortExcerpt, transformation) {
  const o = { value, evidenceClass, sourceIds, shortExcerpt };
  if (transformation) o.transformation = transformation;
  return o;
}

function boolTrait(value, evidenceClass, sourceIds, shortExcerpt, transformation) {
  return trait(value, evidenceClass, sourceIds, shortExcerpt, transformation);
}

function unknownTrait(shortExcerpt) {
  return { status: 'unknown', evidenceClass: 'UNKNOWN', sourceIds: [], shortExcerpt };
}

function repro(value, evidenceClass, sourceIds, shortExcerpt, transformation) {
  const o = { value, evidenceClass, sourceIds, shortExcerpt };
  if (transformation) o.transformation = transformation;
  return o;
}

function src(sourceId, institution, title, url, authorityTier) {
  return { sourceId, institution, title, url, authorityTier, verifiedAt: VERIFIED };
}

export const BATCH2_PLANTS = Object.freeze([
  {
    slug: 'hazelnut',
    common: 'Hazelnut',
    scientific: 'Corylus avellana',
    aliases: ['hazelnut', 'corylus avellana', 'european hazel', 'filbert', 'cobnut'],
    archetypes: ['temperate-chill-fruit', 'tree', 'frost-tolerant'],
    groupIds: ['temperate-chill-fruit-tree'],
    sources: [
      src(
        'ncsu-corylus-avellana',
        'North Carolina State University Extension Gardener',
        'Corylus avellana (European Hazel)',
        'https://plants.ces.ncsu.edu/plants/corylus-avellana/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait(
        'low',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'USDA Plant Hardiness Zone: 4a–8b.',
        'Zone 4a lower bound → frostSensitivity=low (hardy temperate shrub/tree).'
      ),
      coldTolerance: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'USDA Plant Hardiness Zone: 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b.',
        'Survives zone 4a winters → coldTolerance=high.'
      ),
      heatTolerance: trait(
        'medium',
        'HEURISTIC_ASSERTION',
        ['ncsu-corylus-avellana'],
        'NCSU lists zones to 8b but does not publish a heat-mortality rating; temperate native range used as provisional heuristic.',
        'No direct heat-tolerance excerpt → HEURISTIC_ASSERTION.'
      ),
      humidityTolerance: unknownTrait(
        'NCSU page does not state atmospheric humidity tolerance; left UNKNOWN.'
      ),
      waterNeeds: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'Soil Drainage: Good Drainage; Moist.',
        'Moist but well-drained soils → waterNeeds=medium.'
      ),
      sunNeeds: trait(
        'full_sun',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'Light: Full sun (6 or more hours of direct sunlight a day); Partial Shade (2–6 hours).',
        'Primary recommendation full sun; partial shade tolerated.'
      ),
      drainageNeeds: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'Soil Drainage: Good Drainage.',
        'Good drainage requirement → drainageNeeds=high.'
      ),
      needsWinterChill: boolTrait(
        true,
        'HEURISTIC_ASSERTION',
        ['ncsu-corylus-avellana'],
        'Male catkins hang all winter; bloom late winter to early spring on bare branches — temperate dormancy cue implied but no chill-hour figure published.',
        'Temperate nut crop with winter catkins → needsWinterChill=true (heuristic; no hour count).'
      ),
      floweringRequirements: trait(
        'Both male and female flowers on the same plant; yellow-brown male catkins release pollen in late winter to early spring.',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'Both male and female flowers can be found on this plant. They bloom in late winter to early spring on the still bare branches.'
      ),
      fruitingRequirements: trait(
        'Edible nuts ripen in late summer; clusters of 1–5 nuts released from husk when ripe.',
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'The fruit, in the form of a nut, is enclosed by a short leafy involucre… released from the husk in late summer when the nut has ripened.'
      )
    },
    quantitative: {},
    reproductive: {
      monoecious: repro(
        true,
        'SOURCE_SUPPORTED',
        ['ncsu-corylus-avellana'],
        'Both male and female flowers can be found on this plant.'
      ),
      self_fertile: repro(
        false,
        'HEURISTIC_ASSERTION',
        ['ncsu-corylus-avellana'],
        'Monoecious with wind-pollinated catkins; named cultivars often need cross-pollination for best nut set — not explicitly stated on NCSU page.',
        'Commercial hazelnut production typically uses pollinizer cultivars.'
      ),
      requires_pollinator: repro(
        true,
        'HEURISTIC_ASSERTION',
        ['ncsu-corylus-avellana'],
        'Wind-pollinated catkins; cross-pollination between compatible cultivars improves yield.',
        'Wind pollination + cultivar guidance → requires_pollinator=true (wind as vector).'
      )
    },
    climateLabel: 'Cool to mild temperate; USDA zones 4a–8b',
    tags: ['temperate', 'nut', 'shrub', 'tree'],
    floweringRequirements:
      'Monoecious; male catkins release pollen in late winter to early spring on bare branches.',
    fruitingRequirements:
      'Hazelnuts ripen in late summer; best crops with compatible pollinizer cultivars in cool temperate climates.'
  },
  {
    slug: 'chestnut',
    common: 'Sweet Chestnut',
    scientific: 'Castanea sativa',
    aliases: ['chestnut', 'castanea sativa', 'sweet chestnut', 'spanish chestnut'],
    archetypes: ['temperate-chill-fruit', 'tree', 'mediterranean'],
    groupIds: ['temperate-chill-fruit-tree'],
    sources: [
      src(
        'rhs-castanea-sativa',
        'Royal Horticultural Society',
        'Castanea sativa (sweet chestnut)',
        'https://www.rhs.org.uk/plants/3143/castanea-sativa/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait(
        'low',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'RHS hardiness rating H6 (−20°C to −15°C).',
        'H6 hardiness → frostSensitivity=low.'
      ),
      coldTolerance: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Hardiness: H6 (−20°C to −15°C).',
        'Published RHS hardiness band → coldTolerance=high.'
      ),
      heatTolerance: trait(
        'medium',
        'HEURISTIC_ASSERTION',
        ['rhs-castanea-sativa'],
        'RHS does not publish a heat-tolerance class; Mediterranean to temperate native range used provisionally.',
        'No direct heat excerpt.'
      ),
      humidityTolerance: unknownTrait('No atmospheric humidity rating in consulted RHS/NCSU excerpts.'),
      waterNeeds: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Moisture: Moist but well-drained.',
        'Moist but well-drained → waterNeeds=medium.'
      ),
      sunNeeds: trait(
        'full_sun',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Aspect: Full sun.',
        'RHS full sun → sunNeeds=full_sun.'
      ),
      drainageNeeds: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Moisture: Moist but well-drained.',
        'Well-drained requirement → drainageNeeds=high.'
      ),
      needsWinterChill: boolTrait(
        true,
        'HEURISTIC_ASSERTION',
        ['rhs-castanea-sativa'],
        'Temperate deciduous nut tree; RHS describes summer/autumn fruiting after spring flowering — chill implied, no hour count.',
        'Temperate fruiting tree → needsWinterChill=true (heuristic).'
      ),
      floweringRequirements: trait(
        'Long yellow catkins in summer; wind-pollinated.',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Flowers: Long yellow catkins in summer.'
      ),
      fruitingRequirements: trait(
        'Spiny husks enclosing edible nuts ripen in autumn.',
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Fruit: Spiny husks enclosing edible nuts ripen in autumn.'
      )
    },
    quantitative: {
      minimum_survival_temperature_c: trait(
        -20,
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Hardiness H6 (−20°C to −15°C).',
        'Lower bound of RHS H6 band stored as minimum_survival_temperature_c=-20.'
      )
    },
    reproductive: {
      monoecious: repro(
        true,
        'HEURISTIC_ASSERTION',
        ['rhs-castanea-sativa'],
        'Wind-pollinated catkins; Castanea species are typically monoecious though RHS page does not use the term.',
        'Standard Castanea biology.'
      ),
      requires_pollinator: repro(
        true,
        'SOURCE_SUPPORTED',
        ['rhs-castanea-sativa'],
        'Long yellow catkins in summer — wind-pollinated chestnut flowers.',
        'Wind pollination for nut set.'
      )
    },
    climateLabel: 'Temperate to Mediterranean; RHS H6',
    tags: ['temperate', 'nut', 'tree', 'mediterranean'],
    floweringRequirements: 'Long yellow catkins in summer; wind-pollinated.',
    fruitingRequirements: 'Spiny husks with edible nuts ripen in autumn; needs warm summer for kernel fill.'
  },
  {
    slug: 'pecan',
    common: 'Pecan',
    scientific: 'Carya illinoinensis',
    aliases: ['pecan', 'carya illinoinensis', 'hardy pecan'],
    archetypes: ['temperate-chill-fruit', 'tree', 'drought-tolerant'],
    groupIds: ['temperate-chill-fruit-tree'],
    sources: [
      src(
        'ncsu-carya-illinoinensis',
        'North Carolina State University Extension Gardener',
        'Carya illinoinensis (Hardy Pecan)',
        'https://plants.ces.ncsu.edu/plants/carya-illinoinensis/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'USDA Plant Hardiness Zone: 5a–9b; late frosts can reduce nut production.',
        'Hardy to zone 5a but crop frost-sensitive → frostSensitivity=medium.'
      ),
      coldTolerance: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'USDA Plant Hardiness Zone: 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b.',
        'Zone 5a lower bound → coldTolerance=medium.'
      ),
      heatTolerance: trait(
        'high',
        'HEURISTIC_ASSERTION',
        ['ncsu-carya-illinoinensis'],
        'Native central/east-central US to Mexico; zones to 9b — heat-tolerant range inferred, no explicit rating.',
        'Southern US native range → heatTolerance=high (heuristic).'
      ),
      humidityTolerance: unknownTrait('NCSU does not publish humidity tolerance class.'),
      waterNeeds: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Soil Drainage: Good Drainage; Moist; Occasionally Dry.',
        'Moist well-drained but tolerates occasional dry → waterNeeds=medium.'
      ),
      sunNeeds: trait(
        'full_sun',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Hardy pecan grows best in full sun to partial shade.',
        'Best in full sun → sunNeeds=full_sun.'
      ),
      drainageNeeds: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Tolerates clay, sand, and loam soils as long as they are well drained.',
        'Well-drained soils required → drainageNeeds=high.'
      ),
      needsWinterChill: boolTrait(
        true,
        'HEURISTIC_ASSERTION',
        ['ncsu-carya-illinoinensis'],
        'Nut production can be reduced in the northern part of its growing range, especially when spring is late and the summer is cool.',
        'Northern limit tied to season length/chill → needsWinterChill=true (heuristic).'
      ),
      floweringRequirements: trait(
        'Monoecious; separate male catkins and female spikes; type I and type II cultivars for cross-pollination.',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Pecan trees are monoecious… Pollen is not released when flowers are receptive… planting at least three cultivars with at least one of each pollination type.'
      ),
      fruitingRequirements: trait(
        'Sweet edible nuts ripen in fall; scab and late frost can reduce crop.',
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Sweet edible nuts with a husk that splits into four sections when they ripen in the fall.'
      )
    },
    quantitative: {},
    reproductive: {
      monoecious: repro(
        true,
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Pecan trees are monoecious: they have separate male and female flowers on the same tree.'
      ),
      self_fertile: repro(
        false,
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'Pollen is not released when flowers are receptive, so pollination within and between the same cultivars is limited.',
        'Self-incompatibility timing → self_fertile=false.'
      ),
      requires_pollinator: repro(
        true,
        'SOURCE_SUPPORTED',
        ['ncsu-carya-illinoinensis'],
        'For optimum pollination, NC State Extension recommends planting at least three cultivars with at least one of each pollination type.',
        'Cross-pollination between type I and II cultivars required for best crops.'
      )
    },
    climateLabel: 'Warm temperate to subtropical; USDA zones 5a–9b',
    tags: ['temperate', 'nut', 'tree', 'drought-tolerant'],
    floweringRequirements:
      'Monoecious spring flowers; plant type I and type II cultivars for cross-pollination.',
    fruitingRequirements:
      'Fall nuts; best yields in long warm seasons; late spring frosts reduce production in northern range.'
  },
  {
    slug: 'medlar',
    common: 'Medlar',
    scientific: 'Mespilus germanica',
    aliases: ['medlar', 'mespilus germanica', 'common medlar'],
    archetypes: ['temperate-chill-fruit', 'tree', 'mediterranean'],
    sources: [
      src(
        'rhs-mespilus-germanica',
        'Royal Horticultural Society',
        'Mespilus germanica (medlar)',
        'https://www.rhs.org.uk/plants/10442/mespilus-germanica/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 → frostSensitivity=low.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 band → coldTolerance=high.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-mespilus-germanica'], 'No explicit heat rating; SW Asia / SE Europe native range.', 'Heuristic.'),
      humidityTolerance: unknownTrait('No humidity class in RHS excerpt.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Moisture: Moist but well-drained.', 'Moist well-drained → medium.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-mespilus-germanica'], 'Deciduous temperate fruit; flowers after leaf-out in late spring.', 'Temperate pome → chill heuristic.'),
      floweringRequirements: trait('White flowers in late spring.', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Flowers: White flowers in late spring.'),
      fruitingRequirements: trait('Brown fruit edible after bletting in late autumn.', 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Fruit: Brown fruit edible after bletting in late autumn.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-mespilus-germanica'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['rhs-mespilus-germanica'], 'RHS does not state pollination type; medlar often self-fertile in literature.', 'Provisional.')
    },
    climateLabel: 'Temperate; RHS H6',
    tags: ['temperate', 'fruit', 'tree'],
    floweringRequirements: 'White flowers in late spring after dormancy.',
    fruitingRequirements: 'Fruit harvested after bletting (softening) in late autumn.'
  },
  {
    slug: 'serviceberry',
    common: 'Serviceberry',
    scientific: 'Amelanchier canadensis',
    aliases: ['serviceberry', 'amelanchier canadensis', 'juneberry', 'shadbush'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant', 'tree'],
    sources: [
      src(
        'ncsu-amelanchier-canadensis',
        'North Carolina State University Extension Gardener',
        'Amelanchier canadensis (Canadian Serviceberry)',
        'https://plants.ces.ncsu.edu/plants/amelanchier-canadensis/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'USDA Plant Hardiness Zone: 3a–8b.', 'Zone 3a → low frost sensitivity.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'USDA Plant Hardiness Zone: 3a–8b.', 'Zone 3a → high cold tolerance.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['ncsu-amelanchier-canadensis'], 'Zones to 8b; no heat-mortality rating published.', 'Heuristic.'),
      humidityTolerance: unknownTrait('Not stated on NCSU page.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'Soil Drainage: Good Drainage; Moist.', 'Moist well-drained.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun listed.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['ncsu-amelanchier-canadensis'], 'Early spring white flowers before leaves fully expand; native to cool eastern North America.', 'Temperate berry tree.'),
      floweringRequirements: trait('Showy white flowers in early spring.', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'Showy white flowers in early spring.'),
      fruitingRequirements: trait('Edible red to purple berries in early summer.', 'SOURCE_SUPPORTED', ['ncsu-amelanchier-canadensis'], 'Edible berries ripen in early summer; sweet flavor when fully ripe.')
    },
    quantitative: {},
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['ncsu-amelanchier-canadensis'], 'Pollination details not on NCSU page; Amelanchier often self-fertile.', 'Provisional.')
    },
    climateLabel: 'Cool temperate; USDA zones 3a–8b',
    tags: ['temperate', 'fruit', 'shrub', 'native'],
    floweringRequirements: 'Early spring white flowers; very cold-hardy bloom.',
    fruitingRequirements: 'June berries; birds compete for ripe fruit in early summer.'
  },
  {
    slug: 'blackberry',
    common: 'Blackberry',
    scientific: 'Rubus fruticosus',
    aliases: ['blackberry', 'rubus fruticosus', 'bramble'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    sources: [
      src(
        'rhs-rubus-fruticosus',
        'Royal Horticultural Society',
        'Rubus fruticosus (blackberry)',
        'https://www.rhs.org.uk/plants/16283/rubus-fruticosus/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 hardy cane fruit.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 → high.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-rubus-fruticosus'], 'Temperate cane fruit; no heat rating on RHS page.', 'Heuristic.'),
      humidityTolerance: unknownTrait('Not published on RHS excerpt.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Moisture: Moist but well-drained.', 'Moist well-drained.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Aspect: Full sun.', 'Full sun for best fruit.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-rubus-fruticosus'], 'Summer-flowering floricane habit; temperate dormancy required.', 'Cane-fruit biology.'),
      floweringRequirements: trait('White or pink flowers in summer on floricanes.', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Flowers: White or pink flowers in summer.'),
      fruitingRequirements: trait('Black aggregate fruit follows flowers on second-year canes.', 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Fruit: Black aggregate fruit.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-rubus-fruticosus'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['rhs-rubus-fruticosus'], 'Most cultivated blackberries self-fertile; RHS page silent.', 'Provisional.')
    },
    climateLabel: 'Cool temperate; RHS H6',
    tags: ['temperate', 'fruit', 'shrub', 'cane-fruit'],
    floweringRequirements: 'Summer flowers on floricanes (second-year wood).',
    fruitingRequirements: 'Black berries on floricanes; prune spent canes after harvest.'
  },
  {
    slug: 'blackcurrant',
    common: 'Blackcurrant',
    scientific: 'Ribes nigrum',
    aliases: ['blackcurrant', 'ribes nigrum', 'black currant'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    groupIds: ['temperate-chill-fruit-tree'],
    sources: [
      src(
        'rhs-ribes-nigrum',
        'Royal Horticultural Society',
        'Ribes nigrum (blackcurrant)',
        'https://www.rhs.org.uk/plants/14128/ribes-nigrum/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Hardiness: H6 (−20°C to −15°C).', 'Very hardy shrub.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Hardiness: H6 (−20°C to −15°C).', 'H6.'),
      heatTolerance: trait('low', 'HEURISTIC_ASSERTION', ['rhs-ribes-nigrum'], 'Cool-climate currant; struggles in hot dry summers per RHS growing advice.', 'Cool-climate crop heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Aspect: Full sun to partial shade.', 'Full sun preferred.'),
      drainageNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Moisture: Moist but well-drained.', 'Moist but drained.'),
      needsWinterChill: boolTrait(true, 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Flowers: Yellow-green flowers in spring on bare wood or with young leaves.', 'Spring bloom after dormancy → chill required.'),
      floweringRequirements: trait('Yellow-green flowers in spring.', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Flowers: Yellow-green flowers in spring.'),
      fruitingRequirements: trait('Black berries in mid-summer.', 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Fruit: Black berries in mid-summer.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-ribes-nigrum'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['rhs-ribes-nigrum'], 'Blackcurrants largely self-fertile; RHS page does not state explicitly.', 'Standard cultivar behavior.')
    },
    climateLabel: 'Cool temperate; RHS H6',
    tags: ['temperate', 'fruit', 'shrub', 'chill'],
    floweringRequirements: 'Spring flowers on previous season wood; tolerates late frosts on buds.',
    fruitingRequirements: 'Mid-summer black berries; needs cool roots and steady moisture.'
  },
  {
    slug: 'cranberry',
    common: 'Cranberry',
    scientific: 'Vaccinium macrocarpon',
    aliases: ['cranberry', 'vaccinium macrocarpon', 'american cranberry'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    sources: [
      src(
        'ncsu-vaccinium-macrocarpon',
        'North Carolina State University Extension Gardener',
        'Vaccinium macrocarpon (American Cranberry)',
        'https://plants.ces.ncsu.edu/plants/vaccinium-macrocarpon/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'USDA Plant Hardiness Zone: 2a–7b.', 'Zone 2a extremely hardy.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'USDA Plant Hardiness Zone: 2a–7b.', 'Zone 2a.'),
      heatTolerance: trait('low', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'USDA zones only to 7b; native to cool bogs of northeastern North America.', 'Northern limit → low heat tolerance.'),
      humidityTolerance: trait('high', 'HEURISTIC_ASSERTION', ['ncsu-vaccinium-macrocarpon'], 'Bog plant requiring acidic wet conditions; atmospheric humidity not rated.', 'Bog ecology → high humidity heuristic.'),
      waterNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'Soil Drainage: Moist; native to bogs.', 'Bog moisture → high water needs.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun.'),
      drainageNeeds: trait('low', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'Grows in acidic bog soils that stay moist.', 'Bog/wet soil → low drainage need (tolerates wet).'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['ncsu-vaccinium-macrocarpon'], 'Cold-climate native; flowers late spring.', 'Northern bog species.'),
      floweringRequirements: trait('Pink flowers in late spring to early summer.', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'Pink flowers appear in late spring to early summer.'),
      fruitingRequirements: trait('Red berries ripen in autumn.', 'SOURCE_SUPPORTED', ['ncsu-vaccinium-macrocarpon'], 'Red berries ripen in autumn.')
    },
    quantitative: {},
    reproductive: {
      requires_pollinator: repro(true, 'HEURISTIC_ASSERTION', ['ncsu-vaccinium-macrocarpon'], 'Bee-pollinated Vaccinium; NCSU page does not detail pollination.', 'Berry crop standard.')
    },
    climateLabel: 'Cold temperate bog; USDA zones 2a–7b',
    tags: ['temperate', 'fruit', 'bog', 'acid-soil'],
    floweringRequirements: 'Late spring pink flowers; needs acidic wet or irrigated bed.',
    fruitingRequirements: 'Autumn red berries; commercial beds flooded for harvest.'
  },
  {
    slug: 'elderberry',
    common: 'Elderberry',
    scientific: 'Sambucus canadensis',
    aliases: ['elderberry', 'sambucus canadensis', 'american elder', 'common elderberry'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    sources: [
      src(
        'ncsu-sambucus-canadensis',
        'North Carolina State University Extension Gardener',
        'Sambucus canadensis (American Elder)',
        'https://plants.ces.ncsu.edu/plants/sambucus-canadensis/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'USDA Plant Hardiness Zone: 3a–9b.', 'Zone 3a hardy.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'USDA Plant Hardiness Zone: 3a–9b.', 'Wide cold range.'),
      heatTolerance: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'USDA zones to 9b.', 'Southern range to 9b.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'Soil Drainage: Good Drainage; Moist.', 'Moist sites.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun.'),
      drainageNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'Soil Drainage: Good Drainage; Moist.', 'Moist but drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['ncsu-sambucus-canadensis'], 'Large white flower clusters in summer on new wood.', 'Temperate native.'),
      floweringRequirements: trait('Large flat-topped white flower clusters in summer.', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'Large flat-topped clusters of white flowers bloom in summer.'),
      fruitingRequirements: trait('Purple-black berries in late summer to fall; cook before eating.', 'SOURCE_SUPPORTED', ['ncsu-sambucus-canadensis'], 'Purple-black berries ripen in late summer to fall.')
    },
    quantitative: {},
    reproductive: {
      self_fertile: repro(false, 'HEURISTIC_ASSERTION', ['ncsu-sambucus-canadensis'], 'Cross-pollination between cultivars improves yield; not explicit on NCSU.', 'Elderberry orchard practice.')
    },
    climateLabel: 'Temperate; USDA zones 3a–9b',
    tags: ['temperate', 'fruit', 'shrub', 'native'],
    floweringRequirements: 'Summer corymbs on new growth; tolerates wet soils.',
    fruitingRequirements: 'Late-summer berry clusters for jelly/wine; plant multiple cultivars for yield.'
  },
  {
    slug: 'sea-buckthorn',
    common: 'Sea Buckthorn',
    scientific: 'Hippophae rhamnoides',
    aliases: ['sea buckthorn', 'hippophae rhamnoides', 'seaberry', 'sallowthorn'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant', 'drought-tolerant'],
    sources: [
      src(
        'rhs-hippophae-rhamnoides',
        'Royal Horticultural Society',
        'Hippophae rhamnoides (sea buckthorn)',
        'https://www.rhs.org.uk/plants/8264/hippophae-rhamnoides/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Hardiness: H7 (−20°C and below).', 'H7 very hardy.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Hardiness: H7 (−20°C and below).', 'H7.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-hippophae-rhamnoides'], 'Coastal and continental range; no heat rating.', 'Heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Moisture: Well-drained; tolerates dry coastal sites.', 'Drought-tolerant coastal shrub.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Moisture: Well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-hippophae-rhamnoides'], 'Deciduous temperate shrub; spring flowers.', 'Northern species.'),
      floweringRequirements: trait('Inconspicuous spring flowers before leaves.', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Flowers: Inconspicuous spring flowers.'),
      fruitingRequirements: trait('Orange berries on female plants in autumn.', 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Fruit: Orange berries on female plants in autumn.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Hardiness H7 (−20°C and below).', 'H7 lower bound at −20°C.')
    },
    reproductive: {
      dioecious: repro(true, 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Fruit: Orange berries on female plants in autumn.', 'Female-only fruit → dioecious.'),
      requires_pollinator: repro(true, 'SOURCE_SUPPORTED', ['rhs-hippophae-rhamnoides'], 'Orange berries on female plants — male plant needed for pollination.', 'Dioecious pollination.')
    },
    climateLabel: 'Cold hardy coastal/temperate; RHS H7',
    tags: ['temperate', 'fruit', 'shrub', 'drought-tolerant'],
    floweringRequirements: 'Inconspicuous spring flowers; separate male and female plants required.',
    fruitingRequirements: 'Orange vitamin-rich berries on female plants; needs male pollinizer nearby.'
  },
  {
    slug: 'soursop',
    common: 'Soursop',
    scientific: 'Annona muricata',
    aliases: ['soursop', 'annona muricata', 'guanabana', 'graviola'],
    archetypes: ['tropical-fruit', 'frost-sensitive', 'humidity-sensitive'],
    groupIds: ['tropical-frost-sensitive-fruit'],
    sources: [
      src(
        'uf-ifas-soursop',
        'University of Florida IFAS Extension',
        'Soursop Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG343',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Soursop trees are extremely frost sensitive.', 'Explicit frost sensitivity.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Trees are damaged or killed by temperatures below 30°F (−1°C).', 'Sub-freezing damage → low cold tolerance.'),
      heatTolerance: trait('high', 'HEURISTIC_ASSERTION', ['uf-ifas-soursop'], 'Tropical lowland species; no explicit heat ceiling published.', 'Tropical native heuristic.'),
      humidityTolerance: trait('high', 'HEURISTIC_ASSERTION', ['uf-ifas-soursop'], 'Best in humid tropical lowlands per IFAS climate discussion.', 'Humid tropics heuristic.'),
      waterNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Trees require regular watering for best growth and fruit production.', 'Regular watering required.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Plant in full sun for best growth and fruiting.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Plant in well-drained soil.', 'Well-drained soil.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Tropical species with no winter chill requirement described.', 'No chill for tropical Annona.'),
      floweringRequirements: trait('Flowers on new growth in warm humid seasons.', 'HEURISTIC_ASSERTION', ['uf-ifas-soursop'], 'IFAS describes flowering in warm months; no chill cue.', 'Tropical flowering.'),
      fruitingRequirements: trait('Large spiny green fruit in frost-free tropical warmth.', 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Fruit is a large spiny green syncarp produced in tropical climates.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-1, 'SOURCE_SUPPORTED', ['uf-ifas-soursop'], 'Trees are damaged or killed by temperatures below 30°F (−1°C).', '30°F converted to −1°C.')
    },
    reproductive: {
      self_fertile: repro(false, 'HEURISTIC_ASSERTION', ['uf-ifas-soursop'], 'Annona often benefits from hand or insect pollination; IFAS silent.', 'Provisional.')
    },
    climateLabel: 'Humid tropical; frost intolerant below ~−1°C',
    tags: ['tropical', 'fruit', 'tree', 'frost-sensitive'],
    floweringRequirements: 'Warm-season flowers; protect from any frost.',
    fruitingRequirements: 'Large soft fruit in continuous tropical warmth; killed by hard freeze.'
  },
  {
    slug: 'sapodilla',
    common: 'Sapodilla',
    scientific: 'Manilkara zapota',
    aliases: ['sapodilla', 'manilkara zapota', 'chiku', 'naseberry'],
    archetypes: ['tropical-fruit', 'subtropical-fruit', 'frost-sensitive'],
    groupIds: ['tropical-frost-sensitive-fruit'],
    sources: [
      src(
        'uf-ifas-sapodilla',
        'University of Florida IFAS Extension',
        'Sapodilla Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG051',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Sapodilla trees are injured by frost and freeze.', 'Frost injury stated.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Young trees are killed by temperatures in the mid-20s°F (−4 to −3°C).', 'Mid-20s°F kill young trees.'),
      heatTolerance: trait('high', 'HEURISTIC_ASSERTION', ['uf-ifas-sapodilla'], 'Native to tropical America; thrives in warm climates.', 'Tropical/subtropical heuristic.'),
      humidityTolerance: unknownTrait('IFAS does not publish humidity tolerance class.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Water regularly during dry periods.', 'Regular water in dry periods.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Plant in full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Well-drained soil is essential.', 'Well-drained essential.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Tropical evergreen fruit tree; no chill requirement mentioned.', 'No chill.'),
      floweringRequirements: trait('Small white flowers throughout warm season.', 'HEURISTIC_ASSERTION', ['uf-ifas-sapodilla'], 'IFAS notes year-round flowering potential in warm climates.', 'Evergreen tropical.'),
      fruitingRequirements: trait('Brown sweet fruit when fully ripe; slow to bear from seed.', 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Fruit is brown, sweet, and sandy-textured when ripe.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-4, 'SOURCE_SUPPORTED', ['uf-ifas-sapodilla'], 'Young trees are killed by temperatures in the mid-20s°F.', 'Mid-20s°F ≈ −4°C lower bound for young trees.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['uf-ifas-sapodilla'], 'Many sapodilla cultivars self-fruitful; IFAS does not state explicitly.', 'Provisional.')
    },
    climateLabel: 'Tropical to warm subtropical; frost sensitive',
    tags: ['tropical', 'subtropical', 'fruit', 'tree'],
    floweringRequirements: 'Intermittent warm-season flowers on evergreen tree.',
    fruitingRequirements: 'Brown sweet fruit; protect from frost especially when young.'
  },
  {
    slug: 'tamarind',
    common: 'Tamarind',
    scientific: 'Tamarindus indica',
    aliases: ['tamarind', 'tamarindus indica', 'indian date'],
    archetypes: ['tropical-fruit', 'subtropical-fruit', 'drought-tolerant', 'frost-sensitive'],
    sources: [
      src(
        'uf-ifas-tamarind',
        'University of Florida IFAS Extension',
        'Tamarind Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG056',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Tamarind trees are damaged by frost and freezes.', 'Frost damage stated.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Young trees are killed by temperatures below about 28°F (−2°C).', '28°F threshold.'),
      heatTolerance: trait('high', 'HEURISTIC_ASSERTION', ['uf-ifas-tamarind'], 'Thrives in tropical and subtropical climates.', 'Tropical tree heuristic.'),
      humidityTolerance: unknownTrait('Not published.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Established trees are drought tolerant.', 'Drought tolerant when established.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Plant in full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Well-drained soil.', 'Well-drained.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Tropical leguminous tree; no winter chill described.', 'No chill.'),
      floweringRequirements: trait('Red and yellow flowers in spring.', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Trees produce red and yellow flowers in spring.'),
      fruitingRequirements: trait('Brown pods with sweet-tart pulp mature in late spring to early summer.', 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Brown indehiscent pods contain sweet-tart pulp.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-2, 'SOURCE_SUPPORTED', ['uf-ifas-tamarind'], 'Young trees are killed by temperatures below about 28°F (−2°C).', '28°F → −2°C.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['uf-ifas-tamarind'], 'Most tamarind trees self-fertile; IFAS silent.', 'Provisional.')
    },
    climateLabel: 'Tropical to subtropical; drought-tolerant when established',
    tags: ['tropical', 'subtropical', 'fruit', 'tree', 'drought-tolerant'],
    floweringRequirements: 'Spring racemes of red-yellow flowers.',
    fruitingRequirements: 'Edible pod pulp; young trees need frost protection.'
  },
  {
    slug: 'jujube',
    common: 'Jujube',
    scientific: 'Ziziphus jujuba',
    aliases: ['jujube', 'ziziphus jujuba', 'chinese date', 'red date'],
    archetypes: ['subtropical-fruit', 'drought-tolerant', 'heat-tolerant'],
    sources: [
      src(
        'uf-ifas-jujube',
        'University of Florida IFAS Extension',
        'Jujube Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG048',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('medium', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Jujube trees are hardy but young growth can be damaged by late spring frosts.', 'Hardy tree, frost on young growth.'),
      coldTolerance: trait('medium', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Trees tolerate winter temperatures below freezing and hot summers.', 'Freezing winters tolerated.'),
      heatTolerance: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Trees tolerate winter temperatures below freezing and hot summers.', 'Hot summers tolerated.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Trees are drought tolerant once established.', 'Drought tolerant established.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Plant in full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Well-drained soil.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['uf-ifas-jujube'], 'Flowers in late spring after dormancy; some cultivars need winter chill for best fruit.', 'Temperate Asian fruit tree.'),
      floweringRequirements: trait('Small yellow-green flowers in late spring.', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Small yellow-green flowers appear in late spring.'),
      fruitingRequirements: trait('Apple-like fruit ripens in late summer to fall.', 'SOURCE_SUPPORTED', ['uf-ifas-jujube'], 'Fruit ripens in late summer to fall.')
    },
    quantitative: {},
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['uf-ifas-jujube'], 'Many jujube cultivars self-fruitful.', 'Provisional.')
    },
    climateLabel: 'Warm temperate to subtropical; heat and drought tolerant',
    tags: ['subtropical', 'fruit', 'tree', 'drought-tolerant'],
    floweringRequirements: 'Late spring flowers after leaf-out; late frosts damage young shoots.',
    fruitingRequirements: 'Crisp to chewy fruit in late summer; very drought tolerant when established.'
  },
  {
    slug: 'pitanga',
    common: 'Surinam Cherry',
    scientific: 'Eugenia uniflora',
    aliases: ['pitanga', 'eugenia uniflora', 'surinam cherry', 'brazilian cherry'],
    archetypes: ['subtropical-fruit', 'tropical-fruit', 'frost-sensitive'],
    groupIds: ['tropical-frost-sensitive-fruit'],
    sources: [
      src(
        'uf-ifas-surinam-cherry',
        'University of Florida IFAS Extension',
        'Surinam Cherry Growing in the Florida Home Landscape',
        'https://edis.ifas.ufl.edu/publication/MG055',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Surinam cherry is damaged by frost and freezes.', 'Frost damage stated.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Trees are injured by temperatures below 28°F (−2°C).', '28°F injury threshold.'),
      heatTolerance: trait('high', 'HEURISTIC_ASSERTION', ['uf-ifas-surinam-cherry'], 'Subtropical to tropical shrub; thrives in warm climates.', 'Warm climate heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Water during prolonged dry periods.', 'Water in dry periods.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Plant in full sun for best flowering and fruiting.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Well-drained soil.', 'Well-drained.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Evergreen subtropical shrub; no chill requirement.', 'No chill.'),
      floweringRequirements: trait('White fragrant flowers followed by ribbed red fruit.', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Fragrant white flowers are followed by ribbed red fruit.'),
      fruitingRequirements: trait('Red to dark purple berries; multiple flushes per year in warm climates.', 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Fruit may be produced several times a year in warm climates.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-2, 'SOURCE_SUPPORTED', ['uf-ifas-surinam-cherry'], 'Trees are injured by temperatures below 28°F (−2°C).', '28°F → −2°C.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['uf-ifas-surinam-cherry'], 'Surinam cherry generally self-fertile.', 'Provisional.')
    },
    climateLabel: 'Frost-free subtropical to tropical',
    tags: ['subtropical', 'tropical', 'fruit', 'shrub'],
    floweringRequirements: 'Fragrant white flowers in warm seasons.',
    fruitingRequirements: 'Ribbed cherries; repeated crops in frost-free warmth.'
  },
  {
    slug: 'asparagus',
    common: 'Asparagus',
    scientific: 'Asparagus officinalis',
    aliases: ['asparagus', 'asparagus officinalis', 'garden asparagus'],
    archetypes: ['temperate-chill-fruit', 'herb-edible', 'frost-tolerant'],
    sources: [
      src(
        'rhs-asparagus-officinalis',
        'Royal Horticultural Society',
        'Asparagus officinalis (asparagus)',
        'https://www.rhs.org.uk/plants/1673/asparagus-officinalis/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 hardy perennial.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Hardiness: H6 (−20°C to −15°C).', 'H6.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-asparagus-officinalis'], 'Cool-season spear crop; summer fern growth slows in extreme heat.', 'Vegetable heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Moisture: Moist but well-drained.', 'Moist well-drained.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-asparagus-officinalis'], 'Dormant crowns break in spring after winter cold.', 'Temperate perennial vegetable.'),
      floweringRequirements: trait('Insignificant flowers on ferny summer growth.', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Flowers: Insignificant flowers.'),
      fruitingRequirements: trait('Red berries on female plants if allowed to fruit.', 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Fruit: Red berries on female plants.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-asparagus-officinalis'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {
      dioecious: repro(true, 'HEURISTIC_ASSERTION', ['rhs-asparagus-officinalis'], 'Red berries on female plants implies separate sexes.', 'Dioecious asparagus.')
    },
    climateLabel: 'Cool temperate perennial; RHS H6',
    tags: ['temperate', 'vegetable', 'perennial', 'edible'],
    floweringRequirements: 'Stop harvesting and allow fern growth; insignificant summer flowers.',
    fruitingRequirements: 'Edible spring spears; red berries on female plants if not deadheaded.'
  },
  {
    slug: 'artichoke',
    common: 'Globe Artichoke',
    scientific: 'Cynara cardunculus var. scolymus',
    aliases: [
      'artichoke',
      'globe artichoke',
      'cynara scolymus',
      'cynara cardunculus scolymus group',
      'cynara cardunculus'
    ],
    archetypes: ['mediterranean', 'herb-edible', 'frost-tolerant'],
    taxonomyContract: {
      acceptedRank: 'infraspecific',
      acceptedScientificName: 'Cynara cardunculus var. scolymus',
      horticulturalSynonymGroup: 'Cynara cardunculus Scolymus Group',
      note: 'Canonical identity is the accepted infraspecific taxon (var. scolymus). RHS/NCSU Scolymus Group pages are rank-compatible horticultural treatments of globe artichoke; cardoon (species-level Cynara cardunculus without Scolymus Group) is NOT identity evidence.'
    },
    sources: [
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
    ],
    traits: {
      frostSensitivity: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-cynara-cardunculus-scolymus-group'],
        'NCSU USDA Plant Hardiness Zone: 7a–10b for Cynara cardunculus Scolymus Group.',
        'Zone 7a lower bound → frostSensitivity=medium (not fully frost-hardy temperate).'
      ),
      coldTolerance: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['ncsu-cynara-cardunculus-scolymus-group'],
        'USDA Plant Hardiness Zone: 7a, 7b, 8a, 8b, 9a, 9b, 10a, 10b.',
        'Zone 7a–10b → coldTolerance=medium.'
      ),
      heatTolerance: trait(
        'high',
        'HEURISTIC_ASSERTION',
        ['rhs-cynara-cardunculus-scolymus-group'],
        'Mediterranean crop widely grown in warm summers; RHS/NCSU pages do not publish a heat-mortality class.',
        'Mediterranean heuristic.'
      ),
      humidityTolerance: unknownTrait('RHS/NCSU Scolymus Group pages do not state atmospheric humidity tolerance.'),
      waterNeeds: trait(
        'medium',
        'SOURCE_SUPPORTED',
        ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
        'RHS: fertile, well-drained soil; NCSU Soil Drainage: Good Drainage; Moist.',
        'Moist but well-drained → waterNeeds=medium.'
      ),
      sunNeeds: trait(
        'full_sun',
        'SOURCE_SUPPORTED',
        ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
        'RHS: full sun; NCSU Light: Full sun (6 or more hours of direct sunlight a day).',
        'Full sun → sunNeeds=full_sun.'
      ),
      drainageNeeds: trait(
        'high',
        'SOURCE_SUPPORTED',
        ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
        'RHS: well-drained soil; NCSU Soil Drainage: Good Drainage.',
        'Well-drained → drainageNeeds=high.'
      ),
      needsWinterChill: boolTrait(
        false,
        'HEURISTIC_ASSERTION',
        ['rhs-cynara-cardunculus-scolymus-group'],
        'Herbaceous Mediterranean perennial; sources describe winter mulch protection, not temperate chill-hour requirement for flowering.',
        'No chill-hour requirement published → needsWinterChill=false (heuristic).'
      ),
      floweringRequirements: trait(
        'Large purple thistle-like flower heads in summer if buds are not harvested.',
        'SOURCE_SUPPORTED',
        ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
        'RHS: green scaly buds open to thistle-like purple flowers in summer and autumn. NCSU: buds can be left to bloom into bright purple thistle-like flowers.'
      ),
      fruitingRequirements: trait(
        'Edible immature flower buds harvested before opening (globe artichoke vegetable use).',
        'SOURCE_SUPPORTED',
        ['rhs-cynara-cardunculus-scolymus-group', 'ncsu-cynara-cardunculus-scolymus-group'],
        'RHS: Grown for their edible flower buds. NCSU: The unopened buds can be eaten—fleshy phyllaries and heart are edible.'
      )
    },
    quantitative: {
      // Zone 7a ≈ −17.8°C is a hardiness-zone class, not a published absolute survival °C for this cultivar group.
      // Retain H4-class numeric only if a rank-compatible source publishes it; NCSU zones alone → no invented °C.
    },
    reproductive: {
      cultivar_dependency: repro(
        true,
        'HEURISTIC_ASSERTION',
        ['rhs-cynara-cardunculus-scolymus-group'],
        'RHS: Many varieties of globe artichokes are available, varying in plant and bud size and bud colour — cultivar choice affects crop performance; no single cultivar chart asserted here.',
        'Cultivar dependence noted provisionally from RHS variety statement.'
      )
    },
    climateLabel: 'Mediterranean mild-winter perennial vegetable; USDA 7a–10b (NCSU Scolymus Group)',
    tags: ['mediterranean', 'vegetable', 'perennial', 'edible'],
    floweringRequirements:
      'Large purple heads if buds not cut; plant as perennial in mild climates.',
    fruitingRequirements: 'Harvest tight flower buds in late spring; mulch in colder zones.'
  },
  {
    slug: 'rhubarb',
    common: 'Rhubarb',
    scientific: 'Rheum rhabarbarum',
    aliases: ['rhubarb', 'rheum rhabarbarum', 'pie plant'],
    archetypes: ['temperate-chill-fruit', 'herb-edible', 'frost-tolerant'],
    sources: [
      src(
        'rhs-rheum-rhabarbarum',
        'Royal Horticultural Society',
        'Rheum rhabarbarum (rhubarb)',
        'https://www.rhs.org.uk/plants/14155/rheum-rhabarbarum/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Hardiness: H6 (−20°C to −15°C).', 'Very hardy.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Hardiness: H6 (−20°C to −15°C).', 'H6.'),
      heatTolerance: trait('low', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Struggles in hot climates; needs cool roots and moisture.', 'Cool-climate crop.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Aspect: Full sun to partial shade.', 'Sun to partial shade.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Crown breaks dormancy in early spring after winter cold.', 'Spring spear emergence after chill.'),
      floweringRequirements: trait('Tall flower spikes in summer if not removed.', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Flowers: Tall flower spikes in summer.'),
      fruitingRequirements: trait('Edible leaf stalks in spring; remove flower spikes to maintain vigor.', 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Harvest edible leaf stalks in spring.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-rheum-rhabarbarum'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Cool temperate; RHS H6',
    tags: ['temperate', 'vegetable', 'perennial', 'chill'],
    floweringRequirements: 'Remove bolting flower spikes; crowns need winter cold.',
    fruitingRequirements: 'Harvest tart stalks in spring only; toxic leaves.'
  },
  {
    slug: 'sweet-potato',
    common: 'Sweet Potato',
    scientific: 'Ipomoea batatas',
    aliases: ['sweet potato', 'ipomoea batatas', 'yam (colloquial)'],
    archetypes: ['subtropical-fruit', 'heat-tolerant', 'drought-tolerant'],
    sources: [
      src(
        'ncsu-ipomoea-batatas',
        'North Carolina State University Extension Gardener',
        'Ipomoea batatas (Sweet Potato)',
        'https://plants.ces.ncsu.edu/plants/ipomoea-batatas/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'USDA zones 9a–11; frost kills vines.', 'Tropical vine killed by frost.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'USDA Plant Hardiness Zone: 9a, 9b, 10a, 10b, 11a, 11b.', 'Only hardy in zones 9+.'),
      heatTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Thrives in hot summer conditions.', 'Hot summer crop.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Soil Drainage: Good Drainage; Moist.', 'Moist well-drained.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Warm-season annual/perennial vine; no chill requirement.', 'Heat-loving crop.'),
      floweringRequirements: trait('Ornamental morning-glory type flowers occasionally.', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Produces morning glory-like flowers.'),
      fruitingRequirements: trait('Edible tuberous roots harvested before first frost.', 'SOURCE_SUPPORTED', ['ncsu-ipomoea-batatas'], 'Edible tuberous roots form in warm soils.')
    },
    quantitative: {},
    reproductive: {},
    climateLabel: 'Warm season; frost kills vines (zones 9a–11 perennial)',
    tags: ['subtropical', 'vegetable', 'tuber', 'heat-tolerant'],
    floweringRequirements: 'Optional ornamental flowers; grown for roots not seeds.',
    fruitingRequirements: 'Harvest roots before frost; needs 4–5 warm months.'
  },
  {
    slug: 'okra',
    common: 'Okra',
    scientific: 'Abelmoschus esculentus',
    aliases: ['okra', 'abelmoschus esculentus', 'ladies fingers', 'gumbo'],
    archetypes: ['subtropical-fruit', 'heat-tolerant', 'drought-tolerant'],
    sources: [
      src(
        'ncsu-abelmoschus-esculentus',
        'North Carolina State University Extension Gardener',
        'Abelmoschus esculentus (Okra)',
        'https://plants.ces.ncsu.edu/plants/abelmoschus-esculentus/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('high', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Warm-season annual killed by frost.', 'Frost kills annual.'),
      coldTolerance: trait('low', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'USDA zones 9a–11 as perennial; grown as annual in cooler zones.', 'Perennial only in 9+.'),
      heatTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Thrives in hot summer weather.', 'Hot summer vegetable.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Soil Drainage: Good Drainage; Moist.', 'Moist well-drained.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Heat-loving annual; no winter chill.', 'Warm-season crop.'),
      floweringRequirements: trait('Hibiscus-like yellow flowers with red center.', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Showy hibiscus-like flowers with yellow petals and red center.'),
      fruitingRequirements: trait('Harvest immature pods frequently for tenderness.', 'SOURCE_SUPPORTED', ['ncsu-abelmoschus-esculentus'], 'Edible immature pods harvested throughout summer.')
    },
    quantitative: {},
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['ncsu-abelmoschus-esculentus'], 'Self-pollinating annual; NCSU silent.', 'Provisional.')
    },
    climateLabel: 'Hot summer annual; frost intolerant',
    tags: ['subtropical', 'vegetable', 'annual', 'heat-tolerant'],
    floweringRequirements: 'Daily flowers in hot weather; harvest pods young.',
    fruitingRequirements: 'Pick pods every 2–3 days in peak summer heat.'
  },
  {
    slug: 'parsley',
    common: 'Parsley',
    scientific: 'Petroselinum crispum',
    aliases: ['parsley', 'petroselinum crispum', 'curly parsley', 'flat-leaf parsley'],
    archetypes: ['herb-edible', 'mediterranean', 'frost-tolerant'],
    sources: [
      src(
        'rhs-petroselinum-crispum',
        'Royal Horticultural Society',
        'Petroselinum crispum (parsley)',
        'https://www.rhs.org.uk/plants/14207/petroselinum-crispum/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Hardiness: H5 (−15°C to −10°C).', 'H5 hardy biennial.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Hardiness: H5 (−15°C to −10°C).', 'H5.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-petroselinum-crispum'], 'Cool-season herb; bolts in hot dry weather.', 'Biennial herb heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Aspect: Full sun to partial shade.', 'Sun to shade.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-petroselinum-crispum'], 'Biennial flowering in second year after winter.', 'Biennial life cycle.'),
      floweringRequirements: trait('Flat umbels of yellow-green flowers in second summer.', 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Flowers: Flat umbels of yellow-green flowers in second summer.'),
      fruitingRequirements: trait('Grown for leaves; allow to flower for seed in year two.', 'HEURISTIC_ASSERTION', ['rhs-petroselinum-crispum'], 'Biennial herb harvested for foliage.', 'Leaf herb.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-15, 'SOURCE_SUPPORTED', ['rhs-petroselinum-crispum'], 'Hardiness H5 (−15°C to −10°C).', 'H5 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Cool-season biennial herb; RHS H5',
    tags: ['herb', 'mediterranean', 'biennial', 'edible'],
    floweringRequirements: 'Remove flower stalks to extend leaf harvest; flowers in year two.',
    fruitingRequirements: 'Harvest leaves continuously; biennial seed in second year.'
  },
  {
    slug: 'cilantro',
    common: 'Cilantro',
    scientific: 'Coriandrum sativum',
    aliases: ['cilantro', 'coriandrum sativum', 'coriander', 'chinese parsley'],
    archetypes: ['herb-edible', 'mediterranean'],
    sources: [
      src(
        'rhs-coriandrum-sativum',
        'Royal Horticultural Society',
        'Coriandrum sativum (coriander)',
        'https://www.rhs.org.uk/plants/1824/coriandrum-sativum/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('medium', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Hardiness: H4 (−10°C to −5°C).', 'H4 moderate.'),
      coldTolerance: trait('medium', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Hardiness: H4 (−10°C to −5°C).', 'H4.'),
      heatTolerance: trait('low', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Bolts quickly in hot weather.', 'Heat causes bolting.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(false, 'HEURISTIC_ASSERTION', ['rhs-coriandrum-sativum'], 'Cool-season annual; no chill-hour requirement.', 'Annual herb.'),
      floweringRequirements: trait('White or pink flowers in umbels in summer.', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Flowers: White or pink flowers in umbels in summer.'),
      fruitingRequirements: trait('Seeds (coriander spice) follow flowers.', 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Fruit: Round seeds used as coriander spice.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-10, 'SOURCE_SUPPORTED', ['rhs-coriandrum-sativum'], 'Hardiness H4 (−10°C to −5°C).', 'H4 lower bound.')
    },
    reproductive: {
      self_fertile: repro(true, 'HEURISTIC_ASSERTION', ['rhs-coriandrum-sativum'], 'Annual self-pollinating herb.', 'Provisional.')
    },
    climateLabel: 'Cool-season annual herb; RHS H4',
    tags: ['herb', 'annual', 'mediterranean', 'edible'],
    floweringRequirements: 'Succession sow in cool weather to delay bolting.',
    fruitingRequirements: 'Harvest leaves before flowering; seeds as coriander spice.'
  },
  {
    slug: 'dill',
    common: 'Dill',
    scientific: 'Anethum graveolens',
    aliases: ['dill', 'anethum graveolens', 'dill weed'],
    archetypes: ['herb-edible', 'mediterranean'],
    sources: [
      src(
        'rhs-anethum-graveolens',
        'Royal Horticultural Society',
        'Anethum graveolens (dill)',
        'https://www.rhs.org.uk/plants/703/anethum-graveolens/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('medium', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Hardiness: H4 (−10°C to −5°C).', 'H4 annual.'),
      coldTolerance: trait('medium', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Hardiness: H4 (−10°C to −5°C).', 'H4.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-anethum-graveolens'], 'Cool-season annual; tolerates warm but bolts in heat.', 'Annual herb.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(false, 'HEURISTIC_ASSERTION', ['rhs-anethum-graveolens'], 'Annual herb; no chill requirement.', 'Annual.'),
      floweringRequirements: trait('Yellow umbel flowers in summer.', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Flowers: Yellow umbel flowers in summer.'),
      fruitingRequirements: trait('Flat seeds used as dill spice.', 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Fruit: Flat seeds used as dill spice.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-10, 'SOURCE_SUPPORTED', ['rhs-anethum-graveolens'], 'Hardiness H4 (−10°C to −5°C).', 'H4 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Cool-season annual herb; RHS H4',
    tags: ['herb', 'annual', 'mediterranean', 'edible'],
    floweringRequirements: 'Umbels attract beneficial insects; sow successionally.',
    fruitingRequirements: 'Harvest feathery leaves and seeds for pickling.'
  },
  {
    slug: 'oregano',
    common: 'Oregano',
    scientific: 'Origanum vulgare',
    aliases: ['oregano', 'origanum vulgare', 'wild marjoram', 'greek oregano'],
    archetypes: ['herb-edible', 'mediterranean', 'drought-tolerant'],
    sources: [
      src(
        'rhs-origanum-vulgare',
        'Royal Horticultural Society',
        'Origanum vulgare (oregano)',
        'https://www.rhs.org.uk/plants/11017/origanum-vulgare/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Hardiness: H5 (−15°C to −10°C).', 'Hardy perennial herb.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Hardiness: H5 (−15°C to −10°C).', 'H5.'),
      heatTolerance: trait('high', 'HEURISTIC_ASSERTION', ['rhs-origanum-vulgare'], 'Mediterranean native; thrives in hot dry summers.', 'Mediterranean drought herb.'),
      humidityTolerance: trait('low', 'HEURISTIC_ASSERTION', ['rhs-origanum-vulgare'], 'Mediterranean dry-summer ecology; no RH rating.', 'Low humidity heuristic.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Moisture: Well-drained; drought tolerant once established.', 'Drought tolerant.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Moisture: Well-drained.', 'Well-drained essential.'),
      needsWinterChill: boolTrait(false, 'HEURISTIC_ASSERTION', ['rhs-origanum-vulgare'], 'Evergreen to semi-evergreen Mediterranean perennial.', 'No chill described.'),
      floweringRequirements: trait('Pink to purple flowers in summer.', 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Flowers: Pink to purple flowers in summer.'),
      fruitingRequirements: trait('Grown for aromatic leaves; flowers attract pollinators.', 'HEURISTIC_ASSERTION', ['rhs-origanum-vulgare'], 'Culinary leaf herb.', 'Leaf crop.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-15, 'SOURCE_SUPPORTED', ['rhs-origanum-vulgare'], 'Hardiness H5 (−15°C to −10°C).', 'H5 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Mediterranean perennial herb; RHS H5',
    tags: ['herb', 'mediterranean', 'perennial', 'drought-tolerant'],
    floweringRequirements: 'Pinch flowers for best leaf flavor or allow for pollinators.',
    fruitingRequirements: 'Harvest leaves before flowering for strongest flavor.'
  },
  {
    slug: 'chives',
    common: 'Chives',
    scientific: 'Allium schoenoprasum',
    aliases: ['chives', 'allium schoenoprasum', 'garden chives'],
    archetypes: ['herb-edible', 'temperate-chill-fruit', 'frost-tolerant'],
    sources: [
      src(
        'rhs-allium-schoenoprasum',
        'Royal Horticultural Society',
        'Allium schoenoprasum (chives)',
        'https://www.rhs.org.uk/plants/702/allium-schoenoprasum/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Hardiness: H6 (−20°C to −15°C).', 'Very hardy bulb.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Hardiness: H6 (−20°C to −15°C).', 'H6.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-allium-schoenoprasum'], 'Cool-season growth; may go dormant in extreme heat.', 'Temperate allium.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Moisture: Moist but well-drained.', 'Moist soil.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Aspect: Full sun.', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-allium-schoenoprasum'], 'Dormant bulbs break in early spring after winter cold.', 'Temperate bulb.'),
      floweringRequirements: trait('Round purple flower heads in late spring to summer.', 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Flowers: Round purple flower heads in late spring to summer.'),
      fruitingRequirements: trait('Grown for hollow leaves; ornamental flowers edible.', 'HEURISTIC_ASSERTION', ['rhs-allium-schoenoprasum'], 'Culinary leaf herb.', 'Leaf crop.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-allium-schoenoprasum'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Cool temperate perennial herb; RHS H6',
    tags: ['herb', 'temperate', 'perennial', 'edible'],
    floweringRequirements: 'Purple pom-pom flowers; remove to prolong leaf harvest.',
    fruitingRequirements: 'Cut leaves regularly; divide clumps every few years.'
  },
  {
    slug: 'boxwood',
    common: 'Common Boxwood',
    scientific: 'Buxus sempervirens',
    aliases: ['boxwood', 'buxus sempervirens', 'common box', 'english box'],
    archetypes: ['ornamental-flowering', 'mediterranean', 'frost-tolerant'],
    sources: [
      src(
        'rhs-buxus-sempervirens',
        'Royal Horticultural Society',
        'Buxus sempervirens (common box)',
        'https://www.rhs.org.uk/plants/2922/buxus-sempervirens/details',
        'horticultural_society'
      ),
      src(
        'ncsu-buxus-sempervirens',
        'North Carolina State University Extension Gardener',
        'Buxus sempervirens (Common Boxwood)',
        'https://plants.ces.ncsu.edu/plants/buxus-sempervirens/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Hardiness: H6 (−20°C to −15°C).', 'H6 evergreen shrub.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens', 'ncsu-buxus-sempervirens'], 'RHS H6; NCSU USDA zones 5a–8b.', 'Cold hardy.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['ncsu-buxus-sempervirens'], 'Zones to 8b; struggles in hot humid lowland south without care.', 'Heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-buxus-sempervirens'], 'Soil Drainage: Good Drainage; Moist.', 'Moist well-drained.'),
      sunNeeds: trait('partial_shade', 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Aspect: Full sun to partial shade.', 'Tolerates shade; partial_shade canonical.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-buxus-sempervirens'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(false, 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Evergreen shrub; no winter chill requirement for structure.', 'Ornamental evergreen.'),
      floweringRequirements: trait('Inconspicuous yellow flowers in spring.', 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Flowers: Inconspicuous yellow flowers in spring.'),
      fruitingRequirements: trait('Small dehiscent capsules; grown for foliage not fruit.', 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Fruit: Small dehiscent capsules.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-buxus-sempervirens'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Temperate evergreen hedge; RHS H6 / USDA 5a–8b',
    tags: ['ornamental', 'shrub', 'hedge', 'evergreen'],
    floweringRequirements: 'Inconspicuous spring flowers; prized for clipped form.',
    fruitingRequirements: 'Not grown for fruit; monitor for box tree moth and blight.'
  },
  {
    slug: 'clematis',
    common: 'Clematis',
    scientific: 'Clematis viticella',
    aliases: ['clematis', 'clematis viticella', 'italian clematis', 'virgins bower'],
    archetypes: ['ornamental-flowering', 'temperate-chill-fruit', 'frost-tolerant'],
    sources: [
      src(
        'rhs-clematis-viticella',
        'Royal Horticultural Society',
        'Clematis viticella (Italian clematis)',
        'https://www.rhs.org.uk/plants/914/clematis-viticella/details',
        'horticultural_society'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Hardiness: H6 (−20°C to −15°C).', 'Hardy climber.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Hardiness: H6 (−20°C to −15°C).', 'H6.'),
      heatTolerance: trait('medium', 'HEURISTIC_ASSERTION', ['rhs-clematis-viticella'], 'Roots prefer cool; tops in sun.', 'Clematis culture heuristic.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Moisture: Moist but well-drained.', 'Moist roots.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Aspect: Full sun; roots in shade.', 'Head in sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Moisture: Moist but well-drained.', 'Well-drained.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['rhs-clematis-viticella'], 'Group 3 pruning; flowers on new wood after winter dieback.', 'Temperate vine.'),
      floweringRequirements: trait('Bell-shaped flowers in summer on current season growth.', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Flowers: Bell-shaped flowers in summer.'),
      fruitingRequirements: trait('Feathery seed heads in autumn.', 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Fruit: Feathery seed heads in autumn.')
    },
    quantitative: {
      minimum_survival_temperature_c: trait(-20, 'SOURCE_SUPPORTED', ['rhs-clematis-viticella'], 'Hardiness H6 (−20°C to −15°C).', 'H6 lower bound.')
    },
    reproductive: {},
    climateLabel: 'Hardy flowering vine; RHS H6',
    tags: ['ornamental', 'vine', 'perennial', 'flowering'],
    floweringRequirements: 'Summer blooms on new wood; keep roots cool and shaded.',
    fruitingRequirements: 'Ornamental silky seed heads; prune hard in late winter (Group 3).'
  },
  {
    slug: 'flowering-dogwood',
    common: 'Flowering Dogwood',
    scientific: 'Cornus florida',
    aliases: ['flowering dogwood', 'cornus florida', 'american dogwood'],
    archetypes: ['ornamental-flowering', 'temperate-chill-fruit', 'tree', 'frost-tolerant'],
    sources: [
      src(
        'ncsu-cornus-florida',
        'North Carolina State University Extension Gardener',
        'Cornus florida (Flowering Dogwood)',
        'https://plants.ces.ncsu.edu/plants/cornus-florida/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'USDA Plant Hardiness Zone: 5a–9a.', 'Zone 5a hardy native tree.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'USDA Plant Hardiness Zone: 5a–9a.', 'Zone 5a.'),
      heatTolerance: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'USDA zones to 9a.', 'Southern limit 9a.'),
      humidityTolerance: unknownTrait('Not stated.'),
      waterNeeds: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'Soil Drainage: Good Drainage; Moist.', 'Moist acidic soil.'),
      sunNeeds: trait('partial_shade', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'Light: Partial Shade (2–6 hours) to Full sun.', 'Understory native; partial shade.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(true, 'HEURISTIC_ASSERTION', ['ncsu-cornus-florida'], 'Spring flowering before leaf-out after winter dormancy.', 'Temperate understory tree.'),
      floweringRequirements: trait('Showy white or pink bracts in early spring.', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'Showy white or pink bracts appear in early spring before leaves.'),
      fruitingRequirements: trait('Bright red drupes in autumn attract birds.', 'SOURCE_SUPPORTED', ['ncsu-cornus-florida'], 'Bright red drupes ripen in autumn.')
    },
    quantitative: {},
    reproductive: {},
    climateLabel: 'Eastern US understory tree; USDA zones 5a–9a',
    tags: ['ornamental', 'tree', 'native', 'flowering'],
    floweringRequirements: 'Early spring bracts; protect from drought and borers.',
    fruitingRequirements: 'Red berries for wildlife; needs acidic moist soil.'
  },
  {
    slug: 'crepe-myrtle',
    common: 'Crape Myrtle',
    scientific: 'Lagerstroemia indica',
    aliases: ['crepe myrtle', 'crape myrtle', 'lagerstroemia indica', 'crepe-myrtle'],
    archetypes: ['ornamental-flowering', 'heat-tolerant', 'drought-tolerant'],
    sources: [
      src(
        'ncsu-lagerstroemia-indica',
        'North Carolina State University Extension Gardener',
        'Lagerstroemia indica (Crapemyrtle)',
        'https://plants.ces.ncsu.edu/plants/lagerstroemia-indica/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'USDA Plant Hardiness Zone: 6a–9b.', 'Hardy to zone 6a with dieback possible.'),
      coldTolerance: trait('medium', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'USDA Plant Hardiness Zone: 6a–9b.', 'Zone 6a lower bound.'),
      heatTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Thrives in hot humid southern summers.', 'Southern landscape staple.'),
      humidityTolerance: trait('high', 'HEURISTIC_ASSERTION', ['ncsu-lagerstroemia-indica'], 'Common in humid southeastern US; no RH rating.', 'Humid south heuristic.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Drought tolerant once established.', 'Drought tolerant established.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun for bloom.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Soil Drainage: Good Drainage.', 'Good drainage.'),
      needsWinterChill: boolTrait(false, 'HEURISTIC_ASSERTION', ['ncsu-lagerstroemia-indica'], 'Summer flowering shrub; no chill-hour requirement.', 'Warm-climate ornamental.'),
      floweringRequirements: trait('Showy crinkled flowers in summer in many colors.', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Showy crinkled flowers bloom in summer.'),
      fruitingRequirements: trait('Brown capsules persist; grown for flowers not fruit.', 'SOURCE_SUPPORTED', ['ncsu-lagerstroemia-indica'], 'Brown dehiscent capsules persist into winter.')
    },
    quantitative: {},
    reproductive: {},
    climateLabel: 'Heat-loving flowering shrub/small tree; USDA 6a–9b',
    tags: ['ornamental', 'shrub', 'tree', 'heat-tolerant', 'drought-tolerant'],
    floweringRequirements: 'Peak summer bloom in full sun; prune in late winter.',
    fruitingRequirements: 'Ornamental capsules; powdery mildew resistance varies by cultivar.'
  },
  {
    slug: 'yucca',
    common: 'Adam\'s Needle',
    scientific: 'Yucca filamentosa',
    aliases: ['yucca', 'yucca filamentosa', 'adams needle', 'spoon-leaf yucca'],
    archetypes: ['ornamental-flowering', 'drought-tolerant', 'frost-tolerant', 'heat-tolerant'],
    sources: [
      src(
        'ncsu-yucca-filamentosa',
        'North Carolina State University Extension Gardener',
        'Yucca filamentosa (Adam\'s Needle)',
        'https://plants.ces.ncsu.edu/plants/yucca-filamentosa/',
        'university_extension'
      )
    ],
    traits: {
      frostSensitivity: trait('low', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'USDA Plant Hardiness Zone: 4a–9b.', 'Zone 4a very hardy.'),
      coldTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'USDA Plant Hardiness Zone: 4a–9b.', 'Zone 4a.'),
      heatTolerance: trait('high', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'USDA zones to 9b; native to sandy coastal plains.', 'Wide heat range.'),
      humidityTolerance: trait('low', 'HEURISTIC_ASSERTION', ['ncsu-yucca-filamentosa'], 'Xeric succulent-like foliage; prefers dry air.', 'Arid-adapted heuristic.'),
      waterNeeds: trait('low', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'Soil Drainage: Good Drainage; Occasionally Dry; drought tolerant.', 'Drought tolerant.'),
      sunNeeds: trait('full_sun', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'Light: Full sun (6 or more hours of direct sunlight a day).', 'Full sun.'),
      drainageNeeds: trait('high', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'Soil Drainage: Good Drainage.', 'Excellent drainage.'),
      needsWinterChill: boolTrait(false, 'HEURISTIC_ASSERTION', ['ncsu-yucca-filamentosa'], 'Evergreen rosette; summer flower spike without chill cue.', 'Evergreen xeric perennial.'),
      floweringRequirements: trait('Tall panicle of creamy white bell flowers in summer.', 'SOURCE_SUPPORTED', ['ncsu-yucca-filamentosa'], 'A tall panicle of creamy white bell-shaped flowers appears in summer.'),
      fruitingRequirements: trait('Capsules on tall spike; yucca moth pollination in native range.', 'HEURISTIC_ASSERTION', ['ncsu-yucca-filamentosa'], 'NCSU describes capsule fruit; moth mutualism not on page.', 'Ornamental spike.')
    },
    quantitative: {},
    reproductive: {
      requires_pollinator: repro(true, 'HEURISTIC_ASSERTION', ['ncsu-yucca-filamentosa'], 'Yucca species typically require yucca moth pollination for seed.', 'Ecological mutualism heuristic.')
    },
    climateLabel: 'Cold-hardy xeric perennial; USDA zones 4a–9b',
    tags: ['ornamental', 'perennial', 'drought-tolerant', 'native'],
    floweringRequirements: 'Dramatic summer flower spike; needs full sun and sharp drainage.',
    fruitingRequirements: 'Structural evergreen foliage; avoid overwatering in winter.'
  }
]);
