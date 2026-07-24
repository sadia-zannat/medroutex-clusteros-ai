import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";
import { getDashboardScenarioId } from "@/lib/twin-core/scenario-identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const operationalTwinState = getOperationalTwinState();
  const scenario = getDashboardScenarioId(operationalTwinState);
  const meshState = deriveMeshStateFromOperationalTwin(
    operationalTwinState,
    scenario
  );

  return NextResponse.json(meshState, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
