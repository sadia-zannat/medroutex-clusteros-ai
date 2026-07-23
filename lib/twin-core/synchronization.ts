import {
  type HospitalSynchronizationSummary,
  type HospitalTelemetryProvider,
  type HospitalTelemetryQuality,
  type OperationalTwinState,
  type TelemetryProviderBatch,
  type TwinEntity,
  type TwinOperationalStatus,
  type TwinTelemetryPoint,
} from "./types";
import {
  appendHospitalSnapshot,
  calculateHospitalResilience,
  deriveHospitalDomains,
} from "./resilience";

const OFFLINE_MULTIPLIER = 3;

export function telemetryAgeSeconds(
  timestamp: string,
  referenceTimestamp: string
): number {
  const sampleTime = Date.parse(timestamp);
  const referenceTime = Date.parse(referenceTimestamp);
  if (!Number.isFinite(sampleTime) || !Number.isFinite(referenceTime)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (referenceTime - sampleTime) / 1000);
}

export function isTelemetryStale(
  point: Pick<TwinTelemetryPoint, "timestamp" | "staleAfterSeconds">,
  referenceTimestamp: string
): boolean {
  return (
    telemetryAgeSeconds(point.timestamp, referenceTimestamp) >=
    point.staleAfterSeconds
  );
}

export function isTelemetryOffline(
  point: Pick<
    TwinTelemetryPoint,
    "timestamp" | "staleAfterSeconds" | "quality"
  >,
  referenceTimestamp: string
): boolean {
  return (
    point.quality === "offline" ||
    telemetryAgeSeconds(point.timestamp, referenceTimestamp) >=
      point.staleAfterSeconds * OFFLINE_MULTIPLIER
  );
}

export function degradeTelemetryQuality(
  point: TwinTelemetryPoint,
  referenceTimestamp: string
): TwinTelemetryPoint {
  const offline = isTelemetryOffline(point, referenceTimestamp);
  const stale = isTelemetryStale(point, referenceTimestamp);
  const quality: HospitalTelemetryQuality = offline
    ? "offline"
    : stale
      ? "stale"
      : point.quality;

  return {
    ...point,
    quality,
    isStale: quality === "stale" || quality === "offline",
  };
}

function validateTelemetryPoint(
  point: TwinTelemetryPoint,
  batch: TelemetryProviderBatch,
  entityById: ReadonlyMap<string, TwinEntity>
): string | null {
  const entity = entityById.get(point.entityId);
  if (!entity) return `Unknown telemetry entity: ${point.entityId}`;
  if (!(point.metric in entity.attributes)) {
    return `Unknown metric ${point.metric} for entity ${point.entityId}`;
  }
  if (point.provider !== batch.provider || point.source !== batch.source) {
    return `Provider metadata mismatch for ${point.entityId}/${point.metric}`;
  }
  if (point.confidence < 0 || point.confidence > 1) {
    return `Invalid confidence for ${point.entityId}/${point.metric}`;
  }
  if (
    !Number.isFinite(point.staleAfterSeconds) ||
    point.staleAfterSeconds <= 0
  ) {
    return `Invalid stale threshold for ${point.entityId}/${point.metric}`;
  }
  if (!Number.isFinite(Date.parse(point.timestamp))) {
    return `Invalid timestamp for ${point.entityId}/${point.metric}`;
  }
  return null;
}

function statusFromOperationalValue(
  value: TwinTelemetryPoint["value"],
  currentStatus: TwinOperationalStatus
): TwinOperationalStatus {
  if (value === "operational") return "healthy";
  if (value === "degraded") return "warning";
  if (value === "critical") return "critical";
  if (value === "offline") return "offline";
  return currentStatus;
}

function statusAfterFreshTelemetry(
  entity: TwinEntity,
  points: readonly TwinTelemetryPoint[]
): TwinOperationalStatus {
  const explicitStatus = points.find(
    (point) => point.metric === "operationalStatus"
  );
  if (explicitStatus) {
    return statusFromOperationalValue(
      explicitStatus.value,
      entity.status
    );
  }

  const generatorStatus = points.find(
    (point) => point.metric === "generatorStatus"
  )?.value;
  if (generatorStatus === "offline") return "offline";

  if (entity.status !== "offline") return entity.status;
  if (entity.entityType === "compute-node") {
    return entity.riskScore >= 50 ? "critical" : "healthy";
  }
  return "healthy";
}

function applyTelemetryToEntities(
  entities: TwinEntity[],
  points: TwinTelemetryPoint[]
): TwinEntity[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const pointsByEntity = new Map<string, TwinTelemetryPoint[]>();

  for (const point of points) {
    const current = entityById.get(point.entityId);
    if (!current) continue;
    const entityPoints = pointsByEntity.get(point.entityId) ?? [];
    entityPoints.push(point);
    pointsByEntity.set(point.entityId, entityPoints);

    const sourceTypes = current.sourceTypes.includes(point.source)
      ? current.sourceTypes
      : [...current.sourceTypes, point.source];
    const pointIsNewer =
      !Number.isFinite(Date.parse(current.lastUpdated)) ||
      Date.parse(point.timestamp) >= Date.parse(current.lastUpdated);
    entityById.set(point.entityId, {
      ...current,
      lastUpdated: pointIsNewer ? point.timestamp : current.lastUpdated,
      lastHeartbeatAt:
        point.metric === "heartbeatTimestamp" &&
        typeof point.value === "string"
          ? point.value
          : current.lastHeartbeatAt,
      sourceTypes,
      attributes: {
        ...current.attributes,
        [point.metric]: point.value,
      },
    });
  }

  return entities.map((entity) => {
    const updated = entityById.get(entity.id) ?? entity;
    const entityPoints = pointsByEntity.get(entity.id);
    if (!entityPoints || entityPoints.length === 0) return updated;
    const hasOfflineSource = entityPoints.some(
      (point) => point.quality === "offline"
    );
    const hasStaleSource = entityPoints.some(
      (point) =>
        point.quality === "stale" ||
        point.quality === "offline" ||
        point.isStale
    );

    return {
      ...updated,
      status: hasOfflineSource
        ? "offline"
        : statusAfterFreshTelemetry(updated, entityPoints),
      isStale: hasStaleSource,
    };
  });
}

function mergeLatestTelemetry(
  existing: TwinTelemetryPoint[],
  incoming: TwinTelemetryPoint[]
): TwinTelemetryPoint[] {
  const latestByMetric = new Map<string, TwinTelemetryPoint>();
  for (const point of [...existing, ...incoming]) {
    const key = `${point.entityId}:${point.metric}`;
    const current = latestByMetric.get(key);
    if (
      !current ||
      Date.parse(point.timestamp) >= Date.parse(current.timestamp)
    ) {
      latestByMetric.set(key, point);
    }
  }
  return [...latestByMetric.values()];
}

function selectApplicableTelemetry(
  existing: readonly TwinTelemetryPoint[],
  incoming: readonly TwinTelemetryPoint[]
): {
  points: TwinTelemetryPoint[];
  ignoredErrors: string[];
} {
  const latestExistingByMetric = new Map<string, TwinTelemetryPoint>();
  const latestIncomingByMetric = new Map<string, TwinTelemetryPoint>();
  const ignoredErrors: string[] = [];

  for (const point of existing) {
    const key = `${point.entityId}:${point.metric}`;
    const current = latestExistingByMetric.get(key);
    if (
      !current ||
      Date.parse(point.timestamp) >= Date.parse(current.timestamp)
    ) {
      latestExistingByMetric.set(key, point);
    }
  }

  for (const point of incoming) {
    const key = `${point.entityId}:${point.metric}`;
    const current = latestIncomingByMetric.get(key);
    if (!current) {
      latestIncomingByMetric.set(key, point);
      continue;
    }

    if (Date.parse(point.timestamp) >= Date.parse(current.timestamp)) {
      ignoredErrors.push(
        `Duplicate or out-of-order telemetry ignored for ${current.entityId}/${current.metric}.`
      );
      latestIncomingByMetric.set(key, point);
    } else {
      ignoredErrors.push(
        `Duplicate or out-of-order telemetry ignored for ${point.entityId}/${point.metric}.`
      );
    }
  }

  const points: TwinTelemetryPoint[] = [];
  for (const [key, point] of latestIncomingByMetric) {
    const current = latestExistingByMetric.get(key);
    if (
      current &&
      Date.parse(point.timestamp) < Date.parse(current.timestamp)
    ) {
      ignoredErrors.push(
        `Out-of-order telemetry ignored for ${point.entityId}/${point.metric}.`
      );
      continue;
    }
    points.push(point);
  }

  return { points, ignoredErrors };
}

export function synchronizeHospitalTwin(
  currentState: OperationalTwinState,
  providers: readonly HospitalTelemetryProvider[],
  synchronizationTimestamp: string = new Date().toISOString()
): {
  state: OperationalTwinState;
  summary: HospitalSynchronizationSummary;
} {
  const timestamp = synchronizationTimestamp;
  const batches: TelemetryProviderBatch[] = [];
  const failedProviders: string[] = [];
  for (const provider of providers) {
    try {
      batches.push(provider.collect(currentState, timestamp));
    } catch {
      failedProviders.push(provider.id);
    }
  }
  const entityById = new Map(
    currentState.entities.map((entity) => [entity.id, entity])
  );
  const validationErrors: string[] = [];
  const acceptedPoints: TwinTelemetryPoint[] = [];

  for (const batch of batches) {
    for (const point of batch.points) {
      const validationError = validateTelemetryPoint(
        point,
        batch,
        entityById
      );
      if (validationError) {
        validationErrors.push(validationError);
      } else {
        acceptedPoints.push(degradeTelemetryQuality(point, timestamp));
      }
    }
  }

  const applicableTelemetry = selectApplicableTelemetry(
    currentState.latestTelemetry,
    acceptedPoints
  );
  validationErrors.push(...applicableTelemetry.ignoredErrors);
  const refreshedExistingTelemetry = currentState.latestTelemetry.map(
    (point) => degradeTelemetryQuality(point, timestamp)
  );
  const latestTelemetry = mergeLatestTelemetry(
    refreshedExistingTelemetry,
    applicableTelemetry.points
  );
  const entities = applyTelemetryToEntities(
    currentState.entities,
    latestTelemetry
  );
  const previousVersion = currentState.version;
  const version = previousVersion + 1;
  const synchronizationId = `sync-${version}`;
  const providersUsed = batches.map((batch) => batch.provider);
  const allProvidersFailed =
    providers.length > 0 && failedProviders.length === providers.length;
  const synchronizationStatus =
    allProvidersFailed
      ? "failed"
      : failedProviders.length > 0 || validationErrors.length > 0
        ? "partial"
        : "synchronized";

  const stateWithTelemetry: OperationalTwinState = {
    ...currentState,
    version,
    lastSynchronizedAt: allProvidersFailed
      ? currentState.lastSynchronizedAt
      : timestamp,
    entities,
    latestTelemetry,
    latestSynchronization: {
      id: synchronizationId,
      timestamp,
      providers: providersUsed,
      acceptedTelemetryPoints: applicableTelemetry.points.length,
      rejectedTelemetryPoints: validationErrors.length,
      failedProviders,
      staleSourceCount: 0,
      offlineSourceCount: 0,
      status: synchronizationStatus,
    },
  };
  const domains = deriveHospitalDomains(stateWithTelemetry);
  const resilienceSummary = calculateHospitalResilience(
    domains,
    stateWithTelemetry
  );
  const synchronizedState: OperationalTwinState = {
    ...stateWithTelemetry,
    domains,
    resilienceSummary,
    latestSynchronization: {
      ...stateWithTelemetry.latestSynchronization,
      staleSourceCount: resilienceSummary.staleSourceCount,
      offlineSourceCount: resilienceSummary.offlineSourceCount,
    },
  };
  const state = appendHospitalSnapshot(
    synchronizedState,
    "synchronization",
    timestamp
  );
  const snapshotId = state.snapshots[state.snapshots.length - 1].id;

  return {
    state,
    summary: {
      ...state.latestSynchronization,
      previousVersion,
      stateVersion: state.version,
      snapshotId,
      validationErrors: [
        ...failedProviders.map(
          (providerId) =>
            `Telemetry provider failed without exposing provider credentials: ${providerId}.`
        ),
        ...validationErrors,
      ],
    },
  };
}
