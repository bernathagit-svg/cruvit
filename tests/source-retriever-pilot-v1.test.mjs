/**
 * Hardiness evidence + transform honesty + retriever pilot proofs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PILOT_PLANT_SPECS,
  extractFrostColdExcerpts,
  extractHardinessZoneExcerpt,
  extractExplicitHardinessZones,
  identityMatchText,
  buildPilotCandidatesFromFetched,
  simulateReadinessWithCandidates,
  candidatePacketFingerprint,
  createUrlCache,
  fetchHtmlCached
} from '../modules/personal-domain/source-retriever-pilot-v1.js';
import {
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim,
  HARDINESS_CLAIM_TYPE
} from '../modules/personal-domain/hardiness-evidence-claims-v1.js';
import {
  HARDINESS_ZONE_TO_COLD_TRAITS_ID,
  HARDINESS_ZONE_TO_COLD_TRAITS_VERSION,
  applyHardinessZoneToColdTraits
} from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import {
  FROST_INJURY_TO_FROST_SENSITIVITY_ID,
  applyFrostInjuryToFrostSensitivity
} from '../modules/personal-domain/frost-injury-to-frost-sensitivity-v1.js';
import { EVIDENCE_CLASS } from '../modules/personal-domain/plant-data-contract-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const appleHtml = `
<html><body>
<h1>Malus domestica (Apple)</h1>
<p>Malus domestica is a temperate fruit tree.</p>
<p>Hardiness Zone: 4a, 4b, 5a, 5b, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b Fruit: Fruit Color: Gold</p>
<p>Trees can be damaged by late frosts that injure blossoms and reduce fruit yield.</p>
<p>CC BY 4.0 Download Image 13 - Wake Co.</p>
</body></html>`;

const pomegranateHtml = `
<html><body>
<h1>Punica granatum (Pomegranate)</h1>
<p>Hardiness Zone: 8a, 8b, 9a, 9b, 10a, 10b Fruit: Fruit Color: Red</p>
<p>The plant usually survives the winter but will be killed to the ground at temperatures below 10&deg; F.</p>
</body></html>`;

const plantSpec = PILOT_PLANT_SPECS.find((p) => p.slug === 'apple');
const pomSpec = PILOT_PLANT_SPECS.find((p) => p.slug === 'pomegranate');
const currentPlant = {
  slug: 'apple',
  name: 'Apple',
  scientific: 'Malus domestica',
  climateTraits: {
    frostSensitivity: 'medium',
    coldTolerance: 'medium',
    heatTolerance: 'medium',
    sunNeeds: 'full_sun',
    waterNeeds: 'medium',
    humidityTolerance: 'medium',
    drainageNeeds: 'high',
    floweringRequirements: 'Needs chill and mild frost risk for bloom.',
    fruitingRequirements: 'Fruit set needs pollination and warmth.',
    needsReview: false,
    traitEvidenceClasses: {
      frostSensitivity: 'HEURISTIC_ASSERTION',
      coldTolerance: 'HEURISTIC_ASSERTION',
      heatTolerance: 'HEURISTIC_ASSERTION',
      humidityTolerance: 'HEURISTIC_ASSERTION',
      sunNeeds: 'HEURISTIC_ASSERTION',
      waterNeeds: 'HEURISTIC_ASSERTION',
      drainageNeeds: 'HEURISTIC_ASSERTION',
      floweringRequirements: 'HEURISTIC_ASSERTION',
      fruitingRequirements: 'HEURISTIC_ASSERTION'
    }
  }
};

function builtFrom(html, spec = plantSpec, plant = currentPlant) {
  return buildPilotCandidatesFromFetched({
    plantSpec: spec,
    queueJob: null,
    currentPlant: plant,
    fetchedSources: [
      {
        ...spec.approvedSources[0],
        body: html,
        status: 200,
        retrievedAt: '2026-09-08T00:00:00.000Z',
        fromCache: true,
        sha256: 'abc'
      }
    ]
  });
}

test('1. hardiness zone stored as direct source-supported claim', () => {
  const claim = extractUsdaHardinessZoneBandClaim(appleHtml.replace(/<[^>]+>/g, ' '));
  assert.equal(claim.claimType, HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND);
  assert.equal(claim.hardinessZoneMin, 4);
  assert.equal(claim.hardinessZoneMax, 9);
  const built = builtFrom(appleHtml);
  assert.ok(
    built.evidenceRecords.some(
      (e) =>
        e.sourceClaim?.claimType === HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND &&
        e.sourcePolicyEligibility?.mayBeSourceSupported === true
    )
  );
});

test('2. raw zone claim is not identical to CRUVIT frost ordinal', () => {
  const claim = extractUsdaHardinessZoneBandClaim(appleHtml.replace(/<[^>]+>/g, ' '));
  assert.notEqual(claim.rawValue, 'medium');
  assert.notEqual(claim.rawValue, 'high');
  assert.match(claim.rawValue, /^\d+-\d+$/);
  const xf = applyHardinessZoneToColdTraits(claim);
  assert.equal(xf.frostSensitivity.authorized, false);
  assert.ok(!xf.outputs.some((o) => o.targetField === 'frostSensitivity'));
});

test('3. unauthorized transform cannot be READY_TO_APPLY', () => {
  const packet = {
    targetField: 'coldTolerance',
    proposedValue: 'high',
    applyStatus: 'READY_TO_APPLY',
    transformId: null,
    transformVersion: null,
    evidenceClass: EVIDENCE_CLASS.SOURCE_SUPPORTED
  };
  // Simulation must skip packets missing transform id/version
  const sim = simulateReadinessWithCandidates(currentPlant, [packet]);
  assert.equal(sim.fieldsAppliedInSimulation, 0);
});

test('4. authorized transform carries id/version', () => {
  const built = builtFrom(appleHtml);
  const cold = built.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  assert.equal(cold.applyStatus, 'READY_TO_APPLY');
  assert.equal(cold.transformId, HARDINESS_ZONE_TO_COLD_TRAITS_ID);
  assert.equal(cold.transformVersion, HARDINESS_ZONE_TO_COLD_TRAITS_VERSION);
  assert.ok(cold.sourceClaim);
  assert.ok(cold.normalizedTraitCandidate);
  assert.notEqual(cold.sourceClaim.rawValue, cold.normalizedTraitCandidate.value);
});

test('5. zone-only evidence does not create frostSensitivity READY', () => {
  const built = builtFrom(appleHtml);
  const frost = built.fieldPackets.find((f) => f.targetField === 'frostSensitivity');
  assert.equal(frost.applyStatus, 'NEEDS_MORE_EVIDENCE');
  assert.equal(frost.transformId, null);
  // late frost blossom alone is insufficient under frost-injury transform
});

test('6. direct frost injury statement may support frost claim', () => {
  const plant = {
    ...currentPlant,
    slug: 'pomegranate',
    scientific: 'Punica granatum',
    climateTraits: { ...currentPlant.climateTraits }
  };
  const built = builtFrom(pomegranateHtml, pomSpec, plant);
  const frost = built.fieldPackets.find((f) => f.targetField === 'frostSensitivity');
  assert.equal(frost.applyStatus, 'READY_TO_APPLY');
  assert.equal(frost.transformId, FROST_INJURY_TO_FROST_SENSITIVITY_ID);
  assert.equal(frost.proposedValue, 'high');
  assert.equal(frost.sourceClaim.damageMode, 'killed_to_ground');
  const cold = built.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  assert.equal(cold.applyStatus, 'READY_TO_APPLY');
});

test('7. excerpt excludes unrelated Fruit/license/caption text', () => {
  const z = extractHardinessZoneExcerpt(appleHtml.replace(/<[^>]+>/g, ' '));
  assert.ok(z);
  assert.match(z, /Hardiness Zone:/);
  assert.doesNotMatch(z, /Fruit Color|Download Image|CC BY/);
  const built = builtFrom(appleHtml);
  const cold = built.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  assert.doesNotMatch(cold.supportingExcerpt, /Fruit Color|Download Image/);
});

test('8. packet separates sourceClaim from transformed output', () => {
  const built = builtFrom(appleHtml);
  const cold = built.fieldPackets.find((f) => f.targetField === 'coldTolerance');
  assert.equal(cold.sourceClaim.claimType, HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND);
  assert.equal(cold.normalizedTraitCandidate.field, 'coldTolerance');
  assert.equal(cold.normalizedTraitCandidate.value, 'high');
  assert.ok(cold.evidenceLineage.includes('DERIVED_FROM_SOURCE'));
});

test('9. raw cache is excluded from Git scope', () => {
  const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gi, /data\/catalog\/enrichment-retrieval\/cache\//);
});

test('10. no catalog mutation', () => {
  const appBefore = fs.readFileSync(path.join(ROOT, 'app.html'));
  const seedBefore = fs.readFileSync(path.join(ROOT, 'data', 'plants.seed.json'));
  const before = JSON.stringify(currentPlant);
  builtFrom(appleHtml);
  assert.equal(JSON.stringify(currentPlant), before);
  assert.ok(appBefore.equals(fs.readFileSync(path.join(ROOT, 'app.html'))));
  assert.ok(seedBefore.equals(fs.readFileSync(path.join(ROOT, 'data', 'plants.seed.json'))));
});

test('11. repeated candidate generation deterministic', () => {
  const a = builtFrom(appleHtml);
  const b = builtFrom(appleHtml);
  assert.equal(candidatePacketFingerprint(a), candidatePacketFingerprint(b));
});

test('helpers: license digits do not pollute zones; frost injury extract', () => {
  assert.deepEqual(
    extractExplicitHardinessZones('Malus domestica CC BY 4.0 Download Image 13 - Wake Co.'),
    []
  );
  const injury = extractFrostInjuryClaim(
    'Punica granatum will be killed to the ground at temperatures below 10° F.'
  );
  assert.equal(injury.damageMode, 'killed_to_ground');
  assert.equal(injury.minimumWinterTemperatureF, 10);
  const xf = applyFrostInjuryToFrostSensitivity(injury);
  assert.equal(xf.ok, true);
  assert.equal(xf.outputs[0].value, 'high');
  const zoneAsFrost = applyFrostInjuryToFrostSensitivity(
    extractUsdaHardinessZoneBandClaim('Hardiness Zone: 4a, 5a Fruit: x')
  );
  assert.equal(zoneAsFrost.ok, false);
});

test('simulation: cold-only authorized leaves readiness B', () => {
  const built = builtFrom(appleHtml);
  const sim = simulateReadinessWithCandidates(currentPlant, built.fieldPackets);
  assert.equal(sim.current.readinessShort, 'B');
  assert.equal(sim.simulated.readinessShort, 'B');
  assert.equal(sim.fieldsAppliedInSimulation, 1);
});

test('cache reuse', async () => {
  const dir = path.join(ROOT, 'data', 'catalog', 'enrichment-retrieval', '_test-cache');
  fs.rmSync(dir, { recursive: true, force: true });
  const cache = createUrlCache(dir);
  const url = plantSpec.approvedSources[0].url;
  const mockFetch = async () => ({
    status: 200,
    headers: { get: () => 'text/html' },
    arrayBuffer: async () => Buffer.from(appleHtml)
  });
  const r1 = await fetchHtmlCached(url, cache, mockFetch);
  const r2 = await fetchHtmlCached(url, cache, mockFetch);
  assert.equal(r1.fromCache, false);
  assert.equal(r2.fromCache, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('identity mismatch still rejected', () => {
  const id = identityMatchText('This page covers Malus only as a genus overview.', 'Malus domestica', 'apple');
  assert.equal(id.ok, false);
});
