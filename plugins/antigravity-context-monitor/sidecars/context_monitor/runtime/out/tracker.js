"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLocalOrchestratorConfigFallback = exports.parseAntigravityUserConfig = exports.getAntigravityUserConfigPath = exports.updateModelDisplayNames = exports.normalizeModelDisplayName = exports.getModelDisplayName = exports.getContextLimit = void 0;
exports.estimateTokensFromText = estimateTokensFromText;
exports.getAllTrajectories = getAllTrajectories;
exports.normalizeUri = normalizeUri;
exports.isImageGenStep = isImageGenStep;
exports.extractLinkedSubagentIds = extractLinkedSubagentIds;
exports.processSteps = processSteps;
exports.isRpcUnimplementedError = isRpcUnimplementedError;
exports.fetchTrajectoryGeneratorMetadata = fetchTrajectoryGeneratorMetadata;
exports.fetchTrajectorySteps = fetchTrajectorySteps;
exports.getTrajectoryTokenUsage = getTrajectoryTokenUsage;
exports.resetImageWorkflowCache = resetImageWorkflowCache;
exports.refreshWorkflowImageUsage = refreshWorkflowImageUsage;
exports.fetchFullUserStatus = fetchFullUserStatus;
exports.parseOrchestratorModelRoles = parseOrchestratorModelRoles;
exports.parseJetboxOrchestratorPrefs = parseJetboxOrchestratorPrefs;
exports.fetchOrchestratorSettings = fetchOrchestratorSettings;
exports.parseStrictResetTimestamp = parseStrictResetTimestamp;
exports.parseUserQuotaSummary = parseUserQuotaSummary;
exports.fetchUserQuotaSummary = fetchUserQuotaSummary;
exports.fetchModelConfigs = fetchModelConfigs;
exports.fetchCommandModelConfigsSafe = fetchCommandModelConfigsSafe;
exports.getContextUsage = getContextUsage;
const account_credits_1 = require("./account-credits");
const rpc_client_1 = require("./rpc-client");
const orchestrator_attribution_1 = require("./orchestrator-attribution");
Object.defineProperty(exports, "getAntigravityUserConfigPath", { enumerable: true, get: function () { return orchestrator_attribution_1.getAntigravityUserConfigPath; } });
Object.defineProperty(exports, "parseAntigravityUserConfig", { enumerable: true, get: function () { return orchestrator_attribution_1.parseAntigravityUserConfig; } });
Object.defineProperty(exports, "readLocalOrchestratorConfigFallback", { enumerable: true, get: function () { return orchestrator_attribution_1.readLocalOrchestratorConfigFallback; } });
const models_1 = require("./models");
Object.defineProperty(exports, "getContextLimit", { enumerable: true, get: function () { return models_1.getContextLimit; } });
Object.defineProperty(exports, "getModelDisplayName", { enumerable: true, get: function () { return models_1.getModelDisplayName; } });
Object.defineProperty(exports, "normalizeModelDisplayName", { enumerable: true, get: function () { return models_1.normalizeModelDisplayName; } });
Object.defineProperty(exports, "updateModelDisplayNames", { enumerable: true, get: function () { return models_1.updateModelDisplayNames; } });
const constants_1 = require("./constants");
// ─── Token Estimation from Text ──────────────────────────────────────────────
/**
 * Estimate token count from raw text content.
 * Uses character-based heuristic: ASCII ~4 chars/token, non-ASCII ~1.5 chars/token.
 */
function estimateTokensFromText(text) {
    if (!text) {
        return 0;
    }
    let asciiChars = 0;
    let nonAsciiChars = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) < 128) {
            asciiChars++;
        }
        else {
            nonAsciiChars++;
        }
    }
    return Math.ceil(asciiChars / 4 + nonAsciiChars / 1.5);
}
// ─── Trajectory Queries ───────────────────────────────────────────────────────
/**
 * Get all cascade trajectories (conversations) from the LS.
 */
async function getAllTrajectories(ls, signal) {
    const resp = await (0, rpc_client_1.rpcCall)(ls, 'GetAllCascadeTrajectories', {
        metadata: { ideName: 'antigravity', extensionName: 'antigravity' }
    }, 10000, signal);
    const summaries = resp.trajectorySummaries;
    if (!summaries) {
        return [];
    }
    const result = [];
    for (const [cascadeId, data] of Object.entries(summaries)) {
        let requestedModel = '';
        let generatorModel = '';
        const latestTask = data.latestTaskBoundaryStep;
        const latestNotify = data.latestNotifyUserStep;
        for (const latest of [latestTask, latestNotify]) {
            if (latest) {
                const step = latest.step;
                if (step) {
                    const meta = step.metadata;
                    if (meta) {
                        if (meta.generatorModel) {
                            generatorModel = meta.generatorModel;
                        }
                        const rm = meta.requestedModel;
                        if (rm?.model) {
                            requestedModel = rm.model;
                        }
                    }
                }
            }
        }
        const workspaces = data.workspaces;
        const workspaceUris = [];
        if (workspaces) {
            for (const ws of workspaces) {
                const uri = ws.workspaceFolderAbsoluteUri;
                if (uri) {
                    workspaceUris.push(uri);
                }
            }
        }
        // Extract Git info from first workspace
        const firstWs = workspaces?.[0];
        const repo = firstWs?.repository;
        const repositoryName = repo?.computedName || '';
        const gitOriginUrl = repo?.gitOriginUrl || '';
        const branchName = firstWs?.branchName || '';
        const gitRootUri = firstWs?.gitRootAbsoluteUri || '';
        const trajectoryMetadata = data.trajectoryMetadata && typeof data.trajectoryMetadata === 'object'
            && !Array.isArray(data.trajectoryMetadata)
            ? data.trajectoryMetadata
            : undefined;
        const rawParentCascadeId = typeof data.parentCascadeId === 'string' && data.parentCascadeId.trim()
            ? data.parentCascadeId.trim()
            : typeof trajectoryMetadata?.parentCascadeId === 'string' && trajectoryMetadata.parentCascadeId.trim()
                ? trajectoryMetadata.parentCascadeId.trim()
                : undefined;
        result.push({
            cascadeId,
            trajectoryId: data.trajectoryId || '',
            summary: data.summary || cascadeId,
            stepCount: data.stepCount || 0,
            status: data.status || 'unknown',
            lastModifiedTime: data.lastModifiedTime || '',
            createdTime: data.createdTime || '',
            requestedModel: requestedModel || generatorModel,
            generatorModel,
            workspaceUris,
            lastUserInputTime: data.lastUserInputTime || '',
            lastUserInputStepIndex: data.lastUserInputStepIndex || 0,
            repositoryName,
            gitOriginUrl,
            branchName,
            gitRootUri,
            ...(typeof data.trajectoryType === 'string' && data.trajectoryType ? { trajectoryType: data.trajectoryType } : {}),
            ...(rawParentCascadeId ? { parentCascadeId: rawParentCascadeId } : {}),
            ...(trajectoryMetadata ? { trajectoryMetadata } : {}),
            ...(typeof data.killed === 'boolean' ? { killed: data.killed } : {}),
        });
    }
    // Sort by lastModifiedTime descending (most recent first)
    result.sort((a, b) => {
        if (!a.lastModifiedTime) {
            return 1;
        }
        if (!b.lastModifiedTime) {
            return -1;
        }
        return b.lastModifiedTime.localeCompare(a.lastModifiedTime);
    });
    return result;
}
/**
 * Normalize a URI for comparison:
 * - Strip vscode-remote:// scheme+authority (e.g., vscode-remote://wsl+Ubuntu/path → /path)
 * - Strip file:// prefix
 * - URL-decode (handle %20 etc.)
 * - Remove trailing slash
 * - Lowercase for macOS/Windows case-insensitive FS
 */
function normalizeUri(uri, platform = process.platform) {
    let normalized = uri.trim();
    // Handle vscode-remote:// URIs — extract just the path portion
    // e.g., vscode-remote://wsl+Ubuntu/home/user/project → /home/user/project
    // e.g., vscode-remote://ssh-remote+host/home/user/project → /home/user/project
    const remoteMatch = normalized.match(/^vscode-remote:\/\/[^/]+(\/.*)/i);
    if (remoteMatch) {
        normalized = remoteMatch[1];
    }
    // RFC 8089 file:// URIs (case-insensitive scheme, optional localhost authority)
    normalized = normalized.replace(/^file:\/\/localhost\//i, '/');
    normalized = normalized.replace(/^file:\/\/\//i, '/');
    normalized = normalized.replace(/^file:\/\//i, '');
    try {
        normalized = decodeURIComponent(normalized);
    }
    catch {
        // If decoding fails, keep as-is
    }
    const isWindowsDrivePath = /^\/?[a-zA-Z]:(?:[\\/]|$)/.test(normalized);
    // Normalize Windows backslashes so raw paths and file:/// URIs compare equal.
    if (platform === 'win32' || isWindowsDrivePath) {
        normalized = normalized.replace(/\\/g, '/');
    }
    // Strip leading slash(es) before Windows drive letters (e.g., /C:/ → C:/)
    if (platform === 'win32' || isWindowsDrivePath) {
        normalized = normalized.replace(/^\/+([a-zA-Z]:)/, '$1');
    }
    normalized = normalized.replace(/\/+$/, '');
    if (platform === 'darwin' || platform === 'win32') {
        normalized = normalized.toLowerCase();
    }
    return normalized;
}
// ─── Step Processing ──────────────────────────────────────────────────────────
/** Process a user input step and return estimated tokens. */
function processUserInputStep(step) {
    const ui = step.userInput;
    const userText = ui?.userResponse || '';
    return ui ? estimateTokensFromText(userText) : constants_1.USER_INPUT_OVERHEAD;
}
/** Process a planner response step and return estimated tokens. */
function processPlannerResponseStep(step) {
    const pr = step.plannerResponse;
    const responseText = pr?.response || '';
    const thinkingText = pr?.thinking || '';
    let toolCallsText = '';
    const toolCalls = pr?.toolCalls;
    if (toolCalls) {
        for (const tc of toolCalls) {
            toolCallsText += tc.argumentsJson || '';
        }
    }
    const totalText = responseText + thinkingText + toolCallsText;
    return pr ? estimateTokensFromText(totalText) : constants_1.PLANNER_RESPONSE_ESTIMATE;
}
/** Detect image generation, not an image input, image viewer, or code generator. */
function isImageGenStep(step, stepModel) {
    const type = step.type;
    if (type === 'CORTEX_STEP_TYPE_GENERATE_IMAGE' || type === 'CORTEX_STEP_TYPE_IMAGE_GENERATION') {
        return true;
    }
    if (step.generateImage && typeof step.generateImage === 'object' && !Array.isArray(step.generateImage)) {
        return true;
    }
    return type !== constants_1.StepType.USER_INPUT && type !== constants_1.StepType.CHECKPOINT && (0, models_1.isImageGenerationModel)(stepModel);
}
/** Follow only the typed invocation result, never arbitrary IDs in prompts or tool arguments. */
function extractLinkedSubagentIds(steps) {
    const ids = new Set();
    for (const step of steps) {
        if (step.type !== 'CORTEX_STEP_TYPE_INVOKE_SUBAGENT') {
            continue;
        }
        const invocation = step.invokeSubagent;
        if (!invocation || typeof invocation !== 'object' || Array.isArray(invocation)) {
            continue;
        }
        const results = invocation.results;
        if (!Array.isArray(results)) {
            continue;
        }
        for (const result of results) {
            if (!result || typeof result !== 'object' || Array.isArray(result)) {
                continue;
            }
            const id = result.conversationId;
            if (typeof id === 'string' && id.trim() && id.length <= 256) {
                ids.add(id.trim());
            }
        }
    }
    return [...ids];
}
function imageModelForStep(step, coordinatorModel) {
    const payload = step.generateImage;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const name = payload.modelName;
        if (typeof name === 'string' && name.trim()) {
            return (0, models_1.resolveModelId)(name) || name.trim();
        }
    }
    return (0, models_1.isImageGenerationModel)(coordinatorModel) ? (0, models_1.resolveModelId)(coordinatorModel) || coordinatorModel : '';
}
/** Extract provider token counts from a checkpoint or completed planner response. */
function extractModelUsage(meta) {
    const mu = meta.modelUsage;
    if (!mu || typeof mu !== 'object' || Array.isArray(mu)) {
        return null;
    }
    const count = (value) => {
        if (value === undefined) {
            return 0;
        }
        if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
            return null;
        }
        const parsed = Number(value);
        return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    };
    const inputTokens = count(mu.inputTokens);
    const outputTokens = count(mu.outputTokens);
    const responseOutputTokens = count(mu.responseOutputTokens);
    const cacheReadTokens = count(mu.cacheReadTokens);
    const cacheCreationTokens = count(mu.cacheCreationTokens);
    if (inputTokens === null || outputTokens === null || responseOutputTokens === null
        || cacheReadTokens === null || cacheCreationTokens === null) {
        return null;
    }
    const model = typeof mu.model === 'string' ? mu.model : '';
    if (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheCreationTokens > 0) {
        return { model, inputTokens, outputTokens, responseOutputTokens, cacheReadTokens, cacheCreationTokens };
    }
    return null;
}
function isConcreteModelString(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return false;
    }
    const upper = trimmed.toUpperCase();
    return upper !== 'MODEL_UNSPECIFIED' && upper !== 'MODEL_PLACEHOLDER_UNSPECIFIED';
}
/**
 * Process an array of trajectory steps and compute token usage.
 * Pure function — no RPC calls, no side effects.
 */
function processSteps(steps) {
    let toolOutputTokens = 0;
    let model = '';
    let orchestratorConfig;
    const orchestratorHistory = [];
    const stepDetails = [];
    let lastModelUsage = null;
    let tokenUsageSource = 'estimated';
    let checkpointModel = '';
    let imageGenStepCount = 0;
    const imageGenStepIndices = new Set();
    const imageGenerationModels = new Set();
    let estimationOverhead = 0;
    let outputTokensSinceCheckpoint = 0;
    let prevCheckpointInputTokens = -1;
    let checkpointCompressionDetected = false;
    let checkpointCompressionDrop = 0;
    const isDelegatedExecutor = (candidate) => {
        if (!orchestratorConfig || !candidate) {
            return false;
        }
        const normCandidate = (0, models_1.resolveModelId)(candidate) || candidate;
        const normExec = (0, models_1.resolveModelId)(orchestratorConfig.executionModel) || orchestratorConfig.executionModel;
        return normCandidate === normExec;
    };
    const maybeClearStaleOrchestrator = (nextModel) => {
        if (!orchestratorConfig || !nextModel) {
            return;
        }
        const resolvedNext = (0, models_1.resolveModelId)(nextModel);
        const concreteNext = resolvedNext || (/^MODEL_[A-Z0-9_]+$/i.test(nextModel.trim()) ? nextModel.trim() : '');
        if (!concreteNext) {
            return;
        }
        const normPlan = (0, models_1.resolveModelId)(orchestratorConfig.planModel) || orchestratorConfig.planModel;
        if (concreteNext !== normPlan) {
            orchestratorConfig = undefined;
        }
    };
    for (let globalStepIdx = 0; globalStepIdx < steps.length; globalStepIdx++) {
        const step = steps[globalStepIdx];
        const meta = step.metadata;
        const stepType = step.type || '';
        const stepModel = typeof meta?.generatorModel === 'string' ? meta.generatorModel : '';
        const imageStep = isImageGenStep(step, stepModel);
        // Count user input steps
        if (stepType === constants_1.StepType.USER_INPUT) {
            estimationOverhead += processUserInputStep(step);
            // The agy hub records the user's selection here, before any planner
            // response exists; its trajectory summaries omit the old model hints.
            const userInput = step.userInput;
            const userConfig = userInput?.userConfig;
            const plannerConfig = userConfig?.plannerConfig;
            const rawReq = plannerConfig?.requestedModel;
            const reqModel = typeof rawReq === 'string'
                ? rawReq
                : (rawReq && typeof rawReq === 'object' && !Array.isArray(rawReq)
                    ? rawReq.model
                    : undefined);
            const rawSelected = plannerConfig?.planModel || plannerConfig?.modelName || reqModel;
            const selected = isConcreteModelString(rawSelected) ? rawSelected.trim() : '';
            const planExecuteConfig = plannerConfig?.planExecuteConfig;
            const rawExec = planExecuteConfig?.executionModel;
            const executionModel = isConcreteModelString(rawExec) ? rawExec.trim() : '';
            if (selected) {
                model = selected;
                const normSelected = (0, models_1.resolveModelId)(selected) || selected;
                const normExec = executionModel ? ((0, models_1.resolveModelId)(executionModel) || executionModel) : '';
                const segStep = typeof step.stepIndex === 'number' && Number.isSafeInteger(step.stepIndex) && step.stepIndex >= 0
                    ? step.stepIndex
                    : globalStepIdx;
                const prevSeg = orchestratorHistory[orchestratorHistory.length - 1];
                if (!prevSeg
                    || ((0, models_1.resolveModelId)(prevSeg.planModel) || prevSeg.planModel) !== normSelected
                    || (prevSeg.executionModel ? ((0, models_1.resolveModelId)(prevSeg.executionModel) || prevSeg.executionModel) : '') !== normExec) {
                    orchestratorHistory.push({
                        startStepIndex: segStep,
                        planModel: selected,
                        executionModel: executionModel || '',
                    });
                }
                if (executionModel && normExec !== normSelected) {
                    orchestratorConfig = { planModel: selected, executionModel };
                }
                else {
                    orchestratorConfig = undefined;
                }
            }
        }
        // Count planner response steps
        if (stepType === constants_1.StepType.PLANNER_RESPONSE && !imageStep) {
            estimationOverhead += processPlannerResponseStep(step);
        }
        // Extract modelUsage from CHECKPOINT steps
        if (stepType === constants_1.StepType.CHECKPOINT && meta) {
            const usage = extractModelUsage(meta);
            if (usage) {
                // Detect compression by comparing consecutive checkpoint inputTokens
                const checkpointInput = usage.inputTokens + usage.cacheReadTokens + (usage.cacheCreationTokens || 0);
                if (prevCheckpointInputTokens > 0 && checkpointInput < prevCheckpointInputTokens) {
                    const drop = prevCheckpointInputTokens - checkpointInput;
                    if (drop > constants_1.COMPRESSION_MIN_DROP) {
                        checkpointCompressionDetected = true;
                        checkpointCompressionDrop = drop;
                    }
                }
                prevCheckpointInputTokens = checkpointInput;
                lastModelUsage = usage;
                tokenUsageSource = 'checkpoint';
                checkpointModel = usage.model;
                estimationOverhead = 0;
                outputTokensSinceCheckpoint = 0;
            }
            // Log retryInfos (observation mode — NOT added to totals)
            const retryInfos = meta.retryInfos;
            if (retryInfos && retryInfos.length > 0) {
                let retryInputTokens = 0;
                let retryOutputTokens = 0;
                for (const retry of retryInfos) {
                    const retryUsage = retry.usage;
                    if (retryUsage) {
                        retryInputTokens += parseInt(String(retryUsage.inputTokens || '0'), 10);
                        retryOutputTokens += parseInt(String(retryUsage.outputTokens || '0'), 10);
                    }
                }
                console.log(`[ContextMonitor] Checkpoint retryInfos: ${retryInfos.length} retries, ` +
                    `retryInputTokens=${retryInputTokens}, retryOutputTokens=${retryOutputTokens}, ` +
                    `mainInputTokens=${usage?.inputTokens ?? 0}, mainOutputTokens=${usage?.outputTokens ?? 0}`);
            }
        }
        // Current agy trajectories report usage directly on the planner step,
        // often with no CHECKPOINT at all. This is a full context snapshot, not
        // an amount to add to previous calls or to the response text estimate.
        if (stepType === constants_1.StepType.PLANNER_RESPONSE && meta && !imageStep) {
            const usage = extractModelUsage(meta);
            if (usage) {
                lastModelUsage = usage;
                tokenUsageSource = 'planner';
                estimationOverhead = 0;
                outputTokensSinceCheckpoint = 0;
                if (usage.model && !isDelegatedExecutor(usage.model)) {
                    model = usage.model;
                    maybeClearStaleOrchestrator(usage.model);
                }
            }
        }
        // Detect image generation steps
        if (imageStep && !imageGenStepIndices.has(globalStepIdx)) {
            imageGenStepIndices.add(globalStepIdx);
            imageGenStepCount++;
            const imageModel = imageModelForStep(step, stepModel);
            if (imageModel) {
                imageGenerationModels.add(imageModel);
            }
        }
        if (!meta) {
            continue;
        }
        const outputTokens = meta.toolCallOutputTokens || 0;
        if (outputTokens > 0) {
            toolOutputTokens += outputTokens;
            outputTokensSinceCheckpoint += outputTokens;
            stepDetails.push({
                type: stepType,
                toolCallOutputTokens: outputTokens,
                model: stepModel
            });
        }
        // Track the latest model used (for dynamic model switching).
        // Skip CHECKPOINT steps — their generatorModel belongs to internal
        // shadow models (e.g. M50 Flash Lite for title/intent/compression).
        // Display model should only reflect user-facing model selections.
        if (stepModel && stepType !== constants_1.StepType.CHECKPOINT && !imageStep && !isDelegatedExecutor(stepModel)) {
            model = stepModel;
            maybeClearStaleOrchestrator(stepModel);
        }
        // requestedModel is highest priority (user's explicit selection)
        const rm = meta.requestedModel;
        if (!imageStep && typeof rm?.model === 'string' && !isDelegatedExecutor(rm.model)) {
            model = rm.model;
            maybeClearStaleOrchestrator(rm.model);
        }
    }
    const estimatedDelta = outputTokensSinceCheckpoint + estimationOverhead;
    // Priority 1: Use the latest measured input + output snapshot and subsequent estimated delta
    if (lastModelUsage) {
        return {
            tokenUsageSource,
            inputTokens: lastModelUsage.inputTokens,
            totalOutputTokens: lastModelUsage.outputTokens,
            totalToolCallOutputTokens: toolOutputTokens,
            contextUsed: lastModelUsage.inputTokens + lastModelUsage.cacheReadTokens
                + (lastModelUsage.cacheCreationTokens || 0) + lastModelUsage.outputTokens + estimatedDelta,
            isEstimated: estimatedDelta > 0,
            model,
            stepDetails,
            lastModelUsage,
            estimatedDeltaSinceCheckpoint: estimatedDelta,
            imageGenStepCount,
            imageGenerationModels: [...imageGenerationModels],
            linkedSubagentCascadeIds: extractLinkedSubagentIds(steps),
            hasGaps: false,
            checkpointCompressionDetected,
            checkpointCompressionDrop,
            checkpointModel,
            ...(orchestratorConfig ? { orchestratorConfig } : {}),
            ...(orchestratorHistory.length > 0 ? { orchestratorHistory } : {}),
        };
    }
    // Fallback: estimate total context window usage
    const estimatedTotal = toolOutputTokens + constants_1.SYSTEM_PROMPT_OVERHEAD + estimationOverhead;
    return {
        tokenUsageSource: 'estimated',
        inputTokens: 0,
        totalOutputTokens: 0,
        totalToolCallOutputTokens: toolOutputTokens,
        contextUsed: estimatedTotal,
        isEstimated: true,
        model,
        stepDetails,
        lastModelUsage: null,
        estimatedDeltaSinceCheckpoint: estimatedTotal,
        imageGenStepCount,
        imageGenerationModels: [...imageGenerationModels],
        linkedSubagentCascadeIds: extractLinkedSubagentIds(steps),
        hasGaps: false,
        checkpointCompressionDetected: false,
        checkpointCompressionDrop: 0,
        checkpointModel: '',
        ...(orchestratorConfig ? { orchestratorConfig } : {}),
        ...(orchestratorHistory.length > 0 ? { orchestratorHistory } : {}),
    };
}
/** True when a Connect-RPC error indicates an unimplemented or removed endpoint (HTTP 404/501). */
function isRpcUnimplementedError(err) {
    const message = err instanceof Error ? err.message : String(err ?? '');
    return /\bHTTP\s+(?:404|501)\b/i.test(message) || /\bunimplemented\b/i.test(message);
}
/**
 * Fetch raw GetCascadeTrajectoryGeneratorMetadata entries without stripping
 * `chatModel.promptSections` (`{ title, tokenType, contentLen }`) or `chatModel.usage`.
 * Gracefully degrades to `[]` on 501/404 or transient errors.
 */
async function fetchTrajectoryGeneratorMetadata(ls, cascadeId, signal) {
    try {
        const resp = await (0, rpc_client_1.rpcCall)(ls, 'GetCascadeTrajectoryGeneratorMetadata', {
            cascadeId,
            metadata: { ideName: 'antigravity', extensionName: 'antigravity' },
        }, 15000, signal);
        const raw = resp.generatorMetadata;
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.filter((item) => !!item && typeof item === 'object' && !Array.isArray(item));
    }
    catch (err) {
        if (signal?.aborted) {
            throw err;
        }
        return [];
    }
}
/**
 * Fetch trajectory steps across both legacy `startIndex`/`endIndex` servers
 * and Antigravity v2.34+ `stepOffset` hubs without duplicating overlapping batches.
 */
async function fetchTrajectorySteps(ls, cascadeId, totalSteps, signal) {
    const maxSteps = Math.max(totalSteps, 0);
    const allSteps = [];
    let hasGaps = false;
    const batchRanges = [];
    for (let start = 0; start < maxSteps; start += constants_1.STEP_BATCH_SIZE) {
        batchRanges.push({ start, end: Math.min(start + constants_1.STEP_BATCH_SIZE, maxSteps) });
    }
    if (batchRanges.length === 0) {
        return { steps: allSteps, hasGaps: false };
    }
    const fetchBatch = ({ start, end }) => (0, rpc_client_1.rpcCall)(ls, 'GetCascadeTrajectorySteps', {
        cascadeId,
        startIndex: start,
        endIndex: end,
        stepOffset: start,
    }, 30000, signal);
    // Probe the first batch when multiple pages are expected: v2.34+ hubs ignore
    // endIndex and can return all steps from stepOffset=0 in one response.
    let remainingStart = 0;
    if (batchRanges.length > 1) {
        remainingStart = 1;
        try {
            const firstResp = await fetchBatch(batchRanges[0]);
            const firstSteps = firstResp.steps;
            if (firstSteps && firstSteps.length > 0) {
                allSteps.push(...firstSteps);
                if (firstSteps.length >= maxSteps || firstSteps.length > constants_1.STEP_BATCH_SIZE) {
                    return { steps: allSteps, hasGaps: false };
                }
            }
        }
        catch (err) {
            if (signal?.aborted) {
                throw err;
            }
            if (!isRpcUnimplementedError(err)) {
                console.warn(`[ContextMonitor] Failed to fetch steps batch [${batchRanges[0].start}-${batchRanges[0].end}] ` +
                    `for cascade ${cascadeId.substring(0, 8)}: ${err}`);
            }
            hasGaps = true;
        }
    }
    // Process remaining batches in groups to avoid bursting concurrent RPC calls
    for (let groupStart = remainingStart; groupStart < batchRanges.length; groupStart += constants_1.MAX_CONCURRENT_BATCHES) {
        const group = batchRanges.slice(groupStart, groupStart + constants_1.MAX_CONCURRENT_BATCHES);
        const groupResults = await Promise.allSettled(group.map(fetchBatch));
        for (let i = 0; i < groupResults.length; i++) {
            const result = groupResults[i];
            if (result.status === 'fulfilled') {
                const steps = result.value.steps;
                if (steps && steps.length > 0) {
                    allSteps.push(...steps);
                }
            }
            else {
                const { start, end } = group[i];
                if (!isRpcUnimplementedError(result.reason)) {
                    console.warn(`[ContextMonitor] Failed to fetch steps batch [${start}-${end}] ` +
                        `for cascade ${cascadeId.substring(0, 8)}: ${result.reason}`);
                }
                hasGaps = true;
            }
        }
    }
    return { steps: allSteps, hasGaps };
}
/**
 * Get context window usage for a cascade by iterating through steps.
 * Fetches steps in batches from the LS via RPC.
 */
async function getTrajectoryTokenUsage(ls, cascadeId, totalSteps, signal) {
    const { steps: allSteps, hasGaps } = await fetchTrajectorySteps(ls, cascadeId, totalSteps, signal);
    const result = processSteps(allSteps);
    result.hasGaps = hasGaps;
    return result;
}
const MAX_IMAGE_WORKFLOW_CHILDREN = 16;
const MAX_IMAGE_WORKFLOW_DEPTH = 4;
const MAX_IMAGE_CHILD_STEPS = 2000;
const IMAGE_IDLE_CACHE_MS = 30_000;
let imageWorkflowGeneration = 0;
const imageWorkflowCache = new Map();
const imageWorkflowPending = new Map();
/** Child observations belong to one account/backend lifetime and are never persisted as global data. */
function resetImageWorkflowCache() {
    imageWorkflowGeneration++;
    imageWorkflowCache.clear();
    imageWorkflowPending.clear();
}
async function readChildImageWorkflow(ls, cascadeId, signal) {
    const generation = imageWorkflowGeneration;
    const key = `${generation}:${ls.pid}:${ls.port}:${ls.useTls}:${ls.csrfToken}:${cascadeId}`;
    const cached = imageWorkflowCache.get(key);
    // Running/unknown children are re-read every poll even when their parent is idle.
    if (cached && !cached.incomplete && cached.status === 'CASCADE_RUN_STATUS_IDLE'
        && Date.now() - cached.fetchedAt < IMAGE_IDLE_CACHE_MS) {
        return cached;
    }
    const pending = imageWorkflowPending.get(key);
    if (pending) {
        return pending;
    }
    const request = (async () => {
        try {
            const response = await (0, rpc_client_1.rpcCall)(ls, 'GetCascadeTrajectory', { cascadeId }, 10_000, signal);
            const trajectory = response.trajectory;
            if (!trajectory || !Array.isArray(trajectory.steps)) {
                throw new Error('Missing linked trajectory steps');
            }
            const allSteps = trajectory.steps;
            const steps = allSteps.slice(0, MAX_IMAGE_CHILD_STEPS)
                .filter((step) => !!step && typeof step === 'object' && !Array.isArray(step));
            const models = new Set();
            let directStepCount = 0;
            for (const step of steps) {
                const metadata = step.metadata;
                const coordinator = typeof metadata?.generatorModel === 'string' ? metadata.generatorModel : '';
                if (!isImageGenStep(step, coordinator)) {
                    continue;
                }
                directStepCount++;
                const model = imageModelForStep(step, coordinator);
                if (model) {
                    models.add(model);
                }
            }
            const totalSteps = Number(response.numTotalSteps);
            const result = {
                info: { directStepCount, directModels: [...models], linkedCascadeIds: extractLinkedSubagentIds(steps) },
                status: typeof response.status === 'string' ? response.status : '',
                incomplete: allSteps.length > MAX_IMAGE_CHILD_STEPS || steps.length !== allSteps.length
                    || (Number.isSafeInteger(totalSteps) && totalSteps > allSteps.length),
                fetchedAt: Date.now(),
            };
            if (generation === imageWorkflowGeneration) {
                imageWorkflowCache.set(key, result);
                while (imageWorkflowCache.size > 128) {
                    imageWorkflowCache.delete(imageWorkflowCache.keys().next().value);
                }
            }
            return result;
        }
        catch (error) {
            if (signal?.aborted) {
                throw error;
            }
            // Retain any previously observed images, but disclose that this read
            // is incomplete. A missing child must never erase a known image.
            return cached ? { ...cached, incomplete: true } : {
                info: { directStepCount: 0, directModels: [], linkedCascadeIds: [] },
                status: '', incomplete: true, fetchedAt: Date.now(),
            };
        }
    })();
    imageWorkflowPending.set(key, request);
    try {
        return await request;
    }
    finally {
        if (imageWorkflowPending.get(key) === request) {
            imageWorkflowPending.delete(key);
        }
    }
}
/** Count image-tool steps in this workflow only; child text tokens never alter parent context. */
async function refreshWorkflowImageUsage(ls, usage, signal) {
    const direct = usage.imageWorkflow;
    if (!direct) {
        return usage;
    }
    const generation = imageWorkflowGeneration;
    let imageGenStepCount = direct.directStepCount;
    const models = new Set(direct.directModels);
    let incomplete = usage.hasGaps;
    const visited = new Set([usage.cascadeId]);
    const queue = [];
    const enqueue = (id, depth) => {
        if (visited.has(id)) {
            return;
        }
        if (depth > MAX_IMAGE_WORKFLOW_DEPTH || visited.size - 1 >= MAX_IMAGE_WORKFLOW_CHILDREN) {
            incomplete = true;
            return;
        }
        visited.add(id);
        queue.push({ id, depth });
    };
    for (const id of direct.linkedCascadeIds) {
        enqueue(id, 1);
    }
    while (queue.length > 0) {
        if (generation !== imageWorkflowGeneration) {
            break;
        }
        if (signal?.aborted) {
            throw new Error('Image workflow read aborted');
        }
        const batch = queue.splice(0, 4);
        const children = await Promise.all(batch.map(child => readChildImageWorkflow(ls, child.id, signal)));
        if (generation !== imageWorkflowGeneration) {
            break;
        }
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            imageGenStepCount += child.info.directStepCount;
            child.info.directModels.forEach(model => models.add(model));
            incomplete ||= child.incomplete;
            child.info.linkedCascadeIds.forEach(id => enqueue(id, batch[i].depth + 1));
        }
    }
    if (generation !== imageWorkflowGeneration) {
        return { ...usage, imageGenStepCount: direct.directStepCount,
            imageGenerationModels: [...direct.directModels], imageGenerationIncomplete: true };
    }
    return { ...usage, imageGenStepCount, imageGenerationModels: [...models], imageGenerationIncomplete: incomplete };
}
// ─── Full User Status from GetUserStatus ─────────────────────────────────────
/**
 * Fetch full user status including model configs, plan info, and credits.
 */
async function fetchFullUserStatus(ls, signal) {
    try {
        const resp = await (0, rpc_client_1.rpcCall)(ls, 'GetUserStatus', {
            metadata: { ideName: 'antigravity', extensionName: 'antigravity' }
        }, 10000, signal);
        const rawUserStatus = resp?.userStatus;
        if (!rawUserStatus || typeof rawUserStatus !== 'object' || Array.isArray(rawUserStatus)) {
            return { configs: [], userInfo: null };
        }
        const userStatus = rawUserStatus;
        // ─── Model Configs ───
        const configData = userStatus.cascadeModelConfigData;
        const rawConfigs = configData?.clientModelConfigs;
        const configs = (rawConfigs || []).map(c => {
            const qi = c.quotaInfo;
            const mimeTypes = c.supportedMimeTypes;
            // Proto3 omits float fields when value is 0.0 (the default).
            // Two reasons remainingFraction can be missing:
            //   1. Quota untouched (resetTime is empty or epoch 1970) → treat as 1.0 (full)
            //   2. Quota exhausted (resetTime is a valid non-epoch date) → treat as 0.0
            // Malformed values stay NaN so downstream marks quota unknown instead of 0%.
            const resolveRemainingFraction = (q) => {
                if (q.remainingFraction != null) {
                    const raw = typeof q.remainingFraction === 'string' && q.remainingFraction.trim() !== ''
                        ? Number(q.remainingFraction) : q.remainingFraction;
                    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : Number.NaN;
                }
                if (q.resetTime == null) {
                    return 1;
                }
                if (typeof q.resetTime !== 'string') {
                    return Number.NaN;
                }
                const rt = q.resetTime.trim();
                if (!rt) {
                    return 1;
                }
                const parsed = parseStrictResetTimestamp(rt);
                if (parsed === null || parsed < 0) {
                    return Number.NaN;
                }
                return parsed === 0 ? 1 : 0;
            };
            return {
                model: c.modelOrAlias?.model || '',
                label: c.label || '',
                supportsImages: c.supportsImages || false,
                quotaInfo: qi ? {
                    remainingFraction: resolveRemainingFraction(qi),
                    resetTime: qi.resetTime || '',
                } : undefined,
                allowedTiers: c.allowedTiers || [],
                tagTitle: c.tagTitle || undefined,
                ...(typeof c.tagDescription === 'string' && c.tagDescription.trim()
                    ? { tagDescription: c.tagDescription.trim() } : {}),
                ...(typeof c.modelId === 'string' && c.modelId.trim()
                    ? { modelId: c.modelId.trim() } : {}),
                mimeTypeCount: mimeTypes ? Object.keys(mimeTypes).length : 0,
                isRecommended: c.isRecommended || false,
                supportedMimeTypes: mimeTypes ? Object.keys(mimeTypes) : [],
            };
        }).filter(c => c.model && c.label);
        const rawGroupedModels = configData?.groupedModels;
        let groupedModels;
        if (rawGroupedModels && typeof rawGroupedModels === 'object' && !Array.isArray(rawGroupedModels)) {
            const parsedGroups = {};
            for (const [familyKey, rawEntry] of Object.entries(rawGroupedModels)) {
                if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
                    continue;
                }
                const entry = rawEntry;
                const displayName = typeof entry.displayName === 'string' ? entry.displayName.trim() : '';
                const rawLevels = Array.isArray(entry.supportedThinkingLevels) ? entry.supportedThinkingLevels : [];
                const supportedThinkingLevels = rawLevels.flatMap((lvl) => {
                    if (!lvl || typeof lvl !== 'object' || Array.isArray(lvl)) {
                        return [];
                    }
                    const rec = lvl;
                    const thinkingSuffix = typeof rec.thinkingSuffix === 'string' ? rec.thinkingSuffix.trim() : '';
                    const thinkingDisplayName = typeof rec.thinkingDisplayName === 'string' ? rec.thinkingDisplayName.trim() : '';
                    return thinkingSuffix && thinkingDisplayName ? [{ thinkingSuffix, thinkingDisplayName }] : [];
                });
                const defaultThinkingSuffix = typeof entry.defaultThinkingSuffix === 'string' && entry.defaultThinkingSuffix.trim()
                    ? entry.defaultThinkingSuffix.trim() : undefined;
                if (displayName || supportedThinkingLevels.length > 0) {
                    parsedGroups[familyKey] = {
                        displayName: displayName || familyKey,
                        supportedThinkingLevels,
                        ...(defaultThinkingSuffix ? { defaultThinkingSuffix } : {}),
                    };
                }
            }
            if (Object.keys(parsedGroups).length > 0) {
                groupedModels = parsedGroups;
            }
        }
        // ─── Plan Info ───
        const planStatus = userStatus.planStatus;
        const planInfo = planStatus?.planInfo;
        const userTier = userStatus.userTier;
        const teamCfg = planInfo?.defaultTeamConfig;
        const defaultOverride = configData?.defaultOverrideModelConfig;
        const defaultModelId = defaultOverride?.modelOrAlias?.model || '';
        const defaultModelCfg = configs.find(c => c.model === defaultModelId);
        const rawCredits = Array.isArray(userTier?.availableCredits) ? userTier.availableCredits : [];
        // Deep-mined fields
        const tierDescription = userTier?.description || '';
        const upgradeText = userTier?.upgradeSubscriptionText || '';
        const clientModelSorts = configData?.clientModelSorts || [];
        let modelSortOrder = [];
        if (clientModelSorts.length > 0) {
            const sortGroups = clientModelSorts[0].groups || [];
            if (sortGroups.length > 0) {
                modelSortOrder = sortGroups[0].modelLabels || [];
            }
        }
        const parseNum = (v) => {
            if (typeof v === 'number') {
                return Number.isFinite(v) ? v : 0;
            }
            if (typeof v === 'string') {
                const n = parseInt(v, 10);
                return Number.isFinite(n) ? n : 0;
            }
            return 0;
        };
        const hasAccountData = !!(planInfo || userTier || userStatus.email || userStatus.name);
        const userInfo = hasAccountData ? {
            name: userStatus.name || '',
            email: userStatus.email || '',
            planName: planInfo?.planName || '',
            teamsTier: planInfo?.teamsTier || '',
            userTierName: userTier?.name || '',
            userTierId: userTier?.id || '',
            defaultModelLabel: defaultModelCfg?.label || defaultModelId || '',
            planLimits: {
                maxNumChatInputTokens: parseNum(planInfo?.maxNumChatInputTokens),
                maxNumPremiumChatMessages: parseNum(planInfo?.maxNumPremiumChatMessages),
                maxCustomChatInstructionCharacters: parseNum(planInfo?.maxCustomChatInstructionCharacters),
                maxNumPinnedContextItems: parseNum(planInfo?.maxNumPinnedContextItems),
                maxLocalIndexSize: parseNum(planInfo?.maxLocalIndexSize),
                monthlyFlexCreditPurchaseAmount: parseNum(planInfo?.monthlyFlexCreditPurchaseAmount),
            },
            teamConfig: {
                allowMcpServers: Boolean(teamCfg?.allowMcpServers),
                allowAutoRunCommands: Boolean(teamCfg?.allowAutoRunCommands),
                allowBrowserExperimentalFeatures: Boolean(teamCfg?.allowBrowserExperimentalFeatures),
            },
            availableCredits: rawCredits.flatMap((entry) => {
                if (!entry || typeof entry !== 'object') {
                    return [];
                }
                const credit = entry;
                if (typeof credit.creditType !== 'string') {
                    return [];
                }
                return [{
                        creditType: credit.creditType,
                        creditAmount: (0, account_credits_1.parseCreditBalance)(credit.creditAmount),
                        minimumCreditAmountForUsage: parseNum(credit.minimumCreditAmountForUsage),
                    }];
            }),
            // Feature flags
            canBuyMoreCredits: Boolean(planInfo?.canBuyMoreCredits),
            browserEnabled: Boolean(planInfo?.browserEnabled),
            cascadeWebSearchEnabled: Boolean(planInfo?.cascadeWebSearchEnabled),
            knowledgeBaseEnabled: Boolean(planInfo?.knowledgeBaseEnabled),
            canGenerateCommitMessages: Boolean(planInfo?.canGenerateCommitMessages),
            cascadeCanAutoRunCommands: Boolean(planInfo?.cascadeCanAutoRunCommands),
            canAllowCascadeInBackground: Boolean(planInfo?.canAllowCascadeInBackground),
            hasAutocompleteFastMode: Boolean(planInfo?.hasAutocompleteFastMode),
            allowStickyPremiumModels: Boolean(planInfo?.allowStickyPremiumModels),
            allowPremiumCommandModels: Boolean(planInfo?.allowPremiumCommandModels),
            hasTabToJump: Boolean(planInfo?.hasTabToJump),
            canCustomizeAppIcon: Boolean(planInfo?.canCustomizeAppIcon),
            // Deep-mined fields
            userTierDescription: tierDescription,
            upgradeSubscriptionText: upgradeText,
            modelSortOrder,
        } : null;
        // Attach raw LS response for transparency panel
        if (userInfo) {
            userInfo._rawResponse = resp;
        }
        return {
            configs,
            userInfo,
            ...(groupedModels ? { groupedModels } : {}),
            rawResponse: resp,
        };
    }
    catch {
        return { configs: [], userInfo: null };
    }
}
// ─── Orchestrator Settings (JetboxSubscribeToState + GetMendelFlags) ─────────
/** Parse Mendel experiment payload for `orchestrator-model-roles`. */
function parseOrchestratorModelRoles(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const root = raw;
    const response = (root.response && typeof root.response === 'object' && !Array.isArray(root.response))
        ? root.response : root;
    const expCfg = (response.experimentConfig && typeof response.experimentConfig === 'object' && !Array.isArray(response.experimentConfig))
        ? response.experimentConfig : response;
    const experiments = Array.isArray(expCfg.experiments) ? expCfg.experiments : [];
    for (const item of experiments) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }
        const exp = item;
        if (exp.disabled === true) {
            continue;
        }
        const keyStr = typeof exp.keyString === 'string' ? exp.keyString.trim() : '';
        if (keyStr !== 'orchestrator-model-roles') {
            continue;
        }
        const payloadObj = (exp.payload && typeof exp.payload === 'object' && !Array.isArray(exp.payload))
            ? exp.payload : undefined;
        const jsonStr = typeof exp.string === 'string' ? exp.string
            : typeof exp.stringValue === 'string' ? exp.stringValue
                : typeof payloadObj?.value === 'string' ? payloadObj.value : '';
        if (!jsonStr.trim()) {
            continue;
        }
        try {
            const parsed = JSON.parse(jsonStr);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                continue;
            }
            const rec = parsed;
            const orchestrators = Array.isArray(rec.orchestrators)
                ? rec.orchestrators.filter((v) => typeof v === 'string' && v.trim().length > 0).map(v => v.trim())
                : [];
            const executors = Array.isArray(rec.executors)
                ? rec.executors.filter((v) => typeof v === 'string' && v.trim().length > 0).map(v => v.trim())
                : [];
            if (orchestrators.length > 0 || executors.length > 0) {
                return { orchestrators, executors };
            }
        }
        catch {
            return null;
        }
    }
    return null;
}
/** Extract Orchestrator preferences from frame 1 of JetboxSubscribeToState. */
function parseJetboxOrchestratorPrefs(frame) {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
        return null;
    }
    const rec = frame;
    const appState = (rec.appState && typeof rec.appState === 'object' && !Array.isArray(rec.appState))
        ? rec.appState : undefined;
    const userConfig = (rec.userConfig && typeof rec.userConfig === 'object' && !Array.isArray(rec.userConfig))
        ? rec.userConfig : undefined;
    const userSettings = (userConfig?.userSettings && typeof userConfig.userSettings === 'object' && !Array.isArray(userConfig.userSettings))
        ? userConfig.userSettings
        : (rec.userSettings && typeof rec.userSettings === 'object' && !Array.isArray(rec.userSettings))
            ? rec.userSettings : undefined;
    const str = (v) => (typeof v === 'string' ? v.trim() : '');
    const useAiCredits = typeof userSettings?.useAiCredits === 'boolean'
        ? userSettings.useAiCredits
        : typeof userConfig?.useAiCredits === 'boolean'
            ? userConfig.useAiCredits
            : undefined;
    return {
        orchestratorModel: str(userSettings?.orchestratorModel ?? userConfig?.orchestratorModel),
        orchestratorExecutorModel: str(userSettings?.orchestratorExecutorModel ?? userConfig?.orchestratorExecutorModel),
        lastSelectedAgentModel: str(appState?.lastSelectedAgentModel),
        ...(useAiCredits !== undefined ? { useAiCredits } : {}),
    };
}
function isConcretePrefModel(value) {
    const clean = (value || '').trim().toUpperCase();
    return Boolean(clean) && clean !== 'MODEL_UNSPECIFIED' && clean !== 'MODEL_PLACEHOLDER_UNSPECIFIED';
}
/**
 * Fetch global Orchestrator Settings (Orchestrator Model + Executor Model + Mendel roles).
 * Falls back read-only to `~/.gemini/config/config.json` (`userSettings.{orchestratorModel,
 * orchestratorExecutorModel, useAiCredits}`) when `JetboxSubscribeToState` has not populated
 * them yet, and gracefully degrades to null when neither RPC nor local config has data.
 */
async function fetchOrchestratorSettings(ls, configs, signal, options) {
    try {
        const [jetboxRes, mendelRes] = await Promise.allSettled([
            (0, rpc_client_1.rpcStreamFirstFrame)(ls, 'JetboxSubscribeToState', {}, 5000, signal),
            (0, rpc_client_1.rpcCall)(ls, 'GetMendelFlags', {}, 5000, signal),
        ]);
        const rpcPrefs = jetboxRes.status === 'fulfilled'
            ? parseJetboxOrchestratorPrefs(jetboxRes.value) : null;
        const roles = mendelRes.status === 'fulfilled'
            ? parseOrchestratorModelRoles(mendelRes.value) : null;
        const needsConfigFallback = !options?.disableConfigFallback && (!rpcPrefs
            || !isConcretePrefModel(rpcPrefs.orchestratorModel)
            || !isConcretePrefModel(rpcPrefs.orchestratorExecutorModel)
            || rpcPrefs.useAiCredits === undefined);
        const diskPrefs = needsConfigFallback
            ? (0, orchestrator_attribution_1.readLocalOrchestratorConfigFallback)({ configPath: options?.configPath, homeDir: options?.homeDir })
            : null;
        if (!rpcPrefs && !diskPrefs && !roles) {
            return null;
        }
        const mergedOrch = isConcretePrefModel(rpcPrefs?.orchestratorModel)
            ? rpcPrefs.orchestratorModel
            : (diskPrefs?.orchestratorModel || rpcPrefs?.orchestratorModel || '');
        const mergedExec = isConcretePrefModel(rpcPrefs?.orchestratorExecutorModel)
            ? rpcPrefs.orchestratorExecutorModel
            : (diskPrefs?.orchestratorExecutorModel || rpcPrefs?.orchestratorExecutorModel || '');
        const mergedCredits = rpcPrefs?.useAiCredits !== undefined
            ? rpcPrefs.useAiCredits
            : diskPrefs?.useAiCredits;
        const usedDisk = Boolean(diskPrefs && ((!isConcretePrefModel(rpcPrefs?.orchestratorModel) && isConcretePrefModel(diskPrefs.orchestratorModel))
            || (!isConcretePrefModel(rpcPrefs?.orchestratorExecutorModel) && isConcretePrefModel(diskPrefs.orchestratorExecutorModel))
            || (rpcPrefs?.useAiCredits === undefined && diskPrefs.useAiCredits !== undefined)));
        const settingsSource = rpcPrefs
            ? (usedDisk ? 'merged' : 'rpc')
            : (diskPrefs ? 'config_fallback' : 'rpc');
        const mergedPrefs = (rpcPrefs || diskPrefs) ? {
            orchestratorModel: mergedOrch,
            orchestratorExecutorModel: mergedExec,
            lastSelectedAgentModel: rpcPrefs?.lastSelectedAgentModel || '',
            ...(mergedCredits !== undefined ? { useAiCredits: mergedCredits } : {}),
            settingsSource,
        } : null;
        return (0, models_1.resolveOrchestratorSettings)(mergedPrefs, roles, configs);
    }
    catch {
        return null;
    }
}
// ─── Dual-Window Quota Summary (RetrieveUserQuotaSummary) ────────────────────
const STRICT_ISO_RESET_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i;
/**
 * Parse a strict ISO-8601 / RFC 3339 reset timestamp with explicit timezone (`Z` or `±HH:MM`)
 * and real calendar-date round-trip validation.
 * Returns epoch milliseconds (including `0` for equivalent proto3 epoch-0 spellings such as
 * `1970-01-01T00:00:00Z`, `1970-01-01T00:00:00.000Z`, or `1970-01-01T00:00:00+00:00`),
 * or `null` when missing, malformed, missing timezone, or an impossible calendar date.
 */
function parseStrictResetTimestamp(raw) {
    const reset = typeof raw === 'string' ? raw.trim() : '';
    if (!reset || !STRICT_ISO_RESET_TIMESTAMP_RE.test(reset)) {
        return null;
    }
    const day = reset.slice(0, 10);
    const calendarDate = new Date(`${day}T00:00:00Z`);
    if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) {
        return null;
    }
    const parsed = Date.parse(reset);
    return Number.isFinite(parsed) ? parsed : null;
}
function parseWindowResetTimestamp(raw) {
    if (typeof raw !== 'string') {
        return { resetTime: null, resetAt: null, parsedMs: null };
    }
    const reset = raw.trim();
    const parsedMs = parseStrictResetTimestamp(reset);
    if (parsedMs === null || parsedMs <= 0) {
        return { resetTime: null, resetAt: null, parsedMs };
    }
    return { resetTime: reset, resetAt: parsedMs, parsedMs };
}
function parseQuotaWindowRemaining(bucket, parsedResetMs) {
    if (bucket.remainingFraction != null) {
        const raw = typeof bucket.remainingFraction === 'string' && bucket.remainingFraction.trim() !== ''
            ? Number(bucket.remainingFraction) : bucket.remainingFraction;
        return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
    }
    // Proto3 omits float 0.0: untouched quota has no/epoch resetTime → 1.0,
    // exhausted quota has a valid future/non-epoch resetTime → 0.0.
    if (bucket.resetTime == null) {
        return 1;
    }
    if (typeof bucket.resetTime !== 'string') {
        return null;
    }
    if (!bucket.resetTime.trim()) {
        return 1;
    }
    if (parsedResetMs === null || parsedResetMs < 0) {
        return null;
    }
    return parsedResetMs === 0 ? 1 : 0;
}
function inferQuotaSummaryPool(displayName, buckets) {
    const ids = buckets.map(b => b.bucketId.toLowerCase());
    if (ids.some(id => id.startsWith('gemini')) || /\bgemini\b/i.test(displayName)) {
        return 'gemini';
    }
    if (ids.some(id => id.startsWith('3p') || id.startsWith('claude') || id.startsWith('gpt'))
        || /\b(?:claude|gpt)\b/i.test(displayName)) {
        return 'premium';
    }
    return undefined;
}
/** Parse RetrieveUserQuotaSummary response into canonical dual-window pool summaries. */
function parseUserQuotaSummary(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return null;
    }
    const root = raw;
    const payload = (root.response && typeof root.response === 'object' && !Array.isArray(root.response))
        ? root.response : root;
    const rawGroups = Array.isArray(payload.groups) ? payload.groups : [];
    const groups = [];
    for (const item of rawGroups) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            continue;
        }
        const rec = item;
        const displayName = typeof rec.displayName === 'string' ? rec.displayName.trim() : '';
        const description = typeof rec.description === 'string' && rec.description.trim()
            ? rec.description.trim() : undefined;
        const rawBuckets = Array.isArray(rec.buckets) ? rec.buckets : [];
        const buckets = [];
        for (const rawBucket of rawBuckets) {
            if (!rawBucket || typeof rawBucket !== 'object' || Array.isArray(rawBucket)) {
                continue;
            }
            const b = rawBucket;
            const bucketId = typeof b.bucketId === 'string' ? b.bucketId.trim() : '';
            const rawWindow = typeof b.window === 'string' ? b.window.trim().toLowerCase() : '';
            const window = rawWindow
                || (bucketId.toLowerCase().endsWith('-weekly') ? 'weekly'
                    : bucketId.toLowerCase().endsWith('-5h') ? '5h' : '');
            if (!bucketId && !window) {
                continue;
            }
            const { resetTime, resetAt, parsedMs } = parseWindowResetTimestamp(b.resetTime);
            const remainingFraction = parseQuotaWindowRemaining(b, parsedMs);
            const bucketDisplayName = typeof b.displayName === 'string' ? b.displayName.trim() : '';
            const bucketDescription = typeof b.description === 'string' && b.description.trim()
                ? b.description.trim() : undefined;
            buckets.push({
                bucketId,
                window,
                displayName: bucketDisplayName || window || bucketId,
                ...(bucketDescription ? { description: bucketDescription } : {}),
                remainingFraction,
                resetTime,
                resetAt,
            });
        }
        if (!displayName && buckets.length === 0) {
            continue;
        }
        const pool = inferQuotaSummaryPool(displayName, buckets);
        const fiveHour = buckets.find(b => b.window === '5h');
        const weekly = buckets.find(b => b.window === 'weekly');
        groups.push({
            ...(pool ? { pool } : {}),
            displayName: displayName || (pool === 'gemini' ? 'Gemini Models' : pool === 'premium' ? 'Claude and GPT models' : 'Models'),
            ...(description ? { description } : {}),
            ...(fiveHour ? { fiveHour } : {}),
            ...(weekly ? { weekly } : {}),
            buckets,
        });
    }
    if (groups.length === 0) {
        return null;
    }
    const description = typeof payload.description === 'string' && payload.description.trim()
        ? payload.description.trim() : undefined;
    return { groups, ...(description ? { description } : {}) };
}
/**
 * Fetch dual-window (5h + weekly) quota summary from RetrieveUserQuotaSummary.
 * Returns null gracefully on older LS builds or RPC failure.
 */
async function fetchUserQuotaSummary(ls, signal) {
    try {
        const resp = await (0, rpc_client_1.rpcCall)(ls, 'RetrieveUserQuotaSummary', {
            metadata: { ideName: 'antigravity', extensionName: 'antigravity' },
        }, 10000, signal);
        return parseUserQuotaSummary(resp);
    }
    catch {
        return null;
    }
}
/**
 * @deprecated Use `fetchFullUserStatus()` instead.
 * Backward-compatible wrapper — relies on `GetUserStatus` (never calling
 * `GetCommandModelConfigs`, which returns `501 unimplemented` on v2.34+ App & v2.7+ IDE).
 */
async function fetchModelConfigs(ls, signal) {
    const result = await fetchFullUserStatus(ls, signal);
    return result.configs;
}
/**
 * Safely read model configs without hitting `GetCommandModelConfigs` `501 unimplemented`
 * spam on Antigravity App v2.34+ / IDE v2.7+ hubs. Uses `GetUserStatus` directly and
 * degrades cleanly to `[]` if unavailable.
 */
async function fetchCommandModelConfigsSafe(ls, signal) {
    try {
        const result = await fetchFullUserStatus(ls, signal);
        return result.configs;
    }
    catch (err) {
        if (signal?.aborted) {
            throw err;
        }
        return [];
    }
}
/**
 * Get full context usage for a specific cascade.
 */
async function getContextUsage(ls, trajectory, customLimits, signal) {
    const result = await getTrajectoryTokenUsage(ls, trajectory.cascadeId, trajectory.stepCount, signal);
    const effectiveModel = result.model || trajectory.requestedModel || trajectory.generatorModel;
    // When the latest token snapshot came directly from a planner/executor step
    // (never a CHECKPOINT whose lastModelUsage.model is a shadow model like M50),
    // resolve contextLimit against that actual model so cross-pool Orchestrator
    // turns (e.g. Opus 5.5 256K planner + Hydrogen 512K executor) match occupancy
    // to the active step's compression limit.
    const limitModel = result.tokenUsageSource === 'planner' && result.lastModelUsage?.model
        ? result.lastModelUsage.model
        : effectiveModel;
    const contextLimit = (0, models_1.getContextLimit)(limitModel, customLimits);
    const usagePercent = contextLimit > 0 ? (result.contextUsed / contextLimit) * 100 : 0;
    const usage = {
        tokenUsageSource: result.tokenUsageSource,
        cascadeId: trajectory.cascadeId,
        title: trajectory.summary,
        model: effectiveModel,
        modelDisplayName: (0, models_1.normalizeModelDisplayName)(effectiveModel),
        contextUsed: result.contextUsed,
        totalOutputTokens: result.totalOutputTokens,
        totalToolCallOutputTokens: result.totalToolCallOutputTokens,
        contextLimit,
        usagePercent,
        stepCount: trajectory.stepCount,
        lastModifiedTime: trajectory.lastModifiedTime,
        status: trajectory.status,
        isEstimated: result.isEstimated,
        lastModelUsage: result.lastModelUsage,
        estimatedDeltaSinceCheckpoint: result.estimatedDeltaSinceCheckpoint,
        imageGenStepCount: result.imageGenStepCount,
        imageGenerationModels: result.imageGenerationModels || [],
        imageGenerationIncomplete: false,
        imageWorkflow: { directStepCount: result.imageGenStepCount, directModels: result.imageGenerationModels || [],
            linkedCascadeIds: result.linkedSubagentCascadeIds || [] },
        compressionDetected: result.checkpointCompressionDetected,
        checkpointCompressionDrop: result.checkpointCompressionDrop,
        hasGaps: result.hasGaps,
        checkpointModel: result.checkpointModel,
        ...(result.orchestratorConfig ? { orchestratorConfig: result.orchestratorConfig } : {}),
        ...(result.orchestratorHistory ? { orchestratorHistory: result.orchestratorHistory } : {}),
        // Extended transparency fields
        createdTime: trajectory.createdTime,
        lastUserInputTime: trajectory.lastUserInputTime,
        lastUserInputStepIndex: trajectory.lastUserInputStepIndex,
        repositoryName: trajectory.repositoryName,
        gitOriginUrl: trajectory.gitOriginUrl,
        branchName: trajectory.branchName,
        gitRootUri: trajectory.gitRootUri,
    };
    return refreshWorkflowImageUsage(ls, usage, signal);
}
//# sourceMappingURL=tracker.js.map