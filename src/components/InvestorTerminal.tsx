import { useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { calculateAverageCheck } from "../lib/revenue-model";
import { economicsData, economicsScenarioIds } from "../lib/economics";
import { configuredEconomicsScenario } from "../lib/configured-economics";
import {
  baseObjectPlanningReference,
} from "../lib/network-planning";
import {
  investorConfigurationIsCurrentBaseFullPreparation,
  investorConfigurationIsReadyPremisesDefault,
  type InvestorScenarioId,
} from "../lib/investor-configuration";
import {
  calculateLaunchBudget,
  launchModel,
  type LaunchBudgetState,
  type PremisesScenario,
} from "../lib/launch-budget";
import { baseObjectFinancialProjection } from "../lib/network-scaling";
import { useInvestorConfiguration } from "./InvestorConfigurationProvider";
import { NetworkScalingPanel } from "./NetworkScalingPanel";
import { InvestorEconomicsPanel } from "./InvestorEconomicsPanel";
import { FormattedNumberInput, formatNumber } from "./FormattedNumberInput";
import "./InvestorTerminal.css";

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function formatRub(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${formatNumber(value, true)} ₽`;
}

function formatMillion(value: number | null | undefined) {
  return formatRub(value);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${percent.format(value * 100)}%`;
}

function paybackText(value: number | null) {
  if (value === null) return "не рассчитано";
  const lastTwo = value % 100;
  const last = value % 10;
  const suffix = lastTwo >= 11 && lastTwo <= 14 ? "месяцев" : last === 1 ? "месяц" : last >= 2 && last <= 4 ? "месяца" : "месяцев";
  return `${value} ${suffix}`;
}

function TerminalSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="terminal-section">
      <header>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </header>
      <div className="terminal-table">{children}</div>
    </section>
  );
}

function TerminalRow({ label, children, baseline, hint, derived = false, testId }: {
  label: string;
  children: ReactNode;
  baseline?: string | null;
  hint?: string;
  derived?: boolean;
  testId?: string;
}) {
  return (
    <div className={`terminal-row${derived ? " is-derived" : ""}`} data-testid={testId}>
      <div className="terminal-row-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div className="terminal-row-value">
        {children}
        {baseline ? <small className="terminal-baseline">Базовое значение: {baseline}</small> : null}
      </div>
    </div>
  );
}

function NumberCell({ value, onChange, suffix, integer = false, baseline, ariaLabel, testId }: {
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  integer?: boolean;
  baseline?: string | null;
  ariaLabel: string;
  testId?: string;
}) {
  return (
    <>
      <label className="terminal-number-cell">
        <FormattedNumberInput ariaLabel={ariaLabel} testId={testId} value={value} onChange={onChange} integer={integer} />
        {suffix ? <span>{suffix}</span> : null}
      </label>
      {baseline ? <small className="terminal-baseline">Базовое значение: {baseline}</small> : null}
    </>
  );
}

function SelectCell({ value, onChange, options, ariaLabel }: {
  value: string | number;
  onChange: (value: string) => void;
  options: Array<{ value: string | number; label: string }>;
  ariaLabel: string;
}) {
  return (
    <select className="terminal-select-cell terminal-select-control" aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function ToggleCell({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" className={`terminal-toggle${checked ? " is-on" : ""}`} role="switch" aria-checked={checked} onClick={onChange}>
      <span aria-hidden="true"><i /></span>
      {label}
    </button>
  );
}

function ScenarioTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={active ? "is-active" : ""} aria-pressed={active} onClick={onClick}>{children}</button>;
}

export function InvestorTerminalPage() {
  const {
    configuration,
    applyReadyPremisesPreset,
    resetConfiguration,
    setCustomChecksPerDay,
    setLaunchBudget,
    setScenarioId,
  } = useInvestorConfiguration();
  const [tab, setTab] = useState<"unit" | "scale" | "participation">("unit");
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [investmentDetailsOpen, setInvestmentDetailsOpen] = useState(false);
  const [pnlDetailsOpen, setPnlDetailsOpen] = useState(false);
  const scenarioId = configuration.scenarioId;
  const canonicalScenario = economicsData.scenariosById[scenarioId];
  const scenario = configuredEconomicsScenario(configuration);
  const baseObjectProjection = useMemo(() => baseObjectFinancialProjection(scenario), [scenario]);
  const launchBudget = configuration.launchBudget;
  const launch = useMemo(() => calculateLaunchBudget(launchBudget), [launchBudget]);
  const isCurrentBaseFullPreparation = investorConfigurationIsCurrentBaseFullPreparation(configuration);
  const isReadyPremises = investorConfigurationIsReadyPremisesDefault(configuration);
  const isCustom = !isCurrentBaseFullPreparation && !isReadyPremises;
  const averageCheckRub = calculateAverageCheck();
  const currentChecksPerDay = configuration.customChecksPerDay ?? canonicalScenario.checksPerDay;
  const preparationItem = scenario.investmentBreakdown.find((item) => item.key === "preparation");
  const equipmentItem = scenario.investmentBreakdown.find((item) => item.key === "equipment");
  const furnitureItem = scenario.investmentBreakdown.find((item) => item.key === "furniture");
  const operatingOpexRub = scenario.salesPerMonthRub - scenario.ebitdaRub;
  const primaryPointCohort = configuration.networkScaling.cohorts[0];
  const pointConfigurationText = primaryPointCohort?.format === "with_seating"
    ? "с посадочным залом"
    : "только на вынос";

  // A tab replaces its entire workspace. Keeping a deep page position from
  // the prior tab can mount the next tab below the viewport (notably in
  // Safari/iPad). Reset before paint rather than waiting for user scroll.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tab]);

  function selectTab(next: "unit" | "scale" | "participation") {
    setTab(next);
  }

  function updateBudget<K extends keyof LaunchBudgetState>(key: K, value: LaunchBudgetState[K]) {
    setLaunchBudget((current) => ({ ...current, [key]: value }));
  }

  function selectScenario(nextScenarioId: InvestorScenarioId) {
    setScenarioId(nextScenarioId);
    setCustomChecksPerDay(null);
  }

  function setChecksPerDay(value: number | null) {
    if (value === null || value === canonicalScenario.checksPerDay) {
      setCustomChecksPerDay(null);
      return;
    }
    setCustomChecksPerDay(value);
  }

  function togglePreparationCategory(categoryId: string) {
    setLaunchBudget((current) => {
      const enabled = new Set(current.preparationEnabledCategoryIds);
      if (enabled.has(categoryId)) enabled.delete(categoryId);
      else enabled.add(categoryId);
      return {
        ...current,
        preparationEnabledCategoryIds: launchModel.preparation.categories
          .filter((category) => enabled.has(category.id))
          .map((category) => category.id),
      };
    });
  }

  const scenarioStatus = isCurrentBaseFullPreparation
    ? "Базовая финансовая модель"
    : isReadyPremises
      ? "Сценарий: готовое помещение"
      : "Пользовательский сценарий";

  return (
    <div className="investor-terminal-page">
      <section className="investor-terminal" aria-labelledby="investor-terminal-title">
        <header className="terminal-header">
          <div>
            <p>Терминал инвестора</p>
            <h1 id="investor-terminal-title">Финансовая модель</h1>
          </div>
          <div className="terminal-header-actions">
            <span className={`terminal-status${isCustom ? " is-custom" : ""}`} data-testid="terminal-scenario-status">{scenarioStatus}</span>
            <button type="button" className="terminal-reset" onClick={resetConfiguration} data-testid="terminal-reset">Сбросить изменения</button>
          </div>
        </header>

        <nav className="terminal-tabs" aria-label="Режим терминала инвестора">
          <ScenarioTab active={tab === "unit"} onClick={() => selectTab("unit")}>Экономика точки</ScenarioTab>
          <ScenarioTab active={tab === "scale"} onClick={() => selectTab("scale")}>Масштабирование</ScenarioTab>
          <ScenarioTab active={tab === "participation"} onClick={() => selectTab("participation")}>Условия участия</ScenarioTab>
        </nav>

        {tab === "participation" ? <InvestorEconomicsPanel /> : tab === "scale" ? <NetworkScalingPanel
          baseObject={{
            ...baseObjectProjection,
            investmentBreakdown: scenario.investmentBreakdown,
            cashFlows: scenario.cashFlows,
            monthlyProjection: scenario.monthlyProjection,
          }}
          onReturnToUnit={() => selectTab("unit")}
        /> : (
          <div className="terminal-workspace">
            <div className="terminal-inputs">
              <section className="terminal-scenario-bar" aria-label="Канонический сценарий">
                <div>
                  <span>Сценарий</span>
                  <strong>{economicsData.scenariosById[scenarioId].name}</strong>
                </div>
                <div className="terminal-scenario-buttons">
                  {economicsScenarioIds.map((id) => (
                    <button key={id} type="button" className={scenarioId === id && configuration.customChecksPerDay === null ? "is-selected" : ""} onClick={() => selectScenario(id)}>
                      {economicsData.scenariosById[id].name}
                    </button>
                  ))}
                </div>
                <button type="button" className="terminal-preset-button" onClick={applyReadyPremisesPreset}>Готовое помещение</button>
              </section>
              <p className="terminal-point-configuration" data-testid="terminal-point-configuration">Первая точка сети: <strong>{pointConfigurationText}</strong> · {primaryPointCohort?.realEstateMode === "purchase" ? "покупка" : "аренда"} · бар {primaryPointCohort?.barEnabled ? "включён" : "выключен"}.</p>

              <TerminalSection title="Доходы" note="Вводимые ячейки меняют только локальный сценарий этого браузера.">
                <TerminalRow label="Чеков в день" testId="terminal-checks-per-day">
                  <NumberCell
                    value={currentChecksPerDay}
                    onChange={setChecksPerDay}
                    suffix="чеков"
                    integer
                    ariaLabel="Чеков в день"
                    testId="terminal-checks-input"
                    baseline={configuration.customChecksPerDay !== null ? String(canonicalScenario.checksPerDay) : null}
                  />
                </TerminalRow>
                <TerminalRow label="Средний чек" derived>
                  <output>{formatRub(averageCheckRub)}</output>
                </TerminalRow>
                <TerminalRow label="Дней работы" derived>
                  <output>{economicsData.assumptions.days_per_month} в месяц</output>
                </TerminalRow>
                <TerminalRow label="Выручка в месяц" derived>
                  <output data-testid="terminal-sales-result" data-amount-rub={scenario.salesPerMonthRub}>{formatRub(scenario.salesPerMonthRub)}</output>
                </TerminalRow>
              </TerminalSection>

              <TerminalSection title="Помещение">
                <TerminalRow label="Режим">
                  <div className="terminal-segmented" role="group" aria-label="Режим помещения">
                    {(["rent", "purchase"] as PremisesScenario[]).map((mode) => (
                      <button key={mode} type="button" className={launchBudget.premisesScenario === mode ? "is-selected" : ""} onClick={() => updateBudget("premisesScenario", mode)}>
                        {mode === "rent" ? "Аренда" : "Покупка"}
                      </button>
                    ))}
                  </div>
                </TerminalRow>
                {launchBudget.premisesScenario === "rent" ? (
                  <>
                    <TerminalRow label="Аренда в месяц">
                      <NumberCell value={launchBudget.monthlyRentRub} onChange={(value) => updateBudget("monthlyRentRub", value)} suffix="₽" ariaLabel="Аренда в месяц" baseline={isCustom && launchBudget.monthlyRentRub !== baseObjectPlanningReference().monthlyRentRub ? formatRub(baseObjectPlanningReference().monthlyRentRub) : null} />
                    </TerminalRow>
                    <TerminalRow label="Предоплата аренды">
                      <SelectCell value={launchBudget.prepaymentMonths} ariaLabel="Предоплата аренды" options={[1, 3, 12].map((value) => ({ value, label: `${value} мес.` }))} onChange={(value) => updateBudget("prepaymentMonths", Number(value) as 1 | 3 | 12)} />
                    </TerminalRow>
                    <TerminalRow label="Обеспечительный платёж">
                      <SelectCell value={launchBudget.securityDepositMonths} ariaLabel="Обеспечительный платёж" options={[1, 2, 3].map((value) => ({ value, label: `${value} мес.` }))} onChange={(value) => updateBudget("securityDepositMonths", Number(value) as 1 | 2 | 3)} />
                    </TerminalRow>
                    <TerminalRow label="Арендные каникулы" hint="Период после получения помещения, когда аренда не начисляется.">
                      <NumberCell value={launchBudget.rentFreeMonths} onChange={(value) => updateBudget("rentFreeMonths", Math.max(0, Math.floor(value ?? 0)))} suffix="мес." integer ariaLabel="Арендные каникулы" />
                    </TerminalRow>
                  </>
                ) : (
                  <>
                    <TerminalRow label="Стоимость помещения">
                      <NumberCell value={launchBudget.purchasePriceRub} onChange={(value) => updateBudget("purchasePriceRub", value)} suffix="₽" ariaLabel="Стоимость помещения" />
                    </TerminalRow>
                    <TerminalRow label="Арендные каникулы" derived>
                      <output>Не применяются</output>
                    </TerminalRow>
                  </>
                )}
                <TerminalRow label="Общая площадь">
                  <NumberCell value={launchBudget.totalAreaM2} onChange={(value) => updateBudget("totalAreaM2", value)} suffix="м²" ariaLabel="Общая площадь" />
                </TerminalRow>
                <TerminalRow label="Кухня и производство">
                  <NumberCell value={launchBudget.kitchenAreaM2} onChange={(value) => updateBudget("kitchenAreaM2", value)} suffix="м²" ariaLabel="Кухня и производство" />
                </TerminalRow>
                <TerminalRow label="Посадочный зал">
                  <NumberCell value={launchBudget.guestAreaM2} onChange={(value) => updateBudget("guestAreaM2", value)} suffix="м²" ariaLabel="Посадочный зал" />
                </TerminalRow>
              </TerminalSection>

              <TerminalSection title="Запуск" note="Подготовка помещения — расчётное допущение, а не договорная строительная смета.">
                <TerminalRow label="Подготовка помещения" hint={launchBudget.preparationMode === "manual" ? "Введённая сумма" : "Сумма выбранных категорий"}>
                  {launchBudget.preparationMode === "manual" ? (
                    <NumberCell value={launchBudget.preparationManualRub} onChange={(value) => updateBudget("preparationManualRub", value)} suffix="₽" ariaLabel="Подготовка помещения" />
                  ) : <output>{formatRub(preparationItem?.amount_rub)}</output>}
                </TerminalRow>
                <TerminalRow label="Способ задания">
                  <SelectCell value={launchBudget.preparationMode} ariaLabel="Способ задания подготовки помещения" options={[
                    { value: "breakdown", label: "По составу" },
                    { value: "manual", label: "Одной суммой" },
                  ]} onChange={(value) => updateBudget("preparationMode", value as "breakdown" | "manual")} />
                </TerminalRow>
                {launchBudget.preparationMode === "breakdown" ? (
                  <div className="terminal-details-row">
                    <button type="button" aria-expanded={preparationOpen} onClick={() => setPreparationOpen((open) => !open)}>{preparationOpen ? "Скрыть состав" : "Показать состав"}</button>
                    {preparationOpen ? <div className="terminal-preparation-details">
                      {launchModel.preparation.categories.map((category) => (
                        <div key={category.id} className="terminal-preparation-category">
                          <ToggleCell checked={launchBudget.preparationEnabledCategoryIds.includes(category.id)} onChange={() => togglePreparationCategory(category.id)} label={category.name} />
                          <span>{formatRub(category.amount_rub)}</span>
                        </div>
                      ))}
                    </div> : null}
                  </div>
                ) : null}
                <TerminalRow label="Оборудование">
                  <SelectCell value={launchBudget.equipmentScenarioId} ariaLabel="Комплектация оборудования" options={launchModel.equipment.scenarios.map((item) => ({ value: item.id, label: item.id === "MINIMUM" ? "Минимальная" : item.id === "BASE" ? "Базовая" : "С запасом" }))} onChange={(value) => updateBudget("equipmentScenarioId", value as LaunchBudgetState["equipmentScenarioId"])} />
                </TerminalRow>
                <TerminalRow label="Оборудование, сумма" derived><output>{formatRub(equipmentItem?.amount_rub)}</output></TerminalRow>
                <TerminalRow label="Мебель" derived hint={launch.seatCount === null ? undefined : `${launch.seatCount} мест`}><output>{formatRub(furnitureItem?.amount_rub)}</output></TerminalRow>
                <TerminalRow label="Бар и напитки"><ToggleCell checked={launchBudget.barEnabled} onChange={() => updateBudget("barEnabled", !launchBudget.barEnabled)} label={launchBudget.barEnabled ? "Включено" : "Не включено"} /></TerminalRow>
                <TerminalRow label="Операционный запас">
                  <SelectCell value={launchBudget.operatingReserveMonths} ariaLabel="Операционный запас" options={[3, 6, 9].map((value) => ({ value, label: `${value} мес.` }))} onChange={(value) => updateBudget("operatingReserveMonths", Number(value) as 3 | 6 | 9)} />
                </TerminalRow>
                <TerminalRow label="Непредвиденные расходы">
                  <SelectCell value={launchBudget.contingencyPercent} ariaLabel="Непредвиденные расходы" options={[5, 10, 15].map((value) => ({ value, label: `${value}%` }))} onChange={(value) => updateBudget("contingencyPercent", Number(value) as 5 | 10 | 15)} />
                </TerminalRow>
              </TerminalSection>
            </div>

            <aside className="terminal-results" aria-labelledby="terminal-results-title">
              <div className="terminal-results-heading">
                <p>Результаты</p>
                <h2 id="terminal-results-title">Экономика</h2>
              </div>
              <dl aria-live="polite">
                <div><dt>Стартовые инвестиции</dt><dd data-testid="terminal-start-investment" data-amount-rub={scenario.startInvestmentRub}>{formatMillion(scenario.startInvestmentRub)}</dd></div>
                <div><dt>Выручка</dt><dd>{formatMillion(scenario.salesPerMonthRub)}</dd></div>
                <div><dt>Операционные расходы</dt><dd>{formatMillion(operatingOpexRub)}</dd></div>
                <div className="is-total"><dt>EBITDA</dt><dd data-testid="terminal-ebitda-result">{formatMillion(scenario.ebitdaRub)}</dd></div>
                <div><dt>Денежный поток</dt><dd>{formatMillion(scenario.freeCashFlowRub)}</dd></div>
                <div><dt>Окупаемость</dt><dd>{paybackText(scenario.paybackMonth)}</dd></div>
                <div><dt>Доходность (IRR)</dt><dd>{formatPercent(scenario.irr)}</dd></div>
                <div><dt>Стоимость проекта (NPV)</dt><dd>{formatMillion(scenario.npvRub)}</dd></div>
              </dl>
              <button type="button" className="terminal-result-details-button" aria-expanded={investmentDetailsOpen} onClick={() => setInvestmentDetailsOpen((open) => !open)}>{investmentDetailsOpen ? "Скрыть состав инвестиций" : "Состав стартовых инвестиций"}</button>
              {investmentDetailsOpen ? <dl className="terminal-result-details" aria-label="Состав стартовых инвестиций">
                {scenario.investmentBreakdown.map((item) => <div key={item.key}><dt>{item.name}</dt><dd>{formatRub(item.amount_rub)}</dd></div>)}
              </dl> : null}
              <button type="button" className="terminal-result-details-button" aria-expanded={pnlDetailsOpen} onClick={() => setPnlDetailsOpen((open) => !open)}>{pnlDetailsOpen ? "Скрыть расходы" : "Подробные операционные расходы"}</button>
              {pnlDetailsOpen ? <dl className="terminal-result-details" aria-label="Подробные операционные расходы">
                <div><dt>Прямые затраты</dt><dd>{formatRub(scenario.pnl.productCostRub)}</dd></div>
                <div><dt>Персонал</dt><dd>{formatRub(scenario.pnl.personnelRub)}</dd></div>
                <div><dt>Помещение</dt><dd>{formatRub(scenario.pnl.premisesRub)}</dd></div>
                <div><dt>Эквайринг</dt><dd>{formatRub(scenario.pnl.acquiringRub)}</dd></div>
                <div><dt>Коммунальные услуги</dt><dd>{formatRub(scenario.pnl.utilitiesRub)}</dd></div>
                <div><dt>Маркетинг</dt><dd>{formatRub(scenario.pnl.marketingRub)}</dd></div>
                <div><dt>Хозяйственные расходы</dt><dd>{formatRub(scenario.pnl.householdRub)}</dd></div>
                <div><dt>Налог</dt><dd>{formatRub(scenario.pnl.taxRub)}</dd></div>
              </dl> : null}
              {!scenario.configurationComplete ? <p className="terminal-result-warning">Для расчёта заполните все обязательные параметры запуска.</p> : null}
              {configuration.customChecksPerDay !== null ? <p className="terminal-runtime-note">Поток изменён только в этом сценарии. Остальные значения остаются из выбранного базового сценария.</p> : null}
              <p className="terminal-full-model" aria-disabled="true">Полная финансовая модель — по запросу</p>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
