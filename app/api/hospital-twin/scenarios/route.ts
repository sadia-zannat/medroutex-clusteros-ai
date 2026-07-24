import { NextResponse } from "next/server";
import { getScenarioCatalog } from "@/lib/twin-core/scenario-catalog";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getOperationalTwinState();
  return NextResponse.json(
    {
      success: true,
      catalog: getScenarioCatalog(),
      activeScenarioId: state.scenarioRuntime.activeScenarioId,
      activeStatus: state.scenarioRuntime.scenarioStatus,
      metadata: {
        phase: 2,
        readOnlyCatalog: true,
        executionEndpoint: "/api/hospital-twin/scenarios/run",
        safetyLabel: "EMULATED HOSPITAL OPERATIONAL SCENARIO",
        automaticExecution: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
