import { NextResponse } from "next/server";
import { createDecisionEvidencePackage } from "@/lib/twin-core/decision-evidence";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeFilenameTimestamp(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-");
}

export async function GET() {
  const state = getOperationalTwinState();
  const generatedAt = new Date().toISOString();
  const evidence = createDecisionEvidencePackage(state, generatedAt);
  const filename = `medroutex-decision-evidence-v${state.version}-${safeFilenameTimestamp(generatedAt)}.json`;

  return new NextResponse(`${JSON.stringify(evidence, null, 2)}\n`, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
