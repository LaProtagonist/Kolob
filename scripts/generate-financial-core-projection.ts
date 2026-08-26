import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario } from "../src/lib/configured-economics.js";
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
  "docs-platform/working/network-planning-assumptions.yaml",
  "src/content/network-planning-data.json",
  "src/lib/configured-economics.ts",
  "src/lib/financial-assets.ts",
  "src/lib/financial-core.ts",
  "src/lib/network-financial-core.ts",
  "src/lib/network-financial-projection.ts",
  "src/lib/network-planning.ts",
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
  return {
    total_point_count: additionalPointCount + 1,
    provenance: projection.provenance,
    coverage: projection.coverage,
    warnings: projection.warnings,
    exclusions: projection.exclusions,
    expansion: {
      launch: {
        point_investment_rub: economics.expansion.pointInvestmentRub,
        shared_infrastructure_rub: economics.expansion.sharedInfrastructureRub,
        operating_reserve_rub: economics.expansion.operatingReserveRub,
        reserve_months: economics.expansion.reserveMonths,
        investment_rub: economics.expansion.investmentRub,
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
      launch: { investment_rub: economics.network.investmentRub },
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
      schema_version: 1,
      artifact: "Financial Core Projection",
      contexts: ["historical_integrated_pilot", "current_base_object", "network_expansion", "consolidated_network"],
      financial_model_content_state_sha256: currentFinancialModelContentState(),
      source_files: sourceManifest(),
      reserve_policy: {
        months: [3, 6, 9],
        baseline_months: 6,
        includes: "known recurring Point + Production + Shared operating OPEX",
        excludes: ["income tax", "maintenance CAPEX", "launch CAPEX", "depreciation", "terminal reserve recovery"],
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
