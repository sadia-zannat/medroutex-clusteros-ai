import { NextResponse } from "next/server";
import {
  resetOperationalTwinState,
  getOperationalTwinSummary,
} from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const newState = resetOperationalTwinState();
    const summary = getOperationalTwinSummary();

    const response = NextResponse.json({
      success: true,
      message: "Operational twin state reset successfully.",
      data: newState,
      summary,
    });

    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Unable to reset the operational twin state.",
      },
      { status: 500 }
    );
  }
}
