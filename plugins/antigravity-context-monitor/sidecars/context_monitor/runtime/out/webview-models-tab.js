"use strict";
// ─── Models Tab Content Builder ─────────────────────────────────────────────
// Centralizes model-related information: default model, personal model quota,
// and official model configurations and limit parameters without GM data contamination.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrchestratorSettingsCard = buildOrchestratorSettingsCard;
exports.buildModelInfoGrid = buildModelInfoGrid;
exports.buildModelsTabContent = buildModelsTabContent;
const i18n_1 = require("./i18n");
const models_1 = require("./models");
const pricing_store_1 = require("./pricing-store");
const webview_icons_1 = require("./webview-icons");
const webview_overview_tab_1 = require("./webview-overview-tab");
const webview_profile_tab_1 = require("./webview-profile-tab");
const webview_helpers_1 = require("./webview-helpers");
const ORCH_ICON_SVG = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8.5 7.5 11 15.5"/><path d="M15.5 7.5 13 15.5"/></svg>';
const SPEC_ICON_SVG = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
const IMAGE_SPEC_ICON_SVG = '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
/** Use the selected UI locale, independent of the extension host's OS locale. */
function formatTokensHtml(value) {
    return Number.isSafeInteger(value) && value > 0
        ? (0, webview_helpers_1.esc)((0, i18n_1.formatNumber)(value))
        : (0, webview_helpers_1.tBiHtml)('Not available', '暂无数据');
}
function thinkingDescriptionHtml(spec) {
    if (spec.isImageGeneration && spec.thinkingCapabilityReported === false) {
        return (0, webview_helpers_1.tBiHtml)('Not reported by IDE', 'IDE 未上报');
    }
    if (!spec.supportsThinking) {
        return (0, webview_helpers_1.tBiHtml)('Not supported', '不支持');
    }
    if (spec.supportsAdaptiveThinking) {
        return (0, webview_helpers_1.tBiHtml)('Adaptive', '自适应');
    }
    if (spec.thinkingBudget === -1) {
        return (0, webview_helpers_1.tBiHtml)('Dynamic', '动态');
    }
    if (Number.isFinite(spec.thinkingBudget) && spec.thinkingBudget > 0) {
        return `${(0, webview_helpers_1.tBiHtml)('Budget', '预算')}: ${formatTokensHtml(spec.thinkingBudget)}`;
    }
    // A zero/absent budget does not mean thinking is disabled. New adaptive
    // Claude models expose supportsThinking=true without a fixed token budget.
    return (0, webview_helpers_1.tBiHtml)('Supported · Budget unspecified', '支持 · 预算未指定');
}
function providerLabelHtml(provider) {
    const key = provider.replace(/^API_PROVIDER_/, '');
    const labels = {
        GOOGLE_GEMINI: 'Google Gemini',
        ANTHROPIC_VERTEX: 'Anthropic · Vertex',
        ANTHROPIC: 'Anthropic',
        OPENAI_VERTEX: 'OpenAI · Vertex',
        OPENAI: 'OpenAI',
    };
    const resolved = labels[key] || key.replace(/_/g, ' ');
    return resolved ? (0, webview_helpers_1.esc)(resolved) : (0, webview_helpers_1.tBiHtml)('Provider not available', '暂无提供商信息');
}
/** A configured route is a capability, not proof of per-request delegation. */
function orchestrationDescription(spec) {
    const target = spec.executionModelId;
    if (!target || !/^MODEL_[A-Z0-9_]+$/.test(target) || target.includes('UNSPECIFIED')
        || target === spec.placeholderId) {
        return '';
    }
    const worker = (0, models_1.getModelSpecs)().find(candidate => candidate.placeholderId === target);
    return `<div class="spec-orchestration">
        <p><strong>${(0, webview_helpers_1.tBiHtml)('Configured execution model', '配置的执行模型')}:</strong> ${(0, webview_helpers_1.esc)(worker?.displayName || target)}</p>
        <p><code>${(0, webview_helpers_1.esc)(worker?.modelId || target)}</code></p>
        ${worker ? `<p>${(0, webview_helpers_1.tBiHtml)('Execution context & max output', '执行上下文与最大输出')}: ${formatTokensHtml(worker.maxTokens)} / ${formatTokensHtml(worker.maxOutputTokens)}</p>` : ''}
        <p>${(0, webview_helpers_1.tBiHtml)('Server-managed fixed coordinator route. Usage and costs follow the actual model reported per call; Custom Orchestrator Mode pairs eligible models dynamically via Orchestrator Settings.', '服务端管理的固定协调器路由。用量和费用按每次调用实际报告的模型计算；自定义编排模式则通过编排设置动态组合可选模型。')}</p>
    </div>`;
}
function formatRoleFamilyName(stem) {
    const known = {
        'gemini-4-neon': 'Gemini 4 Neon',
        'gemini-4-carbon': 'Gemini 4 Carbon',
        'gemini-4-argon': 'Gemini 4 Argon',
        'gemini-4-hydrogen': 'Gemini 4 Hydrogen',
        'gemini-3.8-flash': 'Gemini 3.8 Flash',
        'claude-opus-5-5': 'Claude Opus 5.5',
        'claude-sonnet-5-5': 'Claude Sonnet 5.5',
    };
    const key = stem.trim().toLowerCase();
    if (Object.hasOwn(known, key)) {
        return known[key];
    }
    return key
        .replace(/-(\d+)-(\d+)$/, ' $1.$2')
        .split(/[-_]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
function poolChipHtml(modelId) {
    const pool = (0, models_1.getQuotaPoolKey)(modelId);
    if (pool === 'gemini') {
        return '<span class="orch-pool-chip">Gemini</span>';
    }
    if (pool === 'premium') {
        return '<span class="orch-pool-chip">Claude / GPT</span>';
    }
    return '';
}
function buildRoleEffectiveRatesHtml(modelId, customPricing, orchestratorPricingMode) {
    if (!modelId) {
        return '';
    }
    const detail = (0, pricing_store_1.resolvePricingDetail)(modelId, customPricing || {}, { orchestratorPricingMode });
    if (!detail.pricing) {
        return `<div class="orch-role-rates" data-price-state="unpriced"><span class="spec-price-badge is-unpriced">${(0, webview_helpers_1.tBiHtml)('Unpriced', '未定价')}</span></div>`;
    }
    const items = [
        `${(0, webview_helpers_1.tBiHtml)('In', '输入')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(detail.pricing.input))}`,
        `${(0, webview_helpers_1.tBiHtml)('Out', '输出')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(detail.pricing.output))}`,
    ];
    if (detail.pricing.cacheRead > 0) {
        items.push(`${(0, webview_helpers_1.tBiHtml)('Cache', '缓存')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(detail.pricing.cacheRead))}`);
    }
    if (detail.pricing.thinking > 0 && detail.pricing.thinking !== detail.pricing.output) {
        items.push(`${(0, webview_helpers_1.tBiHtml)('Think', '思考')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(detail.pricing.thinking))}`);
    }
    const provTag = detail.provenance === 'mapped_base'
        ? ` <span class="orch-role-status" data-pricing-provenance="mapped_base">${(0, webview_helpers_1.tBiHtml)('Est. via Base Model', '按底座估算')}</span>`
        : detail.provenance === 'custom'
            ? ` <span class="orch-role-status is-custom" data-pricing-provenance="custom">${(0, webview_helpers_1.tBiHtml)('Custom', '自定义')}</span>`
            : '';
    return `<div class="orch-role-rates" data-price-state="${detail.provenance === 'mapped_base' ? 'mapped' : 'priced'}"><span class="spec-price-values">${items.join(' · ')}</span>${provTag}</div>`;
}
function buildOrchestratorSettingsCard(settings, options) {
    if (!settings) {
        return '';
    }
    const language = (0, i18n_1.getLanguage)();
    const orchLabel = (0, models_1.localizePickerEffortLabel)(settings.effectiveOrchestratorModel, settings.effectiveOrchestratorLabel || settings.effectiveOrchestratorModel, language);
    const execLabel = (0, models_1.localizePickerEffortLabel)(settings.effectiveExecutorModel, settings.effectiveExecutorLabel || settings.effectiveExecutorModel, language);
    const modeBadge = settings.mode === 'custom'
        ? `<span class="orch-mode-pill is-custom">${(0, webview_helpers_1.tBiHtml)('Custom', '自定义')}</span>`
        : `<span class="orch-mode-pill is-default">${(0, webview_helpers_1.tBiHtml)('Default', '默认')}</span>`;
    const roleStatus = (isCustom) => isCustom
        ? `<span class="orch-role-status is-custom">${(0, webview_helpers_1.tBiHtml)('Pinned', '已指定')}</span>`
        : `<span class="orch-role-status">${(0, webview_helpers_1.tBiHtml)('Auto default', '默认最高档')}</span>`;
    const orchFamilies = settings.roles.orchestrators.map(formatRoleFamilyName);
    const execFamilies = settings.roles.executors.map(formatRoleFamilyName);
    const shortId = (id) => id ? `<code class="spec-short-id" title="${(0, webview_helpers_1.esc)(id)}">${(0, webview_helpers_1.esc)(id.replace(/^MODEL_PLACEHOLDER_/, ''))}</code>` : '';
    const sourceBadge = settings.settingsSource === 'config_fallback'
        ? `<span class="orch-role-status" data-settings-source="config_fallback">${(0, webview_helpers_1.tBiHtml)('Local config', '本地配置')}</span>`
        : '';
    const creditsMeta = typeof settings.useAiCredits === 'boolean'
        ? `<div class="orch-family-row"><dt>${(0, webview_helpers_1.tBiHtml)('AI Credit Overages', 'AI 积分超额')}</dt><dd>${settings.useAiCredits ? (0, webview_helpers_1.tBiHtml)('Enabled', '已开启') : (0, webview_helpers_1.tBiHtml)('Disabled', '已关闭')}</dd></div>`
        : '';
    return `
        <section class="card orch-settings-card" data-orchestrator-mode="${settings.mode}">
            <div class="orch-settings-header">
                <h2>${ORCH_ICON_SVG} <span>${(0, webview_helpers_1.tBiHtml)('Orchestrator Settings', '编排设置')}</span></h2>
                ${sourceBadge}
                ${modeBadge}
            </div>
            <div class="orch-role-list">
                <div class="orch-role-row" data-orch-role="orchestrator">
                    <div class="orch-role-meta">
                        <span class="orch-role-title">${(0, webview_helpers_1.tBiHtml)('Orchestrator Model', '编排模型')}</span>
                        ${roleStatus(settings.isCustomOrchestrator)}
                    </div>
                    <div class="orch-role-value">
                        <strong>${(0, webview_helpers_1.esc)(orchLabel || '—')}</strong>
                        ${shortId(settings.effectiveOrchestratorModel)}
                        ${poolChipHtml(settings.effectiveOrchestratorModel)}
                    </div>
                    ${buildRoleEffectiveRatesHtml(settings.effectiveOrchestratorModel, options?.customPricing, options?.orchestratorPricingMode)}
                </div>
                <div class="orch-role-row" data-orch-role="executor">
                    <div class="orch-role-meta">
                        <span class="orch-role-title">${(0, webview_helpers_1.tBiHtml)('Executor Model', '执行模型')}</span>
                        ${roleStatus(settings.isCustomExecutor)}
                    </div>
                    <div class="orch-role-value">
                        <strong>${(0, webview_helpers_1.esc)(execLabel || '—')}</strong>
                        ${shortId(settings.effectiveExecutorModel)}
                        ${poolChipHtml(settings.effectiveExecutorModel)}
                    </div>
                    ${buildRoleEffectiveRatesHtml(settings.effectiveExecutorModel, options?.customPricing, options?.orchestratorPricingMode)}
                </div>
            </div>
            ${(orchFamilies.length > 0 || execFamilies.length > 0 || creditsMeta) ? `
            <dl class="orch-families-grid">
                ${orchFamilies.length > 0 ? `<div class="orch-family-row"><dt>${(0, webview_helpers_1.tBiHtml)('Orchestrator families', '可用编排系列')}</dt><dd>${(0, webview_helpers_1.esc)(orchFamilies.join(' · '))}</dd></div>` : ''}
                ${execFamilies.length > 0 ? `<div class="orch-family-row"><dt>${(0, webview_helpers_1.tBiHtml)('Executor families', '可用执行系列')}</dt><dd>${(0, webview_helpers_1.esc)(execFamilies.join(' · '))}</dd></div>` : ''}
                ${creditsMeta}
            </dl>` : ''}
            <p class="orch-settings-note">${(0, webview_helpers_1.tBiHtml)('Orchestrator and Executor calls each draw from their own model\'s quota pool (Gemini vs Claude / GPT) and are metered under the actual model reported per call.', '编排模型与执行模型调用分别消耗各自所属模型的配额池（Gemini 或 Claude / GPT），并按每次调用实际报告的模型分别计量与计费。')}</p>
        </section>`;
}
function buildSpecPriceRowHtml(spec, options) {
    const custom = options?.customPricing || {};
    const mode = options?.orchestratorPricingMode;
    const detail = spec.isImageGeneration
        ? { pricing: null, provenance: 'unpriced' }
        : (() => {
            const byPlaceholder = (0, pricing_store_1.resolvePricingDetail)(spec.placeholderId, custom, { orchestratorPricingMode: mode });
            return byPlaceholder.pricing
                ? byPlaceholder
                : (0, pricing_store_1.resolvePricingDetail)(spec.modelId, custom, { orchestratorPricingMode: mode });
        })();
    const pricing = detail.pricing;
    if (!pricing) {
        return `<div class="spec-price-row is-unpriced" data-price-state="unpriced">
            <span class="spec-price-label">${(0, webview_helpers_1.tBiHtml)('API reference', 'API 参考价')}</span>
            <span class="spec-price-badge is-unpriced">${(0, webview_helpers_1.tBiHtml)('Unpriced', '未定价')}</span>
        </div>`;
    }
    const items = [
        `${(0, webview_helpers_1.tBiHtml)('In', '输入')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(pricing.input))}`,
        `${(0, webview_helpers_1.tBiHtml)('Out', '输出')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(pricing.output))}`,
    ];
    if (pricing.cacheRead > 0) {
        items.push(`${(0, webview_helpers_1.tBiHtml)('Cache', '缓存')} ${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdPerMillion)(pricing.cacheRead))}`);
    }
    const isMapped = detail.provenance === 'mapped_base';
    const badgeHtml = isMapped
        ? ` <span class="spec-price-badge is-mapped" data-pricing-provenance="mapped_base">${(0, webview_helpers_1.tBiHtml)('Est. via Base Model', '按底座估算')}</span>`
        : detail.provenance === 'custom'
            ? ` <span class="spec-price-badge is-custom" data-pricing-provenance="custom">${(0, webview_helpers_1.tBiHtml)('Custom', '自定义')}</span>`
            : '';
    return `<div class="spec-price-row${isMapped ? ' is-mapped' : ''}" data-price-state="${isMapped ? 'mapped' : 'priced'}">
        <span class="spec-price-label">${(0, webview_helpers_1.tBiHtml)('API reference', 'API 参考价')}</span>
        <span class="spec-price-values">${items.join(' · ')}${badgeHtml}</span>
    </div>`;
}
function buildModelInfoGrid(specs, kind = 'chat', options) {
    const language = (0, i18n_1.getLanguage)();
    const cards = specs.map((s) => {
        const name = (0, models_1.localizePickerEffortLabel)(s.placeholderId, s.displayName, language);
        const shortId = s.placeholderId.replace(/^MODEL_PLACEHOLDER_/, '');
        const extraId = s.placeholderId && s.placeholderId !== s.modelId
            ? `<code class="spec-short-id" title="${(0, webview_helpers_1.esc)(s.placeholderId)}">${(0, webview_helpers_1.esc)(shortId)}</code>` : '';
        return `
            <article class="spec-card" aria-label="${(0, webview_helpers_1.esc)(name)}" data-model-id="${(0, webview_helpers_1.esc)(s.placeholderId)}">
                <header class="spec-header">
                    <h3 class="spec-name">${(0, webview_helpers_1.esc)(name)}</h3>
                    <p class="spec-provider" title="${(0, webview_helpers_1.esc)(s.apiProvider)}">${providerLabelHtml(s.apiProvider)}</p>
                </header>
                <dl class="spec-metrics">
                    <div class="spec-metric spec-limit" data-metric="compression-limit">
                        <dt>${(0, webview_helpers_1.tBiHtml)('Compression limit', '压缩上限')}</dt>
                        <dd>${s.isImageGeneration ? (0, webview_helpers_1.tBiHtml)('Not applicable', '不适用') : formatTokensHtml(s.cpLimit)}</dd>
                    </div>
                    <div class="spec-metric" data-metric="checkpoint-threshold">
                        <dt>${(0, webview_helpers_1.tBiHtml)('Checkpoint threshold', '检查点阈值')}</dt>
                        <dd>${s.isImageGeneration ? (0, webview_helpers_1.tBiHtml)('Not applicable', '不适用') : formatTokensHtml(s.cpThreshold)}</dd>
                    </div>
                    <div class="spec-metric" data-metric="native-context">
                        <dt>${(0, webview_helpers_1.tBiHtml)('Model context', '模型上下文')}</dt>
                        <dd>${formatTokensHtml(s.maxTokens)}</dd>
                    </div>
                    <div class="spec-metric" data-metric="max-output">
                        <dt>${(0, webview_helpers_1.tBiHtml)('Max output', '最大输出')}</dt>
                        <dd>${formatTokensHtml(s.maxOutputTokens)}</dd>
                    </div>
                    <div class="spec-metric spec-thinking">
                        <dt>${(0, webview_helpers_1.tBiHtml)('Thinking', '思考能力')}</dt>
                        <dd>${thinkingDescriptionHtml(s)}</dd>
                    </div>
                </dl>
                ${buildSpecPriceRowHtml(s, options)}
                ${orchestrationDescription(s)}
                <div class="spec-identity">
                    <code class="spec-model-id" title="${(0, webview_helpers_1.esc)(s.modelId)}">${(0, webview_helpers_1.esc)(s.modelId)}</code>${extraId}
                </div>
            </article>`;
    }).join('');
    const icon = kind === 'image' ? IMAGE_SPEC_ICON_SVG : SPEC_ICON_SVG;
    const sectionClass = kind === 'image'
        ? 'card model-info-section model-info-image-section'
        : 'card model-info-section';
    return `
        <section class="${sectionClass}" data-model-kind="${kind}">
            <h2>${icon} <span>${kind === 'image' ? (0, webview_helpers_1.tBiHtml)('Image generation models', '图片生成模型') : (0, webview_helpers_1.tBiHtml)('Model Info', '模型信息')}</span></h2>
            <p class="spec-description">${kind === 'image'
        ? (0, webview_helpers_1.tBiHtml)('Image-generation models available in your IDE. Reported context and output limits may differ from public API limits; chat compression settings do not apply.', 'IDE 中可用的图片生成模型。IDE 报告的上下文和输出上限可能与公开 API 不同；聊天上下文压缩设置不适用。')
        : (0, webview_helpers_1.tBiHtml)('Limits reported by your IDE may differ from public API limits. Compression limit and checkpoint threshold are separate platform settings.', '以下限额由 IDE 报告，可能与公开 API 限额不同。压缩上限与检查点阈值是不同的平台设置。')}</p>
            <div class="spec-grid">
                ${cards}
            </div>
        </section>`;
}
function formatRunwayPoolName(poolKey) {
    const key = poolKey.trim().toLowerCase();
    if (key === 'gemini') {
        return 'Gemini';
    }
    if (key === 'premium') {
        return 'Claude / GPT';
    }
    return poolKey;
}
function buildModelsRunwayStrip(runways) {
    if (!runways) {
        return '';
    }
    const items = [];
    for (const [poolKey, estimate] of Object.entries(runways)) {
        const badgeHtml = (0, webview_overview_tab_1.formatRunwayBadgeHtml)(estimate);
        if (!badgeHtml) {
            continue;
        }
        items.push(`<div class="models-runway-item" data-runway-pool="${(0, webview_helpers_1.esc)(poolKey)}">
            <span class="models-runway-pool">${(0, webview_helpers_1.esc)(formatRunwayPoolName(poolKey))}</span>
            ${badgeHtml}
        </div>`);
    }
    if (items.length === 0) {
        return '';
    }
    return `<section class="card models-runway-card" aria-label="${(0, webview_helpers_1.esc)((0, webview_helpers_1.tBiHtml)('Quota Runway', '配额续航').replace(/<[^>]+>/g, ''))}">
        <div class="models-runway-head">
            <h3>${webview_icons_1.ICON.clock} <span>${(0, webview_helpers_1.tBiHtml)('Quota Runway', '配额续航')}</span></h3>
        </div>
        <div class="models-runway-grid acm-runway-grid">${items.join('')}</div>
    </section>`;
}
function buildModelsTabContent(userInfo, configs, options = {}) {
    const parts = [];
    const sortedConfigs = userInfo ? (0, webview_profile_tab_1.sortModels)(configs, userInfo.modelSortOrder) : configs;
    // 0. Stale-Safe Cached Banner (when RPC hiccup occurred)
    const staleHtml = (0, webview_overview_tab_1.buildStaleBannerHtml)(options.staleState);
    if (staleHtml) {
        parts.push(staleHtml);
    }
    // 1. Default Model Card
    const defaultModelHtml = (0, webview_profile_tab_1.buildDefaultModelCard)(userInfo);
    if (defaultModelHtml) {
        parts.push(defaultModelHtml);
    }
    // 1b. Orchestrator Settings Card (live Jetbox + Mendel roles + effective per-1M rates)
    const orchestratorSettingsHtml = buildOrchestratorSettingsCard(options.orchestratorSettings, {
        customPricing: options.customPricing,
        orchestratorPricingMode: options.orchestratorPricingMode,
    });
    if (orchestratorSettingsHtml) {
        parts.push(orchestratorSettingsHtml);
    }
    // 2. Personal Model Quota Grid (dual-window 5h + Weekly + Runway + Custom-Model Isolation)
    const quotaHtml = (0, webview_profile_tab_1.buildModelQuotaGrid)(sortedConfigs, { quotaSummary: options.quotaSummary });
    if (options.isCustomModelActive) {
        parts.push((0, webview_overview_tab_1.buildCustomModelBannerHtml)());
        if (quotaHtml) {
            parts.push(`<details id="models-custom-model-pools" class="custom-model-pools-collapse" data-state-key="models-custom-model-pools">
                <summary><span>${(0, webview_helpers_1.tBiHtml)('Google Quota Pools (Paused for Custom Model)', 'Google 配额池（自定义模型已隔离）')}</span></summary>
                ${quotaHtml}
            </details>`);
        }
    }
    else {
        const runwayHtml = buildModelsRunwayStrip(options.quotaRunways);
        if (runwayHtml) {
            parts.push(runwayHtml);
        }
        if (quotaHtml) {
            parts.push(quotaHtml);
        }
    }
    // 3. Official Model Info Grid
    // 范围严格限定为 sortedConfigs 中展示在前台的界面模型
    const specs = [];
    const allSpecs = (0, models_1.getModelSpecs)();
    const specMap = new Map();
    for (const spec of allSpecs) {
        specMap.set(spec.placeholderId, spec);
    }
    for (const config of sortedConfigs) {
        let spec = specMap.get(config.model);
        if (!spec) {
            // 动态利用 guess 机制为此新未知模型注册一个合理的 Spec，杜绝界面挂起，保障新模型智能自适应
            const guess = (0, models_1.guessContextLimitSpec)(config.model);
            (0, models_1.updateModelSpec)(config.model, {
                modelId: config.model,
                displayName: config.label,
                // Leave the provider EMPTY rather than inventing a placeholder value. getQuotaPoolKey()
                // uses the spec's apiProvider as its last-resort pooling signal, and a sentinel like
                // 'AUTO_DETECT' matches none of its provider tests — so filing one here would silently
                // send this model to the resetTime fallback and give it its own phantom quota pool.
                apiProvider: '',
                maxTokens: guess.maxTokens,
                cpLimit: guess.cpLimit,
                cpThreshold: guess.cpThreshold,
                supportsThinking: guess.supportsThinking,
            });
            // 重新在已完成动态注册的 Spec 列表中获取实例
            spec = (0, models_1.getModelSpecs)().find(x => x.placeholderId === config.model);
        }
        if (spec && !spec.isImageGeneration) {
            // displayName 采用前端 config 里的 label，保持与界面选项一致
            const specCopy = { ...spec, displayName: config.label };
            specs.push(specCopy);
        }
    }
    if (specs.length > 0) {
        parts.push(buildModelInfoGrid(specs, 'chat', options));
    }
    else {
        parts.push(`
            <section class="card empty model-info-section">
                <h2>${SPEC_ICON_SVG} <span>${(0, webview_helpers_1.tBiHtml)('Model Info', '模型信息')}</span></h2>
                <p class="empty-desc">
                    ${(0, webview_helpers_1.tBiHtml)('Model information is not available yet. Sign in to Antigravity, then refresh.', '暂无模型信息。请登录 Antigravity 后刷新。')}
                </p>
            </section>`);
    }
    // Image generation has a separate authoritative catalog; accepting images
    // in a chat prompt does not identify an image-generation model.
    const imageSpecs = (0, models_1.getAvailableImageModelSpecs)();
    if (imageSpecs.length > 0) {
        parts.push(buildModelInfoGrid(imageSpecs, 'image', options));
    }
    if (parts.length === 0) {
        return `
            <section class="card empty">
                <h2>${webview_icons_1.ICON.bolt} <span>${(0, webview_helpers_1.tBiHtml)('Models', '模型')}</span></h2>
                <p class="empty-desc">${(0, webview_helpers_1.tBiHtml)('Waiting for model-related data from LS...', '等待 LS 返回模型相关数据...')}</p>
            </section>`;
    }
    return parts.join('');
}
//# sourceMappingURL=webview-models-tab.js.map