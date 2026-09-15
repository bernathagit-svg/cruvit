/**
 * Smart Rec purpose-policy V1.
 *
 * Interprets validated Survival / Growth / Flowering / Fruiting for a
 * recommendation purpose. Does not score climate and is not a second engine.
 *
 * Purpose authority (locked):
 * 1. explicit current user intent (Smart Rec answers / chips)
 * 2. catalog tags / groupIds / harvest stance
 * 3. canonical category fallback
 * 4. garden-fit (survival+growth) when purpose cannot safely be determined
 */

export const SMART_REC_PURPOSE_POLICY_VERSION = '1.0.0';

export const PURPOSE_ROLES = Object.freeze([
  'fruiting-crop',
  'fruiting-harvest',
  'flowering-ornamental',
  'foliage-structure',
  'vegetative-harvest',
  'pollinator',
  'garden-fit'
]);

export const PURPOSE_FIT_STATUS = Object.freeze({
  SUITABLE: 'suitable',
  CONDITIONAL: 'conditional',
  EVIDENCE_LIMITED: 'evidence-limited',
  UNSUITABLE: 'unsuitable',
  BLOCKED: 'blocked'
});

const PURPOSE_BAND = Object.freeze({
  suitable: 5,
  conditional: 4,
  'evidence-limited': 3,
  unsuitable: 2,
  blocked: 1
});

const FRUIT_TAGS = new Set(['fruit', 'nut', 'berry', 'citrus']);
const FRUITING_VEG_TAGS = new Set(['fruiting', 'melon', 'cucurbit']);
const VEGETATIVE_TAGS = new Set(['root', 'leafy', 'leaf', 'herb', 'foliage']);
const VEGETABLE_TAGS = new Set(['vegetable', 'veg', 'cole']);
const FLOWERING_TAGS = new Set(['flowering', 'color', 'fragrant', 'ornamental']);
const FOLIAGE_TAGS = new Set(['tree', 'hedge', 'climber', 'evergreen', 'shrub', 'screen']);
const FRUIT_GROUPS = /fruit-tree|tropical-frost-sensitive-fruit|mediterranean-fruit|warm-citrus|cool-moist-berry|subtropical-fruit/;
const HERB_GROUPS = /herb-edible/;

function asText(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function tagSet(plant = {}, meta = {}) {
  const out = new Set();
  for (const t of plant.tags || meta.tags || []) out.add(asText(t));
  return out;
}

function groupList(plant = {}, meta = {}) {
  const groups = meta.groupIds || plant.groupIds || plant.climateTraits?.groupIds || [];
  return Array.isArray(groups) ? groups.map((g) => asText(g)) : [];
}

function outcomePolarity(status) {
  const s = asText(status);
  if (s === 'unreliable' || s === 'unlikely' || s === 'poor') return 'negative';
  if (s === 'constrained') return 'conditional';
  if (s === 'reliable' || s === 'supported') return 'positive';
  return 'unknown';
}

function derivedStatus(derived, key) {
  if (!derived || typeof derived !== 'object') return 'unknown';
  return derived[`${key}Label`] || derived[key] || 'unknown';
}

/**
 * Catalog capabilities from existing tags / groupIds / harvest stance.
 * Does not parse common names.
 */
export function catalogPurposeCapabilities(plant = {}, meta = {}) {
  const tags = tagSet(plant, meta);
  const groups = groupList(plant, meta);
  const traits = meta && typeof meta === 'object' ? meta : plant.climateTraits || {};
  const fruitingApplicable = traits.fruitingOutcomeApplicable !== false;
  const floweringApplicable = traits.floweringOutcomeApplicable !== false;
  const caps = [];

  const fruitTag = [...FRUIT_TAGS].some((t) => tags.has(t));
  const vegTag = [...VEGETABLE_TAGS].some((t) => tags.has(t));
  const rootOrLeaf = [...VEGETATIVE_TAGS].some((t) => tags.has(t));
  const fruitingVeg = [...FRUITING_VEG_TAGS].some((t) => tags.has(t));
  const edibleTag = tags.has('edible');
  const fruitGroup = groups.some((g) => FRUIT_GROUPS.test(g));
  const herbGroup = groups.some((g) => HERB_GROUPS.test(g)) || tags.has('herb');
  const floweringTag = [...FLOWERING_TAGS].some((t) => tags.has(t));
  const foliageTag = [...FOLIAGE_TAGS].some((t) => tags.has(t));

  if (fruitTag && !vegTag) caps.push('fruiting-crop');
  if (
    vegTag &&
    fruitingApplicable &&
    (fruitingVeg || (edibleTag && !rootOrLeaf && !herbGroup))
  ) {
    caps.push('fruiting-harvest');
  }
  if ((rootOrLeaf || (vegTag && !fruitingVeg && !fruitTag)) && !caps.includes('fruiting-harvest')) {
    caps.push('vegetative-harvest');
  }
  if (herbGroup && !caps.includes('vegetative-harvest') && !fruitTag) caps.push('vegetative-harvest');
  if (fruitGroup && !vegTag && !rootOrLeaf && !herbGroup && !caps.includes('fruiting-crop')) {
    caps.push('fruiting-crop');
  }
  if (floweringTag && floweringApplicable) caps.push('flowering-ornamental');
  if (
    foliageTag &&
    !fruitTag &&
    !caps.includes('fruiting-crop') &&
    !caps.includes('fruiting-harvest')
  ) {
    caps.push('foliage-structure');
  }
  if (traits.floweringRequirements && !fruitTag && !vegTag && !caps.includes('flowering-ornamental')) {
    if (floweringApplicable && (tags.has('perennial') || tags.has('ornamental'))) {
      caps.push('flowering-ornamental');
    }
  }
  return [...new Set(caps)];
}

function userIntentRole(intent = {}) {
  const a = intent.answers && typeof intent.answers === 'object' ? intent.answers : {};
  const chips = Array.isArray(intent.chips) ? intent.chips.map(asText) : [];
  if (a.q9 === 'food-herbs') return { family: 'edible', source: 'user-q9' };
  if (a.q9 === 'beauty') return { family: 'flowering-ornamental', source: 'user-q9' };
  if (a.q9 === 'privacy' || a.q9 === 'shade') return { family: 'foliage-structure', source: 'user-q9' };
  if (a.q9 === 'wildlife') return { family: 'pollinator', source: 'user-q9' };
  if (a.q5 === 'yes-edible') return { family: 'edible', source: 'user-q5' };
  if (a.q5 === 'ornamental-only' && a.q6 === 'foliage') {
    return { family: 'foliage-structure', source: 'user-q5-q6' };
  }
  if (a.q5 === 'ornamental-only' && a.q6 === 'yes-flowering') {
    return { family: 'flowering-ornamental', source: 'user-q5-q6' };
  }
  if (a.q5 === 'ornamental-only') return { family: 'ornamental', source: 'user-q5' };
  if (a.q6 === 'yes-flowering') return { family: 'flowering-ornamental', source: 'user-q6' };
  if (a.q6 === 'foliage') return { family: 'foliage-structure', source: 'user-q6' };
  if (intent.edibleIntent === true || chips.includes('edible')) {
    return { family: 'edible', source: chips.includes('edible') ? 'user-chip' : 'user-intent' };
  }
  if (intent.floweringIntent === true || chips.includes('flowering')) {
    return { family: 'flowering-ornamental', source: chips.includes('flowering') ? 'user-chip' : 'user-intent' };
  }
  return null;
}

function refineEdibleRole(capabilities) {
  if (capabilities.includes('fruiting-crop')) return 'fruiting-crop';
  if (capabilities.includes('fruiting-harvest')) return 'fruiting-harvest';
  if (capabilities.includes('vegetative-harvest')) return 'vegetative-harvest';
  return null;
}

function refineOrnamentalRole(capabilities) {
  if (capabilities.includes('flowering-ornamental')) return 'flowering-ornamental';
  if (capabilities.includes('foliage-structure')) return 'foliage-structure';
  return 'flowering-ornamental';
}

/**
 * Resolve recommendation purpose. Never infers from common-name keywords.
 */
export function resolveSmartRecPurpose({ intent = null, plant = {}, meta = {} } = {}) {
  const capabilities = catalogPurposeCapabilities(plant, meta);
  const user = userIntentRole(intent || {});
  if (user) {
    let role = user.family;
    let applicable = true;
    if (user.family === 'edible') {
      role = refineEdibleRole(capabilities);
      if (!role) {
        return {
          role: 'garden-fit',
          source: user.source,
          userIntent: user.family,
          capabilities,
          applicable: false,
          reason: 'User edible intent has no catalog harvest/fruit capability.'
        };
      }
    } else if (user.family === 'ornamental') {
      role = refineOrnamentalRole(capabilities);
    } else if (user.family === 'pollinator') {
      role = 'pollinator';
    } else if (user.family === 'flowering-ornamental') {
      role = 'flowering-ornamental';
    } else if (user.family === 'foliage-structure') {
      role = 'foliage-structure';
    }
    return {
      role,
      source: user.source,
      userIntent: user.family,
      capabilities,
      applicable,
      reason: `Explicit user intent (${user.source}).`
    };
  }
  if (capabilities.length === 1) {
    return {
      role: capabilities[0],
      source: 'catalog',
      userIntent: null,
      capabilities,
      applicable: true,
      reason: 'Single catalog capability.'
    };
  }
  if (capabilities.length > 1) {
    return {
      role: 'garden-fit',
      source: 'catalog-multi',
      userIntent: null,
      capabilities,
      applicable: true,
      reason: 'Multiple catalog capabilities; no user purpose selected.'
    };
  }
  return {
    role: 'garden-fit',
    source: 'unknown',
    userIntent: null,
    capabilities,
    applicable: true,
    reason: 'Purpose cannot be determined; garden-fit uses Survival and Growth.'
  };
}

export function purposeDimensions(role) {
  const r = asText(role);
  if (r === 'fruiting-crop' || r === 'fruiting-harvest') {
    return { primary: ['survival', 'growth', 'fruiting'], supporting: ['flowering'] };
  }
  if (r === 'flowering-ornamental' || r === 'pollinator') {
    return { primary: ['survival', 'growth', 'flowering'], supporting: [] };
  }
  if (r === 'vegetative-harvest' || r === 'foliage-structure' || r === 'garden-fit') {
    return { primary: ['survival', 'growth'], supporting: [] };
  }
  return { primary: ['survival', 'growth'], supporting: [] };
}

function combineFit(polarities) {
  if (polarities.includes('negative')) return PURPOSE_FIT_STATUS.UNSUITABLE;
  if (polarities.includes('unknown')) return PURPOSE_FIT_STATUS.EVIDENCE_LIMITED;
  if (polarities.includes('conditional')) return PURPOSE_FIT_STATUS.CONDITIONAL;
  if (polarities.length && polarities.every((p) => p === 'positive')) return PURPOSE_FIT_STATUS.SUITABLE;
  return PURPOSE_FIT_STATUS.EVIDENCE_LIMITED;
}

export function evaluatePurposeFit({
  purpose = null,
  derived = null,
  hardSurvivalBlocked = false,
  safetyBlocked = false
} = {}) {
  const resolved = purpose && typeof purpose === 'object' ? purpose : { role: 'garden-fit', applicable: true };
  const survival = outcomePolarity(derivedStatus(derived, 'survival'));
  if (hardSurvivalBlocked === true || safetyBlocked === true || survival === 'negative') {
    return {
      status: PURPOSE_FIT_STATUS.BLOCKED,
      role: resolved.role || 'garden-fit',
      primary: ['survival'],
      supporting: [],
      reason: 'Hard survival or safety blocker outranks purpose interpretation.'
    };
  }
  if (resolved.applicable === false) {
    return {
      status: PURPOSE_FIT_STATUS.UNSUITABLE,
      role: resolved.role || 'garden-fit',
      primary: [],
      supporting: [],
      reason: resolved.reason || 'Selected purpose is not a catalog capability of this plant.'
    };
  }
  const dims = purposeDimensions(resolved.role);
  const primaryPolarity = dims.primary.map((key) => outcomePolarity(derivedStatus(derived, key)));
  let status = combineFit(primaryPolarity);
  const supportingPolarity = dims.supporting.map((key) => outcomePolarity(derivedStatus(derived, key)));
  if (status === PURPOSE_FIT_STATUS.SUITABLE && supportingPolarity.includes('negative')) {
    status = PURPOSE_FIT_STATUS.CONDITIONAL;
  }
  return {
    status,
    role: resolved.role,
    primary: dims.primary,
    supporting: dims.supporting,
    reason:
      status === PURPOSE_FIT_STATUS.SUITABLE
        ? 'Primary purpose dimensions are supported.'
        : status === PURPOSE_FIT_STATUS.CONDITIONAL
          ? 'Primary purpose dimensions are only a partial match.'
          : status === PURPOSE_FIT_STATUS.EVIDENCE_LIMITED
            ? 'Primary purpose evidence is missing or not comparable.'
            : 'Primary purpose dimension is a sourced negative.'
  };
}

export function capRecommendationLevelForPurpose(level, purposeFit) {
  const current = asText(level) || 'borderline';
  const status = purposeFit?.status || PURPOSE_FIT_STATUS.EVIDENCE_LIMITED;
  if (status === PURPOSE_FIT_STATUS.BLOCKED) return 'blocked';
  if (current === 'blocked') return 'blocked';
  if (status === PURPOSE_FIT_STATUS.SUITABLE) return current === 'excellent' || current === 'good' ? current : current;
  if (current === 'excellent' || current === 'good') return 'borderline';
  return current || 'borderline';
}

const ROLE_PHRASE = Object.freeze({
  'fruiting-crop': { en: 'fruit', he: 'פרי' },
  'fruiting-harvest': { en: 'fruit', he: 'פרי' },
  'flowering-ornamental': { en: 'flowers', he: 'פריחה' },
  pollinator: { en: 'pollinators', he: 'מאביקים' },
  'vegetative-harvest': { en: 'harvest', he: 'יבול' },
  'foliage-structure': { en: 'foliage', he: 'עלים' }
});

export function formatPurposeRecommendationLabel(purpose, purposeFit, recommendationLevel, he = false) {
  const role = purpose?.role || purposeFit?.role || 'garden-fit';
  const status = purposeFit?.status || PURPOSE_FIT_STATUS.EVIDENCE_LIMITED;
  const explicit = !!(purpose?.userIntent || (purpose?.source || '').startsWith('user'));
  if (!explicit || role === 'garden-fit') {
    return asText(recommendationLevel) || 'borderline';
  }
  const phrase = ROLE_PHRASE[role] || { en: 'this purpose', he: 'מטרה זו' };
  const forWord = he ? 'עבור' : 'for';
  const target = he ? phrase.he : phrase.en;
  if (status === PURPOSE_FIT_STATUS.BLOCKED) return he ? 'חסום' : 'blocked';
  if (status === PURPOSE_FIT_STATUS.UNSUITABLE) {
    return he ? `לא ${forWord} ${target}` : `Not ${forWord} ${target}`;
  }
  if (status === PURPOSE_FIT_STATUS.EVIDENCE_LIMITED) {
    return he ? `מוגבל-ראיות ${forWord} ${target}` : `Evidence-limited ${forWord} ${target}`;
  }
  if (status === PURPOSE_FIT_STATUS.CONDITIONAL) {
    return he ? `מותנה ${forWord} ${target}` : `Conditional ${forWord} ${target}`;
  }
  const level = asText(recommendationLevel);
  if (level === 'excellent') return he ? `מצוין ${forWord} ${target}` : `Excellent ${forWord} ${target}`;
  return he ? `טוב ${forWord} ${target}` : `Good ${forWord} ${target}`;
}

export function purposeRankBand(purposeFit) {
  return PURPOSE_BAND[purposeFit?.status] || 0;
}

export function applyPurposePolicyToSuitability(suitability = {}, derived = null, options = {}) {
  const next = Object.assign({}, suitability && typeof suitability === 'object' ? suitability : {});
  const purpose = resolveSmartRecPurpose({
    intent: options.intent || null,
    plant: options.plant || {},
    meta: options.meta || options.plant?.climateTraits || {}
  });
  const purposeFit = evaluatePurposeFit({
    purpose,
    derived,
    hardSurvivalBlocked: next.hardSurvivalBlocked === true,
    safetyBlocked: options.safetyBlocked === true
  });
  next.recommendationLevel = capRecommendationLevelForPurpose(next.recommendationLevel, purposeFit);
  if (purposeFit.status === PURPOSE_FIT_STATUS.BLOCKED) {
    next.hardSurvivalBlocked = next.hardSurvivalBlocked === true || derived?.survival === 'unreliable';
  }
  next.purpose = purpose;
  next.purposeFit = purposeFit;
  next.recommendationLabel = formatPurposeRecommendationLabel(
    purpose,
    purposeFit,
    next.recommendationLevel,
    options.he === true
  );
  return next;
}
