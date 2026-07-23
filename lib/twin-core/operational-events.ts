import {
  evaluateNotificationRule,
  notificationRuleConfigurationFromEnvironment,
  type NotificationRuleDecision,
  type NotificationRuleConfiguration,
} from "./notification-rules";
import type {
  OperationalEvent,
  OperationalEventSeverity,
  OperationalEventType,
  OperationalNotification,
  OperationalTwinState,
  EmailDeliveryRecord,
  TwinApprovalDecision,
  TwinApprovalRecord,
} from "./types";

export const MAX_OPERATIONAL_EVENTS = 500;
export const MAX_OPERATIONAL_NOTIFICATIONS = 200;
export const MAX_EMAIL_DELIVERY_RECORDS = 200;

export interface OperationalEventAppendResult {
  state: OperationalTwinState;
  insertedEvents: OperationalEvent[];
  insertedNotifications: OperationalNotification[];
}

const SEVERITY_RANK: Readonly<Record<OperationalEventSeverity, number>> = {
  info: 0,
  success: 1,
  warning: 2,
  critical: 3,
  "action-required": 4,
};

const TERMINAL_NOTIFICATION_EVENT_TYPES: ReadonlySet<OperationalEventType> =
  new Set([
    "decision-approved",
    "decision-rejected",
    "oxygen-recovered",
    "recovery-completed",
  ]);

function notificationTypesResolvedBy(
  eventType: OperationalEventType
): ReadonlySet<OperationalEventType> {
  if (
    eventType === "decision-approved" ||
    eventType === "decision-rejected"
  ) {
    return new Set(["human-approval-required"]);
  }
  if (eventType === "oxygen-critical") {
    return new Set(["oxygen-warning"]);
  }
  if (eventType === "oxygen-action-required") {
    return new Set(["oxygen-warning", "oxygen-critical"]);
  }
  if (eventType === "oxygen-recovered") {
    return new Set([
      "oxygen-warning",
      "oxygen-critical",
      "oxygen-action-required",
    ]);
  }
  return new Set();
}

function resolveSupersededNotifications(
  notifications: OperationalNotification[],
  event: OperationalEvent
): void {
  const resolvedEventTypes = notificationTypesResolvedBy(
    event.eventType
  );
  if (resolvedEventTypes.size === 0) return;

  for (let index = 0; index < notifications.length; index += 1) {
    const notification = notifications[index];
    if (
      notification.lifecycleStatus !== "active" ||
      !resolvedEventTypes.has(notification.eventType) ||
      notification.correlationId !== event.correlationId
    ) {
      continue;
    }

    notifications[index] = {
      ...notification,
      lifecycleStatus: "resolved",
      lifecycleUpdatedAt: event.timestamp,
      lifecycleStateVersion: event.stateVersion,
      resolvedAt: event.timestamp,
      resolvedByEventId: event.id,
      resolutionReason:
        event.eventType === "decision-approved"
          ? "The operator recorded a final approval for this recommendation."
          : event.eventType === "decision-rejected"
            ? "The operator recorded a final rejection for this recommendation."
            : event.eventType === "oxygen-recovered"
              ? "The oxygen condition recovered after two safe confirmation cycles."
              : "A higher-severity oxygen condition superseded this notification.",
    };
  }
}

function notificationWithinCooldown(
  existing: OperationalNotification[],
  event: OperationalEvent,
  cooldownKey: string,
  cooldownSeconds: number
): boolean {
  if (cooldownSeconds <= 0) return false;
  const eventTime = Date.parse(event.timestamp);
  if (!Number.isFinite(eventTime)) return false;

  return existing.some((notification) => {
    if (notification.metadata.cooldownKey !== cooldownKey) return false;
    if (SEVERITY_RANK[event.severity] > SEVERITY_RANK[notification.severity]) {
      return false;
    }
    const notificationTime = Date.parse(notification.timestamp);
    return (
      Number.isFinite(notificationTime) &&
      eventTime - notificationTime >= 0 &&
      eventTime - notificationTime < cooldownSeconds * 1000
    );
  });
}

function createNotification(
  event: OperationalEvent,
  existing: OperationalNotification[],
  configuration: NotificationRuleConfiguration
): OperationalNotification | null {
  const decision = evaluateNotificationRule(event, configuration);
  if (!decision.visible) return null;
  if (
    existing.some(
      (notification) =>
        notification.dedupeKey === decision.dedupeKey ||
        notification.eventId === event.id
    )
  ) {
    return null;
  }
  if (
    notificationWithinCooldown(
      existing,
      event,
      decision.cooldownKey,
      decision.cooldownSeconds
    )
  ) {
    return null;
  }

  const lifecycleStatus = TERMINAL_NOTIFICATION_EVENT_TYPES.has(
    event.eventType
  )
    ? "resolved"
    : "active";

  return {
    id: `notification-${event.id}`,
    eventId: event.id,
    eventType: event.eventType,
    category: event.category,
    domain: event.domain,
    severity: decision.severity,
    title: event.title,
    message: event.message,
    reason: event.reason,
    explanation: decision.explanation,
    timestamp: event.timestamp,
    sourceEntityIds: [...event.sourceEntityIds],
    targetRoles: decision.targetRoles,
    correlationId: event.correlationId,
    dedupeKey: decision.dedupeKey,
    cooldownSeconds: decision.cooldownSeconds,
    emailEligible: decision.emailEligible,
    lifecycleStatus,
    lifecycleUpdatedAt: event.timestamp,
    lifecycleStateVersion: event.stateVersion,
    ...(lifecycleStatus === "resolved"
      ? {
          resolvedAt: event.timestamp,
          resolvedByEventId: event.id,
          resolutionReason:
            "This notification records a completed operational outcome.",
        }
      : {}),
    simulationOnly: true,
    source: event.source,
    metadata: {
      ...event.metadata,
      cooldownKey: decision.cooldownKey,
    },
    stateVersion: event.stateVersion,
  };
}

function createSuppressedEmailDelivery(input: {
  event: OperationalEvent;
  decision: NotificationRuleDecision;
  suppression: "deduplicated" | "cooldown";
}): EmailDeliveryRecord {
  const { event, decision, suppression } = input;
  return {
    id: `email-suppressed-${event.id}-${suppression}`,
    kind: "operational-alert",
    eventId: event.id,
    status: "suppressed",
    provider: "disabled",
    attemptedAt: event.timestamp,
    completedAt: event.timestamp,
    recipientRoles: [...decision.targetRoles],
    recipientCount: 0,
    subject: `[MedRouteX] ${event.severity.toUpperCase()}: ${event.title}`,
    reason:
      suppression === "cooldown"
        ? "Email delivery was suppressed by the domain-aware notification cooldown."
        : "Email delivery was suppressed because the canonical event or notification was already recorded.",
    correlationId: event.correlationId,
    dedupeKey: `email-suppressed:${decision.dedupeKey}:${suppression}`,
    simulationOnly: true,
    source: "MedRouteX Notification Service",
    stateVersion: event.stateVersion,
  };
}

function appendSuppressedEmailDelivery(
  deliveries: EmailDeliveryRecord[],
  delivery: EmailDeliveryRecord
): void {
  if (
    deliveries.some(
      (existing) =>
        existing.id === delivery.id ||
        existing.dedupeKey === delivery.dedupeKey
    )
  ) {
    return;
  }
  deliveries.push(delivery);
}

export function appendOperationalEvents(
  state: OperationalTwinState,
  candidates: readonly OperationalEvent[],
  configuration: NotificationRuleConfiguration =
    notificationRuleConfigurationFromEnvironment(process.env)
): OperationalEventAppendResult {
  const operationalEvents = [...state.operationalEvents];
  const notifications = [...state.notifications];
  const emailDeliveries = [...state.emailDeliveries];
  const insertedEvents: OperationalEvent[] = [];
  const insertedNotifications: OperationalNotification[] = [];
  const ids = new Set(operationalEvents.map((event) => event.id));
  const dedupeKeys = new Set(
    operationalEvents.map((event) => event.dedupeKey)
  );

  for (const candidate of candidates) {
    resolveSupersededNotifications(notifications, candidate);

    if (ids.has(candidate.id) || dedupeKeys.has(candidate.dedupeKey)) {
      const decision = evaluateNotificationRule(candidate, configuration);
      if (decision.visible && decision.emailEligible) {
        appendSuppressedEmailDelivery(
          emailDeliveries,
          createSuppressedEmailDelivery({
            event: candidate,
            decision,
            suppression: "deduplicated",
          })
        );
      }
      continue;
    }
    operationalEvents.push(candidate);
    insertedEvents.push(candidate);
    ids.add(candidate.id);
    dedupeKeys.add(candidate.dedupeKey);

    const notification = createNotification(
      candidate,
      notifications,
      configuration
    );
    if (notification) {
      notifications.push(notification);
      insertedNotifications.push(notification);
    } else {
      const decision = evaluateNotificationRule(candidate, configuration);
      if (
        decision.visible &&
        decision.emailEligible &&
        notificationWithinCooldown(
          notifications,
          candidate,
          decision.cooldownKey,
          decision.cooldownSeconds
        )
      ) {
        appendSuppressedEmailDelivery(
          emailDeliveries,
          createSuppressedEmailDelivery({
            event: candidate,
            decision,
            suppression: "cooldown",
          })
        );
      }
    }
  }

  return {
    state: {
      ...state,
      operationalEvents: operationalEvents.slice(-MAX_OPERATIONAL_EVENTS),
      notifications: notifications.slice(-MAX_OPERATIONAL_NOTIFICATIONS),
      emailDeliveries: emailDeliveries.slice(-MAX_EMAIL_DELIVERY_RECORDS),
    },
    insertedEvents,
    insertedNotifications,
  };
}

export function createBaselineResetEvent(
  stateVersion: number,
  timestamp: string
): OperationalEvent {
  return {
    id: "event-baseline-reset",
    eventType: "baseline-reset",
    category: "system",
    domain: "system",
    severity: "info",
    status: "completed",
    title: "Operational Baseline Restored",
    message:
      "The synthetic MedRouteX demonstration returned to its PHI-Zero infrastructure baseline.",
    reason:
      "A reset cleared active scenarios, incidents, notifications, delivery history, recovery counters, and decision history.",
    timestamp,
    sourceEntityIds: ["hospital-diu-001"],
    correlationId: "correlation-baseline-reset",
    dedupeKey: "baseline-reset",
    simulationOnly: true,
    source: "MedRouteX Operational Twin",
    metadata: {
      notificationVisibility: "history-only",
      resetPolicy: "single-baseline-snapshot-and-event",
    },
    stateVersion,
  };
}

export function createCrisisEvents(
  state: OperationalTwinState,
  timestamp: string
): OperationalEvent[] {
  const simulation = state.activeSimulation;
  if (!simulation) return [];
  const correlationId = `correlation-${simulation.id}`;
  const common = {
    timestamp,
    scenarioId: simulation.scenarioId,
    simulationId: simulation.id,
    correlationId,
    simulationOnly: true as const,
    stateVersion: state.version,
  };
  const groupedDetail = {
    notificationVisibility: "grouped-detail",
    notificationCooldownKey: `${simulation.id}:crisis-summary`,
  };

  return [
    {
      ...common,
      id: `event-${simulation.id}-scenario-started`,
      eventType: "scenario-started",
      category: "scenario",
      domain: "simulation",
      severity: "info",
      status: "completed",
      title: "Stroke Crisis Scenario Started",
      message:
        "The deterministic Emergency Stroke CT infrastructure simulation started against the canonical Hospital Twin.",
      reason:
        "The operator initiated the PHI-Zero MedRouteX crisis demonstration.",
      sourceEntityIds: ["workload-stroke-ct-001"],
      recommendationId: simulation.recommendationId,
      dedupeKey: `${simulation.id}:scenario-started`,
      source: "MedRouteX Operational Twin",
      metadata: {
        notificationVisibility: "history-only",
        scenarioName: simulation.scenarioName,
        simulationOnly: true,
      },
    },
    {
      ...common,
      id: `event-${simulation.id}-crisis-summary`,
      eventType: "crisis-summary",
      category: "scenario",
      domain: "simulation",
      severity: "critical",
      status: "active",
      title: "Stroke Crisis Continuity Risk",
      message:
        "Emergency Stroke CT is at risk across local compute capacity and requires a guarded Central GPU-7 routing decision.",
      reason:
        "GPU-2 is overheating, GPU-3 is memory constrained, the cloud route is privacy blocked, and the 120-second deadline is at risk.",
      sourceEntityIds: [
        "workload-stroke-ct-001",
        "compute-local-gpu-02",
        "compute-local-gpu-03",
        "compute-central-gpu-07",
      ],
      recommendationId: simulation.recommendationId,
      dedupeKey: `${simulation.id}:crisis-summary`,
      source: "MedRouteX Operational Twin",
      metadata: {
        notificationCooldownKey: `${simulation.id}:crisis-summary`,
        deadlineSeconds: 120,
        privacyRoute: "blocked",
        recommendedTarget: "Central GPU-7",
        detailsRetainedInHistory: true,
      },
    },
    {
      ...common,
      id: `event-${simulation.id}-gpu-2-overheating`,
      eventType: "gpu-overheating",
      category: "risk",
      domain: "compute",
      severity: "critical",
      status: "active",
      title: "GPU-2 Overheating",
      message: "Local GPU-2 reached 92°C in synthetic GPU telemetry.",
      reason:
        "The emergency workload places the local compute node outside the safe prototype routing envelope.",
      sourceEntityIds: ["compute-local-gpu-02"],
      dedupeKey: `${simulation.id}:gpu-2-overheating`,
      source: "Synthetic GPU Telemetry",
      metadata: { ...groupedDetail, temperatureC: 92 },
    },
    {
      ...common,
      id: `event-${simulation.id}-gpu-3-memory-overload`,
      eventType: "gpu-memory-overload",
      category: "risk",
      domain: "compute",
      severity: "critical",
      status: "active",
      title: "GPU-3 Memory Overload",
      message:
        "Local GPU-3 reached approximately 7.7 GB of its 8 GB crisis memory envelope.",
      reason:
        "Available local memory cannot provide a reliable route for the time-critical workload.",
      sourceEntityIds: ["compute-local-gpu-03"],
      dedupeKey: `${simulation.id}:gpu-3-memory-overload`,
      source: "Synthetic GPU Telemetry",
      metadata: {
        ...groupedDetail,
        memoryUsedMiB: 7900,
        memoryTotalMiB: 8188,
      },
    },
    {
      ...common,
      id: `event-${simulation.id}-privacy-block`,
      eventType: "privacy-route-blocked",
      category: "guard-decision",
      domain: "privacy",
      severity: "warning",
      status: "blocked",
      title: "Cloud Route Blocked by Privacy Policy",
      message:
        "The cloud route was excluded for the PHI-Zero Emergency Stroke CT infrastructure simulation.",
      reason:
        "The workload policy permits the selected central route but does not permit this cloud alternative.",
      sourceEntityIds: [
        "workload-stroke-ct-001",
        "network-cloud-link-01",
      ],
      recommendationId: simulation.recommendationId,
      dedupeKey: `${simulation.id}:privacy-route-block`,
      source: "MedRouteX Operational Twin",
      metadata: groupedDetail,
    },
    {
      ...common,
      id: `event-${simulation.id}-central-gpu-7-selected`,
      eventType: "route-selected",
      category: "plan",
      domain: "compute",
      severity: "success",
      status: "completed",
      title: "Central GPU-7 Ranked as Safe Target",
      message:
        "Healthy Central GPU-7 was ranked as the decision-support recommendation.",
      reason:
        "It satisfies the prototype health, capacity, latency, and privacy guard conditions.",
      sourceEntityIds: [
        "workload-stroke-ct-001",
        "compute-central-gpu-07",
      ],
      recommendationId: simulation.recommendationId,
      dedupeKey: `${simulation.id}:central-gpu-7-selected`,
      source: "Synthetic GPU Telemetry",
      metadata: groupedDetail,
    },
    {
      ...common,
      id: `event-${simulation.id}-approval-required`,
      eventType: "human-approval-required",
      category: "approval",
      domain: "approval",
      severity: "action-required",
      status: "active",
      title: "Human Approval Required",
      message:
        "An authorized operator must approve or reject the Central GPU-7 recommendation.",
      reason:
        "MedRouteX never executes the simulated migration automatically; the guarded recommendation requires a recorded human decision.",
      sourceEntityIds: [
        "workload-stroke-ct-001",
        "compute-central-gpu-07",
      ],
      recommendationId: simulation.recommendationId,
      dedupeKey: `${simulation.id}:approval-required`,
      source: "MedRouteX Operational Twin",
      metadata: {
        notificationCooldownKey: `${simulation.id}:approval-required`,
        migrationExecuted: false,
        humanReviewRequired: true,
      },
    },
  ];
}

export function createSynchronizationEvent(
  state: OperationalTwinState
): OperationalEvent {
  const synchronization = state.latestSynchronization;
  const failed = synchronization.status === "failed";
  const partial = synchronization.status === "partial";
  return {
    id: `event-${synchronization.id}`,
    eventType: failed
      ? "synchronization-failed"
      : partial
        ? "manual-review-required"
        : "twin-synchronized",
    category: "synchronization",
    domain: "synchronization",
    severity: failed ? "critical" : partial ? "warning" : "info",
    status: failed ? "failed" : partial ? "active" : "completed",
    title: failed
      ? "Hospital Twin Synchronization Failed"
      : partial
        ? "Hospital Twin Synchronization Requires Review"
        : "Hospital Twin Synchronized",
    message: failed
      ? "The emulated Hospital Twin synchronization did not complete."
      : partial
        ? `Accepted ${synchronization.acceptedTelemetryPoints} typed telemetry points, rejected ${synchronization.rejectedTelemetryPoints}, and observed ${synchronization.failedProviders.length} provider failure(s); the canonical update requires operator review.`
        : `Accepted ${synchronization.acceptedTelemetryPoints} typed telemetry points into the canonical Hospital Twin.`,
    reason: failed
      ? "Provider or validation failures prevented a safe canonical update."
      : partial
        ? "One or more telemetry samples failed validation or were older than the canonical sample."
        : "An explicit server-side synchronization refreshed the emulated infrastructure state.",
    timestamp: synchronization.timestamp,
    sourceEntityIds: [],
    correlationId: `correlation-${synchronization.id}`,
    dedupeKey: synchronization.id,
    simulationOnly: true,
    source: "MedRouteX Hospital Twin",
    metadata: {
      providers: [...synchronization.providers],
      acceptedTelemetryPoints: synchronization.acceptedTelemetryPoints,
      rejectedTelemetryPoints: synchronization.rejectedTelemetryPoints,
      failedProviders: [...synchronization.failedProviders],
      staleSourceCount: synchronization.staleSourceCount,
      offlineSourceCount: synchronization.offlineSourceCount,
      notificationVisibility:
        failed || partial ? "visible" : "history-only",
    },
    stateVersion: state.version,
  };
}

export function createConnectorFailureEvents(
  state: OperationalTwinState
): OperationalEvent[] {
  const synchronization = state.latestSynchronization;
  return synchronization.failedProviders.map(
    (providerId): OperationalEvent => {
    const providerToken = providerId.replaceAll(/[^0-9A-Za-z_-]/g, "-");
    return {
      id: `event-${synchronization.id}-connector-${providerToken}`,
      eventType: "connector-failed",
      category: "connector",
      domain: "connector",
      severity: "critical",
      status: "failed",
      title: "Telemetry Connector Failed",
      message: `${providerId} did not return an emulated telemetry batch during synchronization.`,
      reason:
        "The canonical twin preserved available state and marked the provider-specific failure for human review.",
      timestamp: synchronization.timestamp,
      sourceEntityIds: [],
      correlationId: `correlation-${synchronization.id}`,
      dedupeKey: `${synchronization.id}:connector-failed:${providerId}`,
      simulationOnly: true,
      source: "MedRouteX Hospital Twin",
      metadata: {
        providerId,
        synchronizationId: synchronization.id,
        notificationCooldownKey: `connector-failed:${providerId}`,
        providerCredentialsExposed: false,
      },
      stateVersion: state.version,
      };
    }
  );
}

export function createSynchronizationFailureEvent(input: {
  state: OperationalTwinState;
  timestamp: string;
  reason: string;
}): OperationalEvent {
  const attemptId = input.timestamp.replaceAll(/[^0-9A-Za-z]/g, "");
  return {
    id: `event-sync-failed-${attemptId}`,
    eventType: "synchronization-failed",
    category: "synchronization",
    domain: "synchronization",
    severity: "critical",
    status: "failed",
    title: "Hospital Twin Synchronization Failed",
    message:
      "The emulated Hospital Twin synchronization did not complete; the last canonical state remains available.",
    reason: input.reason,
    timestamp: input.timestamp,
    sourceEntityIds: [],
    correlationId: `correlation-sync-failed-${attemptId}`,
    dedupeKey: `sync-failed:${attemptId}`,
    simulationOnly: true,
    source: "MedRouteX Hospital Twin",
    metadata: {
      notificationCooldownKey: "hospital-twin:synchronization-failure",
      canonicalStatePreserved: true,
      providerCredentialsExposed: false,
    },
    stateVersion: input.state.version,
  };
}

export function createDecisionEvent(
  state: OperationalTwinState,
  approval: TwinApprovalRecord
): OperationalEvent {
  const simulation = state.activeSimulation;
  const decision: TwinApprovalDecision = approval.decision;
  const approved = decision === "approve";
  return {
    id: `event-${simulation?.id ?? "simulation"}-${approval.recommendationId}-${decision}`,
    eventType: approved ? "decision-approved" : "decision-rejected",
    category: "approval",
    domain: "approval",
    severity: approved ? "success" : "warning",
    status: approved ? "completed" : "blocked",
    title: approved ? "Recommendation Approved" : "Recommendation Rejected",
    message: approved
      ? "The operator approved the simulated Central GPU-7 recommendation."
      : "The operator rejected the simulated Central GPU-7 recommendation.",
    reason: approved
      ? "Human approval was recorded; no migration or actuator action was executed."
      : "Human rejection was recorded; the simulated action remains unexecuted.",
    timestamp: approval.decidedAt,
    sourceEntityIds: [
      "workload-stroke-ct-001",
      "compute-central-gpu-07",
    ],
    scenarioId: simulation?.scenarioId,
    simulationId: simulation?.id,
    recommendationId: approval.recommendationId,
    operatorName: approval.operatorName,
    operatorRole: approval.operatorRole,
    correlationId: `correlation-${simulation?.id ?? "simulation"}`,
    dedupeKey: `${simulation?.id ?? "simulation"}:${approval.recommendationId}:${decision}`,
    simulationOnly: true,
    source: "MedRouteX Operational Twin",
    metadata: {
      decision,
      migrationExecuted: false,
      targetGpuId: approval.targetGpuId,
      notificationCooldownKey: `${simulation?.id ?? "simulation"}:final-decision`,
    },
    stateVersion: state.version,
  };
}

export function createDecisionConflictEvent(input: {
  state: OperationalTwinState;
  attemptedDecision: TwinApprovalDecision;
  currentDecision: TwinApprovalDecision;
  recommendationId: string;
  timestamp: string;
}): OperationalEvent {
  const simulationId = input.state.activeSimulation?.id ?? "simulation";
  return {
    id: `event-${simulationId}-${input.recommendationId}-conflict-${input.currentDecision}-${input.attemptedDecision}`,
    eventType: "decision-conflict",
    category: "audit",
    domain: "approval",
    severity: "warning",
    status: "blocked",
    title: "Opposite Decision Conflict Blocked",
    message:
      "An opposite decision was rejected because this recommendation already has a final decision.",
    reason:
      "The idempotent approval policy prevents a finalized decision from being overwritten.",
    timestamp: input.timestamp,
    sourceEntityIds: [
      "workload-stroke-ct-001",
      "compute-central-gpu-07",
    ],
    scenarioId: input.state.activeSimulation?.scenarioId,
    simulationId: input.state.activeSimulation?.id,
    recommendationId: input.recommendationId,
    correlationId: `correlation-${simulationId}`,
    dedupeKey: `${simulationId}:${input.recommendationId}:conflict:${input.currentDecision}:${input.attemptedDecision}`,
    simulationOnly: true,
    source: "MedRouteX Operational Twin",
    metadata: {
      currentDecision: input.currentDecision,
      attemptedDecision: input.attemptedDecision,
      notificationCooldownKey: `${simulationId}:decision-conflict`,
    },
    stateVersion: input.state.version,
  };
}

export function createEmailDeliveryFailureEvent(input: {
  state: OperationalTwinState;
  delivery: EmailDeliveryRecord;
  notification: OperationalNotification;
}): OperationalEvent {
  return {
    id: `event-email-failure-${input.notification.id}`,
    eventType: "email-delivery-failed",
    category: "email-delivery",
    domain: "connector",
    severity: "critical",
    status: "failed",
    title: "Email Alert Delivery Failed",
    message:
      "The operational alert remains available in-app, but the configured email provider did not confirm delivery.",
    reason:
      "Email failure never rolls back or changes the underlying Hospital Twin transition.",
    timestamp: input.delivery.completedAt,
    sourceEntityIds: [...input.notification.sourceEntityIds],
    correlationId: input.notification.correlationId,
    dedupeKey: `email-failure:${input.notification.dedupeKey}`,
    simulationOnly: true,
    source: "MedRouteX Notification Service",
    metadata: {
      deliveryId: input.delivery.id,
      provider: input.delivery.provider,
      failureReason: input.delivery.reason,
      notificationCooldownKey: `email-provider-failure:${input.notification.correlationId}`,
      recursionPrevented: true,
    },
    stateVersion: input.state.version,
  };
}
