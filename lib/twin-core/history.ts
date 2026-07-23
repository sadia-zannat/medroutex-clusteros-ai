import {
  type EmailDeliveryRecord,
  type OperationalEvent,
  type OperationalEventCategory,
  type OperationalEventDomain,
  type OperationalEventSeverity,
  type OperationalNotification,
  type OperationalTwinState,
  type TwinApprovalAuditEvent,
  type TwinSnapshot,
  type UnifiedHistoryKind,
  type UnifiedHistoryRecord,
} from "./types";

export const DEFAULT_UNIFIED_HISTORY_LIMIT = 100;
export const MAX_UNIFIED_HISTORY_LIMIT = 500;

export type UnifiedHistorySection =
  | "all"
  | "notifications"
  | "incidents-risks"
  | "twin-snapshots"
  | "decisions-audit"
  | "email-delivery"
  | "sync-connectors";

const HISTORY_KINDS: readonly UnifiedHistoryKind[] = [
  "operational-event",
  "notification",
  "email-delivery",
  "twin-snapshot",
  "audit-event",
];

const EVENT_SEVERITIES: readonly OperationalEventSeverity[] = [
  "info",
  "success",
  "warning",
  "critical",
  "action-required",
];

const EVENT_DOMAINS: readonly OperationalEventDomain[] = [
  "compute",
  "icu",
  "oxygen",
  "power",
  "network",
  "privacy",
  "approval",
  "simulation",
  "synchronization",
  "connector",
  "recovery",
  "system",
];

const HISTORY_SECTIONS: readonly UnifiedHistorySection[] = [
  "all",
  "notifications",
  "incidents-risks",
  "twin-snapshots",
  "decisions-audit",
  "email-delivery",
  "sync-connectors",
];

export interface UnifiedHistoryFilterInput {
  kind?: string | null;
  severity?: string | null;
  domain?: string | null;
  status?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: string | number | null;
  section?: string | null;
}

export interface AppliedUnifiedHistoryFilters {
  kind?: UnifiedHistoryKind;
  severity?: OperationalEventSeverity;
  domain?: OperationalEventDomain;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  section?: UnifiedHistorySection;
}

export interface UnifiedHistorySummary {
  total: number;
  activeOrUnreadCount: number;
  byKind: Partial<Record<UnifiedHistoryKind, number>>;
  bySeverity: Partial<Record<OperationalEventSeverity, number>>;
  byDomain: Partial<Record<OperationalEventDomain, number>>;
  byStatus: Record<string, number>;
}

export interface UnifiedHistoryQueryResult {
  records: UnifiedHistoryRecord[];
  returned: number;
  matched: number;
  available: number;
  limit: number;
  filters: AppliedUnifiedHistoryFilters;
  invalidFilters: string[];
  summary: UnifiedHistorySummary;
  sectionCounts: Record<UnifiedHistorySection, number>;
}

function isHistoryKind(value: string): value is UnifiedHistoryKind {
  return HISTORY_KINDS.some((kind) => kind === value);
}

function isEventSeverity(value: string): value is OperationalEventSeverity {
  return EVENT_SEVERITIES.some((severity) => severity === value);
}

function isEventDomain(value: string): value is OperationalEventDomain {
  return EVENT_DOMAINS.some((domain) => domain === value);
}

function isHistorySection(value: string): value is UnifiedHistorySection {
  return HISTORY_SECTIONS.some((section) => section === value);
}

function normalizedQueryValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function parsedTimestamp(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordTimestamp(record: UnifiedHistoryRecord): number {
  const parsed = Date.parse(record.timestamp);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function sortNewestFirst(
  left: UnifiedHistoryRecord,
  right: UnifiedHistoryRecord
): number {
  const leftTimestamp = recordTimestamp(left);
  const rightTimestamp = recordTimestamp(right);
  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp > leftTimestamp ? 1 : -1;
  }

  const versionDifference = right.stateVersion - left.stateVersion;
  if (versionDifference !== 0) return versionDifference;

  if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;

  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function operationalEventRecord(
  event: OperationalEvent
): UnifiedHistoryRecord {
  return {
    id: `history:operational-event:${event.id}`,
    sourceId: event.id,
    kind: "operational-event",
    timestamp: event.timestamp,
    title: event.title,
    message: event.message,
    severity: event.severity,
    domain: event.domain,
    category: event.category,
    status: event.status,
    source: event.source,
    simulationOnly: event.simulationOnly,
    correlationId: event.correlationId,
    sourceEntityIds: [...event.sourceEntityIds],
    stateVersion: event.stateVersion,
    metadata: {
      ...event.metadata,
      eventType: event.eventType,
      reason: event.reason,
      dedupeKey: event.dedupeKey,
      ...(event.scenarioId ? { scenarioId: event.scenarioId } : {}),
      ...(event.simulationId ? { simulationId: event.simulationId } : {}),
      ...(event.recommendationId
        ? { recommendationId: event.recommendationId }
        : {}),
      ...(event.operatorName ? { operatorName: event.operatorName } : {}),
      ...(event.operatorRole ? { operatorRole: event.operatorRole } : {}),
    },
  };
}

function notificationRecord(
  notification: OperationalNotification
): UnifiedHistoryRecord {
  const acknowledged = notification.acknowledgedAt !== undefined;
  const readStatus = acknowledged ? "acknowledged" : "unread";

  return {
    id: `history:notification:${notification.id}`,
    sourceId: notification.id,
    kind: "notification",
    timestamp: notification.timestamp,
    title: notification.title,
    message: notification.message,
    severity: notification.severity,
    domain: notification.domain,
    category: notification.category,
    status: notification.lifecycleStatus,
    source: notification.source,
    simulationOnly: notification.simulationOnly,
    correlationId: notification.correlationId,
    sourceEntityIds: [...notification.sourceEntityIds],
    stateVersion: notification.stateVersion,
    metadata: {
      ...notification.metadata,
      eventId: notification.eventId,
      eventType: notification.eventType,
      reason: notification.reason,
      explanation: notification.explanation,
      targetRoles: [...notification.targetRoles],
      dedupeKey: notification.dedupeKey,
      cooldownSeconds: notification.cooldownSeconds,
      emailEligible: notification.emailEligible,
      lifecycleStatus: notification.lifecycleStatus,
      lifecycleUpdatedAt: notification.lifecycleUpdatedAt,
      lifecycleStateVersion: notification.lifecycleStateVersion,
      readStatus,
      ...(notification.emailDeliveryStatus
        ? { emailDeliveryStatus: notification.emailDeliveryStatus }
        : {}),
      ...(notification.resolvedAt
        ? { resolvedAt: notification.resolvedAt }
        : {}),
      ...(notification.resolvedByEventId
        ? { resolvedByEventId: notification.resolvedByEventId }
        : {}),
      ...(notification.resolutionReason
        ? { resolutionReason: notification.resolutionReason }
        : {}),
      ...(notification.acknowledgedAt
        ? { acknowledgedAt: notification.acknowledgedAt }
        : {}),
      ...(notification.acknowledgedBy
        ? { acknowledgedBy: notification.acknowledgedBy }
        : {}),
      ...(notification.acknowledgedRole
        ? { acknowledgedRole: notification.acknowledgedRole }
        : {}),
    },
  };
}

function standaloneEmailSeverity(
  delivery: EmailDeliveryRecord
): OperationalEventSeverity {
  if (delivery.status === "sent") return "success";
  if (delivery.status === "failed") return "warning";
  return "info";
}

function emailDeliveryRecord(
  delivery: EmailDeliveryRecord,
  notificationById: ReadonlyMap<string, OperationalNotification>,
  eventById: ReadonlyMap<string, OperationalEvent>
): UnifiedHistoryRecord {
  const notification = delivery.notificationId
    ? notificationById.get(delivery.notificationId)
    : undefined;
  const event = delivery.eventId
    ? eventById.get(delivery.eventId)
    : notification
      ? eventById.get(notification.eventId)
      : undefined;

  return {
    id: `history:email-delivery:${delivery.id}`,
    sourceId: delivery.id,
    kind: "email-delivery",
    timestamp: delivery.completedAt || delivery.attemptedAt,
    title: delivery.subject,
    message: delivery.reason,
    severity:
      notification?.severity ??
      event?.severity ??
      standaloneEmailSeverity(delivery),
    domain: notification?.domain ?? event?.domain ?? "system",
    category: "email-delivery",
    status: delivery.status,
    source: delivery.source,
    simulationOnly: delivery.simulationOnly,
    correlationId: delivery.correlationId,
    sourceEntityIds: [
      ...(notification?.sourceEntityIds ?? event?.sourceEntityIds ?? []),
    ],
    stateVersion: delivery.stateVersion,
    metadata: {
      deliveryKind: delivery.kind,
      provider: delivery.provider,
      attemptedAt: delivery.attemptedAt,
      completedAt: delivery.completedAt,
      recipientRoles: [...delivery.recipientRoles],
      recipientCount: delivery.recipientCount,
      dedupeKey: delivery.dedupeKey,
      ...(delivery.eventId ? { eventId: delivery.eventId } : {}),
      ...(delivery.notificationId
        ? { notificationId: delivery.notificationId }
        : {}),
      ...(delivery.providerMessageId
        ? { providerMessageId: delivery.providerMessageId }
        : {}),
    },
  };
}

function snapshotDomain(
  snapshot: TwinSnapshot
): OperationalEventDomain {
  if (snapshot.trigger === "synchronization") return "synchronization";
  if (snapshot.trigger === "scenario") return "simulation";
  if (snapshot.trigger === "decision") return "approval";
  return "system";
}

function snapshotCategory(
  snapshot: TwinSnapshot
): OperationalEventCategory {
  if (snapshot.trigger === "synchronization") return "synchronization";
  if (snapshot.trigger === "scenario") return "scenario";
  if (snapshot.trigger === "decision") return "approval";
  return "system";
}

function snapshotSeverity(
  snapshot: TwinSnapshot
): OperationalEventSeverity {
  if (snapshot.overallStatus === "critical") return "critical";
  if (snapshot.overallStatus === "offline") return "critical";
  if (snapshot.overallStatus === "degraded") return "warning";
  return "info";
}

function snapshotTitle(snapshot: TwinSnapshot): string {
  if (snapshot.trigger === "baseline") return "Baseline Twin Snapshot";
  if (snapshot.trigger === "synchronization") {
    return "Synchronization Twin Snapshot";
  }
  if (snapshot.trigger === "scenario") return "Scenario Twin Snapshot";
  return "Decision Twin Snapshot";
}

function snapshotRecord(
  snapshot: TwinSnapshot,
  activeSimulationId: string | undefined
): UnifiedHistoryRecord {
  const correlationId =
    snapshot.trigger === "scenario" || snapshot.trigger === "decision"
      ? activeSimulationId
      : undefined;

  return {
    id: `history:twin-snapshot:${snapshot.id}`,
    sourceId: snapshot.id,
    kind: "twin-snapshot",
    timestamp: snapshot.timestamp,
    title: snapshotTitle(snapshot),
    message: `Hospital Twin snapshot recorded at version ${snapshot.stateVersion} with resilience ${snapshot.resilienceScore}% and infrastructure health ${snapshot.healthScore}%.`,
    severity: snapshotSeverity(snapshot),
    domain: snapshotDomain(snapshot),
    category: snapshotCategory(snapshot),
    status: snapshot.overallStatus,
    source: "MedRouteX Hospital Twin",
    simulationOnly: snapshot.simulationOnly,
    ...(correlationId ? { correlationId } : {}),
    sourceEntityIds: [],
    stateVersion: snapshot.stateVersion,
    metadata: {
      trigger: snapshot.trigger,
      resilienceScore: snapshot.resilienceScore,
      healthScore: snapshot.healthScore,
      domainSummaries: { ...snapshot.domainSummaries },
      activeSimulationStatus: snapshot.activeSimulationStatus,
    },
  };
}

function approvalEventForAudit(
  audit: TwinApprovalAuditEvent,
  events: readonly OperationalEvent[]
): OperationalEvent | undefined {
  const expectedEventType =
    audit.decision === "approve" ? "decision-approved" : "decision-rejected";

  return events.find(
    (event) =>
      event.eventType === expectedEventType &&
      event.simulationId === audit.simulationId &&
      event.recommendationId === audit.recommendationId
  );
}

function stateVersionForAudit(
  audit: TwinApprovalAuditEvent,
  linkedEvent: OperationalEvent | undefined,
  snapshots: readonly TwinSnapshot[],
  fallbackVersion: number
): number {
  if (linkedEvent) return linkedEvent.stateVersion;

  const decisionSnapshot = snapshots
    .filter(
      (snapshot) =>
        snapshot.trigger === "decision" &&
        snapshot.timestamp === audit.timestamp
    )
    .sort((left, right) => right.stateVersion - left.stateVersion)[0];

  return decisionSnapshot?.stateVersion ?? fallbackVersion;
}

function auditRecord(
  audit: TwinApprovalAuditEvent,
  events: readonly OperationalEvent[],
  snapshots: readonly TwinSnapshot[],
  fallbackVersion: number
): UnifiedHistoryRecord {
  const linkedEvent = approvalEventForAudit(audit, events);
  const approved = audit.decision === "approve";
  const canonicalTargetEntityId =
    audit.targetGpuId === "gpu-central-7"
      ? "compute-central-gpu-07"
      : audit.targetGpuId;

  return {
    id: `history:audit-event:${audit.id}`,
    sourceId: audit.id,
    kind: "audit-event",
    timestamp: audit.timestamp,
    title: approved ? "Decision Approved" : "Decision Rejected",
    message: `${audit.operatorName} (${audit.operatorRole}) recorded a final simulated ${approved ? "approval" : "rejection"} for ${audit.targetGpuId}.`,
    severity: approved ? "success" : "warning",
    domain: "approval",
    category: "audit",
    status: approved ? "approved" : "rejected",
    source: "MedRouteX Operational Twin",
    simulationOnly: audit.simulationOnly,
    correlationId:
      linkedEvent?.correlationId ??
      `approval:${audit.simulationId}:${audit.recommendationId}`,
    sourceEntityIds: [canonicalTargetEntityId],
    stateVersion: stateVersionForAudit(
      audit,
      linkedEvent,
      snapshots,
      fallbackVersion
    ),
    metadata: {
      eventType: audit.eventType,
      decision: audit.decision,
      simulationId: audit.simulationId,
      recommendationId: audit.recommendationId,
      targetGpuId: audit.targetGpuId,
      canonicalTargetEntityId,
      operatorName: audit.operatorName,
      operatorRole: audit.operatorRole,
    },
  };
}

export function normalizeUnifiedHistory(
  state: OperationalTwinState
): UnifiedHistoryRecord[] {
  // The fallbacks also make development HMR safe when an older globalThis state
  // instance predates the event collections added to the canonical contract.
  const events = state.operationalEvents ?? [];
  const notifications = state.notifications ?? [];
  const emailDeliveries = state.emailDeliveries ?? [];
  const snapshots = state.snapshots ?? [];
  const approvalAudits = state.approvalAuditEvents ?? [];
  const eventById = new Map(events.map((event) => [event.id, event]));
  const notificationById = new Map(
    notifications.map((notification) => [notification.id, notification])
  );

  const records = [
    ...events.map(operationalEventRecord),
    ...notifications.map(notificationRecord),
    ...emailDeliveries.map((delivery) =>
      emailDeliveryRecord(delivery, notificationById, eventById)
    ),
    ...snapshots.map((snapshot) =>
      snapshotRecord(snapshot, state.activeSimulation?.id)
    ),
    ...approvalAudits.map((audit) =>
      auditRecord(audit, events, snapshots, state.version)
    ),
  ];

  const uniqueRecords = new Map<string, UnifiedHistoryRecord>();
  for (const record of records) {
    uniqueRecords.set(record.id, record);
  }

  return [...uniqueRecords.values()].sort(sortNewestFirst);
}

function searchableRecordText(record: UnifiedHistoryRecord): string {
  let metadata = "";
  try {
    metadata = JSON.stringify(record.metadata);
  } catch {
    metadata = "";
  }

  return [
    record.id,
    record.sourceId,
    record.kind,
    record.timestamp,
    record.title,
    record.message,
    record.severity,
    record.domain,
    record.category,
    record.status,
    record.source,
    record.correlationId ?? "",
    ...record.sourceEntityIds,
    metadata,
  ]
    .join(" ")
    .toLowerCase();
}

function recordMatchesStatus(
  record: UnifiedHistoryRecord,
  requestedStatus: string
): boolean {
  const normalizedStatus = requestedStatus.toLowerCase();
  if (record.status.toLowerCase() === normalizedStatus) return true;
  if (record.kind !== "notification") return false;

  return (
    typeof record.metadata.readStatus === "string" &&
    record.metadata.readStatus.toLowerCase() === normalizedStatus
  );
}

export function recordMatchesHistorySection(
  record: UnifiedHistoryRecord,
  section: UnifiedHistorySection
): boolean {
  switch (section) {
    case "all":
      return true;
    case "notifications":
      return record.kind === "notification";
    case "incidents-risks":
      return (
        record.category === "incident" ||
        record.category === "risk" ||
        (record.kind === "operational-event" && record.status === "active")
      );
    case "twin-snapshots":
      return record.kind === "twin-snapshot";
    case "decisions-audit":
      return (
        record.kind === "audit-event" ||
        record.domain === "approval" ||
        record.category === "approval" ||
        record.category === "audit" ||
        record.category === "guard-decision" ||
        (record.kind === "operational-event" &&
          record.category === "plan")
      );
    case "email-delivery":
      return record.kind === "email-delivery";
    case "sync-connectors":
      return (
        record.domain === "synchronization" ||
        record.domain === "connector" ||
        record.category === "synchronization" ||
        record.category === "connector" ||
        (record.kind === "operational-event" &&
          (record.metadata.eventType === "telemetry-stale" ||
            record.metadata.eventType === "telemetry-offline"))
      );
  }
}

function summarizeHistory(
  records: readonly UnifiedHistoryRecord[]
): UnifiedHistorySummary {
  const byKind: Partial<Record<UnifiedHistoryKind, number>> = {};
  const bySeverity: Partial<Record<OperationalEventSeverity, number>> = {};
  const byDomain: Partial<Record<OperationalEventDomain, number>> = {};
  const byStatus: Record<string, number> = {};

  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    bySeverity[record.severity] =
      (bySeverity[record.severity] ?? 0) + 1;
    byDomain[record.domain] = (byDomain[record.domain] ?? 0) + 1;
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
  }

  return {
    total: records.length,
    activeOrUnreadCount: records.filter(
      (record) =>
        record.status === "active" ||
        (record.kind === "notification" &&
          record.metadata.readStatus === "unread")
    ).length,
    byKind,
    bySeverity,
    byDomain,
    byStatus,
  };
}

function countHistorySections(
  records: readonly UnifiedHistoryRecord[]
): Record<UnifiedHistorySection, number> {
  const counts: Record<UnifiedHistorySection, number> = {
    all: records.length,
    notifications: 0,
    "incidents-risks": 0,
    "twin-snapshots": 0,
    "decisions-audit": 0,
    "email-delivery": 0,
    "sync-connectors": 0,
  };

  for (const record of records) {
    for (const section of HISTORY_SECTIONS) {
      if (
        section !== "all" &&
        recordMatchesHistorySection(record, section)
      ) {
        counts[section] += 1;
      }
    }
  }
  return counts;
}

function historyLimit(
  value: UnifiedHistoryFilterInput["limit"],
  invalidFilters: string[]
): number {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_UNIFIED_HISTORY_LIMIT;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    invalidFilters.push("limit");
    return DEFAULT_UNIFIED_HISTORY_LIMIT;
  }

  return Math.max(
    1,
    Math.min(MAX_UNIFIED_HISTORY_LIMIT, Math.trunc(parsed))
  );
}

export function queryUnifiedHistory(
  state: OperationalTwinState,
  input: UnifiedHistoryFilterInput = {}
): UnifiedHistoryQueryResult {
  const allRecords = normalizeUnifiedHistory(state);
  const invalidFilters: string[] = [];
  const filters: AppliedUnifiedHistoryFilters = {};

  const kind = normalizedQueryValue(input.kind);
  if (kind) {
    if (isHistoryKind(kind)) filters.kind = kind;
    else invalidFilters.push("kind");
  }

  const severity = normalizedQueryValue(input.severity);
  if (severity) {
    if (isEventSeverity(severity)) filters.severity = severity;
    else invalidFilters.push("severity");
  }

  const domain = normalizedQueryValue(input.domain);
  if (domain) {
    if (isEventDomain(domain)) filters.domain = domain;
    else invalidFilters.push("domain");
  }

  const status = normalizedQueryValue(input.status);
  if (status) filters.status = status.slice(0, 100);

  const requestedSection = normalizedQueryValue(input.section);
  if (requestedSection) {
    if (isHistorySection(requestedSection)) {
      filters.section = requestedSection;
    } else {
      invalidFilters.push("section");
    }
  }

  const search = input.search?.trim();
  if (search) filters.search = search.slice(0, 200);

  const requestedFrom = input.from?.trim();
  const requestedTo = input.to?.trim();
  let fromTimestamp = parsedTimestamp(requestedFrom);
  let toTimestamp = parsedTimestamp(requestedTo);

  if (requestedFrom && fromTimestamp === null) invalidFilters.push("from");
  if (requestedTo && toTimestamp === null) invalidFilters.push("to");

  if (
    fromTimestamp !== null &&
    toTimestamp !== null &&
    fromTimestamp > toTimestamp
  ) {
    invalidFilters.push("date-range");
    fromTimestamp = null;
    toTimestamp = null;
  }

  if (fromTimestamp !== null) {
    filters.from = new Date(fromTimestamp).toISOString();
  }
  if (toTimestamp !== null) {
    filters.to = new Date(toTimestamp).toISOString();
  }

  const limit = historyLimit(input.limit, invalidFilters);
  const normalizedSearch = filters.search?.toLowerCase();
  const baseMatchedRecords = allRecords.filter((record) => {
    if (filters.kind && record.kind !== filters.kind) return false;
    if (filters.severity && record.severity !== filters.severity) return false;
    if (filters.domain && record.domain !== filters.domain) return false;
    if (filters.status && !recordMatchesStatus(record, filters.status)) {
      return false;
    }
    if (
      normalizedSearch &&
      !searchableRecordText(record).includes(normalizedSearch)
    ) {
      return false;
    }

    const timestamp = recordTimestamp(record);
    if (fromTimestamp !== null && timestamp < fromTimestamp) return false;
    if (toTimestamp !== null && timestamp > toTimestamp) return false;
    return true;
  });
  const matchedRecords = filters.section
    ? baseMatchedRecords.filter((record) =>
        recordMatchesHistorySection(record, filters.section ?? "all")
      )
    : baseMatchedRecords;
  const records = matchedRecords.slice(0, limit);

  return {
    records,
    returned: records.length,
    matched: matchedRecords.length,
    available: allRecords.length,
    limit,
    filters,
    invalidFilters: [...new Set(invalidFilters)],
    summary: summarizeHistory(baseMatchedRecords),
    sectionCounts: countHistorySections(baseMatchedRecords),
  };
}
