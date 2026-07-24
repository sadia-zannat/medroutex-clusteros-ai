# MedRouteX Windows Setup

## 1. Requirements

- Windows 10/11
- Node.js 24.x recommended
- npm 11+
- Git
- NVIDIA driver with `nvidia-smi` for live laptop-GPU telemetry

Check:

```powershell
node -v
npm -v
git --version
nvidia-smi
```

## 2. Install and verify

Open the extracted project folder in VS Code or Windsurf, then open PowerShell:

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run typecheck
npm.cmd run test:core
npm.cmd run lint
npm.cmd run build
npm.cmd run dev
```

Open `http://localhost:3000`.

If port 3000 is busy:

```powershell
npm.cmd run dev -- -p 3001
```

## 3. RTX 4060 / NVIDIA integration

The application runs this server-side command:

```powershell
nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw --format=csv,noheader,nounits
```

Verify it manually. Then open the dashboard and select **Sync Local GPU**.

Expected label:

```text
LIVE LOCAL HARDWARE TELEMETRY
```

This hardware record is stored separately. Running or resetting a Digital Twin scenario does not overwrite it.

Troubleshooting:

```powershell
Get-Command nvidia-smi
& "$env:SystemRoot\System32\nvidia-smi.exe"
```

Update the NVIDIA driver if the executable is unavailable.

## 4. Optional local SQLite

Edit `.env.local`:

```env
MEDROUTEX_SQLITE_ENABLED=true
MEDROUTEX_SQLITE_PATH=.data/medroutex.sqlite
```

Restart the dev server. Use **Save State** and **Restore Latest** on the dashboard.

Node.js 24 is recommended because the implementation uses built-in `node:sqlite`. The database contains operational simulation state only, never patient data.

## 5. Optional email alerts

Create a Resend API key and configure `.env.local`:

```env
EMAIL_ALERTS_ENABLED=true
RESEND_API_KEY=your_key_here
ALERT_EMAIL_FROM=MedRouteX <alerts@your-verified-domain.example>
ALERT_EMAIL_TO=operator@example.com
APP_BASE_URL=http://localhost:3000
```

Never send the key in chat or commit `.env.local`. The UI reports `sent`, `failed`, `disabled`, `not-configured`, or `suppressed` truthfully.

## 6. Demo flow

1. Click **Connect** and choose a demo operational role.
2. Confirm baseline: health 88, resilience 91.
3. Open **Hospital Continuity Scenario Console**.
4. Run **Emergency Stroke CT Compute Crisis**.
5. Inspect Guard–Ruler Plan A/B/C and blocked alternatives.
6. Approve or reject the current Plan A in Human Approval Queue.
7. Open Unified History and show the audit trail.
8. Reset to Normal Operations.
9. Run **Hospital Cascade Crisis** and show Local GPU-4 as the preferred eligible compute target.
10. Sync the real laptop GPU separately.

## 7. API testing in PowerShell

Do not use `curl` because PowerShell aliases it to `Invoke-WebRequest`. Use `Invoke-RestMethod` or `curl.exe`.

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/demo/reset" -ContentType "application/json" -Body "{}" -TimeoutSec 15

$body = @{
  scenarioId = "hospital-cascade-crisis"
  operatorName = "Demo Operator"
  operatorRole = "Infrastructure Engineer"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/hospital-twin/scenarios/run" -ContentType "application/json" -Body $body -TimeoutSec 15
```

## 8. Final verification checklist

```powershell
npm.cmd run check
npm.cmd run dev
```

Manually verify:

- All seven scenarios
- Repeat request idempotency
- Approve/reject and opposite-decision HTTP 409
- Notifications and Unified History
- Oxygen two-cycle recovery
- Two Hospital Twin sync calls
- RTX sync unavailable/connected truthfulness
- SQLite disabled/enabled truthfulness
- Reset restores the locked baseline

## 9. Production boundary

Before real hospital use, replace the demo role gate and local SQLite with enterprise identity, a production database, secrets management, encrypted transport, network isolation, formal security review, clinical governance, and site validation. MedRouteX must not control physical hospital equipment without separate certified systems and authorization.
