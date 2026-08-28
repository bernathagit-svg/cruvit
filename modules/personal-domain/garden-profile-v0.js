/**
 * CRUVIT Personal Domain V0 — Supabase Auth + owned Garden Profile(s).
 * Browser-safe anon/publishable key only. Authorization enforced by Postgres RLS.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { shouldAcceptGardenProfileRefresh } from './garden-profile-v0-refresh-guard.js';

const AUTH_CONFIG_PATH = '/.netlify/functions/auth-config';
const SESSION_STORAGE_KEY = 'cruvit_pd_v0_active_garden_id';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let supabase = null;
/** @type {import('@supabase/supabase-js').Session | null} */
let currentSession = null;

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
      refreshOwnedGardenProfiles().catch((err) => {
        setStatus(err.message || 'Could not load garden profiles.', 'error');
      });
    } else {
      setSignedOutUi();
      renderGardenProfileList([]);
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
    await refreshOwnedGardenProfiles();
  } else {
    setSignedOutUi();
    renderGardenProfileList([]);
  }
}

function renderGardenProfileList(rows) {
  const list = document.getElementById('pdV0GardenList');
  if (!list) return;
  if (!rows?.length) {
    list.innerHTML = '<li class="pd-v0-chip">No server Garden Profiles yet.</li>';
    return;
  }
  list.innerHTML = rows.map((row) => {
    const name = escapeHtml(row.name || 'Garden');
    const id = escapeHtml(row.id || '');
    const updated = escapeHtml(row.updated_at || row.created_at || '');
    return `<li><strong>${name}</strong><br><span class="pd-v0-chip">${id}</span><br><small>${updated}</small></li>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function refreshOwnedGardenProfiles() {
  if (!supabase || !currentSession?.user) {
    renderGardenProfileList([]);
    return [];
  }
  const requestUserId = currentSession.user.id;
  const { data, error } = await supabase
    .from('garden_profiles')
    .select('id,name,created_at,updated_at,user_id')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  if (!shouldAcceptGardenProfileRefresh(requestUserId, currentSession)) {
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  renderGardenProfileList(rows);
  return rows;
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
  await refreshOwnedGardenProfiles();
}

async function signOut() {
  if (!supabase) {
    setSignedOutUi();
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
    .select('id,name,created_at,updated_at,user_id')
    .single();
  if (error) {
    setStatus(error.message || 'Create failed.', 'error');
    return;
  }
  if (data?.id) sessionStorage.setItem(SESSION_STORAGE_KEY, data.id);
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
  const target = rows[0];
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
  getSupabaseClient: () => supabase,
  getSession: () => currentSession
};

initPersonalDomainV0();
