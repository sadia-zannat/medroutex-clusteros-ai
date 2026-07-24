import { NextResponse } from "next/server";
import {
  getOperationalTwinState,
  getOperationalTwinSummary,
} from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = getOperationalTwinState();
    const summary = getOperationalTwinSummary();

    const response = NextResponse.json({
      success: true,
      data: state,
      summary,
      metadata: {
        simulationOnly: true,
        dataMode: "synthetic-operational-twin",
        clinicalDisclaimer: "Infrastructure decision-support only. Not a diagnosis or bedside treatment system.",
      },
    });

    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve the operational twin state.",
      },
      { status: 500 }
    );
  }
}
