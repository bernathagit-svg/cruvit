/**
 * Plant Doctor → My Garden Care Loop V1 — host wiring (browser).
 * Applies structured Doctor results onto existing plant mark/status + garden_tasks.
 * Does not invent History persistence or redesign Doctor / My Garden.
 */
import {
  PLANT_DOCTOR_ACTIONS,
  PLANT_DOCTOR_CARE_LOOP_VERSION,
  PLANT_DOCTOR_RESULT_MESSAGE_TYPE,
  PLANT_DOCTOR_SOURCE,
  buildDoctorCareTaskClientId,
  buildDoctorCareTaskRow,
  buildDoctorResultBridgeMessage,
  mapDiagnosisToPlantStatePatch,
  parseDoctorContextFromSearch,
  taskClientIdAlreadyPresent
} from './plant-doctor-care-loop-v1-contract.js';

function buildDoctorIframeSrc(context = {}) {
  const base = 'modules/plant-doctor/index.html';
  const q = new URLSearchParams();
  q.set('v', '20260911d');
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
 */
export function applyDoctorCareLoopResult(msg, host) {
  if (!msg || msg.type !== PLANT_DOCTOR_RESULT_MESSAGE_TYPE) {
    return { ok: false, reason: 'ignored_type' };
  }
  if (msg.source !== PLANT_DOCTOR_SOURCE) {
    return { ok: false, reason: 'ignored_source' };
  }
  const diagnosis = msg.diagnosis;
  if (!diagnosis || typeof diagnosis !== 'object') {
    return { ok: false, reason: 'missing_diagnosis' };
  }

  const data = host.getData();
  if (!data) return { ok: false, reason: 'no_data' };

  const unmatched = msg.unmatched === true || !msg.gardenPlantClientId;
  const action = msg.action || PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;
  const wantState =
    action === PLANT_DOCTOR_ACTIONS.APPLY_STATE ||
    action === PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;
  const wantTask =
    action === PLANT_DOCTOR_ACTIONS.CREATE_TASK ||
    action === PLANT_DOCTOR_ACTIONS.APPLY_AND_TASK;

  let plantUpdated = false;
  let taskCreated = false;
  let taskDeduped = false;
  const plant = unmatched ? null : findOwnedPlant(data, msg.gardenPlantClientId);

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
  const moodEntry = {
    source: PLANT_DOCTOR_SOURCE,
    timestamp: msg.timestamp || new Date().toISOString(),
    gardenPlantClientId: msg.gardenPlantClientId || null,
    plantDisplayName: msg.plantDisplayName || plant?.name || diagnosis.plant_name || null,
    problem_name: diagnosis.problem_name || null,
    severity: diagnosis.severity || null,
    diagnosis: diagnosis.diagnosis || null,
    unmatched
  };
  if (!Array.isArray(data.plantDoctorResults)) data.plantDoctorResults = [];
  data.plantDoctorResults.unshift(moodEntry);
  data.plantDoctorResults = data.plantDoctorResults.slice(0, 12);

  if (wantTask) {
    if (unmatched) {
      // Unmatched path: no owned-plant mutation; still allow an explicit care task
      // without garden_plant_id when the user asked for apply_and_task from unmatched UI.
      // Bound: do not attach to unrelated plants.
    }
    const taskRow = buildDoctorCareTaskRow(diagnosis, {
      gardenPlantClientId: plant?.id || msg.gardenPlantClientId || null,
      gardenPlantServerId: plant?.serverId || msg.gardenPlantServerId || null,
      plantDisplayName: plant?.name || msg.plantDisplayName || null,
      unmatched
    });
    const clientId = String(taskRow[8] || taskRow.id || '');
    if (taskClientIdAlreadyPresent(data.tasks, clientId)) {
      taskDeduped = true;
    } else {
      if (!Array.isArray(data.tasks)) data.tasks = [];
      data.tasks.unshift(taskRow);
      taskCreated = true;
    }
  }

  if (plantUpdated) {
    try {
      host.finalizePlantListChange();
    } catch (e) {
      console.warn('Care loop plant finalize failed', e);
    }
  } else {
    try {
      host.saveData?.(data);
    } catch (_) {
      /* ignore */
    }
  }

  if (taskCreated || taskDeduped) {
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
    moodHooked: true,
    unmatched,
    reason: null
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
        finalizeTaskListChange: () => window.finalizeTaskListChange?.(),
        render: () => window.render?.()
      };
      const result = applyDoctorCareLoopResult(msg, host);
      if (!result.ok) return;
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
    buildDoctorIframeSrc,
    buildDoctorResultBridgeMessage,
    buildDoctorCareTaskClientId,
    buildDoctorCareTaskRow,
    mapDiagnosisToPlantStatePatch,
    parseDoctorContextFromSearch,
    taskClientIdAlreadyPresent,
    applyDoctorCareLoopResult,
    openWithOwnedPlant(plantIndex) {
      const data =
        (typeof window.getCruvitGardenData === 'function'
          ? window.getCruvitGardenData()
          : window.data) || null;
      const plant = data?.plants?.[plantIndex];
      if (!plant) return false;
      const pd = window.cruvitPersonalDomainV0;
      const gardenProfileId =
        (typeof pd?.getActiveGardenId === 'function' && pd.getActiveGardenId()) || null;
      window.openPlantDoctor?.({
        unmatched: false,
        fromGarden: true,
        gardenProfileId,
        gardenPlantClientId: plant.id || null,
        gardenPlantServerId: plant.serverId || null,
        plantDisplayName: plant.name || null,
        scientific: plant.scientific || null,
        profileSlug: plant.profileSlug || plant.slug || null
      });
      return true;
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