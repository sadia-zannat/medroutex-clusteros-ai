import { NextResponse } from "next/server";
import { sendConfigurationTestEmail } from "@/lib/twin-core/email-service";

export async function POST() {
  const delivery = await sendConfigurationTestEmail();

  if (delivery.status === "sent") {
    return NextResponse.json(
      {
        success: true,
        status: delivery.status,
        delivery,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const errorByStatus = {
    "not-configured": {
      status: 503,
      code: "EMAIL_NOT_CONFIGURED",
      message:
        "The MedRouteX email channel is not fully configured.",
    },
    disabled: {
      status: 503,
      code: "EMAIL_DISABLED",
      message: "The MedRouteX email channel is explicitly disabled.",
    },
    failed: {
      status: 502,
      code: "EMAIL_DELIVERY_FAILED",
      message:
        "The configured email provider did not confirm delivery.",
    },
    suppressed: {
      status: 409,
      code: "EMAIL_SUPPRESSED",
      message: "The configuration test email was suppressed.",
    },
  } as const;
  const error = errorByStatus[delivery.status];

  return NextResponse.json(
    {
      success: false,
      status: delivery.status,
      delivery,
      error: {
        code: error.code,
        message: error.message,
      },
    },
    {
      status: error.status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

