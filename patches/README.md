# Obsidian Prism 个人定制补丁与上游更新指南

- **上游仓库**：<https://github.com/RMvdesi/obsidian-prism>
- **基线版本 / Commit**：`v1.0.8-beta.2`（`2e27680`）
- **导出日期**：`2026-11-26`
- **定制分支**：本地源码仓库 `my-custom`（commit `02243b1`）
- **补丁文件**：[`obsidian-prism.patch`](./obsidian-prism.patch)

## 包含的自定义修改文件（共 11 个）

- `model-glyph-crystal.js`
- `pulse-vial-bridge.js`
- `style.css`
- `vial-core.js`
- `vendor/effort-slider/upstream-client.js`
- `vendor/periodic-picker/host-bridge.js`
- `vendor/pulse-dashboard/inline-fallback.js`
- `test/bundle.test.mjs`
- `test/pulse-vial-bridge.test.mjs`
- `test/v108-split-view-multipane.test.mjs`
- `test/vial-core.test.mjs`

---

## 方式一：在本机已有 Git 源码库上拉取上游更新（推荐）

本地上游克隆位于 `~/.gemini/antigravity/scratch/obsidian-prism`，其中 `main` 分支保持纯净跟踪原作者，`my-custom` 分支保存你的定制代码：

```powershell
# 1. 拉取原作者最新更新到 main
cd $HOME\.gemini\antigravity\scratch\obsidian-prism
git checkout main
git pull origin main

# 2. 将你的定制提交变基（rebase）到最新 main 上
git checkout my-custom
git rebase main

# （若遇冲突：解决冲突后执行 git add <文件> && git rebase --continue）
# 3. 可选：运行单测确认无回归
npm test
```

确认无误后，将更新后的源码（排除 `.git`、`.bundle-cache.json`、`config.json` 等运行与配置文件）同步到本机 `~/.gemini/config/plugins/obsidian-prism/` 并在 Antigravity 中重载插件，再回到本聚合仓库同步导出最新补丁并推送：

```powershell
cd $HOME\.gemini\antigravity\scratch\antigravity-personal-plugins
node scripts/install.mjs --sync-from-local --only obsidian-prism
git -C $HOME\.gemini\antigravity\scratch\obsidian-prism diff main..my-custom --output="patches/obsidian-prism.patch"
node scripts/validate.mjs
git add -A && git commit -m "chore(obsidian-prism): sync upstream and rebase custom changes" && git push
```

---

## 方式二：在全新的上游克隆上重放本补丁

如果换了新机器，或者需要基于原作者仓库重新构建定制版本，可直接应用本补丁：

```bash
git clone https://github.com/RMvdesi/obsidian-prism.git
cd obsidian-prism
git checkout -b my-custom
git apply --3way /path/to/antigravity-personal-plugins/patches/obsidian-prism.patch
```

若上游新版与补丁存在局部冲突，`--3way` 会自动生成标准冲突标记供手动合并。
