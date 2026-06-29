/* Cruvit — Garden Modes module (standalone, reusable) */
(function (global) {
  'use strict';

  const PRIORITY_ORDER = [
    'overdue-care',
    'pest-risk',
    'heat-stress',
    'winter-protection',
    'needs-water',
    'pruning-time',
    'fertilizing-time',
    'blooming-season',
    'healthy',
    'new-garden'
  ];

  /** Calm hero copy when care is needed but the panel stays uplifting */
  const POSITIVE_HERO_FALLBACK = {
    id: 'healthy',
    title: { he: 'מטופלת היטב', en: 'Well cared' },
    subtitle: {
      he: 'את דואגת לגינה בקשב — כל צעד טיפול קטן שומר עליה שמחה ופורחת.',
      en: 'You\'re giving your garden thoughtful attention — each care step keeps it happy and growing.'
    },
    severity: 'calm',
    icon: '🌿',
    image: 'assets/garden-modes/healthy.png',
    actions: [
      { he: 'לסמן משימות שהושלמו', en: 'Mark completed tasks' },
      { he: 'לבדוק משימות קרובות', en: 'Review upcoming tasks' },
      { he: 'לעקוב אחרי צמחים צעירים', en: 'Watch young plants' }
    ],
    relatedTaskTypes: [],
    priority: 20
  };

  /** Most positive first — hero always shows one of these (never warning modes) */
  const POSITIVE_PRIORITY = [
    'blooming-season',
    'healthy',
    'fertilizing-time',
    'pruning-time',
    'new-garden'
  ];

  function isWarningMode(id) {
    const m = MODE_BY_ID[id];
    return !!(m && (m.severity === 'urgent' || m.severity === 'important'));
  }

  const MODE_GRADIENTS = {
    'healthy': 'linear-gradient(145deg, #edf5e6 0%, #b8dfa0 52%, #8ecf6a 100%)',
    'needs-water': 'linear-gradient(145deg, #e3f4fb 0%, #9fd4ef 55%, #6bb8de 100%)',
    'overdue-care': 'linear-gradient(145deg, #fff3e0 0%, #f0c878 58%, #d4a853 100%)',
    'pest-risk': 'linear-gradient(145deg, #fff0eb 0%, #f0b8a8 55%, #d88a72 100%)',
    'heat-stress': 'linear-gradient(145deg, #fff8e8 0%, #f5d08a 50%, #e8a84a 100%)',
    'winter-protection': 'linear-gradient(145deg, #eef3f8 0%, #b8cde0 55%, #7fa8c8 100%)',
    'pruning-time': 'linear-gradient(145deg, #f0f5ea 0%, #c5dba8 55%, #8fbd7d 100%)',
    'fertilizing-time': 'linear-gradient(145deg, #f5f0e8 0%, #dcc99a 55%, #c9a227 100%)',
    'blooming-season': 'linear-gradient(145deg, #fff0f5 0%, #f0c8dc 52%, #e8a0c0 100%)',
    'new-garden': 'linear-gradient(145deg, #f5f3ef 0%, #dcead4 55%, #b8dfa0 100%)'
  };

  const GARDEN_MODES_CONFIG = [
    {
      id: 'healthy',
      title: { he: 'גינה מאוזנת', en: 'Healthy / Balanced Garden' },
      subtitle: {
        he: 'הגינה שלך נראית מאוזנת ובריאה. המשיכי בשגרת הטיפול הקיימת.',
        en: 'Your garden looks balanced and healthy. Keep your current care rhythm.'
      },
      severity: 'calm',
      icon: '🌿',
      image: 'assets/garden-modes/healthy.png',
      actions: [
        { he: 'בדיקת השקיה שבועית', en: 'Weekly watering check' },
        { he: 'לעקוב אחרי צמחים צעירים', en: 'Watch young plants' },
        { he: 'לבדוק משימות קרובות', en: 'Review upcoming tasks' }
      ],
      relatedTaskTypes: [],
      priority: 20
    },
    {
      id: 'needs-water',
      title: { he: 'הגינה צמאה', en: 'Needs Water' },
      subtitle: {
        he: 'חלק מהצמחים שלך כנראה צריכים השקיה בקרוב.',
        en: 'Some of your plants may need watering soon.'
      },
      severity: 'important',
      icon: '💧',
      image: 'assets/garden-modes/needs-water.png',
      actions: [
        { he: 'להשקות צמחים רגישים', en: 'Water sensitive plants' },
        { he: 'לבדוק אדמה בעציצים', en: 'Check container soil' },
        { he: 'להקדים השקיה בימים חמים', en: 'Water earlier on hot days' }
      ],
      relatedTaskTypes: ['watering'],
      priority: 70
    },
    {
      id: 'overdue-care',
      title: { he: 'טיפול באיחור', en: 'Overdue Care' },
      subtitle: {
        he: 'יש כמה משימות טיפול שעבר זמנן ועלולות להשפיע על בריאות הגינה.',
        en: 'Some care tasks are overdue and may affect garden health.'
      },
      severity: 'urgent',
      icon: '⏰',
      image: 'assets/garden-modes/overdue-care.png',
      actions: [
        { he: 'להשלים משימות באיחור', en: 'Complete overdue tasks' },
        { he: 'להתחיל מהצמחים הרגישים ביותר', en: 'Start with the most sensitive plants' },
        { he: 'לסמן משימות שהושלמו', en: 'Mark completed tasks' }
      ],
      relatedTaskTypes: ['overdue'],
      priority: 100
    },
    {
      id: 'pest-risk',
      title: { he: 'סיכון למזיקים', en: 'Pest Risk' },
      subtitle: {
        he: 'יש סימנים שכדאי לבדוק כדי למנוע התפשטות מזיקים או מחלות.',
        en: 'There are signs worth checking to prevent pests or disease spread.'
      },
      severity: 'urgent',
      icon: '🐛',
      image: 'assets/garden-modes/pest-risk.png',
      actions: [
        { he: 'לבדוק עלים מקרוב', en: 'Inspect leaves closely' },
        { he: 'לחפש כתמים או עלים פגועים', en: 'Look for spots or damaged leaves' },
        { he: 'להשתמש ב-Plant Doctor לצילום הצמח', en: 'Use Plant Doctor to scan the plant' }
      ],
      relatedTaskTypes: ['pest-check'],
      priority: 90
    },
    {
      id: 'heat-stress',
      title: { he: 'עומס חום', en: 'Heat Stress' },
      subtitle: {
        he: 'החום עלול להקשות על חלק מהצמחים שלך, במיוחד בעציצים או בשמש ישירה.',
        en: 'Heat may stress some plants, especially in pots or full sun.'
      },
      severity: 'important',
      icon: '☀️',
      image: 'assets/garden-modes/heat-stress.png',
      actions: [
        { he: 'לבדוק צמחים צעירים', en: 'Check young plants' },
        { he: 'להוסיף הצללה זמנית', en: 'Add temporary shade' },
        { he: 'להשקות בשעות קרירות', en: 'Water during cooler hours' }
      ],
      relatedTaskTypes: ['watering'],
      priority: 80
    },
    {
      id: 'winter-protection',
      title: { he: 'הגנת חורף', en: 'Winter Protection' },
      subtitle: {
        he: 'חלק מהצמחים עשויים להזדקק להגנה מקור, רוח או עודף מים.',
        en: 'Some plants may need protection from cold, wind or excess water.'
      },
      severity: 'important',
      icon: '❄️',
      image: 'assets/garden-modes/winter-protection.png',
      actions: [
        { he: 'להזיז עציצים רגישים', en: 'Move sensitive pots' },
        { he: 'לבדוק ניקוז', en: 'Check drainage' },
        { he: 'להימנע מהשקיית יתר', en: 'Avoid overwatering' }
      ],
      relatedTaskTypes: ['watering'],
      priority: 75
    },
    {
      id: 'pruning-time',
      title: { he: 'זמן גיזום', en: 'Pruning Time' },
      subtitle: {
        he: 'זה זמן טוב לסדר, לעצב ולחזק חלק מהצמחים בגינה.',
        en: 'A good time to shape and strengthen some plants in your garden.'
      },
      severity: 'calm',
      icon: '✂️',
      image: 'assets/garden-modes/pruning-time.png',
      actions: [
        { he: 'לגזום ענפים יבשים', en: 'Prune dry branches' },
        { he: 'לבדוק צמחים מטפסים', en: 'Check climbing plants' },
        { he: 'לעדכן משימות שהושלמו', en: 'Update completed tasks' }
      ],
      relatedTaskTypes: ['pruning'],
      priority: 60
    },
    {
      id: 'fertilizing-time',
      title: { he: 'זמן דישון', en: 'Fertilizing Time' },
      subtitle: {
        he: 'חלק מהצמחים יכולים להרוויח מתוספת הזנה בתקופה הזו.',
        en: 'Some plants may benefit from feeding during this period.'
      },
      severity: 'calm',
      icon: '🌱',
      image: 'assets/garden-modes/fertilizing-time.png',
      actions: [
        { he: 'פתחי משימות — ודשני את הצמחים שברשימה', en: 'Open tasks — fertilize the plants listed there' },
        { he: 'לא לדשן צמחים במצוקה קשה', en: 'Avoid feeding stressed plants' },
        { he: 'לבדוק מינון מתאים', en: 'Check the right dosage' }
      ],
      relatedTaskTypes: ['fertilizing'],
      priority: 55
    },
    {
      id: 'blooming-season',
      title: { he: 'עונת פריחה', en: 'Blooming Season' },
      subtitle: {
        he: 'הגינה שלך נכנסת לתקופה יפה של צמיחה ופריחה.',
        en: 'Your garden is entering a lovely phase of growth and bloom.'
      },
      severity: 'calm',
      icon: '🌸',
      image: 'assets/garden-modes/blooming-season.png',
      actions: [
        { he: 'לצלם ולעקוב אחרי התפתחות', en: 'Photograph and track progress' },
        { he: 'להסיר פרחים יבשים', en: 'Remove spent flowers' },
        { he: 'לשמור על השקיה יציבה', en: 'Keep watering steady' }
      ],
      relatedTaskTypes: [],
      priority: 30
    },
    {
      id: 'new-garden',
      title: { he: 'גינה חדשה בבנייה', en: 'New Garden Setup' },
      subtitle: {
        he: 'הגינה שלך עדיין נבנית. כדאי להשלים מידע על הצמחים כדי לקבל המלצות מדויקות יותר.',
        en: 'Your garden is still taking shape. Add plant details for better recommendations.'
      },
      severity: 'calm',
      icon: '🌱',
      image: 'assets/garden-modes/new-garden.png',
      actions: [
        { he: 'להוסיף עוד צמחים', en: 'Add more plants' },
        { he: 'להשלים מיקום', en: 'Complete location details' },
        { he: 'להוסיף תמונות של הגינה', en: 'Add garden photos' }
      ],
      relatedTaskTypes: [],
      priority: 10
    }
  ];

  const MODE_BY_ID = Object.fromEntries(GARDEN_MODES_CONFIG.map(m => [m.id, m]));

  function gardenModesLang() {
    return (localStorage.getItem('cruvitLang') || document.documentElement.lang || 'en').toLowerCase();
  }

  function gardenModesIsHe() {
    const l = gardenModesLang();
    return l === 'he' || l.startsWith('he-');
  }

  function t(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return gardenModesIsHe() ? (value.he || value.en || '') : (value.en || value.he || '');
  }

  function severityLabel(severity) {
    const map = {
      calm: { he: 'רגוע', en: 'Calm' },
      important: { he: 'חשוב', en: 'Important' },
      urgent: { he: 'דחוף', en: 'Urgent' }
    };
    return t(map[severity] || map.calm);
  }

  function getCurrentSeason(referenceDate) {
    const d = referenceDate || new Date();
    const m = d.getMonth();
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
  }

  function taskTitle(t) { return String((t && t[1]) || '').toLowerCase(); }
  function taskWhen(t) { return String((t && t[2]) || '').toLowerCase(); }
  function taskIsDone(t) {
    if (!t) return false;
    if (Array.isArray(t)) return !!t[7];
    return !!t.done;
  }

  function getOverdueTasks(tasks, isTaskOverdue) {
    return (tasks || []).filter(t => !taskIsDone(t) && (isTaskOverdue ? isTaskOverdue(t) : false));
  }

  function getUpcomingTasks(tasks, days, deps) {
    const todayIso = deps.todayIso;
    const taskIsoValue = deps.taskIsoValue;
    const datePlusDaysIso = deps.datePlusDaysIso;
    if (!todayIso || !taskIsoValue || !datePlusDaysIso) return [];
    const limit = datePlusDaysIso(days);
    return (tasks || []).filter(t => {
      if (taskIsDone(t)) return false;
      const iso = taskIsoValue(t);
      if (!iso) return taskWhen(t).includes('today') || taskWhen(t).includes('tomorrow');
      return iso >= todayIso() && iso <= limit;
    });
  }

  function matchesTaskType(t, types) {
    const title = taskTitle(t);
    return types.some(type => {
      if (type === 'watering') return /water|moisture|irrigation|השק/i.test(title);
      if (type === 'pruning') return /prun|trim|גיז/i.test(title);
      if (type === 'fertilizing') return /fertiliz|feed|nutrient|דיש/i.test(title);
      if (type === 'pest-check') return /pest|disease|check.*leaf|inspect|מזיק|מחל/i.test(title);
      if (type === 'overdue') return true;
      return false;
    });
  }

  function hasWateringDue(tasks, deps) {
    const todayIso = deps.todayIso;
    const isTaskOverdue = deps.isTaskOverdue;
    const open = (tasks || []).filter(t => !taskIsDone(t));
    return open.some(t => {
      if (!/water|moisture|irrigation|השק/i.test(taskTitle(t))) return false;
      if (isTaskOverdue && isTaskOverdue(t)) return true;
      if (taskWhen(t).includes('today')) return true;
      if (taskWhen(t).includes('tomorrow')) return true;
      const iso = deps.taskIsoValue ? deps.taskIsoValue(t) : '';
      if (iso && todayIso && iso === todayIso()) return true;
      return false;
    });
  }

  function hasPruningDue(tasks, deps) {
    const upcoming = getUpcomingTasks(tasks, 7, deps);
    return upcoming.some(t => /prun|trim|גיז/i.test(taskTitle(t)));
  }

  function hasFertilizingDue(tasks, deps) {
    const upcoming = getUpcomingTasks(tasks, 7, deps);
    return upcoming.some(t => /fertiliz|feed|nutrient|דיש/i.test(taskTitle(t)));
  }

  function plantTextBlob(p, deps) {
    const meta = deps.plantMeta ? deps.plantMeta(p) : (p.meta || {});
    const warnings = [...(meta.warnings || []), ...(p.warnings || [])];
    if (deps.plantAlerts) {
      try { deps.plantAlerts(p).forEach(a => warnings.push(a)); } catch (_) {}
    }
    return [
      p.name, p.status, p.mark,
      warnings.join(' '),
      meta.guide, meta.season, meta.climate, meta.water, meta.sun
    ].join(' ').toLowerCase();
  }

  function hasPestWarnings(plants, deps) {
    const pestRe = /pest|disease|mite|aphid|scale|fung|mildew|leaf miner|מזיק|מחל|כתם|עלים פג/i;
    if ((plants || []).some(p => pestRe.test(plantTextBlob(p, deps)))) return true;
    if ((plants || []).some(p => {
      const s = String(p.status || '').toLowerCase();
      return s.includes('check leaves') || s.includes('pest') || s.includes('disease');
    })) return true;
    const doctor = deps.plantDoctorResults;
    if (Array.isArray(doctor) && doctor.some(r => pestRe.test(JSON.stringify(r)))) return true;
    if (doctor && typeof doctor === 'object' && pestRe.test(JSON.stringify(doctor))) return true;
    const tasks = deps.tasks || [];
    return tasks.some(t => !taskIsDone(t) && pestRe.test(taskTitle(t)));
  }

  function hasHeatRisk(plants, weather, season, deps) {
    const weatherHot = weather && (
      Number(weather.tempC) >= 32 ||
      Number(weather.maxC) >= 34 ||
      Number(weather.forecastPeak) >= 34 ||
      (Array.isArray(weather.alerts) && (weather.alerts.includes('heat-wave') || weather.alerts.includes('dry-heat'))) ||
      /hot|heat|dry|חם/i.test(String(weather.summary || weather.condition || ''))
    );
    if (weatherHot) return (plants || []).length > 0;
    if (season !== 'summer') return false;
    const stressRe = /heat stress|sunburn|wilting|water today|needs water|container|young|newly planted|עציץ|צעיר|חום|שמש/i;
    return (plants || []).some(p => {
      const status = String(p.status || '').toLowerCase();
      if (stressRe.test(status)) return true;
      const meta = deps.plantMeta ? deps.plantMeta(p) : (p.meta || {});
      const warnings = [...(meta.warnings || []), ...(p.warnings || [])].join(' ').toLowerCase();
      return /heat stress|hot climate|afternoon shade|container|pot|young plant|protect from sun/i.test(warnings);
    });
  }

  function hasWinterRisk(plants, weather, season, deps) {
    const weatherCold = weather && (
      Number(weather.tempC) <= 8 ||
      Number(weather.minC) <= 5 ||
      Number(weather.forecastLow) <= 3 ||
      (Array.isArray(weather.alerts) && (weather.alerts.includes('cold-snap') || weather.alerts.includes('frost'))) ||
      /cold|freeze|frost|קור/i.test(String(weather.summary || weather.condition || ''))
    );
    if (weatherCold) return (plants || []).length > 0;
    if (season !== 'winter') return false;
    const coldRe = /frost|winter|cold|freeze|protection|קור|חורף|הגנה/i;
    return (plants || []).some(p => {
      const blob = [
        p.status,
        ...(deps.plantMeta ? (deps.plantMeta(p).warnings || []) : []),
        ...(p.warnings || [])
      ].join(' ').toLowerCase();
      return coldRe.test(blob);
    });
  }

  function isNewGarden(plants, deps) {
    const list = (plants || []).filter(p => !p.archived);
    if (!list.length) return true;
    if (list.length <= 2) return true;
    const recentAdds = deps.recentPlantAdds;
    if (typeof recentAdds === 'number' && recentAdds >= 2 && list.length <= 4) return true;
    return false;
  }

  function isGardenHealthy(gardenData) {
    const score = gardenData.healthScore;
    const overdue = (gardenData.overdueTasks || []).length;
    const attention = gardenData.attentionPlants || 0;
    const urgent = gardenData.urgentTasks || 0;
    if (!gardenData.plants || !gardenData.plants.length) return false;
    if (overdue > 0 || urgent > 0 || attention > 1) return false;
    return typeof score === 'number' ? score >= 80 : true;
  }

  function hasBloomingSeason(plants, season, gardenData) {
    if ((gardenData.overdueTasks || []).length || (gardenData.urgentTasks || 0) > 0) return false;
    const bloomRe = /flower|bloom|flowering|פרח|פריח/i;
    const hasBloomPlant = (plants || []).some(p => bloomRe.test(plantTextBlob(p, {})));
    return hasBloomPlant && (season === 'spring' || season === 'summer');
  }

  function modeActive(id, gardenData, deps) {
    const plants = gardenData.plants || [];
    const tasks = gardenData.tasks || [];
    const season = gardenData.season;
    const weather = gardenData.weather || null;

    switch (id) {
      case 'overdue-care':
        return (gardenData.overdueTasks || []).length > 0;
      case 'pest-risk':
        return hasPestWarnings(plants, { ...deps, tasks, plantDoctorResults: gardenData.plantDoctorResults });
      case 'heat-stress':
        return hasHeatRisk(plants, weather, season, deps);
      case 'winter-protection':
        return hasWinterRisk(plants, weather, season, deps);
      case 'needs-water':
        return hasWateringDue(tasks, deps) || plants.some(p => /water today|needs water|צמא|השק/i.test(String(p.status || '')));
      case 'pruning-time':
        return hasPruningDue(tasks, deps);
      case 'fertilizing-time':
        return hasFertilizingDue(tasks, deps) || plants.some(p => /fertiliz|feed|דיש/i.test(String(p.status || '')));
      case 'blooming-season':
        return hasBloomingSeason(plants, season, gardenData);
      case 'healthy':
        return isGardenHealthy(gardenData);
      case 'new-garden':
        return isNewGarden(plants, gardenData);
      default:
        return false;
    }
  }

  function collectGardenData(deps) {
    deps = deps || {};
    const data = deps.data || global.data || { plants: [], tasks: [] };
    const plants = (data.plants || []).filter(p => !p.archived);
    const tasks = data.tasks || [];
    const health = deps.calculateHealthScore ? deps.calculateHealthScore() : { score: data.score, urgentTasks: 0, attentionPlants: 0 };
    const overdueTasks = getOverdueTasks(tasks, deps.isTaskOverdue);
    const isoToday = deps.todayIso ? deps.todayIso() : null;
    const refDate = isoToday ? new Date(isoToday + 'T12:00:00') : new Date();

    return {
      plants,
      tasks,
      completedTasks: tasks.filter(t => taskIsDone(t)),
      overdueTasks,
      healthScore: health.score,
      attentionPlants: health.attentionPlants,
      urgentTasks: health.urgentTasks,
      health,
      season: getCurrentSeason(refDate),
      location: data.location || null,
      climate: data.climate || null,
      weather: data.weather || null,
      plantDoctorResults: data.plantDoctorResults || data.plantDoctor || null,
      recentPlantAdds: data.recentPlantAdds || null
    };
  }

  function deriveGardenModes(gardenData, deps) {
    deps = deps || {};
    let activeIds = PRIORITY_ORDER.filter(id => modeActive(id, gardenData, deps));
    if (!activeIds.length) activeIds = ['new-garden'];

    if (!gardenData.plants || !gardenData.plants.length) {
      return {
        primaryMode: Object.assign({}, MODE_BY_ID['new-garden']),
        secondaryModes: [],
        warningModes: []
      };
    }

    const positiveIds = activeIds.filter(id => !isWarningMode(id));
    const warningIds = activeIds.filter(id => isWarningMode(id));

    let primaryId;
    if (positiveIds.length > 0) {
      primaryId = POSITIVE_PRIORITY.find(id => positiveIds.includes(id)) || positiveIds[0];
    } else {
      primaryId = null;
    }

    const warningModes = warningIds
      .sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b))
      .map(id => Object.assign({}, MODE_BY_ID[id]));

    const primaryMode = primaryId
      ? Object.assign({}, MODE_BY_ID[primaryId])
      : Object.assign({}, POSITIVE_HERO_FALLBACK);

    return {
      primaryMode,
      secondaryModes: [],
      warningModes
    };
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function modeCardHtml(mode, variant) {
    const gradient = MODE_GRADIENTS[mode.id] || MODE_GRADIENTS['healthy'];
    const taskType = (mode.relatedTaskTypes && mode.relatedTaskTypes[0]) || '';
    const actions = (mode.actions || []).slice(0, 4);
    const viewLabel = gardenModesIsHe() ? 'הצג משימות' : 'View tasks';
    const showView = taskType || mode.id === 'overdue-care' || mode.id === 'needs-water' || mode.id === 'pest-risk';

    return `
      <article class="garden-mode-card garden-mode-${variant}" data-mode-id="${escapeHtml(mode.id)}" style="--mode-gradient:${gradient}">
        <div class="garden-mode-visual" aria-hidden="true">
          <span class="garden-mode-icon">${mode.icon || '🌿'}</span>
        </div>
        <div class="garden-mode-body">
          <span class="garden-mode-severity garden-mode-severity-${mode.severity}">${escapeHtml(severityLabel(mode.severity))}</span>
          <h5 class="garden-mode-title">${escapeHtml(t(mode.title))}</h5>
          <p class="garden-mode-subtitle">${escapeHtml(t(mode.subtitle))}</p>
          ${actions.length ? `<ul class="garden-mode-actions">${actions.map(a => `<li>${escapeHtml(t(a))}</li>`).join('')}</ul>` : ''}
          ${showView ? `<button type="button" class="garden-mode-link" onclick="gardenModesViewTasks('${escapeHtml(taskType || mode.id)}')">${escapeHtml(viewLabel)}</button>` : ''}
        </div>
      </article>`;
  }

  const MODE_SCENE_KEY = {
    'healthy': 'thriving',
    'needs-water': 'gentle',
    'overdue-care': 'love',
    'pest-risk': 'gentle',
    'heat-stress': 'gentle',
    'winter-protection': 'ready',
    'pruning-time': 'thriving',
    'fertilizing-time': 'flourishing',
    'blooming-season': 'flourishing',
    'new-garden': 'ready'
  };

  function shouldShowViewTasks(mode) {
    const taskType = (mode.relatedTaskTypes && mode.relatedTaskTypes[0]) || '';
    return taskType || mode.id === 'overdue-care' || mode.id === 'needs-water' || mode.id === 'pest-risk' || mode.id === 'fertilizing-time' || mode.id === 'pruning-time';
  }

  function viewTasksFilterForMode(mode) {
    const taskType = (mode.relatedTaskTypes && mode.relatedTaskTypes[0]) || '';
    return taskType || mode.id;
  }

  function taskMatchesModeType(task, types) {
    const title = taskTitle(task);
    return (types || []).some(function (type) {
      if (type === 'overdue') {
        if (taskIsDone(task)) return false;
        const iso = task && task[4];
        if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
        return iso < new Date().toISOString().slice(0, 10);
      }
      if (type === 'watering') return /water|moisture|irrigation|השק/i.test(title);
      if (type === 'fertilizing') return /fertiliz|feed|nutrient|דיש/i.test(title);
      if (type === 'pruning') return /prun|trim|גיז/i.test(title);
      if (type === 'pest-check' || type === 'pest') return /pest|disease|check|leaf|inspect|מזיק|מחל/i.test(title);
      return matchesTaskType(task, [type]);
    });
  }

  function resolveFocusTaskTitle(primaryMode, uiOpts) {
    uiOpts = uiOpts || {};
    const openTasks = uiOpts.openTasks || [];
    const types = (primaryMode && primaryMode.relatedTaskTypes) || [];
    if (types.length) {
      for (let i = 0; i < openTasks.length; i++) {
        if (taskMatchesModeType(openTasks[i], types)) {
          return String(openTasks[i][1] || '').trim();
        }
      }
    }
    return String(uiOpts.taskTitle || '').trim();
  }

  function applyMoodFocusBar(primaryMode, uiOpts, warningModes) {
    uiOpts = uiOpts || {};
    warningModes = warningModes || [];
    const focusEl = document.getElementById('moodFocusText');
    const labelEl = document.getElementById('moodFocusLabel');
    const icoEl = document.querySelector('.mood-focus-ico');
    const emEl = document.getElementById('moodFocusLink');
    const focusBtn = document.getElementById('moodFocusBtn');

    const resolvedTitle = resolveFocusTaskTitle(primaryMode, uiOpts);
    const hasTask = !!resolvedTitle;
    const topWarning = warningModes[0] || null;
    const tasksMode = topWarning || primaryMode;
    const firstAction = (primaryMode.actions || [])[0];
    let text = hasTask
      ? resolvedTitle.replace(/^(Water|Check|Fertilize|Prune|Review)\s+/, '$1 ')
      : (firstAction ? t(firstAction) : (gardenModesIsHe() ? 'הנאי מהגינה' : 'Enjoy your garden today'));

    if (labelEl) {
      labelEl.textContent = gardenModesIsHe()
        ? (hasTask ? 'מיקוד היום:' : 'הצעד הבא:')
        : (hasTask ? "Today's focus:" : 'Next step:');
    }
    if (focusEl) focusEl.textContent = text;
    if (icoEl) icoEl.textContent = primaryMode.icon || '🌿';

    if (!emEl || !focusBtn) return;

    if (shouldShowViewTasks(tasksMode) || hasTask) {
      emEl.textContent = gardenModesIsHe() ? 'משימות ›' : 'Tasks ›';
      focusBtn.onclick = function (e) {
        e.stopPropagation();
        if (hasTask && typeof global.setTab === 'function') global.setTab('tasks');
        else gardenModesViewTasks(viewTasksFilterForMode(tasksMode));
      };
    } else {
      emEl.textContent = gardenModesIsHe() ? 'פרטים ›' : 'Details ›';
      focusBtn.onclick = function (e) {
        e.stopPropagation();
        if (typeof global.showHealthBreakdown === 'function') global.showHealthBreakdown();
      };
    }
  }

  function renderWarningLine() {
    const host = document.getElementById('gardenModesSecondary');
    if (!host) return;
    host.textContent = '';
    host.hidden = true;
    host.classList.remove('mood-mode-warn', 'hero-mode-warn');
  }

  function setModeHeroImage(card, mode) {
    if (!card || !mode) return;
    const png = mode.image || ('assets/garden-modes/' + mode.id + '.png');
    const img = new Image();
    img.onload = function () { card.style.setProperty('--mode-img', "url('" + png + "')"); };
    img.onerror = function () { card.style.removeProperty('--mode-img'); };
    img.src = png;
  }

  function renderGardenMoodPanel(gardenData, deps, uiOpts) {
    const card = document.getElementById('gardenMoodCard');
    if (!card) return;

    const { primaryMode, warningModes } = deriveGardenModes(gardenData, deps);
    const gradient = MODE_GRADIENTS[primaryMode.id] || MODE_GRADIENTS.healthy;

    card.className = 'mood-scene';
    card.style.setProperty('--mode-gradient', gradient);
    card.dataset.modeId = primaryMode.id;
    setModeHeroImage(card, primaryMode);

    const panel = card.closest('.premium-mood-panel');
    if (panel) panel.classList.add('garden-mode-active');

    const kicker = document.getElementById('moodKicker');
    if (kicker) kicker.textContent = gardenModesIsHe() ? 'מצב הגינה שלך' : 'Your Garden Mode';

    const titleEl = document.getElementById('moodTitle');
    if (titleEl) titleEl.textContent = t(primaryMode.title);

    const microEl = document.getElementById('moodMicro');
    if (microEl) microEl.textContent = t(primaryMode.subtitle);

    renderWarningLine();
    applyMoodFocusBar(primaryMode, uiOpts || {}, warningModes);
  }

  function renderGardenModesSection(gardenData, deps) {
    renderGardenMoodPanel(gardenData, deps);
  }

  function gardenModesViewTasks(filterType) {
    global.gardenModesTaskFilter = filterType || null;
    if (typeof global.setTab === 'function') global.setTab('tasks');
    setTimeout(() => {
      const el = document.getElementById('view-tasks') || document.getElementById('tasks');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  const INTRO_HEADLINES = {
    excellent: {
      en: ['Your garden is blooming beautifully!', 'The garden is loving your care!'],
      he: ['הגינה שלך פורחת ויפה!', 'הגינה אוהבת את הטיפול שלך!']
    },
    needsCare: {
      en: ['A few plants need your attention today', 'Time for some garden love'],
      he: ['כמה צמחים צריכים את תשומת הלב שלך היום', 'זמן לקצת אהבה לגינה']
    },
    critical: {
      en: ['Let\'s get your garden back on track'],
      he: ['בואי נחזיר את הגינה למסלול']
    }
  };

  function pickStableHeadlineVariant(variants, seed) {
    if (!variants || !variants.length) return '';
    let hash = 0;
    const key = String(seed || 'garden');
    for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i) * (i + 3)) % variants.length;
    return variants[hash];
  }

  function getIntroHeadline(gardenData, deps) {
    deps = deps || {};
    const lang = gardenModesIsHe() ? 'he' : 'en';
    const dayKey = deps.todayIso ? deps.todayIso() : '';
    const openCount = Number(deps.companionOpenCount) || 0;
    const overdueCount = Number(deps.companionOverdueCount) || 0;
    const todayCount = Number(deps.todayTaskCount) || 0;
    const attentionPlants = Number(gardenData.attentionPlants) || 0;

    // Headline must match the same companion task list shown in the UI.
    if (openCount === 0) {
      const modes = deriveGardenModes(gardenData, deps);
      const seed = modes.primaryMode && modes.primaryMode.id === 'blooming-season' ? 'blooming-season' : 'healthy';
      return pickStableHeadlineVariant(INTRO_HEADLINES.excellent[lang], seed + dayKey);
    }

    let tier = 'needsCare';
    let seed = 'open-tasks';
    if (overdueCount > 0) {
      tier = 'critical';
      seed = 'overdue-care';
    } else if (todayCount > 0) {
      tier = 'needsCare';
      seed = 'today';
    } else if (attentionPlants > 0) {
      tier = 'needsCare';
      seed = 'attention';
    }

    return pickStableHeadlineVariant(INTRO_HEADLINES[tier][lang], seed + dayKey);
  }

  global.GardenModes = {
    GARDEN_MODES_CONFIG,
    deriveGardenModes,
    collectGardenData,
    renderGardenMoodPanel,
    renderGardenModesSection,
    getCurrentSeason,
    getOverdueTasks,
    getUpcomingTasks,
    hasWateringDue,
    hasPruningDue,
    hasFertilizingDue,
    hasPestWarnings,
    hasHeatRisk,
    hasWinterRisk,
    isGardenHealthy,
    isNewGarden,
    t,
    gardenModesIsHe,
    gardenModesViewTasks,
    getIntroHeadline
  };
  global.gardenModesViewTasks = gardenModesViewTasks;

})(typeof window !== 'undefined' ? window : globalThis);
