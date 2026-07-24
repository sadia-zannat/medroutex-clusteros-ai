# MedRouteX Pilot V2 — Runtime Consistency Repair

This repair is based on local browser/runtime evidence from 24 July 2026.

## Fixed

- Hospital Twin synchronization no longer makes an active Stroke Crisis appear as Normal Operations in the legacy dashboard adapter.
- Live RTX/NVIDIA synchronization no longer increments the canonical Hospital Twin scenario version or invalidates the current Guard–Ruler recommendation.
- Live hardware telemetry remains separate from the ten synthetic GPU nodes.
- Implausible laptop-GPU power values such as `590 W` are normalized to `59 W` with degraded-quality evidence instead of being displayed as unquestioned truth.
- The command-center scenario badge now follows the canonical active scenario.
- Non-compute operational scenarios now display their canonical runtime status and human-review requirement in the top Operational Twin panel.
- Replaced the unsupported “HIPAA-compliant” claim with a truthful PHI-Zero demonstration-policy label.
- Time-to-failure bands now render as `5–30 Minutes` and `30–120 Minutes`.
- Added `.core-test` to ESLint ignores.
- Repaired React effect lint failures in the Scenario Console, Live GPU panel, and Persistence panel.

## Regression evidence in this package

The isolated core regression suite passes for:

- six executable crisis scenarios
- scenario idempotency
- Stroke approval idempotency
- Unified History normalization
- Hospital synchronization preserving active Stroke GPU evidence
- RTX synchronization preserving state version, active scenario, and Guard–Ruler evaluation
- RTX CSV parsing and laptop power normalization

Run the full local verification with:

```bash
npm ci
cp .env.example .env.local
npm run check
```
