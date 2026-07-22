import { NextResponse } from "next/server";
import { resetOperationalTwinState, getOperationalTwinSummary } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";

export async function POST() {
  // Reset Operational Twin (canonical source)
  const operationalTwinState = resetOperationalTwinState();
  const operationalTwinSummary = getOperationalTwinSummary();

  // Derive legacy MeshState from Operational Twin for dashboard compatibility
  const meshState = deriveMeshStateFromOperationalTwin(
    operationalTwinState,
    "normal_day"
  );

  return NextResponse.json({
    ...meshState,
    operationalTwinState,
    operationalTwinSummary,
  }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
