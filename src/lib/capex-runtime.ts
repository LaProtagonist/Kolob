import rawCapexData from "../content/capex-configurator-data.json" with { type: "json" };
import { capexConditionSatisfied, compositionGroups, type CapexComposition, type CompositionOptions } from "./capex-composition.js";

export type ScenarioId = "minimum" | "base" | "scale_ready";
export type CapexData = typeof rawCapexData;
export type CapexItem = CapexData["items"][number];
export type CapexModule = CapexData["modules"][number];
export type ModuleLink = CapexData["moduleItems"][number];
export type ScenarioPrice = NonNullable<CapexItem["scenarios"]["base"]>;
export type NumericParameterKey = "outletCount" | "checksPerOutlet" | "shiftCount" | "fillingCount" | "cashierPostCount" | "hotKitchenPostCount" | "kdsPostCount" | "seatCount" | "guestAreaM2" | "serviceStationCount";
export type CapexParameters = Record<NumericParameterKey, number | null> & {
  alcoholEnabled: boolean;
  sharedSeating: boolean;
  reusableTableware: boolean;
  centralSupply: boolean;
  mobileFormat: boolean;
  compositionProfile?: "retail_complete";
  washMode?: "manual" | "machine";
};

export type ComputedCapexRow = {
  item: CapexItem;
  links: ModuleLink[];
  moduleIds: string[];
  primaryModuleId: string;
  requirement: string;
  quantity: number | null;
  quantityStatus: string;
  quantityRule: string;
  price: ScenarioPrice | null;
  unitPrice: number | null;
  lineTotal: number | null;
  independentProcurement: boolean;
  includedInParent: boolean;
  quoteRequired: boolean;
  sourceInclusion: string;
};

export type EquipmentSummary = {
  total: number;
  pricedCount: number;
  unpricedCount: number;
  quoteRequiredCount: number;
  coverageCount: number;
  rows: ComputedCapexRow[];
};

export const capexData = rawCapexData as CapexData;

const requirementRank: Record<string, number> = { required: 4, conditional: 3, optional: 2, tbd: 1 };

function driverForRule(rule: string, parameters: CapexParameters) {
  if (rule === "per_seat") return parameters.seatCount;
  if (rule === "per_guest_area_m2") return parameters.guestAreaM2;
  if (rule === "per_workstation" || rule === "per_hot_kitchen_post") return parameters.hotKitchenPostCount;
  if (rule === "per_cashier_post") return parameters.cashierPostCount;
  if (rule === "per_filling") return parameters.fillingCount;
  if (rule === "per_station") return parameters.serviceStationCount;
  return null;
}

function computedFromLinks(links: ModuleLink[], parameters: CapexParameters) {
  const calculated = links.map(link => {
    if (link.quantityRuleType === "fixed" && link.quantityRuleValue !== null) return { value: link.quantityRuleValue, link };
    const driver = driverForRule(link.quantityRuleType, parameters);
    if (driver !== null && link.quantityRuleValue !== null) return { value: driver * link.quantityRuleValue, link };
    return { value: null, link };
  });
  const known = calculated.filter(entry => entry.value !== null) as Array<{ value: number; link: ModuleLink }>;
  if (!known.length) return { quantity: null, rule: links.map(link => link.quantityRuleType).join(" + ") || "tbd" };
  if (links.some(link => link.aggregationRule === "manual")) return { quantity: null, rule: "manual" };
  if (links.some(link => link.aggregationRule === "sum")) return { quantity: known.reduce((sum, entry) => sum + entry.value, 0), rule: known.map(entry => entry.link.quantityRuleType).join(" + ") };
  if (links.some(link => link.aggregationRule === "max")) return { quantity: Math.max(...known.map(entry => entry.value)), rule: "max" };
  return { quantity: known[0].value, rule: known[0].link.quantityRuleType };
}

function linkConditionSatisfied(condition: string | null, parameters: CapexParameters) {
  return capexConditionSatisfied(condition, parameters);
}

/**
 * A caller may supply a governed configuration-specific quantity rule. This
 * keeps the item price and module ownership in the canonical equipment
 * register while allowing a point-composition adapter to state applicability.
 */
export function buildCapexRows(
  activeModuleIds: Set<string>,
  scenario: ScenarioId,
  parameters: CapexParameters,
  quantityOverrides: Readonly<Record<string, number>> = {},
): ComputedCapexRow[] {
  const itemById = new Map(capexData.items.map(item => [item.id, item]));
  const linksByItem = new Map<string, ModuleLink[]>();
  for (const link of capexData.moduleItems) {
    if (!activeModuleIds.has(link.moduleId) || !linkConditionSatisfied(link.condition, parameters)) continue;
    linksByItem.set(link.itemId, [...(linksByItem.get(link.itemId) ?? []), link]);
  }
  return [...linksByItem.entries()].map(([itemId, links]) => {
    const item = itemById.get(itemId)!;
    const price = item.scenarios[scenario] as ScenarioPrice | null;
    const rules = computedFromLinks(links, parameters);
    const parameterDriven = links.some(link => link.quantityRuleType.startsWith("per_") && driverForRule(link.quantityRuleType, parameters) !== null && link.quantityRuleValue !== null);
    const overriddenQuantity = quantityOverrides[itemId];
    const quantity = typeof overriddenQuantity === "number"
      ? overriddenQuantity
      : parameterDriven ? rules.quantity : price?.quantity ?? rules.quantity;
    const includedInParent = item.inclusionStatus === "included_in_parent" || item.recordType === "component";
    const independentProcurement = ["standalone", "purchased_separately"].includes(item.inclusionStatus) && !["component", "engineering_connection", "open_question"].includes(item.recordType);
    const unitPrice = price?.unitPriceRub ?? null;
    const lineTotal = includedInParent || unitPrice === null || quantity === null || quantity <= 0 ? null : Math.round(unitPrice * quantity * 100) / 100;
    const requirement = [...links].sort((a, b) => (requirementRank[b.defaultRequirement] ?? 0) - (requirementRank[a.defaultRequirement] ?? 0))[0]?.defaultRequirement ?? item.requirement;
    return {
      item,
      links,
      moduleIds: [...new Set(links.map(link => link.moduleId))],
      primaryModuleId: links[0]?.moduleId ?? item.linkedModuleIds[0] ?? item.sourceModuleId,
      requirement,
      quantity,
      quantityStatus: quantity === null ? "Требует расчёта производительности" : quantity === 0 ? "Не входит в сценарий" : "Рассчитано по данным",
      quantityRule: typeof overriddenQuantity === "number"
        ? "Конфигурация точки"
        : parameterDriven ? rules.rule : price ? `Сценарий: ${capexData.scenarios.find(entry => entry.id === scenario)?.label ?? scenario}` : rules.rule,
      price,
      unitPrice,
      lineTotal,
      independentProcurement,
      includedInParent,
      quoteRequired: item.quoteStatus === "quote_required" || item.priceResearch?.quoteStatus === "quote_required",
      sourceInclusion: links.map(link => `${link.moduleId}: ${link.defaultRequirement}`).join("; "),
    };
  }).sort((a, b) => a.item.id.localeCompare(b.item.id));
}

export function summarizeEquipment(rows: ComputedCapexRow[], excludedItemPrefixes: string[] = [], excludedItemIds: string[] = []): EquipmentSummary {
  const exact = new Set(excludedItemIds);
  const includedRows = rows.filter(row => !exact.has(row.item.id) && !excludedItemPrefixes.some(prefix => row.item.id.startsWith(prefix)));
  const coverage = includedRows.filter(row => row.independentProcurement && row.quantity !== 0);
  const priced = coverage.filter(row => row.lineTotal !== null);
  return {
    total: priced.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0),
    pricedCount: priced.length,
    unpricedCount: coverage.length - priced.length,
    quoteRequiredCount: coverage.filter(row => row.quoteRequired).length,
    coverageCount: coverage.length,
    rows: includedRows,
  };
}

/** Prices remain in the register. Applicability comes from the generated format BOM. */
export function buildFormatCapexRows(formatId: string, scenario: ScenarioId, parameters: CapexParameters, options: CompositionOptions): ComputedCapexRow[] {
  const format = capexData.formats.find(format => format.id === formatId);
  if (!format?.composition) throw new Error(`No current composition for ${formatId}`);
  const profile = format.composition as CapexComposition & { bom: { equipment: Array<{ item_id: string }> } };
  const groups = compositionGroups(profile, options);
  const allowed = new Set(profile.bom.equipment.map(row => row.item_id));
  // The optional machine is already a governed module link; the manual BOM omits it.
  if (options.washMode === "machine") for (const link of capexData.moduleItems) {
    if (link.condition === "retail_complete && machine_wash") allowed.add(link.itemId);
  }
  const allModules = new Set(capexData.modules.map(module => module.id));
  return buildCapexRows(allModules, scenario, { ...parameters, compositionProfile: profile.id, washMode: options.washMode }, profile.quantity_overrides)
    .filter(row => allowed.has(row.item.id) && row.independentProcurement && groups.some(group => group.item_ids.includes(row.item.id)))
    .map(row => {
      const group = groups.find(group => group.item_ids.includes(row.item.id))!;
      const reserve = row.item.cashReserveRub?.[scenario] ?? 0;
      const unitPrice = row.unitPrice === null ? null : row.unitPrice - reserve;
      if (unitPrice !== null && unitPrice < 0) throw new Error(`Cash reserve exceeds price: ${row.item.id}`);
      return { ...row, unitPrice, lineTotal: unitPrice === null || row.quantity === null ? null : Math.round(unitPrice * row.quantity * 100) / 100,
        // A reused wash component belongs to the point in this BOM, not to production.
        primaryModuleId: group.id === "point-wash" ? "MOD-WASH" : row.primaryModuleId,
        moduleIds: group.id === "point-wash" ? ["MOD-WASH"] : row.moduleIds.filter(id => id !== "MOD-PREP" && id !== "MOD-GROW"),
      };
    });
}

export function formatCompositionSummary(formatId: string, scenario: ScenarioId, rows: ComputedCapexRow[], options: CompositionOptions) {
  const profile = capexData.formats.find(format => format.id === formatId)?.composition as CapexComposition | null;
  if (!profile) throw new Error(`No composition for ${formatId}`);
  const groups = compositionGroups(profile, options).map(group => {
    const selected = rows.filter(row => group.item_ids.includes(row.item.id));
    const known = selected.filter(row => row.lineTotal !== null);
    return { ...group, rows: selected, knownRub: known.reduce((sum, row) => sum + row.lineTotal!, 0), missingCount: selected.length - known.length };
  });
  const reserveRub = rows.reduce((sum, row) => sum + (row.item.cashReserveRub?.[scenario] ?? 0) * (row.quantity ?? 0), 0);
  const functions = profile.functions.map(fn => {
    const needed = rows.filter(row => fn.item_ids.includes(row.item.id));
    const missingPrices = needed.filter(row => row.lineTotal === null).map(row => row.item.name);
    const missingItems = fn.item_ids.filter(id => !rows.some(row => row.item.id === id));
    const notApplicable = fn.id === "drinks" && !options.barEnabled;
    return { ...fn, missingPrices, missingItems, status: notApplicable ? "not_applicable" : fn.gaps.length || missingPrices.length || missingItems.length ? "open" : "covered" };
  });
  return { groups, reserveRub, functions, complete: functions.every(fn => fn.status !== "open") };
}

export function emptyCapexParameters(overrides: Partial<CapexParameters> = {}): CapexParameters {
  return {
    outletCount: null,
    checksPerOutlet: null,
    shiftCount: null,
    fillingCount: null,
    cashierPostCount: null,
    hotKitchenPostCount: null,
    kdsPostCount: null,
    seatCount: null,
    guestAreaM2: null,
    serviceStationCount: null,
    alcoholEnabled: false,
    sharedSeating: false,
    reusableTableware: false,
    centralSupply: false,
    mobileFormat: false,
    ...overrides,
  };
}
