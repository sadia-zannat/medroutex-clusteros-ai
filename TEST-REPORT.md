# MedRouteX Verification Report

## Verified behavior

- Baseline: health 88, resilience 91, 52 entities, 21 relationships.
- Six crisis scenarios and Normal Operations are deterministic.
- Each crisis applies once and repeated execution is idempotent.
- Stroke Crisis: health 81, resilience 89, GPU-2 92°C, GPU-3 approximately 7.7/8 GB, Central GPU-7 Plan A.
- Hospital Cascade: Compute/ICU/Oxygen/Power/Network degradation, Local GPU-4 Plan A, central routes network-blocked, cloud privacy-blocked.
- Human approval is idempotent, conflict-protected, audit-only, and executes no migration.
- Unified History includes events, notifications, snapshots, incidents, root causes, cascade paths, response plans, approvals, and truthful email outcomes.
- RTX 4060 CSV parsing and implausible laptop-power normalization are covered.
- Hospital Sync preserves active crisis telemetry and scenario identity.
- Hardware Sync does not increment canonical scenario version or invalidate decisions.
- Hospital Cascade dashboard identity is `hospital-cascade-crisis`.
- Decision Evidence export includes Plan A/B/C, blocked alternatives, approval, scenario evidence, and no-execution safety metadata.

## Recorded Windows laptop verification

The V2 project was run on the presentation laptop with:

```text
npm run check
```

Recorded results:

- TypeScript: pass
- Core regression: pass
- ESLint: 0 errors
- Next.js production build: pass
- Local browser baseline: pass
- Real RTX 4060 `nvidia-smi` connection: pass
- Stroke Crisis, Hospital Sync consistency, approval, Unified History, reset, and Hospital Cascade: pass

## Final completion patch verification

In the integration workspace:

- Expanded core regression: pass
- TypeScript syntax transpilation across app/lib/tests: pass

The integration workspace could not complete a fresh npm dependency download, so run the final package verification on Windows:

```bash
npm ci
npm run check
```

## Final browser smoke test

1. Connect operator
2. Sync Local GPU
3. Run Stroke Crisis
4. Sync Hospital Twin
5. Evaluate Safe Plans and confirm dependent panels refresh automatically
6. Approve and inspect Unified History
7. Export Decision Evidence JSON
8. Reset and run Hospital Cascade Crisis
9. Confirm Raw API scenario is `hospital-cascade-crisis`
