import { NextResponse } from "next/server";
import { getCurrentState } from "@/lib/medroutex/state-store";

export async function GET() {
  const state = getCurrentState();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
