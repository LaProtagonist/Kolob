import type { ConfiguredEconomicsScenario } from "./configured-economics";
import type { InvestorConfiguration } from "./investor-configuration";
import {
  canonicalTemporalAssumptions,
  logisticsPlanning,
  productionStaffingProjection,
  sharedManagerPayrollProjection,
} from "./network-planning";
import { pointOperationalProjectionForMonthlyChecks } from "./point-operations";
import {
  networkScalingProjection,
  pointDirectOpexProjection,
  type BaseObjectFinancialProjection,
  type NetworkPointCohortProjection,
} from "./network-scaling";

export type TemporalMonth = {
  month: number;
  calendarMonth: number;
  activePointCount: number;
  newOpenings: number;
  revenueRub: number | null;
  opexRub: number | null;
  capexRub: number | null;
  operatingReserveRub: number | null;
  cashFlowRub: number | null;
  cumulativeCashFlowRub: number | null;
};

export type TemporalPointGroupProjection = {
  cohortId: string;
  firstOpeningMonth: number | null;
  lastOpeningMonth: number | null;
  openingWaves: Array<{ openingMonth: number; count: number }>;
  rentFreeMonths: number;
  rampDurationMonths: number;
  /** First calendar month in which the group's first point reaches its plan level. */
  planLevelMonth: number | null;
  /** Total programme requirement for this group, including its reserve. */
  investmentRub: number | null;
  paybackMonth: number | null;
  cumulativeCashFlowRub: number | null;
  months: TemporalMonth[];
  isPartial: boolean;
  missing: string[];
};

export type NetworkTemporalProjection = {
  status: "complete" | "partial" | "unset";
  startCalendarMonth: number;
  horizonMonths: number;
  lastOpeningMonth: number | null;
  fullScaleMonth: number | null;
  base: {
    investmentRub: number;
    paybackMonth: number | null;
    months: TemporalMonth[];
  };
  expansion: {
    additionalPointCount: number;
    pointInvestmentRub: number;
    sharedInfrastructureRub: number;
    operatingReserveRub: number | null;
    investmentRub: number | null;
    paybackMonth: number | null;
    cumulativeCashFlowRub: number | null;
    months: TemporalMonth[];
    groups: TemporalPointGroupProjection[];
    isPartial: boolean;
    missing: string[];
  };
  network: {
    pointCount: number;
    paybackMonth: number | null;
    cumulativeCashFlowRub: number | null;
    months: TemporalMonth[];
    isPartial: boolean;
  };
};

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function firstPaybackMonth(months: TemporalMonth[]) {
  // Months before an expansion has any investment or operating movement are
  // intentionally zero. They are not a payback event for a programme that
  // starts later in the same network timeline.
  let started = false;
  for (const month of months) {
    if (month.cashFlowRub === null) continue;
    if (month.cashFlowRub !== 0) started = true;
    if (started && month.cumulativeCashFlowRub !== null && month.cumulativeCashFlowRub >= 0) return month.month;
  }
  return null;
}

function sumKnown(values: Array<number | null>) {
  return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function calendarMonthFor(startCalendarMonth: number, month: number) {
  return ((startCalendarMonth - 1 + Math.max(month - 1, 0)) % 12) + 1;
}

function factorFor(profile: Array<{ month: number; factor: number }>, month: number) {
  const ordered = [...profile].sort((left, right) => left.month - right.month);
  const exact = ordered.find((row) => row.month === month);
  if (exact) return exact.factor;
  const last = ordered.at(-1);
  return last && month > last.month ? last.factor : null;
}

function baseMonths(
  baseObject: BaseObjectFinancialProjection,
  scenario: Pick<ConfiguredEconomicsScenario, "cashFlows" | "monthlyProjection">,
  horizon: number,
  calendarStartMonth: number,
) {
  let cumulative = 0;
  return Array.from({ length: horizon + 1 }, (_, month) => {
    const source = month === 0 ? null : scenario.monthlyProjection[month - 1];
    const cashFlowRub = scenario.cashFlows[month] ?? null;
    if (cashFlowRub !== null) cumulative += cashFlowRub;
    return {
      month,
      calendarMonth: month === 0 ? calendarStartMonth : source?.calendarMonth ?? calendarMonthFor(calendarStartMonth, month),
      activePointCount: 1,
      newOpenings: month === 0 ? 1 : 0,
      revenueRub: month === 0 ? 0 : source?.revenueRub ?? null,
      opexRub: month === 0 ? 0 : source?.opexRub ?? null,
      capexRub: month === 0 ? baseObject.investmentRub : 0,
      operatingReserveRub: month === 0 ? baseObject.operatingReserveRub : 0,
      cashFlowRub,
      cumulativeCashFlowRub: cashFlowRub === null ? null : round(cumulative),
    } satisfies TemporalMonth;
  });
}

type GroupMonth = {
  activePointCount: number;
  newOpenings: number;
  revenueRub: number | null;
  directOpexRub: number | null;
  capexRub: number;
  operatingReserveRub: number | null;
  cashFlowRub: number | null;
  missing: string[];
};

function groupMonthProjection(
  configuration: InvestorConfiguration,
  cohort: NetworkPointCohortProjection,
  month: number,
) : GroupMonth {
  const temporal = canonicalTemporalAssumptions();
  const waves = cohort.cohort.openingWaves;
  const active = waves.filter((wave) => month >= wave.openingMonth);
  const newOpenings = waves.filter((wave) => month === wave.openingMonth);
  const activePointCount = active.reduce((sum, wave) => sum + wave.count, 0);
  const capexMonth = waves.filter((wave) => month === Math.max(0, wave.openingMonth - temporal.launchCapexLeadMonths));
  const capexRub = capexMonth.reduce((sum, wave) => sum + cohort.confirmedPointInvestmentRub * wave.count, 0);
  const reservePerPoint = cohort.directOpex.directOpexPerPointRub === null
    ? null
    : cohort.directOpex.directOpexPerPointRub * configuration.launchBudget.operatingReserveMonths;
  const operatingReserveRub = reservePerPoint === null && capexMonth.length
    ? null
    : capexMonth.reduce((sum, wave) => sum + (reservePerPoint ?? 0) * wave.count, 0);
  const records = active.map((wave) => {
    const operatingMonth = month - wave.openingMonth + 1;
    const rampFactor = factorFor(temporal.rampUpProfile, operatingMonth);
    const seasonalityFactor = factorFor(temporal.seasonalityProfile, calendarMonthFor(configuration.networkScaling.calendarStartMonth, month));
    const steadyChecks = cohort.operational.sales.checksPerDay;
    const averageCheck = cohort.operational.sales.averageCheckRub;
    if (rampFactor === null || seasonalityFactor === null || steadyChecks === null || averageCheck === null) {
      return { revenueRub: null, directOpexRub: null, missing: ["Продажи точки"] };
    }
    const operational = pointOperationalProjectionForMonthlyChecks(
      configuration,
      cohort.cohort,
      steadyChecks * rampFactor * seasonalityFactor,
      averageCheck,
    );
    const rentChargeRub = cohort.cohort.locationType === "foodhall" || operatingMonth > cohort.cohort.rentFreeMonths
      ? undefined
      : 0;
    const direct = pointDirectOpexProjection(cohort.cohort, operational, rentChargeRub === undefined ? {} : { rentChargeRub });
    return {
      revenueRub: operational.sales.revenuePerPointRub === null ? null : operational.sales.revenuePerPointRub * wave.count,
      directOpexRub: direct.directOpexPerPointRub === null ? null : direct.directOpexPerPointRub * wave.count,
      missing: direct.missing,
    };
  });
  const revenueRub = sumKnown(records.map((record) => record.revenueRub));
  const directOpexRub = sumKnown(records.map((record) => record.directOpexRub));
  const missing = records.flatMap((record) => record.missing);
  const cashFlowRub = revenueRub === null || directOpexRub === null || operatingReserveRub === null
    ? null
    : round(revenueRub - directOpexRub - capexRub - operatingReserveRub);
  return { activePointCount, newOpenings: newOpenings.reduce((sum, wave) => sum + wave.count, 0), revenueRub, directOpexRub, capexRub, operatingReserveRub, cashFlowRub, missing };
}

function groupTemporalProjection(configuration: InvestorConfiguration, cohort: NetworkPointCohortProjection): TemporalPointGroupProjection {
  const temporal = canonicalTemporalAssumptions();
  const firstOpeningMonth = cohort.cohort.openingWaves.at(0)?.openingMonth ?? null;
  const lastOpeningMonth = cohort.cohort.openingWaves.at(-1)?.openingMonth ?? null;
  const rampDurationMonths = temporal.rampUpProfile.at(-1)?.month ?? 0;
  let cumulative: number | null = 0;
  const missing = new Set<string>();
  const months = Array.from({ length: temporal.horizonMonths + 1 }, (_, month) => {
    const result = groupMonthProjection(configuration, cohort, month);
    result.missing.forEach((item) => missing.add(item));
    if (result.cashFlowRub === null || cumulative === null) cumulative = null;
    else cumulative += result.cashFlowRub;
    return {
      month,
      calendarMonth: calendarMonthFor(configuration.networkScaling.calendarStartMonth, month),
      activePointCount: result.activePointCount,
      newOpenings: result.newOpenings,
      revenueRub: result.revenueRub,
      opexRub: result.directOpexRub,
      capexRub: result.capexRub,
      operatingReserveRub: result.operatingReserveRub,
      cashFlowRub: result.cashFlowRub,
      cumulativeCashFlowRub: cumulative === null ? null : round(cumulative),
    } satisfies TemporalMonth;
  });
  return {
    cohortId: cohort.cohort.id,
    firstOpeningMonth,
    lastOpeningMonth,
    openingWaves: cohort.cohort.openingWaves,
    rentFreeMonths: cohort.cohort.rentFreeMonths,
    rampDurationMonths,
    planLevelMonth: firstOpeningMonth === null ? null : firstOpeningMonth + Math.max(0, rampDurationMonths - 1),
    investmentRub: sumKnown(months.map((month) => month.operatingReserveRub === null
      ? null
      : (month.capexRub ?? 0) + month.operatingReserveRub)),
    paybackMonth: firstPaybackMonth(months),
    cumulativeCashFlowRub: months.at(-1)?.cumulativeCashFlowRub ?? null,
    months,
    isPartial: missing.size > 0,
    missing: [...missing],
  };
}

/**
 * Produces the timeline for the incremental network programme. Base cash flow
 * remains the configured canonical projection; point revenue and direct OPEX
 * reuse the existing revenue, payroll, contract and OPEX adapters.
 */
export function networkTemporalProjection(
  configuration: InvestorConfiguration,
  baseObject: BaseObjectFinancialProjection,
  scenario: Pick<ConfiguredEconomicsScenario, "cashFlows" | "monthlyProjection">,
): NetworkTemporalProjection {
  const temporal = canonicalTemporalAssumptions();
  const scaling = networkScalingProjection(configuration);
  const base = { ...baseObject, months: baseMonths(baseObject, scenario, temporal.horizonMonths, configuration.networkScaling.calendarStartMonth) };
  const groups = scaling.cohorts.slice(1).map((cohort) => groupTemporalProjection(configuration, cohort));
  const additionalPointCount = groups.reduce((sum, group) => sum + group.openingWaves.reduce((count, wave) => count + wave.count, 0), 0);
  const plannedNetworkPointCount = additionalPointCount + 1;
  const firstAdditionalOpening = groups.flatMap((group) => group.openingWaves).map((wave) => wave.openingMonth).sort((a, b) => a - b)[0] ?? null;
  const sharedInfrastructureRub = scaling.sharedItems.reduce((sum, item) => sum + (item.amountRub ?? 0), 0);
  const plannedLogistics = logisticsPlanning(plannedNetworkPointCount);
  const selectedLogisticsMode = configuration.networkScaling.logistics.mode === "auto"
    ? plannedLogistics.ownsVehicleSuggested ? "own" : "external"
    : configuration.networkScaling.logistics.mode;
  const sharedCapexMonth = firstAdditionalOpening === null ? null : Math.max(0, firstAdditionalOpening - temporal.launchCapexLeadMonths);
  let expansionCumulative: number | null = 0;
  let networkCumulative: number | null = 0;
  const expansionMissing = new Set(groups.flatMap((group) => group.missing));
  const expansionMonths = Array.from({ length: temporal.horizonMonths + 1 }, (_, month) => {
    const groupMonths = groups.map((group) => group.months[month]);
    const activePointCount = groupMonths.reduce((sum, item) => sum + item.activePointCount, 0);
    const newOpenings = groupMonths.reduce((sum, item) => sum + item.newOpenings, 0);
    const revenueRub = sumKnown(groupMonths.map((item) => item.revenueRub));
    const directOpexRub = sumKnown(groupMonths.map((item) => item.opexRub));
    const pointCapexRub = groupMonths.reduce((sum, item) => sum + (item.capexRub ?? 0), 0);
    const reserveRub = sumKnown(groupMonths.map((item) => item.operatingReserveRub));
    const baseChecks = scaling.cohorts[0]?.operational.sales.checksPerDay ?? null;
    const activeAdditionalChecks = groups.reduce((sum, group) => {
      const cohort = scaling.cohorts.find((item) => item.cohort.id === group.cohortId);
      const groupRevenue = group.months[month]?.revenueRub;
      const average = cohort?.operational.sales.averageCheckRub;
      const days = cohort?.operational.sales.workingDaysPerMonth;
      return groupRevenue === null || groupRevenue === undefined || average === null || average === undefined || !days
        ? sum
        : sum + groupRevenue / average / days;
    }, 0);
    const production = activePointCount > 0 && baseChecks !== null
      ? productionStaffingProjection(baseChecks + activeAdditionalChecks, configuration.networkScaling.productionSchedule)
      : null;
    const baseProduction = baseChecks === null ? null : productionStaffingProjection(baseChecks, configuration.networkScaling.productionSchedule);
    const incrementalProductionRub = production === null || baseProduction === null ? 0 : Math.max(0, production.totalPayrollRub - baseProduction.totalPayrollRub);
    const manager = activePointCount > 0 ? sharedManagerPayrollProjection(activePointCount + 1) : null;
    const baseManager = sharedManagerPayrollProjection(1);
    const incrementalManagerRub = manager === null ? 0 : Math.max(0, manager.totalPayrollRub - (baseManager?.totalPayrollRub ?? 0));
    const logisticsRub = activePointCount === 0 ? 0
      : selectedLogisticsMode === "own"
        ? configuration.networkScaling.logistics.ownedMonthlyTotalRub ?? plannedLogistics.ownedMonthlyTotalRub
        : configuration.networkScaling.logistics.externalMonthlyRub ?? plannedLogistics.externalMonthlyRub;
    if (logisticsRub === null) expansionMissing.add("Внешняя логистика");
    const sharedOpexRub = logisticsRub === null ? null : incrementalProductionRub + incrementalManagerRub + logisticsRub;
    const opexRub = directOpexRub === null || sharedOpexRub === null ? null : directOpexRub + sharedOpexRub;
    const sharedCapex = sharedCapexMonth === month ? sharedInfrastructureRub : 0;
    const capexRub = pointCapexRub + sharedCapex;
    const cashFlowRub = revenueRub === null || opexRub === null || reserveRub === null
      ? null
      : round(revenueRub - opexRub - capexRub - reserveRub);
    if (cashFlowRub === null || expansionCumulative === null) expansionCumulative = null;
    else expansionCumulative += cashFlowRub;
    return {
      month,
      calendarMonth: calendarMonthFor(configuration.networkScaling.calendarStartMonth, month),
      activePointCount,
      newOpenings,
      revenueRub,
      opexRub,
      capexRub,
      operatingReserveRub: reserveRub,
      cashFlowRub,
      cumulativeCashFlowRub: expansionCumulative === null ? null : round(expansionCumulative),
    } satisfies TemporalMonth;
  });
  const networkMonths = expansionMonths.map((expansion, month) => {
    const baseMonth = base.months[month];
    const revenueRub = sumKnown([baseMonth.revenueRub, expansion.revenueRub]);
    const opexRub = sumKnown([baseMonth.opexRub, expansion.opexRub]);
    const cashFlowRub = sumKnown([baseMonth.cashFlowRub, expansion.cashFlowRub]);
    if (cashFlowRub === null || networkCumulative === null) networkCumulative = null;
    else networkCumulative += cashFlowRub;
    return {
      month,
      calendarMonth: baseMonth.calendarMonth,
      activePointCount: baseMonth.activePointCount + expansion.activePointCount,
      newOpenings: baseMonth.newOpenings + expansion.newOpenings,
      revenueRub,
      opexRub,
      capexRub: (baseMonth.capexRub ?? 0) + (expansion.capexRub ?? 0),
      operatingReserveRub: sumKnown([baseMonth.operatingReserveRub, expansion.operatingReserveRub]),
      cashFlowRub,
      cumulativeCashFlowRub: networkCumulative === null ? null : round(networkCumulative),
    } satisfies TemporalMonth;
  });
  const totalReserveRub = sumKnown(groups.map((group) => {
    if (group.months.some((month) => month.operatingReserveRub === null)) return null;
    return group.months.reduce((sum, month) => sum + (month.operatingReserveRub ?? 0), 0);
  }));
  const pointInvestmentRub = groups.reduce((sum, group) => sum + group.months.reduce((value, month) => value + (month.capexRub ?? 0), 0), 0);
  const lastOpeningMonth = groups.map((group) => group.lastOpeningMonth).filter((month): month is number => month !== null).sort((a, b) => b - a)[0] ?? null;
  const fullScaleMonth = lastOpeningMonth === null ? null : lastOpeningMonth + (canonicalTemporalAssumptions().rampUpProfile.at(-1)?.month ?? 1) - 1;
  const expansionInvestmentRub = totalReserveRub === null ? null : pointInvestmentRub + sharedInfrastructureRub + totalReserveRub;
  const partial = expansionMissing.size > 0;
  return {
    status: additionalPointCount === 0 ? "unset" : partial ? "partial" : "complete",
    startCalendarMonth: configuration.networkScaling.calendarStartMonth,
    horizonMonths: temporal.horizonMonths,
    lastOpeningMonth,
    fullScaleMonth,
    base: { investmentRub: baseObject.investmentRub, paybackMonth: baseObject.paybackMonth, months: base.months },
    expansion: {
      additionalPointCount,
      pointInvestmentRub,
      sharedInfrastructureRub,
      operatingReserveRub: totalReserveRub,
      investmentRub: expansionInvestmentRub,
      paybackMonth: firstPaybackMonth(expansionMonths),
      cumulativeCashFlowRub: expansionMonths.at(-1)?.cumulativeCashFlowRub ?? null,
      months: expansionMonths,
      groups,
      isPartial: partial,
      missing: [...expansionMissing],
    },
    network: {
      pointCount: plannedNetworkPointCount,
      paybackMonth: firstPaybackMonth(networkMonths),
      cumulativeCashFlowRub: networkMonths.at(-1)?.cumulativeCashFlowRub ?? null,
      months: networkMonths,
      isPartial: partial || networkMonths.some((month) => month.cashFlowRub === null),
    },
  };
}
