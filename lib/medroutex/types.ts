export type ClusterType = "local" | "central" | "cloud";

export type GpuStatus = "healthy" | "warning" | "critical" | "idle" | "standby" | "waking";

export type WorkloadPriority = "critical" | "high" | "medium" | "low" | "research";

export type PrivacyPolicy = "on-prem-only" | "edge-allowed" | "central-allowed" | "cloud-allowed";

export interface Gpu {
  id: string;
  clusterId: string;
  clusterType: ClusterType;
  status: GpuStatus;
  temperature: number;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  powerDraw: number;
  fanSpeed: number;
  errorCount: number;
  anomalyRisk: number;
  trendRisk: number;
  riskScore: number;
  healthScore: number;
  assignedWorkloads: string[];
  idleMinutes: number;
  standbyEligible: boolean;
}

export interface Workload {
  id: string;
  name: string;
  type: string;
  priority: WorkloadPriority;
  deadlineSeconds: number;
  remainingSeconds: number;
  privacyPolicy: PrivacyPolicy;
  computeNeed: number;
  memoryNeed: number;
  status: string;
  assignedGpuId?: string;
}

export interface ClusterSummary {
  clusterId: string;
  clusterType: ClusterType;
  name: string;
  totalGpus: number;
  healthyGpus: number;
  warningGpus: number;
  criticalGpus: number;
  idleGpus: number;
  averageUtilization: number;
  averageTemperature: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "critical";
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface MeshState {
  scenario: string;
  totalGpus: number;
  activeWorkloads: number;
  criticalWorkloads: number;
  riskyGpus: number;
  idleGpus: number;
  clusterHealth: number;
  estimatedSaving: number;
  gpus: Gpu[];
  workloads: Workload[];
  clusters: ClusterSummary[];
  auditLogs: AuditLog[];
}
