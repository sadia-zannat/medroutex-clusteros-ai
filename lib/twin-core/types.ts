/**
 * Canonical Hospital Operational Twin contracts.
 *
 * These types model infrastructure operations only. They never contain patient
 * identities, diagnosis data, or bedside treatment recommendations.
 */

import type {
  ClusterType,
  PrivacyPolicy,
  WorkloadPriority,
} from "../medroutex/types";

export type TwinEntityType =
  | "hospital"
  | "zone"
  | "icu-unit"
  | "capacity"
  | "ventilator-aggregate"
  | "oxygen-tank"
  | "oxygen-reserve-bank"
  | "oxygen-pipeline"
  | "power-grid"
  | "ups"
  | "generator"
  | "critical-circuit"
  | "network-link"
  | "compute-node"
  | "workload"
  | "medical-device"
  | "sensor"
  | "external-service";

export type TwinOperationalStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "recovering"
  | "offline"
  | "unknown";

export type HospitalOperationalStatus =
  | "operational"
  | "degraded"
  | "critical"
  | "offline";

export type HospitalTelemetrySource =
  | "live-hardware"
  | "live-synthetic"
  | "emulated"
  | "recorded-demo"
  | "derived";

export type HospitalTelemetryQuality =
  | "good"
  | "degraded"
  | "stale"
  | "offline"
  | "unknown";

export type TwinDataSourceType = HospitalTelemetrySource;
export type TwinDataQualityStatus = HospitalTelemetryQuality;
export type TelemetryValue = number | string | boolean | null;

export interface TwinTelemetryPoint {
  id: string;
  entityId: string;
  metric: string;
  value: TelemetryValue;
  unit?: string;
  timestamp: string;
  source: HospitalTelemetrySource;
  provider: string;
  quality: HospitalTelemetryQuality;
  confidence: number;
  staleAfterSeconds: number;
  isStale: boolean;
}

export interface TwinEntity {
  id: string;
  name: string;
  entityType: TwinEntityType;
  zoneId?: string;
  parentEntityId?: string;
  status: TwinOperationalStatus;
  healthScore: number;
  riskScore: number;
  lastUpdated: string;
  lastHeartbeatAt?: string;
  sourceTypes: HospitalTelemetrySource[];
  attributes: Record<string, TelemetryValue>;
  tags: string[];
  isStale: boolean;
  isSimulationOnly: boolean;
}

export type TwinRelationshipType =
  | "contains"
  | "depends-on"
  | "supplies"
  | "powers"
  | "connects-to"
  | "monitors"
  | "routes-to"
  | "backs-up"
  | "uses";

export interface TwinRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: TwinRelationshipType;
  criticality: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface ComputeDomainState {
  operationalStatus: HospitalOperationalStatus;
  healthScore: number;
  totalGpus: number;
  riskyGpus: number;
  workloadCount: number;
  sourceLabel: "Synthetic GPU Telemetry";
}

export interface IcuDomainState {
  operationalStatus: HospitalOperationalStatus;
  totalBeds: number;
  occupiedBeds: number;
  criticalBeds: number;
  ventilatorsAvailable: number;
  ventilatorsInUse: number;
  devicesOffline: number;
  oxygenDemandLitersPerMinute: number;
  sourceLabel: "Emulated Hospital Telemetry";
}

export interface OxygenDomainState {
  operationalStatus: HospitalOperationalStatus;
  mainTankPercent: number;
  pipelinePressureBar: number;
  currentDemandLitersPerMinute: number;
  reserveCylinderCount: number;
  reserveBankStatus: HospitalOperationalStatus;
  refillEtaMinutes: number;
  estimatedMinutesToDepletion: number;
  leakAnomalyRisk: number;
  sourceLabel: "Emulated Hospital Telemetry";
}

export interface PowerDomainState {
  operationalStatus: HospitalOperationalStatus;
  gridStatus: HospitalOperationalStatus;
  totalLoadKw: number;
  criticalLoadKw: number;
  upsPercent: number;
  upsRuntimeMinutes: number;
  generatorStatus: "standby" | "running" | "offline";
  generatorFuelPercent: number;
  oxygenPlantPowerStatus: HospitalOperationalStatus;
  icuPowerStatus: HospitalOperationalStatus;
  gpuDataCenterPowerStatus: HospitalOperationalStatus;
  sourceLabel: "Emulated Hospital Telemetry";
}

export interface NetworkDomainState {
  operationalStatus: HospitalOperationalStatus;
  localLinkStatus: HospitalOperationalStatus;
  centralLinkStatus: HospitalOperationalStatus;
  cloudLinkStatus: HospitalOperationalStatus;
  centralLatencyMs: number;
  packetLossPercent: number;
  heartbeatTimestamp: string;
  sourceLabel: "Emulated Hospital Telemetry";
}

export interface HospitalDomainState {
  compute: ComputeDomainState;
  icu: IcuDomainState;
  oxygen: OxygenDomainState;
  power: PowerDomainState;
  network: NetworkDomainState;
}

export interface HospitalResilienceSummary {
  overallHospitalStatus: HospitalOperationalStatus;
  resilienceScore: number;
  computeScore: number;
  icuContinuityScore: number;
  oxygenContinuityScore: number;
  powerContinuityScore: number;
  networkContinuityScore: number;
  staleSourceCount: number;
  offlineSourceCount: number;
  criticalDependencyCount: number;
  formula: string;
  modelBoundary: string;
}

export type HospitalSnapshotTrigger =
  | "baseline"
  | "synchronization"
  | "scenario"
  | "decision";

export interface HospitalDomainScoreSummary {
  compute: number;
  icu: number;
  oxygen: number;
  power: number;
  network: number;
}

export interface TwinSnapshot {
  id: string;
  timestamp: string;
  stateVersion: number;
  trigger: HospitalSnapshotTrigger;
  overallStatus: HospitalOperationalStatus;
  resilienceScore: number;
  healthScore: number;
  domainSummaries: HospitalDomainScoreSummary;
  activeSimulationStatus: TwinScenarioStatus | null;
  simulationOnly: true;
}

export interface HospitalSynchronizationMetadata {
  id: string;
  timestamp: string;
  providers: string[];
  acceptedTelemetryPoints: number;
  rejectedTelemetryPoints: number;
  failedProviders: string[];
  staleSourceCount: number;
  offlineSourceCount: number;
  status: "synchronized" | "partial" | "failed";
}

export interface HospitalSynchronizationSummary
  extends HospitalSynchronizationMetadata {
  previousVersion: number;
  stateVersion: number;
  snapshotId: string;
  validationErrors: string[];
}

export type OperationalEventSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical"
  | "action-required";

export type OperationalEventDomain =
  | "compute"
  | "icu"
  | "oxygen"
  | "power"
  | "network"
  | "privacy"
  | "approval"
  | "simulation"
  | "synchronization"
  | "connector"
  | "recovery"
  | "system";

export type OperationalEventCategory =
  | "telemetry"
  | "risk"
  | "prediction"
  | "incident"
  | "scenario"
  | "guard-decision"
  | "plan"
  | "approval"
  | "audit"
  | "synchronization"
  | "connector"
  | "recovery"
  | "email-delivery"
  | "system";

export type OperationalEventType =
  | "baseline-reset"
  | "scenario-started"
  | "crisis-summary"
  | "guard-evaluation-completed"
  | "plan-set-ranked"
  | "gpu-critical-risk"
  | "gpu-overheating"
  | "gpu-memory-overload"
  | "gpu-offline"
  | "no-safe-route"
  | "critical-deadline-risk"
  | "cluster-overload"
  | "telemetry-stale"
  | "telemetry-offline"
  | "icu-capacity-critical"
  | "icu-device-availability-critical"
  | "icu-dependency-assessment"
  | "icu-recommendation-prepared"
  | "oxygen-warning"
  | "oxygen-critical"
  | "oxygen-action-required"
  | "oxygen-recovered"
  | "grid-failure"
  | "ups-runtime-low"
  | "generator-failure"
  | "critical-circuit-failure"
  | "network-link-offline"
  | "network-quality-critical"
  | "privacy-route-blocked"
  | "guard-blocked"
  | "route-selected"
  | "human-approval-required"
  | "decision-approved"
  | "decision-rejected"
  | "decision-conflict"
  | "manual-review-required"
  | "twin-synchronized"
  | "synchronization-failed"
  | "connector-failed"
  | "recovery-started"
  | "recovery-completed"
  | "email-delivery-failed"
  | "system-event";

export type OperationalEventStatus =
  | "active"
  | "resolved"
  | "completed"
  | "blocked"
  | "failed"
  | "informational";

export type OperationalSourceLabel =
  | "Synthetic GPU Telemetry"
  | "Emulated Hospital Telemetry"
  | "MedRouteX Operational Twin"
  | "MedRouteX Hospital Twin"
  | "MedRouteX Notification Service"
  | "Resend HTTP Email Provider"
  | "Email Alerts Disabled"
  | "Live Local Hardware Telemetry";

export type OperationalRole =
  | "Radiology Operator"
  | "Hospital Administrator"
  | "Infrastructure Engineer"
  | "ICU Operations"
  | "Security/Privacy Officer";

export interface OperationalEvent {
  id: string;
  eventType: OperationalEventType;
  category: OperationalEventCategory;
  domain: OperationalEventDomain;
  severity: OperationalEventSeverity;
  status: OperationalEventStatus;
  title: string;
  message: string;
  reason: string;
  timestamp: string;
  sourceEntityIds: string[];
  scenarioId?: string;
  simulationId?: string;
  recommendationId?: string;
  operatorName?: string;
  operatorRole?: OperationalRole;
  correlationId: string;
  dedupeKey: string;
  simulationOnly: true;
  source: OperationalSourceLabel;
  metadata: Record<string, unknown>;
  stateVersion: number;
}

export type EmailDeliveryStatus =
  | "sent"
  | "failed"
  | "disabled"
  | "not-configured"
  | "suppressed";

export type EmailChannelStatus =
  | "configured"
  | "disabled"
  | "not-configured"
  | "failed";

/**
 * Notification condition lifecycle is intentionally independent from
 * acknowledgement/read state. A resolved notification may remain unread
 * until an operator acknowledges it.
 */
export type OperationalNotificationLifecycleStatus =
  | "active"
  | "resolved";

export interface OperationalNotification {
  id: string;
  eventId: string;
  eventType: OperationalEventType;
  category: OperationalEventCategory;
  domain: OperationalEventDomain;
  severity: OperationalEventSeverity;
  title: string;
  message: string;
  reason: string;
  explanation: string;
  timestamp: string;
  sourceEntityIds: string[];
  targetRoles: OperationalRole[];
  correlationId: string;
  dedupeKey: string;
  cooldownSeconds: number;
  emailEligible: boolean;
  emailDeliveryStatus?: EmailDeliveryStatus;
  lifecycleStatus: OperationalNotificationLifecycleStatus;
  lifecycleUpdatedAt: string;
  lifecycleStateVersion: number;
  resolvedAt?: string;
  resolvedByEventId?: string;
  resolutionReason?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  acknowledgedRole?: OperationalRole;
  simulationOnly: true;
  source: OperationalSourceLabel;
  metadata: Record<string, unknown>;
  stateVersion: number;
}

export interface EmailDeliveryRecord {
  id: string;
  kind: "operational-alert" | "configuration-test";
  eventId?: string;
  notificationId?: string;
  status: EmailDeliveryStatus;
  provider: "resend-http" | "disabled";
  providerMessageId?: string;
  attemptedAt: string;
  completedAt: string;
  recipientRoles: OperationalRole[];
  recipientCount: number;
  subject: string;
  reason: string;
  correlationId: string;
  dedupeKey: string;
  simulationOnly: true;
  source: OperationalSourceLabel;
  stateVersion: number;
}

export interface OperationalIncident {
  id: string;
  domain: OperationalEventDomain;
  severity: Extract<
    OperationalEventSeverity,
    "warning" | "critical" | "action-required"
  >;
  title: string;
  status: "active";
  openedAt: string;
  updatedAt: string;
  correlationId: string;
  sourceEntityIds: string[];
  affectedZones: string[];
  reason: string;
  simulationOnly: true;
}

export interface OxygenAlertLifecycleState {
  activeIncidentId: string | null;
  correlationId: string | null;
  activeSeverity: Extract<
    OperationalEventSeverity,
    "warning" | "critical" | "action-required"
  > | null;
  incidentSequence: number;
  recoveryConfirmationCycles: number;
  lastEvaluatedAt: string | null;
  lastEvaluationFingerprint: string | null;
}

export type DecisionEvaluationProfile =
  | "canonical"
  | "no-safe-route-test";

export type DecisionStatus =
  | "not-required"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "manual-review-required";

export type CandidatePlanAction =
  | "keep"
  | "migrate"
  | "queue"
  | "delay"
  | "pause"
  | "drop"
  | "degraded-mode"
  | "manual-review";

export type DecisionEvidenceValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[];

export interface DecisionContext {
  evaluationKey: string;
  evaluationProfile: DecisionEvaluationProfile;
  evaluatedStateVersion: number;
  scenarioId: string | null;
  workload: Pick<
    TwinEntity,
    "id" | "name" | "entityType" | "attributes" | "tags"
  >;
  workloadPriority: WorkloadPriority;
  privacyPolicy: PrivacyPolicy;
  deadlineSeconds: number;
  memoryRequiredMiB: number;
  computeRequiredPercent: number;
  sourceGpuEntityId: string | null;
  sourceGpuId: string | null;
  dependencies: HospitalDomainState;
  telemetrySource: "canonical-hospital-twin";
  telemetryTrustPolicy: string;
  decisionBoundary: string;
}

export interface CandidatePlan {
  id: string;
  recommendationId: string;
  workloadId: string;
  action: CandidatePlanAction;
  sourceGpuEntityId: string | null;
  sourceGpuId: string | null;
  targetGpuEntityId: string | null;
  targetGpuId: string | null;
  targetLabel: string;
  targetClusterType: ClusterType;
  predictedCompletionSeconds: number;
  deadlineSeconds: number;
  deadlineMarginSeconds: number;
  predictedTargetRiskPercent: number;
  targetHealthPercent: number;
  targetClusterHealthPercent: number;
  targetUtilizationPercent: number;
  targetMemoryUsedMiB: number;
  targetMemoryTotalMiB: number;
  memoryRequiredMiB: number;
  latencyMs: number;
  estimatedCostChangePercent: number;
  telemetryTrusted: boolean;
  telemetryConfidence: number;
  manualReviewOnly: boolean;
  lowerPriorityDelayPermitted: boolean;
  degradedModePermitted: boolean;
  requiresPowerContinuity: boolean;
  requiresNetworkContinuity: boolean;
  requiresIcuContinuity: boolean;
  requiresOxygenContinuity: boolean;
  evidence: Record<string, DecisionEvidenceValue>;
}

export type GuardRuleEffect = "block" | "require-approval";

export interface GuardRule {
  id:
    | "privacy"
    | "deadline-sla"
    | "compute-risk"
    | "clinical-infrastructure-priority"
    | "hospital-dependency-safety"
    | "human-approval";
  name: string;
  description: string;
  effect: GuardRuleEffect;
  evaluate(
    context: DecisionContext,
    candidate: CandidatePlan
  ): GuardViolation[];
  approvalReason?(
    context: DecisionContext,
    candidate: CandidatePlan
  ): string | null;
}

export interface GuardViolation {
  id: string;
  ruleId: GuardRule["id"];
  code:
    | "PRIVACY_POLICY_BLOCK"
    | "PHI_ZERO_CLOUD_BLOCK"
    | "CRITICAL_DEADLINE_MISS"
    | "GPU_OVERHEATING"
    | "GPU_MEMORY_OVERLOAD"
    | "GPU_RISK_EXCEEDS_LIMIT"
    | "GPU_OFFLINE"
    | "TELEMETRY_UNTRUSTED"
    | "INSUFFICIENT_MEMORY"
    | "INSUFFICIENT_CAPACITY"
    | "CRITICAL_WORKLOAD_INTERRUPTION"
    | "POWER_DEPENDENCY_UNAVAILABLE"
    | "NETWORK_DEPENDENCY_UNAVAILABLE"
    | "ICU_CONTINUITY_UNAVAILABLE"
    | "OXYGEN_CONTINUITY_UNAVAILABLE";
  severity: "blocked" | "manual-review-only";
  reason: string;
  evidence: Record<string, DecisionEvidenceValue>;
  affectedEntityIds: string[];
  estimatedCompletionSeconds?: number;
  deadlineSeconds?: number;
  deadlineMarginSeconds?: number;
  manualReviewRequired: boolean;
}

export type ApprovalLevel =
  | "none"
  | "authorized-operator"
  | "multidisciplinary-review";

export interface ApprovalRequirement {
  required: boolean;
  level: ApprovalLevel;
  reasons: string[];
  manualReviewRequired: boolean;
  blocksAutomaticExecution: true;
  approvalQueue: "existing-operational-twin-approval";
}

export interface GuardEvaluation {
  candidatePlan: CandidatePlan;
  status: "eligible" | "blocked" | "manual-review-only";
  eligibleForRanking: boolean;
  evaluatedRuleIds: GuardRule["id"][];
  passedRuleIds: GuardRule["id"][];
  violations: GuardViolation[];
  approvalRequirement: ApprovalRequirement;
}

export interface RulerCriterion {
  id:
    | "deadline-fit"
    | "infrastructure-health"
    | "latency"
    | "privacy-safety"
    | "cost"
    | "model-reliability";
  name: string;
  weightPercent: number;
  description: string;
}

export interface CriterionScore {
  criterionId: RulerCriterion["id"];
  criterionName: string;
  normalizedScore: number;
  weightPercent: number;
  weightedContribution: number;
  rawEvidence: Record<string, DecisionEvidenceValue>;
  explanation: string;
}

export type TimeToFailureBand =
  | "immediate"
  | "under-5-minutes"
  | "5-30-minutes"
  | "30-120-minutes"
  | "over-120-minutes"
  | "unknown";

export interface RiskInterpretation {
  id: string;
  sourceEntityId: string;
  predictedTimeToFailureSeconds: number | null;
  timeToFailureBand: TimeToFailureBand;
  dependencyCascadePath: string[];
  affectedEntityIds: string[];
  confidence: number;
  evidence: string[];
  boundary: string;
}

export interface RelevantDependencyProjection {
  power: HospitalOperationalStatus;
  network: HospitalOperationalStatus;
  icu: HospitalOperationalStatus | "not-relevant";
  oxygen: HospitalOperationalStatus | "not-relevant";
}

export interface PlanProjection {
  before: {
    workloadLocation: string | null;
    workloadSlaRisk: "low" | "moderate" | "high" | "critical" | "unknown";
    sourceGpuHealthPercent: number | null;
    targetGpuHealthPercent: number;
    clusterHealthPercent: number;
    riskyGpuCount: number;
    dependencies: RelevantDependencyProjection;
  };
  after: {
    projectedWorkloadLocation: string | null;
    projectedCompletionSeconds: number;
    projectedClusterHealthPercent: number;
    projectedRiskyGpuCount: number;
    expectedDowntimeSavedMinutes: number;
    expectedCostChangePercent: number;
    remainingRisks: string[];
    confidence: number;
  };
  whatIfOnly: true;
  canonicalTelemetryMutated: false;
}

export interface RankedPlan {
  rank: number;
  planLabel: "Plan A" | "Plan B" | "Plan C" | "Safe Alternative";
  candidatePlan: CandidatePlan;
  criterionScores: CriterionScore[];
  totalScore: number;
  confidence: number;
  projection: PlanProjection;
  approvalRequirement: ApprovalRequirement;
  explanation: string;
}

export interface PlanComparison {
  winnerPlanId: string | null;
  comparedPlanIds: string[];
  scoreDeltasFromWinner: Array<{
    planId: string;
    scoreDelta: number;
  }>;
  summary: string;
}

export interface PlanSet {
  status: "safe-plans-available" | "no-safe-route";
  planA: RankedPlan | null;
  planB: RankedPlan | null;
  planC: RankedPlan | null;
  rankedPlans: RankedPlan[];
  blockedAlternatives: GuardEvaluation[];
  comparison: PlanComparison;
}

export interface DecisionExplanation {
  summary: string;
  guardReasons: string[];
  rulerReasons: string[];
  projectionBoundary: string;
  decisionSupportDisclaimer: string;
  noAutomaticExecution: true;
}

export interface GuardSummary {
  evaluatedCandidateCount: number;
  eligibleCandidateCount: number;
  blockedCandidateCount: number;
  manualReviewOnlyCandidateCount: number;
  status: "passed" | "no-safe-route";
  reasons: string[];
}

export interface GuardRulerResult {
  id: string;
  evaluationKey: string;
  evaluationProfile: DecisionEvaluationProfile;
  evaluatedAt: string;
  evaluatedStateVersion: number;
  workloadId: string;
  workloadName: string;
  recommendationId: string | null;
  activeRecommendationId: string | null;
  status: "safe-plans-available" | "no-safe-route";
  decisionStatus: DecisionStatus;
  context: DecisionContext;
  candidates: CandidatePlan[];
  guardEvaluations: GuardEvaluation[];
  guardSummary: GuardSummary;
  rulerCriteria: RulerCriterion[];
  planSet: PlanSet;
  riskInterpretations: RiskInterpretation[];
  approvalRequirement: ApprovalRequirement;
  explanation: DecisionExplanation;
  manualReviewRequired: boolean;
  simulationOnly: true;
  noPhysicalExecution: true;
}

export interface GuardRulerStateApiResponse {
  success: true;
  outcome?: "applied" | "idempotent";
  evaluation: GuardRulerResult;
  planA: RankedPlan | null;
  planB: RankedPlan | null;
  planC: RankedPlan | null;
  blockedAlternatives: GuardEvaluation[];
  guardSummary: GuardSummary;
  rulerScoreBreakdown: CriterionScore[];
  approvalRequirement: ApprovalRequirement;
  decisionStatus: DecisionStatus;
  evaluationTimestamp: string;
  evaluatedStateVersion: number;
  currentStateVersion: number;
  metadata: {
    phiMode: "PHI-Zero";
    decisionSupportOnly: true;
    whatIfSimulation: true;
    automaticExecution: false;
    canonicalSource: "MedRouteX Hospital/Operational Twin";
  };
}

export type UnifiedHistoryKind =
  | "operational-event"
  | "notification"
  | "email-delivery"
  | "twin-snapshot"
  | "audit-event"
  | "incident"
  | "scenario-root-cause"
  | "cascade-path"
  | "response-plan";

export interface UnifiedHistoryRecord {
  id: string;
  sourceId: string;
  kind: UnifiedHistoryKind;
  timestamp: string;
  title: string;
  message: string;
  severity: OperationalEventSeverity;
  domain: OperationalEventDomain;
  category: OperationalEventCategory;
  status: string;
  source: string;
  simulationOnly: boolean;
  correlationId?: string;
  sourceEntityIds: string[];
  stateVersion: number;
  metadata: Record<string, unknown>;
}

export interface TelemetryProviderBatch {
  provider: string;
  source: HospitalTelemetrySource;
  collectedAt: string;
  points: TwinTelemetryPoint[];
}

export interface HospitalTelemetryProvider {
  readonly id: string;
  readonly source: HospitalTelemetrySource;
  collect(
    state: OperationalTwinState,
    timestamp: string
  ): TelemetryProviderBatch;
}

export type TwinScenarioStatus =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export type TwinApprovalDecision = "approve" | "reject";

export interface TwinApprovalRecord {
  decision: TwinApprovalDecision;
  satisfied: boolean;
  recommendationId: string;
  targetGpuId: string;
  operatorName: string;
  operatorRole: OperationalRole;
  decidedAt: string;
  simulationOnly: true;
}

export interface TwinApprovalAuditEvent {
  id: string;
  eventType: "human-approval-decision";
  decision: TwinApprovalDecision;
  simulationId: string;
  recommendationId: string;
  targetGpuId: string;
  operatorName: string;
  operatorRole: OperationalRole;
  timestamp: string;
  simulationOnly: true;
}

export interface TwinProjectedChange {
  entityId: string;
  metric: string;
  beforeValue: TelemetryValue;
  afterValue: TelemetryValue;
  explanation: string;
}

export interface TwinSimulationState {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: TwinScenarioStatus;
  startedAt: string;
  completedAt?: string;
  baselineSnapshotId: string;
  projectedChanges: TwinProjectedChange[];
  predictedRiskReductionPercent: number;
  predictedRecoveryMinutes: number;
  requiresHumanApproval: boolean;
  recommendationId: string;
  recommendedTargetGpuId: string;
  approvalSatisfied: boolean;
  approval: TwinApprovalRecord | null;
  simulationOnly: true;
  warnings: string[];
}

export interface OperationalTwinState {
  twinId: string;
  hospitalId: string;
  hospitalName: string;
  version: number;
  generatedAt: string;
  lastSynchronizedAt: string;
  entities: TwinEntity[];
  relationships: TwinRelationship[];
  latestTelemetry: TwinTelemetryPoint[];
  snapshots: TwinSnapshot[];
  approvalAuditEvents: TwinApprovalAuditEvent[];
  operationalEvents: OperationalEvent[];
  notifications: OperationalNotification[];
  emailDeliveries: EmailDeliveryRecord[];
  emailDeliverySequence: number;
  emailDeliveryReservations: string[];
  activeIncidents: OperationalIncident[];
  oxygenAlertLifecycle: OxygenAlertLifecycleState;
  activeSimulation: TwinSimulationState | null;
  latestGuardRulerEvaluation: GuardRulerResult | null;
  guardRulerEvaluationHistory: GuardRulerResult[];
  domains: HospitalDomainState;
  resilienceSummary: HospitalResilienceSummary;
  latestSynchronization: HospitalSynchronizationMetadata;
  overallStatus: TwinOperationalStatus;
  overallHealthScore: number;
  overallRiskScore: number;
  simulationOnly: boolean;
  clinicalDisclaimer: string;
  scenarioRuntime: ScenarioRuntimeState;
  liveHardwareGpu: LiveGpuTelemetry | null;
  persistence: PersistenceStatus;
}

export interface OperationalTwinSummary {
  twinId: string;
  hospitalId: string;
  hospitalName: string;
  version: number;
  overallStatus: TwinOperationalStatus;
  overallHealthScore: number;
  overallRiskScore: number;
  entityCount: number;
  relationshipCount: number;
  latestTelemetryCount: number;
  lastSynchronizedAt: string;
  simulationOnly: boolean;
}

export interface HospitalAuditSummary {
  eventCount: number;
  latestEvent: TwinApprovalAuditEvent | null;
}

export interface HospitalTwinApiResponse {
  success: true;
  data: OperationalTwinState;
  summary: OperationalTwinSummary;
  entityCount: number;
  relationshipCount: number;
  latestSynchronization: HospitalSynchronizationMetadata;
  resilienceSummary: HospitalResilienceSummary;
  activeSimulation: TwinSimulationState | null;
  auditSummary: HospitalAuditSummary;
  metadata: {
    phiMode: "PHI-Zero";
    hospitalTelemetryMode: "EMULATED HOSPITAL TELEMETRY";
    decisionSupportOnly: true;
    certifiedSafetyCalculation: false;
  };
}

export const INFRASTRUCTURE_CLINICAL_DISCLAIMER: string =
  "Infrastructure decision-support only. Not a diagnosis or bedside treatment system.";

export const RESILIENCE_MODEL_BOUNDARY: string =
  "Team Delta operational decision-support model. Not a certified hospital safety calculation.";

/**
 * Multi-domain hospital continuity scenario contracts.
 *
 * These contracts model infrastructure operations only. They never contain
 * patient identity, diagnosis, treatment recommendations, or actuator control.
 */

export type HospitalScenarioId =
  | "normal-operations"
  | "stroke-compute-crisis"
  | "icu-capacity-stress"
  | "oxygen-continuity-risk"
  | "power-continuity-failure"
  | "network-continuity-failure"
  | "hospital-cascade-crisis";

export type ScenarioDomain =
  | "compute"
  | "icu"
  | "oxygen"
  | "power"
  | "network"
  | "hospital-cascade";

export type ScenarioSeverity = "low" | "medium" | "high" | "critical";

export type ScenarioCategory =
  | "normal-operations"
  | "compute-crisis"
  | "capacity-stress"
  | "continuity-risk"
  | "infrastructure-failure"
  | "cascade-crisis";

export interface ScenarioContract {
  id: HospitalScenarioId;
  name: string;
  description: string;
  domain: ScenarioDomain;
  severity: ScenarioSeverity;
  category: ScenarioCategory;
  requiresHumanApproval: boolean;
  estimatedRecoveryMinutes: number | null;
  affectedDomains: readonly ScenarioDomain[];
  dependencies: readonly string[];
  warnings: readonly string[];
  executable: boolean;
  safetyLabel: "EMULATED HOSPITAL OPERATIONAL SCENARIO";
  metadata: {
    phase: 2;
    deterministic: true;
    patientData: false;
    diagnosis: false;
    actuatorExecution: false;
  };
}

export interface ScenarioCatalog {
  scenarios: readonly ScenarioContract[];
  version: string;
  lastUpdated: string;
  metadata: {
    totalScenarios: number;
    domains: readonly ScenarioDomain[];
    categories: readonly ScenarioCategory[];
    executableScenarioCount: number;
  };
}

export interface ScenarioState {
  activeScenarioId: HospitalScenarioId | null;
  activeScenarioName: string | null;
  activeScenarioStatus: TwinScenarioStatus | null;
  availableScenarios: readonly ScenarioContract[];
  canActivateScenario: boolean;
  lastScenarioTransitionAt: string | null;
  metadata: {
    phase: 2;
    readOnly: false;
    mutationImplemented: true;
  };
}

export interface ScenarioRootCause {
  id: string;
  scenarioId: HospitalScenarioId;
  entityId: string;
  domain: ScenarioDomain;
  severity: ScenarioSeverity;
  title: string;
  evidence: string[];
  timeToFailureSeconds: number | null;
  timeToFailureBand: TimeToFailureBand;
  confidence: number;
}

export interface CascadeNode {
  entityId: string;
  entityLabel: string;
  domain: ScenarioDomain;
  depth: number;
  impactSeverity: ScenarioSeverity;
  confidence: number;
  timeToImpactSeconds: number | null;
  timeToImpactBand: TimeToFailureBand;
  reason: string;
  viaRelationshipId: string | null;
}

export interface CascadePath {
  id: string;
  scenarioId: HospitalScenarioId;
  rootCauseId: string;
  rootEntityId: string;
  nodeEntityIds: string[];
  relationshipIds: string[];
  nodes: CascadeNode[];
  severity: ScenarioSeverity;
  confidence: number;
  timeToImpactSeconds: number | null;
  timeToImpactBand: TimeToFailureBand;
  explanation: string;
}

export interface DependencyImpact {
  id: string;
  scenarioId: HospitalScenarioId;
  sourceEntityId: string;
  affectedEntityId: string;
  relationshipId: string;
  relationshipType: TwinRelationshipType;
  severity: ScenarioSeverity;
  confidence: number;
  timeToImpactSeconds: number | null;
  explanation: string;
}

export interface DomainContinuityAssessment {
  domain: Exclude<ScenarioDomain, "hospital-cascade">;
  score: number;
  status: HospitalOperationalStatus;
  severity: ScenarioSeverity;
  evidence: string[];
  dependencyEntityIds: string[];
  timeToFailureSeconds: number | null;
  timeToFailureBand: TimeToFailureBand;
  confidence: number;
  sourceLabel:
    | "Synthetic GPU Telemetry"
    | "Emulated Hospital Telemetry"
    | "Live Local Hardware Telemetry";
}

export interface HospitalResponseAction {
  id: string;
  domain: ScenarioDomain;
  title: string;
  description: string;
  priority: "immediate" | "high" | "planned";
  requiresHumanApproval: boolean;
  policyPermitted: boolean;
  physicalExecutionPerformed: false;
}

export interface MultiDomainCandidatePlan {
  id: string;
  scenarioId: HospitalScenarioId;
  title: string;
  rank: 1 | 2 | 3 | null;
  status: "eligible" | "blocked" | "manual-review";
  score: number;
  confidence: number;
  guardReasons: string[];
  affectedDomains: ScenarioDomain[];
  recommendedActions: HospitalResponseAction[];
  actionsExplicitlyNotExecuted: string[];
  dependencyImpacts: DependencyImpact[];
  timeToFailureMitigated: TimeToFailureBand[];
  beforeResilienceScore: number;
  projectedResilienceScore: number;
  remainingRisks: string[];
  requiresHumanApproval: boolean;
  decisionSupportDisclaimer: string;
  evaluatedStateVersion: number;
  evaluatedAt: string;
}

export interface MultiDomainPlanSet {
  status: "plans-available" | "no-safe-plan";
  planA: MultiDomainCandidatePlan | null;
  planB: MultiDomainCandidatePlan | null;
  planC: MultiDomainCandidatePlan | null;
  rankedPlans: MultiDomainCandidatePlan[];
  blockedPlans: MultiDomainCandidatePlan[];
  scoringFormula: string;
  weights: {
    criticalServiceContinuity: 30;
    timeToFailureMitigation: 25;
    dependencyRiskReduction: 20;
    implementationLatency: 10;
    operationalReversibility: 10;
    approvalComplexity: 5;
  };
}

export interface ScenarioRecoveryState {
  status: "not-started" | "monitoring" | "recovering" | "recovered" | "failed";
  confirmationCycles: number;
  requiredConfirmationCycles: number;
  startedAt: string | null;
  recoveredAt: string | null;
  evidence: string[];
}

export interface ScenarioRuntimeState {
  activeScenarioId: HospitalScenarioId | null;
  scenarioStatus: TwinScenarioStatus | null;
  startedAt: string | null;
  lastTransitionAt: string | null;
  stateVersionStarted: number | null;
  affectedDomains: readonly ScenarioDomain[];
  severity: ScenarioSeverity | null;
  activeIncidentIds: readonly string[];
  rootCauseIds: readonly string[];
  transitionKey: string | null;
  executionCount: number;
  recoveryStatus: "not-recovering" | "recovering" | "recovered" | "failed";
  humanApprovalRequired: boolean;
  physicalExecutionPerformed: false;
  rootCauses: readonly ScenarioRootCause[];
  dependencyImpacts: readonly DependencyImpact[];
  cascadePaths: readonly CascadePath[];
  domainAssessments: readonly DomainContinuityAssessment[];
  multiDomainPlanSet: MultiDomainPlanSet | null;
  recovery: ScenarioRecoveryState;
  metadata: {
    phase: 2;
    deterministic: true;
    patientData: false;
    diagnosis: false;
    actuatorExecution: false;
  };
}

export interface ScenarioExecutionResult {
  success: boolean;
  outcome: "applied" | "idempotent" | "not-implemented" | "invalid-request";
  scenarioId: string;
  scenarioName: string;
  transitionKey: string;
  stateVersion: number;
  previousStateVersion: number;
  runtimeState: ScenarioRuntimeState;
  fullState?: OperationalTwinState;
  hospitalHealthScore: number;
  hospitalResilienceScore: number;
  domainScores: HospitalDomainScoreSummary;
  eventsCreated: number;
  notificationsCreated: number;
  incidentsCreated: number;
  snapshotCreated: boolean;
  humanApprovalRequired: boolean;
  physicalExecutionPerformed: false;
  error: string | null;
  metadata: {
    phase: 2;
    deterministic: true;
    sourceLabel: "MedRouteX Hospital Twin";
  };
}

export interface IcuContinuityAssessment {
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercentage: number;
  criticalBedDemand: number;
  ventilatorsAvailable: number;
  ventilatorsInUse: number;
  devicesOffline: number;
  oxygenDemandLitersPerMinute: number;
  continuityScore: number;
  status: HospitalOperationalStatus;
  affectedDomains: readonly ScenarioDomain[];
  affectedDependencies: readonly string[];
  evidence: readonly string[];
  confidence: number;
  sourceLabel: "Emulated Hospital Telemetry";
  emulated: true;
}

export interface IcuOperationalRecommendation {
  recommendationId: string;
  scenarioId: HospitalScenarioId;
  priority: "preserve-capacity" | "prioritize-resources" | "delay-workloads" | "review-maintenance" | "prepare-support";
  title: string;
  description: string;
  affectedDomains: readonly ScenarioDomain[];
  requiresHumanReview: boolean;
  infrastructureActions: readonly string[];
  medicalDisclaimer: string;
  sourceLabel: "MedRouteX Hospital Twin";
  emulated: true;
}

export interface LiveGpuTelemetry {
  connectionStatus: "connected" | "unavailable" | "error";
  collectedAt: string;
  provider: "nvidia-smi";
  sourceLabel: "Live Local Hardware Telemetry";
  quality: HospitalTelemetryQuality;
  gpuName: string | null;
  temperatureC: number | null;
  utilizationPercent: number | null;
  memoryUsedMiB: number | null;
  memoryTotalMiB: number | null;
  powerDrawWatts: number | null;
  error: string | null;
  simulationProtected: true;
}

export interface PersistenceStatus {
  mode: "memory-only" | "sqlite-local";
  databasePath: string | null;
  lastPersistedAt: string | null;
  lastRestoredAt: string | null;
  lastError: string | null;
}
