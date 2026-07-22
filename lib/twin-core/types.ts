/**
 * Twin Core Type Contracts
 * 
 * This module defines the core type system for the Hybrid Operational Hospital Digital Twin.
 * All types are designed to support real and synthetic telemetry, entity relationships,
 * historical snapshots, and synchronized simulation state.
 */

/**
 * Entity types in the digital twin system
 */
export type TwinEntityType =
  | "hospital"
  | "zone"
  | "compute-node"
  | "oxygen-system"
  | "power-system"
  | "network-link"
  | "medical-device"
  | "sensor"
  | "external-service";

/**
 * Operational status of twin entities
 */
export type TwinOperationalStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "recovering"
  | "offline"
  | "unknown";

/**
 * Source type for telemetry data
 */
export type TwinDataSourceType =
  | "synthetic"
  | "recorded-demo"
  | "local-hardware"
  | "physical-sensor"
  | "external-connector"
  | "derived";

/**
 * Data quality status for telemetry points
 */
export type TwinDataQualityStatus =
  | "good"
  | "degraded"
  | "stale"
  | "missing"
  | "invalid";

/**
 * Value types supported in telemetry
 */
export type TelemetryValue = number | string | boolean | null;

/**
 * Single telemetry data point from any source
 * 
 * Timestamps use ISO 8601 strings (e.g., "2024-01-15T10:30:00.000Z")
 * Confidence must be between 0 and 1
 */
export interface TwinTelemetryPoint {
  id: string;
  entityId: string;
  metric: string;
  value: TelemetryValue;
  unit?: string;
  timestamp: string;
  receivedAt: string;
  sourceType: TwinDataSourceType;
  sourceId: string;
  quality: TwinDataQualityStatus;
  confidence: number;
  sequence?: number;
  isStale: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Core entity in the digital twin system
 * 
 * healthScore and riskScore are between 0 and 100
 */
export interface TwinEntity {
  id: string;
  name: string;
  entityType: TwinEntityType;
  zoneId?: string;
  parentEntityId?: string;
  status: TwinOperationalStatus;
  healthScore: number;
  riskScore: number;
  lastUpdated: string;
  lastHeartbeatAt?: string;
  sourceTypes: TwinDataSourceType[];
  attributes: Record<string, TelemetryValue>;
  tags: string[];
  isStale: boolean;
  isSimulationOnly: boolean;
}

/**
 * Relationship types between entities
 */
export type TwinRelationshipType =
  | "contains"
  | "depends-on"
  | "supplies"
  | "powers"
  | "connects-to"
  | "monitors"
  | "routes-to"
  | "backs-up";

/**
 * Relationship between two twin entities
 */
export interface TwinRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: TwinRelationshipType;
  criticality: "low" | "medium" | "high" | "critical";
  active: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Historical snapshot of entity states
 */
export interface TwinSnapshot {
  id: string;
  capturedAt: string;
  entityStates: Array<{
    entityId: string;
    status: TwinOperationalStatus;
    healthScore: number;
    riskScore: number;
    attributes: Record<string, TelemetryValue>;
  }>;
  reason: "scheduled" | "scenario" | "approval" | "manual" | "incident";
  simulationOnly: boolean;
}

/**
 * Status of a simulation scenario
 */
export type TwinScenarioStatus =
  | "idle"
  | "running"
  | "awaiting-approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

/**
 * Human decision for a simulation recommendation
 */
export type TwinApprovalDecision = "approve" | "reject";

/**
 * Canonical operator evidence for a finalized human decision
 */
export interface TwinApprovalRecord {
  decision: TwinApprovalDecision;
  satisfied: boolean;
  recommendationId: string;
  targetGpuId: string;
  operatorName: string;
  operatorRole: string;
  decidedAt: string;
  simulationOnly: true;
}

/**
 * Immutable audit evidence for a human approval decision
 */
export interface TwinApprovalAuditEvent {
  id: string;
  eventType: "human-approval-decision";
  decision: TwinApprovalDecision;
  simulationId: string;
  recommendationId: string;
  targetGpuId: string;
  operatorName: string;
  operatorRole: string;
  timestamp: string;
  simulationOnly: true;
}

/**
 * Projected change for an entity metric in simulation
 */
export interface TwinProjectedChange {
  entityId: string;
  metric: string;
  beforeValue: TelemetryValue;
  afterValue: TelemetryValue;
  explanation: string;
}

/**
 * Active simulation state for what-if analysis
 * 
 * Does not contain full TwinState to avoid recursion
 */
export interface TwinSimulationState {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: TwinScenarioStatus;
  startedAt: string;
  completedAt?: string;
  baselineSnapshotId: string;
  projectedChanges: TwinProjectedChange[];
  predictedRiskReductionPercent: number;
  predictedRecoveryMinutes: number;
  requiresHumanApproval: boolean;
  recommendationId: string;
  recommendedTargetGpuId: string;
  approvalSatisfied: boolean;
  approval: TwinApprovalRecord | null;
  simulationOnly: true;
  warnings: string[];
}

/**
 * Complete operational twin state
 * 
 * Timestamps use ISO 8601 strings
 */
export interface OperationalTwinState {
  twinId: string;
  hospitalId: string;
  hospitalName: string;
  version: number;
  generatedAt: string;
  lastSynchronizedAt: string;
  entities: TwinEntity[];
  relationships: TwinRelationship[];
  latestTelemetry: TwinTelemetryPoint[];
  snapshots: TwinSnapshot[];
  approvalAuditEvents: TwinApprovalAuditEvent[];
  activeSimulation: TwinSimulationState | null;
  overallStatus: TwinOperationalStatus;
  overallHealthScore: number;
  overallRiskScore: number;
  simulationOnly: boolean;
  clinicalDisclaimer: string;
}

/**
 * Clinical disclaimer for infrastructure decision-support systems
 */
export const INFRASTRUCTURE_CLINICAL_DISCLAIMER: string =
  "Infrastructure decision-support only. Not a diagnosis or bedside treatment system.";
