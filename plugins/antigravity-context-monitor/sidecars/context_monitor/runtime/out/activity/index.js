"use strict";
// ─── Activity Module Barrel ──────────────────────────────────────────────────
// Re-exports everything so external consumers can still use:
//   import { ActivityTracker, ActivitySummary, ... } from './activity';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityTracker = exports.normalizeStepsByModelRecord = exports.mergeGMStats = exports.mergeActivityStats = exports.mergeCountRecord = exports.sameStepDistribution = exports.buildGMVirtualPreview = exports.extractNotifyMessage = exports.isLowSignalPromptSnippet = exports.buildLegacyStepEventIdentity = exports.buildRawStepFingerprint = exports.buildGMEventKey = exports.extractToolName = exports.extractToolDetail = exports.stepDurationTool = exports.stepDurationReasoning = exports.truncate = exports.classifyStep = void 0;
// Helpers
var helpers_1 = require("./helpers");
Object.defineProperty(exports, "classifyStep", { enumerable: true, get: function () { return helpers_1.classifyStep; } });
Object.defineProperty(exports, "truncate", { enumerable: true, get: function () { return helpers_1.truncate; } });
Object.defineProperty(exports, "stepDurationReasoning", { enumerable: true, get: function () { return helpers_1.stepDurationReasoning; } });
Object.defineProperty(exports, "stepDurationTool", { enumerable: true, get: function () { return helpers_1.stepDurationTool; } });
Object.defineProperty(exports, "extractToolDetail", { enumerable: true, get: function () { return helpers_1.extractToolDetail; } });
Object.defineProperty(exports, "extractToolName", { enumerable: true, get: function () { return helpers_1.extractToolName; } });
Object.defineProperty(exports, "buildGMEventKey", { enumerable: true, get: function () { return helpers_1.buildGMEventKey; } });
Object.defineProperty(exports, "buildRawStepFingerprint", { enumerable: true, get: function () { return helpers_1.buildRawStepFingerprint; } });
Object.defineProperty(exports, "buildLegacyStepEventIdentity", { enumerable: true, get: function () { return helpers_1.buildLegacyStepEventIdentity; } });
Object.defineProperty(exports, "isLowSignalPromptSnippet", { enumerable: true, get: function () { return helpers_1.isLowSignalPromptSnippet; } });
Object.defineProperty(exports, "extractNotifyMessage", { enumerable: true, get: function () { return helpers_1.extractNotifyMessage; } });
Object.defineProperty(exports, "buildGMVirtualPreview", { enumerable: true, get: function () { return helpers_1.buildGMVirtualPreview; } });
Object.defineProperty(exports, "sameStepDistribution", { enumerable: true, get: function () { return helpers_1.sameStepDistribution; } });
Object.defineProperty(exports, "mergeCountRecord", { enumerable: true, get: function () { return helpers_1.mergeCountRecord; } });
Object.defineProperty(exports, "mergeActivityStats", { enumerable: true, get: function () { return helpers_1.mergeActivityStats; } });
Object.defineProperty(exports, "mergeGMStats", { enumerable: true, get: function () { return helpers_1.mergeGMStats; } });
Object.defineProperty(exports, "normalizeStepsByModelRecord", { enumerable: true, get: function () { return helpers_1.normalizeStepsByModelRecord; } });
// Tracker Class
var tracker_1 = require("./tracker");
Object.defineProperty(exports, "ActivityTracker", { enumerable: true, get: function () { return tracker_1.ActivityTracker; } });
//# sourceMappingURL=index.js.map