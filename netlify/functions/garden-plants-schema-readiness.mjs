const CRUVIT_PRODUCTION_PROJECT_REF = 'saiuscqbszafszpdmzfl';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_LEASE_MS = 15 * 60 * 1000;

let readinessLease = null;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function projectRefFromEnv() {
  const explicit = String(process.env.SUPABASE_PROJECT_REF || '').trim();
  if (explicit) return explicit;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const match = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(url);
  return match ? match[1] : '';
}

function leaseMsFromEnv() {
  const raw = Number(process.env.SCHEMA_ATTESTATION_LEASE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LEASE_MS;
  return Math.min(Math.max(Math.round(raw), 1000), MAX_LEASE_MS);
}

function normalizeDefault(value) {
  return String(value || '')
    .replace(/::text$/i, '')
    .replace(/^'+|'+$/g, '')
    .trim();
}

function allowedMarksFromConstraint(definition) {
  const text = String(definition || '');
  const matches = [...text.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  return [...new Set(matches)];
}

function scopedPatIsAcceptable(token) {
  return /^sbp_fc[A-Za-z0-9_-]+$/.test(String(token || '').trim());
}

function validLease(projectRef, now = Date.now()) {
  return !!(
    readinessLease &&
    readinessLease.projectRef === projectRef &&
    readinessLease.ready === true &&
    Number.isFinite(readinessLease.expiresAt) &&
    readinessLease.expiresAt > now
  );
}

export function __resetSchemaReadinessLeaseForTests() {
  readinessLease = null;
}

export function __setSchemaReadinessLeaseForTests(value) {
  readinessLease = value;
}

export async function handler(event = {}) {
  const token = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
  const projectRef = projectRefFromEnv();
  const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const authHeader = String(
    event?.headers?.authorization ||
    event?.headers?.Authorization ||
    ''
  ).trim();

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json(401, {
      ok: false,
      ready: false,
      reason: 'authentication_required',
    });
  }

  if (!supabaseUrl || !anonKey) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'auth_verification_unavailable',
    });
  }

  let authResponse;
  try {
    authResponse = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: {
        authorization: authHeader,
        apikey: anonKey,
      },
    });
  } catch (_) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'auth_verification_failed',
    });
  }

  if (!authResponse.ok) {
    return json(401, {
      ok: false,
      ready: false,
      reason: 'authentication_invalid',
    });
  }

  if (!token || !projectRef) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_credentials_unavailable',
      projectRef: projectRef || null,
    });
  }

  if (projectRef !== CRUVIT_PRODUCTION_PROJECT_REF) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_wrong_project',
      projectRef,
    });
  }

  if (!scopedPatIsAcceptable(token)) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'scoped_database_read_pat_required',
      projectRef,
    });
  }

  const now = Date.now();
  if (validLease(projectRef, now)) {
    return json(200, {
      ok: true,
      ready: true,
      reason: null,
      projectRef,
      statusDefault: readinessLease.statusDefault,
      markDefault: readinessLease.markDefault,
      allowedMarks: readinessLease.allowedMarks,
      cached: true,
      leaseExpiresAt: new Date(readinessLease.expiresAt).toISOString(),
    });
  }

  // Never use an expired/stale lease as proof.
  readinessLease = null;

  const query = `
select
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='garden_plants' and column_name='status') as status_default,
  (select column_default from information_schema.columns
   where table_schema='public' and table_name='garden_plants' and column_name='mark') as mark_default,
  (select pg_get_constraintdef(c.oid)
     from pg_constraint c
     join pg_class t on t.oid=c.conrelid
     join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='garden_plants'
      and c.conname='garden_plants_mark_chk') as mark_constraint
`;

  let response;
  try {
    response = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query/read-only`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );
  } catch (error) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_request_failed',
      message: error?.message || 'Management API request failed.',
      projectRef,
    });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_request_rejected',
      status: response.status,
      projectRef,
    });
  }

  const row = Array.isArray(payload) ? payload[0] : payload?.result?.[0] || payload?.[0] || null;
  if (!row) {
    return json(503, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_empty',
      projectRef,
    });
  }

  const statusDefault = normalizeDefault(row.status_default);
  const markDefault = normalizeDefault(row.mark_default);
  const allowedMarks = allowedMarksFromConstraint(row.mark_constraint);
  const ready =
    statusDefault === 'unassessed' &&
    markDefault === 'unknown' &&
    allowedMarks.includes('unknown') &&
    allowedMarks.includes('✓') &&
    allowedMarks.includes('!');

  if (!ready) {
    return json(409, {
      ok: false,
      ready: false,
      reason: 'schema_attestation_mismatch',
      projectRef,
      statusDefault,
      markDefault,
      allowedMarks,
      cached: false,
    });
  }

  const leaseMs = leaseMsFromEnv();
  readinessLease = Object.freeze({
    projectRef,
    ready: true,
    statusDefault,
    markDefault,
    allowedMarks: Object.freeze(allowedMarks.slice()),
    verifiedAt: now,
    expiresAt: now + leaseMs,
  });

  return json(200, {
    ok: true,
    ready: true,
    reason: null,
    projectRef,
    statusDefault,
    markDefault,
    allowedMarks,
    cached: false,
    leaseExpiresAt: new Date(readinessLease.expiresAt).toISOString(),
  });
}
