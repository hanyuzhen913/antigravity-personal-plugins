# Antigravity Personal Plugins

本仓库采用 **Monorepo（单仓库托管三套独立插件）** 形式，收录了以下 3 个经过本地深度个性化定制的 Antigravity 插件，并将个人偏好与默认配置固化为开箱即用的默认选项（跨平台一键安装 / 反向同步）：

| 插件目录 | 说明 | 当前内置默认配置摘要 | 协议 |
| :--- | :--- | :--- | :--- |
| `plugins/obsidian-prism` | 光学玻璃 UI、动效编排、模型选择器与远程/本地统计套件 | `lightPreset: "alabaster"`、`motionLevel: "standard"`、`mascot: "r:k1"`、`accentTone: "iris"`、`codeFont: "jetbrains"`（`codeLigatures: true`）、`homeRipple: false`、`ripple: "off"`、`ambientIntensity: "0"`、`sidebarCompact: true`、`sidebarNavFold: "on"`、`autoUpdate: "off"` | **GPL-3.0-only** |
| `plugins/dev-command-hub` | 原生 MCP App 全量指令控制台与 `/bar` 内联快捷选择条 | `density: "full"`、初始最近使用 `["grill-me", "nf"]` | **MIT** |
| `plugins/antigravity-context-monitor` | 上下文窗口占用、缓存命中率、Token 拆分与配额消耗预测面板 | `displayLanguage: "zh"`、`quotaNotificationThreshold: 1`（脱敏偏好种子见 `defaults/context-monitor.defaults.json`） | **MIT** |

---

## 目录结构

```text
.
├── plugins/
│   ├── antigravity-context-monitor/   # Context Monitor 插件主体
│   ├── dev-command-hub/               # Dev Command Hub 插件主体
│   └── obsidian-prism/                # Obsidian Prism 插件主体（含 MODIFICATIONS.md）
├── defaults/
│   ├── obsidian-prism.config.json     # Obsidian Prism 默认配置模板
│   ├── dev-command-hub.state.json     # Dev Command Hub 默认状态模板
│   └── context-monitor.defaults.json  # Context Monitor 脱敏偏好种子（无账号/历史账本）
├── scripts/
│   ├── install.mjs                    # 跨平台安装与双向同步脚本（纯 Node >=22）
│   ├── install.ps1                    # Windows PowerShell 快捷封装
│   └── validate.mjs                   # 严格校验、语法检查与隐私/敏感信息扫描
├── THIRD_PARTY_NOTICES.md             # 协议矩阵与上游版权声明
└── README.md
```

---

## 一键安装与使用

> 要求：Node.js `>= 22.0.0`（Antigravity 自带或本机安装均可），无需 `npm install`。

### Windows（PowerShell）

```powershell
# 1. 预览安装路径与操作（不写入磁盘）
.\scripts\install.ps1 --dry-run

# 2. 安装全部 3 个插件（已有本地配置时自动保留，不覆盖）
.\scripts\install.ps1

# 3. 安装并强制应用仓库内的个人默认配置（先备份原目录）
.\scripts\install.ps1 --force-defaults --backup
```

### macOS / Linux（或跨平台直接调用 Node）

```bash
# 预览安装
node scripts/install.mjs --dry-run

# 安装全部插件
node scripts/install.mjs

# 仅安装指定插件
node scripts/install.mjs --only obsidian-prism,dev-command-hub

# 强制写入 defaults/ 中的个人默认配置（Context Monitor 仅合并偏好项，不覆盖历史用量）
node scripts/install.mjs --force-defaults
```

### 将本地最新修改同步回仓库

如果你后续在 `~/.gemini/config/plugins/` 中继续调整了插件代码或界面设置，可以一键反向同步回本仓库（自动剔除 `.bundle-cache.json`、`.daemon.pid`、`daemon.log`、`repo-meta.json` 等运行期产物，并对 Context Monitor 状态文件做隐私脱敏）：

```bash
node scripts/install.mjs --sync-from-local
```

### 安装后如何生效

安装或更新完成后，请在 Antigravity 的 **Customizations / Plugins** 页面将对应插件 **关闭再开启（Off → On）**，或重启 Antigravity App 以加载最新代码。请勿手动直接编辑 `~/.gemini/config/config.json`。

---

## 上游更新检查说明

- **Obsidian Prism**：已在默认配置与内置 fallback 中设置 `"autoUpdate": "off"`，不会自动从上游拉取更新覆盖你的本地定制。
- **Antigravity Context Monitor**：保留轻量版本检查提示（`autoCheckUpdates: true`），但不会自动覆盖本地文件；仅当你主动在面板中点击升级或运行升级命令时才会拉取上游包（若需完全关闭检查，可在面板设置中关闭，或同步 `defaults/context-monitor.defaults.json` 里的 `autoCheckUpdates: false`）。

---

## 校验与卫生检查

每次提交前可运行内置校验器（会执行 `agy plugin validate --strict`、`node --check`、JSON 校验以及个人路径/密钥泄漏扫描）：

```bash
node scripts/validate.mjs
```

---

## 开源协议与上游致谢

本仓库为多插件聚合仓库，各插件保留各自许可证与上游版权声明，详见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)：
- `plugins/obsidian-prism`：**GPL-3.0-only**（基于 [RMvdesi/obsidian-prism](https://github.com/RMvdesi/obsidian-prism)，修改说明见 [`plugins/obsidian-prism/MODIFICATIONS.md`](./plugins/obsidian-prism/MODIFICATIONS.md)）。
- `plugins/antigravity-context-monitor`：**MIT**（基于 [AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor](https://github.com/AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor)）。
- `plugins/dev-command-hub`：**MIT**。

---

## 推送到 GitHub

在 GitHub 上创建一个新的公开空仓库（例如 `antigravity-personal-plugins`）后，在本目录执行：

```bash
git remote add origin https://github.com/<你的用户名>/antigravity-personal-plugins.git
git push -u origin main
```
