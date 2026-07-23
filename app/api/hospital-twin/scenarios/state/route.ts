import { NextResponse } from "next/server";
import { getScenarioState, getOperationalTwinState } from "@/lib/twin-core/state-store";
import { getIcuContinuityAssessment, getIcuOperationalRecommendation } from "@/lib/twin-core/scenario-engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/hospital-twin/scenarios/state
 * 
 * Phase 2A: Returns the current scenario state including active scenario, available scenarios,
 * ICU assessment when active, active incidents, human approval requirement, and physicalExecutionPerformed false.
 */
export async function GET() {
  const scenarioState = getScenarioState();
  const operationalState = getOperationalTwinState();

  // Get ICU assessment and recommendation if ICU scenario is active
  const icuAssessment = getIcuContinuityAssessment(operationalState);
  const icuRecommendation = getIcuOperationalRecommendation(operationalState);
  
  return NextResponse.json(
    {
      success: true,
      state: scenarioState,
      runtimeState: operationalState.scenarioRuntime,
      icuAssessment,
      icuRecommendation,
      metadata: {
        phase: 2,
        readOnly: false,
        mutationImplemented: true,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
