import type {
  MeshState,
  Gpu,
  ClusterSummary,
  AuditLog,
  Workload,
} from "../medroutex/types";
import { TOTAL_WORKLOADS, WORKLOAD_NAMES } from "../medroutex/constants";
import type { OperationalTwinState } from "./types";
import { hasComputeCrisisTelemetry } from "./scenario-identity";

const COMPATIBILITY_PRIORITIES: readonly Workload["priority"][] = [
  "critical",
  "high",
  "medium",
  "low",
  "research",
];

const COMPATIBILITY_PRIVACY_POLICIES: readonly Workload["privacyPolicy"][] = [
  "central-allowed",
  "edge-allowed",
  "central-allowed",
  "cloud-allowed",
  "on-prem-only",
];

function createCompatibilityWorkloads(hasCrisisGpus: boolean): Workload[] {
  const localTargetIds = hasCrisisGpus
    ? ["gpu-local-0", "gpu-local-3"]
    : ["gpu-local-0", "gpu-local-1", "gpu-local-2", "gpu-local-3"];
  const centralTargetIds = [
    "gpu-central-0",
    "gpu-central-1",
    "gpu-central-7",
    "gpu-central-2",
  ];
  const cloudTargetIds = ["gpu-cloud-0", "gpu-cloud-1"];

  return Array.from({ length: TOTAL_WORKLOADS }, (_, index): Workload => {
    if (index === 0) {
      return {
        id: "workload-stroke-ct-001",
        name: hasCrisisGpus ? "Emergency Stroke CT" : "Stroke CT AI",
        type: "inference",
        priority: "critical",
        deadlineSeconds: hasCrisisGpus ? 120 : 300,
        remainingSeconds: hasCrisisGpus ? 120 : 300,
        privacyPolicy: hasCrisisGpus ? "central-allowed" : "on-prem-only",
        computeNeed: 5,
        memoryNeed: 4,
        status: "running",
        assignedGpuId: hasCrisisGpus ? "gpu-local-1" : "gpu-local-0",
      };
    }

    const privacyPolicy =
      COMPATIBILITY_PRIVACY_POLICIES[index % COMPATIBILITY_PRIVACY_POLICIES.length];
    const assignedGpuId = privacyPolicy === "on-prem-only"
      ? localTargetIds[index % localTargetIds.length]
      : privacyPolicy === "cloud-allowed"
        ? cloudTargetIds[index % cloudTargetIds.length]
        : centralTargetIds[index % centralTargetIds.length];
    const deadlineSeconds = 300 + index * 60;

    return {
      id: `workload-synthetic-${String(index + 1).padStart(3, "0")}`,
      name: WORKLOAD_NAMES[index % WORKLOAD_NAMES.length],
      type: "inference",
      priority: COMPATIBILITY_PRIORITIES[index % COMPATIBILITY_PRIORITIES.length],
      deadlineSeconds,
      remainingSeconds: deadlineSeconds,
      privacyPolicy,
      computeNeed: 5 + (index % 5),
      memoryNeed: 4 + (index % 4),
      status: "running",
      assignedGpuId,
    };
  });
}

/**
 * Compatibility adapter: Derive legacy MeshState from canonical OperationalTwinState
 * This ensures dashboard compatibility while maintaining Operational Twin as single source of truth
 */
export function deriveMeshStateFromOperationalTwin(
  operationalTwin: OperationalTwinState,
  scenario: string
): MeshState {
  // Extract GPU entities from Operational Twin
  const gpuEntities = operationalTwin.entities.filter(
    (e) => e.entityType === "compute-node"
  );

  // Use canonical telemetry rather than the overall hospital status or a
  // stroke-only scenario label. This preserves GPU crisis cards during
  // Hospital Sync and in the cross-domain Hospital Cascade scenario.
  const hasCrisisGPUs = hasComputeCrisisTelemetry(operationalTwin);

  let gpus: Gpu[];
  
  if (hasCrisisGPUs) {
    // Generate baseline GPU cluster (10 GPUs: 4 local, 4 central, 2 cloud)
    // Legacy local IDs are zero-based while visible dashboard labels are one-based.
    gpus = [
      // Local GPUs 0-3
      {
        id: "gpu-local-0",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 45,
        utilization: 30,
        memoryUsed: 8,
        memoryTotal: 24,
        powerDraw: 180,
        fanSpeed: 1200,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 15,
        standbyEligible: false,
      },
      {
        id: "gpu-local-1",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 47,
        utilization: 35,
        memoryUsed: 10,
        memoryTotal: 24,
        powerDraw: 190,
        fanSpeed: 1300,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 20,
        standbyEligible: false,
      },
      {
        id: "gpu-local-2",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 49,
        utilization: 40,
        memoryUsed: 12,
        memoryTotal: 24,
        powerDraw: 200,
        fanSpeed: 1400,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 25,
        standbyEligible: false,
      },
      {
        id: "gpu-local-3",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 51,
        utilization: 45,
        memoryUsed: 14,
        memoryTotal: 24,
        powerDraw: 210,
        fanSpeed: 1500,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 30,
        standbyEligible: false,
      },
      // Central GPUs (0, 1, 2, 7 for crisis mapping)
      {
        id: "gpu-central-0",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 50,
        utilization: 40,
        memoryUsed: 10,
        memoryTotal: 24,
        powerDraw: 200,
        fanSpeed: 1400,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 10,
        standbyEligible: false,
      },
      {
        id: "gpu-central-1",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 53,
        utilization: 48,
        memoryUsed: 13,
        memoryTotal: 24,
        powerDraw: 215,
        fanSpeed: 1550,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 13,
        standbyEligible: false,
      },
      {
        id: "gpu-central-2",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 56,
        utilization: 56,
        memoryUsed: 16,
        memoryTotal: 24,
        powerDraw: 230,
        fanSpeed: 1700,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 16,
        standbyEligible: false,
      },
      {
        id: "gpu-central-7",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 52,
        utilization: 25,
        memoryUsed: 2,
        memoryTotal: 16,
        powerDraw: 150,
        fanSpeed: 1450,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 10,
        standbyEligible: false,
      },
      // Cloud GPUs 0-1
      {
        id: "gpu-cloud-0",
        clusterId: "cloud-cluster-1",
        clusterType: "cloud" as const,
        status: "healthy" as const,
        temperature: 55,
        utilization: 50,
        memoryUsed: 12,
        memoryTotal: 24,
        powerDraw: 220,
        fanSpeed: 1600,
        errorCount: 0,
        anomalyRisk: 0.1,
        trendRisk: 0.15,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 5,
        standbyEligible: false,
      },
      {
        id: "gpu-cloud-1",
        clusterId: "cloud-cluster-1",
        clusterType: "cloud" as const,
        status: "healthy" as const,
        temperature: 59,
        utilization: 60,
        memoryUsed: 16,
        memoryTotal: 24,
        powerDraw: 240,
        fanSpeed: 1800,
        errorCount: 0,
        anomalyRisk: 0.1,
        trendRisk: 0.15,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 7,
        standbyEligible: false,
      },
    ];

    // Overwrite specific GPUs with crisis state from Operational Twin
    // Map one-based Operational Twin entity numbers to legacy dashboard IDs.
    const gpuIdMapping: Record<string, string> = {
      "compute-local-gpu-02": "gpu-local-1",
      "compute-local-gpu-03": "gpu-local-2",
      "compute-central-gpu-07": "gpu-central-7",
    };

    gpuEntities.forEach((entity) => {
      const targetGpuId = gpuIdMapping[entity.id];
      if (!targetGpuId) return; // Skip if not a known crisis GPU

      const temp = (entity.attributes.temperatureC as number) || 45;
      const util = (entity.attributes.utilizationPercent as number) || 30;
      const memUsedMiB = (entity.attributes.memoryUsedMiB as number) || 8;
      const memTotalMiB = (entity.attributes.memoryTotalMiB as number) || 24;
      const power = (entity.attributes.powerDrawW as number) || 180;

      // Convert MiB to GB for dashboard compatibility
      const memUsedGB = Math.round((memUsedMiB / 1024) * 10) / 10;
      const memTotalGB = Math.round((memTotalMiB / 1024) * 10) / 10;

      // Calculate risk score based on entity status and health score
      const riskScore = entity.status === "critical" 
        ? 0.75 
        : entity.status === "warning" 
        ? 0.5 
        : (100 - entity.healthScore) / 100;

      // Map TwinOperationalStatus to GpuStatus
      let gpuStatus: Gpu["status"] = "healthy";
      if (entity.status === "critical") gpuStatus = "critical";
      else if (entity.status === "warning") gpuStatus = "warning";
      else if (entity.status === "offline") gpuStatus = "idle";

      // Determine cluster type from target GPU ID
      const clusterType: "local" | "central" | "cloud" = 
        targetGpuId.includes("central") ? "central" : 
        targetGpuId.includes("cloud") ? "cloud" : "local";

      // Find and replace the specific GPU by ID
      const index = gpus.findIndex((g) => g.id === targetGpuId);
      if (index !== -1) {
        gpus[index] = {
          id: targetGpuId,
          clusterId: clusterType === "central" ? "central-cluster-1" : 
                     clusterType === "cloud" ? "cloud-cluster-1" : "local-cluster-1",
          clusterType: clusterType,
          status: gpuStatus,
          temperature: temp,
          utilization: util,
          memoryUsed: memUsedGB,
          memoryTotal: memTotalGB,
          powerDraw: power,
          fanSpeed: 1200 + (temp - 45) * 50,
          errorCount: entity.status === "critical" ? 5 : 0,
          anomalyRisk: 0.05,
          trendRisk: entity.status === "critical" ? 0.3 : 0.1,
          riskScore,
          healthScore: entity.healthScore,
          assignedWorkloads: [],
          idleMinutes: 15,
          standbyEligible: gpuStatus === "idle",
        };
      }
    });
  } else {
    // Generate baseline GPU cluster (10 GPUs: 4 local, 4 central, 2 cloud)
    // Use same specific IDs as crisis case for consistency
    gpus = [
      // Local GPUs 0-3
      {
        id: "gpu-local-0",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 45,
        utilization: 30,
        memoryUsed: 8,
        memoryTotal: 24,
        powerDraw: 180,
        fanSpeed: 1200,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 15,
        standbyEligible: false,
      },
      {
        id: "gpu-local-1",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 47,
        utilization: 35,
        memoryUsed: 10,
        memoryTotal: 24,
        powerDraw: 190,
        fanSpeed: 1300,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 20,
        standbyEligible: false,
      },
      {
        id: "gpu-local-2",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 49,
        utilization: 40,
        memoryUsed: 12,
        memoryTotal: 24,
        powerDraw: 200,
        fanSpeed: 1400,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 25,
        standbyEligible: false,
      },
      {
        id: "gpu-local-3",
        clusterId: "local-cluster-1",
        clusterType: "local" as const,
        status: "healthy" as const,
        temperature: 51,
        utilization: 45,
        memoryUsed: 14,
        memoryTotal: 24,
        powerDraw: 210,
        fanSpeed: 1500,
        errorCount: 0,
        anomalyRisk: 0.05,
        trendRisk: 0.1,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 30,
        standbyEligible: false,
      },
      // Central GPUs (0, 1, 2, 7 for consistency with crisis mapping)
      {
        id: "gpu-central-0",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 50,
        utilization: 40,
        memoryUsed: 10,
        memoryTotal: 24,
        powerDraw: 200,
        fanSpeed: 1400,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 10,
        standbyEligible: false,
      },
      {
        id: "gpu-central-1",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 53,
        utilization: 48,
        memoryUsed: 13,
        memoryTotal: 24,
        powerDraw: 215,
        fanSpeed: 1550,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 13,
        standbyEligible: false,
      },
      {
        id: "gpu-central-2",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 56,
        utilization: 56,
        memoryUsed: 16,
        memoryTotal: 24,
        powerDraw: 230,
        fanSpeed: 1700,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 16,
        standbyEligible: false,
      },
      {
        id: "gpu-central-7",
        clusterId: "central-cluster-1",
        clusterType: "central" as const,
        status: "healthy" as const,
        temperature: 52,
        utilization: 25,
        memoryUsed: 2,
        memoryTotal: 16,
        powerDraw: 150,
        fanSpeed: 1450,
        errorCount: 0,
        anomalyRisk: 0.08,
        trendRisk: 0.12,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 10,
        standbyEligible: false,
      },
      // Cloud GPUs 0-1
      {
        id: "gpu-cloud-0",
        clusterId: "cloud-cluster-1",
        clusterType: "cloud" as const,
        status: "healthy" as const,
        temperature: 55,
        utilization: 50,
        memoryUsed: 12,
        memoryTotal: 24,
        powerDraw: 220,
        fanSpeed: 1600,
        errorCount: 0,
        anomalyRisk: 0.1,
        trendRisk: 0.15,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 5,
        standbyEligible: false,
      },
      {
        id: "gpu-cloud-1",
        clusterId: "cloud-cluster-1",
        clusterType: "cloud" as const,
        status: "healthy" as const,
        temperature: 59,
        utilization: 60,
        memoryUsed: 16,
        memoryTotal: 24,
        powerDraw: 240,
        fanSpeed: 1800,
        errorCount: 0,
        anomalyRisk: 0.1,
        trendRisk: 0.15,
        riskScore: 0.018,
        healthScore: 98,
        assignedWorkloads: [],
        idleMinutes: 7,
        standbyEligible: false,
      },
    ];
  }

  // Normalize array positions to the dashboard's global one-based GPU labels.
  // Central GPU-7 must occupy visible position 7; Central GPU-2 remains the
  // unrelated baseline node at visible position 8.
  const visibleGpuIdOrder: readonly string[] = [
    "gpu-local-0",
    "gpu-local-1",
    "gpu-local-2",
    "gpu-local-3",
    "gpu-central-0",
    "gpu-central-1",
    "gpu-central-7",
    "gpu-central-2",
    "gpu-cloud-0",
    "gpu-cloud-1",
  ];
  const visiblePositionById = new Map(
    visibleGpuIdOrder.map((gpuId, index) => [gpuId, index])
  );
  gpus.sort(
    (a, b) =>
      (visiblePositionById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (visiblePositionById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );

  // Calculate cluster summaries
  const clusters: ClusterSummary[] = [
    {
      clusterId: "local-cluster-1",
      clusterType: "local",
      name: "Local Hospital Edge Cluster",
      totalGpus: gpus.filter((g) => g.clusterType === "local").length,
      healthyGpus: gpus.filter((g) => g.clusterType === "local" && g.status === "healthy").length,
      warningGpus: gpus.filter((g) => g.clusterType === "local" && g.status === "warning").length,
      criticalGpus: gpus.filter((g) => g.clusterType === "local" && g.status === "critical").length,
      idleGpus: gpus.filter((g) => g.clusterType === "local" && g.status === "idle").length,
      averageUtilization: gpus.filter((g) => g.clusterType === "local").reduce((sum, g) => sum + g.utilization, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "local").length),
      averageTemperature: gpus.filter((g) => g.clusterType === "local").reduce((sum, g) => sum + g.temperature, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "local").length),
    },
    {
      clusterId: "central-cluster-1",
      clusterType: "central",
      name: "Central Hospital GPU Cluster",
      totalGpus: gpus.filter((g) => g.clusterType === "central").length,
      healthyGpus: gpus.filter((g) => g.clusterType === "central" && g.status === "healthy").length,
      warningGpus: gpus.filter((g) => g.clusterType === "central" && g.status === "warning").length,
      criticalGpus: gpus.filter((g) => g.clusterType === "central" && g.status === "critical").length,
      idleGpus: gpus.filter((g) => g.clusterType === "central" && g.status === "idle").length,
      averageUtilization: gpus.filter((g) => g.clusterType === "central").reduce((sum, g) => sum + g.utilization, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "central").length),
      averageTemperature: gpus.filter((g) => g.clusterType === "central").reduce((sum, g) => sum + g.temperature, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "central").length),
    },
    {
      clusterId: "cloud-cluster-1",
      clusterType: "cloud",
      name: "Cloud Burst Cluster",
      totalGpus: gpus.filter((g) => g.clusterType === "cloud").length,
      healthyGpus: gpus.filter((g) => g.clusterType === "cloud" && g.status === "healthy").length,
      warningGpus: gpus.filter((g) => g.clusterType === "cloud" && g.status === "warning").length,
      criticalGpus: gpus.filter((g) => g.clusterType === "cloud" && g.status === "critical").length,
      idleGpus: gpus.filter((g) => g.clusterType === "cloud" && g.status === "idle").length,
      averageUtilization: gpus.filter((g) => g.clusterType === "cloud").reduce((sum, g) => sum + g.utilization, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "cloud").length),
      averageTemperature: gpus.filter((g) => g.clusterType === "cloud").reduce((sum, g) => sum + g.temperature, 0) / Math.max(1, gpus.filter((g) => g.clusterType === "cloud").length),
    },
  ];

  // Calculate metrics
  const totalGpus = gpus.length;
  const riskyGpus = gpus.filter((g) => g.riskScore > 0.5).length;
  const idleGpus = gpus.filter((g) => g.status === "idle" || g.status === "standby").length;
  const clusterHealth = operationalTwin.overallHealthScore;
  const estimatedSaving = idleGpus * 150;

  // Keep the full deterministic 20-workload demo inventory in every derived view.
  const workloads = createCompatibilityWorkloads(hasCrisisGPUs);
  const activeWorkloads = workloads.filter(
    (workload) => workload.status === "running" || workload.status === "pending"
  ).length;
  const criticalWorkloads = workloads.filter(
    (workload) => workload.priority === "critical"
  ).length;

  // Create audit log (deterministic ID based on state version)
  const auditLogs: AuditLog[] = [
    {
      id: `audit-${operationalTwin.twinId}-${operationalTwin.version}`,
      timestamp: operationalTwin.lastSynchronizedAt,
      level: operationalTwin.overallStatus === "critical" ? "critical" : "info",
      category: "system",
      message: `State synchronized with Operational Twin: ${operationalTwin.overallStatus}`,
      details: {
        twinId: operationalTwin.twinId,
        version: operationalTwin.version,
      },
    },
  ];

  return {
    scenario,
    totalGpus,
    activeWorkloads,
    criticalWorkloads,
    riskyGpus,
    idleGpus,
    clusterHealth,
    estimatedSaving,
    gpus,
    workloads,
    clusters,
    auditLogs,
  };
}
