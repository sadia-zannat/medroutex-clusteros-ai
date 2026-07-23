"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApprovalRequirement,
  CandidatePlan,
  CriterionScore,
  DecisionEvidenceValue,
  DecisionStatus,
  GuardEvaluation,
  GuardRulerResult,
  GuardRulerStateApiResponse,
  GuardSummary,
  GuardViolation,
  PlanProjection,
  RankedPlan,
  RiskInterpretation,
} from "@/lib/twin-core/types";

export interface GuardRulerDecisionEngineProps {
  refreshNonce?: number;
}

const DECISION_STATUSES: readonly DecisionStatus[] = [
  "not-required",
  "awaiting-approval",
  "approved",
  "rejected",
  "manual-review-required",
];

const PLAN_ACTIONS: readonly CandidatePlan["action"][] = [
  "keep",
  "migrate",
  "queue",
  "delay",
  "pause",
  "drop",
  "degraded-mode",
  "manual-review",
];

const CLUSTER_TYPES: readonly CandidatePlan["targetClusterType"][] = [
  "local",
  "central",
  "cloud",
];

const PLAN_LABELS: readonly RankedPlan["planLabel"][] = [
  "Plan A",
  "Plan B",
  "Plan C",
  "Safe Alternative",
];

const TIME_TO_FAILURE_LABELS: Record<
  RiskInterpretation["timeToFailureBand"],
  string
> = {
  immediate: "Immediate",
  "under-5-minutes": "Under 5 minutes",
  "5-30-minutes": "5–30 minutes",
  "30-120-minutes": "30–120 minutes",
  "over-120-minutes": "Over 120 minutes",
  unknown: "Unknown",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[]
): value is T {
  return (
    typeof value === "string" &&
    (options as readonly string[]).includes(value)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceValue(value: unknown): value is DecisionEvidenceValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (Array.isArray(value) &&
      (value.every((item) => typeof item === "string") ||
        value.every((item) => typeof item === "number")))
  );
}

function isEvidenceRecord(
  value: unknown
): value is Record<string, DecisionEvidenceValue> {
  return isRecord(value) && Object.values(value).every(isEvidenceValue);
}

function isApprovalRequirement(
  value: unknown
): value is ApprovalRequirement {
  if (!isRecord(value)) return false;
  return (
    typeof value.required === "boolean" &&
    (value.level === "none" ||
      value.level === "authorized-operator" ||
      value.level === "multidisciplinary-review") &&
    isStringArray(value.reasons) &&
    typeof value.manualReviewRequired === "boolean" &&
    value.blocksAutomaticExecution === true &&
    value.approvalQueue === "existing-operational-twin-approval"
  );
}

function isCandidatePlan(value: unknown): value is CandidatePlan {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.recommendationId === "string" &&
    typeof value.workloadId === "string" &&
    isOneOf(value.action, PLAN_ACTIONS) &&
    (value.sourceGpuEntityId === null ||
      typeof value.sourceGpuEntityId === "string") &&
    (value.sourceGpuId === null || typeof value.sourceGpuId === "string") &&
    (value.targetGpuEntityId === null ||
      typeof value.targetGpuEntityId === "string") &&
    (value.targetGpuId === null || typeof value.targetGpuId === "string") &&
    typeof value.targetLabel === "string" &&
    isOneOf(value.targetClusterType, CLUSTER_TYPES) &&
    typeof value.predictedCompletionSeconds === "number" &&
    typeof value.deadlineSeconds === "number" &&
    typeof value.deadlineMarginSeconds === "number" &&
    typeof value.predictedTargetRiskPercent === "number" &&
    typeof value.targetHealthPercent === "number" &&
    typeof value.targetClusterHealthPercent === "number" &&
    typeof value.targetUtilizationPercent === "number" &&
    typeof value.targetMemoryUsedMiB === "number" &&
    typeof value.targetMemoryTotalMiB === "number" &&
    typeof value.memoryRequiredMiB === "number" &&
    typeof value.latencyMs === "number" &&
    typeof value.estimatedCostChangePercent === "number" &&
    typeof value.telemetryTrusted === "boolean" &&
    typeof value.telemetryConfidence === "number" &&
    typeof value.manualReviewOnly === "boolean" &&
    typeof value.lowerPriorityDelayPermitted === "boolean" &&
    typeof value.degradedModePermitted === "boolean" &&
    typeof value.requiresPowerContinuity === "boolean" &&
    typeof value.requiresNetworkContinuity === "boolean" &&
    typeof value.requiresIcuContinuity === "boolean" &&
    typeof value.requiresOxygenContinuity === "boolean" &&
    isEvidenceRecord(value.evidence)
  );
}

function isCriterionScore(value: unknown): value is CriterionScore {
  if (!isRecord(value)) return false;
  return (
    typeof value.criterionId === "string" &&
    typeof value.criterionName === "string" &&
    typeof value.normalizedScore === "number" &&
    typeof value.weightPercent === "number" &&
    typeof value.weightedContribution === "number" &&
    isEvidenceRecord(value.rawEvidence) &&
    typeof value.explanation === "string"
  );
}

function isRelevantDependencyProjection(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const statuses = ["operational", "degraded", "critical", "offline"];
  const optionalStatuses = [...statuses, "not-relevant"];
  return (
    isOneOf(value.power, statuses) &&
    isOneOf(value.network, statuses) &&
    isOneOf(value.icu, optionalStatuses) &&
    isOneOf(value.oxygen, optionalStatuses)
  );
}

function isPlanProjection(value: unknown): value is PlanProjection {
  if (!isRecord(value) || !isRecord(value.before) || !isRecord(value.after)) {
    return false;
  }
  const before = value.before;
  const after = value.after;
  return (
    (before.workloadLocation === null ||
      typeof before.workloadLocation === "string") &&
    (before.workloadSlaRisk === "low" ||
      before.workloadSlaRisk === "moderate" ||
      before.workloadSlaRisk === "high" ||
      before.workloadSlaRisk === "critical" ||
      before.workloadSlaRisk === "unknown") &&
    (before.sourceGpuHealthPercent === null ||
      typeof before.sourceGpuHealthPercent === "number") &&
    typeof before.targetGpuHealthPercent === "number" &&
    typeof before.clusterHealthPercent === "number" &&
    typeof before.riskyGpuCount === "number" &&
    isRelevantDependencyProjection(before.dependencies) &&
    (after.projectedWorkloadLocation === null ||
      typeof after.projectedWorkloadLocation === "string") &&
    typeof after.projectedCompletionSeconds === "number" &&
    typeof after.projectedClusterHealthPercent === "number" &&
    typeof after.projectedRiskyGpuCount === "number" &&
    typeof after.expectedDowntimeSavedMinutes === "number" &&
    typeof after.expectedCostChangePercent === "number" &&
    isStringArray(after.remainingRisks) &&
    typeof after.confidence === "number" &&
    value.whatIfOnly === true &&
    value.canonicalTelemetryMutated === false
  );
}

function isRankedPlan(value: unknown): value is RankedPlan {
  if (!isRecord(value)) return false;
  return (
    typeof value.rank === "number" &&
    isOneOf(value.planLabel, PLAN_LABELS) &&
    isCandidatePlan(value.candidatePlan) &&
    Array.isArray(value.criterionScores) &&
    value.criterionScores.every(isCriterionScore) &&
    typeof value.totalScore === "number" &&
    typeof value.confidence === "number" &&
    isPlanProjection(value.projection) &&
    isApprovalRequirement(value.approvalRequirement) &&
    typeof value.explanation === "string"
  );
}

function isGuardViolation(value: unknown): value is GuardViolation {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.ruleId === "string" &&
    typeof value.code === "string" &&
    (value.severity === "blocked" ||
      value.severity === "manual-review-only") &&
    typeof value.reason === "string" &&
    isEvidenceRecord(value.evidence) &&
    isStringArray(value.affectedEntityIds) &&
    typeof value.manualReviewRequired === "boolean" &&
    (value.estimatedCompletionSeconds === undefined ||
      typeof value.estimatedCompletionSeconds === "number") &&
    (value.deadlineSeconds === undefined ||
      typeof value.deadlineSeconds === "number") &&
    (value.deadlineMarginSeconds === undefined ||
      typeof value.deadlineMarginSeconds === "number")
  );
}

function isGuardEvaluation(value: unknown): value is GuardEvaluation {
  if (!isRecord(value)) return false;
  return (
    isCandidatePlan(value.candidatePlan) &&
    (value.status === "eligible" ||
      value.status === "blocked" ||
      value.status === "manual-review-only") &&
    typeof value.eligibleForRanking === "boolean" &&
    isStringArray(value.evaluatedRuleIds) &&
    isStringArray(value.passedRuleIds) &&
    Array.isArray(value.violations) &&
    value.violations.every(isGuardViolation) &&
    isApprovalRequirement(value.approvalRequirement)
  );
}

function isRiskInterpretation(value: unknown): value is RiskInterpretation {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.sourceEntityId === "string" &&
    (value.predictedTimeToFailureSeconds === null ||
      typeof value.predictedTimeToFailureSeconds === "number") &&
    (value.timeToFailureBand === "immediate" ||
      value.timeToFailureBand === "under-5-minutes" ||
      value.timeToFailureBand === "5-30-minutes" ||
      value.timeToFailureBand === "30-120-minutes" ||
      value.timeToFailureBand === "over-120-minutes" ||
      value.timeToFailureBand === "unknown") &&
    isStringArray(value.dependencyCascadePath) &&
    isStringArray(value.affectedEntityIds) &&
    typeof value.confidence === "number" &&
    isStringArray(value.evidence) &&
    typeof value.boundary === "string"
  );
}

function isGuardSummary(value: unknown): value is GuardSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.evaluatedCandidateCount === "number" &&
    typeof value.eligibleCandidateCount === "number" &&
    typeof value.blockedCandidateCount === "number" &&
    typeof value.manualReviewOnlyCandidateCount === "number" &&
    (value.status === "passed" || value.status === "no-safe-route") &&
    isStringArray(value.reasons)
  );
}

function isGuardRulerResult(value: unknown): value is GuardRulerResult {
  if (
    !isRecord(value) ||
    !isRecord(value.context) ||
    !isRecord(value.planSet) ||
    !isRecord(value.explanation)
  ) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.evaluationKey === "string" &&
    (value.evaluationProfile === "canonical" ||
      value.evaluationProfile === "no-safe-route-test") &&
    typeof value.evaluatedAt === "string" &&
    typeof value.evaluatedStateVersion === "number" &&
    typeof value.workloadId === "string" &&
    typeof value.workloadName === "string" &&
    (value.recommendationId === null ||
      typeof value.recommendationId === "string") &&
    (value.activeRecommendationId === null ||
      typeof value.activeRecommendationId === "string") &&
    (value.status === "safe-plans-available" ||
      value.status === "no-safe-route") &&
    isOneOf(value.decisionStatus, DECISION_STATUSES) &&
    typeof value.context.evaluationKey === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isCandidatePlan) &&
    Array.isArray(value.guardEvaluations) &&
    value.guardEvaluations.every(isGuardEvaluation) &&
    isGuardSummary(value.guardSummary) &&
    Array.isArray(value.rulerCriteria) &&
    value.rulerCriteria.every(
      (criterion) =>
        isRecord(criterion) &&
        typeof criterion.id === "string" &&
        typeof criterion.name === "string" &&
        typeof criterion.weightPercent === "number" &&
        typeof criterion.description === "string"
    ) &&
    (value.planSet.status === "safe-plans-available" ||
      value.planSet.status === "no-safe-route") &&
    Array.isArray(value.planSet.rankedPlans) &&
    value.planSet.rankedPlans.every(isRankedPlan) &&
    Array.isArray(value.planSet.blockedAlternatives) &&
    value.planSet.blockedAlternatives.every(isGuardEvaluation) &&
    Array.isArray(value.riskInterpretations) &&
    value.riskInterpretations.every(isRiskInterpretation) &&
    isApprovalRequirement(value.approvalRequirement) &&
    typeof value.explanation.summary === "string" &&
    isStringArray(value.explanation.guardReasons) &&
    isStringArray(value.explanation.rulerReasons) &&
    typeof value.explanation.projectionBoundary === "string" &&
    typeof value.explanation.decisionSupportDisclaimer === "string" &&
    value.explanation.noAutomaticExecution === true &&
    typeof value.manualReviewRequired === "boolean" &&
    value.simulationOnly === true &&
    value.noPhysicalExecution === true
  );
}

function isGuardRulerStateApiResponse(
  value: unknown
): value is GuardRulerStateApiResponse {
  if (!isRecord(value) || !isRecord(value.metadata)) return false;
  return (
    value.success === true &&
    (value.outcome === undefined ||
      value.outcome === "applied" ||
      value.outcome === "idempotent") &&
    isGuardRulerResult(value.evaluation) &&
    (value.planA === null || isRankedPlan(value.planA)) &&
    (value.planB === null || isRankedPlan(value.planB)) &&
    (value.planC === null || isRankedPlan(value.planC)) &&
    Array.isArray(value.blockedAlternatives) &&
    value.blockedAlternatives.every(isGuardEvaluation) &&
    isGuardSummary(value.guardSummary) &&
    Array.isArray(value.rulerScoreBreakdown) &&
    value.rulerScoreBreakdown.every(isCriterionScore) &&
    isApprovalRequirement(value.approvalRequirement) &&
    isOneOf(value.decisionStatus, DECISION_STATUSES) &&
    typeof value.evaluationTimestamp === "string" &&
    typeof value.evaluatedStateVersion === "number" &&
    typeof value.currentStateVersion === "number" &&
    value.metadata.phiMode === "PHI-Zero" &&
    value.metadata.decisionSupportOnly === true &&
    value.metadata.whatIfSimulation === true &&
    value.metadata.automaticExecution === false &&
    value.metadata.canonicalSource ===
      "MedRouteX Hospital/Operational Twin"
  );
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function apiErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;
  if (typeof value.message === "string") return value.message;
  if (isRecord(value.error) && typeof value.error.message === "string") {
    return value.error.message;
  }
  return fallback;
}

function sentenceCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function formatPercent(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function formatScore(value: number): string {
  return value.toFixed(1);
}

function formatDeadlineMargin(value: number): string {
  if (value === 0) return "0s";
  return `${value > 0 ? "+" : ""}${Math.round(value)}s`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Unknown";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} minutes`;
}

function formatCostChange(value: number): string {
  if (value === 0) return "No change";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatEvidenceValue(value: DecisionEvidenceValue): string {
  if (value === null) return "Not available";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function entityLabel(entityId: string): string {
  const gpuMatch = entityId.match(/gpu-(\d+)$/i);
  if (gpuMatch) return `GPU-${Number(gpuMatch[1])}`;
  return entityId;
}

function approvalLabel(requirement: ApprovalRequirement): string {
  if (requirement.manualReviewRequired) return "Manual Review Required";
  return requirement.required
    ? `Required · ${sentenceCase(requirement.level)}`
    : "Not Required";
}

function Metric({
  label,
  value,
  valueClassName = "text-slate-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function CriterionBreakdown({ scores }: { scores: CriterionScore[] }) {
  return (
    <div className="mt-3 space-y-2">
      {scores.map((score) => (
        <article
          key={score.criterionId}
          className="rounded-lg border border-white/10 bg-slate-950/45 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-200">
              {score.criterionName}
            </p>
            <p className="text-[11px] text-cyan-300">
              {formatScore(score.normalizedScore)} × {score.weightPercent}% ={" "}
              {formatScore(score.weightedContribution)}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {score.explanation}
          </p>
          {Object.keys(score.rawEvidence).length > 0 ? (
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
              {Object.entries(score.rawEvidence).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-slate-500">{sentenceCase(key)}</dt>
                  <dd className="text-right text-slate-300">
                    {formatEvidenceValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ProjectionDetails({ projection }: { projection: PlanProjection }) {
  const dependencies = projection.before.dependencies;
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-white/10 bg-slate-950/45 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Before
        </p>
        <dl className="mt-2 space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Workload location</dt>
            <dd className="text-right text-slate-300">
              {projection.before.workloadLocation ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">SLA risk</dt>
            <dd className="text-right text-slate-300">
              {sentenceCase(projection.before.workloadSlaRisk)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Source GPU health</dt>
            <dd className="text-right text-slate-300">
              {projection.before.sourceGpuHealthPercent === null
                ? "Not available"
                : `${projection.before.sourceGpuHealthPercent}%`}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Target GPU health</dt>
            <dd className="text-right text-slate-300">
              {projection.before.targetGpuHealthPercent}%
            </dd>
          </div>
          <div className="border-t border-white/10 pt-1.5">
            <dt className="text-slate-500">Dependencies</dt>
            <dd className="mt-1 text-slate-300">
              Power {sentenceCase(dependencies.power)} · Network{" "}
              {sentenceCase(dependencies.network)} · ICU{" "}
              {sentenceCase(dependencies.icu)} · Oxygen{" "}
              {sentenceCase(dependencies.oxygen)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="rounded-lg border border-teal-500/15 bg-teal-500/5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">
          After simulation
        </p>
        <dl className="mt-2 space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Projected location</dt>
            <dd className="text-right text-slate-300">
              {projection.after.projectedWorkloadLocation ?? "Unassigned"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Projected completion</dt>
            <dd className="text-right text-slate-300">
              {formatDuration(projection.after.projectedCompletionSeconds)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Downtime saved</dt>
            <dd className="text-right text-slate-300">
              {projection.after.expectedDowntimeSavedMinutes} min
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Expected cost change</dt>
            <dd className="text-right text-slate-300">
              {formatCostChange(projection.after.expectedCostChangePercent)}
            </dd>
          </div>
          <div className="border-t border-white/10 pt-1.5">
            <dt className="text-slate-500">Remaining risks</dt>
            <dd className="mt-1 text-slate-300">
              {projection.after.remainingRisks.length > 0
                ? projection.after.remainingRisks.join(" · ")
                : "No additional modeled infrastructure risks"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  primary = false,
}: {
  plan: RankedPlan;
  primary?: boolean;
}) {
  const candidate = plan.candidatePlan;
  const projection = plan.projection;
  return (
    <article
      className={`rounded-xl border p-4 ${
        primary
          ? "border-cyan-500/30 bg-cyan-500/10"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-slate-100">{plan.planLabel}</h4>
            <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              Rank {plan.rank}
            </span>
            <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-teal-200">
              {sentenceCase(candidate.action)}
            </span>
          </div>
          <p className="mt-2 text-lg font-semibold text-cyan-200">
            {candidate.targetLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {plan.explanation}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Total score
          </p>
          <p className="text-2xl font-bold text-cyan-300">
            {formatScore(plan.totalScore)}
          </p>
          <p className="text-xs text-slate-400">
            {formatPercent(plan.confidence)} confidence
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Deadline margin"
          value={`${formatDeadlineMargin(candidate.deadlineMarginSeconds)} · ${candidate.deadlineSeconds}s deadline`}
          valueClassName={
            candidate.deadlineMarginSeconds >= 0
              ? "text-emerald-300"
              : "text-red-300"
          }
        />
        <Metric
          label="Projected completion"
          value={formatDuration(candidate.predictedCompletionSeconds)}
          valueClassName="text-cyan-200"
        />
        <Metric
          label="Cluster health"
          value={`${projection.before.clusterHealthPercent}% → ${projection.after.projectedClusterHealthPercent}%`}
          valueClassName="text-teal-200"
        />
        <Metric
          label="Risky GPUs"
          value={`${projection.before.riskyGpuCount} → ${projection.after.projectedRiskyGpuCount}`}
          valueClassName="text-teal-200"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span
          className={`rounded-full border px-2 py-1 ${
            plan.approvalRequirement.required
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          Approval: {approvalLabel(plan.approvalRequirement)}
        </span>
        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-200">
          What-if only
        </span>
        <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 text-slate-300">
          No execution
        </span>
      </div>

      <details className="group mt-4 border-t border-white/10 pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-cyan-300 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/70">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            >
              ▶
            </span>
            Score breakdown
          </span>
        </summary>
        <CriterionBreakdown scores={plan.criterionScores} />
      </details>

      <details className="group mt-3 border-t border-white/10 pt-3">
        <summary className="cursor-pointer list-none text-xs font-semibold text-teal-300 outline-none hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-400/70">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="transition-transform group-open:rotate-90"
            >
              ▶
            </span>
            Before / after projection
          </span>
        </summary>
        <ProjectionDetails projection={projection} />
      </details>
    </article>
  );
}

function BlockedAlternative({
  evaluation,
}: {
  evaluation: GuardEvaluation;
}) {
  const candidate = evaluation.candidatePlan;
  return (
    <article className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-200">
            {candidate.targetLabel}
          </p>
          <p className="text-[11px] text-slate-500">
            {sentenceCase(candidate.action)} ·{" "}
            {sentenceCase(candidate.targetClusterType)}
          </p>
        </div>
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
          {sentenceCase(evaluation.status)}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-red-100/90">
        {evaluation.violations.map((violation) => (
          <li key={violation.id}>
            <span className="font-semibold">
              {sentenceCase(violation.code)}:
            </span>{" "}
            {violation.reason}
          </li>
        ))}
      </ul>
    </article>
  );
}

function RiskSignal({ signal }: { signal: RiskInterpretation }) {
  return (
    <article className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-200">
            {entityLabel(signal.sourceEntityId)}
          </p>
          <p className="mt-1 text-xs text-amber-200">
            Time to failure:{" "}
            <span className="font-semibold">
              {TIME_TO_FAILURE_LABELS[signal.timeToFailureBand]}
            </span>
            {signal.predictedTimeToFailureSeconds === null
              ? ""
              : ` · ${formatDuration(signal.predictedTimeToFailureSeconds)}`}
          </p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-1 text-[10px] text-slate-300">
          {formatPercent(signal.confidence)} confidence
        </span>
      </div>
      <div className="mt-3 text-xs leading-5">
        <p className="text-slate-500">Dependency cascade</p>
        <p className="text-slate-300">
          {signal.dependencyCascadePath.length > 0
            ? signal.dependencyCascadePath.map(entityLabel).join(" → ")
            : "No modeled dependency cascade"}
        </p>
        <p className="mt-2 text-slate-500">Affected infrastructure</p>
        <p className="text-slate-300">
          {signal.affectedEntityIds.length > 0
            ? signal.affectedEntityIds.map(entityLabel).join(", ")
            : "No additional entities"}
        </p>
      </div>
      {signal.evidence.length > 0 ? (
        <details className="group mt-3 border-t border-white/10 pt-2">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-amber-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-90"
              >
                ▶
              </span>
              Risk evidence
            </span>
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-400">
            {signal.evidence.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">{signal.boundary}</p>
        </details>
      ) : null}
    </article>
  );
}

export default function GuardRulerDecisionEngine({
  refreshNonce = 0,
}: GuardRulerDecisionEngineProps) {
  const [snapshot, setSnapshot] =
    useState<GuardRulerStateApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const evaluationPendingRef = useRef(false);

  const fetchGuardRulerState = useCallback(async () => {
    if (evaluationPendingRef.current) return;

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/guard-ruler/state", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await parseJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to load the Guard–Ruler evaluation.")
        );
      }
      if (!isGuardRulerStateApiResponse(payload)) {
        throw new Error("Guard–Ruler state returned an invalid response.");
      }
      if (requestSequence !== requestSequenceRef.current) return;
      setSnapshot(payload);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }
      if (requestSequence !== requestSequenceRef.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load the Guard–Ruler evaluation."
      );
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        requestControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchGuardRulerState();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchGuardRulerState, refreshNonce]);

  useEffect(() => {
    return () => {
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
    };
  }, []);

  const evaluateSafePlans = async () => {
    if (evaluationPendingRef.current) return;

    evaluationPendingRef.current = true;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setIsLoading(false);
    setIsEvaluating(true);
    setError(null);

    try {
      const response = await fetch("/api/guard-ruler/evaluate", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
      const payload = await parseJsonSafely(response);
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "Unable to evaluate safe plans.")
        );
      }
      if (!isGuardRulerStateApiResponse(payload)) {
        throw new Error(
          "Guard–Ruler evaluation returned an invalid response."
        );
      }
      if (requestSequence !== requestSequenceRef.current) return;
      setSnapshot(payload);
    } catch (requestError) {
      if (
        requestError instanceof DOMException &&
        requestError.name === "AbortError"
      ) {
        return;
      }
      if (requestSequence !== requestSequenceRef.current) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to evaluate safe plans."
      );
    } finally {
      evaluationPendingRef.current = false;
      if (requestSequence === requestSequenceRef.current) {
        requestControllerRef.current = null;
        setIsEvaluating(false);
      }
    }
  };

  const guardReasons = snapshot
    ? [
        ...new Set([
          ...snapshot.guardSummary.reasons,
          ...snapshot.evaluation.explanation.guardReasons,
          ...snapshot.blockedAlternatives.flatMap((alternative) =>
            alternative.violations.map((violation) => violation.reason)
          ),
        ]),
      ]
    : [];
  const plans = snapshot
    ? [snapshot.planA, snapshot.planB, snapshot.planC].filter(
        (plan): plan is RankedPlan => plan !== null
      )
    : [];
  const hasStateVersionDrift =
    snapshot !== null &&
    snapshot.evaluatedStateVersion !== snapshot.currentStateVersion;
  const noSafeRoute = snapshot?.evaluation.status === "no-safe-route";

  return (
    <section
      aria-labelledby="guard-ruler-title"
      className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-slate-950/20 to-teal-500/5 p-4 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-400">
            Guard hard constraints · Ruler transparent ranking
          </p>
          <h3
            id="guard-ruler-title"
            className="mt-1 text-lg font-semibold text-slate-100"
          >
            Guard–Ruler Decision Engine
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Guard blocks unsafe infrastructure routes before Ruler scores safe
            alternatives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && snapshot ? (
            <span role="status" className="text-xs text-slate-500">
              Refreshing...
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void evaluateSafePlans()}
            disabled={isEvaluating}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEvaluating ? "Evaluating Safe Plans..." : "Evaluate Safe Plans"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">
          Infrastructure Decision Support Only
        </span>
        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-purple-200">
          What-if Simulation
        </span>
        <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2.5 py-1 text-slate-300">
          No Automatic Execution
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 ${
            snapshot === null
              ? "border-white/10 bg-white/5 text-slate-400"
              : snapshot.approvalRequirement.required
                ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {snapshot === null
            ? "Approval Status Loading"
            : snapshot.approvalRequirement.manualReviewRequired
              ? "Manual Review Required"
              : snapshot.approvalRequirement.required
              ? "Human Approval Required"
              : "Human Approval Not Required"}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}{" "}
          {snapshot
            ? "The last valid canonical evaluation remains displayed."
            : ""}
        </p>
      ) : null}

      {isLoading && snapshot === null ? (
        <div
          role="status"
          className="mt-4 rounded-lg border border-white/10 bg-slate-950/35 px-4 py-8 text-center text-sm text-slate-400"
        >
          Loading canonical Guard–Ruler state...
        </div>
      ) : snapshot ? (
        <>
          {hasStateVersionDrift ? (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {snapshot.decisionStatus === "approved" ||
              snapshot.decisionStatus === "rejected"
                ? `A final ${sentenceCase(snapshot.decisionStatus)} decision is recorded. This ranking remains the decision evidence evaluated at v${snapshot.evaluatedStateVersion}; reset or start a new scenario before creating another decision.`
                : `Canonical state is now v${snapshot.currentStateVersion}; this evaluation describes v${snapshot.evaluatedStateVersion}. Evaluate again before relying on its ranking.`}
            </p>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Guard status"
              value={
                snapshot.guardSummary.status === "passed"
                  ? "Passed"
                  : "No Safe Route"
              }
              valueClassName={
                snapshot.guardSummary.status === "passed"
                  ? "text-emerald-300"
                  : "text-red-300"
              }
            />
            <Metric
              label="Evaluated workload"
              value={snapshot.evaluation.workloadName}
              valueClassName="text-cyan-200"
            />
            <Metric
              label="Plan A"
              value={snapshot.planA?.candidatePlan.targetLabel ?? "None"}
              valueClassName={
                snapshot.planA ? "text-teal-200" : "text-red-300"
              }
            />
            <Metric
              label="Approval"
              value={approvalLabel(snapshot.approvalRequirement)}
              valueClassName={
                snapshot.approvalRequirement.required
                  ? "text-amber-200"
                  : "text-emerald-300"
              }
            />
            <Metric
              label="Decision status"
              value={sentenceCase(snapshot.decisionStatus)}
              valueClassName="text-purple-200"
            />
            <Metric
              label="Evaluated state"
              value={`v${snapshot.evaluatedStateVersion}`}
              valueClassName="text-slate-200"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/25 px-3 py-2 text-[11px] text-slate-500">
            <p>{snapshot.evaluation.explanation.summary}</p>
            <time
              dateTime={snapshot.evaluationTimestamp}
              title={snapshot.evaluationTimestamp}
              className="shrink-0 text-slate-400"
            >
              Evaluated {formatTimestamp(snapshot.evaluationTimestamp)}
            </time>
          </div>

          {noSafeRoute ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-semibold text-red-200">
                No safe route — no recommendation fabricated
              </p>
              <p className="mt-1 text-xs leading-5 text-red-100/80">
                All candidates failed Guard hard constraints. Manual review is
                required, and no automatic or physical action will be executed.
              </p>
            </div>
          ) : plans.length > 0 ? (
            <div className="mt-4 grid gap-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.candidatePlan.id}
                  plan={plan}
                  primary={plan.planLabel === "Plan A"}
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
              No ranked safe plan is currently available.
            </p>
          )}

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="blocked-alternatives-title">
              <div className="flex items-center justify-between gap-3">
                <h4
                  id="blocked-alternatives-title"
                  className="text-sm font-semibold text-red-200"
                >
                  Blocked alternatives
                </h4>
                <span className="text-xs text-slate-500">
                  {snapshot.blockedAlternatives.length}
                </span>
              </div>
              {snapshot.blockedAlternatives.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {snapshot.blockedAlternatives.map((alternative) => (
                    <BlockedAlternative
                      key={alternative.candidatePlan.id}
                      evaluation={alternative}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-400">
                  No candidate was blocked by Guard.
                </p>
              )}
            </section>

            <section aria-labelledby="risk-signals-title">
              <div className="flex items-center justify-between gap-3">
                <h4
                  id="risk-signals-title"
                  className="text-sm font-semibold text-amber-200"
                >
                  Time-to-failure & cascade signals
                </h4>
                <span className="text-xs text-slate-500">
                  {snapshot.evaluation.riskInterpretations.length}
                </span>
              </div>
              {snapshot.evaluation.riskInterpretations.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {snapshot.evaluation.riskInterpretations.map((signal) => (
                    <RiskSignal key={signal.id} signal={signal} />
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs text-slate-400">
                  No deterministic time-to-failure signal is present.
                </p>
              )}
            </section>
          </div>

          <details className="group mt-4 rounded-lg border border-white/10 bg-slate-950/30 p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-cyan-300 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/70">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-90"
                >
                  ▶
                </span>
                Guard reasons ({guardReasons.length})
              </span>
            </summary>
            <div className="mt-3">
              {guardReasons.length > 0 ? (
                <ul className="space-y-1.5 text-xs leading-5 text-slate-300">
                  {guardReasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">
                  All evaluated hard constraints passed.
                </p>
              )}
              {snapshot.approvalRequirement.reasons.length > 0 ? (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                    Approval requirement
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-slate-400">
                    {snapshot.approvalRequirement.reasons.map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </details>

          <div className="mt-4 border-t border-white/10 pt-3 text-[11px] leading-5 text-slate-500">
            <p>{snapshot.evaluation.explanation.projectionBoundary}</p>
            <p>{snapshot.evaluation.explanation.decisionSupportDisclaimer}</p>
            <p className="mt-1 font-medium text-amber-300">
              PHI-Zero · Synthetic/de-identified compute telemetry · No
              diagnosis, treatment recommendation, patient identity, migration,
              or actuator execution.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-400">
          No canonical Guard–Ruler evaluation is available.
        </div>
      )}
    </section>
  );
}
