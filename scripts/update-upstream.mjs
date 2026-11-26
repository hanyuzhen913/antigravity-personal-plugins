#!/usr/bin/env node
/**
 * Safe upstream updater for antigravity-personal-plugins.
 *
 * Updates `obsidian-prism` (via upstream Git main + my-custom rebase/merge)
 * and `antigravity-context-monitor` (via SHA-256 verified GitHub Release updater)
 * while strictly preserving all custom code edits and personal default configs.
 *
 * Pure Node.js (>= 22) built-ins only.
 * Exit codes:
 *   0 = success (up-to-date or updated cleanly)
 *   1 = error
 *   2 = git rebase conflict in obsidian-prism (requires conflict resolution + --finalize-prism)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '..');

const UPSTREAM_PRISM_URL = 'https://github.com/RMvdesi/obsidian-prism.git';
const PRISM_TEST_FILES = [
  'test/vial-core.test.mjs',
  'test/pulse-vial-bridge.test.mjs',
  'test/bundle.test.mjs',
  'test/v108-split-view-multipane.test.mjs',
];

const EXCLUDED_RUNTIME_FILES = new Set([
  '.bundle-cache.json',
  '.daemon.pid',
  '.patched-shortcuts.json',
  '.relaunch-task.json',
  '.watch.pid',
  'daemon.log',
  'repo-meta.json',
  '.DS_Store',
  'Thumbs.db',
]);

const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);

function printHelp() {
  console.log(`Usage: node scripts/update-upstream.mjs [options]

Options:
  --check            Read-only check for upstream updates (no files modified)
  --target <name>    Target plugin: all (default), obsidian-prism, context-monitor
  --dry-run          Preview planned update operations without modifying disk
  --finalize-prism   Resume Obsidian Prism deploy, sync, defaults & patch export
                     after resolving a git rebase conflict
  --skip-tests       Skip running unit tests in scratch/obsidian-prism
  -h, --help         Show this help message
`);
}

function parseArgs(argv) {
  const opts = {
    check: false,
    target: 'all',
    dryRun: false,
    finalizePrism: false,
    skipTests: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--check') {
      opts.check = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--finalize-prism') {
      opts.finalizePrism = true;
    } else if (arg === '--skip-tests') {
      opts.skipTests = true;
    } else if (arg === '--target' && i + 1 < argv.length) {
      opts.target = argv[++i];
    } else if (arg.startsWith('--target=')) {
      opts.target = arg.slice('--target='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['all', 'obsidian-prism', 'context-monitor'].includes(opts.target)) {
    throw new Error(`Invalid --target "${opts.target}". Expected: all, obsidian-prism, context-monitor`);
  }
  return opts;
}

function getPaths() {
  const home = os.homedir();
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(home, 'Library', 'Application Support')
        : process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');

  const cmStateFile =
    process.platform === 'linux'
      ? path.join(appData, 'antigravity-context-monitor', 'state-v1.json')
      : path.join(appData, 'Antigravity Context Monitor', 'state-v1.json');

  return {
    installedPluginsDir: path.join(home, '.gemini', 'config', 'plugins'),
    installedPrismDir: path.join(home, '.gemini', 'config', 'plugins', 'obsidian-prism'),
    installedCmDir: path.join(home, '.gemini', 'config', 'plugins', 'antigravity-context-monitor'),
    scratchPrismDir: path.join(home, '.gemini', 'antigravity', 'scratch', 'obsidian-prism'),
    cmStateFile,
  };
}

function gitRun(cwd, args, { allowFailure = false } = {}) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0 && !allowFailure) {
    const errText = (res.stderr || res.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed (exit ${res.status}): ${errText}`);
  }
  return {
    status: res.status ?? 1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.copyFileSync(tmpPath, filePath);
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}

function writeJsonAtomic(filePath, data) {
  writeTextAtomic(filePath, JSON.stringify(data, null, 2) + '\n');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function copyTreeFiltered(srcDir, dstDir, { skipRelativeFiles = new Set() } = {}) {
  let count = 0;
  function walk(curSrc, curDst, relPrefix) {
    if (!fs.existsSync(curSrc)) return;
    fs.mkdirSync(curDst, { recursive: true });
    for (const entry of fs.readdirSync(curSrc, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        walk(path.join(curSrc, entry.name), path.join(curDst, entry.name), nextRel);
      } else if (entry.isFile()) {
        if (EXCLUDED_RUNTIME_FILES.has(entry.name)) continue;
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (skipRelativeFiles.has(rel)) continue;
        fs.copyFileSync(path.join(curSrc, entry.name), path.join(curDst, entry.name));
        count += 1;
      }
    }
  }
  walk(srcDir, dstDir, '');
  return count;
}

function loadPrismSyncRootFiles(prismDir) {
  const cdpPath = path.join(prismDir, 'cdp.js');
  try {
    delete require.cache[require.resolve(cdpPath)];
    const cdpMod = require(cdpPath);
    if (Array.isArray(cdpMod.SYNC_ROOT_FILES) && cdpMod.SYNC_ROOT_FILES.length > 0) {
      return [...new Set(cdpMod.SYNC_ROOT_FILES)];
    }
  } catch {
    // Fallback below if cdp.js fails to require
  }
  const rootEntries = fs.readdirSync(prismDir, { withFileTypes: true });
  return rootEntries
    .filter((e) => e.isFile() && !EXCLUDED_RUNTIME_FILES.has(e.name))
    .filter((e) => /\.(?:js|css|json|md)$/i.test(e.name) || e.name === 'LICENSE')
    .map((e) => e.name);
}

function listPrismRuntimeRelPaths(baseDir, rootFiles) {
  const out = [];
  for (const rel of rootFiles) {
    const normalized = rel.replace(/\\/g, '/');
    if (EXCLUDED_RUNTIME_FILES.has(path.posix.basename(normalized))) continue;
    const full = path.join(baseDir, normalized);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      out.push(normalized);
    }
  }
  for (const sub of ['assets', 'sidecars', 'vendor']) {
    const subDir = path.join(baseDir, sub);
    if (!fs.existsSync(subDir)) continue;
    (function walk(cur, prefix) {
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) continue;
          walk(path.join(cur, entry.name), `${prefix}/${entry.name}`);
        } else if (entry.isFile()) {
          if (EXCLUDED_RUNTIME_FILES.has(entry.name)) continue;
          out.push(`${prefix}/${entry.name}`);
        }
      }
    })(subDir, sub);
  }
  return [...new Set(out)].sort();
}

function captureLivePrismEdits(installedDir, scratchDir) {
  if (!fs.existsSync(installedDir)) return [];
  const rootFiles = loadPrismSyncRootFiles(scratchDir);
  const skipSet = new Set(['config.json', 'config.example.json', 'MODIFICATIONS.md']);
  const installedFiles = listPrismRuntimeRelPaths(installedDir, rootFiles);
  const captured = [];

  for (const rel of installedFiles) {
    if (skipSet.has(rel)) continue;
    const src = path.join(installedDir, rel);
    const dst = path.join(scratchDir, rel);
    const srcHash = sha256File(src);
    const dstHash = fs.existsSync(dst) ? sha256File(dst) : null;
    if (srcHash !== dstHash) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      captured.push(rel);
    }
  }

  if (captured.length > 0) {
    gitRun(scratchDir, ['add', '--', ...captured]);
    const diffCheck = gitRun(scratchDir, ['diff', '--cached', '--quiet'], { allowFailure: true });
    if (diffCheck.status !== 0) {
      gitRun(scratchDir, ['commit', '-m', 'chore: capture live local customizations before upstream update']);
      console.log(`[obsidian-prism] Captured ${captured.length} live local edit(s) onto my-custom: ${captured.join(', ')}`);
    }
  }
  return captured;
}

function formatJsLiteral(value) {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}

function applyPrismDefaultConfigToCdp(cdpPath, defaultsConfig) {
  const raw = fs.readFileSync(cdpPath, 'utf8');
  const blockRe = /(const DEFAULT_CONFIG = \{\r?\n)([\s\S]*?)(\r?\n\};)/;
  const match = blockRe.exec(raw);
  if (!match) {
    throw new Error(`Could not locate DEFAULT_CONFIG block in ${cdpPath}`);
  }

  const lines = match[2].split(/\r?\n/);
  const updatedLines = lines.map((line) => {
    const m = /^(\s*)([a-zA-Z0-9_]+)\s*:\s*(.+?)(,?)\s*$/.exec(line);
    if (!m) return line;
    const [, indent, key, , comma] = m;
    if (Object.prototype.hasOwnProperty.call(defaultsConfig, key)) {
      return `${indent}${key}: ${formatJsLiteral(defaultsConfig[key])}${comma || ','}`;
    }
    return line;
  });

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const next = raw.slice(0, match.index) + match[1] + updatedLines.join(eol) + match[3] + raw.slice(match.index + match[0].length);
  writeTextAtomic(cdpPath, next);
}

function updatePrismModificationsMd(modPath, { version, mainHash, customHash, changedFiles }) {
  const today = new Date().toISOString().slice(0, 10);
  const fileList = changedFiles.length > 0
    ? changedFiles.map((f) => `   - \`${f}\``).join('\n')
    : '   - (config defaults & distribution hygiene only)';

  const content = `# Modification Notice (GPL-3.0 §5(a))

This directory (\`plugins/obsidian-prism\`) contains a **modified version** of **Obsidian Prism** (\`v${version}\`), originally authored by **RMvdesi** (<https://github.com/RMvdesi/obsidian-prism>).

- **Modified By**: \`han\`
- **Modification Date**: \`${today}\`
- **Upstream Baseline Commit**: \`${mainHash}\`
- **Custom Branch Commit**: \`${customHash}\`
- **License**: **GNU General Public License v3.0 (\`GPL-3.0-only\`)** — see [\`LICENSE\`](./LICENSE) and [\`THIRD_PARTY_NOTICES.md\`](./THIRD_PARTY_NOTICES.md).

## Summary of Modifications

1. **Custom Default Configuration (\`config.json\`, \`config.example.json\`, \`cdp.js\`)**:
   - Baked personalized defaults from \`defaults/obsidian-prism.config.json\` (including \`autoUpdate: "off"\`).
2. **Personalized Source & Component Customizations**:
${fileList}
3. **Distribution Hygiene**:
   - Excluded local runtime caches, PID/lock files, logs, and machine-specific \`repo-meta.json\`.

In accordance with GPL-3.0, this modified work as a whole remains licensed under GPL-3.0-only, with all original copyright and attribution notices preserved intact.
`;
  writeTextAtomic(modPath, content);
}

function deployAndSyncPrism(paths, opts) {
  const scratchDir = paths.scratchPrismDir;
  const installedDir = paths.installedPrismDir;
  const monoPrismDir = path.join(MONOREPO_ROOT, 'plugins', 'obsidian-prism');

  if (!opts.skipTests) {
    const existingTests = PRISM_TEST_FILES.filter((rel) => fs.existsSync(path.join(scratchDir, rel)));
    if (existingTests.length > 0) {
      console.log(`[obsidian-prism] Running ${existingTests.length} custom unit test suite(s)...`);
      const testRes = spawnSync(process.execPath, ['--test', ...existingTests], {
        cwd: scratchDir,
        encoding: 'utf8',
      });
      if (testRes.status !== 0) {
        console.error(testRes.stdout || '');
        console.error(testRes.stderr || '');
        throw new Error(`Obsidian Prism unit tests failed (exit ${testRes.status})`);
      }
      console.log('[obsidian-prism] Unit tests passed.');
    }
  }

  const rootFiles = loadPrismSyncRootFiles(scratchDir);
  const runtimeFiles = listPrismRuntimeRelPaths(scratchDir, rootFiles);

  // 1. Deploy to installed plugin directory (preserve live config.json!)
  let deployedCount = 0;
  for (const rel of runtimeFiles) {
    if (rel === 'config.json') continue;
    const src = path.join(scratchDir, rel);
    const dst = path.join(installedDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    deployedCount += 1;
  }
  const defaultsCfgPath = path.join(MONOREPO_ROOT, 'defaults', 'obsidian-prism.config.json');
  const defaultsCfg = readJson(defaultsCfgPath);
  const liveCfgPath = path.join(installedDir, 'config.json');
  if (!fs.existsSync(liveCfgPath)) {
    writeJsonAtomic(liveCfgPath, defaultsCfg);
  }
  console.log(`[obsidian-prism] Deployed ${deployedCount} runtime file(s) to ${installedDir} (preserved live config.json).`);

  // 2. Sync to monorepo plugins/obsidian-prism/ and re-bake defaults
  for (const rel of runtimeFiles) {
    const src = path.join(scratchDir, rel);
    const dst = path.join(monoPrismDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  applyPrismDefaultConfigToCdp(path.join(monoPrismDir, 'cdp.js'), defaultsCfg);
  writeJsonAtomic(path.join(monoPrismDir, 'config.json'), defaultsCfg);
  writeJsonAtomic(path.join(monoPrismDir, 'config.example.json'), defaultsCfg);

  const mainHash = gitRun(scratchDir, ['rev-parse', '--short', 'main']).stdout;
  const customHash = gitRun(scratchDir, ['rev-parse', '--short', 'my-custom']).stdout;
  const changedFilesRaw = gitRun(scratchDir, ['diff', '--name-only', 'main..my-custom']).stdout;
  const changedFiles = changedFilesRaw ? changedFilesRaw.split(/\r?\n/).filter(Boolean) : [];
  const pkgMeta = readJson(path.join(monoPrismDir, 'plugin.json'));

  updatePrismModificationsMd(path.join(monoPrismDir, 'MODIFICATIONS.md'), {
    version: pkgMeta.version || 'unknown',
    mainHash,
    customHash,
    changedFiles,
  });

  // 3. Re-export patch
  const patchOut = path.join(MONOREPO_ROOT, 'patches', 'obsidian-prism.patch');
  fs.mkdirSync(path.dirname(patchOut), { recursive: true });
  gitRun(scratchDir, ['diff', 'main..my-custom', `--output=${patchOut}`]);
  console.log(`[obsidian-prism] Synced monorepo, re-applied DEFAULT_CONFIG, and exported patches/obsidian-prism.patch.`);
}

async function handleObsidianPrism(paths, opts) {
  const scratchDir = paths.scratchPrismDir;
  const patchFile = path.join(MONOREPO_ROOT, 'patches', 'obsidian-prism.patch');

  if (!fs.existsSync(scratchDir)) {
    if (opts.check || opts.dryRun) {
      return {
        plugin: 'obsidian-prism',
        status: 'missing_clone',
        message: `Local git clone not found at ${scratchDir}; would clone ${UPSTREAM_PRISM_URL} and apply patches/obsidian-prism.patch.`,
      };
    }
    if (opts.finalizePrism) {
      throw new Error(`Cannot finalize: ${scratchDir} does not exist.`);
    }
    fs.mkdirSync(path.dirname(scratchDir), { recursive: true });
    gitRun(path.dirname(scratchDir), ['clone', UPSTREAM_PRISM_URL, scratchDir]);
    gitRun(scratchDir, ['checkout', '-b', 'my-custom']);
    if (fs.existsSync(patchFile)) {
      const applyRes = gitRun(scratchDir, ['apply', '--3way', patchFile], { allowFailure: true });
      if (applyRes.status !== 0) {
        return {
          plugin: 'obsidian-prism',
          status: 'conflict',
          message: `Cloned upstream, but git apply --3way reported conflicts. Resolve them in ${scratchDir}, commit on my-custom, and re-run --finalize-prism.`,
        };
      }
      gitRun(scratchDir, ['add', '-A']);
      gitRun(scratchDir, ['commit', '-m', 'feat: apply personal customizations patch']);
    }
    deployAndSyncPrism(paths, opts);
    return {
      plugin: 'obsidian-prism',
      status: 'updated',
      mainCommit: gitRun(scratchDir, ['rev-parse', '--short', 'main']).stdout,
      customCommit: gitRun(scratchDir, ['rev-parse', '--short', 'my-custom']).stdout,
    };
  }

  if (opts.finalizePrism) {
    const rebaseDir = fs.existsSync(path.join(scratchDir, '.git', 'rebase-merge')) ||
      fs.existsSync(path.join(scratchDir, '.git', 'rebase-apply'));
    if (rebaseDir) {
      throw new Error(`Rebase is still in progress in ${scratchDir}. Finish git rebase --continue before running --finalize-prism.`);
    }
    const curBranch = gitRun(scratchDir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
    if (curBranch !== 'my-custom') {
      gitRun(scratchDir, ['checkout', 'my-custom']);
    }
    deployAndSyncPrism(paths, opts);
    return {
      plugin: 'obsidian-prism',
      status: 'updated',
      mainCommit: gitRun(scratchDir, ['rev-parse', '--short', 'main']).stdout,
      customCommit: gitRun(scratchDir, ['rev-parse', '--short', 'my-custom']).stdout,
    };
  }

  // Ensure my-custom branch exists
  const hasCustomBranch = gitRun(scratchDir, ['rev-parse', '--verify', 'my-custom'], { allowFailure: true }).status === 0;
  if (!hasCustomBranch) {
    if (opts.check || opts.dryRun) {
      return {
        plugin: 'obsidian-prism',
        status: 'error',
        message: `Branch 'my-custom' does not exist in ${scratchDir}.`,
      };
    }
    throw new Error(`Branch 'my-custom' does not exist in ${scratchDir}.`);
  }

  if (!opts.check && !opts.dryRun) {
    const dirty = gitRun(scratchDir, ['status', '--porcelain']).stdout;
    if (dirty) {
      throw new Error(`Working tree in ${scratchDir} has uncommitted changes:\n${dirty}\nCommit or stash them before updating upstream.`);
    }
    const curBranch = gitRun(scratchDir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
    if (curBranch !== 'my-custom') {
      gitRun(scratchDir, ['checkout', 'my-custom']);
    }
    captureLivePrismEdits(paths.installedPrismDir, scratchDir);
  }

  // Fetch upstream main
  gitRun(scratchDir, ['fetch', 'origin', 'main']);
  const mainHash = gitRun(scratchDir, ['rev-parse', '--short', 'main']).stdout;
  const originHash = gitRun(scratchDir, ['rev-parse', '--short', 'origin/main']).stdout;
  const customHash = gitRun(scratchDir, ['rev-parse', '--short', 'my-custom']).stdout;
  const behindCount = Number(gitRun(scratchDir, ['rev-list', '--count', 'main..origin/main']).stdout || '0');
  const upstreamCommits = behindCount > 0
    ? gitRun(scratchDir, ['log', '--oneline', 'main..origin/main']).stdout.split(/\r?\n/).filter(Boolean)
    : [];

  if (opts.check || opts.dryRun) {
    return {
      plugin: 'obsidian-prism',
      status: behindCount > 0 ? 'update_available' : 'up_to_date',
      currentMain: mainHash,
      upstreamMain: originHash,
      customCommit: customHash,
      behindCount,
      upstreamCommits,
    };
  }

  if (behindCount === 0) {
    return {
      plugin: 'obsidian-prism',
      status: 'up_to_date',
      currentMain: mainHash,
      upstreamMain: originHash,
      customCommit: customHash,
      behindCount: 0,
    };
  }

  // Fast-forward main and rebase my-custom onto main
  gitRun(scratchDir, ['checkout', 'main']);
  gitRun(scratchDir, ['merge', '--ff-only', 'origin/main']);
  gitRun(scratchDir, ['checkout', 'my-custom']);

  const rebaseRes = gitRun(scratchDir, ['rebase', 'main'], { allowFailure: true });
  if (rebaseRes.status !== 0) {
    const conflicts = gitRun(scratchDir, ['diff', '--name-only', '--diff-filter=U'], { allowFailure: true })
      .stdout.split(/\r?\n/)
      .filter(Boolean);
    console.error('\n[CONFLICT] Obsidian Prism rebase encountered merge conflict(s) in:');
    for (const c of conflicts) {
      console.error(`  - ${c}`);
    }
    console.error('\nResolution steps:');
    console.error(`  1. Resolve conflicts in ${scratchDir} while keeping personal customizations.`);
    console.error('  2. Stage & continue: git add <files> && git rebase --continue');
    console.error('  3. Finalize deploy & sync: node scripts/update-upstream.mjs --target obsidian-prism --finalize-prism\n');
    return {
      plugin: 'obsidian-prism',
      status: 'conflict',
      conflicts,
      previousMain: mainHash,
      upstreamMain: originHash,
    };
  }

  deployAndSyncPrism(paths, opts);
  return {
    plugin: 'obsidian-prism',
    status: 'updated',
    previousMain: mainHash,
    currentMain: gitRun(scratchDir, ['rev-parse', '--short', 'main']).stdout,
    customCommit: gitRun(scratchDir, ['rev-parse', '--short', 'my-custom']).stdout,
    behindCount,
  };
}

function applyContextMonitorDefaultThreshold(durableStatePath, threshold) {
  const raw = fs.readFileSync(durableStatePath, 'utf8');
  const next = raw.replace(
    /(exports\.DEFAULT_APP_SETTINGS\s*=\s*Object\.freeze\(\{[\s\S]*?quotaNotificationThreshold:\s*)\d+(\s*,)/,
    `$1${threshold}$2`
  );
  if (next === raw && !raw.includes(`quotaNotificationThreshold: ${threshold}`)) {
    throw new Error(`Could not locate quotaNotificationThreshold in ${durableStatePath}`);
  }
  if (next !== raw) {
    writeTextAtomic(durableStatePath, next);
  }
}

function sanitizeContextMonitorDefaults(rawState) {
  const globalSrc = rawState && typeof rawState.global === 'object' && rawState.global ? rawState.global : {};
  const appSrc = globalSrc && typeof globalSrc.appSettings === 'object' && globalSrc.appSettings ? globalSrc.appSettings : {};
  return {
    version: 1,
    global: {
      displayLanguage: typeof globalSrc.displayLanguage === 'string' ? globalSrc.displayLanguage : 'zh',
      quotaTrackingEnabled: typeof globalSrc.quotaTrackingEnabled === 'boolean' ? globalSrc.quotaTrackingEnabled : true,
      lockToMainAgent: typeof globalSrc.lockToMainAgent === 'boolean' ? globalSrc.lockToMainAgent : false,
      subscriptionPlan: typeof globalSrc.subscriptionPlan === 'string' ? globalSrc.subscriptionPlan : 'none',
      appSettings: {
        ...appSrc,
        lastUpdateCheck: null,
      },
    },
    workspaces: {},
  };
}

async function handleContextMonitor(paths, opts) {
  const monoCmDir = path.join(MONOREPO_ROOT, 'plugins', 'antigravity-context-monitor');
  const updaterPath = path.join(monoCmDir, 'sidecars', 'context_monitor', 'runtime', 'out', 'app', 'plugin-updater.js');
  const updater = require(updaterPath);

  const installedManifest = path.join(paths.installedCmDir, 'plugin.json');
  const monoManifest = path.join(monoCmDir, 'plugin.json');
  const manifestPath = fs.existsSync(installedManifest) ? installedManifest : monoManifest;
  const currentVersion = String(readJson(manifestPath).version || '0.0.0').trim();

  const checkRes = await updater.checkForUpdates({
    currentVersion,
    force: true,
  });

  if (checkRes.status === 'error') {
    return {
      plugin: 'antigravity-context-monitor',
      status: 'error',
      currentVersion,
      error: checkRes.error || 'Update check failed',
    };
  }

  if (!checkRes.hasUpdate || !checkRes.releaseInfo) {
    return {
      plugin: 'antigravity-context-monitor',
      status: 'up_to_date',
      currentVersion,
      latestVersion: checkRes.latestVersion || currentVersion,
    };
  }

  if (opts.check || opts.dryRun) {
    return {
      plugin: 'antigravity-context-monitor',
      status: 'update_available',
      currentVersion,
      latestVersion: checkRes.latestVersion,
      releaseUrl: checkRes.releaseInfo.releaseUrl,
      assetName: checkRes.releaseInfo.assetName,
    };
  }

  const licensePath = path.join(monoCmDir, 'LICENSE');
  const preservedLicense = fs.existsSync(licensePath) ? fs.readFileSync(licensePath, 'utf8') : null;

  const applyRes = await updater.applyAppPluginUpdate({
    currentVersion,
    targetPluginDir: paths.installedCmDir,
    releaseInfo: checkRes.releaseInfo,
  });

  if (!applyRes.ok) {
    throw new Error(applyRes.message || applyRes.error || 'applyAppPluginUpdate failed');
  }

  // Sync updated installed plugin back into monorepo & restore MIT LICENSE + default threshold
  fs.rmSync(monoCmDir, { recursive: true, force: true });
  copyTreeFiltered(paths.installedCmDir, monoCmDir);
  if (preservedLicense && !fs.existsSync(licensePath)) {
    writeTextAtomic(licensePath, preservedLicense);
  }

  const defaultsPath = path.join(MONOREPO_ROOT, 'defaults', 'context-monitor.defaults.json');
  if (fs.existsSync(paths.cmStateFile)) {
    const sanitized = sanitizeContextMonitorDefaults(readJson(paths.cmStateFile));
    writeJsonAtomic(defaultsPath, sanitized);
  }
  const cmDefaults = readJson(defaultsPath);
  const threshold = Number(cmDefaults?.global?.appSettings?.quotaNotificationThreshold ?? 1);
  applyContextMonitorDefaultThreshold(
    path.join(monoCmDir, 'sidecars', 'context_monitor', 'runtime', 'out', 'durable-state.js'),
    threshold
  );

  return {
    plugin: 'antigravity-context-monitor',
    status: 'updated',
    previousVersion: applyRes.previousVersion,
    installedVersion: applyRes.installedVersion,
    checksumVerified: applyRes.checksumVerified,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  const paths = getPaths();
  const results = [];
  let hasConflict = false;
  let hasError = false;

  if (opts.target === 'all' || opts.target === 'obsidian-prism') {
    const r = await handleObsidianPrism(paths, opts);
    results.push(r);
    if (r.status === 'conflict') hasConflict = true;
    if (r.status === 'error') hasError = true;
  }

  if ((opts.target === 'all' || opts.target === 'context-monitor') && !opts.finalizePrism) {
    const r = await handleContextMonitor(paths, opts);
    results.push(r);
    if (r.status === 'error') hasError = true;
  }

  console.log('\n=== UPSTREAM UPDATE SUMMARY ===');
  console.log(JSON.stringify({ mode: opts.check ? 'check' : opts.dryRun ? 'dry-run' : 'apply', results }, null, 2));

  if (hasConflict) {
    process.exit(2);
  }
  if (hasError) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
