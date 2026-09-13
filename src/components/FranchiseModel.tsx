import { useEffect, useMemo, useState } from "react";
import {
  calculateFranchiseModel,
  franchisePoint,
} from "../lib/franchise-model-engine";
import {
  parameterStatus,
  reference,
  resetInput,
  setInput,
  workingScenario,
} from "../lib/franchise-model-scenario";
import {
  deleteScenario,
  duplicateScenario,
  loadStore,
  saveStore,
} from "../lib/franchise-model-storage";
import type {
  Line,
  Scenario,
  ScenarioStore,
  Parameter,
} from "../lib/franchise-model-types";
import { parameters, statusLabels, modelText, scenarioName } from "./franchise-model-language";
import "./FranchiseModel.css";
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const money = (n: number | null | undefined) =>
  n == null ? "Не рассчитано" : `${number.format(n)} ₽`;
const pct = (n: number | null | undefined) =>
  n == null ? "Не рассчитано" : `${number.format(n * 100)}%`;
const monthLabel = (n: number | null | undefined) =>
  n == null ? "Не рассчитано" : `М${n}`;
const tabs = [
  "Первый узел",
  "Собственная точка",
  "Франчайзинговая точка",
  "Головная компания",
  "Сеть",
  "Инвестор",
];
const validity = {
  COMPLETE: "Данные заполнены",
  PRELIMINARY: "Предварительная модель",
  INVALID: "Расчёт невозможен",
};
function Stat({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <article className="fm-stat">
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}
function Lines({ lines }: { lines: Line[] }) {
  return (
    <dl className="fm-lines">
      {lines.map((l, i) => (
        <div key={i}>
          <dt>{modelText(l.label)}</dt>
          <dd className={l.amount < 0 ? "fm-negative" : ""}>
            {money(l.amount)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Metrics({ items }: { items: [string, string][] }) {
  return (
    <dl className="fm-lines">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function MonthlyTables<T extends { month: number; validated: boolean }>({ rows, columns, captions, testId }: {
  rows: T[];
  columns: [string, (row: T) => string][];
  captions: [string, string];
  testId: string;
}) {
  return <div data-testid={testId}>
    {[columns.slice(0, 6), columns.slice(6)].map((group, index) =>
      <div className="fm-table-scroll fm-period-table" key={captions[index]}>
        <table>
          <caption>{captions[index]}</caption>
          <thead><tr><th>Месяц</th>{group.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.month} className={!row.validated ? "fm-invalid-row" : ""}>
            <th>М{row.month}</th>{group.map(([label, value]) => <td key={label}>{value(row)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>)}
  </div>;
}
function NumberField({
  label,
  value,
  onChange,
  unit = "",
  inherit = false,
  min = 0,
  max,
  reset,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  unit?: string;
  inherit?: boolean;
  min?: number;
  max?: number;
  reset?: () => void;
}) {
  return (
    <div className="fm-number">
      <input
        type="number"
        aria-label={label}
        value={value ?? ""}
        min={min}
        max={max}
        step="any"
        placeholder={inherit ? "Из сценария" : "Не задано"}
        onChange={(e) =>
          onChange(
            e.target.value === ""
              ? null
              : Number.isFinite(e.target.valueAsNumber)
                ? e.target.valueAsNumber
                : null,
          )
        }
      />
      {unit && <span>{unit}</span>}
      {reset && (
        <button
          type="button"
          className="fm-reset"
          title={`Сбросить: ${label}`}
          aria-label={`Сбросить: ${label}`}
          onClick={reset}
        >
          ↺
        </button>
      )}
    </div>
  );
}
function Field({
  p,
  s,
  update,
}: {
  p: Parameter;
  s: Scenario;
  update: (s: Scenario) => void;
}) {
  const value = s.inputs[p.id],
    status = parameterStatus(s, p.id),
    scale = p.kind === "percent" ? 100 : 1;
  const invalid =
    (value !== null && (value < p.min || (p.max !== null && value > p.max))) ||
    (value === null && p.required);
  const disabled =
    (p.id === "own_revenue" && s.inputs.own_mode === 1) ||
    (p.id === "own_checks" && s.inputs.own_mode === 0) ||
    (["actual_labor", "actual_rent", "actual_opex"].includes(p.id) &&
      s.inputs.actual_mode === 0) ||
    (p.id === "post_cap_share" && s.inputs.equity === 0);
  const apply = (n: number | null) => {
    let next = s;
    if (p.id === "actual_mode" && n === 1 && s.inputs.actual_mode === 0) {
      try {
        const f = franchisePoint(s);
        for (const k of ["labor", "rent", "opex"] as const)
          next = setInput(next, `actual_${k}`, f.actual[k]);
      } catch {
        /* Keep invalid inputs visible for correction. */
      }
    }
    update(setInput(next, p.id, n));
  };
  const options =
    p.kind === "mode"
      ? ["Выручка в день", "Чеки × средний чек"]
      : p.kind === "actualMode"
        ? ["По нормативам", "Вручную"]
        : p.kind === "fundingMode"
          ? ["Поэтапно", "Весь лимит в месяце 0"]
          : null;
  const actualKey = p.id.replace("actual_", "") as "labor" | "rent" | "opex";
  let shown = value;
  if (
    ["actual_labor", "actual_rent", "actual_opex"].includes(p.id) &&
    s.inputs.actual_mode === 0
  ) {
    try {
      shown = franchisePoint(s).actual[actualKey];
    } catch {
      shown = null;
    }
  }
  return (
    <div
      className={`fm-field ${invalid ? "fm-field-invalid" : ""}`}
      data-field={p.id}
    >
      <div className="fm-field-title">
        <label htmlFor={`fm-${p.id}`}>{p.label}</label>
        <span
          className={`fm-status fm-status-${status.toLowerCase()}`}
          title={`${s.edited.includes(p.id) ? "Изменено пользователем; рабочая гипотеза. " : ""}${p.source}`}
        >
          {disabled && p.id.startsWith("actual_")
            ? "Рассчитано"
            : statusLabels[status]}
        </span>
      </div>
      <fieldset disabled={disabled} aria-label={p.label}>
        {p.kind === "toggle" ? (
          <div className="fm-inline">
            <input
              id={`fm-${p.id}`}
              type="checkbox"
              checked={value === 1}
              onChange={(e) => apply(e.target.checked ? 1 : 0)}
            />
            <span>{value === 1 ? "Включено" : "Выключено"}</span>
            <button
              type="button"
              className="fm-reset"
              aria-label={`Сбросить: ${p.label}`}
              onClick={() => update(resetInput(s, p.id))}
            >
              ↺
            </button>
          </div>
        ) : options ? (
          <div className="fm-inline">
            <select
              id={`fm-${p.id}`}
              aria-label={p.label}
              value={value ?? 0}
              onChange={(e) => apply(Number(e.target.value))}
            >
              {options.map((v, i) => (
                <option key={v} value={i}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="fm-reset"
              aria-label={`Сбросить: ${p.label}`}
              onClick={() => update(resetInput(s, p.id))}
            >
              ↺
            </button>
          </div>
        ) : (
          <NumberField
            label={p.label}
            value={shown === null ? null : Number((shown * scale).toFixed(8))}
            onChange={(n) => apply(n === null ? null : n / scale)}
            unit={p.unit}
            min={p.min * scale}
            max={p.max === null ? undefined : p.max * scale}
            reset={() => update(resetInput(s, p.id))}
          />
        )}
      </fieldset>
      {p.presets.length > 0 && (
        <div className="fm-presets">
          {p.presets.map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={value === n}
              onClick={() => apply(n)}
            >
              {p.id === "share"
                ? `${Math.round(n * 100)}/${Math.round(100 - n * 100)}`
                : `${number.format(n * scale)} ${p.unit}`}
            </button>
          ))}
        </div>
      )}
      {status === "MISSING" && value !== null && (
        <button
          type="button"
          className="fm-accept"
          aria-label={`Принять рабочее значение: ${p.label}`}
          onClick={() => apply(value)}
        >
          Принять {number.format(value)} как гипотезу
        </button>
      )}
      {p.note && <small>{p.note}</small>}
      {invalid && (
        <small role="alert">
          {value === null
            ? "Введите значение."
            : `Допустимо ${p.min * scale}${p.max === null ? " и больше" : `–${p.max * scale}`}.`}
        </small>
      )}
    </div>
  );
}
function Group({
  title,
  groups,
  s,
  update,
}: {
  title: string;
  groups: string[];
  s: Scenario;
  update: (s: Scenario) => void;
}) {
  return (
    <section className="fm-panel">
      <h3>{title}</h3>
      <div className="fm-fields">
        {parameters
          .filter((p) => groups.includes(p.group))
          .map((p) => (
            <Field key={p.id} p={p} s={s} update={update} />
          ))}
      </div>
    </section>
  );
}
function Compare({
  store,
  onChange,
}: {
  store: ScenarioStore;
  onChange: (s: ScenarioStore) => void;
}) {
  const selected = store.scenarios.filter((s) =>
    store.compareIds.includes(s.id),
  );
  const models = selected.map((s) => calculateFranchiseModel(s));
  const rows: [
    string,
    (m: ReturnType<typeof calculateFranchiseModel>) => string,
  ][] = [
    ["Первоначальная потребность в капитале", (m) => money(m.result?.node.initialDraw)],
    ["Ежемесячные фиксированные расходы", (m) => money(m.result?.node.burn)],
    ["Выручка собственной точки / месяц", (m) => money(m.result?.own.sales)],
    ["Операционная прибыль франчайзи (EBITDA)", (m) => money(m.result?.franchise.ebitda)],
    [
      "Центральный расчётный поток на точку",
      (m) => money(m.result?.franchise.settlement),
    ],
    [
      "Свободный денежный поток (FCF) головной компании / М24",
      (m) => money(m.result?.months.find((x) => x.month === 24)?.fcf),
    ],
    ...[24, 36, 60].map(
      (n) =>
        [
          `Франчайзи в М${n}`,
          (m: ReturnType<typeof calculateFranchiseModel>) =>
            String(
              m.result?.months.find((x) => x.month === n)?.franchiseCount ??
                "Не рассчитано",
            ),
        ] as [
          string,
          (m: ReturnType<typeof calculateFranchiseModel>) => string,
        ],
    ),
    ["Возврат капитала инвестора", (m) => monthLabel(m.result?.investor.principalMonth)],
    ["Доходность инвестора (IRR)", (m) => pct(m.result?.investor.irr)],
    [
      "Мультипликатор возврата капитала (MOIC)",
      (m) =>
        m.result?.investor.moic == null
          ? "Не рассчитано"
          : `${number.format(m.result.investor.moic)}×`,
    ],
    ["Сохранено компанией", (m) => money(m.result?.investor.retained)],
  ];
  return (
    <details className="fm-panel fm-compare" data-testid="fm-compare">
      <summary>
        Сравнение сценариев <span>до 3</span>
      </summary>
      <div className="fm-compare-options">
        {store.scenarios.map((s) => (
          <label key={s.id}>
            <input
              type="checkbox"
              checked={store.compareIds.includes(s.id)}
              disabled={
                !store.compareIds.includes(s.id) && store.compareIds.length >= 3
              }
              onChange={(e) =>
                onChange({
                  ...store,
                  compareIds: e.target.checked
                    ? [...store.compareIds, s.id]
                    : store.compareIds.filter((id) => id !== s.id),
                })
              }
            />
            {scenarioName(s.name)}
          </label>
        ))}
      </div>
      <div className="fm-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              {selected.map((s) => (
                <th key={s.id}>{scenarioName(s.name)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Статус</th>
              {models.map((m, i) => (
                <td key={i}>{validity[m.status]}</td>
              ))}
            </tr>
            {rows.map(([label, fn]) => (
              <tr key={label}>
                <th>{label}</th>
                {models.map((m, i) => (
                  <td key={i}>{fn(m)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function RolloutEditor({
  s,
  update,
}: {
  s: Scenario;
  update: (s: Scenario) => void;
}) {
  const set = (id: string, patch: Partial<Scenario["rollout"][number]>) =>
    update({
      ...s,
      rollout: s.rollout.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  return (
    <section className="fm-panel">
      <h3>График открытия точек</h3>
      <p className="fm-note">
        Рабочая иллюстрация, не прогноз. Пустые индивидуальные значения
        наследуют параметры выбранного типа точки. Начальный профиль сразу
        достигает заданной выручки: постепенный выход на плановую выручку не заложен.
      </p>
      <div className="fm-table-scroll">
        <table className="fm-edit-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Тип</th>
              <th>Точка</th>
              <th>Выручка / день</th>
              <th>Средний чек</th>
              <th>Включена</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {s.rollout.map((p) => (
              <tr key={p.id}>
                <td>
                  <NumberField
                    label={`Месяц: ${p.name}`}
                    value={p.month}
                    min={1}
                    max={120}
                    onChange={(n) => set(p.id, { month: n ?? 0 })}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Тип: ${p.name}`}
                    value={p.type}
                    onChange={(e) =>
                      set(p.id, { type: e.target.value as "OWN" | "FRANCHISE" })
                    }
                  >
                    <option value="OWN">Собственная</option>
                    <option value="FRANCHISE">Франчайзи</option>
                  </select>
                </td>
                <td>
                  <input
                    aria-label={`Название: ${p.name}`}
                    value={p.name}
                    maxLength={100}
                    onChange={(e) => set(p.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <NumberField
                    label={`Выручка: ${p.name}`}
                    value={p.revenueDay}
                    inherit
                    onChange={(n) => set(p.id, { revenueDay: n })}
                    reset={() => set(p.id, { revenueDay: null })}
                  />
                </td>
                <td>
                  <NumberField
                    label={`Средний чек: ${p.name}`}
                    value={p.averageCheck}
                    min={0.01}
                    inherit
                    onChange={(n) => set(p.id, { averageCheck: n })}
                    reset={() => set(p.id, { averageCheck: null })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Включена: ${p.name}`}
                    checked={p.active}
                    onChange={(e) => set(p.id, { active: e.target.checked })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Удалить: ${p.name}`}
                    onClick={() =>
                      update({
                        ...s,
                        rollout: s.rollout.filter((x) => x.id !== p.id),
                      })
                    }
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fm-row-details">
        {s.rollout.map((p) => (
          <details key={p.id}>
            <summary>
              Экономика: {p.name}{" "}
              <span className="fm-status">Рабочая гипотеза</span>
            </summary>
            <div className="fm-fields">
              {(["days", "labor", "rent", "opex", "capex"] as const).map(
                (k, i) => (
                  <label key={k}>
                    {
                      [
                        "Рабочие дни",
                        "Фактический фонд оплаты труда",
                        "Фактическая аренда",
                        "Прочие операционные расходы точки",
                        "Инвестиции в открытие точки",
                      ][i]
                    }
                    <NumberField
                      label={`${["Рабочие дни", "Фактический фонд оплаты труда", "Фактическая аренда", "Прочие операционные расходы точки", "Инвестиции в открытие точки"][i]}: ${p.name}`}
                      value={p[k]}
                      inherit
                      unit={k === "days" ? "дн." : "₽"}
                      max={k === "days" ? 31 : undefined}
                      onChange={(n) => set(p.id, { [k]: n })}
                      reset={() => set(p.id, { [k]: null })}
                    />
                  </label>
                ),
              )}
            </div>
            <p className="fm-note">
              Инвестиции в первый узел уже включены в первоначальную потребность в капитале. Для дополнительных собственных точек нужны отдельные инвестиции; инвестиции франчайзи не списываются с головной компании.
            </p>
          </details>
        ))}
      </div>
      <button
        type="button"
        className="fm-add"
        disabled={s.rollout.length >= 120}
        onClick={() =>
          update({
            ...s,
            rollout: [
              ...s.rollout,
              {
                id: crypto.randomUUID(),
                month: 24,
                type: "FRANCHISE",
                name: `Новая точка ${s.rollout.length + 1}`,
                active: true,
                revenueDay: null,
                averageCheck: null,
                days: null,
                labor: null,
                rent: null,
                opex: null,
                capex: null,
              },
            ],
          })
        }
      >
        + Добавить точку
      </button>
    </section>
  );
}
function ExpansionEditor({
  s,
  update,
}: {
  s: Scenario;
  update: (s: Scenario) => void;
}) {
  return (
    <section className="fm-panel">
      <h3>Расширение производственной мощности</h3>
      <p className="fm-note">
        Новая мощность — общее число поддерживаемых точек. Ежемесячные расходы и полные ставки добавляются с месяца события; стоимость производства не подставляется автоматически.
      </p>
      <div className="fm-table-scroll">
        <table className="fm-edit-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Общая мощность</th>
              <th>Инвестиции</th>
              <th>Операционные расходы / месяц</th>
              <th>Добавить полных ставок</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.expansions.map((e, index) => (
              <tr key={e.id}>
                {(["month", "capacity", "capex", "opex", "fte"] as const).map(
                  (k) => (
                    <td key={k}>
                      <NumberField
                        label={`${{ month: "Месяц", capacity: "Общая мощность", capex: "Инвестиции", opex: "Операционные расходы в месяц", fte: "Добавить полных ставок" }[k]}: расширение ${index + 1}`}
                        value={e[k]}
                        min={k === "month" || k === "capacity" ? 1 : 0}
                        onChange={(n) =>
                          update({
                            ...s,
                            expansions: s.expansions.map((x) =>
                              x.id === e.id
                                ? {
                                    ...x,
                                    [k]:
                                      n === null &&
                                      ["month", "capacity"].includes(k)
                                        ? 0
                                        : n,
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                    </td>
                  ),
                )}
                <td>
                  <button
                    onClick={() =>
                      update({
                        ...s,
                        expansions: s.expansions.filter((x) => x.id !== e.id),
                      })
                    }
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!s.expansions.length && <p>Расширений пока нет.</p>}
      <button
        className="fm-add"
        disabled={s.expansions.length >= 120}
        onClick={() =>
          update({
            ...s,
            expansions: [
              ...s.expansions,
              {
                id: crypto.randomUUID(),
                month: 24,
                capacity: 10,
                capex: null,
                opex: null,
                fte: null,
              },
            ],
          })
        }
      >
        + Добавить расширение
      </button>
    </section>
  );
}
export function FranchiseModelPage() {
  const [loaded] = useState(() => loadStore(window.localStorage));
  const [store, setStore] = useState(loaded.store),
    [saveError, setSaveError] = useState(loaded.error),
    [tab, setTab] = useState(0),
    [viewMonth, setViewMonth] = useState(24);
  const changeStore = (next: ScenarioStore) => {
    setStore(next);
    setSaveError(saveStore(window.localStorage, next));
  };
  const s = store.scenarios.find((x) => x.id === store.activeId)!;
  const update = (next: Scenario) =>
    changeStore({
      ...store,
      scenarios: store.scenarios.map((x) => (x.id === s.id ? next : x)),
    });
  const model = useMemo(() => calculateFranchiseModel(s), [s]),
    r = model.result;
  const selected = r?.months.find(
    (m) => m.month === Math.min(viewMonth, s.inputs.horizon ?? 24),
  );
  const investorMonth = r?.investor.timeline.find(
    (m) => m.month === selected?.month,
  );
  const missing = model.issues.filter((i) => i.severity === "missing"),
    errors = model.issues.filter((i) => i.severity === "invalid");
  useEffect(() => {
    document.title = "Модель сети и франшизы — Управление · Колобочная";
  }, []);
  const group = (title: string, groups: string[]) => (
    <Group title={title} groups={groups} s={s} update={update} />
  );
  const hundred = r?.franchise.sales ? 100 / r.franchise.sales : 0;
  const flow = r
    ? ([
        ["ФОТ точки", r.franchise.normative.labor],
        ["Аренда", r.franchise.normative.rent],
        ["Прочие операционные расходы точки", r.franchise.normative.opex],
        ["Операционная прибыль франчайзи (EBITDA)", r.franchise.normative.ebitda],
        ["Центральный расчётный поток", r.franchise.settlement],
      ] as [string, number][])
    : [];
  return (
    <main className="fm-page" data-testid="franchise-model">
      <header className="fm-heading">
        <div>
          <p className="fm-eyebrow">УПРАВЛЕНИЕ / РАСЧЁТНЫЙ СТЕНД · ВЕРСИЯ 0.1</p>
          <h1>Модель сети и франшизы</h1>
          <p>
            От первого узла к франчайзи, головной компании и фактическому возврату
            капитала.
          </p>
        </div>
        <span
          className={`fm-validity fm-validity-${model.status.toLowerCase()}`}
        >
          {validity[model.status]}
          <small>Исследовательский рабочий сценарий</small>
        </span>
      </header>
      <section className="fm-scenario-bar" aria-label="Управление сценариями">
        <label>
          Рабочий сценарий
          <select
            aria-label="Текущий сценарий"
            value={s.id}
            onChange={(e) =>
              changeStore({ ...store, activeId: e.target.value })
            }
          >
            {store.scenarios.map((x) => (
              <option key={x.id} value={x.id}>
                {scenarioName(x.name)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Название
          <input
            aria-label="Название сценария"
            value={scenarioName(s.name)}
            maxLength={100}
            onChange={(e) => update({ ...s, name: e.target.value })}
          />
        </label>
        <div className="fm-actions">
          <button
            onClick={() =>
              changeStore(duplicateScenario(store, crypto.randomUUID()))
            }
            disabled={store.scenarios.length >= 30}
          >
            Дублировать
          </button>
          <button
            onClick={() =>
              update({
                ...workingScenario(),
                id: s.id,
                custom: s.custom,
                name: s.name,
              })
            }
          >
            Сбросить к рабочему сценарию
          </button>
          {s.custom && (
            <button onClick={() => changeStore(deleteScenario(store, s.id))}>
              Удалить сценарий
            </button>
          )}
        </div>
        <small>
          {saveError ??
            "Автосохранение в этом браузере · отдельное хранилище сценариев"}
        </small>
      </section>
      <section className="fm-dashboard" aria-label="Основные показатели">
        <Stat
          label="01 / Первоначальная потребность в капитале"
          value={money(r?.node.initialDraw)}
          note="Потребность первого узла, включая резерв"
          testId="fm-initial-draw"
        />
        <Stat
          label="02 / Ежемесячные фиксированные расходы"
          value={money(r?.node.burn)}
          note="Штат снизу вверх · фиксированные расходы"
          testId="fm-burn"
        />
        <Stat
          label="03 / Операционная прибыль франчайзи (EBITDA)"
          value={money(r?.franchise.ebitda)}
          note={`Факт ${pct(r?.franchise.margin)} / цель ${pct(s.inputs.target)}`}
          testId="fm-franchise-ebitda"
        />
        <Stat
          label="04 / Вклад зрелой франчайзинговой точки"
          value={money(r?.franchise.contribution)}
          note="До центральных фиксированных расходов · предварительная оценка"
          testId="fm-contribution"
        />
        <Stat
          label="05 / Возврат капитала инвестора"
          value={monthLabel(r?.investor.principalMonth)}
          note={
            r?.investor.completeInputs
              ? "По фактическим выборкам капитала и выплатам; может не достигаться в выбранном горизонте"
              : "Недостаточно данных для полного денежного потока"
          }
          testId="fm-principal"
        />
        <Stat
          label="06 / Доходность инвестора (IRR)"
          value={pct(r?.investor.irr)}
          note={`Рабочая цель ${pct(s.inputs.target_irr)} · фактические денежные потоки инвестора`}
          testId="fm-irr"
        />
      </section>
      <details
        className={`fm-notice ${errors.length ? "fm-notice-error" : ""}`}
        open={errors.length > 0}
      >
        <summary>
          {errors.length
            ? `Требуется исправить: ${errors.length}`
            : `Предварительная модель · параметров, требующих данных: ${missing.length}`}
        </summary>
        <ul>
          {model.issues.map((i, n) => (
            <li key={n}>
              <strong>{i.month !== undefined ? `М${i.month} · ` : ""}</strong>
              {modelText(i.message)}
            </li>
          ))}
        </ul>
      </details>
      <section className="fm-flow fm-panel">
        <div className="fm-section-heading">
          <div>
            <p className="fm-eyebrow">ДВИЖЕНИЕ ДЕНЕГ</p>
            <h2>100 ₽ чистой розничной выручки</h2>
            <p className="fm-note">Выручка вводится без косвенных налогов. Переход от валовой выручки к чистой модель не рассчитывает.</p>
          </div>
          <span>Нормативная экономика одной франшизы</span>
        </div>
        <div className="fm-flow-bar" aria-label="Распределение 100 рублей">
          {flow.map(([label, n], i) => (
            <div
              key={label}
              style={{ flexGrow: Math.max(0, n * hundred) }}
              className={`fm-flow-${i}`}
              title={`${label}: ${number.format(n * hundred)} ₽`}
            />
          ))}
        </div>
        <div className="fm-flow-labels">
          {flow.map(([label, n]) => (
            <div key={label}>
              <span>{label}</span>
              <strong className={n < 0 ? "fm-negative" : ""}>
                {number.format(n * hundred)} ₽
              </strong>
            </div>
          ))}
        </div>
        {r && (
          <div className="fm-flow-bridge">
            <div>
              <h3>Центральный расчётный поток</h3>
              <strong data-testid="fm-settlement">
                {pct(r.franchise.settlementRate)}
              </strong>
              <p>{money(r.franchise.settlement)} / месяц</p>
              <p>Часть розничной выручки, направляемая в центральный контур сети.</p>
              <small>
                100 − {number.format((s.inputs.norm_labor ?? 0) * 100)} −{" "}
                {number.format((s.inputs.norm_rent ?? 0) * 100)} −{" "}
                {number.format((s.inputs.norm_opex ?? 0) * 100)} −{" "}
                {number.format((s.inputs.target ?? 0) * 100)} ={" "}
                {number.format(r.franchise.settlement * hundred)} ₽
              </small>
            </div>
            <div>
              <h3>Центральные расходы / 100 ₽</h3>
              <Metrics
                items={[
                  [
                    "Сырьё и списания",
                    money(
                      (r.franchise.direct.raw + r.franchise.direct.waste) *
                        hundred,
                    ),
                  ],
                  ["Упаковка", money(r.franchise.direct.packaging * hundred)],
                  ["Логистика", money((s.inputs.delivery ?? 0) * hundred)],
                  ["Маркетинг сети", money(r.franchise.marketing * hundred)],
                  [
                    "Цифровая система и поддержка франчайзи",
                    money(
                      ((s.inputs.support ?? 0) +
                        (s.inputs.point_software ?? 0)) *
                        hundred,
                    ),
                  ],
                  [
                    "Доп. производство",
                    money((s.inputs.extra_production ?? 0) * hundred),
                  ],
                  [
                    "Вклад до центральных фиксированных расходов",
                    money(r.franchise.contribution * hundred),
                  ],
                ]}
              />
            </div>
            <div>
              <h3>Сеть → инвестор</h3>
              <p>
                Срез М{selected?.month}: производство, аренда, логистика и
                расходы головной компании списываются один раз на сеть.
              </p>
              <Metrics
                items={[
                  ["Центральные фиксированные расходы", money(selected?.fixed)],
                  [
                    "Вклад в денежный поток головной компании",
                    money(selected?.recurringContribution),
                  ],
                  ["Доступно для распределения", money(investorMonth?.distributable)],
                  ["Выплаты инвестору", money(investorMonth?.distributions)],
                  ["Средства, остающиеся на развитие", money(investorMonth?.retained)],
                ]}
              />
              <small>
                Потоки сети в ₽/месяц. Незаполненные расходы блокируют итоговое распределение денежных средств.
              </small>
            </div>
          </div>
        )}
        <p className="fm-legal">
          Центральный расчётный поток — внутреннее экономическое представление распределения выручки. Юридически платежи могут позднее быть разделены на поставки продукции, роялти, маркетинговые, технологические и другие платежи.
        </p>
      </section>
      <nav className="fm-tabs" role="tablist" aria-label="Разделы модели">
        {tabs.map((label, i) => (
          <button
            key={label}
            id={`fm-tab-${i}`}
            role="tab"
            aria-selected={tab === i}
            aria-controls={`fm-pane-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const next = (i + (e.key === "ArrowRight" ? 1 : 5)) % 6;
                setTab(next);
                document.getElementById(`fm-tab-${next}`)?.focus();
              }
            }}
            onClick={() => setTab(i)}
          >
            {String(i + 1).padStart(2, "0")} {label}
          </button>
        ))}
      </nav>
      <div
        role="tabpanel"
        id={`fm-pane-${tab}`}
        aria-labelledby={`fm-tab-${tab}`}
      >
        {tab === 0 && (
          <>
            <div className="fm-two-col">
              {group("Первый производственный узел", ["node"])}
              <div>
                {r && (
                  <section className="fm-panel">
                    <h3>Первоначальная потребность в капитале</h3>
                    <Lines lines={r.node.startup} />
                    <Stat label="Итого" value={money(r.node.initialDraw)} />
                    <p className="fm-note">
                      Разработка цифровой платформы и вычислительная инфраструктура включены отдельно. Депозит
                      заморожен; его возврат в горизонте не предполагается.
                      Предоплаченная аренда не платится повторно в первые
                      месяцы. Пополнение стартового запаса далее входит в
                      переменную себестоимость.
                    </p>
                  </section>
                )}
                {r && (
                  <section className="fm-panel">
                    <h3>Резерв = фиксированные расходы × месяцы</h3>
                    <Metrics
                      items={[
                        ["Ежемесячные фиксированные расходы", money(r.node.burn)],
                        ["Целевой резерв", money(r.node.reserve)],
                        [
                          "Текущая базовая модель · справочно",
                          money(reference.reserve),
                        ],
                        ["Разница", money(r.node.reserve - reference.reserve)],
                      ]}
                    />
                  </section>
                )}
              </div>
            </div>
            {group("Штат: покрытие смен и стоимость работодателя", ["staff"])}
            {r && (
              <section className="fm-panel">
                <h3>Количество полных ставок (FTE)</h3>
                <p>
                  Сотрудников на смене × часов в день × дней / продуктивных
                  часов на полную ставку × коэффициент покрытия.
                </p>
                <Metrics
                  items={[
                    ["Кассир", `${number.format(r.node.staff.cashier)} ставки`],
                    ["Повар", `${number.format(r.node.staff.cook)} ставки`],
                    ["Фонд оплаты труда собственной точки", money(r.node.staff.retail)],
                    ["Производство", money(r.node.staff.production)],
                    ["Менеджер / технолог", money(r.node.staff.manager)],
                  ]}
                />
              </section>
            )}
            {group("Фиксированные расходы", ["fixed"])}
            {r && (
              <section className="fm-panel">
                <h3>Ежемесячные фиксированные расходы: детализация</h3>
                <Lines lines={r.node.fixed} />
              </section>
            )}
          </>
        )}
        {tab === 1 && (
          <div className="fm-two-col">
            {group("Собственная эталонная точка", ["own"])}
            {r && (
              <section className="fm-panel">
                <h3>Отдельная экономика собственной точки</h3>
                <Metrics
                  items={[
                    ["Розничная выручка точки / месяц", money(r.own.sales)],
                    ["Выручка / день", money(r.own.revenueDay)],
                    ["Чеков / день", number.format(r.own.checksDay)],
                    ["Фонд оплаты труда собственной точки", money(r.own.labor)],
                    ["Распределённая аренда", money(r.own.rent)],
                    ["Прочие операционные расходы точки", money(r.own.opex)],
                    ["Центральные прямые затраты", money(r.own.direct.total)],
                    ["Операционная прибыль (EBITDA)", money(r.own.ebitda)],
                    ["Рентабельность по операционной прибыли (EBITDA)", pct(r.own.margin)],
                    [
                      "Операционный вклад до налогов и инвестиций",
                      money(r.own.cashContribution),
                    ],
                  ]}
                />
                <p className="fm-note">
                  Встроенной точке выделена управленческая доля аренды. При
                  консолидации эта доля убирается, а аренда узла оплачивается
                  один раз. Производственный штат остаётся в центральном
                  контуре. Свободный денежный поток (FCF) точки требует распределения налогов и инвестиций в поддержание активов; показан операционный вклад.
                </p>
                <p className="fm-note">
                  При отсутствии прочих операционных расходов известная часть операционной прибыли (EBITDA):{" "}
                  {money(r.own.knownEbitda)}. Итоговая операционная прибыль (EBITDA) не рассчитана.
                </p>
              </section>
            )}
          </div>
        )}
        {tab === 2 && (
          <div className="fm-two-col">
            {group("Франчайзи: нормативы и фактические расходы", ["franchise"])}
            {r && (
              <div>
                <section className="fm-panel">
                  <h3>Фактическая экономика оператора</h3>
                  <Metrics
                    items={[
                      ["Выручка / день", money(r.franchise.revenueDay)],
                      ["Выручка / месяц", money(r.franchise.sales)],
                      ["Чеков / день", number.format(r.franchise.checksDay)],
                      ["Целевая операционная прибыль (EBITDA)", money(r.franchise.normative.ebitda)],
                      ["Фактическая операционная прибыль (EBITDA)", money(r.franchise.ebitda)],
                      ["Фактическая рентабельность", pct(r.franchise.margin)],
                      [
                        "Аренда / выручка",
                        pct(
                          r.franchise.sales
                            ? r.franchise.actual.rent / r.franchise.sales
                            : null,
                        ),
                      ],
                      [
                        "Фонд оплаты труда / выручка",
                        pct(
                          r.franchise.sales
                            ? r.franchise.actual.labor / r.franchise.sales
                            : null,
                        ),
                      ],
                      [
                        "Прочие расходы / выручка",
                        pct(
                          r.franchise.sales
                            ? r.franchise.actual.opex / r.franchise.sales
                            : null,
                        ),
                      ],
                      [
                        "Центральный расчётный поток",
                        `${money(r.franchise.settlement)} / ${pct(r.franchise.settlementRate)}`,
                      ],
                      ["Состояние", r.franchise.health],
                      ["Инвестиции", money(r.franchise.capex)],
                      [
                        "Срок возврата инвестиций франчайзи",
                        r.franchise.payback === null
                          ? "Не рассчитано"
                          : `${number.format(r.franchise.payback)} мес.`,
                      ],
                    ]}
                  />
                  <p className="fm-note">
                    Возврат инвестиций по операционной прибыли (EBITDA) — простой управленческий ориентир до
                    налогов и финансирования.{" "}
                    {r.franchise.capex === null
                      ? "Для расчёта срока возврата инвестиций франчайзи необходимо определить инвестиции в открытие точки."
                      : ""}
                  </p>
                  <p className="fm-note">
                    Головная компания не компенсирует фактическое превышение локальных
                    нормативов. Внутренняя шкала: ≥15% — рабочая цель; 12–15% —
                    внимание; &lt;12% — риск. Это не гарантия доходности.
                  </p>
                </section>
                <section className="fm-panel">
                  <h3>Открытие франчайзи</h3>
                  <Metrics
                    items={[
                      ["Паушальный взнос до расходов", money(s.inputs.entry_fee)],
                      [
                        "Стоимость подключения и запуска франчайзи",
                        money(s.inputs.onboarding),
                      ],
                      [
                        "Чистый вклад открытия",
                        money(r.franchise.netOpening),
                      ],
                    ]}
                  />
                  <p>
                    Взнос не считается чистой прибылью до определения стоимости
                    открытия.
                  </p>
                </section>
              </div>
            )}
          </div>
        )}
        {tab === 3 && (
          <>
            {group("Прямые расходы и расходы сети головной компании", ["headco"])}
            {selected && (
              <div className="fm-two-col">
                <section className="fm-panel">
                  <h3>Головная компания / М{selected.month}</h3>
                  <Metrics
                    items={[
                      ["Совокупная розничная выручка сети", money(selected.sales)],
                      ["Денежные поступления головной компании", money(selected.cashInflow)],
                      [
                        "Вклад собственных точек до прямых затрат",
                        money(selected.ownContribution),
                      ],
                      ["Центральные расчётные потоки", money(selected.settlements)],
                      ["Валовые взносы открытия", money(selected.grossFees)],
                      ["Чистый вклад открытий", money(selected.netFees)],
                      [
                        "Регулярный операционный вклад до налогов и инвестиций",
                        money(selected.recurringContribution),
                      ],
                      ["Рентабельность к совокупной выручке сети", pct(selected.margin)],
                      ["Свободный денежный поток (FCF) головной компании", money(selected.fcf)],
                      ["Известная часть денежного потока", money(selected.knownFcf)],
                    ]}
                  />
                  <p className="fm-note">
                    Известная часть не является итоговым свободным денежным потоком (FCF) и не запускает распределение выплат инвестору. Регулярный операционный вклад исключает взносы открытия, налоги, инвестиции в поддержание активов и развитие.
                  </p>
                </section>
                <section className="fm-panel">
                  <h3>Расходы центрального контура</h3>
                  <Lines
                    lines={[
                      { label: "Сырьё", amount: selected.direct.raw },
                      { label: "Списания", amount: selected.direct.waste },
                      { label: "Упаковка", amount: selected.direct.packaging },
                      { label: "Логистика", amount: selected.delivery },
                      {
                        label: "Маркетинг сети",
                        amount: selected.marketing,
                      },
                      { label: "Поддержка франчайзи", amount: selected.support },
                      {
                        label: "Цифровая система точек",
                        amount: selected.pointSoftware,
                      },
                      {
                        label: "Доп. производство",
                        amount: selected.extraProduction,
                      },
                      { label: "Центральные фиксированные расходы", amount: selected.fixed },
                    ]}
                  />
                  <Metrics
                    items={[
                      [
                        "Фиксированные расходы на работающую точку",
                        money(selected.fixedPerPoint),
                      ],
                      ["Фиксированные расходы / выручка сети", pct(selected.fixedShare)],
                    ]}
                  />
                </section>
              </div>
            )}
          </>
        )}
        {tab === 4 && (
          <>
            {group("Горизонт и мощность", ["network"])}
            <RolloutEditor s={s} update={update} />
            <ExpansionEditor s={s} update={update} />
            {r && (
              <section className="fm-panel">
                <h3>Помесячная модель сети</h3>
                <p>
                  Мощность:{" "}
                  {r.capacityExceededMonth === null
                    ? "в пределах рабочей гипотезы"
                    : `Производственная мощность превышена / результаты не проверены с М${r.capacityExceededMonth}`}
                  .
                </p>
                <MonthlyTables rows={r.months} testId="fm-network-table"
                  captions={["Точки, выручка и денежный поток", "Расходы, мощность и проверка результатов"]}
                  columns={[
                    ["Собственных точек", m => String(m.ownCount)],
                    ["Франчайзинговых точек", m => String(m.franchiseCount)],
                    ["Всего точек", m => String(m.count)],
                    ["Совокупная розничная выручка сети", m => money(m.sales)],
                    ["Поступления головной компании", m => money(m.cashInflow)],
                    ["Свободный денежный поток (FCF) головной компании", m => money(m.fcf)],
                    ["Известная часть денежного потока", m => money(m.knownFcf)],
                    ["Мощность, точек", m => String(m.capacity)],
                    ["Загрузка мощности", m => pct(m.utilisation)],
                    ["Фиксированные расходы на точку", m => money(m.fixedPerPoint)],
                    ["Операционная прибыль франчайзи (EBITDA)", m => money(m.franchiseEbitda)],
                    ["Инвестиции в развитие", m => money(m.capex)],
                    ["Статус", m => m.validated ? "Предварительная модель" : "Не проверено"],
                  ]}/>

              </section>
            )}
          </>
        )}
        {tab === 5 && (
          <>
            {group("Капитал и схема распределения денежного потока", ["investor"])}
            <section className="fm-panel">
              <h3>Ручные запросы финансирования</h3>
              <p className="fm-note">
                Выборка капитала расходует оставшийся лимит финансирования. Автоматическое привлечение разрешено только для заданных инвестиций в развитие; непокрытые операционные убытки требуют ручного решения.
              </p>
              <div className="fm-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th>Сумма</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {s.capitalCalls.map((c, index) => (
                      <tr key={c.id}>
                        <td>
                          <NumberField
                            label={`Месяц запрос финансирования ${index + 1}`}
                            value={c.month}
                            max={120}
                            onChange={(n) =>
                              update({
                                ...s,
                                capitalCalls: s.capitalCalls.map((x) =>
                                  x.id === c.id ? { ...x, month: n ?? -1 } : x,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <NumberField
                            label={`Сумма запрос финансирования ${index + 1}`}
                            value={c.amount}
                            unit="₽"
                            onChange={(n) =>
                              update({
                                ...s,
                                capitalCalls: s.capitalCalls.map((x) =>
                                  x.id === c.id ? { ...x, amount: n } : x,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            onClick={() =>
                              update({
                                ...s,
                                capitalCalls: s.capitalCalls.filter(
                                  (x) => x.id !== c.id,
                                ),
                              })
                            }
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="fm-add"
                disabled={s.capitalCalls.length >= 120}
                onClick={() =>
                  update({
                    ...s,
                    capitalCalls: [
                      ...s.capitalCalls,
                      { id: crypto.randomUUID(), month: 12, amount: null },
                    ],
                  })
                }
              >
                + Добавить запрос финансирования
              </button>
            </section>
            {r && (
              <>
                <section className="fm-panel">
                  <h3>Инвестор: только денежные потоки новой модели</h3>
                  <Metrics
                    items={[
                      ["Лимит финансирования", money(s.inputs.commitment)],
                      [
                        "Фактически предоставленный капитал",
                        money(r.investor.totalDrawn),
                      ],
                      ["Неиспользованный лимит финансирования", money(r.investor.undrawn)],
                      ["Накопленные выплаты", money(r.investor.distributions)],
                      [
                        "Невозвращённый основной капитал",
                        money(r.investor.outstanding),
                      ],
                      [
                        "Месяц возврата основного капитала",
                        monthLabel(r.investor.principalMonth),
                      ],
                      ["Предельный объём выплат инвестору", money(r.investor.cap)],
                      [
                        "Месяц достижения предельного объёма выплат",
                        monthLabel(r.investor.capMonth),
                      ],
                      ["Доходность инвестора (IRR)", pct(r.investor.irr)],
                      [
                        "Мультипликатор возврата капитала (MOIC)",
                        r.investor.moic === null
                          ? "Не рассчитано"
                          : `${number.format(r.investor.moic)}×`,
                      ],
                      [
                        "Свободные денежные средства компании",
                        money(r.investor.retained),
                      ],
                      [
                        "Накопленный денежный поток, оставленный компании",
                        money(r.investor.retainedAllocations),
                      ],
                      ["Покрытие выплат инвестору", pct(r.investor.coverage)],
                    ]}
                  />
                  <p className="fm-note">
                    «Не рассчитано»: требуемые данные отсутствуют, результаты сети не проверены, показатель не достигнут в выбранном горизонте или уравнение доходности (IRR) не имеет единственного корня. При неполном свободном денежном потоке (FCF) возможные будущие автоматические выборки капитала ещё не определены. Месяц возврата основного капитала — первое покрытие накопленных выборок; новые выборки могут снова создать невозвращённый остаток. Свободные денежные средства компании исключают резерв и неизрасходованные средства инвестора; накопленный оставленный поток учитывает удержания до их использования на развитие. Доходность инвестора (IRR) учитывает только реальные потоки М0…М{s.inputs.horizon}, без
                    остаточной стоимости бизнеса.
                  </p>
                </section>
                <section className="fm-panel">
                  <h3>90/10 · 80/20 · 70/30</h3>
                  <div className="fm-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Распределение потока</th>
                          <th>Месяц возврата капитала</th>
                          <th>Месяц предельных выплат</th>
                          <th>Доходность инвестора (IRR)</th>
                          <th>Мультипликатор возврата капитала (MOIC)</th>
                          <th>Компания сохраняет</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0.9, 0.8, 0.7].map((share) => {
                          const i = calculateFranchiseModel(
                            setInput(s, "share", share),
                          ).result?.investor;
                          return (
                            <tr key={share}>
                              <th>
                                {Math.round(share * 100)}/
                                {Math.round(100 - share * 100)}
                              </th>
                              <td>{monthLabel(i?.principalMonth)}</td>
                              <td>{monthLabel(i?.capMonth)}</td>
                              <td>{pct(i?.irr)}</td>
                              <td>
                                {i?.moic == null
                                  ? "Не рассчитано"
                                  : `${number.format(i.moic)}×`}
                              </td>
                              <td>{money(i?.retained)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="fm-panel">
                  <h3>Остаток денежных средств и выплаты по месяцам</h3>
                  <MonthlyTables rows={r.investor.timeline} testId="fm-investor-table"
                    captions={["Выборки капитала и выплаты инвестору", "Резерв и денежный поток, доступный для распределения"]}
                    columns={[
                      ["Выборка капитала", m => money(m.draw)],
                      ["Из неё на развитие", m => money(m.growthDraw)],
                      ["Денежный поток инвестора", m => money(m.investorCf)],
                      ["Выплаты инвестору", m => money(m.distributions)],
                      ["Накопленные выплаты", m => money(m.cumulativeDistributions)],
                      ["Остаток денежных средств", m => money(m.cashBalance)],
                      ["Минимальный резерв", m => money(m.reserveFloor)],
                      ["Будущие инвестиции", m => money(m.futureCapexReserve)],
                      ["Восстановление резерва", m => money(m.reserveRestoration)],
                      ["Доступно для распределения", m => money(m.distributable)],
                      ["Остаётся компании", m => money(m.retained)],
                      ["Статус", m => !m.validated ? "Не проверено" : m.reserveBlocked ? "Восстановление резерва" : "Предварительная модель"],
                    ]}/>

                </section>
              </>
            )}
          </>
        )}
      </div>
      <section className="fm-slice fm-panel">
        <label>
          Месяц сводки головной компании и движения денег{" "}
          <input
            type="number"
            aria-label="Месяц сводки"
            value={viewMonth}
            min={1}
            max={s.inputs.horizon ?? 120}
            onChange={(e) =>
              setViewMonth(
                Math.max(
                  1,
                  Math.min(
                    s.inputs.horizon ?? 120,
                    Number(e.target.value) || 1,
                  ),
                ),
              )
            }
          />
        </label>
        <div className="fm-mini-stats">
          <Stat label="Совокупная розничная выручка сети" value={money(selected?.sales)} />
          <Stat
            label="Работающих точек"
            value={
              selected
                ? `${selected.ownCount} собств. + ${selected.franchiseCount} франш.`
                : "Не рассчитано"
            }
          />
          <Stat
            label="Мощность"
            value={
              selected ? `${selected.count} / ${selected.capacity}` : "Не рассчитано"
            }
          />
        </div>
      </section>
      <Compare store={store} onChange={changeStore} />
      <details className="fm-panel fm-reference">
        <summary>Ориентиры и границы допущений</summary>
        <h3>Текущая старая модель · только чтение</h3>
        <Metrics
          items={[
            ["Первоначальный капитал", money(reference.initialCapital)],
            ["Чеков / день", String(reference.checksDay)],
            ["Средний чек", money(reference.averageCheck)],
            ["Зрелая выручка / месяц", money(reference.revenueMonth)],
            ["Свободный денежный поток (FCF) зрелой модели", money(reference.fcf)],
            ["Возврат вложений по денежному потоку проекта", `М${reference.recoveryMonth}`],
            ["Минимальная доля фонда оплаты труда старой модели", pct(reference.laborFloor)],
          ]}
        />
        <p>
          <strong>
            Это возврат вложений по денежному потоку старой интегрированной модели, а не срок возврата капитала инвестору.
          </strong>
        </p>
        <p>
          27% — минимальная доля фонда оплаты труда, новая модель её не использует. Разработка цифровой платформы и вычислительная инфраструктура не входят в старые 40,02 млн ₽. Справочные показатели не синхронизируются с новой моделью.
        </p>
        <h3>Статусы</h3>
        <p>
          {Object.values(statusLabels)
            .join(" · ")}
        </p>
        <p>
          Любое пользовательское изменение — рабочая гипотеза. Явно введённый
          ноль допустим; исходный ноль со статусом «Требуются данные» остаётся неопределённым до вашего решения. Выручка задаётся без косвенных налогов; бухгалтерские обязательства и договорная структура не моделируются.
        </p>
        <p>
          Постоянные расходы удерживаются в центральном контуре. Новая
          производственная мощность, сезонность, постепенный выход на плановую выручку и подтверждённая будущая себестоимость не выводятся из исторической базовой модели.
        </p>
      </details>
    </main>
  );
}
