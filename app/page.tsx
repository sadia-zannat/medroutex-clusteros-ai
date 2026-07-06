export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
          PHI-Zero Mode • Synthetic Data Only • Human Approval Required
        </p>

        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
          ClusterOS AI: MedRouteX
        </h1>

        <p className="mt-5 max-w-3xl text-lg text-slate-300">
          Emergency Radiology AI Continuity Mesh for safe GPU routing, digital
          twin simulation, privacy-aware decisions, and audit-ready human
          approval.
        </p>

        <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-cyan-200">Predict</h2>
            <p className="mt-2 text-sm text-slate-300">
              Detect risky GPUs, overload, latency, and failure probability.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-emerald-200">Simulate</h2>
            <p className="mt-2 text-sm text-slate-300">
              Run digital twin before/after routing simulation.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold text-violet-200">Approve</h2>
            <p className="mt-2 text-sm text-slate-300">
              Keep hospital AI infrastructure human-in-the-loop.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}