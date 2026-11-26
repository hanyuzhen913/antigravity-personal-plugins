# Third-Party Notices & License Matrix

This repository is a monorepo aggregate hosting **three independent Antigravity plugins** under `plugins/`, together with sanitized default configuration seeds under `defaults/` and installation/validation tooling under `scripts/`. Each plugin directory retains its own license and upstream copyright notices.

## License Matrix

| Plugin Directory | Upstream Project / Origin | License | Modification Notice |
| :--- | :--- | :--- | :--- |
| `plugins/obsidian-prism` | [RMvdesi/obsidian-prism](https://github.com/RMvdesi/obsidian-prism) (`v1.0.8-beta.2`) | **GPL-3.0-only** | Modified by `han` on `2026-11-26` — see [`plugins/obsidian-prism/MODIFICATIONS.md`](./plugins/obsidian-prism/MODIFICATIONS.md), [`plugins/obsidian-prism/LICENSE`](./plugins/obsidian-prism/LICENSE), and [`plugins/obsidian-prism/THIRD_PARTY_NOTICES.md`](./plugins/obsidian-prism/THIRD_PARTY_NOTICES.md). |
| `plugins/antigravity-context-monitor` | [AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor](https://github.com/AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor) (`v1.17.9`) | **MIT** | Modified by `han` on `2026-11-26` (default `quotaNotificationThreshold` adjusted to `1` in `durable-state.js`) — see [`plugins/antigravity-context-monitor/LICENSE`](./plugins/antigravity-context-monitor/LICENSE). |
| `plugins/dev-command-hub` | Local customized plugin (`dev-command-hub` `v2.1.0` / server `v2.2.0`) | **MIT** | Modified by `han` on `2026-11-26` (default `density` set to `"full"` and initial `recent` presets) — see [`plugins/dev-command-hub/LICENSE`](./plugins/dev-command-hub/LICENSE). |

## Upstream Attribution Details

### 1. Obsidian Prism (`GPL-3.0-only`)
- Original Copyright (C) 2026 **RMvdesi** (<https://github.com/RMvdesi/obsidian-prism>)
- Absorbed MIT-licensed upstream components documented in [`plugins/obsidian-prism/THIRD_PARTY_NOTICES.md`](./plugins/obsidian-prism/THIRD_PARTY_NOTICES.md):
  - `0DNANCY/agy-claude-style` (Copyright (c) 2026 0DNANCY, MIT)
  - `ATtacK030130/antigrative-dashboard` (Copyright (c) 2026 AG Pulse contributors, MIT)
  - `LLYSH-HANNARI/antigravity-Codex-Claude-effort-slider` (Copyright (c) 2026 月上寒, MIT)
  - `yiheng8023/antigravity-chinese` (Copyright (c) 2026 Antigravity Chinese Localization Contributors, MIT)
  - `wp3171216237/dsh-TUI` (Copyright (c) 2026 chimney / @wp3171216237, MIT)
- Any redistribution or derivative work of `plugins/obsidian-prism` must remain licensed under **GPL-3.0-only** with full copyright and modification notices preserved.

### 2. Antigravity Context Monitor (`MIT`)
- Original Copyright (c) **AGI-is-going-to-arrive** (<https://github.com/AGI-is-going-to-arrive/Antigravity-Context-Window-Monitor>)
- Modified on `2026-11-26` to align default alert threshold (`quotaNotificationThreshold: 1`) and provide a sanitized default seed in `defaults/context-monitor.defaults.json`.

### 3. Dev Command Hub (`MIT`)
- Customized MCP App plugin (`dev-command-hub`) packaged with [`plugins/dev-command-hub/LICENSE`](./plugins/dev-command-hub/LICENSE).
- Modified on `2026-11-26` to use `full` layout density by default.

## Non-Affiliation Notice

Antigravity and Google are trademarks or product names of Google LLC. This repository is an independent personal configuration and plugin bundle and is not affiliated with or endorsed by Google LLC.
