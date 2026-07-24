/**
 * Twin Core State Store
 * 
 * This module provides a simple in-memory store for the Operational Twin state.
 * All state updates use immutable replacement patterns.
 */

import {
  type OperationalTwinState,
  type OperationalTwinSummary,
  type HospitalSynchronizationSummary,
  type EmailDeliveryRecord,
  type GuardRulerResult,
  type DecisionEvaluationProfile,
  type OperationalEvent,
  type OperationalNotification,
  type OperationalRole,
  type TwinApprovalAuditEvent,
  type TwinApprovalDecision,
  type TwinApprovalRecord,
  type ScenarioState,
  type LiveGpuTelemetry,
} from "./types";
import { createInitialOperationalTwinState, INITIAL_SCENARIO_RUNTIME } from "./seed";
import { resetScenarioRuntime } from "./scenario-transitions";
import { executeScenarioTransition } from "./scenario-engine";
import { getScenarioCatalog } from "./scenario-catalog";
import {
  ExistingGpuTelemetryAdapter,
  SyntheticHospitalTelemetryProvider,
} from "./providers";
import { synchronizeHospitalTwin } from "./synchronization";
import { appendHospitalSnapshot } from "./resilience";
import {
  appendOperationalEvents,
  createBaselineResetEvent,
  createConnectorFailureEvents,
  createDecisionEvent,
  createEmailDeliveryFailureEvent,
  createSynchronizationFailureEvent,
  createSynchronizationEvent,
  MAX_EMAIL_DELIVERY_RECORDS,
} from "./operational-events";
import { evaluateOxygenTransition } from "./oxygen-transition";
import { evaluateOperationalTransitions } from "./transition-events";
import {
  applyOxygenDemoPreset,
  type OxygenDemoPreset,
} from "./oxygen-demo";
import {
  evaluateGuardRuler,
  type GuardRulerEvaluationOptions,
} from "../guard-ruler/engine";
import { createGuardRulerEvents } from "../guard-ruler/events";

const OPERATIONAL_TWIN_STATE_KEY = "__MEDROUTEX_OPERATIONAL_TWIN_STATE__" as const;
const MAX_GUARD_RULER_EVALUATION_HISTORY = 50;

type OperationalTwinGlobal = typeof globalThis & {
  [OPERATIONAL_TWIN_STATE_KEY]?: OperationalTwinState;
};

// TypeScript cannot infer this application-owned globalThis slot. This narrow
// bridge is safe because every read and write is contained in this module.
const operationalTwinGlobal = globalThis as OperationalTwinGlobal;

export interface ApprovalDecisionInput {
  decision: TwinApprovalDecision;
  operatorName: string;
  operatorRole: OperationalRole;
  recommendationId: string;
}

export type ApprovalDecisionOutcome = "applied" | "idempotent";

export interface ApprovalDecisionResult {
  outcome: ApprovalDecisionOutcome;
  state: OperationalTwinState;
  approval: TwinApprovalRecord;
  auditEvent: TwinApprovalAuditEvent;
  insertedNotifications: OperationalNotification[];
}

export interface HospitalSynchronizationResult {
  state: OperationalTwinState;
  summary: HospitalSynchronizationSummary;
  insertedNotifications: OperationalNotification[];
}

export interface NotificationAcknowledgementInput {
  notificationId?: string;
  acknowledgeAll?: true;
  operatorName: string;
  operatorRole: OperationalRole;
}

export interface NotificationAcknowledgementResult {
  state: OperationalTwinState;
  acknowledgedCount: number;
}

export interface GuardRulerEvaluationInput {
  workloadId?: string;
  recommendationId?: string;
  evaluationProfile?: DecisionEvaluationProfile;
}

export interface GuardRulerEvaluationResult {
  outcome: "applied" | "idempotent";
  state: OperationalTwinState;
  evaluation: GuardRulerResult;
  insertedNotifications: OperationalNotification[];
}

function alignGuardRulerNotificationLifecycle(
  state: OperationalTwinState,
  evaluation: GuardRulerResult
): OperationalTwinState {
  let changed = false;
  const resolvingEventId =
    state.operationalEvents.find(
      (event) =>
        event.eventType === "plan-set-ranked" &&
        event.metadata.evaluationKey === evaluation.evaluationKey
    )?.id ?? `event-${evaluation.id}-plan-set-ranked`;
  const notifications = state.notifications.map((notification) => {
    if (notification.eventType !== "no-safe-route") {
      return notification;
    }

    if (
      evaluation.status === "safe-plans-available" &&
      notification.lifecycleStatus === "active" &&
      notification.sourceEntityIds.includes(evaluation.workloadId)
    ) {
      changed = true;
      return {
        ...notification,
        lifecycleStatus: "resolved" as const,
        lifecycleUpdatedAt: evaluation.evaluatedAt,
        lifecycleStateVersion: state.version,
        resolvedAt: evaluation.evaluatedAt,
        resolvedByEventId: resolvingEventId,
        resolutionReason:
          "A later Guard evaluation found at least one safe, rankable route for this workload.",
      };
    }

    if (
      evaluation.status === "no-safe-route" &&
      notification.lifecycleStatus === "resolved" &&
      notification.metadata.evaluationKey === evaluation.evaluationKey
    ) {
      changed = true;
      const reactivatedNotification = { ...notification };
      delete reactivatedNotification.resolvedAt;
      delete reactivatedNotification.resolvedByEventId;
      delete reactivatedNotification.resolutionReason;
      return {
        ...reactivatedNotification,
        lifecycleStatus: "active" as const,
        lifecycleUpdatedAt: evaluation.evaluatedAt,
        lifecycleStateVersion: state.version,
      };
    }

    return notification;
  });

  return changed ? { ...state, notifications } : state;
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

function setOperationalTwinState(
  nextState: OperationalTwinState
): OperationalTwinState {
  operationalTwinGlobal[OPERATIONAL_TWIN_STATE_KEY] = nextState;
  return nextState;
}

function appendGuardRulerEvaluationHistory(
  history: readonly GuardRulerResult[],
  evaluation: GuardRulerResult
): GuardRulerResult[] {
  return [
    ...history.filter(
      (recorded) =>
        recorded.evaluationKey !== evaluation.evaluationKey
    ),
    evaluation,
  ].slice(-MAX_GUARD_RULER_EVALUATION_HISTORY);
}

function eventResolvesNotification(
  event: OperationalEvent,
  notification: OperationalNotification
): boolean {
  if (event.correlationId !== notification.correlationId) return false;

  if (notification.eventType === "human-approval-required") {
    return (
      event.eventType === "decision-approved" ||
      event.eventType === "decision-rejected"
    );
  }
  if (notification.eventType === "oxygen-warning") {
    return (
      event.eventType === "oxygen-critical" ||
      event.eventType === "oxygen-action-required" ||
      event.eventType === "oxygen-recovered"
    );
  }
  if (notification.eventType === "oxygen-critical") {
    return (
      event.eventType === "oxygen-action-required" ||
      event.eventType === "oxygen-recovered"
    );
  }
  if (notification.eventType === "oxygen-action-required") {
    return event.eventType === "oxygen-recovered";
  }
  return false;
}

function normalizeNotificationLifecycles(
  state: OperationalTwinState
): OperationalTwinState {
  let changed = false;
  const simulationCorrelationId = state.activeSimulation
    ? `correlation-${state.activeSimulation.id}`
    : null;

  const notifications = state.notifications.map(
    (notification): OperationalNotification => {
      const runtimeNotification =
        notification as Partial<OperationalNotification>;
      const isTerminalOutcome =
        notification.eventType === "decision-approved" ||
        notification.eventType === "decision-rejected" ||
        notification.eventType === "oxygen-recovered" ||
        notification.eventType === "recovery-completed";
      const isResolvedApprovalRequirement =
        notification.eventType === "human-approval-required" &&
        notification.correlationId === simulationCorrelationId &&
        state.activeSimulation?.approval !== null &&
        state.activeSimulation?.approval !== undefined;
      const resolutionEvent = state.operationalEvents.find((event) =>
        eventResolvesNotification(event, notification)
      );
      const shouldBeResolved =
        isTerminalOutcome ||
        isResolvedApprovalRequirement ||
        resolutionEvent !== undefined;
      const hasLifecycle =
        (runtimeNotification.lifecycleStatus === "active" ||
          runtimeNotification.lifecycleStatus === "resolved") &&
        typeof runtimeNotification.lifecycleUpdatedAt === "string" &&
        typeof runtimeNotification.lifecycleStateVersion === "number";

      if (
        hasLifecycle &&
        (runtimeNotification.lifecycleStatus === "resolved" ||
          !shouldBeResolved)
      ) {
        return notification;
      }

      changed = true;
      const resolutionTimestamp = isResolvedApprovalRequirement
        ? resolutionEvent?.timestamp ??
          state.activeSimulation?.approval?.decidedAt ??
          notification.timestamp
        : resolutionEvent?.timestamp ?? notification.timestamp;
      const resolutionStateVersion = isResolvedApprovalRequirement
        ? resolutionEvent?.stateVersion ?? state.version
        : resolutionEvent?.stateVersion ?? notification.stateVersion;

      return {
        ...notification,
        lifecycleStatus: shouldBeResolved ? "resolved" : "active",
        lifecycleUpdatedAt: shouldBeResolved
          ? resolutionTimestamp
          : notification.timestamp,
        lifecycleStateVersion: shouldBeResolved
          ? resolutionStateVersion
          : notification.stateVersion,
        ...(shouldBeResolved
          ? {
              resolvedAt: resolutionTimestamp,
              resolvedByEventId: isResolvedApprovalRequirement
                ? resolutionEvent?.id
                : resolutionEvent?.id ?? notification.eventId,
              resolutionReason: isResolvedApprovalRequirement
                ? "A final operator decision resolved this approval requirement."
                : resolutionEvent?.eventType === "oxygen-recovered"
                  ? "The oxygen condition recovered after two safe confirmation cycles."
                  : resolutionEvent
                    ? "A higher-severity oxygen condition superseded this notification."
                    : "This notification records a completed operational outcome.",
            }
          : {}),
      };
    }
  );

  return changed ? { ...state, notifications } : state;
}

function ensureOperationalCollections(
  state: OperationalTwinState
): OperationalTwinState {
  const runtimeState = state as Partial<OperationalTwinState>;
  const hasAllCollections =
    Array.isArray(runtimeState.operationalEvents) &&
    Array.isArray(runtimeState.notifications) &&
    Array.isArray(runtimeState.emailDeliveries) &&
    typeof runtimeState.emailDeliverySequence === "number" &&
    Array.isArray(runtimeState.emailDeliveryReservations) &&
    Array.isArray(runtimeState.activeIncidents) &&
    runtimeState.oxygenAlertLifecycle !== undefined &&
    Array.isArray(runtimeState.latestSynchronization?.failedProviders) &&
    runtimeState.scenarioRuntime !== undefined &&
    "liveHardwareGpu" in runtimeState &&
    runtimeState.persistence !== undefined;

  const stateWithCollections = hasAllCollections
    ? state
    : {
        ...state,
        operationalEvents: [
          createBaselineResetEvent(state.version, state.generatedAt),
        ],
        notifications: [],
        emailDeliveries: [],
        emailDeliverySequence: 0,
        emailDeliveryReservations: [],
        latestSynchronization: {
          ...state.latestSynchronization,
          failedProviders: [],
        },
        activeIncidents: [],
        oxygenAlertLifecycle: {
          activeIncidentId: null,
          correlationId: null,
          activeSeverity: null,
          incidentSequence: 0,
          recoveryConfirmationCycles: 0,
          lastEvaluatedAt: null,
          lastEvaluationFingerprint: null,
        },
        scenarioRuntime: INITIAL_SCENARIO_RUNTIME,
        liveHardwareGpu: runtimeState.liveHardwareGpu ?? null,
        persistence: runtimeState.persistence ?? {
          mode: "memory-only",
          databasePath: null,
          lastPersistedAt: null,
          lastRestoredAt: null,
          lastError: null,
        },
      };

  const normalizedState =
    normalizeNotificationLifecycles(stateWithCollections);
  const stateWithEvaluationHistory = Array.isArray(
    runtimeState.guardRulerEvaluationHistory
  )
    ? normalizedState
    : {
        ...normalizedState,
        guardRulerEvaluationHistory:
          normalizedState.latestGuardRulerEvaluation
            ? [normalizedState.latestGuardRulerEvaluation]
            : [],
      };
  if (stateWithEvaluationHistory.latestGuardRulerEvaluation) {
    const latestEvaluation =
      stateWithEvaluationHistory.latestGuardRulerEvaluation;
    if (
      stateWithEvaluationHistory.guardRulerEvaluationHistory.some(
        (recorded) =>
          recorded.evaluationKey === latestEvaluation.evaluationKey
      )
    ) {
      return stateWithEvaluationHistory;
    }
    return {
      ...stateWithEvaluationHistory,
      guardRulerEvaluationHistory:
        appendGuardRulerEvaluationHistory(
          stateWithEvaluationHistory.guardRulerEvaluationHistory,
          latestEvaluation
        ),
    };
  }

  const baselineEvaluation = evaluateGuardRuler(
    stateWithEvaluationHistory,
    {
      evaluatedAt: stateWithEvaluationHistory.lastSynchronizedAt,
    }
  );
  return {
    ...stateWithEvaluationHistory,
    latestGuardRulerEvaluation: baselineEvaluation,
    guardRulerEvaluationHistory: [baselineEvaluation],
  };
}

/**
 * Get the current operational twin state
 * Lazily initializes state using createInitialOperationalTwinState() if not already set
 */
export function getOperationalTwinState(): OperationalTwinState {
  const currentState = operationalTwinGlobal[OPERATIONAL_TWIN_STATE_KEY];
  if (currentState !== undefined) {
    const normalizedState = ensureOperationalCollections(currentState);
    return normalizedState === currentState
      ? currentState
      : setOperationalTwinState(normalizedState);
  }

  return setOperationalTwinState(
    ensureOperationalCollections(createInitialOperationalTwinState())
  );
}

/**
 * Reset the operational twin state to a fresh initial state
 * Replaces the entire state with a new initial state
 * Also clears scenario runtime state
 */
export function resetOperationalTwinState(): OperationalTwinState {
  const currentState = operationalTwinGlobal[OPERATIONAL_TWIN_STATE_KEY];
  const initialState = ensureOperationalCollections(createInitialOperationalTwinState());
  const stateWithResetScenario = resetScenarioRuntime({
    ...initialState,
    liveHardwareGpu: currentState?.liveHardwareGpu ?? null,
    persistence: currentState?.persistence ?? initialState.persistence,
  });
  return setOperationalTwinState(stateWithResetScenario);
}

/**
 * Replace the entire operational twin state with a new state
 * Does not mutate the previous object
 */
export function replaceOperationalTwinState(
  nextState: OperationalTwinState
): OperationalTwinState {
  return setOperationalTwinState(nextState);
}

/**
 * Store live local GPU telemetry separately from the ten simulation nodes.
 * Scenario transitions and resets preserve this field and never overwrite it.
 */
export function updateLiveHardwareGpu(
  telemetry: LiveGpuTelemetry
): OperationalTwinState {
  const currentState = getOperationalTwinState();
  const timestamp = telemetry.collectedAt;
  const nextState: OperationalTwinState = {
    ...currentState,
    liveHardwareGpu: telemetry,
  };
  const eventTimestampKey = timestamp.replace(/[^0-9]/g, "");
  const eventResult = appendOperationalEvents(nextState, [
    {
      id: `event-live-gpu-sync-${eventTimestampKey}`,
      eventType: "system-event",
      category: "telemetry",
      domain: "compute",
      severity: telemetry.connectionStatus === "connected" ? "success" : "warning",
      status: telemetry.connectionStatus === "connected" ? "completed" : "failed",
      title: telemetry.connectionStatus === "connected"
        ? "Live Local GPU Telemetry Synchronized"
        : "Live Local GPU Telemetry Unavailable",
      message: telemetry.connectionStatus === "connected"
        ? `${telemetry.gpuName ?? "Local NVIDIA GPU"} telemetry was collected without changing simulation nodes.`
        : telemetry.error ?? "nvidia-smi telemetry is unavailable.",
      reason: "Operator-requested local hardware telemetry synchronization.",
      timestamp,
      sourceEntityIds: [],
      correlationId: `live-gpu-sync-${eventTimestampKey}`,
      dedupeKey: `live-gpu-sync:${timestamp}`,
      simulationOnly: true,
      source: "Live Local Hardware Telemetry",
      metadata: {
        notificationVisibility: "history-only",
        simulationProtected: true,
        simulationNodesUnaffected: true,
        connectionStatus: telemetry.connectionStatus,
      },
      stateVersion: nextState.version,
    },
  ]);
  return setOperationalTwinState(eventResult.state);
}

export function acknowledgeOperationalNotifications(
  input: NotificationAcknowledgementInput
): NotificationAcknowledgementResult {
  const currentState = getOperationalTwinState();
  const acknowledgedAt = new Date().toISOString();
  let acknowledgedCount = 0;
  let matchedNotification = input.acknowledgeAll === true;

  const notifications = currentState.notifications.map((notification) => {
    const selected =
      input.acknowledgeAll === true ||
      notification.id === input.notificationId;
    if (!selected) return notification;
    matchedNotification = true;
    if (notification.acknowledgedAt !== undefined) return notification;

    acknowledgedCount += 1;
    return {
      ...notification,
      acknowledgedAt,
      acknowledgedBy: input.operatorName,
      acknowledgedRole: input.operatorRole,
    };
  });

  if (!matchedNotification) {
    return { state: currentState, acknowledgedCount: 0 };
  }
  if (acknowledgedCount === 0) {
    return { state: currentState, acknowledgedCount: 0 };
  }

  const state = setOperationalTwinState({
    ...currentState,
    notifications,
  });
  return { state, acknowledgedCount };
}

export function reserveEmailDeliverySequence(): number {
  const currentState = getOperationalTwinState();
  const sequence = currentState.emailDeliverySequence + 1;
  setOperationalTwinState({
    ...currentState,
    emailDeliverySequence: sequence,
  });
  return sequence;
}

/**
 * Atomically marks all currently eligible notifications as in-flight before
 * any provider call awaits. This prevents concurrent mutation routes from
 * sending the same canonical notification more than once.
 */
export function reservePendingEmailNotifications(): OperationalNotification[] {
  const currentState = getOperationalTwinState();
  const reservedIds = new Set(currentState.emailDeliveryReservations);
  const recordedNotificationIds = new Set(
    currentState.emailDeliveries.flatMap((delivery) =>
      delivery.notificationId ? [delivery.notificationId] : []
    )
  );
  const pending = currentState.notifications.filter(
    (notification) =>
      notification.emailEligible &&
      (notification.lifecycleStatus === "active" ||
        notification.resolvedByEventId === notification.eventId) &&
      notification.emailDeliveryStatus === undefined &&
      !reservedIds.has(notification.id) &&
      !recordedNotificationIds.has(notification.id)
  );

  if (pending.length === 0) return [];

  setOperationalTwinState({
    ...currentState,
    emailDeliveryReservations: [
      ...currentState.emailDeliveryReservations,
      ...pending.map((notification) => notification.id),
    ].slice(-MAX_EMAIL_DELIVERY_RECORDS),
  });
  return pending;
}

export function releaseEmailDeliveryReservations(
  notificationIds: readonly string[]
): OperationalTwinState {
  if (notificationIds.length === 0) return getOperationalTwinState();

  const currentState = getOperationalTwinState();
  const releaseIds = new Set(notificationIds);
  const emailDeliveryReservations =
    currentState.emailDeliveryReservations.filter(
      (notificationId) => !releaseIds.has(notificationId)
    );
  if (
    emailDeliveryReservations.length ===
    currentState.emailDeliveryReservations.length
  ) {
    return currentState;
  }
  return setOperationalTwinState({
    ...currentState,
    emailDeliveryReservations,
  });
}

export function recordEmailDelivery(
  delivery: EmailDeliveryRecord
): OperationalTwinState {
  const currentState = getOperationalTwinState();
  const emailDeliveryReservations = delivery.notificationId
    ? currentState.emailDeliveryReservations.filter(
        (notificationId) => notificationId !== delivery.notificationId
      )
    : currentState.emailDeliveryReservations;
  if (
    currentState.emailDeliveries.some(
      (existing) =>
        existing.id === delivery.id ||
        existing.dedupeKey === delivery.dedupeKey
    )
  ) {
    return emailDeliveryReservations.length ===
      currentState.emailDeliveryReservations.length
      ? currentState
      : setOperationalTwinState({
          ...currentState,
          emailDeliveryReservations,
        });
  }

  const notification = delivery.notificationId
    ? currentState.notifications.find(
        (candidate) => candidate.id === delivery.notificationId
      )
    : undefined;

  const notifications = delivery.notificationId && notification
    ? currentState.notifications.map((candidate) =>
        candidate.id === delivery.notificationId
          ? { ...candidate, emailDeliveryStatus: delivery.status }
          : candidate
      )
    : currentState.notifications;
  let nextState: OperationalTwinState = {
    ...currentState,
    notifications,
    emailDeliveryReservations,
    emailDeliveries: [...currentState.emailDeliveries, delivery].slice(
      -MAX_EMAIL_DELIVERY_RECORDS
    ),
  };

  if (delivery.status === "failed" && notification) {
    nextState = appendOperationalEvents(nextState, [
      createEmailDeliveryFailureEvent({
        state: nextState,
        delivery,
        notification,
      }),
    ]).state;
  }

  return setOperationalTwinState(nextState);
}

/**
 * Get a summary of the operational twin state
 */
export function getOperationalTwinSummary(): OperationalTwinSummary {
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
 * Get the current scenario state (Phase 2: execution implemented).
 * This extends the canonical singleton with scenario catalog inspection and runtime state.
 */
export function getScenarioState(): ScenarioState {
  const state = getOperationalTwinState();
  const catalog = getScenarioCatalog();
  const runtime = state.scenarioRuntime;
  const activeScenario = runtime.activeScenarioId
    ? catalog.scenarios.find((entry) => entry.id === runtime.activeScenarioId) ?? null
    : null;

  return {
    activeScenarioId: runtime.activeScenarioId,
    activeScenarioName: activeScenario?.name ?? null,
    activeScenarioStatus: runtime.scenarioStatus,
    availableScenarios: catalog.scenarios,
    canActivateScenario: runtime.activeScenarioId === null && state.activeSimulation === null,
    lastScenarioTransitionAt: runtime.lastTransitionAt,
    metadata: {
      phase: 2,
      readOnly: false,
      mutationImplemented: true,
    },
  };
}

/**
 * Apply the MedRouteX demo crisis scenario to the operational twin state
 * Replaces the entire state with the crisis scenario applied
 */
export function applyCrisisScenarioToState(): OperationalTwinState {
  const currentState = getOperationalTwinState();
  const result = executeScenarioTransition(currentState, "stroke-compute-crisis");
  if (!result.success || result.outcome === "invalid-request") {
    return currentState;
  }
  if (result.outcome === "idempotent" || !result.fullState) {
    return currentState;
  }
  return setOperationalTwinState(result.fullState);
}

/**
 * Evaluate the canonical Hospital Twin without accepting client telemetry.
 * A matching evaluation key returns before event/notification insertion so
 * retries cannot create suppressed-email or history noise.
 */
export function evaluateGuardRulerState(
  input: GuardRulerEvaluationInput = {}
): GuardRulerEvaluationResult {
  const currentState = getOperationalTwinState();
  const options: GuardRulerEvaluationOptions = {
    ...input,
    evaluatedAt: new Date().toISOString(),
  };
  const proposedEvaluation = evaluateGuardRuler(
    currentState,
    options
  );
  const existingEvaluation =
    currentState.latestGuardRulerEvaluation;
  const finalDecisionAlreadyRecorded =
    input.evaluationProfile !== "no-safe-route-test" &&
    existingEvaluation !== null &&
    (existingEvaluation.decisionStatus === "approved" ||
      existingEvaluation.decisionStatus === "rejected") &&
    existingEvaluation.workloadId === proposedEvaluation.workloadId;

  if (
    existingEvaluation?.evaluationKey ===
      proposedEvaluation.evaluationKey ||
    finalDecisionAlreadyRecorded
  ) {
    return {
      outcome: "idempotent",
      state: currentState,
      evaluation: existingEvaluation,
      insertedNotifications: [],
    };
  }

  const recordedEvaluation =
    currentState.guardRulerEvaluationHistory.find(
      (evaluation) =>
        evaluation.evaluationKey ===
        proposedEvaluation.evaluationKey
    );
  if (recordedEvaluation) {
    const state = setOperationalTwinState(
      alignGuardRulerNotificationLifecycle(
        {
          ...currentState,
          latestGuardRulerEvaluation: recordedEvaluation,
        },
        recordedEvaluation
      )
    );
    return {
      outcome: "idempotent",
      state,
      evaluation: recordedEvaluation,
      insertedNotifications: [],
    };
  }

  const recordedEvaluationEvent =
    currentState.operationalEvents.find(
      (event) =>
        event.eventType === "guard-evaluation-completed" &&
        event.metadata.evaluationKey ===
          proposedEvaluation.evaluationKey
    );
  if (recordedEvaluationEvent) {
    const restoredEvaluation: GuardRulerResult = {
      ...proposedEvaluation,
      evaluatedAt: recordedEvaluationEvent.timestamp,
    };
    const state = setOperationalTwinState(
      alignGuardRulerNotificationLifecycle(
        {
          ...currentState,
          latestGuardRulerEvaluation: restoredEvaluation,
        },
        restoredEvaluation
      )
    );
    return {
      outcome: "idempotent",
      state,
      evaluation: restoredEvaluation,
      insertedNotifications: [],
    };
  }

  const stateWithEvaluation: OperationalTwinState = {
    ...currentState,
    latestGuardRulerEvaluation: proposedEvaluation,
    guardRulerEvaluationHistory:
      appendGuardRulerEvaluationHistory(
        currentState.guardRulerEvaluationHistory,
        proposedEvaluation
      ),
  };
  const eventResult = appendOperationalEvents(
    stateWithEvaluation,
    createGuardRulerEvents(proposedEvaluation)
  );
  const state = setOperationalTwinState(
    alignGuardRulerNotificationLifecycle(
      eventResult.state,
      proposedEvaluation
    )
  );
  return {
    outcome: "applied",
    state,
    evaluation: proposedEvaluation,
    insertedNotifications: eventResult.insertedNotifications,
  };
}

/**
 * Synchronize provider telemetry into the same process-wide canonical state.
 */
export function synchronizeOperationalTwinState(
  oxygenDemoPreset?: OxygenDemoPreset
): HospitalSynchronizationResult {
  const currentState = getOperationalTwinState();
  const timestamp = new Date().toISOString();
  try {
    const stateForSynchronization = oxygenDemoPreset
      ? applyOxygenDemoPreset(currentState, oxygenDemoPreset, timestamp)
      : currentState;
    const result = synchronizeHospitalTwin(
      stateForSynchronization,
      [
        new SyntheticHospitalTelemetryProvider(),
        new ExistingGpuTelemetryAdapter(),
      ],
      timestamp
    );
    const transitionEvents = evaluateOperationalTransitions(
      currentState,
      result.state,
      timestamp
    );
    const eventResult = appendOperationalEvents(result.state, [
      createSynchronizationEvent(result.state),
      ...createConnectorFailureEvents(result.state),
      ...transitionEvents,
    ]);
    const oxygenResult = evaluateOxygenTransition(
      eventResult.state,
      result.summary.timestamp
    );
    const state = setOperationalTwinState(oxygenResult.state);
    return {
      state,
      summary: result.summary,
      insertedNotifications: [
        ...eventResult.insertedNotifications,
        ...oxygenResult.insertedNotifications,
      ],
    };
  } catch (error) {
    const failureResult = appendOperationalEvents(currentState, [
      createSynchronizationFailureEvent({
        state: currentState,
        timestamp,
        reason:
          "An emulated telemetry provider or canonical synchronization step failed before a safe state update could be committed.",
      }),
    ]);
    setOperationalTwinState(failureResult.state);
    throw error;
  }
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

  const planA = currentState.latestGuardRulerEvaluation?.planSet.planA ?? null;
  const targetGpuId = planA?.candidatePlan.targetGpuId ?? null;
  const isCurrentCrisisRecommendation =
    targetGpuId !== null &&
    activeSimulation.recommendationId === input.recommendationId &&
    planA?.candidatePlan.recommendationId === input.recommendationId &&
    activeSimulation.recommendedTargetGpuId === targetGpuId;

  if (!isCurrentCrisisRecommendation || !planA || !targetGpuId) {
    throw new ApprovalDecisionError(
      "RECOMMENDATION_MISMATCH",
      "The decision does not refer to the current MedRouteX crisis recommendation."
    );
  }

  const guardEligiblePlanARecommendationId =
    currentState.latestGuardRulerEvaluation?.planSet.planA
      ?.candidatePlan.recommendationId ?? null;
  if (
    guardEligiblePlanARecommendationId !==
    input.recommendationId
  ) {
    throw new ApprovalDecisionError(
      "RECOMMENDATION_MISMATCH",
      "The decision does not refer to the current Guard-eligible Plan A recommendation."
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
      insertedNotifications: [],
    };
  }

  if (activeSimulation.status !== "awaiting-approval") {
    throw new ApprovalDecisionError(
      "SIMULATION_NOT_AWAITING_APPROVAL",
      "The active simulation is not awaiting approval."
    );
  }

  const decisionTimestamp = new Date().toISOString();
  const approval: TwinApprovalRecord = {
    decision: input.decision,
    satisfied: input.decision === "approve",
    recommendationId: input.recommendationId,
    targetGpuId,
    operatorName: input.operatorName,
    operatorRole: input.operatorRole,
    decidedAt: decisionTimestamp,
    simulationOnly: true,
  };

  const auditEvent: TwinApprovalAuditEvent = {
    id: `audit-${activeSimulation.id}-${input.recommendationId}-${input.decision}`,
    eventType: "human-approval-decision",
    decision: input.decision,
    simulationId: activeSimulation.id,
    recommendationId: input.recommendationId,
    targetGpuId,
    operatorName: input.operatorName,
    operatorRole: input.operatorRole,
    timestamp: decisionTimestamp,
    simulationOnly: true,
  };

  const nextStateWithoutSnapshot: OperationalTwinState = {
    ...currentState,
    version: currentState.version + 1,
    latestGuardRulerEvaluation:
      currentState.latestGuardRulerEvaluation
        ?.activeRecommendationId === input.recommendationId
        ? {
            ...currentState.latestGuardRulerEvaluation,
            decisionStatus:
              input.decision === "approve"
                ? "approved"
                : "rejected",
          }
        : currentState.latestGuardRulerEvaluation,
    guardRulerEvaluationHistory:
      currentState.guardRulerEvaluationHistory.map((evaluation) =>
        evaluation.activeRecommendationId ===
        input.recommendationId
          ? {
              ...evaluation,
              decisionStatus:
                input.decision === "approve"
                  ? "approved"
                  : "rejected",
            }
          : evaluation
      ),
    activeSimulation: {
      ...activeSimulation,
      status: input.decision === "approve" ? "approved" : "rejected",
      approvalSatisfied: approval.satisfied,
      approval,
    },
    scenarioRuntime: {
      ...currentState.scenarioRuntime,
      scenarioStatus: input.decision === "approve" ? "approved" : "rejected",
      lastTransitionAt: decisionTimestamp,
      humanApprovalRequired: false,
      physicalExecutionPerformed: false,
    },
    approvalAuditEvents: [...currentState.approvalAuditEvents, auditEvent],
  };
  const nextState = appendHospitalSnapshot(
    nextStateWithoutSnapshot,
    "decision",
    decisionTimestamp
  );
  const eventResult = appendOperationalEvents(nextState, [
    createDecisionEvent(nextState, approval),
  ]);
  setOperationalTwinState(eventResult.state);

  return {
    outcome: "applied",
    state: eventResult.state,
    approval,
    auditEvent,
    insertedNotifications: eventResult.insertedNotifications,
  };
}
