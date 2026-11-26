"use strict";
// ─── GM Parser ───────────────────────────────────────────────────────────────
// Parsing helpers, prompt extraction, and entry builder for GM data.
Object.defineProperty(exports, "__esModule", { value: true });
exports.deduplicateApiErrorText = deduplicateApiErrorText;
exports.parseDuration = parseDuration;
exports.parseInt0 = parseInt0;
exports.uniqueStrings = uniqueStrings;
exports.pickPromptSnippet = pickPromptSnippet;
exports.extractUserMessageAnchors = extractUserMessageAnchors;
exports.extractCheckpointSummaries = extractCheckpointSummaries;
exports.extractAISnippetsByStep = extractAISnippetsByStep;
exports.extractToolCallsByStep = extractToolCallsByStep;
exports.extractSystemContextItems = extractSystemContextItems;
exports.extractPromptData = extractPromptData;
exports.extractTrajectoryModelHints = extractTrajectoryModelHints;
exports.isValidCallTimestamp = isValidCallTimestamp;
exports.extractTrajectoryOrchestratorRoutes = extractTrajectoryOrchestratorRoutes;
exports.applyTrajectoryModelHints = applyTrajectoryModelHints;
exports.buildGMMatchKey = buildGMMatchKey;
exports.buildGMArchiveKey = buildGMArchiveKey;
exports.mergeGMCallEntries = mergeGMCallEntries;
exports.maybeEnrichCallsFromTrajectory = maybeEnrichCallsFromTrajectory;
exports.shouldEnrichConversation = shouldEnrichConversation;
exports.parseGMEntry = parseGMEntry;
exports.extractCheckpointsFromTrajectorySteps = extractCheckpointsFromTrajectorySteps;
const models_1 = require("../models");
// ─── Primitive Parsers ───────────────────────────────────────────────────────
/**
 * Clean API-duplicated error text: "MSG: MSG" → "MSG".
 * The server sometimes returns the same error text doubled with ": " separator.
 * Scans all ": " positions to find the split point where both halves match.
 * Covers patterns like "msg.: msg.", "server: UNAVAILABLE...", "canceled: request..." etc.
 */
function deduplicateApiErrorText(msg) {
    let sf = 0;
    while (sf < msg.length) {
        const si = msg.indexOf(': ', sf);
        if (si < 0 || si >= msg.length - 2) {
            break;
        }
        const first = msg.substring(0, si);
        const second = msg.substring(si + 2);
        if (first === second) {
            return first;
        }
        sf = si + 2;
    }
    return msg;
}
function parseDuration(s) {
    if (typeof s === 'number') {
        return s;
    }
    if (!s || typeof s !== 'string') {
        return 0;
    }
    const n = parseFloat(s.replace('s', ''));
    return isNaN(n) ? 0 : n;
}
function parseInt0(s) {
    if (typeof s === 'number') {
        return Math.round(s);
    }
    if (!s) {
        return 0;
    }
    const n = parseInt(String(s), 10);
    return isNaN(n) ? 0 : n;
}
/** Capacity is a positive, exact token count; malformed telemetry is unknown. */
function parseContextCapacity(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
        return 0;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}
function uniqueStrings(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        out.push(value);
    }
    return out;
}
// ─── Prompt Extraction ───────────────────────────────────────────────────────
function collectStringLeaves(value, prefix, out, depth = 0) {
    if (depth > 4 || value === null || value === undefined) {
        return;
    }
    if (typeof value === 'string') {
        const trimmed = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (trimmed.length > 0) {
            out.push({ path: prefix, value: trimmed });
        }
        return;
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < Math.min(value.length, 6); i++) {
            collectStringLeaves(value[i], `${prefix}[${i}]`, out, depth + 1);
        }
        return;
    }
    if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            collectStringLeaves(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
        }
    }
}
function tokenizePromptPath(path) {
    return path
        .toLowerCase()
        .replace(/\[\d+\]/g, '.')
        .split('.')
        .filter(Boolean);
}
function isInternalPromptValue(value) {
    const clean = value.trim();
    return /^bot-[0-9a-f-]{8,}$/i.test(clean)
        || /^toolu_[a-z0-9_-]{8,}$/i.test(clean)
        || /^req_vrtx_[a-z0-9_-]{8,}$/i.test(clean)
        || /^session-[0-9a-f-]{8,}$/i.test(clean);
}
function pickPromptSnippet(value) {
    const strings = [];
    collectStringLeaves(value, '', strings);
    if (strings.length === 0) {
        return '';
    }
    const preferred = [
        'text',
        'content',
        'prompt',
        'summary',
        'query',
        'command',
        'task',
        'title',
        'message',
        'description',
    ];
    const filtered = strings
        .filter(entry => {
        const lowerPath = entry.path.toLowerCase();
        const lowerValue = entry.value.toLowerCase();
        const pathTokens = tokenizePromptPath(lowerPath);
        const hasPreferredPath = preferred.some(token => pathTokens.some(part => part.includes(token)));
        if (lowerPath.includes('systemprompt')) {
            return false;
        }
        if (lowerPath.includes('checksum')) {
            return false;
        }
        if (pathTokens.some(part => part === 'messageid' || part === 'responseid' || part === 'sessionid' || part === 'executionid')) {
            return false;
        }
        if (lowerValue.startsWith('http://') || lowerValue.startsWith('https://')) {
            return false;
        }
        if (isInternalPromptValue(entry.value)) {
            return false;
        }
        if (!hasPreferredPath) {
            return false;
        }
        return entry.value.length >= 8;
    })
        .sort((a, b) => {
        const aScore = preferred.findIndex(token => a.path.toLowerCase().includes(token));
        const bScore = preferred.findIndex(token => b.path.toLowerCase().includes(token));
        const aRank = aScore === -1 ? 999 : aScore;
        const bRank = bScore === -1 ? 999 : bScore;
        if (aRank !== bRank) {
            return aRank - bRank;
        }
        return b.value.length - a.value.length;
    });
    return filtered[0]?.value || '';
}
// ─── User & AI Message Extraction ────────────────────────────────────────────
function cleanUserPromptText(prompt) {
    return prompt
        .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, ' ')
        .replace(/<USER_REQUEST>/gi, ' ')
        .replace(/<\/USER_REQUEST>/gi, ' ')
        .replace(/Step Id:\s*\d+/gi, ' ')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractUserMessageAnchors(messagePrompts) {
    const anchors = [];
    if (!Array.isArray(messagePrompts)) {
        return anchors;
    }
    for (const item of messagePrompts) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item;
        const source = String(rec.source || '');
        if (source !== 'CHAT_MESSAGE_SOURCE_USER') {
            continue;
        }
        const stepIdx = typeof rec.stepIdx === 'number' ? rec.stepIdx : -1;
        const prompt = String(rec.prompt || '');
        if (!prompt) {
            continue;
        }
        const cleaned = cleanUserPromptText(prompt);
        if (!cleaned || cleaned.length < 2) {
            continue;
        }
        const text = cleaned.length > 80 ? cleaned.substring(0, 77) + '...' : cleaned;
        anchors.push({ stepIndex: stepIdx, text });
    }
    return anchors;
}
/** Extract checkpoint summaries from {{ CHECKPOINT N }} messages in messagePrompts */
function extractCheckpointSummaries(messagePrompts) {
    const summaries = [];
    if (!Array.isArray(messagePrompts)) {
        return summaries;
    }
    for (let i = 0; i < messagePrompts.length; i++) {
        const item = messagePrompts[i];
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item;
        const source = String(rec.source || '');
        if (source !== 'CHAT_MESSAGE_SOURCE_USER') {
            continue;
        }
        const prompt = String(rec.prompt || '');
        const match = prompt.match(/\{\{\s*CHECKPOINT\s+(\d+)\s*\}\}/i);
        if (!match) {
            continue;
        }
        const checkpointNumber = parseInt(match[1], 10);
        const stepIndex = typeof rec.stepIdx === 'number' && rec.stepIdx >= 0
            ? rec.stepIdx
            : (100000 + i * 100 + checkpointNumber);
        const tokens = typeof rec.numTokens === 'number' ? rec.numTokens : 0;
        // Extract ONLY from {{ CHECKPOINT N }} onwards — skip system preamble
        // (user_information, MCP servers, user_rules, workflows etc.)
        const cpStart = prompt.indexOf(match[0]);
        let summaryText = prompt.substring(cpStart).trim();
        // Cap length to avoid bloating UI with huge context dumps
        const MAX_CP_TEXT = 8000;
        if (summaryText.length > MAX_CP_TEXT) {
            summaryText = summaryText.substring(0, MAX_CP_TEXT) + '\n\n... (truncated)';
        }
        summaries.push({ checkpointNumber, stepIndex, tokens, fullText: summaryText });
    }
    return summaries;
}
/**
 * Extract AI response snippets from SYSTEM messages in messagePrompts,
 * keyed by their stepIdx (a direct field on each message entry).
 * This allows each GM call to look up its OWN specific AI response text.
 *
 * For tool-call-only steps (no prompt text), stores tool names as the snippet.
 * Confirmed via live-watcher: each entry has { source, prompt, stepIdx, toolCalls, ... }
 */
function extractAISnippetsByStep(messagePrompts) {
    const snippets = {};
    if (!Array.isArray(messagePrompts)) {
        return snippets;
    }
    for (const item of messagePrompts) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item;
        const source = String(rec.source || '');
        if (source !== 'CHAT_MESSAGE_SOURCE_SYSTEM') {
            continue;
        }
        const stepIdx = typeof rec.stepIdx === 'number' ? rec.stepIdx : -1;
        if (stepIdx < 0) {
            continue;
        }
        const prompt = String(rec.prompt || '');
        // Extract tool call names from SYSTEM message
        const toolCalls = rec.toolCalls;
        const toolNames = Array.isArray(toolCalls)
            ? toolCalls.map(tc => String(tc.name || '')).filter(n => n.length > 0)
            : [];
        // Clean prompt text
        const cleaned = prompt.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        const isToolResult = /^(File Path:|No results found|The command completed|Created file|The following changes)/i.test(cleaned);
        if (cleaned.length >= 1 && !isToolResult) {
            // Has meaningful text
            if (toolNames.length > 0) {
                const textPart = cleaned.length > 80 ? cleaned.substring(0, 77) + '...' : cleaned;
                snippets[stepIdx] = `${textPart}  🔧${toolNames.slice(0, 3).join(', ')}`;
            }
            else {
                snippets[stepIdx] = cleaned.length > 120 ? cleaned.substring(0, 117) + '...' : cleaned;
            }
        }
        else if (toolNames.length > 0) {
            // No text but has tool calls
            snippets[stepIdx] = `🔧 ${toolNames.join(', ')}`;
        }
    }
    return snippets;
}
/**
 * Extract AI-invoked tool call names from SYSTEM messages in messagePrompts,
 * keyed by stepIdx. Each entry contains the tool names the AI decided to call
 * at that particular step. Used for tool call frequency statistics.
 */
function extractToolCallsByStep(messagePrompts) {
    const result = {};
    if (!Array.isArray(messagePrompts)) {
        return result;
    }
    for (const item of messagePrompts) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item;
        if (String(rec.source || '') !== 'CHAT_MESSAGE_SOURCE_SYSTEM') {
            continue;
        }
        const stepIdx = typeof rec.stepIdx === 'number' ? rec.stepIdx : -1;
        if (stepIdx < 0) {
            continue;
        }
        const toolCalls = rec.toolCalls;
        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            continue;
        }
        const names = toolCalls.map(tc => String(tc.name || '')).filter(n => n.length > 0);
        if (names.length > 0) {
            result[stepIdx] = names;
        }
    }
    return result;
}
// ─── System Context Item Extraction ──────────────────────────────────────────
/** Classify a USER message from messagePrompts as a system context type */
function classifySystemContext(prompt) {
    const trimmed = prompt.trim();
    // Checkpoint messages
    if (/\{\{\s*CHECKPOINT\s+\d+\s*\}\}/i.test(trimmed)) {
        const cpMatch = trimmed.match(/CHECKPOINT\s+(\d+)/);
        return { type: 'checkpoint', label: cpMatch ? `Checkpoint ${cpMatch[1]}` : 'Checkpoint' };
    }
    // Conversation History injection
    if (trimmed.startsWith('# Conversation History')) {
        return { type: 'context_injection', label: 'Conversation History' };
    }
    // User information
    if (trimmed.startsWith('<user_information>') || /^The USER's OS version is/i.test(trimmed)) {
        return { type: 'user_info', label: 'User Information' };
    }
    // User rules
    if (trimmed.startsWith('<user_rules>') || /<MEMORY\[/i.test(trimmed)) {
        return { type: 'user_rules', label: 'User Rules' };
    }
    // MCP servers
    if (trimmed.startsWith('<mcp_servers>')) {
        return { type: 'mcp_servers', label: 'MCP Servers' };
    }
    // Workflows
    if (trimmed.startsWith('<workflows>')) {
        return { type: 'workflows', label: 'Workflows' };
    }
    // Artifacts path
    if (trimmed.startsWith('<artifacts>') || /^Artifact Directory Path:/i.test(trimmed)) {
        return { type: 'artifacts', label: 'Artifacts' };
    }
    // EPHEMERAL_MESSAGE
    if (trimmed.startsWith('The following is an <EPHEMERAL_MESSAGE>') || trimmed.startsWith('<EPHEMERAL_MESSAGE>')) {
        return { type: 'ephemeral', label: 'Ephemeral Message' };
    }
    // Step Id preamble (system-injected turn header)
    if (/^Step Id:\s*\d+$/m.test(trimmed) && !/<USER_REQUEST>/.test(trimmed)) {
        return { type: 'system_preamble', label: 'System Preamble' };
    }
    return null;
}
/** Extract all system-injected context items from USER messages in messagePrompts */
function extractSystemContextItems(messagePrompts) {
    const items = [];
    if (!Array.isArray(messagePrompts)) {
        return items;
    }
    for (let i = 0; i < messagePrompts.length; i++) {
        const item = messagePrompts[i];
        if (!item || typeof item !== 'object') {
            continue;
        }
        const rec = item;
        const source = String(rec.source || '');
        if (source !== 'CHAT_MESSAGE_SOURCE_USER') {
            continue;
        }
        const prompt = String(rec.prompt || '');
        if (!prompt) {
            continue;
        }
        const classification = classifySystemContext(prompt);
        if (!classification) {
            continue;
        }
        // For checkpoints, extract the number
        let checkpointNumber;
        if (classification.type === 'checkpoint') {
            const cpMatch = prompt.match(/CHECKPOINT\s+(\d+)/);
            checkpointNumber = cpMatch ? parseInt(cpMatch[1], 10) : undefined;
        }
        const stepIdx = typeof rec.stepIdx === 'number' && rec.stepIdx >= 0
            ? rec.stepIdx
            : (100000 + i * 100 + (checkpointNumber !== undefined ? checkpointNumber : 0));
        const tokens = typeof rec.numTokens === 'number' ? rec.numTokens : 0;
        // Cap full text to avoid UI bloat
        const MAX_TEXT = 12000;
        const fullText = prompt.length > MAX_TEXT
            ? prompt.substring(0, MAX_TEXT) + '\n\n... (truncated)'
            : prompt;
        items.push({
            type: classification.type,
            stepIndex: stepIdx,
            tokens,
            label: classification.label,
            fullText,
            checkpointNumber,
        });
    }
    return items;
}
function extractPromptData(cm) {
    const messagePrompts = cm.messagePrompts;
    const messageMetadata = cm.messageMetadata;
    const responseHeader = cm.responseHeader;
    const userMessageAnchors = extractUserMessageAnchors(messagePrompts);
    const aiSnippetsByStep = extractAISnippetsByStep(messagePrompts);
    const checkpointSummaries = extractCheckpointSummaries(messagePrompts);
    const toolCallsByStep = extractToolCallsByStep(messagePrompts);
    const systemContextItems = extractSystemContextItems(messagePrompts);
    const fromPrompts = pickPromptSnippet(messagePrompts);
    if (fromPrompts) {
        return {
            promptSnippet: fromPrompts,
            promptSource: 'messagePrompts',
            messagePromptCount: Array.isArray(messagePrompts) ? messagePrompts.length : 0,
            messageMetadataKeys: messageMetadata && typeof messageMetadata === 'object' && !Array.isArray(messageMetadata)
                ? Object.keys(messageMetadata)
                : [],
            responseHeaderKeys: responseHeader && typeof responseHeader === 'object' && !Array.isArray(responseHeader)
                ? Object.keys(responseHeader)
                : [],
            userMessageAnchors,
            aiSnippetsByStep,
            checkpointSummaries,
            toolCallsByStep,
            systemContextItems,
        };
    }
    const fromMetadata = pickPromptSnippet(messageMetadata);
    return {
        promptSnippet: fromMetadata,
        promptSource: fromMetadata ? 'messageMetadata' : 'none',
        messagePromptCount: Array.isArray(messagePrompts) ? messagePrompts.length : 0,
        messageMetadataKeys: messageMetadata && typeof messageMetadata === 'object' && !Array.isArray(messageMetadata)
            ? Object.keys(messageMetadata)
            : [],
        responseHeaderKeys: responseHeader && typeof responseHeader === 'object' && !Array.isArray(responseHeader)
            ? Object.keys(responseHeader)
            : [],
        userMessageAnchors,
        aiSnippetsByStep,
        checkpointSummaries,
        toolCallsByStep,
        systemContextItems,
    };
}
// ─── Entry Parsing & Enrichment ──────────────────────────────────────────────
function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
function readPath(root, path) {
    let current = root;
    for (const key of path) {
        const rec = asRecord(current);
        if (!rec) {
            return undefined;
        }
        current = rec[key];
    }
    return current;
}
function cleanModelCandidate(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function isUnspecifiedModelId(modelId) {
    const upper = modelId.trim().toUpperCase();
    return !upper || upper === 'MODEL_UNSPECIFIED' || upper === 'MODEL_PLACEHOLDER_UNSPECIFIED';
}
function resolveConcreteModelId(value) {
    const raw = cleanModelCandidate(value);
    if (!raw) {
        return '';
    }
    const resolved = (0, models_1.resolveModelId)(raw) || raw;
    if (isUnspecifiedModelId(resolved)) {
        return '';
    }
    return resolved.startsWith('MODEL_') ? resolved : '';
}
function isConcreteModelId(modelId) {
    return !!modelId && !!resolveConcreteModelId(modelId);
}
function readModelFromUnknown(value) {
    const direct = resolveConcreteModelId(value);
    if (direct) {
        return direct;
    }
    const rec = asRecord(value);
    return rec ? resolveConcreteModelId(rec.model) : '';
}
function pickParsedModel(rawModelId, responseModel) {
    const directModelId = resolveConcreteModelId(rawModelId);
    if (directModelId) {
        if (responseModel) {
            (0, models_1.registerResponseModelAlias)(responseModel, directModelId);
        }
        return { model: directModelId, modelSource: 'chatModel' };
    }
    const responseAliasModel = resolveConcreteModelId(responseModel);
    if (responseAliasModel) {
        return { model: responseAliasModel, modelSource: 'responseAlias' };
    }
    return { model: '', modelSource: 'unknown' };
}
function shouldUseFallbackModel(primary, fallback) {
    if (!isConcreteModelId(fallback.model)) {
        return false;
    }
    if (!isConcreteModelId(primary.model)) {
        return true;
    }
    const primaryLowTrust = primary.modelSource === 'responseAlias' || primary.modelSource === 'unknown';
    const fallbackHighTrust = fallback.modelSource === 'chatModel' || fallback.modelSource === 'trajectory';
    return primaryLowTrust && fallbackHighTrust;
}
function extractTrajectoryModelHints(steps) {
    const hints = new Map();
    if (!Array.isArray(steps)) {
        return hints;
    }
    for (let i = 0; i < steps.length; i++) {
        const step = asRecord(steps[i]);
        if (!step) {
            continue;
        }
        const stepIndex = typeof step.stepIndex === 'number' && step.stepIndex >= 0
            ? step.stepIndex
            : i;
        const candidates = [
            readPath(step, ['metadata', 'requestedModel']),
            readPath(step, ['metadata', 'requestedModel', 'model']),
            readPath(step, ['metadata', 'generatorModel']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'requestedModel']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'requestedModel', 'model']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'planModel']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'modelName']),
        ];
        const model = candidates.map(readModelFromUnknown).find(Boolean);
        if (model && !hints.has(stepIndex)) {
            hints.set(stepIndex, model);
        }
    }
    return hints;
}
function pickTrajectoryModelForCall(call, hints) {
    const counts = new Map();
    for (const stepIdx of call.stepIndices) {
        const model = hints.get(stepIdx);
        if (model) {
            counts.set(model, (counts.get(model) || 0) + 1);
        }
    }
    if (counts.size === 0 && call.startStepIndex >= 0) {
        return hints.get(call.startStepIndex) || '';
    }
    let bestModel = '';
    let bestCount = 0;
    for (const [model, count] of counts) {
        if (count > bestCount) {
            bestModel = model;
            bestCount = count;
        }
    }
    return bestModel;
}
/** A call date must come from telemetry, never the time an old conversation reloads. */
function isValidCallTimestamp(value) {
    // Match dated pricing semantics, but call telemetry must include a time
    // and zone. Date.parse alone normalizes impossible days such as Nov 31.
    if (typeof value !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
        return false;
    }
    const day = value.slice(0, 10);
    const dayTime = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(dayTime) && new Date(dayTime).toISOString().slice(0, 10) === day
        && Number.isFinite(Date.parse(value));
}
function extractTrajectoryCallTimes(steps) {
    if (!Array.isArray(steps)) {
        return [];
    }
    return steps.flatMap((value, index) => {
        const step = asRecord(value);
        if (!step || step.type !== 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
            return [];
        }
        const metadata = asRecord(step.metadata);
        if (!metadata) {
            return [];
        }
        // The agent hub can publish startedAt at completion time. createdAt is
        // the request's creation time and must retain its original billing day.
        const timestamp = isValidCallTimestamp(metadata.createdAt) ? metadata.createdAt
            : isValidCallTimestamp(metadata.startedAt) ? metadata.startedAt : '';
        if (!timestamp) {
            return [];
        }
        const stepIndex = typeof step.stepIndex === 'number' && Number.isSafeInteger(step.stepIndex) && step.stepIndex >= 0
            ? step.stepIndex : index;
        const executionId = typeof metadata.executionId === 'string' ? metadata.executionId
            : typeof step.executionId === 'string' ? step.executionId : '';
        return [{ stepIndex, executionId, timestamp }];
    });
}
function pickTrajectoryTimeForCall(call, times) {
    const executionMatches = call.executionId ? times.filter(time => time.executionId === call.executionId) : [];
    // Orchestrator reuses one executionId across several planner calls. Intersect
    // that workflow identity with step identity before considering a unique-ID fallback.
    const executionSteps = executionMatches.filter(time => call.stepIndices.includes(time.stepIndex));
    const matches = executionMatches.length > 0
        ? (executionSteps.length > 0 ? executionSteps : call.stepIndices.length === 0 ? executionMatches : [])
        : times.filter(time => call.stepIndices.includes(time.stepIndex)
            && (!call.executionId || !time.executionId || call.executionId === time.executionId));
    // Multiple distinct planner timestamps are ambiguous. Do not assign a call
    // to a day merely because a nearby step happens to be the first in an array.
    const timestamps = new Set(matches.map(time => time.timestamp));
    return timestamps.size === 1 ? [...timestamps][0] : '';
}
/**
 * Extract chronological per-turn Orchestrator route segments from trajectory steps
 * (`USER_INPUT.userConfig.plannerConfig.{planModel, planExecuteConfig.executionModel}`).
 */
function extractTrajectoryOrchestratorRoutes(steps) {
    const routes = [];
    if (!Array.isArray(steps)) {
        return routes;
    }
    for (let i = 0; i < steps.length; i++) {
        const step = asRecord(steps[i]);
        if (!step || step.type !== 'CORTEX_STEP_TYPE_USER_INPUT') {
            continue;
        }
        const stepIndex = typeof step.stepIndex === 'number' && Number.isSafeInteger(step.stepIndex) && step.stepIndex >= 0
            ? step.stepIndex
            : i;
        const planCandidates = [
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'planModel']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'modelName']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'requestedModel']),
            readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'requestedModel', 'model']),
        ];
        const planModel = planCandidates.map(readModelFromUnknown).find(Boolean) || '';
        const executionModel = resolveConcreteModelId(readPath(step, ['userInput', 'userConfig', 'plannerConfig', 'planExecuteConfig', 'executionModel']));
        if (!planModel && !executionModel) {
            continue;
        }
        routes.push({ startStepIndex: stepIndex, planModel, executionModel });
    }
    return routes;
}
function findActiveRouteForCall(call, routes) {
    if (routes.length === 0) {
        return null;
    }
    const step = call.stepIndices.length > 0
        ? Math.min(...call.stepIndices)
        : (call.startStepIndex >= 0 ? call.startStepIndex : -1);
    if (step < 0) {
        return null;
    }
    let active = null;
    for (const r of routes) {
        if (r.startStepIndex <= step) {
            active = r;
        }
        else {
            break;
        }
    }
    return active;
}
function applyTrajectoryModelHints(calls, steps) {
    if (calls.length === 0) {
        return calls;
    }
    const hints = extractTrajectoryModelHints(steps);
    const times = calls.some(call => !isValidCallTimestamp(call.createdAt)) ? extractTrajectoryCallTimes(steps) : [];
    const routes = calls.some(call => !call.executionModel) ? extractTrajectoryOrchestratorRoutes(steps) : [];
    const hasDelegatedRoute = routes.some(r => Boolean(r.executionModel));
    let changed = false;
    const updated = calls.map(call => {
        let enriched = call;
        if (!isValidCallTimestamp(call.createdAt)) {
            const timestamp = pickTrajectoryTimeForCall(call, times);
            if (timestamp) {
                enriched = { ...enriched, createdAt: timestamp };
                changed = true;
            }
        }
        const hasAuthoritativeModel = isConcreteModelId(call.model)
            && call.modelSource !== 'responseAlias'
            && call.modelSource !== 'unknown';
        if (!hasAuthoritativeModel) {
            const model = pickTrajectoryModelForCall(call, hints);
            if (model && model !== call.model) {
                if (call.responseModel) {
                    (0, models_1.registerResponseModelAlias)(call.responseModel, model);
                }
                changed = true;
                enriched = {
                    ...enriched,
                    model,
                    modelDisplay: (0, models_1.normalizeModelDisplayName)(model),
                    modelSource: 'trajectory',
                };
            }
        }
        // Propagate per-turn plannerConfig.planExecuteConfig.executionModel onto
        // planner calls when lightweight GM metadata omitted plannerConfig.
        if (hasDelegatedRoute && !enriched.executionModel) {
            const route = findActiveRouteForCall(enriched, routes);
            if (route && route.executionModel) {
                const callModelId = resolveConcreteModelId(enriched.model);
                const matchesPlanner = !route.planModel || (callModelId && callModelId === route.planModel);
                if (matchesPlanner) {
                    enriched = { ...enriched, executionModel: route.executionModel };
                    changed = true;
                }
            }
        }
        return enriched;
    });
    return changed ? updated : calls;
}
function buildGMMatchKey(call) {
    if (call.executionId) {
        return `exec:${call.executionId}|steps:${[...new Set(call.stepIndices)].sort((a, b) => a - b).join(',')}`;
    }
    return `steps:${call.stepIndices.join(',')}|model:${call.responseModel || call.model}`;
}
function buildGMArchiveKey(call) {
    return `steps:${call.stepIndices.join(',')}|model:${call.responseModel || call.model}|created:${call.createdAt || ''}`;
}
function mergeGMCallEntries(primary, fallback) {
    const useFallbackPrompt = !primary.promptSnippet && !!fallback.promptSnippet;
    const useFallbackModel = shouldUseFallbackModel(primary, fallback);
    const mergedResponseModel = primary.responseModel || fallback.responseModel;
    const mergedModel = useFallbackModel ? fallback.model : primary.model;
    if (mergedResponseModel && mergedModel) {
        (0, models_1.registerResponseModelAlias)(mergedResponseModel, mergedModel);
    }
    return {
        ...primary,
        model: mergedModel,
        modelDisplay: useFallbackModel ? fallback.modelDisplay : primary.modelDisplay,
        modelSource: useFallbackModel ? fallback.modelSource : primary.modelSource,
        responseModel: mergedResponseModel,
        modelAccuracy: mergedResponseModel ? 'exact' : primary.modelAccuracy,
        systemPromptSnippet: primary.systemPromptSnippet || fallback.systemPromptSnippet,
        toolCount: Math.max(primary.toolCount, fallback.toolCount),
        toolNames: uniqueStrings([...primary.toolNames, ...fallback.toolNames]),
        promptSectionTitles: primary.promptSectionTitles.length >= fallback.promptSectionTitles.length
            ? primary.promptSectionTitles
            : fallback.promptSectionTitles,
        promptSnippet: useFallbackPrompt ? fallback.promptSnippet : primary.promptSnippet,
        promptSource: useFallbackPrompt ? fallback.promptSource : primary.promptSource,
        messagePromptCount: Math.max(primary.messagePromptCount, fallback.messagePromptCount),
        messageMetadataKeys: primary.messageMetadataKeys.length > 0
            ? primary.messageMetadataKeys
            : fallback.messageMetadataKeys,
        responseHeaderKeys: primary.responseHeaderKeys.length > 0
            ? primary.responseHeaderKeys
            : fallback.responseHeaderKeys,
        userMessageAnchors: primary.userMessageAnchors.length > 0
            ? primary.userMessageAnchors
            : fallback.userMessageAnchors,
        aiSnippetsByStep: Object.keys(primary.aiSnippetsByStep).length > 0
            ? primary.aiSnippetsByStep
            : fallback.aiSnippetsByStep,
        checkpointSummaries: primary.checkpointSummaries.length > 0
            ? primary.checkpointSummaries
            : fallback.checkpointSummaries,
        systemContextItems: primary.systemContextItems.length > 0
            ? primary.systemContextItems
            : fallback.systemContextItems,
        toolCallsByStep: Object.keys(primary.toolCallsByStep).length > 0
            ? primary.toolCallsByStep
            : fallback.toolCallsByStep,
        stopReason: primary.stopReason || fallback.stopReason,
        createdAt: isValidCallTimestamp(primary.createdAt) ? primary.createdAt
            : isValidCallTimestamp(fallback.createdAt) ? fallback.createdAt : primary.createdAt || fallback.createdAt,
        latestStableMessageIndex: primary.latestStableMessageIndex || fallback.latestStableMessageIndex,
        startStepIndex: primary.startStepIndex || fallback.startStepIndex,
        checkpointIndex: primary.checkpointIndex || fallback.checkpointIndex,
        ...(primary.executionModel || fallback.executionModel
            ? { executionModel: primary.executionModel || fallback.executionModel } : {}),
        ...(primary.modelDisplayName || fallback.modelDisplayName
            ? { modelDisplayName: primary.modelDisplayName || fallback.modelDisplayName } : {}),
    };
}
function maybeEnrichCallsFromTrajectory(calls, embeddedCalls) {
    if (calls.length === 0 || embeddedCalls.length === 0) {
        return calls;
    }
    const embeddedByKey = new Map();
    for (const call of embeddedCalls) {
        const key = buildGMMatchKey(call);
        embeddedByKey.set(key, [...(embeddedByKey.get(key) || []), call]);
    }
    const merged = calls.map(call => {
        const exact = embeddedByKey.get(buildGMMatchKey(call)) || [];
        const hasCallIdentity = call.stepIndices.length > 0 || (call.executionId
            && calls.filter(candidate => candidate.executionId === call.executionId).length === 1);
        let embedded = exact.length === 1 && hasCallIdentity ? exact[0] : undefined;
        if (!embedded && exact.length === 0 && call.executionId) {
            const candidates = embeddedCalls.filter(candidate => candidate.executionId === call.executionId);
            const overlapping = candidates.filter(candidate => candidate.stepIndices.some(index => call.stepIndices.includes(index)));
            if (overlapping.length === 1) {
                embedded = overlapping[0];
            }
            // Older payloads may omit steps. An execution ID is sufficient only
            // when it identifies one call on both sides, never an entire workflow.
            else if (candidates.length === 1 && calls.filter(candidate => candidate.executionId === call.executionId).length === 1
                && (call.stepIndices.length === 0 || candidates[0].stepIndices.length === 0)) {
                embedded = candidates[0];
            }
        }
        return embedded ? mergeGMCallEntries(call, embedded) : call;
    });
    // Broadcast: only ONE embedded call typically has messagePrompts (→ aiSnippetsByStep).
    // Share the richest map across ALL calls so each can look up its own AI snippet.
    let richestSnippets = {};
    for (const call of [...merged, ...embeddedCalls]) {
        if (Object.keys(call.aiSnippetsByStep).length > Object.keys(richestSnippets).length) {
            richestSnippets = call.aiSnippetsByStep;
        }
    }
    if (Object.keys(richestSnippets).length > 0) {
        for (const call of merged) {
            if (Object.keys(call.aiSnippetsByStep).length < Object.keys(richestSnippets).length) {
                call.aiSnippetsByStep = richestSnippets;
            }
        }
    }
    // Broadcast: checkpoint summaries are conversation-level data.
    // Only ONE embedded call has messagePrompts → only that call has checkpointSummaries.
    // Share the richest set across ALL calls so deduplication at conversation level works.
    let richestCheckpoints = [];
    for (const call of [...merged, ...embeddedCalls]) {
        if (call.checkpointSummaries.length > richestCheckpoints.length) {
            richestCheckpoints = call.checkpointSummaries;
        }
    }
    if (richestCheckpoints.length > 0) {
        for (const call of merged) {
            if (call.checkpointSummaries.length < richestCheckpoints.length) {
                call.checkpointSummaries = richestCheckpoints;
            }
        }
    }
    // Broadcast: toolCallsByStep for tool invocation statistics.
    let richestToolCalls = {};
    for (const call of [...merged, ...embeddedCalls]) {
        if (Object.keys(call.toolCallsByStep).length > Object.keys(richestToolCalls).length) {
            richestToolCalls = call.toolCallsByStep;
        }
    }
    if (Object.keys(richestToolCalls).length > 0) {
        for (const call of merged) {
            if (Object.keys(call.toolCallsByStep).length < Object.keys(richestToolCalls).length) {
                call.toolCallsByStep = richestToolCalls;
            }
        }
    }
    // Broadcast: userMessageAnchors for user message timeline events.
    // Only ONE embedded call has messagePrompts → only that call has real anchors.
    // Share the richest set across ALL calls so injectGMData() can find them.
    let richestUserAnchors = [];
    for (const call of [...merged, ...embeddedCalls]) {
        if (call.userMessageAnchors.length > richestUserAnchors.length) {
            richestUserAnchors = call.userMessageAnchors;
        }
    }
    if (richestUserAnchors.length > 0) {
        for (const call of merged) {
            if (call.userMessageAnchors.length < richestUserAnchors.length) {
                call.userMessageAnchors = richestUserAnchors;
            }
        }
    }
    // Broadcast: systemContextItems for Context Intelligence viewer.
    let richestContextItems = [];
    for (const call of [...merged, ...embeddedCalls]) {
        if (call.systemContextItems.length > richestContextItems.length) {
            richestContextItems = call.systemContextItems;
        }
    }
    if (richestContextItems.length > 0) {
        for (const call of merged) {
            if (call.systemContextItems.length < richestContextItems.length) {
                call.systemContextItems = richestContextItems;
            }
        }
    }
    return merged;
}
function shouldEnrichConversation(stepCount, calls) {
    if (calls.some(call => !isValidCallTimestamp(call.createdAt))) {
        return true;
    }
    if (calls.some(call => call.modelAccuracy === 'placeholder')) {
        return true;
    }
    if (calls.some(call => !isConcreteModelId(call.model) || call.modelSource === 'responseAlias' || call.modelSource === 'unknown')) {
        return true;
    }
    // Conversations with checkpoints have been context-compressed;
    // enrichment is needed to extract checkpoint summaries from messagePrompts
    // (only available in GetCascadeTrajectory, not the lightweight GM metadata API).
    if (calls.some(call => call.checkpointIndex > 0)) {
        return true;
    }
    // GetCascadeTrajectoryGeneratorMetadata (lightweight API) does NOT include
    // messagePrompts, so userMessageAnchors will always be empty without enrichment.
    // Trigger enrichment when calls exist but no user anchors were found — this
    // ensures the first user prompt and system injections (Conversation History)
    // are captured in the timeline for new/short conversations.
    if (calls.length > 0 && calls.every(call => call.userMessageAnchors.length === 0)) {
        return true;
    }
    return stepCount >= 350;
}
function parseCompletionConfig(cc) {
    if (!cc || typeof cc !== 'object') {
        return null;
    }
    const stopPatterns = cc.stopPatterns;
    return {
        maxTokens: parseInt0(cc.maxTokens),
        temperature: typeof cc.temperature === 'number' ? cc.temperature : 0,
        firstTemperature: typeof cc.firstTemperature === 'number' ? cc.firstTemperature : 0,
        topK: parseInt0(cc.topK),
        topP: typeof cc.topP === 'number' ? cc.topP : 0,
        numCompletions: parseInt0(cc.numCompletions),
        stopPatternCount: Array.isArray(stopPatterns) ? stopPatterns.length : 0,
    };
}
function parseGMEntry(gm) {
    const cm = (gm.chatModel || {});
    const usage = (cm.usage || {});
    const csm = (cm.chatStartMetadata || {});
    const cwm = (csm.contextWindowMetadata || {});
    // Credits
    let credits = 0;
    let creditType = '';
    const consumedCredits = cm.consumedCredits;
    if (Array.isArray(consumedCredits) && consumedCredits.length > 0) {
        credits = parseInt0(consumedCredits[0].creditAmount);
        creditType = consumedCredits[0].creditType || '';
    }
    const responseModel = cleanModelCandidate(cm.responseModel);
    const parsedModel = pickParsedModel(cm.model, responseModel);
    const modelId = parsedModel.model;
    const modelAccuracy = responseModel ? 'exact' : 'placeholder';
    // Model DNA fields
    const completionConfig = parseCompletionConfig(cm.completionConfig);
    const systemPrompt = cm.systemPrompt || '';
    const systemPromptSnippet = systemPrompt.length > 120
        ? systemPrompt.substring(0, 120) + '...'
        : systemPrompt;
    const tools = cm.tools || [];
    const toolNames = tools.map(t => t.name || '?');
    const promptSections = cm.promptSections || [];
    const promptSectionTitles = promptSections.map(p => p.title || '?');
    const promptData = extractPromptData(cm);
    const errorMessage = gm.error || '';
    // ── retryInfos aggregation ─────────────────────────────────────────────
    // IMPORTANT: cm.retries is "total attempts" (includes the successful one),
    // NOT "failed retry count". E.g. retries=1 means first-try success (0 failures).
    // We derive the TRUE retry count from retryInfos entries that have an error field.
    let retryTokensIn = 0, retryTokensOut = 0, retryCredits = 0;
    const retryErrors = [];
    const retryInfos = cm.retryInfos;
    if (Array.isArray(retryInfos)) {
        for (const ri of retryInfos) {
            let errMsg = ri.error;
            if (!errMsg) {
                continue;
            } // Skip successful attempt entry
            // API bug cleanup: server sometimes doubles the error text as "MSG: MSG"
            errMsg = deduplicateApiErrorText(errMsg);
            retryErrors.push(errMsg);
            const ru = (ri.usage || {});
            retryTokensIn += parseInt0(ru.inputTokens);
            retryTokensOut += parseInt0(ru.outputTokens);
            const rCredits = ri.consumedCredits;
            if (Array.isArray(rCredits)) {
                for (const rc of rCredits) {
                    retryCredits += parseInt0(rc.creditAmount);
                }
            }
        }
    }
    // retries = number of FAILED attempts (entries with errors in retryInfos).
    // Fallback: if no retryInfos but cm.retries > 1, use cm.retries - 1 (subtract the successful attempt).
    const cmRetries = parseInt0(cm.retries);
    let retries = retryErrors.length;
    if ((!Array.isArray(retryInfos) || retryInfos.length === 0) && retries === 0 && cmRetries > 1) {
        retries = cmRetries - 1;
    }
    // ── stopReason ─────────────────────────────────────────────────────────
    const stopReason = cm.stopReason || '';
    // ── timeSinceLastInvocation ────────────────────────────────────────────
    const timeSinceLastInvocation = parseDuration(csm.timeSinceLastInvocation);
    // ── tokenBreakdown groups ─────────────────────────────────────────────
    const tokenBreakdownGroups = [];
    const tb = (cwm.tokenBreakdown || {});
    const tbGroups = (tb.groups || []);
    for (const g of tbGroups) {
        const children = (g.children || []).map(c => ({
            name: c.name || '',
            tokens: typeof c.numTokens === 'number' ? c.numTokens : parseInt0(c.numTokens),
        }));
        tokenBreakdownGroups.push({
            name: g.name || '',
            type: g.type || '',
            tokens: typeof g.numTokens === 'number' ? g.numTokens : parseInt0(g.numTokens),
            children,
        });
    }
    // Legacy planner thresholds take precedence. The current agent hub omits
    // that field and reports the actual capacity in chat-start metadata.
    const pc = (gm.plannerConfig || {});
    const contextWindowCapacity = parseContextCapacity(pc.truncationThresholdTokens)
        || parseContextCapacity(cwm.maxContextTokens);
    const executionModel = resolveConcreteModelId(readPath(gm, ['plannerConfig', 'planExecuteConfig', 'executionModel']));
    const modelDisplayName = cleanModelCandidate(cm.modelDisplayName);
    return {
        stepIndices: gm.stepIndices || [],
        executionId: gm.executionId || '',
        model: modelId,
        modelDisplay: (0, models_1.normalizeModelDisplayName)(modelId || responseModel || cleanModelCandidate(cm.model)),
        responseModel,
        modelAccuracy,
        modelSource: parsedModel.modelSource,
        inputTokens: parseInt0(usage.inputTokens),
        outputTokens: parseInt0(usage.outputTokens),
        thinkingTokens: parseInt0(usage.thinkingOutputTokens),
        responseTokens: parseInt0(usage.responseOutputTokens),
        cacheReadTokens: parseInt0(usage.cacheReadTokens),
        cacheCreationTokens: parseInt0(usage.cacheCreationTokens),
        apiProvider: usage.apiProvider || '',
        ttftSeconds: parseDuration(cm.timeToFirstToken),
        streamingSeconds: parseDuration(cm.streamingDuration),
        credits,
        creditType,
        hasError: !!(errorMessage),
        errorMessage,
        contextTokensUsed: cwm?.estimatedTokensUsed || 0,
        completionConfig,
        systemPromptSnippet,
        toolCount: tools.length,
        toolNames,
        promptSectionTitles,
        promptSnippet: promptData.promptSnippet,
        promptSource: promptData.promptSource,
        messagePromptCount: promptData.messagePromptCount,
        messageMetadataKeys: promptData.messageMetadataKeys,
        responseHeaderKeys: promptData.responseHeaderKeys,
        userMessageAnchors: promptData.userMessageAnchors,
        aiSnippetsByStep: promptData.aiSnippetsByStep,
        retries,
        stopReason,
        retryTokensIn,
        retryTokensOut,
        retryCredits,
        retryErrors,
        timeSinceLastInvocation,
        tokenBreakdownGroups,
        createdAt: csm.createdAt || '',
        latestStableMessageIndex: parseInt0(csm.latestStableMessageIndex),
        startStepIndex: parseInt0(csm.startStepIndex),
        checkpointIndex: parseInt0(csm.checkpointIndex),
        checkpointSummaries: promptData.checkpointSummaries,
        systemContextItems: promptData.systemContextItems,
        toolCallsByStep: promptData.toolCallsByStep,
        contextWindowCapacity,
        ...(executionModel ? { executionModel } : {}),
        ...(modelDisplayName ? { modelDisplayName } : {}),
    };
}
/** Extract checkpoint summaries directly from CORTEX_STEP_TYPE_CHECKPOINT steps in trajectory */
function extractCheckpointsFromTrajectorySteps(steps) {
    const summaries = [];
    if (!Array.isArray(steps)) {
        return summaries;
    }
    let checkpointSeq = 1;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step || typeof step !== 'object') {
            continue;
        }
        const stepType = String(step.type || '');
        if (!stepType.includes('CHECKPOINT')) {
            continue;
        }
        const cp = step.checkpoint;
        if (!cp) {
            continue;
        }
        const meta = (step.metadata || {});
        const modelUsage = (meta.modelUsage || {});
        const inTok = typeof modelUsage.inputTokens === 'number' ? modelUsage.inputTokens : parseInt(String(modelUsage.inputTokens || '0'), 10);
        // 提取 checkpoint 编号，如果拿不到就按出现顺序自增
        let checkpointNumber = typeof cp.checkpointIndex === 'number' ? cp.checkpointIndex : undefined;
        if (checkpointNumber === undefined && cp.intentOnly === true) {
            checkpointNumber = 0; // 第0次，生成意图
        }
        else if (checkpointNumber === undefined) {
            checkpointNumber = checkpointSeq++;
        }
        // 拼装比以前还要精美详细的 fullText！
        const userIntent = cp.userIntent ? String(cp.userIntent) : '';
        const sessionSummary = cp.sessionSummary ? String(cp.sessionSummary) : '';
        const userRequests = cp.userRequests;
        const fileDiffs = cp.trajectoryFileDiffs;
        let formattedText = ``;
        if (cp.intentOnly === true) {
            formattedText += `### 意图与摘要生成 (Intent Only)\n`;
        }
        else {
            formattedText += `### 上下文压缩 (Full Checkpoint)\n`;
        }
        if (userIntent) {
            formattedText += `**所含意图 (Intent)**:\n${userIntent}\n\n`;
        }
        if (sessionSummary) {
            formattedText += `**会话总结 (Session Summary)**:\n${sessionSummary}\n\n`;
        }
        if (userRequests) {
            const reqs = Array.isArray(userRequests) ? userRequests : [String(userRequests)];
            if (reqs.length > 0) {
                formattedText += `**所含请求 (Requests)**:\n${reqs.map(r => `- ${r}`).join('\n')}\n\n`;
            }
        }
        if (fileDiffs && fileDiffs.length > 0) {
            formattedText += `**代码文件变更 (File Diffs)**:\n`;
            for (const fd of fileDiffs) {
                const fPath = fd.filePath || fd.path || '';
                if (fPath) {
                    formattedText += `- ${fPath}\n`;
                }
            }
        }
        const stepIndex = typeof step.stepIndex === 'number' && step.stepIndex >= 0
            ? step.stepIndex
            : (100000 + i * 100 + checkpointNumber);
        summaries.push({
            checkpointNumber,
            stepIndex,
            tokens: inTok > 0 ? inTok : (typeof cp.tokens === 'number' ? cp.tokens : 0),
            fullText: formattedText.trim()
        });
    }
    return summaries.sort((a, b) => a.checkpointNumber - b.checkpointNumber);
}
//# sourceMappingURL=parser.js.map