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
  guestAreaM2: number | null;
  /** An approved physical layout may supersede generic density rounding. */
  approvedSeatCount: number | null;
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
  /** Owner-approved, format-specific planning periods from funding to first sales. */
  developmentLeadMonths: {
    baseObject: number;
    creativeCluster: number;
    foodhall: number;
    streetTakeaway: number;
    streetWithSeating: number;
  };
  rentFreeMonths: Record<Exclude<LocationType, "foodtruck">, number>;
};

export type PointWashAssetClass = "equipment" | "furniture" | "small_equipment";

export type PointWashPackage = {
  allocationId: "POINT-WASH-SEATING" | "POINT-WASH-TAKEAWAY";
  name: string;
  noDomeDishwasher: boolean;
  components: Array<{
    itemId: string;
    quantity: number;
    assetClass: PointWashAssetClass;
    purpose: string;
  }>;
};

export type ProductionCapacityProjection = {
  checksPerDay: number | null;
  foodPortionsPerCheck: number;
  dailyProductionDemandPortions: number | null;
  availableDailyProductionCapacityPortions: null;
  utilizationPercent: null;
  operations: Array<{
    id: string;
    label: string;
    dailyDemandPortions: null;
    batchCapacity: string | null;
    batchesPerDay: null;
    machineHoursPerDay: null;
    availableMachineHoursPerDay: null;
    utilizationPercent: null;
    assetIds: string[];
    sourceIds: string[];
    status: "requires_technical_cards" | "requires_technical_cards_and_source_reconciliation";
    limitation: string;
  }>;
  requiredParameters: Array<{ id: string; question: string; reason: string }>;
  bottleneck: string;
  currentPrepCooks: number;
  schedule: string;
  staffingPolicyStatus: "within_current_staffing_policy" | "review_required_after_two_prep_cooks";
  status: "review_required";
  secondShiftStatus: "not_modelled_requires_process_parameters";
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
    developmentLeadMonths: {
      baseObject: numericPreset(defaults.development_lead_months?.base_object),
      creativeCluster: numericPreset(defaults.development_lead_months?.creative_cluster),
      foodhall: numericPreset(defaults.development_lead_months?.foodhall),
      streetTakeaway: numericPreset(defaults.development_lead_months?.street_takeaway),
      streetWithSeating: numericPreset(defaults.development_lead_months?.street_with_seating),
    },
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
    baseObjectFundingMonth: numericPreset(schedule.base_object_funding_month),
    nextCohortFundingAfterPreviousOpeningMonths: numericPreset(schedule.next_cohort_funding_after_previous_opening_months),
  };
}

/** The planning lead is selected by actual physical format, never by a global opening shift. */
export function developmentLeadMonthsFor(
  format: "with_seating" | "takeaway",
  locationType: LocationType,
  baseObject = false,
) {
  const leads = canonicalTemporalAssumptions().developmentLeadMonths;
  if (baseObject) return leads.baseObject;
  if (locationType === "creative_cluster") return leads.creativeCluster;
  if (locationType === "foodhall") return leads.foodhall;
  return format === "with_seating" ? leads.streetWithSeating : leads.streetTakeaway;
}

export type SequentialRolloutCohort = {
  id: string;
  count: number;
  format: "with_seating" | "takeaway";
  locationType: LocationType;
};

/**
 * The physical rollout is one serial preparation stream. A subsequent cohort
 * receives funding only in the month after the previous cohort first sells;
 * a cohort's own full-ramp maturity is intentionally not part of this gate.
 * For 9/13-point programmes the order repeats by wave across approved formats.
 */
export function sequentialRolloutOpeningWaves(cohorts: readonly SequentialRolloutCohort[]) {
  const schedule = networkRolloutSchedule();
  const baseOpeningMonth = schedule.baseObjectFundingMonth + developmentLeadMonthsFor("with_seating", "street", true);
  const waves = new Map<string, NetworkOpeningWave[]>();
  cohorts.forEach((cohort) => waves.set(cohort.id, []));
  let previousOpeningMonth = baseOpeningMonth;
  const waveCount = Math.max(0, ...cohorts.map((cohort) => Math.max(0, Math.floor(cohort.count))));
  for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
    for (const cohort of cohorts) {
      if (waveIndex >= Math.max(0, Math.floor(cohort.count))) continue;
      const fundingMonth = previousOpeningMonth + schedule.nextCohortFundingAfterPreviousOpeningMonths;
      const openingMonth = fundingMonth + developmentLeadMonthsFor(cohort.format, cohort.locationType);
      waves.get(cohort.id)!.push({ openingMonth, count: 1 });
      previousOpeningMonth = openingMonth;
    }
  }
  return waves;
}

export function defaultRentFreeMonths(locationType: LocationType) {
  const temporal = canonicalTemporalAssumptions();
  return locationType === "foodtruck" ? 0 : temporal.rentFreeMonths[locationType];
}

export function rolloutOpeningWaves(firstOpeningMonth: number, count: number): NetworkOpeningWave[] {
  // This is only a backward-compatible fallback for independently restored
  // cohorts. Governed network presets use sequentialRolloutOpeningWaves().
  const cycle = 1;
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
      guestAreaM2: group.format === "with_seating" && typeof group.guest_area_m2 === "number" && Number.isFinite(group.guest_area_m2)
        ? group.guest_area_m2
        : null,
      approvedSeatCount: group.format === "with_seating" && typeof group.approved_seat_count === "number" && Number.isFinite(group.approved_seat_count) && group.approved_seat_count > 0
        ? Math.floor(group.approved_seat_count)
        : null,
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

/** Venue defaults that affect recurring OPEX but are not editable financial facts. */
export function locationOpexDefaults(locationType: LocationType) {
  const defaults = planning.locations.types[locationType]?.defaults ?? {};
  return {
    venueMusicIncluded: defaults.venue_music_included === true,
  };
}

/** Calibration area for historical recurring premises services; it is not a new point area default. */
export function historicalIntegratedPremisesAreaM2() {
  return numericPreset(planning.preparation.point_area_proxy?.reference_area_m2);
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

/**
 * B4 records documented machine envelopes, but the governed model still has
 * no recipe routing, batch yields, cycle times or usable shift hours. It can
 * therefore calculate demand in food portions only; all equipment utilization
 * fields intentionally remain null until those process inputs are approved.
 */
export function productionCapacityProjection(networkChecksPerDay: number | null, schedule: "one_main_shift" | "custom" = "one_main_shift"): ProductionCapacityProjection {
  const staffing = productionStaffingProjection(networkChecksPerDay, schedule);
  const capacityEvidence = planning.staffing.production.capacity_evidence ?? {};
  const portionsPerCheck = Number(canonical.revenue.foodPortionsPerCheck);
  const operations = Array.isArray(capacityEvidence.operations)
    ? capacityEvidence.operations.map((operation: any) => ({
      id: String(operation.id),
      label: String(operation.label),
      dailyDemandPortions: null,
      batchCapacity: typeof operation.documented_batch_capacity === "string" ? operation.documented_batch_capacity : null,
      batchesPerDay: null,
      machineHoursPerDay: null,
      availableMachineHoursPerDay: null,
      utilizationPercent: null,
      assetIds: Array.isArray(operation.asset_ids) ? operation.asset_ids.filter((item: unknown): item is string => typeof item === "string") : [],
      sourceIds: Array.isArray(operation.source_ids) ? operation.source_ids.filter((item: unknown): item is string => typeof item === "string") : [],
      status: operation.operation_demand_status === "requires_technical_cards_and_source_reconciliation"
        ? "requires_technical_cards_and_source_reconciliation" as const
        : "requires_technical_cards" as const,
      limitation: String(operation.limitation ?? "Для расчёта мощности требуется техкарта и process parameter."),
    }))
    : [];
  const requiredParameters = Array.isArray(capacityEvidence.required_parameters)
    ? capacityEvidence.required_parameters.map((parameter: any) => ({
      id: String(parameter.id),
      question: String(parameter.question),
      reason: String(parameter.reason),
    }))
    : [];
  return {
    checksPerDay: networkChecksPerDay,
    foodPortionsPerCheck: portionsPerCheck,
    dailyProductionDemandPortions: networkChecksPerDay === null ? null : networkChecksPerDay * portionsPerCheck,
    availableDailyProductionCapacityPortions: null,
    utilizationPercent: null,
    operations,
    requiredParameters,
    bottleneck: String(capacityEvidence.bottleneck ?? "Производительность производственной линии требует отдельного технического подтверждения."),
    currentPrepCooks: staffing.concurrentPrepCooks,
    schedule: staffing.schedule,
    staffingPolicyStatus: staffing.capacityReviewRequired ? "review_required_after_two_prep_cooks" : "within_current_staffing_policy",
    status: "review_required",
    secondShiftStatus: "not_modelled_requires_process_parameters",
  };
}

export function sharedManagerPayrollProjection(totalPointCount: number): PayrollProjection | null {
  if (totalPointCount < Number(planning.staffing.shared_manager.count_when_point_count_at_least)) return null;
  return payrollFromRoles(roleLines({ [planning.staffing.shared_manager.role_id]: 1 }, {}, true));
}

export type CanonicalNetworkOpexConstants = {
  rawMaterialsRate: number;
  wasteRate: number;
  packagingBaselineChecksPerDay: number;
  packagingBaselineMonthlyRub: number;
  acquiringRateOfGrossRevenue: number;
  marketingFixedMonthlyRub: number;
  marketingVariableRateOfNetRevenue: number;
  administrativeReserveRateOfNetRevenue: number;
  householdFixedMonthlyRub: number;
  householdVariableMonthlyRub: number;
  householdBaselineChecksPerDay: number;
  equipmentServiceMonthlyRub: number;
  accountingMonthlyRub: number;
  ventilationGreaseMonthlyRub: number;
  uniformRenewalMonthlyRub: number;
  musicRightsMonthlyRub: number;
  pestControlMonthlyRub: number;
  softwareMonthlyRub: number;
  medicalMonthlyRub: number;
  securityMonitoringMonthlyRub: number;
  bankingMonthlyRub: number;
  otherOpexMonthlyRub: number;
  historicalRealisticRosterHeadcount: number;
};

/** All amounts remain sourced from the generated canonical Financial Model snapshot. */
export function canonicalNetworkOpexConstants(): CanonicalNetworkOpexConstants {
  return canonical.opex as CanonicalNetworkOpexConstants;
}

/** Compatibility alias for existing point-level callers. */
export function canonicalPointOpexConstants() {
  return canonicalNetworkOpexConstants();
}

export function pointWashPackage(format: "with_seating" | "takeaway"): PointWashPackage {
  const source = planning.equipment.point_wash_packages?.[format];
  if (!source) throw new Error(`Network Planning point wash package ${format} is unavailable.`);
  const allocationId = String(source.allocation_id);
  if (allocationId !== "POINT-WASH-SEATING" && allocationId !== "POINT-WASH-TAKEAWAY") throw new Error(`Point wash package ${format} has an invalid allocation ID.`);
  const components = Array.isArray(source.components) ? source.components.map((component: any) => ({
    itemId: String(component.item_id),
    quantity: numericPreset(component.quantity),
    assetClass: component.asset_class === "furniture" || component.asset_class === "small_equipment" ? component.asset_class : "equipment" as PointWashAssetClass,
    purpose: String(component.purpose ?? ""),
  })) : [];
  if (!components.length) throw new Error(`Point wash package ${format} has no components.`);
  return {
    allocationId,
    name: String(source.name),
    noDomeDishwasher: source.no_dome_dishwasher === true,
    components,
  };
}

export function networkPlanningLaunchConstants() {
  return {
    uniformPerRosterEmployeeRub: Number(planning.launch.uniform_per_roster_employee_rub),
    inventoryOperatingDays: Number(planning.launch.initial_inventory_operating_days),
    launchMarketingRub: Number(canonical.launch.launchMarketingRub),
  };
}

export function logisticsPlanning(additionalNetworkPointCount: number) {
  const logistics = planning.logistics;
  const ownsVehicleSuggested = additionalNetworkPointCount >= Number(logistics.own_vehicle_suggested_from_point_count);
  return {
    ownsVehicleSuggested,
    externalMonthlyRub: logistics.external_logistics_monthly_rub === null ? null : Number(logistics.external_logistics_monthly_rub),
    externalLogisticsSourceIds: Array.isArray(logistics.external_logistics_source_ids)
      ? logistics.external_logistics_source_ids.map((id: unknown) => String(id))
      : [],
    vehicleCapexRub: Number(logistics.own_vehicle_capex_rub),
    ownedMonthlyTotalRub: Number(logistics.own_vehicle_monthly_total_rub),
    driverSalaryRub: Number(logistics.driver_salary_rub),
    deliveryWindow: String(logistics.delivery_window),
  };
}
