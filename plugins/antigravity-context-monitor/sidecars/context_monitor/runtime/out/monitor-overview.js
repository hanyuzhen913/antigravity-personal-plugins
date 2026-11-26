"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONITOR_COMMAND = void 0;
exports.monitorStatusLabel = monitorStatusLabel;
exports.monitorBackendMessage = monitorBackendMessage;
exports.usableCount = usableCount;
exports.getContextReading = getContextReading;
exports.getContextRemaining = getContextRemaining;
exports.selectMonitorQuotaGroups = selectMonitorQuotaGroups;
exports.modelFamilyCountLabel = modelFamilyCountLabel;
exports.formatQuotaEffort = formatQuotaEffort;
exports.formatQuotaEfforts = formatQuotaEfforts;
exports.quotaPercentage = quotaPercentage;
exports.resetCountdown = resetCountdown;
exports.quotaResetLabel = quotaResetLabel;
exports.formatCreditExpiry = formatCreditExpiry;
exports.resolveActiveOrchestratorRoute = resolveActiveOrchestratorRoute;
exports.formatQuotaWindowPercent = formatQuotaWindowPercent;
exports.extractOverviewTelemetry = extractOverviewTelemetry;
exports.formatCompactTokens = formatCompactTokens;
exports.formatSavingsUsd = formatSavingsUsd;
exports.formatOverviewSavings = formatOverviewSavings;
exports.formatOverviewCost = formatOverviewCost;
const i18n_1 = require("./i18n");
const model_quota_1 = require("./model-quota");
const models_1 = require("./models");
const pricing_store_1 = require("./pricing-store");
const reset_time_1 = require("./reset-time");
const telemetry_metrics_1 = require("./telemetry-metrics");
exports.MONITOR_COMMAND = 'antigravity-context-monitor.showDetails';
function monitorStatusLabel(state) {
    switch (state) {
        case 'connecting': return (0, i18n_1.tBi)('Connecting to Antigravity', '正在连接 Antigravity');
        case 'disconnected': return (0, i18n_1.tBi)('Backend disconnected', '后端连接已断开');
        case 'empty': return (0, i18n_1.t)('statusBar.noConversationTooltip');
        case 'idle': return (0, i18n_1.tBi)('Conversation idle', '会话空闲');
        case 'active': return (0, i18n_1.tBi)('Active conversation', '会话进行中');
    }
}
function monitorBackendMessage(issue) {
    if (issue === 'notFound') {
        return (0, i18n_1.t)('statusBar.backendNotFound');
    }
    if (issue === 'lost') {
        return (0, i18n_1.t)('statusBar.backendConnectionLost');
    }
    return (0, i18n_1.tBi)('Unable to read the local backend. Refresh to try again.', '无法读取本地后端，请刷新后重试。');
}
function usableCount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function getContextReading(usage) {
    const used = usableCount(usage.contextUsed) ? usage.contextUsed : null;
    const limit = usableCount(usage.contextLimit) && usage.contextLimit > 0 ? usage.contextLimit : null;
    const ratio = used !== null && limit !== null ? used / limit * 100 : NaN;
    return { used, limit, percent: Number.isFinite(ratio) ? ratio : null };
}
function getContextRemaining(used, limit) {
    if (used === null || limit === null || !Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) {
        return null;
    }
    const tokens = Math.max(0, limit - used);
    const percent = Math.max(0, Math.min(100, (tokens / limit) * 100));
    return { tokens, percent };
}
function selectMonitorQuotaGroups(configs, currentModel = '', quotaSummary) {
    const id = (0, models_1.resolveModelId)(currentModel) || currentModel;
    return (0, model_quota_1.groupModelQuotas)(configs, quotaSummary).sort((a, b) => {
        const active = (group) => id !== '' && group.readings.some(reading => reading.model === id);
        return Number(active(b)) - Number(active(a))
            || (a.minimum ?? Infinity) - (b.minimum ?? Infinity)
            || a.label.localeCompare(b.label);
    });
}
function modelFamilyCountLabel(count) {
    return (0, i18n_1.tBi)(count === 1 ? '1 model' : `${count} models`, `${count} 个模型`);
}
const EFFORT_LABELS = {
    low: ['Low', '低'],
    medium: ['Medium', '中'],
    high: ['High', '高'],
    xhigh: ['Extra High', '超高'],
};
function formatQuotaEffort(effort) {
    const [en, zh] = EFFORT_LABELS[effort];
    return (0, i18n_1.tBi)(en, zh);
}
function formatQuotaEfforts(efforts) {
    if (!efforts.length) {
        return '';
    }
    return (0, i18n_1.tBi)(efforts.map(e => EFFORT_LABELS[e][0]).join(' · '), efforts.map(e => EFFORT_LABELS[e][1]).join(' · '));
}
function quotaPercentage(group) {
    if (group.minimum === null || group.maximum === null) {
        return '—';
    }
    const lo = Math.round(group.minimum * 100);
    const hi = Math.round(group.maximum * 100);
    if (lo !== hi) {
        return `${lo}–${hi}%`;
    }
    if (group.minimum !== group.maximum) {
        const lower = Number((group.minimum * 100).toFixed(1));
        const upper = Number((group.maximum * 100).toFixed(1));
        if (lower !== upper) {
            return `${lower}–${upper}%`;
        }
    }
    return `${lo}%`;
}
function resetCountdown(at, now) {
    if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now)) {
        return (0, i18n_1.tBi)('Reset time unavailable', '暂无重置时间');
    }
    const minutes = Math.ceil((at - now) / 60_000);
    if (minutes <= 0) {
        return (0, i18n_1.tBi)('Reset time passed', '已到重置时间');
    }
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    const remMinutes = minutes % 60;
    if (days > 0) {
        return remHours > 0
            ? (0, i18n_1.tBi)(`${days}d ${remHours}h`, `${days} 天 ${remHours} 小时`)
            : (0, i18n_1.tBi)(`${days}d`, `${days} 天`);
    }
    if (hours > 0) {
        return remMinutes > 0
            ? (0, i18n_1.tBi)(`${hours}h ${remMinutes}m`, `${hours} 小时 ${remMinutes} 分钟`)
            : (0, i18n_1.tBi)(`${hours}h`, `${hours} 小时`);
    }
    return (0, i18n_1.tBi)(`${minutes}m`, `${minutes} 分钟`);
}
function quotaResetLabel(group, now, showAbsolute = false) {
    if (group.resetDiffers) {
        return (0, i18n_1.tBi)('Reset times vary', '重置时间不同');
    }
    if (!group.resetTime) {
        return (0, i18n_1.tBi)('Reset time unavailable', '暂无重置时间');
    }
    const remaining = resetCountdown(Date.parse(group.resetTime), now);
    return showAbsolute ? `${remaining} · ${(0, reset_time_1.formatResetAbsolute)(group.resetTime)}` : remaining;
}
function formatCreditExpiry(days) {
    if (days === null || !Number.isFinite(days) || days < 0) {
        return (0, i18n_1.tBi)('Expiry date not set', '未设置到期日');
    }
    if (days === 0) {
        return (0, i18n_1.tBi)('Expires today', '今日到期');
    }
    return (0, i18n_1.tBi)(days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`, `${days} 天后到期`);
}
/** Resolve the active conversation's Planner -> Executor pair for Overview / Tooltip display. */
function resolveActiveOrchestratorRoute(usage) {
    const cfg = usage?.orchestratorConfig;
    if (!cfg?.planModel || !cfg?.executionModel) {
        return null;
    }
    const plannerId = (0, models_1.resolveModelId)(cfg.planModel) || cfg.planModel;
    const executorId = (0, models_1.resolveModelId)(cfg.executionModel) || cfg.executionModel;
    const lang = (0, i18n_1.getLanguage)();
    const plannerLabel = (0, models_1.localizePickerEffortLabel)(plannerId, (0, models_1.normalizeModelDisplayName)(plannerId), lang);
    const executorLabel = (0, models_1.localizePickerEffortLabel)(executorId, (0, models_1.normalizeModelDisplayName)(executorId), lang);
    const rawPlannerPool = (0, models_1.getQuotaPoolKey)(plannerId);
    const rawExecutorPool = (0, models_1.getQuotaPoolKey)(executorId);
    const plannerPool = rawPlannerPool === 'gemini' || rawPlannerPool === 'premium' ? rawPlannerPool : undefined;
    const executorPool = rawExecutorPool === 'gemini' || rawExecutorPool === 'premium' ? rawExecutorPool : undefined;
    return {
        plannerModel: plannerId,
        executorModel: executorId,
        plannerLabel,
        executorLabel,
        plannerPool,
        executorPool,
        isCrossPool: Boolean(plannerPool && executorPool && plannerPool !== executorPool),
    };
}
/** Format a single dual-window quota fraction cleanly without falsely rounding 99.3% to 100% or sub-1% to 0%. */
function formatQuotaWindowPercent(fraction) {
    if (fraction === null || fraction === undefined || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
        return '—';
    }
    if (fraction >= 1) {
        return '100%';
    }
    if (fraction <= 0) {
        return '0%';
    }
    const pct = fraction * 100;
    if (pct > 99) {
        const floored = Math.min(99.9, Math.floor(pct * 10) / 10);
        return `${floored.toFixed(1)}%`;
    }
    if (pct < 1) {
        return '<1%';
    }
    return `${Math.round(pct)}%`;
}
/**
 * Pure telemetry extractor for the Overview tab.
 * Delegates to computeTelemetrySummary() and returns null when there are no calls
 * or no valid speed/TTFT/cache readings (preventing fabricated 0 tok/s or 0%).
 */
function extractOverviewTelemetry(gmSummary, activeCascadeId, customPricing, orchestratorPricingMode) {
    if (!gmSummary) {
        return null;
    }
    const summary = (0, telemetry_metrics_1.computeTelemetrySummary)(gmSummary, { activeCascadeId, customPricing, orchestratorPricingMode });
    const { primary, primaryScope } = summary;
    const speedPrimary = primary.latestGenTokPerSec ?? primary.weightedGenTokPerSec;
    const ttftPrimary = primary.latestTtftSeconds ?? primary.avgTtftSeconds;
    const hasReading = speedPrimary !== null
        || ttftPrimary !== null
        || primary.tokenCacheHitRate !== null;
    if (primary.totalCalls <= 0 || !hasReading) {
        return null;
    }
    return {
        summary,
        primary,
        primaryScope,
        speedPrimary,
        ttftPrimary,
    };
}
/** Compact token count formatter for tight telemetry cells (e.g. 142k, 14.5k, 1.2M). */
function formatCompactTokens(tokens) {
    if (!Number.isFinite(tokens) || tokens <= 0) {
        return '0';
    }
    if (tokens >= 1_000_000) {
        return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (tokens >= 1_000) {
        const digits = tokens >= 100_000 ? 0 : 1;
        return `${(tokens / 1_000).toFixed(digits).replace(/\.0$/, '')}k`;
    }
    return String(Math.round(tokens));
}
/** Format positive USD cache savings without ever emitting fake $0.00. */
function formatSavingsUsd(usd) {
    if (usd === null || usd === undefined || !Number.isFinite(usd) || usd <= 0) {
        return null;
    }
    if (usd >= 0.01) {
        return `$${usd.toFixed(2)}`;
    }
    if (usd >= 0.001) {
        return `$${usd.toFixed(3)}`;
    }
    if (usd >= 0.0001) {
        return `$${usd.toFixed(4)}`;
    }
    return '<$0.0001';
}
/** USD cache savings formatter for Overview telemetry; avoids fake zero strings. */
function formatOverviewSavings(usd) {
    return formatSavingsUsd(usd);
}
/** USD cost formatter for Session / Today cost pills; omits non-finite or negative inputs. */
function formatOverviewCost(usd) {
    if (usd === null || usd === undefined || !Number.isFinite(usd) || usd < 0) {
        return null;
    }
    const formatted = (0, pricing_store_1.formatUsdCost)(usd, { precision: 'standard' });
    return formatted === '—' ? null : formatted;
}
//# sourceMappingURL=monitor-overview.js.map