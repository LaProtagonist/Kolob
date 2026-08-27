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
} from "./physical-allocation";
import {
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
  // Reserve is a financing buffer over the disclosed recurring P&L basis.
  // Use the rounded financial line rather than the pre-round aggregation so
  // the visible monthly OPEX × horizon invariant remains exact to kopecks.
  const operatingReserveRub = pnl.opexRub === null
    ? null
    : roundFinancial(pnl.opexRub * configuration.launchBudget.operatingReserveMonths);
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
