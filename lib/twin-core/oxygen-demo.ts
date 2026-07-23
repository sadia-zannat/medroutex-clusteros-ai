import type {
  HospitalOperationalStatus,
  OperationalTwinState,
  TwinEntity,
} from "./types";

export type OxygenDemoPreset =
  | "warning"
  | "critical"
  | "action-required"
  | "recovery-safe";

interface OxygenDemoValues {
  mainTankPercent: number;
  estimatedMinutesToDepletion: number;
  pipelinePressureBar: number;
  currentDemandLitersPerMinute: number;
  leakAnomalyRisk: number;
  reserveCylinderCount: number;
  reserveBankStatus: HospitalOperationalStatus;
  pipelineStatus: HospitalOperationalStatus;
}

const OXYGEN_DEMO_PRESETS: Readonly<
  Record<OxygenDemoPreset, OxygenDemoValues>
> = {
  warning: {
    mainTankPercent: 40,
    estimatedMinutesToDepletion: 360,
    pipelinePressureBar: 4.1,
    currentDemandLitersPerMinute: 700,
    leakAnomalyRisk: 0.1,
    reserveCylinderCount: 18,
    reserveBankStatus: "operational",
    pipelineStatus: "operational",
  },
  critical: {
    mainTankPercent: 25,
    estimatedMinutesToDepletion: 180,
    pipelinePressureBar: 3.1,
    currentDemandLitersPerMinute: 760,
    leakAnomalyRisk: 0.72,
    reserveCylinderCount: 12,
    reserveBankStatus: "operational",
    pipelineStatus: "critical",
  },
  "action-required": {
    mainTankPercent: 15,
    estimatedMinutesToDepletion: 90,
    pipelinePressureBar: 2.8,
    currentDemandLitersPerMinute: 820,
    leakAnomalyRisk: 0.9,
    reserveCylinderCount: 0,
    reserveBankStatus: "offline",
    pipelineStatus: "critical",
  },
  "recovery-safe": {
    mainTankPercent: 60,
    estimatedMinutesToDepletion: 600,
    pipelinePressureBar: 4.1,
    currentDemandLitersPerMinute: 620,
    leakAnomalyRisk: 0.1,
    reserveCylinderCount: 18,
    reserveBankStatus: "operational",
    pipelineStatus: "operational",
  },
};

export function isOxygenDemoPreset(
  value: unknown
): value is OxygenDemoPreset {
  return (
    value === "warning" ||
    value === "critical" ||
    value === "action-required" ||
    value === "recovery-safe"
  );
}

function updateOxygenEntity(
  entity: TwinEntity,
  values: OxygenDemoValues,
  timestamp: string
): TwinEntity {
  if (entity.id === "oxygen-main-tank-01") {
    return {
      ...entity,
      lastUpdated: timestamp,
      attributes: {
        ...entity.attributes,
        mainTankPercent: values.mainTankPercent,
        estimatedMinutesToDepletion:
          values.estimatedMinutesToDepletion,
      },
    };
  }
  if (entity.id === "oxygen-reserve-bank-01") {
    return {
      ...entity,
      status:
        values.reserveBankStatus === "offline"
          ? "offline"
          : values.reserveBankStatus === "critical"
            ? "critical"
            : "healthy",
      lastUpdated: timestamp,
      attributes: {
        ...entity.attributes,
        reserveCylinderCount: values.reserveCylinderCount,
        operationalStatus: values.reserveBankStatus,
      },
    };
  }
  if (entity.id === "oxygen-pipeline-01") {
    return {
      ...entity,
      status:
        values.pipelineStatus === "critical"
          ? "critical"
          : values.pipelineStatus === "degraded"
            ? "warning"
            : values.pipelineStatus === "offline"
              ? "offline"
              : "healthy",
      lastUpdated: timestamp,
      attributes: {
        ...entity.attributes,
        pipelinePressureBar: values.pipelinePressureBar,
        currentDemandLitersPerMinute:
          values.currentDemandLitersPerMinute,
        leakAnomalyRisk: values.leakAnomalyRisk,
        operationalStatus: values.pipelineStatus,
      },
    };
  }
  return entity;
}

export function applyOxygenDemoPreset(
  state: OperationalTwinState,
  preset: OxygenDemoPreset,
  timestamp: string
): OperationalTwinState {
  const values = OXYGEN_DEMO_PRESETS[preset];
  return {
    ...state,
    entities: state.entities.map((entity) =>
      updateOxygenEntity(entity, values, timestamp)
    ),
  };
}
