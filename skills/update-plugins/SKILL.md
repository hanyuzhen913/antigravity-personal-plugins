---
name: update-plugins
description: >-
  Check and safely update personalized Antigravity plugins (antigravity-context-monitor,
  obsidian-prism, and dev-command-hub sync) from upstream GitHub while preserving all custom
  code modifications and personal default configurations. Activate whenever the user says
  "更新插件", "升级插件", "同步作者最新版插件", "/update-plugins", or asks to update
  their installed plugins without overwriting custom edits.
---

# Safe Plugin Upstream Updater (`/update-plugins`)

Use this runbook whenever the user asks to update their plugins while preserving customizations.

## Guardrails

1. **NEVER** overwrite the user's customizations or trigger Obsidian Prism's built-in updater.
2. **NEVER** hand-edit `~/.gemini/config/config.json` or force-quit Antigravity App.
3. **NEVER** touch `dev-command-hub` with upstream pulls (it is a local plugin with no external upstream).

## Workflow

1. **Enter the monorepo**:
   `~/.gemini/antigravity/scratch/antigravity-personal-plugins`
2. **Check or run the safe updater**:
   - If the user asked to check first, run:
     ```bash
     node scripts/update-upstream.mjs --check
     ```
   - If the user asked to update directly (e.g., "更新插件"), run:
     ```bash
     node scripts/update-upstream.mjs
     ```
   - `update-upstream.mjs` automatically:
     - Captures any live edits in `~/.gemini/config/plugins/obsidian-prism/` onto `my-custom` before pulling;
     - Fast-forwards `main` in `~/.gemini/antigravity/scratch/obsidian-prism` and rebases `my-custom` onto `main`;
     - Runs unit tests, deploys runtime files while preserving live `config.json`, re-applies `DEFAULT_CONFIG`, and re-exports `patches/obsidian-prism.patch`;
     - Checks and SHA-256-verifies GitHub Releases for `antigravity-context-monitor`, preserving `state-v1.json`, `LICENSE`, and `quotaNotificationThreshold`.
3. **Handle Rebase Conflicts (Exit Code `2`)**:
   If `update-upstream.mjs` exits with code `2`:
   - Inspect conflicted files in `~/.gemini/antigravity/scratch/obsidian-prism` (`git status` / `git diff`).
   - Read the upstream changes and `patches/obsidian-prism.patch` (or `git show my-custom`) to merge carefully **without dropping any of the user's custom features**.
   - Run `git add <resolved-files>` and `git rebase --continue` (repeat if multiple commits).
   - Finish deployment and monorepo sync by running:
     ```bash
     node scripts/update-upstream.mjs --target obsidian-prism --finalize-prism
     ```
4. **Optional Local Sync for `dev-command-hub`**:
   If the user mentions they also edited `dev-command-hub` locally, run:
   ```bash
   node scripts/install.mjs --sync-from-local --only dev-command-hub
   ```
5. **Validate, Commit, and Push**:
   Inside `~/.gemini/antigravity/scratch/antigravity-personal-plugins`:
   ```bash
   node scripts/validate.mjs
   ```
   If `git status --short` has changes, commit with a clear message and push:
   ```bash
   git add -A && git commit -m "chore: update upstream plugins while preserving customizations" && git push origin main
   ```
6. **Report & Reload**:
   - Report exact previous/new versions or commit hashes for each plugin (and whether any plugin was already up-to-date).
   - For any plugin whose files on disk were updated, give the user clickable links to toggle Off → On in Antigravity Customizations:
     - [Antigravity Context Monitor](customization://antigravity-context-monitor)
     - [Obsidian Prism](customization://obsidian-prism)
