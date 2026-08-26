import financialProjectionJson from "../../docs-platform/generated/financial-model-projection.json";
import investorSummaryJson from "../../docs-platform/generated/investor-financial-summary.json";
import { economicsData, type EconomicsScenario } from "./economics";
import { calculateLaunchBudget, defaultLaunchBudgetState, launchModel } from "./launch-budget";
import { launchFinancials } from "./launch-financials";
import { baseObjectLaunchBudgetState, type InvestorConfiguration, type InvestorScenarioId } from "./investor-configuration";

const financialProjection = financialProjectionJson;
const investorSummary = investorSummaryJson;

type FinancialScenario = (typeof financialProjection.scenarios.rent)[InvestorScenarioId]
  | (typeof financialProjection.scenarios.purchase)[InvestorScenarioId];
type MonthlyRow = FinancialScenario["monthly"][number];

type InvestmentItem = EconomicsScenario["investmentBreakdown"][number];
type InvestmentGroup = EconomicsScenario["investmentGroups"][number];

export type ConfiguredMonthlyProjection = {
  month: number;
  calendarMonth: number;
  revenueRub: number;
  opexRub: number;
  cashFlowRub: number;
};

export type ConfiguredEconomicsScenario = Omit<EconomicsScenario, "paybackMonth" | "irr"> & {
  paybackMonth: number | null;
  irr: number | null;
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
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function firstPaybackMonth(cashFlows: number[]) {
  let cumulative = 0;
  for (let month = 0; month < cashFlows.length; month += 1) {
    cumulative += cashFlows[month];
    if (cumulative >= 0) return month;
  }
  return null;
}

function presentValue(cashFlows: number[], annualDiscountRate: number) {
  const monthlyRate = (1 + annualDiscountRate) ** (1 / 12) - 1;
  return cashFlows.reduce((value, cash, month) => value + cash / ((1 + monthlyRate) ** month), 0);
}

function monthlyIrr(cashFlows: number[]) {
  const npv = (rate: number) => cashFlows.reduce((value, cash, index) => value + cash / ((1 + rate) ** index), 0);
  let low = -0.9999;
  let high = 10;
  let lowValue = npv(low);
  const highValue = npv(high);
  if (lowValue === 0) return low;
  if (highValue === 0) return high;
  if (lowValue * highValue > 0) return null;
  for (let iteration = 0; iteration < 300; iteration += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-7) return mid;
    if (lowValue * value <= 0) {
      high = mid;
    } else {
      low = mid;
      lowValue = value;
    }
  }
  return (low + high) / 2;
}

function annualIrr(cashFlows: number[]) {
  const monthly = monthlyIrr(cashFlows);
  return monthly === null ? null : (1 + monthly) ** 12 - 1;
}

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

function canonicalLaunchBudgetState() {
  const defaults = baseObjectLaunchBudgetState();
  return {
    ...defaults,
    // The master Financial Model continues to represent the fully prepared
    // premises. The investor runtime default may exclude already-existing work.
    preparationEnabledCategoryIds: launchModel.preparation.categories
      .filter((category) => category.enabled_by_default)
      .map((category) => category.id),
  };
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

function calculateConfiguredRentMonth(
  row: MonthlyRow,
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
  const taxableBaseRub = Math.max(
    row.net_revenue_rub - (
      row.raw_materials_rub + wasteRub + packagingRub + rates.cashPayrollRub + monthlyRentRub
      + acquiringRub + aggregatorRub + row.administrative_reserve_rub + row.marketing_rub
      + row.household_rub + master.fixed_opex_without_labor_rent_rub
    ),
    0,
  );
  const taxRub = Math.max(taxableBaseRub * rates.regularUsnRate, row.net_revenue_rub * rates.minimumUsnRate);
  const maintenanceCapexRub = row.ebitda_rub - row.tax_due_rub - row.operating_free_cash_flow_rub;
  const ebitdaRub = row.ebitda_rub - rentDeltaRub;
  const operatingFreeCashFlowRub = ebitdaRub - taxRub - maintenanceCapexRub;
  // Prepayment remains a Month 0 financing item. When a rent-free period
  // precedes occupancy, the already-paid months start only after that period;
  // this avoids booking the benefit both as zero rent and as a cash release.
  const prepaidRentReleaseRub = row.month > rentFreeMonths && row.month <= rentFreeMonths + prepaidMonths
    ? configuredRentRub
    : 0;
  return {
    ebitdaRub: round(ebitdaRub),
    taxRub: round(taxRub),
    operatingFreeCashFlowRub: round(operatingFreeCashFlowRub),
    netCashFlowRub: round(operatingFreeCashFlowRub + prepaidRentReleaseRub),
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
  row: MonthlyRow,
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
  const taxableBaseRub = Math.max(
    netRevenueRub - (
      rawMaterialsRub + wasteRub + packagingRub + rates.cashPayrollRub + monthlyRentRub
      + acquiringRub + aggregatorRub + administrativeReserveRub + marketingRub + householdRub
      + master.fixed_opex_without_labor_rent_rub
    ),
    0,
  );
  const taxRub = Math.max(taxableBaseRub * rates.regularUsnRate, netRevenueRub * rates.minimumUsnRate);
  const maintenanceCapexRub = row.ebitda_rub - row.tax_due_rub - row.operating_free_cash_flow_rub;
  const operatingFreeCashFlowRub = ebitdaRub - taxRub - maintenanceCapexRub;
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
    taxRub: round(taxRub),
    operatingFreeCashFlowRub: round(operatingFreeCashFlowRub),
    netCashFlowRub: round(operatingFreeCashFlowRub + prepaidRentReleaseRub),
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

function scenarioLaunchFinancials(id: InvestorScenarioId) {
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

function generatedMonthlyProjection(master: FinancialScenario): ConfiguredMonthlyProjection[] {
  return master.monthly.map((row) => ({
    month: row.month,
    calendarMonth: row.calendar_month,
    revenueRub: row.gross_revenue_rub,
    opexRub: round(row.gross_revenue_rub - row.ebitda_rub),
    cashFlowRub: row.net_cash_flow_rub,
  }));
}

function calculatedMonthlyProjection(rows: Array<{
  grossRevenueRub?: number;
  ebitdaRub: number;
  netCashFlowRub: number;
}>, source: FinancialScenario): ConfiguredMonthlyProjection[] {
  return rows.map((row, index) => ({
    month: source.monthly[index]?.month ?? index + 1,
    calendarMonth: source.monthly[index]?.calendar_month ?? index % 12 + 1,
    revenueRub: row.grossRevenueRub ?? source.monthly[index]?.gross_revenue_rub ?? 0,
    opexRub: round((row.grossRevenueRub ?? source.monthly[index]?.gross_revenue_rub ?? 0) - row.ebitdaRub),
    cashFlowRub: row.netCashFlowRub,
  }));
}

export function configuredEconomicsScenario(configuration: InvestorConfiguration, id: InvestorScenarioId = configuration.scenarioId): ConfiguredEconomicsScenario {
  const canonical = canonicalScenario(id);
  const capital = calculateLaunchBudget(configuration.launchBudget, undefined, scenarioLaunchFinancials(id));
  const hasCustomTraffic = configuration.customChecksPerDay !== null;
  const masterRentScenario = financialProjection.scenarios.rent[id];
  const isConfigured = hasCustomTraffic || !calculationInputsEqual(configuration.launchBudget, baseObjectLaunchBudgetState());
  const usesCanonicalProjection = !hasCustomTraffic
    && calculationInputsEqual(configuration.launchBudget, canonicalLaunchBudgetState())
    && configuration.launchBudget.monthlyRentRub === masterRentScenario.rent_rub
    && configuration.launchBudget.rentFreeMonths === 0;
  const complete = capital.financingRequirementRub !== null && !capital.areaInvalid;

  if (usesCanonicalProjection) {
    const master = financialProjection.scenarios.rent[id];
    return {
      ...canonical,
      isConfigured: false,
      configurationComplete: true,
      premisesScenario: "rent",
      investmentBreakdown: canonical.investmentBreakdown,
      investmentGroups: canonical.investmentGroups,
      cashFlows: master.restaurant_cash_flows,
      monthlyProjection: generatedMonthlyProjection(master),
    };
  }

  if (!complete || capital.financingRequirementRub === null) {
    return {
      ...canonical,
      isConfigured,
      configurationComplete: false,
      premisesScenario: configuration.launchBudget.premisesScenario,
      investmentBreakdown: configuredInvestmentBreakdown(configuration, capital),
      investmentGroups: configuredInvestmentGroups(configuredInvestmentBreakdown(configuration, capital)),
      cashFlows: [],
      monthlyProjection: [],
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
    const matureRow = {
      month: Number.MAX_SAFE_INTEGER,
      gross_revenue_rub: master.gross_revenue_rub,
      net_revenue_rub: master.net_revenue_rub,
      raw_materials_rub: master.raw_materials_rub,
      labor_rub: master.labor_rub,
      administrative_reserve_rub: master.administrative_reserve_rub,
      ebitda_rub: master.ebitda_rub,
      tax_due_rub: master.tax_due_rub,
      operating_free_cash_flow_rub: master.operating_free_cash_flow_rub,
    } as MonthlyRow;
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
    };
  }

  // Investment-only configuration must preserve the exact canonical operating cash-flow
  // sequence. Reusing it avoids recreating finance rounding in the browser adapter.
  if (!isPurchase && keepsGeneratedFinancialRentCashRules(configuration, master)) {
    const cashFlows = [-configuredCapitalRub, ...master.restaurant_cash_flows.slice(1)];
    return {
      ...canonical,
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
  const matureRow = {
    month: Number.MAX_SAFE_INTEGER,
    gross_revenue_rub: master.gross_revenue_rub,
    net_revenue_rub: master.net_revenue_rub,
    raw_materials_rub: master.raw_materials_rub,
    administrative_reserve_rub: master.administrative_reserve_rub,
    marketing_rub: master.marketing_rub,
    household_rub: master.household_rub,
    ebitda_rub: master.ebitda_rub,
    tax_due_rub: master.tax_due_rub,
    operating_free_cash_flow_rub: master.operating_free_cash_flow_rub,
  } as MonthlyRow;
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
  };
}

export function configuredEconomicsScenarios(configuration: InvestorConfiguration) {
  return (Object.keys(economicsData.scenariosById) as InvestorScenarioId[])
    .map((id) => configuredEconomicsScenario(configuration, id));
}
