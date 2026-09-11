/**
 * Plant Doctor → My Garden Care Loop V1 — host wiring (browser).
 * Applies structured Doctor results onto existing plant mark/status + garden_tasks.
 * Does not invent History persistence or redesign Doctor / My Garden.
 */
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_CARE_LOOP_VERSION,
  PLANT_DOCTOR_IDENTITY,
  PLANT_DOCTOR_MAX_NEW_TASKS_PER_WRITEBACK,
  PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
  PLANT_DOCTOR_RESULT_MESSAGE_TYPE,
  PLANT_DOCTOR_SOURCE,
  buildDoctorCareTaskClientId,
  buildDoctorCareTaskRow,
  buildDoctorResultBridgeMessage,
  buildIdentityBlockedUserMessage,
  enforceDoctorTaskSafetyGuardrail,
  mapDiagnosisToPlantStatePatch,
  normalizeDoctorDiagnosticPayload,
  parseDoctorContextFromSearch,
  resolveDiagnosticWritebackGate,
  resolveOwnedPlantIdentityGate,
  taskClientIdAlreadyPresent
} from './plant-doctor-care-loop-v1-contract.js';

function buildDoctorIframeSrc(context = {}) {
  const base = 'modules/plant-doctor/index.html';
  const q = new URLSearchParams();
  q.set('v', '20260911k');
  if (context.unmatched) q.set('unmatched', '1');
  if (context.gardenProfileId) q.set('gardenId', String(context.gardenProfileId));
  if (context.gardenPlantClientId) q.set('plantClientId', String(context.gardenPlantClientId));
  if (context.gardenPlantServerId) q.set('plantServerId', String(context.gardenPlantServerId));
  if (context.plantDisplayName) q.set('plantName', String(context.plantDisplayName));
  if (context.scientific) q.set('scientific', String(context.scientific));
  if (context.profileSlug) q.set('slug', String(context.profileSlug));
  return `${base}?${q.toString()}`;
}

function findOwnedPlant(data, clientId) {
  const id = String(clientId || '').trim();
  if (!id) return null;
  return (data?.plants || []).find((p) => String(p?.id || '').trim() === id) || null;
}

/**
 * Apply a validated bridge message. Returns { ok, plantUpdated, taskCreated, taskDeduped, moodHooked, reason }.
 * Diagnostic Safety: owned-plant mutations require MATCH + sufficient confidence (same diagnosis payload; no second AI call).
 */
export function applyDoctorCareLoopResult(msg, host) {
  if (!msg || msg.type !== PLANT_DOCTOR_RESULT_MESSAGE_TYPE) {
    return { ok: false, reason: 'ignored_type' };
  }
  if (msg.source !== PLANT_DOCTOR_SOURCE) {
    return { ok: false, reason: 'ignored_source' };
  }
  if (!msg.diagnosis || typeof msg.diagnosis !== 'object') {
    return { ok: false, reason: 'missing_diagnosis' };
  }

  const data = host.getData();
  if (!data) return { ok: false, reason: 'no_data' };

  const unmatched = msg.unmatched === true || !msg.gardenPlantClientId;
  const diagnosis = normalizeDoctorDiagnosticPayload(msg.diagnosis, { unmatched });
  const writebackGate = resolveDiagnosticWritebackGate({
    unmatched,
    gardenPlantClientId: msg.gardenPlantClientId,
    plantDisplayName: msg.plantDisplayName,
    identity: msg.identity,
    diagnosis
  });
  const identityGate = writebackGate.identityGate;

  const writebackBlocked =
    writebackGate.applicable &&
    (!writebackGate.mayMutateOwnedPlant || !writebackGate.mayCreateCareTask) &&
    !unmatched &&
    (msg.action === PLANT_DOCTOR_ACTIONS.APPLY_STATE ||
      msg.action === PLANT_DOCTOR_ACTIONS.CREATE_TASK ||
      msg.action === PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK ||
      !msg.action);

  // Owned path: block any mutation/task/mood when gate denies.
  if (
    writebackGate.applicable &&
    !writebackGate.mayMutateOwnedPlant &&
    !writebackGate.mayCreateCareTask
  ) {
    return {
      ok: true,
      plantUpdated: false,
      taskCreated: false,
      taskDeduped: false,
      moodHooked: false,
      unmatched: false,
      identityBlocked: !!writebackGate.blockedReason?.startsWith('identity_'),
      confidenceBlocked: !!writebackGate.blockedReason?.startsWith('confidence_'),
      identityAssessment: identityGate.assessment,
      diagnosticConfidence: writebackGate.confidence,
      userMessage: writebackGate.userMessage,
      reason: writebackGate.blockedReason,
      providerCallsUsed: 0
    };
  }

  const action = msg.action || PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;
  const wantState =
    (action === PLANT_DOCTOR_ACTIONS.APPLY_STATE ||
      action === PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK) &&
    (unmatched ? false : writebackGate.mayMutateOwnedPlant);
  const wantTask =
    (action === PLANT_DOCTOR_ACTIONS.CREATE_TASK ||
      action === PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK) &&
    (unmatched ? true : writebackGate.mayCreateCareTask);

  let plantUpdated = false;
  let taskCreated = false;
  let taskDeduped = false;
  let taskSafetyBlocked = false;
  let preferredTaskClientId = null;
  const plant = unmatched ? null : findOwnedPlant(data, msg.gardenPlantClientId);
  const tasksBefore = Array.isArray(data.tasks) ? data.tasks.slice() : [];
  const maxNewTasks = wantTask ? PLANT_DOCTOR_MAX_NEW_TASKS_PER_WRITEBACK : 0;

  if (wantState && plant) {
    const patch = mapDiagnosisToPlantStatePatch(diagnosis, {
      plantDisplayName: msg.plantDisplayName || plant.name,
      currentMark: plant.mark,
      currentStatus: plant.status
    });
    plant.mark = patch.mark;
    plant.status = patch.status;
    plantUpdated = true;
    try {
      if (!Array.isArray(data.events)) data.events = [];
      data.events.unshift([
        'Today',
        'Plant Doctor diagnosis',
        `${plant.name} · ${patch.status}`
      ]);
    } catch (_) {
      /* events optional */
    }
  }

  // Session/local mood hook only — not a durable History store.
  let moodHooked = false;
  if (unmatched || writebackGate.mayHookOwnedMood) {
    const moodEntry = {
      source: PLANT_DOCTOR_SOURCE,
      timestamp: msg.timestamp || new Date().toISOString(),
      gardenPlantClientId: unmatched ? null : msg.gardenPlantClientId || null,
      plantDisplayName: msg.plantDisplayName || plant?.name || diagnosis.plant_name || null,
      problem_name: diagnosis.problem_name || diagnosis.likely_diagnosis || null,
      severity: diagnosis.severity || null,
      diagnostic_confidence: diagnosis.diagnostic_confidence || null,
      diagnosis: diagnosis.diagnosis || null,
      identity_assessment: identityGate.applicable ? identityGate.assessment : null,
      unmatched
    };
    if (!Array.isArray(data.plantDoctorResults)) data.plantDoctorResults = [];
    data.plantDoctorResults.unshift(moodEntry);
    data.plantDoctorResults = data.plantDoctorResults.slice(0, 12);
    moodHooked = true;
  }

  if (wantTask) {
    const taskRow = buildDoctorCareTaskRow(diagnosis, {
      gardenPlantClientId: plant?.id || msg.gardenPlantClientId || null,
      gardenPlantServerId: plant?.serverId || msg.gardenPlantServerId || null,
      plantDisplayName: plant?.name || msg.plantDisplayName || null,
      unmatched
    });
    preferredTaskClientId = String(taskRow[8] || taskRow.id || '');
    if (taskClientIdAlreadyPresent(data.tasks, preferredTaskClientId)) {
      taskDeduped = true;
    } else {
      if (!Array.isArray(data.tasks)) data.tasks = [];
      data.tasks.unshift(taskRow);
      taskCreated = true;
    }
  }

  // Health finalize only — never finalizePlantListChange (seasonal plan).
  if (plantUpdated) {
    try {
      if (typeof host.finalizePlantHealthStateChange === 'function') {
        host.finalizePlantHealthStateChange(plant);
      } else {
        try {
          host.saveData?.(data);
        } catch (_) {
          /* ignore */
        }
        try {
          host.render?.();
        } catch (_) {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn('Care loop plant health finalize failed', e);
    }
  } else {
    try {
      host.saveData?.(data);
    } catch (_) {
      /* ignore */
    }
  }

  // Defensive invariant: Doctor path must never create >1 new task.
  const guard = enforceDoctorTaskSafetyGuardrail({
    tasksBefore,
    tasksAfter: Array.isArray(data.tasks) ? data.tasks : [],
    maxNewTasks,
    preferredClientId: preferredTaskClientId
  });
  if (!guard.ok) {
    taskSafetyBlocked = true;
    data.tasks = guard.restoredTasks;
    taskCreated = guard.newTaskCount === 1;
    taskDeduped = false;
    try {
      console.error(
        '[PlantDoctor] TASK_SAFETY_GUARDRAIL: blocked multi-task Doctor mutation',
        {
          abortedExtra: guard.abortedExtra,
          maxNewTasks,
          reason: guard.reason
        }
      );
    } catch (_) {
      /* ignore */
    }
  }

  if ((taskCreated || taskDeduped) && !taskSafetyBlocked) {
    try {
      host.finalizeTaskListChange();
    } catch (e) {
      console.warn('Care loop task finalize failed', e);
    }
  } else if (taskCreated && taskSafetyBlocked) {
    // Kept exactly one Doctor task after rollback — sync that single task only.
    try {
      host.finalizeTaskListChange();
    } catch (e) {
      console.warn('Care loop task finalize failed', e);
    }
  }

  try {
    host.render?.();
  } catch (_) {
    /* ignore */
  }

  return {
    ok: true,
    plantUpdated,
    taskCreated,
    taskDeduped,
    moodHooked,
    unmatched,
    identityBlocked: false,
    confidenceBlocked: false,
    taskSafetyBlocked,
    identityAssessment: identityGate.applicable ? identityGate.assessment : null,
    diagnosticConfidence: writebackGate.confidence,
    reason: taskSafetyBlocked
      ? guard.reason
      : writebackBlocked
        ? writebackGate.blockedReason
        : null,
    providerCallsUsed: 0,
    newTaskCount: Math.max(
      0,
      (Array.isArray(data.tasks) ? data.tasks.length : 0) - tasksBefore.length
    )
  };
}

function installPlantDoctorCareLoopHost() {
  if (window.__cruvitPlantDoctorCareLoopInstalled) return;
  window.__cruvitPlantDoctorCareLoopInstalled = true;

  window.addEventListener('message', (e) => {
    const msg = e?.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type !== PLANT_DOCTOR_RESULT_MESSAGE_TYPE) return;
    try {
      const host = {
        getData: () =>
          (typeof window.getCruvitGardenData === 'function'
            ? window.getCruvitGardenData()
            : window.data) || null,
        saveData: (d) => {
          try {
            window.service?.save?.(d);
          } catch (_) {
            /* ignore */
          }
        },
        finalizePlantListChange: () => window.finalizePlantListChange?.(),
        finalizePlantHealthStateChange: (plant) =>
          window.finalizePlantHealthStateChange?.(plant),
        finalizeTaskListChange: () => window.finalizeTaskListChange?.(),
        render: () => window.render?.()
      };
      const result = applyDoctorCareLoopResult(msg, host);
      if (!result.ok) return;
      if (result.identityBlocked || result.confidenceBlocked) {
        try {
          window.alert?.(
            result.userMessage ||
              'Plant diagnosis could not be applied safely. Garden was not changed.'
          );
        } catch (_) {
          /* ignore */
        }
        // Stay in Plant Doctor so the user can upload clearer evidence.
        return;
      }
      const parts = [];
      if (result.plantUpdated) parts.push('plant status updated');
      if (result.taskCreated) parts.push('care task added');
      else if (result.taskDeduped) parts.push('care task already present');
      if (result.unmatched && !result.plantUpdated) parts.push('general diagnosis (no owned plant changed)');
      try {
        window.closePlantDoctorToGarden?.();
      } catch (_) {
        window.closePlantDoctor?.();
      }
      const summary = parts.length ? parts.join(' · ') : 'diagnosis saved for Garden Mood';
      try {
        window.alert?.(`Plant Doctor → My Garden\n${summary}`);
      } catch (_) {
        /* ignore */
      }
    } catch (err) {
      console.warn('Plant Doctor care loop apply failed', err);
      try {
        window.alert?.(
          'Could not apply diagnosis to My Garden. Plant state was not changed incorrectly — try again.'
        );
      } catch (_) {
        /* ignore */
      }
    }
  });

  window.cruvitPlantDoctorCareLoop = {
    version: PLANT_DOCTOR_CARE_LOOP_VERSION,
    ACTIONS: PLANT_DOCTOR_ACTIONS,
    IDENTITY: PLANT_DOCTOR_IDENTITY,
    PROVIDER_CALLS_PER_DIAGNOSIS: PLANT_DOCTOR_PROVIDER_CALLS_PER_DIAGNOSIS,
    buildDoctorIframeSrc,
    buildDoctorResultBridgeMessage,
    buildDoctorCareTaskClientId,
    buildDoctorCareTaskRow,
    mapDiagnosisToPlantStatePatch,
    normalizeDoctorDiagnosticPayload,
    parseDoctorContextFromSearch,
    resolveOwnedPlantIdentityGate,
    resolveDiagnosticWritebackGate,
    enforceDoctorTaskSafetyGuardrail,
    PLANT_DOCTOR_MAX_NEW_TASKS_PER_WRITEBACK,
    taskClientIdAlreadyPresent,
    applyDoctorCareLoopResult,
    openWithOwnedPlantRecord(plant) {
      if (!plant || typeof plant !== 'object') return false;
      const clientId = String(plant.id || plant.clientId || plant.client_instance_id || '').trim();
      if (!clientId && !String(plant.name || '').trim()) return false;
      const pd = window.cruvitPersonalDomainV0;
      const gardenProfileId =
        (typeof pd?.getActiveGardenId === 'function' && pd.getActiveGardenId()) || null;
      window.openPlantDoctor?.({
        unmatched: false,
        fromGarden: true,
        gardenProfileId,
        gardenPlantClientId: clientId || null,
        gardenPlantServerId: plant.serverId || plant.server_id || null,
        plantDisplayName: plant.name || plant.plantDisplayName || null,
        scientific: plant.scientific || null,
        profileSlug: plant.profileSlug || plant.slug || plant.profile_slug || null
      });
      return true;
    },
    openWithOwnedPlant(plantIndex) {
      const data =
        (typeof window.getCruvitGardenData === 'function'
          ? window.getCruvitGardenData()
          : window.data) || null;
      const plant = data?.plants?.[plantIndex];
      if (!plant) return false;
      return window.cruvitPlantDoctorCareLoop.openWithOwnedPlantRecord(plant);
    },
    openUnmatched(opts = {}) {
      const pd = window.cruvitPersonalDomainV0;
      const gardenProfileId =
        (typeof pd?.getActiveGardenId === 'function' && pd.getActiveGardenId()) || null;
      window.openPlantDoctor?.({
        unmatched: true,
        fromGarden: !!opts.fromGarden,
        gardenProfileId,
        gardenPlantClientId: null,
        gardenPlantServerId: null,
        plantDisplayName: null,
        scientific: null,
        profileSlug: null
      });
      return true;
    }
  };
}

if (typeof window !== 'undefined') {
  installPlantDoctorCareLoopHost();
}

export { buildDoctorIframeSrc, installPlantDoctorCareLoopHost };