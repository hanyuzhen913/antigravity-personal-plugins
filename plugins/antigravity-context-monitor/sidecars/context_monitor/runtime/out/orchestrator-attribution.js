"use strict";
// ─── Orchestrator Attribution, Config Fallback & Turn Cache Intelligence ─────
// Pure zero-vscode module providing:
//   1. Cross-platform read-only fallback reader for `~/.gemini/config/config.json`
//      (`userSettings.orchestratorModel`, `orchestratorExecutorModel`, `useAiCredits`).
//   2. Per-call role classification (`'orchestrator' | 'executor' | 'subagent' | 'direct'`)
//      handling Custom Orchestrator concrete models, legacy M537/M667/M681/M669 IDs,
//      same-model orchestrator sessions, and mid-conversation orchestrator reconfigurations.
//   3. Orchestrator ↔ Executor context-switch cold-cache detection (`cacheRead === 0`).
//   4. Reusable Studio Telemetry HTML/CSS helpers for GM Data & Phase B Overview cards
//      (auto-hidden for single-model conversations).
//   5. User-turn first-GM-call cache start classification (`cold` | `partial` | `warm`)
//      and net `+Δ` context growth + dual-watermark re-exports.
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
exports.LEGACY_ORCHESTRATOR_EXECUTOR_IDS = exports.LEGACY_ORCHESTRATOR_PLANNER_IDS = exports.LONG_CONTEXT_TIER_THRESHOLD = exports.evaluateSpeedSample = exports.computeContextWatermarks = void 0;
exports.getAntigravityUserConfigPath = getAntigravityUserConfigPath;
exports.parseAntigravityUserConfig = parseAntigravityUserConfig;
exports.readLocalOrchestratorConfigFallback = readLocalOrchestratorConfigFallback;
exports.classifyConversationCalls = classifyConversationCalls;
exports.computeOrchestratorSplit = computeOrchestratorSplit;
exports.classifyFirstCallCacheStart = classifyFirstCallCacheStart;
exports.analyzeUserTurnCacheStates = analyzeUserTurnCacheStates;
exports.renderCallRoleBadgeHtml = renderCallRoleBadgeHtml;
exports.buildOrchestratorSplitCardHtml = buildOrchestratorSplitCardHtml;
exports.getOrchestratorAttributionStyles = getOrchestratorAttributionStyles;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const constants_1 = require("./constants");
const i18n_1 = require("./i18n");
const models_1 = require("./models");
const pricing_store_1 = require("./pricing-store");
const telemetry_metrics_1 = require("./telemetry-metrics");
Object.defineProperty(exports, "computeContextWatermarks", { enumerable: true, get: function () { return telemetry_metrics_1.computeContextWatermarks; } });
Object.defineProperty(exports, "evaluateSpeedSample", { enumerable: true, get: function () { return telemetry_metrics_1.evaluateSpeedSample; } });
Object.defineProperty(exports, "LONG_CONTEXT_TIER_THRESHOLD", { enumerable: true, get: function () { return telemetry_metrics_1.LONG_CONTEXT_TIER_THRESHOLD; } });
const webview_helpers_1 = require("./webview-helpers");
// ─── Legacy Fixed Orchestrator Identities ────────────────────────────────────
exports.LEGACY_ORCHESTRATOR_PLANNER_IDS = new Set([
    'MODEL_PLACEHOLDER_M537', // Orchestrator (Neon)
    'MODEL_PLACEHOLDER_M667', // Orchestrator (Carbon)
    'MODEL_PLACEHOLDER_M681', // Orchestrator (Argon)
]);
exports.LEGACY_ORCHESTRATOR_EXECUTOR_IDS = new Set([
    'MODEL_PLACEHOLDER_M669', // Gemini 4 Hydrogen (Orchestrator / Worker)
]);
/**
 * Resolve cross-platform Antigravity config path (`~/.gemini/config/config.json`).
 * macOS/Linux: `~/.gemini/config/config.json`
 * Windows: `%USERPROFILE%\.gemini\config\config.json`
 */
function getAntigravityUserConfigPath(homeDir) {
    const base = homeDir && homeDir.trim() ? homeDir.trim() : os.homedir();
    return path.join(base, '.gemini', 'config', 'config.json');
}
/**
 * Parse `userSettings.{orchestratorModel, orchestratorExecutorModel, useAiCredits}`
 * from raw Antigravity `config.json` JSON data.
 */
function parseAntigravityUserConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const root = raw;
    const userConfig = root.userConfig && typeof root.userConfig === 'object' && !Array.isArray(root.userConfig)
        ? root.userConfig
        : undefined;
    const userSettings = root.userSettings && typeof root.userSettings === 'object' && !Array.isArray(root.userSettings)
        ? root.userSettings
        : userConfig?.userSettings && typeof userConfig.userSettings === 'object' && !Array.isArray(userConfig.userSettings)
            ? userConfig.userSettings
            : undefined;
    if (!userSettings) {
        return null;
    }
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const orchestratorModel = str(userSettings.orchestratorModel);
    const orchestratorExecutorModel = str(userSettings.orchestratorExecutorModel);
    const hasUseAiCredits = typeof userSettings.useAiCredits === 'boolean';
    if (!orchestratorModel && !orchestratorExecutorModel && !hasUseAiCredits) {
        return null;
    }
    return {
        orchestratorModel,
        orchestratorExecutorModel,
        ...(hasUseAiCredits ? { useAiCredits: userSettings.useAiCredits } : {}),
    };
}
/**
 * Read-only cross-platform fallback reader for `~/.gemini/config/config.json`.
 * Never throws; returns null when missing, unreadable, or malformed.
 */
function readLocalOrchestratorConfigFallback(options) {
    const configPath = options?.configPath && options.configPath.trim()
        ? options.configPath.trim()
        : getAntigravityUserConfigPath(options?.homeDir);
    try {
        const rawText = fs.readFileSync(configPath, 'utf8');
        if (!rawText || !rawText.trim()) {
            return null;
        }
        const parsedJson = JSON.parse(rawText);
        const parsed = parseAntigravityUserConfig(parsedJson);
        if (!parsed) {
            return null;
        }
        return {
            ...parsed,
            configPath,
        };
    }
    catch {
        return null;
    }
}
// ─── Internal Attribution Helpers ────────────────────────────────────────────
function safeNonNeg(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
function isUnspecifiedModel(value) {
    const clean = (value || '').trim().toUpperCase();
    return !clean || clean === 'MODEL_UNSPECIFIED' || clean === 'MODEL_PLACEHOLDER_UNSPECIFIED';
}
function canonicalModel(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed || isUnspecifiedModel(trimmed)) {
        return '';
    }
    return (0, models_1.resolveModelId)(trimmed) || trimmed;
}
function canonicalCallModel(call) {
    return canonicalModel(call.model)
        || canonicalModel(call.modelDisplay)
        || canonicalModel(call.responseModel)
        || '';
}
function getCallPrimaryStep(call) {
    if (Array.isArray(call.stepIndices) && call.stepIndices.length > 0) {
        const valid = call.stepIndices.filter(s => typeof s === 'number' && Number.isFinite(s) && s >= 0);
        if (valid.length > 0) {
            return Math.min(...valid);
        }
    }
    if (typeof call.startStepIndex === 'number' && Number.isFinite(call.startStepIndex) && call.startStepIndex >= 0) {
        return call.startStepIndex;
    }
    return null;
}
function isSubagentCall(call, isSubagentConversation) {
    if (isSubagentConversation) {
        return true;
    }
    const execId = (call.executionId || '').trim();
    if (execId && /^(?:subagent|swarm[-_]?worker)(?:[-_:]|$)/i.test(execId)) {
        return true;
    }
    if (Array.isArray(call.promptSectionTitles)
        && call.promptSectionTitles.some(t => /^(?:subagent|swarm\s+worker)\b/i.test((t || '').trim()))) {
        return true;
    }
    return false;
}
function normalizeOptions(arg) {
    if (!arg) {
        return {};
    }
    if ('planModel' in arg || 'executionModel' in arg) {
        return { orchestratorConfig: arg };
    }
    return arg;
}
function createEmptyRoleMetrics() {
    return {
        calls: 0,
        models: [],
        labels: [],
        primaryLabel: '',
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalPromptTokens: 0,
        cacheHitRate: null,
        costUsd: null,
        pricedCalls: 0,
        unpricedCalls: 0,
        mappedBaseCalls: 0,
    };
}
function localizedModelLabel(modelId, fallbackRaw = '') {
    const lang = (0, i18n_1.getLanguage)();
    if (!modelId) {
        return fallbackRaw || '—';
    }
    const display = (0, models_1.getModelDisplayName)(modelId) || (0, models_1.normalizeModelDisplayName)(modelId) || fallbackRaw || modelId;
    return (0, models_1.localizePickerEffortLabel)(modelId, display, lang);
}
// ─── Core Role Classification & Split Computation ────────────────────────────
/**
 * Classify every GMCallEntry in a conversation with its role
 * (`'orchestrator' | 'executor' | 'subagent' | 'direct'`) and detect
 * Orchestrator ↔ Executor cold-cache switches (`cacheRead === 0`).
 */
function classifyConversationCalls(calls, orchestratorConfigOrOptions, customPricing = {}) {
    if (!calls || calls.length === 0) {
        return [];
    }
    const opts = normalizeOptions(orchestratorConfigOrOptions);
    const pricingMode = opts.orchestratorPricingMode ?? (0, pricing_store_1.getOrchestratorPricingMode)();
    const isSubagentConv = opts.isSubagentConversation === true;
    // Sort history segments ascending by startStepIndex
    const sortedHistory = (opts.orchestratorHistory || [])
        .filter(seg => typeof seg.startStepIndex === 'number' && Number.isFinite(seg.startStepIndex) && seg.startStepIndex >= 0)
        .map(seg => ({
        startStepIndex: seg.startStepIndex,
        planId: canonicalModel(seg.planModel),
        execId: canonicalModel(seg.executionModel),
    }))
        .sort((a, b) => a.startStepIndex - b.startStepIndex);
    const callAnchors = [];
    for (let i = 0; i < calls.length; i++) {
        const c = calls[i];
        const cid = canonicalCallModel(c);
        const execId = canonicalModel(c.executionModel);
        if (cid && execId) {
            callAnchors.push({ callIndex: i, planId: cid, execId, isSameModel: cid === execId });
        }
        else if (exports.LEGACY_ORCHESTRATOR_PLANNER_IDS.has(cid)) {
            callAnchors.push({ callIndex: i, planId: cid, execId: 'MODEL_PLACEHOLDER_M669', isSameModel: false });
        }
    }
    const fallbackPlanId = canonicalModel(opts.orchestratorConfig?.planModel);
    const fallbackExecId = canonicalModel(opts.orchestratorConfig?.executionModel);
    const fallbackRoute = fallbackPlanId && fallbackExecId
        ? { planId: fallbackPlanId, execId: fallbackExecId, isSameModel: fallbackPlanId === fallbackExecId }
        : null;
    const historySegmentAt = (step) => {
        if (sortedHistory.length === 0 || step === null) {
            return null;
        }
        let matched = null;
        for (const seg of sortedHistory) {
            if (seg.startStepIndex <= step) {
                matched = seg;
            }
            else {
                break;
            }
        }
        return matched;
    };
    // Pass 2: Classify calls in chronological order and detect cold-cache role switches.
    const attributed = [];
    let currentDynamicRoute = null;
    let prevRole = null;
    let prevRoleWasOrchestratorInSameModel = false;
    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        const cid = canonicalCallModel(call);
        const callExecId = canonicalModel(call.executionModel);
        const callStep = getCallPrimaryStep(call);
        const histSeg = historySegmentAt(callStep);
        let role = 'direct';
        if (isSubagentCall(call, isSubagentConv)) {
            role = 'subagent';
        }
        else if (exports.LEGACY_ORCHESTRATOR_PLANNER_IDS.has(cid)) {
            role = 'orchestrator';
            currentDynamicRoute = {
                planId: cid,
                execId: callExecId || 'MODEL_PLACEHOLDER_M669',
                isSameModel: false,
            };
        }
        else if (exports.LEGACY_ORCHESTRATOR_EXECUTOR_IDS.has(cid)) {
            role = 'executor';
        }
        else if (cid && callExecId) {
            // Explicit plannerConfig.planExecuteConfig.executionModel on this GM call
            role = 'orchestrator';
            currentDynamicRoute = {
                planId: cid,
                execId: callExecId,
                isSameModel: cid === callExecId,
            };
            prevRoleWasOrchestratorInSameModel = cid === callExecId;
        }
        else if (histSeg) {
            // Authoritative per-turn trajectory USER_INPUT route segment
            if (!histSeg.execId) {
                // Explicitly switched back to direct single-model mode
                role = 'direct';
                currentDynamicRoute = null;
                prevRoleWasOrchestratorInSameModel = false;
            }
            else if (histSeg.planId === histSeg.execId) {
                // Same-model orchestrator configured at this turn
                currentDynamicRoute = { planId: histSeg.planId, execId: histSeg.execId, isSameModel: true };
                if (cid === histSeg.planId) {
                    const hasExplicitPlannerAnchor = callAnchors.some(a => a.isSameModel && a.planId === cid);
                    if (hasExplicitPlannerAnchor && prevRoleWasOrchestratorInSameModel) {
                        role = 'executor';
                    }
                    else if (!hasExplicitPlannerAnchor && prevRole === 'orchestrator' && safeNonNeg(call.cacheReadTokens) === 0 && (safeNonNeg(call.inputTokens) + safeNonNeg(call.cacheCreationTokens)) > 0) {
                        role = 'executor';
                    }
                    else {
                        role = 'orchestrator';
                    }
                }
                else {
                    role = 'direct';
                }
            }
            else {
                currentDynamicRoute = { planId: histSeg.planId, execId: histSeg.execId, isSameModel: false };
                if (cid === histSeg.planId) {
                    role = 'orchestrator';
                }
                else if (cid === histSeg.execId) {
                    role = 'executor';
                }
                else {
                    role = 'direct';
                }
            }
        }
        else {
            // Resolve active route: prefer latest dynamic route, else upcoming first anchor
            // (for initial planner turns before the final planning turn emitted executionModel),
            // else fallback conversation orchestratorConfig.
            let activeRoute = currentDynamicRoute;
            if (!activeRoute && callAnchors.length > 0) {
                const upcoming = callAnchors.find(a => a.callIndex >= i);
                if (upcoming && (cid === upcoming.planId || cid === upcoming.execId)) {
                    activeRoute = {
                        planId: upcoming.planId,
                        execId: upcoming.execId,
                        isSameModel: upcoming.isSameModel,
                    };
                }
            }
            if (!activeRoute) {
                activeRoute = fallbackRoute;
            }
            if (activeRoute) {
                if (activeRoute.isSameModel) {
                    if (cid === activeRoute.planId) {
                        // In same-model orchestrator mode, calls with `executionModel` were classified
                        // `'orchestrator'` above; follow-up calls without `executionModel` execute delegated work.
                        const hasExplicitPlannerAnchor = callAnchors.some(a => a.isSameModel && a.planId === cid);
                        if (hasExplicitPlannerAnchor && prevRoleWasOrchestratorInSameModel) {
                            role = 'executor';
                        }
                        else if (!hasExplicitPlannerAnchor && prevRole === 'orchestrator'
                            && safeNonNeg(call.cacheReadTokens) === 0
                            && (safeNonNeg(call.inputTokens) + safeNonNeg(call.cacheCreationTokens)) > 0) {
                            role = 'executor';
                        }
                        else {
                            role = 'orchestrator';
                        }
                    }
                    else {
                        role = 'direct';
                    }
                }
                else if (cid === activeRoute.planId) {
                    role = 'orchestrator';
                }
                else if (cid === activeRoute.execId) {
                    role = 'executor';
                }
                else {
                    role = 'direct';
                }
            }
        }
        // Cold-cache context switch detection (Orchestrator <-> Executor)
        let isRoleSwitch = false;
        let switchDirection;
        let isColdCacheSwitch = false;
        let coldSwitchFreshInputTokens = 0;
        const compaction = (0, telemetry_metrics_1.isInternalCompactionCall)(call);
        if (!compaction && prevRole !== null && prevRole !== role) {
            if (prevRole === 'orchestrator' && role === 'executor') {
                isRoleSwitch = true;
                switchDirection = 'orchestrator_to_executor';
            }
            else if (prevRole === 'executor' && role === 'orchestrator') {
                isRoleSwitch = true;
                switchDirection = 'executor_to_orchestrator';
            }
            if (isRoleSwitch) {
                const freshIn = safeNonNeg(call.inputTokens);
                const cacheRead = safeNonNeg(call.cacheReadTokens);
                const cacheCreate = safeNonNeg(call.cacheCreationTokens);
                const totalPrompt = freshIn + cacheRead + cacheCreate;
                if (cacheRead === 0 && totalPrompt > 0) {
                    isColdCacheSwitch = true;
                    coldSwitchFreshInputTokens = freshIn;
                }
            }
        }
        if (!compaction) {
            prevRole = role;
        }
        // Per-call pricing & provenance
        const pricingModel = (0, pricing_store_1.selectPricingModel)(call.model || call.modelDisplay, call.responseModel, customPricing);
        const detail = (0, pricing_store_1.resolvePricingDetail)(pricingModel, customPricing, {
            at: call.createdAt || '',
            orchestratorPricingMode: pricingMode,
        });
        const costUsd = detail.pricing ? (0, pricing_store_1.costFromTokens)(call, detail.pricing) : null;
        attributed.push({
            callIndex: i,
            call,
            canonicalModelId: cid,
            role,
            isRoleSwitch,
            ...(switchDirection ? { switchDirection } : {}),
            isColdCacheSwitch,
            coldSwitchFreshInputTokens,
            costUsd,
            pricingProvenance: detail.provenance,
            ...(detail.mappedBaseLabel ? { mappedBaseLabel: detail.mappedBaseLabel } : {}),
        });
    }
    return attributed;
}
/**
 * Compute full Orchestrator vs Executor (and Subagent / Direct) attribution split,
 * token/cost totals, cache hit rates, mid-conversation reconfiguration flags,
 * and cold-cache context switch telemetry.
 *
 * Returns `null` when `calls` is empty or contains zero Orchestrator and zero Executor calls
 * (e.g. a pure single-model direct conversation).
 */
function computeOrchestratorSplit(calls, orchestratorConfigOrOptions, customPricing = {}) {
    if (!calls || calls.length === 0) {
        return null;
    }
    const opts = normalizeOptions(orchestratorConfigOrOptions);
    const attributedCalls = classifyConversationCalls(calls, opts, customPricing);
    const roleBuckets = {
        orchestrator: createEmptyRoleMetrics(),
        executor: createEmptyRoleMetrics(),
        subagent: createEmptyRoleMetrics(),
        direct: createEmptyRoleMetrics(),
    };
    const roleModelCounts = {
        orchestrator: new Map(),
        executor: new Map(),
        subagent: new Map(),
        direct: new Map(),
    };
    const distinctModels = new Set();
    const switches = [];
    let coldCacheSwitchCount = 0;
    let coldCacheSwitchInputTokens = 0;
    let totalCostSum = 0;
    let anyPricedCall = false;
    let hasUnpriced = false;
    for (let i = 0; i < attributedCalls.length; i++) {
        const entry = attributedCalls[i];
        const c = entry.call;
        const bucket = roleBuckets[entry.role];
        const modelCounts = roleModelCounts[entry.role];
        if (entry.canonicalModelId) {
            distinctModels.add(entry.canonicalModelId);
            modelCounts.set(entry.canonicalModelId, (modelCounts.get(entry.canonicalModelId) || 0) + 1);
            if (!bucket.models.includes(entry.canonicalModelId)) {
                bucket.models.push(entry.canonicalModelId);
                bucket.labels.push(localizedModelLabel(entry.canonicalModelId, c.modelDisplay || c.responseModel));
            }
        }
        const freshIn = safeNonNeg(c.inputTokens);
        const out = safeNonNeg(c.outputTokens);
        const think = safeNonNeg(c.thinkingTokens);
        const cacheRead = safeNonNeg(c.cacheReadTokens);
        const cacheCreate = safeNonNeg(c.cacheCreationTokens);
        const totalPrompt = freshIn + cacheRead + cacheCreate;
        bucket.calls++;
        bucket.inputTokens += freshIn;
        bucket.outputTokens += out;
        bucket.thinkingTokens += think;
        bucket.cacheReadTokens += cacheRead;
        bucket.cacheCreationTokens += cacheCreate;
        bucket.totalPromptTokens += totalPrompt;
        if (entry.costUsd !== null) {
            bucket.costUsd = (bucket.costUsd ?? 0) + entry.costUsd;
            bucket.pricedCalls++;
            totalCostSum += entry.costUsd;
            anyPricedCall = true;
            if (entry.pricingProvenance === 'mapped_base') {
                bucket.mappedBaseCalls++;
            }
        }
        else {
            bucket.unpricedCalls++;
            if (entry.role === 'orchestrator' || entry.role === 'executor') {
                hasUnpriced = true;
            }
        }
        if (entry.isRoleSwitch && entry.switchDirection) {
            const fromRole = entry.switchDirection === 'orchestrator_to_executor' ? 'orchestrator' : 'executor';
            const toRole = entry.switchDirection === 'orchestrator_to_executor' ? 'executor' : 'orchestrator';
            // Find immediate previous non-compaction attributed call
            let prevModel = '';
            for (let j = i - 1; j >= 0; j--) {
                if (!(0, telemetry_metrics_1.isInternalCompactionCall)(attributedCalls[j].call)) {
                    prevModel = attributedCalls[j].canonicalModelId;
                    break;
                }
            }
            switches.push({
                callIndex: entry.callIndex,
                createdAt: c.createdAt || '',
                fromRole,
                toRole,
                direction: entry.switchDirection,
                fromModel: prevModel,
                toModel: entry.canonicalModelId,
                freshInputTokens: freshIn,
                cacheReadTokens: cacheRead,
                isColdCache: entry.isColdCacheSwitch,
            });
            if (entry.isColdCacheSwitch) {
                coldCacheSwitchCount++;
                coldCacheSwitchInputTokens += entry.coldSwitchFreshInputTokens;
            }
        }
    }
    const orchBucket = roleBuckets.orchestrator;
    const execBucket = roleBuckets.executor;
    if (orchBucket.calls === 0 && execBucket.calls === 0) {
        return null;
    }
    // Finalize cache hit rates & primary labels per role
    for (const role of ['orchestrator', 'executor', 'subagent', 'direct']) {
        const bucket = roleBuckets[role];
        bucket.cacheHitRate = bucket.totalPromptTokens > 0
            ? Math.max(0, Math.min(1, bucket.cacheReadTokens / bucket.totalPromptTokens))
            : null;
        // Dominant model (tie-break: latest model in bucket.models)
        let bestId = '';
        let bestCount = -1;
        for (const [mId, cnt] of roleModelCounts[role].entries()) {
            if (cnt >= bestCount) {
                bestCount = cnt;
                bestId = mId;
            }
        }
        bucket.primaryLabel = bestId ? localizedModelLabel(bestId) : '';
    }
    // Fallback planner/executor labels from orchestratorConfig when one side has 0 calls so far
    const cfgPlanId = canonicalModel(opts.orchestratorConfig?.planModel);
    const cfgExecId = canonicalModel(opts.orchestratorConfig?.executionModel);
    const plannerLabel = orchBucket.primaryLabel
        || (cfgPlanId ? localizedModelLabel(cfgPlanId) : '');
    const executorLabel = execBucket.primaryLabel
        || (cfgExecId ? localizedModelLabel(cfgExecId) : '');
    // Detect same-model orchestrator & mid-conversation reconfigurations
    const isSameModelOrchestrated = Boolean((orchBucket.models.length === 1 && execBucket.models.length === 1 && orchBucket.models[0] === execBucket.models[0])
        || (cfgPlanId && cfgExecId && cfgPlanId === cfgExecId)
        || (opts.orchestratorHistory || []).some(s => {
            const p = canonicalModel(s.planModel);
            const e = canonicalModel(s.executionModel);
            return Boolean(p && e && p === e);
        }));
    const distinctHistoryPairs = new Set((opts.orchestratorHistory || [])
        .map(s => `${canonicalModel(s.planModel)}->${canonicalModel(s.executionModel)}`)
        .filter(pair => pair !== '->'));
    const hasMidConversationReconfig = orchBucket.models.length > 1
        || execBucket.models.length > 1
        || distinctHistoryPairs.size > 1;
    const isMultiModelOrchestrated = (orchBucket.calls > 0 && execBucket.calls > 0)
        || (distinctModels.size >= 2 && (orchBucket.calls > 0 || execBucket.calls > 0));
    return {
        plannerLabel,
        plannerCalls: orchBucket.calls,
        plannerCostUsd: orchBucket.pricedCalls > 0 ? orchBucket.costUsd : null,
        executorLabel,
        executorCalls: execBucket.calls,
        executorCostUsd: execBucket.pricedCalls > 0 ? execBucket.costUsd : null,
        hasUnpriced,
        isMultiModelOrchestrated,
        isSameModelOrchestrated,
        hasMidConversationReconfig,
        distinctModelCount: distinctModels.size,
        orchestrator: orchBucket,
        executor: execBucket,
        subagent: roleBuckets.subagent,
        direct: roleBuckets.direct,
        totalCalls: attributedCalls.length,
        totalCostUsd: anyPricedCall ? totalCostSum : null,
        roleSwitchCount: switches.length,
        coldCacheSwitchCount,
        coldCacheSwitchInputTokens,
        switches,
        attributedCalls,
    };
}
const TURN_COLD_THRESHOLD_PCT = 10;
const TURN_WARM_THRESHOLD_PCT = 70;
/**
 * Classify a call's prompt-cache start state using Antigravity's additive prompt semantics:
 *   totalPrompt = freshInput + cacheRead + cacheCreation
 *   - `< 10%` (including `cacheRead === 0`) -> `'cold'`
 *   - `10% .. < 70%` -> `'partial'`
 *   - `>= 70%` -> `'warm'`
 *   - `totalPrompt <= 0` -> `'unknown'`
 */
function classifyFirstCallCacheStart(inputTokens, cacheReadTokens, cacheCreationTokens) {
    const fresh = safeNonNeg(inputTokens);
    const read = safeNonNeg(cacheReadTokens);
    const create = safeNonNeg(cacheCreationTokens);
    const totalPromptTokens = fresh + read + create;
    if (totalPromptTokens <= 0) {
        return { cacheStart: 'unknown', cacheHitRate: null, cacheHitPct: null, totalPromptTokens: 0 };
    }
    const cacheHitRate = Math.max(0, Math.min(1, read / totalPromptTokens));
    const cacheHitPct = Math.round(cacheHitRate * 1000) / 10;
    const cacheStart = cacheHitPct < TURN_COLD_THRESHOLD_PCT
        ? 'cold'
        : cacheHitPct < TURN_WARM_THRESHOLD_PCT
            ? 'partial'
            : 'warm';
    return { cacheStart, cacheHitRate, cacheHitPct, totalPromptTokens };
}
function getLatestAnchorStep(call) {
    if (!Array.isArray(call.userMessageAnchors) || call.userMessageAnchors.length === 0) {
        return null;
    }
    let maxStep = -1;
    for (const anchor of call.userMessageAnchors) {
        if (typeof anchor.stepIndex === 'number' && Number.isFinite(anchor.stepIndex) && anchor.stepIndex > maxStep) {
            maxStep = anchor.stepIndex;
        }
    }
    return maxStep >= 0 ? maxStep : null;
}
/**
 * Group a conversation's GM calls into user turns and classify each user turn's
 * first GM call as `cold` / `partial` / `warm` cache start + net `+Δ` context growth.
 */
function analyzeUserTurnCacheStates(calls, options) {
    const empty = {
        turns: [],
        latestTurn: null,
        coldCount: 0,
        partialCount: 0,
        warmCount: 0,
        unknownCount: 0,
    };
    if (!calls || calls.length === 0) {
        return empty;
    }
    const nonCompaction = calls.filter(c => !(0, telemetry_metrics_1.isInternalCompactionCall)(c));
    if (nonCompaction.length === 0) {
        return empty;
    }
    const attributed = classifyConversationCalls(nonCompaction, options);
    const explicitBoundaries = (options?.userTurnStepIndices || [])
        .filter(s => typeof s === 'number' && Number.isFinite(s) && s >= 0)
        .sort((a, b) => a - b);
    const resolveTurnBucket = (call, idx) => {
        // Priority 1: Explicit USER_INPUT step boundaries from trajectory
        if (explicitBoundaries.length > 0) {
            const step = getCallPrimaryStep(call);
            if (step !== null) {
                let boundary = -1;
                for (const b of explicitBoundaries) {
                    if (b <= step) {
                        boundary = b;
                    }
                    else {
                        break;
                    }
                }
                if (boundary >= 0) {
                    return `step:${boundary}`;
                }
            }
        }
        // Priority 2: User message anchor progression inside GM metadata
        const anchorStep = getLatestAnchorStep(call);
        if (anchorStep !== null) {
            return `anchor:${anchorStep}`;
        }
        // Priority 3: Distinct executionId groups (if executionIds actually vary or group calls)
        if (call.executionId && call.executionId.trim()) {
            return `exec:${call.executionId.trim()}`;
        }
        // Fallback: each call is its own turn
        return `call:${idx}`;
    };
    const groups = [];
    let currentKey = '';
    for (let i = 0; i < attributed.length; i++) {
        const entry = attributed[i];
        const key = resolveTurnBucket(entry.call, i);
        if (groups.length === 0 || key !== currentKey) {
            groups.push([entry]);
            currentKey = key;
        }
        else {
            groups[groups.length - 1].push(entry);
        }
    }
    const turns = [];
    let prevFirstPrompt = null;
    let coldCount = 0;
    let partialCount = 0;
    let warmCount = 0;
    let unknownCount = 0;
    for (let t = 0; t < groups.length; t++) {
        const group = groups[t];
        const first = group[0];
        const last = group[group.length - 1];
        const firstCall = first.call;
        const lastCall = last.call;
        const firstCache = classifyFirstCallCacheStart(firstCall.inputTokens, firstCall.cacheReadTokens, firstCall.cacheCreationTokens);
        const lastPromptTokens = safeNonNeg(lastCall.inputTokens)
            + safeNonNeg(lastCall.cacheReadTokens)
            + safeNonNeg(lastCall.cacheCreationTokens);
        const netContextDeltaTokens = (prevFirstPrompt !== null && firstCache.totalPromptTokens > 0)
            ? firstCache.totalPromptTokens - prevFirstPrompt
            : null;
        const isCompactionDrop = netContextDeltaTokens !== null && netContextDeltaTokens < -constants_1.COMPRESSION_MIN_DROP;
        const intraTurnGrowthTokens = (lastPromptTokens > 0 && firstCache.totalPromptTokens > 0)
            ? lastPromptTokens - firstCache.totalPromptTokens
            : 0;
        const hadColdCacheSwitch = group.some(item => item.isColdCacheSwitch);
        if (firstCache.totalPromptTokens > 0) {
            prevFirstPrompt = firstCache.totalPromptTokens;
        }
        if (firstCache.cacheStart === 'cold') {
            coldCount++;
        }
        else if (firstCache.cacheStart === 'partial') {
            partialCount++;
        }
        else if (firstCache.cacheStart === 'warm') {
            warmCount++;
        }
        else {
            unknownCount++;
        }
        const step = getCallPrimaryStep(firstCall);
        turns.push({
            turnIndex: t + 1,
            firstCallIndex: first.callIndex,
            callCount: group.length,
            ...(step !== null ? { firstStepIndex: step } : {}),
            createdAt: firstCall.createdAt || '',
            model: first.canonicalModelId || firstCall.modelDisplay || firstCall.responseModel || '',
            firstCallRole: first.role,
            cacheStart: firstCache.cacheStart,
            cacheHitRate: firstCache.cacheHitRate,
            cacheHitPct: firstCache.cacheHitPct,
            firstCallPromptTokens: firstCache.totalPromptTokens,
            firstCallFreshInputTokens: safeNonNeg(firstCall.inputTokens),
            firstCallCacheReadTokens: safeNonNeg(firstCall.cacheReadTokens),
            lastCallPromptTokens: lastPromptTokens,
            netContextDeltaTokens,
            intraTurnGrowthTokens,
            isCompactionDrop,
            hadColdCacheSwitch,
        });
    }
    return {
        turns,
        latestTurn: turns.length > 0 ? turns[turns.length - 1] : null,
        coldCount,
        partialCount,
        warmCount,
        unknownCount,
    };
}
// ─── Reusable Studio Telemetry HTML & CSS Helpers ────────────────────────────
function fmtCompact(n) {
    if (!Number.isFinite(n) || n <= 0) {
        return '0';
    }
    if (n >= 1_000_000) {
        return `${(n / 1_000_000).toFixed(2)}M`;
    }
    if (n >= 1_000) {
        return `${(n / 1_000).toFixed(1)}k`;
    }
    return String(Math.round(n));
}
/**
 * Render a compact role badge (`Orchestrator` / `Executor` / `Subagent`) and optional
 * cold-cache switch pill for Recent Calls Ledger rows and Overview details.
 * Returns `''` for `'direct'` calls so single-model conversations stay uncluttered.
 */
function renderCallRoleBadgeHtml(role, isColdCacheSwitch = false, switchDirection) {
    const parts = [];
    if (role === 'orchestrator') {
        parts.push(`<span class="orch-role-badge is-orchestrator" data-call-role="orchestrator">${(0, webview_helpers_1.tBiHtml)('Orchestrator', '编排')}</span>`);
    }
    else if (role === 'executor') {
        parts.push(`<span class="orch-role-badge is-executor" data-call-role="executor">${(0, webview_helpers_1.tBiHtml)('Executor', '执行')}</span>`);
    }
    else if (role === 'subagent') {
        parts.push(`<span class="orch-role-badge is-subagent" data-call-role="subagent">${(0, webview_helpers_1.tBiHtml)('Subagent', '子智能体')}</span>`);
    }
    if (isColdCacheSwitch) {
        const dirTip = switchDirection === 'orchestrator_to_executor'
            ? (0, i18n_1.tBi)('Role switch (Orchestrator → Executor) started with cold prompt cache (0 cache read)', '角色切换（编排模型 → 执行模型）触发冷缓存（缓存读取为 0）')
            : switchDirection === 'executor_to_orchestrator'
                ? (0, i18n_1.tBi)('Role switch (Executor → Orchestrator) started with cold prompt cache (0 cache read)', '角色切换（执行模型 → 编排模型）触发冷缓存（缓存读取为 0）')
                : (0, i18n_1.tBi)('Role switch started with cold prompt cache (0 cache read)', '角色切换触发冷缓存（缓存读取为 0）');
        parts.push(`<span class="orch-cold-switch-pill" data-cold-cache-switch="true" title="${(0, webview_helpers_1.esc)(dirTip)}">${(0, webview_helpers_1.tBiHtml)('Switch Cold', '切换冷启动')}</span>`);
    }
    return parts.join(' ');
}
/**
 * Build an auto-hiding Orchestrator vs Executor breakdown card (reusable in GM Data & Phase B Overview).
 * Automatically returns `''` for single-model direct conversations (`!split || !split.isMultiModelOrchestrated`).
 */
function buildOrchestratorSplitCardHtml(split, options) {
    if (!split || !split.isMultiModelOrchestrated) {
        return '';
    }
    const compact = options?.compact === true;
    const orch = split.orchestrator;
    const exec = split.executor;
    const sub = split.subagent;
    const orchWeight = (orch.costUsd ?? 0) > 0 || (exec.costUsd ?? 0) > 0
        ? (orch.costUsd ?? 0)
        : (orch.totalPromptTokens + orch.outputTokens);
    const execWeight = (orch.costUsd ?? 0) > 0 || (exec.costUsd ?? 0) > 0
        ? (exec.costUsd ?? 0)
        : (exec.totalPromptTokens + exec.outputTokens);
    const totalWeight = orchWeight + execWeight;
    const orchPct = totalWeight > 0 ? Math.round((orchWeight / totalWeight) * 100) : 50;
    const execPct = Math.max(0, 100 - orchPct);
    const renderRoleRow = (roleKey, titleEn, titleZh, metrics, fallbackLabel) => {
        const modelLabel = metrics.labels.length > 1
            ? metrics.labels.join(' / ')
            : (metrics.primaryLabel || fallbackLabel || '—');
        const totalTok = metrics.totalPromptTokens + metrics.outputTokens;
        const costStr = metrics.costUsd !== null
            ? (0, pricing_store_1.formatUsdCost)(metrics.costUsd, { precision: metrics.costUsd < 0.01 ? 'standard' : 'call' })
            : (0, i18n_1.tBi)('Unpriced', '未定价');
        const mappedHint = metrics.mappedBaseCalls > 0
            ? ` <span class="orch-split-mapped-tag">${(0, webview_helpers_1.tBiHtml)('Est.', '估算')}</span>`
            : '';
        const cacheStr = (0, telemetry_metrics_1.formatCachePercent)(metrics.cacheHitRate);
        return `<div class="orch-split-row" data-split-role="${roleKey}">
            <div class="orch-split-row-main">
                <span class="orch-role-badge is-${roleKey}">${(0, webview_helpers_1.tBiHtml)(titleEn, titleZh)}</span>
                <span class="orch-split-model" title="${(0, webview_helpers_1.esc)(modelLabel)}">${(0, webview_helpers_1.esc)(modelLabel)}</span>
            </div>
            <div class="orch-split-row-metrics">
                <span class="orch-split-metric">${(0, i18n_1.formatNumber)(metrics.calls)} ${(0, webview_helpers_1.tBiHtml)(metrics.calls === 1 ? 'call' : 'calls', '次')}</span>
                <span class="orch-split-metric">${(0, webview_helpers_1.esc)(fmtCompact(totalTok))} tok</span>
                <span class="orch-split-metric">${(0, webview_helpers_1.tBiHtml)('Cache', '缓存')} ${(0, webview_helpers_1.esc)(cacheStr)}</span>
                <span class="orch-split-metric is-cost">${(0, webview_helpers_1.esc)(costStr)}${mappedHint}</span>
            </div>
        </div>`;
    };
    const metaPills = [];
    if (split.isSameModelOrchestrated) {
        metaPills.push(`<span class="orch-split-meta-pill">${(0, webview_helpers_1.tBiHtml)('Same-model', '同模型编排')}</span>`);
    }
    if (split.hasMidConversationReconfig) {
        metaPills.push(`<span class="orch-split-meta-pill">${(0, webview_helpers_1.tBiHtml)('Reconfigured', '中途切换配置')}</span>`);
    }
    if (split.totalCostUsd !== null) {
        metaPills.push(`<span class="orch-split-meta-pill is-total">${(0, webview_helpers_1.esc)((0, pricing_store_1.formatUsdCost)(split.totalCostUsd))}</span>`);
    }
    const coldSwitchBanner = split.coldCacheSwitchCount > 0
        ? `<div class="orch-split-cold-note" data-cold-switch-count="${split.coldCacheSwitchCount}">
            <span class="orch-cold-switch-pill">${(0, webview_helpers_1.tBiHtml)('Cold Switch', '切换冷启动')} ×${split.coldCacheSwitchCount}</span>
            <span>${(0, webview_helpers_1.tBiHtml)(`${fmtCompact(split.coldCacheSwitchInputTokens)} fresh input re-prefilled when switching between Orchestrator and Executor (each role keeps a separate prompt cache).`, `编排模型与执行模型切换时有 ${fmtCompact(split.coldCacheSwitchInputTokens)} 新增输入重新预填充（两者的提示词缓存相互独立）。`)}</span>
        </div>`
        : '';
    const branchIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M8.5 7.5 11 15.5"/><path d="M15.5 7.5 13 15.5"/></svg>`;
    const cardId = compact ? 'overviewOrchestratorSplitCard' : 'orchestratorSplitCard';
    return `<section class="orch-split-card${compact ? ' is-compact' : ''}" id="${cardId}" data-orchestrator-split="true" data-cold-switches="${split.coldCacheSwitchCount}">
        <div class="orch-split-head">
            <h3 class="orch-split-title">${branchIcon}<span>${(0, webview_helpers_1.tBiHtml)('Orchestrator vs Executor', '编排模型 vs 执行模型')}</span></h3>
            <div class="orch-split-meta">${metaPills.join('')}</div>
        </div>
        <div class="orch-split-bar" aria-hidden="true">
            <span class="orch-split-bar-orch" style="width:${orchPct}%"></span>
            <span class="orch-split-bar-exec" style="width:${execPct}%"></span>
        </div>
        <div class="orch-split-rows">
            ${renderRoleRow('orchestrator', 'Orchestrator', '编排模型', orch, split.plannerLabel)}
            ${renderRoleRow('executor', 'Executor', '执行模型', exec, split.executorLabel)}
            ${sub.calls > 0 ? renderRoleRow('subagent', 'Subagent', '子智能体', sub, '') : ''}
        </div>
        ${coldSwitchBanner}
    </section>`;
}
/**
 * Balanced Studio Telemetry CSS for Orchestrator role badges, cold-cache switch pills,
 * and the Orchestrator vs Executor breakdown card.
 */
function getOrchestratorAttributionStyles() {
    return `
    /* ─── Orchestrator Role Badges & Cold-Cache Switch Pills ─── */
    .orch-role-badge,
    .orch-cold-switch-pill {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: var(--ed-radius-pill);
        font-size: 0.65rem;
        font-weight: 600;
        line-height: 1.4;
        border: 1px solid;
        background: var(--ed-surface);
        white-space: nowrap;
        flex-shrink: 0;
    }
    .orch-role-badge.is-orchestrator {
        color: var(--ed-accent);
        border-color: var(--ed-accent-border);
    }
    .orch-role-badge.is-executor {
        color: var(--ed-good);
        border-color: var(--ed-good-border);
    }
    .orch-role-badge.is-subagent {
        color: var(--ed-ink-secondary);
        border-color: var(--ed-border-strong);
    }
    .orch-cold-switch-pill {
        color: var(--ed-warn);
        border-color: var(--ed-warn-border);
    }
    .rc-role-wrap {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
    }
    .rc-short-sample {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border-radius: var(--ed-radius-xs);
        border: 1px solid var(--ed-border-strong);
        background: var(--ed-surface);
        color: var(--ed-ink-muted);
        font-size: 0.68rem;
        font-weight: 550;
        white-space: nowrap;
    }

    /* ─── Orchestrator vs Executor Breakdown Card ─── */
    .orch-split-card {
        background: var(--ed-surface);
        border: 1px solid var(--ed-border);
        border-radius: var(--ed-radius-md);
        padding: 12px 14px;
        margin-bottom: 16px;
    }
    .orch-split-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 10px;
        margin-bottom: 8px;
    }
    .orch-split-title {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--ed-ink);
    }
    .orch-split-title svg {
        color: var(--ed-accent);
        flex-shrink: 0;
    }
    .orch-split-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }
    .orch-split-meta-pill {
        display: inline-flex;
        align-items: center;
        padding: 1px 7px;
        border-radius: var(--ed-radius-pill);
        border: 1px solid var(--ed-border);
        background: var(--ed-surface-well);
        color: var(--ed-ink-secondary);
        font-size: 0.6875rem;
        font-weight: 550;
        font-variant-numeric: tabular-nums lining-nums;
    }
    .orch-split-meta-pill.is-total {
        color: var(--ed-accent);
        border-color: var(--ed-accent-border);
        background: var(--ed-surface);
        font-weight: 650;
    }
    .orch-split-bar {
        display: flex;
        height: 6px;
        border-radius: var(--ed-radius-pill);
        overflow: hidden;
        background: var(--ed-track);
        margin-bottom: 10px;
        gap: 2px;
    }
    .orch-split-bar-orch {
        background: var(--ed-accent);
        height: 100%;
    }
    .orch-split-bar-exec {
        background: var(--ed-good);
        height: 100%;
    }
    .orch-split-rows {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .orch-split-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 6px 12px;
        padding: 6px 8px;
        border-radius: var(--ed-radius-xs);
        background: var(--ed-surface-well);
        border: 1px solid var(--ed-border);
    }
    .orch-split-row-main {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
    }
    .orch-split-model {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--ed-ink);
        overflow-wrap: anywhere;
    }
    .orch-split-row-metrics {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 10px;
        font-size: 0.72rem;
        color: var(--ed-ink-secondary);
        font-variant-numeric: tabular-nums lining-nums;
    }
    .orch-split-metric.is-cost {
        font-weight: 650;
        color: var(--ed-ink);
    }
    .orch-split-mapped-tag {
        font-size: 0.65rem;
        font-weight: 550;
        color: var(--ed-accent);
    }
    .orch-split-cold-note {
        display: flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 6px 8px;
        margin-top: 8px;
        padding: 7px 9px;
        border-radius: var(--ed-radius-xs);
        background: var(--ed-warn-tint);
        border: 1px solid var(--ed-warn-border);
        font-size: 0.72rem;
        line-height: 1.45;
        color: var(--ed-ink-secondary);
    }
    `;
}
//# sourceMappingURL=orchestrator-attribution.js.map