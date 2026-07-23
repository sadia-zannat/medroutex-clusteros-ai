import { NextResponse } from "next/server";
import type { OperationalRole } from "@/lib/twin-core/types";
import { getEmailChannelStatus } from "@/lib/twin-core/email-service";
import { createNotificationApiResponse } from "@/lib/twin-core/notification-view";
import {
  acknowledgeOperationalNotifications,
  getOperationalTwinState,
} from "@/lib/twin-core/state-store";

const OPERATIONAL_ROLES: readonly OperationalRole[] = [
  "Radiology Operator",
  "Hospital Administrator",
  "Infrastructure Engineer",
  "ICU Operations",
  "Security/Privacy Officer",
];

interface AcknowledgeInput {
  notificationId?: string;
  acknowledgeAll?: true;
  operatorName: string;
  operatorRole: OperationalRole;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperationalRole(value: unknown): value is OperationalRole {
  return (
    typeof value === "string" &&
    OPERATIONAL_ROLES.some((role) => role === value)
  );
}

function parseInput(value: unknown): AcknowledgeInput | null {
  if (!isRecord(value)) return null;
  const operatorName = value.operatorName;
  const operatorRole = value.operatorRole;
  const notificationId = value.notificationId;
  const acknowledgeAll = value.acknowledgeAll;
  const selectsOne =
    typeof notificationId === "string" &&
    notificationId.trim().length > 0 &&
    acknowledgeAll === undefined;
  const selectsAll =
    acknowledgeAll === true && notificationId === undefined;

  if (!selectsOne && !selectsAll) return null;
  if (
    typeof operatorName !== "string" ||
    operatorName.trim().length === 0 ||
    !isOperationalRole(operatorRole)
  ) {
    return null;
  }

  const allowedKeys = new Set([
    "notificationId",
    "acknowledgeAll",
    "operatorName",
    "operatorRole",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;

  return {
    ...(selectsOne
      ? { notificationId: (notificationId as string).trim() }
      : { acknowledgeAll: true as const }),
    operatorName: operatorName.trim(),
    operatorRole,
  };
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

  const input = parseInput(body);
  if (!input) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message:
            "Provide one notificationId or acknowledgeAll=true, plus a non-empty operatorName and supported operatorRole.",
        },
      },
      { status: 400 }
    );
  }

  const before = getOperationalTwinState();
  if (
    input.notificationId &&
    !before.notifications.some(
      (notification) => notification.id === input.notificationId
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "NOTIFICATION_NOT_FOUND",
          message: "The requested notification does not exist.",
        },
      },
      { status: 404 }
    );
  }

  const result = acknowledgeOperationalNotifications(input);
  return NextResponse.json(
    {
      ...createNotificationApiResponse(
        result.state,
        getEmailChannelStatus(result.state)
      ),
      acknowledgedCount: result.acknowledgedCount,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}

