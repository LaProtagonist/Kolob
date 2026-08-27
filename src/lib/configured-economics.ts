import financialProjectionJson from "../../docs-platform/generated/financial-model-projection.json";
import investorSummaryJson from "../../docs-platform/generated/investor-financial-summary.json";
import { economicsData, type EconomicsScenario } from "./economics";
import {
  annualIrr,
  calculateFinancialMonthlyResult,
  firstPaybackMonth,
  presentValue,
  roundFinancial as round,
  sumFinancial as sum,
  type FinancialProjectionContext,
} from "./financial-core";
import { calculateLaunchBudget, defaultLaunchBudgetState } from "./launch-budget";
import { launchFinancials } from "./launch-financials";
import {
  baseObjectLaunchBudgetState,
  financialProjectionContextForConfiguration,
  historicalIntegratedPilotConfiguration,
  type InvestorConfiguration,
  type InvestorScenarioId,
} from "./investor-configuration";

const financialProjection = financialProjectionJson;
const investorSummary = investorSummaryJson;

type FinancialScenario = (typeof financialProjection.scenarios.rent)[InvestorScenarioId]
  | (typeof financialProjection.scenarios.purchase)[InvestorScenarioId];
type MonthlyCalculationRow = {
  month: number;
  gross_revenue_rub: number;
  net_revenue_rub: number;
  raw_materials_rub: number;
  labor_rub: number;
  administrative_reserve_rub: number;
  marketing_rub: number;
  household_rub: number;
  ebitda_rub: number;
  tax_due_rub: number;
  operating_free_cash_flow_rub: number;
};

type InvestmentItem = EconomicsScenario["investmentBreakdown"][number];
type InvestmentGroup = EconomicsScenario["investmentGroups"][number];

export type ConfiguredMonthlyProjection = {
  month: number;
  calendarMonth: number;
  revenueRub: number;
  netRevenueRub: number;
  opexRub: number;
  ebitdaRub: number;
  taxRub: number;
  depreciationRub: number;
  maintenanceCapexRub: number;
  operatingFreeCashFlowRub: number;
  cashFlowRub: number;
};

export type CurrentBaseReserveLine = {
  id: string;
  name: string;
  monthlyAmountRub: number;
};

/**
 * The Current Base Object has a distinct liquidity policy from the immutable
 * Historical Integrated Pilot.  It reserves six months of the governed
 * fixed/semi-fixed Current Base costs, excluding costs that are either
 * revenue-variable or financed by another launch line.
 */
export type CurrentBaseReserveProjection = {
  context: "current_base_object";
  policy: "six_months_current_base_fixed_and_semi_fixed_opex";
  scenarioId: InvestorScenarioId;
  months: number;
  monthlyBasisRub: number;
  includedLines: CurrentBaseReserveLine[];
  excludedLineIds: string[];
  prepaidCoverage: {
    monthlyRentRub: number;
    prepaidMonths: number;
    prepaidRentRub: number;
    reserveMonths: number;
    coveredRentMonths: number;
    uncoveredRentMonths: number;
    rentFreeMonths: number;
  };
  uncoveredRentRub: number;
  totalReserveRub: number;
};

export type ConfiguredEconomicsScenario = Omit<EconomicsScenario, "paybackMonth" | "irr"> & {
  paybackMonth: number | null;
  irr: number | null;
  context: FinancialProjectionContext;
  isConfigured: boolean;
  configurationComplete: boolean;
  premisesScenario: "rent" | "purchase";
  investmentBreakdown: InvestmentItem[];
  investmentGroups: InvestmentGroup[];
  cashFlows: number[];
  /**
   * Read-only presentation of the monthly sequence already produced by the
   * Financial Model. Network planning consumes this instead of reproducing
   * base-object revenue, OPEX or tax calculations.
   */
  monthlyProjection: ConfiguredMonthlyProjection[];
  /**
   * Present only for the Current Base context. The Historical Pilot keeps its
   * own immutable reserve in the generated historical projection.
   */
  currentBaseReserveProjection: CurrentBaseReserveProjection | null;
};

/**
 * Financial policy is derived from the governed generated Financial Model,
 * rather than copied into Network Planning or a browser component.
 */
export type ConfiguredFinancialPolicy = {
  taxRules: {
    regularUsnRate: number;
    minimumUsnRate: number;
  };
  maintenanceAnnualRate: number;
  discountRateAnnual: number;
  vatStatus: "current_baseline_requires_confirmation";
};

function calculationInputsEqual(left: InvestorConfiguration["launchBudget"], right: InvestorConfiguration["launchBudget"]) {
  return left.premisesScenario === right.premisesScenario
    && left.purchasePriceRub === right.purchasePriceRub
    && left.monthlyRentRub === right.monthlyRentRub
    && left.prepaymentMonths === right.prepaymentMonths
    && left.securityDepositMonths === right.securityDepositMonths
    && left.rentFreeMonths === right.rentFreeMonths
    && left.totalAreaM2 === right.totalAreaM2
    && left.kitchenAreaM2 === right.kitchenAreaM2
    && left.guestAreaM2 === right.guestAreaM2
    && left.seatingProfileId === right.seatingProfileId
    && left.furnitureProfileId === right.furnitureProfileId
    && left.equipmentScenarioId === right.equipmentScenarioId
    && left.barEnabled === right.barEnabled
    && left.growEnabled === right.growEnabled
    && left.preparationMode === right.preparationMode
    && left.preparationManualRub === right.preparationManualRub
    && left.preparationEnabledCategoryIds.join("|") === right.preparationEnabledCategoryIds.join("|")
    && left.operatingExpenseMode === right.operatingExpenseMode
    && left.customMonthlyOpexRub === right.customMonthlyOpexRub
    && left.operatingReserveMonths === right.operatingReserveMonths
    && left.contingencyPercent === right.contingencyPercent;
}

function historicalIntegratedPilotLaunchBudgetState() {
  return historicalIntegratedPilotConfiguration().launchBudget;
}

function keepsGeneratedFinancialRentCashRules(configuration: InvestorConfiguration, master: FinancialScenario) {
  const defaults = defaultLaunchBudgetState();
  const state = configuration.launchBudget;
  return state.premisesScenario === "rent"
    && state.monthlyRentRub === master.rent_rub
    && state.prepaymentMonths === defaults.prepaymentMonths
    && state.rentFreeMonths === 0;
}

function referenceRates(master: FinancialScenario) {
  const detail = master.monthly_detailed.find((row) => row.taxable_base_management_proxy_rub > 0 && row.regular_usn_rub > 0);
  const minimum = master.monthly_detailed.find((row) => row.net_revenue_rub > 0 && row.minimum_usn_rub > 0);
  if (!detail || !minimum || master.raw_materials_rub <= 0 || master.gross_revenue_rub <= 0) {
    throw new Error("Configured economics cannot derive the canonical financial calculation rules.");
  }
  return {
    rawWasteRate: master.waste_rub / master.raw_materials_rub,
    packagingRate: master.packaging_rub / master.gross_revenue_rub,
    acquiringRate: master.acquiring_rub / master.gross_revenue_rub,
    aggregatorRate: master.aggregator_rub / master.gross_revenue_rub,
    regularUsnRate: detail.regular_usn_rub / detail.taxable_base_management_proxy_rub,
    minimumUsnRate: minimum.minimum_usn_rub / minimum.net_revenue_rub,
    cashPayrollRub: master.staffing.payroll_rub + master.staffing.employer_contributions_rub,
  };
}

export function configuredFinancialPolicy(id: InvestorScenarioId): ConfiguredFinancialPolicy {
  const master = financialProjection.scenarios.rent[id];
  const rates = referenceRates(master);
  const maintenanceBasisRub = master.capex.equipment_rub + master.capex.furniture_rub;
  if (maintenanceBasisRub <= 0) throw new Error("Configured economics cannot derive the canonical maintenance basis.");
  return {
    taxRules: {
      regularUsnRate: rates.regularUsnRate,
      minimumUsnRate: rates.minimumUsnRate,
    },
    maintenanceAnnualRate: master.maintenance_capex_rub * 12 / maintenanceBasisRub,
    discountRateAnnual: investorSummary.assumptions.discount_rate,
    vatStatus: "current_baseline_requires_confirmation",
  };
}

function calculateConfiguredRentMonth(
  row: MonthlyCalculationRow,
  master: FinancialScenario,
  configuredRentRub: number,
  prepaidMonths: number,
  rentFreeMonths: number,
) {
  const rates = referenceRates(master);
  const baseRentRub = master.rent_rub;
  const monthlyRentRub = row.month <= rentFreeMonths ? 0 : configuredRentRub;
  const rentDeltaRub = monthlyRentRub - baseRentRub;
  const wasteRub = row.raw_materials_rub * rates.rawWasteRate;
  const packagingRub = row.gross_revenue_rub * rates.packagingRate;
  const acquiringRub = row.gross_revenue_rub * rates.acquiringRate;
  const aggregatorRub = row.gross_revenue_rub * rates.aggregatorRate;
  const maintenanceCapexRub = row.ebitda_rub - row.tax_due_rub - row.operating_free_cash_flow_rub;
  const ebitdaRub = row.ebitda_rub - rentDeltaRub;
  const financial = calculateFinancialMonthlyResult(
    ebitdaRub,
    row.net_revenue_rub,
    row.raw_materials_rub + wasteRub + packagingRub + rates.cashPayrollRub + monthlyRentRub
      + acquiringRub + aggregatorRub + row.administrative_reserve_rub + row.marketing_rub
      + row.household_rub + master.fixed_opex_without_labor_rent_rub,
    maintenanceCapexRub,
    rates,
  );
  // Prepayment remains a Month 0 financing item. When a rent-free period
  // precedes occupancy, the already-paid months start only after that period;
  // this avoids booking the benefit both as zero rent and as a cash release.
  const prepaidRentReleaseRub = row.month > rentFreeMonths && row.month <= rentFreeMonths + prepaidMonths
    ? configuredRentRub
    : 0;
  return {
    grossRevenueRub: round(row.gross_revenue_rub),
    netRevenueRub: round(row.net_revenue_rub),
    ebitdaRub: round(ebitdaRub),
    taxRub: round(financial.taxRub),
    depreciationRub: round(master.depreciation_rub),
    maintenanceCapexRub: round(maintenanceCapexRub),
    operatingFreeCashFlowRub: round(financial.freeCashFlowRub),
    netCashFlowRub: round(financial.freeCashFlowRub + prepaidRentReleaseRub),
  };
}

/**
 * The generated Financial Model is still the authority for all assumptions.
 * This adapter only replays its current scenario structure when an investor
 * enters a traffic value between the three generated canonical scenarios.
 * Staffing remains that of the selected canonical scenario: changing team
 * design is deliberately outside this UI control.
 */
function calculateCustomTrafficMonth(
  row: MonthlyCalculationRow,
  master: FinancialScenario,
  configuredRentRub: number,
  prepaidMonths: number,
  rentFreeMonths: number,
  customChecksPerDay: number,
) {
  const rates = referenceRates(master);
  const trafficFactor = customChecksPerDay / master.checks_per_day;
  const grossRevenueRub = row.gross_revenue_rub * trafficFactor;
  const netRevenueRub = row.net_revenue_rub * trafficFactor;
  const rawMaterialsRub = row.raw_materials_rub * trafficFactor;
  const wasteRub = rawMaterialsRub * rates.rawWasteRate;
  const packagingRub = grossRevenueRub * rates.packagingRate;
  const acquiringRub = grossRevenueRub * rates.acquiringRate;
  const aggregatorRub = grossRevenueRub * rates.aggregatorRate;
  const administrativeReserveRub = row.administrative_reserve_rub * trafficFactor;
  const marketingFormula = master.marketing_formula;
  const marketingRub = row.month <= marketingFormula.ramp_up_floor_months
    ? Math.max(marketingFormula.fixed_amount_rub + netRevenueRub * marketingFormula.rate_of_net_revenue, marketingFormula.ramp_up_floor_rub)
    : marketingFormula.fixed_amount_rub + netRevenueRub * marketingFormula.rate_of_net_revenue;
  const householdFormula = master.household_formula;
  const householdRub = householdFormula.fixed_amount_rub
    + householdFormula.variable_amount_rub * (grossRevenueRub / master.gross_revenue_rub);
  const laborRub = row.labor_rub;
  const monthlyRentRub = row.month <= rentFreeMonths ? 0 : configuredRentRub;
  const ebitdaRub = netRevenueRub - rawMaterialsRub - wasteRub - packagingRub - laborRub - monthlyRentRub
    - acquiringRub - aggregatorRub - administrativeReserveRub - marketingRub - householdRub
    - master.fixed_opex_without_labor_rent_rub;
  const maintenanceCapexRub = row.ebitda_rub - row.tax_due_rub - row.operating_free_cash_flow_rub;
  const financial = calculateFinancialMonthlyResult(
    ebitdaRub,
    netRevenueRub,
    rawMaterialsRub + wasteRub + packagingRub + rates.cashPayrollRub + monthlyRentRub
      + acquiringRub + aggregatorRub + administrativeReserveRub + marketingRub + householdRub
      + master.fixed_opex_without_labor_rent_rub,
    maintenanceCapexRub,
    rates,
  );
  const prepaidRentReleaseRub = row.month > rentFreeMonths && row.month <= rentFreeMonths + prepaidMonths
    ? configuredRentRub
    : 0;
  return {
    grossRevenueRub: round(grossRevenueRub),
    netRevenueRub: round(netRevenueRub),
    rawMaterialsRub: round(rawMaterialsRub),
    wasteRub: round(wasteRub),
    packagingRub: round(packagingRub),
    laborRub: round(laborRub),
    acquiringRub: round(acquiringRub),
    aggregatorRub: round(aggregatorRub),
    administrativeReserveRub: round(administrativeReserveRub),
    marketingRub: round(marketingRub),
    householdRub: round(householdRub),
    ebitdaRub: round(ebitdaRub),
    taxRub: round(financial.taxRub),
    depreciationRub: round(master.depreciation_rub),
    maintenanceCapexRub: round(maintenanceCapexRub),
    operatingFreeCashFlowRub: round(financial.freeCashFlowRub),
    netCashFlowRub: round(financial.freeCashFlowRub + prepaidRentReleaseRub),
  };
}

function configuredInvestmentBreakdown(configuration: InvestorConfiguration, capital: ReturnType<typeof calculateLaunchBudget>) {
  const launchBudget = configuration.launchBudget;
  const prepaymentRub = launchBudget.premisesScenario === "rent" && launchBudget.monthlyRentRub !== null
    ? launchBudget.monthlyRentRub * launchBudget.prepaymentMonths
    : 0;
  const depositRub = launchBudget.premisesScenario === "rent" && launchBudget.monthlyRentRub !== null
    ? launchBudget.monthlyRentRub * launchBudget.securityDepositMonths
    : 0;
  const groupByKey: Record<string, string> = {
    equipment: "creation",
    furniture: "creation",
    preparation: "creation",
    video: "creation",
    alarm: "creation",
    uniform: "launch",
    launch_marketing: "launch",
    contingency: "launch",
    inventory: "tied",
    prepaid_rent: "tied",
    security_deposit: "tied",
    property: "tied",
    operating_reserve: "reserve",
  };
  const canonicalLaunchItemKey: Record<string, string> = {
    initial_uniform: "uniform",
    video_surveillance: "video",
    initial_inventory: "inventory",
  };
  const item = (key: string, name: string, amount_rub: number): InvestmentItem => ({
    key,
    group: groupByKey[key] ?? "launch",
    name,
    amount_rub,
  });
  const rows: InvestmentItem[] = [
    item("equipment", "Оборудование", capital.equipment.total),
    item("furniture", "Мебель", capital.furnitureRub ?? 0),
    item("preparation", "Подготовка помещения", capital.effectivePreparationRub ?? 0),
    ...capital.launchItems.map((launchItem) => item(
      canonicalLaunchItemKey[launchItem.id] ?? launchItem.id,
      launchItem.name,
      launchItem.amountRub,
    )),
    item("contingency", "Резерв запуска", capital.contingencyRub),
    ...(launchBudget.premisesScenario === "purchase"
      ? [item("property", "Покупка помещения", launchBudget.purchasePriceRub ?? 0)]
      : [
          item("prepaid_rent", "Предоплата аренды", prepaymentRub),
          item("security_deposit", "Обеспечительный платёж", depositRub),
        ]),
    item("operating_reserve", "Операционный запас", capital.operatingReserveRub ?? 0),
  ];
  return rows.filter((item) => item.amount_rub !== 0);
}

function configuredInvestmentGroups(items: InvestmentItem[]) {
  const group = (key: string, name: string, keys: string[]): InvestmentGroup => {
    const groupItems = items.filter((item) => keys.includes(item.key));
    const canonicalGroup = economicsData.investments.groups.find((item) => item.key === key);
    return {
      key,
      name,
      note: canonicalGroup?.note ?? "",
      amount_rub: sum(groupItems.map((item) => item.amount_rub)),
      items: groupItems.map(({ key: itemKey, name: itemName, amount_rub }) => ({ key: itemKey, name: itemName, amount_rub })),
    };
  };
  return [
    group("creation", "Создание объекта", ["equipment", "furniture", "preparation", "video", "alarm"]),
    group("launch", "Запуск", ["launch_marketing", "uniform", "contingency"]),
    group("tied", "Связанные средства", ["property", "inventory", "prepaid_rent", "security_deposit"]),
    group("reserve", "Операционный запас", ["operating_reserve"]),
  ].filter((item) => item.amount_rub !== 0);
}

function canonicalScenario(id: InvestorScenarioId) {
  return economicsData.scenariosById[id];
}

function historicalScenarioLaunchFinancials(id: InvestorScenarioId) {
  const master = financialProjection.scenarios.rent[id];
  const monthlyScenarioOpexRub = master.marketing_rub + master.household_rub;
  return {
    ...launchFinancials,
    scenarioId: id,
    operatingReserveRub: master.fixed_opex_reserve_rub,
    monthlyReserveBaseRub: master.fixed_opex_reserve_rub / launchFinancials.reserveMonths,
    monthlyFixedOpexRub: master.fixed_opex_without_labor_rent_rub,
    monthlyScenarioOpexRub,
    monthlyLaborRub: master.calculated_staffing_labor_rub,
    restaurantInvestedCapitalRub: master.restaurant_invested_capital_rub,
  };
}

const currentBaseReserveFixedOpexLines = [
  ["UTILITIES", "Коммунальные услуги"],
  ["EQUIPMENT_SERVICE", "Обслуживание оборудования"],
  ["ACCOUNTING", "Бухгалтерия"],
  ["VENT_GREASE", "Вентиляция и жироуловитель"],
  ["UNIFORM_RENEWAL", "Обновление формы"],
  ["MUSIC_RIGHTS", "Музыкальное сопровождение"],
  ["PEST", "Дератизация и дезинсекция"],
  ["YUMA", "YUMA / ПО"],
  ["MEDICAL", "Медицинские расходы"],
  ["SECURITY_MONITORING", "Охранный мониторинг"],
  ["BANKING", "Банковское обслуживание (TBD)"],
  ["OTHER", "Прочие операционные расходы"],
] as const;

const currentBaseReserveExcludedLineIds = [
  "raw_materials",
  "waste",
  "consumer_packaging",
  "acquiring",
  "aggregator_commission",
  "administrative_reserve",
  "depreciation",
  "maintenance_capex",
  "income_tax",
  "equipment_purchase",
  "preparation",
  "security_deposit",
  "prepaid_rent",
  "initial_inventory",
];

/**
 * Builds the Current Base reserve directly from the Current Base P&L inputs.
 * In particular it uses the protected labour basis (`labor_rub`), not the
 * Historical Pilot's calculated staffing labour used by its legacy reserve.
 */
export function currentBaseReserveProjection(
  configuration: InvestorConfiguration,
  id: InvestorScenarioId = configuration.scenarioId,
): CurrentBaseReserveProjection | null {
  if (financialProjectionContextForConfiguration(configuration) !== "current_base_object") return null;
  if (configuration.launchBudget.operatingExpenseMode !== "baseline") return null;

  const master = financialProjection.scenarios.rent[id];
  const opexEntries = master.opex_entries_rub as Record<string, number>;
  const reserveMonths = configuration.launchBudget.operatingReserveMonths;
  const monthlyRentRub = configuration.launchBudget.premisesScenario === "rent"
    ? configuration.launchBudget.monthlyRentRub ?? master.rent_rub
    : 0;
  const prepaidMonths = configuration.launchBudget.premisesScenario === "rent"
    ? configuration.launchBudget.prepaymentMonths
    : 0;
  const uncoveredRentMonths = Math.max(0, reserveMonths - prepaidMonths);
  const uncoveredRentRub = round(monthlyRentRub * uncoveredRentMonths);
  const includedLines: CurrentBaseReserveLine[] = [
    { id: "labor", name: "Персонал Current Base", monthlyAmountRub: master.labor_rub },
    ...currentBaseReserveFixedOpexLines.map(([lineId, name]) => ({
      id: lineId.toLowerCase(),
      name,
      monthlyAmountRub: opexEntries[lineId] ?? 0,
    })),
    { id: "marketing", name: "Маркетинг зрелого месяца", monthlyAmountRub: master.marketing_rub },
    { id: "household", name: "Хозяйственные расходы", monthlyAmountRub: master.household_rub },
    {
      id: "uncovered_rent",
      name: "Непокрытая арендная плата",
      monthlyAmountRub: reserveMonths === 0 ? 0 : round(uncoveredRentRub / reserveMonths),
    },
  ];
  const fixedAndSemiFixedMonthlyRub = sum(includedLines
    .filter((line) => line.id !== "uncovered_rent")
    .map((line) => line.monthlyAmountRub));
  const totalReserveRub = round(fixedAndSemiFixedMonthlyRub * reserveMonths + uncoveredRentRub);

  return {
    context: "current_base_object",
    policy: "six_months_current_base_fixed_and_semi_fixed_opex",
    scenarioId: id,
    months: reserveMonths,
    monthlyBasisRub: reserveMonths === 0 ? 0 : round(totalReserveRub / reserveMonths),
    includedLines,
    excludedLineIds: currentBaseReserveExcludedLineIds,
    prepaidCoverage: {
      monthlyRentRub,
      prepaidMonths,
      prepaidRentRub: round(monthlyRentRub * prepaidMonths),
      reserveMonths,
      coveredRentMonths: Math.min(reserveMonths, prepaidMonths),
      uncoveredRentMonths,
      rentFreeMonths: configuration.launchBudget.rentFreeMonths,
    },
    uncoveredRentRub,
    totalReserveRub,
  };
}

function launchFinancialsForConfiguration(
  id: InvestorScenarioId,
  reserve: CurrentBaseReserveProjection | null,
) {
  const historical = historicalScenarioLaunchFinancials(id);
  if (!reserve) return historical;
  return {
    ...historical,
    reserveMonths: reserve.months,
    operatingReserveRub: reserve.totalReserveRub,
    monthlyReserveBaseRub: reserve.monthlyBasisRub,
    monthlyFixedOpexRub: sum(reserve.includedLines
      .filter((line) => line.id !== "labor" && line.id !== "marketing" && line.id !== "household" && line.id !== "uncovered_rent")
      .map((line) => line.monthlyAmountRub)),
    monthlyScenarioOpexRub: sum(reserve.includedLines
      .filter((line) => line.id === "marketing" || line.id === "household")
      .map((line) => line.monthlyAmountRub)),
    monthlyLaborRub: reserve.includedLines.find((line) => line.id === "labor")?.monthlyAmountRub ?? 0,
  };
}

function generatedMonthlyProjection(master: FinancialScenario): ConfiguredMonthlyProjection[] {
  return master.monthly.map((row, index) => {
    const detail = master.monthly_detailed[index];
    return {
      month: row.month,
      calendarMonth: row.calendar_month,
      revenueRub: row.gross_revenue_rub,
      netRevenueRub: detail?.net_revenue_rub ?? row.net_revenue_rub,
      opexRub: round(row.gross_revenue_rub - row.ebitda_rub),
      ebitdaRub: row.ebitda_rub,
      taxRub: row.tax_due_rub,
      depreciationRub: detail?.depreciation_rub ?? 0,
      maintenanceCapexRub: detail?.maintenance_capex_rub ?? round(row.ebitda_rub - row.tax_due_rub - row.operating_free_cash_flow_rub),
      operatingFreeCashFlowRub: row.operating_free_cash_flow_rub,
      cashFlowRub: row.net_cash_flow_rub,
    };
  });
}

function calculatedMonthlyProjection(rows: Array<{
  grossRevenueRub?: number;
  netRevenueRub?: number;
  ebitdaRub: number;
  taxRub?: number;
  depreciationRub?: number;
  maintenanceCapexRub?: number;
  operatingFreeCashFlowRub?: number;
  netCashFlowRub: number;
}>, source: FinancialScenario): ConfiguredMonthlyProjection[] {
  return rows.map((row, index) => {
    const detailed = source.monthly_detailed[index];
    const revenueRub = row.grossRevenueRub ?? source.monthly[index]?.gross_revenue_rub ?? 0;
    const taxRub = row.taxRub ?? source.monthly[index]?.tax_due_rub ?? 0;
    const maintenanceCapexRub = row.maintenanceCapexRub
      ?? detailed?.maintenance_capex_rub
      ?? round(row.ebitdaRub - taxRub - (row.operatingFreeCashFlowRub ?? source.monthly[index]?.operating_free_cash_flow_rub ?? 0));
    return {
      month: source.monthly[index]?.month ?? index + 1,
      calendarMonth: source.monthly[index]?.calendar_month ?? index % 12 + 1,
      revenueRub,
      netRevenueRub: row.netRevenueRub ?? detailed?.net_revenue_rub ?? source.monthly[index]?.net_revenue_rub ?? revenueRub,
      opexRub: round(revenueRub - row.ebitdaRub),
      ebitdaRub: row.ebitdaRub,
      taxRub,
      depreciationRub: row.depreciationRub ?? detailed?.depreciation_rub ?? 0,
      maintenanceCapexRub,
      operatingFreeCashFlowRub: row.operatingFreeCashFlowRub ?? source.monthly[index]?.operating_free_cash_flow_rub ?? row.ebitdaRub - taxRub - maintenanceCapexRub,
      cashFlowRub: row.netCashFlowRub,
    };
  });
}

export function configuredEconomicsScenario(configuration: InvestorConfiguration, id: InvestorScenarioId = configuration.scenarioId): ConfiguredEconomicsScenario {
  const canonical = canonicalScenario(id);
  const context = financialProjectionContextForConfiguration(configuration);
  const reserveProjection = currentBaseReserveProjection(configuration, id);
  const capital = calculateLaunchBudget(configuration.launchBudget, undefined, launchFinancialsForConfiguration(id, reserveProjection));
  const hasCustomTraffic = configuration.customChecksPerDay !== null;
  const masterRentScenario = financialProjection.scenarios.rent[id];
  const isConfigured = hasCustomTraffic || !calculationInputsEqual(configuration.launchBudget, baseObjectLaunchBudgetState());
  const usesHistoricalGeneratedProjection = !hasCustomTraffic
    && calculationInputsEqual(configuration.launchBudget, historicalIntegratedPilotLaunchBudgetState())
    && configuration.launchBudget.monthlyRentRub === masterRentScenario.rent_rub
    && configuration.launchBudget.rentFreeMonths === 0;
  const complete = capital.financingRequirementRub !== null && !capital.areaInvalid;

  if (usesHistoricalGeneratedProjection) {
    const master = financialProjection.scenarios.rent[id];
    return {
      ...canonical,
      context,
      isConfigured: false,
      configurationComplete: true,
      premisesScenario: "rent",
      investmentBreakdown: canonical.investmentBreakdown,
      investmentGroups: canonical.investmentGroups,
      cashFlows: master.restaurant_cash_flows,
      monthlyProjection: generatedMonthlyProjection(master),
      currentBaseReserveProjection: null,
    };
  }

  if (!complete || capital.financingRequirementRub === null) {
    return {
      ...canonical,
      context,
      isConfigured,
      configurationComplete: false,
      premisesScenario: configuration.launchBudget.premisesScenario,
      investmentBreakdown: configuredInvestmentBreakdown(configuration, capital),
      investmentGroups: configuredInvestmentGroups(configuredInvestmentBreakdown(configuration, capital)),
      cashFlows: [],
      monthlyProjection: [],
      currentBaseReserveProjection: reserveProjection,
    };
  }

  const isPurchase = configuration.launchBudget.premisesScenario === "purchase";
  const master = financialProjection.scenarios[isPurchase ? "purchase" : "rent"][id];
  const configuredCapitalRub = capital.financingRequirementRub;
  const investmentBreakdown = configuredInvestmentBreakdown(configuration, capital);
  const investmentGroups = configuredInvestmentGroups(investmentBreakdown);
  const discountRate = investorSummary.assumptions.discount_rate;
  const horizon = master.restaurant_cash_flows.length - 1;

  if (hasCustomTraffic) {
    const customChecksPerDay = configuration.customChecksPerDay!;
    const rentRub = isPurchase ? 0 : configuration.launchBudget.monthlyRentRub ?? master.rent_rub;
    const prepaidMonths = isPurchase ? 0 : configuration.launchBudget.prepaymentMonths;
    const monthlyRows = master.monthly.map((row) => calculateCustomTrafficMonth(
      row,
      master,
      rentRub,
      prepaidMonths,
      configuration.launchBudget.rentFreeMonths,
      customChecksPerDay,
    ));
    const matureRow: MonthlyCalculationRow = {
      month: Number.MAX_SAFE_INTEGER,
      gross_revenue_rub: master.gross_revenue_rub,
      net_revenue_rub: master.net_revenue_rub,
      raw_materials_rub: master.raw_materials_rub,
      labor_rub: master.labor_rub,
      administrative_reserve_rub: master.administrative_reserve_rub,
      marketing_rub: master.marketing_rub,
      household_rub: master.household_rub,
      ebitda_rub: master.ebitda_rub,
      tax_due_rub: master.tax_due_rub,
      operating_free_cash_flow_rub: master.operating_free_cash_flow_rub,
    };
    const mature = calculateCustomTrafficMonth(matureRow, master, rentRub, 0, 0, customChecksPerDay);
    const restaurantCashFlows = monthlyRows.map((row) => row.netCashFlowRub);
    const propertyExitRub = isPurchase
      ? master.combined_cash_flows[horizon] - master.restaurant_cash_flows[horizon]
      : 0;
    const cashFlows = [-configuredCapitalRub, ...restaurantCashFlows.map((cash, month) => (
      isPurchase && month === horizon - 1 ? round(cash + propertyExitRub) : cash
    ))];
    const year1 = monthlyRows.slice(0, 12);
    const matureYear = monthlyRows.slice(12, 24);
    const year1RevenueRub = sum(year1.map((row) => row.grossRevenueRub));
    const matureYearRevenueRub = sum(matureYear.map((row) => row.grossRevenueRub));
    const annualFcfRub = sum(matureYear.map((row) => row.operatingFreeCashFlowRub));
    const canonicalFixedCostsRub = master.calculated_staffing_labor_rub + master.rent_rub
      + master.fixed_opex_without_labor_rent_rub + master.marketing_formula.fixed_amount_rub + master.household_formula.fixed_amount_rub;
    const perCheckContributionRub = canonicalFixedCostsRub / master.break_even_checks_per_day / investorSummary.assumptions.days_per_month;
    const configuredBreakEvenChecks = (canonicalFixedCostsRub - master.rent_rub + rentRub) / perCheckContributionRub / investorSummary.assumptions.days_per_month;

    return {
      ...canonical,
      context,
      checksPerDay: customChecksPerDay,
      startInvestmentRub: configuredCapitalRub,
      salesPerMonthRub: mature.grossRevenueRub,
      ebitdaRub: mature.ebitdaRub,
      ebitdaMargin: mature.netRevenueRub === 0 ? 0 : mature.ebitdaRub / mature.netRevenueRub,
      freeCashFlowRub: mature.operatingFreeCashFlowRub,
      breakEvenChecksPerDay: round(configuredBreakEvenChecks, 2),
      paybackMonth: firstPaybackMonth(cashFlows),
      roi: annualFcfRub / configuredCapitalRub,
      irr: annualIrr(cashFlows),
      npvRub: round(presentValue(cashFlows, discountRate)),
      pnl: {
        ...canonical.pnl,
        salesRub: mature.grossRevenueRub,
        productCostRub: mature.rawMaterialsRub + mature.wasteRub + mature.packagingRub,
        rawMaterialsRub: mature.rawMaterialsRub,
        wasteRub: mature.wasteRub,
        packagingRub: mature.packagingRub,
        grossProfitRub: mature.netRevenueRub - mature.rawMaterialsRub - mature.wasteRub - mature.packagingRub,
        grossMargin: mature.netRevenueRub === 0 ? 0 : (mature.netRevenueRub - mature.rawMaterialsRub - mature.wasteRub - mature.packagingRub) / mature.netRevenueRub,
        personnelRub: mature.laborRub,
        premisesRub: rentRub,
        acquiringRub: mature.acquiringRub + mature.aggregatorRub,
        marketingRub: mature.marketingRub,
        householdRub: mature.householdRub,
        administrativeReserveRub: mature.administrativeReserveRub,
        ebitdaRub: mature.ebitdaRub,
        ebitdaMargin: mature.netRevenueRub === 0 ? 0 : mature.ebitdaRub / mature.netRevenueRub,
        taxRub: mature.taxRub,
        netOperatingResultRub: round(mature.ebitdaRub - master.depreciation_rub - mature.taxRub),
        freeCashFlowRub: mature.operatingFreeCashFlowRub,
      },
      year1: {
        salesRub: round(year1RevenueRub),
        ebitdaRub: round(sum(year1.map((row) => row.ebitdaRub))),
        ebitdaMargin: year1RevenueRub === 0 ? 0 : sum(year1.map((row) => row.ebitdaRub)) / year1RevenueRub,
        freeCashFlowRub: round(sum(year1.map((row) => row.operatingFreeCashFlowRub))),
      },
      matureYear: {
        salesRub: round(matureYearRevenueRub),
        ebitdaRub: round(sum(matureYear.map((row) => row.ebitdaRub))),
        freeCashFlowRub: round(annualFcfRub),
      },
      operatingReserveRub: capital.operatingReserveRub ?? canonical.operatingReserveRub,
      investmentBreakdown,
      investmentGroups,
      isConfigured: true,
      configurationComplete: true,
      premisesScenario: configuration.launchBudget.premisesScenario,
      cashFlows,
      monthlyProjection: calculatedMonthlyProjection(monthlyRows, master),
      currentBaseReserveProjection: reserveProjection,
    };
  }

  // Investment-only configuration must preserve the exact canonical operating cash-flow
  // sequence. Reusing it avoids recreating finance rounding in the browser adapter.
  if (!isPurchase && keepsGeneratedFinancialRentCashRules(configuration, master)) {
    const cashFlows = [-configuredCapitalRub, ...master.restaurant_cash_flows.slice(1)];
    return {
      ...canonical,
      context,
      startInvestmentRub: configuredCapitalRub,
      paybackMonth: firstPaybackMonth(cashFlows),
      roi: master.mature_year.free_cash_flow_rub / configuredCapitalRub,
      irr: annualIrr(cashFlows),
      npvRub: round(presentValue(cashFlows, discountRate)),
      operatingReserveRub: capital.operatingReserveRub ?? canonical.operatingReserveRub,
      investmentBreakdown,
      investmentGroups,
      isConfigured,
      configurationComplete: true,
      premisesScenario: "rent",
      cashFlows,
      monthlyProjection: generatedMonthlyProjection(master),
      currentBaseReserveProjection: reserveProjection,
    };
  }

  if (isPurchase) {
    const propertyDeltaRub = (configuration.launchBudget.purchasePriceRub ?? 0) - master.real_estate_investment_rub;
    const cashFlows = master.combined_cash_flows.map((cash, month) => {
      if (month === 0) return -configuredCapitalRub;
      if (month === horizon) return round(cash + propertyDeltaRub);
      return cash;
    });
    const annualFcfRub = master.mature_year.free_cash_flow_rub;
    return {
      ...canonical,
      context,
      startInvestmentRub: configuredCapitalRub,
      salesPerMonthRub: master.gross_revenue_rub,
      ebitdaRub: master.ebitda_rub,
      ebitdaMargin: master.ebitda_margin,
      freeCashFlowRub: master.operating_free_cash_flow_rub,
      breakEvenChecksPerDay: master.break_even_checks_per_day,
      paybackMonth: firstPaybackMonth(cashFlows),
      roi: annualFcfRub / configuredCapitalRub,
      irr: annualIrr(cashFlows),
      npvRub: round(presentValue(cashFlows, discountRate)),
      pnl: {
        ...canonical.pnl,
        premisesRub: master.rent_rub,
        ebitdaRub: master.ebitda_rub,
        ebitdaMargin: master.ebitda_margin,
        taxRub: master.tax_due_rub,
        netOperatingResultRub: master.net_operating_result_rub,
        freeCashFlowRub: master.operating_free_cash_flow_rub,
      },
      operatingReserveRub: capital.operatingReserveRub ?? canonical.operatingReserveRub,
      investmentBreakdown,
      investmentGroups,
      isConfigured,
      configurationComplete: true,
      premisesScenario: "purchase",
      cashFlows,
      monthlyProjection: generatedMonthlyProjection(master),
      currentBaseReserveProjection: reserveProjection,
    };
  }

  const rentRub = configuration.launchBudget.monthlyRentRub ?? master.rent_rub;
  const prepaidMonths = configuration.launchBudget.prepaymentMonths;
  const monthlyRows = master.monthly.map((row) => calculateConfiguredRentMonth(
    row,
    master,
    rentRub,
    prepaidMonths,
    configuration.launchBudget.rentFreeMonths,
  ));
  const cashFlows = [-configuredCapitalRub, ...monthlyRows.map((row) => row.netCashFlowRub)];
  const matureRow: MonthlyCalculationRow = {
    month: Number.MAX_SAFE_INTEGER,
    gross_revenue_rub: master.gross_revenue_rub,
    net_revenue_rub: master.net_revenue_rub,
    raw_materials_rub: master.raw_materials_rub,
    labor_rub: master.labor_rub,
    administrative_reserve_rub: master.administrative_reserve_rub,
    marketing_rub: master.marketing_rub,
    household_rub: master.household_rub,
    ebitda_rub: master.ebitda_rub,
    tax_due_rub: master.tax_due_rub,
    operating_free_cash_flow_rub: master.operating_free_cash_flow_rub,
  };
  const mature = calculateConfiguredRentMonth(matureRow, master, rentRub, 0, 0);
  const year1 = monthlyRows.slice(0, 12);
  const matureYear = monthlyRows.slice(12, 24);
  const year1RevenueRub = sum(master.monthly.slice(0, 12).map((row) => row.gross_revenue_rub));
  const matureYearRevenueRub = sum(master.monthly.slice(12, 24).map((row) => row.gross_revenue_rub));
  const annualFcfRub = sum(matureYear.map((row) => row.operatingFreeCashFlowRub));
  const canonicalFixedCostsRub = master.calculated_staffing_labor_rub + master.rent_rub
    + master.fixed_opex_without_labor_rent_rub + master.marketing_formula.fixed_amount_rub + master.household_formula.fixed_amount_rub;
  const perCheckContributionRub = canonicalFixedCostsRub / master.break_even_checks_per_day / investorSummary.assumptions.days_per_month;
  const configuredBreakEvenChecks = (canonicalFixedCostsRub - master.rent_rub + rentRub) / perCheckContributionRub / investorSummary.assumptions.days_per_month;
  const rentDeltaRub = rentRub - master.rent_rub;

  return {
    ...canonical,
    context,
    startInvestmentRub: configuredCapitalRub,
    ebitdaRub: mature.ebitdaRub,
    ebitdaMargin: mature.ebitdaRub / master.net_revenue_rub,
    freeCashFlowRub: mature.operatingFreeCashFlowRub,
    breakEvenChecksPerDay: round(configuredBreakEvenChecks, 2),
    paybackMonth: firstPaybackMonth(cashFlows),
    roi: annualFcfRub / configuredCapitalRub,
    irr: annualIrr(cashFlows),
    npvRub: round(presentValue(cashFlows, discountRate)),
    pnl: {
      ...canonical.pnl,
      premisesRub: rentRub,
      ebitdaRub: mature.ebitdaRub,
      ebitdaMargin: mature.ebitdaRub / master.net_revenue_rub,
      taxRub: mature.taxRub,
      netOperatingResultRub: round(mature.ebitdaRub - master.depreciation_rub - mature.taxRub),
      freeCashFlowRub: mature.operatingFreeCashFlowRub,
    },
    year1: {
      salesRub: round(year1RevenueRub),
      ebitdaRub: round(sum(year1.map((row) => row.ebitdaRub))),
      ebitdaMargin: year1RevenueRub === 0 ? 0 : sum(year1.map((row) => row.ebitdaRub)) / year1RevenueRub,
      freeCashFlowRub: round(sum(year1.map((row) => row.operatingFreeCashFlowRub))),
    },
    matureYear: {
      salesRub: round(matureYearRevenueRub),
      ebitdaRub: round(sum(matureYear.map((row) => row.ebitdaRub))),
      freeCashFlowRub: round(annualFcfRub),
    },
    operatingReserveRub: capital.operatingReserveRub ?? canonical.operatingReserveRub,
    investmentBreakdown,
    investmentGroups,
    isConfigured,
    configurationComplete: true,
    premisesScenario: "rent",
    cashFlows,
    monthlyProjection: calculatedMonthlyProjection(monthlyRows, master),
    currentBaseReserveProjection: reserveProjection,
  };
}

export function configuredEconomicsScenarios(configuration: InvestorConfiguration) {
  return (Object.keys(economicsData.scenariosById) as InvestorScenarioId[])
    .map((id) => configuredEconomicsScenario(configuration, id));
}
