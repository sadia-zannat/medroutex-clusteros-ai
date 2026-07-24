import { TOTAL_WORKLOADS, WORKLOAD_NAMES } from "../medroutex/constants";
import {
  INFRASTRUCTURE_CLINICAL_DISCLAIMER,
  type OperationalTwinState,
  type TelemetryValue,
  type TwinEntity,
  type TwinRelationship,
  type TwinSimulationState,
  type TwinTelemetryPoint,
  type ScenarioRuntimeState,
} from "./types";
import {
  appendHospitalSnapshot,
  calculateHospitalResilience,
  deriveHospitalDomains,
} from "./resilience";
import {
  ExistingGpuTelemetryAdapter,
  SyntheticHospitalTelemetryProvider,
} from "./providers";
import { createBaselineResetEvent } from "./operational-events";

export const BASELINE_TIMESTAMP = "2024-01-15T10:30:00.000Z";

export const INITIAL_SCENARIO_RUNTIME: ScenarioRuntimeState = {
  activeScenarioId: null,
  scenarioStatus: null,
  startedAt: null,
  lastTransitionAt: null,
  stateVersionStarted: null,
  affectedDomains: [],
  severity: null,
  activeIncidentIds: [],
  rootCauseIds: [],
  transitionKey: null,
  executionCount: 0,
  recoveryStatus: "not-recovering",
  humanApprovalRequired: false,
  physicalExecutionPerformed: false,
  rootCauses: [],
  dependencyImpacts: [],
  cascadePaths: [],
  domainAssessments: [],
  multiDomainPlanSet: null,
  recovery: {
    status: "not-started",
    confirmationCycles: 0,
    requiredConfirmationCycles: 2,
    startedAt: null,
    recoveredAt: null,
    evidence: [],
  },
  metadata: {
    phase: 2,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

function createEntity(input: {
  id: string;
  name: string;
  entityType: TwinEntity["entityType"];
  parentEntityId?: string;
  zoneId?: string;
  healthScore?: number;
  riskScore?: number;
  attributes?: Record<string, TelemetryValue>;
  tags?: string[];
  sourceTypes?: TwinEntity["sourceTypes"];
}): TwinEntity {
  return {
    id: input.id,
    name: input.name,
    entityType: input.entityType,
    ...(input.parentEntityId
      ? { parentEntityId: input.parentEntityId }
      : {}),
    ...(input.zoneId ? { zoneId: input.zoneId } : {}),
    status: "healthy",
    healthScore: input.healthScore ?? 94,
    riskScore: input.riskScore ?? 6,
    lastUpdated: BASELINE_TIMESTAMP,
    lastHeartbeatAt: BASELINE_TIMESTAMP,
    sourceTypes: input.sourceTypes ?? ["emulated"],
    attributes: input.attributes ?? {},
    tags: input.tags ?? [],
    isStale: false,
    isSimulationOnly: true,
  };
}

function createGpuEntities(): TwinEntity[] {
  const definitions: ReadonlyArray<{
    id: string;
    name: string;
    temperatureC: number;
    utilizationPercent: number;
    memoryUsedMiB: number;
    memoryTotalMiB: number;
    powerDrawW: number;
  }> = [
    {
      id: "compute-local-gpu-01",
      name: "Local GPU Compute Node 01",
      temperatureC: 45,
      utilizationPercent: 30,
      memoryUsedMiB: 8192,
      memoryTotalMiB: 24576,
      powerDrawW: 180,
    },
    {
      id: "compute-local-gpu-02",
      name: "Local GPU Compute Node 02",
      temperatureC: 47,
      utilizationPercent: 35,
      memoryUsedMiB: 10240,
      memoryTotalMiB: 24576,
      powerDrawW: 190,
    },
    {
      id: "compute-local-gpu-03",
      name: "Local GPU Compute Node 03",
      temperatureC: 49,
      utilizationPercent: 40,
      memoryUsedMiB: 12288,
      memoryTotalMiB: 24576,
      powerDrawW: 200,
    },
    {
      id: "compute-local-gpu-04",
      name: "Local GPU Compute Node 04",
      temperatureC: 51,
      utilizationPercent: 45,
      memoryUsedMiB: 14336,
      memoryTotalMiB: 24576,
      powerDrawW: 210,
    },
    {
      id: "compute-central-gpu-05",
      name: "Central GPU Compute Node 05",
      temperatureC: 50,
      utilizationPercent: 40,
      memoryUsedMiB: 10240,
      memoryTotalMiB: 24576,
      powerDrawW: 200,
    },
    {
      id: "compute-central-gpu-06",
      name: "Central GPU Compute Node 06",
      temperatureC: 53,
      utilizationPercent: 48,
      memoryUsedMiB: 13312,
      memoryTotalMiB: 24576,
      powerDrawW: 215,
    },
    {
      id: "compute-central-gpu-07",
      name: "Central GPU Compute Node 07",
      temperatureC: 52,
      utilizationPercent: 25,
      memoryUsedMiB: 2048,
      memoryTotalMiB: 16384,
      powerDrawW: 150,
    },
    {
      id: "compute-central-gpu-08",
      name: "Central GPU Compute Node 08",
      temperatureC: 56,
      utilizationPercent: 56,
      memoryUsedMiB: 16384,
      memoryTotalMiB: 24576,
      powerDrawW: 230,
    },
    {
      id: "compute-cloud-gpu-09",
      name: "Cloud GPU Compute Node 09",
      temperatureC: 55,
      utilizationPercent: 50,
      memoryUsedMiB: 12288,
      memoryTotalMiB: 24576,
      powerDrawW: 220,
    },
    {
      id: "compute-cloud-gpu-10",
      name: "Cloud GPU Compute Node 10",
      temperatureC: 59,
      utilizationPercent: 60,
      memoryUsedMiB: 16384,
      memoryTotalMiB: 24576,
      powerDrawW: 240,
    },
  ];

  return definitions.map((definition) =>
    createEntity({
      ...definition,
      entityType: "compute-node",
      parentEntityId: "zone-gpu-datacenter",
      zoneId: "zone-gpu-datacenter",
      healthScore: definition.id === "compute-central-gpu-07" ? 92 : 88,
      riskScore: definition.id === "compute-central-gpu-07" ? 8 : 12,
      attributes: {
        temperatureC: definition.temperatureC,
        utilizationPercent: definition.utilizationPercent,
        memoryUsedMiB: definition.memoryUsedMiB,
        memoryTotalMiB: definition.memoryTotalMiB,
        powerDrawW: definition.powerDrawW,
      },
      tags: ["gpu", "ai-inference", "synthetic-telemetry"],
      sourceTypes: ["live-synthetic"],
    })
  );
}

function createWorkloadEntities(): TwinEntity[] {
  const priorities = ["critical", "high", "medium", "low", "research"] as const;
  const privacyPolicies = [
    "central-allowed",
    "edge-allowed",
    "central-allowed",
    "cloud-allowed",
    "on-prem-only",
  ] as const;
  const localTargetIds = [
    "gpu-local-0",
    "gpu-local-1",
    "gpu-local-2",
    "gpu-local-3",
  ] as const;
  const centralTargetIds = [
    "gpu-central-0",
    "gpu-central-1",
    "gpu-central-7",
    "gpu-central-2",
  ] as const;
  const cloudTargetIds = ["gpu-cloud-0", "gpu-cloud-1"] as const;

  return Array.from({ length: TOTAL_WORKLOADS }, (_, index) => {
    const first = index === 0;
    const workloadName = first
      ? "Stroke CT AI"
      : WORKLOAD_NAMES[index % WORKLOAD_NAMES.length];
    const privacyPolicy = first
      ? "on-prem-only"
      : privacyPolicies[index % privacyPolicies.length];
    const assignedGpuId = first
      ? "gpu-local-0"
      : privacyPolicy === "on-prem-only"
        ? localTargetIds[index % localTargetIds.length]
        : privacyPolicy === "cloud-allowed"
          ? cloudTargetIds[index % cloudTargetIds.length]
          : centralTargetIds[index % centralTargetIds.length];
    return createEntity({
      id: first
        ? "workload-stroke-ct-001"
        : `workload-synthetic-${String(index + 1).padStart(3, "0")}`,
      name: workloadName,
      entityType: "workload",
      parentEntityId: "zone-gpu-datacenter",
      zoneId: first ? "zone-radiology" : "zone-gpu-datacenter",
      attributes: {
        workloadType: "inference",
        priority: priorities[index % priorities.length],
        privacyPolicy,
        deadlineSeconds: first ? 300 : 300 + index * 60,
        assignedGpuId,
        computeRequiredPercent: 5 + (index % 5),
        memoryRequiredMiB: (4 + (index % 4)) * 1024,
        requiresIcuContinuity:
          workloadName.toLowerCase().includes("icu"),
        requiresOxygenContinuity:
          workloadName.toLowerCase().includes("icu") ||
          workloadName.toLowerCase().includes("oxygen"),
        status: "running",
        approvalRequired: false,
      },
      tags: ["healthcare-ai", "synthetic-workload", "phi-zero"],
      sourceTypes: ["live-synthetic"],
    });
  });
}

function relationship(
  id: string,
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: TwinRelationship["relationshipType"],
  criticality: TwinRelationship["criticality"]
): TwinRelationship {
  return {
    id,
    sourceEntityId,
    targetEntityId,
    relationshipType,
    criticality,
    enabled: true,
  };
}

function createRelationships(): TwinRelationship[] {
  return [
    relationship(
      "rel-hospital-contains-icu",
      "hospital-diu-001",
      "zone-icu",
      "contains",
      "critical"
    ),
    relationship(
      "rel-hospital-contains-radiology",
      "hospital-diu-001",
      "zone-radiology",
      "contains",
      "high"
    ),
    relationship(
      "rel-hospital-contains-gpu",
      "hospital-diu-001",
      "zone-gpu-datacenter",
      "contains",
      "high"
    ),
    relationship(
      "rel-hospital-contains-oxygen",
      "hospital-diu-001",
      "zone-oxygen-plant",
      "contains",
      "critical"
    ),
    relationship(
      "rel-hospital-contains-power",
      "hospital-diu-001",
      "zone-power-room",
      "contains",
      "critical"
    ),
    relationship(
      "rel-hospital-contains-network",
      "hospital-diu-001",
      "zone-network-room",
      "contains",
      "critical"
    ),
    relationship(
      "rel-icu-zone-contains-unit",
      "zone-icu",
      "icu-unit-01",
      "contains",
      "critical"
    ),
    relationship(
      "rel-icu-unit-contains-capacity",
      "icu-unit-01",
      "icu-capacity-01",
      "contains",
      "high"
    ),
    relationship(
      "rel-icu-unit-contains-ventilators",
      "icu-unit-01",
      "icu-ventilator-aggregate-01",
      "contains",
      "critical"
    ),
    relationship(
      "rel-icu-depends-oxygen",
      "icu-unit-01",
      "oxygen-pipeline-01",
      "depends-on",
      "critical"
    ),
    relationship(
      "rel-icu-depends-power",
      "icu-unit-01",
      "power-circuit-icu-01",
      "depends-on",
      "critical"
    ),
    relationship(
      "rel-icu-depends-network",
      "icu-unit-01",
      "network-local-link-01",
      "depends-on",
      "critical"
    ),
    relationship(
      "rel-radiology-uses-gpu-cluster",
      "zone-radiology",
      "zone-gpu-datacenter",
      "uses",
      "high"
    ),
    relationship(
      "rel-gpu-depends-power",
      "zone-gpu-datacenter",
      "power-circuit-gpu-01",
      "depends-on",
      "critical"
    ),
    relationship(
      "rel-gpu-depends-network",
      "zone-gpu-datacenter",
      "network-central-link-01",
      "depends-on",
      "high"
    ),
    relationship(
      "rel-oxygen-plant-depends-power",
      "zone-oxygen-plant",
      "power-circuit-oxygen-01",
      "depends-on",
      "critical"
    ),
    relationship(
      "rel-oxygen-tank-supplies-pipeline",
      "oxygen-main-tank-01",
      "oxygen-pipeline-01",
      "supplies",
      "critical"
    ),
    relationship(
      "rel-oxygen-reserve-backs-main",
      "oxygen-reserve-bank-01",
      "oxygen-main-tank-01",
      "backs-up",
      "critical"
    ),
    relationship(
      "rel-ups-backs-critical-circuits",
      "power-ups-01",
      "power-circuit-icu-01",
      "backs-up",
      "critical"
    ),
    relationship(
      "rel-generator-backs-grid",
      "power-generator-01",
      "power-main-grid-01",
      "backs-up",
      "critical"
    ),
    relationship(
      "rel-central-route-network",
      "workload-stroke-ct-001",
      "network-central-link-01",
      "routes-to",
      "high"
    ),
  ];
}

function createDomainEntities(): TwinEntity[] {
  return [
    createEntity({
      id: "hospital-diu-001",
      name: "DIU MedRouteX Demonstration Hospital",
      entityType: "hospital",
      healthScore: 88,
      riskScore: 12,
      tags: ["root", "phi-zero", "decision-support"],
    }),
    ...[
      ["zone-icu", "Intensive Care Unit"],
      ["zone-radiology", "Radiology Department"],
      ["zone-gpu-datacenter", "GPU Data Center"],
      ["zone-oxygen-plant", "Oxygen Plant"],
      ["zone-power-room", "Power Continuity Room"],
      ["zone-network-room", "Network Operations Room"],
    ].map(([id, name]) =>
      createEntity({
        id,
        name,
        entityType: "zone",
        parentEntityId: "hospital-diu-001",
        zoneId: id,
        tags: ["hospital-zone", "emulated"],
      })
    ),
    createEntity({
      id: "icu-unit-01",
      name: "ICU Unit 01",
      entityType: "icu-unit",
      parentEntityId: "zone-icu",
      zoneId: "zone-icu",
      attributes: { operationalStatus: "operational" },
      tags: ["icu", "aggregate-only"],
    }),
    createEntity({
      id: "icu-capacity-01",
      name: "ICU Bed Capacity Aggregate",
      entityType: "capacity",
      parentEntityId: "icu-unit-01",
      zoneId: "zone-icu",
      attributes: {
        totalBeds: 24,
        occupiedBeds: 18,
        criticalBeds: 6,
        oxygenDemandLitersPerMinute: 620,
      },
      tags: ["icu", "aggregate-only", "no-patient-data"],
    }),
    createEntity({
      id: "icu-ventilator-aggregate-01",
      name: "ICU Ventilator Aggregate",
      entityType: "ventilator-aggregate",
      parentEntityId: "icu-unit-01",
      zoneId: "zone-icu",
      attributes: {
        ventilatorsAvailable: 4,
        ventilatorsInUse: 8,
        devicesOffline: 0,
      },
      tags: ["icu", "device-aggregate", "no-patient-data"],
    }),
    createEntity({
      id: "oxygen-main-tank-01",
      name: "Main Oxygen Tank 01",
      entityType: "oxygen-tank",
      parentEntityId: "zone-oxygen-plant",
      zoneId: "zone-oxygen-plant",
      attributes: {
        mainTankPercent: 78,
        refillEtaMinutes: 240,
        estimatedMinutesToDepletion: 720,
      },
      tags: ["oxygen", "emulated"],
    }),
    createEntity({
      id: "oxygen-reserve-bank-01",
      name: "Oxygen Reserve Bank 01",
      entityType: "oxygen-reserve-bank",
      parentEntityId: "zone-oxygen-plant",
      zoneId: "zone-oxygen-plant",
      attributes: {
        reserveCylinderCount: 18,
        operationalStatus: "operational",
      },
      tags: ["oxygen", "reserve", "emulated"],
    }),
    createEntity({
      id: "oxygen-pipeline-01",
      name: "Oxygen Pipeline 01",
      entityType: "oxygen-pipeline",
      parentEntityId: "zone-oxygen-plant",
      zoneId: "zone-oxygen-plant",
      attributes: {
        pipelinePressureBar: 4.2,
        currentDemandLitersPerMinute: 620,
        leakAnomalyRisk: 0.02,
        operationalStatus: "operational",
      },
      tags: ["oxygen", "pipeline", "emulated"],
    }),
    createEntity({
      id: "power-main-grid-01",
      name: "Main Hospital Power Grid",
      entityType: "power-grid",
      parentEntityId: "zone-power-room",
      zoneId: "zone-power-room",
      attributes: {
        gridStatus: "operational",
        totalLoadKw: 640,
        criticalLoadKw: 410,
        operationalStatus: "operational",
      },
      tags: ["power", "emulated"],
    }),
    createEntity({
      id: "power-ups-01",
      name: "Critical UPS 01",
      entityType: "ups",
      parentEntityId: "zone-power-room",
      zoneId: "zone-power-room",
      attributes: { upsPercent: 96, upsRuntimeMinutes: 48 },
      tags: ["power", "backup", "emulated"],
    }),
    createEntity({
      id: "power-generator-01",
      name: "Hospital Generator 01",
      entityType: "generator",
      parentEntityId: "zone-power-room",
      zoneId: "zone-power-room",
      attributes: {
        generatorStatus: "standby",
        generatorFuelPercent: 82,
      },
      tags: ["power", "backup", "emulated"],
    }),
    ...[
      ["power-circuit-oxygen-01", "Oxygen Plant Critical Circuit"],
      ["power-circuit-icu-01", "ICU Critical Circuit"],
      ["power-circuit-gpu-01", "GPU Data Center Critical Circuit"],
    ].map(([id, name]) =>
      createEntity({
        id,
        name,
        entityType: "critical-circuit",
        parentEntityId: "power-main-grid-01",
        zoneId: "zone-power-room",
        attributes: { operationalStatus: "operational" },
        tags: ["power", "critical-circuit", "emulated"],
      })
    ),
    createEntity({
      id: "network-local-link-01",
      name: "Hospital Local Network Link",
      entityType: "network-link",
      parentEntityId: "zone-network-room",
      zoneId: "zone-network-room",
      attributes: {
        operationalStatus: "operational",
        latencyMs: 4,
        packetLossPercent: 0.05,
        heartbeatTimestamp: BASELINE_TIMESTAMP,
      },
      tags: ["network", "local", "emulated"],
    }),
    createEntity({
      id: "network-central-link-01",
      name: "Central GPU Network Link",
      entityType: "network-link",
      parentEntityId: "zone-network-room",
      zoneId: "zone-network-room",
      attributes: {
        operationalStatus: "operational",
        latencyMs: 38,
        packetLossPercent: 0.2,
        heartbeatTimestamp: BASELINE_TIMESTAMP,
      },
      tags: ["network", "central", "emulated"],
    }),
    createEntity({
      id: "network-cloud-link-01",
      name: "Cloud Burst Network Link",
      entityType: "network-link",
      parentEntityId: "zone-network-room",
      zoneId: "zone-network-room",
      attributes: {
        operationalStatus: "operational",
        latencyMs: 52,
        packetLossPercent: 0.35,
        heartbeatTimestamp: BASELINE_TIMESTAMP,
      },
      tags: ["network", "cloud", "privacy-controlled", "emulated"],
    }),
  ];
}

function createInitialStateWithoutSnapshot(): OperationalTwinState {
  const entities = [
    ...createDomainEntities(),
    ...createGpuEntities(),
    ...createWorkloadEntities(),
  ];
  const relationships = createRelationships();
  const emptyState = {
    entities,
    overallHealthScore: 88,
    overallStatus: "healthy" as const,
  };
  const domains = deriveHospitalDomains(emptyState);
  const resilienceSummary = calculateHospitalResilience(domains, {
    latestTelemetry: [],
    relationships,
  });

  const preliminaryState: OperationalTwinState = {
    twinId: "MEDROUTEX-HOSPITAL-TWIN-01",
    hospitalId: "hospital-diu-001",
    hospitalName: "DIU MedRouteX Demonstration Hospital",
    version: 1,
    generatedAt: BASELINE_TIMESTAMP,
    lastSynchronizedAt: BASELINE_TIMESTAMP,
    entities,
    relationships,
    latestTelemetry: [],
    snapshots: [],
    approvalAuditEvents: [],
    operationalEvents: [createBaselineResetEvent(1, BASELINE_TIMESTAMP)],
    notifications: [],
    emailDeliveries: [],
    emailDeliverySequence: 0,
    emailDeliveryReservations: [],
    activeIncidents: [],
    oxygenAlertLifecycle: {
      activeIncidentId: null,
      correlationId: null,
      activeSeverity: null,
      incidentSequence: 0,
      recoveryConfirmationCycles: 0,
      lastEvaluatedAt: null,
      lastEvaluationFingerprint: null,
    },
    activeSimulation: null,
    latestGuardRulerEvaluation: null,
    guardRulerEvaluationHistory: [],
    domains,
    resilienceSummary,
    latestSynchronization: {
      id: "sync-baseline-001",
      timestamp: BASELINE_TIMESTAMP,
      providers: [
        "synthetic-hospital-telemetry-provider",
        "existing-gpu-telemetry-adapter",
      ],
      acceptedTelemetryPoints: 0,
      rejectedTelemetryPoints: 0,
      failedProviders: [],
      staleSourceCount: 0,
      offlineSourceCount: 0,
      status: "synchronized",
    },
    overallStatus: "healthy",
    overallHealthScore: 88,
    overallRiskScore: 12,
    simulationOnly: true,
    clinicalDisclaimer: INFRASTRUCTURE_CLINICAL_DISCLAIMER,
    scenarioRuntime: INITIAL_SCENARIO_RUNTIME,
    liveHardwareGpu: null,
    persistence: {
      mode: "memory-only",
      databasePath: null,
      lastPersistedAt: null,
      lastRestoredAt: null,
      lastError: null,
    },
  };

  const providers = [
    new SyntheticHospitalTelemetryProvider(),
    new ExistingGpuTelemetryAdapter(),
  ] as const;
  const latestTelemetry = providers.flatMap(
    (provider) => provider.collect(preliminaryState, BASELINE_TIMESTAMP).points
  );
  const withTelemetry: OperationalTwinState = {
    ...preliminaryState,
    latestTelemetry,
    latestSynchronization: {
      ...preliminaryState.latestSynchronization,
      acceptedTelemetryPoints: latestTelemetry.length,
    },
  };

  return {
    ...withTelemetry,
    resilienceSummary: calculateHospitalResilience(domains, withTelemetry),
  };
}

export function createInitialOperationalTwinState(): OperationalTwinState {
  const baselineState = createInitialStateWithoutSnapshot();
  return appendHospitalSnapshot(
    baselineState,
    "baseline",
    BASELINE_TIMESTAMP
  );
}

function nextScenarioTimestamp(state: OperationalTwinState): string {
  const previous = Date.parse(state.lastSynchronizedAt);
  return new Date(previous + 60_000).toISOString();
}

function mergeTelemetry(
  existing: TwinTelemetryPoint[],
  incoming: TwinTelemetryPoint[]
): TwinTelemetryPoint[] {
  const byMetric = new Map<string, TwinTelemetryPoint>();
  for (const point of [...existing, ...incoming]) {
    const key = `${point.entityId}:${point.metric}`;
    const current = byMetric.get(key);
    if (!current || Date.parse(point.timestamp) >= Date.parse(current.timestamp)) {
      byMetric.set(key, point);
    }
  }
  return [...byMetric.values()];
}

export function applyCrisisScenario(
  state: OperationalTwinState,
  transitionTimestamp: string = nextScenarioTimestamp(state)
): OperationalTwinState {
  if (state.activeSimulation?.scenarioId === "medroutex-stroke-crisis") {
    return state;
  }

  const crisisTimestamp = transitionTimestamp;
  const entities = state.entities.map((entity) => {
    if (entity.id === "compute-local-gpu-02") {
      return {
        ...entity,
        status: "critical" as const,
        healthScore: 25,
        riskScore: 75,
        lastUpdated: crisisTimestamp,
        attributes: {
          ...entity.attributes,
          temperatureC: 92,
          utilizationPercent: 95,
          memoryUsedMiB: 8188,
          memoryTotalMiB: 8188,
          powerDrawW: 380,
        },
        tags: [...new Set([...entity.tags, "overheating"])],
      };
    }
    if (entity.id === "compute-local-gpu-03") {
      return {
        ...entity,
        status: "critical" as const,
        healthScore: 30,
        riskScore: 70,
        lastUpdated: crisisTimestamp,
        attributes: {
          ...entity.attributes,
          temperatureC: 78,
          utilizationPercent: 88,
          memoryUsedMiB: 7900,
          memoryTotalMiB: 8188,
          powerDrawW: 320,
        },
        tags: [...new Set([...entity.tags, "memory-overload"])],
      };
    }
    if (entity.id === "compute-central-gpu-07") {
      return {
        ...entity,
        status: "healthy" as const,
        healthScore: 92,
        riskScore: 8,
        lastUpdated: crisisTimestamp,
        attributes: {
          ...entity.attributes,
          temperatureC: 52,
          utilizationPercent: 25,
          memoryUsedMiB: 2048,
          memoryTotalMiB: 16384,
          powerDrawW: 150,
        },
        tags: [...new Set([...entity.tags, "recommended-target"])],
      };
    }
    if (entity.id === "workload-stroke-ct-001") {
      return {
        ...entity,
        name: "Emergency Stroke CT",
        lastUpdated: crisisTimestamp,
        attributes: {
          ...entity.attributes,
          deadlineSeconds: 120,
          status: "awaiting-approval",
          approvalRequired: true,
          assignedGpuId: "gpu-local-1",
          privacyPolicy: "central-allowed",
        },
      };
    }
    return entity;
  });

  const stateForGpuTelemetry: OperationalTwinState = {
    ...state,
    entities,
    overallStatus: "critical",
    overallHealthScore: 81,
    overallRiskScore: 19,
  };
  const crisisTelemetry = new ExistingGpuTelemetryAdapter()
    .collect(stateForGpuTelemetry, crisisTimestamp)
    .points;
  const activeSimulation: TwinSimulationState = {
    id: "sim-crisis-001",
    scenarioId: "medroutex-stroke-crisis",
    scenarioName: "Emergency Stroke CT Workload Crisis",
    status: "awaiting-approval",
    startedAt: crisisTimestamp,
    baselineSnapshotId: "snapshot-1-baseline",
    projectedChanges: [
      {
        entityId: "compute-local-gpu-02",
        metric: "temperatureC",
        beforeValue: 47,
        afterValue: 92,
        explanation: "GPU-2 overheating due to emergency workload",
      },
      {
        entityId: "compute-local-gpu-03",
        metric: "memoryUsedMiB",
        beforeValue: 12288,
        afterValue: 7900,
        explanation: "GPU-3 memory pressure against its 8 GB crisis envelope",
      },
      {
        entityId: "compute-central-gpu-07",
        metric: "utilizationPercent",
        beforeValue: 25,
        afterValue: 65,
        explanation: "Recommended target if a later approved migration executes",
      },
    ],
    predictedRiskReductionPercent: 33.5,
    predictedRecoveryMinutes: 2,
    requiresHumanApproval: true,
    recommendationId: "rec-workload-stroke-ct-001-0",
    recommendedTargetGpuId: "gpu-central-7",
    approvalSatisfied: false,
    approval: null,
    simulationOnly: true,
    warnings: [
      "Cloud route blocked by privacy policy for stroke CT workload",
      "Local GPU-2 critical temperature (92°C)",
      "Local GPU-3 memory at approximately 7.7/8 GB",
      "120-second deadline for Emergency Stroke CT",
    ],
  };
  const version = state.version + 1;
  const stateWithScenario: OperationalTwinState = {
    ...stateForGpuTelemetry,
    version,
    entities,
    latestTelemetry: mergeTelemetry(state.latestTelemetry, crisisTelemetry),
    activeSimulation,
    scenarioRuntime: {
      activeScenarioId: "stroke-compute-crisis",
      scenarioStatus: "awaiting-approval",
      startedAt: crisisTimestamp,
      lastTransitionAt: crisisTimestamp,
      stateVersionStarted: version,
      affectedDomains: ["compute", "power", "network"],
      severity: "critical",
      activeIncidentIds: [],
      rootCauseIds: ["compute-local-gpu-02", "compute-local-gpu-03"],
      transitionKey: `stroke-compute-crisis-v${state.version}`,
      executionCount: 1,
      recoveryStatus: "not-recovering",
      humanApprovalRequired: true,
      physicalExecutionPerformed: false,
      rootCauses: [],
      dependencyImpacts: [],
      cascadePaths: [],
      domainAssessments: [],
      multiDomainPlanSet: null,
      recovery: {
        status: "not-started",
        confirmationCycles: 0,
        requiredConfirmationCycles: 2,
        startedAt: null,
        recoveredAt: null,
        evidence: [],
      },
      metadata: {
        phase: 2,
        deterministic: true,
        patientData: false,
        diagnosis: false,
        actuatorExecution: false,
      },
    },
  };
  const domains = deriveHospitalDomains(stateWithScenario);
  const resilienceSummary = calculateHospitalResilience(
    domains,
    stateWithScenario
  );

  return appendHospitalSnapshot(
    {
      ...stateWithScenario,
      domains,
      resilienceSummary,
    },
    "scenario",
    crisisTimestamp
  );
}
