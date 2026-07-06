import { NextResponse } from "next/server";
import { getCurrentState } from "@/lib/medroutex/state-store";
import { generateRouteRecommendations } from "@/lib/medroutex/route-planner";

export async function GET() {
  const state = getCurrentState();
  const recommendations = generateRouteRecommendations(state);
  return NextResponse.json({ recommendations }, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
