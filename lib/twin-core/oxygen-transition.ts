import {
  appendOperationalEvents,
  type OperationalEventAppendResult,
} from "./operational-events";
import {
  assessOxygenAlert,
  assessOxygenRecovery,
  type OxygenAlertAssessment,
  type OxygenAssessmentSeverity,
} from "./oxygen-alerts";
import type {
  OperationalEvent,
  OperationalIncident,
  OperationalTwinState,
} from "./types";

type ActiveOxygenSeverity = Exclude<OxygenAssessmentSeverity, "normal">;

const OXYGEN_SEVERITY_RANK: Readonly<
  Record<ActiveOxygenSeverity, number>
> = {
  warning: 1,
  critical: 2,
  "action-required": 3,
};

function oxygenIncidentId(sequence: number): string {
  return `oxygen-incident-${String(sequence).padStart(3, "0")}`;
}

function oxygenEventType(
  severity: ActiveOxygenSeverity
): OperationalEvent["eventType"] {
  if (severity === "action-required") return "oxygen-action-required";
  if (severity === "critical") return "oxygen-critical";
  return "oxygen-warning";
}

function oxygenEventStatus(
  severity: ActiveOxygenSeverity
): OperationalEvent["status"] {
  return severity === "warning" ? "active" : "active";
}

function createOxygenAlertEvent(input: {
  state: OperationalTwinState;
  timestamp: string;
  incidentId: string;
  correlationId: string;
  assessment: OxygenAlertAssessment & {
    severity: ActiveOxygenSeverity;
  };
}): OperationalEvent {
  const { assessment } = input;
  return {
    id: `event-${input.incidentId}-${assessment.severity}`,
    eventType: oxygenEventType(assessment.severity),
    category:
      assessment.severity === "warning" ? "risk" : "incident",
    domain: "oxygen",
    severity: assessment.severity,
    status: oxygenEventStatus(assessment.severity),
    title: assessment.title,
    message: assessment.content.formattedDetails.join(" | "),
    reason: assessment.reason,
    timestamp: input.timestamp,
    sourceEntityIds: [
      "oxygen-main-tank-01",
      "oxygen-pipeline-01",
      "oxygen-reserve-bank-01",
      "icu-unit-01",
    ],
    correlationId: input.correlationId,
    dedupeKey: `${input.incidentId}:${assessment.severity}`,
    simulationOnly: true,
    source: "Emulated Hospital Telemetry",
    metadata: {
      incidentId: input.incidentId,
      notificationCooldownKey: `${input.incidentId}:oxygen`,
      causeCodes: assessment.causes.map((cause) => cause.code),
      mainTankPercent: input.state.domains.oxygen.mainTankPercent,
      currentDemandLitersPerMinute:
        input.state.domains.oxygen.currentDemandLitersPerMinute,
      estimatedMinutesToDepletion:
        input.state.domains.oxygen.estimatedMinutesToDepletion,
      pipelinePressure:
        assessment.content.pipelinePressure,
      pipelineState: input.state.domains.oxygen.operationalStatus,
      reserveAvailable: assessment.reserve.available,
      reserveStatus: assessment.reserve.status,
      reserveCylinderCount: assessment.reserve.cylinderCount,
      criticalWardCoverageStatus:
        assessment.criticalWardCoverage.status,
      estimatedCoverageMinutes:
        assessment.criticalWardCoverage.estimatedCoverageMinutes,
      affectedZones: [...assessment.impactedZones],
      anomalyProbability:
        input.state.domains.oxygen.leakAnomalyRisk,
      recommendedResponse: assessment.recommendedResponse,
      humanReviewRequired: assessment.humanReviewRequired,
      sourceLabel: assessment.content.sourceLabel,
      modelBoundary: assessment.content.modelBoundary,
      physicalActuationExecuted: false,
      assessmentFingerprint: assessment.fingerprint,
    },
    stateVersion: input.state.version,
  };
}

function createOxygenIncident(input: {
  incidentId: string;
  correlationId: string;
  timestamp: string;
  assessment: OxygenAlertAssessment & {
    severity: ActiveOxygenSeverity;
  };
}): OperationalIncident {
  return {
    id: input.incidentId,
    domain: "oxygen",
    severity: input.assessment.severity,
    title: input.assessment.title,
    status: "active",
    openedAt: input.timestamp,
    updatedAt: input.timestamp,
    correlationId: input.correlationId,
    sourceEntityIds: [
      "oxygen-main-tank-01",
      "oxygen-pipeline-01",
      "oxygen-reserve-bank-01",
      "icu-unit-01",
    ],
    affectedZones: [...input.assessment.impactedZones],
    reason: input.assessment.reason,
    simulationOnly: true,
  };
}

function updateActiveOxygenIncident(
  state: OperationalTwinState,
  severity: ActiveOxygenSeverity,
  title: string,
  reason: string,
  affectedZones: readonly string[],
  timestamp: string
): OperationalIncident[] {
  return state.activeIncidents.map((incident) =>
    incident.id === state.oxygenAlertLifecycle.activeIncidentId
      ? {
          ...incident,
          severity,
          title,
          reason,
          affectedZones: [...affectedZones],
          updatedAt: timestamp,
        }
      : incident
  );
}

function createOxygenRecoveryEvent(input: {
  state: OperationalTwinState;
  timestamp: string;
  incidentId: string;
  correlationId: string;
  formattedDetails: readonly string[];
  fingerprint: string;
}): OperationalEvent {
  const oxygen = input.state.domains.oxygen;
  return {
    id: `event-${input.incidentId}-recovered`,
    eventType: "oxygen-recovered",
    category: "recovery",
    domain: "oxygen",
    severity: "success",
    status: "resolved",
    title: "Oxygen Supply Recovered",
    message: input.formattedDetails.join(" | "),
    reason:
      "Tank level, depletion coverage, pipeline pressure, anomaly risk, critical-zone coverage, and reserve availability remained recovery-safe for two consecutive synchronization cycles.",
    timestamp: input.timestamp,
    sourceEntityIds: [
      "oxygen-main-tank-01",
      "oxygen-pipeline-01",
      "oxygen-reserve-bank-01",
      "icu-unit-01",
    ],
    correlationId: input.correlationId,
    dedupeKey: `${input.incidentId}:recovered`,
    simulationOnly: true,
    source: "Emulated Hospital Telemetry",
    metadata: {
      incidentId: input.incidentId,
      notificationCooldownKey: `${input.incidentId}:oxygen-recovery`,
      restoredTankPercent: oxygen.mainTankPercent,
      restoredPressureBar: oxygen.pipelinePressureBar,
      estimatedCoverageMinutes: oxygen.estimatedMinutesToDepletion,
      reserveAvailable:
        oxygen.reserveCylinderCount > 0 &&
        oxygen.reserveBankStatus === "operational",
      affectedZonesNowProtected: ["ICU", "Emergency"],
      sourceLabel: oxygen.sourceLabel,
      recoveryFingerprint: input.fingerprint,
      physicalActuationExecuted: false,
    },
    stateVersion: input.state.version,
  };
}

export function evaluateOxygenTransition(
  state: OperationalTwinState,
  timestamp: string
): OperationalEventAppendResult {
  const assessment = assessOxygenAlert(state.domains.oxygen, timestamp);
  const lifecycle = state.oxygenAlertLifecycle;

  if (lifecycle.activeIncidentId === null) {
    if (assessment.severity === "normal") {
      return {
        state: {
          ...state,
          oxygenAlertLifecycle: {
            ...lifecycle,
            activeSeverity: null,
            correlationId: null,
            recoveryConfirmationCycles: 0,
            lastEvaluatedAt: timestamp,
            lastEvaluationFingerprint: assessment.fingerprint,
          },
        },
        insertedEvents: [],
        insertedNotifications: [],
      };
    }

    const sequence = lifecycle.incidentSequence + 1;
    const incidentId = oxygenIncidentId(sequence);
    const correlationId = `correlation-${incidentId}`;
    const activeAssessment = {
      ...assessment,
      severity: assessment.severity,
    };
    const withIncident: OperationalTwinState = {
      ...state,
      activeIncidents: [
        ...state.activeIncidents.filter(
          (incident) => incident.domain !== "oxygen"
        ),
        createOxygenIncident({
          incidentId,
          correlationId,
          timestamp,
          assessment: activeAssessment,
        }),
      ],
      oxygenAlertLifecycle: {
        activeIncidentId: incidentId,
        correlationId,
        activeSeverity: activeAssessment.severity,
        incidentSequence: sequence,
        recoveryConfirmationCycles: 0,
        lastEvaluatedAt: timestamp,
        lastEvaluationFingerprint: assessment.fingerprint,
      },
    };
    return appendOperationalEvents(withIncident, [
      createOxygenAlertEvent({
        state: withIncident,
        timestamp,
        incidentId,
        correlationId,
        assessment: activeAssessment,
      }),
    ]);
  }

  const incidentId = lifecycle.activeIncidentId;
  const correlationId =
    lifecycle.correlationId ?? `correlation-${incidentId}`;

  if (assessment.severity !== "normal") {
    const activeSeverity =
      lifecycle.activeSeverity ?? assessment.severity;
    const escalated =
      OXYGEN_SEVERITY_RANK[assessment.severity] >
      OXYGEN_SEVERITY_RANK[activeSeverity];
    const retainedSeverity = escalated
      ? assessment.severity
      : activeSeverity;
    const nextState: OperationalTwinState = {
      ...state,
      activeIncidents: updateActiveOxygenIncident(
        state,
        retainedSeverity,
        escalated ? assessment.title : state.activeIncidents.find(
          (incident) => incident.id === incidentId
        )?.title ?? assessment.title,
        assessment.reason,
        assessment.impactedZones,
        timestamp
      ),
      oxygenAlertLifecycle: {
        ...lifecycle,
        correlationId,
        activeSeverity: retainedSeverity,
        recoveryConfirmationCycles: 0,
        lastEvaluatedAt: timestamp,
        lastEvaluationFingerprint: assessment.fingerprint,
      },
    };

    if (!escalated) {
      return {
        state: nextState,
        insertedEvents: [],
        insertedNotifications: [],
      };
    }

    const escalatedAssessment = {
      ...assessment,
      severity: assessment.severity,
    };
    return appendOperationalEvents(nextState, [
      createOxygenAlertEvent({
        state: nextState,
        timestamp,
        incidentId,
        correlationId,
        assessment: escalatedAssessment,
      }),
    ]);
  }

  const recovery = assessOxygenRecovery(
    state.domains.oxygen,
    timestamp,
    lifecycle.recoveryConfirmationCycles
  );
  if (!recovery.confirmed) {
    return {
      state: {
        ...state,
        oxygenAlertLifecycle: {
          ...lifecycle,
          correlationId,
          recoveryConfirmationCycles: recovery.consecutiveSafeCycles,
          lastEvaluatedAt: timestamp,
          lastEvaluationFingerprint: recovery.fingerprint,
        },
      },
      insertedEvents: [],
      insertedNotifications: [],
    };
  }

  const recoveredState: OperationalTwinState = {
    ...state,
    activeIncidents: state.activeIncidents.filter(
      (incident) => incident.id !== incidentId
    ),
    oxygenAlertLifecycle: {
      activeIncidentId: null,
      correlationId: null,
      activeSeverity: null,
      incidentSequence: lifecycle.incidentSequence,
      recoveryConfirmationCycles: 0,
      lastEvaluatedAt: timestamp,
      lastEvaluationFingerprint: recovery.fingerprint,
    },
  };
  return appendOperationalEvents(recoveredState, [
    createOxygenRecoveryEvent({
      state: recoveredState,
      timestamp,
      incidentId,
      correlationId,
      formattedDetails: recovery.content.formattedDetails,
      fingerprint: recovery.fingerprint,
    }),
  ]);
}
