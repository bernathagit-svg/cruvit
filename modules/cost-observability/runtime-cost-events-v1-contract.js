/**
 * Runtime cost observability V1 — authoritative event shape for future Owner dashboard.
 * Does NOT expose private Garden content. Does NOT call paid providers.
 */

export const RUNTIME_COST_EVENTS_CONTRACT_VERSION = '1.0.0';

export const COST_TRIGGER_KINDS = Object.freeze(['user', 'background', 'ingestion', 'system']);

/**
 * Build a cost event suitable for runtime_cost_events (no garden content).
 */
export function buildRuntimeCostEvent(input = {}) {
  const provider = String(input.provider || '').trim();
  const feature = String(input.feature || '').trim();
  const operation = String(input.operation || '').trim();
  const triggerKind = String(input.triggerKind || input.trigger_kind || '').trim();
  if (!provider) throw new Error('provider required');
  if (!feature) throw new Error('feature required');
  if (!operation) throw new Error('operation required');
  if (!COST_TRIGGER_KINDS.includes(triggerKind)) {
    throw new Error('triggerKind must be user|background|ingestion|system');
  }

  const metadata =
    input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : {};
  // Strip accidental private payloads if callers pass them.
  delete metadata.gardenContent;
  delete metadata.photoDataUrl;
  delete metadata.plantPhoto;
  delete metadata.doctorNotes;
  delete metadata.privateNotes;

  return {
    occurred_at: input.occurredAt || input.occurred_at || new Date().toISOString(),
    user_id: input.userId || input.user_id || null,
    provider,
    feature,
    operation,
    trigger_kind: triggerKind,
    estimated_cost_usd:
      input.estimatedCostUsd != null ? Number(input.estimatedCostUsd) : null,
    actual_cost_usd: input.actualCostUsd != null ? Number(input.actualCostUsd) : null,
    units: input.units != null ? Number(input.units) : null,
    unit_kind: input.unitKind || input.unit_kind || null,
    success: input.success !== false,
    error_code: input.errorCode || input.error_code || null,
    metadata
  };
}

/** Metric keys the future Owner dashboard must be able to derive. */
export const COST_DASHBOARD_METRIC_KEYS = Object.freeze([
  'active_users',
  'external_api_ai_spend_usd',
  'storage_bytes',
  'egress_bandwidth_bytes',
  'catalog_ingestion_external_cost_usd',
  'image_generation_preparation_cost_usd',
  'variable_cost_per_active_user_usd',
  'all_in_cost_per_active_user_usd',
  'projected_monthly_variable_cost_usd'
]);

/**
 * Aggregate cost events into dashboard-ready rollups (offline/pure).
 * Storage/egress may be supplied separately from infrastructure meters.
 */
export function rollupCostEventsForDashboard(events = [], extras = {}) {
  const list = Array.isArray(events) ? events : [];
  const userIds = new Set();
  let externalSpend = 0;
  let ingestionSpend = 0;
  let imagePrepSpend = 0;

  for (const e of list) {
    if (e?.user_id) userIds.add(String(e.user_id));
    const cost = Number(e?.actual_cost_usd ?? e?.estimated_cost_usd ?? 0) || 0;
    if (e?.trigger_kind === 'ingestion') ingestionSpend += cost;
    if (String(e?.feature || '').includes('image') || String(e?.operation || '').includes('image')) {
      imagePrepSpend += cost;
    }
    if (e?.trigger_kind !== 'system') externalSpend += cost;
  }

  const activeUsers = Number(extras.activeUsers) > 0 ? Number(extras.activeUsers) : userIds.size;
  const storageBytes = Number(extras.storageBytes) || 0;
  const egressBytes = Number(extras.egressBandwidthBytes) || 0;
  const infraAllIn = Number(extras.allInPlatformCostUsd) || externalSpend;

  return {
    contractVersion: RUNTIME_COST_EVENTS_CONTRACT_VERSION,
    active_users: activeUsers,
    external_api_ai_spend_usd: roundMoney(externalSpend),
    storage_bytes: storageBytes,
    egress_bandwidth_bytes: egressBytes,
    catalog_ingestion_external_cost_usd: roundMoney(ingestionSpend),
    image_generation_preparation_cost_usd: roundMoney(imagePrepSpend),
    variable_cost_per_active_user_usd:
      activeUsers > 0 ? roundMoney(externalSpend / activeUsers) : null,
    all_in_cost_per_active_user_usd:
      activeUsers > 0 ? roundMoney(infraAllIn / activeUsers) : null,
    projected_monthly_variable_cost_usd: roundMoney(
      Number(extras.projectedMonthlyVariableCostUsd) || externalSpend
    )
  };
}

function roundMoney(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

/** Owner policy encoded for tests / docs consumers. */
export const OWNER_RUNTIME_COST_POLICY = Object.freeze({
  ordinaryUserRuntimeMustNotTriggerPaidExternalEnrichment: true,
  acquireCreateOnceValidateStoreReuse: true,
  paidExternalCallRequiresExplicitOwnerApproval: true
});
