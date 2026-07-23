/**
 * Team Delta prototype oxygen continuity thresholds.
 *
 * These values support infrastructure decision-making in the MedRouteX
 * demonstration. They are not certified clinical, medical-gas, or hospital
 * engineering safety limits.
 */

export const OXYGEN_ALERT_MODEL_BOUNDARY =
  "Team Delta prototype operational decision-support thresholds. Not certified clinical, medical-gas, or hospital-engineering safety limits.";

export type OxygenProtectedZone = "ICU" | "Emergency";

export interface OxygenTankThresholds {
  readonly warningAtOrBelowPercent: number;
  readonly criticalAtOrBelowPercent: number;
  readonly actionRequiredAtOrBelowPercent: number;
  readonly recoveryAbovePercent: number;
}

export interface OxygenDepletionThresholds {
  readonly warningAtOrBelowMinutes: number;
  readonly criticalBelowMinutes: number;
  readonly actionRequiredBelowMinutes: number;
  readonly recoveryAboveMinutes: number;
}

export interface OxygenPressureThresholds {
  readonly warningPressureThreshold: number;
  readonly criticalPressureThreshold: number;
  readonly recoveryPressureThreshold: number;
  readonly pressureUnit: string;
}

export interface OxygenAnomalyThresholds {
  readonly warningAtOrAboveProbability: number;
  readonly criticalAtOrAboveProbability: number;
  readonly actionRequiredAtOrAboveProbability: number;
  readonly recoveryBelowProbability: number;
}

export interface OxygenAlertThresholdConfig {
  readonly tank: OxygenTankThresholds;
  readonly depletion: OxygenDepletionThresholds;
  readonly pressure: OxygenPressureThresholds;
  readonly anomaly: OxygenAnomalyThresholds;
  readonly recoveryConfirmationCycles: number;
  readonly criticalWardCoverageMinimumMinutes: number;
  readonly minimumAvailableReserveCylinders: number;
  readonly protectedZones: readonly OxygenProtectedZone[];
  readonly modelBoundary: string;
}

export const TEAM_DELTA_OXYGEN_ALERT_CONFIG = {
  tank: {
    warningAtOrBelowPercent: 50,
    criticalAtOrBelowPercent: 30,
    actionRequiredAtOrBelowPercent: 20,
    recoveryAbovePercent: 55,
  },
  depletion: {
    warningAtOrBelowMinutes: 480,
    criticalBelowMinutes: 240,
    actionRequiredBelowMinutes: 120,
    recoveryAboveMinutes: 540,
  },
  pressure: {
    warningPressureThreshold: 3.8,
    criticalPressureThreshold: 3.2,
    recoveryPressureThreshold: 4.0,
    pressureUnit: "bar",
  },
  anomaly: {
    warningAtOrAboveProbability: 0.5,
    criticalAtOrAboveProbability: 0.7,
    actionRequiredAtOrAboveProbability: 0.85,
    recoveryBelowProbability: 0.4,
  },
  recoveryConfirmationCycles: 2,
  criticalWardCoverageMinimumMinutes: 120,
  minimumAvailableReserveCylinders: 1,
  protectedZones: ["ICU", "Emergency"],
  modelBoundary: OXYGEN_ALERT_MODEL_BOUNDARY,
} as const satisfies OxygenAlertThresholdConfig;
