import { strict as assert } from "node:assert";
import { parseNvidiaSmiCsv } from "../lib/hardware/nvidia-smi";
import { getCurrentState } from "../lib/medroutex/state-store";
import { simulateDigitalTwin } from "../lib/medroutex/digital-twin";
import { normalizeUnifiedHistory } from "../lib/twin-core/history";
import { createDecisionEvidencePackage } from "../lib/twin-core/decision-evidence";
import { deriveMeshStateFromOperationalTwin } from "../lib/twin-core/compatibility";
import { getDashboardScenarioId } from "../lib/twin-core/scenario-identity";
import { executeScenarioTransition } from "../lib/twin-core/scenario-engine";
import { createInitialOperationalTwinState } from "../lib/twin-core/seed";
import {
  applyApprovalDecision,
  applyCrisisScenarioToState,
  getOperationalTwinState,
  resetOperationalTwinState,
  synchronizeOperationalTwinState,
  updateLiveHardwareGpu,
} from "../lib/twin-core/state-store";
import type { HospitalScenarioId } from "../lib/twin-core/types";

const scenarioIds: readonly HospitalScenarioId[] = [
  "icu-capacity-stress",
  "oxygen-continuity-risk",
  "power-continuity-failure",
  "network-continuity-failure",
  "stroke-compute-crisis",
  "hospital-cascade-crisis",
];

const baseline = createInitialOperationalTwinState();
assert.equal(baseline.overallHealthScore, 88);
assert.equal(baseline.resilienceSummary.resilienceScore, 91);
assert.equal(baseline.entities.length, 52);
assert.equal(baseline.relationships.length, 21);

for (const scenarioId of scenarioIds) {
  const first = executeScenarioTransition(createInitialOperationalTwinState(), scenarioId);
  assert.equal(first.success, true, `${scenarioId} must execute`);
  assert.equal(first.outcome, "applied", `${scenarioId} must apply once`);
  assert.equal(first.physicalExecutionPerformed, false);
  assert.ok(first.fullState, `${scenarioId} must return a canonical next state`);
  assert.equal(first.fullState?.scenarioRuntime.activeScenarioId, scenarioId);
  assert.equal(first.fullState?.activeIncidents.length, 1);
  assert.equal(first.notificationsCreated, 1);

  const repeat = executeScenarioTransition(first.fullState!, scenarioId);
  assert.equal(repeat.outcome, "idempotent", `${scenarioId} must be idempotent`);
  assert.equal(repeat.stateVersion, first.stateVersion);
  assert.equal(repeat.eventsCreated, 0);
  assert.equal(repeat.notificationsCreated, 0);
  assert.equal(repeat.incidentsCreated, 0);
}

const stroke = executeScenarioTransition(createInitialOperationalTwinState(), "stroke-compute-crisis");
assert.equal(stroke.hospitalHealthScore, 81);
assert.equal(stroke.hospitalResilienceScore, 89);
assert.equal(stroke.fullState?.latestGuardRulerEvaluation?.planSet.planA?.candidatePlan.targetLabel, "Central GPU-7");

const cascade = executeScenarioTransition(createInitialOperationalTwinState(), "hospital-cascade-crisis");
assert.equal(cascade.fullState?.latestGuardRulerEvaluation?.planSet.planA?.candidatePlan.targetLabel, "Local GPU-4");
assert.equal(cascade.fullState?.scenarioRuntime.multiDomainPlanSet?.planA?.title.includes("Local GPU-4"), true);
assert.ok(cascade.fullState);
assert.equal(getDashboardScenarioId(cascade.fullState!), "hospital-cascade-crisis");
const cascadeMesh = deriveMeshStateFromOperationalTwin(
  cascade.fullState!,
  getDashboardScenarioId(cascade.fullState!)
);
assert.equal(cascadeMesh.scenario, "hospital-cascade-crisis");
assert.equal(cascadeMesh.riskyGpus, 2);
const cascadeDigitalTwin = simulateDigitalTwin(
  cascade.fullState!.latestGuardRulerEvaluation,
  {
    scenario: getDashboardScenarioId(cascade.fullState!),
    healthScore: cascade.fullState!.overallHealthScore,
    riskyGpuCount: cascade.fullState!.domains.compute.riskyGpus,
  }
);
assert.equal(cascadeDigitalTwin.scenario, "hospital-cascade-crisis");
const cascadeEvidence = createDecisionEvidencePackage(
  cascade.fullState!,
  "2026-07-24T10:00:00.000Z"
);
assert.equal(cascadeEvidence.canonicalState.scenarioId, "hospital-cascade-crisis");
assert.equal(cascadeEvidence.guardRulerDecision?.planA?.targetLabel, "Local GPU-4");
assert.equal(cascadeEvidence.safetyBoundary.automaticMigration, false);
assert.equal(cascadeEvidence.safetyBoundary.actuatorExecution, false);

resetOperationalTwinState();
applyCrisisScenarioToState();
const active = getOperationalTwinState();
const recommendationId = active.activeSimulation?.recommendationId;
assert.ok(recommendationId);
const approved = applyApprovalDecision({
  decision: "approve",
  operatorName: "Core Regression Operator",
  operatorRole: "Infrastructure Engineer",
  recommendationId: recommendationId!,
});
assert.equal(approved.outcome, "applied");
assert.equal(approved.state.overallHealthScore, 81);
assert.equal(approved.state.approvalAuditEvents.length, 1);
const repeatedApproval = applyApprovalDecision({
  decision: "approve",
  operatorName: "Core Regression Operator",
  operatorRole: "Infrastructure Engineer",
  recommendationId: recommendationId!,
});
assert.equal(repeatedApproval.outcome, "idempotent");
assert.equal(repeatedApproval.state.approvalAuditEvents.length, 1);

const icu = executeScenarioTransition(createInitialOperationalTwinState(), "icu-capacity-stress").fullState!;
const history = normalizeUnifiedHistory(icu);
assert.ok(history.some((record) => record.kind === "incident"));
assert.ok(history.some((record) => record.kind === "scenario-root-cause"));
assert.ok(history.some((record) => record.kind === "response-plan"));
assert.equal(new Set(history.map((record) => record.id)).size, history.length);


resetOperationalTwinState();
applyCrisisScenarioToState();
const beforeHospitalSync = getOperationalTwinState();
const crisisEvaluationId = beforeHospitalSync.latestGuardRulerEvaluation?.id;
const synchronized = synchronizeOperationalTwinState().state;
assert.equal(synchronized.scenarioRuntime.activeScenarioId, "stroke-compute-crisis");
assert.equal(synchronized.activeSimulation?.scenarioId, "medroutex-stroke-crisis");
assert.equal(synchronized.entities.find((entity) => entity.id === "compute-local-gpu-02")?.attributes.temperatureC, 92);
assert.equal(synchronized.latestGuardRulerEvaluation?.id, crisisEvaluationId);
const synchronizedMesh = getCurrentState();
assert.equal(synchronizedMesh.scenario, "medroutex-stroke-crisis");
assert.equal(synchronizedMesh.riskyGpus, 2);

const versionBeforeHardwareSync = synchronized.version;
const hardwareSynced = updateLiveHardwareGpu({
  connectionStatus: "connected",
  collectedAt: "2026-07-24T00:01:00.000Z",
  provider: "nvidia-smi",
  sourceLabel: "Live Local Hardware Telemetry",
  quality: "good",
  gpuName: "NVIDIA GeForce RTX 4060 Laptop GPU",
  temperatureC: 45,
  utilizationPercent: 0,
  memoryUsedMiB: 0,
  memoryTotalMiB: 8188,
  powerDrawWatts: 59,
  error: null,
  simulationProtected: true,
});
assert.equal(hardwareSynced.version, versionBeforeHardwareSync);
assert.equal(hardwareSynced.scenarioRuntime.activeScenarioId, "stroke-compute-crisis");
assert.equal(hardwareSynced.entities.find((entity) => entity.id === "compute-local-gpu-02")?.attributes.temperatureC, 92);
assert.equal(hardwareSynced.latestGuardRulerEvaluation?.id, crisisEvaluationId);
const hardwareSyncedMesh = getCurrentState();
assert.equal(hardwareSyncedMesh.scenario, "medroutex-stroke-crisis");
assert.equal(hardwareSyncedMesh.riskyGpus, 2);

const hardware = parseNvidiaSmiCsv(
  "NVIDIA GeForce RTX 4060 Laptop GPU, 54, 23, 2048, 8192, 38.5\n",
  "2026-07-24T00:00:00.000Z"
);
assert.equal(hardware.connectionStatus, "connected");
assert.equal(hardware.gpuName, "NVIDIA GeForce RTX 4060 Laptop GPU");
assert.equal(hardware.memoryTotalMiB, 8192);
assert.equal(hardware.simulationProtected, true);
const normalizedLaptopPower = parseNvidiaSmiCsv(
  "NVIDIA GeForce RTX 4060 Laptop GPU, 45, 0, 0, 8188, 590\n",
  "2026-07-24T00:02:00.000Z"
);
assert.equal(normalizedLaptopPower.powerDrawWatts, 59);
assert.equal(normalizedLaptopPower.quality, "degraded");

console.log(`MedRouteX core regression passed: ${scenarioIds.length} crisis scenarios, scenario identity, evidence export, approval, history, and RTX parser.`);
