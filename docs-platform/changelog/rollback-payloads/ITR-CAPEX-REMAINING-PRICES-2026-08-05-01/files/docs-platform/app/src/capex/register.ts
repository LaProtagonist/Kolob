import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";

export const CAPEX_REGISTER_DOCUMENT_ID = "DOC-CAPEX-EQUIPMENT-REGISTER";
export const CAPEX_REGISTER_DECISION_ID = "DEC-008";
export const CAPEX_REGISTER_ITERATION_ID = "ITR-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01";
export const CAPEX_REGISTER_PROPOSAL_ID = "PROP-CAPEX-MODULAR-CONFIGURATOR-2026-08-01-01";
export const CAPEX_REGISTER_SOURCE_PATH = "docs-platform/working/capex-equipment-specification.md";
export const CAPEX_REGISTER_YAML_PATH = "docs-platform/working/capex-equipment-register.yaml";
export const CAPEX_REGISTER_CSV_PATH = "docs-platform/working/capex-equipment-register.csv";
export const CAPEX_REGISTER_SOURCE_SHA256 = "2157364e09699173fecfbfe861edf4e6fac85a0437e23aebe100caebeab599d6";
export const CAPEX_REGISTER_SOURCE_ID = "SRC-CAPEX-EQUIPMENT-SPEC-V0-1-BRIEF";
export const CAPEX_MODULAR_SOURCE_ID = "SRC-CAPEX-MODULAR-CONFIGURATOR-BRIEF";
export const SOURCE_RECORD_COUNT = 124;
export const BASE_ADDED_RESEARCH_RECORD_COUNT = 27;
export const BASE_EQUIPMENT_RECORD_COUNT = SOURCE_RECORD_COUNT + BASE_ADDED_RESEARCH_RECORD_COUNT;
export const PILOT_ADDED_RESEARCH_RECORD_COUNT = 9;
export const ADDED_RESEARCH_RECORD_COUNT = BASE_ADDED_RESEARCH_RECORD_COUNT + PILOT_ADDED_RESEARCH_RECORD_COUNT;
export const EQUIPMENT_RECORD_COUNT = SOURCE_RECORD_COUNT + ADDED_RESEARCH_RECORD_COUNT;

export const RECORD_TYPES = ["equipment", "system", "component", "accessory", "inventory", "furniture", "engineering_connection", "installation_service", "consumable", "software", "open_question"] as const;
export const INCLUSION_STATUSES = ["standalone", "included_in_parent", "purchased_separately", "tbd"] as const;
export const REQUIREMENTS = ["required", "optional", "conditional", "tbd"] as const;
export const PROCUREMENT_MODES = ["purchase", "existing", "repair", "retrofit", "lease", "supplier_provided", "tbd"] as const;
export const LIFECYCLE_STATUSES = ["research", "proposed", "approved", "superseded", "rejected"] as const;

type RecordType = typeof RECORD_TYPES[number];
type InclusionStatus = typeof INCLUSION_STATUSES[number];
type Requirement = typeof REQUIREMENTS[number];
type ProcurementMode = typeof PROCUREMENT_MODES[number];
type LifecycleStatus = typeof LIFECYCLE_STATUSES[number];

type SourceRecord = {
  itemId: string;
  moduleId: string;
  moduleName: string;
  section: string;
  name: string;
  fields: Record<string, string>;
  rawSource: string;
};

export type EquipmentRecord = {
  item_id: string;
  module_id: string;
  module_name: string;
  category: string;
  subcategory: string;
  name: string;
  record_type: RecordType;
  parent_item_id: string | null;
  inclusion_status: InclusionStatus;
  requirement: Requirement;
  lifecycle_status: LifecycleStatus;
  quantity_min: number | null;
  quantity_base: number | null;
  quantity_scale_ready: number | null;
  unit: string;
  source_quantity: string | null;
  specification: string | null;
  open_parameters: string | null;
  premises_dependency: string | null;
  procurement_mode: ProcurementMode;
  existing_condition: string | null;
  power_kw: number | null;
  voltage: number | null;
  water_required: boolean | null;
  drainage_required: boolean | null;
  gas_required: boolean | null;
  extraction_required: boolean | null;
  dimensions: string | null;
  service_clearance: string | null;
  price_min: number | null;
  price_base: number | null;
  price_max: number | null;
  currency: string | null;
  price_date: string | null;
  supplier: string | null;
  supplier_name?: string | null;
  product_name?: string | null;
  source_url?: string | null;
  content_source_id?: string;
  price_min_source_id?: string | null;
  price_base_source_id?: string | null;
  price_max_source_id?: string | null;
  availability_status?: string | null;
  checked_at?: string | null;
  price_includes_vat?: boolean | null;
  delivery_included?: boolean | null;
  confidence?: "high" | "medium" | "low" | null;
  price_notes?: string | null;
  source_id: string;
  quote_status: "not_requested" | "researched" | "quote_required" | "included_in_parent" | "tbd";
  notes: string | null;
  source_section: string;
  source_item_number: number;
  source_record_sha256: string;
};

export type OpenParameter = {
  parameter_id: string;
  item_id: string | null;
  module_id: string | null;
  parameter: string;
  reason: string;
  required_before: string;
  status: "open";
  notes: string | null;
};

export type MissingSection = {
  section_id: string;
  name: string;
  status: "not_started" | "structured";
  dependencies: string[];
  notes: string;
};

export type DictionaryEntry = { dictionary: string; value: string; description: string };

export type CapexRegister = {
  schema_version: 1;
  document: {
    project: "Колобочная";
    document_id: typeof CAPEX_REGISTER_DOCUMENT_ID;
    title: "CAPEX Equipment Register";
    russian_title: "CAPEX — Реестр оснащения пилотного объекта";
    version: "0.1";
    status: "research";
    document_type: "Working structured CAPEX equipment register";
    decision_id: string;
    iteration_id: string;
    proposal_id: string;
    source_document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION";
    source_path: typeof CAPEX_REGISTER_SOURCE_PATH;
    source_sha256: typeof CAPEX_REGISTER_SOURCE_SHA256;
    source_record_count: 124;
    mapped_record_count: 124;
    added_research_record_count: number;
    equipment_record_count: number;
    unmapped_record_count: 0;
    csv_generated_from_yaml: true;
    warning: string;
    price_research_path?: string;
    price_research_date?: string;
    priced_record_count?: number;
    unpriced_procurement_record_count?: number;
  };
  modules: Array<{ module_id: string; module_name: string; source_record_count: number; record_count: number }>;
  equipment: EquipmentRecord[];
  open_parameters: OpenParameter[];
  missing_sections: MissingSection[];
  dictionaries: DictionaryEntry[];
};

export const EQUIPMENT_COLUMNS: Array<keyof EquipmentRecord> = [
  "item_id", "module_id", "module_name", "category", "subcategory", "name", "record_type", "parent_item_id", "inclusion_status", "requirement", "lifecycle_status", "quantity_min", "quantity_base", "quantity_scale_ready", "unit", "source_quantity", "specification", "open_parameters", "premises_dependency", "procurement_mode", "existing_condition", "power_kw", "voltage", "water_required", "drainage_required", "gas_required", "extraction_required", "dimensions", "service_clearance", "price_min", "price_base", "price_max", "currency", "price_date", "supplier", "supplier_name", "product_name", "source_url", "content_source_id", "price_min_source_id", "price_base_source_id", "price_max_source_id", "availability_status", "checked_at", "price_includes_vat", "delivery_included", "confidence", "price_notes", "source_id", "quote_status", "notes", "source_section", "source_item_number", "source_record_sha256",
];

export function sha256(value: string | Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }
function clean(value: string | undefined) {
  if (!value) return null;
  const result = value.replace(/`/g, "").replace(/\s{2,}$/g, "").trim();
  return !result || result === "—" ? null : result;
}
function plain(value: string | undefined) { return clean(value) ?? "tbd"; }
function tableCells(line: string) { return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim()); }
function moduleFromId(itemId: string) { return itemId.slice(0, 8); }

export function extractSourceRecords(source: string): SourceRecord[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const records: SourceRecord[] = [];
  let moduleId = "";
  let moduleName = "";
  let section = "";
  let tableHeaders: string[] | null = null;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const moduleHeading = line.match(/^# (CAPEX-0[1-4])\.\s+(.+)$/);
    if (moduleHeading) {
      moduleId = moduleHeading[1];
      moduleName = moduleHeading[2].trim();
      section = "";
      tableHeaders = null;
      index += 1;
      continue;
    }
    const sectionHeading = line.match(/^## (?!CAPEX-0[1-4]-\d{3}\b)(.+)$/);
    if (sectionHeading) {
      section = sectionHeading[1].trim();
      tableHeaders = null;
      index += 1;
      continue;
    }
    const itemHeading = line.match(/^#{2,3} (CAPEX-0[1-4]-\d{3}) — (.+)$/);
    if (itemHeading) {
      const block = [line];
      const fields: Record<string, string> = {};
      index += 1;
      while (index < lines.length && !/^#{1,3} /.test(lines[index]) && !/^\|\s*ID\s*\|/.test(lines[index])) {
        block.push(lines[index]);
        const field = lines[index].match(/^- \*\*(.+?):\*\*\s*(.*)$/);
        if (field) fields[field[1].trim()] = field[2].trim();
        index += 1;
      }
      records.push({ itemId: itemHeading[1], moduleId: moduleId || moduleFromId(itemHeading[1]), moduleName, section, name: itemHeading[2].trim(), fields, rawSource: block.join("\n").trimEnd() });
      continue;
    }
    if (/^\|\s*ID\s*\|/.test(line)) {
      tableHeaders = tableCells(line);
      index += 1;
      if (index < lines.length && /^\|[-:|\s]+\|$/.test(lines[index])) index += 1;
      continue;
    }
    if (tableHeaders && /^\|\s*CAPEX-0[1-4]-\d{3}\s*\|/.test(line)) {
      const cells = tableCells(line);
      const fields = Object.fromEntries(tableHeaders.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]));
      const itemId = cells[0];
      const nameIndex = tableHeaders.findIndex(header => header === "Наименование");
      records.push({ itemId, moduleId: moduleId || moduleFromId(itemId), moduleName, section, name: cells[nameIndex], fields, rawSource: line });
      index += 1;
      continue;
    }
    if (tableHeaders && line && !line.startsWith("|")) tableHeaders = null;
    index += 1;
  }

  const sourceIds = [...new Set(source.match(/CAPEX-0[1-4]-\d{3}/g) ?? [])];
  const mappedIds = records.map(record => record.itemId);
  if (sourceIds.length !== 124) throw new Error(`Expected 124 unique source item IDs, got ${sourceIds.length}.`);
  if (mappedIds.length !== 124) throw new Error(`Expected 124 mapped source records, got ${mappedIds.length}.`);
  if (new Set(mappedIds).size !== mappedIds.length) throw new Error("Duplicate CAPEX item ID found while parsing the source Markdown.");
  const unmapped = sourceIds.filter(id => !mappedIds.includes(id));
  if (unmapped.length) throw new Error(`Unmapped CAPEX source IDs: ${unmapped.join(", ")}.`);
  return records;
}

const furnitureIds = new Set([
  "CAPEX-01-003", "CAPEX-01-004", "CAPEX-01-005", "CAPEX-01-006", "CAPEX-01-007", "CAPEX-02-006", "CAPEX-02-007", "CAPEX-02-008", "CAPEX-02-009", "CAPEX-02-054", "CAPEX-02-055",
]);
const systemIds = new Set(["CAPEX-01-012", "CAPEX-01-046", "CAPEX-02-010", "CAPEX-03-001", "CAPEX-03-015", "CAPEX-03-018"]);
const accessoryIds = new Set(["CAPEX-01-021", "CAPEX-01-044", "CAPEX-01-045", "CAPEX-02-005"]);

function recordType(record: SourceRecord): RecordType {
  if (record.itemId === "CAPEX-01-047") return "engineering_connection";
  if (record.moduleId === "CAPEX-03") {
    if (["CAPEX-03-002", "CAPEX-03-003"].includes(record.itemId)) return "open_question";
    if (systemIds.has(record.itemId)) return "system";
    return "component";
  }
  if (/инвентарь/i.test(record.section) || /барный инвентарь/i.test(record.section) || /коктейльный комплект/i.test(record.section)) {
    if (furnitureIds.has(record.itemId)) return "furniture";
    return "inventory";
  }
  if (furnitureIds.has(record.itemId)) return "furniture";
  if (systemIds.has(record.itemId)) return "system";
  if (accessoryIds.has(record.itemId)) return "accessory";
  return "equipment";
}

function parentItemId(itemId: string) {
  if (["CAPEX-01-044", "CAPEX-01-046", "CAPEX-01-047"].includes(itemId)) return "CAPEX-01-043";
  if (itemId === "CAPEX-02-005") return "CAPEX-02-004";
  if (itemId.startsWith("CAPEX-03-") && itemId !== "CAPEX-03-001") return "CAPEX-03-001";
  return null;
}

function inclusionStatus(record: SourceRecord, type: RecordType): InclusionStatus {
  if (record.itemId === "CAPEX-02-005") return "purchased_separately";
  if (parentItemId(record.itemId) || ["inventory", "open_question"].includes(type)) return "tbd";
  return "standalone";
}

function requirement(record: SourceRecord): Requirement {
  if (/Опциональный коктейльный комплект/i.test(record.section)) return "optional";
  const value = clean(record.fields["Обязательность"]);
  return REQUIREMENTS.includes(value as Requirement) ? value as Requirement : "tbd";
}

function numberAtStart(value: string | null) {
  if (!value) return null;
  const match = value.replace(",", ".").match(/^(?:около\s+|минимум\s+)?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function quantityFields(record: SourceRecord) {
  const sourceQuantity = clean(record.fields["Количество"] ?? record.fields["Количество / рабочий ориентир"]);
  const baseScenario = clean(record.fields["Базовый сценарий"]);
  const scaleScenario = clean(record.fields["Расширенный сценарий"]);
  let quantityMin: number | null = null;
  let quantityBase: number | null = null;
  let quantityScaleReady: number | null = null;
  if (sourceQuantity && /^минимум\s+/i.test(sourceQuantity)) quantityMin = numberAtStart(sourceQuantity);
  else if (sourceQuantity && /\d+\s*[–-]\s*\d+/.test(sourceQuantity)) {
    const [low, high] = sourceQuantity.match(/\d+/g)!.map(Number);
    quantityMin = low;
    quantityScaleReady = high;
  } else quantityBase = numberAtStart(sourceQuantity);
  if (baseScenario && baseScenario !== "tbd") quantityBase = numberAtStart(baseScenario);
  if (scaleScenario && scaleScenario !== "tbd") quantityScaleReady = numberAtStart(scaleScenario);
  let unit = "tbd";
  const quantityText = `${sourceQuantity ?? ""} ${baseScenario ?? ""}`;
  if (/погонн/i.test(quantityText)) unit = "пог. м";
  else if (/\bм\b|метр/i.test(quantityText)) unit = "м";
  else if (/ряд/i.test(quantityText)) unit = "ряд";
  else if (/комплект/i.test(quantityText)) unit = "комплект";
  else if (/шт\./i.test(quantityText)) unit = "шт.";
  return { quantity_min: quantityMin, quantity_base: quantityBase, quantity_scale_ready: quantityScaleReady, unit, source_quantity: sourceQuantity };
}

function triState(source: string, pattern: RegExp) { return pattern.test(source) ? true : null; }
function dimensions(record: SourceRecord) {
  const source = [record.fields["Минимальные требования"], record.fields["Количество / рабочий ориентир"], record.fields["Количество"]].filter(Boolean).join("; ");
  if (/глубин|ширин|длин|размер|габарит|\d+\s*[×x]\s*\d+|D100|погонн|горизонтальн.*ряд/i.test(source)) return clean(source);
  return null;
}

function toEquipmentRecord(record: SourceRecord): EquipmentRecord {
  const type = recordType(record);
  const minimum = clean(record.fields["Минимальные требования"] ?? record.fields["Минимальные требования / открытые параметры"]);
  const open = clean(record.fields["Открытые параметры"] ?? record.fields["Открытые параметры / комментарий"]);
  const premises = clean(record.fields["Зависимость от помещения"]);
  const status = clean(record.fields["Статус оснащения"]);
  const comment = clean(record.fields["Комментарий"]);
  const combined = [record.name, minimum, open, premises, comment].filter(Boolean).join("; ");
  return {
    item_id: record.itemId,
    module_id: record.moduleId,
    module_name: record.moduleName,
    category: record.moduleName,
    subcategory: clean(record.fields["Категория"]) ?? record.section,
    name: record.name,
    record_type: type,
    parent_item_id: parentItemId(record.itemId),
    inclusion_status: inclusionStatus(record, type),
    requirement: requirement(record),
    lifecycle_status: "research",
    ...quantityFields(record),
    specification: minimum,
    open_parameters: open,
    premises_dependency: premises,
    procurement_mode: "tbd",
    existing_condition: status,
    power_kw: null,
    voltage: /24\s*В/i.test(combined) ? 24 : null,
    water_required: triState(combined, /водопровод|водоснабжен|подвод воды|фильтрац(?:ия|ии) воды/i),
    drainage_required: triState(combined, /канализац/i),
    gas_required: triState(combined, /газов|газоснабжен/i),
    extraction_required: triState(combined, /вытяж/i),
    dimensions: dimensions(record),
    service_clearance: null,
    price_min: null,
    price_base: null,
    price_max: null,
    currency: null,
    price_date: null,
    supplier: null,
    source_id: CAPEX_REGISTER_SOURCE_ID,
    quote_status: "not_requested",
    notes: comment,
    source_section: `${record.moduleId} / ${record.section}`,
    source_item_number: Number(record.itemId.slice(-3)),
    source_record_sha256: sha256(record.rawSource),
  };
}

type AddedEquipmentDefinition = {
  name: string;
  subcategory: string;
  record_type: RecordType;
  unit: string;
  calculation_basis: string;
};

const capex05Definitions: AddedEquipmentDefinition[] = [
  { name: "Столы гостевой зоны", subcategory: "Гостевая мебель", record_type: "furniture", unit: "посадочное место", calculation_basis: "посадочное место" },
  { name: "Стулья", subcategory: "Гостевая мебель", record_type: "furniture", unit: "посадочное место", calculation_basis: "посадочное место" },
  { name: "Диваны и банкетки", subcategory: "Гостевая мебель", record_type: "furniture", unit: "пог. м", calculation_basis: "погонный метр / посадочное место" },
  { name: "Барная стойка", subcategory: "Гостевая мебель", record_type: "furniture", unit: "пог. м", calculation_basis: "посадочное место / погонный метр" },
  { name: "Барные стулья", subcategory: "Гостевая мебель", record_type: "furniture", unit: "посадочное место", calculation_basis: "посадочное место / погонный метр" },
  { name: "Детские стулья", subcategory: "Гостевая мебель", record_type: "furniture", unit: "посадочное место", calculation_basis: "посадочное место" },
  { name: "Мебель зоны ожидания", subcategory: "Гостевая мебель", record_type: "furniture", unit: "м²", calculation_basis: "м² / человек пиковой очереди" },
  { name: "Кассовая стойка", subcategory: "Заказ и выдача", record_type: "furniture", unit: "пог. м", calculation_basis: "рабочее место / погонный метр" },
  { name: "Рабочее место кассира", subcategory: "Заказ и выдача", record_type: "system", unit: "рабочее место", calculation_basis: "рабочее место" },
  { name: "Стойка выдачи", subcategory: "Заказ и выдача", record_type: "furniture", unit: "пог. м", calculation_basis: "пост выдачи / погонный метр" },
  { name: "Поверхность комплектации заказов", subcategory: "Заказ и выдача", record_type: "furniture", unit: "пост выдачи", calculation_basis: "пост выдачи" },
  { name: "Полки, шкафы и хранение в зоне выдачи", subcategory: "Заказ и выдача", record_type: "furniture", unit: "пост выдачи", calculation_basis: "пост выдачи" },
  { name: "Кабельные и технологические каналы стойки", subcategory: "Заказ и выдача", record_type: "accessory", unit: "рабочее место", calculation_basis: "рабочее место / погонный метр" },
  { name: "Места под терминалы, принтеры и кассовое оборудование", subcategory: "Заказ и выдача", record_type: "accessory", unit: "рабочее место", calculation_basis: "рабочее место" },
  { name: "Станция самообслуживания", subcategory: "Самообслуживание", record_type: "system", unit: "станция", calculation_basis: "станция" },
  { name: "Станция приборов и салфеток", subcategory: "Самообслуживание", record_type: "system", unit: "станция", calculation_basis: "станция" },
  { name: "Станция соусов и дополнительных ингредиентов", subcategory: "Самообслуживание", record_type: "system", unit: "станция", calculation_basis: "станция" },
  { name: "Место для подносов", subcategory: "Самообслуживание", record_type: "accessory", unit: "станция", calculation_basis: "станция" },
  { name: "Станция питьевой воды", subcategory: "Самообслуживание", record_type: "system", unit: "станция", calculation_basis: "станция" },
  { name: "Урны и сортировка отходов", subcategory: "Самообслуживание", record_type: "accessory", unit: "станция", calculation_basis: "станция / м² гостевой площади" },
  { name: "Возврат многоразовой посуды", subcategory: "Самообслуживание", record_type: "system", unit: "станция", calculation_basis: "станция" },
  { name: "Гардероб", subcategory: "Дополнительное оснащение", record_type: "furniture", unit: "пог. м", calculation_basis: "посетитель / погонный метр" },
  { name: "Напольные и настенные вешалки", subcategory: "Дополнительное оснащение", record_type: "accessory", unit: "шт.", calculation_basis: "м² гостевой площади" },
  { name: "Декоративные и функциональные стеллажи", subcategory: "Дополнительное оснащение", record_type: "furniture", unit: "м²", calculation_basis: "м² гостевой площади" },
  { name: "Меню и навигация", subcategory: "Дополнительное оснащение", record_type: "system", unit: "точка размещения", calculation_basis: "точка размещения / функциональная зона" },
  { name: "Разделители очереди", subcategory: "Дополнительное оснащение", record_type: "accessory", unit: "шт.", calculation_basis: "человек пиковой очереди" },
  { name: "Мебель и оборудование доступной среды", subcategory: "Дополнительное оснащение", record_type: "furniture", unit: "комплект", calculation_basis: "формат точки и параметры доступной среды" },
];

function capex05Equipment(): EquipmentRecord[] {
  return capex05Definitions.map((definition, index) => {
    const number = index + 1;
    const itemId = `CAPEX-05-${String(number).padStart(3, "0")}`;
    return {
      item_id: itemId,
      module_id: "CAPEX-05",
      module_name: "Гостевая зона и обслуживание",
      category: "Гостевая зона и обслуживание",
      subcategory: definition.subcategory,
      name: definition.name,
      record_type: definition.record_type,
      parent_item_id: null,
      inclusion_status: "tbd",
      requirement: "conditional",
      lifecycle_status: "research",
      quantity_min: null,
      quantity_base: null,
      quantity_scale_ready: null,
      unit: definition.unit,
      source_quantity: null,
      specification: null,
      open_parameters: "количество, конфигурация и характеристики — tbd",
      premises_dependency: "зависит от выбранного формата точки и параметров конкретной локации",
      procurement_mode: "tbd",
      existing_condition: "tbd",
      power_kw: null,
      voltage: null,
      water_required: null,
      drainage_required: null,
      gas_required: null,
      extraction_required: null,
      dimensions: null,
      service_clearance: null,
      price_min: null,
      price_base: null,
      price_max: null,
      currency: null,
      price_date: null,
      supplier: null,
      source_id: CAPEX_MODULAR_SOURCE_ID,
      quote_status: "not_requested",
      notes: `Правило будущего расчёта: ${definition.calculation_basis}. Коэффициент не определён.`,
      source_section: `CAPEX-05 / ${definition.subcategory}`,
      source_item_number: number,
      source_record_sha256: sha256(JSON.stringify({ item_id: itemId, ...definition, requirement: "conditional", lifecycle_status: "research" })),
    };
  });
}

const extraOpenParameters: Array<[string, string, string]> = [
  ["CAPEX-01-045", "Выбор между ледяным охлаждением и шоковым охлаждением", "Открытый вопрос CAPEX-01"],
  ["CAPEX-03-005", "точное сечение каналов", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-008", "количество посадочных кассет", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-009", "расстояние между уровнями", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-008", "перечень культур", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-001", "объём выращивания", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-013", "мощность туманообразования", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-012", "объём резервуара", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-014", "воздушный поток", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-009", "мощность и спектр освещения", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-015", "схема конденсата", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-001", "режим санитарной мойки", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-03-012", "система приготовления и контроля питательного раствора", "Открытые инженерные параметры CAPEX-03"],
  ["CAPEX-04-001", "фискальные регистраторы", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-001", "эквайринговые терминалы", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-001", "принтеры чеков", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-002", "принтеры этикеток", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-002", "сканеры штрихкодов", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-003", "сетевое оборудование", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-003", "точки Wi-Fi", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-003", "резервное питание", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-001", "программное обеспечение", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-001", "лицензии", "Пока не детализированы в CAPEX-04"],
  ["CAPEX-04-001", "стоимость внедрения и сопровождения", "Пока не детализированы в CAPEX-04"],
];

const globalOpenParameters = [
  "конкретные производители и модели",
  "производительность оборудования",
  "окончательное количество су-видов",
  "необходимость отдельной мясорубки",
  "выбор между ледяным охлаждением и шоковым охлаждением",
  "производительность льдогенератора",
  "размеры и количество гастроёмкостей",
  "количество и объём кег",
  "конфигурация post-mix",
  "параметры пароконвектоматов",
  "параметры вытяжки",
  "параметры KDS и POS",
  "инженерный расчёт модуля выращивания",
  "резервные единицы оборудования",
  "запасные части и расходные компоненты",
] as const;

function buildOpenParameters(equipment: EquipmentRecord[]) {
  const candidates: Array<{ itemId: string; parameter: string; notes: string | null }> = [];
  for (const item of equipment) if (item.open_parameters && item.open_parameters !== "tbd") candidates.push({ itemId: item.item_id, parameter: item.open_parameters, notes: item.source_section });
  for (const [itemId, parameter, notes] of extraOpenParameters) candidates.push({ itemId, parameter, notes });
  const unique = candidates.filter((candidate, index, all) => all.findIndex(other => other.itemId === candidate.itemId && other.parameter.toLocaleLowerCase("ru") === candidate.parameter.toLocaleLowerCase("ru")) === index);
  const counters = new Map<string, number>();
  const itemParameters: OpenParameter[] = unique.map(candidate => {
    const number = (counters.get(candidate.itemId) ?? 0) + 1;
    counters.set(candidate.itemId, number);
    return {
      parameter_id: `OP-${candidate.itemId}-${String(number).padStart(2, "0")}`,
      item_id: candidate.itemId,
      module_id: moduleFromId(candidate.itemId),
      parameter: candidate.parameter,
      reason: "Параметр прямо оставлен неопределённым в исходной спецификации v0.1.",
      required_before: "утверждение закупочной спецификации или соответствующего инженерного решения",
      status: "open" as const,
      notes: candidate.notes,
    };
  });
  const registerParameters: OpenParameter[] = globalOpenParameters.map((parameter, index) => ({
    parameter_id: `OP-GLOBAL-${String(index + 1).padStart(2, "0")}`,
    item_id: null,
    module_id: null,
    parameter,
    reason: "Параметр дословно перечислен в разделе A «Открытые параметры уже описанных модулей» исходной спецификации v0.1.",
    required_before: "утверждение закупочной спецификации, бюджета или соответствующего технического решения",
    status: "open",
    notes: "Применяется к реестру в целом или к нескольким позициям; связь с одной позицией не назначается без отдельного решения.",
  }));
  return [...itemParameters, ...registerParameters];
}

const missingSectionNames = [
  "Гостевой зал и мебель",
  "Стойка заказа, выдачи и зона самообслуживания",
  "Складское оборудование",
  "Посудомоечное оборудование",
  "Отдельная мойка продуктов и овощей",
  "Санитарное и уборочное оснащение",
  "Служебные помещения и оснащение персонала",
  "Упаковка, одноразовая и многоразовая посуда",
  "Первоначальный комплект расходных материалов",
  "Видеонаблюдение, сигнализация и контроль доступа",
  "Интернет, локальная сеть и резервный канал связи",
  "Вентиляция и кондиционирование",
  "Электроснабжение и увеличение мощности",
  "Водоснабжение и канализация",
  "Жироуловители и напольные трапы",
  "Водоподготовка",
  "Газовое оборудование, хранение и подключение газа",
  "Пожарная безопасность",
  "Отделка и ремонт",
  "Проектирование и согласования",
  "Доставка оборудования",
  "Монтаж и пусконаладка",
  "Гарантийное и сервисное обслуживание",
  "Первоначальный запас сырья",
  "Оборотный капитал периода запуска",
  "Резерв CAPEX",
  "Минимальный, базовый и расширенный сценарии бюджета",
];

function missingSections(): MissingSection[] {
  return missingSectionNames.map((name, index) => {
    const sectionId = `CAPEX-${String(index + 5).padStart(2, "0")}`;
    const structured = sectionId === "CAPEX-05" || sectionId === "CAPEX-06";
    return {
      section_id: sectionId,
      name,
      status: structured ? "structured" : "not_started",
      dependencies: structured ? ["CAPEX-05"] : [],
      notes: structured
        ? "Историческая запись сохранена; категория перенесена из not_started в структурированный research-модуль CAPEX-05 — Гостевая зона и обслуживание решением DEC-008."
        : "Раздел перечислен, но не описан в CAPEX — Equipment Specification v0.1.",
    };
  });
}

function dictionaries(): DictionaryEntry[] {
  const entries: DictionaryEntry[] = [];
  const add = (dictionary: string, values: readonly string[], description: string) => values.forEach(value => entries.push({ dictionary, value, description }));
  add("record_type", RECORD_TYPES, "Тип записи реестра.");
  add("inclusion_status", INCLUSION_STATUSES, "Правило включения записи в закупочный расчёт.");
  add("requirement", REQUIREMENTS, "Степень обязательности позиции.");
  add("procurement_mode", PROCUREMENT_MODES, "Способ обеспечения позиции.");
  add("lifecycle_status", LIFECYCLE_STATUSES, "Содержательный статус записи.");
  add("quote_status", ["not_requested", "requested", "received", "expired", "rejected", "tbd"], "Статус коммерческого предложения.");
  add("open_parameter_status", ["open", "resolved", "superseded"], "Статус открытого параметра.");
  add("missing_section_status", ["not_started", "structured"], "Статус ещё не сформированного или перенесённого в структурированный модуль раздела.");
  add("unit", ["шт.", "комплект", "ряд", "м", "м²", "пог. м", "посадочное место", "рабочее место", "пост выдачи", "станция", "точка размещения", "tbd"], "Допустимая единица количества текущей версии.");
  return entries;
}

export function buildRegister(source: string): CapexRegister {
  if (sha256(source) !== CAPEX_REGISTER_SOURCE_SHA256) throw new Error("Source CAPEX Markdown hash changed; structured migration requires a new governed iteration.");
  const sourceRecords = extractSourceRecords(source);
  const sourceEquipment = sourceRecords.map(toEquipmentRecord);
  const equipment = [...sourceEquipment, ...capex05Equipment()];
  const modules = [...new Set(equipment.map(item => item.module_id))].map(id => ({
    module_id: id,
    module_name: equipment.find(item => item.module_id === id)!.module_name,
    source_record_count: sourceEquipment.filter(item => item.module_id === id).length,
    record_count: equipment.filter(item => item.module_id === id).length,
  }));
  return {
    schema_version: 1,
    document: {
      project: "Колобочная",
      document_id: CAPEX_REGISTER_DOCUMENT_ID,
      title: "CAPEX Equipment Register",
      russian_title: "CAPEX — Реестр оснащения пилотного объекта",
      version: "0.1",
      status: "research",
      document_type: "Working structured CAPEX equipment register",
      decision_id: CAPEX_REGISTER_DECISION_ID,
      iteration_id: CAPEX_REGISTER_ITERATION_ID,
      proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
      source_document_id: "DOC-CAPEX-EQUIPMENT-SPECIFICATION",
      source_path: CAPEX_REGISTER_SOURCE_PATH,
      source_sha256: CAPEX_REGISTER_SOURCE_SHA256,
      source_record_count: 124,
      mapped_record_count: 124,
      added_research_record_count: 27,
      equipment_record_count: 151,
      unmapped_record_count: 0,
      csv_generated_from_yaml: true,
      warning: "Цены, конкретные модели, поставщики и итоговый CAPEX не определены. 124 — количество исходных записей CAPEX v0.1; 27 research-записей CAPEX-05 добавлены отдельной governed-итерацией; 151 не является числом самостоятельных закупочных единиц.",
    },
    modules,
    equipment,
    open_parameters: buildOpenParameters(equipment),
    missing_sections: missingSections(),
    dictionaries: dictionaries(),
  };
}

export function serializeRegister(register: CapexRegister) { return YAML.stringify(register, { lineWidth: 0 }); }
function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("; ") : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function equipmentCsv(register: CapexRegister) {
  const rows = [EQUIPMENT_COLUMNS.map(String), ...register.equipment.map(item => EQUIPMENT_COLUMNS.map(column => item[column]))];
  return `${rows.map(row => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function registerStatistics(register: CapexRegister) {
  const byRecordType = Object.fromEntries(RECORD_TYPES.map(type => [type, register.equipment.filter(item => item.record_type === type).length]));
  const mainProcurementRecords = register.equipment.filter(item => ["standalone", "purchased_separately"].includes(item.inclusion_status) && !["open_question", "engineering_connection"].includes(item.record_type)).length;
  return {
    source_record_count: register.document.source_record_count,
    mapped_record_count: register.document.mapped_record_count,
    added_research_record_count: register.document.added_research_record_count,
    equipment_record_count: register.document.equipment_record_count,
    unmapped_record_count: register.document.unmapped_record_count,
    main_procurement_records: mainProcurementRecords,
    by_record_type: byRecordType,
    inclusion_status_tbd: register.equipment.filter(item => item.inclusion_status === "tbd").length,
    quantity_base_tbd: register.equipment.filter(item => item.quantity_base === null).length,
    priced_record_count: register.equipment.filter(item => item.price_base !== null).length,
    unpriced_eligible_procurement_record_count: register.document.unpriced_procurement_record_count ?? mainProcurementRecords,
    quote_required_count: register.equipment.filter(item => item.quote_status === "quote_required").length,
    open_parameter_count: register.open_parameters.length,
    missing_section_count: register.missing_sections.length,
  };
}

export function validateRegister(register: CapexRegister, source?: string) {
  const errors: string[] = [];
  const schema = JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", "capex-equipment-register.schema.json"), "utf8"));
  const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validateSchema(register)) errors.push(...(validateSchema.errors ?? []).map(error => `schema ${error.instancePath || "/"} ${error.message}`));
  if (register.document.source_record_count !== SOURCE_RECORD_COUNT || register.document.mapped_record_count !== SOURCE_RECORD_COUNT) errors.push("CAPEX source coverage must remain exactly 124/124.");
  if (register.document.added_research_record_count !== ADDED_RESEARCH_RECORD_COUNT || register.document.equipment_record_count !== EQUIPMENT_RECORD_COUNT || register.equipment.length !== EQUIPMENT_RECORD_COUNT) errors.push(`CAPEX register must contain exactly ${EQUIPMENT_RECORD_COUNT} records: ${SOURCE_RECORD_COUNT} source records plus ${ADDED_RESEARCH_RECORD_COUNT} governed research records.`);
  const ids = register.equipment.map(item => item.item_id);
  if (new Set(ids).size !== ids.length) errors.push("CAPEX register contains duplicate item IDs.");
  for (const item of register.equipment) {
    if (item.parent_item_id && !ids.includes(item.parent_item_id)) errors.push(`${item.item_id}: parent_item_id does not exist.`);
    if (item.inclusion_status === "included_in_parent" && !item.parent_item_id) errors.push(`${item.item_id}: included_in_parent requires parent_item_id.`);
    for (const field of ["quantity_min", "quantity_base", "quantity_scale_ready", "power_kw", "voltage", "price_min", "price_base", "price_max"] as const) if (typeof item[field] === "string") errors.push(`${item.item_id}: numeric field ${field} contains text.`);
    const priceValues = [item.price_min, item.price_base, item.price_max];
    const hasPrice = priceValues.some(value => value !== null);
    if (hasPrice && priceValues.some(value => value === null)) errors.push(`${item.item_id}: price research must provide all three unit-price scenarios or none.`);
    if (hasPrice && (!item.source_id || !item.price_date || !item.source_url || !item.checked_at)) errors.push(`${item.item_id}: price requires source_id, source_url, price_date and checked_at.`);
    if (hasPrice && (!item.price_min_source_id || !item.price_base_source_id || !item.price_max_source_id)) errors.push(`${item.item_id}: every price scenario requires a source ID.`);
    if (hasPrice && item.currency !== "RUB") errors.push(`${item.item_id}: preliminary price currency must be RUB.`);
    if (hasPrice && (item.inclusion_status === "included_in_parent" || ["component", "engineering_connection", "open_question"].includes(item.record_type))) errors.push(`${item.item_id}: non-purchasable/component record must not contain a price.`);
    if (hasPrice && item.item_id.startsWith("CAPEX-05-")) errors.push(`${item.item_id}: CAPEX-05 is outside the price research scope.`);
    if (item.quote_status === "included_in_parent" && hasPrice) errors.push(`${item.item_id}: included_in_parent quote status must not contain a price.`);
    if (item.lifecycle_status !== "research") errors.push(`${item.item_id}: lifecycle status must remain research.`);
  }
  if (["DEC-009", "DEC-010"].includes(register.document.decision_id)) {
    const priced = register.equipment.filter(item => item.price_base !== null);
    if (priced.length !== 39) errors.push(`DEC-009 register must contain 39 preliminary priced records, got ${priced.length}.`);
    if (register.document.priced_record_count !== 39 || register.document.unpriced_procurement_record_count !== 8) errors.push("DEC-009 price coverage metadata must be 39 priced and 8 unpriced eligible procurement records.");
  }
  for (const parameter of register.open_parameters) if (parameter.item_id && !ids.includes(parameter.item_id)) errors.push(`${parameter.parameter_id}: missing item reference ${parameter.item_id}.`);
  if (source) {
    if (sha256(source) !== register.document.source_sha256) errors.push("Source Markdown SHA-256 differs from register metadata.");
    const sourceIds = new Set(extractSourceRecords(source).map(record => record.itemId));
    for (const id of ids.slice(0, SOURCE_RECORD_COUNT)) if (!sourceIds.has(id)) errors.push(`${id}: not present in source Markdown.`);
    const capex05Ids = ids.slice(SOURCE_RECORD_COUNT, SOURCE_RECORD_COUNT + BASE_ADDED_RESEARCH_RECORD_COUNT);
    const expectedCapex05Ids = Array.from({ length: BASE_ADDED_RESEARCH_RECORD_COUNT }, (_, index) => `CAPEX-05-${String(index + 1).padStart(3, "0")}`);
    if (JSON.stringify(capex05Ids) !== JSON.stringify(expectedCapex05Ids)) errors.push("CAPEX-05 stable ID sequence differs from CAPEX-05-001—CAPEX-05-027.");
    const pilotIds = ids.slice(SOURCE_RECORD_COUNT + BASE_ADDED_RESEARCH_RECORD_COUNT);
    const expectedPilotIds = ["CAPEX-01-048", "CAPEX-02-056", "CAPEX-02-057", ...Array.from({ length: 6 }, (_, index) => `CAPEX-08-${String(index + 1).padStart(3, "0")}`)];
    if (JSON.stringify(pilotIds) !== JSON.stringify(expectedPilotIds)) errors.push("DEC-011 pilot research ID sequence differs from the approved payload.");
  }
  return errors;
}

export function readRegister(file = path.resolve(platformRoot, "working", "capex-equipment-register.yaml")) {
  return YAML.parse(fs.readFileSync(file, "utf8")) as CapexRegister;
}

export function sourceMarkdownPath() { return path.resolve(platformRoot, "working", "capex-equipment-specification.md"); }
export function registerYamlPath() { return path.resolve(platformRoot, "working", "capex-equipment-register.yaml"); }
export function registerCsvPath() { return path.resolve(platformRoot, "working", "capex-equipment-register.csv"); }
