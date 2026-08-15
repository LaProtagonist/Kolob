import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, type drive_v3, type sheets_v4 } from "googleapis";
import YAML from "yaml";
import { FINANCIAL_MODEL_PATH, readFinancialModel, validateFinancialModel } from "../financial/financial-model.js";
import {
  FINANCIAL_SHEET_PAYLOAD_PATH,
  buildFinancialGoogleSheetsPayload,
  checkFinancialGoogleSheetsPayload,
  type FinancialSheet,
  type SheetValue,
} from "../financial/google-sheet.js";
import { sha256 } from "../governance/util.js";
import { getAuthorizedClient } from "./auth.js";
import { loadConfig, platformRoot, writeSecretJson } from "./config.js";
import {
  asDriveFile,
  assertKnownFile,
  driveFileFields,
  findNamedSpreadsheetsInProjectFolder,
  getProjectFolder,
} from "./drive.js";
import { requireProjectFolder } from "./guard.js";
import { SHEET_MIME, type DriveFile, type GoogleConfig } from "./types.js";

export const FINANCIAL_MODEL_DOCUMENT_ID = "DOC-FINANCIAL-MODEL";
export const FINANCIAL_MODEL_DECISION_ID = "DEC-FINANCIAL-MODEL-2026-08-16-01";
export const FINANCIAL_MODEL_CHANGE_SET_ID = "CHG-FINANCIAL-MODEL-2026-08-16-01";
export const FINANCIAL_MODEL_ITERATION_ID = "ITR-FINANCIAL-MODEL-2026-08-16-01";
export const FINANCIAL_MODEL_GOOGLE_TITLE = "04 — Финансовая модель пилотного объекта";
export const FINANCIAL_FORMULA_INPUT_LOCALE = "en_US";

const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "financial-model-sheet-preview.json");
const runtimeCreationPath = path.join(platformRoot, ".runtime", "financial-model-sheet-created.json");
const runtimeResultPath = path.join(platformRoot, ".runtime", "financial-model-sheet-result.json");

type Target = { action: "create"; file: null } | { action: "reuse"; file: DriveFile };
type Preview = {
  preview_id: string;
  created_at: string;
  registry_id: typeof FINANCIAL_MODEL_DOCUMENT_ID;
  decision_id: typeof FINANCIAL_MODEL_DECISION_ID;
  change_set_id: typeof FINANCIAL_MODEL_CHANGE_SET_ID;
  iteration_id: typeof FINANCIAL_MODEL_ITERATION_ID;
  google_title: typeof FINANCIAL_MODEL_GOOGLE_TITLE;
  folder_name: string;
  folder_check: "passed";
  action: Target["action"];
  google_file_id: string | null;
  google_file_id_masked: string | null;
  local_path: typeof FINANCIAL_MODEL_PATH;
  local_source_sha256: string;
  payload_path: typeof FINANCIAL_SHEET_PAYLOAD_PATH;
  payload_sha256: string;
  content_state_sha256: string;
  sheet_names: string[];
  warnings: string[];
};

type Matrix = SheetValue[][];

function services() {
  return getAuthorizedClient().then(auth => ({
    drive: google.drive({ version: "v3", auth }),
    sheets: google.sheets({ version: "v4", auth }),
  }));
}

function documentsRegistry() {
  return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "documents.yaml"), "utf8"))?.documents ?? []) as Array<{ id: string; google_file_id?: string | null }>;
}

function approvedDecision() {
  return ((YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"))?.decisions ?? []) as Array<{ id: string; status: string }>).some(item => item.id === FINANCIAL_MODEL_DECISION_ID && item.status === "approved");
}

function creationFileId() {
  if (!fs.existsSync(runtimeCreationPath)) return null;
  const value = JSON.parse(fs.readFileSync(runtimeCreationPath, "utf8"));
  return value.iteration_id === FINANCIAL_MODEL_ITERATION_ID && typeof value.google_file_id === "string" ? value.google_file_id : null;
}

function mask(id: string | null) {
  return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : null;
}

function fingerprint(value: Omit<Preview, "preview_id" | "created_at" | "google_file_id_masked">) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function chooseFinancialSpreadsheetTarget(matches: DriveFile[], linkedFileId: string | null): Target {
  if (matches.length > 1) throw new Error(`Multiple spreadsheets named '${FINANCIAL_MODEL_GOOGLE_TITLE}' exist in the project folder: ${matches.map(file => file.id).join(", ")}. Refusing to create or overwrite.`);
  if (linkedFileId) {
    if (matches.length !== 1 || matches[0].id !== linkedFileId) throw new Error("The linked Financial Model Sheet does not match the unique title-scoped file in the project folder.");
    return { action: "reuse", file: matches[0] };
  }
  if (matches.length === 1) throw new Error("An unregistered Financial Model Sheet with the target title already exists. Refusing to overwrite it or create a duplicate.");
  return { action: "create", file: null };
}

export function requireFinancialSheetId(sheetId: number | null | undefined, title: string): number {
  if (sheetId === null || sheetId === undefined) throw new Error(`Missing Google Sheet tab ${title}.`);
  return sheetId;
}

async function resolveTarget(drive: drive_v3.Drive, config: GoogleConfig) {
  const registeredId = documentsRegistry().find(item => item.id === FINANCIAL_MODEL_DOCUMENT_ID)?.google_file_id ?? null;
  const linkedFileId = registeredId || creationFileId();
  const matches = await findNamedSpreadsheetsInProjectFolder(drive, config, FINANCIAL_MODEL_GOOGLE_TITLE);
  const target = chooseFinancialSpreadsheetTarget(matches, linkedFileId);
  if (target.file) {
    const file = await assertKnownFile(drive, target.file.id, config);
    if (file.name !== FINANCIAL_MODEL_GOOGLE_TITLE || file.mimeType !== SHEET_MIME) throw new Error("Linked Financial Model Google file has the wrong title or MIME type.");
    return { ...target, file };
  }
  return target;
}

function previewForLog(preview: Preview) {
  const { google_file_id: _id, ...safe } = preview;
  return safe;
}

async function computePreview() {
  const model = readFinancialModel();
  const errors = validateFinancialModel(model);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!approvedDecision()) throw new Error(`${FINANCIAL_MODEL_DECISION_ID} must remain approved before Google publication.`);
  const payloadCheck = checkFinancialGoogleSheetsPayload();
  const payload = buildFinancialGoogleSheetsPayload();
  const config = loadConfig();
  const { drive } = await services();
  const folder = await getProjectFolder(drive, config);
  if (folder.capabilities?.canEdit !== true) throw new Error("Project folder is not editable by the authorized account.");
  const target = await resolveTarget(drive, config);
  const base: Omit<Preview, "preview_id" | "created_at" | "google_file_id_masked"> = {
    registry_id: FINANCIAL_MODEL_DOCUMENT_ID,
    decision_id: FINANCIAL_MODEL_DECISION_ID,
    change_set_id: FINANCIAL_MODEL_CHANGE_SET_ID,
    iteration_id: FINANCIAL_MODEL_ITERATION_ID,
    google_title: FINANCIAL_MODEL_GOOGLE_TITLE,
    folder_name: config.projectFolderName,
    folder_check: "passed",
    action: target.action,
    google_file_id: target.file?.id ?? null,
    local_path: FINANCIAL_MODEL_PATH,
    local_source_sha256: sha256(fs.readFileSync(path.join(projectRoot, FINANCIAL_MODEL_PATH))),
    payload_path: FINANCIAL_SHEET_PAYLOAD_PATH,
    payload_sha256: payloadCheck.sha256,
    content_state_sha256: payload.meta.content_state_sha256,
    sheet_names: payload.sheets.map(sheet => sheet.name),
    warnings: [
      "Creates at most one native Google Sheet in the guarded project folder.",
      "The Sheet is a working representation; Financial Model YAML and imported canonical sources remain authoritative.",
      "No existing Google Docs or CAPEX Sheet are modified.",
    ],
  };
  const preview: Preview = { ...base, preview_id: fingerprint(base), created_at: new Date().toISOString(), google_file_id_masked: mask(base.google_file_id) };
  return { preview, payload, config, target };
}

export async function previewFinancialModelSheet() {
  const { preview } = await computePreview();
  writeSecretJson(runtimePreviewPath, preview);
  console.log(JSON.stringify(previewForLog(preview), null, 2));
  return preview;
}

async function createSpreadsheet(drive: drive_v3.Drive, config: GoogleConfig) {
  const result = await drive.files.create({
    requestBody: { name: FINANCIAL_MODEL_GOOGLE_TITLE, mimeType: SHEET_MIME, parents: [requireProjectFolder(config)] },
    fields: driveFileFields,
    supportsAllDrives: true,
  });
  const file = asDriveFile(result.data);
  writeSecretJson(runtimeCreationPath, {
    iteration_id: FINANCIAL_MODEL_ITERATION_ID,
    decision_id: FINANCIAL_MODEL_DECISION_ID,
    google_file_id: file.id,
    created_at: new Date().toISOString(),
  });
  return file;
}

function maximumColumns(sheet: FinancialSheet) {
  return Math.max(1, ...sheet.values.map(row => row.length));
}

function columnLetter(count: number) {
  let value = count;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function financialFormulaWriteData(contract: FinancialSheet[]) {
  return contract.flatMap(item => item.values.flatMap((row, rowIndex) => row.flatMap((value, columnIndex) => {
    if (typeof value !== "string" || !value.startsWith("=")) return [];
    const cell = `${columnLetter(columnIndex + 1)}${rowIndex + 1}`;
    return [{ range: `'${item.name}'!${cell}`, majorDimension: "ROWS" as const, values: [[value]] }];
  })));
}

async function ensureSheetContract(sheets: sheets_v4.Sheets, spreadsheetId: string, contract: FinancialSheet[]) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const allowed = new Set(contract.map(sheet => sheet.name));
  const existingTitles = metadata.map(sheet => sheet.properties?.title).filter(Boolean) as string[];
  const requests: sheets_v4.Schema$Request[] = [];
  if (metadata.length === 1 && !allowed.has(existingTitles[0])) {
    requests.push({ updateSheetProperties: { properties: { sheetId: metadata[0].properties?.sheetId, title: contract[0].name }, fields: "title" } });
    existingTitles[0] = contract[0].name;
  } else {
    const unexpected = existingTitles.filter(title => !allowed.has(title));
    if (unexpected.length) throw new Error(`Financial Model spreadsheet contains unexpected tabs: ${unexpected.join(", ")}.`);
  }
  for (const item of contract) if (!existingTitles.includes(item.name)) requests.push({ addSheet: { properties: { title: item.name } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const afterAdd = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const reorder: sheets_v4.Schema$Request[] = contract.map((item, index) => {
    const found = afterAdd.find(sheet => sheet.properties?.title === item.name);
    const sheetId = requireFinancialSheetId(found?.properties?.sheetId, item.name);
    return { updateSheetProperties: { properties: { sheetId, index }, fields: "index" } };
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reorder } });
  const final = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const ordered = [...final].sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  const titles = ordered.map(sheet => sheet.properties?.title).filter(Boolean);
  if (JSON.stringify(titles) !== JSON.stringify(contract.map(sheet => sheet.name))) throw new Error("Financial Model Google Sheet tab order differs from the publication contract.");
  return new Map(ordered.map(sheet => [sheet.properties!.title!, sheet.properties!.sheetId!]));
}

function rgb(hex: string) {
  const clean = hex.replace("#", "");
  return { red: parseInt(clean.slice(0, 2), 16) / 255, green: parseInt(clean.slice(2, 4), 16) / 255, blue: parseInt(clean.slice(4, 6), 16) / 255 };
}

function repeat(sheetId: number, startRow: number, endRow: number, startColumn: number, endColumn: number, cell: sheets_v4.Schema$CellData, fields: string): sheets_v4.Schema$Request {
  return { repeatCell: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn }, cell, fields } };
}

function formatRequests(sheetIds: Map<string, number>, contract: FinancialSheet[]) {
  const requests: sheets_v4.Schema$Request[] = [{ updateSpreadsheetProperties: { properties: { locale: "ru_RU", timeZone: "Europe/Moscow" }, fields: "locale,timeZone" } }];
  const formulaGreen = rgb("008000");
  for (const item of contract) {
    const sheetId = sheetIds.get(item.name)!;
    const rows = item.values.length;
    const columns = maximumColumns(item);
    const headerIndex = Math.max(0, item.frozen_rows - 1);
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: item.frozen_rows, frozenColumnCount: item.frozen_columns, hideGridlines: true } }, fields: "gridProperties(frozenRowCount,frozenColumnCount,hideGridlines)" } });
    requests.push(repeat(sheetId, 0, rows, 0, columns, { userEnteredFormat: { textFormat: { fontFamily: "Arial", fontSize: 10 }, verticalAlignment: "TOP", wrapStrategy: "WRAP" } }, "userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)"));
    requests.push(repeat(sheetId, 0, 1, 0, columns, { userEnteredFormat: { backgroundColor: rgb("173B35"), textFormat: { bold: true, fontSize: 14, foregroundColor: rgb("FFFFFF") }, verticalAlignment: "MIDDLE" } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)"));
    if (rows > 1) requests.push(repeat(sheetId, 1, 2, 0, columns, { userEnteredFormat: { backgroundColor: rgb("EEF3F1"), textFormat: { italic: true, foregroundColor: rgb("33433F") }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"));
    if (headerIndex < rows && item.values[headerIndex].length > 1) requests.push(repeat(sheetId, headerIndex, headerIndex + 1, 0, columns, { userEnteredFormat: { backgroundColor: rgb("F2C94C"), textFormat: { bold: true, foregroundColor: rgb("111111") }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP", borders: { bottom: { style: "SOLID_MEDIUM", color: rgb("173B35") } } } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy,borders)"));
    item.column_widths.forEach((width, index) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: Math.max(80, Math.min(width, 760)) }, fields: "pixelSize" } }));
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 38 }, fields: "pixelSize" } });
    for (const [rowIndex, row] of item.values.entries()) {
      let start = -1;
      for (let column = 0; column <= row.length; column += 1) {
        const isFormula = column < row.length && typeof row[column] === "string" && String(row[column]).startsWith("=");
        if (isFormula && start < 0) start = column;
        if (!isFormula && start >= 0) {
          requests.push(repeat(sheetId, rowIndex, rowIndex + 1, start, column, { userEnteredFormat: { textFormat: { foregroundColor: formulaGreen } } }, "userEnteredFormat.textFormat.foregroundColor"));
          start = -1;
        }
      }
      const label = String(row[0] ?? "");
      if (/^(Итого|Валовая прибыль|EBITDA объекта|EBIT$|Operating Free Cash Flow|Free Cash Flow|Cumulative FCF|Restaurant invested capital|Total invested capital|MODEL STATUS)/.test(label)) requests.push(repeat(sheetId, rowIndex, rowIndex + 1, 0, columns, { userEnteredFormat: { textFormat: { bold: true }, borders: { top: { style: "SOLID_MEDIUM", color: rgb("173B35") } } } }, "userEnteredFormat(textFormat.bold,borders.top)"));
    }
  }

  const assumptions = sheetIds.get("02 Допущения")!;
  const assumptionsPayload = contract.find(sheet => sheet.name === "02 Допущения")!;
  assumptionsPayload.values.slice(3).forEach((row, index) => {
    const rowIndex = index + 3;
    const status = String(row[4] ?? "");
    const source = String(row[5] ?? "");
    const comment = String(row[6] ?? "");
    const color = status === "imported_canonical" ? rgb("008000") : rgb("0000FF");
    requests.push(repeat(assumptions, rowIndex, rowIndex + 1, 1, 2, { note: `Status: ${status}\nSource: ${source}${comment ? `\n${comment}` : ""}`, userEnteredFormat: { textFormat: { foregroundColor: color } } }, "note,userEnteredFormat.textFormat.foregroundColor"));
    if (/tbd|requires_confirmation/.test(status)) requests.push(repeat(assumptions, rowIndex, rowIndex + 1, 4, 5, { userEnteredFormat: { backgroundColor: rgb("FFF2CC") } }, "userEnteredFormat.backgroundColor"));
  });

  const checks = sheetIds.get("16 Проверки")!;
  requests.push({ addConditionalFormatRule: { index: 0, rule: { ranges: [{ sheetId: checks, startRowIndex: 3, endRowIndex: 14, startColumnIndex: 3, endColumnIndex: 4 }], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "OK" }] }, format: { backgroundColor: rgb("D9EAD3"), textFormat: { bold: true, foregroundColor: rgb("274E13") } } } } } });
  requests.push({ addConditionalFormatRule: { index: 1, rule: { ranges: [{ sheetId: checks, startRowIndex: 3, endRowIndex: 14, startColumnIndex: 3, endColumnIndex: 4 }], booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: "ERROR" }] }, format: { backgroundColor: rgb("F4CCCC"), textFormat: { bold: true, foregroundColor: rgb("990000") } } } } } });

  const money = { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 [$₽-ru-RU];[Red](#,##0.00 [$₽-ru-RU]);-" }, horizontalAlignment: "RIGHT" };
  const percent = { numberFormat: { type: "PERCENT", pattern: "0.0%;[Red](0.0%);-" }, horizontalAlignment: "RIGHT" };
  const number = { numberFormat: { type: "NUMBER", pattern: "#,##0.00;[Red](#,##0.00);-" }, horizontalAlignment: "RIGHT" };
  const numericBlocks: Array<[string, number, number, number, number, typeof money]> = [
    ["03 Продажи", 3, 6, 2, 7, money], ["04 Меню и себестоимость", 3, 11, 2, 6, money], ["05 Персонал", 3, 14, 4, 11, money],
    ["06 OPEX", 3, 31, 4, 7, money], ["07 CAPEX", 3, 20, 3, 4, money], ["08 P&L", 3, 34, 1, 4, money],
    ["09 Денежный поток", 3, 12, 1, 62, money], ["10 Инвестиции", 3, 13, 1, 2, money], ["13 Недвижимость", 3, 11, 1, 5, money],
  ];
  for (const [name, startRow, endRow, startColumn, endColumn, cell] of numericBlocks) requests.push(repeat(sheetIds.get(name)!, startRow, endRow, startColumn, endColumn, { userEnteredFormat: cell }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(sheetIds.get("08 P&L")!, 3, 34, 4, 7, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  for (const row of [10, 24]) requests.push(repeat(sheetIds.get("08 P&L")!, row, row + 1, 1, 4, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(sheetIds.get("10 Инвестиции")!, 9, 12, 1, 2, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(sheetIds.get("13 Недвижимость")!, 7, 10, 1, 5, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(sheetIds.get("02 Допущения")!, 3, 43, 1, 2, { userEnteredFormat: number }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  return requests;
}

function normalizeRows(values: unknown[][] | undefined, expected: Matrix): Matrix {
  return expected.map((row, rowIndex) => row.map((_value, columnIndex) => {
    const value = values?.[rowIndex]?.[columnIndex];
    if (value === null || value === undefined) return "";
    return ["string", "number", "boolean"].includes(typeof value) ? value as SheetValue : JSON.stringify(value);
  }));
}

export function normalizeFinancialFormulaLocale(value: SheetValue): SheetValue {
  if (typeof value !== "string" || !value.startsWith("=")) return value;
  let probeQuoted = false;
  let localizedSeparators = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (probeQuoted && value[index + 1] === '"') index += 1;
      else probeQuoted = !probeQuoted;
    } else if (!probeQuoted && value[index] === ";") localizedSeparators = true;
  }
  let quoted = false;
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        result += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (localizedSeparators && !quoted && character === "," && /\d/.test(value[index - 1] ?? "") && /\d/.test(value[index + 1] ?? "")) result += ".";
    else result += character === ";" && !quoted ? "," : character;
  }
  return result;
}

function mismatch(expected: Matrix, actual: Matrix) {
  for (let row = 0; row < expected.length; row += 1) for (let column = 0; column < expected[row].length; column += 1) {
    if (JSON.stringify(normalizeFinancialFormulaLocale(expected[row][column])) !== JSON.stringify(normalizeFinancialFormulaLocale(actual[row]?.[column] ?? ""))) return { row: row + 1, column: column + 1, expected: expected[row][column], actual: actual[row]?.[column] };
  }
  return null;
}

function matricesHash(sheets: Array<{ name: string; values: Matrix }>) {
  return sha256(JSON.stringify(Object.fromEntries(sheets.map(sheet => [sheet.name, sheet.values]))));
}

export function validateFinancialSheetReadback(expected: FinancialSheet[], actual: Array<{ name: string; values: Matrix }>, titles: string[], checkStatuses: unknown[][], renderedValues: unknown[][][]) {
  if (JSON.stringify(titles) !== JSON.stringify(expected.map(sheet => sheet.name))) throw new Error("Google Sheets readback has the wrong 16-tab order.");
  for (let index = 0; index < expected.length; index += 1) {
    const difference = mismatch(expected[index].values, actual[index]?.values ?? []);
    if (difference) throw new Error(`${expected[index].name} Google readback differs at row ${difference.row}, column ${difference.column}: expected=${JSON.stringify(difference.expected)}, actual=${JSON.stringify(difference.actual)}.`);
  }
  const statuses = checkStatuses.flat().map(String);
  if (statuses.length !== 11 || statuses.some(status => status !== "OK")) throw new Error(`Financial Model Google checks did not all return OK: ${statuses.join(", ")}.`);
  const errors: string[] = [];
  renderedValues.forEach((matrix, sheetIndex) => matrix.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (typeof value === "string" && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|ERROR!)/.test(value)) errors.push(`${expected[sheetIndex].name}!R${rowIndex + 1}C${columnIndex + 1}=${value}`);
  })));
  if (errors.length) throw new Error(`Financial Model Google formula errors: ${errors.slice(0, 20).join(", ")}.`);
  return { readback_hash: matricesHash(actual), check_count: statuses.length, formula_errors: 0 };
}

async function readback(sheets: sheets_v4.Sheets, spreadsheetId: string, contract: FinancialSheet[]) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index,gridProperties(frozenRowCount,frozenColumnCount)))" })).data.sheets ?? [];
  const ordered = [...metadata].sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  const titles = ordered.map(sheet => sheet.properties?.title).filter(Boolean) as string[];
  const ranges = contract.map(item => `'${item.name}'!A1:${columnLetter(maximumColumns(item))}${item.values.length}`);
  const formulaResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, majorDimension: "ROWS", valueRenderOption: "FORMULA" });
  const actual = contract.map((item, index) => ({ name: item.name, values: normalizeRows(formulaResponse.data.valueRanges?.[index]?.values as unknown[][] | undefined, item.values) }));
  const checkResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: "'16 Проверки'!D4:D14", majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" });
  const renderedResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  const rendered = contract.map((_, index) => (renderedResponse.data.valueRanges?.[index]?.values ?? []) as unknown[][]);
  return { ...validateFinancialSheetReadback(contract, actual, titles, (checkResponse.data.values ?? []) as unknown[][], rendered), titles };
}

async function publish(drive: drive_v3.Drive, sheets: sheets_v4.Sheets, file: DriveFile, contract: FinancialSheet[]) {
  const sheetIds = await ensureSheetContract(sheets, file.id, contract);
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: file.id, requestBody: { requests: [{ updateSpreadsheetProperties: { properties: { locale: FINANCIAL_FORMULA_INPUT_LOCALE, timeZone: "Europe/Moscow" }, fields: "locale,timeZone" } }] } });
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: file.id, requestBody: { ranges: contract.map(item => `'${item.name}'!A:ZZ`) } });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: file.id,
    requestBody: { valueInputOption: "RAW", data: contract.map(item => ({ range: `'${item.name}'!A1`, majorDimension: "ROWS", values: item.values })) },
  });
  const formulas = financialFormulaWriteData(contract);
  if (formulas.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: file.id, requestBody: { valueInputOption: "USER_ENTERED", data: formulas } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: file.id, requestBody: { requests: formatRequests(sheetIds, contract) } });
  const verified = await assertKnownFile(drive, file.id, loadConfig());
  if (verified.mimeType !== SHEET_MIME || !verified.webViewLink) throw new Error("Financial Model Google Sheet failed Drive metadata verification.");
  return { verified, ...(await readback(sheets, file.id, contract)) };
}

export async function applyFinancialModelSheet(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== FINANCIAL_MODEL_DECISION_ID) throw new Error(`Apply requires --apply --decision ${FINANCIAL_MODEL_DECISION_ID}.`);
  if (!approvedDecision()) throw new Error(`${FINANCIAL_MODEL_DECISION_ID} must be approved before Google apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Financial Model Google preview is missing. Run financial:sheet:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8")) as Preview;
  const { preview, payload, config, target } = await computePreview();
  if (saved.preview_id !== preview.preview_id) throw new Error("Google target or local Financial Model payload changed after preview.");
  const { drive, sheets } = await services();
  await getProjectFolder(drive, config);
  const file = target.file ?? await createSpreadsheet(drive, config);
  const result = await publish(drive, sheets, file, payload.sheets);
  const receipt = {
    receipt_version: 1,
    registry_id: FINANCIAL_MODEL_DOCUMENT_ID,
    decision_id: FINANCIAL_MODEL_DECISION_ID,
    change_set_id: FINANCIAL_MODEL_CHANGE_SET_ID,
    iteration_id: FINANCIAL_MODEL_ITERATION_ID,
    local_path: FINANCIAL_MODEL_PATH,
    local_source_sha256: preview.local_source_sha256,
    payload_path: FINANCIAL_SHEET_PAYLOAD_PATH,
    payload_sha256: preview.payload_sha256,
    content_state_sha256: preview.content_state_sha256,
    google_file_id: result.verified.id,
    google_mime_type: result.verified.mimeType,
    google_title: result.verified.name,
    web_view_link: result.verified.webViewLink,
    synced_at: new Date().toISOString(),
    action: target.action,
    source_status: "research",
    source_version: "0.1",
    sheets: result.titles,
    readback_hash: result.readback_hash,
    readback: "passed",
    validation_status: "passed",
    validation: { folder_guard: "passed", native_google_sheet: true, exact_single_file: true, localized_sheet_order: "passed", formula_readback: "passed", google_checks: result.check_count, formula_errors: result.formula_errors },
  };
  writeSecretJson(runtimeResultPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export async function readbackFinancialModelSheet() {
  if (!fs.existsSync(runtimeResultPath)) throw new Error("Financial Model Google runtime result is missing. Run financial:sheet:apply first.");
  const saved = JSON.parse(fs.readFileSync(runtimeResultPath, "utf8"));
  const payload = buildFinancialGoogleSheetsPayload();
  const config = loadConfig();
  const { drive, sheets } = await services();
  const file = await assertKnownFile(drive, saved.google_file_id, config);
  const result = await readback(sheets, file.id, payload.sheets);
  if (saved.payload_sha256 !== sha256(fs.readFileSync(path.join(projectRoot, FINANCIAL_SHEET_PAYLOAD_PATH)))) throw new Error("Local Financial Model Google payload changed after publication.");
  if (saved.readback_hash !== result.readback_hash) throw new Error("Financial Model Google readback hash changed after publication.");
  const output = { google_file_id_masked: mask(file.id), web_view_link: file.webViewLink, ...result, validation: "passed" };
  console.log(JSON.stringify(output, null, 2));
  return output;
}
