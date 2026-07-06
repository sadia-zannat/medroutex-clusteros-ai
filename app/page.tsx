export default function Home() {
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
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                MedRouteX Command Center
              </h1>
              <p className="text-lg text-slate-400">
                Emergency Radiology AI Continuity Mesh for safe GPU routing and digital twin simulation
              </p>
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
                <p className="text-2xl font-bold text-cyan-400">10</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Active Workloads</p>
                <p className="text-2xl font-bold text-blue-400">20</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Critical Workloads</p>
                <p className="text-2xl font-bold text-red-400">3</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Cluster Health</p>
                <p className="text-2xl font-bold text-emerald-400">86%</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Risky GPUs</p>
                <p className="text-2xl font-bold text-amber-400">2</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <p className="text-sm text-slate-400">Estimated Saving</p>
                <p className="text-2xl font-bold text-teal-400">$2,850</p>
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