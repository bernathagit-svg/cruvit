/**
 * catalog-retrieval-coverage-v2 — dry evidence coverage tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOG_RETRIEVAL_COVERAGE_V2_REF,
  COVERAGE_V2_LOCKED_SLUGS,
  COVERAGE_V2_REQUEST_CAPS,
  FROST_EVIDENCE_TAXONOMY_V2,
  buildCoverageV2PlantSpecs,
  computeCoverageV2ExperimentFingerprint,
  assertZoneCannotCreateFrost,
  runRetrievalCoverageV2Dry
} from '../modules/personal-domain/catalog-retrieval-coverage-v2.js';
import {
  HARDINESS_CLAIM_TYPE,
  HARDINESS_ZONE_SYSTEM,
  HARDINESS_EVIDENCE_CLAIMS_REF,
  extractUsdaHardinessZoneBandClaim,
  extractFrostInjuryClaim
} from '../modules/personal-domain/hardiness-evidence-claims-v1.js';
import { applyFrostInjuryToFrostSensitivity } from '../modules/personal-domain/frost-injury-to-frost-sensitivity-v1.js';
import { applyHardinessZoneToColdTraits } from '../modules/personal-domain/hardiness-zone-to-cold-traits-v1.js';
import { WORKER_MAX_JOBS } from '../modules/personal-domain/auto-enrichment-worker-v1.js';
import {
  hashFile,
  bootstrapSafeMigrationPaths
} from '../modules/personal-domain/catalog-enrichment-apply-writer-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('coverage v2 ref + same 10 locked slugs + production maxJobs unchanged', () => {
  assert.equal(CATALOG_RETRIEVAL_COVERAGE_V2_REF, 'catalog-retrieval-coverage-v2@1.0.0');
  assert.equal(COVERAGE_V2_LOCKED_SLUGS.length, 10);
  assert.deepEqual(
    [...COVERAGE_V2_LOCKED_SLUGS],
    [
      'guava',
      'lychee',
      'mandarin',
      'mango',
      'orange',
      'raspberry',
      'apple',
      'fig',
      'peach',
      'pear'
    ]
  );
  assert.equal(WORKER_MAX_JOBS, 3);
  assert.match(HARDINESS_EVIDENCE_CLAIMS_REF, /hardiness-evidence-claims-v1@1\.1\.0/);
});

test('1. hardiness zone alone cannot create frost SS', () => {
  const zone = {
    claimType: HARDINESS_CLAIM_TYPE.USDA_HARDINESS_ZONE_BAND,
    hardinessZoneMin: 9,
    hardinessZoneMax: 11,
    hardinessZoneSystem: HARDINESS_ZONE_SYSTEM.USDA
  };
  const frostXf = applyFrostInjuryToFrostSensitivity(zone);
  assert.equal(frostXf.ok, false);
  const guard = assertZoneCannotCreateFrost(zone);
  assert.equal(guard.ZONE_TO_FROST_MISUSE, false);
  assert.ok(FROST_EVIDENCE_TAXONOMY_V2.zoneToFrostMisuseForbidden);
});

test('2. direct institutional frost-injury / freeze-injury wording can map', () => {
  const claim = extractFrostInjuryClaim(
    'The cultivar is frost tender and must be protected in winter.'
  );
  assert.ok(claim);
  assert.equal(claim.damageMode, 'frost_tender');
  const xf = applyFrostInjuryToFrostSensitivity(claim);
  assert.equal(xf.ok, true);
  assert.equal(xf.outputs[0].targetField, 'frostSensitivity');

  const freeze = extractFrostInjuryClaim(
    'Mature trees can survive short freezes, but damage may occur if the freeze is prolonged.'
  );
  assert.ok(freeze);
  assert.equal(freeze.damageMode, 'frost_sensitive');
  assert.equal(applyFrostInjuryToFrostSensitivity(freeze).ok, true);
});

test('3. weak frost wording rejected', () => {
  assert.equal(extractFrostInjuryClaim('This plant likes cool weather and winter chill hours.'), null);
  assert.equal(extractFrostInjuryClaim('USDA Hardiness Zones 9-11.'), null);
  const late = extractFrostInjuryClaim(
    'Late spring frost may damage blossoms on early flowering cultivars.'
  );
  assert.ok(late);
  assert.equal(late.damageMode, 'late_frost_blossom_risk');
  assert.equal(applyFrostInjuryToFrostSensitivity(late).ok, false);
});

test('4. cold fallback zone "through" extraction remains transform-compatible', () => {
  const claim = extractUsdaHardinessZoneBandClaim(
    'USDA Hardiness Zones 10A through 11; as these zones shift in Florida.'
  );
  assert.ok(claim);
  assert.equal(claim.hardinessZoneMin, 10);
  assert.equal(claim.hardinessZoneMax, 11);
  const xf = applyHardinessZoneToColdTraits(claim);
  assert.equal(xf.ok, true);
  assert.equal(xf.outputs[0].targetField, 'coldTolerance');
  assert.equal(xf.frostSensitivity.authorized, false);
});

test('5-7. request caps + URL dedupe + no infinite fallback', () => {
  assert.equal(COVERAGE_V2_REQUEST_CAPS.maxPerPlant, 4);
  assert.equal(COVERAGE_V2_REQUEST_CAPS.maxTotal, 40);
  assert.equal(COVERAGE_V2_REQUEST_CAPS.noUnlimitedFallbackLoops, true);
  assert.equal(COVERAGE_V2_REQUEST_CAPS.dedupeUrls, true);
  const specs = buildCoverageV2PlantSpecs();
  for (const s of specs) {
    assert.ok(s.approvedSources.length <= COVERAGE_V2_REQUEST_CAPS.maxPerPlant);
    const urls = s.approvedSources.map((x) => x.url);
    assert.equal(new Set(urls).size, urls.length);
  }
});

test('8-10. dry run isolates artifacts; catalog + queue untouched', async () => {
  const paths = bootstrapSafeMigrationPaths(ROOT);
  const queuePath = path.join(
    ROOT,
    'data/catalog/enrichment-queue/current-catalog-enrichment-queue-v1.json'
  );
  const before = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser),
    queue: hashFile(queuePath)
  };
  const lemonDurable = path.join(
    ROOT,
    'data/catalog/enrichment-retrieval/candidate-packets/lemon.candidate-packet-v1.json'
  );
  const lemonBefore = fs.existsSync(lemonDurable) ? fs.readFileSync(lemonDurable) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-cov2-'));
  const artifactRoot = path.join(tmp, 'retrieval');
  const html =
    '<html><body>Psidium guajava. USDA Hardiness Zones 10A through 11. The plant is frost tender.</body></html>';
  const fetchImpl = async () => {
    const buf = Buffer.from(html, 'utf8');
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => html,
      arrayBuffer: async () => buf
    };
  };
  const queueDoc = {
    jobs: COVERAGE_V2_LOCKED_SLUGS.map((slug) => ({
      jobId: `enrich-v1:${slug}`,
      canonicalSlug: slug,
      scientificName: buildCoverageV2PlantSpecs().find((s) => s.slug === slug).scientificName,
      priority: 'P1',
      enrichmentExecution: 'AUTO',
      gapCodes: ['MISSING_FROST_EVIDENCE', 'MISSING_COLD_EVIDENCE']
    }))
  };
  const plantsBySlug = Object.fromEntries(
    buildCoverageV2PlantSpecs().map((s) => [
      s.slug,
      { slug: s.slug, scientific: s.scientificName, climateTraits: {} }
    ])
  );
  // Only run guava-sized subset via custom specs to keep test fast
  const guavaSpec = buildCoverageV2PlantSpecs().find((s) => s.slug === 'guava');
  const result = await runRetrievalCoverageV2Dry({
    repoRoot: ROOT,
    queueDoc,
    plantsBySlug: { guava: plantsBySlug.guava },
    artifactRoot,
    cacheDir: path.join(tmp, 'cache'),
    plantSpecs: [
      {
        ...guavaSpec,
        approvedSources: guavaSpec.approvedSources.slice(0, 1)
      }
    ],
    maxTotal: 4,
    maxPerPlant: 2,
    fetchImpl
  });
  assert.ok(result.summary.experimentFingerprint);
  assert.equal(result.summary.ZONE_TO_FROST_MISUSE_COUNT, 0);
  assert.ok(fs.existsSync(path.join(artifactRoot, 'candidate-packets', 'guava.candidate-packet-v1.json')));
  const after = {
    json: hashFile(paths.json),
    js: hashFile(paths.js),
    browser: hashFile(paths.browser),
    queue: hashFile(queuePath)
  };
  assert.deepEqual(after, before);
  if (lemonBefore) assert.deepEqual(fs.readFileSync(lemonDurable), lemonBefore);
});

test('11. experiment fingerprint stable for same 10 + baseline commit', () => {
  const a = computeCoverageV2ExperimentFingerprint();
  const b = computeCoverageV2ExperimentFingerprint();
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});
