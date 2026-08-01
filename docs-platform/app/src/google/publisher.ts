import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, type docs_v1, type drive_v3 } from "googleapis";
import YAML from "yaml";
import { getAuthorizedClient } from "./auth.js";
import { loadConfig, platformRoot, writeSecretJson } from "./config.js";
import { getDocumentResource, locateUniqueTextRange } from "./docs.js";
import { assertKnownFile, findNamedDocumentsInProjectFolder, getProjectFolder } from "./drive.js";
import { assertFileInProjectFolder, requireProjectFolder } from "./guard.js";
import { parseMarkdown, semanticSegments, type MarkdownBlock, type ParsedMarkdown } from "./markdown.js";
import { DOC_MIME, type DriveFile, type GoogleConfig } from "./types.js";

export const PUBLICATION_DECISION_ID = "DEC-006";
export const PROJECT_DOCUMENT_TARGETS = [
  { registryId: "DOC-FOUNDATION", googleTitle: "00 — Foundation", status: "approved", version: "1.0", requiredIds: ["PRP-FND-001", "PRP-FND-002", "PRP-FND-003", "PRP-FND-004", "PRP-FND-005", "PRP-FND-006", "PRP-FND-007"], contentDecisionId: "DEC-003" },
  { registryId: "DOC-BUSINESS-MODEL-ARCHITECTURE", googleTitle: "01 — Business Model Architecture", status: "approved", version: "1.0", requiredIds: ["PRP-BMA-001", "PRP-BMA-002", "PRP-BMA-003", "PRP-BMA-004", "PRP-BMA-005", "PRP-BMA-006", "PRP-BMA-007", "PRP-BMA-008", "PRP-BMA-009", "PRP-BMA-010"], contentDecisionId: "DEC-004" },
  { registryId: "DOC-CAPEX-EQUIPMENT-SPECIFICATION", googleTitle: "02 — CAPEX — Спецификация оснащения пилотного объекта", status: "research", version: "0.1", requiredIds: ["CAPEX-01", "CAPEX-02", "CAPEX-03", "CAPEX-04", "Что ещё не сформировано"], contentDecisionId: "DEC-005" },
] as const;

type RegistryDocument = {
  id: string;
  title: string;
  status: string;
  version?: string | null;
  google_file_id?: string | null;
  local_path?: string | null;
  sections: string[];
};

export type LocalPublicationDocument = {
  registryId: string;
  registryTitle: string;
  googleTitle: string;
  localPath: string;
  version: string;
  status: string;
  bytes: number;
  sha256: string;
  sectionCount: number;
  headingCount: number;
  tableCount: number;
  registeredBlockCount: number;
  itemCount?: number;
  relatedDecisions: string[];
  source: string;
  parsed: ParsedMarkdown;
  registeredGoogleFileId: string | null;
};

type PreviewTarget = Omit<LocalPublicationDocument, "source" | "parsed" | "registeredGoogleFileId"> & {
  action: "create" | "update";
  googleFileId: string | null;
  googleFileIdMasked: string;
  folderCheck: "passed";
  warnings: string[];
};

type PublicationPreview = {
  previewId: string;
  createdAt: string;
  folderName: string;
  folderCheck: "passed";
  decisionId: string;
  targets: PreviewTarget[];
};

type PublicationReceipt = {
  registryId: string;
  localPath: string;
  localSha256: string;
  googleFileId: string;
  googleMimeType: string;
  googleTitle: string;
  webViewLink: string;
  syncedAt: string;
  action: "create" | "update";
  readback: "passed";
  sectionCount: number;
  tableCount: number;
  validationStatus: "passed";
};

const runtimeDir = path.join(platformRoot, ".runtime");
const previewPath = path.join(runtimeDir, "google-publication-preview.json");
const resultPath = path.join(runtimeDir, "google-publication-result.json");
const projectRoot = path.resolve(platformRoot, "..");

async function publicationServices() {
  const auth = await getAuthorizedClient();
  return { drive: google.drive({ version: "v3", auth }), docs: google.docs({ version: "v1", auth }) };
}

function sha256(value: string | Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }
function maskId(id: string | null) { return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : "pending"; }
function readDocumentsRegistry() { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "documents.yaml"), "utf8")) as { documents: RegistryDocument[] }).documents; }
function readDecisionsRegistry() { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8")) as { decisions: Array<{ id: string; status: string; affected_documents: string[] }> }).decisions; }

export function analyzeLocalPublicationDocuments(): LocalPublicationDocument[] {
  const registry = readDocumentsRegistry();
  return PROJECT_DOCUMENT_TARGETS.map(target => {
    const document = registry.find(item => item.id === target.registryId);
    if (!document) throw new Error(`Registry document not found: ${target.registryId}.`);
    if (!document.local_path) throw new Error(`${target.registryId} has no local_path.`);
    if (document.status !== target.status || document.version !== target.version) throw new Error(`${target.registryId} status/version differs from the publication contract.`);
    const absolutePath = path.resolve(projectRoot, document.local_path);
    if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`${target.registryId} local_path escapes the project root.`);
    const source = fs.readFileSync(absolutePath, "utf8");
    const parsed = parseMarkdown(source);
    const ids = target.registryId === "DOC-CAPEX-EQUIPMENT-SPECIFICATION" ? new Set(source.match(/CAPEX-0[1-4]-\d{3}/g) ?? []) : undefined;
    for (const required of target.requiredIds) if (!source.includes(required)) throw new Error(`${target.registryId} is missing required section ${required}.`);
    if (target.registryId === "DOC-BUSINESS-MODEL-ARCHITECTURE") {
      if (!source.includes("на транспортных маршрутах, фудкортах и в других форматах")) throw new Error("Business Model Architecture is missing the approved фудкортах formulation.");
      if (source.includes("автозаправочных станциях")) throw new Error("Business Model Architecture contains the rejected автозаправочных станциях formulation.");
    }
    if (target.registryId === "DOC-CAPEX-EQUIPMENT-SPECIFICATION") {
      if (ids?.size !== 124) throw new Error(`CAPEX item count differs: expected 124, got ${ids?.size ?? 0}.`);
      if (/[0-9]\s*(?:₽|руб(?:\.|лей|ля)?|RUB|USD|EUR)/u.test(source) || source.includes("Итого CAPEX:")) throw new Error("CAPEX contains a price or total CAPEX value.");
    }
    return {
      registryId: target.registryId,
      registryTitle: document.title,
      googleTitle: target.googleTitle,
      localPath: document.local_path,
      version: target.version,
      status: target.status,
      bytes: Buffer.byteLength(source),
      sha256: sha256(source),
      sectionCount: parsed.sectionCount,
      headingCount: parsed.headingCount,
      tableCount: parsed.tableCount,
      registeredBlockCount: document.sections.length,
      itemCount: ids?.size,
      relatedDecisions: [target.contentDecisionId, PUBLICATION_DECISION_ID],
      source,
      parsed,
      registeredGoogleFileId: document.google_file_id ?? null,
    };
  });
}

async function resolveRemoteFile(drive: drive_v3.Drive, config: GoogleConfig, local: LocalPublicationDocument) {
  if (local.registeredGoogleFileId) {
    const file = await assertKnownFile(drive, local.registeredGoogleFileId, config);
    if (file.name !== local.googleTitle || file.mimeType !== DOC_MIME) throw new Error(`${local.registryId} registered Google file has the wrong title or MIME type.`);
    return { action: "update" as const, file };
  }
  const matches = await findNamedDocumentsInProjectFolder(drive, config, local.googleTitle);
  if (matches.length > 1) throw new Error(`Multiple Google Docs named '${local.googleTitle}' exist in the project folder: ${matches.map(file => file.id).join(", ")}.`);
  return matches.length === 1 ? { action: "update" as const, file: matches[0] } : { action: "create" as const, file: null };
}

function previewFingerprint(targets: PreviewTarget[]) {
  return sha256(JSON.stringify(targets.map(target => ({ registryId: target.registryId, sha256: target.sha256, action: target.action, googleFileId: target.googleFileId }))));
}

export function publicationPreviewForLog(preview: PublicationPreview) {
  return { ...preview, targets: preview.targets.map(({ googleFileId: _googleFileId, ...target }) => target) };
}

export async function buildPublicationPreview(): Promise<PublicationPreview> {
  const config = loadConfig();
  const { drive } = await publicationServices();
  const folder = await getProjectFolder(drive, config);
  if (folder.capabilities?.canEdit !== true) throw new Error("Project folder is not editable by the authorized account.");
  const locals = analyzeLocalPublicationDocuments();
  if (locals.length !== 3) throw new Error(`Publication must contain exactly three documents; got ${locals.length}.`);
  const targets: PreviewTarget[] = [];
  for (const local of locals) {
    const remote = await resolveRemoteFile(drive, config, local);
    const { source: _source, parsed: _parsed, registeredGoogleFileId: _registered, ...safe } = local;
    targets.push({ ...safe, action: remote.action, googleFileId: remote.file?.id ?? null, googleFileIdMasked: maskId(remote.file?.id ?? null), folderCheck: "passed", warnings: local.status === "research" ? ["CAPEX remains research; publication does not approve its content."] : [] });
  }
  const preview: PublicationPreview = { previewId: previewFingerprint(targets), createdAt: new Date().toISOString(), folderName: config.projectFolderName, folderCheck: "passed", decisionId: PUBLICATION_DECISION_ID, targets };
  writeSecretJson(previewPath, preview);
  console.log(JSON.stringify(publicationPreviewForLog(preview), null, 2));
  return preview;
}

type PlannedParagraph = {
  startIndex: number;
  endIndex: number;
  block: Extract<MarkdownBlock, { type: "paragraph" }>;
};

function initialDocumentPlan(parsed: ParsedMarkdown) {
  let text = "";
  let index = 1;
  const paragraphs: PlannedParagraph[] = [];
  const tables: Array<{ placeholder: string; block: Extract<MarkdownBlock, { type: "table" }> }> = [];
  for (const block of parsed.blocks) {
    if (block.type === "table") {
      const placeholder = `[[KOLOBO_TABLE_${tables.length}]]`;
      if (semanticSegments(parsed).includes(placeholder)) throw new Error("Table placeholder collides with source text.");
      text += `${placeholder}\n`;
      index += placeholder.length + 1;
      tables.push({ placeholder, block });
      continue;
    }
    const startIndex = index;
    text += `${block.text}\n`;
    index += block.text.length + 1;
    paragraphs.push({ startIndex, endIndex: index, block });
  }
  return { text, paragraphs, tables };
}

function headingStyle(level: number) {
  if (level === 1) return "TITLE";
  return `HEADING_${Math.min(level - 1, 6)}`;
}

function contentRequests(plan: ReturnType<typeof initialDocumentPlan>, currentEndIndex: number): docs_v1.Schema$Request[] {
  const requests: docs_v1.Schema$Request[] = [];
  if (currentEndIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: currentEndIndex - 1 } } });
  requests.push({ insertText: { location: { index: 1 }, text: plan.text } });
  if (plan.text.length) requests.push({ updateTextStyle: { range: { startIndex: 1, endIndex: 1 + plan.text.length }, textStyle: { weightedFontFamily: { fontFamily: "Arial" }, fontSize: { magnitude: 11, unit: "PT" } }, fields: "weightedFontFamily,fontSize" } });
  for (const paragraph of plan.paragraphs) {
    const { block, startIndex, endIndex } = paragraph;
    if (block.headingLevel) requests.push({ updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: { namedStyleType: headingStyle(block.headingLevel) }, fields: "namedStyleType" } });
    if (block.list) requests.push({ createParagraphBullets: { range: { startIndex, endIndex }, bulletPreset: block.list === "bullet" ? "BULLET_DISC_CIRCLE_SQUARE" : "NUMBERED_DECIMAL_NESTED" } });
    if (block.quote) requests.push({ updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: { indentStart: { magnitude: 18, unit: "PT" }, indentFirstLine: { magnitude: 18, unit: "PT" } }, fields: "indentStart,indentFirstLine" } });
    if (block.codeBlock && block.text.length) requests.push({ updateTextStyle: { range: { startIndex, endIndex: startIndex + block.text.length }, textStyle: { weightedFontFamily: { fontFamily: "Roboto Mono" } }, fields: "weightedFontFamily" } });
    if (block.horizontalRule) requests.push({ updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: { borderBottom: { color: { color: { rgbColor: { red: 0.75, green: 0.75, blue: 0.75 } } }, width: { magnitude: 1, unit: "PT" }, padding: { magnitude: 3, unit: "PT" }, dashStyle: "SOLID" } }, fields: "borderBottom" } });
    for (const mark of block.marks) {
      if (mark.end <= mark.start) continue;
      const textStyle: docs_v1.Schema$TextStyle = {};
      const fields: string[] = [];
      if (mark.bold) { textStyle.bold = true; fields.push("bold"); }
      if (mark.italic) { textStyle.italic = true; fields.push("italic"); }
      if (mark.code) { textStyle.weightedFontFamily = { fontFamily: "Roboto Mono" }; fields.push("weightedFontFamily"); }
      if (mark.linkUrl) { textStyle.link = { url: mark.linkUrl }; fields.push("link"); }
      if (fields.length) requests.push({ updateTextStyle: { range: { startIndex: startIndex + mark.start, endIndex: startIndex + mark.end }, textStyle, fields: fields.join(",") } });
    }
  }
  return requests;
}

function bodyEndIndex(document: docs_v1.Schema$Document) {
  const content = document.body?.content ?? [];
  return content.length ? content[content.length - 1].endIndex ?? 2 : 2;
}

function findInsertedTable(document: docs_v1.Schema$Document, insertionIndex: number) {
  const candidates = (document.body?.content ?? []).filter(item => item.table && typeof item.startIndex === "number" && item.startIndex >= insertionIndex && item.startIndex <= insertionIndex + 2);
  if (candidates.length !== 1) throw new Error(`Expected one inserted table near index ${insertionIndex}; found ${candidates.length}.`);
  return candidates[0];
}

async function replaceTablePlaceholders(docs: docs_v1.Docs, documentId: string, tables: ReturnType<typeof initialDocumentPlan>["tables"]) {
  for (const tablePlan of [...tables].reverse()) {
    const before = await getDocumentResource(docs, documentId);
    const range = locateUniqueTextRange(before, tablePlan.placeholder);
    const rows = tablePlan.block.rows.length;
    const columns = tablePlan.block.rows[0]?.length ?? 0;
    if (!rows || !columns) throw new Error("Cannot publish an empty table.");
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: [
      { deleteContentRange: { range } },
      { insertTable: { rows, columns, location: { index: range.startIndex } } },
    ] } });
    const withTable = await getDocumentResource(docs, documentId);
    const inserted = findInsertedTable(withTable, range.startIndex);
    const cells = (inserted.table?.tableRows ?? []).flatMap(row => row.tableCells ?? []);
    if (cells.length !== rows * columns) throw new Error("Google Docs returned an unexpected table shape.");
    const requests: docs_v1.Schema$Request[] = [];
    for (let cellIndex = cells.length - 1; cellIndex >= 0; cellIndex -= 1) {
      const location = cells[cellIndex].content?.[0]?.startIndex;
      if (typeof location !== "number") throw new Error("Google Docs returned a table cell without an insertion index.");
      const row = Math.floor(cellIndex / columns);
      const column = cellIndex % columns;
      const cell = tablePlan.block.rows[row][column];
      if (!cell.text) continue;
      requests.push({ insertText: { location: { index: location }, text: cell.text } });
      const style: docs_v1.Schema$TextStyle = {};
      const fields: string[] = [];
      if (row === 0) { style.bold = true; fields.push("bold"); }
      if (fields.length) requests.push({ updateTextStyle: { range: { startIndex: location, endIndex: location + cell.text.length }, textStyle: style, fields: fields.join(",") } });
    }
    if (requests.length) await docs.documents.batchUpdate({ documentId, requestBody: { requests } });
  }
}

function paragraphText(paragraph: docs_v1.Schema$Paragraph | undefined) {
  return (paragraph?.elements ?? []).map(element => element.textRun?.content ?? "").join("").replace(/\n+$/, "");
}

export function documentSemanticSegments(document: docs_v1.Schema$Document) {
  const segments: string[] = [];
  for (const item of document.body?.content ?? []) {
    if (item.paragraph) for (const line of paragraphText(item.paragraph).split("\n")) if (line) segments.push(line);
    if (item.table) for (const row of item.table.tableRows ?? []) for (const cell of row.tableCells ?? []) {
      const value = (cell.content ?? []).map(content => paragraphText(content.paragraph)).join("\n").replace(/\n+$/, "");
      if (value) segments.push(value);
    }
  }
  return segments;
}

function documentTableCount(document: docs_v1.Schema$Document) { return (document.body?.content ?? []).filter(item => item.table).length; }
function documentHeadingCount(document: docs_v1.Schema$Document) { return (document.body?.content ?? []).filter(item => /^TITLE$|^HEADING_[1-6]$/.test(item.paragraph?.paragraphStyle?.namedStyleType ?? "")).length; }

export function validatePublishedDocument(local: LocalPublicationDocument, document: docs_v1.Schema$Document) {
  const expected = semanticSegments(local.parsed);
  const actual = documentSemanticSegments(document);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const mismatch = Math.max(0, expected.findIndex((value, index) => actual[index] !== value));
    throw new Error(`${local.registryId} readback text differs at segment ${mismatch + 1}: expected ${JSON.stringify(expected[mismatch])}, got ${JSON.stringify(actual[mismatch])}.`);
  }
  if (documentTableCount(document) !== local.tableCount) throw new Error(`${local.registryId} table count differs after readback.`);
  if (documentHeadingCount(document) !== local.headingCount) throw new Error(`${local.registryId} heading count differs after readback.`);
  const joined = actual.join("\n");
  const target = PROJECT_DOCUMENT_TARGETS.find(item => item.registryId === local.registryId)!;
  for (const id of target.requiredIds) if (!joined.includes(id)) throw new Error(`${local.registryId} readback is missing ${id}.`);
  if (local.registryId === "DOC-BUSINESS-MODEL-ARCHITECTURE" && (!joined.includes("на транспортных маршрутах, фудкортах и в других форматах") || joined.includes("автозаправочных станциях"))) throw new Error("Business Model Architecture readback failed the approved wording check.");
  if (local.registryId === "DOC-CAPEX-EQUIPMENT-SPECIFICATION" && (/[0-9]\s*(?:₽|руб(?:\.|лей|ля)?|RUB|USD|EUR)/u.test(joined) || joined.includes("Итого CAPEX:"))) throw new Error("CAPEX readback contains a price or total CAPEX value.");
  return { validationStatus: "passed" as const, sectionCount: local.sectionCount, tableCount: local.tableCount };
}

async function guardCommentsBeforeUpdate(drive: drive_v3.Drive, fileId: string) {
  const response = await drive.comments.list({ fileId, fields: "comments(id,deleted,resolved)", includeDeleted: false, pageSize: 100 });
  const comments = response.data.comments ?? [];
  if (comments.length) throw new Error(`Refusing to replace a Google Doc that has ${comments.length} manual comment(s).`);
}

async function createRemoteDocument(drive: drive_v3.Drive, config: GoogleConfig, title: string): Promise<DriveFile> {
  const result = await drive.files.create({ requestBody: { name: title, mimeType: DOC_MIME, parents: [requireProjectFolder(config)] }, fields: "id,name,mimeType,parents,trashed,capabilities(canEdit,canDelete),webViewLink", supportsAllDrives: true });
  if (!result.data.id || !result.data.name || !result.data.mimeType) throw new Error("Drive API did not return complete metadata for a created Google Doc.");
  return assertFileInProjectFolder({ id: result.data.id, name: result.data.name, mimeType: result.data.mimeType, parents: result.data.parents ?? [], trashed: result.data.trashed ?? false, capabilities: result.data.capabilities ?? undefined, webViewLink: result.data.webViewLink ?? undefined }, config);
}

async function publishContent(docs: docs_v1.Docs, documentId: string, parsed: ParsedMarkdown) {
  const before = await getDocumentResource(docs, documentId);
  const plan = initialDocumentPlan(parsed);
  const requests = contentRequests(plan, bodyEndIndex(before));
  for (let index = 0; index < requests.length; index += 400) await docs.documents.batchUpdate({ documentId, requestBody: { requests: requests.slice(index, index + 400) } });
  await replaceTablePlaceholders(docs, documentId, plan.tables);
  return getDocumentResource(docs, documentId);
}

function requirePublicationDecision() {
  const decision = readDecisionsRegistry().find(item => item.id === PUBLICATION_DECISION_ID);
  if (!decision || decision.status !== "approved") throw new Error(`${PUBLICATION_DECISION_ID} must be an approved registry decision before Google apply.`);
  const expected = PROJECT_DOCUMENT_TARGETS.map(target => target.registryId).sort();
  if (JSON.stringify([...decision.affected_documents].sort()) !== JSON.stringify(expected)) throw new Error(`${PUBLICATION_DECISION_ID} affected_documents must contain exactly the three publication targets.`);
}

export async function applyPublication(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== PUBLICATION_DECISION_ID) throw new Error(`Apply requires --apply --decision ${PUBLICATION_DECISION_ID}.`);
  requirePublicationDecision();
  if (!fs.existsSync(previewPath)) throw new Error("Publication preview not found. Run google:publish:preview first.");
  const saved = JSON.parse(fs.readFileSync(previewPath, "utf8")) as PublicationPreview;
  const current = await buildPublicationPreview();
  if (saved.previewId !== current.previewId) throw new Error("Publication state changed after preview; review a new preview before apply.");
  if (current.targets.length !== 3) throw new Error("Apply must contain exactly three targets.");

  const config = loadConfig();
  const locals = analyzeLocalPublicationDocuments();
  const { drive, docs } = await publicationServices();
  await getProjectFolder(drive, config);
  const receipts: PublicationReceipt[] = [];

  for (const preview of current.targets) {
    const local = locals.find(item => item.registryId === preview.registryId)!;
    let file: DriveFile;
    if (preview.action === "create") file = await createRemoteDocument(drive, config, local.googleTitle);
    else {
      if (!preview.googleFileId) throw new Error(`${preview.registryId} update has no Google file ID.`);
      file = await assertKnownFile(drive, preview.googleFileId, config);
      await guardCommentsBeforeUpdate(drive, file.id);
    }
    if (file.name !== local.googleTitle || file.mimeType !== DOC_MIME) throw new Error(`${local.registryId} Google target failed title/MIME validation.`);
    const readback = await publishContent(docs, file.id, local.parsed);
    const validation = validatePublishedDocument(local, readback);
    const verified = await assertKnownFile(drive, file.id, config);
    if (!verified.webViewLink) throw new Error(`${local.registryId} has no webViewLink after publication.`);
    receipts.push({ registryId: local.registryId, localPath: local.localPath, localSha256: local.sha256, googleFileId: verified.id, googleMimeType: verified.mimeType, googleTitle: verified.name, webViewLink: verified.webViewLink, syncedAt: new Date().toISOString(), action: preview.action, readback: "passed", sectionCount: validation.sectionCount, tableCount: validation.tableCount, validationStatus: "passed" });
    writeSecretJson(resultPath, { decisionId: PUBLICATION_DECISION_ID, folderName: config.projectFolderName, receipts });
  }

  const folder = await getProjectFolder(drive, config);
  if (!folder.webViewLink) throw new Error("Project folder has no webViewLink.");
  const result = { decisionId: PUBLICATION_DECISION_ID, folderName: config.projectFolderName, folderWebViewLink: folder.webViewLink, receipts };
  writeSecretJson(resultPath, result);
  console.log(JSON.stringify(result, null, 2));
  return result;
}
