$ErrorActionPreference = "Stop"
Write-Host "Checking nvidia-smi..." -ForegroundColor Cyan
$nvidia = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $nvidia) {
  throw "nvidia-smi was not found. Install/update the NVIDIA driver and reopen PowerShell."
}
& nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw --format=csv,noheader,nounits
