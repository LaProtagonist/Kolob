import { useEffect, useMemo, useState } from "react";
import { createTradingPointCohort, type TradingPointCohort, type TradingPointFormat } from "../lib/investor-configuration";
import { networkScalingProjection, type NetworkPointCohortProjection, type NetworkScalingItem } from "../lib/network-scaling";
import { locationLabel, locationPlanningDefaults, planningTrafficPreset, type LocationType } from "../lib/network-planning";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null) {
  return value === null ? "Не задано" : `${money.format(Math.round(value))} ₽`;
}

function formatMillion(value: number) {
  return `${decimal.format(value / 1_000_000)} млн ₽`;
}

function formatCount(value: number | null) {
  return value === null ? "Не задано" : money.format(Math.round(value));
}

function cohortFormatLabel(format: TradingPointFormat) {
  return format === "with_seating" ? "С посадочным залом" : "Только на вынос";
}

function cohortEstateLabel(cohort: TradingPointCohort) {
  return cohort.locationType === "foodhall" ? "Контракт площадки" : cohort.realEstateMode === "rent" ? "Аренда" : "Покупка";
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

function NumericInput({ value, onChange, label, testId, suffix, disabled = false, integer = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  testId?: string;
  suffix: string;
  disabled?: boolean;
  integer?: boolean;
}) {
  return <label className="cohort-number"><input aria-label={label} data-testid={testId} disabled={disabled} inputMode={integer ? "numeric" : "decimal"} type="number" min="0" step={integer ? "1" : "any"} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /><span>{suffix}</span></label>;
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
  const setLocation = (locationType: LocationType) => onChange({
    ...cohort,
    locationType,
    ...locationPlanningDefaults(locationType),
  });
  const operations = projection.operational;
  const setSalesMode = (mode: TradingPointCohort["sales"]["mode"]) => onChange({
    ...cohort,
    sales: mode === "baseline"
      ? { mode, checksPerDay: null, averageCheckRub: null }
      : {
        mode,
        checksPerDay: operations.sales.checksPerDay,
        averageCheckRub: operations.sales.averageCheckRub,
      },
  });
  const updateSales = <K extends keyof TradingPointCohort["sales"]>(key: K, value: TradingPointCohort["sales"][K]) => onChange({
    ...cohort,
    sales: { ...cohort.sales, [key]: value },
  });
  const useTrafficPreset = () => {
    const preset = planningTrafficPreset(cohort.locationType, cohort.format);
    if (!preset) return;
    onChange({
      ...cohort,
      sales: { mode: "custom", checksPerDay: Number(preset.checks_per_day), averageCheckRub: operations.sales.averageCheckRub },
    });
  };
  return (
    <section className="cohort-editor" aria-label={`Параметры группы ${projection.formatName}`} data-testid={`scaling-cohort-editor-${cohort.id}`}>
      <div className="cohort-editor-header">
        <div><p>Параметры группы</p><h4>{projection.formatName} · {projection.realEstateName}</h4></div>
        {canDelete ? <button type="button" className="cohort-remove" onClick={onDelete}>Удалить группу</button> : null}
      </div>
      <div className="cohort-editor-grid">
        <label className="cohort-field"><span>Тип точки</span><select value={cohort.format} data-testid={`scaling-cohort-format-${cohort.id}`} onChange={(event) => setFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
        <label className="cohort-field"><span>Тип локации</span><select value={cohort.locationType} data-testid={`scaling-cohort-location-${cohort.id}`} onChange={(event) => setLocation(event.target.value as LocationType)}><option value="street">Street</option><option value="foodhall">Foodhall</option><option value="creative_cluster">Creative Cluster</option><option value="foodtruck">Foodtruck · advanced</option></select></label>
        {cohort.locationType !== "foodhall" ? <label className="cohort-field"><span>Недвижимость</span><select value={cohort.realEstateMode} data-testid={`scaling-cohort-estate-${cohort.id}`} onChange={(event) => update("realEstateMode", event.target.value as TradingPointCohort["realEstateMode"])}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label> : null}
        <label className="cohort-field"><span>Количество</span><NumericInput label="Количество точек" testId={`scaling-cohort-count-${cohort.id}`} value={cohort.count} suffix="шт." integer onChange={(value) => update("count", Math.max(0, Math.floor(value ?? 0)))} /></label>
        <label className={`cohort-field${operations.area.status === "below-minimum" ? " has-warning" : ""}`}><span>Площадь помещения</span><NumericInput label="Площадь помещения" testId={`scaling-cohort-area-${cohort.id}`} value={cohort.totalAreaM2} suffix="м²" onChange={(value) => update("totalAreaM2", value)} />{operations.area.status === "below-minimum" ? <small className="cohort-validation" data-testid={`scaling-cohort-area-warning-${cohort.id}`}>Ниже минимума для формата: {operations.area.minimumM2} м².</small> : null}</label>
        <label className="cohort-field"><span>Рабочая зона</span><NumericInput label="Рабочая зона" value={cohort.kitchenAreaM2} suffix="м²" onChange={(value) => update("kitchenAreaM2", value)} /></label>
        {cohort.format === "with_seating" ? <label className="cohort-field"><span>Посадочный зал</span><NumericInput label="Посадочный зал" value={cohort.guestAreaM2} suffix="м²" onChange={(value) => update("guestAreaM2", value)} /></label> : null}
        {cohort.locationType === "foodhall" ? <>
          <label className="cohort-field"><span>Revenue share</span><NumericInput label="Revenue share" value={cohort.revenueSharePercent} suffix="%" onChange={(value) => update("revenueSharePercent", value)} /></label>
          <label className="cohort-field"><span>Минимальная гарантия</span><NumericInput label="Минимальная гарантия" value={cohort.minimumGuaranteeMonthlyRub} suffix="₽" onChange={(value) => update("minimumGuaranteeMonthlyRub", value)} /></label>
        </> : cohort.realEstateMode === "rent" ? <>
          <label className="cohort-field"><span>Аренда в месяц</span><NumericInput label="Аренда в месяц" testId={`scaling-cohort-rent-${cohort.id}`} value={cohort.monthlyRentRub} suffix="₽" onChange={(value) => update("monthlyRentRub", value)} /></label>
          <label className="cohort-field"><span>Предоплата</span><select value={cohort.prepaymentMonths ?? ""} onChange={(event) => update("prepaymentMonths", event.target.value === "" ? null : Number(event.target.value) as TradingPointCohort["prepaymentMonths"])}><option value="">Не задано</option><option value={1}>1 мес.</option><option value={3}>3 мес.</option><option value={12}>12 мес.</option></select></label>
          <label className="cohort-field"><span>Обеспечительный платёж</span><select value={cohort.securityDepositMonths ?? ""} onChange={(event) => update("securityDepositMonths", event.target.value === "" ? null : Number(event.target.value) as TradingPointCohort["securityDepositMonths"])}><option value="">Не задано</option><option value={1}>1 мес.</option><option value={2}>2 мес.</option><option value={3}>3 мес.</option></select></label>
        </> : <label className="cohort-field"><span>Стоимость помещения</span><NumericInput label="Стоимость помещения" testId={`scaling-cohort-purchase-${cohort.id}`} value={cohort.purchasePriceRub} suffix="₽" onChange={(value) => update("purchasePriceRub", value)} /></label>}
        <label className="cohort-field"><span>Подготовка точки</span><NumericInput label="Подготовка точки" testId={`scaling-cohort-preparation-${cohort.id}`} value={cohort.preparationRub} suffix="₽" onChange={(value) => update("preparationRub", value)} /></label>
        <label className="cohort-field"><span>Стартовый запас</span><NumericInput label="Стартовый запас, дней" value={cohort.initialInventoryDays} suffix="дней" integer onChange={(value) => update("initialInventoryDays", Math.max(0, Math.floor(value ?? 0)))} /><small>Planning assumption: 3 дня работы; запас производства считается отдельно.</small></label>
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <label className="cohort-field"><span>Fitout / брендинг</span><NumericInput label="Fitout / брендинг" value={cohort.fitoutAllowanceRub} suffix="₽" onChange={(value) => update("fitoutAllowanceRub", value)} /><small>Planning reference: 1,5–2,5 млн ₽; не включает технологическое оборудование.</small></label> : null}
        <label className="cohort-field"><span>Коммунальные / месяц</span><NumericInput label="Коммунальные / месяц" value={cohort.utilitiesMonthlyRub} suffix="₽" onChange={(value) => update("utilitiesMonthlyRub", value)} /><small>{cohort.locationType === "street" ? cohort.format === "takeaway" ? "Ориентир Street: 45 тыс. ₽/мес." : "Ориентир Street: 80 тыс. ₽/мес." : "Укажите условия площадки или отметьте включение."}</small></label>
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <label className="cohort-field"><span>Коммунальные включены</span><select value={cohort.utilitiesIncluded === null ? "unknown" : String(cohort.utilitiesIncluded)} onChange={(event) => update("utilitiesIncluded", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует подтверждения</option><option value="true">Включены</option><option value="false">Отдельно</option></select></label> : null}
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <label className="cohort-field"><span>Service charge</span><NumericInput label="Service charge" value={cohort.serviceChargeMonthlyRub} suffix="₽" onChange={(value) => update("serviceChargeMonthlyRub", value)} /></label> : null}
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <label className="cohort-field"><span>Хранение</span><NumericInput label="Аренда хранения" value={cohort.storageRentMonthlyRub} suffix="₽" onChange={(value) => update("storageRentMonthlyRub", value)} /></label> : null}
        <label className="cohort-field"><span>Вытяжка</span><select value={cohort.extractionAvailable === null ? "unknown" : cohort.extractionAvailable ? "yes" : "no"} data-testid={`scaling-cohort-extraction-${cohort.id}`} onChange={(event) => update("extractionAvailable", event.target.value === "unknown" ? null : event.target.value === "yes")}><option value="unknown">Требует подтверждения</option><option value="yes">Есть</option><option value="no">Нет</option></select>{operations.location.extractionStatus === "incompatible" ? <small className="cohort-validation" data-testid={`scaling-cohort-extraction-warning-${cohort.id}`}>Локация несовместима: для приготовления на точке нужна коммерческая вытяжка.</small> : null}</label>
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <>
          <label className="cohort-field"><span>Общая посадка</span><select value={cohort.sharedSeating === null ? "unknown" : String(cohort.sharedSeating)} onChange={(event) => update("sharedSeating", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует подтверждения</option><option value="true">Да</option><option value="false">Нет</option></select></label>
          <label className="cohort-field"><span>Безопасность площадки</span><select value={cohort.venueSecurityIncluded === null ? "unknown" : String(cohort.venueSecurityIncluded)} onChange={(event) => update("venueSecurityIncluded", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует подтверждения</option><option value="true">Включена</option><option value="false">Не включена</option></select></label>
          <label className="cohort-field"><span>Общая уборка площадки</span><select value={cohort.commonCleaningIncluded === null ? "unknown" : String(cohort.commonCleaningIncluded)} onChange={(event) => update("commonCleaningIncluded", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует подтверждения</option><option value="true">Включена</option><option value="false">Не включена</option></select></label>
        </> : <>
          <label className="cohort-field"><span>Видео · allowance</span><NumericInput label="Видео" value={cohort.videoAllowanceRub} suffix="₽" onChange={(value) => update("videoAllowanceRub", value)} /><small>Planning reference: 70 тыс. ₽.</small></label>
          <label className="cohort-field"><span>Сигнализация · allowance</span><NumericInput label="Сигнализация" value={cohort.alarmAllowanceRub} suffix="₽" onChange={(value) => update("alarmAllowanceRub", value)} /><small>Planning reference: 35 тыс. ₽.</small></label>
        </>}
        <div className="cohort-field cohort-toggle-field"><span>Бар</span><button type="button" className={`terminal-toggle${cohort.barEnabled ? " is-on" : ""}`} role="switch" aria-checked={cohort.barEnabled} data-testid={`scaling-cohort-bar-${cohort.id}`} onClick={() => update("barEnabled", !cohort.barEnabled)}><span aria-hidden="true"><i /></span>{cohort.barEnabled ? "Включён" : "Выключен"}</button></div>
      </div>
      <section className="cohort-operations" aria-label={`Операционная модель ${projection.formatName}`}>
        <header><div><p>Операционная модель</p><h5>Поток и минимальная нагрузка</h5></div><small>{operations.sales.source === "baseline" ? "Базовый сценарий" : "Пользовательский сценарий"}</small></header>
        <div className="cohort-operations-grid">
          <label className="cohort-field"><span>Источник продаж</span><select value={cohort.sales.mode} data-testid={`scaling-cohort-sales-mode-${cohort.id}`} onChange={(event) => setSalesMode(event.target.value as TradingPointCohort["sales"]["mode"])}><option value="baseline">Базовый сценарий</option><option value="custom">Свой сценарий</option></select></label>
          <label className="cohort-field"><span>Чеков в день</span><NumericInput label={`Чеков в день ${cohort.id}`} testId={`scaling-cohort-checks-${cohort.id}`} value={operations.sales.checksPerDay} suffix="чеков" integer disabled={cohort.sales.mode === "baseline"} onChange={(value) => updateSales("checksPerDay", value === null ? null : Math.floor(value))} /></label>
          <label className="cohort-field"><span>Средний чек</span><NumericInput label={`Средний чек ${cohort.id}`} testId={`scaling-cohort-average-check-${cohort.id}`} value={operations.sales.averageCheckRub} suffix="₽" disabled={cohort.sales.mode === "baseline"} onChange={(value) => updateSales("averageCheckRub", value)} /></label>
          {planningTrafficPreset(cohort.locationType, cohort.format) ? <button type="button" className="cohort-preset-button" onClick={useTrafficPreset}>Подставить planning traffic: {planningTrafficPreset(cohort.locationType, cohort.format)?.checks_per_day} чеков</button> : null}
          <div className="cohort-operation-result"><span>Порций / день</span><strong data-testid={`scaling-cohort-portions-${cohort.id}`}>{formatCount(operations.sales.foodPortionsPerDay)}</strong><small>Кухонная нагрузка по каноническому product mix.</small></div>
          <div className="cohort-operation-result"><span>Минимальная площадь</span><strong data-testid={`scaling-cohort-area-minimum-${cohort.id}`}>{operations.area.minimumM2 === null ? "По договору" : `${operations.area.minimumM2} м²`}</strong><small>{operations.area.helper}</small></div>
          <div className="cohort-operation-result"><span>Людей одновременно</span><strong data-testid={`scaling-cohort-minimum-staff-${cohort.id}`}>{operations.staffing.concurrentStaff}</strong><small>{operations.staffing.note ?? "Плановый roster; это не FTE."}</small></div>
          <div className="cohort-operation-result"><span>Штат по графикам</span><strong data-testid={`scaling-cohort-roster-${cohort.id}`}>{operations.staffing.rosterHeadcount}</strong><small>2/2 · 12 ч для core; 5/2 · 8 ч только для peak role.</small></div>
          <div className="cohort-operation-result"><span>ФОТ точки / месяц</span><strong data-testid={`scaling-cohort-payroll-${cohort.id}`} data-amount-rub={operations.staffing.totalPayrollRub}>{formatRub(operations.staffing.totalPayrollRub)}</strong><small>Оклад, взносы и кадровый резерв по действующей формуле.</small></div>
          <div className="cohort-operation-result"><span>Выручка одной точки / месяц</span><strong data-testid={`scaling-cohort-revenue-point-${cohort.id}`} data-amount-rub={operations.sales.revenuePerPointRub ?? undefined}>{formatRub(operations.sales.revenuePerPointRub)}</strong><small>{operations.sales.workingDaysPerMonth} дней по существующей модели выручки.</small></div>
          <div className="cohort-operation-result"><span>Выручка группы / месяц</span><strong data-testid={`scaling-cohort-revenue-${cohort.id}`} data-amount-rub={operations.sales.revenueCohortRub ?? undefined}>{formatRub(operations.sales.revenueCohortRub)}</strong><small>Выручка точки × {cohort.count}; не является network EBITDA.</small></div>
        </div>
      </section>
      <section className="cohort-operations cohort-direct-opex" aria-label={`Прямые OPEX ${projection.formatName}`}>
        <header><div><p>OPEX · точка</p><h5>Операционный вклад до центральных расходов</h5></div><small>{projection.directOpex.isPartial ? "Planning / partial" : "Включено в расчёт"}</small></header>
        <div className="cohort-opex-lines">
          {projection.directOpex.lines.map((line) => <div key={line.id}><span>{line.name}</span><strong>{formatRub(line.amountRub)}</strong></div>)}
          <div className="is-total"><span>Прямые OPEX точки</span><strong data-testid={`scaling-cohort-direct-opex-${cohort.id}`}>{formatRub(projection.directOpex.directOpexPerPointRub)}</strong></div>
          <div className="is-total"><span>Операционный вклад точки</span><strong data-testid={`scaling-cohort-contribution-${cohort.id}`}>{formatRub(projection.directOpex.operatingContributionPerPointRub)}</strong></div>
        </div>
        {projection.directOpex.isPartial ? <small className="cohort-partial-note">Для полного вклада укажите: {projection.directOpex.missing.join(", ")}.</small> : <small className="cohort-partial-note">Не EBITDA: Production и центральные расходы сети показаны отдельно.</small>}
      </section>
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

  useEffect(() => {
    if (expandedCohortId && !configuration.networkScaling.cohorts.some((cohort) => cohort.id === expandedCohortId)) {
      setExpandedCohortId(configuration.networkScaling.cohorts[0]?.id ?? null);
    }
  }, [configuration.networkScaling.cohorts, expandedCohortId]);

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
            <div className="scaling-row is-control"><span>График производства</span><select value={configuration.networkScaling.productionSchedule} onChange={(event) => setNetworkScaling((current) => ({ ...current, productionSchedule: event.target.value === "custom" ? "custom" : "one_main_shift" }))}><option value="one_main_shift">Одна основная смена</option><option value="custom">Нужен отдельный график</option></select></div>
            <div className="scaling-row"><span>Заготовщики одновременно</span><strong data-testid="scaling-production-prep-cooks">{projection.operating.productionPayroll?.concurrentPrepCooks ?? "Не задано"}</strong></div>
            <div className="scaling-row"><span>ФОТ производства / месяц</span><strong>{formatRub(projection.operating.productionPayroll?.totalPayrollRub ?? null)}</strong></div>
            <div className="scaling-row is-note"><span>Мощность производства</span><small>{projection.capacityNote}</small></div>
            {projection.operating.productionPayroll?.capacityReviewRequired ? <p className="scaling-partial-note">Достигнуты 2 заготовщика в смене: дальнейшее расширение требует capacity review и решения о второй / ночной смене.</p> : null}
            <button type="button" className="scaling-details-button" aria-expanded={productionDetailsOpen} onClick={() => setProductionDetailsOpen((open) => !open)}>{productionDetailsOpen ? "Скрыть состав" : "Показать состав"}</button>
            {productionDetailsOpen ? <div data-testid="scaling-production-items"><ItemList items={projection.productionItems} multiplier="once" /></div> : null}
          </section>

          <section className="scaling-section cohort-section" aria-labelledby="points-title">
            <header><div><p>Независимые группы</p><h3 id="points-title">Торговые точки</h3></div><strong className="scaling-multiplier">×N</strong></header>
            <div className="cohort-table" data-testid="scaling-cohorts">
              <div className="cohort-table-head"><span>Тип</span><span>Локация</span><span>Недвижимость</span><span>Кол-во</span><span>Включено, 1</span><span>Итого</span></div>
              {projection.cohorts.map((cohort) => <button key={cohort.cohort.id} type="button" className={`cohort-table-row${expandedCohortId === cohort.cohort.id ? " is-expanded" : ""}`} data-testid={`scaling-cohort-row-${cohort.cohort.id}`} onClick={() => setExpandedCohortId((current) => current === cohort.cohort.id ? null : cohort.cohort.id)} aria-expanded={expandedCohortId === cohort.cohort.id}>
                <span>{cohort.formatName}</span><span>{locationLabel(cohort.cohort.locationType)}</span><span>{cohortEstateLabel(cohort.cohort)}</span><strong>×{cohort.cohort.count}</strong><strong>{formatMillion(cohort.confirmedPointInvestmentRub)}<small>частично</small></strong><strong>{formatMillion(cohort.confirmedCohortInvestmentRub)}<small>частично</small></strong>
              </button>)}
            </div>
            {projection.cohorts.map((cohort) => expandedCohortId === cohort.cohort.id ? <CohortEditor key={cohort.cohort.id} projection={cohort} onChange={(next) => updateCohort(cohort.cohort.id, next)} onDelete={() => removeCohort(cohort.cohort.id)} canDelete={projection.cohorts.length > 1} /> : null)}
            <div className="cohort-add">
              <label><span>Новая группа</span><select value={newGroupFormat} data-testid="scaling-add-format" onChange={(event) => setNewGroupFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
              <label><span>Недвижимость</span><select value={newGroupEstate} data-testid="scaling-add-estate" onChange={(event) => setNewGroupEstate(event.target.value as TradingPointCohort["realEstateMode"])}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label>
              <button type="button" onClick={addCohort} data-testid="scaling-add-cohort">+ Добавить группу</button>
            </div>
          </section>

          <section className="scaling-section" aria-labelledby="logistics-title">
            <header><div><p>Общие расходы сети</p><h3 id="logistics-title">Логистика</h3></div><strong className="scaling-multiplier">×1</strong></header>
            <div className="cohort-editor-grid">
              <label className="cohort-field"><span>Режим</span><select value={configuration.networkScaling.logistics.mode} onChange={(event) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, mode: event.target.value as "auto" | "external" | "own" } }))}><option value="auto">Авто по количеству точек</option><option value="external">Внешняя логистика</option><option value="own">Собственный рефрижератор</option></select></label>
              {projection.operating.logisticsMode === "external" ? <label className="cohort-field"><span>Внешняя логистика / месяц</span><NumericInput label="Внешняя логистика" value={configuration.networkScaling.logistics.externalMonthlyRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, externalMonthlyRub: value } }))} /><small>Для 1–2 точек задаётся договором.</small></label> : <>
                <label className="cohort-field"><span>Рефрижератор · CAPEX</span><NumericInput label="Рефрижератор CAPEX" value={configuration.networkScaling.logistics.ownedVehicleCapexRub ?? projection.operating.logisticsVehicleCapexRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, ownedVehicleCapexRub: value } }))} /><small>Planning reference: 5 млн ₽.</small></label>
                <label className="cohort-field"><span>Логистика / месяц</span><NumericInput label="Логистика / месяц" value={configuration.networkScaling.logistics.ownedMonthlyTotalRub ?? projection.operating.logisticsRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, ownedMonthlyTotalRub: value } }))} /><small>Planning reference: 250 тыс. ₽, включает водителя.</small></label>
              </>}
            </div>
            <p className="scaling-row is-note"><span>Развозка</span><small>Преимущественно ночью или вне пикового трафика. При трёх и более точках собственный автомобиль предлагается как planning path, но не forced.</small></p>
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
            {projection.cohorts.map((cohort) => <div key={cohort.cohort.id}><dt>{cohort.formatName} · {locationLabel(cohort.cohort.locationType)}</dt><dd data-testid={`scaling-cohort-summary-${cohort.cohort.id}`} data-amount-rub={cohort.confirmedCohortInvestmentRub}>{formatMillion(cohort.confirmedCohortInvestmentRub)} <b>×{cohort.cohort.count}</b><small>частично</small></dd></div>)}
            <div><dt>Пока не включено</dt><dd>{projection.unresolvedItems.length} статей</dd></div>
            <div className="is-total"><dt>Подтверждённые инвестиции</dt><dd data-testid="scaling-confirmed-total" data-amount-rub={projection.confirmedInvestmentSubtotalRub}>{formatMillion(projection.confirmedInvestmentSubtotalRub)}</dd></div>
          </dl>
          <p className="scaling-partial-note">Итог не включает статьи, для которых пока нет корректного распределения по производству, точкам или сети.</p>
          <section className="scaling-network-sales" aria-label="Planning launch" data-testid="scaling-planning-launch">
            <p>Planning launch · допущения</p>
            <dl>
              <div><dt>Первичная форма</dt><dd>{formatRub(projection.planningLaunch.uniformRub)}</dd></div>
              <div><dt>Запас на {configuration.networkScaling.cohorts[0]?.initialInventoryDays ?? 3} дня</dt><dd>{formatRub(projection.planningLaunch.initialPointInventoryRub)}</dd></div>
              <div><dt>Fitout / брендинг</dt><dd>{formatRub(projection.planningLaunch.fitoutRub)}</dd></div>
              <div><dt>Видео и сигнализация</dt><dd>{formatRub(projection.planningLaunch.securityRub)}</dd></div>
              <div><dt>Маркетинг запуска · сеть</dt><dd>{formatRub(projection.planningLaunch.launchMarketingRub)}</dd></div>
              <div><dt>Логистика · CAPEX</dt><dd>{formatRub(projection.planningLaunch.logisticsVehicleCapexRub)}</dd></div>
              <div className="is-total"><dt>Известная planning часть</dt><dd>{formatRub(projection.planningLaunch.totalKnownRub)}</dd></div>
            </dl>
            <small>{projection.planningLaunch.note}</small>
          </section>
          <section className="scaling-network-sales" aria-label="Продажи сети" data-testid="scaling-network-sales">
            <p>Продажи сети</p>
            <dl>
              <div><dt>Чеков / день</dt><dd data-testid="scaling-network-checks" data-checks-per-day={projection.sales.checksPerDay ?? undefined}>{formatCount(projection.sales.checksPerDay)}</dd></div>
              <div><dt>Средний чек</dt><dd data-testid="scaling-network-average-check" data-amount-rub={projection.sales.weightedAverageCheckRub ?? undefined}>{formatRub(projection.sales.weightedAverageCheckRub)}</dd></div>
              <div className="is-total"><dt>Выручка / месяц</dt><dd data-testid="scaling-network-revenue" data-amount-rub={projection.sales.revenuePerMonthRub ?? undefined}>{formatRub(projection.sales.revenuePerMonthRub)}</dd></div>
            </dl>
            <small data-testid="scaling-network-sales-status">{projection.sales.status === "complete" ? "Продажи групп агрегированы; planning operating result показан отдельно и не является canonical EBITDA." : projection.sales.status === "partial" ? "Для части групп не заданы продажи — общий итог пока не показан." : "Добавьте точки и укажите продажи, чтобы увидеть итог сети."}</small>
          </section>
          <section className="scaling-network-sales scaling-network-operating" aria-label="Операционная модель сети" data-testid="scaling-network-operating">
            <p>Операционная модель сети</p>
            <dl>
              <div><dt>Прямые OPEX точек</dt><dd data-testid="scaling-network-direct-opex">{formatRub(projection.operating.pointDirectOpexRub)}</dd></div>
              <div><dt>ФОТ производства</dt><dd data-testid="scaling-production-payroll">{formatRub(projection.operating.productionPayroll?.totalPayrollRub ?? null)}</dd></div>
              <div><dt>Управляющий сети</dt><dd data-testid="scaling-manager-payroll">{formatRub(projection.operating.managerPayroll?.totalPayrollRub ?? null)}</dd></div>
              <div><dt>Маркетинг · fixed</dt><dd>{formatRub(projection.operating.fixedMarketingRub)}</dd></div>
              <div><dt>Логистика</dt><dd data-testid="scaling-logistics-opex">{formatRub(projection.operating.logisticsRub)}</dd></div>
              <div className="is-total"><dt>Операционный результат</dt><dd data-testid="scaling-network-contribution">{formatRub(projection.operating.operatingContributionRub)}</dd></div>
            </dl>
            <small data-testid="scaling-network-operating-status">{projection.operating.note}</small>
          </section>
          <button type="button" className="terminal-reset" onClick={onReturnToUnit}>Вернуться к экономике точки</button>
        </aside>
      </div>
    </section>
  );
}
