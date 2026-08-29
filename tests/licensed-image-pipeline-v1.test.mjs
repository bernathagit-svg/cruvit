/**
 * Licensed Image Pipeline V1 — contract + acceptance harness.
 * Run: node --test tests/licensed-image-pipeline-v1.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMAGE_PENDING,
  IMAGE_READY,
  IMAGE_OWNER_REVIEW,
  LICENSE_POLICY,
  STORAGE_STRATEGY_V1,
  IMAGE_SOURCE_EVALUATION,
  evaluateLicenseForCommercialCatalog,
  scoreIdentityMatch,
  evaluateImageQuality,
  selectPrimaryImageCandidate,
  buildAttributionString,
  reuseCachedResolution,
  mediaCacheKey,
  readyMediaRecord
} from '../modules/catalog-media/licensed-image-pipeline-v1-contract.js';
import {
  resolveLicensedImageForPlant,
  searchCommonsImageCandidates
} from '../modules/catalog-media/wikimedia-commons-source-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SEED = path.join(ROOT, 'data', 'plants.seed.json');

const REPORT = {
  sources: IMAGE_SOURCE_EVALUATION,
  storage: STORAGE_STRATEGY_V1,
  licensePolicy: {
    acceptCount: LICENSE_POLICY.accept.length,
    rejectSubstrings: LICENSE_POLICY.rejectSubstrings
  },
  unit: {},
  falseMatch: [],
  acceptance: [],
  performance: {},
  idempotency: {}
};

function loadPlant(slug) {
  const doc = JSON.parse(fs.readFileSync(SEED, 'utf8').replace(/^\uFEFF/, ''));
  const p = (doc.plants || []).find((x) => x.slug === slug);
  assert.ok(p, slug);
  return {
    slug: p.slug,
    scientific: p.scientific,
    commonName: p.names?.en,
    names: p.names
  };
}

test('license allow/deny is explicit and fails closed on unknown', () => {
  assert.equal(evaluateLicenseForCommercialCatalog('CC0').ok, true);
  assert.equal(evaluateLicenseForCommercialCatalog('CC BY 4.0').ok, true);
  assert.equal(evaluateLicenseForCommercialCatalog('CC BY-SA 3.0').attributionRequired, true);
  assert.equal(evaluateLicenseForCommercialCatalog('CC BY-NC 4.0').ok, false);
  assert.equal(evaluateLicenseForCommercialCatalog('CC BY-ND 4.0').ok, false);
  assert.equal(evaluateLicenseForCommercialCatalog('').ok, false);
  assert.equal(evaluateLicenseForCommercialCatalog('All rights reserved').ok, false);
  assert.equal(evaluateLicenseForCommercialCatalog('Mystery License').ok, false);
  REPORT.unit.license = 'pass';
});

test('identity matching rejects genus-only and common-name collisions', () => {
  const cacao = { scientific: 'Theobroma cacao', commonName: 'Cacao', slug: 'cacao' };

  const binomial = scoreIdentityMatch(cacao, {
    title: 'Theobroma cacao fruit pods',
    description: 'Ripe Theobroma cacao pods on tree'
  });
  assert.equal(binomial.ok, true);
  assert.ok(binomial.score >= 70);

  const genusOnly = scoreIdentityMatch(cacao, {
    title: 'Theobroma grandiflorum cupuacu',
    description: 'Related Theobroma species, not cacao'
  });
  // has genus Theobroma but wrong epithet — genus+no cacao epithet
  assert.equal(genusOnly.ok, false);
  assert.ok(
    genusOnly.reasons.some((r) =>
      /genus-only|no-scientific|epithet-far|wrong-species/.test(r)
    )
  );

  const commonOnly = scoreIdentityMatch(cacao, {
    title: 'Cacao powder in a bowl',
    description: 'Processed chocolate product photo'
  });
  assert.equal(commonOnly.ok, false);
  assert.ok(commonOnly.reasons.includes('common-name-without-scientific'));

  REPORT.falseMatch.push(
    { case: 'binomial-ok', rejected: false, reasons: binomial.reasons },
    { case: 'genus-only', rejected: true, reasons: genusOnly.reasons },
    { case: 'common-name-collision', rejected: true, reasons: commonOnly.reasons }
  );
});

test('quality filter rejects tiny/svg/watermarked', () => {
  assert.equal(
    evaluateImageQuality({
      url: 'https://example.com/x.jpg',
      width: 120,
      height: 90,
      mimeType: 'image/jpeg'
    }).ok,
    false
  );
  assert.equal(
    evaluateImageQuality({
      url: 'https://example.com/x.svg',
      width: 800,
      height: 600,
      mimeType: 'image/svg+xml',
      title: 'Diagram'
    }).ok,
    false
  );
  assert.equal(
    evaluateImageQuality({
      url: 'https://example.com/x.jpg',
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      title: 'Plant with watermark overlay'
    }).ok,
    false
  );
  assert.equal(
    evaluateImageQuality({
      url: 'https://example.com/x.jpg',
      width: 900,
      height: 700,
      mimeType: 'image/jpeg',
      title: 'Theobroma cacao'
    }).ok,
    true
  );
});

test('selectPrimary rejects NC license and wrong species; accepts compliant hit', () => {
  const plant = { scientific: 'Cocos nucifera', commonName: 'Coconut', slug: 'coconut' };
  const selected = selectPrimaryImageCandidate(plant, [
    {
      title: 'Beach scene',
      url: 'https://example.com/beach.jpg',
      width: 1000,
      height: 800,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC BY 4.0',
      author: 'A',
      description: 'Tropical beach no palm identity'
    },
    {
      title: 'Cocos nucifera NC photo',
      url: 'https://example.com/nc.jpg',
      width: 1000,
      height: 800,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC BY-NC 3.0',
      author: 'B',
      description: 'Cocos nucifera palm'
    },
    {
      title: 'Cocos nucifera on coast',
      url: 'https://example.com/ok.jpg',
      width: 1200,
      height: 900,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      author: 'Jane Botanist',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Cocos_nucifera.jpg',
      description: 'Cocos nucifera coconut palm',
      sourceAssetId: 'File:Cocos_nucifera.jpg'
    }
  ]);
  assert.equal(selected.status, IMAGE_READY);
  assert.equal(selected.media.imageStatus, IMAGE_READY);
  assert.equal(selected.media.commercialUseAllowed, true);
  assert.equal(selected.media.attributionRequired, true);
  assert.match(selected.media.attribution, /Jane Botanist/);
  assert.ok(selected.rejected.some((r) => r.stage === 'license'));
  assert.ok(selected.rejected.some((r) => r.stage === 'identity'));
  REPORT.unit.selectPrimary = 'pass';
});

test('attribution string is generated from stored metadata', () => {
  const s = buildAttributionString({
    title: 'Theobroma cacao',
    author: 'Alice',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg'
  });
  assert.match(s, /Alice/);
  assert.match(s, /CC BY 4.0/);
  assert.match(s, /commons\.wikimedia\.org/);
});

test('idempotent cache reuse does not change primary without new evidence', () => {
  const plant = { slug: 'cacao', scientific: 'Theobroma cacao', commonName: 'Cacao' };
  const licenseEval = evaluateLicenseForCommercialCatalog('CC BY 4.0');
  const identity = scoreIdentityMatch(plant, {
    title: 'Theobroma cacao',
    description: 'Theobroma cacao tree'
  });
  const media = readyMediaRecord(
    plant,
    {
      title: 'Theobroma cacao',
      url: 'https://example.com/cacao.jpg',
      thumbUrl: 'https://example.com/cacao-thumb.jpg',
      author: 'Alice',
      licenseShortName: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Cacao.jpg',
      sourceAssetId: 'File:Cacao.jpg',
      width: 1000,
      height: 800,
      mimeType: 'image/jpeg'
    },
    identity,
    licenseEval
  );
  const cached = {
    status: IMAGE_READY,
    media,
    scientific: 'Theobroma cacao',
    resolvedAt: new Date().toISOString(),
    passedCount: 1
  };
  const reused = reuseCachedResolution(plant, cached);
  assert.ok(reused);
  assert.equal(reused.fromCache, true);
  assert.equal(reused.media.primaryUrl, media.primaryUrl);
  assert.equal(mediaCacheKey(plant), mediaCacheKey({ ...plant }));
  // Second reuse stable
  const reused2 = reuseCachedResolution(plant, cached);
  assert.equal(reused2.media.primaryUrl, reused.media.primaryUrl);
  REPORT.idempotency = { reuseStable: true, cacheKey: mediaCacheKey(plant) };
});

test('false-license and false-match audit sample', () => {
  const plant = { scientific: 'Actinidia deliciosa', commonName: 'Kiwi', slug: 'kiwi' };
  const audit = selectPrimaryImageCandidate(plant, [
    {
      title: 'Kiwi bird',
      description: 'A kiwi bird from New Zealand',
      url: 'https://example.com/bird.jpg',
      width: 900,
      height: 700,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC BY 4.0',
      author: 'X'
    },
    {
      title: 'Actinidia arguta',
      description: 'Actinidia arguta hardy kiwi',
      url: 'https://example.com/arguta.jpg',
      width: 900,
      height: 700,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC BY 4.0',
      author: 'Y'
    },
    {
      title: 'Actinidia deliciosa fruit',
      description: 'Actinidia deliciosa kiwifruit on vine',
      url: 'https://example.com/deliciosa.jpg',
      width: 1100,
      height: 800,
      mimeType: 'image/jpeg',
      licenseShortName: 'CC0',
      author: 'Z',
      sourceAssetId: 'File:Actinidia_deliciosa.jpg',
      sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Actinidia_deliciosa.jpg'
    },
    {
      title: 'Actinidia deliciosa reserved',
      description: 'Actinidia deliciosa',
      url: 'https://example.com/arr.jpg',
      width: 900,
      height: 700,
      mimeType: 'image/jpeg',
      licenseShortName: 'All rights reserved',
      author: 'Q'
    }
  ]);
  assert.equal(audit.status, IMAGE_READY);
  assert.match(audit.media.primaryUrl, /deliciosa/);
  const stages = audit.rejected.map((r) => r.stage);
  assert.ok(stages.includes('identity'));
  assert.ok(stages.includes('license'));
  const falseRejectRate =
    audit.rejected.filter((r) => r.stage === 'identity' || r.stage === 'license').length /
    4;
  REPORT.falseMatch.push({
    case: 'kiwi-collision-and-license',
    rejectedCount: audit.rejected.length,
    selected: audit.media.sourceAssetId,
    falseMatchOrLicenseRejectRate: falseRejectRate
  });
});

test('live Commons acceptance set (bounded)', async (t) => {
  const slugs = ['cacao', 'coconut', 'cypress', 'kiwi', 'plumeria'];
  const mem = new Map();
  const cacheStore = {
    get: (k) => mem.get(k) || null,
    set: (k, v) => mem.set(k, v)
  };

  const tBatch = performance.now();
  for (const slug of slugs) {
    const plant = loadPlant(slug);
    await new Promise((r) => setTimeout(r, 350));
    let resolution;
    try {
      resolution = await resolveLicensedImageForPlant(plant, {
        cacheStore,
        limit: 10,
        bypassCache: false
      });
    } catch (err) {
      t.skip(`${slug} network error: ${err?.message || err}`);
      return;
    }
    if (resolution.sourceError && /http-429|fetch-failed/.test(resolution.sourceError)) {
      t.skip(`${slug} rate-limited: ${resolution.sourceError}`);
      continue;
    }

    assert.ok(
      [IMAGE_READY, IMAGE_PENDING, IMAGE_OWNER_REVIEW].includes(resolution.status),
      `${slug} unexpected status ${resolution.status}`
    );

    if (resolution.status === IMAGE_READY) {
      assert.ok(resolution.media.primaryUrl);
      assert.ok(resolution.media.license);
      assert.equal(resolution.media.commercialUseAllowed, true);
      assert.ok(resolution.media.provenance);
      if (resolution.media.attributionRequired) {
        assert.ok(resolution.media.attribution);
        assert.ok(resolution.media.author || resolution.media.attribution);
      }
      // Must not be empty license
      assert.equal(evaluateLicenseForCommercialCatalog(resolution.media.license).ok, true);
    } else {
      assert.ok(resolution.media.pendingReason || resolution.status === IMAGE_OWNER_REVIEW);
    }

    // Idempotent second resolve hits cache
    const again = await resolveLicensedImageForPlant(plant, { cacheStore });
    if (resolution.status === IMAGE_READY) {
      assert.equal(again.fromCache, true);
      assert.equal(again.media.primaryUrl, resolution.media.primaryUrl);
    }

    REPORT.acceptance.push({
      slug,
      scientific: plant.scientific,
      status: resolution.status,
      license: resolution.media?.license || null,
      attributionRequired: resolution.media?.attributionRequired ?? null,
      pendingReason: resolution.media?.pendingReason || null,
      searchMs: resolution.searchMs,
      licenseValidationMs: resolution.licenseValidationMs,
      candidateCount: resolution.candidateCount,
      passedCount: resolution.passedCount,
      rejectedTop: (resolution.rejected || []).slice(0, 3)
    });
  }
  REPORT.performance.batch5Ms = performance.now() - tBatch;
  REPORT.performance.perPlantMeanMs =
    REPORT.acceptance.length > 0
      ? REPORT.acceptance.reduce((a, r) => a + (r.searchMs || 0), 0) / REPORT.acceptance.length
      : null;

  const cacao = REPORT.acceptance.find((r) => r.slug === 'cacao');
  assert.ok(cacao, 'cacao acceptance row required');
  assert.ok(
    cacao.status === IMAGE_READY ||
      cacao.status === IMAGE_PENDING ||
      cacao.status === IMAGE_OWNER_REVIEW
  );
});

test('write gate report', () => {
  const out = path.join(HERE, '_licensed-image-pipeline-v1-report.json');
  const ready = REPORT.acceptance.filter((r) => r.status === IMAGE_READY).length;
  const pending = REPORT.acceptance.filter((r) => r.status !== IMAGE_READY).length;
  const verdict =
    REPORT.unit.license === 'pass' &&
    REPORT.unit.selectPrimary === 'pass' &&
    REPORT.idempotency?.reuseStable &&
    REPORT.acceptance.length >= 1
      ? 'PASS'
      : 'FAIL';
  const full = {
    ...REPORT,
    summary: { ready, pending, verdict },
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(out, JSON.stringify(full, null, 2) + '\n');
  assert.equal(verdict, 'PASS');
  console.log('\nLICENSED_IMAGE_PIPELINE_V1_QUALITY_GATE:', verdict);
  console.log('acceptance:', REPORT.acceptance);
});
