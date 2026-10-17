// Local data/contract qualification only. No browser, provider, database, or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const acceptedCommit = 'e8ffb340af7a5f9820632e569d251a414d5800ec';
const ownerManifestPath = 'core-v1/plant-identification/owner-approved-manifest.json';
const expected = [
  ['PI-01', 'Identify', 'c7f5e042079b0739a8a161283da51d94a81a21b7ff017d5c283d7f3817f881e9', 2310742],
  ['PI-02', 'Camera', '5d4b74d17ebb12cf29e069c0c2a02d685b05554b2267cccadd45f29e67593dd0', 3406426],
  ['PI-03', 'Analyzing', '13bba1f5b4258a3e97f3034ab01d01b69b069d102809682fc3ed00d4bbc0e906', 1786662],
  ['PI-04', 'Result', 'c2956e34f6dd2bf22c0351f044f7aa54095957cb099b244981aad81b737ec107', 3391582],
  ['PI-05', 'Plant Profile', '05ac40be70dcbf7376639747a69af9deb083916cafe81cd009b89241e2e7ca35', 3347862],
  ['PI-06', 'Care', '04d8fb6f3c9df16f7334e11b854e489870c2626d91b1c052a3d124410d6f168f', 2456618],
  ['PI-07', 'Suitability', 'c6ad1fc59e28622b3aedbcfa2e2a4cfe6cf435aa0c81e9a74eedeead75ce7e59', 2020150],
  ['PI-08', 'Save to My Garden', '7dfd2e9bfa4c6f981c86d046ccca4125afa19c7ab5381daaca53567ed00be166', 2405466],
];
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read(ownerManifestPath));
const golden = JSON.parse(read('core-v1/CRUVIT_GOLDEN_BASELINE_V1.json'));
const assetDirectory = path.join(root, 'core-v1/plant-identification/assets');
const context = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
const chunks = fs.readdirSync(assetDirectory).filter(name => /^s[1-8]-\d{2}\.js$/.test(name)).sort();
assert.equal(chunks.length, 29, 'The exact accepted 29-part asset set is required');
for (const name of chunks) {
  vm.runInContext(fs.readFileSync(path.join(assetDirectory, name), 'utf8'), context, { timeout: 1000, filename: name });
}
const actual = expected.map(([id], index) => {
  const parts = context.window.__PI?.[index];
  assert.ok(Array.isArray(parts) && parts.length > 0, id + ': missing asset');
  const dataUrl = Array.from(parts).join('');
  assert.ok(dataUrl.startsWith('data:image/png;base64,'), id + ': PNG data URL required');
  const raw = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
  assert.deepEqual(raw.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), id + ': PNG signature');
  return { id, length: dataUrl.length, sha256: crypto.createHash('sha256').update(raw).digest('hex') };
});

test('all eight reconstructed PNGs match the final Owner SHA-256 authorities', () => {
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i].sha256, expected[i][2], expected[i][0]);
  }
});

test('final data-URL lengths agree with the actual assets and runtime integrity guard', () => {
  const html = read('core-v1/plant-identification/index.html');
  const matches = [...html.matchAll(/const expected=(\[[\d,\s]+\]);/g)];
  assert.equal(matches.length, 1, 'One runtime length authority is required');
  const lengths = expected.map(row => row[3]);
  assert.deepEqual(actual.map(row => row.length), lengths);
  assert.deepEqual(JSON.parse(matches[0][1]), lengths);
  assert.match(html, /screens\.some\(\(s,i\)=>s\.length!==expected\[i\]\)/);
});

test('owner-approved manifest describes the exact cumulative accepted assets', () => {
  assert.equal(manifest.accepted_cumulative_pi_commit, acceptedCommit);
  assert.deepEqual(manifest.screen_order, expected.map(row => row[1]));
  assert.deepEqual(manifest.asset_sha256, expected.map(row => row[2]));
  assert.deepEqual(manifest.asset_sha256, actual.map(row => row.sha256));
  assert.deepEqual(manifest.asset_string_lengths, expected.map(row => row[3]));
  assert.deepEqual(manifest.asset_string_lengths, actual.map(row => row.length));
});

test('Golden baseline distinguishes historical provenance from the final cumulative PI authority', () => {
  const pi = golden.plantIdentification;
  assert.equal(pi.sourceCommit, acceptedCommit);
  assert.equal(pi.sourceCommit, manifest.accepted_cumulative_pi_commit);
  assert.equal(pi.authorityScope, 'CURRENT_CUMULATIVE_OWNER_APPROVED_VISUAL');
  assert.equal(pi.ownerApprovedManifestPath, ownerManifestPath);
  assert.equal(Object.hasOwn(pi, 'approvedPackage'), false, 'Old package must not remain current authority');
  assert.equal(Object.hasOwn(pi, 'externalApprovedArtifact'), false);
  assert.equal(Object.hasOwn(pi, 'fullResProvenance'), false);
  assert.equal(pi.screens.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const [id, name, sha256, length] = expected[i];
    const screen = pi.screens[i];
    assert.equal(screen.id, id);
    assert.equal(screen.name, name);
    assert.equal(screen.status, 'OWNER_APPROVED_VISUAL');
    assert.equal(screen.sha256, sha256, id);
    assert.equal(screen.sha256, actual[i].sha256, id);
    assert.equal(screen.assetStringLength, length, id);
    assert.equal(screen.assetStringLength, actual[i].length, id);
  }
  assert.deepEqual(pi.historicalPackage, {
    authorityScope: 'HISTORICAL_PROVENANCE_ONLY',
    sourceBranch: 'plant-id-approved-flow-v2-20261005',
    sourceCommit: 'b7d1464254477996617aeaa20ad346b30534d75e',
    approvedPackage: {
      path: 'ux-lab/plant-id-approved-flow-v2/',
      treeSha: '01f33d2478f723e94383acdb7c1fa55524a1b87a',
      assetsTreeSha: '595ea3ace7692ba616b1a1ab7d1d97c320ed5440',
      indexBlobSha: '309a11a177eb06fd81e48c57e244dce640c1d954',
      manifestBlobSha: '18bf0da0487250fe76e9102f246619a8547373af',
    },
    externalApprovedArtifact: {
      sourceName: 'CRUVIT-Plant-ID-APPROVED-FLOW-2026-10-05-v2.html',
      sha256: '3c8b0175771dab0735f4a0394f62bf4bf68dfce760363f8ad31ca8b9111fc15b',
    },
    fullResProvenance: {
      sourceName: 'CRUVIT-Plant-Identification-FullRes-Flow.html',
      sha256: '7de39ba43c2b4f5f9d96ca236a693adb79430c4acb6d52974675b04569ca09ed',
    },
  });
});

test('PI-04 revision preserves historical approval provenance and pins the exact new Owner asset', () => {
  const revision=manifest.visual_revisions['PI-04'];
  assert.equal(revision.implementation_base, 'fcc44ec71650ffdd3b16208c28cdac725370d222');
  assert.equal(revision.sha256, 'c2956e34f6dd2bf22c0351f044f7aa54095957cb099b244981aad81b737ec107');
  assert.equal(revision.previous_sha256, 'd5586de26a3f6223a717f861df933f1cc58df8c7adebd83a347c367b7db2d4c1');
  assert.deepEqual([revision.width,revision.height,revision.asset_string_length],[891,1765,3391582]);
  assert.deepEqual(golden.plantIdentification.screens[3].visualRevision,revision);
});
