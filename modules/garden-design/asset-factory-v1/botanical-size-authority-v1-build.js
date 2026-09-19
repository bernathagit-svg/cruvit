/**
 * Builds the promoted botanical-size authority registry from the accepted gate.
 * Writer/CLI only. Runtime reader must not import this file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DIMENSION_EVIDENCE } from './physical-scale-foundation-v1.js';
import { SIZE_EVIDENCE_SCENARIOS } from './botanical-size-evidence-contract-v2.js';
import { WAVE_CONFLICTS, mapPilotRecordsToWave } from './tree-size-evidence-wave-v1.js';
import { WAVE_NEW_EVIDENCE_RECORDS } from './tree-size-evidence-wave-v1-records.js';
import {
  RUNTIME_AUTHORITY,
  buildRuntimeAuthorityRecords,
  slugToBotanicalTaxonId
} from './tree-size-production-authority-gate-v1.js';
import {
  BOTANICAL_SIZE_AUTHORITY_VERSION,
  EXPECTED_AUTHORITY_ACCOUNTING,
  botanicalSizeAuthorityPath,
  validateBotanicalSizeAuthority
} from './botanical-size-authority-v1.js';

function allEvidence() {
  return [...mapPilotRecordsToWave(), ...WAVE_NEW_EVIDENCE_RECORDS];
}

function sourceRows(records, scenario) {
  return records.filter(
    (row) =>
      row.evidenceClass === DIMENSION_EVIDENCE.SOURCE_SUPPORTED_RANGE
      && (!scenario || row.sizeScenario === scenario)
  );
}

function rangeKey(row) {
  return JSON.stringify({
    h0: row.heightMinM ?? null,
    h1: row.heightMaxM ?? null,
    s0: row.spreadMinM ?? null,
    s1: row.spreadMaxM ?? null
  });
}

function bothDims(row) {
  return (Number.isFinite(row.heightMinM) || Number.isFinite(row.heightMaxM))
    && (Number.isFinite(row.spreadMinM) || Number.isFinite(row.spreadMaxM));
}

function pickCompleteRangeRecord(rows) {
  const complete = rows.filter(bothDims);
  if (!complete.length) return null;
  const keys = new Set(complete.map(rangeKey));
  if (keys.size > 1) {
    throw new Error(`ready-range-conflict:${complete.map((row) => row.recordId).join(',')}`);
  }
  return complete[0];
}

function pickHeightRecord(rows) {
  const withHeight = rows.filter((row) => Number.isFinite(row.heightMinM) || Number.isFinite(row.heightMaxM));
  if (!withHeight.length) return null;
  const keys = new Set(withHeight.map((row) => JSON.stringify({ h0: row.heightMinM ?? null, h1: row.heightMaxM ?? null })));
  if (keys.size > 1) return null;
  return withHeight[0];
}

function sensitivityFrom(records) {
  const flags = records.flatMap((row) => row.flags || []);
  const cultivarSensitive = records.some((row) => row.cultivarOrRootstockSensitive) || flags.includes('CULTIVAR_OR_ROOTSTOCK_SENSITIVE');
  const cultivarVariable = flags.includes('CULTIVAR_VARIABLE');
  const rootstockSensitive = records.some((row) => row.sizeScenario === SIZE_EVIDENCE_SCENARIOS.ROOTSTOCK_SPECIFIC)
    || flags.includes('CULTIVAR_OR_ROOTSTOCK_SENSITIVE');
  const maintainedForm = records.some((row) => row.sizeScenario === SIZE_EVIDENCE_SCENARIOS.MAINTAINED_GARDEN);
  const notFinalPersonalGardenSize = records.some((row) => row.notFinalPersonalGardenSize);
  const reasons = [];
  if (cultivarSensitive) reasons.push('cultivar sensitive');
  if (rootstockSensitive) reasons.push('rootstock sensitive');
  if (cultivarVariable) reasons.push('cultivar variable');
  if (maintainedForm && notFinalPersonalGardenSize) reasons.push('maintained form');
  if (notFinalPersonalGardenSize) reasons.push('not final personal garden size');
  if (!reasons.length && (cultivarSensitive || notFinalPersonalGardenSize)) reasons.push('other supported qualifier');
  return Object.freeze({
    cultivarSensitive: Boolean(cultivarSensitive),
    rootstockSensitive: Boolean(rootstockSensitive),
    cultivarVariable: Boolean(cultivarVariable),
    maintainedForm: Boolean(maintainedForm && notFinalPersonalGardenSize),
    notFinalPersonalGardenSize: Boolean(notFinalPersonalGardenSize),
    reasons: Object.freeze(reasons)
  });
}

function scientificNameFrom(records) {
  const named = records.find((row) => row.scientificName);
  return named?.scientificName || null;
}

function conflictIds(taxonId, records) {
  const fromConflicts = WAVE_CONFLICTS
    .filter((row) => row.botanicalTaxonId === taxonId)
    .flatMap((row) => [row.sourceA, row.sourceB]);
  const fromRecords = records.map((row) => row.recordId).filter(Boolean);
  return [...new Set([...fromConflicts, ...fromRecords])];
}

function promote(row, evidence) {
  const records = evidence.filter((item) => item.botanicalTaxonId === row.botanicalTaxonId);
  const scenario = row.runtimeAuthority === RUNTIME_AUTHORITY.USER_CONTEXT_REQUIRED
    || row.runtimeAuthority === RUNTIME_AUTHORITY.CONFLICT_HOLD
    || row.runtimeAuthority === RUNTIME_AUTHORITY.EVIDENCE_GAP
    ? null
    : row.defaultPreviewScenario;
  const scoped = sourceRows(records, scenario);
  const provenanceEvidenceIds = records.map((item) => item.recordId).filter(Boolean);
  const base = {
    botanicalTaxonId: row.botanicalTaxonId,
    canonicalSlugAliases: row.canonicalAliases,
    scientificName: scientificNameFrom(records),
    architectureMode: 'tree',
    growthStage: 'mature',
    runtimeAuthority: row.runtimeAuthority,
    defaultPreviewScenario: scenario,
    selectedHeightEvidenceRef: null,
    selectedSpreadEvidenceRef: null,
    selectedSource: null,
    normalizedRange: null,
    provenanceEvidenceIds,
    conflictingEvidenceIds: null,
    partialAnchor: row.partialAnchor,
    spreadSourceSupported: false,
    HEIGHT_SCALE_READY: row.HEIGHT_SCALE_READY,
    SPREAD_SCALE_READY: row.SPREAD_SCALE_READY,
    unknownFields: row.unknownFields,
    sensitivity: sensitivityFrom(records),
    gardenDesignFallback: 'Estimated size + tree form heuristic + manual resize',
    authorityVersion: BOTANICAL_SIZE_AUTHORITY_VERSION,
    runtimeWired: false
  };

  if (row.runtimeAuthority === RUNTIME_AUTHORITY.READY) {
    const picked = pickCompleteRangeRecord(scoped);
    if (!picked) throw new Error(`ready-missing-complete-range:${row.botanicalTaxonId}`);
    return {
      ...base,
      selectedHeightEvidenceRef: picked.recordId,
      selectedSpreadEvidenceRef: picked.recordId,
      selectedSource: picked.recordId,
      normalizedRange: {
        heightM: { min: picked.heightMinM ?? null, max: picked.heightMaxM ?? null },
        spreadM: { min: picked.spreadMinM ?? null, max: picked.spreadMaxM ?? null }
      },
      spreadSourceSupported: true,
      gardenDesignFallback: null
    };
  }

  if (row.runtimeAuthority === RUNTIME_AUTHORITY.PARTIAL) {
    const heightRecord = row.botanicalTaxonId === 'taxon:plinia-cauliflora' ? null : pickHeightRecord(scoped);
    return {
      ...base,
      selectedHeightEvidenceRef: heightRecord?.recordId || (provenanceEvidenceIds[0] || null),
      selectedSpreadEvidenceRef: null,
      selectedSource: null,
      normalizedRange: heightRecord
        ? {
          heightM: { min: heightRecord.heightMinM ?? null, max: heightRecord.heightMaxM ?? null },
          spreadM: { min: null, max: null }
        }
        : { heightM: { min: null, max: null }, spreadM: { min: null, max: null } },
      spreadSourceSupported: false,
      contextSeparableHeight: row.botanicalTaxonId === 'taxon:plinia-cauliflora'
    };
  }

  if (row.runtimeAuthority === RUNTIME_AUTHORITY.USER_CONTEXT_REQUIRED) {
    return {
      ...base,
      botanicalEvidenceRemainsValid: true,
      mayChooseUniversalPersonalGardenSize: false,
      gardenDesignFallback: 'Estimated size + manual resize'
    };
  }

  if (row.runtimeAuthority === RUNTIME_AUTHORITY.CONFLICT_HOLD) {
    return {
      ...base,
      conflictingEvidenceIds: conflictIds(row.botanicalTaxonId, sourceRows(records)),
      selectedSource: null,
      selectedHeightEvidenceRef: null,
      selectedSpreadEvidenceRef: null,
      normalizedRange: null
    };
  }

  return {
    ...base,
    provenanceEvidenceIds,
    normalizedRange: null,
    meterTruth: false
  };
}

export function buildBotanicalSizeAuthorityRegistry() {
  const authority = buildRuntimeAuthorityRecords();
  const evidence = allEvidence();
  const records = authority.map((row) => promote(row, evidence));
  const registry = {
    contract: BOTANICAL_SIZE_AUTHORITY_VERSION,
    authorityVersion: BOTANICAL_SIZE_AUTHORITY_VERSION,
    runtimeWired: false,
    immutableFromUserActions: true,
    universalDefaultPreviewScenario: null,
    mergeCanonicalSlugsNow: false,
    provenanceOverlay: 'data/garden-design/tree-size-evidence-wave-v1/',
    note: 'Promoted botanical-size authority. Raw research overlays remain provenance. User resize, mango LOW, photo calibration, and maintained targets are Garden Design state and must not mutate this registry.',
    slugToBotanicalTaxonId: slugToBotanicalTaxonId(),
    expectedAccounting: EXPECTED_AUTHORITY_ACCOUNTING,
    records
  };
  const validation = validateBotanicalSizeAuthority(registry);
  if (!validation.ok) {
    throw new Error(`botanical-size-authority-v1-invalid:${validation.errors.join(',')}`);
  }
  return registry;
}

export function writeBotanicalSizeAuthorityRegistry(root) {
  const registry = buildBotanicalSizeAuthorityRegistry();
  const filePath = botanicalSizeAuthorityPath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(registry, null, 2)}\n`);
  return { path: filePath, runtimeWired: registry.runtimeWired, records: registry.records.length };
}
