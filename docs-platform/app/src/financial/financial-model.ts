import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { buildContentStateManifest } from "../capex/content-state.js";
import { checkWebSnapshot } from "../capex/web-snapshot.js";
import { platformRoot } from "../google/config.js";
import { canonical, sha256 } from "../governance/util.js";
import { buildRevenueContentState, readRevenueModel } from "../investor/revenue-model.js";
import { calculateLaunchBudget, defaultLaunchBudgetState, launchModel } from "../../../../src/lib/launch-budget.js";
import { buildCapexRows, capexData, emptyCapexParameters, summarizeEquipment } from "../../../../src/lib/capex-runtime.js";

const projectRoot = path.resolve(platformRoot, "..");
let capexSnapshotValidationError: string | null | undefined;

export const FINANCIAL_MODEL_PATH = "docs-platform/working/financial-model.yaml";
export const FINANCIAL_MODEL_SCHEMA_PATH = "docs-platform/schemas/financial-model.schema.json";
export const FINANCIAL_PROJECTION_SCHEMA_PATH = "docs-platform/schemas/financial-projection.schema.json";
export const FINANCIAL_PROJECTION_PATH = "docs-platform/generated/financial-model-projection.json";

export const FINANCIAL_CONTENT_SOURCE_PATHS = [
  FINANCIAL_MODEL_PATH,
  FINANCIAL_MODEL_SCHEMA_PATH,
  FINANCIAL_PROJECTION_SCHEMA_PATH,
  "docs-platform/app/src/financial/financial-model.ts",
  "docs-platform/app/src/financial/google-sheet.ts",
  "docs-platform/schemas/financial-google-sheets-payload.schema.json",
  "docs-platform/working/revenue-model.yaml",
  "docs-platform/working/investor-start-model.yaml",
  "docs-platform/working/configurations/CFG-PILOT-001/equipment-bom.yaml",
  "src/content/capex-configurator-data.json",
  "src/lib/capex-runtime.ts",
  "src/lib/launch-budget.ts",
] as const;

export type SalesScenarioId = "pessimistic" | "realistic" | "optimistic";
export type ContributionScenarioId = "reduced" | "standard";
export type TaxScenarioId = "base" | "conservative";
export type RealEstateScenarioId = "rent" | "purchase";

type CalculationOptions = {
  contributionScenario?: ContributionScenarioId;
  taxScenario?: TaxScenarioId;
  realEstateScenario?: RealEstateScenarioId;
  aggregatorShare?: number;
  checksPerDay?: number;
  averageCheckMultiplier?: number;
  wasteRate?: number;
  overallFoodCostRate?: number | null;
  laborMultiplier?: number;
  rentRub?: number;
  capexMultiplier?: number;
  propertyAppreciation?: number;
};

function rawFileSha256(relativePath: string, root = projectRoot) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
}

function normalizedSource(relativePath: string, bytes: string | Buffer) {
  const text = bytes.toString().replace(/\r\n?/g, "\n").normalize("NFC");
  if (relativePath.endsWith(".yaml")) return canonical(YAML.parse(text));
  if (relativePath.endsWith(".json")) return canonical(JSON.parse(text));
  return text;
}

export function buildFinancialContentState(root = projectRoot, overrides: Partial<Record<typeof FINANCIAL_CONTENT_SOURCE_PATHS[number], string | Buffer>> = {}) {
  const sourceFiles = FINANCIAL_CONTENT_SOURCE_PATHS.map(relativePath => ({
    path: relativePath,
    sha256: sha256(normalizedSource(relativePath, overrides[relativePath] ?? fs.readFileSync(path.join(root, relativePath)))),
  }));
  const input = { schema_version: 1, source_files: sourceFiles };
  return { ...input, content_state_sha256: sha256(canonical(input)) };
}

export function readFinancialModel(root = projectRoot): any {
  return YAML.parse(fs.readFileSync(path.join(root, FINANCIAL_MODEL_PATH), "utf8"));
}

function approximatelyEqual(actual: number, expected: number, tolerance = 1e-6) {
  return Math.abs(actual - expected) <= tolerance;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function scenarioHeadcountKey(scenario: SalesScenarioId) {
  return `${scenario}_headcount`;
}

export function calculateFoodCost(model = readFinancialModel()) {
  const segments = model.food_cost.kolobok_segments as any[];
  const averageKolobokCost = sum(segments.map(segment => Number(segment.price_rub) * Number(segment.food_cost_rate) * Number(segment.sales_share)));
  const revenue = readRevenueModel();
  const averageFoodPortionCost = averageKolobokCost * Number(revenue.product_model.food_mix.kolobok_share)
    + Number(model.food_cost.manches.price_rub) * Number(model.food_cost.manches.food_cost_rate) * Number(revenue.product_model.food_mix.manches_share);
  return {
    average_kolobok_cost_rub: round(averageKolobokCost, 4),
    average_food_portion_cost_rub: round(averageFoodPortionCost, 2),
    manches_cost_rub: round(Number(model.food_cost.manches.price_rub) * Number(model.food_cost.manches.food_cost_rate), 2),
    drink_cost_rub: Number(model.food_cost.drinks.unit_cost_rub),
    drink_food_cost_rate: Number(model.food_cost.drinks.unit_cost_rub) / Number(model.food_cost.drinks.price_rub),
  };
}

export function calculateStaffing(scenario: SalesScenarioId, contributionScenario: ContributionScenarioId = "reduced", model = readFinancialModel()) {
  const roles = model.staffing.roles as any[];
  const key = scenarioHeadcountKey(scenario);
  const headcount = sum(roles.map(role => Number(role[key])));
  const payroll = sum(roles.map(role => Number(role[key]) * Number(role.gross_salary_rub)));
  let employerContributions = 0;
  if (contributionScenario === "standard") {
    employerContributions = payroll * Number(model.staffing.employer_contributions.standard.rate);
  } else {
    const reduced = model.staffing.employer_contributions.reduced;
    const threshold = Number(reduced.mrot_rub) * Number(reduced.threshold_multiple);
    employerContributions = sum(roles.map(role => {
      const salary = Number(role.gross_salary_rub);
      const perEmployee = Math.min(salary, threshold) * Number(reduced.rate_below_threshold)
        + Math.max(salary - threshold, 0) * Number(reduced.rate_above_threshold);
      return Number(role[key]) * perEmployee;
    }));
  }
  const personnelReserve = (payroll + employerContributions) * Number(model.staffing.personnel_reserve_rate);
  return {
    headcount,
    payroll_rub: round(payroll),
    employer_contributions_rub: round(employerContributions),
    personnel_reserve_rub: round(personnelReserve),
    total_labor_rub: round(payroll + employerContributions + personnelReserve),
    rows: roles.map(role => ({
      id: role.id,
      role: role.role,
      headcount: Number(role[key]),
      gross_salary_rub: Number(role.gross_salary_rub),
      payroll_rub: Number(role[key]) * Number(role.gross_salary_rub),
      schedule: role.schedule,
      function: role.function,
    })),
  };
}

export function importedLaunchCapital(model = readFinancialModel()) {
  const state = {
    ...defaultLaunchBudgetState(),
    premisesScenario: "rent" as const,
    equipmentScenarioId: "BASE" as const,
    barEnabled: true,
    growEnabled: true,
    // The public Launch Budget intentionally opens in the Ready Premises
    // scenario. The Financial Model, however, is the full integrated-pilot
    // baseline and must import all eight canonical preparation categories.
    // Keep these selection semantics explicit: the 3.5m runtime preset is
    // not a replacement for the 11m canonical preparation reference.
    preparationEnabledCategoryIds: (launchModel as any).preparation.categories
      .filter((category: any) => category.enabled_by_default)
      .map((category: any) => category.id),
  };
  const result = calculateLaunchBudget(state);
  const equipmentBom = YAML.parse(fs.readFileSync(path.join(projectRoot, model.imports.capex.equipment_bom_path), "utf8"));
  const activeModuleIds = new Set<string>((equipmentBom.active_modules as any[]).map(item => item.module_id));
  if (model.imports.capex.bar_enabled) activeModuleIds.add("MOD-BAR"); else activeModuleIds.delete("MOD-BAR");
  if (model.imports.capex.grow_enabled) activeModuleIds.add("MOD-GROW"); else activeModuleIds.delete("MOD-GROW");
  const pilot = capexData.pilotConfiguration;
  const parameters = emptyCapexParameters({
    outletCount: capexData.businessCapacity.prep_outlet_count,
    checksPerOutlet: capexData.businessCapacity.checks_per_outlet_per_day,
    fillingCount: pilot?.filling_count ?? null,
    cashierPostCount: pilot?.cashier_post_count ?? null,
    hotKitchenPostCount: pilot?.hot_kitchen_post_count ?? null,
    seatCount: result.seatCount,
    guestAreaM2: state.guestAreaM2,
    serviceStationCount: pilot?.service_station_count ?? null,
    alcoholEnabled: Boolean(model.imports.capex.alcohol_enabled),
    centralSupply: pilot?.central_supply_enabled ?? false,
  });
  const equipmentRows = buildCapexRows(activeModuleIds, "base", parameters);
  const equipment = summarizeEquipment(equipmentRows, model.imports.capex.excluded_item_prefixes, model.imports.capex.excluded_item_ids);
  const preparationCategories = (launchModel as any).preparation.categories as any[];
  const engineeringIds = new Set(model.depreciation.preparation_engineering_category_ids as string[]);
  const engineeringPreparation = sum(preparationCategories.filter(item => engineeringIds.has(item.id)).map(item => Number(item.amount_rub)));
  const fitOutPreparation = sum(preparationCategories.filter(item => !engineeringIds.has(item.id)).map(item => Number(item.amount_rub)));

  const equipmentDepreciation = equipment.rows
    .filter(row => row.independentProcurement && row.lineTotal !== null && row.quantity !== 0)
    .map(row => {
      let category = "UNCLASSIFIED";
      let usefulLifeYears = 5;
      let mappingStatus = "mapping_requires_review";
      if (["CAPEX-01-001", "CAPEX-01-002"].includes(row.item.id)) {
        category = "COLD_FREEZER";
        usefulLifeYears = 10;
        mappingStatus = "mapped";
      } else if (row.moduleIds.some(id => id === "MOD-POS" || id === "MOD-KDS")) {
        category = "POS_KDS_IT_SMALL";
        usefulLifeYears = 3;
        mappingStatus = "mapped";
      } else if (row.moduleIds.includes("MOD-GROW")) {
        category = "GROW";
        usefulLifeYears = 5;
        mappingStatus = "mapped";
      } else if (row.moduleIds.some(id => ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-WASH", "MOD-TAKEAWAY"].includes(id))) {
        category = "MAIN_KITCHEN";
        usefulLifeYears = 5;
        mappingStatus = "mapped";
      }
      return { item_id: row.item.id, name: row.item.name, amount_rub: row.lineTotal!, category, useful_life_years: usefulLifeYears, mapping_status: mappingStatus };
    });

  const depreciationAssets = [
    ...equipmentDepreciation,
    { item_id: "FURNITURE", name: "Мебель посадочного зала", amount_rub: result.furnitureRub ?? 0, category: "FURNITURE", useful_life_years: 5, mapping_status: "mapped" },
    { item_id: "PREP-ENGINEERING", name: "Инженерные системы подготовки помещения", amount_rub: engineeringPreparation, category: "ENGINEERING", useful_life_years: 10, mapping_status: "mapped" },
    { item_id: "PREP-FIT-OUT", name: "Подготовка помещения / fit-out", amount_rub: fitOutPreparation, category: "FIT_OUT", useful_life_years: 7, mapping_status: "mapped" },
    { item_id: "LAUNCH-VIDEO", name: "Видеонаблюдение", amount_rub: Number(model.launch_investment.video_surveillance_rub), category: "POS_KDS_IT_SMALL", useful_life_years: 3, mapping_status: "mapped" },
    { item_id: "LAUNCH-ALARM", name: "Охранная сигнализация", amount_rub: Number(model.launch_investment.alarm_rub), category: "POS_KDS_IT_SMALL", useful_life_years: 3, mapping_status: "mapped" },
  ];
  const monthlyDepreciation = sum(depreciationAssets.map(asset => asset.amount_rub / (asset.useful_life_years * 12)));
  return {
    equipment_rub: round(equipment.total),
    equipment_control_rub_rounded: Math.round(equipment.total),
    equipment_bom_configuration_id: equipmentBom.document.configuration_id,
    equipment_active_module_ids: [...activeModuleIds].sort(),
    equipment_coverage_count: equipment.coverageCount,
    equipment_unpriced_count: equipment.unpricedCount,
    equipment_quote_required_count: equipment.quoteRequiredCount,
    furniture_rub: round(result.furnitureRub ?? 0),
    preparation_rub: round(result.effectivePreparationRub ?? 0),
    contingency_rub: round(result.contingencyRub),
    seat_count: result.seatCount,
    depreciation_assets: depreciationAssets,
    monthly_depreciation_rub: round(monthlyDepreciation),
    mapping_requires_review_count: depreciationAssets.filter(asset => asset.mapping_status === "mapping_requires_review").length,
  };
}

function opexEntry(model: any, id: string) {
  const entry = (model.opex.entries as any[]).find(item => item.id === id);
  if (!entry) throw new Error(`Missing OPEX entry ${id}.`);
  return entry;
}

function monthlyIrr(cashFlows: number[]) {
  const npv = (rate: number) => cashFlows.reduce((value, cash, index) => value + cash / ((1 + rate) ** index), 0);
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  let highValue = npv(high);
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if (lowValue * highValue > 0) return null;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-7) return mid;
    if (lowValue * value <= 0) {
      high = mid;
      highValue = value;
    } else {
      low = mid;
      lowValue = value;
    }
  }
  return (low + high) / 2;
}

function firstPaybackMonth(cashFlows: number[]) {
  let cumulative = 0;
  for (let month = 0; month < cashFlows.length; month += 1) {
    cumulative += cashFlows[month];
    if (cumulative >= 0) return month;
  }
  return null;
}

function presentValue(cashFlows: number[], annualDiscountRate: number) {
  const monthlyRate = (1 + annualDiscountRate) ** (1 / 12) - 1;
  return cashFlows.reduce((value, cash, month) => value + cash / ((1 + monthlyRate) ** month), 0);
}

type MonthlyDriver = { month: number; calendar_month: number; ramp_factor: number; seasonality_factor: number; volume_factor: number };

function fixedOpexEntries(model: any) {
  return (model.opex.entries as any[]).filter(entry => entry.behavior === "fixed" && entry.applies_to !== "rent");
}

function scenarioFormulaEntry(model: any, id: string) {
  const entry = opexEntry(model, id);
  if (entry.behavior !== "scenario_formula") throw new Error(`OPEX entry ${id} must be a scenario_formula entry.`);
  return entry;
}

function variableRateEntry(model: any, id: string, field: string) {
  const entry = opexEntry(model, id);
  const value = Number(entry[field]);
  if (!Number.isFinite(value)) throw new Error(`OPEX entry ${id} must define a numeric ${field}.`);
  return value;
}

function rampFactorFor(model: any, operatingMonth: number) {
  const profile = (model.model.ramp_up_profile as any[])
    .map(item => ({ month: Number(item.month), factor: Number(item.ramp_factor) }))
    .sort((left, right) => left.month - right.month);
  if (!profile.length) throw new Error("Financial Model requires a ramp-up profile.");
  const exact = profile.find(item => item.month === operatingMonth);
  if (exact) return exact.factor;
  const last = profile[profile.length - 1];
  if (operatingMonth > last.month) return last.factor;
  throw new Error(`Ramp-up profile has no factor for operating month ${operatingMonth}.`);
}

function seasonalityFactorFor(model: any, calendarMonth: number) {
  const row = (model.model.seasonality_profile as any[]).find(item => Number(item.month) === calendarMonth);
  if (!row) throw new Error(`Seasonality profile has no coefficient for calendar month ${calendarMonth}.`);
  return Number(row.seasonality_coefficient);
}

function monthlyDrivers(model: any): MonthlyDriver[] {
  const horizon = Number(model.model.horizon_months);
  const openingMonth = Number(model.model.opening_month);
  return Array.from({ length: horizon }, (_, index) => {
    const month = index + 1;
    const calendarMonth = ((openingMonth - 1 + index) % 12) + 1;
    const ramp = rampFactorFor(model, month);
    const seasonality = seasonalityFactorFor(model, calendarMonth);
    return { month, calendar_month: calendarMonth, ramp_factor: ramp, seasonality_factor: seasonality, volume_factor: ramp * seasonality };
  });
}

function periodTotals(months: any[], fromMonth: number, toMonth: number) {
  const slice = months.filter(item => item.month >= fromMonth && item.month <= toMonth);
  const total = (key: string) => round(sum(slice.map(item => Number(item[key]))));
  const netRevenue = total("net_revenue_rub");
  const ebitda = total("ebitda_rub");
  return {
    from_month: fromMonth,
    to_month: toMonth,
    gross_revenue_rub: total("gross_revenue_rub"),
    net_revenue_rub: netRevenue,
    raw_materials_rub: total("raw_materials_rub"),
    labor_rub: total("labor_rub"),
    ebitda_rub: ebitda,
    ebitda_margin: netRevenue === 0 ? 0 : ebitda / netRevenue,
    tax_due_rub: total("tax_due_rub"),
    free_cash_flow_rub: total("operating_free_cash_flow_rub"),
    prepaid_rent_release_rub: total("prepaid_rent_release_rub"),
    net_cash_flow_rub: total("net_cash_flow_rub"),
  };
}

export function calculateFinancialScenario(scenario: SalesScenarioId, options: CalculationOptions = {}, model = readFinancialModel()) {
  const revenueModel = readRevenueModel();
  const traffic = revenueModel.traffic.scenarios.find((item: any) => item.id === scenario);
  if (!traffic) throw new Error(`Unknown sales scenario ${scenario}.`);
  const checksPerDay = Number(options.checksPerDay ?? traffic.checks_per_day);
  const daysPerMonth = Number(model.model.days_per_month);
  const averageCheck = Number(revenueModel.product_model.average_check_rub) * Number(options.averageCheckMultiplier ?? 1);
  const matureGrossRevenue = checksPerDay * daysPerMonth * averageCheck;
  const taxScenario = options.taxScenario ?? model.model.default_tax_scenario as TaxScenarioId;
  const taxRules = model.tax.scenarios[taxScenario];
  const vatRate = taxScenario === "conservative" ? Number(taxRules.vat_rate) : 0;

  const protectedFormula = model.food_cost.protected_formula;
  const rawMaterialsRate = Number(options.overallFoodCostRate ?? protectedFormula.raw_materials_rate);
  const protectedLaborRate = Number(protectedFormula.protected_labor_rate);
  const wasteRate = Number(options.wasteRate ?? model.food_cost.waste.default_rate);
  const administrativeReserveRate = variableRateEntry(model, "ADMINISTRATIVE_RESERVE", "rate_of_net_revenue");
  const acquiringRate = Number(opexEntry(model, "ACQUIRING").rate_of_gross_revenue);
  const aggregatorShare = Number(options.aggregatorShare ?? model.model.default_aggregator_share);
  const aggregatorRate = Number(opexEntry(model, "AGGREGATORS").commission_rate);

  const food = calculateFoodCost(model);
  const matureFoodPortions = checksPerDay * daysPerMonth * Number(revenueModel.product_model.food_portions_per_check);
  const matureDrinks = checksPerDay * daysPerMonth * Number(revenueModel.product_model.drinks.per_check);
  const matureRecipeRawMaterials = matureFoodPortions * food.average_food_portion_cost_rub + matureDrinks * food.drink_cost_rub;
  const maturePackaging = Number(model.packaging.baseline_monthly_rub) * checksPerDay / Number(model.packaging.baseline_checks_per_day);

  const staffingScenario: SalesScenarioId = options.checksPerDay !== undefined ? (checksPerDay >= 450 ? "optimistic" : "realistic") : scenario;
  const staffing = calculateStaffing(staffingScenario, options.contributionScenario ?? model.model.default_contribution_scenario, model);
  const laborMultiplier = Number(options.laborMultiplier ?? 1);
  const calculatedStaffingLabor = staffing.total_labor_rub * laborMultiplier;
  const cashPayroll = (staffing.payroll_rub + staffing.employer_contributions_rub) * laborMultiplier;

  const realEstateScenario = options.realEstateScenario ?? model.model.default_real_estate_scenario as RealEstateScenarioId;
  const rent = realEstateScenario === "rent" ? Number(options.rentRub ?? model.real_estate.scenarios.rent.monthly_rent_rub) : 0;

  const fixedEntries = Object.fromEntries(fixedOpexEntries(model).map(entry => [entry.id, Number(entry.amount_rub)]));
  const fixedOpexWithoutLaborAndRent = sum(Object.values(fixedEntries));
  const marketingRule = scenarioFormulaEntry(model, "MARKETING");
  const householdRule = scenarioFormulaEntry(model, "HOUSEHOLD");
  const marketingFor = (netRevenue: number, operatingMonth: number | null) => {
    const formulaValue = Number(marketingRule.fixed_amount_rub) + netRevenue * Number(marketingRule.rate_of_net_revenue);
    const withinFloor = operatingMonth !== null && operatingMonth <= Number(marketingRule.ramp_up_floor_months);
    return withinFloor ? Math.max(Number(marketingRule.ramp_up_floor_rub), formulaValue) : formulaValue;
  };
  const householdFor = (actualChecksPerDay: number) =>
    Number(householdRule.fixed_amount_rub) + Number(householdRule.variable_amount_rub) * actualChecksPerDay / Number(householdRule.baseline_checks_per_day);

  const capex = importedLaunchCapital(model);
  const depreciation = capex.monthly_depreciation_rub;
  const maintenanceCapex = (capex.equipment_rub + capex.furniture_rub) * Number(model.maintenance_capex.annual_rate) / 12;
  const prepaidMonths = realEstateScenario === "rent" ? Number(model.real_estate.scenarios.rent.prepayment_months) : 0;

  function monthFromVolume(volume: number, operatingMonth: number | null = null) {
    const grossRevenue = matureGrossRevenue * volume;
    const vat = grossRevenue * vatRate / (1 + vatRate);
    const netRevenue = grossRevenue - vat;
    const rawMaterials = netRevenue * rawMaterialsRate;
    const waste = rawMaterials * wasteRate;
    const packaging = maturePackaging * volume;
    const acquiring = grossRevenue * acquiringRate;
    const aggregator = grossRevenue * aggregatorShare * aggregatorRate;
    const administrativeReserve = netRevenue * administrativeReserveRate;
    const protectedLaborFloor = netRevenue * protectedLaborRate;
    const labor = Math.max(calculatedStaffingLabor, protectedLaborFloor);
    const marketing = marketingFor(netRevenue, operatingMonth);
    const household = householdFor(checksPerDay * volume);
    const scenarioOpex = marketing + household;
    const grossProfit = netRevenue - rawMaterials - waste - packaging;
    const ebitda = grossProfit - labor - rent - acquiring - aggregator - administrativeReserve - scenarioOpex - fixedOpexWithoutLaborAndRent;
    const ebit = ebitda - depreciation;
    const eligibleOperatingCashExpenses = rawMaterials + waste + packaging + cashPayroll
      + rent + acquiring + aggregator + administrativeReserve + scenarioOpex + fixedOpexWithoutLaborAndRent;
    const taxableBase = Math.max(netRevenue - eligibleOperatingCashExpenses, 0);
    const regularUsn = taxableBase * Number(taxRules.usn_income_less_expenses_rate);
    const minimumUsn = netRevenue * Number(taxRules.minimum_usn_income_rate);
    const taxDue = Math.max(regularUsn, minimumUsn);
    const operatingFreeCashFlow = ebitda - taxDue - maintenanceCapex;
    const prepaidRentRelease = operatingMonth !== null && realEstateScenario === "rent" && operatingMonth <= prepaidMonths ? rent : 0;
    return {
      volume_factor: round(volume, 6),
      checks_per_day: round(checksPerDay * volume, 2),
      gross_revenue_rub: round(grossRevenue),
      vat_rub: round(vat),
      net_revenue_rub: round(netRevenue),
      raw_materials_rub: round(rawMaterials),
      waste_rub: round(waste),
      packaging_rub: round(packaging),
      gross_profit_rub: round(grossProfit),
      gross_margin: netRevenue === 0 ? 0 : grossProfit / netRevenue,
      calculated_staffing_labor_rub: round(calculatedStaffingLabor),
      protected_labor_floor_rub: round(protectedLaborFloor),
      protected_labor_binding: protectedLaborFloor > calculatedStaffingLabor,
      labor_rub: round(labor),
      rent_rub: round(rent),
      acquiring_rub: round(acquiring),
      aggregator_rub: round(aggregator),
      administrative_reserve_rub: round(administrativeReserve),
      marketing_rub: round(marketing),
      marketing_floor_binding: operatingMonth !== null && operatingMonth <= Number(marketingRule.ramp_up_floor_months) && Number(marketingRule.ramp_up_floor_rub) > Number(marketingRule.fixed_amount_rub) + netRevenue * Number(marketingRule.rate_of_net_revenue),
      household_rub: round(household),
      fixed_opex_without_labor_rent_rub: round(fixedOpexWithoutLaborAndRent),
      ebitda_rub: round(ebitda),
      ebitda_margin: netRevenue === 0 ? 0 : ebitda / netRevenue,
      depreciation_rub: round(depreciation),
      ebit_rub: round(ebit),
      taxable_base_management_proxy_rub: round(taxableBase),
      regular_usn_rub: round(regularUsn),
      minimum_usn_rub: round(minimumUsn),
      tax_due_rub: round(taxDue),
      net_operating_result_rub: round(ebit - taxDue),
      maintenance_capex_rub: round(maintenanceCapex),
      operating_free_cash_flow_rub: round(operatingFreeCashFlow),
      prepaid_rent_release_rub: round(prepaidRentRelease),
      net_cash_flow_rub: round(operatingFreeCashFlow + prepaidRentRelease),
    };
  }

  const mature = monthFromVolume(1);


  const reserveMonths = Number(model.operating_reserve.default_months);
  const uncoveredRentMonths = Math.max(reserveMonths - prepaidMonths, 0);
  const matureScenarioOpex = mature.marketing_rub + mature.household_rub;
  const fixedReserve = (calculatedStaffingLabor + fixedOpexWithoutLaborAndRent + matureScenarioOpex) * reserveMonths + rent * uncoveredRentMonths;
  const fullReserve = fixedReserve
    + (mature.raw_materials_rub + mature.waste_rub + mature.packaging_rub + mature.acquiring_rub
      + mature.aggregator_rub + mature.administrative_reserve_rub + mature.tax_due_rub) * reserveMonths;

  const capexMultiplier = Number(options.capexMultiplier ?? 1);
  const fixedAssetCapexBeforeContingency = (capex.equipment_rub + capex.furniture_rub + capex.preparation_rub
    + Number(model.launch_investment.video_surveillance_rub) + Number(model.launch_investment.alarm_rub)) * capexMultiplier;
  const contingency = (capex.equipment_rub + capex.furniture_rub + capex.preparation_rub) * capexMultiplier * Number(model.launch_investment.contingency_default_rate);
  const launchMarketing = Number(model.launch_investment.launch_marketing_rub);
  const prepaidRent = realEstateScenario === "rent" ? rent * prepaidMonths : 0;
  const securityDeposit = realEstateScenario === "rent" ? rent * Number(model.real_estate.scenarios.rent.security_deposit_months) : 0;
  const restaurantInvestedCapital = fixedAssetCapexBeforeContingency + Number(model.launch_investment.initial_uniform_rub)
    + Number(model.launch_investment.initial_inventory_rub) + Number(model.launch_investment.other_launch_costs_rub)
    + launchMarketing + contingency + prepaidRent + securityDeposit + fixedReserve;

  const drivers = monthlyDrivers(model);
  let cumulative = -round(restaurantInvestedCapital);
  const monthlyFull = drivers.map(driver => {
    const row = monthFromVolume(driver.volume_factor, driver.month);
    cumulative = round(cumulative + row.net_cash_flow_rub);
    return {
      month: driver.month,
      calendar_month: driver.calendar_month,
      ramp_factor: driver.ramp_factor,
      seasonality_factor: driver.seasonality_factor,
      ...row,
      cumulative_net_cash_flow_rub: cumulative,
    };
  });
  const monthly = monthlyFull.map(row => ({
    month: row.month,
    calendar_month: row.calendar_month,
    ramp_factor: row.ramp_factor,
    seasonality_factor: row.seasonality_factor,
    gross_revenue_rub: row.gross_revenue_rub,
    net_revenue_rub: row.net_revenue_rub,
    raw_materials_rub: row.raw_materials_rub,
    labor_rub: row.labor_rub,
    administrative_reserve_rub: row.administrative_reserve_rub,
    marketing_rub: row.marketing_rub,
    household_rub: row.household_rub,
    ebitda_rub: row.ebitda_rub,
    ebitda_margin: row.ebitda_margin,
    tax_due_rub: row.tax_due_rub,
    operating_free_cash_flow_rub: row.operating_free_cash_flow_rub,
    prepaid_rent_release_rub: row.prepaid_rent_release_rub,
    net_cash_flow_rub: row.net_cash_flow_rub,
    cumulative_net_cash_flow_rub: row.cumulative_net_cash_flow_rub,
  }));
  const monthlyDetailed = monthlyFull.slice(0, Number(model.model.detailed_months));

  const realEstateInvestment = realEstateScenario === "purchase" ? Number(model.real_estate.scenarios.purchase.purchase_price_rub) : 0;
  const totalInvestedCapital = restaurantInvestedCapital + realEstateInvestment;
  const horizon = Number(model.model.horizon_months);
  const restaurantCashFlows = [-round(restaurantInvestedCapital), ...monthlyFull.map(row => row.net_cash_flow_rub)];
  const appreciation = Number(options.propertyAppreciation ?? model.real_estate.appreciation_default);
  const propertyResidualValue = realEstateScenario === "purchase" ? realEstateInvestment * ((1 + appreciation) ** (horizon / 12)) : 0;
  const combinedCashFlows = restaurantCashFlows.map((cash, index) => index === 0 ? round(cash - realEstateInvestment) : index === horizon ? round(cash + propertyResidualValue) : cash);
  const restaurantMonthlyIrr = monthlyIrr(restaurantCashFlows);
  const combinedMonthlyIrr = monthlyIrr(combinedCashFlows);
  const realEstateCashFlows = [-realEstateInvestment, ...Array(horizon - 1).fill(0), propertyResidualValue];
  const realEstateMonthlyIrr = realEstateInvestment > 0 ? monthlyIrr(realEstateCashFlows) : null;

  const year1 = periodTotals(monthlyFull, 1, 12);
  const matureYear = periodTotals(monthlyFull, 13, 24);

  const vatPerCheck = averageCheck * vatRate / (1 + vatRate);
  const netCheck = averageCheck - vatPerCheck;
  const rawPerCheck = netCheck * rawMaterialsRate;
  const wastePerCheck = rawPerCheck * wasteRate;
  const packagingPerCheck = maturePackaging / (checksPerDay * daysPerMonth);
  const acquiringPerCheck = averageCheck * acquiringRate;
  const aggregatorPerCheck = averageCheck * aggregatorShare * aggregatorRate;
  const administrativeReservePerCheck = netCheck * administrativeReserveRate;
  const marketingVariablePerCheck = netCheck * Number(marketingRule.rate_of_net_revenue);
  const householdVariablePerCheck = Number(householdRule.variable_amount_rub) / Number(householdRule.baseline_checks_per_day) / daysPerMonth;
  const minimumUsnPerCheck = netCheck * Number(taxRules.minimum_usn_income_rate);
  const contributionPerCheck = averageCheck - vatPerCheck - rawPerCheck - wastePerCheck - packagingPerCheck
    - acquiringPerCheck - aggregatorPerCheck - administrativeReservePerCheck - marketingVariablePerCheck - householdVariablePerCheck - minimumUsnPerCheck;
  const fixedCostsForBreakEven = calculatedStaffingLabor + rent + fixedOpexWithoutLaborAndRent
    + Number(marketingRule.fixed_amount_rub) + Number(householdRule.fixed_amount_rub);
  const breakEvenChecksPerDay = fixedCostsForBreakEven / contributionPerCheck / daysPerMonth;
  const breakEvenNetRevenue = breakEvenChecksPerDay * daysPerMonth * netCheck;

  return {
    scenario,
    checks_per_day: checksPerDay,
    average_check_rub: round(averageCheck),
    gross_revenue_rub: mature.gross_revenue_rub,
    vat_rub: mature.vat_rub,
    net_revenue_rub: mature.net_revenue_rub,
    food_portions_per_month: round(matureFoodPortions),
    drinks_per_month: round(matureDrinks),
    raw_materials_rub: mature.raw_materials_rub,
    raw_materials_rate: rawMaterialsRate,
    recipe_based_raw_materials_rub: round(matureRecipeRawMaterials),
    recipe_based_raw_materials_rate: mature.net_revenue_rub === 0 ? 0 : matureRecipeRawMaterials / mature.net_revenue_rub,
    waste_rub: mature.waste_rub,
    packaging_rub: mature.packaging_rub,
    gross_profit_rub: mature.gross_profit_rub,
    gross_margin: mature.gross_margin,
    staffing,
    calculated_staffing_labor_rub: mature.calculated_staffing_labor_rub,
    protected_labor_floor_rub: mature.protected_labor_floor_rub,
    protected_labor_binding: mature.protected_labor_binding,
    labor_rub: mature.labor_rub,
    rent_rub: mature.rent_rub,
    acquiring_rub: mature.acquiring_rub,
    aggregator_rub: mature.aggregator_rub,
    administrative_reserve_rub: mature.administrative_reserve_rub,
    marketing_rub: mature.marketing_rub,
    marketing_formula: { fixed_amount_rub: Number(marketingRule.fixed_amount_rub), rate_of_net_revenue: Number(marketingRule.rate_of_net_revenue), ramp_up_floor_rub: Number(marketingRule.ramp_up_floor_rub), ramp_up_floor_months: Number(marketingRule.ramp_up_floor_months) },
    household_rub: mature.household_rub,
    household_formula: { fixed_amount_rub: Number(householdRule.fixed_amount_rub), variable_amount_rub: Number(householdRule.variable_amount_rub), baseline_checks_per_day: Number(householdRule.baseline_checks_per_day) },
    fixed_opex_without_labor_rent_rub: mature.fixed_opex_without_labor_rent_rub,
    opex_entries_rub: fixedEntries,
    ebitda_rub: mature.ebitda_rub,
    ebitda_margin: mature.ebitda_margin,
    depreciation_rub: mature.depreciation_rub,
    ebit_rub: mature.ebit_rub,
    taxable_base_management_proxy_rub: mature.taxable_base_management_proxy_rub,
    regular_usn_rub: mature.regular_usn_rub,
    minimum_usn_rub: mature.minimum_usn_rub,
    tax_due_rub: mature.tax_due_rub,
    net_operating_result_rub: mature.net_operating_result_rub,
    maintenance_capex_rub: mature.maintenance_capex_rub,
    operating_free_cash_flow_rub: mature.operating_free_cash_flow_rub,
    monthly,
    monthly_detailed: monthlyDetailed,
    year_1: year1,
    mature_year: matureYear,
    fixed_opex_reserve_rub: round(fixedReserve),
    full_operating_reserve_rub: round(fullReserve),
    initial_inventory_rub: Number(model.launch_investment.initial_inventory_rub),
    initial_uniform_rub: Number(model.launch_investment.initial_uniform_rub),
    video_surveillance_rub: Number(model.launch_investment.video_surveillance_rub),
    alarm_rub: Number(model.launch_investment.alarm_rub),
    launch_marketing_rub: launchMarketing,
    capex,
    restaurant_invested_capital_rub: round(restaurantInvestedCapital),
    real_estate_investment_rub: round(realEstateInvestment),
    total_invested_capital_rub: round(totalInvestedCapital),
    break_even_revenue_rub: round(breakEvenNetRevenue),
    break_even_checks_per_day: round(breakEvenChecksPerDay, 2),
    break_even_protected_labor_binding: breakEvenNetRevenue * protectedLaborRate > calculatedStaffingLabor,
    restaurant_payback_month: firstPaybackMonth(restaurantCashFlows),
    restaurant_roi_annual: matureYear.free_cash_flow_rub / restaurantInvestedCapital,
    restaurant_roi_annual_year_1: year1.free_cash_flow_rub / restaurantInvestedCapital,
    restaurant_irr_annual: restaurantMonthlyIrr === null ? null : (1 + restaurantMonthlyIrr) ** 12 - 1,
    restaurant_npv_rub: round(presentValue(restaurantCashFlows, Number(model.model.discount_rate_annual))),
    property_appreciation: appreciation,
    property_residual_value_rub: round(propertyResidualValue),
    real_estate_return: realEstateInvestment === 0 ? null : propertyResidualValue / realEstateInvestment - 1,
    real_estate_irr_annual: realEstateMonthlyIrr === null ? null : (1 + realEstateMonthlyIrr) ** 12 - 1,
    combined_payback_month: firstPaybackMonth(combinedCashFlows),
    combined_irr_annual: combinedMonthlyIrr === null ? null : (1 + combinedMonthlyIrr) ** 12 - 1,
    combined_npv_rub: round(presentValue(combinedCashFlows, Number(model.model.discount_rate_annual))),
    restaurant_cash_flows: restaurantCashFlows,
    combined_cash_flows: combinedCashFlows,
    tax_scenario: taxScenario,
    contribution_scenario: options.contributionScenario ?? model.model.default_contribution_scenario,
    real_estate_scenario: realEstateScenario,
    aggregator_share: aggregatorShare,
  };
}

export function buildSensitivity(model = readFinancialModel()) {
  const checksAverageCheck = (model.sensitivity.checks_per_day as number[]).map(checks => ({
    checks_per_day: checks,
    values: (model.sensitivity.average_check_multipliers as number[]).map(multiplier => {
      const result = calculateFinancialScenario("realistic", { checksPerDay: checks, averageCheckMultiplier: multiplier }, model);
      return { average_check_multiplier: multiplier, ebitda_rub: result.ebitda_rub, ebitda_margin: result.ebitda_margin, payback_month: result.restaurant_payback_month };
    }),
  }));
  const oneDimensional = (values: number[], calculate: (value: number) => ReturnType<typeof calculateFinancialScenario>) => values.map(value => {
    const result = calculate(value);
    return { value, ebitda_rub: result.ebitda_rub, ebitda_margin: result.ebitda_margin, payback_month: result.restaurant_payback_month };
  });
  return {
    checks_average_check: checksAverageCheck,
    food_cost: oneDimensional(model.sensitivity.overall_food_cost_rates, value => calculateFinancialScenario("realistic", { overallFoodCostRate: value }, model)),
    labor: oneDimensional(model.sensitivity.labor_multipliers, value => calculateFinancialScenario("realistic", { laborMultiplier: value }, model)),
    rent: oneDimensional(model.sensitivity.rent_rub, value => calculateFinancialScenario("realistic", { rentRub: value }, model)),
    capex: oneDimensional(model.sensitivity.capex_multipliers, value => calculateFinancialScenario("realistic", { capexMultiplier: value }, model)),
    aggregators: oneDimensional(model.sensitivity.aggregator_shares, value => calculateFinancialScenario("realistic", { aggregatorShare: value }, model)),
    vat: ["base", "conservative"].map(value => {
      const result = calculateFinancialScenario("realistic", { taxScenario: value as TaxScenarioId }, model);
      return { value, vat_rub: result.vat_rub, tax_due_rub: result.tax_due_rub, ebitda_rub: result.ebitda_rub, ebitda_margin: result.ebitda_margin };
    }),
    contributions: ["reduced", "standard"].map(value => {
      const result = calculateFinancialScenario("realistic", { contributionScenario: value as ContributionScenarioId }, model);
      return { value, labor_rub: result.labor_rub, ebitda_rub: result.ebitda_rub, ebitda_margin: result.ebitda_margin };
    }),
  };
}

export function solveInvestmentBreakEven(model = readFinancialModel(), options: { tolerance?: number; low?: number; high?: number } = {}) {
  const tolerance = options.tolerance ?? 0.01;
  const npvAt = (checks: number) => calculateFinancialScenario("realistic", { checksPerDay: checks }, model).restaurant_npv_rub;
  let low = options.low ?? 50;
  let high = options.high ?? 900;
  if (npvAt(low) >= 0) return { min_checks_per_day: low, npv_rub: npvAt(low), status: "npv_non_negative_at_lower_bound", iterations: 0 };
  if (npvAt(high) < 0) return { min_checks_per_day: null, npv_rub: npvAt(high), status: "npv_negative_at_upper_bound", iterations: 0 };
  let iterations = 0;
  while (high - low > tolerance && iterations < 60) {
    const mid = (low + high) / 2;
    if (npvAt(mid) >= 0) high = mid; else low = mid;
    iterations += 1;
  }
  const solved = Math.ceil(high * 100) / 100;
  const at = calculateFinancialScenario("realistic", { checksPerDay: solved }, model);
  return {
    min_checks_per_day: solved,
    npv_rub: at.restaurant_npv_rub,
    status: "solved",
    iterations,
    discount_rate_annual: Number(model.model.discount_rate_annual),
    horizon_months: Number(model.model.horizon_months),
    at_solution: {
      gross_revenue_rub: at.gross_revenue_rub,
      ebitda_rub: at.ebitda_rub,
      ebitda_margin: at.ebitda_margin,
      labor_rub: at.labor_rub,
      protected_labor_binding: at.protected_labor_binding,
      marketing_rub: at.marketing_rub,
      household_rub: at.household_rub,
      restaurant_invested_capital_rub: at.restaurant_invested_capital_rub,
      restaurant_payback_month: at.restaurant_payback_month,
      restaurant_irr_annual: at.restaurant_irr_annual,
      staffing_scenario_used: at.staffing.headcount,
    },
    note: "Solver uses the realistic staffing table for any checks/day below 450 (existing engine rule); pessimistic staffing (14 people) applies only to the pessimistic scenario itself.",
  };
}

export function buildFinancialProjection(root = projectRoot) {
  const model = readFinancialModel(root);
  const errors = validateFinancialModel(model, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const rentScenarios = Object.fromEntries((["pessimistic", "realistic", "optimistic"] as SalesScenarioId[]).map(id => [id, calculateFinancialScenario(id, {}, model)]));
  const purchaseScenarios = Object.fromEntries((["pessimistic", "realistic", "optimistic"] as SalesScenarioId[]).map(id => [id, calculateFinancialScenario(id, { realEstateScenario: "purchase" }, model)]));
  return {
    meta: {
      schema_version: 1,
      document_id: model.document.id,
      version: model.document.version,
      status: model.document.status,
      content_state: buildFinancialContentState(root),
      imported_revenue_content_state_sha256: buildRevenueContentState(root).content_state_sha256,
      imported_capex_content_state_sha256: buildContentStateManifest(root).content_state_sha256,
      imported_investor_start_model_sha256: rawFileSha256(model.imports.investor_start_model.path, root),
      imported_equipment_bom_sha256: rawFileSha256(model.imports.capex.equipment_bom_path, root),
    },
    derived_food_cost: calculateFoodCost(model),
    launch_capital: importedLaunchCapital(model),
    scenarios: { rent: rentScenarios, purchase: purchaseScenarios },
    investment_break_even: solveInvestmentBreakEven(model),
    sensitivity: buildSensitivity(model),
    deferred: model.scope.deferred,
  };
}

function projectionSchemaErrors(value: unknown, root = projectRoot) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, FINANCIAL_PROJECTION_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

export function validateFinancialModel(model = readFinancialModel(), root = projectRoot): string[] {
  const errors: string[] = [];
  const schema = JSON.parse(fs.readFileSync(path.join(root, FINANCIAL_MODEL_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(model)) errors.push(...(validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`));

  if (root === projectRoot) {
    if (capexSnapshotValidationError === undefined) {
      try {
        checkWebSnapshot();
        capexSnapshotValidationError = null;
      } catch (error) {
        capexSnapshotValidationError = (error as Error).message;
      }
    }
    if (capexSnapshotValidationError) errors.push(`Stale CAPEX snapshot: ${capexSnapshotValidationError}`);
  }

  const currentRevenue = buildRevenueContentState(root).content_state_sha256;
  const currentCapex = buildContentStateManifest(root).content_state_sha256;
  const currentInvestor = rawFileSha256(model.imports.investor_start_model.path, root);
  const currentBom = rawFileSha256(model.imports.capex.equipment_bom_path, root);
  if (model.imports.revenue_model.content_state_sha256 !== currentRevenue) errors.push(`Stale Revenue input: expected ${model.imports.revenue_model.content_state_sha256}, actual ${currentRevenue}.`);
  if (model.imports.capex.content_state_sha256 !== currentCapex) errors.push(`Stale CAPEX input: expected ${model.imports.capex.content_state_sha256}, actual ${currentCapex}.`);
  if (model.imports.investor_start_model.file_sha256 !== currentInvestor) errors.push(`Stale Investor Start input: expected ${model.imports.investor_start_model.file_sha256}, actual ${currentInvestor}.`);
  if (model.imports.capex.equipment_bom_sha256 !== currentBom) errors.push(`Stale Equipment BOM input: expected ${model.imports.capex.equipment_bom_sha256}, actual ${currentBom}.`);

  const revenue = readRevenueModel(root);
  if (!approximatelyEqual(revenue.product_model.weighted_kolobok_price_rub, 632.5)) errors.push("Revenue average kolobok price must remain 632.50 RUB.");
  if (!approximatelyEqual(revenue.product_model.average_food_portion_price_rub, 636)) errors.push("Revenue average food price must remain 636 RUB.");
  if (!approximatelyEqual(revenue.product_model.average_check_rub, 1165.4)) errors.push("Revenue average check must remain 1165.40 RUB.");
  const traffic = Object.fromEntries((revenue.traffic.scenarios as any[]).map(item => [item.id, item.checks_per_day]));
  if (JSON.stringify(traffic) !== JSON.stringify({ pessimistic: 200, realistic: 300, optimistic: 450 })) errors.push("Revenue traffic inputs are stale.");

  const food = calculateFoodCost(model);
  if (!approximatelyEqual(food.average_kolobok_cost_rub, 175.7625)) errors.push(`Average kolobok cost must derive to 175.7625 RUB, got ${food.average_kolobok_cost_rub}.`);
  if (!approximatelyEqual(food.average_food_portion_cost_rub, 177.01)) errors.push(`Average food portion cost must derive to 177.01 RUB, got ${food.average_food_portion_cost_rub}.`);
  if (!approximatelyEqual(sum(model.food_cost.kolobok_segments.map((item: any) => Number(item.sales_share))), 1)) errors.push("Kolobok sales shares must total 100%.");

  const base = calculateStaffing("realistic", "reduced", model);
  const optimistic = calculateStaffing("optimistic", "reduced", model);
  if (base.headcount !== 16 || !approximatelyEqual(base.payroll_rub, 1810000) || !approximatelyEqual(base.total_labor_rub, 2396938.28)) errors.push(`Baseline staffing must derive to 16 people, 1,810,000 payroll and 2,396,938.28 labor; got ${JSON.stringify(base)}.`);
  if (optimistic.headcount !== 20 || !approximatelyEqual(optimistic.payroll_rub, 2230000) || !approximatelyEqual(optimistic.total_labor_rub, 2955060.35)) errors.push(`Optimistic staffing must derive to 20 people, 2,230,000 payroll and 2,955,060.35 labor; got ${JSON.stringify(optimistic)}.`);

  const capital = importedLaunchCapital(model);
  if (capital.equipment_control_rub_rounded !== Number(model.imports.capex.control_total_rub_rounded)) errors.push(`Stale CAPEX control: expected rounded ${model.imports.capex.control_total_rub_rounded}, actual ${capital.equipment_control_rub_rounded} from canonical calculation (${capital.equipment_rub} exact).`);
  if (!approximatelyEqual(capital.furniture_rub, 425000) || !approximatelyEqual(capital.preparation_rub, 11000000)) errors.push("Imported furniture or preparation amount no longer matches Investor Start Model defaults.");
  if (capital.equipment_bom_configuration_id !== "CFG-PILOT-001") errors.push(`Financial Model must use generated Equipment BOM CFG-PILOT-001, got ${capital.equipment_bom_configuration_id}.`);
  if (!capital.equipment_active_module_ids.includes("MOD-BAR") || !capital.equipment_active_module_ids.includes("MOD-GROW")) errors.push("Financial Model equipment configuration must enable BAR and GROW.");
  if (capital.equipment_unpriced_count !== 0) errors.push(`Financial Model equipment configuration has ${capital.equipment_unpriced_count} unpriced items.`);

  for (const id of ["pessimistic", "realistic", "optimistic"] as SalesScenarioId[]) {
    const result = calculateFinancialScenario(id, {}, model);
    const expectedRevenue = { pessimistic: 6992400, realistic: 10488600, optimistic: 15732900 }[id];
    if (!approximatelyEqual(result.gross_revenue_rub, expectedRevenue)) errors.push(`${id} revenue mismatch: ${result.gross_revenue_rub}.`);
    if (result.restaurant_cash_flows.length !== 61 || result.combined_cash_flows.length !== 61) errors.push(`${id} cash flow must contain Month 0 through Month 60.`);
  }
  return errors;
}

function serializedProjection(root = projectRoot) {
  return `${JSON.stringify(buildFinancialProjection(root), null, 2)}\n`;
}

export function writeFinancialProjection(root = projectRoot) {
  const serialized = serializedProjection(root);
  const parsed = JSON.parse(serialized);
  const errors = projectionSchemaErrors(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const destination = path.join(root, FINANCIAL_PROJECTION_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: FINANCIAL_PROJECTION_PATH, sha256: sha256(serialized), content_state_sha256: parsed.meta.content_state.content_state_sha256 };
}

export function checkFinancialProjection(root = projectRoot) {
  const destination = path.join(root, FINANCIAL_PROJECTION_PATH);
  if (!fs.existsSync(destination)) throw new Error("Financial projection is missing. Run financial:model:sync.");
  const actual = fs.readFileSync(destination, "utf8");
  const parsed = JSON.parse(actual);
  const errors = projectionSchemaErrors(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const expected = serializedProjection(root);
  if (actual !== expected) throw new Error("Financial projection is stale or non-deterministic. Run financial:model:sync.");
  return { validation: "OK", path: FINANCIAL_PROJECTION_PATH, sha256: sha256(actual), content_state_sha256: parsed.meta.content_state.content_state_sha256 };
}
