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
import {
  historicalOpexTreatmentCatalog,
  type HistoricalOpexTreatment,
} from "./physical-allocation";
import {
  canonicalPointOpexConstants,
  logisticsPlanning,
  productionStaffingProjection,
  sharedManagerPayrollProjection,
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
};

export type SharedNetworkOpex = {
  productionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  baseProductionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  expansionProductionPayrollRub: number | null;
  managerPayroll: PayrollProjection | null;
  expansionManagerPayrollRub: number | null;
  logisticsRub: number | null;
  fixedMarketingRub: number;
  expansionFixedMarketingRub: number;
  /** Calculable portion only; unpriced shared lines are disclosed separately. */
  knownSharedExpansionOpexRub: number | null;
  sharedExpansionOpexRub: number | null;
  unpricedRecurringLines: Array<{ id: string; name: string; reason: string }>;
  logisticsMode: "external" | "own" | "unknown";
  logisticsVehicleCapexRub: number | null;
  capacityReviewRequired: boolean;
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
): Pick<SharedNetworkOpex, "logisticsMode" | "logisticsRub" | "logisticsVehicleCapexRub"> {
  const planning = logisticsPlanning(totalPointCount);
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
  },
): SharedNetworkOpex {
  const fixedMarketingRub = canonicalPointOpexConstants().marketingFixedMonthlyRub;
  if (input.additionalPointCount <= 0) {
    return {
      productionPayroll: input.totalChecksPerDay === null ? null : productionStaffingProjection(input.totalChecksPerDay, configuration.networkScaling.productionSchedule),
      baseProductionPayroll: input.baseChecksPerDay === null ? null : productionStaffingProjection(input.baseChecksPerDay, configuration.networkScaling.productionSchedule),
      expansionProductionPayrollRub: 0,
      managerPayroll: sharedManagerPayrollProjection(input.totalPointCount),
      expansionManagerPayrollRub: 0,
      logisticsRub: 0,
      fixedMarketingRub,
      expansionFixedMarketingRub: 0,
      knownSharedExpansionOpexRub: 0,
      sharedExpansionOpexRub: 0,
      unpricedRecurringLines: [],
      logisticsMode: "unknown",
      logisticsVehicleCapexRub: null,
      capacityReviewRequired: false,
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
  const logistics = selectedLogistics(configuration, input.totalPointCount);
  const knownSharedExpansionOpexRub = expansionProductionPayrollRub === null
    ? null
    : expansionProductionPayrollRub + expansionManagerPayrollRub;
  const unpricedRecurringLines = logistics.logisticsRub === null
    ? [{
      id: "logistics:external-monthly",
      name: "Внешняя логистика",
      reason: "Стоимость внешней логистики для этого числа активных точек не задана договором.",
    }]
    : [];
  const sharedExpansionOpexRub = knownSharedExpansionOpexRub === null || logistics.logisticsRub === null
    ? null
    : knownSharedExpansionOpexRub + logistics.logisticsRub;
  return {
    productionPayroll,
    baseProductionPayroll,
    expansionProductionPayrollRub,
    managerPayroll,
    expansionManagerPayrollRub,
    logisticsRub: logistics.logisticsRub,
    // The 150k fixed marketing amount remains in Current Base. Only the
    // revenue-linked component is attributed to points by direct OPEX.
    fixedMarketingRub,
    expansionFixedMarketingRub: 0,
    knownSharedExpansionOpexRub,
    sharedExpansionOpexRub,
    unpricedRecurringLines,
    logisticsMode: logistics.logisticsMode,
    logisticsVehicleCapexRub: logistics.logisticsVehicleCapexRub,
    capacityReviewRequired: productionPayroll?.capacityReviewRequired ?? false,
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
  const recurringUnresolved = historicalOpexTreatmentCatalog.filter((line) => line.status === "unresolved");
  exclusions.push(...recurringUnresolved.map((line) => ({
    id: `opex:${line.lineId}`,
    name: line.name,
    category: "unresolved_recurring_opex" as const,
    reason: line.note,
  })));
  const issues: FinancialCoverageIssue[] = [
    ...scaling.unresolvedItems.map((item) => ({
      id: item.id,
      category: "unpriced_capex" as const,
      message: `${item.name}: ${item.reason}`,
      material: true,
    })),
    ...recurringUnresolved.map((line: HistoricalOpexTreatment) => ({
      id: `opex:${line.lineId}`,
      category: "unresolved_recurring_opex" as const,
      message: `${line.name}: ${line.note}`,
      material: true,
    })),
    {
      id: "tax:vat-confirmation",
      category: "tax_assumption" as const,
      message: "VAT assumption requires confirmation; the current Financial Model baseline remains the calculation input.",
      material: policy.vatStatus === "current_baseline_requires_confirmation",
    },
  ];
  issues.push(...shared.unpricedRecurringLines.map((line) => ({
    id: line.id,
    category: "unresolved_recurring_opex" as const,
    message: `${line.name}: ${line.reason}`,
    material: true,
  })));
  exclusions.push(...shared.unpricedRecurringLines.map((line) => ({
    ...line,
    category: "unresolved_recurring_opex" as const,
  })));
  if (shared.capacityReviewRequired) {
    issues.push({
      id: "production:capacity-review",
      category: "capacity",
      message: "Current production policy has reached two prep cooks; a second production shift / capacity expansion requires a separate decision.",
      material: true,
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
      message: "The logistics vehicle is included in investment, but current equipment/furniture useful-life and maintenance rules do not price vehicle depreciation or maintenance separately.",
      material: true,
    });
    exclusions.push({
      id: "logistics:vehicle-depreciation-maintenance",
      name: "Амортизация и maintenance рефрижератора",
      category: "exclusion",
      reason: "Рефрижератор не добавляется автоматически в 3% equipment/furniture maintenance formula; отдельная asset policy ещё не утверждена.",
    });
  }
  if (directOpexRub === null || shared.knownSharedExpansionOpexRub === null) {
    issues.push({
      id: "network:missing-operating-input",
      category: "invalid_input",
      message: "At least one required cohort contract, sales or shared operating input is missing.",
      material: true,
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
  });
  // A partial projection still computes the known basis. Unpriced shared
  // recurring lines stay in coverage/exclusions instead of silently becoming
  // zero-priced inputs.
  const opexRub = sumNullable([directOpexRub, shared.knownSharedExpansionOpexRub, shared.logisticsRub ?? 0]);
  const assets = expansionAssetSummary(additionalCohorts, policy);
  const pnl = calculateFinancialPnl(revenueRub, opexRub, assets.depreciationRub, assets.maintenanceCapexRub, policy);
  const pointInvestmentRub = additionalCohorts.reduce((total, cohort) => total + cohort.confirmedCohortInvestmentRub, 0);
  const sharedInfrastructureRub = scaling.sharedItems.reduce((total, item) => total + (item.amountRub ?? 0), 0);
  const operatingReserveRub = opexRub === null ? null : roundFinancial(opexRub * configuration.launchBudget.operatingReserveMonths);
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
