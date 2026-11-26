#!/usr/bin/env node
/**
 * Repository validation, syntax check, and public-release hygiene scanner.
 * Pure Node.js (>= 22) built-ins only.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const PLUGINS = [
  'antigravity-context-monitor',
  'dev-command-hub',
  'obsidian-prism',
];

const EXCLUDED_RUNTIME_FILES = new Set([
  '.bundle-cache.json',
  '.daemon.pid',
  '.patched-shortcuts.json',
  '.relaunch-task.json',
  '.watch.pid',
  'daemon.log',
  'repo-meta.json',
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.ps1', '.sh', '.svg', '',
]);

const FORBIDDEN_CM_KEYS = new Set([
  'accountSnapshots',
  'dailyLedgerState',
  'dailyStoreState',
  'activityTrackerState',
  'gmTrackerState',
  'quotaHistory',
  'quotaMaxHistory',
  'quotaActiveTracking',
  'quotaRunwayState',
  'cachedModelConfigs',
  'cachedPlanName',
  'cachedTierName',
  'modelDNAState',
]);

// Build personal path patterns dynamically so this validator file itself never trips the check.
const LOCAL_USER_SEGMENT = ['349', '96'].join('');
const WIN_USER_PATH_RE = new RegExp(`(?:[a-z]:\\\\\\\\users\\\\\\\\|[a-z]:/users/)${LOCAL_USER_SEGMENT}`, 'i');
const REAL_SECRET_RE = /(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16})/g;

let failures = 0;

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  failures += 1;
}

function ok(msg) {
  console.log(`[PASS] ${msg}`);
}

function walkRepoFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRepoFiles(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function checkAgyPlugins() {
  for (const name of PLUGINS) {
    const pluginDir = path.join(REPO_ROOT, 'plugins', name);
    const res = spawnSync('agy', ['plugin', 'validate', '--strict', pluginDir], {
      encoding: 'utf8',
    });
    if (res.error) {
      if (res.error.code === 'ENOENT') {
        console.warn(`[WARN] 'agy' CLI not found in PATH; skipping strict plugin manifest check for ${name}.`);
        continue;
      }
      fail(`agy plugin validate --strict error for ${name}: ${res.error.message}`);
      continue;
    }
    if (res.status !== 0) {
      fail(`agy plugin validate --strict failed for ${name}:\n${res.stdout || ''}${res.stderr || ''}`);
    } else {
      ok(`agy plugin validate --strict passed: ${name}`);
    }
  }
}

function checkSyntax() {
  const targets = [
    'scripts/install.mjs',
    'scripts/validate.mjs',
    'plugins/obsidian-prism/cdp.js',
    'plugins/dev-command-hub/scripts/mcp-server.cjs',
    'plugins/antigravity-context-monitor/sidecars/context_monitor/runtime/out/durable-state.js',
  ];
  for (const rel of targets) {
    const full = path.join(REPO_ROOT, rel);
    const res = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
    if (res.status !== 0) {
      fail(`node --check failed for ${rel}:\n${res.stderr || res.stdout}`);
    } else {
      ok(`node --check passed: ${rel}`);
    }
  }
}

function checkJsonFiles() {
  const jsonTargets = [
    ...PLUGINS.map((p) => path.join(REPO_ROOT, 'plugins', p, 'plugin.json')),
    ...fs.readdirSync(path.join(REPO_ROOT, 'defaults'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(REPO_ROOT, 'defaults', f)),
    path.join(REPO_ROOT, 'plugins', 'obsidian-prism', 'config.json'),
    path.join(REPO_ROOT, 'plugins', 'obsidian-prism', 'config.example.json'),
  ];

  for (const filePath of jsonTargets) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      JSON.parse(raw);
      ok(`JSON valid: ${path.relative(REPO_ROOT, filePath)}`);
    } catch (err) {
      fail(`Invalid JSON in ${path.relative(REPO_ROOT, filePath)}: ${err.message}`);
    }
  }

  const cmDefaultsPath = path.join(REPO_ROOT, 'defaults', 'context-monitor.defaults.json');
  try {
    const cm = JSON.parse(fs.readFileSync(cmDefaultsPath, 'utf8'));
    const g = cm.global || {};
    for (const k of FORBIDDEN_CM_KEYS) {
      if (Object.prototype.hasOwnProperty.call(g, k) || Object.prototype.hasOwnProperty.call(cm, k)) {
        fail(`defaults/context-monitor.defaults.json must not contain runtime/history key "${k}"`);
      }
    }
    if (cm.workspaces && Object.keys(cm.workspaces).length > 0) {
      fail('defaults/context-monitor.defaults.json must have empty workspaces {}');
    }
    if (g.appSettings && g.appSettings.lastUpdateCheck !== null) {
      fail('defaults/context-monitor.defaults.json appSettings.lastUpdateCheck must be null');
    }
    ok('context-monitor.defaults.json sanitized check passed');
  } catch (err) {
    fail(`Failed checking context-monitor.defaults.json: ${err.message}`);
  }
}

function checkHygieneAndSecrets() {
  const allFiles = walkRepoFiles(REPO_ROOT);
  let artifactCount = 0;
  let pathHits = 0;
  let secretHits = 0;

  for (const full of allFiles) {
    const base = path.basename(full);
    const rel = path.relative(REPO_ROOT, full);
    if (EXCLUDED_RUNTIME_FILES.has(base)) {
      fail(`Excluded runtime artifact present in repo: ${rel}`);
      artifactCount += 1;
    }

    const ext = path.extname(base).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !base.startsWith('.')) continue;

    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    if (content.includes(LOCAL_USER_SEGMENT) || WIN_USER_PATH_RE.test(content)) {
      fail(`Personal local path or username found in ${rel}`);
      pathHits += 1;
    }

    const matches = content.match(REAL_SECRET_RE);
    if (matches) {
      fail(`Potential real API key/token literal found in ${rel}: ${matches[0].slice(0, 12)}...`);
      secretHits += 1;
    }
  }

  if (artifactCount === 0) ok('No excluded runtime artifacts in repo');
  if (pathHits === 0) ok('No personal local paths or username leaks found');
  if (secretHits === 0) ok('No real API keys or token literals found');
}

function main() {
  checkAgyPlugins();
  checkSyntax();
  checkJsonFiles();
  checkHygieneAndSecrets();

  if (failures > 0) {
    console.error(`\nValidation finished with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\nAll validation checks passed.');
}

main();
