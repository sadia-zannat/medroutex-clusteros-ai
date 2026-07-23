/**
 * Scenario Transitions
 * 
 * Phase 2A: Deterministic scenario transition implementations.
 * Each scenario applies server-owned mutations to the canonical twin state.
 */

import type {
  OperationalTwinState,
  ScenarioRuntimeState,
  IcuContinuityAssessment,
  IcuOperationalRecommendation,
  OperationalEvent,
  OperationalIncident,
  OperationalNotification,
} from "./types";
import {
  appendHospitalSnapshot,
  calculateHospitalResilience,
  deriveHospitalDomains,
} from "./resilience";
import { appendOperationalEvents } from "./operational-events";
import { INITIAL_SCENARIO_RUNTIME } from "./seed";

/**
 * Apply ICU capacity stress scenario to the operational twin state.
 * 
 * This creates deterministic ICU domain stress:
 * - Occupancy at or above 90%
 * - Increased critical-bed demand
 * - Reduced available ventilators
 * - Increased ventilators in use
 * - At least one aggregate ICU device offline
 * - Increased oxygen demand
 * - ICU status degraded or critical
 * - ICU continuity score below baseline 90
 * - Hospital resilience below baseline 91
 */
export function applyIcuCapacityStress(
  state: OperationalTwinState,
  transitionTimestamp: string,
  transitionKey: string
): OperationalTwinState {
  // Idempotency check: if ICU scenario is already active, return state unchanged
  if (state.scenarioRuntime.activeScenarioId === "icu-capacity-stress") {
    return state;
  }

  const version = state.version + 1;

  // Mutate ICU entities to create capacity stress
  const entities = state.entities.map((entity) => {
    if (entity.id === "icu-capacity-01") {
      return {
        ...entity,
        status: "critical" as const,
        healthScore: 65,
        riskScore: 35,
        lastUpdated: transitionTimestamp,
        attributes: {
          ...entity.attributes,
          totalBeds: 24,
          occupiedBeds: 22, // 91.7% occupancy
          criticalBeds: 10, // Increased critical demand
          oxygenDemandLitersPerMinute: 750, // Increased oxygen demand
        },
        tags: [...new Set([...entity.tags, "capacity-stress"])],
      };
    }
    if (entity.id === "icu-ventilator-aggregate-01") {
      return {
        ...entity,
        status: "healthy" as const,
        healthScore: 70,
        riskScore: 30,
        lastUpdated: transitionTimestamp,
        attributes: {
          ...entity.attributes,
          ventilatorsAvailable: 2, // Reduced from 4
          ventilatorsInUse: 10, // Increased from 8
          devicesOffline: 2, // At least one device offline
        },
        tags: [...new Set([...entity.tags, "ventilator-stress"])],
      };
    }
    return entity;
  });

  // Update scenario runtime state
  const scenarioRuntime: ScenarioRuntimeState = {
    activeScenarioId: "icu-capacity-stress",
    scenarioStatus: "running",
    startedAt: transitionTimestamp,
    lastTransitionAt: transitionTimestamp,
    stateVersionStarted: version,
    affectedDomains: ["icu", "oxygen"],
    severity: "high",
    activeIncidentIds: [],
    rootCauseIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
    transitionKey,
    executionCount: 1,
    recoveryStatus: "not-recovering",
    humanApprovalRequired: true,
    physicalExecutionPerformed: false,
    metadata: {
      phase: 2,
      deterministic: true,
      patientData: false,
      diagnosis: false,
      actuatorExecution: false,
    },
  };

  const stateWithScenario: OperationalTwinState = {
    ...state,
    version,
    entities,
    scenarioRuntime,
  };

  // Recalculate domains and resilience
  const domains = deriveHospitalDomains(stateWithScenario);
  const resilienceSummary = calculateHospitalResilience(domains, stateWithScenario);

  const stateWithResilience: OperationalTwinState = {
    ...stateWithScenario,
    domains,
    resilienceSummary,
    overallHealthScore: resilienceSummary.resilienceScore,
    overallRiskScore: 100 - resilienceSummary.resilienceScore,
    overallStatus: resilienceSummary.overallHospitalStatus === "operational"
      ? "healthy"
      : resilienceSummary.overallHospitalStatus === "degraded"
        ? "warning"
        : resilienceSummary.overallHospitalStatus === "critical"
          ? "critical"
          : "offline",
  };

  // Create snapshot
  const stateWithSnapshot = appendHospitalSnapshot(
    stateWithResilience,
    "scenario",
    transitionTimestamp
  );

  // Create operational events for ICU scenario (4 history events + 1 visible notification event)
  const icuEvents: OperationalEvent[] = [
    {
      id: `event-scenario-started-${transitionTimestamp}`,
      eventType: "scenario-started",
      category: "scenario",
      domain: "icu",
      severity: "warning",
      status: "active",
      title: "ICU Capacity Stress Scenario Started",
      message: "ICU bed occupancy exceeds 90% with limited ventilator availability.",
      reason: "Deterministic scenario transition applied to test infrastructure resilience.",
      timestamp: transitionTimestamp,
      sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
      scenarioId: "icu-capacity-stress",
      correlationId: transitionKey,
      dedupeKey: `scenario-started:${transitionKey}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        scenarioId: "icu-capacity-stress",
        scenarioName: "ICU Capacity Stress",
        affectedDomains: ["icu", "oxygen"],
      },
      stateVersion: version,
    },
    {
      id: `event-icu-continuity-degraded-${transitionTimestamp}`,
      eventType: "icu-capacity-critical",
      category: "risk",
      domain: "icu",
      severity: "critical",
      status: "active",
      title: "ICU Continuity Degraded",
      message: "ICU bed occupancy at 91.7% with 10 critical beds and limited ventilator availability.",
      reason: "ICU capacity stress scenario applied - occupancy exceeds 90% threshold.",
      timestamp: transitionTimestamp,
      sourceEntityIds: ["icu-capacity-01"],
      scenarioId: "icu-capacity-stress",
      correlationId: transitionKey,
      dedupeKey: `icu-continuity-degraded:${transitionKey}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        occupancyPercentage: 91.7,
        criticalBeds: 10,
        ventilatorsAvailable: 2,
        devicesOffline: 2,
        oxygenDemand: 750,
      },
      stateVersion: version,
    },
    {
      id: `event-icu-dependency-assessment-${transitionTimestamp}`,
      eventType: "system-event",
      category: "risk",
      domain: "icu",
      severity: "warning",
      status: "active",
      title: "ICU Dependency Assessment Completed",
      message: "ICU capacity stress affects oxygen pipeline and ventilator aggregate dependencies.",
      reason: "ICU capacity stress scenario applied - dependency assessment completed.",
      timestamp: transitionTimestamp,
      sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
      scenarioId: "icu-capacity-stress",
      correlationId: transitionKey,
      dedupeKey: `icu-dependency-assessment:${transitionKey}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        affectedDependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
      },
      stateVersion: version,
    },
    {
      id: `event-icu-recommendation-prepared-${transitionTimestamp}`,
      eventType: "system-event",
      category: "plan",
      domain: "icu",
      severity: "warning",
      status: "active",
      title: "ICU Operational Recommendation Prepared",
      message: "ICU capacity stress operational recommendation prepared with human review requirement.",
      reason: "ICU operational recommendation prepared with human review requirement.",
      timestamp: transitionTimestamp,
      sourceEntityIds: ["icu-capacity-01"],
      scenarioId: "icu-capacity-stress",
      recommendationId: `rec-icu-capacity-${Date.now()}`,
      correlationId: transitionKey,
      dedupeKey: `icu-recommendation-prepared:${transitionKey}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        recommendationId: `rec-icu-capacity-${Date.now()}`,
        requiresHumanReview: true,
      },
      stateVersion: version,
    },
    {
      id: `event-icu-capacity-continuity-risk-${transitionTimestamp}`,
      eventType: "icu-capacity-critical",
      category: "risk",
      domain: "icu",
      severity: "critical",
      status: "active",
      title: "ICU Capacity Continuity Risk",
      message: "ICU bed occupancy at 91.7% (22/24) with 10 critical beds, 2 ventilators available, 2 devices offline, oxygen demand 750 L/min. Affected dependencies: icu-capacity-01, icu-ventilator-aggregate-01, oxygen-pipeline-01. Human review required. Source: Emulated Hospital Telemetry.",
      reason: "ICU capacity stress scenario applied - occupancy exceeds 90% threshold with limited ventilator availability and increased oxygen demand.",
      timestamp: transitionTimestamp,
      sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
      scenarioId: "icu-capacity-stress",
      correlationId: transitionKey,
      dedupeKey: `icu-capacity-continuity-risk:${transitionKey}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        occupancyPercentage: 91.7,
        criticalBeds: 10,
        ventilatorsAvailable: 2,
        ventilatorsInUse: 10,
        devicesOffline: 2,
        oxygenDemand: 750,
        affectedDependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
        requiresHumanReview: true,
        sourceLabel: "Emulated Hospital Telemetry",
      },
      stateVersion: version,
    },
  ];

  const eventResult = appendOperationalEvents(stateWithSnapshot, icuEvents);

  // Create exactly one visible notification for ICU scenario
  const icuNotification: OperationalNotification = {
    id: `notification-icu-capacity-continuity-${transitionKey}`,
    eventId: `event-icu-capacity-continuity-risk-${transitionTimestamp}`,
    eventType: "icu-capacity-critical",
    category: "risk",
    domain: "icu",
    severity: "critical",
    title: "ICU Capacity Continuity Risk",
    message: "ICU bed occupancy at 91.7% (22/24) with 10 critical beds, 2 ventilators available, 2 devices offline, oxygen demand 750 L/min. Affected dependencies: icu-capacity-01, icu-ventilator-aggregate-01, oxygen-pipeline-01. Human review required. Source: Emulated Hospital Telemetry.",
    reason: "ICU capacity stress scenario applied - occupancy exceeds 90% threshold with limited ventilator availability and increased oxygen demand.",
    explanation: "Created by the centralized MedRouteX transition rule for this operational event.",
    timestamp: transitionTimestamp,
    sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
    targetRoles: ["ICU Operations", "Hospital Administrator"],
    correlationId: transitionKey,
    dedupeKey: `notification:icu-capacity-continuity:${transitionKey}`,
    cooldownSeconds: 1200,
    emailEligible: true,
    lifecycleStatus: "active",
    lifecycleUpdatedAt: transitionTimestamp,
    lifecycleStateVersion: version,
    simulationOnly: true,
    source: "MedRouteX Hospital Twin",
    metadata: {
      occupancyPercentage: 91.7,
      criticalBeds: 10,
      ventilatorsAvailable: 2,
      ventilatorsInUse: 10,
      devicesOffline: 2,
      oxygenDemand: 750,
      affectedDependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
      requiresHumanReview: true,
      sourceLabel: "Emulated Hospital Telemetry",
    },
    stateVersion: version,
  };

  const stateWithNotification = {
    ...eventResult.state,
    notifications: [...eventResult.state.notifications, icuNotification],
  };

  // Create ICU incident
  const icuIncident: OperationalIncident = {
    id: `incident-icu-capacity-continuity-${transitionKey}`,
    domain: "icu",
    severity: "critical",
    title: "ICU Capacity Continuity Risk",
    status: "active",
    openedAt: transitionTimestamp,
    updatedAt: transitionTimestamp,
    correlationId: transitionKey,
    sourceEntityIds: ["icu-capacity-01", "icu-ventilator-aggregate-01"],
    affectedZones: ["zone-icu"],
    reason: "ICU bed occupancy at 91.7% with limited ventilator availability and increased oxygen demand.",
    simulationOnly: true,
  };

  const stateWithIncident = {
    ...stateWithNotification,
    activeIncidents: [...stateWithNotification.activeIncidents, icuIncident],
  };

  // Update scenario runtime with incident ID
  const stateWithRuntime = {
    ...stateWithIncident,
    scenarioRuntime: {
      ...stateWithIncident.scenarioRuntime,
      activeIncidentIds: [icuIncident.id],
    },
  };

  return stateWithRuntime;
}

/**
 * Create ICU continuity assessment for the current state.
 */
export function createIcuContinuityAssessment(
  state: OperationalTwinState
): IcuContinuityAssessment {
  const icuCapacity = state.entities.find((e) => e.id === "icu-capacity-01");
  const icuVentilators = state.entities.find(
    (e) => e.id === "icu-ventilator-aggregate-01"
  );

  const totalBeds = (icuCapacity?.attributes.totalBeds as number) ?? 24;
  const occupiedBeds = (icuCapacity?.attributes.occupiedBeds as number) ?? 18;
  const criticalBeds = (icuCapacity?.attributes.criticalBeds as number) ?? 6;
  const oxygenDemand =
    (icuCapacity?.attributes.oxygenDemandLitersPerMinute as number) ?? 620;
  const ventilatorsAvailable =
    (icuVentilators?.attributes.ventilatorsAvailable as number) ?? 4;
  const ventilatorsInUse =
    (icuVentilators?.attributes.ventilatorsInUse as number) ?? 8;
  const devicesOffline =
    (icuVentilators?.attributes.devicesOffline as number) ?? 0;

  const occupancyPercentage = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

  // Calculate continuity score based on multiple factors
  const occupancyScore = occupancyPercentage > 90 ? 30 : occupancyPercentage > 75 ? 60 : 90;
  const ventilatorScore = ventilatorsAvailable < 3 ? 40 : ventilatorsAvailable < 4 ? 70 : 95;
  const deviceScore = devicesOffline > 0 ? 50 : 100;
  const continuityScore = Math.round((occupancyScore + ventilatorScore + deviceScore) / 3);

  const status = continuityScore < 60 ? "critical" : continuityScore < 80 ? "degraded" : "operational";

  const evidence = [
    `Occupancy: ${occupiedBeds}/${totalBeds} (${occupancyPercentage.toFixed(1)}%)`,
    `Critical beds: ${criticalBeds}`,
    `Ventilators: ${ventilatorsAvailable} available, ${ventilatorsInUse} in use`,
    `Devices offline: ${devicesOffline}`,
    `Oxygen demand: ${oxygenDemand} L/min`,
  ];

  return {
    totalBeds,
    occupiedBeds,
    occupancyPercentage,
    criticalBedDemand: criticalBeds,
    ventilatorsAvailable,
    ventilatorsInUse,
    devicesOffline,
    oxygenDemandLitersPerMinute: oxygenDemand,
    continuityScore,
    status,
    affectedDomains: ["icu", "oxygen"],
    affectedDependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
    evidence,
    confidence: 0.95,
    sourceLabel: "Emulated Hospital Telemetry",
    emulated: true,
  };
}

/**
 * Create ICU operational recommendation for capacity stress.
 */
export function createIcuOperationalRecommendation(
  scenarioId: string
): IcuOperationalRecommendation {
  return {
    recommendationId: `rec-icu-capacity-${Date.now()}`,
    scenarioId,
    priority: "preserve-capacity",
    title: "Preserve ICU Critical Infrastructure Capacity",
    description: "ICU bed occupancy exceeds 90% with limited ventilator availability. Prioritize critical infrastructure resources and review device maintenance capacity.",
    affectedDomains: ["icu", "oxygen"],
    requiresHumanReview: true,
    infrastructureActions: [
      "Preserve available ICU critical infrastructure capacity",
      "Prioritize critical infrastructure resources for ICU operations",
      "Delay only policy-permitted lower-priority compute workloads",
      "Review ventilator and device maintenance capacity",
      "Prepare additional authorized operational support",
    ],
    medicalDisclaimer: "Infrastructure decision-support only. Not a diagnosis or treatment recommendation.",
    sourceLabel: "MedRouteX Hospital Twin",
    emulated: true,
  };
}

/**
 * Reset scenario runtime to initial state.
 * Used by reset API to clear scenario state.
 */
export function resetScenarioRuntime(state: OperationalTwinState): OperationalTwinState {
  return {
    ...state,
    scenarioRuntime: INITIAL_SCENARIO_RUNTIME,
  };
}
