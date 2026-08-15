import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { platformRoot } from "../src/google/config.js";
import {
  FINANCIAL_CONTENT_SOURCE_PATHS,
  FINANCIAL_MODEL_PATH,
  buildFinancialContentState,
  buildFinancialProjection,
  calculateFinancialScenario,
  calculateFoodCost,
  calculateStaffing,
  checkFinancialProjection,
  importedLaunchCapital,
  readFinancialModel,
  validateFinancialModel,
} from "../src/financial/financial-model.js";
import {
  buildFinancialGoogleSheetsPayload,
  checkFinancialGoogleSheetsPayload,
} from "../src/financial/google-sheet.js";

const projectRoot = path.resolve(platformRoot, "..");
const model = readFinancialModel();

function cumulative(values: number[], through: number) {
  return values.slice(0, through + 1).reduce((total, value) => total + value, 0);
}

function npv(values: number[], annualRate: number) {
  const monthlyRate = (1 + annualRate) ** (1 / 12) - 1;
  return values.reduce((total, value, month) => total + value / ((1 + monthlyRate) ** month), 0);
}

test("Financial Model validates and its deterministic projection is current", () => {
  assert.deepEqual(validateFinancialModel(model), []);
  assert.deepEqual(buildFinancialProjection(), buildFinancialProjection());
  assert.equal(checkFinancialProjection().validation, "OK");
});

test("content fingerprint changes for financial content and excludes governance-only state", () => {
  const baseline = buildFinancialContentState();
  const original = fs.readFileSync(path.join(projectRoot, FINANCIAL_MODEL_PATH), "utf8");
  const changed = buildFinancialContentState(projectRoot, { [FINANCIAL_MODEL_PATH]: original.replace("discount_rate_annual: 0.20", "discount_rate_annual: 0.21") });
  assert.notEqual(changed.content_state_sha256, baseline.content_state_sha256);
  assert.equal(FINANCIAL_CONTENT_SOURCE_PATHS.some(item => /events|TIMELINE|HANDOFF|PROJECT_STATE|receipt|deployment/i.test(item)), false);
});

test("Revenue linkage preserves exact prices, traffic and monthly sales", () => {
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const optimistic = calculateFinancialScenario("optimistic", {}, model);
  assert.deepEqual([pessimistic.checks_per_day, realistic.checks_per_day, optimistic.checks_per_day], [200, 300, 450]);
  assert.deepEqual([pessimistic.average_check_rub, realistic.average_check_rub, optimistic.average_check_rub], [1165.4, 1165.4, 1165.4]);
  assert.deepEqual([pessimistic.gross_revenue_rub, realistic.gross_revenue_rub, optimistic.gross_revenue_rub], [6992400, 10488600, 15732900]);
});

test("Food Cost derives 175.7625 RUB for koloboks and 177.01 RUB for an average food portion", () => {
  const food = calculateFoodCost(model);
  assert.equal(food.average_kolobok_cost_rub, 175.7625);
  assert.equal(food.average_food_portion_cost_rub, 177.01);
  assert.equal(food.manches_cost_rub, 182);
  assert.equal(food.drink_cost_rub, 30);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.equal(realistic.raw_materials_rub, 2500326);
  assert.equal(realistic.waste_rub, 100013.04);
  assert.equal(realistic.waste_rub, Math.round(realistic.raw_materials_rub * 0.04 * 100) / 100);
});

test("staffing derives the approved 16/20 headcount, payroll and labor budgets", () => {
  const baseline = calculateStaffing("realistic", "reduced", model);
  const pessimistic = calculateStaffing("pessimistic", "reduced", model);
  const optimistic = calculateStaffing("optimistic", "reduced", model);
  assert.deepEqual([pessimistic.headcount, baseline.headcount, optimistic.headcount], [16, 16, 20]);
  assert.deepEqual([baseline.payroll_rub, baseline.total_labor_rub], [1810000, 2396938.28]);
  assert.deepEqual([optimistic.payroll_rub, optimistic.total_labor_rub], [2230000, 2955060.35]);
  assert.ok(calculateStaffing("realistic", "standard", model).total_labor_rub > baseline.total_labor_rub);
});

test("canonical BASE equipment uses generated BOM plus BAR/GROW without alcohol or hood double count", () => {
  const capital = importedLaunchCapital(model);
  assert.equal(capital.equipment_bom_configuration_id, "CFG-PILOT-001");
  assert.equal(capital.equipment_rub, 5298993.33);
  assert.equal(capital.equipment_control_rub_rounded, 5298993);
  assert.equal(capital.equipment_coverage_count, 47);
  assert.equal(capital.equipment_unpriced_count, 0);
  assert.equal(capital.equipment_quote_required_count, 23);
  assert.ok(capital.equipment_active_module_ids.includes("MOD-BAR"));
  assert.ok(capital.equipment_active_module_ids.includes("MOD-GROW"));
  assert.equal(model.imports.capex.alcohol_enabled, false);
  assert.deepEqual(model.imports.capex.excluded_item_ids, ["CAPEX-01-012"]);
});

test("packaging, acquiring and aggregators follow their approved variable bases", () => {
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const optimistic = calculateFinancialScenario("optimistic", {}, model);
  assert.deepEqual([pessimistic.packaging_rub, realistic.packaging_rub, optimistic.packaging_rub], [166666.67, 250000, 375000]);
  assert.equal(realistic.acquiring_rub, realistic.gross_revenue_rub * 0.02);
  assert.equal(realistic.aggregator_rub, 0);
  const aggregator = calculateFinancialScenario("realistic", { aggregatorShare: 0.2 }, model);
  assert.equal(aggregator.aggregator_rub, Math.round(realistic.gross_revenue_rub * 0.2 * 0.2917 * 100) / 100);
});

test("VAT conservative scenario extracts 5/105 from consumer prices and USN chooses the applicable maximum", () => {
  const result = calculateFinancialScenario("realistic", { taxScenario: "conservative" }, model);
  assert.equal(result.vat_rub, Math.round(result.gross_revenue_rub * 5 / 105 * 100) / 100);
  assert.equal(result.net_revenue_rub, result.gross_revenue_rub - result.vat_rub);
  assert.equal(result.tax_due_rub, Math.max(result.regular_usn_rub, result.minimum_usn_rub));
  assert.equal(model.tax.scenarios.base.vat_status, "requires_confirmation");
  assert.equal(model.tax.management_proxy.excludes.includes("management_depreciation"), true);
  assert.equal(model.tax.management_proxy.excludes.includes("maintenance_capex"), true);
  assert.equal(model.scope.deferred.some((item: any) => item.id === "tax_capex_schedule" && item.status === "tbd"), true);
});

test("Fixed OPEX Reserve excludes volume costs while Full Operating Reserve includes them", () => {
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.equal(pessimistic.fixed_opex_reserve_rub, realistic.fixed_opex_reserve_rub);
  assert.ok(realistic.full_operating_reserve_rub > realistic.fixed_opex_reserve_rub);
  assert.ok(realistic.full_operating_reserve_rub > pessimistic.full_operating_reserve_rub);
  assert.equal(realistic.initial_inventory_rub, 1000000);
  assert.equal(model.operating_reserve.default_invested_capital_basis, "fixed");
  assert.equal(model.operating_reserve.default_months, 6);
});

test("P&L keeps depreciation below EBITDA and maintenance CAPEX only in free cash flow", () => {
  const result = calculateFinancialScenario("realistic", {}, model);
  assert.equal(result.ebit_rub, Math.round((result.ebitda_rub - result.depreciation_rub) * 100) / 100);
  assert.equal(result.operating_free_cash_flow_rub, Math.round((result.ebitda_rub - result.tax_due_rub - result.maintenance_capex_rub) * 100) / 100);
  assert.equal(result.maintenance_capex_rub, Math.round((result.capex.equipment_rub + result.capex.furniture_rub) * 0.03 / 12 * 100) / 100);
});

test("payback, cumulative FCF, ROI, IRR and NPV are deterministic over Month 0 through Month 60", () => {
  const result = calculateFinancialScenario("realistic", {}, model);
  assert.equal(result.restaurant_cash_flows.length, 61);
  assert.equal(result.restaurant_payback_month, 11);
  assert.ok(cumulative(result.restaurant_cash_flows, 10) < 0);
  assert.ok(cumulative(result.restaurant_cash_flows, 11) >= 0);
  assert.ok(Math.abs(result.restaurant_roi_annual - result.operating_free_cash_flow_rub * 12 / result.restaurant_invested_capital_rub) < 1e-8);
  assert.ok(result.restaurant_irr_annual !== null && Number.isFinite(result.restaurant_irr_annual));
  assert.equal(result.restaurant_npv_rub, Math.round(npv(result.restaurant_cash_flows, 0.2) * 100) / 100);
});

test("going-concern Month 60 does not recover deposit, inventory, restaurant equipment or brand", () => {
  const rent = calculateFinancialScenario("realistic", {}, model);
  assert.equal(rent.restaurant_cash_flows[60], rent.operating_free_cash_flow_rub);
  assert.equal(model.terminal.month_60_deposit_recovery_rub, 0);
  assert.equal(model.terminal.month_60_inventory_recovery_rub, 0);
  assert.equal(model.terminal.restaurant_equipment_salvage_rub, 0);
  assert.equal(model.terminal.brand_value_rub, 0);
  assert.equal(model.terminal.exit_scenario_status, "not_started");
});

test("rent, purchase and real-estate appreciation remain separate from restaurant EBITDA", () => {
  const rent = calculateFinancialScenario("realistic", {}, model);
  const purchase0 = calculateFinancialScenario("realistic", { realEstateScenario: "purchase", propertyAppreciation: 0 }, model);
  const purchase5 = calculateFinancialScenario("realistic", { realEstateScenario: "purchase", propertyAppreciation: 0.05 }, model);
  assert.equal(rent.rent_rub, 350000);
  assert.equal(purchase0.rent_rub, 0);
  assert.equal(purchase0.real_estate_investment_rub, 69000000);
  assert.equal(purchase0.ebitda_rub, purchase5.ebitda_rub);
  assert.equal(purchase0.property_residual_value_rub, 69000000);
  assert.ok(purchase5.property_residual_value_rub > purchase0.property_residual_value_rub);
  assert.equal(model.real_estate.restaurant_ebitda_includes_appreciation, false);
});

test("internal supply is consolidated and deferred scopes remain not started or TBD", () => {
  assert.match(model.scope.consolidation_rule, /не являются выручкой консолидированной модели/);
  for (const id of ["master_lease_sublease", "external_supply_chain_revenue", "franchise_economics", "future_intercompany_sales", "detailed_functional_contour_pnl", "exit_terminal_recovery"]) {
    assert.equal(model.scope.deferred.some((item: any) => item.id === id && ["not_started", "tbd"].includes(item.status)), true);
  }
});

test("stale Revenue, CAPEX, Equipment BOM and Investor Start hashes are diagnosed independently", () => {
  const cases = [
    ["Revenue", (copy: any) => { copy.imports.revenue_model.content_state_sha256 = "0".repeat(64); }],
    ["CAPEX", (copy: any) => { copy.imports.capex.content_state_sha256 = "0".repeat(64); }],
    ["Equipment BOM", (copy: any) => { copy.imports.capex.equipment_bom_sha256 = "0".repeat(64); }],
    ["Investor Start", (copy: any) => { copy.imports.investor_start_model.file_sha256 = "0".repeat(64); }],
  ] as const;
  for (const [label, mutate] of cases) {
    const copy = structuredClone(model);
    mutate(copy);
    assert.ok(validateFinancialModel(copy).some(error => error.includes(`Stale ${label}`)), `missing ${label} stale diagnostic`);
  }
});

test("projection and canonical model contain no secrets or absolute local paths", () => {
  const serialized = JSON.stringify(buildFinancialProjection());
  assert.equal(/access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key/i.test(serialized), false);
  assert.equal(serialized.includes(projectRoot), false);
});

test("Google Sheets payload is deterministic, current and follows the approved 16-tab order", () => {
  const first = buildFinancialGoogleSheetsPayload();
  const second = buildFinancialGoogleSheetsPayload();
  assert.deepEqual(first, second);
  assert.deepEqual(first.sheets.map(sheet => sheet.name), model.google_sheet.sheets);
  assert.equal(first.sheets.length, 16);
  assert.equal(first.meta.content_state_sha256, buildFinancialContentState().content_state_sha256);
  assert.equal(checkFinancialGoogleSheetsPayload().validation, "OK");
});

test("Google formulas reference existing tabs and contain no broken references, secrets or local paths", () => {
  const payload = buildFinancialGoogleSheetsPayload();
  const names = new Set(payload.sheets.map(sheet => sheet.name));
  const formulas = payload.sheets.flatMap(sheet => sheet.values.flat()).filter((value): value is string => typeof value === "string" && value.startsWith("="));
  for (const formula of formulas) {
    assert.equal(formula.includes("#REF!"), false, formula);
    for (const match of formula.matchAll(/'([^']+)'!/g)) assert.equal(names.has(match[1]), true, `missing tab ${match[1]} in ${formula}`);
  }
  const serialized = JSON.stringify(payload);
  assert.equal(/access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key/i.test(serialized), false);
  assert.equal(serialized.includes(projectRoot), false);
});

test("Google assumptions are imported from canonical models instead of copied derived totals", () => {
  const payload = buildFinancialGoogleSheetsPayload();
  const assumptions = payload.sheets.find(sheet => sheet.name === "02 Допущения");
  assert.ok(assumptions);
  const values = Object.fromEntries(assumptions.values.slice(3).map(row => [row[0], row[1]]));
  const projection = buildFinancialProjection();
  assert.equal(values.average_check_rub, projection.scenarios.rent.realistic.average_check_rub);
  assert.equal(values.equipment_capex_rub, projection.launch_capital.equipment_rub);
  assert.equal(values.furniture_capex_rub, projection.launch_capital.furniture_rub);
  assert.equal(values.preparation_rub, projection.launch_capital.preparation_rub);
  assert.equal(values.operating_reserve_months, model.operating_reserve.default_months);
  assert.equal(values.contribution_threshold_rub, model.staffing.employer_contributions.reduced.mrot_rub * model.staffing.employer_contributions.reduced.threshold_multiple);
});

test("Google CAPEX, P&L and cash-flow formulas preserve reserve, tax and Month 0 through Month 60 logic", () => {
  const payload = buildFinancialGoogleSheetsPayload();
  const get = (name: string) => {
    const found = payload.sheets.find(sheet => sheet.name === name);
    assert.ok(found, `missing sheet ${name}`);
    return found;
  };
  const capex = get("07 CAPEX").values;
  assert.match(String(capex[14][3]), /'05 Персонал'!\$G\$14/);
  assert.match(String(capex[14][3]), /MAX\('02 Допущения'!\$B\$15-'02 Допущения'!\$B\$17,0\)/);
  assert.equal(capex[16][3], "=SUM(D4:D15)");
  assert.equal(String(capex[15][3]).includes("D15+SUM("), true);

  const pnl = get("08 P&L").values;
  assert.equal(pnl[23][1], "=B10-SUM(B12:B23)");
  assert.equal(pnl[30][2], "=MAX(C29,C30)");
  assert.equal(pnl[33][2], "=C24-C31-C33");
  assert.match(String(pnl[27][2]), /'06 OPEX'!F7:F8/);
  assert.equal(String(pnl[27][2]).includes("F9"), false, "personnel reserve must stay outside the USN proxy");

  const cashFlow = get("09 Денежный поток").values;
  assert.deepEqual(cashFlow[2].slice(1), Array.from({ length: 61 }, (_, month) => month));
  assert.equal(cashFlow[10][1], "=B4+SUM(B6:B10)");
  assert.equal(String(cashFlow[10][1]).includes("B5"), false, "displayed revenue must not be added twice to FCF");
  assert.equal(cashFlow[11][1], "=B11");
  assert.equal(cashFlow[11][2], "=B12+C11");
  assert.equal(cashFlow[11][61], "=BI12+BJ11");
});
