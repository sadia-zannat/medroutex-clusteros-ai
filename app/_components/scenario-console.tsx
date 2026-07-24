"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HospitalTopology from "./hospital-topology";
import type {
  OperationalIncident,
  CascadePath,
  DomainContinuityAssessment,
  HospitalScenarioId,
  MultiDomainCandidatePlan,
  MultiDomainPlanSet,
  OperationalRole,
  ScenarioContract,
  ScenarioRootCause,
  ScenarioRuntimeState,
} from "@/lib/twin-core/types";

interface CatalogResponse {
  success: true;
  catalog: {
    scenarios: ScenarioContract[];
    version: string;
  };
}

interface ScenarioStateResponse {
  success: true;
  runtimeState: ScenarioRuntimeState;
  activeIncidents: OperationalIncident[];
  domainAssessments: DomainContinuityAssessment[];
  rootCauses: ScenarioRootCause[];
  cascadePaths: CascadePath[];
  multiDomainPlanSet: MultiDomainPlanSet | null;
}

interface ScenarioConsoleProps {
  refreshNonce?: number;
  operatorName?: string;
  operatorRole?: string;
  onStateChanged?: () => void | Promise<void>;
}

const VALID_ROLES: readonly OperationalRole[] = [
  "Radiology Operator",
  "Hospital Administrator",
  "Infrastructure Engineer",
  "ICU Operations",
  "Security/Privacy Officer",
];

function isOperationalRole(value?: string): value is OperationalRole {
  return VALID_ROLES.some((role) => role === value);
}

function sentenceCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}


function timeBandLabel(value: string): string {
  const labels: Record<string, string> = {
    immediate: "Immediate",
    "under-5-minutes": "Under 5 Minutes",
    "5-30-minutes": "5–30 Minutes",
    "30-120-minutes": "30–120 Minutes",
    "over-120-minutes": "Over 120 Minutes",
    unknown: "Unknown",
  };
  return labels[value] ?? sentenceCase(value);
}

function statusTone(value: string | null): string {
  if (value === "critical" || value === "failed" || value === "no-safe-plan") {
    return "border-red-500/30 bg-red-500/10 text-red-200";
  }
  if (value === "high" || value === "warning" || value === "awaiting-approval") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  }
  if (value === "approved" || value === "completed" || value === "healthy") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-200";
}

function PlanCard({ plan, label }: { plan: MultiDomainCandidatePlan | null; label: string }) {
  if (!plan) {
    return (
      <article className="rounded-xl border border-white/10 bg-slate-950/25 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 text-sm text-slate-400">No safe plan available.</p>
      </article>
    );
  }

  return (
    <article className={`rounded-xl border p-4 ${
      label === "Plan A" ? "border-cyan-500/30 bg-cyan-500/10" : "border-white/10 bg-white/5"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <h4 className="mt-1 font-semibold text-slate-100">{plan.title}</h4>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-cyan-200">{plan.score.toFixed(1)}</p>
          <p className="text-[11px] text-slate-500">{Math.round(plan.confidence * 100)}% confidence</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className={`rounded-full border px-2 py-1 ${statusTone(plan.status)}`}>
          {sentenceCase(plan.status)}
        </span>
        <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-1 text-purple-200">
          {plan.requiresHumanApproval ? "Human Approval Required" : "Approval Not Required"}
        </span>
        <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-1 text-slate-300">
          No Automatic Execution
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="text-slate-500">Resilience projection</dt><dd className="text-slate-200">{plan.beforeResilienceScore}% → {plan.projectedResilienceScore}%</dd></div>
        <div><dt className="text-slate-500">Affected domains</dt><dd className="text-slate-200">{plan.affectedDomains.map(sentenceCase).join(", ")}</dd></div>
      </dl>
      <details className="mt-3 border-t border-white/10 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-cyan-300">Recommended operator actions</summary>
        <ul className="mt-2 space-y-2 text-xs text-slate-300">
          {plan.recommendedActions.map((action) => (
            <li key={action.id}>• <span className="font-medium">{action.title}:</span> {action.description}</li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate-500">{plan.decisionSupportDisclaimer}</p>
      </details>
    </article>
  );
}

export default function ScenarioConsole({
  refreshNonce = 0,
  operatorName,
  operatorRole,
  onStateChanged,
}: ScenarioConsoleProps) {
  const [scenarios, setScenarios] = useState<ScenarioContract[]>([]);
  const [selectedId, setSelectedId] = useState<HospitalScenarioId>("stroke-compute-crisis");
  const [snapshot, setSnapshot] = useState<ScenarioStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const sequence = requestRef.current + 1;
    requestRef.current = sequence;
    setLoading(true);
    setError(null);
    try {
      const [catalogResponse, stateResponse] = await Promise.all([
        fetch("/api/hospital-twin/scenarios", { cache: "no-store" }),
        fetch("/api/hospital-twin/scenarios/state", { cache: "no-store" }),
      ]);
      const catalog = await catalogResponse.json() as CatalogResponse;
      const state = await stateResponse.json() as ScenarioStateResponse;
      if (!catalogResponse.ok || catalog.success !== true) throw new Error("Unable to load scenario catalog.");
      if (!stateResponse.ok || state.success !== true) throw new Error("Unable to load scenario state.");
      if (sequence !== requestRef.current) return;
      setScenarios(catalog.catalog.scenarios);
      setSnapshot(state);
      if (state.runtimeState.activeScenarioId) setSelectedId(state.runtimeState.activeScenarioId);
    } catch (caught) {
      if (sequence !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : "Unable to load scenario console.");
    } finally {
      if (sequence === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load, refreshNonce]);

  const selected = useMemo(
    () => scenarios.find((entry) => entry.id === selectedId) ?? null,
    [scenarios, selectedId]
  );

  const runScenario = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const active = snapshot?.runtimeState.activeScenarioId;
      if (active !== null && active !== selectedId) {
        const reset = await fetch("/api/demo/reset", { method: "POST" });
        if (!reset.ok) throw new Error("Unable to reset the existing scenario before running the selected scenario.");
      }

      const body: Record<string, string> = { scenarioId: selectedId };
      if (operatorName?.trim()) body.operatorName = operatorName.trim();
      if (isOperationalRole(operatorRole)) body.operatorRole = operatorRole;
      const response = await fetch("/api/hospital-twin/scenarios/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Scenario execution failed.");
      await load();
      await onStateChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scenario execution failed.");
    } finally {
      setPending(false);
    }
  };

  const resetScenario = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Unable to restore normal operations.");
      await load();
      await onStateChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset scenario.");
    } finally {
      setPending(false);
    }
  };

  const runtime = snapshot?.runtimeState;
  const plans = snapshot?.multiDomainPlanSet;

  return (
    <section className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-5 backdrop-blur-sm" aria-labelledby="scenario-console-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-fuchsia-300">EMULATED HOSPITAL OPERATIONAL SCENARIO</p>
          <h3 id="scenario-console-title" className="mt-1 text-lg font-semibold text-slate-100">Hospital Continuity Scenario Console</h3>
          <p className="mt-1 text-xs text-slate-400">Infrastructure Decision Support Only · What-if Simulation · No Automatic Execution</p>
        </div>
        <Link href="/history" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:border-fuchsia-500/30 hover:text-fuchsia-200">View Unified History</Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="text-xs text-slate-400">
          Scenario
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value as HospitalScenarioId)}
            disabled={pending || scenarios.length === 0}
            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50"
          >
            {scenarios.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="button" onClick={() => void runScenario()} disabled={pending || loading || !selected} className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:opacity-50">{pending ? "Working..." : "Run Selected Scenario"}</button>
          <button type="button" onClick={() => void resetScenario()} disabled={pending} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">Normal Operations</button>
        </div>
      </div>

      {selected ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/30 p-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-2 py-1 ${statusTone(selected.severity)}`}>{sentenceCase(selected.severity)}</span>
            {selected.affectedDomains.map((domain) => <span key={domain} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-slate-300">{sentenceCase(domain)}</span>)}
            {selected.requiresHumanApproval ? <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200">Human Approval Required</span> : null}
          </div>
          <p className="mt-2 text-slate-400">{selected.description}</p>
        </div>
      ) : null}

      {error ? <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">{error}</p> : null}

      {runtime?.activeScenarioId ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[11px] text-slate-500">Active scenario</p><p className="mt-1 text-sm font-semibold text-fuchsia-200">{sentenceCase(runtime.activeScenarioId)}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[11px] text-slate-500">Status</p><p className="mt-1 text-sm font-semibold text-slate-200">{sentenceCase(runtime.scenarioStatus ?? "unknown")}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[11px] text-slate-500">Severity</p><p className="mt-1 text-sm font-semibold text-amber-200">{sentenceCase(runtime.severity ?? "unknown")}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[11px] text-slate-500">Incidents</p><p className="mt-1 text-sm font-semibold text-red-200">{snapshot?.activeIncidents.length ?? 0}</p></div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[11px] text-slate-500">Execution</p><p className="mt-1 text-sm font-semibold text-emerald-200">Physical action: No</p></div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-200">Domain continuity</h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {(snapshot?.domainAssessments ?? []).map((assessment) => (
                <article key={assessment.domain} className="rounded-lg border border-white/10 bg-slate-950/30 p-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-400">{sentenceCase(assessment.domain)}</p><p className="font-semibold text-cyan-200">{assessment.score}%</p></div>
                  <p className="mt-2 text-[11px] text-slate-500">TTF: {timeBandLabel(assessment.timeToFailureBand)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{assessment.sourceLabel}</p>
                </article>
              ))}
            </div>
          </div>

          <HospitalTopology assessments={snapshot?.domainAssessments ?? []} />

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-red-200">Root causes</h4>
              <div className="mt-2 space-y-2">
                {(snapshot?.rootCauses ?? []).map((cause) => (
                  <article key={cause.id} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-200">{cause.title}</p><span className="text-[11px] text-red-200">{timeBandLabel(cause.timeToFailureBand)}</span></div>
                    <p className="mt-1 text-xs text-slate-400">{cause.evidence.join(" · ")}</p>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-200">Latest dependency cascades</h4>
              <div className="mt-2 space-y-2">
                {(snapshot?.cascadePaths ?? []).slice(0, 4).map((path) => (
                  <article key={path.id} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs font-medium text-slate-200">{path.nodes.map((node) => node.entityLabel).join(" → ")}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{path.explanation}</p>
                  </article>
                ))}
                {(snapshot?.cascadePaths.length ?? 0) === 0 ? <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-500">No active cascade path.</p> : null}
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-cyan-200">Multi-domain response plans</h4><p className="text-[11px] text-slate-500">{plans?.scoringFormula ?? "Guard-first transparent ranking"}</p></div>
            <div className="mt-2 grid gap-3 lg:grid-cols-3">
              <PlanCard plan={plans?.planA ?? null} label="Plan A" />
              <PlanCard plan={plans?.planB ?? null} label="Plan B" />
              <PlanCard plan={plans?.planC ?? null} label="Plan C" />
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">Normal operations are active. Select a deterministic scenario to inspect cross-domain continuity behavior.</p>
      )}
    </section>
  );
}
