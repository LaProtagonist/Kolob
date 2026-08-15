import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildFinancialGoogleSheetsPayload } from "../src/financial/google-sheet.js";
import {
  FINANCIAL_MODEL_DECISION_ID,
  FINANCIAL_FORMULA_INPUT_LOCALE,
  FINANCIAL_MODEL_GOOGLE_TITLE,
  chooseFinancialSpreadsheetTarget,
  financialFormulaWriteData,
  normalizeFinancialFormulaLocale,
  requireFinancialSheetId,
  validateFinancialSheetReadback,
} from "../src/google/financial-model-publisher.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = { id: "financial-sheet", name: FINANCIAL_MODEL_GOOGLE_TITLE, mimeType: "application/vnd.google-apps.spreadsheet", parents: ["folder"], trashed: false };

test("Financial Sheet target resolver creates only when no title match exists and refuses unlinked or duplicate files", () => {
  assert.deepEqual(chooseFinancialSpreadsheetTarget([], null), { action: "create", file: null });
  assert.throws(() => chooseFinancialSpreadsheetTarget([file], null), /unregistered/);
  assert.deepEqual(chooseFinancialSpreadsheetTarget([file], file.id), { action: "reuse", file });
  assert.throws(() => chooseFinancialSpreadsheetTarget([], file.id), /linked Financial Model Sheet/);
  assert.throws(() => chooseFinancialSpreadsheetTarget([file, { ...file, id: "duplicate" }], null), /Multiple spreadsheets/);
});

test("Financial Sheet tab resolver accepts Google sheetId zero", () => {
  assert.equal(requireFinancialSheetId(0, "01 Описание"), 0);
  assert.equal(requireFinancialSheetId(42, "02 Допущения"), 42);
  assert.throws(() => requireFinancialSheetId(undefined, "03 Продажи"), /Missing Google Sheet tab 03 Продажи/);
});

test("Financial Sheet writer leaves schedule text raw and applies USER_ENTERED only to formulas", () => {
  assert.equal(FINANCIAL_FORMULA_INPUT_LOCALE, "en_US");
  const payload = buildFinancialGoogleSheetsPayload();
  const staffing = payload.sheets.find(sheet => sheet.name === "05 Персонал")!;
  assert.ok(staffing.values.flat().includes("5/2"));
  const formulas = financialFormulaWriteData(payload.sheets);
  assert.ok(formulas.length > 0);
  assert.ok(formulas.every(item => typeof item.values[0][0] === "string" && String(item.values[0][0]).startsWith("=")));
  assert.ok(formulas.every(item => item.values[0][0] !== "5/2"));
});

test("Financial Sheet readback normalizes Russian formula separators without touching quoted text", () => {
  const localized = '=IF(ABS(A1-C4)<0,0001;"OK";"ERROR")';
  assert.equal(normalizeFinancialFormulaLocale(localized), '=IF(ABS(A1-C4)<0.0001,"OK","ERROR")');
  assert.equal(normalizeFinancialFormulaLocale("=MAX(A1,0)"), "=MAX(A1,0)");
  assert.equal(normalizeFinancialFormulaLocale("5/2"), "5/2");
});

test("Financial Sheet readback requires exact formulas, tab order, eleven OK checks and no rendered formula errors", () => {
  const payload = buildFinancialGoogleSheetsPayload();
  const actual = payload.sheets.map(sheet => ({ name: sheet.name, values: structuredClone(sheet.values) }));
  const titles = payload.sheets.map(sheet => sheet.name);
  const statuses = Array.from({ length: 11 }, () => ["OK"]);
  const rendered = payload.sheets.map(sheet => structuredClone(sheet.values));
  const passed = validateFinancialSheetReadback(payload.sheets, actual, titles, statuses, rendered);
  assert.equal(passed.check_count, 11);
  assert.equal(passed.formula_errors, 0);
  assert.match(passed.readback_hash, /^[a-f0-9]{64}$/);

  const localized = structuredClone(actual);
  localized[0].values[12][1] = '=IF(COUNTIF(\'16 Проверки\'!D4:D14;"<>OK")=0;"PASS";"FAIL")';
  assert.equal(validateFinancialSheetReadback(payload.sheets, localized, titles, statuses, rendered).check_count, 11);

  const changed = structuredClone(actual);
  changed[2].values[4][1] = 301;
  assert.throws(() => validateFinancialSheetReadback(payload.sheets, changed, titles, statuses, rendered), /Google readback differs/);
  assert.throws(() => validateFinancialSheetReadback(payload.sheets, actual, [...titles].reverse(), statuses, rendered), /wrong 16-tab order/);
  assert.throws(() => validateFinancialSheetReadback(payload.sheets, actual, titles, [["ERROR"], ...statuses.slice(1)], rendered), /did not all return OK/);
  const errors = structuredClone(rendered);
  errors[7][23][2] = "#REF!";
  assert.throws(() => validateFinancialSheetReadback(payload.sheets, actual, titles, statuses, errors), /formula errors/);
});

test("Financial Sheet preview is read-only and apply is bound to the approved decision and existing OAuth client", () => {
  const source = fs.readFileSync(path.join(platform, "app", "src", "google", "financial-model-publisher.ts"), "utf8");
  const previewBody = source.slice(source.indexOf("export async function previewFinancialModelSheet"), source.indexOf("async function createSpreadsheet"));
  assert.doesNotMatch(previewBody, /files\.create|values\.batchUpdate|spreadsheets\.batchUpdate/);
  const applyBody = source.slice(source.indexOf("export async function applyFinancialModelSheet"), source.indexOf("export async function readbackFinancialModelSheet"));
  assert.match(applyBody, /Apply requires --apply --decision \$\{FINANCIAL_MODEL_DECISION_ID\}/);
  assert.equal(FINANCIAL_MODEL_DECISION_ID, "DEC-FINANCIAL-MODEL-2026-08-16-01");
  assert.match(source, /getAuthorizedClient/);
  assert.doesNotMatch(source, /@google-cloud\/local-auth|new google\.auth\.OAuth2/);
});
