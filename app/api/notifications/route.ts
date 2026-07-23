import { NextResponse } from "next/server";
import { getEmailChannelStatus } from "@/lib/twin-core/email-service";
import { createNotificationApiResponse } from "@/lib/twin-core/notification-view";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = getOperationalTwinState();
  const searchParams = new URL(request.url).searchParams;
  const response = createNotificationApiResponse(
    state,
    getEmailChannelStatus(state),
    {
      severity: searchParams.get("severity"),
      domain: searchParams.get("domain"),
      category: searchParams.get("category"),
      unreadOnly: searchParams.get("unreadOnly"),
      limit: searchParams.get("limit"),
    }
  );

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

