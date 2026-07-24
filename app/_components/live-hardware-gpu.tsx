"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveGpuTelemetry } from "@/lib/twin-core/types";

interface HardwareResponse {
  success: boolean;
  telemetry: LiveGpuTelemetry | null;
  stateVersion?: number;
  metadata: {
    sourceLabel: string;
    provider?: string;
    command?: string;
    simulationProtected: boolean;
    simulationNodesUnaffected: boolean;
  };
}

interface LiveHardwareGpuProps {
  refreshNonce?: number;
  onStateChanged?: () => void | Promise<void>;
}

function number(value: number | null, unit: string): string {
  return value === null ? "Unavailable" : `${Math.round(value * 10) / 10}${unit}`;
}

export default function LiveHardwareGpu({ refreshNonce = 0, onStateChanged }: LiveHardwareGpuProps) {
  const [snapshot, setSnapshot] = useState<HardwareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/hardware/gpu", { cache: "no-store" });
      const payload = await response.json() as HardwareResponse;
      if (!response.ok) throw new Error("Unable to load local GPU telemetry status.");
      setSnapshot(payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load local GPU telemetry status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load, refreshNonce]);

  const synchronize = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/hardware/gpu/sync", { method: "POST" });
      const payload = await response.json() as HardwareResponse;
      setSnapshot(payload);
      if (!response.ok && payload.telemetry?.error) throw new Error(payload.telemetry.error);
      if (!response.ok) throw new Error("nvidia-smi telemetry is unavailable on this server.");
      await onStateChanged?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to synchronize local GPU telemetry.");
    } finally {
      setPending(false);
    }
  };

  const telemetry = snapshot?.telemetry ?? null;
  const connected = telemetry?.connectionStatus === "connected";

  return (
    <section className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4" aria-labelledby="live-gpu-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">LIVE LOCAL HARDWARE TELEMETRY</p>
          <h3 id="live-gpu-title" className="mt-1 text-sm font-semibold text-slate-100">RTX / NVIDIA Local GPU Provider</h3>
          <p className="mt-1 text-xs text-slate-500">Collected with nvidia-smi · protected from simulation mutations</p>
        </div>
        <button type="button" onClick={() => void synchronize()} disabled={pending} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50">{pending ? "Synchronizing..." : "Sync Local GPU"}</button>
      </div>

      {loading ? <p className="mt-4 text-xs text-slate-400">Checking local hardware provider...</p> : null}
      {error ? <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">{error}</p> : null}
      {connected && telemetry?.error ? (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          {telemetry.error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3 sm:col-span-2"><p className="text-[11px] text-slate-500">Connection</p><p className={`mt-1 text-sm font-semibold ${connected ? "text-emerald-300" : "text-amber-300"}`}>{telemetry ? telemetry.connectionStatus : "Not synchronized"}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3 sm:col-span-2"><p className="text-[11px] text-slate-500">GPU</p><p className="mt-1 text-sm font-semibold text-slate-200">{telemetry?.gpuName ?? "Awaiting nvidia-smi"}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Temperature</p><p className="mt-1 font-semibold text-cyan-200">{number(telemetry?.temperatureC ?? null, "°C")}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Utilization</p><p className="mt-1 font-semibold text-cyan-200">{number(telemetry?.utilizationPercent ?? null, "%")}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Memory used</p><p className="mt-1 font-semibold text-cyan-200">{number(telemetry?.memoryUsedMiB ?? null, " MiB")}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Memory total</p><p className="mt-1 font-semibold text-cyan-200">{number(telemetry?.memoryTotalMiB ?? null, " MiB")}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Power draw</p><p className="mt-1 font-semibold text-cyan-200">{number(telemetry?.powerDrawWatts ?? null, " W")}</p></div>
        <div className="rounded-lg border border-white/10 bg-slate-950/30 p-3"><p className="text-[11px] text-slate-500">Last collected</p><p className="mt-1 text-xs font-semibold text-slate-200">{telemetry?.collectedAt ?? "Never"}</p></div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">Real telemetry is displayed separately and never replaces the 10-node synthetic Digital Twin.</p>
    </section>
  );
}
