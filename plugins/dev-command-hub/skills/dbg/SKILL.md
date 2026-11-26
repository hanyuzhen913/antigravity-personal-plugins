---
name: dbg
description: >-
  Run the Hardcore Debugging Flow (/dbg): inspect recent changes and search
  code (/diff + /codesearch), form hypotheses, escalate subtle concurrency or
  algorithm bugs to /boost (paid, high quota), and verify UI issues with
  /browser. Use when the user runs /dbg or asks for systematic bug triage.
---

# 硬核排障流（/dbg）

串联高效排障链路：**`/diff` + `/codesearch` 查现场 → 根因定位与修复 → 疑难升 `/boost` → 前端联动 `/browser`**。

## 执行阶段

### 阶段 1：缩小现场（`/diff` + `/codesearch`）
1. **CLI 交互提示**：如用户在 Antigravity CLI 中，可先提示其用 **`/diff`** 查看近期变更与对话轮次改动、用 **`/codesearch`（别名 `/cs`）** 全库秒搜报错栈或关键符号。
2. **自主取证**：同时由你直接读取相关日志、运行 `git diff` / `git status` 或检索关键词与调用链，不要凭空猜测根因。

### 阶段 2：假设验证与精准修复
1. 给出明确假设与复现路径，优先用最小可复现实验或单元测试锁定根因。
2. 实施最小必要修复并重新运行失败用例确认转绿。

### 阶段 3：疑难升级与前端联动
* **复杂并发 / 竞态 / 底层算法**：若常规单轮排查两轮内无法收敛，主动建议用户切换 **`/boost <问题描述>`** 启动多代理深度推理循环，并明确提醒：
  > ⚠️ **`/boost` 提示**：仅限付费计划可用，且会显著加速消耗模型配额。
* **前端 / 页面交互 / 样式回归**：若涉及页面渲染、DOM 状态、网络请求或视觉问题，立即建议使用或直接委托 **`/browser`** 子代理打开目标页面做实机复现、截图与控制台检查。

### 阶段 4：收尾沉淀
- 修复验证通过后，简述根因、改动文件与验证结果，并提示需要防复发时可用 **`/learn`** 沉淀检查规则。
