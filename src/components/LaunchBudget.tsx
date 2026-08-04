import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { capexData } from "../lib/capex-runtime";
import {
  calculateLaunchBudget,
  defaultLaunchBudgetState,
  launchModel,
  normalizeLaunchBudgetState,
  type EquipmentScenarioId,
  type FurnitureProfileId,
  type LaunchBudgetState,
  type PremisesScenario,
  type SeatingProfileId,
} from "../lib/launch-budget";
import "./LaunchBudget.css";

const rubFormatter = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });

function formatRub(value: number | null) {
  return value === null ? "Не рассчитано" : rubFormatter.format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Дата не указана";
  return dateFormatter.format(new Date(`${value}T00:00:00`));
}

function parseNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function Segmented({ label, value, options, onChange, dataName }: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string; hint?: string }>;
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

export function LaunchBudgetPage() {
  const rawModel = capexData.investorStartModel;
  const defaults = useMemo(() => defaultLaunchBudgetState(), []);
  const [state, setState] = useState<LaunchBudgetState>(() => {
    try {
      const saved = window.localStorage.getItem(launchModel.form.local_storage_key);
      return saved ? normalizeLaunchBudgetState(JSON.parse(saved)) : defaults;
    } catch {
      return defaults;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(launchModel.form.local_storage_key, JSON.stringify(state));
    } catch {
      // Local persistence is optional; canonical data is never changed.
    }
  }, [state]);

  const result = useMemo(() => calculateLaunchBudget(state), [state]);
  const seatingProfile = rawModel.seating.profiles.find(item => item.id === state.seatingProfileId)!;
  const furnitureProfile = rawModel.furniture.profiles.find(item => item.id === state.furnitureProfileId)!;
  const equipmentProfile = rawModel.equipment.scenarios.find(item => item.id === state.equipmentScenarioId)!;
  const equipmentPartial = result.equipment.unpricedCount > 0 || result.incompleteRequiredModules.length > 0;
  const basisDocuments = capexData.documents.filter(document => rawModel.documents_block.registry_document_ids.includes(document.id));

  function update<K extends keyof LaunchBudgetState>(key: K, value: LaunchBudgetState[K]) {
    setState(current => ({ ...current, [key]: value }));
  }

  function reset() {
    if (!window.confirm("Сбросить все введённые значения этого расчёта?")) return;
    window.localStorage.removeItem(launchModel.form.local_storage_key);
    setState(defaultLaunchBudgetState());
  }

  const activeMissing = [
    ...(state.preparationRub === null ? ["Инженерные работы, подготовка и ремонт помещения"] : []),
    "Проектирование и согласования",
    "Доставка оборудования",
    "Первоначальный запас сырья и упаковки",
    "Расходы запуска",
    ...(result.equipment.unpricedCount > 0 ? [`Позиции оборудования без цены — ${result.equipment.unpricedCount}`] : []),
    ...(result.equipment.quoteRequiredCount > 0 ? [`Коммерческие предложения по крупным позициям — ${result.equipment.quoteRequiredCount}`] : []),
    "Полный расчёт OPEX",
  ];

  return (
    <div className="launch-budget-page">
      <section className="launch-hero" aria-labelledby="launch-budget-title">
        <div className="section-inner launch-hero-inner">
          <div>
            <p className="launch-eyebrow"><span>Рабочая версия</span><span>Исследование · v{rawModel.document.version}</span></p>
            <h1 id="launch-budget-title">Расчёт стартового раунда инвестиций</h1>
            <p className="launch-subtitle">Первый совмещённый объект „Колобочной“: заготовочное производство, торговая точка и посадочный зал.</p>
          </div>
          <aside>
            <strong>Что показывает расчёт</strong>
            <p>Порядок финансирования при покупке или аренде помещения — по известным статьям, с операционным запасом и резервом.</p>
            <span>Не является полной финансовой моделью</span>
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
                <NumberField id="purchase-price" label="Стоимость помещения" suffix="₽" value={state.purchasePriceRub} onChange={value => update("purchasePriceRub", value)} required />
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
                options={rawModel.seating.profiles.map(profile => ({ value: profile.id, label: profile.label, hint: `${String(profile.square_metres_per_seat).replace(".", ",")} м² / место` }))}
                onChange={value => update("seatingProfileId", value as SeatingProfileId)}
              />
              <div className="launch-seat-result"><span>Предварительно</span><strong>{result.seatCount === null ? "Не рассчитано" : `${result.seatCount} мест`}</strong><p>{rawModel.seating.caveat}</p></div>
            </section>

            <section className="launch-card" aria-labelledby="launch-equipment-title">
              <SectionHeading number="03" title="Комплектация оборудования и мебель" text="Оборудование загружается из канонического CAPEX snapshot; мебель считается отдельно." />
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
                <a href="/capex-configurator">Открыть подробный CAPEX-конфигуратор ↗</a>
              </div>
              <p className="launch-double-count-note">Позиции CAPEX-05 не суммируются второй раз: на этой странице мебель учитывается только по рабочей ставке на посадочное место.</p>
            </section>

            <section className="launch-card" aria-labelledby="launch-preparation-title">
              <SectionHeading number="04" title="Подготовка объекта" text="Одна укрупнённая оценка без преждевременной инженерной детализации." />
              <NumberField id="preparation-cost" label="Подготовка помещения, инженерные работы и монтаж" suffix="₽" value={state.preparationRub} onChange={value => update("preparationRub", value)} hint={rawModel.preparation.hint} />
              {state.preparationRub === null ? <p className="launch-unknown">Не рассчитано — требуется обследование помещения</p> : null}
            </section>

            <section className="launch-card" aria-labelledby="launch-reserve-title">
              <SectionHeading number="05" title="Запас на запуск" text="Временный ручной ориентир до появления полной OPEX-модели." />
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
            <h2>Ориентировочная потребность в финансировании</h2>
            <strong className="launch-total-value">{result.financingRequirementRub === null ? "Не рассчитано" : `${result.partial ? "от " : ""}${formatRub(result.financingRequirementRub)}`}</strong>
            {result.areaInvalid ? <p className="launch-total-blocked">Исправьте распределение площади, чтобы продолжить расчёт.</p> : null}
            <dl className="launch-total-breakdown">
              <SummaryRow label="Вход в помещение" value={result.premisesEntryRub} />
              <SummaryRow label="Стоимость текущей комплектации оборудования" value={result.equipment.total} partial={equipmentPartial} />
              <SummaryRow label="Мебель посадочного зала" value={result.furnitureRub} />
              <SummaryRow label="Подготовка помещения и монтаж" value={state.preparationRub} />
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
                <li><span>Подготовка помещения</span><strong>{state.preparationRub === null ? "не рассчитана" : "рассчитана"}</strong></li>
                <li><span>Операционный запас</span><strong>{result.operatingReserveRub === null ? "не рассчитан" : "рассчитан"}</strong></li>
                <li><span>Обязательные модули</span><strong>{result.incompleteRequiredModules.length ? "не сформированы полностью" : "сформированы"}</strong></li>
              </ul>
              {result.incompleteRequiredModules.length ? <p>{result.incompleteRequiredModules.map(module => module.name).join(" · ")}</p> : null}
            </div>
            <p className="launch-warning">{rawModel.warning}</p>
          </aside>
        </div>
      </section>

      <section className="launch-lower-section">
        <div className="section-inner launch-lower-grid">
          <article className="launch-boundaries">
            <p className="launch-section-kicker">Границы версии 0.1</p>
            <h2>Пока не включено или требует уточнения</h2>
            <ul>{activeMissing.map(item => <li key={item}>{item}</li>)}</ul>
            {result.missing.length ? <details><summary>Почему итог остаётся частичным</summary><ul>{result.missing.map(item => <li key={item}>{item}</li>)}</ul></details> : null}
          </article>
          <article className="launch-basis">
            <p className="launch-section-kicker">Источники истины</p>
            <h2>Основания расчёта</h2>
            <div className="launch-document-list">
              {basisDocuments.map(document => <div key={document.id}><span><strong>{document.title}{document.version ? ` v${document.version}` : ""}</strong><small>{document.statusLabel} · {formatDate(document.updatedAt)}</small></span>{document.googleUrl ? <a href={document.googleUrl} target="_blank" rel="noopener noreferrer">Открыть ↗</a> : <em>Ссылка не создана</em>}</div>)}
            </div>
            <p>Расчётные данные имеют статус «Исследование». Snapshot SHA-256: <code>{rawModel.source_sha256.slice(0, 12)}…</code></p>
          </article>
        </div>
      </section>
    </div>
  );
}
