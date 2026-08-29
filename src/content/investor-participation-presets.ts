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
    label: "Долевое участие",
    note: "35% компании · поэтапное финансирование необходимого капитала.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "equity", equityShare: 0.35, fundingMode: "staged", distributionPolicy: "reinvest_first" },
  },
  {
    id: "INV-PRIORITY-DISCUSSION",
    template: "priority_equity",
    label: "Долевое участие с приоритетным возвратом",
    note: "70% FCF до 1,30× · затем 15% компании.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "priority_equity", fundingMode: "staged", distributionPolicy: "current_cash_flow", targetMultiple: 1.3, priorityDistributionShare: 0.7, residualEquityShare: 0.15, postPrincipalCashFlowShare: 0 },
  },
  {
    id: "INV-FULL-PROGRAMME-DISCUSSION",
    template: "full_programme",
    label: "Полное финансирование развития",
    note: "100% программы · 70% FCF на возврат капитала · затем 40% компании.",
    status: "discussion",
    calculationHorizonMonths: 60,
    terms: { ...base, template: "full_programme", fundingMode: "staged", programmeFundingShare: 1, principalPhaseDistributionShare: 0.7, postPrincipalCashFlowShare: 0, residualEquityShare: 0.4, principalRepaymentMode: "cohort_maturity" },
  },
];
