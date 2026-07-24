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
export const runtime = "nodejs";

const OPERATIONAL_ROLES: readonly OperationalRole[] = [
  "Radiology Operator",
  "Hospital Administrator",
  "Infrastructure Engineer",
  "ICU Operations",
  "Security/Privacy Officer",
];

const ALLOWED_FIELDS = new Set(["scenarioId", "operatorName", "operatorRole"]);

function invalid(message: string, code = "UNSUPPORTED_SCENARIO_INPUT", status = 400) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return invalid("Request body must be a JSON object.");
    }
    const record = body as Record<string, unknown>;
    const unknownFields = Object.keys(record).filter((key) => !ALLOWED_FIELDS.has(key));
    if (unknownFields.length > 0) {
      return invalid(`Unsupported scenario input fields: ${unknownFields.join(", ")}.`);
    }
    if (typeof record.scenarioId !== "string" || record.scenarioId.trim() === "") {
      return invalid("scenarioId is required and must be a non-empty string.");
    }
    if (
      record.operatorName !== undefined &&
      (typeof record.operatorName !== "string" || record.operatorName.trim().length > 120)
    ) {
      return invalid("operatorName must be a string of at most 120 characters.");
    }
    if (
      record.operatorRole !== undefined &&
      (typeof record.operatorRole !== "string" ||
        !OPERATIONAL_ROLES.includes(record.operatorRole as OperationalRole))
    ) {
      return invalid("operatorRole must be a valid operational role.");
    }

    const currentState = getOperationalTwinState();
    const executionResult = executeScenarioTransition(
      currentState,
      record.scenarioId
    );

    if (!executionResult.success) {
      const resetRequired = executionResult.error?.startsWith("RESET_REQUIRED") ?? false;
      return NextResponse.json(
        {
          success: false,
          outcome: executionResult.outcome,
          executionResult,
          error: {
            code: resetRequired ? "RESET_REQUIRED" : "SCENARIO_EXECUTION_REJECTED",
            message: executionResult.error,
          },
        },
        {
          status: resetRequired ? 409 : 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const nextState = executionResult.fullState ?? currentState;
    if (executionResult.fullState) replaceOperationalTwinState(nextState);

    return NextResponse.json(
      {
        success: true,
        outcome: executionResult.outcome,
        executionResult: {
          ...executionResult,
          fullState: undefined,
        },
        runtimeState: nextState.scenarioRuntime,
        activeIncidents: nextState.activeIncidents,
        domainAssessments: nextState.scenarioRuntime.domainAssessments,
        rootCauses: nextState.scenarioRuntime.rootCauses,
        cascadePaths: nextState.scenarioRuntime.cascadePaths,
        multiDomainPlanSet: nextState.scenarioRuntime.multiDomainPlanSet,
        icuAssessment: getIcuContinuityAssessment(nextState),
        icuRecommendation: getIcuOperationalRecommendation(nextState),
        metadata: {
          emulatedHospitalScenario: true,
          phiMode: "PHI-Zero",
          infrastructureDecisionSupportOnly: true,
          automaticExecution: false,
          operatorName: typeof record.operatorName === "string" ? record.operatorName.trim() : null,
          operatorRole: typeof record.operatorRole === "string" ? record.operatorRole : null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SCENARIO_EXECUTION_FAILED",
          message: error instanceof Error ? error.message : "Failed to execute scenario transition.",
        },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
