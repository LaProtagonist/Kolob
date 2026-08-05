import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, type drive_v3, type sheets_v4 } from "googleapis";
import YAML from "yaml";
import {
  CAPEX_REGISTER_DOCUMENT_ID,
  EQUIPMENT_COLUMNS,
  readRegister,
  registerStatistics,
  serializeRegister,
  sha256,
  validateRegister,
  type CapexRegister,
} from "../capex/register.js";
import { readPriceResearch } from "../capex/price-research.js";
import {
  PILOT_CONFIGURATION_ID,
} from "../capex/pilot-expansion-workflow.js";
import {
  REMAINING_PRICE_CHANGE_ID,
  REMAINING_PRICE_DECISION_ID,
  REMAINING_PRICE_GOOGLE_RECEIPT_PATH,
  REMAINING_PRICE_ITERATION_ID,
} from "../capex/remaining-price-workflow.js";
import {
  AGGREGATION_RULES,
  CAPEX_FORMAT_IDS,
  CAPEX_MODULE_IDS,
  OVERRIDE_ACTIONS,
  QUANTITY_RULE_TYPES,
  readModularSources,
  validateModularSources,
  type ModularSources,
  type ModuleItemLink,
} from "../capex/modular.js";
import { getAuthorizedClient } from "./auth.js";
import { loadConfig, platformRoot, writeSecretJson } from "./config.js";
import { assertKnownFile, findNamedSpreadsheetsInProjectFolder, getProjectFolder } from "./drive.js";
import { SHEET_MIME, type DriveFile, type GoogleConfig } from "./types.js";

export const CAPEX_REGISTER_GOOGLE_TITLE = "03 — CAPEX — Реестр оснащения пилотного объекта";
export const CAPEX_REGISTER_SHEET_NAMES = [
  "Описание", "Конфигуратор", "Комплектация", "Переопределения", "Оснащение", "Модули",
  "Форматы точек", "Состав форматов", "Открытые параметры", "Недостающие разделы", "Справочники",
] as const;
export const LEGACY_SHEET_RENAMES = {
  README: "Описание",
  EQUIPMENT: "Оснащение",
  OPEN_PARAMETERS: "Открытые параметры",
  MISSING_SECTIONS: "Недостающие разделы",
  DICTIONARIES: "Справочники",
} as const;

const projectRoot = path.resolve(platformRoot, "..");
const runtimePreviewPath = path.join(platformRoot, ".runtime", "capex-register-sheet-preview.json");
const runtimeResultPath = path.join(platformRoot, ".runtime", "capex-register-sheet-result.json");
const runtimeOverridePreviewPath = path.join(platformRoot, ".runtime", "capex-overrides-import-preview.json");
export const capexSheetReceiptPath = path.resolve(projectRoot, REMAINING_PRICE_GOOGLE_RECEIPT_PATH);

type MatrixValue = string | number | boolean;
type Matrix = MatrixValue[][];
type Dataset = { name: typeof CAPEX_REGISTER_SHEET_NAMES[number]; headers?: string[]; values: Matrix; headerRow?: number };
type PreservedRows = { configurator: Matrix; overrides: Matrix };
type SheetPreview = {
  preview_id: string;
  created_at: string;
  registry_id: typeof CAPEX_REGISTER_DOCUMENT_ID;
  google_title: typeof CAPEX_REGISTER_GOOGLE_TITLE;
  folder_name: string;
  folder_check: "passed";
  action: "update";
  google_file_id: string;
  google_file_id_masked: string;
  decision_id: string;
  iteration_id: string;
  source_yaml_path: string;
  source_yaml_sha256: string;
  source_record_count: number;
  equipment_record_count: number;
  mapped_record_count: number;
  unmapped_record_count: number;
  sheets: readonly string[];
  legacy_sheet_renames: typeof LEGACY_SHEET_RENAMES;
  warnings: string[];
};

const CONFIGURATOR_HEADERS = [
  "ID конфигурации", "Название", "Формат точки", "Общая площадь", "Гостевая площадь", "Количество залов",
  "Количество посадочных мест", "Количество кассовых постов", "Количество горячих рабочих постов", "Количество начинок",
  "Количество станций самообслуживания", "Пиковые заказы в час", "Заказы в день", "Бар", "Алкогольное направление",
  "Заготовочное производство", "Модуль выращивания", "Централизованное снабжение", "Собственная посадка",
  "Общая посадка фудкорта", "Многоразовая посуда", "Мобильный формат", "Самообслуживание",
  "Дополнительные модули", "Исключённые модули", "Комментарий", "Активные модули (расчёт)",
] as const;
const OVERRIDE_HEADERS = ["configuration_id", "item_id", "action", "quantity_override", "specification_override", "requirement_override", "reason", "lifecycle_status", "notes"] as const;
const BOM_HEADERS = ["item_id", "module_id", "наименование", "обязательность", "количество", "единица", "правило расчёта", "источник включения", "входит в комплект другой системы", "переопределение", "открытые параметры", "комментарий", "статус расчёта", "активен"] as const;
const EQUIPMENT_HEADER_OVERRIDES: Partial<Record<typeof EQUIPMENT_COLUMNS[number], string>> = {
  price_min: "Цена min",
  price_base: "Цена base",
  price_max: "Цена max",
  currency: "Валюта",
  supplier: "Поставщик",
  source_url: "Ссылка",
  price_source_type: "Тип источника",
  checked_at: "Дата проверки",
  availability_status: "Наличие",
  quote_status: "Статус КП",
  confidence: "Уверенность",
  price_notes: "Комментарий по цене",
};
export const EQUIPMENT_SHEET_HEADERS = EQUIPMENT_COLUMNS.map(column => EQUIPMENT_HEADER_OVERRIDES[column] ?? String(column));
function equipmentHeader(column: typeof EQUIPMENT_COLUMNS[number]) { return EQUIPMENT_HEADER_OVERRIDES[column] ?? String(column); }

async function services() {
  const auth = await getAuthorizedClient();
  return { drive: google.drive({ version: "v3", auth }), sheets: google.sheets({ version: "v4", auth }) };
}
function mask(id: string) { return `${id.slice(0, 4)}…${id.slice(-4)}`; }
function documentsRegistry() { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "documents.yaml"), "utf8"))?.documents ?? []) as Array<{ id: string; google_file_id?: string | null; status: string }> ; }
function approvedDecision(decisionId: string) { return (YAML.parse(fs.readFileSync(path.join(platformRoot, "registry", "decisions.yaml"), "utf8"))?.decisions ?? []).some((item: { id: string; status: string }) => item.id === decisionId && item.status === "approved"); }

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
  if (matches.length === 0) throw new Error("The existing CAPEX Google Sheet was not found inside the project folder; this iteration is not allowed to create a new file.");
  return { action: "update" as const, file: matches[0] };
}

function sourceDocLink() {
  const id = documentsRegistry().find(item => item.id === "DOC-CAPEX-EQUIPMENT-SPECIFICATION")?.google_file_id;
  if (!id) throw new Error("The source CAPEX specification has no registered Google file ID.");
  return `https://docs.google.com/document/d/${id}/preview`;
}
function matrixValue(value: unknown): MatrixValue {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (["string", "number", "boolean"].includes(typeof value)) return value as MatrixValue;
  return JSON.stringify(value);
}
function activeModulesFormula(row: number) {
  return `=IF(A${row}="","",TEXTJOIN(",",TRUE,IFERROR(FILTER('Состав форматов'!$B$2:$B,'Состав форматов'!$A$2:$A=C${row},'Состав форматов'!$C$2:$C="required"),""),IF(N${row}=TRUE,"MOD-BAR",""),IF(P${row}=TRUE,"MOD-PREP",""),IF(Q${row}=TRUE,"MOD-GROW",""),IF(S${row}=TRUE,"MOD-GUEST",""),IF(W${row}=TRUE,"MOD-TAKEAWAY",""),X${row}))`;
}
function localConfiguratorRows(sources: ModularSources): Matrix {
  return sources.configurations.configurations.map((configuration, index) => [
    configuration.configuration_id, configuration.name, configuration.format_id, matrixValue(configuration.total_area_m2), matrixValue(configuration.guest_area_m2),
    matrixValue(configuration.hall_count), matrixValue(configuration.seat_count), matrixValue(configuration.cashier_post_count), matrixValue(configuration.hot_kitchen_post_count),
    matrixValue(configuration.filling_count), matrixValue(configuration.service_station_count), matrixValue(configuration.peak_orders_per_hour), matrixValue(configuration.daily_orders),
    matrixValue(configuration.bar_enabled), matrixValue(configuration.alcohol_enabled), matrixValue(configuration.prep_enabled), matrixValue(configuration.grow_enabled),
    matrixValue(configuration.central_supply_enabled), "", matrixValue(configuration.shared_seating), matrixValue(configuration.reusable_tableware_enabled),
    matrixValue(configuration.mobile_format), matrixValue(configuration.self_service_enabled), matrixValue(configuration.selected_modules), matrixValue(configuration.excluded_modules),
    matrixValue(configuration.notes), activeModulesFormula(index + 2),
  ]);
}
function mergePreservedRows(localRows: Matrix, remoteRows: Matrix, width: number, formulaColumn?: number) {
  const result = new Map<string, MatrixValue[]>();
  for (const row of localRows) if (String(row[0] ?? "")) result.set(String(row[0]), [...row]);
  for (const row of remoteRows) {
    const key = String(row[0] ?? "").trim();
    if (!key || key === CONFIGURATOR_HEADERS[0] || key === OVERRIDE_HEADERS[0]) continue;
    const normalized = Array.from({ length: width }, (_, index) => matrixValue(row[index]));
    result.set(key, normalized);
  }
  return [...result.values()].map((row, index) => {
    if (formulaColumn !== undefined) row[formulaColumn] = activeModulesFormula(index + 2);
    return row;
  });
}
function mergeOverrideRows(localRows: Matrix, remoteRows: Matrix) {
  const result = new Map<string, MatrixValue[]>();
  for (const row of [...localRows, ...remoteRows]) {
    const configurationId = String(row[0] ?? "").trim();
    const itemId = String(row[1] ?? "").trim();
    if (!configurationId || !itemId || configurationId === OVERRIDE_HEADERS[0]) continue;
    result.set(`${configurationId}\u0000${itemId}`, Array.from({ length: OVERRIDE_HEADERS.length }, (_, index) => matrixValue(row[index])));
  }
  return [...result.values()];
}
function configLookup(column: string) { return `INDEX('Конфигуратор'!$${column}:$${column},MATCH($B$1,'Конфигуратор'!$A:$A,0))`; }
function overrideActionFormula(row: number) { return `IFERROR(INDEX(FILTER('Переопределения'!$C$2:$C,'Переопределения'!$A$2:$A=$B$1,'Переопределения'!$B$2:$B=$A${row}),1),"")`; }
function moduleActiveExpression(moduleIds: string[]) {
  if (!moduleIds.length) return "FALSE";
  const active = configLookup("AA");
  const excluded = configLookup("Y");
  const included = moduleIds.map(moduleId => `REGEXMATCH(","&${active}&",",",${moduleId},")`).join(",");
  const blocked = moduleIds.map(moduleId => `REGEXMATCH(","&${excluded}&",",",${moduleId},")`).join(",");
  return `AND(OR(${included}),NOT(OR(${blocked})))`;
}
function activeFormula(row: number, links: ModuleItemLink[]) {
  const action = overrideActionFormula(row);
  return `=IFERROR(IF(${action}="exclude",FALSE,IF(${action}="include",TRUE,${moduleActiveExpression(links.map(link => link.module_id))})),FALSE)`;
}
function ruleQuantityExpression(link: ModuleItemLink) {
  if (link.quantity_rule_type === "fixed" && link.quantity_rule_value !== null) return String(link.quantity_rule_value);
  if (link.quantity_rule_value === null) return null;
  const columns: Record<string, string> = { per_seat: "G", per_guest_area_m2: "E", per_workstation: "I", per_cashier_post: "H", per_hot_kitchen_post: "I", per_filling: "J", per_station: "K" };
  const column = columns[link.quantity_rule_type];
  return column ? `IF(ISNUMBER(${configLookup(column)}),${configLookup(column)}*${link.quantity_rule_value},"")` : null;
}
function quantityFormula(row: number, links: ModuleItemLink[]) {
  const action = overrideActionFormula(row);
  const overrideQuantity = `IFERROR(INDEX(FILTER('Переопределения'!$D$2:$D,'Переопределения'!$A$2:$A=$B$1,'Переопределения'!$B$2:$B=$A${row}),1),"")`;
  const expressions = links.map(ruleQuantityExpression).filter((value): value is string => Boolean(value));
  const rule = links[0]?.aggregation_rule ?? "manual";
  let calculated = "\"\"";
  if (expressions.length && links.every(link => link.aggregation_rule === rule) && rule !== "manual") {
    const values = expressions.join(",");
    calculated = rule === "sum" ? `SUM(${values})` : `MAX(${values})`;
  }
  return `=IF(N${row}=FALSE,"",IF(AND(${action}="change_quantity",ISNUMBER(${overrideQuantity})),${overrideQuantity},${calculated}))`;
}
function bomRows(register: CapexRegister, sources: ModularSources): Matrix {
  const linksByItem = new Map<string, ModuleItemLink[]>();
  for (const link of sources.module_items.links) linksByItem.set(link.item_id, [...(linksByItem.get(link.item_id) ?? []), link]);
  return register.equipment.map((item, index) => {
    const row = index + 4;
    const links = linksByItem.get(item.item_id) ?? [];
    const modules = [...new Set(links.map(link => link.module_id))].join(", ");
    const rules = [...new Set(links.map(link => link.quantity_rule_type))].join(", ");
    const action = `=IF(N${row}=FALSE,"",${overrideActionFormula(row)})`;
    return [
      item.item_id,
      `=IF(N${row}=FALSE,"","${modules}")`,
      item.name,
      item.requirement,
      quantityFormula(row, links),
      item.unit,
      rules,
      `=IF(N${row}=FALSE,"","формат / выбранные модули")`,
      item.inclusion_status === "included_in_parent",
      action,
      matrixValue(item.open_parameters),
      matrixValue(item.notes),
      `=IF(N${row}=FALSE,"",IF(E${row}="","Требует уточнения","Рассчитано"))`,
      activeFormula(row, links),
    ];
  });
}

export function sheetDatasets(register: CapexRegister, sources: ModularSources = readModularSources(), syncedAt = "1970-01-01T00:00:00.000Z", preserved: PreservedRows = { configurator: [], overrides: [] }): Dataset[] {
  const yamlHash = sha256(serializeRegister(register));
  const statistics = registerStatistics(register);
  const priceResearch = readPriceResearch();
  const description: Matrix = [
    ["Поле", "Значение"],
    ["Название", "CAPEX Equipment Register / CAPEX — Реестр оснащения пилотного объекта"],
    ["Версия", register.document.version], ["Статус", register.document.status],
    ["Локальный source file", "docs-platform/working/capex-equipment-register.yaml"], ["SHA-256 YAML", yamlHash],
    ["Дата синхронизации UTC", syncedAt], ["Исходных записей CAPEX v0.1", register.document.source_record_count],
    ["Добавлено governed research-записей", register.document.added_research_record_count], ["Всего записей Equipment Register", register.document.equipment_record_count],
    ["Mapped source records", register.document.mapped_record_count], ["Unmapped records", register.document.unmapped_record_count],
    ["Исходная текстовая спецификация", sourceDocLink()],
    ["Оценено самостоятельных позиций", priceResearch?.summary.priced_record_count ?? 0],
    ["Без цены в research-scope", priceResearch?.summary.unpriced_record_count ?? 0],
    ["MINIMUM, RUB", priceResearch?.summary.totals_rub.minimum ?? ""],
    ["BASE, RUB", priceResearch?.summary.totals_rub.base ?? ""],
    ["SCALE_READY, RUB", priceResearch?.summary.totals_rub.scale_ready ?? ""],
    ["Предупреждение", "Цены — первичная research-оценка публичных карточек, не коммерческое предложение и не утверждённый итоговый CAPEX. Доставка, монтаж, инженерия и другие исключённые расходы не добавлены."],
    ["Архитектура", "Equipment Register → функциональные модули → профили форматов → конфигурация объекта + overrides → generated BOM."],
    ["Правило изменения", "Только proposal → approved decision → preview → apply → verification → append-only timeline. Google Sheet не является самостоятельным источником утверждённых решений."],
  ];
  const localConfig = localConfiguratorRows(sources);
  const configuratorRows = mergePreservedRows(localConfig, preserved.configurator, CONFIGURATOR_HEADERS.length, CONFIGURATOR_HEADERS.length - 1);
  const configurator: Matrix = [[...CONFIGURATOR_HEADERS], ...configuratorRows];
  const overridesLocal: Matrix = sources.configuration_overrides.overrides.map(item => OVERRIDE_HEADERS.map(header => matrixValue(item[header as keyof typeof item])));
  const overrides: Matrix = [[...OVERRIDE_HEADERS], ...mergeOverrideRows(overridesLocal, preserved.overrides)];
  const bom: Matrix = [
    ["Выбранная конфигурация", sources.configurations.configurations.find(configuration => configuration.configuration_id === PILOT_CONFIGURATION_ID)?.configuration_id ?? "", ...Array(BOM_HEADERS.length - 2).fill("")],
    ["Предупреждение", "Пустые количества требуют уточнения; ноль не подставляется.", ...Array(BOM_HEADERS.length - 2).fill("")],
    [...BOM_HEADERS],
    ...bomRows(register, sources),
  ];
  const equipment: Matrix = [EQUIPMENT_SHEET_HEADERS, ...register.equipment.map(item => EQUIPMENT_COLUMNS.map(column => matrixValue(item[column])))];
  const linksByModule = new Map<string, ModuleItemLink[]>();
  for (const link of sources.module_items.links) linksByModule.set(link.module_id, [...(linksByModule.get(link.module_id) ?? []), link]);
  const moduleHeaders = ["module_id", "module_name", "module_status", "item_id", "default_requirement", "quantity_rule_type", "quantity_rule_value", "minimum_quantity", "aggregation_rule", "condition", "notes"];
  const modules: Matrix = [moduleHeaders, ...sources.modules.modules.flatMap(module => {
    const links = linksByModule.get(module.module_id) ?? [];
    if (!links.length) return [[module.module_id, module.name, module.lifecycle_status, "", "", "", "", "", "", "", matrixValue(module.notes)]];
    return links.map(link => [module.module_id, module.name, module.lifecycle_status, link.item_id, link.default_requirement, link.quantity_rule_type, matrixValue(link.quantity_rule_value), matrixValue(link.minimum_quantity), link.aggregation_rule, matrixValue(link.condition), matrixValue(link.notes)]);
  })];
  const formatHeaders = ["format_id", "name", "purpose", "status", "required_modules", "optional_modules", "conditional_modules", "excluded_modules", "exclusion_mode", "manual_selection", "notes"];
  const formats: Matrix = [formatHeaders, ...sources.point_formats.formats.map(item => [item.format_id, item.name, item.purpose, item.lifecycle_status, matrixValue(item.required_modules), matrixValue(item.optional_modules), matrixValue(item.conditional_modules), matrixValue(item.excluded_modules), item.exclusion_mode, item.manual_selection, matrixValue(item.notes)])];
  const formatComposition: Matrix = [["format_id", "module_id", "role"], ...sources.point_formats.formats.flatMap(format => [
    ...format.required_modules.map(module => [format.format_id, module, "required"]),
    ...format.optional_modules.map(module => [format.format_id, module, "optional"]),
    ...format.conditional_modules.map(module => [format.format_id, module, "conditional"]),
    ...format.excluded_modules.map(module => [format.format_id, module, format.exclusion_mode]),
  ])];
  const openHeaders = ["parameter_id", "item_id", "module_id", "parameter", "reason", "required_before", "status", "notes"];
  const open: Matrix = [openHeaders, ...register.open_parameters.map(item => openHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  const missingHeaders = ["section_id", "name", "status", "dependencies", "notes"];
  const missing: Matrix = [missingHeaders, ...register.missing_sections.map(item => missingHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  const dictionaryHeaders = ["dictionary", "value", "description"];
  const modularDictionaries = [
    ...QUANTITY_RULE_TYPES.map(value => ({ dictionary: "quantity_rule_type", value, description: "Правило расчёта количества." })),
    ...AGGREGATION_RULES.map(value => ({ dictionary: "aggregation_rule", value, description: "Правило дедупликации и агрегации." })),
    ...OVERRIDE_ACTIONS.map(value => ({ dictionary: "override_action", value, description: "Действие индивидуального переопределения." })),
    ...CAPEX_MODULE_IDS.map(value => ({ dictionary: "module_id", value, description: "Стабильный ID функционального модуля." })),
    ...CAPEX_FORMAT_IDS.map(value => ({ dictionary: "format_id", value, description: "Стабильный ID профиля формата." })),
  ];
  const dictionaries: Matrix = [dictionaryHeaders, ...[...register.dictionaries, ...modularDictionaries].map(item => dictionaryHeaders.map(header => matrixValue(item[header as keyof typeof item])))];
  if (statistics.equipment_record_count !== 160) throw new Error("Google dataset requires exactly 160 equipment records for DEC-011.");
  return [
    { name: "Описание", values: description, headerRow: 1 }, { name: "Конфигуратор", headers: [...CONFIGURATOR_HEADERS], values: configurator, headerRow: 1 },
    { name: "Комплектация", headers: [...BOM_HEADERS], values: bom, headerRow: 3 }, { name: "Переопределения", headers: [...OVERRIDE_HEADERS], values: overrides, headerRow: 1 },
    { name: "Оснащение", headers: EQUIPMENT_SHEET_HEADERS, values: equipment, headerRow: 1 }, { name: "Модули", headers: moduleHeaders, values: modules, headerRow: 1 },
    { name: "Форматы точек", headers: formatHeaders, values: formats, headerRow: 1 }, { name: "Состав форматов", headers: ["format_id", "module_id", "role"], values: formatComposition, headerRow: 1 },
    { name: "Открытые параметры", headers: openHeaders, values: open, headerRow: 1 }, { name: "Недостающие разделы", headers: missingHeaders, values: missing, headerRow: 1 },
    { name: "Справочники", headers: dictionaryHeaders, values: dictionaries, headerRow: 1 },
  ];
}

function previewFingerprint(preview: Omit<SheetPreview, "preview_id" | "created_at" | "google_file_id_masked">) { return crypto.createHash("sha256").update(JSON.stringify(preview)).digest("hex"); }
export function sheetPreviewForLog(preview: SheetPreview) { const { google_file_id: _id, ...safe } = preview; return safe; }

async function currentSheetTitles(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data;
  return (metadata.sheets ?? []).map(sheet => sheet.properties?.title).filter(Boolean) as string[];
}
function validateCurrentTitles(titles: string[]) {
  const allowed = new Set([...CAPEX_REGISTER_SHEET_NAMES, ...Object.keys(LEGACY_SHEET_RENAMES)]);
  const extras = titles.filter(title => !allowed.has(title as typeof CAPEX_REGISTER_SHEET_NAMES[number]));
  if (extras.length) throw new Error(`Spreadsheet contains unexpected sheets and will not be modified automatically: ${extras.join(", ")}.`);
  for (const [legacy, localized] of Object.entries(LEGACY_SHEET_RENAMES)) if (titles.includes(legacy) && titles.includes(localized)) throw new Error(`Both legacy and localized sheets exist: ${legacy}, ${localized}.`);
}

async function computePreview() {
  const register = readRegister();
  const sources = readModularSources();
  if (register.document.decision_id !== REMAINING_PRICE_DECISION_ID || register.document.iteration_id !== REMAINING_PRICE_ITERATION_ID) throw new Error(`Google publication requires the canonical ${REMAINING_PRICE_DECISION_ID} remaining-price state.`);
  const errors = [...validateRegister(register), ...validateModularSources(register, sources)];
  if (errors.length) throw new Error(errors.join("\n"));
  const config = loadConfig();
  const { drive, sheets } = await services();
  const folder = await getProjectFolder(drive, config);
  if (folder.capabilities?.canEdit !== true) throw new Error("Project folder is not editable by the authorized account.");
  const remote = await resolveSpreadsheet(drive, config);
  const titles = await currentSheetTitles(sheets, remote.file.id);
  validateCurrentTitles(titles);
  const base: Omit<SheetPreview, "preview_id" | "created_at" | "google_file_id_masked"> = {
    registry_id: CAPEX_REGISTER_DOCUMENT_ID, google_title: CAPEX_REGISTER_GOOGLE_TITLE, folder_name: config.projectFolderName, folder_check: "passed",
    action: "update", google_file_id: remote.file.id, decision_id: REMAINING_PRICE_DECISION_ID, iteration_id: REMAINING_PRICE_ITERATION_ID,
    source_yaml_path: "docs-platform/working/capex-equipment-register.yaml", source_yaml_sha256: sha256(serializeRegister(register)),
    source_record_count: register.document.source_record_count, equipment_record_count: register.document.equipment_record_count,
    mapped_record_count: register.document.mapped_record_count, unmapped_record_count: register.document.unmapped_record_count,
    sheets: CAPEX_REGISTER_SHEET_NAMES, legacy_sheet_renames: LEGACY_SHEET_RENAMES,
    warnings: ["All price values remain research and do not approve models, suppliers, quantities, a commercial quote or final CAPEX.", "Only the existing registered Google Sheet will be updated; no Google Docs or additional files are targeted."],
  };
  const preview: SheetPreview = { ...base, preview_id: previewFingerprint(base), created_at: new Date().toISOString(), google_file_id_masked: mask(base.google_file_id) };
  return { preview, register, sources };
}

export async function previewCapexRegisterSheet() {
  const { preview } = await computePreview();
  writeSecretJson(runtimePreviewPath, preview);
  console.log(JSON.stringify(sheetPreviewForLog(preview), null, 2));
  return preview;
}

async function readRangeIfPresent(sheets: sheets_v4.Sheets, spreadsheetId: string, titles: string[], title: string, range: string) {
  if (!titles.includes(title)) return [];
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${title}'!${range}`, valueRenderOption: "FORMULA", majorDimension: "ROWS" });
  return (response.data.values ?? []) as Matrix;
}

async function ensureSheets(sheets: sheets_v4.Sheets, spreadsheetId: string) {
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data;
  const existing = metadata.sheets ?? [];
  const titles = existing.map(sheet => sheet.properties?.title).filter(Boolean) as string[];
  validateCurrentTitles(titles);
  const requests: sheets_v4.Schema$Request[] = [];
  for (const sheet of existing) {
    const title = sheet.properties?.title as keyof typeof LEGACY_SHEET_RENAMES;
    const localized = LEGACY_SHEET_RENAMES[title];
    if (localized) requests.push({ updateSheetProperties: { properties: { sheetId: sheet.properties?.sheetId, title: localized }, fields: "title" } });
  }
  const effective: string[] = titles.map(title => LEGACY_SHEET_RENAMES[title as keyof typeof LEGACY_SHEET_RENAMES] ?? title);
  for (const title of CAPEX_REGISTER_SHEET_NAMES) if (!effective.includes(title)) requests.push({ addSheet: { properties: { title } } });
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  const afterAdd = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const reorder: sheets_v4.Schema$Request[] = [];
  for (const [index, title] of CAPEX_REGISTER_SHEET_NAMES.entries()) {
    const sheet = afterAdd.find(item => item.properties?.title === title);
    if (!sheet) throw new Error(`Missing sheet ${title} after localization.`);
    reorder.push({ updateSheetProperties: { properties: { sheetId: sheet.properties?.sheetId, index }, fields: "index" } });
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reorder } });
  const result = (await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title,index))" })).data.sheets ?? [];
  const ordered = [...result].sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  const finalTitles = ordered.map(sheet => sheet.properties?.title).filter(Boolean);
  if (JSON.stringify(finalTitles) !== JSON.stringify(CAPEX_REGISTER_SHEET_NAMES)) throw new Error("Spreadsheet tab order differs from the eleven-sheet publication contract.");
  return new Map(result.map(sheet => [sheet.properties!.title!, sheet.properties!.sheetId!]));
}

function columnIndex(headers: readonly string[], name: string) { const index = headers.indexOf(name); if (index < 0) throw new Error(`Missing spreadsheet column ${name}.`); return index; }
function formattingRequests(sheetIds: Map<string, number>, datasets: Dataset[]): sheets_v4.Schema$Request[] {
  const requests: sheets_v4.Schema$Request[] = [];
  for (const dataset of datasets) {
    const sheetId = sheetIds.get(dataset.name)!;
    const rows = dataset.values.length;
    const columns = Math.max(...dataset.values.map(row => row.length));
    const headerRow = dataset.headerRow ?? 1;
    requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: headerRow } }, fields: "gridProperties.frozenRowCount" } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: headerRow - 1, endRowIndex: headerRow, startColumnIndex: 0, endColumnIndex: columns }, cell: { userEnteredFormat: { backgroundColor: { red: 0.11, green: 0.31, blue: 0.27 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, verticalAlignment: "MIDDLE", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)" } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: headerRow, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns }, cell: { userEnteredFormat: { verticalAlignment: "TOP", wrapStrategy: "WRAP" } }, fields: "userEnteredFormat(verticalAlignment,wrapStrategy)" } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: columns }, properties: { pixelSize: dataset.name === "Описание" ? 300 : 155 }, fields: "pixelSize" } });
    if (dataset.name === "Описание") requests.push({ updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: "pixelSize" } });
    if (["Оснащение", "Модули", "Форматы точек", "Состав форматов", "Открытые параметры", "Недостающие разделы", "Справочники", "Переопределения"].includes(dataset.name)) requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: headerRow - 1, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns } } } });
    if (dataset.name === "Комплектация") requests.push({ setBasicFilter: { filter: { range: { sheetId, startRowIndex: 2, endRowIndex: rows, startColumnIndex: 0, endColumnIndex: columns }, filterSpecs: [{ columnIndex: 13, filterCriteria: { hiddenValues: ["FALSE"] } }] } } });
  }
  const equipment = datasets.find(item => item.name === "Оснащение")!;
  const equipmentId = sheetIds.get("Оснащение")!;
  for (const name of ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max", "source_item_number"]) {
    const typedName = name as typeof EQUIPMENT_COLUMNS[number];
    const index = columnIndex(equipment.headers!, equipmentHeader(typedName));
    const money = ["price_min", "price_base", "price_max"].includes(name);
    requests.push({ repeatCell: { range: { sheetId: equipmentId, startRowIndex: 1, endRowIndex: equipment.values.length, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: money ? "CURRENCY" : "NUMBER", pattern: money ? "#,##0 [$₽-ru-RU]" : "0.###" } } }, fields: "userEnteredFormat.numberFormat" } });
  }
  const configId = sheetIds.get("Конфигуратор")!;
  for (const index of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) requests.push({ repeatCell: { range: { sheetId: configId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: index, endColumnIndex: index + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0.###" } } }, fields: "userEnteredFormat.numberFormat" } });
  requests.push({ setDataValidation: { range: { sheetId: configId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }, rule: { condition: { type: "ONE_OF_LIST", values: CAPEX_FORMAT_IDS.map(value => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true } } });
  for (let index = 13; index <= 22; index += 1) requests.push({ setDataValidation: { range: { sheetId: configId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: index, endColumnIndex: index + 1 }, rule: { condition: { type: "ONE_OF_LIST", values: [{ userEnteredValue: "TRUE" }, { userEnteredValue: "FALSE" }] }, strict: true, showCustomUi: true } } });
  const overrideId = sheetIds.get("Переопределения")!;
  requests.push({ setDataValidation: { range: { sheetId: overrideId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }, rule: { condition: { type: "ONE_OF_LIST", values: OVERRIDE_ACTIONS.map(value => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true } } });
  requests.push({ setDataValidation: { range: { sheetId: overrideId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 }, rule: { condition: { type: "ONE_OF_LIST", values: ["required", "optional", "conditional", "tbd"].map(value => ({ userEnteredValue: value })) }, strict: true, showCustomUi: true } } });
  const bomId = sheetIds.get("Комплектация")!;
  requests.push({ setDataValidation: { range: { sheetId: bomId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 }, rule: { condition: { type: "ONE_OF_RANGE", values: [{ userEnteredValue: "='Конфигуратор'!$A$2:$A" }] }, strict: true, showCustomUi: true } } });
  return requests;
}

function columnLetter(count: number) { let value = count; let result = ""; while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); } return result; }
function normalizedRows(values: unknown[][] | undefined, expected: Matrix) { return expected.map((row, rowIndex) => row.map((_value, column) => matrixValue(values?.[rowIndex]?.[column]))); }
function matricesHash(datasets: Dataset[]) { return sha256(JSON.stringify(Object.fromEntries(datasets.map(dataset => [dataset.name, dataset.values])))); }
function firstMatrixMismatch(expected: Matrix, actual: Matrix) {
  for (let row = 0; row < expected.length; row += 1) for (let column = 0; column < expected[row].length; column += 1) {
    if (JSON.stringify(expected[row][column]) !== JSON.stringify(actual[row]?.[column])) return { row: row + 1, column: column + 1, expected: expected[row][column], actual: actual[row]?.[column] };
  }
  return null;
}

async function publishAndReadback(drive: drive_v3.Drive, sheets: sheets_v4.Sheets, file: DriveFile, register: CapexRegister, sources: ModularSources, syncedAt: string) {
  const titlesBefore = await currentSheetTitles(sheets, file.id);
  const preserved: PreservedRows = {
    configurator: (await readRangeIfPresent(sheets, file.id, titlesBefore, "Конфигуратор", "A2:AA1000")),
    overrides: (await readRangeIfPresent(sheets, file.id, titlesBefore, "Переопределения", "A2:I1000")),
  };
  const sheetIds = await ensureSheets(sheets, file.id);
  const datasets = sheetDatasets(register, sources, syncedAt, preserved);
  await sheets.spreadsheets.values.batchClear({ spreadsheetId: file.id, requestBody: { ranges: CAPEX_REGISTER_SHEET_NAMES.map(name => `'${name}'!A:AP`) } });
  const formulaSheets = new Set<Dataset["name"]>(["Конфигуратор", "Комплектация"]);
  const staticDatasets = datasets.filter(dataset => !formulaSheets.has(dataset.name));
  const formulaDatasets = datasets.filter(dataset => formulaSheets.has(dataset.name));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: file.id, requestBody: { valueInputOption: "RAW", data: staticDatasets.map(dataset => ({ range: `'${dataset.name}'!A1`, majorDimension: "ROWS", values: dataset.values })) } });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: file.id, requestBody: { valueInputOption: "USER_ENTERED", data: formulaDatasets.map(dataset => ({ range: `'${dataset.name}'!A1`, majorDimension: "ROWS", values: dataset.values })) } });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: file.id, requestBody: { requests: formattingRequests(sheetIds, datasets) } });
  const ranges = datasets.map(dataset => `'${dataset.name}'!A1:${columnLetter(Math.max(...dataset.values.map(row => row.length)))}${dataset.values.length}`);
  const readback = await sheets.spreadsheets.values.batchGet({ spreadsheetId: file.id, ranges, majorDimension: "ROWS", valueRenderOption: "FORMULA" });
  const actual = datasets.map((dataset, index) => ({ ...dataset, values: normalizedRows(readback.data.valueRanges?.[index]?.values as unknown[][] | undefined, dataset.values) }));
  for (let index = 0; index < datasets.length; index += 1) if (JSON.stringify(actual[index].values) !== JSON.stringify(datasets[index].values)) {
    const mismatch = firstMatrixMismatch(datasets[index].values, actual[index].values);
    throw new Error(`${datasets[index].name} Google Sheets readback differs from the published dataset${mismatch ? ` at row ${mismatch.row}, column ${mismatch.column}: expected=${JSON.stringify(mismatch.expected)}, actual=${JSON.stringify(mismatch.actual)}` : ""}.`);
  }
  const metadata = (await sheets.spreadsheets.get({ spreadsheetId: file.id, fields: "sheets(properties(sheetId,title,index,gridProperties(frozenRowCount)),basicFilter)" })).data;
  const ordered = [...(metadata.sheets ?? [])].sort((a, b) => (a.properties?.index ?? 0) - (b.properties?.index ?? 0));
  const titles = ordered.map(sheet => sheet.properties?.title).filter(Boolean);
  if (JSON.stringify(titles) !== JSON.stringify(CAPEX_REGISTER_SHEET_NAMES)) throw new Error("Google Sheets readback has the wrong localized tab order.");
  if (titles.some(title => Object.keys(LEGACY_SHEET_RENAMES).includes(title!))) throw new Error("Legacy English tabs remain after publication.");
  for (const sheet of metadata.sheets ?? []) if ((sheet.properties?.gridProperties?.frozenRowCount ?? 0) < 1) throw new Error(`${sheet.properties?.title} has no frozen header area.`);
  if (!(metadata.sheets ?? []).find(sheet => sheet.properties?.title === "Оснащение")?.basicFilter) throw new Error("Оснащение basic filter is missing after readback.");
  const verified = await assertKnownFile(drive, file.id, loadConfig());
  if (!verified.webViewLink || verified.mimeType !== SHEET_MIME) throw new Error("Published spreadsheet failed Drive metadata verification.");
  return { verified, datasets, readback_hash: matricesHash(actual), preserved_override_rows: preserved.overrides.length, preserved_configurator_rows: preserved.configurator.length };
}

async function commentIds(drive: drive_v3.Drive, fileId: string) {
  const response = await drive.comments.list({ fileId, fields: "comments(id,deleted,resolved)", includeDeleted: false, pageSize: 100 });
  return (response.data.comments ?? []).map(comment => comment.id).filter(Boolean).sort();
}

export async function applyCapexRegisterSheet(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== REMAINING_PRICE_DECISION_ID) throw new Error(`Apply requires --apply --decision ${REMAINING_PRICE_DECISION_ID}.`);
  if (!approvedDecision(REMAINING_PRICE_DECISION_ID)) throw new Error(`${REMAINING_PRICE_DECISION_ID} must be approved before Google apply.`);
  if (!fs.existsSync(runtimePreviewPath)) throw new Error("Google Sheet preview is missing. Run capex:sheet:preview first.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewPath, "utf8")) as SheetPreview;
  const { preview, register, sources } = await computePreview();
  if (saved.preview_id !== preview.preview_id) throw new Error("Google Sheet state or local modular sources changed after preview.");
  const config = loadConfig();
  const { drive, sheets } = await services();
  await getProjectFolder(drive, config);
  const file = await assertKnownFile(drive, preview.google_file_id, config);
  const commentsBefore = await commentIds(drive, file.id);
  const syncedAt = new Date().toISOString();
  const result = await publishAndReadback(drive, sheets, file, register, sources, syncedAt);
  const commentsAfter = await commentIds(drive, file.id);
  if (JSON.stringify(commentsBefore) !== JSON.stringify(commentsAfter)) throw new Error("Drive comments changed during Google Sheet publication.");
  const statistics = registerStatistics(register);
  const receipt = {
    receipt_version: 1, registry_id: CAPEX_REGISTER_DOCUMENT_ID, decision_id: REMAINING_PRICE_DECISION_ID, change_set_id: REMAINING_PRICE_CHANGE_ID, iteration_id: REMAINING_PRICE_ITERATION_ID,
    local_path: "docs-platform/working/capex-equipment-register.yaml", local_sha256: sha256(serializeRegister(register)), google_file_id: result.verified.id,
    google_mime_type: result.verified.mimeType, google_title: result.verified.name, web_view_link: result.verified.webViewLink, synced_at: syncedAt,
    action: "update", source_status: "research", source_version: "0.1", sheets: CAPEX_REGISTER_SHEET_NAMES,
    source_record_count: statistics.source_record_count, added_research_record_count: statistics.added_research_record_count,
    equipment_record_count: statistics.equipment_record_count, mapped_record_count: statistics.mapped_record_count, unmapped_record_count: statistics.unmapped_record_count,
    readback_hash: result.readback_hash, readback: "passed", comments_preserved: true,
    manual_override_rows_preserved: result.preserved_override_rows, manual_configurator_rows_preserved: result.preserved_configurator_rows,
    validation_status: "passed",
    validation: { folder_guard: "passed", stable_item_order: "passed", native_google_sheet: true, localized_sheet_order: "passed", legacy_sheets_absent: true, numeric_tbd_absent: true, preliminary_prices_present: statistics.priced_record_count === 51, price_status_research: true, included_in_parent_unpriced: true, final_capex_not_approved: true },
  };
  writeSecretJson(runtimeResultPath, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function finalizeCapexRegisterSheetReceipt(contentCommitHash: string) {
  if (!/^[0-9a-f]{40}$/.test(contentCommitHash)) throw new Error("A full 40-character content commit hash is required.");
  if (!fs.existsSync(runtimeResultPath)) throw new Error("Google Sheet runtime readback is missing. Run capex:sheet:apply first.");
  if (fs.existsSync(capexSheetReceiptPath)) throw new Error("Google sync receipt for this iteration already exists; refusing to overwrite it.");
  const runtime = JSON.parse(fs.readFileSync(runtimeResultPath, "utf8"));
  if (runtime.iteration_id !== REMAINING_PRICE_ITERATION_ID || runtime.decision_id !== REMAINING_PRICE_DECISION_ID || runtime.readback !== "passed") throw new Error("Google Sheet runtime result does not match the current governed iteration.");
  if (runtime.local_sha256 !== sha256(serializeRegister(readRegister()))) throw new Error("Local CAPEX source changed after Google readback.");
  const receipt = {
    ...runtime,
    receipt_version: 2,
    content_commit_hash: contentCommitHash,
    local_source_sha256: runtime.local_sha256,
    remote_readback_sha256: runtime.readback_hash,
    result: "passed",
  };
  fs.mkdirSync(path.dirname(capexSheetReceiptPath), { recursive: true });
  fs.writeFileSync(capexSheetReceiptPath, YAML.stringify(receipt, { lineWidth: 0 }));
  console.log(JSON.stringify({ path: REMAINING_PRICE_GOOGLE_RECEIPT_PATH, iteration_id: receipt.iteration_id, content_commit_hash: receipt.content_commit_hash, result: receipt.result }, null, 2));
  return receipt;
}

export async function importCapexOverrides(options: { preview: boolean; apply: boolean }) {
  if (!options.preview || options.apply) throw new Error("Override import is read-only in this command. Use --preview; apply requires a separate approved decision and governed change set.");
  const register = readRegister();
  const sources = readModularSources();
  const config = loadConfig();
  const { drive, sheets } = await services();
  const remote = await resolveSpreadsheet(drive, config);
  const file = await assertKnownFile(drive, remote.file.id, config);
  const titles = await currentSheetTitles(sheets, file.id);
  if (!titles.includes("Переопределения")) throw new Error("The localized Переопределения sheet does not exist yet.");
  const rows = await readRangeIfPresent(sheets, file.id, titles, "Переопределения", "A2:I1000");
  const configurationIds = new Set(sources.configurations.configurations.map(item => item.configuration_id));
  const itemIds = new Set(register.equipment.map(item => item.item_id));
  const errors: string[] = [];
  const parsed = rows.filter(row => String(row[0] ?? "").trim() || String(row[1] ?? "").trim()).map((row, index) => {
    const configuration_id = String(row[0] ?? "").trim();
    const item_id = String(row[1] ?? "").trim();
    const action = String(row[2] ?? "").trim();
    const quantityRaw = row[3];
    if (!configurationIds.has(configuration_id)) errors.push(`row ${index + 2}: unknown configuration_id ${configuration_id}.`);
    if (!itemIds.has(item_id)) errors.push(`row ${index + 2}: unknown item_id ${item_id}.`);
    if (!OVERRIDE_ACTIONS.includes(action as typeof OVERRIDE_ACTIONS[number])) errors.push(`row ${index + 2}: invalid action ${action}.`);
    if (quantityRaw !== "" && quantityRaw !== undefined && typeof quantityRaw !== "number") errors.push(`row ${index + 2}: quantity_override must be numeric or blank.`);
    return { configuration_id, item_id, action, quantity_override: typeof quantityRaw === "number" ? quantityRaw : null, specification_override: String(row[4] ?? "").trim() || null, requirement_override: String(row[5] ?? "").trim() || null, reason: String(row[6] ?? "").trim(), lifecycle_status: "research", notes: String(row[8] ?? "").trim() || null };
  });
  if (errors.length) throw new Error(errors.join("\n"));
  const local = sources.configuration_overrides.overrides;
  const result = { preview: true, apply: false, google_file_id_masked: mask(file.id), row_count: parsed.length, local_row_count: local.length, changed: JSON.stringify(parsed) !== JSON.stringify(local), approved_decision_required_for_apply: true, governed_change_set_required_for_apply: true, rows: parsed };
  writeSecretJson(runtimeOverridePreviewPath, result);
  console.log(JSON.stringify({ ...result, rows: parsed.map(item => ({ configuration_id: item.configuration_id, item_id: item.item_id, action: item.action })) }, null, 2));
  return result;
}
