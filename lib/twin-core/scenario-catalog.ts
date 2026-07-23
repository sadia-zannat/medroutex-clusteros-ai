/**
 * Deterministic Scenario Catalog
 *
 * Phase 1: Read-only scenario metadata catalog.
 * Phase 2 will add scenario mutation and execution behavior.
 */

import type {
  ScenarioCatalog,
  ScenarioContract,
  ScenarioDomain,
  ScenarioCategory,
} from "./types";

const SCENARIO_CATALOG_VERSION = "1.0.0";
const CATALOG_CREATED_AT = "2024-01-15T10:30:00.000Z";

const NORMAL_OPERATIONS: ScenarioContract = {
  id: "normal-operations",
  name: "Normal Operations",
  description: "Baseline hospital operational state with all domains healthy.",
  domain: "compute",
  severity: "low",
  category: "normal-operations",
  requiresHumanApproval: false,
  estimatedRecoveryMinutes: null,
  affectedDomains: ["compute", "icu", "oxygen", "power", "network"] as const,
  dependencies: [] as const,
  warnings: [] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const STROKE_COMPUTE_CRISIS: ScenarioContract = {
  id: "stroke-compute-crisis",
  name: "Emergency Stroke CT Compute Crisis",
  description: "Critical GPU overheating and memory overload during emergency stroke CT workload with tight deadline.",
  domain: "compute",
  severity: "critical",
  category: "compute-crisis",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 2,
  affectedDomains: ["compute", "power", "network"] as const,
  dependencies: ["power-circuit-gpu-01", "network-central-link-01"] as const,
  warnings: [
    "GPU-2 critical temperature (92°C)",
    "GPU-3 memory at approximately 7.7/8 GB",
    "120-second deadline for Emergency Stroke CT",
    "Cloud route blocked by privacy policy for stroke CT workload",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const ICU_CAPACITY_STRESS: ScenarioContract = {
  id: "icu-capacity-stress",
  name: "ICU Capacity Stress",
  description: "ICU bed capacity at critical levels with limited ventilator availability and high oxygen demand.",
  domain: "icu",
  severity: "high",
  category: "capacity-stress",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 30,
  affectedDomains: ["icu", "oxygen"] as const,
  dependencies: ["oxygen-pipeline-01", "icu-unit-01"] as const,
  warnings: [
    "ICU bed occupancy at 75% (18/24)",
    "Critical beds at 25% (6/24)",
    "Ventilators in use: 8/12",
    "Oxygen demand elevated at 620 L/min",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const OXYGEN_CONTINUITY_RISK: ScenarioContract = {
  id: "oxygen-continuity-risk",
  name: "Oxygen Continuity Risk",
  description: "Main oxygen tank depletion with pipeline pressure degradation and reserve bank availability concerns.",
  domain: "oxygen",
  severity: "critical",
  category: "continuity-risk",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 45,
  affectedDomains: ["oxygen", "icu"] as const,
  dependencies: ["oxygen-main-tank-01", "oxygen-pipeline-01", "oxygen-reserve-bank-01"] as const,
  warnings: [
    "Main tank level at 25%",
    "Pipeline pressure degraded (3.8 bar)",
    "Reserve bank status uncertain",
    "ICU oxygen continuity at risk",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const POWER_CONTINUITY_FAILURE: ScenarioContract = {
  id: "power-continuity-failure",
  name: "Power Continuity Failure",
  description: "Main power grid failure with UPS runtime depletion and generator startup failure affecting critical circuits.",
  domain: "power",
  severity: "critical",
  category: "infrastructure-failure",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 60,
  affectedDomains: ["power", "icu", "oxygen", "compute"] as const,
  dependencies: ["power-main-grid-01", "power-ups-01", "power-generator-01"] as const,
  warnings: [
    "Main power grid offline",
    "UPS runtime at 15 minutes",
    "Generator failed to start",
    "ICU, oxygen plant, and GPU data center on backup power",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const NETWORK_CONTINUITY_FAILURE: ScenarioContract = {
  id: "network-continuity-failure",
  name: "Network Continuity Failure",
  description: "Central network link failure causing isolation between radiology and GPU data center with elevated packet loss.",
  domain: "network",
  severity: "high",
  category: "infrastructure-failure",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 20,
  affectedDomains: ["network", "compute"] as const,
  dependencies: ["network-central-link-01", "network-local-link-01"] as const,
  warnings: [
    "Central network link offline",
    "Radiology isolated from GPU data center",
    "Packet loss elevated on local link",
    "Workload routing disrupted",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const HOSPITAL_CASCADE_CRISIS: ScenarioContract = {
  id: "hospital-cascade-crisis",
  name: "Hospital Cascade Crisis",
  description: "Multi-domain failure cascade starting with power failure affecting oxygen, network, compute, and ICU operations simultaneously.",
  domain: "hospital-cascade",
  severity: "critical",
  category: "cascade-crisis",
  requiresHumanApproval: true,
  estimatedRecoveryMinutes: 90,
  affectedDomains: ["power", "oxygen", "network", "compute", "icu"] as const,
  dependencies: [
    "power-main-grid-01",
    "power-ups-01",
    "oxygen-pipeline-01",
    "network-central-link-01",
    "icu-unit-01",
  ] as const,
  warnings: [
    "Power grid failure triggering cascade",
    "Oxygen plant offline",
    "Network isolation",
    "Compute capacity degraded",
    "ICU operations at risk",
    "Multi-domain coordination required",
  ] as const,
  metadata: {
    phase: 1,
    deterministic: true,
    patientData: false,
    diagnosis: false,
    actuatorExecution: false,
  },
};

const SCENARIOS: readonly ScenarioContract[] = [
  NORMAL_OPERATIONS,
  STROKE_COMPUTE_CRISIS,
  ICU_CAPACITY_STRESS,
  OXYGEN_CONTINUITY_RISK,
  POWER_CONTINUITY_FAILURE,
  NETWORK_CONTINUITY_FAILURE,
  HOSPITAL_CASCADE_CRISIS,
] as const;

const DOMAINS: readonly ScenarioDomain[] = [
  "compute",
  "icu",
  "oxygen",
  "power",
  "network",
  "hospital-cascade",
] as const;

const CATEGORIES: readonly ScenarioCategory[] = [
  "normal-operations",
  "compute-crisis",
  "capacity-stress",
  "continuity-risk",
  "infrastructure-failure",
  "cascade-crisis",
] as const;

/**
 * Get the deterministic scenario catalog.
 */
export function getScenarioCatalog(): ScenarioCatalog {
  return {
    scenarios: SCENARIOS,
    version: SCENARIO_CATALOG_VERSION,
    lastUpdated: CATALOG_CREATED_AT,
    metadata: {
      totalScenarios: SCENARIOS.length,
      domains: DOMAINS,
      categories: CATEGORIES,
    },
  };
}

/**
 * Get a scenario contract by ID.
 */
export function getScenarioById(id: string): ScenarioContract | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/**
 * Get scenarios by domain.
 */
export function getScenariosByDomain(domain: ScenarioDomain): readonly ScenarioContract[] {
  return SCENARIOS.filter((scenario) => scenario.domain === domain);
}

/**
 * Get scenarios by category.
 */
export function getScenariosByCategory(category: ScenarioCategory): readonly ScenarioContract[] {
  return SCENARIOS.filter((scenario) => scenario.category === category);
}

/**
 * Get scenarios by severity.
 */
export function getScenariosBySeverity(severity: ScenarioContract["severity"]): readonly ScenarioContract[] {
  return SCENARIOS.filter((scenario) => scenario.severity === severity);
}
