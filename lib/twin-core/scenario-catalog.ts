/**
 * Deterministic hospital continuity scenario catalog.
 *
 * Every scenario is server-owned, simulation-only, PHI-Zero, and does not
 * execute any physical action.
 */

import type {
  HospitalScenarioId,
  ScenarioCatalog,
  ScenarioCategory,
  ScenarioContract,
  ScenarioDomain,
} from "./types";

const SCENARIO_CATALOG_VERSION = "2.0.0";
const CATALOG_CREATED_AT = "2024-01-15T10:30:00.000Z";
const SAFETY_LABEL = "EMULATED HOSPITAL OPERATIONAL SCENARIO" as const;

function scenario(input: Omit<ScenarioContract, "executable" | "safetyLabel" | "metadata">): ScenarioContract {
  return {
    ...input,
    executable: true,
    safetyLabel: SAFETY_LABEL,
    metadata: {
      phase: 2,
      deterministic: true,
      patientData: false,
      diagnosis: false,
      actuatorExecution: false,
    },
  };
}

const SCENARIOS: readonly ScenarioContract[] = [
  scenario({
    id: "normal-operations",
    name: "Normal Operations",
    description: "Restore the deterministic healthy hospital continuity baseline.",
    domain: "compute",
    severity: "low",
    category: "normal-operations",
    requiresHumanApproval: false,
    estimatedRecoveryMinutes: null,
    affectedDomains: ["compute", "icu", "oxygen", "power", "network"],
    dependencies: [],
    warnings: [],
  }),
  scenario({
    id: "stroke-compute-crisis",
    name: "Emergency Stroke CT Compute Crisis",
    description: "GPU overheating and memory overload threaten a 120-second emergency imaging workload deadline.",
    domain: "compute",
    severity: "critical",
    category: "compute-crisis",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 2,
    affectedDomains: ["compute", "power", "network"],
    dependencies: ["power-circuit-gpu-01", "network-central-link-01"],
    warnings: [
      "Local GPU-2 reaches 92°C.",
      "Local GPU-3 reaches approximately 7.7/8 GB memory.",
      "Emergency Stroke CT deadline is 120 seconds.",
      "Cloud routing remains privacy-governed.",
    ],
  }),
  scenario({
    id: "icu-capacity-stress",
    name: "ICU Capacity Stress",
    description: "Aggregate ICU bed, ventilator, device, and oxygen demand telemetry enters a critical operating envelope.",
    domain: "icu",
    severity: "high",
    category: "capacity-stress",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 30,
    affectedDomains: ["icu", "oxygen"],
    dependencies: ["icu-capacity-01", "icu-ventilator-aggregate-01", "oxygen-pipeline-01"],
    warnings: [
      "ICU occupancy exceeds 90%.",
      "Ventilator availability is constrained.",
      "Aggregate oxygen demand increases.",
    ],
  }),
  scenario({
    id: "oxygen-continuity-risk",
    name: "Oxygen Continuity Risk",
    description: "Main tank depletion, reduced pipeline pressure, and reserve limitations threaten oxygen continuity.",
    domain: "oxygen",
    severity: "critical",
    category: "continuity-risk",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 45,
    affectedDomains: ["oxygen", "icu", "power"],
    dependencies: ["oxygen-main-tank-01", "oxygen-pipeline-01", "oxygen-reserve-bank-01", "power-circuit-oxygen-01"],
    warnings: [
      "Main tank is approximately 25%.",
      "Estimated depletion is approximately 180 minutes.",
      "Pipeline pressure is approximately 3.1 bar.",
    ],
  }),
  scenario({
    id: "power-continuity-failure",
    name: "Power Continuity Failure",
    description: "Grid loss places ICU, oxygen, and GPU circuits on limited backup continuity.",
    domain: "power",
    severity: "critical",
    category: "infrastructure-failure",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 60,
    affectedDomains: ["power", "icu", "oxygen", "compute"],
    dependencies: ["power-main-grid-01", "power-ups-01", "power-generator-01", "power-circuit-icu-01", "power-circuit-oxygen-01", "power-circuit-gpu-01"],
    warnings: [
      "Main grid is unavailable.",
      "UPS runtime is limited.",
      "Generator response requires authorized manual review.",
    ],
  }),
  scenario({
    id: "network-continuity-failure",
    name: "Network Continuity Failure",
    description: "Central-link degradation or loss changes compute route eligibility and deadline safety.",
    domain: "network",
    severity: "high",
    category: "infrastructure-failure",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 20,
    affectedDomains: ["network", "compute"],
    dependencies: ["network-central-link-01", "zone-gpu-datacenter", "workload-stroke-ct-001"],
    warnings: [
      "Central link becomes unavailable.",
      "Heartbeat becomes stale.",
      "Central GPU routes become Guard-blocked.",
    ],
  }),
  scenario({
    id: "hospital-cascade-crisis",
    name: "Hospital Cascade Crisis",
    description: "Concurrent compute, ICU, oxygen, power, and network failures create a cross-domain continuity crisis.",
    domain: "hospital-cascade",
    severity: "critical",
    category: "cascade-crisis",
    requiresHumanApproval: true,
    estimatedRecoveryMinutes: 90,
    affectedDomains: ["compute", "icu", "oxygen", "power", "network"],
    dependencies: [
      "compute-local-gpu-02",
      "compute-local-gpu-03",
      "network-central-link-01",
      "power-main-grid-01",
      "power-ups-01",
      "oxygen-main-tank-01",
      "oxygen-pipeline-01",
      "icu-capacity-01",
    ],
    warnings: [
      "Central route is unavailable.",
      "Cloud remains blocked by privacy.",
      "Local GPU-2 and Local GPU-3 are unsafe.",
      "Power and oxygen continuity require manual infrastructure review.",
    ],
  }),
] as const;

const DOMAINS: readonly ScenarioDomain[] = [
  "compute",
  "icu",
  "oxygen",
  "power",
  "network",
  "hospital-cascade",
];

const CATEGORIES: readonly ScenarioCategory[] = [
  "normal-operations",
  "compute-crisis",
  "capacity-stress",
  "continuity-risk",
  "infrastructure-failure",
  "cascade-crisis",
];

export function getScenarioCatalog(): ScenarioCatalog {
  return {
    scenarios: SCENARIOS,
    version: SCENARIO_CATALOG_VERSION,
    lastUpdated: CATALOG_CREATED_AT,
    metadata: {
      totalScenarios: SCENARIOS.length,
      domains: DOMAINS,
      categories: CATEGORIES,
      executableScenarioCount: SCENARIOS.filter((entry) => entry.executable).length,
    },
  };
}

export function isHospitalScenarioId(value: string): value is HospitalScenarioId {
  return SCENARIOS.some((entry) => entry.id === value);
}

export function getScenarioById(id: string): ScenarioContract | null {
  return SCENARIOS.find((entry) => entry.id === id) ?? null;
}

export function getScenariosByDomain(domain: ScenarioDomain): readonly ScenarioContract[] {
  return SCENARIOS.filter((entry) => entry.domain === domain);
}

export function getScenariosByCategory(category: ScenarioCategory): readonly ScenarioContract[] {
  return SCENARIOS.filter((entry) => entry.category === category);
}

export function getScenariosBySeverity(severity: ScenarioContract["severity"]): readonly ScenarioContract[] {
  return SCENARIOS.filter((entry) => entry.severity === severity);
}
