/**
 * CRUVIT — Plant Identification Canonical Resolution Adapter V1
 *
 * Foundation-only, pure adapter:
 * validated namespaced signals -> injected existing identity resolver ->
 * frozen canonical-resolution evidence.
 *
 * No catalog authority, provider, network, registry loading, UI or Save behavior.
 */

export const CANONICAL_IDENTIFICATION_RESOLUTION_ADAPTER_VERSION = '1.0.0';

export const RESOLUTION_STATUSES = Object.freeze([
  'resolved_id',
  'resolved_canonical',
  'pending_conflict',
  'ambiguous',
  'provisional',
  'unresolved'
]);

export const AUTHORITATIVE_SIGNAL_NAMESPACES = Object.freeze([
  'taxonomy_verified:scientific_name',
  'cruvit_internal:cruvit_slug'
]);

const STATUS_SET = new Set(RESOLUTION_STATUSES);
const POSITIVE_SET = new Set(['resolved_id', 'resolved_canonical']);

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

function cloneDiagnostic(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5) return '[depth-limit]';
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value);
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
  if (typeof value !== 'object') return String(value);
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

function unresolvedEnvelope(reasonCodes, accounting = {}, diagnostics = null, registryVersion = null) {
  return deepFreeze({
    adapterVersion: CANONICAL_IDENTIFICATION_RESOLUTION_ADAPTER_VERSION,
    status: 'unresolved',
    canonicalSlug: null,
    plantId: null,
    matchedBy: null,
    needsReview: false,
    conflictActive: false,
    registryVersion: registryVersion || null,
    reasonCodes: Array.from(new Set(reasonCodes || ['unresolved'])).sort(),
    accounting: {
      receivedSignals: Number(accounting.receivedSignals || 0),
      authoritativeSignals: Number(accounting.authoritativeSignals || 0),
      rejectedSignals: Number(accounting.rejectedSignals || 0),
      duplicateSignals: Number(accounting.duplicateSignals || 0),
      resolverCalls: Number(accounting.resolverCalls || 0),
      resolvedSignals: Number(accounting.resolvedSignals || 0),
      unresolvedSignals: Number(accounting.unresolvedSignals || 0)
    },
    evidence: Object.freeze([]),
    diagnostics: {
      authority: 'diagnostic_only',
      data: diagnostics == null ? null : cloneDiagnostic(diagnostics)
    }
  });
}

function normalizeSignal(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { accepted: false, reason: 'malformed_signal', index };
  }
  const source = clean(raw.source);
  const kind = clean(raw.kind);
  const value = clean(raw.value);

  if (!source || !kind || !value) {
    return { accepted: false, reason: 'incomplete_signal', index, source: source || null, kind: kind || null };
  }

  if (source === 'taxonomy_verified' && kind === 'scientific_name') {
    return {
      accepted: true,
      index,
      namespace: 'taxonomy_verified:scientific_name',
      source,
      kind,
      value,
      resolverInput: { scientificName: value },
      allowedMatchedBy: new Set(['scientificName', 'scientificSynonym'])
    };
  }

  if (source === 'cruvit_internal' && kind === 'cruvit_slug') {
    return {
      accepted: true,
      index,
      namespace: 'cruvit_internal:cruvit_slug',
      source,
      kind,
      value,
      resolverInput: { canonicalSlug: value },
      allowedMatchedBy: new Set(['canonicalSlug', 'aliasSlug'])
    };
  }

  return {
    accepted: false,
    reason: 'unauthorized_signal_namespace',
    index,
    source,
    kind
  };
}

function normalizedResolverResult(signal, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      signalIndex: signal.index,
      namespace: signal.namespace,
      source: signal.source,
      kind: signal.kind,
      status: 'unresolved',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: false,
      conflictActive: false,
      registryVersion: null,
      reason: 'invalid_resolver_result'
    };
  }

  let status = STATUS_SET.has(clean(raw.status)) ? clean(raw.status) : 'unresolved';
  const matchedBy = clean(raw.matchedBy) || null;

  // Namespace safety: a resolver result is authoritative only when it came
  // through the exact path permitted for the validated signal namespace.
  if (POSITIVE_SET.has(status) && !signal.allowedMatchedBy.has(matchedBy)) {
    status = 'unresolved';
  }

  // Exact taxonomy input that simply is not present in CRUVIT is not a
  // provisional CRUVIT identity. It is unresolved for this adapter.
  if (
    signal.namespace === 'taxonomy_verified:scientific_name' &&
    status === 'provisional' &&
    Array.isArray(raw.warnings) &&
    raw.warnings.includes('not-in-registry')
  ) {
    status = 'unresolved';
  }

  const positive = POSITIVE_SET.has(status);
  return {
    signalIndex: signal.index,
    namespace: signal.namespace,
    source: signal.source,
    kind: signal.kind,
    status,
    canonicalSlug: positive ? (clean(raw.canonicalSlug) || null) : null,
    plantId: status === 'resolved_id' ? (clean(raw.plantId) || null) : null,
    matchedBy,
    needsReview: raw.needsReview === true,
    conflictActive: status === 'pending_conflict' || !!raw.conflict,
    registryVersion: clean(raw.registryVersion) || null,
    reason: positive && !clean(raw.canonicalSlug) ? 'positive_without_canonical_slug' : null
  };
}

function evidenceKey(signal) {
  return [signal.namespace, signal.value].join('\u0000');
}

function chooseRegistryVersion(results, resolver) {
  const versions = [...new Set(results.map(r => r.registryVersion).filter(Boolean))];
  if (versions.length === 1) return versions[0];
  if (versions.length > 1) return null;
  try {
    const v = resolver && typeof resolver.getRegistryVersion === 'function'
      ? clean(resolver.getRegistryVersion())
      : '';
    return v || null;
  } catch (_error) {
    return null;
  }
}

function frozenResult(fields) {
  return deepFreeze({
    adapterVersion: CANONICAL_IDENTIFICATION_RESOLUTION_ADAPTER_VERSION,
    status: fields.status,
    canonicalSlug: fields.canonicalSlug ?? null,
    plantId: fields.plantId ?? null,
    matchedBy: fields.matchedBy ?? null,
    needsReview: fields.needsReview === true,
    conflictActive: fields.conflictActive === true,
    registryVersion: fields.registryVersion ?? null,
    reasonCodes: Array.from(new Set(fields.reasonCodes || [])).sort(),
    accounting: fields.accounting,
    evidence: fields.evidence,
    diagnostics: {
      authority: 'diagnostic_only',
      data: fields.diagnostics == null ? null : cloneDiagnostic(fields.diagnostics)
    }
  });
}

function aggregate(results, accounting, diagnostics, registryVersion) {
  if (!results.length) {
    return unresolvedEnvelope(['no_authoritative_signals'], accounting, diagnostics, registryVersion);
  }

  const pending = results.filter(r => r.status === 'pending_conflict' || r.conflictActive);
  if (pending.length) {
    return frozenResult({
      status: 'pending_conflict',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: pending.some(r => r.needsReview),
      conflictActive: true,
      registryVersion,
      reasonCodes: ['pending_conflict_priority'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  if (results.some(r => r.status === 'ambiguous')) {
    return frozenResult({
      status: 'ambiguous',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: results.some(r => r.needsReview),
      conflictActive: false,
      registryVersion,
      reasonCodes: ['resolver_ambiguous'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  if (results.some(r => r.status === 'provisional')) {
    return frozenResult({
      status: 'provisional',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: true,
      conflictActive: false,
      registryVersion,
      reasonCodes: ['provisional_competing_signal'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  const positives = results.filter(r => POSITIVE_SET.has(r.status) && r.canonicalSlug);
  const unresolved = results.filter(r => r.status === 'unresolved' || (POSITIVE_SET.has(r.status) && !r.canonicalSlug));

  if (!positives.length) {
    return frozenResult({
      status: 'unresolved',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: results.some(r => r.needsReview),
      conflictActive: false,
      registryVersion,
      reasonCodes: ['no_resolved_identity'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  if (unresolved.length) {
    return frozenResult({
      status: 'ambiguous',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: results.some(r => r.needsReview),
      conflictActive: false,
      registryVersion,
      reasonCodes: ['resolved_and_unresolved_competing_candidates'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  const slugs = [...new Set(positives.map(r => r.canonicalSlug))];
  if (slugs.length !== 1) {
    return frozenResult({
      status: 'ambiguous',
      canonicalSlug: null,
      plantId: null,
      matchedBy: null,
      needsReview: positives.some(r => r.needsReview),
      conflictActive: false,
      registryVersion,
      reasonCodes: ['multiple_canonical_identities'],
      accounting,
      evidence: results,
      diagnostics
    });
  }

  const slug = slugs[0];
  const needsReview = positives.some(r => r.needsReview);
  const plantIds = [...new Set(positives.map(r => r.plantId).filter(Boolean))];
  const allResolvedId = positives.every(r => r.status === 'resolved_id');
  const status = allResolvedId && plantIds.length === 1 ? 'resolved_id' : 'resolved_canonical';
  const plantId = status === 'resolved_id' ? plantIds[0] : null;
  const matched = [...new Set(positives.map(r => r.matchedBy).filter(Boolean))];

  return frozenResult({
    status,
    canonicalSlug: slug,
    plantId,
    matchedBy: matched.length === 1 ? matched[0] : null,
    needsReview,
    conflictActive: false,
    registryVersion,
    reasonCodes: needsReview
      ? ['same_identity_resolved_needs_review']
      : [positives.length > 1 ? 'same_identity_multiple_validated_signals' : 'single_validated_signal_resolved'],
    accounting,
    evidence: results,
    diagnostics
  });
}

/**
 * @param {{resolver: {resolve: Function, getRegistryVersion?: Function}}} deps
 */
export function createCanonicalIdentificationResolutionAdapter({ resolver } = {}) {
  if (!resolver || typeof resolver.resolve !== 'function') {
    throw new TypeError('Explicit existing plant identity resolver dependency is required');
  }

  return Object.freeze({
    resolve(input) {
      try {
        const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const rawSignals = Array.isArray(source.signals) ? source.signals : [];
        const diagnostics = source.diagnostics ?? null;

        const accounting = {
          receivedSignals: rawSignals.length,
          authoritativeSignals: 0,
          rejectedSignals: 0,
          duplicateSignals: 0,
          resolverCalls: 0,
          resolvedSignals: 0,
          unresolvedSignals: 0
        };

        const accepted = [];
        const seen = new Set();

        for (let i = 0; i < rawSignals.length; i += 1) {
          const signal = normalizeSignal(rawSignals[i], i);
          if (!signal.accepted) {
            accounting.rejectedSignals += 1;
            continue;
          }
          const key = evidenceKey(signal);
          if (seen.has(key)) {
            accounting.duplicateSignals += 1;
            continue;
          }
          seen.add(key);
          accounting.authoritativeSignals += 1;
          accepted.push(signal);
        }

        if (!accepted.length) {
          return unresolvedEnvelope(
            rawSignals.length ? ['no_authoritative_signals', 'all_signals_rejected'] : ['no_validated_candidates'],
            accounting,
            diagnostics,
            chooseRegistryVersion([], resolver)
          );
        }

        const results = [];
        for (const signal of accepted) {
          let raw;
          try {
            accounting.resolverCalls += 1;
            raw = resolver.resolve(signal.resolverInput);
          } catch (_error) {
            raw = { status: 'unresolved', warnings: ['resolver-threw'] };
          }
          const result = normalizedResolverResult(signal, raw);
          if (POSITIVE_SET.has(result.status)) accounting.resolvedSignals += 1;
          else accounting.unresolvedSignals += 1;
          results.push(result);
        }

        return aggregate(
          results,
          accounting,
          diagnostics,
          chooseRegistryVersion(results, resolver)
        );
      } catch (_error) {
        return unresolvedEnvelope(['adapter_fail_closed'], {
          receivedSignals: 0,
          authoritativeSignals: 0,
          rejectedSignals: 0,
          duplicateSignals: 0,
          resolverCalls: 0,
          resolvedSignals: 0,
          unresolvedSignals: 0
        }, null, null);
      }
    }
  });
}
