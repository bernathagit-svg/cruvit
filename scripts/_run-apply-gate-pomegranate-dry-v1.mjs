/**
 * Pomegranate Apply Gate v1 dry-run report — no catalog writes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateCandidateSetForPlant,
  plantContentHash,
  FUTURE_ATOMIC_WRITE_SPEC,
  CATALOG_ENRICHMENT_APPLY_GATE_REF
} from '../modules/personal-domain/catalog-enrichment-apply-gate-v1.js';
import { applyAllBootstrapStructuralClimateTraitsMigrations } from '../modules/personal-domain/bootstrap-safe-climate-traits-migration-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packetsDir = path.join(root, 'data', 'catalog', 'enrichment-retrieval', 'candidate-packets');

function loadPlant(slug) {
  const app = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const libStart = app.indexOf('const PLANT_LIBRARY=[');
  const libEnd = app.indexOf('\n];', libStart);
  const block = app.slice(libStart, libEnd);
  const unique = [];
  const seen = new Set();
  for (const part of block.split(/\{slug:'/).slice(1)) {
    const chunk = "{slug:'" + part;
    const lineEnd = chunk.indexOf('\n');
    const one = lineEnd > 0 ? chunk.slice(0, lineEnd) : chunk;
    const s = (one.match(/slug:'([^']+)'/) || [])[1];
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const name = ((one.match(/name:'((?:\\'|[^'])*)'/) || [])[1] || s).replace(/\\'/g, "'");
    const scientific = ((one.match(/scientific:'((?:\\'|[^'])*)'/) || [])[1] || '').replace(
      /\\'/g,
      "'"
    );
    unique.push({ slug: s, name, scientific });
  }
  const index = Object.fromEntries(unique.map((p) => [p.slug, { ...p }]));
  applyAllBootstrapStructuralClimateTraitsMigrations(Object.values(index), index);
  return index[slug];
}

function loadPacket(slug) {
  return JSON.parse(fs.readFileSync(path.join(packetsDir, `${slug}.candidate-packet-v1.json`), 'utf8'));
}

const plantHashBefore = {
  pomegranate: null,
  apple: null,
  fig: null
};

const report = {
  gateRef: CATALOG_ENRICHMENT_APPLY_GATE_REF,
  parentCommit: '6e37aa4875fee0b4e532ad5d78e9ec4f5033e0da',
  generatedAt: new Date().toISOString(),
  dryRun: true,
  catalogMutated: false,
  externalRequests: 0,
  futureAtomicWrite: FUTURE_ATOMIC_WRITE_SPEC,
  plants: {}
};

for (const slug of ['pomegranate', 'apple', 'fig']) {
  const plant = loadPlant(slug);
  plantHashBefore[slug] = plantContentHash(plant);
  const packet = loadPacket(slug);
  const evalResult = evaluateCandidateSetForPlant({ packet, plant });
  const afterHash = plantContentHash(plant);
  report.plants[slug] = {
    selectedForPilotWrite: evalResult.selectedForPilotWrite,
    setDecision: evalResult.setDecision,
    setReasons: evalResult.setReasons,
    writePlanGenerated: evalResult.writePlanGenerated,
    fieldResults: evalResult.fieldResults.map((r) => ({
      field: r.field,
      decision: r.decision,
      reasons: r.reasons,
      currentValue: r.currentValue,
      currentEvidenceClass: r.currentEvidenceClass,
      candidateValue: r.candidateValue,
      candidateEvidenceClass: r.candidateEvidenceClass,
      sourceClaim: r.sourceClaim
        ? { claimType: r.sourceClaim.claimType, rawValue: r.sourceClaim.rawValue }
        : null,
      transformRef: r.transformRef || null,
      contradictionClass: r.contradictionClass || null,
      proposedMutation: r.proposedMutation
        ? {
            action: r.proposedMutation.action,
            before: r.proposedMutation.before,
            after: {
              value: r.proposedMutation.after.value,
              evidenceClass: r.proposedMutation.after.evidenceClass,
              fieldOrigin: r.proposedMutation.after.fieldOrigin
            }
          }
        : null
    })),
    mutationPlan: evalResult.mutationPlan
      ? {
          ok: evalResult.mutationPlan.ok,
          writesCatalog: evalResult.mutationPlan.writesCatalog,
          jsonDiff: evalResult.mutationPlan.jsonDiff,
          planFingerprint: evalResult.mutationPlan.planFingerprint,
          guards: evalResult.mutationPlan.guards
        }
      : null,
    readinessSimulation: evalResult.readinessSimulation,
    plantBytesUnchanged: afterHash === plantHashBefore[slug]
  };
}

const outDir = path.join(root, 'data', 'catalog', 'enrichment-retrieval');
const outPath = path.join(outDir, 'catalog-enrichment-apply-gate-v1-pomegranate-dry-run.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      ok: true,
      outPath,
      pomegranate: report.plants.pomegranate.setDecision,
      sim: report.plants.pomegranate.readinessSimulation,
      apple: report.plants.apple.setDecision,
      fig: report.plants.fig.setDecision,
      plantBytesUnchanged: Object.fromEntries(
        Object.entries(report.plants).map(([k, v]) => [k, v.plantBytesUnchanged])
      )
    },
    null,
    2
  )
);
