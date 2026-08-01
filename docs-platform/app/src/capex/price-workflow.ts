import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import { equipmentCsv, readRegister, serializeRegister, sha256, validateRegister, type CapexRegister } from "./register.js";
import {
  CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
  CAPEX_PRICE_BRIEF_SOURCE_ID,
  CAPEX_PRICE_CHANGE_ID,
  CAPEX_PRICE_CHECKED_AT,
  CAPEX_PRICE_DATE,
  CAPEX_PRICE_DECISION_CHANGE_ID,
  CAPEX_PRICE_DECISION_ID,
  CAPEX_PRICE_DOCUMENT_ID,
  CAPEX_PRICE_ITERATION_ID,
  CAPEX_PRICE_PROPOSAL_ID,
  CAPEX_PRICE_RESEARCH_PATH,
  applyPriceResearch,
  pricePayload,
  serializePriceResearch,
  validatePriceResearch,
  type CapexPriceResearch,
} from "./price-research.js";

const projectRoot = path.resolve(platformRoot, "..");
const approvedPayloadFile = path.resolve(projectRoot, CAPEX_PRICE_APPROVED_PAYLOAD_PATH);
const proposalFile = path.join(platformRoot, "changes", "proposals", `${CAPEX_PRICE_PROPOSAL_ID}.yaml`);
const iterationManifestFile = path.join(platformRoot, "changes", "iterations", `${CAPEX_PRICE_ITERATION_ID}.yaml`);
const decisionChangeFile = path.join(platformRoot, "changes", `${CAPEX_PRICE_DECISION_CHANGE_ID}-capex-price-research-decision.yaml`);
const mainChangeFile = path.join(platformRoot, "changes", `${CAPEX_PRICE_CHANGE_ID}-capex-price-research.yaml`);
const runtimePreviewPath = path.join(platformRoot, ".runtime", "capex-price-preview.json");
export const priceIterationReceiptPath = path.join(platformRoot, "changelog", "iteration-receipts", `${CAPEX_PRICE_ITERATION_ID}.yaml`);
const rollbackPayloadRoot = path.join(platformRoot, "changelog", "rollback-payloads", CAPEX_PRICE_ITERATION_ID);

type Target = { path: string; content: string };
type BeforeFile = { path: string; existed: boolean; sha256: string | null; rollback_payload_path: string | null };

function relative(file: string) { return path.relative(projectRoot, file).replaceAll(path.sep, "/"); }
function absolute(relativePath: string) {
  const result = path.resolve(projectRoot, relativePath);
  if (!result.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Path outside project: ${relativePath}.`);
  return result;
}
function fileHash(file: string) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null; }
function composite(entries: Array<{ path: string; hash: string | null }>) { return sha256(JSON.stringify(entries)); }
function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
function writeOnceOrSame(file: string, content: string) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== content) {
    const decisionRegistered = loadRegistry().decisions.some(item => item.id === CAPEX_PRICE_DECISION_ID);
    const receiptExists = fs.existsSync(path.join(platformRoot, "changelog", "change-receipts", `${CAPEX_PRICE_DECISION_CHANGE_ID}.yaml`));
    if (decisionRegistered || receiptExists) throw new Error(`Governed artifact already exists with different content: ${relative(file)}.`);
    atomicWrite(file, content);
    return;
  }
  if (!fs.existsSync(file)) atomicWrite(file, content);
}

function serializePayload(payload: ReturnType<typeof pricePayload>) { return YAML.stringify(payload, { lineWidth: 0 }); }

function proposalYaml() {
  return YAML.stringify({
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    status: "proposed",
    created_at: CAPEX_PRICE_DATE,
    actor: "project owner",
    source_id: CAPEX_PRICE_BRIEF_SOURCE_ID,
    scope: "Добавить первичную research-оценку публичных цен только для самостоятельных закупочных позиций пищевой части существующего CAPEX Equipment Register при ориентире 5 точек × 100 чеков/день.",
    affected_document_ids: ["DOC-CAPEX-EQUIPMENT-REGISTER", CAPEX_PRICE_DOCUMENT_ID],
    affected_item_count: 47,
    approved_payload_path: CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
    approved_payload_sha256: sha256(fs.readFileSync(approvedPayloadFile)),
    source_path: `User instruction, ${CAPEX_PRICE_DATE}`,
    source_sha256: null,
    boundaries: {
      approved: [
        "research price scenarios MINIMUM, BASE and SCALE_READY for existing independent food-side procurement records",
        "source-card metadata and current link checks",
        "deterministic update of the existing registered Google Sheet",
      ],
      not_approved: [
        "final models, suppliers, quantities or commercial offers",
        "final CAPEX or financial model",
        "CAPEX-05, guest hall, repair, engineering installation, fire safety, working capital, raw materials or launch consumables",
      ],
    },
    apply_contract: {
      payload_identity: "structurally_identical_yaml",
      hash_algorithm: "SHA-256",
      google_target: "existing registered Sheet only",
      rollback_mode: "governed_reverse_change_set",
    },
  }, { lineWidth: 0 });
}

function decisionChange() {
  return {
    change_id: CAPEX_PRICE_DECISION_CHANGE_ID,
    title: "Зафиксировать решение о первичной research-оценке CAPEX",
    status: "approved",
    created_at: CAPEX_PRICE_DATE,
    decision_id: "DEC-001",
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    operations: [
      {
        type: "add", entity: "sources", value: {
          id: CAPEX_PRICE_BRIEF_SOURCE_ID,
          title: "Задание на первичную ценовую оценку пищевого CAPEX",
          type: "instruction",
          location: `User instruction, ${CAPEX_PRICE_DATE}`,
          publisher: "project owner",
          publication_date: CAPEX_PRICE_DATE,
          accessed_at: CAPEX_PRICE_DATE,
          reliability: "primary",
          notes: "Первичный источник разрешения провести research-оценку публичных цен только для существующих самостоятельных закупочных позиций пищевой части. Не утверждает модели, поставщиков, окончательные количества, коммерческие предложения или итоговый CAPEX.",
        },
      },
      {
        type: "add", entity: "decisions", value: {
          id: CAPEX_PRICE_DECISION_ID,
          title: "Добавить первичную research-оценку цен пищевого CAPEX",
          status: "approved",
          decision: "Добавить к существующему CAPEX Equipment Register первичную research-оценку публичных цен для самостоятельных закупочных позиций MOD-PREP, MOD-RETAIL-HOT, MOD-BAR, MOD-GROW, MOD-POS и MOD-KDS; сформировать MINIMUM, BASE и SCALE_READY и обновить только существующую Google Sheet.",
          rationale: "Прямое утверждение владельца проекта от 2026-08-02. Цены являются ориентирами публичных карточек, а не утверждёнными моделями, поставщиками, количествами, КП или итоговым CAPEX. CAPEX-05 и все прямо исключённые категории не затрагиваются.",
          affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER"],
          approved_by: "project owner",
          approved_at: CAPEX_PRICE_DATE,
          supersedes: null,
          source_ids: [CAPEX_PRICE_BRIEF_SOURCE_ID],
          updated_at: CAPEX_PRICE_DATE,
        },
      },
    ],
  };
}

function mainChange(payload: ReturnType<typeof pricePayload>, payloadHash: string) {
  const sourceOperations = payload.source_registry_entries.map(value => ({ type: "add", entity: "sources", value }));
  return {
    change_id: CAPEX_PRICE_CHANGE_ID,
    title: "Зарегистрировать первичную research-оценку цен пищевого CAPEX",
    status: "approved",
    created_at: CAPEX_PRICE_DATE,
    decision_id: CAPEX_PRICE_DECISION_ID,
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    approved_payload_path: CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    operations: [
      ...sourceOperations,
      {
        type: "add", entity: "documents", value: {
          id: CAPEX_PRICE_DOCUMENT_ID,
          title: "CAPEX Preliminary Price Research",
          type: "working_capex_price_research",
          status: "research",
          google_file_id: null,
          template: null,
          sections: ["Scope", "MINIMUM", "BASE", "SCALE_READY", "Sources", "Risks", "Summary"],
          version: "0.1",
          local_path: CAPEX_PRICE_RESEARCH_PATH,
          updated_at: CAPEX_PRICE_DATE,
        },
      },
      {
        type: "add", entity: "dependencies", value: {
          id: "DEP-CAPEX-EQUIPMENT-REGISTER-PRICE-RESEARCH",
          source_document_id: "DOC-CAPEX-EQUIPMENT-REGISTER",
          priority: "governing_source",
          status: "approved",
          version: "0.1",
          target_documents: [{ title: "CAPEX Preliminary Price Research", document_id: CAPEX_PRICE_DOCUMENT_ID }],
          updated_at: CAPEX_PRICE_DATE,
        },
      },
      { type: "update", entity: "documents", id: "DOC-CAPEX-EQUIPMENT-REGISTER", value: { updated_at: CAPEX_PRICE_DATE } },
      { type: "update", entity: "decisions", id: CAPEX_PRICE_DECISION_ID, value: { affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER", CAPEX_PRICE_DOCUMENT_ID], updated_at: CAPEX_PRICE_DATE } },
    ],
  };
}

export function writeApprovedPriceArtifacts() {
  const register = readRegister();
  if (register.document.decision_id === CAPEX_PRICE_DECISION_ID) throw new Error("Price research is already applied to the Equipment Register.");
  const payload = pricePayload(register);
  const serialized = serializePayload(payload);
  const payloadHash = sha256(serialized);
  writeOnceOrSame(approvedPayloadFile, serialized);
  writeOnceOrSame(proposalFile, proposalYaml());
  writeOnceOrSame(decisionChangeFile, YAML.stringify(decisionChange(), { lineWidth: 0 }));
  writeOnceOrSame(mainChangeFile, YAML.stringify(mainChange(payload, payloadHash), { lineWidth: 0 }));
  const manifest = {
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    decision_id: CAPEX_PRICE_DECISION_ID,
    change_set_id: CAPEX_PRICE_CHANGE_ID,
    status: "approved",
    approved_by: "project owner",
    approved_at: CAPEX_PRICE_DATE,
    approved_payload_path: CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    approved_scope: payload.approved_scope,
    rollback_mode: "governed_reverse_change_set",
  };
  writeOnceOrSame(iterationManifestFile, YAML.stringify(manifest, { lineWidth: 0 }));
  const result = {
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    decision_id: CAPEX_PRICE_DECISION_ID,
    change_set_id: CAPEX_PRICE_CHANGE_ID,
    approved_payload_path: CAPEX_PRICE_APPROVED_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    priced_record_count: payload.price_research.summary.priced_record_count,
    unpriced_record_count: payload.price_research.summary.unpriced_record_count,
    source_registry_entry_count: payload.source_registry_entries.length,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function loadApprovedPayload() {
  if (!fs.existsSync(approvedPayloadFile)) throw new Error("Approved price payload is missing. Run capex:price:artifacts first.");
  const bytes = fs.readFileSync(approvedPayloadFile, "utf8");
  const payload = YAML.parse(bytes) as ReturnType<typeof pricePayload>;
  const manifest = YAML.parse(fs.readFileSync(iterationManifestFile, "utf8"));
  const hash = sha256(bytes);
  if (payload.iteration_id !== CAPEX_PRICE_ITERATION_ID || payload.decision_id !== CAPEX_PRICE_DECISION_ID || payload.status !== "approved") throw new Error("Approved price payload has invalid lifecycle metadata.");
  if (manifest.approved_payload_sha256 !== hash || manifest.status !== "approved") throw new Error("Price iteration manifest differs from approved payload hash/status.");
  return { payload, hash };
}

function targetsFromPayload(payload: ReturnType<typeof pricePayload>): Target[] {
  return [
    { path: CAPEX_PRICE_RESEARCH_PATH, content: serializePriceResearch(payload.price_research) },
    { path: "docs-platform/working/capex-equipment-register.yaml", content: serializeRegister(payload.equipment_register) },
    { path: "docs-platform/working/capex-equipment-register.csv", content: equipmentCsv(payload.equipment_register) },
  ];
}

function computePreview() {
  const { payload, hash } = loadApprovedPayload();
  const current = readRegister();
  if (serializeRegister(current) !== YAML.stringify(YAML.parse(fs.readFileSync(path.resolve(projectRoot, "docs-platform/changelog/rollback-payloads/ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01/working/capex-equipment-register.yaml"), "utf8")), { lineWidth: 0 }) && current.document.decision_id !== "DEC-008") {
    throw new Error("Current register is not the expected pre-price DEC-008 state.");
  }
  if (payload.price_research.document.source_register_before_sha256 !== sha256(serializeRegister(current))) throw new Error("Current Equipment Register hash differs from the approved price payload baseline.");
  const errors = [...validatePriceResearch(payload.price_research, payload.equipment_register), ...validateRegister(payload.equipment_register)];
  if (errors.length) throw new Error(errors.join("\n"));
  const targets = targetsFromPayload(payload);
  const before = targets.map(target => ({ path: target.path, hash: fileHash(absolute(target.path)) }));
  const after = targets.map(target => ({ path: target.path, hash: sha256(target.content) }));
  return {
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    decision_id: CAPEX_PRICE_DECISION_ID,
    change_set_id: CAPEX_PRICE_CHANGE_ID,
    approved_payload: { path: CAPEX_PRICE_APPROVED_PAYLOAD_PATH, sha256: hash },
    before_composite_hash: composite(before),
    after_composite_hash: composite(after),
    files: after.map((entry, index) => ({ path: entry.path, before_sha256: before[index].hash, after_sha256: entry.hash })),
    summary: payload.price_research.summary,
    validation: "passed" as const,
    writes: false,
    targets,
  };
}

export function previewPriceIteration() {
  const preview = computePreview();
  const { targets: _targets, ...safe } = preview;
  writeSecretJson(runtimePreviewPath, safe);
  console.log(JSON.stringify(safe, null, 2));
  return preview;
}

export function applyPriceIteration(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== CAPEX_PRICE_DECISION_ID) throw new Error(`Apply requires --apply --decision ${CAPEX_PRICE_DECISION_ID}.`);
  const registry = loadRegistry();
  if (!registry.decisions.some(item => item.id === CAPEX_PRICE_DECISION_ID && item.status === "approved")) throw new Error(`${CAPEX_PRICE_DECISION_ID} is not registered as approved.`);
  if (!registry.documents.some(item => item.id === CAPEX_PRICE_DOCUMENT_ID && item.status === "research")) throw new Error(`${CAPEX_PRICE_CHANGE_ID} registry change must be applied before price payload apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Price preview is missing. Run capex:price:preview first.");
  if (fs.existsSync(priceIterationReceiptPath)) throw new Error("Price iteration receipt already exists; refusing duplicate apply.");
  if (fs.existsSync(rollbackPayloadRoot)) throw new Error("Price rollback payload directory already exists; refusing overwrite.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8"));
  const preview = computePreview();
  if (saved.approved_payload.sha256 !== preview.approved_payload.sha256 || saved.before_composite_hash !== preview.before_composite_hash || saved.after_composite_hash !== preview.after_composite_hash) throw new Error("Price payload or target state changed after preview.");
  fs.mkdirSync(rollbackPayloadRoot, { recursive: true });
  const beforeFiles: BeforeFile[] = preview.targets.map(target => {
    const file = absolute(target.path);
    const existed = fs.existsSync(file);
    const rollbackFile = path.join(rollbackPayloadRoot, target.path.replace(/^docs-platform\//, ""));
    if (existed) atomicWrite(rollbackFile, fs.readFileSync(file, "utf8"));
    return { path: target.path, existed, sha256: fileHash(file), rollback_payload_path: existed ? relative(rollbackFile) : null };
  });
  try {
    for (const target of preview.targets) atomicWrite(absolute(target.path), target.content);
    const writtenRegister = readRegister();
    const writtenResearch = YAML.parse(fs.readFileSync(absolute(CAPEX_PRICE_RESEARCH_PATH), "utf8")) as CapexPriceResearch;
    const errors = [...validatePriceResearch(writtenResearch, writtenRegister), ...validateRegister(writtenRegister)];
    if (errors.length) throw new Error(errors.join("\n"));
    if (fs.readFileSync(absolute("docs-platform/working/capex-equipment-register.csv"), "utf8") !== equipmentCsv(writtenRegister)) throw new Error("Generated price register CSV differs from YAML projection.");
  } catch (error) {
    for (const before of beforeFiles) {
      const target = absolute(before.path);
      if (before.existed && before.rollback_payload_path) atomicWrite(target, fs.readFileSync(absolute(before.rollback_payload_path), "utf8"));
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmSync(rollbackPayloadRoot, { recursive: true, force: true });
    throw error;
  }
  const appliedAt = new Date().toISOString();
  const afterFiles = preview.targets.map(target => ({ path: target.path, sha256: fileHash(absolute(target.path)) }));
  const receipt = {
    receipt_version: 1,
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    decision_id: CAPEX_PRICE_DECISION_ID,
    change_set_id: CAPEX_PRICE_CHANGE_ID,
    status: "applied",
    applied_at: appliedAt,
    actor: "Codex",
    tool: "docs-platform capex:price:apply",
    approved_payload: preview.approved_payload,
    before_composite_hash: preview.before_composite_hash,
    after_composite_hash: preview.after_composite_hash,
    before_files: beforeFiles,
    after_files: afterFiles,
    summary: preview.summary,
    validation_result: "passed",
    git_commit_hash: null,
    rollback: {
      mode: "governed_reverse_change_set",
      source_receipt: relative(priceIterationReceiptPath),
      preview_command: `npm run capex:price:reverse:preview -- ../changelog/iteration-receipts/${CAPEX_PRICE_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`,
      preserves_history: true,
      git_reset_forbidden: true,
    },
  };
  writeYaml(priceIterationReceiptPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function previewPriceReverse(receiptFile = priceIterationReceiptPath, changeId = "CHG-ROLLBACK-XXX", decisionId = "DEC-ROLLBACK-XXX") {
  const receipt = YAML.parse(fs.readFileSync(path.resolve(receiptFile), "utf8"));
  if (receipt.iteration_id !== CAPEX_PRICE_ITERATION_ID || !Array.isArray(receipt.before_files) || !Array.isArray(receipt.after_files)) throw new Error("Invalid price iteration receipt.");
  const current = receipt.after_files.map((entry: { path: string }) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
  const restored = receipt.before_files.map((entry: BeforeFile) => ({ path: entry.path, hash: entry.sha256 }));
  const operations = [...receipt.before_files].reverse().map((entry: BeforeFile) => ({
    type: entry.existed ? "restore_file" : "remove_generated_file",
    path: entry.path,
    source: entry.rollback_payload_path,
    expected_sha256: entry.sha256,
  }));
  const result = {
    reverse_change_set: {
      change_id: changeId,
      title: `Откат ${CAPEX_PRICE_CHANGE_ID} через governed reverse change set`,
      status: "proposed",
      created_at: new Date().toISOString().slice(0, 10),
      decision_id: decisionId,
      iteration_id: `${CAPEX_PRICE_ITERATION_ID}-ROLLBACK`,
      proposal_id: `PROP-${changeId}`,
      rollback_of: CAPEX_PRICE_CHANGE_ID,
      source_receipt: relative(path.resolve(receiptFile)),
      expected_current_hash: receipt.after_composite_hash,
      expected_restored_hash: receipt.before_composite_hash,
      operations,
    },
    expected_current_hash: receipt.after_composite_hash,
    current_hash: composite(current),
    expected_restored_hash: receipt.before_composite_hash,
    simulated_restored_hash: composite(restored),
    restores_original_hash: composite(restored) === receipt.before_composite_hash,
    apply_allowed: false,
    instruction: "Create and approve a rollback decision, save this reverse change set, preview Google reversal separately, apply, validate and append rolled_back; historical events remain append-only.",
  };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}
