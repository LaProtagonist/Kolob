import assert from "node:assert/strict";
import test from "node:test";
import { configuredEconomicsScenario } from "../src/lib/configured-economics.js";
import {
  calculateFinancialMonthlyResult,
  financialCoverage,
} from "../src/lib/financial-core.js";
import { defaultInvestorConfiguration } from "../src/lib/investor-configuration.js";

test("shared tax and FCF primitive retains the governed USN floor", () => {
  const regular = calculateFinancialMonthlyResult(500, 10_000, 8_000, 100, {
    regularUsnRate: 0.07,
    minimumUsnRate: 0.01,
  });
  assert.deepEqual(regular, {
    taxableBaseRub: 2_000,
    regularUsnRub: 140,
    minimumUsnRub: 100,
    taxRub: 140,
    ebitdaRub: 500,
    maintenanceCapexRub: 100,
    freeCashFlowRub: 260,
  });

  const minimum = calculateFinancialMonthlyResult(500, 10_000, 9_500, 100, {
    regularUsnRate: 0.07,
    minimumUsnRate: 0.01,
  });
  assert.equal(minimum.taxRub, 100, "the 1% minimum remains active when the regular base is lower");
  assert.equal(minimum.freeCashFlowRub, 300);
});

test("Current Base monthly FCF exposes the same EBITDA-tax-maintenance identity for Network reuse", () => {
  const scenario = configuredEconomicsScenario(defaultInvestorConfiguration());
  assert.equal(scenario.context, "current_base_object");
  for (const month of scenario.monthlyProjection) {
    assert.equal(
      Math.abs(month.ebitdaRub - month.taxRub - month.maintenanceCapexRub - month.operatingFreeCashFlowRub) < 0.02,
      true,
      `Month ${month.month} must retain the shared FCF basis`,
    );
  }
});

test("coverage remains available when a model is partial, and only invalid inputs make it invalid", () => {
  assert.equal(financialCoverage([{ id: "wash", category: "unpriced_capex", message: "Unpriced wash kit", material: true }]).status, "partial");
  assert.equal(financialCoverage([{ id: "input", category: "invalid_input", message: "Missing required revenue input", material: true }]).status, "invalid");
});
