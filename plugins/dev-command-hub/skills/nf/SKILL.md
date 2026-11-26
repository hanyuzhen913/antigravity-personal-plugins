---
name: nf
description: >-
  Run the New Feature Standard Flow (/nf): clarify requirements with a
  /grill-me style interview, draft a reviewable /plan, implement and verify
  after user approval, and remind to capture lessons with /learn. Use when
  the user runs /nf or asks to build a new feature safely step by step.
---

# 新功能标准流（/nf）

串联官方最佳实践：**`/grill-me` 对齐 → `/plan` 出方案 → 确认后实施 → `/learn` 沉淀**。

## 执行阶段

### 阶段 1：需求反问对齐（`/grill-me` 风格）
1. 先快速浏览相关代码边界（如有需求描述或文件路径），不要急于修改任何文件。
2. 针对模糊点、边界条件、接口契约与验收标准，**每次只提 1 个最关键的问题**，并附带你的 **推荐默认选项**，让用户只需回复序号或简短确认即可推进；若用户已在首条消息中把需求说得非常明确，直接简述确认的假设并进入阶段 2。

### 阶段 2：输出可审阅方案（`/plan` 风格）
1. 列出清晰、可验证的实施步骤：涉及文件、核心改动点、边界处理与验证命令/测试方式。
2. 若当前处于普通对话模式，明确停下来请用户回复确认（或提示确认进入实施），在用户确认前不改动业务代码。

### 阶段 3：实施与自检
1. 严格按已确认方案编写代码与测试，避免无关范围蔓延。
2. 运行对应的测试、构建或静态检查并汇报真实结果；若涉及前端交互，可建议用 `/browser` 进行真实页面验收。

### 阶段 4：复盘沉淀提醒（`/learn`）
- 任务验收完成后，主动用一句话提醒用户：
  > 💡 如果本次开发中有值得团队或跨会话复用的规范/踩坑点，可输入 **`/learn`** 将其沉淀为持久化规则或技能。
