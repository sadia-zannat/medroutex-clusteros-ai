"use client";

import { useEffect, useState } from "react";
import type { MeshState, Gpu, ClusterType } from "../lib/medroutex/types";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";

interface RouteRecommendation {
  id: string;
  workloadId: string;
  workloadName: string;
  fromGpuId?: string;
  targetGpuId?: string;
  targetClusterType: ClusterType;
  priority: string;
  reason: string;
  safetyStatus: "safe" | "warning" | "blocked";
  privacyStatus: "allowed" | "blocked";
  estimatedRiskReduction: number;
  estimatedLatencySeconds: number;
  estimatedCostSaving: number;
  action: "migrate" | "keep" | "queue" | "standby" | "manual_review";
}

interface DigitalTwinResult {
  scenario: string;
  beforeHealth: number;
  afterHealth: number;
  beforeRiskyGpus: number;
  afterRiskyGpus: number;
  recommendedActions: number;
  blockedActions: number;
  estimatedDowntimeSavedMinutes: number;
  estimatedCostSaving: number;
  riskReductionPercent: number;
  safetySummary: string;
}

export default function Home() {
  const [meshState, setMeshState] = useState<MeshState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<RouteRecommendation[]>([]);
  const [digitalTwin, setDigitalTwin] = useState<DigitalTwinResult | null>(null);

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

  const fetchRecommendations = async () => {
    try {
      const response = await fetch("/api/planner/recommendations");
      if (!response.ok) throw new Error("Failed to fetch recommendations");
      const data = await response.json();
      setRecommendations(data.recommendations || []);
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    }
  };

  const fetchDigitalTwin = async () => {
    try {
      const response = await fetch("/api/twin/simulate");
      if (!response.ok) throw new Error("Failed to fetch digital twin");
      const data = await response.json();
      setDigitalTwin(data);
    } catch (err) {
      console.error("Failed to fetch digital twin:", err);
    }
  };

  const handleReset = async () => {
    try {
      const response = await fetch("/api/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Failed to reset");
      const data = await response.json();
      setMeshState(data);
      await fetchRecommendations();
      await fetchDigitalTwin();
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
      await fetchRecommendations();
      await fetchDigitalTwin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  useEffect(() => {
    fetchState();
    fetchRecommendations();
    fetchDigitalTwin();
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
    <main className="min-h-screen bg-slate-950 text-white flex">
      {/* Left Side Nav Rail */}
      <aside className="hidden lg:flex flex-col w-16 border-r border-white/10 bg-slate-950/50 backdrop-blur-sm py-6 gap-6 items-center">
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600"></div>
        <div className="flex-1 flex flex-col gap-4">
          <button className="w-10 h-10 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/20 transition-colors">
            <span className="text-lg">📊</span>
          </button>
          <button className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 text-slate-400 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="text-lg">🔀</span>
          </button>
          <button className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 text-slate-400 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="text-lg">🔮</span>
          </button>
          <button className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 text-slate-400 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="text-lg">⚡</span>
          </button>
          <button className="w-10 h-10 rounded-lg border border-white/10 bg-white/5 text-slate-400 flex items-center justify-center hover:bg-white/10 transition-colors">
            <span className="text-lg">⚙️</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        {/* Sticky Glassmorphism Header */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-4 md:px-6">
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
      <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
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
      <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
        <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
          Live GPU Risk Snapshot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
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

      {/* Digital Twin + Route Planner Row */}
      <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Digital Twin Simulation
            </h2>
        {digitalTwin ? (
          <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-6 backdrop-blur-sm">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Cluster Health</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-300">{digitalTwin.beforeHealth}%</span>
                  <span className="text-purple-400">→</span>
                  <span className="text-2xl font-bold text-emerald-400">{digitalTwin.afterHealth}%</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Risky GPUs</p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-slate-300">{digitalTwin.beforeRiskyGpus}</span>
                  <span className="text-purple-400">→</span>
                  <span className="text-2xl font-bold text-emerald-400">{digitalTwin.afterRiskyGpus}</span>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Risk Reduction</p>
                <p className="text-2xl font-bold text-cyan-400">{digitalTwin.riskReductionPercent}%</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-slate-400">Cost Saving</p>
                <p className="text-2xl font-bold text-teal-400">${digitalTwin.estimatedCostSaving.toLocaleString()}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-sm text-slate-400">
                <span className="text-cyan-300">Downtime Saved:</span> {digitalTwin.estimatedDowntimeSavedMinutes} min | 
                <span className="text-cyan-300 ml-2">Recommended Actions:</span> {digitalTwin.recommendedActions} | 
                <span className="text-cyan-300 ml-2">Blocked:</span> {digitalTwin.blockedActions}
              </p>
              <p className="text-xs text-slate-500 mt-2">{digitalTwin.safetySummary}</p>
            </div>
          </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Loading digital twin simulation...</p>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Route Planner Recommendations
            </h2>
            {recommendations.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {recommendations.slice(0, 8).map((rec) => (
                  <div key={rec.id} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-300">{rec.workloadName}</p>
                        <p className="text-xs text-slate-500 capitalize">{rec.action} → {rec.targetClusterType}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full border ${
                          rec.safetyStatus === "safe" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                          rec.safetyStatus === "warning" ? "text-amber-400 border-amber-500/30 bg-amber-500/10" :
                          "text-red-400 border-red-500/30 bg-red-500/10"
                        }`}>
                          {rec.safetyStatus}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${
                          rec.privacyStatus === "allowed" ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10" :
                          "text-red-400 border-red-500/30 bg-red-500/10"
                        }`}>
                          {rec.privacyStatus}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{rec.reason}</p>
                    <div className="flex gap-4 text-xs">
                      <span className="text-slate-500">Latency: {rec.estimatedLatencySeconds}s</span>
                      <span className="text-slate-500">Saving: ${rec.estimatedCostSaving}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">No routing action required.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Heatmap + Analytics Row */}
      <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              GPU Cluster Heatmap
            </h2>
            <div className="grid grid-cols-5 gap-3">
              {meshState.gpus.slice(0, 10).map((gpu, index) => (
                <div
                  key={gpu.id}
                  className={`aspect-square rounded-lg border backdrop-blur-sm flex flex-col items-center justify-center transition-all hover:scale-105 ${
                    gpu.status === "healthy" ? "border-emerald-500/30 bg-emerald-500/10" :
                    gpu.status === "warning" ? "border-amber-500/30 bg-amber-500/10" :
                    gpu.status === "critical" ? "border-red-500/30 bg-red-500/10" :
                    "border-cyan-500/30 bg-cyan-500/10"
                  }`}
                >
                  <span className="text-lg font-bold text-slate-300">GPU-{index + 1}</span>
                  <span className="text-xs text-slate-400">{formatNumber(gpu.riskScore * 100, 0)}%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              GPU Analytics
            </h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={meshState.gpus.slice(0, 10).map((gpu, i) => ({
                  name: `GPU-${i + 1}`,
                  utilization: gpu.utilization,
                  temperature: gpu.temperature,
                }))}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px" }}
                    itemStyle={{ color: "#f1f5f9" }}
                  />
                  <Bar dataKey="utilization" fill="#22d3ee" name="Utilization %" />
                  <Bar dataKey="temperature" fill="#a855f7" name="Temperature °C" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Raw API Preview */}
      <section className="mx-auto max-w-[1500px] px-4 py-8 md:px-6">
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
        <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-6">
          <p className="text-center text-sm text-slate-500">
            Team Delta | DIU AI Innovation Hackathon | ClusterOS AI: MedRouteX
          </p>
        </div>
      </footer>
      </div>
    </main>
  );
}