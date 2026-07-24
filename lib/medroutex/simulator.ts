import type { Gpu, Workload, ClusterSummary, AuditLog, MeshState, GpuStatus, WorkloadPriority, PrivacyPolicy } from "./types";
import { SCENARIOS, WORKLOAD_NAMES, CLUSTER_SETUP, TOTAL_WORKLOADS } from "./constants";
import { calculateGpuRiskScore, calculateHealthScore, getRiskLevel } from "./risk-engine";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createBaseGpus(): Gpu[] {
  const gpus: Gpu[] = [];
  // Local cluster - 4 GPUs
  for (let i = 0; i < 4; i++) {
    gpus.push({
      id: generateId("gpu"),
      clusterId: CLUSTER_SETUP.local.id,
      clusterType: "local",
      status: "healthy",
      temperature: 45 + i * 2,
      utilization: 30 + i * 5,
      memoryUsed: 8 + i * 2,
      memoryTotal: 24,
      powerDraw: 180 + i * 10,
      fanSpeed: 1200 + i * 100,
      errorCount: 0,
      anomalyRisk: 0.05,
      trendRisk: 0.1,
      riskScore: 0,
      healthScore: 0,
      assignedWorkloads: [],
      idleMinutes: 15 + i * 5,
      standbyEligible: false,
    });
  }

  // Central cluster - 4 GPUs
  for (let i = 0; i < 4; i++) {
    gpus.push({
      id: generateId("gpu"),
      clusterId: CLUSTER_SETUP.central.id,
      clusterType: "central",
      status: "healthy",
      temperature: 50 + i * 3,
      utilization: 40 + i * 8,
      memoryUsed: 10 + i * 3,
      memoryTotal: 24,
      powerDraw: 200 + i * 15,
      fanSpeed: 1400 + i * 150,
      errorCount: 0,
      anomalyRisk: 0.08,
      trendRisk: 0.12,
      riskScore: 0,
      healthScore: 0,
      assignedWorkloads: [],
      idleMinutes: 10 + i * 3,
      standbyEligible: false,
    });
  }

  // Cloud cluster - 2 GPUs
  for (let i = 0; i < 2; i++) {
    gpus.push({
      id: generateId("gpu"),
      clusterId: CLUSTER_SETUP.cloud.id,
      clusterType: "cloud",
      status: "healthy",
      temperature: 55 + i * 4,
      utilization: 50 + i * 10,
      memoryUsed: 12 + i * 4,
      memoryTotal: 24,
      powerDraw: 220 + i * 20,
      fanSpeed: 1600 + i * 200,
      errorCount: 0,
      anomalyRisk: 0.1,
      trendRisk: 0.15,
      riskScore: 0,
      healthScore: 0,
      assignedWorkloads: [],
      idleMinutes: 5 + i * 2,
      standbyEligible: false,
    });
  }

  return gpus;
}

function createBaseWorkloads(): Workload[] {
  const workloads: Workload[] = [];
  const priorities: WorkloadPriority[] = ["critical", "high", "medium", "low", "research"];
  const privacyPolicies: PrivacyPolicy[] = ["on-prem-only", "edge-allowed", "central-allowed", "cloud-allowed"];

  for (let i = 0; i < TOTAL_WORKLOADS; i++) {
    const nameIndex = i % WORKLOAD_NAMES.length;
    const priorityIndex = i % priorities.length;
    const privacyIndex = i % privacyPolicies.length;

    workloads.push({
      id: generateId("workload"),
      name: WORKLOAD_NAMES[nameIndex],
      type: "inference",
      priority: priorities[priorityIndex],
      deadlineSeconds: 300 + i * 60,
      remainingSeconds: 300 + i * 60,
      privacyPolicy: privacyPolicies[privacyIndex],
      computeNeed: 5 + (i % 5),
      memoryNeed: 4 + (i % 4),
      status: "pending",
      assignedGpuId: undefined,
    });
  }

  return workloads;
}

function applyScenario(gpus: Gpu[], workloads: Workload[], scenario: string): { gpus: Gpu[]; workloads: Workload[] } {
  const modifiedGpus = gpus.map((gpu) => ({ ...gpu }));
  const modifiedWorkloads = workloads.map((workload) => ({ ...workload }));

  switch (scenario) {
    case "normal_day":
      // Normal operation - small variations
      modifiedGpus.forEach((gpu) => {
        gpu.temperature += Math.random() * 5 - 2.5;
        gpu.utilization += Math.random() * 10 - 5;
      });
      break;

    case "local_gpu_overheat":
      modifiedGpus.filter((g) => g.clusterType === "local").forEach((gpu) => {
        gpu.temperature = 85 + Math.random() * 10;
        gpu.utilization = 90 + Math.random() * 8;
        gpu.fanSpeed = 2500 + Math.random() * 500;
        gpu.status = "warning";
      });
      break;

    case "central_cluster_overload":
      modifiedGpus.filter((g) => g.clusterType === "central").forEach((gpu) => {
        gpu.utilization = 95 + Math.random() * 4;
        gpu.memoryUsed = 22 + Math.random() * 2;
        gpu.powerDraw = 380 + Math.random() * 20;
        gpu.status = "warning";
      });
      break;

    case "cloud_privacy_block":
      modifiedWorkloads.filter((w) => w.privacyPolicy === "on-prem-only").forEach((workload) => {
        workload.status = "blocked";
        workload.assignedGpuId = undefined;
      });
      modifiedGpus.filter((g) => g.clusterType === "cloud").forEach((gpu) => {
        gpu.status = "idle";
        gpu.utilization = 10;
      });
      break;

    case "network_latency_spike":
      modifiedGpus.filter((g) => g.clusterType === "cloud").forEach((gpu) => {
        gpu.status = "warning";
        gpu.anomalyRisk = 0.6;
      });
      break;

    case "model_drift_warning":
      modifiedGpus.forEach((gpu) => {
        gpu.trendRisk = 0.5 + Math.random() * 0.3;
        gpu.status = gpu.trendRisk > 0.7 ? "warning" : gpu.status;
      });
      break;

    case "no_safe_route":
      modifiedGpus.forEach((gpu) => {
        gpu.temperature = 75 + Math.random() * 15;
        gpu.utilization = 85 + Math.random() * 12;
        gpu.status = "critical";
      });
      break;

    case "full_hospital_crisis":
      modifiedGpus.forEach((gpu) => {
        gpu.utilization = 95 + Math.random() * 5;
        gpu.memoryUsed = 20 + Math.random() * 4;
        gpu.status = "critical";
      });
      modifiedWorkloads.filter((w) => w.priority === "critical").forEach((workload) => {
        workload.remainingSeconds = 60 + Math.random() * 120;
      });
      break;

    case "idle_gpu_waste":
      modifiedGpus.forEach((gpu) => {
        gpu.utilization = 5 + Math.random() * 10;
        gpu.status = "idle";
        gpu.idleMinutes = 30 + Math.random() * 60;
        gpu.standbyEligible = true;
      });
      break;

    case "single_gpu_failure_warning":
      const failedGpuIndex = Math.floor(Math.random() * modifiedGpus.length);
      modifiedGpus[failedGpuIndex].temperature = 95;
      modifiedGpus[failedGpuIndex].errorCount = 5;
      modifiedGpus[failedGpuIndex].status = "critical";
      break;

    case "multiple_gpu_risk":
      modifiedGpus.slice(0, 3).forEach((gpu) => {
        gpu.temperature = 80 + Math.random() * 10;
        gpu.utilization = 85 + Math.random() * 10;
        gpu.errorCount = 2 + Math.floor(Math.random() * 3);
        gpu.status = "warning";
      });
      break;

    case "all_gpu_overloaded":
      modifiedGpus.forEach((gpu) => {
        gpu.utilization = 96 + Math.random() * 4;
        gpu.memoryUsed = 22 + Math.random() * 2;
        gpu.powerDraw = 390 + Math.random() * 10;
        gpu.status = "critical";
      });
      break;

    case "safe_energy_saving_window":
      modifiedGpus.forEach((gpu) => {
        gpu.utilization = 15 + Math.random() * 10;
        gpu.powerDraw = 120 + Math.random() * 30;
        gpu.status = "idle";
        gpu.standbyEligible = true;
      });
      break;

    default:
      break;
  }

  return { gpus: modifiedGpus, workloads: modifiedWorkloads };
}

function calculateRiskScores(gpus: Gpu[]): Gpu[] {
  return gpus.map((gpu) => {
    const riskScore = calculateGpuRiskScore(gpu);
    const healthScore = calculateHealthScore(riskScore);
    const riskLevel = getRiskLevel(riskScore);

    let status: GpuStatus = gpu.status;
    if (riskLevel === "critical" && gpu.status !== "critical") {
      status = "critical";
    } else if (riskLevel === "high" && gpu.status === "healthy") {
      status = "warning";
    }

    return {
      ...gpu,
      riskScore,
      healthScore,
      status,
    };
  });
}

function calculateClusterSummaries(gpus: Gpu[]): ClusterSummary[] {
  const clusters: ClusterSummary[] = [];

  Object.values(CLUSTER_SETUP).forEach((setup) => {
    const clusterGpus = gpus.filter((g) => g.clusterId === setup.id);
    const healthyGpus = clusterGpus.filter((g) => g.status === "healthy").length;
    const warningGpus = clusterGpus.filter((g) => g.status === "warning").length;
    const criticalGpus = clusterGpus.filter((g) => g.status === "critical").length;
    const idleGpus = clusterGpus.filter((g) => g.status === "idle").length;
    const averageUtilization = clusterGpus.reduce((sum, g) => sum + g.utilization, 0) / clusterGpus.length;
    const averageTemperature = clusterGpus.reduce((sum, g) => sum + g.temperature, 0) / clusterGpus.length;

    clusters.push({
      clusterId: setup.id,
      clusterType: setup.id.includes("local") ? "local" : setup.id.includes("central") ? "central" : "cloud",
      name: setup.name,
      totalGpus: setup.totalGpus,
      healthyGpus,
      warningGpus,
      criticalGpus,
      idleGpus,
      averageUtilization,
      averageTemperature,
    });
  });

  return clusters;
}

function calculateMeshMetrics(gpus: Gpu[], workloads: Workload[]): {
  activeWorkloads: number;
  criticalWorkloads: number;
  riskyGpus: number;
  idleGpus: number;
  clusterHealth: number;
  estimatedSaving: number;
} {
  const activeWorkloads = workloads.filter((w) => w.status === "running" || w.status === "pending").length;
  const criticalWorkloads = workloads.filter((w) => w.priority === "critical").length;
  const riskyGpus = gpus.filter((g) => g.riskScore > 0.5).length;
  const idleGpus = gpus.filter((g) => g.status === "idle" || g.status === "standby").length;
  const clusterHealth = Math.round(gpus.reduce((sum, g) => sum + g.healthScore, 0) / gpus.length);
  const estimatedSaving = idleGpus * 150 + (gpus.filter((g) => g.standbyEligible).length * 75);

  return {
    activeWorkloads,
    criticalWorkloads,
    riskyGpus,
    idleGpus,
    clusterHealth,
    estimatedSaving,
  };
}

function createAuditLog(level: "info" | "warning" | "error" | "critical", category: string, message: string, details?: Record<string, unknown>): AuditLog {
  return {
    id: generateId("audit"),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details,
  };
}

export function createInitialMeshState(): MeshState {
  const baseGpus = createBaseGpus();
  const baseWorkloads = createBaseWorkloads();
  const gpus = calculateRiskScores(baseGpus);
  const clusters = calculateClusterSummaries(gpus);
  const metrics = calculateMeshMetrics(gpus, baseWorkloads);

  const auditLogs: AuditLog[] = [
    createAuditLog("info", "system", "Mesh state initialized", {
      totalGpus: gpus.length,
      totalWorkloads: baseWorkloads.length,
    }),
  ];

  return {
    scenario: "normal_day",
    totalGpus: gpus.length,
    activeWorkloads: metrics.activeWorkloads,
    criticalWorkloads: metrics.criticalWorkloads,
    riskyGpus: metrics.riskyGpus,
    idleGpus: metrics.idleGpus,
    clusterHealth: metrics.clusterHealth,
    estimatedSaving: metrics.estimatedSaving,
    gpus,
    workloads: baseWorkloads,
    clusters,
    auditLogs,
  };
}

export function runScenario(previousState?: MeshState): MeshState {
  const randomScenarioIndex = Math.floor(Math.random() * SCENARIOS.length);
  const scenario = SCENARIOS[randomScenarioIndex];

  const baseGpus = previousState ? [...previousState.gpus] : createBaseGpus();
  const baseWorkloads = previousState ? [...previousState.workloads] : createBaseWorkloads();

  const { gpus: scenarioGpus, workloads: scenarioWorkloads } = applyScenario(baseGpus, baseWorkloads, scenario);
  const gpus = calculateRiskScores(scenarioGpus);
  const clusters = calculateClusterSummaries(gpus);
  const metrics = calculateMeshMetrics(gpus, scenarioWorkloads);

  const auditLogs: AuditLog[] = previousState ? [...previousState.auditLogs] : [];
  auditLogs.push(
    createAuditLog("info", "scenario", `Scenario started: ${scenario}`, {
      scenario,
      timestamp: new Date().toISOString(),
    })
  );
  auditLogs.push(
    createAuditLog("info", "risk", "Risk scores calculated", {
      averageRiskScore: gpus.reduce((sum, g) => sum + g.riskScore, 0) / gpus.length,
      riskyGpus: metrics.riskyGpus,
    })
  );

  return {
    scenario,
    totalGpus: gpus.length,
    activeWorkloads: metrics.activeWorkloads,
    criticalWorkloads: metrics.criticalWorkloads,
    riskyGpus: metrics.riskyGpus,
    idleGpus: metrics.idleGpus,
    clusterHealth: metrics.clusterHealth,
    estimatedSaving: metrics.estimatedSaving,
    gpus,
    workloads: scenarioWorkloads,
    clusters,
    auditLogs,
  };
}
