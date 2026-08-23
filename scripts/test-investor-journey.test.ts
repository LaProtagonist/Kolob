import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario, configuredEconomicsScenarios } from "../src/lib/configured-economics.js";
import {
  canonicalInvestorConfiguration,
  createTradingPointCohort,
  defaultInvestorConfiguration,
  investorConfigurationIsCanonical,
  restoreInvestorConfiguration,
} from "../src/lib/investor-configuration.js";
import { economicsData } from "../src/lib/economics.js";
import { launchModel } from "../src/lib/launch-budget.js";
import { networkScalingProjection } from "../src/lib/network-scaling.js";

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

  assert.equal(restored.schemaVersion, 2);
  assert.equal(restored.scenarioId, "optimistic");
  assert.equal(restored.launchBudget.monthlyRentRub, 475_000);
  assert.deepEqual(restoreInvestorConfiguration({ scenarioId: "invalid" }), defaultInvestorConfiguration());
  configuredEconomicsScenario(restored);
  assert.deepEqual(sourceHashes(), before);
});

test("custom checks per day is a local scenario override and canonical reset stays exact", () => {
  const before = sourceHashes();
  const canonical = canonicalInvestorConfiguration();
  const canonicalEconomics = configuredEconomicsScenario(canonical);
  const restored = restoreInvestorConfiguration({ ...canonical, customChecksPerDay: 175 });
  const custom = configuredEconomicsScenario(restored);

  assert.equal(restored.customChecksPerDay, 175);
  assert.equal(custom.checksPerDay, 175);
  assert.equal(canonicalEconomics.checksPerDay, 300);
  assert.equal(canonicalEconomics.salesPerMonthRub, economicsData.scenariosById.realistic.salesPerMonthRub);
  assert.ok(custom.salesPerMonthRub < canonicalEconomics.salesPerMonthRub);
  assert.ok(custom.ebitdaRub < canonicalEconomics.ebitdaRub);
  assert.notDeepEqual(custom.cashFlows, canonicalEconomics.cashFlows);
  assert.deepEqual(sourceHashes(), before);
});

test("v2.1 single-point state migrates safely into a v2.2 point cohort", () => {
  const launchBudget = defaultInvestorConfiguration().launchBudget;
  const migrated = restoreInvestorConfiguration({
    schemaVersion: 1,
    launchBudget,
    networkScaling: {
      pointCount: 5,
      pointFormat: "without_seating",
      pointBarEnabled: false,
      productionGrowEnabled: true,
    },
  });

  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.networkScaling.cohorts.length, 1);
  assert.deepEqual(migrated.networkScaling.cohorts[0], {
    ...createTradingPointCohort(launchBudget, {
      id: "cohort-1",
      format: "takeaway",
      realEstateMode: launchBudget.premisesScenario,
      count: 5,
      barEnabled: false,
      totalAreaM2: launchBudget.totalAreaM2,
      kitchenAreaM2: launchBudget.kitchenAreaM2,
      guestAreaM2: launchBudget.guestAreaM2,
      monthlyRentRub: launchBudget.monthlyRentRub,
      purchasePriceRub: launchBudget.purchasePriceRub,
      preparationRub: null,
    }),
    format: "takeaway",
    guestAreaM2: null,
  });
  assert.equal(migrated.networkScaling.productionGrowEnabled, true);

  const nullablePlanningInput = restoreInvestorConfiguration({
    schemaVersion: 2,
    launchBudget,
    networkScaling: {
      cohorts: [{ ...migrated.networkScaling.cohorts[0], monthlyRentRub: null, preparationRub: null }],
      productionGrowEnabled: true,
    },
  });
  assert.equal(nullablePlanningInput.networkScaling.cohorts[0].monthlyRentRub, null);
  assert.equal(nullablePlanningInput.networkScaling.cohorts[0].preparationRub, null);
});

test("fresh and reset network defaults use one neutral point cohort without inherited integrated premises", () => {
  const fresh = defaultInvestorConfiguration();
  const reset = canonicalInvestorConfiguration();
  for (const configuration of [fresh, reset]) {
    assert.equal(configuration.networkScaling.cohorts.length, 1);
    const cohort = configuration.networkScaling.cohorts[0];
    assert.equal(cohort.format, "with_seating");
    assert.equal(cohort.realEstateMode, "rent");
    assert.equal(cohort.count, 1);
    assert.equal(cohort.barEnabled, configuration.launchBudget.barEnabled);
    assert.equal(cohort.totalAreaM2, null);
    assert.equal(cohort.kitchenAreaM2, null);
    assert.equal(cohort.guestAreaM2, null);
    assert.equal(cohort.monthlyRentRub, null);
    assert.equal(cohort.purchasePriceRub, null);
    assert.equal(cohort.preparationRub, null);
  }
  const newTakeawayPurchase = createTradingPointCohort(fresh.launchBudget, { id: "cohort-new", format: "takeaway", realEstateMode: "purchase" });
  assert.equal(newTakeawayPurchase.count, 1);
  assert.equal(newTakeawayPurchase.barEnabled, fresh.launchBudget.barEnabled);
  assert.equal(newTakeawayPurchase.totalAreaM2, null);
  assert.equal(newTakeawayPurchase.kitchenAreaM2, null);
  assert.equal(newTakeawayPurchase.guestAreaM2, null);
  assert.equal(newTakeawayPurchase.monthlyRentRub, null);
  assert.equal(newTakeawayPurchase.purchasePriceRub, null);
  assert.equal(newTakeawayPurchase.preparationRub, null);
});

test("network scaling aggregates independent point cohorts without inventing network economics", () => {
  const before = sourceHashes();
  const canonical = canonicalInvestorConfiguration();
  const seatingRent = createTradingPointCohort(canonical.launchBudget, {
    id: "seating-rent",
    format: "with_seating",
    realEstateMode: "rent",
    count: 5,
    barEnabled: true,
  });
  const takeawayRent = createTradingPointCohort(canonical.launchBudget, {
    id: "takeaway-rent",
    format: "takeaway",
    realEstateMode: "rent",
    count: 10,
    barEnabled: false,
  });
  const mixedNetwork = networkScalingProjection({
    ...canonical,
    networkScaling: {
      ...canonical.networkScaling,
      cohorts: [seatingRent, takeawayRent],
    },
  });
  const changedCounts = networkScalingProjection({
    ...canonical,
    networkScaling: {
      ...canonical.networkScaling,
      cohorts: [{ ...seatingRent, count: 1 }, { ...takeawayRent, count: 1 }],
    },
  });

  const grow = mixedNetwork.productionItems.find((item) => item.id === "grow-module");
  assert.ok(grow, "the canonical grow module is exposed as production infrastructure");
  assert.equal(grow.ownership, "production");
  assert.equal(grow.multiplier, "once");
  assert.equal(mixedNetwork.productionInvestmentRub, changedCounts.productionInvestmentRub);
  assert.equal(mixedNetwork.cohorts.length, 2);
  const seating = mixedNetwork.cohorts.find((cohort) => cohort.cohort.id === "seating-rent")!;
  const takeaway = mixedNetwork.cohorts.find((cohort) => cohort.cohort.id === "takeaway-rent")!;
  assert.equal(seating.confirmedCohortInvestmentRub, seating.confirmedPointInvestmentRub * 5);
  assert.equal(takeaway.confirmedCohortInvestmentRub, takeaway.confirmedPointInvestmentRub * 10);
  assert.equal(
    mixedNetwork.confirmedInvestmentSubtotalRub,
    mixedNetwork.productionInvestmentRub + seating.confirmedCohortInvestmentRub + takeaway.confirmedCohortInvestmentRub,
  );

  assert.equal(seating.pointItems.find((item) => item.id === "point-bar")?.multiplier, "per_point");
  assert.equal(seating.pointItems.find((item) => item.name === "Мебель посадочного зала")?.included, true);
  assert.equal(takeaway.pointItems.find((item) => item.id === "point-bar"), undefined, "bar-off takeaway excludes the optional bar module");
  assert.equal(takeaway.pointItems.find((item) => item.name === "Мебель посадочного зала")?.included, false, "takeaway excludes seating furniture");
  assert.match(seating.pointItems.find((item) => item.id.endsWith(":premises"))?.name ?? "", /Вход в аренду/);

  const takeawayPurchase = networkScalingProjection({
    ...canonical,
    networkScaling: {
      ...canonical.networkScaling,
      cohorts: [{ ...takeawayRent, id: "takeaway-purchase", realEstateMode: "purchase", count: 1 }],
    },
  });
  assert.match(takeawayPurchase.cohorts[0].pointItems.find((item) => item.id.endsWith(":premises"))?.name ?? "", /Покупка помещения/);
  assert.ok(mixedNetwork.unresolvedItems.every((item) => item.ownership === "unresolved" && item.multiplier === "not_aggregated"));
  assert.equal(mixedNetwork.unresolvedItems.find((item) => item.id === "operating_reserve")?.multiplier, "not_aggregated");
  assert.equal(mixedNetwork.unresolvedItems.find((item) => item.id === "contingency")?.multiplier, "not_aggregated");
  assert.equal(mixedNetwork.isPartial, true);
  assert.deepEqual(sourceHashes(), before, "the selector is read-only against canonical sources");
});

test("canonical scenario selection is not presented as a user override", () => {
  const canonical = canonicalInvestorConfiguration();
  assert.equal(investorConfigurationIsCanonical({ ...canonical, scenarioId: "pessimistic" }), true);
  assert.equal(investorConfigurationIsCanonical({ ...canonical, customChecksPerDay: 175 }), false);
});

test("economics UI has no legacy KPI literals and only consumes configured projection values", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/Economics.tsx"), "utf8");
  for (const legacyLiteral of ["45.37", "2.41", "23 месяца", "61.33%", "36,701,298"]) {
    assert.equal(source.includes(legacyLiteral), false, `legacy KPI literal remains: ${legacyLiteral}`);
  }
  assert.match(source, /configuredEconomicsScenario\(configuration\)/);
  assert.match(source, /configuredEconomicsScenarios\(configuration\)/);
});

test("Investor Terminal is a compact runtime surface, not a second hardcoded model", () => {
  const source = fs.readFileSync(path.join(projectRoot, "src/components/InvestorTerminal.tsx"), "utf8");
  const scalingSource = fs.readFileSync(path.join(projectRoot, "src/lib/network-scaling.ts"), "utf8");
  assert.match(source, /configuredEconomicsScenario\(configuration\)/);
  assert.match(source, /setCustomChecksPerDay/);
  assert.match(source, /resetToCanonicalConfiguration/);
  assert.match(scalingSource, /buildCapexRows/);
  assert.match(scalingSource, /configuredEconomicsScenario\(configuration\)/);
  for (const legacyLiteral of ["45.37", "23 месяца", "61.33%", "36,701,298"]) {
    assert.equal(source.includes(legacyLiteral), false, `legacy KPI literal remains: ${legacyLiteral}`);
  }
});
