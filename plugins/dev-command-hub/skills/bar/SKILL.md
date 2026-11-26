---
name: bar
description: >-
  Render an ultra-compact inline quick command selector bar directly in the
  chat stream above the composer. Use when the user runs /bar or asks for a
  quick inline command bar, dropdown selector above the input box, or compact
  command picker in chat.
---

# 内联快捷选择条（/bar）

当用户运行 `/bar`，或表达“呼出快捷指令条 / 输入框上方快捷选择框 / 在对话里放一个指令下拉条”时执行：

1. **直接调用 MCP 工具 `open_quick_bar`**（所属服务：`dev-command-hub_hub`，若用户指定了某条指令可传 `{"selected": "<id>"}`，否则传 `{}`）。
2. 该工具以 **Inline MCP App** 形式直接嵌入当前对话流底部、紧挨聊天输入框上方（带分组下拉选择框、参数输入框、智能防误触「发送 / 附加 / 复制」与收藏胶囊）。
3. 工具调用成功后，仅回复一句极简提示（例如：`已为你呼出内联快捷选择条，可直接在上方选择指令或点胶囊发送。`），避免长篇大论把选择条顶出视野。
4. 若处于 **Antigravity CLI**（不支持内联 UI），改用 `cmd` 技能输出精简文本速查。
