import {
  defaultLaunchBudgetState,
  launchModel,
  restoreLaunchBudgetState,
  type LaunchBudgetState,
  type PremisesScenario,
  type PreparationMode,
} from "./launch-budget";
import { defaultPointPreparationCategoryIds, pointPreparationCategoryIds } from "./point-preparation";
import { calculateAverageCheck } from "./revenue-model";
import type { FinancialProjectionContext } from "./financial-core";
import {
  defaultLocationRentPresetId,
  defaultRentFreeMonths,
  canonicalTemporalAssumptions,
  baseObjectPlanningReference,
  developmentLeadMonthsFor,
  isLocationRentPresetId,
  locationPlanningDefaults,
  locationRentPreset,
  locationTypes,
  networkRolloutDefaults,
  networkRolloutDistrictPresetIds,
  networkRolloutGroups,
  networkRolloutSchedule,
  rolloutOpeningWaves,
  sequentialRolloutOpeningWaves,
  networkRolloutPointsPerDistrict,
  networkRolloutSizeIds,
  standardStreetRentEntryDefaults,
  type LocationRentPresetId,
  type LocationType,
  type NetworkRolloutSize,
} from "./network-planning";

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

/** A wave lets identical points open sequentially without cloning their economics. */
export type OpeningWave = {
  openingMonth: number;
  count: number;
};

/** Runtime-only planning inputs for one independently scalable trading-point cohort. */
export type TradingPointCohort = {
  id: string;
  format: TradingPointFormat;
  realEstateMode: PremisesScenario;
  count: number;
  openingWaves: OpeningWave[];
  rentFreeMonths: number;
  totalAreaM2: number | null;
  kitchenAreaM2: number | null;
  guestAreaM2: number | null;
  /** Approved physical layout input; it overrides generic density rounding only for that cohort. */
  approvedSeatCount: number | null;
  monthlyRentRub: number | null;
  /** A planning selector only. The Financial Model receives monthlyRentRub. */
  locationRentPresetId: LocationRentPresetId;
  /** Editable source for monthly rent when a location preset is being used. */
  rentPerM2Rub: number | null;
  purchasePriceRub: number | null;
  prepaymentMonths: number | null;
  securityDepositMonths: number | null;
  /** Legacy manual point preparation value; retained for persisted v5 compatibility. */
  preparationRub: number | null;
  preparationMode: PreparationMode;
  preparationEnabledCategoryIds: string[];
  preparationManualRub: number | null;
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
  calendarStartMonth: number;
  logistics: {
    mode: "auto" | "external" | "own";
    externalMonthlyRub: number | null;
    ownedVehicleCapexRub: number | null;
    ownedMonthlyTotalRub: number | null;
  };
};

export type InvestorConfiguration = {
  schemaVersion: 8;
  scenarioId: InvestorScenarioId;
  /** A local override; it is never written back to the Financial Model source. */
  customChecksPerDay: number | null;
  launchBudget: LaunchBudgetState;
  networkScaling: NetworkScalingConfiguration;
};

export const investorConfigurationStorageKey = "kolobochnaya.investor-journey.v1";

/**
 * The Investor Terminal uses the latest approved flagship rent as its working
 * Base Object input. The historical 350 000 ₽ Financial Model is retained in
 * its governed source and is adjusted through the existing configured core.
 */
export function baseObjectLaunchBudgetState(): LaunchBudgetState {
  const reference = baseObjectPlanningReference();
  return {
    ...defaultLaunchBudgetState(),
    monthlyRentRub: reference.monthlyRentRub,
    rentFreeMonths: reference.rentFreeMonths,
  };
}

function fullPreparationLaunchBudgetState(launchBudget: LaunchBudgetState): LaunchBudgetState {
  return {
    ...launchBudget,
    preparationEnabledCategoryIds: launchModel.preparation.categories
      .filter((category) => category.enabled_by_default)
      .map((category) => category.id),
  };
}

/**
 * The immutable historical reference used by Financial Model v0.2.  It is not
 * a reset target for the Current Base Object: its 350k rent, zero rent-free
 * term and full integrated preparation belong to a different context.
 */
export function historicalIntegratedPilotConfiguration(): InvestorConfiguration {
  const reference = baseObjectPlanningReference();
  const launchBudget = fullPreparationLaunchBudgetState({
    ...defaultLaunchBudgetState(),
    monthlyRentRub: reference.historicalFinancialModelRentRub,
    rentFreeMonths: 0,
  });
  return {
    schemaVersion: 8,
    scenarioId: "realistic",
    customChecksPerDay: null,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveFiniteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function positiveIntegerOrNull(value: unknown) {
  const numeric = positiveFiniteOrNull(value);
  return numeric === null ? null : Math.floor(numeric);
}

function nonnegativeInteger(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function openingMonth(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function calendarMonth(value: unknown, fallback = 1) {
  const month = openingMonth(value, fallback);
  return month >= 1 && month <= 12 ? month : fallback;
}

function restoredOpeningWaves(value: unknown, count: number, fallbackMonth: number) {
  if (!Array.isArray(value)) return rolloutOpeningWaves(fallbackMonth, count);
  const waves = value
    .filter((wave): wave is Record<string, unknown> => Boolean(wave) && typeof wave === "object")
    .map((wave) => ({ openingMonth: openingMonth(wave.openingMonth, fallbackMonth), count: nonnegativeInteger(wave.count, 0) }))
    .filter((wave) => wave.count > 0)
    .sort((left, right) => left.openingMonth - right.openingMonth);
  const total = waves.reduce((sum, wave) => sum + wave.count, 0);
  if (total === count) return waves;
  return rolloutOpeningWaves(fallbackMonth, count);
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

function restoredLocationRentPresetId(value: unknown): LocationRentPresetId {
  return isLocationRentPresetId(value) ? value : "custom";
}

function restoredPointPreparationMode(value: unknown, legacyManualRub: number | null): PreparationMode {
  if (value === "manual" || value === "breakdown") return value;
  return legacyManualRub === null ? "breakdown" : "manual";
}

function restoredPointPreparationCategoryIds(value: unknown, format: TradingPointFormat, locationType: LocationType, sharedSeating: boolean | null) {
  const allowed = new Set(pointPreparationCategoryIds);
  if (!Array.isArray(value)) return defaultPointPreparationCategoryIds(format, locationType, sharedSeating);
  return [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
}

export function createTradingPointCohort(
  launchBudget = defaultLaunchBudgetState(),
  overrides: Partial<TradingPointCohort> = {},
): TradingPointCohort {
  const format = tradingPointFormats.includes(overrides.format as TradingPointFormat)
    ? overrides.format as TradingPointFormat
    : "with_seating";
  const locationType = locationTypes.includes(overrides.locationType as LocationType)
    ? overrides.locationType as LocationType
    : "street";
  const sharedSeating = booleanOrNull(valueOrDefault(overrides, "sharedSeating", null));
  const legacyPreparationRub = finiteOrNull(valueOrDefault(overrides, "preparationRub", null));
  const preparationManualRub = finiteOrNull(valueOrDefault(overrides, "preparationManualRub", legacyPreparationRub));
  return {
    id: typeof overrides.id === "string" && overrides.id.trim() ? overrides.id : "cohort-1",
    format,
    realEstateMode: overrides.realEstateMode === "purchase" || overrides.realEstateMode === "rent"
      ? overrides.realEstateMode
      : "rent",
    count: nonnegativeInteger(overrides.count),
    openingWaves: restoredOpeningWaves(overrides.openingWaves, nonnegativeInteger(overrides.count), 0),
    rentFreeMonths: nonnegativeInteger(valueOrDefault(overrides, "rentFreeMonths", defaultRentFreeMonths(locationType)), defaultRentFreeMonths(locationType)),
    // The existing LaunchBudget defaults describe an integrated object, not a
    // format-specific retail point. Fresh cohorts therefore start unknown until
    // a format-specific canonical assumption is available or the user enters it.
    totalAreaM2: finiteOrNull(valueOrDefault(overrides, "totalAreaM2", null)),
    kitchenAreaM2: finiteOrNull(valueOrDefault(overrides, "kitchenAreaM2", null)),
    guestAreaM2: format === "with_seating" ? finiteOrNull(valueOrDefault(overrides, "guestAreaM2", null)) : null,
    approvedSeatCount: format === "with_seating" ? positiveIntegerOrNull(valueOrDefault(overrides, "approvedSeatCount", null)) : null,
    monthlyRentRub: finiteOrNull(valueOrDefault(overrides, "monthlyRentRub", null)),
    locationRentPresetId: restoredLocationRentPresetId(valueOrDefault(overrides, "locationRentPresetId", "custom")),
    rentPerM2Rub: positiveFiniteOrNull(valueOrDefault(overrides, "rentPerM2Rub", null)),
    purchasePriceRub: finiteOrNull(valueOrDefault(overrides, "purchasePriceRub", null)),
    prepaymentMonths: permittedMonths(valueOrDefault(overrides, "prepaymentMonths", null), [1, 3, 12]),
    securityDepositMonths: permittedMonths(valueOrDefault(overrides, "securityDepositMonths", null), [1, 2, 3]),
    preparationRub: legacyPreparationRub,
    preparationMode: restoredPointPreparationMode(overrides.preparationMode, legacyPreparationRub),
    preparationEnabledCategoryIds: restoredPointPreparationCategoryIds(overrides.preparationEnabledCategoryIds, format, locationType, sharedSeating),
    preparationManualRub,
    // A new group follows the current canonical point baseline, never another
    // cohort's selected bar setting.
    barEnabled: typeof overrides.barEnabled === "boolean" ? overrides.barEnabled : launchBudget.barEnabled,
    sales: restoreCohortSales(overrides.sales),
    locationType,
    extractionAvailable: booleanOrNull(valueOrDefault(overrides, "extractionAvailable", null)),
    sharedSeating,
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

/**
 * A new scalable point starts from the approved Historic Center B+ planning
 * reference. The base integrated object remains a separate canonical result.
 */
export function createNetworkPointCohort(
  launchBudget = defaultLaunchBudgetState(),
  overrides: Partial<TradingPointCohort> = {},
): TradingPointCohort {
  const presetId = restoredLocationRentPresetId(overrides.locationRentPresetId ?? defaultLocationRentPresetId);
  const preset = presetId === "custom" ? null : locationRentPreset(presetId);
  const format = tradingPointFormats.includes(overrides.format as TradingPointFormat)
    ? overrides.format as TradingPointFormat
    : "takeaway";
  const rentEntryDefaults = standardStreetRentEntryDefaults();
  const rolloutDefaults = networkRolloutDefaults();
  const presetAreaIsTooSmallForOwnHall = format === "with_seating"
    && preset?.locationType === "street"
    && preset.baselineAreaM2 < 60;
  return createTradingPointCohort(launchBudget, {
    ...locationPlanningDefaults(preset?.locationType ?? "street", format),
    format,
    realEstateMode: preset?.realEstateMode ?? "rent",
    count: 1,
    locationType: preset?.locationType ?? "street",
    totalAreaM2: presetAreaIsTooSmallForOwnHall ? null : preset?.baselineAreaM2 ?? null,
    monthlyRentRub: presetAreaIsTooSmallForOwnHall ? null : preset?.monthlyRentRub ?? null,
    rentPerM2Rub: preset?.rentPerM2MonthRub ?? null,
    purchasePriceRub: preset?.purchasePriceRub ?? null,
    locationRentPresetId: preset?.id ?? "custom",
    prepaymentMonths: preset?.locationType === "street" && preset.realEstateMode === "rent" ? rentEntryDefaults.prepaymentMonths : null,
    securityDepositMonths: preset?.locationType === "street" && preset.realEstateMode === "rent" ? rentEntryDefaults.securityDepositMonths : null,
    barEnabled: typeof overrides.barEnabled === "boolean" ? overrides.barEnabled : rolloutDefaults.barEnabled,
    ...overrides,
  });
}

export function applyLocationRentPreset(cohort: TradingPointCohort, presetId: LocationRentPresetId): TradingPointCohort {
  if (presetId === "custom") return { ...cohort, locationRentPresetId: "custom", rentPerM2Rub: null };
  const preset = locationRentPreset(presetId);
  const presetAreaIsTooSmallForOwnHall = cohort.format === "with_seating"
    && preset.locationType === "street"
    && preset.baselineAreaM2 < 60;
  const rentEntryDefaults = standardStreetRentEntryDefaults();
  return {
    ...cohort,
    ...locationPlanningDefaults(preset.locationType, cohort.format),
    locationRentPresetId: preset.id,
    locationType: preset.locationType,
    realEstateMode: preset.realEstateMode,
    totalAreaM2: presetAreaIsTooSmallForOwnHall ? null : preset.baselineAreaM2,
    rentPerM2Rub: preset.rentPerM2MonthRub,
    monthlyRentRub: presetAreaIsTooSmallForOwnHall ? null : preset.monthlyRentRub,
    purchasePriceRub: preset.purchasePriceRub,
    prepaymentMonths: preset.locationType === "street" && preset.realEstateMode === "rent" ? rentEntryDefaults.prepaymentMonths : null,
    securityDepositMonths: preset.locationType === "street" && preset.realEstateMode === "rent" ? rentEntryDefaults.securityDepositMonths : null,
  };
}

function rolloutCohortId(presetId: Exclude<LocationRentPresetId, "custom">) {
  return `rollout-${presetId}`;
}

function baseOpeningMonth() {
  return networkRolloutSchedule().baseObjectFundingMonth
    + developmentLeadMonthsFor("with_seating", "street", true);
}

/**
 * Applies the governed serial physical rollout to the complete current
 * cohort list. The order repeats across approved formats for 9/13-point
 * waves; it never waits for the previous cohort's full-ramp month.
 */
function applySequentialRolloutSchedule(cohorts: TradingPointCohort[]): TradingPointCohort[] {
  const base = cohorts[0];
  if (!base) return cohorts;
  const additions = cohorts.slice(1);
  const waves = sequentialRolloutOpeningWaves(additions.map((cohort) => ({
    id: cohort.id,
    count: cohort.count,
    format: cohort.format,
    locationType: cohort.locationType,
  })));
  return [
    { ...base, openingWaves: [{ openingMonth: baseOpeningMonth(), count: 1 }] },
    ...additions.map((cohort) => ({ ...cohort, openingWaves: waves.get(cohort.id) ?? [] })),
  ];
}

function createRolloutCohort(
  launchBudget: LaunchBudgetState,
  presetId: Exclude<LocationRentPresetId, "custom">,
  count: number,
  id = rolloutCohortId(presetId),
) {
  const group = networkRolloutGroups().find((candidate) => candidate.presetId === presetId);
  if (!group) throw new Error(`Network rollout group ${presetId} is missing.`);
  const rentPreset = locationRentPreset(presetId);
  const streetRent = group.locationType === "street" && group.realEstateMode === "rent";
  const rentEntryDefaults = standardStreetRentEntryDefaults();
  const locationDefaults = locationPlanningDefaults(group.locationType, group.format);
  return createNetworkPointCohort(launchBudget, {
    id,
    locationRentPresetId: presetId,
    count,
    // The serial schedule is applied after every cohort is assembled, so a
    // format's date cannot be calculated in isolation from the prior opening.
    openingWaves: rolloutOpeningWaves(group.firstOpeningMonth, count),
    format: group.format,
    locationType: group.locationType,
    realEstateMode: group.realEstateMode,
    ...locationDefaults,
    totalAreaM2: group.baselineAreaM2,
    guestAreaM2: group.guestAreaM2,
    approvedSeatCount: group.approvedSeatCount,
    rentPerM2Rub: streetRent ? rentPreset.rentPerM2MonthRub : locationDefaults.rentPerM2Rub,
    monthlyRentRub: streetRent ? group.baselineAreaM2 * rentPreset.rentPerM2MonthRub : locationDefaults.monthlyRentRub,
    purchasePriceRub: null,
    prepaymentMonths: streetRent ? rentEntryDefaults.prepaymentMonths : locationDefaults.prepaymentMonths,
    securityDepositMonths: streetRent ? rentEntryDefaults.securityDepositMonths : locationDefaults.securityDepositMonths,
    sharedSeating: group.sharedSeating,
    barEnabled: group.barEnabled,
    preparationEnabledCategoryIds: group.preparationEnabledCategoryIds,
    sales: {
      mode: "custom",
      checksPerDay: group.checksPerDay,
      averageCheckRub: calculateAverageCheck(),
    },
  });
}

/**
 * Applies only the 4/8/12 distribution. Existing district groups retain their
 * independently edited point parameters; unrelated custom groups are never removed.
 */
export function applyNetworkRolloutPreset(
  configuration: NetworkScalingConfiguration,
  launchBudget: LaunchBudgetState,
  size: NetworkRolloutSize,
): NetworkScalingConfiguration {
  const perDistrict = networkRolloutPointsPerDistrict(size);
  const districts = networkRolloutDistrictPresetIds();
  const usedIds = new Set(configuration.cohorts.map((cohort) => cohort.id));
  const additions: TradingPointCohort[] = [];
  const cohorts = configuration.cohorts.map((cohort) => {
    const district = districts.find((presetId) => cohort.id === rolloutCohortId(presetId) || cohort.locationRentPresetId === presetId);
    if (!district) return cohort;
    const group = networkRolloutGroups().find((candidate) => candidate.presetId === district);
    return {
      ...cohort,
      count: perDistrict,
      openingWaves: rolloutOpeningWaves(group?.firstOpeningMonth ?? 0, perDistrict),
    };
  });
  for (const district of districts) {
    const exists = cohorts.some((cohort) => cohort.id === rolloutCohortId(district) || cohort.locationRentPresetId === district);
    if (exists) continue;
    let id = rolloutCohortId(district);
    let index = 2;
    while (usedIds.has(id)) id = `${rolloutCohortId(district)}-${index++}`;
    usedIds.add(id);
    additions.push(createRolloutCohort(launchBudget, district, perDistrict, id));
  }
  return { ...configuration, cohorts: applySequentialRolloutSchedule([...cohorts, ...additions]) };
}

export function currentNetworkRolloutSize(configuration: NetworkScalingConfiguration): NetworkRolloutSize | "custom" {
  const districts = networkRolloutDistrictPresetIds();
  const additional = configuration.cohorts.slice(1);
  for (const size of networkRolloutSizeIds) {
    const expected = networkRolloutPointsPerDistrict(size);
    const matchesDistricts = districts.every((presetId) => {
      const group = additional.find((cohort) => cohort.id === rolloutCohortId(presetId) || cohort.locationRentPresetId === presetId);
      return group?.count === expected;
    });
    const otherPositiveGroups = additional.some((cohort) => {
      const isDistrict = districts.some((presetId) => cohort.id === rolloutCohortId(presetId) || cohort.locationRentPresetId === presetId);
      return !isDistrict && cohort.count > 0;
    });
    if (matchesDistricts && !otherPositiveGroups) return size;
  }
  return "custom";
}

/** State synchronization for input editing; it does not calculate financial output. */
export function updateCohortAreaFromRentPreset(cohort: TradingPointCohort, totalAreaM2: number | null): TradingPointCohort {
  return {
    ...cohort,
    totalAreaM2,
    monthlyRentRub: totalAreaM2 === null || cohort.rentPerM2Rub === null ? cohort.monthlyRentRub : totalAreaM2 * cohort.rentPerM2Rub,
    locationRentPresetId: "custom",
  };
}

export function updateCohortRentRate(cohort: TradingPointCohort, rentPerM2Rub: number | null): TradingPointCohort {
  return {
    ...cohort,
    rentPerM2Rub,
    monthlyRentRub: rentPerM2Rub === null || cohort.totalAreaM2 === null ? cohort.monthlyRentRub : cohort.totalAreaM2 * rentPerM2Rub,
    locationRentPresetId: "custom",
  };
}

export function updateCohortMonthlyRent(cohort: TradingPointCohort, monthlyRentRub: number | null): TradingPointCohort {
  return { ...cohort, monthlyRentRub, rentPerM2Rub: null, locationRentPresetId: "custom" };
}

/**
 * Keeps a group’s opening plan coherent when its total is edited in the UI.
 * Existing waves are preserved first; added identical points use the approved
 * repeated-wave cadence instead of silently opening on the same month.
 */
export function updateCohortCount(cohort: TradingPointCohort, nextCount: number): TradingPointCohort {
  const count = Math.max(0, Math.floor(nextCount));
  const waves = cohort.openingWaves
    .filter((wave) => wave.count > 0)
    .sort((left, right) => left.openingMonth - right.openingMonth)
    .map((wave) => ({ ...wave }));
  let represented = waves.reduce((sum, wave) => sum + wave.count, 0);
  if (represented > count) {
    let remaining = count;
    const trimmed = waves.flatMap((wave) => {
      if (remaining <= 0) return [];
      const waveCount = Math.min(wave.count, remaining);
      remaining -= waveCount;
      return [{ ...wave, count: waveCount }];
    });
    return { ...cohort, count, openingWaves: trimmed };
  }
  const cadence = 1;
  let nextMonth = waves.at(-1)?.openingMonth ?? 0;
  while (represented < count) {
    nextMonth = represented === 0 ? nextMonth : nextMonth + cadence;
    waves.push({ openingMonth: nextMonth, count: 1 });
    represented += 1;
  }
  return { ...cohort, count, openingWaves: waves };
}

/** Moves a group’s representative first opening while preserving wave spacing. */
export function updateCohortFirstOpeningMonth(cohort: TradingPointCohort, nextMonth: number): TradingPointCohort {
  const first = cohort.openingWaves.at(0)?.openingMonth ?? 0;
  const normalized = openingMonth(nextMonth, first);
  const delta = normalized - first;
  return {
    ...cohort,
    openingWaves: cohort.openingWaves.map((wave) => ({ ...wave, openingMonth: Math.max(0, wave.openingMonth + delta) })),
  };
}

function restoreTradingPointCohort(value: unknown, launchBudget: LaunchBudgetState, fallbackId: string): TradingPointCohort {
  if (!value || typeof value !== "object") return createTradingPointCohort(launchBudget, { id: fallbackId });
  return createTradingPointCohort(launchBudget, { ...(value as Partial<TradingPointCohort>), id: (value as Partial<TradingPointCohort>).id || fallbackId });
}

function applyKnownStreetDefaults(cohort: TradingPointCohort): TradingPointCohort {
  if (cohort.locationType !== "street" || cohort.realEstateMode !== "rent" || cohort.locationRentPresetId === "custom") return cohort;
  const locationDefaults = locationPlanningDefaults("street", cohort.format);
  const rentEntryDefaults = standardStreetRentEntryDefaults();
  return {
    ...cohort,
    prepaymentMonths: cohort.prepaymentMonths ?? rentEntryDefaults.prepaymentMonths,
    securityDepositMonths: cohort.securityDepositMonths ?? rentEntryDefaults.securityDepositMonths,
    utilitiesMonthlyRub: cohort.utilitiesMonthlyRub ?? locationDefaults.utilitiesMonthlyRub,
    videoAllowanceRub: cohort.videoAllowanceRub ?? locationDefaults.videoAllowanceRub,
    alarmAllowanceRub: cohort.alarmAllowanceRub ?? locationDefaults.alarmAllowanceRub,
  };
}

type LegacyNetworkScalingConfiguration = {
  pointCount?: unknown;
  pointFormat?: unknown;
  pointBarEnabled?: unknown;
  productionGrowEnabled?: unknown;
};

export function defaultNetworkScalingConfiguration(launchBudget = baseObjectLaunchBudgetState()): NetworkScalingConfiguration {
  const defaultSize: NetworkRolloutSize = 4;
  const perDistrict = networkRolloutPointsPerDistrict(defaultSize);
  return {
    cohorts: applySequentialRolloutSchedule([
      createTradingPointCohort(launchBudget, { format: "with_seating", realEstateMode: "rent", count: 1, openingWaves: [{ openingMonth: baseOpeningMonth(), count: 1 }] }),
      ...networkRolloutGroups().map((group) => createRolloutCohort(launchBudget, group.presetId, perDistrict)),
    ]),
    productionGrowEnabled: launchBudget.growEnabled,
    productionSchedule: "one_main_shift",
    calendarStartMonth: canonicalTemporalAssumptions().openingCalendarMonth,
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
  const rawCohorts = Array.isArray(input.cohorts) ? input.cohorts as Array<Partial<TradingPointCohort>> : [];
  const resolvedCohorts = (cohorts.length ? cohorts : defaults.cohorts).map((cohort, index) => {
    const rollout = networkRolloutGroups().find((group) => cohort.id === rolloutCohortId(group.presetId) || cohort.locationRentPresetId === group.presetId);
    const isDefaultRolloutCohort = rollout !== undefined && cohort.id === rolloutCohortId(rollout.presetId);
    const fallbackOpeningMonth = index === 0
      ? baseOpeningMonth()
      : rollout?.firstOpeningMonth ?? 0;
    return {
      ...cohort,
      guestAreaM2: isDefaultRolloutCohort && cohort.guestAreaM2 === null ? rollout.guestAreaM2 : cohort.guestAreaM2,
      approvedSeatCount: isDefaultRolloutCohort && cohort.approvedSeatCount === null ? rollout.approvedSeatCount : cohort.approvedSeatCount,
      openingWaves: restoredOpeningWaves(rawCohorts[index]?.openingWaves, cohort.count, fallbackOpeningMonth),
      rentFreeMonths: nonnegativeInteger(rawCohorts[index]?.rentFreeMonths, cohort.rentFreeMonths),
    };
  });
  return {
    cohorts: resolvedCohorts,
    productionGrowEnabled: typeof input.productionGrowEnabled === "boolean" ? input.productionGrowEnabled : defaults.productionGrowEnabled,
    productionSchedule: input.productionSchedule === "custom" ? "custom" : "one_main_shift",
    calendarStartMonth: calendarMonth(input.calendarStartMonth, defaults.calendarStartMonth),
    logistics: {
      mode: input.logistics?.mode === "external" || input.logistics?.mode === "own" ? input.logistics.mode : "auto",
      externalMonthlyRub: finiteOrNull(input.logistics?.externalMonthlyRub),
      ownedVehicleCapexRub: finiteOrNull(input.logistics?.ownedVehicleCapexRub),
      ownedMonthlyTotalRub: finiteOrNull(input.logistics?.ownedMonthlyTotalRub),
    },
  };
}

/** Current approved planning context for the flagship Base Object. */
export function currentBaseObjectInvestorConfiguration(): InvestorConfiguration {
  const launchBudget = baseObjectLaunchBudgetState();
  return {
    schemaVersion: 8,
    scenarioId: "realistic",
    customChecksPerDay: null,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

/** Current Base assumptions with the full preparation scope enabled. */
export function currentBaseObjectFullPreparationConfiguration(): InvestorConfiguration {
  const defaults = currentBaseObjectInvestorConfiguration();
  const launchBudget = fullPreparationLaunchBudgetState(defaults.launchBudget);
  return {
    ...defaults,
    launchBudget,
    networkScaling: defaultNetworkScalingConfiguration(launchBudget),
  };
}

/** Kept as the runtime default; its context is explicitly Current Base Object. */
export function defaultInvestorConfiguration(): InvestorConfiguration {
  return currentBaseObjectInvestorConfiguration();
}

export function restoreInvestorConfiguration(value: unknown): InvestorConfiguration {
  const defaults = defaultInvestorConfiguration();
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<InvestorConfiguration>;
  // Missing legacy state must recover the current governed Base Object default,
  // rather than the historical raw form default embedded in Launch Budget.
  const restoredLaunchBudget = input.launchBudget ? restoreLaunchBudgetState(input.launchBudget) : defaults.launchBudget;
  const legacyLaunchBudget = input.launchBudget as Record<string, unknown> | undefined;
  const launchBudget = legacyLaunchBudget && !Object.prototype.hasOwnProperty.call(legacyLaunchBudget, "rentFreeMonths")
    ? { ...restoredLaunchBudget, rentFreeMonths: defaults.launchBudget.rentFreeMonths }
    : restoredLaunchBudget;
  const networkScaling = restoreNetworkScalingConfiguration(input.networkScaling, launchBudget);
  return {
    schemaVersion: 8,
    scenarioId: investorScenarioIds.includes(input.scenarioId as InvestorScenarioId)
      ? input.scenarioId as InvestorScenarioId
      : defaults.scenarioId,
    customChecksPerDay: typeof input.customChecksPerDay === "number"
      && Number.isFinite(input.customChecksPerDay)
      && input.customChecksPerDay > 0
      ? Math.floor(input.customChecksPerDay)
      : null,
    launchBudget,
    networkScaling: { ...networkScaling, cohorts: networkScaling.cohorts.map(applyKnownStreetDefaults) },
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

export function investorConfigurationIsCurrentBaseFullPreparation(configuration: InvestorConfiguration) {
  const baseline = currentBaseObjectFullPreparationConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: baseline.scenarioId })
    === JSON.stringify(calculationState(baseline));
}

export function financialProjectionContextForConfiguration(configuration: InvestorConfiguration): FinancialProjectionContext {
  const historical = historicalIntegratedPilotConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: historical.scenarioId })
    === JSON.stringify(calculationState(historical))
    ? "historical_integrated_pilot"
    : "current_base_object";
}

export function investorConfigurationIsReadyPremisesDefault(configuration: InvestorConfiguration) {
  const baseline = defaultInvestorConfiguration();
  return JSON.stringify({ ...calculationState(configuration), scenarioId: baseline.scenarioId })
    === JSON.stringify(calculationState(baseline));
}
