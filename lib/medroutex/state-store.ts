import type { MeshState } from "./types";
import { createInitialMeshState, runScenario } from "./simulator";

let currentState: MeshState | null = null;

export function getCurrentState(): MeshState {
  if (!currentState) {
    currentState = createInitialMeshState();
  }
  return currentState;
}

export function resetCurrentState(): MeshState {
  currentState = createInitialMeshState();
  return currentState;
}

export function runCurrentScenario(): MeshState {
  currentState = runScenario(currentState || undefined);
  return currentState;
}

export function getMetrics(): {
  totalGpus: number;
  activeWorkloads: number;
  criticalWorkloads: number;
  riskyGpus: number;
  idleGpus: number;
  clusterHealth: number;
  estimatedSaving: number;
  scenario: string;
} {
  const state = getCurrentState();
  return {
    totalGpus: state.totalGpus,
    activeWorkloads: state.activeWorkloads,
    criticalWorkloads: state.criticalWorkloads,
    riskyGpus: state.riskyGpus,
    idleGpus: state.idleGpus,
    clusterHealth: state.clusterHealth,
    estimatedSaving: state.estimatedSaving,
    scenario: state.scenario,
  };
}
