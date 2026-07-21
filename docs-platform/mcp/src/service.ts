import { AuditLog, PreviewStore, redact, sha256 } from "./runtime.js";
import type { ChangeRecord, DocumentPreview, PlatformAdapter, Preview, RegistryPreview } from "./types.js";

function blockText(text: string, blockId: string) {
  const marker = `[${blockId}]`;
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`Stable block '${blockId}' was not found.`);
  const lineEnd = text.indexOf("\n", markerIndex);
  if (lineEnd < 0) throw new Error(`Stable block '${blockId}' has no editable content.`);
  const nextMarker = text.indexOf("\n[", lineEnd + 1);
  const value = text.slice(lineEnd + 1, nextMarker < 0 ? text.length : nextMarker).trim();
  if (!value) throw new Error(`Stable block '${blockId}' has no editable content.`);
  return value;
}

function assertRange(range: string) {
  const match = /^([A-Z]{1,3})([1-9]\d{0,3}):([A-Z]{1,3})([1-9]\d{0,3})$/.exec(range);
  if (!match) throw new Error("Range must be an explicit A1 rectangle, for example A1:D20.");
  const column = (value: string) => [...value].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  const cells = (Math.abs(column(match[3]) - column(match[1])) + 1) * (Math.abs(Number(match[4]) - Number(match[2])) + 1);
  if (cells > 500) throw new Error("Range exceeds the 500-cell MCP limit.");
}

export class GovernedTools {
  constructor(private readonly platform: PlatformAdapter, private readonly previews: PreviewStore, private readonly audit: AuditLog) {}
  private success(tool: string, value: Record<string, unknown>, meta: Record<string, unknown> = {}) { const safe = redact(value); this.audit.append({ tool, result: "ok", ...meta }); return safe; }
  private failure(tool: string, error: unknown, meta: Record<string, unknown> = {}): never { const message = (error as Error).message; this.audit.append({ tool, result: "error", error: message, ...meta }); throw error; }
  async projectStatus() { try { return this.success("project_status", await this.platform.projectStatus()); } catch (error) { return this.failure("project_status", error); } }
  async registryValidate() { try { const validation = await this.platform.validateRegistry(); return this.success("registry_validate", validation, { affectedDocumentIds: [] }); } catch (error) { return this.failure("registry_validate", error); } }
  async documentsList() { try { return this.success("documents_list", { documents: await this.platform.listDocuments() }); } catch (error) { return this.failure("documents_list", error); } }
  async decisionGet(decisionId: string) { try { const decision = await this.platform.getDecision(decisionId); if (!decision) throw new Error("Decision not found."); return this.success("decision_get", { decisionId, decision }); } catch (error) { return this.failure("decision_get", error, { decisionId }); } }
  async changeGet(changeId: string) { try { const change = await this.platform.getChange(changeId); if (!change) throw new Error("Change set not found in docs-platform/changes."); return this.success("change_get", { changeId, status: change.status, decisionId: change.decisionId, change: change.value }); } catch (error) { return this.failure("change_get", error, { changeId }); } }
  async documentRead(documentId: string) { try { const document = await this.platform.readDocument(documentId); if (!document.folderVerified) throw new Error("Document is outside the verified project folder."); return this.success("document_read", { documentId, title: document.title, type: document.type, text: document.text, sections: document.sections, projectFolderVerified: true }, { affectedDocumentIds: [documentId], beforeHash: sha256(document.text) }); } catch (error) { return this.failure("document_read", error, { affectedDocumentIds: [documentId] }); } }
  async spreadsheetRead(documentId: string, sheet: string, range: string) { try { assertRange(range); const result = await this.platform.readSpreadsheet(documentId, sheet, range); if (!result.folderVerified) throw new Error("Spreadsheet is outside the verified project folder."); return this.success("spreadsheet_read", { documentId, sheet, range, values: result.values, projectFolderVerified: true }, { affectedDocumentIds: [documentId] }); } catch (error) { return this.failure("spreadsheet_read", error, { affectedDocumentIds: [documentId] }); } }
  async documentUpdatePreview(input: { documentId: string; blockId: string; replacementText: string; decisionId: string }) {
    try {
      if (!input.replacementText.trim() || input.replacementText.length > 4000) throw new Error("Replacement text must be between 1 and 4000 characters.");
      const validation = await this.platform.validateRegistry();
      if (!validation.valid) throw new Error(`Registry validation failed before preview: ${validation.errors.join("; ")}`);
      const document = await this.platform.readDocument(input.documentId);
      if (!document.folderVerified) throw new Error("Document is outside the verified project folder.");
      if (!document.sections.includes(input.blockId)) throw new Error("Block ID is not registered for this document.");
      const decision = await this.platform.getDecision(input.decisionId);
      if (!decision) throw new Error("Decision not found.");
      const before = blockText(document.text, input.blockId);
      const preview = this.previews.create({ kind: "document", documentId: input.documentId, decisionId: input.decisionId, sourceHash: sha256(document.text), blockId: input.blockId, before, after: input.replacementText, operationHash: sha256(JSON.stringify({ documentId: input.documentId, blockId: input.blockId, before, after: input.replacementText, decisionId: input.decisionId })) } satisfies Omit<DocumentPreview, "previewId" | "createdAt" | "expiresAt">) as DocumentPreview;
      return this.success("document_update_preview", { previewId: preview.previewId, expiresAt: preview.expiresAt, documentId: input.documentId, blockId: input.blockId, before, after: input.replacementText, decisionId: input.decisionId, decisionStatus: decision.status, projectFolderVerified: true, registryValidation: validation, warnings: decision.status === "approved" ? [] : ["Decision is not approved; apply will be rejected."] }, { affectedDocumentIds: [input.documentId], decisionId: input.decisionId, previewId: preview.previewId, beforeHash: preview.sourceHash });
    } catch (error) { return this.failure("document_update_preview", error, { affectedDocumentIds: [input.documentId], decisionId: input.decisionId }); }
  }
  async documentUpdateApply(previewId: string) {
    let preview: Preview | undefined;
    try {
      preview = this.previews.claim(previewId);
      if (preview.kind !== "document") throw new Error("Preview is not a document update.");
      if (!(await this.platform.isDecisionApproved(preview.decisionId))) throw new Error("Apply requires an existing approved decision.");
      const before = await this.platform.readDocument(preview.documentId);
      if (!before.folderVerified) throw new Error("Document is outside the verified project folder.");
      if (sha256(before.text) !== preview.sourceHash) throw new Error("Preview is stale because the document changed after preview.");
      if (blockText(before.text, preview.blockId) !== preview.before) throw new Error("Preview target block no longer matches the approved diff.");
      await this.platform.replaceBlock({ documentId: preview.documentId, before: preview.before, after: preview.after, expectedSourceHash: preview.sourceHash });
      const after = await this.platform.readDocument(preview.documentId);
      const afterHash = sha256(after.text);
      if (!after.folderVerified || blockText(after.text, preview.blockId) !== preview.after) throw new Error("Post-write verification failed.");
      const validation = await this.platform.validateRegistry();
      if (!validation.valid) throw new Error(`Registry validation failed after apply: ${validation.errors.join("; ")}`);
      return this.success("document_update_apply", { previewId, documentId: preview.documentId, blockId: preview.blockId, decisionId: preview.decisionId, before: preview.before, after: preview.after, beforeHash: preview.sourceHash, afterHash, validation, applied: true }, { affectedDocumentIds: [preview.documentId], decisionId: preview.decisionId, previewId, beforeHash: preview.sourceHash, afterHash });
    } catch (error) { return this.failure("document_update_apply", error, { affectedDocumentIds: preview?.kind === "document" ? [preview.documentId] : [], decisionId: preview?.decisionId, previewId }); }
  }
  async registryChangePreview(changeId: string) {
    try {
      const change = await this.platform.getChange(changeId);
      if (!change) throw new Error("Change set not found in docs-platform/changes.");
      const sourceHash = await this.platform.registryHash();
      const result = await this.platform.previewRegistryChange(change);
      const preview = this.previews.create({ kind: "registry", changeId, decisionId: change.decisionId, sourceHash, changeHash: change.hash, operationHash: sha256(JSON.stringify({ changeId, sourceHash, changeHash: change.hash })) } satisfies Omit<RegistryPreview, "previewId" | "createdAt" | "expiresAt">) as RegistryPreview;
      return this.success("registry_change_preview", { previewId: preview.previewId, expiresAt: preview.expiresAt, changeId, decisionId: change.decisionId, changeStatus: change.status, preview: result.output, warnings: result.warnings }, { decisionId: change.decisionId, previewId: preview.previewId, beforeHash: sourceHash });
    } catch (error) { return this.failure("registry_change_preview", error, { changeId }); }
  }
  async registryChangeApply(previewId: string) {
    let preview: Preview | undefined;
    try {
      preview = this.previews.claim(previewId);
      if (preview.kind !== "registry") throw new Error("Preview is not a registry change.");
      if (preview.sourceHash !== await this.platform.registryHash()) throw new Error("Preview is stale because registry state changed after preview.");
      const change = await this.platform.getChange(preview.changeId);
      if (!change || change.hash !== preview.changeHash) throw new Error("Preview is stale because the change set changed after preview.");
      if (change.status !== "approved" || !(await this.platform.isDecisionApproved(preview.decisionId))) throw new Error("Registry apply requires an existing approved change set and decision.");
      const result = await this.platform.applyRegistryChange(change);
      if (!result.validation.valid) throw new Error(`Registry validation failed after apply: ${result.validation.errors.join("; ")}`);
      const afterHash = await this.platform.registryHash();
      return this.success("registry_change_apply", { previewId, changeId: change.id, decisionId: preview.decisionId, result: result.output, beforeHash: preview.sourceHash, afterHash, validation: result.validation, applied: true }, { decisionId: preview.decisionId, previewId, beforeHash: preview.sourceHash, afterHash });
    } catch (error) { return this.failure("registry_change_apply", error, { decisionId: preview?.decisionId, previewId }); }
  }
}
