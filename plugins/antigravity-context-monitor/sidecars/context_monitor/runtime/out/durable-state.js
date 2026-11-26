"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DurableState = exports.DurableStateLockTimeoutError = exports.DEFAULT_APP_SETTINGS = exports.SUPPORTED_DISPLAY_CURRENCIES = void 0;
exports.normalizeAppSettings = normalizeAppSettings;
exports.parseLockFileContent = parseLockFileContent;
exports.isPidAlive = isPidAlive;
exports.acquireLockFile = acquireLockFile;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
exports.SUPPORTED_DISPLAY_CURRENCIES = [
    'USD',
    'CNY',
    'EUR',
    'JPY',
    'KRW',
    'GBP',
    'AUD',
    'HKD',
    'TWD',
];
exports.DEFAULT_APP_SETTINGS = Object.freeze({
    pollingInterval: 5,
    quotaNotificationThreshold: 1,
    showContext: true,
    showQuota: true,
    showResetCountdown: true,
    showAiCredits: true,
    showSpeed: false,
    showCacheHit: false,
    showSessionCost: false,
    tooltipDensity: 'auto',
    showModelInternalId: false,
    maxRecentSteps: 100,
    maxArchives: 20,
    lockToMainAgent: false,
    appComposerRingEnabled: false,
    appTopBarEnabled: false,
    orchestratorPricingMode: 'mapped',
    displayCurrency: 'USD',
    customFxRate: null,
    subscriptionMonthlyFee: null,
    subscriptionCurrency: 'USD',
    calendarRetentionDays: 400,
    autoCheckUpdates: true,
    showNativeHudBar: true,
    lastUpdateCheck: null,
    activityMaxRecentSteps: 100,
    activityMaxArchives: 20,
});
function clampInt(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
    if (!Number.isFinite(n)) {
        return fallback;
    }
    return Math.min(Math.max(Math.round(n), min), max);
}
function normalizeDisplayCurrency(value, fallback = 'USD') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const upper = value.trim().toUpperCase();
    return exports.SUPPORTED_DISPLAY_CURRENCIES.includes(upper)
        ? upper
        : fallback;
}
function normalizePositiveNullableNumber(value, allowZero = false) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) {
        return null;
    }
    if (allowZero ? n < 0 : n <= 0) {
        return null;
    }
    return n;
}
function normalizeLastUpdateCheck(value) {
    if (!isPlainObject(value)) {
        return null;
    }
    const checkedAt = typeof value.checkedAt === 'number' && Number.isFinite(value.checkedAt) && value.checkedAt > 0
        ? Math.floor(value.checkedAt)
        : 0;
    if (checkedAt <= 0) {
        return null;
    }
    const optStr = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
        checkedAt,
        latestVersion: optStr(value.latestVersion),
        hasUpdate: typeof value.hasUpdate === 'boolean' ? value.hasUpdate : false,
        etag: optStr(value.etag),
        releaseUrl: optStr(value.releaseUrl),
        releaseNotesSummary: optStr(value.releaseNotesSummary),
        assetName: optStr(value.assetName),
        assetUrl: optStr(value.assetUrl),
        checksumsUrl: optStr(value.checksumsUrl),
        error: optStr(value.error),
    };
}
/**
 * Normalize raw persisted `appSettings` into a complete, schema-safe `AppSettings` object.
 * Preserves full backward compatibility with v1.17.5 payloads (e.g. `maxRecentSteps`/`maxArchives`).
 */
function normalizeAppSettings(raw) {
    const src = isPlainObject(raw) ? raw : {};
    const tooltipDensity = src.tooltipDensity === 'compact' || src.tooltipDensity === 'full' || src.tooltipDensity === 'auto'
        ? src.tooltipDensity
        : exports.DEFAULT_APP_SETTINGS.tooltipDensity;
    const orchestratorPricingMode = src.orchestratorPricingMode === 'strict'
        ? 'strict'
        : 'mapped';
    const resolvedMaxRecentSteps = src.activityMaxRecentSteps !== undefined
        ? clampInt(src.activityMaxRecentSteps, exports.DEFAULT_APP_SETTINGS.activityMaxRecentSteps, 10, 500)
        : clampInt(src.maxRecentSteps, exports.DEFAULT_APP_SETTINGS.maxRecentSteps, 10, 500);
    const resolvedMaxArchives = src.activityMaxArchives !== undefined
        ? clampInt(src.activityMaxArchives, exports.DEFAULT_APP_SETTINGS.activityMaxArchives, 1, 100)
        : clampInt(src.maxArchives, exports.DEFAULT_APP_SETTINGS.maxArchives, 1, 100);
    return {
        pollingInterval: clampInt(src.pollingInterval, exports.DEFAULT_APP_SETTINGS.pollingInterval, 1, 60),
        quotaNotificationThreshold: clampInt(src.quotaNotificationThreshold, exports.DEFAULT_APP_SETTINGS.quotaNotificationThreshold, 0, 99),
        showContext: typeof src.showContext === 'boolean' ? src.showContext : exports.DEFAULT_APP_SETTINGS.showContext,
        showQuota: typeof src.showQuota === 'boolean' ? src.showQuota : exports.DEFAULT_APP_SETTINGS.showQuota,
        showResetCountdown: typeof src.showResetCountdown === 'boolean' ? src.showResetCountdown : exports.DEFAULT_APP_SETTINGS.showResetCountdown,
        showAiCredits: typeof src.showAiCredits === 'boolean' ? src.showAiCredits : exports.DEFAULT_APP_SETTINGS.showAiCredits,
        showSpeed: typeof src.showSpeed === 'boolean' ? src.showSpeed : exports.DEFAULT_APP_SETTINGS.showSpeed,
        showCacheHit: typeof src.showCacheHit === 'boolean' ? src.showCacheHit : exports.DEFAULT_APP_SETTINGS.showCacheHit,
        showSessionCost: typeof src.showSessionCost === 'boolean' ? src.showSessionCost : exports.DEFAULT_APP_SETTINGS.showSessionCost,
        tooltipDensity,
        showModelInternalId: typeof src.showModelInternalId === 'boolean' ? src.showModelInternalId : exports.DEFAULT_APP_SETTINGS.showModelInternalId,
        maxRecentSteps: resolvedMaxRecentSteps,
        maxArchives: resolvedMaxArchives,
        lockToMainAgent: typeof src.lockToMainAgent === 'boolean' ? src.lockToMainAgent : exports.DEFAULT_APP_SETTINGS.lockToMainAgent,
        appComposerRingEnabled: typeof src.appComposerRingEnabled === 'boolean' ? src.appComposerRingEnabled : exports.DEFAULT_APP_SETTINGS.appComposerRingEnabled,
        appTopBarEnabled: typeof src.appTopBarEnabled === 'boolean' ? src.appTopBarEnabled : exports.DEFAULT_APP_SETTINGS.appTopBarEnabled,
        orchestratorPricingMode,
        displayCurrency: normalizeDisplayCurrency(src.displayCurrency, exports.DEFAULT_APP_SETTINGS.displayCurrency),
        customFxRate: normalizePositiveNullableNumber(src.customFxRate, false),
        subscriptionMonthlyFee: normalizePositiveNullableNumber(src.subscriptionMonthlyFee, true),
        subscriptionCurrency: normalizeDisplayCurrency(src.subscriptionCurrency, exports.DEFAULT_APP_SETTINGS.subscriptionCurrency),
        calendarRetentionDays: clampInt(src.calendarRetentionDays, exports.DEFAULT_APP_SETTINGS.calendarRetentionDays, 30, 3650),
        autoCheckUpdates: typeof src.autoCheckUpdates === 'boolean' ? src.autoCheckUpdates : exports.DEFAULT_APP_SETTINGS.autoCheckUpdates,
        showNativeHudBar: typeof src.showNativeHudBar === 'boolean' ? src.showNativeHudBar : exports.DEFAULT_APP_SETTINGS.showNativeHudBar,
        lastUpdateCheck: normalizeLastUpdateCheck(src.lastUpdateCheck),
        activityMaxRecentSteps: resolvedMaxRecentSteps,
        activityMaxArchives: resolvedMaxArchives,
    };
}
const DEEP_MERGE_OBJECT_KEYS = new Set([
    'appSettings',
    'dailyLedger',
    'dailyLedgerState',
    'accountSnapshots',
    'accountBillingDays',
    'customPricing',
    'customModelPricing',
    'dailyStoreState',
    'modelDNAState',
    'quotaActiveTracking',
]);
const RENAME_RETRY_DELAYS_MS = [15, 30, 60, 120, 200];
const LOCK_STALE_MS = 5_000;
const LOCK_HARD_STALE_MS = 15_000;
const LOCK_EMPTY_GRACE_MS = 250;
const LOCK_ACQUIRE_TIMEOUT_MS = 2_500;
const MAX_MERGE_DEPTH = 6;
let tmpNonceCounter = 0;
function getDefaultStateFilePath() {
    if (process.platform === 'win32' && process.env.APPDATA) {
        return path.join(process.env.APPDATA, 'Antigravity Context Monitor', 'state-v1.json');
    }
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Antigravity Context Monitor', 'state-v1.json');
    }
    const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    return path.join(stateHome, 'antigravity-context-monitor', 'state-v1.json');
}
function hasOwn(target, key) {
    return Object.prototype.hasOwnProperty.call(target, key);
}
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function stripUtf8Bom(raw) {
    return raw.replace(/^\uFEFF/, '');
}
function deepClone(value) {
    if (value === undefined || value === null || typeof value !== 'object') {
        return value;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
    }
}
function deepEqual(a, b) {
    if (Object.is(a, b)) {
        return true;
    }
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
        return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    const objA = a;
    const objB = b;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) {
        return false;
    }
    for (const k of keysA) {
        if (!hasOwn(objB, k) || !deepEqual(objA[k], objB[k])) {
            return false;
        }
    }
    return true;
}
function parseStateFile(raw) {
    try {
        const parsed = JSON.parse(stripUtf8Bom(raw));
        if (!isPlainObject(parsed) || parsed.version !== 1) {
            return null;
        }
        const globalObj = isPlainObject(parsed.global) ? parsed.global : {};
        const workspacesRaw = isPlainObject(parsed.workspaces) ? parsed.workspaces : {};
        const workspaces = {};
        for (const [wsKey, wsVal] of Object.entries(workspacesRaw)) {
            if (isPlainObject(wsVal)) {
                workspaces[wsKey] = wsVal;
            }
        }
        return {
            version: 1,
            global: globalObj,
            workspaces,
        };
    }
    catch {
        return null;
    }
}
function mergePlainObjects3Way(base, disk, local, depth = 0) {
    const result = deepClone(disk);
    for (const [k, localVal] of Object.entries(local)) {
        const inBase = !!base && hasOwn(base, k);
        const localChanged = !inBase || !deepEqual(base[k], localVal);
        if (!localChanged) {
            // Local did not touch this entry; keep disk's value (or disk's deletion).
            continue;
        }
        if (depth < MAX_MERGE_DEPTH && isPlainObject(result[k]) && isPlainObject(localVal)) {
            const baseSub = inBase && isPlainObject(base[k]) ? base[k] : undefined;
            result[k] = mergePlainObjects3Way(baseSub, result[k], localVal, depth + 1);
        }
        else {
            result[k] = deepClone(localVal);
        }
    }
    // Honor explicit local deletions when disk did not modify the deleted entry.
    if (base) {
        for (const k of Object.keys(base)) {
            if (!hasOwn(local, k) && hasOwn(result, k) && deepEqual(base[k], result[k])) {
                delete result[k];
            }
        }
    }
    return result;
}
function isAccountSnapshotArray(value) {
    return Array.isArray(value)
        && value.every(item => isPlainObject(item) && typeof item.email === 'string' && item.email.length > 0);
}
function mergeAccountSnapshotArrays3Way(base, disk, local) {
    const toMap = (arr) => {
        const out = {};
        for (const item of arr) {
            out[item.email] = item;
        }
        return out;
    };
    const baseMap = isAccountSnapshotArray(base) ? toMap(base) : undefined;
    const diskMap = toMap(disk);
    const localMap = toMap(local);
    const mergedMap = mergePlainObjects3Way(baseMap, diskMap, localMap, MAX_MERGE_DEPTH);
    return Object.values(mergedMap);
}
function mergeSettledEntries(diskSettled, localSettled) {
    const out = [];
    const seen = new Set();
    const add = (entry) => {
        if (isPlainObject(entry)) {
            const settledAt = typeof entry.settledAt === 'string' ? entry.settledAt : '';
            const email = typeof entry.accountEmail === 'string' ? entry.accountEmail : '';
            const poolIds = Array.isArray(entry.poolModelIds) ? entry.poolModelIds.join(',') : '';
            const key = settledAt || email || poolIds
                ? `${settledAt}|${email}|${poolIds}`
                : JSON.stringify(entry);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
        }
        out.push(deepClone(entry));
    };
    for (const item of diskSettled) {
        add(item);
    }
    for (const item of localSettled) {
        add(item);
    }
    return out;
}
function mergeDailyLedgerState3Way(base, disk, local) {
    const diskDate = typeof disk.dateKey === 'string' ? disk.dateKey : '';
    const localDate = typeof local.dateKey === 'string' ? local.dateKey : '';
    if (diskDate && localDate && diskDate !== localDate) {
        return deepClone(localDate > diskDate ? local : disk);
    }
    const merged = mergePlainObjects3Way(base, disk, local, 0);
    if (Array.isArray(disk.settled) && Array.isArray(local.settled)) {
        merged.settled = mergeSettledEntries(disk.settled, local.settled);
    }
    return merged;
}
function mergeConcurrentValue(key, baseVal, diskVal, localVal) {
    if (key === 'accountSnapshots' && isAccountSnapshotArray(diskVal) && isAccountSnapshotArray(localVal)) {
        return mergeAccountSnapshotArrays3Way(baseVal, diskVal, localVal);
    }
    if ((key === 'dailyLedger' || key === 'dailyLedgerState') && isPlainObject(diskVal) && isPlainObject(localVal)) {
        return mergeDailyLedgerState3Way(isPlainObject(baseVal) ? baseVal : undefined, diskVal, localVal);
    }
    if (key === 'monitorSnapshotState' && isPlainObject(diskVal) && isPlainObject(localVal)) {
        return mergePlainObjects3Way(isPlainObject(baseVal) ? baseVal : undefined, diskVal, localVal, 0);
    }
    if (DEEP_MERGE_OBJECT_KEYS.has(key) && isPlainObject(diskVal) && isPlainObject(localVal)) {
        return mergePlainObjects3Way(isPlainObject(baseVal) ? baseVal : undefined, diskVal, localVal, 0);
    }
    return deepClone(localVal);
}
async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}
async function renameWithRetry(src, dest) {
    for (let attempt = 0;; attempt++) {
        try {
            await fs.promises.rename(src, dest);
            return;
        }
        catch (err) {
            const code = err.code;
            const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
            if (!retryable || attempt >= RENAME_RETRY_DELAYS_MS.length) {
                throw err;
            }
            await sleep(RENAME_RETRY_DELAYS_MS[attempt]);
        }
    }
}
async function readFileWithRetry(filePath) {
    for (let attempt = 0;; attempt++) {
        try {
            return await fs.promises.readFile(filePath, 'utf8');
        }
        catch (err) {
            const code = err.code;
            if (code === 'ENOENT') {
                return null;
            }
            const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
            if (!retryable || attempt >= 2) {
                return null;
            }
            await sleep(15 * (attempt + 1));
        }
    }
}
function buildTempFilePath(filePath) {
    tmpNonceCounter = (tmpNonceCounter + 1) >>> 0;
    const nonce = `${crypto.randomBytes(6).toString('hex')}-${tmpNonceCounter.toString(36)}`;
    return path.join(path.dirname(filePath), `${path.basename(filePath)}.${process.pid}.${nonce}.tmp`);
}
class DurableStateLockTimeoutError extends Error {
    code = 'ELOCKTIMEOUT';
    lockPath;
    holderPid;
    constructor(lockPath, holderPid) {
        super(holderPid !== null
            ? `Timed out waiting for durable state lock held by active PID ${holderPid}: ${lockPath}`
            : `Timed out waiting for active durable state lock: ${lockPath}`);
        this.name = 'DurableStateLockTimeoutError';
        this.lockPath = lockPath;
        this.holderPid = holderPid;
    }
}
exports.DurableStateLockTimeoutError = DurableStateLockTimeoutError;
/**
 * Parse lock file contents formatted as `<pid>:<timestampMs>[:<ownerToken>]`.
 */
function parseLockFileContent(raw) {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    const parts = trimmed.split(':');
    const pid = /^\d+$/.test(parts[0] || '') ? Number(parts[0]) : null;
    const validPid = pid !== null && Number.isSafeInteger(pid) && pid > 0 && pid <= 0xffffffff ? pid : null;
    const createdAtMs = parts.length >= 2 && /^\d+$/.test(parts[1] || '') ? Number(parts[1]) : null;
    const validTs = createdAtMs !== null && Number.isSafeInteger(createdAtMs) && createdAtMs > 0 ? createdAtMs : null;
    const token = parts.length >= 3 && parts[2].trim().length > 0 ? parts[2].trim() : null;
    if (validPid === null && validTs === null && token === null) {
        return null;
    }
    return { pid: validPid, createdAtMs: validTs, token };
}
/**
 * Check whether an OS PID is currently alive.
 * `EPERM` means the process exists under another privilege/user boundary (alive).
 * `ESRCH` means no such process exists (dead).
 */
function isPidAlive(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
        return false;
    }
    if (pid === process.pid) {
        return true;
    }
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        const code = err.code;
        if (code === 'EPERM') {
            return true;
        }
        return false;
    }
}
async function inspectLockStaleness(lockPath, staleMs, hardStaleMs, checkPidAlive, nowFn) {
    let st;
    try {
        st = await fs.promises.stat(lockPath);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { exists: false, stale: false, holderPid: null };
        }
        return { exists: true, stale: false, holderPid: null };
    }
    const nowMs = nowFn();
    const ageMs = Math.max(0, nowMs - st.mtimeMs);
    const raw = await fs.promises.readFile(lockPath, 'utf8').catch(() => null);
    if (raw === null) {
        // Lock disappeared or could not be read due to transient contention; only treat stale past hard cap.
        return { exists: true, stale: ageMs > hardStaleMs, holderPid: null };
    }
    if (raw.trim().length === 0) {
        // Another writer may have just created the lock via 'wx' before finishing writeFile().
        if (ageMs < LOCK_EMPTY_GRACE_MS) {
            return { exists: true, stale: false, holderPid: null };
        }
        return { exists: true, stale: ageMs > staleMs, holderPid: null };
    }
    const meta = parseLockFileContent(raw);
    if (!meta || meta.pid === null) {
        // Corrupt or non-PID lock file: reclaim once older than staleMs.
        return { exists: true, stale: ageMs > staleMs, holderPid: null };
    }
    // Dead owning process -> definitively stale and safe to reclaim immediately.
    if (meta.pid !== process.pid && !checkPidAlive(meta.pid)) {
        return { exists: true, stale: true, holderPid: meta.pid };
    }
    // Active PID: never steal a fresh lock! Only treat as abandoned past hardStaleMs (e.g. PID reuse).
    return {
        exists: true,
        stale: ageMs > hardStaleMs,
        holderPid: meta.pid,
    };
}
async function reclaimStaleLockFile(lockPath) {
    const tombstone = `${lockPath}.stale.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
    try {
        // Atomic rename prevents a racing waiter from unlinking a freshly created lock.
        await fs.promises.rename(lockPath, tombstone);
        await fs.promises.unlink(tombstone).catch(() => { });
    }
    catch (err) {
        const code = err.code;
        if (code === 'ENOENT') {
            return;
        }
        // Fallback if rename is blocked on certain filesystems
        await fs.promises.unlink(lockPath).catch(() => { });
    }
}
async function acquireLockFile(lockPath, options = {}) {
    const timeoutMs = options.timeoutMs ?? LOCK_ACQUIRE_TIMEOUT_MS;
    const staleMs = options.staleMs ?? LOCK_STALE_MS;
    const hardStaleMs = options.hardStaleMs ?? Math.max(staleMs * 3, LOCK_HARD_STALE_MS);
    const checkPidAlive = options.isPidAlive ?? isPidAlive;
    const nowFn = options.now ?? (() => Date.now());
    const deadline = nowFn() + Math.max(0, timeoutMs);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    const mode = process.platform === 'win32' ? undefined : 0o600;
    const ownerToken = crypto.randomBytes(8).toString('hex');
    let attempt = 0;
    const createOwnedLock = async () => {
        const handle = await fs.promises.open(lockPath, 'wx', mode);
        try {
            await handle.writeFile(`${process.pid}:${nowFn()}:${ownerToken}\n`, 'utf8');
        }
        finally {
            await handle.close();
        }
        let released = false;
        return async () => {
            if (released) {
                return;
            }
            released = true;
            try {
                // Verify we still own this lockfile before unlinking so we never remove another writer's lock.
                const current = await fs.promises.readFile(lockPath, 'utf8');
                const meta = parseLockFileContent(current);
                if (meta?.token && meta.token !== ownerToken) {
                    return;
                }
            }
            catch (readErr) {
                if (readErr.code === 'ENOENT') {
                    return;
                }
            }
            await fs.promises.unlink(lockPath).catch(() => { });
        };
    };
    while (true) {
        try {
            return await createOwnedLock();
        }
        catch (err) {
            const code = err.code;
            const isContention = code === 'EEXIST'
                || (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'));
            if (!isContention) {
                throw err;
            }
            const inspection = await inspectLockStaleness(lockPath, staleMs, hardStaleMs, checkPidAlive, nowFn);
            if (!inspection.exists) {
                continue;
            }
            if (inspection.stale) {
                await reclaimStaleLockFile(lockPath);
                continue;
            }
            if (nowFn() >= deadline) {
                // Active writer still holds a non-stale lock — NEVER delete it or proceed unlocked.
                throw new DurableStateLockTimeoutError(lockPath, inspection.holderPid);
            }
            attempt++;
            const jitter = Math.floor(Math.random() * 8);
            const remaining = Math.max(1, deadline - nowFn());
            await sleep(Math.min(5 + attempt * 5 + jitter, 50, remaining));
        }
    }
}
class DurableState {
    static SAVE_DEBOUNCE_MS = 250;
    _filePath;
    _lockOptions;
    _data;
    _baseData;
    _lastSerialized;
    _lastKnownMtimeMs = null;
    _lastKnownSize = null;
    _dirtyGlobalKeys = new Map();
    _dirtyWorkspaceKeys = new Map();
    _seededGlobalKeys = new Map();
    _seededWorkspaceKeys = new Map();
    /**
     * Tracks mergeable object-map keys that were updated on disk by another process
     * during an earlier flush/reload, before local callers re-read them via `get()`.
     * Prevents a subsequent write from a stale in-memory store (e.g. PricingStore /
     * DailyLedger) from silently clobbering entries added by the peer process.
     */
    _unseenExternalGlobal = new Map();
    _hasUnnotifiedExternalChanges = false;
    _saveTimer;
    _pendingVersion = 0;
    _writtenVersion = 0;
    _flushInFlight = null;
    _waiters = new Map();
    constructor(filePath = getDefaultStateFilePath(), options) {
        this._filePath = filePath;
        this._lockOptions = options?.lockOptions;
        this._data = this._load();
        this._baseData = deepClone(this._data);
        this._lastSerialized = this._serialize(this._data);
    }
    globalBucket(fallback) {
        return this._createBucket('global', undefined, fallback);
    }
    workspaceBucket(workspaceKey, fallback) {
        return this._createBucket('workspace', workspaceKey, fallback);
    }
    /** Read normalized v1.17.6+ `global.appSettings` with safe backward-compatible defaults. */
    getAppSettings() {
        return normalizeAppSettings(this.globalBucket().get('appSettings', null));
    }
    /** Merge and persist a partial update into `global.appSettings` (deep-merged per key across App & IDE). */
    async updateAppSettings(patch) {
        const current = this.getAppSettings();
        const merged = normalizeAppSettings({ ...current, ...patch });
        await this.globalBucket().update('appSettings', merged);
        return merged;
    }
    getFilePath() {
        return this._filePath;
    }
    exists() {
        return fs.existsSync(this._filePath);
    }
    /** Immediately flush any pending writes to disk (useful on shutdown or in tests). */
    async flush() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = undefined;
        }
        while (this._flushInFlight || this._pendingVersion > this._writtenVersion) {
            if (this._flushInFlight) {
                await this._flushInFlight;
            }
            else {
                await this._flush();
            }
        }
    }
    /**
     * Re-read the on-disk file if it changed externally and merge non-dirty keys
     * into memory without discarding unsaved local updates.
     * Returns true when external changes were loaded.
     */
    reloadIfChanged() {
        const hadBufferedExternal = this._hasUnnotifiedExternalChanges;
        this._hasUnnotifiedExternalChanges = false;
        try {
            const stat = fs.statSync(this._filePath);
            const changedByStat = this._lastKnownMtimeMs === null
                || stat.mtimeMs !== this._lastKnownMtimeMs
                || stat.size !== this._lastKnownSize;
            const raw = fs.readFileSync(this._filePath, 'utf8');
            const clean = stripUtf8Bom(raw);
            if (!changedByStat && clean === this._lastSerialized) {
                return hadBufferedExternal;
            }
            const diskData = parseStateFile(clean);
            if (!diskData) {
                return hadBufferedExternal;
            }
            const merged = this._mergeWithDisk(diskData, this._data, this._pendingVersion);
            this._data = merged;
            this._baseData = deepClone(diskData);
            this._lastSerialized = this._serialize(diskData);
            this._lastKnownMtimeMs = stat.mtimeMs;
            this._lastKnownSize = stat.size;
            return true;
        }
        catch {
            return hadBufferedExternal;
        }
    }
    _createBucket(kind, workspaceKey, fallback) {
        return {
            get: (key, defaultValue) => {
                if (kind === 'global') {
                    this._unseenExternalGlobal.delete(key);
                }
                const source = kind === 'global'
                    ? this._data.global
                    : (this._data.workspaces[workspaceKey || '__default__'] || {});
                if (hasOwn(source, key)) {
                    return source[key];
                }
                if (!fallback) {
                    return defaultValue;
                }
                const fallbackValue = fallback.get(key, defaultValue);
                if (!deepEqual(fallbackValue, defaultValue)) {
                    this._set(kind, key, fallbackValue, workspaceKey, false);
                }
                return fallbackValue;
            },
            update: async (key, value) => {
                await this._set(kind, key, value, workspaceKey, true);
                if (fallback) {
                    await fallback.update(key, value);
                }
            },
        };
    }
    _set(kind, key, value, workspaceKey, isExplicitWrite = true) {
        const nextVersion = this._pendingVersion + 1;
        if (kind === 'global') {
            let effectiveValue = value;
            if (isExplicitWrite) {
                const unseen = this._unseenExternalGlobal.get(key);
                if (unseen) {
                    this._unseenExternalGlobal.delete(key);
                    effectiveValue = mergeConcurrentValue(key, unseen.base, unseen.disk, value);
                    if (!deepEqual(effectiveValue, value)) {
                        this._hasUnnotifiedExternalChanges = true;
                    }
                }
            }
            this._data.global[key] = effectiveValue;
            if (isExplicitWrite) {
                this._dirtyGlobalKeys.set(key, nextVersion);
                this._seededGlobalKeys.delete(key);
            }
            else if (!this._dirtyGlobalKeys.has(key)) {
                this._seededGlobalKeys.set(key, nextVersion);
            }
        }
        else {
            const bucketKey = workspaceKey || '__default__';
            if (!this._data.workspaces[bucketKey]) {
                this._data.workspaces[bucketKey] = {};
            }
            this._data.workspaces[bucketKey][key] = value;
            if (isExplicitWrite) {
                let wsDirty = this._dirtyWorkspaceKeys.get(bucketKey);
                if (!wsDirty) {
                    wsDirty = new Map();
                    this._dirtyWorkspaceKeys.set(bucketKey, wsDirty);
                }
                wsDirty.set(key, nextVersion);
                this._seededWorkspaceKeys.get(bucketKey)?.delete(key);
            }
            else if (!this._dirtyWorkspaceKeys.get(bucketKey)?.has(key)) {
                let wsSeeded = this._seededWorkspaceKeys.get(bucketKey);
                if (!wsSeeded) {
                    wsSeeded = new Map();
                    this._seededWorkspaceKeys.set(bucketKey, wsSeeded);
                }
                wsSeeded.set(key, nextVersion);
            }
        }
        return this._scheduleSave();
    }
    _load() {
        try {
            if (!fs.existsSync(this._filePath)) {
                this._lastKnownMtimeMs = null;
                this._lastKnownSize = null;
                return { version: 1, global: {}, workspaces: {} };
            }
            const stat = fs.statSync(this._filePath);
            const raw = fs.readFileSync(this._filePath, 'utf8');
            const parsed = parseStateFile(raw);
            this._lastKnownMtimeMs = stat.mtimeMs;
            this._lastKnownSize = stat.size;
            if (!parsed) {
                return { version: 1, global: {}, workspaces: {} };
            }
            return parsed;
        }
        catch {
            this._lastKnownMtimeMs = null;
            this._lastKnownSize = null;
            return { version: 1, global: {}, workspaces: {} };
        }
    }
    _serialize(data) {
        return JSON.stringify(data, null, 2);
    }
    _scheduleSave() {
        this._pendingVersion++;
        const version = this._pendingVersion;
        const pending = new Promise(resolve => {
            const waiters = this._waiters.get(version) || [];
            waiters.push(resolve);
            this._waiters.set(version, waiters);
        });
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
        }
        this._saveTimer = setTimeout(() => {
            this._saveTimer = undefined;
            void this._flush();
        }, DurableState.SAVE_DEBOUNCE_MS);
        return pending;
    }
    _resolveWaitersUpTo(version) {
        for (const waiterVersion of [...this._waiters.keys()]) {
            if (waiterVersion > version) {
                continue;
            }
            const waiters = this._waiters.get(waiterVersion) || [];
            this._waiters.delete(waiterVersion);
            for (const resolve of waiters) {
                resolve();
            }
        }
    }
    _mergeWithDisk(diskData, localSnapshot, targetVersion) {
        const merged = deepClone(diskData);
        // Apply passive seeds only if disk does not already define that key.
        for (const [k, ver] of this._seededGlobalKeys.entries()) {
            if (ver <= targetVersion && !hasOwn(merged.global, k) && hasOwn(localSnapshot.global, k)) {
                merged.global[k] = deepClone(localSnapshot.global[k]);
            }
        }
        // Apply explicit local global writes, deep-merging object maps by key.
        for (const [k, ver] of this._dirtyGlobalKeys.entries()) {
            if (ver > targetVersion || !hasOwn(localSnapshot.global, k)) {
                continue;
            }
            if (hasOwn(merged.global, k)) {
                merged.global[k] = mergeConcurrentValue(k, this._baseData.global[k], merged.global[k], localSnapshot.global[k]);
            }
            else {
                merged.global[k] = deepClone(localSnapshot.global[k]);
            }
        }
        // Apply passive workspace seeds only if disk does not already define them.
        for (const [wsKey, seededMap] of this._seededWorkspaceKeys.entries()) {
            const localWs = localSnapshot.workspaces[wsKey];
            if (!localWs) {
                continue;
            }
            for (const [k, ver] of seededMap.entries()) {
                if (ver > targetVersion || !hasOwn(localWs, k)) {
                    continue;
                }
                if (!merged.workspaces[wsKey]) {
                    merged.workspaces[wsKey] = {};
                }
                if (!hasOwn(merged.workspaces[wsKey], k)) {
                    merged.workspaces[wsKey][k] = deepClone(localWs[k]);
                }
            }
        }
        // Apply explicit local workspace writes.
        for (const [wsKey, dirtyMap] of this._dirtyWorkspaceKeys.entries()) {
            const localWs = localSnapshot.workspaces[wsKey];
            if (!localWs) {
                continue;
            }
            if (!merged.workspaces[wsKey]) {
                merged.workspaces[wsKey] = {};
            }
            const baseWs = this._baseData.workspaces[wsKey] || {};
            for (const [k, ver] of dirtyMap.entries()) {
                if (ver > targetVersion || !hasOwn(localWs, k)) {
                    continue;
                }
                if (hasOwn(merged.workspaces[wsKey], k)) {
                    merged.workspaces[wsKey][k] = mergeConcurrentValue(k, baseWs[k], merged.workspaces[wsKey][k], localWs[k]);
                }
                else {
                    merged.workspaces[wsKey][k] = deepClone(localWs[k]);
                }
            }
        }
        return merged;
    }
    _reconcileInMemoryAfterMerge(merged, targetVersion, prevBaseGlobal) {
        // Pull in merged/external disk keys for anything not mutated again after targetVersion.
        for (const [k, v] of Object.entries(merged.global)) {
            const dirtyVer = this._dirtyGlobalKeys.get(k);
            if (dirtyVer === undefined || dirtyVer <= targetVersion) {
                // If an external writer updated a mergeable key that local hasn't touched yet,
                // record the pre-external base so a later write from a stale in-memory store merges safely.
                if (dirtyVer === undefined && DEEP_MERGE_OBJECT_KEYS.has(k) && !deepEqual(prevBaseGlobal[k], v)) {
                    const existing = this._unseenExternalGlobal.get(k);
                    this._unseenExternalGlobal.set(k, {
                        base: existing ? existing.base : deepClone(prevBaseGlobal[k]),
                        disk: deepClone(v),
                    });
                }
                if (!hasOwn(this._data.global, k) || !deepEqual(this._data.global[k], v)) {
                    this._hasUnnotifiedExternalChanges = true;
                }
                this._data.global[k] = deepClone(v);
            }
        }
        for (const [wsKey, wsObj] of Object.entries(merged.workspaces)) {
            if (!this._data.workspaces[wsKey]) {
                this._data.workspaces[wsKey] = {};
            }
            const dirtyWs = this._dirtyWorkspaceKeys.get(wsKey);
            for (const [k, v] of Object.entries(wsObj)) {
                const dirtyVer = dirtyWs?.get(k);
                if (dirtyVer === undefined || dirtyVer <= targetVersion) {
                    if (!hasOwn(this._data.workspaces[wsKey], k) || !deepEqual(this._data.workspaces[wsKey][k], v)) {
                        this._hasUnnotifiedExternalChanges = true;
                    }
                    this._data.workspaces[wsKey][k] = deepClone(v);
                }
            }
        }
    }
    _clearDirtyUpTo(version) {
        for (const [k, v] of [...this._dirtyGlobalKeys.entries()]) {
            if (v <= version) {
                this._dirtyGlobalKeys.delete(k);
            }
        }
        for (const [k, v] of [...this._seededGlobalKeys.entries()]) {
            if (v <= version) {
                this._seededGlobalKeys.delete(k);
            }
        }
        for (const [wsKey, map] of [...this._dirtyWorkspaceKeys.entries()]) {
            for (const [k, v] of [...map.entries()]) {
                if (v <= version) {
                    map.delete(k);
                }
            }
            if (map.size === 0) {
                this._dirtyWorkspaceKeys.delete(wsKey);
            }
        }
        for (const [wsKey, map] of [...this._seededWorkspaceKeys.entries()]) {
            for (const [k, v] of [...map.entries()]) {
                if (v <= version) {
                    map.delete(k);
                }
            }
            if (map.size === 0) {
                this._seededWorkspaceKeys.delete(wsKey);
            }
        }
    }
    async _flush() {
        if (this._flushInFlight) {
            await this._flushInFlight;
            return;
        }
        const targetVersion = this._pendingVersion;
        const localSnapshot = deepClone(this._data);
        const hasAnyDirty = this._dirtyGlobalKeys.size > 0
            || this._dirtyWorkspaceKeys.size > 0
            || this._seededGlobalKeys.size > 0
            || this._seededWorkspaceKeys.size > 0;
        this._flushInFlight = (async () => {
            let releaseLock = null;
            try {
                releaseLock = await acquireLockFile(`${this._filePath}.lock`, this._lockOptions);
                let dataToWrite = localSnapshot;
                let diskExists = false;
                let diskChanged = false;
                try {
                    const stat = await fs.promises.stat(this._filePath);
                    diskExists = true;
                    const statDiffers = this._lastKnownMtimeMs === null
                        || stat.mtimeMs !== this._lastKnownMtimeMs
                        || stat.size !== this._lastKnownSize
                        || Math.abs(Date.now() - stat.mtimeMs) < 1500;
                    if (statDiffers) {
                        const rawDisk = await readFileWithRetry(this._filePath);
                        if (rawDisk !== null) {
                            const cleanDisk = stripUtf8Bom(rawDisk);
                            if (cleanDisk !== this._lastSerialized || this._lastKnownMtimeMs === null) {
                                const parsedDisk = parseStateFile(cleanDisk);
                                if (parsedDisk) {
                                    diskChanged = true;
                                    dataToWrite = this._mergeWithDisk(parsedDisk, localSnapshot, targetVersion);
                                }
                            }
                        }
                    }
                }
                catch (err) {
                    const code = err.code;
                    if (code !== 'ENOENT') {
                        // Proceed with local snapshot if stat fails unexpectedly.
                    }
                }
                const serialized = this._serialize(dataToWrite);
                if (diskExists && !diskChanged && serialized === this._lastSerialized && !hasAnyDirty) {
                    this._clearDirtyUpTo(targetVersion);
                    return;
                }
                if (diskExists && !diskChanged && serialized === this._lastSerialized) {
                    this._clearDirtyUpTo(targetVersion);
                    return;
                }
                await fs.promises.mkdir(path.dirname(this._filePath), { recursive: true });
                const tmpPath = buildTempFilePath(this._filePath);
                try {
                    const writeOpts = process.platform === 'win32'
                        ? { encoding: 'utf8' }
                        : { encoding: 'utf8', mode: 0o600 };
                    await fs.promises.writeFile(tmpPath, serialized, writeOpts);
                    await renameWithRetry(tmpPath, this._filePath);
                }
                catch (writeErr) {
                    await fs.promises.unlink(tmpPath).catch(() => { });
                    throw writeErr;
                }
                const prevBaseGlobal = this._baseData.global;
                this._lastSerialized = serialized;
                this._baseData = deepClone(dataToWrite);
                if (diskChanged) {
                    this._reconcileInMemoryAfterMerge(dataToWrite, targetVersion, prevBaseGlobal);
                }
                this._clearDirtyUpTo(targetVersion);
                try {
                    const updatedStat = await fs.promises.stat(this._filePath);
                    this._lastKnownMtimeMs = updatedStat.mtimeMs;
                    this._lastKnownSize = updatedStat.size;
                }
                catch {
                    this._lastKnownMtimeMs = null;
                    this._lastKnownSize = null;
                }
            }
            catch (err) {
                console.warn('[Antigravity Context Monitor] Durable state persistence failed:', err);
            }
            finally {
                if (releaseLock) {
                    await releaseLock();
                }
                this._writtenVersion = Math.max(this._writtenVersion, targetVersion);
                this._resolveWaitersUpTo(this._writtenVersion);
                this._flushInFlight = null;
                if (!this._saveTimer && this._pendingVersion > this._writtenVersion) {
                    void this._flush();
                }
            }
        })();
        await this._flushInFlight;
    }
}
exports.DurableState = DurableState;
//# sourceMappingURL=durable-state.js.map