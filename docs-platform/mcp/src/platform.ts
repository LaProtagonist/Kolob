import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { loadConfig, platformRoot } from "../../app/src/google/config.js";
import { getDocumentResource, documentText, locateUniqueTextRange, replaceDocumentRange } from "../../app/src/google/docs.js";
import { assertKnownFile } from "../../app/src/google/drive.js";
import { getGoogleServices } from "../../app/src/google/workspace.js";
import { sha256 } from "./runtime.js";
import type { ChangeRecord, DocumentSnapshot, PlatformAdapter, RegistryDocument, ValidationResult } from "./types.js";

const mcpDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(mcpDirectory, "../../app");
const registryKinds = ["facts", "assumptions", "decisions", "metrics", "documents", "sources"];
const rangeSheetName = /^[A-Za-z][A-Za-z0-9_ -]{0,80}$/;
function readYaml<T>(file: string) { return YAML.parse(fs.readFileSync(file, "utf8")) as T; }
function hashFile(file: string) { return sha256(fs.readFileSync(file, "utf8")); }
function cli(command: string, file?: string) {
  const tsx = path.join(appRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const source = path.join(appRoot, "src", "cli.ts");
  try { return execFileSync(process.execPath, [tsx, source, command, ...(file ? [file] : [])], { encoding: "utf8", env: process.env, windowsHide: true }); }
  catch (error) { const failure = error as { stdout?: string; stderr?: string; message: string }; throw new Error(`${failure.stdout ?? ""}${failure.stderr ?? failure.message}`.trim()); }
}
function registryDocuments() { return readYaml<{ documents: RegistryDocument[] }>(path.join(platformRoot, "registry", "documents.yaml")).documents; }
function registryDecisions() { return readYaml<{ decisions: Array<Record<string, unknown>> }>(path.join(platformRoot, "registry", "decisions.yaml")).decisions; }
function findChange(changeId: string) {
  const directory = path.join(platformRoot, "changes");
  for (const name of fs.readdirSync(directory)) {
    if (!/\.ya?ml$/i.test(name)) continue;
    const file = path.join(directory, name);
    const value = readYaml<Record<string, unknown>>(file);
    if (value.change_id === changeId) return { id: String(value.change_id), status: String(value.status), decisionId: String(value.decision_id), hash: hashFile(file), file, value } satisfies ChangeRecord;
  }
  return null;
}
function record(documentId: string) { const value = registryDocuments().find(item => item.id === documentId); if (!value) throw new Error("Only registered document_id values are accepted."); if (!value.google_file_id) throw new Error("Registered document has no Google file ID."); return value; }
async function safeDocument(documentId: string) {
  const entry = record(documentId); const config = loadConfig(); const services = await getGoogleServices(); await assertKnownFile(services.drive, entry.google_file_id as string, config); const resource = await getDocumentResource(services.docs, entry.google_file_id as string); return { entry, services, resource, text: documentText(resource) };
}
export function createPlatformAdapter(): PlatformAdapter {
  return {
    async projectStatus() { const validation = await this.validateRegistry(); return { project: "Колобочная", registry: validation, registeredDocuments: registryDocuments().length, changeSets: fs.readdirSync(path.join(platformRoot, "changes")).filter(name => /\.ya?ml$/i.test(name)).length, mcpMode: "governed-local" }; },
    async validateRegistry() { try { cli("registry:validate"); return { valid: true, errors: [] }; } catch (error) { return { valid: false, errors: [(error as Error).message] }; } },
    async listDocuments() { return registryDocuments().map(({ id, title, type, status, sections, updated_at }) => ({ id, title, type, status, sections, updated_at })); },
    async readDocument(documentId) { const { entry, text } = await safeDocument(documentId); return { documentId, title: entry.title, type: entry.type, sections: entry.sections, text, folderVerified: true }; },
    async readSpreadsheet(documentId, sheet, range) { const entry = record(documentId); if (!entry.type.includes("spreadsheet")) throw new Error("document_id is not a registered spreadsheet."); if (!entry.sections.includes(sheet) || !rangeSheetName.test(sheet)) throw new Error("Sheet must be a registered stable sheet name."); const config = loadConfig(); const services = await getGoogleServices(); await assertKnownFile(services.drive, entry.google_file_id as string, config); const result = await services.sheets.spreadsheets.values.get({ spreadsheetId: entry.google_file_id as string, range: `${sheet}!${range}`, majorDimension: "ROWS" }); return { documentId, sheet, range, values: (result.data.values ?? []).map(row => row.map(value => String(value))), folderVerified: true }; },
    async replaceBlock({ documentId, before, after, expectedSourceHash }) { const { entry, services, resource, text } = await safeDocument(documentId); if (sha256(text) !== expectedSourceHash) throw new Error("Document changed before the approved operation could be applied."); const range = locateUniqueTextRange(resource, before); await replaceDocumentRange(services.docs, entry.google_file_id as string, range, after); },
    async getDecision(decisionId) { return registryDecisions().find(item => item.id === decisionId) ?? null; },
    async isDecisionApproved(decisionId) { return (await this.getDecision(decisionId))?.status === "approved"; },
    async getChange(changeId) { return findChange(changeId); },
    async registryHash() { return sha256(registryKinds.map(kind => fs.readFileSync(path.join(platformRoot, "registry", `${kind}.yaml`), "utf8")).join("\n---\n")); },
    async previewRegistryChange(change) { const output = cli("change:preview", change.file); return { output, warnings: change.status === "approved" ? [] : ["Change set is not approved; apply will be rejected."] }; },
    async applyRegistryChange(change) { const output = cli("change:apply", change.file); return { output, validation: await this.validateRegistry() }; }
  };
}
