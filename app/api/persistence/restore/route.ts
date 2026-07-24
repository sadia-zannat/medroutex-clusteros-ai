import { NextResponse } from "next/server";
import { replaceOperationalTwinState } from "@/lib/twin-core/state-store";
import { restoreLatestOperationalTwinState } from "@/lib/persistence/sqlite-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const restored = restoreLatestOperationalTwinState();
  if (!restored.state) {
    return NextResponse.json(
      { success: false, persistence: restored.status, error: "No valid SQLite state snapshot is available." },
      { status: restored.status.lastError ? 500 : 404 }
    );
  }
  const state = replaceOperationalTwinState(restored.state);
  return NextResponse.json({ success: true, stateVersion: state.version, persistence: state.persistence });
}
