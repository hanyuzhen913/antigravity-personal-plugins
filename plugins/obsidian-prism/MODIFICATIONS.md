# Modification Notice (GPL-3.0 §5(a))

This directory (`plugins/obsidian-prism`) contains a **modified version** of **Obsidian Prism** (`v1.0.8-beta.3`), originally authored by **RMvdesi** (<https://github.com/RMvdesi/obsidian-prism>).

- **Modified By**: `han`
- **Modification Date**: `2026-11-26`
- **Upstream Baseline Commit**: `41cc481`
- **Custom Branch Commit**: `9ef06de`
- **License**: **GNU General Public License v3.0 (`GPL-3.0-only`)** — see [`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Summary of Modifications

1. **Custom Default Configuration (`config.json`, `config.example.json`, `cdp.js`)**:
   - Baked personalized defaults from `defaults/obsidian-prism.config.json` (including `autoUpdate: "off"`).
2. **Personalized Source & Component Customizations**:
   - `model-glyph-crystal.js`
   - `pulse-vial-bridge.js`
   - `style.css`
   - `test/bundle.test.mjs`
   - `test/pulse-vial-bridge.test.mjs`
   - `test/v108-split-view-multipane.test.mjs`
   - `test/vial-core.test.mjs`
   - `vendor/effort-slider/upstream-client.js`
   - `vendor/periodic-picker/host-bridge.js`
   - `vendor/pulse-dashboard/inline-fallback.js`
   - `vial-core.js`
3. **Distribution Hygiene**:
   - Excluded local runtime caches, PID/lock files, logs, and machine-specific `repo-meta.json`.

In accordance with GPL-3.0, this modified work as a whole remains licensed under GPL-3.0-only, with all original copyright and attribution notices preserved intact.
