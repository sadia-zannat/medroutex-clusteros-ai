import type {
  HospitalDomainState,
  OperationalEvent,
  OperationalEventCategory,
  OperationalEventDomain,
  OperationalEventSeverity,
  OperationalSourceLabel,
  OperationalTwinState,
  TwinEntity,
  TwinTelemetryPoint,
} from "./types";

const COMPUTE_OVERHEAT_C = 85;
const COMPUTE_MEMORY_PRESSURE_RATIO = 0.9;
const COMPUTE_CLUSTER_RISK_RATIO = 0.5;
const ICU_CAPACITY_RATIO = 0.9;
const UPS_LOW_RUNTIME_MINUTES = 15;
const NETWORK_CRITICAL_LATENCY_MS = 120;
const NETWORK_CRITICAL_PACKET_LOSS_PERCENT = 5;

function timestampToken(timestamp: string): string {
  return timestamp.replaceAll(/[^0-9A-Za-z]/g, "");
}

function sourceForDomain(
  domain: OperationalEventDomain
): OperationalSourceLabel {
  return domain === "compute"
    ? "Synthetic GPU Telemetry"
    : "Emulated Hospital Telemetry";
}

function domainForEntity(
  entity: TwinEntity | undefined
): OperationalEventDomain {
  if (!entity) return "system";
  if (
    entity.entityType === "compute-node" ||
    entity.entityType === "workload"
  ) {
    return "compute";
  }
  if (
    entity.entityType === "icu-unit" ||
    entity.entityType === "capacity" ||
    entity.entityType === "ventilator-aggregate" ||
    entity.entityType === "medical-device"
  ) {
    return "icu";
  }
  if (
    entity.entityType === "oxygen-tank" ||
    entity.entityType === "oxygen-reserve-bank" ||
    entity.entityType === "oxygen-pipeline"
  ) {
    return "oxygen";
  }
  if (
    entity.entityType === "power-grid" ||
    entity.entityType === "ups" ||
    entity.entityType === "generator" ||
    entity.entityType === "critical-circuit"
  ) {
    return "power";
  }
  if (entity.entityType === "network-link") return "network";
  if (entity.entityType === "external-service") return "connector";
  return "system";
}

function transitionEvent(input: {
  state: OperationalTwinState;
  timestamp: string;
  eventType: OperationalEvent["eventType"];
  category: OperationalEventCategory;
  domain: OperationalEventDomain;
  severity: OperationalEventSeverity;
  title: string;
  message: string;
  reason: string;
  sourceEntityIds: string[];
  transitionKey: string;
  metadata?: Record<string, unknown>;
}): OperationalEvent {
  const token = timestampToken(input.timestamp);
  return {
    id: `event-transition-${input.transitionKey}-${token}`,
    eventType: input.eventType,
    category: input.category,
    domain: input.domain,
    severity: input.severity,
    status:
      input.severity === "success"
        ? "resolved"
        : input.severity === "info"
          ? "informational"
          : "active",
    title: input.title,
    message: input.message,
    reason: input.reason,
    timestamp: input.timestamp,
    sourceEntityIds: input.sourceEntityIds,
    correlationId: `correlation-${input.domain}-${input.transitionKey}`,
    dedupeKey: `transition:${input.transitionKey}:${token}`,
    simulationOnly: true,
    source: sourceForDomain(input.domain),
    metadata: {
      notificationCooldownKey: `${input.domain}:${input.transitionKey}`,
      transitionDetected: true,
      ...(input.metadata ?? {}),
    },
    stateVersion: input.state.version,
  };
}

function numberAttribute(entity: TwinEntity, name: string): number | null {
  const value = entity.attributes[name];
  return typeof value === "number" ? value : null;
}

function memoryPressure(entity: TwinEntity): number {
  const used = numberAttribute(entity, "memoryUsedMiB");
  const total = numberAttribute(entity, "memoryTotalMiB");
  if (used === null || total === null || total <= 0) return 0;
  return used / total;
}

function computeTransitionEvents(
  previous: OperationalTwinState,
  next: OperationalTwinState,
  timestamp: string
): OperationalEvent[] {
  const events: OperationalEvent[] = [];
  const previousById = new Map(
    previous.entities.map((entity) => [entity.id, entity])
  );

  for (const entity of next.entities.filter(
    (candidate) => candidate.entityType === "compute-node"
  )) {
    const prior = previousById.get(entity.id);
    if (!prior) continue;
    const becameOffline =
      entity.status === "offline" && prior.status !== "offline";
    const becameOverheated =
      (numberAttribute(entity, "temperatureC") ?? 0) >=
        COMPUTE_OVERHEAT_C &&
      (numberAttribute(prior, "temperatureC") ?? 0) <
        COMPUTE_OVERHEAT_C;
    const becameMemoryConstrained =
      memoryPressure(entity) >= COMPUTE_MEMORY_PRESSURE_RATIO &&
      memoryPressure(prior) < COMPUTE_MEMORY_PRESSURE_RATIO;
    const becameCritical =
      (entity.status === "critical" || entity.riskScore >= 50) &&
      prior.status !== "critical" &&
      prior.riskScore < 50;

    if (becameOffline) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "gpu-offline",
          category: "incident",
          domain: "compute",
          severity: "critical",
          title: `${entity.name} Offline`,
          message: `${entity.name} entered an offline state in synthetic GPU telemetry.`,
          reason:
            "A compute-node availability transition can remove a guarded workload route.",
          sourceEntityIds: [entity.id],
          transitionKey: `${entity.id}:offline`,
        })
      );
    } else if (becameOverheated) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "gpu-overheating",
          category: "risk",
          domain: "compute",
          severity: "critical",
          title: `${entity.name} Overheating`,
          message: `${entity.name} crossed the ${COMPUTE_OVERHEAT_C}°C prototype risk threshold.`,
          reason:
            "The temperature transition requires guarded route review; no workload migration was executed.",
          sourceEntityIds: [entity.id],
          transitionKey: `${entity.id}:overheating`,
          metadata: {
            temperatureC: numberAttribute(entity, "temperatureC"),
            prototypeThresholdC: COMPUTE_OVERHEAT_C,
          },
        })
      );
    } else if (becameMemoryConstrained) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "gpu-memory-overload",
          category: "risk",
          domain: "compute",
          severity: "critical",
          title: `${entity.name} Memory Pressure`,
          message:
            `${entity.name} crossed the ${Math.round(
              COMPUTE_MEMORY_PRESSURE_RATIO * 100
            )}% prototype memory-pressure threshold.`,
          reason:
            "The capacity transition may remove this node from safe route ranking.",
          sourceEntityIds: [entity.id],
          transitionKey: `${entity.id}:memory-pressure`,
          metadata: {
            memoryUsedMiB: numberAttribute(entity, "memoryUsedMiB"),
            memoryTotalMiB: numberAttribute(entity, "memoryTotalMiB"),
          },
        })
      );
    } else if (becameCritical) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "gpu-critical-risk",
          category: "risk",
          domain: "compute",
          severity: "critical",
          title: `${entity.name} Critical Risk`,
          message: `${entity.name} entered a critical synthetic compute-risk state.`,
          reason:
            "A canonical compute-state transition requires route and capacity review.",
          sourceEntityIds: [entity.id],
          transitionKey: `${entity.id}:critical-risk`,
        })
      );
    }
  }

  const clusterRiskThreshold = Math.max(
    2,
    Math.ceil(
      next.domains.compute.totalGpus * COMPUTE_CLUSTER_RISK_RATIO
    )
  );
  if (
    next.domains.compute.riskyGpus >= clusterRiskThreshold &&
    previous.domains.compute.riskyGpus < clusterRiskThreshold
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "cluster-overload",
        category: "risk",
        domain: "compute",
        severity: "critical",
        title: "Compute Cluster Capacity Risk",
        message: `${next.domains.compute.riskyGpus} of ${next.domains.compute.totalGpus} GPUs are in a risky state.`,
        reason:
          "The synthetic cluster crossed the prototype risk-density threshold.",
        sourceEntityIds: next.entities
          .filter(
            (entity) =>
              entity.entityType === "compute-node" &&
              (entity.status === "critical" || entity.riskScore >= 50)
          )
          .map((entity) => entity.id),
        transitionKey: "compute-cluster:overload",
        metadata: {
          riskyGpus: next.domains.compute.riskyGpus,
          totalGpus: next.domains.compute.totalGpus,
          prototypeRiskRatio: COMPUTE_CLUSTER_RISK_RATIO,
        },
      })
    );
  }

  return events;
}

function unsafeStatus(status: string): boolean {
  return status === "critical" || status === "offline";
}

function icuRisk(domains: HospitalDomainState): boolean {
  const icu = domains.icu;
  const occupancyRatio =
    icu.totalBeds > 0 ? icu.occupiedBeds / icu.totalBeds : 1;
  return (
    unsafeStatus(icu.operationalStatus) ||
    occupancyRatio >= ICU_CAPACITY_RATIO ||
    icu.devicesOffline > 0
  );
}

function powerRisk(domains: HospitalDomainState): boolean {
  const power = domains.power;
  return (
    unsafeStatus(power.gridStatus) ||
    power.upsRuntimeMinutes <= UPS_LOW_RUNTIME_MINUTES ||
    power.generatorStatus === "offline" ||
    unsafeStatus(power.oxygenPlantPowerStatus) ||
    unsafeStatus(power.icuPowerStatus) ||
    unsafeStatus(power.gpuDataCenterPowerStatus)
  );
}

function networkRisk(domains: HospitalDomainState): boolean {
  const network = domains.network;
  return (
    unsafeStatus(network.localLinkStatus) ||
    unsafeStatus(network.centralLinkStatus) ||
    unsafeStatus(network.cloudLinkStatus) ||
    network.centralLatencyMs >= NETWORK_CRITICAL_LATENCY_MS ||
    network.packetLossPercent >= NETWORK_CRITICAL_PACKET_LOSS_PERCENT
  );
}

function hospitalDomainTransitionEvents(
  previous: OperationalTwinState,
  next: OperationalTwinState,
  timestamp: string
): OperationalEvent[] {
  const events: OperationalEvent[] = [];
  const previousIcu = previous.domains.icu;
  const nextIcu = next.domains.icu;
  const previousOccupancy =
    previousIcu.totalBeds > 0
      ? previousIcu.occupiedBeds / previousIcu.totalBeds
      : 1;
  const nextOccupancy =
    nextIcu.totalBeds > 0 ? nextIcu.occupiedBeds / nextIcu.totalBeds : 1;

  if (
    (unsafeStatus(nextIcu.operationalStatus) ||
      nextOccupancy >= ICU_CAPACITY_RATIO) &&
    !unsafeStatus(previousIcu.operationalStatus) &&
    previousOccupancy < ICU_CAPACITY_RATIO
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "icu-capacity-critical",
        category: "incident",
        domain: "icu",
        severity: "critical",
        title: "ICU Capacity Critical",
        message: `Emulated ICU occupancy is ${nextIcu.occupiedBeds} of ${nextIcu.totalBeds} beds.`,
        reason:
          "The ICU domain crossed a prototype infrastructure-capacity risk condition.",
        sourceEntityIds: ["icu-unit-01", "icu-capacity-01"],
        transitionKey: "icu:capacity-critical",
        metadata: {
          occupiedBeds: nextIcu.occupiedBeds,
          totalBeds: nextIcu.totalBeds,
          prototypeOccupancyRatio: ICU_CAPACITY_RATIO,
        },
      })
    );
  }

  if (nextIcu.devicesOffline > 0 && previousIcu.devicesOffline === 0) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "icu-device-availability-critical",
        category: "incident",
        domain: "icu",
        severity: "critical",
        title: "ICU Device Availability Critical",
        message: `${nextIcu.devicesOffline} emulated ICU device aggregates are offline.`,
        reason:
          "A device-availability transition requires infrastructure operator review.",
        sourceEntityIds: ["icu-ventilator-aggregate-01"],
        transitionKey: "icu:device-availability",
        metadata: { devicesOffline: nextIcu.devicesOffline },
      })
    );
  }

  const previousPower = previous.domains.power;
  const nextPower = next.domains.power;
  if (
    unsafeStatus(nextPower.gridStatus) &&
    !unsafeStatus(previousPower.gridStatus)
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "grid-failure",
        category: "incident",
        domain: "power",
        severity: "critical",
        title: "Hospital Grid Continuity Failure",
        message: `The emulated main grid entered ${nextPower.gridStatus} status.`,
        reason:
          "Critical infrastructure dependencies require power-continuity review.",
        sourceEntityIds: ["power-main-grid-01"],
        transitionKey: "power:grid-failure",
      })
    );
  }
  if (
    nextPower.upsRuntimeMinutes <= UPS_LOW_RUNTIME_MINUTES &&
    previousPower.upsRuntimeMinutes > UPS_LOW_RUNTIME_MINUTES
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "ups-runtime-low",
        category: "risk",
        domain: "power",
        severity: "critical",
        title: "UPS Runtime Low",
        message: `Emulated UPS runtime fell to ${nextPower.upsRuntimeMinutes} minutes.`,
        reason:
          "The prototype continuity window crossed its low-runtime threshold.",
        sourceEntityIds: ["power-ups-01"],
        transitionKey: "power:ups-runtime-low",
        metadata: {
          upsRuntimeMinutes: nextPower.upsRuntimeMinutes,
          prototypeThresholdMinutes: UPS_LOW_RUNTIME_MINUTES,
        },
      })
    );
  }
  if (
    nextPower.generatorStatus === "offline" &&
    previousPower.generatorStatus !== "offline"
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "generator-failure",
        category: "incident",
        domain: "power",
        severity: "critical",
        title: "Backup Generator Unavailable",
        message: "The emulated backup generator entered an offline state.",
        reason:
          "Grid backup availability changed and requires human infrastructure review.",
        sourceEntityIds: ["power-generator-01"],
        transitionKey: "power:generator-failure",
      })
    );
  }

  const circuitTransitions = [
    [
      "power-circuit-oxygen-01",
      previousPower.oxygenPlantPowerStatus,
      nextPower.oxygenPlantPowerStatus,
    ],
    [
      "power-circuit-icu-01",
      previousPower.icuPowerStatus,
      nextPower.icuPowerStatus,
    ],
    [
      "power-circuit-gpu-01",
      previousPower.gpuDataCenterPowerStatus,
      nextPower.gpuDataCenterPowerStatus,
    ],
  ] as const;
  for (const [entityId, previousStatus, nextStatus] of circuitTransitions) {
    if (unsafeStatus(nextStatus) && !unsafeStatus(previousStatus)) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "critical-circuit-failure",
          category: "incident",
          domain: "power",
          severity: "action-required",
          title: "Critical Power Circuit Failure",
          message: `${entityId} entered ${nextStatus} emulated status.`,
          reason:
            "A critical dependency circuit changed state; MedRouteX executed no actuator action.",
          sourceEntityIds: [entityId],
          transitionKey: `${entityId}:failure`,
          metadata: { physicalActuationExecuted: false },
        })
      );
    }
  }

  const previousNetwork = previous.domains.network;
  const nextNetwork = next.domains.network;
  const linkTransitions = [
    [
      "network-local-link-01",
      previousNetwork.localLinkStatus,
      nextNetwork.localLinkStatus,
    ],
    [
      "network-central-link-01",
      previousNetwork.centralLinkStatus,
      nextNetwork.centralLinkStatus,
    ],
    [
      "network-cloud-link-01",
      previousNetwork.cloudLinkStatus,
      nextNetwork.cloudLinkStatus,
    ],
  ] as const;
  for (const [entityId, previousStatus, nextStatus] of linkTransitions) {
    if (nextStatus === "offline" && previousStatus !== "offline") {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "network-link-offline",
          category: "incident",
          domain: "network",
          severity: "critical",
          title: "Network Link Offline",
          message: `${entityId} entered an offline emulated state.`,
          reason:
            "A network dependency is unavailable for guarded workload routing.",
          sourceEntityIds: [entityId],
          transitionKey: `${entityId}:offline`,
        })
      );
    }
  }
  if (
    (nextNetwork.centralLatencyMs >= NETWORK_CRITICAL_LATENCY_MS ||
      nextNetwork.packetLossPercent >=
        NETWORK_CRITICAL_PACKET_LOSS_PERCENT) &&
    previousNetwork.centralLatencyMs < NETWORK_CRITICAL_LATENCY_MS &&
    previousNetwork.packetLossPercent <
      NETWORK_CRITICAL_PACKET_LOSS_PERCENT
  ) {
    events.push(
      transitionEvent({
        state: next,
        timestamp,
        eventType: "network-quality-critical",
        category: "risk",
        domain: "network",
        severity: "critical",
        title: "Network Quality Critical",
        message: `Central latency is ${nextNetwork.centralLatencyMs} ms with ${nextNetwork.packetLossPercent}% packet loss.`,
        reason:
          "The emulated route crossed a prototype quality threshold.",
        sourceEntityIds: ["network-central-link-01"],
        transitionKey: "network:quality-critical",
        metadata: {
          centralLatencyMs: nextNetwork.centralLatencyMs,
          packetLossPercent: nextNetwork.packetLossPercent,
          prototypeLatencyThresholdMs: NETWORK_CRITICAL_LATENCY_MS,
          prototypePacketLossThresholdPercent:
            NETWORK_CRITICAL_PACKET_LOSS_PERCENT,
        },
      })
    );
  }

  const recoveryDomains = [
    ["icu", icuRisk(previous.domains), icuRisk(next.domains)],
    ["power", powerRisk(previous.domains), powerRisk(next.domains)],
    ["network", networkRisk(previous.domains), networkRisk(next.domains)],
  ] as const;
  for (const [domain, wasAtRisk, isAtRisk] of recoveryDomains) {
    if (wasAtRisk && !isAtRisk) {
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: "recovery-completed",
          category: "recovery",
          domain,
          severity: "success",
          title: `${domain.toUpperCase()} Infrastructure Recovered`,
          message: `The emulated ${domain} domain returned to its prototype-safe operating envelope.`,
          reason:
            "A canonical risk-to-safe state transition was confirmed during synchronization.",
          sourceEntityIds: [],
          transitionKey: `${domain}:recovered`,
        })
      );
    }
  }

  return events;
}

function telemetryKey(point: TwinTelemetryPoint): string {
  return `${point.entityId}:${point.metric}`;
}

function telemetryQualityTransitionEvents(
  previous: OperationalTwinState,
  next: OperationalTwinState,
  timestamp: string
): OperationalEvent[] {
  const previousByKey = new Map(
    previous.latestTelemetry.map((point) => [telemetryKey(point), point])
  );
  const nextEntityById = new Map(
    next.entities.map((entity) => [entity.id, entity])
  );
  const affectedByStatus = new Map<
    "stale" | "offline",
    Map<OperationalEventDomain, Set<string>>
  >([
    ["stale", new Map()],
    ["offline", new Map()],
  ]);

  for (const point of next.latestTelemetry) {
    const prior = previousByKey.get(telemetryKey(point));
    const currentStatus =
      point.quality === "offline"
        ? "offline"
        : point.quality === "stale" || point.isStale
          ? "stale"
          : null;
    if (!currentStatus) continue;
    const previousStatus =
      prior?.quality === "offline"
        ? "offline"
        : prior?.quality === "stale" || prior?.isStale
          ? "stale"
          : null;
    if (previousStatus === currentStatus) continue;

    const domain = domainForEntity(nextEntityById.get(point.entityId));
    const byDomain = affectedByStatus.get(currentStatus);
    const entityIds = byDomain?.get(domain) ?? new Set<string>();
    entityIds.add(point.entityId);
    byDomain?.set(domain, entityIds);
  }

  const events: OperationalEvent[] = [];
  for (const status of ["offline", "stale"] as const) {
    const byDomain = affectedByStatus.get(status);
    if (!byDomain) continue;
    for (const [domain, entityIds] of byDomain) {
      const offline = status === "offline";
      events.push(
        transitionEvent({
          state: next,
          timestamp,
          eventType: offline ? "telemetry-offline" : "telemetry-stale",
          category: "telemetry",
          domain,
          severity: offline ? "critical" : "warning",
          title: offline
            ? "Telemetry Source Offline"
            : "Telemetry Quality Stale",
          message: `${entityIds.size} ${domain} infrastructure source${
            entityIds.size === 1 ? "" : "s"
          } entered ${status} telemetry quality.`,
          reason:
            "Freshness and quality are evaluated at canonical synchronization boundaries.",
          sourceEntityIds: [...entityIds],
          transitionKey: `${domain}:telemetry-${status}`,
          metadata: {
            telemetryQuality: status,
            affectedSourceCount: entityIds.size,
          },
        })
      );
    }
  }
  return events;
}

export function evaluateOperationalTransitions(
  previous: OperationalTwinState,
  next: OperationalTwinState,
  timestamp: string
): OperationalEvent[] {
  return [
    ...computeTransitionEvents(previous, next, timestamp),
    ...hospitalDomainTransitionEvents(previous, next, timestamp),
    ...telemetryQualityTransitionEvents(previous, next, timestamp),
  ];
}
