#!/usr/bin/env node
/**
 * Cross-platform installer & local-sync tool for antigravity-personal-plugins.
 * Pure Node.js (>= 22) built-ins only — zero external dependencies.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const ALL_PLUGINS = [
  'antigravity-context-monitor',
  'dev-command-hub',
  'obsidian-prism',
];

const EXCLUDED_FILES = new Set([
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
  console.log(`Usage: node scripts/install.mjs [options]

Options:
  --only <a,b>       Comma-separated plugin names to operate on
                     (${ALL_PLUGINS.join(', ')})
  --force-defaults   Overwrite existing local settings/configs with repo defaults/
                     (for Context Monitor, merges preference keys while keeping history)
  --backup           Back up existing target plugin dirs & configs before overwriting
                     into ~/.gemini/antigravity/backups/personal-plugins-<timestamp>/
  --no-backup        Skip backup (default)
  --sync-from-local  Reverse-sync local installed plugins & sanitized configs back into repo
  --dry-run          Print planned operations without modifying disk
  -h, --help         Show this help message
`);
}

function parseArgs(argv) {
  const opts = {
    only: null,
    forceDefaults: false,
    backup: false,
    syncFromLocal: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--force-defaults') {
      opts.forceDefaults = true;
    } else if (arg === '--backup') {
      opts.backup = true;
    } else if (arg === '--no-backup') {
      opts.backup = false;
    } else if (arg === '--sync-from-local') {
      opts.syncFromLocal = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--only' && i + 1 < argv.length) {
      opts.only = argv[++i];
    } else if (arg.startsWith('--only=')) {
      opts.only = arg.slice('--only='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  let selected = [...ALL_PLUGINS];
  if (opts.only !== null) {
    const parts = opts.only
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new Error('--only requires at least one plugin name');
    }
    for (const p of parts) {
      if (!ALL_PLUGINS.includes(p)) {
        throw new Error(`Unknown plugin "${p}". Valid plugins: ${ALL_PLUGINS.join(', ')}`);
      }
    }
    selected = [...new Set(parts)];
  }

  return { ...opts, selected };
}

function getContextMonitorStatePath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Antigravity Context Monitor', 'state-v1.json');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity Context Monitor', 'state-v1.json');
  }
  const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(stateHome, 'antigravity-context-monitor', 'state-v1.json');
}

function getLocalPaths() {
  const home = os.homedir();
  return {
    pluginsDir: path.join(home, '.gemini', 'config', 'plugins'),
    backupsRoot: path.join(home, '.gemini', 'antigravity', 'backups'),
    commandHubState: path.join(home, '.gemini', 'antigravity', 'plugin_data', 'dev-command-hub', 'state.json'),
    contextMonitorState: getContextMonitorStatePath(),
  };
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function writeJsonAtomic(filePath, data, dryRun, label) {
  const content = JSON.stringify(data, null, 2) + '\n';
  if (dryRun) {
    console.log(`[dry-run] write ${label}: ${filePath}`);
    return;
  }
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
  console.log(`[ok] wrote ${label}: ${filePath}`);
}

function copyTreeFiltered(srcDir, dstDir, { skipRelativeFiles = new Set(), dryRun = false } = {}) {
  let fileCount = 0;

  function walk(curSrc, curDst, relPrefix) {
    const entries = fs.readdirSync(curSrc, { withFileTypes: true });
    if (!dryRun) {
      fs.mkdirSync(curDst, { recursive: true });
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        walk(path.join(curSrc, entry.name), path.join(curDst, entry.name), nextRel);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;
        const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
        if (skipRelativeFiles.has(rel)) continue;
        if (!dryRun) {
          fs.copyFileSync(path.join(curSrc, entry.name), path.join(curDst, entry.name));
        }
        fileCount += 1;
      }
    }
  }

  walk(srcDir, dstDir, '');
  return fileCount;
}

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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

function installToLocal(opts) {
  const local = getLocalPaths();
  const backupDir = opts.backup
    ? path.join(local.backupsRoot, `personal-plugins-${formatTimestamp()}`)
    : null;

  if (backupDir) {
    console.log(`${opts.dryRun ? '[dry-run] ' : ''}Backup directory: ${backupDir}`);
  }

  for (const name of opts.selected) {
    const srcPlugin = path.join(REPO_ROOT, 'plugins', name);
    const dstPlugin = path.join(local.pluginsDir, name);

    if (!fs.existsSync(srcPlugin)) {
      throw new Error(`Missing plugin directory in repo: ${srcPlugin}`);
    }

    if (backupDir && fs.existsSync(dstPlugin)) {
      const dstBackup = path.join(backupDir, 'plugins', name);
      if (opts.dryRun) {
        console.log(`[dry-run] backup ${dstPlugin} -> ${dstBackup}`);
      } else {
        copyTreeFiltered(dstPlugin, dstBackup);
        console.log(`[ok] backed up plugin ${name} -> ${dstBackup}`);
      }
    }

    const skipRel = new Set();
    if (name === 'obsidian-prism') {
      const existingPrismCfg = path.join(dstPlugin, 'config.json');
      if (fs.existsSync(existingPrismCfg) && !opts.forceDefaults) {
        skipRel.add('config.json');
      }
    }

    const copied = copyTreeFiltered(srcPlugin, dstPlugin, {
      skipRelativeFiles: skipRel,
      dryRun: opts.dryRun,
    });
    console.log(`${opts.dryRun ? '[dry-run] ' : '[ok] '}sync plugin ${name} -> ${dstPlugin} (${copied} files)`);

    if (name === 'obsidian-prism') {
      const dstCfg = path.join(dstPlugin, 'config.json');
      const seedCfg = path.join(REPO_ROOT, 'defaults', 'obsidian-prism.config.json');
      if (!fs.existsSync(dstCfg) || opts.forceDefaults) {
        const cfg = readJson(seedCfg);
        writeJsonAtomic(dstCfg, cfg, opts.dryRun, 'obsidian-prism config.json');
      } else {
        console.log(`[skip] preserve existing obsidian-prism config.json (use --force-defaults to overwrite): ${dstCfg}`);
      }
    } else if (name === 'dev-command-hub') {
      const dstState = local.commandHubState;
      const seedState = path.join(REPO_ROOT, 'defaults', 'dev-command-hub.state.json');
      if (backupDir && fs.existsSync(dstState)) {
        const stateBackup = path.join(backupDir, 'state', 'dev-command-hub-state.json');
        if (opts.dryRun) {
          console.log(`[dry-run] backup ${dstState} -> ${stateBackup}`);
        } else {
          fs.mkdirSync(path.dirname(stateBackup), { recursive: true });
          fs.copyFileSync(dstState, stateBackup);
        }
      }
      if (!fs.existsSync(dstState) || opts.forceDefaults) {
        writeJsonAtomic(dstState, readJson(seedState), opts.dryRun, 'dev-command-hub state.json');
      } else {
        console.log(`[skip] preserve existing dev-command-hub state.json (use --force-defaults to overwrite): ${dstState}`);
      }
    } else if (name === 'antigravity-context-monitor') {
      const dstState = local.contextMonitorState;
      const seed = readJson(path.join(REPO_ROOT, 'defaults', 'context-monitor.defaults.json'));
      if (backupDir && fs.existsSync(dstState)) {
        const cmBackup = path.join(backupDir, 'state', 'context-monitor-state-v1.json');
        if (opts.dryRun) {
          console.log(`[dry-run] backup ${dstState} -> ${cmBackup}`);
        } else {
          fs.mkdirSync(path.dirname(cmBackup), { recursive: true });
          fs.copyFileSync(dstState, cmBackup);
        }
      }
      if (!fs.existsSync(dstState)) {
        writeJsonAtomic(dstState, seed, opts.dryRun, 'antigravity-context-monitor state-v1.json');
      } else if (opts.forceDefaults) {
        const existing = readJson(dstState);
        const existingGlobal = existing && typeof existing.global === 'object' && existing.global ? existing.global : {};
        const existingApp = existingGlobal && typeof existingGlobal.appSettings === 'object' && existingGlobal.appSettings ? existingGlobal.appSettings : {};
        const merged = {
          ...existing,
          version: existing.version || seed.version || 1,
          global: {
            ...existingGlobal,
            displayLanguage: seed.global.displayLanguage,
            quotaTrackingEnabled: seed.global.quotaTrackingEnabled,
            lockToMainAgent: seed.global.lockToMainAgent,
            subscriptionPlan: seed.global.subscriptionPlan,
            appSettings: {
              ...existingApp,
              ...seed.global.appSettings,
              lastUpdateCheck: existingApp.lastUpdateCheck ?? null,
            },
          },
        };
        writeJsonAtomic(dstState, merged, opts.dryRun, 'antigravity-context-monitor state-v1.json (merged preferences)');
      } else {
        console.log(`[skip] preserve existing context-monitor state-v1.json (use --force-defaults to merge preferences): ${dstState}`);
      }
    }
  }

  console.log('\nNext step:');
  console.log('  Open Antigravity Customizations (Plugins) UI and toggle affected plugins Off -> On (or restart Antigravity) to reload.');
  console.log('  Do NOT hand-edit ~/.gemini/config/config.json.');
}

function syncFromLocal(opts) {
  const local = getLocalPaths();
  for (const name of opts.selected) {
    const srcPlugin = path.join(local.pluginsDir, name);
    const dstPlugin = path.join(REPO_ROOT, 'plugins', name);
    if (!fs.existsSync(srcPlugin)) {
      throw new Error(`Installed plugin not found: ${srcPlugin}`);
    }

    const copied = copyTreeFiltered(srcPlugin, dstPlugin, { dryRun: opts.dryRun });
    console.log(`${opts.dryRun ? '[dry-run] ' : '[ok] '}reverse-sync ${srcPlugin} -> ${dstPlugin} (${copied} files)`);

    if (name === 'obsidian-prism') {
      const liveCfgPath = path.join(srcPlugin, 'config.json');
      if (fs.existsSync(liveCfgPath)) {
        const liveCfg = readJson(liveCfgPath);
        writeJsonAtomic(path.join(REPO_ROOT, 'defaults', 'obsidian-prism.config.json'), liveCfg, opts.dryRun, 'defaults/obsidian-prism.config.json');
        writeJsonAtomic(path.join(dstPlugin, 'config.json'), liveCfg, opts.dryRun, 'plugins/obsidian-prism/config.json');
        writeJsonAtomic(path.join(dstPlugin, 'config.example.json'), liveCfg, opts.dryRun, 'plugins/obsidian-prism/config.example.json');
      }
    } else if (name === 'dev-command-hub') {
      if (fs.existsSync(local.commandHubState)) {
        const liveState = readJson(local.commandHubState);
        writeJsonAtomic(path.join(REPO_ROOT, 'defaults', 'dev-command-hub.state.json'), liveState, opts.dryRun, 'defaults/dev-command-hub.state.json');
      }
    } else if (name === 'antigravity-context-monitor') {
      if (fs.existsSync(local.contextMonitorState)) {
        const sanitized = sanitizeContextMonitorDefaults(readJson(local.contextMonitorState));
        writeJsonAtomic(path.join(REPO_ROOT, 'defaults', 'context-monitor.defaults.json'), sanitized, opts.dryRun, 'defaults/context-monitor.defaults.json');
      }
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.syncFromLocal) {
    syncFromLocal(opts);
  } else {
    installToLocal(opts);
  }
}

try {
  main();
} catch (err) {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
