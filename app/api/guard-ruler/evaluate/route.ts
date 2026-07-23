import { NextResponse } from "next/server";
import {
  GuardRulerEvaluationError,
} from "@/lib/guard-ruler/engine";
import { createGuardRulerStateApiResponse } from "@/lib/guard-ruler/view";
import { dispatchPendingEmailNotifications } from "@/lib/twin-core/email-service";
import {
  evaluateGuardRulerState,
  getOperationalTwinState,
  type GuardRulerEvaluationInput,
} from "@/lib/twin-core/state-store";
import type { DecisionEvaluationProfile } from "@/lib/twin-core/types";

export const dynamic = "force-dynamic";

const REQUEST_FIELDS = new Set([
  "workloadId",
  "recommendationId",
  "evaluationProfile",
]);

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function optionalIdentifier(
  value: unknown
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    return null;
  }
  return normalized;
}

function evaluationProfile(
  value: unknown
): DecisionEvaluationProfile | undefined | null {
  if (value === undefined) return undefined;
  if (value === "canonical" || value === "no-safe-route-test") {
    return value;
  }
  return null;
}

function parseRequestBody(
  value: unknown
): GuardRulerEvaluationInput | null {
  if (!isRecord(value)) return null;
  if (
    Object.keys(value).some((field) => !REQUEST_FIELDS.has(field))
  ) {
    return null;
  }

  const workloadId = optionalIdentifier(value.workloadId);
  const recommendationId = optionalIdentifier(
    value.recommendationId
  );
  const profile = evaluationProfile(value.evaluationProfile);
  if (
    workloadId === null ||
    recommendationId === null ||
    profile === null
  ) {
    return null;
  }

  return {
    ...(workloadId ? { workloadId } : {}),
    ...(recommendationId ? { recommendationId } : {}),
    ...(profile ? { evaluationProfile: profile } : {}),
  };
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim().length > 0) {
      body = JSON.parse(rawBody) as unknown;
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_GUARD_RULER_REQUEST",
          message: "Request body must be valid JSON.",
        },
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  const input = parseRequestBody(body);
  if (!input) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_GUARD_RULER_REQUEST",
          message:
            "Only validated workloadId, recommendationId, and evaluationProfile fields are accepted; client telemetry is never accepted.",
        },
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (
    input.evaluationProfile === "no-safe-route-test" &&
    (process.env.NODE_ENV === "production" ||
      request.headers.get("x-medroutex-test-mode") !== "true")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "TEST_PATHWAY_DISABLED",
          message:
            "The deterministic no-safe-route pathway is available only in non-production test mode.",
        },
      },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  try {
    const result = evaluateGuardRulerState(input);
    if (result.outcome === "applied") {
      await dispatchPendingEmailNotifications();
    }
    const state = getOperationalTwinState();
    return NextResponse.json(
      createGuardRulerStateApiResponse(state, result.outcome),
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (error instanceof GuardRulerEvaluationError) {
      const status =
        error.code === "WORKLOAD_NOT_FOUND"
          ? 404
          : error.code === "TEST_PROFILE_REQUIRES_CRISIS"
            ? 409
            : 400;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    console.error("Error in POST /api/guard-ruler/evaluate:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GUARD_RULER_EVALUATION_FAILED",
          message:
            "Unable to evaluate safe plans from the canonical Hospital Twin.",
        },
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
