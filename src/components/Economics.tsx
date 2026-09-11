import { economicsCopy } from "../content/economics";
import { economicsData, economicsScenarioIds, type EconomicsScenarioId } from "../lib/economics";
import { configuredEconomicsScenario, configuredEconomicsScenarios } from "../lib/configured-economics";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { InvestorJourneyNavigation } from "./InvestorJourneyNavigation";
import "./LaunchBudget.css";
import "./Economics.css";

const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function formatRub(value: number) {
  return `${money.format(Math.round(value))} ₽`;
}

function formatMillion(value: number) {
  return `${millions.format(value / 1_000_000)} млн ₽`;
}

function formatSignedRub(value: number) {
  return value < 0 ? `−${formatRub(Math.abs(value))}` : formatRub(value);
}

function formatPercent(value: number) {
  return `${percent.format(value * 100)}%`;
}

function formatOptionalPercent(value: number | null) {
  return value === null ? "не рассчитано" : formatPercent(value);
}

function paybackText(value: number | null) {
  return value === null ? economicsCopy.noPaybackText : `${value} ${monthLabel(value)}`;
}

function monthLabel(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "месяцев";
  if (last === 1) return "месяц";
  if (last >= 2 && last <= 4) return "месяца";
  return "месяцев";
}

function SectionHeading({ id, number, title, text }: { id: string; number: string; title: string; text: string }) {
  return (
    <div className="launch-card-heading">
      <span>{number}</span>
      <div>
        <h2 id={id}>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function HeadlineMetric({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="economics-headline-metric" data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function PnlRow({ label, value, kind = "expense" }: { label: string; value: number; kind?: "income" | "expense" | "result" }) {
  // Expense rows are presented as unsigned amounts: the block structure already reads as a deduction chain.
  // Result rows keep their analytical sign so a negative EBITDA/FCF stays visible.
  const display = kind === "expense" ? formatRub(Math.abs(value)) : formatSignedRub(value);
  return (
    <div className={`economics-pnl-row is-${kind}`}>
      <span>{label}</span>
      <strong>{display}</strong>
    </div>
  );
}

export function EconomicsPage() {
  const { configuration, resetConfiguration, setScenarioId } = useInvestorConfiguration();
  const scenarioId = configuration.scenarioId as EconomicsScenarioId;
  const scenario = configuredEconomicsScenario(configuration);
  const scenarios = configuredEconomicsScenarios(configuration);
  const assumptions = economicsData.assumptions;
  const rent = configuredEconomicsScenario({
    ...configuration,
    launchBudget: { ...configuration.launchBudget, premisesScenario: "rent" },
  });
  const purchase = configuredEconomicsScenario({
    ...configuration,
    launchBudget: { ...configuration.launchBudget, premisesScenario: "purchase" },
  });
  const purchasePropertyRub = purchase.investmentBreakdown.find((item) => item.key === "property")?.amount_rub ?? 0;
  const purchaseRestaurantCapitalRub = purchase.startInvestmentRub - purchasePropertyRub;

  return (
    <div className="launch-budget-page economics-page">
      <section className="launch-hero economics-hero" aria-labelledby="economics-title">
        <div className="section-inner launch-hero-inner">
          <div>
            <p className="launch-eyebrow"><span>{economicsCopy.heroKicker}</span></p>
            <h1 id="economics-title">{economicsCopy.pageTitle}</h1>
            <p className="launch-subtitle">{economicsCopy.subtitle}</p>
          </div>
          <aside>
            <strong>{economicsCopy.heroAsideTitle}</strong>
            <p>{economicsCopy.heroAsideText}</p>
          </aside>
        </div>
      </section>

      <section className="launch-workspace economics-workspace">
        <div className="section-inner">
          <section className="economics-scenario-panel" aria-labelledby="economics-scenario-title">
            <div>
              <p className="launch-section-kicker">Рабочая модель</p>
              <h2 id="economics-scenario-title">{economicsCopy.scenarioTitle}</h2>
              <p>{economicsCopy.scenarioText}</p>
            </div>
            <div className="launch-segmented economics-scenario-tabs" role="group" aria-label="Сценарий экономики объекта">
              {economicsScenarioIds.map((id) => {
                const item = economicsData.scenariosById[id];
                return (
                  <button
                    key={id}
                    type="button"
                    className={scenarioId === id ? "is-selected" : ""}
                    aria-pressed={scenarioId === id}
                    data-scenario={id}
                    onClick={() => setScenarioId(id)}
                  >
                    <strong>{item.name}</strong>
                    <span>{item.checksPerDay} чеков в день</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="launch-workspace-grid economics-workspace-grid">
            <div className="launch-form-column">
              <section className="launch-card" aria-labelledby="economics-result-title">
                <SectionHeading id="economics-result-title" number="01" title={economicsCopy.resultTitle} text={economicsCopy.resultText} />
                <div className="economics-configuration-actions" data-testid="economics-configuration-actions">
                  <span>{scenario.isConfigured ? economicsCopy.configuredLabel : economicsCopy.baselineConfigurationLabel}</span>
                  {scenario.isConfigured ? <div><button type="button" onClick={resetConfiguration} data-testid="economics-reset-configuration">{economicsCopy.resetConfigurationLabel}</button></div> : null}
                </div>
                <div className="economics-headline-grid" aria-live="polite">
                  <HeadlineMetric label="Стартовые инвестиции" value={formatMillion(scenario.startInvestmentRub)} testId="economics-start-investment" />
                  <HeadlineMetric label="Продажи" value={`${formatMillion(scenario.salesPerMonthRub)} / месяц`} testId="economics-sales" />
                  <HeadlineMetric label="EBITDA объекта" value={`${formatMillion(scenario.ebitdaRub)} / месяц`} testId="economics-ebitda" />
                  <HeadlineMetric label="Операционная маржа" value={formatPercent(scenario.ebitdaMargin)} testId="economics-margin" />
                  <HeadlineMetric label="Точка безубыточности" value={`≈${money.format(Math.round(scenario.breakEvenChecksPerDay))} чеков / день`} testId="economics-break-even" />
                  <HeadlineMetric label="Срок окупаемости" value={paybackText(scenario.paybackMonth)} testId="economics-payback" />
                </div>
                <p className="economics-note">{economicsData.sourceCopy.ramp_and_seasonality_note}</p>
              </section>

              <section className="launch-card" aria-labelledby="economics-ramp-title">
                <SectionHeading id="economics-ramp-title" number="02" title={economicsCopy.rampTitle} text={economicsCopy.rampText} />
                <div className="economics-ramp-scale" data-testid="economics-ramp">
                  {economicsData.rampUpProfile.map((item) => (
                    <div key={item.month} className={item.ramp_factor === 1 ? "is-full" : ""} data-ramp-month={item.month}>
                      <span>{item.month === 7 ? "7-й и далее" : `${item.month}-й месяц`}</span>
                      <strong>{Math.round(item.ramp_factor * 100)}%</strong>
                    </div>
                  ))}
                </div>
                <div className="economics-year-one" data-testid="economics-year-one">
                  <div><span>Продажи за первый год</span><strong>{formatMillion(scenario.year1.salesRub)}</strong></div>
                  <div><span>EBITDA за первый год</span><strong>{formatMillion(scenario.year1.ebitdaRub)}</strong></div>
                  <div><span>Маржа первого года</span><strong>{formatPercent(scenario.year1.ebitdaMargin)}</strong></div>
                  <div><span>EBITDA зрелого года</span><strong>{formatMillion(scenario.matureYear.ebitdaRub)}</strong></div>
                </div>
                <p className="economics-note">{economicsData.sourceCopy.year_1_note}</p>
              </section>

              <section className="launch-card" aria-labelledby="economics-pnl-title">
                <SectionHeading id="economics-pnl-title" number="03" title={economicsCopy.pnlTitle} text={economicsCopy.pnlText} />
                <div className="economics-pnl" data-testid="economics-pnl">
                  <PnlRow label="Продажи" value={scenario.pnl.salesRub} kind="income" />
                  <div className="economics-pnl-group" data-testid="economics-cogs-group" data-amount-rub={scenario.pnl.productCostRub}>
                    <PnlRow label="Прямые затраты на продукцию" value={scenario.pnl.productCostRub} />
                    <div className="economics-pnl-subrows" aria-label="Состав прямых затрат на продукцию">
                      <div data-cogs-part="raw-materials" data-amount-rub={scenario.pnl.rawMaterialsRub}><span>Сырьё</span><strong>{formatRub(scenario.pnl.rawMaterialsRub)}</strong></div>
                      <div data-cogs-part="waste" data-amount-rub={scenario.pnl.wasteRub}><span>Списания</span><strong>{formatRub(scenario.pnl.wasteRub)}</strong></div>
                      <div data-cogs-part="packaging" data-amount-rub={scenario.pnl.packagingRub}><span>Упаковка</span><strong>{formatRub(scenario.pnl.packagingRub)}</strong></div>
                    </div>
                  </div>
                  <div className="economics-pnl-result">
                    <PnlRow label="Валовая прибыль" value={scenario.pnl.grossProfitRub} kind="result" />
                    <span>{formatPercent(scenario.pnl.grossMargin)}</span>
                  </div>
                  <PnlRow label="Персонал" value={scenario.pnl.personnelRub} />
                  <PnlRow label="Помещение" value={scenario.pnl.premisesRub} />
                  <PnlRow label="Эквайринг" value={scenario.pnl.acquiringRub} />
                  <PnlRow label="Коммунальные услуги" value={scenario.pnl.utilitiesRub} />
                  <div className="economics-pnl-group" data-testid="economics-marketing-group" data-amount-rub={scenario.pnl.marketingRub}>
                    <PnlRow label="Маркетинг и продвижение" value={scenario.pnl.marketingRub} />
                    <div className="economics-pnl-subrows is-marketing" aria-label="Расчёт маркетинга и продвижения">
                      <div data-marketing-part="fixed" data-amount-rub={scenario.pnl.marketingFormula.fixed_amount_rub}><span>Постоянная часть</span><strong>{formatRub(scenario.pnl.marketingFormula.fixed_amount_rub)}</strong></div>
                      <div data-marketing-part="variable" data-amount-rub={scenario.pnl.marketingRub - scenario.pnl.marketingFormula.fixed_amount_rub}><span>{formatPercent(scenario.pnl.marketingFormula.rate_of_net_revenue)} продаж</span><strong>{formatRub(scenario.pnl.marketingRub - scenario.pnl.marketingFormula.fixed_amount_rub)}</strong></div>
                      <div data-marketing-part="floor"><span>Первые {scenario.pnl.marketingFormula.ramp_up_floor_months} месяцев</span><strong>не менее {formatRub(scenario.pnl.marketingFormula.ramp_up_floor_rub)}</strong></div>
                    </div>
                  </div>
                  <PnlRow label="Обслуживание и эксплуатация" value={scenario.pnl.operationsRub} />
                  <PnlRow label="Хозяйственные и эксплуатационные расходники" value={scenario.pnl.householdRub} />
                  <PnlRow label="Административные и прочие расходы" value={scenario.pnl.administrativeAndOtherRub} />
                  <PnlRow label="Административный резерв" value={scenario.pnl.administrativeReserveRub} />
                  <div className="economics-pnl-ebitda">
                    <PnlRow label="EBITDA объекта" value={scenario.pnl.ebitdaRub} kind="result" />
                    <span>{formatPercent(scenario.pnl.ebitdaMargin)}</span>
                  </div>
                </div>
                <details className="economics-details">
                  <summary>После EBITDA</summary>
                  <div className="economics-details-list">
                    <div><span>Амортизация</span><strong>{formatRub(scenario.pnl.depreciationRub)}</strong></div>
                    <div><span>Налог</span><strong>{formatRub(scenario.pnl.taxRub)}</strong></div>
                    <div><span>Чистый операционный результат</span><strong>{formatRub(scenario.pnl.netOperatingResultRub)}</strong></div>
                    <div><span>Свободный денежный поток</span><strong>{formatRub(scenario.pnl.freeCashFlowRub)}</strong></div>
                  </div>
                </details>
              </section>

              <section className="launch-card" aria-labelledby="economics-resilience-title">
                <SectionHeading id="economics-resilience-title" number="04" title={economicsCopy.resilienceTitle} text={economicsCopy.resilienceText} />
                <div className="economics-resilience-summary">
                  <span>Точка безубыточности</span>
                  <strong>≈{money.format(Math.round(scenario.breakEvenChecksPerDay))} чеков/день</strong>
                </div>
                <div className="economics-resilience-scale" aria-label="Сравнение точки безубыточности и сценариев загрузки">
                  <div className="is-break-even"><span>Точка безубыточности</span><strong>≈{money.format(Math.round(scenario.breakEvenChecksPerDay))}</strong></div>
                  {scenarios.map((item) => <div key={item.id} className={scenarioId === item.id ? "is-current" : ""}><span>{item.name}</span><strong>{item.checksPerDay}</strong></div>)}
                </div>
                <p className="economics-note">{economicsCopy.resilienceNote}</p>
              </section>

              <section className="launch-card" aria-labelledby="economics-comparison-title">
                <SectionHeading id="economics-comparison-title" number="05" title={economicsCopy.comparisonTitle} text={economicsCopy.comparisonText} />
                <div className="economics-scenario-cards" data-testid="economics-scenario-comparison">
                  {scenarios.map((item) => (
                    <article key={item.id} className={scenarioId === item.id ? "is-current" : ""}>
                      <h3>{item.name}</h3>
                      <dl>
                        <SummaryMetric label="Чеков / день" value={money.format(item.checksPerDay)} />
                        <SummaryMetric label="Продажи / месяц" value={formatMillion(item.salesPerMonthRub)} />
                        <SummaryMetric label="EBITDA" value={formatMillion(item.ebitdaRub)} />
                        <SummaryMetric label="Маржа" value={formatPercent(item.ebitdaMargin)} />
                        <SummaryMetric label="Свободный денежный поток" value={formatMillion(item.freeCashFlowRub)} />
                        <SummaryMetric label="Окупаемость" value={item.paybackMonth === null ? economicsCopy.noPaybackText : `${item.paybackMonth} мес.`} />
                        <SummaryMetric label="Первый год — EBITDA" value={formatMillion(item.year1.ebitdaRub)} />
                      </dl>
                    </article>
                  ))}
                </div>
              </section>

              <section className="launch-card" aria-labelledby="economics-investment-title">
                <SectionHeading id="economics-investment-title" number="06" title={economicsCopy.investmentTitle} text={economicsCopy.investmentText} />
                <div className="economics-investment-total">
                  <span>{scenario.name} сценарий</span>
                  <strong>{formatMillion(scenario.startInvestmentRub)}</strong>
                  <p>{economicsCopy.investmentNote}</p>
                </div>
                <div className="economics-investment-groups" data-testid="economics-investment-groups">
                  {scenario.investmentGroups.map((group) => (
                    <article key={group.key} data-investment-group={group.key} data-amount-rub={group.amount_rub}>
                      <h3>{group.name}</h3>
                      <strong className="economics-investment-group-amount">{formatMillion(group.amount_rub)}</strong>
                      <ul>{group.items.map((item) => <li key={item.key}>{item.name}</li>)}</ul>
                    </article>
                  ))}
                </div>
                <div className="economics-reserve-card">
                  <span>Операционный запас</span>
                  <strong>{formatMillion(scenario.operatingReserveRub)}</strong>
                  <p>{economicsCopy.reserveNote}</p>
                </div>
                <details className="economics-details economics-investment-details">
                  <summary>{economicsCopy.investmentCompositionLabel}</summary>
                  <div className="economics-details-list">
                    {scenario.investmentBreakdown.map((item) => <div key={item.key}><span>{item.name}</span><strong>{formatRub(item.amount_rub)}</strong></div>)}
                    <div className="is-total"><span>Итого</span><strong>{formatRub(scenario.startInvestmentRub)}</strong></div>
                  </div>
                </details>
              </section>

              <section className="launch-card" aria-labelledby="economics-property-title">
                <SectionHeading id="economics-property-title" number="07" title={economicsCopy.rentPurchaseTitle} text={economicsCopy.rentPurchaseText} />
                <div className="economics-property-grid">
                  <article className={scenario.premisesScenario === "rent" ? "is-primary" : ""}>
                    <p>Аренда</p>
                    <h3>{formatMillion(rent.startInvestmentRub)}</h3>
                    <dl>
                      <SummaryMetric label="Стартовый капитал" value={formatMillion(rent.startInvestmentRub)} />
                      <SummaryMetric label="EBITDA" value={`${formatMillion(rent.ebitdaRub)} / мес.`} />
                      <SummaryMetric label="Окупаемость" value={paybackText(rent.paybackMonth)} />
                      <SummaryMetric label="IRR ресторанной инвестиции" value={formatOptionalPercent(rent.irr)} />
                    </dl>
                  </article>
                  <article className={scenario.premisesScenario === "purchase" ? "is-primary" : ""}>
                    <p>Покупка помещения</p>
                    <h3>{formatMillion(purchase.startInvestmentRub)}</h3>
                    <dl>
                      <SummaryMetric label="Ресторанный капитал" value={formatMillion(purchaseRestaurantCapitalRub)} />
                      <SummaryMetric label="Недвижимость" value={formatMillion(purchasePropertyRub)} />
                      <SummaryMetric label="Совокупный капитал" value={formatMillion(purchase.startInvestmentRub)} />
                      <SummaryMetric label="EBITDA ресторана" value={`${formatMillion(purchase.ebitdaRub)} / мес.`} />
                      <SummaryMetric label="Совокупная окупаемость" value={paybackText(purchase.paybackMonth)} />
                      <SummaryMetric label="IRR совокупной инвестиции" value={formatOptionalPercent(purchase.irr)} />
                    </dl>
                  </article>
                </div>
                <details className="economics-details">
                  <summary>{economicsCopy.metricsLabel}</summary>
                  <div className="economics-metric-explanations">
                    <div><strong>ROI · {formatPercent(scenario.roi)}</strong><span>Годовой свободный денежный поток относительно ресторанного капитала.</span></div>
                    <div><strong>IRR · {formatOptionalPercent(scenario.irr)}</strong><span>Внутренняя норма доходности денежного потока модели.</span></div>
                    <div><strong>{economicsCopy.npvTitle} · {formatMillion(scenario.npvRub)}</strong><span>{economicsCopy.npvText}</span></div>
                  </div>
                </details>
              </section>

              <section className="launch-card" aria-labelledby="economics-sensitivity-title">
                <SectionHeading id="economics-sensitivity-title" number="08" title={economicsCopy.sensitivityTitle} text={economicsCopy.sensitivityText} />
                <div className="economics-sensitivity-grid">
                  <article>
                    <h3>Поток и средний чек</h3>
                    <p>Реалистичный поток · 300 чеков/день</p>
                    <dl>
                      {economicsData.sensitivity.checksAverageCheck.values.map((item) => (
                        <SummaryMetric
                          key={item.average_check_multiplier}
                          label={item.average_check_multiplier === 1 ? "База" : item.average_check_multiplier < 1 ? "Средний чек −15%" : "Средний чек +15%"}
                          value={formatPercent(item.ebitda_margin)}
                        />
                      ))}
                    </dl>
                  </article>
                  <article>
                    <h3>Прямые затраты на продукцию</h3>
                    <p>Влияние доли прямых затрат на маржу EBITDA</p>
                    <dl>
                      {economicsData.sensitivity.foodCost.map((item) => <SummaryMetric key={item.value} label={formatPercent(item.value)} value={formatPercent(item.ebitda_margin)} />)}
                    </dl>
                  </article>
                </div>
              </section>

              <details className="launch-card economics-assumptions">
                <summary>{economicsCopy.assumptionsLabel}</summary>
                <div className="economics-assumption-grid">
                  <div><span>Расчётный месяц</span><strong>{assumptions.days_per_month} дней</strong></div>
                  <div><span>Средний чек</span><strong>{formatRub(assumptions.average_check_rub)}</strong></div>
                  <div><span>Порций еды на чек</span><strong>{decimal.format(assumptions.food_portions_per_check)}</strong></div>
                  <div><span>Напитков на чек</span><strong>{decimal.format(assumptions.drinks_per_check)}</strong></div>
                  <div><span>Эквайринг</span><strong>{formatPercent(assumptions.acquiring_rate)}</strong></div>
                  <div><span>Расходы на помещение</span><strong>{formatRub(scenario.pnl.premisesRub)} / месяц</strong></div>
                  <div><span>Персонал</span><strong>{scenario.headcount} сотрудников</strong></div>
                  <div><span>Списания</span><strong>{formatPercent(assumptions.waste_rate)} стоимости сырья</strong></div>
                  <div><span>Сырьё</span><strong>{formatPercent(assumptions.raw_materials_rate)} продаж</strong></div>
                  <div><span>Расходы на персонал</span><strong>не ниже {formatPercent(assumptions.protected_labor_rate)} продаж</strong></div>
                  <div><span>Административный резерв</span><strong>{formatPercent(assumptions.administrative_reserve_rate)} продаж</strong></div>
                  <div><span>Регулярный маркетинг</span><strong>{formatRub(assumptions.marketing_formula.fixed_amount_rub)} + {formatPercent(assumptions.marketing_formula.rate_of_net_revenue)} продаж</strong></div>
                  <div><span>Хозяйственные расходники</span><strong>{formatRub(assumptions.household_formula.fixed_amount_rub)} + {formatRub(assumptions.household_formula.variable_amount_rub)} × чеки / {assumptions.household_formula.baseline_checks_per_day}</strong></div>
                  <div><span>Маркетинг запуска</span><strong>{formatRub(economicsData.launchMarketingRub)} единовременно</strong></div>
                </div>
                <div className="economics-seasonality" data-testid="economics-seasonality">
                  <span className="economics-seasonality-label">{economicsCopy.seasonalityLabel}</span>
                  <div className="economics-seasonality-scale">
                    {economicsData.seasonalityProfile.map((item) => (
                      <div key={item.month} data-seasonality-month={item.month}>
                        <span>{monthNames[item.month - 1]}</span>
                        <strong>{decimal.format(item.seasonality_coefficient)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="economics-model-notes">
                  <p>{economicsData.sourceCopy.tax_base_text}</p>
                  <p>{economicsData.sourceCopy.ramp_up_text}</p>
                  <p>{economicsData.sourceCopy.seasonality_text}</p>
                  <p>{economicsData.sourceCopy.marketing_text}</p>
                  <p>{economicsData.sourceCopy.pessimistic_staffing_text}</p>
                  <p>{economicsData.sourceCopy.tax_confirmation_text}</p>
                  <p>{economicsData.sourceCopy.discount_rate_text}</p>
                </div>
              </details>
            </div>

            <aside className="economics-sticky-column">
              <div className="launch-segmented economics-scenario-tabs economics-sticky-tabs" role="group" aria-label="Сценарий экономики объекта — быстрое переключение" data-testid="economics-sticky-selector">
                {economicsScenarioIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={scenarioId === id ? "is-selected" : ""}
                    aria-pressed={scenarioId === id}
                    data-scenario-sticky={id}
                    onClick={() => setScenarioId(id)}
                  >
                    <strong>{economicsData.scenariosById[id].checksPerDay} чеков/день</strong>
                  </button>
                ))}
              </div>
            <div className="launch-total-card economics-total-card" aria-live="polite" data-testid="economics-summary">
              <p className="launch-total-eyebrow">{scenario.name} сценарий</p>
              <h2>{economicsCopy.pageTitle}</h2>
              <span className="economics-total-label">Стартовые инвестиции</span>
              <strong className="launch-total-value">{formatMillion(scenario.startInvestmentRub)}</strong>
              <dl className="launch-total-breakdown">
                <SummaryMetric label="Продажи / месяц" value={formatMillion(scenario.salesPerMonthRub)} />
                <SummaryMetric label="EBITDA" value={formatMillion(scenario.ebitdaRub)} />
                <SummaryMetric label="Маржа" value={formatPercent(scenario.ebitdaMargin)} />
                <SummaryMetric label="Окупаемость" value={paybackText(scenario.paybackMonth)} />
                <SummaryMetric label="Чеков / день" value={money.format(scenario.checksPerDay)} />
              </dl>
              <p className="launch-warning">{economicsCopy.summaryNote}</p>
            </div>
            <InvestorJourneyNavigation actions={[
              { href: "/control/launch-budget", label: "← Расчёт затрат", tone: "primary", testId: "economics-to-launch-budget" },
              { href: "/control/revenue", label: "Расчёт доходов", tone: "secondary", testId: "economics-to-revenue" },
            ]} />
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
