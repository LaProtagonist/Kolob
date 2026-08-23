import { buildCapexRows, capexData, emptyCapexParameters, type ComputedCapexRow } from "./capex-runtime";
import { configuredEconomicsScenario } from "./configured-economics";
import type { InvestorConfiguration, TradingPointCohort, TradingPointFormat } from "./investor-configuration";
import { calculateLaunchBudget, calculateSeatCount, launchModel, type LaunchBudgetState } from "./launch-budget";

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
};

const productionModuleIds = new Set(["MOD-PREP", "MOD-GROW"]);
const pointModuleIds = new Set(["MOD-RETAIL-HOT", "MOD-TAKEAWAY", "MOD-GUEST", "MOD-BAR", "MOD-KDS"]);
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

function rowOwnership(row: ComputedCapexRow): NetworkOwnership {
  // The POS module is explicitly split in the canonical register: cash/KDS is
  // repeated at each point, while CAPEX-04-002 is a production accounting terminal.
  if (row.item.id === "CAPEX-04-001" || row.item.id === "CAPEX-04-003") return "point";
  if (row.item.id === "CAPEX-04-002") return "production";
  if (row.moduleIds.length && row.moduleIds.every((id) => productionModuleIds.has(id))) return "production";
  if (row.moduleIds.length && row.moduleIds.every((id) => pointModuleIds.has(id))) return "point";
  return "unresolved";
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
  const hasSeating = cohort.format === "with_seating";
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
      : "Для точки только на вынос посадочный зал и его мебель не применяются.",
  };
}

function unresolvedPreparationItems(configuration: InvestorConfiguration): NetworkScalingItem[] {
  const enabled = new Set(configuration.launchBudget.preparationEnabledCategoryIds);
  return launchModel.preparation.categories
    .filter((category) => !["PREP-GUEST-AREA", "PREP-BUILT-IN"].includes(category.id))
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
  };
}
