import type {
  GuardEvaluation,
  OperationalTwinState,
  RankedPlan,
} from "./types";
import { getDashboardScenarioId } from "./scenario-identity";

function summarizePlan(plan: RankedPlan | null) {
  if (plan === null) return null;
  return {
    rank: plan.rank,
    label: plan.planLabel,
    action: plan.candidatePlan.action,
    targetGpuId: plan.candidatePlan.targetGpuId,
    targetLabel: plan.candidatePlan.targetLabel,
    targetClusterType: plan.candidatePlan.targetClusterType,
    totalScore: plan.totalScore,
    confidence: plan.confidence,
    deadlineSeconds: plan.candidatePlan.deadlineSeconds,
    predictedCompletionSeconds:
      plan.candidatePlan.predictedCompletionSeconds,
    deadlineMarginSeconds: plan.candidatePlan.deadlineMarginSeconds,
    projectedClusterHealthPercent:
      plan.projection.after.projectedClusterHealthPercent,
    projectedRiskyGpuCount: plan.projection.after.projectedRiskyGpuCount,
    expectedDowntimeSavedMinutes:
      plan.projection.after.expectedDowntimeSavedMinutes,
    expectedCostChangePercent:
      plan.projection.after.expectedCostChangePercent,
    approvalRequired: plan.approvalRequirement.required,
    approvalLevel: plan.approvalRequirement.level,
    explanation: plan.explanation,
    whatIfOnly: plan.projection.whatIfOnly,
    canonicalTelemetryMutated:
      plan.projection.canonicalTelemetryMutated,
  };
}

function summarizeBlockedAlternative(evaluation: GuardEvaluation) {
  return {
    candidateId: evaluation.candidatePlan.id,
    targetGpuId: evaluation.candidatePlan.targetGpuId,
    targetLabel: evaluation.candidatePlan.targetLabel,
    targetClusterType: evaluation.candidatePlan.targetClusterType,
    status: evaluation.status,
    violations: evaluation.violations.map((violation) => ({
      code: violation.code,
      ruleId: violation.ruleId,
      severity: violation.severity,
      reason: violation.reason,
      affectedEntityIds: violation.affectedEntityIds,
      manualReviewRequired: violation.manualReviewRequired,
    })),
  };
}

/**
 * Builds a PHI-Zero, portable JSON evidence package for mentor/judge review.
 * It contains infrastructure decision evidence only and performs no mutation.
 */
export function createDecisionEvidencePackage(
  state: OperationalTwinState,
  generatedAt = new Date().toISOString()
) {
  const evaluation = state.latestGuardRulerEvaluation;
  const activeScenarioId = state.scenarioRuntime.activeScenarioId;
  const activeCorrelationId = state.activeSimulation
    ? `correlation-${state.activeSimulation.id}`
    : null;
  const relevantNotifications = state.notifications
    .filter(
      (notification) =>
        activeCorrelationId === null ||
        notification.correlationId === activeCorrelationId
    )
    .map((notification) => ({
      id: notification.id,
      title: notification.title,
      severity: notification.severity,
      domain: notification.domain,
      lifecycleStatus: notification.lifecycleStatus,
      timestamp: notification.timestamp,
      reason: notification.reason,
      acknowledgedAt: notification.acknowledgedAt ?? null,
      acknowledgedBy: notification.acknowledgedBy ?? null,
    }));

  return {
    schemaVersion: "1.0.0",
    evidenceId: `medroutex-evidence-v${state.version}-${evaluation?.id ?? "no-evaluation"}`,
    generatedAt,
    project: {
      name: "ClusterOS AI: MedRouteX",
      team: "Team Delta",
      purpose: "Hospital infrastructure continuity decision-support pilot",
      phiMode: "PHI-Zero",
    },
    canonicalState: {
      twinId: state.twinId,
      hospitalId: state.hospitalId,
      version: state.version,
      scenarioId: getDashboardScenarioId(state),
      canonicalScenarioId: activeScenarioId,
      scenarioStatus: state.scenarioRuntime.scenarioStatus,
      overallStatus: state.overallStatus,
      healthScore: state.overallHealthScore,
      riskScore: state.overallRiskScore,
      resilienceScore: state.resilienceSummary.resilienceScore,
      domainScores: {
        compute: state.resilienceSummary.computeScore,
        icu: state.resilienceSummary.icuContinuityScore,
        oxygen: state.resilienceSummary.oxygenContinuityScore,
        power: state.resilienceSummary.powerContinuityScore,
        network: state.resilienceSummary.networkContinuityScore,
      },
      riskyGpuCount: state.domains.compute.riskyGpus,
      entityCount: state.entities.length,
      relationshipCount: state.relationships.length,
      lastSynchronizedAt: state.lastSynchronizedAt,
      simulationOnly: state.simulationOnly,
    },
    scenarioEvidence: {
      affectedDomains: state.scenarioRuntime.affectedDomains,
      rootCauses: state.scenarioRuntime.rootCauses.map((rootCause) => ({
        entityId: rootCause.entityId,
        domain: rootCause.domain,
        severity: rootCause.severity,
        title: rootCause.title,
        evidence: rootCause.evidence,
        timeToFailureSeconds: rootCause.timeToFailureSeconds,
        timeToFailureBand: rootCause.timeToFailureBand,
        confidence: rootCause.confidence,
      })),
      cascadePaths: state.scenarioRuntime.cascadePaths.map((path) => ({
        id: path.id,
        rootEntityId: path.rootEntityId,
        nodeEntityIds: path.nodeEntityIds,
        relationshipIds: path.relationshipIds,
        severity: path.severity,
        confidence: path.confidence,
        timeToImpactBand: path.timeToImpactBand,
        explanation: path.explanation,
      })),
      physicalExecutionPerformed:
        state.scenarioRuntime.physicalExecutionPerformed,
    },
    guardRulerDecision: evaluation
      ? {
          evaluationId: evaluation.id,
          evaluatedAt: evaluation.evaluatedAt,
          evaluatedStateVersion: evaluation.evaluatedStateVersion,
          currentStateVersion: state.version,
          workloadId: evaluation.workloadId,
          workloadName: evaluation.workloadName,
          status: evaluation.status,
          decisionStatus: evaluation.decisionStatus,
          guardSummary: evaluation.guardSummary,
          planA: summarizePlan(evaluation.planSet.planA),
          planB: summarizePlan(evaluation.planSet.planB),
          planC: summarizePlan(evaluation.planSet.planC),
          blockedAlternatives:
            evaluation.planSet.blockedAlternatives.map(
              summarizeBlockedAlternative
            ),
          riskInterpretations: evaluation.riskInterpretations,
          explanation: evaluation.explanation,
          simulationOnly: evaluation.simulationOnly,
          noPhysicalExecution: evaluation.noPhysicalExecution,
        }
      : null,
    humanApproval: {
      required: state.scenarioRuntime.humanApprovalRequired,
      simulationStatus: state.activeSimulation?.status ?? null,
      recommendationId:
        state.activeSimulation?.recommendationId ??
        evaluation?.recommendationId ??
        null,
      recommendedTargetGpuId:
        state.activeSimulation?.recommendedTargetGpuId ??
        evaluation?.planSet.planA?.candidatePlan.targetGpuId ??
        null,
      approval: state.activeSimulation?.approval ?? null,
      auditEvents: state.approvalAuditEvents,
    },
    liveHardwareTelemetry: state.liveHardwareGpu
      ? {
          ...state.liveHardwareGpu,
          boundary:
            "Live laptop GPU telemetry is evidence-only and never replaces or mutates the synthetic 10-node Digital Twin.",
        }
      : null,
    notifications: relevantNotifications,
    safetyBoundary: {
      decisionSupportOnly: true,
      diagnosis: false,
      treatmentRecommendation: false,
      patientIdentity: false,
      automaticMigration: false,
      actuatorExecution: false,
      certifiedHospitalSafetyClaim: false,
      statement:
        "PHI-Zero infrastructure decision-support evidence using synthetic and emulated telemetry. No automatic or physical action was executed.",
    },
  } as const;
}
