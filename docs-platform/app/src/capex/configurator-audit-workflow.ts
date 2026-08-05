import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { appendTimelineEvent, effectiveRecordedAt, generateTimeline, readTimelineEvents, type IterationStatus, type TimelineEventInput } from "../governance/timeline.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import { readModularSources, validateModularSources, type ModularSources } from "./modular.js";
import { equipmentCsv, readRegister, serializeRegister, sha256, validateRegister, type CapexRegister } from "./register.js";
import {
  readPriceResearch,
  recalculatePriceSummary,
  serializePriceResearch,
  validatePriceResearch,
  type CapexPriceResearch,
} from "./price-research.js";

export const CAPEX_CONFIGURATOR_ITERATION_ID = "ITR-CAPEX-WEB-CONFIGURATOR-2026-08-03-01";
export const CAPEX_CONFIGURATOR_PROPOSAL_ID = "PROP-CAPEX-WEB-CONFIGURATOR-2026-08-03-01";
export const CAPEX_CONFIGURATOR_DECISION_ID = "DEC-010";
export const CAPEX_CONFIGURATOR_DECISION_CHANGE_ID = "CHG-017";
export const CAPEX_CONFIGURATOR_CHANGE_ID = "CHG-018";
export const CAPEX_CONFIGURATOR_SOURCE_ID = "SRC-CAPEX-WEB-CONFIGURATOR-AUDIT-BRIEF";
export const CAPEX_CONFIGURATOR_DATE = "2026-08-03";
export const CAPEX_CONFIGURATOR_PAYLOAD_PATH = `docs-platform/changelog/payloads/${CAPEX_CONFIGURATOR_ITERATION_ID}-approved.yaml`;
export const CAPEX_CONFIGURATOR_RECEIPT_PATH = `docs-platform/changelog/iteration-receipts/${CAPEX_CONFIGURATOR_ITERATION_ID}.yaml`;
export const CAPEX_CONFIGURATOR_VERIFICATION_PATH = `docs-platform/changelog/verification/${CAPEX_CONFIGURATOR_ITERATION_ID}.yaml`;
export const CAPEX_CONFIGURATOR_GOOGLE_RECEIPT_PATH = "docs-platform/changelog/google-sync/2026-08-03-DOC-CAPEX-EQUIPMENT-REGISTER-WEB-CONFIGURATOR.yaml";

const projectRoot = path.resolve(platformRoot, "..");
const payloadFile = path.resolve(projectRoot, CAPEX_CONFIGURATOR_PAYLOAD_PATH);
const proposalFile = path.join(platformRoot, "changes", "proposals", `${CAPEX_CONFIGURATOR_PROPOSAL_ID}.yaml`);
const iterationFile = path.join(platformRoot, "changes", "iterations", `${CAPEX_CONFIGURATOR_ITERATION_ID}.yaml`);
const decisionChangeFile = path.join(platformRoot, "changes", `${CAPEX_CONFIGURATOR_DECISION_CHANGE_ID}-capex-web-configurator-decision.yaml`);
const mainChangeFile = path.join(platformRoot, "changes", `${CAPEX_CONFIGURATOR_CHANGE_ID}-capex-web-configurator.yaml`);
const runtimePreviewFile = path.join(platformRoot, ".runtime", "capex-web-configurator-preview.json");
const receiptFile = path.resolve(projectRoot, CAPEX_CONFIGURATOR_RECEIPT_PATH);
const rollbackRoot = path.join(platformRoot, "changelog", "rollback-payloads", CAPEX_CONFIGURATOR_ITERATION_ID);

type Target = { path: string; content: string };
type BeforeFile = { path: string; existed: boolean; sha256: string | null; rollback_payload_path: string | null };

function absolute(relativePath: string) {
  const result = path.resolve(projectRoot, relativePath);
  if (!result.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Path outside project: ${relativePath}.`);
  return result;
}
function relative(file: string) { return path.relative(projectRoot, file).replaceAll(path.sep, "/"); }
function fileHash(file: string) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null; }
function composite(entries: Array<{ path: string; hash: string | null }>) { return sha256(JSON.stringify(entries)); }
function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
function writeOnce(file: string, content: string) {
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") !== content) throw new Error(`Governed artifact already exists with different content: ${relative(file)}.`);
    return;
  }
  atomicWrite(file, content);
}
function moduleItemsYaml(sources: ModularSources) { return YAML.stringify(sources.module_items, { lineWidth: 0 }); }

function correctedState() {
  const register = structuredClone(readRegister()) as CapexRegister;
  const research = structuredClone(readPriceResearch()) as CapexPriceResearch;
  const modular = structuredClone(readModularSources()) as ModularSources;
  const oven = register.equipment.find(item => item.item_id === "CAPEX-01-009");
  const price = research.items.find(item => item.item_id === "CAPEX-01-009");
  const link = modular.module_items.links.find(item => item.module_id === "MOD-PREP" && item.item_id === "CAPEX-01-009");
  if (!oven || !price || !link) throw new Error("CAPEX-01-009 is missing from one or more canonical sources.");
  if (oven.quantity_base !== 2 || link.quantity_rule_type !== "fixed" || link.quantity_rule_value !== 2) {
    throw new Error("Expected the governed pre-correction CAPEX-01-009 quantity of two.");
  }
  for (const scenario of ["minimum", "base", "scale_ready"] as const) {
    if (price.scenarios[scenario]?.quantity !== 2) throw new Error(`Expected CAPEX-01-009.${scenario} quantity of two.`);
  }

  register.document.decision_id = CAPEX_CONFIGURATOR_DECISION_ID;
  register.document.iteration_id = CAPEX_CONFIGURATOR_ITERATION_ID;
  register.document.proposal_id = CAPEX_CONFIGURATOR_PROPOSAL_ID;
  register.document.warning = "Цены и количества остаются research. Для текущей модели MOD-PREP DEC-010 фиксирует один профессиональный пароконвектомат во всех ценовых сценариях; исходная текстовая CAPEX Specification v0.1 сохранена без изменений.";
  oven.name = "Профессиональный пароконвектомат";
  oven.quantity_min = 1;
  oven.quantity_base = 1;
  oven.quantity_scale_ready = 1;
  oven.specification = "полноценные режимы конвекции, пара и комбинированного приготовления; обязательное подключение к водопроводу; подключение к канализации; одна профессиональная единица для текущей модели заготовочного производства";
  oven.notes = "Исходная CAPEX Specification v0.1 содержит две единицы; текущая структурированная модель заменяет это количество решением DEC-010, не переписывая исходный документ.";
  oven.price_notes = "Одна профессиональная единица во всех сценариях по DEC-010; указаны цены одной единицы из существующих источников. Вода, дренаж и монтаж не включены.";

  research.document.version = "0.2";
  research.document.decision_id = CAPEX_CONFIGURATOR_DECISION_ID;
  research.document.iteration_id = CAPEX_CONFIGURATOR_ITERATION_ID;
  research.document.proposal_id = CAPEX_CONFIGURATOR_PROPOSAL_ID;
  research.document.source_register_before_sha256 = sha256(serializeRegister(readRegister()));
  for (const scenario of ["minimum", "base", "scale_ready"] as const) {
    const value = price.scenarios[scenario];
    if (!value) throw new Error(`CAPEX-01-009.${scenario} has no source price.`);
    value.quantity = 1;
    value.quantity_basis = "register";
    value.line_total_rub = value.observed_unit_price_rub;
  }
  price.notes = "Одна профессиональная единица во всех сценариях по DEC-010; вода/дренаж и монтаж не включены. Второй аппарат не добавляется автоматически в SCALE_READY.";
  research.summary = recalculatePriceSummary(research.items);

  modular.module_items.document.decision_id = CAPEX_CONFIGURATOR_DECISION_ID;
  modular.module_items.document.iteration_id = CAPEX_CONFIGURATOR_ITERATION_ID;
  modular.module_items.document.proposal_id = CAPEX_CONFIGURATOR_PROPOSAL_ID;
  link.quantity_rule_type = "fixed";
  link.quantity_rule_value = 1;
  link.aggregation_rule = "once";
  link.notes = "Одна единица для MOD-PREP по DEC-010; второй аппарат требует отдельного будущего решения.";

  const errors = [
    ...validateRegister(register),
    ...validatePriceResearch(research, register),
    ...validateModularSources(register, modular),
  ];
  if (errors.length) throw new Error(errors.join("\n"));
  return { register, research, modular };
}

function payload() {
  const { register, research, modular } = correctedState();
  return {
    schema_version: 1,
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
    status: "approved",
    approved_scope: "Один профессиональный пароконвектомат CAPEX-01-009 для MOD-PREP во всех research-сценариях; пересчёт исследовательских сумм; публикация обновлённых данных и техническое улучшение внутреннего CAPEX-конфигуратора без создания публичной инвесторской версии.",
    boundaries: {
      approved: ["CAPEX-01-009 quantity fixed at one", "research totals recalculated from existing unit-price sources", "existing Google Sheet updated", "working configurator reads a deterministic canonical snapshot"],
      not_approved: ["second combi oven", "new prices or suppliers", "final CAPEX", "financial model", "public investor configurator"],
    },
    correction: {
      item_id: "CAPEX-01-009",
      before_quantity: 2,
      after_quantity: 1,
      quantity_rule_type: "fixed",
      aggregation_rule: "once",
      scenarios: ["minimum", "base", "scale_ready"],
      source_markdown_changed: false,
    },
    equipment_register: register,
    price_research: research,
    module_items: modular.module_items,
    equipment_csv_sha256: sha256(equipmentCsv(register)),
  };
}

function decisionChange() {
  return {
    change_id: CAPEX_CONFIGURATOR_DECISION_CHANGE_ID,
    title: "Зафиксировать решение об одной единице пароконвектомата и рабочем CAPEX-конфигураторе",
    status: "approved",
    created_at: CAPEX_CONFIGURATOR_DATE,
    decision_id: "DEC-001",
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    operations: [
      { type: "add", entity: "sources", value: {
        id: CAPEX_CONFIGURATOR_SOURCE_ID,
        title: "Задание на аудит и улучшение рабочего CAPEX-конфигуратора",
        type: "instruction",
        location: `User instruction, ${CAPEX_CONFIGURATOR_DATE}`,
        publisher: "project owner",
        publication_date: CAPEX_CONFIGURATOR_DATE,
        accessed_at: CAPEX_CONFIGURATOR_DATE,
        reliability: "primary",
        notes: "Утверждает одну единицу CAPEX-01-009, research-пересчёт, обновление существующей Google Sheet и внутреннего рабочего интерфейса. Не утверждает второй аппарат, новые цены, финальный CAPEX или публичную инвесторскую версию.",
      } },
      { type: "add", entity: "decisions", value: {
        id: CAPEX_CONFIGURATOR_DECISION_ID,
        title: "Использовать один пароконвектомат и канонический snapshot в рабочем CAPEX-конфигураторе",
        status: "approved",
        decision: "Для текущей модели MOD-PREP использовать один профессиональный пароконвектомат CAPEX-01-009 во всех сценариях; пересчитать research-оценку по существующим единичным ценам, обновить существующую Google Sheet и подключить внутренний CAPEX-конфигуратор к детерминированному snapshot канонических реестров.",
        rationale: "Прямое утверждение владельца проекта от 2026-08-03. Второй аппарат не включается автоматически в SCALE_READY, а страница остаётся скрытым внутренним research-инструментом без показателей финансовой модели.",
        affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-PRICE-RESEARCH"],
        approved_by: "project owner",
        approved_at: CAPEX_CONFIGURATOR_DATE,
        supersedes: null,
        source_ids: [CAPEX_CONFIGURATOR_SOURCE_ID],
        updated_at: CAPEX_CONFIGURATOR_DATE,
      } },
    ],
  };
}

function mainChange(payloadHash: string) {
  return {
    change_id: CAPEX_CONFIGURATOR_CHANGE_ID,
    title: "Применить коррекцию CAPEX-01-009 и обновить рабочий CAPEX-конфигуратор",
    status: "approved",
    created_at: CAPEX_CONFIGURATOR_DATE,
    decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    approved_payload_path: CAPEX_CONFIGURATOR_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    operations: [
      { type: "update", entity: "documents", id: "DOC-CAPEX-EQUIPMENT-REGISTER", value: { updated_at: CAPEX_CONFIGURATOR_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-MODULES", value: { updated_at: CAPEX_CONFIGURATOR_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-PRICE-RESEARCH", value: { version: "0.2", updated_at: CAPEX_CONFIGURATOR_DATE } },
      { type: "update", entity: "decisions", id: CAPEX_CONFIGURATOR_DECISION_ID, value: { affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-PRICE-RESEARCH"], updated_at: CAPEX_CONFIGURATOR_DATE } },
    ],
  };
}

export function writeConfiguratorAuditArtifacts() {
  const approvedPayload = payload();
  const serialized = YAML.stringify(approvedPayload, { lineWidth: 0 });
  const payloadHash = sha256(serialized);
  writeOnce(payloadFile, serialized);
  writeOnce(proposalFile, YAML.stringify({
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    status: "proposed",
    created_at: CAPEX_CONFIGURATOR_DATE,
    actor: "project owner",
    source_id: CAPEX_CONFIGURATOR_SOURCE_ID,
    scope: approvedPayload.approved_scope,
    affected_document_ids: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-PRICE-RESEARCH"],
    affected_item_ids: ["CAPEX-01-009"],
    approved_payload_path: CAPEX_CONFIGURATOR_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    source_path: `User instruction, ${CAPEX_CONFIGURATOR_DATE}`,
    source_sha256: null,
    boundaries: approvedPayload.boundaries,
    apply_contract: { payload_identity: "structurally_identical_yaml", hash_algorithm: "SHA-256", google_target: "existing registered Sheet only", rollback_mode: "governed_reverse_change_set" },
  }, { lineWidth: 0 }));
  writeOnce(decisionChangeFile, YAML.stringify(decisionChange(), { lineWidth: 0 }));
  writeOnce(mainChangeFile, YAML.stringify(mainChange(payloadHash), { lineWidth: 0 }));
  writeOnce(iterationFile, YAML.stringify({
    schema_version: 1,
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
    change_set_id: CAPEX_CONFIGURATOR_CHANGE_ID,
    status: "approved",
    approved_by: "project owner",
    approved_at: CAPEX_CONFIGURATOR_DATE,
    actor: "project owner",
    scope: approvedPayload.approved_scope,
    approved_payload_path: CAPEX_CONFIGURATOR_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    apply_contract: { payload_identity: "structurally_identical_yaml", canonical_targets: ["docs-platform/working/capex-equipment-register.yaml", "docs-platform/working/capex-equipment-register.csv", "docs-platform/working/capex-price-research.yaml", "docs-platform/working/capex-module-items.yaml"] },
    rollback_contract: { mode: "governed_reverse_change_set", preserves_history: true, git_reset_forbidden: true },
  }, { lineWidth: 0 }));
  const result = { iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID, proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID, decision_id: CAPEX_CONFIGURATOR_DECISION_ID, change_set_id: CAPEX_CONFIGURATOR_CHANGE_ID, approved_payload_path: CAPEX_CONFIGURATOR_PAYLOAD_PATH, approved_payload_sha256: payloadHash, totals_rub: approvedPayload.price_research.summary.totals_rub };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function loadPayload() {
  if (!fs.existsSync(payloadFile)) throw new Error("Approved configurator payload is missing.");
  const serialized = fs.readFileSync(payloadFile, "utf8");
  const approved = YAML.parse(serialized) as ReturnType<typeof payload>;
  const manifest = YAML.parse(fs.readFileSync(iterationFile, "utf8"));
  const hash = sha256(serialized);
  if (approved.iteration_id !== CAPEX_CONFIGURATOR_ITERATION_ID || approved.decision_id !== CAPEX_CONFIGURATOR_DECISION_ID || approved.status !== "approved") throw new Error("Invalid approved configurator payload metadata.");
  if (manifest.approved_payload_sha256 !== hash || manifest.status !== "approved") throw new Error("Iteration manifest differs from the approved payload.");
  return { approved, hash };
}

function targets(approved: ReturnType<typeof payload>): Target[] {
  return [
    { path: "docs-platform/working/capex-equipment-register.yaml", content: serializeRegister(approved.equipment_register) },
    { path: "docs-platform/working/capex-equipment-register.csv", content: equipmentCsv(approved.equipment_register) },
    { path: "docs-platform/working/capex-price-research.yaml", content: serializePriceResearch(approved.price_research) },
    { path: "docs-platform/working/capex-module-items.yaml", content: YAML.stringify(approved.module_items, { lineWidth: 0 }) },
  ];
}

function computePreview() {
  const { approved, hash } = loadPayload();
  const current = readRegister();
  if (current.document.decision_id !== "DEC-009") throw new Error("Expected the pre-correction DEC-009 register state.");
  const currentResearch = readPriceResearch();
  const currentSources = readModularSources();
  const oven = current.equipment.find(item => item.item_id === "CAPEX-01-009");
  const price = currentResearch.items.find(item => item.item_id === "CAPEX-01-009");
  const link = currentSources.module_items.links.find(item => item.module_id === "MOD-PREP" && item.item_id === "CAPEX-01-009");
  if (oven?.quantity_base !== 2 || link?.quantity_rule_value !== 2 || ["minimum", "base", "scale_ready"].some(scenario => price?.scenarios[scenario as "minimum" | "base" | "scale_ready"]?.quantity !== 2)) throw new Error("Pre-correction CAPEX-01-009 state changed after approval.");
  const targetFiles = targets(approved);
  const before = targetFiles.map(target => ({ path: target.path, hash: fileHash(absolute(target.path)) }));
  const after = targetFiles.map(target => ({ path: target.path, hash: sha256(target.content) }));
  const preview = {
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
    change_set_id: CAPEX_CONFIGURATOR_CHANGE_ID,
    approved_payload: { path: CAPEX_CONFIGURATOR_PAYLOAD_PATH, sha256: hash },
    before_composite_hash: composite(before),
    after_composite_hash: composite(after),
    files: after.map((entry, index) => ({ path: entry.path, before_sha256: before[index].hash, after_sha256: entry.hash })),
    correction: approved.correction,
    totals_before_rub: currentResearch.summary.totals_rub,
    totals_after_rub: approved.price_research.summary.totals_rub,
    validation: "passed" as const,
    writes: false,
    targets: targetFiles,
  };
  return preview;
}

export function previewConfiguratorAudit() {
  const preview = computePreview();
  const { targets: _targets, ...safe } = preview;
  writeSecretJson(runtimePreviewFile, safe);
  console.log(JSON.stringify(safe, null, 2));
  return preview;
}

export function applyConfiguratorAudit(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== CAPEX_CONFIGURATOR_DECISION_ID) throw new Error(`Apply requires --apply --decision ${CAPEX_CONFIGURATOR_DECISION_ID}.`);
  const registry = loadRegistry();
  if (!registry.decisions.some(item => item.id === CAPEX_CONFIGURATOR_DECISION_ID && item.status === "approved")) throw new Error(`${CAPEX_CONFIGURATOR_DECISION_ID} is not approved in registry.`);
  if (!fs.existsSync(runtimePreviewFile)) throw new Error("Configurator preview is missing.");
  if (fs.existsSync(receiptFile) || fs.existsSync(rollbackRoot)) throw new Error("Configurator correction was already applied.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewFile, "utf8"));
  const preview = computePreview();
  if (saved.approved_payload.sha256 !== preview.approved_payload.sha256 || saved.before_composite_hash !== preview.before_composite_hash || saved.after_composite_hash !== preview.after_composite_hash) throw new Error("Approved payload or target state changed after preview.");
  fs.mkdirSync(rollbackRoot, { recursive: true });
  const beforeFiles: BeforeFile[] = preview.targets.map(target => {
    const file = absolute(target.path);
    const existed = fs.existsSync(file);
    const rollbackFile = path.join(rollbackRoot, target.path.replace(/^docs-platform\//, ""));
    if (existed) atomicWrite(rollbackFile, fs.readFileSync(file, "utf8"));
    return { path: target.path, existed, sha256: fileHash(file), rollback_payload_path: existed ? relative(rollbackFile) : null };
  });
  try {
    for (const target of preview.targets) atomicWrite(absolute(target.path), target.content);
    const register = readRegister();
    const research = readPriceResearch();
    const sources = readModularSources();
    const errors = [...validateRegister(register), ...validatePriceResearch(research, register), ...validateModularSources(register, sources)];
    if (errors.length) throw new Error(errors.join("\n"));
    if (fs.readFileSync(absolute("docs-platform/working/capex-equipment-register.csv"), "utf8") !== equipmentCsv(register)) throw new Error("CSV differs from the corrected YAML register.");
  } catch (error) {
    for (const before of beforeFiles) if (before.existed && before.rollback_payload_path) atomicWrite(absolute(before.path), fs.readFileSync(absolute(before.rollback_payload_path), "utf8"));
    fs.rmSync(rollbackRoot, { recursive: true, force: true });
    throw error;
  }
  const afterFiles = preview.targets.map(target => ({ path: target.path, sha256: fileHash(absolute(target.path)) }));
  const receipt = {
    receipt_version: 1,
    iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
    proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
    decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
    change_set_id: CAPEX_CONFIGURATOR_CHANGE_ID,
    status: "applied",
    applied_at: new Date().toISOString(),
    actor: "Codex",
    tool: "docs-platform capex:configurator:apply",
    approved_payload: preview.approved_payload,
    before_composite_hash: preview.before_composite_hash,
    after_composite_hash: preview.after_composite_hash,
    before_files: beforeFiles,
    after_files: afterFiles,
    totals_before_rub: preview.totals_before_rub,
    totals_after_rub: preview.totals_after_rub,
    validation_result: "passed",
    git_commit_hash: null,
    rollback: { mode: "governed_reverse_change_set", source_receipt: CAPEX_CONFIGURATOR_RECEIPT_PATH, preview_command: `npm run capex:configurator:reverse:preview -- ../changelog/iteration-receipts/${CAPEX_CONFIGURATOR_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`, preserves_history: true, git_reset_forbidden: true },
  };
  writeYaml(receiptFile, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function previewConfiguratorReverse(receiptPath = receiptFile, changeId = "CHG-ROLLBACK-XXX", decisionId = "DEC-ROLLBACK-XXX") {
  const receipt = YAML.parse(fs.readFileSync(path.resolve(receiptPath), "utf8"));
  if (receipt.iteration_id !== CAPEX_CONFIGURATOR_ITERATION_ID) throw new Error("Invalid configurator iteration receipt.");
  const current = receipt.after_files.map((entry: { path: string }) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
  const restored = receipt.before_files.map((entry: BeforeFile) => ({ path: entry.path, hash: entry.sha256 }));
  const result = {
    reverse_change_set: {
      change_id: changeId,
      title: `Откат ${CAPEX_CONFIGURATOR_CHANGE_ID} через governed reverse change set`,
      status: "proposed",
      created_at: new Date().toISOString().slice(0, 10),
      decision_id: decisionId,
      iteration_id: `${CAPEX_CONFIGURATOR_ITERATION_ID}-ROLLBACK`,
      proposal_id: `PROP-${changeId}`,
      rollback_of: CAPEX_CONFIGURATOR_CHANGE_ID,
      source_receipt: relative(path.resolve(receiptPath)),
      expected_current_hash: receipt.after_composite_hash,
      expected_restored_hash: receipt.before_composite_hash,
      operations: [...receipt.before_files].reverse().map((entry: BeforeFile) => ({ type: entry.existed ? "restore_file" : "remove_generated_file", path: entry.path, source: entry.rollback_payload_path, expected_sha256: entry.sha256 })),
    },
    current_hash: composite(current),
    expected_current_hash: receipt.after_composite_hash,
    simulated_restored_hash: composite(restored),
    expected_restored_hash: receipt.before_composite_hash,
    restores_original_hash: composite(restored) === receipt.before_composite_hash,
    apply_allowed: false,
    instruction: "Create and approve a rollback decision, preview Google reversal separately, apply, validate and append rolled_back; historical events remain append-only.",
  };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}

export function appendConfiguratorTimeline() {
  const existing = readTimelineEvents();
  if (existing.some(event => event.iteration_id === CAPEX_CONFIGURATOR_ITERATION_ID)) throw new Error("Configurator timeline events already exist.");
  if (!fs.existsSync(receiptFile) || !fs.existsSync(absolute(CAPEX_CONFIGURATOR_VERIFICATION_PATH)) || !fs.existsSync(absolute(CAPEX_CONFIGURATOR_GOOGLE_RECEIPT_PATH))) throw new Error("Apply, verification and Google receipts must exist before timeline finalization.");
  const manifest = YAML.parse(fs.readFileSync(iterationFile, "utf8"));
  const receipt = YAML.parse(fs.readFileSync(receiptFile, "utf8"));
  const google = YAML.parse(fs.readFileSync(absolute(CAPEX_CONFIGURATOR_GOOGLE_RECEIPT_PATH), "utf8"));
  const start = Math.max(Date.now(), Date.parse(existing.at(-1) ? effectiveRecordedAt(existing.at(-1)!) : "1970-01-01T00:00:00.000Z") + 1);
  const statuses: Array<{ status: IterationStatus; action: string; actor: string; tool: string; validation: "pending" | "passed"; summary: string }> = [
    { status: "proposed", action: "proposal_recorded", actor: "project owner", tool: "user instruction / governed workflow", validation: "pending", summary: "Proposal зафиксировал аудит внутреннего конфигуратора, одну единицу CAPEX-01-009 и границы без новых цен, финального CAPEX или публичной инвесторской версии." },
    { status: "approved", action: "decision_approved", actor: "project owner", tool: `approved decision ${CAPEX_CONFIGURATOR_DECISION_ID}`, validation: "pending", summary: "DEC-010 утвердил exact payload SHA-256: один пароконвектомат во всех research-сценариях, пересчёт и детерминированный canonical snapshot." },
    { status: "applied", action: "canonical_correction_google_sheet_and_web_snapshot_applied", actor: "Codex", tool: "capex:configurator:apply / change:apply / capex:sheet:apply / capex:web:sync", validation: "passed", summary: "CAPEX-01-009 приведён к одной единице в Register, module-item rule и Price Research; существующая Sheet обновлена, UI подключён к generated snapshot." },
    { status: "verified", action: "tests_build_google_readback_visual_audit_and_reverse_preview_verified", actor: "Codex", tool: "CAPEX configurator verification workflow", validation: "passed", summary: "Проверены hashes, 151 records, семь форматов, scenario totals, noindex, Google readback, адаптивный интерфейс, timeline chain и governed reverse preview." },
  ];
  const events = statuses.map((entry, index) => {
    const input: TimelineEventInput = {
      event_id: `EVT-${CAPEX_CONFIGURATOR_ITERATION_ID}-${String(index + 1).padStart(3, "0")}`,
      iteration_id: CAPEX_CONFIGURATOR_ITERATION_ID,
      proposal_id: CAPEX_CONFIGURATOR_PROPOSAL_ID,
      decision_id: CAPEX_CONFIGURATOR_DECISION_ID,
      change_set_id: CAPEX_CONFIGURATOR_CHANGE_ID,
      timestamp: new Date(start + index).toISOString(),
      actor: entry.actor,
      tool: entry.tool,
      lifecycle_status: entry.status,
      action: entry.action,
      scope: manifest.scope,
      affected_document_ids: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-PRICE-RESEARCH"],
      affected_section_or_item_ids: ["CAPEX-01-009", "MOD-PREP", "/capex-configurator"],
      approved_payload: { path: CAPEX_CONFIGURATOR_PAYLOAD_PATH, sha256: manifest.approved_payload_sha256 },
      before_hash: index === 0 ? null : receipt.before_composite_hash,
      after_hash: index === 0 ? null : receipt.after_composite_hash,
      google_file_id: index >= 2 ? google.google_file_id : null,
      google_sync_receipt: index >= 2 ? CAPEX_CONFIGURATOR_GOOGLE_RECEIPT_PATH : null,
      verification_receipt: index === 3 ? CAPEX_CONFIGURATOR_VERIFICATION_PATH : null,
      validation_result: entry.validation,
      git_commit_hash: null,
      rollback_reference: CAPEX_CONFIGURATOR_RECEIPT_PATH,
      summary: entry.summary,
    };
    return appendTimelineEvent(input);
  });
  generateTimeline();
  console.log(JSON.stringify(events, null, 2));
  return events;
}
