/**
 * Functional Garden Dashboard V1 — browser UI (read-only compose + render).
 * Never generates tasks or garden_events on load/render.
 */
import {
  buildGardenDashboardReadModel,
  GARDEN_DASHBOARD_V1_VERSION
} from './garden-dashboard-v1-contract.js';
import { serverPlantToAppPlant } from './garden-profile-plants-contract.js';
import { serverTaskToAppTask } from './garden-profile-tasks-contract.js';

const PANEL_ID = 'gardenOsDashboardV1';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function healthLabel(bucket) {
  if (bucket === 'needs_attention') return 'Needs attention';
  if (bucket === 'monitoring') return 'Monitoring';
  if (bucket === 'healthy') return 'No current issue';
  return 'Unknown';
}

function renderSection(title, bodyHtml, empty) {
  return `<section class="gdash-section"><h4 class="gdash-h">${escapeHtml(title)}</h4>${
    empty ? `<p class="gdash-empty">${escapeHtml(empty)}</p>` : bodyHtml
  }</section>`;
}

export function renderGardenDashboardHtml(model) {
  if (!model) return '';
  if (model.loading) {
    return `<div class="gdash-panel" id="${PANEL_ID}"><p class="gdash-empty">Loading garden overview…</p></div>`;
  }

  const s = model.summary || {};
  const climateLine = [s.locationLabel, s.climate].filter(Boolean).join(' · ');
  const weather =
    s.weatherSummary && (s.weatherSummary.tempC != null || s.weatherSummary.summary)
      ? ` · ${s.weatherSummary.tempC != null ? `${Math.round(s.weatherSummary.tempC)}°C` : ''}${
          s.weatherSummary.summary ? ` ${s.weatherSummary.summary}` : ''
        }`.trim()
      : '';

  const summaryHtml = `<div class="gdash-summary">
    <b>${escapeHtml(s.name || 'Your garden')}</b>
    <span class="gdash-state">${escapeHtml(s.stateLabel || '')}</span>
    <span>${escapeHtml(climateLine || 'Location not set yet')}${escapeHtml(weather)}</span>
    <span>${Number(s.plantCount) || 0} plant${(s.plantCount || 0) === 1 ? '' : 's'}</span>
  </div>`;

  let todayBody = '';
  if (model.today?.rest) {
    todayBody = '';
  } else {
    todayBody = `<ul class="gdash-list">${(model.today?.actions || [])
      .map((a) => {
        const plants =
          a.kind === 'group' && a.plantNames?.length
            ? `<small>${escapeHtml(a.plantNames.join(', '))}</small>`
            : '';
        return `<li><b>${escapeHtml(a.title || 'Care')}</b>${plants}</li>`;
      })
      .join('')}</ul>`;
  }

  const attentionPlants = (model.plantHealth?.plants || []).filter(
    (p) => p.healthBucket === 'needs_attention' || p.healthBucket === 'monitoring'
  );
  const attentionBody = attentionPlants.length
    ? `<ul class="gdash-list">${attentionPlants
        .map(
          (p) =>
            `<li><b>${escapeHtml(p.name)}</b> <span class="gdash-badge gdash-${escapeHtml(
              p.healthBucket || 'unknown'
            )}">${escapeHtml(healthLabel(p.healthBucket))}</span><small>${escapeHtml(
              p.status || ''
            )}</small></li>`
        )
        .join('')}</ul>`
    : '';

  const plantBody = `<ul class="gdash-list">${(model.plantHealth?.plants || [])
    .slice(0, 12)
    .map(
      (p) =>
        `<li><b>${escapeHtml(p.name)}</b> <span class="gdash-badge gdash-${escapeHtml(
          p.healthBucket || 'unknown'
        )}">${escapeHtml(healthLabel(p.healthBucket))}</span><small>${escapeHtml(
          p.status || ''
        )}</small></li>`
    )
    .join('')}</ul>`;

  const fuBody = `<ul class="gdash-list">${(model.followUps?.items || [])
    .map(
      (f) =>
        `<li><b>${escapeHtml(f.title)}</b>${
          f.plantName ? `<small>${escapeHtml(f.plantName)}</small>` : ''
        }<span class="gdash-cta">${escapeHtml(f.cta || '')}</span></li>`
    )
    .join('')}</ul>`;

  const activityBody = `<ul class="gdash-list">${(model.recentActivity?.items || [])
    .map(
      (a) =>
        `<li><b>${escapeHtml(a.label)}</b><small>${escapeHtml(a.detail || '')}${
          a.occurredAt ? ` · ${escapeHtml(formatWhen(a.occurredAt))}` : ''
        }</small></li>`
    )
    .join('')}</ul>`;

  const learnBody = `<ul class="gdash-list">${(model.learning?.signals || [])
    .map(
      (sig) =>
        `<li class="gdash-learn-${escapeHtml(sig.tone)}">${escapeHtml(sig.text)}</li>`
    )
    .join('')}</ul>`;

  const errBits = [];
  if (model.errors?.events) errBits.push('Recent activity may be incomplete.');
  if (model.errors?.tasks) errBits.push('Tasks may be incomplete.');
  if (model.errors?.plants) errBits.push('Plant list may be incomplete.');
  const errHtml = errBits.length
    ? `<p class="gdash-warn">${escapeHtml(errBits.join(' '))}</p>`
    : '';

  return `<div class="gdash-panel" id="${PANEL_ID}" data-gdash-version="${escapeHtml(
    model.version || GARDEN_DASHBOARD_V1_VERSION
  )}">
  <div class="gdash-head"><h3>Garden overview</h3><small>Functional Garden OS · read-only</small></div>
  ${errHtml}
  ${renderSection('Garden summary', summaryHtml)}
  ${renderSection(
    'Today',
    todayBody,
    model.today?.rest ? model.today.restMessage : null
  )}
  ${renderSection(
    'Needs attention',
    attentionBody,
    model.plantHealth?.empty
      ? 'No plants in this garden yet.'
      : attentionPlants.length
        ? null
        : 'No plants need attention right now.'
  )}
  ${
    !model.plantHealth?.empty
      ? renderSection(
          'My plants (full garden)',
          `<p class="gdash-empty" style="margin:0 0 6px">All owned plants in this garden.</p>${plantBody}`
        )
      : ''
  }
  ${renderSection(
    'Follow-ups',
    fuBody,
    model.followUps?.empty ? 'No care follow-ups waiting right now.' : null
  )}
  ${renderSection(
    'Recent activity',
    activityBody,
    model.recentActivity?.empty ? 'No garden history recorded yet.' : null
  )}
  ${renderSection(
    'What CRUVIT learned',
    learnBody,
    model.learning?.empty ? model.learning.emptyMessage : null
  )}
</div>`;
}

/**
 * Fetch + compose dashboard for the active owned garden.
 * Partial failures are soft — core summary still renders when possible.
 * Never writes tasks/events.
 */
export async function loadGardenDashboardReadModel(options = {}) {
  const pd = window.cruvitPersonalDomainV0;
  if (!pd || typeof pd.getSession !== 'function' || !pd.getSession()?.user) {
    return null;
  }
  const gardenId = pd.getActiveGardenId?.();
  if (!gardenId) return null;

  const gardens = typeof pd.getOwnedGardensCache === 'function' ? pd.getOwnedGardensCache() : [];
  const garden = (gardens || []).find((g) => String(g.id) === String(gardenId)) || {
    id: gardenId,
    name: 'Your garden'
  };

  const errors = {};
  let plantRows = [];
  let taskRows = [];
  let eventRows = [];

  try {
    plantRows =
      typeof pd.listPlantsForActiveGarden === 'function'
        ? await pd.listPlantsForActiveGarden()
        : [];
  } catch (e) {
    errors.plants = true;
    console.warn('[GardenDashboard] plants fetch failed', e?.message || e);
  }

  try {
    taskRows =
      typeof pd.listTasksForActiveGarden === 'function'
        ? await pd.listTasksForActiveGarden()
        : [];
  } catch (e) {
    errors.tasks = true;
    console.warn('[GardenDashboard] tasks fetch failed', e?.message || e);
  }

  try {
    eventRows =
      typeof pd.listGardenEventsForActiveGarden === 'function'
        ? await pd.listGardenEventsForActiveGarden({ limit: 40 })
        : [];
  } catch (e) {
    errors.events = true;
    console.warn('[GardenDashboard] events fetch failed', e?.message || e);
  }

  const plants = (plantRows || [])
    .map((row) => {
      // Server row → app plant; keep server uuid for event joins
      if (row.client_instance_id) {
        const app = serverPlantToAppPlant(row);
        if (app && row.id) app.serverId = row.id;
        return app;
      }
      return row;
    })
    .filter(Boolean);

  const tasks = (taskRows || [])
    .map((row) => {
      if (row.client_instance_id || row.title) {
        const app = serverTaskToAppTask(row);
        return app || row;
      }
      return row;
    })
    .filter(Boolean);

  let weather = null;
  try {
    if (typeof window.getCruvitDashboardWeather === 'function') {
      weather = window.getCruvitDashboardWeather();
    } else if (window.data?.weather) {
      weather = window.data.weather;
    }
  } catch (_) {}

  return buildGardenDashboardReadModel({
    garden,
    plants,
    tasks,
    events: eventRows,
    weather,
    todayIso: options.todayIso || todayIso(),
    errors,
    loading: false
  });
}

let lastRenderToken = 0;

export async function refreshGardenDashboardV1() {
  const host = document.getElementById(PANEL_ID) || document.getElementById('gardenOsDashboardHost');
  if (!host) return null;
  const token = ++lastRenderToken;
  const pd = window.cruvitPersonalDomainV0;
  if (!pd?.getSession?.()?.user) {
    host.innerHTML = '';
    host.hidden = true;
    return null;
  }
  host.hidden = false;
  host.innerHTML = renderGardenDashboardHtml({ loading: true });
  try {
    const model = await loadGardenDashboardReadModel();
    if (token !== lastRenderToken) return null;
    if (!model) {
      host.innerHTML = '';
      host.hidden = true;
      return null;
    }
    host.innerHTML = renderGardenDashboardHtml(model);
    return model;
  } catch (e) {
    console.warn('[GardenDashboard] render failed', e?.message || e);
    if (token === lastRenderToken) {
      host.innerHTML = `<div class="gdash-panel"><p class="gdash-warn">Garden overview is temporarily unavailable.</p></div>`;
    }
    return null;
  }
}

window.cruvitGardenDashboardV1 = Object.freeze({
  version: GARDEN_DASHBOARD_V1_VERSION,
  buildGardenDashboardReadModel,
  loadGardenDashboardReadModel,
  refresh: refreshGardenDashboardV1,
  renderHtml: renderGardenDashboardHtml
});

function boot() {
  if (!document.getElementById('gardenOsDashboardHost')) return;
  // Defer until personal domain session may be ready
  setTimeout(() => {
    refreshGardenDashboardV1().catch(() => {});
  }, 800);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshGardenDashboardV1().catch(() => {});
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
