import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
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
  const scenario =
    state.activeSimulation?.scenarioId ??
    (state.overallStatus === "critical"
      ? "medroutex-stroke-crisis"
      : "normal_day");
  const result = simulateDigitalTwin(
    evaluationIsCurrent ? recordedEvaluation : null,
    {
      scenario,
      healthScore: state.overallHealthScore,
      riskyGpuCount: state.domains.compute.riskyGpus,
    }
  );

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
