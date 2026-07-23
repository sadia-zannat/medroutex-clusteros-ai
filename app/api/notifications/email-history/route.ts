import { NextResponse } from "next/server";
import { createEmailHistoryApiResponse } from "@/lib/twin-core/notification-view";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const state = getOperationalTwinState();

  return NextResponse.json(
    createEmailHistoryApiResponse(
      state,
      searchParams.get("status"),
      searchParams.get("limit")
    ),
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
