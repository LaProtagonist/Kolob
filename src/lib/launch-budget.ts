import { buildCapexRows, capexData, emptyCapexParameters, summarizeEquipment, type EquipmentSummary, type ScenarioId } from "./capex-runtime.js";

export type PremisesScenario = "purchase" | "rent";
export type SeatingProfileId = "efficient" | "balanced" | "comfortable";
export type FurnitureProfileId = "functional" | "balanced" | "comfort";
export type EquipmentScenarioId = "MINIMUM" | "BASE" | "SCALE_READY";
export type PreparationMode = "breakdown" | "manual";
export type OperatingExpenseMode = "baseline" | "custom";

// Runtime default: the initial option assumes a former restaurant/catering premises
// with the core construction and engineering infrastructure already in place.
// These modules remain available for a raw premises configuration.
const readyPremisesExcludedPreparationCategoryIds = new Set([
  "PREP-BUILDING",
  "PREP-ELECTRICAL",
  "PREP-WATER-DRAINAGE",
  "PREP-VENTILATION",
]);

export type LaunchBudgetState = {
  premisesScenario: PremisesScenario;
  purchasePriceRub: number | null;
  monthlyRentRub: number | null;
  prepaymentMonths: number;
  securityDepositMonths: number;
  rentFreeMonths: number;
  totalAreaM2: number | null;
  kitchenAreaM2: number | null;
  guestAreaM2: number | null;
  seatingProfileId: SeatingProfileId;
  furnitureProfileId: FurnitureProfileId;
  equipmentScenarioId: EquipmentScenarioId;
  barEnabled: boolean;
  growEnabled: boolean;
  preparationMode: PreparationMode;
  preparationEnabledCategoryIds: string[];
  preparationManualRub: number | null;
  preparationAccordionOpen: boolean;
  operatingExpenseMode: OperatingExpenseMode;
  customMonthlyOpexRub: number | null;
  operatingReserveMonths: number;
  operatingReserveAccordionOpen: boolean;
  contingencyPercent: number;
};

export type LaunchBudgetResult = {
  areaInvalid: boolean;
  otherAreaM2: number | null;
  seatCount: number | null;
  furnitureRub: number | null;
  equipment: EquipmentSummary;
  activeModuleIds: string[];
  incompleteRequiredModules: Array<{ id: string; name: string }>;
  premisesEntryRub: number | null;
  securityDepositRub: number | null;
  operatingReserveRub: number | null;
  operatingReserveSource: "financial_model" | "custom" | "legacy_snapshot";
  monthlyOperatingExpensesRub: number | null;
  launchMarketingRub: number;
  launchItemsRub: number;
  launchItems: Array<{ id: string; name: string; amountRub: number }>;
  preparationBreakdownRub: number;
  effectivePreparationRub: number | null;
  contingencyRub: number;
  contingencyPartial: boolean;
  financingRequirementRub: number | null;
  createdAssetsRub: number;
  createdAssetsPartial: boolean;
  tiedFundsRub: number | null;
  partial: boolean;
  missing: string[];
};

type LaunchModel = {
  point_configuration: {
    format_name: string;
    required_modules: string[];
    optional_modules: Array<{ module_id: string; default_enabled: boolean }>;
    summary_modules: Array<{ module_id: string; label: string }>;
    equipment_exclusions: Array<{ item_id_prefix?: string; item_id?: string; reason?: string; included_in_preparation_category_id?: string }>;
  };
  premises: {
    default_scenario: PremisesScenario;
    scenarios: {
      purchase: {
        default_purchase_price_rub: number;
        hint: string;
      };
      rent: {
        default_monthly_rent_rub: number;
        default_prepayment_months: number;
        default_security_deposit_months: number;
      };
    };
  };
  area: {
    defaults: {
      total_area_m2: number;
      kitchen_and_production_area_m2: number;
      guest_area_m2: number;
    };
  };
  seating: {
    default_profile: SeatingProfileId;
    profiles: Array<{ id: SeatingProfileId; label: string; aria_label?: string; square_metres_per_seat: number }>;
  };
  furniture: {
    default_profile: FurnitureProfileId;
    profiles: Array<{ id: FurnitureProfileId; rub_per_seat: number }>;
  };
  equipment: {
    default_scenario: EquipmentScenarioId;
    scenarios: Array<{ id: EquipmentScenarioId; snapshot_key: ScenarioId }>;
  };
  preparation: {
    default_mode: PreparationMode;
    default_total_rub: number;
    categories: Array<{
      id: string;
      name: string;
      amount_rub: number;
      enabled_by_default: boolean;
      description: string;
    }>;
  };
  operating_reserve: {
    mode_selector_title: string;
    default_mode: OperatingExpenseMode;
    baseline_area_m2: number;
    modes: Array<{ id: OperatingExpenseMode; title: string; description: string }>;
    custom_field_label: string;
    custom_field_hint: string;
    default_months: number;
    default_accordion_open: boolean;
    monthly_total_rub: number;
    categories: Array<{ id: string; name: string; amount_rub: number; description: string }>;
  };
  contingency: { default_percent: number };
  form: { local_storage_key: string };
};

export const launchModel = capexData.investorStartModel as unknown as LaunchModel;

// Financial parameters of the launch (operating reserve, launch marketing, one-off launch items) come from
// the Financial Model projection and are injected by the page; the calculator never reads that projection
// itself because docs-platform's Financial Model imports this module for CAPEX.
export type LaunchFinancialInputs = {
  reserveMonths: number;
  operatingReserveRub: number;
  monthlyReserveBaseRub: number;
  launchMarketingRub: number;
  initialUniformRub: number;
  initialInventoryRub: number;
  videoSurveillanceRub: number;
  alarmRub: number;
};

export function defaultLaunchBudgetState(model = launchModel): LaunchBudgetState {
  return {
    premisesScenario: model.premises.default_scenario,
    purchasePriceRub: model.premises.scenarios.purchase.default_purchase_price_rub,
    monthlyRentRub: model.premises.scenarios.rent.default_monthly_rent_rub,
    prepaymentMonths: model.premises.scenarios.rent.default_prepayment_months,
    securityDepositMonths: model.premises.scenarios.rent.default_security_deposit_months,
    // The generic Launch Budget is also imported by the historical Financial
    // Model. The Base Object applies its approved planning term separately.
    rentFreeMonths: 0,
    totalAreaM2: model.area.defaults.total_area_m2,
    kitchenAreaM2: model.area.defaults.kitchen_and_production_area_m2,
    guestAreaM2: model.area.defaults.guest_area_m2,
    seatingProfileId: model.seating.default_profile,
    furnitureProfileId: model.furniture.default_profile,
    equipmentScenarioId: model.equipment.default_scenario,
    barEnabled: model.point_configuration.optional_modules.find(item => item.module_id === "MOD-BAR")?.default_enabled ?? false,
    growEnabled: model.point_configuration.optional_modules.find(item => item.module_id === "MOD-GROW")?.default_enabled ?? false,
    preparationMode: model.preparation.default_mode,
    preparationEnabledCategoryIds: model.preparation.categories
      .filter(item => item.enabled_by_default && !readyPremisesExcludedPreparationCategoryIds.has(item.id))
      .map(item => item.id),
    preparationManualRub: null,
    preparationAccordionOpen: false,
    operatingExpenseMode: model.operating_reserve.default_mode,
    customMonthlyOpexRub: null,
    operatingReserveMonths: model.operating_reserve.default_months,
    operatingReserveAccordionOpen: model.operating_reserve.default_accordion_open,
    contingencyPercent: model.contingency.default_percent,
  };
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonnegativeIntegerOrNull(value: unknown) {
  const finite = finiteOrNull(value);
  return finite === null ? null : Math.floor(finite);
}

export function normalizeLaunchBudgetState(value: unknown, model = launchModel): LaunchBudgetState {
  const defaults = defaultLaunchBudgetState(model);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<LaunchBudgetState>;
  const seatingIds = new Set(model.seating.profiles.map(item => item.id));
  const furnitureIds = new Set(model.furniture.profiles.map(item => item.id));
  const equipmentIds = new Set(model.equipment.scenarios.map(item => item.id));
  const preparationCategoryIds = new Set(model.preparation.categories.map(item => item.id));
  return {
    ...defaults,
    premisesScenario: input.premisesScenario === "rent" || input.premisesScenario === "purchase" ? input.premisesScenario : defaults.premisesScenario,
    purchasePriceRub: finiteOrNull(input.purchasePriceRub),
    monthlyRentRub: finiteOrNull(input.monthlyRentRub),
    prepaymentMonths: [1, 3, 12].includes(Number(input.prepaymentMonths)) ? Number(input.prepaymentMonths) : defaults.prepaymentMonths,
    securityDepositMonths: [1, 2, 3].includes(Number(input.securityDepositMonths)) ? Number(input.securityDepositMonths) : defaults.securityDepositMonths,
    rentFreeMonths: nonnegativeIntegerOrNull(input.rentFreeMonths) ?? defaults.rentFreeMonths,
    totalAreaM2: finiteOrNull(input.totalAreaM2),
    kitchenAreaM2: finiteOrNull(input.kitchenAreaM2),
    guestAreaM2: finiteOrNull(input.guestAreaM2),
    seatingProfileId: seatingIds.has(input.seatingProfileId as SeatingProfileId) ? input.seatingProfileId as SeatingProfileId : defaults.seatingProfileId,
    furnitureProfileId: furnitureIds.has(input.furnitureProfileId as FurnitureProfileId) ? input.furnitureProfileId as FurnitureProfileId : defaults.furnitureProfileId,
    equipmentScenarioId: equipmentIds.has(input.equipmentScenarioId as EquipmentScenarioId) ? input.equipmentScenarioId as EquipmentScenarioId : defaults.equipmentScenarioId,
    barEnabled: typeof input.barEnabled === "boolean" ? input.barEnabled : defaults.barEnabled,
    growEnabled: typeof input.growEnabled === "boolean" ? input.growEnabled : defaults.growEnabled,
    preparationMode: input.preparationMode === "manual" || input.preparationMode === "breakdown" ? input.preparationMode : defaults.preparationMode,
    preparationEnabledCategoryIds: Array.isArray(input.preparationEnabledCategoryIds)
      ? [...new Set(input.preparationEnabledCategoryIds.filter((id): id is string => typeof id === "string" && preparationCategoryIds.has(id)))]
      : defaults.preparationEnabledCategoryIds,
    preparationManualRub: finiteOrNull(input.preparationManualRub),
    preparationAccordionOpen: typeof input.preparationAccordionOpen === "boolean" ? input.preparationAccordionOpen : defaults.preparationAccordionOpen,
    operatingExpenseMode: input.operatingExpenseMode === "baseline" || input.operatingExpenseMode === "custom" ? input.operatingExpenseMode : defaults.operatingExpenseMode,
    customMonthlyOpexRub: nonnegativeIntegerOrNull(input.customMonthlyOpexRub),
    operatingReserveMonths: [3, 6, 9].includes(Number(input.operatingReserveMonths)) ? Number(input.operatingReserveMonths) : defaults.operatingReserveMonths,
    operatingReserveAccordionOpen: typeof input.operatingReserveAccordionOpen === "boolean" ? input.operatingReserveAccordionOpen : defaults.operatingReserveAccordionOpen,
    contingencyPercent: [5, 10, 15].includes(Number(input.contingencyPercent)) ? Number(input.contingencyPercent) : defaults.contingencyPercent,
  };
}

export function restoreLaunchBudgetState(value: unknown, model = launchModel): LaunchBudgetState {
  const defaults = defaultLaunchBudgetState(model);
  if (!value || typeof value !== "object") return defaults;
  const input = value as Partial<LaunchBudgetState> & { preparationRub?: unknown };
  const legacyEmptyState = input.premisesScenario === "purchase"
    && input.purchasePriceRub === null
    && input.monthlyRentRub === null
    && input.totalAreaM2 === null
    && input.kitchenAreaM2 === null
    && input.guestAreaM2 === null
    && input.prepaymentMonths === 1
    && input.securityDepositMonths === 2;
  if (legacyEmptyState) return defaults;
  const normalized = normalizeLaunchBudgetState(value, model);
  if (input.preparationMode === undefined && finiteOrNull(input.preparationRub) !== null) {
    normalized.preparationMode = "manual";
    normalized.preparationManualRub = finiteOrNull(input.preparationRub);
  }
  return normalized;
}

export function calculateOtherArea(totalAreaM2: number | null, kitchenAreaM2: number | null, guestAreaM2: number | null) {
  if (totalAreaM2 === null || kitchenAreaM2 === null || guestAreaM2 === null) return { invalid: false, value: null };
  const value = totalAreaM2 - kitchenAreaM2 - guestAreaM2;
  return { invalid: value < 0, value: value < 0 ? null : value };
}

export function calculateSeatCount(guestAreaM2: number | null, squareMetresPerSeat: number) {
  if (guestAreaM2 === null || squareMetresPerSeat <= 0) return null;
  return Math.floor(guestAreaM2 / squareMetresPerSeat);
}

export function calculateMonthlyOperatingExpenses(model = launchModel) {
  return Math.max(0, model.operating_reserve.categories.reduce((sum, category) => sum + category.amount_rub, 0));
}

export function calculateEffectiveMonthlyOperatingExpenses(state: LaunchBudgetState, model = launchModel) {
  return state.operatingExpenseMode === "custom" ? state.customMonthlyOpexRub : calculateMonthlyOperatingExpenses(model);
}

export function calculateOperatingReserve(state: LaunchBudgetState, model = launchModel, financials: LaunchFinancialInputs | null = null) {
  if (state.operatingExpenseMode === "custom") {
    return state.customMonthlyOpexRub === null ? null : state.customMonthlyOpexRub * state.operatingReserveMonths;
  }
  if (financials) return Math.round(financials.monthlyReserveBaseRub * state.operatingReserveMonths * 100) / 100;
  const monthlyOperatingExpensesRub = calculateEffectiveMonthlyOperatingExpenses(state, model);
  return monthlyOperatingExpensesRub === null ? null : monthlyOperatingExpensesRub * state.operatingReserveMonths;
}

export function calculateMonthlyReserveBase(state: LaunchBudgetState, model = launchModel, financials: LaunchFinancialInputs | null = null) {
  if (state.operatingExpenseMode === "custom") return state.customMonthlyOpexRub;
  return financials ? financials.monthlyReserveBaseRub : calculateMonthlyOperatingExpenses(model);
}

export function calculatePreparationBreakdown(state: LaunchBudgetState, model = launchModel) {
  const enabled = new Set(state.preparationEnabledCategoryIds);
  return Math.max(0, model.preparation.categories.reduce((sum, category) => sum + (enabled.has(category.id) ? category.amount_rub : 0), 0));
}

export function calculateEffectivePreparationAmount(state: LaunchBudgetState, model = launchModel) {
  return state.preparationMode === "manual" ? state.preparationManualRub : calculatePreparationBreakdown(state, model);
}

export function calculateLaunchBudget(state: LaunchBudgetState, model = launchModel, financials: LaunchFinancialInputs | null = null): LaunchBudgetResult {
  const seating = model.seating.profiles.find(item => item.id === state.seatingProfileId)!;
  const furniture = model.furniture.profiles.find(item => item.id === state.furnitureProfileId)!;
  const equipmentScenario = model.equipment.scenarios.find(item => item.id === state.equipmentScenarioId)!;
  const area = calculateOtherArea(state.totalAreaM2, state.kitchenAreaM2, state.guestAreaM2);
  const seatCount = calculateSeatCount(state.guestAreaM2, seating.square_metres_per_seat);
  const furnitureRub = seatCount === null ? null : seatCount * furniture.rub_per_seat;

  const activeModuleIds = new Set(model.point_configuration.required_modules);
  if (state.barEnabled) activeModuleIds.add("MOD-BAR");
  if (state.growEnabled) activeModuleIds.add("MOD-GROW");
  const pilot = capexData.pilotConfiguration;
  const parameters = emptyCapexParameters({
    outletCount: capexData.businessCapacity.prep_outlet_count,
    checksPerOutlet: capexData.businessCapacity.checks_per_outlet_per_day,
    fillingCount: pilot?.filling_count ?? null,
    cashierPostCount: pilot?.cashier_post_count ?? null,
    hotKitchenPostCount: pilot?.hot_kitchen_post_count ?? null,
    seatCount,
    guestAreaM2: state.guestAreaM2,
    serviceStationCount: pilot?.service_station_count ?? null,
    centralSupply: pilot?.central_supply_enabled ?? false,
  });
  const rows = buildCapexRows(activeModuleIds, equipmentScenario.snapshot_key, parameters);
  const equipment = summarizeEquipment(
    rows,
    model.point_configuration.equipment_exclusions.map(item => item.item_id_prefix).filter((value): value is string => Boolean(value)),
    model.point_configuration.equipment_exclusions.map(item => item.item_id).filter((value): value is string => Boolean(value)),
  );
  const incompleteRequiredModules = model.point_configuration.required_modules
    .map(id => capexData.modules.find(module => module.id === id))
    .filter(module => module?.status === "not_started")
    .map(module => ({ id: module!.id, name: module!.name }));

  const premisesEntryRub = state.premisesScenario === "purchase"
    ? state.purchasePriceRub
    : state.monthlyRentRub === null ? null : state.monthlyRentRub * (state.prepaymentMonths + state.securityDepositMonths);
  const securityDepositRub = state.premisesScenario === "rent" && state.monthlyRentRub !== null
    ? state.monthlyRentRub * state.securityDepositMonths
    : null;
  const monthlyOperatingExpensesRub = calculateMonthlyReserveBase(state, model, financials);
  const operatingReserveRub = calculateOperatingReserve(state, model, financials);
  const operatingReserveSource: LaunchBudgetResult["operatingReserveSource"] = state.operatingExpenseMode === "custom" ? "custom" : financials ? "financial_model" : "legacy_snapshot";
  const launchItems = financials ? [
    { id: "launch_marketing", name: "Маркетинг запуска", amountRub: financials.launchMarketingRub },
    { id: "initial_uniform", name: "Первичная форма", amountRub: financials.initialUniformRub },
    { id: "video_surveillance", name: "Видеонаблюдение", amountRub: financials.videoSurveillanceRub },
    { id: "alarm", name: "Охранная сигнализация", amountRub: financials.alarmRub },
    { id: "initial_inventory", name: "Первоначальный товарный запас", amountRub: financials.initialInventoryRub },
  ] : [];
  const launchMarketingRub = financials ? financials.launchMarketingRub : 0;
  const launchItemsRub = launchItems.reduce((sum, item) => sum + item.amountRub, 0);
  const preparationBreakdownRub = calculatePreparationBreakdown(state, model);
  const effectivePreparationAmount = calculateEffectivePreparationAmount(state, model);
  const contingencyBasis = equipment.total + (furnitureRub ?? 0) + (effectivePreparationAmount ?? 0);
  const contingencyRub = Math.round(contingencyBasis * state.contingencyPercent) / 100;

  const missing: string[] = [];
  if (area.invalid) missing.push("Площади кухни и посадочного зала превышают общую площадь");
  if (premisesEntryRub === null) missing.push(state.premisesScenario === "purchase" ? "Стоимость помещения" : "Аренда в месяц");
  if (furnitureRub === null) missing.push("Площадь посадочного зала и мебель");
  if (effectivePreparationAmount === null) missing.push("Подготовка помещения, инженерные работы и монтаж");
  if (operatingReserveRub === null) missing.push("Операционный запас");
  if (equipment.unpricedCount > 0) missing.push(`Позиции оборудования без цены: ${equipment.unpricedCount}`);
  if (equipment.quoteRequiredCount > 0) missing.push(`Коммерческие предложения по крупным позициям: ${equipment.quoteRequiredCount}`);
  for (const module of incompleteRequiredModules) missing.push(`Обязательный модуль не сформирован: ${module.name}`);

  const financingRequirementRub = area.invalid ? null : Math.round([premisesEntryRub, equipment.total, furnitureRub, effectivePreparationAmount, launchItemsRub, operatingReserveRub, contingencyRub]
    .reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100;
  const propertyAsset = state.premisesScenario === "purchase" ? state.purchasePriceRub ?? 0 : 0;
  const createdAssetsRub = propertyAsset + equipment.total + (furnitureRub ?? 0);
  const createdAssetsPartial = equipment.unpricedCount > 0 || furnitureRub === null || (state.premisesScenario === "purchase" && state.purchasePriceRub === null);

  return {
    areaInvalid: area.invalid,
    otherAreaM2: area.value,
    seatCount,
    furnitureRub,
    equipment,
    activeModuleIds: [...activeModuleIds],
    incompleteRequiredModules,
    premisesEntryRub,
    securityDepositRub,
    operatingReserveRub,
    operatingReserveSource,
    monthlyOperatingExpensesRub,
    launchMarketingRub,
    launchItemsRub,
    launchItems,
    preparationBreakdownRub,
    effectivePreparationRub: effectivePreparationAmount,
    contingencyRub,
    contingencyPartial: effectivePreparationAmount === null || furnitureRub === null,
    financingRequirementRub,
    createdAssetsRub,
    createdAssetsPartial,
    tiedFundsRub: state.premisesScenario === "rent" ? securityDepositRub : null,
    partial: missing.length > 0,
    missing,
  };
}
