/**
 * Global app-shell auth session indicator.
 * Source of truth: Supabase auth session only.
 * Never infers signed-in state from localStorage, Garden cache, location, or local plants.
 * Paid AI automated calls: 0.
 */

export const AUTH_SESSION_SOURCE = 'supabase.auth.session';
export const GLOBAL_AUTH_SESSION_INDICATOR_VERSION = 'v1';
export const PAID_AI_AUTOMATED_CALLS = 0;

const CHIP_IDS = Object.freeze({
  wrap: 'appAccountWrap',
  chip: 'appAccountChip',
  label: 'appAccountChipLabel',
  avatar: 'appAccountAvatar',
  menu: 'appAccountMenu',
  identity: 'appAccountIdentity',
  signOut: 'appAccountSignOutBtn'
});

function asTrimmedString(value) {
  return String(value || '').trim();
}

function readSessionUser(session) {
  const user = session && typeof session === 'object' ? session.user : null;
  if (!user || typeof user !== 'object') return null;
  const id = asTrimmedString(user.id);
  return id ? user : null;
}

function readDisplayName(user) {
  const meta = user && typeof user.user_metadata === 'object' && user.user_metadata ? user.user_metadata : {};
  return asTrimmedString(meta.full_name || meta.name || meta.display_name || '');
}

function readAvatarUrl(user) {
  const meta = user && typeof user.user_metadata === 'object' && user.user_metadata ? user.user_metadata : {};
  return asTrimmedString(meta.avatar_url || meta.picture || '') || null;
}

function initialsFromIdentity(displayName, email, userId) {
  const named = asTrimmedString(displayName);
  if (named) {
    const parts = named.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return named.slice(0, 2).toUpperCase();
  }
  const local = asTrimmedString(email).split('@')[0];
  if (local) return local.slice(0, 2).toUpperCase();
  return asTrimmedString(userId).slice(0, 2).toUpperCase() || '?';
}

/**
 * Resolve compact header identity from a Supabase session object.
 * Extra arguments (localStorage, garden cache, location, plants) are ignored.
 */
export function resolveAuthSessionIndicator(session) {
  const user = readSessionUser(session);
  if (!user) {
    return {
      authenticated: false,
      authState: 'guest',
      chipLabel: 'Sign in',
      guestLabel: 'Guest',
      ariaLabel: 'Guest. Sign in',
      email: null,
      displayName: null,
      identityLine: null,
      initials: '',
      avatarUrl: null,
      userId: null,
      source: AUTH_SESSION_SOURCE
    };
  }
  const email = asTrimmedString(user.email) || null;
  const displayName = readDisplayName(user) || null;
  const identityLine = displayName && email && displayName !== email
    ? `${displayName} · ${email}`
    : (displayName || email || asTrimmedString(user.id));
  const chipLabel = displayName || email || 'Account';
  return {
    authenticated: true,
    authState: 'signed-in',
    chipLabel,
    guestLabel: null,
    ariaLabel: `Account: ${chipLabel}`,
    email,
    displayName,
    identityLine,
    initials: initialsFromIdentity(displayName, email, user.id),
    avatarUrl: readAvatarUrl(user),
    userId: asTrimmedString(user.id),
    source: AUTH_SESSION_SOURCE
  };
}

/** Host remains auth authority. Iframe may receive this user id only. */
export function hostUserIdFromSession(session) {
  const user = readSessionUser(session);
  return user ? asTrimmedString(user.id) : null;
}

export function hostUserContextFromSession(session) {
  return {
    authSource: AUTH_SESSION_SOURCE,
    userId: hostUserIdFromSession(session),
    authenticated: !!hostUserIdFromSession(session)
  };
}

function setHidden(el, hidden) {
  if (!el) return;
  el.hidden = !!hidden;
}

function closeAccountMenu(views) {
  if (views?.menu) views.menu.classList.add('hidden');
  if (views?.chip) views.chip.setAttribute('aria-expanded', 'false');
}

export function presentAuthSessionIndicator(session, views = {}) {
  const identity = resolveAuthSessionIndicator(session);
  if (views.chipLabel) views.chipLabel.textContent = identity.chipLabel;
  if (views.chip) {
    views.chip.setAttribute('data-auth-state', identity.authState);
    views.chip.setAttribute('aria-label', identity.ariaLabel);
    views.chip.setAttribute('aria-haspopup', identity.authenticated ? 'menu' : 'dialog');
    if (!identity.authenticated) views.chip.setAttribute('aria-expanded', 'false');
  }
  if (views.wrap) views.wrap.setAttribute('data-auth-state', identity.authState);
  if (views.identity) {
    views.identity.textContent = identity.identityLine || '';
    setHidden(views.identity, !identity.authenticated);
  }
  if (views.signOutBtn) setHidden(views.signOutBtn, !identity.authenticated);
  if (views.avatar) {
    if (typeof views.avatar.replaceChildren === 'function') views.avatar.replaceChildren();
    else views.avatar.textContent = '';
    if (!identity.authenticated) {
      setHidden(views.avatar, true);
      if (typeof views.avatar.removeAttribute === 'function') views.avatar.removeAttribute('data-initials');
    } else {
      setHidden(views.avatar, false);
      if (typeof views.avatar.setAttribute === 'function') views.avatar.setAttribute('data-initials', identity.initials);
      if (identity.avatarUrl && typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof views.avatar.appendChild === 'function') {
        const img = document.createElement('img');
        img.src = identity.avatarUrl;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        views.avatar.appendChild(img);
      } else {
        views.avatar.textContent = identity.initials;
      }
    }
  }
  if (!identity.authenticated) closeAccountMenu(views);
  return identity;
}

export function collectAuthSessionIndicatorViews(root = typeof document !== 'undefined' ? document : null) {
  if (!root || typeof root.getElementById !== 'function') return {};
  return {
    wrap: root.getElementById(CHIP_IDS.wrap),
    chip: root.getElementById(CHIP_IDS.chip),
    chipLabel: root.getElementById(CHIP_IDS.label),
    avatar: root.getElementById(CHIP_IDS.avatar),
    menu: root.getElementById(CHIP_IDS.menu),
    identity: root.getElementById(CHIP_IDS.identity),
    signOutBtn: root.getElementById(CHIP_IDS.signOut)
  };
}

export function presentAuthSessionIndicatorFromDocument(session, root) {
  return presentAuthSessionIndicator(session, collectAuthSessionIndicatorViews(root));
}

function openPersonalDomain() {
  const pd = typeof window !== 'undefined' ? window.cruvitPersonalDomainV0 : null;
  if (pd && typeof pd.open === 'function') pd.open();
}

function signOutPersonalDomain() {
  const pd = typeof window !== 'undefined' ? window.cruvitPersonalDomainV0 : null;
  if (pd && typeof pd.signOut === 'function') return pd.signOut();
  return undefined;
}

function sessionFromHostAuthority() {
  const pd = typeof window !== 'undefined' ? window.cruvitPersonalDomainV0 : null;
  if (pd && typeof pd.getSession === 'function') return pd.getSession();
  return null;
}

export function bindGlobalAuthSessionIndicator(root = typeof document !== 'undefined' ? document : null) {
  const views = collectAuthSessionIndicatorViews(root);
  if (!views.chip) return { bound: false, views };

  const refresh = () => presentAuthSessionIndicator(sessionFromHostAuthority(), views);

  if (!views.chip.dataset.authIndicatorBound) {
    views.chip.dataset.authIndicatorBound = '1';
    views.chip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const identity = resolveAuthSessionIndicator(sessionFromHostAuthority());
      if (!identity.authenticated) {
        closeAccountMenu(views);
        openPersonalDomain();
        return;
      }
      if (!views.menu) return;
      const open = views.menu.classList.contains('hidden');
      views.menu.classList.toggle('hidden', !open);
      views.chip.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    if (views.signOutBtn) {
      views.signOutBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeAccountMenu(views);
        signOutPersonalDomain();
      });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('click', (event) => {
        if (views.wrap && event.target && views.wrap.contains(event.target)) return;
        closeAccountMenu(views);
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('cruvit:auth-session-changed', refresh);
    }
  }

  refresh();
  return { bound: true, views };
}

if (typeof window !== 'undefined') {
  window.CruvitGlobalAuthSessionIndicator = {
    version: GLOBAL_AUTH_SESSION_INDICATOR_VERSION,
    source: AUTH_SESSION_SOURCE,
    paidAiAutomatedCalls: PAID_AI_AUTOMATED_CALLS,
    resolve: resolveAuthSessionIndicator,
    present: presentAuthSessionIndicatorFromDocument,
    hostUserIdFromSession,
    hostUserContextFromSession,
    bind: bindGlobalAuthSessionIndicator
  };
  const start = () => bindGlobalAuthSessionIndicator();
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
}
