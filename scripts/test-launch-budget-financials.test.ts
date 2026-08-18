import assert from "node:assert/strict";
import test from "node:test";
import { calculateLaunchBudget, defaultLaunchBudgetState } from "../src/lib/launch-budget.js";
import { launchFinancials } from "../src/lib/launch-financials.js";
import { economicsData } from "../src/lib/economics.js";

test("/launch-budget reconciles exactly to the Financial Model realistic invested capital", () => {
  const state = defaultLaunchBudgetState();
  const result = calculateLaunchBudget(state, undefined, launchFinancials);
  assert.equal(result.operatingReserveSource, "financial_model");
  assert.equal(result.operatingReserveRub, launchFinancials.operatingReserveRub);
  assert.ok(Math.abs(result.operatingReserveRub! - 20088988.08) < 0.01, "realistic reserve now includes mature scenario marketing 401 726 and household 100 000");
  assert.equal(result.launchMarketingRub, 700000);
  assert.equal(result.launchItemsRub, 700000 + 180000 + 70000 + 35000 + 1000000);
  assert.equal(result.financingRequirementRub, 45370380.74);
  assert.equal(result.financingRequirementRub, launchFinancials.restaurantInvestedCapitalRub);
  assert.equal(result.financingRequirementRub, economicsData.scenariosById.realistic.startInvestmentRub);
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
