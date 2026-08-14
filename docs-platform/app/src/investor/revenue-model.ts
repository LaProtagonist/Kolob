import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { canonical, sha256 } from "../governance/util.js";

const projectRoot = path.resolve(platformRoot, "..");
export const REVENUE_MODEL_PATH = "docs-platform/working/revenue-model.yaml";
export const REVENUE_WEB_SNAPSHOT_PATH = "src/content/revenue-model-data.json";
export const REVENUE_SNAPSHOT_SCHEMA_VERSION = 1;

export const REVENUE_CONTENT_SOURCE_PATHS = [
  REVENUE_MODEL_PATH,
  "docs-platform/schemas/revenue-model.schema.json",
  "docs-platform/schemas/revenue-web-snapshot.schema.json",
  "docs-platform/app/src/investor/revenue-model.ts",
] as const;

type RevenueSourcePath = typeof REVENUE_CONTENT_SOURCE_PATHS[number];
type SourceEntry = {
  path: RevenueSourcePath;
  sha256: string;
  normalization: "yaml_canonical_nfc" | "json_canonical_nfc" | "text_lf_nfc";
};

function normalizedStrings(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").normalize("NFC");
  if (Array.isArray(value)) return value.map(normalizedStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.normalize("NFC"), normalizedStrings(item)]));
  }
  return value;
}

function normalizeSource(relativePath: RevenueSourcePath, source: string | Buffer): { text: string; normalization: SourceEntry["normalization"] } {
  const text = source.toString("utf8").replace(/\r\n?/g, "\n").normalize("NFC");
  if (relativePath.endsWith(".yaml")) return { text: canonical(normalizedStrings(YAML.parse(text))), normalization: "yaml_canonical_nfc" };
  if (relativePath.endsWith(".json")) return { text: canonical(normalizedStrings(JSON.parse(text))), normalization: "json_canonical_nfc" };
  return { text, normalization: "text_lf_nfc" };
}

export function buildRevenueContentState(root = projectRoot, overrides: Partial<Record<RevenueSourcePath, string | Buffer>> = {}) {
  const sourceFiles = REVENUE_CONTENT_SOURCE_PATHS.map(relativePath => {
    const source = overrides[relativePath] ?? fs.readFileSync(path.join(root, relativePath));
    const normalized = normalizeSource(relativePath, source);
    return { path: relativePath, sha256: sha256(normalized.text), normalization: normalized.normalization } satisfies SourceEntry;
  });
  const input = { schema_version: 1, snapshot_schema_version: REVENUE_SNAPSHOT_SCHEMA_VERSION, source_files: sourceFiles };
  return { ...input, content_state_sha256: sha256(canonical(input)) };
}

export function readRevenueModel(root = projectRoot): any {
  return YAML.parse(fs.readFileSync(path.join(root, REVENUE_MODEL_PATH), "utf8"));
}

function approxEqual(actual: number, expected: number) {
  return Math.abs(actual - expected) < 1e-9;
}

export function validateRevenueModel(model = readRevenueModel()): string[] {
  const errors: string[] = [];
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/schemas/revenue-model.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(model)) errors.push(...(validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`));

  const segments = model.product_model?.kolobok_price_segments ?? [];
  const segmentShare = segments.reduce((sum: number, item: any) => sum + Number(item.share ?? 0), 0);
  const weightedKolobok = segments.reduce((sum: number, item: any) => sum + Number(item.price_rub ?? 0) * Number(item.share ?? 0), 0);
  const foodMix = Number(model.product_model?.food_mix?.kolobok_share ?? 0) + Number(model.product_model?.food_mix?.manches_share ?? 0);
  const averageFood = weightedKolobok * Number(model.product_model?.food_mix?.kolobok_share ?? 0)
    + Number(model.product_model?.manches?.realized_price_rub ?? 0) * Number(model.product_model?.food_mix?.manches_share ?? 0);
  const averageCheck = Number(model.product_model?.food_portions_per_check ?? 0) * averageFood
    + Number(model.product_model?.drinks?.per_check ?? 0) * Number(model.product_model?.drinks?.average_price_rub ?? 0);

  if (!approxEqual(segmentShare, 1)) errors.push("Kolobok price-segment shares must total exactly 1.");
  if (!approxEqual(foodMix, 1)) errors.push("Food mix shares must total exactly 1.");
  if (!approxEqual(weightedKolobok, 632.5) || !approxEqual(model.product_model?.weighted_kolobok_price_rub, 632.5)) errors.push("Weighted kolobok price must equal exactly 632.50 RUB.");
  if (!approxEqual(averageFood, 636) || !approxEqual(model.product_model?.average_food_portion_price_rub, 636)) errors.push("Average food portion price must equal exactly 636 RUB.");
  if (!approxEqual(averageCheck, 1165.4) || !approxEqual(model.product_model?.average_check_rub, 1165.4)) errors.push("Average check must equal exactly 1165.40 RUB.");

  const scenarios = model.traffic?.scenarios ?? [];
  if (JSON.stringify(scenarios.map((item: any) => [item.id, item.name, item.checks_per_day])) !== JSON.stringify([
    ["pessimistic", "Пессимистичный", 200],
    ["realistic", "Реалистичный", 300],
    ["optimistic", "Оптимистичный", 450],
  ])) errors.push("Traffic scenarios must match the approved 200/300/450 model.");

  const publicText = JSON.stringify(model.public_presentation ?? {}).toLowerCase();
  for (const forbidden of ["research", "v0.1", "registry", "decision id", "change set", "snapshot", "yaml", "approved", "canonical"]) {
    if (publicText.includes(forbidden)) errors.push(`Public presentation contains forbidden technical wording: ${forbidden}.`);
  }
  if (/манч(?!ес)/iu.test(JSON.stringify(model))) errors.push("Revenue Model contains a forbidden shortened product term.");
  if (model.sales_calculation?.days_per_month !== 30 || model.production_load?.trading_hours_per_day !== 12
    || model.production_load?.peak_share !== 0.65 || model.production_load?.peak_hours !== 6
    || model.production_load?.maximum_hour_multiplier !== 1.4) {
    errors.push("Revenue time and production-load assumptions do not match the approved payload.");
  }
  if (model.form?.server_persistence !== false || model.form?.analytics_submission !== false) errors.push("Revenue form inputs must remain local-only.");
  return errors;
}

export function buildRevenueWebSnapshot(root = projectRoot) {
  const model = readRevenueModel(root);
  const errors = validateRevenueModel(model);
  if (errors.length) throw new Error(errors.join("\n"));
  const contentState = buildRevenueContentState(root);
  return {
    meta: {
      schemaVersion: REVENUE_SNAPSHOT_SCHEMA_VERSION,
      dataVersion: model.document.version,
      contentStateSha256: contentState.content_state_sha256,
      sourceFiles: contentState.source_files,
      currency: model.sales_calculation.currency,
    },
    model,
  };
}

function serializedSnapshot(root = projectRoot) {
  return `${JSON.stringify(buildRevenueWebSnapshot(root), null, 2)}\n`;
}

function snapshotSchemaErrors(value: unknown): string[] {
  const schemaPath = path.join(projectRoot, "docs-platform/schemas/revenue-web-snapshot.schema.json");
  const modelSchemaPath = path.join(projectRoot, "docs-platform/schemas/revenue-model.schema.json");
  const modelSchema = JSON.parse(fs.readFileSync(modelSchemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(modelSchema, "revenue-model.schema.json");
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

export function writeRevenueWebSnapshot() {
  const serialized = serializedSnapshot();
  const parsed = JSON.parse(serialized);
  const errors = snapshotSchemaErrors(parsed);
  if (errors.length) throw new Error(`Revenue web snapshot schema failed:\n${errors.join("\n")}`);
  const destination = path.join(projectRoot, REVENUE_WEB_SNAPSHOT_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: REVENUE_WEB_SNAPSHOT_PATH, sha256: sha256(serialized), content_state_sha256: parsed.meta.contentStateSha256 };
}

export function checkRevenueWebSnapshot() {
  const destination = path.join(projectRoot, REVENUE_WEB_SNAPSHOT_PATH);
  if (!fs.existsSync(destination)) throw new Error("Revenue web snapshot is missing. Run npm run revenue:web:sync.");
  const actual = fs.readFileSync(destination, "utf8");
  const parsed = JSON.parse(actual);
  const errors = snapshotSchemaErrors(parsed);
  if (errors.length) throw new Error(`Revenue web snapshot schema failed:\n${errors.join("\n")}`);
  const current = buildRevenueContentState();
  if (parsed.meta.contentStateSha256 !== current.content_state_sha256) {
    const stored = new Map((parsed.meta.sourceFiles ?? []).map((item: any) => [item.path, item.sha256]));
    const changed = current.source_files.filter(item => stored.get(item.path) !== item.sha256);
    throw new Error(["Revenue snapshot stale because:", ...changed.flatMap(item => [`- ${item.path}`, `  expected hash: ${stored.get(item.path) ?? "missing"}`, `  actual hash: ${item.sha256}`])].join("\n"));
  }
  const expected = serializedSnapshot();
  if (actual !== expected) throw new Error("Revenue web snapshot is not deterministic despite an identical content state.");
  return { validation: "OK", path: REVENUE_WEB_SNAPSHOT_PATH, sha256: sha256(actual), content_state_sha256: current.content_state_sha256 };
}
