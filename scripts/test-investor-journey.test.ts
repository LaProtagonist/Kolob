import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario, configuredEconomicsScenarios } from "../src/lib/configured-economics.js";
import {
  currentBaseObjectFullPreparationConfiguration,
  historicalIntegratedPilotConfiguration,
  applyNetworkRolloutPreset,
  applyLocationRentPreset,
  createNetworkPointCohort,
  createTradingPointCohort,
  defaultInvestorConfiguration,
  currentNetworkRolloutSize,
  financialProjectionContextForConfiguration,
  investorConfigurationIsCurrentBaseFullPreparation,
  restoreInvestorConfiguration,
  updateCohortAreaFromRentPreset,
  updateCohortMonthlyRent,
  updateCohortRentRate,
} from "../src/lib/investor-configuration.js";
import { economicsData } from "../src/lib/economics.js";
import { launchModel } from "../src/lib/launch-budget.js";
import { baseObjectFinancialProjection, networkEconomicsProjection, networkScalingProjection, pointDirectOpexProjection } from "../src/lib/network-scaling.js";
import { networkTemporalProjection } from "../src/lib/network-temporal.js";
import { pointPreparationProjection } from "../src/lib/point-preparation.js";
import { pointOperationalProjection, pointOperationalProjectionForMonthlyChecks } from "../src/lib/point-operations.js";
import { canonicalTemporalAssumptions, locationRentPreset, networkLocationRentPresets, pointStaffingProjection, productionStaffingProjection, sharedManagerPayrollProjection } from "../src/lib/network-planning.js";
import { calculateRevenueModel } from "../src/lib/revenue-model.js";
import { capexData } from "../src/lib/capex-runtime.js";
import { financialModelAllocationItemIds, investorStartAllocationFieldIds, networkPlanningAllocationItemIds, physicalAllocationIntegrityErrors, physicalAllocationMap } from "../src/lib/physical-allocation.js";

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
  assert.equal(baseline.launchBudget.rentFreeMonths, 2, "the Base Object uses the governed two-month planning term");
  assert.ok(actual.startInvestmentRub < expected.startInvestmentRub);
  assert.equal(actual.salesPerMonthRub, expected.salesPerMonthRub);
  assert.equal(actual.ebitdaRub, expected.ebitdaRub - 150_000, "the current Base Object uses the separately governed 500k flagship rent reference");
  assert.ok(Math.abs(actual.freeCashFlowRub - (expected.freeCashFlowRub - 139_500)) < 0.01);
  assert.notDeepEqual(actual.cashFlows, JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/financial-model-projection.json"), "utf8")).scenarios.rent.realistic.restaurant_cash_flows);
  assert.equal(actual.cashFlows[0], -actual.startInvestmentRub);
  assert.ok(actual.paybackMonth !== null && expected.paybackMonth !== null && actual.paybackMonth <= expected.paybackMonth);
  assert.ok(actual.roi > expected.roi);
  assert.ok((actual.irr ?? 0) > (expected.irr ?? 0));
  assert.ok(actual.npvRub > expected.npvRub);
});

test("base-object rent holidays use configured monthly rent cash flow and migrate saved state safely", () => {
  const baseline = defaultInvestorConfiguration();
  const withoutHolidays = configuredEconomicsScenario({
    ...baseline,
    launchBudget: { ...baseline.launchBudget, rentFreeMonths: 0 },
  });
  const withHolidays = configuredEconomicsScenario(baseline);

  assert.equal(withHolidays.startInvestmentRub, withoutHolidays.startInvestmentRub, "rent holidays do not turn into a synthetic CAPEX discount");
  assert.equal(withHolidays.monthlyProjection[0]?.opexRub, withoutHolidays.monthlyProjection[0]!.opexRub - 500_000);
  assert.equal(withHolidays.monthlyProjection[1]?.opexRub, withoutHolidays.monthlyProjection[1]!.opexRub - 500_000);
  assert.equal(withHolidays.monthlyProjection[2]?.opexRub, withoutHolidays.monthlyProjection[2]!.opexRub);
  assert.notDeepEqual(withHolidays.cashFlows, withoutHolidays.cashFlows, "rent holidays flow through the existing monthly cash-flow projection");

  const savedWithoutField = { ...baseline.launchBudget } as Record<string, unknown>;
  delete savedWithoutField.rentFreeMonths;
  const migrated = restoreInvestorConfiguration({ schemaVersion: 7, launchBudget: savedWithoutField });
  const explicitZero = restoreInvestorConfiguration({
    schemaVersion: 7,
    launchBudget: { ...baseline.launchBudget, rentFreeMonths: 0 },
  });
  assert.equal(migrated.launchBudget.rentFreeMonths, 2, "legacy Base Object state gains the governed default");
  assert.equal(explicitZero.launchBudget.rentFreeMonths, 0, "an explicit saved zero remains an intentional user choice");
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
    launchBudget: { ...baseline.launchBudget, monthlyRentRub: 550_000 },
  });
  const canonical = configuredEconomicsScenario(baseline);

  assert.equal(configured.premisesScenario, "rent");
  assert.equal(configured.startInvestmentRub - canonical.startInvestmentRub, 700_000);
  assert.equal(configured.pnl.premisesRub - canonical.pnl.premisesRub, 50_000);
  assert.equal(configured.ebitdaRub - canonical.ebitdaRub, -50_000);
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
  assert.equal(purchase.ebitdaRub - rent.ebitdaRub, 500_000);
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

  assert.equal(restored.schemaVersion, 8);
  assert.equal(restored.scenarioId, "optimistic");
  assert.equal(restored.launchBudget.monthlyRentRub, 475_000);
  assert.deepEqual(restoreInvestorConfiguration({ scenarioId: "invalid" }), defaultInvestorConfiguration());
  configuredEconomicsScenario(restored);
  assert.deepEqual(sourceHashes(), before);
});

test("custom checks per day is a local scenario override and canonical reset stays exact", () => {
  const before = sourceHashes();
  const canonical = currentBaseObjectFullPreparationConfiguration();
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

test("v2.1 through v2.3 saved state migrates safely into v2.4 cohorts", () => {
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

  assert.equal(migrated.schemaVersion, 8);
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
      prepaymentMonths: launchBudget.prepaymentMonths,
      securityDepositMonths: launchBudget.securityDepositMonths,
      preparationRub: null,
    }),
    format: "takeaway",
    guestAreaM2: null,
  });
  assert.equal(migrated.networkScaling.productionGrowEnabled, true);
  assert.equal(migrated.networkScaling.cohorts[0].locationType, "street");
  assert.equal(migrated.networkScaling.cohorts[0].extractionAvailable, null);
  assert.equal(migrated.networkScaling.cohorts[0].initialInventoryDays, 3);

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
  assert.deepEqual(nullablePlanningInput.networkScaling.cohorts[0].sales, {
    mode: "baseline",
    checksPerDay: null,
    averageCheckRub: null,
  });

  const legacyNetworkPoint = createNetworkPointCohort(launchBudget, {
    id: "cohort-2",
    prepaymentMonths: null,
    securityDepositMonths: null,
    utilitiesMonthlyRub: null,
    videoAllowanceRub: null,
    alarmAllowanceRub: null,
  });
  const upgraded = restoreInvestorConfiguration({
    schemaVersion: 5,
    launchBudget,
    networkScaling: { cohorts: [createTradingPointCohort(launchBudget, { id: "cohort-1" }), legacyNetworkPoint] },
  });
  assert.deepEqual(
    [upgraded.networkScaling.cohorts[1].prepaymentMonths, upgraded.networkScaling.cohorts[1].securityDepositMonths, upgraded.networkScaling.cohorts[1].utilitiesMonthlyRub, upgraded.networkScaling.cohorts[1].videoAllowanceRub, upgraded.networkScaling.cohorts[1].alarmAllowanceRub],
    [12, 2, 45_000, 70_000, 35_000],
    "v5 network cohorts gain only the newly approved street defaults when their values were empty",
  );
});

test("fresh and reset network defaults retain the base object and add the approved first-stage rollout", () => {
  const fresh = defaultInvestorConfiguration();
  const reset = currentBaseObjectFullPreparationConfiguration();
  for (const configuration of [fresh, reset]) {
    assert.equal(configuration.networkScaling.cohorts.length, 5);
    const baseCohort = configuration.networkScaling.cohorts[0];
    assert.equal(baseCohort.format, "with_seating");
    assert.equal(baseCohort.totalAreaM2, null, "the integrated base object is not replaced by a network preset");
    const expected = [
      ["nevsky-premium", "takeaway", "creative_cluster", 40, 175, 4_000, 160_000],
      ["central-high-traffic", "takeaway", "foodhall", 25, 215, null, null],
      ["historic-center-core", "with_seating", "street", 60, 175, 3_500, 210_000],
      ["historic-center-value", "takeaway", "street", 40, 150, 2_200, 88_000],
    ] as const;
    assert.deepEqual(configuration.networkScaling.cohorts.slice(1).map((cohort) => [cohort.locationRentPresetId, cohort.format, cohort.locationType, cohort.totalAreaM2, cohort.sales.checksPerDay, cohort.rentPerM2Rub, cohort.monthlyRentRub]), expected);
    assert.equal(configuration.networkScaling.cohorts.slice(1).reduce((total, cohort) => total + cohort.count, 0), 4);
    assert.equal(configuration.networkScaling.cohorts.slice(1).reduce((total, cohort) => total + (cohort.monthlyRentRub ?? 0), 0), 458_000);
    assert.equal(currentNetworkRolloutSize(configuration.networkScaling), 4);
    const projection = networkScalingProjection(configuration);
    assert.equal(projection.sales.checksPerDay, 1_015, "base 300 checks plus the four approved additional point profiles");
    for (const networkCohort of configuration.networkScaling.cohorts.slice(1)) {
      assert.equal(networkCohort.realEstateMode, "rent");
      assert.equal(networkCohort.count, 1);
      assert.equal(networkCohort.purchasePriceRub, null);
      assert.equal(networkCohort.initialInventoryDays, 3);
      assert.equal(networkCohort.barEnabled, true);
      assert.equal(networkCohort.sales.mode, "custom");
      assert.ok(networkCohort.sales.averageCheckRub !== null, "each rollout group keeps the canonical average check as an explicit custom sales input");
    }
    const streetGroups = configuration.networkScaling.cohorts.slice(1).filter((cohort) => cohort.locationType === "street");
    assert.ok(streetGroups.every((cohort) => cohort.prepaymentMonths === 12 && cohort.securityDepositMonths === 2));
    assert.ok(streetGroups.every((cohort) => cohort.utilitiesMonthlyRub !== null && cohort.videoAllowanceRub !== null && cohort.alarmAllowanceRub !== null));
    const creative = configuration.networkScaling.cohorts.find((cohort) => cohort.locationType === "creative_cluster")!;
    const foodhall = configuration.networkScaling.cohorts.find((cohort) => cohort.locationType === "foodhall")!;
    assert.deepEqual([creative.rentPerM2Rub, creative.monthlyRentRub, creative.prepaymentMonths, creative.securityDepositMonths, creative.utilitiesMonthlyRub], [4_000, 160_000, 1, 1, 30_000], "Creative Cluster receives its editable contract defaults");
    assert.deepEqual([foodhall.revenueSharePercent, foodhall.minimumGuaranteeMonthlyRub, foodhall.serviceChargeMonthlyRub, foodhall.storageRentMonthlyRub, foodhall.prepaymentMonths, foodhall.securityDepositMonths], [17, 250_000, 50_000, 20_000, null, null], "Foodhall receives its editable contract defaults without street entry terms");
    const byPreset = Object.fromEntries(projection.cohorts.slice(1).map((cohort) => [cohort.cohort.locationRentPresetId, cohort]));
    assert.equal(byPreset["historic-center-core"].pointItems.find((item) => item.id.endsWith(":point-preparation"))?.amountRub, 3_300_000, "60 m² seating retains all eight preparation categories");
    assert.equal(byPreset["historic-center-value"].pointItems.find((item) => item.id.endsWith(":point-preparation"))?.amountRub, 2_040_000, "40 m² takeaway omits only guest-area preparation");
    assert.equal(byPreset["nevsky-premium"].pointItems.find((item) => item.id.endsWith(":point-preparation"))?.amountRub, 1_140_000, "Creative Cluster starts with venue adaptation and preparation");
    assert.equal(byPreset["central-high-traffic"].pointItems.find((item) => item.id.endsWith(":point-preparation"))?.amountRub, 712_500, "Foodhall starts with venue adaptation and preparation");
    assert.equal(byPreset["nevsky-premium"].directOpex.isPartial, false, "Creative Cluster contract defaults complete direct OPEX");
    assert.equal(byPreset["central-high-traffic"].directOpex.isPartial, false, "Foodhall contract defaults complete direct OPEX");
    assert.equal(projection.planningLaunch.fitoutRub, 0, "former generic venue fitout is not counted beside category preparation");
    assert.ok([byPreset["nevsky-premium"], byPreset["central-high-traffic"]].every((cohort) => !cohort.pointItems.some((item) => item.id.endsWith(":fitout"))), "default venue groups do not add a second fitout line");
  }
  const newTakeawayPurchase = createTradingPointCohort(fresh.launchBudget, { id: "cohort-new", format: "takeaway", realEstateMode: "purchase" });
  assert.equal(newTakeawayPurchase.count, 1);
  assert.equal(newTakeawayPurchase.barEnabled, fresh.launchBudget.barEnabled);
  assert.equal(newTakeawayPurchase.totalAreaM2, null);
  assert.equal(newTakeawayPurchase.kitchenAreaM2, null);
  assert.equal(newTakeawayPurchase.guestAreaM2, null);
  assert.equal(newTakeawayPurchase.monthlyRentRub, null);
  assert.equal(newTakeawayPurchase.purchasePriceRub, null);
  assert.equal(newTakeawayPurchase.prepaymentMonths, null);
  assert.equal(newTakeawayPurchase.securityDepositMonths, null);
  assert.equal(newTakeawayPurchase.preparationRub, null);
  assert.deepEqual(newTakeawayPurchase.sales, { mode: "baseline", checksPerDay: null, averageCheckRub: null });
});

test("network rollout presets update only counts and keep the four approved districts", () => {
  const fresh = defaultInvestorConfiguration();
  const eight = applyNetworkRolloutPreset(fresh.networkScaling, fresh.launchBudget, 8);
  const twelve = applyNetworkRolloutPreset(eight, fresh.launchBudget, 12);
  assert.equal(currentNetworkRolloutSize(eight), 8);
  assert.equal(eight.cohorts.slice(1).reduce((total, cohort) => total + cohort.count, 0), 8);
  assert.ok(eight.cohorts.slice(1).every((cohort) => cohort.count === 2));
  assert.equal(currentNetworkRolloutSize(twelve), 12);
  assert.equal(twelve.cohorts.slice(1).reduce((total, cohort) => total + cohort.count, 0), 12);
  assert.ok(twelve.cohorts.slice(1).every((cohort) => cohort.count === 3));
  assert.ok(twelve.cohorts.slice(1).every((cohort) => cohort.locationRentPresetId !== "ligovsky-21-flagship"));
  assert.ok(networkLocationRentPresets().every((preset) => preset.id !== "ligovsky-21-flagship"), "the flagship is not selectable for additional network points");
});

test("temporal rollout keeps canonical ramp and seasonality separate for every opening wave", () => {
  const configuration = defaultInvestorConfiguration();
  const scenario = configuredEconomicsScenario(configuration);
  const base = baseObjectFinancialProjection(scenario);
  const temporal = networkTemporalProjection(configuration, base, scenario);
  const scaling = networkScalingProjection(configuration);
  const assumptions = canonicalTemporalAssumptions();

  assert.deepEqual(assumptions.rampUpProfile.map((row) => row.factor), [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1]);
  assert.deepEqual(assumptions.seasonalityProfile.map((row) => row.factor), [0.93, 0.75, 0.88, 0.95, 1.02, 0.96, 0.96, 0.98, 1.12, 1.16, 1.1, 1.18]);
  assert.deepEqual(
    configuration.networkScaling.cohorts.slice(1).map((cohort) => cohort.openingWaves),
    [[{ openingMonth: 4, count: 1 }], [{ openingMonth: 7, count: 1 }], [{ openingMonth: 10, count: 1 }], [{ openingMonth: 13, count: 1 }]],
    "the four default points open sequentially, never together in month zero",
  );
  assert.equal(temporal.expansion.months[0].activePointCount, 0);
  assert.equal(temporal.expansion.months[3].capexRub! > 0, true, "launch CAPEX occurs before the first additional opening");
  assert.equal(temporal.expansion.months[4].activePointCount, 1);
  assert.equal(temporal.expansion.months[7].activePointCount, 2);
  assert.equal(temporal.expansion.months[13].activePointCount, 4);
  assert.equal(temporal.expansion.paybackMonth! >= 4, true, "payback starts with the expansion programme, not an empty month zero");

  const creative = scaling.cohorts.find((cohort) => cohort.cohort.locationType === "creative_cluster")!;
  const creativeTemporal = temporal.expansion.groups.find((group) => group.cohortId === creative.cohort.id)!;
  const aprilSeasonality = assumptions.seasonalityProfile.find((row) => row.month === 4)!.factor;
  const openingChecks = creative.operational.sales.checksPerDay! * assumptions.rampUpProfile[0].factor * aprilSeasonality;
  const creativeOpeningOperations = pointOperationalProjectionForMonthlyChecks(configuration, creative.cohort, openingChecks, creative.operational.sales.averageCheckRub!);
  const rentFreeDirectOpex = pointDirectOpexProjection(creative.cohort, creativeOpeningOperations, { rentChargeRub: 0 });
  assert.equal(creativeTemporal.months[4].opexRub, rentFreeDirectOpex.directOpexPerPointRub, "creative-cluster rent is zero during its two rent-free months");
  const juneSeasonality = assumptions.seasonalityProfile.find((row) => row.month === 6)!.factor;
  const postHolidayChecks = creative.operational.sales.checksPerDay! * assumptions.rampUpProfile[2].factor * juneSeasonality;
  const postHolidayOperations = pointOperationalProjectionForMonthlyChecks(configuration, creative.cohort, postHolidayChecks, creative.operational.sales.averageCheckRub!);
  const postHolidayDirectOpex = pointDirectOpexProjection(creative.cohort, postHolidayOperations);
  assert.equal(creativeTemporal.months[6].opexRub, postHolidayDirectOpex.directOpexPerPointRub, "normal rent begins after the rent-free period");

  const foodhall = scaling.cohorts.find((cohort) => cohort.cohort.locationType === "foodhall")!;
  const foodhallTemporal = temporal.expansion.groups.find((group) => group.cohortId === foodhall.cohort.id)!;
  for (const month of [7, 13]) {
    const operatingAge = month - foodhallTemporal.firstOpeningMonth! + 1;
    const factor = assumptions.rampUpProfile[Math.min(operatingAge, assumptions.rampUpProfile.length) - 1]!.factor
      * assumptions.seasonalityProfile[(month - 1) % assumptions.seasonalityProfile.length]!.factor;
    const operational = pointOperationalProjectionForMonthlyChecks(configuration, foodhall.cohort, foodhall.operational.sales.checksPerDay! * factor, foodhall.operational.sales.averageCheckRub!);
    const direct = pointDirectOpexProjection(foodhall.cohort, operational);
    const occupancy = direct.lines.find((line) => line.id === "foodhall-occupancy")!;
    assert.equal(occupancy.amountRub, Math.max(operational.sales.revenuePerPointRub! * 0.17, 250_000), `Foodhall payment uses actual month-${month} sales`);
    assert.equal(foodhallTemporal.months[month].opexRub, direct.directOpexPerPointRub, `Foodhall direct OPEX follows actual month-${month} sales`);
  }

  assert.equal(temporal.expansion.operatingReserveRub, scaling.operating.pointDirectOpexRub! * configuration.launchBudget.operatingReserveMonths, "expansion reserve is the calculated additional-point OPEX times the selected horizon");
  const staticEconomics = networkEconomicsProjection(configuration, base);
  assert.ok(temporal.expansion.paybackMonth! >= staticEconomics.expansion.paybackMonths!, "staggered openings and ramp cannot use the immediate steady-state payback");
});

test("network size presets create sequential repeated waves and bar equipment includes only the compact point ice maker", () => {
  const fresh = defaultInvestorConfiguration();
  const twelve = applyNetworkRolloutPreset(fresh.networkScaling, fresh.launchBudget, 12);
  for (const cohort of twelve.cohorts.slice(1)) {
    assert.equal(cohort.openingWaves.length, 3);
    assert.deepEqual(cohort.openingWaves.map((wave) => wave.count), [1, 1, 1]);
    assert.equal(cohort.openingWaves[1]!.openingMonth - cohort.openingWaves[0]!.openingMonth, 12);
    assert.equal(cohort.openingWaves[2]!.openingMonth - cohort.openingWaves[1]!.openingMonth, 12);
  }
  const barOn = networkScalingProjection(fresh).cohorts[1]!;
  const iceMaker = barOn.pointItems.find((item) => item.id === "point-bar")?.detail?.find((item) => item.id === "CAPEX-02-013");
  assert.deepEqual([iceMaker?.quantity, iceMaker?.amountRub], [1, 36_050], "a bar-enabled point receives one compact point ice maker from the canonical register");
  const barOff = networkScalingProjection({
    ...fresh,
    networkScaling: { ...fresh.networkScaling, cohorts: fresh.networkScaling.cohorts.map((cohort, index) => index === 1 ? { ...cohort, barEnabled: false } : cohort) },
  }).cohorts[1]!;
  assert.equal(barOff.pointItems.find((item) => item.id === "point-bar"), undefined, "bar-off removes the point bar and its compact ice maker without touching production ice equipment");
});

test("point preparation proxy keeps eight reference categories separate and omits guest work for takeaway", () => {
  const takeaway = pointPreparationProjection({
    areaM2: 40,
    format: "takeaway",
    mode: "breakdown",
    enabledCategoryIds: ["PREP-BUILDING", "PREP-ELECTRICAL", "PREP-WATER-DRAINAGE", "PREP-VENTILATION", "PREP-LIGHTING", "PREP-BUILT-IN", "PREP-DESIGN"],
    manualRub: null,
  });
  const seating = pointPreparationProjection({
    areaM2: 60,
    format: "with_seating",
    mode: "breakdown",
    enabledCategoryIds: launchModel.preparation.categories.map((category) => category.id),
    manualRub: null,
  });
  assert.equal(takeaway.calculatedRub, 2_040_000);
  assert.equal(takeaway.rows.find((row) => row.id === "PREP-GUEST-AREA")?.applicable, false);
  assert.equal(seating.calculatedRub, 3_300_000);
  assert.equal(seating.rows.find((row) => row.id === "PREP-GUEST-AREA")?.amountRub, 240_000);
  const foodhall = pointPreparationProjection({
    areaM2: 25,
    format: "takeaway",
    locationType: "foodhall",
    sharedSeating: true,
    mode: "breakdown",
    enabledCategoryIds: ["PREP-BUILDING", "PREP-LIGHTING", "PREP-BUILT-IN", "PREP-DESIGN"],
    manualRub: null,
  });
  const creative = pointPreparationProjection({
    areaM2: 40,
    format: "takeaway",
    locationType: "creative_cluster",
    sharedSeating: true,
    mode: "breakdown",
    enabledCategoryIds: ["PREP-BUILDING", "PREP-LIGHTING", "PREP-BUILT-IN", "PREP-DESIGN"],
    manualRub: null,
  });
  assert.equal(foodhall.calculatedRub, 712_500);
  assert.equal(creative.calculatedRub, 1_140_000);
  for (const venue of [foodhall, creative]) {
    assert.equal(venue.rows.find((row) => row.id === "PREP-GUEST-AREA")?.applicable, false, "shared venue guest area is not applicable");
    for (const id of ["PREP-ELECTRICAL", "PREP-WATER-DRAINAGE", "PREP-VENTILATION"]) {
      const row = venue.rows.find((candidate) => candidate.id === id)!;
      assert.equal(row.applicable, true, `${id} remains available for a venue-specific engineering scope`);
      assert.equal(row.enabled, false, `${id} is off in the venue default`);
      assert.ok(row.amountRub !== null, `${id} exposes its area-based reference when enabled`);
    }
  }
  assert.equal(pointPreparationProjection({
    areaM2: 40,
    format: "takeaway",
    mode: "manual",
    enabledCategoryIds: takeaway.rows.filter((row) => row.enabled).map((row) => row.id),
    manualRub: 1_750_000,
  }).effectiveRub, 1_750_000);
});

test("location rent presets remain state inputs and switch to a custom value after manual editing", () => {
  const before = sourceHashes();
  const launchBudget = defaultInvestorConfiguration().launchBudget;
  const fresh = createNetworkPointCohort(launchBudget, { id: "network-point" });
  assert.deepEqual(
    [fresh.locationRentPresetId, fresh.totalAreaM2, fresh.rentPerM2Rub, fresh.monthlyRentRub],
    ["historic-center-core", 40, 3_500, 140_000],
  );
  const nevsky = applyLocationRentPreset(fresh, "nevsky-premium");
  assert.deepEqual([nevsky.locationRentPresetId, nevsky.totalAreaM2, nevsky.rentPerM2Rub, nevsky.monthlyRentRub], ["nevsky-premium", 40, 6_500, 260_000]);
  const value = applyLocationRentPreset(nevsky, "historic-center-value");
  assert.deepEqual([value.locationRentPresetId, value.totalAreaM2, value.rentPerM2Rub, value.monthlyRentRub], ["historic-center-value", 40, 2_200, 88_000]);
  const changedArea = updateCohortAreaFromRentPreset(value, 45);
  assert.deepEqual([changedArea.locationRentPresetId, changedArea.rentPerM2Rub, changedArea.monthlyRentRub], ["custom", 2_200, 99_000]);
  const changedRate = updateCohortRentRate(changedArea, 3_000);
  assert.deepEqual([changedRate.locationRentPresetId, changedRate.rentPerM2Rub, changedRate.monthlyRentRub], ["custom", 3_000, 135_000]);
  const changedMonthlyRent = updateCohortMonthlyRent(changedRate, 150_000);
  assert.deepEqual([changedMonthlyRent.locationRentPresetId, changedMonthlyRent.rentPerM2Rub, changedMonthlyRent.monthlyRentRub], ["custom", null, 150_000]);
  const flagship = applyLocationRentPreset(fresh, "ligovsky-21-flagship");
  assert.deepEqual([flagship.realEstateMode, flagship.totalAreaM2, flagship.purchasePriceRub, flagship.monthlyRentRub], ["purchase", 226.5, 69_000_000, 500_000]);
  const seating = createNetworkPointCohort(launchBudget, { id: "seating-network-point", format: "with_seating" });
  assert.equal(seating.totalAreaM2, null, "the 40 m² network preset is not applied as an invalid own-hall area");
  assert.equal(seating.monthlyRentRub, null, "rent waits for a valid seating area");
  assert.equal(locationRentPreset("historic-center-core").marketRangeRubPerM2Month[0], 2_500);
  assert.deepEqual(sourceHashes(), before, "rent presets do not change canonical Financial Model files");
});

test("cohort operations keep sales, area constraints and concurrent staffing independent", () => {
  const before = sourceHashes();
  const canonical = currentBaseObjectFullPreparationConfiguration();
  const seating = createTradingPointCohort(canonical.launchBudget, {
    id: "seating",
    format: "with_seating",
    count: 5,
    totalAreaM2: 59,
    sales: { mode: "custom", checksPerDay: 250, averageCheckRub: 1400 },
  });
  const takeaway = createTradingPointCohort(canonical.launchBudget, {
    id: "takeaway",
    format: "takeaway",
    count: 10,
    totalAreaM2: 9,
    sales: { mode: "custom", checksPerDay: 175, averageCheckRub: 900 },
  });
  const configuration = {
    ...canonical,
    networkScaling: { ...canonical.networkScaling, cohorts: [seating, takeaway] },
  };
  const seatingOperations = pointOperationalProjection(configuration, seating);
  const takeawayOperations = pointOperationalProjection(configuration, takeaway);

  assert.equal(seatingOperations.area.minimumM2, 60);
  assert.equal(seatingOperations.area.status, "below-minimum");
  assert.equal(seatingOperations.staffing.concurrentStaff, 4);
  assert.equal(takeawayOperations.area.minimumM2, 10);
  assert.equal(takeawayOperations.area.status, "below-minimum");
  assert.equal(takeawayOperations.staffing.concurrentStaff, 3);
  assert.equal(takeawayOperations.staffing.rosterHeadcount, 6);
  assert.equal(seatingOperations.sales.checksPerDay, 250);
  assert.equal(takeawayOperations.sales.checksPerDay, 175);
  assert.equal(seatingOperations.sales.averageCheckRub, 1400);
  assert.equal(takeawayOperations.sales.averageCheckRub, 900);
  assert.notEqual(seatingOperations.sales.revenuePerPointRub, takeawayOperations.sales.revenuePerPointRub);
  assert.equal(takeawayOperations.sales.revenueCohortRub, takeawayOperations.sales.revenuePerPointRub! * 10);
  assert.equal(
    takeawayOperations.sales.revenuePerPointRub,
    calculateRevenueModel({
      trafficMode: "custom",
      trafficScenario: configuration.scenarioId,
      customChecksPerDay: 175,
      customAverageCheckRub: 900,
    }).salesPerMonthRub,
    "cohort revenue uses the established revenue engine",
  );

  for (const [portionsPerDay, concurrent] of [[200, 3], [210, 3], [249, 3], [250, 4], [299, 4], [300, 5]] as Array<[number, number]>) {
    assert.equal(pointStaffingProjection("takeaway", "street", portionsPerDay).concurrentStaff, concurrent, `${portionsPerDay} portions/day`);
  }
  const high = pointStaffingProjection("takeaway", "street", 300);
  assert.equal(high.rosterHeadcount, 9, "2/2 core positions convert to two people; 5/2 sous-chef remains one");
  assert.equal(high.roles.find(role => role.roleId === "SOUS_CHEF")?.rosterHeadcount, 1);
  assert.equal(pointOperationalProjection(configuration, { ...takeaway, totalAreaM2: 9 }).area.status, "below-minimum");
  assert.equal(pointOperationalProjection(configuration, { ...takeaway, totalAreaM2: 10 }).area.status, "valid");
  assert.equal(pointOperationalProjection(configuration, { ...seating, totalAreaM2: 60 }).area.status, "valid");
  assert.equal(pointOperationalProjection(configuration, { ...seating, totalAreaM2: null }).area.status, "unset");
  assert.equal(pointOperationalProjection(configuration, { ...seating, sales: { ...seating.sales, checksPerDay: 800 } }).staffing.concurrentStaff, 4, "street seating has no invented traffic scaling");

  const restored = restoreInvestorConfiguration({ schemaVersion: 3, ...configuration });
  assert.deepEqual(restored.networkScaling.cohorts.map((cohort) => cohort.sales), [seating.sales, takeaway.sales]);
  assert.deepEqual(sourceHashes(), before, "operational projection is read-only against canonical sources");
});

test("network planning payroll references canonical salaries and keeps production and manager shared", () => {
  const base = pointStaffingProjection("takeaway", "street", 200);
  assert.deepEqual(base.roles.map(role => [role.roleId, role.grossSalaryRub, role.rosterHeadcount]), [
    ["CASHIER_BAR", 95_000, 2],
    ["LINE_COOK", 115_000, 4],
  ]);
  assert.ok(base.employerContributionsRub > 0 && base.personnelReserveRub > 0, "existing employer-contribution treatment is applied");
  assert.equal(productionStaffingProjection(300).concurrentPrepCooks, 1);
  assert.equal(productionStaffingProjection(301).concurrentPrepCooks, 2);
  assert.equal(productionStaffingProjection(301).capacityReviewRequired, true);
  assert.equal(sharedManagerPayrollProjection(1)?.rosterHeadcount, 1);
  assert.equal(sharedManagerPayrollProjection(5)?.rosterHeadcount, 1, "manager is shared, not multiplied by point count");
});

test("physical allocation retains point, production and wash boundaries for v2.4 selectors", () => {
  const errors = physicalAllocationIntegrityErrors(physicalAllocationMap, {
    equipmentModuleIds: new Set(capexData.modules.map(module => module.id)),
    equipmentItemIds: new Set(capexData.items.map(item => item.id)),
    preparationCategoryIds: new Set(launchModel.preparation.categories.map(category => category.id)),
    financialModelItemIds: new Set(financialModelAllocationItemIds),
    investorStartFieldIds: new Set(investorStartAllocationFieldIds),
    networkPlanningItemIds: new Set(networkPlanningAllocationItemIds),
  });
  assert.deepEqual(errors, []);
  assert.equal(physicalAllocationMap.find(item => item.id === "MOD-PREP")?.physicalScope, "production");
  assert.equal(physicalAllocationMap.find(item => item.id === "MOD-GROW")?.physicalScope, "production");
  assert.equal(physicalAllocationMap.find(item => item.id === "MOD-RETAIL-HOT")?.physicalScope, "both_point_formats");
  assert.equal(physicalAllocationMap.find(item => item.id === "PREP-GUEST-AREA")?.physicalScope, "seating_point");
  assert.equal(physicalAllocationMap.find(item => item.id === "MOD-WASH")?.physicalScope, "mixed");
  assert.equal(physicalAllocationMap.find(item => item.id === "OPEX-LOGISTICS")?.physicalScope, "shared_network");

  const scaling = networkScalingProjection(currentBaseObjectFullPreparationConfiguration());
  assert.ok(
    scaling.cohorts.slice(1).every((cohort) => cohort.pointItems.every((item) => !item.name.includes("посудомоеч"))),
    "the integrated pilot wash zone is never treated as a repeatable point item",
  );
  assert.ok(
    scaling.unresolvedItems.every((item) => !item.detail?.some((detail) => detail.name.includes("посудомоеч"))),
    "the integrated pilot wash zone is not presented as an unresolved additional-point cost",
  );
});

test("location semantics drive point contribution without creating a false EBITDA", () => {
  const canonical = currentBaseObjectFullPreparationConfiguration();
  const street = createTradingPointCohort(canonical.launchBudget, {
    id: "street", format: "with_seating", count: 2, totalAreaM2: 60,
    monthlyRentRub: 350_000, prepaymentMonths: 1, securityDepositMonths: 1,
    utilitiesMonthlyRub: 80_000, extractionAvailable: true,
    sales: { mode: "custom", checksPerDay: 150, averageCheckRub: 1165.4 },
  });
  const foodhall = createTradingPointCohort(canonical.launchBudget, {
    id: "foodhall", format: "takeaway", count: 3, locationType: "foodhall", sharedSeating: true,
    venueSecurityIncluded: true, commonCleaningIncluded: true, extractionAvailable: true,
    revenueSharePercent: 12, minimumGuaranteeMonthlyRub: 120_000, utilitiesIncluded: true,
    serviceChargeMonthlyRub: 30_000, fitoutAllowanceRub: 2_000_000,
    sales: { mode: "custom", checksPerDay: 215, averageCheckRub: 1165.4 },
  });
  const projection = networkScalingProjection({
    ...canonical,
    networkScaling: { ...canonical.networkScaling, cohorts: [street, foodhall] },
  });
  const streetProjection = projection.cohorts.find(cohort => cohort.cohort.id === "street")!;
  const foodhallProjection = projection.cohorts.find(cohort => cohort.cohort.id === "foodhall")!;
  assert.equal(foodhallProjection.operational.area.minimumM2, null, "shared Foodhall seating does not impose a private 60m² hall");
  assert.equal(foodhallProjection.pointItems.find(item => item.id.endsWith(":furniture"))?.included, false, "Foodhall shared seating has no own guest furniture");
  assert.equal(foodhallProjection.directOpex.isPartial, false);
  assert.ok(foodhallProjection.directOpex.operatingContributionPerPointRub !== null);
  assert.equal(streetProjection.directOpex.isPartial, false);
  assert.equal(projection.operating.logisticsMode, "own", "three or more points suggests one shared logistics path");
  assert.equal(projection.operating.managerPayroll?.rosterHeadcount, 1);
  assert.equal(projection.operating.fixedMarketingRub, 150_000, "fixed marketing is counted once");
  assert.equal(pointOperationalProjection({ ...canonical, networkScaling: { ...canonical.networkScaling, cohorts: [street] } }, { ...street, extractionAvailable: false }).location.extractionStatus, "incompatible");
});

test("network scaling aggregates independent point cohorts without inventing network economics", () => {
  const before = sourceHashes();
  const canonical = currentBaseObjectFullPreparationConfiguration();
  const seatingRent = createTradingPointCohort(canonical.launchBudget, {
    id: "seating-rent",
    format: "with_seating",
    realEstateMode: "rent",
    count: 5,
    barEnabled: true,
    sales: { mode: "custom", checksPerDay: 250, averageCheckRub: 1400 },
  });
  const takeawayRent = createTradingPointCohort(canonical.launchBudget, {
    id: "takeaway-rent",
    format: "takeaway",
    realEstateMode: "rent",
    count: 10,
    barEnabled: false,
    sales: { mode: "custom", checksPerDay: 175, averageCheckRub: 900 },
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
  assert.ok(mixedNetwork.unresolvedItems.every((item) => item.ownership === "unresolved"));
  assert.equal(mixedNetwork.unresolvedItems.find((item) => item.id === "operating_reserve"), undefined, "the old integrated reserve is not presented as an unresolved additional-point cost");
  assert.equal(mixedNetwork.unresolvedItems.find((item) => item.id === "POINT-WASH-TAKEAWAY")?.multiplier, "per_point");
  assert.equal(mixedNetwork.unresolvedItems.find((item) => item.id === "POINT-WASH-SEATING")?.amountRub, null);
  assert.ok(takeaway.pointItems.some((item) => item.name === "Резерв на запуск"), "contingency is calculated from the applicable point base");
  assert.equal(mixedNetwork.isPartial, true);
  assert.equal(mixedNetwork.sales.status, "complete");
  assert.equal(mixedNetwork.sales.checksPerDay, 250 * 5 + 175 * 10);
  assert.equal(
    mixedNetwork.sales.revenuePerMonthRub,
    seating.operational.sales.revenueCohortRub! + takeaway.operational.sales.revenueCohortRub!,
    "network monthly revenue is the sum of cohort revenue projections",
  );
  assert.equal(
    mixedNetwork.sales.weightedAverageCheckRub,
    mixedNetwork.sales.revenuePerMonthRub! / ((mixedNetwork.sales.checksPerDay ?? 0) * seating.operational.sales.workingDaysPerMonth),
    "network average check is weighted by total checks, not a simple cohort average",
  );
  const partialSales = networkScalingProjection({
    ...canonical,
    networkScaling: {
      ...canonical.networkScaling,
      cohorts: [{ ...takeawayRent, sales: { mode: "custom", checksPerDay: 175, averageCheckRub: null } }],
    },
  });
  assert.deepEqual(partialSales.sales, {
    status: "partial",
    checksPerDay: null,
    weightedAverageCheckRub: null,
    revenuePerMonthRub: null,
  }, "an incomplete sales cohort does not produce a misleading network aggregate");
  assert.deepEqual(sourceHashes(), before, "the selector is read-only against canonical sources");
});

test("expansion reserve uses additional point OPEX and does not count the base-object reserve twice", () => {
  const configuration = defaultInvestorConfiguration();
  const base = configuredEconomicsScenario(configuration);
  const scaling = networkScalingProjection(configuration);
  const economics = networkEconomicsProjection(configuration, {
    investmentRub: base.startInvestmentRub,
    revenueRub: base.salesPerMonthRub,
    opexRub: base.salesPerMonthRub - base.ebitdaRub,
    operatingResultRub: base.ebitdaRub,
    cashFlowRub: base.freeCashFlowRub,
    paybackMonth: base.paybackMonth,
    operatingReserveRub: base.operatingReserveRub,
  });
  assert.equal(economics.expansion.additionalPointCount, 4);
  assert.equal(economics.network.pointCount, 5);
  assert.equal(economics.expansion.operatingReserveRub, scaling.operating.pointDirectOpexRub! * configuration.launchBudget.operatingReserveMonths, "reserve uses known monthly OPEX of additional point groups and the selected horizon");
  assert.notEqual(economics.expansion.operatingReserveRub, base.operatingReserveRub, "the historical Integrated Pilot reserve is never reused for expansion");
  assert.equal(
    economics.network.investmentRub,
    base.startInvestmentRub + economics.expansion.pointInvestmentRub + economics.expansion.sharedInfrastructureRub + economics.expansion.operatingReserveRub!,
    "network investment is base object plus additional point launch, shared infrastructure and expansion reserve",
  );
  assert.equal(scaling.sharedItems.find((item) => item.id === "shared-refrigerated-logistics")?.amountRub, 5_000_000, "five-point network gets the governed shared logistics infrastructure");
  assert.equal(scaling.operating.expansionManagerPayrollRub, 0, "the one network manager is already present with the base object and is not counted twice");
  assert.equal(economics.expansion.incompletePointCohortCount, 0, "default venue contracts are complete once their owner-approved terms are supplied");
});

test("Current Base full-preparation selection is not presented as a user override", () => {
  const currentBaseFullPreparation = currentBaseObjectFullPreparationConfiguration();
  assert.equal(investorConfigurationIsCurrentBaseFullPreparation({ ...currentBaseFullPreparation, scenarioId: "pessimistic" }), true);
  assert.equal(investorConfigurationIsCurrentBaseFullPreparation({ ...currentBaseFullPreparation, customChecksPerDay: 175 }), false);
});

test("Historical Integrated Pilot and Current Base are explicit, separate contexts", () => {
  const historical = historicalIntegratedPilotConfiguration();
  const currentBase = defaultInvestorConfiguration();
  assert.equal(historical.launchBudget.monthlyRentRub, 350_000);
  assert.equal(historical.launchBudget.rentFreeMonths, 0);
  assert.equal(historical.launchBudget.preparationEnabledCategoryIds.length, 8);
  assert.equal(currentBase.launchBudget.monthlyRentRub, 500_000);
  assert.equal(currentBase.launchBudget.rentFreeMonths, 2);
  assert.equal(currentBase.launchBudget.preparationEnabledCategoryIds.length, 4);
  assert.equal(financialProjectionContextForConfiguration(historical), "historical_integrated_pilot");
  assert.equal(financialProjectionContextForConfiguration(currentBase), "current_base_object");
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
  assert.match(source, /resetConfiguration/);
  assert.match(scalingSource, /buildCapexRows/);
  assert.match(scalingSource, /networkEconomicsProjection/, "expansion and network totals are assembled in the typed planning adapter");
  assert.match(scalingSource, /findPhysicalAllocation/, "new allocation semantics are read from the typed allocation map");
  assert.match(scalingSource, /networkSalesSummary/, "network sales aggregation stays outside the React component");
  for (const legacyLiteral of ["45.37", "23 месяца", "61.33%", "36,701,298"]) {
    assert.equal(source.includes(legacyLiteral), false, `legacy KPI literal remains: ${legacyLiteral}`);
  }
});
