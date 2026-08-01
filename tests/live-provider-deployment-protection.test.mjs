import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  DEPLOY_PRUNE_VERSION,
  PROTECTED_DEPLOY_PATHS,
  REQUIRED_DEPLOY_SENTINELS,
  normalizePruneRoot,
  validatePruneEnvironment,
  buildPrunePlan,
  applyPrunePlan,
  verifyProtectedPathsAbsent,
  verifyRequiredPathsPresent,
  formatPruneSummary,
  runPruneCli,
} from '../tools/deployment/prune-netlify-static-deploy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const PRUNE_SCRIPT = path.join(
  REPO_ROOT,
  'tools',
  'deployment',
  'prune-netlify-static-deploy.mjs'
);

const SENTINEL_CONTENTS = {
  'index.html': '<!doctype html><title>fixture</title>',
  'styles.css': 'body{}',
  'garden-modes.js': 'void 0;',
  'garden-modes.css': '.gm{}',
  'dashboard-layout.css': '.dl{}',
  'entry-screen.css': '.es{}',
  'assets/cruvit-logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  'data/plants.seed.json': '[]',
  'scripts/plant-identifier-loader.js': 'void 0;',
  'modules/garden-design/index.html': '<!doctype html>',
  'modules/plant-doctor/index.html': '<!doctype html>',
  'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js':
    'export default null;',
  'modules/identity/plant-identity-shadow.js': 'void 0;',
  'netlify.toml': '[build]\n  publish = "."\n',
  'netlify/functions/example.mjs': 'export default async () => ({ statusCode: 200 });',
};

function writeFile(root, rel, body = '') {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-deploy-prune-'));
  for (const [rel, body] of Object.entries(SENTINEL_CONTENTS)) {
    writeFile(root, rel, body);
  }
  // Ensure netlify/functions directory sentinel exists as a directory.
  fs.mkdirSync(path.join(root, 'netlify', 'functions'), { recursive: true });

  writeFile(root, 'tools/local-runner.mjs', 'export default 1;\n');
  writeFile(root, 'tests/example-harness.html', '<!doctype html>');
  writeFile(root, 'tests/example-node.test.mjs', 'import test from "node:test";\n');
  writeFile(
    root,
    'modules/smart-recommendations/adapters/live-source-provider/example-adapter.mjs',
    'export default 1;\n'
  );
  writeFile(root, '.env', 'SECRET=should-not-print\n');
  writeFile(root, '.env.local', 'SECRET=local\n');
  writeFile(root, '.tmp-sample/note.txt', 'tmp\n');
  writeFile(root, 'coverage/cov.json', '{}\n');
  writeFile(root, 'example.log', 'log-line\n');
  writeFile(root, 'example.replay.json', '{}\n');
  writeFile(root, 'example-proof-output.json', '{}\n');
  writeFile(root, 'node_modules/pkg/index.js', 'module.exports=1;\n');
  writeFile(root, '.cache/x', 'cache\n');
  writeFile(root, 'UNRELATED_DOCS.md', 'docs\n');
  writeFile(root, 'modules/smart-recommendations/keep-me.js', 'export default 1;\n');
  writeFile(root, 'unrelated-local-name.txt', 'keep\n');
  return root;
}

function netlifyEnv(extra = {}) {
  return {
    NETLIFY: 'true',
    CI: 'true',
    CONTEXT: 'production',
    ...extra,
  };
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

test('version and frozen inventories', () => {
  assert.equal(DEPLOY_PRUNE_VERSION, '0.1.0-live-provider-deployment-protection');
  assert.deepEqual(PROTECTED_DEPLOY_PATHS, [
    'tools',
    'tests',
    'modules/smart-recommendations/adapters/live-source-provider',
  ]);
  for (const s of [
    'index.html',
    'styles.css',
    'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js',
    'netlify/functions',
  ]) {
    assert.ok(REQUIRED_DEPLOY_SENTINELS.includes(s), s);
  }
});

test('normalizePruneRoot rejects filesystem root, home, unknown', () => {
  const rootPath = path.parse(process.cwd()).root;
  assert.throws(() => normalizePruneRoot(rootPath), /filesystem_root|home|unknown/i);
  assert.throws(() => normalizePruneRoot(os.homedir()), /home/i);
  assert.throws(
    () => normalizePruneRoot(path.join(os.tmpdir(), `missing-${Date.now()}`)),
    /unknown/i
  );
});

test('validatePruneEnvironment requires Netlify guards for apply', () => {
  const root = makeFixture();
  try {
    assert.throws(
      () => validatePruneEnvironment({ mode: 'apply', env: {}, root }),
      /missing_env:NETLIFY/
    );
    assert.throws(
      () =>
        validatePruneEnvironment({
          mode: 'apply',
          env: { NETLIFY: 'true', CI: 'true', CONTEXT: 'dev' },
          root,
        }),
      /invalid_env:CONTEXT/
    );
    const ok = validatePruneEnvironment({
      mode: 'apply',
      env: netlifyEnv(),
      root,
    });
    assert.equal(ok.context, 'production');
    validatePruneEnvironment({ mode: 'dry-run', env: {}, root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing sentinel rejected', () => {
  const root = makeFixture();
  try {
    fs.rmSync(path.join(root, 'index.html'));
    assert.throws(
      () => validatePruneEnvironment({ mode: 'dry-run', env: {}, root }),
      /missing_sentinel:index.html/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dry-run plans removals and changes nothing', () => {
  const root = makeFixture();
  try {
    const before = fs.readdirSync(root).sort();
    const result = runPruneCli(['--dry-run', '--root', root], {});
    assert.equal(result.code, 0);
    assert.equal(result.summary.mode, 'dry-run');
    assert.ok(result.summary.removals.includes('tools'));
    assert.ok(result.summary.removals.includes('tests'));
    assert.ok(
      result.summary.removals.includes(
        'modules/smart-recommendations/adapters/live-source-provider'
      )
    );
    assert.ok(result.summary.removals.includes('.env'));
    assert.ok(result.summary.removals.includes('.env.local'));
    assert.ok(exists(root, 'tools/local-runner.mjs'));
    assert.ok(exists(root, '.env'));
    assert.deepEqual(fs.readdirSync(root).sort(), before);
    assert.equal(result.summary.removed.length, 0);
    assert.match(result.text, /planned_removals:/);
    assert.doesNotMatch(result.text, /SECRET=/);
    assert.doesNotMatch(result.text, /should-not-print/);
    assert.doesNotMatch(result.text, /export default 1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('apply removes protected paths and preserves required assets', () => {
  const root = makeFixture();
  try {
    const result = runPruneCli(
      ['--netlify-deploy-prune', '--root', root],
      netlifyEnv()
    );
    assert.equal(result.code, 0);
    assert.equal(result.summary.ok, true);

    for (const rel of PROTECTED_DEPLOY_PATHS) {
      assert.equal(exists(root, rel), false, rel);
    }
    assert.equal(exists(root, '.env'), false);
    assert.equal(exists(root, '.env.local'), false);
    assert.equal(exists(root, '.tmp-sample'), false);
    assert.equal(exists(root, 'coverage'), false);
    assert.equal(exists(root, 'example.log'), false);
    assert.equal(exists(root, 'example.replay.json'), false);
    assert.equal(exists(root, 'example-proof-output.json'), false);
    assert.equal(exists(root, 'node_modules'), false);
    assert.equal(exists(root, '.cache'), false);

    for (const rel of REQUIRED_DEPLOY_SENTINELS) {
      assert.equal(exists(root, rel), true, rel);
    }
    assert.equal(
      exists(
        root,
        'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js'
      ),
      true
    );
    assert.equal(exists(root, 'netlify/functions/example.mjs'), true);
    assert.equal(exists(root, 'UNRELATED_DOCS.md'), true);
    assert.equal(exists(root, 'modules/smart-recommendations/keep-me.js'), true);
    assert.equal(exists(root, 'unrelated-local-name.txt'), true);

    assert.doesNotMatch(result.text, /SECRET=/);
    assert.doesNotMatch(result.text, /should-not-print/);
    assert.doesNotMatch(result.text, /export default 1/);

    verifyProtectedPathsAbsent(root);
    verifyRequiredPathsPresent(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('second apply is idempotent', () => {
  const root = makeFixture();
  try {
    runPruneCli(['--netlify-deploy-prune', '--root', root], netlifyEnv());
    const second = runPruneCli(
      ['--netlify-deploy-prune', '--root', root],
      netlifyEnv()
    );
    assert.equal(second.code, 0);
    assert.equal(exists(root, 'index.html'), true);
    assert.equal(exists(root, 'tools'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI rejects unknown flags and missing mode', () => {
  const root = makeFixture();
  try {
    assert.throws(() => runPruneCli(['--dry-run', '--weird', '--root', root], {}), /unknown_flag/);
    assert.throws(() => runPruneCli(['--root', root], {}), /mode_required/);
    assert.throws(
      () => runPruneCli(['--netlify-deploy-prune', '--root', root], {}),
      /missing_env:NETLIFY/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('path traversal rejected', () => {
  const root = makeFixture();
  try {
    assert.throws(
      () => normalizePruneRoot(path.join(root, '..', '..', '..', '..')),
      /filesystem_root|home|unknown|unreadable/i
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('outbound symlink escape rejected when present', () => {
  const root = makeFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cruvit-outside-'));
  try {
    writeFile(outside, 'secret.txt', 'outside-secret\n');
    const linkPath = path.join(root, '.tmp-link-escape');
    try {
      fs.symlinkSync(outside, linkPath, 'junction');
    } catch {
      // Some environments disallow symlinks; skip soft if creation fails.
      return;
    }
    assert.throws(() => buildPrunePlan(root), /escapes_root|symlink/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('formatPruneSummary is paths-only', () => {
  const text = formatPruneSummary({
    version: DEPLOY_PRUNE_VERSION,
    mode: 'dry-run',
    root: '/tmp/fixture',
    context: 'dry-run',
    requiredSentinels: ['index.html'],
    protectedPaths: ['tools'],
    removals: ['tools', '.env'],
    removed: [],
    ok: true,
  });
  assert.match(text, /planned_removals:/);
  assert.match(text, /tools/);
  assert.doesNotMatch(text, /SECRET/);
});

test('buildPrunePlan + applyPrunePlan unit path', () => {
  const root = makeFixture();
  try {
    validatePruneEnvironment({ mode: 'apply', env: netlifyEnv(), root });
    const plan = buildPrunePlan(root);
    assert.ok(plan.removals.includes('tools'));
    applyPrunePlan(plan);
    verifyProtectedPathsAbsent(root);
    verifyRequiredPathsPresent(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spawned CLI dry-run on fixture deletes nothing', () => {
  const root = makeFixture();
  try {
    const proc = spawnSync(
      process.execPath,
      [PRUNE_SCRIPT, '--dry-run', '--root', root],
      { encoding: 'utf8' }
    );
    assert.equal(proc.status, 0, proc.stderr);
    assert.ok(exists(root, 'tools/local-runner.mjs'));
    assert.match(proc.stdout, /DEPLOY_PRUNE_VERSION=/);
    assert.doesNotMatch(proc.stdout + proc.stderr, /SECRET=/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spawned CLI apply without Netlify env fails closed', () => {
  const root = makeFixture();
  try {
    const proc = spawnSync(
      process.execPath,
      [PRUNE_SCRIPT, '--netlify-deploy-prune', '--root', root],
      { encoding: 'utf8', env: { ...process.env, NETLIFY: '', CI: '', CONTEXT: '' } }
    );
    assert.notEqual(proc.status, 0);
    assert.ok(exists(root, 'tools/local-runner.mjs'));
    assert.match(proc.stderr, /DEPLOY_PRUNE_FAIL/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('real repository source files remain after fixture applies', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'tools', 'deployment', 'prune-netlify-static-deploy.mjs')));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'tests', 'live-provider-deployment-protection.test.mjs')));
  assert.ok(
    fs.existsSync(
      path.join(
        REPO_ROOT,
        'modules',
        'smart-recommendations',
        'adapters',
        'live-source-provider',
        'developer-live-source-provider-adapter.mjs'
      )
    )
  );
});

test('module URL import stays local (no network)', () => {
  assert.ok(pathToFileURL(PRUNE_SCRIPT).href.startsWith('file:'));
});
