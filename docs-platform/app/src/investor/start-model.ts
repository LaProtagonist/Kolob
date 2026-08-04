import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import { readModularSources } from "../capex/modular.js";
import { readRegister, sha256 } from "../capex/register.js";
import { readPriceResearch } from "../capex/price-research.js";

export const INVESTOR_START_ITERATION_ID = "ITR-INVESTOR-START-MODEL-2026-08-04-01";
export const INVESTOR_START_PROPOSAL_ID = "PROP-INVESTOR-START-MODEL-2026-08-04-01";
export const INVESTOR_START_DECISION_ID = "DEC-012";
export const INVESTOR_START_CHANGE_ID = "CHG-022";
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
  if (existed && beforeContent !== approved.serialized) throw new Error("Existing Investor Start Model differs from approved payload.");
  writeYaml(rollbackManifestFile, {
    schema_version: 1,
    iteration_id: INVESTOR_START_ITERATION_ID,
    source_change_set: INVESTOR_START_CHANGE_ID,
    target: INVESTOR_START_MODEL_PATH,
    before: { existed, sha256: beforeContent ? sha256(beforeContent) : null, payload: beforeContent },
    reverse_operation: existed ? "restore_file" : "remove_generated_file",
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
  const receipt = YAML.parse(fs.readFileSync(path.resolve(receiptPath), "utf8"));
  const rollback = YAML.parse(fs.readFileSync(rollbackManifestFile, "utf8"));
  const currentSha256 = fileHash(modelFile);
  const result = {
    reverse_change_set: {
      change_id: changeId,
      title: `Откат ${INVESTOR_START_CHANGE_ID} через governed reverse change set`,
      status: "proposed",
      decision_id: decisionId,
      iteration_id: `${INVESTOR_START_ITERATION_ID}-ROLLBACK`,
      proposal_id: `PROP-${changeId}`,
      rollback_of: INVESTOR_START_CHANGE_ID,
      source_receipt: path.relative(projectRoot, path.resolve(receiptPath)).replaceAll(path.sep, "/"),
      operations: [{ type: rollback.reverse_operation, path: INVESTOR_START_MODEL_PATH, expected_sha256: rollback.before.sha256 }],
    },
    current_sha256: currentSha256,
    expected_current_sha256: receipt.after_sha256,
    expected_restored_sha256: rollback.before.sha256,
    restores_original_hash: currentSha256 === receipt.after_sha256,
    apply_allowed: false,
    instruction: "Создать и утвердить rollback decision, затем применить новый reverse change set; исторические события не удаляются.",
  };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}

export function checkInvestorStartModel() {
  const approved = readApprovedPayload();
  const errors = validateInvestorStartModel();
  if (fileHash(modelFile) !== approved.payloadSha256) errors.push("Canonical Investor Start Model differs from approved payload SHA-256.");
  if (errors.length) throw new Error(errors.join("\n"));
  const result = { validation: "OK", path: INVESTOR_START_MODEL_PATH, sha256: approved.payloadSha256 };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
