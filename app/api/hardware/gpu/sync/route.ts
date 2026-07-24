import { NextResponse } from "next/server";
import { collectNvidiaGpuTelemetry } from "@/lib/hardware/nvidia-smi";
import { updateLiveHardwareGpu } from "@/lib/twin-core/state-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const telemetry = await collectNvidiaGpuTelemetry();
  const state = updateLiveHardwareGpu(telemetry);
  return NextResponse.json(
    {
      success: telemetry.connectionStatus === "connected",
      telemetry,
      stateVersion: state.version,
      metadata: {
        sourceLabel: "LIVE LOCAL HARDWARE TELEMETRY",
        simulationProtected: true,
        simulationNodesUnaffected: true,
        automaticExecution: false,
      },
    },
    {
      status: telemetry.connectionStatus === "connected" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
