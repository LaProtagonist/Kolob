import { defaultInvestorEconomicsTerms, type InvestorEconomicsTerms, type InvestorEconomicsTemplate } from "../lib/investor-economics";

export type PublishedParticipationPreset = {
  id: string;
  template: InvestorEconomicsTemplate;
  label: string;
  note: string;
  status: "discussion";
  calculationHorizonMonths: 60;
  terms: InvestorEconomicsTerms;
};

const base = defaultInvestorEconomicsTerms();

/**
 * Governed discussion presets. These are a public read-only surface, not
 * editable deal terms; candidate terms live only in the internal workbench.
 */
export const publishedParticipationPresets: readonly PublishedParticipationPreset[] = [
  {
    id: "INV-EQUITY-DISCUSSION",
    template: "equity",
    label: "Доля в компании",
    note: "Постоянная доля в компании и распределяемом денежном потоке.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "equity", equityShare: 0.25, fundingMode: "staged", distributionPolicy: "reinvest_first" },
  },
  {
    id: "INV-PRIORITY-DISCUSSION",
    template: "priority_equity",
    label: "Приоритетный возврат + доля",
    note: "Повышенные выплаты до установленной цели, затем доля в компании.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "priority_equity", fundingMode: "staged", distributionPolicy: "current_cash_flow", targetMultiple: 1.3, priorityDistributionShare: 0.8, residualEquityShare: 0.2 },
  },
  {
    id: "INV-CAPPED-DISCUSSION",
    template: "capped_cash_flow",
    label: "Доля в денежном потоке",
    note: "Выплаты до согласованного лимита без постоянной большой доли.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "capped_cash_flow", fundingMode: "staged", distributionPolicy: "current_cash_flow", cashFlowCapMultiple: 1.3, cashFlowShare: 0.5, residualEquityShare: 0 },
  },
  {
    id: "INV-FULL-PROGRAMME-DISCUSSION",
    template: "full_programme",
    label: "Финансирование всей программы",
    note: "Поэтапное финансирование всей программы с возвратом капитала из зрелого денежного потока.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "full_programme", fundingMode: "staged", programmeFundingShare: 1, principalPhaseDistributionShare: 0.8, postPrincipalCashFlowShare: 0.15, residualEquityShare: 0 },
  },
];
