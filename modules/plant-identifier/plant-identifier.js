/**
 * Cruvit Plant Identifier module
 * Single source of truth: commits via deps.finalizePlantListChange() → data.plants + data.tasks
 */
(function (global) {
  'use strict';

  const HISTORY_KEY = 'cruvit_identifications';
  const LANG_KEY = 'cruvit_lang';
  const MODULE_ASSET_BASE = 'modules/plant-identifier/assets/';
  const PI_TEXTURE = MODULE_ASSET_BASE + 'garden-texture.jpg';
  const PI_LEAVES = MODULE_ASSET_BASE + 'intro-leaves.png';

  const L = {
    en: {
      modalTitle: 'Identify a plant',
      modalSub: 'Upload one clear photo to begin.',
      uploadTitle: 'Upload plant photo',
      uploadSub: 'A clear leaf, flower or full-plant photo gives the best result.',
      gallery: 'Gallery',
      camera: 'Camera',
      analyzeBtn: 'Analyze Plant',
      loadingT: 'Analyzing plant...',
      l1: 'Checking species...',
      l2: 'Matching climate...',
      l3: 'Preparing recommendations...',
      needPhoto: 'Please upload a plant photo first.',
      aiMissing: 'Identification service is not deployed correctly.',
      aiSetup: 'AI setup is missing. Add ANTHROPIC_API_KEY in Netlify, then redeploy.',
      networkError: 'Network error. Please try again.',
      needImage: 'Please choose an image file.',
      readError: 'Could not read this image. Please try another photo.',
      aiError: 'AI analysis error',
      identity: 'Identification',
      climate: 'Climate compatibility',
      addGarden: 'Add to My Garden',
      saved: 'Saved to My Garden',
      confidence: 'Confidence',
      suitable: 'Suitable',
      notSuitable: 'Needs care',
      unknown: 'Unknown',
      light: 'Light',
      water: 'Water',
      soil: 'Soil',
      season: 'Season',
      pruning: 'Pruning',
      fertilizer: 'Fertilizer',
      climateUnknown: 'Add your location to check climate compatibility.',
      checkClimateQuestion: 'Would you like to check if this plant suits your climate?',
      locationPh: 'e.g. יחיעם, חיפה, Tel Aviv, Haifa…',
      locationFieldLabel: 'City, region or address',
      locSelected: 'Location selected.',
      autoLoc: 'Use my location',
      checkClimateBtn: 'Check climate fit',
      needLoc: 'Please add your location.',
      locNotFound: 'Location not found. Try a city or village in Hebrew or English.',
      locResolving: 'Finding location...',
      detectingLoc: 'Detecting location...',
      climateCheckFailed: 'Could not check climate fit. Please try again.',
      locResolved: 'Location',
      recent: 'Recent identifications',
      noHistory: 'No recent identifications yet.',
      pill: 'AI Plant Identifier',
      homeTitle: 'Identify any plant instantly',
      homeSub: 'AI-powered plant recognition with climate-aware recommendations and smart actions for your garden.',
      identifyCta: 'Identify Plant',
      f1: 'Accurate ID',
      f1s: 'Expert AI analysis',
      f2: 'Climate fit',
      f2s: 'Based on your area',
      f3: 'My Garden',
      f3s: 'Save plants easily',
      takePhoto: 'Take a photo',
      takeSub: 'or upload from gallery',
      flowSub: 'After identification, you can check climate compatibility and save the plant to My Garden.',
      closeHome: 'Close',
      homeBtn: 'Home',
      scanAgain: 'Upload another photo',
      carePending: 'Add your location and tap Check climate fit for local guidance.',
      careUnavailable: 'Care details could not be loaded. Try Check climate fit or scan again.',
      quickCare: 'Quick care icons',
      growth: 'Growth',
      size: 'Size',
      botanicalProfile: 'Botanical profile',
      soilLabel: 'Soil'
    },
    he: {
      modalTitle: 'זיהוי צמח',
      modalSub: 'העלו תמונה ברורה אחת כדי להתחיל.',
      uploadTitle: 'העלאת תמונת צמח',
      uploadSub: 'תמונה ברורה של עלים, פרח או צמח מלא תיתן תוצאה טובה יותר.',
      gallery: 'גלריה',
      camera: 'מצלמה',
      analyzeBtn: 'נתח צמח',
      loadingT: 'מנתח את הצמח...',
      l1: 'בודק את סוג הצמח...',
      l2: 'בודק התאמה לאקלים...',
      l3: 'מכין המלצות...',
      needPhoto: 'צריך להעלות תמונת צמח קודם.',
      aiMissing: 'שירות הזיהוי לא זמין.',
      aiSetup: 'חסר ANTHROPIC_API_KEY ב-Netlify.',
      networkError: 'שגיאת רשת. נסו שוב.',
      needImage: 'בחרו קובץ תמונה.',
      readError: 'לא ניתן לקרוא את התמונה.',
      aiError: 'שגיאת ניתוח AI',
      identity: 'זיהוי',
      climate: 'התאמה לאקלים',
      addGarden: 'הוסף לגינה שלי',
      saved: 'נשמר בגינה שלי',
      confidence: 'רמת ביטחון',
      suitable: 'מתאים',
      notSuitable: 'דורש תשומת לב',
      unknown: 'לא ידוע',
      light: 'אור',
      water: 'השקיה',
      soil: 'אדמה',
      season: 'עונה',
      pruning: 'גיזום',
      fertilizer: 'דישון',
      climateUnknown: 'הוסיפו מיקום כדי לבדוק התאמה לאקלים.',
      checkClimateQuestion: 'רוצה לבדוק אם הצמח מתאים לאקלים שלך?',
      locationPh: 'למשל: יחיעם, חיפה, תל אביב…',
      locationFieldLabel: 'עיר, אזור או כתובת',
      locSelected: 'המיקום נבחר.',
      autoLoc: 'מיקום אוטומטי',
      checkClimateBtn: 'בדיקת התאמה',
      needLoc: 'צריך להוסיף מיקום.',
      locNotFound: 'לא מצאנו את המקום. נסו שם עיר, יישוב או אזור בעברית או באנגלית.',
      locResolving: 'מאתרים מיקום...',
      detectingLoc: 'מזהה מיקום...',
      climateCheckFailed: 'לא הצלחנו לבדוק התאמה לאקלים. נסו שוב.',
      locResolved: 'מיקום',
      recent: 'זיהויים אחרונים',
      noHistory: 'אין זיהויים אחרונים.',
      pill: 'זיהוי צמח ב-AI',
      homeTitle: 'זהו כל צמח מיד',
      homeSub: 'זיהוי צמח באמצעות AI, התאמה לאקלים והמלצות חכמות לגינה שלכם.',
      identifyCta: 'זיהוי צמח',
      f1: 'זיהוי מדויק',
      f1s: 'ניתוח AI מקצועי',
      f2: 'התאמה לאקלים',
      f2s: 'לפי האזור שלכם',
      f3: 'הגינה שלי',
      f3s: 'שמירה בקלות',
      takePhoto: 'צלמו צמח',
      takeSub: 'או העלו מהגלריה',
      flowSub: 'אחרי הזיהוי אפשר לבדוק התאמה לאקלים ולשמור לגינה שלי.',
      closeHome: 'סגור',
      homeBtn: 'בית',
      scanAgain: 'העלאת תמונה נוספת',
      carePending: 'הוסיפו מיקום ולחצו "בדיקת התאמה" לקבלת הנחיות מקומיות.',
      careUnavailable: 'לא הצלחנו לטעון הנחיות טיפול. נסו "בדיקת התאמה" או סריקה מחדש.',
      quickCare: 'אייקוני טיפול מהיר',
      growth: 'צמיחה',
      size: 'גודל',
      botanicalProfile: 'פרופיל בוטני',
      soilLabel: 'אדמה'
    }
  };

  let deps = null;
  let rootEl = null;
  let mounted = false;

  const state = {
    lang: 'en',
    selectedFile: null,
    b64: '',
    mime: 'image/jpeg',
    dataUrl: '',
    photo: null,
    lastResult: null,
    scanSeq: 0,
    abortController: null,
    identifying: false,
    climateSearchTimer: null,
    climateSearchSeq: 0,
    climateSuggestions: [],
    pendingClimateLocation: null
  };

  const HEBREW_PLACE_ALIASES = {
    'יחיעם': 'Yehiam, Israel',
    'יהיעם': 'Yehiam, Israel',
    'כפר ורדים': 'Kfar Vradim, Israel',
    'מעלות': 'Maalot, Israel',
    'נהריה': 'Nahariya, Israel',
    'עכו': 'Acre, Israel',
    'חיפה': 'Haifa, Israel',
    'תל אביב': 'Tel Aviv, Israel',
    'ירושלים': 'Jerusalem, Israel',
    'באר שבע': 'Beersheba, Israel',
    'אילת': 'Eilat, Israel'
  };

  function normalizeLocationQuery(value) {
    return String(value || '').trim().normalize('NFKC').replace(/[\u200E\u200F]/g, '');
  }

  function isBroadCountryLocation(loc) {
    if (!loc) return false;
    const name = String(loc.name || '').trim().toLowerCase();
    const label = String(loc.label || '').trim().toLowerCase();
    return name === 'israel' || name === 'ישראל' || label === 'israel, israel';
  }

  function climateFitLevel(text) {
    const s = String(text || '').toLowerCase();
    if (!s || isGenericCareText(text)) return 'unknown';
    if (/not suitable|unsuitable|poor fit|avoid outdoor|too cold|too hot|cannot grow|לא מתאים|לא מומלץ|קשה לגדל/.test(s)) return 'low';
    if (/excellent|ideal|well suited|great match|highly suitable|very suitable|מתאים מאוד|התאמה מצוינת|מתאים היטב/.test(s)) return 'high';
    return 'medium';
  }

  const GENERIC_CARE_MARKERS = [
    'Location-specific suitability requires',
    'Match light exposure to the confirmed species',
    'Water according to season, soil drainage',
    'Use soil appropriate to the confirmed species',
    'Cruvit should generate seasonal care',
    'Light needs vary by species',
    'Watering varies by species',
    'See detailed guide',
    'Loading care profile',
    'Confirm the exact species',
    'Growth habit varies',
    'Varies by variety'
  ];

  function sanitizeCareObject(care) {
    const out = {};
    ['light', 'water', 'soil', 'season', 'pruning', 'fertilizer'].forEach((key) => {
      const value = String(care?.[key] || '').trim();
      out[key] = isGenericCareText(value) ? '' : value;
    });
    return out;
  }

  function mergeCarePreferExisting(existing, incoming) {
    const base = existing || {};
    const next = incoming || {};
    const out = {};
    ['light', 'water', 'soil', 'season', 'pruning', 'fertilizer'].forEach((key) => {
      const current = String(base[key] || '').trim();
      const candidate = String(next[key] || '').trim();
      out[key] =
        (!isGenericCareText(current) && current) ||
        (!isGenericCareText(candidate) && candidate) ||
        '';
    });
    return out;
  }

  async function fetchLocalizedCareViaIdentify(result, place) {
    const location = String(place?.label || '').trim();
    const climate = String(place?.climate || '').trim();
    if (!location) return null;
    const commonName = String(result.common_name || '').trim();
    const scientificName = String(result.scientific_name || '').trim();
    if (!commonName && !scientificName) return null;

    try {
      const res = await fetch(identifyUrl('/.netlify/functions/plant-identify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'localCare',
          commonName,
          scientificName,
          location,
          climate,
          language: state.lang
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) return null;
      return out;
    } catch (err) {
      console.warn('Local care via plant-identify failed', err);
      return null;
    }
  }

  function applyLocalizedCareResult(result, localized, place) {
    if (!localized) return result;
    if (localized.care) {
      result.care = mergeCarePreferExisting(result.care, localized.care);
      syncDisplayMetaFromCare(result);
      const care = localized.care;
      if (result._displayMeta) {
        if (care.light && !isGenericCareText(care.light)) result._displayMeta.sun = care.light;
        if (care.water && !isGenericCareText(care.water)) result._displayMeta.water = care.water;
        if (care.season && !isGenericCareText(care.season)) result._displayMeta.season = care.season;
      }
    }
    const summary = String(localized.climate_summary || '').trim();
    if (summary && !isGenericCareText(summary) && !isEncyclopediaClimateText(summary)) {
      result.climate_summary = summary;
    }
    const fit = String(localized.climate_fit || '').toLowerCase();
    if (['high', 'medium', 'low'].includes(fit)) {
      result.climate_fit = fit;
    }
    if (place?.label) result._resolvedLocation = place.label;
    if (place?.climate) result.climate_zone = place.climate;
    if (result._displayMeta) {
      if (summary && !isGenericCareText(summary)) result._displayMeta.climate = summary;
      else if (place?.climate) result._displayMeta.climate = place.climate;
    }
    return result;
  }

  function isVagueCareText(value) {
    if (typeof deps?.isVagueCareText === 'function') return deps.isVagueCareText(value);
    const s = String(value || '').trim();
    if (!s) return true;
    return /verify|depends|varies by|check local|according to season|see detailed|unknown|needs verification|match light exposure|water according to season|location-specific suitability|cruvit should generate|loading care profile|confirm the exact species|growth depends on climate|check mature height/i.test(s);
  }

  function hasDisplayableCare(result) {
    const meta = displayMetaForResult(result);
    return ['sun', 'water', 'growth', 'size', 'climate', 'season'].some((key) => {
      const value = String(meta[key] || '').trim();
      return value && !isGenericCareText(value) && !isVagueCareText(value);
    });
  }

  function getGardenContext() {
    const data = getData() || {};
    return {
      location: data.gardenLocation?.label || data.location || 'Western Galilee, Israel',
      climate: data.gardenLocation?.climate || data.climate || 'Mediterranean'
    };
  }

  function applyIdentifyCareToDisplay(result) {
    if (!result) return result;
    const care = result.care || {};
    const va = result._visualAnalysis || result._raw?.visualAnalysis || null;
    const habit = String(va?.habit || '').trim();
    const habitLabel = habit && habit !== 'unclear'
      ? (state.lang === 'he'
        ? ({ shrub: 'שיח', tree: 'עץ', vine: 'מטפס', herb: 'עשב/צמח תבלין' }[habit] || habit)
        : ({ shrub: 'Shrub', tree: 'Tree', vine: 'Climber/vine', herb: 'Herbaceous plant' }[habit] || habit))
      : '';
    result._displayMeta = Object.assign({}, result._displayMeta || {}, {
      sun: care.light || result._displayMeta?.sun || '',
      water: care.water || result._displayMeta?.water || '',
      growth: result._displayMeta?.growth || habitLabel || '',
      size: result._displayMeta?.size || '',
      climate: result.climate_summary || result._displayMeta?.climate || '',
      season: care.season || result._displayMeta?.season || '',
      soil: care.soil || result._displayMeta?.soil || '',
      scientific: result.scientific_name || result._displayMeta?.scientific || '',
      guide: result._displayMeta?.guide || ''
    });
    return result;
  }

  async function fetchSpeciesCareViaIdentify(result) {
    const commonName = String(result.common_name || '').trim();
    const scientificName = String(result.scientific_name || '').trim();
    if (!commonName && !scientificName) return null;
    try {
      const res = await fetch(identifyUrl('/.netlify/functions/plant-identify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'speciesCare',
          commonName,
          scientificName,
          language: state.lang
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) return null;
      return out;
    } catch (err) {
      console.warn('Species care via plant-identify failed', err);
      return null;
    }
  }

  function isProfileCareUsable(profile) {
    if (!profile || profile.isPlant === false) return false;
    if (typeof deps?.hasUsefulCareText === 'function') return deps.hasUsefulCareText(profile);
    const sun = String(profile.sun || profile.light || '').trim();
    const water = String(profile.water || profile.watering || '').trim();
    return !!(sun && water && !isGenericCareText(sun) && !isGenericCareText(water) && !isVagueCareText(sun) && !isVagueCareText(water));
  }

  function applyPlantProfileToResult(result, profile) {
    if (!profile) return result;
    result._plantProfile = profile;
    result.care = sanitizeCareObject({
      light: profile.sun || profile.light || '',
      water: profile.water || profile.watering || '',
      soil: profile.soil || '',
      season: profile.season || profile.seasonCare || '',
      pruning: profile.pruning || '',
      fertilizer: profile.fertilizer || ''
    });
    result._displayMeta = {
      sun: profile.sun || profile.light || '',
      water: profile.water || profile.watering || '',
      growth: profile.growth || '',
      size: profile.size || '',
      climate: profile.climate || profile.climateFit || profile.climate_fit || '',
      season: profile.season || profile.seasonCare || '',
      soil: profile.soil || '',
      scientific: profile.scientific || profile.scientificName || result.scientific_name || '',
      guide: profile.guide || ''
    };
    if (profile.name && !result.common_name) result.common_name = profile.name;
    if (profile.scientific && !result.scientific_name) result.scientific_name = profile.scientific;
    if (Array.isArray(profile.warnings) && profile.warnings.length) result.warnings = profile.warnings;
    if (Array.isArray(profile.products) && profile.products.length) result.products = profile.products;
    return result;
  }

  function syncDisplayMetaFromCare(result) {
    const care = result.care || {};
    const meta = result._displayMeta || {};
    if (care.light && !isGenericCareText(care.light)) meta.sun = care.light;
    if (care.water && !isGenericCareText(care.water)) meta.water = care.water;
    if (care.soil && !isGenericCareText(care.soil)) meta.soil = care.soil;
    if (care.season && !isGenericCareText(care.season)) meta.season = care.season;
    result._displayMeta = meta;
  }

  function displayMetaForResult(result) {
    const meta = result._displayMeta || {};
    const care = result.care || {};
    const checked = hasVerifiedClimateFit(result);
    const climateSummary = String(result.climate_summary || '').trim();
    let climate = meta.climate || '';
    if (checked && climateSummary && !isGenericCareText(climateSummary)) {
      climate = climateSummary;
    } else if (checked && result.climate_zone) {
      climate = climateSummary || result.climate_zone;
    }
    return {
      sun: meta.sun || care.light || '',
      water: meta.water || care.water || '',
      growth: meta.growth || '',
      size: meta.size || '',
      climate,
      season: meta.season || care.season || '',
      soil: meta.soil || care.soil || '',
      scientific: meta.scientific || result.scientific_name || ''
    };
  }

  function metaValueHtml(value, result) {
    const text = String(value || '').trim();
    if (text && !isGenericCareText(text) && !isVagueCareText(text)) return esc(text);
    if (!result?._careEnriched) {
      return '<span class="pi-muted">' + esc(state.lang === 'he' ? 'טוען...' : 'Loading...') + '</span>';
    }
    return '<span class="pi-muted">' + esc(t('careUnavailable')) + '</span>';
  }

  function careInfoGridHtml(result) {
    const meta = displayMetaForResult(result);
    const guide = String(result._displayMeta?.guide || '').trim();
    const tiles = [
      ['☀️', t('light'), meta.sun],
      ['💧', t('water'), meta.water],
      ['🌱', t('growth'), meta.growth],
      ['📏', t('size'), meta.size],
      ['🌡️', t('climate'), meta.climate],
      ['🗓️', t('season'), meta.season]
    ];
    const grid = tiles.map(([icon, label, value]) =>
      '<div class="info-tile"><span class="big">' + icon + '</span><span><b>' + esc(label) + '</b><span>' +
      metaValueHtml(value, result) + '</span></span></div>'
    ).join('');
    const soilBit = meta.soil && !isGenericCareText(meta.soil) && !isVagueCareText(meta.soil)
      ? ' · ' + esc(t('soilLabel')) + ': ' + esc(meta.soil)
      : '';
    const guideHtml = guide && !isVagueCareText(guide)
      ? '<div class="guide-block pi-guide-excerpt"><b>' + esc(state.lang === 'he' ? 'מדריך' : 'Guide') + '</b><span>' + esc(guide) + '</span></div>'
      : '';
    return (
      '<div class="info-grid">' + grid + '</div>' +
      '<div class="guide-block"><b>' + esc(t('botanicalProfile')) + '</b><span>' +
      esc(meta.scientific || result.common_name || '') + soilBit + '</span></div>' +
      guideHtml
    );
  }

  function isGenericCareText(value) {
    const s = String(value || '').trim();
    if (!s) return true;
    return GENERIC_CARE_MARKERS.some((marker) => s.includes(marker));
  }

  function careLooksGeneric(care) {
    if (!care) return true;
    return ['light', 'water', 'soil', 'season'].every((key) => isGenericCareText(care[key]));
  }

  function careFromKnowledgeProfile(profile) {
    return sanitizeCareObject({
      light: profile.sun || profile.light || '',
      water: profile.water || profile.watering || '',
      soil: profile.soil || profile.growth || '',
      season: profile.seasonCare || profile.season || '',
      pruning: profile.pruning || '',
      fertilizer: profile.fertilizer || ''
    });
  }

  async function callClaudeOptional(messages, maxTokens) {
    try {
      return await callClaude(messages, maxTokens);
    } catch (err) {
      console.warn('Claude optional call skipped', err?.message || err);
      return null;
    }
  }

  async function fetchLocalizedCareViaClaude(result, place) {
    const common = String(result.common_name || '').trim();
    const scientific = String(result.scientific_name || '').trim();
    const location = place?.label || '';
    const climate = place?.climate || '';
    if (!common && !scientific) return null;

    const prompt =
      'You are an expert gardener. Return ONLY valid JSON in this exact shape:\n' +
      '{"climate_fit":"high|medium|low","climate_summary":"","care":{"light":"","water":"","soil":"","season":"","pruning":"","fertilizer":""}}\n' +
      'Plant: ' + common + (scientific ? ' (' + scientific + ')' : '') + '\n' +
      'Location: ' + location + '\n' +
      'Climate zone: ' + climate + '\n' +
      forceLangHint() + '\n' +
      '- climate_summary: 2-4 sentences on suitability for this exact location and climate.\n' +
      '- climate_fit: high if well suited outdoors there, medium if manageable with care, low if poorly suited.\n' +
      '- Each care field: one practical sentence specific to this plant species.\n' +
      '- Never use generic placeholder text.';

    const raw = await callClaudeOptional([{ role: 'user', content: prompt }], 1800);
    if (!raw) return null;
    try {
      return parseJson(raw);
    } catch (_) {
      return null;
    }
  }

  function isEncyclopediaClimateText(value) {
    const s = String(value || '').trim();
    if (!s) return true;
    return /commonly known as|species of flowering|is a species of|perennial herb that grows|family,\s*[A-Z]|wikipedia/i.test(s);
  }

  function climateResultReady(result) {
    const fit = String(result?.climate_fit || '').toLowerCase();
    const hasFit = ['high', 'medium', 'low'].includes(fit);
    const hasSummary = !isGenericCareText(result?.climate_summary) &&
      !isEncyclopediaClimateText(result?.climate_summary);
    if (hasFit && hasSummary) return true;
    return !!(result?._climateChecked && hasFit && !careLooksGeneric(result?.care));
  }

  function hasVerifiedClimateFit(result) {
    return !!(result?._climateChecked && climateResultReady(result));
  }

  function careFromApiPayload(rawCare) {
    const raw = rawCare || {};
    return sanitizeCareObject({
      light: raw.light || raw.sun || '',
      water: raw.water || '',
      soil: raw.soil || '',
      season: raw.season || '',
      pruning: raw.pruning || '',
      fertilizer: raw.fertilizer || ''
    });
  }

  async function fetchBasicCareViaPhoto(result) {
    const photo = rebuildPhotoFromResult(result);
    if (!photo?.imageBase64) return null;
    try {
      const res = await fetch(identifyUrl('/.netlify/functions/plant-identify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: photo.dataUrl,
          imageBase64: photo.imageBase64,
          mediaType: photo.mediaType,
          mimeType: photo.mediaType,
          location: '',
          climate: '',
          hint: [result.scientific_name, result.common_name].filter(Boolean).join(' / '),
          scanContext:
            'Focus on species-specific care for the plant in this photo. ' +
            'Fill every care field with one practical sentence (light, water, soil, season, pruning, fertilizer). ' +
            'Use the identified species. Never use generic placeholder text.',
          scanId: photo.scanId
        })
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) return null;
      const id = out.identification || {};
      return careFromApiPayload(id.care || out.care);
    } catch (err) {
      console.warn('Basic care photo fetch failed', err);
      return null;
    }
  }

  async function fetchBasicCareViaKnowledge(result) {
    const query = String(result.scientific_name || result.common_name || '').trim();
    if (!query) return null;
    try {
      const res = await fetch(identifyUrl('/.netlify/functions/plant-knowledge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plantName: query,
          query,
          originalQuery: query,
          location: '',
          climate: '',
          language: state.lang,
          source: 'Plant Identifier basic care'
        })
      });
      if (!res.ok) return null;
      const profile = await res.json();
      if (!profile || profile.isPlant === false) return null;
      return careFromKnowledgeProfile(profile);
    } catch (err) {
      console.warn('Basic care knowledge fetch failed', err);
      return null;
    }
  }

  async function enrichBasicCareAfterIdentify(result) {
    if (!result) return result;
    result.care = sanitizeCareObject(result.care || {});
    applyIdentifyCareToDisplay(result);
    if (hasDisplayableCare(result)) {
      result._careEnriched = true;
      return result;
    }

    if (typeof deps?.findPlantByName === 'function') {
      const lib = deps.findPlantByName(result.common_name || result.scientific_name || '');
      if (lib) {
        const enriched = typeof deps.enrichProfileWithQuality === 'function'
          ? deps.enrichProfileWithQuality(Object.assign({}, lib), result.common_name || lib.name)
          : lib;
        applyPlantProfileToResult(result, enriched);
        if (hasDisplayableCare(result)) {
          result._careEnriched = true;
          return result;
        }
      }
    }

    if (typeof deps?.fetchPlantProfile === 'function') {
      const queries = [result.scientific_name, result.common_name].filter(Boolean);
      for (const query of queries) {
        try {
          let profile = await deps.fetchPlantProfile(query, 'Scan & Identify');
          if (profile && profile.isPlant !== false) {
            if (typeof deps.enrichProfileWithQuality === 'function') {
              profile = deps.enrichProfileWithQuality(Object.assign({}, profile), query);
            }
            applyPlantProfileToResult(result, profile);
            if (hasDisplayableCare(result)) {
              result._careEnriched = true;
              return result;
            }
          }
        } catch (err) {
          console.warn('fetchPlantProfile failed for', query, err);
        }
      }
    }

    const speciesCare = await fetchSpeciesCareViaIdentify(result);
    if (speciesCare) {
      applyPlantProfileToResult(result, {
        sun: speciesCare.sun || speciesCare.care?.light || '',
        water: speciesCare.water || speciesCare.care?.water || '',
        soil: speciesCare.soil || speciesCare.care?.soil || '',
        growth: speciesCare.growth || '',
        size: speciesCare.size || '',
        climate: speciesCare.climate || '',
        season: speciesCare.season || speciesCare.care?.season || '',
        pruning: speciesCare.pruning || speciesCare.care?.pruning || '',
        fertilizer: speciesCare.fertilizer || speciesCare.care?.fertilizer || '',
        guide: speciesCare.guide || '',
        scientific: result.scientific_name || '',
        name: result.common_name || ''
      });
      if (hasDisplayableCare(result)) {
        result._careEnriched = true;
        return result;
      }
    }

    if (typeof deps?.resolveScanProfileFromIdentify === 'function') {
      try {
        const scanProfile = await deps.resolveScanProfileFromIdentify(result);
        if (scanProfile) {
          applyPlantProfileToResult(result, scanProfile);
        }
      } catch (err) {
        console.warn('Scan profile resolve failed', err);
      }
    }

    result._careEnriched = true;
    return result;
  }

  function rebuildPhotoFromResult(result) {
    if (state.photo?.imageBase64) {
      return {
        dataUrl: state.photo.dataUrl || '',
        imageBase64: String(state.photo.imageBase64).replace(/\s+/g, ''),
        mediaType: normalizeMime(state.photo.mediaType || state.mime || 'image/jpeg'),
        scanId: state.photo.scanId || ('pi-care-' + Date.now().toString(36))
      };
    }
    if (state.b64 && state.dataUrl) {
      return {
        dataUrl: state.dataUrl,
        imageBase64: String(state.b64).replace(/\s+/g, ''),
        mediaType: normalizeMime(state.mime || 'image/jpeg'),
        scanId: 'pi-care-' + Date.now().toString(36)
      };
    }
    const dataUrl = String(result._img || '').trim();
    if (!dataUrl.startsWith('data:image/')) return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) return null;
    const mediaType = normalizeMime(match[1]);
    return {
      dataUrl,
      imageBase64: match[2].replace(/\s+/g, ''),
      mediaType,
      scanId: 'pi-care-' + Date.now().toString(36)
    };
  }

  function buildPhotoIdentifyPayload(photo, result, place) {
    return {
      imageDataUrl: photo.dataUrl,
      imageBase64: photo.imageBase64,
      mediaType: photo.mediaType,
      mimeType: photo.mediaType,
      location: place?.label || '',
      climate: place?.climate || '',
      hint: result.scientific_name || result.common_name || '',
      scanContext:
        'The plant is ' + (result.common_name || '') + ' (' + (result.scientific_name || '') + '). ' +
        'Give species-specific care and climate suitability for ' + (place?.label || 'this garden') +
        (place?.climate ? ' (' + place.climate + ')' : '') + '.',
      scanId: photo.scanId || ('pi-care-' + Date.now().toString(36))
    };
  }

  function inferClimateFitFromCare(care, zone) {
    const blob = [care?.light, care?.water, care?.soil].filter(Boolean).join(' ').toLowerCase();
    if (!blob) return 'medium';
    if (/not suitable|poor match|avoid planting outdoors|cannot grow|too hot|too cold|לא מתאים/.test(blob)) return 'low';
    if (/excellent|ideal|well suited|thrives|native|perfect for|מתאים מאוד/.test(blob)) return 'high';
    if (/mediterranean/i.test(zone || '') && /shade|partial shade|moist|humidity|protect from hot| afternoon sun|not tolerate dry/.test(blob)) {
      return 'medium';
    }
    return 'medium';
  }

  function buildClimateSummaryFromCare(result, place) {
    const care = result.care || {};
    const parts = [care.light, care.water, care.soil].filter((v) => v && !isGenericCareText(v));
    const loc = place?.label || '';
    const zone = place?.climate || '';
    const name = result.common_name || (state.lang === 'he' ? 'הצמח' : 'this plant');
    if (!parts.length) return '';
    if (state.lang === 'he') {
      return `הנחיות מקומיות ל${name} ב${loc}${zone ? ' (' + zone + ')' : ''}: ${parts.join(' ')}`;
    }
    return `Local care guidance for ${name} in ${loc}${zone ? ' (' + zone + ')' : ''}: ${parts.join(' ')}`;
  }

  function finalizeLocalizedClimate(result, place, localized) {
    applyLocalizedCareResult(result, localized, place);
    if (climateResultReady(result)) return result;

    const care = result.care || {};
    if (careLooksGeneric(care)) return result;

    const fit = String(result.climate_fit || '').toLowerCase();
    if (!['high', 'medium', 'low'].includes(fit)) {
      result.climate_fit = inferClimateFitFromCare(care, place?.climate || result.climate_zone);
    }
    if (!result.climate_summary || isGenericCareText(result.climate_summary) || isEncyclopediaClimateText(result.climate_summary)) {
      result.climate_summary = buildClimateSummaryFromCare(result, place);
    }
    if (place?.label) result._resolvedLocation = place.label;
    if (place?.climate) result.climate_zone = place.climate;
    return result;
  }

  async function fetchLocalizedCareViaPhoto(result, place) {
    const photo = rebuildPhotoFromResult(result);
    if (!photo || !photo.imageBase64) return null;
    try {
      const res = await fetch(identifyUrl('/.netlify/functions/plant-identify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPhotoIdentifyPayload(photo, result, place))
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || out.error) {
        console.warn('Photo care refresh failed', out.error || res.status);
        return null;
      }
      const id = out.identification || {};
      const rawCare = id.care || out.care || {};
      return {
        climate_fit: String(id.climate_fit || id.climateFit || out.climate_fit || '').toLowerCase(),
        climate_summary: id.climate_summary || id.climateSummary || out.climate_summary || '',
        care: rawCare
      };
    } catch (err) {
      console.warn('Photo care refresh failed', err);
      return null;
    }
  }

  async function resolveLocalizedCare(result, place) {
    const localized = await fetchLocalizedCareViaIdentify(result, place);
    if (localized && (String(localized.climate_summary || '').trim() || !careLooksGeneric(localized.care || {}))) {
      return localized;
    }
    return fetchLocalizedCareViaPhoto(result, place);
  }

  function resetClimateCheckState(result) {
    if (!result) return result;
    result._climateChecked = false;
    result._hasClimate = false;
    result.climate_fit = 'unknown';
    result.climate_summary = '';
    result.climate_zone = '';
    result._resolvedLocation = '';
    return result;
  }

  function t(key) {
    return (L[state.lang] && L[state.lang][key]) || L.en[key] || key;
  }

  function esc(value) {
    if (deps?.escapeHtml) return deps.escapeHtml(value);
    return String(value || '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function $(id) {
    return rootEl ? rootEl.querySelector('[data-pi-id="' + id + '"]') : null;
  }

  function identifyUrl(path) {
    if (deps?.netlifyFunctionUrl) return deps.netlifyFunctionUrl(path);
    return path;
  }

  function getData() {
    if (typeof deps?.getData === 'function') return deps.getData();
    if (deps?.data) return deps.data;
    throw new Error('PlantIdentifier: getData() is required in init(deps).');
  }

  function forceLangHint() {
    return state.lang === 'he'
      ? 'Answer all user-facing fields in Hebrew.'
      : 'Answer all user-facing fields in English.';
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      const match = String(text || '').match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error(t('aiError'));
    }
  }

  function normalizeMime(type) {
    const raw = String(type || '').toLowerCase();
    if (!raw || raw === 'image/jpg') return 'image/jpeg';
    return raw;
  }

  function buildPhotoPayload() {
    if (state.photo) return state.photo;
    if (!state.b64) return null;
    const mediaType = normalizeMime(state.mime);
    const base64 = String(state.b64).replace(/\s+/g, '');
    const dataUrl = state.dataUrl || ('data:' + mediaType + ';base64,' + base64);
    return {
      dataUrl,
      imageBase64: base64,
      mediaType,
      type: mediaType,
      scanId: Date.now().toString(36) + '-' + base64.length
    };
  }

  function buildPlantIdentifyBody(photo) {
    const ctx = getGardenContext();
    const mediaType = normalizeMime(photo.mediaType || photo.type || 'image/jpeg');
    const base64 = String(photo.imageBase64 || '').replace(/\s+/g, '');
    const dataUrl = photo.dataUrl || ('data:' + mediaType + ';base64,' + base64);
    return {
      imageDataUrl: dataUrl,
      imageBase64: base64,
      mediaType,
      mimeType: mediaType,
      location: ctx.location,
      climate: ctx.climate,
      scanContext: 'Identify from the photo. Fill ALL care fields with species-specific one-sentence guidance for this plant.',
      hint: '',
      userQuery: '',
      scanId: photo.scanId || '',
      imageFingerprint: String(base64.length) + '-' + base64.slice(-48)
    };
  }

  function mapApiToResult(out, photo) {
    const id = out?.identification || {};
    const top = (out?.candidates || [])[0] || {};
    const rawCare = id.care || top.care || out.care || {};
    const care = {
      light: rawCare.light || rawCare.sun || '',
      water: rawCare.water || '',
      soil: rawCare.soil || '',
      season: rawCare.season || '',
      pruning: rawCare.pruning || '',
      fertilizer: rawCare.fertilizer || ''
    };
    return {
      common_name: id.commonName || id.common_name || top.commonName || top.name || out.commonName || out.common_name || '',
      scientific_name: id.scientificName || id.scientific_name || top.scientificName || out.scientificName || out.scientific_name || '',
      confidence: String(id.confidence || top.confidence || out.confidence || 'medium').toLowerCase(),
      alternatives: (out.candidates || []).slice(1, 4).map((c) => c.commonName || c.name).filter(Boolean),
      climate_zone: id.climateZone || id.climate_zone || '',
      climate_fit: id.climateFit || id.climate_fit || out.climate_fit || 'unknown',
      climate_summary: id.climateSummary || id.climate_summary || out.climate_summary || '',
      care,
      warnings: id.warnings || top.warnings || [],
      products: id.products || top.products || [],
      similar_plants: id.similarPlants || id.similar_plants || [],
      _img: photo.dataUrl,
      _hasClimate: false,
      _climateChecked: false,
      _raw: out,
      _visualAnalysis: out.visualAnalysis || id.visual_analysis || id.visualAnalysis || null
    };
  }

  function careLooksEmpty(care) {
    if (!care) return true;
    return !['light', 'water', 'soil', 'season', 'pruning', 'fertilizer'].some((k) => String(care[k] || '').trim());
  }

  async function enrichResultFromKnowledge(result) {
    if (!result) return result;
    result.care = sanitizeCareObject(result.care || {});
    return result;
  }

  function mapClaudeJsonToResult(parsed, photo) {
    parsed._img = photo.dataUrl;
    parsed._hasClimate = parsed.climate_fit && parsed.climate_fit !== 'unknown';
    return parsed;
  }

  function mapResultToPlant(result) {
    if (typeof deps?.mapResultToPlant === 'function') {
      return deps.mapResultToPlant(result);
    }
    const care = result.care || {};
    const name = String(result.common_name || result.commonName || 'Plant').trim() || 'Plant';
    const scientific = String(result.scientific_name || result.scientificName || '').trim();
    const img = String(result._img || '');
    const useImg = img && !img.startsWith('data:') ? img : '';
    return {
      name,
      scientific,
      status: 'Healthy',
      mark: '✓',
      source: 'Scan & Identify',
      icon: '🌿',
      photoUrl: useImg,
      imageUrl: useImg,
      meta: {
        name,
        scientific,
        sun: care.light || '',
        water: care.water || '',
        soil: care.soil || '',
        season: care.season || '',
        guide: result.climate_summary || '',
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        products: (result.products || []).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean)
      }
    };
  }

  async function callClaude(messages, maxTokens) {
    let res;
    try {
      res = await fetch(identifyUrl('/.netlify/functions/claude'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_tokens: maxTokens || 2300, messages })
      });
    } catch (_) {
      throw new Error(t('networkError'));
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(text.includes('<!DOCTYPE') ? t('aiMissing') : 'AI returned an unreadable response.');
    }
    if (data?.error?.code === 'CONFIG_MISSING') throw new Error(t('aiSetup'));
    if (!res.ok || data.error) {
      throw new Error((data.error && data.error.message) || t('aiError'));
    }
    return data.content?.[0]?.text || '';
  }

  async function callGardenWeather(payload) {
    if (typeof deps?.callGardenWeather === 'function') {
      return deps.callGardenWeather(payload);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const res = await fetch(identifyUrl('/.netlify/functions/garden-weather'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t('locNotFound'));
      return json;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(t('networkError'));
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveClimateLocation(rawLabel) {
    const label = normalizeLocationQuery(rawLabel);
    if (!label) throw new Error(t('needLoc'));

    const pending = state.pendingClimateLocation;
    if (pending && Number.isFinite(Number(pending.lat))) {
      const pendingLabel = String(pending.label || '').trim();
      const firstPart = pendingLabel.split(',')[0].trim();
      if (pendingLabel === label || firstPart === label) return pending;
    }

    if (typeof deps?.resolveLocation === 'function') {
      return deps.resolveLocation(label);
    }

    const coordMatch = label.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = Number(coordMatch[1]);
      const lon = Number(coordMatch[2]);
      const result = await callGardenWeather({ mode: 'geocode', lat, lon });
      if (result.location && !isBroadCountryLocation(result.location)) return result.location;
    }

    const attempts = [];
    if (HEBREW_PLACE_ALIASES[label]) attempts.push(HEBREW_PLACE_ALIASES[label]);
    attempts.push(label);
    if (/[\u0590-\u05FF]/.test(label) && !/ישראל/.test(label)) attempts.push(label + ', ישראל');
    else if (!/\bisrael\b/i.test(label)) attempts.push(label + ', Israel');

    let lastErr = null;
    for (const query of [...new Set(attempts)]) {
      try {
        const result = await callGardenWeather({ mode: 'geocode', query });
        if (result.location && !isBroadCountryLocation(result.location)) {
          return result.location;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    try {
      const search = await callGardenWeather({ mode: 'search', query: label });
      const pick = (search.suggestions || [])
        .filter((s) => !isBroadCountryLocation(s))
        .sort((a, b) => {
          const score = (loc) => ((loc.country || '').includes('Israel') ? 2 : 0) +
            (String(loc.label || loc.name || '').includes(label) ? 1 : 0);
          return score(b) - score(a);
        })[0];
      if (pick) return pick;
    } catch (err) {
      lastErr = lastErr || err;
    }

    throw lastErr || new Error(t('locNotFound'));
  }

  function hideClimateSuggestions() {
    const box = $('climateSuggestions');
    if (!box) return;
    box.innerHTML = '';
    box.classList.add('hidden');
    state.climateSuggestions = [];
  }

  function renderClimateSuggestions(items) {
    const box = $('climateSuggestions');
    if (!box) return;
    state.climateSuggestions = items || [];
    if (!state.climateSuggestions.length) {
      hideClimateSuggestions();
      return;
    }
    box.innerHTML = state.climateSuggestions.map((loc, i) =>
      '<button type="button" class="location-suggestion" data-pi-climate-suggestion="' + i + '">' +
      esc(loc.label || loc.name || '') + '</button>'
    ).join('');
    box.classList.remove('hidden');
  }

  async function searchClimateLocations(query) {
    const q = normalizeLocationQuery(query);
    if (q.length < 2) return [];
    if (typeof deps?.searchLocations === 'function') {
      return deps.searchLocations(q);
    }
    const result = await callGardenWeather({ mode: 'search', query: q });
    return result.suggestions || [];
  }

  function setClimateStatus(message, isError) {
    const el = $('climateStatus');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('err', !!isError);
    el.classList.toggle('show', !!message);
  }

  function handleClimateLocationInput(value) {
    state.pendingClimateLocation = null;
    const q = normalizeLocationQuery(value);
    if (state.climateSearchTimer) clearTimeout(state.climateSearchTimer);
    if (q.length < 2) {
      hideClimateSuggestions();
      return;
    }
    const seq = ++state.climateSearchSeq;
    state.climateSearchTimer = setTimeout(async () => {
      try {
        const items = await searchClimateLocations(q);
        if (seq !== state.climateSearchSeq) return;
        renderClimateSuggestions(items);
      } catch (_) {
        if (seq === state.climateSearchSeq) hideClimateSuggestions();
      }
    }, 320);
  }

  function selectClimateSuggestion(index) {
    const loc = state.climateSuggestions[index];
    if (!loc) return;
    const input = $('climateLocation');
    if (input) input.value = loc.label || loc.name || '';
    state.pendingClimateLocation = Object.assign({}, loc, { source: 'manual' });
    setClimateStatus(t('locSelected'));
    hideClimateSuggestions();
  }

  function isAbortError(err) {
    return err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''));
  }

  function setAnalyzeBusy(busy) {
    const btn = rootEl?.querySelector('[data-pi-id="analyzeBtn"]');
    if (btn) btn.disabled = !!busy;
  }

  async function callPlantIdentify(photo, signal) {
    const body = buildPlantIdentifyBody(photo);
    let res;
    try {
      res = await fetch(
        identifyUrl('/.netlify/functions/plant-identify?scan=' + encodeURIComponent(photo.scanId || '0')),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal
        }
      );
    } catch (err) {
      if (isAbortError(err)) return { __aborted: true };
      throw new Error(t('networkError'));
    }
    const text = await res.text();
    let out = {};
    try {
      out = text ? JSON.parse(text) : {};
    } catch (_) {
      throw new Error('Invalid response from identification service.');
    }
    if (!res.ok) {
      throw new Error(typeof out.error === 'string' ? out.error : (out.message || t('aiError')));
    }
    return out;
  }

  async function identifyPhoto(photo, scanSeq, signal) {
    const mode = deps?.identifyMode || 'plant-identify';

    if (mode === 'claude') {
      const prompt =
        'You are an expert botanist. Analyze the plant image and return ONLY valid JSON: ' +
        '{"common_name":"","scientific_name":"","confidence":"high|medium|low","alternatives":[],"climate_zone":"",' +
        '"climate_fit":"unknown","climate_summary":"","care":{"light":"","water":"","soil":"","season":"",' +
        '"pruning":"","fertilizer":""},"warnings":[],"similar_plants":[],"products":[]}. ' +
        forceLangHint();
      const raw = await callClaude([{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: photo.mediaType || 'image/jpeg', data: photo.imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]);
      if (scanSeq !== state.scanSeq) return null;
      return mapClaudeJsonToResult(parseJson(raw), photo);
    }

    const out = await callPlantIdentify(photo, signal);
    if (out?.__aborted || scanSeq !== state.scanSeq) return null;
    if (out.error && !(out.candidates || []).length) {
      throw new Error(typeof out.error === 'string' ? out.error : t('aiError'));
    }
    if (!(out.candidates || []).length && !out.identification) {
      throw new Error(t('aiError'));
    }
    const mapped = mapApiToResult(out, photo);
    if (scanSeq !== state.scanSeq) return null;
    mapped.care = sanitizeCareObject(mapped.care);
    return mapped;
  }

  function showErr(message) {
    const el = $('error');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
  }

  function clearErr() {
    const el = $('error');
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  }

  function piImgSrc(url) {
    const src = String(url || '').trim();
    return src || PI_TEXTURE;
  }

  function closeWizard() {
    $('wizardModal')?.classList.remove('show');
  }

  function showUploadStep() {
    const upload = $('uploadStep');
    const loading = $('loadingStep');
    if (upload) upload.style.display = 'block';
    if (loading) loading.style.display = 'none';
    ['s1', 's2', 's3'].forEach((id, i) => {
      const step = $(id);
      if (step) step.classList.toggle('on', i === 0);
    });
  }

  function resetScanState() {
    state.selectedFile = null;
    state.b64 = '';
    state.mime = 'image/jpeg';
    state.dataUrl = '';
    state.photo = null;
    state.identifying = false;
    state.scanSeq += 1;
    state.abortController?.abort();
    state.abortController = null;
    setAnalyzeBusy(false);
    clearErr();
  }

  function defaultPreviewHTML() {
    return (
      '<div><div class="pi-camera-icon">' + cameraIconSvg() + '</div>' +
      '<b>' + esc(t('uploadTitle')) + '</b><p class="pi-muted">' + esc(t('uploadSub')) + '</p></div>'
    );
  }

  function resetPreview() {
    const preview = $('preview');
    if (preview) preview.innerHTML = defaultPreviewHTML();
  }

  function goHomeFromModule() {
    resetScanState();
    hideResult();
    closeWizard();
    if (typeof deps?.goHome === 'function') {
      deps.goHome();
      return;
    }
    if (typeof global.goHome === 'function') {
      global.goHome();
      return;
    }
    PlantIdentifier.openHome();
  }

  function scanAgain() {
    resetScanState();
    hideResult();
    clearErr();
    showUploadStep();
    resetPreview();
    $('wizardModal')?.classList.add('show');
  }

  function hideResult() {
    const mount = $('result');
    if (!mount) return;
    mount.classList.remove('show');
    mount.innerHTML = '';
  }

  function showHome() {
    $('homeOverlay')?.classList.add('show');
  }

  function hideHome() {
    $('homeOverlay')?.classList.remove('show');
  }

  function cameraIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>';
  }

  function landingHTML(includeHistory) {
    return (
      '<div data-pi-id="homeOverlay" class="pi-home" role="dialog" aria-modal="true" aria-label="' + esc(t('homeTitle')) + '">' +
        '<div class="pi-home-scroll">' +
          '<header class="pi-home-top">' +
            '<div class="pi-home-pill">' + esc(t('pill')) + '</div>' +
            '<div class="pi-home-actions">' +
            '<button type="button" class="pi-home-btn" data-pi-action="home">' + esc(t('homeBtn')) + '</button>' +
            '<button type="button" class="pi-home-close" data-pi-id="closeHome" aria-label="' + esc(t('closeHome')) + '">×</button>' +
            '</div>' +
          '</header>' +
          '<section class="pi-hero">' +
            '<div class="pi-hero-copy">' +
              '<h1 class="pi-hero-title">' + esc(t('homeTitle')) + '</h1>' +
              '<p class="pi-hero-sub">' + esc(t('homeSub')) + '</p>' +
              '<button type="button" class="pi-hero-cta" data-pi-action="open">' + esc(t('identifyCta')) + '</button>' +
              '<div class="pi-benefits">' +
                '<div class="pi-benefit"><b>' + esc(t('f1')) + '</b><span>' + esc(t('f1s')) + '</span></div>' +
                '<div class="pi-benefit"><b>' + esc(t('f2')) + '</b><span>' + esc(t('f2s')) + '</span></div>' +
                '<div class="pi-benefit"><b>' + esc(t('f3')) + '</b><span>' + esc(t('f3s')) + '</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="pi-preview-card">' +
              '<button type="button" class="pi-photo-tease" data-pi-action="open">' +
                '<span class="pi-camera-icon">' + cameraIconSvg() + '</span>' +
                '<span class="pi-tease-text"><b>' + esc(t('takePhoto')) + '</b><span>' + esc(t('takeSub')) + '</span></span>' +
              '</button>' +
              '<p class="pi-primary-line">' + esc(t('flowSub')) + '</p>' +
            '</div>' +
          '</section>' +
          (includeHistory
            ? '<section class="pi-history pi-history-landing" data-pi-id="historySection"><h2>' + esc(t('recent')) + '</h2><div data-pi-id="history" class="pi-history-grid"></div></section>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  function showLoadingStep() {
    const upload = $('uploadStep');
    const loading = $('loadingStep');
    if (upload) upload.style.display = 'none';
    if (loading) loading.style.display = 'block';
    ['s1', 's2', 's3'].forEach((id, i) => {
      const step = $(id);
      if (step) step.classList.toggle('on', i < 2);
    });
  }

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }

  function fitText(fit) {
    if (fit === 'high') return t('suitable');
    if (fit === 'medium' || fit === 'low') return t('notSuitable');
    return t('unknown');
  }

  function fitClass(fit) {
    return fit === 'high' ? '' : 'warn';
  }

  function climateBadgeHtml(result) {
    if (hasVerifiedClimateFit(result)) {
      const zone = result.climate_zone ? ' · ' + result.climate_zone : '';
      return (
        '<div class="pi-score ' + fitClass(result.climate_fit) + '">' +
        esc(t('climate') + ': ' + fitText(result.climate_fit) + zone) +
        '</div>'
      );
    }
    return '<div class="pi-score warn">' + esc(t('climate') + ': ' + t('unknown')) + '</div>';
  }

  function climateBlock(result) {
    if (hasVerifiedClimateFit(result)) {
      const locLine = result._resolvedLocation
        ? '<p class="pi-muted pi-loc-line">' + esc(t('locResolved') + ': ' + result._resolvedLocation) + '</p>'
        : '';
      return (
        locLine +
        '<div class="pi-score ' + fitClass(result.climate_fit) + '">' +
        esc(fitText(result.climate_fit)) + ' · ' + esc(result.climate_zone || '') +
        '</div><p class="pi-muted" style="margin-top:12px">' + esc(result.climate_summary || '') + '</p>' +
        '<button type="button" class="pi-btn pi-btn-secondary pi-change-loc" data-pi-action="change-climate">' +
        esc(state.lang === 'he' ? 'שנה מיקום' : 'Change location') +
        '</button>'
      );
    }
    const savedLoc = normalizeLocationQuery(result._climateDraft || '');
    const gardenLoc = normalizeLocationQuery(getData()?.gardenLocation?.label || '');
    const defaultLoc = savedLoc || gardenLoc;
    return (
      '<p class="pi-muted">' + esc(t('climateUnknown')) + '</p>' +
      '<div class="pi-climate-prompt"><b>' + esc(t('checkClimateQuestion')) + '</b>' +
      '<label class="location-field-label" for="piClimateLocation">' + esc(t('locationFieldLabel')) + '</label>' +
      '<div class="location-search-wrap pi-climate-search">' +
      '<input data-pi-id="climateLocation" id="piClimateLocation" class="field" placeholder="' + esc(t('locationPh')) + '" value="' + esc(defaultLoc) + '" autocomplete="off">' +
      '<div data-pi-id="climateSuggestions" class="location-suggestions hidden"></div>' +
      '</div>' +
      '<div data-pi-id="climateStatus" class="pi-climate-status"></div>' +
      '<div class="pi-climate-row">' +
      '<button type="button" class="pi-btn pi-btn-secondary" data-pi-action="geo">' + esc(t('autoLoc')) + '</button>' +
      '<button type="button" class="pi-btn pi-btn-primary" data-pi-action="climate">' + esc(t('checkClimateBtn')) + '</button>' +
      '</div></div>'
    );
  }

  function renderResult(result) {
    const mount = $('result');
    if (!mount) return;
    const alts = (result.alternatives || []).filter(Boolean);
    mount.innerHTML =
      '<div class="pi-result-toolbar">' +
        '<button type="button" class="pi-toolbar-btn" data-pi-action="home">' + esc(t('homeBtn')) + '</button>' +
        '<button type="button" class="pi-toolbar-btn pi-toolbar-btn-primary" data-pi-action="rescan">' + esc(t('scanAgain')) + '</button>' +
      '</div>' +
      '<div class="pi-result-grid">' +
        '<div class="pi-card">' +
          '<img class="pi-plant-photo" src="' + esc(piImgSrc(result._img)) + '" alt="Plant">' +
          '<h2 class="pi-r-title">' + esc(result.common_name || t('identity')) + '</h2>' +
          '<div class="pi-latin">' + esc(result.scientific_name || '') + '</div>' +
          climateBadgeHtml(result) +
        '</div>' +
        '<div class="pi-card">' +
          '<h2>' + esc(t('identity')) + '</h2>' +
          '<p class="pi-muted pi-quick-care-sub">' + esc(t('quickCare')) + '</p>' +
          '<p class="pi-muted">' + (alts.length ? esc((state.lang === 'he' ? 'אפשרויות נוספות: ' : 'Alternatives: ') + alts.join(', ')) : '') + '</p>' +
          careInfoGridHtml(result) +
          '<h2>' + esc(t('climate')) + '</h2>' + climateBlock(result) +
          '<div class="pi-actions">' +
            '<button type="button" class="pi-small-btn pi-small-btn-primary" data-pi-action="save">' + esc(t('addGarden')) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    mount.classList.add('show');
    mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!hasVerifiedClimateFit(result)) {
      const gl = getData()?.gardenLocation;
      const inputVal = normalizeLocationQuery($('climateLocation')?.value || '');
      if (gl && inputVal && normalizeLocationQuery(gl.label || '') === inputVal && Number.isFinite(Number(gl.lat))) {
        state.pendingClimateLocation = Object.assign({}, gl, { source: 'garden' });
      }
    }
  }

  function saveHistory(result) {
    try {
      let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history = history.filter((x) => x.scientific_name !== result.scientific_name);
      history.unshift(Object.assign({}, result, { _date: new Date().toLocaleDateString() }));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
    } catch (_) { /* ignore */ }
    renderHistory();
  }

  function renderHistory() {
    const mount = $('history');
    const section = $('historySection');
    if (!mount) return;
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (_) { /* ignore */ }
    mount.innerHTML = history.slice(0, 4).map((item, index) =>
      '<div class="pi-hist" data-pi-history="' + index + '">' +
        '<img src="' + esc(piImgSrc(item._img)) + '" alt="">' +
        '<div><b>' + esc(item.common_name || '') + '</b><p class="pi-muted">' + esc(item.scientific_name || '') + '</p></div>' +
      '</div>'
    ).join('') || ('<p class="pi-muted">' + esc(t('noHistory')) + '</p>');
    if (section) section.style.display = history.length ? '' : 'none';
  }

  async function handleFile(file) {
    clearErr();
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      showErr(t('needImage'));
      return;
    }
    state.selectedFile = file;
    state.mime = normalizeMime(file.type || 'image/jpeg');

    if (typeof deps?.preparePlantPhoto === 'function') {
      try {
        state.photo = await deps.preparePlantPhoto(file);
        state.b64 = state.photo.imageBase64;
        state.dataUrl = state.photo.dataUrl;
        state.mime = state.photo.mediaType || 'image/jpeg';
      } catch (err) {
        showErr(err.message || t('readError'));
        return;
      }
    } else {
      state.photo = null;
      await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const data = String(reader.result || '');
          state.dataUrl = data;
          state.b64 = data.split(',')[1] || '';
          resolve();
        };
        reader.onerror = () => reject(new Error(t('readError')));
        reader.readAsDataURL(file);
      });
    }

    const preview = $('preview');
    if (preview) {
      preview.innerHTML = '<img src="' + esc(state.dataUrl) + '" alt="Plant photo preview">';
    }
  }

  async function identify() {
    if (state.identifying) return;
    clearErr();
    const photo = buildPhotoPayload();
    if (!photo || !photo.imageBase64) {
      showErr(t('needPhoto'));
      return;
    }

    state.identifying = true;
    state.abortController?.abort();
    state.abortController = new AbortController();
    const scanSeq = ++state.scanSeq;
    const { signal } = state.abortController;
    const timeout = setTimeout(() => {
      if (state.scanSeq === scanSeq) state.abortController?.abort();
    }, 90000);

    setAnalyzeBusy(true);
    showLoadingStep();
    try {
      const result = await identifyPhoto(photo, scanSeq, signal);
      if (scanSeq !== state.scanSeq) return;
      if (!result) {
        showUploadStep();
        showErr(t('networkError'));
        return;
      }
      resetClimateCheckState(result);
      if (scanSeq !== state.scanSeq) return;
      state.lastResult = result;
      applyIdentifyCareToDisplay(result);
      hideHome();
      closeWizard();
      renderResult(result);
      await enrichBasicCareAfterIdentify(result);
      if (scanSeq !== state.scanSeq) return;
      saveHistory(result);
      renderResult(result);
      if (typeof deps?.onIdentified === 'function') deps.onIdentified(result);
    } catch (err) {
      if (scanSeq !== state.scanSeq || isAbortError(err)) return;
      showUploadStep();
      showErr(err.message || t('aiError'));
    } finally {
      clearTimeout(timeout);
      if (scanSeq === state.scanSeq) {
        state.identifying = false;
        setAnalyzeBusy(false);
      }
    }
  }

  async function checkClimateNow() {
    const loc = normalizeLocationQuery($('climateLocation')?.value || '');
    if (!loc) return toast(t('needLoc'));
    if (!state.lastResult) return;
    state.lastResult._climateDraft = loc;
    const checkBtn = rootEl.querySelector('[data-pi-action="climate"]');
    if (checkBtn) checkBtn.disabled = true;

    try {
      setClimateStatus(t('locResolving'));
      hideClimateSuggestions();
      const place = await resolveClimateLocation(loc);
      const input = $('climateLocation');
      if (input && place.label) input.value = place.label;
      setClimateStatus(t('locResolved') + ': ' + (place.label || loc));

      const query = String(state.lastResult.scientific_name || state.lastResult.common_name || '').trim();
      if (!query) throw new Error(t('climateCheckFailed'));

      toast(state.lang === 'he' ? 'בודק התאמה...' : 'Checking climate...');
      const localized = await resolveLocalizedCare(state.lastResult, place);
      if (!localized) {
        throw new Error(t('climateCheckFailed'));
      }

      finalizeLocalizedClimate(state.lastResult, place, localized);

      if (!climateResultReady(state.lastResult)) {
        throw new Error(t('climateCheckFailed'));
      }

      state.lastResult._climateDraft = loc;
      state.lastResult._climateChecked = true;
      state.lastResult._hasClimate = true;

      renderResult(state.lastResult);
      saveHistory(state.lastResult);
    } catch (err) {
      setClimateStatus(err.message || t('locNotFound'), true);
      toast(err.message || t('locNotFound'));
    } finally {
      if (checkBtn) checkBtn.disabled = false;
    }
  }

  function useGeoForClimate() {
    if (!navigator.geolocation) return toast(t('needLoc'));
    toast(t('detectingLoc'));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const el = $('climateLocation');
        try {
          const result = await callGardenWeather({ mode: 'reverse', lat, lon });
          const label = result.location?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          if (el) el.value = label;
          state.pendingClimateLocation = Object.assign({}, result.location || { lat, lon, label }, { source: 'geolocation' });
          setClimateStatus(t('locSelected'));
          hideClimateSuggestions();
        } catch (_) {
          if (el) el.value = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        }
      },
      () => toast(t('needLoc'))
    );
  }

  function saveToGarden() {
    if (!state.lastResult) return;
    if (typeof deps?.commitIdentifiedPlant === 'function') {
      deps.commitIdentifiedPlant(state.lastResult);
      toast(t('saved'));
      return;
    }
    if (typeof deps?.finalizePlantListChange !== 'function') {
      throw new Error('PlantIdentifier: finalizePlantListChange() is required in init(deps).');
    }
    const data = getData();
    const plant = mapResultToPlant(state.lastResult);
    data.plants = data.plants || [];
    data.plants.push(plant);
    data.events = data.events || [];
    data.events.unshift(['Today', 'Plant added from scan', plant.name]);
    deps.finalizePlantListChange();
    toast(t('saved'));
  }

  function bindEvents() {
    if (!rootEl || rootEl.dataset.piBound === '1') return;
    rootEl.dataset.piBound = '1';
    rootEl.querySelectorAll('[data-pi-action="open"]').forEach((el) => {
      el.addEventListener('click', () => PlantIdentifier.openScan());
    });
    rootEl.querySelector('[data-pi-id="closeModal"]')?.addEventListener('click', () => closeWizard());
    rootEl.querySelector('[data-pi-id="closeHome"]')?.addEventListener('click', () => PlantIdentifier.closeHome());
    rootEl.querySelector('[data-pi-id="homeOverlay"]')?.addEventListener('click', (e) => {
      if (e.target?.dataset?.piId === 'homeOverlay') PlantIdentifier.closeHome();
    });
    rootEl.querySelector('[data-pi-id="wizardModal"]')?.addEventListener('click', (e) => {
      if (e.target?.dataset?.piId === 'wizardModal') closeWizard();
    });
    rootEl.querySelector('[data-pi-id="preview"]')?.addEventListener('click', () => {
      rootEl.querySelector('[data-pi-id="fileInput"]')?.click();
    });
    rootEl.querySelector('[data-pi-id="galleryBtn"]')?.addEventListener('click', () => {
      rootEl.querySelector('[data-pi-id="fileInput"]')?.click();
    });
    rootEl.querySelector('[data-pi-id="cameraBtn"]')?.addEventListener('click', () => {
      rootEl.querySelector('[data-pi-id="camInput"]')?.click();
    });
    rootEl.querySelector('[data-pi-id="fileInput"]')?.addEventListener('change', (e) => {
      void handleFile(e.target.files?.[0]);
      e.target.value = '';
    });
    rootEl.querySelector('[data-pi-id="camInput"]')?.addEventListener('change', (e) => {
      void handleFile(e.target.files?.[0]);
      e.target.value = '';
    });
    rootEl.querySelector('[data-pi-id="analyzeBtn"]')?.addEventListener('click', () => {
      void identify();
    });
    rootEl.addEventListener('input', (e) => {
      if (e.target?.dataset?.piId === 'climateLocation') {
        handleClimateLocationInput(e.target.value);
      }
    });
    rootEl.addEventListener('click', (e) => {
      const action = e.target?.closest?.('[data-pi-action]')?.dataset?.piAction;
      if (action === 'save') saveToGarden();
      if (action === 'climate') void checkClimateNow();
      if (action === 'change-climate') {
        if (state.lastResult) {
          state.lastResult._climateChecked = false;
          state.lastResult._hasClimate = false;
          renderResult(state.lastResult);
        }
      }
      if (action === 'geo') useGeoForClimate();
      if (action === 'home') goHomeFromModule();
      if (action === 'rescan') scanAgain();
      const suggestion = e.target?.closest?.('[data-pi-climate-suggestion]');
      if (suggestion) {
        selectClimateSuggestion(Number(suggestion.dataset.piClimateSuggestion));
        return;
      }
      const hist = e.target?.closest?.('[data-pi-history]');
      if (hist) {
        const index = Number(hist.dataset.piHistory);
        void (async () => {
          try {
            const items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            if (!items[index]) return;
            state.lastResult = items[index];
            hideHome();
            closeWizard();
            if (careLooksEmpty(state.lastResult.care) || careLooksGeneric(state.lastResult.care)) {
              showLoadingStep();
              await enrichBasicCareAfterIdentify(state.lastResult);
              saveHistory(state.lastResult);
            }
            renderResult(state.lastResult);
          } catch (_) { /* ignore */ }
        })();
      }
    });
  }

  function mountHTML(includeHistory) {
    return (
      landingHTML(includeHistory !== false) +
      '<input data-pi-id="fileInput" class="pi-file" type="file" accept="image/*">' +
      '<input data-pi-id="camInput" class="pi-file" type="file" accept="image/*" capture="environment">' +
      '<div data-pi-id="wizardModal" class="pi-modal" role="dialog" aria-modal="true">' +
        '<div class="pi-wizard">' +
          '<div class="pi-modal-top">' +
            '<div><h2>' + esc(t('modalTitle')) + '</h2><p class="pi-muted">' + esc(t('modalSub')) + '</p></div>' +
            '<button type="button" class="pi-close" data-pi-id="closeModal" aria-label="Close">×</button>' +
          '</div>' +
          '<div class="pi-steps"><div class="pi-step on" data-pi-id="s1"></div><div class="pi-step" data-pi-id="s2"></div><div class="pi-step" data-pi-id="s3"></div></div>' +
          '<div data-pi-id="uploadStep">' +
            '<div class="pi-drop" data-pi-id="preview">' +
              '<div><div class="pi-camera-icon">' + cameraIconSvg() + '</div>' +
              '<b>' + esc(t('uploadTitle')) + '</b><p class="pi-muted">' + esc(t('uploadSub')) + '</p></div>' +
            '</div>' +
            '<div class="pi-upload-btns">' +
              '<button type="button" class="pi-btn pi-btn-secondary" data-pi-id="galleryBtn">' + esc(t('gallery')) + '</button>' +
              '<button type="button" class="pi-btn pi-btn-secondary" data-pi-id="cameraBtn">' + esc(t('camera')) + '</button>' +
            '</div>' +
            '<button type="button" class="pi-btn pi-btn-primary" data-pi-id="analyzeBtn" style="width:100%;margin-top:12px">' + esc(t('analyzeBtn')) + '</button>' +
            '<div data-pi-id="error" class="pi-error"></div>' +
          '</div>' +
          '<div data-pi-id="loadingStep" style="display:none">' +
            '<div class="pi-loader"><div class="pi-loader-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M12 21c0-6 4-10 9-10-1 6-5 10-9 10Z"/><path d="M12 21c0-6-4-10-9-10 1 6 5 10 9 10Z"/><path d="M12 21V7"/></svg></div>' +
            '<h2>' + esc(t('loadingT')) + '</h2>' +
            '<div class="pi-loader-lines"><span>' + esc(t('l1')) + '</span><span>' + esc(t('l2')) + '</span><span>' + esc(t('l3')) + '</span></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div data-pi-id="result" class="pi-result"></div>' +
      '<div data-pi-id="toast" class="pi-toast"></div>'
    );
  }

  const PlantIdentifier = {
    init(options) {
      deps = options || {};
      state.lang = deps.lang || localStorage.getItem(LANG_KEY) || 'en';
      if (deps.lang) localStorage.setItem(LANG_KEY, deps.lang);
      return this;
    },

    mount(config) {
      const cfg = config || {};
      const target = cfg.root || '#plant-identifier-root';
      rootEl = typeof target === 'string' ? document.querySelector(target) : target;
      if (!rootEl) {
        rootEl = document.createElement('div');
        rootEl.id = 'plant-identifier-root';
        document.body.appendChild(rootEl);
      }
      rootEl.classList.add('plant-identifier-module');
      delete rootEl.dataset.piBound;
      rootEl.innerHTML = mountHTML(cfg.includeHistory !== false);
      bindEvents();
      renderHistory();
      mounted = true;
      return this;
    },

    openHome() {
      if (!mounted) this.mount();
      hideResult();
      clearErr();
      closeWizard();
      showHome();
      renderHistory();
      if (typeof deps?.setShellOpen === 'function') deps.setShellOpen(true);
      return this;
    },

    closeHome() {
      hideHome();
      hideResult();
      if (typeof deps?.setShellOpen === 'function') deps.setShellOpen(false);
      return this;
    },

    openScan() {
      if (!mounted) this.mount();
      clearErr();
      showUploadStep();
      if (!state.dataUrl) resetPreview();
      hideResult();
      if (typeof deps?.setShellOpen === 'function') deps.setShellOpen(true);
      $('wizardModal')?.classList.add('show');
    },

    closeScan() {
      closeWizard();
    },

    handleFile(file) {
      return handleFile(file);
    },

    identify() {
      return identify();
    },

    saveToGarden() {
      saveToGarden();
    },

    getLastResult() {
      return state.lastResult;
    },

    destroy() {
      state.abortController?.abort();
      if (rootEl) {
        rootEl.innerHTML = '';
        rootEl.classList.remove('plant-identifier-module');
        delete rootEl.dataset.piBound;
      }
      mounted = false;
      if (typeof deps?.setShellOpen === 'function') deps.setShellOpen(false);
    },

    /** @deprecated Use openHome() for entry flow; openScan() opens the upload wizard only. */
    openLanding() {
      return this.openHome();
    }
  };

  global.PlantIdentifier = PlantIdentifier;
})(typeof window !== 'undefined' ? window : globalThis);
