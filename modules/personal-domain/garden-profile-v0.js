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
  buildPlantAddedMemoryInput,
  buildPlantArchivedMemoryInput,
  buildTaskCompletedMemoryInput,
  buildTaskOutcomeReportedMemoryInput,
  buildFollowupRequestedMemoryInput,
  writeGardenMemoryEvent
} from './garden-memory-writer-v1.js';
import {
  buildClosedLoopOutcomeMemoryBundle,
  decideCareOutcomeFollowUp
} from './garden-care-outcome-v1-contract.js';
import {
  buildAreaWritePayload,
  normalizeAreaContext,
  assertPlantAreaSameGarden,
  assertAreaOwnedByGarden,
  validateAreaName
} from './garden-areas-v1-contract.js';
import './garden-closed-loop-care-v1-browser.js';
import {
  onActiveGardenChanged as onSpecificSuitabilityGardenChanged,
  wireSpecificPlantSuitabilityUi,
  focusFirstPlantEntry as focusSpecificPlantEntry,
  runSpecificPlantCheckIfReady
} from './specific-plant-suitability-ui.js';
import { buildSrHeroAnswerViewModel } from './smart-rec-hero-answer-view-v1.js';
import { deriveSpecificPlantOutcomes } from './specific-plant-suitability-contract.js';
import { deriveFirstValueOnboardingState } from './first-value-onboarding-v1-contract.js';
import {
  SMART_REC_CLIMATE_META_AUTHORITY_VERSION,
  plantHasCanonicalClimateTraits,
  mergeSmartRecClimateMeta,
  climateMetaFromCatalogTraits as authorityClimateMetaFromCatalogTraits,
  resolveSmartRecClimateMetaForPlant,
  stripSyntheticCoreDefaults,
  META_AUTHORITY
} from './smart-rec-climate-meta-authority-v1.js';
import {
  applyBootstrapSafeClimateTraitsMigration,
  applyBootstrapUnlockedSixClimateTraitsMigration,
  applyAllBootstrapStructuralClimateTraitsMigrations,
  getBootstrapSafeClimateTraitsMigrationPayload,
  getBootstrapUnlockedSixClimateTraitsMigrationPayload,
  BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION
} from './bootstrap-safe-climate-traits-migration-v1.js';

window.cruvitBuildSrHeroAnswerViewModel = buildSrHeroAnswerViewModel;
window.cruvitDeriveSpecificPlantOutcomes = deriveSpecificPlantOutcomes;
window.cruvitSmartRecClimateMetaAuthority = {
  version: SMART_REC_CLIMATE_META_AUTHORITY_VERSION,
  META_AUTHORITY,
  plantHasCanonicalClimateTraits,
  mergeSmartRecClimateMeta,
  climateMetaFromCatalogTraits: authorityClimateMetaFromCatalogTraits,
  resolveSmartRecClimateMetaForPlant,
  stripSyntheticCoreDefaults
};
window.cruvitBootstrapSafeClimateTraitsMigration = {
  version: BOOTSTRAP_SAFE_CLIMATE_TRAITS_MIGRATION_VERSION,
  apply: applyBootstrapSafeClimateTraitsMigration,
  getPayload: getBootstrapSafeClimateTraitsMigrationPayload,
  applyUnlockedSix: applyBootstrapUnlockedSixClimateTraitsMigration,
  getUnlockedSixPayload: getBootstrapUnlockedSixClimateTraitsMigrationPayload,
  applyAll: applyAllBootstrapStructuralClimateTraitsMigrations
};

const AUTH_CONFIG_PATH = '/.netlify/functions/auth-config';
const SESSION_STORAGE_KEY = 'cruvit_pd_v0_active_garden_id';

const GARDEN_SELECT =
  'id,name,created_at,updated_at,user_id,location_label,location_lat,location_lon,location_climate,location_country,location_region,location_timezone,location_source,location_confirmed_at,location_updated_at,location_structural_climate,location_structural_climate_version,location_structural_climate_fetched_at,location_structural_climate_source,location_structural_climate_status';

const PLANT_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,name,status,mark,source,profile_slug,scientific,archived,prefs,added_at,created_at,updated_at';

/** Includes optional garden_area_id after Areas migration. */
const PLANT_SELECT_WITH_AREA = `${PLANT_SELECT},garden_area_id`;

const AREA_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,name,context,created_at,updated_at';

const TASK_SELECT =
  'id,garden_profile_id,user_id,client_instance_id,garden_plant_id,icon,title,when_label,priority,due_on,auto_generated,plant_name,done,source_module,task_type,created_at,updated_at';

const EVENT_SELECT =
  'id,garden_profile_id,garden_plant_id,garden_task_id,event_type,source_module,payload,occurred_at,correlation_id,caused_by_event_id';

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
/** @type {number} */
let activeGardenPlantCount = 0;
/** @type {Array<{name:string, scientific?:string|null, profileSlug?:string|null}>} */
let activeGardenPlantSummaries = [];

function setStatus(text, kind) {
  const el = document.getElementById('pdV0Status');
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('error', 'ok');
  if (kind) el.classList.add(kind);
  if (text) {
    try {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {
      /* ignore */
    }
  }
  const banner = document.getElementById('pdV0FeedbackBanner');
  if (banner) {
    banner.hidden = !text;
    banner.textContent = text || '';
    banner.classList.remove('error', 'ok');
    if (kind) banner.classList.add(kind);
  }
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
  activeGardenPlantCount = 0;
  activeGardenPlantSummaries = [];
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
  if (!isCompleteServerLocation(row)) return 'Location not set yet';
  return String(row.location_label || 'Location saved');
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

function getActiveGardenRow() {
  const id = getActiveGardenId();
  if (!id) return ownedGardensCache.length === 1 ? ownedGardensCache[0] : null;
  return ownedGardensCache.find((r) => String(r.id) === String(id)) || null;
}

function renderFirstValueOnboarding() {
  const host = document.getElementById('pdV0OnboardingHost');
  const signedIn = !!currentSession?.user;
  const activeGarden = getActiveGardenRow();
  const serverHasLocation = isCompleteServerLocation(activeGarden);
  const serverPlantCount = Number(activeGardenPlantCount) || 0;
  const step = deriveFirstValueOnboardingState({
    signedIn,
    gardens: ownedGardensCache,
    activeGardenId: getActiveGardenId(),
    activeGarden,
    plantCount: serverPlantCount
  });

  const titleEl = document.getElementById('pdV0Title');
  const leadEl = document.getElementById('pdV0Lead');
  const kickerEl = document.getElementById('pdV0Kicker');
  if (kickerEl) kickerEl.textContent = 'My Garden';
  if (titleEl) titleEl.textContent = step.title;
  if (leadEl) leadEl.textContent = step.lead;

  const createPanel = document.getElementById('pdV0CreateGardenPanel');
  const locationPanel = document.getElementById('pdV0LocationStep');
  const plantPanel = document.getElementById('pdV0PlantStep');
  const answerHint = document.getElementById('pdV0AnswerHint');
  const switcher = document.getElementById('pdV0GardenSwitcher');
  const activeCard = document.getElementById('pdV0ActiveGardenCard');
  const manageGardens = document.getElementById('pdV0ManageGardens');
  const myPlantsPanel = document.getElementById('pdV0MyPlantsPanel');
  const advanced = document.getElementById('pdV0AdvancedDetails');
  const addFirstBtn = document.getElementById('pdV0AddFirstPlantBtn');
  const setLocationBtn = document.getElementById('pdV0SetLocationBtn');
  const locLabel = document.getElementById('pdV0LocationSavedLabel');

  // Primary CTAs must follow server garden/location/plant truth after hydrate.
  const showCreate = step.primaryAction === 'create-garden';
  const showSetLocation = step.primaryAction === 'set-location' && !serverHasLocation;
  const showAddFirstPlant = step.primaryAction === 'add-plant' && serverPlantCount <= 0;
  const showPlantTools =
    showAddFirstPlant ||
    step.primaryAction === 'check-plant' ||
    step.state === 'E_FIRST_ANSWER' ||
    (serverHasLocation && serverPlantCount > 0);
  const showMyPlants = signedIn && !!activeGarden && (serverPlantCount > 0 || step.state === 'E_FIRST_ANSWER');

  if (createPanel) createPanel.hidden = !showCreate;
  if (locationPanel) locationPanel.hidden = !showSetLocation;
  if (setLocationBtn) setLocationBtn.hidden = !showSetLocation;
  if (addFirstBtn) addFirstBtn.hidden = !showAddFirstPlant;
  if (plantPanel) {
    plantPanel.hidden = !showAddFirstPlant;
  }
  if (locLabel) {
    if (serverHasLocation && !showSetLocation) {
      locLabel.hidden = false;
      locLabel.textContent = `Location: ${activeGarden.location_label}`;
    } else {
      locLabel.hidden = true;
    }
  }
  if (answerHint) {
    answerHint.hidden = !(step.state === 'E_FIRST_ANSWER' || (serverHasLocation && serverPlantCount > 0));
  }
  if (activeCard) {
    const showActiveCard = signedIn && !!activeGarden && step.primaryAction !== 'choose-garden';
    activeCard.hidden = !showActiveCard;
    if (showActiveCard) {
      const nameEl = document.getElementById('pdV0ActiveGardenName');
      const locEl = document.getElementById('pdV0ActiveGardenLoc');
      if (nameEl) nameEl.textContent = `${activeGarden.name || 'My Garden'} · current`;
      if (locEl) {
        locEl.textContent = serverHasLocation
          ? String(activeGarden.location_label || '')
          : 'Location not set yet';
      }
    }
  }
  if (switcher) {
    // Primary list only when the user must choose (no active garden yet).
    switcher.hidden = !step.showGardenSwitcher;
  }
  if (manageGardens) {
    const others = ownedGardensCache.filter(
      (g) => activeGarden && String(g.id) !== String(activeGarden.id)
    );
    manageGardens.hidden = !(signedIn && others.length > 0 && !step.showGardenSwitcher);
  }
  if (myPlantsPanel) {
    myPlantsPanel.hidden = !showMyPlants;
    if (showMyPlants) renderMyPlantsList();
  }
  if (advanced) {
    advanced.hidden = !signedIn;
  }

  if (host) {
    host.dataset.state = step.state;
    host.dataset.primaryAction = step.primaryAction;
    host.dataset.serverHasLocation = serverHasLocation ? '1' : '0';
    host.dataset.serverPlantCount = String(serverPlantCount);
  }

  const suit = document.getElementById('pdV0SpecificSuitability');
  if (suit) {
    suit.hidden = !showPlantTools;
  }

  return step;
}

function gardenListItemHtml(row, options = {}) {
  const name = escapeHtml(row.name || 'My Garden');
  const id = escapeHtml(row.id || '');
  const loc = escapeHtml(formatLocationSummary(row));
  const isActive = !!options.isActive;
  const openLabel = isActive ? 'Using this garden' : 'Use this garden';
  const openDisabled = isActive ? 'disabled' : '';
  return `<li>
        <strong>${name}</strong>${isActive ? ' <span class="pd-v0-chip">current</span>' : ''}<br>
        <small>${loc}</small><br>
        <button type="button" class="pd-v0-btn light pd-v0-btn-sm" data-pd-open-garden="${id}" ${openDisabled}>${openLabel}</button>
      </li>`;
}

function wireGardenOpenButtons(root) {
  if (!root) return;
  root.querySelectorAll('[data-pd-open-garden]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pd-open-garden');
      selectActiveGarden(id).catch((err) => setStatus(err.message || 'Could not open garden.', 'error'));
    });
  });
}

function openPlantDoctorForOwnedSummary(plant) {
  if (!plant) return false;
  const loop = window.cruvitPlantDoctorCareLoop;
  if (loop && typeof loop.openWithOwnedPlantRecord === 'function') {
    const opened = loop.openWithOwnedPlantRecord(plant);
    if (opened) {
      try {
        closePersonalDomainModal();
      } catch {
        /* optional */
      }
      return true;
    }
  }
  // Fallback: match hydrated My Garden plant by client id, then existing care-loop open.
  try {
    const data =
      typeof window.getCruvitGardenData === 'function' ? window.getCruvitGardenData() : null;
    const plants = Array.isArray(data?.plants) ? data.plants : [];
    const idx = plants.findIndex(
      (p) => String(p?.id || '').trim() === String(plant.id || '').trim()
    );
    if (idx >= 0 && typeof window.checkPlantHealth === 'function') {
      window.checkPlantHealth(idx);
      try {
        closePersonalDomainModal();
      } catch {
        /* optional */
      }
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function renderMyPlantsList() {
  const list = document.getElementById('pdV0MyPlantsList');
  const empty = document.getElementById('pdV0MyPlantsEmpty');
  if (!list) return;
  const plants = Array.isArray(activeGardenPlantSummaries) ? activeGardenPlantSummaries : [];
  if (!plants.length) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  list.innerHTML = plants
    .map((p, i) => {
      const name = escapeHtml(p.name || 'Plant');
      const sci = p.scientific ? ` · ${escapeHtml(p.scientific)}` : '';
      const slug = escapeHtml(p.profileSlug || p.name || '');
      return `<li class="pd-v0-plant-row">
        <div class="pd-v0-plant-meta">
          <span class="pd-v0-plant-label">${name}${sci}</span>
          <button type="button" class="pd-v0-plant-suit-link" data-pd-check-plant="${slug}">Check suitability</button>
        </div>
        <button type="button" class="pd-v0-btn light pd-v0-btn-sm pd-v0-doctor-btn" data-pd-doctor-plant="${i}">Check plant health</button>
      </li>`;
    })
    .join('');
  list.querySelectorAll('[data-pd-check-plant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const needle = btn.getAttribute('data-pd-check-plant') || btn.textContent || '';
      const search = document.getElementById('pdV0PlantSearch');
      if (search) {
        search.value = String(needle).split('·')[0].trim();
        search.dispatchEvent(new Event('input', { bubbles: true }));
      }
      try {
        focusSpecificPlantEntry();
      } catch {
        /* optional */
      }
      try {
        runSpecificPlantCheckIfReady();
      } catch {
        /* optional */
      }
    });
  });
  list.querySelectorAll('[data-pd-doctor-plant]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-pd-doctor-plant'));
      const plant = plants[idx];
      if (!plant) return;
      openPlantDoctorForOwnedSummary(plant);
    });
  });
}

function renderGardenProfileList(rows) {
  const list = document.getElementById('pdV0GardenList');
  const manageList = document.getElementById('pdV0ManageGardenList');
  const importPanel = document.getElementById('pdV0LegacyImport');
  const plantImportPanel = document.getElementById('pdV0LegacyPlantImport');
  const taskImportPanel = document.getElementById('pdV0LegacyTaskImport');
  if (!list) {
    renderFirstValueOnboarding();
    return;
  }
  const activeId = getActiveGardenId();
  if (!rows?.length) {
    list.innerHTML = '<li class="pd-v0-chip">No gardens yet.</li>';
    if (manageList) manageList.innerHTML = '';
    if (importPanel) importPanel.hidden = true;
    if (plantImportPanel) plantImportPanel.hidden = true;
    if (taskImportPanel) taskImportPanel.hidden = true;
    renderFirstValueOnboarding();
    return;
  }

  const active = rows.find((r) => activeId && String(r.id) === String(activeId)) || null;
  const others = active ? rows.filter((r) => String(r.id) !== String(active.id)) : rows;

  // Primary chooser: only when no active garden (must pick one).
  if (!active) {
    list.innerHTML = rows.map((row) => gardenListItemHtml(row, { isActive: false })).join('');
    wireGardenOpenButtons(list);
    if (manageList) manageList.innerHTML = '';
  } else {
    list.innerHTML = '';
    if (manageList) {
      manageList.innerHTML = others.map((row) => gardenListItemHtml(row, { isActive: false })).join('');
      wireGardenOpenButtons(manageList);
    }
  }

  if (importPanel) {
    const showImport =
      !!active && !isCompleteServerLocation(active) && hasLegacyTrustedLocalLocation();
    importPanel.hidden = !showImport;
  }
  if (plantImportPanel) {
    plantImportPanel.hidden = !(active && hasLegacyLocalPlants());
  }
  if (taskImportPanel) {
    taskImportPanel.hidden = !(active && hasLegacyLocalTasks());
  }
  renderFirstValueOnboarding();
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

function isMissingColumnOrRelationError(error) {
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === '42703' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('garden_area_id') ||
    msg.includes('garden_areas')
  );
}

async function listPlantsForGarden(gardenProfileId) {
  if (!supabase || !currentSession?.user) return [];
  const gardenId = String(gardenProfileId || '').trim();
  if (!gardenId) return [];
  let { data, error } = await supabase
    .from('garden_plants')
    .select(PLANT_SELECT_WITH_AREA)
    .eq('garden_profile_id', gardenId)
    .order('added_at', { ascending: true });
  if (error && isMissingColumnOrRelationError(error)) {
    ({ data, error } = await supabase
      .from('garden_plants')
      .select(PLANT_SELECT)
      .eq('garden_profile_id', gardenId)
      .order('added_at', { ascending: true }));
  }
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function listAreasForGarden(gardenProfileId) {
  if (!supabase || !currentSession?.user) return [];
  const gardenId = String(gardenProfileId || '').trim();
  if (!gardenId) return [];
  const { data, error } = await supabase
    .from('garden_areas')
    .select(AREA_SELECT)
    .eq('garden_profile_id', gardenId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingColumnOrRelationError(error)) return [];
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

async function upsertAreaOnActiveGarden(input = {}) {
  const gardenId = requireActiveOwnedGardenId();
  const payload = buildAreaWritePayload(input);
  const row = {
    ...payload,
    garden_profile_id: gardenId,
    user_id: currentSession.user.id
  };
  const { data, error } = await supabase
    .from('garden_areas')
    .upsert(row, { onConflict: 'garden_profile_id,client_instance_id' })
    .select(AREA_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function updateAreaOnActiveGarden(areaId, patch = {}) {
  const gardenId = requireActiveOwnedGardenId();
  const id = String(areaId || '').trim();
  if (!id) throw new Error('area_id_required');
  const update = { updated_at: new Date().toISOString() };
  if (patch.name != null) update.name = validateAreaName(patch.name);
  if (patch.context != null || patch.sunExposure != null || patch.plantingMode != null) {
    const existing = await supabase
      .from('garden_areas')
      .select(AREA_SELECT)
      .eq('id', id)
      .eq('garden_profile_id', gardenId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Error('area_not_found');
    assertAreaOwnedByGarden(existing.data, gardenId);
    update.context = normalizeAreaContext({
      ...(existing.data.context || {}),
      ...(patch.context || {}),
      ...patch
    });
  }
  const { data, error } = await supabase
    .from('garden_areas')
    .update(update)
    .eq('id', id)
    .eq('garden_profile_id', gardenId)
    .select(AREA_SELECT)
    .single();
  if (error) throw error;
  return data;
}

async function deleteAreaOnActiveGarden(areaId) {
  const gardenId = requireActiveOwnedGardenId();
  const id = String(areaId || '').trim();
  if (!id) throw new Error('area_id_required');
  // Plants detach via FK ON DELETE SET NULL — do not delete plants.
  const { error } = await supabase
    .from('garden_areas')
    .delete()
    .eq('id', id)
    .eq('garden_profile_id', gardenId);
  if (error) throw error;
  return true;
}

/**
 * Assign / unassign plant → Area (same garden). areaId null clears link.
 * No Garden Memory event in V1 (state persistence is primary).
 */
async function assignPlantToAreaOnActiveGarden(input = {}) {
  const gardenId = requireActiveOwnedGardenId();
  const areaId =
    input.areaId === null || input.areaId === ''
      ? null
      : String(input.areaId || input.garden_area_id || '').trim() || null;

  if (areaId) {
    const { data: area, error: areaErr } = await supabase
      .from('garden_areas')
      .select('id,garden_profile_id')
      .eq('id', areaId)
      .maybeSingle();
    if (areaErr) throw areaErr;
    if (!area) throw new Error('area_not_found');
    assertAreaOwnedByGarden(area, gardenId);
    assertPlantAreaSameGarden({
      plantGardenProfileId: gardenId,
      areaGardenProfileId: area.garden_profile_id
    });
  }

  let plantId = String(input.plantId || input.garden_plant_id || '').trim();
  if (!plantId && input.plantName) {
    const name = String(input.plantName).trim().toLowerCase();
    const rows = await listPlantsForGarden(gardenId);
    const match = rows.find((r) => String(r.name || '').trim().toLowerCase() === name);
    if (!match) throw new Error('plant_not_found');
    plantId = match.id;
  }
  if (!plantId) throw new Error('plant_id_required');

  const { data, error } = await supabase
    .from('garden_plants')
    .update({ garden_area_id: areaId })
    .eq('id', plantId)
    .eq('garden_profile_id', gardenId)
    .select(PLANT_SELECT_WITH_AREA)
    .single();
  if (error) throw error;
  return data;
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
  activeGardenPlantCount = plants.length;
  activeGardenPlantSummaries = plants.map((p) => ({
    id: p.id || null,
    serverId: p.serverId || null,
    name: String(p.name || '').trim() || 'Plant',
    scientific: p.scientific || p.meta?.scientific || null,
    profileSlug: p.profileSlug || p.profile_slug || null
  }));
  if (typeof window.applyAuthenticatedGardenPlants === 'function') {
    window.applyAuthenticatedGardenPlants(plants, { authoritative: true });
  }
  serverPlantsAuthoritative = true;
  renderFirstValueOnboarding();
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

/**
 * Bounded Garden Memory read for Dashboard V1.
 * SELECT only — never inserts. Newest first. Default limit 40.
 */
async function listGardenEventsForGarden(gardenProfileId, options = {}) {
  if (!supabase || !currentSession?.user) return [];
  const gardenId = String(gardenProfileId || '').trim();
  if (!gardenId) return [];
  const limit = Math.min(
    100,
    Math.max(1, Number.isFinite(options.limit) ? options.limit : 40)
  );
  const { data, error } = await supabase
    .from('garden_events')
    .select(EVENT_SELECT)
    .eq('garden_profile_id', gardenId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
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
  await window.setAppLocation(partial, { skipServerPersist: true });
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
      // Isolate hydrate steps: weather/network noise must not block plants.
      try {
        await hydrateActiveGardenLocation(garden);
      } catch (err) {
        console.warn('Garden location hydrate failed:', err?.message || err);
        setStatus(err?.message || 'Location hydrate had a network issue.', 'error');
      }
      try {
        await hydrateActiveGardenPlants(garden);
      } catch (err) {
        console.warn('Garden plants hydrate failed:', err?.message || err);
        setStatus(err?.message || 'Could not load garden plants.', 'error');
      }
      try {
        await hydrateActiveGardenTasks(garden);
      } catch (err) {
        console.warn('Garden tasks hydrate failed:', err?.message || err);
      }
      try {
        if (typeof window.cruvitGardenDashboardV1?.refresh === 'function') {
          window.cruvitGardenDashboardV1.refresh();
        }
      } catch (_) {}
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
  let okLoc = false;
  let okPlants = false;
  let okTasks = false;
  try {
    okLoc = await hydrateActiveGardenLocation(row);
  } catch (err) {
    console.warn('Garden location hydrate failed:', err?.message || err);
    setStatus(err?.message || 'Location hydrate had a network issue.', 'error');
  }
  try {
    okPlants = await hydrateActiveGardenPlants(row);
  } catch (err) {
    console.warn('Garden plants hydrate failed:', err?.message || err);
    setStatus(err?.message || 'Could not load garden plants.', 'error');
  }
  try {
    okTasks = await hydrateActiveGardenTasks(row);
  } catch (err) {
    console.warn('Garden tasks hydrate failed:', err?.message || err);
  }
  setStatus(
    okLoc || okPlants || okTasks
      ? `Using “${row.name}”.`
      : `Using “${row.name}”. Next: set your garden location.`,
    'ok'
  );
  try {
    onSpecificSuitabilityGardenChanged();
  } catch {
    /* suitability UI optional */
  }
  try {
    if (typeof window.cruvitGardenDashboardV1?.refresh === 'function') {
      window.cruvitGardenDashboardV1.refresh();
    }
  } catch (_) {}
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
    setStatus('Sign in to create your garden.', 'error');
    return;
  }
  const name = String(document.getElementById('pdV0GardenName')?.value || '').trim() || 'My Garden';
  setStatus('Creating your garden…');
  const { data, error } = await supabase
    .from('garden_profiles')
    .insert({ user_id: currentSession.user.id, name })
    .select(GARDEN_SELECT)
    .single();
  if (error) {
    setStatus(error.message || 'Could not create garden.', 'error');
    return;
  }
  if (data?.id) setStoredActiveGardenId(data.id);
  setStatus(`Created “${data.name}”. Next: set your garden location.`, 'ok');
  await refreshOwnedGardenProfiles();
  renderFirstValueOnboarding();
  return data;
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
    throw new Error('Sign in to manage garden plants.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    throw new Error('Create or choose your garden before managing plants.');
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
  const cid = String(data?.client_instance_id || '').trim();
  if (cid && data?.id) plantClientToServerId.set(cid, data.id);
  return data;
}

/**
 * Garden Memory Writers V1 — insert/resolve one garden_events row after a mutation.
 * Failures must not be thrown into plant/task mutation paths by callers (they catch).
 */
async function recordGardenMemoryEvent(input = {}) {
  if (!supabase || !currentSession?.user) {
    throw new Error('Sign in required for Garden Memory.');
  }
  const gardenId = String(input.gardenProfileId || input.garden_profile_id || getActiveGardenId() || '').trim();
  if (!gardenId) throw new Error('garden_profile_id is required');
  return writeGardenMemoryEvent(supabase, {
    ...input,
    gardenProfileId: gardenId,
    causedByEventGardenProfileId:
      input.causedByEventGardenProfileId || input.caused_by_event_garden_profile_id || gardenId
  });
}

async function emitPlantAddedMemory(serverPlantRow, meta = {}) {
  const input = buildPlantAddedMemoryInput(serverPlantRow, {
    ...meta,
    gardenProfileId: serverPlantRow.garden_profile_id || getActiveGardenId()
  });
  return recordGardenMemoryEvent(input);
}

async function emitPlantArchivedMemory(serverPlantRow, meta = {}) {
  const input = buildPlantArchivedMemoryInput(serverPlantRow, {
    ...meta,
    gardenProfileId: serverPlantRow.garden_profile_id || getActiveGardenId()
  });
  return recordGardenMemoryEvent(input);
}

async function emitTaskCompletedMemory(serverTaskRow, meta = {}) {
  const input = buildTaskCompletedMemoryInput(serverTaskRow, {
    ...meta,
    gardenProfileId: serverTaskRow.garden_profile_id || getActiveGardenId()
  });
  return recordGardenMemoryEvent(input);
}

/**
 * Closed-loop: user reported outcome for a care intervention (never completion).
 * Does NOT call Plant Doctor / paid AI.
 */
async function emitTaskOutcomeReportedMemory(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || getActiveGardenId() || '').trim();
  const memory = buildTaskOutcomeReportedMemoryInput({
    ...input,
    gardenProfileId
  });
  return recordGardenMemoryEvent(memory);
}

async function emitFollowupRequestedMemory(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || getActiveGardenId() || '').trim();
  const memory = buildFollowupRequestedMemoryInput({
    ...input,
    gardenProfileId
  });
  return recordGardenMemoryEvent(memory);
}

/**
 * Report care outcome → task_outcome_reported (+ optional followup_requested).
 * Returns { decision, outcomeEvent, followupEvent }. Never auto-runs AI.
 */
async function reportCareOutcomeMemory(input = {}) {
  const gardenProfileId = String(input.gardenProfileId || getActiveGardenId() || '').trim();
  const bundle = buildClosedLoopOutcomeMemoryBundle({
    ...input,
    gardenProfileId
  });
  const outcomeWrite = await recordGardenMemoryEvent(bundle.outcomeMemory);
  const outcomeEvent = outcomeWrite?.event || outcomeWrite;
  let followupEvent = null;
  if (bundle.followupMemory) {
    const followupWrite = await recordGardenMemoryEvent({
      ...bundle.followupMemory,
      causedByEventId:
        outcomeWrite?.eventId || outcomeEvent?.id || bundle.followupMemory.causedByEventId || null,
      causedByEventGardenProfileId: gardenProfileId
    });
    followupEvent = followupWrite?.event || followupWrite;
  }
  return {
    decision: bundle.decision,
    outcomeEvent,
    followupEvent,
    autoAi: false
  };
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
    throw new Error('Sign in to save your garden location.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    if (ownedGardensCache.length > 1) {
      throw new Error('Choose which garden to use, then set the location again.');
    }
    throw new Error('Create your garden before saving a location.');
  }
  const payload = buildServerLocationPayload(locationInput);
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .update(payload)
    .eq('id', gardenId)
    .eq('user_id', requestUserId)
    .select(GARDEN_SELECT)
    .single();
  if (error) {
    throw new Error(error.message || 'Could not save garden location.');
  }
  if (!data || data.location_lat == null || data.location_lon == null) {
    throw new Error('Location did not save to your garden. Please try again.');
  }
  if (!shouldAcceptGardenProfileRefresh(requestUserId, currentSession)) {
    throw new Error('Signed-out during save. Sign in and try again.');
  }
  await refreshOwnedGardenProfiles();
  return data;
}

/**
 * Map confirmed app location → server write input.
 * Never invents coordinates; requires trusted confirmed app location.
 */
function readConfirmedAppLocationForServerWrite() {
  if (typeof window.getAppLocation !== 'function' || typeof window.hasTrustedAppLocation !== 'function') {
    throw new Error('Location tools are unavailable right now.');
  }
  if (!window.hasTrustedAppLocation()) {
    throw new Error('Set your garden location first, then try again.');
  }
  const loc = window.getAppLocation();
  const sourceRaw = String(loc.source || '').trim();
  if (!sourceRaw || sourceRaw === 'default') {
    throw new Error('Confirm a real garden location before saving.');
  }
  const climate = String(
    loc.climate ||
      loc.broadClimateLabel ||
      loc.derivedClimateProfile?.climateLabel ||
      ''
  ).trim();
  if (!climate) {
    throw new Error('Garden climate is missing. Set the location again.');
  }
  const lat = Number(loc.lat ?? loc.coordinates?.lat);
  const lon = Number(loc.lon ?? loc.coordinates?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Garden coordinates are missing. Set the location again.');
  }
  const structural =
    (loc.structuralClimate && typeof loc.structuralClimate === 'object'
      ? loc.structuralClimate
      : null) ||
    (loc.derivedClimateProfile?.structuralClimate &&
    typeof loc.derivedClimateProfile.structuralClimate === 'object'
      ? loc.derivedClimateProfile.structuralClimate
      : null);
  return {
    label: String(loc.label || '').trim(),
    climate,
    lat,
    lon,
    country: loc.country,
    region: loc.region,
    timezone: loc.timezone,
    source: sourceRaw === 'geolocation' ? 'geolocation' : 'manual',
    structuralClimate: structural
  };
}

async function clearLocationOnActiveGarden() {
  if (!supabase || !currentSession?.user) {
    throw new Error('Sign in to clear garden location.');
  }
  const gardenId = getActiveGardenId();
  if (!gardenId) {
    throw new Error('Choose a garden first.');
  }
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .update(nullServerLocationPayload())
    .eq('id', gardenId)
    .eq('user_id', requestUserId)
    .select(GARDEN_SELECT)
    .single();
  if (error) throw new Error(error.message || 'Could not clear location.');
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
    throw new Error('Confirm that you want to use this browser location for your garden.');
  }
  captureLocalSnapshotIfNeeded();
  const input = readConfirmedAppLocationForServerWrite();
  const saved = await saveConfirmedLocationToActiveGarden(input);
  setStatus(`Garden location saved · ${saved.location_label}`, 'ok');
  showLocationSavedFeedback(saved);
  return saved;
}

async function saveCurrentAppLocationToActiveGarden() {
  captureLocalSnapshotIfNeeded();
  const input = readConfirmedAppLocationForServerWrite();
  const saved = await saveConfirmedLocationToActiveGarden(input);
  setStatus(`Garden location saved · ${saved.location_label}`, 'ok');
  showLocationSavedFeedback(saved);
  return saved;
}

function showLocationSavedFeedback(saved) {
  const locLabel = document.getElementById('pdV0LocationSavedLabel');
  if (locLabel && saved?.location_label) {
    locLabel.hidden = false;
    const climateReady =
      saved?.location_structural_climate_status === 'known' ? ' · Climate profile ready' : '';
    locLabel.textContent = `Garden location saved · ${saved.location_label}${climateReady}`;
  }
  renderFirstValueOnboarding();
}

/**
 * Called after the user confirms app location. Persists automatically when signed in.
 * Surfaces failures — never silent.
 */
async function onAppLocationConfirmedFromUi() {
  if (!currentSession?.user) return null;
  if (!getActiveGardenId()) {
    if (ownedGardensCache.length === 0) return null;
    if (ownedGardensCache.length > 1) {
      setStatus('Choose which garden to use, then set the location again.', 'error');
      openPersonalDomainModal();
      return null;
    }
  }
  try {
    const saved = await saveCurrentAppLocationToActiveGarden();
    openPersonalDomainModal();
    return saved;
  } catch (err) {
    const msg = err?.message || 'Could not save garden location.';
    setStatus(msg, 'error');
    openPersonalDomainModal();
    throw err;
  }
}

let pdV0EscapeBound = false;

function onPdV0EscapeKey(event) {
  if (event.key !== 'Escape') return;
  const modal = document.getElementById('pdV0Modal');
  if (!modal || !modal.classList.contains('open')) return;
  event.preventDefault();
  closePersonalDomainModal();
}

function openPersonalDomainModal() {
  const modal = document.getElementById('pdV0Modal');
  modal?.classList.add('open');
  modal?.setAttribute('aria-hidden', 'false');
  if (!pdV0EscapeBound) {
    document.addEventListener('keydown', onPdV0EscapeKey);
    pdV0EscapeBound = true;
  }
  restoreSession()
    .then(() => renderFirstValueOnboarding())
    .catch((err) => setStatus(err.message || 'Could not initialize account.', 'error'));
}

function closePersonalDomainModal() {
  const modal = document.getElementById('pdV0Modal');
  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
}

function startSetGardenLocationFlow() {
  openPersonalDomainModal();
  const tryPersistExisting = async () => {
    if (typeof window.hasTrustedAppLocation === 'function' && window.hasTrustedAppLocation() === true) {
      setStatus('Saving garden location…');
      await saveCurrentAppLocationToActiveGarden();
      return true;
    }
    return false;
  };
  tryPersistExisting()
    .then((saved) => {
      if (saved) return;
      try {
        if (typeof window.openLocationModal === 'function') {
          window.openLocationModal();
          return;
        }
      } catch {
        /* fall through */
      }
      try {
        if (typeof window.openAppLocationPopover === 'function') {
          window.openAppLocationPopover();
          return;
        }
      } catch {
        /* fall through */
      }
      setStatus('Use the location control to set where your garden is.', 'error');
    })
    .catch((err) => {
      setStatus(err?.message || 'Could not save garden location.', 'error');
    });
}

function wirePersonalDomainUi() {
  document.getElementById('pdV0Modal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'pdV0Modal') closePersonalDomainModal();
  });
  document.getElementById('pdV0CloseBtn')?.addEventListener('click', () => {
    closePersonalDomainModal();
  });
  document.getElementById('pdV0ImportLegacyLocationBtn')?.addEventListener('click', () => {
    importLegacyTrustedLocationToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Could not use this location.', 'error');
    });
  });
  document.getElementById('pdV0ImportLegacyPlantsBtn')?.addEventListener('click', () => {
    importLegacyLocalPlantsToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Could not add plants.', 'error');
    });
  });
  document.getElementById('pdV0ImportLegacyTasksBtn')?.addEventListener('click', () => {
    importLegacyLocalTasksToActiveGarden(true).catch((err) => {
      setStatus(err.message || 'Could not add tasks.', 'error');
    });
  });
  document.getElementById('pdV0SetLocationBtn')?.addEventListener('click', () => {
    startSetGardenLocationFlow();
  });
  document.getElementById('pdV0CreateGardenBtn')?.addEventListener('click', () => {
    createGardenProfile().catch((err) => setStatus(err.message || 'Could not create garden.', 'error'));
  });
  document.getElementById('pdV0AddFirstPlantBtn')?.addEventListener('click', () => {
    focusSpecificPlantEntry?.();
    const search = document.getElementById('pdV0PlantSearch');
    if (search) {
      search.focus();
      search.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  document.getElementById('pdV0ClearGardenLocationBtn')?.addEventListener('click', () => {
    clearLocationOnActiveGarden()
      .then(() => setStatus('Cleared garden location.', 'ok'))
      .catch((err) => setStatus(err.message || 'Clear failed.', 'error'));
  });
  // Recovery path only (advanced): still available, not primary CTA.
  document.getElementById('pdV0SaveAppLocationBtn')?.addEventListener('click', () => {
    saveCurrentAppLocationToActiveGarden().catch((err) => {
      setStatus(err.message || 'Could not save garden location.', 'error');
    });
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
  listAreasForActiveGarden: async () => listAreasForGarden(getActiveGardenId()),
  upsertAreaOnActiveGarden,
  updateAreaOnActiveGarden,
  updateAreaContextOnActiveGarden: async (areaId, contextPatch) =>
    updateAreaOnActiveGarden(areaId, { context: contextPatch, ...contextPatch }),
  deleteAreaOnActiveGarden,
  assignPlantToAreaOnActiveGarden,
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
  recordGardenMemoryEvent,
  emitPlantAddedMemory,
  emitPlantArchivedMemory,
  emitTaskCompletedMemory,
  emitTaskOutcomeReportedMemory,
  emitFollowupRequestedMemory,
  reportCareOutcomeMemory,
  decideCareOutcomeFollowUp,
  writeGardenMemoryEvent: (input) => recordGardenMemoryEvent(input),
  importLegacyLocalTasksToActiveGarden,
  listTasksForActiveGarden: async () => listTasksForGarden(getActiveGardenId()),
  listGardenEventsForActiveGarden: async (options) =>
    listGardenEventsForGarden(getActiveGardenId(), options),
  hydrateActiveGardenTasks: async () => {
    const id = getActiveGardenId();
    const garden = ownedGardensCache.find((r) => String(r.id) === String(id));
    if (!garden) return false;
    return hydrateActiveGardenTasks(garden);
  },
  isServerTasksAuthoritative,
  onAppLocationConfirmedFromUi,
  startSetGardenLocationFlow,
  renderFirstValueOnboarding,
  getActiveGardenPlantCount: () => activeGardenPlantCount,
  getActiveGardenPlantSummaries: () => activeGardenPlantSummaries.slice(),
  getSupabaseClient: () => supabase,
  getSession: () => currentSession,
  getOwnedGardensCache: () => ownedGardensCache.slice()
};

initPersonalDomainV0();
