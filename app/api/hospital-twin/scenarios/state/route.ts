import { NextResponse } from "next/server";
import {
  getOperationalTwinState,
  getScenarioState,
} from "@/lib/twin-core/state-store";
import {
  getIcuContinuityAssessment,
  getIcuOperationalRecommendation,
} from "@/lib/twin-core/scenario-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = getOperationalTwinState();
  return NextResponse.json(
    {
      success: true,
      state: getScenarioState(),
      runtimeState: state.scenarioRuntime,
      activeIncidents: state.activeIncidents,
      domainAssessments: state.scenarioRuntime.domainAssessments,
      rootCauses: state.scenarioRuntime.rootCauses,
      dependencyImpacts: state.scenarioRuntime.dependencyImpacts,
      cascadePaths: state.scenarioRuntime.cascadePaths,
      multiDomainPlanSet: state.scenarioRuntime.multiDomainPlanSet,
      icuAssessment: getIcuContinuityAssessment(state),
      icuRecommendation: getIcuOperationalRecommendation(state),
      metadata: {
        phase: 2,
        mutationImplemented: true,
        emulatedHospitalScenario: true,
        automaticExecution: false,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
