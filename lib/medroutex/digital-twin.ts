import type { MeshState } from "./types";
import { generateRouteRecommendations, type RouteRecommendation } from "./route-planner";

export interface DigitalTwinResult {
  scenario: string;
  beforeHealth: number;
  afterHealth: number;
  beforeRiskyGpus: number;
  afterRiskyGpus: number;
  recommendedActions: number;
  blockedActions: number;
  estimatedDowntimeSavedMinutes: number;
  estimatedCostSaving: number;
  riskReductionPercent: number;
  safetySummary: string;
}

export function simulateDigitalTwin(state: MeshState): DigitalTwinResult {
  const recommendations = generateRouteRecommendations(state);
  
  const beforeHealth = state.clusterHealth;
  const beforeRiskyGpus = state.riskyGpus;
  
  // Simulate improvements based on safe recommendations only
  const safeRecommendations = recommendations.filter(
    (rec) => rec.safetyStatus === "safe" && rec.privacyStatus === "allowed"
  );
  
  const blockedRecommendations = recommendations.filter(
    (rec) => rec.safetyStatus === "blocked" || rec.privacyStatus === "blocked"
  );
  
  // Calculate simulated improvements
  let totalRiskReduction = 0;
  let totalCostSaving = 0;
  let totalDowntimeSavedMinutes = 0;
  
  safeRecommendations.forEach((rec) => {
    totalRiskReduction += rec.estimatedRiskReduction;
    totalCostSaving += rec.estimatedCostSaving;
    
    // Estimate downtime saved based on action type
    if (rec.action === "migrate") {
      totalDowntimeSavedMinutes += 5;
    } else if (rec.action === "standby") {
      totalDowntimeSavedMinutes += 0;
    }
  });
  
  // Simulate new cluster health
  const riskReductionPercent = beforeRiskyGpus > 0 
    ? (totalRiskReduction / beforeRiskyGpus) * 100 
    : 0;
  
  const afterHealth = Math.min(100, Math.round(beforeHealth + (riskReductionPercent * 0.5)));
  
  // Simulate reduction in risky GPUs
  const afterRiskyGpus = Math.max(0, beforeRiskyGpus - Math.floor(safeRecommendations.length * 0.3));
  
  // Build safety summary
  const safetySummaryParts: string[] = [];
  
  if (blockedRecommendations.length > 0) {
    safetySummaryParts.push(
      `${blockedRecommendations.length} action(s) blocked due to privacy or safety constraints`
    );
  }
  
  if (safeRecommendations.length > 0) {
    safetySummaryParts.push(
      `${safeRecommendations.length} safe recommendation(s) available for execution`
    );
  }
  
  if (afterHealth > beforeHealth) {
    safetySummaryParts.push(
      `Cluster health can improve from ${beforeHealth}% to ${afterHealth}%`
    );
  }
  
  if (afterRiskyGpus < beforeRiskyGpus) {
    safetySummaryParts.push(
      `Risky GPUs can be reduced from ${beforeRiskyGpus} to ${afterRiskyGpus}`
    );
  }
  
  const safetySummary = safetySummaryParts.length > 0 
    ? safetySummaryParts.join(". ") 
    : "No significant improvements available in current state";
  
  return {
    scenario: state.scenario,
    beforeHealth,
    afterHealth,
    beforeRiskyGpus,
    afterRiskyGpus,
    recommendedActions: safeRecommendations.length,
    blockedActions: blockedRecommendations.length,
    estimatedDowntimeSavedMinutes: totalDowntimeSavedMinutes,
    estimatedCostSaving: Math.round(totalCostSaving),
    riskReductionPercent: Math.round(riskReductionPercent * 10) / 10,
    safetySummary,
  };
}
