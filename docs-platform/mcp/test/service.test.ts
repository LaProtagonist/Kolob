import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuditLog, PreviewStore, sha256 } from "../src/runtime.js";
import { GovernedTools } from "../src/service.js";
import type { ChangeRecord, DocumentSnapshot, PlatformAdapter, ValidationResult } from "../src/types.js";

class FakePlatform implements PlatformAdapter {
  text = "Заголовок\n[TEST-01] Исходный блок\nДо изменения\n[OTHER] Неизменяемый блок\nОстаётся как есть.\n";
  folderVerified = true;
  writes = 0;
  registryWrites = 0;
  registryState = "registry-v1";
  validRegistry = true;
  decisions: Record<string, Record<string, unknown>> = { "DEC-002": { id: "DEC-002", status: "approved" }, "DEC-RESEARCH": { id: "DEC-RESEARCH", status: "research" } };
  change: ChangeRecord = { id: "CHG-001", status: "approved", decisionId: "DEC-002", hash: "change-v1", file: "safe.yaml", value: { change_id: "CHG-001", status: "approved" } };
  async projectStatus() { return { project: "Колобочная", access_token: "secret-value" }; }
  async validateRegistry(): Promise<ValidationResult> { return this.validRegistry ? { valid: true, errors: [] } : { valid: false, errors: ["fixture registry error"] }; }
  async listDocuments() { return [{ id: "TEST-DOC-001", title: "TEST", type: "test_document", status: "research", sections: ["TEST-01"], updated_at: "2026-07-21" }]; }
  async readDocument(documentId: string): Promise<DocumentSnapshot> { if (documentId !== "TEST-DOC-001") throw new Error("Only registered document_id values are accepted."); return { documentId, title: "TEST", type: "test_document", sections: ["TEST-01"], text: this.text, folderVerified: this.folderVerified }; }
  async readSpreadsheet(documentId: string, sheet: string, range: string) { if (documentId !== "TEST-SHEET-001" || sheet !== "README") throw new Error("Only registered spreadsheet IDs and sheets are accepted."); return { documentId, sheet, range, values: [["Статус", "TEST"]], folderVerified: this.folderVerified }; }
  async replaceBlock(input: { documentId: string; before: string; after: string; expectedSourceHash: string }) { if (input.documentId !== "TEST-DOC-001" || sha256(this.text) !== input.expectedSourceHash) throw new Error("Document changed before apply."); if ((this.text.match(new RegExp(input.before, "g")) ?? []).length !== 1) throw new Error("Diff target is not unique."); this.text = this.text.replace(input.before, input.after); this.writes += 1; }
  async getDecision(decisionId: string) { return this.decisions[decisionId] ?? null; }
  async isDecisionApproved(decisionId: string) { return (await this.getDecision(decisionId))?.status === "approved"; }
  async getChange(changeId: string) { return changeId === this.change.id ? this.change : null; }
  async registryHash() { return sha256(this.registryState); }
  async previewRegistryChange(change: ChangeRecord) { return { output: `preview ${change.id}`, warnings: [] }; }
  async applyRegistryChange(change: ChangeRecord) { if (change.status !== "approved") throw new Error("governed workflow rejected change"); this.registryWrites += 1; this.registryState = "registry-v2"; return { output: "apply: OK", validation: await this.validateRegistry() }; }
}

function setup(ttl = 24 * 60 * 60 * 1000) { const root = fs.mkdtempSync(path.join(os.tmpdir(), "kolobochnaya-mcp-")); const platform = new FakePlatform(); const previews = new PreviewStore(root, ttl); return { root, platform, previews, tools: new GovernedTools(platform, previews, new AuditLog(root)) }; }
function previewDocument(tools: GovernedTools, decisionId = "DEC-002") { return tools.documentUpdatePreview({ documentId: "TEST-DOC-001", blockId: "TEST-01", replacementText: "После изменения", decisionId }); }

test("reads a registered document ID", async () => { const { tools } = setup(); await assert.doesNotReject(() => tools.documentRead("TEST-DOC-001")); });
test("rejects an arbitrary Google file ID", async () => { const { tools } = setup(); await assert.rejects(() => tools.documentRead("1ArbitraryGoogleFileId")); });
test("rejects documents outside the project folder", async () => { const { tools, platform } = setup(); platform.folderVerified = false; await assert.rejects(() => tools.documentRead("TEST-DOC-001"), /outside the verified project folder/); });
test("preview does not write a Google Doc", async () => { const { tools, platform } = setup(); await previewDocument(tools); assert.equal(platform.writes, 0); });
test("preview stores source hash and TTL", async () => { const { tools, platform, previews } = setup(); const preview = await previewDocument(tools); const stored = previews.get(String(preview.previewId)); assert.equal(stored.kind, "document"); assert.equal(stored.sourceHash, sha256(platform.text)); assert.ok(Date.parse(stored.expiresAt) > Date.parse(stored.createdAt)); });
test("preview rejects an invalid registry", async () => { const { tools, platform } = setup(); platform.validRegistry = false; await assert.rejects(() => previewDocument(tools), /Registry validation failed before preview/); });
test("apply rejects a missing preview", async () => { const { tools } = setup(); await assert.rejects(() => tools.documentUpdateApply("prv-00000000-0000-0000-0000-000000000000"), /not found/); });
test("apply rejects an expired preview", async () => { const { tools } = setup(1); const preview = await previewDocument(tools); await new Promise(resolve => setTimeout(resolve, 5)); await assert.rejects(() => tools.documentUpdateApply(String(preview.previewId)), /expired/); });
test("apply rejects an externally changed document", async () => { const { tools, platform } = setup(); const preview = await previewDocument(tools); platform.text = platform.text.replace("До изменения", "Внешнее изменение"); await assert.rejects(() => tools.documentUpdateApply(String(preview.previewId)), /stale/); assert.equal(platform.writes, 0); });
test("apply requires an approved decision", async () => { const { tools, platform } = setup(); const preview = await previewDocument(tools, "DEC-RESEARCH"); await assert.rejects(() => tools.documentUpdateApply(String(preview.previewId)), /approved decision/); assert.equal(platform.writes, 0); });
test("apply changes only the shown block", async () => { const { tools, platform } = setup(); const preview = await previewDocument(tools); const applied = await tools.documentUpdateApply(String(preview.previewId)); assert.equal(applied.applied, true); assert.match(platform.text, /После изменения/); assert.match(platform.text, /Остаётся как есть/); assert.equal(platform.writes, 1); });
test("repeated apply of one preview is forbidden", async () => { const { tools } = setup(); const preview = await previewDocument(tools); await tools.documentUpdateApply(String(preview.previewId)); await assert.rejects(() => tools.documentUpdateApply(String(preview.previewId)), /already been applied/); });
test("MCP responses redact OAuth secrets", async () => { const { tools } = setup(); const response = await tools.projectStatus(); assert.equal(response.access_token, "[REDACTED]"); });
test("audit log does not contain OAuth secrets", async () => { const { tools, root } = setup(); await assert.rejects(() => tools.documentRead("access_token=secret-value")); const files = fs.readdirSync(path.join(root, "audit")); const content = files.map(file => fs.readFileSync(path.join(root, "audit", file), "utf8")).join("\n"); assert.doesNotMatch(content, /secret-value/); assert.match(content, /\[REDACTED\]/); });
test("spreadsheet reads require a limited explicit range", async () => { const { tools } = setup(); await assert.doesNotReject(() => tools.spreadsheetRead("TEST-SHEET-001", "README", "A1:B4")); await assert.rejects(() => tools.spreadsheetRead("TEST-SHEET-001", "README", "A1:ZZ9999"), /500-cell/); await assert.rejects(() => tools.spreadsheetRead("TEST-SHEET-001", "README", "README"), /explicit A1 rectangle/); });
test("registry apply uses the existing governed workflow", async () => { const { tools, platform } = setup(); const preview = await tools.registryChangePreview("CHG-001"); assert.equal(platform.registryWrites, 0); const applied = await tools.registryChangeApply(String(preview.previewId)); assert.equal(applied.applied, true); assert.equal(platform.registryWrites, 1); });
