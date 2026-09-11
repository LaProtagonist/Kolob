import { useMemo } from "react";
import type { ReactNode } from "react";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { InvestorJourneyNavigation } from "./InvestorJourneyNavigation";
import { capexData } from "../lib/capex-runtime";
import { launchFinancials } from "../lib/launch-financials";
import {
  calculateLaunchBudget,
  defaultLaunchBudgetState,
  launchModel,
  type EquipmentScenarioId,
  type FurnitureProfileId,
  type LaunchBudgetState,
  type OperatingExpenseMode,
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
    <div className={`launch-segmented${options.length === 3 ? " is-three-options" : ""}`} role="group" aria-label={label}>
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

function NumberField({ id, label, value, onChange, suffix, hint, required = false, integer = false }: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  hint?: string;
  required?: boolean;
  integer?: boolean;
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
          step={integer ? "1" : "any"}
          inputMode={integer ? "numeric" : "decimal"}
          value={value ?? ""}
          placeholder="Не указано"
          aria-required={required}
          onChange={event => {
            const parsed = parseNumber(event.target.value);
            onChange(parsed === null || !integer ? parsed : Math.floor(parsed));
          }}
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

function OperatingExpenseRow({ category }: {
  category: { id: string; name: string; amount_rub: number; description: string };
}) {
  return (
    <div className="launch-opex-category" data-opex-id={category.id}>
      <div className="launch-opex-category-inner">
        <span className="launch-opex-category-copy">
          <strong>{category.name}</strong>
          <small>{category.description}</small>
        </span>
        <span className="launch-opex-category-value">
          <b>{formatRub(category.amount_rub)}</b>
          <small>в месяц</small>
        </span>
      </div>
    </div>
  );
}

export function LaunchBudgetPage() {
  const rawModel = capexData.investorStartModel;
  const { configuration, setLaunchBudget, setScenarioId } = useInvestorConfiguration();
  const state = configuration.launchBudget;

  const result = useMemo(() => calculateLaunchBudget(state, undefined, launchFinancials), [state]);
  const reserveCategories = useMemo(() => [
    { id: "FM-PERSONNEL", name: "Расходы на персонал", amount_rub: launchFinancials.monthlyLaborRub, description: "Фактическая стоимость команды с начислениями и резервом на замещение." },
    { id: "FM-FIXED-OPEX", name: "Постоянные операционные расходы", amount_rub: launchFinancials.monthlyFixedOpexRub, description: "Коммунальные услуги, обслуживание оборудования, бухгалтерия, санитария, охрана и прочие постоянные расходы без аренды." },
    { id: "FM-SCENARIO-OPEX", name: "Маркетинг и хозяйственные расходники", amount_rub: launchFinancials.monthlyScenarioOpexRub, description: "Регулярный маркетинг и эксплуатационные расходники на уровне зрелого реалистичного месяца." },
  ], []);
  const seatingProfile = rawModel.seating.profiles.find(item => item.id === state.seatingProfileId)!;
  const furnitureProfile = rawModel.furniture.profiles.find(item => item.id === state.furnitureProfileId)!;
  const equipmentProfile = rawModel.equipment.scenarios.find(item => item.id === state.equipmentScenarioId)!;
  const equipmentPartial = result.equipment.unpricedCount > 0 || result.incompleteRequiredModules.length > 0;
  const currentConfiguration = [
    { id: "production", label: "Производственный центр", primary: true },
    { id: "retail", label: "Торговая точка с посадочным залом", primary: false },
    ...(state.barEnabled ? [{ id: "bar", label: "Бар и напитки", primary: false }] : []),
    ...(state.growEnabled ? [{ id: "grow", label: "Выращивание зелени", primary: false }] : []),
  ];
  const partialSummary = [
    ...(result.effectivePreparationRub === null ? ["подготовка помещения"] : []),
    ...(result.operatingReserveRub === null ? ["операционный запас"] : []),
    ...(result.equipment.unpricedCount > 0 ? ["часть оборудования"] : []),
  ];

  function update<K extends keyof LaunchBudgetState>(key: K, value: LaunchBudgetState[K]) {
    setLaunchBudget(current => ({ ...current, [key]: value }));
  }

  function togglePreparationCategory(categoryId: string) {
    setLaunchBudget(current => ({
      ...current,
      preparationEnabledCategoryIds: current.preparationEnabledCategoryIds.includes(categoryId)
        ? current.preparationEnabledCategoryIds.filter(id => id !== categoryId)
        : [...current.preparationEnabledCategoryIds, categoryId],
    }));
  }

  function reset() {
    if (!window.confirm("Сбросить все введённые значения этого расчёта?")) return;
    setLaunchBudget(defaultLaunchBudgetState());
  }

  return (
    <div className="launch-budget-page">
      <section className="launch-hero" aria-labelledby="launch-budget-title">
        <div className="section-inner launch-hero-inner">
          <div>
            <h1 id="launch-budget-title">{rawModel.public_presentation.page_title}</h1>
            <p className="launch-subtitle">Совмещённый объект «Колобочной» объединяет производственный центр и торговую точку с посадочным залом.</p>
          </div>
          <aside>
            <strong>Возможности расчёта</strong>
            <p>Расчёт позволяет сравнить сценарии запуска при аренде или покупке помещения и увидеть, как площадь, состав оснащения, подготовка объекта и запас на запуск влияют на итоговую стоимость. Базовые параметры уже заданы и могут быть изменены под конкретный вариант.</p>
          </aside>
        </div>
      </section>

      <section className="launch-workspace">
        <div className="section-inner launch-workspace-grid">
          <div className="launch-form-column">
            <section className="launch-card" aria-labelledby="launch-premises-title">
              <SectionHeading number="01" title="Помещение" text="Расчёт предусматривает два сценария: приобретение помещения в собственность или аренду. Параметры каждого сценария можно изменить под рассматриваемый объект." />
              <Segmented
                label="Сценарий помещения"
                value={state.premisesScenario}
                dataName="premises-scenario"
                options={[{ value: "purchase", label: "Покупка" }, { value: "rent", label: "Аренда" }]}
                onChange={value => update("premisesScenario", value as PremisesScenario)}
              />
              {state.premisesScenario === "purchase" ? (
                <NumberField id="purchase-price" label="Стоимость покупки помещения" suffix="₽" value={state.purchasePriceRub} onChange={value => update("purchasePriceRub", value)} hint="Предварительный ориентир для помещения площадью около 200 м²." required />
              ) : (
                <div className="launch-fields-grid">
                  <NumberField id="monthly-rent" label="Ежемесячная арендная плата" suffix="₽" value={state.monthlyRentRub} onChange={value => update("monthlyRentRub", value)} required />
                  <label className="launch-field" htmlFor="prepayment-months"><span>Предоплата аренды</span><span className="launch-input-wrap launch-select-wrap"><select id="prepayment-months" value={state.prepaymentMonths} onChange={event => update("prepaymentMonths", Number(event.target.value))}>{rawModel.premises.scenarios.rent.prepayment_month_options.map(value => <option key={value} value={value}>{value} мес.</option>)}</select></span></label>
                  <label className="launch-field" htmlFor="security-deposit-months"><span>Обеспечительный платёж</span><span className="launch-input-wrap launch-select-wrap"><select id="security-deposit-months" value={state.securityDepositMonths} onChange={event => update("securityDepositMonths", Number(event.target.value))}>{rawModel.premises.scenarios.rent.security_deposit_month_options.map(value => <option key={value} value={value}>{value} мес.</option>)}</select></span></label>
                </div>
              )}
              <div className="launch-inline-result"><span>{state.premisesScenario === "purchase" ? "Стоимость покупки помещения" : "Первоначальные платежи по аренде"}</span><strong>{formatRub(result.premisesEntryRub)}</strong>{state.premisesScenario === "rent" ? <small>Предоплата аренды и обеспечительный платёж.</small> : null}</div>
            </section>

            <section className="launch-card" aria-labelledby="launch-area-title">
              <SectionHeading number="02" title="Площадь и посадочные места" text="Распределение площади определяет предварительную вместимость зала и стоимость его оснащения." />
              <div className="launch-fields-grid launch-fields-three">
                <NumberField id="total-area" label="Общая площадь" suffix="м²" value={state.totalAreaM2} onChange={value => update("totalAreaM2", value)} />
                <NumberField id="kitchen-area" label="Кухня и заготовочное производство" suffix="м²" value={state.kitchenAreaM2} onChange={value => update("kitchenAreaM2", value)} />
                <NumberField id="guest-area" label="Чистая площадь посадочного зала" suffix="м²" value={state.guestAreaM2} onChange={value => update("guestAreaM2", value)} />
              </div>
              {result.areaInvalid ? <p className="launch-error" role="alert">Площадь кухни и посадочного зала не может превышать общую площадь. Итоговый расчёт приостановлен.</p> : null}
              <div className="launch-inline-result"><span>Прочая площадь</span><strong>{result.otherAreaM2 === null ? "Не рассчитано" : `${numberFormatter.format(result.otherAreaM2)} м²`}</strong><small>Зоны заказа и выдачи, склады, санузлы, проходы, служебные и технические помещения.</small></div>
              <h3 className="launch-control-title">Плотность посадки</h3>
              <Segmented
                label="Плотность посадки"
                value={state.seatingProfileId}
                dataName="seating-profile"
                options={rawModel.seating.profiles.map(profile => ({ value: profile.id, label: profile.label, hint: `${String(profile.square_metres_per_seat).replace(".", ",")} м² на место`, ariaLabel: profile.aria_label }))}
                onChange={value => update("seatingProfileId", value as SeatingProfileId)}
              />
              <div className="launch-seat-result"><span>Предварительная вместимость</span><strong>{result.seatCount === null ? "Не рассчитано" : `${result.seatCount} мест`}</strong><p>Окончательная вместимость определяется после разработки планировки с учётом проходов, эвакуационных требований и доступной среды.</p></div>
            </section>

            <section className="launch-card" aria-labelledby="launch-equipment-title">
              <SectionHeading number="03" title="Оснащение и мебель" text="Выберите комплектацию оборудования и уровень мебели для посадочного зала." />
              <h3 className="launch-control-title">Мебель посадочного зала</h3>
              <Segmented
                label="Комплектация мебели"
                value={state.furnitureProfileId}
                dataName="furniture-profile"
                options={rawModel.furniture.profiles.map(profile => ({ value: profile.id, label: profile.id === "functional" ? "Функциональная" : profile.id === "balanced" ? "Сбалансированная" : "Комфорт", hint: `${rubFormatter.format(profile.rub_per_seat)} / место` }))}
                onChange={value => update("furnitureProfileId", value as FurnitureProfileId)}
              />
              <div className="launch-research-line"><span>Предварительная стоимость мебели</span><strong>{formatRub(result.furnitureRub)}</strong><p>{result.seatCount === null ? "Сначала укажите площадь посадочного зала." : `${result.seatCount} мест × ${formatRub(furnitureProfile.rub_per_seat)}`}</p></div>

              <div className="launch-divider" />
              <h3 className="launch-control-title">Стоимость текущей комплектации оборудования</h3>
              <Segmented
                label="Сценарий оборудования"
                value={state.equipmentScenarioId}
                dataName="equipment-scenario"
                options={rawModel.equipment.scenarios.map(scenario => ({ value: scenario.id, label: scenario.id === "MINIMUM" ? "Минимальная" : scenario.id === "BASE" ? "Базовая" : "Рост" }))}
                onChange={value => update("equipmentScenarioId", value as EquipmentScenarioId)}
              />
              <div className="launch-module-toggles">
                <CompactToggle id="bar-enabled" checked={state.barEnabled} onChange={() => update("barEnabled", !state.barEnabled)}>Бар и напитки</CompactToggle>
                <CompactToggle id="grow-enabled" checked={state.growEnabled} onChange={() => update("growEnabled", !state.growEnabled)}>Выращивание зелени</CompactToggle>
              </div>
              <div className="launch-fixed-module" data-testid="production-center-included">
                <span className="launch-fixed-module-check" aria-hidden="true">✓</span>
                <span className="launch-fixed-module-copy"><strong>Производственный центр</strong><small>Заготовочное производство входит в базовую комплектацию объекта.</small></span>
                <span className="launch-fixed-module-status">Включено</span>
              </div>
              <div className="launch-equipment-summary" aria-live="polite">
                <div><span>{equipmentProfile.id === "MINIMUM" ? "Минимальная" : equipmentProfile.id === "BASE" ? "Базовая" : "Рост"}</span><strong>{equipmentPartial ? "от " : ""}{formatRub(result.equipment.total)}</strong></div>
                <dl>
                  <div><dt>В расчёт включено</dt><dd>{result.equipment.pricedCount} <span>позиций оборудования</span></dd></div>
                  <div><dt>Требуют подтверждения цены</dt><dd>{result.equipment.quoteRequiredCount} <span>из включённых в расчёт позиций</span></dd></div>
                </dl>
                <p>Текущая стоимость рассчитана по доступным рыночным ориентирам. Для {result.equipment.quoteRequiredCount} позиций требуется подтверждение актуальными коммерческими предложениями поставщиков.</p>
              </div>
            </section>

            <section className="launch-card" aria-labelledby="launch-preparation-title">
              <SectionHeading number="04" title={rawModel.preparation.title} text="Предварительная оценка адаптации помещения около 200 м² в Санкт-Петербурге." />
              <div className="launch-preparation-summary" data-testid="preparation-summary" aria-live="polite">
                <span>Базовая оценка</span>
                <strong>{formatRub(result.effectivePreparationRub)}</strong>
                <small>Базовый состав рассчитан для готового ресторанного помещения; работы можно включить при необходимости.</small>
              </div>
              <button
                type="button"
                className="launch-preparation-accordion-button"
                aria-expanded={state.preparationAccordionOpen}
                aria-controls="launch-preparation-details"
                onClick={() => update("preparationAccordionOpen", !state.preparationAccordionOpen)}
              >
                <span>Состав работ</span>
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
              <SectionHeading number="05" title={rawModel.operating_reserve.section_title} text={rawModel.operating_reserve.section_description} />
              <h3 className="launch-control-title">{rawModel.operating_reserve.mode_selector_title}</h3>
              <Segmented
                label={rawModel.operating_reserve.mode_selector_title}
                value={state.operatingExpenseMode}
                dataName="operating-expense-mode"
                options={rawModel.operating_reserve.modes.map(mode => ({ value: mode.id, label: mode.title, hint: mode.description }))}
                onChange={value => update("operatingExpenseMode", value as OperatingExpenseMode)}
              />
              {state.operatingExpenseMode === "custom" ? (
                <div className="launch-opex-custom">
                  <NumberField
                    id="custom-monthly-opex"
                    label={rawModel.operating_reserve.custom_field_label}
                    suffix="₽"
                    value={state.customMonthlyOpexRub}
                    onChange={value => update("customMonthlyOpexRub", value)}
                    hint={rawModel.operating_reserve.custom_field_hint}
                    integer
                  />
                </div>
              ) : null}
              <div className="launch-preparation-summary launch-opex-summary" data-testid="operating-reserve-summary" data-reserve-source={result.operatingReserveSource} aria-live="polite">
                <span>{rawModel.operating_reserve.title}</span>
                <strong>{formatRub(result.operatingReserveRub)}</strong>
                {result.monthlyOperatingExpensesRub === null ? null : <small>{state.operatingReserveMonths} {state.operatingReserveMonths === 3 ? "месяца" : "месяцев"} × {formatRub(result.monthlyOperatingExpensesRub)} в месяц</small>}
              </div>
              {state.operatingExpenseMode === "baseline" ? (
                <>
                  <button
                    type="button"
                    className="launch-preparation-accordion-button"
                    data-opex-accordion
                    aria-expanded={state.operatingReserveAccordionOpen}
                    aria-controls="launch-operating-expense-details"
                    onClick={() => update("operatingReserveAccordionOpen", !state.operatingReserveAccordionOpen)}
                  >
                    <span>{rawModel.operating_reserve.accordion_label}</span>
                    <span aria-hidden="true">{state.operatingReserveAccordionOpen ? "−" : "+"}</span>
                  </button>
                  {state.operatingReserveAccordionOpen ? (
                    <div className="launch-preparation-details" id="launch-operating-expense-details">
                      <div className="launch-opex-categories" data-testid="operating-reserve-basis">
                        {reserveCategories.map(category => <OperatingExpenseRow key={category.id} category={category} />)}
                      </div>
                      <div className="launch-inline-result launch-opex-monthly-total">
                        <span>{rawModel.operating_reserve.monthly_total_label}</span>
                        <strong>{formatRub(result.monthlyOperatingExpensesRub)}</strong>
                      </div>
                      <p className="launch-preparation-area-note">Аренда за первые 12 месяцев уже входит в первоначальные платежи по аренде и в запас повторно не включается. Основа расчёта — финансовая модель объекта.</p>
                    </div>
                  ) : null}
                </>
              ) : null}
              <h3 className="launch-control-title">Период операционного запаса</h3>
              <Segmented label="Месяцы операционного запаса" value={state.operatingReserveMonths} dataName="reserve-months" options={rawModel.operating_reserve.month_options.map(value => ({ value, label: value === 3 ? "3 месяца" : `${value} месяцев` }))} onChange={value => update("operatingReserveMonths", Number(value))} />
              <h3 className="launch-control-title">{rawModel.contingency.title}</h3>
              <p className="launch-control-description">{rawModel.contingency.description}</p>
              <Segmented label="Процент резерва" value={state.contingencyPercent} dataName="contingency-percent" options={rawModel.contingency.percent_options.map(value => ({ value, label: `${value}%` }))} onChange={value => update("contingencyPercent", Number(value))} />
              <div className="launch-inline-result"><span>{rawModel.contingency.title}</span><strong>{formatRub(result.contingencyRub)}</strong><small>{rawModel.contingency.hint}</small></div>
            </section>

            <button className="launch-reset" type="button" onClick={reset}>Сбросить расчёт</button>
          </div>

          <aside className="launch-sticky-column">
          <div className="launch-total-card" aria-live="polite" data-testid="launch-total">
            <p className="launch-total-eyebrow">Предварительный расчёт</p>
            <h2>{rawModel.public_presentation.total_title}</h2>
            <strong className="launch-total-value launch-budget-total-value">
              {result.financingRequirementRub === null ? "Не рассчитано" : (
                <span className="launch-total-value-line">
                  {result.partial ? <span className="launch-total-prefix">от</span> : null}
                  <span>{formatRub(result.financingRequirementRub)}</span>
                </span>
              )}
            </strong>
            {result.partial && !result.areaInvalid && partialSummary.length ? <p className="launch-total-note">Требуют уточнения: {partialSummary.join(", ")}.</p> : null}
            {result.areaInvalid ? <p className="launch-total-blocked">Исправьте распределение площади, чтобы продолжить расчёт.</p> : null}
            <div className="launch-current-configuration">
              <strong>{rawModel.point_configuration.format_name}</strong>
              <p>Базовый формат для запуска первой точки и дальнейшего масштабирования сети.</p>
              <ul>{currentConfiguration.map(item => <li key={item.id} className={item.primary ? "is-primary" : ""}><span aria-hidden="true">✓</span>{item.label}</li>)}</ul>
            </div>
            <dl className="launch-total-breakdown">
              <SummaryRow label={state.premisesScenario === "purchase" ? "Стоимость покупки помещения" : "Первоначальные платежи по аренде"} value={result.premisesEntryRub} />
              <SummaryRow label="Стоимость текущей комплектации оборудования" value={result.equipment.total} partial={equipmentPartial} />
              <SummaryRow label="Мебель посадочного зала" value={result.furnitureRub} />
              <SummaryRow label="Подготовка помещения и монтаж" value={result.effectivePreparationRub} />
              <SummaryRow label="Маркетинг запуска" value={result.launchMarketingRub} />
              <SummaryRow label="Прочие стартовые статьи" value={result.launchItemsRub - result.launchMarketingRub} />
              <SummaryRow label="Операционный запас" value={result.operatingReserveRub} />
              <SummaryRow label="Резерв" value={result.contingencyRub} />
            </dl>
            <div className="launch-assets"><span>Стоимость создаваемых активов</span><strong>{result.createdAssetsPartial ? "от " : ""}{formatRub(result.createdAssetsRub)}</strong><small>Подготовка помещения не включена до определения бухгалтерской классификации.</small></div>
            {state.premisesScenario === "rent" ? <div className="launch-tied-funds"><span>Связанные или условно возвратные средства</span><strong>{formatRub(result.tiedFundsRub)}</strong><small>Обеспечительный платёж.</small></div> : null}
            <div className="launch-completeness">
              <h3>Полнота расчёта</h3>
              <ul>
                <li><span>Оборудование оценено</span><strong>{result.equipment.pricedCount} из {result.equipment.coverageCount}</strong></li>
                {result.equipment.unpricedCount > 0 ? <li><span>Не имеют цены</span><strong>{result.equipment.unpricedCount}</strong></li> : null}
                <li><span>Требуют КП</span><strong>{result.equipment.quoteRequiredCount}</strong></li>
                <li><span>Подготовка помещения</span><strong>{result.effectivePreparationRub === null ? "не рассчитана" : "рассчитана"}</strong></li>
                <li><span>Операционный запас</span><strong>{result.operatingReserveRub === null ? "не рассчитан" : "рассчитан"}</strong></li>
              </ul>
            </div>
            <p className="launch-warning">{rawModel.warning}</p>
            <p className="launch-legal">{rawModel.public_presentation.legal_disclaimer}</p>
          </div>
          <InvestorJourneyNavigation actions={[
            { href: "/control/revenue", label: "← Расчёт доходов", tone: "secondary", testId: "launch-budget-to-revenue" },
            {
              href: "/control/economics",
              label: "Экономика объекта →",
              tone: "primary",
              testId: "launch-budget-to-economics",
              onNavigate: () => setScenarioId("realistic"),
            },
          ]} />
          </aside>
        </div>
      </section>

      <section className="launch-lower-section">
        <div className="section-inner launch-lower-grid">
          <article className="launch-boundaries">
            <p className="launch-section-kicker">Уточнение бюджета</p>
            <h2>Следующие этапы расчёта</h2>
            <p>После выбора конкретного помещения расчёт уточняется на основании технического обследования, планировки и коммерческих предложений поставщиков.</p>
            <ul>{["Инженерное обследование помещения", "Детализация планировки и технологических решений", "Подтверждение стоимости подготовки помещения", "Коммерческие предложения по оборудованию и монтажу", "Расчёт операционных расходов и финансовой модели", "Формирование окончательного инвестиционного бюджета"].map(item => <li key={item}>{item}</li>)}</ul>
          </article>
          <article className="launch-basis">
            <p className="launch-section-kicker">Состав расчёта</p>
            <h2>Принцип расчёта</h2>
            <p>Расчёт показывает ориентировочную стоимость запуска выбранной конфигурации объекта. Сумма формируется из стоимости помещения, оборудования, мебели, подготовки объекта, операционного запаса и резерва.</p>
            <p>Если часть данных требует уточнения, она отображается отдельно и не уменьшает итоговую оценку.</p>
            <p>Связанные платежи по аренде учитываются отдельно от безвозвратных расходов.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
