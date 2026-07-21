import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AuditLog, PreviewStore, redact } from "./runtime.js";
import { createPlatformAdapter } from "./platform.js";
import { GovernedTools } from "./service.js";
import type { PlatformAdapter } from "./types.js";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readAnnotations = { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true };
const previewAnnotations = { readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: false };
const applyAnnotations = { readOnlyHint: false, openWorldHint: false, destructiveHint: true, idempotentHint: false };
function result(value: Record<string, unknown>) { const safe = redact(value); return { content: [{ type: "text" as const, text: JSON.stringify(safe) }], structuredContent: safe }; }
function safeError(error: unknown) { return result({ error: redact({ message: (error as Error).message }).message }); }

export function createGovernedService(platform: PlatformAdapter = createPlatformAdapter(), runtimeRoot = path.join(platformRoot, ".runtime")) { return new GovernedTools(platform, new PreviewStore(runtimeRoot), new AuditLog(runtimeRoot)); }
export function createMcpServer(service = createGovernedService()) {
  const server = new McpServer({ name: "kolobochnaya-docs-platform", version: "0.1.0" }, { instructions: "Колобочная: use only registered document IDs. Read and preview tools do not change Google or registry data. Every write needs a non-expired preview ID and an approved existing decision. The server never approves decisions or change sets." });
  const call = <T extends Record<string, unknown>>(fn: () => Promise<T>) => fn().then(result).catch(safeError);
  server.registerTool("project_status", { title: "Project status", description: "Returns governed platform status without accessing arbitrary Google Drive files.", annotations: readAnnotations }, () => call(() => service.projectStatus()));
  server.registerTool("registry_validate", { title: "Validate registry", description: "Validates the structured registry and references without writing it.", annotations: readAnnotations }, () => call(() => service.registryValidate()));
  server.registerTool("documents_list", { title: "List registered documents", description: "Lists documents registered in docs-platform/registry/documents.yaml.", annotations: readAnnotations }, () => call(() => service.documentsList()));
  server.registerTool("document_read", { title: "Read registered document", description: "Reads a document only by stable registry document_id after project-folder verification.", inputSchema: { document_id: z.string().min(1) }, annotations: readAnnotations }, ({ document_id }) => call(() => service.documentRead(document_id)));
  server.registerTool("spreadsheet_read", { title: "Read registered spreadsheet range", description: "Reads an explicit limited range from a registered spreadsheet and registered sheet name only.", inputSchema: { document_id: z.string().min(1), sheet: z.string().min(1), range: z.string().min(3) }, annotations: readAnnotations }, ({ document_id, sheet, range }) => call(() => service.spreadsheetRead(document_id, sheet, range)));
  server.registerTool("decision_get", { title: "Read decision", description: "Reads one registry decision by stable decision ID.", inputSchema: { decision_id: z.string().min(1) }, annotations: readAnnotations }, ({ decision_id }) => call(() => service.decisionGet(decision_id)));
  server.registerTool("change_get", { title: "Read change set", description: "Reads a change set only by ID from docs-platform/changes.", inputSchema: { change_id: z.string().min(1) }, annotations: readAnnotations }, ({ change_id }) => call(() => service.changeGet(change_id)));
  server.registerTool("document_update_preview", { title: "Preview registered document update", description: "Creates a time-limited preview for one registered stable block. Does not write Google Docs.", inputSchema: { document_id: z.string().min(1), block_id: z.string().min(1), replacement_text: z.string().min(1).max(4000), decision_id: z.string().min(1) }, annotations: previewAnnotations }, ({ document_id, block_id, replacement_text, decision_id }) => call(() => service.documentUpdatePreview({ documentId: document_id, blockId: block_id, replacementText: replacement_text, decisionId: decision_id })));
  server.registerTool("registry_change_preview", { title: "Preview governed registry change", description: "Previews a registry change set already stored in docs-platform/changes. Does not write registry files.", inputSchema: { change_id: z.string().min(1) }, annotations: previewAnnotations }, ({ change_id }) => call(() => service.registryChangePreview(change_id)));
  server.registerTool("document_update_apply", { title: "Apply approved document preview", description: "Applies exactly one non-expired document preview after hash, folder, decision, and post-write validation.", inputSchema: { preview_id: z.string().min(1) }, annotations: applyAnnotations }, ({ preview_id }) => call(() => service.documentUpdateApply(preview_id)));
  server.registerTool("registry_change_apply", { title: "Apply approved registry preview", description: "Runs the existing governed registry apply workflow for one non-expired preview.", inputSchema: { preview_id: z.string().min(1) }, annotations: applyAnnotations }, ({ preview_id }) => call(() => service.registryChangeApply(preview_id)));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}
