# Changelog

## Final completion patch

### Added

- Portable `GET /api/evidence/export` JSON evidence package.
- Dashboard `Export Decision Evidence` action.
- Canonical scenario identity helper shared by Mesh State, Digital Twin, tests, and evidence export.
- Session-scoped operator login persistence across browser refreshes.
- Automatic dependent-panel refresh after Guard–Ruler evaluation.
- Dockerfile, deployment guide, demo script, and final submission checklist.
- Regression coverage for Hospital Cascade scenario identity and evidence export.

### Fixed

- Hospital Sync no longer makes an active Stroke Crisis appear as `normal_day`.
- Hospital Cascade Raw API preview now reports `hospital-cascade-crisis` instead of a stroke-only identifier.
- Compute crisis GPU cards are derived from canonical telemetry, preserving GPU-2/GPU-3 risk during Stroke and Hospital Cascade scenarios.
- Digital Twin scenario identity now follows the canonical scenario runtime.
- Route Planner no longer renders the cosmetic phrase `Guard blocked: Guard blocked` for network and dependency failures.
- `Current Idle Saving` and `Projected Cost Saving` labels now distinguish current and what-if metrics.
- Removed lint warnings from unused variables/imports and replaced the raw GIF `<img>` with `next/image`.

### Safety

- Decision Evidence export remains PHI-Zero and infrastructure-only.
- Export, approval, and simulation never execute migration or actuator actions.
- Real laptop GPU telemetry remains separately labelled and simulation-protected.

## Integrated hackathon pilot

### Added

- Typed multi-domain hospital scenario runtime and deterministic seven-scenario catalog.
- ICU, oxygen, power, network, Stroke CT, and hospital-cascade transitions.
- Cycle-safe dependency cascade analysis and time-to-failure evidence.
- Multi-domain response Plan A/B/C with transparent secondary scoring.
- Hospital Continuity Scenario Console and operational topology figure.
- Separate live NVIDIA telemetry provider and dashboard panel.
- Optional local SQLite state checkpoints and dashboard controls.
- Unified History records for incidents, root causes, cascades, and response plans.
- Windows setup guide, environment template, core regression test, and test report.
- Security response headers.

### Changed

- Existing `/api/demo/run` shares the canonical Stroke Crisis scenario engine.
- Approval validates the active Guard-eligible Plan A instead of a hardcoded target.
- GPU IDs are converted to human-readable Local/Central/Cloud labels.
- Risky-GPU mitigation and modeled overall risk reduction are displayed as separate metrics.
- Scenario reset preserves separate real-hardware telemetry and persistence status.
