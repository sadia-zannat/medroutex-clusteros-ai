/**
 * Scenario Execution Engine
 * 
 * Phase 2A: Pure typed scenario execution engine.
 * Validates scenario IDs, applies deterministic transitions, and returns typed results.
 */

import type {
  OperationalTwinState,
  ScenarioExecutionResult,
  IcuContinuityAssessment,
  IcuOperationalRecommendation,
} from "./types";
import { getScenarioById } from "./scenario-catalog";
import { applyCrisisScenario } from "./seed";
import {
  applyIcuCapacityStress,
  createIcuContinuityAssessment,
  createIcuOperationalRecommendation,
} from "./scenario-transitions";
import { createInitialOperationalTwinState } from "./seed";

/**
 * Execute a scenario transition on the operational twin state.
 * 
 * This is the main entry point for scenario execution. It validates the scenario ID,
 * applies the appropriate transition, and returns a typed execution result.
 */
export function executeScenarioTransition(
  state: OperationalTwinState,
  scenarioId: string
): ScenarioExecutionResult {
  // Validate scenario ID against catalog
  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    return {
      success: false,
      outcome: "invalid-request",
      scenarioId,
      scenarioName: "Unknown",
      transitionKey: "",
      stateVersion: state.version,
      previousStateVersion: state.version,
      runtimeState: state.scenarioRuntime,
      hospitalHealthScore: state.overallHealthScore,
      hospitalResilienceScore: state.resilienceSummary.resilienceScore,
      domainScores: {
        compute: state.resilienceSummary.computeScore,
        icu: state.resilienceSummary.icuContinuityScore,
        oxygen: state.resilienceSummary.oxygenContinuityScore,
        power: state.resilienceSummary.powerContinuityScore,
        network: state.resilienceSummary.networkContinuityScore,
      },
      eventsCreated: 0,
      notificationsCreated: 0,
      snapshotCreated: false,
      humanApprovalRequired: false,
      physicalExecutionPerformed: false,
      error: `Unknown scenario ID: ${scenarioId}`,
      metadata: {
        phase: 2,
        deterministic: true,
        sourceLabel: "MedRouteX Hospital Twin",
      },
    };
  }

  // Check if scenario is implemented in Phase 2A
  const phase2AImplementedScenarios = [
    "normal-operations",
    "stroke-compute-crisis",
    "icu-capacity-stress",
  ];

  if (!phase2AImplementedScenarios.includes(scenarioId)) {
    return {
      success: false,
      outcome: "not-implemented",
      scenarioId,
      scenarioName: scenario.name,
      transitionKey: "",
      stateVersion: state.version,
      previousStateVersion: state.version,
      runtimeState: state.scenarioRuntime,
      hospitalHealthScore: state.overallHealthScore,
      hospitalResilienceScore: state.resilienceSummary.resilienceScore,
      domainScores: {
        compute: state.resilienceSummary.computeScore,
        icu: state.resilienceSummary.icuContinuityScore,
        oxygen: state.resilienceSummary.oxygenContinuityScore,
        power: state.resilienceSummary.powerContinuityScore,
        network: state.resilienceSummary.networkContinuityScore,
      },
      eventsCreated: 0,
      notificationsCreated: 0,
      snapshotCreated: false,
      humanApprovalRequired: scenario.requiresHumanApproval,
      physicalExecutionPerformed: false,
      error: `Scenario ${scenarioId} is not implemented in Phase 2A`,
      metadata: {
        phase: 2,
        deterministic: true,
        sourceLabel: "MedRouteX Hospital Twin",
      },
    };
  }

  const transitionTimestamp = new Date().toISOString();
  const deterministicKey = `${scenarioId}-v${state.version}`;
  const transitionKey = deterministicKey;

  // Apply scenario-specific transition
  let newState: OperationalTwinState;
  let eventsCreated = 0;
  let notificationsCreated = 0;
  let snapshotCreated = false;

  switch (scenarioId) {
    case "normal-operations":
      // Map to existing reset behavior
      newState = applyNormalOperations(state, transitionTimestamp);
      eventsCreated = 1; // baseline-reset event
      snapshotCreated = true;
      break;

    case "stroke-compute-crisis":
      // Map to existing Stroke Crisis transition
      const strokeState = applyCrisisScenario(state, transitionTimestamp);
      if (strokeState === state) {
        // Idempotent - already running
        return {
          success: true,
          outcome: "idempotent",
          scenarioId,
          scenarioName: scenario.name,
          transitionKey,
          stateVersion: state.version,
          previousStateVersion: state.version,
          runtimeState: state.scenarioRuntime,
          hospitalHealthScore: state.overallHealthScore,
          hospitalResilienceScore: state.resilienceSummary.resilienceScore,
          domainScores: {
            compute: state.resilienceSummary.computeScore,
            icu: state.resilienceSummary.icuContinuityScore,
            oxygen: state.resilienceSummary.oxygenContinuityScore,
            power: state.resilienceSummary.powerContinuityScore,
            network: state.resilienceSummary.networkContinuityScore,
          },
          eventsCreated: 0,
          notificationsCreated: 0,
          snapshotCreated: false,
          humanApprovalRequired: scenario.requiresHumanApproval,
          physicalExecutionPerformed: false,
          error: null,
          metadata: {
            phase: 2,
            deterministic: true,
            sourceLabel: "MedRouteX Hospital Twin",
          },
        };
      }
      newState = strokeState;
      eventsCreated = 3; // scenario-started, gpu-critical-risk, crisis-summary
      snapshotCreated = true;
      break;

    case "icu-capacity-stress":
      // Apply ICU capacity stress transition
      const icuState = applyIcuCapacityStress(state, transitionTimestamp, transitionKey);
      if (icuState === state) {
        // Idempotent - already running
        return {
          success: true,
          outcome: "idempotent",
          scenarioId,
          scenarioName: scenario.name,
          transitionKey,
          stateVersion: state.version,
          previousStateVersion: state.version,
          runtimeState: state.scenarioRuntime,
          hospitalHealthScore: state.overallHealthScore,
          hospitalResilienceScore: state.resilienceSummary.resilienceScore,
          domainScores: {
            compute: state.resilienceSummary.computeScore,
            icu: state.resilienceSummary.icuContinuityScore,
            oxygen: state.resilienceSummary.oxygenContinuityScore,
            power: state.resilienceSummary.powerContinuityScore,
            network: state.resilienceSummary.networkContinuityScore,
          },
          eventsCreated: 0,
          notificationsCreated: 0,
          snapshotCreated: false,
          humanApprovalRequired: scenario.requiresHumanApproval,
          physicalExecutionPerformed: false,
          error: null,
          metadata: {
            phase: 2,
            deterministic: true,
            sourceLabel: "MedRouteX Hospital Twin",
          },
        };
      }
      newState = icuState;
      eventsCreated = 5; // scenario-started, icu-continuity-degraded, icu-dependency-assessment, icu-recommendation-prepared, icu-capacity-continuity-risk
      notificationsCreated = 1; // one visible ICU notification
      snapshotCreated = true;
      break;

    default:
      return {
        success: false,
        outcome: "invalid-request",
        scenarioId,
        scenarioName: scenario.name,
        transitionKey,
        stateVersion: state.version,
        previousStateVersion: state.version,
        runtimeState: state.scenarioRuntime,
        hospitalHealthScore: state.overallHealthScore,
        hospitalResilienceScore: state.resilienceSummary.resilienceScore,
        domainScores: {
          compute: state.resilienceSummary.computeScore,
          icu: state.resilienceSummary.icuContinuityScore,
          oxygen: state.resilienceSummary.oxygenContinuityScore,
          power: state.resilienceSummary.powerContinuityScore,
          network: state.resilienceSummary.networkContinuityScore,
        },
        eventsCreated: 0,
        notificationsCreated: 0,
        snapshotCreated: false,
        humanApprovalRequired: false,
        physicalExecutionPerformed: false,
        error: `Scenario ${scenarioId} not handled`,
        metadata: {
          phase: 2,
          deterministic: true,
          sourceLabel: "MedRouteX Hospital Twin",
        },
      };
  }

  return {
    success: true,
    outcome: "applied",
    scenarioId,
    scenarioName: scenario.name,
    transitionKey,
    stateVersion: newState.version,
    previousStateVersion: state.version,
    runtimeState: newState.scenarioRuntime,
    fullState: newState,
    hospitalHealthScore: newState.overallHealthScore,
    hospitalResilienceScore: newState.resilienceSummary.resilienceScore,
    domainScores: {
      compute: newState.resilienceSummary.computeScore,
      icu: newState.resilienceSummary.icuContinuityScore,
      oxygen: newState.resilienceSummary.oxygenContinuityScore,
      power: newState.resilienceSummary.powerContinuityScore,
      network: newState.resilienceSummary.networkContinuityScore,
    },
    eventsCreated,
    notificationsCreated,
    snapshotCreated,
    humanApprovalRequired: scenario.requiresHumanApproval,
    physicalExecutionPerformed: false,
    error: null,
    metadata: {
      phase: 2,
      deterministic: true,
      sourceLabel: "MedRouteX Hospital Twin",
    },
  };
}

/**
 * Apply normal-operations scenario (maps to existing reset behavior).
 */
function applyNormalOperations(
  state: OperationalTwinState,
  transitionTimestamp: string
): OperationalTwinState {
  // If already at baseline, return idempotent
  if (state.scenarioRuntime.activeScenarioId === null && state.activeSimulation === null) {
    return state;
  }

  const baselineState = createInitialOperationalTwinState();

  return {
    ...baselineState,
    generatedAt: transitionTimestamp,
    lastSynchronizedAt: transitionTimestamp,
  };
}

/**
 * Get ICU continuity assessment for the current state.
 */
export function getIcuContinuityAssessment(
  state: OperationalTwinState
): IcuContinuityAssessment | null {
  if (state.scenarioRuntime.activeScenarioId !== "icu-capacity-stress") {
    return null;
  }
  return createIcuContinuityAssessment(state);
}

/**
 * Get ICU operational recommendation for the current state.
 */
export function getIcuOperationalRecommendation(
  state: OperationalTwinState
): IcuOperationalRecommendation | null {
  if (state.scenarioRuntime.activeScenarioId !== "icu-capacity-stress") {
    return null;
  }
  return createIcuOperationalRecommendation(state.scenarioRuntime.activeScenarioId);
}
