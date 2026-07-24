import type { OperationalTwinState, TwinEntity } from "./types";

const STROKE_SCENARIO_ID = "stroke-compute-crisis" as const;
const LEGACY_STROKE_SCENARIO_ID = "medroutex-stroke-crisis" as const;
const COMPUTE_CRISIS_ENTITY_IDS = new Set([
  "compute-local-gpu-02",
  "compute-local-gpu-03",
]);

function numericAttribute(entity: TwinEntity, key: string): number | null {
  const value = entity.attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Returns the scenario identifier used by the legacy dashboard/API preview.
 * The canonical scenario runtime wins over the generic compute simulation ID,
 * so cross-domain scenarios never appear as a stroke-only crisis.
 */
export function getDashboardScenarioId(state: OperationalTwinState): string {
  const activeScenarioId = state.scenarioRuntime.activeScenarioId;
  if (activeScenarioId === null) return "normal_day";
  if (activeScenarioId === STROKE_SCENARIO_ID) {
    return LEGACY_STROKE_SCENARIO_ID;
  }
  return activeScenarioId;
}

/**
 * Detects whether the canonical compute telemetry currently contains the
 * deterministic local GPU crisis. This is telemetry-driven rather than based
 * on the overall hospital status, because Hospital Sync can legitimately leave
 * the overall status at warning while the GPU crisis remains active.
 */
export function hasComputeCrisisTelemetry(
  state: Pick<OperationalTwinState, "entities">
): boolean {
  return state.entities.some((entity) => {
    if (
      entity.entityType !== "compute-node" ||
      !COMPUTE_CRISIS_ENTITY_IDS.has(entity.id)
    ) {
      return false;
    }

    const temperatureC = numericAttribute(entity, "temperatureC");
    const memoryUsedMiB = numericAttribute(entity, "memoryUsedMiB");
    const memoryTotalMiB = numericAttribute(entity, "memoryTotalMiB");
    const memoryRatio =
      memoryUsedMiB !== null && memoryTotalMiB !== null && memoryTotalMiB > 0
        ? memoryUsedMiB / memoryTotalMiB
        : 0;

    return (
      entity.status === "critical" ||
      entity.riskScore >= 70 ||
      (temperatureC !== null && temperatureC >= 85) ||
      memoryRatio >= 0.9
    );
  });
}
