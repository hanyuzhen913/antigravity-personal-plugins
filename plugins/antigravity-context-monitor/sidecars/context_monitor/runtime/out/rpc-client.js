"use strict";
// ─── RPC Client ──────────────────────────────────────────────────────────────
// Extracted from tracker.ts for single-responsibility.
// Generic Connect-RPC caller for Antigravity Language Server communication.
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
exports.rpcCall = rpcCall;
exports.decodeConnectFirstFrame = decodeConnectFirstFrame;
exports.rpcStreamFirstFrame = rpcStreamFirstFrame;
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const zlib = __importStar(require("zlib"));
const constants_1 = require("./constants");
/**
 * Generic Connect-RPC caller.
 * - Checks HTTP status code — non-2xx responses are rejected.
 * - Supports AbortSignal for cancellation on extension deactivate.
 * - Guards against abnormally large responses (50 MB limit).
 * - Uses `settled` flag to prevent double resolve/reject from abort + error overlap.
 */
function rpcCall(ls, endpoint, body, timeoutMs = 10000, signal) {
    return new Promise((resolve, reject) => {
        // Early abort check
        if (signal?.aborted) {
            reject(new Error('RPC aborted'));
            return;
        }
        let settled = false;
        const safeResolve = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanupAbortListener();
            resolve(value);
        };
        const safeReject = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanupAbortListener();
            reject(err);
        };
        const postData = JSON.stringify(body);
        const options = {
            hostname: ls.hostname || '127.0.0.1',
            port: ls.port,
            path: `/exa.language_server_pb.LanguageServerService/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'x-codeium-csrf-token': ls.csrfToken,
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: timeoutMs,
            rejectUnauthorized: false
        };
        // Track abort handler for cleanup after request completes
        let onAbort;
        const cleanupAbortListener = () => {
            if (onAbort && signal) {
                signal.removeEventListener('abort', onAbort);
                onAbort = undefined;
            }
        };
        const transport = ls.useTls ? https : http;
        const req = transport.request(options, (res) => {
            let data = '';
            let bodySize = 0;
            res.on('error', (e) => { safeReject(e); });
            res.on('data', (chunk) => {
                bodySize += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
                if (bodySize > constants_1.MAX_RESPONSE_BODY_SIZE) {
                    safeReject(new Error(`RPC response exceeded ${constants_1.MAX_RESPONSE_BODY_SIZE} bytes`));
                    req.destroy();
                    return;
                }
                data += chunk;
            });
            res.on('end', () => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    safeReject(new Error(`RPC HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    return;
                }
                try {
                    safeResolve(JSON.parse(data));
                }
                catch (e) {
                    safeReject(new Error(`Failed to parse RPC response: ${data.substring(0, 200)}`));
                }
            });
        });
        req.on('error', (e) => { safeReject(e); });
        req.on('timeout', () => { safeReject(new Error('RPC timeout')); req.destroy(); });
        // Abort listener — destroy the request on signal abort
        if (signal) {
            onAbort = () => {
                safeReject(new Error('RPC aborted'));
                req.destroy();
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
        req.write(postData);
        req.end();
    });
}
/**
 * Decode the first Connect envelope frame from an accumulated byte buffer.
 * Envelope layout: [1-byte flags][4-byte big-endian payload length][payload].
 * Flags: bit 0 (0x01) = gzip compressed, bit 1 (0x02) = end-of-stream trailer.
 */
function decodeConnectFirstFrame(buf) {
    if (buf.length < 5) {
        return { done: false };
    }
    const flags = buf[0];
    const frameLen = buf.readUInt32BE(1);
    if (frameLen > constants_1.MAX_RESPONSE_BODY_SIZE) {
        throw new Error(`Connect stream frame exceeded ${constants_1.MAX_RESPONSE_BODY_SIZE} bytes`);
    }
    if (buf.length < 5 + frameLen) {
        return { done: false };
    }
    let frameBytes = buf.subarray(5, 5 + frameLen);
    if ((flags & 0x01) !== 0) {
        frameBytes = zlib.gunzipSync(frameBytes, { maxOutputLength: constants_1.MAX_RESPONSE_BODY_SIZE });
    }
    const text = frameBytes.toString('utf8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(`Unexpected Connect stream payload: ${text.substring(0, 200)}`);
    }
    return {
        done: true,
        endStream: (flags & 0x02) !== 0,
        payload: parsed,
    };
}
/**
 * Perform a Connect server-streaming RPC (`application/connect+json`), decode
 * the first data frame, and immediately tear down the stream so no socket leaks.
 */
function rpcStreamFirstFrame(ls, endpoint, body = {}, timeoutMs = 5000, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('RPC stream aborted'));
            return;
        }
        let settled = false;
        let onAbort;
        let timer;
        const cleanup = () => {
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            if (onAbort && signal) {
                signal.removeEventListener('abort', onAbort);
                onAbort = undefined;
            }
        };
        const safeResolve = (value) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(value);
        };
        const safeReject = (err) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(err);
        };
        const msgBytes = Buffer.from(JSON.stringify(body), 'utf8');
        const frame = Buffer.alloc(5 + msgBytes.length);
        frame[0] = 0;
        frame.writeUInt32BE(msgBytes.length, 1);
        msgBytes.copy(frame, 5);
        const options = {
            hostname: ls.hostname || '127.0.0.1',
            port: ls.port,
            path: `/exa.language_server_pb.LanguageServerService/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/connect+json',
                'Connect-Protocol-Version': '1',
                'x-codeium-csrf-token': ls.csrfToken,
                'Content-Length': frame.length,
            },
            timeout: timeoutMs,
            rejectUnauthorized: false,
        };
        const transport = ls.useTls ? https : http;
        const req = transport.request(options, (res) => {
            res.on('error', (err) => {
                safeReject(err instanceof Error ? err : new Error(String(err)));
            });
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
                let errBody = '';
                res.on('data', (chunk) => {
                    if (errBody.length < 256) {
                        errBody += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
                    }
                });
                res.on('end', () => {
                    safeReject(new Error(`RPC stream HTTP ${status}: ${errBody.substring(0, 200)}`));
                    req.destroy();
                });
                return;
            }
            let acc = Buffer.alloc(0);
            res.on('data', (chunk) => {
                if (settled) {
                    return;
                }
                const chunkBuf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
                if (acc.length + chunkBuf.length > constants_1.MAX_RESPONSE_BODY_SIZE) {
                    safeReject(new Error(`RPC stream response exceeded ${constants_1.MAX_RESPONSE_BODY_SIZE} bytes`));
                    req.destroy();
                    return;
                }
                acc = acc.length === 0 ? chunkBuf : Buffer.concat([acc, chunkBuf]);
                try {
                    const decoded = decodeConnectFirstFrame(acc);
                    if (!decoded.done) {
                        return;
                    }
                    if (decoded.endStream) {
                        const errObj = decoded.payload.error;
                        const msg = typeof errObj?.message === 'string'
                            ? errObj.message
                            : typeof errObj?.code === 'string'
                                ? errObj.code
                                : 'Empty Connect stream';
                        safeReject(new Error(`RPC stream ended without data: ${msg}`));
                        req.destroy();
                        return;
                    }
                    safeResolve(decoded.payload);
                    req.destroy();
                }
                catch (err) {
                    safeReject(err instanceof Error ? err : new Error(String(err)));
                    req.destroy();
                }
            });
            res.on('end', () => {
                if (!settled) {
                    safeReject(new Error('RPC stream closed before first frame'));
                }
            });
        });
        // Hard wall-clock deadline because socket idle timeout alone won't fire
        // if a server dribbles partial bytes or pauses after headers.
        timer = setTimeout(() => {
            safeReject(new Error('RPC stream timeout'));
            req.destroy();
        }, timeoutMs);
        req.on('error', (e) => { safeReject(e); });
        req.on('timeout', () => { safeReject(new Error('RPC stream timeout')); req.destroy(); });
        if (signal) {
            onAbort = () => {
                safeReject(new Error('RPC stream aborted'));
                req.destroy();
            };
            signal.addEventListener('abort', onAbort, { once: true });
        }
        req.write(frame);
        req.end();
    });
}
//# sourceMappingURL=rpc-client.js.map