import type { MeshState } from "./types";
import {
  applyCrisisScenarioToState,
  getOperationalTwinState,
  resetOperationalTwinState,
} from "../twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "../twin-core/compatibility";
import { getDashboardScenarioId } from "../twin-core/scenario-identity";

function deriveCurrentMeshState(): MeshState {
  const operationalTwinState = getOperationalTwinState();
  return deriveMeshStateFromOperationalTwin(
    operationalTwinState,
    getDashboardScenarioId(operationalTwinState)
  );
}

export function getCurrentState(): MeshState {
  return deriveCurrentMeshState();
}

export function resetCurrentState(): MeshState {
  const operationalTwinState = resetOperationalTwinState();
  return deriveMeshStateFromOperationalTwin(operationalTwinState, "normal_day");
}

export function runCurrentScenario(): MeshState {
  const operationalTwinState = applyCrisisScenarioToState();
  return deriveMeshStateFromOperationalTwin(
    operationalTwinState,
    "medroutex-stroke-crisis"
  );
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
  const state = deriveCurrentMeshState();
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
