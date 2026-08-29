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
import { publishedParticipationPresets } from "../src/content/investor-participation-presets.js";
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

test("published discussion presets are governed read-only terms, separate from candidate workbench variants", () => {
  assert.equal(publishedParticipationPresets.length, 3);
  assert.deepEqual(
    publishedParticipationPresets.map((preset) => preset.template),
    ["equity", "priority_equity", "full_programme"],
  );
  assert.deepEqual(
    publishedParticipationPresets.map((preset) => ({ id: preset.id, terms: preset.terms })),
    [
      { id: "INV-EQUITY-DISCUSSION", terms: { ...publishedParticipationPresets[0]!.terms, equityShare: 0.35, fundingMode: "staged" } },
      { id: "INV-PRIORITY-DISCUSSION", terms: { ...publishedParticipationPresets[1]!.terms, priorityDistributionShare: 0.7, targetMultiple: 1.3, residualEquityShare: 0.15, postPrincipalCashFlowShare: 0, fundingMode: "staged" } },
      { id: "INV-FULL-PROGRAMME-DISCUSSION", terms: { ...publishedParticipationPresets[2]!.terms, programmeFundingShare: 1, principalPhaseDistributionShare: 0.7, residualEquityShare: 0.4, postPrincipalCashFlowShare: 0, fundingMode: "staged" } },
    ],
    "approved three-scenario public terms are the governed source of truth",
  );
  const source = fivePointBusinessProjection();
  for (const preset of publishedParticipationPresets) {
    const projection = investorEconomicsProjection(source, preset.terms);
    assert.equal(projection.terms, preset.terms, `preset ${preset.id} reaches the shared Investor Economics layer unchanged`);
    assert.equal(preset.status, "discussion");
  }
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

test("early cash distributions never reuse rollout cash", () => {
  const source = fivePointBusinessProjection();
  const baseline = investorEconomicsProjection(source);
  const early = investorEconomicsProjection(source, {
    ...defaultInvestorEconomicsTerms(),
    distributionPolicy: "current_cash_flow",
  });
  assert.ok(early.metrics.actualContributionsRub >= baseline.metrics.actualContributionsRub);
  assert.ok((early.metrics.firstDistributionMonth ?? Infinity) >= 10, "maturity prevents pre-ramp investor payouts");
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

test("full-programme residual equity distributes real post-principal cash without a direct FCF share", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "full_programme",
    fundingMode: "staged",
    programmeFundingShare: 1,
    principalPhaseDistributionShare: 0.7,
    postPrincipalCashFlowShare: 0,
    residualEquityShare: 0.4,
  });
  const payoffMonth = projection.metrics.principalPaybackMonth;
  assert.notEqual(payoffMonth, null);
  const payoffRow = projection.rows.find((row) => row.month === payoffMonth);
  assert.ok(payoffRow);
  assert.ok(projection.metrics.equityDistributionsRub > 0, "40% equity produces actual cash distributions after capital repayment");
  assert.equal(projection.metrics.postPrincipalCashFlowDistributionsRub, 0, "disabled direct post-principal FCF right cannot pay alongside equity");
  assert.ok(projection.metrics.cashIrr !== null && projection.metrics.cashIrr > 0, "real equity distributions enter cash IRR");
  assert.ok(projection.metrics.cashMoic !== null && projection.metrics.cashMoic > 1, "real equity distributions enter cash MOIC");
  for (const row of projection.rows.filter((row) => row.month < payoffMonth!)) {
    assert.equal(row.equityDistributionRub, 0, `M${row.month}: equity must not activate before capital repayment`);
  }
  assert.ok(payoffRow!.equityDistributionRub > 0, "the same-month excess switches once to residual equity after principal is capped");
  assert.ok(payoffRow!.principalRepaymentRub <= payoffRow!.outstandingPrincipalBeforeRub + payoffRow!.investorDrawdownRub + 0.02);
  assert.deepEqual(investorEconomicsInvariantErrors(projection), []);
});

test("priority waterfall switches from priority cash to residual-equity cash without double distribution", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection(), {
    ...defaultInvestorEconomicsTerms(),
    template: "priority_equity",
    fundingMode: "staged",
    distributionPolicy: "current_cash_flow",
    targetMultiple: 1.05,
    priorityDistributionShare: 0.7,
    residualEquityShare: 0.15,
    postPrincipalCashFlowShare: 0,
  });
  const target = projection.metrics.actualContributionsRub * 1.05;
  const transition = projection.rows.find((row) => row.cumulativeInvestorDistributionsRub + 0.01 >= target);
  assert.ok(transition, "priority target is reached within the deterministic horizon");
  assert.ok(projection.metrics.priorityDistributionsRub > 0);
  assert.ok(projection.metrics.equityDistributionsRub > 0);
  for (const row of projection.rows) {
    assert.ok(row.priorityDistributionRub + row.equityDistributionRub <= row.distributableBusinessCashRub + 0.02);
  }
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

test("Base maturity derives from the governed four-month development lead and approved ramp", () => {
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
    { funding: 0, opening: 4, firstSales: 4, fullPlan: 10 },
  );
});

test("format-specific sequential contract derives the approved 5-point funding, opening and maturity dates", () => {
  const projection = investorEconomicsProjection(fivePointBusinessProjection());
  assert.deepEqual(
    projection.source.cohortMaturity.map((cohort) => ({
      label: cohort.label,
      funding: cohort.fundingMonth,
      lead: cohort.developmentLeadMonths,
      opening: cohort.openingMonth,
      fullPlan: cohort.fullPlanMonth,
      eligible: cohort.firstFcfEligibleMonth,
    })),
    [
      { label: "Базовый объект", funding: 0, lead: 4, opening: 4, fullPlan: 10, eligible: 10 },
      { label: "Креативный кластер", funding: 5, lead: 2, opening: 7, fullPlan: 13, eligible: 13 },
      { label: "Фудхолл", funding: 8, lead: 2, opening: 10, fullPlan: 16, eligible: 16 },
      { label: "Исторический центр · с посадкой", funding: 11, lead: 4, opening: 15, fullPlan: 21, eligible: 21 },
      { label: "Исторический центр · на вынос", funding: 16, lead: 3, opening: 19, fullPlan: 25, eligible: 25 },
    ],
  );
});

test("Creative Cluster prepayment releases dated rent credits without hardcoding programme payback", () => {
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
  assert.ok(current.temporal.network.paybackMonth !== null && legacy.temporal.network.paybackMonth !== null);
  assert.ok(current.temporal.network.paybackMonth! <= legacy.temporal.network.paybackMonth!);
  const creativeFundingMonth = current.temporal.expansion.groups.find((group) => group.cohortId.includes("nevsky-premium"))?.firstFundingMonth;
  assert.equal(creativeFundingMonth, 5);
  const currentFundingMonth = current.temporal.network.months.find((month) => month.month === creativeFundingMonth)!;
  const legacyFundingMonth = legacy.temporal.network.months.find((month) => month.month === creativeFundingMonth)!;
  assert.ok((currentFundingMonth.cashFlowRub ?? 0) < (legacyFundingMonth.cashFlowRub ?? 0), "the larger Creative prepayment is funded with its own M5 cohort launch");
  const creditMonth = current.temporal.network.months.find((month, index) => (month.prepaidRentCreditRub ?? 0) > (legacy.temporal.network.months[index]?.prepaidRentCreditRub ?? 0));
  assert.ok(creditMonth && creditMonth.month >= 9, "the additional prepaid credit begins only after commercial opening and rent holidays");
});

test("sequential rollout remains non-overlapping for 5, 9 and 13 total points", () => {
  for (const size of [4, 8, 12] as const) {
    const initial = defaultInvestorConfiguration();
    const configuration = { ...initial, networkScaling: applyNetworkRolloutPreset(initial.networkScaling, initial.launchBudget, size) };
    const scenario = configuredEconomicsScenario(configuration);
    const temporal = networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario).temporal;
    const waves = temporal.expansion.groups.flatMap((group) => group.openingWaves.map((wave) => ({
      group: group.cohortId,
      funding: wave.fundingMonth,
      opening: wave.openingMonth,
      lead: wave.developmentLeadMonths,
    }))).sort((left, right) => left.funding - right.funding);
    assert.equal(waves.length, size);
    for (const [index, wave] of waves.entries()) {
      assert.equal(wave.opening, wave.funding + wave.lead, `${size + 1}-point programme derives opening from the physical-format lead`);
      const previousOpening = index === 0 ? 4 : waves[index - 1]!.opening;
      assert.equal(wave.funding, previousOpening + 1, `${size + 1}-point programme starts next preparation only after the prior opening`);
      assert.ok(wave.funding > previousOpening, "preparation stages cannot overlap");
    }
  }
});

test("all published discussion scenarios use staged funding on one physical rollout", () => {
  const source = fivePointBusinessProjection();
  const maturity = source.temporal.expansion.groups.map((group) => [group.cohortId, group.firstFundingMonth, group.firstOpeningMonth, group.planLevelMonth]);
  for (const preset of publishedParticipationPresets) {
    assert.equal(preset.terms.fundingMode, "staged", `${preset.id} is not an M0-only public funding scenario`);
    const projection = investorEconomicsProjection(source, preset.terms);
    assert.deepEqual(
      projection.source.cohortMaturity.slice(1).map((cohort) => [cohort.id, cohort.fundingMonth, cohort.openingMonth, cohort.fullPlanMonth]),
      maturity,
      `${preset.id} shares the same physical programme`,
    );
    assert.ok(projection.rows.some((row) => row.month > 0 && row.investorDrawdownRub > 0), `${preset.id} has dated staged contributions`);
  }
  const equity = investorEconomicsProjection(source, publishedParticipationPresets[0]!.terms);
  assert.ok((equity.rows[0]?.investorDrawdownRub ?? 0) < equity.metrics.actualContributionsRub, "public Equity does not contribute all external capital at M0");
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
