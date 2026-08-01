import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import {
  buildRegister,
  CAPEX_REGISTER_CSV_PATH,
  CAPEX_REGISTER_DECISION_ID,
  CAPEX_REGISTER_ITERATION_ID,
  CAPEX_REGISTER_YAML_PATH,
  equipmentCsv,
  readRegister,
  registerCsvPath,
  registerStatistics,
  registerYamlPath,
  serializeRegister,
  sha256,
  sourceMarkdownPath,
  validateRegister,
} from "./register.js";
import { applyPriceResearchIfPresent } from "./price-research.js";

const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "capex-register-preview.json");
export const iterationManifestPath = path.join(platformRoot, "changes", "iterations", `${CAPEX_REGISTER_ITERATION_ID}.yaml`);
export const approvedSnapshotPath = path.join(platformRoot, "changelog", "payloads", `${CAPEX_REGISTER_ITERATION_ID}-approved.yaml`);
export const iterationReceiptPath = path.join(platformRoot, "changelog", "iteration-receipts", `${CAPEX_REGISTER_ITERATION_ID}.yaml`);

function fileHash(file: string) { return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null; }
function atomicWrite(file: string, content: string) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(temp, content); fs.renameSync(temp, file); }

function computePreview() {
  const source = fs.readFileSync(sourceMarkdownPath(), "utf8");
  const register = applyPriceResearchIfPresent(buildRegister(source));
  const errors = validateRegister(register, source);
  if (errors.length) throw new Error(errors.join("\n"));
  const yaml = serializeRegister(register);
  const csv = equipmentCsv(register);
  return {
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    source_path: "docs-platform/working/capex-equipment-specification.md",
    source_sha256: sha256(source),
    target_yaml: CAPEX_REGISTER_YAML_PATH,
    target_csv: CAPEX_REGISTER_CSV_PATH,
    before_yaml_sha256: fileHash(registerYamlPath()),
    before_csv_sha256: fileHash(registerCsvPath()),
    approved_payload_sha256: sha256(yaml),
    csv_sha256: sha256(csv),
    statistics: registerStatistics(register),
    validation: "passed" as const,
    yaml,
    csv,
  };
}

export function previewRegister() {
  const preview = computePreview();
  writeSecretJson(runtimePreviewPath, preview);
  const { yaml: _yaml, csv: _csv, ...safe } = preview;
  console.log(JSON.stringify(safe, null, 2));
  return preview;
}

function approvedManifest() {
  if (!fs.existsSync(iterationManifestPath)) throw new Error(`Approved iteration manifest not found: ${path.relative(projectRoot, iterationManifestPath)}.`);
  const manifest = YAML.parse(fs.readFileSync(iterationManifestPath, "utf8"));
  if (manifest.iteration_id !== CAPEX_REGISTER_ITERATION_ID || manifest.decision_id !== CAPEX_REGISTER_DECISION_ID || manifest.status !== "approved") throw new Error("CAPEX register iteration manifest is not approved or has the wrong IDs.");
  return manifest;
}

export function applyRegister(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== CAPEX_REGISTER_DECISION_ID) throw new Error(`Apply requires --apply --decision ${CAPEX_REGISTER_DECISION_ID}.`);
  const decision = loadRegistry().decisions.find(item => item.id === CAPEX_REGISTER_DECISION_ID);
  if (!decision || decision.status !== "approved") throw new Error(`${CAPEX_REGISTER_DECISION_ID} must be registered and approved before apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("CAPEX register preview is missing. Run capex:register:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8"));
  const current = computePreview();
  if (saved.approved_payload_sha256 !== current.approved_payload_sha256 || saved.source_sha256 !== current.source_sha256 || saved.csv_sha256 !== current.csv_sha256) throw new Error("CAPEX register preview changed before apply.");
  const manifest = approvedManifest();
  if (manifest.approved_payload_sha256 !== current.approved_payload_sha256 || manifest.source_sha256 !== current.source_sha256) throw new Error("Approved iteration payload hash differs from the current preview.");
  if (fs.existsSync(iterationReceiptPath)) {
    const receipt = YAML.parse(fs.readFileSync(iterationReceiptPath, "utf8"));
    if (receipt.after_hash === current.approved_payload_sha256 && fileHash(registerYamlPath()) === current.approved_payload_sha256 && fileHash(registerCsvPath()) === current.csv_sha256) {
      console.log("CAPEX register is already applied with the approved hashes; no files changed.");
      return receipt;
    }
    throw new Error("An iteration receipt already exists but current files differ; use a new governed iteration or rollback.");
  }
  const beforeYaml = fs.existsSync(registerYamlPath()) ? fs.readFileSync(registerYamlPath()) : null;
  const beforeCsv = fs.existsSync(registerCsvPath()) ? fs.readFileSync(registerCsvPath()) : null;
  let beforePayloadPath: string | null = null;
  if (beforeYaml) {
    const destination = path.join(platformRoot, "changelog", "payloads", `${CAPEX_REGISTER_ITERATION_ID}-before.yaml`);
    atomicWrite(destination, beforeYaml.toString("utf8"));
    beforePayloadPath = path.relative(projectRoot, destination).replaceAll(path.sep, "/");
  }
  atomicWrite(approvedSnapshotPath, current.yaml);
  if (fileHash(approvedSnapshotPath) !== current.approved_payload_sha256) throw new Error("Approved payload snapshot write verification failed.");
  try {
    atomicWrite(registerYamlPath(), fs.readFileSync(approvedSnapshotPath, "utf8"));
    atomicWrite(registerCsvPath(), current.csv);
    const written = readRegister();
    const errors = validateRegister(written, fs.readFileSync(sourceMarkdownPath(), "utf8"));
    if (errors.length || fileHash(registerYamlPath()) !== current.approved_payload_sha256 || fileHash(registerCsvPath()) !== current.csv_sha256) throw new Error(`CAPEX register write verification failed: ${errors.join("; ")}`);
  } catch (error) {
    if (beforeYaml) atomicWrite(registerYamlPath(), beforeYaml.toString("utf8"));
    else if (fs.existsSync(registerYamlPath())) fs.unlinkSync(registerYamlPath());
    if (beforeCsv) atomicWrite(registerCsvPath(), beforeCsv.toString("utf8"));
    else if (fs.existsSync(registerCsvPath())) fs.unlinkSync(registerCsvPath());
    throw error;
  }
  const appliedAt = new Date().toISOString();
  const receipt = {
    receipt_version: 1,
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: manifest.proposal_id,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    change_set_id: manifest.change_set_id,
    status: "applied",
    applied_at: appliedAt,
    actor: "Codex",
    tool: "docs-platform capex:register:apply",
    source_path: "docs-platform/working/capex-equipment-specification.md",
    source_sha256: current.source_sha256,
    approved_payload_path: path.relative(projectRoot, approvedSnapshotPath).replaceAll(path.sep, "/"),
    approved_payload_sha256: current.approved_payload_sha256,
    target_yaml: CAPEX_REGISTER_YAML_PATH,
    target_csv: CAPEX_REGISTER_CSV_PATH,
    before_payload_path: beforePayloadPath,
    before_hash: beforeYaml ? sha256(beforeYaml) : null,
    after_hash: current.approved_payload_sha256,
    before_csv_hash: beforeCsv ? sha256(beforeCsv) : null,
    after_csv_hash: current.csv_sha256,
    statistics: current.statistics,
    validation_result: "passed",
    git_commit_hash: null,
    rollback: {
      mode: "governed_reverse_change_set",
      before_payload_path: beforePayloadPath,
      before_hash: beforeYaml ? sha256(beforeYaml) : null,
      source_iteration: CAPEX_REGISTER_ITERATION_ID,
      instruction: "Create an approved rollback decision, generate a new reverse change set from this receipt, preview it, apply it and append a rolled_back event. Historical events and payload snapshots remain immutable.",
    },
  };
  writeYaml(iterationReceiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function generateCsv() {
  const register = readRegister();
  const errors = validateRegister(register);
  if (errors.length) throw new Error(errors.join("\n"));
  const csv = equipmentCsv(register);
  atomicWrite(registerCsvPath(), csv);
  console.log(JSON.stringify({ source: CAPEX_REGISTER_YAML_PATH, target: CAPEX_REGISTER_CSV_PATH, rows: register.equipment.length, sha256: sha256(csv) }, null, 2));
}
