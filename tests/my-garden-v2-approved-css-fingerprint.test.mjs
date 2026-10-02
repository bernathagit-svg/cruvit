import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

function gitBlobSha(buffer) {
  const header = Buffer.from('blob ' + buffer.length + '\0');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

const expected = Object.freeze({
  'approved-home.css': 'b157b1969f5b2880e7252baf6f98813320d22709',
  'botanical-home.css': 'd317b1204bf3dff927e935d2ddca05da9d5e312e',
  'garden-photo.css': 'd808f2cd6d4518a7efc5b31deb715024f3b6e9fb',
});

for (const [name, sha] of Object.entries(expected)) {
  test('approved CSS fingerprint remains unchanged: ' + name, () => {
    const file = new URL('../modules/my-garden-v2/visual-contract/' + name, import.meta.url);
    const bytes = fs.readFileSync(file);
    assert.equal(gitBlobSha(bytes), sha);
  });
}
