import type {
  CascadeNode,
  CascadePath,
  DependencyImpact,
  DomainContinuityAssessment,
  HospitalOperationalStatus,
  HospitalResponseAction,
  HospitalScenarioId,
  MultiDomainCandidatePlan,
  MultiDomainPlanSet,
  OperationalTwinState,
  ScenarioDomain,
  ScenarioRootCause,
  ScenarioSeverity,
  TimeToFailureBand,
  TwinEntity,
  TwinRelationship,
} from "./types";
import { evaluateGuardRuler } from "../guard-ruler/engine";

const PLAN_WEIGHTS = {
  criticalServiceContinuity: 30,
  timeToFailureMitigation: 25,
  dependencyRiskReduction: 20,
  implementationLatency: 10,
  operationalReversibility: 10,
  approvalComplexity: 5,
} as const;

const PLAN_FORMULA =
  "30% Critical-service continuity + 25% time-to-failure mitigation + 20% dependency risk reduction + 10% implementation latency + 10% operational reversibility + 5% approval complexity";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

export function timeToFailureBand(seconds: number | null): TimeToFailureBand {
  if (seconds === null || !Number.isFinite(seconds)) return "unknown";
  if (seconds <= 0) return "immediate";
  if (seconds < 5 * 60) return "under-5-minutes";
  if (seconds < 30 * 60) return "5-30-minutes";
  if (seconds < 120 * 60) return "30-120-minutes";
  return "over-120-minutes";
}

function domainForEntity(entity: TwinEntity | undefined): ScenarioDomain {
  if (!entity) return "hospital-cascade";
  if (entity.id.startsWith("compute-") || entity.entityType === "workload") return "compute";
  if (entity.id.startsWith("icu-") || entity.zoneId === "zone-icu") return "icu";
  if (entity.id.startsWith("oxygen-") || entity.zoneId === "zone-oxygen-plant") return "oxygen";
  if (entity.id.startsWith("power-") || entity.zoneId === "zone-power-room") return "power";
  if (entity.id.startsWith("network-") || entity.zoneId === "zone-network-room") return "network";
  return "hospital-cascade";
}

function statusSeverity(status: HospitalOperationalStatus): ScenarioSeverity {
  if (status === "offline" || status === "critical") return "critical";
  if (status === "degraded") return "high";
  return "low";
}

function root(
  scenarioId: HospitalScenarioId,
  entityId: string,
  domain: ScenarioDomain,
  severity: ScenarioSeverity,
  title: string,
  evidence: string[],
  seconds: number | null,
  confidence = 0.95
): ScenarioRootCause {
  return {
    id: `root-${scenarioId}-${entityId}`,
    scenarioId,
    entityId,
    domain,
    severity,
    title,
    evidence,
    timeToFailureSeconds: seconds,
    timeToFailureBand: timeToFailureBand(seconds),
    confidence,
  };
}

export function buildScenarioRootCauses(
  state: OperationalTwinState,
  scenarioId: HospitalScenarioId
): ScenarioRootCause[] {
  const d = state.domains;
  switch (scenarioId) {
    case "normal-operations":
      return [];
    case "stroke-compute-crisis":
      return [
        root(scenarioId, "compute-local-gpu-02", "compute", "critical", "Local GPU-2 thermal risk", ["Temperature 92°C", "Risk 75%", "Health 25"], 90),
        root(scenarioId, "compute-local-gpu-03", "compute", "critical", "Local GPU-3 memory saturation", ["Memory approximately 7.7/8 GB", "Risk 70%", "Health 30"], 240),
      ];
    case "icu-capacity-stress":
      return [
        root(scenarioId, "icu-capacity-01", "icu", "critical", "ICU aggregate capacity pressure", [`Occupancy ${d.icu.occupiedBeds}/${d.icu.totalBeds}`, `Critical-bed demand ${d.icu.criticalBeds}`], 30 * 60),
        root(scenarioId, "icu-ventilator-aggregate-01", "icu", "high", "ICU device availability pressure", [`${d.icu.ventilatorsAvailable} ventilators available`, `${d.icu.devicesOffline} aggregate devices offline`], 20 * 60),
      ];
    case "oxygen-continuity-risk":
      return [
        root(scenarioId, "oxygen-main-tank-01", "oxygen", "critical", "Main oxygen tank depletion", [`Tank ${d.oxygen.mainTankPercent}%`, `Estimated depletion ${d.oxygen.estimatedMinutesToDepletion} minutes`], d.oxygen.estimatedMinutesToDepletion * 60),
        root(scenarioId, "oxygen-pipeline-01", "oxygen", "critical", "Oxygen pipeline pressure degradation", [`Pressure ${d.oxygen.pipelinePressureBar} bar`, `Anomaly risk ${(d.oxygen.leakAnomalyRisk * 100).toFixed(0)}%`], d.oxygen.pipelinePressureBar <= 3.2 ? 5 * 60 : 30 * 60),
      ];
    case "power-continuity-failure":
      return [
        root(scenarioId, "power-main-grid-01", "power", "critical", "Main grid unavailable", ["Grid status offline", "Critical services are operating on limited backup continuity"], 0),
        root(scenarioId, "power-ups-01", "power", "critical", "UPS runtime limited", [`UPS ${d.power.upsPercent}%`, `Runtime ${d.power.upsRuntimeMinutes} minutes`], d.power.upsRuntimeMinutes * 60),
      ];
    case "network-continuity-failure":
      return [
        root(scenarioId, "network-central-link-01", "network", "critical", "Central network route unavailable", [`Central status ${d.network.centralLinkStatus}`, `Latency ${d.network.centralLatencyMs} ms`, `Packet loss ${d.network.packetLossPercent}%`], 0),
      ];
    case "hospital-cascade-crisis":
      return [
        root(scenarioId, "compute-local-gpu-02", "compute", "critical", "Local GPU-2 thermal failure risk", ["Temperature 92°C"], 90),
        root(scenarioId, "compute-local-gpu-03", "compute", "critical", "Local GPU-3 memory saturation", ["Memory approximately 7.7/8 GB"], 240),
        root(scenarioId, "network-central-link-01", "network", "critical", "Central route unavailable", ["Central link offline"], 0),
        root(scenarioId, "power-main-grid-01", "power", "critical", "Main grid unavailable", ["Grid offline"], 0),
        root(scenarioId, "power-ups-01", "power", "critical", "Backup runtime constrained", [`UPS runtime ${d.power.upsRuntimeMinutes} minutes`], d.power.upsRuntimeMinutes * 60),
        root(scenarioId, "oxygen-main-tank-01", "oxygen", "critical", "Oxygen reserve depletion", [`Tank ${d.oxygen.mainTankPercent}%`], d.oxygen.estimatedMinutesToDepletion * 60),
        root(scenarioId, "icu-capacity-01", "icu", "critical", "ICU continuity pressure", [`Occupancy ${d.icu.occupiedBeds}/${d.icu.totalBeds}`], 20 * 60),
      ];
  }
}

interface ImpactEdge {
  fromEntityId: string;
  toEntityId: string;
  relationship: TwinRelationship;
  reason: string;
}

function impactEdges(relationship: TwinRelationship): ImpactEdge[] {
  const direct = {
    fromEntityId: relationship.sourceEntityId,
    toEntityId: relationship.targetEntityId,
    relationship,
    reason: `${relationship.relationshipType} dependency propagates from ${relationship.sourceEntityId} to ${relationship.targetEntityId}.`,
  };
  const reverse = {
    fromEntityId: relationship.targetEntityId,
    toEntityId: relationship.sourceEntityId,
    relationship,
    reason: `${relationship.sourceEntityId} depends on ${relationship.targetEntityId} through ${relationship.relationshipType}.`,
  };

  switch (relationship.relationshipType) {
    case "depends-on":
    case "routes-to":
    case "uses":
      return [reverse];
    case "backs-up":
      return [direct, reverse];
    case "contains":
    case "supplies":
    case "powers":
    case "connects-to":
    case "monitors":
      return [direct];
  }
}

function degradeSeverity(severity: ScenarioSeverity, depth: number): ScenarioSeverity {
  if (depth <= 1) return severity;
  if (severity === "critical") return depth <= 2 ? "high" : "medium";
  if (severity === "high") return depth <= 2 ? "medium" : "low";
  return "low";
}

export function analyzeDependencyCascades(
  state: OperationalTwinState,
  scenarioId: HospitalScenarioId,
  rootCauses: readonly ScenarioRootCause[]
): { dependencyImpacts: DependencyImpact[]; cascadePaths: CascadePath[] } {
  const entityById = new Map(state.entities.map((entity) => [entity.id, entity]));
  const edges = state.relationships
    .filter((relationship) => relationship.enabled && (relationship.criticality === "critical" || relationship.criticality === "high"))
    .flatMap(impactEdges)
    .sort((a, b) => `${a.fromEntityId}:${a.toEntityId}:${a.relationship.id}`.localeCompare(`${b.fromEntityId}:${b.toEntityId}:${b.relationship.id}`));
  const adjacency = new Map<string, ImpactEdge[]>();
  for (const edge of edges) {
    const list = adjacency.get(edge.fromEntityId) ?? [];
    list.push(edge);
    adjacency.set(edge.fromEntityId, list);
  }

  const impacts = new Map<string, DependencyImpact>();
  const paths: CascadePath[] = [];

  for (const cause of rootCauses) {
    const queue: Array<{ entityId: string; nodes: CascadeNode[]; relationshipIds: string[] }> = [
      {
        entityId: cause.entityId,
        relationshipIds: [],
        nodes: [
          {
            entityId: cause.entityId,
            entityLabel: entityById.get(cause.entityId)?.name ?? cause.entityId,
            domain: cause.domain,
            depth: 0,
            impactSeverity: cause.severity,
            confidence: cause.confidence,
            timeToImpactSeconds: cause.timeToFailureSeconds,
            timeToImpactBand: cause.timeToFailureBand,
            reason: cause.title,
            viaRelationshipId: null,
          },
        ],
      },
    ];
    const visited = new Set<string>([cause.entityId]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || current.nodes.length > 5) continue;
      for (const edge of adjacency.get(current.entityId) ?? []) {
        if (visited.has(edge.toEntityId)) continue;
        visited.add(edge.toEntityId);
        const depth = current.nodes.length;
        const seconds = cause.timeToFailureSeconds === null
          ? null
          : Math.max(0, cause.timeToFailureSeconds + depth * 60);
        const confidence = Math.max(0.55, Math.round((cause.confidence - depth * 0.08) * 100) / 100);
        const affected = entityById.get(edge.toEntityId);
        const node: CascadeNode = {
          entityId: edge.toEntityId,
          entityLabel: affected?.name ?? edge.toEntityId,
          domain: domainForEntity(affected),
          depth,
          impactSeverity: degradeSeverity(cause.severity, depth),
          confidence,
          timeToImpactSeconds: seconds,
          timeToImpactBand: timeToFailureBand(seconds),
          reason: edge.reason,
          viaRelationshipId: edge.relationship.id,
        };
        const nodes = [...current.nodes, node];
        const relationshipIds = [...current.relationshipIds, edge.relationship.id];
        const pathKey = `${cause.id}:${nodes.map((entry) => entry.entityId).join(">")}`;
        paths.push({
          id: `cascade-${pathKey}`,
          scenarioId,
          rootCauseId: cause.id,
          rootEntityId: cause.entityId,
          nodeEntityIds: nodes.map((entry) => entry.entityId),
          relationshipIds,
          nodes,
          severity: node.impactSeverity,
          confidence,
          timeToImpactSeconds: seconds,
          timeToImpactBand: node.timeToImpactBand,
          explanation: `${cause.title} may affect ${node.entityLabel} through ${relationshipIds.join(" → ")}.`,
        });
        const impactKey = `${edge.relationship.id}:${cause.entityId}:${edge.toEntityId}`;
        impacts.set(impactKey, {
          id: `impact-${impactKey}`,
          scenarioId,
          sourceEntityId: cause.entityId,
          affectedEntityId: edge.toEntityId,
          relationshipId: edge.relationship.id,
          relationshipType: edge.relationship.relationshipType,
          severity: node.impactSeverity,
          confidence,
          timeToImpactSeconds: seconds,
          explanation: edge.reason,
        });
        queue.push({ entityId: edge.toEntityId, nodes, relationshipIds });
      }
    }
  }

  return {
    dependencyImpacts: [...impacts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    cascadePaths: paths
      .sort((a, b) => {
        const timeA = a.timeToImpactSeconds ?? Number.MAX_SAFE_INTEGER;
        const timeB = b.timeToImpactSeconds ?? Number.MAX_SAFE_INTEGER;
        return timeA - timeB || a.id.localeCompare(b.id);
      })
      .slice(0, 40),
  };
}

export function buildDomainAssessments(state: OperationalTwinState): DomainContinuityAssessment[] {
  const summary = state.resilienceSummary;
  const assessments: DomainContinuityAssessment[] = [
    {
      domain: "compute",
      score: summary.computeScore,
      status: state.domains.compute.operationalStatus,
      severity: statusSeverity(state.domains.compute.operationalStatus),
      evidence: [`${state.domains.compute.riskyGpus} risky GPUs of ${state.domains.compute.totalGpus}`, `Health ${summary.computeScore}%`],
      dependencyEntityIds: ["power-circuit-gpu-01", "network-local-link-01", "network-central-link-01"],
      timeToFailureSeconds: state.domains.compute.riskyGpus > 0 ? 90 : null,
      timeToFailureBand: state.domains.compute.riskyGpus > 0 ? "under-5-minutes" : "unknown",
      confidence: 0.94,
      sourceLabel: "Synthetic GPU Telemetry",
    },
    {
      domain: "icu",
      score: summary.icuContinuityScore,
      status: state.domains.icu.operationalStatus,
      severity: summary.icuContinuityScore < 60 ? "critical" : summary.icuContinuityScore < 80 ? "high" : "low",
      evidence: [`Occupancy ${state.domains.icu.occupiedBeds}/${state.domains.icu.totalBeds}`, `${state.domains.icu.ventilatorsAvailable} ventilators available`, `${state.domains.icu.devicesOffline} devices offline`],
      dependencyEntityIds: ["oxygen-pipeline-01", "power-circuit-icu-01", "network-local-link-01"],
      timeToFailureSeconds: summary.icuContinuityScore < 60 ? 20 * 60 : null,
      timeToFailureBand: summary.icuContinuityScore < 60 ? "5-30-minutes" : "unknown",
      confidence: 0.92,
      sourceLabel: "Emulated Hospital Telemetry",
    },
    {
      domain: "oxygen",
      score: summary.oxygenContinuityScore,
      status: state.domains.oxygen.operationalStatus,
      severity: summary.oxygenContinuityScore < 55 ? "critical" : summary.oxygenContinuityScore < 75 ? "high" : "low",
      evidence: [`Tank ${state.domains.oxygen.mainTankPercent}%`, `Pressure ${state.domains.oxygen.pipelinePressureBar} bar`, `Depletion ${state.domains.oxygen.estimatedMinutesToDepletion} minutes`],
      dependencyEntityIds: ["power-circuit-oxygen-01", "oxygen-reserve-bank-01"],
      timeToFailureSeconds: state.domains.oxygen.estimatedMinutesToDepletion * 60,
      timeToFailureBand: timeToFailureBand(state.domains.oxygen.estimatedMinutesToDepletion * 60),
      confidence: 0.91,
      sourceLabel: "Emulated Hospital Telemetry",
    },
    {
      domain: "power",
      score: summary.powerContinuityScore,
      status: state.domains.power.operationalStatus,
      severity: summary.powerContinuityScore < 55 ? "critical" : summary.powerContinuityScore < 80 ? "high" : "low",
      evidence: [`Grid ${state.domains.power.gridStatus}`, `UPS ${state.domains.power.upsPercent}%`, `Runtime ${state.domains.power.upsRuntimeMinutes} minutes`, `Generator ${state.domains.power.generatorStatus}`],
      dependencyEntityIds: ["power-ups-01", "power-generator-01", "power-circuit-icu-01", "power-circuit-oxygen-01", "power-circuit-gpu-01"],
      timeToFailureSeconds: state.domains.power.gridStatus === "operational" ? null : state.domains.power.upsRuntimeMinutes * 60,
      timeToFailureBand: state.domains.power.gridStatus === "operational" ? "unknown" : timeToFailureBand(state.domains.power.upsRuntimeMinutes * 60),
      confidence: 0.93,
      sourceLabel: "Emulated Hospital Telemetry",
    },
    {
      domain: "network",
      score: summary.networkContinuityScore,
      status: state.domains.network.operationalStatus,
      severity: summary.networkContinuityScore < 55 ? "critical" : summary.networkContinuityScore < 80 ? "high" : "low",
      evidence: [`Central link ${state.domains.network.centralLinkStatus}`, `Latency ${state.domains.network.centralLatencyMs} ms`, `Packet loss ${state.domains.network.packetLossPercent}%`],
      dependencyEntityIds: ["network-local-link-01", "network-central-link-01", "network-cloud-link-01"],
      timeToFailureSeconds: state.domains.network.centralLinkStatus === "offline" ? 0 : state.domains.network.centralLinkStatus === "degraded" ? 5 * 60 : null,
      timeToFailureBand: state.domains.network.centralLinkStatus === "offline" ? "immediate" : state.domains.network.centralLinkStatus === "degraded" ? "5-30-minutes" : "unknown",
      confidence: 0.94,
      sourceLabel: "Emulated Hospital Telemetry",
    },
  ];
  return assessments;
}

function action(
  id: string,
  domain: ScenarioDomain,
  title: string,
  description: string,
  priority: HospitalResponseAction["priority"],
  requiresHumanApproval = true
): HospitalResponseAction {
  return {
    id,
    domain,
    title,
    description,
    priority,
    requiresHumanApproval,
    policyPermitted: true,
    physicalExecutionPerformed: false,
  };
}

function responsePlan(input: {
  id: string;
  scenarioId: HospitalScenarioId;
  title: string;
  rank: 1 | 2 | 3 | null;
  status?: MultiDomainCandidatePlan["status"];
  score: number;
  confidence: number;
  guardReasons?: string[];
  affectedDomains: ScenarioDomain[];
  actions: HospitalResponseAction[];
  dependencyImpacts: DependencyImpact[];
  mitigated: TimeToFailureBand[];
  before: number;
  after: number;
  remainingRisks: string[];
  evaluatedStateVersion: number;
  evaluatedAt: string;
}): MultiDomainCandidatePlan {
  return {
    id: input.id,
    scenarioId: input.scenarioId,
    title: input.title,
    rank: input.rank,
    status: input.status ?? "eligible",
    score: clampScore(input.score),
    confidence: input.confidence,
    guardReasons: input.guardReasons ?? [],
    affectedDomains: input.affectedDomains,
    recommendedActions: input.actions,
    actionsExplicitlyNotExecuted: [
      "No GPU workload migration was executed.",
      "No generator was started.",
      "No electrical circuit was switched.",
      "No oxygen reserve was activated.",
      "No medical or bedside action was performed.",
    ],
    dependencyImpacts: input.dependencyImpacts,
    timeToFailureMitigated: input.mitigated,
    beforeResilienceScore: input.before,
    projectedResilienceScore: input.after,
    remainingRisks: input.remainingRisks,
    requiresHumanApproval: input.actions.some((entry) => entry.requiresHumanApproval),
    decisionSupportDisclaimer: "Infrastructure decision-support only. What-if simulation; no automatic execution.",
    evaluatedStateVersion: input.evaluatedStateVersion,
    evaluatedAt: input.evaluatedAt,
  };
}

function baseDomainActions(scenarioId: HospitalScenarioId): HospitalResponseAction[] {
  switch (scenarioId) {
    case "icu-capacity-stress":
      return [
        action("icu-preserve-capacity", "icu", "Preserve ICU critical infrastructure capacity", "Protect available aggregate ICU capacity and review constrained ventilator/device availability.", "immediate"),
        action("icu-delay-research", "compute", "Delay only policy-permitted research workloads", "Release non-critical compute capacity without pausing any critical workload.", "high"),
      ];
    case "oxygen-continuity-risk":
      return [
        action("oxygen-prepare-reserve", "oxygen", "Prepare authorized oxygen reserve response", "Prepare the reserve workflow for an authorized operator; MedRouteX does not activate it.", "immediate"),
        action("oxygen-verify-power", "power", "Verify oxygen-plant backup continuity", "Review oxygen-plant power dependency and backup runtime.", "high"),
      ];
    case "power-continuity-failure":
      return [
        action("power-manual-generator-review", "power", "Prepare generator/manual infrastructure response", "Request authorized infrastructure review of generator readiness; no generator start is executed.", "immediate"),
        action("power-preserve-circuits", "power", "Preserve critical circuit continuity", "Prioritize ICU, oxygen-plant, and essential compute circuits under the approved continuity policy.", "immediate"),
      ];
    case "network-continuity-failure":
      return [
        action("network-local-route", "network", "Preserve eligible local route continuity", "Use only Guard-eligible local compute routes while central connectivity is unavailable.", "immediate"),
        action("network-review-link", "network", "Prepare central-link incident review", "Escalate the emulated central link failure to an authorized network operator.", "high"),
      ];
    case "hospital-cascade-crisis":
      return [
        action("cascade-compute", "compute", "Preserve Emergency Stroke CT on a safe eligible local GPU", "Use the Guard-eligible local target while central and cloud routes are unavailable.", "immediate"),
        action("cascade-research", "compute", "Delay only policy-permitted lower-priority workloads", "Do not pause or drop critical workloads.", "high"),
        action("cascade-circuits", "power", "Preserve ICU and oxygen critical-circuit continuity", "Prepare authorized backup continuity response; no circuit switching is performed.", "immediate"),
        action("cascade-oxygen", "oxygen", "Prepare oxygen reserve response", "Prepare authorized reserve support without automatic activation.", "immediate"),
      ];
    case "stroke-compute-crisis":
      return [
        action("stroke-route", "compute", "Route Emergency Stroke CT to the Guard-ranked target", "Record the selected what-if route for human approval; do not execute migration.", "immediate"),
      ];
    case "normal-operations":
      return [];
  }
}

export function buildMultiDomainPlanSet(
  state: OperationalTwinState,
  scenarioId: HospitalScenarioId,
  dependencyImpacts: DependencyImpact[],
  evaluatedAt: string
): MultiDomainPlanSet | null {
  if (scenarioId === "normal-operations") return null;
  const before = state.resilienceSummary.resilienceScore;
  const actions = baseDomainActions(scenarioId);
  let computeTargets: Array<{ label: string; score: number; confidence: number; guardReasons: string[] }> = [];

  if (scenarioId === "stroke-compute-crisis" || scenarioId === "network-continuity-failure" || scenarioId === "hospital-cascade-crisis") {
    try {
      const evaluation = evaluateGuardRuler(state, { evaluatedAt });
      computeTargets = evaluation.planSet.rankedPlans.slice(0, 3).map((plan) => ({
        label: plan.candidatePlan.targetLabel,
        score: plan.totalScore,
        confidence: plan.confidence,
        guardReasons: [],
      }));
      if (computeTargets.length === 0) {
        const blockedReasons = evaluation.planSet.blockedAlternatives.flatMap((entry) => entry.violations.map((violation) => violation.reason));
        return {
          status: "no-safe-plan",
          planA: null,
          planB: null,
          planC: null,
          rankedPlans: [],
          blockedPlans: [
            responsePlan({
              id: `multi-plan-${scenarioId}-blocked`,
              scenarioId,
              title: "Manual review — no safe compute route",
              rank: null,
              status: "blocked",
              score: 0,
              confidence: 0.95,
              guardReasons: blockedReasons,
              affectedDomains: ["compute", "network", "power"],
              actions: [action("manual-review", "hospital-cascade", "Manual continuity review required", "No candidate satisfies all hard Guard constraints.", "immediate")],
              dependencyImpacts,
              mitigated: [],
              before,
              after: before,
              remainingRisks: blockedReasons,
              evaluatedStateVersion: state.version,
              evaluatedAt,
            }),
          ],
          scoringFormula: PLAN_FORMULA,
          weights: PLAN_WEIGHTS,
        };
      }
    } catch {
      computeTargets = [];
    }
  }

  const fallbackTitles = ["Continuity-first response", "Conservative local containment", "Manual coordinated recovery"];
  const plans: MultiDomainCandidatePlan[] = [0, 1, 2].map((index) => {
    const computeTarget = computeTargets[index];
    const label = computeTarget?.label;
    const score = computeTarget?.score ?? [91, 82, 74][index];
    const confidence = computeTarget?.confidence ?? [0.94, 0.88, 0.82][index];
    const title = label
      ? `Plan ${String.fromCharCode(65 + index)} — ${label} continuity route`
      : `Plan ${String.fromCharCode(65 + index)} — ${fallbackTitles[index]}`;
    const adjustedActions = index === 0
      ? actions
      : index === 1
        ? actions.map((entry) => ({ ...entry, priority: entry.priority === "immediate" ? "high" as const : entry.priority }))
        : [action(`manual-${scenarioId}`, "hospital-cascade", "Coordinated manual continuity review", "Hold automatic changes and present all evidence to authorized operators.", "immediate")];
    return responsePlan({
      id: `multi-plan-${scenarioId}-${index + 1}`,
      scenarioId,
      title,
      rank: (index + 1) as 1 | 2 | 3,
      score,
      confidence,
      guardReasons: computeTarget?.guardReasons ?? [],
      affectedDomains: scenarioId === "hospital-cascade-crisis" ? ["compute", "icu", "oxygen", "power", "network"] : [...new Set(adjustedActions.map((entry) => entry.domain))],
      actions: adjustedActions,
      dependencyImpacts,
      mitigated: index === 0 ? ["immediate", "under-5-minutes", "5-30-minutes"] : index === 1 ? ["under-5-minutes", "5-30-minutes"] : ["5-30-minutes"],
      before,
      after: Math.min(98, before + [14, 9, 5][index]),
      remainingRisks: [
        "All outputs are what-if projections and require authorized human review.",
        index === 2 ? "Manual coordination may not meet the shortest compute deadline." : "Physical infrastructure status must be verified by hospital operators.",
      ],
      evaluatedStateVersion: state.version,
      evaluatedAt,
    });
  });

  return {
    status: "plans-available",
    planA: plans[0],
    planB: plans[1],
    planC: plans[2],
    rankedPlans: plans,
    blockedPlans: [],
    scoringFormula: PLAN_FORMULA,
    weights: PLAN_WEIGHTS,
  };
}
