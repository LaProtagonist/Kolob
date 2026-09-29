import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { equipmentCsv, serializeRegister, type CapexRegister, type EquipmentRecord } from "./register.js";

export const CAPEX_PRICE_ITERATION_ID = "ITR-CAPEX-PRICE-RESEARCH-2026-08-02-01";
export const CAPEX_PRICE_PROPOSAL_ID = "PROP-CAPEX-PRICE-RESEARCH-2026-08-02-01";
export const CAPEX_PRICE_DECISION_ID = "DEC-009";
export const CAPEX_PRICE_DECISION_CHANGE_ID = "CHG-015";
export const CAPEX_PRICE_CHANGE_ID = "CHG-016";
export const CAPEX_PRICE_DOCUMENT_ID = "DOC-CAPEX-PRICE-RESEARCH";
export const CAPEX_PRICE_BRIEF_SOURCE_ID = "SRC-CAPEX-PRICE-RESEARCH-BRIEF";
export const CAPEX_PRICE_RESEARCH_PATH = "docs-platform/working/capex-price-research.yaml";
export const CAPEX_PRICE_APPROVED_PAYLOAD_PATH = `docs-platform/changelog/payloads/${CAPEX_PRICE_ITERATION_ID}-approved.yaml`;
export const CAPEX_PRICE_CHECKED_AT = "2026-08-01T22:19:05.000Z";
export const CAPEX_PRICE_DATE = "2026-08-02";

export const PRICE_SCENARIOS = ["minimum", "base", "scale_ready"] as const;
export const CURRENT_PRICE_SCOPE_COUNT = 51;
export type PriceScenario = typeof PRICE_SCENARIOS[number];
export type PriceConfidence = "high" | "medium" | "low";
export type PriceQuoteStatus = "researched" | "quote_required" | "included_in_parent" | "tbd" | "not_requested";

export type PriceQuote = {
  source_id: string;
  source_type?: "supplier_product_card" | "owner_approved_research_estimate";
  source_location?: string;
  supplier_name: string;
  product_name: string;
  source_url: string | null;
  additional_urls: string[];
  observed_unit_price_rub: number;
  availability_status: string;
  checked_at: string;
  price_includes_vat: boolean | null;
  delivery_included: boolean | null;
  confidence: PriceConfidence;
  notes: string;
};

export type PriceScenarioValue = PriceQuote & {
  quantity: number;
  quantity_basis: "register" | "research_assumption" | "conditional_excluded";
  line_total_rub: number;
};

export type PriceResearchItem = {
  item_id: string;
  module_id: "MOD-PREP" | "MOD-RETAIL-HOT" | "MOD-BAR" | "MOD-GROW" | "MOD-POS" | "MOD-KDS" | "MOD-WASH" | "MOD-GUEST";
  valuation_status: "priced" | "quote_required";
  quote_status: "researched" | "quote_required";
  high_risk: boolean;
  risk_reason: string | null;
  scenarios: Record<PriceScenario, PriceScenarioValue | null>;
  notes: string;
};

export type CapexPriceResearch = {
  schema_version: 1;
  document: {
    project: "Колобочная";
    document_id: typeof CAPEX_PRICE_DOCUMENT_ID;
    title: "CAPEX Preliminary Price Research";
    russian_title: "CAPEX — Первичная ценовая оценка пищевого оснащения";
    version: string;
    status: "research";
    decision_id: string;
    iteration_id: string;
    proposal_id: string;
    checked_at: string;
    currency: "RUB";
    source_register_path: "docs-platform/working/capex-equipment-register.yaml";
    source_register_before_sha256: string;
    warning: string;
  };
  business_capacity: {
    prep_outlet_count: 5;
    checks_per_outlet_per_day: 100;
    total_checks_per_day: 500;
    scale_boundary: string;
  };
  scope: {
    included_modules: string[];
    excluded_modules_and_categories: string[];
    eligible_procurement_record_count: number;
  };
  items: PriceResearchItem[];
  summary: PriceResearchSummary;
};

export type PriceResearchSummary = {
  eligible_procurement_record_count: number;
  priced_record_count: number;
  unpriced_record_count: number;
  quote_required_count: number;
  totals_rub: Record<PriceScenario, number>;
  module_totals_rub: Record<string, Record<PriceScenario, number>>;
  top_10_base: Array<{ item_id: string; module_id: string; line_total_rub: number }>;
  high_risk_item_ids: string[];
};

type QuoteInput = Omit<PriceQuote, "source_id" | "checked_at" | "additional_urls" | "price_includes_vat" | "delivery_included"> & {
  source_id: string;
  additional_urls?: string[];
  price_includes_vat?: boolean | null;
  delivery_included?: boolean | null;
};

type PricedDefinition = {
  item_id: string;
  module_id: PriceResearchItem["module_id"];
  quotes: Record<PriceScenario, PriceQuote>;
  quantities: Record<PriceScenario, number>;
  quantity_basis?: Partial<Record<PriceScenario, PriceScenarioValue["quantity_basis"]>>;
  quote_status?: PriceResearchItem["quote_status"];
  high_risk?: boolean;
  risk_reason?: string;
  notes: string;
};

type UnpricedDefinition = {
  item_id: string;
  module_id: PriceResearchItem["module_id"];
  risk_reason: string;
  notes: string;
};

function quote(input: QuoteInput): PriceQuote {
  return {
    ...input,
    additional_urls: input.additional_urls ?? [],
    checked_at: CAPEX_PRICE_CHECKED_AT,
    price_includes_vat: input.price_includes_vat ?? null,
    delivery_included: input.delivery_included ?? null,
  };
}

function family(slug: string, inputs: Array<Omit<QuoteInput, "source_id">>): Record<PriceScenario, PriceQuote> {
  return Object.fromEntries(PRICE_SCENARIOS.map((scenario, index) => [scenario, quote({ ...inputs[index], source_id: `SRC-PRICE-20260802-${slug}-${scenario.toUpperCase().replace("_", "-")}` })])) as Record<PriceScenario, PriceQuote>;
}

const activeKlen = "active_catalog; stock_not_confirmed";

const TABLE_1500 = family("TABLE-1500", [
  { supplier_name: "КЛЕН", product_name: "Luxstahl СПС-15/6, 1500×600", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/stoly-proizvodstvennye-i-rabochie/stoly-razdelochnye/stol-proizvodstvennyi-luxstahl-sps-156/", observed_unit_price_rub: 23526, availability_status: activeKlen, confidence: "medium", notes: "Профессиональная пищевая нержавеющая столешница; глубина 600 мм меньше рабочего ориентира 800 мм." },
  { supplier_name: "КЛЕН", product_name: "Luxstahl СПС-15/7, 1500×700", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/stoly-proizvodstvennye-i-rabochie/stoly-razdelochnye/stol-proizvodstvennyi-luxstahl-sps-157/", observed_unit_price_rub: 25896, availability_status: activeKlen, confidence: "medium", notes: "Ближайшая публичная карточка к ориентиру 1400–1500×800 мм; окончательная глубина требует КП." },
  { supplier_name: "КЛЕН", product_name: "СДК 1500×800×870, нержавеющая столешница", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/tables-production-and-cutting/the-cutting-tables/stol-dlia-obrabotki-ovoshchei-i-korneplodov-sdk-1500kh800kh870/", observed_unit_price_rub: 39232, availability_status: activeKlen, confidence: "medium", notes: "Размер 1500×800 соответствует ориентиру, но окрашенный/оцинкованный каркас требует проверки против требования усиленной полностью профессиональной конструкции." },
]);

const TABLE_GENERAL = family("TABLE-GENERAL", [
  { supplier_name: "КЛЕН", product_name: "Luxstahl СПС-10/6, 1000×600", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/stoly-proizvodstvennye-i-rabochie/stoly-razdelochnye/stol-proizvodstvennyi-luxstahl-sps-106/", observed_unit_price_rub: 17941, availability_status: activeKlen, confidence: "medium", notes: "Ориентир для компактного профессионального стола." },
  { supplier_name: "КЛЕН", product_name: "Luxstahl СПС-12/6, 1200×600", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/stoly-proizvodstvennye-i-rabochie/stoly-razdelochnye/stol-proizvodstvennyi-luxstahl-sps-126/", observed_unit_price_rub: 20320, availability_status: activeKlen, confidence: "medium", notes: "Ориентир для базового профессионального стола." },
  { supplier_name: "КЛЕН", product_name: "Luxstahl СПС-15/7, 1500×700", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/stoly-proizvodstvennye-i-rabochie/stoly-razdelochnye/stol-proizvodstvennyi-luxstahl-sps-157/", observed_unit_price_rub: 25896, availability_status: activeKlen, confidence: "medium", notes: "Ориентир увеличенной рабочей поверхности." },
]);

const PRICE_FAMILIES: Record<string, Record<PriceScenario, PriceQuote>> = {
  waste_table: family("WASTE-TABLE", [
    { supplier_name: "КЛЕН", product_name: "Luxstahl СО-6/6", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/tables-production-and-cutting/tables-for-waste-collection/stol-universalnyi-s-otverstiem-dlia-otkhodov-luxstahl-so-66-obviazka-trekhstoronniaia/", observed_unit_price_rub: 17011, availability_status: activeKlen, confidence: "medium", notes: "Стол с отверстием; сменная ёмкость и санитарная конфигурация требуют проверки." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl СО-12/7", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/tables-production-and-cutting/tables-for-waste-collection/stol-universalnyi-s-otverstiem-dlia-otkhodov-luxstahl-so-127-obviazka-trekhstoronniaia/", observed_unit_price_rub: 24187, availability_status: activeKlen, confidence: "medium", notes: "Базовый ориентир стола с отверстием." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl СО-15/7", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/tables-production-and-cutting/tables-for-waste-collection/stol-universalnyi-s-otverstiem-dlia-otkhodov-luxstahl-so-157-obviazka-trekhstoronniaia/", observed_unit_price_rub: 26887, availability_status: activeKlen, confidence: "medium", notes: "Увеличенный профессиональный стол с отверстием." },
  ]),
  wall_shelf: family("WALL-SHELF", [
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПНК6/4", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/wall-shelves/shelves-solid/polka-nastennaia-sploshnaia-luxstahl-pnk64/", observed_unit_price_rub: 3131, availability_status: activeKlen, confidence: "high", notes: "Цена за одну настенную полку." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПНК12/4", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/wall-shelves/shelves-solid/polka-nastennaia-sploshnaia-luxstahl-pnk124/", observed_unit_price_rub: 4920, availability_status: activeKlen, confidence: "high", notes: "Цена за одну настенную полку." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПНК15/4", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/wall-shelves/shelves-solid/polka-nastennaia-sploshnaia-luxstahl-pnk154/", observed_unit_price_rub: 5620, availability_status: activeKlen, confidence: "high", notes: "Цена за одну настенную полку." },
  ]),
  rack: family("RACK", [
    { supplier_name: "КЛЕН", product_name: "HICOLD НСК-6/3", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-with-solid-shelves/stellazh-nerzhaveiushchii-kukhonnyi-hicold-nsk-63-287543/", observed_unit_price_rub: 16921, availability_status: activeKlen, confidence: "high", notes: "Цена за один профессиональный нержавеющий стеллаж." },
    { supplier_name: "КЛЕН", product_name: "HICOLD НСК-11/6", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-with-solid-shelves/stellazh-nerzhaveiushchii-kukhonnyi-hicold-nsk-116-281473/", observed_unit_price_rub: 32451, availability_status: activeKlen, confidence: "high", notes: "Цена за один профессиональный нержавеющий стеллаж." },
    { supplier_name: "КЛЕН", product_name: "HICOLD НСК-12/7", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-with-solid-shelves/stellazh-nerzhaveiushchii-kukhonnyi-hicold-nsk-127-282488/", observed_unit_price_rub: 39683, availability_status: activeKlen, confidence: "high", notes: "Цена за один профессиональный нержавеющий стеллаж." },
  ]),
  drying_rack: family("DRYING-RACK", [
    { supplier_name: "КЛЕН", product_name: "Luxstahl СРСП 1800×600×300", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-for-drying-dishes/stellazh-dlia-posudy-luxstahl-srsp-1800600300/", observed_unit_price_rub: 21612, availability_status: activeKlen, confidence: "high", notes: "Профессиональный стеллаж для посуды." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl СРСП 1800×900×300", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-for-drying-dishes/stellazh-dlia-posudy-luxstahl-srsp-1800900300/", observed_unit_price_rub: 25727, availability_status: activeKlen, confidence: "high", notes: "Профессиональный стеллаж для посуды." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl СРСП 1800×1200×300", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/racks/racks-for-drying-dishes/stellazh-dlia-posudy-luxstahl-srsp-18001200300/", observed_unit_price_rub: 30911, availability_status: activeKlen, confidence: "high", notes: "Профессиональный стеллаж для посуды." },
  ]),
  waste_bin: family("WASTE-BIN", [
    { supplier_name: "КЛЕН", product_name: "Бак с крышкой 45 л", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/bins-trash-bags/tank-with-lid-for-food-black-45-l-460701681517431253613/", observed_unit_price_rub: 1157, availability_status: activeKlen, confidence: "high", notes: "Цена за один закрываемый контейнер." },
    { supplier_name: "КЛЕН", product_name: "Контейнер 90 л с крышкой на колёсах", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/bins-trash-bags/konteiner-90l-polipropilen-d425sm-h85sm-s-kryshkoi-na-kolesakh-dlia-pishchevykh-otkhodov-434272913/", observed_unit_price_rub: 3169, availability_status: activeKlen, confidence: "high", notes: "Цена за один закрываемый контейнер." },
    { supplier_name: "КЛЕН", product_name: "Контейнер для пищевых отходов 110 л на колёсах", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/bins-trash-bags/container-for-food-waste-on-wheels-500kh450kh800-rt9957/", observed_unit_price_rub: 3499, availability_status: activeKlen, confidence: "high", notes: "Цена за один закрываемый контейнер." },
  ]),
  combi: family("COMBI", [
    { supplier_name: "КЛЕН", product_name: "Apach AP6M COMPACT", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/ovens/parokonvektomat-apach-ap6m-compact/", observed_unit_price_rub: 300372, availability_status: "active_catalog; listed_in_stock", confidence: "high", notes: "6×GN1/1, пар/конвекция/комби, требуется подключение воды; цена за один аппарат." },
    { supplier_name: "КЛЕН", product_name: "Apach AP7QT", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/ovens/parokonvektomat-apach-ap7qt/", observed_unit_price_rub: 436564, availability_status: "active_catalog; listed_in_stock", confidence: "high", notes: "7 уровней, пар/комби, автомойка и термощуп; цена за один аппарат." },
    { supplier_name: "КЛЕН", product_name: "Tecnoeka MKF 1111 V TS", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/ovens/parokonvektomat-tecnoeka-mkf-1111-v-ts/", observed_unit_price_rub: 596030, availability_status: activeKlen, confidence: "high", notes: "11×GN1/1, профессиональный вариант с резервом; цена за один аппарат." },
  ]),
  sous_vide: family("SOUS-VIDE", [
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-SV40E", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/sous-vide/termostat-pogruzhnoi-hurakan-hkn-sv40e/", observed_unit_price_rub: 22643, availability_status: activeKlen, confidence: "high", notes: "Профессиональный погружной термостат; ванна учитывается отдельно." },
    { supplier_name: "КЛЕН", product_name: "TATRA TSV2", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/sous-vide/termostat-pogruzhnoi-tatra-tsv2/", observed_unit_price_rub: 60926, availability_status: activeKlen, confidence: "high", notes: "Профессиональный погружной термостат; ванна учитывается отдельно." },
    { supplier_name: "КЛЕН", product_name: "Apach ASV2 NEW", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/sous-vide/termostat-pogruzhnoi-apach-asv2-new-378949/", observed_unit_price_rub: 82753, availability_status: activeKlen, confidence: "high", notes: "Профессиональный погружной термостат; ванна учитывается отдельно." },
  ]),
  induction: family("INDUCTION", [
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПИ 2-700", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/plate/plate-induction/plita-induktsionnaia-luxstahl-pi-2-700/", observed_unit_price_rub: 83290, availability_status: activeKlen, confidence: "high", notes: "Профессиональная двухконфорочная индукционная плита." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПИ 2-94", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/plate/plate-induction/plita-induktsionnaia-pi-2-94/", observed_unit_price_rub: 84752, availability_status: activeKlen, confidence: "high", notes: "Профессиональная двухконфорочная индукционная плита." },
    { supplier_name: "КЛЕН", product_name: "Luxstahl ПИ 2-ПР", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/plate/plate-induction/plita-induktsionnaia-luxstahl-pi-2-pr/", observed_unit_price_rub: 107341, availability_status: activeKlen, confidence: "high", notes: "Профессиональная двухконфорочная индукционная плита с повышенным резервом." },
  ]),
  vacuum: family("VACUUM", [
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-VAC260E", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/packaging-equipment/upakovshchik-vakuumnyi-hurakan-hkn-vac260e/", observed_unit_price_rub: 42844, availability_status: activeKlen, confidence: "high", notes: "Камерный профессиональный вакууматор." },
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-VAC400E", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/packaging-equipment/upakovshchik-vakuumnyi-hurakan-hkn-vac400e/", observed_unit_price_rub: 69161, availability_status: activeKlen, confidence: "high", notes: "Камерный профессиональный вакууматор увеличенного формата." },
    { supplier_name: "КЛЕН", product_name: "Indokor IVP-430PT/2", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/packaging-equipment/apparat-upakovochnyi-vakuumnyi-indokor-ivp-430pt2-dve-planki/", observed_unit_price_rub: 111250, availability_status: activeKlen, confidence: "medium", notes: "Камерный аппарат с двумя планками; фактическую цену и доступность нужно подтвердить КП." },
  ]),
  robot: family("ROBOT", [
    { supplier_name: "Robot-Coupe Russia", product_name: "Robot-Coupe R402 + комплект дисков (ценовой ориентир комплекта)", source_url: "https://www.robotcoupe.ru/catalog/kuhonnye-processory/", additional_urls: ["https://www.robotcoupe.ru/catalog/diski/"], observed_unit_price_rub: 340273, availability_status: "active_catalog; completeness_not_confirmed", confidence: "low", notes: "Сумма процессора и опубликованного набора дисков; мясная текстура и комплектность требуют испытаний и КП." },
    { supplier_name: "Robot-Coupe Russia", product_name: "Robot-Coupe R502 + комплект дисков (ценовой ориентир комплекта)", source_url: "https://www.robotcoupe.ru/catalog/item/720/", additional_urls: ["https://www.robotcoupe.ru/catalog/diski/"], observed_unit_price_rub: 472582, availability_status: "active_catalog; listed_in_stock; completeness_not_confirmed", confidence: "low", notes: "Сумма процессора и опубликованного набора дисков; окончательная комплектация и работа с рубленым мясом требуют КП/теста." },
    { supplier_name: "Robot-Coupe Russia", product_name: "Robot-Coupe R752 + комплект дисков (ценовой ориентир комплекта)", source_url: "https://www.robotcoupe.ru/catalog/kuhonnye-processory/", additional_urls: ["https://www.robotcoupe.ru/catalog/diski/"], observed_unit_price_rub: 547547, availability_status: "active_catalog; completeness_not_confirmed", confidence: "low", notes: "Ценовой ориентир более производительного процессора и дисков; окончательная комплектация требует КП." },
  ]),
  grinder: family("GRINDER", [
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-12SC", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/grinder/miasorubka-hurakan-hkn-12sc/", observed_unit_price_rub: 14548, availability_status: activeKlen, confidence: "high", notes: "Профессиональная мясорубка; позиция условная." },
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-22SC", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/grinder/miasorubka-hurakan-hkn-22sc/", observed_unit_price_rub: 24253, availability_status: activeKlen, confidence: "high", notes: "Профессиональная мясорубка средней производительности; позиция условная." },
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-22SP", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/grinder/miasorubka-hurakan-hkn-22sp/", observed_unit_price_rub: 32505, availability_status: activeKlen, confidence: "high", notes: "Профессиональная мясорубка; включается только если процессор не закрывает требование." },
  ]),
  jar_blender: family("JAR-BLENDER", [
    { supplier_name: "КЛЕН", product_name: "Hamilton Beach HBB908R-CE", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/blenders/blender-hamilton-beach-hbb908r-ce/", observed_unit_price_rub: 23515, availability_status: activeKlen, confidence: "medium", notes: "Профессиональный барный блендер; объём чаши и режим колки льда сверить с требованием ≥2 л." },
    { supplier_name: "КЛЕН", product_name: "Hamilton Beach HBF510-CE", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/blenders/blender-dlia-produktov-hamilton-beach-hbf510-ce/", observed_unit_price_rub: 60116, availability_status: activeKlen, confidence: "medium", notes: "Профессиональный блендер; объём чаши сверить с требованием ≥2 л." },
    { supplier_name: "КЛЕН", product_name: "Hamilton Beach HBH650R-CE", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/blenders/blender-hamilton-beach-hbh650r-se/", observed_unit_price_rub: 105408, availability_status: activeKlen, confidence: "medium", notes: "Профессиональный высоконагруженный блендер; точную чашу и колку льда подтвердить." },
  ]),
  immersion_blender: family("IMMERSION-BLENDER", [
    { supplier_name: "КЛЕН", product_name: "Robot Coupe MicroMix", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/hand-mixers-homogenizers/mikser-robot-coupe-micromix-34900/", observed_unit_price_rub: 31212, availability_status: activeKlen, confidence: "medium", notes: "Профессиональная модель минимального уровня; производительность для заготовочного цеха проверить." },
    { supplier_name: "КЛЕН", product_name: "Robot Coupe CMP250 V.V.", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/hand-mixers-homogenizers/mikser-ruchnoi-robot-coupe-cmp250-vv-art34240b/", observed_unit_price_rub: 62832, availability_status: activeKlen, confidence: "high", notes: "Профессиональный погружной миксер со съёмной рабочей частью." },
    { supplier_name: "КЛЕН", product_name: "Robot Coupe MP350 Ultra TP", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/hand-mixers-homogenizers/mikser-ruchnoi-robot-coupe-mp350-ultra-tp-art-34590l/", observed_unit_price_rub: 76237, availability_status: activeKlen, confidence: "high", notes: "Профессиональная модель с резервом производительности." },
  ]),
  planetary: family("PLANETARY", [
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-KS10", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/planetary-mixers/mikser-planetarnyi-hurakan-hkn-ks10/", observed_unit_price_rub: 28965, availability_status: activeKlen, confidence: "high", notes: "Чаша 10 л, минимальный профессиональный уровень." },
    { supplier_name: "КЛЕН", product_name: "ROSSO B10S", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/planetary-mixers/mikser-planetarnyi-rosso-b10s/", observed_unit_price_rub: 44704, availability_status: activeKlen, confidence: "high", notes: "Профессиональный планетарный миксер 10 л." },
    { supplier_name: "КЛЕН", product_name: "Hurakan HKN-IP20F", source_url: "https://www.klenmarket.ru/shop/equipment/technological-equipment/planetary-mixers/mikser-planetarnyi-hurakan-hkn-ip20f/", observed_unit_price_rub: 52135, availability_status: activeKlen, confidence: "high", notes: "Профессиональный миксер 20 л с резервом производительности." },
  ]),
  double_sink: family("DOUBLE-SINK", [
    { supplier_name: "КЛЕН", product_name: "ВМС-П 2/520, 1200×700", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/vanny-moechnye/bath-two/vanna-dvukhsektsionnaia-vms-p-2520-1200x700x870-glubina-400mm-s-bortom-otverstie-pod-smesitel-po-tsentru/", observed_unit_price_rub: 43541, availability_status: activeKlen, confidence: "high", notes: "Профессиональная двухсекционная мойка." },
    { supplier_name: "КЛЕН", product_name: "ВМЦ 2/12755 нерж", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/vanny-moechnye/bath-two/vanna-moechnaia-vmts-212755-nerzh/", observed_unit_price_rub: 58798, availability_status: activeKlen, confidence: "high", notes: "Цельнотянутая двухсекционная мойка из нержавеющей стали." },
    { supplier_name: "КЛЕН", product_name: "СКМ-2 1000×600 с тумбой", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/vanny-moechnye/baths-with-work-surface/dvukhsektsionnaia-vanna-moechnaia-skm-2-s-tumboi-s-bortom-1000kh600kh870-2-moiki-tseln-vvarnye-400kh400kh250/", observed_unit_price_rub: 59366, availability_status: activeKlen, confidence: "high", notes: "Двухсекционная мойка с тумбой; увеличенный сценарий." },
  ]),
  hand_sink: family("HAND-SINK", [
    ...Array.from({ length: 3 }, () => ({ supplier_name: "КЛЕН", product_name: "Kamik настенный рукомойник из нержавеющей стали, смеситель в комплекте", source_url: "https://www.klenmarket.ru/shop/equipment/neutral-equipment/bath-wash/rukomoiniki/rukomoinik-kamik-iz-nerzhaveiushchei-stali-nastennyi-smesitel-v-komplekte-390kh390kh260-mm/", observed_unit_price_rub: 10943, availability_status: activeKlen, confidence: "high" as const, notes: "Один профессиональный рукомойник для персонала." })),
  ]),
  dispenser_set: family("DISPENSER-SET", [
    { supplier_name: "КЛЕН", product_name: "Комплект: 2 дозатора 500 мл + PUFF-5110", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dispenser-for-liquid-soap-500-ml/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dispenser-bumazhnykh-polotenets-puff-5110-belyi-abs-plastik/"], observed_unit_price_rub: 2892, availability_status: activeKlen, confidence: "medium", notes: "Расчётный комплект: два дозатора жидкости и один диспенсер полотенец; расходники не включены." },
    { supplier_name: "КЛЕН", product_name: "Комплект: 2 дозатора 1000 мл + PUFF-5135S", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dispenser-for-liquid-soap-1000-ml-rgs-3049a/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dispenser-bumazhnykh-polotenets-puff-5135s-khrom-abs-plastik/"], observed_unit_price_rub: 6615, availability_status: activeKlen, confidence: "medium", notes: "Расчётный комплект: два дозатора жидкости и один диспенсер полотенец; расходники не включены." },
    { supplier_name: "КЛЕН", product_name: "Комплект: 2 PUFF-8615 + PUFF-5615", source_url: "https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dozator-dlia-zhidkogo-myla-iz-nerzhaveiushchei-stali-puff-8615-polirovannyi-1000-ml/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/household-goods/oborudovanie-dlia-sanuzlov/dispenser-bumazhnykh-polotenets-puff-5615-khrom-mat-antivandalnyi-s-kliuchom/"], observed_unit_price_rub: 10618, availability_status: activeKlen, confidence: "medium", notes: "Расчётный комплект из нержавеющих/антивандальных дозаторов; расходники не включены." },
  ]),
  bench_scale: family("BENCH-SCALE", [
    { supplier_name: "КЛЕН", product_name: "CAS DB-II 150 E", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/scales-warehouse/scales-cas-db-ii-150-e/", observed_unit_price_rub: 19674, availability_status: activeKlen, confidence: "high", notes: "Профессиональные настольные/складские весы." },
    { supplier_name: "КЛЕН", product_name: "CAS DB-II 60 E", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/scales-warehouse/scales-cas-db-ii-60-e/", observed_unit_price_rub: 22533, availability_status: activeKlen, confidence: "high", notes: "Профессиональные производственные весы." },
    { supplier_name: "КЛЕН", product_name: "CAS DB-60H", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/scales-warehouse/scales-cas-db-1h-60/", observed_unit_price_rub: 25701, availability_status: activeKlen, confidence: "high", notes: "Профессиональные производственные весы с резервом." },
  ]),
  portion_scale: family("PORTION-SCALE", [
    { supplier_name: "КЛЕН", product_name: "MAS MSC-05", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/libra-a-la-carte/vesy-elektronnye-portsionnye-kompaktnye-mas-msc-05/", observed_unit_price_rub: 6638, availability_status: activeKlen, confidence: "high", notes: "Профессиональные порционные весы." },
    { supplier_name: "КЛЕН", product_name: "CAS SWN-3", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/libra-a-la-carte/vesy-cas-swn-3/", observed_unit_price_rub: 8224, availability_status: activeKlen, confidence: "high", notes: "Профессиональные порционные весы." },
    { supplier_name: "КЛЕН", product_name: "CAS SW-05W", source_url: "https://www.klenmarket.ru/shop/equipment/weighing-and-packaging-equipment/libra-a-la-carte/scales-cas-sw-05w/", observed_unit_price_rub: 19453, availability_status: activeKlen, confidence: "high", notes: "Профессиональные влагозащищённые порционные весы." },
  ]),
  probe: family("PROBE", [...Array.from({ length: 3 }, () => ({ supplier_name: "КЛЕН", product_name: "Кухонный термощуп −50…+300 °C", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/aksessuary-dlia-teplovogo-oborudovaniia/termoshchup-kukhonnyi-diapazon-ot-50-do-300c/", observed_unit_price_rub: 153, availability_status: activeKlen, confidence: "low" as const, notes: "Публичная карточка даёт лишь базовый ориентир; профессиональная поверка и точность не подтверждены." }))]),
  fridge_thermometer: family("FRIDGE-THERMOMETER", [
    { supplier_name: "КЛЕН", product_name: "Айсберг ТБ-225 −30…+30 °C", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/termometr-dlia-kholodilnika-30s30s-aisberg-tb-225-bez-poverki/", observed_unit_price_rub: 150, availability_status: activeKlen, confidence: "low", notes: "Без поверки; ориентир, не финальный выбор." },
    { supplier_name: "КЛЕН", product_name: "Термометр −50…+50 °C 04142424", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/termometr-30c30c-04142424/", observed_unit_price_rub: 780, availability_status: activeKlen, confidence: "medium", notes: "Ориентир холодильного термометра." },
    { supplier_name: "КЛЕН", product_name: "Термометр холодильный −30…+50 °C 49955", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/termometr-dlia-kholodilnika-3050s-49955-n3121/", observed_unit_price_rub: 866, availability_status: activeKlen, confidence: "medium", notes: "Ориентир холодильного термометра." },
  ]),
  timer: family("TIMER", [
    { supplier_name: "КЛЕН", product_name: "Механический кухонный таймер", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/taimer-mekhanicheskii-kukhonnyi-75-sm-belyi/", observed_unit_price_rub: 390, availability_status: activeKlen, confidence: "medium", notes: "Цена за один производственный таймер начального уровня." },
    { supplier_name: "КЛЕН", product_name: "Электронный сенсорный кухонный таймер", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/taimer-kukhonnyi-na-magnite-elektronnyi-sensornyi/", observed_unit_price_rub: 634, availability_status: activeKlen, confidence: "medium", notes: "Цена за один таймер." },
    { supplier_name: "КЛЕН", product_name: "Кухонный таймер 60 минут 41936", source_url: "https://www.klenmarket.ru/shop/equipment/aksessuary-dopolnitelnoe-oborudovanie/izmeritelnye-pribory/timer-kitchen-on-60-minutes-41936-46763/", observed_unit_price_rub: 1155, availability_status: activeKlen, confidence: "medium", notes: "Цена за один таймер; окончательная профессиональная модель не выбрана." },
  ]),
  large_ice: family("LARGE-ICE", [
    { supplier_name: "КЛЕН", product_name: "Viatto VA-IM-50B", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ldogeneratory-palchikovogo-lda/ldogenerator-va-im-50v/", observed_unit_price_rub: 53036, availability_status: activeKlen, confidence: "medium", notes: "Ориентир около 50 кг/сутки; достаточность для су-вида и бара требует расчёта." },
    { supplier_name: "КЛЕН", product_name: "Brema CB 840A", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ice-ice-kubikovogo/ldogenerator-brema-cb-840a/", observed_unit_price_rub: 234270, availability_status: activeKlen, confidence: "high", notes: "80 кг/сутки, встроенный бункер 40 кг, водопровод обязателен." },
    { supplier_name: "КЛЕН", product_name: "Brema CB 1265W", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ice-ice-kubikovogo/ldogenerator-brema-cb-1265w/", observed_unit_price_rub: 308957, availability_status: activeKlen, confidence: "high", notes: "130 кг/сутки, встроенный бункер 65 кг; резерв без промышленной линии." },
  ]),
  ice_bath: family("ICE-BATH", [...Array.from({ length: 3 }, (_, index) => ({ supplier_name: "КЛЕН", product_name: "GN 1/1×200 из поликарбоната + крышка", source_url: "https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-polycarbonate/gastroemkost-gn-11-530kh325kh200-jw-r118/", observed_unit_price_rub: 3425, availability_status: activeKlen, confidence: "medium" as const, notes: index === 0 ? "Цена комплекта ёмкости и крышки; для охлаждения после су-вида поставщик рекомендует проверить нержавеющее исполнение." : "Один и тот же публичный комплект используется как единичный ориентир; сценарии различаются количеством." }))]),
  saladette: family("SALADETTE", [
    { supplier_name: "КЛЕН", product_name: "HICOLD СХСб-С-1-1Д, 945×700", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/tables-cooled/okhlazhdaemyi-stol-saladetta-skhsb-s-11d-bez-borta-945kh700kh870/", observed_unit_price_rub: 122703, availability_status: activeKlen, confidence: "medium", notes: "Компактная саладетта; вместимость верхней зоны под минимум 8 начинок требует проверки." },
    { supplier_name: "КЛЕН", product_name: "HICOLD СХСб-С-1-2Д, 1390×600", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/tables-cooled/okhlazhdaemyi-stol-saladetta-skhsb-s-12d-bez-borta-1390kh600kh870/", observed_unit_price_rub: 153287, availability_status: activeKlen, confidence: "medium", notes: "Двухдверная саладетта; фактическую раскладку GN подтвердить." },
    { supplier_name: "КЛЕН", product_name: "HICOLD СХСб-С-2-2Д, 1390×700", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/tables-cooled/okhlazhdaemyi-stol-saladetta-skhsb-s-22d-s-bortom-1390kh700kh870/", observed_unit_price_rub: 156056, availability_status: activeKlen, confidence: "medium", notes: "Двухдверная саладетта увеличенной глубины; раскладку минимум на 8 начинок подтвердить." },
  ]),
  plastic_gn: family("PLASTIC-GN", [
    { supplier_name: "КЛЕН", product_name: "GN 1/3×65 из полипропилена + крышка", source_url: "https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/curl/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/cap-in-polypropylene-for-gn-13-21013/"], observed_unit_price_rub: 546, availability_status: activeKlen, confidence: "medium", notes: "Ориентир одной ёмкости GN 1/3 с крышкой; размеры комплекта требуют уточнения." },
    { supplier_name: "КЛЕН", product_name: "GN 1/3×100 из полипропилена + крышка", source_url: "https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/gastroemkost-gn-13-325kh176kh100-21011/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/cap-in-polypropylene-for-gn-13-21013/"], observed_unit_price_rub: 603, availability_status: activeKlen, confidence: "medium", notes: "Ориентир одной ёмкости GN 1/3 с крышкой." },
    { supplier_name: "КЛЕН", product_name: "GN 1/3×150 из полипропилена + крышка", source_url: "https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/gastroemkost-gn-13-325kh176kh150-21012/", additional_urls: ["https://www.klenmarket.ru/shop/inventory/kitchen-equipment/gastronorm-containers/gastronorm-containers-made-of-polypropylene/cap-in-polypropylene-for-gn-13-21013/"], observed_unit_price_rub: 673, availability_status: activeKlen, confidence: "medium", notes: "Ориентир одной ёмкости GN 1/3 с крышкой." },
  ]),
  postmix: family("POSTMIX", [
    { supplier_name: "BarGun", product_name: "Post-mix APSok-4", source_url: "https://bargun.ru/product/postmix-dispenser-dlya-rozliva-sokov-j-40sc-t/", observed_unit_price_rub: 155711, availability_status: "active_catalog; stock_not_confirmed", confidence: "low", notes: "Публичный ориентир системы; комплектность с карбонизатором, CO₂, насосами и фильтрацией требует КП." },
    { supplier_name: "AVIbar", product_name: "AVIbar Press", source_url: "https://avibar.ru/postmiks-avibar-press", observed_unit_price_rub: 199000, availability_status: "active_catalog; promotional_price; stock_not_confirmed", confidence: "low", notes: "Публичная акционная цена; точная комплектность и дата действия требуют КП." },
    { supplier_name: "FoodAtlas", product_name: "FOODATLAS LEF-4/5", source_url: "https://foodatlas.nt-rt.ru/price/product/450702", observed_unit_price_rub: 253500.46, availability_status: "active_catalog; stock_not_confirmed", confidence: "low", notes: "Публичный ориентир; соответствие полной комплектации проекта требует КП." },
  ]),
  keg: family("KEG", [
    { supplier_name: "Вино-Дел", product_name: "Mangrove Jack 19 л", source_url: "https://vino-del.ru/index.php?product_id=560&route=product%2Fproduct", observed_unit_price_rub: 9990, availability_status: "active_catalog; stock_not_confirmed", confidence: "medium", price_includes_vat: false, notes: "Цена за один пищевой Cornelius-кег; НДС на странице указан как не включённый/не применяемый." },
    { supplier_name: "BeerMachines", product_name: "KegLand Cornelius 19 л", source_url: "https://www.beermachines.ru/catalog/kegging/cornelius-keg-kegland-19/", observed_unit_price_rub: 10580, availability_status: "active_catalog; stock_not_confirmed", confidence: "medium", notes: "Цена за один кег; текущую цену и фитинг подтвердить." },
    { supplier_name: "Русский Самодел", product_name: "KegLand Cornelius Ball Lock 19 л", source_url: "https://russsam.ru/product/keg-kornelius-kegland-s-fitingom-ball-lock-19-l/", observed_unit_price_rub: 12363, availability_status: "active_catalog; listed_in_stock", confidence: "medium", notes: "Цена за один кег; санитарную совместимость и фитинг подтвердить." },
  ]),
  thermopot: family("THERMOPOT", [
    { supplier_name: "КЛЕН", product_name: "GASTRORAG DK-LX-100", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/boilers/kipiatilnik-gastrorag-dk-lx-100/", observed_unit_price_rub: 6788, availability_status: activeKlen, confidence: "medium", notes: "Профессиональный кипятильник/термопот; мойку и режим поддержания пуэра проверить." },
    { supplier_name: "КЛЕН", product_name: "ROSSO WB-20 PRO", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/boilers/kipiatilnik-rosso-wb-20-pro/", observed_unit_price_rub: 8536, availability_status: activeKlen, confidence: "medium", notes: "Профессиональный кипятильник 20 л; регулируемую температуру проверить." },
    { supplier_name: "КЛЕН", product_name: "GASTRORAG DK-LX-200", source_url: "https://www.klenmarket.ru/shop/equipment/the-thermal-equipment/boilers/kipiatilnik-gastrorag-dk-lx-200/", observed_unit_price_rub: 8693, availability_status: activeKlen, confidence: "medium", notes: "Увеличенный профессиональный кипятильник; регулируемую температуру проверить." },
  ]),
  compact_ice: family("COMPACT-ICE", [
    { supplier_name: "КЛЕН", product_name: "Viatto VA-IM-20B", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ldogeneratory-palchikovogo-lda/ldogenerator-va-im-20b/", observed_unit_price_rub: 15535, availability_status: activeKlen, confidence: "medium", notes: "Компактный профессиональный льдогенератор; условен для отдельной торговой точки." },
    { supplier_name: "КЛЕН", product_name: "Viatto VA-IM-25", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ldogeneratory-palchikovogo-lda/ldogenerator-va-im-25/", observed_unit_price_rub: 36050, availability_status: activeKlen, confidence: "medium", notes: "Компактный профессиональный льдогенератор; условен для отдельной торговой точки." },
    { supplier_name: "КЛЕН", product_name: "ROSSO HZB-45", source_url: "https://www.klenmarket.ru/shop/equipment/refrigeration-equipment/ice-generators/ice-ice-kubikovogo/ldogenerator-rosso-hzb-45/", observed_unit_price_rub: 39688, availability_status: activeKlen, confidence: "medium", notes: "Компактный профессиональный льдогенератор с резервом; условен для отдельной торговой точки." },
  ]),
  grow_system: family("GROW-SYSTEM", [
    { supplier_name: "Green-1", product_name: "Гидропонная ферма Basic, 4 уровня", source_url: "https://www.green-1.ru/index.php?path=11900330_11900332&product_id=836&route=product%2Fproduct", observed_unit_price_rub: 119000, availability_status: "active_catalog; stock_not_confirmed", confidence: "low", notes: "Аналог опытной установки; не является точным аэротуманным змеевиком проекта." },
    { supplier_name: "Green-1", product_name: "Гидропонная ферма Full, 4 уровня", source_url: "https://www.green-1.ru/index.php?path=11900330_11900332&product_id=839&route=product%2Fproduct", observed_unit_price_rub: 129000, availability_status: "active_catalog; stock_not_confirmed", confidence: "low", notes: "Аналог опытной установки; точная схема, 10 рядов и туманообразование требуют собственного расчёта." },
    { supplier_name: "Microzelen.ru", product_name: "Гидропонная ферма Full, 5 уровней", source_url: "https://microzelen.ru/catalog/gidroponnye-fermy/", observed_unit_price_rub: 129000, availability_status: "active_catalog; stock_not_confirmed", confidence: "low", notes: "Публичный ориентир готовой фермы; не заменяет инженерный расчёт проектного модуля." },
  ]),
  pos_terminal: family("POS-TERMINAL", [
    { supplier_name: "КЛЕН", product_name: "SPACE mini", source_url: "https://www.klenmarket.ru/shop/equipment/oborudovanie-dlia-avtomatizatsii/pos-sistemy/sensornyi-terminal-space-mini-116-intel-n5095-ddr4-8gbssd128gbwifibtaudiochernyi-win10/", observed_unit_price_rub: 35300, availability_status: activeKlen, confidence: "medium", notes: "Аппаратная часть POS; фискализация, эквайринг, ПО, лицензии, внедрение и периферия не включены." },
    { supplier_name: "КЛЕН", product_name: "SP/SKYV2", source_url: "https://www.klenmarket.ru/shop/equipment/oborudovanie-dlia-avtomatizatsii/pos-sistemy/sensornyi-terminal-spskyv2-15-intel-j4125-ozu-4gbssdbez-msr-windows-10-chernyi/", observed_unit_price_rub: 47500, availability_status: activeKlen, confidence: "medium", notes: "Аппаратная часть POS; ПО и периферия не включены." },
    { supplier_name: "КЛЕН", product_name: "SPACE SUPREME", source_url: "https://www.klenmarket.ru/shop/equipment/oborudovanie-dlia-avtomatizatsii/pos-sistemy/sensornyi-monoblok-space-supreme/", observed_unit_price_rub: 67300, availability_status: activeKlen, confidence: "medium", notes: "Аппаратная часть POS с резервом; ПО, фискализация и периферия не включены." },
  ]),
};

const pricedDefinitions: PricedDefinition[] = [
  { item_id: "CAPEX-01-003", module_id: "MOD-PREP", quotes: TABLE_1500, quantities: { minimum: 3, base: 3, scale_ready: 3 }, notes: "Три стола заданы исходной спецификацией; цена за единицу." },
  { item_id: "CAPEX-01-004", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.waste_table, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна единица по исходной спецификации." },
  { item_id: "CAPEX-01-005", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.wall_shelf, quantities: { minimum: 1, base: 2, scale_ready: 3 }, notes: "Количество в источнике tbd; 1/2/3 — только research-сценарии до планировки." },
  { item_id: "CAPEX-01-006", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.rack, quantities: { minimum: 1, base: 2, scale_ready: 3 }, notes: "Количество в источнике tbd; 1/2/3 — только research-сценарии до планировки." },
  { item_id: "CAPEX-01-007", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.drying_rack, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Один ориентировочный стеллаж; размер выбирается после планировки." },
  { item_id: "CAPEX-01-008", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.waste_bin, quantities: { minimum: 4, base: 6, scale_ready: 8 }, notes: "Количество по рабочим зонам не задано; 4/6/8 — research-сценарии, не новое утверждённое количество." },
  { item_id: "CAPEX-01-009", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.combi, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна профессиональная единица во всех сценариях по DEC-010; вода/дренаж и монтаж не включены." },
  { item_id: "CAPEX-01-010", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.sous_vide, quantities: { minimum: 1, base: 2, scale_ready: 2 }, notes: "Количество tbd; базовый сценарий предполагает два независимых термостата для параллельной работы при 500 чеках/день." },
  { item_id: "CAPEX-01-011", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.induction, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна двухконфорочная профессиональная плита." },
  { item_id: "CAPEX-01-013", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.vacuum, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Один камерный профессиональный аппарат; пакеты и сервис не включены." },
  { item_id: "CAPEX-01-014", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.robot, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Комплект дисков и способность давать требуемую структуру рубленого мяса не подтверждены.", notes: "Композитный ориентир процессор + набор дисков; до закупки нужны тест продукта и КП на точную комплектацию." },
  { item_id: "CAPEX-01-015", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.grinder, quantities: { minimum: 0, base: 0, scale_ready: 1 }, quantity_basis: { minimum: "conditional_excluded", base: "conditional_excluded" }, quote_status: "quote_required", high_risk: true, risk_reason: "Позиция покупается только если выбранный процессор не обеспечивает требуемую работу с мясом.", notes: "Цены сохранены для развилки; MINIMUM и BASE не включают отдельную мясорубку, SCALE_READY включает одну условно." },
  { item_id: "CAPEX-01-016", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.jar_blender, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Требование чаши не менее 2 л и колки льда нужно сверить по точной модификации.", notes: "Профессиональные модели; окончательный объём стакана и режим работы подтверждаются карточкой/КП." },
  { item_id: "CAPEX-01-017", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.immersion_blender, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна профессиональная единица." },
  { item_id: "CAPEX-01-018", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.planetary, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна профессиональная единица; все сценарии ≥10 л." },
  { item_id: "CAPEX-01-019", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.double_sink, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Одна двухсекционная мойка; смеситель/монтаж уточняются отдельно." },
  { item_id: "CAPEX-01-020", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.hand_sink, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Один отдельный рукомойник персонала." },
  { item_id: "CAPEX-01-021", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.dispenser_set, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Цена составлена из двух карточек и не является готовым комплектом поставщика.", notes: "Один комплект: мыло, антисептик и бумажные полотенца; расходники не включены." },
  { item_id: "CAPEX-01-022", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.bench_scale, quantities: { minimum: 1, base: 1, scale_ready: 2 }, notes: "Количество в источнике tbd; SCALE_READY содержит резервную/вторую рабочую единицу." },
  { item_id: "CAPEX-01-023", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.portion_scale, quantities: { minimum: 1, base: 2, scale_ready: 3 }, notes: "Количество в источнике tbd; 1/2/3 — research-сценарии по рабочим постам." },
  { item_id: "CAPEX-01-024", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.probe, quantities: { minimum: 2, base: 4, scale_ready: 6 }, quote_status: "quote_required", high_risk: true, risk_reason: "Публичная карточка не подтверждает профессиональную точность и поверку.", notes: "Низкостоимостной ориентир; перед закупкой выбрать профессиональные пищевые термощупы." },
  { item_id: "CAPEX-01-025", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.fridge_thermometer, quantities: { minimum: 2, base: 2, scale_ready: 4 }, notes: "Минимум по одному на холодильную и морозильную камеры; резерв в SCALE_READY." },
  { item_id: "CAPEX-01-026", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.timer, quantities: { minimum: 2, base: 4, scale_ready: 6 }, notes: "Количество в источнике tbd; research-сценарии по параллельным процессам." },
  { item_id: "CAPEX-01-043", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.large_ice, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Суточная потребность во льду для су-вида и бара ещё не рассчитана.", notes: "В BASE ориентир 80 кг/сутки со встроенным бункером; водоподготовка и подключение не включены." },
  { item_id: "CAPEX-01-045", module_id: "MOD-PREP", quotes: PRICE_FAMILIES.ice_bath, quantities: { minimum: 2, base: 4, scale_ready: 6 }, quote_status: "quote_required", high_risk: true, risk_reason: "Сравнение ледяных ванн с шоковым охлаждением ещё не выполнено.", notes: "Ориентир ёмкости + крышки; количества research, материал ванн и санитарная схема требуют решения." },
  { item_id: "CAPEX-02-004", module_id: "MOD-RETAIL-HOT", quotes: PRICE_FAMILIES.saladette, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Число GN-секций минимум под восемь начинок не подтверждено.", notes: "Одна саладетта; точную верхнюю конфигурацию проверить по спецификации/КП." },
  { item_id: "CAPEX-02-005", module_id: "MOD-RETAIL-HOT", quotes: PRICE_FAMILIES.plastic_gn, quantities: { minimum: 8, base: 16, scale_ready: 24 }, notes: "Цена за одну GN 1/3 с крышкой; 8/16/24 — research-сценарии оперативного и оборотного комплекта." },
  { item_id: "CAPEX-02-006", module_id: "MOD-RETAIL-HOT", quotes: TABLE_GENERAL, quantities: { minimum: 2, base: 2, scale_ready: 3 }, notes: "Минимум два стола задано источником; размеры после расстановки." },
  { item_id: "CAPEX-02-007", module_id: "MOD-RETAIL-HOT", quotes: TABLE_GENERAL, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Один стол сортировки и сборки." },
  { item_id: "CAPEX-02-008", module_id: "MOD-RETAIL-HOT", quotes: TABLE_GENERAL, quantities: { minimum: 1, base: 1, scale_ready: 1 }, notes: "Один стол сервировки и выдачи." },
  { item_id: "CAPEX-02-009", module_id: "MOD-RETAIL-HOT", quotes: PRICE_FAMILIES.rack, quantities: { minimum: 1, base: 2, scale_ready: 3 }, notes: "Количество tbd; research-сценарии до планировки." },
  { item_id: "CAPEX-02-010", module_id: "MOD-BAR", quotes: PRICE_FAMILIES.postmix, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Публичные комплекты различаются и не подтверждают весь требуемый состав.", notes: "До закупки нужен единый КП: охладитель, карбонизатор, CO₂, редуктор, насосы, шланги, краны/пистолет, каплесборник, фильтрация." },
  { item_id: "CAPEX-02-011", module_id: "MOD-BAR", quotes: PRICE_FAMILIES.keg, quantities: { minimum: 4, base: 8, scale_ready: 12 }, quote_status: "quote_required", high_risk: true, risk_reason: "Количество вкусов и оборот напитков ещё не определены.", notes: "Цена за один 19-литровый кег; 4/8/12 — research-сценарии, фитинги и мойка отдельно не оценены." },
  { item_id: "CAPEX-02-012", module_id: "MOD-BAR", quotes: PRICE_FAMILIES.thermopot, quantities: { minimum: 2, base: 2, scale_ready: 3 }, notes: "Минимум две единицы задано источником; SCALE_READY добавляет резерв." },
  { item_id: "CAPEX-02-013", module_id: "MOD-BAR", quotes: PRICE_FAMILIES.compact_ice, quantities: { minimum: 0, base: 0, scale_ready: 1 }, quantity_basis: { minimum: "conditional_excluded", base: "conditional_excluded" }, quote_status: "quote_required", high_risk: true, risk_reason: "Позиция относится только к отдельной торговой точке без заготовочного цеха.", notes: "Не включена в MINIMUM/BASE совмещённого пилота; одна единица показана только в SCALE_READY как условный отдельный формат." },
  { item_id: "CAPEX-03-001", module_id: "MOD-GROW", quotes: PRICE_FAMILIES.grow_system, quantities: { minimum: 2, base: 2, scale_ready: 3 }, quote_status: "quote_required", high_risk: true, risk_reason: "Цены относятся к готовым гидропонным аналогам, а не к утверждённой инженерной схеме из десяти рядов.", notes: "Опытный, не промышленный масштаб. Две установки — ориентир десяти рядов; точный аэротуманный модуль требует расчёта." },
  { item_id: "CAPEX-04-001", module_id: "MOD-POS", quotes: PRICE_FAMILIES.pos_terminal, quantities: { minimum: 2, base: 2, scale_ready: 2 }, quote_status: "quote_required", high_risk: true, risk_reason: "Оценена только аппаратная часть; фискализация, эквайринг, ПО и внедрение не детализированы.", notes: "Два POS-терминала заданы спецификацией; периферия и лицензии не включены." },
  { item_id: "CAPEX-04-002", module_id: "MOD-POS", quotes: PRICE_FAMILIES.pos_terminal, quantities: { minimum: 1, base: 1, scale_ready: 1 }, quote_status: "quote_required", high_risk: true, risk_reason: "Требования складского/производственного ПО и периферии не определены.", notes: "Один аппаратный терминал; сканер, принтер этикеток и ПО не включены." },
  { item_id: "CAPEX-04-003", module_id: "MOD-KDS", quotes: PRICE_FAMILIES.pos_terminal, quantities: { minimum: 3, base: 3, scale_ready: 3 }, quote_status: "quote_required", high_risk: true, risk_reason: "POS-моноблоки использованы как аппаратный ориентир; нужна проверка KDS-совместимости, защиты кухни, креплений и ПО.", notes: "Три экрана заданы спецификацией; лицензии KDS, сеть и крепления не включены." },
];

const unpricedDefinitions: UnpricedDefinition[] = [
  { item_id: "CAPEX-01-001", module_id: "MOD-PREP", risk_reason: "Цена зависит от помещения, объёма камеры и наличия существующего оборудования.", notes: "Холодильная камера остаётся quote_required; приобретение/дооборудование оценивается после выбора помещения." },
  { item_id: "CAPEX-01-002", module_id: "MOD-PREP", risk_reason: "Цена зависит от помещения, объёма камеры и наличия существующего оборудования.", notes: "Морозильная камера остаётся quote_required; приобретение/дооборудование оценивается после выбора помещения." },
  { item_id: "CAPEX-01-012", module_id: "MOD-PREP", risk_reason: "Размер и производительность зонта определяются после расстановки; монтаж вентиляции исключён из scope.", notes: "Цена не ставится, чтобы не смешивать товар с проектированием и монтажом вентиляции." },
  { item_id: "CAPEX-02-001", module_id: "MOD-RETAIL-HOT", risk_reason: "Для профессионального газового такояки-гриля с нужной геометрией не найден надёжный активный российский ценовой источник.", notes: "Нужны технический подбор, способ газоснабжения и коммерческое предложение." },
  { item_id: "CAPEX-02-002", module_id: "MOD-RETAIL-HOT", risk_reason: "Активная российская карточка UFO-гриля не содержит надёжной публичной цены.", notes: "Нужно коммерческое предложение на 3–4 профессиональные единицы." },
  { item_id: "CAPEX-02-003", module_id: "MOD-RETAIL-HOT", risk_reason: "Не решено, покупать 24 отдельных шприца или систему сменных цилиндров.", notes: "Публичные дозаторы не подтверждают работу с густыми рублеными начинками; нужен тест и КП на систему." },
  { item_id: "CAPEX-02-054", module_id: "MOD-BAR", risk_reason: "Опциональное алкогольное направление не утверждено и размеры хранения не определены.", notes: "Стеллажи/держатели для бутылок остаются без цены." },
  { item_id: "CAPEX-02-055", module_id: "MOD-BAR", risk_reason: "Опциональное алкогольное направление не утверждено и требования к закрываемой зоне не определены.", notes: "Закрываемая зона хранения алкоголя остаётся без цены." },
];

function scenarioValue(quoteValue: PriceQuote, quantity: number, quantityBasis: PriceScenarioValue["quantity_basis"]): PriceScenarioValue {
  return { ...quoteValue, quantity, quantity_basis: quantityBasis, line_total_rub: Math.round(quoteValue.observed_unit_price_rub * quantity * 100) / 100 };
}

export function recalculatePriceSummary(items: PriceResearchItem[]): PriceResearchSummary {
  const priced = items.filter(item => item.valuation_status === "priced");
  const money = (value: number) => Math.round(value * 100) / 100;
  const totals = Object.fromEntries(PRICE_SCENARIOS.map(scenario => [scenario, money(priced.reduce((total, item) => total + (item.scenarios[scenario]?.line_total_rub ?? 0), 0))])) as Record<PriceScenario, number>;
  const moduleTotals: Record<string, Record<PriceScenario, number>> = {};
  for (const moduleId of ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS", "MOD-WASH"]) {
    moduleTotals[moduleId] = Object.fromEntries(PRICE_SCENARIOS.map(scenario => [scenario, money(priced.filter(item => item.module_id === moduleId).reduce((total, item) => total + (item.scenarios[scenario]?.line_total_rub ?? 0), 0))])) as Record<PriceScenario, number>;
  }
  moduleTotals["POS/KDS"] = Object.fromEntries(PRICE_SCENARIOS.map(scenario => [scenario, money(moduleTotals["MOD-POS"][scenario] + moduleTotals["MOD-KDS"][scenario])])) as Record<PriceScenario, number>;
  const top = priced.map(item => ({ item_id: item.item_id, module_id: item.module_id, line_total_rub: item.scenarios.base?.line_total_rub ?? 0 })).sort((a, b) => b.line_total_rub - a.line_total_rub || a.item_id.localeCompare(b.item_id)).slice(0, 10);
  return {
    eligible_procurement_record_count: items.length,
    priced_record_count: priced.length,
    unpriced_record_count: items.length - priced.length,
    quote_required_count: items.filter(item => item.quote_status === "quote_required").length,
    totals_rub: totals,
    module_totals_rub: moduleTotals,
    top_10_base: top,
    high_risk_item_ids: items.filter(item => item.high_risk).map(item => item.item_id),
  };
}

export function buildPriceResearch(register: CapexRegister): CapexPriceResearch {
  const registerById = new Map(register.equipment.map(item => [item.item_id, item]));
  const eligible = register.equipment.filter(item => !item.item_id.startsWith("CAPEX-05-") && ["standalone", "purchased_separately"].includes(item.inclusion_status) && !["open_question", "engineering_connection"].includes(item.record_type));
  if (eligible.length !== CURRENT_PRICE_SCOPE_COUNT) throw new Error(`Expected ${CURRENT_PRICE_SCOPE_COUNT} independent procurement records in the current research scope, got ${eligible.length}.`);
  const definitions = new Set([...pricedDefinitions, ...unpricedDefinitions].map(item => item.item_id));
  const missing = eligible.map(item => item.item_id).filter(id => !definitions.has(id));
  const extra = [...definitions].filter(id => !eligible.some(item => item.item_id === id));
  if (missing.length || extra.length) throw new Error(`Price scope mismatch; missing=${missing.join(",") || "none"}; extra=${extra.join(",") || "none"}.`);
  const priced: PriceResearchItem[] = pricedDefinitions.map(definition => {
    if (!registerById.has(definition.item_id)) throw new Error(`Missing register item ${definition.item_id}.`);
    const scenarios = Object.fromEntries(PRICE_SCENARIOS.map(scenario => {
      const quantity = definition.quantities[scenario];
      const basis = definition.quantity_basis?.[scenario] ?? (registerById.get(definition.item_id)?.[`quantity_${scenario === "minimum" ? "min" : scenario}` as keyof EquipmentRecord] === quantity ? "register" : "research_assumption");
      return [scenario, scenarioValue(definition.quotes[scenario], quantity, basis as PriceScenarioValue["quantity_basis"])];
    })) as Record<PriceScenario, PriceScenarioValue>;
    return {
      item_id: definition.item_id,
      module_id: definition.module_id,
      valuation_status: "priced",
      quote_status: definition.quote_status ?? "researched",
      high_risk: definition.high_risk ?? false,
      risk_reason: definition.risk_reason ?? null,
      scenarios,
      notes: definition.notes,
    };
  });
  const unpriced: PriceResearchItem[] = unpricedDefinitions.map(definition => ({
    item_id: definition.item_id,
    module_id: definition.module_id,
    valuation_status: "quote_required",
    quote_status: "quote_required",
    high_risk: true,
    risk_reason: definition.risk_reason,
    scenarios: { minimum: null, base: null, scale_ready: null },
    notes: definition.notes,
  }));
  const items = [...priced, ...unpriced].sort((a, b) => a.item_id.localeCompare(b.item_id));
  return {
    schema_version: 1,
    document: {
      project: "Колобочная",
      document_id: CAPEX_PRICE_DOCUMENT_ID,
      title: "CAPEX Preliminary Price Research",
      russian_title: "CAPEX — Первичная ценовая оценка пищевого оснащения",
      version: "0.1",
      status: "research",
      decision_id: CAPEX_PRICE_DECISION_ID,
      iteration_id: CAPEX_PRICE_ITERATION_ID,
      proposal_id: CAPEX_PRICE_PROPOSAL_ID,
      checked_at: CAPEX_PRICE_CHECKED_AT,
      currency: "RUB",
      source_register_path: "docs-platform/working/capex-equipment-register.yaml",
      source_register_before_sha256: crypto.createHash("sha256").update(serializeRegister(register)).digest("hex"),
      warning: "Все цены — первичная research-оценка по публичным карточкам на дату проверки, не коммерческое предложение и не утверждённый CAPEX. Доставка, монтаж, инженерные подключения, ПО и иные исключённые расходы не добавляются, если это не указано явно.",
    },
    business_capacity: { prep_outlet_count: 5, checks_per_outlet_per_day: 100, total_checks_per_day: 500, scale_boundary: "Профессиональное кафе/пилотный объект; без бытового оборудования и без промышленной производственной линии." },
    scope: {
      included_modules: ["MOD-PREP", "MOD-RETAIL-HOT", "MOD-BAR", "MOD-GROW", "MOD-POS", "MOD-KDS", "MOD-WASH"],
      excluded_modules_and_categories: ["MOD-GUEST", "CAPEX-05", "ремонт", "инженерное проектирование и монтаж", "пожарная безопасность", "оборотный капитал", "сырьё", "упаковка и расходники запуска", "ещё не сформированные разделы"],
      eligible_procurement_record_count: CURRENT_PRICE_SCOPE_COUNT,
    },
    items,
    summary: recalculatePriceSummary(items),
  };
}

export function applyPriceResearch(register: CapexRegister, research: CapexPriceResearch): CapexRegister {
  const result = structuredClone(register) as CapexRegister;
  const researchById = new Map(research.items.map(item => [item.item_id, item]));
  result.document.decision_id = research.document.decision_id;
  result.document.iteration_id = research.document.iteration_id;
  result.document.proposal_id = research.document.proposal_id;
  result.document.warning = "Первичная ценовая оценка пищевого оснащения имеет статус research и не является коммерческим предложением или утверждённым CAPEX. Число записей реестра не равно числу самостоятельных закупочных единиц.";
  result.document.price_research_path = CAPEX_PRICE_RESEARCH_PATH;
  result.document.price_research_date = CAPEX_PRICE_DATE;
  result.document.priced_record_count = research.summary.priced_record_count;
  result.document.unpriced_procurement_record_count = research.summary.unpriced_record_count;
  for (const item of result.equipment) {
    item.content_source_id ??= item.source_id;
    const researchItem = researchById.get(item.item_id);
    if (!researchItem) {
      if (item.inclusion_status === "included_in_parent" || item.record_type === "component") item.quote_status = "included_in_parent";
      else if (item.record_type === "engineering_connection" || item.record_type === "open_question") item.quote_status = "tbd";
      continue;
    }
    item.quote_status = researchItem.quote_status;
    item.price_notes = [researchItem.notes, researchItem.risk_reason].filter(Boolean).join(" ");
    item.checked_at = research.document.checked_at;
    if (researchItem.valuation_status !== "priced") continue;
    const min = researchItem.scenarios.minimum!;
    const base = researchItem.scenarios.base!;
    const max = researchItem.scenarios.scale_ready!;
    item.price_min = min.observed_unit_price_rub;
    item.price_base = base.observed_unit_price_rub;
    item.price_max = max.observed_unit_price_rub;
    item.currency = "RUB";
    item.price_date = research.document.checked_at.slice(0, 10);
    item.supplier = base.supplier_name;
    item.supplier_name = base.supplier_name;
    item.product_name = base.product_name;
    item.source_id = base.source_id;
    item.source_url = base.source_url;
    item.price_source_type = base.source_type ?? "supplier_product_card";
    item.price_min_source_id = min.source_id;
    item.price_base_source_id = base.source_id;
    item.price_max_source_id = max.source_id;
    item.availability_status = base.availability_status;
    item.price_includes_vat = base.price_includes_vat;
    item.delivery_included = base.delivery_included;
    item.confidence = base.confidence;
  }
  return result;
}

export function serializePriceResearch(research: CapexPriceResearch) { return YAML.stringify(research, { lineWidth: 0 }); }

export function uniquePriceQuotes(research: CapexPriceResearch) {
  const quotes = new Map<string, PriceQuote>();
  for (const item of research.items) for (const scenario of PRICE_SCENARIOS) {
    const value = item.scenarios[scenario];
    if (!value) continue;
    const { quantity: _quantity, quantity_basis: _basis, line_total_rub: _total, ...quoteValue } = value;
    const prior = quotes.get(value.source_id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(quoteValue)) throw new Error(`Conflicting source metadata for ${value.source_id}.`);
    quotes.set(value.source_id, quoteValue);
  }
  return [...quotes.values()].sort((a, b) => a.source_id.localeCompare(b.source_id));
}

export function priceSourceRegistryEntries(research: CapexPriceResearch) {
  return uniquePriceQuotes(research).map(item => ({
    id: item.source_id,
    title: item.product_name,
    type: item.source_type ?? "supplier_product_card",
    location: item.source_url ?? item.source_location ?? (() => { throw new Error(`${item.source_id}: source location is required.`); })(),
    publisher: item.supplier_name,
    publication_date: null,
    accessed_at: item.checked_at,
    reliability: item.confidence === "high" ? "high" : item.confidence === "medium" ? "medium" : "low",
    notes: [
      `Наблюдаемая цена: ${item.observed_unit_price_rub} RUB.`,
      `Наличие: ${item.availability_status}.`,
      `НДС: ${item.price_includes_vat === null ? "не указано" : item.price_includes_vat ? "включён" : "не включён"}.`,
      `Доставка: ${item.delivery_included === null ? "не указано" : item.delivery_included ? "включена" : "не включена"}.`,
      `Уверенность: ${item.confidence}.`,
      item.notes,
      item.additional_urls.length ? `Дополнительные карточки комплекта: ${item.additional_urls.join(", ")}.` : "",
    ].filter(Boolean).join(" "),
  }));
}

export function validatePriceResearch(research: CapexPriceResearch, register?: CapexRegister) {
  const errors: string[] = [];
  const schemaPath = path.join(platformRoot, "schemas", "capex-price-research.schema.json");
  if (fs.existsSync(schemaPath)) {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(schemaPath, "utf8")));
    if (!validate(research)) errors.push(...(validate.errors ?? []).map(error => `schema ${error.instancePath || "/"} ${error.message}`));
  }
  if (research.items.length !== research.scope.eligible_procurement_record_count) errors.push(`Expected ${CURRENT_PRICE_SCOPE_COUNT} eligible price records, got ${research.items.length}.`);
  const ids = research.items.map(item => item.item_id);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate price research item_id.");
  if (research.summary.priced_record_count + research.summary.unpriced_record_count !== research.items.length) errors.push(`Price coverage summary must total ${CURRENT_PRICE_SCOPE_COUNT}.`);
  for (const item of research.items) {
    if (item.valuation_status === "priced") {
      for (const scenario of PRICE_SCENARIOS) {
        const value = item.scenarios[scenario];
        if (!value) errors.push(`${item.item_id}.${scenario}: missing priced scenario.`);
        else {
          if (!value.source_id || !value.checked_at) errors.push(`${item.item_id}.${scenario}: source ID and checked_at are required.`);
          if (value.source_url !== null) {
            try { if (new URL(value.source_url).protocol !== "https:") errors.push(`${item.item_id}.${scenario}: source URL must use HTTPS.`); }
            catch { errors.push(`${item.item_id}.${scenario}: invalid source URL.`); }
          } else if (value.source_type !== "owner_approved_research_estimate" || !value.source_location) {
            errors.push(`${item.item_id}.${scenario}: a missing URL requires owner_approved_research_estimate and a local source_location.`);
          }
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.checked_at)) errors.push(`${item.item_id}.${scenario}: checked_at must be UTC ISO-8601.`);
          if (value.line_total_rub !== Math.round(value.observed_unit_price_rub * value.quantity * 100) / 100) errors.push(`${item.item_id}.${scenario}: line total differs from unit price × quantity.`);
        }
      }
    } else if (PRICE_SCENARIOS.some(scenario => item.scenarios[scenario] !== null)) errors.push(`${item.item_id}: unpriced item contains a scenario price.`);
  }
  if (register) {
    const idsInRegister = new Set(register.equipment.map(item => item.item_id));
    for (const id of ids) if (!idsInRegister.has(id)) errors.push(`${id}: missing from Equipment Register.`);
    for (const item of register.equipment) {
      const hasPrice = [item.price_min, item.price_base, item.price_max].some(value => value !== null);
      if (hasPrice && (item.inclusion_status === "included_in_parent" || item.record_type === "component" || item.record_type === "engineering_connection" || item.record_type === "open_question")) errors.push(`${item.item_id}: non-purchasable/component record has a price.`);
      if (hasPrice && (!item.price_min_source_id || !item.price_base_source_id || !item.price_max_source_id || !item.price_date || (!item.source_url && item.price_source_type !== "owner_approved_research_estimate"))) errors.push(`${item.item_id}: priced register row lacks scenario sources/date/source attribution.`);
    }
  }
  const recalculated = recalculatePriceSummary(research.items);
  if (JSON.stringify(recalculated) !== JSON.stringify(research.summary)) errors.push("Price research summary differs from deterministic recalculation.");
  return errors;
}

export function readPriceResearch(file = path.join(platformRoot, "working", "capex-price-research.yaml")) { return YAML.parse(fs.readFileSync(file, "utf8")) as CapexPriceResearch; }

export function applyPriceResearchIfPresent(register: CapexRegister) {
  const file = path.join(platformRoot, "working", "capex-price-research.yaml");
  return fs.existsSync(file) ? applyPriceResearch(register, readPriceResearch(file)) : register;
}

export function pricePayload(register: CapexRegister) {
  const research = buildPriceResearch(register);
  const pricedRegister = applyPriceResearch(register, research);
  const errors = validatePriceResearch(research, pricedRegister);
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    schema_version: 1,
    iteration_id: CAPEX_PRICE_ITERATION_ID,
    proposal_id: CAPEX_PRICE_PROPOSAL_ID,
    decision_id: CAPEX_PRICE_DECISION_ID,
    status: "approved",
    approved_scope: "Первичная research-оценка публичных цен пищевого оснащения без утверждения моделей, поставщиков, количеств или итогового CAPEX.",
    price_research: research,
    equipment_register: pricedRegister,
    equipment_csv_sha256: crypto.createHash("sha256").update(equipmentCsv(pricedRegister)).digest("hex"),
    source_registry_entries: priceSourceRegistryEntries(research),
  };
}
