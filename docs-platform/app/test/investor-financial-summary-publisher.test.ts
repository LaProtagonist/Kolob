import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildInvestorSummaryGooglePayload } from "../src/financial/investor-summary-google-sheet.js";
import {
  INVESTOR_SUMMARY_DECISION_ID,
  INVESTOR_SUMMARY_GOOGLE_TITLE,
  chooseInvestorSummarySpreadsheetTarget,
  formatRequests,
  requireInvestorSummarySheetId,
  validateInvestorSummaryReadback,
} from "../src/google/investor-summary-publisher.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = { id: "investor-summary", name: INVESTOR_SUMMARY_GOOGLE_TITLE, mimeType: "application/vnd.google-apps.spreadsheet", parents: ["folder"], trashed: false };

test("Investor Summary target resolver creates once, reuses the linked file and rejects duplicates", () => {
  assert.deepEqual(chooseInvestorSummarySpreadsheetTarget([], null), { action: "create", file: null });
  assert.throws(() => chooseInvestorSummarySpreadsheetTarget([file], null), /unregistered/);
  assert.deepEqual(chooseInvestorSummarySpreadsheetTarget([file], file.id), { action: "reuse", file });
  assert.throws(() => chooseInvestorSummarySpreadsheetTarget([], file.id), /linked Investor Summary/);
  assert.throws(() => chooseInvestorSummarySpreadsheetTarget([file, { ...file, id: "duplicate" }], null), /Multiple spreadsheets/);
});

test("Investor Summary tab resolver accepts Google sheetId zero", () => {
  assert.equal(requireInvestorSummarySheetId(0, "Основные показатели"), 0);
  assert.equal(requireInvestorSummarySheetId(42, "Допущения"), 42);
  assert.throws(() => requireInvestorSummarySheetId(undefined, "Сценарии"), /Missing Google Sheet tab/);
});

test("Investor Summary readback requires exact values, five-tab order, frozen panes and zero errors", () => {
  const payload = buildInvestorSummaryGooglePayload();
  const actual = payload.sheets.map(item => ({ name: item.name, values: structuredClone(item.values) }));
  const titles = payload.sheets.map(item => item.name);
  const frozen = payload.sheets.map(item => ({ rows: item.frozen_rows, columns: item.frozen_columns }));
  const rendered = payload.sheets.map(item => structuredClone(item.values));
  const result = validateInvestorSummaryReadback(payload.sheets, actual, titles, frozen, rendered);
  assert.equal(result.tab_count, 5);
  assert.equal(result.formula_errors, 0);
  assert.match(result.readback_hash, /^[a-f0-9]{64}$/);

  const changed = structuredClone(actual);
  changed[0].values[5][0] = 1;
  assert.throws(() => validateInvestorSummaryReadback(payload.sheets, changed, titles, frozen, rendered), /readback differs/);
  assert.throws(() => validateInvestorSummaryReadback(payload.sheets, actual, [...titles].reverse(), frozen, rendered), /wrong five-tab order/);
  const changedFrozen = structuredClone(frozen);
  changedFrozen[0].rows = 0;
  assert.throws(() => validateInvestorSummaryReadback(payload.sheets, actual, titles, changedFrozen, rendered), /frozen panes differ/);
  const errors = structuredClone(rendered);
  errors[1][4][1] = "#REF!";
  assert.throws(() => validateInvestorSummaryReadback(payload.sheets, actual, titles, frozen, errors), /formula errors/);
});

test("Investor Summary formatting contains no overlapping merge ranges", () => {
  const payload = buildInvestorSummaryGooglePayload();
  const sheetIds = new Map(payload.sheets.map((item, index) => [item.name, index + 1]));
  const merges = formatRequests(sheetIds, payload.sheets)
    .map(request => request.mergeCells?.range)
    .filter((range): range is NonNullable<typeof range> => Boolean(range));
  for (let leftIndex = 0; leftIndex < merges.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < merges.length; rightIndex += 1) {
      const left = merges[leftIndex];
      const right = merges[rightIndex];
      if (left.sheetId !== right.sheetId) continue;
      const rowsOverlap = (left.startRowIndex ?? 0) < (right.endRowIndex ?? 0) && (right.startRowIndex ?? 0) < (left.endRowIndex ?? 0);
      const columnsOverlap = (left.startColumnIndex ?? 0) < (right.endColumnIndex ?? 0) && (right.startColumnIndex ?? 0) < (left.endColumnIndex ?? 0);
      assert.equal(rowsOverlap && columnsOverlap, false, `overlapping merge requests ${leftIndex} and ${rightIndex}`);
    }
  }
});

test("Investor Summary final number formats keep scenario money, percentages and integer KPI distinct", () => {
  const payload = buildInvestorSummaryGooglePayload();
  const sheetIds = new Map(payload.sheets.map((item, index) => [item.name, index + 1]));
  const requests = formatRequests(sheetIds, payload.sheets);
  const scenarioSheet = payload.sheets.find(item => item.name === "Сценарии")!;
  const scenarioSheetId = sheetIds.get(scenarioSheet.name)!;
  const formats = new Map<string, string>();
  for (const request of requests) {
    const range = request.repeatCell?.range;
    const pattern = request.repeatCell?.cell?.userEnteredFormat?.numberFormat?.pattern;
    if (!range || !pattern || range.sheetId !== scenarioSheetId) continue;
    for (let row = range.startRowIndex ?? 0; row < (range.endRowIndex ?? 0); row += 1) {
      for (let column = range.startColumnIndex ?? 0; column < (range.endColumnIndex ?? 0); column += 1) formats.set(`${row}:${column}`, pattern);
    }
  }
  const rowOf = (label: string, after = -1) => scenarioSheet.values.findIndex((row, index) => index > after && row[0] === label);
  const salesRow = rowOf("Продажи в месяц в зрелом режиме");
  const marginRow = rowOf("Операционная маржа");
  const matrixSection = rowOf("Чеки в день × средний чек — операционная маржа");
  const matrixHeader = rowOf("Чеков в день", matrixSection);
  assert.match(formats.get(`${salesRow}:1`) ?? "", /₽/);
  assert.match(formats.get(`${marginRow}:1`) ?? "", /%/);
  assert.match(formats.get(`${matrixHeader + 1}:1`) ?? "", /%/);
  assert.doesNotMatch(formats.get(`${salesRow}:1`) ?? "", /%/);
});

test("Investor Summary preview is read-only, apply uses the approved decision and readback is cached by payload", () => {
  const source = fs.readFileSync(path.join(platform, "app/src/google/investor-summary-publisher.ts"), "utf8");
  const previewBody = source.slice(source.indexOf("export async function previewInvestorSummarySheet"), source.indexOf("async function createSpreadsheet"));
  assert.doesNotMatch(previewBody, /files\.create|values\.batchUpdate|spreadsheets\.batchUpdate/);
  const applyBody = source.slice(source.indexOf("export async function applyInvestorSummarySheet"), source.indexOf("export async function readbackInvestorSummarySheet"));
  assert.match(applyBody, /Apply requires --apply --decision/);
  assert.equal(INVESTOR_SUMMARY_DECISION_ID, "DEC-INVESTOR-FINANCIAL-SUMMARY-2026-08-16-01");
  assert.match(source, /prior\.payload_sha256 === saved\.payload_sha256/);
  assert.match(source, /readback: "REUSED"/);
  assert.match(source, /unmergeCells/);
  assert.match(source, /getAuthorizedClient/);
  assert.doesNotMatch(source, /@google-cloud\/local-auth|new google\.auth\.OAuth2/);
});
