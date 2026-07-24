$ErrorActionPreference = "Stop"
Write-Host "MedRouteX local verification" -ForegroundColor Cyan
npm.cmd run typecheck
npm.cmd run test:core
npm.cmd run lint
npm.cmd run build
Write-Host "All local verification commands completed." -ForegroundColor Green
