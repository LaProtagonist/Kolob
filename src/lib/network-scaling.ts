import { buildCapexRows, capexData, emptyCapexParameters, type ComputedCapexRow } from "./capex-runtime";
import { configuredFinancialPolicy, type ConfiguredEconomicsScenario } from "./configured-economics";
import {
  buildNetworkSteadyState,
  combineBaseAndExpansionPnl,
  sharedNetworkOpexForActivePoints,
  type BaseFinancialLayerInput,
  type NetworkFinancialExclusion,
} from "./network-financial-core";
import type { FinancialCoverage } from "./financial-core";
import type { InvestorConfiguration, TradingPointCohort, TradingPointFormat } from "./investor-configuration";
import { calculateLaunchBudget, calculateSeatCount, launchModel, type LaunchBudgetState } from "./launch-budget";
import { pointOperationalProjection, type PointOperationalProjection } from "./point-operations";
import { pointPreparationProjection } from "./point-preparation";
import { findPhysicalAllocation, type PhysicalScope } from "./physical-allocation";
import {
  canonicalPointOpexConstants,
  networkPlanningLaunchConstants,
  networkBarEquipmentRules,
  type PayrollProjection,
} from "./network-planning";

export type NetworkOwnership = "production" | "point" | "shared" | "unresolved";
export type NetworkMultiplier = "once" | "per_point" | "not_aggregated";

export type NetworkScalingItem = {
  id: string;
  canonicalItem: string;
  name: string;
  ownership: NetworkOwnership;
  multiplier: NetworkMultiplier;
  amountRub: number | null;
  included: boolean;
  source: string;
  reason: string;
  partial?: boolean;
  detail?: Array<{ id: string; name: string; amountRub: number | null; quantity: number | null; moduleIds?: string[] }>;
};

export type NetworkPointCohortProjection = {
  cohort: TradingPointCohort;
  formatName: string;
  realEstateName: string;
  pointFormatSourceId: string;
  pointItems: NetworkScalingItem[];
  confirmedPointInvestmentRub: number;
  confirmedCohortInvestmentRub: number;
  isPartial: boolean;
  operational: PointOperationalProjection;
  directOpex: PointDirectOpexProjection;
};

export type DirectOpexLine = { id: string; name: string; amountRub: number | null; included: boolean; reason?: string };

export type PointDirectOpexProjection = {
  lines: DirectOpexLine[];
  /** Sum of safely calculated lines; kept separate from a complete direct OPEX total. */
  knownDirectOpexPerPointRub: number | null;
  knownDirectOpexCohortRub: number | null;
  directOpexPerPointRub: number | null;
  directOpexCohortRub: number | null;
  operatingContributionPerPointRub: number | null;
  operatingContributionCohortRub: number | null;
  marginBeforeCentralCosts: number | null;
  isPartial: boolean;
  missing: string[];
};

export type PointDirectOpexOptions = {
  /** Overrides only a rent charge for a month with rent-free terms. */
  rentChargeRub?: number | null;
};

export type NetworkOperatingSummary = {
  status: "complete" | "partial" | "unset";
  pointDirectOpexRub: number | null;
  pointContributionRub: number | null;
  productionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  baseProductionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  expansionProductionPayrollRub: number | null;
  managerPayroll: PayrollProjection | null;
  expansionManagerPayrollRub: number | null;
  fixedMarketingRub: number | null;
  expansionFixedMarketingRub: number | null;
  logisticsRub: number | null;
  sharedExpansionOpexRub: number | null;
  operatingContributionRub: number | null;
  totalRosterHeadcount: number | null;
  logisticsMode: "external" | "own" | "unknown";
  logisticsVehicleCapexRub: number | null;
  incompletePointCohortCount: number;
  note: string;
};

export type NetworkPlanningLaunchSummary = {
  uniformRub: number | null;
  initialPointInventoryRub: number | null;
  fitoutRub: number | null;
  securityRub: number | null;
  launchMarketingRub: number;
  logisticsVehicleCapexRub: number | null;
  totalKnownRub: number | null;
  isPartial: boolean;
  note: string;
};

/**
 * The only network operating aggregate that is currently sound: sales.
 * It is intentionally separate from network OPEX and profitability, which
 * still require the physical OPEX allocation work.
 */
export type NetworkSalesSummary = {
  status: "complete" | "partial" | "unset";
  checksPerDay: number | null;
  weightedAverageCheckRub: number | null;
  revenuePerMonthRub: number | null;
};

export type NetworkScalingProjection = {
  productionItems: NetworkScalingItem[];
  cohorts: NetworkPointCohortProjection[];
  sharedItems: NetworkScalingItem[];
  unresolvedItems: NetworkScalingItem[];
  productionInvestmentRub: number;
  confirmedPointInvestmentRub: number;
  confirmedInvestmentSubtotalRub: number;
  isPartial: boolean;
  capacityNote: string;
  contingencyNote: string;
  reserveNote: string;
  sales: NetworkSalesSummary;
  operating: NetworkOperatingSummary;
  planningLaunch: NetworkPlanningLaunchSummary;
};

export type BaseObjectFinancialProjection = BaseFinancialLayerInput & {
  /** Backward-compatible investor-facing alias for EBITDA. */
  operatingResultRub: number;
};

/**
 * Adapts the already calculated integrated Financial Model result for the
 * Scaling view. It deliberately does not rebuild the Base Object: the first
 * point and production remain the single canonical configured scenario.
 */
export function baseObjectFinancialProjection(
  scenario: Pick<ConfiguredEconomicsScenario,
    "context" | "startInvestmentRub" | "salesPerMonthRub" | "ebitdaRub" | "freeCashFlowRub" | "paybackMonth" | "operatingReserveRub" | "pnl"
  >,
): BaseObjectFinancialProjection {
  const maintenanceCapexRub = scenario.ebitdaRub - scenario.pnl.taxRub - scenario.freeCashFlowRub;
  return {
    context: scenario.context,
    investmentRub: scenario.startInvestmentRub,
    revenueRub: scenario.salesPerMonthRub,
    netRevenueRub: scenario.pnl.salesRub,
    opexRub: scenario.salesPerMonthRub - scenario.ebitdaRub,
    ebitdaRub: scenario.ebitdaRub,
    operatingResultRub: scenario.ebitdaRub,
    taxRub: scenario.pnl.taxRub,
    depreciationRub: scenario.pnl.depreciationRub,
    maintenanceCapexRub,
    operatingFreeCashFlowRub: scenario.freeCashFlowRub,
    cashFlowRub: scenario.freeCashFlowRub,
    paybackMonth: scenario.paybackMonth,
    operatingReserveRub: scenario.operatingReserveRub,
  };
}

export type NetworkEconomicsProjection = {
  status: "complete" | "partial" | "invalid";
  coverage: FinancialCoverage;
  warnings: string[];
  exclusions: NetworkFinancialExclusion[];
  expansion: {
    additionalPointCount: number;
    pointInvestmentRub: number;
    sharedInfrastructureRub: number;
    operatingReserveRub: number | null;
    reserveMonths: number;
    investmentRub: number | null;
    revenueRub: number | null;
    directOpexRub: number | null;
    sharedOpexRub: number | null;
    opexRub: number | null;
    operatingResultRub: number | null;
    taxRub: number | null;
    depreciationRub: number | null;
    maintenanceCapexRub: number | null;
    operatingFreeCashFlowRub: number | null;
    cashFlowRub: number | null;
    paybackMonths: number | null;
    incompletePointCohortCount: number;
  };
  network: {
    pointCount: number;
    investmentRub: number | null;
    revenueRub: number | null;
    opexRub: number | null;
    operatingResultRub: number | null;
    taxRub: number | null;
    depreciationRub: number | null;
    maintenanceCapexRub: number | null;
    operatingFreeCashFlowRub: number | null;
    cashFlowRub: number | null;
    paybackMonths: number | null;
  };
};

const pointFormatSourceIds: Record<TradingPointFormat, string> = {
  with_seating: "FMT-RESTAURANT-SEATING",
  takeaway: "FMT-FOOD-COURT",
};

function sumKnown(items: NetworkScalingItem[]) {
  return items.filter((item) => item.included).reduce((total, item) => total + (item.amountRub ?? 0), 0);
}

function formatName(format: TradingPointFormat) {
  return format === "with_seating" ? "С посадочным залом" : "Только на вынос";
}

function realEstateName(mode: TradingPointCohort["realEstateMode"]) {
  return mode === "rent" ? "Аренда" : "Покупка";
}

function activeFormat(format: TradingPointFormat) {
  const id = pointFormatSourceIds[format];
  const value = capexData.formats.find((item) => item.id === id);
  if (!value) throw new Error(`Canonical point format ${id} is unavailable.`);
  return value;
}

function cohortLaunchState(configuration: InvestorConfiguration, cohort: TradingPointCohort): LaunchBudgetState {
  return {
    ...configuration.launchBudget,
    premisesScenario: cohort.realEstateMode,
    totalAreaM2: cohort.totalAreaM2,
    kitchenAreaM2: cohort.kitchenAreaM2,
    guestAreaM2: cohort.format === "with_seating" ? cohort.guestAreaM2 : 0,
    monthlyRentRub: cohort.monthlyRentRub,
    purchasePriceRub: cohort.purchasePriceRub,
    prepaymentMonths: cohort.prepaymentMonths ?? 0,
    securityDepositMonths: cohort.securityDepositMonths ?? 0,
    barEnabled: cohort.barEnabled,
    growEnabled: false,
  };
}

function equipmentParameters(configuration: InvestorConfiguration, cohort: TradingPointCohort) {
  const launch = cohortLaunchState(configuration, cohort);
  const seating = launchModel.seating.profiles.find((item) => item.id === launch.seatingProfileId)!;
  const seatCount = cohort.format === "with_seating"
    ? calculateSeatCount(cohort.guestAreaM2, seating.square_metres_per_seat)
    : 0;
  return {
    seatCount,
    parameters: emptyCapexParameters({
      outletCount: capexData.businessCapacity.prep_outlet_count,
      checksPerOutlet: capexData.businessCapacity.checks_per_outlet_per_day,
      fillingCount: capexData.pilotConfiguration?.filling_count ?? null,
      cashierPostCount: capexData.pilotConfiguration?.cashier_post_count ?? null,
      hotKitchenPostCount: capexData.pilotConfiguration?.hot_kitchen_post_count ?? null,
      seatCount,
      guestAreaM2: cohort.format === "with_seating" ? cohort.guestAreaM2 : 0,
      serviceStationCount: capexData.pilotConfiguration?.service_station_count ?? null,
      centralSupply: capexData.pilotConfiguration?.central_supply_enabled ?? false,
    }),
  };
}

function pointEquipmentQuantityOverrides(cohort: TradingPointCohort) {
  if (!cohort.barEnabled) return {};
  return Object.fromEntries(networkBarEquipmentRules().map((rule) => [rule.itemId, rule.quantityPerBarEnabledPoint]));
}

function activePointModuleIds(cohort: TradingPointCohort) {
  const format = activeFormat(cohort.format);
  // The format register still carries the integrated pilot wash module. The
  // physical allocation map is authoritative for Scaling: a reference-only
  // mixed module cannot become a repeatable point BOM by implication.
  const modules = new Set<string>(format.requiredModules.filter((moduleId) => {
    const allocation = findPhysicalAllocation(moduleId);
    return !allocation || !("referenceOnly" in allocation && allocation.referenceOnly);
  }));
  if (cohort.barEnabled && format.optionalModules.includes("MOD-BAR")) modules.add("MOD-BAR");
  return modules;
}

function activeProductionModuleIds(configuration: InvestorConfiguration) {
  const modules = new Set<string>(["MOD-PREP", "MOD-POS"]);
  if (configuration.networkScaling.productionGrowEnabled) modules.add("MOD-GROW");
  return modules;
}

function excludedFromLaunchEquipment(row: ComputedCapexRow) {
  const exclusions = launchModel.point_configuration.equipment_exclusions;
  return exclusions.some((entry) => (entry.item_id && row.item.id === entry.item_id)
    || (entry.item_id_prefix && row.item.id.startsWith(entry.item_id_prefix)));
}

function networkOwnershipForPhysicalScope(scope: PhysicalScope | null): NetworkOwnership {
  if (scope === "production") return "production";
  if (scope === "seating_point" || scope === "takeaway_point" || scope === "both_point_formats") return "point";
  if (scope === "shared_network") return "shared";
  return "unresolved";
}

function physicalScopeForRow(row: ComputedCapexRow): PhysicalScope | null {
  // A direct item record takes precedence over a container module. This is
  // what keeps the accounting terminal in Production while POS/KDS stay at a
  // point, even though all three are emitted by the current POS module.
  const direct = findPhysicalAllocation(row.item.id)?.physicalScope;
  if (direct) return direct;

  const scopes = [...new Set(
    row.moduleIds
      .map((moduleId) => findPhysicalAllocation(moduleId)?.physicalScope)
      .filter((scope): scope is PhysicalScope => Boolean(scope)),
  )];
  if (scopes.length === 1) return scopes[0];
  // Multiple physical meanings in one current register row remain mixed.
  return scopes.length > 1 ? "mixed" : null;
}

function rowOwnership(row: ComputedCapexRow): NetworkOwnership {
  return networkOwnershipForPhysicalScope(physicalScopeForRow(row));
}

function investorEquipmentName(itemId: string, name: string) {
  const investorFacingNames: Record<string, string> = {
    "CAPEX-04-003": "Экраны заказов",
    "CAPEX-02-010": "Система розлива лимонадов (post-mix)",
    "CAPEX-02-013": "Барный льдогенератор",
  };
  return investorFacingNames[itemId] ?? name;
}

function groupEquipment(id: string, name: string, ownership: NetworkOwnership, rows: ComputedCapexRow[], source: string, reason: string): NetworkScalingItem | null {
  const includedRows = rows.filter((row) => row.independentProcurement && !excludedFromLaunchEquipment(row));
  if (!includedRows.length) return null;
  const partial = includedRows.some((row) => row.lineTotal === null);
  return {
    id,
    canonicalItem: "equipment register",
    name,
    ownership,
    multiplier: ownership === "production" ? "once" : ownership === "point" ? "per_point" : "not_aggregated",
    amountRub: includedRows.reduce((total, row) => total + (row.lineTotal ?? 0), 0),
    included: true,
    source,
    reason,
    partial,
    detail: includedRows.map((row) => ({
      id: row.item.id,
      name: investorEquipmentName(row.item.id, row.item.name),
      amountRub: row.lineTotal,
      quantity: row.quantity,
      moduleIds: [...row.moduleIds],
    })),
  };
}

function pointPreparationItem(cohort: TradingPointCohort): NetworkScalingItem {
  const preparation = pointPreparationProjection({
    areaM2: cohort.totalAreaM2,
    format: cohort.format,
    locationType: cohort.locationType,
    sharedSeating: cohort.sharedSeating,
    mode: cohort.preparationMode,
    enabledCategoryIds: cohort.preparationEnabledCategoryIds,
    manualRub: cohort.preparationManualRub,
  });
  return {
    id: `${cohort.id}:point-preparation`,
    canonicalItem: "Integrated Pilot preparation categories",
    name: "Подготовка помещения",
    ownership: "point",
    multiplier: "per_point",
    amountRub: preparation.effectiveRub,
    included: preparation.effectiveRub !== null,
    source: "Network Planning · Integrated Pilot reference",
    reason: preparation.isManual
      ? "Используется введённая смета. Расчёт по категориям сохранён как ориентир."
      : preparation.note,
    detail: preparation.rows
      .filter((row) => row.applicable && row.enabled)
      .map((row) => ({ id: row.id, name: row.name, amountRub: row.amountRub, quantity: null })),
  };
}

function pointSecurityItem(cohort: TradingPointCohort): NetworkScalingItem | null {
  if (cohort.locationType !== "street") return null;
  const amountRub = cohort.videoAllowanceRub === null || cohort.alarmAllowanceRub === null
    ? null
    : cohort.videoAllowanceRub + cohort.alarmAllowanceRub;
  return {
    id: `${cohort.id}:security`,
    canonicalItem: "video + alarm planning allowance",
    name: "Видеонаблюдение и охранная сигнализация",
    ownership: "point",
    multiplier: "per_point",
    amountRub,
    included: amountRub !== null,
    source: "Network Planning · street location defaults",
    reason: "Для отдельного помещения учитываются собственные средства безопасности.",
  };
}

function pointUniformItem(cohort: TradingPointCohort, operational: PointOperationalProjection): NetworkScalingItem {
  const amountRub = operational.staffing.rosterHeadcount * networkPlanningLaunchConstants().uniformPerRosterEmployeeRub;
  return {
    id: `${cohort.id}:uniform`,
    canonicalItem: "uniform planning allowance",
    name: "Форма для персонала при запуске",
    ownership: "point",
    multiplier: "per_point",
    amountRub,
    included: true,
    source: "Network Planning · uniform allowance per roster employee",
    reason: "Зависит от штата этой точки по принятому графику работы.",
  };
}

function pointInitialInventoryItem(cohort: TradingPointCohort, directOpex: PointDirectOpexProjection, workingDaysPerMonth: number): NetworkScalingItem {
  const food = directOpex.lines.find((line) => line.id === "food")?.amountRub;
  const waste = directOpex.lines.find((line) => line.id === "waste")?.amountRub;
  const packaging = directOpex.lines.find((line) => line.id === "consumer-packaging")?.amountRub;
  const amountRub = food === null || food === undefined || waste === null || waste === undefined || packaging === null || packaging === undefined
    ? null
    : (food + waste + packaging) / workingDaysPerMonth * cohort.initialInventoryDays;
  return {
    id: `${cohort.id}:initial-inventory`,
    canonicalItem: "initial inventory planning allowance",
    name: "Стартовый запас",
    ownership: "point",
    multiplier: "per_point",
    amountRub,
    included: amountRub !== null,
    source: "Existing revenue and point OPEX calculation layer",
    reason: `Запас для первых ${cohort.initialInventoryDays} рабочих дней точки.`,
  };
}

function pointFitoutItem(cohort: TradingPointCohort): NetworkScalingItem | null {
  if ((cohort.locationType !== "foodhall" && cohort.locationType !== "creative_cluster") || cohort.fitoutAllowanceRub === null) return null;
  return {
    id: `${cohort.id}:fitout`,
    canonicalItem: "location fitout allowance",
    name: "Дополнительное брендирование",
    ownership: "point",
    multiplier: "per_point",
    amountRub: cohort.fitoutAllowanceRub,
    included: true,
    source: "Manual venue branding allowance",
    reason: "Отдельная смета, не входящая в подготовку помещения и технологическое оборудование.",
  };
}

function pointContingencyItem(configuration: InvestorConfiguration, items: NetworkScalingItem[]): NetworkScalingItem {
  const applicable = items.filter((item) => ["point-preparation", "point-retail-equipment", "point-pos-kds", "point-bar", "furniture"].some((id) => item.id.endsWith(id)));
  const baseRub = applicable.some((item) => item.amountRub === null) ? null : applicable.reduce((total, item) => total + (item.amountRub ?? 0), 0);
  const amountRub = baseRub === null ? null : Math.round(baseRub * configuration.launchBudget.contingencyPercent) / 100;
  return {
    id: "point-contingency",
    canonicalItem: "contingency percentage of applicable base",
    name: "Резерв на запуск",
    ownership: "point",
    multiplier: "per_point",
    amountRub,
    included: amountRub !== null,
    source: "Launch Budget contingency policy",
    reason: "Рассчитывается только от оборудования, мебели и подготовки помещения.",
  };
}

function pointPremisesItem(configuration: InvestorConfiguration, cohort: TradingPointCohort): NetworkScalingItem | null {
  if (cohort.locationType === "foodhall") {
    return null;
  }
  const rentTermsUnknown = cohort.realEstateMode === "rent"
    && (cohort.monthlyRentRub === null || cohort.prepaymentMonths === null || cohort.securityDepositMonths === null);
  const launch = calculateLaunchBudget(cohortLaunchState(configuration, cohort));
  const rent = cohort.realEstateMode === "rent";
  return {
    id: `${cohort.id}:premises`,
    canonicalItem: rent ? "prepaid_rent + security_deposit" : "property",
    name: rent ? "Вход в аренду помещения" : "Покупка помещения",
    ownership: "point",
    multiplier: "per_point",
    amountRub: rentTermsUnknown ? null : launch.premisesEntryRub,
    included: !rentTermsUnknown && launch.premisesEntryRub !== null,
    source: "calculateLaunchBudget.premisesEntryRub",
    reason: rent
      ? rentTermsUnknown
        ? "Для расчёта нужны аренда, предоплата и обеспечительный платёж этой группы."
        : "Предоплата и обеспечительный платёж рассчитаны из параметров этой группы точек."
      : "Стоимость помещения задана для этой группы точек.",
  };
}

function furnitureItem(configuration: InvestorConfiguration, cohort: TradingPointCohort, seatCount: number | null): NetworkScalingItem {
  const profile = launchModel.furniture.profiles.find((item) => item.id === configuration.launchBudget.furnitureProfileId)!;
  const hasSeating = cohort.format === "with_seating" && !(cohort.locationType === "foodhall" && cohort.sharedSeating === true);
  const included = hasSeating;
  return {
    id: `${cohort.id}:furniture`,
    canonicalItem: "furniture.formula",
    name: "Мебель посадочного зала",
    ownership: "point",
    multiplier: "per_point",
    amountRub: hasSeating && seatCount !== null ? seatCount * profile.rub_per_seat : hasSeating ? null : 0,
    included,
    source: "investor-start-model.furniture.formula",
    reason: hasSeating
      ? seatCount === null
        ? "Для расчёта мебели нужна площадь посадочного зала."
        : "Существующая формула мебели зависит от числа мест этой точки."
      : cohort.locationType === "foodhall" && cohort.sharedSeating === true
        ? "Для Foodhall с общей посадкой площадки собственная мебель гостевого зала не применяется."
        : "Для точки только на вынос посадочный зал и его мебель не применяются.",
  };
}

export function pointDirectOpexProjection(
  cohort: TradingPointCohort,
  operational: PointOperationalProjection,
  options: PointDirectOpexOptions = {},
): PointDirectOpexProjection {
  const revenue = operational.sales.revenuePerPointRub;
  const checks = operational.sales.checksPerDay;
  const constants = canonicalPointOpexConstants();
  const lines: DirectOpexLine[] = [];
  const missing: string[] = [];
  const add = (id: string, name: string, amountRub: number | null, reason?: string) => {
    lines.push({ id, name, amountRub, included: amountRub !== null, reason });
    if (amountRub === null) missing.push(name);
  };
  const rawMaterials = revenue === null ? null : revenue * constants.rawMaterialsRate;
  const waste = rawMaterials === null ? null : rawMaterials * constants.wasteRate;
  const packaging = checks === null ? null : constants.packagingBaselineMonthlyRub * checks / constants.packagingBaselineChecksPerDay;
  const acquiring = revenue === null ? null : revenue * constants.acquiringRateOfGrossRevenue;
  const variableMarketing = revenue === null ? null : revenue * constants.marketingVariableRateOfNetRevenue;
  add("food", "Сырьё", rawMaterials, "Каноническая ставка сырья; для contribution атрибутируется продажам точки, не дублируется в Production.");
  add("waste", "Списания", waste, "Каноническая доля от сырья.");
  add("consumer-packaging", "Потребительская упаковка", packaging, "Расход упаковки зависит от числа чеков.");
  add("acquiring", "Эквайринг", acquiring, "Каноническая ставка от выручки.");
  add("point-payroll", "Расходы на персонал точки", operational.staffing.totalPayrollRub, "Зарплаты, взносы и резерв на персонал.");

  let occupancy: number | null;
  if (cohort.locationType === "foodhall") {
    if (revenue === null || cohort.revenueSharePercent === null || cohort.minimumGuaranteeMonthlyRub === null) occupancy = null;
    else occupancy = Math.max(revenue * cohort.revenueSharePercent / 100, cohort.minimumGuaranteeMonthlyRub);
    add("foodhall-occupancy", "Платёж площадке", occupancy, "Доля выручки и минимальная гарантия задаются договором фудхолла.");
  } else if (cohort.realEstateMode === "rent") {
    occupancy = Object.prototype.hasOwnProperty.call(options, "rentChargeRub") ? options.rentChargeRub ?? null : cohort.monthlyRentRub;
    add("rent", "Аренда", occupancy, "Аренда конкретной точки.");
  } else {
    occupancy = 0;
    add("property-occupancy", "Занятость помещения", 0, "Покупка помещения не создаёт ежемесячную аренду.");
  }
  const utilities = cohort.utilitiesIncluded === true ? 0 : cohort.utilitiesMonthlyRub;
  add("utilities", "Коммунальные", utilities, cohort.utilitiesIncluded === true ? "Включены площадкой по договору." : "Нужно указать значение договора или planning allowance.");
  if (cohort.locationType === "foodhall") add("service", "Эксплуатация и коммунальные", cohort.serviceChargeMonthlyRub, "Условия площадки.");
  else if (cohort.locationType === "creative_cluster" && cohort.serviceChargeMonthlyRub !== null) add("service", "Услуги площадки", cohort.serviceChargeMonthlyRub, "Условия площадки.");
  if (cohort.storageRentMonthlyRub !== null) add("storage", "Хранение", cohort.storageRentMonthlyRub, "Условия площадки.");
  add("variable-marketing", "Маркетинг · переменная часть", variableMarketing, "Каноническая доля от выручки; фиксированная часть остаётся общей для сети.");

  const directOpexPerPointRub = missing.length ? null : lines.reduce((total, line) => total + (line.amountRub ?? 0), 0);
  const knownDirectOpexPerPointRub = lines.length ? lines.reduce((total, line) => total + (line.amountRub ?? 0), 0) : null;
  const operatingContributionPerPointRub = directOpexPerPointRub === null || revenue === null ? null : revenue - directOpexPerPointRub;
  return {
    lines,
    knownDirectOpexPerPointRub,
    knownDirectOpexCohortRub: knownDirectOpexPerPointRub === null ? null : knownDirectOpexPerPointRub * cohort.count,
    directOpexPerPointRub,
    directOpexCohortRub: directOpexPerPointRub === null ? null : directOpexPerPointRub * cohort.count,
    operatingContributionPerPointRub,
    operatingContributionCohortRub: operatingContributionPerPointRub === null ? null : operatingContributionPerPointRub * cohort.count,
    marginBeforeCentralCosts: operatingContributionPerPointRub === null || revenue === null || revenue === 0 ? null : operatingContributionPerPointRub / revenue,
    isPartial: missing.length > 0,
    missing,
  };
}

function networkSalesSummary(cohorts: NetworkPointCohortProjection[]): NetworkSalesSummary {
  const active = cohorts.filter((cohort) => cohort.cohort.count > 0);
  if (!active.length) {
    return { status: "unset", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };
  }

  const complete = active.filter((cohort) => !(
    cohort.operational.sales.checksPerDay === null
    || cohort.operational.sales.averageCheckRub === null
    || cohort.operational.sales.revenueCohortRub === null
  ));
  if (!complete.length) return { status: "partial", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };

  const checksPerDay = complete.reduce((total, cohort) => total + (cohort.operational.sales.checksPerDay ?? 0) * cohort.cohort.count, 0);
  const revenuePerMonthRub = complete.reduce((total, cohort) => total + (cohort.operational.sales.revenueCohortRub ?? 0), 0);
  const checkMonths = complete.reduce((total, cohort) => total
    + (cohort.operational.sales.checksPerDay ?? 0)
      * cohort.cohort.count
      * cohort.operational.sales.workingDaysPerMonth, 0);

  if (checksPerDay <= 0 || checkMonths <= 0) {
    return { status: "unset", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };
  }

  return {
    status: complete.length === active.length ? "complete" : "partial",
    checksPerDay,
    weightedAverageCheckRub: revenuePerMonthRub / checkMonths,
    revenuePerMonthRub,
  };
}

function unresolvedPointWashItems(cohorts: NetworkPointCohortProjection[]): NetworkScalingItem[] {
  const formats = new Set(cohorts.filter((cohort) => cohort.cohort.count > 0).map((cohort) => cohort.cohort.format));
  return ([
    ["with_seating", "POINT-WASH-SEATING", "Мойка и уборочный комплект для точки с залом"],
    ["takeaway", "POINT-WASH-TAKEAWAY", "Мойка и уборочный комплект для точки на вынос"],
  ] as const).flatMap(([format, allocationId, name]) => {
    if (!formats.has(format)) return [];
    return [{
      id: allocationId,
      canonicalItem: allocationId,
      name,
      ownership: "unresolved" as const,
      multiplier: "per_point" as const,
      amountRub: null,
      included: false,
      source: "Physical Allocation · capability requirement",
      reason: "Состав и стоимость комплекта ещё уточняются.",
    }];
  });
}

function networkOperatingSummary(
  configuration: InvestorConfiguration,
  cohorts: NetworkPointCohortProjection[],
  sales: NetworkSalesSummary,
): NetworkOperatingSummary {
  const totalPointCount = cohorts.reduce((total, cohort) => total + cohort.cohort.count, 0);
  // The first point belongs to the already-calculated base object. Scaling is
  // an incremental network view, so only additional groups enter direct point OPEX.
  const additionalCohorts = cohorts.slice(1);
  if (!totalPointCount || sales.checksPerDay === null) {
    return {
      status: "unset", pointDirectOpexRub: null, pointContributionRub: null, productionPayroll: null, baseProductionPayroll: null, expansionProductionPayrollRub: null, managerPayroll: null, expansionManagerPayrollRub: null,
      fixedMarketingRub: null, expansionFixedMarketingRub: null, logisticsRub: null, sharedExpansionOpexRub: null, operatingContributionRub: null, totalRosterHeadcount: null,
      logisticsMode: "unknown", logisticsVehicleCapexRub: null, incompletePointCohortCount: 0,
      note: "Добавьте точки и заполните продажи, чтобы увидеть экономику расширения.",
    };
  }
  const incompletePointCohortCount = additionalCohorts.filter((cohort) => cohort.cohort.count > 0 && cohort.directOpex.isPartial).length;
  const directIncomplete = incompletePointCohortCount > 0;
  const pointDirectOpexRub = additionalCohorts.reduce((total, cohort) => total + (cohort.directOpex.knownDirectOpexCohortRub ?? 0), 0);
  const pointContributionRub = directIncomplete
    ? null
    : additionalCohorts.reduce((total, cohort) => total + (cohort.directOpex.operatingContributionCohortRub ?? 0), 0);
  const baseChecksPerDay = cohorts[0]?.operational.sales.checksPerDay ?? null;
  const shared = sharedNetworkOpexForActivePoints(configuration, {
    totalPointCount,
    additionalPointCount: additionalCohorts.reduce((total, cohort) => total + cohort.cohort.count, 0),
    totalChecksPerDay: sales.checksPerDay,
    baseChecksPerDay,
  });
  const operatingContributionRub = pointContributionRub === null || shared.sharedExpansionOpexRub === null
    ? null
    : pointContributionRub - shared.sharedExpansionOpexRub;
  const totalRosterHeadcount = cohorts.reduce((total, cohort) => total + cohort.operational.staffing.rosterHeadcount * cohort.cohort.count, 0)
    + (shared.productionPayroll?.rosterHeadcount ?? 0) + (shared.managerPayroll?.rosterHeadcount ?? 0);
  const partial = directIncomplete || shared.logisticsRub === null || sales.status !== "complete";
  return {
    status: partial ? "partial" : "complete",
    pointDirectOpexRub,
    pointContributionRub,
    productionPayroll: shared.productionPayroll,
    baseProductionPayroll: shared.baseProductionPayroll,
    expansionProductionPayrollRub: shared.expansionProductionPayrollRub,
    managerPayroll: shared.managerPayroll,
    expansionManagerPayrollRub: shared.expansionManagerPayrollRub,
    fixedMarketingRub: shared.fixedMarketingRub,
    expansionFixedMarketingRub: shared.expansionFixedMarketingRub,
    logisticsRub: shared.logisticsRub,
    sharedExpansionOpexRub: shared.sharedExpansionOpexRub,
    operatingContributionRub,
    totalRosterHeadcount,
    logisticsMode: shared.logisticsMode,
    logisticsVehicleCapexRub: shared.logisticsVehicleCapexRub,
    incompletePointCohortCount,
    note: partial
      ? "Предварительный расчёт: известная часть расходов показана отдельно от условий, которые ещё нужно уточнить."
      : "Расчёт расширения не заменяет полную финансовую модель сети.",
  };
}

function networkPlanningLaunchSummary(
  cohorts: NetworkPointCohortProjection[],
  operating: NetworkOperatingSummary,
): NetworkPlanningLaunchSummary {
  const constants = networkPlanningLaunchConstants();
  const totalPointCount = cohorts.reduce((total, cohort) => total + cohort.cohort.count, 0);
  const uniformRub = operating.totalRosterHeadcount === null ? null : operating.totalRosterHeadcount * constants.uniformPerRosterEmployeeRub;
  const inventoryCandidates = cohorts.map(cohort => {
    const raw = cohort.directOpex.lines.find(line => line.id === "food")?.amountRub;
    const waste = cohort.directOpex.lines.find(line => line.id === "waste")?.amountRub;
    const packaging = cohort.directOpex.lines.find(line => line.id === "consumer-packaging")?.amountRub;
    return raw === null || raw === undefined || waste === null || waste === undefined || packaging === null || packaging === undefined
      ? null
      : (raw + waste + packaging) / cohort.operational.sales.workingDaysPerMonth * cohort.cohort.initialInventoryDays * cohort.cohort.count;
  });
  const initialPointInventoryRub = inventoryCandidates.some(value => value === null) ? null : inventoryCandidates.reduce<number>((total, value) => total + (value ?? 0), 0);
  // Venue preparation is now calculated through the eight-category breakdown.
  // A fitout value is only an explicit, separate branding allowance entered by
  // the user, so its absence is not an incomplete launch calculation.
  const fitoutRub = cohorts.reduce((total, cohort) => total + (cohort.cohort.fitoutAllowanceRub ?? 0) * cohort.cohort.count, 0);
  const securityCandidates = cohorts.map(cohort => {
    if (cohort.cohort.locationType !== "street") return 0;
    return cohort.cohort.videoAllowanceRub === null || cohort.cohort.alarmAllowanceRub === null
      ? null : (cohort.cohort.videoAllowanceRub + cohort.cohort.alarmAllowanceRub) * cohort.cohort.count;
  });
  const securityRub = securityCandidates.some(value => value === null) ? null : securityCandidates.reduce<number>((total, value) => total + (value ?? 0), 0);
  const values = [uniformRub, initialPointInventoryRub, fitoutRub, securityRub, constants.launchMarketingRub, operating.logisticsVehicleCapexRub];
  const totalKnownRub = values.some(value => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  return {
    uniformRub,
    initialPointInventoryRub,
    fitoutRub,
    securityRub,
    launchMarketingRub: constants.launchMarketingRub,
    logisticsVehicleCapexRub: operating.logisticsVehicleCapexRub,
    totalKnownRub,
    isPartial: values.some(value => value === null),
    note: totalPointCount
      ? "Затраты на запуск показаны отдельно от физических инвестиций; запас производства и неоценённые комплекты мойки остаются вне итога."
      : "Добавьте группу точек, чтобы рассчитать затраты на запуск.",
  };
}

function pointCohortProjection(configuration: InvestorConfiguration, cohort: TradingPointCohort): NetworkPointCohortProjection {
  const format = activeFormat(cohort.format);
  const { parameters, seatCount } = equipmentParameters(configuration, cohort);
  const rows = buildCapexRows(
    activePointModuleIds(cohort),
    configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready",
    parameters,
    pointEquipmentQuantityOverrides(cohort),
  ).filter((row) => row.independentProcurement && !excludedFromLaunchEquipment(row));
  const pointRows = rows.filter((row) => rowOwnership(row) === "point");
  const retailRows = pointRows.filter((row) => !row.moduleIds.includes("MOD-BAR") && !["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const posRows = pointRows.filter((row) => ["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const barRows = pointRows.filter((row) => row.moduleIds.includes("MOD-BAR"));
  const operational = pointOperationalProjection(configuration, cohort);
  const directOpex = pointDirectOpexProjection(cohort, operational);
  const pointItems = [
    pointPremisesItem(configuration, cohort),
    pointPreparationItem(cohort),
    groupEquipment("point-retail-equipment", "Торговая кухня и выдача", "point", retailRows, "CAPEX: торговые модули", "Оборудование относится к повторяемой торговой точке."),
    groupEquipment("point-pos-kds", "Касса и экран заказов", "point", posRows, "CAPEX-04-001 / CAPEX-04-003", "Касса и экран заказов относятся к торговой точке."),
    groupEquipment("point-bar", "Бар и напитки", "point", barRows, "CAPEX: MOD-BAR", "Бар включён только для этой группы точек."),
    furnitureItem(configuration, cohort, seatCount),
    pointSecurityItem(cohort),
    pointUniformItem(cohort, operational),
    pointInitialInventoryItem(cohort, directOpex, operational.sales.workingDaysPerMonth),
    pointFitoutItem(cohort),
  ].filter((item): item is NetworkScalingItem => item !== null);
  pointItems.push(pointContingencyItem(configuration, pointItems));
  const confirmedPointInvestmentRub = sumKnown(pointItems);
  return {
    cohort,
    formatName: formatName(cohort.format),
    realEstateName: realEstateName(cohort.realEstateMode),
    pointFormatSourceId: format.id,
    pointItems,
    confirmedPointInvestmentRub,
    confirmedCohortInvestmentRub: confirmedPointInvestmentRub * cohort.count,
    isPartial: pointItems.some((item) => item.amountRub === null || Boolean(item.partial)),
    operational,
    directOpex,
  };
}

export function networkScalingProjection(configuration: InvestorConfiguration): NetworkScalingProjection {
  const productionRows = buildCapexRows(
    activeProductionModuleIds(configuration),
    configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready",
    emptyCapexParameters({
      outletCount: capexData.businessCapacity.prep_outlet_count,
      checksPerOutlet: capexData.businessCapacity.checks_per_outlet_per_day,
      fillingCount: capexData.pilotConfiguration?.filling_count ?? null,
      cashierPostCount: capexData.pilotConfiguration?.cashier_post_count ?? null,
      hotKitchenPostCount: capexData.pilotConfiguration?.hot_kitchen_post_count ?? null,
      seatCount: 0,
      guestAreaM2: 0,
      serviceStationCount: capexData.pilotConfiguration?.service_station_count ?? null,
      centralSupply: capexData.pilotConfiguration?.central_supply_enabled ?? false,
    }),
  ).filter((row) => row.independentProcurement && !excludedFromLaunchEquipment(row) && rowOwnership(row) === "production");
  const productionItems = [
    groupEquipment("production-equipment", "Производственное оборудование", "production", productionRows.filter((row) => !row.moduleIds.includes("MOD-GROW")), "CAPEX: MOD-PREP", "Оборудование общей производственной базы создаётся один раз."),
    groupEquipment("grow-module", "Модуль выращивания", "production", productionRows.filter((row) => row.moduleIds.includes("MOD-GROW")), "CAPEX: MOD-GROW", "Модуль выращивания относится к производству и создаётся один раз."),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const cohorts = configuration.networkScaling.cohorts.map((cohort) => pointCohortProjection(configuration, cohort));
  const unresolvedRowsByItemId = new Map<string, ComputedCapexRow>();
  for (const cohort of configuration.networkScaling.cohorts) {
    const { parameters } = equipmentParameters(configuration, cohort);
    for (const row of buildCapexRows(
      activePointModuleIds(cohort),
      configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready",
      parameters,
      pointEquipmentQuantityOverrides(cohort),
    )) {
      if (row.independentProcurement && !excludedFromLaunchEquipment(row) && rowOwnership(row) === "unresolved") unresolvedRowsByItemId.set(row.item.id, row);
    }
  }
  const unresolvedItems = [
    groupEquipment("unresolved-equipment", "Оборудование без утверждённой стоимости", "unresolved", [...unresolvedRowsByItemId.values()], "CAPEX: смешанные модули", "Для этого оборудования пока нет отдельной подтверждённой стоимости для сетевой точки."),
    ...unresolvedPointWashItems(cohorts),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const productionInvestmentRub = sumKnown(productionItems);
  const confirmedPointInvestmentRub = cohorts.reduce((total, cohort) => total + cohort.confirmedCohortInvestmentRub, 0);
  const sales = networkSalesSummary(cohorts);
  const operating = networkOperatingSummary(configuration, cohorts, sales);
  const sharedItems = operating.logisticsVehicleCapexRub === null ? [] : [{
    id: "shared-refrigerated-logistics",
    canonicalItem: "network_planning.logistics.own_vehicle_capex_rub",
    name: "Рефрижератор для развозки",
    ownership: "shared" as const,
    multiplier: "once" as const,
    amountRub: operating.logisticsVehicleCapexRub,
    included: true,
    source: "Network Planning · общая логистика",
    reason: "Одна общая инфраструктура для ежедневной развозки по сети.",
  }];

  return {
    productionItems,
    cohorts,
    sharedItems,
    unresolvedItems,
    productionInvestmentRub,
    confirmedPointInvestmentRub,
    confirmedInvestmentSubtotalRub: productionInvestmentRub + confirmedPointInvestmentRub,
    isPartial: unresolvedItems.some((item) => item.amountRub === null || item.partial === true)
      || cohorts.some((cohort) => cohort.isPartial || cohort.directOpex.isPartial),
    capacityNote: "При росте сети потребуется проверить, хватает ли мощности текущего производства.",
    contingencyNote: "Резерв запуска пока не включён: его текущая база смешивает включённые и требующие уточнения статьи.",
    reserveNote: "Операционный запас расширения рассчитывается из известной recurring Point + Production + Shared OPEX; налоги и CAPEX в него не входят.",
    sales,
    operating,
    planningLaunch: networkPlanningLaunchSummary(cohorts, operating),
  };
}

function stableMonthlyPayback(investmentRub: number | null, cashFlowRub: number | null) {
  if (investmentRub === null || cashFlowRub === null || investmentRub <= 0 || cashFlowRub <= 0) return null;
  return Math.round(investmentRub / cashFlowRub * 10) / 10;
}

/**
 * Combines the immutable configured Base Object with the structured expansion
 * P&L. Network tax is recalculated from the consolidated revenue and eligible
 * OPEX rather than summing independently presented tax cards.
 */
export function networkEconomicsProjection(
  configuration: InvestorConfiguration,
  baseObject: BaseObjectFinancialProjection,
  suppliedScaling = networkScalingProjection(configuration),
): NetworkEconomicsProjection {
  const policy = configuredFinancialPolicy(configuration.scenarioId);
  const expansionState = buildNetworkSteadyState(configuration, suppliedScaling, policy);
  const networkPnl = combineBaseAndExpansionPnl(baseObject, expansionState, policy);
  const networkInvestmentRub = expansionState.investmentRub === null ? null : baseObject.investmentRub + expansionState.investmentRub;
  return {
    status: expansionState.status,
    coverage: expansionState.coverage,
    warnings: expansionState.warnings,
    exclusions: expansionState.exclusions,
    expansion: {
      additionalPointCount: expansionState.additionalPointCount,
      pointInvestmentRub: expansionState.pointInvestmentRub,
      sharedInfrastructureRub: expansionState.sharedInfrastructureRub,
      operatingReserveRub: expansionState.operatingReserveRub,
      reserveMonths: expansionState.reserveMonths,
      investmentRub: expansionState.investmentRub,
      revenueRub: expansionState.pnl.revenueRub,
      directOpexRub: expansionState.directOpexRub,
      sharedOpexRub: expansionState.sharedOpexRub,
      opexRub: expansionState.pnl.opexRub,
      operatingResultRub: expansionState.pnl.ebitdaRub,
      taxRub: expansionState.pnl.taxRub,
      depreciationRub: expansionState.pnl.depreciationRub,
      maintenanceCapexRub: expansionState.pnl.maintenanceCapexRub,
      operatingFreeCashFlowRub: expansionState.pnl.operatingFreeCashFlowRub,
      cashFlowRub: expansionState.pnl.operatingFreeCashFlowRub,
      paybackMonths: expansionState.paybackMonths,
      incompletePointCohortCount: suppliedScaling.operating.incompletePointCohortCount,
    },
    network: {
      pointCount: suppliedScaling.cohorts.reduce((total, cohort) => total + cohort.cohort.count, 0),
      investmentRub: networkInvestmentRub,
      revenueRub: networkPnl.revenueRub,
      opexRub: networkPnl.opexRub,
      operatingResultRub: networkPnl.ebitdaRub,
      taxRub: networkPnl.taxRub,
      depreciationRub: networkPnl.depreciationRub,
      maintenanceCapexRub: networkPnl.maintenanceCapexRub,
      operatingFreeCashFlowRub: networkPnl.operatingFreeCashFlowRub,
      cashFlowRub: networkPnl.operatingFreeCashFlowRub,
      paybackMonths: stableMonthlyPayback(networkInvestmentRub, networkPnl.operatingFreeCashFlowRub),
    },
  };
}
