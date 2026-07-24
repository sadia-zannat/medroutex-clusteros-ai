/**
 * Canonical deterministic hospital scenario execution engine.
 */

import type {
  HospitalScenarioId,
  IcuContinuityAssessment,
  IcuOperationalRecommendation,
  OperationalTwinState,
  ScenarioExecutionResult,
} from "./types";
import { getScenarioById, isHospitalScenarioId } from "./scenario-catalog";
import { applyCrisisScenario, createInitialOperationalTwinState } from "./seed";
import {
  applyHospitalCascadeCrisis,
  applyIcuCapacityStress,
  applyNetworkContinuityFailure,
  applyOxygenContinuityRisk,
  applyPowerContinuityFailure,
  createIcuContinuityAssessment,
  createIcuOperationalRecommendation,
  enrichStrokeScenario,
} from "./scenario-transitions";

function resultFromState(input: {
  previous: OperationalTwinState;
  next: OperationalTwinState;
  scenarioId: string;
  scenarioName: string;
  outcome: ScenarioExecutionResult["outcome"];
  success: boolean;
  transitionKey: string;
  error?: string | null;
}): ScenarioExecutionResult {
  const { previous, next } = input;
  return {
    success: input.success,
    outcome: input.outcome,
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    transitionKey: input.transitionKey,
    stateVersion: next.version,
    previousStateVersion: previous.version,
    runtimeState: next.scenarioRuntime,
    ...(next !== previous ? { fullState: next } : {}),
    hospitalHealthScore: next.overallHealthScore,
    hospitalResilienceScore: next.resilienceSummary.resilienceScore,
    domainScores: {
      compute: next.resilienceSummary.computeScore,
      icu: next.resilienceSummary.icuContinuityScore,
      oxygen: next.resilienceSummary.oxygenContinuityScore,
      power: next.resilienceSummary.powerContinuityScore,
      network: next.resilienceSummary.networkContinuityScore,
    },
    eventsCreated: Math.max(0, next.operationalEvents.length - previous.operationalEvents.length),
    notificationsCreated: Math.max(0, next.notifications.length - previous.notifications.length),
    incidentsCreated: Math.max(0, next.activeIncidents.length - previous.activeIncidents.length),
    snapshotCreated: next.snapshots.length > previous.snapshots.length,
    humanApprovalRequired: next.scenarioRuntime.humanApprovalRequired,
    physicalExecutionPerformed: false,
    error: input.error ?? null,
    metadata: {
      phase: 2,
      deterministic: true,
      sourceLabel: "MedRouteX Hospital Twin",
    },
  };
}

function invalidResult(
  state: OperationalTwinState,
  scenarioId: string,
  error: string
): ScenarioExecutionResult {
  const scenario = getScenarioById(scenarioId);
  return resultFromState({
    previous: state,
    next: state,
    scenarioId,
    scenarioName: scenario?.name ?? "Unknown Scenario",
    outcome: "invalid-request",
    success: false,
    transitionKey: state.scenarioRuntime.transitionKey ?? "",
    error,
  });
}

function normalOperations(state: OperationalTwinState): OperationalTwinState {
  const baseline = createInitialOperationalTwinState();
  return {
    ...baseline,
    liveHardwareGpu: state.liveHardwareGpu,
    persistence: state.persistence,
  };
}

export function executeScenarioTransition(
  state: OperationalTwinState,
  scenarioIdValue: string
): ScenarioExecutionResult {
  if (!isHospitalScenarioId(scenarioIdValue)) {
    return invalidResult(state, scenarioIdValue, `Unknown scenario ID: ${scenarioIdValue}`);
  }
  const scenarioId: HospitalScenarioId = scenarioIdValue;
  const scenario = getScenarioById(scenarioId);
  if (!scenario) return invalidResult(state, scenarioId, `Unknown scenario ID: ${scenarioId}`);

  if (scenarioId === "normal-operations") {
    const alreadyBaseline =
      state.scenarioRuntime.activeScenarioId === null &&
      state.activeSimulation === null &&
      state.activeIncidents.length === 0 &&
      state.notifications.length === 0 &&
      state.overallHealthScore === 88 &&
      state.resilienceSummary.resilienceScore === 91;
    if (alreadyBaseline) {
      return resultFromState({
        previous: state,
        next: state,
        scenarioId,
        scenarioName: scenario.name,
        outcome: "idempotent",
        success: true,
        transitionKey: "normal-operations-baseline",
      });
    }
    const next = normalOperations(state);
    return resultFromState({
      previous: state,
      next,
      scenarioId,
      scenarioName: scenario.name,
      outcome: "applied",
      success: true,
      transitionKey: "normal-operations-baseline",
    });
  }

  if (state.scenarioRuntime.activeScenarioId === scenarioId) {
    return resultFromState({
      previous: state,
      next: state,
      scenarioId,
      scenarioName: scenario.name,
      outcome: "idempotent",
      success: true,
      transitionKey: state.scenarioRuntime.transitionKey ?? `${scenarioId}-active`,
    });
  }

  if (
    state.scenarioRuntime.activeScenarioId !== null ||
    state.activeSimulation !== null
  ) {
    return invalidResult(
      state,
      scenarioId,
      "RESET_REQUIRED: restore Normal Operations before running a different scenario."
    );
  }

  const timestamp = new Date().toISOString();
  const transitionKey = `${scenarioId}-v${state.version}`;
  let next: OperationalTwinState;

  switch (scenarioId) {
    case "stroke-compute-crisis": {
      const crisis = applyCrisisScenario(state, timestamp);
      next = enrichStrokeScenario(crisis, timestamp, transitionKey);
      break;
    }
    case "icu-capacity-stress":
      next = applyIcuCapacityStress(state, timestamp, transitionKey);
      break;
    case "oxygen-continuity-risk":
      next = applyOxygenContinuityRisk(state, timestamp, transitionKey);
      break;
    case "power-continuity-failure":
      next = applyPowerContinuityFailure(state, timestamp, transitionKey);
      break;
    case "network-continuity-failure":
      next = applyNetworkContinuityFailure(state, timestamp, transitionKey);
      break;
    case "hospital-cascade-crisis":
      next = applyHospitalCascadeCrisis(state, timestamp, transitionKey);
      break;
    default:
      return invalidResult(state, scenarioId, `Scenario ${scenarioId} is not executable.`);
  }

  return resultFromState({
    previous: state,
    next,
    scenarioId,
    scenarioName: scenario.name,
    outcome: next === state ? "idempotent" : "applied",
    success: true,
    transitionKey: next.scenarioRuntime.transitionKey ?? transitionKey,
  });
}

export function getIcuContinuityAssessment(
  state: OperationalTwinState
): IcuContinuityAssessment | null {
  if (
    state.scenarioRuntime.activeScenarioId !== "icu-capacity-stress" &&
    state.scenarioRuntime.activeScenarioId !== "hospital-cascade-crisis"
  ) {
    return null;
  }
  return createIcuContinuityAssessment(state);
}

export function getIcuOperationalRecommendation(
  state: OperationalTwinState
): IcuOperationalRecommendation | null {
  const scenarioId = state.scenarioRuntime.activeScenarioId;
  if (
    scenarioId !== "icu-capacity-stress" &&
    scenarioId !== "hospital-cascade-crisis"
  ) {
    return null;
  }
  return createIcuOperationalRecommendation(
    scenarioId,
    state.scenarioRuntime.transitionKey ?? scenarioId
  );
}
