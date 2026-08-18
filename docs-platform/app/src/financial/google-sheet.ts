import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { platformRoot } from "../google/config.js";
import { sha256 } from "../governance/util.js";
import { readRevenueModel } from "../investor/revenue-model.js";
import { buildFinancialContentState, buildSensitivity, calculateFinancialScenario, importedLaunchCapital, readFinancialModel } from "./financial-model.js";

const projectRoot = path.resolve(platformRoot, "..");
export const FINANCIAL_SHEET_PAYLOAD_PATH = "docs-platform/generated/financial-google-sheets-payload.json";
export const FINANCIAL_SHEET_PAYLOAD_SCHEMA_PATH = "docs-platform/schemas/financial-google-sheets-payload.schema.json";

export type SheetValue = string | number | boolean;
export type FinancialSheet = {
  name: string;
  values: SheetValue[][];
  frozen_rows: number;
  frozen_columns: number;
  column_widths: number[];
};

const SCENARIOS = [
  { id: "pessimistic", name: "Пессимистичный", row: 4, column: "B" },
  { id: "realistic", name: "Реалистичный", row: 5, column: "C" },
  { id: "optimistic", name: "Оптимистичный", row: 6, column: "D" },
] as const;

function q(name: string) { return `'${name}'`; }
function cell(sheet: string, ref: string) { return `${q(sheet)}!${ref}`; }
function rub(value: number) { return Math.round(value * 100) / 100; }
function formula(value: string) { return value.startsWith("=") ? value : `=${value}`; }
function blank(width: number): SheetValue[] { return Array(width).fill(""); }
function col(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}
function opex(model: any, id: string) {
  const entry = (model.opex.entries as any[]).find(item => item.id === id);
  if (!entry) throw new Error(`Missing Financial Model OPEX entry ${id}.`);
  return entry;
}
function sheet(name: string, values: SheetValue[][], columnWidths: number[], frozenRows = 3, frozenColumns = 1): FinancialSheet {
  return { name, values, frozen_rows: frozenRows, frozen_columns: frozenColumns, column_widths: columnWidths };
}

function descriptionSheet(model: any, contentState: string): FinancialSheet {
  return sheet("01 Описание", [
    ["04 — Финансовая модель пилотного объекта"],
    ["Финансовая модель связывает расчёт объёма продаж, себестоимость, операционные расходы, инвестиции и денежный поток пилотного объекта."],
    ["Модель является рабочей исследовательской версией и используется для сценарного анализа до выбора конкретного помещения, финальной рецептуры и получения коммерческих предложений."],
    ["Параметр", "Значение"],
    ["Статус", model.document.status],
    ["Версия", model.document.version],
    ["Расчётный горизонт", `${model.model.horizon_months} месяцев`],
    ["Основной сценарий", "Реалистичный / аренда / льготные взносы / освобождение общепита от НДС (требует подтверждения)"],
    ["Content state SHA-256", contentState],
    ["Источник Revenue", model.imports.revenue_model.document_id],
    ["Источник CAPEX", `${model.imports.capex.document_id}; CFG-PILOT-001 + BAR + GROW; alcohol off; hood excluded`],
    ["Источник стартовых параметров", model.imports.investor_start_model.document_id],
    ["MODEL STATUS", formula(`IF(COUNTIF(${cell("16 Проверки", "D4:D14")},"<>OK")=0,"PASS","FAIL")`)],
    ["Ограничение", "Рабочая research-модель не является гарантией доходности, финальным налоговым заключением или инвестиционным предложением."],
  ], [300, 760], 4, 1);
}

function assumptionsSheet(model: any, revenue: any, capital: ReturnType<typeof importedLaunchCapital>): FinancialSheet {
  const rows: SheetValue[][] = [
    ["Допущения"],
    ["Редактируемые inputs и импортированные канонические значения собраны в одном месте."],
    ["Параметр", "Значение", "Единица", "Сценарий / Scope", "Статус", "Источник", "Комментарий"],
  ];
  const add = (key: string, value: SheetValue, unit: string, scope: string, status: string, source: string, comment = "") => rows.push([key, value, unit, scope, status, source, comment]);
  const reduced = model.staffing.employer_contributions.reduced;
  const baseTax = model.tax.scenarios.base;
  const conservativeTax = model.tax.scenarios.conservative;
  add("days_per_month", revenue.sales_calculation.days_per_month, "дней", "all", "imported_canonical", "Revenue Model");
  add("average_check_rub", revenue.product_model.average_check_rub, "RUB/check", "all", "imported_canonical", "Revenue Model");
  add("food_portions_per_check", revenue.product_model.food_portions_per_check, "portion/check", "all", "imported_canonical", "Revenue Model");
  add("drinks_per_check", revenue.product_model.drinks.per_check, "drink/check", "all", "imported_canonical", "Revenue Model");
  add("kolobok_food_share", revenue.product_model.food_mix.kolobok_share, "share", "all", "imported_canonical", "Revenue Model");
  add("manches_food_share", revenue.product_model.food_mix.manches_share, "share", "all", "imported_canonical", "Revenue Model");
  add("average_drink_price_rub", revenue.product_model.drinks.average_price_rub, "RUB", "all", "imported_canonical", "Revenue Model");
  add("waste_rate", model.food_cost.waste.default_rate, "share of raw materials", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("acquiring_rate", opex(model, "ACQUIRING").rate_of_gross_revenue, "share of gross sales", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("aggregator_share", model.model.default_aggregator_share, "share of gross sales", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("aggregator_commission", opex(model, "AGGREGATORS").commission_rate, "share of aggregator sales", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("operating_reserve_months", model.operating_reserve.default_months, "months", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("rent_rub", model.real_estate.scenarios.rent.monthly_rent_rub, "RUB/month", "rent", "imported_canonical", "Investor Start Model");
  add("rent_prepayment_months", model.real_estate.scenarios.rent.prepayment_months, "months", "rent", "imported_canonical", "Investor Start Model");
  add("security_deposit_months", model.real_estate.scenarios.rent.security_deposit_months, "months", "rent", "imported_canonical", "Investor Start Model");
  add("launch_contingency_rate", model.launch_investment.contingency_default_rate, "share", "base", "imported_canonical", "Investor Start Model");
  add("discount_rate_annual", model.model.discount_rate_annual, "share/year", "investment metrics", model.model.discount_rate_status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("usn_rate", baseTax.usn_income_less_expenses_rate, "share", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("minimum_usn_rate", baseTax.minimum_usn_income_rate, "share of applicable income", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("base_vat_rate", baseTax.vat_rate, "share", "base", baseTax.vat_status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16", "Освобождение общепита от НДС требует подтверждения.");
  add("conservative_vat_rate", conservativeTax.vat_rate, "share included in price", "conservative", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16", "VAT = gross revenue × 5 / 105.");
  add("maintenance_capex_rate", model.maintenance_capex.annual_rate, "share/year", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("packaging_base_rub", model.packaging.baseline_monthly_rub, "RUB/month", `${model.packaging.baseline_checks_per_day} checks/day`, "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("packaging_base_checks", model.packaging.baseline_checks_per_day, "checks/day", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("initial_inventory_rub", model.launch_investment.initial_inventory_rub, "RUB", "Month 0", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("property_purchase_price_rub", model.real_estate.scenarios.purchase.purchase_price_rub, "RUB", "purchase", "imported_canonical", "Investor Start Model");
  add("property_appreciation", model.real_estate.appreciation_default, "share/year", "base", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("equipment_capex_rub", capital.equipment_rub, "RUB", "BASE + BAR + GROW; alcohol off; hood excluded", "imported_canonical", "Generated Equipment BOM + CAPEX snapshot");
  add("furniture_capex_rub", capital.furniture_rub, "RUB", "balanced / 50 seats", "imported_canonical", "Investor Start Model");
  add("preparation_rub", capital.preparation_rub, "RUB", "about 200 m²", "imported_canonical", "Investor Start Model");
  add("video_surveillance_rub", model.launch_investment.video_surveillance_rub, "RUB", "Month 0", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("alarm_rub", model.launch_investment.alarm_rub, "RUB", "Month 0", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("initial_uniform_rub", model.launch_investment.initial_uniform_rub, "RUB", "Month 0", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("other_launch_costs_rub", model.launch_investment.other_launch_costs_rub, "RUB", "Month 0", model.launch_investment.other_launch_costs_status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16", "Не считать подтверждённым нулём.");
  add("yuma_rub", opex(model, "YUMA").amount_rub, "RUB/month", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("contribution_threshold_rub", reduced.mrot_rub * reduced.threshold_multiple, "RUB/employee", "reduced", reduced.status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("contribution_rate_below", reduced.rate_below_threshold, "share", "reduced", reduced.status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("contribution_rate_above", reduced.rate_above_threshold, "share", "reduced", reduced.status, "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("standard_contribution_rate", model.staffing.employer_contributions.standard.rate, "share", "standard", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("personnel_reserve_rate", model.staffing.personnel_reserve_rate, "share", "all", "owner_approved", "SRC-FINANCIAL-MODEL-BRIEF-2026-08-16");
  add("protected_raw_materials_rate", model.food_cost.protected_formula.raw_materials_rate, "share of net revenue", "financial P&L", "owner_approved", "Financial Model v0.2", "Защищённая финансовая база; рецептурный расчёт остаётся аналитическим ориентиром.");
  add("protected_labor_rate", model.food_cost.protected_formula.protected_labor_rate, "share of net revenue", "financial P&L", "owner_approved", "Financial Model v0.2", "MAX(расчётная стоимость команды; выручка без НДС × ставка).");
  add("administrative_reserve_rate", opex(model, "ADMINISTRATIVE_RESERVE").rate_of_net_revenue, "share of net revenue", "financial P&L", "owner_approved", "Financial Model v0.2");
  add("marketing_fixed_amount_rub", opex(model, "MARKETING").fixed_amount_rub, "RUB/month", "marketing", "owner_approved", "Financial Model v0.2");
  add("marketing_rate", opex(model, "MARKETING").rate_of_net_revenue, "share of net revenue", "marketing", "owner_approved", "Financial Model v0.2");
  add("marketing_ramp_up_floor_rub", opex(model, "MARKETING").ramp_up_floor_rub, "RUB/month", "months 1–6", "owner_approved", "Financial Model v0.2");
  add("opening_month", model.model.opening_month, "calendar month", "cash flow", "working_assumption", "Financial Model v0.2", "Январь в текущей проекции; выбирается для конкретного объекта.");
  add("launch_marketing_rub", model.launch_investment.launch_marketing_rub, "RUB", "Month 0", "owner_approved", "Financial Model v0.2", "Отдельная разовая инвестиция, не ежемесячный OPEX.");
  return sheet("02 Допущения", rows, [250, 150, 150, 240, 200, 280, 380], 3, 1);
}

function salesSheet(revenue: any): FinancialSheet {
  const rows: SheetValue[][] = [
    ["Продажи"],
    ["Значения потока и среднего чека импортируются из Revenue Model; формулы рассчитывают день, месяц и механический год."],
    ["Сценарий", "Чеков / день", "Средний чек", "Дней / месяц", "Продажи / день", "Продажи / месяц", "Механический год", "Порций еды / месяц", "Напитков / месяц", "Источник"],
  ];
  for (const scenario of SCENARIOS) {
    const row = scenario.row;
    const imported = revenue.traffic.scenarios.find((item: any) => item.id === scenario.id);
    if (!imported) throw new Error(`Missing Revenue Model traffic scenario ${scenario.id}.`);
    rows.push([imported.name, imported.checks_per_day, formula(`${cell("02 Допущения", "$B$5")}`), formula(`${cell("02 Допущения", "$B$4")}`), formula(`B${row}*C${row}`), formula(`E${row}*D${row}`), formula(`F${row}*12`), formula(`B${row}*D${row}*${cell("02 Допущения", "$B$6")}`), formula(`B${row}*D${row}*${cell("02 Допущения", "$B$7")}`), "Revenue Model"]);
  }
  rows.push(["Примечание", "Годовой показатель — механическая экстраполяция без ramp-up и сезонности."]);
  return sheet("03 Продажи", rows, [190, 120, 130, 120, 150, 170, 170, 180, 160, 220], 3, 1);
}

function menuSheet(model: any, revenue: any): FinancialSheet {
  const segments = model.food_cost.kolobok_segments as any[];
  const rows: SheetValue[][] = [
    ["Меню и себестоимость"],
    ["Food cost рассчитывается из утверждённой структуры; списания применяются к стоимости сырья, а не к продажам."],
    ["Категория", "Доля продаж", "Цена", "Food cost %", "Себестоимость", "Weighted cost", "Статус / источник"],
  ];
  segments.forEach((item, index) => rows.push([item.name, item.sales_share, item.price_rub, item.food_cost_rate, formula(`C${index + 4}*D${index + 4}`), formula(`B${index + 4}*E${index + 4}`), "owner_approved"]));
  rows.push(["Средняя порция колобков", 1, formula(`SUMPRODUCT(B4:B7,C4:C7)`), "", formula("SUM(F4:F7)"), formula("E8"), "derived"]);
  rows.push(["Манчесы", revenue.product_model.food_mix.manches_share, model.food_cost.manches.price_rub, model.food_cost.manches.food_cost_rate, formula("C9*D9"), formula("B9*E9"), "owner_approved"]);
  rows.push(["Средняя порция еды", 1, revenue.product_model.average_food_portion_price_rub, "", formula(`E8*${cell("02 Допущения", "$B$8")}+E9*${cell("02 Допущения", "$B$9")}`), formula("E10"), "derived"]);
  rows.push(["Напитки", 1, revenue.product_model.drinks.average_price_rub, formula("E11/C11"), model.food_cost.drinks.unit_cost_rub, formula("E11"), "owner_approved"]);
  rows.push(["Списания", "", "", formula(`${cell("02 Допущения", "$B$11")}`), "", "", "4% от сырья"]);
  rows.push([]);
  rows.push(["Расчётная рецептурная себестоимость", "", "", "", "", "", "Технологический ориентир; не используется как базовая P&L-себестоимость."]);
  rows.push(["Защищённое допущение Financial Model", formula(`${cell("02 Допущения", "$B$44")}`), "", "", "", "", "Сырьё = 30% выручки без НДС в P&L, FCF и инвестиционных метриках."]);
  return sheet("04 Меню и себестоимость", rows, [240, 120, 120, 130, 150, 150, 240], 3, 1);
}

function staffSheet(model: any): FinancialSheet {
  const rows: SheetValue[][] = [
    ["Персонал"],
    ["ФОТ, страховые взносы и резерв рассчитываются из ролевой таблицы; SMM остаётся аутсорсинговым OPEX."],
    ["Роль", "Штат pessimistic", "Штат realistic", "Штат optimistic", "Ставка gross", "ФОТ pessimistic", "ФОТ realistic", "ФОТ optimistic", "Взносы pessimistic", "Взносы realistic", "Взносы optimistic", "График", "Функция"],
  ];
  (model.staffing.roles as any[]).forEach((role, index) => {
    const row = index + 4;
    const contribution = (headCol: string) => formula(`${headCol}${row}*(MIN($E${row},${cell("02 Допущения", "$B$39")})*${cell("02 Допущения", "$B$40")}+MAX($E${row}-${cell("02 Допущения", "$B$39")},0)*${cell("02 Допущения", "$B$41")})`);
    rows.push([role.role, role.pessimistic_headcount, role.realistic_headcount, role.optimistic_headcount, role.gross_salary_rub, formula(`B${row}*E${row}`), formula(`C${row}*E${row}`), formula(`D${row}*E${row}`), contribution("B"), contribution("C"), contribution("D"), role.schedule, role.function]);
  });
  rows.push(["Итого штат / ФОТ / взносы", formula("SUM(B4:B11)"), formula("SUM(C4:C11)"), formula("SUM(D4:D11)"), "", formula("SUM(F4:F11)"), formula("SUM(G4:G11)"), formula("SUM(H4:H11)"), formula("SUM(I4:I11)"), formula("SUM(J4:J11)"), formula("SUM(K4:K11)"), "", ""]);
  rows.push(["Резерв на персонал", "", "", "", "", formula(`(F12+I12)*${cell("02 Допущения", "$B$43")}`), formula(`(G12+J12)*${cell("02 Допущения", "$B$43")}`), formula(`(H12+K12)*${cell("02 Допущения", "$B$43")}`), "", "", "", "", ""]);
  rows.push(["Labor budget", "", "", "", "", formula("F12+I12+F13"), formula("G12+J12+G13"), formula("H12+K12+H13"), "", "", "", "", ""]);
  return sheet("05 Персонал", rows, [220, 120, 120, 120, 130, 150, 150, 150, 160, 160, 160, 180, 480], 3, 1);
}

function opexSheet(model: any): FinancialSheet {
  const rows: SheetValue[][] = [
    ["OPEX"],
    ["Все строки показываются, включая 0 и tbd. Maintenance CAPEX отделён от ремонтного OPEX и EBITDA."],
    ["Статья", "Категория", "Поведение", "База / формула", "Пессимистичный", "Реалистичный", "Оптимистичный", "Статус", "Комментарий"],
  ];
  const scenarioFormula = (scenarioIndex: number, value: (salesRow: number, staffCol: string) => string) => {
    const scenario = SCENARIOS[scenarioIndex];
    const staffCol = ["F", "G", "H"][scenarioIndex];
    return formula(value(scenario.row, staffCol));
  };
  const add = (name: string, category: string, behavior: string, basis: string, values: SheetValue[], status = "owner_approved", comment = "") => rows.push([name, category, behavior, basis, ...values, status, comment]);
  add("Сырьё — защищённая финансовая база", "Food & Beverage COGS", "Variable", "net revenue × 30%", SCENARIOS.map((_, i) => scenarioFormula(i, r => `${cell("03 Продажи", `F${r}`)}*${cell("02 Допущения", "$B$44")}`)));
  add("Списания", "Food & Beverage COGS", "Variable", "raw materials × 4%", SCENARIOS.map((_, i) => formula(`${col(4 + i)}4*${cell("02 Допущения", "$B$11")}`)));
  add("Упаковка", "Packaging", "Variable", "250,000 × checks / 300", SCENARIOS.map((s, i) => formula(`${cell("02 Допущения", "$B$26")}*${cell("03 Продажи", `B${s.row}`)}/${cell("02 Допущения", "$B$27")}`)));
  add("Расчётная стоимость команды", "Labor", "Step-fixed", "роли, взносы и резерв на персонал", SCENARIOS.map((_, i) => formula(`${cell("05 Персонал", `${["F", "G", "H"][i]}14`)}`)));
  add("Защищённый Labor", "Labor", "Step-fixed", "MAX(расчётная команда; net revenue × 27%)", SCENARIOS.map((_, i) => scenarioFormula(i, r => `MAX(${col(4 + i)}7,${cell("03 Продажи", `F${r}`)}*${cell("02 Допущения", "$B$45")})`)));
  add("Надбавка защищённого Labor", "Labor", "Derived", "защищённый Labor − расчётная команда", SCENARIOS.map((_, i) => formula(`${col(4 + i)}8-${col(4 + i)}7`)), "derived");
  const fixed = (amount: number) => SCENARIOS.map(() => amount);
  add(opex(model, "RENT").name, opex(model, "RENT").category, "Fixed", "Investor Start Model", fixed(model.real_estate.scenarios.rent.monthly_rent_rub), opex(model, "RENT").status);
  add(opex(model, "UTILITIES").name, opex(model, "UTILITIES").category, "Fixed", "owner-approved", fixed(opex(model, "UTILITIES").amount_rub), opex(model, "UTILITIES").status);
  add("Эквайринг", "Payment Processing", "Variable", "gross sales × 2%", SCENARIOS.map(s => formula(`${cell("03 Продажи", `F${s.row}`)}*${cell("02 Допущения", "$B$12")}`)));
  const addFixedEntry = (id: string, basis = "owner-approved", comment = "") => {
    const entry = opex(model, id);
    add(entry.name, entry.category, "Fixed", basis, fixed(entry.amount_rub), entry.status, comment);
  };
  const marketing = opex(model, "MARKETING");
  add(marketing.name, marketing.category, "Scenario formula", "150,000 + net revenue × 2.4%; M1–M6 floor 400,000", SCENARIOS.map(s => formula(`MAX(${cell("02 Допущения", "$B$49")},${cell("02 Допущения", "$B$47")}+${cell("03 Продажи", `F${s.row}`)}*${cell("02 Допущения", "$B$48")})`)), marketing.status);
  const household = opex(model, "HOUSEHOLD");
  add(household.name, household.category, "Scenario formula", "50,000 + 50,000 × checks / 300", SCENARIOS.map(s => formula(`${household.fixed_amount_rub}+${household.variable_amount_rub}*${cell("03 Продажи", `B${s.row}`)}/${household.baseline_checks_per_day}`)), household.status);
  const administrativeReserve = opex(model, "ADMINISTRATIVE_RESERVE");
  add(administrativeReserve.name, administrativeReserve.category, "Variable", "net revenue × 2%", SCENARIOS.map(s => formula(`${cell("03 Продажи", `F${s.row}`)}*${cell("02 Допущения", "$B$46")}`)), administrativeReserve.status);
  addFixedEntry("EQUIPMENT_SERVICE", "service OPEX");
  addFixedEntry("ACCOUNTING", "outsourcing");
  addFixedEntry("VENT_GREASE");
  addFixedEntry("UNIFORM_RENEWAL");
  addFixedEntry("MUSIC_RIGHTS", "public performance");
  addFixedEntry("PEST");
  addFixedEntry("YUMA");
  addFixedEntry("MEDICAL", "60,000 / year");
  addFixedEntry("SECURITY_MONITORING");
  addFixedEntry("BANKING", "tbd", "Требует уточнения; ноль не является подтверждённой ставкой.");
  const supplierDelivery = opex(model, "SUPPLIER_DELIVERY");
  add(supplierDelivery.name, supplierDelivery.category, "Variable", "included in purchase price", fixed(supplierDelivery.amount_rub), supplierDelivery.status);
  add("Агрегаторы", "Payment Processing", "Variable", "gross sales × share × 29.17%", SCENARIOS.map(s => formula(`${cell("03 Продажи", `F${s.row}`)}*${cell("02 Допущения", "$B$13")}*${cell("02 Допущения", "$B$14")}`)));
  addFixedEntry("OTHER");
  add("Налоги", "Taxes", "Variable", "см. налоговый proxy в P&L", SCENARIOS.map((_, i) => formula(`${cell("08 P&L", `${["B", "C", "D"][i]}39`)}`)), "management_proxy");
  add("Амортизация", "Management depreciation", "Non-cash", "management useful lives", SCENARIOS.map(() => formula(`${cell("07 CAPEX", "$D$20")}`)), "management_only");
  add("Maintenance CAPEX", "Capital expenditure", "Cash / outside EBITDA", "(equipment + furniture) × 3% / 12", SCENARIOS.map(() => formula(`${cell("07 CAPEX", "$D$19")}/12`)));
  return sheet("06 OPEX", rows, [260, 190, 130, 310, 150, 150, 150, 180, 360], 3, 1);
}

function capexSheet(model: any, capital: ReturnType<typeof importedLaunchCapital>): FinancialSheet {
  const rows: SheetValue[][] = [
    ["CAPEX и инвестиции запуска"],
    ["Equipment импортирован из generated BOM и канонического snapshot; недвижимость отделена от restaurant CAPEX."],
    ["Статья", "Классификация", "Источник", "BASE / Реалистичный", "Статус", "Комментарий"],
    ["Оборудование", "Restaurant CAPEX", "Generated Equipment BOM + CAPEX snapshot", capital.equipment_rub, "imported_canonical", "BASE; BAR/GROW on; alcohol off; hood excluded"],
    ["Мебель", "Restaurant CAPEX", "Investor Start Model", capital.furniture_rub, "imported_canonical", "50 seats / balanced"],
    ["Подготовка помещения", "Restaurant CAPEX", "Investor Start Model", capital.preparation_rub, "imported_canonical", "Около 200 м²"],
    ["Видеонаблюдение", "Launch CAPEX", "Owner approved", model.launch_investment.video_surveillance_rub, "research", "Month 0"],
    ["Охранная сигнализация", "Launch CAPEX", "Owner approved", model.launch_investment.alarm_rub, "research", "Month 0"],
    ["Первичная форма", "Pre-opening", "Owner approved", model.launch_investment.initial_uniform_rub, "research", "Month 0"],
    ["Первоначальный товарный запас", "Working Capital", "Owner approved", model.launch_investment.initial_inventory_rub, "research", "Отдельно от Operating Reserve"],
    ["Маркетинг запуска", "Pre-opening", "Owner approved", model.launch_investment.launch_marketing_rub, "research", "Отдельная строка Month 0; не входит в ежемесячный маркетинг"],
    ["Прочие launch costs", "Pre-opening", "TBD", model.launch_investment.other_launch_costs_rub, model.launch_investment.other_launch_costs_status, "Ноль не является подтверждённым значением"],
    ["Резерв запуска", "Launch contingency", "Investor Start Model", formula(`SUM(D4:D6)*${cell("02 Допущения", "$B$19")}`), "research", "Недвижимость не входит в базу"],
    ["Предоплата аренды", "Prepaid occupancy", "Investor Start Model", formula(`${cell("02 Допущения", "$B$16")}*${cell("02 Допущения", "$B$17")}`), "research", "Не P&L Month 1"],
    ["Обеспечительный платёж", "Tied funds", "Investor Start Model", formula(`${cell("02 Допущения", "$B$16")}*${cell("02 Допущения", "$B$18")}`), "research", "Не P&L; не возвращается автоматически Month 60"],
    ["Fixed OPEX Reserve", "Operating Reserve", "Financial Model", formula(`(${cell("05 Персонал", "$G$14")}+SUM(${cell("06 OPEX", "$F$11")},${cell("06 OPEX", "$F$13")},${cell("06 OPEX", "$F$14")},${cell("06 OPEX", "$F$16")}:${cell("06 OPEX", "$F$25")},${cell("06 OPEX", "$F$28")}))*${cell("02 Допущения", "$B$15")}+MAX(${cell("02 Допущения", "$B$15")}-${cell("02 Допущения", "$B$17")},0)*${cell("02 Допущения", "$B$16")}`), "research", "Включает расчётную команду, маркетинг и хозрасходники; не включает protected labor uplift и административный резерв"],
    ["Full Operating Reserve", "Conservative indicator", "Financial Model", formula(`D16+SUM(${cell("06 OPEX", "$F$4")}:${cell("06 OPEX", "$F$6")},${cell("06 OPEX", "$F$12")},${cell("06 OPEX", "$F$15")},${cell("06 OPEX", "$F$26")},${cell("06 OPEX", "$F$29")})*${cell("02 Допущения", "$B$15")}`), "research", "Не default invested capital"],
    ["Restaurant invested capital", "Investment", "Financial Model", formula("SUM(D4:D16)"), "derived", "Включает Fixed OPEX Reserve, не Full Reserve"],
    ["Real Estate Investment", "Property", "Investor Start Model", model.real_estate.scenarios.purchase.purchase_price_rub, "research", "Только purchase scenario"],
    ["Maintenance CAPEX / год", "Capital expenditure", "Financial Model", formula(`(D4+D5)*${cell("02 Допущения", "$B$25")}`), "derived", "Вычитается из FCF, не из EBITDA"],
    ["Management depreciation / месяц", "Non-cash", "Financial Model", capital.monthly_depreciation_rub, "management_only", `${capital.mapping_requires_review_count} unmapped items`],
  ];
  return sheet("07 CAPEX", rows, [280, 200, 260, 180, 180, 400], 3, 1);
}

function pnlSheet(): FinancialSheet {
  const rows: SheetValue[][] = [
    ["Monthly P&L"],
    ["Три сценария Revenue Model; VAT exemption — base requires confirmation. Налог рассчитывается отдельным management proxy."],
    ["Статья", "Пессимистичный", "Реалистичный", "Оптимистичный", "% продаж pessimistic", "% продаж realistic", "% продаж optimistic"],
  ];
  const add = (name: string, scenarioValues: SheetValue[], percent = true) => {
    const row = rows.length + 1;
    rows.push([name, ...scenarioValues, ...SCENARIOS.map((_, i) => percent ? formula(`${["B", "C", "D"][i]}${row}/${["B", "C", "D"][i]}4`) : "")]);
  };
  add("Продажи (gross consumer prices)", SCENARIOS.map(s => formula(`${cell("03 Продажи", `F${s.row}`)}`)));
  add("НДС", [0, 0, 0]);
  add("Продажи без НДС", [formula("B4-B5"), formula("C4-C5"), formula("D4-D5")]);
  add("Сырьё — защищённая финансовая база", [formula(`${cell("06 OPEX", "E4")}`), formula(`${cell("06 OPEX", "F4")}`), formula(`${cell("06 OPEX", "G4")}`)]);
  add("Списания", [formula(`${cell("06 OPEX", "E5")}`), formula(`${cell("06 OPEX", "F5")}`), formula(`${cell("06 OPEX", "G5")}`)]);
  add("Упаковка", [formula(`${cell("06 OPEX", "E6")}`), formula(`${cell("06 OPEX", "F6")}`), formula(`${cell("06 OPEX", "G6")}`)]);
  add("Валовая прибыль", [formula("B6-SUM(B7:B9)"), formula("C6-SUM(C7:C9)"), formula("D6-SUM(D7:D9)")]);
  add("Gross Margin %", [formula("B10/B6"), formula("C10/C6"), formula("D10/D6")], false);
  add("Расчётная стоимость команды", [formula(`${cell("06 OPEX", "E7")}`), formula(`${cell("06 OPEX", "F7")}`), formula(`${cell("06 OPEX", "G7")}`)]);
  add("Защищённый Labor", [formula(`${cell("06 OPEX", "E8")}`), formula(`${cell("06 OPEX", "F8")}`), formula(`${cell("06 OPEX", "G8")}`)]);
  add("Аренда", [formula(`${cell("06 OPEX", "E10")}`), formula(`${cell("06 OPEX", "F10")}`), formula(`${cell("06 OPEX", "G10")}`)]);
  add("Коммунальные", [formula(`${cell("06 OPEX", "E11")}`), formula(`${cell("06 OPEX", "F11")}`), formula(`${cell("06 OPEX", "G11")}`)]);
  add("Эквайринг", [formula(`${cell("06 OPEX", "E12")}`), formula(`${cell("06 OPEX", "F12")}`), formula(`${cell("06 OPEX", "G12")}`)]);
  add("Маркетинг", [formula(`${cell("06 OPEX", "E13")}`), formula(`${cell("06 OPEX", "F13")}`), formula(`${cell("06 OPEX", "G13")}`)]);
  add("Хозяйственные и эксплуатационные расходники", [formula(`${cell("06 OPEX", "E14")}`), formula(`${cell("06 OPEX", "F14")}`), formula(`${cell("06 OPEX", "G14")}`)]);
  add("Административный резерв", [formula(`${cell("06 OPEX", "E15")}`), formula(`${cell("06 OPEX", "F15")}`), formula(`${cell("06 OPEX", "G15")}`)]);
  add("Обслуживание оборудования", [formula(`${cell("06 OPEX", "E16")}`), formula(`${cell("06 OPEX", "F16")}`), formula(`${cell("06 OPEX", "G16")}`)]);
  add("Бухгалтерия", [formula(`${cell("06 OPEX", "E17")}`), formula(`${cell("06 OPEX", "F17")}`), formula(`${cell("06 OPEX", "G17")}`)]);
  add("Вентиляция и жироуловители", [formula(`${cell("06 OPEX", "E18")}`), formula(`${cell("06 OPEX", "F18")}`), formula(`${cell("06 OPEX", "G18")}`)]);
  add("Обновление спецодежды", [formula(`${cell("06 OPEX", "E19")}`), formula(`${cell("06 OPEX", "F19")}`), formula(`${cell("06 OPEX", "G19")}`)]);
  add("Музыка и права", [formula(`${cell("06 OPEX", "E20")}`), formula(`${cell("06 OPEX", "F20")}`), formula(`${cell("06 OPEX", "G20")}`)]);
  add("Дезинсекция и дератизация", [formula(`${cell("06 OPEX", "E21")}`), formula(`${cell("06 OPEX", "F21")}`), formula(`${cell("06 OPEX", "G21")}`)]);
  add("YUMA / кассовые сервисы", [formula(`${cell("06 OPEX", "E22")}`), formula(`${cell("06 OPEX", "F22")}`), formula(`${cell("06 OPEX", "G22")}`)]);
  add("Медосмотры", [formula(`${cell("06 OPEX", "E23")}`), formula(`${cell("06 OPEX", "F23")}`), formula(`${cell("06 OPEX", "G23")}`)]);
  add("Пультовая охрана", [formula(`${cell("06 OPEX", "E24")}`), formula(`${cell("06 OPEX", "F24")}`), formula(`${cell("06 OPEX", "G24")}`)]);
  add("Банковское обслуживание", [formula(`${cell("06 OPEX", "E25")}`), formula(`${cell("06 OPEX", "F25")}`), formula(`${cell("06 OPEX", "G25")}`)]);
  add("Прочие регулярные расходы", [formula(`${cell("06 OPEX", "E28")}`), formula(`${cell("06 OPEX", "F28")}`), formula(`${cell("06 OPEX", "G28")}`)]);
  add("Агрегаторы", [formula(`${cell("06 OPEX", "E27")}`), formula(`${cell("06 OPEX", "F27")}`), formula(`${cell("06 OPEX", "G27")}`)]);
  add("EBITDA объекта", [formula("B10-SUM(B13:B31)"), formula("C10-SUM(C13:C31)"), formula("D10-SUM(D13:D31)")]);
  add("EBITDA Margin %", [formula("B32/B6"), formula("C32/C6"), formula("D32/D6")], false);
  add("Амортизация", [formula(`${cell("07 CAPEX", "$D$21")}`), formula(`${cell("07 CAPEX", "$D$21")}`), formula(`${cell("07 CAPEX", "$D$21")}`)]);
  add("EBIT", [formula("B32-B34"), formula("C32-C34"), formula("D32-D34")]);
  add("Taxable base — management proxy", [formula(`MAX(B6-SUM(B7:B9,${cell("05 Персонал", "F12")},${cell("05 Персонал", "I12")},B14:B31),0)`), formula(`MAX(C6-SUM(C7:C9,${cell("05 Персонал", "G12")},${cell("05 Персонал", "J12")},C14:C31),0)`), formula(`MAX(D6-SUM(D7:D9,${cell("05 Персонал", "H12")},${cell("05 Персонал", "K12")},D14:D31),0)`)]);
  add("Regular USN 7%", [formula(`B36*${cell("02 Допущения", "$B$21")}`), formula(`C36*${cell("02 Допущения", "$B$21")}`), formula(`D36*${cell("02 Допущения", "$B$21")}`)]);
  add("Minimum USN 1%", [formula(`B6*${cell("02 Допущения", "$B$22")}`), formula(`C6*${cell("02 Допущения", "$B$22")}`), formula(`D6*${cell("02 Допущения", "$B$22")}`)]);
  add("Налоги", [formula("MAX(B37,B38)"), formula("MAX(C37,C38)"), formula("MAX(D37,D38)")]);
  add("Чистый операционный результат", [formula("B35-B39"), formula("C35-C39"), formula("D35-D39")]);
  add("Maintenance CAPEX", [formula(`${cell("07 CAPEX", "$D$20")}/12`), formula(`${cell("07 CAPEX", "$D$20")}/12`), formula(`${cell("07 CAPEX", "$D$20")}/12`)]);
  add("Operating Free Cash Flow", [formula("B32-B39-B41"), formula("C32-C39-C41"), formula("D32-D39-D41")]);
  return sheet("08 P&L", rows, [270, 160, 160, 160, 130, 130, 130], 3, 1);
}

function cashFlowSheet(projection: any): FinancialSheet {
  const scenario = projection.scenarios.rent.realistic;
  const months = scenario.monthly as any[];
  const width = 62;
  const rows: SheetValue[][] = [
    ["Денежный поток — Реалистичный / Аренда", ...blank(width - 1)],
    ["Month 0 отделён от P&L; месяцы 1–60 используют канонические коэффициенты ramp-up и сезонности. Депозит, inventory и оборудование не возвращаются автоматически в Month 60.", ...blank(width - 1)],
    ["Показатель", ...Array.from({ length: 61 }, (_, month) => month)],
    ["Календарный месяц", "", ...months.map(row => row.calendar_month)],
    ["Seasonality", "", ...months.map(row => row.seasonality_factor)],
    ["Ramp-up", "", ...months.map(row => row.ramp_factor)],
    ["Стартовые инвестиции", -scenario.restaurant_invested_capital_rub, ...Array(60).fill(0)],
    ["Продажи", 0, ...months.map(row => row.gross_revenue_rub)],
    ["EBITDA", 0, ...months.map(row => row.ebitda_rub)],
    ["Cash taxes", 0, ...months.map(row => -row.tax_due_rub)],
    ["Maintenance CAPEX", 0, ...months.map(() => -scenario.maintenance_capex_rub)],
    ["Использование предоплаченной аренды", 0, ...months.map(row => row.prepaid_rent_release_rub)],
    ["Net cash flow", -scenario.restaurant_invested_capital_rub, ...months.map(row => row.net_cash_flow_rub)],
    ["Cumulative FCF", -scenario.restaurant_invested_capital_rub, ...months.map(row => row.cumulative_net_cash_flow_rub)],
  ];
  return sheet("09 Денежный поток", rows, [300, ...Array(61).fill(110)], 3, 1);
}

function investmentsSheet(projection: any): FinancialSheet {
  const scenario = projection.scenarios.rent.realistic;
  const rows: SheetValue[][] = [
    ["Инвестиции и доходность"],
    ["Метрики рассчитаны по каноническому 60-месячному cash flow с ramp-up и сезонностью. ROI ниже имеет явно заданное определение."],
    ["Показатель", "Аренда / Реалистичный", "Определение / статус"],
    ["Restaurant investment", scenario.restaurant_invested_capital_rub, "Restaurant CAPEX + launch + tied funds + Fixed OPEX Reserve"],
    ["Real estate investment", 0, "Аренда"],
    ["Operating reserve", scenario.fixed_opex_reserve_rub, "Fixed OPEX Reserve, 6 months"],
    ["Working capital", scenario.initial_inventory_rub, "Initial inventory, separate from reserve"],
    ["Total invested capital", formula("B4+B5"), "Restaurant + property"],
    ["Payback Period", scenario.restaurant_payback_month ?? "Не окупается за 60 месяцев", "Первый месяц, в котором накопленный FCF неотрицателен"],
    ["ROI", scenario.restaurant_roi_annual, "FCF зрелого года / Restaurant invested capital"],
    ["IRR", scenario.restaurant_irr_annual ?? "Не окупается за 60 месяцев", "Annualized monthly IRR"],
    ["NPV", scenario.restaurant_npv_rub, "20% working discount rate; tbd investor hurdle"],
    ["Full Operating Reserve", scenario.full_operating_reserve_rub, "Secondary conservative indicator; not default capital"],
  ];
  return sheet("10 Инвестиции", rows, [300, 200, 520], 3, 1);
}

function scenariosSheet(projection: any): FinancialSheet {
  const rows: SheetValue[][] = [
    ["Сценарии"],
    ["Сценарии получают зрелый поток из Revenue Model; год 1 учитывает ramp-up и сезонность."],
    ["Показатель", "Пессимистичный", "Реалистичный", "Оптимистичный"],
  ];
  const keys: Array<[string, string]> = [
    ["Чеков / день", "checks_per_day"], ["Продажи / месяц — зрелый режим", "gross_revenue_rub"], ["Продажи / год 1", "year_1.gross_revenue_rub"],
    ["Сырьё", "raw_materials_rub"], ["Валовая прибыль", "gross_profit_rub"], ["Labor", "labor_rub"], ["EBITDA", "ebitda_rub"],
    ["EBITDA margin", "ebitda_margin"], ["Налоги", "tax_due_rub"], ["Free Cash Flow", "operating_free_cash_flow_rub"],
    ["Break-even checks/day", "break_even_checks_per_day"], ["Invested capital", "restaurant_invested_capital_rub"], ["Payback, month", "restaurant_payback_month"],
    ["ROI — annual FCF / restaurant capital", "restaurant_roi_annual"], ["IRR", "restaurant_irr_annual"], ["NPV", "restaurant_npv_rub"],
  ];
  for (const [label, key] of keys) {
    rows.push([label, ...SCENARIOS.map(s => {
      const source = projection.scenarios.rent[s.id];
      const value = key.includes(".") ? key.split(".").reduce((current: any, part) => current?.[part], source) : source[key];
      return value ?? "Не окупается за 60 месяцев";
    })]);
  }
  return sheet("11 Сценарии", rows, [330, 180, 180, 180], 3, 1);
}

function sensitivitySheet(model: any): FinancialSheet {
  const sensitivity = buildSensitivity(model);
  const rows: SheetValue[][] = [
    ["Чувствительность"],
    ["Значения рассчитаны каноническим движком; sensitivity overrides не переписывают базовую SKU- и staffing-модель."],
    ["Checks/day × Average check", "-15%", "BASE", "+15%"],
  ];
  for (const row of sensitivity.checks_average_check) rows.push([row.checks_per_day, ...row.values.map((item: any) => item.ebitda_margin)]);
  rows.push([], ["Food Cost stress", "EBITDA", "EBITDA margin", "Payback month"]);
  sensitivity.food_cost.forEach((item: any) => rows.push([item.value, item.ebitda_rub, item.ebitda_margin, item.payback_month ?? "beyond 60"]));
  rows.push([], ["Labor", "EBITDA", "EBITDA margin", "Payback month"]);
  sensitivity.labor.forEach((item: any) => rows.push([item.value, item.ebitda_rub, item.ebitda_margin, item.payback_month ?? "beyond 60"]));
  rows.push([], ["Rent", "EBITDA", "EBITDA margin", "Payback month"]);
  sensitivity.rent.forEach((item: any) => rows.push([item.value, item.ebitda_rub, item.ebitda_margin, item.payback_month ?? "beyond 60"]));
  rows.push([], ["CAPEX", "EBITDA", "EBITDA margin", "Payback month"]);
  sensitivity.capex.forEach((item: any) => rows.push([item.value, item.ebitda_rub, item.ebitda_margin, item.payback_month ?? "beyond 60"]));
  rows.push([], ["Aggregators", "EBITDA", "EBITDA margin", "Payback month"]);
  sensitivity.aggregators.forEach((item: any) => rows.push([item.value, item.ebitda_rub, item.ebitda_margin, item.payback_month ?? "beyond 60"]));
  rows.push([], ["VAT", "VAT", "USN", "EBITDA"]);
  sensitivity.vat.forEach((item: any) => rows.push([item.value, item.vat_rub, item.tax_due_rub, item.ebitda_rub]));
  rows.push([], ["Страховые взносы", "Labor", "EBITDA", "EBITDA margin"]);
  sensitivity.contributions.forEach((item: any) => rows.push([item.value, item.labor_rub, item.ebitda_rub, item.ebitda_margin]));
  return sheet("12 Чувствительность", rows, [280, 180, 180, 180], 3, 1);
}

function realEstateSheet(model: any): FinancialSheet {
  const purchase = calculateFinancialScenario("realistic", { realEstateScenario: "purchase", propertyAppreciation: 0 }, model);
  const rows: SheetValue[][] = [
    ["Недвижимость"],
    ["Property appreciation не входит в restaurant EBITDA. Restaurant, real-estate и combined return показываются отдельно."],
    ["Показатель", "Аренда", "Покупка 0%", "Покупка 3%", "Покупка 5%"],
    ["Аренда / месяц", 350000, 0, 0, 0],
    ["Real Estate Investment", 0, 69000000, 69000000, 69000000],
    ["Property value Month 60", 0, 69000000, formula("C5*(1+3%)^5"), formula("C5*(1+5%)^5")],
    ["Restaurant EBITDA", formula(`${cell("08 P&L", "$C$24")}`), purchase.ebitda_rub, purchase.ebitda_rub, purchase.ebitda_rub],
    ["Restaurant return", formula(`${cell("08 P&L", "$C$34")}*12/${cell("07 CAPEX", "$D$17")}`), purchase.restaurant_roi_annual, purchase.restaurant_roi_annual, purchase.restaurant_roi_annual],
    ["Real Estate return", "—", formula("C6/C5-1"), formula("D6/D5-1"), formula("E6/E5-1")],
    ["Combined investor return", "—", purchase.combined_irr_annual ?? "n/a", calculateFinancialScenario("realistic", { realEstateScenario: "purchase", propertyAppreciation: 0.03 }, model).combined_irr_annual ?? "n/a", calculateFinancialScenario("realistic", { realEstateScenario: "purchase", propertyAppreciation: 0.05 }, model).combined_irr_annual ?? "n/a"],
    ["Residual restaurant equipment", 0, 0, 0, 0],
  ];
  return sheet("13 Недвижимость", rows, [300, 170, 170, 170, 170], 3, 1);
}

function productionCenterSheet(): FinancialSheet {
  return sheet("14 Производственный центр", [
    ["Производственный центр"],
    ["Производственный центр обслуживает собственную точку. Внутренние перемещения не считаются выручкой группы."],
    ["Сценарий", "Порций еды / месяц", "Порций колобков / месяц", "Манчесов / месяц", "Статус внешней модели"],
    ["Пессимистичный", formula(`${cell("03 Продажи", "H4")}`), formula(`${cell("03 Продажи", "H4")}*80%`), formula(`${cell("03 Продажи", "H4")}*20%`), "not_started"],
    ["Реалистичный", formula(`${cell("03 Продажи", "H5")}`), formula(`${cell("03 Продажи", "H5")}*80%`), formula(`${cell("03 Продажи", "H5")}*20%`), "not_started"],
    ["Оптимистичный", formula(`${cell("03 Продажи", "H6")}`), formula(`${cell("03 Продажи", "H6")}*80%`), formula(`${cell("03 Продажи", "H6")}*20%`), "not_started"],
    ["Будущее масштабирование", "Внешняя supply-chain revenue, франчайзинг и межфирменные продажи не включены в v0.1."],
  ], [260, 190, 210, 180, 220], 3, 1);
}

function sourcesSheet(model: any, projection: any): FinancialSheet {
  return sheet("15 Источники", [
    ["Источники и provenance"],
    ["Owner-approved assumptions не выдаются за рыночные факты; external research в этой итерации не проводился."],
    ["Source ID", "Параметр", "Источник / hash", "Дата", "Тип", "Confidence / status", "Комментарий"],
    ["SRC-FINANCIAL-MODEL-BRIEF-2026-08-16", "Financial Model v0.1 baseline", "User instructions", "2026-08-16", "owner_approved", "primary", "Original approved baseline; no new research"],
    ["SRC-FINANCIAL-MODEL-V0-2-BRIEF-2026-08-18", "Financial Model v0.2 updates", "User instructions", "2026-08-18", "owner_approved", "primary", "Protected financial base, launch marketing, ramp-up and seasonality"],
    [model.imports.revenue_model.document_id, "Revenue", projection.meta.imported_revenue_content_state_sha256, "2026-08-16", "imported_canonical", "current", "Stale validation enabled"],
    [model.imports.capex.document_id, "Equipment CAPEX", projection.meta.imported_capex_content_state_sha256, "2026-08-16", "imported_canonical", "current", `BOM ${projection.meta.imported_equipment_bom_sha256}`],
    [model.imports.investor_start_model.document_id, "Premises / furniture / preparation", projection.meta.imported_investor_start_model_sha256, "2026-08-16", "imported_canonical", "current", "Stale validation enabled"],
    ["TAX-CAPEX-SCHEDULE", "Tax treatment of CAPEX", "not supplied", "", "tbd", "tbd", "Management depreciation is not a tax schedule"],
    ["BANKING", "Banking service", "not supplied", "", "tbd", "Требует уточнения", "0 is not an approved confirmed rate"],
    ["RAMP-UP", "Ramp-up profile", "Owner-approved working assumption", "2026-08-18", "owner_approved", "working", "60% to 100% from month 7"],
    ["SEASONALITY", "Seasonality", "Owner-approved working assumption", "2026-08-18", "owner_approved", "working", "Monthly Saint Petersburg curve; replaced by POS data when available"],
  ], [300, 260, 560, 130, 180, 190, 430], 3, 1);
}

function checksSheet(model: any, projection: any): FinancialSheet {
  const baseline = projection.scenarios.rent.realistic;
  const optimistic = projection.scenarios.rent.optimistic;
  return sheet("16 Проверки", [
    ["Проверки"],
    ["Формулы ниже должны возвращать OK после публикации и readback."],
    ["Проверка", "Формула", "Ожидаемо", "Результат"],
    ["Average kolobok cost", "04 Меню и себестоимость!E8", projection.derived_food_cost.average_kolobok_cost_rub, formula(`IF(ABS(${cell("04 Меню и себестоимость", "E8")}-C4)<0.0001,"OK","ERROR")`)],
    ["Average food cost", "04 Меню и себестоимость!E10", projection.derived_food_cost.average_food_portion_cost_rub, formula(`IF(ABS(${cell("04 Меню и себестоимость", "E10")}-C5)<0.01,"OK","ERROR")`)],
    ["Baseline headcount", "05 Персонал!C12", baseline.staffing.headcount, formula(`IF(${cell("05 Персонал", "C12")}=C6,"OK","ERROR")`)],
    ["Optimistic headcount", "05 Персонал!D12", optimistic.staffing.headcount, formula(`IF(${cell("05 Персонал", "D12")}=C7,"OK","ERROR")`)],
    ["Baseline calculated labor", "05 Персонал!G14", baseline.calculated_staffing_labor_rub, formula(`IF(ABS(${cell("05 Персонал", "G14")}-C8)<0.01,"OK","ERROR")`)],
    ["Baseline protected labor", "06 OPEX!F8", baseline.labor_rub, formula(`IF(ABS(${cell("06 OPEX", "F8")}-C9)<0.01,"OK","ERROR")`)],
    ["Optimistic protected labor", "06 OPEX!G8", optimistic.labor_rub, formula(`IF(ABS(${cell("06 OPEX", "G8")}-C10)<0.01,"OK","ERROR")`)],
    ["Equipment CAPEX", "07 CAPEX!D4", projection.launch_capital.equipment_rub, formula(`IF(ROUND(${cell("07 CAPEX", "D4")},0)=${model.imports.capex.control_total_rub_rounded},"OK","ERROR")`)],
    ["Realistic revenue", "03 Продажи!F5", baseline.gross_revenue_rub, formula(`IF(${cell("03 Продажи", "F5")}=C12,"OK","ERROR")`)],
    ["Month count", "09 Денежный поток!B3:BJ3", model.model.horizon_months + 1, formula(`IF(COUNTA(${cell("09 Денежный поток", "B3:BJ3")})=C13,"OK","ERROR")`)],
    ["Month 60 no restaurant terminal recovery", "09 Денежный поток!BJ13", baseline.monthly.at(-1).net_cash_flow_rub, formula(`IF(ABS(${cell("09 Денежный поток", "BJ13")}-C14)<0.01,"OK","ERROR")`)],
    ["Internal supply revenue", "14 Производственный центр", 0, "OK"],
  ], [330, 360, 180, 150], 3, 1);
}

export function buildFinancialGoogleSheetsPayload() {
  const model = readFinancialModel();
  const revenue = readRevenueModel();
  const projection = JSON.parse(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/financial-model-projection.json"), "utf8"));
  const contentState = buildFinancialContentState();
  const capital = importedLaunchCapital(model);
  return {
    meta: {
      schema_version: 1,
      document_id: model.document.id,
      title: model.document.google_title,
      folder_name: model.google_sheet.folder_name,
      native_google_sheet: true,
      content_state_sha256: contentState.content_state_sha256,
      financial_projection_sha256: sha256(fs.readFileSync(path.join(projectRoot, "docs-platform/generated/financial-model-projection.json"))),
      formula_input_mode: "USER_ENTERED",
    },
    sheets: [
      descriptionSheet(model, contentState.content_state_sha256), assumptionsSheet(model, revenue, capital), salesSheet(revenue), menuSheet(model, revenue), staffSheet(model), opexSheet(model), capexSheet(model, capital), pnlSheet(), cashFlowSheet(projection), investmentsSheet(projection), scenariosSheet(projection), sensitivitySheet(model), realEstateSheet(model), productionCenterSheet(), sourcesSheet(model, projection), checksSheet(model, projection),
    ],
  };
}

function schemaErrors(payload: unknown) {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, FINANCIAL_SHEET_PAYLOAD_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(payload) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

function serializedPayload() { return `${JSON.stringify(buildFinancialGoogleSheetsPayload(), null, 2)}\n`; }

export function writeFinancialGoogleSheetsPayload() {
  const serialized = serializedPayload();
  const parsed = JSON.parse(serialized);
  const errors = schemaErrors(parsed);
  if (errors.length) throw new Error(errors.join("\n"));
  const destination = path.join(projectRoot, FINANCIAL_SHEET_PAYLOAD_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: FINANCIAL_SHEET_PAYLOAD_PATH, sha256: sha256(serialized), content_state_sha256: parsed.meta.content_state_sha256, sheet_count: parsed.sheets.length };
}

export function checkFinancialGoogleSheetsPayload() {
  const destination = path.join(projectRoot, FINANCIAL_SHEET_PAYLOAD_PATH);
  if (!fs.existsSync(destination)) throw new Error("Financial Google Sheets payload is missing. Run financial:sheet:payload.");
  const actual = fs.readFileSync(destination, "utf8");
  const parsed = JSON.parse(actual);
  const errors = schemaErrors(parsed);
  if (errors.length) throw new Error(errors.join("\n"));
  const expected = serializedPayload();
  if (actual !== expected) throw new Error("Financial Google Sheets payload is stale or non-deterministic.");
  return { validation: "OK", path: FINANCIAL_SHEET_PAYLOAD_PATH, sha256: sha256(actual), content_state_sha256: parsed.meta.content_state_sha256, sheet_count: parsed.sheets.length };
}
