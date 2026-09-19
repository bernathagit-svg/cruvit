/**
 * Botanical size evidence pilot V1.
 * Seven role-based species. Free authoritative sources only.
 * Overlay only. No catalog write. No invented meters. No spend.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import { CALIBRATION_BOTANICAL_SIZE_EVIDENCE, FT_TO_M } from './physical-scale-evidence-v1.js';
import {
  SIZE_EVIDENCE_IDENTITY_SCOPE,
  SIZE_EVIDENCE_SCENARIOS,
  SOURCE_QUALITY_TIERS,
  validateBotanicalSizeEvidenceRecord
} from './botanical-size-evidence-contract-v2.js';
import { MANGO_GARDEN_DESIGN_PREFERENCE } from './generic-tree-physical-scale-v1.js';

export const BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION = 'botanical-size-evidence-pilot-v1';

function ft(value) {
  return Number(value) * FT_TO_M;
}

function record(partial) {
  const row = {
    contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION,
    architectureMode: 'tree',
    growthStage: 'mature',
    heightMinM: null,
    heightMaxM: null,
    spreadMinM: null,
    spreadMaxM: null,
    sourceIdentifier: null,
    sourceUrl: null,
    originalUnit: null,
    originalRange: null,
    normalizedSi: null,
    conditions: null,
    originalSourceWording: null,
    provenanceVersion: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION,
    provenanceTimestamp: '2026-09-19',
    mayDrivePhysicalMeterPreview: true,
    productionCatalogWritten: false,
    notFinalPersonalGardenSize: false,
    approximate: false,
    inferredDimension: false,
    cultivarOrRootstockSensitive: false,
    flags: [],
    ...partial
  };
  const flags = new Set(row.flags);
  if (row.canonicalSlug === 'lemon' || row.canonicalSlug === 'apple') {
    row.cultivarOrRootstockSensitive = true;
    flags.add('CULTIVAR_OR_ROOTSTOCK_SENSITIVE');
    flags.add('NOT_FINAL_PERSONAL_GARDEN_SIZE');
    row.notFinalPersonalGardenSize = true;
  }
  if (row.canonicalSlug === 'japanese-maple') {
    flags.add('CULTIVAR_VARIABLE');
    flags.add('NOT_FINAL_PERSONAL_GARDEN_SIZE');
    row.notFinalPersonalGardenSize = true;
  }
  row.flags = Object.freeze([...flags]);
  if (row.heightMinM != null || row.heightMaxM != null || row.spreadMinM != null || row.spreadMaxM != null) {
    row.normalizedSi = {
      heightM: { min: row.heightMinM, max: row.heightMaxM },
      spreadM: { min: row.spreadMinM, max: row.spreadMaxM }
    };
  }
  return Object.freeze(row);
}

export const PILOT_EVIDENCE_RECORDS = Object.freeze([
  record({
    recordId: 'blue-gum__usda-feis__natural-mature-height',
    canonicalSlug: 'blue-gum',
    scientificName: 'Eucalyptus globulus',
    sourceScientificName: 'Eucalyptus globulus Labill.',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE,
    heightMinM: 30,
    heightMaxM: 55,
    sourceProvider: 'USDA Forest Service Fire Effects Information System',
    sourceTitle: 'Eucalyptus globulus',
    sourceIdentifier: 'USDA-FS-FEIS-eucglo',
    sourceUrl: 'https://www.fs.usda.gov/database/feis/plants/tree/eucglo/all.html',
    originalUnit: 'ft/m',
    originalRange: { heightFt: { min: 98, max: 180 }, heightM: { min: 30, max: 55 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.GOVERNMENT_AGRICULTURAL_AUTHORITY,
    conditions: 'Generally grows 98 to 180 feet (30-55 m) tall. Some bluegums have attained 260 feet (80 m) in California; that exceptional height is not the typical range. Spread not stated.',
    originalSourceWording:
      'Tasmanian bluegum is an introduced, deciduous tree that generally grows from 98 to 180 feet (30-55 m) tall. Some bluegums have attained heights of 260 feet (80 m) in California.'
  }),
  record({
    recordId: 'blue-gum__calpoly-selectree__landscape-maxima',
    canonicalSlug: 'blue-gum',
    scientificName: 'Eucalyptus globulus',
    sourceScientificName: 'Eucalyptus globulus',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: null,
    heightMaxM: ft(80),
    spreadMinM: null,
    spreadMaxM: ft(75),
    sourceProvider: 'California Polytechnic State University SelecTree',
    sourceTitle: 'Eucalyptus globulus',
    sourceIdentifier: 'CALPOLY-SELECTREE-eucalyptus-globulus',
    sourceUrl: 'https://selectree.calpoly.edu/tree-detail/eucalyptus-globulus',
    originalUnit: 'ft',
    originalRange: { heightFtMax: 80, canopyWidthFtMax: 75 },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions: 'Reported as maximum tree height and maximum canopy width, not a typical min–max mature range. Minima UNKNOWN. Do not treat as natural mature size.',
    originalSourceWording: 'Maximum Tree Height: 80 feet. Maximum Canopy Width: 75 feet.'
  }),
  record({
    recordId: 'cypress__uf-ifas-st225__landscape-columnar',
    canonicalSlug: 'cypress',
    scientificName: 'Cupressus sempervirens',
    sourceScientificName: 'Cupressus sempervirens',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(40),
    heightMaxM: ft(60),
    spreadMinM: ft(3),
    spreadMaxM: ft(6),
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Cupressus sempervirens: Italian Cypress',
    sourceIdentifier: 'UF_IFAS_ENH384_ST225',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/ST225',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 40, max: 60 }, spreadFt: { min: 3, max: 6 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions:
      'Western United States landscape description of the narrow columnar habit. Source also says they are often much shorter and trees are normally no more than three feet wide. Narrow crown is the architecture, not an evidence error.',
    originalSourceWording:
      'With its narrow columnar habit of growth, this evergreen forms tall, dark green columns 40 to 60 feet in height in the western United States but are often much shorter. Trees are normally no more than three feet wide. Height: 40 to 60 feet. Spread: 3 to 6 feet. Crown shape: columnar.'
  }),
  record({
    recordId: 'cypress__ncsu-ces__landscape-columnar',
    canonicalSlug: 'cypress',
    scientificName: 'Cupressus sempervirens',
    sourceScientificName: 'Cupressus sempervirens',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(40),
    heightMaxM: ft(70),
    spreadMinM: ft(3),
    spreadMaxM: ft(6),
    sourceProvider: 'North Carolina State University Extension Gardener',
    sourceTitle: 'Cupressus sempervirens (Italian Cypress)',
    sourceIdentifier: 'NCSU-CES-cupressus-sempervirens',
    sourceUrl: 'https://plants.ces.ncsu.edu/plants/cupressus-sempervirens/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 40, max: 70 }, widthFt: { min: 3, max: 6 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions:
      'Commercially available forms are more columnar and will typically not be seen in the wild. Height 40–70 ft, width 3–6 ft.',
    originalSourceWording:
      'The commercially available forms are more columnar in shape and will typically not be seen in the wild. Dimensions: Height: 40 ft. 0 in. - 70 ft. 0 in. Width: 3 ft. 0 in. - 6 ft. 0 in. Habit/Form: Columnar.'
  }),
  record({
    recordId: 'olive__ncsu-ces__landscape-mature',
    canonicalSlug: 'olive',
    scientificName: 'Olea europaea',
    sourceScientificName: 'Olea europaea',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(20),
    heightMaxM: ft(30),
    spreadMinM: ft(15),
    spreadMaxM: ft(25),
    sourceProvider: 'North Carolina State University Extension Gardener',
    sourceTitle: 'Olea europaea (Common Olive)',
    sourceIdentifier: 'NCSU-CES-olea-europaea',
    sourceUrl: 'https://plants.ces.ncsu.edu/plants/olea-europaea/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 20, max: 30 }, widthFt: { min: 15, max: 25 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions: 'Landscape/cultivated species description. Slow-growing evergreen tree or shrub with rounded crown.',
    originalSourceWording:
      'It grows 20 to 30 feet tall and 15 to 25 feet wide. Dimensions: Height: 20 ft. 0 in. - 30 ft. 0 in. Width: 15 ft. 0 in. - 25 ft. 0 in.'
  }),
  record({
    recordId: 'olive__uf-ifas-ep515__fertile-canopy-max',
    canonicalSlug: 'olive',
    scientificName: 'Olea europaea',
    sourceScientificName: 'Olea europaea',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: null,
    heightMaxM: ft(30),
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Olives for Your Florida Landscape',
    sourceIdentifier: 'UF_IFAS_ENH1254_EP515',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/EP515',
    originalUnit: 'ft',
    originalRange: { canopyFtMax: 30 },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions:
      'If planted on highly fertile soils, canopies up to 30 ft may be achieved. Hedge spacing 8–10 ft is planting distance, not a maintained height. Radical pruning is mentioned without numeric maintained dimensions. MAINTAINED_GARDEN numeric range is EVIDENCE_GAP.',
    originalSourceWording:
      'If planted on highly fertile soils, canopies up to 30 ft may be achieved. Olives can also be maintained with appropriate pruning as hedges in various configurations with 8–10 ft between plants in a row. Olive trees will respond to radical pruning to control either height or plant form, but the impacts on flowering and fruiting should be considered.'
  }),
  record({
    recordId: 'olive__maintained-garden__evidence-gap',
    canonicalSlug: 'olive',
    scientificName: 'Olea europaea',
    sourceScientificName: 'Olea europaea',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN,
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Olives for Your Florida Landscape',
    sourceIdentifier: 'UF_IFAS_ENH1254_EP515',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/EP515',
    originalUnit: 'ft',
    originalRange: { inRowSpacingFt: { min: 8, max: 10 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.UNKNOWN,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    mayDrivePhysicalMeterPreview: false,
    conditions:
      'EVIDENCE_GAP. Hedge/row spacing is not maintained tree height or spread. Radical pruning is mentioned without numeric maintained dimensions. Do not invent a garden olive size.',
    originalSourceWording:
      'Olives can also be maintained with appropriate pruning as hedges in various configurations with 8–10 ft between plants in a row. Olive trees will respond to radical pruning to control either height or plant form, but the impacts on flowering and fruiting should be considered.'
  }),
  record({
    recordId: 'lemon__uf-ifas-hs402__species-may-reach',
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
    sourceScientificName: 'not stated in the cited sentence; publication is lemon home-landscape',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: 3.1,
    heightMaxM: 6.1,
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Lemon Growing in the Florida Home Landscape',
    sourceIdentifier: 'UF_IFAS_HS1153_HS402',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/HS402',
    originalUnit: 'ft/m',
    originalRange: { heightFt: { min: 10, max: 20 }, heightM: { min: 3.1, max: 6.1 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    cultivarOrRootstockSensitive: true,
    flags: ['CULTIVAR_OR_ROOTSTOCK_SENSITIVE', 'NOT_FINAL_PERSONAL_GARDEN_SIZE'],
    conditions:
      'Trees may reach 10–20 ft citing Morton 1987. Rootstock selection is critical. Species-level range is not final personal-garden size. Spread UNKNOWN in this sentence.',
    originalSourceWording:
      'The lemon tree is vigorous, upright, and spreading, with an open growth habit (Tucker and Wardowski 1976). Trees may reach 10–20 ft (3.1–6.1 m) in height (Morton 1987).'
  }),
  record({
    recordId: 'lemon__ncsu-ces__landscape-mature',
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
    sourceScientificName: 'Citrus x limon',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(10),
    heightMaxM: ft(20),
    spreadMinM: ft(10),
    spreadMaxM: ft(15),
    sourceProvider: 'North Carolina State University Extension Gardener',
    sourceTitle: 'Citrus x limon (Lemon)',
    sourceIdentifier: 'NCSU-CES-citrus-x-limon',
    sourceUrl: 'https://plants.ces.ncsu.edu/plants/citrus-x-limon/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 10, max: 20 }, widthFt: { min: 10, max: 15 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    cultivarOrRootstockSensitive: true,
    flags: ['CULTIVAR_OR_ROOTSTOCK_SENSITIVE', 'NOT_FINAL_PERSONAL_GARDEN_SIZE'],
    conditions: 'Species/hybrid landscape dimensions. Cultivar/rootstock can materially affect stature. NOT_FINAL_PERSONAL_GARDEN_SIZE.',
    originalSourceWording:
      'The lemon is a species of small evergreen trees in the Rutaceae family that grows 10 to 20 feet tall. Dimensions: Height: 10 ft. 0 in. - 20 ft. 0 in. Width: 10 ft. 0 in. - 15 ft. 0 in.'
  }),
  record({
    recordId: 'lemon__uf-ifas-hs402__maintained-home-landscape',
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
    sourceScientificName: 'not stated in the cited sentence; publication is lemon home-landscape',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN,
    heightMinM: 2.1,
    heightMaxM: 3.1,
    spreadMinM: 3.1,
    spreadMaxM: 4.6,
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Lemon Growing in the Florida Home Landscape',
    sourceIdentifier: 'UF_IFAS_HS1153_HS402',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/HS402',
    originalUnit: 'ft/m',
    originalRange: { heightFt: { min: 7, max: 10 }, spreadFt: { min: 10, max: 15 }, heightM: { min: 2.1, max: 3.1 }, spreadM: { min: 3.1, max: 4.6 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    cultivarOrRootstockSensitive: true,
    flags: ['CULTIVAR_OR_ROOTSTOCK_SENSITIVE', 'NOT_FINAL_PERSONAL_GARDEN_SIZE'],
    conditions: 'Home-landscape maintained target, not unpruned botanical maximum. Do not collapse with the 10–20 ft “may reach” range.',
    originalSourceWording:
      'As a tree matures, it should be lightly pruned to form the crown into a dome-shape. Trees should be maintained at 7 to 10 ft (2.1–3.1 m) high and 10 to 15 ft (3.1–4.6 m) wide.'
  }),
  record({
    recordId: 'lemon__uf-ifas-hs1260__citrus-rootstock-classes',
    canonicalSlug: 'lemon',
    scientificName: 'Citrus × limon',
    sourceScientificName: 'citrus rootstocks generally; not lemon-scion-specific',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC,
    heightMinM: null,
    heightMaxM: null,
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Florida Citrus Rootstock Selection Guide',
    sourceIdentifier: 'UF_IFAS_SP248_HS1260',
    sourceUrl: 'https://ask.ifas.ufl.edu/publication/HS1260',
    originalUnit: 'ft',
    originalRange: {
      largeFt: { min: 14, max: 20 },
      intermediateFt: { min: 8, max: 14 },
      smallFtMax: 8
    },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    cultivarOrRootstockSensitive: true,
    flags: ['CULTIVAR_OR_ROOTSTOCK_SENSITIVE', 'NOT_FINAL_PERSONAL_GARDEN_SIZE', 'CITRUS_ROOTSTOCK_CLASS_NOT_LEMON_SCION'],
    mayDrivePhysicalMeterPreview: false,
    conditions:
      'Citrus rootstock tree-size classes, not lemon cultivar records and not invented lemon-on-named-rootstock dimensions. Large perhaps 14–20 ft; intermediate 8–14 ft; small less than 8 ft. Relative to rough lemon / Cleopatra mandarin. Spread UNKNOWN.',
    originalSourceWording:
      'A tree on a selected rootstock would be rated large [Lg] if it was comparable in vigor and size to one on Cleopatra mandarin or rough lemon, i.e., perhaps 14–20 ft tall. A small tree [Sm] would be less than 8 ft tall at maturity, and an intermediate tree [I] would be like one on C-35 citrange and range in height from 8 to 14 ft tall.'
  }),
  record({
    recordId: 'apple__extension-org__standard-unpruned',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple on seedling rootstock',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.CULTIVATED_STANDARD,
    heightMinM: ft(30),
    heightMaxM: ft(30),
    spreadMinM: ft(30),
    spreadMaxM: ft(30),
    approximate: true,
    sourceProvider: 'eXtension Apples Community of Practice (University of Minnesota / Penn State)',
    sourceTitle: 'Understanding Apple Tree Size: Dwarf, Semi-Dwarf and Standard',
    sourceIdentifier: 'EXTENSION-ORG-apple-tree-size',
    sourceUrl: 'https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/',
    originalUnit: 'ft',
    originalRange: { heightFtAbout: 30, crownDiameterFtAbout: 30 },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'Seedling/standard rootstock if not pruned to limit tree size. About 30 feet is approximate. Not a cultivar record.',
    originalSourceWording:
      'If trees on seedling rootstocks are not pruned to limit tree size, the trees will reach a height of about 30 feet and have a crown diameter of about 30 feet.'
  }),
  record({
    recordId: 'apple__extension-org__standard-pruned',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple on seedling rootstock',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN,
    heightMinM: ft(24),
    heightMaxM: ft(24),
    approximate: true,
    sourceProvider: 'eXtension Apples Community of Practice (University of Minnesota / Penn State)',
    sourceTitle: 'Understanding Apple Tree Size: Dwarf, Semi-Dwarf and Standard',
    sourceIdentifier: 'EXTENSION-ORG-apple-tree-size',
    sourceUrl: 'https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/',
    originalUnit: 'ft',
    originalRange: { heightFtAbout: 24 },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'With good pruning, standard size trees will attain a height of about 24 feet. Spread UNKNOWN. Planting spacing is not crown spread.',
    originalSourceWording:
      'With good pruning, standard size trees can be planted at about 26 feet x 20 feet with 84 trees per acre; these trees will attain a height of about 24 feet.'
  }),
  record({
    recordId: 'apple__extension-org__semi-dwarf-class',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple on semi-dwarfing rootstocks',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC,
    heightMinM: ft(14),
    heightMaxM: ft(22),
    sourceProvider: 'eXtension Apples Community of Practice (University of Minnesota / Penn State)',
    sourceTitle: 'Understanding Apple Tree Size: Dwarf, Semi-Dwarf and Standard',
    sourceIdentifier: 'EXTENSION-ORG-apple-tree-size',
    sourceUrl: 'https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 14, max: 22 }, percentOfStandard: { min: 60, max: 90 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'Semi-dwarfing rootstock class, depending on the rootstock. Spread UNKNOWN. Do not collapse with dwarf or standard.',
    originalSourceWording:
      'Semi-dwarfing rootstocks typically produce trees that are about 60% to 90% of standard size, with a height of about 14 feet to 22 feet, depending on the rootstock.'
  }),
  record({
    recordId: 'apple__extension-org__dwarf-class',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple on dwarfing rootstocks',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC,
    heightMinM: ft(6),
    heightMaxM: ft(12),
    sourceProvider: 'eXtension Apples Community of Practice (University of Minnesota / Penn State)',
    sourceTitle: 'Understanding Apple Tree Size: Dwarf, Semi-Dwarf and Standard',
    sourceIdentifier: 'EXTENSION-ORG-apple-tree-size',
    sourceUrl: 'https://apples.extension.org/understanding-apple-tree-size-dwarf-semi-dwarf-and-standard/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 6, max: 12 }, percentOfStandard: { min: 30, max: 60 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'Dwarfing rootstock class. Mature height about 6 to 12 feet depending on soil, scion cultivar, and training system. Spread UNKNOWN.',
    originalSourceWording:
      'Dwarfing rootstocks typically produce trees that are about 30% to 60% of the size of trees on seedling rootstocks, with a mature height of about 6 feet to 12 feet.'
  }),
  record({
    recordId: 'apple__umd-extension__standard-seedling',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'standard apple tree (Seedling)',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.CULTIVATED_STANDARD,
    heightMinM: ft(30),
    heightMaxM: ft(40),
    sourceProvider: 'University of Maryland Extension',
    sourceTitle: 'All About Apple Rootstocks (FS-2022-0638)',
    sourceIdentifier: 'UMD-FS-2022-0638',
    sourceUrl: 'https://extension.umd.edu/resource/all-about-apple-rootstocks-fs-2022-0638',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 30, max: 40 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'A standard apple tree (Seedling) has a height of 30-40 feet. Spread UNKNOWN. Conflicts with the “about 30 feet” unpruned figure; do not average.',
    originalSourceWording: 'A standard apple tree (Seedling) has a height of 30-40 feet.'
  }),
  record({
    recordId: 'apple__cornell__m9',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple cultivar on M.9',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC,
    heightMinM: ft(8),
    heightMaxM: ft(10),
    sourceProvider: 'Cornell Cooperative Extension',
    sourceTitle: 'Cornell Guide to Growing Fruit at Home',
    sourceIdentifier: 'CORNELL-ecommons-1813-67',
    sourceUrl: 'https://ecommons.cornell.edu/bitstream/1813/67/2/Cornell_Guide_to_Growing_Fruit.pdf',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 8, max: 10 }, rootstock: 'M.9' },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'Named dwarfing rootstock M.9. Spread UNKNOWN. Do not treat as a universal apple size.',
    originalSourceWording: 'M.9—A strongly dwarfing rootstock that produces a very short, 8- to 10-foot-tall tree.'
  }),
  record({
    recordId: 'apple__cornell__m26',
    canonicalSlug: 'apple',
    scientificName: 'Malus domestica',
    sourceScientificName: 'apple cultivar on M.26',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC,
    heightMinM: ft(11),
    heightMaxM: ft(14),
    sourceProvider: 'Cornell Cooperative Extension',
    sourceTitle: 'Cornell Guide to Growing Fruit at Home',
    sourceIdentifier: 'CORNELL-ecommons-1813-67',
    sourceUrl: 'https://ecommons.cornell.edu/bitstream/1813/67/2/Cornell_Guide_to_Growing_Fruit.pdf',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 11, max: 14 }, rootstock: 'M.26' },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions: 'Named dwarfing rootstock M.26. Spread UNKNOWN.',
    originalSourceWording: 'M.26—Produces slightly larger, 11- to 14-foot-tall trees that tend to be poorly anchored in the ground.'
  }),
  record({
    recordId: 'japanese-maple__morton-arboretum__species-landscape',
    canonicalSlug: 'japanese-maple',
    scientificName: 'Acer palmatum',
    sourceScientificName: 'Acer palmatum',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(15),
    heightMaxM: ft(25),
    spreadMinM: ft(15),
    spreadMaxM: ft(35),
    sourceProvider: 'The Morton Arboretum',
    sourceTitle: 'Japanese maple',
    sourceIdentifier: 'MORTON-ARB-acer-palmatum',
    sourceUrl: 'https://mortonarb.org/plant-and-protect/trees-and-plants/japanese-maple/',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 15, max: 25 }, widthFt: { min: 15, max: 35 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.BOTANICAL_GARDEN_ARBORETUM,
    notFinalPersonalGardenSize: true,
    conditions:
      'Species with many variations; can grow as a large shrub or a small tree. Hundreds of cultivars. Size range listed also includes medium shrub 5–8 feet through small tree 15–25 feet. Species range is not guaranteed for every cultivar.',
    originalSourceWording:
      'Japanese maple is a species with many variations. It can grow as a large shrub or a small tree. Size range: Medium shrub (5-8 feet), Large shrub (more than 8 feet), Compact tree (10-15 feet), Small tree (15-25 feet). Mature height 15-25 feet. Mature width 15-35 feet. There are hundreds of cultivars of Japanese maples.'
  }),
  record({
    recordId: 'japanese-maple__vt-extension__cultivar-dependent',
    canonicalSlug: 'japanese-maple',
    scientificName: 'Acer palmatum',
    sourceScientificName: 'Acer palmatum',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: ft(12),
    heightMaxM: ft(25),
    spreadMinM: ft(10),
    spreadMaxM: ft(25),
    sourceProvider: 'Virginia Cooperative Extension',
    sourceTitle: 'Japanese Maple (Acer palmatum)',
    sourceIdentifier: 'VT-EXT-2901-1049',
    sourceUrl: 'https://pubs.ext.vt.edu/content/dam/pubs_ext_vt_edu/2901/2901-1049/2901-1049.pdf',
    originalUnit: 'ft',
    originalRange: { heightFt: { min: 12, max: 25 }, spreadFt: { min: 10, max: 25 } },
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    notFinalPersonalGardenSize: true,
    conditions:
      'Height 12 to 25 feet depending on cultivar. Spread 10 to 25 feet depending on cultivar. Dissectum types are usually less than 15 feet tall. Do not create fictional cultivar records.',
    originalSourceWording:
      'Height: 12 to 25 feet (depending on cultivar). Spread: 10 to 25 feet (depending on cultivar). There are hundreds of cultivars of this species with different foliage types, forms, sizes, and bark characteristics. Dissectum types are slow-growing and are usually less than 15 feet tall at maturity.'
  }),
  record({
    recordId: 'mango__uf-ifas-enh563-st404__landscape-mature',
    canonicalSlug: 'mango',
    scientificName: 'Mangifera indica',
    sourceScientificName: 'Mangifera indica',
    sizeScenario: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    heightMinM: CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.min,
    heightMaxM: CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.max,
    spreadMinM: CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.spreadM.min,
    spreadMaxM: CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.spreadM.max,
    sourceProvider: 'UF/IFAS Extension',
    sourceTitle: 'Mangifera indica: Mango',
    sourceIdentifier: 'UF_IFAS_ENH563_ST404',
    sourceUrl: null,
    originalUnit: 'ft',
    originalRange: CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.original,
    identityScope: SIZE_EVIDENCE_IDENTITY_SCOPE.SPECIES,
    evidenceClass: DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE,
    sourceQualityTier: SOURCE_QUALITY_TIERS.UNIVERSITY_EXTENSION,
    conditions:
      'Mapped from already-approved calibration pack. UF landscape-tree fact sheet ST404 / ENH563. V1.1 stored NATURAL_MATURE because that was the only non-maintained V1 scenario. V2 maps this as LANDSCAPE_MATURE because the source is species-general landscape guidance. Numbers are unchanged. Owner LOW is design state and is not this botanical range.',
    originalSourceWording:
      `Height 30–60 ft, spread 30–50 ft. ${CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.note}`
  })
]);

export const PILOT_CONFLICTS = Object.freeze([
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    canonicalSlug: 'blue-gum',
    topic: 'height',
    sourceA: 'blue-gum__usda-feis__natural-mature-height',
    sourceB: 'blue-gum__calpoly-selectree__landscape-maxima',
    differingRanges: 'FEIS generally 30–55 m tall vs SelecTree maximum landscape height 80 ft (~24.4 m)',
    differingContext:
      'Ecological/naturalized stature versus landscape selection maxima. Do not downscale the FEIS botanical range because home gardens cannot accommodate it. Do not average.',
    possibleExplanations: ['landscape context', 'source definition', 'maximum vs typical']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    canonicalSlug: 'cypress',
    topic: 'height-max',
    sourceA: 'cypress__uf-ifas-st225__landscape-columnar',
    sourceB: 'cypress__ncsu-ces__landscape-columnar',
    differingRanges: 'UF/IFAS height 40–60 ft vs NCSU 40–70 ft; spread both 3–6 ft',
    differingContext: 'Same columnar landscape form; height maxima differ. Do not average. Narrow spread is architecture, not error.',
    possibleExplanations: ['landscape context', 'cultivar', 'source definition']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    canonicalSlug: 'apple',
    topic: 'standard-height',
    sourceA: 'apple__extension-org__standard-unpruned',
    sourceB: 'apple__umd-extension__standard-seedling',
    differingRanges: 'about 30 ft unpruned vs 30–40 ft seedling standard',
    differingContext: 'Both are seedling/standard class. Do not average. Spread given only by the about-30-ft record.',
    possibleExplanations: ['source definition', 'climate', 'maintenance']
  }),
  Object.freeze({
    code: 'SOURCE_CONFLICT_REVIEW_REQUIRED',
    canonicalSlug: 'japanese-maple',
    topic: 'species-range',
    sourceA: 'japanese-maple__morton-arboretum__species-landscape',
    sourceB: 'japanese-maple__vt-extension__cultivar-dependent',
    differingRanges: 'Morton 15–25 ft tall × 15–35 ft wide vs Virginia 12–25 ft tall × 10–25 ft wide, both depending on cultivar',
    differingContext: 'Cultivar variability is the shared explanation. Do not average. Do not invent cultivar records.',
    possibleExplanations: ['cultivar', 'source definition', 'landscape context']
  })
]);

export function validatePilotRecord(row) {
  const contract = validateBotanicalSizeEvidenceRecord(row);
  const errors = [...contract.errors];
  if (Number.isFinite(row.heightMinM) && Number.isFinite(row.heightMaxM) && row.heightMinM > row.heightMaxM) {
    errors.push('height-min-gt-max');
  }
  if (Number.isFinite(row.spreadMinM) && Number.isFinite(row.spreadMaxM) && row.spreadMinM > row.spreadMaxM) {
    errors.push('spread-min-gt-max');
  }
  if (row.inferredDimension) errors.push('inferred-dimension');
  if (row.ownerPreferredRangePosition) errors.push('design-preference-leaked');
  return { ok: errors.length === 0, errors };
}

export const RUNTIME_MAPPING_PROPOSAL = Object.freeze([
  Object.freeze({
    canonicalSlug: 'blue-gum',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.NATURAL_MATURE,
    physicalScaleSafeToUse: true,
    personalGardenNeedsCultivarOrRootstockInput: false,
    unknownFields: ['spread'],
    warnings: [
      'Do not substitute the 80 ft landscape maximum for the 30–55 m natural range.',
      'Spread UNKNOWN; do not infer from height.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'cypress',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    physicalScaleSafeToUse: true,
    personalGardenNeedsCultivarOrRootstockInput: false,
    unknownFields: [],
    warnings: [
      'Use independent height and spread. Narrow crown is valid architecture.',
      'Height maxima 60 vs 70 ft remain a source conflict; do not average.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'olive',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    physicalScaleSafeToUse: true,
    personalGardenNeedsCultivarOrRootstockInput: false,
    unknownFields: ['MAINTAINED_GARDEN numeric height/spread'],
    warnings: [
      'Pruning/hedge maintenance is source-supported as a practice, but no numeric maintained size was found.',
      'Do not invent a 3 m garden olive.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'lemon',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    physicalScaleSafeToUse: false,
    personalGardenNeedsCultivarOrRootstockInput: true,
    unknownFields: ['named lemon-on-rootstock height/spread'],
    warnings: [
      'NOT_FINAL_PERSONAL_GARDEN_SIZE.',
      'Species 10–20 ft “may reach” is not the 7–10 ft maintained home-landscape target.',
      'Citrus rootstock classes exist but are not lemon-scion-specific records.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'apple',
    bestAvailableScenarioForGenericPreview: null,
    physicalScaleSafeToUse: false,
    personalGardenNeedsCultivarOrRootstockInput: true,
    unknownFields: ['spread for dwarf/semi-dwarf/named rootstocks', 'universal species height'],
    warnings: [
      'No single mature size. Standard, semi-dwarf, dwarf, M.9, and M.26 remain separate.',
      'NOT_FINAL_PERSONAL_GARDEN_SIZE until rootstock is known.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'japanese-maple',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    physicalScaleSafeToUse: false,
    personalGardenNeedsCultivarOrRootstockInput: true,
    unknownFields: ['cultivar-specific dimensions'],
    warnings: [
      'Species range is not guaranteed for every cultivar.',
      'Do not invent cultivar records. Flag cultivar sensitivity.'
    ],
    applyRuntimeDefaultNow: false
  }),
  Object.freeze({
    canonicalSlug: 'mango',
    bestAvailableScenarioForGenericPreview: SIZE_EVIDENCE_SCENARIOS.LANDSCAPE_MATURE,
    physicalScaleSafeToUse: true,
    personalGardenNeedsCultivarOrRootstockInput: false,
    unknownFields: [],
    warnings: [
      'Species-general landscape range, not a cultivar guarantee.',
      'Owner LOW remains design state only and is not this botanical range.'
    ],
    applyRuntimeDefaultNow: false,
    ownerPreferredRangePositionUnchanged: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition
  })
]);

export function buildPilotSummary() {
  const validations = PILOT_EVIDENCE_RECORDS.map((row) => ({ recordId: row.recordId, ...validatePilotRecord(row) }));
  const failed = validations.filter((row) => !row.ok);
  const invented = PILOT_EVIDENCE_RECORDS.some((row) => row.inferredDimension);
  const catalogWritten = PILOT_EVIDENCE_RECORDS.some((row) => row.productionCatalogWritten);
  const mango = PILOT_EVIDENCE_RECORDS.find((row) => row.canonicalSlug === 'mango');
  const oliveMaintainedNumeric = PILOT_EVIDENCE_RECORDS.some(
    (row) =>
      row.canonicalSlug === 'olive' &&
      row.sizeScenario === SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN &&
      (Number.isFinite(row.heightMinM) || Number.isFinite(row.heightMaxM) || Number.isFinite(row.spreadMinM) || Number.isFinite(row.spreadMaxM))
  );
  const appleCollapsed = PILOT_EVIDENCE_RECORDS.filter((row) => row.canonicalSlug === 'apple').length < 2;
  const pass =
    failed.length === 0 &&
    !invented &&
    !catalogWritten &&
    !oliveMaintainedNumeric &&
    !appleCollapsed &&
    mango &&
    mango.heightMinM === CALIBRATION_BOTANICAL_SIZE_EVIDENCE.mango.heightM.min &&
    MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition === 'LOW';
  return {
    contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION,
    verdict: pass ? 'PILOT_CONTRACT_PASS' : 'PILOT_CONTRACT_FAIL',
    massEnrichmentStarted: false,
    productionCatalogWritten: false,
    inventedBotanicalValues: invented,
    ownerLowUnchanged: MANGO_GARDEN_DESIGN_PREFERENCE.ownerPreferredRangePosition === 'LOW',
    recordCount: PILOT_EVIDENCE_RECORDS.length,
    conflictCount: PILOT_CONFLICTS.length,
    validations,
    oliveMaintainedNumericInvented: oliveMaintainedNumeric,
    spend: { openaiCalls: 0, imageGeneration: 0, paidBotanicalAcquisitionUsd: 0, additionalSpendUsd: 0 }
  };
}

export function writeBotanicalSizeEvidencePilotReports(root) {
  const dir = path.join(root, 'data', 'garden-design', 'botanical-size-evidence-pilot-v1');
  fs.mkdirSync(dir, { recursive: true });
  const summary = buildPilotSummary();
  const evidencePath = path.join(dir, 'evidence-records.json');
  const sourcePath = path.join(dir, 'source-audit.json');
  const conflictPath = path.join(dir, 'conflicts.json');
  const summaryPath = path.join(dir, 'pilot-summary.json');
  const mappingPath = path.join(dir, 'runtime-mapping-proposal.json');
  const sources = [...new Map(PILOT_EVIDENCE_RECORDS.map((row) => [row.sourceUrl || row.sourceIdentifier, {
    canonicalSlug: row.canonicalSlug,
    sourceProvider: row.sourceProvider,
    sourceTitle: row.sourceTitle,
    sourceIdentifier: row.sourceIdentifier,
    sourceUrl: row.sourceUrl,
    sourceQualityTier: row.sourceQualityTier
  }])).values()];
  fs.writeFileSync(evidencePath, `${JSON.stringify({ contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION, productionCatalogWritten: false, records: PILOT_EVIDENCE_RECORDS }, null, 2)}\n`);
  fs.writeFileSync(sourcePath, `${JSON.stringify({ contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION, sources }, null, 2)}\n`);
  fs.writeFileSync(conflictPath, `${JSON.stringify({ contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION, conflicts: PILOT_CONFLICTS }, null, 2)}\n`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(mappingPath, `${JSON.stringify({ contract: BOTANICAL_SIZE_EVIDENCE_PILOT_VERSION, applyRuntimeDefaultNow: false, mappings: RUNTIME_MAPPING_PROPOSAL }, null, 2)}\n`);
  return { evidencePath, sourcePath, conflictPath, summaryPath, mappingPath, verdict: summary.verdict, spend: summary.spend };
}
