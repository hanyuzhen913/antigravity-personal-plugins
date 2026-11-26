# Modification Notice (GPL-3.0 §5(a))

This directory (`plugins/obsidian-prism`) contains a **modified version** of **Obsidian Prism** (`v1.0.8-beta.2`), originally authored by **RMvdesi** (<https://github.com/RMvdesi/obsidian-prism>).

- **Modified By**: `han`
- **Modification Date**: `2026-11-26`
- **License**: **GNU General Public License v3.0 (`GPL-3.0-only`)** — see [`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Summary of Modifications

1. **Custom Default Configuration (`config.json`, `config.example.json`, `cdp.js`)**:
   - Baked personalized defaults: `lightPreset: "alabaster"`, `motionLevel: "standard"`, `homeRipple: false`, `ripple: "off"`, `mascot: "r:k1"`, `sidebarCompact: true`, `sidebarNavFold: "on"`, `accentTone: "iris"`, `codeFont: "jetbrains"`, `codeLigatures: true`, `ambientIntensity: "0"`, `autoUpdate: "off"`.
2. **Personalized UI & Component Adjustments**:
   - Customized stylesheet (`style.css`), effort slider client (`vendor/effort-slider/upstream-client.js`), periodic picker host bridge (`vendor/periodic-picker/host-bridge.js`), telemetry vial (`vial-core.js`, `pulse-vial-bridge.js`, `vendor/pulse-dashboard/inline-fallback.js`), and model glyph crystal (`model-glyph-crystal.js`).
3. **Distribution Hygiene**:
   - Excluded local runtime caches, PID/lock files, logs, and machine-specific `repo-meta.json`.

In accordance with GPL-3.0, this modified work as a whole remains licensed under GPL-3.0-only, with all original copyright and attribution notices preserved intact.
