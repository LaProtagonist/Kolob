import {
  defaultLaunchBudgetState,
  launchModel,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
} from "./launch-budget";

export const investorScenarioIds = ["pessimistic", "realistic", "optimistic"] as const;
export type InvestorScenarioId = (typeof investorScenarioIds)[number];

export const networkPointFormats = ["with_seating", "without_seating"] as const;
export type NetworkPointFormat = (typeof networkPointFormats)[number];

/** Runtime-only inputs for the repeatable trading point in the network view. */
export type NetworkScalingConfiguration = {
  pointCount: number;
  pointFormat: NetworkPointFormat;
  pointBarEnabled: boolean;
  productionGrowEnabled: boolean;
};

export type InvestorConfiguration = {
  schemaVersion: 1;
  scenarioId: InvestorScenarioId;
  /**
   * A local investor override. `null` means that the selected canonical
   * scenario supplies traffic; a positive integer is never written back to
   * the Financial Model source.
   */
  customChecksPerDay: number | null;
  launchBudget: LaunchBudgetState;
  networkScaling: NetworkScalingConfiguration;
};

export const investorConfigurationStorageKey = "kolobochnaya.investor-journey.v1";

export function defaultNetworkScalingConfiguration(launchBudget = defaultLaunchBudgetState()): NetworkScalingConfiguration {
  return {
    pointCount: 1,
    pointFormat: "with_seating",
    pointBarEnabled: launchBudget.barEnabled,
    productionGrowEnabled: launchBudget.growEnabled,
  };
}

export function restoreNetworkScalingConfiguration(value: unknown, launchBudget: LaunchBudgetState): NetworkScalingConfiguration {
  const defaults = defaultNetworkScalingConfiguration(launchBudget);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<NetworkScalingConfiguration>;
  return {
    pointCount: typeof input.pointCount === "number" && Number.isFinite(input.pointCount) && input.pointCount >= 1
      ? Math.floor(input.pointCount)
      : defaults.pointCount,
    pointFormat: networkPointFormats.includes(input.pointFormat as NetworkPointFormat)
      ? input.pointFormat as NetworkPointFormat
      : defaults.pointFormat,
    pointBarEnabled: typeof input.pointBarEnabled === "boolean" ? input.pointBarEnabled : defaults.pointBarEnabled,
    productionGrowEnabled: typeof input.productionGrowEnabled === "boolean" ? input.productionGrowEnabled : defaults.productionGrowEnabled,
  };
}

export function defaultInvestorConfiguration(): InvestorConfiguration {
  const launchBudget = defaultLaunchBudgetState();
  return {
    schemaVersion: 1,
    scenarioId: "realistic",
    customChecksPerDay: null,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

/** The Financial Model baseline: rent and the full canonical preparation scope. */
export function canonicalInvestorConfiguration(): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  return {
    ...defaults,
    launchBudget: {
      ...defaults.launchBudget,
      preparationEnabledCategoryIds: launchModel.preparation.categories
        .filter((category) => category.enabled_by_default)
        .map((category) => category.id),
    },
  };
}

export function restoreInvestorConfiguration(value: unknown): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<InvestorConfiguration>;
  const launchBudget = restoreLaunchBudgetState(input.launchBudget);
  return {
    schemaVersion: 1,
    scenarioId: investorScenarioIds.includes(input.scenarioId as InvestorScenarioId)
      ? input.scenarioId as InvestorScenarioId
      : defaults.scenarioId,
    customChecksPerDay: typeof input.customChecksPerDay === "number"
      && Number.isFinite(input.customChecksPerDay)
      && input.customChecksPerDay > 0
      ? Math.floor(input.customChecksPerDay)
      : null,
    launchBudget,
    networkScaling: restoreNetworkScalingConfiguration(input.networkScaling, launchBudget),
  };
}

export function investorConfigurationIsBaseline(configuration: InvestorConfiguration) {
  const baseline = defaultInvestorConfiguration();
  return JSON.stringify({ ...configuration, scenarioId: baseline.scenarioId, customChecksPerDay: null })
    === JSON.stringify(baseline);
}

function calculationState(configuration: InvestorConfiguration) {
  const { preparationAccordionOpen, operatingReserveAccordionOpen, ...launchBudget } = configuration.launchBudget;
  return { ...configuration, launchBudget };
}

export function investorConfigurationIsCanonical(configuration: InvestorConfiguration) {
  const baseline = canonicalInvestorConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: baseline.scenarioId })
    === JSON.stringify(calculationState(canonicalInvestorConfiguration()));
}

export function investorConfigurationIsReadyPremisesDefault(configuration: InvestorConfiguration) {
  const baseline = defaultInvestorConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: baseline.scenarioId })
    === JSON.stringify(calculationState(defaultInvestorConfiguration()));
}
