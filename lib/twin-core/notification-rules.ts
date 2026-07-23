import type {
  OperationalEvent,
  OperationalEventDomain,
  OperationalEventSeverity,
  OperationalRole,
} from "./types";

export interface NotificationRuleConfiguration {
  warningEmailAlertsEnabled: boolean;
  recoveryEmailAlertsEnabled: boolean;
}

export interface NotificationRuleDecision {
  visible: boolean;
  severity: OperationalEventSeverity;
  targetRoles: OperationalRole[];
  emailEligible: boolean;
  dedupeKey: string;
  cooldownKey: string;
  cooldownSeconds: number;
  explanation: string;
}

export const DEFAULT_NOTIFICATION_RULE_CONFIGURATION: NotificationRuleConfiguration =
  {
    warningEmailAlertsEnabled: false,
    recoveryEmailAlertsEnabled: false,
  };

const DOMAIN_COOLDOWN_SECONDS: Readonly<
  Record<OperationalEventDomain, number>
> = {
  compute: 15 * 60,
  icu: 20 * 60,
  oxygen: 30 * 60,
  power: 20 * 60,
  network: 15 * 60,
  privacy: 30 * 60,
  approval: 0,
  simulation: 10 * 60,
  synchronization: 10 * 60,
  connector: 15 * 60,
  recovery: 30 * 60,
  system: 10 * 60,
};

const DEFAULT_ROLES_BY_DOMAIN: Readonly<
  Record<OperationalEventDomain, readonly OperationalRole[]>
> = {
  compute: ["Radiology Operator", "Infrastructure Engineer"],
  icu: ["ICU Operations", "Hospital Administrator"],
  oxygen: ["ICU Operations", "Infrastructure Engineer"],
  power: ["Hospital Administrator", "Infrastructure Engineer"],
  network: ["Infrastructure Engineer"],
  privacy: ["Radiology Operator", "Security/Privacy Officer"],
  approval: ["Radiology Operator", "Hospital Administrator"],
  simulation: ["Radiology Operator", "Hospital Administrator"],
  synchronization: ["Infrastructure Engineer"],
  connector: ["Infrastructure Engineer", "Security/Privacy Officer"],
  recovery: ["ICU Operations", "Infrastructure Engineer"],
  system: ["Hospital Administrator", "Infrastructure Engineer"],
};

const NEVER_VISIBLE_EVENT_TYPES = new Set<OperationalEvent["eventType"]>([
  "baseline-reset",
  "scenario-started",
  "guard-evaluation-completed",
  "plan-set-ranked",
  "guard-blocked",
  "route-selected",
  "twin-synchronized",
  "system-event",
]);

const ALWAYS_EMAIL_EVENT_TYPES = new Set<OperationalEvent["eventType"]>([
  "decision-approved",
  "decision-rejected",
  "connector-failed",
  "synchronization-failed",
]);

function envFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function notificationRuleConfigurationFromEnvironment(
  environment: NodeJS.ProcessEnv
): NotificationRuleConfiguration {
  return {
    warningEmailAlertsEnabled: envFlag(
      environment.EMAIL_WARNING_ALERTS_ENABLED
    ),
    recoveryEmailAlertsEnabled: envFlag(
      environment.EMAIL_RECOVERY_ALERTS_ENABLED
    ),
  };
}

function rolesForEvent(event: OperationalEvent): OperationalRole[] {
  if (event.eventType === "oxygen-critical" || event.eventType === "oxygen-action-required") {
    return [
      "ICU Operations",
      "Hospital Administrator",
      "Infrastructure Engineer",
    ];
  }
  if (event.eventType === "oxygen-warning" || event.eventType === "oxygen-recovered") {
    return ["ICU Operations", "Infrastructure Engineer"];
  }
  if (event.eventType === "crisis-summary") {
    return [
      "Radiology Operator",
      "Hospital Administrator",
      "Infrastructure Engineer",
    ];
  }
  if (event.eventType === "human-approval-required") {
    return ["Radiology Operator", "Hospital Administrator"];
  }
  if (
    event.eventType === "decision-approved" ||
    event.eventType === "decision-rejected" ||
    event.eventType === "decision-conflict"
  ) {
    return [
      "Radiology Operator",
      "Hospital Administrator",
      "Infrastructure Engineer",
    ];
  }
  return [...DEFAULT_ROLES_BY_DOMAIN[event.domain]];
}

function shouldShow(event: OperationalEvent): boolean {
  if (
    event.metadata.notificationVisibility === "grouped-detail" ||
    event.metadata.notificationVisibility === "history-only"
  ) {
    return false;
  }
  if (event.eventType === "crisis-summary") return true;
  if (NEVER_VISIBLE_EVENT_TYPES.has(event.eventType)) return false;
  if (event.category === "telemetry" && event.severity === "info") return false;
  return true;
}

function isEmailEligible(
  event: OperationalEvent,
  configuration: NotificationRuleConfiguration
): boolean {
  if (event.eventType === "email-delivery-failed") {
    return false;
  }
  if (event.eventType === "oxygen-recovered") {
    return configuration.recoveryEmailAlertsEnabled;
  }
  if (ALWAYS_EMAIL_EVENT_TYPES.has(event.eventType)) return true;
  if (
    event.severity === "critical" ||
    event.severity === "action-required"
  ) {
    return true;
  }
  return (
    event.severity === "warning" &&
    configuration.warningEmailAlertsEnabled
  );
}

export function evaluateNotificationRule(
  event: OperationalEvent,
  configuration: NotificationRuleConfiguration =
    DEFAULT_NOTIFICATION_RULE_CONFIGURATION
): NotificationRuleDecision {
  const visible = shouldShow(event);
  const cooldownKey =
    typeof event.metadata.notificationCooldownKey === "string"
      ? event.metadata.notificationCooldownKey
      : `${event.domain}:${event.eventType}:${event.correlationId}`;

  return {
    visible,
    severity: event.severity,
    targetRoles: rolesForEvent(event),
    emailEligible: visible && isEmailEligible(event, configuration),
    dedupeKey: `notification:${event.dedupeKey}`,
    cooldownKey,
    cooldownSeconds: DOMAIN_COOLDOWN_SECONDS[event.domain],
    explanation: visible
      ? "Created by the centralized MedRouteX transition rule for this operational event."
      : event.metadata.notificationVisibility === "grouped-detail"
        ? "Retained in unified history and grouped into a concise parent notification."
        : "Retained in unified history without a routine in-app notification.",
  };
}
