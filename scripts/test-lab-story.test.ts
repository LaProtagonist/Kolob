import assert from "node:assert/strict";
import test from "node:test";
import { configuredEconomicsScenario } from "../src/lib/configured-economics";
import { applyNetworkRolloutPreset, defaultInvestorConfiguration } from "../src/lib/investor-configuration";
import { networkFinancialProjection } from "../src/lib/network-financial-projection";
import { baseObjectFinancialProjection } from "../src/lib/network-scaling";
import { buildNetworkStory } from "../src/lab/story";
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

test("every listed variant has a folder with a Variant file", async () => {
  const fs = await import("node:fs");
  for (const variant of variants) {
    assert.ok(fs.existsSync(new URL(`../src/lab/variants/${variant.id}/Variant.tsx`, import.meta.url)), variant.id);
  }
});
