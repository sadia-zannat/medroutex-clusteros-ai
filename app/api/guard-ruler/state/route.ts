import { NextResponse } from "next/server";
import { createGuardRulerStateApiResponse } from "@/lib/guard-ruler/view";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = getOperationalTwinState();
    return NextResponse.json(
      createGuardRulerStateApiResponse(state),
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Error in GET /api/guard-ruler/state:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GUARD_RULER_STATE_UNAVAILABLE",
          message:
            "Unable to retrieve the canonical Guard–Ruler state.",
        },
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

