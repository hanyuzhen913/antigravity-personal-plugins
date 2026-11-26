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
exports.buildChatHistoryTabContent = buildChatHistoryTabContent;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const i18n_1 = require("./i18n");
const tracker_1 = require("./tracker");
const webview_helpers_1 = require("./webview-helpers");
const webview_icons_1 = require("./webview-icons");
function getAntigravityRoot() {
    return path.join(os.homedir(), '.gemini', 'antigravity');
}
function exists(targetPath) {
    try {
        fs.accessSync(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
function fileUriToPath(uri) {
    if (!uri) {
        return '';
    }
    if (uri.startsWith('file:///')) {
        const raw = decodeURIComponent(uri.replace('file:///', ''));
        return process.platform === 'win32'
            ? raw.replace(/\//g, path.sep)
            : '/' + raw;
    }
    return uri;
}
function getWorkspaceLabel(workspaceUri, repositoryName) {
    const localPath = fileUriToPath(workspaceUri);
    const cleanPath = localPath.replace(/[\\/]+$/, '');
    const base = cleanPath ? path.basename(cleanPath) : '';
    const resolvedName = base || repositoryName;
    const label = resolvedName || (0, i18n_1.tBi)('Unscoped', '未分组');
    const labelHtml = resolvedName ? (0, webview_helpers_1.esc)(resolvedName) : (0, webview_helpers_1.tBiHtml)('Unscoped', '未分组');
    const subtitleHtml = repositoryName && repositoryName !== label
        ? (0, webview_helpers_1.esc)(repositoryName)
        : (cleanPath ? (0, webview_helpers_1.esc)(cleanPath) : (0, webview_helpers_1.tBiHtml)('No workspace path', '无工作区路径'));
    return { label, labelHtml, subtitleHtml, localPath: cleanPath };
}
function getGMStats(cascadeId, gmSummary, gmConversations) {
    const conversation = gmSummary?.conversations.find(item => item.cascadeId === cascadeId)
        || gmConversations?.[cascadeId]
        || null;
    if (!conversation || conversation.calls.length === 0) {
        return { calls: 0, credits: 0, latestModel: '' };
    }
    let credits = 0;
    for (const call of conversation.calls) {
        credits += call.credits;
    }
    const latestCall = conversation.calls[conversation.calls.length - 1];
    return {
        calls: conversation.calls.length,
        credits,
        latestModel: latestCall.responseModel || latestCall.modelDisplay || latestCall.model || '',
    };
}
function buildEntries(trajectories, currentUsage, gmSummary, gmConversations, currentWorkspaceUri) {
    const antigravityRoot = getAntigravityRoot();
    const normalizedCurrentWorkspace = currentWorkspaceUri ? (0, tracker_1.normalizeUri)(currentWorkspaceUri) : '';
    const currentRepoName = currentUsage?.repositoryName || '';
    return trajectories.map((trajectory) => {
        const workspaceUri = (Array.isArray(trajectory.workspaceUris) ? trajectory.workspaceUris[0] : '') || trajectory.gitRootUri || '';
        const workspaceMeta = getWorkspaceLabel(workspaceUri, trajectory.repositoryName || '');
        const normalizedWorkspace = workspaceUri ? (0, tracker_1.normalizeUri)(workspaceUri) : '';
        const gmStats = getGMStats(trajectory.cascadeId, gmSummary, gmConversations);
        const pbPath = path.join(antigravityRoot, 'conversations', `${trajectory.cascadeId}.pb`);
        const brainDir = path.join(antigravityRoot, 'brain', trajectory.cascadeId);
        const recordingDir = path.join(antigravityRoot, 'browser_recordings', trajectory.cascadeId);
        const modelId = trajectory.requestedModel || trajectory.generatorModel || '';
        const shortId = (trajectory.cascadeId || '').substring(0, 8);
        return {
            cascadeId: trajectory.cascadeId,
            title: trajectory.summary || `${(0, i18n_1.tBi)('Conversation', '对话')} ${shortId}`,
            titleHtml: trajectory.summary
                ? (0, webview_helpers_1.esc)(trajectory.summary)
                : `${(0, webview_helpers_1.tBiHtml)('Conversation', '对话')} ${(0, webview_helpers_1.esc)(shortId)}`,
            workspaceLabel: workspaceMeta.label,
            workspaceLabelHtml: workspaceMeta.labelHtml,
            workspaceSubtitleHtml: workspaceMeta.subtitleHtml,
            workspacePath: workspaceMeta.localPath,
            workspaceUri,
            repositoryName: trajectory.repositoryName || '',
            branchName: trajectory.branchName || '',
            status: (trajectory.status || 'UNKNOWN').replace('CASCADE_STATUS_', '').replace('CASCADE_RUN_STATUS_', ''),
            modelLabel: (0, tracker_1.getModelDisplayName)(modelId || ''),
            stepCount: trajectory.stepCount,
            createdTime: trajectory.createdTime,
            lastModifiedTime: trajectory.lastModifiedTime,
            lastUserInputTime: trajectory.lastUserInputTime,
            isCurrentSession: currentUsage?.cascadeId === trajectory.cascadeId,
            isCurrentWorkspace: !!normalizedCurrentWorkspace && normalizedWorkspace === normalizedCurrentWorkspace,
            isCurrentRepo: !!currentRepoName && trajectory.repositoryName === currentRepoName,
            hasPb: exists(pbPath),
            hasBrain: exists(brainDir),
            hasRecording: exists(recordingDir),
            gmCalls: gmStats.calls,
            gmCredits: gmStats.credits,
            latestGMModel: gmStats.latestModel,
        };
    }).sort((a, b) => Date.parse(b.lastModifiedTime || '') - Date.parse(a.lastModifiedTime || ''));
}
function buildGroups(entries) {
    const grouped = new Map();
    for (const entry of entries) {
        const key = entry.workspacePath || entry.repositoryName || entry.workspaceLabel;
        const existing = grouped.get(key);
        if (existing) {
            existing.entries.push(entry);
            existing.isCurrentWorkspace = existing.isCurrentWorkspace || entry.isCurrentWorkspace;
            continue;
        }
        grouped.set(key, {
            key,
            labelHtml: entry.workspaceLabelHtml,
            subtitleHtml: entry.workspacePath
                ? (0, webview_helpers_1.esc)(entry.workspacePath)
                : (entry.repositoryName ? (0, webview_helpers_1.esc)(entry.repositoryName) : entry.workspaceSubtitleHtml),
            entries: [entry],
            isCurrentWorkspace: entry.isCurrentWorkspace,
        });
    }
    return [...grouped.values()]
        .sort((a, b) => {
        if (a.isCurrentWorkspace !== b.isCurrentWorkspace) {
            return a.isCurrentWorkspace ? -1 : 1;
        }
        const aLatest = Date.parse(a.entries[0]?.lastModifiedTime || '') || 0;
        const bLatest = Date.parse(b.entries[0]?.lastModifiedTime || '') || 0;
        return bLatest - aLatest;
    });
}
// ── Inline SVG Icons ──
const IC = {
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
};
// ── Localized status badge helper ──
function renderStatusBadgeLabel(status) {
    switch ((status || 'UNKNOWN').toUpperCase()) {
        case 'RUNNING': return (0, webview_helpers_1.tBiHtml)('Running', '运行中');
        case 'FINISHED': return (0, webview_helpers_1.tBiHtml)('Finished', '已完成');
        case 'IDLE': return (0, webview_helpers_1.tBiHtml)('Idle', '空闲');
        case 'CANCELLED':
        case 'CANCELED': return (0, webview_helpers_1.tBiHtml)('Cancelled', '已取消');
        case 'FAILED':
        case 'ERROR': return (0, webview_helpers_1.tBiHtml)('Failed', '失败');
        case 'PENDING':
        case 'QUEUED': return (0, webview_helpers_1.tBiHtml)('Pending', '等待中');
        case 'UNKNOWN': return (0, webview_helpers_1.tBiHtml)('Unknown', '未知');
        default: return (0, webview_helpers_1.esc)(status);
    }
}
// ── Compact date formatting ──
function fmtCompactDate(iso) {
    if (!iso) {
        return '';
    }
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) {
            return '';
        }
        const p = (n) => String(n).padStart(2, '0');
        return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    catch {
        return '';
    }
}
// ── Shortcut filter cards ──
function renderShortcuts(entries, currentUsage) {
    const currentRepoName = currentUsage?.repositoryName || entries.find(e => e.isCurrentRepo)?.repositoryName || '';
    const currentWorkspaceCount = entries.filter(e => e.isCurrentWorkspace).length;
    const currentRepoCount = currentRepoName ? entries.filter(e => e.isCurrentRepo).length : 0;
    const recordableCount = entries.filter(e => e.hasBrain || e.hasPb || e.hasRecording).length;
    const cards = [
        {
            filter: 'current',
            icon: webview_icons_1.ICON.folder,
            titleHtml: (0, webview_helpers_1.tBiHtml)('Current Workspace', '当前工作区'),
            count: currentWorkspaceCount,
            active: currentWorkspaceCount > 0,
        },
        {
            filter: 'currentrepo',
            icon: webview_icons_1.ICON.git,
            titleHtml: currentRepoName ? (0, webview_helpers_1.esc)(currentRepoName) : (0, webview_helpers_1.tBiHtml)('Current Repo', '当前仓库'),
            count: currentRepoCount,
            active: currentRepoCount > 0,
        },
        {
            filter: 'recordable',
            icon: webview_icons_1.ICON.database,
            titleHtml: (0, webview_helpers_1.tBiHtml)('Backup Ready', '可备份'),
            count: recordableCount,
            active: recordableCount > 0,
        },
    ];
    return `
        <div class="ses-shortcuts">
            ${cards.map(card => `
                <button
                    type="button"
                    class="ses-shortcut${card.active ? '' : ' is-disabled'}"
                    data-history-shortcut="${card.filter}"
                    ${card.active ? '' : 'disabled'}
                >
                    <span class="ses-shortcut-icon">${card.icon}</span>
                    <span class="ses-shortcut-title">${card.titleHtml}</span>
                    <span class="ses-shortcut-count">${card.count}</span>
                </button>
            `).join('')}
        </div>`;
}
// ── Compact toolbar (search + filters) ──
function renderToolbar() {
    return `
        <div class="ses-toolbar">
            <div class="ses-search-wrap">
                ${webview_icons_1.ICON.search}
                <input
                    id="historySearchInput" aria-label="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Search sessions', '搜索会话'))}"
                    class="ses-search-input"
                    type="text"
                    placeholder="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Search title, folder, repo, model...', '搜索标题、文件夹、仓库、模型...'))}"
                    autocomplete="off"
                    spellcheck="false"
                />
            </div>
            <div class="ses-filters" role="group" aria-label="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Session catalog filters', '会话目录筛选'))}">
                <button type="button" class="ses-filter-btn is-active" aria-pressed="true" data-history-filter="all"><span>${(0, webview_helpers_1.tBiHtml)('All', '全部')}</span></button>
                <button type="button" class="ses-filter-btn" aria-pressed="false" data-history-filter="current"><span>${(0, webview_helpers_1.tBiHtml)('Workspace', '工作区')}</span></button>
                <button type="button" class="ses-filter-btn" aria-pressed="false" data-history-filter="currentrepo"><span>${(0, webview_helpers_1.tBiHtml)('Repo', '仓库')}</span></button>
                <button type="button" class="ses-filter-btn" aria-pressed="false" data-history-filter="running"><span>${(0, webview_helpers_1.tBiHtml)('Running', '运行中')}</span></button>
                <button type="button" class="ses-filter-btn" aria-pressed="false" data-history-filter="recordable"><span>${(0, webview_helpers_1.tBiHtml)('Recordable', '可备份')}</span></button>
            </div>
        </div>`;
}
// ── Single session row (compact card) ──
function renderRow(entry) {
    const searchCorpus = [
        entry.title, entry.workspaceLabel, entry.workspacePath,
        entry.repositoryName, entry.branchName, entry.modelLabel, entry.latestGMModel,
    ].join(' ').toLowerCase();
    const statusClass = entry.status === 'RUNNING' ? 'is-running'
        : entry.status === 'FINISHED' ? 'is-finished' : 'is-idle';
    // ── Context line: repo/branch ──
    const contextParts = [];
    if (entry.repositoryName) {
        contextParts.push((0, webview_helpers_1.esc)(entry.repositoryName));
    }
    if (entry.branchName) {
        contextParts.push(`<span class="ses-ctx-branch">${webview_icons_1.ICON.branch} ${(0, webview_helpers_1.esc)(entry.branchName)}</span>`);
    }
    // ── Metric chips (time only; calls/credits/steps shown elsewhere) ──
    const chips = [];
    // ── Time range ──
    const created = fmtCompactDate(entry.createdTime);
    const modified = fmtCompactDate(entry.lastModifiedTime);
    if (created || modified) {
        const timeStr = created && modified && created !== modified
            ? `${created} → ${modified}`
            : (modified || created);
        chips.push(`<span class="ses-chip ses-chip-time">${IC.clock} ${(0, webview_helpers_1.esc)(timeStr)}</span>`);
    }
    // ── Storage badges (consistent localized labeling) ──
    const storageTags = [];
    if (entry.hasBrain) {
        storageTags.push(`<span class="ses-storage-tag" title="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Brain folder', 'Brain 记录目录'))}"><span>${(0, webview_helpers_1.tBiHtml)('Brain', '记录')}</span></span>`);
    }
    if (entry.hasRecording) {
        storageTags.push(`<span class="ses-storage-tag" title="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Browser recording', '浏览器录屏'))}"><span>${(0, webview_helpers_1.tBiHtml)('Rec', '录屏')}</span></span>`);
    }
    if (entry.hasPb) {
        storageTags.push(`<span class="ses-storage-tag" title="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Conversation .pb file', '对话 .pb 存档文件'))}"><span>${(0, webview_helpers_1.tBiHtml)('PB', '存档')}</span></span>`);
    }
    // ── Action buttons (icon-only, compact, CSS tooltip) ──
    const actions = `
        <div class="ses-row-actions">
            <button
                type="button"
                class="ses-act-btn" data-tooltip="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Open Workspace', '打开工作区'))}" aria-label="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Open Workspace', '打开工作区'))}"
                data-history-action="workspace"
                data-history-uri="${(0, webview_helpers_1.esc)(entry.workspaceUri)}"
                ${entry.workspaceUri ? '' : 'disabled'}
            >${webview_icons_1.ICON.folder}</button>
            <button
                type="button"
                class="ses-act-btn ses-act-accent" data-tooltip="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Record Folder', '记录目录'))}" aria-label="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('Record Folder', '记录目录'))}"
                data-history-action="record"
                data-cascade-id="${(0, webview_helpers_1.esc)(entry.cascadeId)}"
            >${webview_icons_1.ICON.chat}</button>
            <button
                type="button"
                class="ses-act-btn" data-tooltip="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('PB File', 'PB 文件'))}" aria-label="${(0, webview_helpers_1.esc)((0, i18n_1.tBi)('PB File', 'PB 文件'))}"
                data-history-action="pb"
                data-cascade-id="${(0, webview_helpers_1.esc)(entry.cascadeId)}"
                ${entry.hasPb ? '' : 'disabled'}
            >${webview_icons_1.ICON.file}</button>
        </div>`;
    return `
        <article
            class="ses-row${entry.isCurrentSession ? ' is-current' : ''}"
            data-history-row="true"
            data-search="${(0, webview_helpers_1.esc)(searchCorpus)}"
            data-current-workspace="${entry.isCurrentWorkspace ? 'true' : 'false'}"
            data-current-repo="${entry.isCurrentRepo ? 'true' : 'false'}"
            data-running="${entry.status === 'RUNNING' ? 'true' : 'false'}"
            data-recordable="${entry.hasPb || entry.hasBrain || entry.hasRecording ? 'true' : 'false'}"
        >
            <div class="ses-row-head">
                <h3 class="ses-row-title" title="${(0, webview_helpers_1.esc)(entry.cascadeId)}">${entry.titleHtml}</h3>
                <div class="ses-row-badges">
                    ${entry.isCurrentSession ? `<span class="ses-badge is-current"><span>${(0, webview_helpers_1.tBiHtml)('Current', '当前')}</span></span>` : ''}
                    ${entry.isCurrentWorkspace ? `<span class="ses-badge is-workspace"><span>${(0, webview_helpers_1.tBiHtml)('WS', '本区')}</span></span>` : ''}
                    <span class="ses-badge ${statusClass}"><span>${renderStatusBadgeLabel(entry.status)}</span></span>
                </div>
            </div>
            ${contextParts.length > 0 ? `<div class="ses-row-ctx">${contextParts.join(' <span class="ses-ctx-sep">·</span> ')}</div>` : ''}
            <div class="ses-row-metrics">
                <div class="ses-chips">${chips.join('')}</div>
                ${storageTags.length > 0 ? `<div class="ses-storage">${storageTags.join('')}</div>` : ''}
            </div>
            ${actions}
        </article>`;
}
// ── Group (collapsible) ──
function renderGroup(group, index) {
    const runningCount = group.entries.filter(e => e.status === 'RUNNING').length;
    const openAttr = group.isCurrentWorkspace || index === 0 ? ' open' : '';
    return `
        <details class="collapsible ses-group" id="history-group-${index}"${openAttr}>
            <summary>
                <div class="ses-group-head">
                    <div class="ses-group-labels">
                        <span class="ses-group-title">${group.labelHtml}</span>
                        <span class="ses-group-path">${group.subtitleHtml}</span>
                    </div>
                    <div class="ses-group-chips">
                        ${group.isCurrentWorkspace ? `<span class="ses-group-chip is-ws"><span>${(0, webview_helpers_1.tBiHtml)('Current', '当前')}</span></span>` : ''}
                        <span class="ses-group-chip">${group.entries.length}</span>
                        ${runningCount > 0 ? `<span class="ses-group-chip is-run"><span>${runningCount} ${(0, webview_helpers_1.tBiHtml)('run', '运行')}</span></span>` : ''}
                    </div>
                </div>
            </summary>
            <div class="details-body ses-group-body">
                ${group.entries.map(e => renderRow(e)).join('')}
            </div>
        </details>`;
}
function buildChatHistoryTabContent(trajectories, currentUsage, gmSummary, gmConversations, currentWorkspaceUri) {
    const header = `<header class="ed-pane-header"><h2 class="ed-pane-title">${(0, webview_helpers_1.tBiHtml)('Sessions', '会话')}</h2></header>`;
    if (!trajectories || trajectories.length === 0) {
        return `${header}<p class="empty-msg">${(0, webview_helpers_1.tBiHtml)('Waiting for trajectory data... the session catalog will appear after the first LS sync.', '正在等待轨迹数据... 首次和 LS 同步后会自动显示会话目录。')}</p>`;
    }
    const entries = buildEntries(trajectories, currentUsage, gmSummary, gmConversations, currentWorkspaceUri);
    const groups = buildGroups(entries);
    return `
        ${header}
        ${renderShortcuts(entries, currentUsage)}
        ${renderToolbar()}
        <section class="ses-groups" id="historyGroups">
            ${groups.map((group, index) => renderGroup(group, index)).join('')}
        </section>`;
}
//# sourceMappingURL=webview-chat-history-tab.js.map