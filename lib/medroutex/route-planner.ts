import type { MeshState, Gpu, Workload, ClusterType } from "./types";

export type RouteAction = "migrate" | "keep" | "queue" | "standby" | "manual_review";

export type SafetyStatus = "safe" | "warning" | "blocked";

export type PrivacyStatus = "allowed" | "blocked";

export interface RouteRecommendation {
  id: string;
  workloadId: string;
  workloadName: string;
  fromGpuId?: string;
  targetGpuId?: string;
  targetClusterType: ClusterType;
  priority: string;
  reason: string;
  safetyStatus: SafetyStatus;
  privacyStatus: PrivacyStatus;
  estimatedRiskReduction: number;
  estimatedLatencySeconds: number;
  estimatedCostSaving: number;
  action: RouteAction;
}

function isPrivacyAllowed(workloadPrivacy: string, targetCluster: ClusterType): boolean {
  switch (workloadPrivacy) {
    case "on-prem-only":
      return targetCluster === "local";
    case "edge-allowed":
      return targetCluster === "local" || targetCluster === "central";
    case "central-allowed":
      return targetCluster === "local" || targetCluster === "central";
    case "cloud-allowed":
      return true;
    default:
      return false;
  }
}

function findSafeTargetGpu(
  gpus: Gpu[],
  workloadPrivacy: string,
  memoryNeed: number,
  currentGpuId?: string
): Gpu | null {
  const eligibleGpus = gpus.filter((gpu) => {
    if (currentGpuId && gpu.id === currentGpuId) return false;
    if (!isPrivacyAllowed(workloadPrivacy, gpu.clusterType)) return false;
    if (gpu.status !== "healthy" && gpu.status !== "idle") return false;
    if (gpu.riskScore >= 0.35) return false;
    if (gpu.utilization >= 80) return false;
    if (gpu.memoryUsed + memoryNeed > gpu.memoryTotal) return false;
    return true;
  });

  if (eligibleGpus.length === 0) return null;

  // Sort by lowest risk score, then lowest utilization
  eligibleGpus.sort((a, b) => {
    if (a.riskScore !== b.riskScore) return a.riskScore - b.riskScore;
    return a.utilization - b.utilization;
  });

  return eligibleGpus[0];
}

function getPriorityScore(priority: string): number {
  switch (priority) {
    case "critical":
      return 100;
    case "high":
      return 75;
    case "medium":
      return 50;
    case "low":
      return 25;
    case "research":
      return 10;
    default:
      return 0;
  }
}

export function generateRouteRecommendations(state: MeshState): RouteRecommendation[] {
  const recommendations: RouteRecommendation[] = [];
  let recommendationCount = 0;
  const maxRecommendations = 8;

  // Sort workloads by priority
  const sortedWorkloads = [...state.workloads].sort(
    (a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority)
  );

  for (const workload of sortedWorkloads) {
    if (recommendationCount >= maxRecommendations) break;

    const currentGpu = workload.assignedGpuId
      ? state.gpus.find((g) => g.id === workload.assignedGpuId)
      : null;

    // Check if current GPU is risky
    const currentGpuRisky = currentGpu && currentGpu.riskScore >= 0.5;

    // Try to find a safe target
    const targetGpu = findSafeTargetGpu(
      state.gpus,
      workload.privacyPolicy,
      workload.memoryNeed,
      workload.assignedGpuId
    );

    let action: RouteAction;
    let safetyStatus: SafetyStatus;
    let privacyStatus: PrivacyStatus;
    let reason: string;
    let estimatedRiskReduction = 0;
    let estimatedLatencySeconds = 0;
    let estimatedCostSaving = 0;

    if (!targetGpu) {
      // No safe target available
      if (currentGpuRisky) {
        action = "manual_review";
        safetyStatus = "blocked";
        privacyStatus = "allowed";
        reason = "Current GPU is risky but no safe alternative available within privacy constraints";
      } else if (!currentGpu) {
        action = "queue";
        safetyStatus = "warning";
        privacyStatus = "allowed";
        reason = "No available GPU with sufficient capacity and privacy compliance";
      } else {
        action = "keep";
        safetyStatus = "safe";
        privacyStatus = "allowed";
        reason = "Current assignment is optimal";
      }
    } else {
      // Safe target found
      const privacyAllowed = isPrivacyAllowed(workload.privacyPolicy, targetGpu.clusterType);
      
      if (!privacyAllowed) {
        action = "manual_review";
        safetyStatus = "blocked";
        privacyStatus = "blocked";
        reason = "Target cluster violates privacy policy";
      } else if (currentGpuRisky) {
        action = "migrate";
        safetyStatus = "safe";
        privacyStatus = "allowed";
        reason = "Migrate from risky GPU to safer target";
        estimatedRiskReduction = currentGpu ? currentGpu.riskScore - targetGpu.riskScore : targetGpu.riskScore;
        estimatedLatencySeconds = targetGpu.clusterType === "cloud" ? 50 : 10;
        estimatedCostSaving = targetGpu.clusterType === "cloud" ? -20 : 15;
      } else if (!currentGpu) {
        action = "migrate";
        safetyStatus = "safe";
        privacyStatus = "allowed";
        reason = "Assign to available healthy GPU";
        estimatedRiskReduction = 0.1;
        estimatedLatencySeconds = targetGpu.clusterType === "cloud" ? 50 : 10;
        estimatedCostSaving = 10;
      } else {
        action = "keep";
        safetyStatus = "safe";
        privacyStatus = "allowed";
        reason = "Current assignment is acceptable";
      }
    }

    // Check for idle GPUs that can go to standby
    if (currentGpu && currentGpu.status === "idle" && currentGpu.standbyEligible) {
      action = "standby";
      safetyStatus = "safe";
      privacyStatus = "allowed";
      reason = "GPU can enter standby mode to save energy";
      estimatedCostSaving = 25;
    }

    recommendations.push({
      id: `rec-${Date.now()}-${recommendationCount}`,
      workloadId: workload.id,
      workloadName: workload.name,
      fromGpuId: currentGpu?.id,
      targetGpuId: targetGpu?.id,
      targetClusterType: targetGpu?.clusterType || currentGpu?.clusterType || "local",
      priority: workload.priority,
      reason,
      safetyStatus,
      privacyStatus,
      estimatedRiskReduction: Math.round(estimatedRiskReduction * 100) / 100,
      estimatedLatencySeconds,
      estimatedCostSaving,
      action,
    });

    recommendationCount++;
  }

  return recommendations;
}
