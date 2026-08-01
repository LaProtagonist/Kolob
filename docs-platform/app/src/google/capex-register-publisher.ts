import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, type drive_v3, type sheets_v4 } from "googleapis";
import YAML from "yaml";
import {
  CAPEX_REGISTER_DECISION_ID,
  CAPEX_REGISTER_DOCUMENT_ID,
  CAPEX_REGISTER_ITERATION_ID,
  EQUIPMENT_COLUMNS,
  readRegister,
  registerStatistics,
  serializeRegister,
  sha256,
  validateRegister,
  type CapexRegister,
} from "../capex/register.js";
import { getAuthorizedClient } from "./auth.js";
import { loadConfig, platformRoot, writeSecretJson } from "./config.js";
import { assertKnownFile, findNamedSpreadsheetsInProjectFolder, getProjectFolder } from "./drive.js";
import { requireProjectFolder } from "./guard.js";
import { SHEET_MIME, type DriveFile, type GoogleConfig } from "./types.js";

export const CAPEX_REGISTER_GOOGLE_TITLE = "03 — CAPEX — Реестр оснащения пилотного объекта";
export const CAPEX_REGISTER_SHEET_NAMES = ["README", "EQUIPMENT", "OPEN_PARAMETERS", "MISSING_SECTIONS", "DICTIONARIES"] as const;
const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "capex-register-sheet-preview.json");
const runtimeResultPath = path.join(platformRoot, ".runtime", "capex-register-sheet-result.json");
export const capexSheetReceiptPath = path.join(platformRoot, "changelog", "google-sync", "2026-08-01-DOC-CAPEX-EQUIPMENT-REGISTER.yaml");

type Matrix = Array<Array<string | number | boolean>>;
type Dataset = { name: typeof CAPEX_REGISTER_SHEET_NAMES[number]; headers?: string[]; values: Matrix };
type SheetPreview = {
  preview_id: string;
  created_at: string;
  registry_id: typeof CAPEX_REGISTER_DOCUMENT_ID;
  google_title: typeof CAPEX_REGISTER_GOOGLE_TITLE;
  folder_name: string;
  folder_check: "passed";
  action: "create" | "update";
  google_file_id: string | null;
  google_file_id_masked: string;
  decision_id: typeof CAPEX_REGISTER_DECISION_ID;
  iteration_id: typeof CAPEX_REGISTER_ITERATION_ID;
  source_yaml_path: string;
  source_yaml_sha256: string;
  source_record_count: number;
  mapped_record_count: number;
  unmapped_record_count: number;
  sheets: readonly string[];
  warnings: string[];
};

async function services() {
  const auth = await getAuthorizedClient();
  return { drive: google.drive({ version: "v3", auth }), sheets: google.sheets({ version: "v4", auth }) };
}
function mask(id: string | null) { return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : "pending"; }
function documentsRegistry() { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "documents.yaml"), "utf8"))?.documents ?? []) as Array<{ id: string; google_file_id?: string | null; status: string }> ; }
function approvedDecision() { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"))?.decisions ?? []).some((item: { id: string; status: string }) => item.id === CAPEX_REGISTER_DECISION_ID && item.status === "approved"); }

async function resolveSpreadsheet(drive: drive_v3.Drive, config: GoogleConfig) {
  const registered = documentsRegistry().find(item => item.id === CAPEX_REGISTER_DOCUMENT_ID)?.google_file_id ?? null;
  if (registered) {
    const file = await assertKnownFile(drive, registered, config);
    if (file.name !== CAPEX_REGISTER_GOOGLE_TITLE || file.mimeType !== SHEET_MIME) throw new Error("Registered CAPEX register Google file has the wrong title or MIME type.");
    return { action: "update" as const, file };
  }
  const matches = await findNamedSpreadsheetsInProjectFolder(drive, config, CAPEX_REGISTER_GOOGLE_TITLE);
  return chooseSpreadsheetTarget(matches);
}

export function chooseSpreadsheetTarget(matches: DriveFile[]) {
  if (matches.length > 1) throw new Error(`Multiple spreadsheets named '${CAPEX_REGISTER_GOOGLE_TITLE}' exist in the project folder: ${matches.map(file => file.id).join(", ")}.`);
  return matches.length ? { action: "update" as const, file: matches[0] } : { action: "create" as const, file: null };
}

function sourceDocLink() {
  const id = documentsRegistry().find(item => item.id === "DOC-CAPEX-EQUIPMENT-SPECIFICATION")?.google_file_id;
  if (!id) throw new Error("The source CAPEX specification has no registered Google file ID.");
  return `https://docs.google.com/document/d/${id}/edit`;
}

function matrixValue(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join("; ");
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  return JSON.stringify(value);
}

export function sheetDatasets(register: CapexRegister, syncedAt: string): Dataset[] {
  const yamlHash = sha256(serializeRegister(register));
  const readme: Matrix = [
    ["Поле", "Значение"],
    ["Название", "CAPEX Equipment Register / CAPEX — Реестр оснащения пилотного объекта"],
    ["Версия", register.document.version],
    ["Статус", register.document.status],
    ["Локальный source file", "docs-platform/working/capex-equipment-register.yaml"],
    ["SHA-256 YAML", yamlHash],
    ["Дата синхронизации UTC", syncedAt],
    ["Source record count", register.document.source_record_count],
    ["Mapped record count", register.document.mapped_record_count],
    ["Unmapped record count", register.document.unmapped_record_count],
    ["Исходная текстовая спецификация", sourceDocLink()],
    ["Предупреждение", "Цены, конкретные модели, поставщики и итоговый CAPEX пока не определены. 124 — количество исходных записей, а не самостоятельных закупочных единиц."],
    ["Правило изменения", "Изменения выполняются только через proposal, approved decision, preview, apply, verification и append-only timeline; CSV и Google Sheet генерируются из YAML."],
    ["Ручные комментарии", "Допускаются Google comments/notes. Publisher обновляет значения, не удаляет комментарии и сохраняет стабильный порядок item_id."],
  ];
  const equipment: Matrix = [EQUIPMENT_COLUMNS.map(String), ...register.equipment.map(item => EQUIPMENT_COLUMNS.map(column => matrixValue(item[column])))];
  const openHeaders = ["parameter_id", "item_id", "module_id", "parameter", "reason", "required_before", "status", "notes"];
  const open: Matrix = [openHeaders, ...register.open_parameters.map(item => openHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  const missingHeaders = ["section_id", "name", "status", "dependencies", "notes"];
  const missing: Matrix = [missingHeaders, ...register.missing_sections.map(item => missingHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  const dictionaryHeaders = ["dictionary", "value", "description"];
  const dictionaries: Matrix = [dictionaryHeaders, ...register.dictionaries.map(item => dictionaryHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  return [
    { name: "README", values: readme },
    { name: "EQUIPMENT", headers: EQUIPMENT_COLUMNS.map(String), values: equipment },
    { name: "OPEN_PARAMETERS", headers: openHeaders, values: open },
    { name: "MISSING_SECTIONS", headers: missingHeaders, values: missing },
    { name: "DICTIONARIES", headers: dictionaryHeaders, values: dictionaries },
  ];
}

function previewFingerprint(preview: Omit<SheetPreview, "preview_id" | "created_at" | "google_file_id_masked">) { return crypto.createHash("sha256").update(JSON.stringify(preview)).digest("hex"); }
export function sheetPreviewForLog(preview: SheetPreview) { const { google_file_id: _id, ...safe } = preview; return safe; }

async function computePreview() {
  const register = readRegister();
  const errors = validateRegister(register);
  if (errors.length) throw new Error(errors.join("\n"));
  const config = loadConfig();
  const { drive } = await services();
  const folder = await getProjectFolder(drive, config);
  if (folder.capabilities?.canEdit !== true) throw new Error("Project folder is not editable by the authorized account.");
  const remote = await resolveSpreadsheet(drive, config);
  const base: Omit<SheetPreview, "preview_id" | "created_at" | "google_file_id_masked"> = {
    registry_id: CAPEX_REGISTER_DOCUMENT_ID,
    google_title: CAPEX_REGISTER_GOOGLE_TITLE,
    folder_name: config.projectFolderName,
    folder_check: "passed" as const,
    action: remote.action,
    google_file_id: remote.file?.id ?? null,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    source_yaml_path: "docs-platform/working/capex-equipment-register.yaml",
    source_yaml_sha256: sha256(serializeRegister(register)),
    source_record_count: register.document.source_record_count,
    mapped_record_count: register.document.mapped_record_count,
    unmapped_record_count: register.document.unmapped_record_count,
    sheets: CAPEX_REGISTER_SHEET_NAMES,
    warnings: ["Register remains research; publication does not approve equipment, models, quantities, suppliers, prices or total CAPEX."],
  };
  const preview: SheetPreview = { ...base, preview_id: previewFingerprint(base), created_at: new Date().toISOString(), google_file_id_masked: mask(base.google_file_id) };
  return { preview, register };
}

export async function previewCapexRegisterSheet() {
  const { preview } = await computePreview();
  writeSecretJson(runtimePreviewPath, preview);
  console.log(JSON.stringify(sheetPreviewForLog(preview), null, 2));
  return preview;
}

async function createSpreadsheet(drive: drive_v3.Drive, config: GoogleConfig): Promise<DriveFile> {
  const result = await drive.files.create({ requestBody: { name: CAPEX_REGISTER_GOOGLE_TITLE, mimeType: SHEET_MIME, parents: [requireProjectFolder(config)] }, fields: "id,name,mimeType,parents,trashed,capabilities(canEdit,canDelete),webViewLink", supportsAllDrives: true });
  if (!result.data.id || !result.data.name || !result.data.mimeType) throw new Error("Drive API returned incomplete spreadsheet metadata.");
  return { id: result.data.id, name: result.data.name, mimeType: result.data.mimeType, parents: result.data.parents ?? [], trashed: result.data.trashed ?? false, capabilities: result.data.capabilities ?? undefined, webViewLink: result.data.webViewLink ?? undefined };
}

async function ensureSheets(sheets: sheets_v4.Sheets, spreadsheetId: string, allowInitialRename: boolean) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title))" })).data;
  const existing = metadata.sheets ?? [];
  const titles = existing.map(sheet => sheet.properties?.title).filter(Boolean) as string[];
  const initialTitle = allowInitialRename && titles.length === 1 && !CAPEX_REGISTER_SHEET_NAMES.includes(titles[0] as typeof CAPEX_REGISTER_SHEET_NAMES[number]) ? titles[0] : null;
  const extras = titles.filter(title => !CAPEX_REGISTER_SHEET_NAMES.includes(title as typeof CAPEX_REGISTER_SHEET_NAMES[number]) && title !== initialTitle);
  if (extras.length) throw new Error(`Spreadsheet contains unexpected sheets and will not be modified automatically: ${extras.join(", ")}.`);
  const requests: sheets_v4.Schema$Request[] = [];
  if (initialTitle) requests.push({ updateSheetProperties: { properties: { sheetId: existing[0].properties?.sheetId, title: "README" }, fields: "title" } });
  const effectiveTitles = initialTitle ? ["README"] : titles;
  for (const title of CAPEX_REGISTER_SHEET_NAMES) if (!effectiveTitles.includes(title)) requests.push({ addSheet: { properties: { title } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const result = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title))" })).data;
  const finalTitles = (result.sheets ?? []).map(sheet => sheet.properties?.title).filter(Boolean);
  if (JSON.stringify([...finalTitles].sort()) !== JSON.stringify([...CAPEX_REGISTER_SHEET_NAMES].sort())) throw new Error("Spreadsheet sheet set differs from the five-sheet publication contract.");
  return new Map((result.sheets ?? []).map(sheet => [sheet.properties!.title!, sheet.properties!.sheetId!]));
}

function columnIndex(headers: string[], name: string) { const index = headers.indexOf(name); if (index < 0) throw new Error(`Missing spreadsheet column ${name}.`); return index; }
function formattingRequests(sheetIds: Map<string, number>, datasets: Dataset[]): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];
  for (const dataset of datasets) {
    const sheetId = sheetIds.get(dataset.name)!;
    const rows = dataset.values.length;
    const columns = Math.max(...dataset.values.map(row => row.length));
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: dataset.name === "README" ? 1 : 1 } }, fields: "gridProperties.frozenRowCount" } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columns }, cell: { userEnteredFormat: { backgroundColor: { red: 0.11, green: 0.31, blue: 0.27 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)" } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns }, cell: { userEnteredFormat: { verticalAlignment: "TOP", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(verticalAlignment,wrapStrategy)" } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columns }, properties: { pixelSize: dataset.name === "README" ? 300 : 150 }, fields: "pixelSize" } });
    if (dataset.name === "README") requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 220 }, fields: "pixelSize" } });
    if (dataset.name === "EQUIPMENT") {
      requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns } } } });
      const headers = dataset.headers!;
      for (const name of ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max", "source_item_number"]) {
        const index = columnIndex(headers, name);
        requests.push({ repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0.###" } } }, fields: "userEnteredFormat.numberFormat" } });
      }
      const validations: Array<[string, readonly string[]]> = [
        ["record_type", ["equipment", "system", "component", "accessory", "inventory", "furniture", "engineering_connection", "installation_service", "consumable", "software", "open_question"]],
        ["inclusion_status", ["standalone", "included_in_parent", "purchased_separately", "tbd"]],
        ["requirement", ["required", "optional", "conditional", "tbd"]],
        ["lifecycle_status", ["research", "proposed", "approved", "superseded", "rejected"]],
        ["procurement_mode", ["purchase", "existing", "repair", "retrofit", "lease", "supplier_provided", "tbd"]],
      ];
      for (const [name, values] of validations) {
        const index = columnIndex(headers, name);
        requests.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: rows, startColumnIndex: index, endColumnIndex: index + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: values.map(value => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true } } });
      }
    }
  }
  return requests;
}

function normalizedRows(values: unknown[][] | undefined, expected: Matrix) {
  return expected.map((row, rowIndex) => row.map((_value, columnIndex) => matrixValue(values?.[rowIndex]?.[columnIndex])));
}
function matricesHash(datasets: Dataset[]) { return sha256(JSON.stringify(Object.fromEntries(datasets.map(dataset => [dataset.name, dataset.values])))); }

async function publishAndReadback(drive: drive_v3.Drive, sheets: sheets_v4.Sheets, file: DriveFile, register: CapexRegister, syncedAt: string, created: boolean) {
  const sheetIds = await ensureSheets(sheets, file.id, created);
  const datasets = sheetDatasets(register, syncedAt);
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: file.id, requestBody: { ranges: CAPEX_REGISTER_SHEET_NAMES.map(name => `'${name}'!A:AP`) } });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: file.id, requestBody: { valueInputOption: "RAW", data: datasets.map(dataset => ({ range: `'${dataset.name}'!A1`, majorDimension: "ROWS", values: dataset.values })) } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: file.id, requestBody: { requests: formattingRequests(sheetIds, datasets) } });
  const ranges = datasets.map(dataset => `'${dataset.name}'!A1:${columnLetter(Math.max(...dataset.values.map(row => row.length)))}${dataset.values.length}`);
  const readback = await sheets.spreadsheets.values.batchGet({ spreadsheetId: file.id, ranges, majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" });
  const actualDatasets = datasets.map((dataset, index) => ({ ...dataset, values: normalizedRows(readback.data.valueRanges?.[index]?.values as unknown[][] | undefined, dataset.values) }));
  for (let index = 0; index < datasets.length; index += 1) if (JSON.stringify(actualDatasets[index].values) !== JSON.stringify(datasets[index].values)) throw new Error(`${datasets[index].name} Google Sheets readback differs from the local dataset.`);
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId: file.id, fields: "sheets(properties(sheetId,title,gridProperties(frozenRowCount)),basicFilter)" })).data;
  const titleSet = (metadata.sheets ?? []).map(sheet => sheet.properties?.title).filter(Boolean).sort();
  if (JSON.stringify(titleSet) !== JSON.stringify([...CAPEX_REGISTER_SHEET_NAMES].sort())) throw new Error("Google Sheets readback has an unexpected sheet set.");
  for (const sheet of metadata.sheets ?? []) if ((sheet.properties?.title !== "README" && sheet.properties?.gridProperties?.frozenRowCount !== 1)) throw new Error(`${sheet.properties?.title} does not have a frozen header row.`);
  if (!(metadata.sheets ?? []).find(sheet => sheet.properties?.title === "EQUIPMENT")?.basicFilter) throw new Error("EQUIPMENT basic filter is missing after readback.");
  const verified = await assertKnownFile(drive, file.id, loadConfig());
  if (!verified.webViewLink || verified.mimeType !== SHEET_MIME) throw new Error("Published spreadsheet failed Drive metadata verification.");
  return { verified, datasets, readback_hash: matricesHash(actualDatasets) };
}

function columnLetter(count: number) {
  let value = count;
  let result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}

async function commentIds(drive: drive_v3.Drive, fileId: string) {
  const response = await drive.comments.list({ fileId, fields: "comments(id,deleted,resolved)", includeDeleted: false, pageSize: 100 });
  return (response.data.comments ?? []).map(comment => comment.id).filter(Boolean).sort();
}

export async function applyCapexRegisterSheet(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== CAPEX_REGISTER_DECISION_ID) throw new Error(`Apply requires --apply --decision ${CAPEX_REGISTER_DECISION_ID}.`);
  if (!approvedDecision()) throw new Error(`${CAPEX_REGISTER_DECISION_ID} must be approved before Google apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Google Sheet preview is missing. Run capex:sheet:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8")) as SheetPreview;
  const { preview, register } = await computePreview();
  if (saved.preview_id !== preview.preview_id) throw new Error("Google Sheet state or local register changed after preview.");
  const config = loadConfig();
  const { drive, sheets } = await services();
  await getProjectFolder(drive, config);
  let file: DriveFile;
  if (preview.action === "create") file = await createSpreadsheet(drive, config);
  else {
    if (!preview.google_file_id) throw new Error("Update preview has no spreadsheet ID.");
    file = await assertKnownFile(drive, preview.google_file_id, config);
  }
  const commentsBefore = await commentIds(drive, file.id);
  const syncedAt = new Date().toISOString();
  file = await assertKnownFile(drive, file.id, config);
  const result = await publishAndReadback(drive, sheets, file, register, syncedAt, preview.action === "create");
  const commentsAfter = await commentIds(drive, file.id);
  if (JSON.stringify(commentsBefore) !== JSON.stringify(commentsAfter)) throw new Error("Drive comments changed during Google Sheet publication.");
  const statistics = registerStatistics(register);
  const receipt = {
    receipt_version: 1,
    registry_id: CAPEX_REGISTER_DOCUMENT_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    change_set_id: "CHG-012",
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    local_path: "docs-platform/working/capex-equipment-register.yaml",
    local_sha256: sha256(serializeRegister(register)),
    google_file_id: result.verified.id,
    google_mime_type: result.verified.mimeType,
    google_title: result.verified.name,
    web_view_link: result.verified.webViewLink,
    synced_at: syncedAt,
    action: preview.action,
    source_status: "research",
    source_version: "0.1",
    sheets: CAPEX_REGISTER_SHEET_NAMES,
    source_record_count: statistics.source_record_count,
    mapped_record_count: statistics.mapped_record_count,
    unmapped_record_count: statistics.unmapped_record_count,
    readback_hash: result.readback_hash,
    readback: "passed",
    comments_preserved: true,
    validation_status: "passed",
    validation: { folder_guard: "passed", stable_item_order: "passed", native_google_sheet: true, numeric_tbd_absent: true, prices_absent: true, total_capex_absent: true },
  };
  fs.mkdirSync(path.dirname(capexSheetReceiptPath), { recursive: true });
  fs.writeFileSync(capexSheetReceiptPath, YAML.stringify(receipt, { lineWidth: 0 }));
  writeSecretJson(runtimeResultPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}
