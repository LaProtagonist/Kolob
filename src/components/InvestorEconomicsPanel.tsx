import { useMemo, useState } from "react";
import { configuredEconomicsScenario } from "../lib/configured-economics";
import {
  defaultInvestorEconomicsTerms,
  investorEconomicsComparison,
  investorEconomicsProjection,
  investorEconomicsTemplateIds,
  type InvestorEconomicsTemplate,
  type InvestorEconomicsTerms,
} from "../lib/investor-economics";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import { baseObjectFinancialProjection } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { formatNumber } from "./FormattedNumberInput";

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatNumber(value, true)} ₽`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${percent.format(value * 100)}%`;
}

function formatMultiple(value: number) {
  return `${value.toFixed(2).replace(".", ",")}×`;
}

function monthText(value: number | null) {
  return value === null ? "—" : `М${value}`;
}

const templateCopy: Record<InvestorEconomicsTemplate, { title: string; note: string }> = {
  equity: { title: "Доля в компании", note: "Доля в распределяемом денежном потоке после потребностей программы." },
  priority_equity: { title: "Приоритетный возврат + доля", note: "Повышенная доля до целевой выплаты, затем постоянное участие." },
  capped_cash_flow: { title: "Доля в денежном потоке", note: "Выплаты до установленного лимита; остаточная доля задаётся отдельно." },
  full_programme: { title: "Финансирование всей программы", note: "Поэтапное финансирование всей программы с возвратом капитала в первую очередь." },
};

function postPrincipalTermText(terms: InvestorEconomicsTerms, horizonMonth: number) {
  if (terms.postPrincipalParticipationTerm === "additional_months") return `Ещё ${terms.postPrincipalAdditionalMonths} мес.`;
  if (terms.postPrincipalParticipationTerm === "target_cash_moic") return `До Cash MOIC ${formatMultiple(terms.postPrincipalTargetCashMoic)}`;
  if (terms.postPrincipalParticipationTerm === "unlimited") return `Без ограничения · расчёт до М${horizonMonth}`;
  return `До конца горизонта · М${horizonMonth}`;
}

function TermsNumber({ value, label, suffix, min = 0, max = 100, step = 1, onChange }: {
  value: number;
  label: string;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return <label className="investor-economics-field"><span>{label}</span><span><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{suffix}</em></span></label>;
}

function Metric({ label, value, amount, note, testId }: { label: string; value: string; amount?: number | null; note?: string; testId?: string }) {
  return <div><dt>{label}</dt><dd data-testid={testId} data-amount-rub={amount ?? undefined}>{value}</dd>{note ? <small>{note}</small> : null}</div>;
}

function ComparisonTable({ items, horizonMonth }: { items: ReturnType<typeof investorEconomicsComparison>; horizonMonth: number }) {
  return <div className="investor-economics-table-wrap"><table><thead><tr><th>Сценарий</th><th>Капитал / обязательство</th><th>Возврат капитала</th><th>Cash IRR за {horizonMonth} мес.</th><th>Cash MOIC к М{horizonMonth}</th><th>Доля в компании</th><th>Права на FCF</th><th>Срок / лимит</th></tr></thead><tbody>
    {items.map((item) => {
      const { terms, projection } = item;
      const fcfRights = terms.template === "full_programme"
        ? `${formatPercent(terms.postPrincipalCashFlowShare)} после возврата`
        : terms.template === "capped_cash_flow"
          ? `${formatPercent(terms.cashFlowShare)} до ${formatMultiple(terms.cashFlowCapMultiple)}`
          : terms.template === "priority_equity"
            ? `${formatPercent(terms.priorityDistributionShare)} до цели`
            : "По доле в компании";
      const term = terms.template === "full_programme"
        ? postPrincipalTermText(terms, horizonMonth)
        : terms.template === "capped_cash_flow"
          ? `Лимит ${formatMultiple(terms.cashFlowCapMultiple)}`
          : "Без срока";
      return <tr key={item.id}><th>{item.label}</th><td>{formatRub(projection.metrics.commitmentRub)}</td><td>{monthText(projection.metrics.principalPaybackMonth)}</td><td>{formatPercent(projection.metrics.cashIrr)}</td><td>{projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)}</td><td>{formatPercent(projection.metrics.residualEquityShare)}</td><td>{fcfRights}</td><td>{term}</td></tr>;
    })}
  </tbody></table></div>;
}

export function InvestorEconomicsPanel() {
  const { configuration } = useInvestorConfiguration();
  const [terms, setTerms] = useState<InvestorEconomicsTerms>(defaultInvestorEconomicsTerms);
  const scenario = useMemo(() => configuredEconomicsScenario(configuration), [configuration]);
  const source = useMemo(() => networkFinancialProjection(configuration, baseObjectFinancialProjection(scenario), scenario), [configuration, scenario]);
  const projection = useMemo(() => investorEconomicsProjection(source, terms), [source, terms]);
  const comparison = useMemo(() => investorEconomicsComparison(source), [source]);
  const currentFunding = projection.source.currentExternalFundingRequirementRub;
  const programmeInvestment = projection.source.totalProgramInvestmentRub;
  const selfFinancing = programmeInvestment === null || currentFunding === null ? null : programmeInvestment - currentFunding;
  const horizonMonth = projection.rows.at(-1)?.month ?? 60;
  const mainComparison = comparison.filter((item) => ["equity-0.25", "priority-1.3", "cash-flow-1.3", "full-programme-80-15"].includes(item.id));
  const additionalComparison = comparison.filter((item) => !mainComparison.includes(item));
  const set = (next: Partial<InvestorEconomicsTerms>) => setTerms((current) => ({ ...current, ...next }));
  const isFullProgramme = terms.template === "full_programme";

  return (
    <section className="investor-economics" data-testid="investor-economics-panel">
      <header className="investor-economics-header">
        <div><p>Инвесторская экономика</p><h2>Условия участия</h2></div>
        <span>Сценарии для обсуждения, не юридическое предложение</span>
      </header>

      <section className="investor-economics-programme" aria-label="Базовый план финансирования">
        <div>
          <p>Базовый план финансирования</p>
          <h3>Финансирование по этапам</h3>
          <small>Часть программы финансируется денежным потоком работающих объектов.</small>
        </div>
        <dl>
          <Metric label="Инвестиции программы" value={formatRub(programmeInvestment)} amount={programmeInvestment} testId="economics-programme-investment" />
          <Metric label="Внешний капитал при самофинансировании" value={formatRub(currentFunding)} amount={currentFunding} testId="economics-current-external-funding" />
          <Metric label="Денежный поток бизнеса на развитие" value={formatRub(selfFinancing)} amount={selfFinancing} testId="economics-business-self-financing" />
          <Metric label="Окупаемость программы" value={monthText(projection.source.programmePaybackMonth)} />
        </dl>
      </section>

      <section className="investor-economics-templates" aria-label="Тип участия">
        <p>Структура участия</p>
        <div className="investor-economics-template-buttons">
          {investorEconomicsTemplateIds.map((template) => <button
            key={template}
            type="button"
            className={terms.template === template ? "is-selected" : ""}
            data-testid={`economics-template-${template}`}
            onClick={() => set(template === "full_programme"
              ? { template, fundingMode: "staged", residualEquityShare: 0 }
              : { template, fundingMode: terms.fundingMode })}
          ><strong>{templateCopy[template].title}</strong><small>{templateCopy[template].note}</small></button>)}
        </div>
      </section>

      <div className="investor-economics-workspace">
        <div className="investor-economics-controls">
          <section className="investor-economics-card">
            <header><p>Параметры сценария</p><h3>{templateCopy[terms.template].title}</h3></header>
            <div className="investor-economics-fields">
              {!isFullProgramme ? <label className="investor-economics-field"><span>Финансирование</span><select value={terms.fundingMode} onChange={(event) => set({ fundingMode: event.target.value as InvestorEconomicsTerms["fundingMode"] })}><option value="upfront">Вся сумма в начале</option><option value="staged">По этапам</option></select></label> : <label className="investor-economics-field"><span>Финансирование</span><select value={terms.fundingMode} onChange={(event) => set({ fundingMode: event.target.value as InvestorEconomicsTerms["fundingMode"] })}><option value="staged">По этапам</option><option value="upfront">Вся сумма в начале</option></select></label>}
              {!isFullProgramme ? <label className="investor-economics-field"><span>Распределение</span><select value={terms.distributionPolicy} onChange={(event) => set({ distributionPolicy: event.target.value as InvestorEconomicsTerms["distributionPolicy"] })}><option value="reinvest_first">Сначала развитие</option><option value="current_cash_flow">Ранние выплаты</option></select></label> : null}
              {terms.template === "equity" ? <TermsNumber label="Доля инвестора" value={Math.round(terms.equityShare * 100)} suffix="%" max={100} onChange={(value) => set({ equityShare: value / 100 })} /> : null}
              {terms.template === "priority_equity" ? <>
                <TermsNumber label="Целевая выплата" value={terms.targetMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ targetMultiple: value })} />
                <TermsNumber label="Доля до цели" value={Math.round(terms.priorityDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ priorityDistributionShare: value / 100 })} />
                <TermsNumber label="Доля после цели" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} />
              </> : null}
              {terms.template === "capped_cash_flow" ? <>
                <TermsNumber label="Лимит выплат" value={terms.cashFlowCapMultiple} suffix="×" min={1} max={3} step={0.1} onChange={(value) => set({ cashFlowCapMultiple: value })} />
                <TermsNumber label="Доля денежного потока" value={Math.round(terms.cashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ cashFlowShare: value / 100 })} />
                <TermsNumber label="Доля после лимита" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} />
              </> : null}
              {isFullProgramme ? <>
                <TermsNumber label="Финансирование программы" value={Math.round(terms.programmeFundingShare * 100)} suffix="%" max={100} onChange={(value) => set({ programmeFundingShare: value / 100 })} />
                <TermsNumber label="Доля распределяемого FCF на возврат капитала" value={Math.round(terms.principalPhaseDistributionShare * 100)} suffix="%" max={100} onChange={(value) => set({ principalPhaseDistributionShare: value / 100 })} />
                <TermsNumber label="Доля FCF после возврата капитала" value={Math.round(terms.postPrincipalCashFlowShare * 100)} suffix="%" max={100} onChange={(value) => set({ postPrincipalCashFlowShare: value / 100 })} />
                <TermsNumber label="Блокировка каждого транша" value={terms.principalLockMonths} suffix="мес." min={0} max={24} onChange={(value) => set({ principalLockMonths: Math.floor(value) })} />
                <label className="investor-economics-field"><span>Возврат капитала</span><select value={terms.principalRepaymentMode} onChange={(event) => set({ principalRepaymentMode: event.target.value as InvestorEconomicsTerms["principalRepaymentMode"] })}><option value="tranche_maturity">По мере созревания траншей</option><option value="after_programme_funding">После финансирования программы</option></select></label>
                <label className="investor-economics-field"><span>Срок участия после возврата</span><select value={terms.postPrincipalParticipationTerm} onChange={(event) => set({ postPrincipalParticipationTerm: event.target.value as InvestorEconomicsTerms["postPrincipalParticipationTerm"] })}><option value="model_horizon">До конца модельного горизонта</option><option value="additional_months">Ещё N месяцев</option><option value="target_cash_moic">До Cash MOIC</option><option value="unlimited">Без ограничения срока</option></select></label>
                {terms.postPrincipalParticipationTerm === "additional_months" ? <TermsNumber label="Дополнительный срок" value={terms.postPrincipalAdditionalMonths} suffix="мес." min={0} max={120} onChange={(value) => set({ postPrincipalAdditionalMonths: Math.floor(value) })} /> : null}
                {terms.postPrincipalParticipationTerm === "target_cash_moic" ? <TermsNumber label="Целевой Cash MOIC" value={terms.postPrincipalTargetCashMoic} suffix="×" min={1} max={5} step={0.1} onChange={(value) => set({ postPrincipalTargetCashMoic: value })} /> : null}
                <TermsNumber label="Остаточная доля" value={Math.round(terms.residualEquityShare * 100)} suffix="%" max={100} onChange={(value) => set({ residualEquityShare: value / 100 })} />
              </> : null}
            </div>
            <p className="investor-economics-helper">{isFullProgramme
              ? `Пример условий: каждый транш блокируется на ${terms.principalLockMonths} мес.; свободный денежный поток направляется на возврат капитала после обязательных резервов.`
              : terms.distributionPolicy === "reinvest_first"
                ? "Денежный поток удерживается для этапов развития и ликвидности до выхода программы на окупаемость."
                : "Ранние выплаты пересчитывают потребность в капитале: один и тот же денежный поток не используется дважды."}</p>
          </section>

          <section className="investor-economics-card investor-economics-comparison">
            <header><p>Сравнение</p><h3>Варианты условий</h3></header>
            <ComparisonTable items={mainComparison} horizonMonth={horizonMonth} />
            <details className="investor-economics-all-variants"><summary>Все варианты</summary><ComparisonTable items={additionalComparison} horizonMonth={horizonMonth} /></details>
          </section>
        </div>

        <aside className="investor-economics-summary" aria-label="Итог выбранного сценария">
          <p>Выбранные условия участия</p>
          <h3>{templateCopy[terms.template].title}</h3>
          <dl>
            <Metric label="Обязательство инвестора" value={formatRub(projection.metrics.commitmentRub)} amount={projection.metrics.commitmentRub} testId="economics-commitment" />
            <Metric label="Фактически внесено" value={formatRub(projection.metrics.actualContributionsRub)} amount={projection.metrics.actualContributionsRub} testId="economics-actual-contributions" />
            {isFullProgramme ? <Metric label="Максимум капитала в работе" value={formatRub(projection.metrics.peakOutstandingCapitalRub)} amount={projection.metrics.peakOutstandingCapitalRub} /> : null}
            <Metric label="Возвращено капитала" value={formatRub(projection.metrics.principalRepaidRub)} amount={projection.metrics.principalRepaidRub} testId="economics-principal-repaid" />
            <Metric label="Остаток капитала" value={formatRub(projection.metrics.outstandingPrincipalRub)} amount={projection.metrics.outstandingPrincipalRub} testId="economics-principal-outstanding" />
            <Metric label={`Доход за ${horizonMonth} мес.`} value={formatRub(projection.metrics.investorReturnRub)} amount={projection.metrics.investorReturnRub} testId="economics-investor-return" />
            <Metric label={`Выплаты за ${horizonMonth} мес.`} value={formatRub(projection.metrics.totalDistributionsRub)} amount={projection.metrics.totalDistributionsRub} />
            <Metric label="Первый возврат капитала" value={monthText(projection.metrics.firstPrincipalRepaymentMonth)} />
            <Metric label="Полный возврат капитала" value={monthText(projection.metrics.principalPaybackMonth)} />
            <Metric label={`Cash IRR за ${horizonMonth} мес.`} value={formatPercent(projection.metrics.cashIrr)} />
            <Metric label={`Cash MOIC к М${horizonMonth}`} value={projection.metrics.cashMoic === null ? "—" : formatMultiple(projection.metrics.cashMoic)} />
            <Metric label="Остаточная доля" value={formatPercent(projection.metrics.residualEquityShare)} />
            <Metric label="Доля FCF после возврата" value={formatPercent(projection.metrics.postPrincipalCashFlowShare)} />
            {isFullProgramme ? <Metric label="Срок участия после возврата" value={postPrincipalTermText(terms, horizonMonth)} /> : null}
          </dl>
          {terms.template === "equity" ? <div className="investor-economics-valuation"><span>Оценка после инвестиции</span><strong>{formatRub(projection.metrics.impliedPostMoneyRub)}</strong><span>Оценка до инвестиции</span><strong>{formatRub(projection.metrics.impliedPreMoneyRub)}</strong><small>Оценка следует из выбранных условий сделки, а не является независимой рыночной оценкой компании.</small></div> : null}
          <p className="investor-economics-status">Предварительный расчёт: требуется проверка мощности производства.</p>
        </aside>
      </div>

      <details className="investor-economics-waterfall">
        <summary>Показать помесячный расчёт</summary>
        <p>Каждый месяц сначала закрываются потребности программы и ликвидности; только после этого доступный денежный поток распределяется по выбранному сценарию.</p>
        <div className="investor-economics-table-wrap"><table><thead><tr><th>Месяц</th><th>Взнос инвестора</th><th>Капитал до выплаты</th><th>Доступный денежный поток</th><th>Возврат капитала</th><th>Доход инвестора</th><th>Всего выплачено</th><th>Остаток капитала</th><th>Потребность программы</th><th>Нераспределённый денежный поток</th></tr></thead><tbody>
          {projection.rows.map((row) => <tr key={row.month}><th>М{row.month}</th><td>{formatRub(row.investorDrawdownRub)}</td><td>{formatRub(row.outstandingPrincipalBeforeRub)}</td><td>{formatRub(row.distributableBusinessCashRub)}</td><td>{formatRub(row.principalRepaymentRub)}</td><td>{formatRub(row.investorReturnRub)}</td><td>{formatRub(row.totalInvestorDistributionRub)}</td><td>{formatRub(row.outstandingPrincipalAfterRub)}</td><td>{formatRub(row.rolloutFundingRequirementRub)}</td><td>{formatRub(row.businessCashRetainedRub)}</td></tr>)}
        </tbody></table></div>
      </details>
    </section>
  );
}
