import assert from "node:assert/strict";
import test from "node:test";
import { calculateLaunchBudget, defaultLaunchBudgetState, launchModel } from "../src/lib/launch-budget.js";
import { launchFinancials } from "../src/lib/launch-financials.js";
import { economicsData } from "../src/lib/economics.js";

test("/launch-budget uses the ready-premises runtime default while the complete canonical configuration still reconciles to Financial Model capital", () => {
  const runtimeState = defaultLaunchBudgetState();
  const canonicalState = {
    ...runtimeState,
    preparationEnabledCategoryIds: launchModel.preparation.categories
      .filter(category => category.enabled_by_default)
      .map(category => category.id),
  };
  const runtime = calculateLaunchBudget(runtimeState, undefined, launchFinancials);
  const canonical = calculateLaunchBudget(canonicalState, undefined, launchFinancials);

  assert.equal(runtime.operatingReserveSource, "financial_model");
  assert.equal(runtime.operatingReserveRub, launchFinancials.operatingReserveRub);
  assert.ok(Math.abs(runtime.operatingReserveRub! - 20088988.08) < 0.01, "realistic reserve now includes mature scenario marketing 401 726 and household 100 000");
  assert.equal(runtime.launchMarketingRub, 700000);
  assert.equal(runtime.launchItemsRub, 700000 + 180000 + 70000 + 35000 + 1000000);
  assert.equal(runtime.effectivePreparationRub, 3500000);
  assert.equal(runtime.financingRequirementRub, 37120380.74);
  assert.equal(canonical.financingRequirementRub, 45370380.74);
  assert.equal(canonical.financingRequirementRub, launchFinancials.restaurantInvestedCapitalRub);
  assert.equal(canonical.financingRequirementRub, economicsData.scenariosById.realistic.startInvestmentRub);
  assert.equal(canonical.financingRequirementRub! - runtime.financingRequirementRub!, 8250000);
});

test("Financial Model reserve and launch marketing are the same figures on /economics and /launch-budget", () => {
  const realistic = economicsData.scenariosById.realistic;
  assert.equal(launchFinancials.operatingReserveRub, realistic.operatingReserveRub);
  assert.equal(launchFinancials.launchMarketingRub, economicsData.launchMarketingRub);
  assert.equal(launchFinancials.contentStateSha256, economicsData.meta.financialModelContentStateSha256);
  assert.equal(launchFinancials.reserveMonths, 6);
  assert.equal(launchFinancials.monthlyReserveBaseRub * 6, launchFinancials.operatingReserveRub);
});

test("legacy Investor Start Model OPEX snapshot no longer drives the launch-budget total", () => {
  const state = defaultLaunchBudgetState();
  const withFinancials = calculateLaunchBudget(state, undefined, launchFinancials);
  const legacy = calculateLaunchBudget(state);
  assert.equal(legacy.operatingReserveSource, "legacy_snapshot");
  assert.equal(legacy.operatingReserveRub, 15900000, "legacy snapshot path is unchanged for docs-platform CAPEX import");
  assert.equal(legacy.launchItemsRub, 0);
  assert.notEqual(withFinancials.financingRequirementRub, legacy.financingRequirementRub);
  assert.equal(withFinancials.equipment.total, legacy.equipment.total, "CAPEX equipment must not change");
  assert.equal(withFinancials.furnitureRub, legacy.furnitureRub);
  assert.equal(withFinancials.effectivePreparationRub, legacy.effectivePreparationRub);
  assert.equal(withFinancials.contingencyRub, legacy.contingencyRub);
});

test("custom monthly OPEX still overrides the reserve without touching launch items", () => {
  const state = { ...defaultLaunchBudgetState(), operatingExpenseMode: "custom" as const, customMonthlyOpexRub: 3000000 };
  const result = calculateLaunchBudget(state, undefined, launchFinancials);
  assert.equal(result.operatingReserveSource, "custom");
  assert.equal(result.operatingReserveRub, 18000000);
  assert.equal(result.launchMarketingRub, 700000);
});
