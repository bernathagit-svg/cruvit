/**
 * Smart Recommendations Hero Answer view-model (Specific Plant suitability mode).
 * Pure mapper — no DOM, no scoring, no Product Authority.
 * Consumes existing trust / climate / suitability fields only.
 */

export const SR_HERO_ANSWER_VIEW_VERSION = '0.1.0-sr-hero-answer-specific-plant';

const LEVELS = new Set([
  'blocked',
  'borderline',
  'fair',
  'good',
  'excellent',
  'unknown'
]);

function normLevel(v) {
  const s = String(v || '')
    .trim()
    .toLowerCase();
  if (LEVELS.has(s)) return s;
  if (s === 'not_recommended' || s === 'poor') return 'blocked';
  return 'borderline';
}

function copyBundle(he) {
  if (he) {
    return {
      kickerLive: 'החלטת התאמה · צמח נבחר',
      title: 'תשובת CRUVIT להתאמת הצמח',
      selectPlant: 'בחרו צמח מהקטלוג כדי לבדוק התאמה לאקלים שלכם.',
      confirmLocation: 'אשרו את מיקום הגינה לפני בדיקת התאמה.',
      climateUnavailable:
        'מידע האקלים המבני עדיין לא זמין למיקום זה. לא ניתן לקבוע התאמה כרגע.',
      fineLive:
        'מבוסס על התאמת צמח ספציפי מול אקלים מאושר. לא דירוג רשימה, לא זיכרון גינה, לא Product Authority.',
      confidenceKnown: 'מבוסס על פרופיל האקלים הזמין ועל מנוע ההתאמה הקיים.',
      confidenceBorderline: 'ודאות חלקית — המנוע מסמן זהירות או צורך בסקירה.',
      confidenceBlocked: 'המנוע חוסם המלצה למיקום/הקשר הזה.',
      understandsPlant: 'צמח',
      understandsLevel: 'רמת התאמה',
      understandsClimate: 'אקלים',
      understandsReason: 'סיבה עיקרית',
      tradeoffLabel: 'מה חשוב לדעת',
      noExtraWarn: 'אין אזהרות נוספות מהמנוע לתוצאה זו.',
      thanks: 'תודה — המשוב נשאר במסך הזה בלבד ולא נשמר.',
      feedbackLabel: 'האם התשובה הייתה שימושית?',
      yes: 'כן',
      partly: 'חלקית',
      notYet: 'עדיין לא'
    };
  }
  return {
    kickerLive: 'Suitability · selected plant',
    title: 'CRUVIT plant suitability answer',
    selectPlant: 'Select a catalog plant to check climate suitability.',
    confirmLocation: 'Confirm your garden location before suitability can be determined.',
    climateUnavailable:
      'Structural climate is not available for this location yet. No suitability decision can be made.',
    fineLive:
      'Based on Specific Plant suitability against confirmed-location climate. Not a ranked list, Garden Memory, or Product Authority.',
    confidenceKnown: 'Based on the available climate profile and the existing suitability engine.',
    confidenceBorderline: 'Partial confidence — the engine signals caution or review.',
    confidenceBlocked: 'The engine blocks a recommendation for this location/context.',
    understandsPlant: 'Plant',
    understandsLevel: 'Suitability',
    understandsClimate: 'Climate',
    understandsReason: 'Main reason',
    tradeoffLabel: 'What matters',
    noExtraWarn: 'No additional engine warnings for this result.',
    thanks: 'Thanks — this feedback stays on this screen only and is not saved.',
    feedbackLabel: 'Was this answer useful?',
    yes: 'Yes',
    partly: 'Partly',
    notYet: 'Not yet'
  };
}

function levelLabel(level, he) {
  const mapEn = {
    blocked: 'Blocked / not suitable',
    borderline: 'Borderline / cautious',
    fair: 'Fair / limited',
    good: 'Good match',
    excellent: 'Excellent match',
    unknown: 'Unknown'
  };
  const mapHe = {
    blocked: 'חסום / לא מתאים',
    borderline: 'גבולי / זהיר',
    fair: 'חלקי / מוגבל',
    good: 'התאמה טובה',
    excellent: 'התאמה מצוינת',
    unknown: 'לא ידוע'
  };
  return (he ? mapHe : mapEn)[level] || level;
}

/** Surface Specific Plant four-outcome truth honestly (including UNKNOWN). */
function outcomeDisplayLabel(status, he, prefLabel) {
  if (prefLabel != null && String(prefLabel).trim()) return String(prefLabel).trim();
  const s = String(status || 'unknown').trim().toLowerCase();
  const mapEn = {
    reliable: 'Reliable',
    supported: 'Supported',
    constrained: 'Constrained',
    poor: 'Poor',
    unreliable: 'Unreliable',
    unlikely: 'Unlikely',
    unknown: 'UNKNOWN'
  };
  const mapHe = {
    reliable: 'אמין',
    supported: 'נתמך',
    constrained: 'מוגבל',
    poor: 'חלש',
    unreliable: 'לא אמין',
    unlikely: 'לא סביר',
    unknown: 'לא ידוע'
  };
  return (he ? mapHe : mapEn)[s] || mapEn.unknown;
}

function buildOutcomeRows(outcomes, he) {
  const o = outcomes && typeof outcomes === 'object' ? outcomes : null;
  if (!o) return [];
  const survival = o.survival ?? o.SURVIVAL;
  const growth = o.growth ?? o.GROWTH;
  const flowering = o.flowering ?? o.FLOWERING;
  const fruiting = o.fruiting ?? o.FRUITING;
  if (survival == null && growth == null && flowering == null && fruiting == null) return [];
  const labels = he
    ? { survival: 'הישרדות', growth: 'צמיחה', flowering: 'פריחה', fruiting: 'הפרות' }
    : { survival: 'Survival', growth: 'Growth', flowering: 'Flowering', fruiting: 'Fruiting' };
  return [
    {
      key: 'survival',
      label: labels.survival,
      status: String(survival || 'unknown'),
      display: outcomeDisplayLabel(survival, he, o.survivalLabel)
    },
    {
      key: 'growth',
      label: labels.growth,
      status: String(growth || 'unknown'),
      display: outcomeDisplayLabel(growth, he, o.growthLabel)
    },
    {
      key: 'flowering',
      label: labels.flowering,
      status: String(flowering || 'unknown'),
      display: outcomeDisplayLabel(flowering, he, o.floweringLabel)
    },
    {
      key: 'fruiting',
      label: labels.fruiting,
      status: String(fruiting || 'unknown'),
      display: outcomeDisplayLabel(fruiting, he, o.fruitingLabel)
    }
  ];
}

/**
 * @param {{
 *   langHe?: boolean,
 *   trusted?: boolean,
 *   climateKnown?: boolean,
 *   plant?: object|null,
 *   suitability?: object|null,
 *   climateProfile?: object|null,
 *   locationLabel?: string|null
 * }} input
 */
export function buildSrHeroAnswerViewModel(input = {}) {
  const he = !!input.langHe;
  const c = copyBundle(he);
  const trusted = input.trusted === true;
  const climateKnown = input.climateKnown === true;
  const plant = input.plant && typeof input.plant === 'object' ? input.plant : null;
  const suitability =
    input.suitability && typeof input.suitability === 'object' ? input.suitability : null;
  const climateProfile =
    input.climateProfile && typeof input.climateProfile === 'object' ? input.climateProfile : null;
  const locationLabel = String(
    input.locationLabel || climateProfile?.locationLabel || ''
  ).trim();
  const outcomes =
    (input.outcomes && typeof input.outcomes === 'object' && input.outcomes) ||
    (suitability?.specificPlantOutcomes &&
    typeof suitability.specificPlantOutcomes === 'object'
      ? suitability.specificPlantOutcomes
      : null);
  const outcomeRows = buildOutcomeRows(outcomes, he);
  const outcomesLabel = he ? 'תוצאות התאמה' : 'Suitability outcomes';

  const base = {
    version: SR_HERO_ANSWER_VIEW_VERSION,
    mode: 'SPECIFIC_PLANT_SUITABILITY',
    title: c.title,
    kicker: c.kickerLive,
    questions: [],
    questionsLabel: he ? 'שאלות דיוק אופציונליות' : 'Optional precision questions',
    questionsNote: he
      ? 'אופציונלי — לא נדרש לקבלת החלטת ההתאמה הנוכחית.'
      : 'Optional — not required for the current suitability decision.',
    q1: '',
    q2: '',
    q3: '',
    feedbackLabel: c.feedbackLabel,
    yes: c.yes,
    partly: c.partly,
    notYet: c.notYet,
    thanks: c.thanks,
    fine: c.fineLive,
    plantName: plant ? String(plant.name || plant.slug || '').trim() || null : null,
    recommendationLevel: null,
    truthState: null,
    understandsLabel: he ? 'מה CRUVIT הבינה' : 'What CRUVIT understands',
    confidenceLabel: he ? 'ודאות' : 'Confidence',
    outcomesLabel,
    outcomeRows: [],
    outcomesHidden: true
  };

  if (!trusted) {
    return {
      ...base,
      truthState: 'C_UNTRUSTED',
      status: he ? 'נדרש אישור מיקום' : 'Location confirmation required',
      lead: c.confirmLocation,
      understands: [
        he ? 'מיקום הגינה עדיין לא מאושר' : 'Garden location is not confirmed',
        he ? 'אין המלצת התאמה בלי מיקום מאושר' : 'No suitability recommendation without a trusted location'
      ],
      confidence: he ? 'אין סמכות התאמה עד לאישור מיקום' : 'No suitability authority until location is confirmed',
      tradeoffLabel: c.tradeoffLabel,
      tradeoff: c.confirmLocation,
      recommendationLevel: null
    };
  }

  if (!climateKnown) {
    return {
      ...base,
      truthState: 'B_CLIMATE_UNAVAILABLE',
      status: he ? 'אקלים לא זמין עדיין' : 'Climate not available yet',
      lead: c.climateUnavailable,
      understands: [
        locationLabel
          ? `${he ? 'מיקום' : 'Location'}: ${locationLabel}`
          : he
            ? 'מיקום מאושר'
            : 'Trusted location set',
        he ? 'פרופיל אקלים מבני עדיין לא זמין' : 'Structural climate profile not available'
      ],
      confidence: he ? 'אין החלטת התאמה בלי אקלים' : 'No suitability decision without climate',
      tradeoffLabel: c.tradeoffLabel,
      tradeoff: c.climateUnavailable,
      recommendationLevel: null
    };
  }

  if (!plant) {
    return {
      ...base,
      truthState: 'D_NO_PLANT',
      status: he ? 'בחרו צמח' : 'Select a plant',
      lead: c.selectPlant,
      understands: [
        locationLabel
          ? `${he ? 'מיקום' : 'Location'}: ${locationLabel}`
          : he
            ? 'מיקום מאושר'
            : 'Trusted location ready',
        he ? 'אקלים זמין לבדיקת התאמה' : 'Climate available for a suitability check'
      ],
      confidence: c.confidenceKnown,
      tradeoffLabel: c.tradeoffLabel,
      tradeoff: c.selectPlant,
      recommendationLevel: null
    };
  }

  const level = normLevel(suitability?.recommendationLevel);
  const warnings = Array.isArray(suitability?.warnings)
    ? suitability.warnings.map((w) => String(w || '').trim()).filter(Boolean)
    : [];
  const explanation = String(suitability?.explanationText || warnings[0] || '').trim();
  const plantName = String(plant.name || plant.slug || 'Plant').trim();
  const scientific = String(plant.scientific || '').trim();
  const climateBits = [
    climateProfile?.broadClimate || climateProfile?.thermalRegime || null,
    climateProfile?.moistureRegime || null,
    climateProfile?.freezingRisk
      ? `${he ? 'סיכון קרה' : 'freeze risk'}: ${climateProfile.freezingRisk}`
      : null
  ]
    .filter(Boolean)
    .join(' · ');

  const outcomeUnderstandLines = outcomeRows.map((row) => `${row.label}: ${row.display}`);
  const understands = [
    `${c.understandsPlant}: ${plantName}${scientific ? ` (${scientific})` : ''}`,
    `${c.understandsLevel}: ${levelLabel(level, he)}`,
    climateBits
      ? `${c.understandsClimate}: ${climateBits}`
      : `${c.understandsClimate}: ${he ? 'זמין' : 'available'}`,
    explanation ? `${c.understandsReason}: ${explanation}` : null,
    ...outcomeUnderstandLines
  ].filter(Boolean);

  const liveOutcomes = {
    outcomesLabel,
    outcomeRows,
    outcomesHidden: outcomeRows.length === 0
  };

  if (level === 'blocked') {
    return {
      ...base,
      ...liveOutcomes,
      truthState: 'E_BLOCKED',
      plantName,
      recommendationLevel: 'blocked',
      status: levelLabel('blocked', he),
      lead:
        explanation ||
        (he
          ? `${plantName} אינו מתאים כאן לפי מנוע ההתאמה.`
          : `${plantName} is not suitable here according to the suitability engine.`),
      understands,
      confidence: c.confidenceBlocked,
      tradeoffLabel: c.tradeoffLabel,
      tradeoff: warnings[0] || explanation || c.noExtraWarn
    };
  }

  if (level === 'borderline' || level === 'fair' || level === 'unknown') {
    return {
      ...base,
      ...liveOutcomes,
      truthState: 'F_BORDERLINE',
      plantName,
      recommendationLevel: level,
      status: levelLabel(level, he),
      lead:
        explanation ||
        (he
          ? `${plantName}: התאמה זהירה — לא המלצה בטוחה.`
          : `${plantName}: cautious suitability — not a confident recommendation.`),
      understands,
      confidence: c.confidenceBorderline,
      tradeoffLabel: c.tradeoffLabel,
      tradeoff: warnings[0] || explanation || c.noExtraWarn
    };
  }

  return {
    ...base,
    ...liveOutcomes,
    truthState: 'A_SUITABILITY',
    plantName,
    recommendationLevel: level,
    status: levelLabel(level, he),
    lead:
      explanation ||
      (he
        ? `${plantName}: ${levelLabel(level, he)} לפי האקלים הזמין.`
        : `${plantName}: ${levelLabel(level, he)} for the available climate.`),
    understands,
    confidence: c.confidenceKnown,
    tradeoffLabel: c.tradeoffLabel,
    tradeoff: warnings[0] || c.noExtraWarn
  };
}
