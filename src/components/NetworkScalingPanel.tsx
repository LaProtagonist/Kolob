import { useMemo, useState } from "react";
import { createTradingPointCohort, type TradingPointCohort, type TradingPointFormat } from "../lib/investor-configuration";
import { networkScalingProjection, type NetworkPointCohortProjection, type NetworkScalingItem } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null) {
  return value === null ? "Не задано" : `${money.format(Math.round(value))} ₽`;
}

function formatMillion(value: number) {
  return `${decimal.format(value / 1_000_000)} млн ₽`;
}

function cohortFormatLabel(format: TradingPointFormat) {
  return format === "with_seating" ? "С посадочным залом" : "Только на вынос";
}

function ItemList({ items, multiplier }: { items: NetworkScalingItem[]; multiplier: "once" | "per_point" | "not_aggregated" }) {
  if (!items.length) return <p className="scaling-empty">Подтверждённых статей пока нет.</p>;
  return (
    <div className="scaling-item-list">
      {items.map((item) => (
        <details key={item.id} className={`scaling-item is-${item.ownership}`} data-ownership={item.ownership} data-multiplier={item.multiplier}>
          <summary>
            <span>{item.name}{item.partial ? <small>частичное ценовое покрытие</small> : null}</span>
            <strong>{item.amountRub === null ? "Не задано" : item.included ? formatRub(item.amountRub) : "Не применяется"}</strong>
          </summary>
          <div className="scaling-item-detail">
            <p>{item.reason}</p>
            {item.detail?.length ? <ul>
              {item.detail.map((detail) => <li key={detail.id}><span>{detail.name}{detail.quantity === null ? " · количество уточняется" : ` · ${detail.quantity} шт.`}</span><strong>{formatRub(detail.amountRub)}</strong></li>)}
            </ul> : null}
            {multiplier === "not_aggregated" ? <em>Пока не включается в итог сети.</em> : null}
          </div>
        </details>
      ))}
    </div>
  );
}

function NumericInput({ value, onChange, label, testId, suffix }: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  testId?: string;
  suffix: string;
}) {
  return <label className="cohort-number"><input aria-label={label} data-testid={testId} inputMode="decimal" type="number" min="0" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /><span>{suffix}</span></label>;
}

function CohortEditor({
  projection,
  onChange,
  onDelete,
  canDelete,
}: {
  projection: NetworkPointCohortProjection;
  onChange: (next: TradingPointCohort) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const cohort = projection.cohort;
  const update = <K extends keyof TradingPointCohort>(key: K, value: TradingPointCohort[K]) => onChange({ ...cohort, [key]: value });
  const setFormat = (format: TradingPointFormat) => onChange({ ...cohort, format, guestAreaM2: format === "takeaway" ? null : cohort.guestAreaM2 });
  return (
    <section className="cohort-editor" aria-label={`Параметры группы ${projection.formatName}`} data-testid={`scaling-cohort-editor-${cohort.id}`}>
      <div className="cohort-editor-header">
        <div><p>Параметры группы</p><h4>{projection.formatName} · {projection.realEstateName}</h4></div>
        {canDelete ? <button type="button" className="cohort-remove" onClick={onDelete}>Удалить группу</button> : null}
      </div>
      <div className="cohort-editor-grid">
        <label className="cohort-field"><span>Тип точки</span><select value={cohort.format} data-testid={`scaling-cohort-format-${cohort.id}`} onChange={(event) => setFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
        <label className="cohort-field"><span>Недвижимость</span><select value={cohort.realEstateMode} data-testid={`scaling-cohort-estate-${cohort.id}`} onChange={(event) => update("realEstateMode", event.target.value as TradingPointCohort["realEstateMode"])}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label>
        <label className="cohort-field"><span>Количество</span><NumericInput label="Количество точек" testId={`scaling-cohort-count-${cohort.id}`} value={cohort.count} suffix="шт." onChange={(value) => update("count", Math.max(0, Math.floor(value ?? 0)))} /></label>
        <label className="cohort-field"><span>Площадь помещения</span><NumericInput label="Площадь помещения" value={cohort.totalAreaM2} suffix="м²" onChange={(value) => update("totalAreaM2", value)} /></label>
        <label className="cohort-field"><span>Рабочая зона</span><NumericInput label="Рабочая зона" value={cohort.kitchenAreaM2} suffix="м²" onChange={(value) => update("kitchenAreaM2", value)} /></label>
        {cohort.format === "with_seating" ? <label className="cohort-field"><span>Посадочный зал</span><NumericInput label="Посадочный зал" value={cohort.guestAreaM2} suffix="м²" onChange={(value) => update("guestAreaM2", value)} /></label> : null}
        {cohort.realEstateMode === "rent" ? <>
          <label className="cohort-field"><span>Аренда в месяц</span><NumericInput label="Аренда в месяц" testId={`scaling-cohort-rent-${cohort.id}`} value={cohort.monthlyRentRub} suffix="₽" onChange={(value) => update("monthlyRentRub", value)} /></label>
          <label className="cohort-field"><span>Предоплата</span><select value={cohort.prepaymentMonths} onChange={(event) => update("prepaymentMonths", Number(event.target.value) as TradingPointCohort["prepaymentMonths"])}><option value={1}>1 мес.</option><option value={3}>3 мес.</option><option value={12}>12 мес.</option></select></label>
          <label className="cohort-field"><span>Обеспечительный платёж</span><select value={cohort.securityDepositMonths} onChange={(event) => update("securityDepositMonths", Number(event.target.value) as TradingPointCohort["securityDepositMonths"])}><option value={1}>1 мес.</option><option value={2}>2 мес.</option><option value={3}>3 мес.</option></select></label>
        </> : <label className="cohort-field"><span>Стоимость помещения</span><NumericInput label="Стоимость помещения" testId={`scaling-cohort-purchase-${cohort.id}`} value={cohort.purchasePriceRub} suffix="₽" onChange={(value) => update("purchasePriceRub", value)} /></label>}
        <label className="cohort-field"><span>Подготовка точки</span><NumericInput label="Подготовка точки" testId={`scaling-cohort-preparation-${cohort.id}`} value={cohort.preparationRub} suffix="₽" onChange={(value) => update("preparationRub", value)} /></label>
        <div className="cohort-field cohort-toggle-field"><span>Бар</span><button type="button" className={`terminal-toggle${cohort.barEnabled ? " is-on" : ""}`} role="switch" aria-checked={cohort.barEnabled} data-testid={`scaling-cohort-bar-${cohort.id}`} onClick={() => update("barEnabled", !cohort.barEnabled)}><span aria-hidden="true"><i /></span>{cohort.barEnabled ? "Включён" : "Выключен"}</button></div>
      </div>
      <div className="cohort-calculation">
        <span>Подтверждённая часть открытия одной точки</span>
        <strong data-testid={`scaling-cohort-unit-${cohort.id}`} data-amount-rub={projection.confirmedPointInvestmentRub}>{formatMillion(projection.confirmedPointInvestmentRub)}</strong>
        <span>×{cohort.count}</span>
        <strong data-testid={`scaling-cohort-total-${cohort.id}`} data-amount-rub={projection.confirmedCohortInvestmentRub}>{formatMillion(projection.confirmedCohortInvestmentRub)}</strong>
      </div>
      <details className="cohort-items">
        <summary>Показать включённые статьи</summary>
        <ItemList items={projection.pointItems} multiplier="per_point" />
      </details>
      <p className="cohort-partial-note">Показана подтверждённая часть: запас, резерв запуска и статьи без распределения не выданы за стоимость открытия.</p>
    </section>
  );
}

export function NetworkScalingPanel({ onReturnToUnit }: { onReturnToUnit: () => void }) {
  const { configuration, setLaunchBudget, setNetworkScaling } = useInvestorConfiguration();
  const projection = useMemo(() => networkScalingProjection(configuration), [configuration]);
  const [productionDetailsOpen, setProductionDetailsOpen] = useState(false);
  const [unresolvedDetailsOpen, setUnresolvedDetailsOpen] = useState(false);
  const [expandedCohortId, setExpandedCohortId] = useState<string | null>(() => configuration.networkScaling.cohorts[0]?.id ?? null);
  const [newGroupFormat, setNewGroupFormat] = useState<TradingPointFormat>("takeaway");
  const [newGroupEstate, setNewGroupEstate] = useState<TradingPointCohort["realEstateMode"]>("rent");

  function setGrowEnabled(enabled: boolean) {
    setLaunchBudget((current) => ({ ...current, growEnabled: enabled }));
  }

  function updateCohort(id: string, next: TradingPointCohort) {
    setNetworkScaling((current) => ({ ...current, cohorts: current.cohorts.map((cohort) => cohort.id === id ? next : cohort) }));
  }

  function addCohort() {
    setNetworkScaling((current) => {
      const used = new Set(current.cohorts.map((cohort) => cohort.id));
      let number = current.cohorts.length + 1;
      while (used.has(`cohort-${number}`)) number += 1;
      const next = createTradingPointCohort(configuration.launchBudget, { id: `cohort-${number}`, format: newGroupFormat, realEstateMode: newGroupEstate });
      setExpandedCohortId(next.id);
      return { ...current, cohorts: [...current.cohorts, next] };
    });
  }

  function removeCohort(id: string) {
    setNetworkScaling((current) => ({ ...current, cohorts: current.cohorts.filter((cohort) => cohort.id !== id) }));
    setExpandedCohortId(configuration.networkScaling.cohorts.find((cohort) => cohort.id !== id)?.id ?? null);
  }

  return (
    <section className="scaling-workspace" aria-labelledby="scaling-title">
      <header className="scaling-header">
        <p>Investor Terminal · структура сети</p>
        <h2 id="scaling-title">Масштабирование</h2>
        <p className="scaling-intro">Заготовочное производство создаётся один раз. Каждая группа торговых точек имеет собственный формат, недвижимость и параметры помещения.</p>
      </header>

      <div className="scaling-grid">
        <div className="scaling-inputs">
          <section className="scaling-section" aria-labelledby="production-title">
            <header><div><p>Общая инфраструктура</p><h3 id="production-title">Заготовочное производство</h3></div><strong className="scaling-multiplier" data-testid="scaling-production-multiplier">×1</strong></header>
            <div className="scaling-row"><span>Подтверждённая часть производственной базы</span><strong data-testid="scaling-production-investment" data-amount-rub={projection.productionInvestmentRub}>{formatMillion(projection.productionInvestmentRub)}</strong></div>
            <div className="scaling-row is-control"><span>Модуль выращивания</span><button type="button" className={`terminal-toggle${configuration.networkScaling.productionGrowEnabled ? " is-on" : ""}`} role="switch" aria-checked={configuration.networkScaling.productionGrowEnabled} onClick={() => setGrowEnabled(!configuration.networkScaling.productionGrowEnabled)} data-testid="scaling-grow-toggle"><span aria-hidden="true"><i /></span>{configuration.networkScaling.productionGrowEnabled ? "Включён · ×1" : "Выключен"}</button></div>
            <div className="scaling-row is-note"><span>Мощность производства</span><small>{projection.capacityNote}</small></div>
            <button type="button" className="scaling-details-button" aria-expanded={productionDetailsOpen} onClick={() => setProductionDetailsOpen((open) => !open)}>{productionDetailsOpen ? "Скрыть состав" : "Показать состав"}</button>
            {productionDetailsOpen ? <div data-testid="scaling-production-items"><ItemList items={projection.productionItems} multiplier="once" /></div> : null}
          </section>

          <section className="scaling-section cohort-section" aria-labelledby="points-title">
            <header><div><p>Независимые группы</p><h3 id="points-title">Торговые точки</h3></div><strong className="scaling-multiplier">×N</strong></header>
            <div className="cohort-table" data-testid="scaling-cohorts">
              <div className="cohort-table-head"><span>Тип</span><span>Недвижимость</span><span>Кол-во</span><span>Включено, 1</span><span>Итого</span></div>
              {projection.cohorts.map((cohort) => <button key={cohort.cohort.id} type="button" className={`cohort-table-row${expandedCohortId === cohort.cohort.id ? " is-expanded" : ""}`} data-testid={`scaling-cohort-row-${cohort.cohort.id}`} onClick={() => setExpandedCohortId((current) => current === cohort.cohort.id ? null : cohort.cohort.id)} aria-expanded={expandedCohortId === cohort.cohort.id}>
                <span>{cohort.formatName}</span><span>{cohort.realEstateName}</span><strong>×{cohort.cohort.count}</strong><strong>{formatMillion(cohort.confirmedPointInvestmentRub)}<small>частично</small></strong><strong>{formatMillion(cohort.confirmedCohortInvestmentRub)}<small>частично</small></strong>
              </button>)}
            </div>
            {projection.cohorts.map((cohort) => expandedCohortId === cohort.cohort.id ? <CohortEditor key={cohort.cohort.id} projection={cohort} onChange={(next) => updateCohort(cohort.cohort.id, next)} onDelete={() => removeCohort(cohort.cohort.id)} canDelete={projection.cohorts.length > 1} /> : null)}
            <div className="cohort-add">
              <label><span>Новая группа</span><select value={newGroupFormat} data-testid="scaling-add-format" onChange={(event) => setNewGroupFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
              <label><span>Недвижимость</span><select value={newGroupEstate} data-testid="scaling-add-estate" onChange={(event) => setNewGroupEstate(event.target.value as TradingPointCohort["realEstateMode"])}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label>
              <button type="button" onClick={addCohort} data-testid="scaling-add-cohort">+ Добавить группу</button>
            </div>
          </section>

          <section className="scaling-section is-unresolved" aria-labelledby="unresolved-title">
            <header><div><p>Требует уточнения</p><h3 id="unresolved-title">Пока не включено в расчёт</h3></div><strong className="scaling-multiplier">{projection.unresolvedItems.length}</strong></header>
            <div className="scaling-unresolved-brief" data-testid="scaling-reserve"><p>Часть расходов требует распределения между производством, точками и сетью.</p></div>
            <button type="button" className="scaling-details-button" aria-expanded={unresolvedDetailsOpen} onClick={() => setUnresolvedDetailsOpen((open) => !open)}>{unresolvedDetailsOpen ? "Скрыть список" : `Показать статьи (${projection.unresolvedItems.length})`}</button>
            {unresolvedDetailsOpen ? <div data-testid="scaling-unresolved"><ItemList items={projection.unresolvedItems} multiplier="not_aggregated" /></div> : null}
          </section>
        </div>

        <aside className="scaling-results" aria-label="Сводка масштабирования">
          <p>Сеть · подтверждённая часть</p>
          <h3>Структура инвестиций</h3>
          <dl>
            <div><dt>Производство</dt><dd data-testid="scaling-production-summary" data-amount-rub={projection.productionInvestmentRub}>{formatMillion(projection.productionInvestmentRub)} <b>×1</b></dd></div>
            {projection.cohorts.map((cohort) => <div key={cohort.cohort.id}><dt>{cohort.formatName} · {cohort.realEstateName}</dt><dd data-testid={`scaling-cohort-summary-${cohort.cohort.id}`} data-amount-rub={cohort.confirmedCohortInvestmentRub}>{formatMillion(cohort.confirmedCohortInvestmentRub)} <b>×{cohort.cohort.count}</b><small>частично</small></dd></div>)}
            <div><dt>Пока не включено</dt><dd>{projection.unresolvedItems.length} статей</dd></div>
            <div className="is-total"><dt>Подтверждённые инвестиции</dt><dd data-testid="scaling-confirmed-total" data-amount-rub={projection.confirmedInvestmentSubtotalRub}>{formatMillion(projection.confirmedInvestmentSubtotalRub)}</dd></div>
          </dl>
          <p className="scaling-partial-note">Итог не включает статьи, для которых пока нет корректного распределения по производству, точкам или сети.</p>
          <button type="button" className="terminal-reset" onClick={onReturnToUnit}>Вернуться к экономике точки</button>
        </aside>
      </div>
    </section>
  );
}
