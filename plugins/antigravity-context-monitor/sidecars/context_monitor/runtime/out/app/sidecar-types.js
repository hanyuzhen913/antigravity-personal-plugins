"use strict";
/**
 * Shared types for the Antigravity App native Sidecar UI plugin.
 * Pure Node/TypeScript — zero `vscode` imports so both the sidecar runtime
 * and unit tests can import this module without an IDE host.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAppSettings = exports.SUPPORTED_DISPLAY_CURRENCIES = exports.DEFAULT_APP_SETTINGS = void 0;
var durable_state_1 = require("../durable-state");
Object.defineProperty(exports, "DEFAULT_APP_SETTINGS", { enumerable: true, get: function () { return durable_state_1.DEFAULT_APP_SETTINGS; } });
Object.defineProperty(exports, "SUPPORTED_DISPLAY_CURRENCIES", { enumerable: true, get: function () { return durable_state_1.SUPPORTED_DISPLAY_CURRENCIES; } });
Object.defineProperty(exports, "normalizeAppSettings", { enumerable: true, get: function () { return durable_state_1.normalizeAppSettings; } });
//# sourceMappingURL=sidecar-types.js.map