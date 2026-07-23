import { NextResponse } from "next/server";
import {
  getOperationalTwinState,
  replaceOperationalTwinState,
} from "@/lib/twin-core/state-store";
import {
  executeScenarioTransition,
  getIcuContinuityAssessment,
  getIcuOperationalRecommendation,
} from "@/lib/twin-core/scenario-engine";
import type { OperationalRole } from "@/lib/twin-core/types";

export const dynamic = "force-dynamic";

const OPERATIONAL_ROLES: readonly OperationalRole[] = [
  "Radiology Operator",
  "Hospital Administrator",
  "Infrastructure Engineer",
  "ICU Operations",
  "Security/Privacy Officer",
];

interface ScenarioRunRequest {
  scenarioId: string;
  operatorName?: string;
  operatorRole?: string;
}

const SCENARIO_RUN_FIELDS: ReadonlySet<keyof ScenarioRunRequest> = new Set([
  "scenarioId",
  "operatorName",
  "operatorRole",
]);

/**
 * POST /api/hospital-twin/scenarios/run
 * 
 * Phase 2A: Execute a scenario transition.
 * 
 * Accepted body:
 * {
 *   "scenarioId": "validated catalog ID",
 *   "operatorName": "optional string",
 *   "operatorRole": "optional validated role"
 * }
 * 
 * Returns scenario execution outcome with canonical state version,
 * hospital health/resilience summary, domain continuity assessment,
 * events created, notifications created, snapshot summary,
 * human approval requirement, and physicalExecutionPerformed false.
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    // Validate request body structure
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_SCENARIO_INPUT",
            message: "Request body must be a JSON object",
          },
        },
        { status: 400 }
      );
    }

    const bodyRecord = body as Record<string, unknown>;

    // Reject unknown top-level fields
    const keys = Object.keys(bodyRecord);
    const hasUnknownField = keys.some(
      (key) => !SCENARIO_RUN_FIELDS.has(key as keyof ScenarioRunRequest)
    );
    if (hasUnknownField) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_SCENARIO_INPUT",
            message: "Request must contain only scenarioId, operatorName, and operatorRole fields",
          },
        },
        { status: 400 }
      );
    }

    // Validate scenarioId
    if (!bodyRecord.scenarioId || typeof bodyRecord.scenarioId !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_SCENARIO_INPUT",
            message: "scenarioId is required and must be a string",
          },
        },
        { status: 400 }
      );
    }

    // Validate operatorRole if provided
    if (
      bodyRecord.operatorRole !== undefined &&
      typeof bodyRecord.operatorRole === "string"
    ) {
      if (!OPERATIONAL_ROLES.includes(bodyRecord.operatorRole as OperationalRole)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "UNSUPPORTED_SCENARIO_INPUT",
              message: "operatorRole must be a valid operational role",
            },
          },
          { status: 400 }
        );
      }
    }

    const scenarioId = bodyRecord.scenarioId as string;

    // Get current state
    const currentState = getOperationalTwinState();

    // Execute scenario transition
    const executionResult = executeScenarioTransition(
      currentState,
      scenarioId
    );

    // If execution failed or was idempotent, return result without mutating state
    if (!executionResult.success || executionResult.outcome === "idempotent") {
      return NextResponse.json(
        {
          success: executionResult.success,
          outcome: executionResult.outcome,
          executionResult,
          icuAssessment: getIcuContinuityAssessment(currentState),
          icuRecommendation: getIcuOperationalRecommendation(currentState),
        },
        {
          headers: { "Cache-Control": "no-store" },
          status: executionResult.success ? 200 : 400,
        }
      );
    }

    // Apply the full state from the execution result
    const newState = executionResult.fullState;
    if (!newState) {
      return NextResponse.json(
        {
          success: false,
          error: "Internal error: full state not returned from scenario execution",
        },
        { status: 500 }
      );
    }

    replaceOperationalTwinState(newState);

    // Get ICU assessment and recommendation if applicable
    const icuAssessment = getIcuContinuityAssessment(newState);
    const icuRecommendation = getIcuOperationalRecommendation(newState);

    return NextResponse.json(
      {
        success: true,
        outcome: executionResult.outcome,
        executionResult,
        icuAssessment,
        icuRecommendation,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("Error in POST /api/hospital-twin/scenarios/run:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute scenario transition",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
