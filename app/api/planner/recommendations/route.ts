import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { generateRouteRecommendations } from "@/lib/medroutex/route-planner";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getOperationalTwinState();
  const recordedEvaluation = state.latestGuardRulerEvaluation;
  const evaluationIsCurrent =
    recordedEvaluation !== null &&
    (recordedEvaluation.evaluatedStateVersion === state.version ||
      recordedEvaluation.decisionStatus === "approved" ||
      recordedEvaluation.decisionStatus === "rejected");
  const recommendations = generateRouteRecommendations(
    evaluationIsCurrent ? recordedEvaluation : null
  );

  return NextResponse.json({ recommendations }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
