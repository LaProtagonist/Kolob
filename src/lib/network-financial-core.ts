import {
  calculateFinancialMonthlyResult,
  financialCoverage,
  roundFinancial,
  type FinancialCoverage,
  type FinancialCoverageIssue,
  type FinancialProjectionContext,
} from "./financial-core";
import {
  equipmentDepreciationAsset,
  fitOutDepreciationAsset,
  furnitureDepreciationAsset,
  monthlyDepreciation,
  monthlyMaintenanceCapex,
  preparationDepreciationAsset,
  smallEquipmentDepreciationAsset,
  type FinancialDepreciationAsset,
} from "./financial-assets";
import type { ConfiguredFinancialPolicy } from "./configured-economics";
import type { InvestorConfiguration } from "./investor-configuration";
import { rentPrepaymentCoverage, type RentPrepaymentCoverage } from "./rent-prepayment";
import {
  historicalOpexTreatmentCatalog,
} from "./physical-allocation";
import {
  canonicalTemporalAssumptions,
  developmentLeadMonthsFor,
  canonicalNetworkOpexConstants,
  logisticsPlanning,
  productionCapacityProjection,
  productionStaffingProjection,
  sharedManagerPayrollProjection,
  type ProductionCapacityProjection,
  type PayrollProjection,
} from "./network-planning";
import type {
  NetworkPointCohortProjection,
  NetworkScalingProjection,
} from "./network-scaling";

export type BaseFinancialLayerInput = {
  context: FinancialProjectionContext;
  investmentRub: number;
  revenueRub: number;
  netRevenueRub: number;
  opexRub: number;
  ebitdaRub: number;
  taxRub: number;
  depreciationRub: number;
  maintenanceCapexRub: number;
  operatingFreeCashFlowRub: number;
  cashFlowRub: number;
  paybackMonth: number | null;
  operatingReserveRub: number | null;
};

export type FinancialPnl = {
  revenueRub: number | null;
  netRevenueRub: number | null;
  opexRub: number | null;
  ebitdaRub: number | null;
  taxRub: number | null;
  depreciationRub: number | null;
  maintenanceCapexRub: number | null;
  operatingFreeCashFlowRub: number | null;
};

export type NetworkFinancialExclusion = {
  id: string;
  name: string;
  category: FinancialCoverageIssue["category"];
  reason: string;
};

export type NetworkAssetSummary = {
  depreciationAssets: FinancialDepreciationAsset[];
  depreciationRub: number;
  maintenanceAssetBasisRub: number;
  maintenanceCapexRub: number;
  vehicleMaintenanceIncluded: false;
  vehicleMaintenanceTreatment: "included_in_logistics_opex";
  vehicleDepreciationTreatment: "requires_useful_life_decision";
};

export type SharedNetworkOpex = {
  productionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  baseProductionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  expansionProductionPayrollRub: number | null;
  managerPayroll: PayrollProjection | null;
  expansionManagerPayrollRub: number | null;
  logisticsRub: number | null;
  administrativeReserveRub: number | null;
  incrementalUniformRenewalRub: number | null;
  incrementalMedicalRub: number | null;
  fixedMarketingRub: number;
  expansionFixedMarketingRub: number;
  /** Calculable portion only; unpriced shared lines are disclosed separately. */
  knownSharedExpansionOpexRub: number | null;
  sharedExpansionOpexRub: number | null;
  unpricedRecurringLines: Array<{ id: string; name: string; reason: string }>;
  /** Rollout-only caveats that do not invalidate a >=3-point steady-state plan. */
  conditionalAssumptionLines: Array<{ id: string; name: string; reason: string }>;
  logisticsMode: "external" | "own" | "unknown";
  logisticsVehicleCapexRub: number | null;
  capacityReviewRequired: boolean;
  productionCapacity: ProductionCapacityProjection | null;
};

export type NetworkSteadyStateProjection = {
  context: "network_expansion";
  status: FinancialCoverage["status"];
  coverage: FinancialCoverage;
  warnings: string[];
  exclusions: NetworkFinancialExclusion[];
  additionalPointCount: number;
  pointInvestmentRub: number;
  sharedInfrastructureRub: number;
  /** Dated liquidity funding; it is never part of monthly P&L. */
  operatingReserve: ExpansionReserveProjection | null;
  operatingReserveRub: number | null;
  reserveMonths: number;
  investmentRub: number | null;
  directOpexRub: number | null;
  sharedOpexRub: number | null;
  shared: SharedNetworkOpex;
  assets: NetworkAssetSummary;
  pnl: FinancialPnl;
  paybackMonths: number | null;
};

export type ReserveQualifyingLine = {
  id: string;
  name: string;
  scope: "point" | "production" | "shared_network";
  monthlyAmountRub: number | null;
  classification: "fixed" | "semi_fixed" | "contractual_minimum";
  reason: string;
};

export type CohortReserveProjection = {
  id: string;
  cohortId: string;
  openingMonth: number;
  fundingMonth: number;
  pointCount: number;
  months: number;
  qualifyingMonthlyBasisRub: number | null;
  includedLines: ReserveQualifyingLine[];
  excludedLineIds: string[];
  prepaidCoverage: RentPrepaymentCoverage | null;
  uncoveredRentRub: number | null;
  totalReserveRub: number | null;
};

export type SharedReserveProjection = {
  id: string;
  name: string;
  activationMonth: number;
  fundingMonth: number;
  months: number;
  qualifyingMonthlyBasisRub: number | null;
  includedLines: ReserveQualifyingLine[];
  totalReserveRub: number | null;
  reason: string;
};

export type ReserveFundingEvent = {
  month: number;
  id: string;
  kind: "cohort_operating_reserve" | "shared_operating_reserve";
  amountRub: number | null;
};

/**
 * Operating reserve is a six-month liquidity balance for qualifying
 * fixed/semi-fixed costs.  It deliberately excludes sales-driven P&L and all
 * separately-funded launch lines, for both Current Base and Expansion.
 */
export type ExpansionReserveProjection = {
  context: "network_expansion";
  policy: "six_months_qualifying_fixed_and_semi_fixed_opex_by_cohort";
  months: number;
  cohortReserves: CohortReserveProjection[];
  sharedReserves: SharedReserveProjection[];
  fundingEvents: ReserveFundingEvent[];
  totalReserveRub: number | null;
  excludedLineIds: string[];
};

function sumNullable(values: readonly (number | null)[]) {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function pointCount(cohorts: readonly NetworkPointCohortProjection[]) {
  return cohorts.reduce((total, cohort) => total + cohort.cohort.count, 0);
}

function selectedLogistics(
  configuration: InvestorConfiguration,
  totalPointCount: number,
  additionalPointCount: number,
): Pick<SharedNetworkOpex, "logisticsMode" | "logisticsRub" | "logisticsVehicleCapexRub"> {
  // The governed threshold is expressed for additional network points. The
  // Base Object is already present and must not make a 1–2-point expansion
  // appear to have an owned refrigerated vehicle.
  const planning = logisticsPlanning(additionalPointCount);
  const logisticsMode = configuration.networkScaling.logistics.mode === "auto"
    ? planning.ownsVehicleSuggested ? "own" : "external"
    : configuration.networkScaling.logistics.mode;
  const logisticsRub = logisticsMode === "own"
    ? configuration.networkScaling.logistics.ownedMonthlyTotalRub ?? planning.ownedMonthlyTotalRub
    : configuration.networkScaling.logistics.externalMonthlyRub ?? planning.externalMonthlyRub;
  return {
    logisticsMode,
    logisticsRub,
    logisticsVehicleCapexRub: logisticsMode === "own"
      ? configuration.networkScaling.logistics.ownedVehicleCapexRub ?? planning.vehicleCapexRub
      : null,
  };
}

const reserveExcludedLineIds = [
  "food",
  "waste",
  "consumer-packaging",
  "acquiring",
  "variable-marketing",
  "foodhall-revenue-share-above-minimum",
  "administrative-reserve",
  "depreciation",
  "maintenance-capex",
  "income-tax",
  "initial-inventory",
  "launch-capex",
] as const;

function directLine(cohort: NetworkPointCohortProjection, id: string) {
  return cohort.directOpex.lines.find((line) => line.id === id)?.amountRub ?? null;
}

function cohortReserveLines(
  cohort: NetworkPointCohortProjection,
  pointCountForWave: number,
): ReserveQualifyingLine[] {
  const constants = canonicalNetworkOpexConstants();
  const multiply = (amount: number | null) => amount === null ? null : roundFinancial(amount * pointCountForWave);
  const line = (id: string, name: string, classification: ReserveQualifyingLine["classification"], reason: string, amount = directLine(cohort, id)): ReserveQualifyingLine => ({
    id,
    name,
    scope: "point",
    monthlyAmountRub: multiply(amount),
    classification,
    reason,
  });
  const result: ReserveQualifyingLine[] = [
    line("point-payroll", "Персонал точки", "fixed", "Защищённый roster/payroll точки."),
    {
      id: "household-fixed",
      name: "Хозяйственные расходы · фиксированная часть",
      scope: "point",
      monthlyAmountRub: roundFinancial(constants.householdFixedMonthlyRub * pointCountForWave),
      classification: "semi_fixed",
      reason: "Traffic component исключён из operating reserve.",
    },
    line("equipment-service", "Сервис оборудования точки", "semi_fixed", "Регулярный сервис, отдельный от maintenance CAPEX."),
    line("ventilation-grease", "Вентиляция и жироуловители", "semi_fixed", "Recurring service применимого помещения."),
    line("uniform-renewal", "Обновление спецодежды", "semi_fixed", "Калибровано по roster точки."),
    line("music", "Музыкальное сопровождение", "semi_fixed", "Только там, где оно не включено площадкой."),
    line("pest-control", "Pest control", "semi_fixed", "Recurring sanitary service помещения."),
    line("medical", "Медосмотры и санитарные документы", "semi_fixed", "Применяется к food-operation roster."),
    line("security-monitoring", "Пультовая охрана", "semi_fixed", "Ноль, если безопасность включена площадкой."),
    line("utilities", "Коммунальные", "semi_fixed", "Fixed/service contract component точки."),
    line("service", "Обязательный сервис площадки", "semi_fixed", "Service charge по договору формата."),
    line("storage", "Обязательное хранение", "semi_fixed", "Storage charge по договору формата."),
  ];
  if (cohort.cohort.locationType === "foodhall") {
    result.push({
      id: "foodhall-minimum-guarantee",
      name: "Foodhall · минимальная гарантия",
      scope: "point",
      monthlyAmountRub: cohort.cohort.minimumGuaranteeMonthlyRub === null ? null : roundFinancial(cohort.cohort.minimumGuaranteeMonthlyRub * pointCountForWave),
      classification: "contractual_minimum",
      reason: "Revenue share сверх минимальной гарантии не является reserve basis.",
    });
  }
  // Service/storage are format-specific contract lines. Their absence means
  // “not applicable”, not an unresolved zero that would invalidate reserve.
  return result.filter((item) => !["service", "storage"].includes(item.id)
    || cohort.directOpex.lines.some((lineItem) => lineItem.id === item.id));
}

function reserveRentLine(
  cohort: NetworkPointCohortProjection,
  pointCountForWave: number,
  reserveMonths: number,
): { line: ReserveQualifyingLine | null; coverage: RentPrepaymentCoverage | null; uncoveredRentRub: number | null } {
  if (cohort.cohort.locationType === "foodhall" || cohort.cohort.realEstateMode !== "rent") {
    return { line: null, coverage: null, uncoveredRentRub: 0 };
  }
  if (cohort.cohort.monthlyRentRub === null || cohort.cohort.prepaymentMonths === null) {
    return {
      line: {
        id: "uncovered-rent",
        name: "Непокрытая аренда",
        scope: "point",
        monthlyAmountRub: null,
        classification: "contractual_minimum",
        reason: "Для reserve нужны contractual rent и prepayment terms.",
      },
      coverage: null,
      uncoveredRentRub: null,
    };
  }
  const coverage = rentPrepaymentCoverage({
    monthlyRentRub: cohort.cohort.monthlyRentRub,
    prepaidMonths: cohort.cohort.prepaymentMonths,
    rentFreeMonths: cohort.cohort.rentFreeMonths,
    reserveMonths,
  });
  const uncoveredRentRub = roundFinancial(coverage.uncoveredRentRub * pointCountForWave);
  return {
    line: {
      id: "uncovered-rent",
      name: "Непокрытая аренда",
      scope: "point",
      monthlyAmountRub: reserveMonths === 0 ? 0 : roundFinancial(uncoveredRentRub / reserveMonths),
      classification: "contractual_minimum",
      reason: "Только payable rent после rent-free периода и использования prepaid credit.",
    },
    coverage: { ...coverage, uncoveredRentRub },
    uncoveredRentRub,
  };
}

function activeAdditionalCohortsAtMonth(scaling: NetworkScalingProjection, month: number) {
  return scaling.cohorts.slice(1).flatMap((cohort) => cohort.cohort.openingWaves
    .filter((wave) => wave.openingMonth <= month)
    .map((wave) => ({ cohort, count: wave.count })));
}

function sharedReserveLines(
  configuration: InvestorConfiguration,
  scaling: NetworkScalingProjection,
  month: number,
  plannedAdditionalPointCount: number,
) {
  const active = activeAdditionalCohortsAtMonth(scaling, month);
  const activePointCount = active.reduce((sum, item) => sum + item.count, 0);
  const totalChecks = active.reduce<number | null>((sum, item) => {
    const checks = item.cohort.operational.sales.checksPerDay;
    return sum === null || checks === null ? null : sum + checks * item.count;
  }, scaling.cohorts[0]?.operational.sales.checksPerDay ?? null);
  const additionalNetRevenue = active.reduce<number | null>((sum, item) => {
    const revenue = item.cohort.operational.sales.revenueCohortRub;
    const allCount = item.cohort.cohort.count || 1;
    return sum === null || revenue === null ? null : sum + revenue / allCount * item.count;
  }, 0);
  const baseChecks = scaling.cohorts[0]?.operational.sales.checksPerDay ?? null;
  const shared = sharedNetworkOpexForActivePoints(configuration, {
    totalPointCount: 1 + activePointCount,
    additionalPointCount: activePointCount,
    totalChecksPerDay: totalChecks,
    baseChecksPerDay: baseChecks,
    additionalNetRevenueRub: additionalNetRevenue,
    plannedAdditionalPointCount,
  });
  const candidateLines: ReserveQualifyingLine[] = [
    {
      id: "incremental-production-payroll",
      name: "Incremental Production payroll",
      scope: "production",
      monthlyAmountRub: shared.expansionProductionPayrollRub,
      classification: "fixed",
      reason: "Increment only over Current Base production payroll.",
    },
    {
      id: "incremental-production-uniforms",
      name: "Production uniforms",
      scope: "production",
      monthlyAmountRub: shared.incrementalUniformRenewalRub,
      classification: "semi_fixed",
      reason: "Incremental food-operation roster only.",
    },
    {
      id: "incremental-production-medical",
      name: "Production medical",
      scope: "production",
      monthlyAmountRub: shared.incrementalMedicalRub,
      classification: "semi_fixed",
      reason: "Incremental food-operation roster only.",
    },
    {
      id: `logistics-${shared.logisticsMode}`,
      name: shared.logisticsMode === "own" ? "Owned refrigerated logistics" : "External refrigerated logistics",
      scope: "shared_network",
      monthlyAmountRub: shared.logisticsRub,
      classification: "semi_fixed",
      reason: "Activated only when this logistics mode is actually in use.",
    },
  ];
  const lines = candidateLines.filter((line) => line.monthlyAmountRub !== 0);
  return { lines, logisticsMode: shared.logisticsMode };
}

export function expansionReserveProjection(
  configuration: InvestorConfiguration,
  scaling: NetworkScalingProjection,
): ExpansionReserveProjection {
  const reserveMonths = configuration.launchBudget.operatingReserveMonths;
  const cohortReserves = scaling.cohorts.slice(1).flatMap((cohort) => cohort.cohort.openingWaves.map((wave, index) => {
    const rent = reserveRentLine(cohort, wave.count, reserveMonths);
    const includedLines = cohortReserveLines(cohort, wave.count);
    if (rent.line) includedLines.push(rent.line);
    const qualifyingMonthlyBasisRub = includedLines.some((line) => line.monthlyAmountRub === null)
      ? null
      : roundFinancial(includedLines.reduce((sum, line) => sum + (line.monthlyAmountRub ?? 0), 0));
    const totalReserveRub = qualifyingMonthlyBasisRub === null || rent.uncoveredRentRub === null
      ? null
      : roundFinancial((qualifyingMonthlyBasisRub * reserveMonths));
    return {
      id: `${cohort.cohort.id}:wave-${index + 1}`,
      cohortId: cohort.cohort.id,
      openingMonth: wave.openingMonth,
      fundingMonth: Math.max(0, wave.openingMonth - developmentLeadMonthsFor(cohort.cohort.format, cohort.cohort.locationType)),
      pointCount: wave.count,
      months: reserveMonths,
      qualifyingMonthlyBasisRub,
      includedLines,
      excludedLineIds: [...reserveExcludedLineIds],
      prepaidCoverage: rent.coverage,
      uncoveredRentRub: rent.uncoveredRentRub,
      totalReserveRub,
    } satisfies CohortReserveProjection;
  }));
  const allActivationMonths = [...new Set(cohortReserves.map((item) => item.openingMonth))].sort((a, b) => a - b);
  const sharedReserves: SharedReserveProjection[] = [];
  let previousById = new Map<string, number>();
  for (const activationMonth of allActivationMonths) {
    const { lines, logisticsMode } = sharedReserveLines(configuration, scaling, activationMonth, cohortReserves.reduce((sum, item) => sum + item.pointCount, 0));
    const nextById = new Map(lines.map((line) => [line.id, line.monthlyAmountRub ?? 0]));
    for (const line of lines) {
      const current = line.monthlyAmountRub;
      const previous = previousById.get(line.id) ?? 0;
      if (current === null || current <= previous) continue;
      const delta = roundFinancial(current - previous);
      sharedReserves.push({
        id: `${line.id}:m${activationMonth}`,
        name: line.name,
        activationMonth,
        // The shared reserve is funded alongside the cohort that activates
        // the underlying function, not by a universal lead applied to every
        // format. This preserves staged funding parity with point CAPEX.
        fundingMonth: cohortReserves
          .filter((item) => item.openingMonth === activationMonth)
          .reduce<number | null>((earliest, item) => earliest === null ? item.fundingMonth : Math.min(earliest, item.fundingMonth), null)
          ?? activationMonth,
        months: reserveMonths,
        qualifyingMonthlyBasisRub: delta,
        includedLines: [{ ...line, monthlyAmountRub: delta }],
        totalReserveRub: roundFinancial(delta * reserveMonths),
        reason: line.id.startsWith("logistics-") && logisticsMode === "own"
          ? "Owned logistics reserve begins at the approved 3+ additional point trigger."
          : "Incremental shared cost is funded only when its actual staffing/service trigger is reached.",
      });
    }
    previousById = nextById;
  }
  const fundingEvents: ReserveFundingEvent[] = [
    ...cohortReserves.map((item) => ({ month: item.fundingMonth, id: item.id, kind: "cohort_operating_reserve" as const, amountRub: item.totalReserveRub })),
    ...sharedReserves.map((item) => ({ month: item.fundingMonth, id: item.id, kind: "shared_operating_reserve" as const, amountRub: item.totalReserveRub })),
  ].sort((left, right) => left.month - right.month || left.id.localeCompare(right.id));
  const allAmounts = fundingEvents.map((event) => event.amountRub);
  return {
    context: "network_expansion",
    policy: "six_months_qualifying_fixed_and_semi_fixed_opex_by_cohort",
    months: reserveMonths,
    cohortReserves,
    sharedReserves,
    fundingEvents,
    totalReserveRub: allAmounts.some((amount) => amount === null)
      ? null
      : roundFinancial(allAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0)),
    excludedLineIds: [...reserveExcludedLineIds],
  };
}

/**
 * Computes only the incremental shared layer. Point direct OPEX is supplied
 * separately so raw materials cannot be booked both in Point and Production.
 */
export function sharedNetworkOpexForActivePoints(
  configuration: InvestorConfiguration,
  input: {
    totalPointCount: number;
    additionalPointCount: number;
    totalChecksPerDay: number | null;
    baseChecksPerDay: number | null;
    additionalNetRevenueRub?: number | null;
    /** Final expansion size, distinct from temporarily active rollout points. */
    plannedAdditionalPointCount?: number;
  },
): SharedNetworkOpex {
  const constants = canonicalNetworkOpexConstants();
  const fixedMarketingRub = constants.marketingFixedMonthlyRub;
  const productionCapacity = input.totalChecksPerDay === null
    ? null
    : productionCapacityProjection(input.totalChecksPerDay, configuration.networkScaling.productionSchedule);
  if (input.additionalPointCount <= 0) {
    return {
      productionPayroll: input.totalChecksPerDay === null ? null : productionStaffingProjection(input.totalChecksPerDay, configuration.networkScaling.productionSchedule),
      baseProductionPayroll: input.baseChecksPerDay === null ? null : productionStaffingProjection(input.baseChecksPerDay, configuration.networkScaling.productionSchedule),
      expansionProductionPayrollRub: 0,
      managerPayroll: sharedManagerPayrollProjection(input.totalPointCount),
      expansionManagerPayrollRub: 0,
      logisticsRub: 0,
      administrativeReserveRub: 0,
      incrementalUniformRenewalRub: 0,
      incrementalMedicalRub: 0,
      fixedMarketingRub,
      expansionFixedMarketingRub: 0,
      knownSharedExpansionOpexRub: 0,
      sharedExpansionOpexRub: 0,
      unpricedRecurringLines: [],
      conditionalAssumptionLines: [],
      logisticsMode: "unknown",
      logisticsVehicleCapexRub: null,
      capacityReviewRequired: false,
      productionCapacity,
    };
  }
  const productionPayroll = input.totalChecksPerDay === null
    ? null
    : productionStaffingProjection(input.totalChecksPerDay, configuration.networkScaling.productionSchedule);
  const baseProductionPayroll = input.baseChecksPerDay === null
    ? null
    : productionStaffingProjection(input.baseChecksPerDay, configuration.networkScaling.productionSchedule);
  const expansionProductionPayrollRub = productionPayroll === null || baseProductionPayroll === null
    ? null
    : Math.max(0, productionPayroll.totalPayrollRub - baseProductionPayroll.totalPayrollRub);
  const managerPayroll = sharedManagerPayrollProjection(input.totalPointCount);
  const baseManagerPayroll = sharedManagerPayrollProjection(Math.max(1, input.totalPointCount - input.additionalPointCount));
  const expansionManagerPayrollRub = managerPayroll === null
    ? 0
    : Math.max(0, managerPayroll.totalPayrollRub - (baseManagerPayroll?.totalPayrollRub ?? 0));
  const logistics = selectedLogistics(configuration, input.totalPointCount, input.additionalPointCount);
  const administrativeReserveRub = input.additionalNetRevenueRub === null || input.additionalNetRevenueRub === undefined
    ? null
    : input.additionalNetRevenueRub * constants.administrativeReserveRateOfNetRevenue;
  const incrementalProductionRoster = productionPayroll === null || baseProductionPayroll === null
    ? null
    : Math.max(0, productionPayroll.rosterHeadcount - baseProductionPayroll.rosterHeadcount);
  const incrementalUniformRenewalRub = incrementalProductionRoster === null || constants.historicalRealisticRosterHeadcount <= 0
    ? null
    : incrementalProductionRoster * constants.uniformRenewalMonthlyRub / constants.historicalRealisticRosterHeadcount;
  const incrementalMedicalRub = incrementalProductionRoster === null || constants.historicalRealisticRosterHeadcount <= 0
    ? null
    : incrementalProductionRoster * constants.medicalMonthlyRub / constants.historicalRealisticRosterHeadcount;
  const knownSharedExpansionOpexRub = expansionProductionPayrollRub === null
    || administrativeReserveRub === null
    || incrementalUniformRenewalRub === null
    || incrementalMedicalRub === null
    ? null
    : expansionProductionPayrollRub + expansionManagerPayrollRub + administrativeReserveRub + incrementalUniformRenewalRub + incrementalMedicalRub;
  const isFinalOneOrTwoAdditionalPointPlan = (input.plannedAdditionalPointCount ?? input.additionalPointCount) <= 2;
  const unpricedRecurringLines = logistics.logisticsRub === null && isFinalOneOrTwoAdditionalPointPlan
    ? [{
      id: "logistics:external-monthly",
      name: "Внешняя логистика",
      reason: "Стоимость внешней логистики для этого числа активных точек не задана договором.",
    }]
    : [];
  const conditionalAssumptionLines = logistics.logisticsRub === null && !isFinalOneOrTwoAdditionalPointPlan
    ? [{
      id: "logistics:early-rollout-external",
      name: "Внешняя логистика на ранних открытиях",
      reason: "До перехода на owned logistics цена временной внешней развозки не задана; это rollout assumption, а не steady-state blocker сети из трёх и более точек.",
    }]
    : logistics.logisticsMode === "external" && configuration.networkScaling.logistics.externalMonthlyRub === null && logistics.logisticsRub !== null
      ? [{
        id: "logistics:external-planning-baseline",
        name: "Внешняя логистика",
        reason: "150k ₽/мес. — research-backed planning baseline для раннего rollout; нужен carrier contract/route quote.",
      }]
      : [];
  // A missing external quote is never converted into a known commercial rate.
  // The numerical known basis remains available and its coverage disclosure
  // carries the omitted contract value.
  const sharedExpansionOpexRub = knownSharedExpansionOpexRub === null
    ? null
    : knownSharedExpansionOpexRub + (logistics.logisticsRub ?? 0);
  return {
    productionPayroll,
    baseProductionPayroll,
    expansionProductionPayrollRub,
    managerPayroll,
    expansionManagerPayrollRub,
    logisticsRub: logistics.logisticsRub,
    administrativeReserveRub,
    incrementalUniformRenewalRub,
    incrementalMedicalRub,
    // The 150k fixed marketing amount remains in Current Base. Only the
    // revenue-linked component is attributed to points by direct OPEX.
    fixedMarketingRub,
    expansionFixedMarketingRub: 0,
    knownSharedExpansionOpexRub,
    sharedExpansionOpexRub,
    unpricedRecurringLines,
    conditionalAssumptionLines,
    logisticsMode: logistics.logisticsMode,
    logisticsVehicleCapexRub: logistics.logisticsVehicleCapexRub,
    capacityReviewRequired: productionCapacity?.status === "review_required",
    productionCapacity,
  };
}

export function cohortAssetSummary(
  cohort: NetworkPointCohortProjection,
  policy: Pick<ConfiguredFinancialPolicy, "maintenanceAnnualRate">,
  pointCountOverride = cohort.cohort.count,
): NetworkAssetSummary {
  const count = pointCountOverride;
  const assets: FinancialDepreciationAsset[] = [];
  let maintenanceAssetBasisRub = 0;
  for (const item of cohort.pointItems) {
    if (item.amountRub === null || !item.included) continue;
    const amount = item.amountRub * count;
    if (["point-retail-equipment", "point-pos-kds", "point-bar"].includes(item.id)) {
      maintenanceAssetBasisRub += amount;
      for (const detail of item.detail ?? []) {
        if (detail.amountRub === null) continue;
        assets.push(equipmentDepreciationAsset({
          id: `${cohort.cohort.id}:${detail.id}`,
          name: detail.name,
          amountRub: detail.amountRub * count,
          moduleIds: detail.moduleIds ?? [],
        }));
      }
    } else if (item.id.endsWith(":point-wash")) {
      // The package is made of independent CAPEX rows.  Its details become
      // assets once; the package parent is never booked as a second asset.
      for (const detail of item.detail ?? []) {
        if (detail.amountRub === null) continue;
        const detailAmount = detail.amountRub * count;
        maintenanceAssetBasisRub += detailAmount;
        if (detail.assetClass === "furniture") {
          assets.push(furnitureDepreciationAsset(`${cohort.cohort.id}:${detail.id}`, detail.name, detailAmount));
        } else if (detail.assetClass === "small_equipment") {
          assets.push(smallEquipmentDepreciationAsset(`${cohort.cohort.id}:${detail.id}`, detail.name, detailAmount));
        } else {
          assets.push(equipmentDepreciationAsset({
            id: `${cohort.cohort.id}:${detail.id}`,
            name: detail.name,
            amountRub: detailAmount,
            moduleIds: detail.moduleIds ?? ["MOD-WASH"],
          }));
        }
      }
    } else if (item.id.endsWith(":furniture")) {
      maintenanceAssetBasisRub += amount;
      assets.push(furnitureDepreciationAsset(`${cohort.cohort.id}:FURNITURE`, item.name, amount));
    } else if (item.id.endsWith(":point-preparation")) {
      for (const detail of item.detail ?? []) {
        if (detail.amountRub === null) continue;
        assets.push(preparationDepreciationAsset({
          id: `${cohort.cohort.id}:${detail.id}`,
          name: detail.name,
          amountRub: detail.amountRub * count,
        }));
      }
    } else if (item.id.endsWith(":security")) {
      assets.push(smallEquipmentDepreciationAsset(`${cohort.cohort.id}:SECURITY`, item.name, amount));
    } else if (item.id.endsWith(":fitout")) {
      assets.push(fitOutDepreciationAsset(`${cohort.cohort.id}:FITOUT`, item.name, amount));
    }
  }
  return {
    depreciationAssets: assets,
    depreciationRub: monthlyDepreciation(assets),
    maintenanceAssetBasisRub,
    maintenanceCapexRub: monthlyMaintenanceCapex(maintenanceAssetBasisRub, policy.maintenanceAnnualRate),
    vehicleMaintenanceIncluded: false,
    vehicleMaintenanceTreatment: "included_in_logistics_opex",
    vehicleDepreciationTreatment: "requires_useful_life_decision",
  };
}

export function expansionAssetSummary(
  cohorts: readonly NetworkPointCohortProjection[],
  policy: Pick<ConfiguredFinancialPolicy, "maintenanceAnnualRate">,
): NetworkAssetSummary {
  const summaries = cohorts.map((cohort) => cohortAssetSummary(cohort, policy));
  const assets = summaries.flatMap((item) => item.depreciationAssets);
  const maintenanceAssetBasisRub = summaries.reduce((total, item) => total + item.maintenanceAssetBasisRub, 0);
  return {
    depreciationAssets: assets,
    depreciationRub: monthlyDepreciation(assets),
    maintenanceAssetBasisRub,
    maintenanceCapexRub: summaries.reduce((total, item) => total + item.maintenanceCapexRub, 0),
    vehicleMaintenanceIncluded: false,
    vehicleMaintenanceTreatment: "included_in_logistics_opex",
    vehicleDepreciationTreatment: "requires_useful_life_decision",
  };
}

export function calculateFinancialPnl(
  revenueRub: number | null,
  opexRub: number | null,
  depreciationRub: number | null,
  maintenanceCapexRub: number | null,
  policy: Pick<ConfiguredFinancialPolicy, "taxRules">,
): FinancialPnl {
  if (revenueRub === null || opexRub === null || depreciationRub === null || maintenanceCapexRub === null) {
    return {
      revenueRub,
      netRevenueRub: revenueRub,
      opexRub,
      ebitdaRub: null,
      taxRub: null,
      depreciationRub,
      maintenanceCapexRub,
      operatingFreeCashFlowRub: null,
    };
  }
  const ebitdaRub = revenueRub - opexRub;
  const financial = calculateFinancialMonthlyResult(ebitdaRub, revenueRub, opexRub, maintenanceCapexRub, policy.taxRules);
  return {
    revenueRub: roundFinancial(revenueRub),
    netRevenueRub: roundFinancial(revenueRub),
    opexRub: roundFinancial(opexRub),
    ebitdaRub: roundFinancial(financial.ebitdaRub),
    taxRub: roundFinancial(financial.taxRub),
    depreciationRub: roundFinancial(depreciationRub),
    maintenanceCapexRub: roundFinancial(maintenanceCapexRub),
    operatingFreeCashFlowRub: roundFinancial(financial.freeCashFlowRub),
  };
}

function staticChecks(cohorts: readonly NetworkPointCohortProjection[]) {
  if (cohorts.some((cohort) => cohort.operational.sales.checksPerDay === null)) return null;
  return cohorts.reduce((total, cohort) => total + (cohort.operational.sales.checksPerDay ?? 0) * cohort.cohort.count, 0);
}

function coverageForNetwork(
  scaling: NetworkScalingProjection,
  shared: SharedNetworkOpex,
  policy: ConfiguredFinancialPolicy,
  directOpexRub: number | null,
): { coverage: FinancialCoverage; warnings: string[]; exclusions: NetworkFinancialExclusion[] } {
  const exclusions: NetworkFinancialExclusion[] = scaling.unresolvedItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: "unpriced_capex",
    reason: item.reason,
  }));
  const confirmationRequired = historicalOpexTreatmentCatalog.filter((line) => line.networkTreatment === "requires_confirmation");
  const issues: FinancialCoverageIssue[] = [
    ...scaling.unresolvedItems.map((item) => ({
      id: item.id,
      category: "unpriced_capex" as const,
      message: `${item.name}: ${item.reason}`,
      material: true,
    })),
    ...confirmationRequired.map((line) => ({
      id: `opex:${line.lineId}`,
      category: "exclusion" as const,
      message: `${line.name}: ${line.note}`,
      material: false,
      dimension: "assumptions" as const,
      assumptionStatus: "requires_confirmation" as const,
    })),
    {
      id: "tax:vat-confirmation",
      category: "tax_assumption" as const,
      message: "VAT assumption requires confirmation; the current Financial Model baseline remains the calculation input.",
      material: false,
      dimension: "assumptions" as const,
      assumptionStatus: policy.vatStatus === "current_baseline_requires_confirmation" ? "requires_confirmation" as const : "planning" as const,
    },
  ];
  exclusions.push(...confirmationRequired.map((line) => ({
    id: `opex:${line.lineId}`,
    name: line.name,
    category: "exclusion" as const,
    reason: line.note,
  })));
  issues.push(...shared.unpricedRecurringLines.map((line) => ({
    id: line.id,
    category: "unresolved_recurring_opex" as const,
    message: `${line.name}: ${line.reason}`,
    material: true,
    dimension: "pricing" as const,
  })));
  exclusions.push(...shared.unpricedRecurringLines.map((line) => ({
    ...line,
    category: "unresolved_recurring_opex" as const,
  })));
  issues.push(...shared.conditionalAssumptionLines.map((line) => ({
    id: line.id,
    category: "exclusion" as const,
    message: `${line.name}: ${line.reason}`,
    material: false,
    dimension: "assumptions" as const,
    assumptionStatus: "planning" as const,
  })));
  exclusions.push(...shared.conditionalAssumptionLines.map((line) => ({
    ...line,
    category: "exclusion" as const,
  })));
  if (shared.capacityReviewRequired) {
    issues.push({
      id: "production:capacity-review",
      category: "capacity",
      message: "Требуется проверка мощности производства: спрос в portions/day рассчитан, но пропускная способность линии и вторая смена не имеют утверждённых параметров.",
      material: true,
      dimension: "capacity",
      capacityStatus: "review_required",
    });
    exclusions.push({
      id: "production:capacity-expansion",
      name: "Расширение мощности производства",
      category: "capacity",
      reason: "Throughput and CAPEX for a second production shift are not approved and are not invented in this projection.",
    });
  }
  if (shared.logisticsVehicleCapexRub !== null && shared.logisticsVehicleCapexRub > 0) {
    issues.push({
      id: "logistics:vehicle-depreciation-maintenance",
      category: "exclusion",
      message: "Vehicle maintenance is included in owned logistics OPEX; useful life for vehicle depreciation requires a separate policy decision and is not placed into the generic 3% maintenance formula.",
      material: false,
      dimension: "assumptions",
      assumptionStatus: "requires_confirmation",
    });
    exclusions.push({
      id: "logistics:vehicle-depreciation-maintenance",
      name: "Амортизация и maintenance рефрижератора",
      category: "exclusion",
      reason: "Maintenance/repair already stays inside Logistics OPEX. Vehicle is excluded from generic 3% maintenance CAPEX; useful-life policy is not yet approved.",
    });
  }
  if (directOpexRub === null || shared.knownSharedExpansionOpexRub === null) {
    issues.push({
      id: "network:missing-operating-input",
      category: "invalid_input",
      message: "At least one required cohort contract, sales or shared operating input is missing.",
      material: true,
      dimension: "calculation",
    });
  }
  const coverage = financialCoverage(issues);
  return { coverage, warnings: issues.map((item) => item.message), exclusions };
}

function steadyPayback(investmentRub: number | null, freeCashFlowRub: number | null) {
  if (investmentRub === null || freeCashFlowRub === null || investmentRub <= 0 || freeCashFlowRub <= 0) return null;
  return roundFinancial(investmentRub / freeCashFlowRub, 1);
}

/**
 * Full known-basis P&L/FCF for the incremental expansion at plan level. The
 * caller composes this with Base only after recalculating tax on the combined
 * revenue and eligible operating expenses.
 */
export function buildNetworkSteadyState(
  configuration: InvestorConfiguration,
  scaling: NetworkScalingProjection,
  policy: ConfiguredFinancialPolicy,
): NetworkSteadyStateProjection {
  const additionalCohorts = scaling.cohorts.slice(1);
  const additionalPointCount = pointCount(additionalCohorts);
  const totalPointCount = pointCount(scaling.cohorts);
  const revenueRub = sumNullable(additionalCohorts.map((cohort) => cohort.operational.sales.revenueCohortRub));
  const directOpexRub = sumNullable(additionalCohorts.map((cohort) => cohort.directOpex.directOpexCohortRub));
  const totalChecksPerDay = staticChecks(scaling.cohorts);
  const baseChecksPerDay = scaling.cohorts[0]?.operational.sales.checksPerDay ?? null;
  const shared = sharedNetworkOpexForActivePoints(configuration, {
    totalPointCount,
    additionalPointCount,
    totalChecksPerDay,
    baseChecksPerDay,
    additionalNetRevenueRub: revenueRub,
    plannedAdditionalPointCount: additionalPointCount,
  });
  // A partial projection still computes the known basis. Unpriced shared
  // recurring lines stay in coverage/exclusions instead of silently becoming
  // zero-priced inputs.
  const opexRub = sumNullable([directOpexRub, shared.knownSharedExpansionOpexRub, shared.logisticsRub ?? 0]);
  const assets = expansionAssetSummary(additionalCohorts, policy);
  const pnl = calculateFinancialPnl(revenueRub, opexRub, assets.depreciationRub, assets.maintenanceCapexRub, policy);
  const pointInvestmentRub = additionalCohorts.reduce((total, cohort) => total + cohort.confirmedCohortInvestmentRub, 0);
  const sharedInfrastructureRub = scaling.sharedItems.reduce((total, item) => total + (item.amountRub ?? 0), 0);
  const operatingReserve = expansionReserveProjection(configuration, scaling);
  const operatingReserveRub = operatingReserve.totalReserveRub;
  const investmentRub = operatingReserveRub === null ? null : roundFinancial(pointInvestmentRub + sharedInfrastructureRub + operatingReserveRub);
  const status = coverageForNetwork(scaling, shared, policy, directOpexRub);
  return {
    context: "network_expansion",
    status: status.coverage.status,
    coverage: status.coverage,
    warnings: status.warnings,
    exclusions: status.exclusions,
    additionalPointCount,
    pointInvestmentRub,
    sharedInfrastructureRub,
    operatingReserve,
    operatingReserveRub,
    reserveMonths: configuration.launchBudget.operatingReserveMonths,
    investmentRub,
    directOpexRub,
    sharedOpexRub: shared.sharedExpansionOpexRub,
    shared,
    assets,
    pnl,
    paybackMonths: steadyPayback(investmentRub, pnl.operatingFreeCashFlowRub),
  };
}

export function combineBaseAndExpansionPnl(
  base: BaseFinancialLayerInput,
  expansion: NetworkSteadyStateProjection,
  policy: ConfiguredFinancialPolicy,
) {
  const revenueRub = expansion.pnl.revenueRub === null ? null : base.revenueRub + expansion.pnl.revenueRub;
  const opexRub = expansion.pnl.opexRub === null ? null : base.opexRub + expansion.pnl.opexRub;
  const depreciationRub = expansion.pnl.depreciationRub === null ? null : base.depreciationRub + expansion.pnl.depreciationRub;
  const maintenanceCapexRub = expansion.pnl.maintenanceCapexRub === null ? null : base.maintenanceCapexRub + expansion.pnl.maintenanceCapexRub;
  return calculateFinancialPnl(revenueRub, opexRub, depreciationRub, maintenanceCapexRub, policy);
}
