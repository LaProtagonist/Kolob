import planningSnapshot from "../content/network-planning-data.json";
import { calculateEmployerContributions, type EmployerContributionPolicy } from "./employer-contributions";

export const locationTypes = ["street", "foodhall", "creative_cluster", "foodtruck"] as const;
export type LocationType = (typeof locationTypes)[number];
export type RosterSchedule = "core" | "peak" | "production";
export const locationRentPresetIds = [
  "nevsky-premium",
  "central-high-traffic",
  "historic-center-core",
  "historic-center-value",
  "ligovsky-21-flagship",
  "custom",
] as const;
export type LocationRentPresetId = (typeof locationRentPresetIds)[number];

const snapshot = planningSnapshot as any;
const planning = snapshot.planning;
const canonical = snapshot.canonicalReferences;

export const networkPlanningModel = planning;

export type LocationRentPreset = {
  id: Exclude<LocationRentPresetId, "custom">;
  label: string;
  shortLabel: string;
  tier: string;
  locationType: LocationType;
  examples: string[];
  baselineAreaM2: number;
  rentPerM2MonthRub: number;
  marketRangeRubPerM2Month: [number, number];
  monthlyRentRub: number;
  purchasePriceRub: number | null;
  realEstateMode: "rent" | "purchase";
};

function numericPreset(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function isLocationRentPresetId(value: unknown): value is LocationRentPresetId {
  return typeof value === "string" && locationRentPresetIds.includes(value as LocationRentPresetId);
}

export const defaultLocationRentPresetId = planning.rental_presets.default_id as Exclude<LocationRentPresetId, "custom">;

export function locationRentPresets(): LocationRentPreset[] {
  return locationRentPresetIds
    .filter((id): id is Exclude<LocationRentPresetId, "custom"> => id !== "custom")
    .map((id) => locationRentPreset(id));
}

/** The flagship remains a base-object reference, not a selectable network rollout district. */
export function networkLocationRentPresets(): LocationRentPreset[] {
  return locationRentPresets().filter((preset) => preset.id !== "ligovsky-21-flagship");
}

export function locationRentPreset(id: Exclude<LocationRentPresetId, "custom">): LocationRentPreset {
  const preset = planning.rental_presets.presets[id];
  if (!preset) throw new Error(`Network Planning rent preset ${id} is missing.`);
  const range = Array.isArray(preset.market_range_rub_per_m2_month) ? preset.market_range_rub_per_m2_month : [0, 0];
  return {
    id,
    label: String(preset.label),
    shortLabel: String(preset.short_label),
    tier: String(preset.tier),
    locationType: locationTypes.includes(preset.location_type as LocationType) ? preset.location_type as LocationType : "street",
    examples: Array.isArray(preset.examples) ? preset.examples.map(String) : [],
    baselineAreaM2: numericPreset(preset.baseline_area_m2),
    rentPerM2MonthRub: numericPreset(preset.rent_per_m2_month_rub),
    marketRangeRubPerM2Month: [numericPreset(range[0]), numericPreset(range[1])],
    monthlyRentRub: numericPreset(preset.monthly_rent_rub),
    purchasePriceRub: typeof preset.purchase_price_rub === "number" ? preset.purchase_price_rub : null,
    realEstateMode: preset.real_estate_mode === "purchase" ? "purchase" : "rent",
  };
}

export function standardNetworkPointRentDefaults() {
  const standard = planning.rental_presets.standard_network_point;
  return {
    baselineAreaM2: numericPreset(standard.baseline_area_m2),
    workingAreaRangeM2: Array.isArray(standard.working_area_range_m2)
      ? [numericPreset(standard.working_area_range_m2[0]), numericPreset(standard.working_area_range_m2[1])] as [number, number]
      : [0, 0] as [number, number],
    minimumUiAreaM2: numericPreset(standard.minimum_ui_area_m2),
    normalHistoricCenterMonthlyRentReferenceRub: numericPreset(standard.normal_historic_center_monthly_rent_reference_rub),
  };
}

export function standardStreetRentEntryDefaults() {
  const defaults = planning.rental_presets.rent_entry_defaults;
  return {
    prepaymentMonths: numericPreset(defaults?.prepayment_months),
    securityDepositMonths: numericPreset(defaults?.security_deposit_months),
  };
}

export const networkRolloutSizeIds = [4, 8, 12] as const;
export type NetworkRolloutSize = (typeof networkRolloutSizeIds)[number];

export type NetworkRolloutGroup = {
  presetId: Exclude<LocationRentPresetId, "custom">;
  format: "with_seating" | "takeaway";
  locationType: LocationType;
  realEstateMode: "rent" | "purchase";
  baselineAreaM2: number;
  checksPerDay: number;
  firstOpeningMonth: number;
  sharedSeating: boolean | null;
  barEnabled: boolean;
  preparationEnabledCategoryIds: string[];
};

export type NetworkOpeningWave = {
  openingMonth: number;
  count: number;
};

export type NetworkTemporalAssumptions = {
  horizonMonths: number;
  openingCalendarMonth: number;
  rampUpProfile: Array<{ month: number; factor: number }>;
  seasonalityProfile: Array<{ month: number; factor: number }>;
  launchCapexLeadMonths: number;
  rentFreeMonths: Record<Exclude<LocationType, "foodtruck">, number>;
};

export function networkRolloutDistrictPresetIds(): Exclude<LocationRentPresetId, "custom">[] {
  return (planning.network_rollout.district_preset_ids as string[])
    .filter((id): id is Exclude<LocationRentPresetId, "custom"> => isLocationRentPresetId(id) && id !== "custom");
}

export function networkRolloutPointsPerDistrict(size: NetworkRolloutSize) {
  return numericPreset(planning.network_rollout.size_presets[String(size)]?.points_per_district);
}

export function networkRolloutDefaults() {
  const point = planning.network_rollout.default_point;
  return {
    format: point.format === "with_seating" ? "with_seating" as const : "takeaway" as const,
    locationType: locationTypes.includes(point.location_type as LocationType) ? point.location_type as LocationType : "street" as const,
    realEstateMode: point.real_estate_mode === "purchase" ? "purchase" as const : "rent" as const,
    barEnabled: point.bar_enabled === true,
  };
}

/**
 * Temporal coefficients are projected from the canonical Financial Model into
 * the generated planning snapshot. The Planning Model selects their use; it
 * does not duplicate or amend the curves.
 */
export function canonicalTemporalAssumptions(): NetworkTemporalAssumptions {
  const temporal = canonical.temporal;
  const defaults = planning.temporal;
  const rentFree = defaults.rent_free_defaults ?? {};
  return {
    horizonMonths: numericPreset(temporal.horizonMonths),
    openingCalendarMonth: numericPreset(temporal.openingCalendarMonth),
    rampUpProfile: Array.isArray(temporal.rampUpProfile)
      ? temporal.rampUpProfile.map((item: any) => ({ month: numericPreset(item.month), factor: numericPreset(item.factor) }))
      : [],
    seasonalityProfile: Array.isArray(temporal.seasonalityProfile)
      ? temporal.seasonalityProfile.map((item: any) => ({ month: numericPreset(item.month), factor: numericPreset(item.factor) }))
      : [],
    launchCapexLeadMonths: numericPreset(defaults.launch_capex_lead_months),
    rentFreeMonths: {
      street: numericPreset(rentFree.street),
      foodhall: numericPreset(rentFree.foodhall),
      creative_cluster: numericPreset(rentFree.creative_cluster),
    },
  };
}

export function baseObjectPlanningReference() {
  const flagship = planning.base_object.flagship_reference;
  return {
    presetId: String(flagship.preset_id),
    monthlyRentRub: numericPreset(flagship.monthly_rent_rub),
    rentFreeMonths: numericPreset(flagship.rent_free_months),
    historicalFinancialModelRentRub: numericPreset(flagship.historical_financial_model_rent_rub),
  };
}

export function networkRolloutSchedule() {
  const schedule = planning.network_rollout.schedule;
  return {
    baseObjectOpeningMonth: numericPreset(schedule.base_object_opening_month),
    firstAdditionalOpeningMonth: numericPreset(schedule.first_additional_opening_month),
    additionalOpeningIntervalMonths: numericPreset(schedule.additional_opening_interval_months),
    repeatedGroupWaveIntervalMonths: numericPreset(schedule.repeated_group_wave_interval_months),
  };
}

export function defaultRentFreeMonths(locationType: LocationType) {
  const temporal = canonicalTemporalAssumptions();
  return locationType === "foodtruck" ? 0 : temporal.rentFreeMonths[locationType];
}

export function rolloutOpeningWaves(firstOpeningMonth: number, count: number): NetworkOpeningWave[] {
  const cycle = networkRolloutSchedule().repeatedGroupWaveIntervalMonths;
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, index) => ({
    openingMonth: firstOpeningMonth + index * cycle,
    count: 1,
  }));
}

export function networkBarEquipmentRules() {
  const rules = planning.equipment.bar_enabled_point_items;
  return Array.isArray(rules) ? rules.map((rule: any) => ({
    itemId: String(rule.item_id),
    quantityPerBarEnabledPoint: numericPreset(rule.quantity_per_bar_enabled_point),
  })) : [];
}

/** Owner-approved first-stage network groups. Values are state defaults, not React constants. */
export function networkRolloutGroups(): NetworkRolloutGroup[] {
  const groups = planning.network_rollout.groups ?? {};
  return networkRolloutDistrictPresetIds().map((presetId) => {
    const group = groups[presetId];
    const rentPreset = locationRentPreset(presetId);
    if (!group) throw new Error(`Network rollout group ${presetId} is missing from the planning model.`);
    return {
      presetId,
      format: group.format === "with_seating" ? "with_seating" : "takeaway",
      locationType: locationTypes.includes(group.location_type as LocationType) ? group.location_type as LocationType : "street",
      realEstateMode: group.real_estate_mode === "purchase" ? "purchase" : "rent",
      baselineAreaM2: numericPreset(group.baseline_area_m2, rentPreset.baselineAreaM2),
      checksPerDay: numericPreset(group.checks_per_day),
      firstOpeningMonth: numericPreset(group.first_opening_month),
      sharedSeating: typeof group.shared_seating === "boolean" ? group.shared_seating : null,
      barEnabled: group.bar_enabled === true,
      preparationEnabledCategoryIds: Array.isArray(group.preparation_enabled_category_ids)
        ? group.preparation_enabled_category_ids.filter((id: unknown): id is string => typeof id === "string")
        : [],
    };
  });
}

export type PlanningRoleLine = {
  roleId: string;
  name: string;
  concurrent: number;
  rosterHeadcount: number;
  schedule: RosterSchedule;
  grossSalaryRub: number;
  planningOnly?: boolean;
};

export type PayrollProjection = {
  roles: PlanningRoleLine[];
  rosterHeadcount: number;
  payrollRub: number;
  employerContributionsRub: number;
  personnelReserveRub: number;
  totalPayrollRub: number;
};

export type PointStaffingProjection = PayrollProjection & {
  portionsPerDay: number | null;
  concurrentStaff: number;
  status: "planning";
  note: string | null;
};

function roleSalary(roleId: string) {
  const role = canonical.roles[roleId];
  if (!role) throw new Error(`Network Planning role ${roleId} is not available from the canonical Financial Model.`);
  return { name: role.name as string, grossSalaryRub: Number(role.grossSalaryRub) };
}

function contributionPolicy(): EmployerContributionPolicy {
  const policy = canonical.payrollPolicy;
  return {
    scenario: planning.staffing.payroll_contribution_scenario === "standard" ? "standard" : "reduced",
    reduced: policy.reduced,
    standard: policy.standard,
    personnelReserveRate: Number(policy.personnelReserveRate),
  };
}

function rosterFactor(schedule: RosterSchedule) {
  if (schedule === "core") return Number(planning.point_schedule.core.roster_employees_per_concurrent_position);
  if (schedule === "peak") return Number(planning.point_schedule.peak.roster_employees_per_concurrent_position);
  return 1;
}

function roleLines(
  coreRoles: Record<string, number>,
  peakRoles: Record<string, number> = {},
  production = false,
): PlanningRoleLine[] {
  const lines = (Object.entries(coreRoles).map(([roleId, concurrent]) => ({ roleId, concurrent, schedule: production ? "production" : "core" as RosterSchedule }))
    .concat(Object.entries(peakRoles).map(([roleId, concurrent]) => ({ roleId, concurrent, schedule: "peak" as const }))));
  return lines.map(line => {
    const canonicalRole = roleSalary(line.roleId);
    return {
      ...line,
      name: canonicalRole.name,
      rosterHeadcount: line.concurrent * rosterFactor(line.schedule),
      grossSalaryRub: canonicalRole.grossSalaryRub,
    };
  });
}

function payrollFromRoles(roles: PlanningRoleLine[]): PayrollProjection {
  const totals = calculateEmployerContributions(
    roles.map(role => ({ headcount: role.rosterHeadcount, grossSalaryRub: role.grossSalaryRub })),
    contributionPolicy(),
  );
  return {
    roles,
    rosterHeadcount: roles.reduce((total, role) => total + role.rosterHeadcount, 0),
    payrollRub: totals.payrollRub,
    employerContributionsRub: totals.employerContributionsRub,
    personnelReserveRub: totals.personnelReserveRub,
    totalPayrollRub: totals.totalLaborRub,
  };
}

export function locationLabel(locationType: LocationType) {
  return locationType === "street" ? "Отдельное помещение"
    : locationType === "foodhall" ? "Фудхолл"
      : locationType === "creative_cluster" ? "Креативный кластер" : "Фудтрак · дополнительный формат";
}

export function locationPlanningDefaults(locationType: LocationType, format: "with_seating" | "takeaway" = "takeaway") {
  const defaults = planning.locations.types[locationType]?.defaults ?? {};
  const location = planning.locations.types[locationType] ?? {};
  const streetUtilities = locationType === "street"
    ? numericPreset(location.planning_utility_suggestion_rub?.[format], 0) || null
    : null;
  const rentEntry = defaults.rent_entry ?? {};
  return {
    sharedSeating: defaults.shared_seating ?? null,
    venueSecurityIncluded: defaults.venue_security_included ?? null,
    commonCleaningIncluded: defaults.common_cleaning_included ?? null,
    fitoutAllowanceRub: defaults.fitout_allowance_rub ?? null,
    utilitiesIncluded: typeof defaults.utilities_included === "boolean" ? defaults.utilities_included : null,
    utilitiesMonthlyRub: streetUtilities ?? (typeof defaults.utilities_monthly_rub === "number" ? defaults.utilities_monthly_rub : null),
    serviceChargeMonthlyRub: typeof defaults.service_charge_monthly_rub === "number" ? defaults.service_charge_monthly_rub : null,
    storageRentMonthlyRub: typeof defaults.storage_rent_monthly_rub === "number" ? defaults.storage_rent_monthly_rub : null,
    revenueSharePercent: typeof defaults.revenue_share_percent === "number" ? defaults.revenue_share_percent : null,
    minimumGuaranteeMonthlyRub: typeof defaults.minimum_guarantee_monthly_rub === "number" ? defaults.minimum_guarantee_monthly_rub : null,
    rentPerM2Rub: typeof defaults.rent_per_m2_month_rub === "number" ? defaults.rent_per_m2_month_rub : null,
    monthlyRentRub: typeof defaults.monthly_rent_rub === "number" ? defaults.monthly_rent_rub : null,
    prepaymentMonths: typeof rentEntry.prepayment_months === "number" ? rentEntry.prepayment_months : null,
    securityDepositMonths: typeof rentEntry.security_deposit_months === "number" ? rentEntry.security_deposit_months : null,
    videoAllowanceRub: locationType === "street" ? numericPreset(location.video_allowance_reference_rub, 0) || null : null,
    alarmAllowanceRub: locationType === "street" ? numericPreset(location.alarm_allowance_reference_rub, 0) || null : null,
    // A selected location is still not a technical survey. Until confirmed,
    // extraction status remains unknown rather than silently assumed true.
    extractionAvailable: null as boolean | null,
    rentFreeMonths: defaultRentFreeMonths(locationType),
  };
}

export function locationMinimumAreaM2(format: "with_seating" | "takeaway", locationType: LocationType, sharedSeating: boolean | null) {
  if ((locationType === "foodhall" || locationType === "creative_cluster") && sharedSeating === true) return null;
  return format === "with_seating" ? Number(planning.staffing.seating.minimum_total_area_m2) : standardNetworkPointRentDefaults().minimumUiAreaM2;
}

export function locationAreaHelper(format: "with_seating" | "takeaway", locationType: LocationType, sharedSeating: boolean | null) {
  if ((locationType === "foodhall" || locationType === "creative_cluster") && sharedSeating === true) return "Общая посадка площадки: площадь точки задаётся по договору.";
  if (format === "with_seating") return "Для точки с собственным залом требуется не менее 60 м².";
  const standard = standardNetworkPointRentDefaults();
  return `Минимум ${standard.minimumUiAreaM2} м²; для сетевого формата обычно ${standard.workingAreaRangeM2[0]}–${standard.workingAreaRangeM2[1]} м².`;
}

export function planningTrafficPreset(locationType: LocationType, format: "with_seating" | "takeaway") {
  if (locationType === "foodhall") return planning.traffic_presets.foodhall;
  if (locationType === "creative_cluster") return planning.traffic_presets.creative_cluster;
  return format === "takeaway" ? planning.traffic_presets.street_takeaway : null;
}

/** Concurrent positions and roster conversion; this is a planning policy, not FTE. */
export function pointStaffingProjection(
  format: "with_seating" | "takeaway",
  locationType: LocationType,
  portionsPerDay: number | null,
): PointStaffingProjection {
  const portions = portionsPerDay ?? 0;
  let coreRoles: Record<string, number>;
  let peakRoles: Record<string, number> = {};
  let note: string | null = null;
  if (format === "takeaway") {
    if (portions >= Number(planning.staffing.takeaway.high_traffic.from_portions_per_day)) {
      coreRoles = planning.staffing.takeaway.high_traffic.core_roles;
      peakRoles = planning.staffing.takeaway.high_traffic.peak_roles;
      note = "Су-шеф усиливает пиковые часы по графику 5/2 · 8 часов.";
    } else if (portions >= Number(planning.staffing.takeaway.growth.from_portions_per_day)) {
      coreRoles = planning.staffing.takeaway.growth.roles;
    } else {
      coreRoles = planning.staffing.takeaway.base.roles;
    }
  } else if (locationType === "foodhall" && portions >= Number(planning.staffing.takeaway.high_traffic.from_portions_per_day)) {
    coreRoles = planning.staffing.takeaway.high_traffic.core_roles;
    peakRoles = planning.staffing.takeaway.high_traffic.peak_roles;
    note = "Су-шеф усиливает пиковые часы по графику 5/2 · 8 часов.";
  } else {
    coreRoles = planning.staffing.seating.core_roles;
    note = "Для зала предусмотрена универсальная функция обслуживания и уборки.";
  }
  const payroll = payrollFromRoles(roleLines(coreRoles, peakRoles));
  return {
    ...payroll,
    portionsPerDay,
    concurrentStaff: Object.values(coreRoles).reduce((total, value) => total + Number(value), 0) + Object.values(peakRoles).reduce((total, value) => total + Number(value), 0),
    status: "planning",
    note,
  };
}

export function productionStaffingProjection(networkChecksPerDay: number | null, schedule: "one_main_shift" | "custom" = "one_main_shift"): PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string } {
  const threshold = Number(planning.staffing.production.up_to_network_checks_per_day);
  const concurrentPrepCooks = networkChecksPerDay !== null && networkChecksPerDay > threshold
    ? Number(planning.staffing.production.prep_cooks_above_threshold)
    : Number(planning.staffing.production.prep_cooks_at_or_below_threshold);
  return {
    ...payrollFromRoles(roleLines({ PREP_COOK: concurrentPrepCooks }, {}, true)),
    concurrentPrepCooks,
    capacityReviewRequired: concurrentPrepCooks >= 2 && Boolean(planning.staffing.production.capacity_review_after_two_prep_cooks),
    schedule: schedule === "custom" ? "custom" : String(planning.staffing.production.schedule_default),
  };
}

export function sharedManagerPayrollProjection(totalPointCount: number): PayrollProjection | null {
  if (totalPointCount < Number(planning.staffing.shared_manager.count_when_point_count_at_least)) return null;
  return payrollFromRoles(roleLines({ [planning.staffing.shared_manager.role_id]: 1 }, {}, true));
}

export function canonicalPointOpexConstants() {
  return canonical.opex as {
    rawMaterialsRate: number;
    wasteRate: number;
    packagingBaselineChecksPerDay: number;
    packagingBaselineMonthlyRub: number;
    acquiringRateOfGrossRevenue: number;
    marketingFixedMonthlyRub: number;
    marketingVariableRateOfNetRevenue: number;
  };
}

export function networkPlanningLaunchConstants() {
  return {
    uniformPerRosterEmployeeRub: Number(planning.launch.uniform_per_roster_employee_rub),
    inventoryOperatingDays: Number(planning.launch.initial_inventory_operating_days),
    launchMarketingRub: Number(canonical.launch.launchMarketingRub),
  };
}

export function logisticsPlanning(totalPointCount: number) {
  const logistics = planning.logistics;
  const ownsVehicleSuggested = totalPointCount >= Number(logistics.own_vehicle_suggested_from_point_count);
  return {
    ownsVehicleSuggested,
    externalMonthlyRub: logistics.external_logistics_monthly_rub === null ? null : Number(logistics.external_logistics_monthly_rub),
    vehicleCapexRub: Number(logistics.own_vehicle_capex_rub),
    ownedMonthlyTotalRub: Number(logistics.own_vehicle_monthly_total_rub),
    driverSalaryRub: Number(logistics.driver_salary_rub),
    deliveryWindow: String(logistics.delivery_window),
  };
}
