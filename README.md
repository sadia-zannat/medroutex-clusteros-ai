# ClusterOS AI: MedRouteX

**Hospital Resilience Digital Twin & Critical Care Continuity Mesh**

## 🌐 Live Demo

### [Open MedRouteX Live Application](https://medroutex-clusteros-ai.onrender.com/)

> Hosted on Render. The free instance may take up to 50 seconds to start after inactivity.

---

## 🖥️ Final Judge Demo — Run Locally

For the final demonstration, run MedRouteX locally to access the complete prototype and the separately labelled real NVIDIA laptop GPU telemetry.

### Final-day project folder

Open this project root folder in VS Code:

```text
MedRouteX-Final-Complete/medroutex-final
```

Make sure the folder contains:

```text
package.json
package-lock.json
app/
lib/
public/
```

### One-time preparation before the final day

Open the VS Code terminal inside the project root folder and run:

```bash
npm ci
```

Make sure `.env.local` exists.

When `.env.local` is missing, create it from `.env.example`.

For Git Bash:

```bash
cp .env.example .env.local
```

For Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Run the complete verification:

```bash
npm run check
```

The `check` command performs:

```text
TypeScript checking
→ Core regression testing
→ ESLint checking
→ Production build
```

### Exact commands to run on the final day

Open the same project folder in VS Code and run:

```bash
npm run build
```

After the build finishes successfully, run:

```bash
npm run start
```

Wait until the terminal shows that the server is ready.

Then open this URL in the browser:

```text
http://localhost:3000
```

Keep the VS Code terminal open while presenting the application.

To stop the server after the presentation, press:

```text
Ctrl + C
```

### Quick development mode

For quick testing before the final presentation:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

> For the final judge demonstration, `npm run build` followed by `npm run start` is recommended instead of development mode.

### Local and cloud telemetry boundary

- Localhost can access the separately labelled real NVIDIA laptop GPU telemetry through `nvidia-smi`.
- The Render deployment cannot access the presenter’s physical laptop GPU.
- The live Render deployment uses synthetic and emulated infrastructure telemetry.
- Real laptop telemetry and synthetic Digital Twin nodes remain clearly separated.

---

## About MedRouteX

MedRouteX is a PHI-Zero hospital infrastructure decision-support prototype developed for the **AI Innovation Hackathon 2026**.

It predicts infrastructure risk, simulates safe alternatives, applies hard safety constraints, ranks explainable response plans, requires human approval for critical decisions, and records a unified audit history.

> Infrastructure decision support only. MedRouteX is not a diagnosis system, treatment system, certified medical device, or physical actuator-control system.

## Implemented Capabilities

- One canonical Hospital and Operational Twin state with:
  - **52 entities**
  - **21 relationships**
  - **10 synthetic GPUs**
  - **20 healthcare-AI workloads**
- Hospital resilience model covering:
  - Compute
  - ICU
  - Oxygen
  - Power
  - Network continuity
- Guard–Ruler decision engine:
  - Hard safety rules are evaluated first.
  - Safe alternatives are ranked transparently.
- Deterministic Plan A, Plan B, and Plan C recommendations.
- Blocked alternatives with explainable reasons.
- Deadline margin, estimated time-to-failure, risk, privacy, and dependency evidence.
- Seven server-owned operational scenarios:
  - Normal Operations
  - Emergency Stroke CT Compute Crisis
  - ICU Capacity Stress
  - Oxygen Continuity Risk
  - Power Continuity Failure
  - Network Continuity Failure
  - Hospital Cascade Crisis
- Cross-domain dependency traversal and cascade visualization.
- Human approve and reject workflow with:
  - Idempotency
  - Conflict protection
  - One consistent audit record
- Notifications and Unified History.
- Oxygen warning, escalation, and recovery lifecycle.
- Real NVIDIA laptop GPU telemetry through `nvidia-smi`.
- Real GPU telemetry stored separately from synthetic simulation nodes.
- Optional local SQLite state checkpoints using Node.js built-in SQLite.
- Portable **Decision Evidence JSON export** containing:
  - Scenario details
  - Guard blocks
  - Plan A, Plan B, and Plan C
  - Human approval state
  - Audit history
  - RTX telemetry boundary
  - PHI-Zero safety metadata
- Operator demo session persists across browser refreshes in the same tab.
- Decision-engine evaluation refreshes:
  - Digital Twin
  - Route Planner
  - Human Approval Queue
- Security headers and strict API input validation.
- No patient data.
- No automatic infrastructure execution.

## Technology Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Recharts
- Node.js 24 recommended
- Optional built-in `node:sqlite`
- Docker
- Render Web Service
- NVIDIA `nvidia-smi` for local hardware telemetry

## Core Safety Loop

```text
Predict before failure
→ Simulate before action
→ Guard hard safety constraints
→ Ruler transparent ranking
→ Human approval
→ Audit
```

## Locked Demo Evidence

### Baseline Scenario

- Cluster Health: 88%
- Hospital Resilience: 91%
- Compute Continuity: 88%
- ICU Continuity: 90%
- Oxygen Continuity: 90%
- Power Continuity: 99%
- Network Continuity: 91%

### Emergency Stroke CT Compute Crisis

- Emergency workload deadline: 120 seconds
- Local GPU-2 temperature: 92°C
- Local GPU-3 memory usage: approximately 7.7 GB out of 8 GB
- Recommended Plan A: Central GPU-7
- Cloud routes: blocked by privacy policy
- Human approval: required
- Approval records the decision only
- No physical workload migration is automatically executed

### Hospital Cascade Crisis

- Central route blocked by network continuity failure
- Cloud route blocked by privacy policy
- Local GPU-2 blocked by temperature risk
- Local GPU-3 blocked by memory risk
- Plan A evaluates Local GPU-4
- Compute, ICU, oxygen, power, and network continuity are assessed together

## Important System Boundaries

- Hospital device telemetry is emulated.
- ICU telemetry is emulated.
- Oxygen telemetry is emulated.
- Power telemetry is emulated.
- Network telemetry is emulated.
- GPU-cluster telemetry is synthetic except for the separately labelled local NVIDIA provider.
- Real DICOM or FHIR systems are not connected.
- Real hospital networks are not controlled.
- Real generators are not controlled.
- Real oxygen reserves are not controlled.
- Real bedside devices are not controlled.
- The current login is a demonstration role gate, not production identity management.
- SQLite is an optional local pilot checkpoint, not a production high-availability database.
- Human approval does not automatically execute infrastructure changes.

## Main API Routes

### Health and Metrics

- `GET /api/health`
- `GET /api/metrics`
- `GET /api/mesh/state`

### Hospital Digital Twin

- `GET /api/hospital-twin/state`
- `POST /api/hospital-twin/sync`
- `GET /api/hospital-twin/history`

### Scenario Management

- `GET /api/hospital-twin/scenarios`
- `POST /api/hospital-twin/scenarios/run`
- `GET /api/hospital-twin/scenarios/state`
- `POST /api/demo/reset`
- `POST /api/demo/run`
- `POST /api/demo/oxygen-transition`

### Guard–Ruler Decision Engine

- `GET /api/guard-ruler/state`
- `POST /api/guard-ruler/evaluate`
- `GET /api/planner/recommendations`
- `POST /api/twin/simulate`

### Human Approval and History

- `POST /api/operational-twin/approval`
- `GET /api/operational-twin/state`
- `POST /api/operational-twin/reset`
- `GET /api/history`

### Notifications

- `GET /api/notifications`
- `POST /api/notifications/acknowledge`
- `GET /api/notifications/email-history`
- `POST /api/notifications/test-email`

### Real Local GPU Telemetry

- `GET /api/hardware/gpu`
- `POST /api/hardware/gpu/sync`

### Persistence

- `GET /api/persistence/status`
- `POST /api/persistence/save`
- `POST /api/persistence/restore`

### Evidence Export

- `GET /api/evidence/export`

## Verification Commands

Run the complete project verification:

```bash
npm run check
```

The `check` command runs:

```text
npm run typecheck
npm run test:core
npm run lint
npm run build
```

Individual verification commands:

```bash
npm run typecheck
npm run test:core
npm run lint
npm run build
```

## Docker Deployment

The project includes a production Docker configuration.

Docker performs:

```text
Install dependencies
→ Build the Next.js application
→ Start the production server
```

The application is deployed as a Render Docker Web Service.

## Environment Configuration

Copy `.env.example` to `.env.local` for local execution.

Default safe demonstration configuration:

```env
MEDROUTEX_SQLITE_ENABLED=false
EMAIL_ALERTS_ENABLED=false
APP_BASE_URL=http://localhost:3000
```

For the Render deployment:

```env
MEDROUTEX_SQLITE_ENABLED=false
EMAIL_ALERTS_ENABLED=false
PORT=3000
```

> Never commit `.env.local`, API keys, passwords, tokens, or other secrets to GitHub.

## Additional Documentation

Detailed setup and project information are available in:

- [Windows Setup Guide](./SETUP-WINDOWS.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Demo Script](./DEMO-SCRIPT.md)
- [Test Report](./TEST-REPORT.md)
- [Change Log](./CHANGELOG.md)
- [Final Completion Notes](./FINAL-COMPLETION-NOTES.md)
- [Final Submission Checklist](./FINAL-SUBMISSION-CHECKLIST.md)
- [Delivery Summary](./DELIVERY-SUMMARY.md)
- [Patch Notes V2](./PATCH-NOTES-V2.md)

## Final Submission Links

**GitHub Repository**

```text
https://github.com/sadia-zannat/medroutex-clusteros-ai
```

**Live Application**

```text
https://medroutex-clusteros-ai.onrender.com/
```

## Safety Statement

MedRouteX demonstrates explainable hospital infrastructure decision support using synthetic and emulated data.

It does not:

- Diagnose patients
- Recommend medical treatment
- Process real patient data
- Control hospital equipment
- Control GPU migrations automatically
- Control power, oxygen, ICU, network, or medical devices

All critical response decisions remain subject to explicit human approval.
