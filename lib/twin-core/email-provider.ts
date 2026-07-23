import "server-only";

import type {
  EmailDeliveryRecord,
  EmailDeliveryStatus,
  OperationalEventSeverity,
  OperationalRole,
} from "./types";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_REQUEST_TIMEOUT_MS = 10_000;

const ROLE_EMAIL_ENVIRONMENT_KEYS: Readonly<
  Record<OperationalRole, keyof NodeJS.ProcessEnv>
> = {
  "Radiology Operator": "ALERT_EMAIL_TO_RADIOLOGY",
  "Hospital Administrator": "ALERT_EMAIL_TO_ADMIN",
  "Infrastructure Engineer": "ALERT_EMAIL_TO_INFRASTRUCTURE",
  "ICU Operations": "ALERT_EMAIL_TO_ICU",
  "Security/Privacy Officer": "ALERT_EMAIL_TO",
};

export const OPERATIONAL_EMAIL_ROLES: readonly OperationalRole[] = [
  "Radiology Operator",
  "Hospital Administrator",
  "Infrastructure Engineer",
  "ICU Operations",
  "Security/Privacy Officer",
];

export type EmailProviderTerminalStatus = Extract<
  EmailDeliveryStatus,
  "sent" | "failed" | "disabled" | "not-configured"
>;

export interface EmailNotificationMessage {
  readonly recipients: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface EmailProviderSendResult {
  readonly status: EmailProviderTerminalStatus;
  readonly provider: EmailDeliveryRecord["provider"];
  readonly providerMessageId?: string;
  readonly reason: string;
}

export interface EmailNotificationProvider {
  readonly id: EmailDeliveryRecord["provider"];
  send(message: EmailNotificationMessage): Promise<EmailProviderSendResult>;
}

export interface OperationalEmailContentInput {
  readonly severity: OperationalEventSeverity;
  readonly title: string;
  readonly message: string;
  readonly reason: string;
  readonly timestamp: string;
  readonly affectedInfrastructure: readonly string[];
  readonly scenarioId?: string;
  readonly recommendationId?: string;
  readonly decision?: string;
  readonly operatorName?: string;
  readonly operatorRole?: string;
  readonly sourceLabel: string;
  readonly appBaseUrl?: string;
}

export interface PreparedEmailContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

interface ParsedAddressList {
  readonly addresses: string[];
  readonly valid: boolean;
}

interface EmailRuntimeBase {
  readonly appBaseUrl?: string;
  readonly fallbackRecipients: readonly string[];
  readonly roleRecipients: Readonly<
    Record<OperationalRole, readonly string[]>
  >;
}

export interface ConfiguredEmailRuntime extends EmailRuntimeBase {
  readonly channelStatus: "configured";
  readonly provider: ResendHttpEmailProvider;
  readonly from: string;
  readonly reason: string;
}

export interface UnavailableEmailRuntime extends EmailRuntimeBase {
  readonly channelStatus: "disabled" | "not-configured";
  readonly provider: DisabledEmailProvider;
  readonly reason: string;
}

export type EmailProviderRuntime =
  | ConfiguredEmailRuntime
  | UnavailableEmailRuntime;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMailbox(value: string): string {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>$/);
  return angleMatch?.[1]?.trim() ?? trimmed;
}

function isValidEmailAddress(value: string): boolean {
  const mailbox = extractMailbox(value);
  return (
    mailbox.length <= 254 &&
    !/[\r\n]/.test(value) &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mailbox)
  );
}

function parseAddressList(value: string | undefined): ParsedAddressList {
  if (value === undefined || value.trim().length === 0) {
    return { addresses: [], valid: true };
  }

  const addresses = value
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address.length > 0);
  return {
    addresses,
    valid:
      addresses.length > 0 &&
      addresses.every((address) => isValidEmailAddress(address)),
  };
}

function deduplicateAddresses(addresses: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduplicated: string[] = [];
  for (const address of addresses) {
    const key = extractMailbox(address).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduplicated.push(address);
  }
  return deduplicated;
}

function emptyRoleRecipients(): Record<OperationalRole, readonly string[]> {
  return {
    "Radiology Operator": [],
    "Hospital Administrator": [],
    "Infrastructure Engineer": [],
    "ICU Operations": [],
    "Security/Privacy Officer": [],
  };
}

function validAppBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function validApiKey(value: string | undefined): string | null {
  const key = value?.trim();
  if (!key || !/^re_[A-Za-z0-9_-]+$/.test(key)) return null;
  return key;
}

function enabledFlag(
  value: string | undefined
): "enabled" | "disabled" | "not-configured" {
  if (value === undefined || value.trim().length === 0) {
    return "not-configured";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return "enabled";
  if (normalized === "false") return "disabled";
  return "not-configured";
}

export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function severityLabel(severity: OperationalEventSeverity): string {
  return severity.replaceAll("-", " ").toUpperCase();
}

function optionalPlainTextLine(
  label: string,
  value: string | undefined
): string[] {
  return value ? [`${label}: ${value}`] : [];
}

function optionalHtmlRow(label: string, value: string | undefined): string {
  if (!value) return "";
  return `<tr><th align="left">${escapeEmailHtml(label)}</th><td>${escapeEmailHtml(
    value
  )}</td></tr>`;
}

export function buildOperationalAlertEmail(
  input: OperationalEmailContentInput
): PreparedEmailContent {
  const infrastructure =
    input.affectedInfrastructure.length > 0
      ? input.affectedInfrastructure
      : ["Hospital infrastructure context unavailable"];
  const dashboardLink = input.appBaseUrl
    ? `${input.appBaseUrl}/#dashboard`
    : undefined;
  const subject = sanitizeSubject(
    `[MedRouteX] ${severityLabel(input.severity)}: ${input.title}`
  );
  const text = [
    "MedRouteX Operational Alert",
    `Severity: ${severityLabel(input.severity)}`,
    `Title: ${input.title}`,
    `Explanation: ${input.message}`,
    `Reason: ${input.reason}`,
    `Timestamp: ${input.timestamp}`,
    `Affected infrastructure: ${infrastructure.join(", ")}`,
    ...optionalPlainTextLine("Scenario", input.scenarioId),
    ...optionalPlainTextLine("Recommendation", input.recommendationId),
    ...optionalPlainTextLine("Decision", input.decision),
    ...optionalPlainTextLine("Operator", input.operatorName),
    ...optionalPlainTextLine("Operator role", input.operatorRole),
    `Source: ${input.sourceLabel}`,
    "PHI-Zero: infrastructure-only notice; no patient identity or bedside treatment information.",
    "Mode: Emulated / Simulation Only. MedRouteX provides decision support and executes no real actuator action.",
    ...optionalPlainTextLine("Dashboard", dashboardLink),
  ].join("\n");
  const infrastructureHtml = infrastructure
    .map((entityId) => `<li>${escapeEmailHtml(entityId)}</li>`)
    .join("");
  const dashboardHtml = dashboardLink
    ? `<p><a href="${escapeEmailHtml(
        dashboardLink
      )}">Open the MedRouteX dashboard</a></p>`
    : "";
  const html = [
    "<!doctype html>",
    '<html><body style="font-family:Arial,sans-serif;color:#0f172a">',
    "<h1>MedRouteX Operational Alert</h1>",
    `<p><strong>${escapeEmailHtml(
      severityLabel(input.severity)
    )}</strong></p>`,
    `<h2>${escapeEmailHtml(input.title)}</h2>`,
    `<p>${escapeEmailHtml(input.message)}</p>`,
    `<p><strong>Reason:</strong> ${escapeEmailHtml(input.reason)}</p>`,
    '<table cellpadding="6" cellspacing="0" border="0">',
    `<tr><th align="left">Timestamp</th><td>${escapeEmailHtml(
      input.timestamp
    )}</td></tr>`,
    optionalHtmlRow("Scenario", input.scenarioId),
    optionalHtmlRow("Recommendation", input.recommendationId),
    optionalHtmlRow("Decision", input.decision),
    optionalHtmlRow("Operator", input.operatorName),
    optionalHtmlRow("Operator role", input.operatorRole),
    `<tr><th align="left">Source</th><td>${escapeEmailHtml(
      input.sourceLabel
    )}</td></tr>`,
    "</table>",
    "<h3>Affected infrastructure</h3>",
    `<ul>${infrastructureHtml}</ul>`,
    "<p><strong>PHI-Zero:</strong> infrastructure-only notice; no patient identity or bedside treatment information.</p>",
    "<p><strong>Emulated / Simulation Only:</strong> MedRouteX provides decision support and executes no real actuator action.</p>",
    dashboardHtml,
    "</body></html>",
  ].join("");

  return { subject, text, html };
}

export class ResendHttpEmailProvider implements EmailNotificationProvider {
  readonly id = "resend-http" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(
    message: EmailNotificationMessage
  ): Promise<EmailProviderSendResult> {
    if (message.recipients.length === 0) {
      return {
        status: "failed",
        provider: this.id,
        reason: "No valid recipient was selected for this email alert.",
      };
    }

    try {
      const response = await fetch(RESEND_EMAIL_ENDPOINT, {
        method: "POST",
        signal: AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [...message.recipients],
          subject: sanitizeSubject(message.subject),
          text: message.text,
          html: message.html,
        }),
      });
      const responseBody: unknown = await response.json().catch(() => null);
      const providerMessageId =
        isRecord(responseBody) && typeof responseBody.id === "string"
          ? responseBody.id.trim()
          : "";

      if (!response.ok) {
        return {
          status: "failed",
          provider: this.id,
          reason: `Resend HTTP delivery failed with status ${response.status}.`,
        };
      }
      if (providerMessageId.length === 0) {
        return {
          status: "failed",
          provider: this.id,
          reason:
            "Resend returned a successful HTTP response without a provider message ID.",
        };
      }

      return {
        status: "sent",
        provider: this.id,
        providerMessageId,
        reason: "Resend confirmed email delivery acceptance.",
      };
    } catch {
      return {
        status: "failed",
        provider: this.id,
        reason: "The Resend HTTP request failed before delivery was confirmed.",
      };
    }
  }
}

export class DisabledEmailProvider implements EmailNotificationProvider {
  readonly id = "disabled" as const;

  constructor(
    private readonly status: Extract<
      EmailProviderTerminalStatus,
      "disabled" | "not-configured"
    >,
    private readonly explanation: string
  ) {}

  async send(): Promise<EmailProviderSendResult> {
    return {
      status: this.status,
      provider: this.id,
      reason: this.explanation,
    };
  }
}

export function createEmailProviderRuntime(
  environment: NodeJS.ProcessEnv = process.env
): EmailProviderRuntime {
  const appBaseUrl = validAppBaseUrl(environment.APP_BASE_URL);
  const flag = enabledFlag(environment.EMAIL_ALERTS_ENABLED);
  const fallback = parseAddressList(environment.ALERT_EMAIL_TO);
  const parsedByRole = OPERATIONAL_EMAIL_ROLES.map((role) => {
    const environmentKey = ROLE_EMAIL_ENVIRONMENT_KEYS[role];
    return [role, parseAddressList(environment[environmentKey])] as const;
  });
  const configuredListsAreValid =
    fallback.valid && parsedByRole.every(([, parsed]) => parsed.valid);
  const fallbackRecipients = deduplicateAddresses(fallback.addresses);
  const roleRecipients = emptyRoleRecipients();

  for (const [role, parsed] of parsedByRole) {
    roleRecipients[role] = deduplicateAddresses(parsed.addresses);
  }

  if (flag === "disabled") {
    const reason = "Email alerts are explicitly disabled by EMAIL_ALERTS_ENABLED.";
    return {
      channelStatus: "disabled",
      provider: new DisabledEmailProvider("disabled", reason),
      reason,
      fallbackRecipients,
      roleRecipients,
      ...(appBaseUrl ? { appBaseUrl } : {}),
    };
  }

  const apiKey = validApiKey(environment.RESEND_API_KEY);
  const from = environment.ALERT_EMAIL_FROM?.trim();
  const fromIsValid = from !== undefined && isValidEmailAddress(from);
  const recipientCount = deduplicateAddresses([
    ...fallbackRecipients,
    ...Object.values(roleRecipients).flat(),
  ]).length;
  const configurationIsComplete =
    flag === "enabled" &&
    apiKey !== null &&
    fromIsValid &&
    configuredListsAreValid &&
    recipientCount > 0;

  if (!configurationIsComplete) {
    const reason =
      "Email alerts are not configured. Enable EMAIL_ALERTS_ENABLED and provide a valid RESEND_API_KEY, ALERT_EMAIL_FROM, and at least one role or fallback recipient.";
    return {
      channelStatus: "not-configured",
      provider: new DisabledEmailProvider("not-configured", reason),
      reason,
      fallbackRecipients: [],
      roleRecipients: emptyRoleRecipients(),
      ...(appBaseUrl ? { appBaseUrl } : {}),
    };
  }

  return {
    channelStatus: "configured",
    provider: new ResendHttpEmailProvider(apiKey, from),
    from,
    reason: "Email alerts are configured for the Resend HTTP provider.",
    fallbackRecipients,
    roleRecipients,
    ...(appBaseUrl ? { appBaseUrl } : {}),
  };
}

export function recipientsForOperationalRoles(
  runtime: EmailProviderRuntime,
  roles: readonly OperationalRole[]
): string[] {
  if (runtime.channelStatus !== "configured") return [];

  return deduplicateAddresses(
    roles.flatMap((role) => {
      const roleSpecific = runtime.roleRecipients[role];
      return roleSpecific.length > 0
        ? [...roleSpecific]
        : [...runtime.fallbackRecipients];
    })
  );
}

export function allConfiguredRecipients(
  runtime: EmailProviderRuntime
): string[] {
  if (runtime.channelStatus !== "configured") return [];
  return deduplicateAddresses([
    ...runtime.fallbackRecipients,
    ...Object.values(runtime.roleRecipients).flat(),
  ]);
}
