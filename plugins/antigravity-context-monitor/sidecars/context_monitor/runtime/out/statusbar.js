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
exports.StatusBarManager = exports.SECTION_FULL_MAX_LINES = exports.SECTION_NORMAL_MAX_LINES = exports.SECTION_COMPACT_MAX_LINES = exports.NORMAL_MAX_LINES = exports.COMPACT_MAX_LINES = exports.NORMAL_MAX_QUOTA_ROWS = exports.COMPACT_MAX_QUOTA_ROWS = exports.renderHoverSections = exports.applySectionBudget = exports.getSectionLineBudget = exports.truncateByDisplayWidth = exports.parseTooltipDensity = exports.ensureCtaLast = exports.applyLineBudget = exports.getLineBudget = exports.getMaxQuotaRows = exports.selectQuotaRows = exports.resolveEffectiveMode = exports.computeOrchestratorSplit = exports.calculateCompressionStats = void 0;
exports.formatTokenCount = formatTokenCount;
exports.formatContextLimit = formatContextLimit;
exports.buildUnicodeGauge = buildUnicodeGauge;
exports.escapeMarkdown = escapeMarkdown;
exports.setTooltipDiagLogger = setTooltipDiagLogger;
exports.resetTooltipDensityDiag = resetTooltipDensityDiag;
const vscode = __importStar(require("vscode"));
const tracker_1 = require("./tracker");
const orchestrator_attribution_1 = require("./orchestrator-attribution");
Object.defineProperty(exports, "computeOrchestratorSplit", { enumerable: true, get: function () { return orchestrator_attribution_1.computeOrchestratorSplit; } });
const pricing_store_1 = require("./pricing-store");
const models_1 = require("./models");
const i18n_1 = require("./i18n");
const model_quota_1 = require("./model-quota");
const reset_time_1 = require("./reset-time");
const billing_day_1 = require("./billing-day");
const telemetry_metrics_1 = require("./telemetry-metrics");
const tooltip_budget_1 = require("./tooltip-budget");
const monitor_overview_1 = require("./monitor-overview");
const webview_overview_tab_1 = require("./webview-overview-tab");
Object.defineProperty(exports, "calculateCompressionStats", { enumerable: true, get: function () { return webview_overview_tab_1.calculateCompressionStats; } });
// Re-export pure helpers for tests / external callers
var tooltip_budget_2 = require("./tooltip-budget");
Object.defineProperty(exports, "resolveEffectiveMode", { enumerable: true, get: function () { return tooltip_budget_2.resolveEffectiveMode; } });
Object.defineProperty(exports, "selectQuotaRows", { enumerable: true, get: function () { return tooltip_budget_2.selectQuotaRows; } });
Object.defineProperty(exports, "getMaxQuotaRows", { enumerable: true, get: function () { return tooltip_budget_2.getMaxQuotaRows; } });
Object.defineProperty(exports, "getLineBudget", { enumerable: true, get: function () { return tooltip_budget_2.getLineBudget; } });
Object.defineProperty(exports, "applyLineBudget", { enumerable: true, get: function () { return tooltip_budget_2.applyLineBudget; } });
Object.defineProperty(exports, "ensureCtaLast", { enumerable: true, get: function () { return tooltip_budget_2.ensureCtaLast; } });
Object.defineProperty(exports, "parseTooltipDensity", { enumerable: true, get: function () { return tooltip_budget_2.parseTooltipDensity; } });
Object.defineProperty(exports, "truncateByDisplayWidth", { enumerable: true, get: function () { return tooltip_budget_2.truncateByDisplayWidth; } });
Object.defineProperty(exports, "getSectionLineBudget", { enumerable: true, get: function () { return tooltip_budget_2.getSectionLineBudget; } });
Object.defineProperty(exports, "applySectionBudget", { enumerable: true, get: function () { return tooltip_budget_2.applySectionBudget; } });
Object.defineProperty(exports, "renderHoverSections", { enumerable: true, get: function () { return tooltip_budget_2.renderHoverSections; } });
Object.defineProperty(exports, "COMPACT_MAX_QUOTA_ROWS", { enumerable: true, get: function () { return tooltip_budget_2.COMPACT_MAX_QUOTA_ROWS; } });
Object.defineProperty(exports, "NORMAL_MAX_QUOTA_ROWS", { enumerable: true, get: function () { return tooltip_budget_2.NORMAL_MAX_QUOTA_ROWS; } });
Object.defineProperty(exports, "COMPACT_MAX_LINES", { enumerable: true, get: function () { return tooltip_budget_2.COMPACT_MAX_LINES; } });
Object.defineProperty(exports, "NORMAL_MAX_LINES", { enumerable: true, get: function () { return tooltip_budget_2.NORMAL_MAX_LINES; } });
Object.defineProperty(exports, "SECTION_COMPACT_MAX_LINES", { enumerable: true, get: function () { return tooltip_budget_2.SECTION_COMPACT_MAX_LINES; } });
Object.defineProperty(exports, "SECTION_NORMAL_MAX_LINES", { enumerable: true, get: function () { return tooltip_budget_2.SECTION_NORMAL_MAX_LINES; } });
Object.defineProperty(exports, "SECTION_FULL_MAX_LINES", { enumerable: true, get: function () { return tooltip_budget_2.SECTION_FULL_MAX_LINES; } });
const REFRESH_COMMAND = 'antigravity-context-monitor.refresh';
// ─── Token & Gauge Formatting ─────────────────────────────────────────────────
/**
 * Format a token count for display (e.g. 45231 → "45.2k", 1500000 → "1.5M").
 */
function formatTokenCount(count) {
    return formatTokenValue(count);
}
/**
 * Format a context limit for display (e.g. 2000000 → "2M").
 */
function formatContextLimit(limit) {
    return formatTokenValue(limit);
}
function formatTokenValue(value) {
    const safe = Math.max(0, value);
    if (safe >= 1_000_000) {
        return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (safe >= 1_000) {
        return `${(safe / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return safe.toString();
}
/**
 * Build a theme-neutral Unicode capsule progress meter (crisp in Dark, Light, and High Contrast).
 */
function buildUnicodeGauge(percent, slots = 8) {
    const clampedSlots = Math.max(2, Math.floor(slots));
    if (!Number.isFinite(percent)) {
        return '▱'.repeat(clampedSlots);
    }
    const clampedPct = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clampedPct / 100) * clampedSlots);
    return '▰'.repeat(filled) + '▱'.repeat(clampedSlots - filled);
}
/**
 * Escape Markdown special characters in dynamic content to prevent
 * broken rendering in VS Code tooltip MarkdownStrings.
 */
function escapeMarkdown(text) {
    return text.replace(/[\x00-\x1F\x7F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g, ' ').replace(/[&|*_~`\[\]\\#<>!$()]/g, '\\$&');
}
function normalizeHoverLine(text) {
    return text.replace(/[\x00-\x1F\x7F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function formatHoverText(text, maxWidth) {
    return escapeMarkdown((0, tooltip_budget_1.truncateByDisplayWidth)(normalizeHoverLine(text), maxWidth));
}
function formatInlineCode(text, maxWidth) {
    const safe = (0, tooltip_budget_1.truncateByDisplayWidth)(normalizeHoverLine(text), maxWidth).replace(/`/g, "'").replace(/\|/g, '/');
    return `\`${safe}\``;
}
function resolveConfiguredDensity(value) {
    if (value === 'detailed') {
        return 'full';
    }
    return (0, tooltip_budget_1.parseTooltipDensity)(value);
}
function monitorStateIcon(state) {
    switch (state) {
        case 'connecting': return '$(sync~spin)';
        case 'disconnected': return '$(debug-disconnect)';
        case 'empty': return '$(comment-discussion)';
        case 'idle': return '$(clock)';
        case 'active': return '$(pulse)';
    }
}
function hasTelemetryReading(agg) {
    return agg.totalCalls > 0 && ((agg.latestGenTokPerSec ?? agg.weightedGenTokPerSec) !== null
        || (agg.avgTtftSeconds ?? agg.latestTtftSeconds) !== null
        || agg.tokenCacheHitRate !== null);
}
function validQuotaFraction(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
        ? value
        : null;
}
function validResetTimestamp(iso) {
    const parsed = (0, tracker_1.parseStrictResetTimestamp)(iso);
    return parsed !== null && parsed > 0 ? parsed : null;
}
function formatSignedPercentDelta(deltaPct) {
    if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
        return '';
    }
    const rounded = Math.round(deltaPct);
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return `${normalized > 0 ? '+' : ''}${normalized}%`;
}
function formatCacheWarmthShort(state) {
    switch (state) {
        case 'warm': return (0, i18n_1.t)('telemetry.cacheState.warm');
        case 'warming': return (0, i18n_1.t)('telemetry.cacheState.warming');
        case 'cold': return (0, i18n_1.t)('telemetry.cacheState.cold');
        default: return '';
    }
}
function buildLatestCallSnapshot(call, customPricing) {
    const modelLabel = call.responseModel
        || (0, models_1.normalizeModelDisplayName)(call.modelDisplay || call.model)
        || call.model
        || '—';
    const rawModel = call.model || call.responseModel || call.modelDisplay || '';
    const pricingModel = (0, pricing_store_1.selectPricingModel)(call.model || call.modelDisplay, call.responseModel, customPricing);
    const pricing = (0, pricing_store_1.findPricingForDate)(pricingModel, customPricing, call.createdAt || '');
    const costUsd = pricing ? (0, pricing_store_1.costFromTokens)(call, pricing) : null;
    const ttftSeconds = Number.isFinite(call.ttftSeconds) && call.ttftSeconds > 0 ? call.ttftSeconds : null;
    const streamingSeconds = Number.isFinite(call.streamingSeconds) && call.streamingSeconds > 0 ? call.streamingSeconds : null;
    const totalSum = (ttftSeconds ?? 0) + (streamingSeconds ?? 0);
    const totalSeconds = totalSum > 0 ? totalSum : null;
    const speedTokPerSec = (0, telemetry_metrics_1.computeStepSpeed)(call.outputTokens, call.streamingSeconds);
    const cacheHitRate = (0, telemetry_metrics_1.computeStepCacheHitRate)(call.inputTokens, call.cacheReadTokens, call.cacheCreationTokens);
    const status = call.hasError
        ? 'error'
        : call.retries > 0
            ? 'retried'
            : 'ok';
    return {
        modelLabel,
        rawModel,
        inputTokens: Math.max(0, call.inputTokens || 0),
        outputTokens: Math.max(0, call.outputTokens || 0),
        thinkingTokens: Math.max(0, call.thinkingTokens || 0),
        cacheReadTokens: Math.max(0, call.cacheReadTokens || 0),
        cacheHitRate,
        costUsd,
        isUnpriced: !pricing,
        ttftSeconds,
        streamingSeconds,
        totalSeconds,
        speedTokPerSec,
        status,
        retries: Math.max(0, call.retries || 0),
    };
}
function computeHoverExtras(gmSummary, activeCascadeId, customPricing) {
    const activeConv = activeCascadeId
        ? gmSummary.conversations.find(c => c.cascadeId === activeCascadeId)
        : undefined;
    const allCalls = gmSummary.conversations.flatMap(c => c.calls);
    const primaryCalls = activeConv && activeConv.calls.length > 0 ? activeConv.calls : allCalls;
    // Pick newest call by createdAt (fallback to array order)
    let latestCallEntry = null;
    let latestTs = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < primaryCalls.length; i++) {
        const c = primaryCalls[i];
        const ts = c.createdAt ? Date.parse(c.createdAt) : Number.NaN;
        if (Number.isFinite(ts)) {
            if (ts >= latestTs) {
                latestTs = ts;
                latestCallEntry = c;
            }
        }
        else if (latestCallEntry === null || latestTs === Number.NEGATIVE_INFINITY) {
            latestCallEntry = c;
        }
    }
    let sessionCostSum = 0;
    let pricedCallCount = 0;
    let sessionHasUnpriced = false;
    let weightedInputDollars = 0;
    let weightedInputTokens = 0;
    for (const c of primaryCalls) {
        const pricingModel = (0, pricing_store_1.selectPricingModel)(c.model || c.modelDisplay, c.responseModel, customPricing);
        const pricing = (0, pricing_store_1.findPricingForDate)(pricingModel, customPricing, c.createdAt || '');
        if (pricing) {
            pricedCallCount++;
            sessionCostSum += (0, pricing_store_1.costFromTokens)(c, pricing);
            const freshIn = Math.max(0, c.inputTokens || 0);
            const cacheIn = Math.max(0, c.cacheReadTokens || 0);
            const totalIn = freshIn + cacheIn;
            if (totalIn > 0) {
                weightedInputDollars += freshIn * pricing.input + cacheIn * pricing.cacheRead;
                weightedInputTokens += totalIn;
            }
        }
        else {
            sessionHasUnpriced = true;
        }
    }
    const sessionCostUsd = pricedCallCount > 0 ? sessionCostSum : null;
    const blendedInputUsdPerMillion = weightedInputTokens > 0
        ? weightedInputDollars / weightedInputTokens
        : null;
    // Retry waste across session
    let retryWaste = null;
    const totalRetryCount = Math.max(0, gmSummary.totalRetryCount || 0);
    if (totalRetryCount > 0) {
        let wasteCost = 0;
        let hasWasteCost = false;
        let retryTokSum = 0;
        for (const c of allCalls) {
            const rIn = Math.max(0, c.retryTokensIn || 0);
            const rOut = Math.max(0, c.retryTokensOut || 0);
            if (rIn + rOut <= 0) {
                continue;
            }
            retryTokSum += rIn + rOut;
            const pricingModel = (0, pricing_store_1.selectPricingModel)(c.model || c.modelDisplay, c.responseModel, customPricing);
            const pricing = (0, pricing_store_1.findPricingForDate)(pricingModel, customPricing, c.createdAt || '');
            if (pricing) {
                wasteCost += (rIn * pricing.input + rOut * pricing.output) / 1_000_000;
                hasWasteCost = true;
            }
        }
        const errEntries = Object.entries(gmSummary.retryErrorCodes || {})
            .sort((a, b) => b[1] - a[1]);
        retryWaste = {
            retryCount: totalRetryCount,
            retryTokens: Math.max(retryTokSum, gmSummary.totalRetryTokens || 0),
            estWasteCostUsd: hasWasteCost && wasteCost > 0 ? wasteCost : null,
            topErrorCode: errEntries[0]?.[0] || '',
        };
    }
    return {
        latestCall: latestCallEntry ? buildLatestCallSnapshot(latestCallEntry, customPricing) : null,
        sessionCostUsd,
        sessionHasUnpriced,
        blendedInputUsdPerMillion,
        retryWaste,
        primaryCalls,
    };
}
function getSeverity(usagePercent) {
    if (usagePercent >= 80) {
        return 'critical';
    }
    if (usagePercent >= 50) {
        return 'warning';
    }
    return 'ok';
}
function getSeverityColor(severity) {
    switch (severity) {
        case 'critical': return new vscode.ThemeColor('statusBarItem.errorBackground');
        case 'error': return new vscode.ThemeColor('statusBarItem.errorBackground');
        case 'warning': return new vscode.ThemeColor('statusBarItem.warningBackground');
        default: return undefined;
    }
}
function getSeverityIcon(severity) {
    switch (severity) {
        case 'critical': return '$(zap)';
        case 'error': return '$(warning)';
        case 'warning': return '$(info)';
        default: return '$(pulse)';
    }
}
// ─── Tooltip density diagnostics (one-shot per signature, PATH-check style) ───
let lastDensityDiagKey = '';
let densityDiagLogger = null;
/** Inject the extension's OutputChannel logger (called once from activate()). */
function setTooltipDiagLogger(logger) {
    densityDiagLogger = logger;
}
function logDensityDiagOnce(zoomLevel, density, effective, quotaRows, lang) {
    const key = `${zoomLevel}|${density}|${effective}|${quotaRows}|${lang}`;
    if (key === lastDensityDiagKey) {
        return;
    }
    lastDensityDiagKey = key;
    const line = `Tooltip density: zoomLevel=${zoomLevel} density=${density} effective=${effective} quotaRows=${quotaRows} lang=${lang}`;
    if (densityDiagLogger) {
        densityDiagLogger(line);
    }
    else {
        console.log(`[Antigravity Context Monitor] ${line}`);
    }
}
/** Reset density diagnostic gate (exported for tests). */
function resetTooltipDensityDiag() {
    lastDensityDiagKey = '';
}
class StatusBarManager {
    static RESET_JITTER_HYSTERESIS_MS = 45_000;
    statusBarItem;
    cachedConfigs = [];
    cachedOrchestratorSettings = null;
    cachedQuotaSummary = null;
    cachedPlanName = '';
    cachedTierName = '';
    resetCountdownTimer;
    displayPrefs = {
        showContext: true,
        showQuota: true,
        showResetCountdown: true,
        showAiCredits: true,
        showSpeed: false,
        showCacheHit: false,
        showSessionCost: false,
    };
    cachedCreditsTotal = null;
    cachedBillingDay = 0;
    cachedTelemetry = null;
    cachedCustomPricing = {};
    cachedExtras = null;
    cachedCostSnapshot = {};
    cachedStaleState = null;
    cachedQuotaRunways = {};
    lastRender = { kind: 'initializing' };
    // Last committed StatusBarItem property values — prevents redundant setter
    // writes that trigger VS Code IPC $setEntry -> markdownStringEqual object
    // identity failure on isTrusted -> ManagedHoverWidget dispose/recreate flicker.
    committedName;
    hasCommittedBackgroundColor = false;
    committedBackgroundColorId;
    committedText;
    committedAriaLabel;
    committedAriaRole;
    committedTooltipValue;
    stabilizedResetMinutes = new Map();
    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = monitor_overview_1.MONITOR_COMMAND;
        this.commitName((0, i18n_1.t)('statusBar.name'));
        this.showInitializing();
        this.statusBarItem.show();
    }
    commitName(name) {
        if (this.committedName === name) {
            return;
        }
        this.committedName = name;
        this.statusBarItem.name = name;
    }
    clearStabilizedResetKeys(prefix) {
        if (!prefix) {
            this.stabilizedResetMinutes.clear();
            return;
        }
        for (const key of this.stabilizedResetMinutes.keys()) {
            if (key.startsWith(prefix)) {
                this.stabilizedResetMinutes.delete(key);
            }
        }
    }
    pruneStabilizedResetKeys(prefix, activeKeys) {
        for (const key of this.stabilizedResetMinutes.keys()) {
            if (key.startsWith(prefix) && !activeKeys.has(key)) {
                this.stabilizedResetMinutes.delete(key);
            }
        }
    }
    /** Clear all cached reset-minute stabilization entries (e.g., on account switch or reconnect). */
    clearStabilizedResetTimes() {
        this.stabilizedResetMinutes.clear();
    }
    /** Record optional stale-cache status for compact tooltip notice (does not trigger redundant re-renders). */
    setStaleState(stale) {
        this.cachedStaleState = stale;
    }
    /** Record optional quota runway estimates for compact at-risk tooltip notice. */
    setQuotaRunways(runways) {
        this.cachedQuotaRunways = runways ?? {};
    }
    stabilizeResetMinute(key, rawResetMs) {
        const prevMinuteMs = this.stabilizedResetMinutes.get(key);
        if (prevMinuteMs !== undefined
            && Math.abs(rawResetMs - prevMinuteMs) < StatusBarManager.RESET_JITTER_HYSTERESIS_MS) {
            return prevMinuteMs;
        }
        const snapped = Math.round(rawResetMs / 60_000) * 60_000;
        this.stabilizedResetMinutes.set(key, snapped);
        return snapped;
    }
    formatStabilizedQuotaCountdown(key, rawResetMs, nowMs) {
        const alignedNow = Math.floor(nowMs / 60_000) * 60_000;
        const stabilizedReset = this.stabilizeResetMinute(key, rawResetMs);
        const effectiveReset = stabilizedReset > alignedNow ? stabilizedReset : alignedNow + 60_000;
        return (0, monitor_overview_1.resetCountdown)(effectiveReset, alignedNow);
    }
    setModelConfigs(configs) {
        this.cachedConfigs = configs;
        if (configs.length === 0) {
            this.clearStabilizedResetKeys('bar:');
            this.clearStabilizedResetKeys('fb:');
        }
        this.scheduleResetRefresh();
    }
    setOrchestratorSettings(settings) {
        this.cachedOrchestratorSettings = settings;
    }
    getOrchestratorSettings() {
        return this.cachedOrchestratorSettings;
    }
    setQuotaSummary(summary) {
        this.cachedQuotaSummary = summary;
        if (!summary) {
            this.clearStabilizedResetKeys('5h:');
            this.clearStabilizedResetKeys('wk:');
        }
    }
    getQuotaSummary() {
        return this.cachedQuotaSummary;
    }
    setCostSnapshot(snapshot) {
        this.cachedCostSnapshot = { ...snapshot };
    }
    /**
     * Compute and cache session/active telemetry summary + latest-call/cost extras.
     * Pass `null` to clear cleanly (e.g., on account switch or cold start).
     */
    setTelemetry(gmSummary, activeCascadeId, customPricing) {
        this.cachedCustomPricing = customPricing ? { ...customPricing } : {};
        if (!gmSummary) {
            this.cachedTelemetry = null;
            this.cachedExtras = null;
            return;
        }
        const summary = (0, telemetry_metrics_1.computeTelemetrySummary)(gmSummary, { activeCascadeId, customPricing });
        const hasReading = hasTelemetryReading(summary.primary);
        this.cachedTelemetry = hasReading ? summary : null;
        const hasActivity = hasReading || gmSummary.totalCalls > 0 || (gmSummary.totalRetryCount || 0) > 0;
        this.cachedExtras = hasActivity
            ? computeHoverExtras(gmSummary, activeCascadeId, this.cachedCustomPricing)
            : null;
    }
    setDisplayPrefs(prefs) {
        if (prefs.showContext !== undefined) {
            this.displayPrefs.showContext = prefs.showContext;
        }
        if (prefs.showQuota !== undefined) {
            this.displayPrefs.showQuota = prefs.showQuota;
        }
        if (prefs.showResetCountdown !== undefined) {
            this.displayPrefs.showResetCountdown = prefs.showResetCountdown;
        }
        if (prefs.showAiCredits !== undefined) {
            this.displayPrefs.showAiCredits = prefs.showAiCredits;
        }
        if (prefs.showSpeed !== undefined) {
            this.displayPrefs.showSpeed = prefs.showSpeed;
        }
        if (prefs.showCacheHit !== undefined) {
            this.displayPrefs.showCacheHit = prefs.showCacheHit;
        }
        if (prefs.showSessionCost !== undefined) {
            this.displayPrefs.showSessionCost = prefs.showSessionCost;
        }
    }
    setCredits(total) {
        this.cachedCreditsTotal = total !== null && (0, monitor_overview_1.usableCount)(total) ? total : null;
    }
    setBillingDay(day) {
        this.cachedBillingDay = (day >= 1 && day <= 31) ? day : 0;
    }
    getDaysUntilRefresh(nowMs) {
        return (0, billing_day_1.getDaysUntilBillingDay)(this.cachedBillingDay, nowMs !== undefined ? new Date(nowMs) : undefined);
    }
    getEarliestResetTime() {
        let earliest = null;
        const now = Date.now();
        for (const c of this.cachedConfigs) {
            const resetMs = validResetTimestamp(c.quotaInfo?.resetTime);
            if (resetMs !== null && resetMs > now) {
                const resetDate = new Date(resetMs);
                if (!earliest || resetDate < earliest) {
                    earliest = resetDate;
                }
            }
        }
        return earliest;
    }
    scheduleResetRefresh() {
        if (this.resetCountdownTimer) {
            clearTimeout(this.resetCountdownTimer);
            this.resetCountdownTimer = undefined;
        }
        const earliest = this.getEarliestResetTime();
        if (!earliest) {
            return;
        }
        const delayMs = earliest.getTime() - Date.now() + 3000;
        if (delayMs > 0 && delayMs < 24 * 3600_000) {
            this.resetCountdownTimer = setTimeout(() => {
                vscode.commands.executeCommand(REFRESH_COMMAND);
            }, delayMs);
        }
    }
    setPlanName(planName, tierName) {
        this.cachedPlanName = planName;
        this.cachedTierName = tierName || '';
    }
    refreshFromConfig() {
        switch (this.lastRender.kind) {
            case 'update':
                this.update(this.lastRender.usage);
                break;
            case 'idle':
                this.showIdle(this.lastRender.limitStr, this.lastRender.modelId);
                break;
            case 'noConversation':
                this.showNoConversation(this.lastRender.limitStr, this.lastRender.modelId);
                break;
            case 'disconnected':
                this.showDisconnected(this.lastRender.message);
                break;
            case 'initializing':
                this.showInitializing();
                break;
            default:
                break;
        }
    }
    get monitorStatus() {
        switch (this.lastRender.kind) {
            case 'initializing': return { state: 'connecting' };
            case 'disconnected': return {
                state: 'disconnected',
                backendIssue: this.lastRender.message === 'LS not found' ? 'notFound'
                    : this.lastRender.message === 'LS connection lost' ? 'lost' : 'other',
            };
            case 'noConversation': return { state: 'empty' };
            case 'idle': return { state: 'idle' };
            case 'update': return { state: 'active' };
        }
    }
    showInitializing() {
        this.lastRender = { kind: 'initializing' };
        this.clearStabilizedResetKeys('bar:');
        this.renderStatus('$(sync~spin)', [(0, i18n_1.t)('statusBar.initializing')], undefined, Date.now());
    }
    showDisconnected(message) {
        this.lastRender = { kind: 'disconnected', message };
        this.clearStabilizedResetKeys('bar:');
        this.renderStatus('$(debug-disconnect)', [(0, i18n_1.t)('statusBar.disconnectedLabel')], undefined, Date.now());
    }
    showNoConversation(limitStr = '1M', modelId) {
        this.lastRender = { kind: 'noConversation', limitStr, modelId };
        const nowMs = Date.now();
        this.renderStatus('$(comment-discussion)', [
            this.displayPrefs.showContext ? (0, i18n_1.t)('statusBar.noConversationTooltip') : '',
            ...this.indicators(modelId, nowMs),
        ], undefined, nowMs);
    }
    showIdle(limitStr = '1M', modelId) {
        this.lastRender = { kind: 'idle', limitStr, modelId };
        const nowMs = Date.now();
        this.renderStatus('$(clock)', [
            this.displayPrefs.showContext ? (0, i18n_1.t)('statusBar.idle') : '',
            ...this.indicators(modelId, nowMs),
        ], undefined, nowMs);
    }
    update(usage) {
        this.lastRender = { kind: 'update', usage };
        const nowMs = Date.now();
        const { used, limit, percent } = (0, monitor_overview_1.getContextReading)(usage);
        const severity = getSeverity(percent ?? 0);
        const backgroundColor = this.displayPrefs.showContext ? getSeverityColor(severity) : undefined;
        const context = used !== null && limit !== null ? `${formatTokenCount(used)}/${formatContextLimit(limit)}` : '—';
        const flags = usage.hasGaps ? ' $(warning)' : percent !== null && percent > 100 ? ' $(fold)' : '';
        this.renderStatus(this.displayPrefs.showContext ? getSeverityIcon(severity) : '$(pulse)', [
            this.displayPrefs.showContext ? `${context}${flags}` : '',
            ...this.indicators(usage.model, nowMs),
        ], backgroundColor, nowMs);
    }
    effectiveSessionCost() {
        const override = this.cachedCostSnapshot.sessionCostUsd;
        if (override !== undefined && override !== null && Number.isFinite(override) && override > 0) {
            return override;
        }
        const computed = this.cachedExtras?.sessionCostUsd ?? null;
        return computed !== null && Number.isFinite(computed) && computed > 0 ? computed : null;
    }
    indicators(modelId, nowMs) {
        const id = modelId ? (0, models_1.resolveModelId)(modelId) || modelId : undefined;
        const config = id ? this.cachedConfigs.find(c => ((0, models_1.resolveModelId)(c.model) || c.model) === id) : undefined;
        let quota = '';
        let reset = '';
        const activeBarKeys = new Set();
        if (config) {
            const fraction = config.quotaInfo?.remainingFraction;
            if (this.displayPrefs.showQuota && (0, monitor_overview_1.usableCount)(fraction) && fraction <= 1) {
                quota = `$(layers) ${Math.round(fraction * 100)}%`;
            }
            if (this.displayPrefs.showResetCountdown) {
                const poolKey = (0, models_1.getQuotaPoolKey)(config.model) || config.model;
                const barKey = `bar:${poolKey}`;
                reset = this.formatResetCountdown(config.quotaInfo?.resetTime, nowMs, barKey);
                if (reset) {
                    activeBarKeys.add(barKey);
                }
            }
        }
        else if (id) {
            const canonicalPool = (0, models_1.getQuotaPoolKey)(id);
            const poolKey = canonicalPool !== id && (canonicalPool === 'gemini' || canonicalPool === 'premium')
                ? canonicalPool : undefined;
            const group = poolKey
                ? (0, monitor_overview_1.selectMonitorQuotaGroups)(this.cachedConfigs, id).find(g => g.pool === poolKey)
                : undefined;
            if (group) {
                if (this.displayPrefs.showQuota && group.minimum !== null) {
                    quota = `$(layers) ${(0, monitor_overview_1.quotaPercentage)(group)}`;
                }
                if (this.displayPrefs.showResetCountdown && !group.resetDiffers && group.resetTime) {
                    const barKey = `bar:${group.pool || group.key}`;
                    reset = this.formatResetCountdown(group.resetTime, nowMs, barKey);
                    if (reset) {
                        activeBarKeys.add(barKey);
                    }
                }
            }
        }
        this.pruneStabilizedResetKeys('bar:', activeBarKeys);
        const credits = this.displayPrefs.showAiCredits && this.cachedCreditsTotal !== null
            ? `$(zap) ${(0, i18n_1.formatNumber)(this.cachedCreditsTotal)}` : '';
        const primary = this.cachedTelemetry?.primary;
        const speed = primary ? (primary.latestGenTokPerSec ?? primary.weightedGenTokPerSec) : null;
        const speedSegment = this.displayPrefs.showSpeed && speed !== null && speed > 0
            ? `$(pulse) ${(0, telemetry_metrics_1.formatSpeed)(speed)}` : '';
        const cacheLabel = (0, i18n_1.getLanguage)() === 'zh' ? '缓存' : 'Cache';
        const cacheSegment = this.displayPrefs.showCacheHit
            && primary
            && primary.totalPromptTokens > 0
            && primary.tokenCacheHitRate !== null
            ? `${cacheLabel} ${(0, telemetry_metrics_1.formatCachePercent)(primary.tokenCacheHitRate)}` : '';
        const sessionCost = this.effectiveSessionCost();
        const costSegment = this.displayPrefs.showSessionCost && sessionCost !== null
            ? `$(credit-card) ${(0, pricing_store_1.formatUsdCost)(sessionCost, { precision: 'standard' })}`
            : '';
        return [quota, reset, credits, speedSegment, cacheSegment, costSegment];
    }
    renderStatus(icon, segments, backgroundColor, nowMs = Date.now()) {
        this.commitName((0, i18n_1.t)('statusBar.name'));
        const nextBgId = backgroundColor?.id;
        if (!this.hasCommittedBackgroundColor || this.committedBackgroundColorId !== nextBgId) {
            this.hasCommittedBackgroundColor = true;
            this.committedBackgroundColorId = nextBgId;
            this.statusBarItem.backgroundColor = backgroundColor;
        }
        const text = segments.filter(Boolean);
        const nextText = text.length ? `${icon} ${text.join('  ·  ')}` : icon;
        if (this.committedText !== nextText) {
            this.committedText = nextText;
            this.statusBarItem.text = nextText;
        }
        const state = (0, monitor_overview_1.monitorStatusLabel)(this.monitorStatus.state);
        const spoken = text.filter(part => part !== state)
            .map(part => part
            .replace('$(layers)', (0, i18n_1.tBi)('Quota remaining', '剩余配额'))
            .replace('$(clock)', (0, i18n_1.tBi)('Reset in', '距离重置还有'))
            .replace('$(zap)', (0, i18n_1.tBi)('AI credits', 'AI 积分'))
            .replace('$(pulse)', (0, i18n_1.tBi)('Speed', '生成速度'))
            .replace('$(credit-card)', (0, i18n_1.t)('telemetry.cost'))
            .replace(/\$\([^)]*\)\s*/g, '').trim());
        const nextAriaLabel = [(0, i18n_1.t)('statusBar.name'), state, ...spoken].join(' · ');
        const nextAriaRole = 'button';
        if (this.committedAriaLabel !== nextAriaLabel || this.committedAriaRole !== nextAriaRole) {
            this.committedAriaLabel = nextAriaLabel;
            this.committedAriaRole = nextAriaRole;
            this.statusBarItem.accessibilityInformation = {
                label: nextAriaLabel,
                role: nextAriaRole,
            };
        }
        const nextTooltipValue = this.buildHoverMarkdown(nowMs);
        if (this.committedTooltipValue !== nextTooltipValue) {
            this.committedTooltipValue = nextTooltipValue;
            const tooltip = new vscode.MarkdownString(nextTooltipValue);
            tooltip.supportThemeIcons = true;
            tooltip.isTrusted = { enabledCommands: [monitor_overview_1.MONITOR_COMMAND, REFRESH_COMMAND] };
            this.statusBarItem.tooltip = tooltip;
        }
    }
    selectQuotaGroupsWithWindows(currentModel) {
        const id = currentModel ? (0, models_1.resolveModelId)(currentModel) || currentModel : '';
        return (0, model_quota_1.groupModelQuotas)(this.cachedConfigs, this.cachedQuotaSummary)
            .filter(g => g.minimum !== null || g.resetTime || g.resetDiffers || g.weeklyQuota !== undefined)
            .sort((a, b) => {
            const active = (group) => id !== '' && group.readings.some(reading => reading.model === id);
            return Number(active(b)) - Number(active(a))
                || (a.minimum ?? Infinity) - (b.minimum ?? Infinity)
                || a.label.localeCompare(b.label);
        });
    }
    buildHoverMarkdown(nowMs) {
        const status = this.monitorStatus;
        const usage = this.lastRender.kind === 'update' ? this.lastRender.usage : null;
        const connected = status.state !== 'connecting' && status.state !== 'disconnected';
        const groups = connected ? this.selectQuotaGroupsWithWindows(usage?.model) : [];
        const density = resolveConfiguredDensity(vscode.workspace.getConfiguration('antigravityContextMonitor')
            .get('statusBar.tooltipDensity', 'auto'));
        const rawZoom = vscode.workspace.getConfiguration('window').get('zoomLevel', 0);
        const zoom = Number.isFinite(rawZoom) ? rawZoom : 0;
        const lang = (0, i18n_1.getLanguage)();
        const mode = (0, tooltip_budget_1.resolveEffectiveMode)(density, zoom, groups.length, lang);
        const full = density === 'full';
        logDensityDiagOnce(zoom, density, mode, groups.length, lang);
        const sections = [];
        // P0: Header + Active Model / Orchestrator Route (+ Context Window Gauge)
        const headerSection = this.buildHeaderSection(status, usage, connected, mode, full);
        if (status.state === 'disconnected') {
            sections.push(headerSection);
            sections.push({
                id: 'disconnected',
                priority: 0,
                lines: [(0, monitor_overview_1.monitorBackendMessage)(status.backendIssue)],
            });
        }
        else if (usage) {
            const contextSection = this.buildContextSection(usage, mode, full);
            if (full) {
                sections.push(headerSection, contextSection);
            }
            else {
                sections.push({
                    id: 'hero',
                    priority: 0,
                    lines: [...headerSection.lines, ...contextSection.lines],
                    compactLines: [
                        headerSection.lines[0],
                        ...(contextSection.compactLines ?? contextSection.lines),
                    ],
                });
            }
        }
        else {
            sections.push(headerSection);
        }
        if (connected) {
            // P3: Latest Call (1-line summary in auto; full 4-col table in full)
            const latestSection = this.buildLatestCallSection(mode, full);
            if (latestSection) {
                sections.push(latestSection);
            }
            // P1: Session & Today Cost + Cache + Speed Ledger (+ Orchestrator Split)
            const kpiSection = this.buildSessionKpiSection(usage, mode, full);
            if (kpiSection) {
                sections.push(kpiSection);
            }
            // P0 (Protected): Dual-Window Quota Table (5h + Weekly, graceful 5h-only fallback)
            sections.push(this.buildQuotaSection(groups, usage, mode, full, nowMs));
            // P4: Smart Event-Driven Alerts + AI Credits
            const alertsSection = this.buildAlertsSection(usage, mode, full, nowMs);
            if (alertsSection) {
                sections.push(alertsSection);
            }
        }
        else {
            this.clearStabilizedResetKeys('5h:');
            this.clearStabilizedResetKeys('fb:');
            this.clearStabilizedResetKeys('wk:');
        }
        // P0: Pinned 1-Click Footer Action Bar
        sections.push(this.buildFooterSection(mode));
        const budget = (0, tooltip_budget_1.getSectionLineBudget)(density, mode, zoom);
        const budgeted = (0, tooltip_budget_1.applySectionBudget)(sections, budget);
        return (0, tooltip_budget_1.renderHoverSections)(budgeted.sections);
    }
    buildHeaderSection(status, usage, connected, mode, full) {
        const stateIcon = monitorStateIcon(status.state);
        const stateLabel = (0, monitor_overview_1.monitorStatusLabel)(status.state);
        const plan = connected
            ? [this.cachedPlanName, this.cachedTierName]
                .map(label => normalizeHoverLine(label))
                .filter((label, index, all) => label && all.indexOf(label) === index)
                .map(label => (0, tooltip_budget_1.truncateByDisplayWidth)(label, mode === 'compact' ? 22 : 28))
                .join(' · ')
            : '';
        const planBadge = plan ? ` · ${formatInlineCode(plan, 30)}` : '';
        if (!usage) {
            return {
                id: 'header',
                priority: 0,
                lines: [
                    `**${(0, i18n_1.t)('statusBar.name')}**${planBadge} · ${stateIcon} ${stateLabel}`,
                ],
            };
        }
        const lang = (0, i18n_1.getLanguage)();
        const rawTitle = normalizeHoverLine(usage.title || '') || (0, i18n_1.t)('panel.currentSessionLabel');
        const title = formatHoverText(rawTitle, mode === 'compact' ? 30 : 44);
        const stepsSuffix = (0, monitor_overview_1.usableCount)(usage.stepCount) && usage.stepCount > 0
            ? ` · ${(0, i18n_1.formatNumber)(usage.stepCount)} ${(0, i18n_1.tBi)(usage.stepCount === 1 ? 'step' : 'steps', '步')}`
            : '';
        const lines = full
            ? [
                `**${(0, i18n_1.t)('statusBar.name')}**${planBadge}`,
                `**${title}** · ${stateIcon} ${stateLabel}${stepsSuffix}`,
            ]
            : [
                `**${title}** · ${stateIcon} ${stateLabel}${stepsSuffix}${planBadge}`,
            ];
        const orch = usage.orchestratorConfig;
        if (orch?.planModel && orch?.executionModel) {
            const planId = (0, models_1.resolveModelId)(orch.planModel) || orch.planModel;
            const execId = (0, models_1.resolveModelId)(orch.executionModel) || orch.executionModel;
            const planName = (0, models_1.localizePickerEffortLabel)(planId, (0, models_1.getModelDisplayName)(planId), lang);
            const execName = (0, models_1.localizePickerEffortLabel)(execId, (0, models_1.getModelDisplayName)(execId), lang);
            const isCrossPool = (0, models_1.getQuotaPoolKey)(planId) !== (0, models_1.getQuotaPoolKey)(execId);
            const crossBadge = isCrossPool ? ` *(${(0, i18n_1.t)('orchestrator.crossPool')})*` : '';
            lines.push(`$(git-branch) **${(0, i18n_1.tBi)('Orchestrator', '编排')}** · ${formatInlineCode(planName, 34)} → ${formatInlineCode(execName, 34)}${crossBadge}`);
        }
        else {
            const id = (0, models_1.resolveModelId)(usage.model) || usage.model;
            const name = (0, models_1.localizePickerEffortLabel)(id, usage.modelDisplayName, lang);
            const model = formatHoverText(name, mode === 'compact' ? 32 : 46);
            const accuracy = usage.isEstimated ? (0, i18n_1.tBi)('Estimated', '估算') : (0, i18n_1.tBi)('Measured', '实测');
            lines.push(`$(hubot) ${model} · ${accuracy}`);
        }
        return {
            id: 'header',
            priority: 0,
            lines,
        };
    }
    buildContextSection(usage, mode, full) {
        const { used, limit, percent } = (0, monitor_overview_1.getContextReading)(usage);
        const remaining = (0, monitor_overview_1.getContextRemaining)(used, limit);
        const lines = [];
        const compactLines = [];
        if (used !== null && limit !== null && percent !== null) {
            const number = full ? (n) => (0, i18n_1.formatNumber)(n) : formatTokenCount;
            const gauge = buildUnicodeGauge(percent, 8);
            const lead = `$(dashboard) **${(0, i18n_1.tBi)('Context', '上下文')}** \`${gauge}\` **${percent.toFixed(1)}%** · **${number(used)}** / ${number(limit)} tokens`;
            compactLines.push(lead);
            if (mode === 'compact') {
                lines.push(lead);
            }
            else {
                const nearWarn = percent >= 80
                    ? ` · $(warning) ${(0, i18n_1.tBi)('Near compression', '接近自动压缩')}`
                    : '';
                if (!full) {
                    const remInline = remaining
                        ? ` · ${(0, i18n_1.tBi)('Remaining', '剩余')} **${number(remaining.tokens)}** (${remaining.percent.toFixed(1)}%)`
                        : '';
                    lines.push(`${lead}${remInline}${nearWarn}`);
                }
                else {
                    lines.push(lead);
                    if (remaining) {
                        const subParts = [
                            `${(0, i18n_1.tBi)('Remaining', '剩余')} **${number(remaining.tokens)}** (${remaining.percent.toFixed(1)}%)`,
                        ];
                        const detailParts = [];
                        if ((0, monitor_overview_1.usableCount)(usage.totalOutputTokens) && usage.totalOutputTokens > 0) {
                            detailParts.push(`${(0, i18n_1.t)('tooltip.modelOutput')} ${formatTokenCount(usage.totalOutputTokens)}`);
                        }
                        if ((0, monitor_overview_1.usableCount)(usage.totalToolCallOutputTokens) && usage.totalToolCallOutputTokens > 0) {
                            detailParts.push(`${(0, i18n_1.t)('tooltip.toolResults')} ${formatTokenCount(usage.totalToolCallOutputTokens)}`);
                        }
                        if ((0, monitor_overview_1.usableCount)(usage.imageGenStepCount) && usage.imageGenStepCount > 0) {
                            detailParts.push(`${(0, i18n_1.t)('tooltip.imageGen')} ${usage.imageGenStepCount}`);
                        }
                        if (detailParts.length > 0) {
                            subParts.push(`*(${detailParts.join(' · ')})*`);
                        }
                        lines.push(`${subParts.join(' ')}${nearWarn}`);
                    }
                }
            }
        }
        else {
            const unavail = (0, i18n_1.tBi)('Context measurement unavailable', '暂无上下文计量');
            lines.push(unavail);
            compactLines.push(unavail);
        }
        const criticalAlerts = [];
        if (usage.compressionDetected) {
            const compression = (0, webview_overview_tab_1.calculateCompressionStats)(usage);
            const label = (0, i18n_1.t)(usage.checkpointCompressionDrop > 0 ? 'tooltip.compressed' : 'tooltip.contextDecreased');
            const detail = compression
                ? ` · −${formatTokenCount(compression.dropTokens)}${mode !== 'compact' ? ` (${compression.dropPercent.toFixed(0)}%)` : ''}`
                : '';
            criticalAlerts.push(`$(fold) ${label}${detail}`);
        }
        if (usage.hasGaps) {
            criticalAlerts.push(`$(warning) ${(0, i18n_1.tBi)('Some steps are missing', '部分步骤缺失')}`);
        }
        if (percent !== null && percent > 100) {
            criticalAlerts.push(`$(fold) ${(0, i18n_1.tBi)('Above the context limit', '已超过上下文上限')}`);
        }
        if (usage.imageGenerationIncomplete) {
            criticalAlerts.push(`$(warning) ${(0, i18n_1.tBi)('Image workflow data is incomplete', '图片工作流数据不完整')}`);
        }
        lines.push(...criticalAlerts);
        compactLines.push(...criticalAlerts);
        return {
            id: 'context',
            priority: 0,
            lines: mode === 'compact' ? compactLines : lines,
            compactLines,
        };
    }
    buildLatestCallSection(mode, full) {
        const latest = this.cachedExtras?.latestCall;
        if (!latest || mode === 'compact') {
            return null;
        }
        const statusBadge = latest.status === 'error'
            ? `$(error) ${(0, i18n_1.tBi)('Error', '失败')}`
            : latest.status === 'retried'
                ? `$(warning) ${(0, i18n_1.tBi)(`Retry ×${latest.retries}`, `重试 ×${latest.retries}`)}`
                : `$(pass-filled) ${(0, i18n_1.tBi)('OK', '成功')}`;
        const header = `$(history) **${(0, i18n_1.t)('telemetry.latestCall')}** · ${formatInlineCode(latest.modelLabel, 28)} · ${statusBadge}`;
        const thinkSuffix = latest.thinkingTokens > 0
            ? ` *(${(0, i18n_1.tBi)('think', '思考')} ${formatTokenCount(latest.thinkingTokens)})*`
            : '';
        const inOutCell = `${(0, i18n_1.formatNumber)(latest.inputTokens)} / ${(0, i18n_1.formatNumber)(latest.outputTokens)}${thinkSuffix}`;
        const cacheCell = latest.cacheHitRate !== null
            ? `**${(latest.cacheHitRate * 100).toFixed(2)}%**`
            : '—';
        const costCell = latest.costUsd !== null
            ? `**${(0, pricing_store_1.formatUsdCost)(latest.costUsd, { precision: 'call' })}**`
            : (0, i18n_1.t)('telemetry.unpriced');
        const ttftStr = latest.ttftSeconds !== null ? (0, telemetry_metrics_1.formatLatency)(latest.ttftSeconds) : '—';
        const totalStr = latest.totalSeconds !== null ? (0, telemetry_metrics_1.formatLatency)(latest.totalSeconds) : '—';
        const speedStr = latest.speedTokPerSec !== null ? `**${(0, telemetry_metrics_1.formatSpeed)(latest.speedTokPerSec)}**` : '—';
        const timingSpeedCell = `${ttftStr} / ${totalStr} · ${speedStr}`;
        const compactStatus = latest.status !== 'ok' ? ` · ${statusBadge}` : '';
        const compactLine = `$(history) **${(0, i18n_1.t)('telemetry.latestCall')}** · ${formatInlineCode(latest.modelLabel, 28)}${compactStatus} · ${cacheCell} · ${costCell} · ${timingSpeedCell}`;
        if (!full) {
            return {
                id: 'latest-call',
                priority: 3,
                lines: [compactLine],
            };
        }
        return {
            id: 'latest-call',
            priority: 3,
            lines: [
                header,
                `| ${(0, i18n_1.tBi)('In / Out', '输入 / 输出')} | ${(0, i18n_1.tBi)('Cache', '缓存命中')} | ${(0, i18n_1.t)('telemetry.cost')} | ${(0, i18n_1.tBi)('TTFT / Total · Speed', '首字 / 总耗时 · 速度')} |`,
                '| :--- | ---: | ---: | ---: |',
                `| ${inOutCell} | ${cacheCell} | ${costCell} | ${timingSpeedCell} |`,
            ],
            compactLines: [compactLine],
        };
    }
    buildSessionKpiSection(usage, mode, full) {
        const telemetry = this.cachedTelemetry;
        const primary = telemetry?.primary;
        const hasTel = !!(primary && hasTelemetryReading(primary));
        const sessionCost = this.effectiveSessionCost();
        const sessionUnpriced = !!(this.cachedCostSnapshot.sessionHasUnpriced || this.cachedExtras?.sessionHasUnpriced);
        const todayCostRaw = this.cachedCostSnapshot.todayCostUsd;
        const todayCost = todayCostRaw !== undefined && todayCostRaw !== null && Number.isFinite(todayCostRaw) && todayCostRaw > 0
            ? todayCostRaw
            : null;
        const todayUnpriced = !!this.cachedCostSnapshot.todayHasUnpriced;
        if (!hasTel && sessionCost === null && todayCost === null) {
            return null;
        }
        const speed = primary ? (primary.latestGenTokPerSec ?? primary.weightedGenTokPerSec) : null;
        const ttft = primary ? (primary.avgTtftSeconds ?? primary.latestTtftSeconds) : null;
        const cacheRate = primary ? primary.tokenCacheHitRate : null;
        // Compact 1–2 line summary (used directly in compact mode AND as compactLines fallback)
        const compactParts = [];
        if (speed !== null) {
            compactParts.push(`**${(0, telemetry_metrics_1.formatSpeed)(speed)}**`);
        }
        if (ttft !== null) {
            compactParts.push(`${(0, i18n_1.tBi)('TTFT', '首字')} ${(0, telemetry_metrics_1.formatLatency)(ttft)}`);
        }
        if (cacheRate !== null) {
            compactParts.push(`${(0, i18n_1.tBi)('Cache', '缓存')} ${(0, telemetry_metrics_1.formatCachePercent)(cacheRate)}`);
        }
        const compactCostParts = [];
        if (sessionCost !== null) {
            compactCostParts.push(`${(0, i18n_1.t)('telemetry.sessionCost')} **${(0, pricing_store_1.formatUsdCost)(sessionCost)}**`);
        }
        else if (sessionUnpriced && hasTel) {
            compactCostParts.push(`${(0, i18n_1.t)('telemetry.sessionCost')} ${(0, i18n_1.t)('telemetry.unpriced')}`);
        }
        if (todayCost !== null) {
            compactCostParts.push(`${(0, i18n_1.t)('telemetry.todayCost')} **${(0, pricing_store_1.formatUsdCost)(todayCost)}**`);
        }
        const compactLines = [];
        if (compactParts.length > 0 && compactCostParts.length > 0) {
            compactLines.push(`$(pulse) **${(0, i18n_1.tBi)('Speed & Prompt Cache', '速度与提示词缓存')}** · ${compactParts.join(' · ')} · ${compactCostParts.join(' · ')}`);
        }
        else if (compactParts.length > 0) {
            compactLines.push(`$(pulse) **${(0, i18n_1.tBi)('Speed & Prompt Cache', '速度与提示词缓存')}** · ${compactParts.join(' · ')}`);
        }
        else if (compactCostParts.length > 0) {
            compactLines.push(`$(credit-card) **${(0, i18n_1.t)('telemetry.cost')}** · ${compactCostParts.join(' · ')}`);
        }
        if (mode === 'compact') {
            return compactLines.length > 0 ? { id: 'session-kpi', priority: 1, lines: compactLines } : null;
        }
        const scopeMeta = [];
        if (primary && primary.totalCalls > 0) {
            scopeMeta.push(`${primary.totalCalls} ${(0, i18n_1.tBi)(primary.totalCalls === 1 ? 'call' : 'calls', '次调用')}`);
            const warmth = formatCacheWarmthShort(primary.latestCacheState);
            if (warmth) {
                scopeMeta.push(warmth);
            }
        }
        const metaSuffix = scopeMeta.length > 0 ? ` *(${scopeMeta.join(' · ')})*` : '';
        const title = `$(graph) **${(0, i18n_1.tBi)('Speed & Prompt Cache', '速度与提示词缓存')}**${metaSuffix}`;
        const rows = [];
        // Row 1: Cost (Session / Today / Savings or Unpriced)
        if (sessionCost !== null || todayCost !== null || sessionUnpriced) {
            const sessionCell = sessionCost !== null
                ? `**${(0, pricing_store_1.formatUsdCost)(sessionCost)}**${sessionUnpriced ? ` *(${(0, i18n_1.tBi)('partial', '部分')})*` : ''}`
                : (sessionUnpriced ? (0, i18n_1.t)('telemetry.unpriced') : '—');
            const todayCell = todayCost !== null
                ? `**${(0, pricing_store_1.formatUsdCost)(todayCost)}**${todayUnpriced ? ` *(${(0, i18n_1.tBi)('partial', '部分')})*` : ''}`
                : '—';
            let costNote = '—';
            if (primary?.estCacheSavingsUsd !== null && primary?.estCacheSavingsUsd !== undefined && primary.estCacheSavingsUsd >= 0.0001) {
                const savedSigned = (0, pricing_store_1.formatUsdSavings)(primary.estCacheSavingsUsd);
                if (savedSigned !== '—') {
                    const savedPositive = savedSigned.replace(/^-/, '');
                    costNote = (0, i18n_1.tBi)(`est. ${savedSigned}`, `缓存省 ${savedPositive}`);
                }
            }
            else if (sessionCost !== null && sessionUnpriced) {
                costNote = (0, i18n_1.t)('telemetry.unpriced');
            }
            rows.push(`| ${(0, i18n_1.t)('telemetry.cost')} | ${sessionCell} | ${todayCell} | ${costNote} |`);
        }
        // Row 2: Prompt Cache
        if (primary && cacheRate !== null) {
            const ratioCell = `${primary.cachedCallCount}/${primary.totalCalls} ${(0, i18n_1.tBi)(primary.totalCalls === 1 ? 'call' : 'calls', '次')}`;
            const detailParts = [
                `${formatTokenCount(primary.totalCacheReadTokens)}/${formatTokenCount(primary.totalPromptTokens)} tokens`,
            ];
            if (this.cachedExtras?.blendedInputUsdPerMillion !== null && this.cachedExtras?.blendedInputUsdPerMillion !== undefined) {
                detailParts.push(`${(0, i18n_1.t)('telemetry.blendedInput')} ${(0, pricing_store_1.formatUsdPerMillion)(this.cachedExtras.blendedInputUsdPerMillion)}`);
            }
            if (full && primary.totalCacheCreationTokens > 0) {
                detailParts.push(`${(0, i18n_1.tBi)('write', '写入')} ${formatTokenCount(primary.totalCacheCreationTokens)}`);
            }
            rows.push(`| ${(0, i18n_1.t)('telemetry.promptCache')} | **${(0, telemetry_metrics_1.formatCachePercent)(cacheRate)}** | ${ratioCell} | ${detailParts.join(' · ')} |`);
        }
        // Row 3: Speed / TTFT
        if (primary && (speed !== null || ttft !== null)) {
            const speedParts = [];
            if (primary.latestGenTokPerSec !== null && primary.weightedGenTokPerSec !== null && primary.speedSampleCount > 1) {
                speedParts.push(`**${(0, telemetry_metrics_1.formatSpeed)(primary.latestGenTokPerSec)}**`);
                speedParts.push(`${(0, i18n_1.tBi)('avg', '均')} ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedGenTokPerSec)}`);
            }
            else if (speed !== null) {
                speedParts.push(`**${(0, telemetry_metrics_1.formatSpeed)(speed)}**`);
            }
            if (primary.hasThinking && primary.weightedVisibleTokPerSec !== null) {
                speedParts.push(`${(0, i18n_1.tBi)('resp', '可见')} ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedVisibleTokPerSec)}`);
            }
            const speedCell = speedParts.length > 0 ? speedParts.join(' · ') : '—';
            const ttftCell = ttft !== null ? `TTFT **${(0, telemetry_metrics_1.formatLatency)(ttft)}**` : '—';
            const timingNotes = [];
            if (primary.cachedTtftCount >= 1
                && primary.uncachedTtftCount >= 1
                && primary.cachedAvgTtftSeconds !== null
                && primary.uncachedAvgTtftSeconds !== null) {
                const delta = formatSignedPercentDelta(primary.ttftCacheDeltaPct);
                timingNotes.push(`${(0, telemetry_metrics_1.formatLatency)(primary.cachedAvgTtftSeconds)} ${(0, i18n_1.tBi)('cached', '命中')} vs ${(0, telemetry_metrics_1.formatLatency)(primary.uncachedAvgTtftSeconds)} ${(0, i18n_1.tBi)('uncached', '未命中')}${delta ? ` ${delta}` : ''}`);
            }
            if (full && primary.medianGenTokPerSec !== null && primary.speedSampleCount >= 2) {
                timingNotes.push(`p50 ${(0, telemetry_metrics_1.formatSpeed)(primary.medianGenTokPerSec)}`);
            }
            if (full && primary.medianTtftSeconds !== null && primary.ttftSampleCount >= 2) {
                timingNotes.push(`p50 ${(0, telemetry_metrics_1.formatLatency)(primary.medianTtftSeconds)}`);
            }
            rows.push(`| ${(0, i18n_1.tBi)('Speed / TTFT', '速度 / 首字')} | ${speedCell} | ${ttftCell} | ${timingNotes.length > 0 ? timingNotes.join(' · ') : '—'} |`);
        }
        if (rows.length === 0) {
            return null;
        }
        const lines = [
            title,
            `| ${(0, i18n_1.tBi)('Metric', '指标')} | ${(0, i18n_1.t)('telemetry.sessionCost')} | ${(0, i18n_1.tBi)('Today / Ratio', '今日 / 占比')} | ${(0, i18n_1.tBi)('Detail', '详情')} |`,
            '| :--- | ---: | ---: | :--- |',
            ...rows,
        ];
        // Optional 1-line Orchestrator Planner vs Executor Split
        if (this.cachedExtras && this.cachedExtras.primaryCalls.length > 0) {
            const split = (0, orchestrator_attribution_1.computeOrchestratorSplit)(this.cachedExtras.primaryCalls, {
                orchestratorConfig: usage?.orchestratorConfig,
                orchestratorHistory: usage?.orchestratorHistory,
            }, this.cachedCustomPricing);
            if (split) {
                const planCost = split.plannerCostUsd !== null
                    ? ` **${(0, pricing_store_1.formatUsdCost)(split.plannerCostUsd)}**`
                    : '';
                const execCost = split.executorCostUsd !== null
                    ? ` **${(0, pricing_store_1.formatUsdCost)(split.executorCostUsd)}**`
                    : '';
                const coldHint = split.coldCacheSwitchCount > 0
                    ? ` · ${split.coldCacheSwitchCount}× ${(0, i18n_1.tBi)('cold switch', '切换冷启动')}`
                    : '';
                lines.push(`$(git-branch) **${(0, i18n_1.tBi)('Split', '编排拆分')}** · ${(0, i18n_1.t)('orchestrator.planner')} ${formatHoverText(split.plannerLabel, 32)} ${split.plannerCalls}×${planCost} ｜ ${(0, i18n_1.t)('orchestrator.worker')} ${formatHoverText(split.executorLabel, 32)} ${split.executorCalls}×${execCost}${coldHint}`);
            }
        }
        return {
            id: 'session-kpi',
            priority: 1,
            lines,
            compactLines: compactLines.length > 0 ? compactLines : undefined,
        };
    }
    buildQuotaSection(groups, usage, mode, full, nowMs) {
        const maxPools = (0, tooltip_budget_1.getMaxQuotaRows)(full ? 'full' : 'auto', mode);
        const shown = groups.slice(0, maxPools);
        const title = `$(shield) **${(0, i18n_1.tBi)('Quota remaining', '剩余配额')}**`;
        if (groups.length === 0) {
            this.clearStabilizedResetKeys('5h:');
            this.clearStabilizedResetKeys('fb:');
            this.clearStabilizedResetKeys('wk:');
            return {
                id: 'quota',
                priority: 0,
                lines: [title, (0, i18n_1.tBi)('Waiting for quota data', '等待配额数据')],
                compactLines: [`${title} · ${(0, i18n_1.tBi)('Waiting for quota data', '等待配额数据')}`],
            };
        }
        const orch = usage?.orchestratorConfig;
        const plannerPool = orch?.planModel ? (0, models_1.getQuotaPoolKey)((0, models_1.resolveModelId)(orch.planModel) || orch.planModel) : undefined;
        const executorPool = orch?.executionModel ? (0, models_1.getQuotaPoolKey)((0, models_1.resolveModelId)(orch.executionModel) || orch.executionModel) : undefined;
        const activePool = usage?.model ? (0, models_1.getQuotaPoolKey)((0, models_1.resolveModelId)(usage.model) || usage.model) : undefined;
        const roleSuffix = (group) => {
            if (!group.pool) {
                return '';
            }
            if (plannerPool && executorPool && plannerPool !== executorPool) {
                if (group.pool === plannerPool) {
                    return ` *(${(0, i18n_1.t)('orchestrator.planner')})*`;
                }
                if (group.pool === executorPool) {
                    return ` *(${(0, i18n_1.t)('orchestrator.worker')})*`;
                }
                return '';
            }
            if (activePool && group.pool === activePool) {
                return ` *(${(0, i18n_1.tBi)('Active', '当前')})*`;
            }
            return '';
        };
        const hasWeekly = shown.some(g => g.weeklyQuota !== undefined);
        const compactListLines = [title];
        const singleLineItems = [];
        const tableRows = [];
        const activeQuotaKeys = new Set();
        for (const group of shown) {
            const label = formatHoverText(group.label, mode === 'compact' ? 20 : 24);
            const role = roleSuffix(group);
            const isHighlighted = role.length > 0;
            const poolCell = `${isHighlighted ? `**${label}**` : label}${role}`;
            const fiveHourValid = validQuotaFraction(group.fiveHourQuota?.remainingFraction);
            const fallbackMin = validQuotaFraction(group.minimum);
            const fiveHourFraction = fiveHourValid ?? fallbackMin;
            const fiveHourPct = fiveHourValid !== null
                ? `${Math.round(fiveHourValid * 100)}%`
                : (0, monitor_overview_1.quotaPercentage)(group);
            const gauge = fiveHourFraction !== null
                ? `\`${buildUnicodeGauge(fiveHourFraction * 100, 6)}\` `
                : '';
            const fiveHourResetTs = validResetTimestamp(group.fiveHourQuota?.resetTime);
            let reset5h;
            if (fiveHourResetTs !== null) {
                if (fiveHourResetTs > nowMs) {
                    const key5h = `5h:${group.key}`;
                    activeQuotaKeys.add(key5h);
                    reset5h = this.formatStabilizedQuotaCountdown(key5h, fiveHourResetTs, nowMs);
                }
                else {
                    reset5h = (0, i18n_1.tBi)('Ready', '就绪');
                }
            }
            else if (!group.resetDiffers && group.resetTime) {
                const fallbackResetTs = validResetTimestamp(group.resetTime);
                if (fallbackResetTs !== null && fallbackResetTs > nowMs) {
                    const keyFb = `fb:${group.key}`;
                    activeQuotaKeys.add(keyFb);
                    reset5h = this.formatStabilizedQuotaCountdown(keyFb, fallbackResetTs, nowMs);
                }
                else {
                    reset5h = (0, monitor_overview_1.quotaResetLabel)(group, nowMs, false);
                }
            }
            else {
                reset5h = (0, monitor_overview_1.quotaResetLabel)(group, nowMs, false);
            }
            const weeklyValid = validQuotaFraction(group.weeklyQuota?.remainingFraction);
            const shortLabel = formatHoverText(group.label, 14);
            const shortWeekly = hasWeekly && weeklyValid !== null ? ` (${(0, i18n_1.t)('quota.weekly')} ${Math.round(weeklyValid * 100)}%)` : '';
            const shortReset = shown.length <= 2 && reset5h ? ` · ${reset5h}` : '';
            singleLineItems.push(`${isHighlighted ? `**${shortLabel}**` : shortLabel} **${fiveHourPct}**${shortWeekly}${shortReset}`);
            if (hasWeekly) {
                const weeklyPct = weeklyValid !== null
                    ? `**${Math.round(weeklyValid * 100)}%**`
                    : '—';
                const weeklyResetTs = validResetTimestamp(group.weeklyQuota?.resetTime);
                let weeklyReset = '';
                if (weeklyResetTs !== null && weeklyResetTs > nowMs) {
                    const keyWk = `wk:${group.key}`;
                    activeQuotaKeys.add(keyWk);
                    weeklyReset = this.formatStabilizedQuotaCountdown(keyWk, weeklyResetTs, nowMs);
                }
                const resetCell = weeklyReset
                    ? `${(0, i18n_1.t)('quota.fiveHour')}: ${reset5h} · ${(0, i18n_1.t)('quota.weekly')}: ${weeklyReset}`
                    : reset5h;
                tableRows.push(`| ${poolCell} | ${gauge}**${fiveHourPct}** | ${weeklyPct} | ${resetCell} |`);
                compactListLines.push(`$(layers) ${poolCell} · ${(0, i18n_1.t)('quota.fiveHour')} **${fiveHourPct}**${weeklyValid !== null ? ` · ${(0, i18n_1.t)('quota.weekly')} ${weeklyPct}` : ''} · ${reset5h}`);
            }
            else {
                tableRows.push(`| ${poolCell} | ${gauge}**${fiveHourPct}** | ${reset5h} |`);
                compactListLines.push(`$(layers) ${poolCell} · **${fiveHourPct}** · ${reset5h}`);
            }
        }
        this.pruneStabilizedResetKeys('5h:', activeQuotaKeys);
        this.pruneStabilizedResetKeys('fb:', activeQuotaKeys);
        this.pruneStabilizedResetKeys('wk:', activeQuotaKeys);
        const extraNote = groups.length > shown.length
            ? (0, i18n_1.tBi)(`+${groups.length - shown.length} more in Models`, `模型页另有 ${groups.length - shown.length} 个配额池`)
            : '';
        if (extraNote) {
            compactListLines.push(extraNote);
        }
        const singleLineCompact = [
            `${title} · ${singleLineItems.join(' ｜ ')}${extraNote ? ` · ${extraNote}` : ''}`,
        ];
        if (mode === 'compact') {
            return {
                id: 'quota',
                priority: 0,
                lines: compactListLines,
                compactLines: singleLineCompact,
            };
        }
        const firstColHeader = full ? (0, i18n_1.tBi)('Pool', '额度池') : title;
        const headerRow = hasWeekly
            ? `| ${firstColHeader} | ${(0, i18n_1.t)('quota.fiveHour')} | ${(0, i18n_1.t)('quota.weekly')} | ${(0, i18n_1.tBi)('Reset', '重置')} |`
            : `| ${firstColHeader} | ${(0, i18n_1.tBi)('Remaining', '剩余')} | ${(0, i18n_1.tBi)('Reset', '重置')} |`;
        const alignRow = hasWeekly ? '| :--- | :--- | ---: | :--- |' : '| :--- | :--- | :--- |';
        const lines = full
            ? [title, headerRow, alignRow, ...tableRows]
            : [headerRow, alignRow, ...tableRows];
        if (extraNote) {
            lines.push(extraNote);
        }
        return {
            id: 'quota',
            priority: 0,
            lines,
            compactLines: singleLineCompact,
        };
    }
    buildAlertsSection(usage, mode, full, nowMs) {
        const lines = [];
        // 0. Compact Stale / At-Risk Runway Hint (strictly within existing priority-3 alerts budget)
        if (this.cachedStaleState?.isStale) {
            lines.push(`$(history) **${(0, i18n_1.t)('quota.cachedStale')}**`);
        }
        for (const [poolKey, runway] of Object.entries(this.cachedQuotaRunways)) {
            if (runway.status === 'at_risk' && runway.estExhaustMs !== null && Number.isFinite(runway.estExhaustMs)) {
                const mins = Math.max(1, Math.ceil(runway.estExhaustMs / 60_000));
                const hrs = Math.floor(mins / 60);
                const remM = mins % 60;
                const dur = hrs > 0 ? (remM > 0 ? `${hrs}h ${remM}m` : `${hrs}h`) : `${mins}m`;
                const poolLabel = poolKey === 'gemini' ? 'Gemini' : poolKey === 'premium' ? 'Claude / GPT' : poolKey;
                lines.push(`$(flame) **${(0, i18n_1.t)('quota.runway')}** · ${escapeMarkdown(poolLabel)} ${(0, i18n_1.t)('quota.exhaustsIn')} ~${dur}`);
                break;
            }
        }
        // 1. Scheduled Rate-Cutover Countdown (within 14 days for active / orchestrator models)
        const candidateModels = new Set();
        if (usage?.model) {
            candidateModels.add(usage.model);
        }
        if (usage?.orchestratorConfig?.planModel) {
            candidateModels.add(usage.orchestratorConfig.planModel);
        }
        if (usage?.orchestratorConfig?.executionModel) {
            candidateModels.add(usage.orchestratorConfig.executionModel);
        }
        const seenCutoverKeys = new Set();
        for (const candidate of candidateModels) {
            const change = (0, pricing_store_1.getUpcomingRateChangeForModel)(candidate, this.cachedCustomPricing, nowMs, 14);
            if (change && !seenCutoverKeys.has(change.modelKey)) {
                seenCutoverKeys.add(change.modelKey);
                lines.push(`$(clock) **${(0, i18n_1.t)('telemetry.rateChange')}** · ${escapeMarkdown(change.familyLabel)} ${(0, i18n_1.tBi)(`intro rate ends ${change.effectiveDate} (${change.daysRemaining}d → ${change.multiplier}×)`, `优惠价将于 ${change.effectiveDate} 结束（${change.daysRemaining} 天后 ${change.multiplier}×）`)}`);
            }
        }
        // 2. Model Sunset / Notice Tag (e.g. GPT-OSS 120B)
        const seenNoticeIds = new Set();
        for (const candidate of candidateModels) {
            const activeId = (0, models_1.resolveModelId)(candidate) || candidate;
            if (seenNoticeIds.has(activeId)) {
                continue;
            }
            const cfg = this.cachedConfigs.find(c => ((0, models_1.resolveModelId)(c.model) || c.model) === activeId);
            if (cfg && cfg.tagTitle && /^notice$/i.test(cfg.tagTitle.trim())) {
                seenNoticeIds.add(activeId);
                const desc = cfg.tagDescription
                    ? formatHoverText(cfg.tagDescription, 48)
                    : (0, i18n_1.tBi)('Scheduled for deprecation', '即将下线');
                lines.push(`$(info) **${(0, i18n_1.t)('quota.notice')}** · ${formatHoverText(cfg.label, 28)} — ${desc}`);
            }
        }
        // 3. Retry / Error Waste Alert (only when retries occurred)
        const retry = this.cachedExtras?.retryWaste;
        if (retry && retry.retryCount > 0) {
            const wasteCostStr = retry.estWasteCostUsd !== null
                ? ` (${(0, pricing_store_1.formatUsdCost)(retry.estWasteCostUsd)})`
                : '';
            const codeStr = retry.topErrorCode ? ` · ${formatInlineCode(retry.topErrorCode, 16)}` : '';
            lines.push(`$(warning) **${(0, i18n_1.t)('telemetry.retryWaste')}** · ${retry.retryCount}× · ${formatTokenCount(retry.retryTokens)} tokens${wasteCostStr}${codeStr}`);
        }
        // 4. AI Credits balance & billing cycle countdown
        if (this.cachedCreditsTotal !== null) {
            const expiry = mode === 'compact' ? '' : ` · ${(0, monitor_overview_1.formatCreditExpiry)(this.getDaysUntilRefresh(nowMs))}`;
            lines.push(`$(sparkle) **${(0, i18n_1.tBi)('AI credits', 'AI 积分')}** · **${(0, i18n_1.formatNumber)(this.cachedCreditsTotal)}**${expiry}`);
        }
        else if (this.cachedBillingDay > 0 && (mode !== 'compact' || full)) {
            lines.push(`$(sparkle) **${(0, i18n_1.tBi)('AI credits', 'AI 积分')}** · ${(0, i18n_1.tBi)('Not reported', '未上报')} · ${(0, monitor_overview_1.formatCreditExpiry)(this.getDaysUntilRefresh(nowMs))}`);
        }
        if (lines.length === 0) {
            return null;
        }
        return {
            id: 'alerts',
            priority: 4,
            lines,
            compactLines: [lines.slice(0, 2).join(' ｜ ')],
        };
    }
    buildFooterSection(mode) {
        const link = (destination, icon, label) => {
            const query = encodeURIComponent(JSON.stringify([destination]));
            return `[${icon} ${label}](command:${monitor_overview_1.MONITOR_COMMAND}?${query})`;
        };
        const refreshLink = `[$(refresh) ${(0, i18n_1.tBi)('Refresh', '刷新')}](command:${REFRESH_COMMAND})`;
        const links = mode === 'compact'
            ? [
                link('overview', '$(dashboard)', (0, i18n_1.tBi)('Overview', '总览')),
                link('pricing', '$(credit-card)', (0, i18n_1.tBi)('Cost', '费用')),
                link('models', '$(layers)', (0, i18n_1.tBi)('Models', '模型')),
                refreshLink,
            ]
            : [
                link('overview', '$(dashboard)', (0, i18n_1.tBi)('Overview', '总览')),
                link('gmdata', '$(pulse)', (0, i18n_1.tBi)('Activity', '活动')),
                link('pricing', '$(credit-card)', (0, i18n_1.tBi)('Cost', '费用')),
                link('models', '$(layers)', (0, i18n_1.tBi)('Models', '模型')),
                link('settings', '$(gear)', (0, i18n_1.tBi)('Settings', '设置')),
                refreshLink,
            ];
        return {
            id: 'footer',
            priority: 0,
            pinBottom: true,
            lines: [links.join(' · ')],
        };
    }
    formatResetCountdown(resetTime, nowMs, key) {
        const reset = validResetTimestamp(resetTime);
        if (reset === null || reset <= nowMs) {
            this.stabilizedResetMinutes.delete(key);
            return '';
        }
        const alignedNow = Math.floor(nowMs / 60_000) * 60_000;
        const stabilizedReset = this.stabilizeResetMinute(key, reset);
        const effectiveReset = stabilizedReset > alignedNow ? stabilizedReset : alignedNow + 60_000;
        return `$(clock) ${(0, reset_time_1.formatResetCountdownFromMs)(effectiveReset - alignedNow)}`;
    }
    dispose() {
        if (this.resetCountdownTimer) {
            clearTimeout(this.resetCountdownTimer);
        }
        this.stabilizedResetMinutes.clear();
        this.statusBarItem.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusbar.js.map