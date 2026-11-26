"use strict";
/**
 * In-App GitHub Release Update Checker & Pure-Node Self-Upgrader for the
 * Antigravity App native Sidecar plugin (`antigravity-context-monitor`).
 *
 * Security & Runtime Guarantees:
 * - Zero external npm dependencies (pure Node built-ins: `https`, `crypto`, `fs`, `path`, `zlib`).
 * - Strict HTTPS host allowlist (`github.com`, `api.github.com`, `objects.githubusercontent.com`,
 *   `release-assets.githubusercontent.com`) re-validated on EVERY redirect hop (max 5 hops).
 * - SHA-256 checksum verification against `SHA256SUMS.txt` when published in the release.
 * - Pure-Node ZIP extractor supporting Stored + Deflate with IEEE CRC-32 check, zip-bomb byte/count
 *   caps, and strict rejection of zip-slip (`..`), absolute paths, encrypted entries, and symlinks.
 * - Bundle validation (`plugin.json`, `name`, valid semver, `sidecars/context_monitor/main.mjs`).
 * - Atomic install with backup & automatic rollback on failure (including Windows `EPERM`/`EBUSY` fallback).
 */
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
exports.ALLOWED_RELEASE_HOSTS = exports.MAX_ZIP_ENTRIES = exports.MAX_EXTRACTED_BYTES = exports.MAX_API_BODY_BYTES = exports.MAX_CHECKSUMS_BYTES = exports.MAX_ARCHIVE_BYTES = exports.MAX_REDIRECT_HOPS = exports.DEFAULT_DOWNLOAD_TIMEOUT_MS = exports.DEFAULT_API_TIMEOUT_MS = exports.DEFAULT_UPDATE_CHECK_THROTTLE_MS = exports.EXPECTED_PLUGIN_NAME = exports.GITHUB_LATEST_RELEASE_URL = exports.GITHUB_REPO_NAME = exports.GITHUB_REPO_OWNER = void 0;
exports.parseSemver = parseSemver;
exports.compareSemver = compareSemver;
exports.isNewerVersion = isNewerVersion;
exports.validateReleaseUrl = validateReleaseUrl;
exports.defaultHttpsTransport = defaultHttpsTransport;
exports.fetchAllowedHttps = fetchAllowedHttps;
exports.summarizeReleaseNotes = summarizeReleaseNotes;
exports.checkForUpdates = checkForUpdates;
exports.computeSha256Hex = computeSha256Hex;
exports.verifyBufferSha256 = verifyBufferSha256;
exports.parseSha256Sums = parseSha256Sums;
exports.crc32 = crc32;
exports.extractZipSafe = extractZipSafe;
exports.resolveExtractedPluginRoot = resolveExtractedPluginRoot;
exports.validateExtractedPluginBundle = validateExtractedPluginBundle;
exports.applyAppPluginUpdate = applyAppPluginUpdate;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const https = __importStar(require("https"));
const path = __importStar(require("path"));
const zlib = __importStar(require("zlib"));
exports.GITHUB_REPO_OWNER = 'AGI-is-going-to-arrive';
exports.GITHUB_REPO_NAME = 'Antigravity-Context-Window-Monitor';
exports.GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${exports.GITHUB_REPO_OWNER}/${exports.GITHUB_REPO_NAME}/releases/latest`;
exports.EXPECTED_PLUGIN_NAME = 'antigravity-context-monitor';
exports.DEFAULT_UPDATE_CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours
exports.DEFAULT_API_TIMEOUT_MS = 12_000;
exports.DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;
exports.MAX_REDIRECT_HOPS = 5;
exports.MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
exports.MAX_CHECKSUMS_BYTES = 256 * 1024;
exports.MAX_API_BODY_BYTES = 2 * 1024 * 1024;
exports.MAX_EXTRACTED_BYTES = 100 * 1024 * 1024;
exports.MAX_ZIP_ENTRIES = 2_000;
exports.ALLOWED_RELEASE_HOSTS = new Set([
    'github.com',
    'api.github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
]);
const SEMVER_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
function parseSemver(raw) {
    if (typeof raw !== 'string') {
        return null;
    }
    const match = raw.trim().match(SEMVER_RE);
    if (!match) {
        return null;
    }
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
        return null;
    }
    const prerelease = match[4] ? match[4].split('.').filter(Boolean) : [];
    const normalized = `${major}.${minor}.${patch}${prerelease.length > 0 ? `-${prerelease.join('.')}` : ''}`;
    return { major, minor, patch, prerelease, normalized };
}
function compareSemver(a, b) {
    const pa = parseSemver(a);
    const pb = parseSemver(b);
    if (!pa || !pb) {
        throw new Error(`Invalid semantic version comparison: "${a}" vs "${b}"`);
    }
    if (pa.major !== pb.major) {
        return pa.major - pb.major;
    }
    if (pa.minor !== pb.minor) {
        return pa.minor - pb.minor;
    }
    if (pa.patch !== pb.patch) {
        return pa.patch - pb.patch;
    }
    // Stable release has higher precedence than a pre-release of the same version
    if (pa.prerelease.length === 0 && pb.prerelease.length === 0) {
        return 0;
    }
    if (pa.prerelease.length === 0) {
        return 1;
    }
    if (pb.prerelease.length === 0) {
        return -1;
    }
    const len = Math.max(pa.prerelease.length, pb.prerelease.length);
    for (let i = 0; i < len; i++) {
        if (i >= pa.prerelease.length) {
            return -1;
        }
        if (i >= pb.prerelease.length) {
            return 1;
        }
        const ia = pa.prerelease[i];
        const ib = pb.prerelease[i];
        if (ia === ib) {
            continue;
        }
        const numA = /^\d+$/.test(ia);
        const numB = /^\d+$/.test(ib);
        if (numA && numB) {
            return Number(ia) - Number(ib);
        }
        if (numA) {
            return -1;
        }
        if (numB) {
            return 1;
        }
        return ia < ib ? -1 : 1;
    }
    return 0;
}
function isNewerVersion(candidate, current) {
    const pc = parseSemver(candidate);
    const pb = parseSemver(current);
    if (!pc || !pb) {
        return false;
    }
    return compareSemver(pc.normalized, pb.normalized) > 0;
}
// ─── Strict HTTPS Host Allowlist & Safe Redirect Fetch ───────────────────────
function validateReleaseUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        throw new Error('Release URL is empty');
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    }
    catch {
        throw new Error(`Malformed release URL: ${rawUrl}`);
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`Refusing non-HTTPS release URL protocol: ${parsed.protocol}`);
    }
    if (parsed.username || parsed.password) {
        throw new Error('Refusing release URL containing embedded credentials');
    }
    if (parsed.port && parsed.port !== '443') {
        throw new Error(`Refusing non-standard HTTPS port in release URL: ${parsed.port}`);
    }
    const host = parsed.hostname.toLowerCase();
    if (!exports.ALLOWED_RELEASE_HOSTS.has(host)) {
        throw new Error(`Refusing release URL with non-allowlisted host: ${host}`);
    }
    return parsed;
}
function defaultHttpsTransport(url, options) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, result) => {
            if (settled) {
                return;
            }
            settled = true;
            if (err) {
                reject(err);
            }
            else {
                resolve(result);
            }
        };
        const req = https.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: 443,
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: options.headers,
            timeout: options.timeoutMs,
        }, (res) => {
            const statusCode = res.statusCode ?? 0;
            const headers = {};
            for (const [k, v] of Object.entries(res.headers)) {
                headers[k.toLowerCase()] = v;
            }
            // Don't buffer redirect response bodies
            if (statusCode >= 300 && statusCode < 400) {
                res.resume();
                finish(null, { statusCode, headers, body: Buffer.alloc(0) });
                return;
            }
            const chunks = [];
            let total = 0;
            res.on('data', (chunk) => {
                if (settled) {
                    return;
                }
                const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
                total += buf.length;
                if (total > options.maxBytes) {
                    req.destroy();
                    finish(new Error(`Response body exceeded maximum allowed limit (${options.maxBytes} bytes)`));
                    return;
                }
                chunks.push(buf);
            });
            res.on('error', (err) => finish(err));
            res.on('end', () => {
                finish(null, { statusCode, headers, body: Buffer.concat(chunks) });
            });
        });
        req.on('error', (err) => finish(err));
        req.on('timeout', () => {
            req.destroy();
            finish(new Error(`HTTPS request timed out after ${options.timeoutMs}ms`));
        });
        req.end();
    });
}
function headerFirst(headers, name) {
    const val = headers[name.toLowerCase()];
    if (typeof val === 'string') {
        return val;
    }
    if (Array.isArray(val) && typeof val[0] === 'string') {
        return val[0];
    }
    return undefined;
}
/**
 * Perform an HTTPS GET strictly constrained to `ALLOWED_RELEASE_HOSTS`, following
 * up to `MAX_REDIRECT_HOPS` redirects and re-validating the host allowlist on EVERY hop.
 */
async function fetchAllowedHttps(rawUrl, options = {}) {
    const transport = options.transport ?? defaultHttpsTransport;
    const timeoutMs = options.timeoutMs ?? exports.DEFAULT_API_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? exports.MAX_API_BODY_BYTES;
    const maxRedirects = options.maxRedirects ?? exports.MAX_REDIRECT_HOPS;
    const baseHeaders = options.headers ?? {};
    let currentUrl = validateReleaseUrl(rawUrl);
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const res = await transport(currentUrl, {
            headers: baseHeaders,
            timeoutMs,
            maxBytes,
        });
        const isRedirect = res.statusCode === 301
            || res.statusCode === 302
            || res.statusCode === 303
            || res.statusCode === 307
            || res.statusCode === 308;
        if (!isRedirect) {
            return { ...res, finalUrl: currentUrl.toString() };
        }
        if (hop >= maxRedirects) {
            throw new Error(`Too many redirects (exceeded max ${maxRedirects} hops)`);
        }
        const location = headerFirst(res.headers, 'location');
        if (!location || !location.trim()) {
            throw new Error(`Redirect response HTTP ${res.statusCode} missing Location header`);
        }
        const resolvedNext = new URL(location.trim(), currentUrl).toString();
        // Re-validate strict HTTPS host allowlist on EVERY hop!
        currentUrl = validateReleaseUrl(resolvedNext);
    }
    throw new Error('Redirect loop exhausted');
}
function summarizeReleaseNotes(rawBody, maxChars = 600) {
    if (typeof rawBody !== 'string' || !rawBody.trim()) {
        return '';
    }
    const cleaned = rawBody
        .replace(/\r\n/g, '\n')
        .replace(/^#+\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (cleaned.length <= maxChars) {
        return cleaned;
    }
    return `${cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
/**
 * Check GitHub Releases for a newer App plugin release.
 * Throttled by default (6h) unless `force: true`; supports ETag (`If-None-Match`)
 * conditional requests and 12s timeout.
 */
async function checkForUpdates(options) {
    const currentVersion = (options.currentVersion || '0.0.0').trim();
    const nowFn = options.now ?? (() => Date.now());
    const nowMs = nowFn();
    const throttleMs = options.throttleMs ?? exports.DEFAULT_UPDATE_CHECK_THROTTLE_MS;
    const etag = options.etag && options.etag.trim() ? options.etag.trim() : null;
    if (!options.force && typeof options.lastCheckedAt === 'number' && options.lastCheckedAt > 0) {
        if (nowMs - options.lastCheckedAt < throttleMs) {
            return {
                status: 'throttled',
                hasUpdate: false,
                currentVersion,
                etag,
                checkedAt: options.lastCheckedAt,
            };
        }
    }
    const headers = {
        'User-Agent': `Antigravity-Context-Monitor/${currentVersion}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
    if (etag) {
        headers['If-None-Match'] = etag;
    }
    try {
        const res = await fetchAllowedHttps(options.releaseApiUrl || exports.GITHUB_LATEST_RELEASE_URL, {
            headers,
            timeoutMs: options.timeoutMs ?? exports.DEFAULT_API_TIMEOUT_MS,
            maxBytes: exports.MAX_API_BODY_BYTES,
            transport: options.transport,
        });
        const nextEtag = headerFirst(res.headers, 'etag') || etag;
        if (res.statusCode === 304) {
            return {
                status: 'not_modified',
                hasUpdate: false,
                currentVersion,
                etag: nextEtag,
                checkedAt: nowMs,
            };
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
            return {
                status: 'error',
                hasUpdate: false,
                currentVersion,
                etag: nextEtag,
                checkedAt: nowMs,
                error: `GitHub Releases API returned HTTP ${res.statusCode}`,
            };
        }
        const parsed = JSON.parse(res.body.toString('utf8'));
        const tagName = typeof parsed.tag_name === 'string' ? parsed.tag_name.trim() : '';
        const semver = parseSemver(tagName);
        if (!semver) {
            return {
                status: 'error',
                hasUpdate: false,
                currentVersion,
                etag: nextEtag,
                checkedAt: nowMs,
                error: `Invalid release tag version: ${tagName || '(empty)'}`,
            };
        }
        const latestVersion = semver.normalized;
        const assets = Array.isArray(parsed.assets) ? parsed.assets : [];
        const expectedZipName = `antigravity-context-monitor-app-${latestVersion}.zip`;
        const zipAsset = assets.find(a => typeof a.name === 'string' && a.name === expectedZipName)
            || assets.find(a => typeof a.name === 'string' && /^antigravity-context-monitor-app-[\w.-]+\.zip$/i.test(a.name));
        const checksumAsset = assets.find(a => typeof a.name === 'string' && a.name.toLowerCase() === 'sha256sums.txt');
        let releaseInfo;
        if (zipAsset && typeof zipAsset.name === 'string' && typeof zipAsset.browser_download_url === 'string') {
            // Validate download URLs strictly before exposing them
            const validatedZipUrl = validateReleaseUrl(zipAsset.browser_download_url).toString();
            let validatedChecksumsUrl = null;
            if (checksumAsset && typeof checksumAsset.browser_download_url === 'string') {
                validatedChecksumsUrl = validateReleaseUrl(checksumAsset.browser_download_url).toString();
            }
            const rawHtmlUrl = typeof parsed.html_url === 'string' && parsed.html_url.trim()
                ? validateReleaseUrl(parsed.html_url).toString()
                : `https://github.com/${exports.GITHUB_REPO_OWNER}/${exports.GITHUB_REPO_NAME}/releases/tag/${encodeURIComponent(tagName)}`;
            releaseInfo = {
                version: latestVersion,
                tagName,
                releaseUrl: rawHtmlUrl,
                publishedAt: typeof parsed.published_at === 'string' ? parsed.published_at : undefined,
                releaseNotesSummary: summarizeReleaseNotes(typeof parsed.body === 'string' ? parsed.body : ''),
                assetName: zipAsset.name,
                assetUrl: validatedZipUrl,
                assetSize: typeof zipAsset.size === 'number' && Number.isFinite(zipAsset.size) ? zipAsset.size : undefined,
                checksumsUrl: validatedChecksumsUrl,
            };
        }
        const hasUpdate = isNewerVersion(latestVersion, currentVersion);
        return {
            status: hasUpdate ? 'update_available' : 'up_to_date',
            hasUpdate,
            currentVersion,
            latestVersion,
            etag: nextEtag,
            checkedAt: nowMs,
            ...(releaseInfo ? { releaseInfo } : {}),
        };
    }
    catch (err) {
        return {
            status: 'error',
            hasUpdate: false,
            currentVersion,
            etag,
            checkedAt: nowMs,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
// ─── SHA-256 Checksum Utilities ──────────────────────────────────────────────
function computeSha256Hex(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex').toLowerCase();
}
function verifyBufferSha256(buf, expectedHex) {
    const cleanExpected = expectedHex.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(cleanExpected)) {
        return false;
    }
    const actualHex = computeSha256Hex(buf);
    return crypto.timingSafeEqual(Buffer.from(actualHex, 'utf8'), Buffer.from(cleanExpected, 'utf8'));
}
/**
 * Parse a `SHA256SUMS.txt` file into a lookup map from filename (and basename)
 * to 64-character lowercase SHA-256 hex digest.
 */
function parseSha256Sums(content) {
    const map = new Map();
    if (typeof content !== 'string') {
        return map;
    }
    for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
        if (!match) {
            continue;
        }
        const digest = match[1].toLowerCase();
        const rawName = match[2].trim().replace(/\\/g, '/').replace(/^\.\//, '');
        if (!rawName) {
            continue;
        }
        map.set(rawName.toLowerCase(), digest);
        const base = path.posix.basename(rawName).toLowerCase();
        if (base && !map.has(base)) {
            map.set(base, digest);
        }
    }
    return map;
}
// ─── Pure-Node Safe ZIP Extractor (Stored + Deflate, Zero Deps) ──────────────
const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}
function findEocdOffset(zipBuf) {
    if (zipBuf.length < 22) {
        throw new Error('Invalid ZIP archive: file too small');
    }
    const minOffset = Math.max(0, zipBuf.length - 22 - 65_535);
    for (let i = zipBuf.length - 22; i >= minOffset; i--) {
        if (zipBuf.readUInt32LE(i) === 0x06054b50) {
            const commentLen = zipBuf.readUInt16LE(i + 20);
            if (i + 22 + commentLen === zipBuf.length) {
                return i;
            }
        }
    }
    throw new Error('Invalid ZIP archive: missing End-Of-Central-Directory record');
}
function sanitizeZipEntryPath(rawName) {
    if (!rawName || rawName.includes('\0')) {
        throw new Error('Unsafe ZIP entry: empty or contains NUL byte');
    }
    const normalized = rawName.replace(/\\/g, '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
        throw new Error(`Unsafe ZIP entry (absolute path rejected): ${rawName}`);
    }
    const isDir = normalized.endsWith('/');
    const trimmed = normalized.replace(/\/+$/, '');
    if (!trimmed) {
        if (isDir) {
            return { relPath: '', isDir: true };
        }
        throw new Error(`Unsafe ZIP entry path: ${rawName}`);
    }
    const segments = trimmed.split('/');
    for (const seg of segments) {
        if (!seg || seg === '.' || seg === '..') {
            throw new Error(`Unsafe ZIP entry (path traversal rejected): ${rawName}`);
        }
    }
    return { relPath: segments.join('/'), isDir };
}
/**
 * Pure-Node safe ZIP extractor supporting Stored (method 0) and Deflate (method 8).
 * Strictly rejects zip-slip (`..`), absolute paths, symlinks, special Unix file types,
 * encrypted entries, CRC-32 mismatches, and zip-bomb size/entry limits.
 */
function extractZipSafe(zipBuf, destDir, options = {}) {
    const maxEntries = options.maxEntries ?? exports.MAX_ZIP_ENTRIES;
    const maxTotalBytes = options.maxTotalBytes ?? exports.MAX_EXTRACTED_BYTES;
    const eocdOffset = findEocdOffset(zipBuf);
    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
    const centralDirSize = zipBuf.readUInt32LE(eocdOffset + 12);
    const centralDirOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    if (totalEntries === 0) {
        throw new Error('Invalid ZIP archive: archive contains 0 entries');
    }
    if (totalEntries > maxEntries) {
        throw new Error(`ZIP archive exceeds maximum entry limit (${totalEntries} > ${maxEntries})`);
    }
    if (centralDirOffset + centralDirSize > eocdOffset) {
        throw new Error('Invalid ZIP archive: central directory exceeds bounds');
    }
    const resolvedDest = path.resolve(destDir);
    fs.mkdirSync(resolvedDest, { recursive: true });
    let cursor = centralDirOffset;
    let totalExtractedBytes = 0;
    const extractedEntries = [];
    for (let i = 0; i < totalEntries; i++) {
        if (cursor + 46 > centralDirOffset + centralDirSize) {
            throw new Error('Invalid ZIP archive: truncated central directory entry');
        }
        const sig = zipBuf.readUInt32LE(cursor);
        if (sig !== 0x02014b50) {
            throw new Error(`Invalid ZIP archive: bad central directory signature at offset ${cursor}`);
        }
        const versionMadeBy = zipBuf.readUInt16LE(cursor + 4);
        const flags = zipBuf.readUInt16LE(cursor + 8);
        const method = zipBuf.readUInt16LE(cursor + 10);
        const expectedCrc = zipBuf.readUInt32LE(cursor + 16);
        const compressedSize = zipBuf.readUInt32LE(cursor + 20);
        const uncompressedSize = zipBuf.readUInt32LE(cursor + 24);
        const nameLen = zipBuf.readUInt16LE(cursor + 28);
        const extraLen = zipBuf.readUInt16LE(cursor + 30);
        const commentLen = zipBuf.readUInt16LE(cursor + 32);
        const externalAttrs = zipBuf.readUInt32LE(cursor + 38);
        const localHeaderOffset = zipBuf.readUInt32LE(cursor + 42);
        const nameEnd = cursor + 46 + nameLen;
        if (nameEnd + extraLen + commentLen > centralDirOffset + centralDirSize) {
            throw new Error('Invalid ZIP archive: central directory entry overflows bounds');
        }
        const rawName = zipBuf.subarray(cursor + 46, nameEnd).toString('utf8');
        cursor = nameEnd + extraLen + commentLen;
        if ((flags & 0x0001) !== 0) {
            throw new Error(`Unsupported encrypted ZIP entry: ${rawName}`);
        }
        // Check Unix file mode bits for symlinks / special files (versionMadeBy high byte 3 = Unix)
        const hostOs = (versionMadeBy >>> 8) & 0xff;
        const unixMode = (externalAttrs >>> 16) & 0xffff;
        const unixFileType = unixMode & 0o170000;
        if (unixFileType === 0o120000) {
            throw new Error(`Unsafe ZIP entry (symlink rejected): ${rawName}`);
        }
        if (hostOs === 3 && unixFileType !== 0 && unixFileType !== 0o100000 && unixFileType !== 0o040000) {
            throw new Error(`Unsafe ZIP entry (special file type rejected): ${rawName}`);
        }
        const { relPath, isDir } = sanitizeZipEntryPath(rawName);
        if (!relPath) {
            continue;
        }
        const targetPath = path.resolve(resolvedDest, relPath);
        const relCheck = path.relative(resolvedDest, targetPath);
        if (!relCheck || relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
            throw new Error(`Unsafe ZIP entry escapes destination directory: ${rawName}`);
        }
        if (isDir || unixFileType === 0o040000) {
            fs.mkdirSync(targetPath, { recursive: true });
            continue;
        }
        if (method !== 0 && method !== 8) {
            throw new Error(`Unsupported ZIP compression method ${method} for entry: ${rawName}`);
        }
        if (localHeaderOffset + 30 > zipBuf.length) {
            throw new Error(`Invalid ZIP archive: local header out of bounds for ${rawName}`);
        }
        if (zipBuf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
            throw new Error(`Invalid ZIP archive: bad local file header signature for ${rawName}`);
        }
        const localNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
        const localExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > zipBuf.length) {
            throw new Error(`Invalid ZIP archive: compressed payload out of bounds for ${rawName}`);
        }
        if (totalExtractedBytes + uncompressedSize > maxTotalBytes) {
            throw new Error(`ZIP archive exceeds maximum extracted size limit (${maxTotalBytes} bytes)`);
        }
        const compressedSlice = zipBuf.subarray(dataStart, dataEnd);
        let fileData;
        if (method === 0) {
            fileData = Buffer.from(compressedSlice);
        }
        else {
            const remainingBudget = Math.max(0, maxTotalBytes - totalExtractedBytes);
            fileData = zlib.inflateRawSync(compressedSlice, { maxOutputLength: remainingBudget });
        }
        if (fileData.length !== uncompressedSize) {
            throw new Error(`ZIP entry size mismatch for ${rawName} (expected ${uncompressedSize}, got ${fileData.length})`);
        }
        if (crc32(fileData) !== expectedCrc) {
            throw new Error(`ZIP entry CRC-32 mismatch for ${rawName}`);
        }
        totalExtractedBytes += fileData.length;
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, fileData);
        if (process.platform !== 'win32' && hostOs === 3 && (unixMode & 0o111) !== 0) {
            try {
                fs.chmodSync(targetPath, 0o755);
            }
            catch { /* ignore */ }
        }
        extractedEntries.push(relPath);
    }
    return { entries: extractedEntries, totalBytes: totalExtractedBytes };
}
/**
 * Locate the plugin root directory inside an extracted archive staging folder
 * (supports both `antigravity-context-monitor/plugin.json` and flat `plugin.json`).
 */
function resolveExtractedPluginRoot(extractDir) {
    if (fs.existsSync(path.join(extractDir, 'plugin.json'))) {
        return extractDir;
    }
    const namedDir = path.join(extractDir, exports.EXPECTED_PLUGIN_NAME);
    if (fs.existsSync(path.join(namedDir, 'plugin.json'))) {
        return namedDir;
    }
    const entries = fs.readdirSync(extractDir).filter(name => !name.startsWith('.'));
    if (entries.length === 1) {
        const candidate = path.join(extractDir, entries[0]);
        try {
            if (fs.lstatSync(candidate).isDirectory() && fs.existsSync(path.join(candidate, 'plugin.json'))) {
                return candidate;
            }
        }
        catch {
            // fall through
        }
    }
    throw new Error('Extracted update archive does not contain a valid plugin.json root');
}
/**
 * Validate an extracted plugin bundle before atomic swap:
 * - `plugin.json` exists, is a regular file, and parses cleanly
 * - `name === 'antigravity-context-monitor'`
 * - valid semver `version`
 * - `sidecars/context_monitor/main.mjs` exists and is a regular file
 */
function validateExtractedPluginBundle(pluginRootDir) {
    const manifestPath = path.join(pluginRootDir, 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Plugin bundle validation failed: missing plugin.json');
    }
    const manifestStat = fs.lstatSync(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
        throw new Error('Plugin bundle validation failed: plugin.json must be a regular file');
    }
    let manifest;
    try {
        const raw = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('manifest is not an object');
        }
        manifest = parsed;
    }
    catch (err) {
        throw new Error(`Plugin bundle validation failed: invalid plugin.json (${err instanceof Error ? err.message : String(err)})`);
    }
    if (manifest.name !== exports.EXPECTED_PLUGIN_NAME) {
        throw new Error(`Plugin bundle validation failed: unexpected plugin name "${String(manifest.name ?? '')}"`);
    }
    const versionStr = typeof manifest.version === 'string' ? manifest.version.trim() : '';
    const semver = parseSemver(versionStr);
    if (!semver) {
        throw new Error(`Plugin bundle validation failed: invalid semver version "${versionStr}"`);
    }
    const entrypointPath = path.join(pluginRootDir, 'sidecars', 'context_monitor', 'main.mjs');
    if (!fs.existsSync(entrypointPath)) {
        throw new Error('Plugin bundle validation failed: missing sidecars/context_monitor/main.mjs');
    }
    const entryStat = fs.lstatSync(entrypointPath);
    if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
        throw new Error('Plugin bundle validation failed: sidecars/context_monitor/main.mjs must be a regular file');
    }
    return {
        name: exports.EXPECTED_PLUGIN_NAME,
        version: semver.normalized,
        pluginRootDir,
        manifest,
    };
}
// ─── Atomic Install with Backup & Rollback ───────────────────────────────────
const SWAP_RETRY_DELAYS_MS = [20, 50, 100, 200];
async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}
async function renameDirWithRetry(src, dest, renameFn = (a, b) => fs.promises.rename(a, b)) {
    for (let attempt = 0;; attempt++) {
        try {
            await renameFn(src, dest);
            return;
        }
        catch (err) {
            const code = err.code;
            const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
            if (!retryable || attempt >= SWAP_RETRY_DELAYS_MS.length) {
                throw err;
            }
            await sleep(SWAP_RETRY_DELAYS_MS[attempt]);
        }
    }
}
async function copyDirContents(srcDir, destDir) {
    await fs.promises.mkdir(destDir, { recursive: true });
    await fs.promises.cp(srcDir, destDir, { recursive: true, force: true });
}
async function clearDirEntries(dirPath) {
    const entries = await fs.promises.readdir(dirPath);
    for (const entry of entries) {
        await fs.promises.rm(path.join(dirPath, entry), { recursive: true, force: true });
    }
}
/**
 * Download, verify (SHA-256 + safe ZIP + bundle manifest), and atomically install
 * a GitHub Release App plugin update into `targetPluginDir` with automatic backup & rollback.
 */
async function applyAppPluginUpdate(options) {
    const currentVersion = (options.currentVersion || '0.0.0').trim();
    const targetPluginDir = path.resolve(options.targetPluginDir);
    const parentDir = path.dirname(targetPluginDir);
    const nowMs = (options.now ?? (() => Date.now()))();
    const nonce = crypto.randomBytes(4).toString('hex');
    const stageDir = path.join(parentDir, `.${path.basename(targetPluginDir)}.stage-${nowMs}-${nonce}`);
    const backupDir = `${targetPluginDir}.bak-${nowMs}-${nonce}`;
    const renameFn = options.renameDir ?? fs.promises.rename;
    const downloadTimeoutMs = options.timeoutMs ?? exports.DEFAULT_DOWNLOAD_TIMEOUT_MS;
    const reqHeaders = {
        'User-Agent': `Antigravity-Context-Monitor/${currentVersion}`,
        'Accept': 'application/octet-stream',
    };
    let checksumVerified = false;
    let movedExistingToBackup = false;
    let copiedExistingToBackup = false;
    try {
        // 1. Validate URLs up front (strict HTTPS host allowlist)
        const zipUrl = validateReleaseUrl(options.releaseInfo.assetUrl).toString();
        const checksumsUrl = options.releaseInfo.checksumsUrl
            ? validateReleaseUrl(options.releaseInfo.checksumsUrl).toString()
            : null;
        // 2. Download ZIP archive
        const zipRes = await fetchAllowedHttps(zipUrl, {
            headers: reqHeaders,
            timeoutMs: downloadTimeoutMs,
            maxBytes: exports.MAX_ARCHIVE_BYTES,
            transport: options.transport,
        });
        if (zipRes.statusCode < 200 || zipRes.statusCode >= 300) {
            throw new Error(`Failed to download update archive (HTTP ${zipRes.statusCode})`);
        }
        const zipBuf = zipRes.body;
        // 3. Download & verify SHA256SUMS.txt if published (fail closed whenever published)
        if (checksumsUrl) {
            const sumRes = await fetchAllowedHttps(checksumsUrl, {
                headers: {
                    'User-Agent': `Antigravity-Context-Monitor/${currentVersion}`,
                    'Accept': 'text/plain',
                },
                timeoutMs: exports.DEFAULT_API_TIMEOUT_MS,
                maxBytes: exports.MAX_CHECKSUMS_BYTES,
                transport: options.transport,
            });
            if (sumRes.statusCode < 200 || sumRes.statusCode >= 300) {
                throw new Error(`Failed to download SHA256SUMS.txt (HTTP ${sumRes.statusCode})`);
            }
            const sums = parseSha256Sums(sumRes.body.toString('utf8'));
            const assetKey = options.releaseInfo.assetName.trim().toLowerCase();
            const expectedDigest = sums.get(assetKey) || sums.get(path.posix.basename(assetKey));
            if (!expectedDigest) {
                throw new Error(`SHA256SUMS.txt did not contain an entry for ${options.releaseInfo.assetName}`);
            }
            if (!verifyBufferSha256(zipBuf, expectedDigest)) {
                throw new Error(`SHA-256 checksum mismatch for ${options.releaseInfo.assetName}`);
            }
            checksumVerified = true;
        }
        // 4. Safe pure-Node ZIP extraction into temp staging dir
        await fs.promises.mkdir(parentDir, { recursive: true });
        await fs.promises.mkdir(stageDir, { recursive: true });
        extractZipSafe(zipBuf, stageDir);
        // 5. Resolve & validate extracted plugin bundle
        const extractedRoot = resolveExtractedPluginRoot(stageDir);
        const validated = validateExtractedPluginBundle(extractedRoot);
        // 6. Atomic swap with backup & Windows EPERM/EBUSY fallback
        const hadExisting = fs.existsSync(targetPluginDir);
        if (hadExisting) {
            try {
                await renameDirWithRetry(targetPluginDir, backupDir, renameFn);
                movedExistingToBackup = true;
            }
            catch (backupErr) {
                const code = backupErr.code;
                const isLockErr = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
                if (!isLockErr) {
                    throw backupErr;
                }
                // Windows open-handle fallback: copy existing dir to backup, then replace contents cleanly
                await copyDirContents(targetPluginDir, backupDir);
                copiedExistingToBackup = true;
            }
        }
        if (copiedExistingToBackup) {
            await clearDirEntries(targetPluginDir);
            await copyDirContents(extractedRoot, targetPluginDir);
        }
        else {
            await renameDirWithRetry(extractedRoot, targetPluginDir, renameFn);
        }
        // 7. Post-swap sanity validation
        validateExtractedPluginBundle(targetPluginDir);
        // 8. Cleanup backup & staging on success
        if (fs.existsSync(backupDir)) {
            await fs.promises.rm(backupDir, { recursive: true, force: true }).catch(() => { });
        }
        await fs.promises.rm(stageDir, { recursive: true, force: true }).catch(() => { });
        return {
            ok: true,
            previousVersion: currentVersion,
            installedVersion: validated.version,
            requiresReload: true,
            checksumVerified,
            message: `Updated antigravity-context-monitor from v${currentVersion} to v${validated.version}. Reload or toggle the plugin in Antigravity Customizations to apply.`,
        };
    }
    catch (err) {
        let rolledBack = false;
        if (movedExistingToBackup || copiedExistingToBackup) {
            try {
                if (movedExistingToBackup) {
                    if (fs.existsSync(targetPluginDir)) {
                        await fs.promises.rm(targetPluginDir, { recursive: true, force: true });
                    }
                    if (fs.existsSync(backupDir)) {
                        await renameDirWithRetry(backupDir, targetPluginDir, fs.promises.rename);
                        rolledBack = true;
                    }
                }
                else if (copiedExistingToBackup && fs.existsSync(backupDir)) {
                    await fs.promises.mkdir(targetPluginDir, { recursive: true });
                    await clearDirEntries(targetPluginDir);
                    await copyDirContents(backupDir, targetPluginDir);
                    await fs.promises.rm(backupDir, { recursive: true, force: true }).catch(() => { });
                    rolledBack = true;
                }
            }
            catch {
                rolledBack = false;
            }
        }
        await fs.promises.rm(stageDir, { recursive: true, force: true }).catch(() => { });
        const msg = err instanceof Error ? err.message : String(err);
        return {
            ok: false,
            previousVersion: currentVersion,
            installedVersion: currentVersion,
            requiresReload: false,
            checksumVerified,
            rolledBack,
            message: rolledBack
                ? `Plugin update failed and was rolled back to v${currentVersion}: ${msg}`
                : `Plugin update failed: ${msg}`,
            error: msg,
        };
    }
}
//# sourceMappingURL=plugin-updater.js.map