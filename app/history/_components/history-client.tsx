"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AppliedUnifiedHistoryFilters } from "@/lib/twin-core/history";
import type {
  OperationalEventDomain,
  OperationalEventSeverity,
  UnifiedHistoryKind,
  UnifiedHistoryRecord,
} from "@/lib/twin-core/types";

export interface UnifiedHistorySummary {
  total: number;
  activeOrUnreadCount: number;
  byKind: Partial<Record<UnifiedHistoryKind, number>>;
  bySeverity: Partial<Record<OperationalEventSeverity, number>>;
  byDomain: Partial<Record<OperationalEventDomain, number>>;
  byStatus: Record<string, number>;
}

export interface UnifiedHistoryApiResponse {
  success: true;
  records: UnifiedHistoryRecord[];
  summary: UnifiedHistorySummary;
  sectionCounts: Record<HistoryTab, number>;
  returned: number;
  matched: number;
  available: number;
  limit: number;
  newestFirst: true;
  filters: AppliedUnifiedHistoryFilters;
  invalidFilters: string[];
  metadata: {
    stateVersion: number;
    simulationOnly: boolean;
    canonicalSource: string;
    maxLimit: number;
  };
}

type HistoryTab =
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
  "incident",
  "scenario-root-cause",
  "cascade-path",
  "response-plan",
];

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

const STATUS_OPTIONS = [
  "active",
  "resolved",
  "completed",
  "blocked",
  "failed",
  "informational",
  "unread",
  "acknowledged",
  "approved",
  "rejected",
  "sent",
  "disabled",
  "not-configured",
  "suppressed",
  "operational",
  "degraded",
  "critical",
  "offline",
] as const;

const TABS: readonly { id: HistoryTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "notifications", label: "Notifications" },
  { id: "incidents-risks", label: "Incidents & Risks" },
  { id: "twin-snapshots", label: "Twin Snapshots" },
  { id: "decisions-audit", label: "Decisions & Audit" },
  { id: "email-delivery", label: "Email Delivery" },
  { id: "sync-connectors", label: "Sync & Connectors" },
];

const SEVERITY_STYLES: Record<OperationalEventSeverity, string> = {
  info: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  critical: "border-red-500/40 bg-red-500/10 text-red-200",
  "action-required":
    "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
};

const KIND_LABELS: Record<UnifiedHistoryKind, string> = {
  "operational-event": "Operational Event",
  notification: "Notification",
  "email-delivery": "Email Delivery",
  "twin-snapshot": "Twin Snapshot",
  "audit-event": "Audit Event",
  incident: "Active Incident",
  "scenario-root-cause": "Scenario Root Cause",
  "cascade-path": "Cascade Path",
  "response-plan": "Response Plan",
};

const EMPTY_HISTORY_RECORDS: UnifiedHistoryRecord[] = [];

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

function isUnifiedHistoryRecord(
  value: unknown
): value is UnifiedHistoryRecord {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.sourceId === "string" &&
    isOneOf(value.kind, HISTORY_KINDS) &&
    typeof value.timestamp === "string" &&
    typeof value.title === "string" &&
    typeof value.message === "string" &&
    isOneOf(value.severity, SEVERITIES) &&
    isOneOf(value.domain, DOMAINS) &&
    typeof value.category === "string" &&
    typeof value.status === "string" &&
    typeof value.source === "string" &&
    typeof value.simulationOnly === "boolean" &&
    (value.correlationId === undefined ||
      typeof value.correlationId === "string") &&
    isStringArray(value.sourceEntityIds) &&
    typeof value.stateVersion === "number" &&
    isRecord(value.metadata)
  );
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((count) => typeof count === "number")
  );
}

function isUnifiedHistorySummary(
  value: unknown
): value is UnifiedHistorySummary {
  if (!isRecord(value)) return false;

  return (
    typeof value.total === "number" &&
    typeof value.activeOrUnreadCount === "number" &&
    isCountRecord(value.byKind) &&
    isCountRecord(value.bySeverity) &&
    isCountRecord(value.byDomain) &&
    isCountRecord(value.byStatus)
  );
}

function isUnifiedHistoryApiResponse(
  value: unknown
): value is UnifiedHistoryApiResponse {
  if (!isRecord(value)) return false;

  return (
    value.success === true &&
    Array.isArray(value.records) &&
    value.records.every(isUnifiedHistoryRecord) &&
    isUnifiedHistorySummary(value.summary) &&
    isCountRecord(value.sectionCounts) &&
    typeof value.returned === "number" &&
    typeof value.matched === "number" &&
    typeof value.available === "number" &&
    typeof value.limit === "number" &&
    value.newestFirst === true &&
    isRecord(value.filters) &&
    isStringArray(value.invalidFilters) &&
    isRecord(value.metadata) &&
    typeof value.metadata.stateVersion === "number" &&
    typeof value.metadata.simulationOnly === "boolean" &&
    typeof value.metadata.canonicalSource === "string" &&
    typeof value.metadata.maxLimit === "number"
  );
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(timestamp);
}

function sentenceCase(value: string): string {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateInputToIso(value: string): string | null {
  if (value.length === 0) return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function formatMetadata(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return "Metadata could not be serialized.";
  }
}

function derivedSummary(
  records: readonly UnifiedHistoryRecord[]
): UnifiedHistorySummary {
  const byKind: Partial<Record<UnifiedHistoryKind, number>> = {};
  const bySeverity: Partial<Record<OperationalEventSeverity, number>> = {};
  const byDomain: Partial<Record<OperationalEventDomain, number>> = {};
  const byStatus: Record<string, number> = {};

  for (const record of records) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    bySeverity[record.severity] = (bySeverity[record.severity] ?? 0) + 1;
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

function recordMatchesTab(
  record: UnifiedHistoryRecord,
  tab: HistoryTab
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "notifications":
      return record.kind === "notification";
    case "incidents-risks":
      return (
        record.kind === "incident" ||
        record.kind === "scenario-root-cause" ||
        record.kind === "cascade-path" ||
        record.category === "incident" ||
        record.category === "risk" ||
        (record.kind === "operational-event" && record.status === "active")
      );
    case "twin-snapshots":
      return record.kind === "twin-snapshot";
    case "decisions-audit":
      return (
        record.kind === "audit-event" ||
        record.kind === "response-plan" ||
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

function HistoryRecordCard({ record }: { record: UnifiedHistoryRecord }) {
  const sourceLower = record.source.toLowerCase();
  const isEmulated = sourceLower.includes("emulated");
  const isSynthetic = sourceLower.includes("synthetic");
  const notificationReadStatus =
    record.kind === "notification" &&
    typeof record.metadata.readStatus === "string"
      ? record.metadata.readStatus
      : null;
  const notificationLifecycleStyle =
    record.kind === "notification" && record.status === "active"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : record.kind === "notification" && record.status === "resolved"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-white/10 text-slate-400";

  return (
    <li>
      <article className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition-colors hover:border-white/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  SEVERITY_STYLES[record.severity]
                }`}
              >
                {sentenceCase(record.severity)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
                {KIND_LABELS[record.kind]}
              </span>
              <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-200">
                {sentenceCase(record.domain)}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${notificationLifecycleStyle}`}
              >
                {sentenceCase(record.status)}
              </span>
              {notificationReadStatus ? (
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
                  {sentenceCase(notificationReadStatus)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-base font-semibold text-slate-100">
              {record.title}
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-300">
              {record.message}
            </p>
          </div>
          <time
            dateTime={record.timestamp}
            title={record.timestamp}
            className="shrink-0 text-xs text-slate-500"
          >
            {formatTimestamp(record.timestamp)}
          </time>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-md border border-white/10 bg-slate-950/40 px-2 py-1 text-slate-400">
            Source: <span className="text-slate-200">{record.source}</span>
          </span>
          <span className="rounded-md border border-white/10 bg-slate-950/40 px-2 py-1 text-slate-400">
            State v{record.stateVersion}
          </span>
          {record.simulationOnly ? (
            <span className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-200">
              Simulation Only
            </span>
          ) : null}
          {isEmulated ? (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
              Emulated Hospital Telemetry
            </span>
          ) : null}
          {isSynthetic ? (
            <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-200">
              Synthetic Data
            </span>
          ) : null}
        </div>

        <details className="group mt-3 border-t border-white/10 pt-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-cyan-300 outline-none transition-colors hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/70">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-90"
              >
                ▶
              </span>
              Record details
            </span>
          </summary>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">History ID</dt>
              <dd className="mt-1 break-all text-slate-300">{record.id}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source ID</dt>
              <dd className="mt-1 break-all text-slate-300">
                {record.sourceId}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Category</dt>
              <dd className="mt-1 text-slate-300">
                {sentenceCase(record.category)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Correlation ID</dt>
              <dd className="mt-1 break-all text-slate-300">
                {record.correlationId ?? "Not applicable"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Affected infrastructure</dt>
              <dd className="mt-1 break-words text-slate-300">
                {record.sourceEntityIds.length > 0
                  ? record.sourceEntityIds.join(", ")
                  : "No entity IDs recorded"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Normalized metadata</dt>
              <dd className="mt-1">
                <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-slate-950/70 p-3 font-mono text-[11px] leading-5 text-slate-300">
                  {formatMetadata(record.metadata)}
                </pre>
              </dd>
            </div>
          </dl>
        </details>
      </article>
    </li>
  );
}

export default function HistoryClient() {
  const [snapshot, setSnapshot] =
    useState<UnifiedHistoryApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kind, setKind] = useState<UnifiedHistoryKind | "">("");
  const [severity, setSeverity] = useState<OperationalEventSeverity | "">("");
  const [domain, setDomain] = useState<OperationalEventDomain | "">("");
  const [status, setStatus] = useState("");
  const [fromTimestamp, setFromTimestamp] = useState("");
  const [toTimestamp, setToTimestamp] = useState("");
  const fetchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchHistory = useCallback(async () => {
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    const searchParams = new URLSearchParams({ limit: "500" });
    if (activeTab !== "all") searchParams.set("section", activeTab);
    if (kind) searchParams.set("kind", kind);
    if (severity) searchParams.set("severity", severity);
    if (domain) searchParams.set("domain", domain);
    if (status) searchParams.set("status", status);
    if (debouncedSearch) searchParams.set("search", debouncedSearch);

    const normalizedFrom = dateInputToIso(fromTimestamp);
    const normalizedTo = dateInputToIso(toTimestamp);
    if (normalizedFrom) searchParams.set("from", normalizedFrom);
    if (normalizedTo) searchParams.set("to", normalizedTo);

    try {
      const response = await fetch(`/api/history?${searchParams.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          await responseErrorMessage(
            response,
            "Unable to load unified operational history."
          )
        );
      }

      const payload: unknown = await response.json();
      if (!isUnifiedHistoryApiResponse(payload)) {
        throw new Error("History service returned an invalid response.");
      }

      setSnapshot(payload);
    } catch (fetchError) {
      if (
        fetchError instanceof DOMException &&
        fetchError.name === "AbortError"
      ) {
        return;
      }
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Unable to load unified operational history."
      );
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, [
    activeTab,
    debouncedSearch,
    domain,
    fromTimestamp,
    kind,
    severity,
    status,
    toTimestamp,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchHistory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchHistory]);

  useEffect(() => {
    return () => fetchControllerRef.current?.abort();
  }, []);

  const records = snapshot?.records ?? EMPTY_HISTORY_RECORDS;
  const visibleRecords = useMemo(
    () => records.filter((record) => recordMatchesTab(record, activeTab)),
    [activeTab, records]
  );
  const calculatedSummary = useMemo(() => derivedSummary(records), [records]);
  const summary = snapshot?.summary ?? calculatedSummary;
  const criticalCount =
    (summary.bySeverity.critical ?? 0) +
    (summary.bySeverity["action-required"] ?? 0);
  const activeOrUnreadCount = summary.activeOrUnreadCount;

  const fallbackTabCounts = useMemo(() => {
    const counts: Record<HistoryTab, number> = {
      all: records.length,
      notifications: 0,
      "incidents-risks": 0,
      "twin-snapshots": 0,
      "decisions-audit": 0,
      "email-delivery": 0,
      "sync-connectors": 0,
    };

    for (const record of records) {
      for (const tab of TABS) {
        if (tab.id !== "all" && recordMatchesTab(record, tab.id)) {
          counts[tab.id] += 1;
        }
      }
    }

    return counts;
  }, [records]);
  const tabCounts = snapshot?.sectionCounts ?? fallbackTabCounts;

  const resetFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setKind("");
    setSeverity("");
    setDomain("");
    setStatus("");
    setFromTimestamp("");
    setToTimestamp("");
    setActiveTab("all");
  };

  return (
    <main className="relative z-10 min-h-screen w-full bg-slate-950 text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600"
            />
            <div>
              <p className="font-bold tracking-tight text-slate-100">
                ClusterOS AI
              </p>
              <p className="text-xs text-slate-500">MedRouteX History Center</p>
            </div>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
          >
            Back to Command Center
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
        <section aria-labelledby="history-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
                Canonical operational record
              </p>
              <h1
                id="history-title"
                className="mt-2 bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent md:text-5xl"
              >
                Unified History Center
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:text-base">
                Operational events, notifications, Hospital Twin snapshots,
                decisions, audits, and truthful email-delivery outcomes from one
                canonical state.
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-200">
              Infrastructure Decision Support Only · Not a Diagnosis System
              <br />
              PHI-Zero · Synthetic and Emulated Telemetry
            </div>
          </div>
        </section>

        <section
          aria-label="History summary"
          className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs text-slate-500">Matched Records</p>
            <p className="mt-1 text-2xl font-bold text-slate-100">
              {summary.total}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
            <p className="text-xs text-slate-500">Notifications</p>
            <p className="mt-1 text-2xl font-bold text-cyan-300">
              {summary.byKind.notification ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs text-slate-500">Critical / Action Required</p>
            <p className="mt-1 text-2xl font-bold text-red-300">
              {criticalCount}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-slate-500">Active / Unread</p>
            <p className="mt-1 text-2xl font-bold text-amber-300">
              {activeOrUnreadCount}
            </p>
          </div>
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
            <p className="text-xs text-slate-500">Email Delivery</p>
            <p className="mt-1 text-2xl font-bold text-purple-300">
              {summary.byKind["email-delivery"] ?? 0}
            </p>
          </div>
        </section>

        <section
          aria-labelledby="history-filters-title"
          className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="history-filters-title"
                className="font-semibold text-slate-100"
              >
                Search and filters
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Filters are evaluated by the unified history API.
              </p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/70"
            >
              Clear filters
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="xl:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Search
              </span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Title, reason, entity, correlation ID..."
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Type
              </span>
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as UnifiedHistoryKind | "")
                }
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">All types</option>
                {HISTORY_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {KIND_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Severity
              </span>
              <select
                value={severity}
                onChange={(event) =>
                  setSeverity(
                    event.target.value as OperationalEventSeverity | ""
                  )
                }
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">All severities</option>
                {SEVERITIES.map((option) => (
                  <option key={option} value={option}>
                    {sentenceCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Domain
              </span>
              <select
                value={domain}
                onChange={(event) =>
                  setDomain(event.target.value as OperationalEventDomain | "")
                }
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">All domains</option>
                {DOMAINS.map((option) => (
                  <option key={option} value={option}>
                    {sentenceCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                Status
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {sentenceCase(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                From
              </span>
              <input
                type="datetime-local"
                value={fromTimestamp}
                onChange={(event) => setFromTimestamp(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-400">
                To
              </span>
              <input
                type="datetime-local"
                value={toTimestamp}
                onChange={(event) => setToTimestamp(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
              />
            </label>
          </div>

          {snapshot?.invalidFilters.length ? (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
            >
              Ignored invalid filters: {snapshot.invalidFilters.join(", ")}
            </p>
          ) : null}
        </section>

        <section aria-label="History categories" className="mt-6">
          <div
            role="tablist"
            aria-label="Unified history sections"
            className="flex gap-2 overflow-x-auto pb-2"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="history-feed"
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/70 ${
                  activeTab === tab.id
                    ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-200"
                    : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {tab.label}{" "}
                <span className="ml-1 text-[10px] opacity-70">
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          id="history-feed"
          role="tabpanel"
          aria-busy={isLoading}
          className="mt-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <p>
              Showing {visibleRecords.length} of {snapshot?.matched ?? 0} matched
              records · newest first
            </p>
            {snapshot ? (
              <p>
                Canonical state v{snapshot.metadata.stateVersion} ·{" "}
                {snapshot.metadata.canonicalSource}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchHistory()}
                className="font-semibold underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          ) : null}

          {isLoading && snapshot === null ? (
            <div
              role="status"
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center"
            >
              <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              <p className="mt-4 text-sm text-slate-400">
                Loading canonical history...
              </p>
            </div>
          ) : visibleRecords.length > 0 ? (
            <ol className="space-y-3">
              {visibleRecords.map((record) => (
                <HistoryRecordCard key={record.id} record={record} />
              ))}
            </ol>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-16 text-center">
              <p className="text-base font-medium text-slate-300">
                No matching history records
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Adjust the active tab or clear one or more filters.
              </p>
            </div>
          )}

          {isLoading && snapshot !== null ? (
            <p
              role="status"
              className="mt-3 text-center text-xs text-slate-500"
            >
              Refreshing history...
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
