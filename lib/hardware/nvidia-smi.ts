import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { LiveGpuTelemetry } from "../twin-core/types";

const execFileAsync = promisify(execFile);
const NVIDIA_SMI_QUERY = [
  "--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw",
  "--format=csv,noheader,nounits",
] as const;

function numberOrNull(value: string): number | null {
  const parsed = Number.parseFloat(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePowerDraw(
  rawValue: string,
  gpuName: string | null
): { value: number | null; quality: LiveGpuTelemetry["quality"]; warning: string | null } {
  const parsed = numberOrNull(rawValue);
  if (parsed === null) return { value: null, quality: "unknown", warning: null };

  const isLaptopGpu = gpuName?.toLowerCase().includes("laptop gpu") ?? false;
  if (isLaptopGpu && parsed > 250 && parsed / 10 <= 250) {
    return {
      value: parsed / 10,
      quality: "degraded",
      warning: `nvidia-smi reported an implausible laptop-GPU power value (${parsed} W); interpreted as ${parsed / 10} W after deciwatt normalization.`,
    };
  }

  if (parsed < 0 || parsed > 1000) {
    return {
      value: null,
      quality: "degraded",
      warning: `nvidia-smi returned an implausible power value (${parsed} W); power draw is shown as unavailable.`,
    };
  }

  return { value: parsed, quality: "good", warning: null };
}

export function parseNvidiaSmiCsv(
  output: string,
  collectedAt: string
): LiveGpuTelemetry {
  const firstLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    throw new Error("nvidia-smi returned no GPU telemetry.");
  }
  const fields = firstLine.split(",").map((value) => value.trim());
  if (fields.length < 6) {
    throw new Error(`Unexpected nvidia-smi CSV shape: expected 6 fields, received ${fields.length}.`);
  }
  const gpuName = fields[0] || null;
  const power = normalizePowerDraw(fields[5], gpuName);
  return {
    connectionStatus: "connected",
    collectedAt,
    provider: "nvidia-smi",
    sourceLabel: "Live Local Hardware Telemetry",
    quality: power.quality,
    gpuName,
    temperatureC: numberOrNull(fields[1]),
    utilizationPercent: numberOrNull(fields[2]),
    memoryUsedMiB: numberOrNull(fields[3]),
    memoryTotalMiB: numberOrNull(fields[4]),
    powerDrawWatts: power.value,
    error: power.warning,
    simulationProtected: true,
  };
}

export async function collectNvidiaGpuTelemetry(): Promise<LiveGpuTelemetry> {
  const collectedAt = new Date().toISOString();
  try {
    const { stdout } = await execFileAsync("nvidia-smi", [...NVIDIA_SMI_QUERY], {
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    });
    return parseNvidiaSmiCsv(stdout, collectedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "nvidia-smi is unavailable.";
    return {
      connectionStatus: message.toLowerCase().includes("not found") || message.toLowerCase().includes("enoent")
        ? "unavailable"
        : "error",
      collectedAt,
      provider: "nvidia-smi",
      sourceLabel: "Live Local Hardware Telemetry",
      quality: "offline",
      gpuName: null,
      temperatureC: null,
      utilizationPercent: null,
      memoryUsedMiB: null,
      memoryTotalMiB: null,
      powerDrawWatts: null,
      error: message,
      simulationProtected: true,
    };
  }
}

export const NVIDIA_SMI_COMMAND =
  "nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw --format=csv,noheader,nounits";
