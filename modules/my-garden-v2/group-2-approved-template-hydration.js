const JOURNAL_TEMPLATE = Object.freeze({
  screenId: 'garden-journal',
  immutable: Object.freeze([
    'css',
    'background',
    'hero',
    'bottom-navigation',
    'spacing',
    'typography',
    'icons',
    'colors',
  ]),
  mutableSelectors: Object.freeze({
    searchPlaceholder: '.search span',
    scopePrimary: '.filters .filter:nth-child(1) small',
    typePrimary: '.filters .filter:nth-child(2) small',
    plantPrimary: '.filters .filter:nth-child(3) small',
    resultCount: '.result-line span:first-child',
    timelineRoot: 'section.month',
    addNote: '.add-note',
  }),
});

const NOTIFICATIONS_TEMPLATE = Object.freeze({
  screenId: 'notifications',
  immutable: Object.freeze([
    'css',
    'background',
    'hero',
    'bottom-navigation',
    'spacing',
    'typography',
    'icons',
    'colors',
  ]),
  mutableSelectors: Object.freeze({
    attentionCount: '.summary .stat.green b',
    todayCount: '.summary .stat.amber b',
    overdueCount: '.summary .stat.red b',
    attentionChip: '.filters .chip:nth-child(1)',
    todayChip: '.filters .chip:nth-child(2)',
    overdueChip: '.filters .chip:nth-child(3)',
    plantCount: '.plant-filter small',
    shownCount: '.count',
    cardsRoot: '.content',
  }),
});

function requireString(value,code){
  const out=String(value ?? '').trim();
  if(!out) throw new Error(code);
  return out;
}

function freezePatch(selector,value,kind='text'){
  return Object.freeze({
    selector: requireString(selector,'hydration_selector_required'),
    kind,
    value,
  });
}

export function buildGardenJournalHydrationPlan(renderModel){
  if(renderModel?.visualReference?.id!=='garden-journal') {
    throw new Error('garden_journal_render_model_required');
  }

  const patches=[
    freezePatch(JOURNAL_TEMPLATE.mutableSelectors.resultCount,renderModel.resultCount+' entries'),
    freezePatch(
      JOURNAL_TEMPLATE.mutableSelectors.scopePrimary,
      renderModel.scope==='all'
        ? 'Active + archived'
        : renderModel.scope==='active'
          ? 'Active only'
          : 'Archived only'
    ),
    freezePatch(
      JOURNAL_TEMPLATE.mutableSelectors.typePrimary,
      renderModel.eventType==='all' ? 'All activities' : renderModel.eventType
    ),
    freezePatch(
      JOURNAL_TEMPLATE.mutableSelectors.plantPrimary,
      renderModel.plantId ? 'Selected plant' : 'All plants in this scope'
    ),
  ];

  return Object.freeze({
    screenId:JOURNAL_TEMPLATE.screenId,
    immutable:JOURNAL_TEMPLATE.immutable,
    selectors:JOURNAL_TEMPLATE.mutableSelectors,
    patches:Object.freeze(patches),
    entries:Object.freeze(renderModel.rows.map((row)=>Object.freeze({
      eventId:row.eventId,
      plantId:row.plantId,
      title:row.title,
      note:row.note,
      plantName:row.plantName,
      eventType:row.eventType,
      occurredAt:row.occurredAt,
      mediaId:row.mediaId,
    }))),
  });
}

export function buildNotificationsHydrationPlan(renderModel){
  if(renderModel?.visualReference?.id!=='notifications') {
    throw new Error('notifications_render_model_required');
  }

  const c=renderModel.counts;
  const patches=[
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.attentionCount,String(c.attention)),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.todayCount,String(c.today)),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.overdueCount,String(c.overdue)),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.attentionChip,'Needs attention  '+c.attention),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.todayChip,'Due today  '+c.today),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.overdueChip,'Overdue  '+c.overdue),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.plantCount,' · '+c.plants+' plants'),
    freezePatch(NOTIFICATIONS_TEMPLATE.mutableSelectors.shownCount,c.attention+' notifications shown'),
  ];

  return Object.freeze({
    screenId:NOTIFICATIONS_TEMPLATE.screenId,
    immutable:NOTIFICATIONS_TEMPLATE.immutable,
    selectors:NOTIFICATIONS_TEMPLATE.mutableSelectors,
    patches:Object.freeze(patches),
    overdue:Object.freeze(renderModel.overdue.map(taskHydrationRow)),
    dueToday:Object.freeze(renderModel.dueToday.map(taskHydrationRow)),
  });
}

function taskHydrationRow(row){
  return Object.freeze({
    taskId:row.taskId,
    plantId:row.plantId,
    plantName:row.plantName,
    title:row.title,
    dueOn:row.dueOn,
    state:row.state,
    priority:row.priority,
    taskType:row.taskType,
  });
}

export function assertHydrationDoesNotTouchFrozenVisual(plan){
  if(!plan?.screenId) throw new Error('hydration_plan_required');

  const template=
    plan.screenId===JOURNAL_TEMPLATE.screenId
      ? JOURNAL_TEMPLATE
      : plan.screenId===NOTIFICATIONS_TEMPLATE.screenId
        ? NOTIFICATIONS_TEMPLATE
        : null;

  if(!template) throw new Error('unknown_hydration_screen:'+plan.screenId);

  const allowed=new Set(Object.values(template.mutableSelectors));

  for(const patch of plan.patches || []){
    const selector=String(patch.selector || '').trim();
    if(!allowed.has(selector)){
      throw new Error('hydration_selector_not_whitelisted:'+selector);
    }
  }

  return true;
}

export const GROUP2_APPROVED_TEMPLATE_CONTRACT = Object.freeze({
  journal:JOURNAL_TEMPLATE,
  notifications:NOTIFICATIONS_TEMPLATE,
});
