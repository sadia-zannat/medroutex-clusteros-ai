import type { MeshState, Gpu, ClusterSummary, AuditLog } from "../medroutex/types";
import type { OperationalTwinState, TwinEntity } from "./types";

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

  // Use scenario parameter to determine crisis state
  const isCrisis = scenario === "medroutex-stroke-crisis";

  // If we have crisis-specific GPU entities, use them; otherwise generate baseline GPUs
  const hasCrisisGPUs = isCrisis && gpuEntities.some((e) => 
    e.id === "compute-local-gpu-02" || 
    e.id === "compute-local-gpu-03" || 
    e.id === "compute-central-gpu-07"
  );

  let gpus: Gpu[];
  
  if (hasCrisisGPUs) {
    // Generate baseline GPU cluster (10 GPUs: 4 local, 4 central, 2 cloud)
    // Use specific IDs for crisis mapping (gpu-local-2, gpu-local-3, gpu-central-7)
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
    // Map Operational Twin entity IDs to dashboard GPU IDs
    const gpuIdMapping: Record<string, string> = {
      "compute-local-gpu-02": "gpu-local-2",
      "compute-local-gpu-03": "gpu-local-3",
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

  // Create synthetic workloads (for dashboard compatibility)
  const workloads = hasCrisisGPUs ? [
    {
      id: "workload-stroke-ct-001",
      name: "Emergency Stroke CT",
      type: "inference",
      priority: "critical" as const,
      deadlineSeconds: 120,
      remainingSeconds: 120,
      privacyPolicy: "central-allowed" as const,
      computeNeed: 5,
      memoryNeed: 4,
      status: operationalTwin.activeSimulation ? "pending" : "pending",
      assignedGpuId: undefined,
    },
    {
      id: "workload-trauma-ct-002",
      name: "Trauma CT AI",
      type: "inference",
      priority: "high" as const,
      deadlineSeconds: 300,
      remainingSeconds: 300,
      privacyPolicy: "edge-allowed" as const,
      computeNeed: 6,
      memoryNeed: 5,
      status: "pending",
      assignedGpuId: undefined,
    },
  ] : [
    {
      id: "workload-stroke-ct-001",
      name: "Stroke CT AI",
      type: "inference",
      priority: "critical" as const,
      deadlineSeconds: 300,
      remainingSeconds: 300,
      privacyPolicy: "on-prem-only" as const,
      computeNeed: 5,
      memoryNeed: 4,
      status: "pending",
      assignedGpuId: undefined,
    },
    {
      id: "workload-trauma-ct-002",
      name: "Trauma CT AI",
      type: "inference",
      priority: "high" as const,
      deadlineSeconds: 360,
      remainingSeconds: 360,
      privacyPolicy: "edge-allowed" as const,
      computeNeed: 6,
      memoryNeed: 5,
      status: "pending",
      assignedGpuId: undefined,
    },
    {
      id: "workload-icu-chest-003",
      name: "ICU Chest X-ray",
      type: "inference",
      priority: "medium" as const,
      deadlineSeconds: 420,
      remainingSeconds: 420,
      privacyPolicy: "central-allowed" as const,
      computeNeed: 7,
      memoryNeed: 6,
      status: "pending",
      assignedGpuId: undefined,
    },
    {
      id: "workload-mri-seg-004",
      name: "MRI Segmentation",
      type: "inference",
      priority: "low" as const,
      deadlineSeconds: 480,
      remainingSeconds: 480,
      privacyPolicy: "cloud-allowed" as const,
      computeNeed: 8,
      memoryNeed: 7,
      status: "pending",
      assignedGpuId: undefined,
    },
  ];

  const activeWorkloads = 20; // Fixed for dashboard compatibility
  const criticalWorkloads = 4; // Fixed for dashboard compatibility

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
