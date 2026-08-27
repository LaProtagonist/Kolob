import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { configuredEconomicsScenario, configuredFinancialPolicy } from "../src/lib/configured-economics.js";
import {
  calculateFinancialMonthlyResult,
  calculateManagementTax,
  financialCoverage,
} from "../src/lib/financial-core.js";
import { defaultInvestorConfiguration } from "../src/lib/investor-configuration.js";
import { networkFinancialProjection } from "../src/lib/network-financial-projection.js";
import { cohortAssetSummary } from "../src/lib/network-financial-core.js";
import { baseObjectFinancialProjection, networkScalingProjection } from "../src/lib/network-scaling.js";
import {
  historicalOpexLineIds,
  historicalOpexTreatmentCatalog,
  historicalOpexTreatmentErrors,
} from "../src/lib/physical-allocation.js";

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

test("Current Base retains the accepted regression baseline during Network consolidation", () => {
  const scenario = configuredEconomicsScenario(defaultInvestorConfiguration());
  assert.deepEqual(
    {
      investment: scenario.startInvestmentRub,
      revenue: scenario.salesPerMonthRub,
      opex: scenario.salesPerMonthRub - scenario.ebitdaRub,
      ebitda: scenario.ebitdaRub,
      freeCashFlow: scenario.freeCashFlowRub,
      reserve: scenario.operatingReserveRub,
      payback: scenario.paybackMonth,
      irr: scenario.irr,
      npv: scenario.npvRub,
    },
    {
      investment: 39_220_380.74,
      revenue: 10_488_600,
      opex: 8_225_135.6,
      ebitda: 2_263_464.4,
      freeCashFlow: 2_045_009.8,
      reserve: 20_088_988.08,
      payback: 20,
      irr: 0.7335561455483743,
      npv: 39_824_232.74,
    },
    "Financial Core extraction must not silently change the accepted Current Base output",
  );
});

test("structured coverage keeps calculation availability separate from pricing, assumptions and capacity", () => {
  assert.deepEqual(
    financialCoverage([]),
    { status: "complete", calculation: "complete", pricing: "complete", assumptions: "confirmed", capacity: "covered", hasCaveats: false, issues: [] },
    "a fully covered fixture is complete on every coverage dimension",
  );
  const pricedGap = financialCoverage([{ id: "wash", category: "unpriced_capex", message: "Unpriced wash kit", material: true }]);
  assert.equal(pricedGap.calculation, "complete", "an unpriced item must not pretend that the formulas are broken");
  assert.equal(pricedGap.pricing, "partial");
  assert.equal(pricedGap.hasCaveats, true);
  const invalid = financialCoverage([{ id: "input", category: "invalid_input", message: "Missing required revenue input", material: true }]);
  assert.equal(invalid.status, "invalid");
  assert.equal(invalid.calculation, "invalid");
});

test("every historical OPEX line has an explicit Current Base or Network treatment", () => {
  assert.deepEqual(historicalOpexTreatmentErrors(), []);
  assert.deepEqual(
    [...historicalOpexTreatmentCatalog.map((line) => line.lineId)].sort(),
    [...historicalOpexLineIds].sort(),
    "the treatment catalog must neither silently lose nor duplicate a historical OPEX line",
  );
  assert.ok(
    historicalOpexTreatmentCatalog.some((line) => line.lineId === "banking" && line.status === "unresolved" && line.networkTreatment === "requires_confirmation" && !line.includedInKnownExpansion),
    "0 / TBD banking remains disclosed rather than becoming an invented zero-priced cost",
  );
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "admin_reserve")?.baseStatus, "active");
  assert.deepEqual(
    historicalOpexTreatmentCatalog.filter((line) => line.status === "unresolved").map((line) => line.lineId).sort(),
    ["banking", "software"],
    "only genuinely unconfirmed banking and YUMA terms remain unresolved after B3",
  );
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "admin_reserve")?.networkTreatment, "incremental", "the 2% reserve is calculated once from incremental revenue");
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "accounting")?.networkTreatment, "base_only", "central accounting must not multiply with points");
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "other_opex")?.networkTreatment, "base_only", "historical catch-all must not be copied into expansion");
});

test("Network Expansion and Consolidated Network use the shared tax-maintenance-FCF basis", () => {
  const configuration = defaultInvestorConfiguration();
  const scenario = configuredEconomicsScenario(configuration);
  const base = baseObjectFinancialProjection(scenario);
  const projection = networkFinancialProjection(configuration, base, scenario);
  const { economics, scaling, temporal } = projection;

  for (const layer of [economics.expansion, economics.network]) {
    assert.equal(
      Math.abs((layer.operatingResultRub ?? 0) - (layer.taxRub ?? 0) - (layer.maintenanceCapexRub ?? 0) - (layer.operatingFreeCashFlowRub ?? 0)) < 0.02,
      true,
      "FCF must equal EBITDA minus tax and maintenance CAPEX",
    );
    assert.equal(layer.cashFlowRub, layer.operatingFreeCashFlowRub, "the legacy operating contribution is no longer named cash flow");
  }

  const networkTax = calculateManagementTax(
    economics.network.revenueRub!,
    economics.network.opexRub!,
    configuredFinancialPolicy(configuration.scenarioId).taxRules,
  );
  assert.equal(economics.network.taxRub, Math.round(networkTax.taxRub * 100) / 100, "Network tax is calculated on the consolidated P&L rather than summed from cards");

  assert.equal(economics.expansion.depreciationRub! > 0, true, "Network assets have their own depreciation basis");
  assert.equal(economics.expansion.maintenanceCapexRub! > 0, true, "maintenance follows applicable point equipment and furniture assets");
  assert.equal(
    Math.abs((economics.expansion.operatingReserveRub ?? 0) - (economics.expansion.opexRub ?? 0) * configuration.launchBudget.operatingReserveMonths) < 0.04,
    true,
    "reserve covers known recurring Point + Production + Shared OPEX, never tax or CAPEX",
  );
  assert.equal(scaling.operating.expansionManagerPayrollRub, 0, "the Base manager is not charged a second time to expansion");
  assert.equal(scaling.operating.expansionFixedMarketingRub, 0, "the fixed 150k marketing base is not multiplied by points");
  assert.equal(
    Math.abs((scaling.operating.administrativeReserveRub ?? 0) - (economics.expansion.revenueRub ?? 0) * 0.02) < 0.01,
    true,
    "administrative reserve is one 2% shared charge on incremental revenue, not a second per-point percentage",
  );
  assert.equal(scaling.operating.incrementalUniformRenewalRub! > 0, true, "incremental production roster receives recurring uniform renewal");
  assert.equal(scaling.operating.incrementalMedicalRub! > 0, true, "incremental production roster receives recurring medical documentation cost");
  assert.equal(temporal.expansion.months.some((month) => month.operatingReserveRub !== 0), true, "reserve is a one-time financing requirement");
  assert.equal(temporal.expansion.months.at(-1)?.operatingReserveRub, 0, "reserve has no automatic terminal recovery");
  assert.equal(projection.status, "complete", "known-basis calculation remains available when disclosures remain");
  assert.deepEqual(
    { calculation: projection.coverage.calculation, pricing: projection.coverage.pricing, assumptions: projection.coverage.assumptions, capacity: projection.coverage.capacity },
    { calculation: "complete", pricing: "partial", assumptions: "requires_confirmation", capacity: "review_required" },
    "a missing seating-area input, VAT/YUMA/banking disclosure and production capacity are different coverage dimensions",
  );
  assert.equal(projection.exclusions.some((item) => item.id.startsWith("POINT-WASH-")), false, "priced B3 wash packages are included rather than left as generic exclusions");
  assert.ok(
    projection.exclusions.some((item) => item.id === "unresolved:rollout-historic-center-core:furniture"),
    "a seating point with no approved guest-area input is an explicit pricing exclusion rather than a silently omitted furniture cost",
  );
  assert.ok(projection.exclusions.some((item) => item.id === "opex:banking"));
  assert.ok(projection.exclusions.some((item) => item.id === "production:capacity-expansion"));
  assert.ok(projection.exclusions.some((item) => item.id === "logistics:vehicle-depreciation-maintenance"), "vehicle CAPEX is disclosed without inventing an equipment/furniture maintenance rule");
});

test("B3 maps wash, recurring point OPEX and location services without point-level double-counting", () => {
  const configuration = defaultInvestorConfiguration();
  const scaling = networkScalingProjection(configuration);
  const streetSeating = scaling.cohorts.find((cohort) => cohort.cohort.locationType === "street" && cohort.cohort.format === "with_seating")!;
  const takeaway = scaling.cohorts.find((cohort) => cohort.cohort.format === "takeaway")!;
  const foodhall = scaling.cohorts.find((cohort) => cohort.cohort.locationType === "foodhall")!;
  const creative = scaling.cohorts.find((cohort) => cohort.cohort.locationType === "creative_cluster")!;

  const line = (cohort: typeof streetSeating, id: string) => cohort.directOpex.lines.find((item) => item.id === id)?.amountRub;
  assert.equal(streetSeating.pointItems.find((item) => item.id.endsWith(":point-wash"))?.amountRub, 134_534, "seating wash kit reuses five researched CAPEX components");
  assert.equal(takeaway.pointItems.find((item) => item.id.endsWith(":point-wash"))?.amountRub, 108_807, "takeaway wash kit reuses four researched CAPEX components");
  assert.equal(line(streetSeating, "music"), 7_000, "only an independent street seating point receives the music line");
  assert.equal(line(takeaway, "music"), 0, "takeaway has no standalone music line by default");
  assert.equal(line(foodhall, "music"), 0, "Foodhall music is venue-provided");
  assert.equal(line(creative, "music"), 0, "Creative Cluster music is venue-provided");
  assert.equal(line(foodhall, "security-monitoring"), 0, "venue security is not charged a second time");
  assert.equal(line(creative, "security-monitoring"), 0, "venue security is not charged a second time");
  assert.equal(line(streetSeating, "security-monitoring"), 4_000, "self-managed street premises retain recurring monitoring");
  assert.equal(line(streetSeating, "equipment-service")! > 0, true, "service OPEX follows actual point equipment basis");
  assert.equal(line(streetSeating, "household")! > 50_000, true, "household retains the governed base-plus-traffic formula");

  const scenario = configuredEconomicsScenario(configuration);
  const twoPointPlan = {
    ...configuration,
    networkScaling: { ...configuration.networkScaling, cohorts: configuration.networkScaling.cohorts.slice(0, 2) },
  };
  const shortProjection = networkFinancialProjection(twoPointPlan, baseObjectFinancialProjection(scenario), scenario);
  assert.equal(shortProjection.coverage.calculation, "complete", "an unquoted external logistics term does not erase known-basis formulas");
  assert.equal(shortProjection.coverage.pricing, "partial", "a final one-additional-point plan discloses the external logistics price gap");
  assert.ok(shortProjection.exclusions.some((item) => item.id === "logistics:external-monthly"));

  const twoAdditionalPlan = {
    ...configuration,
    networkScaling: { ...configuration.networkScaling, cohorts: configuration.networkScaling.cohorts.slice(0, 3) },
  };
  const twoAdditionalProjection = networkFinancialProjection(twoAdditionalPlan, baseObjectFinancialProjection(scenario), scenario);
  assert.equal(twoAdditionalProjection.coverage.pricing, "partial", "two additional points retain the explicit external-logistics input gap until the three-additional-point owned-vehicle threshold");
  assert.ok(twoAdditionalProjection.exclusions.some((item) => item.id === "logistics:external-monthly"));
});

test("Network depreciation uses each CAPEX detail once, includes local wash kits, and excludes vehicle from generic maintenance", () => {
  const configuration = defaultInvestorConfiguration();
  const cohort = networkScalingProjection(configuration).cohorts[1]!;
  const assets = cohortAssetSummary(cohort, configuredFinancialPolicy(configuration.scenarioId));
  const equipmentGroups = new Set(["point-retail-equipment", "point-pos-kds", "point-bar"]);
  const equipmentDetailTotal = cohort.pointItems
    .filter((item) => equipmentGroups.has(item.id))
    .flatMap((item) => item.detail ?? [])
    .reduce((total, item) => total + (item.amountRub ?? 0), 0);
  const wash = cohort.pointItems.find((item) => item.id.endsWith(":point-wash"));
  assert.ok(wash, "every repeatable point receives its explicit B3 wash package");
  assert.equal(wash?.detail?.some((item) => item.id.includes("DOME")), false, "local wash package cannot activate a dome dishwasher");
  const washDetailTotal = wash?.detail?.reduce((total, item) => total + (item.amountRub ?? 0), 0) ?? 0;
  const furniture = cohort.pointItems.find((item) => item.id.endsWith(":furniture"))?.amountRub ?? 0;
  const depreciationEquipmentTotal = assets.depreciationAssets
    .filter((asset) => asset.item_id.includes(":CAPEX-"))
    .reduce((total, asset) => total + asset.amount_rub, 0);

  assert.equal(Math.abs(depreciationEquipmentTotal - equipmentDetailTotal - washDetailTotal) < 0.01, true, "detail assets replace, rather than duplicate, their grouped CAPEX parent or wash package parent");
  assert.equal(Math.abs(assets.maintenanceAssetBasisRub - equipmentDetailTotal - washDetailTotal - furniture) < 0.01, true, "maintenance basis is applicable equipment, wash-kit assets and furniture only");
  const lighting = assets.depreciationAssets.find((asset) => asset.item_id.endsWith(":PREP-LIGHTING"));
  assert.deepEqual(
    lighting && { category: lighting.category, usefulLifeYears: lighting.useful_life_years },
    { category: "ENGINEERING", usefulLifeYears: 10 },
    "cohort provenance prefixes must not change the governed preparation useful-life category",
  );
  assert.equal(assets.vehicleMaintenanceIncluded, false);
  assert.equal(assets.vehicleMaintenanceTreatment, "included_in_logistics_opex");
  assert.equal(assets.vehicleDepreciationTreatment, "requires_useful_life_decision");
});

test("generated Financial Core artifact preserves explicit contexts and 5/9/13 Network coverage", () => {
  const artifact = JSON.parse(fs.readFileSync(new URL("../docs-platform/generated/financial-core-projection.json", import.meta.url), "utf8"));
  assert.equal(artifact.current_base.provenance.context, "current_base_object");
  assert.equal(artifact.historical_integrated_pilot.provenance.context, "historical_integrated_pilot");
  for (const [key, totalPoints] of [["total_5_points", 5], ["total_9_points", 9], ["total_13_points", 13]] as const) {
    const scenario = artifact.network_scenarios[key];
    assert.equal(scenario.total_point_count, totalPoints);
    assert.equal(scenario.coverage.calculation, "complete", "current 5/9/13 formulas are complete on their known basis");
    assert.equal(scenario.coverage.pricing, "partial", "local wash packages are priced, but the historic-centre seating cohort still needs an approved guest-area input for furniture");
    assert.equal(scenario.coverage.assumptions, "requires_confirmation");
    assert.equal(scenario.coverage.capacity, "review_required");
    assert.equal(scenario.exclusions.some((item: { id: string }) => item.id.startsWith("POINT-WASH-")), false);
    assert.equal(scenario.exclusions.some((item: { id: string }) => item.id === "unresolved:rollout-historic-center-core:furniture"), true);
    assert.equal(scenario.capacity.dailyProductionDemandPortions, totalPoints === 5 ? 1421 : totalPoints === 9 ? 2422 : 3423);
    assert.equal(scenario.capacity.availableDailyProductionCapacityPortions, null, "no equipment throughput is invented from the CAPEX register");
    assert.equal(scenario.network.monthly_cash_flows.length > 1, true);
  }
});
