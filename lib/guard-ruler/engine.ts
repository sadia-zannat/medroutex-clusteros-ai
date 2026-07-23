import type {
  ApprovalRequirement,
  CandidatePlan,
  CriterionScore,
  DecisionContext,
  DecisionEvaluationProfile,
  DecisionStatus,
  GuardEvaluation,
  GuardRulerResult,
  GuardSummary,
  OperationalTwinState,
  PlanComparison,
  PlanProjection,
  RankedPlan,
  RiskInterpretation,
  TelemetryValue,
  TimeToFailureBand,
  TwinEntity,
} from "../twin-core/types";
import type {
  PrivacyPolicy,
  WorkloadPriority,
} from "../medroutex/types";
import {
  approvalRequirementFor,
  GUARD_RULES,
} from "./guard-rules";
import {
  canonicalGpuEntityId,
  clusterTypeForGpuEntity,
  compatibilityGpuIdForEntity,
  displayLabelForGpuEntity,
} from "./gpu-mapping";
import {
  RULER_CRITERIA,
  scoreCandidatePlan,
} from "./ruler";

const DEFAULT_WORKLOAD_ID = "workload-stroke-ct-001";
const CRISIS_SCENARIO_ID = "medroutex-stroke-crisis";
const CRISIS_RECOMMENDATION_ID = "rec-workload-stroke-ct-001-0";
const CRISIS_TARGET_ENTITY_ID = "compute-central-gpu-07";
const DEFAULT_MEMORY_REQUIRED_MIB = 4096;
const DEFAULT_COMPUTE_REQUIRED_PERCENT = 20;

export interface GuardRulerEvaluationOptions {
  workloadId?: string;
  recommendationId?: string;
  evaluationProfile?: DecisionEvaluationProfile;
  evaluatedAt?: string;
}

export type GuardRulerEvaluationErrorCode =
  | "WORKLOAD_NOT_FOUND"
  | "RECOMMENDATION_MISMATCH"
  | "ACTIVE_DECISION_MISMATCH"
  | "TEST_PROFILE_REQUIRES_CRISIS";

export class GuardRulerEvaluationError extends Error {
  constructor(
    public readonly code: GuardRulerEvaluationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GuardRulerEvaluationError";
  }
}

function numberAttribute(
  entity: TwinEntity,
  key: string,
  fallback: number
): number {
  const value: TelemetryValue | undefined = entity.attributes[key];
  return typeof value === "number" ? value : fallback;
}

function stringAttribute(
  entity: TwinEntity,
  key: string
): string | null {
  const value: TelemetryValue | undefined = entity.attributes[key];
  return typeof value === "string" ? value : null;
}

function workloadPriority(entity: TwinEntity): WorkloadPriority {
  const value = stringAttribute(entity, "priority");
  if (
    value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "research"
  ) {
    return value;
  }
  return "medium";
}

function privacyPolicy(entity: TwinEntity): PrivacyPolicy {
  const value = stringAttribute(entity, "privacyPolicy");
  if (
    value === "on-prem-only" ||
    value === "edge-allowed" ||
    value === "central-allowed" ||
    value === "cloud-allowed"
  ) {
    return value;
  }
  return "on-prem-only";
}

function privacyCompatible(
  policy: PrivacyPolicy,
  targetClusterType: CandidatePlan["targetClusterType"]
): boolean {
  if (policy === "cloud-allowed") return true;
  if (policy === "on-prem-only") return targetClusterType === "local";
  return (
    targetClusterType === "local" ||
    targetClusterType === "central"
  );
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function clusterHealthPercent(
  state: OperationalTwinState,
  target: TwinEntity
): number {
  const clusterType = clusterTypeForGpuEntity(target.id);
  const clusterGpus = state.entities.filter(
    (entity) =>
      entity.entityType === "compute-node" &&
      clusterTypeForGpuEntity(entity.id) === clusterType
  );
  if (clusterGpus.length === 0) return target.healthScore;
  return round(
    clusterGpus.reduce(
      (total, entity) => total + entity.healthScore,
      0
    ) / clusterGpus.length
  );
}

function targetTelemetry(
  state: OperationalTwinState,
  target: TwinEntity
): {
  trusted: boolean;
  confidence: number;
  providers: string[];
  qualities: string[];
} {
  const points = state.latestTelemetry.filter(
    (point) => point.entityId === target.id
  );
  const confidence =
    points.length === 0
      ? 0
      : Math.min(...points.map((point) => point.confidence));
  const trusted =
    points.length > 0 &&
    !target.isStale &&
    points.every(
      (point) =>
        !point.isStale &&
        point.quality !== "stale" &&
        point.quality !== "offline" &&
        point.quality !== "unknown" &&
        point.confidence >= 0.8
    );

  return {
    trusted,
    confidence: round(confidence, 2),
    providers: [...new Set(points.map((point) => point.provider))],
    qualities: [...new Set(points.map((point) => point.quality))],
  };
}

function predictedRiskPercent(target: TwinEntity): number {
  const temperatureC = numberAttribute(target, "temperatureC", 0);
  const utilizationPercent = numberAttribute(
    target,
    "utilizationPercent",
    0
  );
  const memoryUsedMiB = numberAttribute(
    target,
    "memoryUsedMiB",
    0
  );
  const memoryTotalMiB = numberAttribute(
    target,
    "memoryTotalMiB",
    1
  );
  const memoryPressurePercent =
    (memoryUsedMiB / Math.max(1, memoryTotalMiB)) * 100;

  let risk = target.riskScore;
  if (target.status === "critical") risk = Math.max(risk, 85);
  if (target.status === "offline") risk = 100;
  if (temperatureC >= 90) risk = Math.max(risk, 98);
  if (memoryPressurePercent >= 95) risk = Math.max(risk, 92);
  if (utilizationPercent >= 95) risk = Math.max(risk, 88);
  return round(clamp(risk, 0, 100));
}

function networkLatencyMs(
  state: OperationalTwinState,
  target: TwinEntity
): number {
  const clusterType = clusterTypeForGpuEntity(target.id);
  const linkId =
    clusterType === "local"
      ? "network-local-link-01"
      : clusterType === "cloud"
        ? "network-cloud-link-01"
        : "network-central-link-01";
  const link = state.entities.find((entity) => entity.id === linkId);
  if (!link) {
    return clusterType === "local"
      ? 4
      : clusterType === "cloud"
        ? 52
        : state.domains.network.centralLatencyMs;
  }
  return numberAttribute(
    link,
    "latencyMs",
    clusterType === "local" ? 4 : clusterType === "cloud" ? 52 : 38
  );
}

function sourceGpuEntityId(
  _state: OperationalTwinState,
  workload: TwinEntity
): string | null {
  const assignedGpuId = stringAttribute(workload, "assignedGpuId");
  if (assignedGpuId) {
    const canonicalId = canonicalGpuEntityId(assignedGpuId);
    if (canonicalId) return canonicalId;
  }
  return null;
}

function estimatedCompletionSeconds(input: {
  action: CandidatePlan["action"];
  sourceGpuEntityId: string | null;
  target: TwinEntity;
  targetClusterHealthPercent: number;
  predictedRiskPercent: number;
  latencyMs: number;
}): number {
  const utilizationPercent = numberAttribute(
    input.target,
    "utilizationPercent",
    0
  );
  const memoryUsedMiB = numberAttribute(
    input.target,
    "memoryUsedMiB",
    0
  );
  const memoryTotalMiB = numberAttribute(
    input.target,
    "memoryTotalMiB",
    1
  );
  const memoryPressure =
    memoryUsedMiB / Math.max(1, memoryTotalMiB);
  const setupSeconds = input.action === "keep" ? 38 : 52;
  const transportSeconds =
    input.latencyMs <= 5 ? 4 : input.latencyMs <= 40 ? 10 : 24;
  const clusterContentionSeconds =
    input.action === "migrate" &&
    input.predictedRiskPercent <= 80 &&
    input.targetClusterHealthPercent < 75
      ? 15
      : 0;

  return Math.round(
    setupSeconds +
      transportSeconds +
      utilizationPercent * 0.35 +
      memoryPressure * 18 +
      input.predictedRiskPercent * 0.15 +
      clusterContentionSeconds
  );
}

function recommendationId(
  state: OperationalTwinState,
  workloadId: string,
  targetEntityId: string
): string {
  if (
    state.activeSimulation?.scenarioId === CRISIS_SCENARIO_ID &&
    targetEntityId === CRISIS_TARGET_ENTITY_ID
  ) {
    return state.activeSimulation.recommendationId;
  }

  const targetGpuId =
    compatibilityGpuIdForEntity(targetEntityId) ?? targetEntityId;
  return `guard-rec-${workloadId}-v${state.version}-${targetGpuId}`;
}

function estimatedCostChangePercent(
  action: CandidatePlan["action"],
  clusterType: CandidatePlan["targetClusterType"]
): number {
  if (action === "keep") return 0;
  if (clusterType === "local") return -5;
  if (clusterType === "central") return -15;
  return 20;
}

function createCandidatePlans(
  state: OperationalTwinState,
  context: DecisionContext
): CandidatePlan[] {
  const gpuEntities = state.entities.filter(
    (entity) => entity.entityType === "compute-node"
  );
  const candidateTargets =
    context.evaluationProfile === "no-safe-route-test"
      ? gpuEntities.filter((entity) =>
          [
            "compute-local-gpu-02",
            "compute-local-gpu-03",
            "compute-cloud-gpu-09",
            "compute-cloud-gpu-10",
          ].includes(entity.id)
        )
      : gpuEntities;

  return candidateTargets.map((target): CandidatePlan => {
    const targetClusterType = clusterTypeForGpuEntity(target.id);
    const targetGpuId = compatibilityGpuIdForEntity(target.id);
    const action: CandidatePlan["action"] =
      target.id === context.sourceGpuEntityId ? "keep" : "migrate";
    const targetClusterHealth = clusterHealthPercent(state, target);
    const telemetry = targetTelemetry(state, target);
    const riskPercent = predictedRiskPercent(target);
    const latencyMs = networkLatencyMs(state, target);
    const completionSeconds = estimatedCompletionSeconds({
      action,
      sourceGpuEntityId: context.sourceGpuEntityId,
      target,
      targetClusterHealthPercent: targetClusterHealth,
      predictedRiskPercent: riskPercent,
      latencyMs,
    });
    const memoryUsedMiB = numberAttribute(
      target,
      "memoryUsedMiB",
      0
    );
    const memoryTotalMiB = numberAttribute(
      target,
      "memoryTotalMiB",
      0
    );
    const targetLabel = displayLabelForGpuEntity(target.id);
    const policyCompatible = privacyCompatible(
      context.privacyPolicy,
      targetClusterType
    );
    const requiresIcuContinuity =
      context.workload.attributes.requiresIcuContinuity === true;
    const requiresOxygenContinuity =
      context.workload.attributes.requiresOxygenContinuity === true;
    const id = `${context.evaluationKey}:candidate:${target.id}`;

    return {
      id,
      recommendationId: recommendationId(
        state,
        context.workload.id,
        target.id
      ),
      workloadId: context.workload.id,
      action,
      sourceGpuEntityId: context.sourceGpuEntityId,
      sourceGpuId: context.sourceGpuId,
      targetGpuEntityId: target.id,
      targetGpuId,
      targetLabel,
      targetClusterType,
      predictedCompletionSeconds: completionSeconds,
      deadlineSeconds: context.deadlineSeconds,
      deadlineMarginSeconds:
        context.deadlineSeconds - completionSeconds,
      predictedTargetRiskPercent: riskPercent,
      targetHealthPercent: target.healthScore,
      targetClusterHealthPercent: targetClusterHealth,
      targetUtilizationPercent: numberAttribute(
        target,
        "utilizationPercent",
        0
      ),
      targetMemoryUsedMiB: memoryUsedMiB,
      targetMemoryTotalMiB: memoryTotalMiB,
      memoryRequiredMiB: context.memoryRequiredMiB,
      latencyMs,
      estimatedCostChangePercent:
        estimatedCostChangePercent(action, targetClusterType),
      telemetryTrusted: telemetry.trusted,
      telemetryConfidence: telemetry.confidence,
      manualReviewOnly: target.tags.includes("manual-review-only"),
      lowerPriorityDelayPermitted:
        context.workloadPriority === "low" ||
        context.workloadPriority === "research",
      degradedModePermitted:
        context.workloadPriority !== "critical",
      requiresPowerContinuity: true,
      requiresNetworkContinuity: true,
      requiresIcuContinuity,
      requiresOxygenContinuity,
      evidence: {
        targetStatus: target.status,
        temperatureC: numberAttribute(
          target,
          "temperatureC",
          0
        ),
        utilizationPercent: numberAttribute(
          target,
          "utilizationPercent",
          0
        ),
        memoryUsedMiB,
        memoryTotalMiB,
        computeRequiredPercent:
          context.computeRequiredPercent,
        privacyCompatible: policyCompatible,
        telemetryProviders: telemetry.providers,
        telemetryQualities: telemetry.qualities,
        policyManualOnly:
          target.tags.includes("manual-review-only"),
        affectsCriticalInfrastructure: false,
        noDiagnosisOrTreatmentDecision: true,
      },
    };
  });
}

function buildDecisionContext(
  state: OperationalTwinState,
  options: GuardRulerEvaluationOptions
): DecisionContext {
  const profile = options.evaluationProfile ?? "canonical";
  if (
    profile === "no-safe-route-test" &&
    (state.activeSimulation?.scenarioId !== CRISIS_SCENARIO_ID ||
      state.activeSimulation.status !== "awaiting-approval")
  ) {
    throw new GuardRulerEvaluationError(
      "TEST_PROFILE_REQUIRES_CRISIS",
      "The deterministic no-safe-route test profile requires the existing Stroke Crisis to be awaiting approval."
    );
  }

  const workloadId = options.workloadId ?? DEFAULT_WORKLOAD_ID;
  if (state.activeSimulation !== null) {
    const activeDecisionWorkloadId =
      state.latestGuardRulerEvaluation?.workloadId ??
      DEFAULT_WORKLOAD_ID;
    if (workloadId !== activeDecisionWorkloadId) {
      throw new GuardRulerEvaluationError(
        "ACTIVE_DECISION_MISMATCH",
        `Canonical workload "${workloadId}" is not the workload associated with the active decision.`
      );
    }
    if (
      options.recommendationId !== undefined &&
      options.recommendationId !==
        state.activeSimulation.recommendationId
    ) {
      throw new GuardRulerEvaluationError(
        "RECOMMENDATION_MISMATCH",
        "The requested recommendation does not match the canonical active recommendation."
      );
    }
  }

  const workload = state.entities.find(
    (entity) =>
      entity.id === workloadId && entity.entityType === "workload"
  );
  if (!workload) {
    throw new GuardRulerEvaluationError(
      "WORKLOAD_NOT_FOUND",
      `Canonical workload "${workloadId}" was not found.`
    );
  }

  if (
    options.recommendationId &&
    state.activeSimulation?.recommendationId !==
      options.recommendationId &&
    state.latestGuardRulerEvaluation?.activeRecommendationId !==
      options.recommendationId
  ) {
    throw new GuardRulerEvaluationError(
      "RECOMMENDATION_MISMATCH",
      "The requested recommendation does not match the canonical active recommendation."
    );
  }
  if (
    options.recommendationId &&
    state.latestGuardRulerEvaluation?.activeRecommendationId ===
      options.recommendationId &&
    state.latestGuardRulerEvaluation.workloadId !== workloadId
  ) {
    throw new GuardRulerEvaluationError(
      "RECOMMENDATION_MISMATCH",
      "The requested workload and recommendation are not associated with the same canonical decision."
    );
  }

  const sourceEntityId = sourceGpuEntityId(state, workload);
  const evaluationKey =
    `guard-ruler:${state.twinId}:v${state.version}:` +
    `${workload.id}:${profile}`;

  return {
    evaluationKey,
    evaluationProfile: profile,
    evaluatedStateVersion: state.version,
    scenarioId: state.activeSimulation?.scenarioId ?? null,
    workload: {
      id: workload.id,
      name: workload.name,
      entityType: workload.entityType,
      attributes: { ...workload.attributes },
      tags: [...workload.tags],
    },
    workloadPriority: workloadPriority(workload),
    privacyPolicy: privacyPolicy(workload),
    deadlineSeconds: numberAttribute(
      workload,
      "deadlineSeconds",
      300
    ),
    memoryRequiredMiB: numberAttribute(
      workload,
      "memoryRequiredMiB",
      DEFAULT_MEMORY_REQUIRED_MIB
    ),
    computeRequiredPercent: numberAttribute(
      workload,
      "computeRequiredPercent",
      DEFAULT_COMPUTE_REQUIRED_PERCENT
    ),
    sourceGpuEntityId: sourceEntityId,
    sourceGpuId: sourceEntityId
      ? compatibilityGpuIdForEntity(sourceEntityId)
      : null,
    dependencies: state.domains,
    telemetrySource: "canonical-hospital-twin",
    telemetryTrustPolicy:
      "Use canonical quality, explicit staleness, and confidence >= 0.80; deterministic baseline timestamps are not aged against wall-clock time.",
    decisionBoundary:
      "PHI-Zero infrastructure decision support only. No diagnosis, treatment recommendation, patient identity, or physical actuator execution.",
  };
}

function guardEvaluation(
  context: DecisionContext,
  candidate: CandidatePlan
): GuardEvaluation {
  const violations = GUARD_RULES.flatMap((rule) =>
    rule.effect === "block"
      ? rule.evaluate(context, candidate)
      : []
  );
  const evaluatedRuleIds = GUARD_RULES.map((rule) => rule.id);
  const failedRuleIds = new Set(
    violations.map((candidateViolation) => candidateViolation.ruleId)
  );
  const passedRuleIds = evaluatedRuleIds.filter(
    (ruleId) => !failedRuleIds.has(ruleId)
  );
  const hasBlockingViolation = violations.some(
    (candidateViolation) =>
      candidateViolation.severity === "blocked"
  );
  const manualReviewOnly = violations.some(
    (candidateViolation) =>
      candidateViolation.severity === "manual-review-only"
  );
  const status =
    violations.length === 0
      ? "eligible"
      : hasBlockingViolation
        ? "blocked"
        : manualReviewOnly
          ? "manual-review-only"
          : "blocked";

  return {
    candidatePlan: candidate,
    status,
    eligibleForRanking: status === "eligible",
    evaluatedRuleIds,
    passedRuleIds,
    violations,
    approvalRequirement: approvalRequirementFor(
      context,
      candidate
    ),
  };
}

function sourceGpu(
  state: OperationalTwinState,
  context: DecisionContext
): TwinEntity | null {
  if (!context.sourceGpuEntityId) return null;
  return (
    state.entities.find(
      (entity) => entity.id === context.sourceGpuEntityId
    ) ?? null
  );
}

function workloadSlaRisk(
  state: OperationalTwinState,
  context: DecisionContext
): PlanProjection["before"]["workloadSlaRisk"] {
  const source = sourceGpu(state, context);
  if (!source) return "unknown";
  const temperatureC = numberAttribute(source, "temperatureC", 0);
  const memoryUsedMiB = numberAttribute(
    source,
    "memoryUsedMiB",
    0
  );
  const memoryTotalMiB = numberAttribute(
    source,
    "memoryTotalMiB",
    1
  );
  const memoryPressure =
    (memoryUsedMiB / Math.max(1, memoryTotalMiB)) * 100;
  if (
    source.status === "critical" ||
    temperatureC >= 90 ||
    memoryPressure >= 95
  ) {
    return "critical";
  }
  if (source.riskScore > 50) return "high";
  if (source.riskScore > 25) return "moderate";
  return "low";
}

function planProjection(
  state: OperationalTwinState,
  context: DecisionContext,
  candidate: CandidatePlan,
  confidence: number
): PlanProjection {
  const source = sourceGpu(state, context);
  const isStrokeGpu7Plan =
    context.scenarioId === CRISIS_SCENARIO_ID &&
    candidate.targetGpuEntityId === CRISIS_TARGET_ENTITY_ID;
  const projectedClusterHealth = isStrokeGpu7Plan
    ? 98
    : candidate.action === "keep"
      ? state.overallHealthScore
      : Math.min(
          97,
          Math.round(
            state.overallHealthScore +
              Math.max(
                0,
                candidate.targetHealthPercent -
                  (source?.healthScore ?? state.overallHealthScore)
              ) *
                0.25
          )
        );
  const projectedRiskyGpuCount = isStrokeGpu7Plan
    ? 0
    : candidate.action === "keep"
      ? state.domains.compute.riskyGpus
      : Math.max(0, state.domains.compute.riskyGpus - 1);
  const remainingRisks = [
    "What-if projection only; canonical telemetry and physical infrastructure remain unchanged.",
  ];
  if (context.scenarioId === CRISIS_SCENARIO_ID) {
    remainingRisks.push(
      "GPU-2 overheating and GPU-3 memory pressure still require infrastructure review."
    );
  }
  return {
    before: {
      workloadLocation: context.sourceGpuId,
      workloadSlaRisk: workloadSlaRisk(state, context),
      sourceGpuHealthPercent: source?.healthScore ?? null,
      targetGpuHealthPercent: candidate.targetHealthPercent,
      clusterHealthPercent: state.overallHealthScore,
      riskyGpuCount: state.domains.compute.riskyGpus,
      dependencies: {
        power: state.domains.power.gpuDataCenterPowerStatus,
        network:
          candidate.targetClusterType === "local"
            ? state.domains.network.localLinkStatus
            : candidate.targetClusterType === "cloud"
              ? state.domains.network.cloudLinkStatus
              : state.domains.network.centralLinkStatus,
        icu: candidate.requiresIcuContinuity
          ? state.domains.icu.operationalStatus
          : "not-relevant",
        oxygen: candidate.requiresOxygenContinuity
          ? state.domains.oxygen.operationalStatus
          : "not-relevant",
      },
    },
    after: {
      projectedWorkloadLocation: candidate.targetGpuId,
      projectedCompletionSeconds:
        candidate.predictedCompletionSeconds,
      projectedClusterHealthPercent: projectedClusterHealth,
      projectedRiskyGpuCount,
      expectedDowntimeSavedMinutes: isStrokeGpu7Plan ? 5 : 0,
      expectedCostChangePercent:
        candidate.estimatedCostChangePercent,
      remainingRisks,
      confidence,
    },
    whatIfOnly: true,
    canonicalTelemetryMutated: false,
  };
}

function totalScore(scores: readonly CriterionScore[]): number {
  return round(
    scores.reduce(
      (total, score) => total + score.weightedContribution,
      0
    ),
    2
  );
}

function planConfidence(
  candidate: CandidatePlan,
  score: number
): number {
  const deadlineConfidence =
    candidate.deadlineMarginSeconds >= 0 ? 1 : 0;
  return round(
    clamp(
      candidate.telemetryConfidence * 0.55 +
        (score / 100) * 0.35 +
        deadlineConfidence * 0.1,
      0,
      1
    ),
    2
  );
}

function rankedPlans(
  state: OperationalTwinState,
  context: DecisionContext,
  evaluations: readonly GuardEvaluation[]
): RankedPlan[] {
  const preliminary = evaluations
    .filter((evaluation) => evaluation.eligibleForRanking)
    .map((evaluation) => {
      const criterionScores = scoreCandidatePlan(
        context,
        evaluation.candidatePlan
      );
      const score = totalScore(criterionScores);
      const confidence = planConfidence(
        evaluation.candidatePlan,
        score
      );
      return {
        evaluation,
        criterionScores,
        score,
        confidence,
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      if (left.confidence !== right.confidence) {
        return right.confidence - left.confidence;
      }
      if (
        left.evaluation.candidatePlan.targetHealthPercent !==
        right.evaluation.candidatePlan.targetHealthPercent
      ) {
        return (
          right.evaluation.candidatePlan.targetHealthPercent -
          left.evaluation.candidatePlan.targetHealthPercent
        );
      }
      return left.evaluation.candidatePlan.id.localeCompare(
        right.evaluation.candidatePlan.id
      );
    });

  return preliminary.map((item, index): RankedPlan => {
    const planLabel =
      index === 0
        ? "Plan A"
        : index === 1
          ? "Plan B"
          : index === 2
            ? "Plan C"
            : "Safe Alternative";
    return {
      rank: index + 1,
      planLabel,
      candidatePlan: item.evaluation.candidatePlan,
      criterionScores: item.criterionScores,
      totalScore: item.score,
      confidence: item.confidence,
      projection: planProjection(
        state,
        context,
        item.evaluation.candidatePlan,
        item.confidence
      ),
      approvalRequirement:
        item.evaluation.approvalRequirement,
      explanation:
        `${planLabel} passed every blocking Guard rule and received ` +
        `${item.score}/100 from the locked Ruler weights.`,
    };
  });
}

function planComparison(
  plans: readonly RankedPlan[]
): PlanComparison {
  const winner = plans[0] ?? null;
  return {
    winnerPlanId: winner?.candidatePlan.id ?? null,
    comparedPlanIds: plans.map(
      (plan) => plan.candidatePlan.id
    ),
    scoreDeltasFromWinner: plans.map((plan) => ({
      planId: plan.candidatePlan.id,
      scoreDelta: winner
        ? round(winner.totalScore - plan.totalScore, 2)
        : 0,
    })),
    summary: winner
      ? `${winner.planLabel} (${winner.candidatePlan.targetLabel}) is the highest-ranked Guard-eligible route.`
      : "No candidate passed every blocking Guard rule; no recommendation was fabricated.",
  };
}

function guardSummary(
  evaluations: readonly GuardEvaluation[]
): GuardSummary {
  const eligibleCandidateCount = evaluations.filter(
    (evaluation) => evaluation.status === "eligible"
  ).length;
  const manualReviewOnlyCandidateCount = evaluations.filter(
    (evaluation) => evaluation.status === "manual-review-only"
  ).length;
  const reasons = [
    ...new Set(
      evaluations.flatMap((evaluation) =>
        evaluation.violations.map(
          (candidateViolation) => candidateViolation.reason
        )
      )
    ),
  ];
  return {
    evaluatedCandidateCount: evaluations.length,
    eligibleCandidateCount,
    blockedCandidateCount: evaluations.length - eligibleCandidateCount,
    manualReviewOnlyCandidateCount,
    status:
      eligibleCandidateCount > 0 ? "passed" : "no-safe-route",
    reasons,
  };
}

export function interpretTimeToFailureBand(
  predictedTimeToFailureSeconds: number | null
): TimeToFailureBand {
  if (
    predictedTimeToFailureSeconds === null ||
    !Number.isFinite(predictedTimeToFailureSeconds) ||
    predictedTimeToFailureSeconds < 0
  ) {
    return "unknown";
  }
  if (predictedTimeToFailureSeconds <= 120) return "immediate";
  if (predictedTimeToFailureSeconds < 300) {
    return "under-5-minutes";
  }
  if (predictedTimeToFailureSeconds <= 1_800) {
    return "5-30-minutes";
  }
  if (predictedTimeToFailureSeconds <= 7_200) {
    return "30-120-minutes";
  }
  return "over-120-minutes";
}

function riskInterpretations(
  state: OperationalTwinState,
  context: DecisionContext
): RiskInterpretation[] {
  return state.entities.flatMap((entity): RiskInterpretation[] => {
    if (entity.entityType !== "compute-node") return [];
    const temperatureC = numberAttribute(
      entity,
      "temperatureC",
      0
    );
    const memoryUsedMiB = numberAttribute(
      entity,
      "memoryUsedMiB",
      0
    );
    const memoryTotalMiB = numberAttribute(
      entity,
      "memoryTotalMiB",
      1
    );
    const memoryPressurePercent = round(
      (memoryUsedMiB / Math.max(1, memoryTotalMiB)) * 100
    );
    const telemetry = targetTelemetry(state, entity);
    const affectedWorkloadIds = state.entities
      .filter(
        (candidateEntity) =>
          candidateEntity.entityType === "workload" &&
          sourceGpuEntityId(state, candidateEntity) === entity.id
      )
      .map((candidateEntity) => candidateEntity.id);
    const affectedEntityIds = [
      entity.id,
      ...affectedWorkloadIds,
    ];

    if (temperatureC >= 90) {
      return [
        {
          id: `${context.evaluationKey}:risk:${entity.id}:temperature`,
          sourceEntityId: entity.id,
          predictedTimeToFailureSeconds: 90,
          timeToFailureBand: interpretTimeToFailureBand(90),
          dependencyCascadePath: affectedEntityIds,
          affectedEntityIds,
          confidence: telemetry.confidence,
          evidence: [
            `${displayLabelForGpuEntity(entity.id)} temperature is ${temperatureC}°C in synthetic compute telemetry.`,
            "The signal indicates urgent compute continuity risk only; it is not a medical prediction.",
          ],
          boundary:
            "Deterministic infrastructure risk interpretation; not a machine-learning accuracy or hospital-safety certification claim.",
        },
      ];
    }

    if (memoryPressurePercent >= 95) {
      return [
        {
          id: `${context.evaluationKey}:risk:${entity.id}:memory`,
          sourceEntityId: entity.id,
          predictedTimeToFailureSeconds: 240,
          timeToFailureBand: interpretTimeToFailureBand(240),
          dependencyCascadePath: affectedEntityIds,
          affectedEntityIds,
          confidence: telemetry.confidence,
          evidence: [
            `${displayLabelForGpuEntity(entity.id)} memory is ${memoryUsedMiB}/${memoryTotalMiB} MiB (${memoryPressurePercent}%).`,
            "The signal indicates urgent compute capacity risk only; it is not a diagnosis or treatment claim.",
          ],
          boundary:
            "Deterministic infrastructure risk interpretation; not a machine-learning accuracy or hospital-safety certification claim.",
        },
      ];
    }
    return [];
  });
}

function resultApprovalRequirement(
  topPlan: RankedPlan | null
): ApprovalRequirement {
  if (topPlan) return topPlan.approvalRequirement;
  return {
    required: true,
    level: "multidisciplinary-review",
    reasons: [
      "Every candidate failed at least one hard Guard constraint; manual review is required and no target is recommended.",
    ],
    manualReviewRequired: true,
    blocksAutomaticExecution: true,
    approvalQueue: "existing-operational-twin-approval",
  };
}

function decisionStatus(
  state: OperationalTwinState,
  status: GuardRulerResult["status"],
  topPlan: RankedPlan | null
): DecisionStatus {
  if (status === "no-safe-route") return "manual-review-required";
  if (!topPlan?.approvalRequirement.required) return "not-required";

  const approval = state.activeSimulation?.approval;
  if (
    approval?.recommendationId ===
    topPlan.candidatePlan.recommendationId
  ) {
    return approval.decision === "approve" ? "approved" : "rejected";
  }
  return "awaiting-approval";
}

export function evaluateGuardRuler(
  state: OperationalTwinState,
  options: GuardRulerEvaluationOptions = {}
): GuardRulerResult {
  const context = buildDecisionContext(state, options);
  const candidates = createCandidatePlans(state, context);
  const guardEvaluations = candidates.map((candidate) =>
    guardEvaluation(context, candidate)
  );
  const summary = guardSummary(guardEvaluations);
  const plans = rankedPlans(
    state,
    context,
    guardEvaluations
  );
  const planA = plans[0] ?? null;
  const planB = plans[1] ?? null;
  const planC = plans[2] ?? null;
  const status: GuardRulerResult["status"] =
    planA === null ? "no-safe-route" : "safe-plans-available";
  const approvalRequirement = resultApprovalRequirement(planA);
  const evaluatedAt =
    options.evaluatedAt ?? state.lastSynchronizedAt;
  const activeRecommendationId =
    planA?.candidatePlan.recommendationId ?? null;
  const resultDecisionStatus = decisionStatus(
    state,
    status,
    planA
  );
  const guardReasons =
    summary.reasons.length > 0
      ? summary.reasons
      : [
          "Every ranked candidate passed the centralized hard Guard constraints.",
        ];
  const rulerReasons = planA
    ? planA.criterionScores.map(
        (criterion) =>
          `${criterion.criterionName}: ${criterion.normalizedScore}/100 at ${criterion.weightPercent}% weight.`
      )
    : [
        "Ruler did not score or rank any blocked candidate.",
      ];

  return {
    id: `guard-ruler-evaluation:${context.evaluationKey}`,
    evaluationKey: context.evaluationKey,
    evaluationProfile: context.evaluationProfile,
    evaluatedAt,
    evaluatedStateVersion: state.version,
    workloadId: context.workload.id,
    workloadName: context.workload.name,
    recommendationId: activeRecommendationId,
    activeRecommendationId,
    status,
    decisionStatus: resultDecisionStatus,
    context,
    candidates,
    guardEvaluations,
    guardSummary: summary,
    rulerCriteria: [...RULER_CRITERIA],
    planSet: {
      status,
      planA,
      planB,
      planC,
      rankedPlans: plans,
      blockedAlternatives: guardEvaluations.filter(
        (evaluation) => !evaluation.eligibleForRanking
      ),
      comparison: planComparison(plans),
    },
    riskInterpretations: riskInterpretations(state, context),
    approvalRequirement,
    explanation: {
      summary:
        status === "no-safe-route"
          ? "No safe route is available. Manual review is required and no recommendation was fabricated."
          : `${planA?.candidatePlan.targetLabel ?? "The leading plan"} is Plan A after hard-constraint screening and transparent weighted ranking.`,
      guardReasons,
      rulerReasons,
      projectionBoundary:
        "Before/after values are what-if infrastructure projections and never mutate canonical telemetry.",
      decisionSupportDisclaimer:
        "Infrastructure Decision Support Only. PHI-Zero. No diagnosis, treatment recommendation, patient identity, physical migration, or certified hospital-safety claim.",
      noAutomaticExecution: true,
    },
    manualReviewRequired:
      status === "no-safe-route" ||
      approvalRequirement.manualReviewRequired,
    simulationOnly: true,
    noPhysicalExecution: true,
  };
}

export const GUARD_RULER_CRISIS_RECOMMENDATION_ID =
  CRISIS_RECOMMENDATION_ID;
