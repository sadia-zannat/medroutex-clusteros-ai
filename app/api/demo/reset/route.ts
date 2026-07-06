import { NextResponse } from "next/server";
import { resetCurrentState } from "@/lib/medroutex/state-store";

export async function POST() {
  const state = resetCurrentState();
  return NextResponse.json(state, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
