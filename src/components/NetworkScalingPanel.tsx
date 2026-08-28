import { type WheelEvent, useEffect, useMemo, useState } from "react";
import {
  applyLocationRentPreset,
  applyNetworkRolloutPreset,
  createNetworkPointCohort,
  currentNetworkRolloutSize,
  type TradingPointCohort,
  type TradingPointFormat,
  updateCohortAreaFromRentPreset,
  updateCohortCount,
  updateCohortFirstOpeningMonth,
  updateCohortMonthlyRent,
  updateCohortRentRate,
} from "../lib/investor-configuration";
import type { ConfiguredMonthlyProjection } from "../lib/configured-economics";
import {
  type BaseObjectFinancialProjection,
  type NetworkPointCohortProjection,
  type NetworkScalingItem,
} from "../lib/network-scaling";
import { networkFinancialProjection } from "../lib/network-financial-projection";
import type { TemporalPointGroupProjection } from "../lib/network-temporal";
import { defaultPointPreparationCategoryIds, pointPreparationProjection } from "../lib/point-preparation";
import {
  defaultLocationRentPresetId,
  locationLabel,
  locationPlanningDefaults,
  locationRentPreset,
  networkLocationRentPresets,
  networkRolloutSizeIds,
  type LocationRentPresetId,
  type LocationType,
} from "../lib/network-planning";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { FormattedNumberInput, formatNumber } from "./FormattedNumberInput";

type BaseObjectSummary = BaseObjectFinancialProjection & {
  investmentBreakdown: Array<{ key: string; name: string; amount_rub: number }>;
  cashFlows: number[];
  monthlyProjection: ConfiguredMonthlyProjection[];
};

const calendarMonthNames = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function formatRub(value: number | null) {
  return value === null ? "Требует уточнения" : `${formatNumber(value, true)} ₽`;
}

function formatMillion(value: number) {
  return formatRub(value);
}

function formatCount(value: number | null) {
  return value === null ? "Требует уточнения" : formatNumber(value, true);
}

function paybackText(value: number | null) {
  if (value === null) return "Требует уточнения";
  return `≈ ${formatNumber(Math.round(value))} мес.`;
}

function monthText(month: number | null) {
  return month === null ? "Требует уточнения" : `М${formatNumber(month)}`;
}

function openingWavesText(waves: Array<{ openingMonth: number; count: number }>) {
  return waves.map((wave) => `${monthText(wave.openingMonth)} ×${formatNumber(wave.count)}`).join(" · ") || "Требует уточнения";
}

function cohortFormatLabel(format: TradingPointFormat) {
  return format === "with_seating" ? "С посадочным залом" : "Только на вынос";
}

function cohortEstateLabel(cohort: TradingPointCohort) {
  return cohort.locationType === "foodhall" ? "Условия площадки" : cohort.realEstateMode === "rent" ? "Аренда" : "Покупка";
}

function investmentItemName(key: string, name: string) {
  const names: Record<string, string> = {
    video: "Видеонаблюдение",
    alarm: "Охранная сигнализация",
    uniform: "Форма для персонала при запуске",
    inventory: "Стартовый запас",
    launch_marketing: "Маркетинг запуска сети",
    contingency: "Резерв на запуск",
    operating_reserve: "Операционный запас",
  };
  return names[key] ?? name;
}

function ItemList({ items, multiplier }: { items: NetworkScalingItem[]; multiplier: "once" | "per_point" | "not_aggregated" }) {
  if (!items.length) return <p className="scaling-empty">Подтверждённых статей пока нет.</p>;
  return (
    <div className="scaling-item-list">
      {items.map((item) => (
        <details key={item.id} className={`scaling-item is-${item.ownership}`} data-ownership={item.ownership} data-multiplier={item.multiplier}>
          <summary>
            <span>{item.name}{item.partial ? <small>В итог включена подтверждённая часть</small> : null}</span>
            <strong>{item.amountRub === null ? "Требует уточнения" : item.included ? formatRub(item.amountRub) : "Не применяется"}</strong>
          </summary>
          <div className="scaling-item-detail">
            <p>{multiplier === "once" ? "Входит в базовый объект и создаётся один раз." : multiplier === "per_point" ? "Учитывается для каждой точки этой группы." : "Пока не входит в общий итог."}</p>
            {multiplier === "not_aggregated" ? <p>{item.reason}</p> : null}
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
  return <label className="cohort-number"><FormattedNumberInput ariaLabel={label} testId={testId} disabled={disabled} value={value} onChange={onChange} integer={integer} /><span>{suffix}</span></label>;
}

function RentPresetSelector({ cohort, onChange }: { cohort: TradingPointCohort; onChange: (next: TradingPointCohort) => void }) {
  const selected = cohort.locationRentPresetId === "custom" ? null : locationRentPreset(cohort.locationRentPresetId);
  const presets = networkLocationRentPresets();
  const selectedIsFlagship = selected?.id === "ligovsky-21-flagship";
  return (
    <section className="cohort-rent-preset" aria-label="Район и арендный ориентир">
      <div className="cohort-rent-preset-head">
        <div><p>Район и аренда</p><h5>Арендный ориентир</h5></div>
        <label className="cohort-field"><span>Район</span><select className="terminal-select-control" data-testid={`scaling-cohort-rent-preset-${cohort.id}`} value={cohort.locationRentPresetId} onChange={(event) => onChange(applyLocationRentPreset(cohort, event.target.value as LocationRentPresetId))}>
          {selectedIsFlagship ? <option value="ligovsky-21-flagship" disabled>Лиговский 21 · базовый объект</option> : null}
          {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.shortLabel}</option>)}
          <option value="custom">Свой вариант</option>
        </select></label>
      </div>
      {selected ? <div className="cohort-rent-preset-current" data-testid={`scaling-cohort-rent-preset-summary-${cohort.id}`}>
        <div><strong>{selected.label}</strong><span>{selected.examples.join(" · ")}</span></div>
        <dl>
          <div><dt>Ставка</dt><dd>{formatRub(selected.rentPerM2MonthRub)} / м²</dd></div>
          <div><dt>Аренда</dt><dd>{formatRub(selected.monthlyRentRub)} / мес.</dd></div>
          <div><dt>Рынок</dt><dd>{formatNumber(selected.marketRangeRubPerM2Month[0], true)}–{formatNumber(selected.marketRangeRubPerM2Month[1], true)} ₽/м²</dd></div>
        </dl>
      </div> : <p className="cohort-rent-preset-custom">Укажите площадь, ставку или аренду в месяц.</p>}
      <details className="cohort-rent-preset-reference">
        <summary>Сравнить районы</summary>
        <div className="cohort-rent-preset-table">
          {presets.map((preset) => <button type="button" key={preset.id} onClick={() => onChange(applyLocationRentPreset(cohort, preset.id))}>
            <span><b>{preset.shortLabel}</b><small>{preset.examples.slice(0, 3).join(" · ")}</small></span>
            <strong>{formatNumber(preset.rentPerM2MonthRub, true)} ₽/м²<small>{formatRub(preset.monthlyRentRub)} / мес.</small></strong>
          </button>)}
        </div>
      </details>
    </section>
  );
}

function CohortEditor({
  projection,
  temporal,
  onChange,
  onDelete,
  canDelete,
}: {
  projection: NetworkPointCohortProjection;
  temporal: TemporalPointGroupProjection | undefined;
  onChange: (next: TradingPointCohort) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const cohort = projection.cohort;
  const update = <K extends keyof TradingPointCohort>(key: K, value: TradingPointCohort[K]) => onChange({ ...cohort, [key]: value });
  const setFormat = (format: TradingPointFormat) => {
    const previousDefaults = locationPlanningDefaults(cohort.locationType, cohort.format);
    const nextDefaults = locationPlanningDefaults(cohort.locationType, format);
    const usesCurrentAreaPreset = cohort.locationRentPresetId !== "custom"
      && cohort.totalAreaM2 === locationRentPreset(cohort.locationRentPresetId).baselineAreaM2;
    const needsOwnHallArea = format === "with_seating" && cohort.locationType === "street" && usesCurrentAreaPreset;
    const currentPreparationDefaults = defaultPointPreparationCategoryIds(cohort.format, cohort.locationType, cohort.sharedSeating);
    const nextPreparationDefaults = defaultPointPreparationCategoryIds(format, cohort.locationType, cohort.sharedSeating);
    const usesPreparationDefaults = cohort.preparationEnabledCategoryIds.join("|") === currentPreparationDefaults.join("|");
    onChange({
      ...cohort,
      format,
      guestAreaM2: format === "takeaway" ? null : cohort.guestAreaM2,
      totalAreaM2: needsOwnHallArea ? null : cohort.totalAreaM2,
      monthlyRentRub: needsOwnHallArea ? null : cohort.monthlyRentRub,
      utilitiesMonthlyRub: cohort.utilitiesMonthlyRub === previousDefaults.utilitiesMonthlyRub
        ? nextDefaults.utilitiesMonthlyRub
        : cohort.utilitiesMonthlyRub,
      preparationEnabledCategoryIds: usesPreparationDefaults ? nextPreparationDefaults : cohort.preparationEnabledCategoryIds,
    });
  };
  const setLocation = (locationType: LocationType) => {
    if (locationType === "street") {
      const next = applyLocationRentPreset({ ...cohort, ...locationPlanningDefaults(locationType, cohort.format) }, cohort.locationRentPresetId === "custom" ? defaultLocationRentPresetId : cohort.locationRentPresetId);
      onChange({
        ...next,
        preparationEnabledCategoryIds: defaultPointPreparationCategoryIds(next.format, next.locationType, next.sharedSeating),
      });
      return;
    }
    const locationDefaults = locationPlanningDefaults(locationType, cohort.format);
    onChange({
      ...cohort,
      locationType,
      locationRentPresetId: "custom",
      ...locationDefaults,
      preparationEnabledCategoryIds: defaultPointPreparationCategoryIds(cohort.format, locationType, locationDefaults.sharedSeating),
    });
  };
  const operations = projection.operational;
  const preparation = pointPreparationProjection({
    areaM2: cohort.totalAreaM2,
    format: cohort.format,
    locationType: cohort.locationType,
    sharedSeating: cohort.sharedSeating,
    mode: cohort.preparationMode,
    enabledCategoryIds: cohort.preparationEnabledCategoryIds,
    manualRub: cohort.preparationManualRub,
  });
  const togglePreparationCategory = (categoryId: string) => onChange({
    ...cohort,
    preparationEnabledCategoryIds: cohort.preparationEnabledCategoryIds.includes(categoryId)
      ? cohort.preparationEnabledCategoryIds.filter((id) => id !== categoryId)
      : [...cohort.preparationEnabledCategoryIds, categoryId],
  });
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
  return (
    <section className="cohort-editor" aria-label={`Параметры группы ${projection.formatName}`} data-testid={`scaling-cohort-editor-${cohort.id}`}>
      <div className="cohort-editor-header">
        <div><p>Группа точек</p><h4>{projection.formatName} · {projection.realEstateName}</h4></div>
        {canDelete ? <button type="button" className="cohort-remove" onClick={onDelete}>Удалить группу</button> : null}
      </div>
      <div className="cohort-editor-grid">
        <label className="cohort-field"><span>Формат точки</span><select className="terminal-select-control" value={cohort.format} data-testid={`scaling-cohort-format-${cohort.id}`} onChange={(event) => setFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
          <label className="cohort-field"><span>Формат размещения</span><select className="terminal-select-control" value={cohort.locationType} data-testid={`scaling-cohort-location-${cohort.id}`} onChange={(event) => setLocation(event.target.value as LocationType)}><option value="street">Отдельное помещение</option><option value="foodhall">Фудхолл</option><option value="creative_cluster">Креативный кластер</option><option value="foodtruck">Фудтрак · дополнительный формат</option></select></label>
        {cohort.locationType !== "foodhall" ? <label className="cohort-field"><span>Недвижимость</span><select className="terminal-select-control" value={cohort.realEstateMode} data-testid={`scaling-cohort-estate-${cohort.id}`} onChange={(event) => onChange({ ...cohort, realEstateMode: event.target.value as TradingPointCohort["realEstateMode"], locationRentPresetId: "custom" })}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label> : null}
        {cohort.locationType === "street" ? <RentPresetSelector cohort={cohort} onChange={onChange} /> : null}
        <label className="cohort-field"><span>Количество</span><NumericInput label="Количество точек" testId={`scaling-cohort-count-${cohort.id}`} value={cohort.count} suffix="шт." integer onChange={(value) => onChange(updateCohortCount(cohort, value ?? 0))} /></label>
        <label className={`cohort-field${operations.area.status === "below-minimum" ? " has-warning" : ""}`}><span>Площадь помещения</span><NumericInput label="Площадь помещения" testId={`scaling-cohort-area-${cohort.id}`} value={cohort.totalAreaM2} suffix="м²" onChange={(value) => onChange(updateCohortAreaFromRentPreset(cohort, value))} />{operations.area.status === "below-minimum" ? <small className="cohort-validation" data-testid={`scaling-cohort-area-warning-${cohort.id}`}>Ниже минимума для формата: {operations.area.minimumM2} м².</small> : null}</label>
        <label className="cohort-field"><span>Рабочая зона</span><NumericInput label="Рабочая зона" value={cohort.kitchenAreaM2} suffix="м²" onChange={(value) => update("kitchenAreaM2", value)} /></label>
        {cohort.format === "with_seating" ? <label className="cohort-field"><span>Посадочный зал</span><NumericInput label="Посадочный зал" value={cohort.guestAreaM2} suffix="м²" onChange={(value) => update("guestAreaM2", value)} /></label> : null}
        {cohort.locationType === "foodhall" ? <>
          <label className="cohort-field"><span>Процент площадке</span><NumericInput label="Процент площадке" value={cohort.revenueSharePercent} suffix="%" onChange={(value) => update("revenueSharePercent", value)} /><small>Площадка получает процент от выручки, но не меньше минимального ежемесячного платежа.</small></label>
          <label className="cohort-field"><span>Минимальный платёж</span><NumericInput label="Минимальный платёж" value={cohort.minimumGuaranteeMonthlyRub} suffix="₽" onChange={(value) => update("minimumGuaranteeMonthlyRub", value)} /></label>
          <div className="cohort-field cohort-static-value"><span>Предоплата</span><output>Не применяется</output></div>
          <div className="cohort-field cohort-static-value"><span>Обеспечительный платёж</span><output>Не применяется</output></div>
          <div className="cohort-field cohort-static-value"><span>Арендные каникулы</span><output>Не применяются</output></div>
        </> : cohort.realEstateMode === "rent" ? <>
          <label className="cohort-field"><span>Ставка за м²</span><NumericInput label="Ставка за м²" testId={`scaling-cohort-rent-rate-${cohort.id}`} value={cohort.rentPerM2Rub} suffix="₽ / м²" onChange={(value) => onChange(updateCohortRentRate(cohort, value))} /></label>
          <label className="cohort-field"><span>Аренда в месяц</span><NumericInput label="Аренда в месяц" testId={`scaling-cohort-rent-${cohort.id}`} value={cohort.monthlyRentRub} suffix="₽" onChange={(value) => onChange(updateCohortMonthlyRent(cohort, value))} /></label>
          <label className="cohort-field"><span>Предоплата</span><select className="terminal-select-control" value={cohort.prepaymentMonths ?? ""} onChange={(event) => update("prepaymentMonths", event.target.value === "" ? null : Number(event.target.value) as TradingPointCohort["prepaymentMonths"])}><option value="">Не задано</option><option value={1}>1 мес.</option><option value={3}>3 мес.</option><option value={12}>12 мес.</option></select></label>
          <label className="cohort-field"><span>Обеспечительный платёж</span><select className="terminal-select-control" value={cohort.securityDepositMonths ?? ""} onChange={(event) => update("securityDepositMonths", event.target.value === "" ? null : Number(event.target.value) as TradingPointCohort["securityDepositMonths"])}><option value="">Не задано</option><option value={1}>1 мес.</option><option value={2}>2 мес.</option><option value={3}>3 мес.</option></select></label>
          <label className="cohort-field"><span>Арендные каникулы</span><NumericInput label="Арендные каникулы" testId={`scaling-cohort-rent-free-${cohort.id}`} value={cohort.rentFreeMonths} suffix="мес." integer onChange={(value) => update("rentFreeMonths", Math.max(0, Math.floor(value ?? 0)))} /><small>Период после открытия, когда аренда не начисляется.</small></label>
        </> : <>
          <label className="cohort-field"><span>Ставка за м²</span><NumericInput label="Ставка за м²" testId={`scaling-cohort-rent-rate-${cohort.id}`} value={cohort.rentPerM2Rub} suffix="₽ / м²" onChange={(value) => onChange(updateCohortRentRate(cohort, value))} /></label>
          <label className="cohort-field"><span>Арендный ориентир</span><NumericInput label="Арендный ориентир" testId={`scaling-cohort-rent-${cohort.id}`} value={cohort.monthlyRentRub} suffix="₽" onChange={(value) => onChange(updateCohortMonthlyRent(cohort, value))} /></label>
          <label className="cohort-field"><span>Стоимость помещения</span><NumericInput label="Стоимость помещения" testId={`scaling-cohort-purchase-${cohort.id}`} value={cohort.purchasePriceRub} suffix="₽" onChange={(value) => update("purchasePriceRub", value)} /></label>
        </>}
        <section className="cohort-preparation" aria-label="Подготовка помещения" data-testid={`scaling-cohort-preparation-${cohort.id}`}>
          <div className="cohort-preparation-head">
            <div><span>Подготовка помещения</span><strong>{formatRub(preparation.effectiveRub)}</strong></div>
            <label className="cohort-field"><span>Способ расчёта</span><select className="terminal-select-control" value={cohort.preparationMode} onChange={(event) => update("preparationMode", event.target.value as TradingPointCohort["preparationMode"])}><option value="breakdown">По составу</option><option value="manual">Своё значение</option></select></label>
          </div>
          {cohort.preparationMode === "manual" ? <label className="cohort-field cohort-preparation-manual"><span>Смета подготовки</span><NumericInput label="Смета подготовки" value={cohort.preparationManualRub} suffix="₽" onChange={(value) => onChange({ ...cohort, preparationManualRub: value, preparationRub: value })} /></label> : <small>{preparation.note}</small>}
          <details className="cohort-preparation-details">
            <summary>Показать состав</summary>
            <div>
              {preparation.rows.map((row) => <label key={row.id} className={!row.applicable ? "is-not-applicable" : ""}>
                <input type="checkbox" checked={row.enabled} disabled={!row.applicable} onChange={() => togglePreparationCategory(row.id)} />
                <span>{row.name}{!row.applicable ? " · не применяется" : ""}</span>
                <strong>{row.applicable ? formatRub(row.amountRub) : "Не применяется"}</strong>
              </label>)}
            </div>
          </details>
        </section>
        <label className="cohort-field"><span>Запас на первые дни работы</span><NumericInput label="Запас на первые дни работы" value={cohort.initialInventoryDays} suffix="дней" integer onChange={(value) => update("initialInventoryDays", Math.max(0, Math.floor(value ?? 0)))} /></label>
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <label className="cohort-field"><span>Дополнительное брендирование</span><NumericInput label="Дополнительное брендирование" value={cohort.fitoutAllowanceRub} suffix="₽" onChange={(value) => update("fitoutAllowanceRub", value)} /><small>Только для отдельной сметы, не входящей в подготовку помещения.</small></label> : null}
        {cohort.locationType === "foodhall" ? <>
          <label className="cohort-field"><span>Эксплуатация и коммунальные</span><NumericInput label="Эксплуатация и коммунальные" value={cohort.serviceChargeMonthlyRub} suffix="₽" onChange={(value) => update("serviceChargeMonthlyRub", value)} /></label>
          <label className="cohort-field"><span>Склад</span><NumericInput label="Склад" value={cohort.storageRentMonthlyRub} suffix="₽" onChange={(value) => update("storageRentMonthlyRub", value)} /></label>
        </> : <label className="cohort-field"><span>{cohort.locationType === "creative_cluster" ? "Коммунальные и эксплуатационные расходы" : "Коммунальные / месяц"}</span><NumericInput label={cohort.locationType === "creative_cluster" ? "Коммунальные и эксплуатационные расходы" : "Коммунальные / месяц"} value={cohort.utilitiesMonthlyRub} suffix="₽" onChange={(value) => update("utilitiesMonthlyRub", value)} /></label>}
        <label className="cohort-field"><span>Вытяжка</span><select className="terminal-select-control" value={cohort.extractionAvailable === null ? "unknown" : cohort.extractionAvailable ? "yes" : "no"} data-testid={`scaling-cohort-extraction-${cohort.id}`} onChange={(event) => update("extractionAvailable", event.target.value === "unknown" ? null : event.target.value === "yes")}><option value="unknown">Требует подтверждения</option><option value="yes">Есть</option><option value="no">Нет</option></select>{operations.location.extractionStatus === "incompatible" ? <small className="cohort-validation" data-testid={`scaling-cohort-extraction-warning-${cohort.id}`}>Локация несовместима: для приготовления на точке нужна коммерческая вытяжка.</small> : null}</label>
        {(cohort.locationType === "foodhall" || cohort.locationType === "creative_cluster") ? <>
          <label className="cohort-field"><span>Общая посадка</span><select className="terminal-select-control" value={cohort.sharedSeating === null ? "unknown" : String(cohort.sharedSeating)} onChange={(event) => update("sharedSeating", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует уточнения</option><option value="true">Предоставляется площадкой</option><option value="false">Не предоставляется</option></select></label>
          <label className="cohort-field"><span>{cohort.locationType === "creative_cluster" ? "Охрана территории" : "Охрана общих зон"}</span><select className="terminal-select-control" value={cohort.venueSecurityIncluded === null ? "unknown" : String(cohort.venueSecurityIncluded)} onChange={(event) => update("venueSecurityIncluded", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует уточнения</option><option value="true">Предоставляется площадкой</option><option value="false">Не предоставляется</option></select></label>
          <label className="cohort-field"><span>Уборка общих зон</span><select className="terminal-select-control" value={cohort.commonCleaningIncluded === null ? "unknown" : String(cohort.commonCleaningIncluded)} onChange={(event) => update("commonCleaningIncluded", event.target.value === "unknown" ? null : event.target.value === "true")}><option value="unknown">Требует уточнения</option><option value="true">Предоставляется площадкой</option><option value="false">Не предоставляется</option></select></label>
        </> : <>
          <label className="cohort-field"><span>Видеонаблюдение</span><NumericInput label="Видеонаблюдение" value={cohort.videoAllowanceRub} suffix="₽" onChange={(value) => update("videoAllowanceRub", value)} /></label>
          <label className="cohort-field"><span>Охранная сигнализация</span><NumericInput label="Охранная сигнализация" value={cohort.alarmAllowanceRub} suffix="₽" onChange={(value) => update("alarmAllowanceRub", value)} /></label>
        </>}
        <div className="cohort-field cohort-toggle-field"><span>Бар</span><button type="button" className={`terminal-toggle${cohort.barEnabled ? " is-on" : ""}`} role="switch" aria-checked={cohort.barEnabled} data-testid={`scaling-cohort-bar-${cohort.id}`} onClick={() => update("barEnabled", !cohort.barEnabled)}><span aria-hidden="true"><i /></span>{cohort.barEnabled ? "Включён" : "Выключен"}</button></div>
      </div>
      <section className="cohort-temporal" aria-label={`Открытие и прогноз ${projection.formatName}`}>
        <header><div><p>Открытие и прогноз</p><h5>Выход на плановый режим</h5></div></header>
          <div className="cohort-temporal-grid">
            <label className="cohort-field"><span>Месяц открытия</span><NumericInput label="Месяц открытия" testId={`scaling-cohort-opening-${cohort.id}`} value={temporal?.firstOpeningMonth ?? cohort.openingWaves[0]?.openingMonth ?? null} suffix="месяц" integer onChange={(value) => onChange(updateCohortFirstOpeningMonth(cohort, value ?? 0))} /><small>От старта программы развития.</small></label>
            {cohort.openingWaves.length > 1 ? <div className="cohort-operation-result"><span>Следующие открытия</span><strong>{openingWavesText(cohort.openingWaves.slice(1))}</strong><small>Одинаковые точки открываются по очереди.</small></div> : null}
            <div className="cohort-operation-result"><span>Разгон</span><strong>{temporal?.rampDurationMonths ?? 0} месяцев</strong><small>Выручка постепенно выходит на плановый уровень.</small></div>
            <div className="cohort-operation-result"><span>Выход на плановый режим</span><strong>{monthText(temporal?.planLevelMonth ?? null)}</strong></div>
            <div className="cohort-operation-result"><span>Сезонность</span><strong>Учитывается</strong></div>
            <div className="cohort-operation-result"><span>Расчётная окупаемость</span><strong>{paybackText(temporal?.paybackMonth ?? null)}</strong><small>По накопленному денежному потоку.</small></div>
          </div>
        {temporal ? <details className="cohort-temporal-details">
          <summary>Прогноз по месяцам</summary>
          <div className="cohort-temporal-table">
            <div><span>Месяц</span><span>Выручка</span><span>Расходы</span><span>Инвестиции</span><span>Денежный поток</span><span>Накопленный поток</span></div>
            {temporal.months.filter((month) => month.month >= Math.max(0, (temporal.firstOpeningMonth ?? 0) - 1)).slice(0, 18).map((month) => <div key={month.month}>
              <span>{monthText(month.month)}</span><strong>{formatRub(month.revenueRub)}</strong><strong>{formatRub(month.opexRub)}</strong><strong>{formatRub((month.capexRub ?? 0) + (month.operatingReserveRub ?? 0))}</strong><strong>{formatRub(month.cashFlowRub)}</strong><strong>{formatRub(month.cumulativeCashFlowRub)}</strong>
            </div>)}
          </div>
        </details> : null}
      </section>
      <section className="cohort-operations" aria-label={`Операционная модель ${projection.formatName}`}>
        <header><div><p>Операционная модель</p><h5>Поток и минимальная нагрузка</h5></div><small>{operations.sales.source === "baseline" ? "Базовый сценарий" : "Пользовательский сценарий"}</small></header>
        <div className="cohort-operations-grid">
          <label className="cohort-field"><span>Источник продаж</span><select className="terminal-select-control" value={cohort.sales.mode} data-testid={`scaling-cohort-sales-mode-${cohort.id}`} onChange={(event) => setSalesMode(event.target.value as TradingPointCohort["sales"]["mode"])}><option value="baseline">Базовый сценарий</option><option value="custom">Свой сценарий</option></select></label>
          <label className="cohort-field"><span>Чеков в день</span><NumericInput label={`Чеков в день ${cohort.id}`} testId={`scaling-cohort-checks-${cohort.id}`} value={operations.sales.checksPerDay} suffix="чеков" integer disabled={cohort.sales.mode === "baseline"} onChange={(value) => updateSales("checksPerDay", value === null ? null : Math.floor(value))} /></label>
          <label className="cohort-field"><span>Средний чек</span><NumericInput label={`Средний чек ${cohort.id}`} testId={`scaling-cohort-average-check-${cohort.id}`} value={operations.sales.averageCheckRub} suffix="₽" disabled={cohort.sales.mode === "baseline"} onChange={(value) => updateSales("averageCheckRub", value)} /></label>
          <div className="cohort-operation-result"><span>Порций / день</span><strong data-testid={`scaling-cohort-portions-${cohort.id}`}>{formatCount(operations.sales.foodPortionsPerDay)}</strong><small>Показывает нагрузку на кухню при текущем составе заказа.</small></div>
          <div className="cohort-operation-result"><span>Минимальная площадь</span><strong data-testid={`scaling-cohort-area-minimum-${cohort.id}`}>{operations.area.minimumM2 === null ? "По договору" : `${operations.area.minimumM2} м²`}</strong><small>{operations.area.helper}</small></div>
          <div className="cohort-operation-result"><span>Людей на смене</span><strong data-testid={`scaling-cohort-minimum-staff-${cohort.id}`}>{operations.staffing.concurrentStaff}</strong><small>{operations.staffing.note ?? "Минимум одновременно на смене; это не количество штатных единиц."}</small></div>
          <div className="cohort-operation-result"><span>Штат по графику</span><strong data-testid={`scaling-cohort-roster-${cohort.id}`}>{operations.staffing.rosterHeadcount}</strong><small>Количество сотрудников, необходимое с учётом графика работы.</small></div>
          <div className="cohort-operation-result"><span>Расходы на персонал / месяц</span><strong data-testid={`scaling-cohort-payroll-${cohort.id}`} data-amount-rub={operations.staffing.totalPayrollRub}>{formatRub(operations.staffing.totalPayrollRub)}</strong><small>Зарплаты, взносы и резерв на персонал.</small></div>
          <div className="cohort-operation-result"><span>Выручка одной точки / месяц</span><strong data-testid={`scaling-cohort-revenue-point-${cohort.id}`} data-amount-rub={operations.sales.revenuePerPointRub ?? undefined}>{formatRub(operations.sales.revenuePerPointRub)}</strong><small>{operations.sales.workingDaysPerMonth} дней по существующей модели выручки.</small></div>
          <div className="cohort-operation-result"><span>Выручка группы / месяц</span><strong data-testid={`scaling-cohort-revenue-${cohort.id}`} data-amount-rub={operations.sales.revenueCohortRub ?? undefined}>{formatRub(operations.sales.revenueCohortRub)}</strong><small>Выручка одной точки × {cohort.count}. Общие расходы сети учитываются отдельно.</small></div>
        </div>
      </section>
      <section className="cohort-operations cohort-direct-opex" aria-label={`Прямые расходы ${projection.formatName}`}>
        <header><div><p>Расходы точки</p><h5>Операционный вклад точки</h5></div><small>{projection.directOpex.isPartial ? "Предварительный расчёт" : "Включено в расчёт"}</small></header>
        <div className="cohort-opex-lines">
          {projection.directOpex.lines.map((line) => <div key={line.id}><span>{line.name}</span><strong>{formatRub(line.amountRub)}</strong></div>)}
          <div className="is-total"><span>Прямые расходы точки</span><strong data-testid={`scaling-cohort-direct-opex-${cohort.id}`}>{formatRub(projection.directOpex.directOpexPerPointRub)}</strong></div>
          <div className="is-total"><span>Операционный вклад точки</span><strong data-testid={`scaling-cohort-contribution-${cohort.id}`}>{formatRub(projection.directOpex.operatingContributionPerPointRub)}</strong></div>
        </div>
        {projection.directOpex.isPartial ? <small className="cohort-partial-note">Результат точки до общих расходов сети. Для полного расчёта укажите: {projection.directOpex.missing.join(", ")}.</small> : <small className="cohort-partial-note">Результат точки до общих расходов сети.</small>}
      </section>
      <div className="cohort-calculation">
        <span>Расчётная стоимость открытия точки</span>
        <strong data-testid={`scaling-cohort-unit-${cohort.id}`} data-amount-rub={projection.confirmedPointInvestmentRub}>{formatMillion(projection.confirmedPointInvestmentRub)}</strong>
        <span>×{cohort.count}</span>
        <strong data-testid={`scaling-cohort-total-${cohort.id}`} data-amount-rub={projection.confirmedCohortInvestmentRub}>{formatMillion(projection.confirmedCohortInvestmentRub)}</strong>
      </div>
      <details className="cohort-items">
        <summary>Показать включённые статьи</summary>
        <ItemList items={projection.pointItems} multiplier="per_point" />
      </details>
      <p className="cohort-partial-note">Не включает статьи, для которых требуется отдельное уточнение.</p>
    </section>
  );
}

export function NetworkScalingPanel({ baseObject, onReturnToUnit }: { baseObject: BaseObjectSummary; onReturnToUnit: () => void }) {
  const { configuration, setNetworkScaling } = useInvestorConfiguration();
  const financial = useMemo(() => networkFinancialProjection(configuration, baseObject, baseObject), [baseObject, configuration]);
  const { scaling: projection, economics, temporal } = financial;
  const [unresolvedDetailsOpen, setUnresolvedDetailsOpen] = useState(false);
  const [expandedCohortId, setExpandedCohortId] = useState<string | null>(() => configuration.networkScaling.cohorts[1]?.id ?? null);
  const [newGroupFormat, setNewGroupFormat] = useState<TradingPointFormat>("takeaway");
  const [newGroupEstate, setNewGroupEstate] = useState<TradingPointCohort["realEstateMode"]>("rent");
  const additionalCohorts = projection.cohorts.slice(1);
  const additionalPointCount = additionalCohorts.reduce((total, cohort) => total + cohort.cohort.count, 0);
  const totalPointCount = configuration.networkScaling.cohorts.reduce((total, cohort) => total + cohort.count, 0);
  const rolloutSize = currentNetworkRolloutSize(configuration.networkScaling);
  const firstAdditionalOpening = temporal.expansion.groups
    .map((group) => group.firstOpeningMonth)
    .filter((month): month is number => month !== null)
    .sort((left, right) => left - right)[0] ?? null;
  const networkInvestmentRub = temporal.funding.totalProgramInvestmentRub;
  const coverageSummary = financial.coverage.calculation === "invalid"
    ? "Недостаточно входных данных"
    : financial.coverage.hasCaveats
      ? "Расчёт выполнен с оговорками"
      : "Расчёт выполнен";

  useEffect(() => {
    if (expandedCohortId && !configuration.networkScaling.cohorts.some((cohort) => cohort.id === expandedCohortId)) {
      setExpandedCohortId(configuration.networkScaling.cohorts[1]?.id ?? null);
    }
  }, [configuration.networkScaling.cohorts, expandedCohortId]);

  function updateCohort(id: string, next: TradingPointCohort) {
    setNetworkScaling((current) => ({ ...current, cohorts: current.cohorts.map((cohort) => cohort.id === id ? next : cohort) }));
  }

  function addCohort() {
    setNetworkScaling((current) => {
      const used = new Set(current.cohorts.map((cohort) => cohort.id));
      let number = current.cohorts.length + 1;
      while (used.has(`cohort-${number}`)) number += 1;
      const next = createNetworkPointCohort(configuration.launchBudget, { id: `cohort-${number}`, format: newGroupFormat, realEstateMode: newGroupEstate });
      setExpandedCohortId(next.id);
      return { ...current, cohorts: [...current.cohorts, next] };
    });
  }

  function removeCohort(id: string) {
    setNetworkScaling((current) => ({ ...current, cohorts: current.cohorts.filter((cohort) => cohort.id !== id) }));
    setExpandedCohortId(null);
  }

  function applyRolloutSize(size: 4 | 8 | 12) {
    setNetworkScaling((current) => applyNetworkRolloutPreset(current, configuration.launchBudget, size));
  }

  function continueSummaryScroll(event: WheelEvent<HTMLElement>) {
    if (event.deltaY === 0 || !window.matchMedia("(min-width: 851px)").matches) return;
    const summary = event.currentTarget;
    const maximumScrollTop = Math.max(0, summary.scrollHeight - summary.clientHeight);
    const atUpperBoundary = event.deltaY < 0 && summary.scrollTop <= 0;
    const atLowerBoundary = event.deltaY > 0 && summary.scrollTop >= maximumScrollTop - 1;
    if (!atUpperBoundary && !atLowerBoundary) return;
    // Chromium does not consistently chain wheel input from this sticky nested
    // scroller at a boundary. Forward only that otherwise dropped event; all
    // regular scrolling remains browser-native inside the summary.
    event.preventDefault();
    window.scrollBy({ top: event.deltaY, behavior: "auto" });
  }

  return (
    <section className="scaling-workspace" aria-labelledby="scaling-title">
      <header className="scaling-header">
        <p>Терминал инвестора</p>
        <h2 id="scaling-title">Масштабирование</h2>
        <p className="scaling-intro">Сеть начинается с базового объекта — первой торговой точки с посадочным залом, совмещённой с заготовочным производством. Добавьте дополнительные точки, чтобы оценить стоимость и экономику развития сети.</p>
      </header>

      <div className="scaling-grid">
        <div className="scaling-inputs">
          <section className="scaling-section base-object-section" aria-labelledby="base-object-title">
            <header><div><p>Старт сети</p><h3 id="base-object-title">Базовый объект</h3></div><strong className="scaling-multiplier">×1</strong></header>
            <div className="base-object-summary">
              <p>Базовый объект объединяет первую торговую точку с посадочным залом и заготовочное производство. Подробная экономика рассчитана на вкладке «Экономика точки».</p>
              <div className="base-object-total">
                <div><span>Заготовочное производство + первая точка</span><strong>Инвестиции</strong></div>
                <output data-testid="scaling-base-object-total" data-amount-rub={baseObject.investmentRub}>{formatRub(baseObject.investmentRub)}</output>
              </div>
              <button type="button" className="terminal-secondary-action" onClick={onReturnToUnit} data-testid="scaling-edit-base-object">Изменить базовый объект</button>
              <details className="base-object-details">
                <summary>Показать состав</summary>
                <dl>
                  {baseObject.investmentBreakdown.map((item) => <div key={item.key}><dt>{investmentItemName(item.key, item.name)}</dt><dd>{formatRub(item.amount_rub)}</dd></div>)}
                </dl>
              </details>
            </div>
          </section>

          <section className="scaling-section cohort-section" aria-labelledby="points-title">
            <header><div><p>Развитие сети</p><h3 id="points-title">Дополнительные точки сети</h3></div><strong className="scaling-multiplier">{additionalPointCount} {additionalPointCount === 1 ? "точка" : additionalPointCount >= 2 && additionalPointCount <= 4 ? "точки" : "точек"}</strong></header>
            <p className="scaling-section-intro">Добавьте точки разных форматов, чтобы рассчитать развитие сети.</p>
            <div className="scaling-rollout-controls" aria-label="Размер первой очереди сети">
              <span>Дополнительных точек</span>
              <div className="terminal-segmented" role="group" aria-label="Количество дополнительных точек">
                {networkRolloutSizeIds.map((size) => <button key={size} type="button" className={rolloutSize === size ? "is-selected" : ""} data-testid={`scaling-rollout-${size}`} onClick={() => applyRolloutSize(size)}>{size}</button>)}
                <button type="button" className={rolloutSize === "custom" ? "is-selected" : ""} data-testid="scaling-rollout-custom" disabled>Свой вариант</button>
              </div>
              <small>Дополнительных точек: {additionalPointCount} · Всего точек сети: {totalPointCount}</small>
              <label className="scaling-calendar-start"><span>Старт программы</span><select className="terminal-select-control" aria-label="Месяц старта программы" value={configuration.networkScaling.calendarStartMonth} onChange={(event) => setNetworkScaling((current) => ({ ...current, calendarStartMonth: Number(event.target.value) }))}>
                {calendarMonthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select></label>
            </div>
            <div className="cohort-table" data-testid="scaling-cohorts">
              <div className="cohort-table-head"><span>Район</span><span>Формат</span><span>Размещение</span><span>Площадь</span><span>Чеков / день</span><span>Кол-во</span><span>Открытие</span><span>Открытие / точка</span></div>
              {additionalCohorts.map((cohort) => {
                const cohortTemporal = temporal.expansion.groups.find((item) => item.cohortId === cohort.cohort.id);
                return <button key={cohort.cohort.id} type="button" className={`cohort-table-row${expandedCohortId === cohort.cohort.id ? " is-expanded" : ""}`} data-testid={`scaling-cohort-row-${cohort.cohort.id}`} onClick={() => setExpandedCohortId((current) => current === cohort.cohort.id ? null : cohort.cohort.id)} aria-expanded={expandedCohortId === cohort.cohort.id}>
                  <span>{cohort.cohort.locationRentPresetId === "custom" ? "Свой вариант" : locationRentPreset(cohort.cohort.locationRentPresetId).shortLabel}<small>{cohort.cohort.locationType === "street" && cohort.cohort.rentPerM2Rub !== null ? `${formatNumber(cohort.cohort.rentPerM2Rub, true)} ₽/м²` : "Условия площадки"}</small></span><span>{cohort.formatName}</span><span>{locationLabel(cohort.cohort.locationType)}<small>{cohortEstateLabel(cohort.cohort)}</small></span><strong>{cohort.cohort.totalAreaM2 === null ? "Требует уточнения" : `${formatNumber(cohort.cohort.totalAreaM2)} м²`}</strong><strong>{formatCount(cohort.operational.sales.checksPerDay)}</strong><strong>{formatCount(cohort.cohort.count)}</strong><strong>{monthText(cohortTemporal?.firstOpeningMonth ?? null)}<small>{cohortTemporal?.openingWaves.length && cohortTemporal.openingWaves.length > 1 ? openingWavesText(cohortTemporal.openingWaves.slice(1)) : "по графику"}</small></strong><strong>{formatMillion(cohort.confirmedPointInvestmentRub)}<small>{cohort.isPartial ? "не все статьи оценены" : "расчётная стоимость"}</small></strong>
                </button>;
              })}
            </div>
            {additionalCohorts.length === 0 ? <p className="scaling-empty">Дополнительных групп пока нет.</p> : null}
            {additionalCohorts.map((cohort) => expandedCohortId === cohort.cohort.id ? <CohortEditor key={cohort.cohort.id} projection={cohort} temporal={temporal.expansion.groups.find((item) => item.cohortId === cohort.cohort.id)} onChange={(next) => updateCohort(cohort.cohort.id, next)} onDelete={() => removeCohort(cohort.cohort.id)} canDelete /> : null)}
            <div className="cohort-add">
              <label><span>Новая группа</span><select className="terminal-select-control" value={newGroupFormat} data-testid="scaling-add-format" onChange={(event) => setNewGroupFormat(event.target.value as TradingPointFormat)}><option value="with_seating">С посадочным залом</option><option value="takeaway">Только на вынос</option></select></label>
              <label><span>Недвижимость</span><select className="terminal-select-control" value={newGroupEstate} data-testid="scaling-add-estate" onChange={(event) => setNewGroupEstate(event.target.value as TradingPointCohort["realEstateMode"])}><option value="rent">Аренда</option><option value="purchase">Покупка</option></select></label>
              <button type="button" onClick={addCohort} data-testid="scaling-add-cohort">+ Добавить группу</button>
            </div>
          </section>

          <section className="scaling-section" aria-labelledby="network-costs-title">
            <header><div><p>На всю сеть</p><h3 id="network-costs-title">Общие расходы сети</h3></div><strong className="scaling-multiplier">×1</strong></header>
            <p className="scaling-section-intro">Расходы, которые относятся ко всей сети, а не к отдельной точке.</p>
            <div className="cohort-editor-grid">
              <label className="cohort-field"><span>Режим логистики</span><select className="terminal-select-control" value={configuration.networkScaling.logistics.mode} onChange={(event) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, mode: event.target.value as "auto" | "external" | "own" } }))}><option value="auto">Авто по количеству точек</option><option value="external">Внешняя логистика</option><option value="own">Собственный рефрижератор</option></select></label>
              <label className="cohort-field"><span>График производства</span><select className="terminal-select-control" value={configuration.networkScaling.productionSchedule} onChange={(event) => setNetworkScaling((current) => ({ ...current, productionSchedule: event.target.value === "custom" ? "custom" : "one_main_shift" }))}><option value="one_main_shift">Одна основная смена</option><option value="custom">Нужен отдельный график</option></select><small>Задаёт режим работы заготовочного производства.</small></label>
              {projection.operating.logisticsMode === "external" ? <label className="cohort-field"><span>Внешняя логистика / месяц</span><NumericInput label="Внешняя логистика" value={configuration.networkScaling.logistics.externalMonthlyRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, externalMonthlyRub: value } }))} /><small>Для 1–2 точек задаётся договором.</small></label> : <>
                <label className="cohort-field"><span>Рефрижератор · инвестиции</span><NumericInput label="Рефрижератор, инвестиции" value={configuration.networkScaling.logistics.ownedVehicleCapexRub ?? projection.operating.logisticsVehicleCapexRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, ownedVehicleCapexRub: value } }))} /><small>Включает автомобиль для ежедневной развозки.</small></label>
                <label className="cohort-field"><span>Логистика / месяц</span><NumericInput label="Логистика / месяц" value={configuration.networkScaling.logistics.ownedMonthlyTotalRub ?? projection.operating.logisticsRub} suffix="₽" onChange={(value) => setNetworkScaling((current) => ({ ...current, logistics: { ...current.logistics, ownedMonthlyTotalRub: value } }))} /><small>Включает водителя, топливо, обслуживание и резерв.</small></label>
              </>}
            </div>
            <div className="scaling-row"><span>Управляющий сети</span><strong>{formatRub(projection.operating.managerPayroll?.totalPayrollRub ?? null)}</strong></div>
            <div className="scaling-row"><span>Общий маркетинг / месяц</span><strong>{formatRub(projection.operating.fixedMarketingRub)}</strong></div>
            <div className="scaling-row"><span>Административный резерв расширения</span><strong>{formatRub(projection.operating.administrativeReserveRub)}</strong></div>
            <div className="scaling-row is-note"><span>Бухгалтерия и прочие shared расходы</span><small>Уже учтены один раз в базовом объекте; в расширении не дублируются.</small></div>
            <div className="scaling-row is-note"><span>Мощность производства</span><small>{projection.operating.productionCapacity?.status === "review_required" ? "Требуется проверка мощности производства." : "Покрыто текущей staffing policy."}</small></div>
            <p className="scaling-row is-note"><span>Развозка</span><small>Преимущественно ночью или вне пикового трафика. При росте сети можно рассмотреть собственный автомобиль.</small></p>
          </section>

          <section className="scaling-section is-unresolved" aria-labelledby="unresolved-title">
            <header><div><p>Покрытие модели</p><h3 id="unresolved-title">{coverageSummary}</h3></div><strong className="scaling-multiplier">{financial.exclusions.length}</strong></header>
            <div className="scaling-unresolved-brief" data-testid="scaling-reserve"><p>{financial.coverage.pricing === "partial" ? "Не включено в расчёт: отдельные цены или договоры ещё не подтверждены." : "Расчёт выполнен на известной базе; ниже раскрыты требующие подтверждения условия."}</p></div>
            {financial.coverage.assumptions !== "confirmed" ? <p className="scaling-row is-note"><span>Требует подтверждения</span><small>Налоговый режим, банковский тариф, условия YUMA и срок амортизации рефрижератора.</small></p> : null}
            {financial.coverage.capacity !== "covered" ? <p className="scaling-row is-note"><span>Мощность производства</span><small>Требуется проверка мощности производства.</small></p> : null}
            <button type="button" className="scaling-details-button" aria-expanded={unresolvedDetailsOpen} onClick={() => setUnresolvedDetailsOpen((open) => !open)}>{unresolvedDetailsOpen ? "Скрыть список" : `Показать статьи (${financial.exclusions.length})`}</button>
            {unresolvedDetailsOpen ? <div data-testid="scaling-unresolved"><ul className="scaling-item-list">{financial.exclusions.map((item) => <li key={item.id} className="scaling-item is-unresolved"><strong>{item.name}</strong><p>{item.reason}</p></li>)}</ul></div> : null}
          </section>
        </div>

        <aside className="scaling-results" aria-label="Сводка масштабирования" data-base-opex-rub={baseObject.opexRub} tabIndex={0} onWheel={continueSummaryScroll}>
          <p>Сводка сети</p>
          <h3>Базовый объект</h3>
          <dl>
            <div><dt>Инвестиции</dt><dd data-testid="scaling-base-object-summary" data-amount-rub={baseObject.investmentRub}>{formatRub(baseObject.investmentRub)}</dd></div>
            <div><dt>Выручка / месяц</dt><dd>{formatRub(baseObject.revenueRub)}</dd></div>
            <div><dt>EBITDA</dt><dd>{formatRub(baseObject.operatingResultRub)}</dd></div>
            <div><dt>Свободный денежный поток</dt><dd data-testid="scaling-base-fcf" data-amount-rub={baseObject.cashFlowRub}>{formatRub(baseObject.cashFlowRub)}</dd></div>
            <div className="is-total"><dt>Окупаемость</dt><dd>{paybackText(baseObject.paybackMonth)}</dd></div>
          </dl>
          <section className="scaling-network-sales" aria-label="Расширение сети">
            <p>Расширение сети</p>
            <dl>
              <div><dt>Дополнительных точек</dt><dd data-testid="scaling-additional-points">{formatCount(temporal.expansion.additionalPointCount)}</dd></div>
              <div><dt>Период открытий</dt><dd>{firstAdditionalOpening === null ? "Требует уточнения" : `${monthText(firstAdditionalOpening)} → ${monthText(temporal.lastOpeningMonth)}`}</dd></div>
              <div><dt>Инвестиции точек</dt><dd data-testid="scaling-additional-investment" data-amount-rub={temporal.expansion.pointInvestmentRub}>{formatRub(temporal.expansion.pointInvestmentRub)}</dd></div>
              {projection.sharedItems.map((item) => <div key={item.id}><dt>{item.name}</dt><dd data-testid="scaling-shared-investment" data-amount-rub={item.amountRub ?? undefined}>{formatRub(item.amountRub)}</dd></div>)}
              <div><dt>Запас расширения</dt><dd data-testid="scaling-expansion-reserve" data-amount-rub={temporal.expansion.operatingReserveRub ?? undefined}>{formatRub(temporal.expansion.operatingReserveRub)}</dd></div>
              <div><dt>Выручка / мес.</dt><dd>{formatRub(economics.expansion.revenueRub)}</dd></div>
              <div><dt>Прямые расходы точек</dt><dd>{formatRub(economics.expansion.directOpexRub)}</dd></div>
              <div><dt>Доп. общие расходы</dt><dd>{formatRub(economics.expansion.sharedOpexRub)}</dd></div>
              <div><dt>FCF / мес.</dt><dd data-testid="scaling-expansion-fcf" data-amount-rub={economics.expansion.cashFlowRub ?? undefined}>{formatRub(economics.expansion.cashFlowRub)}</dd></div>
              <div className="is-total"><dt>Окупаемость</dt><dd>{paybackText(temporal.expansion.paybackMonth)}</dd></div>
            </dl>
            <small>{temporal.expansion.isPartial ? "Расчёт с оговорками." : `Разгон и сезонность: ${monthText(temporal.fullScaleMonth)}.`}</small>
          </section>
          <section className="scaling-network-sales" aria-label="Сеть целиком" data-testid="scaling-network-sales">
            <p>Сеть целиком</p>
            <dl>
              <div><dt>Всего точек</dt><dd data-testid="scaling-network-points">{formatCount(temporal.network.pointCount)}</dd></div>
              <div><dt>Вся программа</dt><dd data-testid="scaling-network-total" data-amount-rub={networkInvestmentRub ?? undefined}>{formatRub(networkInvestmentRub)}</dd></div>
              <div><dt>Нужно привлечь</dt><dd data-testid="scaling-upfront-funding" data-amount-rub={temporal.funding.upfrontInvestorFundingRub ?? undefined}>{formatRub(temporal.funding.upfrontInvestorFundingRub)}</dd></div>
              <div><dt>Чеков / день</dt><dd data-testid="scaling-network-checks" data-checks-per-day={projection.sales.checksPerDay ?? undefined}>{formatCount(projection.sales.checksPerDay)}</dd></div>
              <div><dt>Выручка / мес.</dt><dd data-testid="scaling-network-revenue" data-amount-rub={economics.network.revenueRub ?? undefined}>{formatRub(economics.network.revenueRub)}</dd></div>
              <div><dt>OPEX / мес.</dt><dd data-testid="scaling-network-opex" data-amount-rub={economics.network.opexRub ?? undefined}>{formatRub(economics.network.opexRub)}</dd></div>
              <div><dt>EBITDA</dt><dd>{formatRub(economics.network.operatingResultRub)}</dd></div>
              <div><dt>FCF / мес.</dt><dd data-testid="scaling-network-fcf" data-amount-rub={economics.network.cashFlowRub ?? undefined}>{formatRub(economics.network.cashFlowRub)}</dd></div>
              <div className="is-total"><dt>Окупаемость сети</dt><dd data-testid="scaling-network-payback" data-payback-month={temporal.network.paybackMonth ?? undefined}>{paybackText(temporal.network.paybackMonth)}</dd></div>
            </dl>
            <small data-testid="scaling-network-sales-status">{temporal.network.isPartial ? "Расчёт с оговорками." : financial.coverage.hasCaveats ? "Расчёт с оговорками. Мощность не проверена." : `Плановый режим: ${monthText(temporal.fullScaleMonth)}.`}</small>
          </section>
          <section className="scaling-network-sales scaling-network-operating" aria-label="Расходы расширения" data-testid="scaling-network-operating">
            <p>Расходы расширения</p>
            <dl>
              <div><dt>Прямые расходы точек</dt><dd data-testid="scaling-network-direct-opex" data-amount-rub={projection.operating.pointDirectOpexRub ?? undefined}>{formatRub(projection.operating.pointDirectOpexRub)}</dd></div>
              <div><dt>Производство</dt><dd data-testid="scaling-expansion-production-opex" data-amount-rub={projection.operating.expansionProductionPayrollRub ?? undefined}>{formatRub(projection.operating.expansionProductionPayrollRub)}</dd></div>
              {projection.operating.expansionManagerPayrollRub !== null && projection.operating.expansionManagerPayrollRub !== 0 ? <div><dt>Управляющий</dt><dd data-testid="scaling-manager-payroll" data-amount-rub={projection.operating.expansionManagerPayrollRub}>{formatRub(projection.operating.expansionManagerPayrollRub)}</dd></div> : null}
              <div><dt>Адм. резерв</dt><dd data-testid="scaling-expansion-admin-reserve" data-amount-rub={projection.operating.administrativeReserveRub ?? undefined}>{formatRub(projection.operating.administrativeReserveRub)}</dd></div>
              <div><dt>Спецодежда производства</dt><dd data-testid="scaling-expansion-uniforms" data-amount-rub={projection.operating.incrementalUniformRenewalRub ?? undefined}>{formatRub(projection.operating.incrementalUniformRenewalRub)}</dd></div>
              <div><dt>Медосмотры производства</dt><dd data-testid="scaling-expansion-medical" data-amount-rub={projection.operating.incrementalMedicalRub ?? undefined}>{formatRub(projection.operating.incrementalMedicalRub)}</dd></div>
              <div><dt>Логистика</dt><dd data-testid="scaling-logistics-opex" data-amount-rub={projection.operating.logisticsRub ?? undefined}>{formatRub(projection.operating.logisticsRub)}</dd></div>
              {projection.operating.expansionFixedMarketingRub !== null && projection.operating.expansionFixedMarketingRub !== 0 ? <div><dt>Доп. маркетинг</dt><dd data-testid="scaling-expansion-marketing" data-amount-rub={projection.operating.expansionFixedMarketingRub}>{formatRub(projection.operating.expansionFixedMarketingRub)}</dd></div> : null}
              <div className="is-total"><dt>Расходы расширения</dt><dd data-testid="scaling-expansion-opex" data-amount-rub={economics.expansion.opexRub ?? undefined}>{formatRub(economics.expansion.opexRub)}</dd></div>
            </dl>
            <small data-testid="scaling-network-operating-status">База не дублируется.</small>
          </section>
          <button type="button" className="terminal-secondary-action" onClick={onReturnToUnit}>Изменить базовый объект</button>
        </aside>
      </div>
    </section>
  );
}
