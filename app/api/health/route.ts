import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { persistenceStatus } from "@/lib/persistence/sqlite-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = getOperationalTwinState();
  const persistence = persistenceStatus();
  return NextResponse.json(
    {
      status: "ok",
      service: "ClusterOS AI: MedRouteX",
      timestamp: new Date().toISOString(),
      twin: {
        version: state.version,
        health: state.overallHealthScore,
        resilience: state.resilienceSummary.resilienceScore,
        activeScenario: state.scenarioRuntime.activeScenarioId,
        entities: state.entities.length,
        relationships: state.relationships.length,
      },
      integrations: {
        localGpu: state.liveHardwareGpu?.connectionStatus ?? "not-synchronized",
        persistence: persistence.mode,
        email: process.env.EMAIL_ALERTS_ENABLED === "true" ? "enabled" : "disabled",
      },
      safety: {
        phiMode: "PHI-Zero",
        decisionSupportOnly: true,
        automaticExecution: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
