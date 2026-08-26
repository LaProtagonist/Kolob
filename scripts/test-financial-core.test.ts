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

test("coverage remains available when a model is partial, and only invalid inputs make it invalid", () => {
  assert.equal(financialCoverage([]).status, "complete", "a fully covered fixture is not marked partial by default");
  assert.equal(financialCoverage([{ id: "wash", category: "unpriced_capex", message: "Unpriced wash kit", material: true }]).status, "partial");
  assert.equal(financialCoverage([{ id: "input", category: "invalid_input", message: "Missing required revenue input", material: true }]).status, "invalid");
});

test("every historical OPEX line has an explicit Current Base or Network treatment", () => {
  assert.deepEqual(historicalOpexTreatmentErrors(), []);
  assert.deepEqual(
    [...historicalOpexTreatmentCatalog.map((line) => line.lineId)].sort(),
    [...historicalOpexLineIds].sort(),
    "the treatment catalog must neither silently lose nor duplicate a historical OPEX line",
  );
  assert.ok(
    historicalOpexTreatmentCatalog.some((line) => line.lineId === "banking" && line.status === "unresolved" && !line.includedInKnownExpansion),
    "0 / TBD banking remains disclosed rather than becoming an invented zero-priced cost",
  );
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "admin_reserve")?.baseStatus, "active");
  assert.equal(historicalOpexTreatmentCatalog.find((line) => line.lineId === "admin_reserve")?.status, "unresolved", "a Current Base line cannot silently acquire a Network scaling rule");
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
    Math.abs((economics.expansion.operatingReserveRub ?? 0) - (economics.expansion.opexRub ?? 0) * configuration.launchBudget.operatingReserveMonths) < 0.03,
    true,
    "reserve covers known recurring Point + Production + Shared OPEX, never tax or CAPEX",
  );
  assert.equal(scaling.operating.expansionManagerPayrollRub, 0, "the Base manager is not charged a second time to expansion");
  assert.equal(scaling.operating.expansionFixedMarketingRub, 0, "the fixed 150k marketing base is not multiplied by points");
  assert.equal(temporal.expansion.months.some((month) => month.operatingReserveRub !== 0), true, "reserve is a one-time financing requirement");
  assert.equal(temporal.expansion.months.at(-1)?.operatingReserveRub, 0, "reserve has no automatic terminal recovery");
  assert.equal(projection.status, "partial", "unpriced wash and unresolved recurring lines propagate into consumer status");
  assert.ok(projection.exclusions.some((item) => item.id === "POINT-WASH-SEATING"));
  assert.ok(projection.exclusions.some((item) => item.id === "opex:banking"));
  assert.ok(projection.exclusions.some((item) => item.id === "production:capacity-expansion"));
  assert.ok(projection.exclusions.some((item) => item.id === "logistics:vehicle-depreciation-maintenance"), "vehicle CAPEX is disclosed without inventing an equipment/furniture maintenance rule");
});

test("Network depreciation uses CAPEX detail once while maintenance excludes vehicle and preparation assets", () => {
  const configuration = defaultInvestorConfiguration();
  const cohort = networkScalingProjection(configuration).cohorts[1]!;
  const assets = cohortAssetSummary(cohort, configuredFinancialPolicy(configuration.scenarioId));
  const equipmentGroups = new Set(["point-retail-equipment", "point-pos-kds", "point-bar"]);
  const equipmentDetailTotal = cohort.pointItems
    .filter((item) => equipmentGroups.has(item.id))
    .flatMap((item) => item.detail ?? [])
    .reduce((total, item) => total + (item.amountRub ?? 0), 0);
  const furniture = cohort.pointItems.find((item) => item.id.endsWith(":furniture"))?.amountRub ?? 0;
  const depreciationEquipmentTotal = assets.depreciationAssets
    .filter((asset) => asset.item_id.includes(":CAPEX-"))
    .reduce((total, asset) => total + asset.amount_rub, 0);

  assert.equal(Math.abs(depreciationEquipmentTotal - equipmentDetailTotal) < 0.01, true, "detail assets replace, rather than duplicate, their grouped CAPEX parent");
  assert.equal(Math.abs(assets.maintenanceAssetBasisRub - equipmentDetailTotal - furniture) < 0.01, true, "maintenance basis is applicable equipment plus furniture only");
  const lighting = assets.depreciationAssets.find((asset) => asset.item_id.endsWith(":PREP-LIGHTING"));
  assert.deepEqual(
    lighting && { category: lighting.category, usefulLifeYears: lighting.useful_life_years },
    { category: "ENGINEERING", usefulLifeYears: 10 },
    "cohort provenance prefixes must not change the governed preparation useful-life category",
  );
  assert.equal(assets.vehicleMaintenanceIncluded, false);
});

test("generated Financial Core artifact preserves explicit contexts and 5/9/13 Network coverage", () => {
  const artifact = JSON.parse(fs.readFileSync(new URL("../docs-platform/generated/financial-core-projection.json", import.meta.url), "utf8"));
  assert.equal(artifact.current_base.provenance.context, "current_base_object");
  assert.equal(artifact.historical_integrated_pilot.provenance.context, "historical_integrated_pilot");
  for (const [key, totalPoints] of [["total_5_points", 5], ["total_9_points", 9], ["total_13_points", 13]] as const) {
    const scenario = artifact.network_scenarios[key];
    assert.equal(scenario.total_point_count, totalPoints);
    assert.equal(scenario.coverage.status, "partial", "known-basis economics must disclose outstanding material gaps");
    assert.ok(scenario.exclusions.some((item: { id: string }) => item.id.startsWith("POINT-WASH-")));
    assert.equal(scenario.network.monthly_cash_flows.length > 1, true);
  }
});
