import {
  type HospitalTelemetryProvider,
  type OperationalTwinState,
  type TelemetryProviderBatch,
  type TelemetryValue,
  type TwinEntity,
  type TwinTelemetryPoint,
} from "./types";

function attribute(
  entity: TwinEntity,
  metric: string
): TelemetryValue | undefined {
  return entity.attributes[metric];
}

function createPoint(
  provider: string,
  source: TwinTelemetryPoint["source"],
  entity: TwinEntity,
  metric: string,
  timestamp: string,
  unit?: string
): TwinTelemetryPoint | null {
  const currentValue = attribute(entity, metric);
  if (currentValue === undefined) return null;
  const value = metric === "heartbeatTimestamp" ? timestamp : currentValue;

  return {
    id: `${provider}-${entity.id}-${metric}-${timestamp}`,
    entityId: entity.id,
    metric,
    value,
    ...(unit ? { unit } : {}),
    timestamp,
    source,
    provider,
    quality: "good",
    confidence: source === "emulated" ? 0.95 : 1,
    staleAfterSeconds: source === "emulated" ? 180 : 90,
    isStale: false,
  };
}

function collectEntityMetrics(
  provider: string,
  source: TwinTelemetryPoint["source"],
  entity: TwinEntity,
  timestamp: string,
  metrics: ReadonlyArray<{ metric: string; unit?: string }>
): TwinTelemetryPoint[] {
  return metrics.flatMap(({ metric, unit }) => {
    const point = createPoint(
      provider,
      source,
      entity,
      metric,
      timestamp,
      unit
    );
    return point ? [point] : [];
  });
}

export class SyntheticHospitalTelemetryProvider
  implements HospitalTelemetryProvider
{
  readonly id = "synthetic-hospital-telemetry-provider";
  readonly source = "emulated" as const;

  collect(
    state: OperationalTwinState,
    timestamp: string
  ): TelemetryProviderBatch {
    const metricDefinitions: Readonly<
      Record<string, ReadonlyArray<{ metric: string; unit?: string }>>
    > = {
      "icu-unit-01": [{ metric: "operationalStatus" }],
      "icu-capacity-01": [
        { metric: "totalBeds", unit: "beds" },
        { metric: "occupiedBeds", unit: "beds" },
        { metric: "criticalBeds", unit: "beds" },
        { metric: "oxygenDemandLitersPerMinute", unit: "L/min" },
      ],
      "icu-ventilator-aggregate-01": [
        { metric: "ventilatorsAvailable", unit: "devices" },
        { metric: "ventilatorsInUse", unit: "devices" },
        { metric: "devicesOffline", unit: "devices" },
      ],
      "oxygen-main-tank-01": [
        { metric: "mainTankPercent", unit: "%" },
        { metric: "refillEtaMinutes", unit: "min" },
        { metric: "estimatedMinutesToDepletion", unit: "min" },
      ],
      "oxygen-reserve-bank-01": [
        { metric: "reserveCylinderCount", unit: "cylinders" },
        { metric: "operationalStatus" },
      ],
      "oxygen-pipeline-01": [
        { metric: "pipelinePressureBar", unit: "bar" },
        { metric: "currentDemandLitersPerMinute", unit: "L/min" },
        { metric: "leakAnomalyRisk", unit: "ratio" },
        { metric: "operationalStatus" },
      ],
      "power-main-grid-01": [
        { metric: "gridStatus" },
        { metric: "totalLoadKw", unit: "kW" },
        { metric: "criticalLoadKw", unit: "kW" },
        { metric: "operationalStatus" },
      ],
      "power-ups-01": [
        { metric: "upsPercent", unit: "%" },
        { metric: "upsRuntimeMinutes", unit: "min" },
      ],
      "power-generator-01": [
        { metric: "generatorStatus" },
        { metric: "generatorFuelPercent", unit: "%" },
      ],
      "power-circuit-oxygen-01": [{ metric: "operationalStatus" }],
      "power-circuit-icu-01": [{ metric: "operationalStatus" }],
      "power-circuit-gpu-01": [{ metric: "operationalStatus" }],
      "network-local-link-01": [
        { metric: "operationalStatus" },
        { metric: "latencyMs", unit: "ms" },
        { metric: "packetLossPercent", unit: "%" },
        { metric: "heartbeatTimestamp" },
      ],
      "network-central-link-01": [
        { metric: "operationalStatus" },
        { metric: "latencyMs", unit: "ms" },
        { metric: "packetLossPercent", unit: "%" },
        { metric: "heartbeatTimestamp" },
      ],
      "network-cloud-link-01": [
        { metric: "operationalStatus" },
        { metric: "latencyMs", unit: "ms" },
        { metric: "packetLossPercent", unit: "%" },
        { metric: "heartbeatTimestamp" },
      ],
    };

    const points = state.entities.flatMap((entity) => {
      const metrics = metricDefinitions[entity.id];
      return metrics
        ? collectEntityMetrics(
            this.id,
            this.source,
            entity,
            timestamp,
            metrics
          )
        : [];
    });

    return {
      provider: this.id,
      source: this.source,
      collectedAt: timestamp,
      points,
    };
  }
}

export class ExistingGpuTelemetryAdapter
  implements HospitalTelemetryProvider
{
  readonly id = "existing-gpu-telemetry-adapter";
  readonly source = "live-synthetic" as const;

  collect(
    state: OperationalTwinState,
    timestamp: string
  ): TelemetryProviderBatch {
    const points = state.entities
      .filter((entity) => entity.entityType === "compute-node")
      .flatMap((entity) =>
        collectEntityMetrics(
          this.id,
          this.source,
          entity,
          timestamp,
          [
            { metric: "temperatureC", unit: "°C" },
            { metric: "utilizationPercent", unit: "%" },
            { metric: "memoryUsedMiB", unit: "MiB" },
            { metric: "memoryTotalMiB", unit: "MiB" },
            { metric: "powerDrawW", unit: "W" },
          ]
        )
      );

    return {
      provider: this.id,
      source: this.source,
      collectedAt: timestamp,
      points,
    };
  }
}
