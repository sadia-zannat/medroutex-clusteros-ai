import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";
import { simulateDigitalTwin } from "@/lib/medroutex/digital-twin";

export async function GET() {
  const operationalTwinState = getOperationalTwinState();
  const scenario = operationalTwinState.overallStatus === "critical" ? "medroutex-stroke-crisis" : "normal_day";
  const meshState = deriveMeshStateFromOperationalTwin(operationalTwinState, scenario);
  const result = simulateDigitalTwin(meshState);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
