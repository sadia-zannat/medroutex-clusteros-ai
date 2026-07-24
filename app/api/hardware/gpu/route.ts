import { NextResponse } from "next/server";
import { getOperationalTwinState } from "@/lib/twin-core/state-store";
import { NVIDIA_SMI_COMMAND } from "@/lib/hardware/nvidia-smi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = getOperationalTwinState();
  return NextResponse.json(
    {
      success: true,
      telemetry: state.liveHardwareGpu,
      metadata: {
        sourceLabel: "LIVE LOCAL HARDWARE TELEMETRY",
        provider: "nvidia-smi",
        command: NVIDIA_SMI_COMMAND,
        simulationProtected: true,
        simulationNodesUnaffected: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
