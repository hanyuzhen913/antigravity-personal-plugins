"use strict";
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
exports.getEnvBackendHint = getEnvBackendHint;
exports.getActiveBackendHint = getActiveBackendHint;
exports.isSameBackendConnection = isSameBackendConnection;
exports.doesConnectionMatchActiveHint = doesConnectionMatchActiveHint;
exports.discoverCurrentLanguageServer = discoverCurrentLanguageServer;
exports.discoverPreferredBackend = discoverPreferredBackend;
const vscode = __importStar(require("vscode"));
const discovery_1 = require("./discovery");
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
function parseLoopbackServerUrlPort(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return null;
    }
    const trimmed = rawUrl.trim();
    if (/\s/.test(trimmed)) {
        return null;
    }
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    try {
        const parsed = new URL(hasScheme ? trimmed : `http://${trimmed}`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        if (!LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
            return null;
        }
        if (hasScheme) {
            const port = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
            return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : null;
        }
        if (!parsed.port || !/^\d+$/.test(parsed.port)) {
            return null;
        }
        const port = Number(parsed.port);
        return Number.isSafeInteger(port) && port >= 1 && port <= 65535 ? port : null;
    }
    catch {
        return null;
    }
}
/**
 * Parse loopback `ANTIGRAVITY_LS_ADDRESS` + `ANTIGRAVITY_CSRF_TOKEN` injected by
 * Antigravity App Sidecar / agent subprocesses into an `LSConnectionHint`.
 */
function getEnvBackendHint(env = process.env) {
    const port = parseLoopbackServerUrlPort(env.ANTIGRAVITY_LS_ADDRESS);
    const csrfToken = typeof env.ANTIGRAVITY_CSRF_TOKEN === 'string' ? env.ANTIGRAVITY_CSRF_TOKEN.trim() : '';
    if (port === null || !csrfToken || /\s/.test(csrfToken)) {
        return null;
    }
    return { port, csrfToken };
}
function getConfiguredLoopbackServerPort() {
    const envPort = parseLoopbackServerUrlPort(process.env.ANTIGRAVITY_SERVER_URL);
    if (envPort !== null) {
        return envPort;
    }
    try {
        const cfgUrl = vscode.workspace?.getConfiguration?.('antigravity')?.get('serverUrl');
        return parseLoopbackServerUrlPort(cfgUrl);
    }
    catch {
        return null;
    }
}
/** undefined: legacy IDE; null: this IDE's backend is present but not ready. */
function getActiveBackendHint() {
    try {
        const extension = vscode.extensions?.getExtension('google.google-antigravity');
        if (!extension) {
            return undefined;
        }
        if (!extension.isActive) {
            return null;
        }
        const api = extension.exports;
        if (!api || typeof api !== 'object') {
            return null;
        }
        const { port, csrfToken } = api;
        if (typeof csrfToken !== 'string' || !csrfToken || /\s/.test(csrfToken)) {
            return null;
        }
        const resolvedPort = port === undefined ? getConfiguredLoopbackServerPort() : port;
        if (typeof resolvedPort !== 'number' || !Number.isSafeInteger(resolvedPort)
            || resolvedPort < 1 || resolvedPort > 65535) {
            return null;
        }
        return { port: resolvedPort, csrfToken };
    }
    catch {
        // Exports may be unavailable or replaced while the built-in extension restarts.
        return null;
    }
}
/** Full backend identity check (handles pid=0 direct-hint connections and port/token/TLS/host changes). */
function isSameBackendConnection(a, b) {
    if (!a || !b) {
        return false;
    }
    return a.pid === b.pid
        && a.port === b.port
        && a.csrfToken === b.csrfToken
        && a.useTls === b.useTls
        && (a.hostname || '127.0.0.1') === (b.hostname || '127.0.0.1');
}
/**
 * Whether a cached LS connection still matches the current IDE's active hint.
 * - undefined hint (legacy IDE): always matches.
 * - null hint (IDE backend restarting/not ready): stale, must re-discover/wait.
 * - active hint: token must match; for HTTP connections port must also match
 *   (HTTPS fallback may legitimately sit on the paired httpsPort of the same hub).
 */
function doesConnectionMatchActiveHint(ls, hint) {
    if (hint === undefined) {
        return true;
    }
    if (hint === null) {
        return false;
    }
    if (ls.csrfToken !== hint.csrfToken) {
        return false;
    }
    if (!ls.useTls && ls.port !== hint.port) {
        return false;
    }
    return true;
}
function discoverCurrentLanguageServer(workspaceUri, signal, log) {
    const hint = getActiveBackendHint();
    if (hint === null) {
        log?.('Current IDE backend is starting or restarting; waiting without selecting another instance');
        return Promise.resolve(null);
    }
    return (0, discovery_1.discoverLanguageServer)(workspaceUri, signal, log, hint);
}
/**
 * Surface-aware backend discovery for unified IDE + Antigravity App callers.
 * When `preferredSurface === 'app'`, skips VS Code extension affinity and prefers
 * `ANTIGRAVITY_LS_ADDRESS` env vars / App standalone hub. When `'ide'`, respects
 * strict built-in extension hint affinity.
 */
function discoverPreferredBackend(options = {}) {
    if (options.preferredSurface === 'app') {
        return (0, discovery_1.discoverLanguageServer)({ ...options, preferredSurface: 'app' });
    }
    const hint = getActiveBackendHint();
    if (hint === null) {
        options.log?.('Current IDE backend is starting or restarting; waiting without selecting another instance');
        return Promise.resolve(null);
    }
    return (0, discovery_1.discoverLanguageServer)({
        ...options,
        preferredSurface: options.preferredSurface ?? 'ide',
        hint,
    });
}
//# sourceMappingURL=backend-connection.js.map