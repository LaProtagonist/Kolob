import {
  defaultLaunchBudgetState,
  launchModel,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
  type PremisesScenario,
} from "./launch-budget";

export const investorScenarioIds = ["pessimistic", "realistic", "optimistic"] as const;
export type InvestorScenarioId = (typeof investorScenarioIds)[number];

export const tradingPointFormats = ["with_seating", "takeaway"] as const;
export type TradingPointFormat = (typeof tradingPointFormats)[number];

/** Runtime-only planning inputs for one independently scalable trading-point cohort. */
export type TradingPointCohort = {
  id: string;
  format: TradingPointFormat;
  realEstateMode: PremisesScenario;
  count: number;
  totalAreaM2: number | null;
  kitchenAreaM2: number | null;
  guestAreaM2: number | null;
  monthlyRentRub: number | null;
  purchasePriceRub: number | null;
  prepaymentMonths: number;
  securityDepositMonths: number;
  preparationRub: number | null;
  barEnabled: boolean;
};

export type NetworkScalingConfiguration = {
  cohorts: TradingPointCohort[];
  productionGrowEnabled: boolean;
};

export type InvestorConfiguration = {
  schemaVersion: 2;
  scenarioId: InvestorScenarioId;
  /** A local override; it is never written back to the Financial Model source. */
  customChecksPerDay: number | null;
  launchBudget: LaunchBudgetState;
  networkScaling: NetworkScalingConfiguration;
};

export const investorConfigurationStorageKey = "kolobochnaya.investor-journey.v1";

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonnegativeInteger(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function valueOrDefault<T extends object, K extends keyof T>(value: T, key: K, fallback: T[K]) {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : fallback;
}

function pointPreparationDefault(launchBudget: LaunchBudgetState, format: TradingPointFormat) {
  const enabled = new Set(launchBudget.preparationEnabledCategoryIds);
  return launchModel.preparation.categories
    .filter((category) => category.id === "PREP-BUILT-IN" || (format === "with_seating" && category.id === "PREP-GUEST-AREA"))
    .reduce((total, category) => total + (enabled.has(category.id) ? category.amount_rub : 0), 0);
}

export function createTradingPointCohort(
  launchBudget = defaultLaunchBudgetState(),
  overrides: Partial<TradingPointCohort> = {},
): TradingPointCohort {
  const format = tradingPointFormats.includes(overrides.format as TradingPointFormat)
    ? overrides.format as TradingPointFormat
    : "with_seating";
  return {
    id: typeof overrides.id === "string" && overrides.id.trim() ? overrides.id : "cohort-1",
    format,
    realEstateMode: overrides.realEstateMode === "purchase" || overrides.realEstateMode === "rent"
      ? overrides.realEstateMode
      : launchBudget.premisesScenario,
    count: nonnegativeInteger(overrides.count),
    totalAreaM2: finiteOrNull(valueOrDefault(overrides, "totalAreaM2", launchBudget.totalAreaM2)),
    kitchenAreaM2: finiteOrNull(valueOrDefault(overrides, "kitchenAreaM2", launchBudget.kitchenAreaM2)),
    guestAreaM2: format === "with_seating" ? finiteOrNull(valueOrDefault(overrides, "guestAreaM2", launchBudget.guestAreaM2)) : null,
    monthlyRentRub: finiteOrNull(valueOrDefault(overrides, "monthlyRentRub", launchBudget.monthlyRentRub)),
    purchasePriceRub: finiteOrNull(valueOrDefault(overrides, "purchasePriceRub", launchBudget.purchasePriceRub)),
    prepaymentMonths: [1, 3, 12].includes(Number(overrides.prepaymentMonths)) ? Number(overrides.prepaymentMonths) : launchBudget.prepaymentMonths,
    securityDepositMonths: [1, 2, 3].includes(Number(overrides.securityDepositMonths)) ? Number(overrides.securityDepositMonths) : launchBudget.securityDepositMonths,
    preparationRub: finiteOrNull(valueOrDefault(overrides, "preparationRub", pointPreparationDefault(launchBudget, format))),
    barEnabled: typeof overrides.barEnabled === "boolean" ? overrides.barEnabled : launchBudget.barEnabled,
  };
}

function restoreTradingPointCohort(value: unknown, launchBudget: LaunchBudgetState, fallbackId: string): TradingPointCohort {
  if (!value || typeof value !== "object") return createTradingPointCohort(launchBudget, { id: fallbackId });
  return createTradingPointCohort(launchBudget, { ...(value as Partial<TradingPointCohort>), id: (value as Partial<TradingPointCohort>).id || fallbackId });
}

type LegacyNetworkScalingConfiguration = {
  pointCount?: unknown;
  pointFormat?: unknown;
  pointBarEnabled?: unknown;
  productionGrowEnabled?: unknown;
};

export function defaultNetworkScalingConfiguration(launchBudget = defaultLaunchBudgetState()): NetworkScalingConfiguration {
  return {
    cohorts: [createTradingPointCohort(launchBudget)],
    productionGrowEnabled: launchBudget.growEnabled,
  };
}

/** Restores v2.1's single point configuration as one v2.2 cohort. */
export function restoreNetworkScalingConfiguration(value: unknown, launchBudget: LaunchBudgetState): NetworkScalingConfiguration {
  const defaults = defaultNetworkScalingConfiguration(launchBudget);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<NetworkScalingConfiguration> & LegacyNetworkScalingConfiguration;
  const cohorts = Array.isArray(input.cohorts)
    ? input.cohorts.map((cohort, index) => restoreTradingPointCohort(cohort, launchBudget, `cohort-${index + 1}`))
    : [createTradingPointCohort(launchBudget, {
      id: "cohort-1",
      format: input.pointFormat === "without_seating" ? "takeaway" : "with_seating",
      count: nonnegativeInteger(input.pointCount),
      barEnabled: typeof input.pointBarEnabled === "boolean" ? input.pointBarEnabled : launchBudget.barEnabled,
    })];
  return {
    cohorts: cohorts.length ? cohorts : defaults.cohorts,
    productionGrowEnabled: typeof input.productionGrowEnabled === "boolean" ? input.productionGrowEnabled : defaults.productionGrowEnabled,
  };
}

export function defaultInvestorConfiguration(): InvestorConfiguration {
  const launchBudget = defaultLaunchBudgetState();
  return {
    schemaVersion: 2,
    scenarioId: "realistic",
    customChecksPerDay: null,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

/** The Financial Model baseline: rent and the full canonical preparation scope. */
export function canonicalInvestorConfiguration(): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  const launchBudget = {
    ...defaults.launchBudget,
    preparationEnabledCategoryIds: launchModel.preparation.categories
      .filter((category) => category.enabled_by_default)
      .map((category) => category.id),
  };
  return {
    ...defaults,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

export function restoreInvestorConfiguration(value: unknown): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<InvestorConfiguration>;
  const launchBudget = restoreLaunchBudgetState(input.launchBudget);
  return {
    schemaVersion: 2,
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
    === JSON.stringify(calculationState(baseline));
}

export function investorConfigurationIsReadyPremisesDefault(configuration: InvestorConfiguration) {
  const baseline = defaultInvestorConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: baseline.scenarioId })
    === JSON.stringify(calculationState(baseline));
}
