import assert from "node:assert/strict";
import test from "node:test";
import { configuredEconomicsScenario } from "../src/lib/configured-economics";
import { applyNetworkRolloutPreset, defaultInvestorConfiguration } from "../src/lib/investor-configuration";
import { networkFinancialProjection } from "../src/lib/network-financial-projection";
import { baseObjectFinancialProjection } from "../src/lib/network-scaling";
import { applyStoryPlan, buildNetworkStory } from "../src/lab/story";
import variants from "../src/lab/variants.json" with { type: "json" };

function temporal(configuration = defaultInvestorConfiguration()) {
  const scenario = configuredEconomicsScenario(configuration);
  const base = { ...baseObjectFinancialProjection(scenario), investmentBreakdown: scenario.investmentBreakdown, cashFlows: scenario.cashFlows, monthlyProjection: scenario.monthlyProjection };
  return networkFinancialProjection(configuration, base, base).temporal;
}

test("the story repeats the calculator's network numbers and adds none of its own", () => {
  const configuration = defaultInvestorConfiguration();
  const story = buildNetworkStory(configuration);
  const source = temporal(configuration);
  assert.equal(story.months.length, source.network.months.length);
  assert.equal(story.totals.paybackMonth, source.network.paybackMonth);
  assert.equal(story.totals.investmentRub, source.network.investmentRub);
  story.months.forEach((month, index) => {
    assert.equal(month.cumulativeCashRub, source.network.months[index].cumulativeCashFlowRub ?? 0);
    assert.equal(month.revenueRub, source.network.months[index].revenueRub ?? 0);
  });
});

test("every point of the network is on the map and opens when the calculator says", () => {
  const configuration = defaultInvestorConfiguration();
  const story = buildNetworkStory(configuration);
  const expected = configuration.networkScaling.cohorts.reduce((total, cohort) => total + cohort.count, 0);
  assert.equal(story.points.length, expected);
  assert.equal(story.points.filter((point) => point.isBase).length, 1);
  assert.equal(story.points[0].openingMonth, 0);
  assert.deepEqual(story.points.filter((point) => !point.isBase).map((point) => point.openingMonth), [4, 7, 10, 13]);
  assert.equal(new Set(story.points.map((point) => point.id)).size, story.points.length);
  for (const point of story.points) {
    assert.ok(point.place.x > 0 && point.place.x < 1 && point.place.y > 0 && point.place.y < 1, `${point.title} is inside the map`);
    assert.ok(point.staffTotal >= point.staffOnShift && point.staffOnShift > 0, `${point.title} has staff`);
  }
  const last = story.months.at(-1)!;
  assert.equal(last.openPoints, expected);
  assert.equal(story.months[3].openPoints, 1, "before the first opening only the base point works");
  assert.equal(story.months[4].newOpenings, 1);
});

test("a bigger rollout adds points, staff and total investment", () => {
  const base = defaultInvestorConfiguration();
  const bigger = { ...base, networkScaling: applyNetworkRolloutPreset(base.networkScaling, base.launchBudget, 12) };
  const small = buildNetworkStory(base);
  const large = buildNetworkStory(bigger);
  assert.equal(large.points.length, 13);
  assert.ok((large.totals.investmentRub ?? 0) > (small.totals.investmentRub ?? 0));
  // Later points are paid for by the cash of earlier ones, so the deepest funding need does not grow.
  assert.equal(large.totals.peakFundingRub, small.totals.peakFundingRub);
  assert.ok(large.months.at(-1)!.staffTotal > small.months.at(-1)!.staffTotal);
});

test("a player's plan changes only the number of points and their opening months", () => {
  const base = defaultInvestorConfiguration();
  const before = buildNetworkStory(base);
  const [first, ...others] = before.districts;
  const plan = [{ districtId: first.id, openingMonths: [30, 2, 2] }, ...others.map((district) => ({ districtId: district.id, openingMonths: [] }))];
  const scaling = applyStoryPlan(base.networkScaling, plan);
  const story = buildNetworkStory({ ...base, networkScaling: scaling });

  assert.deepEqual(scaling.cohorts[0], base.networkScaling.cohorts[0], "the first point of the network is never touched");
  scaling.cohorts.slice(1).forEach((cohort, index) => {
    const { count, openingWaves, ...rest } = cohort;
    const { count: _count, openingWaves: _waves, ...original } = base.networkScaling.cohorts[index + 1];
    assert.deepEqual(rest, original, `${cohort.id} keeps every other setting`);
    assert.equal(openingWaves.reduce((total, wave) => total + wave.count, 0), count);
  });
  assert.deepEqual(story.points.map((point) => point.openingMonth), [0, 2, 2, 30]);
  assert.deepEqual(story.districts.map((district) => district.id), before.districts.map((district) => district.id), "empty districts stay listed");
  assert.deepEqual(story.districts[0].openingMonths, [2, 2, 30]);
  assert.equal(story.months.length, before.months.length);
  assert.equal(story.isPartial, false);

  const restored = buildNetworkStory({ ...base, networkScaling: applyNetworkRolloutPreset(scaling, base.launchBudget, 4) });
  assert.deepEqual(restored.points.map((point) => point.openingMonth), before.points.map((point) => point.openingMonth), "the calculator's preset brings its own plan back");
  assert.equal(restored.totals.paybackMonth, before.totals.paybackMonth);
  assert.equal(restored.months.at(-1)!.cumulativeCashRub, before.months.at(-1)!.cumulativeCashRub);
});

test("every point knows its district and carries the calculator's equipment list", () => {
  const story = buildNetworkStory(defaultInvestorConfiguration());
  assert.equal(story.districts.length, 4);
  assert.ok(story.rules.openingLeadMonths >= 0 && story.rules.maxPointsPerDistrict >= 1);
  for (const point of story.points) {
    assert.equal(point.districtId === null, point.isBase);
    assert.ok(point.inventory.length > 0, `${point.title} has equipment`);
    if (point.isBase) continue;
    const district = story.districts.find((item) => item.id === point.districtId)!;
    assert.ok(district.openingMonths.includes(point.openingMonth));
    assert.equal(district.investmentRub, point.investmentRub);
    assert.equal(district.monthlyRevenueRub, point.monthlyRevenueRub);
  }
});

test("every listed variant has a folder with a Variant file", async () => {
  const fs = await import("node:fs");
  for (const variant of variants) {
    assert.ok(fs.existsSync(new URL(`../src/lab/variants/${variant.id}/Variant.tsx`, import.meta.url)), variant.id);
  }
});
