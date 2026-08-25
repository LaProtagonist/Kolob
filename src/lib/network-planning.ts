import planningSnapshot from "../content/network-planning-data.json";
import { calculateEmployerContributions, type EmployerContributionPolicy } from "./employer-contributions";

export const locationTypes = ["street", "foodhall", "creative_cluster", "foodtruck"] as const;
export type LocationType = (typeof locationTypes)[number];
export type RosterSchedule = "core" | "peak" | "production";

const snapshot = planningSnapshot as any;
const planning = snapshot.planning;
const canonical = snapshot.canonicalReferences;

export const networkPlanningModel = planning;

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
  return locationType === "street" ? "Street"
    : locationType === "foodhall" ? "Foodhall"
      : locationType === "creative_cluster" ? "Creative Cluster" : "Foodtruck";
}

export function locationPlanningDefaults(locationType: LocationType) {
  const defaults = planning.locations.types[locationType]?.defaults ?? {};
  return {
    sharedSeating: defaults.shared_seating ?? null,
    venueSecurityIncluded: defaults.venue_security_included ?? null,
    commonCleaningIncluded: defaults.common_cleaning_included ?? null,
    fitoutAllowanceRub: defaults.fitout_allowance_rub ?? null,
    // A selected location is still not a technical survey. Until confirmed,
    // extraction status remains unknown rather than silently assumed true.
    extractionAvailable: null as boolean | null,
  };
}

export function locationMinimumAreaM2(format: "with_seating" | "takeaway", locationType: LocationType, sharedSeating: boolean | null) {
  if (locationType === "foodhall" && sharedSeating === true) return null;
  return format === "with_seating" ? Number(planning.staffing.seating.minimum_total_area_m2) : 10;
}

export function locationAreaHelper(format: "with_seating" | "takeaway", locationType: LocationType, sharedSeating: boolean | null) {
  if (locationType === "foodhall" && sharedSeating === true) return "Общая посадка площадки: площадь corner задаётся по договору.";
  if (format === "with_seating") return "Минимум для формата: 60 м²";
  return "Ориентир для формата: 10–20 м²";
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
      note = "High-traffic planning: су-шеф усиливает пик по графику 5/2 · 8 часов.";
    } else if (portions >= Number(planning.staffing.takeaway.growth.from_portions_per_day)) {
      coreRoles = planning.staffing.takeaway.growth.roles;
    } else {
      coreRoles = planning.staffing.takeaway.base.roles;
    }
  } else if (locationType === "foodhall" && portions >= Number(planning.staffing.takeaway.high_traffic.from_portions_per_day)) {
    coreRoles = planning.staffing.takeaway.high_traffic.core_roles;
    peakRoles = planning.staffing.takeaway.high_traffic.peak_roles;
    note = "High-traffic Foodhall planning: су-шеф усиливает пик по графику 5/2 · 8 часов.";
  } else {
    coreRoles = planning.staffing.seating.core_roles;
    note = String(planning.staffing.seating.provisional_role_mapping);
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
