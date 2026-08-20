import {
  defaultLaunchBudgetState,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
} from "./launch-budget";

export const investorScenarioIds = ["pessimistic", "realistic", "optimistic"] as const;
export type InvestorScenarioId = (typeof investorScenarioIds)[number];

export type InvestorConfiguration = {
  schemaVersion: 1;
  scenarioId: InvestorScenarioId;
  launchBudget: LaunchBudgetState;
};

export const investorConfigurationStorageKey = "kolobochnaya.investor-journey.v1";

export function defaultInvestorConfiguration(): InvestorConfiguration {
  return {
    schemaVersion: 1,
    scenarioId: "realistic",
    launchBudget: defaultLaunchBudgetState(),
  };
}

export function restoreInvestorConfiguration(value: unknown): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<InvestorConfiguration>;
  return {
    schemaVersion: 1,
    scenarioId: investorScenarioIds.includes(input.scenarioId as InvestorScenarioId)
      ? input.scenarioId as InvestorScenarioId
      : defaults.scenarioId,
    launchBudget: restoreLaunchBudgetState(input.launchBudget),
  };
}

export function investorConfigurationIsBaseline(configuration: InvestorConfiguration) {
  const baseline = defaultInvestorConfiguration();
  return JSON.stringify({ ...configuration, scenarioId: baseline.scenarioId })
    === JSON.stringify(baseline);
}
