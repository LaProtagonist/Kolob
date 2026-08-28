import { useMemo, useState } from "react";
import { configuredEconomicsScenario } from "../lib/configured-economics";
import { defaultInvestorEconomicsTerms, investorEconomicsComparison, investorEconomicsProjection, investorEconomicsTemplateIds, type InvestorEconomicsProjection, type InvestorEconomicsTemplate, type InvestorEconomicsTerms } from "../lib/investor-economics";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import { baseObjectFinancialProjection } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { formatNumber } from "./FormattedNumberInput";
import { publishedParticipationPresets } from "../content/investor-participation-presets";
import "./InvestorTerminal.css";

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const formatRub = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${formatNumber(value, true)} ₽`;
const formatPercent = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${percent.format(value * 100)}%`;
const formatMultiple = (value: number) => `${value.toFixed(2).replace(".", ",")}×`;
const monthText = (value: number | null) => value === null ? "—" : `М${value}`;

const templateCopy: Record<InvestorEconomicsTemplate, { title: string; note: string }> = {
  equity: { title: "Доля в компании", note: "Постоянная доля в компании и распределяемом денежном потоке." },
  priority_equity: { title: "Приоритетный возврат + доля", note: "Повышенная выплата до цели, затем доля в компании." },
  capped_cash_flow: { title: "Доля в денежном потоке", note: "Выплаты до согласованного лимита." },
  full_programme: { title: "Финансирование всей программы", note: "Поэтапное финансирование с возвратом капитала из зрелого FCF." },
};

function postPrincipalTermText(terms: InvestorEconomicsTerms, horizonMonth: number) {
  if (terms.postPrincipalParticipationTerm === "additional_months") return `ещё ${terms.postPrincipalAdditionalMonths} мес.`;
  if (terms.postPrincipalParticipationTerm === "target_cash_moic") return `до Cash MOIC ${formatMultiple(terms.postPrincipalTargetCashMoic)}`;
  if (terms.postPrincipalParticipationTerm === "unlimited") return `без ограничения · расчёт до М${horizonMonth}`;
  return `до М${horizonMonth}`;
}

function TermsNumber({ value, label, suffix, min = 0, max = 100, step = 1, onChange }: { value: number; label: string; suffix: string; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="investor-economics-field"><span>{label}</span><span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></span></label>;
}

function Metric({ label, value, amount, note, testId }: { label: string; value: string; amount?: number | null; note?: string; testId?: string }) {
  return <div><dt>{label}</dt><dd data-testid={testId} data-amount-rub={amount ?? undefined}>{value}</dd>{note ? <small>{note}</small> : null}</div>;
}

type ComparisonItem = ReturnType<typeof investorEconomicsComparison>[number];

function cashPaybackText(item: ComparisonItem) {
  const isPrincipalBased = item.terms.template === "full_programme";
  return monthText(isPrincipalBased ? item.projection.metrics.principalPaybackMonth : item.projection.metrics.cashPaybackMonth);
}

function afterCalculationText(item: ComparisonItem, horizonMonth: number) {
  const { terms, projection } = item;
  if (terms.template === "equity" || terms.template === "priority_equity") return `${formatPercent(projection.metrics.residualEquityShare)} компании`;
  if (terms.template === "capped_cash_flow") return projection.metrics.residualEquityShare > 0 ? `${formatPercent(projection.metrics.residualEquityShare)} компании` : "Прав нет";
  if (projection.metrics.residualEquityShare > 0) return `${formatPercent(projection.metrics.residualEquityShare)} компании`;
  return `${formatPercent(terms.postPrincipalCashFlowShare)} FCF ${postPrincipalTermText(terms, horizonMonth)}`;
}

function scenarioSecondary(item: ComparisonItem) {
  const { terms } = item;
  if (terms.template === "equity") return `${formatPercent(terms.equityShare)} компании`;
  if (terms.template === "priority_equity") return `${formatMultiple(terms.targetMultiple)} + ${formatPercent(terms.residualEquityShare)} компании`;
  if (terms.template === "capped_cash_flow") return `${formatPercent(terms.cashFlowShare)} FCF до ${formatMultiple(terms.cashFlowCapMultiple)}`;
  return `${formatPercent(terms.principalPhaseDistributionShare)} FCF до возврата · ${formatPercent(terms.postPrincipalCashFlowShare)} после`;
}

function ComparisonTable({ items, horizonMonth }: { items: ComparisonItem[]; horizonMonth: number }) {
  return <div className="investor-economics-table-wrap"><table className="investor-economics-comparison-table"><thead><tr><th>Сценарий</th><th>Капитал / обязательство</th><th>Возврат вложений</th><th>Cash IRR к М{horizonMonth}</th><th>Cash MOIC к М{horizonMonth}</th><th>Права инвестора</th></tr></thead><tbody>
    {items.map((item) => <tr key={item.id}><th><strong>{templateCopy[item.terms.template].title}</strong><small>{scenarioSecondary(item)}</small></th><td>{formatRub(item.projection.metrics.commitmentRub)}</td><td>{cashPaybackText(item)}</td><td>{formatPercent(item.projection.metrics.cashIrr)}</td><td>{item.projection.metrics.cashMoic === null ? "—" : formatMultiple(item.projection.metrics.cashMoic)}</td><td>{afterCalculationText(item, horizonMonth)}</td></tr>)}
  </tbody></table></div>;
}

function firstPaymentNote(projection: InvestorEconomicsProjection, fullProgramme: boolean) {
  const row = projection.rows.find((item) => item.totalInvestorDistributionRub > 0);
  if (!row) return "Выплаты появятся после выполнения условий модели.";
  if (!fullProgramme) return "После выхода на режим и выполнения обязательств по развитию.";
  const cohort = projection.source.cohortMaturity.find((item) => row.matureCohortIds.includes(item.id));
  return cohort ? `После выхода «${cohort.label}» на плановый режим.` : "После выхода первой профинансированной точки на плановый режим.";
}

function MaturityTable({ projection, internal = false }: { projection: InvestorEconomicsProjection; internal?: boolean }) {
  return <details className="investor-economics-maturity" open={internal || undefined}><summary>Когда денежный поток становится доступен</summary><p>FCF каждого объекта может участвовать в выплатах только после выхода этого объекта на плановый режим.</p><div className="investor-economics-table-wrap"><table><thead><tr><th>Объект</th>{internal ? <th>Формат</th> : null}<th>Финансирование</th><th>Срок подготовки</th><th>Открытие / первые продажи</th><th>Плановый режим</th><th>Первый зрелый FCF</th></tr></thead><tbody>{projection.source.cohortMaturity.map((cohort) => <tr key={cohort.id}><th>{cohort.label}</th>{internal ? <td>{cohort.formatLabel}</td> : null}<td>М{cohort.fundingMonth}</td><td>{cohort.developmentLeadMonths} мес.</td><td>М{cohort.openingMonth}</td><td>М{cohort.fullPlanMonth}</td><td>М{cohort.firstFcfEligibleMonth}</td></tr>)}</tbody></table></div></details>;
}

function SelectedSummary({ projection, terms, horizonMonth }: { projection: InvestorEconomicsProjection; terms: InvestorEconomicsTerms; horizonMonth: number }) {
  const isFullProgramme = terms.template === "full_programme";
  const isEquity = terms.template === "equity";
  const selected: ComparisonItem = { id: "selected", label: "selected", terms, projection };
  return <aside className="investor-economics-summary" aria-label="Итог выбранного сценария"><p>Выбранные условия участия</p><h3>{templateCopy[terms.template].title}</h3><dl>
    {isFullProgramme ? <>
      <Metric label="Обязательство инвестора" value={formatRub(projection.metrics.commitmentRub)} amount={projection.metrics.commitmentRub} testId="economics-commitment" />
      <Metric label="Фактически внесено" value={formatRub(projection.metrics.actualContributionsRub)} amount={projection.metrics.actualContributionsRub} testId="economics-actual-contributions" />
      <Metric label="Максимум капитала в работе" value={formatRub(projection.metrics.peakOutstandingCapitalRub)} amount={projection.metrics.peakOutstandingCapitalRub} />
      <Metric label="Возвращено капитала" value={formatRub(projection.metrics.principalRepaidRub)} amount={projection.metrics.principalRepaidRub} testId="economics-principal-repaid" />
      <Metric label="Остаток капитала" value={formatRub(projection.metrics.outstandingPrincipalRub)} amount={projection.metrics.outstandingPrincipalRub} testId="economics-principal-outstanding" />
      <Metric label="Первый возврат" value={monthText(projection.metrics.firstPrincipalRepaymentMonth)} />
      <Metric label="Капитал возвращён" value={monthText(projection.metrics.principalPaybackMonth)} />
      <Metric label={`Доход к М${horizonMonth}`} value={formatRub(projection.metrics.investorReturnRub)} amount={projection.metrics.investorReturnRub} testId="economics-investor-return" />
      <Metric label={`Выплаты к М${horizonMonth}`} value={formatRub(projection.metrics.totalDistributionsRub)} amount={projection.metrics.totalDistributionsRub} />
      <Metric label={`Cash IRR к М${horizonMonth}`} value={formatPercent(projection.metrics.cashIrr)} />
      <Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} />
      <Metric label="Права инвестора" value={`${formatPercent(projection.metrics.postPrincipalCashFlowShare)} FCF ${postPrincipalTermText(terms, horizonMonth)}`} />
      {projection.metrics.residualEquityShare > 0 ? <Metric label="Остаточная доля" value={formatPercent(projection.metrics.residualEquityShare)} /> : null}
    </> : <>
      <Metric label="Вложено" value={formatRub(projection.metrics.actualContributionsRub)} amount={projection.metrics.actualContributionsRub} testId="economics-actual-contributions" />
      <Metric label="Первые выплаты" value={monthText(projection.metrics.firstDistributionMonth)} />
      <Metric label="Вложения окуплены выплатами" value={monthText(projection.metrics.cashPaybackMonth)} />
      <Metric label={`Выплаты к М${horizonMonth}`} value={formatRub(projection.metrics.totalDistributionsRub)} amount={projection.metrics.totalDistributionsRub} />
      <Metric label={`Cash IRR к М${horizonMonth}`} value={formatPercent(projection.metrics.cashIrr)} />
      <Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} />
      <Metric label={isEquity ? "Доля в компании остаётся" : "Права инвестора"} value={isEquity ? formatPercent(projection.metrics.residualEquityShare) : afterCalculationText(selected, horizonMonth)} />
    </>}
  </dl>{isEquity ? <div className="investor-economics-valuation"><span>Оценка после инвестиции</span><strong>{formatRub(projection.metrics.impliedPostMoneyRub)}</strong><span>Оценка до инвестиции</span><strong>{formatRub(projection.metrics.impliedPreMoneyRub)}</strong><small>Оценка следует из выбранных условий сделки, а не является независимой рыночной оценкой компании.</small></div> : null}<p className="investor-economics-status">Предварительный расчёт: требуется проверка мощности производства.</p></aside>;
}

function Waterfall({ projection, principalBased }: { projection: InvestorEconomicsProjection; principalBased: boolean }) {
  return <details className="investor-economics-waterfall"><summary>Показать помесячный расчёт</summary><p>Сначала учитываются обязательства программы и ликвидность. В выплаты попадает только FCF объектов, вышедших на плановый режим.</p><div className="investor-economics-table-wrap" data-testid="economics-waterfall-scroll"><table><thead><tr><th>Месяц</th><th>Взнос инвестора</th><th>Доступный денежный поток</th><th>Всего выплачено</th>{principalBased ? <><th>Капитал до выплаты</th><th>Возврат капитала</th><th>Доход инвестора</th><th>Остаток капитала</th></> : null}<th>Потребность программы</th><th>Нераспределённый денежный поток</th></tr></thead><tbody>{projection.rows.map((row) => <tr key={row.month}><th>М{row.month}</th><td>{formatRub(row.investorDrawdownRub)}</td><td>{formatRub(row.distributableBusinessCashRub)}</td><td>{formatRub(row.totalInvestorDistributionRub)}</td>{principalBased ? <><td>{formatRub(row.outstandingPrincipalBeforeRub)}</td><td>{formatRub(row.principalRepaymentRub)}</td><td>{formatRub(row.investorReturnRub)}</td><td>{formatRub(row.outstandingPrincipalAfterRub)}</td></> : null}<td>{formatRub(row.rolloutFundingRequirementRub)}</td><td>{formatRub(row.businessCashRetainedRub)}</td></tr>)}</tbody></table></div></details>;
}

export function ParticipationWorkbench() {
  const { configuration } = useInvestorConfiguration();
  const [terms, setTerms] = useState<InvestorEconomicsTerms>(defaultInvestorEconomicsTerms);
  const scenario = useMemo(() => configuredEconomicsScenario(configuration), [configuration]);
  const source = useMemo(
    () => networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario),
    [configuration, scenario],
  );
  const projection = useMemo(() => investorEconomicsProjection(source, terms), [source, terms]);
  const comparison = useMemo(() => investorEconomicsComparison(source), [source]);
  const programmeInvestment = projection.source.totalProgramInvestmentRub;
  const currentFunding = projection.source.currentExternalFundingRequirementRub;
  const selfFinancing = programmeInvestment === null || currentFunding === null ? null : programmeInvestment - currentFunding;
  const horizonMonth = projection.rows.at(-1)?.month ?? 60;
  const mainComparison = comparison.filter((item) => ["equity-0.25", "priority-1.3", "cash-flow-1.3", "full-programme-80-15"].includes(item.id));
  const additionalComparison = comparison.filter((item) => !mainComparison.includes(item));
  const isFullProgramme = terms.template === "full_programme";
  const set = (next: Partial<InvestorEconomicsTerms>) => setTerms((current) => ({ ...current, ...next }));

  return <section className="investor-economics" data-testid="investor-economics-panel">
    <header className="investor-economics-header"><div><p>Условия участия</p><h2>Рабочая модель</h2></div><span>Рабочие параметры не меняют опубликованные сценарии.</span></header>
    <section className="investor-economics-programme" aria-label="Базовый план финансирования"><div><p>Базовый план финансирования</p><h3>Финансирование по этапам</h3><small>При базовом сценарии часть следующих открытий финансируется денежным потоком уже работающих точек.</small></div><dl><Metric label="Стоимость программы" value={formatRub(programmeInvestment)} amount={programmeInvestment} testId="economics-programme-investment" /><Metric label="Нужно привлечь" value={formatRub(currentFunding)} amount={currentFunding} testId="economics-current-external-funding" /><Metric label="Покроет сам бизнес" value={formatRub(selfFinancing)} amount={selfFinancing} testId="economics-business-self-financing" /><Metric label="Окупаемость программы" value={monthText(projection.source.programmePaybackMonth)} note="Не является сроком возврата вложений инвестору." /></dl><p className="investor-economics-funding-identity">Нужно привлечь + покроет сам бизнес = стоимость программы.</p></section>
    <section className="investor-economics-templates" aria-label="Структура участия"><p>Структура участия</p><div className="investor-economics-template-buttons">{investorEconomicsTemplateIds.map((template) => <button key={template} type="button" className={terms.template === template ? "is-selected" : ""} data-testid={`economics-template-${template}`} onClick={() => set(template === "full_programme" ? { template, fundingMode: "staged", residualEquityShare: 0 } : { template })}><strong>{templateCopy[template].title}</strong><small>{templateCopy[template].note}</small></button>)}</div></section>
    <div className="investor-economics-workspace"><div className="investor-economics-controls"><section className="investor-economics-card"><header><p>Параметры сценария</p><h3>{templateCopy[terms.template].title}</h3></header><div className="investor-economics-fields"><label className="investor-economics-field"><span>Финансирование</span><select value={terms.fundingMode} onChange={(event) => set({ fundingMode: event.target.value as InvestorEconomicsTerms["fundingMode"] })}><option value="staged">По этапам</option><option value="upfront">Вся сумма в начале</option></select></label>{!isFullProgramme ? <label className="investor-economics-field"><span>Распределение</span><select value={terms.distributionPolicy} onChange={(event) => set({ distributionPolicy: event.target.value as InvestorEconomicsTerms["distributionPolicy"] })}><option value="reinvest_first">Сначала развитие</option><option value="current_cash_flow">Ранние выплаты</option></select></label> : null}{terms.template === "equity" ? <TermsNumber label="Доля в компании" value={Math.round(terms.equityShare * 100)} suffix="%" max={100} onChange={(value) => set({ equityShare: value / 100 })} /> : null}{terms.template === "priority_equity" ? <><TermsNumber label="Целевая выплата" value={terms.targetMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ targetMultiple: value })} /><TermsNumber label="Доля FCF до цели" value={Math.round(terms.priorityDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ priorityDistributionShare: value / 100 })} /><TermsNumber label="Доля в компании после цели" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} /></> : null}{terms.template === "capped_cash_flow" ? <><TermsNumber label="Лимит выплат" value={terms.cashFlowCapMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ cashFlowCapMultiple: value })} /><TermsNumber label="Доля денежного потока" value={Math.round(terms.cashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ cashFlowShare: value / 100 })} /><TermsNumber label="Доля в компании после лимита" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} /></> : null}{isFullProgramme ? <><TermsNumber label="Финансирование программы" value={Math.round(terms.programmeFundingShare * 100)} suffix="%" max={100} onChange={(value) => set({ programmeFundingShare: value / 100 })} /><TermsNumber label="Доля FCF на возврат капитала" value={Math.round(terms.principalPhaseDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ principalPhaseDistributionShare: value / 100 })} /><TermsNumber label="Доля FCF после возврата" value={Math.round(terms.postPrincipalCashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ postPrincipalCashFlowShare: value / 100 })} /><label className="investor-economics-field"><span>Начало возврата капитала</span><select value={terms.principalRepaymentMode} onChange={(event) => set({ principalRepaymentMode: event.target.value as InvestorEconomicsTerms["principalRepaymentMode"] })}><option value="cohort_maturity">После выхода объектов на режим</option><option value="after_programme_funding">После финансирования программы</option></select></label><label className="investor-economics-field"><span>Срок участия после возврата</span><select value={terms.postPrincipalParticipationTerm} onChange={(event) => set({ postPrincipalParticipationTerm: event.target.value as InvestorEconomicsTerms["postPrincipalParticipationTerm"] })}><option value="model_horizon">До конца модельного горизонта</option><option value="additional_months">Ещё N месяцев</option><option value="target_cash_moic">До Cash MOIC</option><option value="unlimited">Без ограничения срока</option></select></label>{terms.postPrincipalParticipationTerm === "additional_months" ? <TermsNumber label="Дополнительный срок" value={terms.postPrincipalAdditionalMonths} suffix="мес." min={0} max={120} onChange={(value) => set({ postPrincipalAdditionalMonths: Math.floor(value) })} /> : null}{terms.postPrincipalParticipationTerm === "target_cash_moic" ? <TermsNumber label="Целевой Cash MOIC" value={terms.postPrincipalTargetCashMoic} suffix="×" min={1} max={5} step={0.1} onChange={(value) => set({ postPrincipalTargetCashMoic: value })} /> : null}<TermsNumber label="Остаточная доля" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} /></> : null}</div><p className="investor-economics-helper">{isFullProgramme ? "Пример условий: в выплаты направляется FCF объектов, вышедших на плановый режим." : terms.distributionPolicy === "reinvest_first" ? "Сначала выполняются обязательства программы и ликвидности; затем возможны выплаты инвестору." : "Ранние выплаты увеличивают потребность в капитале: один и тот же денежный поток не используется дважды."}</p></section><section className="investor-economics-card investor-economics-comparison"><header><p>Сравнение</p><h3>Четыре структуры</h3></header><ComparisonTable items={mainComparison} horizonMonth={horizonMonth} /><details className="investor-economics-all-variants"><summary>Все варианты</summary><ComparisonTable items={additionalComparison} horizonMonth={horizonMonth} /></details></section></div><SelectedSummary projection={projection} terms={terms} horizonMonth={horizonMonth} /></div>
    <MaturityTable projection={projection} internal /><Waterfall projection={projection} principalBased={isFullProgramme} /><p className="investor-economics-first-payment">Первые выплаты: {monthText(projection.metrics.firstDistributionMonth)} · {firstPaymentNote(projection, isFullProgramme)}</p>
  </section>;
}

/** Read-only investor-facing presentation of the four governed discussion presets. */
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
  const principalBased = selected.template === "full_programme";
  return <section className="investor-economics investor-economics-public" data-testid="investor-economics-public">
    <header className="investor-economics-header"><div><p>Условия участия</p><h2>Сценарии для обсуждения</h2></div><span>Экономическая модель, не юридическое предложение.</span></header>
    <section className="investor-economics-programme" aria-label="Базовый план финансирования"><div><p>Базовый план финансирования</p><h3>Финансирование по этапам</h3><small>При базовом сценарии часть следующих открытий финансируется денежным потоком уже работающих точек.</small></div><dl><Metric label="Стоимость программы" value={formatRub(programmeInvestment)} amount={programmeInvestment} testId="economics-programme-investment" /><Metric label="Нужно привлечь" value={formatRub(currentFunding)} amount={currentFunding} testId="economics-current-external-funding" /><Metric label="Покроет сам бизнес" value={formatRub(selfFinancing)} amount={selfFinancing} testId="economics-business-self-financing" /><Metric label="Окупаемость программы" value={monthText(projection.source.programmePaybackMonth)} note="Не является сроком возврата вложений инвестору." /></dl><p className="investor-economics-funding-identity">Нужно привлечь + покроет сам бизнес = стоимость программы.</p></section>
    <section className="investor-economics-templates" aria-label="Сценарии для обсуждения"><p>Выберите сценарий</p><div className="investor-economics-template-buttons">{publishedParticipationPresets.map((preset) => <button key={preset.id} type="button" className={selected.id === preset.id ? "is-selected" : ""} data-testid={`public-preset-${preset.id}`} onClick={() => setSelectedPresetId(preset.id)}><strong>{preset.label}</strong><small>{preset.note}</small></button>)}</div></section>
    <section className="investor-economics-card investor-economics-comparison"><header><p>Сравнение</p><h3>Четыре сценария</h3></header><ComparisonTable items={comparison} horizonMonth={horizonMonth} /></section>
    <div className="investor-economics-workspace"><section className="investor-economics-card"><header><p>Подробности выбранного сценария</p><h3>{selected.label}</h3></header><p className="investor-economics-helper">{selected.note} Параметры являются сценарными условиями для обсуждения.</p><MaturityTable projection={projection} /><Waterfall projection={projection} principalBased={principalBased} /><p className="investor-economics-first-payment">Первые выплаты: {monthText(projection.metrics.firstDistributionMonth)} · {firstPaymentNote(projection, principalBased)}</p></section><SelectedSummary projection={projection} terms={selected.terms} horizonMonth={horizonMonth} /></div>
  </section>;
}
