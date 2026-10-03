const FILTER_LABELS = Object.freeze({
  to_do: 'To do',
  completed: 'Completed',
  all: 'All',
});

const TASK_META = Object.freeze({
  water: { icon: 'drop', tone: 'blue' },
  watering: { icon: 'drop', tone: 'blue' },
  prune: { icon: 'scissors', tone: 'sage' },
  pruning: { icon: 'scissors', tone: 'sage' },
  fertilize: { icon: 'sprout', tone: 'sage' },
  fertilizing: { icon: 'sprout', tone: 'sage' },
  feed: { icon: 'sprout', tone: 'sage' },
  harvest: { icon: 'leaf', tone: 'lime' },
  inspect: { icon: 'search', tone: 'cream' },
  check: { icon: 'search', tone: 'cream' },
  health: { icon: 'search', tone: 'cream' },
});

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function taskMeta(row) {
  const key = String(row?.taskType || row?.title || '').toLowerCase();
  const found = Object.entries(TASK_META).find(([needle]) => key.includes(needle));
  return found ? found[1] : { icon: 'leaf', tone: 'sage' };
}

function icon(name) {
  const paths = {
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18"/>',
    plus: '<path d="M12 3v18M3 12h18"/>',
    sliders: '<path d="M4 6h10m4 0h2M4 12h3m4 0h9M4 18h8m4 0h4"/><circle cx="16" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="14" cy="18" r="2"/>',
    drop: '<path d="M12 2S6 9 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 10 10M8 16 18 6"/>',
    sprout: '<path d="M12 21v-9M12 13c-5 0-8-3-8-7 5 0 8 3 8 7Zm0 3c5 0 8-3 8-7-5 0-8 3-8 7Z"/>',
    leaf: '<path d="M20 3C10 3 5 7 5 14c0 4 3 7 7 7 6 0 9-8 8-18Z"/><path d="M5 21c3-7 7-11 12-15"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    home: '<path d="m3 11 9-8 9 8v10h-6v-6H9v6H3Z"/>',
    garden: '<path d="M12 21v-9M12 14C7 14 4 11 4 6c5 0 8 3 8 8Zm0 2c5 0 8-3 8-8-5 0-8 3-8 8Z"/>',
    design: '<path d="M12 21v-9M12 14C7 14 4 11 4 6c5 0 8 3 8 8Zm0 2c5 0 8-3 8-8-5 0-8 3-8 8Z"/>',
    shop: '<path d="M3 5h3l2 10h10l2-7H7M10 20h.01M18 20h.01"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    back: '<path d="m15 5-7 7 7 7"/>',
    camera: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m8 6 1.5-3h5L16 6"/><circle cx="12" cy="13" r="4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.leaf}</svg>`;
}

function formatDueLabel(date, selectedDate) {
  if (!date) return 'Date not set';
  const current = new Date(date + 'T00:00:00Z');
  const selected = selectedDate ? new Date(selectedDate + 'T00:00:00Z') : null;
  const delta = selected ? Math.round((current - selected) / 86400000) : null;
  if (delta === 0) return 'Today · ' + current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (delta === 1) return 'Tomorrow · ' + current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function taskVisual(row, plantVisuals) {
  const url = plantVisuals?.[row.plantId] || null;
  if (url) return `<img src="${esc(url)}" alt="" draggable="false">`;
  const initial = esc((row.plantName || '?').slice(0, 1).toUpperCase());
  return `<span class="upcoming-thumb-fallback" aria-hidden="true">${initial}</span>`;
}

function taskRow(row, { plantVisuals = {}, selectedDate = null, compact = false } = {}) {
  const meta = taskMeta(row);
  return `<article class="upcoming-task ${compact ? 'is-compact' : ''}" data-task-id="${esc(row.id)}" data-plant-id="${esc(row.plantId)}">
    <div class="upcoming-thumb">${taskVisual(row, plantVisuals)}</div>
    <span class="upcoming-task-icon tone-${meta.tone}">${icon(meta.icon)}</span>
    <div class="upcoming-task-copy">
      <strong>${esc(row.title || 'Task')}</strong>
      <span>${esc(row.plantName || 'Plant')}</span>
      ${compact ? '' : `<small>${esc(formatDueLabel(row.dueOn, selectedDate))}</small>`}
    </div>
    <span class="upcoming-row-chevron">${icon('chevron')}</span>
  </article>`;
}

function statusFilters(vm) {
  const entries = [
    ['to_do', vm.counts.toDo],
    ['completed', vm.counts.completed],
    ['all', vm.counts.all],
  ];
  return `<div class="upcoming-status-filters" role="group" aria-label="Task status">
    ${entries.map(([key, count]) => `<button type="button" data-upcoming-filter="${key}" class="${vm.filter === key ? 'is-active' : ''}">${FILTER_LABELS[key]} <b>${count}</b></button>`).join('')}
  </div>`;
}

function viewSwitch(active) {
  const calendar = active === 'calendar';
  return `<div class="upcoming-view-row ${calendar ? 'is-calendar-row' : 'is-list-row'}">
    <div class="upcoming-view-switch" role="tablist" aria-label="Upcoming view">
      <button type="button" data-upcoming-view="list" role="tab" aria-selected="${active === 'list'}" class="${active === 'list' ? 'is-active' : ''}">${icon('list')}<span>List</span></button>
      <button type="button" data-upcoming-view="calendar" role="tab" aria-selected="${active === 'calendar'}" class="${active === 'calendar' ? 'is-active' : ''}">${icon('calendar')}<span>Calendar</span></button>
    </div>
    <button type="button" class="upcoming-add-task ${calendar ? 'is-pill' : 'is-orb'}" data-upcoming-action="add-task">${icon('plus')}<span>Add task</span></button>
  </div>`;
}

function bottomNav() {
  return `<nav class="upcoming-bottom-nav" aria-label="Main navigation">
    <button type="button">${icon('home')}<small>Home</small></button>
    <button type="button" class="is-active">${icon('garden')}<small>My Garden</small></button>
    <button type="button" class="upcoming-nav-add" aria-label="Add Plant">${icon('plus')}</button>
    <button type="button">${icon('design')}<small>Design</small></button>
    <button type="button">${icon('shop')}<small>Shop</small></button>
  </nav>`;
}

function shell(content, activeView) {
  const calendar = activeView === 'calendar';
  return `<section class="upcoming-screen" data-upcoming-screen="${activeView}">
    <div class="upcoming-hero-bg" aria-hidden="true"></div>
    <header class="upcoming-topbar">
      <div class="upcoming-top-left">${calendar ? `<button type="button" class="upcoming-back" data-upcoming-action="back" aria-label="Back">${icon('back')}</button>` : ''}</div>
      <strong>My Garden</strong>
      <div class="upcoming-top-icons">
        <button type="button" aria-label="Garden camera">${icon('camera')}</button>
        <button type="button" class="upcoming-bell" aria-label="Notifications">${icon('bell')}<i aria-hidden="true"></i></button>
      </div>
    </header>
    <div class="upcoming-copy">
      <h1>Upcoming</h1>
      <p class="upcoming-kicker">Small steps for a thriving garden.</p>
      ${calendar ? '' : '<p class="upcoming-dek">Tasks across all your active plants.</p>'}
    </div>
    ${content}
    ${bottomNav()}
  </section>`;
}

export function renderUpcomingListScreen(viewModel, {
  plantVisuals = {},
  activePlantCount = null,
  selectedDate = null,
} = {}) {
  if (!viewModel?.counts || !Array.isArray(viewModel.rows)) {
    throw new Error('upcoming_list_view_model_required');
  }

  const rows = viewModel.rows.map((row) => taskRow(row, { plantVisuals, selectedDate })).join('');
  const content = `
    <main class="upcoming-main">
      ${viewSwitch('list')}
      <div class="upcoming-list-controls">
        ${statusFilters(viewModel)}
        <button type="button" class="upcoming-review-filter" data-upcoming-action="filters" aria-label="More filters">${icon('sliders')}</button>
      </div>
      <section class="upcoming-list-section">
        <h2>This week</h2>
        <div class="upcoming-task-list">${rows || '<p class="upcoming-empty">No tasks in this view.</p>'}</div>
      </section>
    </main>`;

  return shell(content, 'list');
}

function daysForMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthIndex = monthNumber - 1;
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const previousDays = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const cells = [];
  for (let i = first.getUTCDay() - 1; i >= 0; i--) {
    const day = previousDays - i;
    const d = new Date(Date.UTC(year, monthIndex - 1, day));
    cells.push({ date: d.toISOString().slice(0, 10), day, outside: true });
  }
  for (let day = 1; day <= days; day++) {
    const d = new Date(Date.UTC(year, monthIndex, day));
    cells.push({ date: d.toISOString().slice(0, 10), day, outside: false });
  }
  const needed = Math.ceil(cells.length / 7) * 7;
  while (cells.length < needed) {
    const day = cells.length - (first.getUTCDay() - 1) - days + 1;
    const d = new Date(Date.UTC(year, monthIndex + 1, day));
    cells.push({ date: d.toISOString().slice(0, 10), day, outside: true });
  }
  return cells;
}

function taskDot(row) {
  const tone = taskMeta(row).tone;
  return `<i class="upcoming-dot tone-${tone}" aria-hidden="true"></i>`;
}

function calendarGrid(vm) {
  const cells = daysForMonth(vm.selectedMonth);
  return `<div class="upcoming-calendar-grid" role="grid" aria-label="${esc(vm.selectedMonth)}">
    ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => `<span class="upcoming-weekday">${d}</span>`).join('')}
    ${cells.map((cell) => {
      const rows = vm.byDate.get(cell.date) || [];
      return `<button type="button" role="gridcell" data-upcoming-date="${cell.date}" class="upcoming-day ${cell.outside ? 'is-outside' : ''} ${cell.date === vm.selectedDate ? 'is-selected' : ''}" aria-selected="${cell.date === vm.selectedDate}">
        <span>${cell.day}</span>
        <span class="upcoming-dots">${rows.slice(0, 3).map(taskDot).join('')}</span>
      </button>`;
    }).join('')}
  </div>`;
}

export function renderUpcomingCalendarScreen(viewModel, {
  plantVisuals = {},
  activePlantCount = null,
} = {}) {
  if (!viewModel?.counts || !viewModel?.byDate || !Array.isArray(viewModel.selectedDayRows)) {
    throw new Error('upcoming_calendar_view_model_required');
  }

  const [year, monthNumber] = viewModel.selectedMonth.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(year, monthNumber - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const selectedLabel = new Date(viewModel.selectedDate + 'T00:00:00Z')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const selectedRows = viewModel.selectedDayRows
    .map((row) => taskRow(row, { plantVisuals, selectedDate: viewModel.selectedDate, compact: true }))
    .join('');

  const content = `
    <main class="upcoming-main is-calendar">
      ${viewSwitch('calendar')}
      <section class="upcoming-calendar-card">
        <header class="upcoming-month-head"><button type="button" data-upcoming-month="prev">${icon('back')}</button><h2>${esc(monthLabel)}</h2><button type="button" data-upcoming-month="next">${icon('chevron')}</button></header>
        ${calendarGrid(viewModel)}
      </section>
      <section class="upcoming-selected-day">
        <header><span><strong>${viewModel.selectedDate === '2026-10-02' ? 'Today' : esc(selectedLabel)}</strong><small>${esc(selectedLabel)}</small></span><b>${viewModel.selectedDayRows.length} task${viewModel.selectedDayRows.length === 1 ? '' : 's'} ›</b></header>
        <div class="upcoming-selected-list">${selectedRows || '<p class="upcoming-empty">No tasks on this day.</p>'}</div>
      </section>
    </main>`;

  return shell(content, 'calendar');
}

export const UPCOMING_APPROVED_VISUAL = Object.freeze({
  list: Object.freeze({
    fileName: 'Upcoming-List-NEW-APPROVED-LOCKED-2026-10-02.png',
    sha256: '03cca6920c02e4ec191f9dc1d8cfa197a4c1913a6da9b31af9e1a3b2385d7430',
  }),
  calendar: Object.freeze({
    fileName: 'Upcoming-Calendar-NEW-APPROVED-LOCKED-2026-10-02.png',
    sha256: '322b3ef6c07203be8c5547930bd0a95ce2e79fb8824d01f7b1319f012212b4db',
  }),
});
