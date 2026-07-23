import type { ClusterType } from "../medroutex/types";

const CANONICAL_TO_COMPATIBILITY_GPU_ID: Readonly<Record<string, string>> = {
  "compute-local-gpu-01": "gpu-local-0",
  "compute-local-gpu-02": "gpu-local-1",
  "compute-local-gpu-03": "gpu-local-2",
  "compute-local-gpu-04": "gpu-local-3",
  "compute-central-gpu-05": "gpu-central-0",
  "compute-central-gpu-06": "gpu-central-1",
  "compute-central-gpu-07": "gpu-central-7",
  "compute-central-gpu-08": "gpu-central-2",
  "compute-cloud-gpu-09": "gpu-cloud-0",
  "compute-cloud-gpu-10": "gpu-cloud-1",
};

const COMPATIBILITY_TO_CANONICAL_GPU_ID = new Map(
  Object.entries(CANONICAL_TO_COMPATIBILITY_GPU_ID).map(
    ([canonicalId, compatibilityId]) => [compatibilityId, canonicalId]
  )
);

export function compatibilityGpuIdForEntity(
  entityId: string
): string | null {
  return CANONICAL_TO_COMPATIBILITY_GPU_ID[entityId] ?? null;
}

export function canonicalGpuEntityId(
  compatibilityGpuId: string
): string | null {
  return (
    COMPATIBILITY_TO_CANONICAL_GPU_ID.get(compatibilityGpuId) ?? null
  );
}

export function clusterTypeForGpuEntity(entityId: string): ClusterType {
  if (entityId.includes("-cloud-")) return "cloud";
  if (entityId.includes("-central-")) return "central";
  return "local";
}

export function displayLabelForGpuEntity(entityId: string): string {
  const match = /compute-(local|central|cloud)-gpu-(\d+)/.exec(entityId);
  if (!match) return entityId;

  const clusterLabel =
    match[1] === "local"
      ? "Local"
      : match[1] === "central"
        ? "Central"
        : "Cloud";
  return `${clusterLabel} GPU-${Number(match[2])}`;
}

