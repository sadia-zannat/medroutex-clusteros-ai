/**
 * Twin Core State Store
 * 
 * This module provides a simple in-memory store for the Operational Twin state.
 * All state updates use immutable replacement patterns.
 */

import {
  OperationalTwinState,
} from "./types";
import { createInitialOperationalTwinState } from "./seed";

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
