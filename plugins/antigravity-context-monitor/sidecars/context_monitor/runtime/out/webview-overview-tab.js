"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCompressionStats = calculateCompressionStats;
exports.formatRunwayDurationHtml = formatRunwayDurationHtml;
exports.formatRunwayBadgeHtml = formatRunwayBadgeHtml;
exports.buildStaleBannerHtml = buildStaleBannerHtml;
exports.buildCustomModelBannerHtml = buildCustomModelBannerHtml;
exports.evaluateLowQuotaWarning = evaluateLowQuotaWarning;
exports.buildLowQuotaWarningBannerHtml = buildLowQuotaWarningBannerHtml;
exports.buildContextBreakdownCard = buildContextBreakdownCard;
exports.buildOverviewTabContent = buildOverviewTabContent;
exports.getOverviewStyles = getOverviewStyles;
const account_credits_1 = require("./account-credits");
const i18n_core_1 = require("./i18n-core");
const billing_day_1 = require("./billing-day");
const cli_usage_scanner_1 = require("./cli-usage-scanner");
const context_breakdown_1 = require("./context-breakdown");
const monitor_overview_1 = require("./monitor-overview");
const models_1 = require("./models");
const orchestrator_attribution_1 = require("./orchestrator-attribution");
const reset_time_1 = require("./reset-time");
const telemetry_metrics_1 = require("./telemetry-metrics");
const webview_icons_1 = require("./webview-icons");
const webview_helpers_1 = require("./webview-helpers");
/**
 * Calculate compression amount for UI display.
 */
function calculateCompressionStats(usage) {
    if (!usage.compressionDetected) {
        return null;
    }
    if (usage.previousContextUsed !== undefined && usage.previousContextUsed > usage.contextUsed) {
        const dropTokens = usage.previousContextUsed - usage.contextUsed;
        const dropPercent = usage.previousContextUsed > 0
            ? (dropTokens / usage.previousContextUsed) * 100
            : 0;
        return { source: 'context', dropTokens, dropPercent };
    }
    if (usage.checkpointCompressionDrop > 0) {
        const currentInput = usage.lastModelUsage
            ? usage.lastModelUsage.inputTokens + usage.lastModelUsage.cacheReadTokens + (usage.lastModelUsage.cacheCreationTokens || 0)
            : undefined;
        const previousInput = currentInput !== undefined
            ? currentInput + usage.checkpointCompressionDrop
            : 0;
        const dropPercent = previousInput > 0
            ? (usage.checkpointCompressionDrop / previousInput) * 100
            : 0;
        return { source: 'checkpoint', dropTokens: usage.checkpointCompressionDrop, dropPercent };
    }
    return null;
}
function formatRunwayDurationHtml(ms) {
    if (!Number.isFinite(ms) || ms <= 0) {
        return (0, webview_helpers_1.tBiHtml)('<1m', '<1 分钟');
    }
    const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
    const hours = Math.floor(totalMinutes / 60);
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    const remMinutes = totalMinutes % 60;
    if (days > 0) {
        return remHours > 0
            ? (0, webview_helpers_1.tBiHtml)(`${days}d ${remHours}h`, `${days} 天 ${remHours} 小时`)
            : (0, webview_helpers_1.tBiHtml)(`${days}d`, `${days} 天`);
    }
    if (hours > 0) {
        return remMinutes > 0
            ? (0, webview_helpers_1.tBiHtml)(`${hours}h ${remMinutes}m`, `${hours} 小时 ${remMinutes} 分钟`)
            : (0, webview_helpers_1.tBiHtml)(`${hours}h`, `${hours} 小时`);
    }
    return (0, webview_helpers_1.tBiHtml)(`${totalMinutes}m`, `${totalMinutes} 分钟`);
}
function formatRunwayBadgeHtml(estimate) {
    if (!estimate) {
        return '';
    }
    const burnRatePart = typeof estimate.burnRatePctPerHour === 'number'
        && Number.isFinite(estimate.burnRatePctPerHour)
        && estimate.burnRatePctPerHour > 0
        ? ` · ${(0, webview_helpers_1.esc)(estimate.burnRatePctPerHour.toFixed(1))}%/h`
        : '';
    switch (estimate.status) {
        case 'safe_until_reset':
            return `<div class="quota-runway-row" data-runway-status="safe_until_reset">
                <span class="quota-runway-pill is-safe">${(0, webview_helpers_1.tBiHtml)('Safe before reset', '重置前充裕')}${burnRatePart}</span>
            </div>`;
        case 'at_risk': {
            const exhaustHtml = estimate.estExhaustMs !== null
                ? formatRunwayDurationHtml(estimate.estExhaustMs)
                : '—';
            return `<div class="quota-runway-row" data-runway-status="at_risk">
                <span class="quota-runway-pill is-risk">${(0, webview_helpers_1.tBiHtml)('Est. exhaust in', '预计耗尽')} ${exhaustHtml}${burnRatePart}</span>
            </div>`;
        }
        case 'exhausted':
            return `<div class="quota-runway-row" data-runway-status="exhausted">
                <span class="quota-runway-pill is-exhausted">${(0, webview_helpers_1.tBiHtml)('Quota exhausted', '配额已耗尽')}</span>
            </div>`;
        case 'custom_model_isolated':
            return '';
        case 'insufficient_data':
        default:
            if (estimate.recoveredRecently) {
                return `<div class="quota-runway-row" data-runway-status="recovered">
                    <span class="quota-runway-pill is-safe">${(0, webview_helpers_1.tBiHtml)('Quota recently recovered', '配额刚恢复')}</span>
                </div>`;
            }
            if (burnRatePart) {
                return `<div class="quota-runway-row" data-runway-status="insufficient_data">
                    <span class="quota-runway-pill is-muted">${(0, webview_helpers_1.tBiHtml)('Burn rate', '消耗速率')} ${(0, webview_helpers_1.esc)(estimate.burnRatePctPerHour.toFixed(1))}%/h</span>
                </div>`;
            }
            return '';
    }
}
function buildStaleBannerHtml(staleState) {
    if (!staleState?.isStale) {
        return '';
    }
    const lang = (0, i18n_core_1.getLanguage)();
    const lastTime = staleState.lastSuccessAtMs
        ? (0, i18n_core_1.formatClockTime)(new Date(staleState.lastSuccessAtMs), lang)
        : '';
    const updatedPart = lastTime
        ? ` <span class="stale-banner-time">· ${(0, webview_helpers_1.tBiHtml)('Last updated', '上次更新')} ${(0, webview_helpers_1.esc)(lastTime)}</span>`
        : '';
    const errTip = staleState.lastError ? ` title="${(0, webview_helpers_1.esc)(staleState.lastError)}"` : '';
    return `<div class="stale-data-banner" role="status" data-stale-banner="true"${errTip}>
        <span class="stale-badge-pill"><span class="stale-dot" aria-hidden="true"></span><span>${(0, webview_helpers_1.tBiHtml)('Cached / Stale', '缓存数据（待刷新）')}</span></span>
        <span class="stale-banner-desc">${(0, webview_helpers_1.tBiHtml)('Showing last known telemetry while reconnecting to the local backend.', '正在重连本地后端，当前保留上次成功拉取的缓存数据。')}${updatedPart}</span>
    </div>`;
}
function buildCustomModelBannerHtml() {
    return `<div class="custom-model-banner" role="status" data-custom-model-isolated="true">
        <span class="custom-model-pill">${(0, webview_helpers_1.tBiHtml)('Custom Model Isolated', '自定义模型（配额独立）')}</span>
        <span class="custom-model-desc">${(0, webview_helpers_1.tBiHtml)('Active session uses a custom / BYOK model that does not consume Google Antigravity quota pools. Pool alerts are suppressed.', '当前会话使用自定义 / BYOK 模型，不消耗 Google Antigravity 配额池，已自动折叠并静音配额池预警。')}</span>
    </div>`;
}
// ─── v1.17.6 Low-Quota Warning Banner & Jargon Tooltips ──────────────────────
/**
 * Evaluate whether any quota pool's remaining percentage is at or below `threshold`.
 * Automatically suppressed when `threshold <= 0` or `isCustomModelActive` is true.
 */
function evaluateLowQuotaWarning(groups, threshold, isCustomModelActive = false) {
    if (isCustomModelActive) {
        return null;
    }
    if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold <= 0) {
        return null;
    }
    const clampedThreshold = Math.min(99, Math.max(1, Math.round(threshold)));
    const triggered = [];
    for (const group of groups) {
        let minFrac = null;
        let windowLabel;
        let resetTime = group.resetTime;
        const consider = (frac, label, rt) => {
            if (typeof frac !== 'number' || !Number.isFinite(frac) || frac < 0 || frac > 1) {
                return;
            }
            if (minFrac === null || frac < minFrac) {
                minFrac = frac;
                windowLabel = label;
                if (rt !== undefined) {
                    resetTime = rt;
                }
            }
        };
        if (group.fiveHourQuota) {
            consider(group.fiveHourQuota.remainingFraction, (0, i18n_core_1.tBi)('5h', '5h'), group.fiveHourQuota.resetTime);
        }
        if (group.weeklyQuota) {
            consider(group.weeklyQuota.remainingFraction, (0, i18n_core_1.tBi)('Weekly', '周额度'), group.weeklyQuota.resetTime);
        }
        if (minFrac === null && group.minimum !== null) {
            consider(group.minimum, undefined, group.resetTime);
        }
        if (minFrac === null) {
            continue;
        }
        const pct = Math.round(minFrac * 100);
        if (minFrac * 100 <= clampedThreshold || pct <= clampedThreshold) {
            triggered.push({
                poolKey: group.pool || group.key,
                label: group.label,
                remainingPct: pct,
                windowLabel,
                resetTime,
            });
        }
    }
    if (triggered.length === 0) {
        return null;
    }
    triggered.sort((a, b) => a.remainingPct - b.remainingPct);
    return { threshold: clampedThreshold, pools: triggered };
}
function buildLowQuotaWarningBannerHtml(warning, now = Date.now()) {
    if (!warning || !Array.isArray(warning.pools) || warning.pools.length === 0) {
        return '';
    }
    const poolChips = warning.pools.map((pool) => {
        const winPart = pool.windowLabel ? ` (${(0, webview_helpers_1.esc)(pool.windowLabel)})` : '';
        const resetPart = pool.resetTime ? ` · ${formatResetDurationHtml(pool.resetTime, now)}` : '';
        return `<span class="low-quota-pool-chip" data-low-quota-pool="${(0, webview_helpers_1.esc)(pool.poolKey)}">
            <span>${(0, webview_helpers_1.esc)(pool.label)}${winPart}</span>
            <strong>${(0, webview_helpers_1.esc)(String(pool.remainingPct))}%</strong>
            ${resetPart ? `<span class="low-quota-reset">${resetPart}</span>` : ''}
        </span>`;
    }).join('');
    return `<div class="low-quota-banner" id="lowQuotaBanner" role="alert" data-low-quota-banner="true" data-threshold="${warning.threshold}">
        <div class="low-quota-banner-head">
            <span class="low-quota-title">${webview_icons_1.ICON.bolt} <span>${(0, webview_helpers_1.tBiHtml)('Low Quota Warning', '低配额警告')} (≤ ${warning.threshold}%)</span></span>
            <button type="button" class="low-quota-settings-btn" data-overview-target="settings">${(0, webview_helpers_1.tBiHtml)('Threshold', '调整阈值')}</button>
        </div>
        <div class="low-quota-pools">${poolChips}</div>
    </div>`;
}
function jargonTipHtml(key) {
    const copy = {
        'gm-data': [
            'GM Data: Generator Metadata emitted by Antigravity for every LLM request (measured tokens, latency, cache, and credits).',
            'GM 数据：Antigravity 为每次模型请求记录的底层生成元数据（实测 Token、延迟、缓存与积分）。',
        ],
        ttft: [
            'TTFT (Time To First Token): latency from sending a request until the model emits its first token.',
            'TTFT（首字延迟）：从发送请求到模型输出第一个 Token 的等待时间。',
        ],
        'dual-cap': [
            'Dual-Cap: compares Effective Budget (platform auto-compaction ceiling) against Native Ceiling (underlying model physical window).',
            '双上限：对照有效预算（平台自动压缩上限）与原生上限（底层模型物理窗口）。',
        ],
        'compaction-vs-physical': [
            'Compaction Limit vs Physical Window: Antigravity triggers auto-compaction at the Compaction Limit before the model Physical Window fills up.',
            '自动压缩上限 vs 物理窗口：Antigravity 会在到达自动压缩上限时自动压缩对话，早于模型物理窗口耗尽。',
        ],
        'mapped-base-rate': [
            'Mapped Base Rate: legacy fixed Orchestrator IDs (M537/M667/M681/M669) lack public rate cards; Mapped Base mode estimates cost via their underlying base model official rate.',
            '按底座估算：旧版固定编排 ID（M537/M667/M681/M669）无独立公开价目表，按底座估算模式会使用其底座模型官方单价进行估算。',
        ],
    };
    const [en, zh] = copy[key];
    const tip = (0, i18n_core_1.tBi)(en, zh);
    return `<span class="jargon-tip" tabindex="0" role="note" data-jargon="${key}" title="${(0, webview_helpers_1.esc)(tip)}" aria-label="${(0, webview_helpers_1.esc)(tip)}">?</span>`;
}
// ─── Overview Rendering Helpers ──────────────────────────────────────────────
const arrow = '<svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h9m-4-4 4 4-4 4"/></svg>';
function number(value, digits = 0) {
    return (0, monitor_overview_1.usableCount)(value) ? (0, i18n_core_1.formatNumber)(value, {
        maximumFractionDigits: digits,
    }) : '—';
}
function metric(labelHtml, valueHtml) {
    return `<div class="overview-metric"><dt>${labelHtml}</dt><dd>${valueHtml}</dd></div>`;
}
function contextMeterTone(percent) {
    if (percent >= 80) {
        return 'attention';
    }
    if (percent >= 65) {
        return 'warn';
    }
    return 'default';
}
function quotaMeterTone(percent) {
    if (percent <= 20) {
        return 'attention';
    }
    if (percent < 50) {
        return 'warn';
    }
    return 'healthy';
}
function meter(label, value, spoken, tone) {
    const fill = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    const toneClass = tone === 'default' ? '' : ` is-${tone}`;
    return `<div class="overview-meter${toneClass}" role="meter"
        aria-label="${(0, webview_helpers_1.esc)(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}" aria-valuetext="${(0, webview_helpers_1.esc)(spoken)}">
        <span aria-hidden="true" style="width:${fill}%"></span>
    </div>`;
}
function statusHeadingHtml(state) {
    switch (state) {
        case 'connecting': return (0, webview_helpers_1.tBiHtml)('Connecting to Antigravity', '正在连接 Antigravity');
        case 'disconnected': return (0, webview_helpers_1.tBiHtml)('Backend disconnected', '后端连接已断开');
        case 'empty': return (0, webview_helpers_1.tBiHtml)('No active conversation', '无活跃会话');
        case 'idle': return (0, webview_helpers_1.tBiHtml)('Conversation idle', '会话空闲');
        case 'active': return (0, webview_helpers_1.tBiHtml)('Active conversation', '会话进行中');
    }
}
function backendMessageHtml(issue) {
    if (issue === 'notFound') {
        return (0, webview_helpers_1.tBiHtml)('Antigravity backend not found. Waiting for the language server or agy hub.', '未找到 Antigravity 后端，正在等待语言服务器或 agy hub 启动。');
    }
    if (issue === 'lost') {
        return (0, webview_helpers_1.tBiHtml)('Connection to the Antigravity backend was lost. Reconnecting...', '与 Antigravity 后端的连接已断开，正在重新连接...');
    }
    return (0, webview_helpers_1.tBiHtml)('Unable to read the local backend. Refresh to try again.', '无法读取本地后端，请刷新后重试。');
}
function modelFamilyCountHtml(count) {
    return (0, webview_helpers_1.tBiHtml)(count === 1 ? '1 model' : `${count} models`, `${count} 个模型`);
}
function formatResetDurationHtml(resetTime, now) {
    if (!resetTime) {
        return (0, webview_helpers_1.tBiHtml)('Reset time unavailable', '暂无重置时间');
    }
    const at = Date.parse(resetTime);
    if (!Number.isFinite(at) || at <= 0 || !Number.isFinite(now)) {
        return (0, webview_helpers_1.tBiHtml)('Reset time unavailable', '暂无重置时间');
    }
    const minutes = Math.ceil((at - now) / 60_000);
    let remaining;
    if (minutes <= 0) {
        remaining = (0, webview_helpers_1.tBiHtml)('Reset time passed', '已到重置时间');
    }
    else {
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        const remMinutes = minutes % 60;
        if (days > 0) {
            remaining = remHours > 0
                ? (0, webview_helpers_1.tBiHtml)(`${days}d ${remHours}h`, `${days} 天 ${remHours} 小时`)
                : (0, webview_helpers_1.tBiHtml)(`${days}d`, `${days} 天`);
        }
        else if (hours > 0) {
            remaining = remMinutes > 0
                ? (0, webview_helpers_1.tBiHtml)(`${hours}h ${remMinutes}m`, `${hours} 小时 ${remMinutes} 分钟`)
                : (0, webview_helpers_1.tBiHtml)(`${hours}h`, `${hours} 小时`);
        }
        else {
            remaining = (0, webview_helpers_1.tBiHtml)(`${minutes}m`, `${minutes} 分钟`);
        }
    }
    return `${remaining} · ${(0, webview_helpers_1.esc)((0, reset_time_1.formatResetAbsolute)(resetTime))}`;
}
function quotaResetHtml(group, now) {
    if (group.resetDiffers) {
        return (0, webview_helpers_1.tBiHtml)('Reset times vary', '重置时间不同');
    }
    return formatResetDurationHtml(group.resetTime, now);
}
function dualQuotaWindowHtml(groupLabel, kind, win, now) {
    const labelHtml = kind === '5h' ? (0, webview_helpers_1.tBiHtml)('5-Hour', '5 小时') : (0, webview_helpers_1.tBiHtml)('Weekly', '每周');
    const labelPlain = kind === '5h' ? (0, i18n_core_1.tBi)('5-Hour', '5 小时') : (0, i18n_core_1.tBi)('Weekly', '每周');
    const rawFrac = win.remainingFraction;
    const validFrac = typeof rawFrac === 'number' && Number.isFinite(rawFrac) && rawFrac >= 0 && rawFrac <= 1 ? rawFrac : null;
    const unknown = validFrac === null;
    const pctText = unknown ? (0, i18n_core_1.tBi)('Unknown', '未知') : (0, monitor_overview_1.formatQuotaWindowPercent)(validFrac);
    const pctHtml = unknown ? `<span class="overview-quota-unknown">${(0, webview_helpers_1.tBiHtml)('Unknown', '未知')}</span>` : `<strong>${(0, webview_helpers_1.esc)(pctText)}</strong>`;
    const meterHtml = unknown
        ? '<div class="overview-meter is-unknown" aria-hidden="true"></div>'
        : meter(`${groupLabel} · ${labelPlain}`, validFrac * 100, pctText, quotaMeterTone(validFrac * 100));
    return `<div class="quota-dual-item" data-quota-window="${kind}">
        <div class="quota-dual-head">
            <span class="quota-dual-label">${labelHtml}</span>
            <span class="quota-dual-pct">${pctHtml}</span>
        </div>
        ${meterHtml}
        <p class="overview-meta quota-dual-reset">${formatResetDurationHtml(win.resetTime, now)}</p>
    </div>`;
}
function creditExpiryHtml(days) {
    if (days === null || !Number.isFinite(days) || days < 0) {
        return (0, webview_helpers_1.tBiHtml)('Expiry date not set', '未设置到期日');
    }
    if (days === 0) {
        return (0, webview_helpers_1.tBiHtml)('Expires today', '今日到期');
    }
    return (0, webview_helpers_1.tBiHtml)(days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`, `${days} 天后到期`);
}
function cacheWarmthMeta(state) {
    switch (state) {
        case 'warm':
            return { cls: 'is-warm', html: (0, webview_helpers_1.tBiHtml)('Warm', '已命中') };
        case 'warming':
            return { cls: 'is-warming', html: (0, webview_helpers_1.tBiHtml)('Warming', '预热中') };
        case 'cold':
            return { cls: 'is-cold', html: (0, webview_helpers_1.tBiHtml)('Cold', '未命中') };
        default:
            return null;
    }
}
function formatOverviewCostInCurrency(usd, displayCurrency) {
    if (usd === undefined || !Number.isFinite(usd) || usd < 0) {
        return null;
    }
    const { preset } = (0, cli_usage_scanner_1.resolveCurrencyConfig)(displayCurrency);
    if (preset.code === 'USD') {
        const formatted = (0, monitor_overview_1.formatOverviewCost)(usd);
        return formatted ? { display: formatted } : null;
    }
    const display = (0, cli_usage_scanner_1.formatCurrencyAmount)(usd, displayCurrency);
    if (!display || display === '—') {
        return null;
    }
    return {
        display,
        title: (0, cli_usage_scanner_1.formatDualCurrencyAmount)(usd, displayCurrency),
    };
}
function buildCostTelemetryCell(sessionCostUsd, todayCostUsd, displayCurrency, orchestratorPricingMode) {
    const sessionCost = formatOverviewCostInCurrency(sessionCostUsd, displayCurrency);
    const todayCost = formatOverviewCostInCurrency(todayCostUsd, displayCurrency);
    if (!sessionCost && !todayCost) {
        return '';
    }
    const mappedTip = orchestratorPricingMode !== 'strict' ? jargonTipHtml('mapped-base-rate') : '';
    if (sessionCost) {
        const subHtml = todayCost
            ? `<span class="overview-telemetry-sub">${(0, webview_helpers_1.tBiHtml)('Today', '今日')} ${(0, webview_helpers_1.esc)(todayCost.display)}</span>`
            : '';
        const titleParts = [sessionCost.title, todayCost?.title ? `${(0, i18n_core_1.tBi)('Today', '今日')}: ${todayCost.title}` : ''].filter(Boolean);
        const titleAttr = titleParts.length ? ` title="${(0, webview_helpers_1.esc)(titleParts.join(' · '))}"` : '';
        return `<div class="overview-telemetry-cell" data-telemetry-cell="cost"${titleAttr}>
            <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('Session Cost', '会话费用')}${mappedTip}</span>
            <strong class="overview-telemetry-value">${(0, webview_helpers_1.esc)(sessionCost.display)}</strong>
            ${subHtml}
        </div>`;
    }
    const titleAttr = todayCost?.title ? ` title="${(0, webview_helpers_1.esc)(todayCost.title)}"` : '';
    return `<div class="overview-telemetry-cell" data-telemetry-cell="cost"${titleAttr}>
        <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('Today Cost', '今日费用')}${mappedTip}</span>
        <strong class="overview-telemetry-value">${(0, webview_helpers_1.esc)(todayCost.display)}</strong>
    </div>`;
}
function telemetryStrip(snapshot, sessionCostUsd, todayCostUsd, options) {
    const { primary, primaryScope, speedPrimary, ttftPrimary } = snapshot;
    // 1. Speed (with sparse-sample Short sample / Waiting TTFT guard)
    const speedSample = options?.speedSample
        ?? primary.latestSpeedSample
        ?? (primary.latestCall
            ? (0, orchestrator_attribution_1.evaluateSpeedSample)({
                outputTokens: primary.latestCall.outputTokens,
                streamingSeconds: primary.latestCall.streamingSeconds,
                ttftSeconds: primary.latestCall.ttftSeconds,
            })
            : null);
    let speedHtml;
    let speedClass = '';
    let speedStateAttr = '';
    if (speedSample?.isWaitingTtft) {
        const waitSuffix = typeof speedSample.waitingSeconds === 'number' && Number.isFinite(speedSample.waitingSeconds) && speedSample.waitingSeconds > 0
            ? ` (${speedSample.waitingSeconds.toFixed(1)}s)`
            : '';
        speedHtml = `${(0, webview_helpers_1.tBiHtml)('Waiting TTFT', '等待首字')}${(0, webview_helpers_1.esc)(waitSuffix)}`;
        speedClass = ' is-muted is-short-sample';
        speedStateAttr = ' data-speed-state="waiting-ttft"';
    }
    else if (speedSample?.isShortSample) {
        speedHtml = (0, webview_helpers_1.tBiHtml)('Short sample', '短样本');
        speedClass = ' is-muted is-short-sample';
        speedStateAttr = ' data-speed-state="short-sample"';
    }
    else {
        speedHtml = (0, webview_helpers_1.esc)((0, telemetry_metrics_1.formatSpeed)(speedPrimary));
        speedClass = speedPrimary === null ? ' is-muted' : '';
    }
    let speedSubHtml = '';
    if (speedSample?.isShortSample && primary.weightedGenTokPerSec !== null) {
        speedSubHtml = (0, webview_helpers_1.esc)(`avg ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedGenTokPerSec)}`);
    }
    else if (primary.hasThinking && primary.weightedVisibleTokPerSec !== null) {
        speedSubHtml = (0, webview_helpers_1.esc)(`resp ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedVisibleTokPerSec)}`);
    }
    else if (primary.latestGenTokPerSec !== null
        && primary.weightedGenTokPerSec !== null
        && (0, telemetry_metrics_1.formatSpeed)(primary.latestGenTokPerSec) !== (0, telemetry_metrics_1.formatSpeed)(primary.weightedGenTokPerSec)) {
        speedSubHtml = (0, webview_helpers_1.esc)(`avg ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedGenTokPerSec)}`);
    }
    const speedTipParts = [];
    if (speedSample?.isShortSample && speedSample.rawSpeed !== null) {
        speedTipParts.push(`${(0, i18n_core_1.tBi)('Raw (short sample)', '原始值（短样本）')}: ${(0, telemetry_metrics_1.formatSpeed)(speedSample.rawSpeed)}`);
    }
    if (primary.latestGenTokPerSec !== null) {
        speedTipParts.push(`${(0, i18n_core_1.tBi)('Latest', '最近')}: ${(0, telemetry_metrics_1.formatSpeed)(primary.latestGenTokPerSec)}`);
    }
    if (primary.weightedGenTokPerSec !== null) {
        speedTipParts.push(`${(0, i18n_core_1.tBi)('Weighted Avg', '加权平均')}: ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedGenTokPerSec)}`);
    }
    if (primary.hasThinking && primary.weightedVisibleTokPerSec !== null) {
        speedTipParts.push(`${(0, i18n_core_1.tBi)('Visible Speed', '可见速度')}: ${(0, telemetry_metrics_1.formatSpeed)(primary.weightedVisibleTokPerSec)}`);
    }
    const speedTitleAttr = speedTipParts.length ? ` title="${(0, webview_helpers_1.esc)(speedTipParts.join(' · '))}"` : '';
    // 2. TTFT
    const ttftValue = (0, telemetry_metrics_1.formatLatency)(ttftPrimary);
    const ttftClass = ttftPrimary === null ? ' is-muted' : '';
    let ttftSubHtml = '';
    if (primary.cachedAvgTtftSeconds !== null) {
        ttftSubHtml = (0, webview_helpers_1.esc)(`cached ${(0, telemetry_metrics_1.formatLatency)(primary.cachedAvgTtftSeconds)}`);
    }
    else if (primary.medianTtftSeconds !== null) {
        ttftSubHtml = (0, webview_helpers_1.esc)(`p50 ${(0, telemetry_metrics_1.formatLatency)(primary.medianTtftSeconds)}`);
    }
    const ttftTipParts = [];
    if (primary.avgTtftSeconds !== null) {
        ttftTipParts.push(`${(0, i18n_core_1.tBi)('Avg TTFT', '平均首字延迟')}: ${(0, telemetry_metrics_1.formatLatency)(primary.avgTtftSeconds)}`);
    }
    if (primary.cachedAvgTtftSeconds !== null) {
        ttftTipParts.push(`${(0, i18n_core_1.tBi)('Cached TTFT', '缓存命中首字')}: ${(0, telemetry_metrics_1.formatLatency)(primary.cachedAvgTtftSeconds)}`);
    }
    if (primary.uncachedAvgTtftSeconds !== null) {
        ttftTipParts.push(`${(0, i18n_core_1.tBi)('Uncached TTFT', '未命中首字')}: ${(0, telemetry_metrics_1.formatLatency)(primary.uncachedAvgTtftSeconds)}`);
    }
    const ttftTitleAttr = ttftTipParts.length ? ` title="${(0, webview_helpers_1.esc)(ttftTipParts.join(' · '))}"` : '';
    // 3. Cache Hit
    const cacheHitValue = (0, telemetry_metrics_1.formatCachePercent)(primary.tokenCacheHitRate);
    const cacheHitClass = primary.tokenCacheHitRate !== null && primary.tokenCacheHitRate > 0
        ? ' is-cache'
        : ' is-muted';
    const cacheHitSubHtml = primary.totalCacheReadTokens > 0
        ? (0, webview_helpers_1.esc)(`${(0, monitor_overview_1.formatCompactTokens)(primary.totalCacheReadTokens)} · ${primary.cachedCallCount}/${primary.totalCalls}`)
        : (primary.totalCalls > 0 ? (0, webview_helpers_1.esc)(`${primary.cachedCallCount}/${primary.totalCalls}`) : '');
    const cacheHitTitleAttr = primary.totalPromptTokens > 0
        ? ` title="${(0, webview_helpers_1.esc)(`${(0, monitor_overview_1.formatCompactTokens)(primary.totalCacheReadTokens)} / ${(0, monitor_overview_1.formatCompactTokens)(primary.totalPromptTokens)} tokens · ${primary.cachedCallCount}/${primary.totalCalls}`)}"`
        : '';
    // 4. Cache Saved
    const savingsFormatted = (0, monitor_overview_1.formatOverviewSavings)(primary.estCacheSavingsUsd);
    const { preset: currencyPreset } = (0, cli_usage_scanner_1.resolveCurrencyConfig)(options?.displayCurrency);
    let savedValueHtml;
    let savedClass = '';
    let savedTitleAttr = '';
    if (savingsFormatted !== null && primary.estCacheSavingsUsd !== null) {
        const displaySav = currencyPreset.code === 'USD'
            ? savingsFormatted
            : (0, cli_usage_scanner_1.formatCurrencyAmount)(primary.estCacheSavingsUsd, options?.displayCurrency);
        savedValueHtml = (0, webview_helpers_1.esc)(displaySav);
        const savRef = currencyPreset.code === 'USD'
            ? savingsFormatted
            : (0, cli_usage_scanner_1.formatDualCurrencyAmount)(primary.estCacheSavingsUsd, options?.displayCurrency);
        if (primary.estCacheSavedTokens > 0) {
            savedTitleAttr = ` title="${(0, webview_helpers_1.esc)(`${savRef} · ${(0, monitor_overview_1.formatCompactTokens)(primary.estCacheSavedTokens)} tokens`)}"`;
        }
        else if (currencyPreset.code !== 'USD') {
            savedTitleAttr = ` title="${(0, webview_helpers_1.esc)(savRef)}"`;
        }
    }
    else if (primary.estCacheSavedTokens > 0) {
        savedValueHtml = `${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(primary.estCacheSavedTokens))} tokens`;
        savedTitleAttr = ` title="${(0, webview_helpers_1.esc)(`${(0, monitor_overview_1.formatCompactTokens)(primary.estCacheSavedTokens)} tokens`)}"`;
    }
    else {
        savedValueHtml = '—';
        savedClass = ' is-muted';
    }
    const warmth = cacheWarmthMeta(primary.latestCacheState);
    const costCellHtml = buildCostTelemetryCell(sessionCostUsd, todayCostUsd, options?.displayCurrency, options?.orchestratorPricingMode);
    const ariaLabel = primaryScope === 'active'
        ? (0, i18n_core_1.tBi)('Active conversation speed and prompt cache', '当前会话速度与提示词缓存')
        : (0, i18n_core_1.tBi)('Session speed and prompt cache', '会话速度与提示词缓存');
    return `<div class="overview-telemetry-strip${costCellHtml ? ' has-cost' : ''}" data-telemetry-scope="${primaryScope}" role="group" aria-label="${(0, webview_helpers_1.esc)(ariaLabel)}">
        <div class="overview-telemetry-cell"${speedTitleAttr}${speedStateAttr}>
            <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('Speed', '生成速度')}</span>
            <strong class="overview-telemetry-value${speedClass}">${speedHtml}</strong>
            ${speedSubHtml ? `<span class="overview-telemetry-sub">${speedSubHtml}</span>` : ''}
        </div>
        <div class="overview-telemetry-cell"${ttftTitleAttr}>
            <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('TTFT', '首字延迟')}${jargonTipHtml('ttft')}</span>
            <strong class="overview-telemetry-value${ttftClass}">${(0, webview_helpers_1.esc)(ttftValue)}</strong>
            ${ttftSubHtml ? `<span class="overview-telemetry-sub">${ttftSubHtml}</span>` : ''}
        </div>
        <div class="overview-telemetry-cell"${cacheHitTitleAttr}>
            <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('Cache Hit', '缓存命中')}</span>
            <strong class="overview-telemetry-value${cacheHitClass}">${(0, webview_helpers_1.esc)(cacheHitValue)}</strong>
            ${cacheHitSubHtml ? `<span class="overview-telemetry-sub">${cacheHitSubHtml}</span>` : ''}
        </div>
        <div class="overview-telemetry-cell"${savedTitleAttr}>
            <span class="overview-telemetry-label">${(0, webview_helpers_1.tBiHtml)('Cache Saved', '缓存节省')}</span>
            <strong class="overview-telemetry-value${savedClass}">${savedValueHtml}</strong>
            ${warmth ? `<span class="overview-telemetry-sub ${warmth.cls}">${warmth.html}</span>` : ''}
        </div>
        ${costCellHtml}
    </div>`;
}
// ─── Context Composition Breakdown Card (v1.17.5) ────────────────────────────
function measurementBadgeMeta(state) {
    switch (state) {
        case 'measured':
            return { cls: 'is-measured', html: (0, webview_helpers_1.tBiHtml)('Measured', '实测') };
        case 'estimated_post_compaction':
            return { cls: 'is-compacted', html: (0, webview_helpers_1.tBiHtml)('Estimated (Post-Compaction)', '估算（压缩后）') };
        case 'estimated_rewind':
            return { cls: 'is-rewind', html: (0, webview_helpers_1.tBiHtml)('Estimated (Rewind)', '估算（回退重算）') };
        case 'awaiting_generation':
        default:
            return { cls: 'is-awaiting', html: (0, webview_helpers_1.tBiHtml)('Awaiting Generation', '等待生成') };
    }
}
function categoryFallbackColor(key) {
    return context_breakdown_1.CONTEXT_CATEGORY_META[key]?.fallbackColor || '#8A96A8';
}
function buildContextBreakdownCard(cb) {
    if (!cb) {
        return '';
    }
    const badge = measurementBadgeMeta(cb.measurementState);
    const capacity = cb.effectiveBudgetTokens > 0
        ? cb.effectiveBudgetTokens
        : (cb.nativeLimitTokens > 0 ? cb.nativeLimitTokens : cb.usedTokens);
    const latestCompaction = cb.compactionCheckpoints.length > 0
        ? cb.compactionCheckpoints[cb.compactionCheckpoints.length - 1]
        : null;
    // ── Dual-Cap Clarity strip ──
    const dualCapHtml = cb.hasDualCap ? `<div class="ctx-dual-cap-row" data-dual-cap="true">
        <div class="ctx-cap-pill is-effective">
            <span class="ctx-cap-label">${(0, webview_helpers_1.tBiHtml)('Effective Budget', '有效预算')}${jargonTipHtml('dual-cap')}</span>
            <strong class="ctx-cap-value">${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(cb.usedTokens))} / ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(cb.effectiveBudgetTokens))}</strong>
            <span class="ctx-cap-pct">${(0, webview_helpers_1.esc)(cb.effectivePct.toFixed(1))}%</span>
        </div>
        <div class="ctx-cap-pill is-native">
            <span class="ctx-cap-label">${(0, webview_helpers_1.tBiHtml)('Native Ceiling', '原生上限')}${jargonTipHtml('compaction-vs-physical')}</span>
            <strong class="ctx-cap-value">${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(cb.usedTokens))} / ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(cb.nativeLimitTokens))}</strong>
            <span class="ctx-cap-pct">${(0, webview_helpers_1.esc)(cb.nativePct.toFixed(1))}%</span>
        </div>
    </div>` : '';
    // ── Compaction saved summary chip ──
    const compactionChipHtml = latestCompaction && latestCompaction.savedTokens > 0
        ? `<div class="ctx-compaction-chip" data-compaction-saved="${latestCompaction.savedTokens}">
            <span class="ctx-compaction-label">${(0, webview_helpers_1.tBiHtml)('Compaction checkpoint saved', '压缩检查点节省')}</span>
            <strong>−${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(latestCompaction.savedTokens))} tokens</strong>
            <span class="ctx-compaction-range">(${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(latestCompaction.beforeTokens))} → ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(latestCompaction.afterTokens))})</span>
        </div>`
        : '';
    const isAwaiting = cb.measurementState === 'awaiting_generation' || cb.segments.length === 0;
    let vizHtml = '';
    if (isAwaiting) {
        vizHtml = `<p class="ctx-awaiting-msg">${(0, webview_helpers_1.tBiHtml)('Awaiting model generation metadata to measure context composition.', '等待模型生成元数据以统计上下文构成。')}</p>`;
    }
    else {
        const denom = Math.max(capacity, cb.usedTokens, 1);
        const segBarSlices = cb.segments.map((seg) => {
            const rawW = (seg.tokens / denom) * 100;
            const widthPct = Math.max(0.8, Math.min(100, rawW));
            const fallback = categoryFallbackColor(seg.key);
            const tip = `${(0, i18n_core_1.tBi)(seg.labelEn, seg.labelZh)}: ${(0, i18n_core_1.formatNumber)(seg.tokens)} tokens (${seg.pct.toFixed(1)}%)`;
            return `<span class="ctx-seg-slice" data-ctx-cat="${seg.key}" style="width:${widthPct.toFixed(2)}%;background:var(${seg.colorToken}, ${fallback})" title="${(0, webview_helpers_1.esc)(tip)}"></span>`;
        }).join('');
        const freeTokens = Math.max(0, capacity - cb.usedTokens);
        const freePct = capacity > 0 ? Math.max(0, (freeTokens / denom) * 100) : 0;
        const freeSlice = freePct > 0.5
            ? `<span class="ctx-seg-slice is-free" data-ctx-cat="free" style="width:${freePct.toFixed(2)}%" title="${(0, webview_helpers_1.esc)(`${(0, i18n_core_1.tBi)('Free', '剩余可用')}: ${(0, i18n_core_1.formatNumber)(freeTokens)} tokens`)}"></span>`
            : '';
        const summarySpoken = `${(0, i18n_core_1.tBi)('Context composition', '上下文构成')}: ${(0, monitor_overview_1.formatCompactTokens)(cb.usedTokens)} / ${(0, monitor_overview_1.formatCompactTokens)(capacity)} (${cb.effectivePct.toFixed(1)}%), ${cb.segments.slice(0, 4).map(s => `${(0, i18n_core_1.tBi)(s.labelEn, s.labelZh)} ${s.pct.toFixed(1)}%`).join(', ')}`;
        // 20x5 = 100-dot matrix
        const dotCells = (0, context_breakdown_1.buildDotMatrix)(cb.segments, cb.usedTokens, capacity, 100);
        const dotsHtml = dotCells.map((cell) => {
            if (cell.isFree) {
                return `<span class="ctx-dot is-free" data-ctx-cat="free" aria-hidden="true"></span>`;
            }
            const fallback = categoryFallbackColor(cell.category);
            const dotTip = `${(0, i18n_core_1.tBi)(cell.labelEn, cell.labelZh)}`;
            return `<span class="ctx-dot" data-ctx-cat="${cell.category}" style="background:var(${cell.colorToken}, ${fallback})" title="${(0, webview_helpers_1.esc)(dotTip)}" aria-hidden="true"></span>`;
        }).join('');
        // Interactive legend (only populated segments — never fake 0s)
        const legendHtml = cb.segments.map((seg) => {
            const fallback = categoryFallbackColor(seg.key);
            return `<li class="ctx-legend-row"><button type="button" class="ctx-legend-item" data-ctx-cat="${seg.key}">
                <span class="ctx-legend-swatch" style="background:var(${seg.colorToken}, ${fallback})" aria-hidden="true"></span>
                <span class="ctx-legend-name">${(0, webview_helpers_1.tBiHtml)(seg.labelEn, seg.labelZh)}</span>
                <span class="ctx-legend-val">${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(seg.tokens))}</span>
                <span class="ctx-legend-pct">${(0, webview_helpers_1.esc)(seg.pct.toFixed(1))}%</span>
            </button></li>`;
        }).join('');
        vizHtml = `
            <div class="ctx-viz-bar-wrap">
                <div class="ctx-seg-bar" role="img" aria-label="${(0, webview_helpers_1.esc)(summarySpoken)}">${segBarSlices}${freeSlice}</div>
            </div>
            <div class="ctx-viz-dots-wrap">
                <div class="ctx-dot-matrix" role="img" aria-label="${(0, webview_helpers_1.esc)(summarySpoken)}">${dotsHtml}</div>
            </div>
            <ul class="ctx-legend" aria-label="${(0, webview_helpers_1.esc)((0, i18n_core_1.tBi)('Context category breakdown', '上下文分类明细'))}">${legendHtml}</ul>`;
    }
    // ── Largest Items (collapsible Top 5) ──
    const largestItemsHtml = cb.largestItems.length > 0 ? `
        <details id="overview-largest-items" class="ctx-largest-details" data-state-key="overview-largest-items">
            <summary>
                <span>${(0, webview_helpers_1.tBiHtml)('Largest Items', '最大占用项')}</span>
                <span class="ctx-largest-count">${cb.largestItems.length}</span>
            </summary>
            <ol class="ctx-largest-list">
                ${cb.largestItems.slice(0, 5).map((item) => {
        const meta = context_breakdown_1.CONTEXT_CATEGORY_META[item.category];
        const fallback = meta?.fallbackColor || '#8A96A8';
        const colorToken = meta?.colorToken || '--ctx-cat-other';
        return `<li class="ctx-largest-row" data-ctx-cat="${item.category}">
                        <span class="ctx-legend-swatch" style="background:var(${colorToken}, ${fallback})" aria-hidden="true"></span>
                        <span class="ctx-largest-title" title="${(0, webview_helpers_1.esc)(item.title)}">${(0, webview_helpers_1.esc)(item.title)}</span>
                        <span class="ctx-largest-tokens">${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(item.tokens))}</span>
                        <span class="ctx-largest-pct">${(0, webview_helpers_1.esc)(item.pct.toFixed(1))}%</span>
                    </li>`;
    }).join('')}
            </ol>
        </details>` : '';
    // ── One-click Quick Actions ──
    const quickActionsHtml = `<div class="ctx-quick-actions">
        <button type="button" class="ctx-action-btn" id="copyContextReportBtn" data-action="copyContextReport">${webview_icons_1.ICON.copy} <span>${(0, webview_helpers_1.tBiHtml)('Copy /context Report', '复制 /context 报告')}</span></button>
        <button type="button" class="ctx-action-btn" id="copyHandoffPromptBtn" data-action="copyHandoffPrompt">${webview_icons_1.ICON.file} <span>${(0, webview_helpers_1.tBiHtml)('Copy Handoff Prompt', '复制交接提示词')}</span></button>
        <span id="ctxCopyFeedback" class="threshold-feedback" role="status"></span>
    </div>`;
    return `<section class="ctx-breakdown-card" data-ctx-breakdown="true" data-viz-mode="bar" aria-labelledby="ctx-breakdown-heading">
        <header class="ctx-breakdown-head">
            <div class="ctx-breakdown-title-wrap">
                <h4 id="ctx-breakdown-heading">${(0, webview_helpers_1.tBiHtml)('Context Composition', '上下文构成')}</h4>
                <span class="ctx-measure-badge ${badge.cls}" data-measurement-state="${cb.measurementState}">${badge.html}</span>
            </div>
            ${isAwaiting ? '' : `<div class="ctx-viz-toggle" role="group" aria-label="${(0, webview_helpers_1.esc)((0, i18n_core_1.tBi)('Visualization mode', '视图模式'))}">
                <button type="button" class="ctx-viz-btn is-active" data-ctx-viz="bar" aria-pressed="true">${(0, webview_helpers_1.tBiHtml)('Bar View', '条形视图')}</button>
                <button type="button" class="ctx-viz-btn" data-ctx-viz="dots" aria-pressed="false">${(0, webview_helpers_1.tBiHtml)('Dot Matrix', '点阵视图')}</button>
            </div>`}
        </header>
        ${dualCapHtml}
        ${compactionChipHtml}
        ${vizHtml}
        ${largestItemsHtml}
        ${quickActionsHtml}
    </section>`;
}
function buildDualWatermarkMeterHtml(label, percent, spoken, tone, watermarks) {
    const baseMeter = meter(label, percent, spoken, tone);
    if (!watermarks) {
        return baseMeter;
    }
    const markers = [];
    const pills = [];
    if (watermarks.showLongContextMarker && watermarks.longContextMarkerPctOfCompaction !== null) {
        const leftPct = Math.max(2, Math.min(98, watermarks.longContextMarkerPctOfCompaction));
        const exceeded = watermarks.exceedsLongContextTier;
        const tip = exceeded
            ? (0, i18n_core_1.tBi)(`200k long-context pricing tier exceeded (${(0, monitor_overview_1.formatCompactTokens)(watermarks.contextUsed)} / 200k tokens). Higher per-token rates may apply.`, `已超过 200k 长上下文阶梯计费线（当前 ${(0, monitor_overview_1.formatCompactTokens)(watermarks.contextUsed)} / 200k tokens），可能触发更高阶梯单价。`)
            : (0, i18n_core_1.tBi)(`200k long-context pricing tier threshold (${(0, monitor_overview_1.formatCompactTokens)(watermarks.tokensUntilLongContextTier ?? 0)} tokens remaining before 200k).`, `200k 长上下文阶梯计费线（距离 200k 还有 ${(0, monitor_overview_1.formatCompactTokens)(watermarks.tokensUntilLongContextTier ?? 0)} tokens）。`);
        markers.push(`<span class="overview-watermark-tick is-tier-200k${exceeded ? ' is-exceeded' : ''}" data-watermark="long-context-200k" style="left:${leftPct.toFixed(1)}%" title="${(0, webview_helpers_1.esc)(tip)}" aria-hidden="true"></span>`);
        pills.push(`<span class="overview-watermark-pill${exceeded ? ' is-tier-exceeded' : ''}" data-watermark-pill="long-context-200k" title="${(0, webview_helpers_1.esc)(tip)}">${exceeded
            ? (0, webview_helpers_1.tBiHtml)('> 200k Tier', '已超 200k 阶梯')
            : `${(0, webview_helpers_1.tBiHtml)('200k Tier', '200k 阶梯')} · ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(watermarks.tokensUntilLongContextTier ?? 0))} ${(0, webview_helpers_1.tBiHtml)('left', '剩余')}`}</span>`);
    }
    if (watermarks.hasDistinctPhysicalWindow) {
        const compTip = (0, i18n_core_1.tBi)(`Compaction ceiling at ${(0, monitor_overview_1.formatCompactTokens)(watermarks.compactionLimit)} (${watermarks.compactionMarkerPct.toFixed(0)}% of ${(0, monitor_overview_1.formatCompactTokens)(watermarks.physicalContextWindow)} physical window).`, `自动压缩上限为 ${(0, monitor_overview_1.formatCompactTokens)(watermarks.compactionLimit)}（占 ${(0, monitor_overview_1.formatCompactTokens)(watermarks.physicalContextWindow)} 物理窗口的 ${watermarks.compactionMarkerPct.toFixed(0)}%）。`);
        markers.push(`<span class="overview-watermark-tick is-compaction-cap" data-watermark="compaction-limit" style="left:100%" title="${(0, webview_helpers_1.esc)(compTip)}" aria-hidden="true"></span>`);
        pills.push(`<span class="overview-watermark-pill" data-watermark-pill="compaction-limit" title="${(0, webview_helpers_1.esc)(compTip)}">${(0, webview_helpers_1.tBiHtml)('Compaction', '压缩上限')} ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(watermarks.compactionLimit))} / ${(0, webview_helpers_1.tBiHtml)('Physical', '物理窗口')} ${(0, webview_helpers_1.esc)((0, monitor_overview_1.formatCompactTokens)(watermarks.physicalContextWindow))}${jargonTipHtml('compaction-vs-physical')}</span>`);
    }
    if (markers.length === 0 && pills.length === 0) {
        return baseMeter;
    }
    return `<div class="overview-meter-wrap" data-dual-watermark="true">
        ${baseMeter}
        ${markers.length > 0 ? `<div class="overview-meter-markers">${markers.join('')}</div>` : ''}
    </div>
    ${pills.length > 0 ? `<div class="overview-watermark-meta">${pills.join('')}</div>` : ''}`;
}
function buildTurnCacheSummaryHtml(turnCacheInfo) {
    const latest = turnCacheInfo?.latestTurn;
    if (!latest || latest.cacheStart === 'unknown') {
        return '';
    }
    let pillCls = 'is-cold';
    let pillHtml = (0, webview_helpers_1.tBiHtml)('Cold Start', '冷启动');
    if (latest.cacheStart === 'warm') {
        pillCls = 'is-warm';
        pillHtml = (0, webview_helpers_1.tBiHtml)('Warm Start', '热缓存启动');
    }
    else if (latest.cacheStart === 'partial') {
        pillCls = 'is-partial';
        pillHtml = (0, webview_helpers_1.tBiHtml)('Partial Start', '部分命中');
    }
    const hitPctHtml = latest.cacheHitPct !== null
        ? ` <span>(${(0, webview_helpers_1.esc)(latest.cacheHitPct.toFixed(0))}%)</span>`
        : '';
    let deltaHtml = '';
    if (latest.netContextDeltaTokens !== null) {
        const sign = latest.netContextDeltaTokens >= 0 ? '+' : '−';
        const formatted = `${sign}${(0, monitor_overview_1.formatCompactTokens)(Math.abs(latest.netContextDeltaTokens))}`;
        deltaHtml = `<span class="overview-turn-delta${latest.isCompactionDrop ? ' is-compaction' : ''}" data-turn-net-delta="${latest.netContextDeltaTokens}">${(0, webview_helpers_1.tBiHtml)('Δ Context', '上下文净增长')} ${(0, webview_helpers_1.esc)(formatted)}</span>`;
    }
    const switchHtml = latest.hadColdCacheSwitch
        ? `<span class="orch-cold-switch-pill">${(0, webview_helpers_1.tBiHtml)('Switch Cold', '切换冷启动')}</span>`
        : '';
    return `<div class="overview-turn-cache-row" data-turn-cache-state="${latest.cacheStart}" data-turn-index="${latest.turnIndex}">
        <span class="turn-start-pill ${pillCls}" data-turn-start="${latest.cacheStart}">${pillHtml}${hitPctHtml}</span>
        ${deltaHtml}
        ${switchHtml}
    </div>`;
}
function resolveActiveConversationCalls(telemetry, activeCascadeId) {
    if (!telemetry) {
        return [];
    }
    if (activeCascadeId && telemetry.gmConversations && telemetry.gmConversations[activeCascadeId]?.calls?.length) {
        return telemetry.gmConversations[activeCascadeId].calls;
    }
    const convs = telemetry.gmSummary?.conversations;
    if (!Array.isArray(convs) || convs.length === 0) {
        return [];
    }
    if (activeCascadeId) {
        const match = convs.find(c => c.cascadeId === activeCascadeId);
        if (match?.calls?.length) {
            return match.calls;
        }
    }
    if (convs.length === 1 && convs[0].calls?.length) {
        return convs[0].calls;
    }
    return [];
}
function sessionDetails(usage, telemetryHtml = '', breakdownHtml = '', v1176) {
    const reading = (0, monitor_overview_1.getContextReading)(usage);
    const remaining = (0, monitor_overview_1.getContextRemaining)(reading.used, reading.limit);
    const tokenUnit = 'tokens';
    const compression = calculateCompressionStats(usage);
    const last = usage.lastModelUsage;
    const isPlanner = usage.tokenUsageSource === 'planner';
    const modelLabel = (0, models_1.localizePickerEffortLabel)((0, models_1.resolveModelId)(usage.model) || usage.model, usage.modelDisplayName, (0, i18n_core_1.getLanguage)());
    const activeRoute = (0, monitor_overview_1.resolveActiveOrchestratorRoute)(usage);
    const routePillHtml = activeRoute
        ? `<div class="orch-route-pill" data-cross-pool="${activeRoute.isCrossPool ? 'true' : 'false'}">
            <span class="orch-route-label">${(0, webview_helpers_1.tBiHtml)('Orchestrator', '编排模型')}</span>
            <span class="orch-route-pair">${(0, webview_helpers_1.esc)(activeRoute.plannerLabel)} <span class="orch-route-arrow" aria-hidden="true">→</span> ${(0, webview_helpers_1.esc)(activeRoute.executorLabel)}</span>
            ${activeRoute.isCrossPool ? `<span class="orch-route-badge">${(0, webview_helpers_1.tBiHtml)('Cross-pool', '跨配额池')}</span>` : ''}
        </div>`
        : '';
    const contextLabel = (0, i18n_core_1.tBi)('Context used', '上下文占用');
    const ratio = reading.percent === null ? '—' : `${number(reading.percent, 1)}%`;
    const precisionHtml = usage.isEstimated ? (0, webview_helpers_1.tBiHtml)('Estimated', '估算') : (0, webview_helpers_1.tBiHtml)('Measured', '实测');
    const warnings = [
        ...(usage.hasGaps ? [(0, webview_helpers_1.tBiHtml)('Data may be incomplete (some step batches failed to load)', '数据可能不完整（部分步骤批次加载失败）')] : []),
        ...(reading.percent !== null && reading.percent > 100
            ? [(0, webview_helpers_1.tBiHtml)('Above the context limit', '已超过上下文上限')] : []),
        ...(usage.imageGenerationIncomplete
            ? [(0, webview_helpers_1.tBiHtml)('Image workflow data is incomplete', '图片工作流数据不完整')] : []),
    ];
    const diagnostics = [
        metric((0, webview_helpers_1.tBiHtml)('Model Output', '模型输出'), (0, webview_helpers_1.esc)(number(usage.totalOutputTokens))),
        metric((0, webview_helpers_1.tBiHtml)('Tool Results', '工具结果'), (0, webview_helpers_1.esc)(number(usage.totalToolCallOutputTokens))),
        metric((0, webview_helpers_1.tBiHtml)('Steps', '步骤数'), (0, webview_helpers_1.esc)(number(usage.stepCount))),
    ];
    if (usage.compressionDetected) {
        const label = compression?.source === 'checkpoint'
            ? (0, webview_helpers_1.tBiHtml)('Checkpoint Input Drop', '检查点输入压缩量')
            : (0, webview_helpers_1.tBiHtml)('Context Drop', '上下文压缩量');
        diagnostics.push(metric(label, (0, webview_helpers_1.esc)(compression ? `${number(compression.dropTokens)} ${tokenUnit} · ${number(compression.dropPercent, 1)}%` : '—')));
        if ((0, monitor_overview_1.usableCount)(usage.previousContextUsed)) {
            diagnostics.push(metric((0, webview_helpers_1.tBiHtml)('Before', '压缩前'), (0, webview_helpers_1.esc)(number(usage.previousContextUsed))));
            diagnostics.push(metric((0, webview_helpers_1.tBiHtml)('After', '压缩后'), (0, webview_helpers_1.esc)(number(reading.used))));
        }
    }
    if (usage.estimatedDeltaSinceCheckpoint > 0) {
        const source = isPlanner
            ? (0, webview_helpers_1.tBiHtml)('since last model call', '自上次模型调用')
            : (0, webview_helpers_1.tBiHtml)('since last checkpoint', '自上次检查点');
        diagnostics.push(metric((0, webview_helpers_1.tBiHtml)('Est. delta', '估算增量'), `+${(0, webview_helpers_1.esc)(number(usage.estimatedDeltaSinceCheckpoint))} · ${source}`));
    }
    if (usage.imageGenStepCount > 0) {
        const models = usage.imageGenerationModels?.map(models_1.normalizeModelDisplayName).join(' · ');
        diagnostics.push(metric((0, webview_helpers_1.tBiHtml)('Image Gen', '图片生成'), (0, webview_helpers_1.esc)(number(usage.imageGenStepCount))));
        if (models) {
            diagnostics.push(metric((0, webview_helpers_1.tBiHtml)('Image model', '图片模型'), (0, webview_helpers_1.esc)(models)));
        }
    }
    const checkpointId = !isPlanner && (0, models_1.isShowModelShortId)() && usage.checkpointModel
        ? ` · ${usage.checkpointModel.replace(/^MODEL_PLACEHOLDER_/, '')}` : '';
    return `<div class="overview-session">
        ${usage.title ? `<p class="overview-session-title">${(0, webview_helpers_1.esc)(usage.title)}</p>` : ''}
        <p class="overview-meta">${modelLabel ? `${(0, webview_helpers_1.esc)(modelLabel)} · ` : ''}${precisionHtml}</p>
        ${routePillHtml}
        <div class="overview-reading">
            <div><strong>${number(reading.used)}</strong><span> / ${number(reading.limit)} ${tokenUnit}</span></div>
            <span class="overview-percent">${ratio}</span>
        </div>
        ${reading.percent === null
        ? `<p class="overview-meta">${(0, webview_helpers_1.tBiHtml)('Context measurement unavailable', '暂无上下文计量')}</p>`
        : buildDualWatermarkMeterHtml(contextLabel, reading.percent, ratio, contextMeterTone(reading.percent), v1176?.watermarks ?? null)}
        ${remaining !== null
        ? `<p class="overview-meta">${(0, webview_helpers_1.tBiHtml)('Remaining', '可用余量')} · ${number(remaining.tokens)} ${tokenUnit}</p>` : ''}
        ${v1176?.turnCacheHtml || ''}
        ${breakdownHtml}
        ${telemetryHtml}
        ${v1176?.orchestratorSplitHtml || ''}
        ${warnings.length ? `<ul class="overview-notices">${warnings.map(warning => `<li>${warning}</li>`).join('')}</ul>` : ''}
        <details id="overview-session-diagnostics" class="overview-details" data-state-key="overview-diagnostics:${(0, webview_helpers_1.esc)(usage.cascadeId)}">
            <summary data-overview-focus="diagnostics"><span>${(0, webview_helpers_1.tBiHtml)('Session diagnostics', '会话诊断')}</span></summary>
            <dl class="overview-metrics">${diagnostics.join('')}</dl>
            ${last ? `<h3>${isPlanner ? (0, webview_helpers_1.tBiHtml)('Latest Model Usage', '最近模型用量') : (0, webview_helpers_1.tBiHtml)('Last Checkpoint', '最近检查点')}${(0, webview_helpers_1.esc)(checkpointId)}</h3>
                <dl class="overview-metrics">
                    ${metric((0, webview_helpers_1.tBiHtml)('Input', '输入'), (0, webview_helpers_1.esc)(number(last.inputTokens)))}
                    ${metric((0, webview_helpers_1.tBiHtml)('Output', '输出'), (0, webview_helpers_1.esc)(number(last.outputTokens)))}
                    ${metric((0, webview_helpers_1.tBiHtml)('Cache', '缓存'), (0, webview_helpers_1.esc)(number(last.cacheReadTokens)))}
                    ${metric((0, webview_helpers_1.tBiHtml)('Cache creation', '缓存创建'), (0, webview_helpers_1.esc)(number(last.cacheCreationTokens ?? 0)))}
                </dl>` : ''}
        </details>
    </div>`;
}
function action(tab, labelHtml) {
    return `<button type="button" class="overview-action" data-overview-target="${tab}" data-overview-focus="${tab}"><span>${labelHtml}</span> ${arrow}</button>`;
}
function buildOverviewTabContent(usage, configs, userInfo, billingDay = 0, status = { state: usage ? 'active' : configs.length || userInfo ? 'empty' : 'connecting' }, now = Date.now(), telemetry) {
    const staleBannerHtml = buildStaleBannerHtml(telemetry?.staleState);
    const hasStaleFallbackData = Boolean(telemetry?.staleState?.isStale && (configs.length > 0 || usage || userInfo));
    const connected = (status.state !== 'connecting' && status.state !== 'disconnected') || hasStaleFallbackData;
    const active = (status.state === 'active' || hasStaleFallbackData) ? usage : null;
    const isCustomModelActive = Boolean(telemetry?.isCustomModelActive);
    const breakdownHtml = connected ? buildContextBreakdownCard(telemetry?.contextBreakdown) : '';
    const activeCascadeId = telemetry?.activeCascadeId || active?.cascadeId;
    const telemetryData = connected
        ? (0, monitor_overview_1.extractOverviewTelemetry)(telemetry?.gmSummary, activeCascadeId, telemetry?.customPricing, telemetry?.orchestratorPricingMode)
        : null;
    let telemetryHtml = telemetryData
        ? telemetryStrip(telemetryData, telemetry?.sessionCostUsd, telemetry?.todayCostUsd, {
            speedSample: telemetry?.speedSample,
            displayCurrency: telemetry?.displayCurrency,
            orchestratorPricingMode: telemetry?.orchestratorPricingMode,
        })
        : '';
    if (!telemetryHtml && connected) {
        const standaloneCost = buildCostTelemetryCell(telemetry?.sessionCostUsd, telemetry?.todayCostUsd, telemetry?.displayCurrency, telemetry?.orchestratorPricingMode);
        if (standaloneCost) {
            telemetryHtml = `<div class="overview-telemetry-strip is-cost-only" data-telemetry-scope="cost" role="group" aria-label="${(0, webview_helpers_1.esc)((0, i18n_core_1.tBi)('Session and today cost', '会话与今日费用'))}">${standaloneCost}</div>`;
        }
    }
    const activeCalls = connected ? resolveActiveConversationCalls(telemetry, activeCascadeId) : [];
    const splitOptions = {
        orchestratorConfig: active?.orchestratorConfig,
        orchestratorHistory: active?.orchestratorHistory,
        orchestratorSettings: telemetry?.orchestratorSettings,
        orchestratorPricingMode: telemetry?.orchestratorPricingMode,
    };
    const resolvedSplit = connected
        ? (telemetry?.orchestratorSplit !== undefined
            ? telemetry.orchestratorSplit
            : (activeCalls.length > 0
                ? (0, orchestrator_attribution_1.computeOrchestratorSplit)(activeCalls, splitOptions, telemetry?.customPricing || {})
                : null))
        : null;
    const orchestratorSplitHtml = (0, orchestrator_attribution_1.buildOrchestratorSplitCardHtml)(resolvedSplit, { compact: true });
    const resolvedTurnCache = connected
        ? (telemetry?.turnCacheInfo !== undefined
            ? telemetry.turnCacheInfo
            : (activeCalls.length > 0 ? (0, orchestrator_attribution_1.analyzeUserTurnCacheStates)(activeCalls, splitOptions) : null))
        : null;
    const turnCacheHtml = buildTurnCacheSummaryHtml(resolvedTurnCache);
    const activeReading = active ? (0, monitor_overview_1.getContextReading)(active) : null;
    const resolvedWatermarks = active
        ? (telemetry?.watermarks !== undefined
            ? telemetry.watermarks
            : (activeReading && activeReading.used !== null && activeReading.limit !== null
                ? (0, orchestrator_attribution_1.computeContextWatermarks)({
                    contextUsed: activeReading.used,
                    compactionLimit: activeReading.limit,
                    physicalContextWindow: telemetry?.contextBreakdown?.nativeLimitTokens,
                    model: active.model,
                })
                : null))
        : null;
    const groups = connected ? (0, monitor_overview_1.selectMonitorQuotaGroups)(configs, active?.model, telemetry?.quotaSummary) : [];
    const resolvedLowQuota = connected
        ? (telemetry?.lowQuotaWarning !== undefined
            ? (isCustomModelActive ? null : telemetry.lowQuotaWarning)
            : evaluateLowQuotaWarning(groups, telemetry?.quotaNotificationThreshold, isCustomModelActive))
        : null;
    const lowQuotaBannerHtml = buildLowQuotaWarningBannerHtml(resolvedLowQuota, now);
    const activeRoute = active ? (0, monitor_overview_1.resolveActiveOrchestratorRoute)(active) : null;
    const credits = (0, account_credits_1.aiCreditTotal)(userInfo?.availableCredits || []);
    const expiryHtml = creditExpiryHtml((0, billing_day_1.getDaysUntilBillingDay)(billingDay, new Date(now)));
    const plan = userInfo ? [...new Set([userInfo.planName, userInfo.userTierName].filter(Boolean))].join(' · ') : '';
    const quotaTitlePlain = (0, i18n_core_1.tBi)('Quota remaining', '剩余配额');
    const quotaTitleHtml = (0, webview_helpers_1.tBiHtml)('Quota remaining', '剩余配额');
    const runways = telemetry?.quotaRunways;
    const quotaRows = groups.map(group => {
        const band = (0, monitor_overview_1.quotaPercentage)(group);
        const unknownQuota = group.minimum === null;
        const partial = (group.missingQuota && group.minimum !== null) || (group.missingReset && group.resetTime);
        const hasDualWindow = Boolean(group.fiveHourQuota || group.weeklyQuota);
        const poolRoleTag = activeRoute?.isCrossPool && group.pool
            ? (activeRoute.plannerPool === group.pool
                ? ` <span class="orch-route-badge">${(0, webview_helpers_1.tBiHtml)('Planner', '规划')}</span>`
                : activeRoute.executorPool === group.pool
                    ? ` <span class="orch-route-badge">${(0, webview_helpers_1.tBiHtml)('Executor', '执行')}</span>`
                    : '')
            : '';
        const runwayEstimate = runways
            ? ((group.pool && runways[group.pool]) || runways[group.key])
            : undefined;
        const runwayHtml = isCustomModelActive ? '' : formatRunwayBadgeHtml(runwayEstimate);
        const dualHtml = hasDualWindow
            ? `<div class="quota-dual-row">
                ${group.fiveHourQuota ? dualQuotaWindowHtml(group.label, '5h', group.fiveHourQuota, now) : ''}
                ${group.weeklyQuota ? dualQuotaWindowHtml(group.label, 'weekly', group.weeklyQuota, now) : ''}
            </div>`
            : `${unknownQuota
                ? '<div class="overview-meter is-unknown" aria-hidden="true"></div>'
                : meter(`${group.label} · ${quotaTitlePlain}`, group.minimum * 100, band, quotaMeterTone(group.minimum * 100))}
            <p class="overview-meta">${quotaResetHtml(group, now)}${partial ? ` · ${(0, webview_helpers_1.tBiHtml)('Partial data', '数据不完整')}` : ''}</p>`;
        return `<li class="overview-quota-row">
            <div class="overview-quota-heading">
                <div><h3>${(0, webview_helpers_1.esc)(group.label)}${poolRoleTag}</h3><span class="overview-meta">${modelFamilyCountHtml(group.members.length)}</span></div>
                ${hasDualWindow
            ? ''
            : (unknownQuota
                ? `<strong class="overview-quota-unknown">${(0, webview_helpers_1.tBiHtml)('Unknown', '未知')}</strong>`
                : `<strong>${(0, webview_helpers_1.esc)(band)}</strong>`)}
            </div>
            ${dualHtml}
            ${runwayHtml}
            ${group.pool ? `<p class="overview-model-families">${group.members.map(member => (0, webview_helpers_1.esc)(member.label)).join(' · ')}</p>` : ''}
        </li>`;
    }).join('');
    const quotaBodyHtml = isCustomModelActive
        ? `${buildCustomModelBannerHtml()}${quotaRows ? `<details id="overview-custom-model-pools" class="custom-model-pools-collapse" data-state-key="overview-custom-model-pools">
            <summary><span>${(0, webview_helpers_1.tBiHtml)('Google Quota Pools (Paused for Custom Model)', 'Google 配额池（自定义模型已隔离）')}</span></summary>
            <ul class="overview-quotas">${quotaRows}</ul>
        </details>` : ''}`
        : (quotaRows
            ? `<ul class="overview-quotas">${quotaRows}</ul>`
            : `<p class="overview-empty">${(0, webview_helpers_1.tBiHtml)('Waiting for quota data.', '等待配额数据。')}</p>`);
    const emptyContextHtml = status.state === 'idle'
        ? (0, webview_helpers_1.tBiHtml)('No context measurement for this conversation yet.', '当前会话暂无上下文计量。')
        : (0, webview_helpers_1.tBiHtml)('Open an Antigravity conversation to see its context usage.', '打开 Antigravity 会话后即可查看上下文用量。');
    const jargonFooterHtml = connected ? `<div class="overview-jargon-row" role="group" aria-label="${(0, webview_helpers_1.esc)((0, i18n_core_1.tBi)('Terminology glossary', '术语说明'))}">
        <span class="overview-jargon-item">${(0, webview_helpers_1.tBiHtml)('GM Data', 'GM 数据')}${jargonTipHtml('gm-data')}</span>
        <span class="overview-jargon-item">${(0, webview_helpers_1.tBiHtml)('Dual-Cap', '双上限')}${jargonTipHtml('dual-cap')}</span>
        <span class="overview-jargon-item">${(0, webview_helpers_1.tBiHtml)('Compaction vs Physical', '压缩上限 vs 物理窗口')}${jargonTipHtml('compaction-vs-physical')}</span>
        <span class="overview-jargon-item">${(0, webview_helpers_1.tBiHtml)('Mapped Base Rate', '按底座估算')}${jargonTipHtml('mapped-base-rate')}</span>
    </div>` : '';
    return `<section class="monitor-overview" data-monitor-overview data-monitor-state="${status.state}" aria-labelledby="overview-heading">
        <header class="overview-header">
            <h2 id="overview-heading" data-overview-focus="heading" tabindex="-1">${(0, webview_helpers_1.tBiHtml)('Context & quota', '上下文与配额')}</h2>
            ${connected && plan ? `<p class="overview-meta overview-plan-pill">${(0, webview_helpers_1.esc)(plan)}</p>` : ''}
        </header>
        ${staleBannerHtml}
        ${lowQuotaBannerHtml}
        ${connected ? `<div class="overview-grid">
            <section class="overview-context" aria-labelledby="overview-context-heading">
                <h3 id="overview-context-heading" class="overview-section-heading"><span class="overview-state-dot" aria-hidden="true"></span><span>${statusHeadingHtml(status.state)}</span></h3>
                ${active ? sessionDetails(active, telemetryHtml, breakdownHtml, { watermarks: resolvedWatermarks, turnCacheHtml, orchestratorSplitHtml }) : `<p class="overview-empty">${emptyContextHtml}</p>${turnCacheHtml}${breakdownHtml}${telemetryHtml}${orchestratorSplitHtml}`}
                ${action('gmdata', (0, webview_helpers_1.tBiHtml)('View model activity', '查看模型活动'))}
                ${jargonFooterHtml}
            </section>
            <section class="overview-quota" aria-labelledby="overview-quota-heading">
                <h3 id="overview-quota-heading" class="overview-section-heading"><span>${quotaTitleHtml}</span></h3>
                ${quotaBodyHtml}
                ${action('models', (0, webview_helpers_1.tBiHtml)('View models', '查看模型'))}
            </section>
        </div>` : `<div class="overview-connection">
            <h3 class="overview-section-heading"><span class="overview-state-dot" aria-hidden="true"></span><span>${statusHeadingHtml(status.state)}</span></h3>
            <p class="overview-empty">${status.state === 'disconnected'
        ? backendMessageHtml(status.backendIssue)
        : (0, webview_helpers_1.tBiHtml)('Waiting for the local backend.', '正在等待本地后端。')}</p>
        </div>`}
        <footer class="overview-footer">
            ${connected && (userInfo || billingDay > 0) ? `<p>
                <span>${(0, webview_helpers_1.tBiHtml)('AI credits', 'AI 积分')}</span>
                ${credits === null ? `<span class="overview-meta">${(0, webview_helpers_1.tBiHtml)('Not reported', '未上报')}</span>` : `<strong>${number(credits)}</strong>`}
                <span class="overview-meta">${expiryHtml}</span>
            </p>` : ''}
            ${action('settings', (0, webview_helpers_1.tBiHtml)('Status bar settings', '状态栏设置'))}
        </footer>
    </section>`;
}
function getOverviewStyles() {
    return `
        .monitor-overview {
            --overview-rule: var(--ed-border, var(--vscode-contrastBorder, var(--vscode-widget-border, #323C4C)));
            --overview-muted: var(--ed-ink-muted, var(--vscode-descriptionForeground, var(--vscode-foreground)));
            --overview-accent: var(--ed-accent, var(--vscode-textLink-foreground, #5B9CF6));
            --overview-focus: var(--ed-accent, var(--vscode-focusBorder, var(--overview-accent)));
            --overview-track: var(--ed-track, var(--vscode-scrollbarSlider-background, #232B38));
            --overview-fill: var(--ed-accent, var(--vscode-progressBar-background, var(--overview-accent)));
            --overview-good: var(--ed-good-fill, #10B981);
            --overview-warn: var(--ed-warn-fill, #F59E0B);
            --overview-attention: var(--ed-danger-fill, var(--vscode-editorError-foreground, #EF4444));
            width: min(100%, 1120px);
            margin-inline: auto;
            padding: clamp(16px, 3vw, 28px) clamp(12px, 3vw, 28px) 32px;
            color: var(--ed-ink, var(--vscode-foreground));
            line-height: 1.54;
            overflow-wrap: anywhere;
        }
        .monitor-overview *, .monitor-overview *::before { box-sizing: border-box; }
        .overview-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px 16px;
            padding-bottom: 18px;
            margin: 0;
        }
        .overview-header h2 {
            color: inherit;
            margin: 0;
            padding: 0;
            font-size: clamp(1.3rem, 2.4vw, 1.5rem);
            font-weight: 550;
            line-height: 1.24;
            letter-spacing: -.02em;
        }
        .overview-header .overview-meta { margin-top: 0; }
        .overview-plan-pill {
            display: inline-flex;
            align-items: center;
            padding: 2px 10px;
            border-radius: var(--ed-radius-pill, 9999px);
            background: var(--ed-surface-well, transparent);
            border: 1px solid var(--overview-rule);
            color: var(--ed-ink-secondary, var(--overview-muted));
            font-size: .75rem;
            font-weight: 500;
        }
        .overview-grid { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(0, 1fr); gap: 16px; align-items: start; }
        .overview-context, .overview-quota, .overview-connection {
            padding: 18px 20px;
            min-width: 0;
            background: var(--ed-surface, transparent);
            border: 1px solid var(--overview-rule);
            border-radius: var(--ed-radius-md, 10px);
        }
        .monitor-overview h3 { margin: 0; padding: 0; color: inherit; font-size: .875rem; font-weight: 600; }
        .monitor-overview .overview-section-heading { display: flex; gap: 8px; align-items: center; font-size: .9375rem; }
        .overview-state-dot { flex: 0 0 8px; height: 8px; border-radius: 50%; background: currentColor; color: var(--overview-muted); align-self: center; }
        [data-monitor-state="active"] .overview-state-dot { color: var(--ed-good, var(--overview-good)); }
        [data-monitor-state="disconnected"] .overview-state-dot { color: var(--ed-danger, var(--overview-attention)); }
        .monitor-overview p { margin: 0; }
        .monitor-overview .overview-meta { color: var(--overview-muted); font-size: .75rem; }
        .monitor-overview .overview-empty { color: var(--overview-muted); margin: 13px 0 17px; max-width: 45ch; }
        .monitor-overview .overview-session-title { margin-top: 10px; font-size: .875rem; font-weight: 600; }
        .overview-reading { display: flex; justify-content: space-between; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; margin-top: 16px; }
        .overview-reading strong { font-size: clamp(1.45rem, 2.6vw, 1.75rem); line-height: 1.15; font-weight: 650; letter-spacing: -.025em; }
        .overview-reading div > span { color: var(--overview-muted); font-size: .8125rem; }
        .overview-reading, .overview-percent, .overview-quota-heading strong, .overview-metrics dd, .overview-telemetry-value, .overview-telemetry-sub { font-variant-numeric: tabular-nums lining-nums; }
        .overview-percent { font-size: .9375rem; font-weight: 600; }
        .overview-meter { position: relative; margin: 9px 0 8px; height: 6px; border-radius: var(--ed-radius-pill, 9999px); background: var(--overview-track); overflow: hidden; }
        .overview-meter span { display: block; height: 100%; border-radius: var(--ed-radius-pill, 9999px); background: var(--overview-fill); transition: width 260ms var(--ed-ease, cubic-bezier(0.2, 0, 0, 1)); }
        .overview-meter.is-healthy span { background: var(--overview-good); }
        .overview-meter.is-warn span { background: var(--overview-warn); }
        .overview-meter.is-attention span { background: var(--overview-attention); }
        .overview-meter.is-unknown { opacity: .75; }
        .overview-telemetry-strip {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 10px 12px;
            margin: 12px 0 10px;
            padding: 10px 12px;
            background: var(--ed-surface-well, var(--vscode-editorWidget-background, transparent));
            border: 1px solid var(--overview-rule);
            border-radius: var(--ed-radius-sm, 6px);
        }
        .overview-telemetry-strip.has-cost {
            grid-template-columns: repeat(5, minmax(0, 1fr));
        }
        .overview-telemetry-strip.is-cost-only {
            grid-template-columns: minmax(0, 1fr);
        }
        .overview-telemetry-cell {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .overview-telemetry-label {
            display: block;
            min-width: 0;
            font-size: .72rem;
            font-weight: 500;
            line-height: 1.35;
            color: var(--ed-ink-muted, var(--overview-muted));
        }
        .overview-telemetry-value {
            display: block;
            min-width: 0;
            font-size: .9375rem;
            font-weight: 650;
            line-height: 1.25;
            letter-spacing: -.012em;
            color: var(--ed-ink, var(--vscode-foreground));
        }
        .overview-telemetry-value.is-cache {
            color: var(--ed-chart-cache, var(--ed-good, #34C3A4));
        }
        .overview-telemetry-value.is-muted {
            color: var(--ed-ink-muted, var(--overview-muted));
            font-weight: 550;
        }
        .overview-telemetry-sub {
            display: block;
            min-width: 0;
            font-size: .72rem;
            font-weight: 500;
            line-height: 1.35;
            color: var(--ed-ink-muted, var(--overview-muted));
        }
        .overview-telemetry-sub.is-warm {
            color: var(--ed-good, var(--overview-good));
            font-weight: 550;
        }
        .overview-telemetry-sub.is-warming {
            color: var(--ed-warn, var(--overview-warn));
            font-weight: 550;
        }
        .overview-telemetry-sub.is-cold {
            color: var(--ed-ink-muted, var(--overview-muted));
        }
        .monitor-overview .overview-telemetry-sub:is(.is-warm, .is-warming) :is(.bi-zh, .bi-sep) {
            color: inherit;
        }
        .overview-quota-unknown { color: var(--overview-muted); font-weight: 500; font-size: .8125rem; }
        .overview-notices { margin: 12px 0; padding-inline-start: 18px; font-size: .8125rem; color: var(--ed-warn, var(--overview-warn)); }
        .overview-quotas { padding: 0; margin: 6px 0 12px; list-style: none; }
        .overview-quota-row { padding-block: 11px 12px; }
        .overview-quota-row + .overview-quota-row { border-top: 1px solid var(--overview-rule); }
        .overview-quota-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 6px 12px; }
        .overview-quota-heading > div { min-width: 0; }
        .overview-quota-heading strong { flex: 0 0 auto; font-weight: 650; font-size: 1rem; }
        .monitor-overview .overview-model-families { margin-top: 6px; color: var(--overview-muted); font-size: .75rem; }
        .overview-details { margin: 15px 0 9px; border-block: 1px solid var(--overview-rule); padding: 0; }
        .overview-details summary { padding-block: 8px; cursor: pointer; font-weight: 550; }
        .overview-metrics { margin: 4px 0 12px; }
        .overview-metric { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding-block: 3px; font-size: .8125rem; }
        .overview-metric dt { color: var(--overview-muted); }
        .overview-metric dd { max-width: 24ch; margin: 0; text-align: end; }
        .overview-action { border: 1px solid transparent; font: inherit; font-weight: 550; background: transparent; color: var(--overview-accent); padding: 5px 8px; margin-inline-start: -8px; cursor: pointer; border-radius: var(--ed-radius-sm, 6px); display: inline-flex; align-items: center; gap: 6px; text-align: start; transition: background 150ms var(--ed-ease, ease-out), color 150ms var(--ed-ease, ease-out); }
        .overview-action svg { flex-shrink: 0; transition: transform 150ms var(--ed-ease, ease-out); }
        .overview-action:hover { background: var(--ed-accent-tint, var(--vscode-toolbar-hoverBackground, transparent)); }
        .overview-action:hover svg { transform: translateX(2px); }
        .monitor-overview :focus-visible { outline: 2px solid var(--overview-focus); outline-offset: 2px; }
        .overview-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px 16px; flex-wrap: wrap; margin-top: 16px; padding: 14px 18px; background: var(--ed-surface, transparent); border: 1px solid var(--overview-rule); border-radius: var(--ed-radius-md, 10px); }
        .overview-footer p { display: flex; gap: 4px 10px; flex-wrap: wrap; align-items: baseline; }
        @media (min-width: 681px) and (max-width: 980px), (max-width: 640px) {
            .overview-telemetry-strip,
            .overview-telemetry-strip.has-cost { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 680px) {
            .overview-grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 420px) {
            .overview-telemetry-strip { padding: 10px; gap: 10px; }
        }
        :is(.vscode-high-contrast, .vscode-high-contrast-light, [data-acm-theme="hc"], [data-acm-theme="hc-light"]) .overview-action { border-color: var(--overview-rule); margin-inline-start: 0; }
        :is(.vscode-high-contrast, .vscode-high-contrast-light, [data-acm-theme="hc"], [data-acm-theme="hc-light"]) .overview-meter { outline: 1px solid var(--overview-rule); }
        @media (prefers-reduced-motion: reduce) {
            .overview-action, .overview-action svg, .overview-meter span { transition: none; }
        }
    `;
}
//# sourceMappingURL=webview-overview-tab.js.map