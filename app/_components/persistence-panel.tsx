"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersistenceStatus } from "@/lib/twin-core/types";

interface PersistenceResponse {
  success?: boolean;
  configured?: PersistenceStatus;
  current?: PersistenceStatus;
  persistence?: PersistenceStatus;
  stateVersion?: number;
  error?: string;
}

interface PersistencePanelProps {
  refreshNonce?: number;
  onStateChanged?: () => void | Promise<void>;
}

export default function PersistencePanel({ refreshNonce = 0, onStateChanged }: PersistencePanelProps) {
  const [status, setStatus] = useState<PersistenceStatus | null>(null);
  const [pending, setPending] = useState<"save" | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/persistence/status", { cache: "no-store" });
      const payload = await response.json() as PersistenceResponse;
      if (!response.ok) throw new Error("Unable to load persistence status.");
      setStatus(payload.configured?.mode === "sqlite-local" ? payload.configured : (payload.current ?? payload.configured ?? null));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Unable to load persistence status.");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load, refreshNonce]);

  const action = async (kind: "save" | "restore"): Promise<void> => {
    if (pending) return;
    setPending(kind);
    setMessage(null);
    try {
      const response = await fetch(`/api/persistence/${kind}`, { method: "POST" });
      const payload = await response.json() as PersistenceResponse;
      if (!response.ok) throw new Error(payload.error ?? (kind === "save" ? "SQLite save failed." : "SQLite restore failed."));
      setStatus(payload.persistence ?? status);
      setMessage(kind === "save" ? `State v${payload.stateVersion ?? "?"} saved to local SQLite.` : `State v${payload.stateVersion ?? "?"} restored from local SQLite.`);
      await load();
      await onStateChanged?.();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Persistence operation failed.");
    } finally {
      setPending(null);
    }
  };

  const enabled = status?.mode === "sqlite-local";
  return (
    <section className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4" aria-labelledby="persistence-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">LOCAL PILOT PERSISTENCE</p>
          <h3 id="persistence-title" className="mt-1 text-sm font-semibold text-slate-100">SQLite Twin State Checkpoint</h3>
          <p className="mt-1 text-xs text-slate-500">No patient data · explicit save/restore · local demonstration database</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>{enabled ? "SQLite enabled" : "Memory only"}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-slate-500">Mode</p><p className="mt-1 font-semibold text-slate-200">{status?.mode ?? "Checking"}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-slate-500">Last saved</p><p className="mt-1 font-semibold text-slate-200">{status?.lastPersistedAt ?? "Never"}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-slate-500">Last restored</p><p className="mt-1 font-semibold text-slate-200">{status?.lastRestoredAt ?? "Never"}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void action("save")} disabled={!enabled || pending !== null} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-40">{pending === "save" ? "Saving..." : "Save State"}</button>
        <button type="button" onClick={() => void action("restore")} disabled={!enabled || pending !== null} className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-200 hover:bg-purple-500/20 disabled:opacity-40">{pending === "restore" ? "Restoring..." : "Restore Latest"}</button>
      </div>
      {message ? <p className="mt-3 text-xs text-slate-300">{message}</p> : null}
      {!enabled ? <p className="mt-3 text-[11px] text-amber-200">Set MEDROUTEX_SQLITE_ENABLED=true in .env.local to enable local persistence.</p> : null}
    </section>
  );
}
