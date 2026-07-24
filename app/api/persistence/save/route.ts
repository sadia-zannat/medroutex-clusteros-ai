import { NextResponse } from "next/server";
import { getOperationalTwinState, replaceOperationalTwinState } from "@/lib/twin-core/state-store";
import { persistOperationalTwinState } from "@/lib/persistence/sqlite-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const state = getOperationalTwinState();
  const persistence = persistOperationalTwinState(state, "manual-api-save");
  const next = replaceOperationalTwinState({ ...state, persistence });
  return NextResponse.json({
    success: persistence.lastError === null && persistence.mode === "sqlite-local",
    persistence: next.persistence,
    stateVersion: next.version,
  }, { status: persistence.lastError ? 500 : persistence.mode === "memory-only" ? 409 : 200 });
}
