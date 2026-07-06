import { NextResponse } from "next/server";
import { runCurrentScenario } from "@/lib/medroutex/state-store";

export async function POST() {
  const state = runCurrentScenario();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
