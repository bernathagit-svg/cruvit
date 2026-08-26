/**
 * Cruvit — Smart Recommendations developer Hero Answer Generator Skeleton
 * -----------------------------------------------------------------------
 * Pure, developer-only, synthetic-only Hero Answer skeleton composer from a
 * controlled Garden Memory packet. Plant-free; no named candidates; no final
 * suitability; no recommendation authority.
 *
 * NON-CONSUMER CONTRACT
 *  - Not imported by index.html; not a product runtime path.
 *  - Explicit-call-only; no DOM, storage, fetch, timers, or persistence.
 *  - Accepts already-built synthetic Garden Memory packets only.
 *  - Does not import GOS, v1b, product runtime, overlay, or live weather.
 *  - Does not activate Smart Recommendations or Product Authority.
 *  - Does not recommend plants, name plant candidates, or grant suitability.
 *  - Does not claim System Validation or production readiness.
 */

export const SR_HERO_ANSWER_GENERATOR_SKELETON_VERSION =
  '0.1.0-sr-hero-answer-generator-skeleton';

export const SR_HERO_ANSWER_GENERATOR_SKELETON_CAPABILITY =
  'explicit_developer_hero_answer_generator_skeleton';

export const SR_HERO_REVIEW_GATES = Object.freeze([
  'proceed_low_confidence',
  'ask_progressive_intake',
  'requires_owner_review',
  'stop_not_enough_information'
]);

export const SR_HERO_CONFIDENCE_LEVELS = Object.freeze([
  'high',
  'medium',
  'low',
  'not_enough_information'
]);

export const SR_HERO_PRECISION_GAPS_LABEL =
  'מה כדאי להשלים כדי לדייק את התשובה';

export const SR_HERO_FORBIDDEN_WEAKNESS_LABEL =
  'מה CRUVIT עדיין לא יודעת';

const CRITICAL_SITE_FIELDS = Object.freeze([
  'sunExposure',
  'drainage',
  'wateringMethod'
]);

const FORBIDDEN_OUTPUT_PATTERNS = Object.freeze([
  /final\s+plant\s+recommendation/i,
  /suitability\s*score/i,
  /system\s+validation/i,
  /smart\s+recommendations\s+live/i
]);

function freezeDeep(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  seen = seen || new WeakSet();
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) freezeDeep(value[i], seen);
  } else {
    const keys = Object.keys(value);
    for (let i = 0; i < keys.length; i++) freezeDeep(value[keys[i]], seen);
  }
  return Object.freeze(value);
}

function asObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isUnknownValue(v) {
  return (
    v === undefined ||
    v === null ||
    v === '' ||
    v === 'unknown' ||
    v === 'unknown_skipped' ||
    v === 'skipped'
  );
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < (list || []).length; i++) {
    const item = list[i];
    if (!isNonEmptyString(item)) continue;
    const trimmed = item.trim();
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function collectKnownUnknowns(gardenMemory) {
  const packet = asObject(gardenMemory) || {};
  const fromList = Array.isArray(packet.knownUnknowns)
    ? packet.knownUnknowns.filter(isNonEmptyString).map(function (x) {
        return x.trim();
      })
    : [];
  const fromFields = [];
  const site = asObject(packet.siteConditions) || {};
  for (let i = 0; i < CRITICAL_SITE_FIELDS.length; i++) {
    const field = CRITICAL_SITE_FIELDS[i];
    if (isUnknownValue(site[field])) {
      fromFields.push('siteConditions.' + field);
    }
  }
  if (isUnknownValue(packet.primaryGoal)) fromFields.push('primaryGoal');
  if (isUnknownValue(packet.growingContextType) && isUnknownValue(packet.zoneLabel)) {
    fromFields.push('gardenZone');
  }
  const location = asObject(packet.locationClimate) || {};
  if (isUnknownValue(location.locationConfidence)) {
    fromFields.push('locationClimate.locationConfidence');
  }
  return uniqueStrings(fromList.concat(fromFields));
}

function deriveRiskFlags(gardenMemory) {
  const packet = asObject(gardenMemory) || {};
  const prefs = asObject(packet.preferencesConstraints) || {};
  const location = asObject(packet.locationClimate) || {};
  const namedCandidates = Array.isArray(packet.namedPlantCandidates)
    ? packet.namedPlantCandidates
    : [];
  return {
    namedPlantCandidatesPresent:
      namedCandidates.length > 0 || packet.showNamedCandidates === true,
    safetySensitive:
      packet.safetySensitive === true || prefs.toxicityConcern === true,
    petChildSafetyConcern:
      prefs.petsSafetyConcern === true || prefs.childrenSafetyConcern === true,
    weakClimateConfidence:
      location.locationConfidence === 'low' ||
      location.locationConfidence === 'none' ||
      location.locationConfidence === 'unknown',
    materialClimateUncertainty:
      location.frostExposureUnknown === true ||
      location.heatDrynessUnknown === true,
    expensiveIrreversibleRisk: packet.expensiveIrreversibleRisk === true,
    implyFinalRecommendation: packet.implyFinalRecommendation === true
  };
}

export function getSmartRecDeveloperHeroAnswerGeneratorSkeletonDescriptor() {
  return freezeDeep({
    skeletonVersion: SR_HERO_ANSWER_GENERATOR_SKELETON_VERSION,
    capability: SR_HERO_ANSWER_GENERATOR_SKELETON_CAPABILITY,
    developerOnly: true,
    syntheticOnly: true,
    authoritative: false,
    productAuthority: false,
    runtimeEligibilityAuthority: false,
    recommendationAuthority: false,
    overlayAuthority: false,
    liveWeather: false,
    gosConsumer: false,
    network: false,
    automaticExecution: false,
    writesArtifacts: false,
    activation: 'explicit_call_only',
    plantSuitabilityAuthority: false,
    commerceAuthority: false,
    doesNotRecommendPlants: true,
    doesNotNamePlantCandidates: true,
    doesNotGrantFinalSuitability: true,
    doesNotClaimSystemValidation: true,
    precisionGapsLabel: SR_HERO_PRECISION_GAPS_LABEL
  });
}

export function normalizeGardenMemory(gardenMemory) {
  const packet = asObject(gardenMemory) || {};
  const site = asObject(packet.siteConditions) || {};
  const location = asObject(packet.locationClimate) || {};
  const prefs = asObject(packet.preferencesConstraints) || {};

  const normalized = {
    gardenZone: {
      growingContextType: packet.growingContextType || 'unknown',
      zoneLabel: packet.zoneLabel || null,
      plantingSurface: packet.plantingSurface || site.plantingSurface || 'unknown'
    },
    locationClimate: {
      locationLevel: location.locationLevel || null,
      climateInterpretation: location.climateInterpretation || null,
      locationConfidence: location.locationConfidence || 'unknown',
      frostExposure: location.frostExposure || 'unknown',
      heatDryness: location.heatDryness || 'unknown'
    },
    siteConditions: {
      sunExposure: site.sunExposure || 'unknown',
      orientation: site.orientation || 'unknown',
      drainage: site.drainage || 'unknown',
      wateringMethod: site.wateringMethod || site.waterAccess || 'unknown',
      groundOrContainer: site.groundOrContainer || packet.plantingSurface || 'unknown'
    },
    goal: {
      primaryGoal: packet.primaryGoal || 'unknown',
      outcomeDimension: packet.outcomeDimension || null
    },
    preferencesConstraints: {
      maintenanceTolerance: prefs.maintenanceTolerance || 'unknown',
      waterLimits: prefs.waterLimits || 'unknown',
      evergreenDeciduous: prefs.evergreenDeciduous || 'unknown',
      floweringImportance: prefs.floweringImportance || 'unknown',
      pestInsectConcern: prefs.pestInsectConcern || 'unknown',
      petsSafetyConcern: prefs.petsSafetyConcern === true,
      childrenSafetyConcern: prefs.childrenSafetyConcern === true,
      toxicityConcern: prefs.toxicityConcern === true,
      avoidWasps: prefs.avoidWasps === true,
      avoidInsectAttraction: prefs.avoidInsectAttraction === true,
      coverageSpeed: isNonEmptyString(prefs.coverageSpeed)
        ? prefs.coverageSpeed.trim()
        : 'unknown',
      wallAreaApproxSqm:
        typeof prefs.wallAreaApproxSqm === 'number' &&
        Number.isFinite(prefs.wallAreaApproxSqm)
          ? prefs.wallAreaApproxSqm
          : null
    },
    knownUnknowns: collectKnownUnknowns(packet),
    priorCorrections: Array.isArray(packet.priorCorrections)
      ? packet.priorCorrections.slice()
      : [],
    outcomeHistory: Array.isArray(packet.outcomeHistory)
      ? packet.outcomeHistory.slice()
      : [],
    sourceLabels: asObject(packet.sourceLabels) || {},
    confidenceLabels: asObject(packet.confidenceLabels) || {},
    riskFlags: deriveRiskFlags(packet),
    syntheticOnly: packet.syntheticOnly === true
  };

  return freezeDeep(normalized);
}

export function detectCriticalGaps(contextPacket) {
  const packet = asObject(contextPacket) || {};
  const gaps = [];
  const zone = asObject(packet.gardenZone) || {};
  const goal = asObject(packet.goal) || {};
  const site = asObject(packet.siteConditions) || {};
  const location = asObject(packet.locationClimate) || {};

  if (isUnknownValue(goal.primaryGoal)) {
    gaps.push({ field: 'goal.primaryGoal', reason: 'primary_goal_missing' });
  }

  if (
    isUnknownValue(zone.growingContextType) &&
    !isNonEmptyString(zone.zoneLabel)
  ) {
    gaps.push({ field: 'gardenZone', reason: 'garden_zone_missing' });
  }

  if (
    location.locationConfidence === 'none' ||
    location.locationConfidence === 'unknown'
  ) {
    gaps.push({
      field: 'locationClimate.locationConfidence',
      reason: 'location_confidence_missing'
    });
  }

  const hasSiteSignal = CRITICAL_SITE_FIELDS.some(function (field) {
    return !isUnknownValue(site[field]);
  });
  if (!hasSiteSignal) {
    gaps.push({
      field: 'siteConditions',
      reason: 'no_relevant_site_condition_known'
    });
  }

  return freezeDeep(gaps);
}

export function decideReviewGate(contextPacket, gaps) {
  const packet = asObject(contextPacket) || {};
  const gapList = Array.isArray(gaps) ? gaps : [];
  const risk = asObject(packet.riskFlags) || {};
  const goal = asObject(packet.goal) || {};
  const zone = asObject(packet.gardenZone) || {};
  const location = asObject(packet.locationClimate) || {};

  const goalMissing = gapList.some(function (g) {
    return g && g.reason === 'primary_goal_missing';
  });
  const zoneMissing = gapList.some(function (g) {
    return g && g.reason === 'garden_zone_missing';
  });
  const climateTooWeak =
    location.locationConfidence === 'none' ||
    (risk.weakClimateConfidence && risk.materialClimateUncertainty);

  if (goalMissing || zoneMissing || climateTooWeak) {
    return 'stop_not_enough_information';
  }

  if (
    risk.namedPlantCandidatesPresent ||
    risk.safetySensitive ||
    risk.petChildSafetyConcern ||
    risk.expensiveIrreversibleRisk ||
    risk.implyFinalRecommendation ||
    (risk.weakClimateConfidence && risk.materialClimateUncertainty)
  ) {
    return 'requires_owner_review';
  }

  if (gapList.length > 0) {
    return 'ask_progressive_intake';
  }

  return 'proceed_low_confidence';
}

function questionForGap(gap) {
  const reason = gap && gap.reason;
  if (reason === 'no_relevant_site_condition_known') {
    return 'מה חשיפת השמש / ניקוז / שיטת השקיה באזור הזה?';
  }
  if (reason === 'location_confidence_missing') {
    return 'מה רמת הוודאות לגבי מיקום / אקלים באזור הגינה?';
  }
  if (reason === 'primary_goal_missing') {
    return 'מה המטרה העיקרית שלך באזור הגינה הזה?';
  }
  if (reason === 'garden_zone_missing') {
    return 'איזה סוג אזור גינה זה (מרפסת / מיכל / גינה בקרקע / קיר)?';
  }
  return 'מה עוד חשוב לדעת על אזור הגינה הזה?';
}

export function buildProgressiveIntakeQuestions(contextPacket, gaps) {
  const gapList = Array.isArray(gaps) ? gaps : [];
  const packet = asObject(contextPacket) || {};
  const known = new Set(packet.knownUnknowns || []);
  const questions = [];

  for (let i = 0; i < gapList.length && questions.length < 3; i++) {
    const gap = gapList[i];
    if (!gap || !gap.field) continue;
    if (known.has(gap.field)) continue;
    const q = questionForGap(gap);
    if (questions.indexOf(q) === -1) questions.push(q);
  }

  return freezeDeep(
    questions.map(function (text, index) {
      return {
        id: 'progressive_intake_' + (index + 1),
        text: text,
        allowsUnknown: true
      };
    })
  );
}

export function buildOutcomeFeedbackPrompt() {
  return freezeDeep({
    didUserAct: 'האם ביצעת פעולה בעקבות התשובה?',
    actionTaken: 'מה הפעולה שבוצעה (שתילה / רכישה / העברה / גיזום / השקיה / לא בוצע)?',
    laterOutcome:
      'מה קרה לאחר זמן (הישרדות / צמיחה / פריחה / תשואה / מזיקים / עומס תחזוקה)?',
    pestsInsectsWasps: 'האם הופיעו מזיקים / דבורים / יתושים?',
    maintenanceBurden: 'האם נדרשה תחזוקה גבוהה מהצפוי?',
    userSatisfaction: 'האם התשובה הייתה שימושית?',
    changeNextRecommendation: 'מה כדאי לשנות בהמלצה הבאה?'
  });
}

function deriveConfidence(contextPacket, gaps, reviewGate) {
  if (reviewGate === 'stop_not_enough_information') {
    return 'not_enough_information';
  }
  const packet = asObject(contextPacket) || {};
  const gapCount = (gaps || []).length;
  const unknownCount = (packet.knownUnknowns || []).length;

  if (reviewGate === 'requires_owner_review') return 'low';
  if (gapCount >= 2 || unknownCount >= 3) return 'low';
  if (gapCount === 1 || unknownCount >= 1) return 'medium';
  if (unknownCount === 0 && gapCount === 0) return 'high';
  return 'medium';
}

function buildOutcomeDimensions(contextPacket) {
  const goal = asObject((contextPacket || {}).goal) || {};
  const primary = goal.primaryGoal || 'unknown';
  const dims = ['survival'];
  if (primary === 'growth' || primary === 'privacy_coverage') dims.push('growth_coverage');
  if (primary === 'flowering') dims.push('flowering');
  if (primary === 'fruit_yield') dims.push('fruit_yield');
  if (primary === 'low_maintenance') dims.push('maintenance_burden');
  dims.push('long_term_reliability');
  return uniqueStrings(dims);
}

function buildTradeOffs(contextPacket) {
  const packet = asObject(contextPacket) || {};
  const prefs = asObject(packet.preferencesConstraints) || {};
  const tradeOffs = [];
  if (prefs.floweringImportance === 'high') {
    tradeOffs.push('flowering_may_increase_insect_interest');
  }
  if (prefs.evergreenDeciduous === 'evergreen_required') {
    tradeOffs.push('evergreen_requirement_narrows_options');
  }
  if (prefs.maintenanceTolerance === 'low') {
    tradeOffs.push('low_maintenance_limits_fast_coverage_choices');
  }
  if ((packet.knownUnknowns || []).length > 0) {
    tradeOffs.push('missing_site_facts_reduce_precision');
  }
  return uniqueStrings(tradeOffs);
}

function buildRecommendedNextAction(reviewGate, feedbackInfluence) {
  if (feedbackInfluence && feedbackInfluence.appliedToNextAnswer) {
    return (
      'התשובה הבאה תישאר קצרה. אפשר להשלים רק את ההשקיה, עומק הקרקע והרוח/קרה — ' +
      'ואז לבדוק את האיזון בין פריחה להימנעות מחרקים/צרעות, בלי שאלון ארוך.'
    );
  }
  if (reviewGate === 'stop_not_enough_information') {
    return 'השלם את פרטי אזור הגינה והמטרה לפני המשך.';
  }
  if (reviewGate === 'ask_progressive_intake') {
    return 'ענה על שאלות ההשלמה הקצרות כדי לדייק את התשובה.';
  }
  if (reviewGate === 'requires_owner_review') {
    return 'המתן לבדיקה פנימית לפני שימוש בתשובה מחוץ למסלול הפיתוח.';
  }
  return 'המשך באיסוף מידע נמוך-סיכון לפני כל החלטת שתילה.';
}

const FEEDBACK_FOCUS_GAP_GROUPS = Object.freeze([
  { area: 'irrigation', gaps: ['exact_irrigation_schedule', 'siteConditions.wateringMethod'] },
  { area: 'soil_depth', gaps: ['soil_depth'] },
  { area: 'wind_frost', gaps: ['wind_exposure', 'exact_winter_frost_frequency'] },
  { area: 'flowering_vs_wasps', gaps: ['flowering_vs_wasps_insects_tradeoff'] }
]);

function isUnknownOutcomeText(value) {
  if (!isNonEmptyString(value)) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'unknown' ||
    normalized === 'לא ידוע' ||
    normalized.indexOf('לא ידוע') >= 0 ||
    normalized.indexOf('unknown') >= 0
  );
}

function extractLatestFeedbackRecord(gardenMemory, contextPacket) {
  const raw = asObject(gardenMemory) || {};
  const ctx = asObject(contextPacket) || {};
  const lists = [];
  if (Array.isArray(raw.feedbackHistory)) lists.push(raw.feedbackHistory);
  if (Array.isArray(raw.outcomeHistory)) lists.push(raw.outcomeHistory);
  if (Array.isArray(ctx.outcomeHistory)) lists.push(ctx.outcomeHistory);

  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    for (let j = list.length - 1; j >= 0; j--) {
      const entry = asObject(list[j]);
      if (!entry) continue;
      const feedback = asObject(entry.feedback) || entry;
      if (
        feedback &&
        (isNonEmptyString(feedback.changeNextRecommendation) ||
          isNonEmptyString(feedback.userSatisfaction) ||
          isNonEmptyString(feedback.didUserAct))
      ) {
        return freezeDeep({ entry: entry, feedback: feedback });
      }
    }
  }
  return null;
}

function classifyFeedbackType(feedback) {
  const fb = asObject(feedback) || {};
  const didAct = String(fb.didUserAct || '').trim().toLowerCase();
  const later = fb.laterOutcome;
  if (didAct === 'no' || didAct === 'false') {
    if (isUnknownOutcomeText(later)) return 'feedback_only_not_outcome';
  }
  if (didAct === 'yes' || didAct === 'true') {
    if (!isUnknownOutcomeText(later)) return 'outcome_observed';
    return 'feedback_only_not_outcome';
  }
  if (isNonEmptyString(fb.changeNextRecommendation) || isNonEmptyString(fb.userSatisfaction)) {
    return 'feedback_only_not_outcome';
  }
  return 'none';
}

function detectFeedbackSignals(feedback) {
  const fb = asObject(feedback) || {};
  const text = [
    fb.changeNextRecommendation,
    fb.userSatisfaction,
    fb.actionTaken,
    fb.maintenanceBurden
  ]
    .filter(isNonEmptyString)
    .join(' ')
    .toLowerCase();

  const brevityRequested =
    text.indexOf('קצר') >= 0 ||
    text.indexOf('שאלון') >= 0 ||
    text.indexOf('concise') >= 0;
  const optionalQuestionsRequested =
    text.indexOf('אופציונ') >= 0 ||
    text.indexOf('optional') >= 0;

  const focusAreas = [];
  if (text.indexOf('השקיה') >= 0 || text.indexOf('water') >= 0) {
    focusAreas.push('irrigation');
  }
  if (text.indexOf('עומק') >= 0 || text.indexOf('קרקע') >= 0 || text.indexOf('נפח') >= 0) {
    focusAreas.push('soil_depth');
  }
  if (text.indexOf('רוח') >= 0 || text.indexOf('קרה') >= 0 || text.indexOf('frost') >= 0) {
    focusAreas.push('wind_frost');
  }
  if (
    (text.indexOf('פריח') >= 0 || text.indexOf('flower') >= 0) &&
    (text.indexOf('צרע') >= 0 || text.indexOf('חרק') >= 0 || text.indexOf('wasp') >= 0)
  ) {
    focusAreas.push('flowering_vs_wasps');
  }

  return {
    brevityRequested: brevityRequested,
    optionalQuestionsRequested: optionalQuestionsRequested,
    focusAreas: uniqueStrings(focusAreas)
  };
}

function buildFeedbackInfluence(gardenMemory, contextPacket) {
  const latest = extractLatestFeedbackRecord(gardenMemory, contextPacket);
  if (!latest) {
    return freezeDeep({
      hasFeedback: false,
      feedbackType: 'none',
      brevityRequested: false,
      optionalQuestionsRequested: false,
      focusAreas: [],
      appliedToNextAnswer: false,
      notes: 'No prior feedback available for answer revision.'
    });
  }

  const feedbackType = classifyFeedbackType(latest.feedback);
  const signals = detectFeedbackSignals(latest.feedback);
  const hasRevisionSignals =
    signals.brevityRequested ||
    signals.optionalQuestionsRequested ||
    signals.focusAreas.length > 0;
  const appliedToNextAnswer =
    feedbackType === 'feedback_only_not_outcome' && hasRevisionSignals;

  let notes = 'Feedback preserved only; not treated as planted-outcome proof.';
  if (appliedToNextAnswer) {
    notes =
      'Owner feedback #1 requests a shorter next answer, optional precision questions, ' +
      'and focus on irrigation, soil depth, wind/frost, and flowering vs wasps/insects.';
  }

  return freezeDeep({
    hasFeedback: true,
    feedbackType: feedbackType,
    brevityRequested: signals.brevityRequested,
    optionalQuestionsRequested: signals.optionalQuestionsRequested,
    focusAreas: signals.focusAreas,
    appliedToNextAnswer: appliedToNextAnswer,
    notes: notes
  });
}

function prioritizePrecisionGaps(precisionGaps, feedbackInfluence) {
  const gaps = uniqueStrings(precisionGaps || []);
  if (!feedbackInfluence || !feedbackInfluence.appliedToNextAnswer) {
    return freezeDeep(gaps);
  }

  const focusAreas =
    feedbackInfluence.focusAreas && feedbackInfluence.focusAreas.length
      ? feedbackInfluence.focusAreas.slice()
      : ['irrigation', 'soil_depth', 'wind_frost', 'flowering_vs_wasps'];

  const working = gaps.slice();
  if (focusAreas.indexOf('flowering_vs_wasps') >= 0) {
    if (working.indexOf('flowering_vs_wasps_insects_tradeoff') === -1) {
      working.push('flowering_vs_wasps_insects_tradeoff');
    }
  }

  const prioritized = [];
  const seen = new Set();
  for (let i = 0; i < focusAreas.length; i++) {
    const area = focusAreas[i];
    for (let g = 0; g < FEEDBACK_FOCUS_GAP_GROUPS.length; g++) {
      const group = FEEDBACK_FOCUS_GAP_GROUPS[g];
      if (group.area !== area) continue;
      for (let k = 0; k < group.gaps.length; k++) {
        const gap = group.gaps[k];
        if (working.indexOf(gap) >= 0 && !seen.has(gap)) {
          prioritized.push(gap);
          seen.add(gap);
        }
      }
    }
  }

  for (let j = 0; j < working.length; j++) {
    const gap = working[j];
    if (!seen.has(gap)) {
      prioritized.push(gap);
      seen.add(gap);
    }
  }

  return freezeDeep(prioritized);
}

function assertPlantFreeSkeleton(skeleton) {
  const serialized = JSON.stringify(skeleton || {});
  if (FORBIDDEN_OUTPUT_PATTERNS.some(function (re) { return re.test(serialized); })) {
    throw new Error('hero_answer_skeleton_forbidden_output');
  }
  if (serialized.indexOf(SR_HERO_FORBIDDEN_WEAKNESS_LABEL) >= 0) {
    throw new Error('hero_answer_skeleton_forbidden_weakness_label');
  }
}

export function createHeroAnswerSkeleton(gardenMemory) {
  const contextUsed = normalizeGardenMemory(gardenMemory);
  const gaps = detectCriticalGaps(contextUsed);
  const reviewGate = decideReviewGate(contextUsed, gaps);
  const confidence = deriveConfidence(contextUsed, gaps, reviewGate);
  const progressiveIntakeQuestions =
    reviewGate === 'ask_progressive_intake'
      ? buildProgressiveIntakeQuestions(contextUsed, gaps)
      : freezeDeep([]);
  const precisionGaps = uniqueStrings(
    (contextUsed.knownUnknowns || []).concat(
      gaps.map(function (g) {
        return g.field;
      })
    )
  );
  const feedbackInfluence = buildFeedbackInfluence(gardenMemory, contextUsed);
  const revisedPrecisionGaps = prioritizePrecisionGaps(
    precisionGaps,
    feedbackInfluence
  );

  const skeleton = {
    transparencyLabel: 'developer_skeleton_not_system_validation',
    contextUsed: contextUsed,
    goalUnderstood: (contextUsed.goal && contextUsed.goal.primaryGoal) || 'unknown',
    outcomeDimensions: buildOutcomeDimensions(contextUsed),
    confidence: confidence,
    tradeOffs: buildTradeOffs(contextUsed),
    precisionGapsLabel: SR_HERO_PRECISION_GAPS_LABEL,
    precisionGaps: revisedPrecisionGaps,
    progressiveIntakeQuestions: progressiveIntakeQuestions,
    recommendedNextAction: buildRecommendedNextAction(reviewGate, feedbackInfluence),
    feedbackOutcomePrompt: buildOutcomeFeedbackPrompt(),
    feedbackInfluence: feedbackInfluence,
    reviewGate: reviewGate,
    developerOnly: true,
    syntheticOnly: contextUsed.syntheticOnly === true,
    doesNotRecommendPlants: true,
    doesNotNamePlantCandidates: true,
    doesNotGrantFinalSuitability: true,
    doesNotClaimSystemValidation: true,
    recommendationAuthority: false,
    plantSuitabilityAuthority: false
  };

  assertPlantFreeSkeleton(skeleton);
  return freezeDeep(skeleton);
}
