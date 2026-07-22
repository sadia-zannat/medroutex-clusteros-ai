/**
 * Twin Core Seed Data
 * 
 * This module provides deterministic initial state for the Hybrid Operational Hospital Digital Twin.
 * All synthetic data is generated with consistent timestamps and values for reproducibility.
 */

import {
  OperationalTwinState,
  TwinEntity,
  TwinRelationship,
  TwinTelemetryPoint,
  TwinSnapshot,
  TwinSimulationState,
  TwinProjectedChange,
  INFRASTRUCTURE_CLINICAL_DISCLAIMER,
} from "./types";

/**
 * Deterministic ISO timestamp for all synthetic data
 */
const DETERMINISTIC_TIMESTAMP = "2024-01-15T10:30:00.000Z";

/**
 * Create the initial operational twin state with deterministic synthetic data
 */
export function createInitialOperationalTwinState(): OperationalTwinState {
  const entities: TwinEntity[] = [
    // 1. Hospital
    {
      id: "hospital-root",
      name: "MedRouteX Demonstration Hospital",
      entityType: "hospital",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["root", "simulation"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 2. ICU Zone
    {
      id: "zone-icu",
      name: "Intensive Care Unit",
      entityType: "zone",
      zoneId: "zone-icu",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["critical-care"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 3. Emergency Zone
    {
      id: "zone-emergency",
      name: "Emergency Department",
      entityType: "zone",
      zoneId: "zone-emergency",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["emergency"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 4. Radiology Zone
    {
      id: "zone-radiology",
      name: "Radiology Department",
      entityType: "zone",
      zoneId: "zone-radiology",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["imaging"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 5. GPU/Data Center Zone
    {
      id: "zone-gpu-datacenter",
      name: "GPU Data Center",
      entityType: "zone",
      zoneId: "zone-gpu-datacenter",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["compute", "ai"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 6. Oxygen Plant Zone
    {
      id: "zone-oxygen-plant",
      name: "Oxygen Generation Plant",
      entityType: "zone",
      zoneId: "zone-oxygen-plant",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["utilities", "life-support"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 7. Power Room Zone
    {
      id: "zone-power-room",
      name: "Main Power Room",
      entityType: "zone",
      zoneId: "zone-power-room",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["utilities", "critical"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 8. Network Room Zone
    {
      id: "zone-network-room",
      name: "Network Operations Center",
      entityType: "zone",
      zoneId: "zone-network-room",
      parentEntityId: "hospital-root",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {},
      tags: ["connectivity", "critical"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 9. Local Compute Node
    {
      id: "compute-local-gpu-01",
      name: "Local GPU Compute Node 01",
      entityType: "compute-node",
      zoneId: "zone-gpu-datacenter",
      parentEntityId: "zone-gpu-datacenter",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {
        temperatureC: 45,
        utilizationPercent: 18,
        memoryUsedMiB: 1024,
        memoryTotalMiB: 8188,
        powerDrawW: 18,
      },
      tags: ["gpu", "ai-inference"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 10. ICU Oxygen System
    {
      id: "oxygen-main-01",
      name: "Main ICU Oxygen System",
      entityType: "oxygen-system",
      zoneId: "zone-oxygen-plant",
      parentEntityId: "zone-oxygen-plant",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {
        tankLevelPercent: 78,
        pipelinePressureBar: 4.2,
        currentFlowLitersPerMinute: 620,
        reserveCylinderCount: 18,
        estimatedMinutesRemaining: 720,
      },
      tags: ["life-support", "critical"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 11. Main Power System
    {
      id: "power-main-01",
      name: "Main Hospital Power System",
      entityType: "power-system",
      zoneId: "zone-power-room",
      parentEntityId: "zone-power-room",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {
        gridAvailable: true,
        hospitalLoadPercent: 62,
        upsBatteryPercent: 96,
        upsRuntimeMinutes: 48,
        generatorAvailable: true,
        generatorRunning: false,
        generatorFuelPercent: 82,
      },
      tags: ["utilities", "critical"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 12. Central Network Link
    {
      id: "network-central-link-01",
      name: "Central Network Link",
      entityType: "network-link",
      zoneId: "zone-network-room",
      parentEntityId: "zone-network-room",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {
        available: true,
        latencyMs: 38,
        packetLossPercent: 0.2,
        edgeModeActive: false,
      },
      tags: ["connectivity", "critical"],
      isStale: false,
      isSimulationOnly: true,
    },
    // 13. ICU Monitoring Device
    {
      id: "device-icu-monitor-01",
      name: "ICU Patient Monitor 01",
      entityType: "medical-device",
      zoneId: "zone-icu",
      parentEntityId: "zone-icu",
      status: "healthy",
      healthScore: 88,
      riskScore: 12,
      lastUpdated: DETERMINISTIC_TIMESTAMP,
      sourceTypes: ["synthetic"],
      attributes: {
        online: true,
        batteryPercent: 100,
        operationalMode: "normal",
      },
      tags: ["monitoring", "icu"],
      isStale: false,
      isSimulationOnly: true,
    },
  ];

  const relationships: TwinRelationship[] = [
    // Hospital contains every zone
    {
      id: "rel-hospital-contains-icu",
      fromEntityId: "hospital-root",
      toEntityId: "zone-icu",
      relationshipType: "contains",
      criticality: "high",
      active: true,
    },
    {
      id: "rel-hospital-contains-emergency",
      fromEntityId: "hospital-root",
      toEntityId: "zone-emergency",
      relationshipType: "contains",
      criticality: "high",
      active: true,
    },
    {
      id: "rel-hospital-contains-radiology",
      fromEntityId: "hospital-root",
      toEntityId: "zone-radiology",
      relationshipType: "contains",
      criticality: "medium",
      active: true,
    },
    {
      id: "rel-hospital-contains-gpu-datacenter",
      fromEntityId: "hospital-root",
      toEntityId: "zone-gpu-datacenter",
      relationshipType: "contains",
      criticality: "medium",
      active: true,
    },
    {
      id: "rel-hospital-contains-oxygen-plant",
      fromEntityId: "hospital-root",
      toEntityId: "zone-oxygen-plant",
      relationshipType: "contains",
      criticality: "critical",
      active: true,
    },
    {
      id: "rel-hospital-contains-power-room",
      fromEntityId: "hospital-root",
      toEntityId: "zone-power-room",
      relationshipType: "contains",
      criticality: "critical",
      active: true,
    },
    {
      id: "rel-hospital-contains-network-room",
      fromEntityId: "hospital-root",
      toEntityId: "zone-network-room",
      relationshipType: "contains",
      criticality: "critical",
      active: true,
    },
    // ICU depends on oxygen
    {
      id: "rel-icu-depends-oxygen",
      fromEntityId: "zone-icu",
      toEntityId: "oxygen-main-01",
      relationshipType: "depends-on",
      criticality: "critical",
      active: true,
    },
    // ICU depends on main power
    {
      id: "rel-icu-depends-power",
      fromEntityId: "zone-icu",
      toEntityId: "power-main-01",
      relationshipType: "depends-on",
      criticality: "critical",
      active: true,
    },
    // Radiology depends on local compute node
    {
      id: "rel-radiology-depends-compute",
      fromEntityId: "zone-radiology",
      toEntityId: "compute-local-gpu-01",
      relationshipType: "depends-on",
      criticality: "medium",
      active: true,
    },
    // Local compute node depends on main power
    {
      id: "rel-compute-depends-power",
      fromEntityId: "compute-local-gpu-01",
      toEntityId: "power-main-01",
      relationshipType: "depends-on",
      criticality: "high",
      active: true,
    },
    // Local compute node connects to central network link
    {
      id: "rel-compute-connects-network",
      fromEntityId: "compute-local-gpu-01",
      toEntityId: "network-central-link-01",
      relationshipType: "connects-to",
      criticality: "high",
      active: true,
    },
    // Oxygen system depends on main power
    {
      id: "rel-oxygen-depends-power",
      fromEntityId: "oxygen-main-01",
      toEntityId: "power-main-01",
      relationshipType: "depends-on",
      criticality: "critical",
      active: true,
    },
    // ICU monitoring device is contained by ICU
    {
      id: "rel-device-icu-contained",
      fromEntityId: "zone-icu",
      toEntityId: "device-icu-monitor-01",
      relationshipType: "contains",
      criticality: "medium",
      active: true,
    },
    // ICU monitoring device is powered by main power
    {
      id: "rel-device-powered-by-power",
      fromEntityId: "power-main-01",
      toEntityId: "device-icu-monitor-01",
      relationshipType: "powers",
      criticality: "high",
      active: true,
    },
    // ICU monitoring device is monitored by ICU zone
    {
      id: "rel-icu-monitors-device",
      fromEntityId: "zone-icu",
      toEntityId: "device-icu-monitor-01",
      relationshipType: "monitors",
      criticality: "medium",
      active: true,
    },
  ];

  const latestTelemetry: TwinTelemetryPoint[] = [
    // Compute GPU temperature
    {
      id: "tele-compute-temp-001",
      entityId: "compute-local-gpu-01",
      metric: "temperatureC",
      value: 45,
      unit: "°C",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // Compute GPU utilization
    {
      id: "tele-compute-util-001",
      entityId: "compute-local-gpu-01",
      metric: "utilizationPercent",
      value: 18,
      unit: "%",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // Oxygen tank level
    {
      id: "tele-oxygen-tank-001",
      entityId: "oxygen-main-01",
      metric: "tankLevelPercent",
      value: 78,
      unit: "%",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // Oxygen pipeline pressure
    {
      id: "tele-oxygen-pressure-001",
      entityId: "oxygen-main-01",
      metric: "pipelinePressureBar",
      value: 4.2,
      unit: "bar",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // Grid availability
    {
      id: "tele-power-grid-001",
      entityId: "power-main-01",
      metric: "gridAvailable",
      value: true,
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // UPS battery
    {
      id: "tele-power-ups-001",
      entityId: "power-main-01",
      metric: "upsBatteryPercent",
      value: 96,
      unit: "%",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // Network latency
    {
      id: "tele-network-latency-001",
      entityId: "network-central-link-01",
      metric: "latencyMs",
      value: 38,
      unit: "ms",
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    // ICU monitoring device online status
    {
      id: "tele-device-online-001",
      entityId: "device-icu-monitor-01",
      metric: "online",
      value: true,
      timestamp: DETERMINISTIC_TIMESTAMP,
      receivedAt: DETERMINISTIC_TIMESTAMP,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
  ];

  const snapshots: TwinSnapshot[] = [
    {
      id: "snapshot-initial-001",
      capturedAt: DETERMINISTIC_TIMESTAMP,
      entityStates: entities.map((entity) => ({
        entityId: entity.id,
        status: entity.status,
        healthScore: entity.healthScore,
        riskScore: entity.riskScore,
        attributes: entity.attributes,
      })),
      reason: "scheduled",
      simulationOnly: true,
    },
  ];

  return {
    twinId: "MEDROUTEX-TWIN-01",
    hospitalId: "HOSPITAL-DEMO-01",
    hospitalName: "MedRouteX Demonstration Hospital",
    version: 1,
    generatedAt: DETERMINISTIC_TIMESTAMP,
    lastSynchronizedAt: DETERMINISTIC_TIMESTAMP,
    entities,
    relationships,
    latestTelemetry,
    snapshots,
    activeSimulation: null,
    overallStatus: "healthy",
    overallHealthScore: 88,
    overallRiskScore: 12,
    simulationOnly: true,
    clinicalDisclaimer: INFRASTRUCTURE_CLINICAL_DISCLAIMER,
  };
}

/**
 * Apply the MedRouteX demo crisis scenario to the operational twin state
 * This represents the emergency stroke CT workload with GPU failures
 * Idempotent: if crisis entities already exist, returns current state without duplication
 */
export function applyCrisisScenario(state: OperationalTwinState): OperationalTwinState {
  const crisisTimestamp = "2024-01-15T10:32:00.000Z";

  // Check if crisis is already applied (idempotent)
  const crisisEntityIds = ["compute-local-gpu-02", "compute-local-gpu-03", "compute-central-gpu-07"];
  const crisisAlreadyApplied = crisisEntityIds.some((id) =>
    state.entities.some((e) => e.id === id)
  );

  if (crisisAlreadyApplied) {
    // Crisis already applied, return current state
    return state;
  }

  // Create crisis-specific entities (additional GPUs)
  const crisisEntities: TwinEntity[] = [
    // Local GPU-2 (overheating)
    {
      id: "compute-local-gpu-02",
      name: "Local GPU Compute Node 02",
      entityType: "compute-node",
      zoneId: "zone-gpu-datacenter",
      parentEntityId: "zone-gpu-datacenter",
      status: "critical",
      healthScore: 25,
      riskScore: 75,
      lastUpdated: crisisTimestamp,
      sourceTypes: ["synthetic"],
      attributes: {
        temperatureC: 92,
        utilizationPercent: 95,
        memoryUsedMiB: 8188,
        memoryTotalMiB: 8188,
        powerDrawW: 380,
      },
      tags: ["gpu", "ai-inference", "overheating"],
      isStale: false,
      isSimulationOnly: true,
    },
    // Local GPU-3 (memory overloaded)
    {
      id: "compute-local-gpu-03",
      name: "Local GPU Compute Node 03",
      entityType: "compute-node",
      zoneId: "zone-gpu-datacenter",
      parentEntityId: "zone-gpu-datacenter",
      status: "critical",
      healthScore: 30,
      riskScore: 70,
      lastUpdated: crisisTimestamp,
      sourceTypes: ["synthetic"],
      attributes: {
        temperatureC: 78,
        utilizationPercent: 88,
        memoryUsedMiB: 7900,
        memoryTotalMiB: 8188,
        powerDrawW: 320,
      },
      tags: ["gpu", "ai-inference", "memory-overload"],
      isStale: false,
      isSimulationOnly: true,
    },
    // Central GPU-7 (healthy - recommended target)
    {
      id: "compute-central-gpu-07",
      name: "Central GPU Compute Node 07",
      entityType: "compute-node",
      zoneId: "zone-gpu-datacenter",
      parentEntityId: "zone-gpu-datacenter",
      status: "healthy",
      healthScore: 92,
      riskScore: 8,
      lastUpdated: crisisTimestamp,
      sourceTypes: ["synthetic"],
      attributes: {
        temperatureC: 52,
        utilizationPercent: 25,
        memoryUsedMiB: 2048,
        memoryTotalMiB: 16384,
        powerDrawW: 150,
      },
      tags: ["gpu", "ai-inference", "recommended"],
      isStale: false,
      isSimulationOnly: true,
    },
  ];

  // Add crisis-specific telemetry
  const crisisTelemetry: TwinTelemetryPoint[] = [
    {
      id: "tele-gpu02-temp-001",
      entityId: "compute-local-gpu-02",
      metric: "temperatureC",
      value: 92,
      unit: "°C",
      timestamp: crisisTimestamp,
      receivedAt: crisisTimestamp,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    {
      id: "tele-gpu02-util-001",
      entityId: "compute-local-gpu-02",
      metric: "utilizationPercent",
      value: 95,
      unit: "%",
      timestamp: crisisTimestamp,
      receivedAt: crisisTimestamp,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    {
      id: "tele-gpu03-memory-001",
      entityId: "compute-local-gpu-03",
      metric: "memoryUsedMiB",
      value: 7900,
      unit: "MiB",
      timestamp: crisisTimestamp,
      receivedAt: crisisTimestamp,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
    {
      id: "tele-gpu07-temp-001",
      entityId: "compute-central-gpu-07",
      metric: "temperatureC",
      value: 52,
      unit: "°C",
      timestamp: crisisTimestamp,
      receivedAt: crisisTimestamp,
      sourceType: "synthetic",
      sourceId: "hospital-emulator",
      quality: "good",
      confidence: 1,
      isStale: false,
    },
  ];

  // Create crisis simulation state
  const activeSimulation: TwinSimulationState = {
    id: "sim-crisis-001",
    scenarioId: "medroutex-stroke-crisis",
    scenarioName: "Emergency Stroke CT Workload Crisis",
    status: "awaiting-approval",
    startedAt: crisisTimestamp,
    baselineSnapshotId: "snapshot-initial-001",
    projectedChanges: [
      {
        entityId: "compute-local-gpu-02",
        metric: "temperatureC",
        beforeValue: 45,
        afterValue: 92,
        explanation: "GPU-2 overheating due to emergency workload",
      },
      {
        entityId: "compute-local-gpu-03",
        metric: "memoryUsedMiB",
        beforeValue: 1024,
        afterValue: 7900,
        explanation: "GPU-3 memory overload from critical workloads",
      },
      {
        entityId: "compute-central-gpu-07",
        metric: "utilizationPercent",
        beforeValue: 25,
        afterValue: 65,
        explanation: "Recommended migration target for stroke CT workload",
      },
    ],
    predictedRiskReductionPercent: 67,
    predictedRecoveryMinutes: 2,
    requiresHumanApproval: true,
    simulationOnly: true,
    warnings: [
      "Cloud route blocked by privacy policy for stroke CT workload",
      "Local GPU-2 critical temperature (92°C)",
      "Local GPU-3 memory at 96% capacity",
      "2-minute deadline for emergency stroke CT",
    ],
  };

  // Calculate new overall metrics
  const allEntities = [...state.entities, ...crisisEntities];
  const criticalCount = allEntities.filter((e) => e.status === "critical").length;
  const avgHealth = Math.round(
    allEntities.reduce((sum, e) => sum + e.healthScore, 0) / allEntities.length
  );
  const avgRisk = Math.round(
    allEntities.reduce((sum, e) => sum + e.riskScore, 0) / allEntities.length
  );

  return {
    ...state,
    version: state.version + 1,
    lastSynchronizedAt: crisisTimestamp,
    entities: allEntities,
    latestTelemetry: [...state.latestTelemetry, ...crisisTelemetry],
    activeSimulation,
    overallStatus: "critical",
    overallHealthScore: avgHealth,
    overallRiskScore: avgRisk,
  };
}
