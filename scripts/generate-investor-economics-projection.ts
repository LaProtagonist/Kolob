import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configuredEconomicsScenario } from "../src/lib/configured-economics.js";
import {
  applyNetworkRolloutPreset,
  defaultInvestorConfiguration,
} from "../src/lib/investor-configuration.js";
import {
  defaultInvestorEconomicsTerms,
  investorEconomicsComparison,
  investorEconomicsInvariantErrors,
  investorEconomicsProjection,
} from "../src/lib/investor-economics.js";
import { networkFinancialProjection } from "../src/lib/network-financial-projection.js";
import { baseObjectFinancialProjection } from "../src/lib/network-scaling.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "docs-platform/generated/investor-economics-projection.json");
const sourcePaths = [
  "docs-platform/generated/financial-core-projection.json",
  "docs-platform/generated/financial-model-projection.json",
  "src/lib/investor-economics.ts",
  "src/lib/network-financial-projection.ts",
  "src/lib/network-temporal.ts",
  "src/lib/network-financial-core.ts",
  "src/lib/configured-economics.ts",
  "src/lib/financial-core.ts",
  "src/lib/investor-configuration.ts",
  "src/lib/network-scaling.ts",
  "docs-platform/working/network-planning-assumptions.yaml",
] as const;

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceManifest() {
  return sourcePaths.map((relativePath) => ({
    path: relativePath,
    sha256: sha256(fs.readFileSync(path.join(root, relativePath))),
  }));
}

function defaultFivePointProjection() {
  const initial = defaultInvestorConfiguration();
  const configuration = {
    ...initial,
    networkScaling: applyNetworkRolloutPreset(initial.networkScaling, initial.launchBudget, 4),
  };
  const scenario = configuredEconomicsScenario(configuration);
  return networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario);
}

function launchContingencyAudit(source: ReturnType<typeof defaultFivePointProjection>) {
  const eligibleIds = ["point-preparation", "point-retail-equipment", "point-pos-kds", "point-bar", "point-wash", "furniture"];
  return source.scaling.cohorts.slice(1).map((projection) => {
    const contingency = projection.pointItems.find((item) => item.id === "point-contingency");
    const initialInventory = projection.pointItems.find((item) => item.id.endsWith(":initial-inventory"));
    const eligibleBaseRub = projection.pointItems
      .filter((item) => eligibleIds.some((id) => item.id.endsWith(id)))
      .reduce((total, item) => total + (item.amountRub ?? 0), 0);
    const contingencyPercent = contingency?.amountRub === null || contingency?.amountRub === undefined || eligibleBaseRub <= 0
      ? null
      : Math.round(contingency.amountRub / eligibleBaseRub * 10_000) / 100;
    return {
      cohort_id: projection.cohort.id,
      display_label: contingency?.name ?? null,
      amount_rub: contingency?.amountRub ?? null,
      exact_source: contingency?.source ?? null,
      formula: contingencyPercent === null ? null : `eligible_base_rub × ${contingencyPercent}%`,
      eligible_base_rub: eligibleBaseRub,
      eligible_categories: ["подготовка помещения", "оборудование точки", "POS/KDS", "бар", "локальная мойка", "мебель"],
      excluded_categories: ["предоплата", "обеспечительный платёж", "первоначальный запас", "операционный запас"],
      initial_inventory_rub: initialInventory?.amountRub ?? null,
      economic_meaning: "Непредвиденные расходы на запуск точки; не является операционным запасом и не является первоначальным запасом.",
    };
  });
}

export function buildInvestorEconomicsProjectionArtifact() {
  const source = defaultFivePointProjection();
  const baseline = investorEconomicsProjection(source, defaultInvestorEconomicsTerms());
  const fullProgramme = investorEconomicsProjection(source, {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    residualEquityShare: 0,
  });
  const comparisons = investorEconomicsComparison(source);
  const invariantErrors = [
    ...investorEconomicsInvariantErrors(baseline),
    ...investorEconomicsInvariantErrors(fullProgramme),
    ...comparisons.flatMap((item) => investorEconomicsInvariantErrors(item.projection)),
  ];
  if (invariantErrors.length) throw new Error(`Investor Economics invariant failure: ${invariantErrors.join(" ")}`);
  return {
    meta: {
      schema_version: 1,
      artifact: "Investor Economics Projection",
      source_files: sourceManifest(),
      policy: "Business Financial Core is the only source of business FCF and rollout funding; Investor Economics allocates that monthly cash without recalculating operating economics.",
      coverage: "inherits Current Base + Network Projection coverage; no legal instrument or exit valuation is implied.",
    },
    current_programme: {
      total_program_investment_rub: source.temporal.funding.totalProgramInvestmentRub,
      current_external_funding_requirement_rub: source.temporal.funding.upfrontInvestorFundingRub,
      business_generated_rollout_funding_rub: source.temporal.funding.totalProgramInvestmentRub === null || source.temporal.funding.upfrontInvestorFundingRub === null
        ? null
        : source.temporal.funding.totalProgramInvestmentRub - source.temporal.funding.upfrontInvestorFundingRub,
      programme_payback_month: source.temporal.network.paybackMonth,
      coverage: source.coverage,
    },
    launch_contingency_audit: launchContingencyAudit(source),
    baseline_reinvest_first: baseline,
    full_programme_principal_first: fullProgramme,
    comparison: comparisons.map(({ id, label, terms, projection }) => ({ id, label, terms, metrics: projection.metrics })),
  };
}

export function serializedInvestorEconomicsProjectionArtifact() {
  return `${JSON.stringify(buildInvestorEconomicsProjectionArtifact(), null, 2)}\n`;
}

function main() {
  const serialized = serializedInvestorEconomicsProjectionArtifact();
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== serialized) {
      throw new Error("Investor Economics projection is stale or non-deterministic. Run npm run investor:economics:sync.");
    }
    console.log(JSON.stringify({ validation: "OK", path: path.relative(root, outputPath), sha256: sha256(serialized) }));
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, serialized);
  console.log(JSON.stringify({ path: path.relative(root, outputPath), sha256: sha256(serialized) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
