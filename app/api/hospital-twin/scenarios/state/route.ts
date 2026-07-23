import { NextResponse } from "next/server";
import { getScenarioState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/hospital-twin/scenarios/state
 * 
 * Phase 1: Returns the current scenario state including active scenario and available scenarios.
 * Phase 2 will add scenario mutation endpoints.
 */
export async function GET() {
  const scenarioState = getScenarioState();
  
  return NextResponse.json(
    {
      success: true,
      state: scenarioState,
      metadata: {
        phase: 1,
        readOnly: true,
        mutationNotImplemented: true,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
