import { NextResponse } from "next/server";
import { getCurrentState } from "@/lib/medroutex/state-store";
import { simulateDigitalTwin } from "@/lib/medroutex/digital-twin";

export async function GET() {
  const state = getCurrentState();
  const result = simulateDigitalTwin(state);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
