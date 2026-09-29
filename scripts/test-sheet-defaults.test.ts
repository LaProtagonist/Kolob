import assert from "node:assert/strict";
import fs from "node:fs";
import test, { afterEach } from "node:test";
import { configuredEconomicsScenario } from "../src/lib/configured-economics";
import {
  baseObjectLaunchBudgetState,
  currentBaseObjectInvestorConfiguration,
  defaultInvestorConfiguration,
  investorConfigurationIsDefault,
  investorConfigurationIsReadyPremisesDefault,
  restoreInvestorConfiguration,
  setSheetInputs,
  sheetInputKeys,
  type SheetInputs,
} from "../src/lib/investor-configuration";
import { calculateLaunchBudget } from "../src/lib/launch-budget";
import { withoutScenarioTraffic } from "../src/lib/sheet-inputs";

type SchemaItem = { key: string; type: string; default: unknown; optional?: boolean };
const schema = JSON.parse(fs.readFileSync(new URL("../server/inputs-schema.json", import.meta.url), "utf8")) as { inputs: SchemaItem[] };
const schemaDefaults = Object.fromEntries(schema.inputs.map((item) => [item.key, item.default])) as SheetInputs;

afterEach(() => setSheetInputs({}));

test("the sheet contract lists exactly the inputs the site understands", () => {
  assert.deepEqual(schema.inputs.map((item) => item.key), [...sheetInputKeys]);
});

test("without a sheet the default is the built-in Base Object", () => {
  assert.deepEqual(defaultInvestorConfiguration(), currentBaseObjectInvestorConfiguration());
});

test("the values seeded into a new sheet reproduce the built-in default", () => {
  setSheetInputs(withoutScenarioTraffic(schemaDefaults));
  assert.deepEqual(defaultInvestorConfiguration(), currentBaseObjectInvestorConfiguration());
});

test("sheet values become the visitor's defaults and move the results", () => {
  const before = configuredEconomicsScenario(defaultInvestorConfiguration());
  setSheetInputs(withoutScenarioTraffic({ ...schemaDefaults, checks_per_day: 777, rent_monthly_rub: 5_000_000, rent_prepayment_months: 3, bar_enabled: false, preparation_rub: 9_000_000 }));
  const configuration = defaultInvestorConfiguration();
  assert.equal(configuration.customChecksPerDay, 777);
  assert.equal(configuration.launchBudget.monthlyRentRub, 5_000_000);
  assert.equal(configuration.launchBudget.prepaymentMonths, 3);
  assert.equal(configuration.launchBudget.barEnabled, false);
  assert.equal(configuration.launchBudget.preparationMode, "manual");
  assert.equal(configuration.launchBudget.preparationManualRub, 9_000_000);
  assert.equal(configuration.networkScaling.cohorts[0].barEnabled, false, "the first point of the network follows the base object");

  const after = configuredEconomicsScenario(configuration);
  assert.equal(Math.round(after.salesPerMonthRub), Math.round(before.salesPerMonthRub * 777 / 300));
  assert.ok(after.ebitdaRub !== before.ebitdaRub, "results respond to the sheet");
  assert.ok(investorConfigurationIsDefault(configuration));
  assert.ok(investorConfigurationIsReadyPremisesDefault(configuration), "sheet defaults keep the standard scenario label");
});

test("the calculation baselines do not follow the sheet", () => {
  const baseline = baseObjectLaunchBudgetState();
  setSheetInputs({ rent_monthly_rub: 5_000_000, area_total_m2: 500, area_kitchen_m2: 100, area_guest_m2: 300 });
  assert.deepEqual(baseObjectLaunchBudgetState(), baseline);
  assert.equal(currentBaseObjectInvestorConfiguration().launchBudget.monthlyRentRub, baseline.monthlyRentRub);
  assert.equal(calculateLaunchBudget(defaultInvestorConfiguration().launchBudget).areaInvalid, false);
});

test("values the page cannot show are ignored one by one", () => {
  const builtIn = currentBaseObjectInvestorConfiguration();
  setSheetInputs({
    scenario_default: "bold",
    checks_per_day: 0,
    premises_mode: "lease",
    rent_monthly_rub: -1,
    rent_prepayment_months: 5,
    rent_deposit_months: "два",
    operating_reserve_months: 12,
    contingency_percent: 7,
    equipment_level: "GOLD",
    bar_enabled: "да",
    area_total_m2: 100,
    area_kitchen_m2: 90,
    area_guest_m2: 80,
    rent_free_months: 4,
  });
  const configuration = defaultInvestorConfiguration();
  assert.deepEqual({ ...configuration.launchBudget, rentFreeMonths: builtIn.launchBudget.rentFreeMonths }, builtIn.launchBudget);
  assert.equal(configuration.launchBudget.rentFreeMonths, 4, "a valid value next to invalid ones still applies");
  assert.equal(configuration.scenarioId, builtIn.scenarioId);
  assert.equal(configuration.customChecksPerDay, null);
});

test("an untouched visitor is recognised after a storage round trip; an edit is not", () => {
  for (const inputs of [{}, { rent_monthly_rub: 650_000, checks_per_day: 410 }] as SheetInputs[]) {
    setSheetInputs(inputs);
    const stored = JSON.parse(JSON.stringify(defaultInvestorConfiguration()));
    const restored = restoreInvestorConfiguration(stored);
    assert.ok(investorConfigurationIsDefault(restored));
    assert.ok(!investorConfigurationIsDefault({ ...restored, launchBudget: { ...restored.launchBudget, monthlyRentRub: 123_456 } }));
    assert.ok(!investorConfigurationIsDefault({ ...restored, scenarioId: "optimistic" }));
    assert.ok(investorConfigurationIsDefault({ ...restored, launchBudget: { ...restored.launchBudget, preparationAccordionOpen: true } }), "an opened accordion is not an edit");
  }
});

test("a visitor holding built-in defaults is moved to the sheet, a visitor with edits is not", () => {
  const untouched = restoreInvestorConfiguration(JSON.parse(JSON.stringify(defaultInvestorConfiguration())));
  const edited = { ...untouched, launchBudget: { ...untouched.launchBudget, monthlyRentRub: 480_000 } };
  assert.ok(investorConfigurationIsDefault(untouched));
  assert.ok(!investorConfigurationIsDefault(edited));
  setSheetInputs({ rent_monthly_rub: 700_000 });
  assert.ok(!investorConfigurationIsDefault(untouched), "after the sheet arrives the old default differs, so the provider replaces it");
  assert.equal(defaultInvestorConfiguration().launchBudget.monthlyRentRub, 700_000);
});
