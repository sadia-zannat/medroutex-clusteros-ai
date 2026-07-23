import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { createHospitalTwinApiResponse } from "@/lib/twin-core/hospital-view";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getOperationalTwinState();
  return NextResponse.json(createHospitalTwinApiResponse(state), {
    headers: { "Cache-Control": "no-store" },
  });
}
