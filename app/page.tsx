"use client";

import { useEffect, useState } from "react";
import type { MeshState, Gpu } from "../lib/medroutex/types";

export default function Home() {
  const [meshState, setMeshState] = useState<MeshState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/mesh/state");
      if (!response.ok) throw new Error("Failed to fetch state");
      const data = await response.json();
      setMeshState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Failed to reset");
      const data = await response.json();
      setMeshState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRunScenario = async () => {
    try {
      const response = await fetch("/api/demo/run", { method: "POST" });
      if (!response.ok) throw new Error("Failed to run scenario");
      const data = await response.json();
      setMeshState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const formatNumber = (value: number, decimals: number = 1): string => {
    return value.toFixed(decimals);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
      case "warning":
        return "text-amber-400 border-amber-500/30 bg-amber-500/10";
      case "critical":
        return "text-red-400 border-red-500/30 bg-red-500/10";
      case "idle":
      case "standby":
        return "text-cyan-400 border-cyan-500/30 bg-cyan-500/10";
      default:
        return "text-slate-400 border-slate-500/30 bg-slate-500/10";
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-400">Loading MedRouteX Command Center...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Error: {error}</p>
          <button
            onClick={fetchState}
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!meshState) return null;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Sticky Glassmorphism Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600"></div>
            <span className="text-xl font-bold tracking-tight">ClusterOS AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#" className="hover:text-cyan-400 transition-colors">Dashboard</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Routes</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Analytics</a>
            <a href="#" className="hover:text-cyan-400 transition-colors">Settings</a>
          </nav>
          <button className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors">
            Connect
          </button>
        </div>
      </header>

      {/* Hero Command Center Section */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight md:text-5xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  MedRouteX Command Center
                </h1>
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-sm text-purple-300">
                  {meshState.scenario.replace(/_/g, " ").toUpperCase()}
                </span>
              </div>
              <p className="text-lg text-slate-400">
                Emergency Radiology AI Continuity Mesh for safe GPU routing and digital twin simulation
              </p>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                Reset Scenario
              </button>
              <button
                onClick={handleRunScenario}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20 transition-colors"
              >
                Run Crisis Simulation
              </button>
            </div>

            {/* Route Chips */}
            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300">
                Local Hospital
              </span>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300">
                Central GPU
              </span>
              <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-purple-300">
                Cloud Burst
              </span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                Degraded Mode
              </span>
            </div>

            {/* Summary Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Total GPUs</p>
                <p className="text-2xl font-bold text-cyan-400">{meshState.totalGpus}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Active Workloads</p>
                <p className="text-2xl font-bold text-blue-400">{meshState.activeWorkloads}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Critical Workloads</p>
                <p className="text-2xl font-bold text-red-400">{meshState.criticalWorkloads}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Cluster Health</p>
                <p className="text-2xl font-bold text-emerald-400">{meshState.clusterHealth}%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Risky GPUs</p>
                <p className="text-2xl font-bold text-amber-400">{meshState.riskyGpus}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Estimated Saving</p>
                <p className="text-2xl font-bold text-teal-400">${meshState.estimatedSaving.toLocaleString()}</p>
              </div>
            </div>

            {/* Safety Strip */}
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 flex flex-wrap gap-4 text-sm">
              <span className="text-cyan-300">PHI-Zero Mode</span>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-300">Synthetic Data Only</span>
              <span className="text-slate-500">|</span>
              <span className="text-cyan-300">Human Approval Required</span>
            </div>
          </div>

          {/* Right Side Animated GIF */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-slate-900/50">
                <img 
                  src="/media/gpu-cluster-loop.gif" 
                  alt="GPU Cluster Animation" 
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mt-3 text-center text-sm text-slate-400">
                Live GPU Cluster Visualization
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live GPU Risk Snapshot */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
          Live GPU Risk Snapshot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {meshState.gpus.slice(0, 10).map((gpu: Gpu, index: number) => (
            <div key={gpu.id} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-300">GPU-{index + 1}</span>
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(gpu.status)}`}>
                  {gpu.status}
                </span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cluster:</span>
                  <span className="text-slate-300 capitalize">{gpu.clusterType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Temp:</span>
                  <span className="text-slate-300">{formatNumber(gpu.temperature, 1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Util:</span>
                  <span className="text-slate-300">{formatNumber(gpu.utilization, 1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Memory:</span>
                  <span className="text-slate-300">{formatNumber(gpu.memoryUsed, 1)}/{gpu.memoryTotal} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Risk:</span>
                  <span className="text-slate-300">{formatNumber(gpu.riskScore * 100, 1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Health:</span>
                  <span className="text-emerald-400">{formatNumber(gpu.healthScore, 0)}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Raw API Preview */}
      <section className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
          Raw API Preview
        </h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <pre className="text-xs text-slate-400 overflow-x-auto">
            {JSON.stringify({
              scenario: meshState.scenario,
              totalGpus: meshState.totalGpus,
              activeWorkloads: meshState.activeWorkloads,
              riskyGpus: meshState.riskyGpus,
              clusterHealth: meshState.clusterHealth,
            }, null, 2)}
          </pre>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          <p className="text-center text-sm text-slate-500">
            Team Delta | DIU AI Innovation Hackathon | ClusterOS AI: MedRouteX
          </p>
        </div>
      </footer>
    </main>
  );
}