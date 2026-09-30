import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { platformRoot } from "../google/config.js";
import { sha256, sameGenerated } from "../governance/util.js";
import {
  INVESTOR_SUMMARY_GOOGLE_PAYLOAD_SCHEMA_PATH,
  INVESTOR_SUMMARY_PROJECTION_PATH,
  checkInvestorFinancialSummary,
} from "./investor-summary.js";

const projectRoot = path.resolve(platformRoot, "..");

export const INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH = "docs-platform/generated/investor-financial-summary-google-sheets-payload.json";

export type InvestorSheetValue = string | number | boolean;
export type InvestorSummarySheet = {
  name: string;
  values: InvestorSheetValue[][];
  frozen_rows: number;
  frozen_columns: number;
  column_widths: number[];
};

const scenarioColumns = ["Пессимистичный", "Реалистичный", "Оптимистичный"];

const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function blank(width: number): InvestorSheetValue[] {
  return Array(width).fill("");
}

function sheet(name: string, values: InvestorSheetValue[][], columnWidths: number[], frozenRows = 4, frozenColumns = 0): InvestorSummarySheet {
  return { name, values, frozen_rows: frozenRows, frozen_columns: frozenColumns, column_widths: columnWidths };
}

const NO_PAYBACK = "Не достигается за 60 месяцев";

function paybackValue(month: number | null): InvestorSheetValue {
  return month === null || month === undefined ? NO_PAYBACK : month;
}

function scenarioRows(summary: any): InvestorSheetValue[][] {
  const values = summary.scenario_comparison;
  return [
    ["Показатель", ...scenarioColumns],
    ["Чеков в день в зрелом режиме", ...values.map((item: any) => item.checks_per_day)],
    ["Команда, сотрудников", ...values.map((item: any) => item.headcount)],
    ["Маркетинг в месяц в зрелом режиме", ...values.map((item: any) => item.marketing_rub)],
    ["Продажи в месяц в зрелом режиме", ...values.map((item: any) => item.sales_per_month_rub)],
    ["EBITDA объекта в месяц", ...values.map((item: any) => item.ebitda_rub)],
    ["Операционная маржа", ...values.map((item: any) => item.ebitda_margin)],
    ["Стартовый капитал", ...values.map((item: any) => item.start_investment_rub)],
    ["Срок окупаемости, месяцев", ...values.map((item: any) => paybackValue(item.payback_month))],
    ["Первый год — продажи", ...values.map((item: any) => item.year_1.sales_rub)],
    ["Первый год — EBITDA", ...values.map((item: any) => item.year_1.ebitda_rub)],
    ["Первый год — свободный денежный поток", ...values.map((item: any) => item.year_1.free_cash_flow_rub)],
    ["Зрелый год — EBITDA", ...values.map((item: any) => item.mature_year.ebitda_rub)],
    ["Точка безубыточности, чеков в день", ...values.map((item: any) => item.break_even_checks_per_day)],
    ["Свободный денежный поток в месяц", ...values.map((item: any) => item.free_cash_flow_rub)],
    ["ROI", ...values.map((item: any) => item.roi)],
    ["IRR", ...values.map((item: any) => item.irr)],
    ["NPV", ...values.map((item: any) => item.npv_rub)],
  ];
}

function mainScenarioRows(summary: any): InvestorSheetValue[][] {
  return scenarioRows(summary).map(([label, pessimistic, realistic, optimistic]) => [
    label,
    pessimistic,
    "",
    realistic,
    "",
    "",
    optimistic,
    "",
    "",
  ]);
}

function mainSheet(summary: any): InvestorSummarySheet {
  const h = summary.headline;
  const d = h.drivers;
  const values: InvestorSheetValue[][] = [
    ["05 — Финансовая модель — инвестиционная сводка"],
    [summary.copy.opening_statement],
    [summary.copy.ramp_and_seasonality_note],
    blank(9),
    ["Реалистичный сценарий — главные показатели"],
    ["Стартовый капитал", "", "", "Продажи в зрелом режиме", "", "", "EBITDA в зрелом режиме", "", ""],
    [h.start_investment_rub, "", "", h.sales_per_month_rub, "", "", h.ebitda_rub, "", ""],
    ["единовременные вложения", "", "", "в месяц", "", "", "в месяц", "", ""],
    ["Операционная маржа", "", "", "Срок окупаемости", "", "", "Средний чек", "", ""],
    [h.ebitda_margin, "", "", paybackValue(h.payback_month), "", "", h.average_check_rub, "", ""],
    ["EBITDA к продажам", "", "", "месяцев", "", "", "на один чек", "", ""],
    blank(9),
    ["Первый год работы"],
    ["Продажи за первый год", "", "", "EBITDA за первый год", "", "", "Свободный денежный поток", "", ""],
    [h.year_1.sales_rub, "", "", h.year_1.ebitda_rub, "", "", h.year_1.free_cash_flow_rub, "", ""],
    ["с учётом выхода на загрузку", "", "", h.year_1.ebitda_margin, "", "", "за первый год", "", ""],
    [summary.copy.year_1_note],
    blank(9),
    ["Ключевые параметры расчёта"],
    ["Параметр", "Значение", "", "Параметр", "Значение", "", "Параметр", "Значение", ""],
    ["Чеков в день", d.checks_per_day, "", "Средний чек", d.average_check_rub, "", "Продажи в месяц", d.sales_per_month_rub, ""],
    ["Валовая маржа", d.gross_margin, "", "Аренда в месяц", d.rent_per_month_rub, "", "Персонал", d.headcount, ""],
    ["Точка безубыточности", d.break_even_checks_per_day, "", "Сценарий", h.scenario_name, "", "Расчётный месяц", summary.assumptions.days_per_month, ""],
    ["Прямые затраты на продукцию", summary.assumptions.raw_materials_rate, "", "Расходы на персонал", summary.assumptions.protected_labor_rate, "", "Маркетинг в месяц", summary.assumptions.marketing_per_month_rub, ""],
    [summary.copy.protected_base_note],
    blank(9),
    ["Дополнительные показатели"],
    ["Показатель", "Значение", "Пояснение", "", "", "", "", "", ""],
    ["Свободный денежный поток", h.free_cash_flow_rub, h.free_cash_flow_basis, "", "", "", "", "", ""],
    ["ROI", h.roi, "годовой свободный денежный поток к ресторанному капиталу", "", "", "", "", "", ""],
    ["IRR", h.irr, "внутренняя норма доходности", "", "", "", "", "", ""],
    ["NPV при ставке 20%", h.npv_rub, "текущая стоимость денежных потоков", "", "", "", "", "", ""],
    blank(9),
    ["Сравнение трёх сценариев"],
    ...mainScenarioRows(summary),
    blank(9),
    ["Коротко о показателях"],
    ["EBITDA объекта", "Операционный результат до амортизации и налогов."],
    ["Точка безубыточности", "Минимальный средний поток чеков, при котором операционная модель перестаёт быть убыточной."],
    ["Срок окупаемости", "Первый месяц, когда накопленный денежный поток покрывает первоначальные вложения."],
    ["ROI", "Годовой свободный денежный поток относительно ресторанного капитала."],
    ["IRR", "Внутренняя норма доходности денежного потока модели."],
    ["NPV", "Текущая стоимость будущих денежных потоков при выбранной ставке дисконтирования."],
  ];
  return sheet("Основные показатели", values, [190, 150, 40, 190, 150, 40, 190, 150, 40], 4, 0);
}

const operationsLabels: Record<string, string> = {
  EQUIPMENT_SERVICE: "Обслуживание оборудования",
  VENT_GREASE: "Вентиляция и жироуловители",
  PEST: "Дезинсекция и дератизация",
  SECURITY_MONITORING: "Пультовая охрана",
  UNIFORM_RENEWAL: "Обновление спецодежды",
  MEDICAL: "Медосмотры",
  MUSIC_RIGHTS: "Музыка и права",
};

const administrativeLabels: Record<string, string> = {
  ACCOUNTING: "Бухгалтерия",
  YUMA: "YUMA / кассовые сервисы",
  BANKING: "Банковское обслуживание",
};

const otherLabels: Record<string, string> = {
  HOUSEHOLD: "Хозяйственные и эксплуатационные расходники",
  OTHER: "Прочие регулярные расходы",
};

const marketingLabels: Record<string, string> = {
  MARKETING_SMM: "SMM / ведение",
  MARKETING_BLOGGERS: "Блогеры / инфлюенсеры",
  MARKETING_PERFORMANCE: "Performance / геореклама",
  MARKETING_CONTENT: "Контент",
  MARKETING_CRM: "CRM / акции",
  MARKETING_MERCH: "Мерч / промоматериалы",
  MARKETING_PARTNERSHIPS: "Локальные партнёрства / PR",
  MARKETING_TESTING: "Тестирование каналов",
};

function detailRows(values: Record<string, number>, labels: Record<string, string>): InvestorSheetValue[][] {
  return Object.entries(values).filter(([, value]) => value !== 0).map(([id, value]) => [`  ${labels[id]}`, -Number(value), "", ""]);
}

function marketingReferenceRows(items: Array<{ id: string; name: string; amount_rub: number }>): InvestorSheetValue[][] {
  return [
    ["  Ориентир состава при ~400 000 ₽ в месяц", "", "", "Структура регулярного маркетинга; суммы по сценариям задаёт формула"],
    ...items.map(item => [`  ${marketingLabels[item.id] ?? item.name}`, -Number(item.amount_rub), "", ""] as InvestorSheetValue[]),
  ];
}

function personnelNote(summary: any) {
  const personnel = summary.headline.personnel;
  return personnel.protected_applied
    ? "Защищённая база расходов на персонал — 27% продаж; фактическая стоимость команды ниже"
    : "Фактическая стоимость команды с начислениями и резервом";
}

function incomeSheet(summary: any): InvestorSummarySheet {
  const pnl = summary.income_statement;
  const sales = pnl.sales_rub;
  const percentage = (amount: number) => amount / sales;
  const g = pnl.expense_groups;
  const rows: InvestorSheetValue[][] = [
    ["Доходы и расходы"],
    ["Компактный P&L Реалистичного сценария. Расходы показаны со знаком минус."],
    blank(4),
    ["Показатель", "Сумма в месяц", "% от продаж", "Состав"],
    ["Продажи", sales, 1, "300 чеков в день × средний чек 1 165,40 ₽ × 30 дней"],
    ["Прямые затраты на продукцию", -pnl.cogs_rub, -percentage(pnl.cogs_rub), "Группа: сырьё, списания и упаковка"],
    ["  Сырьё", -pnl.cogs.raw_materials_rub, -percentage(pnl.cogs.raw_materials_rub), "Защищённая база расчёта — 30% продаж"],
    ["  Списания", -pnl.cogs.waste_rub, -percentage(pnl.cogs.waste_rub), "4% стоимости сырья"],
    ["  Упаковка", -pnl.cogs.packaging_rub, -percentage(pnl.cogs.packaging_rub), "При 300 чеках в день"],
    ["Валовая прибыль", pnl.gross_profit_rub, pnl.gross_margin, ""],
    blank(4),
    ["Персонал", -g.personnel_rub, -percentage(g.personnel_rub), personnelNote(summary)],
    ["Помещение", -g.premises_rub, -percentage(g.premises_rub), "Аренда"],
    ["Эквайринг", -g.acquiring_rub, -percentage(g.acquiring_rub), "2% продаж"],
    ["Коммунальные услуги", -g.utilities_rub, -percentage(g.utilities_rub), ""],
    ["Маркетинг и продвижение", -g.marketing_rub, -percentage(g.marketing_rub), "150 000 ₽ + 2,4% продаж; в первые шесть месяцев не менее 400 000 ₽"],
    ...marketingReferenceRows(pnl.marketing_structure_reference),
    ["Обслуживание и эксплуатация", -g.operations_rub, -percentage(g.operations_rub), "Группа: оборудование, санитария, охрана и эксплуатация"],
    ["Административные расходы", -g.administrative_rub, -percentage(g.administrative_rub), "Группа: бухгалтерия и кассовые сервисы"],
    ["Административный резерв", -g.administrative_reserve_rub, -percentage(g.administrative_reserve_rub), "2% продаж"],
    ["Хозяйственные и эксплуатационные расходники", -g.household_rub, -percentage(g.household_rub), "50 000 ₽ + 50 000 ₽ × поток чеков / 300"],
    ["Прочие расходы", -g.other_rub, -percentage(g.other_rub), "Прочие регулярные расходы"],
    ["EBITDA объекта", pnl.ebitda_rub, pnl.ebitda_margin, "Операционный результат до амортизации и налогов"],
    ["Амортизация", -pnl.depreciation_rub, -percentage(pnl.depreciation_rub), "Управленческая амортизация"],
    ["Налог", -pnl.tax_rub, -percentage(pnl.tax_rub), "Базовый налоговый сценарий"],
    ["Чистый операционный результат", pnl.net_operating_result_rub, percentage(pnl.net_operating_result_rub), ""],
    ["Поддерживающие инвестиции", -pnl.maintenance_capex_rub, -percentage(pnl.maintenance_capex_rub), "Не входят в EBITDA"],
    ["Свободный денежный поток", pnl.free_cash_flow_rub, percentage(pnl.free_cash_flow_rub), "Зрелый месяц работы"],
    blank(4),
    ["Состав групп расходов"],
    ["Обслуживание и эксплуатация", -g.operations_rub, "", ""],
    ...detailRows(pnl.operations_detail, operationsLabels),
    ["Административные расходы", -g.administrative_rub, "", ""],
    ...detailRows(pnl.administrative_detail, administrativeLabels),
    ["Прочие расходы", -g.other_rub, "", ""],
    ...detailRows(pnl.other_detail, otherLabels),
  ];
  return sheet("Доходы и расходы", rows, [310, 180, 130, 520], 4, 0);
}

function investmentsSheet(summary: any): InvestorSummarySheet {
  const investment = summary.investments;
  const rent = summary.real_estate.rent;
  const purchase = summary.real_estate.purchase;
  const rows: InvestorSheetValue[][] = [
    ["Инвестиции"],
    ["Состав стартового капитала и сопоставление сценариев аренды и покупки помещения."],
    blank(5),
    ["Состав стартового капитала — аренда"],
    ["Статья", "Сумма", "Пояснение", "", ""],
    ...investment.groups.flatMap((group: any) => [
      [group.name, group.amount_rub, group.note, "", ""],
      ...(group.items.length === 1 && group.items[0].name === group.name
        ? []
        : group.items.map((item: any) => [`  ${item.name}`, item.amount_rub, "", "", ""])),
    ]),
    ["Итого", investment.total_rub, "", "", ""],
    [summary.copy.investment_note],
    [summary.copy.additional_launch_costs_note],
    blank(5),
    ["Аренда и покупка помещения"],
    ["Показатель", "Аренда", "Покупка", "", ""],
    ["Капитал в ресторанную часть", rent.start_capital_rub, purchase.restaurant_capital_rub, "", ""],
    ["Недвижимость", 0, purchase.real_estate_investment_rub, "", ""],
    ["Совокупный капитал", rent.start_capital_rub, purchase.total_capital_rub, "", ""],
    ["EBITDA ресторана в месяц", rent.ebitda_rub, purchase.restaurant_ebitda_rub, "", ""],
    ["Окупаемость ресторанного капитала, месяцев", paybackValue(rent.payback_month), paybackValue(purchase.restaurant_payback_month), "", ""],
    ["Совокупная окупаемость, месяцев", paybackValue(rent.payback_month), paybackValue(purchase.combined_payback_month), "", ""],
    ["Внутренняя норма доходности", rent.irr, purchase.combined_irr, "", ""],
    ["Рост стоимости недвижимости в базовом сценарии", 0, purchase.base_property_appreciation, "", ""],
    ["Недвижимость учитывается отдельно от доходности ресторанного бизнеса."],
  ];
  return sheet("Инвестиции", rows, [330, 190, 230, 40, 40], 4, 0);
}

function sensitivityRows(summary: any): InvestorSheetValue[][] {
  const sensitivity = summary.sensitivity;
  const rows: InvestorSheetValue[][] = [];
  const addSection = (title: string) => rows.push(blank(5), [title]);
  addSection("Чеки в день × средний чек — операционная маржа");
  rows.push(["Чеков в день", "Чек −15%", "База", "Чек +15%", ""]);
  for (const item of sensitivity.checks_average_check) rows.push([item.checks_per_day, ...item.values.map((value: any) => value.ebitda_margin), ""]);

  addSection("Прямые затраты на продукцию");
  rows.push(["Уровень", "Операционная маржа", "Срок окупаемости, месяцев", "", ""]);
  for (const item of sensitivity.food_cost) rows.push([item.value, item.ebitda_margin, paybackValue(item.payback_month), "", ""]);

  addSection("Расходы на персонал");
  rows.push(["Изменение", "Операционная маржа", "Срок окупаемости, месяцев", "", ""]);
  for (const item of sensitivity.labor) rows.push([item.value === 1 ? "База" : `+${Math.round((item.value - 1) * 100)}%`, item.ebitda_margin, paybackValue(item.payback_month), "", ""]);

  addSection("Аренда");
  rows.push(["Аренда в месяц", "Операционная маржа", "Срок окупаемости, месяцев", "", ""]);
  for (const item of sensitivity.rent) rows.push([item.value, item.ebitda_margin, paybackValue(item.payback_month), "", ""]);

  addSection("Продажи через агрегаторы");
  rows.push(["Доля продаж", "Операционная маржа", "Срок окупаемости, месяцев", "", ""]);
  for (const item of sensitivity.aggregators) rows.push([item.value, item.ebitda_margin, paybackValue(item.payback_month), "", ""]);

  addSection("Стартовые инвестиции");
  rows.push(["Изменение", "Срок окупаемости, месяцев", "", "", ""]);
  for (const item of sensitivity.capex) rows.push([item.value === 1 ? "База" : `+${Math.round((item.value - 1) * 100)}%`, paybackValue(item.payback_month), "", "", ""]);
  return rows;
}

function scenariosSheet(summary: any): InvestorSummarySheet {
  const rows: InvestorSheetValue[][] = [
    ["Сценарии"],
    ["Сначала показаны три основных сценария, затем — ключевые стресс-тесты Реалистичного сценария."],
    blank(5),
    ["Три основных сценария"],
    ...scenarioRows(summary).map(row => [...row, ""]),
    ...sensitivityRows(summary),
  ];
  return sheet("Сценарии", rows, [300, 190, 190, 190, 40], 4, 0);
}

function assumptionsSheet(summary: any): InvestorSummarySheet {
  const a = summary.assumptions;
  const rows: InvestorSheetValue[][] = [
    ["Допущения"],
    ["Ключевые рабочие параметры, которые определяют расчёт инвесторской сводки."],
    blank(4),
    ["Параметр", "Значение", "Пояснение", ""],
    ["Расчётный месяц", a.days_per_month, "дней", ""],
    ["Средний чек", a.average_check_rub, "на один чек", ""],
    ["Порций еды на чек", a.food_portions_per_check, "", ""],
    ["Напитков на чек", a.drinks_per_check, "", ""],
    ["Структура еды", `${Math.round(a.kolobok_share * 100)}% колобки / ${Math.round(a.manches_share * 100)}% манчесы`, "", ""],
    ["Списания", a.waste_rate, "от стоимости сырья", ""],
    ["Эквайринг", a.acquiring_rate, "от продаж", ""],
    ["Упаковка", a.packaging_baseline_rub, `при ${a.packaging_baseline_checks_per_day} чеках в день`, ""],
    ["Аренда", a.rent_per_month_rub, "в месяц", ""],
    ["Персонал — Реалистичный", a.baseline_headcount, "сотрудников", ""],
    ["Персонал — Оптимистичный", a.optimistic_headcount, "сотрудников", ""],
    ["Расходы на персонал — Реалистичный", a.baseline_labor_rub, "в месяц", ""],
    ["Расходы на персонал — Оптимистичный", a.optimistic_labor_rub, "в месяц", ""],
    ["Прямые затраты на сырьё", a.raw_materials_rate, "защищённая база от продаж", ""],
    ["Расходы на персонал", a.protected_labor_rate, "защищённая база от продаж", ""],
    ["Административный резерв", a.administrative_reserve_rate, "от продаж", ""],
    ["Регулярный маркетинг — Реалистичный", a.marketing_per_month_rub, "в месяц в зрелом режиме", ""],
    ["Регулярный маркетинг — формула", summary.copy.marketing_text, "", ""],
    ["Хозяйственные расходники — формула", summary.copy.household_text, "", ""],
    ["Персонал — Пессимистичный", a.pessimistic_headcount, "сотрудников", ""],
    ["Маркетинг запуска", a.launch_marketing_rub, "единовременно при открытии", ""],
    ["Порог инвестиционной окупаемости", a.investment_break_even_checks_per_day, "чеков в день, при которых NPV при 20% за 60 месяцев становится неотрицательным", ""],
    blank(4),
    ["Выход на рабочую загрузку"],
    ["Месяц работы", ...a.ramp_up_profile.map((item: any) => item.month === 7 ? "7 и далее" : String(item.month))],
    ["Доля рабочей загрузки", ...a.ramp_up_profile.map((item: any) => item.ramp_factor)],
    [summary.copy.ramp_up_text],
    blank(4),
    ["Сезонность продаж"],
    ["Месяц", ...a.seasonality_profile.map((item: any) => monthNames[item.month - 1])],
    ["Коэффициент", ...a.seasonality_profile.map((item: any) => item.seasonality_coefficient)],
    [summary.copy.seasonality_text],
    [summary.copy.opening_month_note],
    blank(4),
    ["Структура команды"],
    [a.staffing_structure.join(" • ")],
    blank(4),
    ["Налоги и ограничения модели"],
    ["Базовый налоговый сценарий", summary.copy.tax_base_text, "", ""],
    ["Подтверждение", summary.copy.tax_confirmation_text, "", ""],
    ["Консервативный налоговый сценарий", summary.copy.tax_conservative_text, "", ""],
    ["Защищённая база расчёта", summary.copy.protected_base_note, "", ""],
    ["Пессимистичный сценарий", summary.copy.pessimistic_staffing_text, "", ""],
    ["Первый год работы", summary.copy.year_1_note, "", ""],
    ["Ставка дисконтирования", summary.copy.discount_rate_text, "", ""],
  ];
  return sheet("Допущения", rows, [360, 610, 280, 40], 4, 0);
}

export function buildInvestorSummaryGooglePayload(root = projectRoot) {
  checkInvestorFinancialSummary(root);
  const projectionBytes = fs.readFileSync(path.join(root, INVESTOR_SUMMARY_PROJECTION_PATH));
  const summary = JSON.parse(projectionBytes.toString("utf8"));
  const sheets = [mainSheet(summary), incomeSheet(summary), investmentsSheet(summary), scenariosSheet(summary), assumptionsSheet(summary)];
  return {
    meta: {
      schema_version: 1,
      document_id: summary.meta.document_id,
      title: "05 — Финансовая модель — инвестиционная сводка",
      folder_name: "Колобочная — Investment",
      native_google_sheet: true,
      financial_model_content_state_sha256: summary.meta.financial_model_content_state_sha256,
      summary_projection_sha256: sha256(projectionBytes),
    },
    sheets,
  };
}

function payloadSchemaErrors(value: unknown, root = projectRoot) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, INVESTOR_SUMMARY_GOOGLE_PAYLOAD_SCHEMA_PATH), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

export function validateInvestorSummaryGooglePayload(value = buildInvestorSummaryGooglePayload(), root = projectRoot): string[] {
  const errors = payloadSchemaErrors(value, root);
  const names = value.sheets?.map((item: InvestorSummarySheet) => item.name) ?? [];
  const expected = ["Основные показатели", "Доходы и расходы", "Инвестиции", "Сценарии", "Допущения"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) errors.push("Investor Summary Google payload must contain exactly five approved tabs in order.");
  const publicText = value.sheets?.flatMap((item: InvestorSummarySheet) => item.values.flat()).filter((item: InvestorSheetValue) => typeof item === "string").join("\n") ?? "";
  const forbidden = ["registry", "change set", "source id", "content_state", "sha256", "canonical", "owner_approved", "imported_canonical", "requires_confirmation", "YAML", "research"];
  for (const term of forbidden) if (publicText.toLowerCase().includes(term.toLowerCase())) errors.push(`Investor Summary public payload contains forbidden technical text: ${term}.`);
  return errors;
}

function serializedPayload(root = projectRoot) {
  return `${JSON.stringify(buildInvestorSummaryGooglePayload(root), null, 2)}\n`;
}

export function writeInvestorSummaryGooglePayload(root = projectRoot) {
  const serialized = serializedPayload(root);
  const parsed = JSON.parse(serialized);
  const errors = validateInvestorSummaryGooglePayload(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const destination = path.join(root, INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return { path: INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH, sha256: sha256(serialized), sheet_count: parsed.sheets.length };
}

export function checkInvestorSummaryGooglePayload(root = projectRoot) {
  const destination = path.join(root, INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH);
  if (!fs.existsSync(destination)) throw new Error("Investor Summary Google payload is missing. Run investor:summary:sheet:payload.");
  const actual = fs.readFileSync(destination, "utf8");
  const parsed = JSON.parse(actual);
  const errors = validateInvestorSummaryGooglePayload(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const expected = serializedPayload(root);
  if (!sameGenerated(actual, expected)) throw new Error("Investor Summary Google payload is stale or non-deterministic.");
  return { validation: "OK", path: INVESTOR_SUMMARY_GOOGLE_PAYLOAD_PATH, sha256: sha256(actual), sheet_count: parsed.sheets.length };
}
