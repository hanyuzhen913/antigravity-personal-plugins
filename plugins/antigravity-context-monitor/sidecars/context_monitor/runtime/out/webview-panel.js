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
exports.formatFileSize = exports.LARGE_STATE_FILE_WARN_BYTES = void 0;
exports.setPanelDurableState = setPanelDurableState;
exports.openUriInEditor = openUriInEditor;
exports.confirmLargeStateFileOpen = confirmLargeStateFileOpen;
exports.showMonitorPanel = showMonitorPanel;
exports.refreshMonitorPanelLanguage = refreshMonitorPanelLanguage;
exports.updateMonitorPanel = updateMonitorPanel;
exports.syncMonitorPanelSettings = syncMonitorPanelSettings;
exports.isMonitorPanelVisible = isMonitorPanelVisible;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const i18n_1 = require("./i18n");
const extension_1 = require("./extension");
const pricing_store_1 = require("./pricing-store");
const webview_helpers_1 = require("./webview-helpers");
const webview_settings_tab_1 = require("./webview-settings-tab");
const tooltip_budget_1 = require("./tooltip-budget");
const context_breakdown_1 = require("./context-breakdown");
const monitor_overview_1 = require("./monitor-overview");
const reset_time_1 = require("./reset-time");
const i18n_core_1 = require("./i18n-core");
const webview_document_1 = require("./webview-document");
const webview_calendar_tab_1 = require("./webview-calendar-tab");
const daily_archival_1 = require("./daily-archival");
const cli_usage_scanner_1 = require("./cli-usage-scanner");
const sidecar_runtime_1 = require("./app/sidecar-runtime");
const cdp_injector_1 = require("./app/cdp-injector");
const cdpLauncher = __importStar(require("./app/cdp-launcher"));
// ─── Panel State ──────────────────────────────────────────────────────────────
let panel;
let extensionCtx;
let nextTabRequest = 0;
let pendingTab;
/** Cached data for re-rendering after language switch. */
let lastUsage = null;
let lastMonitorStatus;
let lastAllUsages = [];
let lastTrajectories = [];
let lastConfigs = [];
let lastUserInfo = null;
let lastWorkspaceUri = '';
let lastActivitySummary = null;
let lastGMSummary = null;
/** Full summary with ALL accounts — Cost tab uses this for cross-account cost calculation. */
let lastGMFullSummary = null;
let lastGMConversations = {};
let lastPricingStore;
let lastDailyStore;
let lastStorageDiagnostics;
let panelDurableState;
let lastAccountSnapshots = [];
let lastTodayLedgerActive = [];
let lastLedgerSettled = [];
let lastCustomPricing = {};
let lastOrchestratorSettings = null;
let lastQuotaSummary = null;
let lastTodayCostUsd;
let lastSessionCostUsd;
let lastContextBreakdown = null;
let lastTurnDiagnostics = null;
let lastQuotaRunways;
let lastIsCustomModelActive = false;
let lastStaleState = null;
let lastConversationOptions = [];
let lastActiveConversationId = null;
let lastPinnedConversationId = null;
let lastLockToMainAgent = false;
let lastCliDays;
let lastOrchestratorPricingMode;
let lastAppSettings;
let lastUpdateStatus = null;
let lastCdpStatus = null;
let lastLowQuotaWarning;
exports.LARGE_STATE_FILE_WARN_BYTES = 1 * 1024 * 1024;
const SAFE_CASCADE_ID_RE = /^[a-zA-Z0-9_-]{4,128}$/;
/** Provide a durable state bucket for panel-level persistence (zoom, etc.). */
function setPanelDurableState(state) {
    panelDurableState = state;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function sanitizeConfigValue(key, value) {
    switch (key) {
        case 'statusBar.tooltipDensity':
            return (0, tooltip_budget_1.parseTooltipDensity)(value);
        case 'statusBar.showContext':
        case 'statusBar.showQuota':
        case 'statusBar.showResetCountdown':
        case 'statusBar.showAiCredits':
        case 'statusBar.showSpeed':
        case 'statusBar.showCacheHit':
        case 'statusBar.showSessionCost':
        case 'showModelInternalId':
            return !!value;
        case 'quotaNotificationThreshold':
            return clamp(Number(value) || 0, 0, 99);
        case 'activity.maxRecentSteps':
            return clamp(Number(value) || 100, 10, 500);
        case 'activity.maxArchives':
            return clamp(Number(value) || 20, 1, 100);
        default:
            return value;
    }
}
function readIdeDocumentSettings() {
    (0, extension_1.syncDurableStateFromDisk)(false);
    const hydrated = (0, extension_1.isSharedAppSettingsHydrated)();
    const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
    const shared = (0, extension_1.getSharedAppSettings)();
    if (hydrated) {
        const maxRecentSteps = shared.activityMaxRecentSteps;
        const maxArchives = shared.activityMaxArchives;
        return {
            pollingInterval: shared.pollingInterval,
            quotaNotificationThreshold: shared.quotaNotificationThreshold,
            showContext: shared.showContext,
            showQuota: shared.showQuota,
            showResetCountdown: shared.showResetCountdown,
            showAiCredits: shared.showAiCredits,
            showSpeed: shared.showSpeed,
            showCacheHit: shared.showCacheHit,
            showSessionCost: shared.showSessionCost,
            tooltipDensity: shared.tooltipDensity,
            showModelInternalId: shared.showModelInternalId,
            maxRecentSteps,
            maxArchives,
            lockToMainAgent: (0, extension_1.getLockToMainAgent)(),
            appComposerRingEnabled: shared.appComposerRingEnabled,
            appTopBarEnabled: shared.appTopBarEnabled,
            showNativeHudBar: shared.showNativeHudBar,
            orchestratorPricingMode: shared.orchestratorPricingMode,
            displayCurrency: shared.displayCurrency,
            customFxRate: shared.customFxRate,
            subscriptionPlan: (0, cli_usage_scanner_1.normalizeSubscriptionPlanId)(shared.subscriptionPlan, shared.subscriptionMonthlyFee),
            subscriptionMonthlyFee: shared.subscriptionMonthlyFee,
            subscriptionCurrency: shared.subscriptionCurrency,
            calendarRetentionDays: shared.calendarRetentionDays,
            autoCheckUpdates: shared.autoCheckUpdates,
            activityMaxRecentSteps: maxRecentSteps,
            activityMaxArchives: maxArchives,
        };
    }
    const maxRecentSteps = cfg.get('activity.maxRecentSteps', shared.activityMaxRecentSteps ?? 100);
    const maxArchives = cfg.get('activity.maxArchives', shared.activityMaxArchives ?? 20);
    const orchRaw = cfg.get('orchestratorPricingMode', shared.orchestratorPricingMode ?? 'mapped');
    const orchestratorPricingMode = (0, pricing_store_1.normalizeOrchestratorPricingMode)(orchRaw);
    const displayCurrency = (cfg.get('displayCurrency', shared.displayCurrency ?? 'USD') || 'USD');
    const customFxRate = cfg.get('customFxRate', shared.customFxRate ?? null);
    const subscriptionMonthlyFee = cfg.get('subscriptionMonthlyFee', shared.subscriptionMonthlyFee ?? null);
    const subscriptionPlan = (0, cli_usage_scanner_1.normalizeSubscriptionPlanId)(cfg.get('subscriptionPlan', shared.subscriptionPlan ?? 'none'), subscriptionMonthlyFee);
    const subscriptionCurrency = (cfg.get('subscriptionCurrency', shared.subscriptionCurrency ?? 'USD') || 'USD');
    const calendarRetentionDays = cfg.get('calendarRetentionDays', shared.calendarRetentionDays ?? 400);
    const autoCheckUpdates = cfg.get('autoCheckUpdates', shared.autoCheckUpdates ?? true);
    const showNativeHudBar = cfg.get('showNativeHudBar', false);
    return {
        pollingInterval: cfg.get('pollingInterval', shared.pollingInterval ?? 5),
        quotaNotificationThreshold: cfg.get('quotaNotificationThreshold', shared.quotaNotificationThreshold ?? 20),
        showContext: cfg.get('statusBar.showContext', shared.showContext ?? true),
        showQuota: cfg.get('statusBar.showQuota', shared.showQuota ?? true),
        showResetCountdown: cfg.get('statusBar.showResetCountdown', shared.showResetCountdown ?? true),
        showAiCredits: cfg.get('statusBar.showAiCredits', shared.showAiCredits ?? true),
        showSpeed: cfg.get('statusBar.showSpeed', shared.showSpeed ?? false),
        showCacheHit: cfg.get('statusBar.showCacheHit', shared.showCacheHit ?? false),
        showSessionCost: cfg.get('statusBar.showSessionCost', shared.showSessionCost ?? false),
        tooltipDensity: (0, tooltip_budget_1.parseTooltipDensity)(cfg.get('statusBar.tooltipDensity', shared.tooltipDensity ?? 'auto')),
        showModelInternalId: cfg.get('showModelInternalId', shared.showModelInternalId ?? false),
        maxRecentSteps,
        maxArchives,
        lockToMainAgent: (0, extension_1.getLockToMainAgent)(),
        appComposerRingEnabled: shared.appComposerRingEnabled,
        appTopBarEnabled: shared.appTopBarEnabled,
        showNativeHudBar,
        orchestratorPricingMode,
        displayCurrency,
        customFxRate,
        subscriptionPlan,
        subscriptionMonthlyFee,
        subscriptionCurrency,
        calendarRetentionDays,
        autoCheckUpdates,
        activityMaxRecentSteps: maxRecentSteps,
        activityMaxArchives: maxArchives,
    };
}
(0, webview_settings_tab_1.registerSettingsProvider)(readIdeDocumentSettings);
function refreshLocalStorageDiagnostics() {
    if (!lastStorageDiagnostics) {
        return;
    }
    const stateFileExists = fs.existsSync(lastStorageDiagnostics.stateFilePath);
    let stateFileSizeBytes = 0;
    try {
        stateFileSizeBytes = stateFileExists ? fs.statSync(lastStorageDiagnostics.stateFilePath).size : 0;
    }
    catch { /* ignore stat errors */ }
    lastStorageDiagnostics = {
        ...lastStorageDiagnostics,
        stateFileExists,
        stateFileSizeBytes,
        stateFileOpenWarnBytes: exports.LARGE_STATE_FILE_WARN_BYTES,
        calendarDayCount: lastDailyStore?.totalDays || 0,
    };
}
function clearDisposedPanel() {
    panel = undefined;
    pendingTab = undefined;
    isPaused = false;
}
async function openUriInEditor(target) {
    const options = {
        preview: false,
        preserveFocus: false,
        viewColumn: panel?.viewColumn ?? vscode.ViewColumn.Active,
    };
    try {
        await vscode.commands.executeCommand('vscode.open', target, options);
        return;
    }
    catch {
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc, options);
    }
}
function reportStateFileError(action, err) {
    const reason = err instanceof Error ? err.message : String(err);
    const warning = action === 'open'
        ? (0, i18n_1.tBi)('Failed to open state file.', '打开状态文件失败。')
        : (0, i18n_1.tBi)('Failed to reveal state file.', '定位状态文件失败。');
    void vscode.window.showWarningMessage(`${warning} ${reason}`);
    safePostMessage({ command: 'stateFileActionResult', action, ok: false, message: warning });
}
// formatFileSize is re-exported from webview-helpers for external consumers
var webview_helpers_2 = require("./webview-helpers");
Object.defineProperty(exports, "formatFileSize", { enumerable: true, get: function () { return webview_helpers_2.formatFileSize; } });
async function confirmLargeStateFileOpen(fileSizeBytes) {
    if (fileSizeBytes < exports.LARGE_STATE_FILE_WARN_BYTES) {
        return 'open';
    }
    const openLabel = (0, i18n_1.tBi)('Open Anyway', '仍然打开');
    const revealLabel = (0, i18n_1.tBi)('Reveal Instead', '改为定位');
    const message = (0, i18n_1.tBi)(`The state file is ${(0, webview_helpers_1.formatFileSize)(fileSizeBytes)}. Opening it as plain text may stall the editor. Recommended: reveal it in the file manager instead.`, `状态文件大小为 ${(0, webview_helpers_1.formatFileSize)(fileSizeBytes)}。直接作为文本打开可能导致编辑器卡顿。更推荐先在文件管理器中定位它。`);
    const choice = await vscode.window.showWarningMessage(message, { modal: true }, openLabel, revealLabel);
    if (choice === openLabel) {
        return 'open';
    }
    if (choice === revealLabel) {
        return 'reveal';
    }
    return 'cancel';
}
function getPanelHintPreferences() {
    return {
        showTabScrollHint: panelDurableState?.get('panelShowTabScrollHint', true) ?? true,
        showScrollbar: panelDurableState?.get('panelShowScrollbar', false) ?? false,
        showEndOfContent: panelDurableState?.get('panelShowEndOfContent', true) ?? true,
    };
}
function getAntigravityRoot() {
    return path.join(os.homedir(), '.gemini', 'antigravity');
}
function workspaceTargetFromUri(workspaceUri) {
    if (!workspaceUri) {
        return null;
    }
    if (workspaceUri.startsWith('file:')) {
        try {
            return vscode.Uri.parse(workspaceUri);
        }
        catch {
            return null;
        }
    }
    try {
        return vscode.Uri.file(workspaceUri);
    }
    catch {
        return null;
    }
}
function getConversationTarget(cascadeId, kind) {
    const root = getAntigravityRoot();
    const pbPath = path.join(root, 'conversations', `${cascadeId}.pb`);
    if (kind === 'pb') {
        return vscode.Uri.file(pbPath);
    }
    const brainDir = path.join(root, 'brain', cascadeId);
    const recordingDir = path.join(root, 'browser_recordings', cascadeId);
    const conversationDir = path.join(root, 'conversations');
    const preferred = [brainDir, recordingDir, conversationDir];
    for (const target of preferred) {
        if (fs.existsSync(target)) {
            return vscode.Uri.file(target);
        }
    }
    return vscode.Uri.file(conversationDir);
}
async function revealUriOrParent(target) {
    if (!target) {
        void vscode.window.showWarningMessage((0, i18n_1.tBi)('Unable to resolve that location.', '无法解析这个定位目标。'));
        return;
    }
    const exists = await vscode.workspace.fs.stat(target).then(() => true, () => false);
    if (exists) {
        await vscode.commands.executeCommand('revealFileInOS', target);
        return;
    }
    if (target.scheme === 'file') {
        const parent = vscode.Uri.file(path.dirname(target.fsPath));
        const parentExists = await vscode.workspace.fs.stat(parent).then(() => true, () => false);
        if (parentExists) {
            await vscode.commands.executeCommand('revealFileInOS', parent);
            return;
        }
    }
    void vscode.window.showWarningMessage((0, i18n_1.tBi)('The target path does not exist yet.', '目标路径当前不存在。'));
}
function isDisposedWebviewError(err) {
    return err instanceof Error && /disposed/i.test(err.message);
}
/**
 * VS Code currently throws disposed WebView errors synchronously from postMessage().
 * Keep this as a sync try/catch so non-disposed failures preserve their call stack.
 */
function safePostMessage(message) {
    if (!panel) {
        return;
    }
    try {
        panel.webview.postMessage(message);
    }
    catch (err) {
        if (isDisposedWebviewError(err)) {
            clearDisposedPanel();
            return;
        }
        throw err;
    }
}
/** When true, auto-refresh updates are buffered but not rendered. */
let isPaused = false;
/** Calendar interactive navigation & filter state */
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth() + 1;
let calendarSourceFilter = 'all';
let calendarMetricMode = 'tokens';
let calendarPeriodMode = 'daily';
let calendarViewMode = undefined;
let calendarSelectedDate = '';
function buildIdeCurrencyConfig(docSettings) {
    return {
        code: docSettings.displayCurrency ?? 'USD',
        ...(typeof docSettings.customFxRate === 'number' && Number.isFinite(docSettings.customFxRate) && docSettings.customFxRate > 0
            ? { customRatePerUsd: docSettings.customFxRate }
            : {}),
    };
}
function buildIdeSubscriptionConfig(docSettings) {
    const planId = (0, cli_usage_scanner_1.normalizeSubscriptionPlanId)(docSettings.subscriptionPlan, docSettings.subscriptionMonthlyFee);
    if (planId === 'none') {
        return null;
    }
    return {
        planId,
        ...(typeof docSettings.subscriptionMonthlyFee === 'number' && Number.isFinite(docSettings.subscriptionMonthlyFee) && docSettings.subscriptionMonthlyFee > 0
            ? { monthlyFee: docSettings.subscriptionMonthlyFee }
            : {}),
        feeCurrency: docSettings.subscriptionCurrency ?? 'USD',
        ...(typeof docSettings.customFxRate === 'number' && Number.isFinite(docSettings.customFxRate) && docSettings.customFxRate > 0
            ? { customRatePerUsd: docSettings.customFxRate }
            : {}),
    };
}
function buildIdeCalendarOptions(docSettings, nowMs = Date.now()) {
    const customPricing = lastPricingStore?.getCustom() ?? lastCustomPricing;
    const cliDays = lastCliDays !== undefined ? lastCliDays : (0, extension_1.getCachedCliUsageDays)(false);
    return {
        liveLedger: {
            active: lastTodayLedgerActive,
            settled: lastLedgerSettled,
            customPricing,
            defaultSurface: 'ide',
        },
        cliDays,
        sourceFilter: calendarSourceFilter,
        metricMode: calendarMetricMode,
        periodMode: calendarPeriodMode,
        ...(calendarViewMode ? { viewMode: calendarViewMode } : {}),
        ...(calendarSelectedDate ? { selectedDate: calendarSelectedDate } : {}),
        currency: buildIdeCurrencyConfig(docSettings),
        subscription: buildIdeSubscriptionConfig(docSettings),
        customPricing,
        now: nowMs,
    };
}
function buildFallbackSnapshotForReport() {
    if (lastContextBreakdown) {
        return lastContextBreakdown;
    }
    return (0, context_breakdown_1.parseContextBreakdown)({
        model: lastUsage?.model,
        modelDisplayName: lastUsage?.modelDisplayName,
        effectiveBudgetTokens: lastUsage?.contextLimit,
        currentStepCount: lastUsage?.stepCount,
        previousUsedTokens: lastUsage?.contextUsed,
    });
}
function buildIdeQuotaSummaryLines() {
    if (lastIsCustomModelActive || lastConfigs.length === 0) {
        return [];
    }
    const lang = (0, i18n_1.getLanguage)();
    const groups = (0, monitor_overview_1.selectMonitorQuotaGroups)(lastConfigs, lastUsage?.model, lastQuotaSummary);
    return groups.map(group => {
        const pct = group.minimum !== null ? Math.round(group.minimum * 100) : 0;
        const rw = lastQuotaRunways
            ? ((group.pool && lastQuotaRunways[group.pool]) || lastQuotaRunways[group.key])
            : undefined;
        const runwayLabel = rw?.status === 'safe_until_reset'
            ? (0, i18n_core_1.t)('quota.safeBeforeReset', lang)
            : rw?.status === 'at_risk' && rw.estExhaustMs !== null
                ? `${(0, i18n_core_1.t)('quota.exhaustsIn', lang)} ${Math.max(1, Math.round(rw.estExhaustMs / 60_000))}m`
                : undefined;
        return {
            poolName: group.label,
            remainingPct: pct,
            resetCountdown: group.resetTime ? (0, reset_time_1.formatResetCountdown)(group.resetTime) : undefined,
            runwayLabel,
        };
    });
}
function cachePayload(p) {
    lastUsage = p.currentUsage;
    lastMonitorStatus = p.monitorStatus;
    lastAllUsages = p.allTrajectoryUsages;
    if (p.allTrajectories) {
        lastTrajectories = p.allTrajectories;
    }
    lastConfigs = p.modelConfigs;
    lastUserInfo = p.userInfo;
    if (p.workspaceUri) {
        lastWorkspaceUri = p.workspaceUri;
    }
    if (p.context) {
        extensionCtx = p.context;
    }
    if (p.activitySummary !== undefined) {
        lastActivitySummary = p.activitySummary;
    }
    if (p.gmSummary !== undefined) {
        lastGMSummary = p.gmSummary;
    }
    if (p.gmFullSummary !== undefined) {
        lastGMFullSummary = p.gmFullSummary;
    }
    if (p.gmConversations) {
        lastGMConversations = p.gmConversations;
    }
    if (p.pricingStore) {
        lastPricingStore = p.pricingStore;
    }
    if (p.dailyStore) {
        lastDailyStore = p.dailyStore;
    }
    if (p.storageDiagnostics) {
        lastStorageDiagnostics = p.storageDiagnostics;
    }
    if (p.accountSnapshots) {
        lastAccountSnapshots = p.accountSnapshots;
    }
    if (p.todayLedgerActive) {
        lastTodayLedgerActive = p.todayLedgerActive;
    }
    if (p.ledgerSettled) {
        lastLedgerSettled = p.ledgerSettled;
    }
    if (p.customPricing !== undefined) {
        lastCustomPricing = p.customPricing;
    }
    if (p.orchestratorSettings !== undefined) {
        lastOrchestratorSettings = p.orchestratorSettings;
    }
    if (p.quotaSummary !== undefined) {
        lastQuotaSummary = p.quotaSummary;
    }
    if ('todayCostUsd' in p) {
        lastTodayCostUsd = p.todayCostUsd;
    }
    if ('sessionCostUsd' in p) {
        lastSessionCostUsd = p.sessionCostUsd;
    }
    if ('contextBreakdown' in p) {
        lastContextBreakdown = p.contextBreakdown ?? null;
    }
    if ('turnDiagnostics' in p) {
        lastTurnDiagnostics = p.turnDiagnostics ?? null;
    }
    if ('quotaRunways' in p) {
        lastQuotaRunways = p.quotaRunways;
    }
    if ('isCustomModelActive' in p) {
        lastIsCustomModelActive = !!p.isCustomModelActive;
    }
    if ('staleState' in p) {
        lastStaleState = p.staleState ?? null;
    }
    if ('conversationOptions' in p) {
        lastConversationOptions = p.conversationOptions ?? [];
    }
    if ('activeConversationId' in p) {
        lastActiveConversationId = p.activeConversationId ?? null;
    }
    if ('pinnedConversationId' in p) {
        lastPinnedConversationId = p.pinnedConversationId ?? null;
    }
    if ('lockToMainAgent' in p) {
        lastLockToMainAgent = !!p.lockToMainAgent;
    }
    if ('cliDays' in p) {
        lastCliDays = p.cliDays;
    }
    if ('orchestratorPricingMode' in p) {
        lastOrchestratorPricingMode = p.orchestratorPricingMode;
    }
    if ('appSettings' in p) {
        lastAppSettings = p.appSettings;
    }
    if ('updateStatus' in p) {
        lastUpdateStatus = p.updateStatus ?? null;
    }
    if ('lowQuotaWarning' in p) {
        lastLowQuotaWarning = p.lowQuotaWarning;
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Show or reveal the WebView monitor panel.
 * Creates the panel on first call, reveals it on subsequent calls.
 */
function showMonitorPanel(p) {
    (0, extension_1.syncDurableStateFromDisk)(false);
    cachePayload(p);
    if (panel) {
        const wasVisible = panel.visible;
        if (p.initialTab) {
            pendingTab = { tab: p.initialTab, requestId: ++nextTabRequest };
        }
        panel.reveal(undefined, false);
        if (wasVisible) {
            sendPendingTab();
        }
        if (!isPaused) {
            postCurrentTabs();
        }
        return;
    }
    panel = vscode.window.createWebviewPanel('antigravityMonitor', `${(0, i18n_1.tBi)('Antigravity Monitor', 'Antigravity 监控面板')}`, { viewColumn: vscode.ViewColumn.Two, preserveFocus: false }, { enableScripts: true });
    panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.command === 'panelReady') {
            sendPendingTab();
            if (!isPaused) {
                postCurrentTabs();
            }
        }
        else if (msg.command === 'tabShown') {
            if (msg.requestId === pendingTab?.requestId) {
                pendingTab = undefined;
            }
        }
        else if (msg.command === 'switchLanguage' && extensionCtx) {
            if (!(0, i18n_1.isLanguage)(msg.lang)) {
                console.warn('[Antigravity Context Monitor] Ignoring invalid language switch request:', msg.lang);
                return;
            }
            await (0, i18n_1.setLanguage)(msg.lang, extensionCtx, panelDurableState);
            await (0, extension_1.flushDurableState)();
            refreshMonitorPanelLanguage();
            vscode.commands.executeCommand('antigravity-context-monitor.refresh');
        }
        else if (msg.command === 'refresh') {
            vscode.commands.executeCommand('antigravity-context-monitor.refresh');
        }
        else if (msg.command === 'togglePause') {
            isPaused = !isPaused;
            safePostMessage({ command: 'setPaused', paused: isPaused });
            if (!isPaused) {
                postCurrentTabs();
            }
        }
        else if (msg.command === 'toggleNativeHud') {
            // Expanded state is persisted in webview state; no host-side mutation required
            return;
        }
        else if (msg.command === 'selectConversation' || msg.command === 'pinConversation') {
            const rawTarget = msg.conversationId !== undefined ? msg.conversationId : msg.cascadeId;
            const targetId = typeof rawTarget === 'string' && rawTarget.trim() && rawTarget !== 'auto' && rawTarget !== '__auto__'
                ? rawTarget.trim()
                : null;
            lastPinnedConversationId = targetId;
            (0, extension_1.selectPinnedConversation)(targetId);
            vscode.commands.executeCommand('antigravity-context-monitor.refresh');
        }
        else if (msg.command === 'toggleLockMain' || msg.command === 'setLockToMainAgent') {
            const explicitLocked = typeof msg.locked === 'boolean'
                ? msg.locked
                : (typeof msg.value === 'boolean' ? msg.value : undefined);
            const nextLocked = (0, extension_1.setLockToMainAgent)(explicitLocked);
            lastLockToMainAgent = nextLocked;
            safePostMessage({ command: 'syncSettingsControls', lockToMainAgent: nextLocked });
            vscode.commands.executeCommand('antigravity-context-monitor.refresh');
        }
        else if (msg.command === 'copyContextReport') {
            const snapshot = buildFallbackSnapshotForReport();
            const text = (0, context_breakdown_1.formatContextTextReport)({
                snapshot,
                title: lastUsage?.title,
                workspacePath: lastWorkspaceUri || undefined,
                branchName: lastUsage?.branchName || undefined,
                cacheHitPct: lastTurnDiagnostics?.lastTurnCacheHitPct ?? lastTurnDiagnostics?.sessionCacheHitPct ?? null,
                turnStartKind: lastTurnDiagnostics?.lastTurnStartKind,
                quotaSummary: buildIdeQuotaSummaryLines(),
            }, (0, i18n_1.getLanguage)());
            await vscode.env.clipboard.writeText(text);
            safePostMessage({ command: 'copyActionResult', action: 'copyContextReport', ok: true });
        }
        else if (msg.command === 'copyHandoffPrompt') {
            const snapshot = buildFallbackSnapshotForReport();
            const activeTools = lastGMSummary?.toolCallCounts
                ? Object.entries(lastGMSummary.toolCallCounts)
                    .filter(([, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([name]) => name)
                : [];
            const text = (0, context_breakdown_1.formatHandoffPrompt)({
                snapshot,
                title: lastUsage?.title,
                workspacePath: lastWorkspaceUri || undefined,
                branchName: lastUsage?.branchName || undefined,
                model: lastUsage?.model,
                modelDisplayName: lastUsage?.modelDisplayName,
                activeTools,
            }, (0, i18n_1.getLanguage)());
            await vscode.env.clipboard.writeText(text);
            safePostMessage({ command: 'copyActionResult', action: 'copyHandoffPrompt', ok: true });
        }
        else if (msg.command === 'setOrchestratorPricingMode') {
            const rawMode = msg.mode !== undefined ? msg.mode : msg.value;
            if (rawMode === 'mapped' || rawMode === 'strict') {
                const mode = (0, pricing_store_1.normalizeOrchestratorPricingMode)(rawMode);
                await (0, extension_1.setSharedOrchestratorPricingMode)(mode);
                lastOrchestratorPricingMode = mode;
                lastAppSettings = (0, extension_1.getSharedAppSettings)();
                if (panel) {
                    safePostMessage({ command: 'configSaved', key: 'orchestratorPricingMode' });
                    postSettingsControlSync();
                    postCurrentTabs();
                }
            }
        }
        else if (msg.command === 'setAppSetting' && msg.key) {
            const res = await (0, extension_1.updateSharedAppSetting)(msg.key, msg.value);
            if (res.ok) {
                lastAppSettings = (0, extension_1.getSharedAppSettings)();
                lastOrchestratorPricingMode = lastAppSettings.orchestratorPricingMode;
                const isOverlayToggle = res.normalizedKey === 'appComposerRingEnabled' || res.normalizedKey === 'appTopBarEnabled';
                if (isOverlayToggle) {
                    const composerOn = Boolean(lastAppSettings.appComposerRingEnabled);
                    const topBarOn = Boolean(lastAppSettings.appTopBarEnabled);
                    if (!composerOn && !topBarOn) {
                        lastCdpStatus = {
                            state: 'disabled',
                            diagnosticCode: 'disabled',
                            composerEnabled: false,
                            topBarEnabled: false,
                            launcherStatus: cdpLauncher.inspectCdpLauncher({ env: process.env }),
                            platformGuide: (0, cdp_injector_1.getCdpPlatformGuide)(process.platform),
                        };
                    }
                    else {
                        const probed = await probeIdeCdpStatus(composerOn, topBarOn);
                        const latestApp = (0, extension_1.getSharedAppSettings)();
                        const latestComposerOn = Boolean(latestApp.appComposerRingEnabled);
                        const latestTopBarOn = Boolean(latestApp.appTopBarEnabled);
                        lastAppSettings = latestApp;
                        if (!latestComposerOn && !latestTopBarOn) {
                            lastCdpStatus = {
                                state: 'disabled',
                                diagnosticCode: 'disabled',
                                composerEnabled: false,
                                topBarEnabled: false,
                                launcherStatus: cdpLauncher.inspectCdpLauncher({ env: process.env }),
                                platformGuide: (0, cdp_injector_1.getCdpPlatformGuide)(process.platform),
                            };
                        }
                        else {
                            lastCdpStatus = {
                                ...probed,
                                composerEnabled: latestComposerOn,
                                topBarEnabled: latestTopBarOn,
                            };
                        }
                    }
                }
                if (panel) {
                    safePostMessage({ command: 'configSaved', key: res.normalizedKey });
                    if (isOverlayToggle && lastCdpStatus) {
                        safePostMessage({
                            type: 'cdpStatusResult',
                            command: 'cdpStatusResult',
                            cdpStatus: lastCdpStatus,
                        });
                    }
                    postSettingsControlSync();
                    postCurrentTabs();
                }
            }
        }
        else if (msg.command === 'recheckCdp') {
            const docSettings = readIdeDocumentSettings();
            const cdpStatus = await probeIdeCdpStatus(Boolean(docSettings.appComposerRingEnabled), Boolean(docSettings.appTopBarEnabled));
            lastCdpStatus = cdpStatus;
            safePostMessage({
                type: 'cdpStatusResult',
                command: 'cdpStatusResult',
                cdpStatus,
            });
            if (panel) {
                postSettingsControlSync();
            }
        }
        else if (msg.command === 'setupCdpLauncher' || msg.command === 'removeCdpLauncher') {
            const launcherRes = msg.command === 'setupCdpLauncher'
                ? cdpLauncher.createCdpLauncher({ env: process.env })
                : cdpLauncher.removeCdpLauncher({ env: process.env });
            const docSettings = readIdeDocumentSettings();
            const probed = await probeIdeCdpStatus(Boolean(docSettings.appComposerRingEnabled), Boolean(docSettings.appTopBarEnabled));
            const cdpStatus = {
                ...probed,
                launcherStatus: launcherRes.status,
            };
            lastCdpStatus = cdpStatus;
            safePostMessage({
                type: 'cdpLauncherResult',
                command: 'cdpLauncherResult',
                action: msg.command,
                ok: launcherRes.ok,
                launcherStatus: launcherRes.status,
                messageEn: launcherRes.messageEn,
                messageZh: launcherRes.messageZh,
                ...(launcherRes.error ? { error: launcherRes.error } : {}),
                cdpStatus,
            });
            safePostMessage({
                type: 'cdpStatusResult',
                command: 'cdpStatusResult',
                cdpStatus,
            });
            if (panel) {
                postSettingsControlSync();
                postCurrentTabs();
            }
        }
        else if (msg.command === 'revealCdpLauncher') {
            const launcherRes = cdpLauncher.revealCdpLauncher({ env: process.env });
            const docSettings = readIdeDocumentSettings();
            const baseStatus = resolveEffectiveIdeCdpStatus(docSettings) ?? {
                state: 'disabled',
                diagnosticCode: 'disabled',
                composerEnabled: Boolean(docSettings.appComposerRingEnabled),
                topBarEnabled: Boolean(docSettings.appTopBarEnabled),
                platformGuide: (0, cdp_injector_1.getCdpPlatformGuide)(process.platform),
            };
            const cdpStatus = {
                ...baseStatus,
                launcherStatus: launcherRes.status,
            };
            lastCdpStatus = cdpStatus;
            safePostMessage({
                type: 'cdpLauncherResult',
                command: 'cdpLauncherResult',
                action: 'revealCdpLauncher',
                ok: launcherRes.ok,
                launcherStatus: launcherRes.status,
                messageEn: launcherRes.messageEn,
                messageZh: launcherRes.messageZh,
                ...(launcherRes.error ? { error: launcherRes.error } : {}),
                cdpStatus,
            });
            if (panel) {
                postSettingsControlSync();
            }
        }
        else if (msg.command === 'setPollingInterval' && typeof msg.value === 'number') {
            const val = Math.max(1, Math.min(60, msg.value));
            const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
            if (typeof cfg.update === 'function') {
                await cfg.update('pollingInterval', val, vscode.ConfigurationTarget?.Global);
            }
            await (0, extension_1.updateSharedAppSetting)('pollingInterval', val);
            if (panel) {
                safePostMessage({ command: 'configSaved', key: 'pollingInterval' });
            }
        }
        else if (msg.command === 'setConfig' && msg.key) {
            const allowedKeys = [
                'statusBar.tooltipDensity',
                'statusBar.showContext',
                'statusBar.showQuota',
                'statusBar.showResetCountdown',
                'statusBar.showAiCredits',
                'statusBar.showSpeed',
                'statusBar.showCacheHit',
                'statusBar.showSessionCost',
                'showModelInternalId',
                'quotaNotificationThreshold',
                'activity.maxRecentSteps',
                'activity.maxArchives',
            ];
            if (allowedKeys.includes(msg.key)) {
                const normalizedValue = sanitizeConfigValue(msg.key, msg.value);
                const cfg = vscode.workspace.getConfiguration('antigravityContextMonitor');
                if (typeof cfg.update === 'function') {
                    await cfg.update(msg.key, normalizedValue, vscode.ConfigurationTarget?.Global);
                }
                await (0, extension_1.updateSharedAppSetting)(msg.key, normalizedValue);
                if (panel) {
                    safePostMessage({ command: 'configSaved', key: msg.key });
                }
            }
        }
        else if (msg.command === 'checkForUpdates') {
            const res = await (0, extension_1.checkIdeReleaseUpdates)(msg.force !== false);
            lastUpdateStatus = (0, extension_1.getLastUpdateStatusView)();
            safePostMessage({
                type: 'updateCheckResult',
                command: 'updateCheckResult',
                status: res.status,
                currentVersion: res.currentVersion,
                latestVersion: res.latestVersion ?? lastUpdateStatus?.latestVersion ?? null,
                hasUpdate: Boolean(res.hasUpdate || (res.status === 'not_modified' && lastUpdateStatus?.hasUpdate)),
                updateAvailable: Boolean(res.hasUpdate || (res.status === 'not_modified' && lastUpdateStatus?.hasUpdate)),
                checkedAt: res.checkedAt,
                releaseUrl: res.releaseInfo?.releaseUrl ?? lastUpdateStatus?.releaseUrl ?? null,
                releaseNotesSummary: res.releaseInfo?.releaseNotesSummary ?? lastUpdateStatus?.releaseNotesSummary ?? null,
                openVsxUrl: extension_1.OPEN_VSX_EXTENSION_URL,
                updateStatus: lastUpdateStatus,
                error: res.error ?? null,
            });
            if (panel) {
                postSettingsControlSync();
                postCurrentTabs();
            }
        }
        else if (msg.command === 'applyPluginUpdate') {
            safePostMessage({
                type: 'pluginUpdateResult',
                command: 'pluginUpdateResult',
                ok: false,
                requiresReload: false,
                openVsxUrl: extension_1.OPEN_VSX_EXTENSION_URL,
                message: (0, i18n_1.tBi)('In Antigravity IDE, update the extension via Open VSX Marketplace (AGI-is-going-to-arrive.antigravity-context-monitor) or Extensions view.', '在 Antigravity IDE 中，请通过 Open VSX 商店（AGI-is-going-to-arrive.antigravity-context-monitor）或扩展面板更新扩展。'),
            });
        }
        else if (msg.command === 'openExternalUrl') {
            const safeUrl = (0, sidecar_runtime_1.validateExternalUrl)(msg.url);
            if (safeUrl && typeof vscode.env?.openExternal === 'function') {
                await vscode.env.openExternal(vscode.Uri.parse(safeUrl));
            }
        }
        else if (msg.command === 'setAccountBillingDay' && msg.email && typeof msg.day === 'number') {
            const saved = (0, extension_1.setAccountBillingDay)(msg.email, msg.day);
            await (0, extension_1.flushDurableState)();
            if (saved && panel) {
                safePostMessage({ command: 'configSaved', key: 'accountBillingDay' });
            }
        }
        else if (msg.command === 'copyStatePath' && lastStorageDiagnostics?.stateFilePath) {
            await vscode.env.clipboard.writeText(lastStorageDiagnostics.stateFilePath);
            safePostMessage({ command: 'configSaved', key: 'statePath' });
        }
        else if (msg.command === 'copyText' && typeof msg.text === 'string' && msg.text.length <= 4096) {
            await vscode.env.clipboard.writeText(msg.text);
            safePostMessage({ command: 'copyActionResult', action: 'copyText', ok: true });
        }
        else if (msg.command === 'openStateFile' && lastStorageDiagnostics?.stateFilePath) {
            const uri = vscode.Uri.file(lastStorageDiagnostics.stateFilePath);
            const stat = await vscode.workspace.fs.stat(uri).then(result => result, () => null);
            if (!stat) {
                const warning = (0, i18n_1.tBi)('State file has not been created yet.', '状态文件尚未生成。');
                void vscode.window.showWarningMessage(warning);
                safePostMessage({ command: 'stateFileActionResult', action: 'open', ok: false, message: warning });
                return;
            }
            const decision = await confirmLargeStateFileOpen(typeof stat.size === 'number' ? stat.size : 0);
            if (decision === 'cancel') {
                safePostMessage({
                    command: 'stateFileActionResult',
                    action: 'open',
                    ok: false,
                    message: (0, i18n_1.tBi)('Open cancelled.', '已取消打开。'),
                });
                return;
            }
            if (decision === 'reveal') {
                try {
                    await vscode.commands.executeCommand('revealFileInOS', uri);
                    safePostMessage({ command: 'stateFileActionResult', action: 'reveal', ok: true });
                }
                catch (err) {
                    reportStateFileError('reveal', err);
                }
                return;
            }
            try {
                await openUriInEditor(uri);
                safePostMessage({ command: 'stateFileActionResult', action: 'open', ok: true });
            }
            catch (err) {
                reportStateFileError('open', err);
            }
        }
        else if (msg.command === 'revealStateFile' && lastStorageDiagnostics?.stateFilePath) {
            const uri = vscode.Uri.file(lastStorageDiagnostics.stateFilePath);
            const exists = await vscode.workspace.fs.stat(uri).then(() => true, () => false);
            const target = exists ? uri : vscode.Uri.file(path.dirname(lastStorageDiagnostics.stateFilePath));
            try {
                await vscode.commands.executeCommand('revealFileInOS', target);
                safePostMessage({ command: 'stateFileActionResult', action: 'reveal', ok: true });
            }
            catch (err) {
                reportStateFileError('reveal', err);
            }
        }
        else if (msg.command === 'historyAction' && msg.action) {
            if (msg.action === 'workspace') {
                await revealUriOrParent(workspaceTargetFromUri(msg.uri || ''));
            }
            else if ((msg.action === 'record' || msg.action === 'pb') && msg.cascadeId && SAFE_CASCADE_ID_RE.test(msg.cascadeId.trim())) {
                await revealUriOrParent(getConversationTarget(msg.cascadeId.trim(), msg.action));
            }
        }
        else if (msg.command === 'setPanelPref' && msg.key && ['panelShowTabScrollHint', 'panelShowScrollbar', 'panelShowEndOfContent'].includes(msg.key)) {
            if (panelDurableState) {
                await panelDurableState.update(msg.key, !!msg.value);
                await (0, extension_1.flushDurableState)();
            }
            safePostMessage({ command: 'panelPrefUpdated', key: msg.key, value: !!msg.value });
            safePostMessage({ command: 'configSaved', key: msg.key });
        }
        else if (msg.command === 'setZoomLevel' && typeof msg.value === 'number') {
            const zoom = clamp(Math.round(msg.value), 50, 200);
            if (panelDurableState) {
                await panelDurableState.update('panelZoomLevel', zoom);
                await (0, extension_1.flushDurableState)();
            }
        }
        else if ((msg.command === 'savePricing' || msg.command === 'saveCustomPricing') && lastPricingStore) {
            const rawRec = msg;
            const data = (rawRec.overrides ?? rawRec.value);
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                lastPricingStore.setAll(data).then(async () => {
                    await (0, extension_1.flushDurableState)();
                    lastCustomPricing = lastPricingStore.getCustom();
                    refreshLocalStorageDiagnostics();
                    (0, extension_1.refreshStatusBarTelemetry)();
                    if (panel) {
                        panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
                        safePostMessage({ command: 'pricingSaved' });
                    }
                });
            }
        }
        else if ((msg.command === 'resetPricing' || msg.command === 'resetCustomPricing') && lastPricingStore) {
            lastPricingStore.reset().then(async () => {
                await (0, extension_1.flushDurableState)();
                lastCustomPricing = lastPricingStore.getCustom();
                refreshLocalStorageDiagnostics();
                (0, extension_1.refreshStatusBarTelemetry)();
                if (panel) {
                    panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
                    safePostMessage({ command: 'pricingReset' });
                }
            });
        }
        else if (msg.command === 'calendarFilterSource') {
            const rawSrc = msg.source !== undefined ? msg.source : msg.value;
            if (rawSrc === 'all' || rawSrc === 'app' || rawSrc === 'ide' || rawSrc === 'cli') {
                calendarSourceFilter = rawSrc;
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarSetMetric') {
            const rawMet = msg.metric !== undefined ? msg.metric : msg.value;
            if (rawMet === 'tokens' || rawMet === 'cost') {
                calendarMetricMode = rawMet;
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarSetPeriod') {
            const rawPer = msg.period !== undefined ? msg.period : msg.value;
            if (rawPer === 'daily' || rawPer === 'weekly' || rawPer === 'monthly' || rawPer === 'year' || rawPer === 'all') {
                calendarPeriodMode = rawPer;
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarSetView') {
            const rawView = msg.view !== undefined ? msg.view : msg.value;
            if (rawView === '' || rawView === null || rawView === undefined || rawView === 'both') {
                calendarViewMode = undefined;
                postCurrentTabs();
            }
            else if (rawView === 'heatmap' || rawView === 'monthGrid') {
                calendarViewMode = rawView;
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarSelectDate') {
            const rawDate = msg.date;
            if (rawDate === null || rawDate === undefined || rawDate === '') {
                calendarSelectedDate = '';
                postCurrentTabs();
            }
            else if (typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) {
                calendarSelectedDate = rawDate.trim();
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarJumpDate') {
            const rawDate = typeof msg.date === 'string' ? msg.date.trim() : '';
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                const parts = rawDate.split('-');
                const yr = Number(msg.year ?? parts[0]);
                const mo = Number(msg.month ?? parts[1]);
                if (Number.isInteger(yr) && yr >= 2020 && yr <= 2100 && Number.isInteger(mo) && mo >= 1 && mo <= 12) {
                    calendarYear = yr;
                    calendarMonth = mo;
                }
                calendarSelectedDate = rawDate;
                calendarPeriodMode = 'daily';
                postCurrentTabs();
            }
        }
        else if (msg.command === 'calendarExportCsv' || msg.command === 'calendarExportJson') {
            const isCsv = msg.command === 'calendarExportCsv';
            const docSettings = readIdeDocumentSettings();
            const nowMs = Date.now();
            const bundle = (0, webview_calendar_tab_1.buildCalendarExportData)(lastDailyStore, calendarYear, calendarMonth, buildIdeCalendarOptions(docSettings, nowMs));
            const dateStamp = (0, daily_archival_1.toLocalDateKey)(new Date(nowMs));
            const ext = isCsv ? 'csv' : 'json';
            const filename = `antigravity-usage-${calendarSourceFilter}-${calendarPeriodMode}-${dateStamp}.${ext}`;
            const content = isCsv ? bundle.csv : bundle.json;
            if (typeof vscode.window.showSaveDialog === 'function') {
                const targetUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(os.homedir(), filename)),
                    filters: isCsv ? { CSV: ['csv'] } : { JSON: ['json'] },
                });
                if (targetUri) {
                    if (typeof vscode.workspace.fs?.writeFile === 'function') {
                        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
                    }
                    else if (targetUri.fsPath) {
                        await fs.promises.writeFile(targetUri.fsPath, content, 'utf8');
                    }
                    void vscode.window.showInformationMessage((0, i18n_1.tBi)(`Exported usage history to ${targetUri.fsPath || filename}`, `已导出用量记录到 ${targetUri.fsPath || filename}`));
                }
            }
        }
        else if (msg.command === 'clearCalendarHistory' && lastDailyStore) {
            lastDailyStore.clear();
            calendarSelectedDate = '';
            await (0, extension_1.flushDurableState)();
            refreshLocalStorageDiagnostics();
            if (panel) {
                panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
            }
        }
        else if (msg.command === 'switchCalendarMonth' && typeof msg.year === 'number') {
            calendarYear = msg.year;
            calendarMonth = msg.month;
            if (panel) {
                panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
            }
        }
        else if ((msg.command === 'removeAccount' || msg.command === 'removeAccountSnapshot') && typeof msg.email === 'string') {
            const email = msg.email;
            const updated = (0, extension_1.removeAccountSnapshot)(email);
            await (0, extension_1.flushDurableState)();
            lastAccountSnapshots = updated;
            if (panel) {
                panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
            }
        }
        else if (msg.command === 'clearToolCatalog') {
            await vscode.commands.executeCommand('antigravity-context-monitor.clearToolCatalog');
            if (panel) {
                panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
            }
        }
    });
    panel.onDidChangeViewState((e) => {
        if (e.webviewPanel.visible) {
            (0, extension_1.syncDurableStateFromDisk)(false);
            sendPendingTab();
            if (!isPaused) {
                postCurrentTabs();
            }
        }
    });
    panel.onDidDispose(() => {
        clearDisposedPanel();
    });
    panel.webview.html = buildHtml(p.currentUsage, p.allTrajectoryUsages, p.modelConfigs, p.userInfo, isPaused, p.initialTab);
}
function sendPendingTab() {
    if (pendingTab) {
        safePostMessage({ command: 'switchToTab', ...pendingTab });
    }
}
function refreshMonitorPanelLanguage() {
    if (!panel) {
        return;
    }
    panel.title = (0, i18n_1.tBi)('Antigravity Monitor', 'Antigravity 监控面板');
    panel.webview.html = buildHtml(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
}
/**
 * Silently update the panel if it is already visible.
 * Does NOT steal focus or create a new panel.
 * When paused, data is cached but the panel is NOT re-rendered.
 */
function updateMonitorPanel(p) {
    cachePayload(p);
    if (panel?.visible && !isPaused) {
        postCurrentTabs();
    }
}
function getExtensionVersion() {
    const raw = extensionCtx?.extension?.packageJSON?.version;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}
async function probeIdeCdpStatus(composerEnabled, topBarEnabled) {
    const platformGuide = (0, cdp_injector_1.getCdpPlatformGuide)(process.platform);
    const launcherStatus = cdpLauncher.inspectCdpLauncher({ env: process.env });
    if (!composerEnabled && !topBarEnabled) {
        return {
            state: 'disabled',
            diagnosticCode: 'disabled',
            composerEnabled: false,
            topBarEnabled: false,
            launcherStatus,
            platformGuide,
        };
    }
    const portInfo = (0, cdp_injector_1.discoverDevToolsActivePort)({ platform: process.platform, env: process.env });
    if (!portInfo) {
        return {
            state: 'cdp_unavailable',
            diagnosticCode: 'missing_port_file',
            portFilePath: (0, cdp_injector_1.resolveDevToolsActivePortPaths)({ platform: process.platform, env: process.env })[0],
            composerEnabled,
            topBarEnabled,
            launcherStatus,
            platformGuide,
        };
    }
    let targets;
    try {
        targets = await (0, cdp_injector_1.fetchCdpTargets)(portInfo.port, 2_500);
    }
    catch (err) {
        return {
            state: 'cdp_unavailable',
            diagnosticCode: 'port_unreachable',
            portFilePath: portInfo.filePath,
            discoveredPort: portInfo.port,
            composerEnabled,
            topBarEnabled,
            errorMessage: err instanceof Error ? err.message : String(err),
            launcherStatus,
            platformGuide,
        };
    }
    const hubTarget = (0, cdp_injector_1.selectAntigravityHubTarget)(targets, { env: process.env });
    if (!hubTarget || !hubTarget.webSocketDebuggerUrl) {
        return {
            state: 'cdp_unavailable',
            diagnosticCode: 'no_hub_target',
            portFilePath: portInfo.filePath,
            discoveredPort: portInfo.port,
            composerEnabled,
            topBarEnabled,
            errorMessage: 'No Antigravity Hub target page found on CDP port',
            launcherStatus,
            platformGuide,
        };
    }
    return {
        state: 'connected',
        diagnosticCode: 'connected',
        portFilePath: portInfo.filePath,
        discoveredPort: portInfo.port,
        targetUrl: hubTarget.url,
        targetTitle: hubTarget.title,
        composerEnabled,
        topBarEnabled,
        launcherStatus,
        platformGuide,
    };
}
function resolveEffectiveIdeCdpStatus(docSettings) {
    const composerEnabled = Boolean(docSettings.appComposerRingEnabled);
    const topBarEnabled = Boolean(docSettings.appTopBarEnabled);
    const launcherStatus = lastCdpStatus?.launcherStatus ?? cdpLauncher.inspectCdpLauncher({ env: process.env });
    if (!composerEnabled && !topBarEnabled) {
        return {
            ...(lastCdpStatus ?? { platformGuide: (0, cdp_injector_1.getCdpPlatformGuide)(process.platform) }),
            state: 'disabled',
            diagnosticCode: 'disabled',
            composerEnabled: false,
            topBarEnabled: false,
            launcherStatus,
        };
    }
    if (!lastCdpStatus || lastCdpStatus.state === 'disabled') {
        return {
            state: 'cdp_unavailable',
            diagnosticCode: 'missing_port_file',
            composerEnabled,
            topBarEnabled,
            launcherStatus,
            platformGuide: (0, cdp_injector_1.getCdpPlatformGuide)(process.platform),
        };
    }
    return {
        ...lastCdpStatus,
        composerEnabled,
        topBarEnabled,
        launcherStatus,
    };
}
function postSettingsControlSync() {
    if (!panel) {
        return;
    }
    const docSettings = readIdeDocumentSettings();
    const effectiveUpdateStatus = lastUpdateStatus ?? (0, extension_1.getLastUpdateStatusView)();
    const effectiveCdpStatus = resolveEffectiveIdeCdpStatus(docSettings);
    safePostMessage({
        command: 'syncSettingsControls',
        pollingInterval: docSettings.pollingInterval,
        quotaNotificationThreshold: docSettings.quotaNotificationThreshold,
        showContext: docSettings.showContext,
        showQuota: docSettings.showQuota,
        showResetCountdown: docSettings.showResetCountdown,
        showAiCredits: docSettings.showAiCredits,
        showSpeed: docSettings.showSpeed,
        showCacheHit: docSettings.showCacheHit,
        showSessionCost: docSettings.showSessionCost,
        showModelInternalId: docSettings.showModelInternalId,
        lockToMainAgent: docSettings.lockToMainAgent,
        tooltipDensity: docSettings.tooltipDensity,
        appComposerRingEnabled: docSettings.appComposerRingEnabled,
        appTopBarEnabled: docSettings.appTopBarEnabled,
        showNativeHudBar: docSettings.showNativeHudBar,
        autoCheckUpdates: docSettings.autoCheckUpdates,
        orchestratorPricingMode: docSettings.orchestratorPricingMode,
        displayCurrency: docSettings.displayCurrency,
        customFxRate: docSettings.customFxRate,
        subscriptionPlan: docSettings.subscriptionPlan,
        subscriptionMonthlyFee: docSettings.subscriptionMonthlyFee,
        subscriptionCurrency: docSettings.subscriptionCurrency,
        calendarRetentionDays: docSettings.calendarRetentionDays,
        activityMaxRecentSteps: docSettings.activityMaxRecentSteps,
        activityMaxArchives: docSettings.activityMaxArchives,
        ...(effectiveCdpStatus ? { cdpStatus: effectiveCdpStatus } : {}),
        ...(effectiveUpdateStatus ? { updateStatus: effectiveUpdateStatus } : {}),
    });
}
/**
 * Sync live VS Code settings changes (e.g. external Settings JSON/UI edits) into
 * the open WebView's Settings controls and optionally force-refresh all tabs
 * even when auto-refresh is paused.
 */
function syncMonitorPanelSettings(forceRefreshTabs = false) {
    if (!panel) {
        return;
    }
    postSettingsControlSync();
    if (forceRefreshTabs) {
        postCurrentTabs();
    }
}
function makeDocumentParams(usage, allUsages, configs, userInfo, paused = false, initialTab) {
    const docSettings = readIdeDocumentSettings();
    const hydrated = (0, extension_1.isSharedAppSettingsHydrated)();
    const shared = (0, extension_1.getSharedAppSettings)();
    const effectiveAppSettings = hydrated
        ? {
            ...shared,
            showNativeHudBar: docSettings.showNativeHudBar,
            orchestratorPricingMode: docSettings.orchestratorPricingMode,
            displayCurrency: docSettings.displayCurrency,
            customFxRate: docSettings.customFxRate,
            subscriptionPlan: docSettings.subscriptionPlan,
            subscriptionMonthlyFee: docSettings.subscriptionMonthlyFee,
            subscriptionCurrency: docSettings.subscriptionCurrency,
            calendarRetentionDays: docSettings.calendarRetentionDays,
            autoCheckUpdates: docSettings.autoCheckUpdates,
            activityMaxRecentSteps: docSettings.activityMaxRecentSteps,
            activityMaxArchives: docSettings.activityMaxArchives,
        }
        : {
            ...shared,
            ...(lastAppSettings ?? {}),
            showNativeHudBar: lastAppSettings?.showNativeHudBar ?? docSettings.showNativeHudBar,
            orchestratorPricingMode: lastAppSettings?.orchestratorPricingMode ?? docSettings.orchestratorPricingMode,
            displayCurrency: lastAppSettings?.displayCurrency ?? docSettings.displayCurrency,
            customFxRate: lastAppSettings?.customFxRate !== undefined ? lastAppSettings.customFxRate : docSettings.customFxRate,
            subscriptionPlan: lastAppSettings?.subscriptionPlan ?? docSettings.subscriptionPlan,
            subscriptionMonthlyFee: lastAppSettings?.subscriptionMonthlyFee !== undefined ? lastAppSettings.subscriptionMonthlyFee : docSettings.subscriptionMonthlyFee,
            subscriptionCurrency: lastAppSettings?.subscriptionCurrency ?? docSettings.subscriptionCurrency,
            calendarRetentionDays: lastAppSettings?.calendarRetentionDays ?? docSettings.calendarRetentionDays,
            autoCheckUpdates: lastAppSettings?.autoCheckUpdates ?? docSettings.autoCheckUpdates,
            activityMaxRecentSteps: lastAppSettings?.activityMaxRecentSteps ?? docSettings.activityMaxRecentSteps,
            activityMaxArchives: lastAppSettings?.activityMaxArchives ?? docSettings.activityMaxArchives,
        };
    const effectiveOrchMode = hydrated
        ? (docSettings.orchestratorPricingMode ?? 'mapped')
        : (lastOrchestratorPricingMode ?? docSettings.orchestratorPricingMode ?? 'mapped');
    const effectiveUpdateStatus = lastUpdateStatus ?? (0, extension_1.getLastUpdateStatusView)();
    const effectiveCdpStatus = resolveEffectiveIdeCdpStatus(docSettings);
    return {
        surface: 'ide',
        version: getExtensionVersion(),
        currentUsage: usage,
        monitorStatus: lastMonitorStatus,
        allTrajectoryUsages: allUsages,
        allTrajectories: lastTrajectories,
        modelConfigs: configs,
        userInfo,
        workspaceUri: lastWorkspaceUri,
        activitySummary: lastActivitySummary,
        gmSummary: lastGMSummary,
        gmFullSummary: lastGMFullSummary,
        gmConversations: lastGMConversations,
        pricingStore: lastPricingStore,
        customPricing: lastPricingStore?.getCustom() ?? lastCustomPricing,
        dailyStore: lastDailyStore,
        storageDiagnostics: lastStorageDiagnostics,
        panelHintPrefs: getPanelHintPreferences(),
        zoomLevel: panelDurableState?.get('panelZoomLevel', 100) ?? 100,
        accountSnapshots: lastAccountSnapshots,
        billingDays: (0, extension_1.getBillingDaysMap)(),
        todayLedgerActive: lastTodayLedgerActive,
        ledgerSettled: lastLedgerSettled,
        orchestratorSettings: lastOrchestratorSettings,
        quotaSummary: lastQuotaSummary,
        todayCostUsd: lastTodayCostUsd,
        sessionCostUsd: lastSessionCostUsd,
        calendarYear,
        calendarMonth,
        calendarOptions: buildIdeCalendarOptions(docSettings),
        orchestratorPricingMode: effectiveOrchMode,
        appSettings: effectiveAppSettings,
        ...(effectiveCdpStatus ? { cdpStatus: effectiveCdpStatus } : {}),
        updateStatus: effectiveUpdateStatus,
        ...(lastLowQuotaWarning !== undefined ? { lowQuotaWarning: lastLowQuotaWarning } : {}),
        paused,
        initialTab,
        settings: docSettings,
        contextBreakdown: lastContextBreakdown,
        turnDiagnostics: lastTurnDiagnostics,
        quotaRunways: lastQuotaRunways,
        isCustomModelActive: lastIsCustomModelActive,
        staleState: lastStaleState,
        conversationOptions: lastConversationOptions,
        activeConversationId: lastActiveConversationId ?? usage?.cascadeId ?? null,
        pinnedConversationId: lastPinnedConversationId,
        lockToMainAgent: lastLockToMainAgent,
    };
}
function postCurrentTabs() {
    if (!panel) {
        return;
    }
    const params = makeDocumentParams(lastUsage, lastAllUsages, lastConfigs, lastUserInfo, isPaused);
    safePostMessage({
        command: 'updateTabs',
        tabs: (0, webview_document_1.buildMonitorTabsPayload)(params),
        time: (0, i18n_1.formatClockTime)(new Date(), (0, i18n_1.getLanguage)()),
        ...(params.cdpStatus ? { cdpStatus: params.cdpStatus } : {}),
        ...(params.updateStatus ? { updateStatus: params.updateStatus } : {}),
    });
}
/** Whether the monitor panel is currently open. */
function isMonitorPanelVisible() {
    return panel !== undefined;
}
// ─── HTML Builder (delegates directly to pure webview-document.ts) ───────────
function buildHtml(usage, allUsages, configs, userInfo, paused = false, initialTab) {
    return (0, webview_document_1.buildMonitorDocumentHtml)(makeDocumentParams(usage, allUsages, configs, userInfo, paused, initialTab));
}
//# sourceMappingURL=webview-panel.js.map