import type {
  GuardEvaluation,
  GuardRulerResult,
  RankedPlan,
} from "../twin-core/types";
import type { ClusterType } from "./types";

export type RouteAction =
  | "migrate"
  | "keep"
  | "queue"
  | "standby"
  | "manual_review";

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
  requiresHumanApproval?: boolean;
  deadlineSeconds?: number;
  explanation?: string;
  rejectedAlternatives?: string[];
}

function round(value: number, decimalPlaces = 2): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}

function legacyAction(
  action: RankedPlan["candidatePlan"]["action"]
): RouteAction {
  switch (action) {
    case "keep":
    case "migrate":
    case "queue":
      return action;
    case "delay":
      return "queue";
    case "pause":
    case "drop":
    case "degraded-mode":
    case "manual-review":
      return "manual_review";
  }
}

function hasPrivacyViolation(evaluation: GuardEvaluation): boolean {
  return evaluation.violations.some(
    (violation) =>
      violation.ruleId === "privacy" ||
      violation.code === "PRIVACY_POLICY_BLOCK" ||
      violation.code === "PHI_ZERO_CLOUD_BLOCK"
  );
}

function blockedReasonLabel(evaluation: GuardEvaluation): string {
  const codes = new Set(
    evaluation.violations.map((violation) => violation.code)
  );

  if (codes.has("GPU_OVERHEATING")) return "overheating";
  if (
    codes.has("GPU_MEMORY_OVERLOAD") ||
    codes.has("INSUFFICIENT_MEMORY")
  ) {
    return "memory overload";
  }
  if (
    codes.has("PRIVACY_POLICY_BLOCK") ||
    codes.has("PHI_ZERO_CLOUD_BLOCK")
  ) {
    return "privacy blocked";
  }
  if (codes.has("GPU_OFFLINE")) return "GPU offline";
  if (codes.has("GPU_RISK_EXCEEDS_LIMIT")) return "GPU risk exceeds limit";
  if (codes.has("TELEMETRY_UNTRUSTED")) return "telemetry untrusted";
  if (codes.has("CRITICAL_DEADLINE_MISS")) return "deadline missed";
  if (codes.has("INSUFFICIENT_CAPACITY")) return "insufficient capacity";
  if (codes.has("CRITICAL_WORKLOAD_INTERRUPTION")) return "critical workload interruption";
  if (codes.has("POWER_DEPENDENCY_UNAVAILABLE")) return "power dependency unavailable";
  if (codes.has("NETWORK_DEPENDENCY_UNAVAILABLE")) return "network dependency unavailable";
  if (codes.has("ICU_CONTINUITY_UNAVAILABLE")) return "ICU continuity unavailable";
  if (codes.has("OXYGEN_CONTINUITY_UNAVAILABLE")) return "oxygen continuity unavailable";
  return "hard safety constraint";
}

function legacyBlockedTargetLabel(
  evaluation: GuardEvaluation
): string {
  const candidate = evaluation.candidatePlan;
  if (candidate.targetClusterType === "cloud") return "Cloud";

  return candidate.targetLabel
    .replace(/^Local\s+/i, "")
    .replace(/^Central\s+/i, "");
}

function rejectedAlternative(
  evaluation: GuardEvaluation
): string {
  return `${legacyBlockedTargetLabel(evaluation)} (${blockedReasonLabel(evaluation)})`;
}

function estimatedRiskReduction(plan: RankedPlan): number {
  const sourceHealth =
    plan.projection.before.sourceGpuHealthPercent ??
    plan.projection.before.targetGpuHealthPercent;
  const targetHealth = plan.projection.before.targetGpuHealthPercent;
  return round(Math.max(0, targetHealth - sourceHealth) / 100);
}

function safeRecommendation(
  result: GuardRulerResult,
  plan: RankedPlan,
  isPlanA: boolean,
  rejectedAlternatives: string[]
): RouteRecommendation {
  const candidate = plan.candidatePlan;
  const recommendationId = isPlanA
    ? result.recommendationId ?? candidate.recommendationId
    : candidate.recommendationId;

  return {
    id: recommendationId,
    workloadId: result.workloadId,
    workloadName: result.workloadName,
    ...(candidate.sourceGpuId ? { fromGpuId: candidate.sourceGpuId } : {}),
    ...(candidate.targetGpuId ? { targetGpuId: candidate.targetGpuId } : {}),
    targetClusterType: candidate.targetClusterType,
    priority: result.context.workloadPriority,
    reason: plan.explanation,
    safetyStatus: "safe",
    privacyStatus: "allowed",
    estimatedRiskReduction: estimatedRiskReduction(plan),
    estimatedLatencySeconds: round(candidate.latencyMs / 1000, 3),
    estimatedCostSaving: round(
      -plan.projection.after.expectedCostChangePercent
    ),
    action: legacyAction(candidate.action),
    requiresHumanApproval:
      isPlanA && plan.approvalRequirement.required,
    deadlineSeconds: candidate.deadlineSeconds,
    explanation: `${plan.planLabel}: ${result.explanation.decisionSupportDisclaimer}`,
    ...(isPlanA && rejectedAlternatives.length > 0
      ? { rejectedAlternatives }
      : {}),
  };
}

function blockedRecommendation(
  result: GuardRulerResult,
  evaluation: GuardEvaluation
): RouteRecommendation {
  const candidate = evaluation.candidatePlan;
  const reasons = evaluation.violations.map(
    (violation) => violation.reason
  );
  const reason =
    reasons.length > 0
      ? reasons.join(" ")
      : "Guard rules did not permit this alternative to be ranked.";

  return {
    id: candidate.recommendationId,
    workloadId: result.workloadId,
    workloadName: result.workloadName,
    ...(candidate.sourceGpuId ? { fromGpuId: candidate.sourceGpuId } : {}),
    ...(candidate.targetGpuId ? { targetGpuId: candidate.targetGpuId } : {}),
    targetClusterType: candidate.targetClusterType,
    priority: result.context.workloadPriority,
    reason,
    safetyStatus:
      evaluation.status === "manual-review-only" ? "warning" : "blocked",
    privacyStatus: hasPrivacyViolation(evaluation)
      ? "blocked"
      : "allowed",
    estimatedRiskReduction: 0,
    estimatedLatencySeconds: round(candidate.latencyMs / 1000, 3),
    estimatedCostSaving: round(-candidate.estimatedCostChangePercent),
    action: "manual_review",
    requiresHumanApproval: false,
    deadlineSeconds: candidate.deadlineSeconds,
    explanation: `${
      evaluation.status === "blocked"
        ? "Guard blocked this route"
        : "Guard requires manual review"
    }: ${blockedReasonLabel(evaluation)}. ${result.explanation.decisionSupportDisclaimer}`,
  };
}

function uniqueRecommendationIds(
  recommendations: RouteRecommendation[]
): RouteRecommendation[] {
  const usedIds = new Set<string>();

  return recommendations.map((recommendation, index) => {
    if (!usedIds.has(recommendation.id)) {
      usedIds.add(recommendation.id);
      return recommendation;
    }

    const uniqueId = `${recommendation.id}-alternative-${index + 1}`;
    usedIds.add(uniqueId);
    return { ...recommendation, id: uniqueId };
  });
}

/**
 * Compatibility adapter for the legacy Route Planner cards.
 *
 * Guard determines eligibility and Ruler determines order. This adapter never
 * recalculates safety or ranking, and it never mutates canonical state.
 */
export function generateRouteRecommendations(
  result: GuardRulerResult | null
): RouteRecommendation[] {
  if (result === null) return [];

  const rankedPlans = [
    result.planSet.planA,
    result.planSet.planB,
    result.planSet.planC,
  ].filter((plan): plan is RankedPlan => plan !== null);
  const rejectedAlternatives = [
    ...new Set(
      result.planSet.blockedAlternatives.map(rejectedAlternative)
    ),
  ];
  const safeRecommendations = rankedPlans.map((plan, index) =>
    safeRecommendation(
      result,
      plan,
      index === 0,
      rejectedAlternatives
    )
  );
  const blockedRecommendations =
    result.planSet.blockedAlternatives.map((evaluation) =>
      blockedRecommendation(result, evaluation)
    );

  return uniqueRecommendationIds([
    ...safeRecommendations,
    ...blockedRecommendations,
  ]);
}
