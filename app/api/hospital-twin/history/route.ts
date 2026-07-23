import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { MAX_HOSPITAL_TWIN_SNAPSHOTS } from "@/lib/twin-core/resilience";

export const dynamic = "force-dynamic";

const DEFAULT_HISTORY_LIMIT = 20;

function safeHistoryLimit(value: string | null): number {
  if (value === null) return DEFAULT_HISTORY_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_LIMIT;
  return Math.max(
    1,
    Math.min(MAX_HOSPITAL_TWIN_SNAPSHOTS, Math.trunc(parsed))
  );
}

export async function GET(request: Request) {
  const state = getOperationalTwinState();
  const limit = safeHistoryLimit(new URL(request.url).searchParams.get("limit"));
  const snapshots = [...state.snapshots].reverse().slice(0, limit);

  return NextResponse.json(
    {
      success: true,
      snapshots,
      returned: snapshots.length,
      available: state.snapshots.length,
      limit,
      newestFirst: true,
      maxSnapshots: MAX_HOSPITAL_TWIN_SNAPSHOTS,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
