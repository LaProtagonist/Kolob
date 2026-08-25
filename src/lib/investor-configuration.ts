import {
  defaultLaunchBudgetState,
  launchModel,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
  type PremisesScenario,
} from "./launch-budget";
import { locationTypes, type LocationType } from "./network-planning";

export const investorScenarioIds = ["pessimistic", "realistic", "optimistic"] as const;
export type InvestorScenarioId = (typeof investorScenarioIds)[number];

export const tradingPointFormats = ["with_seating", "takeaway"] as const;
export type TradingPointFormat = (typeof tradingPointFormats)[number];

export type CohortSalesConfiguration = {
  /** Baseline inherits the selected Financial Model scenario for this browser. */
  mode: "baseline" | "custom";
  checksPerDay: number | null;
  averageCheckRub: number | null;
};

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
  prepaymentMonths: number | null;
  securityDepositMonths: number | null;
  preparationRub: number | null;
  barEnabled: boolean;
  sales: CohortSalesConfiguration;
  /** Location is independent from the point format and property tenure. */
  locationType: LocationType;
  extractionAvailable: boolean | null;
  sharedSeating: boolean | null;
  venueSecurityIncluded: boolean | null;
  commonCleaningIncluded: boolean | null;
  utilitiesIncluded: boolean | null;
  utilitiesMonthlyRub: number | null;
  serviceChargeMonthlyRub: number | null;
  storageRentMonthlyRub: number | null;
  revenueSharePercent: number | null;
  minimumGuaranteeMonthlyRub: number | null;
  fitoutAllowanceRub: number | null;
  videoAllowanceRub: number | null;
  alarmAllowanceRub: number | null;
  initialInventoryDays: number;
};

export type NetworkScalingConfiguration = {
  cohorts: TradingPointCohort[];
  productionGrowEnabled: boolean;
  productionSchedule: "one_main_shift" | "custom";
  logistics: {
    mode: "auto" | "external" | "own";
    externalMonthlyRub: number | null;
    ownedVehicleCapexRub: number | null;
    ownedMonthlyTotalRub: number | null;
  };
};

export type InvestorConfiguration = {
  schemaVersion: 4;
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

function positiveFiniteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonnegativeInteger(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function permittedMonths(value: unknown, permitted: number[]) {
  return permitted.includes(Number(value)) ? Number(value) : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function valueOrDefault<T extends object, K extends keyof T>(value: T, key: K, fallback: T[K]) {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : fallback;
}

function restoreCohortSales(value: unknown): CohortSalesConfiguration {
  if (!value || typeof value !== "object") {
    return { mode: "baseline", checksPerDay: null, averageCheckRub: null };
  }
  const input = value as Partial<CohortSalesConfiguration>;
  return {
    mode: input.mode === "custom" ? "custom" : "baseline",
    checksPerDay: positiveFiniteOrNull(input.checksPerDay) === null ? null : Math.floor(input.checksPerDay as number),
    averageCheckRub: positiveFiniteOrNull(input.averageCheckRub),
  };
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
      : "rent",
    count: nonnegativeInteger(overrides.count),
    // The existing LaunchBudget defaults describe an integrated object, not a
    // format-specific retail point. Fresh cohorts therefore start unknown until
    // a format-specific canonical assumption is available or the user enters it.
    totalAreaM2: finiteOrNull(valueOrDefault(overrides, "totalAreaM2", null)),
    kitchenAreaM2: finiteOrNull(valueOrDefault(overrides, "kitchenAreaM2", null)),
    guestAreaM2: format === "with_seating" ? finiteOrNull(valueOrDefault(overrides, "guestAreaM2", null)) : null,
    monthlyRentRub: finiteOrNull(valueOrDefault(overrides, "monthlyRentRub", null)),
    purchasePriceRub: finiteOrNull(valueOrDefault(overrides, "purchasePriceRub", null)),
    prepaymentMonths: permittedMonths(valueOrDefault(overrides, "prepaymentMonths", null), [1, 3, 12]),
    securityDepositMonths: permittedMonths(valueOrDefault(overrides, "securityDepositMonths", null), [1, 2, 3]),
    preparationRub: finiteOrNull(valueOrDefault(overrides, "preparationRub", null)),
    // A new group follows the current canonical point baseline, never another
    // cohort's selected bar setting.
    barEnabled: typeof overrides.barEnabled === "boolean" ? overrides.barEnabled : launchBudget.barEnabled,
    sales: restoreCohortSales(overrides.sales),
    locationType: locationTypes.includes(overrides.locationType as LocationType)
      ? overrides.locationType as LocationType
      : "street",
    extractionAvailable: booleanOrNull(valueOrDefault(overrides, "extractionAvailable", null)),
    sharedSeating: booleanOrNull(valueOrDefault(overrides, "sharedSeating", null)),
    venueSecurityIncluded: booleanOrNull(valueOrDefault(overrides, "venueSecurityIncluded", null)),
    commonCleaningIncluded: booleanOrNull(valueOrDefault(overrides, "commonCleaningIncluded", null)),
    utilitiesIncluded: booleanOrNull(valueOrDefault(overrides, "utilitiesIncluded", null)),
    utilitiesMonthlyRub: finiteOrNull(valueOrDefault(overrides, "utilitiesMonthlyRub", null)),
    serviceChargeMonthlyRub: finiteOrNull(valueOrDefault(overrides, "serviceChargeMonthlyRub", null)),
    storageRentMonthlyRub: finiteOrNull(valueOrDefault(overrides, "storageRentMonthlyRub", null)),
    revenueSharePercent: finiteOrNull(valueOrDefault(overrides, "revenueSharePercent", null)),
    minimumGuaranteeMonthlyRub: finiteOrNull(valueOrDefault(overrides, "minimumGuaranteeMonthlyRub", null)),
    fitoutAllowanceRub: finiteOrNull(valueOrDefault(overrides, "fitoutAllowanceRub", null)),
    videoAllowanceRub: finiteOrNull(valueOrDefault(overrides, "videoAllowanceRub", null)),
    alarmAllowanceRub: finiteOrNull(valueOrDefault(overrides, "alarmAllowanceRub", null)),
    initialInventoryDays: nonnegativeInteger(valueOrDefault(overrides, "initialInventoryDays", 3), 3),
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
    cohorts: [createTradingPointCohort(launchBudget, { format: "with_seating", realEstateMode: "rent", count: 1 })],
    productionGrowEnabled: launchBudget.growEnabled,
    productionSchedule: "one_main_shift",
    logistics: { mode: "auto", externalMonthlyRub: null, ownedVehicleCapexRub: null, ownedMonthlyTotalRub: null },
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
      realEstateMode: launchBudget.premisesScenario,
      count: nonnegativeInteger(input.pointCount),
      barEnabled: typeof input.pointBarEnabled === "boolean" ? input.pointBarEnabled : launchBudget.barEnabled,
      totalAreaM2: launchBudget.totalAreaM2,
      kitchenAreaM2: launchBudget.kitchenAreaM2,
      guestAreaM2: launchBudget.guestAreaM2,
      monthlyRentRub: launchBudget.monthlyRentRub,
      purchasePriceRub: launchBudget.purchasePriceRub,
      prepaymentMonths: launchBudget.prepaymentMonths,
      securityDepositMonths: launchBudget.securityDepositMonths,
      preparationRub: null,
    })];
  return {
    cohorts: cohorts.length ? cohorts : defaults.cohorts,
    productionGrowEnabled: typeof input.productionGrowEnabled === "boolean" ? input.productionGrowEnabled : defaults.productionGrowEnabled,
    productionSchedule: input.productionSchedule === "custom" ? "custom" : "one_main_shift",
    logistics: {
      mode: input.logistics?.mode === "external" || input.logistics?.mode === "own" ? input.logistics.mode : "auto",
      externalMonthlyRub: finiteOrNull(input.logistics?.externalMonthlyRub),
      ownedVehicleCapexRub: finiteOrNull(input.logistics?.ownedVehicleCapexRub),
      ownedMonthlyTotalRub: finiteOrNull(input.logistics?.ownedMonthlyTotalRub),
    },
  };
}

export function defaultInvestorConfiguration(): InvestorConfiguration {
  const launchBudget = defaultLaunchBudgetState();
  return {
    schemaVersion: 4,
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
    schemaVersion: 4,
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
