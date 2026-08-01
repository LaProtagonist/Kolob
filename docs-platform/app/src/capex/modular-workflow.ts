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
  CAPEX_REGISTER_PROPOSAL_ID,
  CAPEX_REGISTER_YAML_PATH,
  equipmentCsv,
  registerStatistics,
  serializeRegister,
  sha256,
  sourceMarkdownPath,
  validateRegister,
} from "./register.js";
import { applyPriceResearchIfPresent } from "./price-research.js";
import {
  buildEquipmentBom,
  buildModularSources,
  equipmentBomCsv,
  MODULAR_PATHS,
  modularPayload,
  modularStatistics,
  readModularSources,
  serializeModularSource,
  validateEquipmentBom,
  validateModularSources,
  type EquipmentBom,
  type ModularSources,
} from "./modular.js";

const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "capex-modular-preview.json");
export const modularApprovedPayloadPath = path.join(platformRoot, "changelog", "payloads", `${CAPEX_REGISTER_ITERATION_ID}-approved.yaml`);
export const modularIterationManifestPath = path.join(platformRoot, "changes", "iterations", `${CAPEX_REGISTER_ITERATION_ID}.yaml`);
export const modularIterationReceiptPath = path.join(platformRoot, "changelog", "iteration-receipts", `${CAPEX_REGISTER_ITERATION_ID}.yaml`);
export const modularRollbackPayloadRoot = path.join(platformRoot, "changelog", "rollback-payloads", CAPEX_REGISTER_ITERATION_ID);

type Payload = ReturnType<typeof modularPayload>;
type TargetContent = { path: string; content: string };
type BeforeFile = { path: string; existed: boolean; sha256: string | null; backup_path: string | null; rollback_payload_path: string | null };
type ReverseOperation = { type: "restore_file" | "remove_generated_file"; path: string; source: string | null; expected_sha256: string | null };

function absolute(relative: string) { return path.resolve(projectRoot, relative); }
function fileHash(file: string) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null; }
function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
function compositeHash(entries: Array<{ path: string; hash: string | null }>) {
  return sha256(JSON.stringify([...entries].sort((a, b) => a.path.localeCompare(b.path))));
}

function buildPayload() {
  const source = fs.readFileSync(sourceMarkdownPath(), "utf8");
  const register = applyPriceResearchIfPresent(buildRegister(source));
  const registerErrors = validateRegister(register, source);
  if (registerErrors.length) throw new Error(registerErrors.join("\n"));
  const sources = buildModularSources(register);
  const modularErrors = validateModularSources(register, sources);
  if (modularErrors.length) throw new Error(modularErrors.join("\n"));
  const payload = modularPayload(register, sources);
  const serialized = serializeModularSource(payload);
  return { source, register, sources, payload, serialized, hash: sha256(serialized) };
}

function payloadTargets(payload: Payload): TargetContent[] {
  const register = payload.equipment_register;
  const sources: ModularSources = {
    modules: payload.modules,
    module_items: payload.module_items,
    point_formats: payload.point_formats,
    configurations: payload.configurations,
    configuration_overrides: payload.configuration_overrides,
  };
  const bom = buildEquipmentBom("CFG-TEMPLATE-001", register, sources);
  const bomErrors = validateEquipmentBom(bom);
  if (bomErrors.length) throw new Error(bomErrors.join("\n"));
  const configurationDirectory = "docs-platform/working/configurations/CFG-TEMPLATE-001";
  return [
    { path: CAPEX_REGISTER_YAML_PATH, content: serializeRegister(register) },
    { path: CAPEX_REGISTER_CSV_PATH, content: equipmentCsv(register) },
    { path: MODULAR_PATHS.modules, content: serializeModularSource(sources.modules) },
    { path: MODULAR_PATHS.moduleItems, content: serializeModularSource(sources.module_items) },
    { path: MODULAR_PATHS.formats, content: serializeModularSource(sources.point_formats) },
    { path: MODULAR_PATHS.configurations, content: serializeModularSource(sources.configurations) },
    { path: MODULAR_PATHS.overrides, content: serializeModularSource(sources.configuration_overrides) },
    { path: `${configurationDirectory}/equipment-bom.yaml`, content: serializeModularSource(bom) },
    { path: `${configurationDirectory}/equipment-bom.csv`, content: equipmentBomCsv(bom) },
  ];
}

export function writeApprovedModularPayload() {
  const current = buildPayload();
  if (fs.existsSync(modularApprovedPayloadPath)) {
    const existing = fs.readFileSync(modularApprovedPayloadPath, "utf8");
    if (existing !== current.serialized) throw new Error("Approved modular payload already exists with different bytes; start a new governed iteration.");
  } else atomicWrite(modularApprovedPayloadPath, current.serialized);
  const result = {
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    approved_payload_path: path.relative(projectRoot, modularApprovedPayloadPath).replaceAll(path.sep, "/"),
    approved_payload_sha256: current.hash,
    statistics: modularStatistics(current.register, current.sources),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function approvedManifest() {
  if (!fs.existsSync(modularIterationManifestPath)) throw new Error("Approved modular iteration manifest is missing.");
  const manifest = YAML.parse(fs.readFileSync(modularIterationManifestPath, "utf8"));
  if (manifest.iteration_id !== CAPEX_REGISTER_ITERATION_ID || manifest.decision_id !== CAPEX_REGISTER_DECISION_ID || manifest.status !== "approved") throw new Error("Modular iteration manifest has wrong IDs or is not approved.");
  return manifest;
}

function computePreview() {
  if (!fs.existsSync(modularApprovedPayloadPath)) throw new Error("Approved modular payload snapshot is missing. Run capex:modular:payload first.");
  const approvedBytes = fs.readFileSync(modularApprovedPayloadPath, "utf8");
  const approvedHash = sha256(approvedBytes);
  const current = buildPayload();
  if (approvedBytes !== current.serialized) throw new Error("Generated modular payload differs from the approved payload snapshot.");
  const manifest = approvedManifest();
  if (manifest.approved_payload_sha256 !== approvedHash) throw new Error("Iteration manifest approved payload hash differs from the snapshot.");
  const targets = payloadTargets(current.payload);
  const before = targets.map(target => ({ path: target.path, hash: fileHash(absolute(target.path)) }));
  const after = targets.map(target => ({ path: target.path, hash: sha256(target.content) }));
  return {
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    approved_payload_path: path.relative(projectRoot, modularApprovedPayloadPath).replaceAll(path.sep, "/"),
    approved_payload_sha256: approvedHash,
    before_composite_hash: compositeHash(before),
    after_composite_hash: compositeHash(after),
    files: after.map((entry, index) => ({ path: entry.path, before_sha256: before[index].hash, after_sha256: entry.hash })),
    statistics: modularStatistics(current.register, current.sources),
    validation: "passed" as const,
    targets,
  };
}

export function previewModularIteration() {
  const preview = computePreview();
  const { targets: _targets, ...safe } = preview;
  writeSecretJson(runtimePreviewPath, safe);
  console.log(JSON.stringify(safe, null, 2));
  return preview;
}

export function applyModularIteration(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== CAPEX_REGISTER_DECISION_ID) throw new Error(`Apply requires --apply --decision ${CAPEX_REGISTER_DECISION_ID}.`);
  const decision = loadRegistry().decisions.find(item => item.id === CAPEX_REGISTER_DECISION_ID);
  if (!decision || decision.status !== "approved") throw new Error(`${CAPEX_REGISTER_DECISION_ID} must be registered and approved before apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Modular preview is missing. Run capex:modular:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8"));
  const preview = computePreview();
  if (saved.approved_payload_sha256 !== preview.approved_payload_sha256 || saved.before_composite_hash !== preview.before_composite_hash || saved.after_composite_hash !== preview.after_composite_hash) throw new Error("Modular payload or target state changed after preview.");
  if (fs.existsSync(modularIterationReceiptPath)) throw new Error("Modular iteration receipt already exists; refusing duplicate apply.");
  const backupRoot = path.join(platformRoot, "changelog", "backups", CAPEX_REGISTER_ITERATION_ID);
  if (fs.existsSync(backupRoot)) throw new Error("Modular iteration backup directory already exists; refusing to overwrite rollback data.");
  if (fs.existsSync(modularRollbackPayloadRoot)) throw new Error("Persistent modular rollback payload already exists; refusing to overwrite rollback data.");
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(modularRollbackPayloadRoot, { recursive: true });
  const beforeFiles: BeforeFile[] = preview.targets.map(target => {
    const targetFile = absolute(target.path);
    const exists = fs.existsSync(targetFile);
    const backup = path.join(backupRoot, target.path.replace(/^docs-platform\//, ""));
    const persistent = path.join(modularRollbackPayloadRoot, target.path.replace(/^docs-platform\//, ""));
    if (exists) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(targetFile, backup);
      atomicWrite(persistent, fs.readFileSync(targetFile, "utf8"));
    }
    return {
      path: target.path,
      existed: exists,
      sha256: fileHash(targetFile),
      backup_path: exists ? path.relative(projectRoot, backup).replaceAll(path.sep, "/") : null,
      rollback_payload_path: exists ? path.relative(projectRoot, persistent).replaceAll(path.sep, "/") : null,
    };
  });
  try {
    for (const target of preview.targets) atomicWrite(absolute(target.path), target.content);
    for (const target of preview.targets) if (fileHash(absolute(target.path)) !== sha256(target.content)) throw new Error(`Write verification failed for ${target.path}.`);
    const writtenRegister = YAML.parse(fs.readFileSync(absolute(CAPEX_REGISTER_YAML_PATH), "utf8"));
    const writtenSources = readModularSources();
    const errors = [...validateRegister(writtenRegister, fs.readFileSync(sourceMarkdownPath(), "utf8")), ...validateModularSources(writtenRegister, writtenSources)];
    const bom = YAML.parse(fs.readFileSync(absolute("docs-platform/working/configurations/CFG-TEMPLATE-001/equipment-bom.yaml"), "utf8")) as EquipmentBom;
    errors.push(...validateEquipmentBom(bom));
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (error) {
    for (const before of beforeFiles) {
      const target = absolute(before.path);
      if (before.existed && before.backup_path) fs.copyFileSync(absolute(before.backup_path), target);
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmSync(modularRollbackPayloadRoot, { recursive: true, force: true });
    throw error;
  }
  const appliedAt = new Date().toISOString();
  const afterFiles = preview.targets.map(target => ({ path: target.path, sha256: fileHash(absolute(target.path)) }));
  const receipt = {
    receipt_version: 1,
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    change_set_id: approvedManifest().change_set_id,
    status: "applied",
    applied_at: appliedAt,
    actor: "Codex",
    tool: "docs-platform capex:modular:apply",
    approved_payload: { path: path.relative(projectRoot, modularApprovedPayloadPath).replaceAll(path.sep, "/"), sha256: preview.approved_payload_sha256 },
    before_composite_hash: preview.before_composite_hash,
    after_composite_hash: preview.after_composite_hash,
    before_files: beforeFiles,
    after_files: afterFiles,
    statistics: preview.statistics,
    validation_result: "passed",
    git_commit_hash: null,
    rollback: {
      mode: "governed_reverse_change_set",
      source_receipt: path.relative(projectRoot, modularIterationReceiptPath).replaceAll(path.sep, "/"),
      preview_command: `npm run capex:modular:reverse:preview -- ../changelog/iteration-receipts/${CAPEX_REGISTER_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`,
      preserves_history: true,
      git_reset_forbidden: true,
    },
  };
  writeYaml(modularIterationReceiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function materializeModularRollbackPayload(receiptFile = modularIterationReceiptPath) {
  const receiptPath = path.resolve(receiptFile);
  const receipt = YAML.parse(fs.readFileSync(receiptPath, "utf8"));
  if (receipt.iteration_id !== CAPEX_REGISTER_ITERATION_ID || !Array.isArray(receipt.before_files)) throw new Error("Invalid modular iteration receipt.");
  fs.mkdirSync(modularRollbackPayloadRoot, { recursive: true });
  const beforeFiles: BeforeFile[] = receipt.before_files.map((entry: BeforeFile) => {
    if (!entry.existed) return { ...entry, rollback_payload_path: null };
    if (!entry.backup_path || !fs.existsSync(absolute(entry.backup_path))) throw new Error(`Ephemeral backup is missing for ${entry.path}; persistent rollback payload cannot be materialized.`);
    const persistent = path.join(modularRollbackPayloadRoot, entry.path.replace(/^docs-platform\//, ""));
    const bytes = fs.readFileSync(absolute(entry.backup_path));
    if (sha256(bytes) !== entry.sha256) throw new Error(`Backup hash differs for ${entry.path}.`);
    if (fs.existsSync(persistent) && sha256(fs.readFileSync(persistent)) !== entry.sha256) throw new Error(`Persistent rollback payload differs for ${entry.path}.`);
    if (!fs.existsSync(persistent)) atomicWrite(persistent, bytes.toString("utf8"));
    return { ...entry, rollback_payload_path: path.relative(projectRoot, persistent).replaceAll(path.sep, "/") };
  });
  writeYaml(receiptPath, { ...receipt, before_files: beforeFiles });
  const result = { receipt: path.relative(projectRoot, receiptPath).replaceAll(path.sep, "/"), persistent_rollback_files: beforeFiles.filter(entry => entry.existed).map(entry => entry.rollback_payload_path), validation: "passed" };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function validateConfigurations() {
  const register = YAML.parse(fs.readFileSync(absolute(CAPEX_REGISTER_YAML_PATH), "utf8"));
  const sources = readModularSources();
  const errors = validateModularSources(register, sources);
  for (const configuration of sources.configurations.configurations) errors.push(...validateEquipmentBom(buildEquipmentBom(configuration.configuration_id, register, sources)));
  if (errors.length) throw new Error(errors.join("\n"));
  const result = { validation: "OK", ...modularStatistics(register, sources) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function listModules() {
  const sources = readModularSources();
  for (const item of sources.modules.modules) console.log(`${item.module_id}\t${item.lifecycle_status}\t${item.name}`);
}

export function listFormats() {
  const sources = readModularSources();
  for (const item of sources.point_formats.formats) console.log(`${item.format_id}\t${item.lifecycle_status}\t${item.name}`);
}

function configurationTarget(configurationId: string) {
  const directory = path.join(platformRoot, "working", "configurations", configurationId);
  return { yaml: path.join(directory, "equipment-bom.yaml"), csv: path.join(directory, "equipment-bom.csv") };
}

export function previewConfiguration(configurationId: string) {
  const bom = buildEquipmentBom(configurationId);
  const errors = validateEquipmentBom(bom);
  if (errors.length) throw new Error(errors.join("\n"));
  const result = {
    configuration_id: configurationId,
    format_id: bom.document.format_id,
    active_modules: bom.active_modules,
    equipment_record_count: bom.equipment.length,
    unresolved_quantity_count: bom.equipment.filter(item => item.calculated_quantity === null).length,
    yaml_sha256: sha256(serializeModularSource(bom)),
    csv_sha256: sha256(equipmentBomCsv(bom)),
    writes: false,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function buildConfiguration(configurationId: string) {
  const preview = previewConfiguration(configurationId);
  const bom = buildEquipmentBom(configurationId);
  const target = configurationTarget(configurationId);
  atomicWrite(target.yaml, serializeModularSource(bom));
  atomicWrite(target.csv, equipmentBomCsv(bom));
  const result = { ...preview, writes: true, yaml_path: path.relative(projectRoot, target.yaml).replaceAll(path.sep, "/"), csv_path: path.relative(projectRoot, target.csv).replaceAll(path.sep, "/") };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

export function previewModularReverse(receiptFile: string, changeId: string, decisionId: string) {
  const receipt = YAML.parse(fs.readFileSync(path.resolve(receiptFile), "utf8"));
  if (!receipt?.iteration_id || !Array.isArray(receipt.before_files) || !Array.isArray(receipt.after_files)) throw new Error("Invalid modular iteration receipt.");
  if (!changeId || !decisionId) throw new Error("Reverse preview requires --change-id and --decision.");
  const current = receipt.after_files.map((entry: { path: string }) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
  const simulatedBefore = receipt.before_files.map((entry: { path: string; sha256: string | null }) => ({ path: entry.path, hash: entry.sha256 }));
  const operations: ReverseOperation[] = receipt.before_files.map((entry: BeforeFile) => {
    const source = entry.existed ? entry.rollback_payload_path : null;
    if (entry.existed && (!source || !fs.existsSync(absolute(source)))) throw new Error(`Tracked rollback payload is missing for ${entry.path}.`);
    if (entry.existed && fileHash(absolute(source!)) !== entry.sha256) throw new Error(`Tracked rollback payload hash differs for ${entry.path}.`);
    return { type: entry.existed ? "restore_file" : "remove_generated_file", path: entry.path, source, expected_sha256: entry.sha256 };
  });
  return {
    reverse_change_set: {
      change_id: changeId,
      title: `Откат ${receipt.change_set_id} через governed reverse change set`,
      status: "proposed",
      created_at: new Date().toISOString().slice(0, 10),
      decision_id: decisionId,
      iteration_id: `${receipt.iteration_id}-ROLLBACK`,
      proposal_id: `PROP-${changeId}`,
      rollback_of: receipt.change_set_id,
      source_receipt: path.relative(projectRoot, path.resolve(receiptFile)).replaceAll(path.sep, "/"),
      expected_current_hash: receipt.after_composite_hash,
      expected_restored_hash: receipt.before_composite_hash,
      operations,
    },
    expected_current_hash: receipt.after_composite_hash,
    current_hash: compositeHash(current),
    expected_restored_hash: receipt.before_composite_hash,
    simulated_restored_hash: compositeHash(simulatedBefore),
    restores_original_hash: compositeHash(simulatedBefore) === receipt.before_composite_hash,
    apply_allowed: false,
    instruction: "Create and register an approved rollback decision, prepare a new governed reverse change set, preview Google reversal separately, apply, validate, verify and append rolled_back without editing historical events.",
  };
}

export function prepareModularReverse(receiptFile: string, changeId: string, decisionId: string) {
  const preview = previewModularReverse(receiptFile, changeId, decisionId);
  const destination = path.join(platformRoot, "changes", "rollback", `${changeId}.yaml`);
  if (fs.existsSync(destination)) throw new Error(`Reverse change set already exists: ${path.relative(projectRoot, destination)}`);
  writeYaml(destination, preview.reverse_change_set);
  const result = { ...preview, destination: path.relative(projectRoot, destination).replaceAll(path.sep, "/") };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}

export function applyModularReverse(changeFile: string, options: { apply: boolean; decisionId: string }) {
  const changePath = path.resolve(changeFile);
  const change = YAML.parse(fs.readFileSync(changePath, "utf8"));
  if (!options.apply || !options.decisionId || change.decision_id !== options.decisionId) throw new Error("Reverse apply requires --apply and the exact rollback decision ID.");
  if (change.status !== "approved") throw new Error("Modular reverse change set must be approved before apply.");
  const decision = loadRegistry().decisions.find(item => item.id === options.decisionId);
  if (!decision || decision.status !== "approved") throw new Error("Rollback decision must exist in registry with status approved.");
  const sourceReceipt = absolute(change.source_receipt);
  const expected = previewModularReverse(sourceReceipt, change.change_id, change.decision_id).reverse_change_set;
  const { status: _changeStatus, created_at: _changeCreatedAt, ...changeCritical } = change;
  const { status: _expectedStatus, created_at: _expectedCreatedAt, ...expectedCritical } = expected;
  if (JSON.stringify(changeCritical) !== JSON.stringify(expectedCritical)) throw new Error("Approved reverse change set differs from the generated reverse preview.");
  const receipt = YAML.parse(fs.readFileSync(sourceReceipt, "utf8"));
  const current = receipt.after_files.map((entry: { path: string }) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
  if (compositeHash(current) !== change.expected_current_hash) throw new Error("Current modular files differ from the expected post-apply hash.");
  const rollbackBackup = path.join(platformRoot, "changelog", "backups", change.change_id);
  if (fs.existsSync(rollbackBackup)) throw new Error("Rollback safety backup already exists; refusing to overwrite it.");
  fs.mkdirSync(rollbackBackup, { recursive: true });
  for (const operation of change.operations as ReverseOperation[]) {
    const target = absolute(operation.path);
    if (fs.existsSync(target)) {
      const safety = path.join(rollbackBackup, operation.path.replace(/^docs-platform\//, ""));
      fs.mkdirSync(path.dirname(safety), { recursive: true });
      fs.copyFileSync(target, safety);
    }
  }
  try {
    for (const operation of change.operations as ReverseOperation[]) {
      const target = absolute(operation.path);
      if (operation.type === "restore_file") {
        if (!operation.source) throw new Error(`Rollback source is missing for ${operation.path}.`);
        atomicWrite(target, fs.readFileSync(absolute(operation.source), "utf8"));
      } else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    const restored = receipt.before_files.map((entry: BeforeFile) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
    if (compositeHash(restored) !== change.expected_restored_hash) throw new Error("Reverse apply did not restore the approved before hash.");
    const register = YAML.parse(fs.readFileSync(absolute(CAPEX_REGISTER_YAML_PATH), "utf8"));
    const errors = validateRegister(register, fs.readFileSync(sourceMarkdownPath(), "utf8"));
    if (errors.length) throw new Error(errors.join("\n"));
    if (fileHash(absolute(CAPEX_REGISTER_CSV_PATH)) !== sha256(equipmentCsv(register))) throw new Error("Restored register CSV differs from deterministic YAML projection.");
  } catch (error) {
    for (const operation of change.operations as ReverseOperation[]) {
      const target = absolute(operation.path);
      const safety = path.join(rollbackBackup, operation.path.replace(/^docs-platform\//, ""));
      if (fs.existsSync(safety)) atomicWrite(target, fs.readFileSync(safety, "utf8"));
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    throw error;
  }
  const rollbackReceiptPath = path.join(platformRoot, "changelog", "rollback-receipts", `${change.change_id}.yaml`);
  const rollbackReceipt = {
    receipt_version: 1,
    change_id: change.change_id,
    decision_id: change.decision_id,
    rollback_of: change.rollback_of,
    source_receipt: change.source_receipt,
    status: "rolled_back",
    applied_at: new Date().toISOString(),
    before_hash: change.expected_current_hash,
    after_hash: change.expected_restored_hash,
    validation_result: "passed",
    google_reverse_status: "requires_separate_guarded_preview_and_apply",
    timeline_status: "requires_append_only_rolled_back_event",
    git_commit_hash: null,
  };
  writeYaml(rollbackReceiptPath, rollbackReceipt);
  console.log(JSON.stringify({ ...rollbackReceipt, receipt: path.relative(projectRoot, rollbackReceiptPath).replaceAll(path.sep, "/") }, null, 2));
  return rollbackReceipt;
}
