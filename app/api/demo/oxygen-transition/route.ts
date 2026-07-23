import { NextResponse } from "next/server";
import { createHospitalTwinApiResponse } from "@/lib/twin-core/hospital-view";
import { dispatchPendingEmailNotifications } from "@/lib/twin-core/email-service";
import {
  getOperationalTwinState,
  synchronizeOperationalTwinState,
} from "@/lib/twin-core/state-store";
import {
  isOxygenDemoPreset,
  type OxygenDemoPreset,
} from "@/lib/twin-core/oxygen-demo";

interface OxygenTransitionBody {
  preset: OxygenDemoPreset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(value: unknown): OxygenTransitionBody | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !isOxygenDemoPreset(value.preset)
  ) {
    return null;
  }
  return { preset: value.preset };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      { status: 400 }
    );
  }

  const input = parseBody(body);
  if (!input) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_OXYGEN_PRESET",
          message:
            "preset must be warning, critical, action-required, or recovery-safe.",
        },
      },
      { status: 400 }
    );
  }

  try {
    const result = synchronizeOperationalTwinState(input.preset);
    await dispatchPendingEmailNotifications();
    const state = getOperationalTwinState();

    return NextResponse.json(
      {
        ...createHospitalTwinApiResponse(state),
        synchronizationSummary: result.summary,
        demoTransition: {
          preset: input.preset,
          source: "Emulated Hospital Telemetry",
          simulationOnly: true,
          physicalActuationExecuted: false,
          modelBoundary:
            "Team Delta prototype thresholds; not certified medical-gas or hospital-engineering safety limits.",
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Error in POST /api/demo/oxygen-transition:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "OXYGEN_DEMO_TRANSITION_FAILED",
          message:
            "Unable to apply the emulated oxygen continuity transition.",
        },
      },
      { status: 500 }
    );
  }
}
