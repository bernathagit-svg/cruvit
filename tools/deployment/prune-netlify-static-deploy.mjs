#!/usr/bin/env node
/**
 * Netlify static deploy-tree prune for CRUVIT local-only paths.
 * Apply mode is Netlify-build-only. Never deletes from a developer checkout
 * without NETLIFY=true, CI=true, and an approved CONTEXT.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEPLOY_PRUNE_VERSION = '0.1.0-live-provider-deployment-protection';

/** Local-only trees that must be absent from the static publish output. */
export const PROTECTED_DEPLOY_PATHS = Object.freeze([
  'tools',
  'tests',
  'modules/smart-recommendations/adapters/live-source-provider',
]);

/** Browser/app assets that must remain after pruning. */
export const REQUIRED_DEPLOY_SENTINELS = Object.freeze([
  'index.html',
  'styles.css',
  'garden-modes.js',
  'garden-modes.css',
  'dashboard-layout.css',
  'entry-screen.css',
  'assets/cruvit-logo.svg',
  'data/plants.seed.json',
  'scripts/plant-identifier-loader.js',
  'modules/garden-design/index.html',
  'modules/plant-doctor/index.html',
  'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js',
  'modules/identity/plant-identity-shadow.js',
  'netlify.toml',
  'netlify/functions',
]);

const APPROVED_CONTEXTS = new Set(['production', 'deploy-preview', 'branch-deploy']);

const EXTRA_BASENAME_PATTERNS = Object.freeze([
  { kind: 'exact', value: '.env' },
  { kind: 'prefix', value: '.env.' },
  { kind: 'prefix', value: '.tmp-' },
  { kind: 'exact', value: 'coverage' },
  { kind: 'exact', value: 'node_modules' },
  { kind: 'exact', value: '.npm' },
  { kind: 'exact', value: '.cache' },
  { kind: 'exact', value: '.DS_Store' },
  { kind: 'exact', value: 'Thumbs.db' },
  { kind: 'suffix', value: '.log' },
  { kind: 'suffix', value: '.replay.json' },
  { kind: 'suffix', value: '-proof-output.json' },
  { kind: 'suffix', value: '.swp' },
]);

const NEVER_PRUNE_PREFIXES = Object.freeze([
  'assets/',
  'data/',
  'scripts/',
  'netlify/',
  'modules/garden-design/',
  'modules/identity/',
  'modules/plant-doctor/',
  'modules/plant-identifier/',
  'modules/smart-rec/',
  'modules/suitability/',
]);

const NEVER_PRUNE_EXACT = Object.freeze([
  'index.html',
  'styles.css',
  'garden-modes.js',
  'garden-modes.css',
  'dashboard-layout.css',
  'entry-screen.css',
  'netlify.toml',
  'PROJECT_STATUS.md',
  'modules/smart-recommendations/developer-reviewed-data-live-source-provider.js',
]);

function posixRel(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/');
}

function isInsideRoot(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function matchExtraBasename(name) {
  for (const rule of EXTRA_BASENAME_PATTERNS) {
    if (rule.kind === 'exact' && name === rule.value) return true;
    if (rule.kind === 'prefix' && name.startsWith(rule.value)) return true;
    if (rule.kind === 'suffix' && name.endsWith(rule.value)) return true;
  }
  return false;
}

function isNeverPruneRel(relPosix) {
  if (!relPosix || relPosix === '.') return true;
  if (NEVER_PRUNE_EXACT.includes(relPosix)) return true;
  for (const prefix of NEVER_PRUNE_PREFIXES) {
    if (relPosix === prefix.slice(0, -1) || relPosix.startsWith(prefix)) return true;
  }
  // Preserve all smart-recommendations modules except the local adapter tree.
  if (
    relPosix.startsWith('modules/smart-recommendations/') &&
    !relPosix.startsWith('modules/smart-recommendations/adapters/live-source-provider')
  ) {
    return true;
  }
  return false;
}

export function normalizePruneRoot(inputRoot) {
  if (inputRoot == null || String(inputRoot).trim() === '') {
    throw new Error('prune_root_empty');
  }
  const resolved = path.resolve(String(inputRoot));
  if (resolved === path.parse(resolved).root) {
    throw new Error('prune_root_is_filesystem_root');
  }
  const home = path.resolve(os.homedir());
  if (resolved === home) {
    throw new Error('prune_root_is_home_directory');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error('prune_root_unknown_or_not_directory');
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(resolved);
  } catch {
    throw new Error('prune_root_unreadable');
  }
  if (realRoot === path.parse(realRoot).root) {
    throw new Error('prune_root_is_filesystem_root');
  }
  if (realRoot === home) {
    throw new Error('prune_root_is_home_directory');
  }
  return realRoot;
}

export function validatePruneEnvironment(options = {}) {
  const mode = options.mode;
  const env = options.env || process.env;
  const root = options.root;
  if (mode !== 'apply' && mode !== 'dry-run') {
    throw new Error('prune_mode_invalid');
  }
  if (!root) throw new Error('prune_root_missing');

  for (const sentinel of REQUIRED_DEPLOY_SENTINELS) {
    const abs = path.join(root, ...sentinel.split('/'));
    if (!fs.existsSync(abs)) {
      throw new Error(`missing_sentinel:${sentinel}`);
    }
  }

  if (mode === 'dry-run') {
    return { mode, context: 'dry-run', netlify: false, ci: false };
  }

  if (env.NETLIFY !== 'true') throw new Error('missing_env:NETLIFY');
  if (env.CI !== 'true') throw new Error('missing_env:CI');
  const context = String(env.CONTEXT || '');
  if (!APPROVED_CONTEXTS.has(context)) throw new Error('invalid_env:CONTEXT');

  return { mode, context, netlify: true, ci: true };
}

function assertTargetSafe(root, absPath) {
  if (!isInsideRoot(root, absPath)) {
    throw new Error(`path_escapes_root:${posixRel(root, absPath)}`);
  }
  let real;
  try {
    if (fs.existsSync(absPath)) {
      real = fs.realpathSync(absPath);
    } else {
      // For not-yet-resolved parents, realpath the nearest existing ancestor.
      let cursor = absPath;
      while (!fs.existsSync(cursor)) {
        const parent = path.dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
      real = path.join(fs.realpathSync(cursor), path.relative(cursor, absPath));
      real = path.resolve(real);
    }
  } catch {
    throw new Error(`path_unreadable:${posixRel(root, absPath)}`);
  }
  if (!isInsideRoot(root, real)) {
    throw new Error(`symlink_or_path_escapes_root:${posixRel(root, absPath)}`);
  }
  return real;
}

function collectExtraMatches(root) {
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = posixRel(root, abs);
      if (!rel || rel.startsWith('..')) continue;
      // Skip walking into protected trees; they are handled as whole-tree removals.
      if (
        rel === 'tools' ||
        rel.startsWith('tools/') ||
        rel === 'tests' ||
        rel.startsWith('tests/') ||
        rel === 'modules/smart-recommendations/adapters/live-source-provider' ||
        rel.startsWith('modules/smart-recommendations/adapters/live-source-provider/')
      ) {
        continue;
      }
      // Env/cache/temp basenames are removable even under otherwise-preserved trees.
      if (matchExtraBasename(ent.name)) {
        if (NEVER_PRUNE_EXACT.includes(rel)) {
          throw new Error(`unexpected_delete_candidate:${rel}`);
        }
        matches.push(rel);
        continue;
      }
      if (isNeverPruneRel(rel)) {
        if (ent.isDirectory() && !ent.isSymbolicLink()) stack.push(abs);
        continue;
      }
      if (ent.isDirectory() && !ent.isSymbolicLink()) {
        stack.push(abs);
      }
    }
  }
  return matches;
}

export function buildPrunePlan(rootInput) {
  const root = normalizePruneRoot(rootInput);
  const planned = new Set();

  for (const rel of PROTECTED_DEPLOY_PATHS) {
    const abs = path.join(root, ...rel.split('/'));
    if (fs.existsSync(abs)) {
      assertTargetSafe(root, abs);
      planned.add(rel);
    }
  }

  for (const rel of collectExtraMatches(root)) {
    const abs = path.join(root, ...rel.split('/'));
    assertTargetSafe(root, abs);
    if (isNeverPruneRel(rel)) {
      throw new Error(`unexpected_delete_candidate:${rel}`);
    }
    planned.add(rel);
  }

  // Deterministic order: extras first (path length desc so children before parents),
  // then protected trees; tools last among protected trees.
  const list = [...planned].sort((a, b) => {
    const aTools = a === 'tools' || a.startsWith('tools/');
    const bTools = b === 'tools' || b.startsWith('tools/');
    if (aTools !== bTools) return aTools ? 1 : -1;
    if (b.length !== a.length) return b.length - a.length;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return {
    root,
    version: DEPLOY_PRUNE_VERSION,
    removals: list,
    requiredSentinels: [...REQUIRED_DEPLOY_SENTINELS],
    protectedPaths: [...PROTECTED_DEPLOY_PATHS],
  };
}

export function applyPrunePlan(plan) {
  const removed = [];
  for (const rel of plan.removals) {
    const abs = path.join(plan.root, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    assertTargetSafe(plan.root, abs);
    fs.rmSync(abs, { recursive: true, force: false });
    removed.push(rel);
  }
  return removed;
}

export function verifyProtectedPathsAbsent(rootInput) {
  const root = normalizePruneRoot(rootInput);
  const residual = [];
  for (const rel of PROTECTED_DEPLOY_PATHS) {
    const abs = path.join(root, ...rel.split('/'));
    if (fs.existsSync(abs)) residual.push(rel);
  }
  if (residual.length) {
    throw new Error(`protected_path_remains:${residual.join(',')}`);
  }
  return true;
}

export function verifyRequiredPathsPresent(rootInput) {
  const root = normalizePruneRoot(rootInput);
  const missing = [];
  for (const rel of REQUIRED_DEPLOY_SENTINELS) {
    const abs = path.join(root, ...rel.split('/'));
    if (!fs.existsSync(abs)) missing.push(rel);
  }
  if (missing.length) {
    throw new Error(`required_path_missing:${missing.join(',')}`);
  }
  return true;
}

export function formatPruneSummary(summary) {
  const lines = [
    `DEPLOY_PRUNE_VERSION=${summary.version || DEPLOY_PRUNE_VERSION}`,
    `mode=${summary.mode}`,
    `root=${summary.root}`,
    `context=${summary.context || ''}`,
    'required_sentinels:',
    ...(summary.requiredSentinels || REQUIRED_DEPLOY_SENTINELS).map((p) => `  ${p}`),
    'protected_paths:',
    ...(summary.protectedPaths || PROTECTED_DEPLOY_PATHS).map((p) => `  ${p}`),
    'planned_removals:',
    ...(summary.removals || []).map((p) => `  ${p}`),
    'removed:',
    ...(summary.removed || []).map((p) => `  ${p}`),
    `ok=${summary.ok === true ? 'true' : 'false'}`,
  ];
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = {
    mode: null,
    dryRun: false,
    root: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--netlify-deploy-prune') {
      out.mode = 'apply';
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg === '--root') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('flag_requires_value:--root');
      out.root = value;
      i += 1;
      continue;
    }
    throw new Error(`unknown_flag:${arg}`);
  }
  if (out.dryRun && out.mode === 'apply') {
    // Explicit dry-run wins over apply when both present: still validate apply? Spec says
    // dry-run deletes nothing. Prefer dry-run mode.
    out.mode = 'dry-run';
  } else if (out.dryRun) {
    out.mode = 'dry-run';
  }
  if (!out.mode) throw new Error('mode_required');
  return out;
}

function defaultRepoRoot() {
  // Script lives at tools/deployment/<file>, so repo root is ../..
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..');
}

export function runPruneCli(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const requestedRoot = args.root ? args.root : defaultRepoRoot();
  const root = normalizePruneRoot(requestedRoot);

  if (args.mode === 'apply' && args.root) {
    // Apply with --root is only for synthetic fixtures under explicit Netlify-like env
    // in tests. Still require Netlify guards. Refuse if root equals a normal checkout
    // without those guards (guards checked below).
  }

  if (args.mode === 'apply') {
    // Refuse applying to a path that looks like a developer home checkout without guards —
    // guards themselves enforce Netlify. Additionally refuse apply when NETLIFY/CI absent.
  }

  const envInfo = validatePruneEnvironment({ mode: args.mode, env, root });
  const plan = buildPrunePlan(root);

  if (args.mode === 'dry-run') {
    const summary = {
      version: DEPLOY_PRUNE_VERSION,
      mode: 'dry-run',
      root: plan.root,
      context: envInfo.context,
      requiredSentinels: plan.requiredSentinels,
      protectedPaths: plan.protectedPaths,
      removals: plan.removals,
      removed: [],
      ok: true,
    };
    verifyRequiredPathsPresent(plan.root);
    return { code: 0, summary, text: formatPruneSummary(summary) };
  }

  // Apply mode
  const removed = applyPrunePlan(plan);
  verifyProtectedPathsAbsent(plan.root);
  verifyRequiredPathsPresent(plan.root);

  const summary = {
    version: DEPLOY_PRUNE_VERSION,
    mode: 'apply',
    root: plan.root,
    context: envInfo.context,
    requiredSentinels: plan.requiredSentinels,
    protectedPaths: plan.protectedPaths,
    removals: plan.removals,
    removed,
    ok: true,
  };
  return { code: 0, summary, text: formatPruneSummary(summary) };
}

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    const result = runPruneCli();
    process.stdout.write(`${result.text}\n`);
    process.exitCode = result.code;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    process.stderr.write(`DEPLOY_PRUNE_FAIL:${message}\n`);
    process.exitCode = 1;
  }
}
