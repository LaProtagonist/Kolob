import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, type drive_v3, type sheets_v4 } from "googleapis";
import YAML from "yaml";
import {
  INVESTOR_SUMMARY_PROJECTION_PATH,
  INVESTOR_SUMMARY_SOURCE_PATH,
  readInvestorSummarySource,
  validateInvestorFinancialSummary,
} from "../financial/investor-summary.js";
import {
  INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH,
  buildInvestorSummaryGooglePayload,
  checkInvestorSummaryGooglePayload,
  type InvestorSummarySheet,
  type InvestorSheetValue,
} from "../financial/investor-summary-google-sheet.js";
import { sha256, writeYaml } from "../governance/util.js";
import { getAuthorizedClient } from "./auth.js";
import { loadConfig, platformRoot, writeSecretJson } from "./config.js";
import {
  FINANCIAL_PUBLICATION_DECISION_ID,
  INVESTOR_SUMMARY_PUBLISHER_FIX_CHANGE_SET_ID,
  INVESTOR_SUMMARY_PUBLISHER_FIX_ITERATION_ID,
  INVESTOR_SUMMARY_PUBLISHER_FIX_RECEIPT_PATH,
} from "./financial-publication-context.js";
import {
  asDriveFile,
  assertKnownFile,
  driveFileFields,
  findNamedSpreadsheetsInProjectFolder,
  getProjectFolder,
} from "./drive.js";
import { requireProjectFolder } from "./guard.js";
import { SHEET_MIME, type DriveFile, type GoogleConfig } from "./types.js";

export const INVESTOR_SUMMARY_DOCUMENT_ID = "DOC-INVESTOR-FINANCIAL-SUMMARY";
export const INVESTOR_SUMMARY_DECISION_ID = FINANCIAL_PUBLICATION_DECISION_ID;
export const INVESTOR_SUMMARY_CHANGE_SET_ID = INVESTOR_SUMMARY_PUBLISHER_FIX_CHANGE_SET_ID;
export const INVESTOR_SUMMARY_ITERATION_ID = INVESTOR_SUMMARY_PUBLISHER_FIX_ITERATION_ID;
export const INVESTOR_SUMMARY_GOOGLE_TITLE = "05 — Финансовая модель — инвестиционная сводка";
export const INVESTOR_SUMMARY_GOOGLE_RECEIPT_PATH = INVESTOR_SUMMARY_PUBLISHER_FIX_RECEIPT_PATH;

const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "investor-financial-summary-preview.json");
const runtimeCreationPath = path.join(platformRoot, ".runtime", "investor-financial-summary-created.json");
const runtimeResultPath = path.join(platformRoot, ".runtime", "investor-financial-summary-result.json");

type Target = { action: "create"; file: null } | { action: "reuse"; file: DriveFile };
type Matrix = InvestorSheetValue[][];
type Preview = {
  preview_id: string;
  created_at: string;
  registry_id: typeof INVESTOR_SUMMARY_DOCUMENT_ID;
  decision_id: typeof INVESTOR_SUMMARY_DECISION_ID;
  change_set_id: typeof INVESTOR_SUMMARY_CHANGE_SET_ID;
  iteration_id: typeof INVESTOR_SUMMARY_ITERATION_ID;
  google_title: typeof INVESTOR_SUMMARY_GOOGLE_TITLE;
  folder_name: string;
  folder_check: "passed";
  action: Target["action"];
  google_file_id: string | null;
  google_file_id_masked: string | null;
  local_path: typeof INVESTOR_SUMMARY_SOURCE_PATH;
  local_source_sha256: string;
  projection_path: typeof INVESTOR_SUMMARY_PROJECTION_PATH;
  projection_sha256: string;
  payload_path: typeof INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH;
  payload_sha256: string;
  financial_model_content_state_sha256: string;
  sheet_names: string[];
  warnings: string[];
};

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
  return ((YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"))?.decisions ?? []) as Array<{ id: string; status: string }>)
    .some(item => item.id === INVESTOR_SUMMARY_DECISION_ID && item.status === "approved");
}

function creationFileId() {
  if (!fs.existsSync(runtimeCreationPath)) return null;
  const value = JSON.parse(fs.readFileSync(runtimeCreationPath, "utf8"));
  return value.iteration_id === INVESTOR_SUMMARY_ITERATION_ID && typeof value.google_file_id === "string" ? value.google_file_id : null;
}

function mask(id: string | null) {
  return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : null;
}

function fingerprint(value: Omit<Preview, "preview_id" | "created_at" | "google_file_id_masked">) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function chooseInvestorSummarySpreadsheetTarget(matches: DriveFile[], linkedFileId: string | null): Target {
  if (matches.length > 1) throw new Error(`Multiple spreadsheets named '${INVESTOR_SUMMARY_GOOGLE_TITLE}' exist in the project folder. Refusing to create or overwrite.`);
  if (linkedFileId) {
    if (matches.length !== 1 || matches[0].id !== linkedFileId) throw new Error("The linked Investor Summary Sheet does not match the unique title-scoped file in the project folder.");
    return { action: "reuse", file: matches[0] };
  }
  if (matches.length === 1) throw new Error("An unregistered Investor Summary Sheet with the target title already exists. Refusing duplicate creation.");
  return { action: "create", file: null };
}

export function requireInvestorSummarySheetId(sheetId: number | null | undefined, title: string) {
  if (sheetId === null || sheetId === undefined) throw new Error(`Missing Google Sheet tab ${title}.`);
  return sheetId;
}

async function resolveTarget(drive: drive_v3.Drive, config: GoogleConfig) {
  const registeredId = documentsRegistry().find(item => item.id === INVESTOR_SUMMARY_DOCUMENT_ID)?.google_file_id ?? null;
  const linkedFileId = registeredId || creationFileId();
  const matches = await findNamedSpreadsheetsInProjectFolder(drive, config, INVESTOR_SUMMARY_GOOGLE_TITLE);
  const target = chooseInvestorSummarySpreadsheetTarget(matches, linkedFileId);
  if (target.file) {
    const file = await assertKnownFile(drive, target.file.id, config);
    if (file.name !== INVESTOR_SUMMARY_GOOGLE_TITLE || file.mimeType !== SHEET_MIME) throw new Error("Linked Investor Summary Google file has the wrong title or MIME type.");
    return { ...target, file };
  }
  return target;
}

function previewForLog(preview: Preview) {
  const { google_file_id: _id, ...safe } = preview;
  return safe;
}

async function computePreview() {
  const source = readInvestorSummarySource();
  const projection = JSON.parse(fs.readFileSync(path.join(projectRoot, INVESTOR_SUMMARY_PROJECTION_PATH), "utf8"));
  const errors = validateInvestorFinancialSummary(projection);
  if (errors.length) throw new Error(errors.join("\n"));
  if (!approvedDecision()) throw new Error(`${INVESTOR_SUMMARY_DECISION_ID} must be approved before Google publication.`);
  const payloadCheck = checkInvestorSummaryGooglePayload();
  const payload = buildInvestorSummaryGooglePayload();
  const config = loadConfig();
  const { drive } = await services();
  const folder = await getProjectFolder(drive, config);
  if (folder.capabilities?.canEdit !== true) throw new Error("Project folder is not editable by the authorized account.");
  const target = await resolveTarget(drive, config);
  const base: Omit<Preview, "preview_id" | "created_at" | "google_file_id_masked"> = {
    registry_id: INVESTOR_SUMMARY_DOCUMENT_ID,
    decision_id: INVESTOR_SUMMARY_DECISION_ID,
    change_set_id: INVESTOR_SUMMARY_CHANGE_SET_ID,
    iteration_id: INVESTOR_SUMMARY_ITERATION_ID,
    google_title: INVESTOR_SUMMARY_GOOGLE_TITLE,
    folder_name: config.projectFolderName,
    folder_check: "passed",
    action: target.action,
    google_file_id: target.file?.id ?? null,
    local_path: INVESTOR_SUMMARY_SOURCE_PATH,
    local_source_sha256: sha256(fs.readFileSync(path.join(projectRoot, INVESTOR_SUMMARY_SOURCE_PATH))),
    projection_path: INVESTOR_SUMMARY_PROJECTION_PATH,
    projection_sha256: sha256(fs.readFileSync(path.join(projectRoot, INVESTOR_SUMMARY_PROJECTION_PATH))),
    payload_path: INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH,
    payload_sha256: payloadCheck.sha256,
    financial_model_content_state_sha256: payload.meta.financial_model_content_state_sha256,
    sheet_names: payload.sheets.map(item => item.name),
    warnings: [
      "Creates at most one native Google Sheet in the guarded project folder.",
      "The presentation view reads the sealed Financial Model and does not replace or modify it.",
      "The existing Financial Model and CAPEX Google Sheets are not changed.",
    ],
  };
  const preview: Preview = { ...base, preview_id: fingerprint(base), created_at: new Date().toISOString(), google_file_id_masked: mask(base.google_file_id) };
  return { preview, payload, config, target };
}

export async function previewInvestorSummarySheet() {
  const { preview } = await computePreview();
  writeSecretJson(runtimePreviewPath, preview);
  console.log(JSON.stringify(previewForLog(preview), null, 2));
  return preview;
}

async function createSpreadsheet(drive: drive_v3.Drive, config: GoogleConfig) {
  const result = await drive.files.create({
    requestBody: { name: INVESTOR_SUMMARY_GOOGLE_TITLE, mimeType: SHEET_MIME, parents: [requireProjectFolder(config)] },
    fields: driveFileFields,
    supportsAllDrives: true,
  });
  const file = asDriveFile(result.data);
  writeSecretJson(runtimeCreationPath, {
    iteration_id: INVESTOR_SUMMARY_ITERATION_ID,
    decision_id: INVESTOR_SUMMARY_DECISION_ID,
    google_file_id: file.id,
    created_at: new Date().toISOString(),
  });
  return file;
}

function maximumColumns(item: InvestorSummarySheet) {
  return Math.max(1, item.column_widths.length, ...item.values.map(row => row.length));
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

async function ensureSheetContract(sheets: sheets_v4.Sheets, spreadsheetId: string, contract: InvestorSummarySheet[]) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const allowed = new Set(contract.map(item => item.name));
  const existingTitles = metadata.map(item => item.properties?.title).filter(Boolean) as string[];
  const requests: sheets_v4.Schema$Request[] = [];
  if (metadata.length === 1 && !allowed.has(existingTitles[0])) {
    requests.push({ updateSheetProperties: { properties: { sheetId: metadata[0].properties?.sheetId, title: contract[0].name }, fields: "title" } });
    existingTitles[0] = contract[0].name;
  } else {
    const unexpected = existingTitles.filter(title => !allowed.has(title));
    if (unexpected.length) throw new Error(`Investor Summary spreadsheet contains unexpected tabs: ${unexpected.join(", ")}.`);
  }
  for (const item of contract) if (!existingTitles.includes(item.name)) requests.push({ addSheet: { properties: { title: item.name } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const afterAdd = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const reorder = contract.map((item, index) => {
    const found = afterAdd.find(candidate => candidate.properties?.title === item.name);
    return { updateSheetProperties: { properties: { sheetId: requireInvestorSummarySheetId(found?.properties?.sheetId, item.name), index }, fields: "index" } };
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reorder } });
  const ordered = [...((await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [])]
    .sort((left, right) => (left.properties?.index ?? 0) - (right.properties?.index ?? 0));
  const titles = ordered.map(item => item.properties?.title).filter(Boolean);
  if (JSON.stringify(titles) !== JSON.stringify(contract.map(item => item.name))) throw new Error("Investor Summary Google Sheet tab order differs from the five-tab publication contract.");
  return new Map(ordered.map(item => [item.properties!.title!, item.properties!.sheetId!]));
}

function rgb(hex: string) {
  const clean = hex.replace("#", "");
  return { red: parseInt(clean.slice(0, 2), 16) / 255, green: parseInt(clean.slice(2, 4), 16) / 255, blue: parseInt(clean.slice(4, 6), 16) / 255 };
}

function repeat(sheetId: number, startRow: number, endRow: number, startColumn: number, endColumn: number, cell: sheets_v4.Schema$CellData, fields: string): sheets_v4.Schema$Request {
  return { repeatCell: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn }, cell, fields } };
}

function findRow(item: InvestorSummarySheet, label: string) {
  const index = item.values.findIndex(row => String(row[0] ?? "") === label);
  if (index < 0) throw new Error(`Investor Summary formatting cannot find '${label}' on ${item.name}.`);
  return index;
}

function findRowAfter(item: InvestorSummarySheet, label: string, afterRow: number) {
  const index = item.values.findIndex((row, rowIndex) => rowIndex > afterRow && String(row[0] ?? "") === label);
  if (index < 0) throw new Error(`Investor Summary formatting cannot find '${label}' after row ${afterRow + 1} on ${item.name}.`);
  return index;
}

function merge(sheetId: number, startRow: number, endRow: number, startColumn: number, endColumn: number): sheets_v4.Schema$Request {
  return { mergeCells: { range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startColumn, endColumnIndex: endColumn }, mergeType: "MERGE_ALL" } };
}

export function formatRequests(sheetIds: Map<string, number>, contract: InvestorSummarySheet[]) {
  const requests: sheets_v4.Schema$Request[] = [{ updateSpreadsheetProperties: { properties: { locale: "ru_RU", timeZone: "Europe/Moscow" }, fields: "locale,timeZone" } }];
  const dark = rgb("173B35");
  const ink = rgb("17201E");
  const accent = rgb("F2C94C");
  const pale = rgb("F3F7F5");
  const lightBorder = rgb("D6DFDB");
  const money = { numberFormat: { type: "CURRENCY", pattern: "#,##0 [$₽-ru-RU];[Red](#,##0 [$₽-ru-RU]);-" }, horizontalAlignment: "RIGHT" };
  const moneyOneDecimal = { numberFormat: { type: "CURRENCY", pattern: "#,##0.00 [$₽-ru-RU];[Red](#,##0.00 [$₽-ru-RU]);-" }, horizontalAlignment: "RIGHT" };
  const percent = { numberFormat: { type: "PERCENT", pattern: "0.00%;[Red](0.00%);-" }, horizontalAlignment: "RIGHT" };
  const integer = { numberFormat: { type: "NUMBER", pattern: "#,##0;[Red](#,##0);-" }, horizontalAlignment: "RIGHT" };
  const decimal = { numberFormat: { type: "NUMBER", pattern: "#,##0.00;[Red](#,##0.00);-" }, horizontalAlignment: "RIGHT" };
  const sectionLabels = new Set([
    "Реалистичный сценарий — главные показатели", "Первый год работы", "Ключевые параметры расчёта", "Дополнительные показатели", "Сравнение трёх сценариев", "Коротко о показателях",
    "Расшифровка групп", "Состав стартового капитала — аренда", "Аренда и покупка помещения", "Три основных сценария",
    "Чеки в день × средний чек — операционная маржа", "Прямые затраты на продукцию", "Расходы на персонал", "Аренда", "Продажи через агрегаторы",
    "Стартовые инвестиции", "Структура команды", "Налоги и ограничения модели",
  ]);
  const headerLabels = new Set(["Показатель", "Статья", "Параметр", "Чеков в день", "Уровень", "Изменение", "Аренда / месяц", "Доля продаж"]);

  for (const item of contract) {
    const sheetId = sheetIds.get(item.name)!;
    const rows = item.values.length;
    const columns = maximumColumns(item);
    requests.push(repeat(sheetId, 0, rows, 0, columns, { userEnteredFormat: {} }, "userEnteredFormat"));
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: item.frozen_rows, frozenColumnCount: item.frozen_columns, hideGridlines: true } }, fields: "gridProperties(frozenRowCount,frozenColumnCount,hideGridlines)" } });
    requests.push(repeat(sheetId, 0, rows, 0, columns, { userEnteredFormat: { backgroundColor: rgb("FFFFFF"), textFormat: { fontFamily: "Arial", fontSize: 10, foregroundColor: ink }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"));
    requests.push(merge(sheetId, 0, 1, 0, columns), merge(sheetId, 1, 2, 0, columns));
    requests.push(repeat(sheetId, 0, 1, 0, columns, { userEnteredFormat: { backgroundColor: dark, textFormat: { bold: true, fontSize: 16, foregroundColor: rgb("FFFFFF") }, horizontalAlignment: "LEFT", verticalAlignment: "MIDDLE" } }, "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)"));
    requests.push(repeat(sheetId, 1, 2, 0, columns, { userEnteredFormat: { backgroundColor: pale, textFormat: { italic: true, foregroundColor: rgb("3C514B") }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)"));
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 44 }, fields: "pixelSize" } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 46 }, fields: "pixelSize" } });
    item.column_widths.forEach((width, index) => requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: Math.max(28, Math.min(width, 620)) }, fields: "pixelSize" } }));
    item.values.forEach((row, rowIndex) => {
      const label = String(row[0] ?? "");
      if (sectionLabels.has(label) && row.filter(value => value !== "").length === 1) {
        requests.push(merge(sheetId, rowIndex, rowIndex + 1, 0, columns));
        requests.push(repeat(sheetId, rowIndex, rowIndex + 1, 0, columns, { userEnteredFormat: { backgroundColor: accent, textFormat: { bold: true, fontSize: 11, foregroundColor: ink }, verticalAlignment: "MIDDLE", borders: { bottom: { style: "SOLID_MEDIUM", color: dark } } } }, "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,borders)"));
        requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 }, properties: { pixelSize: 30 }, fields: "pixelSize" } });
      } else if (headerLabels.has(label) && row.filter(value => value !== "").length > 1) {
        requests.push(repeat(sheetId, rowIndex, rowIndex + 1, 0, columns, { userEnteredFormat: { backgroundColor: pale, textFormat: { bold: true }, borders: { bottom: { style: "SOLID", color: lightBorder } }, verticalAlignment: "MIDDLE" } }, "userEnteredFormat(backgroundColor,textFormat,borders,verticalAlignment)"));
      }
      if (/^(Итого|Валовая прибыль|EBITDA объекта|Чистый операционный результат|Свободный денежный поток)$/.test(label)) {
        requests.push(repeat(sheetId, rowIndex, rowIndex + 1, 0, columns, { userEnteredFormat: { textFormat: { bold: true }, borders: { top: { style: "SOLID_MEDIUM", color: dark } } } }, "userEnteredFormat(textFormat,borders.top)"));
      }
    });
  }

  const main = contract.find(item => item.name === "Основные показатели")!;
  const mainId = sheetIds.get(main.name)!;
  for (const rowStart of [5, 8, 13]) for (const columnStart of [0, 3, 6]) {
    for (let row = rowStart; row < rowStart + 3; row += 1) requests.push(merge(mainId, row, row + 1, columnStart, columnStart + 3));
    requests.push(repeat(mainId, rowStart, rowStart + 3, columnStart, columnStart + 3, { userEnteredFormat: { backgroundColor: pale, borders: { top: { style: "SOLID", color: lightBorder }, bottom: { style: "SOLID", color: lightBorder }, left: { style: "SOLID", color: lightBorder }, right: { style: "SOLID", color: lightBorder } }, horizontalAlignment: "CENTER" } }, "userEnteredFormat(backgroundColor,borders,horizontalAlignment)"));
    requests.push(repeat(mainId, rowStart + 1, rowStart + 2, columnStart, columnStart + 3, { userEnteredFormat: { textFormat: { bold: true, fontSize: 18, foregroundColor: dark }, horizontalAlignment: "CENTER" } }, "userEnteredFormat(textFormat,horizontalAlignment)"));
  }
  for (const cell of [[6, 0], [6, 3], [6, 6], [14, 0], [14, 3], [14, 6]] as const) requests.push(repeat(mainId, cell[0], cell[0] + 1, cell[1], cell[1] + 3, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, 9, 10, 0, 3, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, 9, 10, 3, 6, { userEnteredFormat: integer }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, 9, 10, 6, 9, { userEnteredFormat: moneyOneDecimal }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, 15, 16, 3, 6, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  const driverSection = findRow(main, "Ключевые параметры расчёта");
  requests.push(repeat(mainId, driverSection + 2, driverSection + 3, 1, 2, { userEnteredFormat: integer }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 2, driverSection + 3, 4, 5, { userEnteredFormat: moneyOneDecimal }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 2, driverSection + 3, 7, 8, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 3, driverSection + 4, 1, 2, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 3, driverSection + 4, 4, 5, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 3, driverSection + 4, 7, 8, { userEnteredFormat: integer }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 4, driverSection + 5, 1, 2, { userEnteredFormat: decimal }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(mainId, driverSection + 4, driverSection + 5, 7, 8, { userEnteredFormat: integer }, "userEnteredFormat(numberFormat,horizontalAlignment)"));

  const mainScenarioSection = findRow(main, "Сравнение трёх сценариев");
  const mainScenarioHeader = findRowAfter(main, "Показатель", mainScenarioSection);
  const mainScenarioEnd = main.values.findIndex((row, index) => index > mainScenarioHeader && row.every(value => value === ""));
  if (mainScenarioEnd < 0) throw new Error("Investor Summary formatting cannot find the end of the main scenario comparison.");
  for (let row = mainScenarioHeader; row < mainScenarioEnd; row += 1) {
    requests.push(merge(mainId, row, row + 1, 1, 3));
    requests.push(merge(mainId, row, row + 1, 3, 6));
    requests.push(merge(mainId, row, row + 1, 6, 9));
  }
  requests.push(repeat(mainId, mainScenarioHeader, mainScenarioEnd, 3, 6, { userEnteredFormat: { backgroundColor: rgb("FFF7D6") } }, "userEnteredFormat.backgroundColor"));
  for (const label of ["Продажи в месяц в зрелом режиме", "EBITDA объекта в месяц", "Свободный денежный поток в месяц", "NPV"]) {
    const row = findRowAfter(main, label, mainScenarioHeader - 1);
    for (const [start, end] of [[1, 3], [3, 6], [6, 9]] as const) requests.push(repeat(mainId, row, row + 1, start, end, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  for (const label of ["Операционная маржа", "ROI", "IRR"]) {
    const row = findRowAfter(main, label, mainScenarioHeader - 1);
    for (const [start, end] of [[1, 3], [3, 6], [6, 9]] as const) requests.push(repeat(mainId, row, row + 1, start, end, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  for (const [label, cellFormat] of [["Чеков в день в зрелом режиме", integer], ["Точка безубыточности, чеков в день", decimal], ["Срок окупаемости, месяцев", integer]] as const) {
    const row = findRowAfter(main, label, mainScenarioHeader - 1);
    for (const [start, end] of [[1, 3], [3, 6], [6, 9]] as const) requests.push(repeat(mainId, row, row + 1, start, end, { userEnteredFormat: cellFormat }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  const explanationSection = findRow(main, "Коротко о показателях");
  for (let row = explanationSection + 1; row < main.values.length; row += 1) requests.push(merge(mainId, row, row + 1, 1, 9));

  const income = contract.find(item => item.name === "Доходы и расходы")!;
  const incomeId = sheetIds.get(income.name)!;
  requests.push(repeat(incomeId, 4, income.values.length, 1, 2, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(incomeId, 4, 25, 2, 3, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));

  const investments = contract.find(item => item.name === "Инвестиции")!;
  const investmentsId = sheetIds.get(investments.name)!;
  const investmentHeader = findRow(investments, "Статья");
  const investmentTotal = findRow(investments, "Итого");
  requests.push(repeat(investmentsId, investmentHeader + 1, investmentTotal + 1, 1, 2, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  const comparisonHeader = findRow(investments, "Показатель");
  requests.push(repeat(investmentsId, comparisonHeader + 1, comparisonHeader + 5, 1, 3, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  const irrRow = findRow(investments, "Внутренняя норма доходности");
  const propertyRow = findRow(investments, "Рост стоимости недвижимости в базовом сценарии");
  requests.push(repeat(investmentsId, irrRow, irrRow + 1, 1, 3, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  requests.push(repeat(investmentsId, propertyRow, propertyRow + 1, 1, 3, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  for (const row of [investmentTotal + 1, investmentTotal + 2]) {
    requests.push(merge(investmentsId, row, row + 1, 0, 3));
    requests.push({ updateDimensionProperties: { range: { sheetId: investmentsId, dimension: "ROWS", startIndex: row, endIndex: row + 1 }, properties: { pixelSize: 48 }, fields: "pixelSize" } });
  }
  const propertyNote = findRow(investments, "Недвижимость учитывается отдельно от доходности ресторанного бизнеса.");
  requests.push(merge(investmentsId, propertyNote, propertyNote + 1, 0, 3));

  const scenarios = contract.find(item => item.name === "Сценарии")!;
  const scenariosId = sheetIds.get(scenarios.name)!;
  const firstScenarioHeader = findRow(scenarios, "Показатель");
  const firstScenarioEnd = scenarios.values.findIndex((row, index) => index > firstScenarioHeader && row.every(value => value === ""));
  if (firstScenarioEnd < 0) throw new Error("Investor Summary formatting cannot find the end of the scenario comparison.");
  requests.push(repeat(scenariosId, firstScenarioHeader, firstScenarioEnd, 2, 3, { userEnteredFormat: { backgroundColor: rgb("FFF7D6") } }, "userEnteredFormat.backgroundColor"));
  for (const label of ["Продажи в месяц в зрелом режиме", "EBITDA объекта в месяц", "Свободный денежный поток в месяц", "NPV"]) {
    const row = findRow(scenarios, label);
    requests.push(repeat(scenariosId, row, row + 1, 1, 4, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  for (const label of ["Операционная маржа", "ROI", "IRR"]) {
    const row = findRow(scenarios, label);
    requests.push(repeat(scenariosId, row, row + 1, 1, 4, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  for (const [label, cellFormat] of [["Чеков в день в зрелом режиме", integer], ["Точка безубыточности, чеков в день", decimal], ["Срок окупаемости, месяцев", integer]] as const) {
    const row = findRowAfter(scenarios, label, firstScenarioHeader - 1);
    requests.push(repeat(scenariosId, row, row + 1, 1, 4, { userEnteredFormat: cellFormat }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  const matrixSection = findRow(scenarios, "Чеки в день × средний чек — операционная маржа");
  const matrixHeader = findRowAfter(scenarios, "Чеков в день", matrixSection);
  requests.push(repeat(scenariosId, matrixHeader + 1, matrixHeader + 5, 1, 4, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  for (const label of ["Уровень", "Изменение", "Доля продаж"]) {
    scenarios.values.forEach((row, rowIndex) => {
      if (String(row[0] ?? "") !== label) return;
      const section = String(scenarios.values[rowIndex - 1]?.[0] ?? "");
      const bodyEnd = Math.min(scenarios.values.length, rowIndex + (section === "Продажи через агрегаторы" ? 5 : 4));
      if (section === "Прямые затраты на продукцию" || section === "Продажи через агрегаторы") requests.push(repeat(scenariosId, rowIndex + 1, bodyEnd, 0, 1, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
      if (section !== "Стартовые инвестиции") requests.push(repeat(scenariosId, rowIndex + 1, bodyEnd, 1, 2, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
    });
  }
  const rentHeader = scenarios.values.findIndex((row, index) => String(row[0] ?? "") === "Аренда в месяц" && String(scenarios.values[index - 1]?.[0] ?? "") === "Аренда");
  if (rentHeader >= 0) requests.push(repeat(scenariosId, rentHeader + 1, rentHeader + 4, 0, 1, { userEnteredFormat: money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));

  const assumptions = contract.find(item => item.name === "Допущения")!;
  const assumptionsId = sheetIds.get(assumptions.name)!;
  for (const label of ["Средний чек", "Упаковка", "Аренда", "Расходы на персонал — Реалистичный", "Расходы на персонал — Оптимистичный"]) {
    const row = findRow(assumptions, label);
    requests.push(repeat(assumptionsId, row, row + 1, 1, 2, { userEnteredFormat: label === "Средний чек" ? moneyOneDecimal : money }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  for (const label of ["Списания", "Эквайринг"]) {
    const row = findRow(assumptions, label);
    requests.push(repeat(assumptionsId, row, row + 1, 1, 2, { userEnteredFormat: percent }, "userEnteredFormat(numberFormat,horizontalAlignment)"));
  }
  const staffingSection = findRow(assumptions, "Структура команды");
  requests.push(merge(assumptionsId, staffingSection + 1, staffingSection + 2, 0, 3));
  requests.push({ updateDimensionProperties: { range: { sheetId: assumptionsId, dimension: "ROWS", startIndex: staffingSection + 1, endIndex: staffingSection + 2 }, properties: { pixelSize: 50 }, fields: "pixelSize" } });
  return requests;
}

function normalizeRows(values: unknown[][] | undefined, expected: Matrix): Matrix {
  return expected.map((row, rowIndex) => row.map((_value, columnIndex) => {
    const value = values?.[rowIndex]?.[columnIndex];
    if (value === null || value === undefined) return "";
    return ["string", "number", "boolean"].includes(typeof value) ? value as InvestorSheetValue : JSON.stringify(value);
  }));
}

function mismatch(expected: Matrix, actual: Matrix) {
  for (let row = 0; row < expected.length; row += 1) for (let column = 0; column < expected[row].length; column += 1) {
    if (JSON.stringify(expected[row][column]) !== JSON.stringify(actual[row]?.[column] ?? "")) return { row: row + 1, column: column + 1, expected: expected[row][column], actual: actual[row]?.[column] };
  }
  return null;
}

function matricesHash(sheets: Array<{ name: string; values: Matrix }>) {
  return sha256(JSON.stringify(Object.fromEntries(sheets.map(item => [item.name, item.values]))));
}

export function validateInvestorSummaryReadback(expected: InvestorSummarySheet[], actual: Array<{ name: string; values: Matrix }>, titles: string[], frozen: Array<{ rows: number; columns: number }>, renderedValues: unknown[][][]) {
  if (JSON.stringify(titles) !== JSON.stringify(expected.map(item => item.name))) throw new Error("Investor Summary Google readback has the wrong five-tab order.");
  expected.forEach((item, index) => {
    const difference = mismatch(item.values, actual[index]?.values ?? []);
    if (difference) throw new Error(`${item.name} Google readback differs at row ${difference.row}, column ${difference.column}: expected=${JSON.stringify(difference.expected)}, actual=${JSON.stringify(difference.actual)}.`);
    if (frozen[index]?.rows !== item.frozen_rows || frozen[index]?.columns !== item.frozen_columns) throw new Error(`${item.name} frozen panes differ from the publication contract.`);
  });
  const errors: string[] = [];
  renderedValues.forEach((matrix, sheetIndex) => matrix.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    if (typeof value === "string" && /^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|ERROR!)/.test(value)) errors.push(`${expected[sheetIndex].name}!R${rowIndex + 1}C${columnIndex + 1}=${value}`);
  })));
  if (errors.length) throw new Error(`Investor Summary Google formula errors: ${errors.slice(0, 20).join(", ")}.`);
  return { readback_hash: matricesHash(actual), formula_errors: 0, tab_count: titles.length };
}

async function readback(sheets: sheets_v4.Sheets, spreadsheetId: string, contract: InvestorSummarySheet[]) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index,gridProperties(frozenRowCount,frozenColumnCount)))" })).data.sheets ?? [];
  const ordered = [...metadata].sort((left, right) => (left.properties?.index ?? 0) - (right.properties?.index ?? 0));
  const titles = ordered.map(item => item.properties?.title).filter(Boolean) as string[];
  const frozen = ordered.map(item => ({ rows: item.properties?.gridProperties?.frozenRowCount ?? 0, columns: item.properties?.gridProperties?.frozenColumnCount ?? 0 }));
  const ranges = contract.map(item => `'${item.name}'!A1:${columnLetter(maximumColumns(item))}${item.values.length}`);
  const valuesResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, majorDimension: "ROWS", valueRenderOption: "UNFORMATTED_VALUE" });
  const actual = contract.map((item, index) => ({ name: item.name, values: normalizeRows(valuesResponse.data.valueRanges?.[index]?.values as unknown[][] | undefined, item.values) }));
  const renderedResponse = await sheets.spreadsheets.values.batchGet({ spreadsheetId, ranges, majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  const rendered = contract.map((_, index) => (renderedResponse.data.valueRanges?.[index]?.values ?? []) as unknown[][]);
  return { ...validateInvestorSummaryReadback(contract, actual, titles, frozen, rendered), titles };
}

async function unmergeContractCells(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetIds: Map<string, number>, contract: InvestorSummarySheet[]) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: contract.map(item => ({
        unmergeCells: {
          range: {
            sheetId: sheetIds.get(item.name)!,
            startRowIndex: 0,
            endRowIndex: item.values.length,
            startColumnIndex: 0,
            endColumnIndex: maximumColumns(item),
          },
        },
      })),
    },
  });
}

async function publish(drive: drive_v3.Drive, sheets: sheets_v4.Sheets, file: DriveFile, contract: InvestorSummarySheet[]) {
  const sheetIds = await ensureSheetContract(sheets, file.id, contract);
  // Existing investor sheets can contain historical merged rows. Google only
  // retains the top-left value when values are written into a still-merged
  // range, so merges must be cleared before the payload write.
  await unmergeContractCells(sheets, file.id, sheetIds, contract);
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: file.id, requestBody: { ranges: contract.map(item => `'${item.name}'!A:Z`) } });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: file.id,
    requestBody: { valueInputOption: "RAW", data: contract.map(item => ({ range: `'${item.name}'!A1`, majorDimension: "ROWS", values: item.values })) },
  });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: file.id, requestBody: { requests: formatRequests(sheetIds, contract) } });
  const verified = await assertKnownFile(drive, file.id, loadConfig());
  if (verified.mimeType !== SHEET_MIME || !verified.webViewLink) throw new Error("Investor Summary Google Sheet failed Drive metadata verification.");
  return verified;
}

export async function applyInvestorSummarySheet(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== INVESTOR_SUMMARY_DECISION_ID) throw new Error(`Apply requires --apply --decision ${INVESTOR_SUMMARY_DECISION_ID}.`);
  if (!approvedDecision()) throw new Error(`${INVESTOR_SUMMARY_DECISION_ID} must be approved before Google apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Investor Summary Google preview is missing. Run investor:summary:sheet:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8")) as Preview;
  const { preview, payload, config, target } = await computePreview();
  if (saved.preview_id !== preview.preview_id) throw new Error("Google target or local Investor Summary payload changed after preview.");
  const { drive, sheets } = await services();
  await getProjectFolder(drive, config);
  const file = target.file ?? await createSpreadsheet(drive, config);
  const verified = await publish(drive, sheets, file, payload.sheets);
  const result = {
    registry_id: INVESTOR_SUMMARY_DOCUMENT_ID,
    decision_id: INVESTOR_SUMMARY_DECISION_ID,
    change_set_id: INVESTOR_SUMMARY_CHANGE_SET_ID,
    iteration_id: INVESTOR_SUMMARY_ITERATION_ID,
    google_file_id: verified.id,
    google_mime_type: verified.mimeType,
    google_title: verified.name,
    web_view_link: verified.webViewLink,
    action: target.action,
    published_at: new Date().toISOString(),
    payload_sha256: preview.payload_sha256,
    projection_sha256: preview.projection_sha256,
    financial_model_content_state_sha256: preview.financial_model_content_state_sha256,
    sheets: payload.sheets.map(item => item.name),
    readback: "pending",
  };
  writeSecretJson(runtimeResultPath, result);
  console.log(JSON.stringify({ ...result, google_file_id: mask(result.google_file_id) }, null, 2));
  return result;
}

export async function readbackInvestorSummarySheet() {
  if (!fs.existsSync(runtimeResultPath)) throw new Error("Investor Summary Google runtime result is missing. Run investor:summary:sheet:apply first.");
  const saved = JSON.parse(fs.readFileSync(runtimeResultPath, "utf8"));
  const payloadCheck = checkInvestorSummaryGooglePayload();
  if (saved.payload_sha256 !== payloadCheck.sha256) throw new Error("Local Investor Summary Google payload changed after publication.");
  const receiptFile = path.join(projectRoot, INVESTOR_SUMMARY_GOOGLE_RECEIPT_PATH);
  if (fs.existsSync(receiptFile)) {
    const prior = YAML.parse(fs.readFileSync(receiptFile, "utf8"));
    if (prior.google_file_id === saved.google_file_id && prior.payload_sha256 === saved.payload_sha256 && prior.result === "passed") {
      const reused = { readback: "REUSED", google_file_id_masked: mask(saved.google_file_id), web_view_link: saved.web_view_link, readback_hash: prior.remote_readback_sha256, formula_errors: prior.validation.formula_errors, tabs: prior.sheets };
      console.log(JSON.stringify(reused, null, 2));
      return reused;
    }
    throw new Error("A different Investor Summary readback receipt already exists; publish a governed update before another readback.");
  }
  const payload = buildInvestorSummaryGooglePayload();
  const config = loadConfig();
  const { drive, sheets } = await services();
  const file = await assertKnownFile(drive, saved.google_file_id, config);
  const result = await readback(sheets, file.id, payload.sheets);
  const receipt = {
    receipt_version: 1,
    registry_id: INVESTOR_SUMMARY_DOCUMENT_ID,
    decision_id: INVESTOR_SUMMARY_DECISION_ID,
    change_set_id: INVESTOR_SUMMARY_CHANGE_SET_ID,
    iteration_id: INVESTOR_SUMMARY_ITERATION_ID,
    local_path: INVESTOR_SUMMARY_SOURCE_PATH,
    local_source_sha256: sha256(fs.readFileSync(path.join(projectRoot, INVESTOR_SUMMARY_SOURCE_PATH))),
    projection_path: INVESTOR_SUMMARY_PROJECTION_PATH,
    projection_sha256: saved.projection_sha256,
    payload_path: INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH,
    payload_sha256: saved.payload_sha256,
    financial_model_content_state_sha256: saved.financial_model_content_state_sha256,
    google_file_id: file.id,
    google_mime_type: file.mimeType,
    google_title: file.name,
    web_view_link: file.webViewLink,
    published_at: saved.published_at,
    synced_at: new Date().toISOString(),
    action: saved.action,
    source_status: "research",
    source_version: "0.1",
    sheets: result.titles,
    readback_hash: result.readback_hash,
    remote_readback_sha256: result.readback_hash,
    readback: "passed",
    validation_status: "passed",
    result: "passed",
    validation: {
      folder_guard: "passed",
      native_google_sheet: true,
      exact_single_file: true,
      existing_google_files_changed: false,
      exact_tab_order: "passed",
      exact_tab_count: result.tab_count,
      frozen_panes: "passed",
      formula_errors: result.formula_errors,
      investor_copy_only: "passed",
    },
    content_commit_hash: null,
    commit_note: "Investor Financial Summary publication is intentionally pre-commit pending visual owner approval.",
  };
  writeYaml(receiptFile, receipt);
  writeSecretJson(runtimeResultPath, { ...saved, readback: "passed", readback_hash: result.readback_hash, synced_at: receipt.synced_at });
  const output = { google_file_id_masked: mask(file.id), web_view_link: file.webViewLink, ...result, validation: "passed" };
  console.log(JSON.stringify(output, null, 2));
  return output;
}
