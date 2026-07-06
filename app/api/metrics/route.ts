import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/medroutex/state-store";

export async function GET() {
  const metrics = getMetrics();
  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
