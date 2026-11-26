---
name: ctx
description: >-
  Run the Long-Session Relief Flow (/ctx): inspect context window usage,
  prepare a focused /compact checkpoint prompt preserving key decisions and
  next steps, and surface insights for /learn. Use when the user runs /ctx or
  says the conversation is too long.
---

# 长对话减负流（/ctx）

串联上下文治理链路：**评估占用 → `/compact` 生成高质量检查点 → 沉淀关键决策**。

## 执行阶段

### 阶段 1：评估上下文占用
1. 根据当前运行端给出精准指引：
   - **Antigravity CLI**：建议运行 **`/context`** 打开 Token 占比可视化面板查看明细。
   - **Antigravity App**：若已安装 Context Monitor 插件，可打开其侧边栏面板查看上下文窗口与缓存命中率；也可由当前对话长度做定性评估。

### 阶段 2：生成可直接复制的 `/compact` 检查点指令
整理当前会话中**绝对不能丢失**的 4 类信息，浓缩成一条开箱即用的 `/compact` 指令供用户直接复制执行（App / CLI 通用）：
1. **当前目标与已完成进展**（精确到文件路径与核心结论）
2. **关键架构/技术决策及原因**
3. **已知约束、未完成项与当前阻塞点**
4. **紧接着的下一步动作**

输出格式示例：
```text
/compact 保留以下上下文：<1-3 句核心进度、关键文件路径与已确认决策>；下一步直接执行：<下一步具体任务>。
```

### 阶段 3：关键决策与记忆沉淀
- 顺手提炼 1–3 条本轮对话中值得长期保留的项目事实或踩坑教训；若属于跨会话规范，提示用户可在压缩前后使用 **`/learn`** 固化为规则或技能，以免长对话压缩后遗忘。
