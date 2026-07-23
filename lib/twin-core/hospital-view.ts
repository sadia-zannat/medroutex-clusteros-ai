import {
  type HospitalTwinApiResponse,
  type OperationalTwinState,
} from "./types";

export function createHospitalTwinApiResponse(
  state: OperationalTwinState
): HospitalTwinApiResponse {
  return {
    success: true,
    data: state,
    summary: {
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
    },
    entityCount: state.entities.length,
    relationshipCount: state.relationships.length,
    latestSynchronization: state.latestSynchronization,
    resilienceSummary: state.resilienceSummary,
    activeSimulation: state.activeSimulation,
    auditSummary: {
      eventCount: state.approvalAuditEvents.length,
      latestEvent:
        state.approvalAuditEvents[state.approvalAuditEvents.length - 1] ?? null,
    },
    metadata: {
      phiMode: "PHI-Zero",
      hospitalTelemetryMode: "EMULATED HOSPITAL TELEMETRY",
      decisionSupportOnly: true,
      certifiedSafetyCalculation: false,
    },
  };
}
