---
name: cmd
description: >-
  Intelligent Chinese natural-language router and full 24-command reference for
  Antigravity. Use when the user runs /cmd, describes a workflow need in plain
  Chinese without naming a slash command, or asks which command fits a task
  and whether it works in App, CLI, or consumes high quota.
---

# 全量指令智能路由与速查（/cmd）

当用户运行 `/cmd`、用中文大白话提出流程/工具诉求、或询问某条指令的适用环境与配额消耗时使用本技能。

## 响应原则

1. **大白话精准映射**：遇到模糊或口语化请求，立刻识别最匹配的 **官方单指令** 或 **组合流（`/nf`、`/dbg`、`/ctx`）**。
2. **能直接做就直接做**：对于可在当前对话直接落地的能力（例如“别急着写先反问我”→ 进入 `/grill-me` 式反问，“先出方案”→ 进入 `/plan` 式规划，“打开面板”→ 转交 `hub` 技能），不要只干巴巴回复一个指令名，直接给出指令提示并顺势开始执行第一步。
3. **显式标注环境与配额**：每次推荐或解释指令时，必须带上：
   - **环境徽章**：`[通用]` / `[App / CLI]` / `[仅 App]` / `[仅 CLI]`
   - **配额/付费提示**：涉及 `/boost`、`/swarm`、`/teamwork`、`/run-workflow` 时，务必提醒 `⚠️ 高配额消耗`（`/boost` 与 `/teamwork` 需付费计划）。
4. **按需查阅完整手册**：当需要核对 24 条指令的完整别名、参数示例或 CLI `keybindings.json` 配置片段时，读取 [references/command-catalog.md](references/command-catalog.md) 或 [examples/keybindings.json](examples/keybindings.json)。

## 高频中文意图速查

- 「别急着写，先问清楚需求」 → **`/grill-me`** `[通用]`
- 「先出个方案看看」 → **`/plan`** `[通用]`
- 「自己跑通自测别老问我」 → **`/goal`** `[通用]`
- 「定时巡检 / 每天跑一次」 → 会话内 **`/schedule`** `[通用]`；后台独立自动化 **`/automation`** `[仅 App]`
- 「拆成几个模块同时写」 → **`/swarm`** `[App / CLI]` `⚠️ 高配额`
- 「这个 Bug 太难了深挖一下」 → **`/boost`** `[通用]` `⚠️ 高配额・付费`
- 「大型跨天项目重构」 → **`/teamwork`** `[通用]` `⚠️ 高配额・付费`
- 「顺便问个无关问题」 → **`/btw`** `[通用]`
- 「太长了整理下记忆」 → **`/ctx`** 或 **`/compact`** `[App / CLI]`
- 「把这次踩的坑记下来」 → **`/learn`** `[通用]`
- 「打开浏览器点一下测页面」 → **`/browser`** `[通用]`
- 「画个交互图/面板」 → **`/generative_ui`** `[仅 App]`（或 **`/hub`** 打开指令中心）
- 「全库搜一下 / 看看改了啥」 → **`/codesearch`（`/cs`）** / **`/diff`** `[仅 CLI]`
- 「回退到刚才 / 分叉试错 / 清屏」 → **`/rewind`** / **`/fork`** / **`/clear`** `[仅 CLI]`
