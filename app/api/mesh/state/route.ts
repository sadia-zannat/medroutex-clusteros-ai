import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";

export async function GET() {
  // Get canonical Operational Twin state
  const operationalTwinState = getOperationalTwinState();
  const scenario = operationalTwinState.overallStatus === "critical"
    ? "medroutex-stroke-crisis"
    : "normal_day";
  
  // Derive legacy MeshState from Operational Twin for dashboard compatibility
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
