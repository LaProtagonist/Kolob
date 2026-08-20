import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario, configuredEconomicsScenarios } from "../src/lib/configured-economics.js";
import {
  defaultInvestorConfiguration,
  restoreInvestorConfiguration,
} from "../src/lib/investor-configuration.js";
import { economicsData } from "../src/lib/economics.js";
import { launchModel } from "../src/lib/launch-budget.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPaths = [
  "docs-platform/working/financial-model.yaml",
  "docs-platform/generated/financial-model-projection.json",
  "docs-platform/working/investor-financial-summary.yaml",
  "docs-platform/generated/investor-financial-summary.json",
];

function sourceHashes() {
  return Object.fromEntries(canonicalPaths.map((relativePath) => [
    relativePath,
    createHash("sha256").update(fs.readFileSync(path.join(projectRoot, relativePath))).digest("hex"),
  ]));
}

test("ready-premises default excludes only core construction and engineering work", () => {
  const baseline = defaultInvestorConfiguration();
  const actual = configuredEconomicsScenario(baseline);
  const expected = economicsData.scenariosById.realistic;

  assert.equal(actual.isConfigured, false);
  assert.equal(actual.configurationComplete, true);
  assert.deepEqual(baseline.launchBudget.preparationEnabledCategoryIds, [
    "PREP-LIGHTING",
    "PREP-GUEST-AREA",
    "PREP-BUILT-IN",
    "PREP-DESIGN",
  ]);
  assert.ok(actual.startInvestmentRub < expected.startInvestmentRub);
  assert.equal(actual.salesPerMonthRub, expected.salesPerMonthRub);
  assert.equal(actual.ebitdaRub, expected.ebitdaRub);
  assert.equal(actual.freeCashFlowRub, expected.freeCashFlowRub);
  assert.notDeepEqual(actual.cashFlows, JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/financial-model-projection.json"), "utf8")).scenarios.rent.realistic.restaurant_cash_flows);
  assert.equal(actual.cashFlows[0], -actual.startInvestmentRub);
  assert.ok(actual.paybackMonth !== null && expected.paybackMonth !== null && actual.paybackMonth <= expected.paybackMonth);
  assert.ok(actual.roi > expected.roi);
  assert.ok((actual.irr ?? 0) > (expected.irr ?? 0));
  assert.ok(actual.npvRub > expected.npvRub);
});

test("each excluded preparation module can be enabled again and only changes investment KPI", () => {
  const baseline = defaultInvestorConfiguration();
  const canonical = configuredEconomicsScenario(baseline);

  for (const categoryId of ["PREP-BUILDING", "PREP-ELECTRICAL", "PREP-WATER-DRAINAGE", "PREP-VENTILATION"]) {
    const categoryRub = launchModel.preparation.categories.find((category) => category.id === categoryId)!.amount_rub;
    const configured = configuredEconomicsScenario({
      ...baseline,
      launchBudget: {
        ...baseline.launchBudget,
        preparationEnabledCategoryIds: [...baseline.launchBudget.preparationEnabledCategoryIds, categoryId],
      },
    });

    assert.equal(configured.isConfigured, true);
    assert.ok(Math.abs(
      (configured.startInvestmentRub - canonical.startInvestmentRub)
        - categoryRub * (1 + baseline.launchBudget.contingencyPercent / 100),
    ) < 0.01);
    assert.equal(configured.ebitdaRub, canonical.ebitdaRub);
    assert.equal(configured.freeCashFlowRub, canonical.freeCashFlowRub);
    assert.ok(configured.paybackMonth !== null && canonical.paybackMonth !== null && configured.paybackMonth >= canonical.paybackMonth);
    assert.ok((configured.irr ?? 0) < (canonical.irr ?? 0));
    assert.ok(configured.npvRub < canonical.npvRub);
  }
});

test("CAPEX-only configuration changes investment metrics without changing mature EBITDA", () => {
  const baseline = defaultInvestorConfiguration();
  const configured = configuredEconomicsScenario({
    ...baseline,
    launchBudget: {
      ...baseline.launchBudget,
      preparationMode: "manual",
      preparationManualRub: 12_000_000,
    },
  });
  const canonical = configuredEconomicsScenario(baseline);

  assert.equal(configured.isConfigured, true);
  assert.ok(configured.startInvestmentRub > canonical.startInvestmentRub);
  assert.equal(configured.ebitdaRub, canonical.ebitdaRub);
  assert.equal(configured.freeCashFlowRub, canonical.freeCashFlowRub);
  assert.ok(configured.npvRub < canonical.npvRub);
  assert.ok((configured.irr ?? 0) < (canonical.irr ?? 0));
  assert.ok(configured.paybackMonth !== null && canonical.paybackMonth !== null && configured.paybackMonth >= canonical.paybackMonth);
});

test("rent configuration recalculates capital, OPEX, cash flow and investment KPI", () => {
  const baseline = defaultInvestorConfiguration();
  const configured = configuredEconomicsScenario({
    ...baseline,
    launchBudget: { ...baseline.launchBudget, monthlyRentRub: 500_000 },
  });
  const canonical = configuredEconomicsScenario(baseline);

  assert.equal(configured.premisesScenario, "rent");
  assert.equal(configured.startInvestmentRub - canonical.startInvestmentRub, 2_100_000);
  assert.equal(configured.pnl.premisesRub - canonical.pnl.premisesRub, 150_000);
  assert.equal(configured.ebitdaRub - canonical.ebitdaRub, -150_000);
  assert.ok(configured.freeCashFlowRub < canonical.freeCashFlowRub);
  assert.notDeepEqual(configured.cashFlows, canonical.cashFlows);
  assert.ok(configured.npvRub < canonical.npvRub);
  assert.ok((configured.irr ?? 0) < (canonical.irr ?? 0));
});

test("purchase configuration changes the investment structure and uses the combined property cash flow", () => {
  const baseline = defaultInvestorConfiguration();
  const purchase = configuredEconomicsScenario({
    ...baseline,
    launchBudget: { ...baseline.launchBudget, premisesScenario: "purchase" },
  });
  const rent = configuredEconomicsScenario(baseline);

  assert.equal(purchase.premisesScenario, "purchase");
  assert.equal(purchase.investmentBreakdown.find((item) => item.key === "property")?.amount_rub, 69_000_000);
  assert.equal(purchase.pnl.premisesRub, 0);
  assert.equal(purchase.ebitdaRub - rent.ebitdaRub, 350_000);
  assert.ok(purchase.startInvestmentRub > rent.startInvestmentRub);
  assert.notDeepEqual(purchase.cashFlows, rent.cashFlows);
  assert.ok(purchase.paybackMonth !== null);
});

test("scenario switching stays inside the configured projection", () => {
  const baseline = defaultInvestorConfiguration();
  const scenarios = configuredEconomicsScenarios(baseline);

  assert.deepEqual(scenarios.map((item) => item.id), ["pessimistic", "realistic", "optimistic"]);
  assert.deepEqual(scenarios.map((item) => item.checksPerDay), [200, 300, 450]);
  assert.ok(scenarios.every((item, index) => item.startInvestmentRub < economicsData.scenarios[index].startInvestmentRub));
});

test("runtime configuration is safely restored and never mutates canonical source files", () => {
  const before = sourceHashes();
  const restored = restoreInvestorConfiguration({
    schemaVersion: 0,
    scenarioId: "optimistic",
    launchBudget: { ...defaultInvestorConfiguration().launchBudget, monthlyRentRub: 475_000 },
  });

  assert.equal(restored.schemaVersion, 1);
  assert.equal(restored.scenarioId, "optimistic");
  assert.equal(restored.launchBudget.monthlyRentRub, 475_000);
  assert.deepEqual(restoreInvestorConfiguration({ scenarioId: "invalid" }), defaultInvestorConfiguration());
  configuredEconomicsScenario(restored);
  assert.deepEqual(sourceHashes(), before);
});

test("economics UI has no legacy KPI literals and only consumes configured projection values", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/Economics.tsx"), "utf8");
  for (const legacyLiteral of ["45.37", "2.41", "23 месяца", "61.33%", "36,701,298"]) {
    assert.equal(source.includes(legacyLiteral), false, `legacy KPI literal remains: ${legacyLiteral}`);
  }
  assert.match(source, /configuredEconomicsScenario\(configuration\)/);
  assert.match(source, /configuredEconomicsScenarios\(configuration\)/);
});
