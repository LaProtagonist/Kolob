import {
  calculateRevenueModel,
  revenueModel,
  type RevenueModelState,
} from "./revenue-model";
import type { InvestorConfiguration, TradingPointCohort } from "./investor-configuration";
import {
  locationAreaHelper,
  locationMinimumAreaM2,
  pointStaffingProjection,
  type PointStaffingProjection,
} from "./network-planning";

export type PointAreaStatus = "unset" | "valid" | "below-minimum" | "not-applicable";
export type PointSalesSource = "baseline" | "custom";

export type PointOperationalProjection = {
  area: {
    valueM2: number | null;
    minimumM2: number | null;
    status: PointAreaStatus;
    helper: string;
  };
  location: {
    type: TradingPointCohort["locationType"];
    extractionStatus: "compatible" | "incompatible" | "requires-confirmation";
  };
  sales: {
    source: PointSalesSource;
    checksPerDay: number | null;
    averageCheckRub: number | null;
    foodPortionsPerDay: number | null;
    workingDaysPerMonth: number;
    revenuePerPointRub: number | null;
    revenueCohortRub: number | null;
  };
  staffing: PointStaffingProjection;
};

function baselineRevenueState(configuration: InvestorConfiguration): RevenueModelState {
  return {
    trafficMode: "scenario",
    trafficScenario: configuration.scenarioId,
    customChecksPerDay: null,
    customAverageCheckRub: null,
  };
}

function cohortRevenueState(configuration: InvestorConfiguration, cohort: TradingPointCohort): RevenueModelState | null {
  if (cohort.sales.mode !== "custom") return baselineRevenueState(configuration);
  if (cohort.sales.checksPerDay === null || cohort.sales.averageCheckRub === null) return null;
  return {
    trafficMode: "custom",
    trafficScenario: configuration.scenarioId,
    customChecksPerDay: cohort.sales.checksPerDay,
    customAverageCheckRub: cohort.sales.averageCheckRub,
  };
}

/**
 * Uses canonical revenue calculations for sales and the governed Network
 * Planning policy for staffing. This returns people concurrently on shift and
 * a planning roster/payroll, never a claimed FTE calculation.
 */
export function pointOperationalProjection(
  configuration: InvestorConfiguration,
  cohort: TradingPointCohort,
): PointOperationalProjection {
  const revenueState = cohortRevenueState(configuration, cohort);
  const revenue = revenueState ? calculateRevenueModel(revenueState) : null;
  const minimumM2 = locationMinimumAreaM2(cohort.format, cohort.locationType, cohort.sharedSeating);
  const areaStatus: PointAreaStatus = minimumM2 === null
    ? "not-applicable"
    : cohort.totalAreaM2 === null
      ? "unset"
      : cohort.totalAreaM2 < minimumM2 ? "below-minimum" : "valid";
  const extractionStatus = cohort.extractionAvailable === false
    ? "incompatible"
    : cohort.extractionAvailable === true ? "compatible" : "requires-confirmation";
  const foodPortionsPerDay = revenue?.foodPortionsPerDay ?? null;

  return {
    area: {
      valueM2: cohort.totalAreaM2,
      minimumM2,
      status: areaStatus,
      helper: locationAreaHelper(cohort.format, cohort.locationType, cohort.sharedSeating),
    },
    location: { type: cohort.locationType, extractionStatus },
    sales: {
      source: cohort.sales.mode,
      checksPerDay: revenue?.checksPerDay ?? null,
      averageCheckRub: revenue?.averageCheckRub ?? null,
      foodPortionsPerDay,
      workingDaysPerMonth: revenueModel.sales_calculation.days_per_month,
      revenuePerPointRub: revenue?.salesPerMonthRub ?? null,
      revenueCohortRub: revenue?.salesPerMonthRub === null || revenue === null ? null : revenue.salesPerMonthRub * cohort.count,
    },
    staffing: pointStaffingProjection(cohort.format, cohort.locationType, foodPortionsPerDay),
  };
}
