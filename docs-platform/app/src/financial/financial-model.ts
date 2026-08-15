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

export function calculateFinancialScenario(scenario: SalesScenarioId, options: CalculationOptions = {}, model = readFinancialModel()) {
  const revenueModel = readRevenueModel();
  const traffic = revenueModel.traffic.scenarios.find((item: any) => item.id === scenario);
  if (!traffic) throw new Error(`Unknown sales scenario ${scenario}.`);
  const checksPerDay = Number(options.checksPerDay ?? traffic.checks_per_day);
  const daysPerMonth = Number(model.model.days_per_month);
  const averageCheck = Number(revenueModel.product_model.average_check_rub) * Number(options.averageCheckMultiplier ?? 1);
  const grossRevenue = checksPerDay * daysPerMonth * averageCheck;
  const taxScenario = options.taxScenario ?? model.model.default_tax_scenario as TaxScenarioId;
  const taxRules = model.tax.scenarios[taxScenario];
  const vat = taxScenario === "conservative" ? grossRevenue * Number(taxRules.vat_rate) / (1 + Number(taxRules.vat_rate)) : 0;
  const netRevenue = grossRevenue - vat;
  const food = calculateFoodCost(model);
  const foodPortions = checksPerDay * daysPerMonth * Number(revenueModel.product_model.food_portions_per_check);
  const drinks = checksPerDay * daysPerMonth * Number(revenueModel.product_model.drinks.per_check);
  const rawMaterials = options.overallFoodCostRate === undefined || options.overallFoodCostRate === null
    ? foodPortions * food.average_food_portion_cost_rub + drinks * food.drink_cost_rub
    : grossRevenue * Number(options.overallFoodCostRate);
  const waste = rawMaterials * Number(options.wasteRate ?? model.food_cost.waste.default_rate);
  const packaging = Number(model.packaging.baseline_monthly_rub) * checksPerDay / Number(model.packaging.baseline_checks_per_day);
  const staffingScenario: SalesScenarioId = options.checksPerDay !== undefined ? (checksPerDay >= 450 ? "optimistic" : "realistic") : scenario;
  const staffing = calculateStaffing(staffingScenario, options.contributionScenario ?? model.model.default_contribution_scenario, model);
  const laborMultiplier = Number(options.laborMultiplier ?? 1);
  const labor = staffing.total_labor_rub * laborMultiplier;
  const realEstateScenario = options.realEstateScenario ?? model.model.default_real_estate_scenario as RealEstateScenarioId;
  const rent = realEstateScenario === "rent" ? Number(options.rentRub ?? model.real_estate.scenarios.rent.monthly_rent_rub) : 0;
  const acquiring = grossRevenue * Number(opexEntry(model, "ACQUIRING").rate_of_gross_revenue);
  const aggregatorShare = Number(options.aggregatorShare ?? model.model.default_aggregator_share);
  const aggregator = grossRevenue * aggregatorShare * Number(opexEntry(model, "AGGREGATORS").commission_rate);
  const fixedEntryIds = ["UTILITIES", "ADVERTISING", "SMM", "EQUIPMENT_SERVICE", "HOUSEHOLD", "ACCOUNTING", "VENT_GREASE", "UNIFORM_RENEWAL", "MUSIC_RIGHTS", "PEST", "YUMA", "MEDICAL", "SECURITY_MONITORING", "BANKING", "OTHER"];
  const fixedEntries = Object.fromEntries(fixedEntryIds.map(id => [id, Number(opexEntry(model, id).amount_rub)]));
  const fixedOpexWithoutLaborAndRent = sum(Object.values(fixedEntries));
  const ebitda = netRevenue - rawMaterials - waste - packaging - labor - rent - acquiring - aggregator - fixedOpexWithoutLaborAndRent;
  const capex = importedLaunchCapital(model);
  const depreciation = capex.monthly_depreciation_rub;
  const ebit = ebitda - depreciation;
  const eligibleOperatingCashExpenses = rawMaterials + waste + packaging + staffing.payroll_rub + staffing.employer_contributions_rub
    + rent + acquiring + aggregator + fixedOpexWithoutLaborAndRent;
  const taxableBase = Math.max(netRevenue - eligibleOperatingCashExpenses, 0);
  const regularUsn = taxableBase * Number(taxRules.usn_income_less_expenses_rate);
  const minimumUsn = netRevenue * Number(taxRules.minimum_usn_income_rate);
  const taxDue = Math.max(regularUsn, minimumUsn);
  const netOperatingResult = ebit - taxDue;
  const maintenanceCapex = (capex.equipment_rub + capex.furniture_rub) * Number(model.maintenance_capex.annual_rate) / 12;
  const operatingFreeCashFlow = ebitda - taxDue - maintenanceCapex;
  const reserveMonths = Number(model.operating_reserve.default_months);
  const prepaidMonths = realEstateScenario === "rent" ? Number(model.real_estate.scenarios.rent.prepayment_months) : 0;
  const uncoveredRentMonths = Math.max(reserveMonths - prepaidMonths, 0);
  const fixedReserve = (labor + fixedOpexWithoutLaborAndRent) * reserveMonths + rent * uncoveredRentMonths;
  const fullReserve = fixedReserve + (rawMaterials + waste + packaging + acquiring + aggregator + taxDue) * reserveMonths;

  const capexMultiplier = Number(options.capexMultiplier ?? 1);
  const fixedAssetCapexBeforeContingency = (capex.equipment_rub + capex.furniture_rub + capex.preparation_rub
    + Number(model.launch_investment.video_surveillance_rub) + Number(model.launch_investment.alarm_rub)) * capexMultiplier;
  const contingency = (capex.equipment_rub + capex.furniture_rub + capex.preparation_rub) * capexMultiplier * Number(model.launch_investment.contingency_default_rate);
  const prepaidRent = realEstateScenario === "rent" ? rent * prepaidMonths : 0;
  const securityDeposit = realEstateScenario === "rent" ? rent * Number(model.real_estate.scenarios.rent.security_deposit_months) : 0;
  const restaurantInvestedCapital = fixedAssetCapexBeforeContingency + Number(model.launch_investment.initial_uniform_rub)
    + Number(model.launch_investment.initial_inventory_rub) + Number(model.launch_investment.other_launch_costs_rub)
    + contingency + prepaidRent + securityDeposit + fixedReserve;
  const realEstateInvestment = realEstateScenario === "purchase" ? Number(model.real_estate.scenarios.purchase.purchase_price_rub) : 0;
  const totalInvestedCapital = restaurantInvestedCapital + realEstateInvestment;
  const horizon = Number(model.model.horizon_months);
  const restaurantCashFlows = [-round(restaurantInvestedCapital)];
  for (let month = 1; month <= horizon; month += 1) {
    const prepaidRentRelease = realEstateScenario === "rent" && month <= prepaidMonths ? rent : 0;
    restaurantCashFlows.push(round(operatingFreeCashFlow + prepaidRentRelease));
  }
  const appreciation = Number(options.propertyAppreciation ?? model.real_estate.appreciation_default);
  const propertyResidualValue = realEstateScenario === "purchase" ? realEstateInvestment * ((1 + appreciation) ** (horizon / 12)) : 0;
  const combinedCashFlows = restaurantCashFlows.map((cash, index) => index === 0 ? round(cash - realEstateInvestment) : index === horizon ? round(cash + propertyResidualValue) : cash);
  const restaurantMonthlyIrr = monthlyIrr(restaurantCashFlows);
  const combinedMonthlyIrr = monthlyIrr(combinedCashFlows);
  const realEstateCashFlows = [-realEstateInvestment, ...Array(horizon - 1).fill(0), propertyResidualValue];
  const realEstateMonthlyIrr = realEstateInvestment > 0 ? monthlyIrr(realEstateCashFlows) : null;

  const fixedCostsForBreakEven = labor + rent + fixedOpexWithoutLaborAndRent;
  const rawPerCheck = rawMaterials / (checksPerDay * daysPerMonth);
  const wastePerCheck = waste / (checksPerDay * daysPerMonth);
  const packagingPerCheck = packaging / (checksPerDay * daysPerMonth);
  const acquiringPerCheck = averageCheck * Number(opexEntry(model, "ACQUIRING").rate_of_gross_revenue);
  const aggregatorPerCheck = averageCheck * aggregatorShare * Number(opexEntry(model, "AGGREGATORS").commission_rate);
  const minimumUsnPerCheck = averageCheck * (taxScenario === "conservative" ? 1 / 1.05 : 1) * Number(taxRules.minimum_usn_income_rate);
  const vatPerCheck = taxScenario === "conservative" ? averageCheck * Number(taxRules.vat_rate) / (1 + Number(taxRules.vat_rate)) : 0;
  const contributionPerCheck = averageCheck - vatPerCheck - rawPerCheck - wastePerCheck - packagingPerCheck - acquiringPerCheck - aggregatorPerCheck - minimumUsnPerCheck;
  const breakEvenChecksPerDay = fixedCostsForBreakEven / contributionPerCheck / daysPerMonth;

  return {
    scenario,
    checks_per_day: checksPerDay,
    average_check_rub: round(averageCheck),
    gross_revenue_rub: round(grossRevenue),
    vat_rub: round(vat),
    net_revenue_rub: round(netRevenue),
    food_portions_per_month: round(foodPortions),
    drinks_per_month: round(drinks),
    raw_materials_rub: round(rawMaterials),
    waste_rub: round(waste),
    packaging_rub: round(packaging),
    gross_profit_rub: round(netRevenue - rawMaterials - waste - packaging),
    gross_margin: (netRevenue - rawMaterials - waste - packaging) / netRevenue,
    staffing,
    labor_rub: round(labor),
    rent_rub: round(rent),
    acquiring_rub: round(acquiring),
    aggregator_rub: round(aggregator),
    fixed_opex_without_labor_rent_rub: round(fixedOpexWithoutLaborAndRent),
    opex_entries_rub: fixedEntries,
    ebitda_rub: round(ebitda),
    ebitda_margin: ebitda / netRevenue,
    depreciation_rub: round(depreciation),
    ebit_rub: round(ebit),
    taxable_base_management_proxy_rub: round(taxableBase),
    regular_usn_rub: round(regularUsn),
    minimum_usn_rub: round(minimumUsn),
    tax_due_rub: round(taxDue),
    net_operating_result_rub: round(netOperatingResult),
    maintenance_capex_rub: round(maintenanceCapex),
    operating_free_cash_flow_rub: round(operatingFreeCashFlow),
    fixed_opex_reserve_rub: round(fixedReserve),
    full_operating_reserve_rub: round(fullReserve),
    initial_inventory_rub: Number(model.launch_investment.initial_inventory_rub),
    capex,
    restaurant_invested_capital_rub: round(restaurantInvestedCapital),
    real_estate_investment_rub: round(realEstateInvestment),
    total_invested_capital_rub: round(totalInvestedCapital),
    break_even_revenue_rub: round(breakEvenChecksPerDay * daysPerMonth * averageCheck),
    break_even_checks_per_day: round(breakEvenChecksPerDay, 2),
    restaurant_payback_month: firstPaybackMonth(restaurantCashFlows),
    restaurant_roi_annual: operatingFreeCashFlow * 12 / restaurantInvestedCapital,
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
