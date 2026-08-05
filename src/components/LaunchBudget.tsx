import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { capexData } from "../lib/capex-runtime";
import {
  calculateLaunchBudget,
  defaultLaunchBudgetState,
  launchModel,
  restoreLaunchBudgetState,
  type EquipmentScenarioId,
  type FurnitureProfileId,
  type LaunchBudgetState,
  type PremisesScenario,
  type SeatingProfileId,
} from "../lib/launch-budget";
import "./LaunchBudget.css";

const rubFormatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null) {
  return value === null ? "Не рассчитано" : rubFormatter.format(value);
}

function parseNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function Segmented({ label, value, options, onChange, dataName }: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string; hint?: string; ariaLabel?: string }>;
  onChange: (value: string) => void;
  dataName?: string;
}) {
  return (
    <div className="launch-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          data-option={option.value}
          data-control={dataName}
          className={String(value) === String(option.value) ? "is-selected" : ""}
          aria-pressed={String(value) === String(option.value)}
          aria-label={option.ariaLabel}
          onClick={() => onChange(String(option.value))}
        >
          <strong>{option.label}</strong>
          {option.hint ? <span>{option.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function NumberField({ id, label, value, onChange, suffix, hint, required = false }: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="launch-field" htmlFor={id}>
      <span>{label}{required ? <em aria-hidden="true"> *</em> : null}</span>
      <span className="launch-input-wrap">
        <input
          id={id}
          name={id}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={value ?? ""}
          placeholder="Не указано"
          aria-required={required}
          onChange={event => onChange(parseNumber(event.target.value))}
        />
        {suffix ? <b>{suffix}</b> : null}
      </span>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function CompactToggle({ checked, onChange, children, hint, id }: { checked: boolean; onChange: () => void; children: ReactNode; hint?: string; id: string }) {
  return (
    <button type="button" id={id} className={`launch-toggle${checked ? " is-on" : ""}`} role="switch" aria-checked={checked} onClick={onChange}>
      <span className="launch-toggle-track" aria-hidden="true"><i /></span>
      <span><strong>{children}</strong>{hint ? <small>{hint}</small> : null}</span>
    </button>
  );
}

function SummaryRow({ label, value, partial = false, muted = false }: { label: string; value: number | null; partial?: boolean; muted?: boolean }) {
  return (
    <div className={muted ? "is-muted" : ""}>
      <dt>{label}</dt>
      <dd>{value === null ? "Не рассчитано" : `${partial ? "от " : ""}${formatRub(value)}`}</dd>
    </div>
  );
}

function SectionHeading({ number, title, text }: { number: string; title: string; text?: string }) {
  return <header className="launch-card-heading"><span>{number}</span><div><h2>{title}</h2>{text ? <p>{text}</p> : null}</div></header>;
}

function PreparationCategoryRow({ category, enabled, onChange }: {
  category: { id: string; name: string; amount_rub: number; description: string };
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`launch-preparation-category${enabled ? " is-enabled" : " is-disabled"}`} data-preparation-id={category.id}>
      <button type="button" role="switch" aria-checked={enabled} onClick={onChange}>
        <span className="launch-toggle-track" aria-hidden="true"><i /></span>
        <span className="launch-preparation-category-copy">
          <strong>{category.name}</strong>
          <small>{category.description}</small>
        </span>
        <span className="launch-preparation-category-value">
          <b>{formatRub(category.amount_rub)}</b>
          <small>{enabled ? "Включено" : "Не включено"}</small>
        </span>
      </button>
    </div>
  );
}

export function LaunchBudgetPage() {
  const rawModel = capexData.investorStartModel;
  const defaults = useMemo(() => defaultLaunchBudgetState(), []);
  const [state, setState] = useState<LaunchBudgetState>(() => {
    try {
      const saved = window.localStorage.getItem(launchModel.form.local_storage_key);
      return saved ? restoreLaunchBudgetState(JSON.parse(saved)) : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(launchModel.form.local_storage_key, JSON.stringify(state));
    } catch {
      // Local persistence is optional; shared project data is never changed.
    }
  }, [state]);

  const result = useMemo(() => calculateLaunchBudget(state), [state]);
  const seatingProfile = rawModel.seating.profiles.find(item => item.id === state.seatingProfileId)!;
  const furnitureProfile = rawModel.furniture.profiles.find(item => item.id === state.furnitureProfileId)!;
  const equipmentProfile = rawModel.equipment.scenarios.find(item => item.id === state.equipmentScenarioId)!;
  const equipmentPartial = result.equipment.unpricedCount > 0 || result.incompleteRequiredModules.length > 0;
  const currentConfiguration = rawModel.point_configuration.summary_modules.filter(item => result.activeModuleIds.includes(item.module_id));
  const partialSummary = [
    ...(result.effectivePreparationRub === null ? ["подготовка помещения"] : []),
    ...(result.operatingReserveRub === null ? ["операционный запас"] : []),
    ...(result.equipment.unpricedCount > 0 ? ["часть оборудования"] : []),
    ...(result.incompleteRequiredModules.length > 0 ? ["часть обязательного оснащения"] : []),
  ];

  function update<K extends keyof LaunchBudgetState>(key: K, value: LaunchBudgetState[K]) {
    setState(current => ({ ...current, [key]: value }));
  }

  function togglePreparationCategory(categoryId: string) {
    setState(current => ({
      ...current,
      preparationEnabledCategoryIds: current.preparationEnabledCategoryIds.includes(categoryId)
        ? current.preparationEnabledCategoryIds.filter(id => id !== categoryId)
        : [...current.preparationEnabledCategoryIds, categoryId],
    }));
  }

  function reset() {
    if (!window.confirm("Сбросить все введённые значения этого расчёта?")) return;
    window.localStorage.removeItem(launchModel.form.local_storage_key);
    setState(defaultLaunchBudgetState());
  }

  return (
    <div className="launch-budget-page">
      <section className="launch-hero" aria-labelledby="launch-budget-title">
        <div className="section-inner launch-hero-inner">
          <div>
            <h1 id="launch-budget-title">{rawModel.public_presentation.page_title}</h1>
            <p className="launch-subtitle">{rawModel.public_presentation.subtitle}</p>
          </div>
          <aside>
            <strong>{rawModel.public_presentation.hero_summary_title}</strong>
            <p>{rawModel.public_presentation.hero_summary}</p>
          </aside>
        </div>
      </section>

      <section className="launch-workspace">
        <div className="section-inner launch-workspace-grid">
          <div className="launch-form-column">
            <section className="launch-card" aria-labelledby="launch-premises-title">
              <SectionHeading number="01" title="Помещение" text="Сравните два базовых сценария входа в объект." />
              <Segmented
                label="Сценарий помещения"
                value={state.premisesScenario}
                dataName="premises-scenario"
                options={[{ value: "purchase", label: "Покупка" }, { value: "rent", label: "Аренда" }]}
                onChange={value => update("premisesScenario", value as PremisesScenario)}
              />
              {state.premisesScenario === "purchase" ? (
                <NumberField id="purchase-price" label="Стоимость помещения" suffix="₽" value={state.purchasePriceRub} onChange={value => update("purchasePriceRub", value)} hint={rawModel.premises.scenarios.purchase.hint} required />
              ) : (
                <div className="launch-fields-grid">
                  <NumberField id="monthly-rent" label="Аренда в месяц" suffix="₽" value={state.monthlyRentRub} onChange={value => update("monthlyRentRub", value)} required />
                  <label className="launch-field" htmlFor="prepayment-months"><span>Предоплата</span><span className="launch-input-wrap"><select id="prepayment-months" value={state.prepaymentMonths} onChange={event => update("prepaymentMonths", Number(event.target.value))}>{rawModel.premises.scenarios.rent.prepayment_month_options.map(value => <option key={value} value={value}>{value} мес.</option>)}</select></span></label>
                  <label className="launch-field" htmlFor="security-deposit-months"><span>Обеспечительный платёж</span><span className="launch-input-wrap"><select id="security-deposit-months" value={state.securityDepositMonths} onChange={event => update("securityDepositMonths", Number(event.target.value))}>{rawModel.premises.scenarios.rent.security_deposit_month_options.map(value => <option key={value} value={value}>{value} мес.</option>)}</select></span></label>
                </div>
              )}
              <div className="launch-inline-result"><span>Вход в помещение</span><strong>{formatRub(result.premisesEntryRub)}</strong>{state.premisesScenario === "rent" ? <small>Включает предоплату и обеспечительный платёж.</small> : null}</div>
            </section>

            <section className="launch-card" aria-labelledby="launch-area-title">
              <SectionHeading number="02" title="Площадь и посадочные места" text="Параметры нужны только для предварительной вместимости и мебели." />
              <div className="launch-fields-grid launch-fields-three">
                <NumberField id="total-area" label="Общая площадь" suffix="м²" value={state.totalAreaM2} onChange={value => update("totalAreaM2", value)} />
                <NumberField id="kitchen-area" label="Кухня и производство" suffix="м²" value={state.kitchenAreaM2} onChange={value => update("kitchenAreaM2", value)} />
                <NumberField id="guest-area" label="Посадочный зал" suffix="м²" value={state.guestAreaM2} onChange={value => update("guestAreaM2", value)} />
              </div>
              {result.areaInvalid ? <p className="launch-error" role="alert">Площадь кухни и посадочного зала не может превышать общую площадь. Итоговый расчёт приостановлен.</p> : null}
              <div className="launch-inline-result"><span>Прочая площадь</span><strong>{result.otherAreaM2 === null ? "Не рассчитано" : `${numberFormatter.format(result.otherAreaM2)} м²`}</strong><small>Заказ и выдача, склады, санузлы, коридоры, помещения персонала и технические зоны.</small></div>
              <h3 className="launch-control-title">Плотность посадки</h3>
              <Segmented
                label="Плотность посадки"
                value={state.seatingProfileId}
                dataName="seating-profile"
                options={rawModel.seating.profiles.map(profile => ({ value: profile.id, label: profile.label, hint: `${String(profile.square_metres_per_seat).replace(".", ",")} м² на место`, ariaLabel: profile.aria_label }))}
                onChange={value => update("seatingProfileId", value as SeatingProfileId)}
              />
              <div className="launch-seat-result"><span>Предварительно</span><strong>{result.seatCount === null ? "Не рассчитано" : `${result.seatCount} мест`}</strong><p>{rawModel.seating.caveat}</p></div>
            </section>

            <section className="launch-card" aria-labelledby="launch-equipment-title">
              <SectionHeading number="03" title="Комплектация оборудования и мебель" text={rawModel.public_presentation.equipment_description} />
              <h3 className="launch-control-title">Мебель посадочного зала</h3>
              <Segmented
                label="Комплектация мебели"
                value={state.furnitureProfileId}
                dataName="furniture-profile"
                options={rawModel.furniture.profiles.map(profile => ({ value: profile.id, label: profile.label, hint: `${rubFormatter.format(profile.rub_per_seat)} / место` }))}
                onChange={value => update("furnitureProfileId", value as FurnitureProfileId)}
              />
              <div className="launch-research-line"><span>{rawModel.furniture.marker}</span><strong>{formatRub(result.furnitureRub)}</strong><p>{result.seatCount === null ? "Сначала укажите площадь посадочного зала." : `${result.seatCount} мест × ${formatRub(furnitureProfile.rub_per_seat)}`}</p></div>

              <div className="launch-divider" />
              <h3 className="launch-control-title">Стоимость текущей комплектации оборудования</h3>
              <Segmented
                label="Сценарий оборудования"
                value={state.equipmentScenarioId}
                dataName="equipment-scenario"
                options={rawModel.equipment.scenarios.map(scenario => ({ value: scenario.id, label: scenario.label }))}
                onChange={value => update("equipmentScenarioId", value as EquipmentScenarioId)}
              />
              <div className="launch-module-toggles">
                <CompactToggle id="bar-enabled" checked={state.barEnabled} onChange={() => update("barEnabled", !state.barEnabled)}>Бар и напитки</CompactToggle>
                <CompactToggle id="grow-enabled" checked={state.growEnabled} onChange={() => update("growEnabled", !state.growEnabled)}>Выращивание зелени</CompactToggle>
              </div>
              <div className="launch-equipment-summary" aria-live="polite">
                <div><span>{equipmentProfile.label}</span><strong>{equipmentPartial ? "от " : ""}{formatRub(result.equipment.total)}</strong></div>
                <dl><div><dt>Оценено позиций</dt><dd>{result.equipment.pricedCount}</dd></div><div><dt>Без цены</dt><dd>{result.equipment.unpricedCount}</dd></div><div><dt>Требуется КП</dt><dd>{result.equipment.quoteRequiredCount}</dd></div></dl>
                <p>В сумму включены только оценённые позиции выбранной комплектации оборудования.</p>
              </div>
              <p className="launch-double-count-note">{rawModel.public_presentation.equipment_double_count_note}</p>
            </section>

            <section className="launch-card" aria-labelledby="launch-preparation-title">
              <SectionHeading number="04" title={rawModel.preparation.title} text={rawModel.preparation.collapsed_hint} />
              <div className="launch-preparation-summary" aria-live="polite">
                <span>{rawModel.preparation.title}</span>
                <strong>{formatRub(result.effectivePreparationRub)}</strong>
                <small>{state.preparationMode === "manual" ? rawModel.preparation.manual_marker : rawModel.preparation.collapsed_hint}</small>
              </div>
              <button
                type="button"
                className="launch-preparation-accordion-button"
                aria-expanded={state.preparationAccordionOpen}
                aria-controls="launch-preparation-details"
                onClick={() => update("preparationAccordionOpen", !state.preparationAccordionOpen)}
              >
                <span>{rawModel.preparation.accordion_label}</span>
                <span aria-hidden="true">{state.preparationAccordionOpen ? "−" : "+"}</span>
              </button>
              {state.preparationAccordionOpen ? (
                <div className="launch-preparation-details" id="launch-preparation-details">
                  <div className="launch-preparation-categories">
                    {rawModel.preparation.categories.map(category => (
                      <PreparationCategoryRow
                        key={category.id}
                        category={category}
                        enabled={state.preparationEnabledCategoryIds.includes(category.id)}
                        onChange={() => togglePreparationCategory(category.id)}
                      />
                    ))}
                  </div>
                  {state.preparationMode === "manual" ? (
                    <div className="launch-preparation-manual">
                      <NumberField
                        id="preparation-manual-cost"
                        label={rawModel.preparation.manual_field_label.replace(", ₽", "")}
                        suffix="₽"
                        value={state.preparationManualRub}
                        onChange={value => update("preparationManualRub", value)}
                      />
                      <p>{rawModel.preparation.manual_marker}. Состав работ остаётся ориентиром и не изменяет введённую сумму.</p>
                      <button type="button" onClick={() => update("preparationMode", "breakdown")}>{rawModel.preparation.breakdown_action_label}</button>
                    </div>
                  ) : (
                    <button type="button" className="launch-preparation-mode-button" onClick={() => update("preparationMode", "manual")}>{rawModel.preparation.manual_action_label}</button>
                  )}
                  <p className="launch-preparation-area-note">{rawModel.preparation.area_note}</p>
                </div>
              ) : null}
            </section>

            <section className="launch-card" aria-labelledby="launch-reserve-title">
              <SectionHeading number="05" title="Запас на запуск" text="Значение уточняется после подготовки полного расчёта операционных расходов." />
              <NumberField id="monthly-opex" label="Ежемесячные операционные расходы без аренды" suffix="₽" value={state.monthlyOpexExcludingRentRub} onChange={value => update("monthlyOpexExcludingRentRub", value)} />
              <h3 className="launch-control-title">Операционный запас</h3>
              <Segmented label="Месяцы операционного запаса" value={state.operatingReserveMonths} dataName="reserve-months" options={rawModel.operating_reserve.month_options.map(value => ({ value, label: `${value} месяцев` }))} onChange={value => update("operatingReserveMonths", Number(value))} />
              <div className="launch-inline-result"><span>Операционный запас</span><strong>{formatRub(result.operatingReserveRub)}</strong>{state.premisesScenario === "rent" ? <small>Предоплаченная аренда не учитывается второй раз; обеспечительный платёж исключён.</small> : null}</div>
              <h3 className="launch-control-title">Резерв непредвиденных расходов</h3>
              <Segmented label="Процент резерва" value={state.contingencyPercent} dataName="contingency-percent" options={rawModel.contingency.percent_options.map(value => ({ value, label: `${value}%` }))} onChange={value => update("contingencyPercent", Number(value))} />
              <div className="launch-inline-result"><span>Резерв</span><strong>{formatRub(result.contingencyRub)}</strong>{result.contingencyPartial ? <small>Резерв рассчитан только по известным статьям.</small> : null}</div>
            </section>

            <button className="launch-reset" type="button" onClick={reset}>Сбросить расчёт</button>
          </div>

          <aside className="launch-total-card" aria-live="polite" data-testid="launch-total">
            <p className="launch-total-eyebrow">Предварительный расчёт</p>
            <h2>{rawModel.public_presentation.total_title}</h2>
            <strong className="launch-total-value">{result.financingRequirementRub === null ? "Не рассчитано" : `${result.partial ? "от " : ""}${formatRub(result.financingRequirementRub)}`}</strong>
            {result.partial && !result.areaInvalid && partialSummary.length ? <p className="launch-total-note">Требуют уточнения: {partialSummary.join(", ")}.</p> : null}
            {result.areaInvalid ? <p className="launch-total-blocked">Исправьте распределение площади, чтобы продолжить расчёт.</p> : null}
            <div className="launch-current-configuration">
              <h3>{rawModel.public_presentation.current_configuration_title}</h3>
              <strong>{rawModel.point_configuration.format_name}</strong>
              <ul>{currentConfiguration.map(item => <li key={item.module_id}><span aria-hidden="true">✓</span>{item.label}</li>)}</ul>
            </div>
            <dl className="launch-total-breakdown">
              <SummaryRow label="Вход в помещение" value={result.premisesEntryRub} />
              <SummaryRow label="Стоимость текущей комплектации оборудования" value={result.equipment.total} partial={equipmentPartial} />
              <SummaryRow label="Мебель посадочного зала" value={result.furnitureRub} />
              <SummaryRow label="Подготовка помещения и монтаж" value={result.effectivePreparationRub} />
              <SummaryRow label="Операционный запас" value={result.operatingReserveRub} />
              <SummaryRow label="Резерв" value={result.contingencyRub} />
            </dl>
            <div className="launch-assets"><span>Стоимость создаваемых активов</span><strong>{result.createdAssetsPartial ? "от " : ""}{formatRub(result.createdAssetsRub)}</strong><small>Подготовка помещения не включена до определения бухгалтерской классификации.</small></div>
            {state.premisesScenario === "rent" ? <div className="launch-tied-funds"><span>Связанные или условно возвратные средства</span><strong>{formatRub(result.tiedFundsRub)}</strong><small>Обеспечительный платёж.</small></div> : null}
            <div className="launch-completeness">
              <h3>Полнота расчёта</h3>
              <ul>
                <li><span>Оценено оборудование</span><strong>{result.equipment.pricedCount} из {result.equipment.coverageCount}</strong></li>
                <li><span>Не имеют цены</span><strong>{result.equipment.unpricedCount}</strong></li>
                <li><span>Требуют КП</span><strong>{result.equipment.quoteRequiredCount}</strong></li>
                <li><span>Подготовка помещения</span><strong>{result.effectivePreparationRub === null ? "не рассчитана" : "рассчитана"}</strong></li>
                <li><span>Операционный запас</span><strong>{result.operatingReserveRub === null ? "не рассчитан" : "рассчитан"}</strong></li>
                <li><span>Обязательные части объекта</span><strong>{result.incompleteRequiredModules.length ? "не сформированы полностью" : "сформированы"}</strong></li>
              </ul>
              {result.incompleteRequiredModules.length ? <p>{result.incompleteRequiredModules.map(module => module.name).join(" · ")}</p> : null}
            </div>
            <p className="launch-warning">{rawModel.warning}</p>
            <p className="launch-legal">{rawModel.public_presentation.legal_disclaimer}</p>
          </aside>
        </div>
      </section>

      <section className="launch-lower-section">
        <div className="section-inner launch-lower-grid">
          <article className="launch-boundaries">
            <p className="launch-section-kicker">Уточнение бюджета</p>
            <h2>{rawModel.public_presentation.next_steps_title}</h2>
            <p>{rawModel.public_presentation.next_steps_intro}</p>
            <ul>{rawModel.missing_categories.map(item => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className="launch-basis">
            <p className="launch-section-kicker">Состав расчёта</p>
            <h2>{rawModel.public_presentation.calculation_basis_title}</h2>
            <ul>{rawModel.public_presentation.calculation_factors.map(item => <li key={item}>{item}</li>)}</ul>
            <p>{rawModel.public_presentation.calculation_basis_note}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
