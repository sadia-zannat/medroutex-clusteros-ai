# MedRouteX Deployment Guide

MedRouteX has two honest deployment modes.

## 1. Local pilot — recommended for the final live demo

Use this mode when showing the real laptop RTX telemetry.

```bash
npm ci
cp .env.example .env.local
npm run check
npm run dev
```

Open `http://localhost:3000`.

Available locally:

- All seven deterministic scenarios
- Guard–Ruler evaluation
- Human approval and Unified History
- Real NVIDIA telemetry through `nvidia-smi`
- Optional local SQLite checkpoints
- Decision Evidence JSON export

## 2. Remote showcase — synthetic/emulated Digital Twin

Use a persistent Node.js host such as Railway, Render, Fly.io, a VM, or Docker.

```bash
npm ci
npm run build
npm run start
```

Recommended environment:

```text
NODE_ENV=production
MEDROUTEX_SQLITE_ENABLED=false
EMAIL_ALERTS_ENABLED=false
APP_BASE_URL=https://your-domain.example
```

### Remote limitations

- A cloud server cannot read the presenter laptop's RTX GPU. `Sync Local GPU` will safely report unavailable unless the server itself has NVIDIA GPU access and `nvidia-smi`.
- In-memory scenario/history state is process-local and resets when the host restarts.
- Enable SQLite only on a stateful host with a persistent disk. Do not rely on local SQLite on ephemeral/serverless storage.
- Serverless platforms may create multiple instances, so they are suitable for a read-only showcase but not for a stable stateful approval demo.

## Docker

```bash
docker build -t medroutex .
docker run --rm -p 3000:3000 --env-file .env.local medroutex
```

For SQLite persistence, mount a volume:

```bash
docker run --rm -p 3000:3000 \
  --env-file .env.local \
  -v medroutex-data:/app/.data \
  medroutex
```

Real NVIDIA telemetry inside Docker requires host NVIDIA runtime/GPU pass-through and is not assumed by this pilot.

## Pre-deployment verification

```bash
npm run check
npm run start
```

Then verify:

1. `GET /api/health`
2. Baseline dashboard
3. Stroke Crisis and Hospital Cascade Crisis
4. Guard–Ruler Plan A/B/C
5. Decision Evidence export
6. Human approval and Unified History

## Truthful public description

> MedRouteX is a PHI-Zero hospital infrastructure decision-support pilot using synthetic and emulated telemetry. It does not diagnose patients or automatically control hospital infrastructure.
