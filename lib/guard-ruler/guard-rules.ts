import type {
  ApprovalRequirement,
  CandidatePlan,
  DecisionContext,
  GuardRule,
  GuardViolation,
  HospitalOperationalStatus,
} from "../twin-core/types";

const GPU_RISK_LIMIT_PERCENT = 80;
const GPU_OVERHEATING_C = 90;
const GPU_MEMORY_OVERLOAD_PERCENT = 95;
const GPU_CAPACITY_LIMIT_PERCENT = 95;

function evidenceNumber(
  candidate: CandidatePlan,
  key: string,
  fallback: number
): number {
  const value = candidate.evidence[key];
  return typeof value === "number" ? value : fallback;
}

function evidenceString(
  candidate: CandidatePlan,
  key: string,
  fallback: string
): string {
  const value = candidate.evidence[key];
  return typeof value === "string" ? value : fallback;
}

function violation(
  candidate: CandidatePlan,
  input: Omit<
    GuardViolation,
    "id" | "affectedEntityIds" | "manualReviewRequired"
  > & {
    affectedEntityIds?: string[];
    manualReviewRequired?: boolean;
  }
): GuardViolation {
  return {
    ...input,
    id: `${candidate.id}:${input.code}`,
    affectedEntityIds:
      input.affectedEntityIds ??
      [
        candidate.workloadId,
        ...(candidate.targetGpuEntityId
          ? [candidate.targetGpuEntityId]
          : []),
      ],
    manualReviewRequired: input.manualReviewRequired ?? true,
  };
}

function unavailable(status: HospitalOperationalStatus): boolean {
  return status === "critical" || status === "offline";
}

function privacyTargetIsCompatible(
  context: DecisionContext,
  candidate: CandidatePlan
): boolean {
  if (context.privacyPolicy === "cloud-allowed") return true;
  if (context.privacyPolicy === "on-prem-only") {
    return candidate.targetClusterType === "local";
  }
  return (
    candidate.targetClusterType === "local" ||
    candidate.targetClusterType === "central"
  );
}

const privacyRule: GuardRule = {
  id: "privacy",
  name: "Privacy and PHI-Zero routing",
  description:
    "Blocks targets that are incompatible with the canonical workload privacy policy.",
  effect: "block",
  evaluate(context, candidate) {
    if (privacyTargetIsCompatible(context, candidate)) return [];

    const isBlockedCloud =
      candidate.targetClusterType === "cloud";
    const reason = isBlockedCloud
      ? `PHI-Zero privacy policy "${context.privacyPolicy}" blocks ` +
        `${candidate.targetLabel}; this workload cannot route to a cloud target.`
      : `PHI-Zero privacy policy "${context.privacyPolicy}" permits local targets only; ` +
        `${candidate.targetLabel} is a ${candidate.targetClusterType} target and is incompatible.`;
    return [
      violation(candidate, {
        ruleId: "privacy",
        code: isBlockedCloud
          ? "PHI_ZERO_CLOUD_BLOCK"
          : "PRIVACY_POLICY_BLOCK",
        severity: "blocked",
        reason,
        evidence: {
          privacyPolicy: context.privacyPolicy,
          targetClusterType: candidate.targetClusterType,
          phiMode: "PHI-Zero",
        },
      }),
    ];
  },
};

const deadlineRule: GuardRule = {
  id: "deadline-sla",
  name: "Critical deadline and SLA",
  description:
    "Blocks critical-workload plans whose deterministic completion estimate exceeds the canonical deadline.",
  effect: "block",
  evaluate(context, candidate) {
    if (
      context.workloadPriority !== "critical" ||
      candidate.deadlineMarginSeconds >= 0
    ) {
      return [];
    }

    return [
      violation(candidate, {
        ruleId: "deadline-sla",
        code: "CRITICAL_DEADLINE_MISS",
        severity: "blocked",
        reason:
          `${candidate.targetLabel} is estimated to complete in ` +
          `${candidate.predictedCompletionSeconds} seconds against the ` +
          `${candidate.deadlineSeconds}-second critical deadline ` +
          `(margin ${candidate.deadlineMarginSeconds} seconds).`,
        evidence: {
          estimatedCompletionSeconds:
            candidate.predictedCompletionSeconds,
          deadlineSeconds: candidate.deadlineSeconds,
          deadlineMarginSeconds: candidate.deadlineMarginSeconds,
        },
        estimatedCompletionSeconds:
          candidate.predictedCompletionSeconds,
        deadlineSeconds: candidate.deadlineSeconds,
        deadlineMarginSeconds: candidate.deadlineMarginSeconds,
      }),
    ];
  },
};

const computeRiskRule: GuardRule = {
  id: "compute-risk",
  name: "Compute risk, telemetry, memory, and capacity",
  description:
    "Blocks offline, overheated, overloaded, over-risk, untrusted, or capacity-constrained GPU targets.",
  effect: "block",
  evaluate(context, candidate) {
    const targetStatus = evidenceString(
      candidate,
      "targetStatus",
      "unknown"
    );
    if (targetStatus === "offline") {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "GPU_OFFLINE",
          severity: "blocked",
          reason: `${candidate.targetLabel} is offline and cannot receive a workload.`,
          evidence: { targetStatus },
        }),
      ];
    }

    if (!candidate.telemetryTrusted) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "TELEMETRY_UNTRUSTED",
          severity: candidate.manualReviewOnly
            ? "manual-review-only"
            : "blocked",
          reason:
            `${candidate.targetLabel} has stale or untrusted critical telemetry` +
            (candidate.manualReviewOnly
              ? " and is retained only for manual review."
              : "; automatic safe ranking is blocked."),
          evidence: {
            telemetryTrusted: candidate.telemetryTrusted,
            telemetryConfidence: candidate.telemetryConfidence,
            workloadPriority: context.workloadPriority,
          },
        }),
      ];
    }

    const temperatureC = evidenceNumber(
      candidate,
      "temperatureC",
      0
    );
    if (temperatureC >= GPU_OVERHEATING_C) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "GPU_OVERHEATING",
          severity: "blocked",
          reason:
            `${candidate.targetLabel} is blocked for overheating at ` +
            `${temperatureC}°C.`,
          evidence: {
            temperatureC,
            overheatingLimitC: GPU_OVERHEATING_C,
            predictedRiskPercent:
              candidate.predictedTargetRiskPercent,
          },
        }),
      ];
    }

    const memoryPressurePercent =
      candidate.targetMemoryTotalMiB <= 0
        ? 100
        : Math.round(
            (candidate.targetMemoryUsedMiB /
              candidate.targetMemoryTotalMiB) *
              1000
          ) / 10;
    if (memoryPressurePercent >= GPU_MEMORY_OVERLOAD_PERCENT) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "GPU_MEMORY_OVERLOAD",
          severity: "blocked",
          reason:
            `${candidate.targetLabel} is blocked for memory overload at ` +
            `${candidate.targetMemoryUsedMiB}/${candidate.targetMemoryTotalMiB} MiB.`,
          evidence: {
            memoryUsedMiB: candidate.targetMemoryUsedMiB,
            memoryTotalMiB: candidate.targetMemoryTotalMiB,
            memoryPressurePercent,
            memoryOverloadLimitPercent:
              GPU_MEMORY_OVERLOAD_PERCENT,
          },
        }),
      ];
    }

    if (
      candidate.predictedTargetRiskPercent >
      GPU_RISK_LIMIT_PERCENT
    ) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "GPU_RISK_EXCEEDS_LIMIT",
          severity: "blocked",
          reason:
            `${candidate.targetLabel} predicted risk is ` +
            `${candidate.predictedTargetRiskPercent}%, above the ` +
            `${GPU_RISK_LIMIT_PERCENT}% hard limit.`,
          evidence: {
            predictedRiskPercent:
              candidate.predictedTargetRiskPercent,
            riskLimitPercent: GPU_RISK_LIMIT_PERCENT,
          },
        }),
      ];
    }

    const availableMemoryMiB =
      candidate.targetMemoryTotalMiB -
      candidate.targetMemoryUsedMiB;
    if (availableMemoryMiB < candidate.memoryRequiredMiB) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "INSUFFICIENT_MEMORY",
          severity: "blocked",
          reason:
            `${candidate.targetLabel} has ${availableMemoryMiB} MiB free, ` +
            `below the ${candidate.memoryRequiredMiB} MiB workload requirement.`,
          evidence: {
            availableMemoryMiB,
            memoryRequiredMiB: candidate.memoryRequiredMiB,
          },
        }),
      ];
    }

    const computeRequiredPercent = evidenceNumber(
      candidate,
      "computeRequiredPercent",
      context.computeRequiredPercent
    );
    const projectedUtilizationPercent =
      candidate.targetUtilizationPercent +
      computeRequiredPercent;
    if (projectedUtilizationPercent > GPU_CAPACITY_LIMIT_PERCENT) {
      return [
        violation(candidate, {
          ruleId: "compute-risk",
          code: "INSUFFICIENT_CAPACITY",
          severity: "blocked",
          reason:
            `${candidate.targetLabel} would reach ` +
            `${projectedUtilizationPercent}% utilization, above the ` +
            `${GPU_CAPACITY_LIMIT_PERCENT}% capacity guard.`,
          evidence: {
            currentUtilizationPercent:
              candidate.targetUtilizationPercent,
            computeRequiredPercent,
            projectedUtilizationPercent,
            capacityLimitPercent: GPU_CAPACITY_LIMIT_PERCENT,
          },
        }),
      ];
    }

    return [];
  },
};

const clinicalPriorityRule: GuardRule = {
  id: "clinical-infrastructure-priority",
  name: "Critical infrastructure workload priority",
  description:
    "Prevents automatic pause, drop, or impermissible delay of critical infrastructure workloads.",
  effect: "block",
  evaluate(context, candidate) {
    if (context.workloadPriority !== "critical") {
      if (
        candidate.action === "delay" &&
        !candidate.lowerPriorityDelayPermitted
      ) {
        return [
          violation(candidate, {
            ruleId: "clinical-infrastructure-priority",
            code: "CRITICAL_WORKLOAD_INTERRUPTION",
            severity: "blocked",
            reason:
              "This workload policy does not permit the proposed delay.",
            evidence: {
              action: candidate.action,
              delayPermitted:
                candidate.lowerPriorityDelayPermitted,
            },
          }),
        ];
      }
      return [];
    }

    if (
      candidate.action !== "pause" &&
      candidate.action !== "drop" &&
      candidate.action !== "delay"
    ) {
      return [];
    }

    return [
      violation(candidate, {
        ruleId: "clinical-infrastructure-priority",
        code: "CRITICAL_WORKLOAD_INTERRUPTION",
        severity: "blocked",
        reason:
          `Critical infrastructure workload ${context.workload.name} ` +
          `cannot be ${candidate.action}d automatically.`,
        evidence: {
          action: candidate.action,
          workloadPriority: context.workloadPriority,
          diagnosisOrTreatmentDecision: false,
        },
      }),
    ];
  },
};

const hospitalDependencyRule: GuardRule = {
  id: "hospital-dependency-safety",
  name: "Hospital dependency continuity",
  description:
    "Blocks plans when a required power, network, ICU, or oxygen dependency is unavailable.",
  effect: "block",
  evaluate(context, candidate) {
    const violations: GuardViolation[] = [];
    if (
      candidate.requiresPowerContinuity &&
      (unavailable(context.dependencies.power.operationalStatus) ||
        unavailable(
          context.dependencies.power.gpuDataCenterPowerStatus
        ))
    ) {
      violations.push(
        violation(candidate, {
          ruleId: "hospital-dependency-safety",
          code: "POWER_DEPENDENCY_UNAVAILABLE",
          severity: "blocked",
          reason:
            "The GPU data-center power dependency is unavailable for this plan.",
          evidence: {
            powerStatus:
              context.dependencies.power.operationalStatus,
            gpuDataCenterPowerStatus:
              context.dependencies.power.gpuDataCenterPowerStatus,
          },
        })
      );
    }

    const networkStatus =
      candidate.targetClusterType === "local"
        ? context.dependencies.network.localLinkStatus
        : candidate.targetClusterType === "cloud"
          ? context.dependencies.network.cloudLinkStatus
          : context.dependencies.network.centralLinkStatus;
    if (
      candidate.requiresNetworkContinuity &&
      unavailable(networkStatus)
    ) {
      violations.push(
        violation(candidate, {
          ruleId: "hospital-dependency-safety",
          code: "NETWORK_DEPENDENCY_UNAVAILABLE",
          severity: "blocked",
          reason:
            `${candidate.targetClusterType} network continuity is unavailable for this plan.`,
          evidence: {
            targetClusterType: candidate.targetClusterType,
            networkStatus,
          },
        })
      );
    }

    if (
      candidate.requiresIcuContinuity &&
      unavailable(context.dependencies.icu.operationalStatus)
    ) {
      violations.push(
        violation(candidate, {
          ruleId: "hospital-dependency-safety",
          code: "ICU_CONTINUITY_UNAVAILABLE",
          severity: "blocked",
          reason:
            "Required ICU infrastructure continuity is unavailable for this plan.",
          evidence: {
            icuStatus:
              context.dependencies.icu.operationalStatus,
          },
        })
      );
    }

    if (
      candidate.requiresOxygenContinuity &&
      (unavailable(
        context.dependencies.oxygen.operationalStatus
      ) ||
        unavailable(
          context.dependencies.oxygen.reserveBankStatus
        ))
    ) {
      violations.push(
        violation(candidate, {
          ruleId: "hospital-dependency-safety",
          code: "OXYGEN_CONTINUITY_UNAVAILABLE",
          severity: "blocked",
          reason:
            "Required oxygen infrastructure continuity is unavailable for this plan.",
          evidence: {
            oxygenStatus:
              context.dependencies.oxygen.operationalStatus,
            reserveBankStatus:
              context.dependencies.oxygen.reserveBankStatus,
          },
        })
      );
    }

    return violations;
  },
};

const humanApprovalRule: GuardRule = {
  id: "human-approval",
  name: "Human approval boundary",
  description:
    "Requires a recorded human decision for critical migrations, dependency impacts, degraded modes, and manual-only policies.",
  effect: "require-approval",
  evaluate() {
    return [];
  },
  approvalReason(context, candidate) {
    const reasons: string[] = [];
    if (
      context.workloadPriority === "critical" &&
      candidate.action === "migrate"
    ) {
      reasons.push("A critical workload would be migrated.");
    }
    if (candidate.evidence.affectsCriticalInfrastructure === true) {
      reasons.push(
        "The plan affects a critical infrastructure dependency."
      );
    }
    if (candidate.action === "degraded-mode") {
      reasons.push("The plan proposes degraded mode.");
    }
    if (
      candidate.manualReviewOnly ||
      candidate.evidence.policyManualOnly === true
    ) {
      reasons.push("Policy marks this decision as manual-only.");
    }
    return reasons.length > 0 ? reasons.join(" ") : null;
  },
};

export const GUARD_RULES: readonly GuardRule[] = [
  privacyRule,
  deadlineRule,
  computeRiskRule,
  clinicalPriorityRule,
  hospitalDependencyRule,
  humanApprovalRule,
];

export function approvalRequirementFor(
  context: DecisionContext,
  candidate: CandidatePlan
): ApprovalRequirement {
  const reasons = GUARD_RULES.flatMap((rule) => {
    if (rule.effect !== "require-approval" || !rule.approvalReason) {
      return [];
    }
    const reason = rule.approvalReason(context, candidate);
    return reason ? [reason] : [];
  });
  const manualReviewRequired =
    candidate.manualReviewOnly ||
    candidate.action === "degraded-mode" ||
    candidate.evidence.policyManualOnly === true;
  const multidisciplinary =
    candidate.action === "degraded-mode" ||
    candidate.evidence.affectsCriticalInfrastructure === true ||
    candidate.evidence.policyManualOnly === true;

  return {
    required: reasons.length > 0,
    level:
      reasons.length === 0
        ? "none"
        : multidisciplinary
          ? "multidisciplinary-review"
          : "authorized-operator",
    reasons,
    manualReviewRequired,
    blocksAutomaticExecution: true,
    approvalQueue: "existing-operational-twin-approval",
  };
}
