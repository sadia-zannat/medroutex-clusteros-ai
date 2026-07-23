import { NextResponse } from "next/server";
import {
  getOperationalTwinState,
  synchronizeOperationalTwinState,
} from "@/lib/twin-core/state-store";
import { createHospitalTwinApiResponse } from "@/lib/twin-core/hospital-view";
import { dispatchPendingEmailNotifications } from "@/lib/twin-core/email-service";

export async function POST() {
  try {
    const result = synchronizeOperationalTwinState();
    await dispatchPendingEmailNotifications();
    const state = getOperationalTwinState();
    if (result.summary.status === "failed") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "HOSPITAL_TWIN_SYNC_FAILED",
            message:
              "All emulated Hospital Twin telemetry providers failed; the previous successful synchronization timestamp was preserved.",
          },
          synchronizationSummary: result.summary,
          data: state,
        },
        {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
    return NextResponse.json(
      {
        ...createHospitalTwinApiResponse(state),
        synchronizationSummary: result.summary,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Error in POST /api/hospital-twin/sync:", error);
    await dispatchPendingEmailNotifications();
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "HOSPITAL_TWIN_SYNC_FAILED",
          message: "Unable to synchronize emulated hospital telemetry.",
        },
      },
      { status: 500 }
    );
  }
}
