"use strict";
// ─── Pure Quota Runway Predictor, Custom-Model Isolation & Stale Cache Guard ─
// Tracks rolling 45-minute quota burn rates per pool with jitter filtering,
// automatic recovery/reset-turnover detection, custom/BYOK model isolation,
// and transient-RPC stale-cache preservation.
//
// Zero VS Code, DOM, or external npm dependencies.
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaleCacheGuard = exports.QuotaRunwayTracker = exports.MAX_SAMPLES_PER_POOL = exports.DEFAULT_RECOVERY_NOTICE_MS = exports.DEFAULT_MIN_SPAN_MS = exports.RESET_ROLLOVER_TOLERANCE_MS = exports.RECOVERY_HIGH_THRESHOLD = exports.RECOVERY_JUMP_FRACTION = exports.JITTER_EPSILON = exports.RUNWAY_WINDOW_MS = void 0;
exports.isCustomModel = isCustomModel;
// ─── Constants ───────────────────────────────────────────────────────────────
/** Rolling observation window for burn-rate calculation (45 minutes). */
exports.RUNWAY_WINDOW_MS = 45 * 60 * 1000;
/** Fraction deltas smaller than 0.001 (0.1%) are treated as telemetry jitter. */
exports.JITTER_EPSILON = 0.001;
/** Upward jump >= +5% resets burn-rate history as a quota recovery. */
exports.RECOVERY_JUMP_FRACTION = 0.05;
/** Crossing upward into >= 90% resets burn-rate history as a quota recovery. */
exports.RECOVERY_HIGH_THRESHOLD = 0.90;
/** Reset timestamp shift > 60s forward indicates a new quota reset cycle. */
exports.RESET_ROLLOVER_TOLERANCE_MS = 60 * 1000;
/** Minimum time span between observations before reporting a burn rate (10 seconds). */
exports.DEFAULT_MIN_SPAN_MS = 10 * 1000;
/** How long `recoveredRecently` stays true after a quota recovery event (15 minutes). */
exports.DEFAULT_RECOVERY_NOTICE_MS = 15 * 60 * 1000;
/** Safety cap on stored samples per pool to keep serialized state compact. */
exports.MAX_SAMPLES_PER_POOL = 200;
// ─── Custom / BYOK / Local Model Detection ───────────────────────────────────
const CUSTOM_MODEL_ID_PATTERNS = [
    /^custom[-_:/]/i,
    /^model_custom(?:[-_]|$)/i,
    /^byok[-_:/]/i,
    /^(?:ollama|lmstudio|lm-studio|vllm|llamacpp|llama\.cpp|litellm|local|localhost|self[-_]?hosted|openai[-_]?compatible)[-_:/]/i,
    /^openrouter\//i,
];
const BUILTIN_MODEL_ID_PATTERNS = [
    /^MODEL_PLACEHOLDER_M\d+$/i,
    /^MODEL_OPENAI_GPT_OSS_/i,
    /^MODEL_GOOGLE_/i,
    /^MODEL_ANTHROPIC_/i,
    /^MODEL_CLAUDE_/i,
];
const CUSTOM_LABEL_PATTERNS = [
    /\bbyok\b/i,
    /(?:^|[\s([{-])custom\s+model\b/i,
    /^custom\s*:/i,
    /(?:\(|\[)\s*(?:custom|byok|local)\s*(?:\)|\])/i,
    /\b(?:ollama|lm\s*studio|vllm|local\s+model|self[- ]hosted)\b/i,
];
const ORCHESTRATOR_LABEL_PATTERN = /\b(?:orchestrator|编排器|协调器)\b/i;
/**
 * Detect whether a model is a `custom-*` / BYOK / local non-Google model whose
 * activity does NOT consume Antigravity Google quota pools.
 *
 * Carefully avoids false positives on built-in Antigravity models (including
 * `"Orchestrator (Custom)"` custom planner/executor pairs).
 */
function isCustomModel(modelId, label) {
    const cleanId = (modelId || '').trim();
    const cleanLabel = (label || '').trim();
    if (cleanId) {
        if (CUSTOM_MODEL_ID_PATTERNS.some(re => re.test(cleanId))) {
            return true;
        }
        if (BUILTIN_MODEL_ID_PATTERNS.some(re => re.test(cleanId))) {
            // Built-in placeholder IDs are Google-hosted unless explicitly tagged BYOK
            return /\bbyok\b/i.test(cleanLabel);
        }
    }
    if (cleanLabel) {
        // Antigravity's built-in Orchestrator allows a "Custom" planner/executor pair
        // that still runs on Google quota pools — do not misclassify as BYOK.
        if (ORCHESTRATOR_LABEL_PATTERN.test(cleanLabel) && !/\bbyok\b/i.test(cleanLabel)) {
            return false;
        }
        if (CUSTOM_LABEL_PATTERNS.some(re => re.test(cleanLabel))) {
            return true;
        }
    }
    return false;
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
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
function normalizeResetMs(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? Math.round(value)
        : null;
}
function round2(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value * 100) / 100;
}
function extractErrorMessage(error) {
    if (error instanceof Error) {
        return error.message || error.name || 'Unknown error';
    }
    if (typeof error === 'string') {
        return error.trim() || 'Unknown error';
    }
    if (error !== null && typeof error === 'object' && 'message' in error) {
        const msg = error.message;
        if (typeof msg === 'string' && msg.trim()) {
            return msg.trim();
        }
    }
    return String(error ?? 'Unknown error');
}
// ─── QuotaRunwayTracker ──────────────────────────────────────────────────────
/**
 * Pure, serializable rolling-window tracker that estimates per-pool quota burn
 * rate and time-to-exhaustion vs reset countdown.
 */
class QuotaRunwayTracker {
    windowMs;
    jitterEpsilon;
    recoveryJumpFraction;
    recoveryHighThreshold;
    resetRolloverToleranceMs;
    minSpanMs;
    recoveryNoticeMs;
    maxSamplesPerPool;
    pools = new Map();
    constructor(options = {}) {
        this.windowMs = options.windowMs && options.windowMs > 0 ? options.windowMs : exports.RUNWAY_WINDOW_MS;
        this.jitterEpsilon = options.jitterEpsilon !== undefined && options.jitterEpsilon >= 0
            ? options.jitterEpsilon
            : exports.JITTER_EPSILON;
        this.recoveryJumpFraction = options.recoveryJumpFraction !== undefined && options.recoveryJumpFraction > 0
            ? options.recoveryJumpFraction
            : exports.RECOVERY_JUMP_FRACTION;
        this.recoveryHighThreshold = options.recoveryHighThreshold !== undefined && options.recoveryHighThreshold > 0
            ? options.recoveryHighThreshold
            : exports.RECOVERY_HIGH_THRESHOLD;
        this.resetRolloverToleranceMs = options.resetRolloverToleranceMs !== undefined && options.resetRolloverToleranceMs >= 0
            ? options.resetRolloverToleranceMs
            : exports.RESET_ROLLOVER_TOLERANCE_MS;
        this.minSpanMs = options.minSpanMs !== undefined && options.minSpanMs >= 0
            ? options.minSpanMs
            : exports.DEFAULT_MIN_SPAN_MS;
        this.recoveryNoticeMs = options.recoveryNoticeMs !== undefined && options.recoveryNoticeMs >= 0
            ? options.recoveryNoticeMs
            : exports.DEFAULT_RECOVERY_NOTICE_MS;
        this.maxSamplesPerPool = options.maxSamplesPerPool && options.maxSamplesPerPool >= 2
            ? Math.round(options.maxSamplesPerPool)
            : exports.MAX_SAMPLES_PER_POOL;
    }
    /**
     * Record a quota observation for a pool.
     *
     * - Filters `<0.001` (`0.1%`) jitter without losing cumulative drift or steady-state span.
     * - Resets burn-rate history cleanly on quota recovery (`>= +5%` jump or crossed up to `>= 90%`)
     *   or when `resetTimeMs` rolls forward into a new reset cycle.
     */
    record(poolKey, remainingFraction, timestampMs, resetTimeMs) {
        const key = (poolKey || '').trim();
        if (!key) {
            return;
        }
        if (!Number.isFinite(remainingFraction) || !Number.isFinite(timestampMs) || timestampMs < 0) {
            return;
        }
        const fraction = clamp01(remainingFraction);
        const ts = Math.round(timestampMs);
        const resetMs = normalizeResetMs(resetTimeMs);
        const existing = this.pools.get(key);
        if (!existing || existing.samples.length === 0) {
            this.pools.set(key, {
                poolKey: key,
                samples: [{ remainingFraction: fraction, timestampMs: ts, resetTimeMs: resetMs }],
                lastObservedAtMs: ts,
                lastResetTimeMs: resetMs,
                recoveredAtMs: null,
            });
            return;
        }
        const latest = existing.samples[existing.samples.length - 1];
        // Ignore out-of-order stale timestamps older than already recorded data
        if (ts < latest.timestampMs || (existing.lastObservedAtMs !== null && ts < existing.lastObservedAtMs)) {
            return;
        }
        const prevResetMs = existing.lastResetTimeMs;
        const resetRolledForward = prevResetMs !== null
            && resetMs !== null
            && (resetMs - prevResetMs) > this.resetRolloverToleranceMs;
        const delta = fraction - latest.remainingFraction;
        const jumpedUp = delta >= this.recoveryJumpFraction;
        const crossedRecoveryCeiling = latest.remainingFraction < this.recoveryHighThreshold
            && fraction >= this.recoveryHighThreshold
            && delta >= this.jitterEpsilon;
        if (resetRolledForward || jumpedUp || crossedRecoveryCeiling) {
            const recovered = jumpedUp || crossedRecoveryCeiling
                || (resetRolledForward && (delta > this.jitterEpsilon || fraction >= this.recoveryHighThreshold));
            existing.samples = [{ remainingFraction: fraction, timestampMs: ts, resetTimeMs: resetMs }];
            existing.lastObservedAtMs = ts;
            existing.lastResetTimeMs = resetMs ?? existing.lastResetTimeMs;
            if (recovered) {
                existing.recoveredAtMs = ts;
            }
            return;
        }
        if (resetMs !== null) {
            existing.lastResetTimeMs = resetMs;
        }
        existing.lastObservedAtMs = ts;
        // Filter <0.1% jitter relative to the latest significant anchor sample
        if (Math.abs(delta) < this.jitterEpsilon) {
            // Prune expired samples only if we still retain the current anchor
            this.prunePool(existing, ts);
            return;
        }
        // Same timestamp update replaces latest sample to avoid zero-duration spikes
        if (ts === latest.timestampMs) {
            existing.samples[existing.samples.length - 1] = {
                remainingFraction: fraction,
                timestampMs: ts,
                resetTimeMs: resetMs ?? latest.resetTimeMs,
            };
        }
        else {
            existing.samples.push({
                remainingFraction: fraction,
                timestampMs: ts,
                resetTimeMs: resetMs ?? latest.resetTimeMs,
            });
        }
        this.prunePool(existing, ts);
    }
    /**
     * Compute the current runway estimate for a quota pool.
     */
    estimate(poolKey, nowMs, options = {}) {
        const key = (poolKey || '').trim();
        if (options.isCustomModel || isCustomModel(options.modelId, options.modelLabel)) {
            return {
                poolKey: key,
                status: 'custom_model_isolated',
                burnRatePctPerHour: null,
                estExhaustMs: null,
                timeToResetMs: null,
                recoveredRecently: false,
            };
        }
        const history = this.pools.get(key);
        if (!history || history.samples.length === 0) {
            return {
                poolKey: key,
                status: 'insufficient_data',
                burnRatePctPerHour: null,
                estExhaustMs: null,
                timeToResetMs: null,
                recoveredRecently: false,
            };
        }
        const latest = history.samples[history.samples.length - 1];
        const refNowMs = typeof nowMs === 'number' && Number.isFinite(nowMs)
            ? Math.round(nowMs)
            : (history.lastObservedAtMs ?? latest.timestampMs);
        const resetMs = history.lastResetTimeMs ?? latest.resetTimeMs;
        const timeToResetMs = resetMs !== null ? Math.max(0, resetMs - refNowMs) : null;
        const recoveredRecently = history.recoveredAtMs !== null
            && refNowMs >= history.recoveredAtMs
            && (refNowMs - history.recoveredAtMs) <= this.recoveryNoticeMs;
        // Filter samples within the rolling 45-minute window relative to refNowMs
        const cutoffMs = refNowMs - this.windowMs;
        const inWindow = history.samples.filter(s => s.timestampMs >= cutoffMs && s.timestampMs <= refNowMs);
        // Immediately classify exhausted quota even from a single recent observation
        if (latest.remainingFraction <= 0) {
            const burnRate = this.computeBurnRate(inWindow, history.lastObservedAtMs, refNowMs);
            return {
                poolKey: key,
                status: 'exhausted',
                burnRatePctPerHour: burnRate,
                estExhaustMs: 0,
                timeToResetMs,
                recoveredRecently,
            };
        }
        if (inWindow.length === 0) {
            // Check if we had a recent jitter-filtered steady observation anchored slightly earlier
            const observedRecently = history.lastObservedAtMs !== null
                && history.lastObservedAtMs >= cutoffMs
                && history.lastObservedAtMs <= refNowMs;
            if (!observedRecently) {
                return {
                    poolKey: key,
                    status: 'insufficient_data',
                    burnRatePctPerHour: null,
                    estExhaustMs: null,
                    timeToResetMs,
                    recoveredRecently,
                };
            }
            const spanMs = history.lastObservedAtMs - latest.timestampMs;
            if (spanMs < this.minSpanMs) {
                return {
                    poolKey: key,
                    status: 'insufficient_data',
                    burnRatePctPerHour: null,
                    estExhaustMs: null,
                    timeToResetMs,
                    recoveredRecently,
                };
            }
            return {
                poolKey: key,
                status: 'safe_until_reset',
                burnRatePctPerHour: 0,
                estExhaustMs: null,
                timeToResetMs,
                recoveredRecently,
            };
        }
        const burnRatePctPerHour = this.computeBurnRate(inWindow, history.lastObservedAtMs, refNowMs);
        if (burnRatePctPerHour === null) {
            return {
                poolKey: key,
                status: 'insufficient_data',
                burnRatePctPerHour: null,
                estExhaustMs: null,
                timeToResetMs,
                recoveredRecently,
            };
        }
        if (burnRatePctPerHour <= 0) {
            return {
                poolKey: key,
                status: 'safe_until_reset',
                burnRatePctPerHour: 0,
                estExhaustMs: null,
                timeToResetMs,
                recoveredRecently,
            };
        }
        const remainingPct = latest.remainingFraction * 100;
        const estExhaustHours = remainingPct / burnRatePctPerHour;
        const estExhaustMs = Number.isFinite(estExhaustHours) && estExhaustHours >= 0
            ? Math.round(estExhaustHours * 3_600_000)
            : null;
        let status;
        if (estExhaustMs === null) {
            status = 'insufficient_data';
        }
        else if (timeToResetMs !== null && timeToResetMs > 0) {
            status = estExhaustMs <= timeToResetMs ? 'at_risk' : 'safe_until_reset';
        }
        else if (timeToResetMs === 0) {
            // Reset timestamp is already elapsed; waiting for server rollover
            status = 'insufficient_data';
        }
        else {
            // Unknown reset time while actively burning
            status = 'at_risk';
        }
        return {
            poolKey: key,
            status,
            burnRatePctPerHour,
            estExhaustMs,
            timeToResetMs,
            recoveredRecently,
        };
    }
    /** Compute estimates for all tracked pools. */
    estimateAll(nowMs, options = {}) {
        const result = {};
        for (const poolKey of this.pools.keys()) {
            result[poolKey] = this.estimate(poolKey, nowMs, options);
        }
        return result;
    }
    /** Inspect a defensive copy of a pool's sample history. */
    getPoolHistory(poolKey) {
        const entry = this.pools.get((poolKey || '').trim());
        if (!entry) {
            return null;
        }
        return {
            poolKey: entry.poolKey,
            samples: entry.samples.map(s => ({ ...s })),
            lastObservedAtMs: entry.lastObservedAtMs,
            lastResetTimeMs: entry.lastResetTimeMs,
            recoveredAtMs: entry.recoveredAtMs,
        };
    }
    /** Clear one pool or all tracked pools. */
    clear(poolKey) {
        if (poolKey !== undefined) {
            this.pools.delete(poolKey.trim());
        }
        else {
            this.pools.clear();
        }
    }
    /** Export pure JSON-serializable state for persistence. */
    serialize() {
        const pools = {};
        for (const [key, value] of this.pools.entries()) {
            pools[key] = {
                poolKey: value.poolKey,
                samples: value.samples.map(s => ({ ...s })),
                lastObservedAtMs: value.lastObservedAtMs,
                lastResetTimeMs: value.lastResetTimeMs,
                recoveredAtMs: value.recoveredAtMs,
            };
        }
        return { version: 1, pools };
    }
    toJSON() {
        return this.serialize();
    }
    /** Restore a tracker instance from serialized JSON state safely. */
    static deserialize(raw, options = {}) {
        const tracker = new QuotaRunwayTracker(options);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return tracker;
        }
        const rec = raw;
        const poolsRaw = rec.pools;
        if (!poolsRaw || typeof poolsRaw !== 'object' || Array.isArray(poolsRaw)) {
            return tracker;
        }
        for (const [poolKey, value] of Object.entries(poolsRaw)) {
            if (!poolKey.trim() || !value || typeof value !== 'object' || Array.isArray(value)) {
                continue;
            }
            const poolObj = value;
            const rawSamples = Array.isArray(poolObj.samples) ? poolObj.samples : [];
            const samples = [];
            for (const s of rawSamples) {
                if (!s || typeof s !== 'object' || Array.isArray(s)) {
                    continue;
                }
                const sr = s;
                if (typeof sr.remainingFraction !== 'number' || !Number.isFinite(sr.remainingFraction)) {
                    continue;
                }
                if (typeof sr.timestampMs !== 'number' || !Number.isFinite(sr.timestampMs) || sr.timestampMs < 0) {
                    continue;
                }
                samples.push({
                    remainingFraction: clamp01(sr.remainingFraction),
                    timestampMs: Math.round(sr.timestampMs),
                    resetTimeMs: normalizeResetMs(sr.resetTimeMs),
                });
            }
            if (samples.length === 0) {
                continue;
            }
            samples.sort((a, b) => a.timestampMs - b.timestampMs);
            const trimmed = samples.length > tracker.maxSamplesPerPool
                ? samples.slice(samples.length - tracker.maxSamplesPerPool)
                : samples;
            const lastObservedAtMs = typeof poolObj.lastObservedAtMs === 'number' && Number.isFinite(poolObj.lastObservedAtMs)
                ? Math.round(poolObj.lastObservedAtMs)
                : trimmed[trimmed.length - 1].timestampMs;
            const lastResetTimeMs = normalizeResetMs(poolObj.lastResetTimeMs);
            const recoveredAtMs = typeof poolObj.recoveredAtMs === 'number' && Number.isFinite(poolObj.recoveredAtMs)
                ? Math.round(poolObj.recoveredAtMs)
                : null;
            tracker.pools.set(poolKey.trim(), {
                poolKey: poolKey.trim(),
                samples: trimmed,
                lastObservedAtMs,
                lastResetTimeMs,
                recoveredAtMs,
            });
        }
        return tracker;
    }
    computeBurnRate(inWindow, lastObservedAtMs, refNowMs) {
        if (inWindow.length === 0) {
            return null;
        }
        const first = inWindow[0];
        const last = inWindow[inWindow.length - 1];
        const effectiveEndMs = lastObservedAtMs !== null
            ? Math.min(refNowMs, Math.max(last.timestampMs, lastObservedAtMs))
            : last.timestampMs;
        const spanMs = effectiveEndMs - first.timestampMs;
        if (!Number.isFinite(spanMs) || spanMs < this.minSpanMs) {
            return null;
        }
        const dropFraction = Math.max(0, first.remainingFraction - last.remainingFraction);
        if (dropFraction < this.jitterEpsilon) {
            return 0;
        }
        const spanHours = spanMs / 3_600_000;
        if (spanHours <= 0) {
            return null;
        }
        const rate = (dropFraction * 100) / spanHours;
        return Number.isFinite(rate) && rate >= 0 ? round2(rate) : null;
    }
    prunePool(history, nowMs) {
        const cutoff = nowMs - this.windowMs;
        if (history.samples.length > 1) {
            const filtered = history.samples.filter(s => s.timestampMs >= cutoff);
            history.samples = filtered.length > 0
                ? filtered
                : [history.samples[history.samples.length - 1]];
        }
        if (history.samples.length > this.maxSamplesPerPool) {
            history.samples = history.samples.slice(history.samples.length - this.maxSamplesPerPool);
        }
    }
}
exports.QuotaRunwayTracker = QuotaRunwayTracker;
// ─── StaleCacheGuard ─────────────────────────────────────────────────────────
/**
 * Preserves last-known good data across transient RPC failures so UI surfaces
 * render a clear Stale/Cached badge instead of blanking out.
 */
class StaleCacheGuard {
    data = null;
    isStale = false;
    lastSuccessAtMs = null;
    consecutiveFailures = 0;
    lastError = null;
    maxAgeMs;
    constructor(initial, options = {}) {
        if (initial) {
            if (initial.data !== undefined) {
                this.data = initial.data;
            }
            if (typeof initial.isStale === 'boolean') {
                this.isStale = initial.isStale;
            }
            if (typeof initial.lastSuccessAtMs === 'number' && Number.isFinite(initial.lastSuccessAtMs)) {
                this.lastSuccessAtMs = initial.lastSuccessAtMs;
            }
            if (typeof initial.consecutiveFailures === 'number' && Number.isFinite(initial.consecutiveFailures) && initial.consecutiveFailures >= 0) {
                this.consecutiveFailures = Math.round(initial.consecutiveFailures);
            }
            if (typeof initial.lastError === 'string') {
                this.lastError = initial.lastError;
            }
        }
        this.maxAgeMs = typeof options.maxAgeMs === 'number' && Number.isFinite(options.maxAgeMs) && options.maxAgeMs > 0
            ? options.maxAgeMs
            : null;
    }
    recordSuccess(data, timestampMs = Date.now()) {
        this.data = data;
        this.isStale = false;
        this.lastSuccessAtMs = Number.isFinite(timestampMs) ? Math.round(timestampMs) : Date.now();
        this.consecutiveFailures = 0;
        this.lastError = null;
        return this.getSnapshot(this.lastSuccessAtMs);
    }
    recordFailure(error) {
        this.consecutiveFailures += 1;
        this.lastError = extractErrorMessage(error);
        // Mark stale only when cached data exists; if no prior good data exists, keep data=null.
        this.isStale = this.data !== null;
        return this.getSnapshot();
    }
    /**
     * Execute an async fetch operation, recording success or preserving the
     * last-known good data on failure.
     */
    async run(fetcher, nowMs) {
        try {
            const result = await fetcher();
            return this.recordSuccess(result, nowMs ?? Date.now());
        }
        catch (err) {
            return this.recordFailure(err);
        }
    }
    getSnapshot(nowMs) {
        let stale = this.isStale;
        if (!stale
            && this.data !== null
            && this.maxAgeMs !== null
            && this.lastSuccessAtMs !== null) {
            const refNow = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
            if (refNow - this.lastSuccessAtMs > this.maxAgeMs) {
                stale = true;
            }
        }
        return {
            data: this.data,
            isStale: stale,
            lastSuccessAtMs: this.lastSuccessAtMs,
            consecutiveFailures: this.consecutiveFailures,
            lastError: this.lastError,
        };
    }
    hasData() {
        return this.data !== null;
    }
    reset() {
        this.data = null;
        this.isStale = false;
        this.lastSuccessAtMs = null;
        this.consecutiveFailures = 0;
        this.lastError = null;
    }
}
exports.StaleCacheGuard = StaleCacheGuard;
//# sourceMappingURL=quota-runway.js.map