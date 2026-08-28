import { configuredFinancialPolicy, type ConfiguredEconomicsScenario } from "./configured-economics";
import {
  financialCoverage,
  firstPaybackMonth,
  roundFinancial,
  type FinancialCoverage,
  type FinancialCoverageIssue,
  type FinancialCoverageStatus,
} from "./financial-core";
import type { InvestorConfiguration } from "./investor-configuration";
import { canonicalTemporalAssumptions } from "./network-planning";
import { rentPrepaymentMonth } from "./rent-prepayment";
import {
  buildNetworkSteadyState,
  calculateFinancialPnl,
  cohortAssetSummary,
  sharedNetworkOpexForActivePoints,
  type NetworkFinancialExclusion,
} from "./network-financial-core";
import { pointOperationalProjectionForMonthlyChecks } from "./point-operations";
import {
  networkScalingProjection,
  pointDirectOpexProjection,
  type BaseObjectFinancialProjection,
  type NetworkPointCohortProjection,
  type NetworkScalingProjection,
} from "./network-scaling";

export type TemporalMonth = {
  month: number;
  calendarMonth: number;
  activePointCount: number;
  newOpenings: number;
  revenueRub: number | null;
  netRevenueRub: number | null;
  opexRub: number | null;
  ebitdaRub: number | null;
  taxRub: number | null;
  depreciationRub: number | null;
  maintenanceCapexRub: number | null;
  operatingFreeCashFlowRub: number | null;
  /** Contractual rent paid by a prior prepayment; not a second cash outflow. */
  prepaidRentCreditRub: number | null;
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
  /** Point CAPEX only; the shared operating reserve is held at programme level. */
  investmentRub: number | null;
  paybackMonth: number | null;
  cumulativeCashFlowRub: number | null;
  months: TemporalMonth[];
  isPartial: boolean;
  missing: string[];
};

export type NetworkTemporalProjection = {
  status: FinancialCoverageStatus;
  coverage: FinancialCoverage;
  warnings: string[];
  exclusions: NetworkFinancialExclusion[];
  provenance: {
    base: BaseObjectFinancialProjection["context"];
    expansion: "network_expansion";
    network: "consolidated_network";
  };
  startCalendarMonth: number;
  horizonMonths: number;
  /** Last approved ramp-profile month; consumers must not duplicate the curve. */
  rampDurationMonths: number;
  lastOpeningMonth: number | null;
  fullScaleMonth: number | null;
  base: {
    context: BaseObjectFinancialProjection["context"];
    investmentRub: number;
    paybackMonth: number | null;
    months: TemporalMonth[];
  };
  expansion: {
    context: "network_expansion";
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
    context: "consolidated_network";
    pointCount: number;
    investmentRub: number | null;
    paybackMonth: number | null;
    cumulativeCashFlowRub: number | null;
    months: TemporalMonth[];
    isPartial: boolean;
  };
  funding: {
    baseStartInvestmentRub: number;
    rolloutFundingRequirementRub: number | null;
    totalProgramInvestmentRub: number | null;
    upfrontInvestorFundingRub: number | null;
    minimumUnfundedCumulativeCashRub: number | null;
  };
};

/**
 * The public projection always uses the governed planning lead.  The optional
 * override is deliberately limited to the internal workbench: it changes
 * dates, never revenue/OPEX/tax formulas or published assumptions.
 */
export type NetworkTemporalOptions = {
  developmentLeadMonths?: number;
};

function sumKnown(values: readonly (number | null)[]) {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
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

function temporalPayback(months: readonly TemporalMonth[]) {
  if (months.some((month) => month.cashFlowRub === null)) return null;
  return firstPaybackMonth(months.map((month) => month.cashFlowRub ?? 0));
}

function baseMonths(
  baseObject: BaseObjectFinancialProjection,
  scenario: Pick<ConfiguredEconomicsScenario, "cashFlows" | "monthlyProjection">,
  horizon: number,
  calendarStartMonth: number,
  developmentLeadMonths: number,
) {
  let cumulative = 0;
  return Array.from({ length: horizon + 1 }, (_, month) => {
    // Month M4 is the first commercial/operating month after a four-month
    // M0→M4 development lead, so it consumes ramp month 1.
    const operatingMonth = month - developmentLeadMonths + 1;
    const source = operatingMonth <= 0 ? null : scenario.monthlyProjection[operatingMonth - 1];
    const preOperating = month > 0 && month < developmentLeadMonths;
    const cashFlowRub = month === 0
      ? scenario.cashFlows[0] ?? null
      : operatingMonth <= 0 ? 0 : scenario.cashFlows[operatingMonth] ?? null;
    if (cashFlowRub !== null) cumulative += cashFlowRub;
    return {
      month,
      calendarMonth: month === 0 ? calendarStartMonth : source?.calendarMonth ?? calendarMonthFor(calendarStartMonth, month),
      activePointCount: month >= developmentLeadMonths ? 1 : 0,
      newOpenings: month === developmentLeadMonths ? 1 : 0,
      revenueRub: month === 0 || preOperating ? 0 : source?.revenueRub ?? null,
      netRevenueRub: month === 0 || preOperating ? 0 : source?.netRevenueRub ?? null,
      opexRub: month === 0 || preOperating ? 0 : source?.opexRub ?? null,
      ebitdaRub: month === 0 || preOperating ? 0 : source?.ebitdaRub ?? null,
      taxRub: month === 0 || preOperating ? 0 : source?.taxRub ?? null,
      depreciationRub: month === 0 || preOperating ? 0 : source?.depreciationRub ?? null,
      maintenanceCapexRub: month === 0 || preOperating ? 0 : source?.maintenanceCapexRub ?? null,
      operatingFreeCashFlowRub: month === 0 || preOperating ? 0 : source?.operatingFreeCashFlowRub ?? null,
      prepaidRentCreditRub: month === 0 || preOperating ? 0 : source?.prepaidRentCreditRub ?? 0,
      capexRub: month === 0 ? baseObject.investmentRub : 0,
      operatingReserveRub: month === 0 ? baseObject.operatingReserveRub : 0,
      cashFlowRub,
      cumulativeCashFlowRub: cashFlowRub === null ? null : roundFinancial(cumulative),
    } satisfies TemporalMonth;
  });
}

type GroupMonth = {
  activePointCount: number;
  newOpenings: number;
  revenueRub: number | null;
  directOpexRub: number | null;
  depreciationRub: number | null;
  maintenanceCapexRub: number | null;
  taxRub: number | null;
  operatingFreeCashFlowRub: number | null;
  prepaidRentCreditRub: number;
  capexRub: number;
  cashFlowRub: number | null;
  missing: string[];
};

function groupMonthProjection(
  configuration: InvestorConfiguration,
  cohort: NetworkPointCohortProjection,
  month: number,
  temporal: ReturnType<typeof canonicalTemporalAssumptions>,
) : GroupMonth {
  const policy = configuredFinancialPolicy(configuration.scenarioId);
  const waves = cohort.cohort.openingWaves;
  const active = waves.filter((wave) => month >= wave.openingMonth);
  const newOpenings = waves.filter((wave) => month === wave.openingMonth);
  const activePointCount = active.reduce((sum, wave) => sum + wave.count, 0);
  const capexMonth = waves.filter((wave) => month === Math.max(0, wave.openingMonth - temporal.developmentLeadMonths));
  const capexRub = capexMonth.reduce((sum, wave) => sum + cohort.confirmedPointInvestmentRub * wave.count, 0);
  const records = active.map((wave) => {
    const operatingMonth = month - wave.openingMonth + 1;
    const rampFactor = factorFor(temporal.rampUpProfile, operatingMonth);
    const seasonalityFactor = factorFor(temporal.seasonalityProfile, calendarMonthFor(configuration.networkScaling.calendarStartMonth, month));
    const steadyChecks = cohort.operational.sales.checksPerDay;
    const averageCheck = cohort.operational.sales.averageCheckRub;
    if (rampFactor === null || seasonalityFactor === null || steadyChecks === null || averageCheck === null) {
      return { revenueRub: null, directOpexRub: null, prepaidRentCreditRub: 0, missing: ["Продажи точки"] };
    }
    const operational = pointOperationalProjectionForMonthlyChecks(
      configuration,
      cohort.cohort,
      steadyChecks * rampFactor * seasonalityFactor,
      averageCheck,
    );
    const rentSettlement = cohort.cohort.locationType === "foodhall" || cohort.cohort.realEstateMode !== "rent"
      ? null
      : rentPrepaymentMonth({
        operatingMonth,
        monthlyRentRub: cohort.cohort.monthlyRentRub ?? 0,
        prepaidMonths: cohort.cohort.prepaymentMonths ?? 0,
        rentFreeMonths: cohort.cohort.rentFreeMonths,
      });
    const rentChargeRub = rentSettlement?.contractualRentRub;
    const direct = pointDirectOpexProjection(cohort.cohort, operational, {
      ...(rentChargeRub === undefined ? {} : { rentChargeRub }),
      baseEquipmentServiceAssetBasisRub: cohort.baseEquipmentServiceAssetBasisRub,
      equipmentServiceAssetBasisRub: cohort.equipmentServiceAssetBasisRub,
    });
    return {
      revenueRub: operational.sales.revenuePerPointRub === null ? null : operational.sales.revenuePerPointRub * wave.count,
      directOpexRub: direct.directOpexPerPointRub === null ? null : direct.directOpexPerPointRub * wave.count,
      prepaidRentCreditRub: (rentSettlement?.prepaidRentCreditRub ?? 0) * wave.count,
      missing: direct.missing,
    };
  });
  const revenueRub = sumKnown(records.map((record) => record.revenueRub));
  const directOpexRub = sumKnown(records.map((record) => record.directOpexRub));
  const prepaidRentCreditRub = records.reduce((sum, record) => sum + record.prepaidRentCreditRub, 0);
  const assets = cohortAssetSummary(cohort, policy, activePointCount);
  const pnl = calculateFinancialPnl(revenueRub, directOpexRub, assets.depreciationRub, assets.maintenanceCapexRub, policy);
  const cashFlowRub = pnl.operatingFreeCashFlowRub === null ? null : roundFinancial(pnl.operatingFreeCashFlowRub - capexRub + prepaidRentCreditRub);
  return {
    activePointCount,
    newOpenings: newOpenings.reduce((sum, wave) => sum + wave.count, 0),
    revenueRub,
    directOpexRub,
    depreciationRub: pnl.depreciationRub,
    maintenanceCapexRub: pnl.maintenanceCapexRub,
    taxRub: pnl.taxRub,
    operatingFreeCashFlowRub: pnl.operatingFreeCashFlowRub,
    prepaidRentCreditRub,
    capexRub,
    cashFlowRub,
    missing: records.flatMap((record) => record.missing),
  };
}

function groupTemporalProjection(
  configuration: InvestorConfiguration,
  cohort: NetworkPointCohortProjection,
  temporal: ReturnType<typeof canonicalTemporalAssumptions>,
): TemporalPointGroupProjection {
  const firstOpeningMonth = cohort.cohort.openingWaves.at(0)?.openingMonth ?? null;
  const lastOpeningMonth = cohort.cohort.openingWaves.at(-1)?.openingMonth ?? null;
  const rampDurationMonths = temporal.rampUpProfile.at(-1)?.month ?? 0;
  let cumulative: number | null = 0;
  const missing = new Set<string>();
  const months = Array.from({ length: temporal.horizonMonths + 1 }, (_, month) => {
    const result = groupMonthProjection(configuration, cohort, month, temporal);
    result.missing.forEach((item) => missing.add(item));
    if (result.cashFlowRub === null || cumulative === null) cumulative = null;
    else cumulative += result.cashFlowRub;
    return {
      month,
      calendarMonth: calendarMonthFor(configuration.networkScaling.calendarStartMonth, month),
      activePointCount: result.activePointCount,
      newOpenings: result.newOpenings,
      revenueRub: result.revenueRub,
      netRevenueRub: result.revenueRub,
      opexRub: result.directOpexRub,
      ebitdaRub: result.revenueRub === null || result.directOpexRub === null ? null : roundFinancial(result.revenueRub - result.directOpexRub),
      taxRub: result.taxRub,
      depreciationRub: result.depreciationRub,
      maintenanceCapexRub: result.maintenanceCapexRub,
      operatingFreeCashFlowRub: result.operatingFreeCashFlowRub,
      prepaidRentCreditRub: result.prepaidRentCreditRub,
      capexRub: result.capexRub,
      operatingReserveRub: 0,
      cashFlowRub: result.cashFlowRub,
      cumulativeCashFlowRub: cumulative === null ? null : roundFinancial(cumulative),
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
    investmentRub: sumKnown(months.map((month) => month.capexRub)),
    paybackMonth: temporalPayback(months),
    cumulativeCashFlowRub: months.at(-1)?.cumulativeCashFlowRub ?? null,
    months,
    isPartial: missing.size > 0,
    missing: [...missing],
  };
}

function activeAdditionalChecks(
  groups: readonly TemporalPointGroupProjection[],
  scaling: NetworkScalingProjection,
  month: number,
) {
  return groups.reduce<number | null>((total, group) => {
    if (total === null) return null;
    const cohort = scaling.cohorts.find((item) => item.cohort.id === group.cohortId);
    const revenue = group.months[month]?.revenueRub;
    const average = cohort?.operational.sales.averageCheckRub;
    const days = cohort?.operational.sales.workingDaysPerMonth;
    if (revenue === null || revenue === undefined || average === null || average === undefined || !days) return null;
    return total + revenue / average / days;
  }, 0);
}

function activeExpansionAssets(
  groups: readonly TemporalPointGroupProjection[],
  scaling: NetworkScalingProjection,
  month: number,
  configuration: InvestorConfiguration,
) {
  const policy = configuredFinancialPolicy(configuration.scenarioId);
  const summaries = groups.map((group) => {
    const cohort = scaling.cohorts.find((item) => item.cohort.id === group.cohortId);
    return cohort ? cohortAssetSummary(cohort, policy, group.months[month]?.activePointCount ?? 0) : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    depreciationRub: summaries.reduce((total, item) => total + item.depreciationRub, 0),
    maintenanceCapexRub: summaries.reduce((total, item) => total + item.maintenanceCapexRub, 0),
  };
}

/**
 * Monthly Current Base + Network Expansion + Consolidated Network projection.
 * Shared tax/FCF primitives are applied to the aggregate P&L; the legacy
 * expansion operating contribution is no longer named or treated as cash flow.
 */
export function networkTemporalProjection(
  configuration: InvestorConfiguration,
  baseObject: BaseObjectFinancialProjection,
  scenario: Pick<ConfiguredEconomicsScenario, "cashFlows" | "monthlyProjection">,
  suppliedScaling = networkScalingProjection(configuration),
  options: NetworkTemporalOptions = {},
): NetworkTemporalProjection {
  const governedTemporal = canonicalTemporalAssumptions();
  const developmentLeadMonths = options.developmentLeadMonths ?? governedTemporal.developmentLeadMonths;
  if (!Number.isInteger(developmentLeadMonths) || developmentLeadMonths < 0) {
    throw new Error("Development lead must be a non-negative whole number of months.");
  }
  const temporal = { ...governedTemporal, developmentLeadMonths };
  const openingShift = developmentLeadMonths - governedTemporal.developmentLeadMonths;
  const policy = configuredFinancialPolicy(configuration.scenarioId);
  const scaling = suppliedScaling;
  const steady = buildNetworkSteadyState(configuration, scaling, policy);
  const base = { ...baseObject, months: baseMonths(baseObject, scenario, temporal.horizonMonths, configuration.networkScaling.calendarStartMonth, temporal.developmentLeadMonths) };
  const groups = scaling.cohorts.slice(1).map((cohort) => groupTemporalProjection(configuration, {
    ...cohort,
    cohort: {
      ...cohort.cohort,
      openingWaves: cohort.cohort.openingWaves.map((wave) => ({
        ...wave,
        openingMonth: Math.max(0, wave.openingMonth + openingShift),
      })),
    },
  }, temporal));
  const additionalPointCount = groups.reduce((sum, group) => sum + group.openingWaves.reduce((count, wave) => count + wave.count, 0), 0);
  const plannedNetworkPointCount = additionalPointCount + 1;
  const vehicleFundingMonth = steady.sharedInfrastructureRub <= 0
    ? null
    : (() => {
      const fundingMonth = steady.operatingReserve?.sharedReserves.find((item) => item.id.startsWith("logistics-own"))?.fundingMonth ?? null;
      return fundingMonth === null ? null : Math.max(0, fundingMonth + openingShift);
    })();
  let expansionCumulative: number | null = 0;
  let networkCumulative: number | null = 0;
  const groupMissing = new Set(groups.flatMap((group) => group.missing));
  const temporalIssues: FinancialCoverageIssue[] = [];
  const temporalExclusions: NetworkFinancialExclusion[] = [];
  const expansionMonths = Array.from({ length: temporal.horizonMonths + 1 }, (_, month) => {
    const groupMonths = groups.map((group) => group.months[month]);
    const activePointCount = groupMonths.reduce((sum, item) => sum + item.activePointCount, 0);
    const newOpenings = groupMonths.reduce((sum, item) => sum + item.newOpenings, 0);
    const revenueRub = sumKnown(groupMonths.map((item) => item.revenueRub));
    const directOpexRub = sumKnown(groupMonths.map((item) => item.opexRub));
    const pointCapexRub = groupMonths.reduce((sum, item) => sum + (item.capexRub ?? 0), 0);
    const prepaidRentCreditRub = groupMonths.reduce((sum, item) => sum + (item.prepaidRentCreditRub ?? 0), 0);
    const checks = activeAdditionalChecks(groups, scaling, month);
    const baseChecks = scaling.cohorts[0]?.operational.sales.checksPerDay ?? null;
    const shared = sharedNetworkOpexForActivePoints(configuration, {
      totalPointCount: 1 + activePointCount,
      additionalPointCount: activePointCount,
      totalChecksPerDay: checks === null || baseChecks === null ? null : baseChecks + checks,
      baseChecksPerDay: baseChecks,
      additionalNetRevenueRub: revenueRub,
      plannedAdditionalPointCount: additionalPointCount,
    });
    // Keep calculating the known basis if a contract-priced shared line (for
    // example early external logistics) is not supplied yet. The gap is kept
    // in coverage and never represented as a priced zero.
    const opexRub = sumKnown([directOpexRub, shared.knownSharedExpansionOpexRub, shared.logisticsRub ?? 0]);
    for (const line of [...shared.unpricedRecurringLines, ...shared.conditionalAssumptionLines]) {
      if (temporalIssues.some((issue) => issue.id === line.id)) continue;
      temporalIssues.push({
        id: line.id,
        category: shared.unpricedRecurringLines.some((candidate) => candidate.id === line.id) ? "unresolved_recurring_opex" : "exclusion",
        message: `${line.name}: ${line.reason}`,
        material: shared.unpricedRecurringLines.some((candidate) => candidate.id === line.id),
        dimension: shared.unpricedRecurringLines.some((candidate) => candidate.id === line.id) ? "pricing" : "assumptions",
        ...(shared.unpricedRecurringLines.some((candidate) => candidate.id === line.id) ? {} : { assumptionStatus: "planning" as const }),
      });
      temporalExclusions.push({
        ...line,
        category: shared.unpricedRecurringLines.some((candidate) => candidate.id === line.id) ? "unresolved_recurring_opex" : "exclusion",
      });
    }
    const assets = activeExpansionAssets(groups, scaling, month, configuration);
    const pnl = calculateFinancialPnl(revenueRub, opexRub, assets.depreciationRub, assets.maintenanceCapexRub, policy);
    const sharedCapexRub = vehicleFundingMonth === month ? steady.sharedInfrastructureRub : 0;
    const reserveEvents = (steady.operatingReserve?.fundingEvents ?? [])
      .filter((event) => Math.max(0, event.month + openingShift) === month);
    const reserveRub = reserveEvents.some((event) => event.amountRub === null)
      ? null
      : roundFinancial(reserveEvents.reduce((sum, event) => sum + (event.amountRub ?? 0), 0));
    const capexRub = pointCapexRub + sharedCapexRub;
    const cashFlowRub = pnl.operatingFreeCashFlowRub === null || reserveRub === null
      ? null
      : roundFinancial(pnl.operatingFreeCashFlowRub - capexRub - reserveRub + prepaidRentCreditRub);
    if (cashFlowRub === null || expansionCumulative === null) expansionCumulative = null;
    else expansionCumulative += cashFlowRub;
    return {
      month,
      calendarMonth: calendarMonthFor(configuration.networkScaling.calendarStartMonth, month),
      activePointCount,
      newOpenings,
      revenueRub: pnl.revenueRub,
      netRevenueRub: pnl.netRevenueRub,
      opexRub: pnl.opexRub,
      ebitdaRub: pnl.ebitdaRub,
      taxRub: pnl.taxRub,
      depreciationRub: pnl.depreciationRub,
      maintenanceCapexRub: pnl.maintenanceCapexRub,
      operatingFreeCashFlowRub: pnl.operatingFreeCashFlowRub,
      prepaidRentCreditRub,
      capexRub,
      operatingReserveRub: reserveRub,
      cashFlowRub,
      cumulativeCashFlowRub: expansionCumulative === null ? null : roundFinancial(expansionCumulative),
    } satisfies TemporalMonth;
  });
  const networkMonths = expansionMonths.map((expansion, month) => {
    const baseMonth = base.months[month];
    const revenueRub = sumKnown([baseMonth.revenueRub, expansion.revenueRub]);
    const opexRub = sumKnown([baseMonth.opexRub, expansion.opexRub]);
    const depreciationRub = sumKnown([baseMonth.depreciationRub, expansion.depreciationRub]);
    const maintenanceCapexRub = sumKnown([baseMonth.maintenanceCapexRub, expansion.maintenanceCapexRub]);
    const pnl = calculateFinancialPnl(revenueRub, opexRub, depreciationRub, maintenanceCapexRub, policy);
    const baseCashAdjustmentRub = baseMonth.cashFlowRub === null || baseMonth.operatingFreeCashFlowRub === null
      ? null
      : baseMonth.cashFlowRub - baseMonth.operatingFreeCashFlowRub;
    const cashFlowRub = pnl.operatingFreeCashFlowRub === null || baseCashAdjustmentRub === null || expansion.capexRub === null || expansion.operatingReserveRub === null
      ? null
      : roundFinancial(pnl.operatingFreeCashFlowRub + baseCashAdjustmentRub - expansion.capexRub - expansion.operatingReserveRub + (expansion.prepaidRentCreditRub ?? 0));
    if (cashFlowRub === null || networkCumulative === null) networkCumulative = null;
    else networkCumulative += cashFlowRub;
    return {
      month,
      calendarMonth: baseMonth.calendarMonth,
      activePointCount: baseMonth.activePointCount + expansion.activePointCount,
      newOpenings: baseMonth.newOpenings + expansion.newOpenings,
      revenueRub: pnl.revenueRub,
      netRevenueRub: pnl.netRevenueRub,
      opexRub: pnl.opexRub,
      ebitdaRub: pnl.ebitdaRub,
      taxRub: pnl.taxRub,
      depreciationRub: pnl.depreciationRub,
      maintenanceCapexRub: pnl.maintenanceCapexRub,
      operatingFreeCashFlowRub: pnl.operatingFreeCashFlowRub,
      prepaidRentCreditRub: sumKnown([baseMonth.prepaidRentCreditRub, expansion.prepaidRentCreditRub]),
      capexRub: (baseMonth.capexRub ?? 0) + (expansion.capexRub ?? 0),
      operatingReserveRub: sumKnown([baseMonth.operatingReserveRub, expansion.operatingReserveRub]),
      cashFlowRub,
      cumulativeCashFlowRub: networkCumulative === null ? null : roundFinancial(networkCumulative),
    } satisfies TemporalMonth;
  });
  const pointInvestmentRub = expansionMonths.reduce((sum, month) => sum + (month.capexRub ?? 0), 0) - steady.sharedInfrastructureRub;
  const lastOpeningMonth = groups.map((group) => group.lastOpeningMonth).filter((month): month is number => month !== null).sort((a, b) => b - a)[0] ?? null;
  const fullScaleMonth = lastOpeningMonth === null ? null : lastOpeningMonth + (temporal.rampUpProfile.at(-1)?.month ?? 1) - 1;
  const expansionInvestmentRub = steady.investmentRub;
  const totalProgramInvestmentRub = expansionInvestmentRub === null ? null : roundFinancial(baseObject.investmentRub + expansionInvestmentRub);
  const minimumUnfundedCumulativeCashRub = networkMonths.some((month) => month.cumulativeCashFlowRub === null)
    ? null
    : Math.min(...networkMonths.map((month) => month.cumulativeCashFlowRub ?? 0));
  const upfrontInvestorFundingRub = minimumUnfundedCumulativeCashRub === null
    ? null
    : roundFinancial(Math.max(0, -minimumUnfundedCumulativeCashRub));
  const coverage = financialCoverage([...steady.coverage.issues, ...temporalIssues]);
  const warnings = [...new Set([...steady.warnings, ...temporalIssues.map((issue) => issue.message)])];
  const exclusions = [...steady.exclusions, ...temporalExclusions];
  // Calculation availability is deliberately narrower than disclosure
  // caveats: VAT confirmation or a capacity review must not erase a valid
  // known-basis cash-flow series.
  const partial = coverage.calculation !== "complete" || coverage.pricing !== "complete";
  return {
    status: coverage.status,
    coverage,
    warnings,
    exclusions,
    provenance: { base: baseObject.context, expansion: "network_expansion", network: "consolidated_network" },
    startCalendarMonth: configuration.networkScaling.calendarStartMonth,
    horizonMonths: temporal.horizonMonths,
    rampDurationMonths: temporal.rampUpProfile.at(-1)?.month ?? 0,
    lastOpeningMonth,
    fullScaleMonth,
    base: { context: baseObject.context, investmentRub: baseObject.investmentRub, paybackMonth: baseObject.paybackMonth, months: base.months },
    expansion: {
      context: "network_expansion",
      additionalPointCount,
      pointInvestmentRub,
      sharedInfrastructureRub: steady.sharedInfrastructureRub,
      operatingReserveRub: steady.operatingReserveRub,
      investmentRub: expansionInvestmentRub,
      paybackMonth: temporalPayback(expansionMonths),
      cumulativeCashFlowRub: expansionMonths.at(-1)?.cumulativeCashFlowRub ?? null,
      months: expansionMonths,
      groups,
      isPartial: partial,
      missing: [...new Set([...groupMissing, ...warnings])],
    },
    network: {
      context: "consolidated_network",
      pointCount: plannedNetworkPointCount,
      investmentRub: totalProgramInvestmentRub,
      paybackMonth: temporalPayback(networkMonths),
      cumulativeCashFlowRub: networkMonths.at(-1)?.cumulativeCashFlowRub ?? null,
      months: networkMonths,
      isPartial: partial || networkMonths.some((month) => month.cashFlowRub === null),
    },
    funding: {
      baseStartInvestmentRub: baseObject.investmentRub,
      rolloutFundingRequirementRub: expansionInvestmentRub,
      totalProgramInvestmentRub,
      upfrontInvestorFundingRub,
      minimumUnfundedCumulativeCashRub,
    },
  };
}
