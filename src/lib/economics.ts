import financialProjectionJson from "../../docs-platform/generated/financial-model-projection.json";
import investorSummaryJson from "../../docs-platform/generated/investor-financial-summary.json";

export const economicsScenarioIds = ["pessimistic", "realistic", "optimistic"] as const;
export type EconomicsScenarioId = (typeof economicsScenarioIds)[number];

const financialProjection = financialProjectionJson;
const investorSummary = investorSummaryJson;

type MasterRentScenario = (typeof financialProjection.scenarios.rent)[EconomicsScenarioId];
type SummaryScenario = (typeof investorSummary.scenario_comparison)[number];

const summaryScenarioById = Object.fromEntries(
  investorSummary.scenario_comparison.map((scenario) => [scenario.id, scenario]),
) as Record<EconomicsScenarioId, SummaryScenario>;

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

const marketingStructureReference = investorSummary.income_statement.marketing_structure_reference
  .map((item) => ({ id: item.id, name: marketingLabels[item.id] ?? item.name, amountRub: item.amount_rub }));

function assertDependencyParity() {
  const summaryHash = investorSummary.meta.financial_model_content_state_sha256;
  const masterHash = financialProjection.meta.content_state.content_state_sha256;
  if (summaryHash !== masterHash) {
    throw new Error(`Economics dependency is stale: Investor Summary ${summaryHash} != Financial Model ${masterHash}.`);
  }

  for (const id of economicsScenarioIds) {
    const summary = summaryScenarioById[id];
    const master = financialProjection.scenarios.rent[id];
    if (!summary || summary.checks_per_day !== master.checks_per_day
      || summary.sales_per_month_rub !== master.gross_revenue_rub
      || summary.ebitda_rub !== master.ebitda_rub
      || summary.payback_month !== master.restaurant_payback_month
      || summary.year_1.ebitda_rub !== master.year_1.ebitda_rub) {
      throw new Error(`Economics scenario ${id} is not aligned with the Financial Model projection.`);
    }
  }
}

assertDependencyParity();

function buildScenario(id: EconomicsScenarioId) {
  const summary = summaryScenarioById[id];
  const master: MasterRentScenario = financialProjection.scenarios.rent[id];
  const operations = investorSummary.income_statement.expense_groups.operations_rub;
  const administrativeAndOther = investorSummary.income_statement.expense_groups.administrative_rub
    + investorSummary.income_statement.expense_groups.other_rub;
  const productCost = master.raw_materials_rub + master.waste_rub + master.packaging_rub;
  if (summary.marketing_rub !== master.marketing_rub || summary.household_rub !== master.household_rub) {
    throw new Error(`Economics scenario ${id} marketing/household is not aligned with the Financial Model projection.`);
  }

  return {
    id,
    name: summary.name,
    checksPerDay: summary.checks_per_day,
    startInvestmentRub: master.restaurant_invested_capital_rub,
    salesPerMonthRub: summary.sales_per_month_rub,
    ebitdaRub: summary.ebitda_rub,
    ebitdaMargin: summary.ebitda_margin,
    freeCashFlowRub: summary.free_cash_flow_rub,
    breakEvenChecksPerDay: summary.break_even_checks_per_day,
    paybackMonth: summary.payback_month,
    roi: summary.roi,
    irr: summary.irr,
    npvRub: summary.npv_rub,
    headcount: master.staffing.headcount,
    pnl: {
      salesRub: master.gross_revenue_rub,
      productCostRub: productCost,
      rawMaterialsRub: master.raw_materials_rub,
      wasteRub: master.waste_rub,
      packagingRub: master.packaging_rub,
      grossProfitRub: master.gross_profit_rub,
      grossMargin: master.gross_margin,
      personnelRub: master.labor_rub,
      premisesRub: master.rent_rub,
      acquiringRub: master.acquiring_rub,
      utilitiesRub: master.opex_entries_rub.UTILITIES,
      marketingRub: master.marketing_rub,
      marketingFormula: master.marketing_formula,
      householdRub: master.household_rub,
      householdFormula: master.household_formula,
      operationsRub: operations,
      administrativeReserveRub: master.administrative_reserve_rub,
      administrativeAndOtherRub: administrativeAndOther,
      ebitdaRub: master.ebitda_rub,
      ebitdaMargin: master.ebitda_margin,
      depreciationRub: master.depreciation_rub,
      taxRub: master.tax_due_rub,
      netOperatingResultRub: master.net_operating_result_rub,
      freeCashFlowRub: master.operating_free_cash_flow_rub,
    },
    investmentBreakdown: investorSummary.investments.breakdown.map((item) => item.key === "operating_reserve"
      ? { ...item, amount_rub: master.fixed_opex_reserve_rub }
      : item),
    investmentGroups: investorSummary.investments.groups,
    operatingReserveRub: master.fixed_opex_reserve_rub,
    calculatedStaffingLaborRub: master.calculated_staffing_labor_rub,
    protectedLaborFloorRub: master.protected_labor_floor_rub,
    protectedLaborApplied: master.protected_labor_binding,
    year1: {
      salesRub: master.year_1.gross_revenue_rub,
      ebitdaRub: master.year_1.ebitda_rub,
      ebitdaMargin: master.year_1.ebitda_margin,
      freeCashFlowRub: master.year_1.free_cash_flow_rub,
    },
    matureYear: {
      salesRub: master.mature_year.gross_revenue_rub,
      ebitdaRub: master.mature_year.ebitda_rub,
      freeCashFlowRub: master.mature_year.free_cash_flow_rub,
    },
  };
}

const scenarioList = economicsScenarioIds.map(buildScenario);

export const economicsData = {
  meta: {
    investorSummaryDocumentId: investorSummary.meta.document_id,
    investorSummaryContentStateSha256: investorSummary.meta.summary_content_state_sha256,
    financialModelDocumentId: investorSummary.meta.financial_model_document_id,
    financialModelContentStateSha256: investorSummary.meta.financial_model_content_state_sha256,
  },
  defaultScenario: "realistic" as EconomicsScenarioId,
  scenarios: scenarioList,
  scenariosById: Object.fromEntries(scenarioList.map((scenario) => [scenario.id, scenario])) as Record<EconomicsScenarioId, (typeof scenarioList)[number]>,
  realEstate: investorSummary.real_estate,
  investments: investorSummary.investments,
  sensitivity: {
    checksAverageCheck: investorSummary.sensitivity.checks_average_check.find((row) => row.checks_per_day === 300)!,
    foodCost: investorSummary.sensitivity.food_cost,
  },
  assumptions: investorSummary.assumptions,
  rampUpProfile: investorSummary.assumptions.ramp_up_profile,
  seasonalityProfile: investorSummary.assumptions.seasonality_profile,
  launchMarketingRub: investorSummary.investments.launch_marketing_rub,
  marketingStructureReference,
  investmentBreakEven: financialProjection.investment_break_even,
  sourceCopy: investorSummary.copy,
} as const;

export type EconomicsScenario = (typeof economicsData.scenarios)[number];

