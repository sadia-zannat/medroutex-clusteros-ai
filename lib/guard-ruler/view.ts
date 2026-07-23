import type {
  GuardRulerStateApiResponse,
  OperationalTwinState,
} from "../twin-core/types";

export function createGuardRulerStateApiResponse(
  state: OperationalTwinState,
  outcome?: "applied" | "idempotent"
): GuardRulerStateApiResponse {
  const evaluation = state.latestGuardRulerEvaluation;
  if (!evaluation) {
    throw new Error(
      "The canonical Hospital Twin does not contain a Guard–Ruler evaluation."
    );
  }

  return {
    success: true,
    ...(outcome ? { outcome } : {}),
    evaluation,
    planA: evaluation.planSet.planA,
    planB: evaluation.planSet.planB,
    planC: evaluation.planSet.planC,
    blockedAlternatives: evaluation.planSet.blockedAlternatives,
    guardSummary: evaluation.guardSummary,
    rulerScoreBreakdown:
      evaluation.planSet.planA?.criterionScores ?? [],
    approvalRequirement: evaluation.approvalRequirement,
    decisionStatus: evaluation.decisionStatus,
    evaluationTimestamp: evaluation.evaluatedAt,
    evaluatedStateVersion: evaluation.evaluatedStateVersion,
    currentStateVersion: state.version,
    metadata: {
      phiMode: "PHI-Zero",
      decisionSupportOnly: true,
      whatIfSimulation: true,
      automaticExecution: false,
      canonicalSource: "MedRouteX Hospital/Operational Twin",
    },
  };
}

