import { useEffect, useMemo, useState } from "react";
import { publishedParticipationPresets, type PublishedParticipationPreset } from "../content/investor-participation-presets";
import { configuredEconomicsScenario } from "../lib/configured-economics";
import { defaultInvestorEconomicsTerms, investorEconomicsProjection, type InvestorEconomicsProjection, type InvestorEconomicsTemplate, type InvestorEconomicsTerms } from "../lib/investor-economics";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import { baseObjectFinancialProjection } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { formatNumber } from "./FormattedNumberInput";
import "./InvestorTerminal.css";

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const formatRub = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${formatNumber(value, true)} ₽`;
const formatPercent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${percent.format(value * 100)}%`;
const formatMultiple = (value: number) => `${value.toFixed(2).replace(".", ",")}×`;
const monthText = (value: number | null) => value === null ? "—" : `М${value}`;
const candidateStorageKey = "kolobochnaya.investor-economics.candidate-terms.v3";
const internalCappedScenarioId = "INTERNAL-CAPPED-CASH-FLOW";

const templateCopy: Record<InvestorEconomicsTemplate, { title: string; note: string }> = {
  equity: { title: "Долевое участие", note: "Доля в компании и поэтапное финансирование необходимого капитала." },
  priority_equity: { title: "Долевое участие с приоритетным возвратом", note: "Приоритетные выплаты до цели, затем доля в компании." },
  capped_cash_flow: { title: "Доля в денежном потоке", note: "Внутренняя аналитическая модель выплат до лимита." },
  full_programme: { title: "Полное финансирование развития", note: "Поэтапное финансирование программы с возвратом капитала и долей в компании." },
};

type ComparisonItem = {
  id: string;
  label: string;
  terms: InvestorEconomicsTerms;
  projection: InvestorEconomicsProjection;
};

type CandidateTermsByScenario = Record<string, InvestorEconomicsTerms>;

function postPrincipalTermText(terms: InvestorEconomicsTerms, horizonMonth: number) {
  if (terms.postPrincipalParticipationTerm === "additional_months") return `ещё ${terms.postPrincipalAdditionalMonths} мес.`;
  if (terms.postPrincipalParticipationTerm === "target_cash_moic") return `до Cash MOIC ${formatMultiple(terms.postPrincipalTargetCashMoic)}`;
  if (terms.postPrincipalParticipationTerm === "unlimited") return `без ограничения · расчёт до М${horizonMonth}`;
  return `до М${horizonMonth}`;
}

function candidateDefaults(): CandidateTermsByScenario {
  return {
    ...Object.fromEntries(publishedParticipationPresets.map((preset) => [preset.id, { ...preset.terms }])),
    [internalCappedScenarioId]: {
      ...defaultInvestorEconomicsTerms(),
      template: "capped_cash_flow",
      fundingMode: "staged",
      distributionPolicy: "current_cash_flow",
      cashFlowCapMultiple: 1.3,
      cashFlowShare: 0.5,
      residualEquityShare: 0,
    },
  };
}

function readCandidateTerms(): CandidateTermsByScenario {
  const defaults = candidateDefaults();
  if (typeof window === "undefined") return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(candidateStorageKey) ?? "null") as Record<string, Partial<InvestorEconomicsTerms>> | null;
    if (!saved || typeof saved !== "object") return defaults;
    return Object.fromEntries(Object.entries(defaults).map(([id, terms]) => [id, { ...terms, ...(saved[id] ?? {}) }]));
  } catch {
    return defaults;
  }
}

function TermsNumber({ value, label, suffix, min = 0, max = 100, step = 1, onChange }: { value: number; label: string; suffix: string; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="investor-economics-field"><span>{label}</span><span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></span></label>;
}

function Metric({ label, value, amount, note, testId }: { label: string; value: string; amount?: number | null; note?: string; testId?: string }) {
  return <div><dt>{label}</dt><dd data-testid={testId} data-amount-rub={amount ?? undefined}>{value}</dd>{note ? <small>{note}</small> : null}</div>;
}

function cashPaybackText(item: ComparisonItem) {
  return monthText(item.terms.template === "full_programme" ? item.projection.metrics.principalPaybackMonth : item.projection.metrics.cashPaybackMonth);
}

function afterCalculationText(item: ComparisonItem, horizonMonth: number) {
  const { terms, projection } = item;
  if (terms.template === "equity" || terms.template === "priority_equity" || projection.metrics.residualEquityShare > 0) return `${formatPercent(projection.metrics.residualEquityShare)} компании`;
  if (terms.template === "capped_cash_flow") return "Прав нет";
  return `${formatPercent(terms.postPrincipalCashFlowShare)} FCF ${postPrincipalTermText(terms, horizonMonth)}`;
}

function scenarioSecondary(item: ComparisonItem) {
  const { terms } = item;
  if (terms.template === "equity") return `${formatPercent(terms.equityShare)} компании · поэтапно`;
  if (terms.template === "priority_equity") return `${formatPercent(terms.priorityDistributionShare)} FCF до ${formatMultiple(terms.targetMultiple)} · затем ${formatPercent(terms.residualEquityShare)} компании`;
  if (terms.template === "capped_cash_flow") return `${formatPercent(terms.cashFlowShare)} FCF до ${formatMultiple(terms.cashFlowCapMultiple)}`;
  return `${formatPercent(terms.programmeFundingShare)} программы · ${formatPercent(terms.principalPhaseDistributionShare)} FCF на возврат · затем ${formatPercent(terms.residualEquityShare)} компании`;
}

function ComparisonTable({ items, horizonMonth, testId }: { items: ComparisonItem[]; horizonMonth: number; testId?: string }) {
  return <div className="investor-economics-table-wrap" data-testid={testId}><table className="investor-economics-comparison-table"><thead><tr><th>Сценарий</th><th>Капитал / обязательство</th><th>Возврат вложений</th><th>Cash IRR к М{horizonMonth}</th><th>Cash MOIC к М{horizonMonth}</th><th>Права инвестора</th></tr></thead><tbody>
    {items.map((item) => <tr key={item.id}><th><strong>{item.label}</strong><small>{scenarioSecondary(item)}</small></th><td>{formatRub(item.projection.metrics.commitmentRub)}</td><td>{cashPaybackText(item)}</td><td>{formatPercent(item.projection.metrics.cashIrr)}</td><td>{item.projection.metrics.cashMoic === null ? "—" : formatMultiple(item.projection.metrics.cashMoic)}</td><td>{afterCalculationText(item, horizonMonth)}</td></tr>)}
  </tbody></table></div>;
}

function firstPaymentNote(projection: InvestorEconomicsProjection, fullProgramme: boolean) {
  const row = projection.rows.find((item) => item.totalInvestorDistributionRub > 0);
  if (!row) return "Выплаты появятся после выполнения условий модели.";
  if (!fullProgramme) return "После выхода на режим и выполнения обязательств по развитию.";
  const cohort = projection.source.cohortMaturity.find((item) => row.matureCohortIds.includes(item.id));
  return cohort ? `После выхода «${cohort.label}» на плановый режим.` : "После выхода первой профинансированной точки на плановый режим.";
}

function priorityTargetMonth(projection: InvestorEconomicsProjection, terms: InvestorEconomicsTerms) {
  const target = projection.metrics.actualContributionsRub * terms.targetMultiple;
  return projection.rows.find((row) => row.cumulativeInvestorDistributionsRub + 0.01 >= target)?.month ?? null;
}

function MaturityTable({ projection, internal = false }: { projection: InvestorEconomicsProjection; internal?: boolean }) {
  return <details className="investor-economics-maturity" open={internal || undefined}><summary>Когда денежный поток становится доступен</summary><p>FCF каждого объекта может участвовать в выплатах только после выхода этого объекта на плановый режим.</p><div className="investor-economics-table-wrap"><table><thead><tr><th>Объект</th>{internal ? <th>Формат</th> : null}<th>Финансирование</th><th>Срок подготовки</th><th>Открытие / первые продажи</th><th>Плановый режим</th><th>Первый зрелый FCF</th></tr></thead><tbody>{projection.source.cohortMaturity.map((cohort) => <tr key={cohort.id}><th>{cohort.label}</th>{internal ? <td>{cohort.formatLabel}</td> : null}<td>М{cohort.fundingMonth}</td><td>{cohort.developmentLeadMonths} мес.</td><td>М{cohort.openingMonth}</td><td>М{cohort.fullPlanMonth}</td><td>М{cohort.firstFcfEligibleMonth}</td></tr>)}</tbody></table></div></details>;
}

function SelectedSummary({ projection, terms, horizonMonth, eyebrow = "Выбранные условия участия", testId }: { projection: InvestorEconomicsProjection; terms: InvestorEconomicsTerms; horizonMonth: number; eyebrow?: string; testId?: string }) {
  const isFullProgramme = terms.template === "full_programme";
  const isEquity = terms.template === "equity";
  const isPriority = terms.template === "priority_equity";
  return <aside className="investor-economics-summary" aria-label="Итог выбранного сценария" data-testid={testId}><p>{eyebrow}</p><h3>{templateCopy[terms.template].title}</h3><dl>
    {isFullProgramme ? <>
      <Metric label="Обязательство" value={formatRub(projection.metrics.commitmentRub)} amount={projection.metrics.commitmentRub} testId="economics-commitment" />
      <Metric label="Фактически внесено" value={formatRub(projection.metrics.actualContributionsRub)} amount={projection.metrics.actualContributionsRub} testId="economics-actual-contributions" />
      <Metric label="Максимум капитала в работе" value={formatRub(projection.metrics.peakOutstandingCapitalRub)} amount={projection.metrics.peakOutstandingCapitalRub} />
      <Metric label="Первый возврат" value={monthText(projection.metrics.firstPrincipalRepaymentMonth)} />
      <Metric label="Капитал возвращён" value={monthText(projection.metrics.principalPaybackMonth)} />
      <Metric label={`Выплаты к М${horizonMonth}`} value={formatRub(projection.metrics.totalDistributionsRub)} amount={projection.metrics.totalDistributionsRub} />
      <Metric label={`Cash IRR к М${horizonMonth}`} value={formatPercent(projection.metrics.cashIrr)} />
      <Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} />
      <Metric label="Доля в компании после возврата" value={formatPercent(projection.metrics.residualEquityShare)} />
    </> : <>
      <Metric label="Вложено" value={formatRub(projection.metrics.actualContributionsRub)} amount={projection.metrics.actualContributionsRub} testId="economics-actual-contributions" />
      <Metric label="Первые выплаты" value={monthText(projection.metrics.firstDistributionMonth)} />
      {isPriority ? <Metric label="Цель приоритетного возврата" value={formatMultiple(terms.targetMultiple)} note={`Достигнута: ${monthText(priorityTargetMonth(projection, terms))}`} /> : null}
      <Metric label="Вложения окуплены выплатами" value={monthText(projection.metrics.cashPaybackMonth)} />
      <Metric label={`Выплаты к М${horizonMonth}`} value={formatRub(projection.metrics.totalDistributionsRub)} amount={projection.metrics.totalDistributionsRub} />
      <Metric label={`Cash IRR к М${horizonMonth}`} value={formatPercent(projection.metrics.cashIrr)} />
      <Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} />
      <Metric label={isEquity ? "Доля в компании" : isPriority ? "Доля в компании после цели" : "Права инвестора"} value={isEquity ? formatPercent(projection.metrics.residualEquityShare) : isPriority ? formatPercent(projection.metrics.residualEquityShare) : afterCalculationText({ id: "selected", label: "selected", terms, projection }, horizonMonth)} />
    </>}
  </dl>{isEquity ? <div className="investor-economics-valuation"><span>Оценка после инвестиции</span><strong>{formatRub(projection.metrics.impliedPostMoneyRub)}</strong><span>Оценка до инвестиции</span><strong>{formatRub(projection.metrics.impliedPreMoneyRub)}</strong><small>Оценка следует из выбранных условий сделки, а не является независимой рыночной оценкой компании.</small></div> : null}<p className="investor-economics-status">Предварительный расчёт: требуется проверка мощности производства.</p></aside>;
}

function Waterfall({ projection, principalBased }: { projection: InvestorEconomicsProjection; principalBased: boolean }) {
  return <details className="investor-economics-waterfall"><summary>Показать помесячный расчёт</summary><p>Сначала учитываются обязательства программы и ликвидность. В выплаты попадает только FCF объектов, вышедших на плановый режим.</p><div className="investor-economics-table-wrap" data-testid="economics-waterfall-scroll"><table><thead><tr><th>Месяц</th><th>Взнос инвестора</th><th>Доступный денежный поток</th><th>Всего выплачено</th>{principalBased ? <><th>Капитал до выплаты</th><th>Возврат капитала</th><th>Доход инвестора</th><th>Остаток капитала</th></> : null}<th>Потребность программы</th><th>Нераспределённый денежный поток</th></tr></thead><tbody>{projection.rows.map((row) => <tr key={row.month}><th>М{row.month}</th><td>{formatRub(row.investorDrawdownRub)}</td><td>{formatRub(row.distributableBusinessCashRub)}</td><td>{formatRub(row.totalInvestorDistributionRub)}</td>{principalBased ? <><td>{formatRub(row.outstandingPrincipalBeforeRub)}</td><td>{formatRub(row.principalRepaymentRub)}</td><td>{formatRub(row.investorReturnRub)}</td><td>{formatRub(row.outstandingPrincipalAfterRub)}</td></> : null}<td>{formatRub(row.rolloutFundingRequirementRub)}</td><td>{formatRub(row.businessCashRetainedRub)}</td></tr>)}</tbody></table></div></details>;
}

function scenarioTerms(terms: InvestorEconomicsTerms) {
  if (terms.template === "equity") return [["Доля в компании", formatPercent(terms.equityShare)], ["Финансирование", terms.fundingMode === "staged" ? "По этапам" : "Вся сумма в начале"]];
  if (terms.template === "priority_equity") return [["Доля FCF до цели", formatPercent(terms.priorityDistributionShare)], ["Цель", formatMultiple(terms.targetMultiple)], ["Доля в компании после цели", formatPercent(terms.residualEquityShare)], ["Финансирование", terms.fundingMode === "staged" ? "По этапам" : "Вся сумма в начале"]];
  if (terms.template === "full_programme") return [["Финансирование программы", formatPercent(terms.programmeFundingShare)], ["Доля FCF на возврат капитала", formatPercent(terms.principalPhaseDistributionShare)], ["Доля в компании после возврата", formatPercent(terms.residualEquityShare)], ["Финансирование", terms.fundingMode === "staged" ? "По этапам" : "Вся сумма в начале"]];
  return [["Доля денежного потока", formatPercent(terms.cashFlowShare)], ["Лимит выплат", formatMultiple(terms.cashFlowCapMultiple)], ["Финансирование", terms.fundingMode === "staged" ? "По этапам" : "Вся сумма в начале"]];
}

function PublishedCandidateTable({ published, candidate, horizonMonth }: { published: ComparisonItem; candidate: ComparisonItem; horizonMonth: number }) {
  const termRows = scenarioTerms(candidate.terms).map(([label, candidateValue], index) => [label, scenarioTerms(published.terms)[index]?.[1] ?? "—", candidateValue, "—"] as const);
  const numericRows = [
    ["Капитал / обязательство", formatRub(published.projection.metrics.commitmentRub), formatRub(candidate.projection.metrics.commitmentRub), formatRub((candidate.projection.metrics.commitmentRub ?? 0) - (published.projection.metrics.commitmentRub ?? 0))],
    ["Первые выплаты", monthText(published.projection.metrics.firstDistributionMonth), monthText(candidate.projection.metrics.firstDistributionMonth), "—"],
    ["Возврат вложений", cashPaybackText(published), cashPaybackText(candidate), "—"],
    [`Выплаты к М${horizonMonth}`, formatRub(published.projection.metrics.totalDistributionsRub), formatRub(candidate.projection.metrics.totalDistributionsRub), formatRub(candidate.projection.metrics.totalDistributionsRub - published.projection.metrics.totalDistributionsRub)],
    [`Cash IRR к М${horizonMonth}`, formatPercent(published.projection.metrics.cashIrr), formatPercent(candidate.projection.metrics.cashIrr), "—"],
    [`Cash MOIC к М${horizonMonth}`, published.projection.metrics.cashMoic === null ? "—" : formatMultiple(published.projection.metrics.cashMoic), candidate.projection.metrics.cashMoic === null ? "—" : formatMultiple(candidate.projection.metrics.cashMoic), "—"],
    ["Права инвестора", afterCalculationText(published, horizonMonth), afterCalculationText(candidate, horizonMonth), "—"],
  ] as const;
  return <div className="investor-economics-table-wrap" data-testid="published-candidate-comparison"><table className="investor-economics-delta-table"><thead><tr><th>Показатель</th><th>Опубликовано</th><th>Текущий вариант</th><th>Δ</th></tr></thead><tbody>{[...termRows, ...numericRows].map(([label, publishedValue, candidateValue, delta]) => <tr key={label}><th>{label}</th><td>{publishedValue}</td><td>{candidateValue}</td><td>{delta}</td></tr>)}</tbody></table></div>;
}

function PublishedSnapshot({ preset, projection, horizonMonth }: { preset: PublishedParticipationPreset; projection: InvestorEconomicsProjection; horizonMonth: number }) {
  return <section className="investor-economics-card investor-economics-published" data-testid="published-scenario"><header><p>Опубликовано</p><h3>{preset.label}</h3></header><dl><Metric label="Условия" value={scenarioSecondary({ id: preset.id, label: preset.label, terms: preset.terms, projection })} /><Metric label="Капитал / обязательство" value={formatRub(projection.metrics.commitmentRub)} amount={projection.metrics.commitmentRub} /><Metric label="Возврат вложений" value={cashPaybackText({ id: preset.id, label: preset.label, terms: preset.terms, projection })} /><Metric label={`Cash IRR к М${horizonMonth}`} value={formatPercent(projection.metrics.cashIrr)} /><Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} /></dl></section>;
}

function CandidateControls({ terms, set }: { terms: InvestorEconomicsTerms; set: (next: Partial<InvestorEconomicsTerms>) => void }) {
  const isFullProgramme = terms.template === "full_programme";
  return <div className="investor-economics-fields"><label className="investor-economics-field"><span>Финансирование</span><select value={terms.fundingMode} onChange={(event) => set({ fundingMode: event.target.value as InvestorEconomicsTerms["fundingMode"] })}><option value="staged">По этапам</option><option value="upfront">Вся сумма в начале</option></select></label>{!isFullProgramme ? <label className="investor-economics-field"><span>Распределение</span><select value={terms.distributionPolicy} onChange={(event) => set({ distributionPolicy: event.target.value as InvestorEconomicsTerms["distributionPolicy"] })}><option value="reinvest_first">Сначала развитие</option><option value="current_cash_flow">Ранние выплаты</option></select></label> : null}{terms.template === "equity" ? <TermsNumber label="Доля в компании" value={Math.round(terms.equityShare * 100)} suffix="%" max={100} onChange={(value) => set({ equityShare: value / 100 })} /> : null}{terms.template === "priority_equity" ? <><TermsNumber label="Доля FCF до цели" value={Math.round(terms.priorityDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ priorityDistributionShare: value / 100 })} /><TermsNumber label="Целевая выплата" value={terms.targetMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ targetMultiple: value })} /><TermsNumber label="Доля в компании после цели" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100, postPrincipalCashFlowShare: 0 })} /></> : null}{terms.template === "capped_cash_flow" ? <><TermsNumber label="Лимит выплат" value={terms.cashFlowCapMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ cashFlowCapMultiple: value })} /><TermsNumber label="Доля денежного потока" value={Math.round(terms.cashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ cashFlowShare: value / 100 })} /><TermsNumber label="Доля в компании после лимита" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} /></> : null}{isFullProgramme ? <><TermsNumber label="Финансирование программы" value={Math.round(terms.programmeFundingShare * 100)} suffix="%" max={100} onChange={(value) => set({ programmeFundingShare: value / 100 })} /><TermsNumber label="Доля FCF на возврат капитала" value={Math.round(terms.principalPhaseDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ principalPhaseDistributionShare: value / 100 })} /><TermsNumber label="Доля в компании после возврата" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100, postPrincipalCashFlowShare: value > 0 ? 0 : terms.postPrincipalCashFlowShare })} />{terms.residualEquityShare <= 0 ? <TermsNumber label="Прямая доля FCF после возврата" value={Math.round(terms.postPrincipalCashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ postPrincipalCashFlowShare: value / 100 })} /> : <p className="investor-economics-field-note">После возврата капитала выплаты идут только через долю в компании.</p>}<label className="investor-economics-field"><span>Начало возврата капитала</span><select value={terms.principalRepaymentMode} onChange={(event) => set({ principalRepaymentMode: event.target.value as InvestorEconomicsTerms["principalRepaymentMode"] })}><option value="cohort_maturity">После выхода объектов на режим</option><option value="after_programme_funding">После финансирования программы</option></select></label></> : null}</div>;
}

export function ParticipationWorkbench() {
  const { configuration } = useInvestorConfiguration();
  const [selectedScenarioId, setSelectedScenarioId] = useState(publishedParticipationPresets[0]!.id);
  const [candidateTermsByScenario, setCandidateTermsByScenario] = useState<CandidateTermsByScenario>(readCandidateTerms);
  const scenario = useMemo(() => configuredEconomicsScenario(configuration), [configuration]);
  const source = useMemo(() => networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario), [configuration, scenario]);
  const selectedPreset = publishedParticipationPresets.find((preset) => preset.id === selectedScenarioId) ?? null;
  const candidateTerms = candidateTermsByScenario[selectedScenarioId] ?? (selectedPreset ? selectedPreset.terms : candidateDefaults()[internalCappedScenarioId]);
  const candidateProjection = useMemo(() => investorEconomicsProjection(source, candidateTerms), [source, candidateTerms]);
  const publishedProjection = useMemo(() => selectedPreset ? investorEconomicsProjection(source, selectedPreset.terms) : null, [source, selectedPreset]);
  const horizonMonth = candidateProjection.rows.at(-1)?.month ?? 60;
  const publishedItems = useMemo(() => publishedParticipationPresets.map((preset) => ({ id: preset.id, label: preset.label, terms: preset.terms, projection: investorEconomicsProjection(source, preset.terms) })), [source]);
  const candidateItems = useMemo(() => publishedParticipationPresets.map((preset) => {
    const terms = candidateTermsByScenario[preset.id] ?? preset.terms;
    return { id: preset.id, label: preset.label, terms, projection: investorEconomicsProjection(source, terms) };
  }), [source, candidateTermsByScenario]);
  const programmeInvestment = candidateProjection.source.totalProgramInvestmentRub;
  const currentFunding = candidateProjection.source.currentExternalFundingRequirementRub;
  const selfFinancing = programmeInvestment === null || currentFunding === null ? null : programmeInvestment - currentFunding;
  const candidateItem: ComparisonItem = { id: selectedScenarioId, label: selectedPreset?.label ?? templateCopy.capped_cash_flow.title, terms: candidateTerms, projection: candidateProjection };
  const publishedItem: ComparisonItem | null = selectedPreset && publishedProjection ? { id: selectedPreset.id, label: selectedPreset.label, terms: selectedPreset.terms, projection: publishedProjection } : null;
  const set = (next: Partial<InvestorEconomicsTerms>) => setCandidateTermsByScenario((current) => ({ ...current, [selectedScenarioId]: { ...candidateTerms, ...next } }));
  const resetToPublished = () => {
    if (selectedPreset) setCandidateTermsByScenario((current) => ({ ...current, [selectedPreset.id]: { ...selectedPreset.terms } }));
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(candidateStorageKey, JSON.stringify(candidateTermsByScenario));
    } catch {
      // A blocked local store affects convenience only; governed presets stay independent.
    }
  }, [candidateTermsByScenario]);

  return <section className="investor-economics" data-testid="investor-economics-panel">
    <header className="investor-economics-header"><div><p>Условия участия</p><h2>Рабочая модель</h2></div><span>Текущий вариант не меняет опубликованные сценарии.</span></header>
    <section className="investor-economics-programme" aria-label="Базовый план финансирования"><div><p>Базовый план финансирования</p><h3>Финансирование по этапам</h3><small>При базовом сценарии часть следующих открытий финансируется денежным потоком уже работающих точек.</small></div><dl><Metric label="Стоимость программы" value={formatRub(programmeInvestment)} amount={programmeInvestment} testId="economics-programme-investment" /><Metric label="Нужно привлечь" value={formatRub(currentFunding)} amount={currentFunding} testId="economics-current-external-funding" /><Metric label="Покроет сам бизнес" value={formatRub(selfFinancing)} amount={selfFinancing} testId="economics-business-self-financing" /><Metric label="Окупаемость программы" value={monthText(candidateProjection.source.programmePaybackMonth)} note="Не является сроком возврата вложений инвестору." /></dl><p className="investor-economics-funding-identity">Нужно привлечь + покроет сам бизнес = стоимость программы.</p></section>
    <section className="investor-economics-templates" aria-label="Сценарии для публикации"><p>Сценарии для публикации</p><div className="investor-economics-template-buttons">{publishedParticipationPresets.map((preset) => <button key={preset.id} type="button" className={selectedScenarioId === preset.id ? "is-selected" : ""} data-testid={`workbench-scenario-${preset.id}`} onClick={() => setSelectedScenarioId(preset.id)}><strong>{preset.label}</strong><small>{preset.note}</small></button>)}</div><details className="investor-economics-internal-models"><summary>Дополнительные модели</summary><button type="button" className={selectedScenarioId === internalCappedScenarioId ? "is-selected" : ""} data-testid="workbench-scenario-capped" onClick={() => setSelectedScenarioId(internalCappedScenarioId)}><strong>Доля в денежном потоке</strong><small>Внутренняя аналитическая модель; не публикуется.</small></button></details></section>
    <div className="investor-economics-workspace"><div className="investor-economics-controls"><section className="investor-economics-card"><header><p>Настройки candidate</p><h3>{candidateItem.label}</h3></header><CandidateControls terms={candidateTerms} set={set} /><div className="investor-economics-card-actions">{selectedPreset ? <button type="button" onClick={resetToPublished} data-testid="candidate-reset">Вернуть опубликованные значения</button> : null}</div><p className="investor-economics-helper">Изменения пересчитываются сразу и остаются только в рабочем варианте.</p></section>{selectedPreset && publishedProjection ? <PublishedSnapshot preset={selectedPreset} projection={publishedProjection} horizonMonth={horizonMonth} /> : null}{publishedItem ? <section className="investor-economics-card investor-economics-comparison"><header><p>Сравнение</p><h3>Опубликовано и текущий вариант</h3></header><PublishedCandidateTable published={publishedItem} candidate={candidateItem} horizonMonth={horizonMonth} /></section> : null}<section className="investor-economics-card investor-economics-comparison"><header><p>Текущие варианты</p><h3>Три сценария для публикации</h3></header><ComparisonTable items={candidateItems} horizonMonth={horizonMonth} testId="candidate-all-scenario-comparison" /><details className="investor-economics-all-variants"><summary>Опубликованные сценарии</summary><ComparisonTable items={publishedItems} horizonMonth={horizonMonth} testId="published-all-scenario-comparison" /></details></section></div><SelectedSummary projection={candidateProjection} terms={candidateTerms} horizonMonth={horizonMonth} eyebrow="Текущий вариант" testId="candidate-selected-summary" /></div>
    <MaturityTable projection={candidateProjection} internal /><Waterfall projection={candidateProjection} principalBased={candidateTerms.template === "full_programme"} /><p className="investor-economics-first-payment">Первые выплаты: {monthText(candidateProjection.metrics.firstDistributionMonth)} · {firstPaymentNote(candidateProjection, candidateTerms.template === "full_programme")}</p>
  </section>;
}

/** Read-only investor-facing presentation of the governed discussion presets. */
export function InvestorEconomicsPanel() {
  const { configuration } = useInvestorConfiguration();
  const [selectedPresetId, setSelectedPresetId] = useState(publishedParticipationPresets[0]!.id);
  const scenario = useMemo(() => configuredEconomicsScenario(configuration), [configuration]);
  const source = useMemo(() => networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario), [configuration, scenario]);
  const selected = publishedParticipationPresets.find((preset) => preset.id === selectedPresetId) ?? publishedParticipationPresets[0]!;
  const projection = useMemo(() => investorEconomicsProjection(source, selected.terms), [source, selected]);
  const comparison = useMemo(() => publishedParticipationPresets.map((preset) => ({ id: preset.id, label: preset.label, terms: preset.terms, projection: investorEconomicsProjection(source, preset.terms) })), [source]);
  const programmeInvestment = projection.source.totalProgramInvestmentRub;
  const currentFunding = projection.source.currentExternalFundingRequirementRub;
  const selfFinancing = programmeInvestment === null || currentFunding === null ? null : programmeInvestment - currentFunding;
  const horizonMonth = projection.rows.at(-1)?.month ?? selected.calculationHorizonMonths;
  return <section className="investor-economics investor-economics-public" data-testid="investor-economics-public">
    <header className="investor-economics-header"><div><p>Условия участия</p><h2>Сценарии для обсуждения</h2></div><span>Экономическая модель, не юридическое предложение.</span></header>
    <section className="investor-economics-programme" aria-label="Базовый план финансирования"><div><p>Базовый план финансирования</p><h3>Финансирование по этапам</h3><small>При базовом сценарии часть следующих открытий финансируется денежным потоком уже работающих точек.</small></div><dl><Metric label="Стоимость программы" value={formatRub(programmeInvestment)} amount={programmeInvestment} testId="economics-programme-investment" /><Metric label="Нужно привлечь" value={formatRub(currentFunding)} amount={currentFunding} testId="economics-current-external-funding" /><Metric label="Покроет сам бизнес" value={formatRub(selfFinancing)} amount={selfFinancing} testId="economics-business-self-financing" /><Metric label="Окупаемость программы" value={monthText(projection.source.programmePaybackMonth)} note="Не является сроком возврата вложений инвестору." /></dl><p className="investor-economics-funding-identity">Нужно привлечь + покроет сам бизнес = стоимость программы.</p></section>
    <section className="investor-economics-templates" aria-label="Сценарии для обсуждения"><p>Выберите сценарий</p><div className="investor-economics-template-buttons">{publishedParticipationPresets.map((preset) => <button key={preset.id} type="button" className={selected.id === preset.id ? "is-selected" : ""} data-testid={`public-preset-${preset.id}`} onClick={() => setSelectedPresetId(preset.id)}><strong>{preset.label}</strong><small>{preset.note}</small></button>)}</div></section>
    <section className="investor-economics-card investor-economics-comparison"><header><p>Сравнение</p><h3>Три сценария</h3></header><ComparisonTable items={comparison} horizonMonth={horizonMonth} /></section>
    <div className="investor-economics-workspace"><section className="investor-economics-card"><header><p>Подробности выбранного сценария</p><h3>{selected.label}</h3></header><p className="investor-economics-helper">{selected.note} Параметры являются сценарными условиями для обсуждения.</p><MaturityTable projection={projection} /><Waterfall projection={projection} principalBased={selected.template === "full_programme"} /><p className="investor-economics-first-payment">Первые выплаты: {monthText(projection.metrics.firstDistributionMonth)} · {firstPaymentNote(projection, selected.template === "full_programme")}</p></section><SelectedSummary projection={projection} terms={selected.terms} horizonMonth={horizonMonth} /></div>
  </section>;
}
