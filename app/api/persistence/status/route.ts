import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { persistenceStatus } from "@/lib/persistence/sqlite-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = getOperationalTwinState();
  return NextResponse.json({
    success: true,
    configured: persistenceStatus(),
    current: state.persistence,
    metadata: {
      localPilotDatabase: true,
      productionDatabase: false,
      containsPatientData: false,
    },
  });
}
