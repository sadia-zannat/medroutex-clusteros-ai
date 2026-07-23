"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type {
  EmailChannelStatus,
  EmailDeliveryStatus,
  OperationalEventDomain,
  OperationalEventSeverity,
  OperationalIncident,
  OperationalNotification,
} from "@/lib/twin-core/types";

export interface NotificationApiResponse {
  success: true;
  notifications: OperationalNotification[];
  unreadCount: number;
  returned: number;
  available: number;
  limit: number;
  newestFirst: true;
  emailChannelStatus: EmailChannelStatus;
  activeIncidents: OperationalIncident[];
  latestActivePriorityNotification: OperationalNotification | null;
}

export interface NotificationCenterProps {
  operatorName: string;
  operatorRole: string;
  refreshNonce: number;
  onSnapshot?: (response: NotificationApiResponse) => void;
}

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

const EMAIL_DELIVERY_STATUSES: readonly EmailDeliveryStatus[] = [
  "sent",
  "failed",
  "disabled",
  "not-configured",
  "suppressed",
];

const EMAIL_CHANNEL_STATUSES: readonly EmailChannelStatus[] = [
  "configured",
  "disabled",
  "not-configured",
  "failed",
];

const NOTIFICATION_LIFECYCLE_STATUSES = [
  "active",
  "resolved",
] as const;

const LIFECYCLE_STYLES: Record<
  OperationalNotification["lifecycleStatus"],
  string
> = {
  active: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  resolved:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
};

const SEVERITY_STYLES: Record<OperationalEventSeverity, string> = {
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  critical: "border-red-500/40 bg-red-500/10 text-red-200",
  "action-required":
    "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
};

const SEVERITY_DOT_STYLES: Record<OperationalEventSeverity, string> = {
  info: "bg-cyan-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
  "action-required": "bg-fuchsia-400",
};

const EMAIL_STATUS_LABELS: Record<EmailDeliveryStatus, string> = {
  sent: "Sent",
  failed: "Failed",
  disabled: "Disabled",
  "not-configured": "Not configured",
  suppressed: "Suppressed",
};

const EMAIL_CHANNEL_LABELS: Record<EmailChannelStatus, string> = {
  configured: "Configured",
  disabled: "Disabled",
  "not-configured": "Not configured",
  failed: "Failed",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[]
): value is T {
  return (
    typeof value === "string" &&
    (options as readonly string[]).includes(value)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOperationalNotification(
  value: unknown
): value is OperationalNotification {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.eventId === "string" &&
    typeof value.eventType === "string" &&
    typeof value.category === "string" &&
    isOneOf(value.domain, DOMAINS) &&
    isOneOf(value.severity, SEVERITIES) &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    typeof value.reason === "string" &&
    typeof value.explanation === "string" &&
    typeof value.timestamp === "string" &&
    isStringArray(value.sourceEntityIds) &&
    isStringArray(value.targetRoles) &&
    typeof value.correlationId === "string" &&
    typeof value.dedupeKey === "string" &&
    typeof value.cooldownSeconds === "number" &&
    typeof value.emailEligible === "boolean" &&
    (value.emailDeliveryStatus === undefined ||
      isOneOf(value.emailDeliveryStatus, EMAIL_DELIVERY_STATUSES)) &&
    isOneOf(value.lifecycleStatus, NOTIFICATION_LIFECYCLE_STATUSES) &&
    typeof value.lifecycleUpdatedAt === "string" &&
    typeof value.lifecycleStateVersion === "number" &&
    (value.resolvedAt === undefined ||
      typeof value.resolvedAt === "string") &&
    (value.resolvedByEventId === undefined ||
      typeof value.resolvedByEventId === "string") &&
    (value.resolutionReason === undefined ||
      typeof value.resolutionReason === "string") &&
    (value.acknowledgedAt === undefined ||
      typeof value.acknowledgedAt === "string") &&
    value.simulationOnly === true &&
    typeof value.source === "string" &&
    isRecord(value.metadata) &&
    typeof value.stateVersion === "number"
  );
}

function isNotificationApiResponse(
  value: unknown
): value is NotificationApiResponse {
  if (!isRecord(value)) return false;

  return (
    value.success === true &&
    Array.isArray(value.notifications) &&
    value.notifications.every(isOperationalNotification) &&
    typeof value.unreadCount === "number" &&
    typeof value.returned === "number" &&
    typeof value.available === "number" &&
    typeof value.limit === "number" &&
    value.newestFirst === true &&
    isOneOf(value.emailChannelStatus, EMAIL_CHANNEL_STATUSES) &&
    Array.isArray(value.activeIncidents) &&
    (value.latestActivePriorityNotification === null ||
      isOperationalNotification(value.latestActivePriorityNotification))
  );
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function sentenceCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function responseErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return fallback;
    if (typeof payload.message === "string") return payload.message;
    if (
      isRecord(payload.error) &&
      typeof payload.error.message === "string"
    ) {
      return payload.error.message;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function NotificationCenter({
  operatorName,
  operatorRole,
  refreshNonce,
  onSnapshot,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<NotificationApiResponse | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAcknowledgement, setPendingAcknowledgement] = useState<
    string | "all" | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const onSnapshotRef = useRef(onSnapshot);
  const panelId = useId();

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  const fetchNotifications = useCallback(async () => {
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setIsLoading(true);
    setFeedError(null);

    try {
      const response = await fetch("/api/notifications?limit=8", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(
            response,
            "Unable to load operational notifications."
          )
        );
      }

      const payload: unknown = await response.json();
      if (!isNotificationApiResponse(payload)) {
        throw new Error("Notification service returned an invalid response.");
      }

      setSnapshot(payload);
      onSnapshotRef.current?.(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedError(
        error instanceof Error
          ? error.message
          : "Unable to load operational notifications."
      );
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchNotifications();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchNotifications, refreshNonce]);

  useEffect(() => {
    return () => fetchControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const canAcknowledge =
    operatorName.trim().length > 0 && operatorRole.trim().length > 0;
  const unreadCount = snapshot?.unreadCount ?? 0;

  const acknowledge = async (target: string | "all") => {
    if (!canAcknowledge || pendingAcknowledgement !== null) return;

    setPendingAcknowledgement(target);
    setActionError(null);
    try {
      const response = await fetch("/api/notifications/acknowledge", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(target === "all"
            ? { acknowledgeAll: true as const }
            : { notificationId: target }),
          operatorName: operatorName.trim(),
          operatorRole: operatorRole.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(
            response,
            "Unable to acknowledge the notification."
          )
        );
      }

      const payload: unknown = await response.json();
      if (!isNotificationApiResponse(payload)) {
        throw new Error(
          "Notification service returned an invalid acknowledgement response."
        );
      }
      setSnapshot(payload);
      onSnapshotRef.current?.(payload);
      void fetchNotifications();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to acknowledge the notification."
      );
    } finally {
      setPendingAcknowledgement(null);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          const willOpen = !isOpen;
          setIsOpen(willOpen);
          if (willOpen) void fetchNotifications();
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.86 18.24a3 3 0 0 1-5.72 0m8.17-6.37V9a5.31 5.31 0 0 0-10.62 0v2.87c0 1.17-.4 2.3-1.14 3.21l-.91 1.13h14.72l-.91-1.13a5.1 5.1 0 0 1-1.14-3.21Z"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full border border-slate-950 bg-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <section
          id={panelId}
          role="dialog"
          aria-label="Operational notifications"
          aria-busy={isLoading}
          className="absolute right-0 top-full z-[70] mt-3 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="font-semibold text-slate-100">
                Operational Notifications
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount} unread · {snapshot?.available ?? 0} available
              </p>
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => {
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6 6 12 12M18 6 6 18"
                />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2 text-xs">
            <span className="text-slate-400">
              Email channel:{" "}
              <span className="font-medium text-slate-200">
                {snapshot
                  ? EMAIL_CHANNEL_LABELS[snapshot.emailChannelStatus]
                  : "Checking"}
              </span>
            </span>
            <button
              type="button"
              disabled={
                unreadCount === 0 ||
                !canAcknowledge ||
                pendingAcknowledgement !== null
              }
              onClick={() => void acknowledge("all")}
              className="font-medium text-cyan-300 transition-colors hover:text-cyan-100 disabled:cursor-not-allowed disabled:text-slate-600"
            >
              {pendingAcknowledgement === "all"
                ? "Marking read..."
                : "Mark all read"}
            </button>
          </div>

          {!canAcknowledge ? (
            <p className="border-b border-white/10 bg-amber-500/5 px-4 py-2 text-xs text-amber-200">
              Connect an operator identity to acknowledge notifications.
            </p>
          ) : null}

          {feedError || actionError ? (
            <div
              role="alert"
              className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200"
            >
              <p>{actionError ?? feedError}</p>
              {feedError ? (
                <button
                  type="button"
                  onClick={() => void fetchNotifications()}
                  className="mt-1 font-semibold text-red-100 underline underline-offset-2"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="max-h-[32rem] overflow-y-auto">
            {isLoading && snapshot === null ? (
              <div
                role="status"
                className="px-4 py-8 text-center text-sm text-slate-400"
              >
                Loading notifications...
              </div>
            ) : snapshot && snapshot.notifications.length > 0 ? (
              <ol className="divide-y divide-white/10">
                {snapshot.notifications.map((notification) => {
                  const isUnread = notification.acknowledgedAt === undefined;
                  const isPending =
                    pendingAcknowledgement === notification.id;

                  return (
                    <li key={notification.id} className="px-4 py-3">
                      <article>
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              SEVERITY_DOT_STYLES[notification.severity]
                            } ${isUnread ? "ring-4 ring-white/5" : "opacity-40"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  SEVERITY_STYLES[notification.severity]
                                }`}
                              >
                                {sentenceCase(notification.severity)}
                              </span>
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
                                {sentenceCase(notification.domain)}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  LIFECYCLE_STYLES[
                                    notification.lifecycleStatus
                                  ]
                                }`}
                              >
                                {sentenceCase(
                                  notification.lifecycleStatus
                                )}
                              </span>
                            </div>
                            <h3 className="mt-2 text-sm font-semibold text-slate-100">
                              {notification.title}
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-slate-300">
                              {notification.reason}
                            </p>
                            <dl className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
                              <div>
                                <dt className="inline text-slate-400">Roles: </dt>
                                <dd className="inline">
                                  {notification.targetRoles.join(", ")}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline text-slate-400">
                                  Infrastructure:{" "}
                                </dt>
                                <dd className="inline break-words">
                                  {notification.sourceEntityIds.length > 0
                                    ? notification.sourceEntityIds.join(", ")
                                    : "Not specified"}
                                </dd>
                              </div>
                              {notification.emailEligible ? (
                                <div>
                                  <dt className="inline text-slate-400">
                                    Email:{" "}
                                  </dt>
                                  <dd className="inline">
                                    {notification.emailDeliveryStatus
                                      ? EMAIL_STATUS_LABELS[
                                          notification.emailDeliveryStatus
                                        ]
                                      : "Eligible · no delivery recorded"}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <time
                                dateTime={notification.timestamp}
                                title={notification.timestamp}
                                className="text-[11px] text-slate-500"
                              >
                                {formatTimestamp(notification.timestamp)}
                              </time>
                              {isUnread ? (
                                <button
                                  type="button"
                                  disabled={
                                    !canAcknowledge ||
                                    pendingAcknowledgement !== null
                                  }
                                  aria-label={`Acknowledge ${notification.title}`}
                                  onClick={() =>
                                    void acknowledge(notification.id)
                                  }
                                  className="text-[11px] font-medium text-cyan-300 transition-colors hover:text-cyan-100 disabled:cursor-not-allowed disabled:text-slate-600"
                                >
                                  {isPending
                                    ? "Acknowledging..."
                                    : "Acknowledge"}
                                </button>
                              ) : (
                                <span className="text-[11px] text-emerald-400">
                                  Acknowledged
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-300">
                  No operational notifications
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  New canonical state transitions will appear here.
                </p>
              </div>
            )}
          </div>

          {isLoading && snapshot !== null ? (
            <p
              role="status"
              className="border-t border-white/10 px-4 py-2 text-center text-[11px] text-slate-500"
            >
              Refreshing...
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
