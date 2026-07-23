import type {
  EmailChannelStatus,
  EmailDeliveryRecord,
  EmailDeliveryStatus,
  OperationalEventCategory,
  OperationalEventDomain,
  OperationalEventSeverity,
  OperationalNotification,
  OperationalTwinState,
} from "./types";

export const DEFAULT_NOTIFICATION_LIMIT = 50;
export const MAX_NOTIFICATION_LIMIT = 200;
export const DEFAULT_EMAIL_HISTORY_LIMIT = 50;
export const MAX_EMAIL_HISTORY_LIMIT = 200;

const SEVERITIES: readonly OperationalEventSeverity[] = [
  "info",
  "success",
  "warning",
  "critical",
  "action-required",
];

const DOMAINS: readonly OperationalEventDomain[] = [
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

const CATEGORIES: readonly OperationalEventCategory[] = [
  "telemetry",
  "risk",
  "prediction",
  "incident",
  "scenario",
  "guard-decision",
  "plan",
  "approval",
  "audit",
  "synchronization",
  "connector",
  "recovery",
  "email-delivery",
  "system",
];

const DELIVERY_STATUSES: readonly EmailDeliveryStatus[] = [
  "sent",
  "failed",
  "disabled",
  "not-configured",
  "suppressed",
];

export interface NotificationQuery {
  severity?: string | null;
  domain?: string | null;
  category?: string | null;
  unreadOnly?: string | boolean | null;
  limit?: string | number | null;
}

function isSeverity(value: string): value is OperationalEventSeverity {
  return SEVERITIES.some((candidate) => candidate === value);
}

function isDomain(value: string): value is OperationalEventDomain {
  return DOMAINS.some((candidate) => candidate === value);
}

function isCategory(value: string): value is OperationalEventCategory {
  return CATEGORIES.some((candidate) => candidate === value);
}

function isDeliveryStatus(value: string): value is EmailDeliveryStatus {
  return DELIVERY_STATUSES.some((candidate) => candidate === value);
}

function safeLimit(
  value: string | number | null | undefined,
  fallback: number,
  maximum: number
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(parsed)));
}

function newestNotificationFirst(
  left: OperationalNotification,
  right: OperationalNotification
): number {
  const difference =
    Date.parse(right.timestamp) - Date.parse(left.timestamp);
  if (Number.isFinite(difference) && difference !== 0) return difference;
  if (right.stateVersion !== left.stateVersion) {
    return right.stateVersion - left.stateVersion;
  }
  return left.id.localeCompare(right.id);
}

export function createNotificationApiResponse(
  state: OperationalTwinState,
  emailChannelStatus: EmailChannelStatus,
  query: NotificationQuery = {}
) {
  const severity =
    typeof query.severity === "string" && isSeverity(query.severity)
      ? query.severity
      : undefined;
  const domain =
    typeof query.domain === "string" && isDomain(query.domain)
      ? query.domain
      : undefined;
  const category =
    typeof query.category === "string" && isCategory(query.category)
      ? query.category
      : undefined;
  const unreadOnly =
    query.unreadOnly === true || query.unreadOnly === "true";
  const limit = safeLimit(
    query.limit,
    DEFAULT_NOTIFICATION_LIMIT,
    MAX_NOTIFICATION_LIMIT
  );
  const notifications = [...state.notifications]
    .sort(newestNotificationFirst)
    .filter((notification) => {
      if (severity && notification.severity !== severity) return false;
      if (domain && notification.domain !== domain) return false;
      if (category && notification.category !== category) return false;
      if (unreadOnly && notification.acknowledgedAt !== undefined) {
        return false;
      }
      return true;
    });
  const unreadCount = state.notifications.filter(
    (notification) => notification.acknowledgedAt === undefined
  ).length;
  const latestActivePriorityNotification =
    [...state.notifications]
      .sort(newestNotificationFirst)
      .find(
        (notification) =>
          notification.lifecycleStatus === "active" &&
          (notification.severity === "critical" ||
            notification.severity === "action-required")
      ) ?? null;

  return {
    success: true as const,
    notifications: notifications.slice(0, limit),
    unreadCount,
    returned: Math.min(notifications.length, limit),
    available: state.notifications.length,
    limit,
    newestFirst: true as const,
    emailChannelStatus,
    activeIncidents: [...state.activeIncidents],
    latestActivePriorityNotification,
  };
}

function newestDeliveryFirst(
  left: EmailDeliveryRecord,
  right: EmailDeliveryRecord
): number {
  const difference =
    Date.parse(right.completedAt) - Date.parse(left.completedAt);
  if (Number.isFinite(difference) && difference !== 0) return difference;
  return left.id.localeCompare(right.id);
}

export function createEmailHistoryApiResponse(
  state: OperationalTwinState,
  statusValue: string | null,
  limitValue: string | null
) {
  const status =
    statusValue && isDeliveryStatus(statusValue)
      ? statusValue
      : undefined;
  const limit = safeLimit(
    limitValue,
    DEFAULT_EMAIL_HISTORY_LIMIT,
    MAX_EMAIL_HISTORY_LIMIT
  );
  const deliveries = [...state.emailDeliveries]
    .sort(newestDeliveryFirst)
    .filter((delivery) => !status || delivery.status === status);

  return {
    success: true as const,
    deliveries: deliveries.slice(0, limit),
    returned: Math.min(deliveries.length, limit),
    available: state.emailDeliveries.length,
    limit,
    newestFirst: true as const,
    filters: { ...(status ? { status } : {}) },
  };
}
