import type { GuardRulerResult } from "../twin-core/types";

export interface DigitalTwinResult {
  scenario: string;
  beforeHealth: number;
  afterHealth: number;
  beforeRiskyGpus: number;
  afterRiskyGpus: number;
  recommendedActions: number;
  blockedActions: number;
  estimatedDowntimeSavedMinutes: number;
  estimatedCostSaving: number;
  riskReductionPercent: number;
  safetySummary: string;
}

export interface DigitalTwinFallbackState {
  scenario: string;
  healthScore: number;
  riskyGpuCount: number;
}

function riskReductionPercent(
  beforeRiskyGpus: number,
  afterRiskyGpus: number
): number {
  if (beforeRiskyGpus <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        ((beforeRiskyGpus - afterRiskyGpus) / beforeRiskyGpus) *
          1000
      ) / 10
    )
  );
}

function neutralResult(
  fallback: DigitalTwinFallbackState,
  evaluation: GuardRulerResult | null
): DigitalTwinResult {
  const noSafeRoute = evaluation?.status === "no-safe-route";
  const blockedActions =
    evaluation?.planSet.blockedAlternatives.length ?? 0;

  return {
    scenario:
      evaluation?.context.scenarioId ?? fallback.scenario,
    beforeHealth: fallback.healthScore,
    afterHealth: fallback.healthScore,
    beforeRiskyGpus: fallback.riskyGpuCount,
    afterRiskyGpus: fallback.riskyGpuCount,
    recommendedActions: 0,
    blockedActions,
    estimatedDowntimeSavedMinutes: 0,
    estimatedCostSaving: 0,
    riskReductionPercent: 0,
    safetySummary: noSafeRoute
      ? "No safe route is available. Manual review is required. No recommendation, automatic action, or physical execution was produced."
      : "No Guard–Ruler evaluation is currently recorded. Infrastructure decision support only; no automatic action or physical execution is performed.",
  };
}

/**
 * Compatibility adapter for the legacy Digital Twin summary.
 *
 * The returned values are copied from Plan A's what-if projection. No
 * canonical telemetry, workload assignment, migration, or actuator is changed.
 */
export function simulateDigitalTwin(
  evaluation: GuardRulerResult | null,
  fallback: DigitalTwinFallbackState
): DigitalTwinResult {
  const planA = evaluation?.planSet.planA ?? null;
  if (evaluation === null || planA === null) {
    return neutralResult(fallback, evaluation);
  }

  const { before, after } = planA.projection;
  const blockedActions =
    evaluation.planSet.blockedAlternatives.length;
  const approvalCopy = planA.approvalRequirement.required
    ? " Human approval is required."
    : "";

  return {
    scenario:
      evaluation.context.scenarioId ?? fallback.scenario,
    beforeHealth: before.clusterHealthPercent,
    afterHealth: after.projectedClusterHealthPercent,
    beforeRiskyGpus: before.riskyGpuCount,
    afterRiskyGpus: after.projectedRiskyGpuCount,
    recommendedActions: evaluation.planSet.rankedPlans.length,
    blockedActions,
    estimatedDowntimeSavedMinutes:
      after.expectedDowntimeSavedMinutes,
    estimatedCostSaving: Math.round(
      -after.expectedCostChangePercent
    ),
    riskReductionPercent: riskReductionPercent(
      before.riskyGpuCount,
      after.projectedRiskyGpuCount
    ),
    safetySummary:
      `What-if decision support: ${planA.planLabel} projects cluster health from ${before.clusterHealthPercent}% to ${after.projectedClusterHealthPercent}% and risky GPUs from ${before.riskyGpuCount} to ${after.projectedRiskyGpuCount}.${approvalCopy} ${blockedActions} alternative(s) were blocked by Guard rules. No automatic action or physical execution is performed.`,
  };
}
