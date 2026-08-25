import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { canonical, sha256 } from "../governance/util.js";
import { readFinancialModel } from "../financial/financial-model.js";
import { readRevenueModel } from "./revenue-model.js";

const projectRoot = path.resolve(platformRoot, "..");

export const NETWORK_PLANNING_PATH = "docs-platform/working/network-planning-assumptions.yaml";
export const NETWORK_PLANNING_SCHEMA_PATH = "docs-platform/schemas/network-planning-assumptions.schema.json";
export const NETWORK_PLANNING_SNAPSHOT_PATH = "src/content/network-planning-data.json";
export const NETWORK_PLANNING_SNAPSHOT_SCHEMA_VERSION = 1;

export const NETWORK_PLANNING_SOURCE_PATHS = [
  NETWORK_PLANNING_PATH,
  NETWORK_PLANNING_SCHEMA_PATH,
  "docs-platform/working/financial-model.yaml",
  "docs-platform/working/revenue-model.yaml",
  "src/lib/physical-allocation.ts",
  "src/lib/employer-contributions.ts",
  "docs-platform/app/src/investor/network-planning.ts",
] as const;

type SourcePath = typeof NETWORK_PLANNING_SOURCE_PATHS[number];

function normalizedSource(relativePath: string, bytes: string | Buffer) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n").normalize("NFC");
  return relativePath.endsWith(".yaml") || relativePath.endsWith(".json") ? canonical(YAML.parse(text)) : text;
}

export function buildNetworkPlanningContentState(root = projectRoot, overrides: Partial<Record<SourcePath, string | Buffer>> = {}) {
  const sourceFiles = NETWORK_PLANNING_SOURCE_PATHS.map(file => ({
    path: file,
    sha256: sha256(normalizedSource(file, overrides[file] ?? fs.readFileSync(path.join(root, file)))),
  }));
  const input = { schema_version: 1, source_files: sourceFiles };
  return { ...input, content_state_sha256: sha256(canonical(input)) };
}

export function readNetworkPlanningModel(root = projectRoot): any {
  return YAML.parse(fs.readFileSync(path.join(root, NETWORK_PLANNING_PATH), "utf8"));
}

export function validateNetworkPlanningModel(model = readNetworkPlanningModel()): string[] {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, NETWORK_PLANNING_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const errors = validate(model) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
  if (model.references?.financial_model !== "docs-platform/working/financial-model.yaml") errors.push("Planning model must reference the canonical Financial Model.");
  if (model.references?.physical_allocation !== "src/lib/physical-allocation.ts") errors.push("Planning model must reference the physical allocation map.");
  if (model.launch?.initial_inventory_operating_days !== 3) errors.push("Planning initial inventory must default to three operating days.");
  if (model.staffing?.takeaway?.base?.roles?.CASHIER_BAR !== 1 || model.staffing?.takeaway?.base?.roles?.LINE_COOK !== 2) errors.push("Takeaway base must retain 1 cashier and 2 kitchen positions.");
  if (model.staffing?.seating?.minimum_total_area_m2 !== 60) errors.push("Seating planning minimum area must be 60m².");
  if (model.logistics?.own_vehicle_suggested_from_point_count !== 3) errors.push("Own logistics suggestion must start at three points.");
  return errors;
}

function payrollPolicy(financial: any) {
  const contributions = financial.staffing.employer_contributions;
  return {
    defaultScenario: contributions.default_scenario,
    reduced: {
      mrotRub: Number(contributions.reduced.mrot_rub),
      thresholdMultiple: Number(contributions.reduced.threshold_multiple),
      rateBelowThreshold: Number(contributions.reduced.rate_below_threshold),
      rateAboveThreshold: Number(contributions.reduced.rate_above_threshold),
    },
    standard: { rate: Number(contributions.standard.rate) },
    personnelReserveRate: Number(financial.staffing.personnel_reserve_rate),
  };
}

export function buildNetworkPlanningSnapshot(root = projectRoot) {
  const model = readNetworkPlanningModel(root);
  const errors = validateNetworkPlanningModel(model);
  if (errors.length) throw new Error(errors.join("\n"));
  const financial = readFinancialModel(root);
  const revenue = readRevenueModel(root);
  const requiredRoleIds = new Set(["CASHIER_BAR", "LINE_COOK", "PREP_COOK", "ADMINISTRATOR", "SOUS_CHEF", "MANAGER", "TECHNICAL"]);
  const roles = Object.fromEntries((financial.staffing.roles as any[])
    .filter(role => requiredRoleIds.has(role.id))
    .map(role => [role.id, { id: role.id, name: role.role, grossSalaryRub: Number(role.gross_salary_rub) }]));
  if (Object.keys(roles).length !== requiredRoleIds.size) throw new Error("Canonical Financial Model is missing a planning role salary reference.");
  const opex = Object.fromEntries((financial.opex.entries as any[]).map(entry => [entry.id, entry]));
  const contentState = buildNetworkPlanningContentState(root);
  return {
    meta: {
      schemaVersion: NETWORK_PLANNING_SNAPSHOT_SCHEMA_VERSION,
      dataVersion: model.document.version,
      contentStateSha256: contentState.content_state_sha256,
      sourceFiles: contentState.source_files,
      provenance: model.document.provenance,
      boundary: model.document.boundary,
    },
    planning: model,
    canonicalReferences: {
      roles,
      payrollPolicy: payrollPolicy(financial),
      revenue: {
        workingDaysPerMonth: Number(revenue.sales_calculation.days_per_month),
        foodPortionsPerCheck: Number(revenue.product_model.food_portions_per_check),
      },
      opex: {
        rawMaterialsRate: Number(financial.food_cost.protected_formula.raw_materials_rate),
        wasteRate: Number(financial.food_cost.waste.default_rate),
        packagingBaselineChecksPerDay: Number(financial.packaging.baseline_checks_per_day),
        packagingBaselineMonthlyRub: Number(financial.packaging.baseline_monthly_rub),
        acquiringRateOfGrossRevenue: Number(opex.ACQUIRING.rate_of_gross_revenue),
        marketingFixedMonthlyRub: Number(opex.MARKETING.fixed_amount_rub),
        marketingVariableRateOfNetRevenue: Number(opex.MARKETING.rate_of_net_revenue),
      },
      launch: {
        launchMarketingRub: Number(financial.launch_investment.launch_marketing_rub),
      },
    },
  };
}

function serializedSnapshot(root = projectRoot) {
  return `${JSON.stringify(buildNetworkPlanningSnapshot(root), null, 2)}\n`;
}

export function writeNetworkPlanningSnapshot() {
  const serialized = serializedSnapshot();
  const destination = path.join(projectRoot, NETWORK_PLANNING_SNAPSHOT_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: NETWORK_PLANNING_SNAPSHOT_PATH, sha256: crypto.createHash("sha256").update(serialized).digest("hex") };
}

export function checkNetworkPlanningSnapshot() {
  const destination = path.join(projectRoot, NETWORK_PLANNING_SNAPSHOT_PATH);
  if (!fs.existsSync(destination)) throw new Error("Network planning snapshot is missing. Run npm run network:planning:sync.");
  const actual = fs.readFileSync(destination, "utf8");
  const expected = serializedSnapshot();
  if (actual !== expected) throw new Error("Network planning snapshot is stale or non-deterministic. Run npm run network:planning:sync.");
  return { validation: "OK", path: NETWORK_PLANNING_SNAPSHOT_PATH, sha256: crypto.createHash("sha256").update(actual).digest("hex") };
}
