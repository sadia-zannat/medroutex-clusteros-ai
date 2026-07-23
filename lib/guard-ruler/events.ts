import type {
  GuardEvaluation,
  GuardRulerResult,
  OperationalEvent,
  OperationalEventDomain,
} from "../twin-core/types";

function correlationId(result: GuardRulerResult): string {
  return `correlation-${result.id}`;
}

function violationDomain(
  evaluation: GuardEvaluation
): OperationalEventDomain {
  const code = evaluation.violations[0]?.code;
  if (
    code === "PRIVACY_POLICY_BLOCK" ||
    code === "PHI_ZERO_CLOUD_BLOCK"
  ) {
    return "privacy";
  }
  if (code === "POWER_DEPENDENCY_UNAVAILABLE") return "power";
  if (code === "NETWORK_DEPENDENCY_UNAVAILABLE") return "network";
  if (code === "ICU_CONTINUITY_UNAVAILABLE") return "icu";
  if (code === "OXYGEN_CONTINUITY_UNAVAILABLE") return "oxygen";
  return "compute";
}

function blockedCandidateEvent(
  result: GuardRulerResult,
  evaluation: GuardEvaluation
): OperationalEvent {
  const candidate = evaluation.candidatePlan;
  return {
    id: `event-${result.id}-blocked-${candidate.targetGpuEntityId ?? candidate.id}`,
    eventType: "guard-blocked",
    category: "guard-decision",
    domain: violationDomain(evaluation),
    severity: "warning",
    status: "blocked",
    title: `Guard Blocked ${candidate.targetLabel}`,
    message:
      `${candidate.targetLabel} was excluded from Ruler ranking by ` +
      `${evaluation.violations.length} hard Guard violation(s).`,
    reason:
      evaluation.violations[0]?.reason ??
      "The candidate did not satisfy the centralized hard constraints.",
    timestamp: result.evaluatedAt,
    sourceEntityIds: [
      result.workloadId,
      ...(candidate.targetGpuEntityId
        ? [candidate.targetGpuEntityId]
        : []),
    ],
    scenarioId: result.context.scenarioId ?? undefined,
    recommendationId: candidate.recommendationId,
    correlationId: correlationId(result),
    dedupeKey: `${result.evaluationKey}:guard-blocked:${candidate.id}`,
    simulationOnly: true,
    source: "MedRouteX Operational Twin",
    metadata: {
      notificationVisibility: "grouped-detail",
      evaluationId: result.id,
      evaluationKey: result.evaluationKey,
      candidatePlanId: candidate.id,
      targetLabel: candidate.targetLabel,
      targetGpuId: candidate.targetGpuId,
      targetGpuEntityId: candidate.targetGpuEntityId,
      violations: evaluation.violations,
      guardStatus: evaluation.status,
      eligibleForRanking: false,
    },
    stateVersion: result.evaluatedStateVersion,
  };
}

export function createGuardRulerEvents(
  result: GuardRulerResult
): OperationalEvent[] {
  const planA = result.planSet.planA;
  const common = {
    timestamp: result.evaluatedAt,
    sourceEntityIds: [result.workloadId],
    scenarioId: result.context.scenarioId ?? undefined,
    correlationId: correlationId(result),
    simulationOnly: true as const,
    source: "MedRouteX Operational Twin" as const,
    stateVersion: result.evaluatedStateVersion,
  };
  const events: OperationalEvent[] = [
    {
      ...common,
      id: `event-${result.id}-completed`,
      eventType: "guard-evaluation-completed",
      category: "guard-decision",
      domain: "simulation",
      severity:
        result.status === "no-safe-route" ? "warning" : "success",
      status:
        result.status === "no-safe-route" ? "blocked" : "completed",
      title: "Guard Evaluation Completed",
      message:
        `Guard evaluated ${result.guardSummary.evaluatedCandidateCount} ` +
        `candidate plan(s); ${result.guardSummary.eligibleCandidateCount} ` +
        "remain eligible for Ruler ranking.",
      reason:
        "The canonical Hospital Twin was evaluated against the centralized privacy, deadline, compute, priority, dependency, and approval rules.",
      recommendationId: result.activeRecommendationId ?? undefined,
      dedupeKey: `${result.evaluationKey}:guard-evaluation-completed`,
      metadata: {
        notificationVisibility: "history-only",
        evaluationId: result.id,
        evaluationKey: result.evaluationKey,
        evaluationProfile: result.evaluationProfile,
        evaluatedStateVersion: result.evaluatedStateVersion,
        guardSummary: result.guardSummary,
        noPhysicalExecution: true,
      },
    },
    ...result.planSet.blockedAlternatives.map((evaluation) =>
      blockedCandidateEvent(result, evaluation)
    ),
  ];

  if (planA) {
    events.push({
      ...common,
      id: `event-${result.id}-plan-set-ranked`,
      eventType: "plan-set-ranked",
      category: "plan",
      domain: "compute",
      severity: "success",
      status: "completed",
      title: "Guard-Eligible Plan Set Ranked",
      message:
        `${planA.candidatePlan.targetLabel} ranked as Plan A at ` +
        `${planA.totalScore}/100; blocked candidates were not scored.`,
      reason:
        "Ruler applied the locked 30/20/15/15/10/10 weights only after Guard eligibility.",
      recommendationId: planA.candidatePlan.recommendationId,
      dedupeKey: `${result.evaluationKey}:plan-set-ranked`,
      metadata: {
        notificationVisibility: "history-only",
        evaluationId: result.id,
        evaluationKey: result.evaluationKey,
        planA,
        planB: result.planSet.planB,
        planC: result.planSet.planC,
        planComparison: result.planSet.comparison,
        rulerCriteria: result.rulerCriteria,
        approvalRequirement: result.approvalRequirement,
        noAutomaticExecution: true,
      },
    });
    return events;
  }

  events.push(
    {
      ...common,
      id: `event-${result.id}-no-safe-route`,
      eventType: "no-safe-route",
      category: "guard-decision",
      domain: "simulation",
      severity: "action-required",
      status: "active",
      title: "No Safe Route Available",
      message:
        "Every candidate failed at least one hard Guard constraint; no target was recommended.",
      reason:
        "MedRouteX does not fabricate a recommendation when privacy, deadline, compute, or dependency safety cannot be satisfied.",
      dedupeKey: `${result.evaluationKey}:no-safe-route`,
      metadata: {
        notificationVisibility: "visible",
        notificationCooldownKey: `${result.evaluationKey}:no-safe-route`,
        evaluationId: result.id,
        evaluationKey: result.evaluationKey,
        manualReviewRequired: true,
        planA: null,
        blockedCandidateCount:
          result.guardSummary.blockedCandidateCount,
        noPhysicalExecution: true,
      },
    },
    {
      ...common,
      id: `event-${result.id}-manual-review-required`,
      eventType: "manual-review-required",
      category: "guard-decision",
      domain: "approval",
      severity: "action-required",
      status: "active",
      title: "Manual Review Required",
      message:
        "An authorized infrastructure team must review the blocked plan set; no approval target exists.",
      reason:
        "The no-safe-route state is a decision-support escalation, not an executable recommendation.",
      dedupeKey: `${result.evaluationKey}:manual-review-required`,
      metadata: {
        notificationVisibility: "grouped-detail",
        evaluationId: result.id,
        evaluationKey: result.evaluationKey,
        violations: result.planSet.blockedAlternatives.flatMap(
          (evaluation) => evaluation.violations
        ),
        approvalQueueTargetCreated: false,
        noAutomaticExecution: true,
      },
    }
  );
  return events;
}

