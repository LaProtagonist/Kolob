import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildInvestorFinancialSummary,
  buildInvestorFinancialSummaryFromInputs,
  checkInvestorFinancialSummary,
  readInvestorSummarySource,
} from "../src/financial/investor-summary.js";
import { buildInvestorSummaryGooglePayload, validateInvestorSummaryGooglePayload } from "../src/financial/investor-summary-google-sheet.js";
import { readFinancialModel } from "../src/financial/financial-model.js";
import { readRevenueModel } from "../src/investor/revenue-model.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const financialProjectionPath = path.join(projectRoot, "docs-platform/generated/financial-model-projection.json");
const financialProjection = JSON.parse(fs.readFileSync(financialProjectionPath, "utf8"));

function approximately(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test("Investor Summary projection is deterministic and depends on the exact Financial Model content hash", () => {
  const summary = buildInvestorFinancialSummary();
  const check = checkInvestorFinancialSummary();
  assert.equal(summary.meta.financial_model_document_id, "DOC-FINANCIAL-MODEL");
  assert.equal(summary.meta.financial_model_content_state_sha256, financialProjection.meta.content_state.content_state_sha256);
  assert.equal(check.validation, "OK");
  assert.equal(check.path, "docs-platform/generated/investor-financial-summary.json");
  assert.match(check.sha256, /^[a-f0-9]{64}$/);
  assert.equal(check.financial_model_content_state_sha256, financialProjection.meta.content_state.content_state_sha256);
});

test("Financial content-hash change makes Investor Summary stale", () => {
  const source = structuredClone(readInvestorSummarySource());
  source.dependency.content_state_sha256 = "0".repeat(64);
  assert.throws(() => buildInvestorFinancialSummaryFromInputs({
    source,
    financialProjection,
    financialModel: readFinancialModel(),
    revenueModel: readRevenueModel(),
    financialProjectionSha256: "1".repeat(64),
    summaryContentStateSha256: "2".repeat(64),
  }), /Investor Financial Summary is stale/);
});

test("Realistic headline KPI exactly mirror the master projection", () => {
  const summary = buildInvestorFinancialSummary();
  const master = financialProjection.scenarios.rent.realistic;
  assert.equal(summary.headline.start_investment_rub, master.restaurant_invested_capital_rub);
  assert.equal(summary.headline.sales_per_month_rub, master.gross_revenue_rub);
  assert.equal(summary.headline.average_check_rub, master.average_check_rub);
  assert.equal(summary.headline.checks_per_day, master.checks_per_day);
  assert.equal(summary.headline.ebitda_rub, master.ebitda_rub);
  assert.equal(summary.headline.ebitda_margin, master.ebitda_margin);
  assert.equal(summary.headline.break_even_checks_per_day, master.break_even_checks_per_day);
  assert.equal(summary.headline.free_cash_flow_rub, master.operating_free_cash_flow_rub);
  assert.equal(summary.headline.payback_month, master.restaurant_payback_month);
  assert.equal(summary.headline.roi, master.restaurant_roi_annual);
  assert.equal(summary.headline.irr, master.restaurant_irr_annual);
  assert.equal(summary.headline.npv_rub, master.restaurant_npv_rub);
  assert.equal(Math.round(summary.headline.start_investment_rub), Math.round(master.restaurant_invested_capital_rub));
  assert.equal(Math.round(summary.headline.ebitda_rub), Math.round(master.ebitda_rub));
  assert.equal(Math.round(summary.headline.free_cash_flow_rub), Math.round(master.operating_free_cash_flow_rub));
  approximately(summary.headline.ebitda_margin, master.ebitda_margin);
});

test("All three scenario outputs and payback months match the master projection", () => {
  const summary = buildInvestorFinancialSummary();
  const ids = ["pessimistic", "realistic", "optimistic"] as const;
  assert.deepEqual(summary.scenario_comparison.map(item => item.id), ids);
  ids.forEach((id, index) => {
    const output = summary.scenario_comparison[index];
    const master = financialProjection.scenarios.rent[id];
    assert.equal(output.checks_per_day, master.checks_per_day);
    assert.equal(output.sales_per_month_rub, master.gross_revenue_rub);
    assert.equal(output.ebitda_rub, master.ebitda_rub);
    assert.equal(output.free_cash_flow_rub, master.operating_free_cash_flow_rub);
    assert.equal(output.payback_month, master.restaurant_payback_month);
    assert.equal(output.roi, master.restaurant_roi_annual);
    assert.equal(output.irr, master.restaurant_irr_annual);
    assert.equal(output.npv_rub, master.restaurant_npv_rub);
  });
  assert.deepEqual(summary.scenario_comparison.map(item => item.payback_month), ids.map(id => financialProjection.scenarios.rent[id].restaurant_payback_month));
});

test("Investment presentation ties every row to the exact master invested capital", () => {
  const summary = buildInvestorFinancialSummary();
  const rows = Object.fromEntries(summary.investments.breakdown.map(item => [item.key, item.amount_rub]));
  assert.equal(rows.equipment, financialProjection.launch_capital.equipment_rub);
  assert.equal(rows.furniture, financialProjection.launch_capital.furniture_rub);
  assert.equal(rows.preparation, financialProjection.launch_capital.preparation_rub);
  assert.equal(rows.contingency, financialProjection.launch_capital.contingency_rub);
  assert.equal(rows.operating_reserve, financialProjection.scenarios.rent.realistic.fixed_opex_reserve_rub);
  assert.equal(rows.prepaid_rent, 4200000);
  assert.equal(rows.deposit, 700000);
  approximately(summary.investments.breakdown.reduce((total, item) => total + item.amount_rub, 0), summary.investments.total_rub, 0.02);
  assert.equal(summary.investments.total_rub, financialProjection.scenarios.rent.realistic.restaurant_invested_capital_rub);
  assert.notEqual(summary.investments.full_operating_reserve_rub, summary.investments.fixed_operating_reserve_rub);
});

test("P&L groups preserve the master EBITDA, tax, result and free cash flow", () => {
  const summary = buildInvestorFinancialSummary();
  const pnl = summary.income_statement;
  const master = financialProjection.scenarios.rent.realistic;
  assert.equal(pnl.gross_profit_rub, master.gross_profit_rub);
  assert.equal(pnl.expense_groups.marketing_rub, master.marketing_rub);
  assert.equal(pnl.expense_groups.operations_rub, Object.values(pnl.operations_detail).reduce((total: number, value: any) => total + Number(value), 0));
  assert.equal(pnl.expense_groups.administrative_rub, Object.values(pnl.administrative_detail).reduce((total: number, value: any) => total + Number(value), 0));
  assert.equal(pnl.expense_groups.other_rub, Object.values(pnl.other_detail).reduce((total: number, value: any) => total + Number(value), 0));
  assert.equal(pnl.expense_groups.administrative_reserve_rub, master.administrative_reserve_rub);
  assert.equal(pnl.expense_groups.household_rub, master.household_rub);
  assert.equal(pnl.ebitda_rub, master.ebitda_rub);
  assert.equal(pnl.depreciation_rub, master.depreciation_rub);
  assert.equal(pnl.tax_rub, master.tax_due_rub);
  assert.equal(pnl.net_operating_result_rub, master.net_operating_result_rub);
  assert.equal(pnl.maintenance_capex_rub, master.maintenance_capex_rub);
  assert.equal(pnl.free_cash_flow_rub, master.operating_free_cash_flow_rub);
});

test("Investor Google payload has exactly five Russian presentation tabs and no technical fields", () => {
  const payload = buildInvestorSummaryGooglePayload();
  assert.deepEqual(payload.sheets.map(item => item.name), ["Основные показатели", "Доходы и расходы", "Инвестиции", "Сценарии", "Допущения"]);
  assert.ok(payload.sheets.every(item => item.frozen_rows === 4 && item.frozen_columns === 0));
  assert.deepEqual(validateInvestorSummaryGooglePayload(payload), []);
  const main = payload.sheets[0];
  const scenarioSection = main.values.findIndex(row => row[0] === "Сравнение трёх сценариев");
  assert.deepEqual(main.values[scenarioSection + 1], ["Показатель", "Пессимистичный", "", "Реалистичный", "", "", "Оптимистичный", "", ""]);
  const publicText = payload.sheets.flatMap(item => item.values.flat()).join("\n");
  for (const term of ["content_state", "sha256", "registry", "owner_approved", "requires_confirmation", "research"]) assert.doesNotMatch(publicText, new RegExp(term, "i"));
  assert.match(publicText, /Расчёт основан на текущих рабочих параметрах модели/);
  assert.match(publicText, /Продажи рассчитываются с сезонной кривой Санкт-Петербурга/);
  assert.match(publicText, /Расчёт выполнен для открытия в январе/);
});
