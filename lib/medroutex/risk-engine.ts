export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalize(value: number, safeMin: number, criticalMax: number): number {
  if (value <= safeMin) return 0;
  if (value >= criticalMax) return 1;
  return (value - safeMin) / (criticalMax - safeMin);
}

export interface GpuLike {
  temperature: number;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  powerDraw: number;
  errorCount: number;
  anomalyRisk: number;
  trendRisk: number;
}

export function calculateGpuRiskScore(gpuLike: GpuLike): number {
  const temperatureRisk = normalize(gpuLike.temperature, 60, 90);
  const utilizationRisk = normalize(gpuLike.utilization, 70, 95);
  const memoryRisk = normalize((gpuLike.memoryUsed / gpuLike.memoryTotal) * 100, 70, 95);
  const powerRisk = normalize(gpuLike.powerDraw, 250, 400);
  const errorRisk = clamp(gpuLike.errorCount / 10, 0, 1);
  const trendRisk = gpuLike.trendRisk;
  const anomalyRisk = gpuLike.anomalyRisk;

  const riskScore =
    0.22 * temperatureRisk +
    0.18 * utilizationRisk +
    0.15 * memoryRisk +
    0.12 * powerRisk +
    0.10 * errorRisk +
    0.13 * trendRisk +
    0.10 * anomalyRisk;

  return clamp(riskScore, 0, 1);
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export function getRiskLevel(score: number): RiskLevel {
  if (score < 0.25) return "low";
  if (score < 0.5) return "medium";
  if (score < 0.75) return "high";
  return "critical";
}

export function calculateHealthScore(riskScore: number): number {
  return Math.round((1 - riskScore) * 100);
}
