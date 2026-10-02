const JOURNAL_REFERENCE_SHA =
  '39017bb6c981198637e34dd8b2d8faadd7668d8f50a00c2e57c7c7e80749758a';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[char]));
}

function monthLabel(month) {
  if (!month) return 'Unknown date';
  const [year, monthNumber] = String(month).split('-').map(Number);
  if (!year || !monthNumber) return String(month);
  return new Date(Date.UTC(year, monthNumber - 1, 1))
    .toLocaleDateString('en-US', { month:'long', year:'numeric', timeZone:'UTC' });
}

function entryRenderRow(row) {
  return Object.freeze({
    eventId: row.id,
    plantId: row.plantId ?? null,
    taskId: row.taskId ?? null,
    title: row.title ?? row.eventType ?? 'Activity',
    note: row.note ?? null,
    plantName: row.plantName ?? null,
    eventType: row.eventType ?? null,
    occurredAt: row.occurredAt ?? null,
    mediaId: row.mediaId ?? null,
    actions: Object.freeze({
      openPlant: row.plantId
        ? Object.freeze({ action:'open_plant_history', plantId:row.plantId, eventId:row.id })
        : null,
      openEvent: Object.freeze({ action:'open_journal_event', eventId:row.id }),
    }),
  });
}

export function buildApprovedGardenJournalRenderModel(viewModel) {
  if (!viewModel || !Array.isArray(viewModel.rows) || !Array.isArray(viewModel.groups)) {
    throw new Error('garden_journal_view_model_required');
  }

  const seen = new Set();
  const rows = viewModel.rows.map((row) => {
    if (!row?.id) throw new Error('journal_event_id_required');
    if (seen.has(row.id)) throw new Error('duplicate_journal_event:' + row.id);
    seen.add(row.id);
    return entryRenderRow(row);
  });

  const byId = new Map(rows.map((row) => [row.eventId, row]));

  const groups = viewModel.groups.map((group) => Object.freeze({
    month: group.month,
    monthLabel: monthLabel(group.month),
    rows: Object.freeze(
      group.rows.map((row) => {
        const rendered = byId.get(row.id);
        if (!rendered) throw new Error('journal_group_event_missing:' + row.id);
        return rendered;
      })
    ),
  }));

  return Object.freeze({
    query: viewModel.query ?? '',
    plantId: viewModel.plantId ?? null,
    eventType: viewModel.eventType ?? 'all',
    scope: viewModel.scope ?? 'all',
    resultCount: rows.length,
    rows: Object.freeze(rows),
    groups: Object.freeze(groups),
    actions: Object.freeze({
      addNote: Object.freeze({ action:'add_note' }),
      search: Object.freeze({ action:'search_journal' }),
      filterScope: Object.freeze({ action:'filter_journal_scope' }),
      filterType: Object.freeze({ action:'filter_journal_type' }),
      filterPlant: Object.freeze({ action:'filter_journal_plant' }),
    }),
    visualReference: Object.freeze({
      id:'garden-journal',
      locked:true,
      sha256:JOURNAL_REFERENCE_SHA,
    }),
  });
}

export function renderGardenJournalInteractionLayer(renderModel) {
  if (renderModel?.visualReference?.sha256 !== JOURNAL_REFERENCE_SHA) {
    throw new Error('garden_journal_visual_reference_mismatch');
  }

  const eventHits = renderModel.rows.map((row) =>
    '<button type="button" class="journal-runtime-event-hit" ' +
    'data-action="open_journal_event" data-event-id="' + esc(row.eventId) + '"' +
    (row.plantId ? ' data-plant-id="' + esc(row.plantId) + '"' : '') +
    ' aria-label="Open ' + esc(row.title) + '"></button>'
  ).join('');

  return '<div class="garden-journal-runtime-layer" data-result-count="' +
    esc(renderModel.resultCount) + '">' +
    eventHits +
    '<button type="button" class="journal-runtime-add-note" data-action="add_note" aria-label="Add note"></button>' +
    '</div>';
}

export function assertGardenJournalVisualAcceptanceReady(renderModel) {
  if (renderModel?.visualReference?.locked !== true) {
    throw new Error('garden_journal_visual_reference_not_locked');
  }
  if (renderModel.visualReference.sha256 !== JOURNAL_REFERENCE_SHA) {
    throw new Error('garden_journal_visual_reference_fingerprint_mismatch');
  }
  return true;
}

export const GARDEN_JOURNAL_APPROVED_VISUAL = Object.freeze({
  fileName:'CRUVIT-Garden-Journal-UI-2.10-PROPOSAL-v1.html',
  sha256:JOURNAL_REFERENCE_SHA,
});
