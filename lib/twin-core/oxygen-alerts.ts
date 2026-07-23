import type {
  HospitalOperationalStatus,
  OxygenDomainState,
} from "./types";
import {
  TEAM_DELTA_OXYGEN_ALERT_CONFIG,
  type OxygenAlertThresholdConfig,
  type OxygenProtectedZone,
} from "./oxygen-alert-config";

export type OxygenAssessmentSeverity =
  | "normal"
  | "warning"
  | "critical"
  | "action-required";

export type OxygenAlertCauseCode =
  | "telemetry-unavailable"
  | "pipeline-degraded"
  | "pipeline-critical"
  | "pipeline-offline"
  | "tank-warning"
  | "tank-critical"
  | "tank-action-required"
  | "depletion-warning"
  | "depletion-critical"
  | "depletion-action-required"
  | "pressure-warning"
  | "pressure-critical"
  | "pressure-action-required"
  | "anomaly-warning"
  | "anomaly-critical"
  | "anomaly-action-required"
  | "reserve-unavailable"
  | "critical-ward-coverage-insufficient";

export interface OxygenAlertCause {
  readonly code: OxygenAlertCauseCode;
  readonly severity: Exclude<OxygenAssessmentSeverity, "normal">;
  readonly explanation: string;
}

export interface OxygenReserveAssessment {
  readonly available: boolean;
  readonly status: "available" | "unavailable";
  readonly cylinderCount: number;
  readonly bankStatus: HospitalOperationalStatus;
  readonly explanation: string;
}

export interface CriticalWardCoverageAssessment {
  readonly sufficient: boolean;
  readonly status: "protected" | "insufficient" | "unavailable";
  readonly estimatedCoverageMinutes: number | null;
  readonly minimumRequiredMinutes: number;
  readonly protectedZones: readonly OxygenProtectedZone[];
  readonly explanation: string;
}

export interface OxygenAlertContentDetails {
  readonly timestamp: string;
  readonly title: string;
  readonly sourceLabel: OxygenDomainState["sourceLabel"];
  readonly mainTankLevel: string;
  readonly currentDemand: string;
  readonly estimatedDepletion: string;
  readonly pipelinePressure: string;
  readonly pipelineState: HospitalOperationalStatus;
  readonly reserveAvailability: string;
  readonly criticalWardCoverage: string;
  readonly anomalyRisk: string;
  readonly impactedZones: string;
  readonly recommendedResponse: string;
  readonly humanReviewRequired: boolean;
  readonly modelBoundary: string;
  readonly formattedDetails: readonly string[];
}

export interface OxygenAlertAssessment {
  readonly severity: OxygenAssessmentSeverity;
  readonly title: string;
  readonly reason: string;
  readonly causes: readonly OxygenAlertCause[];
  readonly reserve: OxygenReserveAssessment;
  readonly criticalWardCoverage: CriticalWardCoverageAssessment;
  readonly impactedZones: readonly OxygenProtectedZone[];
  readonly recommendedResponse: string;
  readonly humanReviewRequired: boolean;
  readonly emailEligible: boolean;
  /**
   * Stable for an equivalent alert condition. Incident lifecycle code should
   * scope this fingerprint with its deterministic incident ID.
   */
  readonly fingerprint: string;
  readonly content: OxygenAlertContentDetails;
}

export interface OxygenRecoveryConditions {
  readonly tankRecovered: boolean;
  readonly depletionRecovered: boolean;
  readonly pressureRecovered: boolean;
  readonly anomalyRecovered: boolean;
  readonly criticalWardCoverageRestored: boolean;
  readonly reserveAvailable: boolean;
  readonly pipelineOperational: boolean;
}

export interface OxygenRecoveryAssessment {
  readonly safeThisCycle: boolean;
  readonly confirmed: boolean;
  readonly previousConsecutiveSafeCycles: number;
  readonly consecutiveSafeCycles: number;
  readonly requiredConsecutiveSafeCycles: number;
  readonly remainingConfirmationCycles: number;
  readonly conditions: OxygenRecoveryConditions;
  readonly blockers: readonly string[];
  readonly title: "Oxygen Supply Recovered";
  readonly fingerprint: string;
  readonly content: OxygenAlertContentDetails;
}

function moreSevere(
  current: OxygenAssessmentSeverity,
  candidate: OxygenAssessmentSeverity
): OxygenAssessmentSeverity {
  if (current === "action-required" || candidate === "action-required") {
    return "action-required";
  }
  if (current === "critical" || candidate === "critical") {
    return "critical";
  }
  if (current === "warning" || candidate === "warning") {
    return "warning";
  }
  return "normal";
}

function finiteMeasurements(oxygen: OxygenDomainState): boolean {
  return [
    oxygen.mainTankPercent,
    oxygen.pipelinePressureBar,
    oxygen.currentDemandLitersPerMinute,
    oxygen.reserveCylinderCount,
    oxygen.estimatedMinutesToDepletion,
    oxygen.leakAnomalyRisk,
  ].every(Number.isFinite);
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  return value.toLocaleString("en-US", {
    maximumFractionDigits,
    useGrouping: false,
  });
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value)) return "unavailable";
  return `${formatNumber(value, 0)} min`;
}

function assessReserve(
  oxygen: OxygenDomainState,
  config: OxygenAlertThresholdConfig
): OxygenReserveAssessment {
  const available =
    Number.isFinite(oxygen.reserveCylinderCount) &&
    oxygen.reserveCylinderCount >= config.minimumAvailableReserveCylinders &&
    oxygen.reserveBankStatus === "operational";

  return {
    available,
    status: available ? "available" : "unavailable",
    cylinderCount: oxygen.reserveCylinderCount,
    bankStatus: oxygen.reserveBankStatus,
    explanation: available
      ? `${formatNumber(oxygen.reserveCylinderCount, 0)} reserve cylinders are available in an operational emulated reserve bank.`
      : `The emulated reserve bank is ${oxygen.reserveBankStatus} with ${formatNumber(
          oxygen.reserveCylinderCount,
          0
        )} reserve cylinders reported; reserve continuity requires human verification.`,
  };
}

function assessCriticalWardCoverage(
  oxygen: OxygenDomainState,
  config: OxygenAlertThresholdConfig
): CriticalWardCoverageAssessment {
  const coverageIsFinite = Number.isFinite(
    oxygen.estimatedMinutesToDepletion
  );
  const sufficient =
    coverageIsFinite &&
    oxygen.estimatedMinutesToDepletion >=
      config.criticalWardCoverageMinimumMinutes;
  const status: CriticalWardCoverageAssessment["status"] = !coverageIsFinite
    ? "unavailable"
    : sufficient
      ? "protected"
      : "insufficient";

  return {
    sufficient,
    status,
    estimatedCoverageMinutes: coverageIsFinite
      ? oxygen.estimatedMinutesToDepletion
      : null,
    minimumRequiredMinutes: config.criticalWardCoverageMinimumMinutes,
    protectedZones: config.protectedZones,
    explanation: sufficient
      ? `Estimated oxygen coverage is ${formatMinutes(
          oxygen.estimatedMinutesToDepletion
        )} for the protected ICU and Emergency zones.`
      : `Estimated oxygen coverage is ${
          coverageIsFinite
            ? formatMinutes(oxygen.estimatedMinutesToDepletion)
            : "unavailable"
        }; the Team Delta prototype minimum for ICU and Emergency continuity is ${formatMinutes(
          config.criticalWardCoverageMinimumMinutes
        )}.`,
  };
}

function pipelineCause(
  status: HospitalOperationalStatus,
  coverage: CriticalWardCoverageAssessment
): OxygenAlertCause | null {
  if (status === "offline") {
    return {
      code: "pipeline-offline",
      severity: "action-required",
      explanation:
        "The emulated oxygen pipeline is offline and requires immediate human continuity review.",
    };
  }
  if (status === "critical") {
    return {
      code: "pipeline-critical",
      severity: coverage.sufficient ? "critical" : "action-required",
      explanation:
        "The emulated oxygen pipeline reports a critical operational state.",
    };
  }
  if (status === "degraded") {
    return {
      code: "pipeline-degraded",
      severity: "warning",
      explanation:
        "The emulated oxygen pipeline reports a degraded operational state.",
    };
  }
  return null;
}

function tankCause(
  value: number,
  config: OxygenAlertThresholdConfig
): OxygenAlertCause | null {
  if (value <= config.tank.actionRequiredAtOrBelowPercent) {
    return {
      code: "tank-action-required",
      severity: "action-required",
      explanation: `Main tank level is ${formatNumber(value, 1)}%, at or below the Team Delta action threshold.`,
    };
  }
  if (value <= config.tank.criticalAtOrBelowPercent) {
    return {
      code: "tank-critical",
      severity: "critical",
      explanation: `Main tank level is ${formatNumber(value, 1)}%, within the Team Delta critical range.`,
    };
  }
  if (value <= config.tank.warningAtOrBelowPercent) {
    return {
      code: "tank-warning",
      severity: "warning",
      explanation: `Main tank level is ${formatNumber(value, 1)}%, within the Team Delta warning range.`,
    };
  }
  return null;
}

function depletionCause(
  value: number,
  config: OxygenAlertThresholdConfig
): OxygenAlertCause | null {
  if (value < config.depletion.actionRequiredBelowMinutes) {
    return {
      code: "depletion-action-required",
      severity: "action-required",
      explanation: `Estimated depletion is ${formatMinutes(value)}, below the Team Delta action threshold.`,
    };
  }
  if (value < config.depletion.criticalBelowMinutes) {
    return {
      code: "depletion-critical",
      severity: "critical",
      explanation: `Estimated depletion is ${formatMinutes(value)}, within the Team Delta critical range.`,
    };
  }
  if (value <= config.depletion.warningAtOrBelowMinutes) {
    return {
      code: "depletion-warning",
      severity: "warning",
      explanation: `Estimated depletion is ${formatMinutes(value)}, within the Team Delta warning range.`,
    };
  }
  return null;
}

function pressureCause(
  value: number,
  coverage: CriticalWardCoverageAssessment,
  config: OxygenAlertThresholdConfig
): OxygenAlertCause | null {
  const { pressure } = config;
  if (value < pressure.criticalPressureThreshold) {
    const actionRequired = !coverage.sufficient;
    return {
      code: actionRequired
        ? "pressure-action-required"
        : "pressure-critical",
      severity: actionRequired ? "action-required" : "critical",
      explanation: `Pipeline pressure is ${formatNumber(value, 2)} ${pressure.pressureUnit}, below the Team Delta prototype critical threshold.`,
    };
  }
  if (value < pressure.warningPressureThreshold) {
    return {
      code: "pressure-warning",
      severity: "warning",
      explanation: `Pipeline pressure is ${formatNumber(value, 2)} ${pressure.pressureUnit}, below the Team Delta prototype warning threshold.`,
    };
  }
  return null;
}

function anomalyCause(
  value: number,
  config: OxygenAlertThresholdConfig
): OxygenAlertCause | null {
  if (value >= config.anomaly.actionRequiredAtOrAboveProbability) {
    return {
      code: "anomaly-action-required",
      severity: "action-required",
      explanation: `Emulated leak/anomaly probability is ${formatNumber(value * 100, 1)}%, within the Team Delta action range.`,
    };
  }
  if (value >= config.anomaly.criticalAtOrAboveProbability) {
    return {
      code: "anomaly-critical",
      severity: "critical",
      explanation: `Emulated leak/anomaly probability is ${formatNumber(value * 100, 1)}%, within the Team Delta critical range.`,
    };
  }
  if (value >= config.anomaly.warningAtOrAboveProbability) {
    return {
      code: "anomaly-warning",
      severity: "warning",
      explanation: `Emulated leak/anomaly probability is ${formatNumber(value * 100, 1)}%, within the Team Delta warning range.`,
    };
  }
  return null;
}

function titleForSeverity(severity: OxygenAssessmentSeverity): string {
  if (severity === "action-required") {
    return "Immediate Oxygen Continuity Action Required";
  }
  if (severity === "critical") return "Critical Oxygen Supply Risk";
  if (severity === "warning") return "Oxygen Reserve Declining";
  return "Oxygen Supply Normal";
}

function recommendationForSeverity(
  severity: OxygenAssessmentSeverity,
  reserve: OxygenReserveAssessment
): string {
  if (severity === "action-required") {
    return "Initiate immediate human continuity review, verify reserve readiness, and follow the hospital's authorized oxygen continuity procedure. MedRouteX has not actuated any valve, reserve bank, cylinder, pipeline, plant, or other equipment.";
  }
  if (severity === "critical") {
    return "Urgently review ICU and Emergency oxygen continuity, pipeline condition, and reserve readiness with authorized hospital operations staff. This is decision support only; no physical action has been executed.";
  }
  if (severity === "warning") {
    return reserve.available
      ? "Review demand, pressure, and protected-zone coverage, and prepare the reserve system for authorized human review if conditions worsen. No physical action has been executed."
      : "Review demand and pressure, verify reserve availability, and prepare an authorized continuity response. No physical action has been executed.";
  }
  return "Continue monitoring emulated oxygen telemetry under the hospital's authorized operational procedures.";
}

function buildContent(
  oxygen: OxygenDomainState,
  timestamp: string,
  title: string,
  reserve: OxygenReserveAssessment,
  coverage: CriticalWardCoverageAssessment,
  impactedZones: readonly OxygenProtectedZone[],
  recommendedResponse: string,
  humanReviewRequired: boolean,
  config: OxygenAlertThresholdConfig
): OxygenAlertContentDetails {
  const mainTankLevel = `${formatNumber(oxygen.mainTankPercent, 1)}%`;
  const currentDemand = `${formatNumber(
    oxygen.currentDemandLitersPerMinute,
    0
  )} L/min`;
  const estimatedDepletion = formatMinutes(
    oxygen.estimatedMinutesToDepletion
  );
  const pipelinePressure = `${formatNumber(
    oxygen.pipelinePressureBar,
    2
  )} ${config.pressure.pressureUnit}`;
  const reserveAvailability = `${reserve.status}; ${formatNumber(
    oxygen.reserveCylinderCount,
    0
  )} cylinders; bank ${oxygen.reserveBankStatus}`;
  const criticalWardCoverage = `${coverage.status}; ${
    coverage.estimatedCoverageMinutes === null
      ? "coverage unavailable"
      : formatMinutes(coverage.estimatedCoverageMinutes)
  } estimated`;
  const anomalyRisk = `${formatNumber(oxygen.leakAnomalyRisk * 100, 1)}%`;
  const impactedZoneLabel =
    impactedZones.length === 0 ? "None" : impactedZones.join(", ");

  return {
    timestamp,
    title,
    sourceLabel: oxygen.sourceLabel,
    mainTankLevel,
    currentDemand,
    estimatedDepletion,
    pipelinePressure,
    pipelineState: oxygen.operationalStatus,
    reserveAvailability,
    criticalWardCoverage,
    anomalyRisk,
    impactedZones: impactedZoneLabel,
    recommendedResponse,
    humanReviewRequired,
    modelBoundary: config.modelBoundary,
    formattedDetails: [
      `Main tank: ${mainTankLevel}`,
      `Current demand: ${currentDemand}`,
      `Estimated depletion: ${estimatedDepletion}`,
      `Pipeline: ${pipelinePressure}; ${oxygen.operationalStatus}`,
      `Reserve: ${reserveAvailability}`,
      `ICU/Emergency coverage: ${criticalWardCoverage}`,
      `Leak/anomaly probability: ${anomalyRisk}`,
      `Impacted zones: ${impactedZoneLabel}`,
      `Source: ${oxygen.sourceLabel}`,
      `Timestamp: ${timestamp}`,
      `Recommended response: ${recommendedResponse}`,
      config.modelBoundary,
    ],
  };
}

export function assessOxygenAlert(
  oxygen: OxygenDomainState,
  timestamp: string,
  config: OxygenAlertThresholdConfig = TEAM_DELTA_OXYGEN_ALERT_CONFIG
): OxygenAlertAssessment {
  const reserve = assessReserve(oxygen, config);
  const criticalWardCoverage = assessCriticalWardCoverage(oxygen, config);
  const causes: OxygenAlertCause[] = [];

  if (!finiteMeasurements(oxygen)) {
    causes.push({
      code: "telemetry-unavailable",
      severity: "action-required",
      explanation:
        "One or more required emulated oxygen measurements are unavailable; immediate human verification is required.",
    });
  }

  const possibleCauses = [
    pipelineCause(oxygen.operationalStatus, criticalWardCoverage),
    tankCause(oxygen.mainTankPercent, config),
    depletionCause(oxygen.estimatedMinutesToDepletion, config),
    pressureCause(
      oxygen.pipelinePressureBar,
      criticalWardCoverage,
      config
    ),
    anomalyCause(oxygen.leakAnomalyRisk, config),
  ];
  for (const cause of possibleCauses) {
    if (cause !== null) causes.push(cause);
  }

  const lowMainTank =
    Number.isFinite(oxygen.mainTankPercent) &&
    oxygen.mainTankPercent <= config.tank.warningAtOrBelowPercent;
  if (lowMainTank && !reserve.available) {
    causes.push({
      code: "reserve-unavailable",
      severity: "action-required",
      explanation:
        "The main tank is low and the emulated reserve bank is not confirmed available; immediate human continuity review is required.",
    });
  }

  if (!criticalWardCoverage.sufficient) {
    causes.push({
      code: "critical-ward-coverage-insufficient",
      severity: "action-required",
      explanation: criticalWardCoverage.explanation,
    });
  }

  const severity = causes.reduce<OxygenAssessmentSeverity>(
    (current, cause) => moreSevere(current, cause.severity),
    "normal"
  );
  const title = titleForSeverity(severity);
  const impactedZones =
    severity === "normal" ? [] : [...config.protectedZones];
  const recommendedResponse = recommendationForSeverity(severity, reserve);
  const humanReviewRequired =
    severity === "critical" || severity === "action-required";
  const reason =
    causes.length === 0
      ? "Emulated oxygen supply measurements remain within Team Delta prototype operating thresholds."
      : causes.map((cause) => cause.explanation).join(" ");
  const fingerprint = [
    "oxygen-assessment",
    severity,
    causes
      .map((cause) => cause.code)
      .sort()
      .join(","),
    `reserve:${reserve.status}`,
    `coverage:${criticalWardCoverage.status}`,
  ].join("|");

  return {
    severity,
    title,
    reason,
    causes,
    reserve,
    criticalWardCoverage,
    impactedZones,
    recommendedResponse,
    humanReviewRequired,
    emailEligible:
      severity === "critical" || severity === "action-required",
    fingerprint,
    content: buildContent(
      oxygen,
      timestamp,
      title,
      reserve,
      criticalWardCoverage,
      impactedZones,
      recommendedResponse,
      humanReviewRequired,
      config
    ),
  };
}

export function assessOxygenRecovery(
  oxygen: OxygenDomainState,
  timestamp: string,
  previousConsecutiveSafeCycles: number,
  config: OxygenAlertThresholdConfig = TEAM_DELTA_OXYGEN_ALERT_CONFIG
): OxygenRecoveryAssessment {
  const reserve = assessReserve(oxygen, config);
  const coverage = assessCriticalWardCoverage(oxygen, config);
  const conditions: OxygenRecoveryConditions = {
    tankRecovered:
      Number.isFinite(oxygen.mainTankPercent) &&
      oxygen.mainTankPercent > config.tank.recoveryAbovePercent,
    depletionRecovered:
      Number.isFinite(oxygen.estimatedMinutesToDepletion) &&
      oxygen.estimatedMinutesToDepletion >
        config.depletion.recoveryAboveMinutes,
    pressureRecovered:
      Number.isFinite(oxygen.pipelinePressureBar) &&
      oxygen.pipelinePressureBar >=
        config.pressure.recoveryPressureThreshold,
    anomalyRecovered:
      Number.isFinite(oxygen.leakAnomalyRisk) &&
      oxygen.leakAnomalyRisk < config.anomaly.recoveryBelowProbability,
    criticalWardCoverageRestored: coverage.sufficient,
    reserveAvailable: reserve.available,
    pipelineOperational: oxygen.operationalStatus === "operational",
  };
  const safeThisCycle = Object.values(conditions).every(Boolean);
  const normalizedPreviousCycles = Number.isFinite(
    previousConsecutiveSafeCycles
  )
    ? Math.max(0, Math.trunc(previousConsecutiveSafeCycles))
    : 0;
  const consecutiveSafeCycles = safeThisCycle
    ? Math.min(
        normalizedPreviousCycles + 1,
        config.recoveryConfirmationCycles
      )
    : 0;
  const confirmed =
    safeThisCycle &&
    consecutiveSafeCycles >= config.recoveryConfirmationCycles;
  const remainingConfirmationCycles = Math.max(
    config.recoveryConfirmationCycles - consecutiveSafeCycles,
    0
  );
  const blockers: string[] = [];

  if (!conditions.tankRecovered) {
    blockers.push("Main tank has not crossed the recovery threshold.");
  }
  if (!conditions.depletionRecovered) {
    blockers.push("Estimated depletion time has not crossed the recovery threshold.");
  }
  if (!conditions.pressureRecovered) {
    blockers.push("Pipeline pressure has not returned to the recovery-safe range.");
  }
  if (!conditions.anomalyRecovered) {
    blockers.push("Leak/anomaly probability has not fallen below the recovery threshold.");
  }
  if (!conditions.criticalWardCoverageRestored) {
    blockers.push("ICU and Emergency oxygen coverage is not restored.");
  }
  if (!conditions.reserveAvailable) {
    blockers.push("The emulated reserve bank is not confirmed available.");
  }
  if (!conditions.pipelineOperational) {
    blockers.push("The emulated oxygen pipeline is not operational.");
  }

  const recommendedResponse =
    "Continue authorized human monitoring of the restored emulated oxygen supply. MedRouteX has not actuated any valve, reserve bank, cylinder, pipeline, plant, or other equipment.";
  const fingerprint = [
    "oxygen-recovery",
    safeThisCycle ? "safe" : "unsafe",
    `cycles:${consecutiveSafeCycles}`,
    `tank:${conditions.tankRecovered}`,
    `depletion:${conditions.depletionRecovered}`,
    `pressure:${conditions.pressureRecovered}`,
    `anomaly:${conditions.anomalyRecovered}`,
    `coverage:${conditions.criticalWardCoverageRestored}`,
    `reserve:${conditions.reserveAvailable}`,
    `pipeline:${conditions.pipelineOperational}`,
  ].join("|");

  return {
    safeThisCycle,
    confirmed,
    previousConsecutiveSafeCycles: normalizedPreviousCycles,
    consecutiveSafeCycles,
    requiredConsecutiveSafeCycles: config.recoveryConfirmationCycles,
    remainingConfirmationCycles,
    conditions,
    blockers,
    title: "Oxygen Supply Recovered",
    fingerprint,
    content: buildContent(
      oxygen,
      timestamp,
      "Oxygen Supply Recovered",
      reserve,
      coverage,
      config.protectedZones,
      recommendedResponse,
      false,
      config
    ),
  };
}
