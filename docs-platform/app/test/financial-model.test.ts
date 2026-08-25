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
import { calculateLaunchBudget, defaultLaunchBudgetState } from "../../../src/lib/launch-budget.js";

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
  assert.equal(realistic.recipe_based_raw_materials_rub, 2500326);
  assert.equal(realistic.waste_rub, Math.round(realistic.raw_materials_rub * 0.04 * 100) / 100);
});

test("Financial P&L uses the protected 30% raw material base while the recipe model stays analytical", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.equal(model.food_cost.protected_formula.raw_materials_rate, 0.3);
  assert.equal(model.food_cost.protected_formula.basis, "net_revenue");
  assert.equal(model.food_cost.protected_formula.recipe_model_status, "retained_as_analytical_source");
  assert.equal(realistic.raw_materials_rub, 3146580);
  assert.equal(realistic.raw_materials_rub, realistic.net_revenue_rub * 0.3);
  assert.equal(realistic.waste_rub, 125863.2);
  assert.ok(realistic.raw_materials_rub > realistic.recipe_based_raw_materials_rub, "protected base must be the conservative one");
  for (const row of realistic.monthly) assert.ok(Math.abs(row.raw_materials_rub - row.net_revenue_rub * 0.3) < 0.01);
});

test("protected labor takes the maximum of calculated staffing labor and 27% of net revenue", () => {
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.equal(model.food_cost.protected_formula.protected_labor_rate, 0.27);
  assert.equal(pessimistic.staffing.headcount, 14);
  assert.ok(pessimistic.calculated_staffing_labor_rub < 2396938.28);
  assert.equal(realistic.calculated_staffing_labor_rub, 2396938.28);
  assert.equal(pessimistic.protected_labor_binding, false);
  assert.equal(pessimistic.labor_rub, pessimistic.calculated_staffing_labor_rub);
  assert.equal(realistic.protected_labor_binding, true);
  assert.equal(realistic.protected_labor_floor_rub, 2831922);
  assert.equal(realistic.labor_rub, 2831922);
  for (const row of realistic.monthly) {
    assert.equal(row.labor_rub, Math.max(2396938.28, Math.round(row.net_revenue_rub * 0.27 * 100) / 100));
  }
});

test("administrative reserve is 2% of net revenue and reaches EBITDA and free cash flow", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const entry = model.opex.entries.find((item: any) => item.id === "ADMINISTRATIVE_RESERVE");
  assert.equal(entry.behavior, "variable");
  assert.equal(entry.rate_of_net_revenue, 0.02);
  assert.equal(realistic.administrative_reserve_rub, 209772);
  assert.equal(realistic.administrative_reserve_rub, realistic.net_revenue_rub * 0.02);
  assert.equal(realistic.opex_entries_rub.ADMINISTRATIVE_RESERVE, undefined, "variable reserve must stay outside the fixed OPEX block");
  const expectedEbitda = realistic.gross_profit_rub - realistic.labor_rub - realistic.rent_rub - realistic.acquiring_rub
    - realistic.aggregator_rub - realistic.administrative_reserve_rub - realistic.marketing_rub - realistic.household_rub - realistic.fixed_opex_without_labor_rent_rub;
  assert.ok(Math.abs(realistic.ebitda_rub - expectedEbitda) < 0.02);
  for (const row of realistic.monthly) assert.ok(Math.abs(row.administrative_reserve_rub - row.net_revenue_rub * 0.02) < 0.01);
});

test("marketing follows 150 000 + 2.4% of net revenue with a 400 000 floor during ramp-up months 1-6", () => {
  const rule = model.opex.entries.find((item: any) => item.id === "MARKETING");
  assert.equal(rule.behavior, "scenario_formula");
  assert.deepEqual([rule.fixed_amount_rub, rule.rate_of_net_revenue, rule.ramp_up_floor_rub, rule.ramp_up_floor_months], [150000, 0.024, 400000, 6]);
  assert.equal(model.opex.entries.some((item: any) => ["ADVERTISING", "SMM"].includes(item.id) || String(item.id).startsWith("MARKETING_")), false);
  assert.equal(model.opex.marketing_structure_reference.items.length, 8);
  for (const id of ["pessimistic", "realistic", "optimistic"] as const) {
    const scenario = calculateFinancialScenario(id, {}, model);
    assert.ok(Math.abs(scenario.marketing_rub - (150000 + scenario.net_revenue_rub * 0.024)) < 0.01, `${id} mature marketing`);
    for (const row of scenario.monthly) {
      const formula = 150000 + row.net_revenue_rub * 0.024;
      const expected = row.month <= 6 ? Math.max(400000, formula) : formula;
      assert.ok(Math.abs(row.marketing_rub - expected) < 0.01, `${id} month ${row.month} marketing`);
    }
  }
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.ok(Math.abs(calculateFinancialScenario("pessimistic", {}, model).marketing_rub - 317817.6) < 0.01);
  assert.ok(Math.abs(realistic.marketing_rub - 401726.4) < 0.01);
  assert.ok(Math.abs(calculateFinancialScenario("optimistic", {}, model).marketing_rub - 527589.6) < 0.01);
  assert.equal(realistic.monthly.slice(0, 6).every(row => row.marketing_rub === 400000), true, "floor binds through month 6 in the realistic scenario");
  assert.ok(realistic.monthly[6].marketing_rub < 400000, "month 7 drops to the formula");
  assert.equal(realistic.opex_entries_rub.MARKETING, undefined, "scenario formula must not be summed as a fixed entry");
  assert.equal(model.tax.management_proxy.includes.includes("marketing"), true);
});

test("household supplies scale 50 000 + 50 000 × actual checks / 300 with ramp-up and seasonality", () => {
  const rule = model.opex.entries.find((item: any) => item.id === "HOUSEHOLD");
  assert.equal(rule.behavior, "scenario_formula");
  assert.deepEqual([rule.fixed_amount_rub, rule.variable_amount_rub, rule.baseline_checks_per_day], [50000, 50000, 300]);
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const optimistic = calculateFinancialScenario("optimistic", {}, model);
  assert.ok(Math.abs(pessimistic.household_rub - 83333.33) < 0.01);
  assert.equal(realistic.household_rub, 100000);
  assert.equal(optimistic.household_rub, 125000);
  for (const row of realistic.monthly) {
    const volume = row.ramp_factor * row.seasonality_factor;
    assert.ok(Math.abs(row.household_rub - (50000 + 50000 * (300 * volume) / 300)) < 0.01, `month ${row.month} household`);
  }
  assert.equal(realistic.opex_entries_rub.HOUSEHOLD, undefined);
  assert.equal(realistic.opex_entries_rub.UTILITIES, 200000);
});

test("investment break-even solver finds the minimum mature checks per day for NPV >= 0 at 20% over 60 months", () => {
  const projection = buildFinancialProjection();
  const solved = projection.investment_break_even;
  assert.equal(solved.status, "solved");
  assert.ok(solved.min_checks_per_day !== null && solved.min_checks_per_day > 200 && solved.min_checks_per_day < 300);
  assert.ok(solved.npv_rub >= 0);
  const below = calculateFinancialScenario("realistic", { checksPerDay: solved.min_checks_per_day! - 0.5 }, model);
  assert.ok(below.restaurant_npv_rub < 0, "half a check below the boundary must still be NPV-negative");
  assert.ok(solved.at_solution && Math.abs(Number(solved.at_solution.restaurant_irr_annual) - 0.2) < 0.001, "IRR at the boundary equals the discount rate");
});

test("ramp-up runs Month 1 to Month 6 and holds 100% from Month 7", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.deepEqual(realistic.monthly.slice(0, 7).map(row => row.ramp_factor), [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1]);
  assert.equal(realistic.monthly.filter(row => row.ramp_factor !== 1).length, 6);
  for (const row of realistic.monthly.slice(6)) assert.equal(row.ramp_factor, 1);
});

test("Saint Petersburg seasonality cycles over the whole 60-month horizon from the opening month", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const curve = [0.93, 0.75, 0.88, 0.95, 1.02, 0.96, 0.96, 0.98, 1.12, 1.16, 1.1, 1.18];
  assert.equal(model.model.opening_month, 1);
  assert.equal(model.model.opening_month_basis, "calendar_month");
  assert.equal(realistic.monthly.length, 60);
  for (const row of realistic.monthly) {
    assert.equal(row.calendar_month, ((row.month - 1) % 12) + 1);
    assert.equal(row.seasonality_factor, curve[row.calendar_month - 1]);
  }
  assert.equal(realistic.monthly[59].calendar_month, 12);
  assert.equal(realistic.monthly[0].gross_revenue_rub, Math.round(realistic.gross_revenue_rub * 0.6 * 0.93 * 100) / 100);
});

test("launch marketing enters Month 0 invested capital once and never monthly OPEX", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const baseline = calculateFinancialScenario("realistic", {}, {
    ...model,
    launch_investment: { ...model.launch_investment, launch_marketing_rub: 0 },
  });
  assert.equal(model.launch_investment.launch_marketing_timing, "month_0");
  assert.equal(realistic.launch_marketing_rub, 700000);
  assert.equal(realistic.restaurant_invested_capital_rub - baseline.restaurant_invested_capital_rub, 700000);
  assert.equal(realistic.ebitda_rub, baseline.ebitda_rub, "launch marketing must not enter monthly OPEX");
  assert.equal(realistic.fixed_opex_reserve_rub, baseline.fixed_opex_reserve_rub);
  assert.equal(model.launch_investment.contingency_basis, "equipment_plus_furniture_plus_preparation");
  assert.equal(realistic.capex.contingency_rub, Math.round((realistic.capex.equipment_rub + realistic.capex.furniture_rub + realistic.capex.preparation_rub) * 0.1 * 100) / 100);
});

test("variable costs follow the actual monthly volume while fixed costs stay flat", () => {
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const [first] = realistic.monthly;
  const volume = first.ramp_factor * first.seasonality_factor;
  const detailed: any = realistic.monthly_detailed[0];
  for (const key of ["gross_revenue_rub", "raw_materials_rub", "waste_rub", "packaging_rub", "acquiring_rub", "administrative_reserve_rub"]) {
    assert.ok(Math.abs(detailed[key] - (realistic as any)[key] * volume) < 0.01, key + " must scale with monthly volume");
  }
  assert.equal(detailed.rent_rub, realistic.rent_rub);
  assert.equal(detailed.fixed_opex_without_labor_rent_rub, realistic.fixed_opex_without_labor_rent_rub);
  assert.equal(detailed.depreciation_rub, realistic.depreciation_rub);
  assert.equal(detailed.calculated_staffing_labor_rub, realistic.calculated_staffing_labor_rub);
});

test("staffing derives the approved 16/20 headcount, payroll and labor budgets", () => {
  const baseline = calculateStaffing("realistic", "reduced", model);
  const pessimistic = calculateStaffing("pessimistic", "reduced", model);
  const optimistic = calculateStaffing("optimistic", "reduced", model);
  assert.deepEqual([pessimistic.headcount, baseline.headcount, optimistic.headcount], [14, 16, 20]);
  assert.equal(pessimistic.payroll_rub, 1580000);
  assert.equal(model.staffing.roles.find((role: any) => role.id === "LINE_COOK").pessimistic_headcount, 2);
  assert.ok(pessimistic.total_labor_rub < baseline.total_labor_rub);
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

test("Financial Model imports the full preparation baseline, separately from the Ready Premises runtime preset", () => {
  const readyPremises = calculateLaunchBudget(defaultLaunchBudgetState());
  const capital = importedLaunchCapital(model);
  assert.equal(readyPremises.effectivePreparationRub, 3_500_000);
  assert.equal(capital.preparation_rub, 11_000_000);
  assert.equal(capital.preparation_rub - readyPremises.effectivePreparationRub!, 7_500_000);
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
  assert.equal(model.tax.management_proxy.labor_basis, "calculated_staffing_labor");
  assert.equal(model.tax.management_proxy.excludes.includes("protected_labor_uplift"), true);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  const cashPayroll = realistic.staffing.payroll_rub + realistic.staffing.employer_contributions_rub;
  const eligible = realistic.raw_materials_rub + realistic.waste_rub + realistic.packaging_rub + cashPayroll + realistic.rent_rub
    + realistic.acquiring_rub + realistic.aggregator_rub + realistic.administrative_reserve_rub + realistic.marketing_rub + realistic.household_rub + realistic.fixed_opex_without_labor_rent_rub;
  assert.ok(Math.abs(realistic.taxable_base_management_proxy_rub - Math.max(realistic.net_revenue_rub - eligible, 0)) < 0.02, "tax proxy must deduct actual payroll, not the protected floor");
  assert.equal(model.tax.management_proxy.excludes.includes("management_depreciation"), true);
  assert.equal(model.tax.management_proxy.excludes.includes("maintenance_capex"), true);
  assert.equal(model.scope.deferred.some((item: any) => item.id === "tax_capex_schedule" && item.status === "tbd"), true);
});

test("Fixed OPEX Reserve excludes volume costs while Full Operating Reserve includes them", () => {
  const pessimistic = calculateFinancialScenario("pessimistic", {}, model);
  const realistic = calculateFinancialScenario("realistic", {}, model);
  assert.ok(pessimistic.fixed_opex_reserve_rub < realistic.fixed_opex_reserve_rub, "pessimistic reserve reflects 14 staff and lower scenario OPEX");
  assert.ok(Math.abs(realistic.fixed_opex_reserve_rub - (realistic.calculated_staffing_labor_rub + realistic.fixed_opex_without_labor_rent_rub + realistic.marketing_rub + realistic.household_rub) * 6) < 0.01);
  assert.equal(model.operating_reserve.scenario_formula_basis, "mature_month_of_scenario");
  assert.equal(model.real_estate.scenarios.rent.prepayment_months, 12);
  assert.equal(model.operating_reserve.include_administrative_reserve_in_fixed_reserve, false);
  assert.equal(model.operating_reserve.reserve_labor_basis, "calculated_staffing_labor");
  assert.equal(model.operating_reserve.reserve_labor_basis_status, "owner_approved");
  assert.deepEqual(model.operating_reserve.open_questions, []);
  assert.equal(realistic.protected_labor_binding, true, "the decision only matters when the protected floor binds");
  assert.ok(realistic.fixed_opex_reserve_rub < (realistic.labor_rub + realistic.fixed_opex_without_labor_rent_rub + realistic.marketing_rub + realistic.household_rub) * 6, "protected labor uplift must stay outside the reserve");
  assert.ok(realistic.full_operating_reserve_rub > realistic.fixed_opex_reserve_rub);
  assert.ok(realistic.full_operating_reserve_rub > pessimistic.full_operating_reserve_rub);
  assert.equal(realistic.initial_inventory_rub, 1000000);
  assert.equal(model.operating_reserve.default_invested_capital_basis, "fixed");
  assert.equal(model.operating_reserve.default_months, 6);
});

test("P&L keeps depreciation below EBITDA and maintenance CAPEX only in free cash flow", () => {
  const result = calculateFinancialScenario("realistic", {}, model);
  assert.equal(result.ebit_rub, Math.round((result.ebitda_rub - result.depreciation_rub) * 100) / 100);
  assert.ok(Math.abs(result.operating_free_cash_flow_rub - (result.ebitda_rub - result.tax_due_rub - result.maintenance_capex_rub)) < 0.02);
  assert.equal(result.maintenance_capex_rub, Math.round((result.capex.equipment_rub + result.capex.furniture_rub) * 0.03 / 12 * 100) / 100);
});

test("payback, cumulative FCF, ROI, IRR and NPV are deterministic over Month 0 through Month 60", () => {
  const result = calculateFinancialScenario("realistic", {}, model);
  assert.equal(result.restaurant_cash_flows.length, 61);
  assert.equal(result.monthly.length, 60);
  assert.equal(result.restaurant_cash_flows[0], -result.restaurant_invested_capital_rub);
  for (let month = 1; month <= 60; month += 1) {
    assert.equal(result.restaurant_cash_flows[month], result.monthly[month - 1].net_cash_flow_rub);
    assert.ok(Math.abs(cumulative(result.restaurant_cash_flows, month) - result.monthly[month - 1].cumulative_net_cash_flow_rub) < 0.01);
  }
  assert.equal(result.restaurant_payback_month, 23);
  assert.ok(cumulative(result.restaurant_cash_flows, 22) < 0);
  assert.ok(cumulative(result.restaurant_cash_flows, 23) >= 0);
  assert.deepEqual([result.year_1.from_month, result.year_1.to_month], [1, 12]);
  assert.deepEqual([result.mature_year.from_month, result.mature_year.to_month], [13, 24]);
  assert.ok(Math.abs(result.restaurant_roi_annual - result.mature_year.free_cash_flow_rub / result.restaurant_invested_capital_rub) < 1e-8);
  assert.ok(result.year_1.ebitda_rub < result.mature_year.ebitda_rub, "ramp-up must depress Year 1 against the mature year");
  assert.ok(result.restaurant_irr_annual !== null && Number.isFinite(result.restaurant_irr_annual));
  assert.equal(result.restaurant_npv_rub, Math.round(npv(result.restaurant_cash_flows, 0.2) * 100) / 100);
});

test("going-concern Month 60 does not recover deposit, inventory, restaurant equipment or brand", () => {
  const rent = calculateFinancialScenario("realistic", {}, model);
  assert.equal(rent.restaurant_cash_flows[60], rent.monthly[59].net_cash_flow_rub);
  assert.equal(rent.monthly[59].prepaid_rent_release_rub, 0);
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
  assert.match(String(capex[15][3]), /'05 Персонал'!\$G\$14/);
  assert.match(String(capex[15][3]), /'06 OPEX'!\$F\$13/);
  assert.match(String(capex[15][3]), /MAX\('02 Допущения'!\$B\$15-'02 Допущения'!\$B\$17,0\)/);
  assert.equal(capex[17][3], "=SUM(D4:D16)");
  assert.equal(String(capex[16][3]).includes("D16+SUM("), true);

  const pnl = get("08 P&L").values;
  assert.equal(pnl[31][1], "=B10-SUM(B13:B31)");
  assert.equal(pnl[38][2], "=MAX(C37,C38)");
  assert.equal(pnl[41][2], "=C32-C39-C41");
  assert.match(String(pnl[35][2]), /'05 Персонал'!G12/);
  assert.match(String(pnl[35][2]), /'05 Персонал'!J12/);
  assert.equal(String(pnl[35][2]).includes("F13"), false, "personnel reserve must stay outside the USN proxy");

  const cashFlow = get("09 Денежный поток").values;
  const realistic = buildFinancialProjection().scenarios.rent.realistic;
  assert.deepEqual(cashFlow[2].slice(1), Array.from({ length: 61 }, (_, month) => month));
  assert.equal(cashFlow[3][2], realistic.monthly[0].calendar_month);
  assert.equal(cashFlow[5][2], realistic.monthly[0].ramp_factor);
  assert.equal(cashFlow[6][1], -realistic.restaurant_invested_capital_rub);
  assert.deepEqual(cashFlow[12].slice(2), realistic.monthly.map((row: any) => row.net_cash_flow_rub));
  assert.equal(cashFlow[13][1], -realistic.restaurant_invested_capital_rub);
  assert.deepEqual(cashFlow[13].slice(2), realistic.monthly.map((row: any) => row.cumulative_net_cash_flow_rub));
});
