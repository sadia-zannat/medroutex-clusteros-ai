import { NextResponse } from "next/server";
import type { TwinApprovalDecision } from "@/lib/twin-core/types";
import {
  ApprovalDecisionError,
  applyApprovalDecision,
  getOperationalTwinSummary,
  type ApprovalDecisionInput,
} from "@/lib/twin-core/state-store";

interface ApprovalRequestBody {
  decision: TwinApprovalDecision;
  operatorName: string;
  operatorRole: string;
  recommendationId: string;
}

interface ApprovalErrorResponse {
  success: false;
  error: {
    code: "INVALID_REQUEST" | "INTERNAL_ERROR" | ApprovalDecisionError["code"];
    message: string;
    currentDecision?: TwinApprovalDecision;
  };
}

const APPROVAL_REQUEST_FIELDS: ReadonlySet<keyof ApprovalRequestBody> = new Set([
  "decision",
  "operatorName",
  "operatorRole",
  "recommendationId",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApprovalRequest(value: unknown): ApprovalDecisionInput | null {
  if (!isRecord(value)) return null;

  const keys = Object.keys(value);
  if (
    keys.length !== APPROVAL_REQUEST_FIELDS.size ||
    keys.some((key) => !APPROVAL_REQUEST_FIELDS.has(key as keyof ApprovalRequestBody))
  ) {
    return null;
  }

  const { decision, operatorName, operatorRole, recommendationId } = value;
  if (decision !== "approve" && decision !== "reject") return null;
  if (typeof operatorName !== "string" || operatorName.trim().length === 0) return null;
  if (typeof operatorRole !== "string" || operatorRole.trim().length === 0) return null;
  if (typeof recommendationId !== "string" || recommendationId.trim().length === 0) return null;

  return {
    decision,
    operatorName: operatorName.trim(),
    operatorRole: operatorRole.trim(),
    recommendationId: recommendationId.trim(),
  };
}

function errorResponse(
  status: number,
  code: ApprovalErrorResponse["error"]["code"],
  message: string,
  currentDecision?: TwinApprovalDecision
) {
  const body: ApprovalErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(currentDecision ? { currentDecision } : {}),
    },
  };

  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Request body must be valid JSON."
    );
  }

  const input = parseApprovalRequest(body);
  if (input === null) {
    return errorResponse(
      400,
      "INVALID_REQUEST",
      "Request must contain only decision, operatorName, operatorRole, and recommendationId with valid non-empty values."
    );
  }

  try {
    const result = applyApprovalDecision(input);
    const summary = getOperationalTwinSummary();

    return NextResponse.json({
      success: true,
      outcome: result.outcome,
      data: result.state,
      summary,
      approval: result.approval,
      auditEvent: result.auditEvent,
      metadata: {
        simulationOnly: true,
        migrationExecuted: false,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ApprovalDecisionError) {
      const status = error.code === "APPROVAL_AUDIT_MISSING" ? 500 : 409;
      return errorResponse(status, error.code, error.message, error.currentDecision);
    }

    console.error("Error in POST /api/operational-twin/approval:", error);
    return errorResponse(
      500,
      "INTERNAL_ERROR",
      "Unable to apply the approval decision."
    );
  }
}
