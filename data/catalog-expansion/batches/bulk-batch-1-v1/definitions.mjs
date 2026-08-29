/**
 * CRUVIT Bulk Catalog Expansion V1 — Batch 1 definitions (30 plants).
 * Background ingestion only. Free/open sources. No paid APIs.
 * Not imported by product runtime.
 */

export const BATCH_ID = 'bulk-catalog-batch-1-v1';
export const BATCH_SIZE = 30;

/** @typedef {'tropical-fruit'|'subtropical-fruit'|'temperate-chill-fruit'|'mediterranean'|'ornamental-flowering'|'tree'|'herb-edible'|'drought-tolerant'|'humidity-sensitive'|'frost-sensitive'|'frost-tolerant'} Archetype */

/**
 * Compact definition → expanded into catalog-expansion packets by the executor.
 * Traits use asserted values only when backed by listed free sources; otherwise unknown.
 */
export const BATCH1_PLANTS = Object.freeze([
  {
    slug: 'durian',
    common: 'Durian',
    scientific: 'Durio zibethinus',
    aliases: ['durian', 'durio zibethinus', 'king of fruits'],
    archetypes: ['tropical-fruit', 'frost-sensitive', 'humidity-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'high',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements:
      'Cauliflorous flowering on mature wood in humid tropics; cool nights and drought reduce flower set.',
    fruitingRequirements:
      'Large spiny fruits; needs sustained tropical warmth, high humidity, and reliable moisture; frost kills trees.',
    climateLabel: 'Humid tropical lowland; frost intolerant',
    tags: ['tropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-durian-hs37',
        institution: 'University of Florida IFAS Extension',
        title: 'Durian Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG004',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'mangosteen',
    common: 'Mangosteen',
    scientific: 'Garcinia mangostana',
    aliases: ['mangosteen', 'garcinia mangostana', 'purple mangosteen'],
    archetypes: ['tropical-fruit', 'frost-sensitive', 'humidity-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'high',
    sunNeeds: 'partial_shade',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements:
      'Flowering in hot humid tropics; sensitive to cool temperatures and drought.',
    fruitingRequirements:
      'Purple fruiting requires long frost-free humid tropical seasons; slow to fruit.',
    climateLabel: 'Strict humid tropical; very frost sensitive',
    tags: ['tropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-mangosteen',
        institution: 'University of Florida IFAS Extension',
        title: 'Mangosteen Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG026',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'breadfruit',
    common: 'Breadfruit',
    scientific: 'Artocarpus altilis',
    aliases: ['breadfruit', 'artocarpus altilis', 'ulu'],
    archetypes: ['tropical-fruit', 'frost-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'high',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements: 'Monoecious flowering in humid tropical climates; cool weather reduces flowering.',
    fruitingRequirements: 'Produces large starchy fruits in frost-free humid tropics with adequate moisture.',
    climateLabel: 'Humid tropical; frost intolerant',
    tags: ['tropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-breadfruit',
        institution: 'University of Florida IFAS Extension',
        title: 'Breadfruit Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG214',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'acerola',
    common: 'Acerola',
    scientific: 'Malpighia emarginata',
    aliases: ['acerola', 'barbados cherry', 'malpighia emarginata', 'west indian cherry'],
    archetypes: ['tropical-fruit', 'frost-sensitive', 'subtropical-fruit'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements: 'Repeat flowering in warm seasons; flowers damaged by frost.',
    fruitingRequirements: 'Produces vitamin-C rich cherries in frost-free subtropical/tropical warmth.',
    climateLabel: 'Tropical to warm subtropical; frost sensitive',
    tags: ['tropical', 'fruit', 'shrub'],
    sources: [
      {
        sourceId: 'uf-ifas-acerola',
        institution: 'University of Florida IFAS Extension',
        title: 'Acerola Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG041',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'longan',
    common: 'Longan',
    scientific: 'Dimocarpus longan',
    aliases: ['longan', 'dimocarpus longan', 'dragon eye'],
    archetypes: ['subtropical-fruit', 'frost-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements: 'Flowering after a cool/dry cue in subtropical winters; hard freezes damage buds.',
    fruitingRequirements: 'Clusters of fruit in warm subtropical climates; frost damages trees and crop.',
    climateLabel: 'Warm subtropical; frost sensitive',
    tags: ['subtropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-longan',
        institution: 'University of Florida IFAS Extension',
        title: 'Longan Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG049',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'loquat',
    common: 'Loquat',
    scientific: 'Eriobotrya japonica',
    aliases: ['loquat', 'eriobotrya japonica', 'japanese plum'],
    archetypes: ['subtropical-fruit', 'mediterranean'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Autumn/winter flowering; flowers and young fruit damaged by hard freezes.',
    fruitingRequirements: 'Spring fruit; crop often lost to frost on flowers/fruit; tree hardier than crop.',
    climateLabel: 'Subtropical to mild Mediterranean; crop frost-sensitive',
    tags: ['subtropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-loquat',
        institution: 'University of Florida IFAS Extension',
        title: 'Loquat Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG050',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'persimmon',
    common: 'Persimmon',
    scientific: 'Diospyros kaki',
    aliases: ['persimmon', 'diospyros kaki', 'japanese persimmon', 'kaki'],
    archetypes: ['subtropical-fruit', 'temperate-chill-fruit'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring flowering after winter dormancy; some chill improves bloom reliability.',
    fruitingRequirements: 'Autumn fruit; many cultivars need winter chill and a frost-free ripening season.',
    climateLabel: 'Warm-temperate to subtropical; chill helpful',
    tags: ['fruit', 'tree', 'chill'],
    sources: [
      {
        sourceId: 'uf-ifas-persimmon',
        institution: 'University of Florida IFAS Extension',
        title: 'Persimmon Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG242',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'feijoa',
    common: 'Feijoa',
    scientific: 'Acca sellowiana',
    aliases: ['feijoa', 'acca sellowiana', 'pineapple guava'],
    archetypes: ['subtropical-fruit', 'mediterranean'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Spring flowers; pollination often needs compatible cultivars or hand pollination.',
    fruitingRequirements: 'Autumn fruit in mild subtropical/Mediterranean climates; hard freezes damage plants.',
    climateLabel: 'Mild subtropical / Mediterranean',
    tags: ['subtropical', 'fruit', 'shrub'],
    sources: [
      {
        sourceId: 'uf-ifas-feijoa',
        institution: 'University of Florida IFAS Extension',
        title: 'Feijoa (Pineapple Guava) Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG045',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'jaboticaba',
    common: 'Jaboticaba',
    scientific: 'Plinia cauliflora',
    aliases: ['jaboticaba', 'plinia cauliflora', 'brazilian grape tree', 'myrciaria cauliflora'],
    archetypes: ['subtropical-fruit', 'frost-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'high',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: false,
    groupIds: ['tropical-frost-sensitive-fruit'],
    floweringRequirements: 'Cauliflorous flowering on trunk/branches in warm humid climates.',
    fruitingRequirements: 'Grape-like fruits on trunk; needs frost-free humid subtropical/tropical conditions.',
    climateLabel: 'Humid subtropical to tropical; frost sensitive',
    tags: ['subtropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-jaboticaba',
        institution: 'University of Florida IFAS Extension',
        title: 'Jaboticaba Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG047',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'white-sapote',
    common: 'White Sapote',
    scientific: 'Casimiroa edulis',
    aliases: ['white sapote', 'casimiroa edulis', 'mexican apple'],
    archetypes: ['subtropical-fruit'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Spring flowering; young growth and flowers sensitive to hard frost.',
    fruitingRequirements: 'Soft sweet fruit in mild subtropical climates; trees tolerate light frost better than crop.',
    climateLabel: 'Mild subtropical',
    tags: ['subtropical', 'fruit', 'tree'],
    sources: [
      {
        sourceId: 'uf-ifas-white-sapote',
        institution: 'University of Florida IFAS Extension',
        title: 'White Sapote Growing in the Florida Home Landscape',
        url: 'https://edis.ifas.ufl.edu/publication/MG058',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'sweet-cherry',
    common: 'Sweet Cherry',
    scientific: 'Prunus avium',
    aliases: ['sweet cherry', 'prunus avium', 'wild cherry'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    frostSensitivity: 'medium',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring bloom after substantial winter chill; early bloom frost can kill flowers.',
    fruitingRequirements: 'Requires winter chill and cool springs; poor in always-hot tropics.',
    climateLabel: 'Temperate; high winter chill',
    tags: ['temperate', 'fruit', 'tree', 'chill'],
    sources: [
      {
        sourceId: 'rhs-prunus-avium',
        institution: 'Royal Horticultural Society',
        title: 'Prunus avium (sweet cherry)',
        url: 'https://www.rhs.org.uk/plants/13766/prunus-avium/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'english-walnut',
    common: 'English Walnut',
    scientific: 'Juglans regia',
    aliases: ['english walnut', 'persian walnut', 'juglans regia', 'common walnut'],
    archetypes: ['temperate-chill-fruit', 'tree', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Wind-pollinated catkins after dormancy; needs winter chill.',
    fruitingRequirements: 'Nuts require chill and a long growing season; unsuitable for always-hot climates.',
    climateLabel: 'Temperate continental to mild temperate',
    tags: ['temperate', 'nut', 'tree', 'chill'],
    sources: [
      {
        sourceId: 'rhs-juglans-regia',
        institution: 'Royal Horticultural Society',
        title: 'Juglans regia (walnut)',
        url: 'https://www.rhs.org.uk/plants/9736/juglans-regia/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'red-currant',
    common: 'Red Currant',
    scientific: 'Ribes rubrum',
    aliases: ['red currant', 'ribes rubrum', 'redcurrant'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring racemes after winter chill; prefers cool temperate climates.',
    fruitingRequirements: 'Summer berries; fails in always-hot tropics without chill.',
    climateLabel: 'Cool temperate',
    tags: ['temperate', 'fruit', 'shrub', 'chill'],
    sources: [
      {
        sourceId: 'rhs-ribes-rubrum',
        institution: 'Royal Horticultural Society',
        title: 'Ribes rubrum (redcurrant)',
        url: 'https://www.rhs.org.uk/plants/14654/ribes-rubrum/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'gooseberry',
    common: 'Gooseberry',
    scientific: 'Ribes uva-crispa',
    aliases: ['gooseberry', 'ribes uva-crispa', 'ribes grossularia'],
    archetypes: ['temperate-chill-fruit', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring flowers after chill; prefers cool summers.',
    fruitingRequirements: 'Summer berries; poor in hot arid / always-hot climates.',
    climateLabel: 'Cool temperate',
    tags: ['temperate', 'fruit', 'shrub', 'chill'],
    sources: [
      {
        sourceId: 'rhs-ribes-uva-crispa',
        institution: 'Royal Horticultural Society',
        title: 'Ribes uva-crispa (gooseberry)',
        url: 'https://www.rhs.org.uk/plants/14672/ribes-uva-crispa/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'quince',
    common: 'Quince',
    scientific: 'Cydonia oblonga',
    aliases: ['quince', 'cydonia oblonga'],
    archetypes: ['temperate-chill-fruit', 'mediterranean'],
    frostSensitivity: 'medium',
    coldTolerance: 'high',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: ['temperate-chill-fruit-tree'],
    floweringRequirements: 'Spring blossom after dormancy; late frost can damage flowers.',
    fruitingRequirements: 'Autumn aromatic fruit; needs chill and a warm ripening season.',
    climateLabel: 'Temperate to warm-temperate',
    tags: ['temperate', 'fruit', 'tree', 'chill'],
    sources: [
      {
        sourceId: 'rhs-cydonia-oblonga',
        institution: 'Royal Horticultural Society',
        title: 'Cydonia oblonga (quince)',
        url: 'https://www.rhs.org.uk/plants/5110/cydonia-oblonga/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'carob',
    common: 'Carob',
    scientific: 'Ceratonia siliqua',
    aliases: ['carob', 'ceratonia siliqua', 'locust bean', 'St John\'s bread'],
    archetypes: ['mediterranean', 'drought-tolerant', 'tree'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Dioecious or hermaphrodite cultivars; flowers in warm Mediterranean climates.',
    fruitingRequirements: 'Pods in hot dry summers; intolerant of waterlogging and hard freezes when young.',
    climateLabel: 'Mediterranean / semi-arid; drought tolerant',
    tags: ['mediterranean', 'tree', 'drought'],
    sources: [
      {
        sourceId: 'ucanr-carob',
        institution: 'University of California Agriculture and Natural Resources',
        title: 'Carob',
        url: 'https://ucanr.edu/sites/default/files/2021-12/carob.pdf',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'common-myrtle',
    common: 'Common Myrtle',
    scientific: 'Myrtus communis',
    aliases: ['myrtle', 'myrtus communis', 'common myrtle'],
    archetypes: ['mediterranean', 'ornamental-flowering', 'drought-tolerant'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Summer white flowers in Mediterranean climates; hard frost damages evergreen foliage.',
    fruitingRequirements: 'Blue-black berries; ornamental fruiting secondary to flowering display.',
    climateLabel: 'Mediterranean evergreen shrub',
    tags: ['mediterranean', 'ornamental', 'shrub'],
    sources: [
      {
        sourceId: 'rhs-myrtus-communis',
        institution: 'Royal Horticultural Society',
        title: 'Myrtus communis (common myrtle)',
        url: 'https://www.rhs.org.uk/plants/11504/myrtus-communis/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'bay-laurel',
    common: 'Bay Laurel',
    scientific: 'Laurus nobilis',
    aliases: ['bay', 'bay laurel', 'laurus nobilis', 'sweet bay'],
    archetypes: ['mediterranean', 'herb-edible', 'drought-tolerant'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Inconspicuous yellowish flowers in spring; grown primarily for foliage.',
    fruitingRequirements: null,
    climateLabel: 'Mediterranean evergreen; culinary foliage',
    tags: ['mediterranean', 'herb', 'evergreen'],
    floweringUnknown: true,
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-laurus-nobilis',
        institution: 'Royal Horticultural Society',
        title: 'Laurus nobilis (bay)',
        url: 'https://www.rhs.org.uk/plants/9968/laurus-nobilis/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'oleander',
    common: 'Oleander',
    scientific: 'Nerium oleander',
    aliases: ['oleander', 'nerium oleander'],
    archetypes: ['mediterranean', 'ornamental-flowering', 'drought-tolerant', 'humidity-sensitive'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Long summer flowering in heat; hard freezes kill tops in colder zones.',
    fruitingRequirements: null,
    climateLabel: 'Hot Mediterranean / arid ornamental',
    tags: ['mediterranean', 'ornamental', 'toxic', 'drought'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-nerium-oleander',
        institution: 'Royal Horticultural Society',
        title: 'Nerium oleander (oleander)',
        url: 'https://www.rhs.org.uk/plants/11648/nerium-oleander/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'garden-peony',
    common: 'Garden Peony',
    scientific: 'Paeonia lactiflora',
    aliases: ['peony', 'paeonia lactiflora', 'chinese peony', 'garden peony'],
    archetypes: ['ornamental-flowering', 'frost-tolerant', 'temperate-chill-fruit'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: [],
    floweringRequirements: 'Spring flowers after winter chill; poor flowering in always-hot climates.',
    fruitingRequirements: null,
    climateLabel: 'Cool temperate ornamental perennial',
    tags: ['ornamental', 'perennial', 'chill'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-paeonia-lactiflora',
        institution: 'Royal Horticultural Society',
        title: 'Paeonia lactiflora (Chinese peony)',
        url: 'https://www.rhs.org.uk/plants/12350/paeonia-lactiflora/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'common-lilac',
    common: 'Common Lilac',
    scientific: 'Syringa vulgaris',
    aliases: ['lilac', 'syringa vulgaris', 'common lilac'],
    archetypes: ['ornamental-flowering', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: true,
    groupIds: [],
    floweringRequirements: 'Spring panicles after substantial winter chill; weak bloom without chill.',
    fruitingRequirements: null,
    climateLabel: 'Cool temperate shrub',
    tags: ['ornamental', 'shrub', 'chill'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-syringa-vulgaris',
        institution: 'Royal Horticultural Society',
        title: 'Syringa vulgaris (lilac)',
        url: 'https://www.rhs.org.uk/plants/17768/syringa-vulgaris/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'forsythia',
    common: 'Forsythia',
    scientific: 'Forsythia × intermedia',
    aliases: ['forsythia', 'forsythia intermedia', 'border forsythia'],
    archetypes: ['ornamental-flowering', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: true,
    groupIds: [],
    floweringRequirements: 'Early spring yellow flowers on previous wood after winter chill.',
    fruitingRequirements: null,
    climateLabel: 'Temperate ornamental shrub',
    tags: ['ornamental', 'shrub'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-forsythia-intermedia',
        institution: 'Royal Horticultural Society',
        title: 'Forsythia × intermedia',
        url: 'https://www.rhs.org.uk/plants/7486/forsythia-x-intermedia/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'southern-magnolia',
    common: 'Southern Magnolia',
    scientific: 'Magnolia grandiflora',
    aliases: ['southern magnolia', 'magnolia grandiflora', 'bull bay'],
    archetypes: ['ornamental-flowering', 'tree', 'subtropical-fruit'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Large fragrant summer flowers; evergreen in warm-temperate to subtropical climates.',
    fruitingRequirements: 'Cone-like aggregate fruit; ornamental, not a food crop focus.',
    climateLabel: 'Warm-temperate to subtropical evergreen tree',
    tags: ['ornamental', 'tree', 'evergreen'],
    sources: [
      {
        sourceId: 'uf-ifas-magnolia',
        institution: 'University of Florida IFAS Extension',
        title: 'Magnolia grandiflora: Southern Magnolia',
        url: 'https://edis.ifas.ufl.edu/publication/ST375',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'chinese-wisteria',
    common: 'Chinese Wisteria',
    scientific: 'Wisteria sinensis',
    aliases: ['wisteria', 'wisteria sinensis', 'chinese wisteria'],
    archetypes: ['ornamental-flowering'],
    frostSensitivity: 'medium',
    coldTolerance: 'high',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: true,
    groupIds: [],
    floweringRequirements: 'Spring racemes after winter chill; vigorous vine; invasive risk in some regions.',
    fruitingRequirements: null,
    climateLabel: 'Temperate vine; chill improves flowering',
    tags: ['ornamental', 'vine', 'chill'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-wisteria-sinensis',
        institution: 'Royal Horticultural Society',
        title: 'Wisteria sinensis',
        url: 'https://www.rhs.org.uk/plants/19014/wisteria-sinensis/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'ginkgo',
    common: 'Ginkgo',
    scientific: 'Ginkgo biloba',
    aliases: ['ginkgo', 'ginkgo biloba', 'maidenhair tree'],
    archetypes: ['tree', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'medium',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Dioecious; inconspicuous reproductive structures; grown for foliage.',
    fruitingRequirements: 'Female trees produce fleshy seeds; often avoided in landscapes for odor.',
    climateLabel: 'Temperate to warm-temperate urban tree',
    tags: ['tree', 'ornamental', 'temperate'],
    sources: [
      {
        sourceId: 'rhs-ginkgo-biloba',
        institution: 'Royal Horticultural Society',
        title: 'Ginkgo biloba',
        url: 'https://www.rhs.org.uk/plants/8009/ginkgo-biloba/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'silver-birch',
    common: 'Silver Birch',
    scientific: 'Betula pendula',
    aliases: ['silver birch', 'betula pendula', 'european white birch'],
    archetypes: ['tree', 'frost-tolerant'],
    frostSensitivity: 'low',
    coldTolerance: 'high',
    heatTolerance: 'low',
    humidityTolerance: 'medium',
    waterNeeds: 'medium',
    sunNeeds: 'full_sun',
    drainageNeeds: 'medium',
    needsWinterChill: true,
    groupIds: [],
    floweringRequirements: 'Catkins in spring; cool temperate tree.',
    fruitingRequirements: null,
    climateLabel: 'Cool temperate tree; poor in hot arid tropics',
    tags: ['tree', 'temperate'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-betula-pendula',
        institution: 'Royal Horticultural Society',
        title: 'Betula pendula (silver birch)',
        url: 'https://www.rhs.org.uk/plants/2217/betula-pendula/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'blue-gum',
    common: 'Blue Gum',
    scientific: 'Eucalyptus globulus',
    aliases: ['blue gum', 'eucalyptus globulus', 'tasmanian blue gum'],
    archetypes: ['tree', 'drought-tolerant', 'humidity-sensitive'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Cream flowers; aromatic evergreen; invasive/weed risk in some regions.',
    fruitingRequirements: null,
    climateLabel: 'Warm temperate to Mediterranean; drought tolerant',
    tags: ['tree', 'drought', 'aromatic'],
    fruitingUnknown: true,
    needsReview: true,
    needsReviewReason: 'Invasive potential and regional restrictions vary; landscape use needs local review.',
    sources: [
      {
        sourceId: 'powo-eucalyptus-globulus',
        institution: 'Royal Botanic Gardens, Kew',
        title: 'Eucalyptus globulus (POWO)',
        url: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:592855-1',
        authorityTier: 'botanical_authority',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'common-thyme',
    common: 'Common Thyme',
    scientific: 'Thymus vulgaris',
    aliases: ['thyme', 'thymus vulgaris', 'garden thyme', 'common thyme'],
    archetypes: ['herb-edible', 'mediterranean', 'drought-tolerant'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Summer flowers; culinary herb preferring dry sunny sites.',
    fruitingRequirements: null,
    climateLabel: 'Mediterranean herb; dry well-drained soils',
    tags: ['herb', 'mediterranean', 'edible'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-thymus-vulgaris',
        institution: 'Royal Horticultural Society',
        title: 'Thymus vulgaris (common thyme)',
        url: 'https://www.rhs.org.uk/plants/18148/thymus-vulgaris/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'garden-sage',
    common: 'Garden Sage',
    scientific: 'Salvia officinalis',
    aliases: ['sage', 'salvia officinalis', 'common sage', 'garden sage'],
    archetypes: ['herb-edible', 'mediterranean', 'drought-tolerant', 'humidity-sensitive'],
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'high',
    humidityTolerance: 'low',
    waterNeeds: 'low',
    sunNeeds: 'full_sun',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Summer spikes; culinary evergreen/semi-evergreen in mild climates.',
    fruitingRequirements: null,
    climateLabel: 'Mediterranean culinary shrublet; dislikes wet winters',
    tags: ['herb', 'mediterranean', 'edible'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'rhs-salvia-officinalis',
        institution: 'Royal Horticultural Society',
        title: 'Salvia officinalis (sage)',
        url: 'https://www.rhs.org.uk/plants/16352/salvia-officinalis/details',
        authorityTier: 'horticultural_society',
        verifiedAt: '2026-08-29'
      }
    ]
  },
  {
    slug: 'turmeric',
    common: 'Turmeric',
    scientific: 'Curcuma longa',
    aliases: ['turmeric', 'curcuma longa', 'haldi'],
    archetypes: ['herb-edible', 'tropical-fruit', 'frost-sensitive', 'humidity-sensitive'],
    frostSensitivity: 'high',
    coldTolerance: 'low',
    heatTolerance: 'high',
    humidityTolerance: 'high',
    waterNeeds: 'high',
    sunNeeds: 'partial_shade',
    drainageNeeds: 'high',
    needsWinterChill: false,
    groupIds: [],
    floweringRequirements: 'Warm-season rhizomatous flowering in humid tropics; dormant/killed by frost.',
    fruitingRequirements: null,
    climateLabel: 'Humid tropical herbaceous perennial; frost intolerant',
    tags: ['tropical', 'herb', 'edible', 'rhizome'],
    fruitingUnknown: true,
    sources: [
      {
        sourceId: 'uf-ifas-turmeric',
        institution: 'University of Florida IFAS Extension',
        title: 'Turmeric Production Guide for Florida',
        url: 'https://edis.ifas.ufl.edu/publication/HS1429',
        authorityTier: 'university_extension',
        verifiedAt: '2026-08-29'
      }
    ]
  }
]);
