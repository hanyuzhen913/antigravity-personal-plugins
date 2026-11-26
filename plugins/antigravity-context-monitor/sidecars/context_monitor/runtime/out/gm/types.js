"use strict";
// ─── GM Types ────────────────────────────────────────────────────────────────
// All type definitions for GM (Generator Metadata) tracking.
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneTokenBreakdownGroups = cloneTokenBreakdownGroups;
exports.cloneGMCallEntry = cloneGMCallEntry;
exports.cloneConversationData = cloneConversationData;
exports.slimCallForPersistence = slimCallForPersistence;
exports.slimSummaryForPersistence = slimSummaryForPersistence;
exports.slimConversationForPersistence = slimConversationForPersistence;
// ─── Clone Utilities ─────────────────────────────────────────────────────────
function cloneTokenBreakdownGroups(groups) {
    return groups.map(group => ({
        ...group,
        children: group.children.map(child => ({ ...child })),
    }));
}
function cloneGMCallEntry(call) {
    return {
        ...call,
        stepIndices: [...call.stepIndices],
        toolNames: [...call.toolNames],
        promptSectionTitles: [...call.promptSectionTitles],
        messageMetadataKeys: [...call.messageMetadataKeys],
        responseHeaderKeys: [...call.responseHeaderKeys],
        userMessageAnchors: call.userMessageAnchors.map(anchor => ({ ...anchor })),
        retryErrors: [...call.retryErrors],
        tokenBreakdownGroups: cloneTokenBreakdownGroups(call.tokenBreakdownGroups),
        completionConfig: call.completionConfig ? { ...call.completionConfig } : null,
        checkpointSummaries: call.checkpointSummaries.map(cs => ({ ...cs })),
        systemContextItems: call.systemContextItems.map(ci => ({ ...ci })),
        toolCallsByStep: Object.fromEntries(Object.entries(call.toolCallsByStep).map(([k, v]) => [k, [...v]])),
    };
}
function cloneConversationData(conversation) {
    return {
        ...conversation,
        calls: conversation.calls.map(cloneGMCallEntry),
        checkpointSummaries: conversation.checkpointSummaries.map(cs => ({ ...cs })),
        systemContextItems: conversation.systemContextItems?.map(ci => ({ ...ci })),
    };
}
// ─── Persistence Slimming ────────────────────────────────────────────────────
// Strip heavy text/metadata fields at the serialization boundary.
// Runtime data in memory is unaffected — only the on-disk JSON gets slimmed.
// Heavy fields (chat content, prompt snippets, checkpoint full text, breakdown
// trees, tool name lists, etc.) are re-fetched from the LS API on next startup.
/**
 * Strip a single GMCallEntry down to its billing/identification skeleton.
 * Drops: systemPromptSnippet, promptSnippet, userMessageAnchors, aiSnippetsByStep,
 *        checkpointSummaries[].fullText, tokenBreakdownGroups, toolNames,
 *        promptSectionTitles, retryErrors, messageMetadataKeys, responseHeaderKeys.
 */
function slimCallForPersistence(call) {
    return {
        stepIndices: call.stepIndices,
        executionId: call.executionId,
        model: call.model,
        modelDisplay: call.modelDisplay,
        responseModel: call.responseModel,
        modelAccuracy: call.modelAccuracy,
        modelSource: call.modelSource,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        thinkingTokens: call.thinkingTokens,
        responseTokens: call.responseTokens,
        cacheReadTokens: call.cacheReadTokens,
        cacheCreationTokens: call.cacheCreationTokens,
        apiProvider: call.apiProvider,
        ttftSeconds: call.ttftSeconds,
        streamingSeconds: call.streamingSeconds,
        credits: call.credits,
        creditType: call.creditType,
        hasError: call.hasError,
        errorMessage: '',
        contextTokensUsed: call.contextTokensUsed,
        completionConfig: null,
        systemPromptSnippet: '',
        toolCount: call.toolCount,
        toolNames: [],
        promptSectionTitles: [],
        promptSnippet: '',
        promptSource: 'none',
        messagePromptCount: 0,
        messageMetadataKeys: [],
        responseHeaderKeys: [],
        userMessageAnchors: [],
        aiSnippetsByStep: {},
        retries: call.retries,
        stopReason: call.stopReason,
        retryTokensIn: call.retryTokensIn,
        retryTokensOut: call.retryTokensOut,
        retryCredits: call.retryCredits,
        retryErrors: [],
        timeSinceLastInvocation: call.timeSinceLastInvocation,
        tokenBreakdownGroups: [],
        createdAt: call.createdAt,
        latestStableMessageIndex: call.latestStableMessageIndex,
        startStepIndex: call.startStepIndex,
        checkpointIndex: call.checkpointIndex,
        checkpointSummaries: [],
        systemContextItems: [],
        accountEmail: call.accountEmail,
        toolCallsByStep: {},
        contextWindowCapacity: call.contextWindowCapacity,
        ...(call.executionModel ? { executionModel: call.executionModel } : {}),
    };
}
/**
 * Slim a full GMSummary for file persistence.
 * Keeps: all aggregate numbers (modelBreakdown, totals, stopReasonCounts).
 * Strips: per-call text content, checkpoint full text, token breakdown trees.
 */
function slimSummaryForPersistence(summary) {
    return {
        ...summary,
        conversations: summary.conversations.map(conv => ({
            ...conv,
            calls: conv.calls.map(slimCallForPersistence),
            checkpointSummaries: [],
            systemContextItems: [],
        })),
        latestTokenBreakdown: [],
        contextGrowth: summary.contextGrowth.map(p => ({ ...p })),
        modelBreakdown: Object.fromEntries(Object.entries(summary.modelBreakdown).map(([name, stats]) => [name, {
                ...stats,
                promptSectionTitles: [],
                completionConfig: null,
            }])),
        stopReasonCounts: { ...summary.stopReasonCounts },
        toolCallCounts: { ...summary.toolCallCounts },
    };
}
/** Slim a GMConversationData for persistence (same logic as summary slimming). */
function slimConversationForPersistence(conversation) {
    return {
        ...conversation,
        calls: conversation.calls.map(slimCallForPersistence),
        checkpointSummaries: [],
        systemContextItems: [],
    };
}
//# sourceMappingURL=types.js.map