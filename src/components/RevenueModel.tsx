import { useEffect, useMemo, useState } from "react";
import {
  calculateAverageCheck,
  calculateAverageFoodPrice,
  calculateRevenueModel,
  calculateWeightedKolobokPrice,
  defaultRevenueModelState,
  normalizeRevenueModelState,
  revenueModel,
  type RevenueModelState,
  type TrafficMode,
  type TrafficScenario,
} from "../lib/revenue-model";
import "./LaunchBudget.css";
import "./RevenueModel.css";

const rub = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const publicCopy = {
  summaryWarning: "Расчёт показывает потенциальный объём продаж при выбранных параметрах.",
  maximumHourLabel: "Расчётный максимум",
  maximumLineLoadLabel: "Нагрузка в расчётный максимум",
  capacityBandLabel: "Расчётная рабочая мощность линии колобков",
  trafficScenarioNote: "Сценарии показывают потенциальную загрузку объекта после выхода на рабочий режим. Динамика первых месяцев и сезонность учитываются в финансовой модели.",
} as const;

function formatRub(value: number | null) {
  return value === null ? revenueModel.public_presentation.not_calculated_label : `${rub.format(Math.round(value))} ₽`;
}

function formatCount(value: number | null, suffix = "") {
  if (value === null) return revenueModel.public_presentation.not_calculated_label;
  return `${decimal.format(value)}${suffix ? ` ${suffix}` : ""}`;
}

function plural(value: number, one: string, few: string, many: string) {
  const absolute = Math.abs(Math.round(value));
  const lastTwo = absolute % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = absolute % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatApprox(value: number | null, forms: [string, string, string]) {
  if (value === null) return revenueModel.public_presentation.not_calculated_label;
  return `≈${decimal.format(value)} ${plural(value, ...forms)}`;
}

function publicCapacityCopy(value: string) {
  return value.replaceAll("Комплектация", "Сервировка").replaceAll("комплектации", "сервировки");
}

function publicCapacityLabel(value: string) {
  if (value === "Комплектация") return "Сервировка";
  if (value === "Манчес") return "Манчесы";
  return value;
}

function SectionHeading({ id, number, title, text }: { id: string; number: string; title: string; text: string }) {
  return <div className="launch-card-heading"><span>{number}</span><div><h2 id={id}>{title}</h2><p>{text}</p></div></div>;
}

function Segmented({ label, value, options, onChange, dataName }: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string; hint?: string }>;
  onChange: (value: string | number) => void;
  dataName: string;
}) {
  return (
    <div className="launch-segmented revenue-segmented" role="group" aria-label={label} data-control={dataName}>
      {options.map(option => <button key={String(option.value)} type="button" className={value === option.value ? "is-selected" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)}><strong>{option.label}</strong>{option.hint ? <span>{option.hint}</span> : null}</button>)}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export function RevenueModelPage() {
  const model = revenueModel;
  const defaults = useMemo(() => defaultRevenueModelState(), []);
  const [state, setState] = useState<RevenueModelState>(() => {
    try {
      const stored = window.localStorage.getItem(model.form.local_storage_key);
      return stored ? normalizeRevenueModelState(JSON.parse(stored)) : defaults;
    } catch {
      return defaults;
    }
  });
  const [checkBreakdownOpen, setCheckBreakdownOpen] = useState(false);
  const [foodBreakdownOpen, setFoodBreakdownOpen] = useState(false);
  const [capacityOpen, setCapacityOpen] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(model.form.local_storage_key, JSON.stringify(state)); }
    catch { /* Persistence is optional and never changes the structured model. */ }
  }, [model.form.local_storage_key, state]);

  const result = useMemo(() => calculateRevenueModel(state), [state]);
  const averageCheck = calculateAverageCheck();
  const averageFood = calculateAverageFoodPrice();
  const weightedKolobok = calculateWeightedKolobokPrice();
  const customInvalid = state.trafficMode === "custom" && state.customChecksPerDay !== null && state.customChecksPerDay <= 0;

  function update<K extends keyof RevenueModelState>(key: K, value: RevenueModelState[K]) {
    setState(current => ({ ...current, [key]: value }));
  }

  function reset() {
    window.localStorage.removeItem(model.form.local_storage_key);
    setState(defaultRevenueModelState());
    setCheckBreakdownOpen(false);
    setFoodBreakdownOpen(false);
    setCapacityOpen(false);
  }

  return (
    <div className="launch-budget-page revenue-model-page">
      <section className="launch-hero revenue-hero" aria-labelledby="revenue-model-title">
        <div className="section-inner launch-hero-inner">
          <div>
            <h1 id="revenue-model-title">{model.public_presentation.page_title}</h1>
            <p className="launch-subtitle">{model.public_presentation.subtitle}</p>
          </div>
          <aside>
            <strong>{model.public_presentation.capabilities_title}</strong>
            <p>{model.public_presentation.capabilities_text}</p>
          </aside>
        </div>
      </section>

      <section className="launch-workspace">
        <div className="section-inner launch-workspace-grid">
          <div className="launch-form-column">
            <section className="launch-card" aria-labelledby="revenue-traffic-title">
              <SectionHeading id="revenue-traffic-title" number="01" title={model.public_presentation.traffic_title} text={model.public_presentation.traffic_description} />
              <Segmented label="Режим потока заказов" value={state.trafficMode} dataName="traffic-mode" options={[
                { value: "scenario", label: model.public_presentation.traffic_mode_labels.scenario },
                { value: "custom", label: model.public_presentation.traffic_mode_labels.custom },
              ]} onChange={value => update("trafficMode", value as TrafficMode)} />
              {state.trafficMode === "scenario" ? (
                <div className="revenue-scenario-control">
                  <Segmented label="Сценарий потока" value={state.trafficScenario} dataName="traffic-scenario" options={model.traffic.scenarios.map(item => ({ value: item.id, label: item.name, hint: `${item.checks_per_day} чеков в день` }))} onChange={value => update("trafficScenario", value as TrafficScenario)} />
                </div>
              ) : (
                <label className="launch-field revenue-custom-field" htmlFor="custom-checks-per-day">
                  <span>{model.public_presentation.custom_checks_label}</span>
                  <span className="launch-input-wrap"><input id="custom-checks-per-day" inputMode="numeric" type="number" min="1" step="1" value={state.customChecksPerDay ?? ""} onChange={event => update("customChecksPerDay", event.target.value === "" ? null : Number(event.target.value))} /></span>
                  {customInvalid ? <small className="revenue-field-error" role="alert">Укажите целое положительное значение.</small> : null}
                </label>
              )}
              <p className="revenue-scenario-note" data-testid="revenue-scenario-note">{publicCopy.trafficScenarioNote}</p>
            </section>

            <section className="launch-card" aria-labelledby="revenue-check-title">
              <SectionHeading id="revenue-check-title" number="02" title={model.public_presentation.average_check_title} text={model.public_presentation.average_check_description} />
              <div className="launch-preparation-summary revenue-number-card" data-testid="average-check">
                <span>{model.public_presentation.average_check_title}</span>
                <strong>≈ {rub.format(Math.round(averageCheck))} ₽</strong>
                <small>{decimal.format(model.product_model.food_portions_per_check)} × {formatRub(averageFood)} + {decimal.format(model.product_model.drinks.per_check)} × {formatRub(model.product_model.drinks.average_price_rub)}</small>
              </div>
              <button type="button" className="launch-preparation-accordion-button" aria-expanded={checkBreakdownOpen} aria-controls="revenue-check-details" onClick={() => setCheckBreakdownOpen(open => !open)}><span>{model.public_presentation.average_check_breakdown_label}</span><span aria-hidden="true">{checkBreakdownOpen ? "−" : "+"}</span></button>
              {checkBreakdownOpen ? (
                <div className="launch-preparation-details revenue-breakdown" id="revenue-check-details">
                  <dl className="revenue-detail-list">
                    <SummaryMetric label="Порций еды на чек" value={decimal.format(model.product_model.food_portions_per_check)} />
                    <SummaryMetric label="Средняя цена порции еды" value={formatRub(averageFood)} />
                    <SummaryMetric label="Напитков на чек" value={decimal.format(model.product_model.drinks.per_check)} />
                    <SummaryMetric label="Средняя цена напитка" value={formatRub(model.product_model.drinks.average_price_rub)} />
                  </dl>
                  <button type="button" className="revenue-inner-accordion" aria-expanded={foodBreakdownOpen} aria-controls="revenue-food-details" onClick={() => setFoodBreakdownOpen(open => !open)}>{model.public_presentation.food_price_breakdown_label}<span aria-hidden="true">{foodBreakdownOpen ? "−" : "+"}</span></button>
                  {foodBreakdownOpen ? (
                    <div id="revenue-food-details" className="revenue-food-details">
                      <div className="revenue-food-mix"><div><strong>Колобки — 80%</strong><span>Средняя цена порции: ≈{rub.format(Math.round(weightedKolobok))} ₽</span></div><div><strong>Манчесы — 20%</strong><span>Средняя цена порции: {formatRub(model.product_model.manches.realized_price_rub)}</span></div></div>
                      <div className="revenue-segment-list">{model.product_model.kolobok_price_segments.map(segment => <div key={segment.id}><strong>{segment.name}</strong><span>{rub.format(segment.share * 100)}% × {formatRub(segment.price_rub)}</span></div>)}</div>
                      <div className="launch-inline-result"><span>Средняя цена порции еды</span><strong>{formatRub(averageFood)}</strong></div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="launch-card" aria-labelledby="revenue-production-title">
              <SectionHeading id="revenue-production-title" number="03" title={model.public_presentation.production_title} text={model.public_presentation.production_description} />
              <dl className="revenue-daily-load" data-testid="daily-production-load">
                <div className="revenue-daily-card revenue-daily-side" data-daily-metric="checks">
                  <dt>Чеков в день</dt>
                  <dd>{formatCount(result.checksPerDay)}</dd>
                </div>
                <div className="revenue-daily-card revenue-daily-food" data-daily-metric="food">
                  <div className="revenue-food-total">
                    <strong>{formatCount(result.foodPortionsPerDay)}</strong>
                    <span>порций еды в день</span>
                  </div>
                  <div className="revenue-food-composition">
                    <span className="revenue-food-composition-title">Из них</span>
                    <div className="revenue-food-parts">
                      <div data-food-part="kolobok"><span>Колобки</span><strong>{formatCount(result.kolobokPortionsPerDay, "порций")}</strong></div>
                      <div data-food-part="manches"><span>Манчесы</span><strong>{formatCount(result.manchesPerDay)}</strong></div>
                    </div>
                  </div>
                </div>
                <div className="revenue-daily-card revenue-daily-side revenue-daily-drinks" data-daily-metric="drinks">
                  <dt>Напитков в день</dt>
                  <dd>{formatCount(result.drinksPerDay)}</dd>
                </div>
              </dl>
              <div className="revenue-hour-grid">
                <article><span>Средний час</span><strong>{formatApprox(result.averageHour.food, ["порция еды", "порции еды", "порций еды"])}</strong><small>{formatApprox(result.averageHour.checks, ["чек", "чека", "чеков"])}</small></article>
                <article><span>Пиковый час</span><strong>{formatApprox(result.peakHour.food, ["порция еды", "порции еды", "порций еды"])}</strong><small>{formatApprox(result.peakHour.checks, ["чек", "чека", "чеков"])}</small></article>
                <article className="is-accent"><span>{publicCopy.maximumHourLabel}</span><strong>{formatApprox(result.maximumHour.food, ["порция еды", "порции еды", "порций еды"])}</strong><small>{formatApprox(result.maximumHour.checks, ["чек", "чека", "чеков"])}</small></article>
              </div>
            </section>

            <section className="launch-card" aria-labelledby="revenue-capacity-title">
              <SectionHeading id="revenue-capacity-title" number="04" title={model.public_presentation.capacity_title} text={publicCapacityCopy(result.capacityStatement)} />
              <div className="revenue-capacity-band"><span>{publicCopy.capacityBandLabel}</span><strong>{model.capacity.kolobok_line.sustainable_portions_per_hour.min}–{model.capacity.kolobok_line.sustainable_portions_per_hour.max} порций в час</strong></div>
              <button type="button" className="launch-preparation-accordion-button" aria-expanded={capacityOpen} aria-controls="revenue-capacity-details" onClick={() => setCapacityOpen(open => !open)}><span>{model.public_presentation.capacity_basis_label}</span><span aria-hidden="true">{capacityOpen ? "−" : "+"}</span></button>
              {capacityOpen ? <div id="revenue-capacity-details" className="revenue-capacity-details">
                {model.capacity.public_basis.map(item => <div key={item.label}><strong>{publicCapacityLabel(item.label)}</strong><span>{item.value}</span>{item.secondary ? <small>{item.secondary}</small> : null}</div>)}
                <div className="revenue-capacity-split" data-testid="maximum-line-split"><strong>{publicCopy.maximumLineLoadLabel}</strong><span>{result.calculated ? `${formatApprox(result.maximumHour.kolobok, ["порция колобков", "порции колобков", "порций колобков"])} · ${formatApprox(result.maximumHour.manches, ["манчес", "манчеса", "манчесов"])}` : model.public_presentation.not_calculated_label}</span></div>
              </div> : null}
            </section>

            <button className="launch-reset" type="button" onClick={reset}>Сбросить расчёт</button>
          </div>

          <aside className="launch-total-card revenue-total-card" aria-live="polite" data-testid="revenue-summary">
            <p className="launch-total-eyebrow">Сценарная модель</p>
            <h2>{model.public_presentation.sales_title}</h2>
            <strong className="launch-total-value">{result.salesPerMonthRub === null ? model.public_presentation.not_calculated_label : `${formatRub(result.salesPerMonthRub)} / месяц`}</strong>
            <dl className="launch-total-breakdown revenue-summary-list">
              <SummaryMetric label="В день" value={result.salesPerDayRub === null ? model.public_presentation.not_calculated_label : formatRub(result.salesPerDayRub)} />
              <SummaryMetric label="Средний чек" value={`≈${rub.format(Math.round(averageCheck))} ₽`} />
              <SummaryMetric label="Чеков в день" value={formatCount(result.checksPerDay)} />
              <SummaryMetric label="Порций еды" value={formatCount(result.foodPortionsPerDay)} />
              <SummaryMetric label="Напитков" value={formatCount(result.drinksPerDay)} />
              <SummaryMetric label="Сценарий" value={result.scenarioLabel} />
            </dl>
            <p className="launch-warning">{publicCopy.summaryWarning}</p>
          </aside>
        </div>
      </section>

      <section className="launch-lower-section">
        <div className="section-inner launch-lower-grid">
          <article className="launch-boundaries"><p className="launch-section-kicker">Следующий уровень модели</p><h2>{model.public_presentation.next_title}</h2><p>{model.public_presentation.next_text}</p><ul>{model.public_presentation.next_items.map(item => <li key={item}>{item}</li>)}</ul></article>
          <article className="launch-basis"><p className="launch-section-kicker">Логика модели</p><h2>{model.public_presentation.principle_title}</h2><p>{model.public_presentation.principle_text}</p><p>{model.public_presentation.principle_note}</p></article>
        </div>
      </section>
    </div>
  );
}
