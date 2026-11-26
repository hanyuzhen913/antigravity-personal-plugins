"use strict";
// ─── Pure Telemetry Metrics Engine ───────────────────────────────────────────
// Single source of truth for generation speed (tok/s), TTFT, streaming duration,
// and prompt-cache efficiency metrics across Status Bar, Overview, GM Data, and Calendar.
//
// Zero VS Code or DOM dependencies — deterministic and cross-platform.
//
// Ground-truth Antigravity protobuf semantics:
//   - streamingSeconds strictly EXCLUDES ttftSeconds (decode phase only).
//   - cacheReadTokens and cacheCreationTokens are strictly ADDITIVE with inputTokens:
//       totalPromptTokens = inputTokens + cacheReadTokens + cacheCreationTokens
//   - thinkingTokens is strictly a SUBSET of outputTokens (NEVER sum output + thinking).
//   - Implicit thinking (e.g. Gemini Flash omitting thinkingOutputTokens while
//     outputTokens > responseTokens > 0) is handled via effectiveThinkingTokens and
//     visibleResponseTokens.
Object.defineProperty(exports, "__esModule", { value: true });
exports.LONG_CONTEXT_TIER_THRESHOLD = exports.SHORT_SAMPLE_MIN_STREAM_SECONDS = exports.SHORT_SAMPLE_MIN_OUTPUT_TOKENS = exports.REP_MIN_OUTPUT_TOKENS = exports.REP_MIN_STREAM_SECONDS = exports.MIN_OUTPUT_TOKENS_FOR_SPEED = exports.MIN_STREAM_SECONDS = void 0;
exports.evaluateSpeedSample = evaluateSpeedSample;
exports.computeContextWatermarks = computeContextWatermarks;
exports.isInternalCompactionCall = isInternalCompactionCall;
exports.createEmptyTelemetryAggregate = createEmptyTelemetryAggregate;
exports.computeCallTelemetry = computeCallTelemetry;
exports.computeTelemetryAggregateFromModelStats = computeTelemetryAggregateFromModelStats;
exports.computeTelemetryAggregate = computeTelemetryAggregate;
exports.computeTelemetrySummary = computeTelemetrySummary;
exports.computeStepSpeed = computeStepSpeed;
exports.computeStepCacheHitRate = computeStepCacheHitRate;
exports.formatSpeed = formatSpeed;
exports.formatLatency = formatLatency;
exports.formatCachePercent = formatCachePercent;
const models_1 = require("./models");
const pricing_store_1 = require("./pricing-store");
// ─── Noise & Validity Thresholds ─────────────────────────────────────────────
/** Hard lower bound on streaming duration (seconds) for valid decode speed. */
exports.MIN_STREAM_SECONDS = 0.05;
/** Hard lower bound on output tokens for valid decode speed (excludes 1-token jitter). */
exports.MIN_OUTPUT_TOKENS_FOR_SPEED = 2;
/** Representative lower bound on streaming duration (seconds) for median/min/max spread. */
exports.REP_MIN_STREAM_SECONDS = 0.25;
/** Representative lower bound on output tokens for median/min/max spread. */
exports.REP_MIN_OUTPUT_TOKENS = 10;
/** Sparse-sample speed guard minimum output tokens (below this -> Short sample / 短样本). */
exports.SHORT_SAMPLE_MIN_OUTPUT_TOKENS = 16;
/** Sparse-sample speed guard minimum streaming duration in seconds (below this -> Short sample). */
exports.SHORT_SAMPLE_MIN_STREAM_SECONDS = 0.3;
/** Standard long-context pricing tier threshold (200k prompt tokens). */
exports.LONG_CONTEXT_TIER_THRESHOLD = 200_000;
// ─── Internal Helpers ────────────────────────────────────────────────────────
function safeNonNeg(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
function positiveOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function clamp01(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return value;
}
function parseValidTimestamp(iso) {
    if (!iso) {
        return null;
    }
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : null;
}
/** Linear-interpolated quantile (R-7) over an ascending sorted non-empty array. */
function percentile(sortedAsc, p) {
    const n = sortedAsc.length;
    if (n === 0) {
        return null;
    }
    if (n === 1) {
        return sortedAsc[0];
    }
    const idx = (n - 1) * clamp01(p);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) {
        return sortedAsc[lo];
    }
    return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}
function arithmeticMean(values) {
    if (values.length === 0) {
        return null;
    }
    let sum = 0;
    for (const v of values) {
        sum += v;
    }
    return sum / values.length;
}
function classifyCacheState(cacheReadTokens, cacheCreationTokens, totalPromptTokens) {
    if (cacheReadTokens > 0) {
        return 'warm';
    }
    if (cacheCreationTokens > 0) {
        return 'warming';
    }
    if (totalPromptTokens > 0) {
        return 'cold';
    }
    return 'unknown';
}
function isHardValidSpeedSample(outputTokens, streamingSeconds) {
    return streamingSeconds !== null
        && streamingSeconds >= exports.MIN_STREAM_SECONDS
        && outputTokens >= exports.MIN_OUTPUT_TOKENS_FOR_SPEED;
}
function isRepresentativeSpeedSample(outputTokens, streamingSeconds) {
    return streamingSeconds !== null
        && streamingSeconds >= exports.REP_MIN_STREAM_SECONDS
        && outputTokens >= exports.REP_MIN_OUTPUT_TOKENS;
}
function resolveModelLabel(call) {
    const raw = call.modelDisplay || call.model || call.responseModel || '';
    return ((0, models_1.normalizeModelDisplayName)(raw) || raw).trim();
}
function resolvePricingForCall(call, customPricing, orchestratorPricingMode = (0, pricing_store_1.getOrchestratorPricingMode)()) {
    const custom = customPricing || {};
    const fallback = (0, pricing_store_1.selectPricingModel)(call.modelDisplay || '', call.responseModel || '', custom);
    const pricingModel = (0, pricing_store_1.selectPricingModel)(call.model || '', fallback, custom);
    if (!pricingModel) {
        return null;
    }
    if (call.createdAt) {
        const dated = (0, pricing_store_1.findPricingForDate)(pricingModel, custom, call.createdAt, undefined, orchestratorPricingMode);
        if (dated) {
            return dated;
        }
    }
    return (0, pricing_store_1.findPricingWithCustom)(pricingModel, custom, undefined, orchestratorPricingMode);
}
function resolvePricingForModelKey(modelKey, responseModel, customPricing, orchestratorPricingMode = (0, pricing_store_1.getOrchestratorPricingMode)()) {
    const custom = customPricing || {};
    const pricingModel = (0, pricing_store_1.selectPricingModel)(modelKey, responseModel, custom);
    if (!pricingModel) {
        return null;
    }
    return (0, pricing_store_1.findPricingWithCustom)(pricingModel, custom, undefined, orchestratorPricingMode);
}
// ─── Sparse-Sample Speed Guard & Dual Watermark ──────────────────────────────
/**
 * Evaluate a decode throughput sample with sparse-sample micro-burst suppression.
 * Prevents noisy TPS spikes on tiny bursts (e.g. 4 tokens in 15ms) while keeping
 * `rawSpeed` available for tooltips/detail drawers and exposing explicit TTFT waiting state.
 */
function evaluateSpeedSample(input) {
    const out = safeNonNeg(input.outputTokens);
    const stream = positiveOrNull(input.streamingSeconds);
    const ttft = positiveOrNull(input.ttftSeconds);
    const elapsedWait = positiveOrNull(input.elapsedWaitSeconds);
    const minOut = typeof input.minOutputTokens === 'number' && Number.isFinite(input.minOutputTokens) && input.minOutputTokens > 0
        ? Math.max(exports.MIN_OUTPUT_TOKENS_FOR_SPEED, input.minOutputTokens)
        : exports.SHORT_SAMPLE_MIN_OUTPUT_TOKENS;
    const minStream = typeof input.minStreamSeconds === 'number' && Number.isFinite(input.minStreamSeconds) && input.minStreamSeconds > 0
        ? Math.max(exports.MIN_STREAM_SECONDS, input.minStreamSeconds)
        : exports.SHORT_SAMPLE_MIN_STREAM_SECONDS;
    // Waiting for first token: no output tokens / decode duration yet, but request is streaming or TTFT pending.
    if (out === 0 && stream === null) {
        if (input.isStreaming === true || elapsedWait !== null || ttft !== null) {
            return {
                isShortSample: false,
                displaySpeed: null,
                rawSpeed: null,
                isWaitingTtft: true,
                waitingSeconds: elapsedWait ?? ttft ?? null,
            };
        }
        return {
            isShortSample: false,
            displaySpeed: null,
            rawSpeed: null,
            isWaitingTtft: false,
        };
    }
    // Output arrived with no recorded positive stream duration (or positive stream with 0 output).
    if (out <= 0 || stream === null) {
        if (input.isStreaming === true && out === 0) {
            return {
                isShortSample: false,
                displaySpeed: null,
                rawSpeed: null,
                isWaitingTtft: true,
                waitingSeconds: elapsedWait ?? ttft ?? null,
            };
        }
        return {
            isShortSample: false,
            displaySpeed: null,
            rawSpeed: null,
            isWaitingTtft: false,
        };
    }
    const rawSpeed = out / stream;
    if (!Number.isFinite(rawSpeed) || rawSpeed <= 0) {
        return {
            isShortSample: false,
            displaySpeed: null,
            rawSpeed: null,
            isWaitingTtft: false,
        };
    }
    if (out < minOut || stream < minStream) {
        return {
            isShortSample: true,
            displaySpeed: null,
            rawSpeed,
            isWaitingTtft: false,
        };
    }
    return {
        isShortSample: false,
        displaySpeed: rawSpeed,
        rawSpeed,
        isWaitingTtft: false,
    };
}
/**
 * Compute dual-watermark context metadata comparing platform auto-compaction ceiling
 * against physical model context window, plus the 200k long-context pricing tier marker.
 */
function computeContextWatermarks(input) {
    const contextUsed = safeNonNeg(input.contextUsed);
    const threshold = typeof input.longContextThreshold === 'number'
        && Number.isFinite(input.longContextThreshold)
        && input.longContextThreshold > 0
        ? input.longContextThreshold
        : exports.LONG_CONTEXT_TIER_THRESHOLD;
    let specMaxTokens = 0;
    let specCpLimit = 0;
    if (input.model && input.model.trim()) {
        const resolved = (0, models_1.resolveModelId)(input.model) || input.model.trim();
        const spec = (0, models_1.getModelSpecs)().find(s => s.placeholderId === resolved || s.modelId === resolved);
        if (spec) {
            specMaxTokens = safeNonNeg(spec.maxTokens);
            specCpLimit = safeNonNeg(spec.cpLimit);
        }
        if (specCpLimit <= 0) {
            specCpLimit = safeNonNeg((0, models_1.getContextLimit)(input.model));
        }
    }
    const explicitCompaction = positiveOrNull(input.compactionLimit);
    const explicitPhysical = positiveOrNull(input.physicalContextWindow);
    const compactionLimit = explicitCompaction ?? (specCpLimit > 0 ? specCpLimit : (explicitPhysical ?? specMaxTokens));
    const rawPhysical = explicitPhysical ?? (specMaxTokens > 0 ? specMaxTokens : compactionLimit);
    const physicalContextWindow = Math.max(compactionLimit, rawPhysical);
    const compactionUsagePct = compactionLimit > 0 ? (contextUsed / compactionLimit) * 100 : 0;
    const physicalUsagePct = physicalContextWindow > 0
        ? Math.min(100, (contextUsed / physicalContextWindow) * 100)
        : 0;
    const compactionMarkerPct = physicalContextWindow > 0 && compactionLimit > 0
        ? Math.min(100, (compactionLimit / physicalContextWindow) * 100)
        : 100;
    const hasDistinctPhysicalWindow = physicalContextWindow > compactionLimit && compactionLimit > 0;
    const longContextMarkerPctOfCompaction = compactionLimit > threshold
        ? (threshold / compactionLimit) * 100
        : null;
    const longContextMarkerPctOfPhysical = physicalContextWindow > threshold
        ? (threshold / physicalContextWindow) * 100
        : null;
    const showLongContextMarker = longContextMarkerPctOfCompaction !== null || longContextMarkerPctOfPhysical !== null;
    const exceedsLongContextTier = contextUsed > threshold;
    const tokensUntilCompaction = compactionLimit > 0 ? Math.max(0, compactionLimit - contextUsed) : 0;
    const tokensUntilLongContextTier = showLongContextMarker
        ? Math.max(0, threshold - contextUsed)
        : null;
    const severity = compactionUsagePct >= 80
        ? 'critical'
        : compactionUsagePct >= 50
            ? 'caution'
            : 'safe';
    return {
        contextUsed,
        compactionLimit,
        physicalContextWindow,
        compactionUsagePct,
        physicalUsagePct,
        compactionMarkerPct,
        hasDistinctPhysicalWindow,
        longContextThreshold: threshold,
        showLongContextMarker,
        longContextMarkerPctOfCompaction,
        longContextMarkerPctOfPhysical,
        exceedsLongContextTier,
        tokensUntilCompaction,
        tokensUntilLongContextTier,
        severity,
    };
}
/**
 * Conservative detector for internal compaction/checkpoint-summarization calls.
 * Only triggers on unambiguous internal metadata markers so normal chat calls
 * (including chats discussing compaction or conversations containing checkpoints)
 * are never excluded.
 */
function isInternalCompactionCall(call) {
    const execId = (call.executionId || '').trim();
    if (execId && /^(?:compaction|checkpoint[-_]?summary|summary[-_]?compaction|summarize[-_]?conversation)(?:[-_:]|$)/i.test(execId)) {
        return true;
    }
    const toolCount = safeNonNeg(call.toolCount);
    const hasUserAnchors = Array.isArray(call.userMessageAnchors) && call.userMessageAnchors.length > 0;
    if (toolCount > 0 || hasUserAnchors) {
        return false;
    }
    const titles = Array.isArray(call.promptSectionTitles) ? call.promptSectionTitles : [];
    if (titles.length > 0 && titles.every(t => /^(?:compaction|conversation[ _-]?compaction|checkpoint[ _-]?summary|history[ _-]?summary)$/i.test((t || '').trim()))) {
        return true;
    }
    const sysPrompt = (call.systemPromptSnippet || '').trim();
    if (sysPrompt && /^(?:you are (?:an? )?(?:conversation |context |checkpoint )?(?:compaction|summarizer|summary) (?:assistant|agent|model)|summarize (?:this|the) (?:preceding |following )?conversation (?:into|for) (?:a )?(?:concise )?(?:checkpoint|compaction))/i.test(sysPrompt)) {
        return true;
    }
    return false;
}
/** Create an empty TelemetryAggregate with null ratios/timings and zero counters. */
function createEmptyTelemetryAggregate() {
    return {
        weightedGenTokPerSec: null,
        medianGenTokPerSec: null,
        minGenTokPerSec: null,
        maxGenTokPerSec: null,
        weightedVisibleTokPerSec: null,
        weightedEndToEndTokPerSec: null,
        latestGenTokPerSec: null,
        latestVisibleTokPerSec: null,
        speedSampleCount: 0,
        representativeSpeedSampleCount: 0,
        hasThinking: false,
        avgTtftSeconds: null,
        medianTtftSeconds: null,
        p95TtftSeconds: null,
        minTtftSeconds: null,
        maxTtftSeconds: null,
        latestTtftSeconds: null,
        ttftSampleCount: 0,
        cachedAvgTtftSeconds: null,
        uncachedAvgTtftSeconds: null,
        cachedTtftCount: 0,
        uncachedTtftCount: 0,
        ttftCacheDeltaPct: null,
        avgStreamingSeconds: null,
        streamingSampleCount: 0,
        totalPromptTokens: 0,
        totalFreshInputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheCreationTokens: 0,
        tokenCacheHitRate: null,
        callCacheHitRate: null,
        cacheReuseRate: null,
        cachedCallCount: 0,
        totalCalls: 0,
        latestCacheState: 'unknown',
        estCacheSavedTokens: 0,
        estCacheSavingsUsd: null,
        latestCall: null,
        latestTimedCall: null,
        latestSpeedSample: null,
    };
}
/** Pick the chronologically latest entry (prefer valid timestamps; tie-break by order). */
function pickLatest(entries) {
    if (entries.length === 0) {
        return null;
    }
    let best = entries[0];
    for (let i = 1; i < entries.length; i++) {
        const cur = entries[i];
        if (cur.ts !== null && best.ts !== null) {
            if (cur.ts > best.ts || (cur.ts === best.ts && cur.order > best.order)) {
                best = cur;
            }
        }
        else if (cur.ts !== null && best.ts === null) {
            best = cur;
        }
        else if (cur.ts === null && best.ts === null && cur.order > best.order) {
            best = cur;
        }
    }
    return best.point;
}
// ─── Core Telemetry Computation ──────────────────────────────────────────────
/**
 * Compute normalized per-call telemetry point from a single GMCallEntry.
 */
function computeCallTelemetry(call, customPricing, cascadeIdOverride, orchestratorPricingMode) {
    const cascadeId = cascadeIdOverride ?? call.cascadeId ?? '';
    const model = resolveModelLabel(call);
    const createdAt = call.createdAt || '';
    const callId = call.executionId
        || (Array.isArray(call.stepIndices) && call.stepIndices.length > 0
            ? `${cascadeId || 'call'}:${call.stepIndices.join(',')}`
            : `${cascadeId || 'call'}:${createdAt || model || 'unknown'}`);
    const ttftSeconds = positiveOrNull(call.ttftSeconds);
    const streamingSeconds = positiveOrNull(call.streamingSeconds);
    const inputTokens = safeNonNeg(call.inputTokens);
    const outputTokens = safeNonNeg(call.outputTokens);
    const thinkingTokens = safeNonNeg(call.thinkingTokens);
    const responseTokens = safeNonNeg(call.responseTokens);
    const cacheReadTokens = safeNonNeg(call.cacheReadTokens);
    const cacheCreationTokens = safeNonNeg(call.cacheCreationTokens);
    // Thinking tokens are strictly a subset of outputTokens; handle implicit thinking
    // (e.g., Gemini Flash omitting thinkingOutputTokens while outputTokens > responseTokens).
    const visibleResponseTokens = responseTokens > 0
        ? Math.min(outputTokens, responseTokens)
        : Math.max(0, outputTokens - thinkingTokens);
    const effectiveThinkingTokens = thinkingTokens > 0
        ? thinkingTokens
        : (responseTokens > 0 && outputTokens > responseTokens ? outputTokens - responseTokens : 0);
    // Antigravity additive prompt cache semantics
    const totalPromptTokens = inputTokens + cacheReadTokens + cacheCreationTokens;
    const promptCacheHitRate = totalPromptTokens > 0
        ? clamp01(cacheReadTokens / totalPromptTokens)
        : null;
    const isCacheHit = cacheReadTokens > 0;
    const cacheState = classifyCacheState(cacheReadTokens, cacheCreationTokens, totalPromptTokens);
    // Speed metrics (decode strictly excludes TTFT; 1-token / sub-50ms noise rejected)
    const speedValid = isHardValidSpeedSample(outputTokens, streamingSeconds);
    const totalGenTokPerSec = speedValid
        ? outputTokens / streamingSeconds
        : null;
    const visibleTokPerSec = (speedValid && visibleResponseTokens > 0)
        ? visibleResponseTokens / streamingSeconds
        : null;
    const endToEndTokPerSec = (speedValid && ttftSeconds !== null)
        ? outputTokens / (ttftSeconds + streamingSeconds)
        : null;
    const speedSample = evaluateSpeedSample({
        outputTokens,
        streamingSeconds,
        ttftSeconds,
    });
    // Cache read savings in USD — null when unpriced or no cache read (never fake $0.00)
    let estCacheSavingsUsd = null;
    if (cacheReadTokens > 0) {
        const pricing = resolvePricingForCall(call, customPricing, orchestratorPricingMode);
        if (pricing) {
            const rateDiff = Math.max(0, pricing.input - pricing.cacheRead);
            estCacheSavingsUsd = (cacheReadTokens * rateDiff) / 1_000_000;
        }
    }
    return {
        callId,
        cascadeId,
        model,
        createdAt,
        ttftSeconds,
        streamingSeconds,
        inputTokens,
        outputTokens,
        thinkingTokens,
        effectiveThinkingTokens,
        visibleResponseTokens,
        cacheReadTokens,
        cacheCreationTokens,
        totalPromptTokens,
        totalGenTokPerSec,
        visibleTokPerSec,
        endToEndTokPerSec,
        promptCacheHitRate,
        isCacheHit,
        cacheState,
        estCacheSavingsUsd,
        speedSample,
    };
}
/**
 * Fallback telemetry aggregate from GMModelStats when per-call `calls[]` is empty/archived.
 * Preserves accurate weighted averages and token-weighted cache rates without fabricating
 * percentiles, latest snapshots, or unpriced USD savings.
 */
function computeTelemetryAggregateFromModelStats(modelStats, customPricing, orchestratorPricingMode) {
    const entries = Array.isArray(modelStats)
        ? modelStats.map((ms, idx) => [ms.modelName || ms.responseModel || `model_${idx}`, ms])
        : Object.entries(modelStats);
    if (entries.length === 0) {
        return createEmptyTelemetryAggregate();
    }
    let totalCalls = 0;
    let cachedCallCount = 0;
    let totalFreshInputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let hasThinking = false;
    let speedOutputSum = 0;
    let speedVisibleSum = 0;
    let speedStreamSum = 0;
    let speedSampleCount = 0;
    let ttftWeightedSum = 0;
    let ttftSampleCount = 0;
    let minTtft = null;
    let maxTtft = null;
    let streamWeightedSum = 0;
    let streamingSampleCount = 0;
    let savingsUsdSum = 0;
    let pricedCacheReadModels = 0;
    for (const [modelKey, ms] of entries) {
        const calls = safeNonNeg(ms.callCount);
        const input = safeNonNeg(ms.totalInputTokens);
        const output = safeNonNeg(ms.totalOutputTokens);
        const thinking = safeNonNeg(ms.totalThinkingTokens);
        const cacheRead = safeNonNeg(ms.totalCacheRead);
        const cacheCreation = safeNonNeg(ms.totalCacheCreation);
        totalCalls += calls;
        totalFreshInputTokens += input;
        totalCacheReadTokens += cacheRead;
        totalCacheCreationTokens += cacheCreation;
        if (thinking > 0) {
            hasThinking = true;
        }
        const hits = ms.cacheHitCalls !== undefined
            ? safeNonNeg(ms.cacheHitCalls)
            : (calls > 0 ? Math.round(clamp01(ms.cacheHitRate || 0) * calls) : 0);
        cachedCallCount += Math.min(calls, hits);
        // TTFT
        const avgTtft = positiveOrNull(ms.avgTTFT);
        if (avgTtft !== null) {
            const count = ms.ttftSampleCount !== undefined ? safeNonNeg(ms.ttftSampleCount) : calls;
            if (count > 0) {
                ttftWeightedSum += avgTtft * count;
                ttftSampleCount += count;
            }
        }
        const mMin = positiveOrNull(ms.minTTFT);
        if (mMin !== null) {
            minTtft = minTtft === null ? mMin : Math.min(minTtft, mMin);
        }
        const mMax = positiveOrNull(ms.maxTTFT);
        if (mMax !== null) {
            maxTtft = maxTtft === null ? mMax : Math.max(maxTtft, mMax);
        }
        // Streaming
        const avgStream = positiveOrNull(ms.avgStreaming);
        if (avgStream !== null) {
            const count = ms.streamingSampleCount !== undefined ? safeNonNeg(ms.streamingSampleCount) : calls;
            if (count > 0) {
                streamWeightedSum += avgStream * count;
                streamingSampleCount += count;
            }
        }
        // Throughput (prefer explicit speed-valid sums; fallback to legacy avgStreaming)
        const timedOut = safeNonNeg(ms.timedOutputTokens);
        const timedStream = safeNonNeg(ms.timedStreamingSeconds);
        if (timedOut >= exports.MIN_OUTPUT_TOKENS_FOR_SPEED && timedStream >= exports.MIN_STREAM_SECONDS) {
            speedOutputSum += timedOut;
            const visibleRatio = output > 0 ? Math.max(0, output - thinking) / output : 1;
            speedVisibleSum += timedOut * visibleRatio;
            speedStreamSum += timedStream;
            const samples = ms.streamingSampleCount !== undefined ? safeNonNeg(ms.streamingSampleCount) : calls;
            speedSampleCount += Math.max(1, samples);
        }
        else if (ms.timedOutputTokens === undefined && ms.timedStreamingSeconds === undefined
            && avgStream !== null && avgStream >= exports.MIN_STREAM_SECONDS
            && output >= exports.MIN_OUTPUT_TOKENS_FOR_SPEED && calls > 0) {
            const count = ms.streamingSampleCount !== undefined ? safeNonNeg(ms.streamingSampleCount) : calls;
            const estTotalStream = avgStream * count;
            if (count > 0 && estTotalStream >= exports.MIN_STREAM_SECONDS) {
                speedOutputSum += output;
                speedVisibleSum += Math.max(0, output - thinking);
                speedStreamSum += estTotalStream;
                speedSampleCount += count;
            }
        }
        // Cache USD savings
        if (cacheRead > 0) {
            const pricing = resolvePricingForModelKey(modelKey, ms.responseModel || '', customPricing, orchestratorPricingMode);
            if (pricing) {
                const rateDiff = Math.max(0, pricing.input - pricing.cacheRead);
                savingsUsdSum += (cacheRead * rateDiff) / 1_000_000;
                pricedCacheReadModels++;
            }
        }
    }
    const totalPromptTokens = totalFreshInputTokens + totalCacheReadTokens + totalCacheCreationTokens;
    const cacheReuseDenom = totalCacheReadTokens + totalCacheCreationTokens;
    const weightedGenTokPerSec = speedStreamSum >= exports.MIN_STREAM_SECONDS && speedOutputSum >= exports.MIN_OUTPUT_TOKENS_FOR_SPEED
        ? speedOutputSum / speedStreamSum
        : null;
    const weightedVisibleTokPerSec = weightedGenTokPerSec !== null && speedVisibleSum > 0
        ? speedVisibleSum / speedStreamSum
        : null;
    return {
        weightedGenTokPerSec,
        medianGenTokPerSec: null,
        minGenTokPerSec: null,
        maxGenTokPerSec: null,
        weightedVisibleTokPerSec,
        weightedEndToEndTokPerSec: null,
        latestGenTokPerSec: null,
        latestVisibleTokPerSec: null,
        speedSampleCount,
        representativeSpeedSampleCount: 0,
        hasThinking,
        avgTtftSeconds: ttftSampleCount > 0 ? ttftWeightedSum / ttftSampleCount : null,
        medianTtftSeconds: null,
        p95TtftSeconds: null,
        minTtftSeconds: minTtft,
        maxTtftSeconds: maxTtft,
        latestTtftSeconds: null,
        ttftSampleCount,
        cachedAvgTtftSeconds: null,
        uncachedAvgTtftSeconds: null,
        cachedTtftCount: 0,
        uncachedTtftCount: 0,
        ttftCacheDeltaPct: null,
        avgStreamingSeconds: streamingSampleCount > 0 ? streamWeightedSum / streamingSampleCount : null,
        streamingSampleCount,
        totalPromptTokens,
        totalFreshInputTokens,
        totalCacheReadTokens,
        totalCacheCreationTokens,
        tokenCacheHitRate: totalPromptTokens > 0 ? clamp01(totalCacheReadTokens / totalPromptTokens) : null,
        callCacheHitRate: totalCalls > 0 ? clamp01(cachedCallCount / totalCalls) : null,
        cacheReuseRate: cacheReuseDenom > 0 ? clamp01(totalCacheReadTokens / cacheReuseDenom) : null,
        cachedCallCount,
        totalCalls,
        latestCacheState: classifyCacheState(totalCacheReadTokens, totalCacheCreationTokens, totalPromptTokens),
        estCacheSavedTokens: totalCacheReadTokens,
        estCacheSavingsUsd: pricedCacheReadModels > 0 ? savingsUsdSum : null,
        latestCall: null,
        latestTimedCall: null,
        latestSpeedSample: null,
    };
}
/**
 * Aggregate telemetry across a list of GM calls.
 * When `calls` is empty (e.g. archived or slimmed summary without per-call arrays),
 * seamlessly falls back to `fallbackModelStats` if provided.
 */
function computeTelemetryAggregate(calls, customPricing, fallbackModelStats, orchestratorPricingMode) {
    const filteredCalls = calls.filter(c => !isInternalCompactionCall(c));
    if (filteredCalls.length === 0) {
        if (fallbackModelStats) {
            const hasFallback = Array.isArray(fallbackModelStats)
                ? fallbackModelStats.length > 0
                : Object.keys(fallbackModelStats).length > 0;
            if (hasFallback) {
                return computeTelemetryAggregateFromModelStats(fallbackModelStats, customPricing, orchestratorPricingMode);
            }
        }
        return createEmptyTelemetryAggregate();
    }
    const orderedPoints = [];
    const hardValidSpeedPoints = [];
    const repSpeedPoints = [];
    const ttftOrderedPoints = [];
    const timedOrderedPoints = [];
    const ttftValues = [];
    const cachedTtftValues = [];
    const uncachedTtftValues = [];
    const streamValues = [];
    let validOutputSum = 0;
    let validVisibleSum = 0;
    let validStreamSum = 0;
    let e2eOutputSum = 0;
    let e2eDurationSum = 0;
    let hasThinking = false;
    let totalFreshInputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let cachedCallCount = 0;
    let savingsUsdSum = 0;
    let pricedCacheReadCalls = 0;
    for (let i = 0; i < filteredCalls.length; i++) {
        const call = filteredCalls[i];
        const point = computeCallTelemetry(call, customPricing, undefined, orchestratorPricingMode);
        const ordered = {
            point,
            ts: parseValidTimestamp(point.createdAt),
            order: i,
        };
        orderedPoints.push(ordered);
        totalFreshInputTokens += point.inputTokens;
        totalCacheReadTokens += point.cacheReadTokens;
        totalCacheCreationTokens += point.cacheCreationTokens;
        if (point.isCacheHit) {
            cachedCallCount++;
        }
        if (point.effectiveThinkingTokens > 0) {
            hasThinking = true;
        }
        if (point.estCacheSavingsUsd !== null) {
            savingsUsdSum += point.estCacheSavingsUsd;
            pricedCacheReadCalls++;
        }
        if (point.ttftSeconds !== null) {
            ttftValues.push(point.ttftSeconds);
            ttftOrderedPoints.push(ordered);
            if (point.isCacheHit) {
                cachedTtftValues.push(point.ttftSeconds);
            }
            else {
                uncachedTtftValues.push(point.ttftSeconds);
            }
        }
        if (point.streamingSeconds !== null) {
            streamValues.push(point.streamingSeconds);
        }
        if (point.ttftSeconds !== null || point.streamingSeconds !== null) {
            timedOrderedPoints.push(ordered);
        }
        if (point.totalGenTokPerSec !== null && point.streamingSeconds !== null) {
            hardValidSpeedPoints.push(ordered);
            validOutputSum += point.outputTokens;
            validVisibleSum += point.visibleResponseTokens;
            validStreamSum += point.streamingSeconds;
            if (point.ttftSeconds !== null) {
                e2eOutputSum += point.outputTokens;
                e2eDurationSum += point.ttftSeconds + point.streamingSeconds;
            }
            if (isRepresentativeSpeedSample(point.outputTokens, point.streamingSeconds)) {
                repSpeedPoints.push(point);
            }
        }
    }
    // Spread source: prefer representative calls, fall back to hard-valid set
    const spreadSource = repSpeedPoints.length > 0
        ? repSpeedPoints
        : hardValidSpeedPoints.map(o => o.point);
    const sortedSpeeds = spreadSource
        .map(p => p.totalGenTokPerSec)
        .sort((a, b) => a - b);
    const sortedTtfts = [...ttftValues].sort((a, b) => a - b);
    const cachedAvgTtftSeconds = arithmeticMean(cachedTtftValues);
    const uncachedAvgTtftSeconds = arithmeticMean(uncachedTtftValues);
    const ttftCacheDeltaPct = (cachedAvgTtftSeconds !== null && uncachedAvgTtftSeconds !== null && uncachedAvgTtftSeconds > 0)
        ? ((cachedAvgTtftSeconds - uncachedAvgTtftSeconds) / uncachedAvgTtftSeconds) * 100
        : null;
    const latestCall = pickLatest(orderedPoints);
    const latestSpeedCall = pickLatest(hardValidSpeedPoints);
    const latestTtftCall = pickLatest(ttftOrderedPoints);
    const latestTimedCall = latestSpeedCall || pickLatest(timedOrderedPoints);
    const totalCalls = orderedPoints.length;
    const totalPromptTokens = totalFreshInputTokens + totalCacheReadTokens + totalCacheCreationTokens;
    const cacheReuseDenom = totalCacheReadTokens + totalCacheCreationTokens;
    const weightedGenTokPerSec = validStreamSum > 0 ? validOutputSum / validStreamSum : null;
    const weightedVisibleTokPerSec = (validStreamSum > 0 && validVisibleSum > 0)
        ? validVisibleSum / validStreamSum
        : null;
    const weightedEndToEndTokPerSec = e2eDurationSum > 0 ? e2eOutputSum / e2eDurationSum : null;
    return {
        weightedGenTokPerSec,
        medianGenTokPerSec: percentile(sortedSpeeds, 0.5),
        minGenTokPerSec: sortedSpeeds.length > 0 ? sortedSpeeds[0] : null,
        maxGenTokPerSec: sortedSpeeds.length > 0 ? sortedSpeeds[sortedSpeeds.length - 1] : null,
        weightedVisibleTokPerSec,
        weightedEndToEndTokPerSec,
        latestGenTokPerSec: latestSpeedCall?.totalGenTokPerSec ?? null,
        latestVisibleTokPerSec: latestSpeedCall?.visibleTokPerSec ?? null,
        speedSampleCount: hardValidSpeedPoints.length,
        representativeSpeedSampleCount: repSpeedPoints.length,
        hasThinking,
        avgTtftSeconds: arithmeticMean(ttftValues),
        medianTtftSeconds: percentile(sortedTtfts, 0.5),
        p95TtftSeconds: percentile(sortedTtfts, 0.95),
        minTtftSeconds: sortedTtfts.length > 0 ? sortedTtfts[0] : null,
        maxTtftSeconds: sortedTtfts.length > 0 ? sortedTtfts[sortedTtfts.length - 1] : null,
        latestTtftSeconds: latestTtftCall?.ttftSeconds ?? null,
        ttftSampleCount: ttftValues.length,
        cachedAvgTtftSeconds,
        uncachedAvgTtftSeconds,
        cachedTtftCount: cachedTtftValues.length,
        uncachedTtftCount: uncachedTtftValues.length,
        ttftCacheDeltaPct,
        avgStreamingSeconds: arithmeticMean(streamValues),
        streamingSampleCount: streamValues.length,
        totalPromptTokens,
        totalFreshInputTokens,
        totalCacheReadTokens,
        totalCacheCreationTokens,
        tokenCacheHitRate: totalPromptTokens > 0 ? clamp01(totalCacheReadTokens / totalPromptTokens) : null,
        callCacheHitRate: totalCalls > 0 ? clamp01(cachedCallCount / totalCalls) : null,
        cacheReuseRate: cacheReuseDenom > 0 ? clamp01(totalCacheReadTokens / cacheReuseDenom) : null,
        cachedCallCount,
        totalCalls,
        latestCacheState: latestCall?.cacheState ?? 'unknown',
        estCacheSavedTokens: totalCacheReadTokens,
        estCacheSavingsUsd: pricedCacheReadCalls > 0 ? savingsUsdSum : null,
        latestCall,
        latestTimedCall,
        latestSpeedSample: latestCall?.speedSample ?? latestTimedCall?.speedSample ?? null,
    };
}
/**
 * Compute full session telemetry summary (overall, active conversation, primary scope, and per-model breakdown).
 */
function computeTelemetrySummary(gmSummary, opts) {
    if (!gmSummary) {
        const empty = createEmptyTelemetryAggregate();
        return {
            overall: empty,
            active: null,
            primary: empty,
            byModel: {},
            primaryScope: 'session',
        };
    }
    const customPricing = opts?.customPricing;
    const activeCascadeId = opts?.activeCascadeId;
    const orchestratorPricingMode = opts?.orchestratorPricingMode;
    const conversations = Array.isArray(gmSummary.conversations) ? gmSummary.conversations : [];
    const modelBreakdown = gmSummary.modelBreakdown || {};
    const allCalls = [];
    const activeCalls = [];
    const callsByModel = new Map();
    for (const conv of conversations) {
        const convCalls = Array.isArray(conv.calls) ? conv.calls : [];
        const isActiveConv = !!activeCascadeId && conv.cascadeId === activeCascadeId;
        for (const call of convCalls) {
            const tagged = { ...call, cascadeId: conv.cascadeId };
            allCalls.push(tagged);
            if (isActiveConv) {
                activeCalls.push(tagged);
            }
            const modelKey = resolveModelLabel(call);
            if (modelKey) {
                let list = callsByModel.get(modelKey);
                if (!list) {
                    list = [];
                    callsByModel.set(modelKey, list);
                }
                list.push(tagged);
            }
        }
    }
    const overall = computeTelemetryAggregate(allCalls, customPricing, modelBreakdown, orchestratorPricingMode);
    let active = null;
    if (activeCascadeId && activeCalls.length > 0) {
        const computedActive = computeTelemetryAggregate(activeCalls, customPricing, undefined, orchestratorPricingMode);
        if (computedActive.totalCalls > 0) {
            active = computedActive;
        }
    }
    const byModel = {};
    for (const [modelKey, modelCalls] of callsByModel) {
        const agg = computeTelemetryAggregate(modelCalls, customPricing, undefined, orchestratorPricingMode);
        if (agg.totalCalls > 0) {
            byModel[modelKey] = agg;
        }
    }
    // Backfill any models present in modelBreakdown without hydrated per-call arrays
    for (const [rawKey, stats] of Object.entries(modelBreakdown)) {
        const modelKey = ((0, models_1.normalizeModelDisplayName)(rawKey) || rawKey).trim();
        if (!modelKey || byModel[modelKey]) {
            continue;
        }
        const agg = computeTelemetryAggregateFromModelStats({ [modelKey]: stats }, customPricing, orchestratorPricingMode);
        if (agg.totalCalls > 0) {
            byModel[modelKey] = agg;
        }
    }
    const primaryScope = active !== null ? 'active' : 'session';
    const primary = active ?? overall;
    return {
        overall,
        active,
        primary,
        byModel,
        primaryScope,
    };
}
// ─── Timeline Step Helpers ───────────────────────────────────────────────────
/** Compute per-step generation speed (tok/s), returning null if below hard validity gates. */
function computeStepSpeed(outputTokens, streamingSeconds) {
    const out = safeNonNeg(outputTokens);
    const stream = positiveOrNull(streamingSeconds);
    if (!isHardValidSpeedSample(out, stream)) {
        return null;
    }
    return out / stream;
}
/** Compute per-step token-weighted prompt cache hit rate using additive Antigravity semantics. */
function computeStepCacheHitRate(inputTokens, cacheReadTokens, cacheCreationTokens) {
    const fresh = safeNonNeg(inputTokens);
    const read = safeNonNeg(cacheReadTokens);
    const create = safeNonNeg(cacheCreationTokens);
    const total = fresh + read + create;
    if (total <= 0) {
        return null;
    }
    return clamp01(read / total);
}
// ─── Formatters ──────────────────────────────────────────────────────────────
/** Format token generation speed (`64.2 tok/s`, `1.2k tok/s` when >= 999.95, `—` when null/invalid). */
function formatSpeed(tokPerSec) {
    if (tokPerSec === null || tokPerSec === undefined || !Number.isFinite(tokPerSec) || tokPerSec <= 0) {
        return '—';
    }
    if (tokPerSec >= 999.95) {
        return `${(tokPerSec / 1000).toFixed(1)}k tok/s`;
    }
    return `${tokPerSec.toFixed(1)} tok/s`;
}
/** Format latency in seconds (`420ms` when < 1.0s, `1.42s` when >= 1.0s, `—` when null/invalid). */
function formatLatency(seconds) {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
        return '—';
    }
    if (seconds < 1.0) {
        const ms = Math.round(seconds * 1000);
        if (ms >= 1000) {
            return `${(ms / 1000).toFixed(2)}s`;
        }
        return `${ms}ms`;
    }
    return `${seconds.toFixed(2)}s`;
}
/** Format cache hit rate in [0, 1] (`84.2%`, `0%`, `100%`, `—` when null/invalid). */
function formatCachePercent(rate) {
    if (rate === null || rate === undefined || !Number.isFinite(rate) || rate < 0) {
        return '—';
    }
    const pct = clamp01(rate) * 100;
    if (pct === 0) {
        return '0%';
    }
    if (pct >= 99.95) {
        return '100%';
    }
    return `${pct.toFixed(1)}%`;
}
//# sourceMappingURL=telemetry-metrics.js.map