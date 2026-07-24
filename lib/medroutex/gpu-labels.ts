const COMPATIBILITY_GPU_LABELS: Readonly<Record<string, string>> = {
  "gpu-local-0": "Local GPU-1",
  "gpu-local-1": "Local GPU-2",
  "gpu-local-2": "Local GPU-3",
  "gpu-local-3": "Local GPU-4",
  "gpu-central-0": "Central GPU-5",
  "gpu-central-1": "Central GPU-6",
  "gpu-central-7": "Central GPU-7",
  "gpu-central-2": "Central GPU-8",
  "gpu-cloud-0": "Cloud GPU-9",
  "gpu-cloud-1": "Cloud GPU-10",
};

export function humanGpuLabel(gpuId?: string | null): string {
  if (!gpuId) return "No target available";
  const direct = COMPATIBILITY_GPU_LABELS[gpuId];
  if (direct) return direct;

  const canonical = /^compute-(local|central|cloud)-gpu-(\d+)$/.exec(gpuId);
  if (canonical) {
    const cluster = canonical[1][0].toUpperCase() + canonical[1].slice(1);
    return `${cluster} GPU-${Number(canonical[2])}`;
  }

  return gpuId;
}
