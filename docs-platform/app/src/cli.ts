import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const kinds = ["facts", "assumptions", "decisions", "metrics", "documents", "sources"] as const;
type Kind = typeof kinds[number];
type Registry = Record<Kind, any[]>;
const statuses = new Set(["idea", "research", "proposed", "approved", "superseded", "rejected"]);

function readYaml(file: string) { return YAML.parse(fs.readFileSync(file, "utf8")); }
function writeYaml(file: string, value: unknown) { const temp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(temp, YAML.stringify(value)); fs.renameSync(temp, file); }
function registryPath(kind: Kind) { return path.join(root, "registry", `${kind}.yaml`); }
function load(): Registry { return Object.fromEntries(kinds.map(k => [k, readYaml(registryPath(k))[k] ?? []])) as Registry; }
function schemaErrors(): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false }); const errors: string[] = [];
  for (const kind of kinds) { const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(root, "schemas", `${kind}.schema.json`), "utf8"))); if (!validate(readYaml(registryPath(kind)))) errors.push(...(validate.errors ?? []).map((e: { instancePath?: string; message?: string }) => `${kind}: ${e.instancePath || "/"} ${e.message}`)); }
  return errors;
}
export function validateRegistry(registry = load()): string[] {
  const errors = schemaErrors(); const ids = new Set<string>();
  for (const kind of kinds) for (const item of registry[kind]) { if (ids.has(item.id)) errors.push(`duplicate ID: ${item.id}`); ids.add(item.id); if (kind !== "sources" && !statuses.has(item.status)) errors.push(`invalid status: ${item.id}`); }
  const sourceIds = new Set(registry.sources.map(x => x.id)), decisionIds = new Set(registry.decisions.map(x => x.id)), assumptionIds = new Set(registry.assumptions.map(x => x.id)), documentIds = new Set(registry.documents.map(x => x.id));
  const refs = (item: any, key: string, set: Set<string>) => (item[key] ?? []).forEach((id: string) => { if (!set.has(id)) errors.push(`${item.id}: missing ${key} reference ${id}`); });
  for (const item of registry.facts) { refs(item, "source_ids", sourceIds); refs(item, "applies_to", documentIds); if (item.status === "approved" && !item.internal && item.source_ids.length === 0) errors.push(`${item.id}: approved fact requires source_ids`); if (item.decision_id && !decisionIds.has(item.decision_id)) errors.push(`${item.id}: missing decision ${item.decision_id}`); }
  for (const item of registry.assumptions) { refs(item, "source_ids", sourceIds); refs(item, "applies_to", documentIds); if (item.decision_id && !decisionIds.has(item.decision_id)) errors.push(`${item.id}: missing decision ${item.decision_id}`); }
  for (const item of registry.decisions) { refs(item, "source_ids", sourceIds); refs(item, "affected_documents", documentIds); if (item.status === "approved" && (!item.approved_by || !item.approved_at)) errors.push(`${item.id}: approved decision requires approver and date`); if (item.supersedes && !decisionIds.has(item.supersedes)) errors.push(`${item.id}: missing superseded decision ${item.supersedes}`); }
  for (const item of registry.metrics) { refs(item, "source_ids", sourceIds); refs(item, "assumption_ids", assumptionIds); if (typeof item.value === "number" && (!item.formula && item.source_ids.length === 0 && item.assumption_ids.length === 0)) errors.push(`${item.id}: numeric metric requires formula, source_ids or assumption_ids`); }
  return errors;
}
function requireChange(file?: string) { if (!file) throw new Error("Specify a change-file after --"); return readYaml(path.resolve(process.cwd(), file)); }
function changed(registry: Registry, change: any) {
  const copy = structuredClone(registry); const touched = new Set<Kind>(); const lines: string[] = [];
  for (const op of change.operations ?? []) { if (!kinds.includes(op.entity)) throw new Error(`Unsupported entity ${op.entity}`); const list = copy[op.entity as Kind]; touched.add(op.entity); const i = list.findIndex(x => x.id === op.id || x.id === op.value?.id);
    if (op.type === "add") { if (i >= 0) throw new Error(`add: ${op.value.id} already exists`); list.push(op.value); lines.push(`${op.entity}: add ${op.value.id}`); }
    else { if (i < 0) throw new Error(`${op.type}: ${op.id} not found`); const before = JSON.stringify(list[i]); if (op.type === "update") list[i] = { ...list[i], ...op.value }; if (op.type === "supersede") list[i] = { ...list[i], status: "superseded", ...op.value }; if (op.type === "reject") list[i] = { ...list[i], status: "rejected", ...op.value }; lines.push(`${op.entity}: ${op.type} ${op.id}\n  before: ${before}\n  after:  ${JSON.stringify(list[i])}`); }
  } return { copy, touched: [...touched], lines };
}
function preview(change: any) { const result = changed(load(), change); const errors = validateRegistry(result.copy); console.log(`change: ${change.change_id} (${change.status})\ntouched: ${result.touched.join(", ") || "none"}`); console.log(result.lines.join("\n")); if (errors.length) { console.log("errors:\n" + errors.map(x => `- ${x}`).join("\n")); process.exitCode = 1; } else console.log("validation: OK"); return result; }
function apply(change: any) { if (change.status !== "approved") throw new Error("change set must have status approved"); const decision = load().decisions.find(x => x.id === change.decision_id); if (!decision || decision.status !== "approved") throw new Error("change set requires an existing approved decision"); const result = preview(change); if (process.exitCode) return; const stamp = new Date().toISOString().replace(/[:.]/g, "-"); const backup = path.join(root, "changelog", "backups", `${stamp}-${change.change_id}`); fs.mkdirSync(backup, { recursive: true });
  try { for (const kind of result.touched as Kind[]) { fs.copyFileSync(registryPath(kind), path.join(backup, `${kind}.yaml`)); writeYaml(registryPath(kind), { schema_version: 1, [kind]: result.copy[kind] }); } const errors = validateRegistry(); if (errors.length) throw new Error(errors.join("; ")); const journal = `# ${change.change_id}\n\nDecision: ${change.decision_id}\nApplied: ${new Date().toISOString()}\n\n## Operations\n\n${result.lines.join("\n\n")}\n`; fs.writeFileSync(path.join(root, "changelog", `${stamp}-${change.change_id}.md`), journal); fs.appendFileSync(path.join(root, "changelog", "changes.log"), `${new Date().toISOString()} ${change.change_id} decision=${change.decision_id} touched=${result.touched.join(",")}\n`); console.log("apply: OK"); }
  catch (error) { for (const kind of result.touched as Kind[]) { const saved = path.join(backup, `${kind}.yaml`); if (fs.existsSync(saved)) fs.copyFileSync(saved, registryPath(kind)); } throw error; }
}
const [command, file] = process.argv.slice(2);
try { if (command === "registry:validate") { const errors = validateRegistry(); if (errors.length) throw new Error(errors.join("\n")); console.log("registry validation: OK"); } else if (command === "registry:list" || command === "documents:list" || command === "decisions:list") { const r = load(); const names = command === "documents:list" ? ["documents"] : command === "decisions:list" ? ["decisions"] : kinds; for (const k of names) for (const x of r[k as Kind]) console.log(`${x.id}\t${x.status ?? "-"}\t${x.title}`); } else if (command === "change:preview") preview(requireChange(file)); else if (command === "change:apply") apply(requireChange(file)); else throw new Error("commands: registry:validate|registry:list|documents:list|decisions:list|change:preview|change:apply"); } catch (error) { console.error(`ERROR: ${(error as Error).message}`); process.exitCode = 1; }
