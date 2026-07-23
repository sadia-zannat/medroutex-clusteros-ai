import { NextResponse } from "next/server";
import { getScenarioCatalog } from "@/lib/twin-core/scenario-catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/hospital-twin/scenarios
 * 
 * Phase 1: Returns the deterministic scenario catalog.
 * Phase 2 will add scenario mutation endpoints.
 */
export async function GET() {
  const catalog = getScenarioCatalog();
  
  return NextResponse.json(
    {
      success: true,
      catalog,
      metadata: {
        phase: 1,
        readOnly: true,
        mutationNotImplemented: true,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
