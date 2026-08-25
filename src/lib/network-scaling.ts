import { buildCapexRows, capexData, emptyCapexParameters, type ComputedCapexRow } from "./capex-runtime";
import { configuredEconomicsScenario } from "./configured-economics";
import type { InvestorConfiguration, TradingPointCohort, TradingPointFormat } from "./investor-configuration";
import { calculateLaunchBudget, calculateSeatCount, launchModel, type LaunchBudgetState } from "./launch-budget";
import { pointOperationalProjection, type PointOperationalProjection } from "./point-operations";
import { findPhysicalAllocation, type PhysicalScope } from "./physical-allocation";
import {
  canonicalPointOpexConstants,
  logisticsPlanning,
  networkPlanningLaunchConstants,
  productionStaffingProjection,
  sharedManagerPayrollProjection,
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
  detail?: Array<{ id: string; name: string; amountRub: number | null; quantity: number | null }>;
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
  directOpexPerPointRub: number | null;
  directOpexCohortRub: number | null;
  operatingContributionPerPointRub: number | null;
  operatingContributionCohortRub: number | null;
  marginBeforeCentralCosts: number | null;
  isPartial: boolean;
  missing: string[];
};

export type NetworkOperatingSummary = {
  status: "complete" | "partial" | "unset";
  pointDirectOpexRub: number | null;
  productionPayroll: (PayrollProjection & { concurrentPrepCooks: number; capacityReviewRequired: boolean; schedule: string }) | null;
  managerPayroll: PayrollProjection | null;
  fixedMarketingRub: number | null;
  logisticsRub: number | null;
  operatingContributionRub: number | null;
  totalRosterHeadcount: number | null;
  logisticsMode: "external" | "own" | "unknown";
  logisticsVehicleCapexRub: number | null;
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

function activePointModuleIds(cohort: TradingPointCohort) {
  const format = activeFormat(cohort.format);
  const modules = new Set<string>(format.requiredModules);
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
      name: row.item.name,
      amountRub: row.lineTotal,
      quantity: row.quantity,
    })),
  };
}

function pointPreparationItem(cohort: TradingPointCohort): NetworkScalingItem {
  return {
    id: `${cohort.id}:point-preparation`,
    canonicalItem: "PREP-BUILT-IN / PREP-GUEST-AREA",
    name: "Подготовка точки",
    ownership: "point",
    multiplier: "per_point",
    amountRub: cohort.preparationRub,
    included: cohort.preparationRub !== null,
    source: "Текущие planning assumptions подготовки",
    reason: cohort.format === "with_seating"
      ? "Учитывает применимые подтверждённые категории торговой и гостевой зон."
      : "Учитывает только подтверждённую подготовку торговой зоны без гостевой посадки.",
  };
}

function pointPremisesItem(configuration: InvestorConfiguration, cohort: TradingPointCohort): NetworkScalingItem {
  if (cohort.locationType === "foodhall") {
    return {
      id: `${cohort.id}:premises`,
      canonicalItem: "foodhall_contract",
      name: "Вход в помещение",
      ownership: "point",
      multiplier: "per_point",
      amountRub: null,
      included: false,
      source: "Foodhall contract planning",
      reason: "Для Foodhall entry cost определяется договором площадки (revenue share, гарантия и service charge); rent/purchase integrated reference сюда не переносится.",
    };
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

function pointDirectOpex(cohort: TradingPointCohort, operational: PointOperationalProjection): PointDirectOpexProjection {
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
  add("consumer-packaging", "Упаковка", packaging, "Каноническая механика упаковки от чеков.");
  add("acquiring", "Эквайринг", acquiring, "Каноническая ставка от выручки.");
  add("point-payroll", "ФОТ точки", operational.staffing.totalPayrollRub, "Planning roster × канонические зарплаты и действующая формула взносов.");

  let occupancy: number | null;
  if (cohort.locationType === "foodhall") {
    if (revenue === null || cohort.revenueSharePercent === null) occupancy = null;
    else occupancy = Math.max(revenue * cohort.revenueSharePercent / 100, cohort.minimumGuaranteeMonthlyRub ?? 0);
    add("foodhall-occupancy", "Площадка / revenue share", occupancy, "Revenue share и минимальная гарантия задаются договором Foodhall.");
  } else if (cohort.realEstateMode === "rent") {
    occupancy = cohort.monthlyRentRub;
    add("rent", "Аренда", occupancy, "Аренда конкретной точки.");
  } else {
    occupancy = 0;
    add("property-occupancy", "Занятость помещения", 0, "Покупка помещения не создаёт ежемесячную аренду.");
  }
  const utilities = cohort.utilitiesIncluded === true ? 0 : cohort.utilitiesMonthlyRub;
  add("utilities", "Коммунальные", utilities, cohort.utilitiesIncluded === true ? "Включены площадкой по договору." : "Нужно указать значение договора или planning allowance.");
  if (cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") add("service", "Service charge", cohort.serviceChargeMonthlyRub, "Условия площадки.");
  if (cohort.storageRentMonthlyRub !== null) add("storage", "Хранение", cohort.storageRentMonthlyRub, "Условия площадки.");
  add("variable-marketing", "Маркетинг · переменная часть", variableMarketing, "Каноническая доля от выручки; фиксированная часть остаётся общей для сети.");

  const directOpexPerPointRub = missing.length ? null : lines.reduce((total, line) => total + (line.amountRub ?? 0), 0);
  const operatingContributionPerPointRub = directOpexPerPointRub === null || revenue === null ? null : revenue - directOpexPerPointRub;
  return {
    lines,
    directOpexPerPointRub,
    directOpexCohortRub: directOpexPerPointRub === null ? null : directOpexPerPointRub * cohort.count,
    operatingContributionPerPointRub,
    operatingContributionCohortRub: operatingContributionPerPointRub === null ? null : operatingContributionPerPointRub * cohort.count,
    marginBeforeCentralCosts: operatingContributionPerPointRub === null || revenue === null || revenue === 0 ? null : operatingContributionPerPointRub / revenue,
    isPartial: missing.length > 0,
    missing,
  };
}

function unresolvedPreparationItems(configuration: InvestorConfiguration): NetworkScalingItem[] {
  const enabled = new Set(configuration.launchBudget.preparationEnabledCategoryIds);
  return launchModel.preparation.categories
    .filter((category) => {
      const scope = findPhysicalAllocation(category.id)?.physicalScope;
      return scope !== "seating_point" && scope !== "takeaway_point" && scope !== "both_point_formats";
    })
    .map((category) => ({
      id: category.id,
      canonicalItem: category.id,
      name: category.name,
      ownership: "unresolved" as const,
      multiplier: "not_aggregated" as const,
      amountRub: enabled.has(category.id) ? category.amount_rub : 0,
      included: enabled.has(category.id),
      source: "investor-start-model.preparation.categories",
      reason: "В текущих данных эта подготовка смешивает производство и торговые объекты.",
    }));
}

function networkSalesSummary(cohorts: NetworkPointCohortProjection[]): NetworkSalesSummary {
  const active = cohorts.filter((cohort) => cohort.cohort.count > 0);
  if (!active.length) {
    return { status: "unset", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };
  }

  const incomplete = active.some((cohort) => (
    cohort.operational.sales.checksPerDay === null
    || cohort.operational.sales.averageCheckRub === null
    || cohort.operational.sales.revenueCohortRub === null
  ));
  if (incomplete) {
    return { status: "partial", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };
  }

  const checksPerDay = active.reduce((total, cohort) => total + (cohort.operational.sales.checksPerDay ?? 0) * cohort.cohort.count, 0);
  const revenuePerMonthRub = active.reduce((total, cohort) => total + (cohort.operational.sales.revenueCohortRub ?? 0), 0);
  const checkMonths = active.reduce((total, cohort) => total
    + (cohort.operational.sales.checksPerDay ?? 0)
      * cohort.cohort.count
      * cohort.operational.sales.workingDaysPerMonth, 0);

  if (checksPerDay <= 0 || checkMonths <= 0) {
    return { status: "unset", checksPerDay: null, weightedAverageCheckRub: null, revenuePerMonthRub: null };
  }

  return {
    status: "complete",
    checksPerDay,
    weightedAverageCheckRub: revenuePerMonthRub / checkMonths,
    revenuePerMonthRub,
  };
}

function unresolvedLaunchItems(configuration: InvestorConfiguration): NetworkScalingItem[] {
  const economics = configuredEconomicsScenario(configuration);
  const reasons: Record<string, string> = {
    video: "В текущей модели безопасность не разделена между производством и точками.",
    alarm: "В текущей модели безопасность не разделена между производством и точками.",
    uniform: "Первичная форма не разделена между командами производства и точек.",
    launch_marketing: "Для маркетинга запуска нет правила распределения по группам точек.",
    inventory: "Первоначальный запас не имеет правила распределения по группам точек.",
    contingency: "База резерва запуска содержит как включённые, так и требующие уточнения статьи.",
    operating_reserve: "Операционный запас основан на смешанном OPEX и не масштабируется до его разделения.",
  };
  return economics.investmentBreakdown
    .filter((item) => !["equipment", "furniture", "preparation", "prepaid_rent", "security_deposit", "property"].includes(item.key))
    .map((item) => ({
      id: item.key,
      canonicalItem: item.key,
      name: item.name,
      ownership: "unresolved" as const,
      multiplier: "not_aggregated" as const,
      amountRub: item.amount_rub,
      included: true,
      source: "Financial Model / Investor Summary investment breakdown",
      reason: reasons[item.key] ?? "Для этой статьи пока нет подтверждённого распределения.",
    }));
}

function networkOperatingSummary(
  configuration: InvestorConfiguration,
  cohorts: NetworkPointCohortProjection[],
  sales: NetworkSalesSummary,
): NetworkOperatingSummary {
  const totalPointCount = cohorts.reduce((total, cohort) => total + cohort.cohort.count, 0);
  if (!totalPointCount || sales.checksPerDay === null) {
    return {
      status: "unset", pointDirectOpexRub: null, productionPayroll: null, managerPayroll: null,
      fixedMarketingRub: null, logisticsRub: null, operatingContributionRub: null, totalRosterHeadcount: null,
      logisticsMode: "unknown", logisticsVehicleCapexRub: null,
      note: "Добавьте точки и complete sales assumptions, чтобы построить planning summary.",
    };
  }
  const directIncomplete = cohorts.some(cohort => cohort.cohort.count > 0 && cohort.directOpex.isPartial);
  const pointDirectOpexRub = directIncomplete
    ? null
    : cohorts.reduce((total, cohort) => total + (cohort.directOpex.directOpexCohortRub ?? 0), 0);
  const pointContributionRub = directIncomplete
    ? null
    : cohorts.reduce((total, cohort) => total + (cohort.directOpex.operatingContributionCohortRub ?? 0), 0);
  const productionPayroll = productionStaffingProjection(sales.checksPerDay, configuration.networkScaling.productionSchedule);
  const managerPayroll = sharedManagerPayrollProjection(totalPointCount);
  const logistics = logisticsPlanning(totalPointCount);
  const settings = configuration.networkScaling.logistics;
  const logisticsMode = settings.mode === "auto"
    ? logistics.ownsVehicleSuggested ? "own" : "external"
    : settings.mode;
  const logisticsRub = logisticsMode === "own"
    ? settings.ownedMonthlyTotalRub ?? logistics.ownedMonthlyTotalRub
    : settings.externalMonthlyRub ?? logistics.externalMonthlyRub;
  const operatingContributionRub = pointContributionRub === null || logisticsRub === null
    ? null
    : pointContributionRub - productionPayroll.totalPayrollRub - (managerPayroll?.totalPayrollRub ?? 0)
      - canonicalPointOpexConstants().marketingFixedMonthlyRub - logisticsRub;
  const totalRosterHeadcount = cohorts.reduce((total, cohort) => total + cohort.operational.staffing.rosterHeadcount * cohort.cohort.count, 0)
    + productionPayroll.rosterHeadcount + (managerPayroll?.rosterHeadcount ?? 0);
  const partial = directIncomplete || logisticsRub === null;
  return {
    status: partial ? "partial" : "complete",
    pointDirectOpexRub,
    productionPayroll,
    managerPayroll,
    fixedMarketingRub: canonicalPointOpexConstants().marketingFixedMonthlyRub,
    logisticsRub,
    operatingContributionRub,
    totalRosterHeadcount,
    logisticsMode,
    logisticsVehicleCapexRub: logisticsMode === "own" ? settings.ownedVehicleCapexRub ?? logistics.vehicleCapexRub : null,
    note: partial
      ? "Planning / partial: нераспределённые или незаданные расходы по договору не выданы за полную EBITDA сети."
      : "Planning result до оставшихся центральных, налоговых и capacity costs; это не canonical EBITDA.",
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
  const fitoutCandidates = cohorts.map(cohort => cohort.cohort.fitoutAllowanceRub === null ? null : cohort.cohort.fitoutAllowanceRub * cohort.cohort.count);
  const fitoutRub = fitoutCandidates.some(value => value === null) ? null : fitoutCandidates.reduce<number>((total, value) => total + (value ?? 0), 0);
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
      ? "Planning launch показан отдельно от подтверждённых физических инвестиций; запас производства и неоценённые wash kits остаются вне итога."
      : "Добавьте группу точек, чтобы рассчитать planning launch.",
  };
}

function pointCohortProjection(configuration: InvestorConfiguration, cohort: TradingPointCohort): NetworkPointCohortProjection {
  const format = activeFormat(cohort.format);
  const { parameters, seatCount } = equipmentParameters(configuration, cohort);
  const rows = buildCapexRows(
    activePointModuleIds(cohort),
    configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready",
    parameters,
  ).filter((row) => row.independentProcurement && !excludedFromLaunchEquipment(row));
  const pointRows = rows.filter((row) => rowOwnership(row) === "point");
  const retailRows = pointRows.filter((row) => !row.moduleIds.includes("MOD-BAR") && !["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const posRows = pointRows.filter((row) => ["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const barRows = pointRows.filter((row) => row.moduleIds.includes("MOD-BAR"));
  const pointItems = [
    pointPremisesItem(configuration, cohort),
    pointPreparationItem(cohort),
    groupEquipment("point-retail-equipment", "Торговая кухня и выдача", "point", retailRows, "CAPEX: торговые модули", "Оборудование относится к повторяемой торговой точке."),
    groupEquipment("point-pos-kds", "Касса и KDS", "point", posRows, "CAPEX-04-001 / CAPEX-04-003", "Касса и экран заказов относятся к торговой точке."),
    groupEquipment("point-bar", "Бар и напитки", "point", barRows, "CAPEX: MOD-BAR", "Бар включён только для этой группы точек."),
    furnitureItem(configuration, cohort, seatCount),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const confirmedPointInvestmentRub = sumKnown(pointItems);
  const operational = pointOperationalProjection(configuration, cohort);
  return {
    cohort,
    formatName: formatName(cohort.format),
    realEstateName: realEstateName(cohort.realEstateMode),
    pointFormatSourceId: format.id,
    pointItems,
    confirmedPointInvestmentRub,
    confirmedCohortInvestmentRub: confirmedPointInvestmentRub * cohort.count,
    // Launch stock, security, reserve and contingency still require allocation;
    // never present this subtotal as a complete opening cost.
    isPartial: true,
    operational,
    directOpex: pointDirectOpex(cohort, operational),
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
    for (const row of buildCapexRows(activePointModuleIds(cohort), configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready", parameters)) {
      if (row.independentProcurement && !excludedFromLaunchEquipment(row) && rowOwnership(row) === "unresolved") unresolvedRowsByItemId.set(row.item.id, row);
    }
  }
  const unresolvedItems = [
    groupEquipment("unresolved-equipment", "Неразделённое оборудование", "unresolved", [...unresolvedRowsByItemId.values()], "CAPEX: смешанные модули", "Принадлежность оборудования к производству или точке пока не подтверждена."),
    ...unresolvedPreparationItems(configuration),
    ...unresolvedLaunchItems(configuration),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const productionInvestmentRub = sumKnown(productionItems);
  const confirmedPointInvestmentRub = cohorts.reduce((total, cohort) => total + cohort.confirmedCohortInvestmentRub, 0);
  const sales = networkSalesSummary(cohorts);
  const operating = networkOperatingSummary(configuration, cohorts, sales);

  return {
    productionItems,
    cohorts,
    sharedItems: [],
    unresolvedItems,
    productionInvestmentRub,
    confirmedPointInvestmentRub,
    confirmedInvestmentSubtotalRub: productionInvestmentRub + confirmedPointInvestmentRub,
    isPartial: true,
    capacityNote: "Мощность производства пока не ограничивает расчёт: зависимость от количества точек ещё не определена.",
    contingencyNote: "Резерв запуска пока не включён: его текущая база смешивает включённые и требующие уточнения статьи.",
    reserveNote: "Операционный запас пока не включён: сначала нужен раздельный OPEX производства, точек и общих функций.",
    sales,
    operating,
    planningLaunch: networkPlanningLaunchSummary(cohorts, operating),
  };
}
