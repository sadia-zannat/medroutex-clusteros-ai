import type {
  CandidatePlan,
  CriterionScore,
  DecisionContext,
  HospitalOperationalStatus,
  RulerCriterion,
} from "../twin-core/types";

export const RULER_CRITERIA: readonly RulerCriterion[] = [
  {
    id: "deadline-fit",
    name: "Deadline fit",
    weightPercent: 30,
    description:
      "Rewards deterministic completion margin within the canonical workload deadline.",
  },
  {
    id: "infrastructure-health",
    name: "Infrastructure and GPU health",
    weightPercent: 20,
    description:
      "Combines target GPU health, target-cluster health, and only the relevant hospital dependencies.",
  },
  {
    id: "latency",
    name: "Latency",
    weightPercent: 15,
    description:
      "Rewards lower infrastructure network latency for the proposed target.",
  },
  {
    id: "privacy-safety",
    name: "Privacy safety",
    weightPercent: 15,
    description:
      "Rewards routes that satisfy the canonical PHI-Zero workload privacy policy.",
  },
  {
    id: "cost",
    name: "Cost",
    weightPercent: 10,
    description:
      "Scores the relative infrastructure cost of keeping or changing the route.",
  },
  {
    id: "model-reliability",
    name: "Model reliability",
    weightPercent: 10,
    description:
      "Expresses deterministic infrastructure evidence reliability, not clinical or diagnostic accuracy.",
  },
];

export const RULER_WEIGHT_TOTAL = RULER_CRITERIA.reduce(
  (total, criterion) => total + criterion.weightPercent,
  0
);

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function dependencyStatusScore(
  status: HospitalOperationalStatus
): number {
  if (status === "operational") return 100;
  if (status === "degraded") return 60;
  if (status === "critical") return 20;
  return 0;
}

function relevantDependencyScore(
  context: DecisionContext,
  candidate: CandidatePlan
): number {
  const scores: number[] = [];
  if (candidate.requiresPowerContinuity) {
    scores.push(
      dependencyStatusScore(
        context.dependencies.power.gpuDataCenterPowerStatus
      )
    );
  }
  if (candidate.requiresNetworkContinuity) {
    const status =
      candidate.targetClusterType === "local"
        ? context.dependencies.network.localLinkStatus
        : candidate.targetClusterType === "cloud"
          ? context.dependencies.network.cloudLinkStatus
          : context.dependencies.network.centralLinkStatus;
    scores.push(dependencyStatusScore(status));
  }
  if (candidate.requiresIcuContinuity) {
    scores.push(
      dependencyStatusScore(
        context.dependencies.icu.operationalStatus
      )
    );
  }
  if (candidate.requiresOxygenContinuity) {
    scores.push(
      dependencyStatusScore(
        context.dependencies.oxygen.operationalStatus
      )
    );
  }
  if (scores.length === 0) return 100;
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function criterionResult(
  criterion: RulerCriterion,
  normalizedScore: number,
  rawEvidence: CriterionScore["rawEvidence"],
  explanation: string
): CriterionScore {
  const score = round(clampScore(normalizedScore));
  return {
    criterionId: criterion.id,
    criterionName: criterion.name,
    normalizedScore: score,
    weightPercent: criterion.weightPercent,
    weightedContribution: round(
      (score * criterion.weightPercent) / 100,
      2
    ),
    rawEvidence,
    explanation,
  };
}

function scoreCriterion(
  criterion: RulerCriterion,
  context: DecisionContext,
  candidate: CandidatePlan
): CriterionScore {
  switch (criterion.id) {
    case "deadline-fit": {
      const marginRatio =
        candidate.deadlineSeconds <= 0
          ? 0
          : candidate.deadlineMarginSeconds /
            candidate.deadlineSeconds;
      const score =
        candidate.deadlineMarginSeconds < 0
          ? 0
          : 60 + clampScore(marginRatio * 100) * 0.4;
      return criterionResult(
        criterion,
        score,
        {
          estimatedCompletionSeconds:
            candidate.predictedCompletionSeconds,
          deadlineSeconds: candidate.deadlineSeconds,
          deadlineMarginSeconds: candidate.deadlineMarginSeconds,
        },
        `${candidate.predictedCompletionSeconds}s completion leaves a ${candidate.deadlineMarginSeconds}s deadline margin.`
      );
    }
    case "infrastructure-health": {
      const dependencyScore = relevantDependencyScore(
        context,
        candidate
      );
      const score =
        candidate.targetHealthPercent * 0.6 +
        candidate.targetClusterHealthPercent * 0.25 +
        dependencyScore * 0.15;
      return criterionResult(
        criterion,
        score,
        {
          targetGpuHealthPercent:
            candidate.targetHealthPercent,
          targetClusterHealthPercent:
            candidate.targetClusterHealthPercent,
          relevantDependencyScore: round(dependencyScore),
          criterionComposition:
            "60% target GPU + 25% target cluster + 15% relevant dependencies",
        },
        "Hospital-aware health is calculated inside the locked 20% infrastructure criterion."
      );
    }
    case "latency": {
      const score = 100 - candidate.latencyMs * 0.5;
      return criterionResult(
        criterion,
        score,
        {
          latencyMs: candidate.latencyMs,
          targetClusterType: candidate.targetClusterType,
        },
        `${candidate.targetLabel} uses a deterministic ${candidate.latencyMs} ms infrastructure path estimate.`
      );
    }
    case "privacy-safety": {
      const privacyCompatible =
        candidate.evidence.privacyCompatible === true;
      return criterionResult(
        criterion,
        privacyCompatible ? 100 : 0,
        {
          privacyPolicy: context.privacyPolicy,
          targetClusterType: candidate.targetClusterType,
          privacyCompatible,
          phiMode: "PHI-Zero",
        },
        privacyCompatible
          ? "The target satisfies the canonical PHI-Zero routing policy."
          : "The target is not privacy compatible and should have been blocked by Guard."
      );
    }
    case "cost": {
      const score =
        candidate.action === "keep"
          ? 100
          : 75 - candidate.estimatedCostChangePercent;
      return criterionResult(
        criterion,
        score,
        {
          action: candidate.action,
          targetClusterType: candidate.targetClusterType,
          estimatedCostChangePercent:
            candidate.estimatedCostChangePercent,
        },
        candidate.action === "keep"
          ? "Keeping the canonical assignment has no projected routing cost change."
          : `The deterministic projection estimates a ${candidate.estimatedCostChangePercent}% cost change; lower projected cost receives the higher score. This does not trigger spending.`
      );
    }
    case "model-reliability": {
      const riskSafety =
        100 - candidate.predictedTargetRiskPercent;
      const evidenceReliability =
        candidate.telemetryConfidence * 100;
      const score =
        riskSafety * 0.4 +
        candidate.targetHealthPercent * 0.25 +
        candidate.targetClusterHealthPercent * 0.15 +
        evidenceReliability * 0.2;
      return criterionResult(
        criterion,
        score,
        {
          predictedTargetRiskPercent:
            candidate.predictedTargetRiskPercent,
          targetGpuHealthPercent:
            candidate.targetHealthPercent,
          targetClusterHealthPercent:
            candidate.targetClusterHealthPercent,
          telemetryConfidence:
            candidate.telemetryConfidence,
          clinicalAccuracyClaim: false,
        },
        "Reliability reflects infrastructure telemetry and route stability only; it is not model or clinical accuracy."
      );
    }
  }
}

export function scoreCandidatePlan(
  context: DecisionContext,
  candidate: CandidatePlan
): CriterionScore[] {
  if (RULER_WEIGHT_TOTAL !== 100) {
    throw new Error(
      `Ruler weights must total 100%; received ${RULER_WEIGHT_TOTAL}%.`
    );
  }
  return RULER_CRITERIA.map((criterion) =>
    scoreCriterion(criterion, context, candidate)
  );
}
