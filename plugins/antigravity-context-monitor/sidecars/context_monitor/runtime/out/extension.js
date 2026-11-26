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
exports.syncDurableStateFromDisk = exports.OPEN_VSX_EXTENSION_URL = void 0;
exports.syncFromDurableStateIfChanged = syncFromDurableStateIfChanged;
exports.isSharedAppSettingsHydrated = isSharedAppSettingsHydrated;
exports.getSharedAppSettings = getSharedAppSettings;
exports.flushDurableState = flushDurableState;
exports.setSharedOrchestratorPricingMode = setSharedOrchestratorPricingMode;
exports.updateSharedAppSetting = updateSharedAppSetting;
exports.getCachedCliUsageDays = getCachedCliUsageDays;
exports.getLastUpdateStatusView = getLastUpdateStatusView;
exports.checkIdeReleaseUpdates = checkIdeReleaseUpdates;
exports.getLockToMainAgent = getLockToMainAgent;
exports.setLockToMainAgent = setLockToMainAgent;
exports.getPinnedConversationId = getPinnedConversationId;
exports.selectPinnedConversation = selectPinnedConversation;
exports.invalidateLiveModelMetadata = invalidateLiveModelMetadata;
exports.hasSameUsageInputs = hasSameUsageInputs;
exports.measuredContextDrop = measuredContextDrop;
exports.hasGMSummaryChanged = hasGMSummaryChanged;
exports.persistClearedToolCatalog = persistClearedToolCatalog;
exports.selectRunningTrajectoryCandidate = selectRunningTrajectoryCandidate;
exports.buildUsageScopeTrajectories = buildUsageScopeTrajectories;
exports.hasAuxiliaryMetadataChanged = hasAuxiliaryMetadataChanged;
exports.applyLiveModelStatus = applyLiveModelStatus;
exports.parsePositivePoolResetMs = parsePositivePoolResetMs;
exports.comparePoolResetTimes = comparePoolResetTimes;
exports.groupModelConfigsByQuotaPool = groupModelConfigsByQuotaPool;
exports.shouldSettleOnResetTimeChange = shouldSettleOnResetTimeChange;
exports.fetchAndOverrideCheckpointerLimits = fetchAndOverrideCheckpointerLimits;
exports.removeAccountSnapshot = removeAccountSnapshot;
exports.getBillingDaysMap = getBillingDaysMap;
exports.setAccountBillingDay = setAccountBillingDay;
exports.activate = activate;
exports.deactivate = deactivate;
exports.refreshStatusBarTelemetry = refreshStatusBarTelemetry;
exports.applyGMContextToUsage = applyGMContextToUsage;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const backend_connection_1 = require("./backend-connection");
const tracker_1 = require("./tracker");
const models_1 = require("./models");
const rpc_client_1 = require("./rpc-client");
const statusbar_1 = require("./statusbar");
const i18n_1 = require("./i18n");
const context_breakdown_1 = require("./context-breakdown");
const turn_diagnostics_1 = require("./turn-diagnostics");
const quota_runway_1 = require("./quota-runway");
const conversation_selector_1 = require("./conversation-selector");
const account_credits_1 = require("./account-credits");
const model_quota_1 = require("./model-quota");
const monitor_overview_1 = require("./monitor-overview");
const webview_panel_1 = require("./webview-panel");
const activity_tracker_1 = require("./activity-tracker");
const constants_1 = require("./constants");
const quota_tracker_1 = require("./quota-tracker");
const gm_tracker_1 = require("./gm-tracker");
const pricing_store_1 = require("./pricing-store");
const daily_store_1 = require("./daily-store");
const monitor_store_1 = require("./monitor-store");
const daily_archival_1 = require("./daily-archival");
const durable_state_1 = require("./durable-state");
const model_dna_store_1 = require("./model-dna-store");
const billing_day_1 = require("./billing-day");
const pool_utils_1 = require("./pool-utils");
const daily_ledger_1 = require("./daily-ledger");
const cli_usage_scanner_1 = require("./cli-usage-scanner");
const plugin_updater_1 = require("./app/plugin-updater");
const tooltip_budget_1 = require("./tooltip-budget");
// ─── Extension State ──────────────────────────────────────────────────────────
// Each VS Code window runs its own extension instance, so module-level
// variables are window-isolated — perfect for per-window cascade tracking.
let statusBar;
let pollingTimer;
let pollGeneration = 0;
let disposed = false;
let cachedLsInfo = null;
let currentUsage = null;
let allTrajectoryUsages = [];
let lastTrajectories = [];
let cachedModelConfigs = [];
let cachedUserInfo = null;
let cachedOrchestratorSettings = null;
let cachedQuotaSummary = null;
let statusPollCount = 0;
/** Refresh user status every N poll cycles (~10s at default 5s interval) */
const STATUS_REFRESH_INTERVAL = 2;
let outputChannel;
let quotaTracker;
let activityTracker;
let gmTracker;
let lastGMSummary = null;
let pricingStore;
let dailyStore;
let dailyLedger;
let monitorStore;
let durableState;
let durableGlobalState;
let durableWorkspaceState;
let durableFileGlobalState;
let durableFileWorkspaceState;
let persistedModelDNA = {};
// ─── Multi-Account Snapshot State ─────────────────────────────────────────────
/** Map of email → AccountSnapshot, persisted across sessions. */
let accountSnapshots = new Map();
/** Tracks already-notified reset events to avoid duplicate popups. Key = `email:resetTime` */
const notifiedAccountResets = new Set();
/** Currently active account email for switch detection. */
let currentAccountEmail = '';
/** Per-account billing day map (email → day 1-31), persisted in durable state. */
let billingDaysMap = {};
/** Last archived local date key ('YYYY-MM-DD'), used to detect date rollover. */
let lastArchivalDateKey = '';
/** Throttle activity persistence: max once per 30s */
let lastActivityPersistTime = 0;
/** Extension context reference — needed for workspaceState persistence. */
let extensionContext;
/** The cascade ID that THIS window instance is tracking. */
let trackedCascadeId = null;
// ─── v1.17.5 Telemetry, Runway, Stale Guard & Conversation Lock State ─────────
let lockToMainAgent = false;
let pinnedConversationId = null;
let lockedMainCascadeId = null;
let quotaRunwayTracker = new quota_runway_1.QuotaRunwayTracker();
let lastRunwayPersistMs = 0;
const userStatusStaleGuard = new quota_runway_1.StaleCacheGuard();
const trajectoriesStaleGuard = new quota_runway_1.StaleCacheGuard();
let lastContextBreakdown = null;
let lastContextBreakdownKey = '';
let lastTurnDiagnostics = null;
const maxObservedStepCounts = new Map();
const previousBreakdownUsedTokens = new Map();
// ─── v1.17.6 Shared App Settings, CLI Scanner, Updates & Bidirectional Hot Sync ─
exports.OPEN_VSX_EXTENSION_URL = 'https://open-vsx.org/extension/AGI-is-going-to-arrive/antigravity-context-monitor';
const CLI_SCAN_TTL_MS = 60_000;
let sharedAppSettings = { ...durable_state_1.DEFAULT_APP_SETTINGS, showNativeHudBar: false };
let sharedSubscriptionPlan = 'none';
let lastSyncedDiskAppSettings = null;
let hasHydratedSharedSettings = false;
let pendingConfigSyncCount = 0;
const cliUsageScanner = new cli_usage_scanner_1.CliUsageScanner();
let cachedCliDays = [];
let lastCliScanAtMs = 0;
let lastUpdateStatusView = null;
let autoUpdateCheckInFlight = false;
function clampNum(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function inferIdeSubscriptionPlan(rawPlan, monthlyFee) {
    return (0, cli_usage_scanner_1.normalizeSubscriptionPlanId)(rawPlan, monthlyFee);
}
function getIdeExtensionVersion() {
    const raw = extensionContext?.extension?.packageJSON?.version;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : '1.17.9';
}
const VSCODE_TO_APP_SETTING_MAP = [
    { vscodeKey: 'pollingInterval', appKey: 'pollingInterval' },
    { vscodeKey: 'quotaNotificationThreshold', appKey: 'quotaNotificationThreshold' },
    { vscodeKey: 'statusBar.showContext', appKey: 'showContext' },
    { vscodeKey: 'statusBar.showQuota', appKey: 'showQuota' },
    { vscodeKey: 'statusBar.showResetCountdown', appKey: 'showResetCountdown' },
    { vscodeKey: 'statusBar.showAiCredits', appKey: 'showAiCredits' },
    { vscodeKey: 'statusBar.showSpeed', appKey: 'showSpeed' },
    { vscodeKey: 'statusBar.showCacheHit', appKey: 'showCacheHit' },
    { vscodeKey: 'statusBar.showSessionCost', appKey: 'showSessionCost' },
    { vscodeKey: 'statusBar.tooltipDensity', appKey: 'tooltipDensity' },
    { vscodeKey: 'showModelInternalId', appKey: 'showModelInternalId' },
    { vscodeKey: 'activity.maxRecentSteps', appKey: 'activityMaxRecentSteps' },
    { vscodeKey: 'activity.maxArchives', appKey: 'activityMaxArchives' },
    { vscodeKey: 'orchestratorPricingMode', appKey: 'orchestratorPricingMode' },
    { vscodeKey: 'displayCurrency', appKey: 'displayCurrency' },
    { vscodeKey: 'customFxRate', appKey: 'customFxRate' },
    { vscodeKey: 'subscriptionMonthlyFee', appKey: 'subscriptionMonthlyFee' },
    { vscodeKey: 'subscriptionCurrency', appKey: 'subscriptionCurrency' },
    { vscodeKey: 'calendarRetentionDays', appKey: 'calendarRetentionDays' },
    { vscodeKey: 'autoCheckUpdates', appKey: 'autoCheckUpdates' },
    { vscodeKey: 'showNativeHudBar', appKey: 'showNativeHudBar' },
];
function mirrorVscodeKeysFromAppSettings(prev, next, nextPlan, prevPlan, initialDiskKeys) {
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    if (typeof cfg.update !== 'function') {
        return;
    }
    const updates = [];
    for (const { vscodeKey, appKey } of VSCODE_TO_APP_SETTING_MAP) {
        const shouldMirror = prev
            ? prev[appKey] !== next[appKey]
            : Boolean(initialDiskKeys && initialDiskKeys.has(appKey));
        if (!shouldMirror) {
            continue;
        }
        const currentVal = cfg.get(vscodeKey);
        if (currentVal !== next[appKey]) {
            updates.push([vscodeKey, next[appKey]]);
        }
    }
    const shouldMirrorPlan = prev
        ? prevPlan !== nextPlan
        : Boolean(initialDiskKeys && initialDiskKeys.has('subscriptionPlan'));
    if (shouldMirrorPlan && cfg.get('subscriptionPlan') !== nextPlan) {
        updates.push(['subscriptionPlan', nextPlan]);
    }
    if (updates.length === 0) {
        return;
    }
    pendingConfigSyncCount++;
    void Promise.allSettled(updates.map(([k, v]) => Promise.resolve(cfg.update(k, v, vscode.ConfigurationTarget?.Global)))).finally(() => {
        pendingConfigSyncCount = Math.max(0, pendingConfigSyncCount - 1);
    });
}
function hydrateSharedAppSettingsFromDisk(initialLoad) {
    if (!durableState || !durableFileGlobalState) {
        return { changed: false, prevSettings: lastSyncedDiskAppSettings };
    }
    const prevSettings = lastSyncedDiskAppSettings ? { ...lastSyncedDiskAppSettings } : null;
    const prevPlan = sharedSubscriptionPlan;
    const rawDisk = durableFileGlobalState.get('appSettings', null);
    const hasRawDiskObj = Boolean(rawDisk && typeof rawDisk === 'object' && !Array.isArray(rawDisk));
    const diskNormalized = durableState.getAppSettings();
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    // Reconcile orchestratorPricingMode between appSettings and PricingStore
    const explicitDiskOrch = hasRawDiskObj ? rawDisk.orchestratorPricingMode : undefined;
    const resolvedOrchMode = (explicitDiskOrch === 'mapped' || explicitDiskOrch === 'strict')
        ? explicitDiskOrch
        : (pricingStore ? pricingStore.getOrchestratorPricingMode() : (0, pricing_store_1.normalizeOrchestratorPricingMode)(cfg.get('orchestratorPricingMode', 'mapped')));
    if (pricingStore && pricingStore.getOrchestratorPricingMode() !== resolvedOrchMode) {
        pricingStore.setOrchestratorPricingModeSync(resolvedOrchMode);
    }
    // Reconcile lockToMainAgent
    const persistedLock = durableFileGlobalState.get('lockToMainAgent', undefined);
    const resolvedLock = typeof persistedLock === 'boolean' ? persistedLock : diskNormalized.lockToMainAgent;
    lockToMainAgent = resolvedLock;
    // Respect explicit disk showNativeHudBar (including hot-reloads); otherwise preserve IDE's default false / prior value
    const explicitDiskHud = hasRawDiskObj && typeof rawDisk.showNativeHudBar === 'boolean'
        ? rawDisk.showNativeHudBar
        : undefined;
    const resolvedNativeHud = explicitDiskHud !== undefined
        ? explicitDiskHud
        : (prevSettings ? prevSettings.showNativeHudBar : cfg.get('showNativeHudBar', false));
    const nextSettings = {
        ...diskNormalized,
        lockToMainAgent: resolvedLock,
        orchestratorPricingMode: resolvedOrchMode,
        showNativeHudBar: resolvedNativeHud,
    };
    const persistedPlan = durableFileGlobalState.get('subscriptionPlan', '');
    const nextPlan = inferIdeSubscriptionPlan(persistedPlan || (initialLoad ? cfg.get('subscriptionPlan', 'none') : ''), nextSettings.subscriptionMonthlyFee);
    // On initial load when DurableState has no appSettings yet, seed from VS Code config
    if (initialLoad && !hasRawDiskObj) {
        const seeded = (0, durable_state_1.normalizeAppSettings)({
            pollingInterval: cfg.get('pollingInterval', 5),
            quotaNotificationThreshold: cfg.get('quotaNotificationThreshold', 20),
            showContext: cfg.get('statusBar.showContext', true),
            showQuota: cfg.get('statusBar.showQuota', true),
            showResetCountdown: cfg.get('statusBar.showResetCountdown', true),
            showAiCredits: cfg.get('statusBar.showAiCredits', true),
            showSpeed: cfg.get('statusBar.showSpeed', false),
            showCacheHit: cfg.get('statusBar.showCacheHit', false),
            showSessionCost: cfg.get('statusBar.showSessionCost', false),
            tooltipDensity: (0, tooltip_budget_1.parseTooltipDensity)(cfg.get('statusBar.tooltipDensity', 'auto')),
            showModelInternalId: cfg.get('showModelInternalId', false),
            activityMaxRecentSteps: cfg.get('activity.maxRecentSteps', 100),
            activityMaxArchives: cfg.get('activity.maxArchives', 20),
            orchestratorPricingMode: cfg.get('orchestratorPricingMode', resolvedOrchMode),
            displayCurrency: cfg.get('displayCurrency', 'USD'),
            customFxRate: cfg.get('customFxRate', null),
            subscriptionMonthlyFee: cfg.get('subscriptionMonthlyFee', null),
            subscriptionCurrency: cfg.get('subscriptionCurrency', 'USD'),
            calendarRetentionDays: cfg.get('calendarRetentionDays', 400),
            autoCheckUpdates: cfg.get('autoCheckUpdates', true),
            showNativeHudBar: cfg.get('showNativeHudBar', false),
            lockToMainAgent: resolvedLock,
        });
        sharedAppSettings = seeded;
        sharedSubscriptionPlan = inferIdeSubscriptionPlan(cfg.get('subscriptionPlan', 'none'), seeded.subscriptionMonthlyFee);
        lastSyncedDiskAppSettings = { ...seeded };
        hasHydratedSharedSettings = true;
        return { changed: false, prevSettings };
    }
    const changed = !prevSettings || JSON.stringify(prevSettings) !== JSON.stringify(nextSettings) || prevPlan !== nextPlan;
    sharedAppSettings = nextSettings;
    sharedSubscriptionPlan = nextPlan;
    lastSyncedDiskAppSettings = { ...nextSettings };
    hasHydratedSharedSettings = true;
    // Hydrate update status view from persisted lastUpdateCheck
    if (nextSettings.lastUpdateCheck) {
        const luc = nextSettings.lastUpdateCheck;
        if (!lastUpdateStatusView || (luc.checkedAt && (!lastUpdateStatusView.checkedAt || luc.checkedAt > lastUpdateStatusView.checkedAt))) {
            lastUpdateStatusView = {
                currentVersion: getIdeExtensionVersion(),
                latestVersion: luc.latestVersion ?? null,
                updateAvailable: Boolean(luc.hasUpdate),
                hasUpdate: Boolean(luc.hasUpdate),
                status: luc.error ? 'error' : (luc.hasUpdate ? 'update_available' : 'up_to_date'),
                checkedAt: luc.checkedAt,
                releaseUrl: luc.releaseUrl ?? null,
                releaseNotesSummary: luc.releaseNotesSummary ?? null,
                error: luc.error ?? null,
            };
        }
    }
    if (initialLoad && hasRawDiskObj) {
        const presentKeys = new Set(Object.keys(rawDisk));
        if (explicitDiskOrch === 'mapped' || explicitDiskOrch === 'strict' || pricingStore) {
            presentKeys.add('orchestratorPricingMode');
        }
        if (persistedPlan) {
            presentKeys.add('subscriptionPlan');
        }
        mirrorVscodeKeysFromAppSettings(null, nextSettings, nextPlan, prevPlan, presentKeys);
    }
    else if (!initialLoad && changed) {
        mirrorVscodeKeysFromAppSettings(prevSettings, nextSettings, nextPlan, prevPlan);
    }
    return { changed, prevSettings };
}
/**
 * Check whether the shared DurableState file was modified externally (e.g. by
 * Antigravity App Sidecar or another IDE window) and re-hydrate all shared
 * state in-place without restarting the extension.
 */
function syncFromDurableStateIfChanged(refreshUi = true) {
    if (!durableState || !durableFileGlobalState) {
        return false;
    }
    const reloaded = durableState.reloadIfChanged();
    if (!reloaded) {
        return false;
    }
    const prevLang = (0, i18n_1.getLanguage)();
    (0, i18n_1.initI18nFromState)(durableFileGlobalState);
    const nextLang = (0, i18n_1.getLanguage)();
    const langChanged = prevLang !== nextLang;
    if (langChanged && extensionContext?.globalState) {
        void extensionContext.globalState.update('displayLanguage', nextLang);
    }
    if (pricingStore) {
        pricingStore.init(durableGlobalState);
    }
    const { prevSettings } = hydrateSharedAppSettingsFromDisk(false);
    if (dailyStore) {
        dailyStore.init(durableGlobalState, { maxDays: sharedAppSettings.calendarRetentionDays });
        dailyStore.setMaxDays(sharedAppSettings.calendarRetentionDays);
    }
    restoreAccountSnapshots();
    restoreBillingDays();
    // Re-hydrate DailyLedger if disk has newer date or additional records
    const diskLedger = durableFileGlobalState.get('dailyLedgerState', undefined);
    if (diskLedger && dailyLedger) {
        if (diskLedger.dateKey === dailyLedger.dateKey) {
            const restored = daily_ledger_1.DailyLedger.restore(diskLedger);
            restored.setSurface('ide');
            if (restored.getTodayActive().length >= dailyLedger.getTodayActive().length
                && restored.getSettledEntries().length >= dailyLedger.getSettledEntries().length) {
                dailyLedger = restored;
            }
        }
        else if (diskLedger.dateKey && diskLedger.dateKey > dailyLedger.dateKey) {
            dailyLedger = daily_ledger_1.DailyLedger.restore(diskLedger);
            dailyLedger.setSurface('ide');
        }
    }
    // Apply live runtime side effects
    (0, models_1.setShowModelShortId)(sharedAppSettings.showModelInternalId);
    if (prevSettings && prevSettings.pollingInterval !== sharedAppSettings.pollingInterval) {
        baseIntervalMs = Math.max(1, sharedAppSettings.pollingInterval) * 1000;
        currentIntervalMs = baseIntervalMs;
        if (!disposed) {
            restartPolling();
        }
    }
    if (refreshUi) {
        if (typeof statusBar !== 'undefined') {
            applyDisplayPrefs();
            syncStatusBarTelemetry(true);
        }
        if ((0, webview_panel_1.isMonitorPanelVisible)()) {
            if (langChanged) {
                (0, webview_panel_1.refreshMonitorPanelLanguage)();
            }
            else {
                (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
                (0, webview_panel_1.syncMonitorPanelSettings)();
            }
        }
    }
    return true;
}
/** Alias exported for webview-panel.ts & external callers. */
exports.syncDurableStateFromDisk = syncFromDurableStateIfChanged;
function isSharedAppSettingsHydrated() {
    return Boolean(durableState && hasHydratedSharedSettings);
}
function getSharedAppSettings() {
    return { ...sharedAppSettings, subscriptionPlan: sharedSubscriptionPlan };
}
async function flushDurableState() {
    if (durableState) {
        await durableState.flush();
    }
}
async function setSharedOrchestratorPricingMode(mode) {
    const normalized = (0, pricing_store_1.normalizeOrchestratorPricingMode)(mode);
    sharedAppSettings.orchestratorPricingMode = normalized;
    const pStore = pricingStore ? pricingStore.setOrchestratorPricingMode(normalized) : undefined;
    if (durableState) {
        const pSettings = durableState.updateAppSettings({ orchestratorPricingMode: normalized });
        await durableState.flush();
        sharedAppSettings = await pSettings;
        lastSyncedDiskAppSettings = { ...sharedAppSettings };
    }
    if (pStore) {
        await pStore;
    }
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    if (typeof cfg.update === 'function') {
        pendingConfigSyncCount++;
        try {
            await cfg.update('orchestratorPricingMode', normalized, vscode.ConfigurationTarget?.Global);
        }
        finally {
            pendingConfigSyncCount = Math.max(0, pendingConfigSyncCount - 1);
        }
    }
    syncStatusBarTelemetry(true);
}
async function updateSharedAppSetting(key, value) {
    const cleanKey = key.trim();
    const patch = {};
    let normalizedKey = cleanKey;
    let vscodeMirrorKey;
    let vscodeMirrorValue;
    let mirrorPlan;
    switch (cleanKey) {
        case 'appComposerRingEnabled':
            patch.appComposerRingEnabled = Boolean(value);
            break;
        case 'appTopBarEnabled':
            patch.appTopBarEnabled = Boolean(value);
            break;
        case 'showNativeHudBar':
            patch.showNativeHudBar = Boolean(value);
            vscodeMirrorKey = 'showNativeHudBar';
            vscodeMirrorValue = patch.showNativeHudBar;
            break;
        case 'orchestratorPricingMode': {
            if (value !== 'mapped' && value !== 'strict') {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid orchestratorPricingMode' };
            }
            await setSharedOrchestratorPricingMode(value);
            return { ok: true, normalizedKey: 'orchestratorPricingMode' };
        }
        case 'displayCurrency': {
            if (typeof value !== 'string' || !value.trim()) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid displayCurrency' };
            }
            const norm = (0, durable_state_1.normalizeAppSettings)({ displayCurrency: value });
            patch.displayCurrency = norm.displayCurrency;
            vscodeMirrorKey = 'displayCurrency';
            vscodeMirrorValue = norm.displayCurrency;
            break;
        }
        case 'customFxRate': {
            if (value === null || value === '' || value === undefined) {
                patch.customFxRate = null;
            }
            else {
                const n = Number(value);
                if (!Number.isFinite(n) || n <= 0 || n > 100_000) {
                    return { ok: false, normalizedKey: cleanKey, error: 'Invalid customFxRate' };
                }
                patch.customFxRate = n;
            }
            vscodeMirrorKey = 'customFxRate';
            vscodeMirrorValue = patch.customFxRate;
            break;
        }
        case 'subscriptionPlan': {
            const rawPlan = typeof value === 'string' ? value.trim() : '';
            if (!(0, cli_usage_scanner_1.isSubscriptionPlanPresetId)(rawPlan) && rawPlan !== 'google-ai-ultra') {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid subscriptionPlan' };
            }
            const nextPlan = (0, cli_usage_scanner_1.normalizeSubscriptionPlanId)(rawPlan);
            const preset = cli_usage_scanner_1.SUBSCRIPTION_PLAN_PRESETS[nextPlan];
            sharedSubscriptionPlan = nextPlan;
            mirrorPlan = nextPlan;
            if (nextPlan === 'none') {
                patch.subscriptionMonthlyFee = null;
            }
            else if (preset.monthlyUsd > 0) {
                patch.subscriptionMonthlyFee = preset.monthlyUsd;
                patch.subscriptionCurrency = 'USD';
            }
            break;
        }
        case 'subscriptionMonthlyFee': {
            if (value === null || value === '' || value === undefined) {
                patch.subscriptionMonthlyFee = null;
            }
            else {
                const n = Number(value);
                if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
                    return { ok: false, normalizedKey: cleanKey, error: 'Invalid subscriptionMonthlyFee' };
                }
                patch.subscriptionMonthlyFee = n > 0 ? n : null;
                if (patch.subscriptionMonthlyFee !== null && sharedSubscriptionPlan === 'none') {
                    sharedSubscriptionPlan = 'custom';
                    mirrorPlan = 'custom';
                }
            }
            vscodeMirrorKey = 'subscriptionMonthlyFee';
            vscodeMirrorValue = patch.subscriptionMonthlyFee;
            break;
        }
        case 'subscriptionCurrency': {
            if (typeof value !== 'string' || !value.trim()) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid subscriptionCurrency' };
            }
            const norm = (0, durable_state_1.normalizeAppSettings)({ subscriptionCurrency: value });
            patch.subscriptionCurrency = norm.subscriptionCurrency;
            vscodeMirrorKey = 'subscriptionCurrency';
            vscodeMirrorValue = norm.subscriptionCurrency;
            break;
        }
        case 'calendarRetentionDays': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid calendarRetentionDays' };
            }
            const clamped = clampNum(Math.round(n), 30, 3650);
            patch.calendarRetentionDays = clamped;
            dailyStore?.setMaxDays(clamped);
            vscodeMirrorKey = 'calendarRetentionDays';
            vscodeMirrorValue = clamped;
            break;
        }
        case 'autoCheckUpdates':
            patch.autoCheckUpdates = Boolean(value);
            vscodeMirrorKey = 'autoCheckUpdates';
            vscodeMirrorValue = patch.autoCheckUpdates;
            break;
        case 'activityMaxRecentSteps':
        case 'maxRecentSteps':
        case 'activity.maxRecentSteps': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid activityMaxRecentSteps' };
            }
            const clamped = clampNum(Math.round(n), 10, 500);
            patch.activityMaxRecentSteps = clamped;
            patch.maxRecentSteps = clamped;
            normalizedKey = 'activityMaxRecentSteps';
            vscodeMirrorKey = 'activity.maxRecentSteps';
            vscodeMirrorValue = clamped;
            break;
        }
        case 'activityMaxArchives':
        case 'maxArchives':
        case 'activity.maxArchives': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid activityMaxArchives' };
            }
            const clamped = clampNum(Math.round(n), 1, 100);
            patch.activityMaxArchives = clamped;
            patch.maxArchives = clamped;
            normalizedKey = 'activityMaxArchives';
            vscodeMirrorKey = 'activity.maxArchives';
            vscodeMirrorValue = clamped;
            break;
        }
        case 'quotaNotificationThreshold': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid quotaNotificationThreshold' };
            }
            const clamped = clampNum(Math.round(n), 0, 99);
            patch.quotaNotificationThreshold = clamped;
            vscodeMirrorKey = 'quotaNotificationThreshold';
            vscodeMirrorValue = clamped;
            break;
        }
        case 'pollingInterval': {
            const n = Number(value);
            if (!Number.isFinite(n)) {
                return { ok: false, normalizedKey: cleanKey, error: 'Invalid pollingInterval' };
            }
            const clamped = clampNum(Math.round(n), 1, 60);
            patch.pollingInterval = clamped;
            baseIntervalMs = clamped * 1000;
            currentIntervalMs = baseIntervalMs;
            if (!disposed) {
                restartPolling();
            }
            vscodeMirrorKey = 'pollingInterval';
            vscodeMirrorValue = clamped;
            break;
        }
        case 'showModelInternalId':
            patch.showModelInternalId = Boolean(value);
            (0, models_1.setShowModelShortId)(patch.showModelInternalId);
            vscodeMirrorKey = 'showModelInternalId';
            vscodeMirrorValue = patch.showModelInternalId;
            break;
        case 'lockToMainAgent':
            setLockToMainAgent(Boolean(value));
            return { ok: true, normalizedKey: 'lockToMainAgent' };
        case 'statusBar.tooltipDensity':
        case 'tooltipDensity':
            patch.tooltipDensity = (0, tooltip_budget_1.parseTooltipDensity)(value);
            normalizedKey = 'statusBar.tooltipDensity';
            vscodeMirrorKey = 'statusBar.tooltipDensity';
            vscodeMirrorValue = patch.tooltipDensity;
            break;
        case 'statusBar.showContext':
        case 'showContext':
            patch.showContext = Boolean(value);
            normalizedKey = 'statusBar.showContext';
            vscodeMirrorKey = 'statusBar.showContext';
            vscodeMirrorValue = patch.showContext;
            break;
        case 'statusBar.showQuota':
        case 'showQuota':
            patch.showQuota = Boolean(value);
            normalizedKey = 'statusBar.showQuota';
            vscodeMirrorKey = 'statusBar.showQuota';
            vscodeMirrorValue = patch.showQuota;
            break;
        case 'statusBar.showResetCountdown':
        case 'showResetCountdown':
            patch.showResetCountdown = Boolean(value);
            normalizedKey = 'statusBar.showResetCountdown';
            vscodeMirrorKey = 'statusBar.showResetCountdown';
            vscodeMirrorValue = patch.showResetCountdown;
            break;
        case 'statusBar.showAiCredits':
        case 'showAiCredits':
            patch.showAiCredits = Boolean(value);
            normalizedKey = 'statusBar.showAiCredits';
            vscodeMirrorKey = 'statusBar.showAiCredits';
            vscodeMirrorValue = patch.showAiCredits;
            break;
        case 'statusBar.showSpeed':
        case 'showSpeed':
            patch.showSpeed = Boolean(value);
            normalizedKey = 'statusBar.showSpeed';
            vscodeMirrorKey = 'statusBar.showSpeed';
            vscodeMirrorValue = patch.showSpeed;
            break;
        case 'statusBar.showCacheHit':
        case 'showCacheHit':
            patch.showCacheHit = Boolean(value);
            normalizedKey = 'statusBar.showCacheHit';
            vscodeMirrorKey = 'statusBar.showCacheHit';
            vscodeMirrorValue = patch.showCacheHit;
            break;
        case 'statusBar.showSessionCost':
        case 'showSessionCost':
            patch.showSessionCost = Boolean(value);
            normalizedKey = 'statusBar.showSessionCost';
            vscodeMirrorKey = 'statusBar.showSessionCost';
            vscodeMirrorValue = patch.showSessionCost;
            break;
        default:
            return { ok: false, normalizedKey: cleanKey, error: `Unknown setting key: ${cleanKey}` };
    }
    sharedAppSettings = { ...sharedAppSettings, ...patch };
    if (durableState) {
        const pSettings = durableState.updateAppSettings(patch);
        const pPlan = durableFileGlobalState
            ? durableFileGlobalState.update('subscriptionPlan', sharedSubscriptionPlan)
            : undefined;
        await durableState.flush();
        sharedAppSettings = await pSettings;
        if (pPlan) {
            await pPlan;
        }
        lastSyncedDiskAppSettings = { ...sharedAppSettings };
    }
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    if (typeof cfg.update === 'function') {
        const cfgWrites = [];
        if (vscodeMirrorKey) {
            cfgWrites.push([vscodeMirrorKey, vscodeMirrorValue]);
        }
        if (mirrorPlan !== undefined) {
            cfgWrites.push(['subscriptionPlan', mirrorPlan]);
            if (patch.subscriptionMonthlyFee !== undefined) {
                cfgWrites.push(['subscriptionMonthlyFee', patch.subscriptionMonthlyFee]);
            }
            if (patch.subscriptionCurrency !== undefined) {
                cfgWrites.push(['subscriptionCurrency', patch.subscriptionCurrency]);
            }
        }
        if (cfgWrites.length > 0) {
            pendingConfigSyncCount++;
            try {
                await Promise.allSettled(cfgWrites.map(([k, v]) => Promise.resolve(cfg.update(k, v, vscode.ConfigurationTarget?.Global))));
            }
            finally {
                pendingConfigSyncCount = Math.max(0, pendingConfigSyncCount - 1);
            }
        }
    }
    if (typeof statusBar !== 'undefined') {
        applyDisplayPrefs();
        syncStatusBarTelemetry(true);
    }
    return { ok: true, normalizedKey };
}
function getCachedCliUsageDays(force = false) {
    const nowMs = Date.now();
    if (!force && lastCliScanAtMs > 0 && nowMs - lastCliScanAtMs < CLI_SCAN_TTL_MS) {
        return cachedCliDays;
    }
    try {
        const res = cliUsageScanner.scan({
            cliRootDir: process.env.ANTIGRAVITY_CLI_DATA_DIR || undefined,
            customPricing: pricingStore?.getCustom(),
            now: nowMs,
        });
        cachedCliDays = res.available ? res.days : [];
        lastCliScanAtMs = nowMs;
    }
    catch {
        cachedCliDays = [];
        lastCliScanAtMs = nowMs;
    }
    return cachedCliDays;
}
function getLastUpdateStatusView() {
    return lastUpdateStatusView;
}
async function checkIdeReleaseUpdates(force = true) {
    const prev = sharedAppSettings.lastUpdateCheck;
    const currentVersion = getIdeExtensionVersion();
    const res = await (0, plugin_updater_1.checkForUpdates)({
        currentVersion,
        force,
        etag: prev?.etag ?? null,
        lastCheckedAt: prev?.checkedAt ?? null,
    });
    if (res.status !== 'throttled') {
        const record = {
            checkedAt: res.checkedAt,
            latestVersion: res.latestVersion ?? (res.status === 'not_modified' ? prev?.latestVersion ?? null : null),
            hasUpdate: res.status === 'not_modified' ? Boolean(prev?.hasUpdate) : Boolean(res.hasUpdate),
            etag: res.etag ?? prev?.etag ?? null,
            releaseUrl: res.releaseInfo?.releaseUrl ?? (res.status === 'not_modified' ? prev?.releaseUrl ?? null : null),
            releaseNotesSummary: res.releaseInfo?.releaseNotesSummary ?? (res.status === 'not_modified' ? prev?.releaseNotesSummary ?? null : null),
            assetName: res.releaseInfo?.assetName ?? (res.status === 'not_modified' ? prev?.assetName ?? null : null),
            assetUrl: res.releaseInfo?.assetUrl ?? (res.status === 'not_modified' ? prev?.assetUrl ?? null : null),
            checksumsUrl: res.releaseInfo?.checksumsUrl ?? (res.status === 'not_modified' ? prev?.checksumsUrl ?? null : null),
            error: res.status === 'error' ? (res.error ?? 'Update check failed') : null,
        };
        if (durableState) {
            const pSettings = durableState.updateAppSettings({ lastUpdateCheck: record });
            await durableState.flush();
            sharedAppSettings = await pSettings;
            lastSyncedDiskAppSettings = { ...sharedAppSettings };
        }
        else {
            sharedAppSettings = { ...sharedAppSettings, lastUpdateCheck: record };
        }
        lastUpdateStatusView = {
            currentVersion,
            latestVersion: record.latestVersion,
            updateAvailable: Boolean(record.hasUpdate),
            hasUpdate: Boolean(record.hasUpdate),
            status: res.status,
            checkedAt: record.checkedAt,
            releaseUrl: record.releaseUrl,
            releaseNotesSummary: record.releaseNotesSummary,
            error: record.error,
        };
    }
    return res;
}
function triggerIdeBackgroundUpdateCheck() {
    if (disposed || autoUpdateCheckInFlight || !sharedAppSettings.autoCheckUpdates) {
        return;
    }
    if (process.env.VITEST) {
        return;
    }
    autoUpdateCheckInFlight = true;
    void checkIdeReleaseUpdates(false)
        .catch(() => { })
        .finally(() => { autoUpdateCheckInFlight = false; });
}
/** Discover the Antigravity IDE language server (explicitly preferring IDE when both App + IDE run). */
function discoverLanguageServer(workspaceUri, signal, logger) {
    return (0, backend_connection_1.discoverPreferredBackend)({
        workspaceUri,
        signal,
        log: logger,
        preferredSurface: 'ide',
    });
}
/** Get whether Main-Agent Lock is enabled. */
function getLockToMainAgent() {
    return lockToMainAgent;
}
/** Toggle or explicitly set Main-Agent Lock, persisting in shared DurableState. */
function setLockToMainAgent(locked) {
    const next = typeof locked === 'boolean' ? locked : !lockToMainAgent;
    lockToMainAgent = next;
    sharedAppSettings.lockToMainAgent = next;
    if (next && trackedCascadeId) {
        lockedMainCascadeId = trackedCascadeId;
    }
    else if (!next) {
        lockedMainCascadeId = null;
    }
    if (durableFileGlobalState) {
        void durableFileGlobalState.update('lockToMainAgent', lockToMainAgent);
    }
    if (durableState) {
        void durableState.updateAppSettings({ lockToMainAgent: next }).then((updated) => {
            sharedAppSettings = updated;
            lastSyncedDiskAppSettings = { ...updated };
            return durableState.flush();
        });
    }
    return lockToMainAgent;
}
/** Get the manually pinned conversation ID (or null for Follow Active). */
function getPinnedConversationId() {
    return pinnedConversationId;
}
function clearActiveContextTelemetry() {
    lastContextBreakdown = null;
    lastContextBreakdownKey = '';
    lastTurnDiagnostics = null;
}
/** Pin a specific conversation ID or pass null/empty to return to Follow Active. */
function selectPinnedConversation(cascadeId) {
    const normalized = typeof cascadeId === 'string' && cascadeId.trim() ? cascadeId.trim() : null;
    pinnedConversationId = normalized;
    if (normalized) {
        trackedCascadeId = normalized;
    }
    clearActiveContextTelemetry();
    if (durableFileWorkspaceState) {
        void durableFileWorkspaceState.update('pinnedConversationId', pinnedConversationId);
    }
}
function recordQuotaRunwaysFromState(configs, quotaSummary, nowMs = Date.now()) {
    const recordedPools = new Set();
    if (quotaSummary?.groups) {
        for (const group of quotaSummary.groups) {
            const win = group.fiveHour;
            if (!win || typeof win.remainingFraction !== 'number' || !Number.isFinite(win.remainingFraction)) {
                continue;
            }
            const poolKey = group.pool || group.displayName;
            if (!poolKey || recordedPools.has(poolKey)) {
                continue;
            }
            recordedPools.add(poolKey);
            const resetMs = win.resetTime ? parsePositivePoolResetMs(win.resetTime) : null;
            quotaRunwayTracker.record(poolKey, win.remainingFraction, nowMs, resetMs);
        }
    }
    for (const group of (0, model_quota_1.groupModelQuotas)(configs, quotaSummary)) {
        const poolKey = group.pool || group.key;
        if (!poolKey || recordedPools.has(poolKey) || group.minimum === null) {
            continue;
        }
        recordedPools.add(poolKey);
        const resetMs = group.resetTime ? parsePositivePoolResetMs(group.resetTime) : null;
        quotaRunwayTracker.record(poolKey, group.minimum, nowMs, resetMs);
    }
    if (durableFileGlobalState && nowMs - lastRunwayPersistMs >= 30_000) {
        lastRunwayPersistMs = nowMs;
        void durableFileGlobalState.update('quotaRunwayState', quotaRunwayTracker.serialize());
    }
}
function getCurrentQuotaRunways(nowMs = Date.now()) {
    const isCustomActive = (0, quota_runway_1.isCustomModel)(currentUsage?.model, currentUsage?.modelDisplayName);
    return quotaRunwayTracker.estimateAll(nowMs, {
        modelId: currentUsage?.model,
        modelLabel: currentUsage?.modelDisplayName,
        isCustomModel: isCustomActive,
    });
}
function getCurrentStaleState() {
    const userSnap = userStatusStaleGuard.getSnapshot();
    const trajSnap = trajectoriesStaleGuard.getSnapshot();
    const staleSnap = trajSnap.isStale
        ? trajSnap
        : (userSnap.isStale ? userSnap : null);
    if (!staleSnap || staleSnap.lastSuccessAtMs === null) {
        return null;
    }
    return {
        isStale: true,
        lastSuccessAtMs: staleSnap.lastSuccessAtMs,
        lastError: staleSnap.lastError,
    };
}
/** Previous poll's step counts per cascade — used to detect activity. */
const previousStepCounts = new Map();
/** Models that have already triggered a low-quota notification (cleared when recovered). */
const quotaNotifiedModels = new Set();
/** Previous poll's known trajectory IDs — used to detect new conversations. */
const previousTrajectoryIds = new Set();
/** Compare like-for-like measurements, never an estimate against a provider count. */
const previousContextObservations = new Map();
/** Whether we've completed at least one poll cycle. */
let firstPollDone = false;
/** Prevents concurrent pollContextUsage() reentrance. */
let isPolling = false;
let hasSyncedCheckpointer = false;
let isSyncingCheckpointer = false;
/** Consecutive checkpointer sync attempts since the last successful sync or reconnect. */
let checkpointerSyncAttempts = 0;
/** Upper bound on those attempts, so an account with no checkpointer experiments stops re-asking. */
const MAX_CHECKPOINTER_SYNC_ATTEMPTS = 5;
let isRefreshingAuxiliaryMetadata = false;
let auxMetadataConsecutiveFailures = 0;
const MAX_AUX_METADATA_FAILURES = 3;
let modelMetadataGeneration = 0;
/** Do not carry tool-model availability across accounts or backend lifetimes. */
function invalidateLiveModelMetadata() {
    modelMetadataGeneration++;
    (0, tracker_1.resetImageWorkflowCache)();
    (0, models_1.setAvailableImageModelIds)([]);
    hasSyncedCheckpointer = false;
    isSyncingCheckpointer = false;
    checkpointerSyncAttempts = 0;
    isRefreshingAuxiliaryMetadata = false;
    auxMetadataConsecutiveFailures = 0;
    cachedOrchestratorSettings = null;
    cachedQuotaSummary = null;
    lastContextBreakdown = null;
    lastContextBreakdownKey = '';
    lastTurnDiagnostics = null;
    if (typeof statusBar !== 'undefined') {
        statusBar.setOrchestratorSettings(null);
        statusBar.setQuotaSummary(null);
        statusBar.setStaleState(null);
        statusBar.setQuotaRunways(null);
        statusBar.clearStabilizedResetTimes();
    }
}
/** Prevents schedulePoll() from creating new timers after deactivate. */
// disposed declared at top of module
/** Generation counter — prevents orphan timer chains. */
// pollGeneration declared at top of module
/** The last known model identifier — used to show correct context limit in idle state. */
let lastKnownModel = '';
// ─── Exponential Backoff State ────────────────────────────────────────────────
let baseIntervalMs = 5000;
let currentIntervalMs = 5000;
// ─── LS PID Revalidation ──────────────────────────────────────────────────────
// BUG FIX: When Antigravity updates its LS, the old process may stay alive and
// keep responding to RPC calls with stale data. The plugin caches the old
// connection and never discovers the new LS. This counter forces periodic
// re-discovery to compare PIDs and detect stale connections.
let lsRevalidationCounter = 0;
/** Re-validate LS PID every N poll cycles. At 5s polling = ~30s. */
const LS_REVALIDATION_INTERVAL = 6;
/** Tracks consecutive polls where workspace has 0 RUNNING conversations. */
let consecutiveIdlePolls = 0;
/** If we're tracking a cascade and it stays IDLE for this many polls, assume stale LS. */
const STALE_LS_IDLE_THRESHOLD = 4;
/** Set after staleness check confirms same PID — avoids repeated discovery for genuinely idle workspaces. */
let stalenessConfirmedIdle = false;
let consecutiveFailures = 0;
// AbortController — cancel in-flight RPC requests on extension deactivate.
let abortController = new AbortController();
/** Last polled workspace URI — used to detect workspace switches mid-session. */
let lastPolledWorkspaceUri;
/** Map of cascadeId → remaining polls to show compression indicator. */
const compressionPersistCounters = new Map();
function hasSameUsageInputs(cached, trajectory) {
    return !!cached
        && cached.tokenUsageSource !== undefined
        && cached.imageWorkflow !== undefined
        && (!cached.compressionDetected || cached.checkpointCompressionDrop > 0)
        && trajectory.status !== constants_1.CascadeStatus.RUNNING
        && cached.status === trajectory.status
        && cached.cascadeId === trajectory.cascadeId
        && cached.stepCount === trajectory.stepCount
        && cached.lastModifiedTime === trajectory.lastModifiedTime;
}
function measuredContextDrop(previous, current, isUndo) {
    if (!previous || isUndo || previous.isEstimated || current.isEstimated
        || !previous.model || !current.model || !previous.tokenUsageSource
        || previous.tokenUsageSource !== current.tokenUsageSource
        || ((0, models_1.resolveModelId)(previous.model) || previous.model) !== ((0, models_1.resolveModelId)(current.model) || current.model)
        || !Number.isFinite(previous.contextUsed) || !Number.isFinite(current.contextUsed)
        || !Number.isFinite(current.contextLimit) || current.contextLimit <= 0) {
        return 0;
    }
    // A coordinator may keep its selected identity while an execution worker
    // reports a different context snapshot. That transition is not compression.
    const previousMeasuredModel = previous.lastModelUsage?.model || previous.model;
    const currentMeasuredModel = current.lastModelUsage?.model || current.model;
    if (((0, models_1.resolveModelId)(previousMeasuredModel) || previousMeasuredModel)
        !== ((0, models_1.resolveModelId)(currentMeasuredModel) || currentMeasuredModel)) {
        return 0;
    }
    const drop = previous.contextUsed - current.contextUsed;
    return drop > current.contextLimit * 0.01 ? drop : 0;
}
function rehydrateUsageForDisplay(usage, customLimits) {
    const model = usage.model || usage.lastModelUsage?.model || lastKnownModel || '';
    const modelDisplayName = (0, tracker_1.normalizeModelDisplayName)(model);
    const limitModel = usage.tokenUsageSource === 'planner' && usage.lastModelUsage?.model
        ? usage.lastModelUsage.model
        : model;
    const contextLimit = (0, tracker_1.getContextLimit)(limitModel, customLimits);
    const usagePercent = contextLimit > 0 ? (usage.contextUsed / contextLimit) * 100 : 0;
    if (model === usage.model
        && modelDisplayName === usage.modelDisplayName
        && contextLimit === usage.contextLimit
        && usagePercent === usage.usagePercent) {
        return usage;
    }
    return {
        ...usage,
        model,
        modelDisplayName,
        contextLimit,
        usagePercent,
    };
}
function hashText(text) {
    let hash = 5381;
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}
function stableValueSignature(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableValueSignature).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${stableRecordSignature(value)}}`;
    }
    if (typeof value === 'string') {
        return hashText(value);
    }
    return String(value);
}
function stableRecordSignature(record) {
    if (!record) {
        return '';
    }
    return Object.entries(record)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}:${stableValueSignature(value)}`)
        .join('|');
}
function buildGMModelStatsSignature(summary) {
    return Object.entries(summary.modelBreakdown)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([modelName, stats]) => {
        const cfg = stats.completionConfig;
        const cfgSig = cfg
            ? `${cfg.maxTokens},${cfg.temperature},${cfg.firstTemperature},${cfg.topK},${cfg.topP},${cfg.numCompletions},${cfg.stopPatternCount}`
            : '';
        return [
            modelName,
            stats.callCount,
            stats.stepsCovered,
            stats.totalInputTokens,
            stats.totalOutputTokens,
            stats.totalThinkingTokens,
            stats.totalCacheRead,
            stats.totalCacheCreation,
            stats.totalCredits,
            stats.avgTTFT,
            stats.minTTFT,
            stats.maxTTFT,
            stats.avgStreaming,
            stats.cacheHitRate,
            stats.responseModel,
            stats.apiProvider,
            stats.hasSystemPrompt ? 1 : 0,
            stats.toolCount,
            stats.promptSectionTitles.join(','),
            stats.totalRetries,
            stats.errorCount,
            stats.creditCallCount,
            stats.exactCallCount,
            stats.placeholderOnlyCalls,
            stats.contextWindowCapacity,
            cfgSig,
        ].join('~');
    })
        .join('||');
}
function buildGMConversationSignature(summary) {
    return [...summary.conversations]
        .sort((a, b) => a.cascadeId.localeCompare(b.cascadeId))
        .map(conversation => {
        const latestCall = conversation.calls[conversation.calls.length - 1];
        const totalConvCredits = conversation.calls.reduce((sum, call) => sum + call.credits, 0);
        const callIds = conversation.calls
            .map(call => call.executionId || `${call.model}:${call.createdAt}:${call.stepIndices.join(',')}`)
            .join(',');
        const checkpointSig = (conversation.checkpointSummaries || [])
            .map(cp => `${cp.checkpointNumber}:${cp.stepIndex}:${cp.tokens}:${hashText(cp.fullText || '')}`)
            .join(';');
        const contextSig = (conversation.systemContextItems || [])
            .map(item => `${item.type}:${item.stepIndex}:${item.tokens}:${item.label}:${hashText(item.fullText || '')}`)
            .join(';');
        return [
            conversation.cascadeId,
            conversation.title,
            conversation.totalSteps,
            conversation.coveredSteps,
            conversation.coverageRate,
            conversation.lifetimeCalls || 0,
            conversation.accountCredits || 0,
            conversation.calls.length,
            totalConvCredits,
            latestCall?.createdAt || '',
            latestCall?.responseModel || latestCall?.modelDisplay || latestCall?.model || '',
            callIds,
            checkpointSig,
            contextSig,
        ].join('~');
    })
        .join('||');
}
function buildGMSummarySignature(summary) {
    const recentErrorEntriesSig = (summary.recentErrorEntries || [])
        .map(entry => `${entry.code}:${entry.createdAt}:${hashText(entry.message || '')}`)
        .join('|');
    const uniqueErrorsSig = (summary.uniqueErrors || [])
        .map(entry => `${entry.code}:${entry.firstSeen}:${hashText(entry.message || '')}`)
        .join('|');
    const toolCatalogSig = (summary.toolCatalog || [])
        .map(entry => `${entry.name}:${entry.firstSeen}:${hashText(entry.description || '')}`)
        .join('|');
    const contextGrowthSig = summary.contextGrowth
        .map(point => `${point.step}:${point.tokens}:${point.model}`)
        .join('|');
    return [
        summary.totalCalls,
        summary.totalStepsCovered,
        summary.totalCredits,
        summary.totalInputTokens,
        summary.totalOutputTokens,
        summary.totalCacheRead,
        summary.totalCacheCreation,
        summary.totalThinkingTokens,
        summary.totalRetryCount,
        summary.totalRetryTokens,
        summary.totalRetryCredits,
        stableRecordSignature(summary.stopReasonCounts),
        stableRecordSignature(summary.retryErrorCodes),
        stableRecordSignature(summary.toolCallCounts),
        stableRecordSignature(summary.toolCallCountsByConv),
        stableRecordSignature(summary.retryErrorCodesByConv),
        summary.recentErrors.map(item => hashText(item)).join('|'),
        recentErrorEntriesSig,
        uniqueErrorsSig,
        toolCatalogSig,
        contextGrowthSig,
        buildGMModelStatsSignature(summary),
        buildGMConversationSignature(summary),
    ].join('@@');
}
function hasGMSummaryChanged(prev, next) {
    if (!!prev !== !!next) {
        return true;
    }
    if (!prev || !next) {
        return false;
    }
    return buildGMSummarySignature(prev) !== buildGMSummarySignature(next);
}
/** Write GM summary to external file, stripping heavy text/metadata fields. */
function persistGMSummaryToFile(summary) {
    durableFileGlobalState.update('gmDetailedSummary', summary ? (0, gm_tracker_1.slimSummaryForPersistence)(summary) : null);
}
function persistClearedToolCatalog(tracker, globalState, fileState) {
    tracker.clearToolCatalog();
    const summary = tracker.getCachedSummary();
    globalState.update('gmTrackerState', tracker.serialize());
    fileState.update('gmDetailedSummary', summary ? (0, gm_tracker_1.slimSummaryForPersistence)(summary) : null);
    return summary;
}
function selectRunningTrajectoryCandidate(trajectories, qualifiedTrajectories, trackedCascadeId) {
    const qualifiedRunning = qualifiedTrajectories.filter(t => t.status === constants_1.CascadeStatus.RUNNING);
    if (qualifiedRunning.length > 0) {
        const currentStillRunning = qualifiedRunning.find(t => t.cascadeId === trackedCascadeId);
        if (currentStillRunning) {
            return {
                candidateId: currentStillRunning.cascadeId,
                selectionReason: 'tracked cascade is RUNNING',
                qualifiedRunning,
                selectedOutsideWorkspace: false,
            };
        }
        return {
            candidateId: qualifiedRunning[0].cascadeId,
            selectionReason: 'new RUNNING cascade in ws',
            qualifiedRunning,
            selectedOutsideWorkspace: false,
        };
    }
    // Shared LS instances can expose active cascades from another workspace even
    // when the IDE window keeps reporting a stale workspace URI after a switch.
    const crossWorkspaceRunning = trajectories
        .filter(t => t.status === constants_1.CascadeStatus.RUNNING)
        .filter(t => !qualifiedTrajectories.some(q => q.cascadeId === t.cascadeId));
    if (crossWorkspaceRunning.length === 0) {
        return {
            candidateId: null,
            selectionReason: '',
            qualifiedRunning,
            selectedOutsideWorkspace: false,
        };
    }
    const selected = crossWorkspaceRunning[0];
    const hasWorkspaceUri = selected.workspaceUris.length > 0;
    return {
        candidateId: selected.cascadeId,
        selectionReason: hasWorkspaceUri
            ? 'RUNNING cascade from another workspace (cross-workspace tracking)'
            : 'RUNNING cascade without workspace (new conversation)',
        qualifiedRunning,
        selectedOutsideWorkspace: true,
    };
}
function buildUsageScopeTrajectories(qualifiedTrajectories, trajectories, activeTrajectory) {
    const scope = qualifiedTrajectories.length > 0 ? qualifiedTrajectories : trajectories;
    if (!activeTrajectory || scope.some(t => t.cascadeId === activeTrajectory.cascadeId)) {
        return scope;
    }
    return [activeTrajectory, ...scope];
}
function computeLiveCostSnapshot(summary, activeCascadeId) {
    const custom = pricingStore?.getCustom() ?? {};
    const orchMode = sharedAppSettings.orchestratorPricingMode;
    // Today's total from DailyLedger (active + settled)
    let todayCostUsd = 0;
    let todayHasUnpriced = false;
    if (typeof dailyLedger !== 'undefined') {
        for (const bucket of dailyLedger.getTodayActive()) {
            for (const [modelKey, ms] of Object.entries(bucket.modelStats)) {
                if (ms.calls <= 0) {
                    continue;
                }
                const res = (0, pricing_store_1.calculateLedgerModelCosts)(modelKey, ms, bucket, custom, undefined, orchMode);
                todayCostUsd += res.totalCost;
                if (!res.pricing) {
                    todayHasUnpriced = true;
                }
            }
        }
        for (const entry of dailyLedger.getSettledEntries()) {
            todayCostUsd += entry.totalEstimatedCost || 0;
            if (!todayHasUnpriced && entry.totalCalls > 0 && entry.modelCalls) {
                for (const [modelKey, calls] of Object.entries(entry.modelCalls)) {
                    if (calls > 0 && !(0, pricing_store_1.findPricingForDate)(modelKey, custom, entry.settledAt, undefined, orchMode)) {
                        todayHasUnpriced = true;
                        break;
                    }
                }
            }
        }
    }
    // Active conversation (or session fallback) cost from account-filtered GM summary
    let sessionCostUsd = 0;
    let sessionHasUnpriced = false;
    if (summary && summary.conversations.length > 0) {
        const activeConv = activeCascadeId
            ? summary.conversations.find(c => c.cascadeId === activeCascadeId)
            : undefined;
        const calls = activeConv && activeConv.calls.length > 0
            ? activeConv.calls
            : summary.conversations.flatMap(c => c.calls);
        for (const call of calls) {
            const pricingModel = (0, pricing_store_1.selectPricingModel)(call.model || call.modelDisplay, call.responseModel, custom);
            const pricing = (0, pricing_store_1.findPricingForDate)(pricingModel, custom, call.createdAt || '', undefined, orchMode);
            if (pricing) {
                sessionCostUsd += (0, pricing_store_1.costFromTokens)(call, pricing);
            }
            else {
                sessionHasUnpriced = true;
            }
        }
    }
    return { todayCostUsd, todayHasUnpriced, sessionCostUsd, sessionHasUnpriced };
}
function makePanelPayload(extra = {}) {
    const gmSummary = gmTracker.getUiSummary();
    const activeId = currentUsage?.cascadeId ?? trackedCascadeId ?? undefined;
    const costs = computeLiveCostSnapshot(gmSummary, activeId);
    const workspaceUri = getWorkspaceUri();
    const isCustomActive = (0, quota_runway_1.isCustomModel)(currentUsage?.model, currentUsage?.modelDisplayName);
    const quotaRunways = getCurrentQuotaRunways();
    const staleState = getCurrentStaleState();
    const conversationOptions = (0, conversation_selector_1.buildConversationOptions)(lastTrajectories, activeId ?? null, lockedMainCascadeId, {
        workspaceUris: workspaceUri ? [workspaceUri] : [],
        lang: (0, i18n_1.getLanguage)(),
    });
    return {
        currentUsage,
        monitorStatus: statusBar?.monitorStatus,
        allTrajectoryUsages,
        allTrajectories: lastTrajectories,
        modelConfigs: cachedModelConfigs,
        userInfo: cachedUserInfo,
        workspaceUri,
        activitySummary: activityTracker?.getSummary() ?? null,
        archives: activityTracker?.getArchives(),
        activityTracker,
        gmSummary,
        gmFullSummary: gmTracker.getUiFullSummary(),
        gmConversations: monitorStore.getGMConversations(),
        pricingStore,
        dailyStore,
        storageDiagnostics: getStorageDiagnostics(),
        modelDNA: persistedModelDNA,
        accountSnapshots: getAccountSnapshotArray(),
        todayLedgerActive: dailyLedger.getTodayActive(),
        customPricing: pricingStore.getCustom(),
        ledgerSettled: dailyLedger.getSettledEntries(),
        orchestratorSettings: cachedOrchestratorSettings,
        quotaSummary: cachedQuotaSummary,
        todayCostUsd: costs.todayCostUsd > 0 ? costs.todayCostUsd : undefined,
        sessionCostUsd: costs.sessionCostUsd > 0 ? costs.sessionCostUsd : undefined,
        contextBreakdown: lastContextBreakdown,
        turnDiagnostics: lastTurnDiagnostics,
        quotaRunways,
        isCustomModelActive: isCustomActive,
        staleState,
        conversationOptions,
        activeConversationId: activeId ?? null,
        pinnedConversationId,
        lockToMainAgent,
        cliDays: getCachedCliUsageDays(false),
        orchestratorPricingMode: sharedAppSettings.orchestratorPricingMode,
        appSettings: getSharedAppSettings(),
        updateStatus: lastUpdateStatusView,
        ...extra,
    };
}
/** Compare auxiliary live metadata payloads structurally to skip redundant status bar & panel refreshes. */
function hasAuxiliaryMetadataChanged(prev, next) {
    if (prev === next) {
        return false;
    }
    if (!prev || !next) {
        return true;
    }
    try {
        return JSON.stringify(prev) !== JSON.stringify(next);
    }
    catch {
        return true;
    }
}
/**
 * Refresh auxiliary live metadata (global Orchestrator Settings + dual-window
 * RetrieveUserQuotaSummary) non-blockingly in the background.
 * Guarded by in-flight dedup, per-generation failure backoff, and modelMetadataGeneration
 * so a stalled JetboxSubscribeToState stream never blocks core trajectory/context polling.
 */
function triggerLiveAuxiliaryMetadataRefresh(ls, configs, generation, signal) {
    if (isRefreshingAuxiliaryMetadata || auxMetadataConsecutiveFailures >= MAX_AUX_METADATA_FAILURES) {
        return;
    }
    isRefreshingAuxiliaryMetadata = true;
    void (async () => {
        try {
            const [orchRes, quotaRes] = await Promise.allSettled([
                (0, tracker_1.fetchOrchestratorSettings)(ls, configs, signal),
                (0, tracker_1.fetchUserQuotaSummary)(ls, signal),
            ]);
            if (generation !== modelMetadataGeneration || disposed) {
                return;
            }
            let updated = false;
            const gotOrch = orchRes.status === 'fulfilled' && !!orchRes.value;
            const gotQuota = quotaRes.status === 'fulfilled' && !!quotaRes.value;
            if (gotOrch) {
                const orchChanged = hasAuxiliaryMetadataChanged(cachedOrchestratorSettings, orchRes.value);
                cachedOrchestratorSettings = orchRes.value;
                if (typeof statusBar !== 'undefined') {
                    statusBar.setOrchestratorSettings(orchRes.value);
                }
                if (orchChanged) {
                    updated = true;
                }
            }
            if (gotQuota) {
                const quotaChanged = hasAuxiliaryMetadataChanged(cachedQuotaSummary, quotaRes.value);
                cachedQuotaSummary = quotaRes.value;
                recordQuotaRunwaysFromState(cachedModelConfigs, cachedQuotaSummary);
                if (typeof statusBar !== 'undefined') {
                    statusBar.setQuotaSummary(quotaRes.value);
                    statusBar.setQuotaRunways(getCurrentQuotaRunways());
                }
                if (quotaChanged) {
                    updated = true;
                }
            }
            if (gotOrch || gotQuota) {
                auxMetadataConsecutiveFailures = 0;
            }
            else {
                auxMetadataConsecutiveFailures++;
            }
            if (updated) {
                if (typeof statusBar !== 'undefined') {
                    statusBar.refreshFromConfig();
                }
                if ((0, webview_panel_1.isMonitorPanelVisible)()) {
                    (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
                }
            }
        }
        finally {
            if (generation === modelMetadataGeneration) {
                isRefreshingAuxiliaryMetadata = false;
            }
        }
    })();
}
/** Apply an authenticated empty picker, while retaining cached state on RPC failure.
 *  The same transition is used on discovery, LS replacement, and periodic refresh. */
function applyLiveModelStatus(fullStatus, handlers = {
    replaceConfigs: configs => {
        cachedModelConfigs = configs;
        statusBar.setModelConfigs(configs);
    },
    switchAccount: handleAccountSwitchIfNeeded,
    updateQuota: (configs, email) => {
        quotaTracker.processUpdate(configs, buildUsedModelIds(email), email);
        recordQuotaRunwaysFromState(configs, cachedQuotaSummary);
        if (typeof statusBar !== 'undefined') {
            statusBar.setQuotaRunways(getCurrentQuotaRunways());
        }
        checkQuotaNotification(configs);
    },
}) {
    if (fullStatus.configs.length === 0 && !fullStatus.userInfo) {
        return false;
    }
    (0, tracker_1.updateModelDisplayNames)(fullStatus.configs, { authoritative: true });
    handlers.replaceConfigs(fullStatus.configs);
    if (fullStatus.userInfo?.email) {
        handlers.switchAccount(fullStatus.userInfo.email);
    }
    handlers.updateQuota(fullStatus.configs, fullStatus.userInfo?.email);
    return true;
}
// ─── Account Snapshot Helpers ─────────────────────────────────────────────────
/**
 * Build a set of model IDs that have confirmed LLM calls in the current cycle
 * for the given account. Used by both account snapshot hasUsage detection and
 * QuotaTracker's early tracking entry.
 */
function buildUsedModelIds(email) {
    const ids = new Set();
    if (!lastGMSummary?.conversations) {
        return ids;
    }
    for (const conv of lastGMSummary.conversations) {
        for (const call of conv.calls) {
            if ((!call.accountEmail || call.accountEmail === email) && call.model) {
                ids.add(call.model);
            }
        }
    }
    return ids;
}
/**
 * Parse a quota pool resetTime strictly as an ISO-8601 timestamp with timezone
 * and valid calendar date, rejecting proto3 epoch-0 (`1970-01-01T00:00:00Z`,
 * `.000Z`, `+00:00`), negative epochs, and malformed date strings.
 */
function parsePositivePoolResetMs(raw) {
    const ms = (0, tracker_1.parseStrictResetTimestamp)(raw);
    return ms !== null && ms > 0 ? ms : null;
}
/** Sort pool resetTime strings chronologically by UTC epoch ms (valid positive timestamps first). */
function comparePoolResetTimes(a, b) {
    const aMs = parsePositivePoolResetMs(a);
    const bMs = parsePositivePoolResetMs(b);
    if (aMs !== null && bMs !== null) {
        return aMs - bMs || a.localeCompare(b);
    }
    if (aMs !== null) {
        return -1;
    }
    if (bMs !== null) {
        return 1;
    }
    return a.localeCompare(b);
}
function groupModelConfigsByQuotaPool(configs) {
    const poolMap = new Map();
    for (const c of configs) {
        if (!c.quotaInfo) {
            continue;
        }
        const rawReset = typeof c.quotaInfo.resetTime === 'string' ? c.quotaInfo.resetTime.trim() : '';
        const resetMs = parsePositivePoolResetMs(rawReset);
        const resetTime = resetMs !== null ? rawReset : '';
        const key = (0, models_1.getQuotaPoolKey)(c.model, resetTime || undefined);
        const pool = poolMap.get(key) || { labels: [], modelIds: [], resetEntries: new Map(), minFraction: 1 };
        const label = c.label || c.model;
        if (label && !pool.labels.includes(label)) {
            pool.labels.push(label);
        }
        if (c.model && !pool.modelIds.includes(c.model)) {
            pool.modelIds.push(c.model);
        }
        if (resetTime && resetMs !== null && !pool.resetEntries.has(resetTime)) {
            pool.resetEntries.set(resetTime, resetMs);
        }
        const fraction = c.quotaInfo.remainingFraction;
        if (typeof fraction === 'number' && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1) {
            pool.minFraction = Math.min(pool.minFraction, fraction);
        }
        poolMap.set(key, pool);
    }
    return [...poolMap.entries()].map(([key, pool]) => {
        const sortedResets = [...pool.resetEntries.entries()]
            .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
        return {
            key,
            resetTime: sortedResets[0]?.[0] || '',
            labels: pool.labels,
            modelIds: pool.modelIds,
            minFraction: pool.minFraction,
        };
    });
}
const RESET_TIME_TURNOVER_MIN_JUMP_MS = 10 * 60 * 1000;
/**
 * resetTime 会在同一周期内轻微漂移，不能把“任何变化”都当成真正的额度重置。
 * 只有旧 resetTime 已经过期，且新的 resetTime 重新跳回未来并明显大于旧值时，
 * 才认为发生了新周期切换。
 */
function shouldSettleOnResetTimeChange(oldResetTime, newResetTime, nowMs = Date.now()) {
    if (!oldResetTime || !newResetTime || oldResetTime === newResetTime) {
        return false;
    }
    const oldMs = parsePositivePoolResetMs(oldResetTime);
    const newMs = parsePositivePoolResetMs(newResetTime);
    if (oldMs === null || newMs === null) {
        return false;
    }
    if (oldMs > nowMs || newMs <= nowMs) {
        return false;
    }
    return (newMs - oldMs) >= RESET_TIME_TURNOVER_MIN_JUMP_MS;
}
/**
 * Whether a value has the shape of a canonical platform model identifier
 * (MODEL_PLACEHOLDER_M298, MODEL_OPENAI_GPT_OSS_120B_MEDIUM, …).
 * Used to accept models the platform ships before the local registry knows about them.
 * MODEL_UNSPECIFIED is excluded — it is a sentinel, not an addressable model.
 */
function isPlatformModelId(value) {
    const clean = (value || '').trim();
    return /^MODEL_[A-Z0-9_]+$/.test(clean) && !clean.includes('UNSPECIFIED');
}
function positiveTokenLimit(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
        return 0;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}
async function fetchAndOverrideCheckpointerLimits(ls, logMessage = log, isCurrent = () => true) {
    try {
        logMessage('[Checkpointer Sync] Fetching official checkpointer parameters via LS RPC GetAvailableModels...');
        const resp = await (0, rpc_client_1.rpcCall)(ls, 'GetAvailableModels', {
            metadata: { ideName: 'antigravity', extensionName: 'antigravity' }
        }, 10000);
        if (!isCurrent()) {
            return false;
        }
        const response = resp.response;
        const models = response?.models || resp.models || {};
        const rawImageIds = response?.imageGenerationModelIds ?? resp.imageGenerationModelIds;
        const hasImageList = Array.isArray(rawImageIds) && rawImageIds.every(id => typeof id === 'string');
        const imageIds = new Set(hasImageList ? rawImageIds.map(id => id.trim()).filter(Boolean) : []);
        const overrides = {};
        const allFetchedInfo = [];
        let imageMetadataSynced = false;
        for (const [catalogId, c] of Object.entries(models)) {
            if (!c || typeof c !== 'object') {
                continue;
            }
            const modelVal = typeof c.model === 'string' ? c.model : '';
            // Current LS catalog entries carry their response/model ID in the map
            // key, not a modelId field. Keeping it prevents live sync replacing a
            // useful catalog alias with the opaque placeholder.
            const modelIdVal = (typeof c.modelId === 'string' && c.modelId)
                || (typeof c.model_id === 'string' && c.model_id) || catalogId;
            if (!modelVal && !modelIdVal)
                continue;
            // The platform hands us the canonical placeholder in `model` (e.g. MODEL_PLACEHOLDER_M298).
            // Trust that shape directly instead of requiring it to already be in the local registry:
            // a model the platform ships BEFORE we register it would otherwise resolve to undefined,
            // skip the updateModelSpec() call below, and be stuck with no spec at all — which is how a
            // brand-new model ends up showing a permanent "calculating threshold…" shimmer even though
            // its real parameters were sitting in the response we just parsed.
            const resolved = (isPlatformModelId(modelVal) ? modelVal : undefined)
                || (modelVal ? (0, models_1.resolveModelId)(modelVal) : undefined)
                || (modelIdVal ? (0, models_1.resolveModelId)(modelIdVal) : undefined);
            const exps = c.modelExperiments?.experiments || {};
            const checkpointerStr = exps.CASCADE_USE_EXPERIMENT_CHECKPOINTER?.stringValue;
            let limitNum = 0;
            let thresholdNum = 0;
            if (checkpointerStr) {
                allFetchedInfo.push(`[${modelIdVal || modelVal}] Exp JSON: ${checkpointerStr}`);
                try {
                    const cp = JSON.parse(checkpointerStr);
                    limitNum = positiveTokenLimit(cp.max_token_limit ?? cp.max_limit);
                    thresholdNum = positiveTokenLimit(cp.token_threshold ?? cp.threshold);
                    if (limitNum && !isNaN(limitNum) && limitNum > 0) {
                        const resolvedKey = resolved || modelVal || modelIdVal;
                        if (resolvedKey) {
                            overrides[resolvedKey] = limitNum;
                        }
                        if (modelVal)
                            overrides[modelVal] = limitNum;
                        if (modelIdVal)
                            overrides[modelIdVal] = limitNum;
                    }
                }
                catch { /* ignore JSON parse error */ }
            }
            else {
                allFetchedInfo.push(`[${modelIdVal || modelVal}] Exp JSON: undefined (No active checkpointer experiment)`);
            }
            // 同步更新 activeModelSpecs 数据库
            // Update anything already registered, but only CREATE a spec for a model the platform
            // actually describes. The catalog also carries internal entries (MODEL_CHAT_*, the tab
            // completion models) whose checkpointer and token fields are null — filing
            // specs for those would pad the registry with rows that render as a bare ID and a zero
            // context limit.
            const previousSpec = resolved ? (0, models_1.getModelSpecs)().find(s => s.placeholderId === resolved) : undefined;
            const alreadyRegistered = !!previousSpec;
            const imageModel = imageIds.has(catalogId) || imageIds.has(modelIdVal)
                || !!previousSpec?.isImageGeneration;
            // A model the user can actually pick must always get a spec, even before the platform
            // enables a checkpointer experiment on it: without one, getQuotaPoolKey() has no provider
            // to pool by and the new model splits into its own phantom quota pool — the exact failure
            // the provider fallback in models.ts exists to prevent.
            const inLivePicker = !!resolved && cachedModelConfigs.some(cfg => cfg.model === resolved);
            const maxTokens = positiveTokenLimit(c.maxTokens);
            const maxOutputTokens = positiveTokenLimit(c.maxOutputTokens);
            // Image tools are real catalog models even though they have no chat
            // checkpointer and are intentionally absent from the chat picker.
            const describesARealModel = (limitNum > 0 || imageModel) && maxTokens > 0;
            if (resolved && (alreadyRegistered || inLivePicker || describesARealModel)) {
                (0, models_1.registerResponseModelAlias)(modelIdVal, resolved);
                // Full protobuf catalog records omit default-valued fields. When
                // the provider and both token capacities are present, an absent
                // thinking budget/flag means zero/false, not "keep last month's
                // value". Partial or malformed records must preserve known data.
                const completeMetadata = isPlatformModelId(modelVal)
                    && typeof c.apiProvider === 'string' && !!c.apiProvider.trim()
                    && maxTokens > 0 && maxOutputTokens > 0;
                // Missing data in a partial response must not erase a known route.
                // A full record with no plan/execute experiment clears an old route.
                const executionLink = {};
                const planExecute = exps['plan-execute-config'];
                if (typeof planExecute?.stringValue === 'string') {
                    try {
                        const parsed = JSON.parse(planExecute.stringValue);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            const candidate = parsed.executionModel;
                            if (typeof candidate === 'string' && isPlatformModelId(candidate)
                                && candidate === candidate.trim() && candidate !== resolved) {
                                executionLink.executionModelId = candidate;
                            }
                        }
                    }
                    catch { /* Preserve last known route for malformed metadata. */ }
                }
                else if (completeMetadata && planExecute === undefined) {
                    executionLink.executionModelId = undefined;
                }
                (0, models_1.updateModelSpec)(resolved, {
                    ...executionLink,
                    modelId: modelIdVal || modelVal,
                    ...(typeof c.displayName === 'string' && c.displayName.trim() ? { displayName: c.displayName.trim() } : {}),
                    ...(imageModel ? { isImageGeneration: true, thinkingCapabilityReported: typeof c.supportsThinking === 'boolean' } : {}),
                    ...(typeof c.apiProvider === 'string' ? { apiProvider: c.apiProvider.replace('API_PROVIDER_', '') } : {}),
                    ...(maxTokens ? { maxTokens } : {}),
                    ...(maxOutputTokens ? { maxOutputTokens } : {}),
                    ...(typeof c.thinkingBudget === 'number' && Number.isFinite(c.thinkingBudget) ? { thinkingBudget: c.thinkingBudget } : {}),
                    ...(completeMetadata && c.thinkingBudget === undefined ? { thinkingBudget: 0 } : {}),
                    ...(typeof c.supportsThinking === 'boolean' ? { supportsThinking: c.supportsThinking } : {}),
                    ...(completeMetadata && c.supportsThinking === undefined ? { supportsThinking: false } : {}),
                    ...(typeof c.supportsAdaptiveThinking === 'boolean' ? { supportsAdaptiveThinking: c.supportsAdaptiveThinking } : {}),
                    ...(completeMetadata && c.supportsAdaptiveThinking === undefined ? { supportsAdaptiveThinking: false } : {}),
                    ...(typeof c.thinkingLevel === 'number' && Number.isSafeInteger(c.thinkingLevel) && c.thinkingLevel >= 0
                        ? { thinkingLevel: c.thinkingLevel } : {}),
                    ...(completeMetadata && c.thinkingLevel === undefined ? { thinkingLevel: 0 } : {}),
                    ...(limitNum > 0 ? { cpLimit: limitNum } : {}),
                    ...(thresholdNum > 0 ? { cpThreshold: thresholdNum } : {}),
                    ...(imageModel && completeMetadata && !checkpointerStr ? { cpLimit: 0, cpThreshold: 0 } : {}),
                });
                if (imageModel && completeMetadata) {
                    imageMetadataSynced = true;
                }
            }
        }
        if (hasImageList) {
            (0, models_1.setAvailableImageModelIds)([...imageIds]);
        }
        if (allFetchedInfo.length > 0) {
            logMessage(`[Checkpointer Sync] Official checkpointer parameters fetched for ${allFetchedInfo.length} models.`);
        }
        if (Object.keys(overrides).length > 0) {
            (0, models_1.overrideContextLimits)(overrides);
            logMessage(`[Checkpointer Sync] Dynamically resolved and overridden ${Object.keys(overrides).length} model context limits from official Checkpointer!`);
            return true;
        }
        if (imageMetadataSynced) {
            logMessage('[Checkpointer Sync] Image model metadata synchronized; no chat compression limit was reported.');
            return true;
        }
        // Parsed fine but produced nothing. Report failure so the caller retries on the next poll
        // instead of latching hasSyncedCheckpointer and never syncing again for the whole session:
        // an empty result means either the platform moved the response envelope (this reader is the
        // only nested `response.models` reader in the codebase — everything else reads a top-level
        // field) or no model currently carries a checkpointer experiment. Both are transient states
        // that a later poll can resolve, and both otherwise leave every model on its static fallback
        // while the log cheerfully reports success.
        logMessage(`[Checkpointer Sync] Parsed the response but found no checkpointer overrides — will retry. Envelope keys: ${Object.keys(resp ?? {}).join(', ') || '(none)'}`);
        return false;
    }
    catch (e) {
        logMessage(`[Checkpointer Sync] Optional dynamic capture failed: ${e.message}. Using built-in static fallbacks.`);
        return false;
    }
}
function updateAccountSnapshot(userInfo, configs) {
    const email = userInfo.email;
    if (!email) {
        return;
    }
    const nowMs = Date.now();
    // Group models by their stable quota pool first — we need the NEW resetTimes.
    const poolMap = new Map();
    for (const group of groupModelConfigsByQuotaPool(configs)) {
        poolMap.set(group.key, {
            resetTime: group.resetTime,
            labels: group.labels,
            modelIds: group.modelIds,
            hasUsage: group.minFraction < 1.0,
            minFraction: group.minFraction,
        });
    }
    // ── Cycle-change settlement: detect real turnover only ──
    // resetTime often drifts by a few minutes inside the SAME cycle.
    // Do not settle unless the old reset time has actually expired and the
    // new reset time jumps back into the future by more than normal drift.
    const oldSnap = accountSnapshots.get(email);
    if (oldSnap) {
        // Build old resetTime lookup: modelId → resetTime
        const oldResetByModel = new Map();
        for (const pool of (oldSnap.resetPools || [])) {
            if (!pool.resetTime) {
                continue;
            }
            for (const mid of (pool.modelIds || [])) {
                oldResetByModel.set(mid, pool.resetTime);
            }
        }
        // Check each new pool: if resetTime changed, settle the old pool
        for (const [, newPool] of poolMap) {
            if (!newPool.resetTime || !newPool.modelIds?.length) {
                continue;
            }
            // Find old resetTime for any model in this pool
            let oldResetTime;
            for (const mid of newPool.modelIds) {
                oldResetTime = oldResetByModel.get(mid);
                if (oldResetTime) {
                    break;
                }
            }
            if (!oldResetTime) {
                continue;
            }
            if (!shouldSettleOnResetTimeChange(oldResetTime, newPool.resetTime, nowMs)) {
                continue;
            }
            const oldResetMs = parsePositivePoolResetMs(oldResetTime);
            const cutoffTime = oldResetMs ?? undefined;
            if (dailyLedger.isPoolSettled(newPool.modelIds, email, cutoffTime)) {
                continue;
            }
            // Settle both DailyLedger and GMTracker using oldResetTime as cutoff
            const baselinedCount = gmTracker.baselineForQuotaReset(email, newPool.modelIds, oldResetTime);
            const settled = dailyLedger.settleForQuotaReset(newPool.modelIds, email, cutoffTime);
            if (baselinedCount > 0 || settled) {
                log(`[DailyLedger] cycle-change settlement: ${baselinedCount} GM calls baselined, ${settled ? settled.totalCalls : 0} ledger calls settled for [${newPool.labels.slice(0, 3).join(', ')}] (${email}) — resetTime changed ${oldResetTime} → ${newPool.resetTime}`);
                lastGMSummary = gmTracker.getDetailedSummary() || gmTracker.getCachedSummary();
                durableGlobalState.update('gmTrackerState', gmTracker.serialize());
                durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                persistGMSummaryToFile(lastGMSummary);
                syncStatusBarTelemetry(true);
            }
        }
    }
    // ── Enhanced usage detection: GMTracker cross-reference ──────────────
    // remainingFraction is quantized in 20% steps (1.0→0.8→0.6→0.4→0.2→0.0),
    // so frac=1.0 does NOT mean "unused" — it could mean consumption < 20%.
    // The reliable signal: check GMTracker's actual call records for this cycle.
    // If any model in a pool has been called by THIS account, the pool is "used".
    //
    // Match by model ID (language-independent), NOT display name.
    // e.g. pool has "Gemini 3.1 Pro (High)" but call.modelDisplay may differ
    //      both share model ID "MODEL_PLACEHOLDER_M37" — this always matches.
    const usedModelIds = buildUsedModelIds(email);
    if (usedModelIds.size > 0) {
        for (const [, pool] of poolMap) {
            if (pool.hasUsage) {
                continue;
            } // already confirmed ≥20% consumed
            for (const mid of pool.modelIds) {
                if (usedModelIds.has(mid)) {
                    pool.hasUsage = true;
                    break;
                }
            }
        }
    }
    // Build resetPools sorted by resetTime (earliest first, chronologically by epoch ms)
    const resetPools = [];
    const allResetTimes = [];
    for (const [, pool] of [...poolMap.entries()].sort((a, b) => comparePoolResetTimes(a[1].resetTime, b[1].resetTime))) {
        const resetTime = pool.resetTime;
        const remainingPct = pool.hasUsage ? Math.round(pool.minFraction * 100) : undefined;
        resetPools.push({ resetTime, modelLabels: pool.labels, modelIds: pool.modelIds, hasUsage: pool.hasUsage, remainingPercent: remainingPct });
        if (resetTime && !allResetTimes.includes(resetTime)) {
            allResetTimes.push(resetTime);
        }
    }
    const earliestResetTime = allResetTimes.length > 0 ? allResetTimes[0] : '';
    // Mark all existing snapshots as inactive
    for (const snap of accountSnapshots.values()) {
        snap.isActive = false;
    }
    // Upsert current account
    const validCredits = (0, account_credits_1.currentAICredits)(userInfo.availableCredits || []).flatMap(c => c.creditAmount === null ? [] : [{ creditType: c.creditType, creditAmount: c.creditAmount }]);
    accountSnapshots.set(email, {
        email,
        name: userInfo.name || '',
        planName: userInfo.planName || '',
        tierName: userInfo.userTierName || '',
        earliestResetTime,
        allResetTimes,
        resetPools,
        isActive: true,
        lastSeen: new Date().toISOString(),
        credits: validCredits.length > 0 ? validCredits : undefined,
    });
    // Persist to durable state
    persistAccountSnapshots();
}
function persistAccountSnapshots() {
    const arr = [];
    for (const snap of accountSnapshots.values()) {
        arr.push(snap);
    }
    durableFileGlobalState.update('accountSnapshots', arr);
}
function restoreAccountSnapshots() {
    const saved = durableFileGlobalState.get('accountSnapshots', null);
    if (saved && Array.isArray(saved)) {
        accountSnapshots = new Map();
        for (const snap of saved) {
            if (snap.email) {
                const sanitizedCredits = Array.isArray(snap.credits)
                    ? (0, account_credits_1.currentAICredits)(snap.credits.map(c => ({
                        creditType: c.creditType,
                        creditAmount: c.creditAmount,
                        minimumCreditAmountForUsage: 0,
                    }))).flatMap(c => c.creditAmount === null ? [] : [{ creditType: c.creditType, creditAmount: c.creditAmount }])
                    : undefined;
                // All restored snapshots start as inactive until a live fetch confirms
                accountSnapshots.set(snap.email, {
                    ...snap,
                    credits: sanitizedCredits && sanitizedCredits.length > 0 ? sanitizedCredits : undefined,
                    isActive: false,
                });
            }
        }
    }
}
/** Remove a cached (non-active) account snapshot. Returns updated snapshot list. */
function removeAccountSnapshot(email) {
    const snap = accountSnapshots.get(email);
    if (!snap || snap.isActive) {
        // Don't remove the currently active account
        return [...accountSnapshots.values()];
    }
    accountSnapshots.delete(email);
    persistAccountSnapshots();
    return [...accountSnapshots.values()];
}
function getAccountSnapshotArray() {
    return [...accountSnapshots.values()];
}
// ─── Per-Account Billing Days (durable) ──────────────────────────────────────
function persistBillingDays() {
    void durableFileGlobalState.update('accountBillingDays', billingDaysMap).then(undefined, err => {
        log(`Failed to persist account billing days: ${err}`);
    });
}
function restoreBillingDays() {
    const saved = durableFileGlobalState.get('accountBillingDays', null);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
        billingDaysMap = {};
        return;
    }
    const restored = {};
    for (const [rawEmail, day] of Object.entries(saved)) {
        const email = rawEmail.trim();
        if (email && (0, billing_day_1.isBillingDay)(day)) {
            restored[email] = day;
        }
    }
    billingDaysMap = restored;
}
/** Get the full billing days map. */
function getBillingDaysMap() {
    return billingDaysMap;
}
function isKnownAccountEmail(email) {
    return accountSnapshots.has(email) || email === currentAccountEmail || email === cachedUserInfo?.email;
}
/** Set billing day for a specific account email. day=0 removes it. */
function setAccountBillingDay(email, day) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !(0, billing_day_1.isBillingDaySetting)(day) || !isKnownAccountEmail(normalizedEmail)) {
        return false;
    }
    if (day > 0) {
        billingDaysMap[normalizedEmail] = day;
    }
    else {
        delete billingDaysMap[normalizedEmail];
    }
    persistBillingDays();
    if (normalizedEmail === currentAccountEmail && typeof statusBar !== 'undefined') {
        applyDisplayPrefs();
        statusBar.refreshFromConfig();
    }
    return true;
}
/**
 * Detect account switch for GM call attribution.
 * Also checks expired quota pools for BOTH the outgoing and incoming accounts,
 * since checkCachedAccountResets() only covers inactive accounts and would miss
    * the incoming account once it becomes active.
 */
function handleAccountSwitchIfNeeded(newEmail) {
    if (!newEmail) {
        return false;
    }
    if (currentAccountEmail && currentAccountEmail !== newEmail) {
        invalidateLiveModelMetadata();
        log(`Account switch detected: ${currentAccountEmail} → ${newEmail}`);
        // Before switching, check both accounts for expired pools that need archival.
        // The OLD account (currentAccountEmail) is about to become "cached" (inactive),
        // and the NEW account (newEmail) is about to become "active".
        // checkCachedAccountResets() only checks isActive===false, so the new account
        // would be skipped once it becomes active. We must handle it HERE.
        baselineExpiredPoolsForAccount(currentAccountEmail);
        baselineExpiredPoolsForAccount(newEmail);
        currentAccountEmail = newEmail;
        gmTracker.setCurrentAccount(newEmail);
        if (typeof statusBar !== 'undefined') {
            statusBar.setCredits(null);
            statusBar.setPlanName('', '');
            statusBar.setTelemetry(null);
        }
        applyDisplayPrefs(); // refresh billing day for new account
        return true;
    }
    if (!currentAccountEmail) {
        invalidateLiveModelMetadata();
        currentAccountEmail = newEmail;
        gmTracker.setCurrentAccount(newEmail);
        applyDisplayPrefs(); // set billing day for initial account
        // On first connection after extension restart, the account may already
        // have expired pools from a previous session. Baseline them now before
        // updateAccountSnapshot() refreshes the snapshot with a new resetTime.
        baselineExpiredPoolsForAccount(newEmail);
    }
    return false;
}
/**
 * Check a specific account's snapshot for expired quota pools and baseline them.
 * This is the same logic as checkCachedAccountResets() but operates on a single
 * account regardless of its isActive state. Used during account switching to
 * ensure expired pools are archived before the account's active state changes.
 */
function baselineExpiredPoolsForAccount(email) {
    const snap = accountSnapshots.get(email);
    if (!snap) {
        return;
    }
    const nowMs = Date.now();
    const pools = snap.resetPools || [];
    for (const pool of pools) {
        if (!pool.resetTime) {
            continue;
        }
        const resetMs = parsePositivePoolResetMs(pool.resetTime);
        if (resetMs === null) {
            continue;
        }
        const diffMs = resetMs - nowMs;
        if (diffMs > 0) {
            continue;
        } // Not yet expired
        // Skip pools with no confirmed usage — matches UI "Ready" logic
        // Also check ledger for actual data (snapshot hasUsage may be stale)
        if (pool.hasUsage === false
            && !dailyLedger.hasActiveCallsForPool(pool.modelIds || pool.modelLabels, email)) {
            continue;
        }
        // Skip if already notified/archived
        const key = `${email}:${pool.resetTime}:${pool.modelLabels.join('|')}`;
        if (notifiedAccountResets.has(key)) {
            continue;
        }
        // Skip if already archived in persisted state
        if (gmTracker.isPoolArchived(email, pool.modelIds || pool.modelLabels)) {
            notifiedAccountResets.add(key);
            log(`Account switch baseline: ${email} pool [${pool.modelLabels.slice(0, 3).join(', ')}] already archived — skipped`);
            continue;
        }
        notifiedAccountResets.add(key);
        // ── Baseline GM calls for the expired pool ──
        const baselinedCount = gmTracker.baselineForQuotaReset(email, pool.modelIds || pool.modelLabels, pool.resetTime);
        // ── Settle in DailyLedger too ──
        const cutoffTime = resetMs;
        const settled = dailyLedger.settleForQuotaReset(pool.modelIds || pool.modelLabels, email, cutoffTime);
        if (baselinedCount > 0 || settled) {
            log(`Account switch baseline: ${email} — ${baselinedCount} GM calls baselined for pool [${pool.modelLabels.slice(0, 3).join(', ')}]`);
            if (settled) {
                log(`  DailyLedger settled: ${settled.totalCalls} calls`);
            }
            lastGMSummary = gmTracker.getDetailedSummary() || gmTracker.getCachedSummary();
            durableGlobalState.update('gmTrackerState', gmTracker.serialize());
            durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
            persistGMSummaryToFile(lastGMSummary);
            syncStatusBarTelemetry(true);
        }
        // ── Step 3: Show notification ──
        const modelNames = pool.modelLabels.slice(0, 3).join(', ');
        const extra = pool.modelLabels.length > 3 ? ` +${pool.modelLabels.length - 3}` : '';
        const displayName = snap.name || snap.email;
        const openMonitorLabel = (0, i18n_1.tBi)('Open Monitor', '打开监控');
        vscode.window.showInformationMessage((0, i18n_1.tBi)(`✅ ${displayName}: ${modelNames}${extra} quota has reset. You can switch to this account now.`, `✅ ${displayName}: ${modelNames}${extra} 额度已重置，可以切换到该账号了。`), openMonitorLabel).then(choice => {
            if (choice === openMonitorLabel) {
                vscode.commands.executeCommand('antigravity-context-monitor.showDetails');
            }
        });
        log(`Account switch reset notification: ${displayName} — ${modelNames}${extra}`);
    }
}
/**
 * Perform daily archival by delegating to the testable core logic.
 * Wires module-level state into a DailyArchivalContext.
 */
function performDailyArchival(force = false) {
    const ctx = {
        activityTracker,
        gmTracker,
        dailyStore,
        pricingStore,
        lastGMSummary,
        persistedModelDNA,
        lastArchivalDateKey,
        dailyLedger,
        surface: 'ide',
        persist: (updates) => {
            lastArchivalDateKey = updates.lastArchivalDateKey;
            lastGMSummary = updates.lastGMSummary;
            if (updates.modelDNAChanged && updates.persistedModelDNA) {
                persistedModelDNA = updates.persistedModelDNA;
                durableGlobalState.update('modelDNAState', (0, model_dna_store_1.serializeModelDNAState)(persistedModelDNA));
            }
            durableGlobalState.update('lastArchivalDateKey', lastArchivalDateKey);
            durableGlobalState.update('activityTrackerState', activityTracker.serialize());
            durableGlobalState.update('gmTrackerState', gmTracker.serialize());
            durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
            persistGMSummaryToFile(lastGMSummary);
            syncStatusBarTelemetry(true);
        },
        log,
    };
    (0, daily_archival_1.performDailyArchival)(ctx, force);
}
// ─── Activation ───────────────────────────────────────────────────────────────
function activate(context) {
    extensionContext = context;
    abortController = new AbortController();
    disposed = false;
    outputChannel = vscode.window.createOutputChannel('Antigravity Context Monitor');
    log('Extension activating...');
    const workspaceKey = (0, tracker_1.normalizeUri)(getWorkspaceUri() || 'no-workspace');
    const customStatePath = process.env.ANTIGRAVITY_CONTEXT_MONITOR_STATE_PATH?.trim() || undefined;
    durableState = new durable_state_1.DurableState(customStatePath);
    durableGlobalState = durableState.globalBucket(context.globalState);
    durableWorkspaceState = durableState.workspaceBucket(workspaceKey, context.workspaceState);
    durableFileGlobalState = durableState.globalBucket();
    durableFileWorkspaceState = durableState.workspaceBucket(workspaceKey);
    // Inject durable state into webview-panel for zoom persistence
    (0, webview_panel_1.setPanelDurableState)(durableFileGlobalState);
    // Restore v1.17.5 conversation lock, pinned session, and quota runway history
    lockToMainAgent = durableFileGlobalState.get('lockToMainAgent', false);
    pinnedConversationId = durableFileWorkspaceState.get('pinnedConversationId', null);
    const savedRunway = durableFileGlobalState.get('quotaRunwayState', undefined);
    quotaRunwayTracker = savedRunway ? quota_runway_1.QuotaRunwayTracker.deserialize(savedRunway) : new quota_runway_1.QuotaRunwayTracker();
    // Initialize quota tracker
    quotaTracker = new quota_tracker_1.QuotaTracker(context, durableGlobalState);
    // The UI toggle is gone, but quota cycle detection still feeds GM repair and daily settlement.
    quotaTracker.setEnabled(true);
    quotaTracker.onQuotaReset = (modelIds, cutoffTime) => {
        // ── Baseline current account's GM calls for the reset pool ──
        const expandedIds = (0, pool_utils_1.expandModelIdsToPool)(modelIds, cachedModelConfigs);
        const cutoffMs = cutoffTime ? Date.parse(cutoffTime) : NaN;
        const ledgerCutoff = Number.isNaN(cutoffMs) ? undefined : cutoffMs;
        const baselinedCount = gmTracker.baselineForQuotaReset(undefined, expandedIds, cutoffTime);
        log(`Quota reset detected: [${modelIds.join(', ')}] (expanded to [${expandedIds.join(', ')}]) — ${baselinedCount} GM calls baselined for new cycle`);
        // ── Settle this pool's data in DailyLedger ──
        // Moves matching model data from "active" to "settled" (pending midnight flush)
        const settled = dailyLedger.settleForQuotaReset(expandedIds, currentAccountEmail, ledgerCutoff);
        if (settled) {
            log(`DailyLedger settled: ${settled.totalCalls} calls for pool [${settled.poolModelLabels.join(', ')}]`);
            durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
        }
        // Update cached summary and persist
        lastGMSummary = gmTracker.getDetailedSummary() || gmTracker.getCachedSummary();
        durableGlobalState.update('gmTrackerState', gmTracker.serialize());
        persistGMSummaryToFile(lastGMSummary);
        syncStatusBarTelemetry(true);
        // Refresh panel immediately so user sees fresh counts
        if ((0, webview_panel_1.isMonitorPanelVisible)()) {
            (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
        }
    };
    // Initialize i18n from persisted state
    (0, i18n_1.initI18n)(context);
    (0, i18n_1.initI18nFromState)(durableGlobalState);
    // Restore persisted lastKnownModel from workspaceState
    lastKnownModel = durableWorkspaceState.get('lastKnownModel', '');
    if (lastKnownModel) {
        log(`Restored lastKnownModel from workspaceState: ${lastKnownModel}`);
    }
    monitorStore = new monitor_store_1.MonitorStore();
    monitorStore.init(durableFileWorkspaceState);
    const restoredMonitor = monitorStore.restore();
    currentUsage = restoredMonitor.currentUsage;
    allTrajectoryUsages = restoredMonitor.allUsages;
    statusBar = new statusbar_1.StatusBarManager();
    (0, statusbar_1.setTooltipDiagLogger)(log);
    // Initialize activity tracker
    const savedActivity = durableGlobalState.get('activityTrackerState', undefined);
    activityTracker = savedActivity ? activity_tracker_1.ActivityTracker.restore(savedActivity) : new activity_tracker_1.ActivityTracker();
    if (savedActivity) {
        const normalizedActivityState = activityTracker.serialize();
        if (JSON.stringify(savedActivity) !== JSON.stringify(normalizedActivityState)) {
            durableGlobalState.update('activityTrackerState', normalizedActivityState);
            log('Activity tracker state normalized during startup repair');
        }
    }
    const savedGM = durableGlobalState.get('gmTrackerState', undefined);
    gmTracker = savedGM ? gm_tracker_1.GMTracker.restore(savedGM) : new gm_tracker_1.GMTracker();
    lastGMSummary = durableFileGlobalState.get('gmDetailedSummary', gmTracker.getCachedSummary());
    persistedModelDNA = (0, model_dna_store_1.restoreModelDNAState)(durableGlobalState.get('modelDNAState', null));
    pricingStore = new pricing_store_1.PricingStore();
    pricingStore.init(durableGlobalState);
    // Hydrate v1.17.6 shared app settings (reconciles orchestratorPricingMode, retention, currency, etc.)
    hydrateSharedAppSettingsFromDisk(true);
    // Restore multi-account snapshots from file-backed state
    restoreAccountSnapshots();
    restoreBillingDays();
    // Restore current account email from GMTracker persisted state
    currentAccountEmail = gmTracker.getCurrentAccount();
    dailyStore = new daily_store_1.DailyStore();
    dailyStore.init(durableGlobalState, { maxDays: sharedAppSettings.calendarRetentionDays });
    // Initialize DailyLedger — restores from durable state and tags IDE surface
    const savedLedger = durableGlobalState.get('dailyLedgerState', undefined);
    dailyLedger = daily_ledger_1.DailyLedger.restore(savedLedger);
    dailyLedger.setSurface('ide');
    if (savedLedger?.version === 1 && savedLedger.dateKey && savedLedger.dateKey !== dailyLedger.dateKey) {
        // Log only — never persist a normalization-only (still empty) ledger:
        // flushing an empty full snapshot can overwrite another window's
        // just-written data (last-writer-wins). restore() re-normalizes
        // idempotently on every startup, and the first added>0 persist
        // writes the corrected dateKey to disk.
        log(`[DailyLedger] normalized empty ledger date ${savedLedger.dateKey} → ${dailyLedger.dateKey} during startup restore`);
    }
    // ── Immediate cross-day archival on startup ──
    // If the ledger has data from a previous day (IDE was off overnight),
    // archive it NOW — don't wait for the polling loop or conversation load.
    if (dailyLedger.hasData && dailyLedger.dateKey !== (0, daily_ledger_1.toLocalDateKey)()) {
        log(`[Startup] Ledger has stale data from ${dailyLedger.dateKey}, archiving immediately`);
        // Override lastArchivalDateKey to the stale date so performDailyArchival's
        // "sameDay" guard doesn't reject it (it may already be today's date if a
        // previous instance or polling cycle set it without rolling over the ledger).
        lastArchivalDateKey = dailyLedger.dateKey;
        performDailyArchival();
    }
    // ── One-time migration: auto-recover data from legacy Antigravity (pre-2.0) ──
    // Detects old "Antigravity" globalState DB and imports calendar + language.
    // Also supports manual migration-import.json as a fallback.
    try {
        const migrationDir = path.dirname(durableState.getFilePath());
        const migrationDone = durableFileGlobalState.get('legacyMigrationDone', false);
        // --- Auto-detect old Antigravity DB ---
        if (!migrationDone) {
            const { extractLegacyData, runLegacyMigrationOnce } = require('./legacy-migration');
            runLegacyMigrationOnce({
                migrationDone,
                extractLegacyData: () => extractLegacyData(log),
                importLegacyData: (legacyData) => {
                    if (legacyData.dailyStoreState) {
                        const added = dailyStore.mergeRecords(legacyData.dailyStoreState);
                        log(`Legacy migration: merged ${added} calendar records`);
                    }
                    if (legacyData.displayLanguage && ['zh', 'en', 'both'].includes(legacyData.displayLanguage)) {
                        (0, i18n_1.setLanguageToState)(legacyData.displayLanguage, durableGlobalState);
                        context.globalState.update('displayLanguage', legacyData.displayLanguage);
                        log(`Legacy migration: restored language to '${legacyData.displayLanguage}'`);
                    }
                },
                markDone: () => {
                    durableFileGlobalState.update('legacyMigrationDone', true);
                },
                log,
            });
        }
        else {
            log('Legacy migration: data OK, no migration needed');
        }
        // --- Manual migration file (fallback / advanced recovery) ---
        const migrationFile = path.join(migrationDir, 'migration-import.json');
        if (fs.existsSync(migrationFile)) {
            log(`Migration: found manual migration file, importing...`);
            const raw = fs.readFileSync(migrationFile, 'utf8');
            const migration = JSON.parse(raw);
            if (migration.dailyStoreState) {
                const added = dailyStore.mergeRecords(migration.dailyStoreState);
                log(`Migration: merged ${added} calendar records from manual file`);
            }
            if (migration.displayLanguage && ['zh', 'en', 'both'].includes(migration.displayLanguage)) {
                (0, i18n_1.setLanguageToState)(migration.displayLanguage, durableGlobalState);
                context.globalState.update('displayLanguage', migration.displayLanguage);
                log(`Migration: restored language preference to '${migration.displayLanguage}'`);
            }
            const donePath = migrationFile.replace('.json', '.done.json');
            fs.renameSync(migrationFile, donePath);
            log(`Migration: completed, file renamed to ${donePath}`);
        }
    }
    catch (migrationErr) {
        log(`Migration: failed — ${migrationErr}`);
    }
    // ── Self-healing cost backfill ──
    // Days archived while their model had no price row carry no cost. Re-pricing them from
    // their stored tokens only fills gaps and never overwrites, so it runs on every startup
    // rather than behind a "migration done" flag: a row still unpriced today is filled by
    // whichever future release adds that price. Placed after the startup archival and both
    // migration merges so anything they just wrote is covered in this same session.
    const backfilledCostRows = dailyStore.backfillMissingCosts(pricingStore.getCustom());
    if (backfilledCostRows > 0) {
        log(`Cost backfill: re-priced ${backfilledCostRows} archived per-model row(s) that had no cost`);
    }
    // Restore daily archival date key
    lastArchivalDateKey = durableGlobalState.get('lastArchivalDateKey', '');
    // Restore cached user status from globalState for instant tooltip display
    const savedConfigs = durableGlobalState.get('cachedModelConfigs', []);
    const savedPlan = durableGlobalState.get('cachedPlanName', '');
    const savedTier = durableGlobalState.get('cachedTierName', '');
    if (savedConfigs && savedConfigs.length > 0) {
        // Seed the label table from the last known good configs so that everything running before the
        // first successful LS fetch (ledger restore, GM summary repair, the status bar) resolves model
        // names instead of writing raw placeholder strings into persisted keys. The live fetch below
        // overwrites this as soon as it lands.
        (0, tracker_1.updateModelDisplayNames)(savedConfigs);
        cachedModelConfigs = savedConfigs;
        statusBar.setModelConfigs(savedConfigs);
    }
    if (savedPlan) {
        statusBar.setPlanName(savedPlan, savedTier);
    }
    if (lastGMSummary && cachedModelConfigs.length > 0) {
        const repairedGMSummary = gmTracker.repairSummaryFromQuotaHistory(lastGMSummary, quotaTracker.getHistory(), cachedModelConfigs);
        if (repairedGMSummary !== lastGMSummary) {
            lastGMSummary = repairedGMSummary;
            gmTracker.setDetailedSummary(lastGMSummary);
            durableGlobalState.update('gmTrackerState', gmTracker.serialize());
            persistGMSummaryToFile(lastGMSummary);
            log('GM summary repaired from quota history during startup');
        }
    }
    if (lastGMSummary) {
        gmTracker.setDetailedSummary(lastGMSummary);
    }
    // Bootstrap timeline from file-backed GM summary after reinstall.
    // When globalState is wiped (uninstall/reinstall), activityTracker starts fresh
    // but gmDetailedSummary survives in file storage. Use it to pre-populate the
    // timeline so users see historical data immediately, not an empty panel.
    if (!savedActivity && lastGMSummary && lastGMSummary.conversations.length > 0) {
        const bootstrapped = activityTracker.injectGMData(lastGMSummary);
        if (bootstrapped) {
            durableGlobalState.update('activityTrackerState', activityTracker.serialize());
            log(`Timeline bootstrapped from file-backed GM summary (${lastGMSummary.conversations.length} convs, ${lastGMSummary.totalCalls} calls)`);
        }
    }
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand(monitor_overview_1.MONITOR_COMMAND, (destination) => {
        const initialTab = destination === 'models' || destination === 'settings' || destination === 'gmdata' || destination === 'pricing'
            ? destination
            : 'overview';
        (0, webview_panel_1.showMonitorPanel)(makePanelPayload({ context, initialTab }));
    }), vscode.commands.registerCommand('antigravity-context-monitor.refresh', () => {
        log('Manual refresh triggered');
        statusBar.refreshFromConfig();
        cachedLsInfo = null;
        invalidateLiveModelMetadata();
        consecutiveFailures = 0;
        currentIntervalMs = baseIntervalMs;
        restartPolling();
        pollContextUsage(true);
    }), vscode.commands.registerCommand('antigravity-context-monitor.switchLanguage', () => {
        (0, i18n_1.showLanguagePicker)(context, durableGlobalState).then(async () => {
            await flushDurableState();
            // Rebuild statusBar and WebView to reflect new language immediately
            statusBar.refreshFromConfig();
            (0, webview_panel_1.refreshMonitorPanelLanguage)();
        });
    }), vscode.commands.registerCommand('antigravity-context-monitor.showActivityPanel', () => {
        (0, webview_panel_1.showMonitorPanel)(makePanelPayload({ context, initialTab: 'gmdata' }));
    }), vscode.commands.registerCommand('antigravity-context-monitor.clearToolCatalog', () => {
        // Update the module-level lastGMSummary with the patched summary (empty catalog)
        // so makePanelPayload() doesn't serve stale data with the old catalog.
        lastGMSummary = persistClearedToolCatalog(gmTracker, durableGlobalState, durableFileGlobalState);
        log('[UI] Tool catalog cleared');
        if ((0, webview_panel_1.isMonitorPanelVisible)()) {
            (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
        }
    }), statusBar, outputChannel);
    // Start polling
    const config = vscode.workspace.getConfiguration('antigravityContextMonitor');
    const intervalSec = Math.max(1, config.get('pollingInterval', 5));
    baseIntervalMs = intervalSec * 1000;
    currentIntervalMs = baseIntervalMs;
    // Apply status bar display preferences
    applyDisplayPrefs();
    // Apply model internal ID display setting
    (0, models_1.setShowModelShortId)(config.get('showModelInternalId', false));
    schedulePoll();
    // Ensure timer and abort controller are cleaned up when extension is disposed
    context.subscriptions.push({
        dispose: () => {
            if (pollingTimer) {
                clearTimeout(pollingTimer);
                pollingTimer = undefined;
            }
            // Persist GM tracker state on dispose
            if (gmTracker) {
                durableGlobalState.update('gmTrackerState', gmTracker.serialize());
            }
            abortController.abort();
        }
    });
    // Listen for config changes (and mirror shared v1.17.6 settings into DurableState for App ↔ IDE sync)
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('antigravityContextMonitor.pollingInterval')) {
            const newConfig = vscode.workspace.getConfiguration('antigravityContextMonitor');
            const newIntervalSec = Math.max(1, newConfig.get('pollingInterval', 5));
            baseIntervalMs = newIntervalSec * 1000;
            currentIntervalMs = baseIntervalMs;
            consecutiveFailures = 0;
            restartPolling();
        }
        if (e.affectsConfiguration('antigravityContextMonitor.statusBar')) {
            applyDisplayPrefs();
            statusBar.refreshFromConfig();
            if ((0, webview_panel_1.isMonitorPanelVisible)()) {
                (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
                (0, webview_panel_1.syncMonitorPanelSettings)();
            }
            log('Status bar display preferences updated');
        }
        if (e.affectsConfiguration('window.zoomLevel')) {
            statusBar.refreshFromConfig();
            log('Window zoom updated — status bar tooltip re-rendered');
        }
        if (e.affectsConfiguration('antigravityContextMonitor.showModelInternalId')) {
            const newConfig = vscode.workspace.getConfiguration('antigravityContextMonitor');
            (0, models_1.setShowModelShortId)(newConfig.get('showModelInternalId', false));
            log('Model internal ID display setting updated');
        }
        // Mirror any affected shared setting to DurableState (guarded against self-triggered loop)
        if (pendingConfigSyncCount === 0 && e.affectsConfiguration('antigravityContextMonitor')) {
            const cfgNow = vscode.workspace.getConfiguration('antigravityContextMonitor');
            const patch = {};
            let anyChanged = false;
            let orchModeChanged = false;
            let retentionChanged = false;
            for (const { vscodeKey, appKey } of VSCODE_TO_APP_SETTING_MAP) {
                if (!e.affectsConfiguration(`antigravityContextMonitor.${vscodeKey}`)) {
                    continue;
                }
                const rawVal = cfgNow.get(vscodeKey);
                const normPatch = (0, durable_state_1.normalizeAppSettings)({ ...sharedAppSettings, [appKey]: rawVal });
                const normalizedVal = normPatch[appKey];
                if (sharedAppSettings[appKey] !== normalizedVal) {
                    patch[appKey] = normalizedVal;
                    anyChanged = true;
                    if (appKey === 'orchestratorPricingMode') {
                        orchModeChanged = true;
                    }
                    if (appKey === 'calendarRetentionDays') {
                        retentionChanged = true;
                    }
                }
            }
            let planChanged = false;
            if (e.affectsConfiguration('antigravityContextMonitor.subscriptionPlan')) {
                const nextPlan = inferIdeSubscriptionPlan(cfgNow.get('subscriptionPlan', 'none'), patch.subscriptionMonthlyFee ?? sharedAppSettings.subscriptionMonthlyFee);
                if (nextPlan !== sharedSubscriptionPlan) {
                    sharedSubscriptionPlan = nextPlan;
                    planChanged = true;
                    const preset = cli_usage_scanner_1.SUBSCRIPTION_PLAN_PRESETS[nextPlan];
                    if (nextPlan === 'none') {
                        patch.subscriptionMonthlyFee = null;
                        anyChanged = true;
                    }
                    else if (preset.monthlyUsd > 0) {
                        patch.subscriptionMonthlyFee = preset.monthlyUsd;
                        patch.subscriptionCurrency = 'USD';
                        anyChanged = true;
                    }
                }
            }
            if (anyChanged || planChanged) {
                if (orchModeChanged && patch.orchestratorPricingMode && pricingStore) {
                    void pricingStore.setOrchestratorPricingMode(patch.orchestratorPricingMode);
                }
                if (retentionChanged && typeof patch.calendarRetentionDays === 'number' && dailyStore) {
                    dailyStore.setMaxDays(patch.calendarRetentionDays);
                }
                sharedAppSettings = { ...sharedAppSettings, ...patch };
                if (durableState) {
                    void durableState.updateAppSettings(patch).then(async (updated) => {
                        sharedAppSettings = updated;
                        lastSyncedDiskAppSettings = { ...updated };
                        if (planChanged && durableFileGlobalState) {
                            await durableFileGlobalState.update('subscriptionPlan', sharedSubscriptionPlan);
                        }
                        await durableState.flush();
                    });
                }
                syncStatusBarTelemetry(true);
                if ((0, webview_panel_1.isMonitorPanelVisible)()) {
                    (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
                    (0, webview_panel_1.syncMonitorPanelSettings)();
                }
            }
        }
    }), 
    // ─── Workspace Switch Detection ─────────────────────────────────────
    // When workspace folders change (open different project, add/remove folder),
    // the cached LS and tracked cascade may be stale. Force full re-discovery
    // so trajectories are re-filtered for the new workspace URI.
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        log('Workspace folders changed — forcing LS re-discovery');
        cachedLsInfo = null;
        invalidateLiveModelMetadata();
        trackedCascadeId = null;
        lastPolledWorkspaceUri = undefined;
        consecutiveFailures = 0;
        currentIntervalMs = baseIntervalMs;
        lsRevalidationCounter = 0;
        consecutiveIdlePolls = 0;
        stalenessConfirmedIdle = false;
        restartPolling();
        void pollContextUsage();
    }));
    log(`Extension activated. Polling every ${intervalSec}s`);
    // Immediate first poll: reduces panel "waiting" state from ~6s to ~1-2s.
    // Activity processing is now merged into pollContextUsage — single unified loop.
    void pollContextUsage();
    triggerIdeBackgroundUpdateCheck();
}
// ─── Deactivation ─────────────────────────────────────────────────────────────
async function deactivate() {
    disposed = true;
    hasHydratedSharedSettings = false;
    (0, tracker_1.resetImageWorkflowCache)();
    if (pollingTimer) {
        clearTimeout(pollingTimer);
        pollingTimer = undefined;
    }
    abortController.abort();
    // Persist activity & GM data on deactivate
    const pendingUpdates = [];
    if (activityTracker && durableGlobalState) {
        pendingUpdates.push(durableGlobalState.update('activityTrackerState', activityTracker.serialize()));
    }
    if (gmTracker && durableGlobalState) {
        pendingUpdates.push(durableGlobalState.update('gmTrackerState', gmTracker.serialize()));
    }
    if (durableState) {
        await durableState.flush();
    }
    if (pendingUpdates.length > 0) {
        await Promise.allSettled(pendingUpdates);
    }
    if (statusBar) {
        statusBar.dispose();
    }
    log('Extension deactivated');
}
// ─── Display Preferences ──────────────────────────────────────────────────────
function applyDisplayPrefs() {
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    statusBar.setDisplayPrefs({
        showContext: cfg.get('statusBar.showContext', true),
        showQuota: cfg.get('statusBar.showQuota', true),
        showResetCountdown: cfg.get('statusBar.showResetCountdown', true),
        showAiCredits: cfg.get('statusBar.showAiCredits', true),
        showSpeed: cfg.get('statusBar.showSpeed', false),
        showCacheHit: cfg.get('statusBar.showCacheHit', false),
        showSessionCost: cfg.get('statusBar.showSessionCost', false),
    });
    statusBar.setBillingDay(billingDaysMap[currentAccountEmail] ?? 0);
}
/**
 * Push live account-filtered GM telemetry into StatusBarManager.
 * Pass `activeCascadeOverride = null` when idle/no-conversation to fall back to session scope.
 */
function syncStatusBarTelemetry(refresh = false, activeCascadeOverride) {
    if (typeof statusBar === 'undefined' || typeof gmTracker === 'undefined') {
        return;
    }
    const summary = gmTracker.getUiSummary();
    const activeCascadeId = activeCascadeOverride === null
        ? undefined
        : (activeCascadeOverride ?? currentUsage?.cascadeId ?? trackedCascadeId ?? undefined);
    const customPricing = pricingStore?.getCustom();
    statusBar.setTelemetry(summary, activeCascadeId, customPricing);
    const costs = computeLiveCostSnapshot(summary, activeCascadeId);
    statusBar.setCostSnapshot({
        todayCostUsd: costs.todayCostUsd > 0 ? costs.todayCostUsd : null,
        todayHasUnpriced: costs.todayHasUnpriced,
        sessionCostUsd: costs.sessionCostUsd > 0 ? costs.sessionCostUsd : null,
        sessionHasUnpriced: costs.sessionHasUnpriced,
    });
    if (refresh) {
        statusBar.refreshFromConfig();
    }
}
/** Recompute and re-render status bar telemetry (e.g. after custom pricing edits). */
function refreshStatusBarTelemetry() {
    syncStatusBarTelemetry(true);
}
/**
 * Push current account's total AI credits to the status bar.
 * Passes `null` when credits are unknown/unreported so the UI never fabricates `0`.
 */
function updateStatusBarCredits(userInfo) {
    statusBar.setCredits((0, account_credits_1.aiCreditTotal)(userInfo?.availableCredits || []));
}
/**
 * Extract the latest GM contextTokensUsed for a given cascade from a GMSummary.
 * Returns the value if found and > 0, otherwise 0.
 */
function getLatestGMContextUsed(summary, cascadeId) {
    const conv = summary.conversations.find(c => c.cascadeId === cascadeId);
    if (!conv || conv.calls.length === 0) {
        return 0;
    }
    let latest = 0;
    let latestTime = '';
    for (const call of conv.calls) {
        if (call.contextTokensUsed > 0 && call.createdAt > latestTime) {
            latestTime = call.createdAt;
            latest = call.contextTokensUsed;
        }
    }
    return latest;
}
/** Fill missing provider usage with the GM pre-request context estimate. */
function applyGMContextToUsage(usage, gmContextUsed) {
    if (usage.lastModelUsage || !Number.isSafeInteger(gmContextUsed)
        || gmContextUsed <= 0 || gmContextUsed === usage.contextUsed) {
        return false;
    }
    usage.contextUsed = gmContextUsed;
    // The source field is estimatedTokensUsed, not a measured provider token count.
    usage.isEstimated = true;
    usage.usagePercent = usage.contextLimit > 0
        ? (gmContextUsed / usage.contextLimit) * 100 : 0;
    return true;
}
// ─── Polling Logic ────────────────────────────────────────────────────────────
async function pollContextUsage(isManualRefresh = false) {
    if (isPolling) {
        if (isManualRefresh && typeof statusBar !== 'undefined') {
            statusBar.showInitializing();
        }
        return;
    }
    isPolling = true;
    let lsInfo = cachedLsInfo;
    try {
        // 1. Determine workspace URI for this window
        const workspaceUri = getWorkspaceUri();
        const normalizedWs = workspaceUri ? (0, tracker_1.normalizeUri)(workspaceUri) : '(none)';
        // ─── Workspace URI Change Detection (fallback) ──────────────────
        // If the workspace URI changed since the last poll (e.g., user opened
        // a different folder), invalidate the cached LS and tracked cascade
        // so we re-discover and re-filter trajectories for the new workspace.
        // This is a fallback — the primary detection is onDidChangeWorkspaceFolders.
        if (lastPolledWorkspaceUri !== undefined && lastPolledWorkspaceUri !== normalizedWs) {
            log(`Workspace URI changed: ${lastPolledWorkspaceUri} → ${normalizedWs} — resetting LS cache`);
            cachedLsInfo = null;
            invalidateLiveModelMetadata();
            lsInfo = null;
            trackedCascadeId = null;
            consecutiveIdlePolls = 0;
            stalenessConfirmedIdle = false;
        }
        lastPolledWorkspaceUri = normalizedWs;
        // Hot-reload shared DurableState changes written externally (e.g. by App Sidecar)
        syncFromDurableStateIfChanged(false);
        // 午夜归档必须在本轮轮询前半段执行：
        // 1. 不能被“无会话 / 无活跃对话”的提前 return 跳过
        // 2. 新一天的 GM / DailyLedger 记录必须建立在已 rollover 的干净状态上
        performDailyArchival();
        // 2. Discover LS (with caching + fast hint-change reconnect + periodic revalidation)
        if (lsInfo) {
            const activeHint = (0, backend_connection_1.getActiveBackendHint)();
            if (!(0, backend_connection_1.doesConnectionMatchActiveHint)(lsInfo, activeHint)) {
                log('Active IDE backend connection changed — forcing LS re-discovery');
                cachedLsInfo = null;
                lsInfo = null;
                invalidateLiveModelMetadata();
                lsRevalidationCounter = 0;
                consecutiveIdlePolls = 0;
                stalenessConfirmedIdle = false;
            }
        }
        if (!lsInfo) {
            log('Discovering language server...');
            if (isManualRefresh || statusBar.monitorStatus.state !== 'disconnected') {
                statusBar.showInitializing();
            }
            lsInfo = await discoverLanguageServer(workspaceUri, abortController.signal, log);
            cachedLsInfo = lsInfo;
            lsRevalidationCounter = 0;
            consecutiveIdlePolls = 0;
            if (!lsInfo) {
                handleLsFailure('LS not found', true);
                return;
            }
            resetBackoff();
            log(`LS found: pid=${lsInfo.pid} port=${lsInfo.port}, tls=${lsInfo.useTls}${lsInfo.hostname ? `, host=${lsInfo.hostname}` : ''}`);
            // Dynamically update model display names from GetUserStatus
            try {
                const fullStatus = await (0, tracker_1.fetchFullUserStatus)(lsInfo, abortController.signal);
                userStatusStaleGuard.recordSuccess(fullStatus);
                statusBar.setStaleState(getCurrentStaleState());
                if (applyLiveModelStatus(fullStatus)) {
                    log(`Updated model display names: ${fullStatus.configs.map(c => c.label).join(', ')}`);
                }
                if (fullStatus.userInfo) {
                    cachedUserInfo = fullStatus.userInfo;
                    updateStatusBarCredits(fullStatus.userInfo);
                    statusBar.setPlanName(fullStatus.userInfo.planName, fullStatus.userInfo.userTierName);
                    // Persist for instant display on next activation
                    durableGlobalState.update('cachedModelConfigs', cachedModelConfigs);
                    durableGlobalState.update('cachedPlanName', fullStatus.userInfo.planName);
                    durableGlobalState.update('cachedTierName', fullStatus.userInfo.userTierName);
                    log(`User plan: ${fullStatus.userInfo.planName}`);
                    updateAccountSnapshot(fullStatus.userInfo, fullStatus.configs);
                }
                triggerLiveAuxiliaryMetadataRefresh(lsInfo, cachedModelConfigs, modelMetadataGeneration, abortController.signal);
            }
            catch (statusErr) {
                userStatusStaleGuard.recordFailure(statusErr);
                statusBar.setStaleState(getCurrentStaleState());
            }
        }
        else {
            // ─── Periodic LS Connection Revalidation ─────────────────────────
            // BUG FIX: When Antigravity updates or restarts, a new LS may start
            // while the old one is still alive or port/token/TLS changed (even
            // when pid=0 via direct hint). Compare full connection identity.
            lsRevalidationCounter++;
            if (lsRevalidationCounter >= LS_REVALIDATION_INTERVAL) {
                lsRevalidationCounter = 0;
                try {
                    const freshLs = await discoverLanguageServer(workspaceUri, abortController.signal, log);
                    if (freshLs && !(0, backend_connection_1.isSameBackendConnection)(freshLs, lsInfo)) {
                        log(`⚠ LS connection changed: pid=${lsInfo.pid}→${freshLs.pid} port=${lsInfo.port}→${freshLs.port} tls=${lsInfo.useTls}→${freshLs.useTls}. Reconnecting to new LS.`);
                        lsInfo = freshLs;
                        cachedLsInfo = freshLs;
                        invalidateLiveModelMetadata();
                        consecutiveIdlePolls = 0;
                        // Re-fetch user status from new LS
                        try {
                            const fullStatus = await (0, tracker_1.fetchFullUserStatus)(lsInfo, abortController.signal);
                            applyLiveModelStatus(fullStatus);
                            if (fullStatus.userInfo) {
                                cachedUserInfo = fullStatus.userInfo;
                                updateStatusBarCredits(fullStatus.userInfo);
                                statusBar.setPlanName(fullStatus.userInfo.planName, fullStatus.userInfo.userTierName);
                                durableGlobalState.update('cachedModelConfigs', cachedModelConfigs);
                                durableGlobalState.update('cachedPlanName', fullStatus.userInfo.planName);
                                durableGlobalState.update('cachedTierName', fullStatus.userInfo.userTierName);
                                updateAccountSnapshot(fullStatus.userInfo, fullStatus.configs);
                            }
                            triggerLiveAuxiliaryMetadataRefresh(lsInfo, cachedModelConfigs, modelMetadataGeneration, abortController.signal);
                        }
                        catch { /* Silent */ }
                    }
                }
                catch {
                    // Discovery failed — keep using current connection
                    log('LS revalidation: discovery failed, keeping current connection');
                }
            }
            // Periodic refresh of user status (every STATUS_REFRESH_INTERVAL polls)
            // IMPORTANT: force refresh on first poll (!firstPollDone) so that
            // _currentAccountEmail is set BEFORE the first fetchAll(). Without this,
            // fetchAll() on restart would tag new calls with the stale account email
            // restored from persistence, causing error attribution mismatch.
            statusPollCount++;
            if (statusPollCount >= STATUS_REFRESH_INTERVAL || !firstPollDone) {
                statusPollCount = 0;
                try {
                    const fullStatus = await (0, tracker_1.fetchFullUserStatus)(lsInfo, abortController.signal);
                    userStatusStaleGuard.recordSuccess(fullStatus);
                    statusBar.setStaleState(getCurrentStaleState());
                    applyLiveModelStatus(fullStatus);
                    if (fullStatus.userInfo) {
                        cachedUserInfo = fullStatus.userInfo;
                        updateStatusBarCredits(fullStatus.userInfo);
                        statusBar.setPlanName(fullStatus.userInfo.planName, fullStatus.userInfo.userTierName);
                        durableGlobalState.update('cachedModelConfigs', cachedModelConfigs);
                        durableGlobalState.update('cachedPlanName', fullStatus.userInfo.planName);
                        durableGlobalState.update('cachedTierName', fullStatus.userInfo.userTierName);
                        updateAccountSnapshot(fullStatus.userInfo, fullStatus.configs);
                    }
                    triggerLiveAuxiliaryMetadataRefresh(lsInfo, cachedModelConfigs, modelMetadataGeneration, abortController.signal);
                    log('Refreshed user status (periodic)');
                }
                catch (statusErr) {
                    userStatusStaleGuard.recordFailure(statusErr);
                    statusBar.setStaleState(getCurrentStaleState());
                }
            }
        }
        // Dynamically override context limits once per LS connection, with BOUNDED retry on failure.
        // A failed sync must be retried — a transient empty response used to latch permanently and
        // leave every model on its static fallback for the whole session. But it must not retry
        // forever either: an account that genuinely has no checkpointer experiments would otherwise
        // issue this RPC on every poll for as long as the window stays open. Give up after a handful
        // of attempts and let a reconnect (which resets the counter below) be the way back in.
        if (lsInfo && !hasSyncedCheckpointer && !isSyncingCheckpointer
            && checkpointerSyncAttempts < MAX_CHECKPOINTER_SYNC_ATTEMPTS) {
            isSyncingCheckpointer = true;
            checkpointerSyncAttempts++;
            const attemptNo = checkpointerSyncAttempts;
            const generation = modelMetadataGeneration;
            fetchAndOverrideCheckpointerLimits(lsInfo, log, () => generation === modelMetadataGeneration && !disposed).then((success) => {
                if (generation !== modelMetadataGeneration) {
                    return;
                }
                isSyncingCheckpointer = false;
                if (success) {
                    hasSyncedCheckpointer = true;
                }
                else if (attemptNo >= MAX_CHECKPOINTER_SYNC_ATTEMPTS) {
                    log(`[Checkpointer Sync] Giving up after ${attemptNo} attempts — staying on the built-in static limits. A reconnect will retry.`);
                }
            }).catch(() => {
                if (generation === modelMetadataGeneration) {
                    isSyncingCheckpointer = false;
                }
            });
        }
        // 3. Get all trajectories
        let trajectories;
        try {
            trajectories = await (0, tracker_1.getAllTrajectories)(lsInfo, abortController.signal);
            trajectoriesStaleGuard.recordSuccess(trajectories);
            statusBar.setStaleState(getCurrentStaleState());
        }
        catch (err) {
            log(`RPC failed, retrying discovery: ${err}`);
            trajectoriesStaleGuard.recordFailure(err);
            statusBar.setStaleState(getCurrentStaleState());
            invalidateLiveModelMetadata();
            lsInfo = await discoverLanguageServer(workspaceUri, abortController.signal, log);
            cachedLsInfo = lsInfo;
            if (!lsInfo) {
                handleLsFailure('LS connection lost', true);
                return;
            }
            resetBackoff();
            trajectories = await (0, tracker_1.getAllTrajectories)(lsInfo, abortController.signal);
            trajectoriesStaleGuard.recordSuccess(trajectories);
            statusBar.setStaleState(getCurrentStaleState());
        }
        resetBackoff();
        lastTrajectories = trajectories;
        if (trajectories.length === 0) {
            const noConvLimit = (0, tracker_1.getContextLimit)(lastKnownModel);
            const noConvLimitStr = (0, statusbar_1.formatContextLimit)(noConvLimit);
            syncStatusBarTelemetry(false, null);
            statusBar.showNoConversation(noConvLimitStr, lastKnownModel);
            currentUsage = null;
            clearActiveContextTelemetry();
            allTrajectoryUsages = monitorStore.getAll();
            if ((0, webview_panel_1.isMonitorPanelVisible)()) {
                (0, webview_panel_1.updateMonitorPanel)(makePanelPayload({ currentUsage: null }));
            }
            updateBaselines(trajectories);
            return;
        }
        for (const t of trajectories.slice(0, 5)) {
            const wsUris = t.workspaceUris.map(u => `"${u}" → "${(0, tracker_1.normalizeUri)(u)}"`).join(', ');
            log(`  Trajectory "${t.summary?.substring(0, 30)}" status=${t.status} steps=${t.stepCount} workspaces=[${wsUris}]`);
        }
        // 4. Per-window cascade tracking — Workspace Isolation
        // With a workspace: strict filter — only show trajectories belonging to this workspace.
        // Without a workspace (no folder opened): show ALL trajectories, since there is
        // no folder to filter by and Antigravity assigns workspace URIs to all conversations.
        const qualifiedTrajectories = workspaceUri
            ? trajectories.filter(t => t.workspaceUris.some(u => (0, tracker_1.normalizeUri)(u) === normalizedWs))
            : trajectories;
        const runningSelection = selectRunningTrajectoryCandidate(trajectories, qualifiedTrajectories, trackedCascadeId);
        const qualifiedRunning = runningSelection.qualifiedRunning;
        let newCandidateId = runningSelection.candidateId;
        let selectionReason = runningSelection.selectionReason;
        log(`Trajectories: ${trajectories.length} total, ${qualifiedTrajectories.length} qualified in ws, ${qualifiedRunning.length} running in ws`);
        // ─── Staleness Heuristic ───────────────────────────────────────────
        // BUG FIX: If we're tracking a RUNNING cascade but LS reports it as IDLE
        // for too many consecutive polls, the LS is probably stale. Force re-discovery.
        if (qualifiedRunning.length === 0 && trackedCascadeId) {
            consecutiveIdlePolls++;
            if (consecutiveIdlePolls >= STALE_LS_IDLE_THRESHOLD && !stalenessConfirmedIdle) {
                log(`⚠ Staleness detected: tracked cascade ${trackedCascadeId.substring(0, 8)} has been IDLE for ${consecutiveIdlePolls} consecutive polls. Forcing LS re-discovery.`);
                consecutiveIdlePolls = 0;
                try {
                    const freshLs = await discoverLanguageServer(workspaceUri, abortController.signal, log);
                    if (freshLs && !(0, backend_connection_1.isSameBackendConnection)(freshLs, lsInfo)) {
                        log(`⚠ Stale LS confirmed: pid=${lsInfo.pid}→${freshLs.pid} port=${lsInfo.port}→${freshLs.port}. Reconnecting.`);
                        lsInfo = freshLs;
                        cachedLsInfo = freshLs;
                        invalidateLiveModelMetadata();
                        lsRevalidationCounter = 0;
                        stalenessConfirmedIdle = false;
                        // Re-fetch trajectories from the new LS
                        trajectories = await (0, tracker_1.getAllTrajectories)(lsInfo, abortController.signal);
                        lastTrajectories = trajectories;
                    }
                    else if (freshLs) {
                        log('LS connection unchanged — staleness was a false alarm (cascade genuinely IDLE)');
                        stalenessConfirmedIdle = true;
                    }
                }
                catch {
                    log('Staleness re-discovery failed, keeping current connection');
                }
            }
        }
        else {
            consecutiveIdlePolls = 0;
            stalenessConfirmedIdle = false;
        }
        if (runningSelection.selectedOutsideWorkspace && newCandidateId) {
            const selected = trajectories.find(t => t.cascadeId === newCandidateId);
            const hasWs = !!selected && selected.workspaceUris.length > 0;
            log(`Priority 1b: found RUNNING trajectory ${newCandidateId.substring(0, 8)} ${hasWs ? 'in other workspace' : 'without workspace URI'}`);
        }
        // --- Priority 2: stepCount CHANGE detection ---
        if (!newCandidateId && firstPollDone) {
            const activeChanges = qualifiedTrajectories.filter(t => {
                const prev = previousStepCounts.get(t.cascadeId);
                return prev !== undefined && t.stepCount !== prev;
            });
            const trackedChange = activeChanges.find(t => t.cascadeId === trackedCascadeId);
            if (trackedChange) {
                newCandidateId = trackedChange.cascadeId;
                const prev = previousStepCounts.get(trackedChange.cascadeId) || 0;
                const direction = trackedChange.stepCount > prev ? 'increased' : 'decreased (undo/rewind)';
                selectionReason = `stepCount ${direction}: ${prev} → ${trackedChange.stepCount}`;
            }
            else if (!trackedCascadeId && activeChanges.length > 0) {
                newCandidateId = activeChanges[0].cascadeId;
                selectionReason = 'stepCount changed in ws';
            }
        }
        // --- Priority 3: New trajectory detection ---
        // Switch to new conversations immediately — even if we're already tracking
        // another cascade. Without this, a new conversation would be ignored on
        // its first poll cycle, causing a visible one-cycle delay before data appears.
        if (!newCandidateId && firstPollDone) {
            const newlyCreated = qualifiedTrajectories.filter(t => !previousTrajectoryIds.has(t.cascadeId));
            if (newlyCreated.length > 0) {
                newCandidateId = newlyCreated[0].cascadeId;
                selectionReason = 'new trajectory appeared in ws';
            }
        }
        // --- Priority 3b: Keep tracked cascade stable if still present ---
        if (!newCandidateId && trackedCascadeId) {
            const trackedQualified = qualifiedTrajectories.find(t => t.cascadeId === trackedCascadeId)
                || trajectories.find(t => t.cascadeId === trackedCascadeId);
            if (trackedQualified) {
                newCandidateId = trackedQualified.cascadeId;
                selectionReason = 'sticky tracked cascade';
            }
        }
        // --- Priority 4: Most recently modified trajectory in workspace ---
        if (!newCandidateId && qualifiedTrajectories.length > 0) {
            const mostRecent = qualifiedTrajectories[0];
            newCandidateId = mostRecent.cascadeId;
            selectionReason = 'most recently modified in ws (fallback)';
        }
        // --- v1.17.5 Override: Manual Conversation Pin or Lock to Main Agent ---
        if (pinnedConversationId || lockToMainAgent) {
            const resolved = (0, conversation_selector_1.resolveTargetConversation)({
                trajectories,
                pinnedId: pinnedConversationId,
                lockToMainAgent,
                lockedMainId: lockedMainCascadeId,
                currentActiveId: newCandidateId || trackedCascadeId,
                workspaceUris: workspaceUri ? [workspaceUri] : [],
            });
            if (resolved.pinnedFallback && pinnedConversationId) {
                log(`Pinned conversation ${pinnedConversationId.substring(0, 8)} no longer exists — returning to auto-follow`);
                pinnedConversationId = null;
                if (durableFileWorkspaceState) {
                    void durableFileWorkspaceState.update('pinnedConversationId', null);
                }
            }
            lockedMainCascadeId = resolved.lockedMainId;
            if (resolved.cascadeId) {
                newCandidateId = resolved.cascadeId;
                selectionReason = resolved.reason;
            }
        }
        // Update tracked cascade
        if (newCandidateId) {
            if (trackedCascadeId !== newCandidateId) {
                log(`Switched cascade: ${trackedCascadeId?.substring(0, 8) || 'none'} → ${newCandidateId.substring(0, 8)} (${selectionReason})`);
                trackedCascadeId = newCandidateId;
                consecutiveIdlePolls = 0;
                stalenessConfirmedIdle = false;
                clearActiveContextTelemetry();
            }
            else if (selectionReason) {
                log(`Refreshing cascade ${trackedCascadeId?.substring(0, 8)} (${selectionReason})`);
            }
        }
        else if (trackedCascadeId) {
            const currentTracked = qualifiedTrajectories.find(t => t.cascadeId === trackedCascadeId)
                || trajectories.find(t => t.cascadeId === trackedCascadeId);
            if (!currentTracked) {
                log(`Tracked cascade ${trackedCascadeId.substring(0, 8)} no longer in any list, clearing`);
                trackedCascadeId = null;
                clearActiveContextTelemetry();
            }
        }
        // --- Find the trajectory to display ---
        let activeTrajectory = null;
        if (trackedCascadeId) {
            activeTrajectory = qualifiedTrajectories.find(t => t.cascadeId === trackedCascadeId)
                || trajectories.find(t => t.cascadeId === trackedCascadeId)
                || null;
            if (activeTrajectory && !selectionReason) {
                selectionReason = 'tracked cascade';
            }
        }
        if (!activeTrajectory) {
            const idleLimit = (0, tracker_1.getContextLimit)(lastKnownModel);
            const idleLimitStr = (0, statusbar_1.formatContextLimit)(idleLimit);
            log(`No active trajectory — showing idle (model=${lastKnownModel || 'default'}, limit=${idleLimitStr})`);
            syncStatusBarTelemetry(false, null);
            statusBar.showIdle(idleLimitStr, lastKnownModel);
            currentUsage = null;
            clearActiveContextTelemetry();
            allTrajectoryUsages = monitorStore.getAll();
            if ((0, webview_panel_1.isMonitorPanelVisible)()) {
                (0, webview_panel_1.updateMonitorPanel)(makePanelPayload({ currentUsage: null }));
            }
            updateBaselines(trajectories);
            return;
        }
        log(`Selected: "${activeTrajectory.summary}" (${activeTrajectory.cascadeId.substring(0, 8)}) reason=${selectionReason} status=${activeTrajectory.status}`);
        // 5. Get context usage for selected trajectory
        const persistedUsage = monitorStore.getSnapshot(activeTrajectory.cascadeId);
        if (hasSameUsageInputs(currentUsage, activeTrajectory)) {
            currentUsage = await (0, tracker_1.refreshWorkflowImageUsage)(lsInfo, rehydrateUsageForDisplay(currentUsage), abortController.signal);
        }
        else if (hasSameUsageInputs(persistedUsage, activeTrajectory)) {
            currentUsage = await (0, tracker_1.refreshWorkflowImageUsage)(lsInfo, rehydrateUsageForDisplay(persistedUsage), abortController.signal);
        }
        else {
            currentUsage = await (0, tracker_1.getContextUsage)(lsInfo, activeTrajectory, undefined, abortController.signal);
        }
        log(`  → contextUsed=${currentUsage.contextUsed} model=${currentUsage.model} steps=${currentUsage.stepCount} estimated=${currentUsage.isEstimated} ckpt_in=${currentUsage.lastModelUsage?.inputTokens ?? 'none'} ckpt_out=${currentUsage.lastModelUsage?.outputTokens ?? 'none'} estDelta=${currentUsage.estimatedDeltaSinceCheckpoint}`);
        // ── Pre-enhance with cached GM data to prevent step→GM flickering ──
        if (lastGMSummary && trackedCascadeId) {
            applyGMContextToUsage(currentUsage, getLatestGMContextUsed(lastGMSummary, trackedCascadeId));
        }
        // Track the model for idle-state display
        if (currentUsage.model) {
            lastKnownModel = currentUsage.model;
            durableWorkspaceState.update('lastKnownModel', lastKnownModel);
        }
        // ─── Compression Detection ─────────────────────────────────────────
        // Run before statusBar.update() so compression flags land in a single render pass.
        const previousObservation = previousContextObservations.get(currentUsage.cascadeId);
        const prevUsed = previousObservation?.contextUsed;
        const prevSteps = previousStepCounts.get(activeTrajectory.cascadeId);
        const isUndo = prevSteps !== undefined && activeTrajectory.stepCount < prevSteps;
        if (!currentUsage.compressionDetected) {
            const drop = measuredContextDrop(previousObservation, currentUsage, isUndo);
            if (drop > 0) {
                currentUsage.compressionDetected = true;
                currentUsage.previousContextUsed = prevUsed;
                compressionPersistCounters.set(currentUsage.cascadeId, constants_1.COMPRESSION_PERSIST_POLLS);
                log(`Compression detected (fallback) for ${currentUsage.cascadeId.substring(0, 8)}: ${prevUsed} → ${currentUsage.contextUsed} (dropped ${drop})`);
            }
        }
        if (currentUsage.compressionDetected && !compressionPersistCounters.has(currentUsage.cascadeId)) {
            if (prevUsed !== undefined) {
                currentUsage.previousContextUsed = prevUsed;
            }
            compressionPersistCounters.set(currentUsage.cascadeId, constants_1.COMPRESSION_PERSIST_POLLS);
            if (currentUsage.checkpointCompressionDrop > 0) {
                log(`Compression detected (checkpoint) for ${currentUsage.cascadeId.substring(0, 8)}: checkpoint inputTokens dropped ${currentUsage.checkpointCompressionDrop}`);
            }
            else {
                log(`Compression detected (checkpoint) for ${currentUsage.cascadeId.substring(0, 8)}: checkpoint inputTokens dropped`);
            }
        }
        if (!currentUsage.compressionDetected) {
            const remaining = compressionPersistCounters.get(currentUsage.cascadeId);
            if (remaining && remaining > 0) {
                currentUsage.compressionDetected = true;
                if (prevUsed !== undefined) {
                    currentUsage.previousContextUsed = prevUsed;
                }
                compressionPersistCounters.set(currentUsage.cascadeId, remaining - 1);
            }
        }
        previousContextObservations.set(currentUsage.cascadeId, {
            lastModelUsage: currentUsage.lastModelUsage,
            contextUsed: currentUsage.contextUsed, isEstimated: currentUsage.isEstimated,
            model: currentUsage.model, tokenUsageSource: currentUsage.tokenUsageSource,
        });
        syncStatusBarTelemetry(false, currentUsage.cascadeId);
        statusBar.update(currentUsage);
        const sourceLabel = currentUsage.isEstimated ? 'estimated' : 'precise';
        log(`Context: ${currentUsage.contextUsed} tokens (${sourceLabel}) | ${currentUsage.usagePercent.toFixed(1)}% | modelOut=${currentUsage.totalOutputTokens} | toolOut=${currentUsage.totalToolCallOutputTokens} | delta=${currentUsage.estimatedDeltaSinceCheckpoint} | imageGen=${currentUsage.imageGenStepCount}`);
        // 6. Background: compute usage for other recent trajectories
        const scopeTrajectories = buildUsageScopeTrajectories(qualifiedTrajectories, trajectories, activeTrajectory);
        const recentTrajectories = scopeTrajectories.slice(0, 5);
        const usagePromises = recentTrajectories.map(async (t) => {
            if (t.cascadeId === activeTrajectory.cascadeId) {
                return currentUsage;
            }
            const cachedUsage = monitorStore.getSnapshot(t.cascadeId);
            if (hasSameUsageInputs(cachedUsage, t)) {
                return (0, tracker_1.refreshWorkflowImageUsage)(lsInfo, rehydrateUsageForDisplay(cachedUsage), abortController.signal);
            }
            try {
                return await (0, tracker_1.getContextUsage)(lsInfo, t, undefined, abortController.signal);
            }
            catch {
                return null;
            }
        });
        const usageResults = await Promise.all(usagePromises);
        allTrajectoryUsages = usageResults.filter((u) => u !== null);
        monitorStore.record(allTrajectoryUsages, currentUsage.cascadeId);
        allTrajectoryUsages = monitorStore.getAll();
        // 6c. Activity processing (merged — reuses already-fetched trajectories, no duplicate RPC)
        if (activityTracker && lsInfo) {
            try {
                const activityChanged = await activityTracker.processTrajectories(lsInfo, trajectories.map(t => ({
                    cascadeId: t.cascadeId,
                    stepCount: t.stepCount,
                    status: t.status,
                    requestedModel: t.requestedModel,
                    generatorModel: t.generatorModel,
                })), abortController.signal);
                // Fetch GM data (piggyback on same poll cycle)
                let gmChanged = false;
                const hadUiSummary = gmTracker.getUiSummary() !== null;
                try {
                    const prevSummary = lastGMSummary;
                    if (isManualRefresh) {
                        gmTracker.clearErrorBackoff();
                    }
                    const gmSummary = await gmTracker.fetchAll(lsInfo, trajectories.map(t => ({ cascadeId: t.cascadeId, title: t.summary || t.cascadeId.substring(0, 8), stepCount: t.stepCount, status: t.status })), currentUsage?.cascadeId, abortController.signal);
                    const detailedSummary = gmTracker.getDetailedSummary() || gmSummary;
                    gmChanged = hasGMSummaryChanged(prevSummary, detailedSummary);
                    lastGMSummary = detailedSummary;
                    monitorStore.recordGMConversations(gmTracker.getAllConversationData());
                    if (gmChanged || !prevSummary) {
                        persistGMSummaryToFile(detailedSummary);
                        const mergedDNA = (0, model_dna_store_1.mergeModelDNAState)(persistedModelDNA, detailedSummary);
                        if (mergedDNA.changed) {
                            persistedModelDNA = mergedDNA.entries;
                            durableGlobalState.update('modelDNAState', (0, model_dna_store_1.serializeModelDNAState)(persistedModelDNA));
                        }
                    }
                }
                catch { /* GM fetch failure is non-critical */ }
                // ── DailyLedger: record new GM calls incrementally ──
                // This is the core "write-once" mechanism: once a call is recorded
                // in the ledger, it survives even if the LS drops the conversation.
                try {
                    const { entries: newEntries, debug: ledgerDebug, revertedCascadeIds } = gmTracker.getNewCallsSinceLastRecord();
                    // Clear stale dedup IDs for reverted conversations BEFORE recording
                    for (const cid of revertedCascadeIds) {
                        dailyLedger.clearRecordedIdsForConversation(cid);
                        log(`[DailyLedger] cleared dedup IDs for reverted conversation ${cid.substring(0, 8)}`);
                    }
                    if (newEntries.length > 0) {
                        const ledgerDateBeforeRecord = dailyLedger.dateKey;
                        const ledgerNormalizedBeforeRecord = dailyLedger.normalizeIfStaleEmpty();
                        if (ledgerNormalizedBeforeRecord) {
                            log(`[DailyLedger] normalized empty ledger date ${ledgerDateBeforeRecord} → ${dailyLedger.dateKey} before recording`);
                        }
                        const added = dailyLedger.recordCalls(newEntries, 'ide');
                        log(`[DailyLedger] extracted=${newEntries.length} added=${added} dedup_rejected=${newEntries.length - added}`);
                        for (const d of ledgerDebug) {
                            log(`[DailyLedger]   ${d}`);
                        }
                        if (added === newEntries.length) {
                            gmTracker.markLedgerEntriesRecorded(newEntries);
                        }
                        else {
                            log('[DailyLedger] ledger positions retained for retry because not all entries were accepted');
                        }
                        // Persist only when calls were actually added — a normalization-only
                        // (still empty) flush could overwrite another window's fresh data (LWW).
                        if (added > 0) {
                            durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                        }
                    }
                    if (revertedCascadeIds.length > 0) {
                        durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                    }
                    const reconciled = dailyLedger.reconcileRecordedCalls(gmTracker.getLedgerReconciliationEntries());
                    if (reconciled > 0) {
                        // This may repair old unpriced calls even when the normal
                        // write-once cursor produces no new entries this poll.
                        durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                        log(`[DailyLedger] reconciled metadata/pricing for ${reconciled} recorded calls without adding calls`);
                    }
                }
                catch { /* Ledger recording failure is non-critical */ }
                // ── DailyLedger: proactive settlement by resetTime ──
                // Unlike QuotaTracker's heuristic detection, this directly checks
                // whether each pool's resetTime has passed and settles unsettled pools.
                try {
                    const nowMs = Date.now();
                    for (const snap of accountSnapshots.values()) {
                        for (const pool of (snap.resetPools || [])) {
                            if (!pool.resetTime || !pool.modelIds?.length) {
                                continue;
                            }
                            const resetMs = parsePositivePoolResetMs(pool.resetTime);
                            if (resetMs === null || resetMs > nowMs) {
                                continue;
                            }
                            // Skip if no usage or already settled
                            // hasUsage from snapshot may be stale for inactive accounts,
                            // so also check if ledger has actual recorded calls for this pool
                            if (pool.hasUsage === false
                                && !dailyLedger.hasActiveCallsForPool(pool.modelIds, snap.email)) {
                                continue;
                            }
                            if (dailyLedger.isPoolSettled(pool.modelIds, snap.email, resetMs)) {
                                continue;
                            }
                            // Settle!
                            const settled = dailyLedger.settleForQuotaReset(pool.modelIds, snap.email, resetMs);
                            if (settled) {
                                log(`[DailyLedger] proactive settlement: ${settled.totalCalls} calls for [${settled.poolModelLabels.join(', ')}] (${snap.email})`);
                                durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                                // 同步对 GMTracker 进行 quota-reset 归档
                                try {
                                    const blCount = gmTracker.baselineForQuotaReset(snap.email, pool.modelIds, pool.resetTime);
                                    log(`[GMTracker] proactive baseline: ${blCount} calls for [${pool.modelIds.join(', ')}] (${snap.email})`);
                                    lastGMSummary = gmTracker.getDetailedSummary() || gmTracker.getCachedSummary();
                                    durableGlobalState.update('gmTrackerState', gmTracker.serialize());
                                    persistGMSummaryToFile(lastGMSummary);
                                }
                                catch (e) {
                                    log(`[GMTracker] proactive baseline failed: ${e}`);
                                }
                            }
                        }
                    }
                }
                catch { /* Proactive settlement failure is non-critical */ }
                // Inject GM precision data into activity timeline events.
                // GM is the SOLE source of truth for timeline — always inject when data exists.
                let timelineChanged = false;
                let gmEnhancedStatusBar = false;
                if (lastGMSummary) {
                    timelineChanged = activityTracker.injectGMData(lastGMSummary);
                    // ── Enhance status bar with fresh GM data (new calls since last poll) ──
                    if (currentUsage && trackedCascadeId) {
                        const gmCtx = getLatestGMContextUsed(lastGMSummary, trackedCascadeId);
                        const oldUsed = currentUsage.contextUsed;
                        if (applyGMContextToUsage(currentUsage, gmCtx)) {
                            gmEnhancedStatusBar = true;
                            log(`Status bar enhanced with GM precision: contextUsed ${oldUsed} → ${gmCtx}`);
                        }
                    }
                }
                syncStatusBarTelemetry(false, currentUsage?.cascadeId || trackedCascadeId || undefined);
                if (gmEnhancedStatusBar && currentUsage) {
                    statusBar.update(currentUsage);
                }
                else if (gmChanged || timelineChanged || (!hadUiSummary && gmTracker.getUiSummary() !== null)) {
                    statusBar.refreshFromConfig();
                }
                // Throttled activity persistence (max once per 30s)
                const now = Date.now();
                if ((activityChanged || gmChanged || timelineChanged) && now - lastActivityPersistTime > 30_000) {
                    durableGlobalState.update('activityTrackerState', activityTracker.serialize());
                    if (gmTracker) {
                        durableGlobalState.update('gmTrackerState', gmTracker.serialize());
                        if (lastGMSummary) {
                            persistGMSummaryToFile(lastGMSummary);
                        }
                    }
                    lastActivityPersistTime = now;
                }
            }
            catch (err) {
                log(`Activity processing error: ${err}`);
            }
        }
        // 6d. Compute v1.17.5 Context Composition Breakdown & Turn Diagnostics for active conversation
        if (!activeTrajectory || !currentUsage) {
            clearActiveContextTelemetry();
        }
        else if (lsInfo && (0, webview_panel_1.isMonitorPanelVisible)()) {
            const breakdownKey = `${activeTrajectory.cascadeId}:${activeTrajectory.stepCount}:${activeTrajectory.lastModifiedTime}:${currentUsage.contextUsed}:${currentUsage.contextLimit}`;
            if (breakdownKey !== lastContextBreakdownKey) {
                try {
                    const rawMeta = await (0, tracker_1.fetchTrajectoryGeneratorMetadata)(lsInfo, activeTrajectory.cascadeId, abortController.signal);
                    const hasPromptSections = rawMeta.some(entry => {
                        const cm = entry?.chatModel;
                        return Array.isArray(cm?.promptSections) && cm.promptSections.length > 0;
                    });
                    let rawSteps;
                    if (!hasPromptSections && activeTrajectory.stepCount > 0) {
                        const fetched = await (0, tracker_1.fetchTrajectorySteps)(lsInfo, activeTrajectory.cascadeId, activeTrajectory.stepCount, abortController.signal);
                        rawSteps = fetched.steps;
                    }
                    const prevMaxSteps = maxObservedStepCounts.get(activeTrajectory.cascadeId);
                    const prevUsedTokens = previousBreakdownUsedTokens.get(activeTrajectory.cascadeId);
                    lastContextBreakdown = (0, context_breakdown_1.parseContextBreakdown)({
                        generatorMetadata: rawMeta,
                        steps: rawSteps,
                        currentStepCount: activeTrajectory.stepCount,
                        previousMaxStepCount: prevMaxSteps,
                        previousUsedTokens: prevUsedTokens,
                        model: currentUsage.model,
                        modelDisplayName: currentUsage.modelDisplayName,
                        effectiveBudgetTokens: currentUsage.contextLimit,
                    });
                    maxObservedStepCounts.set(activeTrajectory.cascadeId, Math.max(prevMaxSteps ?? 0, activeTrajectory.stepCount));
                    if (lastContextBreakdown.usedTokens > 0) {
                        previousBreakdownUsedTokens.set(activeTrajectory.cascadeId, lastContextBreakdown.usedTokens);
                    }
                    lastTurnDiagnostics = rawMeta.length > 0 ? (0, turn_diagnostics_1.analyzeTurnDiagnostics)(rawMeta) : null;
                    lastContextBreakdownKey = breakdownKey;
                }
                catch (bdErr) {
                    log(`Context breakdown fetch error: ${bdErr}`);
                }
            }
        }
        // 6e. Update WebView panel if visible (single unified refresh point)
        if ((0, webview_panel_1.isMonitorPanelVisible)()) {
            (0, webview_panel_1.updateMonitorPanel)(makePanelPayload());
        }
        // 7. Update baselines for next poll
        updateBaselines(trajectories);
    }
    catch (err) {
        log(`Polling error: ${err}`);
        handleLsFailure(`Error: ${err}`);
        lsInfo = null;
        cachedLsInfo = null;
        invalidateLiveModelMetadata();
    }
    finally {
        // Always run cached-account reset check — independent of polling success/failure.
        // Wrapped in its own try/catch so errors are logged, never silently swallowed.
        try {
            checkCachedAccountResets();
        }
        catch (resetErr) {
            log(`[ResetCheck] ERROR: ${resetErr}`);
        }
        isPolling = false;
    }
}
function handleLsFailure(message, isDiscoveryFailure = false) {
    consecutiveFailures++;
    trajectoriesStaleGuard.recordFailure(message);
    statusBar.setStaleState(getCurrentStaleState());
    currentUsage = null;
    allTrajectoryUsages = monitorStore.getAll();
    statusBar.showDisconnected(message);
    if ((0, webview_panel_1.isMonitorPanelVisible)()) {
        (0, webview_panel_1.updateMonitorPanel)(makePanelPayload({ currentUsage: null }));
    }
    // Use a lower cap for discovery failures (LS not yet started) so the
    // extension detects a newly launched LS within ~15s instead of ~60s.
    const maxBackoff = isDiscoveryFailure ? constants_1.MAX_DISCOVERY_BACKOFF_MS : constants_1.MAX_BACKOFF_INTERVAL_MS;
    const backoffMs = Math.min(baseIntervalMs * Math.pow(2, consecutiveFailures - 1), maxBackoff);
    if (backoffMs !== currentIntervalMs) {
        currentIntervalMs = backoffMs;
        restartPolling();
        log(`Backoff: ${consecutiveFailures} consecutive failures, polling every ${currentIntervalMs / 1000}s`);
    }
}
function resetBackoff() {
    if (consecutiveFailures > 0) {
        log(`Backoff reset: LS reconnected after ${consecutiveFailures} failures`);
        consecutiveFailures = 0;
        currentIntervalMs = baseIntervalMs;
        restartPolling();
    }
}
function updateBaselines(trajectories) {
    previousStepCounts.clear();
    previousTrajectoryIds.clear();
    const activeIds = new Set();
    for (const t of trajectories) {
        previousStepCounts.set(t.cascadeId, t.stepCount);
        previousTrajectoryIds.add(t.cascadeId);
        activeIds.add(t.cascadeId);
    }
    for (const id of previousContextObservations.keys()) {
        if (!activeIds.has(id)) {
            previousContextObservations.delete(id);
        }
    }
    for (const id of compressionPersistCounters.keys()) {
        if (!activeIds.has(id)) {
            compressionPersistCounters.delete(id);
        }
    }
    firstPollDone = true;
}
function schedulePoll() {
    if (disposed) {
        return;
    }
    const myGeneration = ++pollGeneration;
    pollingTimer = setTimeout(async () => {
        try {
            await pollContextUsage();
        }
        catch (err) {
            try {
                log(`Unexpected polling error: ${err}`);
            }
            catch { /* ignore */ }
        }
        finally {
            if (pollGeneration === myGeneration) {
                schedulePoll();
            }
        }
    }, currentIntervalMs);
}
function restartPolling() {
    if (pollingTimer) {
        clearTimeout(pollingTimer);
    }
    schedulePoll();
    log(`Polling restarted: ${currentIntervalMs / 1000}s interval`);
}
// ─── Low Quota Notification ───────────────────────────────────────────────────
function checkQuotaNotification(configs) {
    // Suppress Google quota pool alert popups when active session uses a custom / BYOK model
    if ((0, quota_runway_1.isCustomModel)(currentUsage?.model, currentUsage?.modelDisplayName)) {
        return;
    }
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    const thresholdPct = cfg.get('quotaNotificationThreshold', 20);
    if (thresholdPct <= 0) {
        return;
    } // disabled
    const thresholdFrac = thresholdPct / 100;
    // Group models by stable quota pool and merge effort levels into base-model names.
    const mergedLabelsByPool = new Map();
    for (const quotaGroup of (0, model_quota_1.groupModelQuotas)(configs)) {
        const key = quotaGroup.pool || quotaGroup.key;
        const labels = quotaGroup.members.map(m => m.label).filter(Boolean);
        if (labels.length > 0) {
            mergedLabelsByPool.set(key, labels);
        }
    }
    const groups = new Map();
    for (const group of groupModelConfigsByQuotaPool(configs)) {
        const displayLabels = mergedLabelsByPool.get(group.key) || group.labels;
        groups.set(group.key, { labels: displayLabels, minFraction: group.minFraction });
    }
    for (const [groupKey, group] of groups) {
        if (group.minFraction <= thresholdFrac) {
            // Only notify once per group per threshold crossing
            if (!quotaNotifiedModels.has(groupKey)) {
                quotaNotifiedModels.add(groupKey);
                const pct = (group.minFraction * 100).toFixed(1);
                // Cap the model list the same way the reset notification does (see the pool
                // notification above). The shared gemini pool now spans three Flash generations
                // plus Pro — joining all of them produces a warning so long that VS Code truncates
                // it before the percentage, which is the only number that matters here.
                const shownLabels = group.labels.slice(0, 3).join(', ');
                const names = group.labels.length > 3
                    ? `${shownLabels} +${group.labels.length - 3}`
                    : shownLabels;
                const openMonitorLabel = (0, i18n_1.tBi)('Open Monitor', '打开监控');
                vscode.window.showWarningMessage((0, i18n_1.tBi)(`⚠ ${names} quota low: ${pct}% remaining`, `⚠ ${names} 额度偏低：剩余 ${pct}%`), openMonitorLabel).then(choice => {
                    if (choice === openMonitorLabel) {
                        vscode.commands.executeCommand('antigravity-context-monitor.showDetails');
                    }
                });
                log(`Low quota notification (group): ${names} at ${pct}%`);
            }
        }
        else {
            // Recovered above threshold — re-arm notification
            quotaNotifiedModels.delete(groupKey);
        }
    }
}
/**
 * Check if any cached (non-active) account's quota has reset.
 * Sends a one-time VS Code notification per reset event.
 */
function checkCachedAccountResets() {
    const nowMs = Date.now();
    for (const snap of accountSnapshots.values()) {
        if (snap.isActive) {
            continue;
        }
        const pools = snap.resetPools || [];
        for (const pool of pools) {
            if (!pool.resetTime) {
                continue;
            }
            const resetMs = parsePositivePoolResetMs(pool.resetTime);
            if (resetMs === null) {
                continue;
            }
            const diffMs = resetMs - nowMs;
            if (diffMs > 0) {
                continue;
            }
            // Skip pools with no confirmed usage — matches UI "Ready" logic
            // Also check ledger for actual data (snapshot hasUsage may be stale
            // for accounts that haven't been active since the last API refresh)
            if (pool.hasUsage === false
                && !dailyLedger.hasActiveCallsForPool(pool.modelIds || pool.modelLabels, snap.email)) {
                continue;
            }
            const modelNames = pool.modelLabels.slice(0, 3).join(', ');
            const key = `${snap.email}:${pool.resetTime}:${pool.modelLabels.join('|')}`;
            if (notifiedAccountResets.has(key)) {
                continue;
            }
            // ── Guard: skip if this pool was already archived (persisted state) ──
            if (gmTracker.isPoolArchived(snap.email, pool.modelIds || pool.modelLabels)) {
                notifiedAccountResets.add(key);
                log(`[ResetCheck] ${snap.email} [${modelNames}]: already-archived — skipped`);
                continue;
            }
            // ── WILL TRIGGER ──
            log(`[ResetCheck]   [${modelNames}] >>> TRIGGERING archival for ${snap.email}`);
            notifiedAccountResets.add(key);
            const extra = pool.modelLabels.length > 3 ? ` +${pool.modelLabels.length - 3}` : '';
            const displayName = snap.name || snap.email;
            const openMonitorLabel = (0, i18n_1.tBi)('Open Monitor', '打开监控');
            // ── Baseline this cached account's GM calls for the expired pool only ──
            const baselinedCount = gmTracker.baselineForQuotaReset(snap.email, pool.modelIds || pool.modelLabels, pool.resetTime);
            // Also archive any active QuotaTracker sessions for this cached account's pool.
            // Without this, sessions stay in 'tracking' forever because processUpdate()
            // never receives API configs for non-active accounts.
            const archivedSessions = quotaTracker.archiveExpiredSessions(snap.email, pool.modelIds || pool.modelLabels);
            // ── Settle this pool in DailyLedger ──
            const cutoffTime = resetMs;
            const settled = dailyLedger.settleForQuotaReset(pool.modelIds || pool.modelLabels, snap.email, cutoffTime);
            if (baselinedCount > 0 || archivedSessions > 0 || settled) {
                log(`[ResetCheck]   ${baselinedCount} GM calls baselined, ${archivedSessions} quota sessions archived`);
                if (settled) {
                    log(`[ResetCheck]   DailyLedger settled: ${settled.totalCalls} calls for [${settled.poolModelLabels.join(', ')}]`);
                }
                lastGMSummary = gmTracker.getDetailedSummary() || gmTracker.getCachedSummary();
                durableGlobalState.update('gmTrackerState', gmTracker.serialize());
                durableGlobalState.update('dailyLedgerState', dailyLedger.serialize());
                persistGMSummaryToFile(lastGMSummary);
                syncStatusBarTelemetry(true);
            }
            else {
                log(`[ResetCheck]   baselineForQuotaReset returned 0 — no calls to archive`);
            }
            vscode.window.showInformationMessage((0, i18n_1.tBi)(`✅ ${displayName}: ${modelNames}${extra} quota has reset. You can switch to this account now.`, `✅ ${displayName}: ${modelNames}${extra} 额度已重置，可以切换到该账号了。`), openMonitorLabel).then(choice => {
                if (choice === openMonitorLabel) {
                    vscode.commands.executeCommand('antigravity-context-monitor.showDetails');
                }
            });
            log(`[ResetCheck]   Notification sent: ${displayName} — ${modelNames}${extra}`);
        }
    }
}
function getStorageDiagnostics() {
    const stateFilePath = durableState.getFilePath();
    const stateFileExists = durableState.exists();
    let stateFileSizeBytes = 0;
    try {
        stateFileSizeBytes = stateFileExists ? fs.statSync(stateFilePath).size : 0;
    }
    catch { /* ignore stat errors */ }
    return {
        stateFilePath,
        stateFileExists,
        stateFileSizeBytes,
        stateFileOpenWarnBytes: webview_panel_1.LARGE_STATE_FILE_WARN_BYTES,
        calendarDayCount: dailyStore?.totalDays || 0,
    };
}
function log(message) {
    if (!outputChannel) {
        return;
    }
    const timestamp = new Date().toISOString().substring(11, 23);
    outputChannel.appendLine(`[${timestamp}] ${message}`);
}
// ─── Workspace Detection ──────────────────────────────────────────────────────
function getWorkspaceUri() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    const uri = folders[0].uri.toString();
    // Log remote URIs for diagnostic purposes
    if (uri.startsWith('vscode-remote://')) {
        log(`Remote workspace URI detected: ${uri}`);
    }
    return uri;
}
//# sourceMappingURL=extension.js.map