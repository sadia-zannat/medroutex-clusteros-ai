# Final Demo Script

## Main flow — about 2 minutes

1. Show baseline: 10 GPUs, 20 workloads, Health 88, Resilience 91.
2. Click `Sync Local GPU` and show the separate RTX 4060 telemetry panel.
3. Click `Run Crisis Simulation`.
4. Show Local GPU-2 at 92°C and Local GPU-3 at approximately 7.7/8 GB.
5. Show Guard blocks unsafe local GPUs and cloud routes.
6. Show Ruler selects Central GPU-7 as Plan A.
7. Show the what-if projection: Health 81% → 98%, Risky GPUs 2 → 0.
8. Connect as Radiology Operator and approve the recommendation.
9. State clearly: approval records a decision; no physical migration is executed.
10. Open Unified History and show the operator, decision, blocked routes, timestamp, and simulation-only audit.
11. Click `Export Decision Evidence` to download the portable JSON evidence package.

## Complexity flow — about 45 seconds

1. Reset.
2. Select `Hospital Cascade Crisis`.
3. Show simultaneous Compute, ICU, Oxygen, Power, and Network degradation.
4. Show dependency cascade paths.
5. Show Central routes blocked by network loss, Cloud blocked by privacy, Local GPU-2/3 blocked by compute risk.
6. Show Local GPU-4 as Plan A and human approval required.

## One-sentence explanation

> MedRouteX predicts infrastructure risk, simulates outcomes, blocks unsafe routes, ranks explainable alternatives, waits for authorized human approval, and records decision evidence without automatically executing hospital actions.
