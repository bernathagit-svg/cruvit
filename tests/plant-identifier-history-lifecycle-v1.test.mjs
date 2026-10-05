import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTIFIER_HISTORY_CONTEXT_EVENT,
  installIdentifierHistoryReconciliationLifecycle,
} from '../modules/plant-identifier/plant-identifier-history-lifecycle-v1.js';

class FakeWindow extends EventTarget {
  dispatch(name) {
    this.dispatchEvent(new Event(name));
  }
}

test('reload may fire load before session is ready; reconciliation waits for Garden Context Ready', async () => {
  const fakeWindow = new FakeWindow();
  let ready = false;
  let runs = 0;

  const lifecycle = installIdentifierHistoryReconciliationLifecycle({
    eventTarget: fakeWindow,
    reconcile: async () => {
      runs += 1;
      assert.equal(ready, true);
      return { ok: true };
    },
  });

  assert.equal(lifecycle.installed, true);

  // Browser load occurs first. No reconciliation should run.
  fakeWindow.dispatch('load');
  await Promise.resolve();
  assert.equal(runs, 0);

  // Session restore + garden hydration completes later.
  ready = true;
  fakeWindow.dispatch(IDENTIFIER_HISTORY_CONTEXT_EVENT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runs, 1);

  lifecycle.dispose();
});

test('active garden changes trigger idempotent reconciliation again', async () => {
  const fakeWindow = new FakeWindow();
  let runs = 0;
  const lifecycle = installIdentifierHistoryReconciliationLifecycle({
    eventTarget: fakeWindow,
    reconcile: async () => {
      runs += 1;
      return { ok: true };
    },
  });

  fakeWindow.dispatch(IDENTIFIER_HISTORY_CONTEXT_EVENT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fakeWindow.dispatch(IDENTIFIER_HISTORY_CONTEXT_EVENT);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(runs, 2);
  lifecycle.dispose();
});
