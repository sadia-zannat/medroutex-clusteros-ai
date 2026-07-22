import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";
import { generateRouteRecommendations } from "@/lib/medroutex/route-planner";

export async function GET() {
  const operationalTwinState = getOperationalTwinState();
  const scenario = operationalTwinState.overallStatus === "critical" ? "medroutex-stroke-crisis" : "normal_day";
  const meshState = deriveMeshStateFromOperationalTwin(operationalTwinState, scenario);
  const recommendations = generateRouteRecommendations(meshState);
  return NextResponse.json({ recommendations }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
