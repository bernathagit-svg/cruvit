/**
 * CRUVIT — Canonical Identification Runtime Orchestrator V1
 *
 * Thin, dependency-injected composition layer:
 * authoritative upstream signals -> PI-PROV-2 -> PI-PROV-4A ->
 * PI-PROV-3B -> PI-PROV-1.
 *
 * No provider, network, client construction, UI, Save, registry loading or secrets.
 */
import { evaluateCanonicalIdentificationCatalogAuthority } from './canonical-identification-catalog-authority-v1.js';
import { createCanonicalIdentificationResult } from './canonical-identification-result-v1.js';

export const CANONICAL_IDENTIFICATION_RUNTIME_ORCHESTRATOR_VERSION = '1.0.0';

const POSITIVE_RESOLUTION_STATUSES = new Set(['resolved_id', 'resolved_canonical']);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function cloneDiagnostic(value, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return '[depth-limit]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (!value || typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map(item => cloneDiagnostic(item, depth + 1, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const next = cloneDiagnostic(value[key], depth + 1, seen);
    if (next !== undefined) out[key] = next;
  }
  seen.delete(value);
  return out;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function diagnostic(stage, code, extra = null) {
  return deepFreeze({
    orchestratorVersion: CANONICAL_IDENTIFICATION_RUNTIME_ORCHESTRATOR_VERSION,
    stage,
    code,
    data: extra == null ? null : cloneDiagnostic(extra)
  });
}

function finalFailure({ status = 'identified', resolution = null, catalog = null, providerEvidence = null, stage, code, extra = null }) {
  return deepFreeze({
    result: createCanonicalIdentificationResult({
      status,
      resolution,
      catalog,
      providerEvidence
    }),
    diagnostics: diagnostic(stage, code, extra)
  });
}

function positiveResolution(resolution) {
  return !!(
    resolution &&
    typeof resolution === 'object' &&
    POSITIVE_RESOLUTION_STATUSES.has(clean(resolution.status)) &&
    clean(resolution.canonicalSlug) &&
    resolution.needsReview !== true &&
    resolution.conflictActive !== true
  );
}

export function createCanonicalIdentificationRuntimeOrchestrator({
  resolutionAdapter,
  catalogReadAdapter
} = {}) {
  if (!resolutionAdapter || typeof resolutionAdapter.resolve !== 'function') {
    throw new TypeError('Explicit canonical resolution adapter dependency is required');
  }
  if (!catalogReadAdapter || typeof catalogReadAdapter.readByCanonicalSlug !== 'function') {
    throw new TypeError('Explicit canonical catalog read adapter dependency is required');
  }

  return Object.freeze({
    async identify(input = {}) {
      const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
      const signals = Array.isArray(source.signals) ? source.signals : [];
      const providerEvidence = source.providerEvidence ?? null;
      const locale = source.locale ?? null;
      const requestedStatus = clean(source.status) || 'identified';

      let resolution;
      try {
        resolution = resolutionAdapter.resolve({
          signals,
          diagnostics: {
            scope: 'upstream_signal_diagnostics',
            providerEvidence
          }
        });
      } catch (_error) {
        return finalFailure({
          status: requestedStatus,
          providerEvidence,
          stage: 'resolution',
          code: 'RESOLUTION_DEPENDENCY_ERROR'
        });
      }

      if (!positiveResolution(resolution)) {
        return finalFailure({
          status: requestedStatus,
          resolution,
          providerEvidence,
          stage: 'resolution',
          code: 'RESOLUTION_NOT_AUTHORITATIVE',
          extra: {
            status: resolution?.status ?? null,
            reasonCodes: resolution?.reasonCodes ?? null
          }
        });
      }

      const canonicalSlug = clean(resolution.canonicalSlug);
      let catalogRead;
      try {
        catalogRead = await catalogReadAdapter.readByCanonicalSlug(canonicalSlug);
      } catch (_error) {
        return finalFailure({
          status: requestedStatus,
          resolution,
          providerEvidence,
          stage: 'catalog_read',
          code: 'CATALOG_READ_DEPENDENCY_ERROR'
        });
      }

      if (
        !catalogRead ||
        typeof catalogRead !== 'object' ||
        catalogRead.status !== 'found' ||
        catalogRead.rowCount !== 1 ||
        !catalogRead.row
      ) {
        return finalFailure({
          status: requestedStatus,
          resolution,
          providerEvidence,
          stage: 'catalog_read',
          code: 'CATALOG_READ_NOT_FOUND_EXACTLY_ONCE',
          extra: {
            status: catalogRead?.status ?? null,
            rowCount: catalogRead?.rowCount ?? null,
            reason: catalogRead?.reason ?? null
          }
        });
      }

      const catalog = evaluateCanonicalIdentificationCatalogAuthority({
        resolution,
        catalogRow: catalogRead.row,
        locale
      });

      const result = createCanonicalIdentificationResult({
        status: requestedStatus,
        resolution,
        catalog,
        providerEvidence
      });

      return deepFreeze({
        result,
        diagnostics: diagnostic(
          result.status === 'identified' ? 'complete' : 'catalog_authority',
          result.status === 'identified' ? 'IDENTIFIED' : 'CATALOG_AUTHORITY_NOT_IDENTIFIED',
          {
            catalogValidation: catalog?.validation ?? null,
            catalogReasons: catalog?.reasons ?? null,
            requestedLocale: catalog?.requestedLocale ?? null,
            resolvedDisplayLocale: catalog?.resolvedDisplayLocale ?? null,
            localeFallback: catalog?.localeFallback ?? false
          }
        )
      });
    }
  });
}
