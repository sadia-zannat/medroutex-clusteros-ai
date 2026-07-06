export const SCENARIOS = [
  "normal_day",
  "local_gpu_overheat",
  "central_cluster_overload",
  "cloud_privacy_block",
  "network_latency_spike",
  "model_drift_warning",
  "no_safe_route",
  "full_hospital_crisis",
  "idle_gpu_waste",
  "single_gpu_failure_warning",
  "multiple_gpu_risk",
  "all_gpu_overloaded",
  "safe_energy_saving_window",
] as const;

export type Scenario = typeof SCENARIOS[number];

export const WORKLOAD_NAMES = [
  "Stroke CT AI",
  "Trauma CT AI",
  "ICU Chest X-ray",
  "MRI Segmentation",
  "Pathology Slide AI",
  "Research Training",
] as const;

export const CLUSTER_SETUP = {
  local: {
    id: "local-cluster-1",
    name: "Local Hospital Edge Cluster",
    totalGpus: 4,
  },
  central: {
    id: "central-cluster-1",
    name: "Central Hospital GPU Cluster",
    totalGpus: 4,
  },
  cloud: {
    id: "cloud-cluster-1",
    name: "Cloud Burst Cluster",
    totalGpus: 2,
  },
} as const;

export const TOTAL_GPUS = 10;
export const TOTAL_WORKLOADS = 20;
