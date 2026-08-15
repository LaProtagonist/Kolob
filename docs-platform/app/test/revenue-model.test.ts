import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";
import { platformRoot } from "../src/google/config.js";
import {
  REVENUE_CONTENT_SOURCE_PATHS,
  REVENUE_MODEL_PATH,
  REVENUE_WEB_SNAPSHOT_PATH,
  buildRevenueContentState,
  buildRevenueWebSnapshot,
  checkRevenueWebSnapshot,
  readRevenueModel,
  validateRevenueModel,
} from "../src/investor/revenue-model.js";
import {
  calculateAverageCheck,
  calculateAverageFoodPrice,
  calculateRevenueModel,
  calculateWeightedKolobokPrice,
  defaultRevenueModelState,
  normalizeRevenueModelState,
  resolveChecksPerDay,
  revenueModel,
  type RevenueModelState,
} from "../../../src/lib/revenue-model.js";

const projectRoot = path.resolve(platformRoot, "..");

function state(overrides: Partial<RevenueModelState> = {}): RevenueModelState {
  return { ...defaultRevenueModelState(), ...overrides };
}

test("Revenue Model validates against its schema and exact approved invariants", () => {
  assert.deepEqual(validateRevenueModel(), []);
  assert.equal(readRevenueModel().document.id, "DOC-REVENUE-MODEL");
});

test("1-2. weighted kolobok price is 632.50 RUB and segment shares total 100 percent", () => {
  assert.equal(calculateWeightedKolobokPrice(), 632.5);
  assert.equal(revenueModel.product_model.kolobok_price_segments.reduce((sum, item) => sum + item.share, 0), 1);
});

test("3-5. food mix is 80/20, average food is 636 RUB and average check is 1165.40 RUB", () => {
  assert.deepEqual(revenueModel.product_model.food_mix, { kolobok_share: 0.8, manches_share: 0.2 });
  assert.equal(calculateAverageFoodPrice(), 636);
  assert.equal(calculateAverageCheck(), 1165.4);
});

test("6-8. scenarios contain exactly 200, 300 and 450 checks with realistic default", () => {
  assert.deepEqual(revenueModel.traffic.scenarios.map(item => [item.id, item.checks_per_day]), [["pessimistic", 200], ["realistic", 300], ["optimistic", 450]]);
  assert.equal(defaultRevenueModelState().trafficScenario, "realistic");
  assert.equal(resolveChecksPerDay(defaultRevenueModelState()), 300);
});

test("9-14. realistic flow produces the approved daily product load", () => {
  const result = calculateRevenueModel(state());
  assert.equal(result.checksPerDay, 300);
  assert.equal(result.foodPortionsPerDay, 420);
  assert.equal(result.kolobokPortionsPerDay, 336);
  assert.equal(result.manchesPerDay, 84);
  assert.equal(result.kolobokPortionsPerDay + result.manchesPerDay, result.foodPortionsPerDay);
  assert.equal(result.drinksPerDay, 300);
  assert.notEqual(result.kolobokPortionsPerDay + result.manchesPerDay + result.drinksPerDay, result.foodPortionsPerDay);
});

test("15-20. all scenario day and month sales values match the approved model", () => {
  const pessimistic = calculateRevenueModel(state({ trafficScenario: "pessimistic" }));
  const realistic = calculateRevenueModel(state({ trafficScenario: "realistic" }));
  const optimistic = calculateRevenueModel(state({ trafficScenario: "optimistic" }));
  assert.deepEqual([pessimistic.salesPerDayRub, realistic.salesPerDayRub, optimistic.salesPerDayRub], [233080, 349620, 524430]);
  assert.deepEqual([pessimistic.salesPerMonthRub, realistic.salesPerMonthRub, optimistic.salesPerMonthRub], [6992400, 10488600, 15732900]);
});

test("approved realistic average, peak and maximum hourly food loads are 35, 46 and 64", () => {
  const result = calculateRevenueModel(state());
  assert.equal(result.averageHour.food, 35);
  assert.equal(result.averageHour.checks, 25);
  assert.equal(result.peakHour.food, 46);
  assert.equal(result.peakHour.checks, 33);
  assert.equal(result.maximumHour.food, 64);
  assert.equal(result.maximumHour.checks, 46);
  assert.equal(result.maximumHour.kolobok, 51);
  assert.equal(result.maximumHour.manches, 13);
});

test("approved optimistic maximum hour is 96 food, 77 kolobok and 19 manches", () => {
  const result = calculateRevenueModel(state({ trafficScenario: "optimistic" }));
  assert.deepEqual({ food: result.maximumHour.food, kolobok: result.maximumHour.kolobok, manches: result.maximumHour.manches }, { food: 96, kolobok: 77, manches: 19 });
});

test("pessimistic peak and maximum capacity values follow the approved upward display rounding", () => {
  const result = calculateRevenueModel(state({ trafficScenario: "pessimistic" }));
  assert.deepEqual(result.peakHour, { checks: 22, food: 31, kolobok: 25, manches: 6 });
  assert.deepEqual(result.maximumHour, { checks: 31, food: 43, kolobok: 34, manches: 9 });
});

test("custom positive checks recalculate products, sales and hourly load", () => {
  const result = calculateRevenueModel(state({ trafficMode: "custom", customChecksPerDay: 250 }));
  assert.equal(result.scenarioLabel, "Другое значение");
  assert.equal(result.foodPortionsPerDay, 350);
  assert.equal(result.drinksPerDay, 250);
  assert.equal(result.salesPerDayRub, 291350);
  assert.equal(result.salesPerMonthRub, 8740500);
  assert.equal(result.maximumHour.food, 54);
});

test("custom zero and blank values remain not calculated rather than becoming zero sales", () => {
  for (const value of [0, null]) {
    const result = calculateRevenueModel(state({ trafficMode: "custom", customChecksPerDay: value }));
    assert.equal(result.calculated, false);
    assert.equal(result.checksPerDay, null);
    assert.equal(result.salesPerDayRub, null);
    assert.equal(result.salesPerMonthRub, null);
  }
});

test("custom mode never receives one of the three named scenario capacity statuses", () => {
  const result = calculateRevenueModel(state({ trafficMode: "custom", customChecksPerDay: 300 }));
  assert.equal(revenueModel.traffic.scenarios.some(item => item.capacity_statement === result.capacityStatement), false);
  assert.equal(result.scenarioLabel, "Другое значение");
});

test("local state normalization persists only approved inputs and restores incompatible values safely", () => {
  assert.deepEqual(normalizeRevenueModelState({ trafficMode: "custom", trafficScenario: "optimistic", customChecksPerDay: 321 }), { trafficMode: "custom", trafficScenario: "optimistic", customChecksPerDay: 321 });
  assert.deepEqual(normalizeRevenueModelState({ trafficMode: "bad", trafficScenario: "base", customChecksPerDay: -4 }), defaultRevenueModelState());
  assert.deepEqual(revenueModel.form.persist_fields, ["trafficMode", "trafficScenario", "customChecksPerDay"]);
});

test("reset defaults return realistic scenario and do not store derived values", () => {
  const defaults = defaultRevenueModelState();
  assert.deepEqual(defaults, { trafficMode: "scenario", trafficScenario: "realistic", customChecksPerDay: null });
  assert.deepEqual(Object.keys(defaults).sort(), ["customChecksPerDay", "trafficMode", "trafficScenario"]);
});

test("content fingerprint changes for the Revenue Model and excludes governance state", () => {
  const baseline = buildRevenueContentState();
  const original = fs.readFileSync(path.join(projectRoot, REVENUE_MODEL_PATH), "utf8");
  const changed = buildRevenueContentState(projectRoot, { [REVENUE_MODEL_PATH]: `${original}\n` .replace("average_check_rub: 1165.4", "average_check_rub: 1165.5") });
  assert.notEqual(changed.content_state_sha256, baseline.content_state_sha256);
  assert.equal(REVENUE_CONTENT_SOURCE_PATHS.some(item => /events|TIMELINE|HANDOFF|PROJECT_STATE|receipt|deployment/i.test(item)), false);
});

test("Revenue snapshot is deterministic, current and contains normalized source hashes", () => {
  assert.deepEqual(buildRevenueWebSnapshot(), buildRevenueWebSnapshot());
  const check = checkRevenueWebSnapshot();
  assert.equal(check.validation, "OK");
  const stored = JSON.parse(fs.readFileSync(path.join(projectRoot, REVENUE_WEB_SNAPSHOT_PATH), "utf8"));
  assert.equal(stored.meta.sourceFiles.length, REVENUE_CONTENT_SOURCE_PATHS.length);
  assert.equal(stored.meta.contentStateSha256, buildRevenueContentState().content_state_sha256);
  assert.equal("generatedAt" in stored.meta, false);
  assert.equal(/events\.ndjson|TIMELINE\.md|CODEX_HANDOFF|PROJECT_STATE/.test(JSON.stringify(stored.meta.sourceFiles)), false);
});

test("snapshot and model contain no secret-shaped keys or absolute paths", () => {
  const serialized = fs.readFileSync(path.join(projectRoot, REVENUE_WEB_SNAPSHOT_PATH), "utf8");
  assert.equal(/access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key/i.test(serialized), false);
  assert.equal(serialized.includes(projectRoot), false);
});

test("public presentation contains the exact approved title and subtitle without internal metadata", () => {
  const model = YAML.parse(fs.readFileSync(path.join(projectRoot, REVENUE_MODEL_PATH), "utf8"));
  assert.equal(model.public_presentation.page_title, "Расчёт объёма продаж");
  assert.equal(model.public_presentation.subtitle, "Модель потенциального объёма продаж совмещённого объекта «Колобочной»: поток заказов, структура среднего чека и производственная нагрузка.");
  const copy = JSON.stringify(model.public_presentation).toLowerCase();
  for (const forbidden of ["research", "v0.1", "registry", "snapshot", "yaml", "approved", "canonical"]) assert.equal(copy.includes(forbidden), false);
});

test("existing CAPEX and launch-budget scenario totals remain unchanged", () => {
  const capex = JSON.parse(fs.readFileSync(path.join(projectRoot, "src/content/capex-configurator-data.json"), "utf8"));
  assert.deepEqual(capex.meta.scenarioTotalsRub, { minimum: 4085990.33, base: 5488047.33, scale_ready: 6915980.79 });
  assert.equal(capex.investorStartModel.operating_reserve.monthly_total_rub, 2650000);
  assert.equal(capex.investorStartModel.preparation.default_total_rub, 11000000);
});
