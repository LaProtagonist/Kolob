import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario, type ConfiguredEconomicsScenario } from "../src/lib/configured-economics.js";
import {
  applyNetworkRolloutPreset,
  defaultInvestorConfiguration,
  historicalIntegratedPilotConfiguration,
  type InvestorConfiguration,
} from "../src/lib/investor-configuration.js";
import { networkFinancialProjection } from "../src/lib/network-financial-projection.js";
import { baseObjectFinancialProjection } from "../src/lib/network-scaling.js";
import { historicalOpexTreatmentCatalog } from "../src/lib/physical-allocation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "docs-platform/generated/financial-core-projection.json");
const financialModelProjectionPath = path.join(root, "docs-platform/generated/financial-model-projection.json");
const sourcePaths = [
  "docs-platform/generated/financial-model-projection.json",
  "docs-platform/registry/sources.yaml",
  "docs-platform/working/capex-equipment-register.yaml",
  "docs-platform/working/network-planning-assumptions.yaml",
  "docs-platform/app/src/investor/network-planning.ts",
  "src/content/capex-configurator-data.json",
  "src/content/network-planning-data.json",
  "src/lib/configured-economics.ts",
  "src/lib/launch-budget.ts",
  "src/lib/financial-assets.ts",
  "src/lib/financial-core.ts",
  "src/lib/network-financial-core.ts",
  "src/lib/network-financial-projection.ts",
  "src/lib/network-planning.ts",
  "src/lib/rent-prepayment.ts",
  "src/lib/network-scaling.ts",
  "src/lib/network-temporal.ts",
  "src/lib/physical-allocation.ts",
] as const;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function currentFinancialModelContentState() {
  const projection = JSON.parse(fs.readFileSync(financialModelProjectionPath, "utf8"));
  const value = projection.meta?.content_state?.content_state_sha256;
  if (typeof value !== "string") throw new Error("Financial Model projection does not expose a content-state hash.");
  return value;
}

function financialModelScenario(scenarioId: string) {
  const projection = JSON.parse(fs.readFileSync(financialModelProjectionPath, "utf8"));
  const scenario = projection.scenarios?.rent?.[scenarioId];
  if (!scenario) throw new Error(`Financial Model projection is missing the ${scenarioId} rent scenario.`);
  return scenario as {
    fixed_opex_reserve_rub: number;
    calculated_staffing_labor_rub: number;
    fixed_opex_without_labor_rent_rub: number;
    marketing_rub: number;
    household_rub: number;
  };
}

function historicalBaseReserveDecomposition(scenarioId: string, base: ReturnType<typeof baseObjectFinancialProjection>, reserveMonths: number) {
  const source = financialModelScenario(scenarioId);
  const fixedReserve = source.fixed_opex_reserve_rub;
  return {
    context: "historical_integrated_pilot",
    policy: "historical_financial_model_fixed_opex_reserve",
    source_metric: `financial_model.scenarios.rent.${scenarioId}.fixed_opex_reserve_rub`,
    reserve_months: reserveMonths,
    monthly_current_pnl_opex_rub: base.opexRub,
    monthly_reserve_basis_rub: fixedReserve / reserveMonths,
    operating_reserve_rub: base.operatingReserveRub,
    included_monthly_basis_rub: {
      calculated_staffing_labor_rub: source.calculated_staffing_labor_rub,
      fixed_opex_without_labor_rent_rub: source.fixed_opex_without_labor_rent_rub,
      scenario_marketing_rub: source.marketing_rub,
      scenario_household_rub: source.household_rub,
      uncovered_rent_rub: 0,
    },
    excludes: ["raw_materials", "waste", "packaging", "acquiring", "aggregator_commission", "administrative_reserve", "income_tax", "maintenance_capex", "prepaid_rent"],
    note: "Historical Integrated Pilot retains its governed fixed-OPEX liquidity reserve; it is not a Current Base input.",
  };
}

function baseReserveDecomposition(
  scenario: ConfiguredEconomicsScenario,
  base: ReturnType<typeof baseObjectFinancialProjection>,
  reserveMonths: number,
) {
  const reserve = scenario.currentBaseReserveProjection;
  if (!reserve) return historicalBaseReserveDecomposition(scenario.id, base, reserveMonths);
  return {
    context: reserve.context,
    policy: reserve.policy,
    source_metric: "current_base_reserve_projection",
    reserve_months: reserve.months,
    monthly_current_pnl_opex_rub: base.opexRub,
    monthly_reserve_basis_rub: reserve.monthlyBasisRub,
    operating_reserve_rub: reserve.totalReserveRub,
    included_monthly_basis_rub: Object.fromEntries(reserve.includedLines.map((line) => [line.id, line.monthlyAmountRub])),
    excludes: reserve.excludedLineIds,
    prepaid_coverage: reserve.prepaidCoverage,
    uncovered_rent_rub: reserve.uncoveredRentRub,
    note: "Current Base reserve is calculated from Current Base fixed and semi-fixed P&L inputs. Variable costs and separately financed launch items are excluded.",
  };
}

function sourceManifest() {
  return sourcePaths.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(fs.readFileSync(path.join(root, relativePath))),
  }));
}

function baseArtifact(configuration: InvestorConfiguration) {
  const scenario = configuredEconomicsScenario(configuration);
  const base = baseObjectFinancialProjection(scenario);
  const network = networkFinancialProjection(configuration, base, scenario);
  return {
    provenance: { context: base.context, financial_model_content_state_sha256: currentFinancialModelContentState() },
    launch: {
      investment_rub: base.investmentRub,
      operating_reserve_rub: base.operatingReserveRub,
    },
    reserve_decomposition: baseReserveDecomposition(scenario, base, configuration.launchBudget.operatingReserveMonths),
    pnl: {
      revenue_rub: base.revenueRub,
      net_revenue_rub: base.netRevenueRub,
      opex_rub: base.opexRub,
      ebitda_rub: base.ebitdaRub,
      tax_rub: base.taxRub,
      depreciation_rub: base.depreciationRub,
      maintenance_capex_rub: base.maintenanceCapexRub,
      operating_free_cash_flow_rub: base.operatingFreeCashFlowRub,
    },
    metrics: {
      payback_month: base.paybackMonth,
      irr: scenario.irr,
      npv_rub: scenario.npvRub,
    },
    monthly_cash_flows: network.temporal.base.months,
  };
}

function scenarioArtifact(additionalPointCount: 4 | 8 | 12) {
  const initial = defaultInvestorConfiguration();
  const configuration = {
    ...initial,
    networkScaling: applyNetworkRolloutPreset(initial.networkScaling, initial.launchBudget, additionalPointCount),
  };
  const scenario = configuredEconomicsScenario(configuration);
  const base = baseObjectFinancialProjection(scenario);
  const projection = networkFinancialProjection(configuration, base, scenario);
  const { economics, temporal } = projection;
  const baseReserve = baseReserveDecomposition(scenario, base, configuration.launchBudget.operatingReserveMonths);
  const baseReserveRub = baseReserve.operating_reserve_rub;
  const expansionReserveRub = economics.expansion.operatingReserveRub;
  const consolidatedReserveRub = baseReserveRub === null || expansionReserveRub === null
    ? null
    : baseReserveRub + expansionReserveRub;
  return {
    total_point_count: additionalPointCount + 1,
    provenance: projection.provenance,
    coverage: projection.coverage,
    warnings: projection.warnings,
    exclusions: projection.exclusions,
    capacity: projection.scaling.operating.productionCapacity,
    reserve_decomposition: {
      base: baseReserve,
      expansion: {
        context: "network_expansion",
        policy: economics.expansion.operatingReserve?.policy ?? "six_months_qualifying_fixed_and_semi_fixed_opex_by_cohort",
        reserve_months: economics.expansion.reserveMonths,
        monthly_current_pnl_opex_rub: economics.expansion.opexRub,
        monthly_reserve_basis_rub: null,
        operating_reserve_rub: expansionReserveRub,
        cohort_reserves: economics.expansion.operatingReserve?.cohortReserves ?? [],
        shared_reserves: economics.expansion.operatingReserve?.sharedReserves ?? [],
        funding_events: economics.expansion.operatingReserve?.fundingEvents ?? [],
        excludes: economics.expansion.operatingReserve?.excludedLineIds ?? [],
      },
      consolidated: {
        context: "consolidated_network",
        monthly_current_pnl_opex_rub: economics.network.opexRub,
        financing_requirement_reserve_rub: consolidatedReserveRub,
        formula: "current_base_qualifying_fixed_and_semi_fixed_opex_reserve + dated_expansion_cohort_and_shared_reserves",
        composition: "Base reserve is funded once at launch. Expansion reserves are dated per cohort/service trigger and are not monthly P&L expenses.",
        comparable_to_network_pnl_opex_times_months: false,
      },
    },
    shared_opex: {
      administrative_reserve_rub: projection.scaling.operating.administrativeReserveRub,
      incremental_uniform_renewal_rub: projection.scaling.operating.incrementalUniformRenewalRub,
      incremental_medical_rub: projection.scaling.operating.incrementalMedicalRub,
      logistics_rub: projection.scaling.operating.logisticsRub,
    },
    expansion: {
      launch: {
        point_investment_rub: economics.expansion.pointInvestmentRub,
        shared_infrastructure_rub: economics.expansion.sharedInfrastructureRub,
        operating_reserve_rub: economics.expansion.operatingReserveRub,
        reserve_months: economics.expansion.reserveMonths,
        investment_rub: economics.expansion.investmentRub,
        rollout_funding_requirement_rub: temporal.funding.rolloutFundingRequirementRub,
      },
      pnl: {
        revenue_rub: economics.expansion.revenueRub,
        opex_rub: economics.expansion.opexRub,
        ebitda_rub: economics.expansion.operatingResultRub,
        tax_rub: economics.expansion.taxRub,
        depreciation_rub: economics.expansion.depreciationRub,
        maintenance_capex_rub: economics.expansion.maintenanceCapexRub,
        operating_free_cash_flow_rub: economics.expansion.operatingFreeCashFlowRub,
      },
      metrics: { steady_state_payback_months: economics.expansion.paybackMonths, temporal_payback_month: temporal.expansion.paybackMonth },
      monthly_cash_flows: temporal.expansion.months,
    },
    network: {
      launch: {
        investment_rub: economics.network.investmentRub,
        total_program_investment_rub: temporal.funding.totalProgramInvestmentRub,
        upfront_investor_funding_rub: temporal.funding.upfrontInvestorFundingRub,
        minimum_unfunded_cumulative_cash_rub: temporal.funding.minimumUnfundedCumulativeCashRub,
      },
      pnl: {
        revenue_rub: economics.network.revenueRub,
        opex_rub: economics.network.opexRub,
        ebitda_rub: economics.network.operatingResultRub,
        tax_rub: economics.network.taxRub,
        depreciation_rub: economics.network.depreciationRub,
        maintenance_capex_rub: economics.network.maintenanceCapexRub,
        operating_free_cash_flow_rub: economics.network.operatingFreeCashFlowRub,
      },
      metrics: { steady_state_payback_months: economics.network.paybackMonths, temporal_payback_month: temporal.network.paybackMonth },
      monthly_cash_flows: temporal.network.months,
    },
  };
}

export function buildFinancialCoreProjectionArtifact() {
  return {
    meta: {
      schema_version: 2,
      artifact: "Financial Core Projection",
      contexts: ["historical_integrated_pilot", "current_base_object", "network_expansion", "consolidated_network"],
      financial_model_content_state_sha256: currentFinancialModelContentState(),
      source_files: sourceManifest(),
      reserve_policy: {
        months: [3, 6, 9],
        baseline_months: 6,
        includes: "qualifying fixed and semi-fixed Point, Production and Shared recurring OPEX, scheduled by cohort/service trigger",
        excludes: ["raw materials", "waste", "consumer packaging", "acquiring", "aggregator", "administrative reserve", "variable marketing", "traffic household", "Foodhall revenue share above minimum", "income tax", "maintenance CAPEX", "launch CAPEX", "depreciation", "terminal reserve recovery"],
        terminal_reserve_recovery_rub: 0,
      },
      coverage_contract: {
        calculation: ["complete", "partial", "invalid"],
        pricing: ["complete", "partial"],
        assumptions: ["confirmed", "planning", "requires_confirmation"],
        capacity: ["covered", "review_required", "exceeded"],
      },
      opex_catalog: historicalOpexTreatmentCatalog,
    },
    current_base: baseArtifact(defaultInvestorConfiguration()),
    historical_integrated_pilot: baseArtifact(historicalIntegratedPilotConfiguration()),
    network_scenarios: {
      total_5_points: scenarioArtifact(4),
      total_9_points: scenarioArtifact(8),
      total_13_points: scenarioArtifact(12),
    },
  };
}

export function serializedFinancialCoreProjectionArtifact() {
  return `${JSON.stringify(buildFinancialCoreProjectionArtifact(), null, 2)}\n`;
}

function main() {
  const serialized = serializedFinancialCoreProjectionArtifact();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
      throw new Error("Financial Core projection is stale or non-deterministic. Run npm run financial:core:sync.");
    }
    console.log(JSON.stringify({ validation: "OK", path: path.relative(root, outputPath), sha256: sha256(serialized) }));
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(JSON.stringify({ path: path.relative(root, outputPath), sha256: sha256(serialized) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
