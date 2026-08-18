import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { economicsData } from "../src/lib/economics.js";
import { pageByPath } from "../src/content/site.js";
import { buildInvestorSummaryContentState } from "../docs-platform/app/src/financial/investor-summary.js";
import { buildFinancialContentState } from "../docs-platform/app/src/financial/financial-model.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sha256(relativePath: string) {
  return createHash("sha256").update(fs.readFileSync(path.join(projectRoot, relativePath))).digest("hex");
}

test("/economics depends on the exact Investor Summary and Financial Model state", () => {
  const financialProjection = JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/financial-model-projection.json"), "utf8"));
  const investorSummary = JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/investor-financial-summary.json"), "utf8"));
  const financialModelSource = financialProjection.meta.content_state.source_files.find((item: { path: string }) => item.path === "docs-platform/working/financial-model.yaml");
  assert.equal(economicsData.meta.investorSummaryDocumentId, "DOC-INVESTOR-FINANCIAL-SUMMARY");
  assert.equal(economicsData.meta.financialModelDocumentId, "DOC-FINANCIAL-MODEL");
  assert.equal(economicsData.meta.financialModelContentStateSha256, financialProjection.meta.content_state.content_state_sha256);
  assert.equal(investorSummary.meta.financial_model_content_state_sha256, financialProjection.meta.content_state.content_state_sha256);
  assert.equal(investorSummary.meta.financial_model_projection_sha256, sha256("docs-platform/generated/financial-model-projection.json"));
  assert.equal(financialModelSource?.sha256, buildFinancialContentState(projectRoot).source_files.find((item: { path: string }) => item.path === "docs-platform/working/financial-model.yaml")?.sha256);
  assert.equal(investorSummary.meta.summary_content_state_sha256, buildInvestorSummaryContentState(projectRoot).content_state_sha256);
  assert.equal(economicsData.meta.investorSummaryContentStateSha256, investorSummary.meta.summary_content_state_sha256);
});

test("scenario KPI and invested capital are presentation mappings, not independent calculations", () => {
  const pessimistic = economicsData.scenariosById.pessimistic;
  const realistic = economicsData.scenariosById.realistic;
  const optimistic = economicsData.scenariosById.optimistic;
  assert.equal(economicsData.defaultScenario, "realistic");
  assert.deepEqual(economicsData.scenarios.map(item => item.checksPerDay), [200, 300, 450]);
  assert.deepEqual(economicsData.scenarios.map(item => item.salesPerMonthRub), [6992400, 10488600, 15732900]);
  assert.deepEqual(economicsData.scenarios.map(item => Math.round(item.ebitdaRub)), [1071180, 2413464, 4119947]);
  assert.deepEqual(economicsData.scenarios.map(item => item.paybackMonth), [48, 23, 15]);
  assert.equal(pessimistic.startInvestmentRub, 42940761.74);
  assert.equal(realistic.startInvestmentRub, 45370380.74);
  assert.equal(optimistic.startInvestmentRub, 49624292.36);
  assert.equal(realistic.breakEvenChecksPerDay, 165.95);
  assert.equal(optimistic.breakEvenChecksPerDay, 193.22);
  assert.deepEqual(economicsData.scenarios.map(item => Math.round(item.year1.ebitdaRub)), [7364521, 22664362, 42532661]);
  for (const scenario of economicsData.scenarios) {
    assert.ok(scenario.year1.ebitdaRub < scenario.matureYear.ebitdaRub, "ramp-up must depress Year 1 against the mature year");
  }
});

test("ramp-up, seasonality and protected bases reach the page from the Financial Model", () => {
  assert.deepEqual(economicsData.rampUpProfile.map(item => item.ramp_factor), [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1]);
  assert.deepEqual(economicsData.rampUpProfile.map(item => item.month), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(
    economicsData.seasonalityProfile.map(item => item.seasonality_coefficient),
    [0.93, 0.75, 0.88, 0.95, 1.02, 0.96, 0.96, 0.98, 1.12, 1.16, 1.1, 1.18],
  );
  assert.equal(economicsData.assumptions.opening_month, 1);
  assert.equal(economicsData.assumptions.raw_materials_rate, 0.3);
  assert.equal(economicsData.assumptions.protected_labor_rate, 0.27);
  assert.equal(economicsData.assumptions.administrative_reserve_rate, 0.02);
  assert.ok(Math.abs(economicsData.assumptions.marketing_per_month_rub - 401726.4) < 0.01);
  assert.deepEqual(economicsData.assumptions.marketing_formula, { fixed_amount_rub: 150000, rate_of_net_revenue: 0.024, ramp_up_floor_rub: 400000, ramp_up_floor_months: 6 });
  assert.deepEqual(economicsData.assumptions.household_formula, { fixed_amount_rub: 50000, variable_amount_rub: 50000, baseline_checks_per_day: 300 });
  assert.deepEqual(economicsData.scenarios.map(item => item.pnl.marketingRub), [317817.6, 401726.4, 527589.6]);
  assert.deepEqual(economicsData.scenarios.map(item => item.pnl.householdRub), [83333.33, 100000, 125000]);
  assert.deepEqual(economicsData.scenarios.map(item => item.headcount), [14, 16, 20]);
  assert.ok(economicsData.investmentBreakEven.min_checks_per_day! > 200 && economicsData.investmentBreakEven.min_checks_per_day! < 300);
  assert.equal(economicsData.launchMarketingRub, 700000);
  assert.equal(economicsData.scenariosById.realistic.protectedLaborApplied, true);
  assert.equal(economicsData.scenariosById.pessimistic.protectedLaborApplied, false);
});

test("investment composition is split into four investor-facing groups", () => {
  const groups = economicsData.scenariosById.realistic.investmentGroups;
  assert.deepEqual(groups.map(group => group.key), ["creation", "launch", "tied", "reserve"]);
  assert.deepEqual(groups.map(group => group.name), ["Создание объекта", "Запуск", "Связанные средства", "Операционный запас"]);
  const launch = groups.find(group => group.key === "launch")!;
  assert.equal(launch.items.some(item => item.key === "launch_marketing" && item.amount_rub === 700000), true);
  const total = groups.reduce((sum, group) => sum + group.amount_rub, 0);
  assert.ok(Math.abs(total - economicsData.scenariosById.realistic.startInvestmentRub) < 0.01);
});

test("product cost hierarchy and EBITDA chain reconcile for every scenario", () => {
  for (const scenario of economicsData.scenarios) {
    const pnl = scenario.pnl;
    assert.equal(pnl.productCostRub, pnl.rawMaterialsRub + pnl.wasteRub + pnl.packagingRub);
    assert.equal(pnl.grossProfitRub, pnl.salesRub - pnl.productCostRub);
    const reconciledEbitda = pnl.grossProfitRub - pnl.personnelRub - pnl.premisesRub - pnl.acquiringRub - pnl.utilitiesRub
      - pnl.marketingRub - pnl.householdRub - pnl.operationsRub - pnl.administrativeReserveRub - pnl.administrativeAndOtherRub;
    assert.ok(Math.abs(pnl.ebitdaRub - reconciledEbitda) < 0.02);
    assert.ok(Math.abs(pnl.marketingRub - (pnl.marketingFormula.fixed_amount_rub + pnl.salesRub * pnl.marketingFormula.rate_of_net_revenue)) < 0.01);
  }
  assert.equal(economicsData.scenariosById.realistic.pnl.productCostRub, 3522443.2);
  assert.equal(economicsData.scenariosById.realistic.pnl.operationsRub, 152000);
  assert.equal(economicsData.scenariosById.realistic.pnl.administrativeAndOtherRub, 97500);
  assert.equal(economicsData.scenariosById.realistic.pnl.householdRub, 100000);
  assert.equal(economicsData.scenariosById.realistic.pnl.administrativeReserveRub, 209772);
  assert.equal(economicsData.marketingStructureReference.length, 8);
});

test("rent/purchase and two public sensitivity slices match the Investor Summary projection", () => {
  assert.equal(economicsData.realEstate.rent.start_capital_rub, 45370380.74);
  assert.equal(economicsData.realEstate.rent.payback_month, 23);
  assert.equal(economicsData.realEstate.purchase.restaurant_capital_rub, 40470380.74);
  assert.equal(economicsData.realEstate.purchase.total_capital_rub, 109470380.74);
  assert.equal(economicsData.realEstate.purchase.combined_payback_month, 47);
  assert.deepEqual(
    economicsData.sensitivity.checksAverageCheck.values.map(item => Number((item.ebitda_margin * 100).toFixed(2))),
    [20.82, 23.01, 24.63],
  );
  assert.deepEqual(
    economicsData.sensitivity.foodCost.map(item => Number((item.ebitda_margin * 100).toFixed(2))),
    [28.21, 23.01, 17.81],
  );
});

test("economics route is private working metadata, prerendered, and not a public navigation item", () => {
  const page = pageByPath("/economics");
  assert.equal(page.path, "/economics");
  assert.equal(page.title, "Экономика объекта — Колобочная");
  assert.equal(page.noindex, true);
  const navigation = fs.readFileSync(path.join(projectRoot, "src/content/navigation.ts"), "utf8");
  const prerender = fs.readFileSync(path.join(projectRoot, "scripts/prerender-dist.cjs"), "utf8");
  assert.doesNotMatch(navigation, /\/economics/);
  assert.match(prerender, /path:\s*["']\/economics["']/);
});
