import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readRegister } from "../src/capex/register.js";
import { readModularSources } from "../src/capex/modular.js";
import { PILOT_DECISION_ID, PILOT_ITERATION_ID } from "../src/capex/pilot-expansion-workflow.js";
import {
  CAPEX_REGISTER_GOOGLE_TITLE,
  CAPEX_REGISTER_SHEET_NAMES,
  EQUIPMENT_SHEET_HEADERS,
  LEGACY_SHEET_RENAMES,
  chooseSpreadsheetTarget,
  sheetDatasets,
  sheetPreviewForLog,
} from "../src/google/capex-register-publisher.js";

const platform = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const register = readRegister();
const sources = readModularSources();

test("Google Sheet contract has the exact eleven localized tabs in stable order", () => {
  assert.equal(CAPEX_REGISTER_GOOGLE_TITLE, "03 — CAPEX — Реестр оснащения пилотного объекта");
  assert.deepEqual(CAPEX_REGISTER_SHEET_NAMES, ["Описание", "Конфигуратор", "Комплектация", "Переопределения", "Оснащение", "Модули", "Форматы точек", "Состав форматов", "Открытые параметры", "Недостающие разделы", "Справочники"]);
  const datasets = sheetDatasets(register, sources, "2026-08-01T00:00:00.000Z");
  assert.deepEqual(datasets.map(dataset => dataset.name), [...CAPEX_REGISTER_SHEET_NAMES]);
  assert.equal(datasets.find(dataset => dataset.name === "Оснащение")?.values.length, 161);
  assert.equal(datasets.find(dataset => dataset.name === "Форматы точек")?.values.length, 8);
  assert.equal(datasets.find(dataset => dataset.name === "Комплектация")?.values.length, 163);
  for (const legacy of Object.keys(LEGACY_SHEET_RENAMES)) assert.equal(datasets.some(dataset => dataset.name === legacy), false);
});

test("Sheet datasets keep numerical equipment fields numeric or blank, never tbd", () => {
  const equipment = sheetDatasets(register, sources, "2026-08-01T00:00:00.000Z").find(dataset => dataset.name === "Оснащение")!;
  const headers = equipment.values[0] as string[];
  for (const [field, header] of [
    ["quantity_min", "quantity_min"], ["quantity_base", "quantity_base"], ["quantity_scale_ready", "quantity_scale_ready"],
    ["power_kw", "power_kw"], ["voltage", "voltage"], ["price_min", "Цена min"], ["price_base", "Цена base"], ["price_max", "Цена max"],
  ]) {
    const column = headers.indexOf(header);
    assert.notEqual(column, -1);
    for (const row of equipment.values.slice(1)) assert.equal(row[column] === "" || typeof row[column] === "number", true, `${field}: ${row[column]}`);
  }
  for (const header of ["Цена min", "Цена base", "Цена max", "Валюта", "Поставщик", "Ссылка", "Дата проверки", "Наличие", "Статус КП", "Уверенность", "Комментарий по цене"]) assert.equal(EQUIPMENT_SHEET_HEADERS.includes(header), true, header);
  assert.equal(equipment.values.slice(1).filter(row => typeof row[headers.indexOf("Цена base")] === "number").length, 43);
});

test("configurator and BOM contain formulas, validation-ready IDs and no invented template values", () => {
  const datasets = sheetDatasets(register, sources, "2026-08-01T00:00:00.000Z");
  const configurator = datasets.find(dataset => dataset.name === "Конфигуратор")!;
  assert.equal(configurator.values[1][0], "CFG-TEMPLATE-001");
  assert.equal(configurator.values[1][2], "FMT-CUSTOM");
  for (let column = 3; column <= 22; column += 1) assert.equal(configurator.values[1][column], "", `configurator column ${column}`);
  assert.match(String(configurator.values[1].at(-1)), /^=IF\(/);
  const bom = datasets.find(dataset => dataset.name === "Комплектация")!;
  assert.equal(bom.values[0][1], "CFG-PILOT-001");
  assert.match(String(bom.values[3][4]), /^=IF\(/);
  assert.match(String(bom.values[3][13]), /^=IFERROR\(/);
});

test("manual override and configurator draft rows survive deterministic dataset regeneration", () => {
  const preserved = {
    configurator: [["CFG-TEMPLATE-001", "Google draft", "FMT-CUSTOM", 10, "", "", "", "", "", "", "", "", "", true]],
    overrides: [["CFG-TEMPLATE-001", "CAPEX-05-001", "include", "", "", "conditional", "manual test", "research", "keep"]],
  };
  const datasets = sheetDatasets(register, sources, "2026-08-01T00:00:00.000Z", preserved);
  const configurator = datasets.find(dataset => dataset.name === "Конфигуратор")!;
  const overrides = datasets.find(dataset => dataset.name === "Переопределения")!;
  assert.equal(configurator.values[1][1], "Google draft");
  assert.equal(configurator.values[1][3], 10);
  assert.match(String(configurator.values[1].at(-1)), /^=IF\(/);
  assert.deepEqual(overrides.values[1].slice(0, 3), ["CFG-TEMPLATE-001", "CAPEX-05-001", "include"]);
  assert.equal(overrides.values[1][8], "keep");
});

test("exact-folder resolver updates one existing Sheet and refuses zero or duplicate targets", () => {
  const file = { id: "sheet-id", name: CAPEX_REGISTER_GOOGLE_TITLE, mimeType: "application/vnd.google-apps.spreadsheet", parents: ["folder"], trashed: false };
  assert.throws(() => chooseSpreadsheetTarget([]), /not found/);
  assert.deepEqual(chooseSpreadsheetTarget([file]), { action: "update", file });
  assert.throws(() => chooseSpreadsheetTarget([file, { ...file, id: "second" }]), /Multiple spreadsheets/);
});

test("preview logging masks the Google file ID and binds the current approved configurator decision", () => {
  const logged = sheetPreviewForLog({
    preview_id: "p", created_at: "2026-08-01T00:00:00.000Z", registry_id: "DOC-CAPEX-EQUIPMENT-REGISTER",
    google_title: CAPEX_REGISTER_GOOGLE_TITLE, folder_name: "Колобочная — Investment", folder_check: "passed", action: "update",
    google_file_id: "1234567890abcdef", google_file_id_masked: "1234…cdef", decision_id: PILOT_DECISION_ID,
    iteration_id: PILOT_ITERATION_ID, source_yaml_path: "docs-platform/working/capex-equipment-register.yaml",
    source_yaml_sha256: "a".repeat(64), source_record_count: 124, equipment_record_count: 160, mapped_record_count: 124,
    unmapped_record_count: 0, sheets: CAPEX_REGISTER_SHEET_NAMES, legacy_sheet_renames: LEGACY_SHEET_RENAMES, warnings: [],
  });
  assert.equal("google_file_id" in logged, false);
  assert.equal(logged.google_file_id_masked, "1234…cdef");
  assert.equal(logged.decision_id, PILOT_DECISION_ID);
});

test("Google preview and override preview contain no write path", () => {
  const publisher = fs.readFileSync(path.join(platform, "app", "src", "google", "capex-register-publisher.ts"), "utf8");
  const previewBody = publisher.slice(publisher.indexOf("export async function previewCapexRegisterSheet"), publisher.indexOf("async function readRangeIfPresent"));
  assert.doesNotMatch(previewBody, /files\.create|values\.batch(?:Update|Clear)|spreadsheets\.batchUpdate/);
  const importBody = publisher.slice(publisher.indexOf("export async function importCapexOverrides"));
  assert.match(importBody, /Use --preview/);
  assert.doesNotMatch(importBody, /values\.batchUpdate|spreadsheets\.batchUpdate/);
});
