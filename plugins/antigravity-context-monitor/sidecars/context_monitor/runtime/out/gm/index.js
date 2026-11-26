"use strict";
// ─── GM Module Barrel ────────────────────────────────────────────────────────
// Re-exports everything so external consumers can still use:
//   import { GMTracker, GMSummary, ... } from './gm';
Object.defineProperty(exports, "__esModule", { value: true });
exports.GMTracker = exports.buildSummaryFromConversations = exports.normalizeGMSummary = exports.mergeGMModelStats = exports.filterGMSummaryByModels = exports.MAX_RECENT_ERRORS = exports.parseGMEntry = exports.shouldEnrichConversation = exports.applyTrajectoryModelHints = exports.extractTrajectoryModelHints = exports.maybeEnrichCallsFromTrajectory = exports.mergeGMCallEntries = exports.buildGMArchiveKey = exports.buildGMMatchKey = exports.extractPromptData = exports.extractAISnippetsByStep = exports.extractCheckpointSummaries = exports.extractUserMessageAnchors = exports.pickPromptSnippet = exports.uniqueStrings = exports.parseInt0 = exports.parseDuration = exports.slimConversationForPersistence = exports.slimSummaryForPersistence = exports.slimCallForPersistence = exports.cloneConversationData = exports.cloneGMCallEntry = exports.cloneTokenBreakdownGroups = void 0;
var types_1 = require("./types");
Object.defineProperty(exports, "cloneTokenBreakdownGroups", { enumerable: true, get: function () { return types_1.cloneTokenBreakdownGroups; } });
Object.defineProperty(exports, "cloneGMCallEntry", { enumerable: true, get: function () { return types_1.cloneGMCallEntry; } });
Object.defineProperty(exports, "cloneConversationData", { enumerable: true, get: function () { return types_1.cloneConversationData; } });
Object.defineProperty(exports, "slimCallForPersistence", { enumerable: true, get: function () { return types_1.slimCallForPersistence; } });
Object.defineProperty(exports, "slimSummaryForPersistence", { enumerable: true, get: function () { return types_1.slimSummaryForPersistence; } });
Object.defineProperty(exports, "slimConversationForPersistence", { enumerable: true, get: function () { return types_1.slimConversationForPersistence; } });
// Parser & Enrichment
var parser_1 = require("./parser");
Object.defineProperty(exports, "parseDuration", { enumerable: true, get: function () { return parser_1.parseDuration; } });
Object.defineProperty(exports, "parseInt0", { enumerable: true, get: function () { return parser_1.parseInt0; } });
Object.defineProperty(exports, "uniqueStrings", { enumerable: true, get: function () { return parser_1.uniqueStrings; } });
Object.defineProperty(exports, "pickPromptSnippet", { enumerable: true, get: function () { return parser_1.pickPromptSnippet; } });
Object.defineProperty(exports, "extractUserMessageAnchors", { enumerable: true, get: function () { return parser_1.extractUserMessageAnchors; } });
Object.defineProperty(exports, "extractCheckpointSummaries", { enumerable: true, get: function () { return parser_1.extractCheckpointSummaries; } });
Object.defineProperty(exports, "extractAISnippetsByStep", { enumerable: true, get: function () { return parser_1.extractAISnippetsByStep; } });
Object.defineProperty(exports, "extractPromptData", { enumerable: true, get: function () { return parser_1.extractPromptData; } });
Object.defineProperty(exports, "buildGMMatchKey", { enumerable: true, get: function () { return parser_1.buildGMMatchKey; } });
Object.defineProperty(exports, "buildGMArchiveKey", { enumerable: true, get: function () { return parser_1.buildGMArchiveKey; } });
Object.defineProperty(exports, "mergeGMCallEntries", { enumerable: true, get: function () { return parser_1.mergeGMCallEntries; } });
Object.defineProperty(exports, "maybeEnrichCallsFromTrajectory", { enumerable: true, get: function () { return parser_1.maybeEnrichCallsFromTrajectory; } });
Object.defineProperty(exports, "extractTrajectoryModelHints", { enumerable: true, get: function () { return parser_1.extractTrajectoryModelHints; } });
Object.defineProperty(exports, "applyTrajectoryModelHints", { enumerable: true, get: function () { return parser_1.applyTrajectoryModelHints; } });
Object.defineProperty(exports, "shouldEnrichConversation", { enumerable: true, get: function () { return parser_1.shouldEnrichConversation; } });
Object.defineProperty(exports, "parseGMEntry", { enumerable: true, get: function () { return parser_1.parseGMEntry; } });
// Summary
var summary_1 = require("./summary");
Object.defineProperty(exports, "MAX_RECENT_ERRORS", { enumerable: true, get: function () { return summary_1.MAX_RECENT_ERRORS; } });
Object.defineProperty(exports, "filterGMSummaryByModels", { enumerable: true, get: function () { return summary_1.filterGMSummaryByModels; } });
Object.defineProperty(exports, "mergeGMModelStats", { enumerable: true, get: function () { return summary_1.mergeGMModelStats; } });
Object.defineProperty(exports, "normalizeGMSummary", { enumerable: true, get: function () { return summary_1.normalizeGMSummary; } });
Object.defineProperty(exports, "buildSummaryFromConversations", { enumerable: true, get: function () { return summary_1.buildSummaryFromConversations; } });
// Tracker Class
var tracker_1 = require("./tracker");
Object.defineProperty(exports, "GMTracker", { enumerable: true, get: function () { return tracker_1.GMTracker; } });
//# sourceMappingURL=index.js.map