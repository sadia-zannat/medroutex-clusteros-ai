import { NextResponse } from "next/server";
import {
  MAX_UNIFIED_HISTORY_LIMIT,
  queryUnifiedHistory,
} from "@/lib/twin-core/history";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const state = getOperationalTwinState();
  const searchParams = new URL(request.url).searchParams;
  const result = queryUnifiedHistory(state, {
    kind: searchParams.get("kind"),
    severity: searchParams.get("severity"),
    domain: searchParams.get("domain"),
    status: searchParams.get("status"),
    search: searchParams.get("search"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    limit: searchParams.get("limit"),
    section: searchParams.get("section"),
  });

  return NextResponse.json(
    {
      success: true,
      records: result.records,
      returned: result.returned,
      matched: result.matched,
      available: result.available,
      limit: result.limit,
      newestFirst: true,
      filters: result.filters,
      invalidFilters: result.invalidFilters,
      summary: result.summary,
      sectionCounts: result.sectionCounts,
      metadata: {
        stateVersion: state.version,
        simulationOnly: state.simulationOnly,
        canonicalSource: "MedRouteX Hospital/Operational Twin",
        maxLimit: MAX_UNIFIED_HISTORY_LIMIT,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
