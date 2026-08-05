import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import {
  CAPEX_REGISTER_DECISION_ID,
  CAPEX_REGISTER_ITERATION_ID,
  CAPEX_REGISTER_PROPOSAL_ID,
  EQUIPMENT_RECORD_COUNT,
  REQUIREMENTS,
  type CapexRegister,
  type EquipmentRecord,
  readRegister,
  sha256,
} from "./register.js";

export const CAPEX_MODULE_IDS = [
  "MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS",
  "MOD-GUEST", "MOD-TAKEAWAY", "MOD-STORAGE", "MOD-WASH", "MOD-STAFF", "MOD-ENGINEERING",
] as const;
export const CAPEX_FORMAT_IDS = [
  "FMT-PREP-CENTER", "FMT-INTEGRATED", "FMT-RESTAURANT-SEATING", "FMT-FOOD-COURT",
  "FMT-STREET-PICKUP", "FMT-FOODTRUCK", "FMT-CUSTOM",
] as const;
export const QUANTITY_RULE_TYPES = ["fixed", "per_seat", "per_guest_area_m2", "per_workstation", "per_cashier_post", "per_hot_kitchen_post", "per_filling", "per_station", "manual", "tbd"] as const;
export const AGGREGATION_RULES = ["once", "sum", "max", "manual"] as const;
export const OVERRIDE_ACTIONS = ["include", "exclude", "replace", "change_quantity", "change_specification"] as const;

export type ModuleId = typeof CAPEX_MODULE_IDS[number];
export type FormatId = typeof CAPEX_FORMAT_IDS[number];
export type QuantityRuleType = typeof QUANTITY_RULE_TYPES[number];
export type AggregationRule = typeof AGGREGATION_RULES[number];
export type OverrideAction = typeof OVERRIDE_ACTIONS[number];

export const MODULAR_PATHS = {
  modules: "docs-platform/working/capex-modules.yaml",
  moduleItems: "docs-platform/working/capex-module-items.yaml",
  formats: "docs-platform/working/capex-point-formats.yaml",
  configurations: "docs-platform/working/capex-configurations.yaml",
  overrides: "docs-platform/working/capex-configuration-overrides.yaml",
} as const;

type FunctionalModule = {
  module_id: ModuleId;
  name: string;
  purpose: string;
  lifecycle_status: "research" | "not_started";
  notes: string | null;
};

export type ModuleItemLink = {
  module_id: ModuleId;
  item_id: string;
  default_requirement: typeof REQUIREMENTS[number];
  quantity_rule_type: QuantityRuleType;
  quantity_rule_value: number | null;
  minimum_quantity: number | null;
  aggregation_rule: AggregationRule;
  condition: string | null;
  notes: string | null;
};

export type PointFormat = {
  format_id: FormatId;
  name: string;
  purpose: string;
  lifecycle_status: "research";
  required_modules: ModuleId[];
  optional_modules: ModuleId[];
  conditional_modules: ModuleId[];
  excluded_modules: ModuleId[];
  exclusion_mode: "excluded" | "excluded_by_default" | "none";
  manual_selection: boolean;
  notes: string | null;
};

export type CapexConfiguration = {
  configuration_id: string;
  name: string;
  format_id: FormatId;
  lifecycle_status: "research";
  total_area_m2: number | null;
  guest_area_m2: number | null;
  hall_count: number | null;
  seat_count: number | null;
  cashier_post_count: number | null;
  hot_kitchen_post_count: number | null;
  filling_count: number | null;
  service_station_count: number | null;
  peak_orders_per_hour: number | null;
  daily_orders: number | null;
  bar_enabled: boolean | null;
  alcohol_enabled: boolean | null;
  prep_enabled: boolean | null;
  grow_enabled: boolean | null;
  central_supply_enabled: boolean | null;
  self_service_enabled: boolean | null;
  reusable_tableware_enabled: boolean | null;
  shared_seating: boolean | null;
  mobile_format: boolean | null;
  selected_modules: ModuleId[];
  excluded_modules: ModuleId[];
  notes: string | null;
};

export type ConfigurationOverride = {
  configuration_id: string;
  item_id: string;
  action: OverrideAction;
  quantity_override: number | null;
  specification_override: string | null;
  requirement_override: typeof REQUIREMENTS[number] | null;
  reason: string;
  lifecycle_status: "research";
  notes: string | null;
};

type ModulesDocument = { schema_version: 1; document: Record<string, unknown>; modules: FunctionalModule[] };
type ModuleItemsDocument = { schema_version: 1; document: Record<string, unknown>; links: ModuleItemLink[] };
type FormatsDocument = { schema_version: 1; document: Record<string, unknown>; formats: PointFormat[] };
type ConfigurationsDocument = { schema_version: 1; document: Record<string, unknown>; configurations: CapexConfiguration[] };
type OverridesDocument = { schema_version: 1; document: Record<string, unknown>; overrides: ConfigurationOverride[] };

export type ModularSources = {
  modules: ModulesDocument;
  module_items: ModuleItemsDocument;
  point_formats: FormatsDocument;
  configurations: ConfigurationsDocument;
  configuration_overrides: OverridesDocument;
};

function metadata(documentId: string, title: string, russianTitle: string, documentType: string) {
  return {
    project: "Колобочная",
    document_id: documentId,
    title,
    russian_title: russianTitle,
    version: "0.1",
    status: "research",
    document_type: documentType,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
  };
}

function functionalModules(): FunctionalModule[] {
  return [
    { module_id: "MOD-PREP", name: "Заготовочный цех", purpose: "Производство и подготовка компонентов.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-RETAIL-HOT", name: "Торговая кухня и приготовление колобков", purpose: "Финальное горячее приготовление и рабочий инвентарь торговой кухни.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-BAR", name: "Холодные и горячие напитки", purpose: "Напитки, лёд и базовый либо опциональный барный инвентарь.", lifecycle_status: "research", notes: "Алкогольное направление остаётся отдельным условным решением." },
    { module_id: "MOD-GROW", name: "Выращивание зелени и микрозелени", purpose: "Исследовательский модуль выращивания ингредиентов.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-POS", name: "Касса, складской и производственный учёт", purpose: "Кассовые посты и терминал учёта заготовочного цеха.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-KDS", name: "Управление заказами на рабочих постах", purpose: "KDS-экраны и распределение заказов по рабочим зонам.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-GUEST", name: "Гостевой зал и посадочные места", purpose: "Гостевая мебель и дополнительное оснащение собственной посадочной зоны.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-TAKEAWAY", name: "Заказ, выдача, ожидание и самообслуживание", purpose: "Стойки заказа и выдачи, ожидание и станции самообслуживания.", lifecycle_status: "research", notes: null },
    { module_id: "MOD-STORAGE", name: "Складское оснащение", purpose: "Будущий функциональный модуль складского оснащения.", lifecycle_status: "not_started", notes: "Соответствующий CAPEX-раздел ещё не сформирован." },
    { module_id: "MOD-WASH", name: "Посудомоечная и санитарная зона", purpose: "Будущий функциональный модуль посудомоечного и санитарного оснащения.", lifecycle_status: "not_started", notes: "Соответствующие CAPEX-разделы ещё не сформированы." },
    { module_id: "MOD-STAFF", name: "Служебные помещения и оснащение персонала", purpose: "Будущий функциональный модуль служебных помещений.", lifecycle_status: "not_started", notes: "Соответствующий CAPEX-раздел ещё не сформирован." },
    { module_id: "MOD-ENGINEERING", name: "Инженерная инфраструктура", purpose: "Будущий функциональный модуль инженерной инфраструктуры конкретной локации.", lifecycle_status: "not_started", notes: "Инженерные разделы ещё не сформированы и будут зависеть от помещения." },
  ];
}

const capex05QuantityRules: Record<string, { type: QuantityRuleType; aggregation: AggregationRule; note: string }> = {
  "CAPEX-05-001": { type: "per_seat", aggregation: "sum", note: "Расчёт по посадочным местам; коэффициент не определён." },
  "CAPEX-05-002": { type: "per_seat", aggregation: "sum", note: "Расчёт по посадочным местам; коэффициент не определён." },
  "CAPEX-05-003": { type: "per_seat", aggregation: "sum", note: "Допустимые базы: погонный метр / посадочное место; коэффициент не определён." },
  "CAPEX-05-004": { type: "tbd", aggregation: "manual", note: "Допустимые базы: посадочное место / погонный метр; конкретное правило не выбрано." },
  "CAPEX-05-005": { type: "per_seat", aggregation: "sum", note: "Расчёт по посадочным местам; коэффициент не определён." },
  "CAPEX-05-006": { type: "per_seat", aggregation: "sum", note: "Расчёт по посадочным местам; коэффициент не определён." },
  "CAPEX-05-007": { type: "tbd", aggregation: "manual", note: "Допустимые базы: м² / человек пиковой очереди; конкретное правило не выбрано." },
  "CAPEX-05-008": { type: "per_cashier_post", aggregation: "sum", note: "Расчёт по рабочему месту; длина стойки требует отдельного определения." },
  "CAPEX-05-009": { type: "per_cashier_post", aggregation: "sum", note: "Расчёт по рабочим местам кассиров; коэффициент не определён." },
  "CAPEX-05-010": { type: "per_station", aggregation: "sum", note: "Расчёт по посту выдачи; длина стойки требует отдельного определения." },
  "CAPEX-05-011": { type: "per_station", aggregation: "sum", note: "Расчёт по постам выдачи; коэффициент не определён." },
  "CAPEX-05-012": { type: "per_station", aggregation: "sum", note: "Расчёт по постам выдачи; коэффициент не определён." },
  "CAPEX-05-013": { type: "per_cashier_post", aggregation: "sum", note: "Расчёт по рабочим местам; погонный метраж требует отдельного определения." },
  "CAPEX-05-014": { type: "per_cashier_post", aggregation: "sum", note: "Расчёт по рабочим местам кассиров; коэффициент не определён." },
  "CAPEX-05-015": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям самообслуживания; коэффициент не определён." },
  "CAPEX-05-016": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям самообслуживания; коэффициент не определён." },
  "CAPEX-05-017": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям самообслуживания; коэффициент не определён." },
  "CAPEX-05-018": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям самообслуживания; коэффициент не определён." },
  "CAPEX-05-019": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям; коэффициент не определён." },
  "CAPEX-05-020": { type: "tbd", aggregation: "manual", note: "Допустимые базы: станция / м² гостевой площади; конкретное правило не выбрано." },
  "CAPEX-05-021": { type: "per_station", aggregation: "sum", note: "Расчёт по станциям возврата; коэффициент не определён." },
  "CAPEX-05-022": { type: "tbd", aggregation: "manual", note: "Допустимые базы: посетитель / погонный метр; конкретное правило не выбрано." },
  "CAPEX-05-023": { type: "per_guest_area_m2", aggregation: "sum", note: "Расчёт по гостевой площади; коэффициент не определён." },
  "CAPEX-05-024": { type: "per_guest_area_m2", aggregation: "sum", note: "Расчёт по гостевой площади; коэффициент не определён." },
  "CAPEX-05-025": { type: "tbd", aggregation: "manual", note: "Допустимые базы: точка размещения / функциональная зона; конкретное правило не выбрано." },
  "CAPEX-05-026": { type: "tbd", aggregation: "manual", note: "Расчёт зависит от пиковой очереди; коэффициент не определён." },
  "CAPEX-05-027": { type: "tbd", aggregation: "manual", note: "Расчёт зависит от формата точки и требований доступной среды." },
};

function baseLink(moduleId: ModuleId, item: EquipmentRecord): ModuleItemLink {
  const capex05 = capex05QuantityRules[item.item_id];
  const knownQuantity = item.quantity_base ?? item.quantity_min;
  const type: QuantityRuleType = capex05?.type ?? (knownQuantity !== null ? "fixed" : "tbd");
  const aggregation: AggregationRule = capex05?.aggregation ?? (type === "fixed" ? "once" : "manual");
  return {
    module_id: moduleId,
    item_id: item.item_id,
    default_requirement: item.requirement,
    quantity_rule_type: type,
    quantity_rule_value: type === "fixed" ? knownQuantity : null,
    minimum_quantity: item.quantity_min,
    aggregation_rule: aggregation,
    condition: item.requirement === "conditional" ? "Зависит от выбранного формата, параметров локации или отдельного решения." : item.requirement === "optional" ? "Включается только при отдельном выборе опционального направления." : null,
    notes: capex05?.note ?? item.notes ?? null,
  };
}

function range(prefix: string, start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}-${String(start + index).padStart(3, "0")}`);
}

function buildModuleLinks(register: CapexRegister): ModuleItemLink[] {
  const equipment = new Map(register.equipment.map(item => [item.item_id, item]));
  const assignments: Array<[ModuleId, string[]]> = [
    ["MOD-PREP", range("CAPEX-01", 1, 47)],
    ["MOD-RETAIL-HOT", [...range("CAPEX-02", 1, 9), ...range("CAPEX-02", 14, 31)]],
    ["MOD-BAR", [...range("CAPEX-02", 10, 13), ...range("CAPEX-02", 32, 55)]],
    ["MOD-GROW", range("CAPEX-03", 1, 19)],
    ["MOD-POS", range("CAPEX-04", 1, 2)],
    ["MOD-KDS", ["CAPEX-04-003"]],
    ["MOD-GUEST", [...range("CAPEX-05", 1, 7), ...range("CAPEX-05", 22, 27)]],
    ["MOD-TAKEAWAY", ["CAPEX-02-007", "CAPEX-02-008", ...range("CAPEX-05", 8, 21)]],
  ];
  const links = assignments.flatMap(([moduleId, itemIds]) => itemIds.map(itemId => {
    const item = equipment.get(itemId);
    if (!item) throw new Error(`${moduleId}: missing equipment ${itemId}.`);
    const link = baseLink(moduleId, item);
    if (["CAPEX-02-007", "CAPEX-02-008"].includes(itemId)) link.aggregation_rule = "max";
    return link;
  }));
  return links;
}

function pointFormats(): PointFormat[] {
  return [
    {
      format_id: "FMT-PREP-CENTER", name: "Заготовочный цех", lifecycle_status: "research", manual_selection: false,
      purpose: "Производство и подготовка компонентов без собственной полноценной розничной точки.",
      required_modules: ["MOD-PREP", "MOD-POS", "MOD-STORAGE", "MOD-WASH", "MOD-ENGINEERING"],
      optional_modules: ["MOD-GROW", "MOD-STAFF"], conditional_modules: [], excluded_modules: ["MOD-GUEST", "MOD-TAKEAWAY"], exclusion_mode: "excluded", notes: null,
    },
    {
      format_id: "FMT-INTEGRATED", name: "Совмещённый объект", lifecycle_status: "research", manual_selection: false,
      purpose: "Заготовочный цех и торговая точка в одном помещении. Может работать с посадочным залом или без него.",
      required_modules: ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-POS", "MOD-KDS", "MOD-TAKEAWAY", "MOD-STORAGE", "MOD-WASH", "MOD-ENGINEERING"],
      optional_modules: ["MOD-BAR", "MOD-GUEST", "MOD-GROW", "MOD-STAFF"], conditional_modules: [], excluded_modules: [], exclusion_mode: "none", notes: null,
    },
    {
      format_id: "FMT-RESTAURANT-SEATING", name: "Торговая точка с посадочным залом", lifecycle_status: "research", manual_selection: false,
      purpose: "Полноценная торговая точка с собственной гостевой зоной, получающая часть компонентов из централизованного производства.",
      required_modules: ["MOD-RETAIL-HOT", "MOD-POS", "MOD-KDS", "MOD-GUEST", "MOD-TAKEAWAY", "MOD-WASH", "MOD-ENGINEERING"],
      optional_modules: ["MOD-BAR", "MOD-GROW", "MOD-STORAGE", "MOD-STAFF"], conditional_modules: ["MOD-PREP"], excluded_modules: [], exclusion_mode: "none", notes: null,
    },
    {
      format_id: "FMT-FOOD-COURT", name: "Точка на фудкорте", lifecycle_status: "research", manual_selection: false,
      purpose: "Торговая точка, использующая общую посадочную зону фудкорта.",
      required_modules: ["MOD-RETAIL-HOT", "MOD-POS", "MOD-KDS", "MOD-TAKEAWAY", "MOD-ENGINEERING"],
      optional_modules: ["MOD-BAR", "MOD-STORAGE", "MOD-WASH"], conditional_modules: [], excluded_modules: ["MOD-GUEST", "MOD-GROW", "MOD-PREP"], exclusion_mode: "excluded_by_default",
      notes: "Собственная гостевая мебель и гардероб по умолчанию не включаются.",
    },
    {
      format_id: "FMT-STREET-PICKUP", name: "Уличная точка выдачи / павильон", lifecycle_status: "research", manual_selection: false,
      purpose: "Точка, ориентированная преимущественно на заказ и выдачу без посадочного зала.",
      required_modules: ["MOD-RETAIL-HOT", "MOD-POS", "MOD-KDS", "MOD-TAKEAWAY", "MOD-ENGINEERING"],
      optional_modules: ["MOD-BAR", "MOD-STORAGE", "MOD-WASH"], conditional_modules: [], excluded_modules: ["MOD-GUEST", "MOD-GROW", "MOD-PREP"], exclusion_mode: "excluded_by_default", notes: null,
    },
    {
      format_id: "FMT-FOODTRUCK", name: "Фудтрак", lifecycle_status: "research", manual_selection: false,
      purpose: "Мобильная торговая точка с ограниченной площадью и максимально компактным составом оборудования.",
      required_modules: ["MOD-RETAIL-HOT", "MOD-POS", "MOD-TAKEAWAY", "MOD-ENGINEERING"],
      optional_modules: ["MOD-BAR", "MOD-KDS"], conditional_modules: [], excluded_modules: ["MOD-GUEST", "MOD-GROW", "MOD-PREP"], exclusion_mode: "excluded_by_default",
      notes: "Тяжёлое производственное оборудование и полноценный заготовочный цикл не включаются без отдельного override.",
    },
    {
      format_id: "FMT-CUSTOM", name: "Произвольная конфигурация", lifecycle_status: "research", manual_selection: true,
      purpose: "Ручная сборка объекта из любых доступных функциональных модулей.",
      required_modules: [], optional_modules: [], conditional_modules: [], excluded_modules: [], exclusion_mode: "none", notes: "Все модули выбираются вручную.",
    },
  ];
}

function templateConfiguration(): CapexConfiguration {
  return {
    configuration_id: "CFG-TEMPLATE-001", name: "Пустая шаблонная конфигурация", format_id: "FMT-CUSTOM", lifecycle_status: "research",
    total_area_m2: null, guest_area_m2: null, hall_count: null, seat_count: null, cashier_post_count: null,
    hot_kitchen_post_count: null, filling_count: null, service_station_count: null, peak_orders_per_hour: null, daily_orders: null,
    bar_enabled: null, alcohol_enabled: null, prep_enabled: null, grow_enabled: null, central_supply_enabled: null,
    self_service_enabled: null, reusable_tableware_enabled: null, shared_seating: null, mobile_format: null,
    selected_modules: [], excluded_modules: [], notes: "Шаблон структуры; не является конфигурацией реального объекта.",
  };
}

export function buildModularSources(register: CapexRegister): ModularSources {
  const modules = functionalModules();
  const links = buildModuleLinks(register);
  const formats = pointFormats();
  return {
    modules: { schema_version: 1, document: metadata("DOC-CAPEX-MODULES", "CAPEX Modules", "CAPEX — Функциональные модули", "Working CAPEX functional module library"), modules },
    module_items: { schema_version: 1, document: { ...metadata("DOC-CAPEX-MODULES", "CAPEX Module Items", "CAPEX — Связи модулей и оснащения", "Generated module-to-equipment mapping"), generated_from: [MODULAR_PATHS.modules, "docs-platform/working/capex-equipment-register.yaml"] }, links },
    point_formats: { schema_version: 1, document: metadata("DOC-CAPEX-POINT-FORMATS", "CAPEX Point Formats", "CAPEX — Профили форматов точек", "Working CAPEX point format profiles"), formats },
    configurations: { schema_version: 1, document: metadata("DOC-CAPEX-CONFIGURATIONS", "CAPEX Configurations", "CAPEX — Конфигурации объектов", "Working CAPEX object configurations"), configurations: [templateConfiguration()] },
    configuration_overrides: { schema_version: 1, document: { ...metadata("DOC-CAPEX-CONFIGURATIONS", "CAPEX Configuration Overrides", "CAPEX — Переопределения конфигураций", "Working CAPEX configuration overrides"), key: "configuration_id + item_id" }, overrides: [] },
  };
}

export function serializeModularSource(value: unknown) { return YAML.stringify(value, { lineWidth: 0 }); }

export function modularFilePath(key: keyof typeof MODULAR_PATHS) {
  return path.resolve(platformRoot, "..", MODULAR_PATHS[key]);
}

export function readModularSources(): ModularSources {
  return {
    modules: YAML.parse(fs.readFileSync(modularFilePath("modules"), "utf8")),
    module_items: YAML.parse(fs.readFileSync(modularFilePath("moduleItems"), "utf8")),
    point_formats: YAML.parse(fs.readFileSync(modularFilePath("formats"), "utf8")),
    configurations: YAML.parse(fs.readFileSync(modularFilePath("configurations"), "utf8")),
    configuration_overrides: YAML.parse(fs.readFileSync(modularFilePath("overrides"), "utf8")),
  };
}

function schemaErrors(name: string, value: unknown) {
  const schema = JSON.parse(fs.readFileSync(path.join(platformRoot, "schemas", `${name}.schema.json`), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${name} ${error.instancePath || "/"} ${error.message}`);
}

export function validateModularSources(register: CapexRegister, sources: ModularSources) {
  const errors = [
    ...schemaErrors("capex-modules", sources.modules),
    ...schemaErrors("capex-module-items", sources.module_items),
    ...schemaErrors("capex-point-formats", sources.point_formats),
    ...schemaErrors("capex-configurations", sources.configurations),
    ...schemaErrors("capex-configuration-overrides", sources.configuration_overrides),
  ];
  const itemIds = new Set(register.equipment.map(item => item.item_id));
  const moduleIds = sources.modules.modules.map(item => item.module_id);
  const formatIds = sources.point_formats.formats.map(item => item.format_id);
  const configurationIds = sources.configurations.configurations.map(item => item.configuration_id);
  for (const [label, ids] of [["item_id", [...itemIds]], ["module_id", moduleIds], ["format_id", formatIds], ["configuration_id", configurationIds]] as const) {
    if (new Set(ids).size !== ids.length) errors.push(`Duplicate ${label}.`);
  }
  if (register.equipment.length !== EQUIPMENT_RECORD_COUNT) errors.push(`Equipment Register must contain exactly ${EQUIPMENT_RECORD_COUNT} records.`);
  if (formatIds.length !== 7) errors.push("Point format library must contain exactly seven formats.");
  const moduleSet = new Set(moduleIds);
  const formatSet = new Set(formatIds);
  for (const link of sources.module_items.links) {
    if (!moduleSet.has(link.module_id)) errors.push(`${link.module_id}: module-item link references a missing module.`);
    if (!itemIds.has(link.item_id)) errors.push(`${link.module_id}: module-item link references missing ${link.item_id}.`);
  }
  const mappedItems = new Set(sources.module_items.links.map(link => link.item_id));
  for (const itemId of itemIds) if (!mappedItems.has(itemId)) errors.push(`${itemId}: equipment record is not mapped to a functional module.`);
  for (const format of sources.point_formats.formats) for (const moduleId of [...format.required_modules, ...format.optional_modules, ...format.conditional_modules, ...format.excluded_modules]) if (!moduleSet.has(moduleId)) errors.push(`${format.format_id}: missing module ${moduleId}.`);
  for (const configuration of sources.configurations.configurations) {
    if (!formatSet.has(configuration.format_id)) errors.push(`${configuration.configuration_id}: missing format ${configuration.format_id}.`);
    for (const moduleId of [...configuration.selected_modules, ...configuration.excluded_modules]) if (!moduleSet.has(moduleId)) errors.push(`${configuration.configuration_id}: missing module ${moduleId}.`);
  }
  const configurationSet = new Set(configurationIds);
  for (const override of sources.configuration_overrides.overrides) {
    if (!configurationSet.has(override.configuration_id)) errors.push(`Override references missing configuration ${override.configuration_id}.`);
    if (!itemIds.has(override.item_id)) errors.push(`Override references missing item ${override.item_id}.`);
  }
  const formatEquipmentIds = new Set(formatIds.filter(id => itemIds.has(id)));
  if (formatEquipmentIds.size) errors.push("Point formats must not be stored as equipment records.");
  const foodCourt = sources.point_formats.formats.find(item => item.format_id === "FMT-FOOD-COURT");
  if (!foodCourt?.excluded_modules.includes("MOD-GUEST")) errors.push("FMT-FOOD-COURT must exclude MOD-GUEST by default.");
  const pickup = sources.point_formats.formats.find(item => item.format_id === "FMT-STREET-PICKUP");
  if (!pickup?.excluded_modules.includes("MOD-GUEST")) errors.push("FMT-STREET-PICKUP must exclude MOD-GUEST by default.");
  const truck = sources.point_formats.formats.find(item => item.format_id === "FMT-FOODTRUCK");
  if (!truck?.excluded_modules.includes("MOD-PREP") || !truck.excluded_modules.includes("MOD-GUEST")) errors.push("FMT-FOODTRUCK must exclude the prep and guest modules by default.");
  return errors;
}

type InclusionSource = { module_id: ModuleId; source: string; link: ModuleItemLink };

function selectedModules(configuration: CapexConfiguration, format: PointFormat) {
  const selected = new Map<ModuleId, string>();
  for (const moduleId of format.required_modules) selected.set(moduleId, "format_required");
  for (const moduleId of configuration.selected_modules) selected.set(moduleId, "configuration_selected");
  const flags: Array<[boolean | null, ModuleId, string]> = [
    [configuration.bar_enabled, "MOD-BAR", "bar_enabled"],
    [configuration.prep_enabled, "MOD-PREP", "prep_enabled"],
    [configuration.grow_enabled, "MOD-GROW", "grow_enabled"],
    [configuration.self_service_enabled, "MOD-TAKEAWAY", "self_service_enabled"],
  ];
  for (const [enabled, moduleId, source] of flags) if (enabled === true) selected.set(moduleId, source);
  for (const moduleId of configuration.excluded_modules) selected.delete(moduleId);
  return selected;
}

function ruleInput(configuration: CapexConfiguration, type: QuantityRuleType) {
  if (type === "per_seat") return configuration.seat_count;
  if (type === "per_guest_area_m2") return configuration.guest_area_m2;
  if (type === "per_workstation") return null;
  if (type === "per_cashier_post") return configuration.cashier_post_count;
  if (type === "per_hot_kitchen_post") return configuration.hot_kitchen_post_count;
  if (type === "per_filling") return configuration.filling_count;
  if (type === "per_station") return configuration.service_station_count;
  return null;
}

function linkQuantity(configuration: CapexConfiguration, link: ModuleItemLink) {
  if (link.quantity_rule_type === "fixed") return link.quantity_rule_value ?? link.minimum_quantity;
  if (["manual", "tbd"].includes(link.quantity_rule_type)) return null;
  const input = ruleInput(configuration, link.quantity_rule_type);
  if (input === null || link.quantity_rule_value === null) return null;
  return Math.max(input * link.quantity_rule_value, link.minimum_quantity ?? 0);
}

function aggregateQuantities(entries: InclusionSource[], configuration: CapexConfiguration) {
  const values = entries.map(entry => linkQuantity(configuration, entry.link));
  const rule = entries[0]?.link.aggregation_rule ?? "manual";
  if (entries.some(entry => entry.link.aggregation_rule !== rule) || rule === "manual" || values.some(value => value === null)) return null;
  const numbers = values as number[];
  if (rule === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (rule === "max" || rule === "once") return Math.max(...numbers);
  return null;
}

function linkConditionSatisfied(condition: string | null, configuration: CapexConfiguration) {
  if (!condition) return true;
  if (condition.trim() === "alcohol_enabled == true") return configuration.alcohol_enabled === true;
  return true;
}

export type BomRecord = {
  item_id: string;
  name: string;
  modules: string;
  inclusion_source: string;
  requirement: string;
  calculated_quantity: number | null;
  unit: string;
  quantity_rule: string;
  calculation_status: "Рассчитано" | "Требует уточнения";
  override: string | null;
  inclusion_status: string;
  independent_procurement: boolean;
  open_parameters: string | null;
  specification: string | null;
  notes: string | null;
};

export type EquipmentBom = {
  schema_version: 1;
  document: Record<string, unknown>;
  active_modules: Array<{ module_id: ModuleId; source: string }>;
  equipment: BomRecord[];
};

export function validateEquipmentBom(bom: EquipmentBom) {
  const errors = schemaErrors("capex-equipment-bom", bom);
  const ids = bom.equipment.map(item => item.item_id);
  if (new Set(ids).size !== ids.length) errors.push("Generated BOM contains duplicate item_id values.");
  for (const item of bom.equipment) {
    if (item.calculated_quantity === null && item.calculation_status !== "Требует уточнения") errors.push(`${item.item_id}: unknown quantity must require clarification.`);
    if (item.inclusion_status === "included_in_parent" && item.independent_procurement) errors.push(`${item.item_id}: included_in_parent cannot be an independent procurement record.`);
  }
  return errors;
}

export function buildEquipmentBom(configurationId: string, register = readRegister(), sources = readModularSources()): EquipmentBom {
  const errors = validateModularSources(register, sources);
  if (errors.length) throw new Error(errors.join("\n"));
  const configuration = sources.configurations.configurations.find(item => item.configuration_id === configurationId);
  if (!configuration) throw new Error(`Unknown configuration ${configurationId}.`);
  const format = sources.point_formats.formats.find(item => item.format_id === configuration.format_id)!;
  const activeModules = selectedModules(configuration, format);
  const inclusion = new Map<string, InclusionSource[]>();
  for (const link of sources.module_items.links) {
    const source = activeModules.get(link.module_id);
    if (!source || !linkConditionSatisfied(link.condition, configuration)) continue;
    const list = inclusion.get(link.item_id) ?? [];
    list.push({ module_id: link.module_id, source, link });
    inclusion.set(link.item_id, list);
  }
  const overrideByItem = new Map(sources.configuration_overrides.overrides.filter(item => item.configuration_id === configurationId).map(item => [item.item_id, item]));
  for (const override of overrideByItem.values()) if (override.action === "include" && !inclusion.has(override.item_id)) inclusion.set(override.item_id, []);
  const equipment: BomRecord[] = [];
  for (const item of register.equipment) {
    const entries = inclusion.get(item.item_id);
    const override = overrideByItem.get(item.item_id);
    if (!entries || override?.action === "exclude") continue;
    let quantity = aggregateQuantities(entries, configuration);
    if (override?.action === "change_quantity") quantity = override.quantity_override;
    const specification = override && ["replace", "change_specification"].includes(override.action) ? override.specification_override : item.specification;
    const rules = [...new Set(entries.map(entry => entry.link.quantity_rule_type))];
    equipment.push({
      item_id: item.item_id,
      name: item.name,
      modules: entries.length ? [...new Set(entries.map(entry => entry.module_id))].join(", ") : "override",
      inclusion_source: entries.length ? [...new Set(entries.map(entry => entry.source))].join(", ") : "configuration_override",
      requirement: override?.requirement_override ?? (entries[0]?.link.default_requirement ?? item.requirement),
      calculated_quantity: quantity,
      unit: item.unit,
      quantity_rule: rules.length ? rules.join(", ") : "manual",
      calculation_status: quantity === null ? "Требует уточнения" : "Рассчитано",
      override: override ? `${override.action}: ${override.reason}` : null,
      inclusion_status: item.inclusion_status,
      independent_procurement: item.inclusion_status !== "included_in_parent",
      open_parameters: item.open_parameters,
      specification,
      notes: item.notes,
    });
  }
  if (new Set(equipment.map(item => item.item_id)).size !== equipment.length) throw new Error("Generated BOM contains duplicate item_id values.");
  const bom: EquipmentBom = {
    schema_version: 1,
    document: {
      project: "Колобочная", title: "Generated Equipment BOM", russian_title: "Сформированная комплектация объекта", version: "0.1",
      status: "research", configuration_id: configurationId, format_id: configuration.format_id,
      warning: "Цены и итоговый CAPEX не определены. Пустые количества требуют уточнения и не заменяются нулём.",
    },
    active_modules: [...activeModules].map(([module_id, source]) => ({ module_id, source })),
    equipment,
  };
  const bomErrors = validateEquipmentBom(bom);
  if (bomErrors.length) throw new Error(bomErrors.join("\n"));
  return bom;
}

export const BOM_COLUMNS: Array<keyof BomRecord> = [
  "item_id", "name", "modules", "inclusion_source", "requirement", "calculated_quantity", "unit", "quantity_rule", "calculation_status", "override", "inclusion_status", "independent_procurement", "open_parameters", "specification", "notes",
];

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function equipmentBomCsv(bom: EquipmentBom) {
  const rows = [BOM_COLUMNS.map(String), ...bom.equipment.map(item => BOM_COLUMNS.map(column => item[column]))];
  return `${rows.map(row => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function modularStatistics(register: CapexRegister, sources: ModularSources) {
  const mapped = new Set(sources.module_items.links.map(link => link.item_id));
  return {
    equipment_record_count: register.equipment.length,
    module_count: sources.modules.modules.length,
    point_format_count: sources.point_formats.formats.length,
    configuration_count: sources.configurations.configurations.length,
    module_item_link_count: sources.module_items.links.length,
    mapped_equipment_record_count: register.equipment.filter(item => mapped.has(item.item_id)).length,
    unmapped_record_count: register.equipment.filter(item => !mapped.has(item.item_id)).length,
  };
}

export function modularPayload(register: CapexRegister, sources: ModularSources) {
  return {
    schema_version: 1,
    iteration_id: CAPEX_REGISTER_ITERATION_ID,
    proposal_id: CAPEX_REGISTER_PROPOSAL_ID,
    decision_id: CAPEX_REGISTER_DECISION_ID,
    equipment_register: register,
    ...sources,
  };
}

export function modularPayloadHash(register: CapexRegister, sources: ModularSources) {
  return sha256(serializeModularSource(modularPayload(register, sources)));
}
