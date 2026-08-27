/**
 * Pure financial primitives shared by the historical Financial Model adapter,
 * the Current Base Object and the Network projection.  This module deliberately
 * contains no browser state, CAPEX catalogue or planning values: those remain
 * governed inputs owned by their source models.
 */

export const financialProjectionContextIds = [
  "historical_integrated_pilot",
  "current_base_object",
  "network_expansion",
  "consolidated_network",
] as const;

export type FinancialProjectionContext = (typeof financialProjectionContextIds)[number];

export type FinancialCoverageStatus = "complete" | "partial" | "invalid";

/**
 * A coverage caveat belongs to a specific layer.  A missing wash-kit price,
 * for example, is not the same failure as an invalid revenue input or an
 * unconfirmed VAT assumption.  Consumers can therefore keep showing a
 * calculated known basis without labelling it as fully investor-ready.
 */
export type FinancialCoverageDimension = "calculation" | "pricing" | "assumptions" | "capacity";
export type FinancialPricingCoverageStatus = "complete" | "partial";
export type FinancialAssumptionCoverageStatus = "confirmed" | "planning" | "requires_confirmation";
export type FinancialCapacityCoverageStatus = "covered" | "review_required" | "exceeded";

export type FinancialCoverageIssue = {
  id: string;
  category: "unpriced_capex" | "unresolved_recurring_opex" | "capacity" | "tax_assumption" | "exclusion" | "invalid_input";
  message: string;
  material: boolean;
  /** Defaults from category for legacy callers; new callers should be explicit. */
  dimension?: FinancialCoverageDimension;
  /** Used only for an assumption disclosure. */
  assumptionStatus?: Exclude<FinancialAssumptionCoverageStatus, "confirmed">;
  /** Used only for a capacity disclosure. */
  capacityStatus?: Exclude<FinancialCapacityCoverageStatus, "covered">;
};

export type FinancialCoverage = {
  /** Calculation availability. `complete` means all formulas have known inputs. */
  status: FinancialCoverageStatus;
  calculation: FinancialCoverageStatus;
  pricing: FinancialPricingCoverageStatus;
  assumptions: FinancialAssumptionCoverageStatus;
  capacity: FinancialCapacityCoverageStatus;
  /** A complete calculation can still need investor-facing disclosure. */
  hasCaveats: boolean;
  issues: FinancialCoverageIssue[];
};

export type FinancialTaxRules = {
  regularUsnRate: number;
  minimumUsnRate: number;
};

export type FinancialTaxResult = {
  taxableBaseRub: number;
  regularUsnRub: number;
  minimumUsnRub: number;
  taxRub: number;
};

export type FinancialMonthlyResult = FinancialTaxResult & {
  ebitdaRub: number;
  maintenanceCapexRub: number;
  freeCashFlowRub: number;
};

export function roundFinancial(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function sumFinancial(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * The current management proxy used by the governed Financial Model: USN at
 * 7% of eligible profit, but never below 1% of net revenue.  Values are kept
 * unrounded until the presentation boundary so Base and Network use identical
 * financial semantics.
 */
export function calculateManagementTax(
  netRevenueRub: number,
  eligibleOperatingCashExpensesRub: number,
  rules: FinancialTaxRules,
): FinancialTaxResult {
  const taxableBaseRub = Math.max(netRevenueRub - eligibleOperatingCashExpensesRub, 0);
  const regularUsnRub = taxableBaseRub * rules.regularUsnRate;
  const minimumUsnRub = netRevenueRub * rules.minimumUsnRate;
  return {
    taxableBaseRub,
    regularUsnRub,
    minimumUsnRub,
    taxRub: Math.max(regularUsnRub, minimumUsnRub),
  };
}

export function calculateFinancialMonthlyResult(
  ebitdaRub: number,
  netRevenueRub: number,
  eligibleOperatingCashExpensesRub: number,
  maintenanceCapexRub: number,
  taxRules: FinancialTaxRules,
): FinancialMonthlyResult {
  const tax = calculateManagementTax(netRevenueRub, eligibleOperatingCashExpensesRub, taxRules);
  return {
    ...tax,
    ebitdaRub,
    maintenanceCapexRub,
    freeCashFlowRub: ebitdaRub - tax.taxRub - maintenanceCapexRub,
  };
}

/**
 * First non-negative cumulative month after actual programme activity. This
 * avoids treating a pre-opening run of zero cash flows as instant payback.
 */
export function firstPaybackMonth(cashFlows: readonly number[]) {
  let cumulative = 0;
  let started = false;
  for (let month = 0; month < cashFlows.length; month += 1) {
    cumulative += cashFlows[month];
    if (cashFlows[month] !== 0) started = true;
    if (started && cumulative >= 0) return month;
  }
  return null;
}

export function presentValue(cashFlows: readonly number[], annualDiscountRate: number) {
  const monthlyRate = (1 + annualDiscountRate) ** (1 / 12) - 1;
  return cashFlows.reduce((value, cash, month) => value + cash / ((1 + monthlyRate) ** month), 0);
}

export function monthlyIrr(cashFlows: readonly number[]) {
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

export function annualIrr(cashFlows: readonly number[]) {
  const monthly = monthlyIrr(cashFlows);
  return monthly === null ? null : (1 + monthly) ** 12 - 1;
}

function issueDimension(issue: FinancialCoverageIssue): FinancialCoverageDimension {
  if (issue.dimension) return issue.dimension;
  if (issue.category === "invalid_input" || issue.category === "unresolved_recurring_opex") return "calculation";
  if (issue.category === "unpriced_capex") return "pricing";
  if (issue.category === "capacity") return "capacity";
  return "assumptions";
}

/** Coverage is independent from calculation availability: a partial model may still calculate known FCF. */
export function financialCoverage(issues: readonly FinancialCoverageIssue[]): FinancialCoverage {
  const copied = [...issues];
  const calculation = copied.some((issue) => issue.category === "invalid_input")
    ? "invalid"
    : copied.some((issue) => issueDimension(issue) === "calculation" && issue.material)
      ? "partial"
      : "complete";
  const pricing: FinancialPricingCoverageStatus = copied.some((issue) => issueDimension(issue) === "pricing" && issue.material)
    ? "partial"
    : "complete";
  const assumptions: FinancialAssumptionCoverageStatus = copied.some((issue) => issueDimension(issue) === "assumptions" && issue.assumptionStatus === "requires_confirmation")
    ? "requires_confirmation"
    : copied.some((issue) => issueDimension(issue) === "assumptions")
      ? "planning"
      : "confirmed";
  const capacity: FinancialCapacityCoverageStatus = copied.some((issue) => issueDimension(issue) === "capacity" && issue.capacityStatus === "exceeded")
    ? "exceeded"
    : copied.some((issue) => issueDimension(issue) === "capacity")
      ? "review_required"
      : "covered";
  return {
    status: calculation,
    calculation,
    pricing,
    assumptions,
    capacity,
    hasCaveats: calculation !== "complete" || pricing !== "complete" || assumptions !== "confirmed" || capacity !== "covered",
    issues: copied,
  };
}
