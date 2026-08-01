import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";

export const registryKinds = ["facts", "assumptions", "decisions", "metrics", "documents", "principles", "dependencies", "sources"] as const;
export type RegistryKind = typeof registryKinds[number];
export type Registry = Record<RegistryKind, any[]>;
const statuses = new Set(["idea", "research", "proposed", "approved", "superseded", "rejected"]);
const projectRoot = path.resolve(platformRoot, "..");

export function readYaml(file: string) { return YAML.parse(fs.readFileSync(file, "utf8")); }
export function writeYaml(file: string, value: unknown) { const temp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(temp, YAML.stringify(value, { lineWidth: 0 })); fs.renameSync(temp, file); }
export function registryPath(kind: RegistryKind) { return path.join(platformRoot, "registry", `${kind}.yaml`); }
export function loadRegistry(): Registry { return Object.fromEntries(registryKinds.map(kind => [kind, readYaml(registryPath(kind))[kind] ?? []])) as Registry; }
export function registryHash(registry: Registry) { return crypto.createHash("sha256").update(JSON.stringify(registry)).digest("hex"); }
export function objectHash(value: unknown) { return value === null ? null : crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

function schemaErrors(registry: Registry): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const errors: string[] = [];
  for (const kind of registryKinds) {
    const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", `${kind}.schema.json`), "utf8")));
    if (!validate({ schema_version: 1, [kind]: registry[kind] })) errors.push(...(validate.errors ?? []).map(error => `${kind}: ${error.instancePath || "/"} ${error.message}`));
  }
  return errors;
}

export function validateRegistry(registry = loadRegistry()): string[] {
  const errors = schemaErrors(registry);
  const ids = new Set<string>();
  for (const kind of registryKinds) for (const item of registry[kind]) {
    if (ids.has(item.id)) errors.push(`duplicate ID: ${item.id}`);
    ids.add(item.id);
    if (kind !== "sources" && !statuses.has(item.status)) errors.push(`invalid status: ${item.id}`);
  }
  const sourceIds = new Set(registry.sources.map(item => item.id));
  const decisionIds = new Set(registry.decisions.map(item => item.id));
  const assumptionIds = new Set(registry.assumptions.map(item => item.id));
  const documentIds = new Set(registry.documents.map(item => item.id));
  const refs = (item: any, key: string, set: Set<string>) => (item[key] ?? []).forEach((id: string) => { if (!set.has(id)) errors.push(`${item.id}: missing ${key} reference ${id}`); });
  for (const item of registry.facts) { refs(item, "source_ids", sourceIds); refs(item, "applies_to", documentIds); if (item.status === "approved" && !item.internal && item.source_ids.length === 0) errors.push(`${item.id}: approved fact requires source_ids`); if (item.decision_id && !decisionIds.has(item.decision_id)) errors.push(`${item.id}: missing decision ${item.decision_id}`); }
  for (const item of registry.assumptions) { refs(item, "source_ids", sourceIds); refs(item, "applies_to", documentIds); if (item.decision_id && !decisionIds.has(item.decision_id)) errors.push(`${item.id}: missing decision ${item.decision_id}`); }
  for (const item of registry.decisions) { refs(item, "source_ids", sourceIds); refs(item, "affected_documents", documentIds); if (item.status === "approved" && (!item.approved_by || !item.approved_at)) errors.push(`${item.id}: approved decision requires approver and date`); if (item.supersedes && !decisionIds.has(item.supersedes)) errors.push(`${item.id}: missing superseded decision ${item.supersedes}`); }
  for (const item of registry.metrics) { refs(item, "source_ids", sourceIds); refs(item, "assumption_ids", assumptionIds); if (typeof item.value === "number" && (!item.formula && item.source_ids.length === 0 && item.assumption_ids.length === 0)) errors.push(`${item.id}: numeric metric requires formula, source_ids or assumption_ids`); }
  for (const item of registry.principles) { refs(item, "source_ids", sourceIds); if (!documentIds.has(item.document)) errors.push(`${item.id}: missing document reference ${item.document}`); if (item.decision_id && !decisionIds.has(item.decision_id)) errors.push(`${item.id}: missing decision ${item.decision_id}`); }
  for (const item of registry.dependencies) { if (!documentIds.has(item.source_document_id)) errors.push(`${item.id}: missing source document reference ${item.source_document_id}`); for (const target of item.target_documents) if (target.document_id && !documentIds.has(target.document_id)) errors.push(`${item.id}: missing target document reference ${target.document_id}`); }
  return errors;
}

export type ChangeOperation = { type: "add" | "update" | "replace" | "remove" | "supersede" | "reject"; entity: RegistryKind; id?: string; value?: any; position?: number };
export type ChangeSet = {
  change_id: string;
  title: string;
  status: string;
  created_at: string;
  decision_id: string;
  iteration_id?: string;
  proposal_id?: string;
  approved_payload_path?: string;
  approved_payload_sha256?: string;
  rollback_of?: string;
  operations: ChangeOperation[];
};

type AppliedOperation = { type: ChangeOperation["type"]; entity: RegistryKind; id: string; before: any | null; after: any | null; before_index: number | null; after_index: number | null; before_sha256: string | null; after_sha256: string | null; reverse_operation: ChangeOperation };

function reverseOperation(operation: ChangeOperation, id: string, before: any | null, beforeIndex: number | null): ChangeOperation {
  if (operation.type === "add") return { type: "remove", entity: operation.entity, id };
  if (operation.type === "remove") return { type: "add", entity: operation.entity, value: before, position: beforeIndex ?? undefined };
  return { type: "replace", entity: operation.entity, id, value: before };
}

export function simulateChange(registry: Registry, change: ChangeSet) {
  const copy = structuredClone(registry);
  const touched = new Set<RegistryKind>();
  const applied: AppliedOperation[] = [];
  for (const operation of change.operations ?? []) {
    if (!registryKinds.includes(operation.entity)) throw new Error(`Unsupported entity ${operation.entity}`);
    const list = copy[operation.entity];
    const lookupId = operation.id ?? operation.value?.id;
    if (!lookupId) throw new Error(`${operation.type}: operation requires id.`);
    const index = list.findIndex(item => item.id === lookupId);
    const before = index >= 0 ? structuredClone(list[index]) : null;
    const beforeIndex = index >= 0 ? index : null;
    if (operation.type === "add") {
      if (index >= 0) throw new Error(`add: ${lookupId} already exists`);
      if (!operation.value?.id) throw new Error("add: value.id is required");
      const position = operation.position;
      if (position !== undefined && (!Number.isInteger(position) || position < 0 || position > list.length)) throw new Error(`add: invalid position ${position} for ${lookupId}`);
      if (position === undefined) list.push(structuredClone(operation.value));
      else list.splice(position, 0, structuredClone(operation.value));
    } else if (operation.type === "remove") {
      if (index < 0) throw new Error(`remove: ${lookupId} not found`);
      list.splice(index, 1);
    } else {
      if (index < 0) throw new Error(`${operation.type}: ${lookupId} not found`);
      if (operation.type === "update") list[index] = { ...list[index], ...structuredClone(operation.value ?? {}) };
      if (operation.type === "replace") {
        if (!operation.value || operation.value.id !== lookupId) throw new Error(`replace: full value with matching id is required for ${lookupId}`);
        list[index] = structuredClone(operation.value);
      }
      if (operation.type === "supersede") list[index] = { ...list[index], status: "superseded", ...structuredClone(operation.value ?? {}) };
      if (operation.type === "reject") list[index] = { ...list[index], status: "rejected", ...structuredClone(operation.value ?? {}) };
    }
    touched.add(operation.entity);
    const afterIndex = list.findIndex(item => item.id === lookupId);
    const after = afterIndex >= 0 ? structuredClone(list[afterIndex]) : null;
    applied.push({ type: operation.type, entity: operation.entity, id: lookupId, before, after, before_index: beforeIndex, after_index: afterIndex >= 0 ? afterIndex : null, before_sha256: objectHash(before), after_sha256: objectHash(after), reverse_operation: reverseOperation(operation, lookupId, before, beforeIndex) });
  }
  return { registry: copy, touched: [...touched], operations: applied };
}

function approvedPayload(change: ChangeSet) {
  if (!change.approved_payload_path && !change.approved_payload_sha256) return null;
  if (!change.approved_payload_path || !change.approved_payload_sha256) throw new Error("approved payload requires both path and SHA-256.");
  const absolute = path.resolve(projectRoot, change.approved_payload_path);
  if (!absolute.startsWith(`${projectRoot}${path.sep}`) || !fs.existsSync(absolute)) throw new Error("Approved payload path is missing or outside the repository.");
  const hash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
  if (hash !== change.approved_payload_sha256) throw new Error(`Approved payload SHA-256 mismatch: expected ${change.approved_payload_sha256}, got ${hash}.`);
  return { path: change.approved_payload_path, sha256: hash };
}

export function previewChange(change: ChangeSet, registry = loadRegistry()) {
  const payload = approvedPayload(change);
  const beforeHash = registryHash(registry);
  const result = simulateChange(registry, change);
  const errors = validateRegistry(result.registry);
  return { ...result, payload, before_hash: beforeHash, after_hash: registryHash(result.registry), errors };
}

function operationLine(operation: AppliedOperation) {
  return `${operation.entity}: ${operation.type} ${operation.id}\n  before_index: ${operation.before_index ?? "null"}\n  after_index:  ${operation.after_index ?? "null"}\n  before_sha256: ${operation.before_sha256 ?? "null"}\n  after_sha256:  ${operation.after_sha256 ?? "null"}\n  before: ${JSON.stringify(operation.before)}\n  after:  ${JSON.stringify(operation.after)}`;
}

export function printChangePreview(change: ChangeSet) {
  const result = previewChange(change);
  console.log(`change: ${change.change_id} (${change.status})\ntouched: ${result.touched.join(", ") || "none"}\nbefore_sha256: ${result.before_hash}\nafter_sha256: ${result.after_hash}`);
  if (result.payload) console.log(`approved_payload: ${result.payload.path} sha256=${result.payload.sha256}`);
  console.log(result.operations.map(operationLine).join("\n"));
  if (result.errors.length) { console.log(`errors:\n${result.errors.map(error => `- ${error}`).join("\n")}`); process.exitCode = 1; }
  else console.log("validation: OK");
  return result;
}

function receiptPath(changeId: string) { return path.join(platformRoot, "changelog", "change-receipts", `${changeId}.yaml`); }

export function applyChange(change: ChangeSet, sourceFile?: string) {
  if (change.status !== "approved") throw new Error("change set must have status approved");
  const current = loadRegistry();
  const decision = current.decisions.find(item => item.id === change.decision_id);
  if (!decision || decision.status !== "approved") throw new Error("change set requires an existing approved decision");
  const result = previewChange(change, current);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  const destinationReceipt = receiptPath(change.change_id);
  if (fs.existsSync(destinationReceipt)) throw new Error(`change receipt already exists for ${change.change_id}; refusing duplicate apply.`);
  const appliedAt = new Date().toISOString();
  const stamp = appliedAt.replace(/[:.]/g, "-");
  const backup = path.join(platformRoot, "changelog", "backups", `${stamp}-${change.change_id}`);
  fs.mkdirSync(backup, { recursive: true });
  try {
    for (const kind of result.touched) {
      fs.copyFileSync(registryPath(kind), path.join(backup, `${kind}.yaml`));
      writeYaml(registryPath(kind), { schema_version: 1, [kind]: result.registry[kind] });
    }
    const validation = validateRegistry();
    if (validation.length) throw new Error(validation.join("; "));
    const journal = `# ${change.change_id}\n\nDecision: ${change.decision_id}\nApplied: ${appliedAt}\nActor: Codex\nTool: docs-platform change:apply\nBefore SHA-256: ${result.before_hash}\nAfter SHA-256: ${result.after_hash}\n\n## Operations\n\n${result.operations.map(operationLine).join("\n\n")}\n`;
    fs.writeFileSync(path.join(platformRoot, "changelog", `${stamp}-${change.change_id}.md`), journal);
    fs.appendFileSync(path.join(platformRoot, "changelog", "changes.log"), `${appliedAt} ${change.change_id} decision=${change.decision_id} touched=${result.touched.join(",")} before=${result.before_hash} after=${result.after_hash}\n`);
    const receipt = {
      receipt_version: 2,
      change_id: change.change_id,
      iteration_id: change.iteration_id ?? null,
      proposal_id: change.proposal_id ?? null,
      decision_id: change.decision_id,
      source_change_set: sourceFile ? path.relative(projectRoot, path.resolve(sourceFile)).replaceAll(path.sep, "/") : null,
      status: "applied",
      applied_at: appliedAt,
      actor: "Codex",
      tool: "docs-platform change:apply",
      approved_payload: result.payload,
      before_hash: result.before_hash,
      after_hash: result.after_hash,
      touched_registry_files: result.touched.map(kind => ({ path: `docs-platform/registry/${kind}.yaml`, backup_path: path.relative(projectRoot, path.join(backup, `${kind}.yaml`)).replaceAll(path.sep, "/") })),
      operations: result.operations,
      validation_result: "passed",
      git_commit_hash: null,
      rollback: { source_receipt: `docs-platform/changelog/change-receipts/${change.change_id}.yaml`, command: `npm run change:reverse:preview -- ../changelog/change-receipts/${change.change_id}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`, rollback_of: change.change_id },
    };
    writeYaml(destinationReceipt, receipt);
    console.log(`apply: OK\nreceipt: ${path.relative(projectRoot, destinationReceipt)}`);
    return receipt;
  } catch (error) {
    for (const kind of result.touched) {
      const saved = path.join(backup, `${kind}.yaml`);
      if (fs.existsSync(saved)) fs.copyFileSync(saved, registryPath(kind));
    }
    throw error;
  }
}

export function reverseChangeFromReceipt(receipt: any, changeId: string, rollbackDecisionId: string): ChangeSet {
  if (!receipt?.change_id || !Array.isArray(receipt.operations) || !receipt.before_hash || !receipt.after_hash) throw new Error("Invalid source change receipt.");
  return {
    change_id: changeId,
    title: `Откат ${receipt.change_id} через governed reverse change set`,
    status: "proposed",
    created_at: new Date().toISOString().slice(0, 10),
    decision_id: rollbackDecisionId,
    iteration_id: `${receipt.iteration_id ?? receipt.change_id}-ROLLBACK`,
    proposal_id: `PROP-ROLLBACK-${receipt.change_id}`,
    rollback_of: receipt.change_id,
    operations: [...receipt.operations].reverse().map((operation: AppliedOperation) => operation.reverse_operation),
  };
}

export function previewReverseChange(receiptFile: string, changeId: string, rollbackDecisionId: string) {
  const receipt = readYaml(path.resolve(receiptFile));
  const reverse = reverseChangeFromReceipt(receipt, changeId, rollbackDecisionId);
  const current = loadRegistry();
  const result = simulateChange(current, reverse);
  return { change: reverse, expected_current_hash: receipt.after_hash, expected_restored_hash: receipt.before_hash, simulated_current_hash: registryHash(current), simulated_restored_hash: registryHash(result.registry), restores_original_hash: registryHash(result.registry) === receipt.before_hash };
}

export function writeReverseChange(receiptFile: string, changeId: string, rollbackDecisionId: string) {
  const preview = previewReverseChange(receiptFile, changeId, rollbackDecisionId);
  const destination = path.join(platformRoot, "changes", "rollback", `${changeId}.yaml`);
  if (fs.existsSync(destination)) throw new Error(`Reverse change set already exists: ${destination}`);
  writeYaml(destination, preview.change);
  return { ...preview, destination };
}

export function requireChange(file?: string) {
  if (!file) throw new Error("Specify a change-file after --");
  const absolute = path.resolve(process.cwd(), file);
  return { change: readYaml(absolute) as ChangeSet, absolute };
}
