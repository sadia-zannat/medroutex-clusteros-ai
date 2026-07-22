/**
 * Twin Core State Store
 * 
 * This module provides a simple in-memory store for the Operational Twin state.
 * All state updates use immutable replacement patterns.
 */

import {
  type OperationalTwinState,
  type TwinApprovalAuditEvent,
  type TwinApprovalDecision,
  type TwinApprovalRecord,
} from "./types";
import { createInitialOperationalTwinState, applyCrisisScenario } from "./seed";

const MEDROUTEX_CRISIS_SCENARIO_ID = "medroutex-stroke-crisis";
const MEDROUTEX_CRISIS_RECOMMENDATION_ID = "rec-workload-stroke-ct-001-0";
const MEDROUTEX_CRISIS_TARGET_GPU_ID = "gpu-central-7";
const DETERMINISTIC_APPROVAL_TIMESTAMP = "2024-01-15T10:33:00.000Z";

export interface ApprovalDecisionInput {
  decision: TwinApprovalDecision;
  operatorName: string;
  operatorRole: string;
  recommendationId: string;
}

export type ApprovalDecisionOutcome = "applied" | "idempotent";

export interface ApprovalDecisionResult {
  outcome: ApprovalDecisionOutcome;
  state: OperationalTwinState;
  approval: TwinApprovalRecord;
  auditEvent: TwinApprovalAuditEvent;
}

export type ApprovalDecisionErrorCode =
  | "NO_ACTIVE_SIMULATION"
  | "RECOMMENDATION_MISMATCH"
  | "SIMULATION_NOT_AWAITING_APPROVAL"
  | "DECISION_CONFLICT"
  | "APPROVAL_AUDIT_MISSING";

export class ApprovalDecisionError extends Error {
  constructor(
    public readonly code: ApprovalDecisionErrorCode,
    message: string,
    public readonly currentDecision?: TwinApprovalDecision
  ) {
    super(message);
    this.name = "ApprovalDecisionError";
  }
}

/**
 * Module-level in-memory state storage
 */
let operationalTwinState: OperationalTwinState | null = null;

/**
 * Get the current operational twin state
 * Lazily initializes state using createInitialOperationalTwinState() if not already set
 */
export function getOperationalTwinState(): OperationalTwinState {
  if (operationalTwinState === null) {
    operationalTwinState = createInitialOperationalTwinState();
  }
  return operationalTwinState;
}

/**
 * Reset the operational twin state to a fresh initial state
 * Replaces the entire state with a new initial state
 */
export function resetOperationalTwinState(): OperationalTwinState {
  operationalTwinState = createInitialOperationalTwinState();
  return operationalTwinState;
}

/**
 * Replace the entire operational twin state with a new state
 * Does not mutate the previous object
 */
export function replaceOperationalTwinState(
  nextState: OperationalTwinState
): OperationalTwinState {
  operationalTwinState = nextState;
  return operationalTwinState;
}

/**
 * Get a summary of the operational twin state
 */
export function getOperationalTwinSummary() {
  const state = getOperationalTwinState();
  return {
    twinId: state.twinId,
    hospitalId: state.hospitalId,
    hospitalName: state.hospitalName,
    version: state.version,
    overallStatus: state.overallStatus,
    overallHealthScore: state.overallHealthScore,
    overallRiskScore: state.overallRiskScore,
    entityCount: state.entities.length,
    relationshipCount: state.relationships.length,
    latestTelemetryCount: state.latestTelemetry.length,
    lastSynchronizedAt: state.lastSynchronizedAt,
    simulationOnly: state.simulationOnly,
  };
}

/**
 * Apply the MedRouteX demo crisis scenario to the operational twin state
 * Replaces the entire state with the crisis scenario applied
 */
export function applyCrisisScenarioToState(): OperationalTwinState {
  const currentState = getOperationalTwinState();
  operationalTwinState = applyCrisisScenario(currentState);
  return operationalTwinState;
}

/**
 * Apply an operator decision to the current MedRouteX crisis recommendation.
 * The transition records approval evidence but does not execute migration or recovery.
 */
export function applyApprovalDecision(
  input: ApprovalDecisionInput
): ApprovalDecisionResult {
  const currentState = getOperationalTwinState();
  const activeSimulation = currentState.activeSimulation;

  if (activeSimulation === null) {
    throw new ApprovalDecisionError(
      "NO_ACTIVE_SIMULATION",
      "No active simulation is available for approval."
    );
  }

  const isCurrentCrisisRecommendation =
    activeSimulation.scenarioId === MEDROUTEX_CRISIS_SCENARIO_ID &&
    activeSimulation.recommendationId === MEDROUTEX_CRISIS_RECOMMENDATION_ID &&
    activeSimulation.recommendationId === input.recommendationId &&
    activeSimulation.recommendedTargetGpuId === MEDROUTEX_CRISIS_TARGET_GPU_ID;

  if (!isCurrentCrisisRecommendation) {
    throw new ApprovalDecisionError(
      "RECOMMENDATION_MISMATCH",
      "The decision does not refer to the current MedRouteX crisis recommendation."
    );
  }

  if (activeSimulation.approval !== null) {
    if (activeSimulation.approval.decision !== input.decision) {
      throw new ApprovalDecisionError(
        "DECISION_CONFLICT",
        "The current recommendation already has the opposite final decision.",
        activeSimulation.approval.decision
      );
    }

    const existingAuditEvent = currentState.approvalAuditEvents.find(
      (event) =>
        event.simulationId === activeSimulation.id &&
        event.recommendationId === input.recommendationId &&
        event.decision === input.decision
    );

    if (!existingAuditEvent) {
      throw new ApprovalDecisionError(
        "APPROVAL_AUDIT_MISSING",
        "The final approval decision is missing its canonical audit evidence."
      );
    }

    return {
      outcome: "idempotent",
      state: currentState,
      approval: activeSimulation.approval,
      auditEvent: existingAuditEvent,
    };
  }

  if (activeSimulation.status !== "awaiting-approval") {
    throw new ApprovalDecisionError(
      "SIMULATION_NOT_AWAITING_APPROVAL",
      "The active simulation is not awaiting approval."
    );
  }

  const approval: TwinApprovalRecord = {
    decision: input.decision,
    satisfied: input.decision === "approve",
    recommendationId: input.recommendationId,
    targetGpuId: MEDROUTEX_CRISIS_TARGET_GPU_ID,
    operatorName: input.operatorName,
    operatorRole: input.operatorRole,
    decidedAt: DETERMINISTIC_APPROVAL_TIMESTAMP,
    simulationOnly: true,
  };

  const auditEvent: TwinApprovalAuditEvent = {
    id: `audit-${activeSimulation.id}-${input.recommendationId}-${input.decision}`,
    eventType: "human-approval-decision",
    decision: input.decision,
    simulationId: activeSimulation.id,
    recommendationId: input.recommendationId,
    targetGpuId: MEDROUTEX_CRISIS_TARGET_GPU_ID,
    operatorName: input.operatorName,
    operatorRole: input.operatorRole,
    timestamp: DETERMINISTIC_APPROVAL_TIMESTAMP,
    simulationOnly: true,
  };

  operationalTwinState = {
    ...currentState,
    version: currentState.version + 1,
    lastSynchronizedAt: DETERMINISTIC_APPROVAL_TIMESTAMP,
    activeSimulation: {
      ...activeSimulation,
      status: input.decision === "approve" ? "approved" : "rejected",
      approvalSatisfied: approval.satisfied,
      approval,
    },
    approvalAuditEvents: [...currentState.approvalAuditEvents, auditEvent],
  };

  return {
    outcome: "applied",
    state: operationalTwinState,
    approval,
    auditEvent,
  };
}
