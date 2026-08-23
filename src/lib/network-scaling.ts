import { buildCapexRows, capexData, emptyCapexParameters, type ComputedCapexRow } from "./capex-runtime";
import { configuredEconomicsScenario } from "./configured-economics";
import type { InvestorConfiguration, NetworkPointFormat } from "./investor-configuration";
import { calculateSeatCount, launchModel } from "./launch-budget";

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

export type NetworkScalingProjection = {
  pointCount: number;
  pointFormat: NetworkPointFormat;
  pointFormatSourceId: string;
  pointFormatName: string;
  pointBarEnabled: boolean;
  productionGrowEnabled: boolean;
  productionItems: NetworkScalingItem[];
  pointItems: NetworkScalingItem[];
  sharedItems: NetworkScalingItem[];
  unresolvedItems: NetworkScalingItem[];
  productionInvestmentRub: number;
  pointInvestmentRub: number;
  pointNetworkInvestmentRub: number;
  confirmedInvestmentSubtotalRub: number;
  isPartial: boolean;
  capacityNote: string;
  contingencyNote: string;
  reserveNote: string;
};

const productionModuleIds = new Set(["MOD-PREP", "MOD-GROW"]);
const pointModuleIds = new Set(["MOD-RETAIL-HOT", "MOD-TAKEAWAY", "MOD-GUEST", "MOD-BAR", "MOD-KDS"]);

const pointFormatSourceIds: Record<NetworkPointFormat, string> = {
  with_seating: "FMT-RESTAURANT-SEATING",
  without_seating: "FMT-FOOD-COURT",
};

function sumKnown(items: NetworkScalingItem[]) {
  return items.filter((item) => item.included).reduce((total, item) => total + (item.amountRub ?? 0), 0);
}

function activeFormat(configuration: InvestorConfiguration) {
  const id = pointFormatSourceIds[configuration.networkScaling.pointFormat];
  const format = capexData.formats.find((item) => item.id === id);
  if (!format) throw new Error(`Canonical point format ${id} is unavailable.`);
  return format;
}

function equipmentParameters(configuration: InvestorConfiguration, pointFormat: NetworkPointFormat) {
  const launch = configuration.launchBudget;
  const seating = launchModel.seating.profiles.find((item) => item.id === launch.seatingProfileId)!;
  const seatCount = pointFormat === "with_seating"
    ? calculateSeatCount(launch.guestAreaM2, seating.square_metres_per_seat)
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
      guestAreaM2: pointFormat === "with_seating" ? launch.guestAreaM2 : 0,
      serviceStationCount: capexData.pilotConfiguration?.service_station_count ?? null,
      centralSupply: capexData.pilotConfiguration?.central_supply_enabled ?? false,
    }),
  };
}

function activeModuleIds(configuration: InvestorConfiguration, format: (typeof capexData.formats)[number]) {
  const modules = new Set<string>(["MOD-PREP", ...format.requiredModules]);
  if (configuration.networkScaling.productionGrowEnabled) modules.add("MOD-GROW");
  if (configuration.networkScaling.pointBarEnabled) modules.add("MOD-BAR");
  // The current integrated launch budget includes this single combined zone,
  // but its ownership cannot be proven for a separate point format.
  if (format.requiredModules.includes("MOD-WASH")) modules.add("MOD-WASH");
  return modules;
}

function excludedFromLaunchEquipment(row: ComputedCapexRow) {
  const exclusions = launchModel.point_configuration.equipment_exclusions;
  return exclusions.some((entry) => (entry.item_id && row.item.id === entry.item_id)
    || (entry.item_id_prefix && row.item.id.startsWith(entry.item_id_prefix)));
}

function rowOwnership(row: ComputedCapexRow): NetworkOwnership {
  // MOD-POS is intentionally split by its explicit canonical item names: the
  // cash terminals repeat with the point, while the production accounting
  // terminal belongs to the shared preparation base.
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

function preparationItems(configuration: InvestorConfiguration): NetworkScalingItem[] {
  const enabled = new Set(configuration.launchBudget.preparationEnabledCategoryIds);
  const withSeating = configuration.networkScaling.pointFormat === "with_seating";
  return launchModel.preparation.categories.map((category) => {
    const ownership: NetworkOwnership = ["PREP-GUEST-AREA", "PREP-BUILT-IN"].includes(category.id) ? "point" : "unresolved";
    const applicable = category.id !== "PREP-GUEST-AREA" || withSeating;
    const included = enabled.has(category.id) && applicable;
    return {
      id: category.id,
      canonicalItem: category.id,
      name: category.name,
      ownership,
      multiplier: ownership === "point" ? "per_point" : "not_aggregated",
      amountRub: included ? category.amount_rub : 0,
      included,
      source: "investor-start-model.preparation.categories",
      reason: ownership === "point"
        ? category.id === "PREP-GUEST-AREA"
          ? "Canonical category is explicitly the guest area; it is inapplicable without seating."
          : "Canonical category contains order/issue counters and built-in retail furniture."
        : "The canonical category combines production and/or retail works without a reliable split.",
    };
  });
}

function furnitureItem(configuration: InvestorConfiguration, seatCount: number | null): NetworkScalingItem {
  const withSeating = configuration.networkScaling.pointFormat === "with_seating";
  const profile = launchModel.furniture.profiles.find((item) => item.id === configuration.launchBudget.furnitureProfileId)!;
  return {
    id: "furniture",
    canonicalItem: "furniture.formula",
    name: "Мебель посадочного зала",
    ownership: "point",
    multiplier: "per_point",
    amountRub: withSeating && seatCount !== null ? seatCount * profile.rub_per_seat : 0,
    included: withSeating && seatCount !== null,
    source: "investor-start-model.furniture.formula",
    reason: withSeating
      ? "Canonical furniture formula is based on seats in the guest area."
      : "The selected canonical point format excludes MOD-GUEST and has no own seating furniture.",
  };
}

function unresolvedLaunchItems(configuration: InvestorConfiguration): NetworkScalingItem[] {
  const economics = configuredEconomicsScenario(configuration);
  const reasons: Record<string, string> = {
    video: "Security equipment belongs to the current integrated object; the canonical model has no network split.",
    alarm: "Security equipment belongs to the current integrated object; the canonical model has no network split.",
    uniform: "The canonical launch item is not separated into production and point teams.",
    launch_marketing: "The canonical launch marketing item has no point/network allocation rule.",
    inventory: "Initial inventory is working capital for the integrated object, without a point allocation rule.",
    contingency: "Canonical contingency is based on equipment + furniture + preparation, whose network ownership is only partially resolved.",
    prepaid_rent: "Prepaid rent is specified for the current integrated premises, not a separate production base or point.",
    security_deposit: "The deposit is specified for the current integrated premises, not a separate production base or point.",
    property: "The property price is specified for the current integrated premises, not a separate production base or point.",
    operating_reserve: "The reserve is calculated from integrated operating costs; it must not be multiplied before OPEX is separated.",
  };
  return economics.investmentBreakdown
    .filter((item) => !["equipment", "furniture", "preparation"].includes(item.key))
    .map((item) => ({
      id: item.key,
      canonicalItem: item.key,
      name: item.name,
      ownership: "unresolved" as const,
      multiplier: "not_aggregated" as const,
      amountRub: item.amount_rub,
      included: true,
      source: "Financial Model / Investor Summary investment breakdown",
      reason: reasons[item.key] ?? "The canonical launch item has no confirmed production, point, or network allocation.",
    }));
}

export function networkScalingProjection(configuration: InvestorConfiguration): NetworkScalingProjection {
  const format = activeFormat(configuration);
  const pointFormat = configuration.networkScaling.pointFormat;
  const { parameters, seatCount } = equipmentParameters(configuration, pointFormat);
  const rows = buildCapexRows(activeModuleIds(configuration, format), configuration.launchBudget.equipmentScenarioId.toLowerCase() as "minimum" | "base" | "scale_ready", parameters);
  const classifiedRows = rows.filter((row) => row.independentProcurement && !excludedFromLaunchEquipment(row));

  const productionRows = classifiedRows.filter((row) => rowOwnership(row) === "production");
  const pointRows = classifiedRows.filter((row) => rowOwnership(row) === "point");
  const unresolvedRows = classifiedRows.filter((row) => rowOwnership(row) === "unresolved");
  const productionEquipmentRows = productionRows.filter((row) => !row.moduleIds.includes("MOD-GROW"));
  const growRows = productionRows.filter((row) => row.moduleIds.includes("MOD-GROW"));
  const pointRetailRows = pointRows.filter((row) => !row.moduleIds.includes("MOD-BAR") && !["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const pointPosRows = pointRows.filter((row) => ["CAPEX-04-001", "CAPEX-04-003"].includes(row.item.id));
  const pointBarRows = pointRows.filter((row) => row.moduleIds.includes("MOD-BAR"));
  const preparations = preparationItems(configuration);

  const productionItems = [
    groupEquipment("production-equipment", "Производственное оборудование", "production", productionEquipmentRows, "CAPEX modules: MOD-PREP", "All included rows belong only to the canonical preparation module."),
    groupEquipment("grow-module", "Модуль выращивания", "production", growRows, "CAPEX modules: MOD-GROW", "Owner decision: grow is production infrastructure and is created once."),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const pointItems = [
    groupEquipment("point-retail-equipment", "Торговая кухня и выдача", "point", pointRetailRows, "CAPEX modules: MOD-RETAIL-HOT / MOD-TAKEAWAY", "These modules are required by canonical trading-point formats."),
    groupEquipment("point-pos-kds", "Касса и KDS", "point", pointPosRows, "CAPEX items CAPEX-04-001 / CAPEX-04-003", "Cash terminals and order screens are required by canonical trading-point formats."),
    groupEquipment("point-bar", "Бар и напитки", "point", pointBarRows, "CAPEX module: MOD-BAR", "The optional canonical bar module belongs to each selected trading point."),
    ...preparations.filter((item) => item.ownership === "point"),
    furnitureItem(configuration, seatCount),
  ].filter((item): item is NetworkScalingItem => item !== null);
  const unresolvedItems = [
    groupEquipment("unresolved-equipment", "Неразделённое оборудование", "unresolved", unresolvedRows, "CAPEX modules with mixed or unclear ownership", "Canonical module ownership is not sufficient to allocate this equipment to production or a point."),
    ...preparations.filter((item) => item.ownership === "unresolved"),
    ...unresolvedLaunchItems(configuration),
  ].filter((item): item is NetworkScalingItem => item !== null);

  const productionInvestmentRub = sumKnown(productionItems);
  const pointInvestmentRub = sumKnown(pointItems);
  const pointNetworkInvestmentRub = pointInvestmentRub * configuration.networkScaling.pointCount;
  const confirmedInvestmentSubtotalRub = productionInvestmentRub + pointNetworkInvestmentRub;

  return {
    pointCount: configuration.networkScaling.pointCount,
    pointFormat,
    pointFormatSourceId: format.id,
    pointFormatName: pointFormat === "with_seating" ? "Точка с посадочным залом" : "Точка без посадочного зала",
    pointBarEnabled: configuration.networkScaling.pointBarEnabled,
    productionGrowEnabled: configuration.networkScaling.productionGrowEnabled,
    productionItems,
    pointItems,
    sharedItems: [],
    unresolvedItems,
    productionInvestmentRub,
    pointInvestmentRub,
    pointNetworkInvestmentRub,
    confirmedInvestmentSubtotalRub,
    isPartial: true,
    capacityNote: "В канонической модели пока нет зависимости мощности заготовочного производства от количества торговых точек.",
    contingencyNote: "Резерв запуска сохраняет каноническую базу «оборудование + мебель + подготовка», но не агрегируется: база смешивает resolved и unresolved статьи.",
    reserveNote: "Операционный запас не умножается: каноническая модель пока не делит OPEX на production, point и shared/network.",
  };
}
