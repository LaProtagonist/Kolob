import fs from "node:fs";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import YAML from "yaml";
import { platformRoot } from "../google/config.js";
import { canonical, sha256, sameGenerated } from "../governance/util.js";
import { readRevenueModel } from "../investor/revenue-model.js";
import {
  FINANCIAL_PROJECTION_PATH,
  buildFinancialContentState,
  checkFinancialProjection,
  readFinancialModel,
} from "./financial-model.js";

const projectRoot = path.resolve(platformRoot, "..");

export const INVESTOR_SUMMARY_SOURCE_PATH = "docs-platform/working/investor-financial-summary.yaml";
export const INVESTOR_SUMMARY_SOURCE_SCHEMA_PATH = "docs-platform/schemas/investor-financial-summary.schema.json";
export const INVESTOR_SUMMARY_PROJECTION_SCHEMA_PATH = "docs-platform/schemas/investor-financial-summary-projection.schema.json";
export const INVESTOR_SUMMARY_GOOGLE_PAYLOAD_SCHEMA_PATH = "docs-platform/schemas/investor-financial-summary-google-payload.schema.json";
export const INVESTOR_SUMMARY_PROJECTION_PATH = "docs-platform/generated/investor-financial-summary.json";

export const INVESTOR_SUMMARY_CONTENT_SOURCE_PATHS = [
  INVESTOR_SUMMARY_SOURCE_PATH,
  INVESTOR_SUMMARY_SOURCE_SCHEMA_PATH,
  INVESTOR_SUMMARY_PROJECTION_SCHEMA_PATH,
  INVESTOR_SUMMARY_GOOGLE_PAYLOAD_SCHEMA_PATH,
  "docs-platform/app/src/financial/investor-summary.ts",
  "docs-platform/app/src/financial/investor-summary-google-sheet.ts",
  "docs-platform/app/src/google/investor-summary-publisher.ts",
] as const;

export type InvestorScenarioId = "pessimistic" | "realistic" | "optimistic";

const scenarioNames: Record<InvestorScenarioId, string> = {
  pessimistic: "Пессимистичный",
  realistic: "Реалистичный",
  optimistic: "Оптимистичный",
};

function normalizedSource(relativePath: string, bytes: Buffer) {
  const text = bytes.toString("utf8").replace(/\r\n?/g, "\n").normalize("NFC");
  if (relativePath.endsWith(".yaml")) return canonical(YAML.parse(text));
  if (relativePath.endsWith(".json")) return canonical(JSON.parse(text));
  return text;
}

export function buildInvestorSummaryContentState(root = projectRoot) {
  const sourceFiles = INVESTOR_SUMMARY_CONTENT_SOURCE_PATHS.map(relativePath => ({
    path: relativePath,
    sha256: sha256(normalizedSource(relativePath, fs.readFileSync(path.join(root, relativePath)))),
  }));
  const input = { schema_version: 1, source_files: sourceFiles };
  return { ...input, content_state_sha256: sha256(canonical(input)) };
}

export function readInvestorSummarySource(root = projectRoot): any {
  return YAML.parse(fs.readFileSync(path.join(root, INVESTOR_SUMMARY_SOURCE_PATH), "utf8"));
}

function schemaErrors(value: unknown, schemaPath: string, root = projectRoot) {
  const schema = JSON.parse(fs.readFileSync(path.join(root, schemaPath), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  return validate(value) ? [] : (validate.errors ?? []).map(error => `${error.instancePath || "/"} ${error.message}`);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function approximatelyEqual(actual: number, expected: number, tolerance = 0.02) {
  return Math.abs(actual - expected) <= tolerance;
}

function nullableNumber(value: any) {
  return value === null || value === undefined ? null : Number(value);
}

function periodSummary(value: any) {
  return {
    sales_rub: Number(value.gross_revenue_rub),
    ebitda_rub: Number(value.ebitda_rub),
    ebitda_margin: Number(value.ebitda_margin),
    free_cash_flow_rub: Number(value.free_cash_flow_rub),
  };
}

function scenarioSummary(id: InvestorScenarioId, value: any) {
  return {
    id,
    name: scenarioNames[id],
    checks_per_day: Number(value.checks_per_day),
    sales_per_month_rub: Number(value.gross_revenue_rub),
    ebitda_rub: Number(value.ebitda_rub),
    ebitda_margin: Number(value.ebitda_margin),
    free_cash_flow_rub: Number(value.operating_free_cash_flow_rub),
    break_even_checks_per_day: Number(value.break_even_checks_per_day),
    payback_month: nullableNumber(value.restaurant_payback_month),
    roi: Number(value.restaurant_roi_annual),
    irr: nullableNumber(value.restaurant_irr_annual),
    npv_rub: Number(value.restaurant_npv_rub),
    start_investment_rub: Number(value.restaurant_invested_capital_rub),
    calculated_staffing_labor_rub: Number(value.calculated_staffing_labor_rub),
    protected_labor_floor_rub: Number(value.protected_labor_floor_rub),
    protected_labor_applied: Boolean(value.protected_labor_binding),
    personnel_rub: Number(value.labor_rub),
    headcount: Number(value.staffing.headcount),
    marketing_rub: Number(value.marketing_rub),
    household_rub: Number(value.household_rub),
    year_1: periodSummary(value.year_1),
    mature_year: periodSummary(value.mature_year),
  };
}

function opexGroup(entries: Record<string, number>, ids: string[], scenarioValues: Record<string, number> = {}) {
  return round(sum(ids.map(id => {
    if (id in scenarioValues) return Number(scenarioValues[id]);
    if (!(id in entries)) throw new Error(`Investor Summary grouping references missing Financial Model OPEX entry ${id}.`);
    return Number(entries[id]);
  })));
}

export function buildInvestorFinancialSummaryFromInputs(input: {
  source: any;
  financialProjection: any;
  financialModel: any;
  revenueModel: any;
  financialProjectionSha256: string;
  summaryContentStateSha256: string;
}) {
  const { source, financialProjection: financial, financialModel: model, revenueModel: revenue } = input;
  const masterHash = financial.meta?.content_state?.content_state_sha256;
  if (source.dependency.content_state_sha256 !== masterHash) {
    throw new Error(`Investor Financial Summary is stale: expected Financial Model content hash ${source.dependency.content_state_sha256}, actual ${masterHash}.`);
  }
  if (financial.meta?.document_id !== source.dependency.document_id) throw new Error("Investor Financial Summary points to the wrong master document.");

  const rent = financial.scenarios.rent;
  const purchase = financial.scenarios.purchase;
  const realistic = rent.realistic;
  const purchaseRealistic = purchase.realistic;
  const scenarioComparison = (["pessimistic", "realistic", "optimistic"] as InvestorScenarioId[])
    .map(id => scenarioSummary(id, rent[id]));

  const entries = realistic.opex_entries_rub as Record<string, number>;
  const scenarioValues = { MARKETING: Number(realistic.marketing_rub), HOUSEHOLD: Number(realistic.household_rub) };
  const marketing = opexGroup(entries, source.opex_grouping.marketing, scenarioValues);
  const operations = opexGroup(entries, source.opex_grouping.operations);
  const administrative = opexGroup(entries, source.opex_grouping.administrative);
  const other = opexGroup(entries, source.opex_grouping.other);
  const household = Number(realistic.household_rub);
  const groupedFixedOpex = round(Number(entries.UTILITIES) + operations + administrative + other);
  if (!approximatelyEqual(groupedFixedOpex, Number(realistic.fixed_opex_without_labor_rent_rub))) {
    throw new Error(`Investor Summary OPEX grouping does not tie to master: ${groupedFixedOpex} vs ${realistic.fixed_opex_without_labor_rent_rub}.`);
  }

  const capex = financial.launch_capital;
  const prepaidRent = Number(realistic.rent_rub) * Number(model.real_estate.scenarios.rent.prepayment_months);
  const securityDeposit = Number(realistic.rent_rub) * Number(model.real_estate.scenarios.rent.security_deposit_months);
  const investmentBreakdown = [
    { key: "equipment", group: "creation", name: "Оборудование", amount_rub: Number(capex.equipment_rub) },
    { key: "furniture", group: "creation", name: "Мебель", amount_rub: Number(capex.furniture_rub) },
    { key: "preparation", group: "creation", name: "Подготовка помещения", amount_rub: Number(capex.preparation_rub) },
    { key: "video", group: "creation", name: "Видеонаблюдение", amount_rub: Number(model.launch_investment.video_surveillance_rub) },
    { key: "alarm", group: "creation", name: "Охранная сигнализация", amount_rub: Number(model.launch_investment.alarm_rub) },
    { key: "uniform", group: "launch", name: "Первичная форма", amount_rub: Number(model.launch_investment.initial_uniform_rub) },
    { key: "launch_marketing", group: "launch", name: "Маркетинг запуска", amount_rub: Number(realistic.launch_marketing_rub) },
    { key: "contingency", group: "launch", name: "Резерв запуска", amount_rub: Number(capex.contingency_rub) },
    { key: "inventory", group: "tied", name: "Первоначальный товарный запас", amount_rub: Number(realistic.initial_inventory_rub) },
    { key: "prepaid_rent", group: "tied", name: "Предоплата аренды на 12 месяцев", amount_rub: prepaidRent },
    { key: "deposit", group: "tied", name: "Обеспечительный платёж", amount_rub: securityDeposit },
    { key: "operating_reserve", group: "reserve", name: "Операционный запас", amount_rub: Number(realistic.fixed_opex_reserve_rub) },
  ];
  const investmentTotal = round(sum(investmentBreakdown.map(item => item.amount_rub)));
  if (!approximatelyEqual(investmentTotal, Number(realistic.restaurant_invested_capital_rub))) {
    throw new Error(`Investor Summary investment breakdown does not tie to master: ${investmentTotal} vs ${realistic.restaurant_invested_capital_rub}.`);
  }
  const investmentGroups = [
    { key: "creation", name: "Создание объекта", note: "Оборудование, мебель и подготовка помещения." },
    { key: "launch", name: "Запуск", note: "Единовременные расходы на открытие объекта." },
    { key: "tied", name: "Связанные средства", note: "Товарный запас и платежи, связанные с арендой помещения." },
    { key: "reserve", name: "Операционный запас", note: source.presentation.operating_reserve_note },
  ].map(group => ({
    ...group,
    amount_rub: round(sum(investmentBreakdown.filter(item => item.group === group.key).map(item => item.amount_rub))),
    items: investmentBreakdown.filter(item => item.group === group.key).map(item => ({ key: item.key, name: item.name, amount_rub: item.amount_rub })),
  }));

  const cogs = round(Number(realistic.raw_materials_rub) + Number(realistic.waste_rub) + Number(realistic.packaging_rub));
  const expenseGroups = {
    personnel_rub: Number(realistic.labor_rub),
    premises_rub: Number(realistic.rent_rub),
    acquiring_rub: Number(realistic.acquiring_rub),
    utilities_rub: Number(entries.UTILITIES),
    marketing_rub: marketing,
    operations_rub: operations,
    administrative_rub: administrative,
    administrative_reserve_rub: Number(realistic.administrative_reserve_rub),
    household_rub: household,
    other_rub: other,
  };
  const reconciledEbitda = round(Number(realistic.gross_profit_rub) - sum(Object.values(expenseGroups)));
  if (!approximatelyEqual(reconciledEbitda, Number(realistic.ebitda_rub))) {
    throw new Error(`Investor Summary expense groups do not tie to master EBITDA: ${reconciledEbitda} vs ${realistic.ebitda_rub}.`);
  }

  return {
    meta: {
      schema_version: 1,
      document_id: source.document.id,
      version: source.document.version,
      status: source.document.status,
      financial_model_document_id: source.dependency.document_id,
      financial_model_content_state_sha256: masterHash,
      financial_model_projection_sha256: input.financialProjectionSha256,
      summary_content_state_sha256: input.summaryContentStateSha256,
    },
    headline: {
      scenario_id: "realistic",
      scenario_name: scenarioNames.realistic,
      start_investment_rub: Number(realistic.restaurant_invested_capital_rub),
      sales_per_month_rub: Number(realistic.gross_revenue_rub),
      average_check_rub: Number(realistic.average_check_rub),
      checks_per_day: Number(realistic.checks_per_day),
      ebitda_rub: Number(realistic.ebitda_rub),
      ebitda_margin: Number(realistic.ebitda_margin),
      break_even_checks_per_day: Number(realistic.break_even_checks_per_day),
      free_cash_flow_rub: Number(realistic.operating_free_cash_flow_rub),
      free_cash_flow_basis: "зрелый месяц",
      payback_month: nullableNumber(realistic.restaurant_payback_month),
      roi: Number(realistic.restaurant_roi_annual),
      irr: nullableNumber(realistic.restaurant_irr_annual),
      npv_rub: Number(realistic.restaurant_npv_rub),
      discount_rate: Number(model.model.discount_rate_annual),
      year_1: periodSummary(realistic.year_1),
      mature_year: periodSummary(realistic.mature_year),
      personnel: {
        calculated_rub: Number(realistic.calculated_staffing_labor_rub),
        protected_floor_rub: Number(realistic.protected_labor_floor_rub),
        applied_rub: Number(realistic.labor_rub),
        protected_applied: Boolean(realistic.protected_labor_binding),
      },
      drivers: {
        checks_per_day: Number(realistic.checks_per_day),
        average_check_rub: Number(realistic.average_check_rub),
        sales_per_month_rub: Number(realistic.gross_revenue_rub),
        gross_margin: Number(realistic.gross_margin),
        rent_per_month_rub: Number(realistic.rent_rub),
        headcount: Number(realistic.staffing.headcount),
        break_even_checks_per_day: Number(realistic.break_even_checks_per_day),
      },
    },
    scenario_comparison: scenarioComparison,
    income_statement: {
      sales_rub: Number(realistic.gross_revenue_rub),
      cogs_rub: cogs,
      cogs: {
        raw_materials_rub: Number(realistic.raw_materials_rub),
        waste_rub: Number(realistic.waste_rub),
        packaging_rub: Number(realistic.packaging_rub),
      },
      gross_profit_rub: Number(realistic.gross_profit_rub),
      gross_margin: Number(realistic.gross_margin),
      expense_groups: expenseGroups,
      marketing_formula: realistic.marketing_formula,
      marketing_structure_reference: (model.opex.marketing_structure_reference.items as any[]).map(item => ({ id: item.id, name: item.name, amount_rub: Number(item.amount_rub) })),
      household_formula: realistic.household_formula,
      operations_detail: Object.fromEntries(source.opex_grouping.operations.map((id: string) => [id, Number(entries[id])])),
      administrative_detail: Object.fromEntries(source.opex_grouping.administrative.map((id: string) => [id, Number(entries[id])])),
      other_detail: Object.fromEntries(source.opex_grouping.other.map((id: string) => [id, Number(entries[id])])),
      ebitda_rub: Number(realistic.ebitda_rub),
      ebitda_margin: Number(realistic.ebitda_margin),
      depreciation_rub: Number(realistic.depreciation_rub),
      tax_rub: Number(realistic.tax_due_rub),
      net_operating_result_rub: Number(realistic.net_operating_result_rub),
      maintenance_capex_rub: Number(realistic.maintenance_capex_rub),
      free_cash_flow_rub: Number(realistic.operating_free_cash_flow_rub),
    },
    investments: {
      breakdown: investmentBreakdown,
      groups: investmentGroups,
      launch_marketing_rub: Number(realistic.launch_marketing_rub),
      total_rub: investmentTotal,
      fixed_operating_reserve_rub: Number(realistic.fixed_opex_reserve_rub),
      full_operating_reserve_rub: Number(realistic.full_operating_reserve_rub),
      other_launch_costs_status: model.launch_investment.other_launch_costs_status,
    },
    real_estate: {
      rent: {
        start_capital_rub: Number(realistic.restaurant_invested_capital_rub),
        ebitda_rub: Number(realistic.ebitda_rub),
        payback_month: Number(realistic.restaurant_payback_month),
        irr: Number(realistic.restaurant_irr_annual),
      },
      purchase: {
        restaurant_capital_rub: Number(purchaseRealistic.restaurant_invested_capital_rub),
        real_estate_investment_rub: Number(purchaseRealistic.real_estate_investment_rub),
        total_capital_rub: Number(purchaseRealistic.total_invested_capital_rub),
        restaurant_ebitda_rub: Number(purchaseRealistic.ebitda_rub),
        restaurant_payback_month: Number(purchaseRealistic.restaurant_payback_month),
        combined_payback_month: Number(purchaseRealistic.combined_payback_month),
        combined_irr: Number(purchaseRealistic.combined_irr_annual),
        base_property_appreciation: Number(purchaseRealistic.property_appreciation),
      },
    },
    sensitivity: {
      checks_average_check: financial.sensitivity.checks_average_check,
      food_cost: financial.sensitivity.food_cost,
      labor: financial.sensitivity.labor,
      rent: financial.sensitivity.rent,
      aggregators: financial.sensitivity.aggregators,
      capex: financial.sensitivity.capex,
    },
    assumptions: {
      days_per_month: Number(model.model.days_per_month),
      average_check_rub: Number(realistic.average_check_rub),
      food_portions_per_check: Number(revenue.product_model.food_portions_per_check),
      drinks_per_check: Number(revenue.product_model.drinks.per_check),
      kolobok_share: Number(revenue.product_model.food_mix.kolobok_share),
      manches_share: Number(revenue.product_model.food_mix.manches_share),
      waste_rate: Number(model.food_cost.waste.default_rate),
      acquiring_rate: Number((model.opex.entries as any[]).find(item => item.id === "ACQUIRING").rate_of_gross_revenue),
      packaging_baseline_rub: Number(model.packaging.baseline_monthly_rub),
      packaging_baseline_checks_per_day: Number(model.packaging.baseline_checks_per_day),
      rent_per_month_rub: Number(realistic.rent_rub),
      baseline_headcount: Number(realistic.staffing.headcount),
      optimistic_headcount: Number(rent.optimistic.staffing.headcount),
      baseline_labor_rub: Number(realistic.labor_rub),
      optimistic_labor_rub: Number(rent.optimistic.labor_rub),
      staffing_structure: source.staffing_presentation,
      discount_rate: Number(model.model.discount_rate_annual),
      opening_month: Number(model.model.opening_month),
      raw_materials_rate: Number(model.food_cost.protected_formula.raw_materials_rate),
      protected_labor_rate: Number(model.food_cost.protected_formula.protected_labor_rate),
      administrative_reserve_rate: Number((model.opex.entries as any[]).find(item => item.id === "ADMINISTRATIVE_RESERVE").rate_of_net_revenue),
      marketing_per_month_rub: marketing,
      marketing_formula: realistic.marketing_formula,
      household_formula: realistic.household_formula,
      pessimistic_headcount: Number(rent.pessimistic.staffing.headcount),
      launch_marketing_rub: Number(realistic.launch_marketing_rub),
      investment_break_even_checks_per_day: financial.investment_break_even?.min_checks_per_day ?? null,
      ramp_up_profile: (model.model.ramp_up_profile as any[]).map(item => ({ month: Number(item.month), ramp_factor: Number(item.ramp_factor) })),
      seasonality_profile: (model.model.seasonality_profile as any[]).map(item => ({ month: Number(item.month), seasonality_coefficient: Number(item.seasonality_coefficient) })),
    },
    copy: source.presentation,
  };
}

export function buildInvestorFinancialSummary(root = projectRoot) {
  const source = readInvestorSummarySource(root);
  const sourceErrors = schemaErrors(source, INVESTOR_SUMMARY_SOURCE_SCHEMA_PATH, root);
  if (sourceErrors.length) throw new Error(sourceErrors.join("\n"));
  checkFinancialProjection(root);
  const financialProjectionBytes = fs.readFileSync(path.join(root, FINANCIAL_PROJECTION_PATH));
  const financialProjection = JSON.parse(financialProjectionBytes.toString("utf8"));
  const currentMasterHash = buildFinancialContentState(root).content_state_sha256;
  if (financialProjection.meta.content_state.content_state_sha256 !== currentMasterHash) {
    throw new Error(`Financial Model projection content hash is stale: ${financialProjection.meta.content_state.content_state_sha256} vs ${currentMasterHash}.`);
  }
  return buildInvestorFinancialSummaryFromInputs({
    source,
    financialProjection,
    financialModel: readFinancialModel(root),
    revenueModel: readRevenueModel(root),
    financialProjectionSha256: sha256(financialProjectionBytes),
    summaryContentStateSha256: buildInvestorSummaryContentState(root).content_state_sha256,
  });
}

function serializedInvestorFinancialSummary(root = projectRoot) {
  return `${JSON.stringify(buildInvestorFinancialSummary(root), null, 2)}\n`;
}

export function validateInvestorFinancialSummary(value = buildInvestorFinancialSummary(), root = projectRoot): string[] {
  const errors = schemaErrors(value, INVESTOR_SUMMARY_PROJECTION_SCHEMA_PATH, root);
  const currentMasterHash = buildFinancialContentState(root).content_state_sha256;
  if (value.meta?.financial_model_content_state_sha256 !== currentMasterHash) errors.push("Investor Financial Summary dependency hash differs from the current Financial Model content hash.");
  if (value.meta?.summary_content_state_sha256 !== buildInvestorSummaryContentState(root).content_state_sha256) errors.push("Investor Financial Summary content-state hash is stale.");
  if (JSON.stringify(value.scenario_comparison?.map((item: any) => item.id)) !== JSON.stringify(["pessimistic", "realistic", "optimistic"])) errors.push("Investor Financial Summary must contain the three master scenarios in approved order.");
  if (!approximatelyEqual(value.investments?.breakdown?.reduce((total: number, item: any) => total + Number(item.amount_rub), 0), value.investments?.total_rub)) errors.push("Investor Financial Summary investment rows do not sum to the displayed total.");
  return errors;
}

export function writeInvestorFinancialSummary(root = projectRoot) {
  const serialized = serializedInvestorFinancialSummary(root);
  const parsed = JSON.parse(serialized);
  const errors = validateInvestorFinancialSummary(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const destination = path.join(root, INVESTOR_SUMMARY_PROJECTION_PATH);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, serialized);
  return {
    path: INVESTOR_SUMMARY_PROJECTION_PATH,
    sha256: sha256(serialized),
    financial_model_content_state_sha256: parsed.meta.financial_model_content_state_sha256,
  };
}

export function checkInvestorFinancialSummary(root = projectRoot) {
  const destination = path.join(root, INVESTOR_SUMMARY_PROJECTION_PATH);
  if (!fs.existsSync(destination)) throw new Error("Investor Financial Summary projection is missing. Run investor:summary:sync.");
  const actual = fs.readFileSync(destination, "utf8");
  const parsed = JSON.parse(actual);
  const errors = validateInvestorFinancialSummary(parsed, root);
  if (errors.length) throw new Error(errors.join("\n"));
  const expected = serializedInvestorFinancialSummary(root);
  if (!sameGenerated(actual, expected)) throw new Error("Investor Financial Summary projection is stale or non-deterministic. Run investor:summary:sync.");
  return {
    validation: "OK",
    path: INVESTOR_SUMMARY_PROJECTION_PATH,
    sha256: sha256(actual),
    financial_model_content_state_sha256: parsed.meta.financial_model_content_state_sha256,
  };
}
