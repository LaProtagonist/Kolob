import assert from "node:assert/strict";
import test from "node:test";
import { annualIrr } from "../src/lib/financial-core.js";
import { configuredEconomicsScenario } from "../src/lib/configured-economics.js";
import { applyNetworkRolloutPreset, defaultInvestorConfiguration } from "../src/lib/investor-configuration.js";
import {
  defaultInvestorEconomicsTerms,
  investorEconomicsComparison,
  investorEconomicsInvariantErrors,
  investorEconomicsProjection,
} from "../src/lib/investor-economics.js";
import { networkFinancialProjection } from "../src/lib/network-financial-projection.js";
import { baseObjectFinancialProjection, networkScalingProjection } from "../src/lib/network-scaling.js";
import { rentPrepaymentMonth } from "../src/lib/rent-prepayment.js";
import { serializedInvestorEconomicsProjectionArtifact } from "./generate-investor-economics-projection.js";

function fivePointBusinessProjection() {
  const initial = defaultInvestorConfiguration();
  const configuration = {
    ...initial,
    networkScaling: applyNetworkRolloutPreset(initial.networkScaling, initial.launchBudget, 4),
  };
  const scenario = configuredEconomicsScenario(configuration);
  return networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario);
}

function fivePointConfiguration() {
  const initial = defaultInvestorConfiguration();
  return {
    ...initial,
    networkScaling: applyNetworkRolloutPreset(initial.networkScaling, initial.launchBudget, 4),
  };
}

test("Investor Economics has one deterministic projection and never duplicates the Business Financial Core", () => {
  const source = fivePointBusinessProjection();
  const one = investorEconomicsProjection(source);
  const two = investorEconomicsProjection(source);
  assert.deepEqual(one, two);
  assert.equal(one.source.totalProgramInvestmentRub, source.temporal.funding.totalProgramInvestmentRub);
  assert.equal(one.source.currentExternalFundingRequirementRub, source.temporal.funding.upfrontInvestorFundingRub);
  assert.deepEqual(investorEconomicsInvariantErrors(one), []);
  assert.equal(serializedInvestorEconomicsProjectionArtifact(), serializedInvestorEconomicsProjectionArtifact());
});

test("reinvested Business FCF is not simultaneously an investor distribution", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection());
  for (const row of projection.rows) {
    assert.ok(row.totalInvestorDistributionRub <= row.distributableBusinessCashRub + 0.01);
    assert.ok(row.businessCashAppliedToRolloutRub <= row.businessFreeCashFlowRub + 0.01);
    assert.ok(row.businessCashRetainedRub >= -0.01);
  }
  assert.equal(projection.policy, "reinvest_first");
  assert.ok((projection.metrics.firstDistributionMonth ?? 0) > 0, "the baseline holds FCF for rollout/liquidity before the first payout");
});

test("the no-distribution bridge reproduces the Business Core liquidity requirement without double-counting prepaid rent", () => {
  const source = fivePointBusinessProjection();
  const projection = investorEconomicsProjection(source, {
    ...defaultInvestorEconomicsTerms(),
    equityShare: 0,
  });
  assert.ok(Math.abs(
    projection.metrics.actualContributionsRub - (source.temporal.funding.upfrontInvestorFundingRub ?? 0),
  ) < 0.02);
  let cumulativeContributionsRub = 0;
  for (const [index, row] of projection.rows.entries()) {
    cumulativeContributionsRub += row.investorDrawdownRub;
    const sourceCumulativeRub = source.temporal.network.months[index]?.cumulativeCashFlowRub;
    assert.ok(sourceCumulativeRub !== null);
    assert.ok(Math.abs(row.businessCashRetainedRub - (sourceCumulativeRub! + cumulativeContributionsRub)) < 0.02);
  }
});

test("early cash distributions raise the required external contribution rather than reuse rollout cash", () => {
  const source = fivePointBusinessProjection();
  const baseline = investorEconomicsProjection(source);
  const early = investorEconomicsProjection(source, {
    ...defaultInvestorEconomicsTerms(),
    distributionPolicy: "current_cash_flow",
  });
  assert.ok(early.metrics.actualContributionsRub > baseline.metrics.actualContributionsRub);
  assert.ok((early.metrics.firstDistributionMonth ?? Infinity) < (baseline.metrics.firstDistributionMonth ?? Infinity));
  assert.deepEqual(investorEconomicsInvariantErrors(early), []);
});

test("full-programme staged commitment is not an M0 cash outflow", () => {
  const source = fivePointBusinessProjection();
  const projection = investorEconomicsProjection(source, {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
  });
  assert.equal(projection.metrics.commitmentRub, source.temporal.funding.totalProgramInvestmentRub);
  assert.ok(projection.rows[0].investorDrawdownRub < (projection.metrics.commitmentRub ?? 0));
  assert.ok(projection.rows.filter((row) => row.investorDrawdownRub > 0).length > 1);
  assert.ok(Math.abs(projection.metrics.actualContributionsRub - (projection.metrics.commitmentRub ?? 0)) < 0.02);
  assert.equal(projection.metrics.residualEquityShare, 0);
  assert.deepEqual(investorEconomicsInvariantErrors(projection), []);
});

test("principal repayments reduce outstanding principal and are not reported as investor profit", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    principalPhaseDistributionShare: 1,
    postPrincipalCashFlowShare: 0.1,
  });
  for (const row of projection.rows) {
    assert.ok(Math.abs(row.outstandingPrincipalAfterRub - (row.outstandingPrincipalBeforeRub + row.investorDrawdownRub - row.principalRepaymentRub)) < 0.02);
    assert.ok(Math.abs(row.investorReturnRub - Math.max(0, row.totalInvestorDistributionRub - row.principalRepaymentRub)) < 0.02);
  }
  assert.ok(projection.metrics.principalRepaidRub > 0);
  assert.ok(projection.metrics.investorReturnRub > 0);
});

test("the post-principal waterfall activates exactly once", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
  });
  const payoffRows = projection.rows.filter((row) => row.outstandingPrincipalBeforeRub > 0 && row.outstandingPrincipalAfterRub === 0);
  assert.equal(payoffRows.length, 1);
  const payoffMonth = payoffRows[0]?.month ?? Infinity;
  for (const row of projection.rows.filter((row) => row.month > payoffMonth)) {
    assert.ok(row.principalRepaymentRub <= 0.01);
    assert.ok(row.investorReturnRub <= row.totalInvestorDistributionRub + 0.01);
  }
});

test("programme payback and investor principal payback are distinct metrics", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
  });
  assert.notEqual(projection.source.programmePaybackMonth, null);
  assert.notEqual(projection.metrics.principalPaybackMonth, projection.source.programmePaybackMonth);
});

test("equity payouts follow the selected equity share after the reinvest-first gate", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    equityShare: 0.3,
  });
  const paid = projection.rows.find((row) => row.totalInvestorDistributionRub > 0);
  assert.ok(paid);
  assert.ok(Math.abs((paid!.totalInvestorDistributionRub / paid!.distributableBusinessCashRub) - 0.3) < 0.0001);
  assert.equal(projection.metrics.residualEquityShare, 0.3);
});

test("the priority threshold switches to residual participation without a second cash-flow engine", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "priority_equity",
    fundingMode: "staged",
    distributionPolicy: "current_cash_flow",
    targetMultiple: 1.2,
    priorityDistributionShare: 1,
    residualEquityShare: 0.2,
  });
  const threshold = projection.metrics.actualContributionsRub * 1.2;
  const thresholdMonth = projection.rows.find((row) => row.cumulativeInvestorDistributionsRub >= threshold - 0.02)?.month;
  assert.notEqual(thresholdMonth, undefined);
  const postThreshold = projection.rows.find((row) => row.month > thresholdMonth! && row.distributableBusinessCashRub > 0);
  assert.ok(postThreshold);
  assert.ok(Math.abs((postThreshold!.totalInvestorDistributionRub / postThreshold!.distributableBusinessCashRub) - 0.2) < 0.0001);
});

test("a capped cash-flow scenario stops the capped distribution without inventing residual equity", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "capped_cash_flow",
    fundingMode: "staged",
    distributionPolicy: "current_cash_flow",
    cashFlowShare: 1,
    cashFlowCapMultiple: 1.2,
    residualEquityShare: 0,
  });
  const cap = projection.metrics.actualContributionsRub * 1.2;
  assert.ok(projection.metrics.totalDistributionsRub <= cap + 0.02);
  const cappedAt = projection.rows.find((row) => row.cumulativeInvestorDistributionsRub >= cap - 0.02)?.month ?? Infinity;
  for (const row of projection.rows.filter((row) => row.month > cappedAt)) assert.equal(row.totalInvestorDistributionRub, 0);
  assert.equal(projection.metrics.residualEquityShare, 0);
});

test("cash IRR uses only dated contributions and distributions, never a residual-equity valuation", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    residualEquityShare: 0.25,
  });
  const explicitCashIrr = annualIrr(projection.rows.map((row) => -row.investorDrawdownRub + row.totalInvestorDistributionRub));
  assert.equal(projection.metrics.cashIrr, explicitCashIrr);
  assert.equal(projection.metrics.impliedPostMoneyRub, null);
});

test("Creative Cluster uses 12 months prepaid rent, keeps one-month deposit, and credits rent only after holidays", () => {
  const configuration = fivePointConfiguration();
  const creative = configuration.networkScaling.cohorts.find((cohort) => cohort.locationType === "creative_cluster");
  assert.ok(creative);
  assert.equal(creative!.prepaymentMonths, 12);
  assert.equal(creative!.securityDepositMonths, 1);
  assert.equal(creative!.rentFreeMonths, 2);
  const monthTwo = rentPrepaymentMonth({ operatingMonth: 2, monthlyRentRub: creative!.monthlyRentRub ?? 0, prepaidMonths: creative!.prepaymentMonths ?? 0, rentFreeMonths: creative!.rentFreeMonths });
  const monthThree = rentPrepaymentMonth({ operatingMonth: 3, monthlyRentRub: creative!.monthlyRentRub ?? 0, prepaidMonths: creative!.prepaymentMonths ?? 0, rentFreeMonths: creative!.rentFreeMonths });
  assert.equal(monthTwo.prepaidRentCreditRub, 0, "rent-free months do not consume the prepaid balance");
  assert.equal(monthThree.prepaidRentCreditRub, creative!.monthlyRentRub, "the first payable month uses the prepaid credit");
  assert.equal(monthThree.cashRentPaymentRub, 0, "prepaid rent cannot create a second cash outflow");
});

test("each additional cohort has a distinct contingency, initial inventory and operating reserve semantics", () => {
  const scaling = networkScalingProjection(fivePointConfiguration());
  for (const cohort of scaling.cohorts.slice(1)) {
    const contingency = cohort.pointItems.find((item) => item.id === "point-contingency");
    const inventory = cohort.pointItems.find((item) => item.id.endsWith(":initial-inventory"));
    assert.ok(contingency && contingency.amountRub !== null, `${cohort.cohort.id} has a priced contingency`);
    assert.ok(inventory && inventory.amountRub !== null, `${cohort.cohort.id} has separately priced initial inventory`);
    assert.match(contingency!.name, /^Непредвиденные расходы, 10%$/);
    assert.match(contingency!.reason, /не включает предоплату, депозит или первоначальный запас/i);
    assert.notEqual(contingency!.amountRub, inventory!.amountRub, "contingency is not initial inventory");
    const eligibleBase = cohort.pointItems
      .filter((item) => ["point-preparation", "point-retail-equipment", "point-pos-kds", "point-bar", "point-wash", "furniture"].some((id) => item.id.endsWith(id)))
      .reduce((total, item) => total + (item.amountRub ?? 0), 0);
    assert.equal(contingency!.amountRub, Math.round(eligibleBase * 10) / 100, `${cohort.cohort.id} contingency is exactly 10% of its eligible launch base`);
  }
});

test("full-programme distributions begin only with mature cohort FCF", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
  });
  const base = projection.source.cohortMaturity.find((cohort) => cohort.id === "base-object");
  const creative = projection.source.cohortMaturity.find((cohort) => cohort.label === "Креативный кластер");
  assert.ok(base && creative, "the projection exposes the funded base and Creative Cluster cohorts");
  assert.equal(base!.firstFcfEligibleMonth, base!.fullPlanMonth);
  for (const row of projection.rows.filter((row) => row.month < base!.firstFcfEligibleMonth)) {
    assert.equal(row.totalInvestorDistributionRub, 0, `M${row.month} cannot use immature Base FCF for investor payments`);
  }
  const firstPayment = projection.rows.find((row) => row.totalInvestorDistributionRub > 0);
  assert.ok(firstPayment);
  assert.equal(firstPayment!.month, base!.firstFcfEligibleMonth);
  assert.ok(firstPayment!.matureCohortIds.includes("base-object"));
  assert.ok(!firstPayment!.matureCohortIds.includes(creative!.id), "the later Creative Cluster is not used before its own ramp completes");
  for (const row of projection.rows) {
    assert.ok(row.totalInvestorDistributionRub <= row.matureCohortFreeCashFlowRub + 0.02);
  }
});

test("Base maturity is read from the current Business Core timeline without inventing a construction lag", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection());
  const base = projection.source.cohortMaturity.find((cohort) => cohort.id === "base-object");
  assert.ok(base);
  assert.deepEqual(
    {
      funding: base!.fundingMonth,
      opening: base!.openingMonth,
      firstSales: base!.firstSalesMonth,
      fullPlan: base!.fullPlanMonth,
    },
    { funding: 0, opening: 0, firstSales: 1, fullPlan: 7 },
  );
});

test("Creative Cluster prepayment advances the programme crossing through dated prepaid-rent credits", () => {
  const currentConfiguration = fivePointConfiguration();
  const legacyConfiguration = {
    ...currentConfiguration,
    networkScaling: {
      ...currentConfiguration.networkScaling,
      cohorts: currentConfiguration.networkScaling.cohorts.map((cohort) => cohort.locationType === "creative_cluster"
        ? { ...cohort, prepaymentMonths: 1 }
        : cohort),
    },
  };
  const currentScenario = configuredEconomicsScenario(currentConfiguration);
  const legacyScenario = configuredEconomicsScenario(legacyConfiguration);
  const current = networkFinancialProjection(currentConfiguration, baseObjectFinancialProjection(currentScenario), currentScenario);
  const legacy = networkFinancialProjection(legacyConfiguration, baseObjectFinancialProjection(legacyScenario), legacyScenario);
  const currentM18 = current.temporal.network.months.find((month) => month.month === 18)!;
  const legacyM18 = legacy.temporal.network.months.find((month) => month.month === 18)!;
  assert.equal(current.temporal.network.paybackMonth, 18);
  assert.equal(legacy.temporal.network.paybackMonth, 19);
  assert.ok((legacyM18.cumulativeCashFlowRub ?? 0) < 0, "legacy M18 remains below zero");
  assert.ok((currentM18.cumulativeCashFlowRub ?? 0) > 0, "current M18 has crossed above zero");
  assert.ok(Math.abs((currentM18.cumulativeCashFlowRub ?? 0) - (legacyM18.cumulativeCashFlowRub ?? 0) - 480_000) < 0.02);
  const currentM3 = current.temporal.network.months.find((month) => month.month === 3)!;
  const legacyM3 = legacy.temporal.network.months.find((month) => month.month === 3)!;
  assert.ok((currentM3.cashFlowRub ?? 0) < (legacyM3.cashFlowRub ?? 0), "the larger Creative prepayment is funded at launch");
  const currentM7 = current.temporal.network.months.find((month) => month.month === 7)!;
  const legacyM7 = legacy.temporal.network.months.find((month) => month.month === 7)!;
  assert.equal((currentM7.prepaidRentCreditRub ?? 0) - (legacyM7.prepaidRentCreditRub ?? 0), 160_000, "the additional prepaid credit begins after rent holidays");
});

test("full-programme investor income starts only after all capital is returned and horizon metrics exclude residual value", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    residualEquityShare: 0.25,
  });
  for (const row of projection.rows.filter((row) => row.outstandingPrincipalAfterRub > 0.01)) {
    assert.equal(row.investorReturnRub, 0, `M${row.month} cannot classify a capital repayment as investor income`);
  }
  assert.equal(projection.metrics.impliedPostMoneyRub, null);
  assert.equal(projection.metrics.postPrincipalParticipationEndMonth, projection.rows.at(-1)?.month ?? null);
  assert.ok(projection.metrics.firstPrincipalRepaymentMonth !== null);
});

test("principal repayment can be deferred until programme funding has completed", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    principalRepaymentMode: "after_programme_funding",
  });
  const lastDrawdownMonth = Math.max(...projection.rows.filter((row) => row.investorDrawdownRub > 0).map((row) => row.month));
  for (const row of projection.rows.filter((row) => row.month <= lastDrawdownMonth)) assert.equal(row.principalRepaymentRub, 0);
  assert.ok((projection.metrics.firstPrincipalRepaymentMonth ?? 0) > lastDrawdownMonth);
});

test("the requested review set includes equity, priority, capped-flow and full-programme alternatives", () => {
  const variants = investorEconomicsComparison(fivePointBusinessProjection());
  assert.deepEqual(
    new Set(variants.map((item) => item.terms.template)),
    new Set(["equity", "priority_equity", "capped_cash_flow", "full_programme"]),
  );
  assert.ok(variants.some((item) => item.id === "full-programme-80-15"));
  assert.ok(variants.some((item) => item.id === "full-programme-100-10"));
  assert.ok(variants.some((item) => item.id === "full-programme-70-20"));
  assert.ok(variants.every((item) => investorEconomicsInvariantErrors(item.projection).length === 0));
});
