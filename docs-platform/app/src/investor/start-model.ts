import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import { readModularSources } from "../capex/modular.js";
import { readRegister, sha256 } from "../capex/register.js";
import { readPriceResearch } from "../capex/price-research.js";

export const INVESTOR_START_ITERATION_ID = "ITR-LAUNCH-PREMISES-PREPARATION-2026-08-05-01";
export const INVESTOR_START_PROPOSAL_ID = "PROP-LAUNCH-PREMISES-PREPARATION-2026-08-05-01";
export const INVESTOR_START_DECISION_ID = "DEC-014";
export const INVESTOR_START_CHANGE_ID = "CHG-028";
export const INVESTOR_START_PAYLOAD_PATH = `docs-platform/changelog/payloads/${INVESTOR_START_ITERATION_ID}-approved.yaml`;
export const INVESTOR_START_MODEL_PATH = "docs-platform/working/investor-start-model.yaml";
export const INVESTOR_START_RECEIPT_PATH = `docs-platform/changelog/iteration-receipts/${INVESTOR_START_ITERATION_ID}.yaml`;

const projectRoot = path.resolve(platformRoot, "..");
const payloadFile = path.join(projectRoot, INVESTOR_START_PAYLOAD_PATH);
const modelFile = path.join(projectRoot, INVESTOR_START_MODEL_PATH);
const schemaFile = path.join(platformRoot, "schemas", "investor-start-model.schema.json");
const manifestFile = path.join(platformRoot, "changes", "iterations", `${INVESTOR_START_ITERATION_ID}.yaml`);
const runtimePreviewFile = path.join(platformRoot, ".runtime", "investor-start-model-preview.json");
const receiptFile = path.join(projectRoot, INVESTOR_START_RECEIPT_PATH);
const rollbackManifestFile = path.join(platformRoot, "changelog", "rollback-payloads", INVESTOR_START_ITERATION_ID, "manifest.yaml");
const siteRollbackTargets = [
  "docs-platform/schemas/investor-start-model.schema.json",
  "docs-platform/app/test/investor-start-model.test.ts",
  "scripts/test-site.cjs",
  "src/lib/launch-budget.ts",
  "src/components/LaunchBudget.tsx",
  "src/components/LaunchBudget.css",
] as const;

const preparationCategoryAmounts = new Map([
  ["PREP-BUILDING", 3_000_000],
  ["PREP-ELECTRICAL", 1_200_000],
  ["PREP-WATER-DRAINAGE", 800_000],
  ["PREP-VENTILATION", 2_500_000],
  ["PREP-LIGHTING", 400_000],
  ["PREP-GUEST-AREA", 800_000],
  ["PREP-BUILT-IN", 1_300_000],
  ["PREP-DESIGN", 1_000_000],
]);

const operatingExpenseCategories = new Map([
  ["OPEX-PERSONNEL", { name: "Персонал", amount: 2_073_500, description: "Фонд оплаты труда с учётом обязательных начислений и резерва на замещение сотрудников." }],
  ["OPEX-UTILITIES", { name: "Коммунальные услуги", amount: 200_000, description: "Электроэнергия, вода, водоотведение и вывоз отходов." }],
  ["OPEX-EQUIPMENT-MAINTENANCE", { name: "Обслуживание оборудования", amount: 100_000, description: "Техническое обслуживание оборудования, холодильных систем, вентиляции и мелкие ремонты." }],
  ["OPEX-HOUSEHOLD", { name: "Хозяйственные расходы", amount: 80_000, description: "Расходные материалы, хозяйственные товары и текущие закупки." }],
  ["OPEX-SOFTWARE-COMMS", { name: "ПО и связь", amount: 30_000, description: "Кассовые системы, учёт, интернет и сервисные подписки." }],
  ["OPEX-LAUNCH-MARKETING", { name: "Маркетинг запуска", amount: 100_000, description: "Локальное продвижение, акции и поддержка открытия." }],
  ["OPEX-OTHER", { name: "Прочие расходы", amount: 66_500, description: "Дополнительные регулярные расходы, возникающие в процессе работы." }],
]);

function fileHash(file: string) {
  return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null;
}

function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

function readApprovedPayload() {
  if (!fs.existsSync(payloadFile)) throw new Error("Approved Investor Start Model payload is missing.");
  const serialized = fs.readFileSync(payloadFile, "utf8");
  const model = YAML.parse(serialized);
  const errors = validateInvestorStartModel(model);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!fs.existsSync(manifestFile)) throw new Error("Investor Start Model iteration manifest is missing.");
  const manifest = YAML.parse(fs.readFileSync(manifestFile, "utf8"));
  const payloadSha256 = sha256(serialized);
  if (manifest.status !== "approved" || manifest.approved_payload_sha256 !== payloadSha256) {
    throw new Error("Iteration manifest does not match the approved Investor Start Model payload.");
  }
  return { model, serialized, payloadSha256, manifest };
}

export function validateInvestorStartModel(model?: any) {
  const value = model ?? (fs.existsSync(modelFile) ? YAML.parse(fs.readFileSync(modelFile, "utf8")) : null);
  const errors: string[] = [];
  if (!value) return ["Investor Start Model is missing."];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaFile, "utf8")));
  if (!validate(value)) errors.push(...(validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`));

  const register = readRegister();
  const research = readPriceResearch();
  const modular = readModularSources();
  const modules = new Set(modular.modules.modules.map(item => item.module_id));
  const formats = new Set(modular.point_formats.formats.map(item => item.format_id));
  if (!formats.has(value.point_configuration?.format_id)) errors.push(`Unknown format ${value.point_configuration?.format_id}.`);
  for (const moduleId of value.point_configuration?.required_modules ?? []) if (!modules.has(moduleId)) errors.push(`Unknown required module ${moduleId}.`);
  for (const item of value.point_configuration?.optional_modules ?? []) if (!modules.has(item.module_id)) errors.push(`Unknown optional module ${item.module_id}.`);
  for (const item of value.point_configuration?.summary_modules ?? []) if (!modules.has(item.module_id)) errors.push(`Unknown summary module ${item.module_id}.`);

  const oven = register.equipment.find(item => item.item_id === "CAPEX-01-009");
  const ovenLink = modular.module_items.links.find(item => item.module_id === "MOD-PREP" && item.item_id === "CAPEX-01-009");
  const ovenPrice = research.items.find(item => item.item_id === "CAPEX-01-009");
  if (oven?.quantity_base !== 1 || ovenLink?.quantity_rule_type !== "fixed" || ovenLink?.quantity_rule_value !== 1 || ovenLink?.aggregation_rule !== "once") {
    errors.push("CAPEX-01-009 must be fixed at one with aggregation_rule once for MOD-PREP.");
  }
  for (const scenario of ["minimum", "base", "scale_ready"] as const) {
    if (ovenPrice?.scenarios[scenario]?.quantity !== 1) errors.push(`CAPEX-01-009.${scenario} must contain quantity one.`);
  }
  const exclusion = value.point_configuration?.equipment_exclusions?.find((item: any) => item.item_id_prefix === "CAPEX-05-");
  if (!exclusion) errors.push("CAPEX-05 furniture exclusion is missing.");
  if (value.premises?.default_scenario !== "rent"
    || value.premises?.scenarios?.rent?.default_monthly_rent_rub !== 350_000
    || value.premises?.scenarios?.rent?.default_prepayment_months !== 12
    || value.premises?.scenarios?.rent?.default_security_deposit_months !== 2
    || value.premises?.scenarios?.purchase?.default_purchase_price_rub !== 69_000_000) {
    errors.push("Launch-cost demonstration premises defaults do not match DEC-013.");
  }
  if (value.area?.defaults?.total_area_m2 !== 200
    || value.area?.defaults?.kitchen_and_production_area_m2 !== 90
    || value.area?.defaults?.guest_area_m2 !== 80) {
    errors.push("Launch-cost demonstration area defaults do not match DEC-013.");
  }
  if ((value.documents_block?.public_documents ?? []).length !== 0 || value.documents_block?.public_bma_available !== false) {
    errors.push("Internal governing documents must remain hidden from the launch-cost page.");
  }
  if (value.document?.decision_id === INVESTOR_START_DECISION_ID || Array.isArray(value.preparation?.categories)) {
    const categories = value.preparation?.categories ?? [];
    const ids = categories.map((item: any) => item.id);
    const total = categories.reduce((sum: number, item: any) => sum + Number(item.amount_rub ?? 0), 0);
    if (categories.length !== preparationCategoryAmounts.size) errors.push("Premises preparation must contain exactly eight categories.");
    if (new Set(ids).size !== ids.length) errors.push("Premises preparation category IDs must be unique.");
    for (const [id, amount] of preparationCategoryAmounts) {
      const category = categories.find((item: any) => item.id === id);
      if (!category) errors.push(`Missing premises preparation category ${id}.`);
      else {
        if (category.amount_rub !== amount) errors.push(`${id} must equal ${amount} RUB.`);
        if (category.enabled_by_default !== true) errors.push(`${id} must be enabled by default.`);
        if (typeof category.name !== "string" || !category.name || typeof category.description !== "string" || !category.description) errors.push(`${id} public copy is incomplete.`);
      }
    }
    if (value.preparation?.default_total_rub !== 11_000_000 || total !== 11_000_000) errors.push("Premises preparation categories must total exactly 11000000 RUB.");
    if (value.preparation?.baseline_area_m2 !== 200 || value.preparation?.currency !== "RUB" || value.preparation?.default_mode !== "breakdown") {
      errors.push("Premises preparation defaults must remain 200 m2, RUB and breakdown mode.");
    }
  }
  const operatingCategories = value.operating_reserve?.categories ?? [];
  const operatingIds = operatingCategories.map((item: any) => item.id);
  const operatingTotal = operatingCategories.reduce((sum: number, item: any) => sum + Number(item.amount_rub ?? 0), 0);
  if (operatingCategories.length !== operatingExpenseCategories.size) errors.push("Operating reserve must contain exactly seven monthly expense categories.");
  if (new Set(operatingIds).size !== operatingIds.length) errors.push("Operating expense category IDs must be unique.");
  for (const [id, expected] of operatingExpenseCategories) {
    const category = operatingCategories.find((item: any) => item.id === id);
    if (!category) errors.push(`Missing operating expense category ${id}.`);
    else {
      if (category.name !== expected.name) errors.push(`${id}.name must equal the approved public name.`);
      if (category.amount_rub !== expected.amount) errors.push(`${id} must equal ${expected.amount} RUB per month.`);
      if (category.description !== expected.description) errors.push(`${id}.description must equal the approved public copy.`);
    }
  }
  if (operatingTotal !== 2_650_000 || value.operating_reserve?.monthly_total_rub !== 2_650_000) {
    errors.push("Monthly operating expense categories must total exactly 2650000 RUB.");
  }
  if (value.operating_reserve?.default_total_rub !== 15_900_000
    || value.operating_reserve?.default_months !== 6
    || JSON.stringify(value.operating_reserve?.month_options) !== JSON.stringify([3, 6, 9])
    || value.operating_reserve?.default_accordion_open !== false
    || value.operating_reserve?.reserve_formula !== "monthly_total_rub * reserve_months") {
    errors.push("Operating reserve defaults must remain 15900000 RUB, six months, closed accordion and the approved formula.");
  }
  if (value.operating_reserve?.mode_selector_title !== "Расчёт операционных расходов"
    || value.operating_reserve?.default_mode !== "baseline"
    || value.operating_reserve?.baseline_area_m2 !== 200
    || JSON.stringify(value.operating_reserve?.modes) !== JSON.stringify([
      { id: "baseline", title: "Базовый расчёт", description: "Ориентир для объекта площадью около 200 м²" },
      { id: "custom", title: "Другая сумма", description: "Укажите ежемесячные операционные расходы" },
    ])
    || value.operating_reserve?.custom_field_label !== "Ежемесячные операционные расходы"
    || value.operating_reserve?.custom_field_hint !== "Укажите общую сумму регулярных расходов объекта за один месяц."
    || value.operating_reserve?.custom_reserve_formula !== "custom_monthly_opex_rub * reserve_months") {
    errors.push("Operating expense modes must match the approved baseline/custom copy, 200 m2 baseline and custom reserve formula.");
  }
  const publicCopy = JSON.stringify(value.public_presentation ?? {});
  for (const forbidden of ["потребност", "стартов", "research", "approved", "v0.1", "snapshot", "registry", "payload", "change set"]) {
    if (publicCopy.toLowerCase().includes(forbidden)) errors.push(`Public presentation contains forbidden technical wording: ${forbidden}.`);
  }
  if (value.form?.server_persistence !== false || value.form?.analytics_submission !== false) errors.push("Launch inputs must remain local-only.");
  return errors;
}

function computePreview() {
  const approved = readApprovedPayload();
  const beforeSha256 = fileHash(modelFile);
  const afterSha256 = approved.payloadSha256;
  return {
    iteration_id: INVESTOR_START_ITERATION_ID,
    proposal_id: INVESTOR_START_PROPOSAL_ID,
    decision_id: INVESTOR_START_DECISION_ID,
    change_set_id: INVESTOR_START_CHANGE_ID,
    approved_payload: { path: INVESTOR_START_PAYLOAD_PATH, sha256: approved.payloadSha256 },
    target: INVESTOR_START_MODEL_PATH,
    before_sha256: beforeSha256,
    after_sha256: afterSha256,
    writes: false,
    validation: "passed",
    oven: { item_id: "CAPEX-01-009", quantity: 1, aggregation_rule: "once" },
  };
}

export function previewInvestorStartModel() {
  const preview = computePreview();
  writeSecretJson(runtimePreviewFile, preview);
  console.log(JSON.stringify(preview, null, 2));
  return preview;
}

export function applyInvestorStartModel(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== INVESTOR_START_DECISION_ID) {
    throw new Error(`Apply requires --apply --decision ${INVESTOR_START_DECISION_ID}.`);
  }
  const registry = loadRegistry();
  if (!registry.decisions.some(item => item.id === INVESTOR_START_DECISION_ID && item.status === "approved")) throw new Error(`${INVESTOR_START_DECISION_ID} is not approved.`);
  if (!registry.documents.some(item => item.id === "DOC-INVESTOR-START-MODEL" && item.status === "research")) throw new Error("Investor Start Model is not registered as research.");
  if (!fs.existsSync(runtimePreviewFile)) throw new Error("Investor Start Model preview is missing.");
  if (fs.existsSync(receiptFile)) throw new Error("Investor Start Model was already applied.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewFile, "utf8"));
  const current = computePreview();
  if (saved.approved_payload.sha256 !== current.approved_payload.sha256 || saved.before_sha256 !== current.before_sha256 || saved.after_sha256 !== current.after_sha256) {
    throw new Error("Approved payload or target state changed after preview.");
  }
  const approved = readApprovedPayload();
  const existed = fs.existsSync(modelFile);
  const beforeContent = existed ? fs.readFileSync(modelFile, "utf8") : null;
  const rollbackRoot = path.dirname(rollbackManifestFile);
  if (fs.existsSync(rollbackRoot)) throw new Error("Investor Start Model rollback payload already exists; refusing to overwrite it.");
  const siteFiles = siteRollbackTargets.map(relativePath => {
    const source = path.join(projectRoot, relativePath);
    const fileExisted = fs.existsSync(source);
    const content = fileExisted ? fs.readFileSync(source) : null;
    const rollbackPayload = path.join(rollbackRoot, "site", relativePath);
    if (content) atomicWrite(rollbackPayload, content.toString("utf8"));
    return {
      path: relativePath,
      existed: fileExisted,
      before_sha256: content ? sha256(content) : null,
      rollback_payload_path: content ? path.relative(projectRoot, rollbackPayload).replaceAll(path.sep, "/") : null,
      after_sha256: null,
    };
  });
  writeYaml(rollbackManifestFile, {
    schema_version: 1,
    iteration_id: INVESTOR_START_ITERATION_ID,
    source_change_set: INVESTOR_START_CHANGE_ID,
    target: INVESTOR_START_MODEL_PATH,
    before: { existed, sha256: beforeContent ? sha256(beforeContent) : null, payload: beforeContent },
    reverse_operation: existed ? "restore_file" : "remove_generated_file",
    site_files: siteFiles,
    derived_refresh: {
      command: "npm run capex:web:sync",
      target: "src/content/capex-configurator-data.json",
    },
    preserves_history: true,
  });
  atomicWrite(modelFile, approved.serialized);
  const errors = validateInvestorStartModel();
  if (errors.length || fileHash(modelFile) !== approved.payloadSha256) {
    if (beforeContent !== null) atomicWrite(modelFile, beforeContent);
    else fs.unlinkSync(modelFile);
    throw new Error(errors.join("\n") || "Applied Investor Start Model differs from approved payload.");
  }
  const receipt = {
    receipt_version: 1,
    iteration_id: INVESTOR_START_ITERATION_ID,
    proposal_id: INVESTOR_START_PROPOSAL_ID,
    decision_id: INVESTOR_START_DECISION_ID,
    change_set_id: INVESTOR_START_CHANGE_ID,
    status: "applied",
    applied_at: new Date().toISOString(),
    actor: "Codex",
    tool: "docs-platform investor:start:apply",
    approved_payload: current.approved_payload,
    target: INVESTOR_START_MODEL_PATH,
    before_sha256: current.before_sha256,
    after_sha256: current.after_sha256,
    before_files: siteFiles,
    validation_result: "passed",
    git_commit_hash: null,
    rollback: {
      mode: "governed_reverse_change_set",
      rollback_payload: path.relative(projectRoot, rollbackManifestFile).replaceAll(path.sep, "/"),
      preview_command: `npm run investor:start:reverse:preview -- ../changelog/iteration-receipts/${INVESTOR_START_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`,
      preserves_history: true,
      git_reset_forbidden: true,
    },
  };
  writeYaml(receiptFile, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function previewInvestorStartReverse(receiptPath = receiptFile, changeId = "CHG-ROLLBACK-XXX", decisionId = "DEC-ROLLBACK-XXX") {
  const absoluteReceipt = path.resolve(receiptPath);
  const receipt = YAML.parse(fs.readFileSync(absoluteReceipt, "utf8"));
  const iterationRollbackManifest = path.join(platformRoot, "changelog", "rollback-payloads", receipt.iteration_id, "manifest.yaml");
  const rollback = YAML.parse(fs.readFileSync(iterationRollbackManifest, "utf8"));
  const currentSha256 = fileHash(modelFile);
  const operations: Array<Record<string, unknown>> = [
    { type: rollback.reverse_operation, path: INVESTOR_START_MODEL_PATH, expected_sha256: rollback.before.sha256 },
  ];
  if (rollback.public_page) {
    operations.push({
      type: rollback.public_page.reverse_operation,
      audit_receipt: rollback.public_page.audit_receipt,
      affected_files: rollback.public_page.affected_files,
      restore_values: rollback.public_page.before,
    });
  }
  for (const file of rollback.site_files ?? []) {
    operations.push({
      type: file.existed ? "restore_file" : "remove_generated_file",
      path: file.path,
      source: file.rollback_payload_path,
      expected_sha256: file.before_sha256,
    });
  }
  if (rollback.derived_refresh) operations.push({ type: "regenerate_derived_snapshot", ...rollback.derived_refresh });
  const siteFilesMatch = (rollback.site_files ?? []).every((file: any) => file.after_sha256 && fileHash(path.join(projectRoot, file.path)) === file.after_sha256);
  const rollbackPayloadsMatch = (rollback.site_files ?? []).every((file: any) => !file.existed || (file.rollback_payload_path && fileHash(path.join(projectRoot, file.rollback_payload_path)) === file.before_sha256));
  const result = {
    reverse_change_set: {
      change_id: changeId,
      title: `Откат ${receipt.change_set_id} через governed reverse change set`,
      status: "proposed",
      decision_id: decisionId,
      iteration_id: `${receipt.iteration_id}-ROLLBACK`,
      proposal_id: `PROP-${changeId}`,
      rollback_of: receipt.change_set_id,
      source_receipt: path.relative(projectRoot, absoluteReceipt).replaceAll(path.sep, "/"),
      operations,
    },
    current_sha256: currentSha256,
    expected_current_sha256: receipt.after_sha256,
    expected_restored_sha256: rollback.before.sha256,
    restores_original_hash: currentSha256 === receipt.after_sha256 && (rollback.site_files ? siteFilesMatch : true),
    restores_previous_public_copy: Boolean(rollback.public_page?.before?.page_title || rollback.site_files?.length),
    rollback_payloads_match_before_hashes: rollbackPayloadsMatch,
    apply_allowed: false,
    instruction: "Создать и утвердить rollback decision, затем применить новый reverse change set; исторические события не удаляются.",
  };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}

export function checkInvestorStartModel() {
  if (!fs.existsSync(modelFile)) throw new Error("Investor Start Model is missing.");
  const serialized = fs.readFileSync(modelFile, "utf8");
  const model = YAML.parse(serialized);
  const errors = validateInvestorStartModel();
  const iterationId = model?.document?.iteration_id;
  const decisionId = model?.document?.decision_id;
  const payloadCandidates = typeof iterationId === "string"
    ? [
        path.join(platformRoot, "changelog", "payloads", `${iterationId}-approved.yaml`),
        path.join(platformRoot, "changelog", "payloads", `${iterationId}-approved-v2.yaml`),
      ]
    : [];
  const matchingPayload = payloadCandidates.find(candidate => fs.existsSync(candidate) && fs.readFileSync(candidate, "utf8") === serialized);
  const currentReceiptFile = typeof iterationId === "string"
    ? path.join(platformRoot, "changelog", "iteration-receipts", `${iterationId}.yaml`)
    : null;
  const receipt = currentReceiptFile && fs.existsSync(currentReceiptFile)
    ? YAML.parse(fs.readFileSync(currentReceiptFile, "utf8"))
    : null;
  const approvedPayloadPath = receipt?.approved_payload?.path;
  const approvedPayloadFile = typeof approvedPayloadPath === "string" ? path.join(projectRoot, approvedPayloadPath) : null;
  const receiptProvesCurrentModel = Boolean(
    receipt
    && receipt.decision_id === decisionId
    && approvedPayloadFile
    && fs.existsSync(approvedPayloadFile)
    && sha256(fs.readFileSync(approvedPayloadFile)) === receipt.approved_payload?.sha256
    && receipt.after_files?.some((entry: { path?: string; sha256?: string }) => entry.path === INVESTOR_START_MODEL_PATH && entry.sha256 === sha256(serialized)),
  );
  const registry = loadRegistry();
  if (!matchingPayload && !receiptProvesCurrentModel) errors.push("Canonical Investor Start Model is not bound to an exact approved payload and applied receipt.");
  if (!registry.decisions.some(item => item.id === decisionId && item.status === "approved")) errors.push(`Declared Investor Start Model decision ${decisionId} is not approved.`);
  if (errors.length) throw new Error(errors.join("\n"));
  const result = { validation: "OK", path: INVESTOR_START_MODEL_PATH, sha256: sha256(serialized) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
