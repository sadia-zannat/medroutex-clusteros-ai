# ClusterOS AI: MedRouteX

**Hospital Resilience Digital Twin & Critical Care Continuity Mesh**

MedRouteX is a PHI-Zero hospital infrastructure decision-support prototype for the AI Innovation Hackathon 2026. It predicts infrastructure risk, simulates safe alternatives, applies hard safety constraints, ranks explainable response plans, requires human approval for critical decisions, and records a unified audit history.

> Infrastructure decision support only. Not a diagnosis, treatment, certified medical-device, or physical actuator-control system.

## Implemented capabilities

- One canonical Hospital/Operational Twin state with **52 entities**, **21 relationships**, **10 synthetic GPUs**, and **20 healthcare-AI workloads**.
- Hospital resilience model covering Compute, ICU, Oxygen, Power, and Network continuity.
- Guard–Ruler engine: hard safety rules before transparent weighted ranking.
- Deterministic Plan A/B/C with blocked alternatives, deadline margin, time-to-failure, and dependency evidence.
- Seven server-owned operational scenarios:
  - Normal Operations
  - Emergency Stroke CT Compute Crisis
  - ICU Capacity Stress
  - Oxygen Continuity Risk
  - Power Continuity Failure
  - Network Continuity Failure
  - Hospital Cascade Crisis
- Cross-domain dependency traversal and cascade visualization.
- Human approve/reject workflow with idempotency, conflict protection, and exactly one audit record.
- Notifications, email-delivery truthfulness, oxygen escalation/recovery lifecycle, and Unified History.
- Real NVIDIA laptop GPU telemetry through `nvidia-smi`, stored separately from simulation nodes.
- Optional local SQLite state checkpoints using Node.js built-in SQLite.
- Portable **Decision Evidence JSON export** containing scenario, Guard blocks, Plan A/B/C, approval, audit, RTX boundary, and PHI-Zero safety metadata.
- Operator demo session persists across browser refreshes in the same tab session.
- Decision-engine evaluation automatically refreshes Digital Twin, Route Planner, and Approval Queue panels.
- Security headers, strict API input validation, no patient data, and no automatic infrastructure execution.

## Technology

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS 4
- Recharts
- Node.js 24 recommended
- Optional built-in `node:sqlite`

## Quick start (Windows PowerShell)

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run typecheck
npm.cmd run test:core
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open `http://localhost:3000`.

Detailed Windows setup, RTX 4060 integration, SQLite, email, testing, and troubleshooting are in [SETUP-WINDOWS.md](./SETUP-WINDOWS.md). Deployment boundaries are documented in [DEPLOYMENT.md](./DEPLOYMENT.md), and the presentation flow is in [DEMO-SCRIPT.md](./DEMO-SCRIPT.md).

## Core safety loop

```text
Predict before failure
→ Simulate before action
→ Guard hard safety constraints
→ Ruler transparent ranking
→ Human approval
→ Audit
```

## Locked demo evidence

### Baseline

- Health 88
- Resilience 91
- Compute 88, ICU 90, Oxygen 90, Power 99, Network 91

### Emergency Stroke CT crisis

- Local GPU-2: 92°C
- Local GPU-3: approximately 7.7/8 GB memory
- Deadline: 120 seconds
- Plan A: Central GPU-7
- Cloud: privacy blocked
- Human approval required
- Approval records a decision only; no migration is executed

### Hospital Cascade Crisis

- Central route blocked by network failure
- Cloud blocked by privacy
- Local GPU-2 blocked by temperature
- Local GPU-3 blocked by memory
- Plan A evaluates Local GPU-4
- Power, oxygen, ICU, network, and compute continuity are assessed together

## Important boundaries

- Hospital device, power, oxygen, ICU, and network telemetry are **emulated**.
- GPU-cluster telemetry is **synthetic**, except the separately labelled local NVIDIA provider.
- Real DICOM/FHIR, hospital networks, generators, oxygen reserves, and bedside devices are not controlled.
- The current login is a demo role gate, not production identity management.
- SQLite is a local pilot checkpoint, not a production HA database.

## Main API routes

- `GET /api/health`
- `GET /api/hospital-twin/state`
- `POST /api/hospital-twin/sync`
- `GET /api/hospital-twin/scenarios`
- `POST /api/hospital-twin/scenarios/run`
- `GET /api/hospital-twin/scenarios/state`
- `POST /api/demo/reset`
- `POST /api/demo/run`
- `GET /api/guard-ruler/state`
- `POST /api/guard-ruler/evaluate`
- `POST /api/operational-twin/approval`
- `GET /api/notifications`
- `GET /api/history`
- `GET /api/hardware/gpu`
- `POST /api/hardware/gpu/sync`
- `GET /api/persistence/status`
- `POST /api/persistence/save`
- `POST /api/persistence/restore`
- `GET /api/evidence/export`

## Verification

```powershell
npm.cmd run check
```

`check` runs TypeScript, the deterministic core regression, ESLint, and the production build.

See [TEST-REPORT.md](./TEST-REPORT.md), [CHANGELOG.md](./CHANGELOG.md), and [FINAL-SUBMISSION-CHECKLIST.md](./FINAL-SUBMISSION-CHECKLIST.md).
