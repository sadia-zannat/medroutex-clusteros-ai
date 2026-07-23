import "server-only";

import type {
  EmailChannelStatus,
  EmailDeliveryRecord,
  OperationalEvent,
  OperationalNotification,
  OperationalRole,
  OperationalTwinState,
} from "./types";
import {
  getOperationalTwinState,
  recordEmailDelivery,
  releaseEmailDeliveryReservations,
  reserveEmailDeliverySequence,
  reservePendingEmailNotifications,
} from "./state-store";
import {
  allConfiguredRecipients,
  buildOperationalAlertEmail,
  createEmailProviderRuntime,
  OPERATIONAL_EMAIL_ROLES,
  recipientsForOperationalRoles,
  type EmailNotificationMessage,
  type EmailProviderRuntime,
  type EmailProviderSendResult,
  type PreparedEmailContent,
} from "./email-provider";

function sourceForProvider(
  provider: EmailDeliveryRecord["provider"],
  status: EmailDeliveryRecord["status"]
): EmailDeliveryRecord["source"] {
  if (provider === "resend-http") return "Resend HTTP Email Provider";
  return status === "disabled"
    ? "Email Alerts Disabled"
    : "MedRouteX Notification Service";
}

function latestDelivery(
  state: OperationalTwinState
): EmailDeliveryRecord | undefined {
  return state.emailDeliveries
    .filter((delivery) => delivery.status !== "suppressed")
    .sort(
      (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt)
    )[0];
}

export function getEmailChannelStatus(
  state: OperationalTwinState = getOperationalTwinState()
): EmailChannelStatus {
  const runtime = createEmailProviderRuntime();
  if (runtime.channelStatus !== "configured") return runtime.channelStatus;
  return latestDelivery(state)?.status === "failed" ? "failed" : "configured";
}

function eventForNotification(
  state: OperationalTwinState,
  notification: OperationalNotification
): OperationalEvent | undefined {
  return state.operationalEvents.find(
    (event) => event.id === notification.eventId
  );
}

function prepareOperationalEmail(
  runtime: EmailProviderRuntime,
  state: OperationalTwinState,
  notification: OperationalNotification
): PreparedEmailContent {
  const event = eventForNotification(state, notification);
  return buildOperationalAlertEmail({
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
    reason: notification.reason,
    timestamp: notification.timestamp,
    affectedInfrastructure: notification.sourceEntityIds,
    scenarioId: event?.scenarioId,
    recommendationId: event?.recommendationId,
    decision:
      typeof event?.metadata.decision === "string"
        ? event.metadata.decision
        : undefined,
    operatorName: event?.operatorName,
    operatorRole: event?.operatorRole,
    sourceLabel: notification.source,
    appBaseUrl: runtime.appBaseUrl,
  });
}

async function safelySend(
  runtime: EmailProviderRuntime,
  message: EmailNotificationMessage
): Promise<EmailProviderSendResult> {
  if (
    runtime.channelStatus === "configured" &&
    message.recipients.length === 0
  ) {
    return {
      status: "not-configured",
      provider: "disabled",
      reason:
        "No role-specific or fallback recipient is configured for this notification.",
    };
  }

  try {
    return await runtime.provider.send(message);
  } catch {
    return {
      status: "failed",
      provider: runtime.provider.id,
      reason:
        "The email provider failed unexpectedly before delivery was confirmed.",
    };
  }
}

function deliveryRecordForNotification(input: {
  notification: OperationalNotification;
  prepared: PreparedEmailContent;
  result: EmailProviderSendResult;
  attemptedAt: string;
  completedAt: string;
  recipientCount: number;
}): EmailDeliveryRecord {
  const { notification, prepared, result } = input;
  return {
    id: `email-${notification.id}`,
    kind: "operational-alert",
    eventId: notification.eventId,
    notificationId: notification.id,
    status: result.status,
    provider: result.provider,
    ...(result.providerMessageId
      ? { providerMessageId: result.providerMessageId }
      : {}),
    attemptedAt: input.attemptedAt,
    completedAt: input.completedAt,
    recipientRoles: [...notification.targetRoles],
    recipientCount: input.recipientCount,
    subject: prepared.subject,
    reason: result.reason,
    correlationId: notification.correlationId,
    dedupeKey: `email:${notification.dedupeKey}`,
    simulationOnly: true,
    source: sourceForProvider(result.provider, result.status),
    stateVersion: notification.stateVersion,
  };
}

export async function dispatchPendingEmailNotifications(): Promise<
  EmailDeliveryRecord[]
> {
  const pending = reservePendingEmailNotifications();
  const deliveries: EmailDeliveryRecord[] = [];

  for (const notification of pending) {
    try {
      const currentState = getOperationalTwinState();
      const currentNotification = currentState.notifications.find(
        (candidate) => candidate.id === notification.id
      );
      const deliveryId = `email-${notification.id}`;
      const deliveryDedupeKey = `email:${notification.dedupeKey}`;
      const alreadyRecorded = currentState.emailDeliveries.some(
        (delivery) =>
          delivery.id === deliveryId ||
          delivery.dedupeKey === deliveryDedupeKey
      );
      const reservationIsCurrent =
        currentState.emailDeliveryReservations.includes(notification.id);
      if (
        !currentNotification ||
        !currentNotification.emailEligible ||
        currentNotification.emailDeliveryStatus !== undefined ||
        alreadyRecorded ||
        !reservationIsCurrent
      ) {
        releaseEmailDeliveryReservations([notification.id]);
        continue;
      }

      const runtime = createEmailProviderRuntime();
      const prepared = prepareOperationalEmail(
        runtime,
        currentState,
        currentNotification
      );
      const recipients = recipientsForOperationalRoles(
        runtime,
        currentNotification.targetRoles
      );
      const attemptedAt = new Date().toISOString();
      const result = await safelySend(runtime, {
        recipients,
        subject: prepared.subject,
        text: prepared.text,
        html: prepared.html,
      });
      const delivery = deliveryRecordForNotification({
        notification: currentNotification,
        prepared,
        result,
        attemptedAt,
        completedAt: new Date().toISOString(),
        recipientCount: recipients.length,
      });

      const recordedState = recordEmailDelivery(delivery);
      if (
        recordedState.emailDeliveries.some(
          (candidate) => candidate.id === delivery.id
        )
      ) {
        deliveries.push(delivery);
      }
    } catch {
      releaseEmailDeliveryReservations([notification.id]);
    }
  }

  return deliveries;
}

function configurationTestContent(
  timestamp: string,
  appBaseUrl: string | undefined
): PreparedEmailContent {
  return buildOperationalAlertEmail({
    severity: "info",
    title: "MedRouteX Email Alert Configuration Test",
    message:
      "This explicit test verifies the configured MedRouteX operational email channel.",
    reason:
      "An operator requested a server-side configuration test; no crisis notification or infrastructure action was created.",
    timestamp,
    affectedInfrastructure: ["MedRouteX notification channel"],
    sourceLabel: "MedRouteX Notification Service",
    appBaseUrl,
  });
}

function configuredRecipientRoles(
  runtime: EmailProviderRuntime
): OperationalRole[] {
  if (runtime.channelStatus !== "configured") return [];
  return OPERATIONAL_EMAIL_ROLES.filter(
    (role) =>
      runtime.roleRecipients[role].length > 0 ||
      runtime.fallbackRecipients.length > 0
  );
}

export async function sendConfigurationTestEmail(): Promise<EmailDeliveryRecord> {
  const sequence = reserveEmailDeliverySequence();
  const state = getOperationalTwinState();
  const runtime = createEmailProviderRuntime();
  const recipients = allConfiguredRecipients(runtime);
  const attemptedAt = new Date().toISOString();
  const prepared = configurationTestContent(
    attemptedAt,
    runtime.appBaseUrl
  );
  const result = await safelySend(runtime, {
    recipients,
    subject: prepared.subject,
    text: prepared.text,
    html: prepared.html,
  });
  const delivery: EmailDeliveryRecord = {
    id: `email-configuration-test-${sequence}`,
    kind: "configuration-test",
    status: result.status,
    provider: result.provider,
    ...(result.providerMessageId
      ? { providerMessageId: result.providerMessageId }
      : {}),
    attemptedAt,
    completedAt: new Date().toISOString(),
    recipientRoles: configuredRecipientRoles(runtime),
    recipientCount: recipients.length,
    subject: prepared.subject,
    reason: result.reason,
    correlationId: `correlation-email-configuration-test-${sequence}`,
    dedupeKey: `email-configuration-test:${sequence}`,
    simulationOnly: true,
    source: sourceForProvider(result.provider, result.status),
    stateVersion: state.version,
  };

  recordEmailDelivery(delivery);
  return delivery;
}
