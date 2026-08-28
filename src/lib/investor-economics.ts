import { annualIrr, firstPaybackMonth, roundFinancial } from "./financial-core";
import type { NetworkFinancialProjection } from "./network-financial-projection";
import type { TemporalMonth } from "./network-temporal";

/**
 * Investor Economics deliberately begins after the Business Financial Core.
 * It never recalculates revenue, OPEX, tax, maintenance, CAPEX or rollout.
 * Its sole job is to assign the already-calculated monthly cash between
 * programme obligations, retained liquidity and a proposed investor waterfall.
 */
export const investorEconomicsTemplateIds = [
  "equity",
  "priority_equity",
  "capped_cash_flow",
  "full_programme",
] as const;

export type InvestorEconomicsTemplate = (typeof investorEconomicsTemplateIds)[number];
export type InvestorFundingMode = "upfront" | "staged";
export type InvestorDistributionPolicy = "reinvest_first" | "current_cash_flow";
export type PrincipalRepaymentMode = "cohort_maturity" | "after_programme_funding";
export type PostPrincipalParticipationTerm = "model_horizon" | "additional_months" | "target_cash_moic" | "unlimited";

export type InvestorEconomicsTerms = {
  template: InvestorEconomicsTemplate;
  fundingMode: InvestorFundingMode;
  /** Reinvest-first holds Business FCF through the approved rollout schedule. */
  distributionPolicy: InvestorDistributionPolicy;
  /** Equity share for the plain-equity template. */
  equityShare: number;
  /** Target total distribution multiple for the priority waterfall. */
  targetMultiple: number;
  /** Investor share of distributable cash before the priority threshold. */
  priorityDistributionShare: number;
  /** Investor participation after a priority threshold or cash-flow cap. */
  residualEquityShare: number;
  /** Investor share of distributable cash before the cash-flow cap. */
  cashFlowShare: number;
  /** Total cash-distribution cap for the capped cash-flow template. */
  cashFlowCapMultiple: number;
  /** Share of the full programme funding commitment supplied by this investor. */
  programmeFundingShare: number;
  /** Share of distributable cash applied to principal while it is outstanding. */
  principalPhaseDistributionShare: number;
  /** Share of distributable cash paid after principal is returned. */
  postPrincipalCashFlowShare: number;
  /** Whether capital may return as cohorts mature, or only after programme funding completes. */
  principalRepaymentMode: PrincipalRepaymentMode;
  /** Duration of post-principal cash-flow participation. */
  postPrincipalParticipationTerm: PostPrincipalParticipationTerm;
  /** Used only when post-principal participation is limited to extra months. */
  postPrincipalAdditionalMonths: number;
  /** Used only when participation continues until a cash MOIC target is reached. */
  postPrincipalTargetCashMoic: number;
  /** Optional economic preference. Disabled in every baseline scenario. */
  preferredAnnualRate: number | null;
};

export type InvestorMonthlyWaterfall = {
  month: number;
  businessFreeCashFlowRub: number;
  rolloutFundingRequirementRub: number;
  /** Portion of current Business FCF retained for this month's rollout need. */
  businessCashAppliedToRolloutRub: number;
  investorDrawdownRub: number;
  outstandingPrincipalBeforeRub: number;
  /** FCF of cohorts which have reached the approved full-plan ramp month. */
  matureCohortFreeCashFlowRub: number;
  /** Cohorts whose monthly FCF is eligible under the maturity rule. */
  matureCohortIds: string[];
  distributableBusinessCashRub: number;
  principalRepaymentRub: number;
  investorReturnRub: number;
  totalInvestorDistributionRub: number;
  outstandingPrincipalAfterRub: number;
  cumulativeInvestorDistributionsRub: number;
  businessCashRetainedRub: number;
  cashBalanceAfterFundingRub: number;
};

export type InvestorCohortMaturity = {
  id: string;
  label: string;
  formatLabel: string;
  fundingMonth: number;
  developmentLeadMonths: number;
  openingMonth: number;
  firstSalesMonth: number;
  fullPlanMonth: number;
  firstFcfEligibleMonth: number;
};

export type InvestorEconomicsMetrics = {
  commitmentRub: number | null;
  actualContributionsRub: number;
  principalRepaidRub: number;
  outstandingPrincipalRub: number;
  investorReturnRub: number;
  totalDistributionsRub: number;
  firstDistributionMonth: number | null;
  /** First month in which cumulative cash distributions cover actual contributions. */
  cashPaybackMonth: number | null;
  firstPrincipalRepaymentMonth: number | null;
  principalPaybackMonth: number | null;
  peakOutstandingCapitalRub: number;
  postPrincipalParticipationEndMonth: number | null;
  cashIrr: number | null;
  cashMoic: number | null;
  impliedPostMoneyRub: number | null;
  impliedPreMoneyRub: number | null;
  residualEquityShare: number;
  postPrincipalCashFlowShare: number;
  businessCashRetainedRub: number;
};

export type InvestorEconomicsProjection = {
  context: "investor_economics_v1";
  source: {
    pointCount: number;
    totalProgramInvestmentRub: number | null;
    currentExternalFundingRequirementRub: number | null;
    programmePaybackMonth: number | null;
    coverage: NetworkFinancialProjection["coverage"];
    cohortMaturity: InvestorCohortMaturity[];
  };
  terms: InvestorEconomicsTerms;
  policy: "reinvest_first" | "current_cash_flow" | "full_programme_principal_first";
  rows: InvestorMonthlyWaterfall[];
  metrics: InvestorEconomicsMetrics;
  warnings: string[];
};

export type InvestorEconomicsComparison = {
  id: string;
  label: string;
  terms: InvestorEconomicsTerms;
  projection: InvestorEconomicsProjection;
};

const percent = (value: number) => Math.max(0, Math.min(1, value));

export function defaultInvestorEconomicsTerms(): InvestorEconomicsTerms {
  return {
    template: "equity",
    fundingMode: "staged",
    distributionPolicy: "reinvest_first",
    equityShare: 0.25,
    targetMultiple: 1.3,
    priorityDistributionShare: 0.8,
    // A residual participation is opt-in. Templates that use it set it
    // explicitly, so full-programme funding never inherits an equity stake.
    residualEquityShare: 0,
    cashFlowShare: 0.5,
    cashFlowCapMultiple: 1.3,
    programmeFundingShare: 1,
    principalPhaseDistributionShare: 0.8,
    postPrincipalCashFlowShare: 0.15,
    principalRepaymentMode: "cohort_maturity",
    postPrincipalParticipationTerm: "model_horizon",
    postPrincipalAdditionalMonths: 12,
    postPrincipalTargetCashMoic: 1.5,
    preferredAnnualRate: null,
  };
}

function requiredProgrammeFunding(month: TemporalMonth) {
  if (month.cashFlowRub === null || month.operatingFreeCashFlowRub === null) return null;
  // Recover the gross dated launch/rollout need. network-temporal releases a
  // prepaid-rent credit in cash flow; retaining it here keeps the funding
  // schedule equal to actual programme outlays rather than netting a credit
  // against the investment requirement.
  return roundFinancial(Math.max(0, month.operatingFreeCashFlowRub + (month.prepaidRentCreditRub ?? 0) - month.cashFlowRub));
}

function firstPositiveMonth(months: readonly TemporalMonth[]) {
  return months.find((month) => (month.revenueRub ?? 0) > 0)?.month ?? null;
}

function cohortLabel(cohort: NetworkFinancialProjection["scaling"]["cohorts"][number]) {
  if (cohort.cohort.id === "cohort-1") return "Базовый объект";
  if (cohort.cohort.locationType === "creative_cluster") return "Креативный кластер";
  if (cohort.cohort.locationType === "foodhall") return "Фудхолл";
  return cohort.cohort.format === "with_seating" ? "Исторический центр · с посадкой" : "Исторический центр · на вынос";
}

function cohortFormatLabel(cohort: NetworkFinancialProjection["scaling"]["cohorts"][number] | null) {
  if (cohort === null) return "Базовый объект";
  if (cohort.cohort.locationType === "creative_cluster") return "Креативный кластер";
  if (cohort.cohort.locationType === "foodhall") return "Фудхолл";
  return cohort.cohort.format === "with_seating" ? "Отдельное помещение · с посадкой" : "Отдельное помещение · на вынос";
}

type MaturityProfile = {
  cohorts: InvestorCohortMaturity[];
  matureFreeCashFlowByMonth: number[];
  matureCohortIdsByMonth: string[][];
};

/**
 * The Business Core already provides dated FCF for the Base Object and each
 * expansion cohort.  This adapter adds an eligibility layer only: before a
 * cohort reaches the last approved ramp month, its FCF remains in business
 * and cannot be redirected into an investor distribution.
 */
function cohortMaturityProfile(source: NetworkFinancialProjection): MaturityProfile {
  const rampDurationMonths = Math.max(1, source.temporal.rampDurationMonths);
  const baseFirstSalesMonth = firstPositiveMonth(source.temporal.base.months);
  const baseOpeningMonth = source.temporal.base.months.find((month) => month.newOpenings > 0)?.month ?? 0;
  const baseFullPlanMonth = baseFirstSalesMonth === null ? null : baseFirstSalesMonth + rampDurationMonths - 1;
  const baseMaturity = baseFirstSalesMonth === null || baseFullPlanMonth === null ? [] : [{
    id: "base-object",
    label: "Базовый объект",
    formatLabel: cohortFormatLabel(null),
    fundingMonth: 0,
    developmentLeadMonths: source.temporal.base.months.find((month) => month.newOpenings > 0)?.month ?? 0,
    openingMonth: baseOpeningMonth,
    firstSalesMonth: baseFirstSalesMonth,
    fullPlanMonth: baseFullPlanMonth,
    firstFcfEligibleMonth: baseFullPlanMonth,
  } satisfies InvestorCohortMaturity];
  const expansionMaturity = source.temporal.expansion.groups.flatMap((group) => {
    const cohort = source.scaling.cohorts.find((candidate) => candidate.cohort.id === group.cohortId);
    const openingMonth = group.firstOpeningMonth;
    const firstSalesMonth = firstPositiveMonth(group.months);
    const fullPlanMonth = group.planLevelMonth;
    const fundingMonth = group.months.find((month) => (month.capexRub ?? 0) > 0)?.month
      ?? (openingMonth === null ? null : Math.max(0, openingMonth - 1));
    if (!cohort || openingMonth === null || firstSalesMonth === null || fullPlanMonth === null || fundingMonth === null) return [];
    return [{
      id: group.cohortId,
      label: cohortLabel(cohort),
      formatLabel: cohortFormatLabel(cohort),
      fundingMonth: group.firstFundingMonth ?? fundingMonth,
      developmentLeadMonths: group.openingWaves.at(0)?.developmentLeadMonths ?? 0,
      openingMonth,
      firstSalesMonth,
      fullPlanMonth,
      firstFcfEligibleMonth: fullPlanMonth,
    } satisfies InvestorCohortMaturity];
  });
  const cohorts = [...baseMaturity, ...expansionMaturity];
  const matureFreeCashFlowByMonth = source.temporal.network.months.map((networkMonth) => {
    const month = networkMonth.month;
    const baseFcf = baseMaturity[0] && month >= baseMaturity[0].firstFcfEligibleMonth
      ? source.temporal.base.months[month]?.operatingFreeCashFlowRub ?? 0
      : 0;
    const groupFcf = source.temporal.expansion.groups.reduce((total, group) => {
      const maturity = expansionMaturity.find((candidate) => candidate.id === group.cohortId);
      return total + (maturity && month >= maturity.firstFcfEligibleMonth
        ? group.months[month]?.operatingFreeCashFlowRub ?? 0
        : 0);
    }, 0);
    // Shared costs are owned by the consolidated Business Core. The cap keeps
    // investor eligibility below actual consolidated FCF without recreating a
    // second P&L allocation formula.
    return roundFinancial(Math.max(0, Math.min(networkMonth.operatingFreeCashFlowRub ?? 0, baseFcf + groupFcf)));
  });
  const matureCohortIdsByMonth = source.temporal.network.months.map((networkMonth) => cohorts
    .filter((cohort) => networkMonth.month >= cohort.firstFcfEligibleMonth)
    .map((cohort) => cohort.id));
  return { cohorts, matureFreeCashFlowByMonth, matureCohortIdsByMonth };
}

type SimulationInput = {
  months: readonly TemporalMonth[];
  terms: InvestorEconomicsTerms;
  initialContributionRub: number;
  allowStagedTopUps: boolean;
  fullProgrammeFunding: boolean;
  lastRolloutFundingMonth: number;
  reinvestReleaseMonth: number;
  futureLiquidityBufferByMonth: readonly number[];
  maturity: MaturityProfile;
};

type SimulationResult = {
  rows: InvestorMonthlyWaterfall[];
  contributionsRub: number;
};

function requestedDistribution(
  terms: InvestorEconomicsTerms,
  distributableBusinessCashRub: number,
  outstandingPrincipalRub: number,
  cumulativeDistributionsRub: number,
  cumulativeContributionsRub: number,
) {
  if (terms.template === "equity") return roundFinancial(distributableBusinessCashRub * percent(terms.equityShare));
  // Full-programme funding uses the cohort-maturity principal waterfall in
  // simulate(). Keeping it out of this generic helper prevents immature
  // operating cash from being treated like investor-distributable cash.
  if (terms.template === "full_programme") return 0;
  if (terms.template === "priority_equity") {
    const threshold = cumulativeContributionsRub * Math.max(0, terms.targetMultiple);
    if (cumulativeDistributionsRub >= threshold) return roundFinancial(distributableBusinessCashRub * percent(terms.residualEquityShare));
    const priorityShare = percent(terms.priorityDistributionShare);
    if (priorityShare <= 0) return roundFinancial(distributableBusinessCashRub * percent(terms.residualEquityShare));
    const priorityCashBase = Math.min(distributableBusinessCashRub, (threshold - cumulativeDistributionsRub) / priorityShare);
    return roundFinancial(
      priorityCashBase * priorityShare
      + (distributableBusinessCashRub - priorityCashBase) * percent(terms.residualEquityShare),
    );
  }
  const cap = cumulativeContributionsRub * Math.max(0, terms.cashFlowCapMultiple);
  if (cumulativeDistributionsRub >= cap) return roundFinancial(distributableBusinessCashRub * percent(terms.residualEquityShare));
  const cashFlowShare = percent(terms.cashFlowShare);
  if (cashFlowShare <= 0) return roundFinancial(distributableBusinessCashRub * percent(terms.residualEquityShare));
  const cashFlowBase = Math.min(distributableBusinessCashRub, (cap - cumulativeDistributionsRub) / cashFlowShare);
  return roundFinancial(
    cashFlowBase * cashFlowShare
    + (distributableBusinessCashRub - cashFlowBase) * percent(terms.residualEquityShare),
  );
}

function postPrincipalTermAllowsDistribution(
  terms: InvestorEconomicsTerms,
  month: number,
  principalPaybackMonth: number | null,
  cumulativeDistributionsRub: number,
  cumulativeContributionsRub: number,
) {
  if (principalPaybackMonth === null) return false;
  if (terms.postPrincipalParticipationTerm === "model_horizon" || terms.postPrincipalParticipationTerm === "unlimited") return true;
  if (terms.postPrincipalParticipationTerm === "additional_months") {
    return month <= principalPaybackMonth + Math.max(0, Math.floor(terms.postPrincipalAdditionalMonths));
  }
  return cumulativeDistributionsRub + 0.01 < cumulativeContributionsRub * Math.max(0, terms.postPrincipalTargetCashMoic);
}

function simulate(input: SimulationInput): SimulationResult {
  let cashBalanceRub = 0;
  let outstandingPrincipalRub = 0;
  let cumulativeContributionsRub = 0;
  let cumulativeDistributionsRub = 0;
  let contributionTotalRub = 0;
  let principalPaybackMonth: number | null = null;
  const rows: InvestorMonthlyWaterfall[] = [];

  for (const [index, source] of input.months.entries()) {
    const fundingRequirementRub = requiredProgrammeFunding(source);
    const businessFreeCashFlowRub = source.operatingFreeCashFlowRub;
    if (fundingRequirementRub === null || businessFreeCashFlowRub === null) {
      throw new Error(`Investor Economics requires a complete temporal cash-flow row for month ${source.month}.`);
    }
    const outstandingPrincipalBeforeRub = outstandingPrincipalRub;
    const openingCashBalanceRub = cashBalanceRub;
    let investorDrawdownRub = source.month === 0 ? input.initialContributionRub : 0;
    // Full-programme funding supplies each approved dated requirement. For a
    // staged baseline, a drawdown occurs only when retained business cash is
    // insufficient after that month's required programme funding.
    if (input.fullProgrammeFunding && input.terms.fundingMode === "staged") {
      investorDrawdownRub = roundFinancial(fundingRequirementRub * percent(input.terms.programmeFundingShare));
    }
    // A prepaid-rent credit is released only once: it stays inside the gross
    // programme need above and is added back here as the temporal cash credit.
    // This makes the no-distribution bridge reproduce the Financial Core's
    // monthly cash-flow series exactly.
    const prepaidRentCreditRub = source.prepaidRentCreditRub ?? 0;
    let cashAfterFundingRub = roundFinancial(
      cashBalanceRub + businessFreeCashFlowRub + prepaidRentCreditRub + investorDrawdownRub - fundingRequirementRub,
    );
    if (input.allowStagedTopUps && cashAfterFundingRub < 0) {
      const topUpRub = roundFinancial(-cashAfterFundingRub);
      investorDrawdownRub = roundFinancial(investorDrawdownRub + topUpRub);
      cashAfterFundingRub = 0;
    }
    if (investorDrawdownRub > 0) {
      outstandingPrincipalRub = roundFinancial(outstandingPrincipalRub + investorDrawdownRub);
      cumulativeContributionsRub = roundFinancial(cumulativeContributionsRub + investorDrawdownRub);
      contributionTotalRub = roundFinancial(contributionTotalRub + investorDrawdownRub);
    }
    // Funding is settled before distributions. Only this month's Business FCF
    // that was not needed for the current rollout requirement can become
    // distributable; an existing cash balance (including investor capital) is
    // never re-labelled as distributable cash.
    const businessCashAppliedToRolloutRub = roundFinancial(Math.min(
      businessFreeCashFlowRub,
      Math.max(0, fundingRequirementRub - prepaidRentCreditRub - openingCashBalanceRub - investorDrawdownRub),
    ));
    const distributionEnabled = input.fullProgrammeFunding
      || input.terms.distributionPolicy === "current_cash_flow"
      || source.month > input.reinvestReleaseMonth;
    // Reinvest-first keeps the minimum known future liquidity buffer inside
    // the business. It is the reason the current 62m external requirement can
    // coexist with a larger total rollout programme without treating retained
    // cash as an investor distribution.
    const futureLiquidityBufferRub = !input.fullProgrammeFunding && input.terms.distributionPolicy === "reinvest_first"
      ? (input.futureLiquidityBufferByMonth[index] ?? 0)
      : 0;
    const matureCohortFreeCashFlowRub = input.maturity.matureFreeCashFlowByMonth[index] ?? 0;
    const matureCashAfterRolloutRub = roundFinancial(Math.max(0, matureCohortFreeCashFlowRub - businessCashAppliedToRolloutRub));
    const distributableBusinessCashRub = distributionEnabled
      ? roundFinancial(Math.max(
        0,
        Math.min(
          matureCashAfterRolloutRub,
          cashAfterFundingRub - futureLiquidityBufferRub,
        ),
      ))
      : 0;
    let principalRepaymentRub = 0;
    let investorReturnRub = 0;
    if (input.fullProgrammeFunding) {
      const repaymentEnabled = input.terms.principalRepaymentMode !== "after_programme_funding"
        || source.month > input.lastRolloutFundingMonth;
      const principalRequestRub = repaymentEnabled
        ? roundFinancial(distributableBusinessCashRub * percent(input.terms.principalPhaseDistributionShare))
        : 0;
      principalRepaymentRub = roundFinancial(Math.min(outstandingPrincipalRub, principalRequestRub));
      outstandingPrincipalRub = roundFinancial(outstandingPrincipalRub - principalRepaymentRub);
      if (outstandingPrincipalBeforeRub + investorDrawdownRub > 0 && outstandingPrincipalRub <= 0.01 && principalPaybackMonth === null) {
        principalPaybackMonth = source.month;
      }
      // Until every dated contribution has been returned, a distribution is
      // capital repayment only. Any surplus before that point remains in the
      // business rather than being misreported as investor income.
      const postPrincipalCashRub = roundFinancial(Math.max(0, distributableBusinessCashRub - principalRepaymentRub));
      const cumulativeAfterPrincipalRub = roundFinancial(cumulativeDistributionsRub + principalRepaymentRub);
      if (outstandingPrincipalRub <= 0.01 && postPrincipalTermAllowsDistribution(
        input.terms,
        source.month,
        principalPaybackMonth,
        cumulativeAfterPrincipalRub,
        cumulativeContributionsRub,
      )) {
        const postPrincipalRequestRub = roundFinancial(postPrincipalCashRub * percent(input.terms.postPrincipalCashFlowShare));
        const targetRemainingRub = input.terms.postPrincipalParticipationTerm === "target_cash_moic"
          ? roundFinancial(Math.max(0, cumulativeContributionsRub * Math.max(0, input.terms.postPrincipalTargetCashMoic) - cumulativeAfterPrincipalRub))
          : postPrincipalRequestRub;
        investorReturnRub = Math.min(postPrincipalRequestRub, targetRemainingRub);
      }
    } else {
      const requestedDistributionRub = requestedDistribution(
        input.terms,
        distributableBusinessCashRub,
        outstandingPrincipalRub,
        cumulativeDistributionsRub,
        cumulativeContributionsRub,
      );
      const totalRequestedRub = roundFinancial(Math.min(distributableBusinessCashRub, requestedDistributionRub));
      principalRepaymentRub = roundFinancial(Math.min(outstandingPrincipalRub, totalRequestedRub));
      investorReturnRub = roundFinancial(totalRequestedRub - principalRepaymentRub);
      outstandingPrincipalRub = roundFinancial(outstandingPrincipalRub - principalRepaymentRub);
    }
    const totalInvestorDistributionRub = roundFinancial(principalRepaymentRub + investorReturnRub);
    cumulativeDistributionsRub = roundFinancial(cumulativeDistributionsRub + totalInvestorDistributionRub);
    cashBalanceRub = roundFinancial(cashAfterFundingRub - totalInvestorDistributionRub);
    rows.push({
      month: source.month,
      businessFreeCashFlowRub,
      rolloutFundingRequirementRub: fundingRequirementRub,
      businessCashAppliedToRolloutRub,
      investorDrawdownRub,
      outstandingPrincipalBeforeRub,
      matureCohortFreeCashFlowRub,
      matureCohortIds: input.maturity.matureCohortIdsByMonth[index] ?? [],
      distributableBusinessCashRub,
      principalRepaymentRub,
      investorReturnRub,
      totalInvestorDistributionRub,
      outstandingPrincipalAfterRub: outstandingPrincipalRub,
      cumulativeInvestorDistributionsRub: cumulativeDistributionsRub,
      businessCashRetainedRub: cashBalanceRub,
      cashBalanceAfterFundingRub: cashAfterFundingRub,
    });
  }
  return { rows, contributionsRub: contributionTotalRub };
}

function futureLiquidityBuffers(months: readonly TemporalMonth[]) {
  return months.map((_, index) => {
    let cumulativeFutureCashRub = 0;
    let minimumFutureCashRub = 0;
    for (let future = index + 1; future < months.length; future += 1) {
      const month = months[future];
      const funding = requiredProgrammeFunding(month);
      const fcf = month.operatingFreeCashFlowRub;
      if (funding === null || fcf === null) return Number.POSITIVE_INFINITY;
      cumulativeFutureCashRub = roundFinancial(cumulativeFutureCashRub + fcf + (month.prepaidRentCreditRub ?? 0) - funding);
      minimumFutureCashRub = Math.min(minimumFutureCashRub, cumulativeFutureCashRub);
    }
    return roundFinancial(Math.max(0, -minimumFutureCashRub));
  });
}

function minimumUpfrontContribution(
  months: readonly TemporalMonth[],
  terms: InvestorEconomicsTerms,
  fullProgrammeFunding: boolean,
  lastRolloutFundingMonth: number,
  reinvestReleaseMonth: number,
  futureLiquidityBufferByMonth: readonly number[],
  maturity: MaturityProfile,
) {
  // The payout rule depends on the cash held at M0. Binary search finds the
  // smallest opening amount that keeps the monthly liquidity balance positive
  // without inventing a separate financing formula.
  let low = 0;
  let high = months.reduce((sum, month) => sum + (requiredProgrammeFunding(month) ?? 0), 0) * 2 + 1;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const mid = (low + high) / 2;
    const result = simulate({ months, terms, initialContributionRub: mid, allowStagedTopUps: false, fullProgrammeFunding, lastRolloutFundingMonth, reinvestReleaseMonth, futureLiquidityBufferByMonth, maturity });
    const lowestBalance = Math.min(...result.rows.map((row) => row.businessCashRetainedRub));
    if (lowestBalance < -0.01) low = mid;
    else high = mid;
  }
  return roundFinancial(high);
}

function commitmentFor(
  source: InvestorEconomicsProjection["source"],
  terms: InvestorEconomicsTerms,
  contributionsRub: number,
) {
  if (terms.template === "full_programme") {
    return source.totalProgramInvestmentRub === null
      ? null
      : roundFinancial(source.totalProgramInvestmentRub * percent(terms.programmeFundingShare));
  }
  return terms.fundingMode === "upfront"
    ? contributionsRub
    : source.currentExternalFundingRequirementRub === null
      ? contributionsRub
      : roundFinancial(Math.max(source.currentExternalFundingRequirementRub, contributionsRub));
}

export function investorEconomicsProjection(
  sourceProjection: NetworkFinancialProjection,
  terms: InvestorEconomicsTerms = defaultInvestorEconomicsTerms(),
): InvestorEconomicsProjection {
  const temporal = sourceProjection.temporal;
  const maturity = cohortMaturityProfile(sourceProjection);
  const source = {
    pointCount: temporal.network.pointCount,
    totalProgramInvestmentRub: temporal.funding.totalProgramInvestmentRub,
    currentExternalFundingRequirementRub: temporal.funding.upfrontInvestorFundingRub,
    programmePaybackMonth: temporal.network.paybackMonth,
    coverage: sourceProjection.coverage,
    cohortMaturity: maturity.cohorts,
  };
  const fullProgrammeFunding = terms.template === "full_programme";
  const futureLiquidityBufferByMonth = futureLiquidityBuffers(temporal.network.months);
  const lastRolloutFundingMonth = temporal.network.months.reduce((last, month) => {
    const funding = requiredProgrammeFunding(month);
    return funding !== null && funding > 0 ? month.month : last;
  }, 0);
  const reinvestReleaseMonth = Math.max(lastRolloutFundingMonth, temporal.network.paybackMonth ?? lastRolloutFundingMonth);
  const initialContributionRub = terms.fundingMode === "upfront"
    ? minimumUpfrontContribution(temporal.network.months, terms, fullProgrammeFunding, lastRolloutFundingMonth, reinvestReleaseMonth, futureLiquidityBufferByMonth, maturity)
    : 0;
  const result = simulate({
    months: temporal.network.months,
    terms,
    initialContributionRub,
    allowStagedTopUps: terms.fundingMode === "staged",
    fullProgrammeFunding,
    lastRolloutFundingMonth,
    reinvestReleaseMonth,
    futureLiquidityBufferByMonth,
    maturity,
  });
  const rows = result.rows;
  const totalDistributionsRub = rows.at(-1)?.cumulativeInvestorDistributionsRub ?? 0;
  const principalRepaidRub = roundFinancial(rows.reduce((sum, row) => sum + row.principalRepaymentRub, 0));
  const investorReturnRub = roundFinancial(rows.reduce((sum, row) => sum + row.investorReturnRub, 0));
  const actualContributionsRub = result.contributionsRub;
  const cashIrr = annualIrr(rows.map((row) => roundFinancial(-row.investorDrawdownRub + row.totalInvestorDistributionRub)));
  const firstDistributionMonth = rows.find((row) => row.totalInvestorDistributionRub > 0)?.month ?? null;
  const cashPaybackMonth = actualContributionsRub <= 0
    ? null
    : rows.find((row) => row.cumulativeInvestorDistributionsRub + 0.01 >= actualContributionsRub)?.month ?? null;
  const firstPrincipalRepaymentMonth = rows.find((row) => row.principalRepaymentRub > 0)?.month ?? null;
  const principalPaybackMonth = rows.find((row) => row.outstandingPrincipalBeforeRub > 0 && row.outstandingPrincipalAfterRub === 0)?.month ?? null;
  const postPrincipalParticipationEndMonth = principalPaybackMonth === null
    ? null
    : terms.postPrincipalParticipationTerm === "additional_months"
      ? Math.min(rows.at(-1)?.month ?? principalPaybackMonth, principalPaybackMonth + Math.max(0, Math.floor(terms.postPrincipalAdditionalMonths)))
      : terms.postPrincipalParticipationTerm === "target_cash_moic"
        ? rows.find((row) => row.cumulativeInvestorDistributionsRub + 0.01 >= actualContributionsRub * Math.max(0, terms.postPrincipalTargetCashMoic))?.month ?? null
        : rows.at(-1)?.month ?? null;
  const residualEquityShare = terms.template === "equity"
    ? percent(terms.equityShare)
    : terms.template === "full_programme"
      ? percent(terms.residualEquityShare)
      : percent(terms.residualEquityShare);
  const cashFlows = rows.map((row) => roundFinancial(-row.investorDrawdownRub + row.totalInvestorDistributionRub));
  const warnings = [
    "Предварительный расчёт: требуется проверка мощности производства.",
    ...(source.coverage.assumptions === "requires_confirmation" ? ["Отдельные договорные и налоговые допущения требуют подтверждения."] : []),
    ...(terms.preferredAnnualRate === null ? [] : ["Предпочтительная доходность включена как отдельное условие и не смешивается с долей денежного потока."]),
  ];
  return {
    context: "investor_economics_v1",
    source,
    terms,
    policy: fullProgrammeFunding
      ? "full_programme_principal_first"
      : terms.distributionPolicy,
    rows,
    metrics: {
      commitmentRub: commitmentFor(source, terms, actualContributionsRub),
      actualContributionsRub,
      principalRepaidRub,
      outstandingPrincipalRub: rows.at(-1)?.outstandingPrincipalAfterRub ?? 0,
      investorReturnRub,
      totalDistributionsRub,
      firstDistributionMonth,
      cashPaybackMonth,
      firstPrincipalRepaymentMonth,
      principalPaybackMonth,
      peakOutstandingCapitalRub: roundFinancial(Math.max(0, ...rows.map((row) => row.outstandingPrincipalAfterRub))),
      postPrincipalParticipationEndMonth,
      cashIrr,
      cashMoic: actualContributionsRub <= 0 ? null : roundFinancial(totalDistributionsRub / actualContributionsRub, 4),
      impliedPostMoneyRub: terms.template === "equity" && terms.equityShare > 0
        ? roundFinancial(actualContributionsRub / terms.equityShare)
        : null,
      impliedPreMoneyRub: terms.template === "equity" && terms.equityShare > 0
        ? roundFinancial(actualContributionsRub / terms.equityShare - actualContributionsRub)
        : null,
      residualEquityShare,
      postPrincipalCashFlowShare: terms.template === "full_programme"
        ? percent(terms.postPrincipalCashFlowShare)
        : terms.template === "equity"
          ? percent(terms.equityShare)
          : percent(terms.residualEquityShare),
      businessCashRetainedRub: rows.at(-1)?.businessCashRetainedRub ?? 0,
    },
    warnings,
  };
}

export function investorEconomicsComparison(source: NetworkFinancialProjection): InvestorEconomicsComparison[] {
  const base = defaultInvestorEconomicsTerms();
  const variants: Array<Omit<InvestorEconomicsComparison, "projection">> = [
    ...[0.2, 0.25, 0.3, 0.4].map((equityShare) => ({
      id: `equity-${equityShare}`,
      label: `${Math.round(equityShare * 100)}% доля`,
      terms: { ...base, template: "equity" as const, equityShare },
    })),
    ...[1.2, 1.3, 1.5].map((targetMultiple) => ({
      id: `priority-${targetMultiple}`,
      label: `${targetMultiple.toFixed(1)}× + 20% доля`,
      terms: { ...base, template: "priority_equity" as const, fundingMode: "staged" as const, distributionPolicy: "current_cash_flow" as const, targetMultiple, priorityDistributionShare: 0.8, residualEquityShare: 0.2 },
    })),
    ...[1.2, 1.3, 1.5].map((cashFlowCapMultiple) => ({
      id: `cash-flow-${cashFlowCapMultiple}`,
      label: `${cashFlowCapMultiple.toFixed(1)}× доля потока`,
      terms: { ...base, template: "capped_cash_flow" as const, fundingMode: "staged" as const, distributionPolicy: "current_cash_flow" as const, cashFlowCapMultiple, cashFlowShare: 0.5, residualEquityShare: 0 },
    })),
    {
      id: "full-programme-80-15",
      label: "Вся программа · 80% / 15%",
      terms: { ...base, template: "full_programme", fundingMode: "staged", principalPhaseDistributionShare: 0.8, postPrincipalCashFlowShare: 0.15, residualEquityShare: 0 },
    },
    {
      id: "full-programme-100-10",
      label: "Вся программа · 100% / 10%",
      terms: { ...base, template: "full_programme", fundingMode: "staged", principalPhaseDistributionShare: 1, postPrincipalCashFlowShare: 0.1, residualEquityShare: 0 },
    },
    {
      id: "full-programme-70-20",
      label: "Вся программа · 70% / 20%",
      terms: { ...base, template: "full_programme", fundingMode: "staged", principalPhaseDistributionShare: 0.7, postPrincipalCashFlowShare: 0.2, residualEquityShare: 0 },
    },
  ];
  return variants.map((variant) => ({ ...variant, projection: investorEconomicsProjection(source, variant.terms) }));
}

/** Independent, deterministic checks used by both unit tests and generators. */
export function investorEconomicsInvariantErrors(projection: InvestorEconomicsProjection) {
  const errors: string[] = [];
  for (const row of projection.rows) {
    const identity = roundFinancial(
      row.cashBalanceAfterFundingRub - row.totalInvestorDistributionRub - row.businessCashRetainedRub,
    );
    if (Math.abs(identity) > 0.02) errors.push(`Month ${row.month}: post-funding cash allocation is not conserved.`);
    if (row.totalInvestorDistributionRub - row.distributableBusinessCashRub > 0.02) errors.push(`Month ${row.month}: investor distribution exceeds distributable cash.`);
    if (row.businessCashAppliedToRolloutRub - row.businessFreeCashFlowRub > 0.02) errors.push(`Month ${row.month}: Business FCF is used twice for rollout and distribution.`);
    if (row.principalRepaymentRub - row.outstandingPrincipalBeforeRub - row.investorDrawdownRub > 0.02) errors.push(`Month ${row.month}: principal repayment exceeds outstanding capital.`);
    if (row.totalInvestorDistributionRub - row.matureCohortFreeCashFlowRub > 0.02) errors.push(`Month ${row.month}: immature cohort FCF reached an investor distribution.`);
    if (row.investorReturnRub < -0.02 || row.principalRepaymentRub < -0.02) errors.push(`Month ${row.month}: investor waterfall cannot be negative.`);
    if (row.businessCashRetainedRub < -0.02) errors.push(`Month ${row.month}: liquidity is negative after required drawdown.`);
  }
  const principalPaybackRows = projection.rows.filter((row) => row.outstandingPrincipalBeforeRub > 0 && row.outstandingPrincipalAfterRub === 0);
  if (principalPaybackRows.length > 1) errors.push("Principal payoff may activate only once.");
  if (projection.terms.template === "full_programme" && projection.terms.fundingMode === "staged") {
    const monthZero = projection.rows.find((row) => row.month === 0);
    if (monthZero && projection.metrics.commitmentRub !== null && monthZero.investorDrawdownRub >= projection.metrics.commitmentRub - 0.01 && projection.metrics.commitmentRub > 0) {
      errors.push("A staged full-programme commitment cannot be treated as an M0 cash contribution.");
    }
  }
  if (projection.terms.template === "full_programme") {
    for (const row of projection.rows) {
      if (row.outstandingPrincipalAfterRub > 0.01 && row.investorReturnRub > 0.02) errors.push(`Month ${row.month}: investor income cannot precede full capital repayment.`);
    }
  }
  return errors;
}

export function investorPrincipalPaybackMonth(projection: InvestorEconomicsProjection) {
  return firstPaybackMonth(projection.rows.map((row) => row.principalRepaymentRub - row.investorDrawdownRub));
}
