/**
 * CRUVIT Personal Domain V0 + Location V1 + Plants V1 + Tasks V1 —
 * Supabase Auth + owned Garden Profile(s) + confirmed location + owned plants + owned tasks.
 * Browser-safe anon/publishable key only. Authorization enforced by Postgres RLS.
 * Legacy localStorage is never silently uploaded to the server.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { shouldAcceptGardenProfileRefresh } from './garden-profile-v0-refresh-guard.js';
import {
  buildServerLocationPayload,
  isCompleteServerLocation,
  mayWriteLegacyLocalLocationToServer,
  nullServerLocationPayload,
  resolveActiveGardenId,
  serverLocationToAppPartial,
  shouldAcceptLocationHydration
} from './garden-profile-location-contract.js';
import {
  buildServerPlantPayload,
  mayWriteLegacyLocalPlantsToServer,
  serverPlantToAppPlant,
  shouldAcceptPlantHydration
} from './garden-profile-plants-contract.js';
import {
  buildServerTaskPayload,
  mayWriteLegacyLocalTasksToServer,
  serverTaskToAppTask,
  shouldAcceptTaskHydration
} from './garden-profile-tasks-contract.js';
import {
  onActiveGardenChanged as onSpecificSuitabilityGardenChanged,
  wireSpecificPlantSuitabilityUi
} from './specific-plant-suitability-ui.js';

const AUTH_CONFIG_PATH = '/.netlify/functions/auth-config';
const SESSION_STORAGE_KEY = 'cruvit_pd_v0_active_garden_id';

const GARDEN_SELECT =
  'id,name,created_at,updated_at,user_id,location_label,location_lat,location_lon,location_climate,location_country,location_region,location_timezone,location_source,location_confirmed_at,location_updated_at';

const PLANT_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,name,status,mark,source,profile_slug,scientific,archived,prefs,added_at,created_at,updated_at';

const TASK_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,garden_plant_id,icon,title,when_label,priority,due_on,auto_generated,plant_name,done,created_at,updated_at';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
/** @type {import('@supabase/supabase-js').Session | null} */
let currentSession = null;
/** @type {object[]} */
let ownedGardensCache = [];
let hydrateSeq = 0;
let plantHydrateSeq = 0;
let taskHydrateSeq = 0;
/** @type {boolean} */
let serverPlantsAuthoritative = false;
/** @type {boolean} */
let serverTasksAuthoritative = false;
/** @type {Map<string, string>} client plant id → server plant uuid for active garden */
let plantClientToServerId = new Map();

function setStatus(text, kind) {
  const el = document.getElementById('pdV0Status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('error', 'ok');
  if (kind) el.classList.add(kind);
}

function setSignedOutUi() {
  const signedOut = document.getElementById('pdV0SignedOut');
  const signedIn = document.getElementById('pdV0SignedIn');
  if (signedOut) signedOut.hidden = false;
  if (signedIn) signedIn.hidden = true;
  const chip = document.getElementById('pdV0AccountChip');
  if (chip) chip.textContent = 'Sign in';
}

function setSignedInUi(email) {
  const signedOut = document.getElementById('pdV0SignedOut');
  const signedIn = document.getElementById('pdV0SignedIn');
  const emailEl = document.getElementById('pdV0UserEmail');
  if (signedOut) signedOut.hidden = true;
  if (signedIn) signedIn.hidden = false;
  if (emailEl) emailEl.textContent = email || '';
  const chip = document.getElementById('pdV0AccountChip');
  if (chip) chip.textContent = email ? email.split('@')[0] : 'Account';
}

function getStoredActiveGardenId() {
  try {
    return String(sessionStorage.getItem(SESSION_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function setStoredActiveGardenId(id) {
  try {
    if (id) sessionStorage.setItem(SESSION_STORAGE_KEY, String(id));
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getActiveGardenId() {
  return resolveActiveGardenId(ownedGardensCache, getStoredActiveGardenId());
}

async function fetchAuthConfig() {
  const res = await fetch(AUTH_CONFIG_PATH, { cache: 'no-store' });
  if (!res.ok) throw new Error(`auth-config HTTP ${res.status}`);
  const cfg = await res.json();
  const url = String(cfg?.supabaseUrl || '').trim();
  const anonKey = String(cfg?.supabaseAnonKey || '').trim();
  if (!url || !anonKey) {
    throw new Error('Supabase is not configured for this environment (auth-config missing URL or anon key).');
  }
  return { url, anonKey };
}

function clearAuthenticatedHydratedLocation() {
  // Session end / sign-out path: restore legacy snapshot; never persist default wipe.
  if (typeof window.releaseAuthenticatedLocationHydration === 'function') {
    window.releaseAuthenticatedLocationHydration();
    return;
  }
  if (typeof window.resetAppLocationToUntrustedDefault === 'function') {
    window.resetAppLocationToUntrustedDefault();
  }
}

function clearAuthenticatedHydratedPlants() {
  serverPlantsAuthoritative = false;
  plantClientToServerId = new Map();
  if (typeof window.releaseAuthenticatedPlantsHydration === 'function') {
    window.releaseAuthenticatedPlantsHydration();
    return;
  }
}

function clearAuthenticatedHydratedTasks() {
  serverTasksAuthoritative = false;
  if (typeof window.releaseAuthenticatedTasksHydration === 'function') {
    window.releaseAuthenticatedTasksHydration();
    return;
  }
}

function suspendHydrationForGardenWithoutServerLocation() {
  // Still signed in, active garden has no confirmed server location:
  // untrust in-memory only; keep pre-hydrate localStorage snapshot for sign-out.
  if (typeof window.suspendAuthenticatedLocationHydrationInMemory === 'function') {
    window.suspendAuthenticatedLocationHydrationInMemory();
    return;
  }
  clearAuthenticatedHydratedLocation();
}

function suspendAuthenticatedPlantsInMemory() {
  serverPlantsAuthoritative = false;
  plantClientToServerId = new Map();
  if (typeof window.suspendAuthenticatedPlantsHydrationInMemory === 'function') {
    window.suspendAuthenticatedPlantsHydrationInMemory();
  }
}

function suspendAuthenticatedTasksInMemory() {
  serverTasksAuthoritative = false;
  if (typeof window.suspendAuthenticatedTasksHydrationInMemory === 'function') {
    window.suspendAuthenticatedTasksHydrationInMemory();
  }
}

function captureLocalSnapshotIfNeeded() {
  if (typeof window.captureLocalGardenLocationSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenLocationSnapshotBeforeAuthHydrate();
  }
  if (typeof window.captureLocalGardenPlantsSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenPlantsSnapshotBeforeAuthHydrate();
  }
  if (typeof window.captureLocalGardenTasksSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenTasksSnapshotBeforeAuthHydrate();
  }
}

async function ensureClient() {
  if (supabase) return supabase;
  const { url, anonKey } = await fetchAuthConfig();
  supabase = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    if (session?.user) {
      setSignedInUi(session.user.email || session.user.id);
      // Capture anonymous/local location before any server hydrate overwrites working cache.
      captureLocalSnapshotIfNeeded();
      refreshOwnedGardenProfiles().catch((err) => {
        setStatus(err.message || 'Could not load garden profiles.', 'error');
      });
    } else {
      ownedGardensCache = [];
      setStoredActiveGardenId('');
      setSignedOutUi();
      renderGardenProfileList([]);
      clearAuthenticatedHydratedLocation();
      clearAuthenticatedHydratedPlants();
      clearAuthenticatedHydratedTasks();
    }
  });
  return supabase;
}

async function restoreSession() {
  const client = await ensureClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  currentSession = data.session;
  if (data.session?.user) {
    setSignedInUi(data.session.user.email || data.session.user.id);
    captureLocalSnapshotIfNeeded();
    await refreshOwnedGardenProfiles();
  } else {
    ownedGardensCache = [];
    setSignedOutUi();
    renderGardenProfileList([]);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatLocationSummary(row) {
  if (!isCompleteServerLocation(row)) return 'No confirmed server location';
  const bits = [row.location_label, row.location_climate].filter(Boolean);
  return bits.join(' · ');
}

function hasLegacyTrustedLocalLocation() {
  try {
    return typeof window.hasTrustedAppLocation === 'function' && window.hasTrustedAppLocation() === true;
  } catch {
    return false;
  }
}

function hasLegacyLocalPlants() {
  try {
    if (typeof window.hasPreAuthPlantsSnapshot === 'function') {
      return window.hasPreAuthPlantsSnapshot() === true;
    }
    return false;
  } catch {
    return false;
  }
}

function renderGardenProfileList(rows) {
  const list = document.getElementById('pdV0GardenList');
  const importPanel = document.getElementById('pdV0LegacyImport');
  const plantImportPanel = document.getElementById('pdV0LegacyPlantImport');
  const taskImportPanel = document.getElementById('pdV0LegacyTaskImport');
  if (!list) return;
  const activeId = getActiveGardenId();
  if (!rows?.length) {
    list.innerHTML = '<li class="pd-v0-chip">No server Garden Profiles yet.</li>';
    if (importPanel) importPanel.hidden = true;
    if (plantImportPanel) plantImportPanel.hidden = true;
    return;
  }
  list.innerHTML = rows
    .map((row) => {
      const name = escapeHtml(row.name || 'Garden');
      const id = escapeHtml(row.id || '');
      const loc = escapeHtml(formatLocationSummary(row));
      const isActive = activeId && String(row.id) === String(activeId);
      const openLabel = isActive ? 'Active' : 'Open Garden';
      const openDisabled = isActive ? 'disabled' : '';
      return `<li>
        <strong>${name}</strong>${isActive ? ' <span class="pd-v0-chip">active</span>' : ''}<br>
        <span class="pd-v0-chip">${id}</span><br>
        <small>${loc}</small><br>
        <button type="button" class="pd-v0-btn light pd-v0-btn-sm" data-pd-open-garden="${id}" ${openDisabled}>${openLabel}</button>
      </li>`;
    })
    .join('');

  list.querySelectorAll('[data-pd-open-garden]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pd-open-garden');
      selectActiveGarden(id).catch((err) => setStatus(err.message || 'Could not open garden.', 'error'));
    });
  });

  if (importPanel) {
    const active = rows.find((r) => activeId && String(r.id) === String(activeId));
    const showImport =
      !!active && !isCompleteServerLocation(active) && hasLegacyTrustedLocalLocation();
    importPanel.hidden = !showImport;
  }
  if (plantImportPanel) {
    const active = rows.find((r) => activeId && String(r.id) === String(activeId));
    // Show when an active garden exists and browser still has legacy local plants to import.
    plantImportPanel.hidden = !(active && hasLegacyLocalPlants());
  }
  if (taskImportPanel) {
    const active = rows.find((r) => activeId && String(r.id) === String(activeId));
    taskImportPanel.hidden = !(active && hasLegacyLocalTasks());
  }
}

function hasLegacyLocalTasks() {
  try {
    if (typeof window.hasPreAuthTasksSnapshot === 'function') {
      return window.hasPreAuthTasksSnapshot() === true;
    }
    if (typeof window.getActiveMyGardenTasksForSync === 'function') {
      const tasks = window.getActiveMyGardenTasksForSync();
      return Array.isArray(tasks) && tasks.length > 0 && !serverTasksAuthoritative;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function listPlantsForGarden(gardenProfileId) {
  if (!supabase || !currentSession?.user) return [];
  const gardenId = String(gardenProfileId || '').trim();
  if (!gardenId) return [];
  const { data, error } = await supabase
    .from('garden_plants')
    .select(PLANT_SELECT)
    .eq('garden_profile_id', gardenId)
    .order('added_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function hydrateActiveGardenPlants(gardenRow) {
  const requestUserId = currentSession?.user?.id;
  const requestGardenId = gardenRow?.id;
  const seq = ++plantHydrateSeq;
  if (!requestGardenId) {
    suspendAuthenticatedPlantsInMemory();
    return false;
  }
  if (
    !shouldAcceptPlantHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    return false;
  }
  if (typeof window.captureLocalGardenPlantsSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenPlantsSnapshotBeforeAuthHydrate();
  }
  const rows = await listPlantsForGarden(requestGardenId);
  if (seq !== plantHydrateSeq) return false;
  if (
    !shouldAcceptPlantHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    return false;
  }
  const plants = rows.map(serverPlantToAppPlant).filter(Boolean);
  plantClientToServerId = new Map();
  rows.forEach((r) => {
    const cid = String(r.client_instance_id || '').trim();
    if (cid && r.id) plantClientToServerId.set(cid, r.id);
  });
  if (typeof window.applyAuthenticatedGardenPlants === 'function') {
    window.applyAuthenticatedGardenPlants(plants, { authoritative: true });
  }
  serverPlantsAuthoritative = true;
  return true;
}

async function listTasksForGarden(gardenProfileId) {
  if (!supabase || !currentSession?.user) return [];
  const gardenId = String(gardenProfileId || '').trim();
  if (!gardenId) return [];
  const { data, error } = await supabase
    .from('garden_tasks')
    .select(TASK_SELECT)
    .eq('garden_profile_id', gardenId)
    .order('due_on', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function resolveGardenPlantIdForTask(task) {
  if (task?.gardenPlantId || task?.garden_plant_id) {
    return String(task.gardenPlantId || task.garden_plant_id).trim() || null;
  }
  const plantName = String(Array.isArray(task) ? task[6] || '' : task?.plantName || '').trim();
  if (!plantName || plantName.startsWith('__weather:')) return null;
  try {
    const plants =
      typeof window.getActiveMyGardenPlantsForSync === 'function'
        ? window.getActiveMyGardenPlantsForSync()
        : [];
    const match = (plants || []).find(
      (p) => String(p?.name || '').trim().toLowerCase() === plantName.toLowerCase()
    );
    if (!match) return null;
    if (match.serverId) return String(match.serverId);
    const cid = String(match.id || '').trim();
    if (cid && plantClientToServerId.has(cid)) return plantClientToServerId.get(cid);
  } catch {
    /* ignore */
  }
  return null;
}

async function hydrateActiveGardenTasks(gardenRow) {
  const requestUserId = currentSession?.user?.id;
  const requestGardenId = gardenRow?.id;
  const seq = ++taskHydrateSeq;
  if (!requestGardenId) {
    suspendAuthenticatedTasksInMemory();
    return false;
  }
  if (
    !shouldAcceptTaskHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    return false;
  }
  if (typeof window.captureLocalGardenTasksSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenTasksSnapshotBeforeAuthHydrate();
  }
  const rows = await listTasksForGarden(requestGardenId);
  if (seq !== taskHydrateSeq) return false;
  if (
    !shouldAcceptTaskHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    return false;
  }
  const tasks = rows.map(serverTaskToAppTask).filter(Boolean);
  if (typeof window.applyAuthenticatedGardenTasks === 'function') {
    window.applyAuthenticatedGardenTasks(tasks, { authoritative: true });
  }
  serverTasksAuthoritative = true;
  return true;
}

async function hydrateActiveGardenLocation(gardenRow) {
  const requestUserId = currentSession?.user?.id;
  const requestGardenId = gardenRow?.id;
  const seq = ++hydrateSeq;
  if (!isCompleteServerLocation(gardenRow)) {
    suspendHydrationForGardenWithoutServerLocation();
    return false;
  }
  if (
    !shouldAcceptLocationHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    return false;
  }
  const partial = serverLocationToAppPartial(gardenRow);
  if (!partial || typeof window.setAppLocation !== 'function') return false;
  // Preserve anonymous/local gardenLocation before server hydrate overwrites working cache.
  if (typeof window.captureLocalGardenLocationSnapshotBeforeAuthHydrate === 'function') {
    window.captureLocalGardenLocationSnapshotBeforeAuthHydrate();
  }
  await window.setAppLocation(partial);
  if (seq !== hydrateSeq) return false;
  if (
    !shouldAcceptLocationHydration(
      requestUserId,
      requestGardenId,
      currentSession,
      getActiveGardenId()
    )
  ) {
    // setAppLocation may have written server location into local working cache —
    // restore pre-hydrate snapshot so prior user's server location does not remain.
    clearAuthenticatedHydratedLocation();
    return false;
  }
  return true;
}

async function refreshOwnedGardenProfiles() {
  if (!supabase || !currentSession?.user) {
    ownedGardensCache = [];
    renderGardenProfileList([]);
    return [];
  }
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .select(GARDEN_SELECT)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!shouldAcceptGardenProfileRefresh(requestUserId, currentSession)) {
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  ownedGardensCache = rows;

  const activeId = resolveActiveGardenId(rows, getStoredActiveGardenId());
  if (rows.length === 1) {
    setStoredActiveGardenId(rows[0].id);
  } else if (!activeId) {
    // Multiple gardens and no valid explicit selection: do not guess.
    setStoredActiveGardenId(getStoredActiveGardenId());
  } else {
    setStoredActiveGardenId(activeId);
  }

  renderGardenProfileList(rows);

  const resolvedActive = getActiveGardenId();
  if (resolvedActive) {
    const garden = rows.find((r) => String(r.id) === String(resolvedActive));
    if (garden) {
      await hydrateActiveGardenLocation(garden);
      await hydrateActiveGardenPlants(garden);
      await hydrateActiveGardenTasks(garden);
    }
  } else if (rows.length !== 1) {
    // No active garden (0 gardens, or many with no explicit selection):
    // untrust in-memory only — do NOT release/consume the pre-auth local snapshot.
    suspendHydrationForGardenWithoutServerLocation();
    suspendAuthenticatedPlantsInMemory();
    suspendAuthenticatedTasksInMemory();
  }
  return rows;
}

async function selectActiveGarden(gardenId) {
  const id = String(gardenId || '').trim();
  const row = ownedGardensCache.find((r) => String(r.id) === id);
  if (!row) throw new Error('Garden not found in your owned profiles.');
  setStoredActiveGardenId(id);
  renderGardenProfileList(ownedGardensCache);
  const okLoc = await hydrateActiveGardenLocation(row);
  const okPlants = await hydrateActiveGardenPlants(row);
  const okTasks = await hydrateActiveGardenTasks(row);
  setStatus(
    okLoc || okPlants || okTasks
      ? `Opened garden "${row.name}" and hydrated server garden data.`
      : `Opened garden "${row.name}". No confirmed server location yet.`,
    'ok'
  );
  try {
    onSpecificSuitabilityGardenChanged();
  } catch {
    /* suitability UI optional */
  }
  return row;
}

async function signInWithPassword() {
  setStatus('Signing in…');
  const email = String(document.getElementById('pdV0Email')?.value || '').trim();
  const password = String(document.getElementById('pdV0Password')?.value || '');
  if (!email || !password) {
    setStatus('Email and password are required.', 'error');
    return;
  }
  const client = await ensureClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(error.message || 'Sign in failed.', 'error');
    return;
  }
  currentSession = data.session;
  setSignedInUi(data.user?.email || data.user?.id || email);
  setStatus('Signed in. Loading your Garden Profiles…', 'ok');
  captureLocalSnapshotIfNeeded();
  await refreshOwnedGardenProfiles();
}

async function signUpWithPassword() {
  setStatus('Creating account…');
  const email = String(document.getElementById('pdV0Email')?.value || '').trim();
  const password = String(document.getElementById('pdV0Password')?.value || '');
  if (!email || !password) {
    setStatus('Email and password are required.', 'error');
    return;
  }
  const client = await ensureClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    setStatus(error.message || 'Sign up failed.', 'error');
    return;
  }
  if (!data.session) {
    setStatus('Account created. Confirm email if required, then sign in.', 'ok');
    return;
  }
  currentSession = data.session;
  setSignedInUi(data.user?.email || email);
  setStatus('Signed up and signed in.', 'ok');
  captureLocalSnapshotIfNeeded();
  await refreshOwnedGardenProfiles();
}

async function signOut() {
  hydrateSeq += 1;
  plantHydrateSeq += 1;
  taskHydrateSeq += 1;
  // Restore pre-auth local location/plants/tasks once; do not clear snapshot before release.
  clearAuthenticatedHydratedLocation();
  clearAuthenticatedHydratedPlants();
  clearAuthenticatedHydratedTasks();
  ownedGardensCache = [];
  setStoredActiveGardenId('');
  if (!supabase) {
    setSignedOutUi();
    renderGardenProfileList([]);
    setStatus('Signed out.', 'ok');
    return;
  }
  await supabase.auth.signOut();
  currentSession = null;
  setSignedOutUi();
  renderGardenProfileList([]);
  setStatus('Signed out.', 'ok');
}

async function createGardenProfile() {
  if (!supabase || !currentSession?.user) {
    setStatus('Sign in to create a Garden Profile.', 'error');
    return;
  }
  const name = String(document.getElementById('pdV0GardenName')?.value || '').trim() || 'My Garden';
  setStatus('Creating Garden Profile…');
  const { data, error } = await supabase
    .from('garden_profiles')
    .insert({ user_id: currentSession.user.id, name })
    .select(GARDEN_SELECT)
    .single();
  if (error) {
    setStatus(error.message || 'Create failed.', 'error');
    return;
  }
  if (data?.id) setStoredActiveGardenId(data.id);
  setStatus(`Created Garden Profile "${data.name}".`, 'ok');
  await refreshOwnedGardenProfiles();
}

async function renameFirstOwnedGardenProfile() {
  if (!supabase || !currentSession?.user) {
    setStatus('Sign in first.', 'error');
    return;
  }
  const rows = await refreshOwnedGardenProfiles();
  if (!rows.length) {
    setStatus('Create a Garden Profile first.', 'error');
    return;
  }
  const activeId = getActiveGardenId();
  const target = (activeId && rows.find((r) => String(r.id) === String(activeId))) || rows[0];
  const nextName = String(document.getElementById('pdV0GardenName')?.value || '').trim();
  if (!nextName) {
    setStatus('Enter a new name to update.', 'error');
    return;
  }
  const { error } = await supabase
    .from('garden_profiles')
    .update({ name: nextName })
    .eq('id', target.id)
    .select('id')
    .single();
  if (error) {
    setStatus(error.message || 'Update failed.', 'error');
    return;
  }
  setStatus('Updated your Garden Profile name.', 'ok');
  await refreshOwnedGardenProfiles();
}

function requireActiveOwnedGardenId() {
  if (!supabase || !currentSession?.user) {
    throw new Error('Sign in to manage Garden plants.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    throw new Error('Select an owned Garden Profile before managing plants.');
  }
  return gardenId;
}

async function upsertPlantOnActiveGarden(plant) {
  const gardenId = requireActiveOwnedGardenId();
  const payload = buildServerPlantPayload(plant);
  const row = {
    ...payload,
    garden_profile_id: gardenId,
    user_id: currentSession.user.id
  };
  const { data, error } = await supabase
    .from('garden_plants')
    .upsert(row, { onConflict: 'garden_profile_id,client_instance_id' })
    .select(PLANT_SELECT)
    .single();
  if (error) throw error;
  serverPlantsAuthoritative = true;
  return data;
}

async function deletePlantOnActiveGarden(clientInstanceId) {
  const gardenId = requireActiveOwnedGardenId();
  const id = String(clientInstanceId || '').trim();
  if (!id) throw new Error('client_instance_id is required');
  const { error } = await supabase
    .from('garden_plants')
    .delete()
    .eq('garden_profile_id', gardenId)
    .eq('client_instance_id', id);
  if (error) throw error;
  return true;
}

async function syncActiveGardenPlantsFromLocal(plantsInput) {
  const gardenId = requireActiveOwnedGardenId();
  const localPlants = Array.isArray(plantsInput)
    ? plantsInput
    : typeof window.getActiveMyGardenPlantsForSync === 'function'
      ? window.getActiveMyGardenPlantsForSync()
      : [];
  const serverRows = await listPlantsForGarden(gardenId);
  const localIds = new Set();
  const saved = [];
  for (const plant of localPlants) {
    const payload = buildServerPlantPayload(plant);
    localIds.add(payload.client_instance_id);
    const { data, error } = await supabase
      .from('garden_plants')
      .upsert(
        {
          ...payload,
          garden_profile_id: gardenId,
          user_id: currentSession.user.id
        },
        { onConflict: 'garden_profile_id,client_instance_id' }
      )
      .select(PLANT_SELECT)
      .single();
    if (error) throw error;
    saved.push(data);
  }
  const stale = serverRows.filter((r) => !localIds.has(String(r.client_instance_id || '')));
  for (const row of stale) {
    const { error } = await supabase.from('garden_plants').delete().eq('id', row.id);
    if (error) throw error;
  }
  serverPlantsAuthoritative = true;
  plantClientToServerId = new Map();
  saved.forEach((r) => {
    const cid = String(r.client_instance_id || '').trim();
    if (cid && r.id) plantClientToServerId.set(cid, r.id);
  });
  return saved;
}

async function importLegacyLocalPlantsToActiveGarden(explicitUserConfirm) {
  if (!mayWriteLegacyLocalPlantsToServer(explicitUserConfirm)) {
    throw new Error('Legacy local plants import requires explicit user confirmation.');
  }
  requireActiveOwnedGardenId();
  const plants =
    typeof window.getLegacyLocalGardenPlantsSnapshot === 'function'
      ? window.getLegacyLocalGardenPlantsSnapshot()
      : typeof window.getActiveMyGardenPlantsForSync === 'function'
        ? window.getActiveMyGardenPlantsForSync()
        : [];
  if (!Array.isArray(plants) || !plants.length) {
    throw new Error('No local plants available to import.');
  }
  const saved = await syncActiveGardenPlantsFromLocal(plants);
  await hydrateActiveGardenPlants({ id: getActiveGardenId() });
  setStatus(`Imported ${saved.length} local plant(s) into this Garden.`, 'ok');
  renderGardenProfileList(ownedGardensCache);
  return saved;
}

function isServerPlantsAuthoritative() {
  return serverPlantsAuthoritative === true && !!currentSession?.user && !!getActiveGardenId();
}

function isServerTasksAuthoritative() {
  return serverTasksAuthoritative === true && !!currentSession?.user && !!getActiveGardenId();
}

async function upsertTaskOnActiveGarden(task) {
  const gardenId = requireActiveOwnedGardenId();
  const gardenPlantId = resolveGardenPlantIdForTask(task);
  const payload = buildServerTaskPayload(task, { gardenPlantId });
  const row = {
    ...payload,
    garden_profile_id: gardenId,
    user_id: currentSession.user.id
  };
  const { data, error } = await supabase
    .from('garden_tasks')
    .upsert(row, { onConflict: 'garden_profile_id,client_instance_id' })
    .select(TASK_SELECT)
    .single();
  if (error) throw error;
  serverTasksAuthoritative = true;
  return data;
}

async function deleteTaskOnActiveGarden(clientInstanceId) {
  const gardenId = requireActiveOwnedGardenId();
  const id = String(clientInstanceId || '').trim();
  if (!id) throw new Error('client_instance_id is required');
  const { error } = await supabase
    .from('garden_tasks')
    .delete()
    .eq('garden_profile_id', gardenId)
    .eq('client_instance_id', id);
  if (error) throw error;
  return true;
}

async function syncActiveGardenTasksFromLocal(tasksInput) {
  const gardenId = requireActiveOwnedGardenId();
  const localTasks = Array.isArray(tasksInput)
    ? tasksInput
    : typeof window.getActiveMyGardenTasksForSync === 'function'
      ? window.getActiveMyGardenTasksForSync()
      : [];
  // Refresh plant id map so plant FK resolution stays current.
  try {
    const plantRows = await listPlantsForGarden(gardenId);
    plantClientToServerId = new Map();
    plantRows.forEach((r) => {
      const cid = String(r.client_instance_id || '').trim();
      if (cid && r.id) plantClientToServerId.set(cid, r.id);
    });
  } catch {
    /* plant map optional for weather / name-only tasks */
  }
  const serverRows = await listTasksForGarden(gardenId);
  const localIds = new Set();
  const saved = [];
  for (const task of localTasks) {
    const gardenPlantId = resolveGardenPlantIdForTask(task);
    const payload = buildServerTaskPayload(task, { gardenPlantId });
    localIds.add(payload.client_instance_id);
    const { data, error } = await supabase
      .from('garden_tasks')
      .upsert(
        {
          ...payload,
          garden_profile_id: gardenId,
          user_id: currentSession.user.id
        },
        { onConflict: 'garden_profile_id,client_instance_id' }
      )
      .select(TASK_SELECT)
      .single();
    if (error) throw error;
    saved.push(data);
  }
  const stale = serverRows.filter((r) => !localIds.has(String(r.client_instance_id || '')));
  for (const row of stale) {
    const { error } = await supabase.from('garden_tasks').delete().eq('id', row.id);
    if (error) throw error;
  }
  serverTasksAuthoritative = true;
  return saved;
}

async function importLegacyLocalTasksToActiveGarden(explicitUserConfirm) {
  if (!mayWriteLegacyLocalTasksToServer(explicitUserConfirm)) {
    throw new Error('Legacy local tasks import requires explicit user confirmation.');
  }
  requireActiveOwnedGardenId();
  const tasks =
    typeof window.getLegacyLocalGardenTasksSnapshot === 'function'
      ? window.getLegacyLocalGardenTasksSnapshot()
      : typeof window.getActiveMyGardenTasksForSync === 'function'
        ? window.getActiveMyGardenTasksForSync()
        : [];
  if (!Array.isArray(tasks) || !tasks.length) {
    throw new Error('No local tasks available to import.');
  }
  const saved = await syncActiveGardenTasksFromLocal(tasks);
  await hydrateActiveGardenTasks({ id: getActiveGardenId() });
  setStatus(`Imported ${saved.length} local task(s) into this Garden.`, 'ok');
  renderGardenProfileList(ownedGardensCache);
  return saved;
}

async function saveConfirmedLocationToActiveGarden(locationInput) {
  if (!supabase || !currentSession?.user) {
    throw new Error('Sign in to save Garden location.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    throw new Error('Select an owned Garden Profile before saving location.');
  }
  const payload = buildServerLocationPayload(locationInput);
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .update(payload)
    .eq('id', gardenId)
    .select(GARDEN_SELECT)
    .single();
  if (error) throw error;
  if (!shouldAcceptGardenProfileRefresh(requestUserId, currentSession)) return null;
  await refreshOwnedGardenProfiles();
  return data;
}

async function clearLocationOnActiveGarden() {
  if (!supabase || !currentSession?.user) {
    throw new Error('Sign in to clear Garden location.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    throw new Error('Select an owned Garden Profile first.');
  }
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .update(nullServerLocationPayload())
    .eq('id', gardenId)
    .select(GARDEN_SELECT)
    .single();
  if (error) throw error;
  if (!shouldAcceptGardenProfileRefresh(requestUserId, currentSession)) return null;
  clearAuthenticatedHydratedLocation();
  await refreshOwnedGardenProfiles();
  return data;
}

/**
 * Explicit legacy import only — never called automatically on sign-in.
 */
async function importLegacyTrustedLocationToActiveGarden(explicitConfirm) {
  if (!mayWriteLegacyLocalLocationToServer(explicitConfirm)) {
    throw new Error('Legacy local location import requires explicit user confirmation.');
  }
  if (typeof window.getAppLocation !== 'function' || typeof window.hasTrustedAppLocation !== 'function') {
    throw new Error('App location APIs unavailable.');
  }
  if (!window.hasTrustedAppLocation()) {
    throw new Error('No trusted local location available to import.');
  }
  const loc = window.getAppLocation();
  const source = String(loc.source || '').trim();
  if (source === 'default') {
    throw new Error('Default location cannot be imported as server-owned Garden location.');
  }
  const saved = await saveConfirmedLocationToActiveGarden({
    label: loc.label,
    climate: loc.broadClimateLabel || loc.derivedClimateProfile?.climateLabel,
    lat: loc.lat,
    lon: loc.lon,
    country: loc.country,
    region: loc.region,
    timezone: loc.timezone,
    source: source === 'geolocation' ? 'geolocation' : 'manual'
  });
  setStatus('Imported local location into this Garden (explicit confirm).', 'ok');
  return saved;
}

async function saveCurrentAppLocationToActiveGarden() {
  if (typeof window.getAppLocation !== 'function' || typeof window.hasTrustedAppLocation !== 'function') {
    throw new Error('App location APIs unavailable.');
  }
  if (!window.hasTrustedAppLocation()) {
    throw new Error('Confirm a trusted garden location in the location settings first.');
  }
  captureLocalSnapshotIfNeeded();
  const loc = window.getAppLocation();
  const source = String(loc.source || '').trim();
  if (source === 'default') {
    throw new Error('Default location cannot become server-owned Garden location.');
  }
  const saved = await saveConfirmedLocationToActiveGarden({
    label: loc.label,
    climate: loc.broadClimateLabel || loc.derivedClimateProfile?.climateLabel,
    lat: loc.lat,
    lon: loc.lon,
    country: loc.country,
    region: loc.region,
    timezone: loc.timezone,
    source: source === 'geolocation' ? 'geolocation' : 'manual'
  });
  setStatus('Saved confirmed location to this Garden Profile.', 'ok');
  return saved;
}

function openPersonalDomainModal() {
  document.getElementById('pdV0Modal')?.classList.add('open');
  restoreSession().catch((err) => setStatus(err.message || 'Could not initialize auth.', 'error'));
}

function closePersonalDomainModal() {
  document.getElementById('pdV0Modal')?.classList.remove('open');
}

function wirePersonalDomainUi() {
  document.getElementById('pdV0Modal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'pdV0Modal') closePersonalDomainModal();
  });
  document.getElementById('pdV0ImportLegacyLocationBtn')?.addEventListener('click', () => {
    importLegacyTrustedLocationToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Import failed.', 'error');
    });
  });
  document.getElementById('pdV0ImportLegacyPlantsBtn')?.addEventListener('click', () => {
    importLegacyLocalPlantsToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Plant import failed.', 'error');
    });
  });
  document.getElementById('pdV0ImportLegacyTasksBtn')?.addEventListener('click', () => {
    importLegacyLocalTasksToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Task import failed.', 'error');
    });
  });
  document.getElementById('pdV0SaveAppLocationBtn')?.addEventListener('click', () => {
    saveCurrentAppLocationToActiveGarden().catch((err) => {
      setStatus(err.message || 'Save location failed.', 'error');
    });
  });
  document.getElementById('pdV0ClearGardenLocationBtn')?.addEventListener('click', () => {
    clearLocationOnActiveGarden()
      .then(() => setStatus('Cleared server location on this Garden.', 'ok'))
      .catch((err) => setStatus(err.message || 'Clear failed.', 'error'));
  });
  wireSpecificPlantSuitabilityUi();
}

export async function initPersonalDomainV0() {
  wirePersonalDomainUi();
  try {
    await restoreSession();
  } catch (err) {
    setStatus(err.message || 'Personal domain auth unavailable.', 'error');
  }
}

window.cruvitPersonalDomainV0 = {
  open: openPersonalDomainModal,
  close: closePersonalDomainModal,
  signIn: signInWithPassword,
  signUp: signUpWithPassword,
  signOut,
  createGardenProfile,
  renameFirstOwnedGardenProfile,
  refreshOwnedGardenProfiles,
  selectActiveGarden,
  getActiveGardenId,
  saveConfirmedLocationToActiveGarden,
  clearLocationOnActiveGarden,
  saveCurrentAppLocationToActiveGarden,
  importLegacyTrustedLocationToActiveGarden,
  upsertPlantOnActiveGarden,
  deletePlantOnActiveGarden,
  syncActiveGardenPlantsFromLocal,
  importLegacyLocalPlantsToActiveGarden,
  listPlantsForActiveGarden: async () => listPlantsForGarden(getActiveGardenId()),
  hydrateActiveGardenPlants: async () => {
    const id = getActiveGardenId();
    const garden = ownedGardensCache.find((r) => String(r.id) === String(id));
    if (!garden) return false;
    return hydrateActiveGardenPlants(garden);
  },
  isServerPlantsAuthoritative,
  upsertTaskOnActiveGarden,
  deleteTaskOnActiveGarden,
  syncActiveGardenTasksFromLocal,
  importLegacyLocalTasksToActiveGarden,
  listTasksForActiveGarden: async () => listTasksForGarden(getActiveGardenId()),
  hydrateActiveGardenTasks: async () => {
    const id = getActiveGardenId();
    const garden = ownedGardensCache.find((r) => String(r.id) === String(id));
    if (!garden) return false;
    return hydrateActiveGardenTasks(garden);
  },
  isServerTasksAuthoritative,
  getSupabaseClient: () => supabase,
  getSession: () => currentSession,
  getOwnedGardensCache: () => ownedGardensCache.slice()
};

initPersonalDomainV0();
