import { economicsData } from "./economics";
import { investorScenarioIds, type SheetInputs } from "./investor-configuration";

// Loaded on demand by the provider: it pulls the financial projection, which must stay
// out of the main bundle that every public page downloads.

/** Traffic equal to the scenario's own value stays "by scenario", as when typed on the page. */
export function withoutScenarioTraffic(inputs: SheetInputs): SheetInputs {
  const scenarioId = investorScenarioIds.find((id) => id === inputs.scenario_default) ?? "realistic";
  if (inputs.checks_per_day !== economicsData.scenariosById[scenarioId].checksPerDay) return inputs;
  const { checks_per_day: _scenarioTraffic, ...rest } = inputs;
  return rest;
}
