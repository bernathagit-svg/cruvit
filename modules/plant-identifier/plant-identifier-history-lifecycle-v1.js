export const IDENTIFIER_HISTORY_CONTEXT_EVENT = 'cruvit:garden-context-ready';

export function installIdentifierHistoryReconciliationLifecycle({
  eventTarget = globalThis.window,
  reconcile = null,
  eventName = IDENTIFIER_HISTORY_CONTEXT_EVENT,
} = {}) {
  if (!eventTarget || typeof eventTarget.addEventListener !== 'function') {
    return Object.freeze({ installed: false, reason: 'event-target-unavailable' });
  }

  const run =
    typeof reconcile === 'function'
      ? reconcile
      : async () => {
          const bridge = globalThis.CruvitPlantIdentifierMyGardenWriteBridge || null;
          if (!bridge || typeof bridge.reconcilePendingIdentifierHistory !== 'function') {
            return { ok: false, reason: 'bridge-unavailable' };
          }
          return bridge.reconcilePendingIdentifierHistory();
        };

  let inFlight = null;

  const onReady = () => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve()
      .then(run)
      .catch((error) => ({
        ok: false,
        reason: 'history-reconciliation-failed',
        message: error?.message || 'History reconciliation failed.',
      }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  eventTarget.addEventListener(eventName, onReady);

  return Object.freeze({
    installed: true,
    eventName,
    dispose() {
      eventTarget.removeEventListener?.(eventName, onReady);
    },
  });
}

if (typeof window !== 'undefined') {
  installIdentifierHistoryReconciliationLifecycle();
}
