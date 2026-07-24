/**
 * Deterministic hospital continuity scenario transitions.
 *
 * All mutations are server-owned, simulation-only, and operate on the single
 * canonical OperationalTwinState. No physical action is executed.
 */

import type {
  HospitalScenarioId,
  IcuContinuityAssessment,
  IcuOperationalRecommendation,
  OperationalEvent,
  OperationalEventDomain,
  OperationalEventSeverity,
  OperationalIncident,
  OperationalTwinState,
  ScenarioDomain,
  ScenarioRuntimeState,
  TwinEntity,
} from "./types";
import {
  appendHospitalSnapshot,
  calculateHospitalResilience,
  deriveHospitalDomains,
} from "./resilience";
import { appendOperationalEvents } from "./operational-events";
import { evaluateGuardRuler } from "../guard-ruler/engine";
import {
  analyzeDependencyCascades,
  buildDomainAssessments,
  buildMultiDomainPlanSet,
  buildScenarioRootCauses,
} from "./scenario-analysis";
import { INITIAL_SCENARIO_RUNTIME } from "./seed";

interface ScenarioFinalizationInput {
  state: OperationalTwinState;
  scenarioId: HospitalScenarioId;
  timestamp: string;
  transitionKey: string;
  severity: ScenarioRuntimeState["severity"];
  affectedDomains: ScenarioDomain[];
  rootCauseIds: string[];
  humanApprovalRequired: boolean;
  incidentDomain: OperationalEventDomain;
  incidentSeverity: Extract<OperationalEventSeverity, "warning" | "critical" | "action-required">;
  incidentTitle: string;
  incidentReason: string;
  incidentSourceEntityIds: string[];
  affectedZones: string[];
  events: OperationalEvent[];
  versionAlreadyIncremented?: boolean;
  preserveHealthScore?: number;
}

function stableEvent(input: {
  transitionKey: string;
  suffix: string;
  eventType: OperationalEvent["eventType"];
  category: OperationalEvent["category"];
  domain: OperationalEventDomain;
  severity: OperationalEventSeverity;
  status?: OperationalEvent["status"];
  title: string;
  message: string;
  reason: string;
  timestamp: string;
  stateVersion: number;
  sourceEntityIds: string[];
  scenarioId: HospitalScenarioId;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}): OperationalEvent {
  return {
    id: `event-${input.transitionKey}-${input.suffix}`,
    eventType: input.eventType,
    category: input.category,
    domain: input.domain,
    severity: input.severity,
    status: input.status ?? "active",
    title: input.title,
    message: input.message,
    reason: input.reason,
    timestamp: input.timestamp,
    sourceEntityIds: input.sourceEntityIds,
    scenarioId: input.scenarioId,
    correlationId: input.transitionKey,
    dedupeKey: `${input.scenarioId}:${input.suffix}:${input.transitionKey}`,
    simulationOnly: true,
    source: "MedRouteX Hospital Twin",
    metadata: {
      notificationVisibility: input.visible ? "visible" : "history-only",
      emulatedHospitalTelemetry: true,
      infrastructureDecisionSupportOnly: true,
      noAutomaticExecution: true,
      ...(input.metadata ?? {}),
    },
    stateVersion: input.stateVersion,
  };
}

function patchEntity(
  entities: readonly TwinEntity[],
  entityId: string,
  timestamp: string,
  patch: Partial<Omit<TwinEntity, "id">> & { attributes?: TwinEntity["attributes"] }
): TwinEntity[] {
  return entities.map((entity) =>
    entity.id === entityId
      ? {
          ...entity,
          ...patch,
          attributes: patch.attributes
            ? { ...entity.attributes, ...patch.attributes }
            : entity.attributes,
          lastUpdated: timestamp,
          tags: patch.tags ? [...new Set(patch.tags)] : entity.tags,
        }
      : entity
  );
}

function finalizeScenario(input: ScenarioFinalizationInput): OperationalTwinState {
  const version = input.versionAlreadyIncremented
    ? input.state.version
    : input.state.version + 1;
  const baseWithVersion: OperationalTwinState = {
    ...input.state,
    version,
    generatedAt: input.timestamp,
  };
  const domains = deriveHospitalDomains(baseWithVersion);
  const resilienceSummary = calculateHospitalResilience(domains, baseWithVersion);
  const stateWithResilience: OperationalTwinState = {
    ...baseWithVersion,
    domains,
    resilienceSummary,
    overallHealthScore: input.preserveHealthScore ?? resilienceSummary.resilienceScore,
    overallRiskScore: 100 - (input.preserveHealthScore ?? resilienceSummary.resilienceScore),
    overallStatus:
      resilienceSummary.overallHospitalStatus === "operational"
        ? "healthy"
        : resilienceSummary.overallHospitalStatus === "degraded"
          ? "warning"
          : resilienceSummary.overallHospitalStatus === "critical"
            ? "critical"
            : "offline",
  };

  const roots = buildScenarioRootCauses(stateWithResilience, input.scenarioId);
  const cascade = analyzeDependencyCascades(stateWithResilience, input.scenarioId, roots);
  const domainAssessments = buildDomainAssessments(stateWithResilience);
  const multiDomainPlanSet = buildMultiDomainPlanSet(
    stateWithResilience,
    input.scenarioId,
    cascade.dependencyImpacts,
    input.timestamp
  );
  const incidentId = `incident-${input.scenarioId}-${input.transitionKey}`;
  const incident: OperationalIncident = {
    id: incidentId,
    domain: input.incidentDomain,
    severity: input.incidentSeverity,
    title: input.incidentTitle,
    status: "active",
    openedAt: input.timestamp,
    updatedAt: input.timestamp,
    correlationId: input.transitionKey,
    sourceEntityIds: input.incidentSourceEntityIds,
    affectedZones: input.affectedZones,
    reason: input.incidentReason,
    simulationOnly: true,
  };
  const scenarioRuntime: ScenarioRuntimeState = {
    activeScenarioId: input.scenarioId,
    scenarioStatus: input.humanApprovalRequired ? "awaiting-approval" : "running",
    startedAt: input.timestamp,
    lastTransitionAt: input.timestamp,
    stateVersionStarted: version,
    affectedDomains: input.affectedDomains,
    severity: input.severity,
    activeIncidentIds: [incidentId],
    rootCauseIds: roots.map((entry) => entry.entityId),
    transitionKey: input.transitionKey,
    executionCount: 1,
    recoveryStatus: "not-recovering",
    humanApprovalRequired: input.humanApprovalRequired,
    physicalExecutionPerformed: false,
    rootCauses: roots,
    dependencyImpacts: cascade.dependencyImpacts,
    cascadePaths: cascade.cascadePaths,
    domainAssessments,
    multiDomainPlanSet,
    recovery: {
      status: "monitoring",
      confirmationCycles: 0,
      requiredConfirmationCycles: 2,
      startedAt: input.timestamp,
      recoveredAt: null,
      evidence: ["Awaiting deterministic recovery or reset transition."],
    },
    metadata: {
      phase: 2,
      deterministic: true,
      patientData: false,
      diagnosis: false,
      actuatorExecution: false,
    },
  };
  let stateWithRuntime: OperationalTwinState = {
    ...stateWithResilience,
    scenarioRuntime,
    activeIncidents: [
      ...stateWithResilience.activeIncidents.filter(
        (entry) => entry.correlationId !== input.transitionKey
      ),
      incident,
    ],
  };

  if (
    input.scenarioId === "stroke-compute-crisis" ||
    input.scenarioId === "network-continuity-failure" ||
    input.scenarioId === "hospital-cascade-crisis"
  ) {
    try {
      const evaluation = evaluateGuardRuler(stateWithRuntime, {
        evaluatedAt: input.timestamp,
      });
      stateWithRuntime = {
        ...stateWithRuntime,
        latestGuardRulerEvaluation: evaluation,
        guardRulerEvaluationHistory: [
          ...stateWithRuntime.guardRulerEvaluationHistory.filter(
            (entry) => entry.evaluationKey !== evaluation.evaluationKey
          ),
          evaluation,
        ].slice(-50),
      };
    } catch {
      // Scenario evidence remains valid even if a route evaluation has no
      // eligible canonical workload. The API exposes no fabricated plan.
    }
  }

  const stateWithSnapshot = appendHospitalSnapshot(
    stateWithRuntime,
    "scenario",
    input.timestamp
  );
  return appendOperationalEvents(stateWithSnapshot, input.events).state;
}

export function applyIcuCapacityStress(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  if (state.scenarioRuntime.activeScenarioId === "icu-capacity-stress") return state;
  let entities = patchEntity(state.entities, "icu-unit-01", timestamp, {
    status: "critical",
    healthScore: 58,
    riskScore: 42,
    attributes: { operationalStatus: "critical" },
    tags: ["icu", "aggregate-only", "capacity-stress"],
  });
  entities = patchEntity(entities, "icu-capacity-01", timestamp, {
    status: "critical",
    healthScore: 60,
    riskScore: 40,
    attributes: {
      totalBeds: 24,
      occupiedBeds: 22,
      criticalBeds: 10,
      oxygenDemandLitersPerMinute: 750,
    },
    tags: ["icu", "aggregate-only", "no-patient-data", "capacity-stress"],
  });
  entities = patchEntity(entities, "icu-ventilator-aggregate-01", timestamp, {
    status: "critical",
    healthScore: 62,
    riskScore: 38,
    attributes: {
      ventilatorsAvailable: 2,
      ventilatorsInUse: 10,
      devicesOffline: 2,
    },
    tags: ["icu", "device-aggregate", "no-patient-data", "ventilator-stress"],
  });
  const version = state.version + 1;
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "icu-capacity-stress" as const,
    domain: "icu" as const,
    sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "warning", title: "ICU Capacity Stress Scenario Started", message: "Aggregate ICU occupancy, ventilator availability, and oxygen demand entered the stress scenario.", reason: "Deterministic what-if scenario selected by an operator." }),
    stableEvent({ ...common, suffix: "continuity", eventType: "icu-capacity-critical", category: "risk", severity: "critical", title: "ICU Continuity Degraded", message: "ICU occupancy is 91.7% with 10 critical beds, 2 ventilators available, and 2 aggregate devices offline.", reason: "Aggregate continuity thresholds are exceeded." }),
    stableEvent({ ...common, suffix: "dependencies", eventType: "icu-dependency-assessment", category: "risk", severity: "warning", title: "ICU Dependency Assessment Completed", message: "Oxygen, power, and local-network dependencies were evaluated for continuity impact.", reason: "Typed dependency graph analysis completed." }),
    stableEvent({ ...common, suffix: "recommendation", eventType: "icu-recommendation-prepared", category: "plan", severity: "warning", title: "ICU Operational Recommendation Prepared", message: "A simulation-only infrastructure response recommendation is ready for authorized review.", reason: "Critical infrastructure continuity requires human review." }),
    stableEvent({ ...common, suffix: "summary", eventType: "crisis-summary", category: "incident", severity: "critical", title: "ICU Capacity Continuity Risk", message: "ICU occupancy 22/24, 2 ventilators available, 2 aggregate devices offline, and oxygen demand 750 L/min. Human review required. Source: Emulated Hospital Telemetry.", reason: "One grouped ICU continuity notification summarizes the scenario.", visible: true }),
  ];
  return finalizeScenario({
    state: { ...state, entities },
    scenarioId: "icu-capacity-stress",
    timestamp,
    transitionKey,
    severity: "high",
    affectedDomains: ["icu", "oxygen"],
    rootCauseIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
    humanApprovalRequired: true,
    incidentDomain: "icu",
    incidentSeverity: "critical",
    incidentTitle: "ICU Capacity Continuity Risk",
    incidentReason: "Aggregate ICU capacity and device availability are constrained.",
    incidentSourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
    affectedZones: ["zone-icu"],
    events,
  });
}

export function applyOxygenContinuityRisk(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  if (state.scenarioRuntime.activeScenarioId === "oxygen-continuity-risk") return state;
  let entities = patchEntity(state.entities, "oxygen-main-tank-01", timestamp, {
    status: "critical",
    healthScore: 42,
    riskScore: 58,
    attributes: {
      mainTankPercent: 25,
      refillEtaMinutes: 240,
      estimatedMinutesToDepletion: 180,
    },
    tags: ["oxygen", "emulated", "continuity-risk"],
  });
  entities = patchEntity(entities, "oxygen-pipeline-01", timestamp, {
    status: "critical",
    healthScore: 48,
    riskScore: 52,
    attributes: {
      pipelinePressureBar: 3.1,
      currentDemandLitersPerMinute: 750,
      leakAnomalyRisk: 0.65,
      operationalStatus: "critical",
    },
    tags: ["oxygen", "pipeline", "emulated", "pressure-risk"],
  });
  entities = patchEntity(entities, "oxygen-reserve-bank-01", timestamp, {
    status: "warning",
    healthScore: 76,
    riskScore: 24,
    attributes: {
      reserveCylinderCount: 8,
      operationalStatus: "operational",
    },
    tags: ["oxygen", "reserve", "emulated", "reserve-available"],
  });
  const version = state.version + 1;
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "oxygen-continuity-risk" as const,
    domain: "oxygen" as const,
    sourceEntityIds: ["oxygen-main-tank-01", "oxygen-pipeline-01", "oxygen-reserve-bank-01"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "warning", title: "Oxygen Continuity Risk Scenario Started", message: "The deterministic oxygen continuity scenario was applied.", reason: "Operator-selected what-if simulation." }),
    stableEvent({ ...common, suffix: "tank", eventType: "oxygen-critical", category: "risk", severity: "critical", title: "Oxygen Tank Depletion Risk", message: "Main tank is 25% with approximately 180 minutes to depletion.", reason: "Prototype oxygen continuity thresholds indicate a critical condition." }),
    stableEvent({ ...common, suffix: "dependency", eventType: "system-event", category: "risk", severity: "warning", title: "Oxygen Dependency Assessment Completed", message: "ICU demand, reserve availability, and power continuity were evaluated.", reason: "Typed dependency analysis completed." }),
    stableEvent({ ...common, suffix: "summary", eventType: "oxygen-critical", category: "incident", severity: "critical", title: "Critical Oxygen Supply Risk", message: "Main tank 25%, depletion estimate 180 minutes, pipeline pressure 3.1 bar, reserve available, anomaly probability 65%. Human review required.", reason: "One grouped oxygen continuity notification summarizes the scenario.", visible: true }),
  ];
  const next = finalizeScenario({
    state: { ...state, entities },
    scenarioId: "oxygen-continuity-risk",
    timestamp,
    transitionKey,
    severity: "critical",
    affectedDomains: ["oxygen", "icu", "power"],
    rootCauseIds: ["oxygen-main-tank-01", "oxygen-pipeline-01"],
    humanApprovalRequired: true,
    incidentDomain: "oxygen",
    incidentSeverity: "critical",
    incidentTitle: "Critical Oxygen Supply Risk",
    incidentReason: "Tank depletion and pipeline pressure threaten continuity within the prototype model.",
    incidentSourceEntityIds: ["oxygen-main-tank-01", "oxygen-pipeline-01"],
    affectedZones: ["zone-oxygen-plant", "zone-icu"],
    events,
  });
  return {
    ...next,
    oxygenAlertLifecycle: {
      ...next.oxygenAlertLifecycle,
      activeIncidentId: next.scenarioRuntime.activeIncidentIds[0] ?? null,
      correlationId: transitionKey,
      activeSeverity: "critical",
      incidentSequence: next.oxygenAlertLifecycle.incidentSequence + 1,
      recoveryConfirmationCycles: 0,
      lastEvaluatedAt: timestamp,
      lastEvaluationFingerprint: `${transitionKey}:critical`,
    },
  };
}

export function applyPowerContinuityFailure(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  if (state.scenarioRuntime.activeScenarioId === "power-continuity-failure") return state;
  let entities = patchEntity(state.entities, "power-main-grid-01", timestamp, {
    status: "offline",
    healthScore: 0,
    riskScore: 100,
    attributes: { gridStatus: "offline", operationalStatus: "critical" },
    tags: ["power", "emulated", "grid-offline"],
  });
  entities = patchEntity(entities, "power-ups-01", timestamp, {
    status: "critical",
    healthScore: 42,
    riskScore: 58,
    attributes: { upsPercent: 42, upsRuntimeMinutes: 18 },
    tags: ["power", "backup", "emulated", "ups-active"],
  });
  entities = patchEntity(entities, "power-generator-01", timestamp, {
    status: "warning",
    healthScore: 80,
    riskScore: 20,
    attributes: { generatorStatus: "standby", generatorFuelPercent: 82 },
    tags: ["power", "backup", "emulated", "manual-review-required"],
  });
  for (const id of ["power-circuit-icu-01", "power-circuit-oxygen-01", "power-circuit-gpu-01"]) {
    entities = patchEntity(entities, id, timestamp, {
      status: "warning",
      healthScore: 68,
      riskScore: 32,
      attributes: { operationalStatus: "degraded" },
      tags: ["power", "critical-circuit", "emulated", "backup-power"],
    });
  }
  const version = state.version + 1;
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "power-continuity-failure" as const,
    domain: "power" as const,
    sourceEntityIds: ["power-main-grid-01", "power-ups-01", "power-generator-01"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "critical", title: "Power Continuity Failure Scenario Started", message: "Main grid loss and limited backup runtime were applied as an emulated scenario.", reason: "Operator-selected what-if simulation." }),
    stableEvent({ ...common, suffix: "grid", eventType: "grid-failure", category: "incident", severity: "critical", title: "Main Grid Unavailable", message: "Main grid is offline; critical circuits remain degraded on backup continuity.", reason: "Emulated grid-failure condition." }),
    stableEvent({ ...common, suffix: "ups", eventType: "ups-runtime-low", category: "risk", severity: "critical", title: "UPS Runtime Limited", message: "UPS is 42% with approximately 18 minutes of runtime.", reason: "Backup continuity is insufficient for an extended outage." }),
    stableEvent({ ...common, suffix: "summary", eventType: "manual-review-required", category: "incident", severity: "action-required", title: "Backup Power Continuity Risk", message: "Grid offline, UPS 42% / 18 minutes, generator available in standby but not automatically started, critical circuits degraded. Authorized human review required.", reason: "One grouped power continuity notification summarizes the scenario.", visible: true }),
  ];
  return finalizeScenario({
    state: { ...state, entities },
    scenarioId: "power-continuity-failure",
    timestamp,
    transitionKey,
    severity: "critical",
    affectedDomains: ["power", "icu", "oxygen", "compute"],
    rootCauseIds: ["power-main-grid-01", "power-ups-01"],
    humanApprovalRequired: true,
    incidentDomain: "power",
    incidentSeverity: "action-required",
    incidentTitle: "Backup Power Continuity Risk",
    incidentReason: "Grid loss and limited UPS runtime affect critical infrastructure dependencies.",
    incidentSourceEntityIds: ["power-main-grid-01", "power-ups-01", "power-generator-01"],
    affectedZones: ["zone-power-room", "zone-icu", "zone-oxygen-plant", "zone-gpu-datacenter"],
    events,
  });
}

export function applyNetworkContinuityFailure(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  if (state.scenarioRuntime.activeScenarioId === "network-continuity-failure") return state;
  const staleHeartbeat = new Date(Date.parse(timestamp) - 10 * 60_000).toISOString();
  let entities = patchEntity(state.entities, "network-central-link-01", timestamp, {
    status: "offline",
    healthScore: 10,
    riskScore: 90,
    lastHeartbeatAt: staleHeartbeat,
    attributes: {
      operationalStatus: "offline",
      latencyMs: 180,
      packetLossPercent: 12,
      heartbeatTimestamp: staleHeartbeat,
    },
    tags: ["network", "central", "emulated", "link-offline"],
  });
  entities = patchEntity(entities, "network-local-link-01", timestamp, {
    status: "healthy",
    healthScore: 92,
    riskScore: 8,
    attributes: { operationalStatus: "operational", latencyMs: 6, packetLossPercent: 0.4, heartbeatTimestamp: timestamp },
    tags: ["network", "local", "emulated", "local-route-available"],
  });
  const version = state.version + 1;
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "network-continuity-failure" as const,
    domain: "network" as const,
    sourceEntityIds: ["network-central-link-01"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "warning", title: "Network Continuity Failure Scenario Started", message: "The central-link outage was applied while local connectivity remains available.", reason: "Operator-selected what-if simulation." }),
    stableEvent({ ...common, suffix: "central", eventType: "network-link-offline", category: "incident", severity: "critical", title: "Central Network Link Offline", message: "Central latency is 180 ms, packet loss is 12%, and heartbeat is stale.", reason: "Central-route dependency is unavailable." }),
    stableEvent({ ...common, suffix: "guard", eventType: "guard-evaluation-completed", category: "guard-decision", severity: "warning", title: "Network-Aware Guard Evaluation Completed", message: "Central routes are blocked while eligible local routes remain rankable and cloud remains privacy-governed.", reason: "Guard evaluated the current canonical network dependency state." }),
    stableEvent({ ...common, suffix: "summary", eventType: "crisis-summary", category: "incident", severity: "critical", title: "Central Network Route Unavailable", message: "Central link offline; local route remains operational; cloud remains privacy-governed. Route ranking was recalculated without automatic execution.", reason: "One grouped network continuity notification summarizes the scenario.", visible: true }),
  ];
  return finalizeScenario({
    state: { ...state, entities },
    scenarioId: "network-continuity-failure",
    timestamp,
    transitionKey,
    severity: "high",
    affectedDomains: ["network", "compute"],
    rootCauseIds: ["network-central-link-01"],
    humanApprovalRequired: true,
    incidentDomain: "network",
    incidentSeverity: "critical",
    incidentTitle: "Central Network Route Unavailable",
    incidentReason: "The central compute route is unavailable while local continuity remains operational.",
    incidentSourceEntityIds: ["network-central-link-01"],
    affectedZones: ["zone-network-room", "zone-radiology", "zone-gpu-datacenter"],
    events,
  });
}

export function applyHospitalCascadeCrisis(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  if (state.scenarioRuntime.activeScenarioId === "hospital-cascade-crisis") return state;
  let entities = state.entities;
  const entityPatches: Array<[string, Parameters<typeof patchEntity>[3]]> = [
    ["compute-local-gpu-02", { status: "critical", healthScore: 25, riskScore: 75, attributes: { temperatureC: 92, utilizationPercent: 95, memoryUsedMiB: 8188, memoryTotalMiB: 8188 }, tags: ["gpu", "ai-inference", "synthetic-telemetry", "overheating"] }],
    ["compute-local-gpu-03", { status: "critical", healthScore: 30, riskScore: 70, attributes: { temperatureC: 78, utilizationPercent: 88, memoryUsedMiB: 7900, memoryTotalMiB: 8188 }, tags: ["gpu", "ai-inference", "synthetic-telemetry", "memory-overload"] }],
    ["compute-local-gpu-04", { status: "healthy", healthScore: 95, riskScore: 5, attributes: { temperatureC: 48, utilizationPercent: 20, memoryUsedMiB: 2048, memoryTotalMiB: 24576 }, tags: ["gpu", "ai-inference", "synthetic-telemetry", "preferred-local-target"] }],
    ["workload-stroke-ct-001", { attributes: { deadlineSeconds: 120, status: "awaiting-approval", approvalRequired: true, assignedGpuId: "gpu-local-1", privacyPolicy: "central-allowed" } }],
    ["network-central-link-01", { status: "offline", healthScore: 5, riskScore: 95, attributes: { operationalStatus: "offline", latencyMs: 240, packetLossPercent: 35, heartbeatTimestamp: new Date(Date.parse(timestamp) - 15 * 60_000).toISOString() }, tags: ["network", "central", "emulated", "link-offline"] }],
    ["power-main-grid-01", { status: "offline", healthScore: 0, riskScore: 100, attributes: { gridStatus: "offline", operationalStatus: "degraded" }, tags: ["power", "emulated", "grid-offline", "backup-continuity-active"] }],
    ["power-ups-01", { status: "critical", healthScore: 18, riskScore: 82, attributes: { upsPercent: 18, upsRuntimeMinutes: 8 }, tags: ["power", "backup", "emulated", "ups-critical"] }],
    ["power-generator-01", { status: "offline", healthScore: 0, riskScore: 100, attributes: { generatorStatus: "offline", generatorFuelPercent: 40 }, tags: ["power", "backup", "emulated", "generator-unavailable"] }],
    ["power-circuit-icu-01", { status: "critical", healthScore: 35, riskScore: 65, attributes: { operationalStatus: "critical" }, tags: ["power", "critical-circuit", "emulated", "at-risk"] }],
    ["power-circuit-oxygen-01", { status: "critical", healthScore: 30, riskScore: 70, attributes: { operationalStatus: "critical" }, tags: ["power", "critical-circuit", "emulated", "at-risk"] }],
    ["power-circuit-gpu-01", { status: "warning", healthScore: 65, riskScore: 35, attributes: { operationalStatus: "degraded" }, tags: ["power", "critical-circuit", "emulated", "backup-power"] }],
    ["oxygen-main-tank-01", { status: "critical", healthScore: 20, riskScore: 80, attributes: { mainTankPercent: 15, refillEtaMinutes: 300, estimatedMinutesToDepletion: 90 }, tags: ["oxygen", "emulated", "action-required"] }],
    ["oxygen-reserve-bank-01", { status: "offline", healthScore: 0, riskScore: 100, attributes: { reserveCylinderCount: 0, operationalStatus: "offline" }, tags: ["oxygen", "reserve", "emulated", "unavailable"] }],
    ["oxygen-pipeline-01", { status: "critical", healthScore: 15, riskScore: 85, attributes: { pipelinePressureBar: 2.8, currentDemandLitersPerMinute: 820, leakAnomalyRisk: 0.9, operationalStatus: "critical" }, tags: ["oxygen", "pipeline", "emulated", "action-required"] }],
    ["icu-unit-01", { status: "critical", healthScore: 35, riskScore: 65, attributes: { operationalStatus: "critical" }, tags: ["icu", "aggregate-only", "cascade-risk"] }],
    ["icu-capacity-01", { status: "critical", healthScore: 40, riskScore: 60, attributes: { totalBeds: 24, occupiedBeds: 23, criticalBeds: 12, oxygenDemandLitersPerMinute: 820 }, tags: ["icu", "aggregate-only", "no-patient-data", "cascade-risk"] }],
    ["icu-ventilator-aggregate-01", { status: "critical", healthScore: 42, riskScore: 58, attributes: { ventilatorsAvailable: 1, ventilatorsInUse: 11, devicesOffline: 3 }, tags: ["icu", "device-aggregate", "no-patient-data", "cascade-risk"] }],
  ];
  for (const [id, patch] of entityPatches) entities = patchEntity(entities, id, timestamp, patch);

  const version = state.version + 1;
  const activeSimulation = {
    id: "sim-hospital-cascade-001",
    scenarioId: "medroutex-stroke-crisis",
    scenarioName: "Hospital Cascade Crisis — Emergency Stroke CT Continuity",
    status: "awaiting-approval" as const,
    startedAt: timestamp,
    baselineSnapshotId: "snapshot-1-baseline",
    projectedChanges: [],
    predictedRiskReductionPercent: 33.5,
    predictedRecoveryMinutes: 8,
    requiresHumanApproval: true,
    recommendationId: `guard-rec-workload-stroke-ct-001-v${version}-gpu-local-3`,
    recommendedTargetGpuId: "gpu-local-3",
    approvalSatisfied: false,
    approval: null,
    simulationOnly: true as const,
    warnings: [
      "Central GPU routes blocked by network dependency.",
      "Cloud routes blocked by privacy.",
      "Local GPU-2 blocked by overheating.",
      "Local GPU-3 blocked by memory overload.",
      "Power and oxygen continuity require authorized human review.",
    ],
  };
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "hospital-cascade-crisis" as const,
    domain: "system" as const,
    sourceEntityIds: ["power-main-grid-01", "network-central-link-01", "oxygen-main-tank-01", "icu-capacity-01", "compute-local-gpu-02", "compute-local-gpu-03"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "critical", title: "Hospital Cascade Crisis Scenario Started", message: "Compute, ICU, oxygen, power, and network continuity conditions were applied together.", reason: "Operator-selected cross-domain what-if simulation." }),
    stableEvent({ ...common, suffix: "roots", eventType: "system-event", category: "risk", severity: "critical", title: "Cross-Domain Root Causes Identified", message: "Thermal, memory, network, grid, backup-power, oxygen, and ICU root causes were normalized.", reason: "Deterministic root-cause analysis completed." }),
    stableEvent({ ...common, suffix: "cascade", eventType: "system-event", category: "risk", severity: "critical", title: "Dependency Cascade Analysis Completed", message: "Cycle-safe graph traversal produced bounded dependency-impact paths.", reason: "Typed Hospital Twin relationship traversal completed." }),
    stableEvent({ ...common, suffix: "plan", eventType: "plan-set-ranked", category: "plan", severity: "action-required", title: "Multi-Domain Plan A/B/C Prepared", message: "Guard-eligible compute routing and cross-domain response plans were ranked for authorized review.", reason: "Transparent secondary response-plan scoring completed." }),
    stableEvent({ ...common, suffix: "summary", eventType: "crisis-summary", category: "incident", severity: "action-required", title: "Hospital Continuity Cascade Risk", message: "Central route unavailable, cloud privacy-blocked, Local GPU-2 overheated, Local GPU-3 memory-overloaded, UPS runtime 8 minutes, oxygen reserve unavailable, and ICU occupancy 23/24. Human approval required; no automatic execution.", reason: "One grouped hospital cascade notification summarizes the incident.", visible: true }),
  ];
  return finalizeScenario({
    state: { ...state, entities, activeSimulation, overallHealthScore: 58, overallRiskScore: 42, overallStatus: "critical" },
    scenarioId: "hospital-cascade-crisis",
    timestamp,
    transitionKey,
    severity: "critical",
    affectedDomains: ["compute", "icu", "oxygen", "power", "network"],
    rootCauseIds: ["compute-local-gpu-02", "compute-local-gpu-03", "network-central-link-01", "power-main-grid-01", "power-ups-01", "oxygen-main-tank-01", "icu-capacity-01"],
    humanApprovalRequired: true,
    incidentDomain: "system",
    incidentSeverity: "action-required",
    incidentTitle: "Hospital Continuity Cascade Risk",
    incidentReason: "Multiple infrastructure domains simultaneously threaten critical-care continuity.",
    incidentSourceEntityIds: common.sourceEntityIds,
    affectedZones: ["zone-radiology", "zone-gpu-datacenter", "zone-icu", "zone-oxygen-plant", "zone-power-room", "zone-network-room"],
    events,
  });
}

export function enrichStrokeScenario(
  state: OperationalTwinState,
  timestamp: string,
  transitionKey: string
): OperationalTwinState {
  const version = state.version;
  const common = {
    transitionKey,
    timestamp,
    stateVersion: version,
    scenarioId: "stroke-compute-crisis" as const,
    domain: "compute" as const,
    sourceEntityIds: ["compute-local-gpu-02", "compute-local-gpu-03", "workload-stroke-ct-001"],
  };
  const events: OperationalEvent[] = [
    stableEvent({ ...common, suffix: "started", eventType: "scenario-started", category: "scenario", severity: "critical", title: "Stroke Compute Crisis Scenario Started", message: "Emergency Stroke CT compute risk was applied.", reason: "Deterministic demo scenario selected." }),
    stableEvent({ ...common, suffix: "gpu-risk", eventType: "gpu-critical-risk", category: "risk", severity: "critical", title: "Critical GPU Continuity Risk", message: "Local GPU-2 is overheating and Local GPU-3 is memory constrained.", reason: "Canonical synthetic telemetry crossed hard Guard thresholds." }),
    stableEvent({ ...common, suffix: "summary", eventType: "crisis-summary", category: "incident", severity: "critical", title: "Stroke Crisis Continuity Risk", message: "Emergency Stroke CT has a 120-second deadline. Central GPU-7 is the leading safe route; cloud is privacy-blocked. Human approval required.", reason: "One grouped compute continuity notification summarizes the scenario.", visible: true }),
  ];
  return finalizeScenario({
    state: { ...state, snapshots: state.snapshots.slice(0, -1) },
    scenarioId: "stroke-compute-crisis",
    timestamp,
    transitionKey,
    severity: "critical",
    affectedDomains: ["compute", "power", "network"],
    rootCauseIds: ["compute-local-gpu-02", "compute-local-gpu-03"],
    humanApprovalRequired: true,
    incidentDomain: "compute",
    incidentSeverity: "critical",
    incidentTitle: "Stroke Crisis Continuity Risk",
    incidentReason: "Critical GPU thermal and memory risks threaten the 120-second workload deadline.",
    incidentSourceEntityIds: ["compute-local-gpu-02", "compute-local-gpu-03", "workload-stroke-ct-001"],
    affectedZones: ["zone-radiology", "zone-gpu-datacenter"],
    events,
    versionAlreadyIncremented: true,
    preserveHealthScore: 81,
  });
}

export function createIcuContinuityAssessment(
  state: OperationalTwinState
): IcuContinuityAssessment {
  const icu = state.domains.icu;
  const occupancyPercentage = icu.totalBeds > 0
    ? (icu.occupiedBeds / icu.totalBeds) * 100
    : 0;
  return {
    totalBeds: icu.totalBeds,
    occupiedBeds: icu.occupiedBeds,
    occupancyPercentage,
    criticalBedDemand: icu.criticalBeds,
    ventilatorsAvailable: icu.ventilatorsAvailable,
    ventilatorsInUse: icu.ventilatorsInUse,
    devicesOffline: icu.devicesOffline,
    oxygenDemandLitersPerMinute: icu.oxygenDemandLitersPerMinute,
    continuityScore: state.resilienceSummary.icuContinuityScore,
    status: icu.operationalStatus,
    affectedDomains: ["icu", "oxygen"],
    affectedDependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01", "power-circuit-icu-01", "network-local-link-01"],
    evidence: [
      `Occupancy: ${icu.occupiedBeds}/${icu.totalBeds} (${occupancyPercentage.toFixed(1)}%)`,
      `Critical beds: ${icu.criticalBeds}`,
      `Ventilators: ${icu.ventilatorsAvailable} available, ${icu.ventilatorsInUse} in use`,
      `Devices offline: ${icu.devicesOffline}`,
      `Oxygen demand: ${icu.oxygenDemandLitersPerMinute} L/min`,
    ],
    confidence: 0.95,
    sourceLabel: "Emulated Hospital Telemetry",
    emulated: true,
  };
}

export function createIcuOperationalRecommendation(
  scenarioId: HospitalScenarioId,
  transitionKey: string = scenarioId
): IcuOperationalRecommendation {
  return {
    recommendationId: `rec-icu-capacity-${transitionKey}`,
    scenarioId,
    priority: "preserve-capacity",
    title: "Preserve ICU Critical Infrastructure Capacity",
    description: "Review aggregate ICU capacity, ventilator/device availability, oxygen demand, and dependent infrastructure under an authorized continuity workflow.",
    affectedDomains: ["icu", "oxygen"],
    requiresHumanReview: true,
    infrastructureActions: [
      "Preserve available ICU critical infrastructure capacity.",
      "Prioritize critical infrastructure resources.",
      "Delay only policy-permitted lower-priority compute workloads.",
      "Review aggregate ventilator and device maintenance capacity.",
      "Prepare additional authorized operational support.",
    ],
    medicalDisclaimer: "Infrastructure decision-support only. Not a diagnosis or treatment recommendation.",
    sourceLabel: "MedRouteX Hospital Twin",
    emulated: true,
  };
}

export function resetScenarioRuntime(state: OperationalTwinState): OperationalTwinState {
  return {
    ...state,
    scenarioRuntime: INITIAL_SCENARIO_RUNTIME,
  };
}
