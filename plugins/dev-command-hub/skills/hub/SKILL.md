---
name: hub
description: >-
  Open the interactive Dev Command Hub panel (native MCP App in side pane or
  standalone fallback). Use when the user runs /hub, clicks the Command Hub
  starter prompt, or asks in Chinese/English to open the command panel,
  command hub, or visual shortcut console.
---

# 可视化指令控制台（/hub）

当用户触发 `/hub`、点击「🎛️ 打开可视化指令控制台」，或表达“打开指令面板 / 指令中心 / 控制台 / 看看有哪些指令”时执行本流程：

## 主路径（Antigravity App 原生 MCP App）

1. **优先调用 MCP 工具 `open_command_hub`**（所属服务：`dev-command-hub_hub`）：
   - 若用户明确说“微型模式/迷你面板”，传 `{"mode": "mini"}`；若说“全屏/完整模式”，传 `{"mode": "full"}`；其余情况传 `{}`（自动响应侧栏宽度）。
   - 该工具声明了 `aux_pane` 与 `global` 入口，调用后 Antigravity App 会在右侧边栏直接打开常驻交互式 **Command Hub**，支持**点击直接发送指令到当前对话**、**附加到输入框上方**、**一键复制**与**服务端持久化收藏**。
2. 简短告知用户面板已打开（并提示也可随时从左侧栏 **「插件 > Command Hub」** 或会话右上角 **`⋯ > 插件 > Command Hub`** 一键唤起）。

## 降级路径（无 MCP App 工具或非 App 环境）

- **MCP 工具尚未连接 / 不可用时**：读取本技能目录下的 `assets/command-hub.html`，使用原生 `write_file` 写入会话 Artifact 目录 `<Artifact Directory Path>/command-hub.html`（设置 `UserFacing: true`、`RequestFeedback: false`，不加 `<agent-embed>`），并附上可点击的 `file:///` 链接。
- **Antigravity CLI（无图形窗口）**：调用 `cmd` 技能输出文本指令速查表，并提示可在 Antigravity App 中打开原生侧栏面板。
