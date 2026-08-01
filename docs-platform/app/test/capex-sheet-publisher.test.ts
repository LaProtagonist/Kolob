import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readRegister } from "../src/capex/register.js";
import {
  CAPEX_REGISTER_GOOGLE_TITLE,
  CAPEX_REGISTER_SHEET_NAMES,
  chooseSpreadsheetTarget,
  sheetDatasets,
  sheetPreviewForLog,
} from "../src/google/capex-register-publisher.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("Google Sheet contract contains exactly the five requested sheets", () => {
  assert.equal(CAPEX_REGISTER_GOOGLE_TITLE, "03 — CAPEX — Реестр оснащения пилотного объекта");
  assert.deepEqual(CAPEX_REGISTER_SHEET_NAMES, ["README", "EQUIPMENT", "OPEN_PARAMETERS", "MISSING_SECTIONS", "DICTIONARIES"]);
  const datasets = sheetDatasets(readRegister(), "2026-08-01T00:00:00.000Z");
  assert.deepEqual(datasets.map(dataset => dataset.name), [...CAPEX_REGISTER_SHEET_NAMES]);
  assert.equal(datasets.find(dataset => dataset.name === "EQUIPMENT")?.values.length, 125);
});

test("Sheet datasets keep numeric columns numeric or blank, never tbd", () => {
  const datasets = sheetDatasets(readRegister(), "2026-08-01T00:00:00.000Z");
  const equipment = datasets.find(dataset => dataset.name === "EQUIPMENT")!;
  const headers = equipment.values[0] as string[];
  for (const field of ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max"]) {
    const column = headers.indexOf(field);
    assert.notEqual(column, -1);
    for (const row of equipment.values.slice(1)) assert.equal(row[column] === "" || typeof row[column] === "number", true, `${field}: ${row[column]}`);
  }
});

test("exact-folder resolver is deterministic and refuses duplicate names", () => {
  const file = { id: "sheet-id", name: CAPEX_REGISTER_GOOGLE_TITLE, mimeType: "application/vnd.google-apps.spreadsheet", parents: ["folder"], trashed: false };
  assert.deepEqual(chooseSpreadsheetTarget([]), { action: "create", file: null });
  assert.deepEqual(chooseSpreadsheetTarget([file]), { action: "update", file });
  assert.throws(() => chooseSpreadsheetTarget([file, { ...file, id: "second" }]), /Multiple spreadsheets/);
});

test("preview logging masks the Google file ID", () => {
  const logged = sheetPreviewForLog({
    preview_id: "p", created_at: "2026-08-01T00:00:00.000Z", registry_id: "DOC-CAPEX-EQUIPMENT-REGISTER",
    google_title: CAPEX_REGISTER_GOOGLE_TITLE, folder_name: "Колобочная — Investment", folder_check: "passed",
    action: "update", google_file_id: "1234567890abcdef", google_file_id_masked: "1234…cdef", decision_id: "DEC-007",
    iteration_id: "ITR-CAPEX-REGISTER-2026-08-01-01", source_yaml_path: "docs-platform/working/capex-equipment-register.yaml",
    source_yaml_sha256: "a".repeat(64), source_record_count: 124, mapped_record_count: 124, unmapped_record_count: 0,
    sheets: CAPEX_REGISTER_SHEET_NAMES, warnings: [],
  });
  assert.equal("google_file_id" in logged, false);
  assert.equal(logged.google_file_id_masked, "1234…cdef");
});

test("Google preview path contains no Drive or Sheets write operation", () => {
  const publisher = fs.readFileSync(path.join(platform, "app", "src", "google", "capex-register-publisher.ts"), "utf8");
  const previewBody = publisher.slice(publisher.indexOf("export async function previewCapexRegisterSheet"), publisher.indexOf("async function createSpreadsheet"));
  assert.doesNotMatch(previewBody, /files\.create|values\.batch(?:Update|Clear)|spreadsheets\.batchUpdate/);
});
