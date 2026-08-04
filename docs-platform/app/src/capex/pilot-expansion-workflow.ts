import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { platformRoot, writeSecretJson } from "../google/config.js";
import { appendTimelineEvent, generateTimeline, readTimelineEvents, type IterationStatus, type TimelineEventInput } from "../governance/timeline.js";
import { loadRegistry, writeYaml } from "../governance/registry.js";
import {
  buildEquipmentBom,
  equipmentBomCsv,
  readModularSources,
  validateModularSources,
  type CapexConfiguration,
  type ModularSources,
  type ModuleItemLink,
} from "./modular.js";
import {
  PRICE_SCENARIOS,
  priceSourceRegistryEntries,
  readPriceResearch,
  recalculatePriceSummary,
  serializePriceResearch,
  validatePriceResearch,
  type CapexPriceResearch,
  type PriceResearchItem,
  type PriceScenario,
  type PriceScenarioValue,
} from "./price-research.js";
import {
  ADDED_RESEARCH_RECORD_COUNT,
  EQUIPMENT_RECORD_COUNT,
  equipmentCsv,
  readRegister,
  serializeRegister,
  sha256,
  validateRegister,
  type CapexRegister,
  type EquipmentRecord,
  type OpenParameter,
} from "./register.js";

export const PILOT_ITERATION_ID = "ITR-PILOT-CAPEX-BASELINE-2026-08-03-01";
export const PILOT_PROPOSAL_ID = "PROP-PILOT-CAPEX-BASELINE-2026-08-03-01";
export const PILOT_DECISION_ID = "DEC-011";
export const PILOT_DECISION_CHANGE_ID = "CHG-019";
export const PILOT_CHANGE_ID = "CHG-020";
export const PILOT_SOURCE_ID = "SRC-PILOT-CAPEX-AND-OPERATING-BRIEF";
export const PILOT_DATE = "2026-08-03";
export const PILOT_CHECKED_AT = "2026-08-03T12:00:00.000Z";
export const PILOT_CONFIGURATION_ID = "CFG-PILOT-001";
export const PILOT_ASSUMPTIONS_DOCUMENT_ID = "DOC-PILOT-CAPEX-ASSUMPTIONS";
export const PILOT_ASSUMPTIONS_PATH = "docs-platform/working/pilot-capex-assumptions.yaml";
export const PILOT_PAYLOAD_PATH = `docs-platform/changelog/payloads/${PILOT_ITERATION_ID}-approved.yaml`;
export const PILOT_RECEIPT_PATH = `docs-platform/changelog/iteration-receipts/${PILOT_ITERATION_ID}.yaml`;
export const PILOT_VERIFICATION_PATH = `docs-platform/changelog/verification/${PILOT_ITERATION_ID}.yaml`;
export const PILOT_GOOGLE_RECEIPT_PATH = `docs-platform/changelog/google-sync/2026-08-03-DOC-CAPEX-EQUIPMENT-REGISTER-PILOT-BASELINE.yaml`;

const projectRoot = path.resolve(platformRoot, "..");
const payloadFile = path.resolve(projectRoot, PILOT_PAYLOAD_PATH);
const proposalFile = path.join(platformRoot, "changes", "proposals", `${PILOT_PROPOSAL_ID}.yaml`);
const iterationFile = path.join(platformRoot, "changes", "iterations", `${PILOT_ITERATION_ID}.yaml`);
const decisionChangeFile = path.join(platformRoot, "changes", `${PILOT_DECISION_CHANGE_ID}-pilot-capex-baseline-decision.yaml`);
const mainChangeFile = path.join(platformRoot, "changes", `${PILOT_CHANGE_ID}-pilot-capex-baseline.yaml`);
const runtimePreviewFile = path.join(platformRoot, ".runtime", "pilot-capex-baseline-preview.json");
const receiptFile = path.resolve(projectRoot, PILOT_RECEIPT_PATH);
const rollbackRoot = path.join(platformRoot, "changelog", "rollback-payloads", PILOT_ITERATION_ID);

type Target = { path: string; content: string };
type BeforeFile = { path: string; existed: boolean; sha256: string | null; rollback_payload_path: string | null };
type InventoryLine = { id: string; quantity: number; unit: string; unitBudgetRub: number; note: string };

const prepInventory: InventoryLine[] = [
  { id: "CAPEX-01-027", quantity: 6, unit: "шт.", unitBudgetRub: 7000, note: "Набор профессиональных кастрюль разных объёмов." },
  { id: "CAPEX-01-028", quantity: 4, unit: "шт.", unitBudgetRub: 5000, note: "Профессиональные сковороды рабочих диаметров." },
  { id: "CAPEX-01-029", quantity: 8, unit: "шт.", unitBudgetRub: 3500, note: "Ножи по рабочим операциям и резерву." },
  { id: "CAPEX-01-030", quantity: 12, unit: "шт.", unitBudgetRub: 1500, note: "Цветовая маркировка по продуктовым группам." },
  { id: "CAPEX-01-031", quantity: 4, unit: "шт.", unitBudgetRub: 1200, note: "Пинцеты и специализированные щипцы." },
  { id: "CAPEX-01-032", quantity: 8, unit: "шт.", unitBudgetRub: 800, note: "Кухонные щипцы по постам." },
  { id: "CAPEX-01-033", quantity: 8, unit: "шт.", unitBudgetRub: 700, note: "Лопатки разных типов." },
  { id: "CAPEX-01-034", quantity: 4, unit: "шт.", unitBudgetRub: 1000, note: "Венчики рабочих размеров." },
  { id: "CAPEX-01-035", quantity: 6, unit: "шт.", unitBudgetRub: 1000, note: "Половники по ёмкостям и процессам." },
  { id: "CAPEX-01-036", quantity: 4, unit: "шт.", unitBudgetRub: 1000, note: "Шумовки рабочих размеров." },
  { id: "CAPEX-01-037", quantity: 6, unit: "шт.", unitBudgetRub: 2000, note: "Сита и дуршлаги разных размеров." },
  { id: "CAPEX-01-038", quantity: 6, unit: "шт.", unitBudgetRub: 500, note: "Скребки для рабочих поверхностей и ёмкостей." },
  { id: "CAPEX-01-039", quantity: 8, unit: "шт.", unitBudgetRub: 800, note: "Мерные кувшины и ёмкости." },
  { id: "CAPEX-01-040", quantity: 36, unit: "шт.", unitBudgetRub: 2000, note: "Оборотный набор гастроёмкостей и крышек." },
  { id: "CAPEX-01-041", quantity: 30, unit: "шт.", unitBudgetRub: 1200, note: "Герметичные контейнеры разных объёмов." },
  { id: "CAPEX-01-042", quantity: 1, unit: "комплект", unitBudgetRub: 0, note: "Разделение уже обеспечивается количеством и цветовой маркировкой ножей, досок и ёмкостей; отдельно не суммируется." },
];

const retailInventory: InventoryLine[] = [
  { id: "CAPEX-02-014", quantity: 4, unit: "шт.", unitBudgetRub: 3500, note: "Ножи по двум горячим постам и резерву." },
  { id: "CAPEX-02-015", quantity: 8, unit: "шт.", unitBudgetRub: 1500, note: "Маркированные доски по рабочим операциям." },
  { id: "CAPEX-02-016", quantity: 4, unit: "шт.", unitBudgetRub: 1200, note: "Профессиональные кухонные ножницы." },
  { id: "CAPEX-02-017", quantity: 12, unit: "шт.", unitBudgetRub: 700, note: "Лопатки по постам и резерву." },
  { id: "CAPEX-02-018", quantity: 12, unit: "шт.", unitBudgetRub: 800, note: "Щипцы по постам и резерву." },
  { id: "CAPEX-02-019", quantity: 12, unit: "шт.", unitBudgetRub: 500, note: "Рабочие вилки и ложки." },
  { id: "CAPEX-02-020", quantity: 8, unit: "шт.", unitBudgetRub: 1000, note: "Половники и шумовки." },
  { id: "CAPEX-02-021", quantity: 4, unit: "шт.", unitBudgetRub: 1000, note: "Венчики рабочих размеров." },
  { id: "CAPEX-02-022", quantity: 12, unit: "шт.", unitBudgetRub: 500, note: "Палочки и инструменты для грилей Колобков и Манчеса." },
  { id: "CAPEX-02-023", quantity: 4, unit: "шт.", unitBudgetRub: 2000, note: "Сита и дуршлаги." },
  { id: "CAPEX-02-024", quantity: 8, unit: "шт.", unitBudgetRub: 750, note: "Мерные стаканы, кувшины и ложки." },
  { id: "CAPEX-02-025", quantity: 4, unit: "шт.", unitBudgetRub: 3500, note: "Дополнительные весы и термощупы торговой кухни." },
  { id: "CAPEX-02-026", quantity: 12, unit: "шт.", unitBudgetRub: 2500, note: "Подносы и противни оборотного комплекта." },
  { id: "CAPEX-02-027", quantity: 40, unit: "шт.", unitBudgetRub: 2000, note: "Гастроёмкости и крышки оборотного комплекта." },
  { id: "CAPEX-02-028", quantity: 25, unit: "шт.", unitBudgetRub: 1200, note: "Герметичные контейнеры разных объёмов." },
  { id: "CAPEX-02-029", quantity: 24, unit: "шт.", unitBudgetRub: 700, note: "Дозаторы для соусов и топпингов." },
  { id: "CAPEX-02-030", quantity: 6, unit: "шт.", unitBudgetRub: 2000, note: "Органайзеры по рабочим постам." },
  { id: "CAPEX-02-031", quantity: 6, unit: "шт.", unitBudgetRub: 2000, note: "Ёмкости для санитарной обработки инвентаря." },
];

const barInventory: InventoryLine[] = [
  { id: "CAPEX-02-032", quantity: 6, unit: "шт.", unitBudgetRub: 800, note: "Джиггеры и мерные стаканы." },
  { id: "CAPEX-02-033", quantity: 6, unit: "шт.", unitBudgetRub: 800, note: "Барные ложки." },
  { id: "CAPEX-02-034", quantity: 4, unit: "шт.", unitBudgetRub: 2400, note: "Кувшины рабочих объёмов." },
  { id: "CAPEX-02-035", quantity: 24, unit: "шт.", unitBudgetRub: 700, note: "Бутылки, помпы и дозаторы для сиропов." },
  { id: "CAPEX-02-036", quantity: 6, unit: "шт.", unitBudgetRub: 800, note: "Совки и щипцы для льда." },
  { id: "CAPEX-02-037", quantity: 4, unit: "шт.", unitBudgetRub: 2000, note: "Закрываемые контейнеры для льда." },
  { id: "CAPEX-02-038", quantity: 1, unit: "комплект", unitBudgetRub: 10000, note: "Ножи и цветовые доски для фруктов." },
  { id: "CAPEX-02-039", quantity: 2, unit: "шт.", unitBudgetRub: 6000, note: "Ручные прессы для цитрусовых." },
  { id: "CAPEX-02-040", quantity: 12, unit: "шт.", unitBudgetRub: 900, note: "Закрываемые ёмкости для добавок." },
  { id: "CAPEX-02-041", quantity: 4, unit: "шт.", unitBudgetRub: 2500, note: "Поддоны и каплесборники." },
  { id: "CAPEX-02-042", quantity: 1, unit: "комплект", unitBudgetRub: 20000, note: "Инвентарь для мойки кег, шлангов и барного оборудования." },
];

const bundleDefinitions = [
  { parentId: "CAPEX-01-048", moduleId: "CAPEX-01", moduleName: "Заготовочный цех", category: "Заготовочный цех", subcategory: "Кухонный инвентарь заготовочного цеха", name: "Комплект мелкого инвентаря заготовочного цеха", functionalModule: "MOD-PREP", lines: prepInventory, subtotal: 268200, reserve: 26820, total: 295020 },
  { parentId: "CAPEX-02-056", moduleId: "CAPEX-02", moduleName: "Торговая кухня, бар и зона выдачи", category: "Торговая кухня, бар и зона выдачи", subcategory: "Кухонный инвентарь торговой точки", name: "Комплект мелкого инвентаря торговой кухни", functionalModule: "MOD-RETAIL-HOT", lines: retailInventory, subtotal: 281600, reserve: 28160, total: 309760 },
  { parentId: "CAPEX-02-057", moduleId: "CAPEX-02", moduleName: "Торговая кухня, бар и зона выдачи", category: "Торговая кухня, бар и зона выдачи", subcategory: "Базовый барный инвентарь", name: "Комплект базового барного инвентаря", functionalModule: "MOD-BAR", lines: barInventory, subtotal: 111600, reserve: 11160, total: 122760 },
] as const;

function absolute(relativePath: string) {
  const result = path.resolve(projectRoot, relativePath);
  if (!result.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Path outside project: ${relativePath}.`);
  return result;
}
function relative(file: string) { return path.relative(projectRoot, file).replaceAll(path.sep, "/"); }
function fileHash(file: string) { return fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null; }
function composite(entries: Array<{ path: string; hash: string | null }>) { return sha256(JSON.stringify(entries)); }
function atomicWrite(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}
function writeOnce(file: string, content: string) {
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") !== content) throw new Error(`Governed artifact already exists with different content: ${relative(file)}.`);
    return;
  }
  atomicWrite(file, content);
}
function money(value: number) { return Math.round(value * 100) / 100; }

function researchRecord(input: {
  itemId: string;
  moduleId: string;
  moduleName: string;
  category: string;
  subcategory: string;
  name: string;
  recordType: EquipmentRecord["record_type"];
  parentItemId?: string | null;
  inclusionStatus: EquipmentRecord["inclusion_status"];
  requirement?: EquipmentRecord["requirement"];
  quantity?: number | null;
  unit?: string;
  specification: string;
  openParameters?: string | null;
  premisesDependency?: string | null;
  powerKw?: number | null;
  voltage?: number | null;
  waterRequired?: boolean | null;
  drainageRequired?: boolean | null;
}): EquipmentRecord {
  const source = { ...input, decision: PILOT_DECISION_ID, date: PILOT_DATE };
  return {
    item_id: input.itemId,
    module_id: input.moduleId,
    module_name: input.moduleName,
    category: input.category,
    subcategory: input.subcategory,
    name: input.name,
    record_type: input.recordType,
    parent_item_id: input.parentItemId ?? null,
    inclusion_status: input.inclusionStatus,
    requirement: input.requirement ?? "required",
    lifecycle_status: "research",
    quantity_min: input.quantity ?? null,
    quantity_base: input.quantity ?? null,
    quantity_scale_ready: input.quantity ?? null,
    unit: input.unit ?? "комплект",
    source_quantity: null,
    specification: input.specification,
    open_parameters: input.openParameters ?? null,
    premises_dependency: input.premisesDependency ?? null,
    procurement_mode: input.inclusionStatus === "included_in_parent" ? "purchase" : "purchase",
    existing_condition: null,
    power_kw: input.powerKw ?? null,
    voltage: input.voltage ?? null,
    water_required: input.waterRequired ?? null,
    drainage_required: input.drainageRequired ?? null,
    gas_required: false,
    extraction_required: false,
    dimensions: null,
    service_clearance: null,
    price_min: null,
    price_base: null,
    price_max: null,
    currency: null,
    price_date: null,
    supplier: null,
    supplier_name: null,
    product_name: null,
    source_url: null,
    content_source_id: PILOT_SOURCE_ID,
    price_min_source_id: null,
    price_base_source_id: null,
    price_max_source_id: null,
    availability_status: null,
    price_includes_vat: null,
    delivery_included: null,
    confidence: null,
    price_notes: null,
    source_id: PILOT_SOURCE_ID,
    quote_status: input.inclusionStatus === "included_in_parent" ? "included_in_parent" : "not_requested",
    notes: "Добавлено решением DEC-011 как research-позиция; не является утверждённой закупкой или финальным CAPEX.",
    source_section: `${input.moduleId} / ${input.subcategory}`,
    source_item_number: Number(input.itemId.slice(-3)),
    source_record_sha256: sha256(JSON.stringify(source)),
  };
}

function bundleRecord(definition: typeof bundleDefinitions[number]) {
  return researchRecord({
    itemId: definition.parentId,
    moduleId: definition.moduleId,
    moduleName: definition.moduleName,
    category: definition.category,
    subcategory: definition.subcategory,
    name: definition.name,
    recordType: "system",
    inclusionStatus: "standalone",
    quantity: 1,
    specification: `Расчётный комплект: ${definition.lines.length} групп инвентаря; сумма строк ${definition.subtotal} ₽ + 10% резерв на дубли, бой и замену ${definition.reserve} ₽ = ${definition.total} ₽.`,
    openParameters: "Точный cart по брендам, размерам, материалам и количеству рабочих постов подтверждается после меню, техкарт и планировки.",
  });
}

function washRecords(): EquipmentRecord[] {
  const common = { moduleId: "CAPEX-08", moduleName: "Посудомоечное оборудование", category: "Посудомоечное оборудование", subcategory: "Профессиональная посудомоечная зона" };
  return [
    researchRecord({ ...common, itemId: "CAPEX-08-001", name: "Комплект профессиональной посудомоечной зоны", recordType: "system", inclusionStatus: "standalone", quantity: 1, voltage: 400, waterRequired: true, drainageRequired: true, specification: "Одна купольная машина ABAT МПК-700К, предмоечный стол с душирующим устройством, выходной стол, три дополнительные кассеты 500×500 и умягчитель воды DVA LT12.", openParameters: "Точный состав, химия, вытяжка над зоной, корзины под фактическую посуду и необходимость мойки кухонной тары.", premisesDependency: "Требуются место для грязного и чистого потоков, 400 В, вода, канализация, трап и проверка жёсткости воды." }),
    researchRecord({ ...common, itemId: "CAPEX-08-002", name: "Купольная посудомоечная машина ABAT МПК-700К", recordType: "equipment", parentItemId: "CAPEX-08-001", inclusionStatus: "included_in_parent", quantity: 1, unit: "шт.", voltage: 400, waterRequired: true, drainageRequired: true, specification: "До 700 тарелок/час; публичная карточка указывает применение в объектах до 50 посадочных мест.", premisesDependency: "400 В, подача воды и канализация; параметры подключения сверяются по паспорту." }),
    researchRecord({ ...common, itemId: "CAPEX-08-003", name: "Предмоечный стол с душирующим устройством", recordType: "component", parentItemId: "CAPEX-08-001", inclusionStatus: "included_in_parent", quantity: 1, unit: "шт.", waterRequired: true, drainageRequired: true, specification: "Ориентир ABAT СПМП-6-1; формирует грязную сторону и предварительный смыв." }),
    researchRecord({ ...common, itemId: "CAPEX-08-004", name: "Выходной стол для чистой посуды", recordType: "component", parentItemId: "CAPEX-08-001", inclusionStatus: "included_in_parent", quantity: 1, unit: "шт.", specification: "Ориентир ABAT СПМР-6-1; формирует чистую сторону посудомоечной линии." }),
    researchRecord({ ...common, itemId: "CAPEX-08-005", name: "Дополнительные кассеты 500×500", recordType: "accessory", parentItemId: "CAPEX-08-001", inclusionStatus: "included_in_parent", quantity: 3, unit: "шт.", specification: "Три дополнительные кассеты сверх базовой комплектации; типы уточняются под тарелки, стаканы и приборы." }),
    researchRecord({ ...common, itemId: "CAPEX-08-006", name: "Умягчитель воды DVA LT12", recordType: "accessory", parentItemId: "CAPEX-08-001", inclusionStatus: "included_in_parent", quantity: 1, unit: "шт.", waterRequired: true, drainageRequired: true, specification: "12 л, номинальный поток до 1000 л/час; необходимость и ресурс уточняются анализом жёсткости воды." }),
  ];
}

function inventoryBundles(register: CapexRegister) {
  const affected = new Set(bundleDefinitions.flatMap(definition => definition.lines.map(line => line.id)));
  register.open_parameters = register.open_parameters.filter(parameter => !parameter.item_id || !affected.has(parameter.item_id));
  for (const definition of bundleDefinitions) {
    const calculated = definition.lines.reduce((sum, line) => sum + line.quantity * line.unitBudgetRub, 0);
    if (calculated !== definition.subtotal || money(definition.subtotal + definition.reserve) !== definition.total) throw new Error(`${definition.parentId}: inventory arithmetic mismatch.`);
    register.equipment.push(bundleRecord(definition));
    for (const line of definition.lines) {
      const item = register.equipment.find(entry => entry.item_id === line.id);
      if (!item) throw new Error(`Missing inventory component ${line.id}.`);
      item.parent_item_id = definition.parentId;
      item.inclusion_status = "included_in_parent";
      item.requirement = "required";
      item.quantity_min = line.quantity;
      item.quantity_base = line.quantity;
      item.quantity_scale_ready = line.quantity;
      item.unit = line.unit;
      item.specification = `${line.note} Research-бюджет строки: ${line.quantity} × ${line.unitBudgetRub} ₽ = ${line.quantity * line.unitBudgetRub} ₽; отдельно не суммируется, входит в ${definition.parentId}.`;
      item.open_parameters = "Точный бренд, размеры и материал подтверждаются перед закупкой.";
      item.quote_status = "included_in_parent";
      item.notes = `Компонент расчётного комплекта ${definition.parentId}; количество и бюджет имеют статус research по DEC-011.`;
    }
    register.open_parameters.push({ parameter_id: `OP-${definition.parentId}-01`, item_id: definition.parentId, module_id: definition.moduleId, parameter: "точная спецификация комплекта мелкого инвентаря", reason: "Состав зависит от меню, числа рабочих постов, оборота мойки и выбранных материалов.", required_before: "коммерческое предложение и закупка", status: "open", notes: "Бюджет включает 10% резерв; точный cart ещё не собран." });
  }
}

function openParametersForWash(): OpenParameter[] {
  return [
    { parameter_id: "OP-CAPEX-08-001-01", item_id: "CAPEX-08-001", module_id: "CAPEX-08", parameter: "производительность и типы кассет посудомоечной зоны", reason: "Нужны число посадочных мест, пиковый возврат посуды и состав кухонной тары.", required_before: "финальный подбор модели и коммерческое предложение", status: "open", notes: "Текущий ориентир — одна купольная машина до 700 тарелок/час." },
    { parameter_id: "OP-CAPEX-08-001-02", item_id: "CAPEX-08-001", module_id: "CAPEX-08", parameter: "инженерные подключения и монтаж посудомоечной зоны", reason: "Зависят от выбранного помещения, точки воды, канализации, трапа и электрической мощности.", required_before: "полный CAPEX помещения", status: "open", notes: "Не входят в исследовательские 304 101,33 ₽." },
  ];
}

function quote(sourceId: string, supplier: string, product: string, sourceUrl: string, additionalUrls: string[], value: number, notes: string): PriceScenarioValue {
  return {
    source_id: sourceId,
    supplier_name: supplier,
    product_name: product,
    source_url: sourceUrl,
    additional_urls: additionalUrls,
    observed_unit_price_rub: value,
    availability_status: "research_composite; exact_cart_not_confirmed",
    checked_at: PILOT_CHECKED_AT,
    price_includes_vat: null,
    delivery_included: false,
    confidence: "low",
    notes,
    quantity: 1,
    quantity_basis: "register",
    line_total_rub: value,
  };
}

function scenarioSet(value: PriceScenarioValue): Record<PriceScenario, PriceScenarioValue> {
  return Object.fromEntries(PRICE_SCENARIOS.map(scenario => [scenario, structuredClone(value)])) as Record<PriceScenario, PriceScenarioValue>;
}

function newResearchItems(): PriceResearchItem[] {
  const restoll = "https://restoll.ru/catalog-by-type/stolovaya/";
  const representative = [
    "https://restoll.ru/catalog/doski_iz_plastika/",
    "https://restoll.ru/catalog/product/kastryulya-katun-kt-ob-20-k-/",
    "https://restoll.ru/catalog/product/kryshka-dlya-gastroem-1-1-nerzh-mgsteel-1-6-mgsteel-111000mg/",
  ];
  const definitions = [
    { itemId: "CAPEX-01-048", moduleId: "MOD-PREP", value: 295020, sourceId: "SRC-PRICE-20260803-PREP-INVENTORY-KIT", product: "Расчётный комплект мелкого инвентаря заготовочного цеха", url: restoll, additional: representative, notes: "Bottom-up research-бюджет 268 200 ₽ по 16 группам + 10% резерв 26 820 ₽. Это не готовая корзина поставщика." },
    { itemId: "CAPEX-02-056", moduleId: "MOD-RETAIL-HOT", value: 309760, sourceId: "SRC-PRICE-20260803-RETAIL-INVENTORY-KIT", product: "Расчётный комплект мелкого инвентаря торговой кухни", url: restoll, additional: representative, notes: "Bottom-up research-бюджет 281 600 ₽ по 18 группам + 10% резерв 28 160 ₽. Это не готовая корзина поставщика." },
    { itemId: "CAPEX-02-057", moduleId: "MOD-BAR", value: 122760, sourceId: "SRC-PRICE-20260803-BAR-INVENTORY-KIT", product: "Расчётный комплект базового барного инвентаря", url: restoll, additional: representative, notes: "Bottom-up research-бюджет 111 600 ₽ по 11 группам + 10% резерв 11 160 ₽. Многоразовая гостевая посуда и алкогольный бар не включены." },
    { itemId: "CAPEX-08-001", moduleId: "MOD-WASH", value: 304101.33, sourceId: "SRC-PRICE-20260803-DISHWASH-SYSTEM", product: "ABAT МПК-700К + предмоечный и выходной столы + 3 кассеты + DVA LT12", url: "https://abat-online.ru/product/kupolnaya-posudomoechnaya-mashina-abat-mpk-700k/", additional: ["https://abat-online.ru/catalog/aksessuary-posudomoyki/", "https://www.trapeza.ru/goods/283821/"], notes: "Композит: машина 214 410 ₽ + предмоечный стол 48 486 ₽ + выходной стол 23 128 ₽ + три кассеты 6 207 ₽ + умягчитель 11 870,33 ₽. Доставка, монтаж, химия, вода, канализация и электрическое подключение не включены." },
  ] as const;
  return definitions.map(definition => {
    const value = quote(definition.sourceId, definition.itemId === "CAPEX-08-001" ? "ABAT Online / Трапеза" : "Расчётный комплект / Restoll", definition.product, definition.url, [...definition.additional], definition.value, definition.notes);
    return { item_id: definition.itemId, module_id: definition.moduleId, valuation_status: "priced", quote_status: "quote_required", high_risk: true, risk_reason: "Составная research-оценка требует точной спецификации и коммерческого предложения перед закупкой.", scenarios: scenarioSet(value), notes: definition.notes } as PriceResearchItem;
  });
}

function applyNewPrice(register: CapexRegister, researchItem: PriceResearchItem) {
  const item = register.equipment.find(entry => entry.item_id === researchItem.item_id);
  const min = researchItem.scenarios.minimum;
  const base = researchItem.scenarios.base;
  const max = researchItem.scenarios.scale_ready;
  if (!item || !min || !base || !max) throw new Error(`Cannot apply price for ${researchItem.item_id}.`);
  item.price_min = min.observed_unit_price_rub;
  item.price_base = base.observed_unit_price_rub;
  item.price_max = max.observed_unit_price_rub;
  item.currency = "RUB";
  item.price_date = PILOT_DATE;
  item.supplier = base.supplier_name;
  item.supplier_name = base.supplier_name;
  item.product_name = base.product_name;
  item.source_id = base.source_id;
  item.source_url = base.source_url;
  item.price_min_source_id = min.source_id;
  item.price_base_source_id = base.source_id;
  item.price_max_source_id = max.source_id;
  item.availability_status = base.availability_status;
  item.checked_at = base.checked_at;
  item.price_includes_vat = base.price_includes_vat;
  item.delivery_included = base.delivery_included;
  item.confidence = base.confidence;
  item.quote_status = researchItem.quote_status;
  item.price_notes = `${researchItem.notes} ${researchItem.risk_reason}`;
}

function fixedLink(moduleId: ModuleItemLink["module_id"], itemId: string, requirement: ModuleItemLink["default_requirement"] = "required", quantity = 1): ModuleItemLink {
  return { module_id: moduleId, item_id: itemId, default_requirement: requirement, quantity_rule_type: "fixed", quantity_rule_value: quantity, minimum_quantity: quantity, aggregation_rule: "once", condition: null, notes: "Фиксированное research-количество по DEC-011; одинаковый item_id учитывается один раз." };
}

function pilotConfiguration(): CapexConfiguration {
  return {
    configuration_id: PILOT_CONFIGURATION_ID,
    name: "Пилот: заготовочный цех + торговая точка с посадочным залом",
    format_id: "FMT-INTEGRATED",
    lifecycle_status: "research",
    total_area_m2: null,
    guest_area_m2: null,
    hall_count: 1,
    seat_count: null,
    cashier_post_count: 2,
    hot_kitchen_post_count: 2,
    filling_count: null,
    service_station_count: null,
    peak_orders_per_hour: null,
    daily_orders: null,
    bar_enabled: true,
    alcohol_enabled: false,
    prep_enabled: true,
    grow_enabled: false,
    central_supply_enabled: false,
    self_service_enabled: false,
    reusable_tableware_enabled: null,
    shared_seating: false,
    mobile_format: false,
    selected_modules: ["MOD-GUEST", "MOD-BAR", "MOD-STAFF"],
    excluded_modules: ["MOD-GROW"],
    notes: "Каноническая research-конфигурация пилота по DEC-011. Площадь, число посадочных мест, инженерия и мебель остаются открытыми до выбора помещения.",
  };
}

function pilotTotals(register: CapexRegister, research: CapexPriceResearch, modular: ModularSources) {
  const bom = buildEquipmentBom(PILOT_CONFIGURATION_ID, register, modular);
  const included = new Set(bom.equipment.filter(item => item.independent_procurement).map(item => item.item_id));
  const totals = Object.fromEntries(PRICE_SCENARIOS.map(scenario => [scenario, money(research.items.filter(item => included.has(item.item_id)).reduce((sum, item) => sum + (item.scenarios[scenario]?.line_total_rub ?? 0), 0))])) as Record<PriceScenario, number>;
  return { bom, totals };
}

function pilotAssumptions(totals: Record<PriceScenario, number>) {
  return {
    schema_version: 1,
    document: {
      project: "Колобочная",
      document_id: PILOT_ASSUMPTIONS_DOCUMENT_ID,
      title: "Pilot CAPEX and Operating Assumptions",
      russian_title: "Пилотный объект — CAPEX и операционные допущения",
      version: "0.1",
      status: "research",
      decision_id: PILOT_DECISION_ID,
      iteration_id: PILOT_ITERATION_ID,
      proposal_id: PILOT_PROPOSAL_ID,
      updated_at: PILOT_DATE,
      warning: "Документ содержит исследовательские ориентиры. Он не утверждает помещение, финальный CAPEX, штатное расписание, поставщиков или финансовую модель.",
    },
    pilot_configuration: {
      configuration_id: PILOT_CONFIGURATION_ID,
      format_id: "FMT-INTEGRATED",
      description: "Заготовочный цех, совмещённый с торговой точкой и собственным посадочным залом.",
      location: null,
      premises_selected: false,
      selected_optional_modules: ["MOD-GUEST", "MOD-BAR", "MOD-STAFF"],
      excluded_modules: ["MOD-GROW"],
    },
    equipment_estimate: {
      totals_rub: totals,
      default_scenario: "base",
      minimum_selector_available: false,
      known_additions_base_rub: 1031641.33,
      known_additions: [
        { id: "CAPEX-08-001", name: "Профессиональная посудомоечная зона", amount_rub: 304101.33 },
        { id: "CAPEX-01-048", name: "Мелкий инвентарь заготовочного цеха", amount_rub: 295020 },
        { id: "CAPEX-02-056", name: "Мелкий инвентарь торговой кухни", amount_rub: 309760 },
        { id: "CAPEX-02-057", name: "Базовый барный инвентарь", amount_rub: 122760 },
      ],
      warning: "Даже BASE остаётся нижней границей: позиции без цены и все зависящие от помещения работы не считаются как ноль.",
    },
    software: { amount_rub_per_year: 120000, amount_rub_per_month: 10000, classification: "OPEX", opening_cash_treatment: "Если оплачивается авансом за год — отдельный денежный отток запуска, но не Equipment CAPEX.", source: "project owner instruction" },
    unit_economics: { target_recipe_cost_percent: 25, packaging_included: true, price_to_recipe_cost_multiple: 4, formal_markup_on_cost_percent: 300, gross_margin_before_labor_rent_and_other_costs_percent: 75, terminology_note: "Цена в четыре раза выше себестоимости означает наценку 300%, а не 400%. Формальная наценка 400% дала бы food cost 20%." },
    staffing: {
      status: "research",
      research_geography: "Санкт-Петербург",
      operating_days_per_month: 30,
      schedule_assumption: "2/2 для сменных ролей; один администратор не закрывает семь дней без участия владельца или подмены.",
      on_shift_posts: [
        { role: "Повар-заготовщик", posts: 1, net_rub_per_shift: 4800, net_rub_per_month_all_posts: 144000, headcount_for_2_2: 2 },
        { role: "Повар торговой кухни", posts: 2, net_rub_per_shift: 5200, net_rub_per_month_all_posts: 312000, headcount_for_2_2: 4 },
        { role: "Бариста-кассир", posts: 2, net_rub_per_shift: 4200, net_rub_per_month_all_posts: 252000, headcount_for_2_2: 4 },
        { role: "Уборщик", posts: 1, net_rub_per_shift: 3600, net_rub_per_month_all_posts: 108000, headcount_for_2_2: 2 },
        { role: "Администратор", posts: 1, net_rub_per_month: 100000, headcount: 1 },
      ],
      total_headcount_assumption: 13,
      net_payouts_rub_per_month: 916000,
      gross_payroll_rub_per_month_at_13_percent_ndfl: 1052873.56,
      employer_cost_range_rub_per_month: { qualifying_reduced_contributions: 1290051.62, standard_30_percent_contributions: 1368735.63 },
      excluded_from_employer_cost: ["взносы от несчастных случаев", "медкнижки", "форма", "питание", "оплачиваемые отпуска и больничные", "резерв подмен", "подбор и обучение"],
      sources: [
        "https://spb.hh.ru/vacancies/povar-zagotovschik",
        "https://spb.hh.ru/vacancies/barista-kassir",
        "https://spb.hh.ru/vacancies/administratory_restorana",
        "https://www.nalog.gov.ru/rn11/news/activities_fts/16601574/",
      ],
    },
    cold_room_benchmark: {
      status: "reference_only_not_in_budget",
      model: "Polair КХН-6,61",
      dimensions_mm: "1960×1960×2200",
      internal_volume_m3: 6.61,
      footprint_m2: 3.8416,
      shell_rub: 142831,
      medium_temperature_monoblock_reference_rub: 77325,
      assembly_reference_rub: 12000,
      indicative_total_before_shelves_delivery_electrical_and_condensate_rub: 232156,
      indicative_rub_per_footprint_m2: 60432.11,
      source_url: "https://www.polair-shop.ru/catalog/holodylnye_kamery/polair_standart2/kxh-6.61/",
      rule: "Не переносить цену за м² в CAPEX автоматически. Камеры считаются после выбора помещения по внутренним размерам, температуре, толщине панелей, нагрузке, дверям, агрегату и монтажу.",
    },
    budget_layers: [
      { id: "EQUIPMENT", name: "Оборудование и мелкий инвентарь", status: "partially_priced", calculation_basis: "Equipment Register + Price Research + generated BOM" },
      { id: "PREMISES", name: "Помещение: камеры, вентиляция, газ, вода, канализация, электрика, ремонт, монтаж, пусконаладка, мебель и навигация", status: "open_until_premises", calculation_basis: "обмеры + технологическая расстановка + инженерные проекты + коммерческие предложения" },
      { id: "SOFTWARE", name: "Программное обеспечение", status: "assumption", amount_rub_per_year: 120000 },
      { id: "PREOPENING", name: "Расходы перед открытием", status: "open", amount_rub: null },
      { id: "INITIAL_STOCK", name: "Первоначальные запасы сырья, упаковки и расходников", status: "open", amount_rub: null },
      { id: "WORKING_CAPITAL", name: "Оборотный капитал", status: "open", amount_rub: null },
      { id: "CONTINGENCY", name: "Резерв бюджета", status: "open", amount_rub: null },
    ],
    premises_calculation_method: [
      "Зафиксировать зоны, площади, высоты, мощность и фазность, воду, канализацию, газ, вентиляционные трассы и место наружных блоков.",
      "Сделать технологическую расстановку оборудования и разделить грязные/чистые и сырьевые/готовые потоки.",
      "Считать камеры по внутренним размерам и температурным режимам; вентиляцию — по тепловыделениям и воздухообмену; инженерные подключения — по точкам, мощностям и длинам трасс.",
      "Ремонт считать по обмерной ведомости и дефектам, мебель — по посадочным местам и единицам, навигацию — по фактическим точкам размещения.",
      "Получить минимум два сопоставимых коммерческих предложения по каждому крупному разделу и только затем формировать полный CAPEX запуска.",
    ],
  };
}

function finalState() {
  const currentRegister = readRegister();
  const currentResearch = readPriceResearch();
  const currentModular = readModularSources();
  if (currentRegister.document.decision_id !== "DEC-010" || currentRegister.equipment.length !== 151) throw new Error("Expected canonical DEC-010 / 151-record starting state.");
  if (currentResearch.items.length !== 47 || currentResearch.document.version !== "0.2") throw new Error("Expected the 47-row v0.2 price research starting state.");

  const register = structuredClone(currentRegister) as CapexRegister;
  register.document.decision_id = PILOT_DECISION_ID;
  register.document.iteration_id = PILOT_ITERATION_ID;
  register.document.proposal_id = PILOT_PROPOSAL_ID;
  register.document.added_research_record_count = ADDED_RESEARCH_RECORD_COUNT;
  register.document.equipment_record_count = EQUIPMENT_RECORD_COUNT;
  register.document.warning = "Research-реестр пилота включает посудомоечную систему и расчётные комплекты мелкого инвентаря. Помещение, инженерия, ремонт, мебель, запуск, оборотный капитал и резерв не считаются как ноль и остаются открытыми до исходных данных.";

  const kolobGrill = register.equipment.find(item => item.item_id === "CAPEX-02-001");
  const manchesGrill = register.equipment.find(item => item.item_id === "CAPEX-02-002");
  const grinder = register.equipment.find(item => item.item_id === "CAPEX-01-015");
  if (!kolobGrill || !manchesGrill || !grinder) throw new Error("Grill or grinder records are missing.");
  kolobGrill.name = "Газовый гриль для колобков";
  kolobGrill.specification = "Профессиональный газовый гриль с полусферическими ячейками по геометрии takoyaki; продукт и рабочее название — колобки. Две независимые установки по исходной рабочей спецификации.";
  kolobGrill.notes = "Надёжная российская карточка профессионального газового аппарата нужной геометрии не найдена; требуется технический подбор, сертификация газовой схемы и КП.";
  manchesGrill.name = "Гриль для Манчеса";
  manchesGrill.specification = "Профессиональный гриль для приготовления продукта «Манчес»; точная конструкция, мощность и производительность требуют спецификации.";
  manchesGrill.notes = "Рабочее название приведено к продукту сайта; исходная спецификация использовала термин UFO-гриль.";
  grinder.requirement = "required";
  grinder.quantity_min = 0;
  grinder.quantity_base = 1;
  grinder.quantity_scale_ready = 1;
  grinder.unit = "шт.";
  grinder.procurement_mode = "purchase";
  grinder.specification = "Одна профессиональная электрическая мясорубка средней производительности в BASE и SCALE_READY; модель и производительность подтверждаются по техкартам и объёму мясной заготовки.";
  grinder.open_parameters = "модель, производительность, система ножей и требования к санитарной разборке";
  grinder.premises_dependency = "место установки и электрическое подключение уточняются после технологической расстановки";
  grinder.notes = "DEC-011 фиксирует одну отдельную профессиональную мясорубку в BASE и SCALE_READY независимо от комплектации Robot Coupe.";
  const grinderParameter = register.open_parameters.find(parameter => parameter.item_id === grinder.item_id);
  if (grinderParameter) {
    grinderParameter.parameter = "модель, производительность, система ножей и требования к санитарной разборке";
    grinderParameter.reason = "Наличие одной мясорубки в BASE и SCALE_READY зафиксировано; остаётся подобрать точную модель под техкарты и объём заготовки.";
    grinderParameter.required_before = "коммерческое предложение и закупка";
    grinderParameter.notes = "Количество BASE и SCALE_READY — одна единица.";
  }

  inventoryBundles(register);
  const wash = washRecords();
  register.equipment.push(...wash);
  register.open_parameters.push(...openParametersForWash());
  const washMissing = register.missing_sections.find(section => section.section_id === "CAPEX-08");
  if (!washMissing) throw new Error("CAPEX-08 missing-section record is absent.");
  washMissing.status = "structured";
  washMissing.dependencies = ["пиковый возврат посуды", "число посадочных мест", "состав кухонной тары", "планировка", "вода", "канализация", "электрическая мощность"];
  washMissing.notes = "Базовый состав профессиональной посудомоечной зоны перенесён в CAPEX-08-001—006; монтаж и инженерные подключения остаются открытыми до помещения.";
  const sourceCountByModule = new Map(currentRegister.modules.map(module => [module.module_id, module.source_record_count]));
  register.modules = [...new Set(register.equipment.map(item => item.module_id))].map(id => ({
    module_id: id,
    module_name: register.equipment.find(item => item.module_id === id)!.module_name,
    source_record_count: sourceCountByModule.get(id) ?? 0,
    record_count: register.equipment.filter(item => item.module_id === id).length,
  }));

  const research = structuredClone(currentResearch) as CapexPriceResearch;
  research.document.version = "0.3";
  research.document.decision_id = PILOT_DECISION_ID;
  research.document.iteration_id = PILOT_ITERATION_ID;
  research.document.proposal_id = PILOT_PROPOSAL_ID;
  research.document.checked_at = PILOT_CHECKED_AT;
  research.document.source_register_before_sha256 = sha256(serializeRegister(currentRegister));
  research.document.warning = "Цены имеют статус research. Новые комплекты являются составными оценками, а не готовыми корзинами поставщика; помещение, доставка, монтаж, инженерные подключения, ПО и расходы запуска учитываются отдельно.";
  research.scope.included_modules = ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS", "MOD-WASH"];
  research.scope.excluded_modules_and_categories = ["MOD-GUEST", "CAPEX-05", "ремонт", "инженерное проектирование и монтаж", "пожарная безопасность", "первоначальный запас", "оборотный капитал", "резерв", "ещё не сформированные разделы"];
  research.scope.eligible_procurement_record_count = 51;
  const grillPriceOne = research.items.find(item => item.item_id === "CAPEX-02-001");
  const grillPriceTwo = research.items.find(item => item.item_id === "CAPEX-02-002");
  const grinderPrice = research.items.find(item => item.item_id === "CAPEX-01-015");
  if (grillPriceOne) { grillPriceOne.risk_reason = "Для газового гриля с полусферическими ячейками под колобки не найден надёжный активный российский ценовой источник."; grillPriceOne.notes = "Нужны технический подбор, способ газоснабжения, проверка сертификации и коммерческое предложение."; }
  if (grillPriceTwo) { grillPriceTwo.risk_reason = "Активная российская карточка профессионального гриля для Манчеса с подтверждённой ценой не найдена."; grillPriceTwo.notes = "Нужно коммерческое предложение на точную конструкцию и количество единиц."; }
  if (!grinderPrice?.scenarios.base || !grinderPrice.scenarios.scale_ready) throw new Error("Grinder price scenarios are missing.");
  grinderPrice.scenarios.base.quantity = 1;
  grinderPrice.scenarios.base.quantity_basis = "research_assumption";
  grinderPrice.scenarios.base.line_total_rub = grinderPrice.scenarios.base.observed_unit_price_rub;
  grinderPrice.scenarios.scale_ready.quantity = 1;
  grinderPrice.scenarios.scale_ready.quantity_basis = "research_assumption";
  grinderPrice.scenarios.scale_ready.line_total_rub = grinderPrice.scenarios.scale_ready.observed_unit_price_rub;
  grinderPrice.risk_reason = "Количество зафиксировано как одна единица; точную модель и производительность нужно подтвердить по техкартам и объёму мясной заготовки.";
  grinderPrice.notes = "MINIMUM не включает мясорубку; BASE и SCALE_READY включают по одной профессиональной мясорубке.";
  const additions = newResearchItems();
  research.items.push(...additions);
  research.items.sort((a, b) => a.item_id.localeCompare(b.item_id));
  research.summary = recalculatePriceSummary(research.items);
  for (const item of additions) applyNewPrice(register, item);
  register.document.priced_record_count = research.summary.priced_record_count;
  register.document.unpriced_procurement_record_count = research.summary.unpriced_record_count;

  const modular = structuredClone(currentModular) as ModularSources;
  for (const doc of [modular.modules.document, modular.module_items.document, modular.configurations.document]) {
    doc.decision_id = PILOT_DECISION_ID;
    doc.iteration_id = PILOT_ITERATION_ID;
    doc.proposal_id = PILOT_PROPOSAL_ID;
  }
  const washModule = modular.modules.modules.find(module => module.module_id === "MOD-WASH");
  if (!washModule) throw new Error("MOD-WASH is missing.");
  washModule.lifecycle_status = "research";
  washModule.purpose = "Единая профессиональная посудомоечная зона для заготовочного цеха, совмещённого объекта или точки с собственной посадкой.";
  washModule.notes = "Одна система учитывается один раз при совмещении модулей; инженерные подключения зависят от помещения.";

  const linkById = new Map(modular.module_items.links.map(link => [link.item_id, link]));
  const grinderLink = linkById.get("CAPEX-01-015");
  if (!grinderLink) throw new Error("Missing module link for CAPEX-01-015.");
  grinderLink.default_requirement = "required";
  grinderLink.quantity_rule_type = "fixed";
  grinderLink.quantity_rule_value = 1;
  grinderLink.minimum_quantity = 1;
  grinderLink.aggregation_rule = "once";
  grinderLink.condition = null;
  grinderLink.notes = "Одна профессиональная мясорубка в BASE и SCALE_READY по DEC-011.";
  for (const definition of bundleDefinitions) {
    modular.module_items.links.push(fixedLink(definition.functionalModule, definition.parentId));
    for (const line of definition.lines) {
      const link = linkById.get(line.id);
      if (!link) throw new Error(`Missing module link for ${line.id}.`);
      link.default_requirement = "required";
      link.quantity_rule_type = "fixed";
      link.quantity_rule_value = line.quantity;
      link.minimum_quantity = line.quantity;
      link.aggregation_rule = "once";
      link.notes = `Компонент ${definition.parentId}; отдельно не суммируется.`;
    }
  }
  for (const item of wash) modular.module_items.links.push(fixedLink("MOD-WASH", item.item_id, "required", item.quantity_base ?? 1));
  modular.configurations.configurations.push(pilotConfiguration());

  const { bom, totals } = pilotTotals(register, research, modular);
  const assumptions = pilotAssumptions(totals);
  const errors = [...validateRegister(register), ...validatePriceResearch(research, register), ...validateModularSources(register, modular)];
  if (errors.length) throw new Error(errors.join("\n"));
  if (register.equipment.length !== 160 || research.items.length !== 51 || research.summary.priced_record_count !== 43) throw new Error("Pilot state count invariant failed.");
  return { register, research, modular, bom, totals, assumptions };
}

function payload() {
  const state = finalState();
  return {
    schema_version: 1,
    iteration_id: PILOT_ITERATION_ID,
    proposal_id: PILOT_PROPOSAL_ID,
    decision_id: PILOT_DECISION_ID,
    status: "approved",
    approved_scope: "Зафиксировать research-базу пилотного совмещённого объекта с посадочным залом: одна посудомоечная система, комплекты мелкого инвентаря, программное обеспечение 120 000 ₽/год, food cost 25% с упаковкой, исследовательский штат и открытые зависимые от помещения и запуска слои бюджета.",
    boundaries: {
      approved: ["pilot format FMT-INTEGRATED with MOD-GUEST, MOD-BAR and MOD-STAFF", "one deduplicated professional dishwashing system", "three bottom-up small-inventory research bundles", "software assumption 120000 RUB/year as OPEX", "target recipe cost 25 percent including packaging", "Saint Petersburg labor benchmark as research", "minimum scenario unavailable in selector"],
      not_approved: ["actual premises or final city", "cold-room sizes or final engineering design", "fit-out, furniture, navigation, delivery, installation and commissioning totals", "pre-opening, initial stock, working capital or contingency values", "final suppliers, staffing schedule, CAPEX or financial model"],
    },
    equipment_register: state.register,
    price_research: state.research,
    modules: state.modular.modules,
    module_items: state.modular.module_items,
    configurations: state.modular.configurations,
    pilot_bom: state.bom,
    pilot_assumptions: state.assumptions,
    pilot_equipment_totals_rub: state.totals,
    equipment_csv_sha256: sha256(equipmentCsv(state.register)),
    pilot_bom_csv_sha256: sha256(equipmentBomCsv(state.bom)),
  };
}

function decisionChange() {
  const sources = [
    { id: PILOT_SOURCE_ID, title: "Задание на CAPEX и операционную базу пилотного объекта", type: "instruction", location: `User instruction, ${PILOT_DATE}`, publisher: "project owner", publication_date: PILOT_DATE, accessed_at: PILOT_DATE, reliability: "primary", notes: "Фиксирует формат пилота, одну посудомоечную систему, необходимость полного мелкого инвентаря, ПО 120 000 ₽/год, target food cost 25% с упаковкой и стартовые роли. Не утверждает помещение, финальный бюджет, поставщиков или штатное расписание." },
    { id: "SRC-LABOR-SPB-20260803-PREP", title: "Вакансии поваров-заготовщиков в Санкт-Петербурге", type: "labor_market_listing", location: "https://spb.hh.ru/vacancies/povar-zagotovschik", publisher: "HeadHunter", publication_date: null, accessed_at: PILOT_DATE, reliability: "medium", notes: "Исследовательский ориентир ставок; видимые предложения включают примерно 4 600–7 000 ₽ за смену и 95 000–124 000 ₽ в месяц. Не является статистической средней или утверждённой ставкой." },
    { id: "SRC-LABOR-SPB-20260803-BARISTA", title: "Вакансии бариста-кассиров в Санкт-Петербурге", type: "labor_market_listing", location: "https://spb.hh.ru/vacancies/barista-kassir", publisher: "HeadHunter", publication_date: null, accessed_at: PILOT_DATE, reliability: "medium", notes: "Исследовательский ориентир; видимые предложения включают около 60 000–90 000 ₽ в месяц и 4 200 ₽ за смену." },
    { id: "SRC-LABOR-SPB-20260803-ADMIN", title: "Вакансии администраторов ресторанов в Санкт-Петербурге", type: "labor_market_listing", location: "https://spb.hh.ru/vacancies/administratory_restorana", publisher: "HeadHunter", publication_date: null, accessed_at: PILOT_DATE, reliability: "medium", notes: "Исследовательский ориентир; видимые предложения для ресторанных менеджеров и администраторов преимущественно лежат около 75 000–140 000 ₽ в месяц." },
    { id: "SRC-TAX-2026-CONTRIBUTIONS", title: "Пониженные тарифы страховых взносов в 2026 году", type: "official_tax_guidance", location: "https://www.nalog.gov.ru/rn11/news/activities_fts/16601574/", publisher: "ФНС России", publication_date: "2026-02-09", accessed_at: PILOT_DATE, reliability: "high", notes: "ФНС указывает тариф 15% с выплат сверх 1,5 МРОТ для применимых категорий; право на льготу должно быть подтверждено по фактическому юридическому и налоговому статусу работодателя." },
    { id: "SRC-COLD-ROOM-BENCHMARK-20260803", title: "Холодильная камера Polair КХН-6,61", type: "supplier_product_card", location: "https://www.polair-shop.ru/catalog/holodylnye_kamery/polair_standart2/kxh-6.61/", publisher: "Polair", publication_date: null, accessed_at: PILOT_DATE, reliability: "high", notes: "Публичная цена оболочки 142 831 ₽; размеры 1960×1960×2200 мм и объём 6,61 м³. Используется только как benchmark, не как бюджет помещения." },
  ];
  return {
    change_id: PILOT_DECISION_CHANGE_ID,
    title: "Зафиксировать решение о research-базе пилотного объекта",
    status: "approved",
    created_at: PILOT_DATE,
    decision_id: "DEC-001",
    iteration_id: PILOT_ITERATION_ID,
    proposal_id: PILOT_PROPOSAL_ID,
    operations: [
      ...sources.map(value => ({ type: "add", entity: "sources", value })),
      { type: "add", entity: "documents", value: { id: PILOT_ASSUMPTIONS_DOCUMENT_ID, title: "Пилотный объект — CAPEX и операционные допущения", type: "working_pilot_capex_assumptions", status: "research", google_file_id: null, template: null, sections: ["Конфигурация пилота", "Оборудование", "Программное обеспечение", "Юнит-экономика", "Штат", "Помещение", "Открытые слои бюджета"], version: "0.1", local_path: PILOT_ASSUMPTIONS_PATH, updated_at: PILOT_DATE } },
      { type: "add", entity: "decisions", value: { id: PILOT_DECISION_ID, title: "Сформировать research-базу CAPEX и операционных допущений пилотного объекта", status: "approved", decision: "Зафиксировать пилот как совмещённый заготовочный цех и торговую точку с собственным посадочным залом; добавить одну дедуплицируемую посудомоечную систему и расчётные комплекты мелкого инвентаря; принять как research ПО 120 000 ₽/год, target food cost 25% с упаковкой и стартовые роли; сохранить все зависящие от помещения и запуска расходы открытыми.", rationale: "Прямое задание владельца проекта от 2026-08-03. Исследовательские цены и ставки используются только как ориентиры и не утверждают закупку, помещение, штатное расписание, полный CAPEX или финансовую модель.", affected_documents: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-CONFIGURATIONS", "DOC-CAPEX-GENERATED-EQUIPMENT-BOM", "DOC-CAPEX-PRICE-RESEARCH", PILOT_ASSUMPTIONS_DOCUMENT_ID], approved_by: "project owner", approved_at: PILOT_DATE, supersedes: null, source_ids: [PILOT_SOURCE_ID], updated_at: PILOT_DATE } },
    ],
  };
}

function mainChange(payloadHash: string, approved: ReturnType<typeof payload>) {
  const newPriceSources = priceSourceRegistryEntries(approved.price_research).filter(source => source.id.startsWith("SRC-PRICE-20260803-"));
  const assumptions = [
    { id: "ASM-PILOT-FORMAT", title: "Формат пилотного объекта", value: "Заготовочный цех + торговая точка + собственный посадочный зал", unit: null, status: "research", rationale: "Прямое задание владельца проекта; параметры помещения ещё не определены.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID, "DOC-CAPEX-CONFIGURATIONS"], source_ids: [PILOT_SOURCE_ID], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-SOFTWARE", title: "Бюджет программного обеспечения", value: 120000, unit: "RUB/year", status: "research", rationale: "Задано владельцем проекта; учитывается как OPEX, а при годовой предоплате — как отдельный денежный отток запуска.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID], source_ids: [PILOT_SOURCE_ID], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-FOOD-COST", title: "Целевая рецептурная себестоимость с упаковкой", value: 25, unit: "percent of revenue", status: "research", rationale: "Цена равна четырём рецептурным себестоимостям; это формальная наценка 300% и валовая маржа 75% до прочих затрат.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID], source_ids: [PILOT_SOURCE_ID], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-STAFFING", title: "Стартовые посты пилотного объекта", value: { prep_cook: 1, line_cook: 2, barista_cashier: 2, cleaner: 1, administrator: 1 }, unit: "posts per operating shift", status: "research", rationale: "Прямой ориентир владельца проекта; headcount и графики требуют операционного режима и часов работы.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID], source_ids: [PILOT_SOURCE_ID], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-PAYROLL-SPB", title: "Исследовательский фонд работодателя для стартовых постов", value: { from_rub_per_month: 1290051.62, to_rub_per_month: 1368735.63 }, unit: "RUB/month", status: "research", rationale: "Расчёт по видимым вакансиям Санкт-Петербурга, 30 операционным дням, графику 2/2, НДФЛ 13% и диапазону страховых взносов. Не включает ряд кадровых расходов.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID], source_ids: ["SRC-LABOR-SPB-20260803-PREP", "SRC-LABOR-SPB-20260803-BARISTA", "SRC-LABOR-SPB-20260803-ADMIN", "SRC-TAX-2026-CONTRIBUTIONS"], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-PREMISES-OPEN", title: "Зависимые от помещения слои CAPEX", value: null, unit: null, status: "research", rationale: "Камеры, вентиляция, газ, вода, канализация, электричество, ремонт, монтаж, пусконаладка, мебель и навигация считаются после выбора и обследования помещения.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID, "DOC-CAPEX-EQUIPMENT-REGISTER"], source_ids: [PILOT_SOURCE_ID, "SRC-COLD-ROOM-BENCHMARK-20260803"], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
    { id: "ASM-PILOT-LAUNCH-COSTS-OPEN", title: "Открытые расходы запуска", value: null, unit: null, status: "research", rationale: "Расходы перед открытием, первоначальные запасы, оборотный капитал и резерв пока не оценены и не считаются нулём.", scenario: "PILOT_BASE", applies_to: [PILOT_ASSUMPTIONS_DOCUMENT_ID], source_ids: [PILOT_SOURCE_ID], decision_id: PILOT_DECISION_ID, updated_at: PILOT_DATE },
  ];
  return {
    change_id: PILOT_CHANGE_ID,
    title: "Применить research-базу CAPEX и операционных допущений пилота",
    status: "approved",
    created_at: PILOT_DATE,
    decision_id: PILOT_DECISION_ID,
    iteration_id: PILOT_ITERATION_ID,
    proposal_id: PILOT_PROPOSAL_ID,
    approved_payload_path: PILOT_PAYLOAD_PATH,
    approved_payload_sha256: payloadHash,
    operations: [
      ...newPriceSources.map(value => ({ type: "add", entity: "sources", value })),
      ...assumptions.map(value => ({ type: "add", entity: "assumptions", value })),
      { type: "update", entity: "documents", id: "DOC-CAPEX-EQUIPMENT-REGISTER", value: { updated_at: PILOT_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-MODULES", value: { updated_at: PILOT_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-CONFIGURATIONS", value: { sections: ["CFG-TEMPLATE-001", PILOT_CONFIGURATION_ID, "Configuration overrides"], updated_at: PILOT_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-GENERATED-EQUIPMENT-BOM", value: { local_path: `docs-platform/working/configurations/${PILOT_CONFIGURATION_ID}/equipment-bom.yaml`, updated_at: PILOT_DATE } },
      { type: "update", entity: "documents", id: "DOC-CAPEX-PRICE-RESEARCH", value: { version: "0.3", updated_at: PILOT_DATE } },
    ],
  };
}

export function writePilotArtifacts() {
  const approved = payload();
  const serialized = YAML.stringify(approved, { lineWidth: 0 });
  const payloadHash = sha256(serialized);
  writeOnce(payloadFile, serialized);
  writeOnce(proposalFile, YAML.stringify({ proposal_id: PILOT_PROPOSAL_ID, iteration_id: PILOT_ITERATION_ID, status: "proposed", created_at: PILOT_DATE, actor: "project owner", source_id: PILOT_SOURCE_ID, scope: approved.approved_scope, affected_document_ids: ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-CONFIGURATIONS", "DOC-CAPEX-GENERATED-EQUIPMENT-BOM", "DOC-CAPEX-PRICE-RESEARCH", PILOT_ASSUMPTIONS_DOCUMENT_ID], affected_item_ids: ["CAPEX-01-048", "CAPEX-02-001", "CAPEX-02-002", "CAPEX-02-056", "CAPEX-02-057", "CAPEX-08-001", "CAPEX-08-002", "CAPEX-08-003", "CAPEX-08-004", "CAPEX-08-005", "CAPEX-08-006", PILOT_CONFIGURATION_ID], approved_payload_path: PILOT_PAYLOAD_PATH, approved_payload_sha256: payloadHash, source_path: `User instruction, ${PILOT_DATE}`, source_sha256: null, boundaries: approved.boundaries, apply_contract: { payload_identity: "structurally_identical_yaml", hash_algorithm: "SHA-256", google_target: "existing registered Sheet only", rollback_mode: "governed_reverse_change_set" } }, { lineWidth: 0 }));
  writeOnce(decisionChangeFile, YAML.stringify(decisionChange(), { lineWidth: 0 }));
  writeOnce(mainChangeFile, YAML.stringify(mainChange(payloadHash, approved), { lineWidth: 0 }));
  writeOnce(iterationFile, YAML.stringify({ schema_version: 1, iteration_id: PILOT_ITERATION_ID, proposal_id: PILOT_PROPOSAL_ID, decision_id: PILOT_DECISION_ID, change_set_id: PILOT_CHANGE_ID, status: "approved", approved_by: "project owner", approved_at: PILOT_DATE, actor: "project owner", scope: approved.approved_scope, approved_payload_path: PILOT_PAYLOAD_PATH, approved_payload_sha256: payloadHash, apply_contract: { payload_identity: "structurally_identical_yaml", canonical_targets: ["docs-platform/working/capex-equipment-register.yaml", "docs-platform/working/capex-equipment-register.csv", "docs-platform/working/capex-price-research.yaml", "docs-platform/working/capex-modules.yaml", "docs-platform/working/capex-module-items.yaml", "docs-platform/working/capex-configurations.yaml", PILOT_ASSUMPTIONS_PATH, `docs-platform/working/configurations/${PILOT_CONFIGURATION_ID}/equipment-bom.yaml`, `docs-platform/working/configurations/${PILOT_CONFIGURATION_ID}/equipment-bom.csv`] }, rollback_contract: { mode: "governed_reverse_change_set", preserves_history: true, git_reset_forbidden: true } }, { lineWidth: 0 }));
  const result = { iteration_id: PILOT_ITERATION_ID, proposal_id: PILOT_PROPOSAL_ID, decision_id: PILOT_DECISION_ID, change_set_id: PILOT_CHANGE_ID, approved_payload_path: PILOT_PAYLOAD_PATH, approved_payload_sha256: payloadHash, pilot_equipment_totals_rub: approved.pilot_equipment_totals_rub };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function loadPayload() {
  if (!fs.existsSync(payloadFile)) throw new Error("Approved pilot payload is missing.");
  const serialized = fs.readFileSync(payloadFile, "utf8");
  const approved = YAML.parse(serialized) as ReturnType<typeof payload>;
  const manifest = YAML.parse(fs.readFileSync(iterationFile, "utf8"));
  const hash = sha256(serialized);
  if (approved.iteration_id !== PILOT_ITERATION_ID || approved.decision_id !== PILOT_DECISION_ID || approved.status !== "approved") throw new Error("Invalid approved pilot payload metadata.");
  if (manifest.approved_payload_sha256 !== hash || manifest.status !== "approved") throw new Error("Iteration manifest differs from the approved pilot payload.");
  return { approved, hash };
}

function targets(approved: ReturnType<typeof payload>): Target[] {
  return [
    { path: "docs-platform/working/capex-equipment-register.yaml", content: serializeRegister(approved.equipment_register) },
    { path: "docs-platform/working/capex-equipment-register.csv", content: equipmentCsv(approved.equipment_register) },
    { path: "docs-platform/working/capex-price-research.yaml", content: serializePriceResearch(approved.price_research) },
    { path: "docs-platform/working/capex-modules.yaml", content: YAML.stringify(approved.modules, { lineWidth: 0 }) },
    { path: "docs-platform/working/capex-module-items.yaml", content: YAML.stringify(approved.module_items, { lineWidth: 0 }) },
    { path: "docs-platform/working/capex-configurations.yaml", content: YAML.stringify(approved.configurations, { lineWidth: 0 }) },
    { path: PILOT_ASSUMPTIONS_PATH, content: YAML.stringify(approved.pilot_assumptions, { lineWidth: 0 }) },
    { path: `docs-platform/working/configurations/${PILOT_CONFIGURATION_ID}/equipment-bom.yaml`, content: YAML.stringify(approved.pilot_bom, { lineWidth: 0 }) },
    { path: `docs-platform/working/configurations/${PILOT_CONFIGURATION_ID}/equipment-bom.csv`, content: equipmentBomCsv(approved.pilot_bom) },
  ];
}

function computePreview() {
  const { approved, hash } = loadPayload();
  const current = readRegister();
  const currentResearch = readPriceResearch();
  if (current.document.decision_id !== "DEC-010" || current.equipment.length !== 151 || currentResearch.items.length !== 47) throw new Error("Expected the pre-pilot DEC-010 canonical state.");
  const targetFiles = targets(approved);
  const before = targetFiles.map(target => ({ path: target.path, hash: fileHash(absolute(target.path)) }));
  const after = targetFiles.map(target => ({ path: target.path, hash: sha256(target.content) }));
  return { iteration_id: PILOT_ITERATION_ID, proposal_id: PILOT_PROPOSAL_ID, decision_id: PILOT_DECISION_ID, change_set_id: PILOT_CHANGE_ID, approved_payload: { path: PILOT_PAYLOAD_PATH, sha256: hash }, before_composite_hash: composite(before), after_composite_hash: composite(after), files: after.map((entry, index) => ({ path: entry.path, before_sha256: before[index].hash, after_sha256: entry.hash })), counts_before: { equipment: current.equipment.length, price_scope: currentResearch.items.length }, counts_after: { equipment: approved.equipment_register.equipment.length, price_scope: approved.price_research.items.length }, pilot_equipment_totals_rub: approved.pilot_equipment_totals_rub, validation: "passed" as const, writes: false, targets: targetFiles };
}

export function previewPilotIteration() {
  const preview = computePreview();
  const { targets: _targets, ...safe } = preview;
  writeSecretJson(runtimePreviewFile, safe);
  console.log(JSON.stringify(safe, null, 2));
  return preview;
}

export function applyPilotIteration(options: { apply: boolean; decisionId: string }) {
  if (!options.apply || options.decisionId !== PILOT_DECISION_ID) throw new Error(`Apply requires --apply --decision ${PILOT_DECISION_ID}.`);
  const registry = loadRegistry();
  if (!registry.decisions.some(item => item.id === PILOT_DECISION_ID && item.status === "approved")) throw new Error(`${PILOT_DECISION_ID} is not approved in registry.`);
  if (!fs.existsSync(runtimePreviewFile)) throw new Error("Pilot preview is missing.");
  if (fs.existsSync(receiptFile) || fs.existsSync(rollbackRoot)) throw new Error("Pilot iteration was already applied.");
  const saved = JSON.parse(fs.readFileSync(runtimePreviewFile, "utf8"));
  const preview = computePreview();
  if (saved.approved_payload.sha256 !== preview.approved_payload.sha256 || saved.before_composite_hash !== preview.before_composite_hash || saved.after_composite_hash !== preview.after_composite_hash) throw new Error("Approved pilot payload or target state changed after preview.");
  fs.mkdirSync(rollbackRoot, { recursive: true });
  const beforeFiles: BeforeFile[] = preview.targets.map(target => {
    const file = absolute(target.path);
    const existed = fs.existsSync(file);
    const rollbackFile = path.join(rollbackRoot, target.path.replace(/^docs-platform\//, ""));
    if (existed) atomicWrite(rollbackFile, fs.readFileSync(file, "utf8"));
    return { path: target.path, existed, sha256: fileHash(file), rollback_payload_path: existed ? relative(rollbackFile) : null };
  });
  try {
    for (const target of preview.targets) atomicWrite(absolute(target.path), target.content);
    const register = readRegister();
    const research = readPriceResearch();
    const modular = readModularSources();
    const errors = [...validateRegister(register), ...validatePriceResearch(research, register), ...validateModularSources(register, modular)];
    if (errors.length) throw new Error(errors.join("\n"));
    if (fs.readFileSync(absolute("docs-platform/working/capex-equipment-register.csv"), "utf8") !== equipmentCsv(register)) throw new Error("CSV differs from the pilot YAML register.");
  } catch (error) {
    for (const before of beforeFiles) if (before.existed && before.rollback_payload_path) atomicWrite(absolute(before.path), fs.readFileSync(absolute(before.rollback_payload_path), "utf8"));
    for (const before of beforeFiles) if (!before.existed && fs.existsSync(absolute(before.path))) fs.rmSync(absolute(before.path));
    fs.rmSync(rollbackRoot, { recursive: true, force: true });
    throw error;
  }
  const afterFiles = preview.targets.map(target => ({ path: target.path, sha256: fileHash(absolute(target.path)) }));
  const receipt = { receipt_version: 1, iteration_id: PILOT_ITERATION_ID, proposal_id: PILOT_PROPOSAL_ID, decision_id: PILOT_DECISION_ID, change_set_id: PILOT_CHANGE_ID, status: "applied", applied_at: new Date().toISOString(), actor: "Codex", tool: "docs-platform capex:pilot:apply", approved_payload: preview.approved_payload, before_composite_hash: preview.before_composite_hash, after_composite_hash: preview.after_composite_hash, before_files: beforeFiles, after_files: afterFiles, pilot_equipment_totals_rub: preview.pilot_equipment_totals_rub, validation_result: "passed", git_commit_hash: null, rollback: { mode: "governed_reverse_change_set", source_receipt: PILOT_RECEIPT_PATH, preview_command: `npm run capex:pilot:reverse:preview -- ../changelog/iteration-receipts/${PILOT_ITERATION_ID}.yaml --change-id CHG-ROLLBACK-XXX --decision DEC-ROLLBACK-XXX`, preserves_history: true, git_reset_forbidden: true } };
  writeYaml(receiptFile, receipt);
  console.log(JSON.stringify(receipt, null, 2));
  return receipt;
}

export function previewPilotReverse(receiptPath = receiptFile, changeId = "CHG-ROLLBACK-XXX", decisionId = "DEC-ROLLBACK-XXX") {
  const receipt = YAML.parse(fs.readFileSync(path.resolve(receiptPath), "utf8"));
  if (receipt.iteration_id !== PILOT_ITERATION_ID) throw new Error("Invalid pilot iteration receipt.");
  const current = receipt.after_files.map((entry: { path: string }) => ({ path: entry.path, hash: fileHash(absolute(entry.path)) }));
  const restored = receipt.before_files.map((entry: BeforeFile) => ({ path: entry.path, hash: entry.sha256 }));
  const result = { reverse_change_set: { change_id: changeId, title: `Откат ${PILOT_CHANGE_ID} через governed reverse change set`, status: "proposed", created_at: new Date().toISOString().slice(0, 10), decision_id: decisionId, iteration_id: `${PILOT_ITERATION_ID}-ROLLBACK`, proposal_id: `PROP-${changeId}`, rollback_of: PILOT_CHANGE_ID, source_receipt: relative(path.resolve(receiptPath)), expected_current_hash: receipt.after_composite_hash, expected_restored_hash: receipt.before_composite_hash, operations: [...receipt.before_files].reverse().map((entry: BeforeFile) => ({ type: entry.existed ? "restore_file" : "remove_generated_file", path: entry.path, source: entry.rollback_payload_path, expected_sha256: entry.sha256 })) }, current_hash: composite(current), expected_current_hash: receipt.after_composite_hash, simulated_restored_hash: composite(restored), expected_restored_hash: receipt.before_composite_hash, restores_original_hash: composite(restored) === receipt.before_composite_hash, apply_allowed: false, instruction: "Create and approve a rollback decision, preview Google reversal separately, apply, validate and append rolled_back; historical events remain append-only." };
  console.log(YAML.stringify(result, { lineWidth: 0 }));
  return result;
}

export function appendPilotTimeline() {
  const existing = readTimelineEvents();
  if (existing.some(event => event.iteration_id === PILOT_ITERATION_ID)) throw new Error("Pilot timeline events already exist.");
  if (!fs.existsSync(receiptFile) || !fs.existsSync(absolute(PILOT_VERIFICATION_PATH)) || !fs.existsSync(absolute(PILOT_GOOGLE_RECEIPT_PATH))) throw new Error("Apply, verification and Google receipts must exist before timeline finalization.");
  const manifest = YAML.parse(fs.readFileSync(iterationFile, "utf8"));
  const receipt = YAML.parse(fs.readFileSync(receiptFile, "utf8"));
  const google = YAML.parse(fs.readFileSync(absolute(PILOT_GOOGLE_RECEIPT_PATH), "utf8"));
  const start = Math.max(Date.now(), Date.parse(existing.at(-1)?.timestamp ?? "1970-01-01T00:00:00.000Z") + 1);
  const statuses: Array<{ status: IterationStatus; action: string; actor: string; tool: string; validation: "pending" | "passed"; summary: string }> = [
    { status: "proposed", action: "proposal_recorded", actor: "project owner", tool: "user instruction / governed workflow", validation: "pending", summary: "Proposal зафиксировал пилотный формат, посудомоечную систему, мелкий инвентарь, ПО, food cost, штат и открытые бюджетные слои." },
    { status: "approved", action: "decision_approved", actor: "project owner", tool: `approved decision ${PILOT_DECISION_ID}`, validation: "pending", summary: "DEC-011 утвердил exact research-payload без утверждения помещения, полного CAPEX, поставщиков или финансовой модели." },
    { status: "applied", action: "pilot_baseline_register_sheet_and_web_applied", actor: "Codex", tool: "capex:pilot:apply / change:apply / capex:sheet:apply / capex:web:sync", validation: "passed", summary: "Добавлены CAPEX-08, комплекты инвентаря, CFG-PILOT-001, операционные допущения, generated BOM и обновлён внутренний конфигуратор." },
    { status: "verified", action: "tests_build_google_readback_and_reverse_preview_verified", actor: "Codex", tool: "pilot CAPEX verification workflow", validation: "passed", summary: "Проверены 160 записей, 51 ценовая позиция, дедупликация одной посудомоечной системы, расчёты пилота, Google readback, build и governed reverse preview." },
  ];
  const affectedDocuments = ["DOC-CAPEX-EQUIPMENT-REGISTER", "DOC-CAPEX-MODULES", "DOC-CAPEX-CONFIGURATIONS", "DOC-CAPEX-GENERATED-EQUIPMENT-BOM", "DOC-CAPEX-PRICE-RESEARCH", PILOT_ASSUMPTIONS_DOCUMENT_ID];
  const events = statuses.map((entry, index) => {
    const input: TimelineEventInput = { event_id: `EVT-${PILOT_ITERATION_ID}-${String(index + 1).padStart(3, "0")}`, iteration_id: PILOT_ITERATION_ID, proposal_id: PILOT_PROPOSAL_ID, decision_id: PILOT_DECISION_ID, change_set_id: PILOT_CHANGE_ID, timestamp: new Date(start + index).toISOString(), actor: entry.actor, tool: entry.tool, lifecycle_status: entry.status, action: entry.action, scope: manifest.scope, affected_document_ids: affectedDocuments, affected_section_or_item_ids: [PILOT_CONFIGURATION_ID, "CAPEX-01-048", "CAPEX-02-056", "CAPEX-02-057", "CAPEX-08-001", "MOD-WASH", "/capex-configurator"], approved_payload: { path: PILOT_PAYLOAD_PATH, sha256: manifest.approved_payload_sha256 }, before_hash: index === 0 ? null : receipt.before_composite_hash, after_hash: index === 0 ? null : receipt.after_composite_hash, google_file_id: index >= 2 ? google.google_file_id : null, google_sync_receipt: index >= 2 ? PILOT_GOOGLE_RECEIPT_PATH : null, verification_receipt: index === 3 ? PILOT_VERIFICATION_PATH : null, validation_result: entry.validation, git_commit_hash: null, rollback_reference: PILOT_RECEIPT_PATH, summary: entry.summary };
    return appendTimelineEvent(input);
  });
  generateTimeline();
  console.log(JSON.stringify(events, null, 2));
  return events;
}
