import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { getDashboardScenarioId } from "@/lib/twin-core/scenario-identity";
import { simulateDigitalTwin } from "@/lib/medroutex/digital-twin";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getOperationalTwinState();
  const recordedEvaluation = state.latestGuardRulerEvaluation;
  const evaluationIsCurrent =
    recordedEvaluation !== null &&
    (recordedEvaluation.evaluatedStateVersion === state.version ||
      recordedEvaluation.decisionStatus === "approved" ||
      recordedEvaluation.decisionStatus === "rejected");
  const result = simulateDigitalTwin(
    evaluationIsCurrent ? recordedEvaluation : null,
    {
      scenario: getDashboardScenarioId(state),
      healthScore: state.overallHealthScore,
      riskyGpuCount: state.domains.compute.riskyGpus,
      modeledOverallRiskReductionPercent:
        state.activeSimulation?.predictedRiskReductionPercent ?? 0,
    }
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
