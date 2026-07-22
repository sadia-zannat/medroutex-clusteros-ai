import { NextResponse } from "next/server";
import { applyCrisisScenarioToState, getOperationalTwinSummary } from "@/lib/twin-core/state-store";
import { deriveMeshStateFromOperationalTwin } from "@/lib/twin-core/compatibility";

export async function POST() {
  try {
    // Apply crisis to Operational Twin (canonical source)
    const operationalTwinState = applyCrisisScenarioToState();
    const operationalTwinSummary = getOperationalTwinSummary();

    // Derive legacy MeshState from Operational Twin for dashboard compatibility
    const meshState = deriveMeshStateFromOperationalTwin(
      operationalTwinState,
      "medroutex-stroke-crisis"
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
  } catch (error) {
    console.error("Error in POST /api/demo/run:", error);
    return NextResponse.json(
      {
        error: "Failed to run crisis scenario",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
