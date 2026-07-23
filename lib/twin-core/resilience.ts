import {
  RESILIENCE_MODEL_BOUNDARY,
  type HospitalDomainState,
  type HospitalOperationalStatus,
  type HospitalResilienceSummary,
  type HospitalSnapshotTrigger,
  type OperationalTwinState,
  type TelemetryValue,
  type TwinEntity,
  type TwinSnapshot,
} from "./types";

export const MAX_HOSPITAL_TWIN_SNAPSHOTS = 120;

function numberAttribute(
  entity: TwinEntity | undefined,
  metric: string,
  fallback: number
): number {
  const value: TelemetryValue | undefined = entity?.attributes[metric];
  return typeof value === "number" ? value : fallback;
}

function stringAttribute(
  entity: TwinEntity | undefined,
  metric: string,
  fallback: string
): string {
  const value: TelemetryValue | undefined = entity?.attributes[metric];
  return typeof value === "string" ? value : fallback;
}

function asHospitalStatus(value: string): HospitalOperationalStatus {
  if (
    value === "operational" ||
    value === "degraded" ||
    value === "critical" ||
    value === "offline"
  ) {
    return value;
  }
  return "degraded";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveHospitalDomains(
  state: Pick<
    OperationalTwinState,
    "entities" | "overallHealthScore" | "overallStatus"
  >
): HospitalDomainState {
  const entityById = new Map(
    state.entities.map((entity) => [entity.id, entity])
  );
  const icuUnit = entityById.get("icu-unit-01");
  const icuCapacity = entityById.get("icu-capacity-01");
  const ventilators = entityById.get("icu-ventilator-aggregate-01");
  const oxygenTank = entityById.get("oxygen-main-tank-01");
  const oxygenReserve = entityById.get("oxygen-reserve-bank-01");
  const oxygenPipeline = entityById.get("oxygen-pipeline-01");
  const powerGrid = entityById.get("power-main-grid-01");
  const powerUps = entityById.get("power-ups-01");
  const generator = entityById.get("power-generator-01");
  const oxygenCircuit = entityById.get("power-circuit-oxygen-01");
  const icuCircuit = entityById.get("power-circuit-icu-01");
  const gpuCircuit = entityById.get("power-circuit-gpu-01");
  const localLink = entityById.get("network-local-link-01");
  const centralLink = entityById.get("network-central-link-01");
  const cloudLink = entityById.get("network-cloud-link-01");
  const computeEntities = state.entities.filter(
    (entity) => entity.entityType === "compute-node"
  );

  return {
    compute: {
      operationalStatus:
        state.overallStatus === "critical" ? "degraded" : "operational",
      healthScore: state.overallHealthScore,
      totalGpus: computeEntities.length,
      riskyGpus: computeEntities.filter(
        (entity) => entity.status === "critical" || entity.riskScore >= 50
      ).length,
      workloadCount: state.entities.filter(
        (entity) => entity.entityType === "workload"
      ).length,
      sourceLabel: "Synthetic GPU Telemetry",
    },
    icu: {
      operationalStatus: asHospitalStatus(
        stringAttribute(icuUnit, "operationalStatus", "operational")
      ),
      totalBeds: numberAttribute(icuCapacity, "totalBeds", 24),
      occupiedBeds: numberAttribute(icuCapacity, "occupiedBeds", 18),
      criticalBeds: numberAttribute(icuCapacity, "criticalBeds", 6),
      ventilatorsAvailable: numberAttribute(
        ventilators,
        "ventilatorsAvailable",
        4
      ),
      ventilatorsInUse: numberAttribute(ventilators, "ventilatorsInUse", 8),
      devicesOffline: numberAttribute(ventilators, "devicesOffline", 0),
      oxygenDemandLitersPerMinute: numberAttribute(
        icuCapacity,
        "oxygenDemandLitersPerMinute",
        620
      ),
      sourceLabel: "Emulated Hospital Telemetry",
    },
    oxygen: {
      operationalStatus: asHospitalStatus(
        stringAttribute(oxygenPipeline, "operationalStatus", "operational")
      ),
      mainTankPercent: numberAttribute(oxygenTank, "mainTankPercent", 78),
      pipelinePressureBar: numberAttribute(
        oxygenPipeline,
        "pipelinePressureBar",
        4.2
      ),
      currentDemandLitersPerMinute: numberAttribute(
        oxygenPipeline,
        "currentDemandLitersPerMinute",
        620
      ),
      reserveCylinderCount: numberAttribute(
        oxygenReserve,
        "reserveCylinderCount",
        18
      ),
      reserveBankStatus: asHospitalStatus(
        stringAttribute(oxygenReserve, "operationalStatus", "operational")
      ),
      refillEtaMinutes: numberAttribute(oxygenTank, "refillEtaMinutes", 240),
      estimatedMinutesToDepletion: numberAttribute(
        oxygenTank,
        "estimatedMinutesToDepletion",
        720
      ),
      leakAnomalyRisk: numberAttribute(
        oxygenPipeline,
        "leakAnomalyRisk",
        0.02
      ),
      sourceLabel: "Emulated Hospital Telemetry",
    },
    power: {
      operationalStatus: asHospitalStatus(
        stringAttribute(powerGrid, "operationalStatus", "operational")
      ),
      gridStatus: asHospitalStatus(
        stringAttribute(powerGrid, "gridStatus", "operational")
      ),
      totalLoadKw: numberAttribute(powerGrid, "totalLoadKw", 640),
      criticalLoadKw: numberAttribute(powerGrid, "criticalLoadKw", 410),
      upsPercent: numberAttribute(powerUps, "upsPercent", 96),
      upsRuntimeMinutes: numberAttribute(powerUps, "upsRuntimeMinutes", 48),
      generatorStatus:
        stringAttribute(generator, "generatorStatus", "standby") === "running"
          ? "running"
          : stringAttribute(generator, "generatorStatus", "standby") ===
              "offline"
            ? "offline"
            : "standby",
      generatorFuelPercent: numberAttribute(
        generator,
        "generatorFuelPercent",
        82
      ),
      oxygenPlantPowerStatus: asHospitalStatus(
        stringAttribute(oxygenCircuit, "operationalStatus", "operational")
      ),
      icuPowerStatus: asHospitalStatus(
        stringAttribute(icuCircuit, "operationalStatus", "operational")
      ),
      gpuDataCenterPowerStatus: asHospitalStatus(
        stringAttribute(gpuCircuit, "operationalStatus", "operational")
      ),
      sourceLabel: "Emulated Hospital Telemetry",
    },
    network: {
      operationalStatus: asHospitalStatus(
        stringAttribute(centralLink, "operationalStatus", "operational")
      ),
      localLinkStatus: asHospitalStatus(
        stringAttribute(localLink, "operationalStatus", "operational")
      ),
      centralLinkStatus: asHospitalStatus(
        stringAttribute(centralLink, "operationalStatus", "operational")
      ),
      cloudLinkStatus: asHospitalStatus(
        stringAttribute(cloudLink, "operationalStatus", "operational")
      ),
      centralLatencyMs: numberAttribute(centralLink, "latencyMs", 38),
      packetLossPercent: numberAttribute(
        centralLink,
        "packetLossPercent",
        0.2
      ),
      heartbeatTimestamp: stringAttribute(
        centralLink,
        "heartbeatTimestamp",
        centralLink?.lastHeartbeatAt ?? "2024-01-15T10:30:00.000Z"
      ),
      sourceLabel: "Emulated Hospital Telemetry",
    },
  };
}

export function calculateHospitalResilience(
  domains: HospitalDomainState,
  state: Pick<OperationalTwinState, "latestTelemetry" | "relationships">
): HospitalResilienceSummary {
  const occupancyRatio =
    domains.icu.totalBeds === 0
      ? 1
      : domains.icu.occupiedBeds / domains.icu.totalBeds;
  const icuScore = clampScore(
    100 -
      occupancyRatio * 8 -
      domains.icu.devicesOffline * 10 -
      Math.max(
        0,
        domains.icu.criticalBeds - domains.icu.ventilatorsAvailable
      ) *
        2
  );
  const oxygenScore = clampScore(
    domains.oxygen.mainTankPercent * 0.45 +
      Math.min(domains.oxygen.pipelinePressureBar / 4.2, 1) * 25 +
      Math.min(domains.oxygen.estimatedMinutesToDepletion / 720, 1) * 20 +
      (1 - domains.oxygen.leakAnomalyRisk) * 10
  );
  const powerScore = clampScore(
    (domains.power.gridStatus === "operational" ? 30 : 0) +
      domains.power.upsPercent * 0.25 +
      Math.min(domains.power.upsRuntimeMinutes / 48, 1) * 20 +
      (domains.power.generatorStatus !== "offline" ? 15 : 0) +
      (domains.power.oxygenPlantPowerStatus === "operational" &&
      domains.power.icuPowerStatus === "operational" &&
      domains.power.gpuDataCenterPowerStatus === "operational"
        ? 10
        : 0)
  );
  const operationalLinks = [
    domains.network.localLinkStatus,
    domains.network.centralLinkStatus,
    domains.network.cloudLinkStatus,
  ].filter((status) => status === "operational").length;
  const networkScore = clampScore(
    operationalLinks * 20 +
      Math.max(0, 20 - domains.network.centralLatencyMs / 5) +
      Math.max(0, 20 - domains.network.packetLossPercent * 5)
  );
  const computeScore = clampScore(domains.compute.healthScore);

  const staleProviders = new Set(
    state.latestTelemetry
      .filter((point) => point.isStale || point.quality === "stale")
      .map((point) => point.provider)
  );
  const offlineProviders = new Set(
    state.latestTelemetry
      .filter((point) => point.quality === "offline")
      .map((point) => point.provider)
  );
  const criticalDependencyCount = state.relationships.filter(
    (relationship) =>
      relationship.enabled && relationship.criticality === "critical"
  ).length;
  const resilienceScore = clampScore(
    computeScore * 0.3 +
      icuScore * 0.2 +
      oxygenScore * 0.2 +
      powerScore * 0.15 +
      networkScore * 0.15
  );

  const domainStatuses: HospitalOperationalStatus[] = [
    domains.compute.operationalStatus,
    domains.icu.operationalStatus,
    domains.oxygen.operationalStatus,
    domains.power.operationalStatus,
    domains.network.operationalStatus,
  ];
  const overallHospitalStatus: HospitalOperationalStatus =
    domainStatuses.includes("offline")
      ? "offline"
      : domainStatuses.includes("critical")
        ? "critical"
        : domainStatuses.includes("degraded")
          ? "degraded"
          : "operational";

  return {
    overallHospitalStatus,
    resilienceScore,
    computeScore,
    icuContinuityScore: icuScore,
    oxygenContinuityScore: oxygenScore,
    powerContinuityScore: powerScore,
    networkContinuityScore: networkScore,
    staleSourceCount: staleProviders.size,
    offlineSourceCount: offlineProviders.size,
    criticalDependencyCount,
    formula:
      "30% Compute + 20% ICU + 20% Oxygen + 15% Power + 15% Network",
    modelBoundary: RESILIENCE_MODEL_BOUNDARY,
  };
}

export function createHospitalSnapshot(
  state: OperationalTwinState,
  trigger: HospitalSnapshotTrigger,
  timestamp: string
): TwinSnapshot {
  return {
    id: `snapshot-${state.version}-${trigger}`,
    timestamp,
    stateVersion: state.version,
    trigger,
    overallStatus: state.resilienceSummary.overallHospitalStatus,
    resilienceScore: state.resilienceSummary.resilienceScore,
    healthScore: state.overallHealthScore,
    domainSummaries: {
      compute: state.resilienceSummary.computeScore,
      icu: state.resilienceSummary.icuContinuityScore,
      oxygen: state.resilienceSummary.oxygenContinuityScore,
      power: state.resilienceSummary.powerContinuityScore,
      network: state.resilienceSummary.networkContinuityScore,
    },
    activeSimulationStatus: state.activeSimulation?.status ?? null,
    simulationOnly: true,
  };
}

export function appendHospitalSnapshot(
  state: OperationalTwinState,
  trigger: HospitalSnapshotTrigger,
  timestamp: string
): OperationalTwinState {
  const snapshot = createHospitalSnapshot(state, trigger, timestamp);
  const snapshots = [...state.snapshots, snapshot].slice(
    -MAX_HOSPITAL_TWIN_SNAPSHOTS
  );
  return { ...state, snapshots };
}
