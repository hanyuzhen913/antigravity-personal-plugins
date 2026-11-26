# Dev Command Hub (`dev-command-hub` v2.2)

高颜值、零记忆负担的 Antigravity **原生 MCP App** 全量指令效率中心：支持左侧栏全屏、右侧边栏常驻微型面板，以及**紧贴聊天输入框上方的内联快捷选择条（`/bar`）**。

---

## v2.2 三大高频入口

1. **聊天输入框上方：内联快捷选择条（`/bar`）**
   - 在对话中敲 `/bar` 或点击插件卡片 **`⚡ 呼出内联快捷选择条 (/bar)`**，会在聊天流底部、紧挨输入框上方嵌入超薄交互条：
   - 分组下拉框覆盖 **3 套工作流 + 自定义 Prompt 模板 + 24 条官方指令**，搭配参数输入框、一键 **「发送 / 附加 / 复制」** 与 **★ 收藏/最近胶囊**。
2. **右侧边栏：常驻微型面板（`⋯ > 插件 > Command Hub`）**
   - 紧凑单行顶栏 + 亮/暗双主题瓷白/黑曜石毛玻璃 + 微型模式外露工作流直发按钮 + `+ 新增` 自定义指令/模板 + `备份` JSON 导入导出。
3. **左侧栏：全局全屏控制台（`插件 > Command Hub`）**
   - 宽屏双列完整视图，集中浏览搜索、编辑自定义项与复制指令。

> **安全防误触**：`仅 CLI` 指令在面板与 `/bar` 中均自动替换为 `复制(CLI)`，不会误发进 App 对话；高配额指令（`/boost`、`/swarm`、`/teamwork`、`/run-workflow`）点击发送后会进入 3 秒琥珀色 **`确认发送?`** 状态，防手滑烧配额。

---

## 极简短指令（App & CLI 通用）

| 短指令 | 功能 | 说明 |
| :--- | :--- | :--- |
| **`/bar`** | 呼出内联快捷选择条 | 在当前聊天框正上方渲染超薄指令下拉条 + 收藏胶囊（仅 App 内联 UI；CLI 自动降级 `/cmd`） |
| **`/hub`** | 打开可视化指令控制台 | App 中打开原生 MCP App 侧边栏（降级时生成 HTML Artifact）；CLI 中降级为文本速查 |
| **`/nf`** | **新功能标准流** | `/grill-me` 反问对齐 → `/plan` 出方案 → 确认后实施 → 结束提醒 `/learn` 沉淀 |
| **`/dbg`** | **硬核排障流** | `/diff` + `/codesearch` 缩小现场 → 根因定位 → 疑难升 `/boost` → 前端联动 `/browser` |
| **`/ctx`** | **长对话减负流** | 评估上下文占用 → 生成可直接复制的 `/compact` 检查点 → 提炼关键决策 |
| **`/cmd`** | **中文意图智能路由** | 用中文大白话描述诉求，自动匹配最合适的单指令或组合流，并标注适用端与高配额提醒 |

---

## 全量 24 条指令与环境速查

| 分类 | 指令 | 适用环境 | 备注 |
| :--- | :--- | :--- | :--- |
| **需求与执行** | `/grill-me`, `/plan`, `/goal`, `/schedule` | 通用 | `/schedule` 为当前会话内定时 |
| | `/automation` | 仅 App | 创建后台独立自动化（Automations 页管理） |
| **多智能体攻坚** | `/boost`, `/teamwork` | 通用 | ⚠️ 高配额・付费计划可用（3 秒二次确认） |
| | `/swarm` | App / CLI | ⚠️ 高配额（3 秒二次确认；CLI 可用 `Alt+S` 看看板） |
| **调试与可视化** | `/browser` | 通用 | 内置浏览器交互点检与视觉验收 |
| | `/generative_ui` | 仅 App | 生成交互式 HTML 图表与组件 |
| | `/codesearch`（`/cs`）, `/diff` | 仅 CLI | 面板自动转为复制，终端交互式全库检索与差异对比 |
| **上下文与会话** | `/btw` | 通用 | 只读旁支提问，不污染主历史 |
| | `/compact` | App / CLI | 摘要检查点释放上下文窗口 |
| | `/context`, `/fork`（`/branch`）, `/rewind`（`/undo`）, `/clear`（`/new`） | 仅 CLI | 面板自动转为复制，终端 Token 面板与分支回退 |
| **定制与工程** | `/learn`, `/agy-customizations` | 通用 | 经验沉淀与定制组件编写排错 |
| | `/run-workflow` | App / CLI | ⚠️ 高配额（3 秒二次确认），Python 动态多代理编排 |
| | `/antigravity-guide` | App / CLI | 官方最新文档检索问答 |
| | `/mcp`, `/skills reload` | 仅 CLI | 面板自动转为复制，终端 MCP 管理与技能热重载 |

---

## 可选：Antigravity CLI 快捷键配置（`keybindings.json`）

Antigravity CLI 的 `~/.gemini/antigravity-cli/keybindings.json` 用于定制 **内置 TUI 动作热键**。本插件在 `skills/cmd/examples/keybindings.json` 提供了一份高频动作模板；在 CLI 中运行 `/keybindings` 即可编辑。

---

## 开发调试与手动校验

```bash
agy plugin validate --strict ~/antigravity-command-hub
agy plugin install ~/antigravity-command-hub
```
